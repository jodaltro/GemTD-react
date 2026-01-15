
import { create } from 'zustand';
import { GRID_SIZE, CellType, GemType, GamePhase, START_POS, END_POS, GEM_COLORS, RECIPES, RANGE_SCALE, SPAWN_PROBABILITIES, QUALITY_ORDER, HP_BASE, HP_GROWTH_FACTOR, GET_WAVE_DATA, DAMAGE_MULTIPLIERS, DAMAGE_PENALTY, GEM_SPECIAL_EFFECTS, ARMOR_REDUCTION_FACTOR, NEGATIVE_ARMOR_FACTOR, STUN_COOLDOWN, STARTING_LIVES, STARTING_GOLD, GOLD_PER_KILL, GOLD_PER_WAVE, PRAY_COST_COLOR, PRAY_COST_QUALITY, BASE_STONE_COST, STONE_COST_INCREMENT, RESEARCH_COSTS, GemQuality } from '../constants';
import { GameState, GridCell, Enemy, StatusEffect, ActivePray, Projectile } from '../types';
import { isPathPossible, generateFlowField } from '../utils/pathfinding';
import { v4 as uuidv4 } from 'uuid';

// Helper to get random gem based on weights (Phase 2)
const getRandomGemType = (activePray: ActivePray | null): GemType => {
  const types = [
    GemType.DIAMOND, GemType.EMERALD, GemType.RUBY, 
    GemType.SAPPHIRE, GemType.AMETHYST, GemType.TOPAZ, 
    GemType.AQUAMARINE, GemType.OPAL
  ];

  if (activePray?.type === 'COLOR' && activePray.target) {
     if (Math.random() < 0.40) return activePray.target;
  }
  return types[Math.floor(Math.random() * types.length)];
};

const determineGemQuality = (level: number, activePray: ActivePray | null): GemQuality => {
    const bonus = (activePray?.type === 'QUALITY') ? 2 : 0;
    const effectiveLevel = Math.min(Math.max(level + bonus, 1), 7);
    const probs = SPAWN_PROBABILITIES[effectiveLevel];
    
    const rand = Math.random() * 100;
    let cumulative = 0;
    
    if (rand < (cumulative += probs[GemQuality.CHIPPED])) return GemQuality.CHIPPED;
    if (rand < (cumulative += probs[GemQuality.FLAWED])) return GemQuality.FLAWED;
    if (rand < (cumulative += probs[GemQuality.NORMAL])) return GemQuality.NORMAL;
    if (rand < (cumulative += probs[GemQuality.FLAWLESS])) return GemQuality.FLAWLESS;
    if (rand < (cumulative += probs[GemQuality.PERFECT])) return GemQuality.PERFECT;
    if (rand < (cumulative += probs[GemQuality.GREAT])) return GemQuality.GREAT;
    
    return GemQuality.CHIPPED; 
};

const NEXT_QUALITY: Record<GemQuality, GemQuality | null> = {
  [GemQuality.CHIPPED]: GemQuality.FLAWED,
  [GemQuality.FLAWED]: GemQuality.NORMAL,
  [GemQuality.NORMAL]: GemQuality.FLAWLESS,
  [GemQuality.FLAWLESS]: GemQuality.PERFECT,
  [GemQuality.PERFECT]: GemQuality.GREAT,
  [GemQuality.GREAT]: null,
  [GemQuality.SPECIAL]: null,
};

const calculateArmorDamageMultiplier = (armor: number): number => {
    if (armor >= 0) {
        return 1 - ((ARMOR_REDUCTION_FACTOR * armor) / (1 + ARMOR_REDUCTION_FACTOR * armor));
    } else {
        return 2 - Math.pow(NEGATIVE_ARMOR_FACTOR, -armor);
    }
};

export const useGameStore = create<GameState>((set, get) => ({
  grid: [],
  phase: GamePhase.BUILDING,
  placedGems: [],
  flowField: {},
  enemies: [],
  projectiles: [],
  wave: 1,
  playerLives: STARTING_LIVES,
  gold: STARTING_GOLD,
  researchLevel: 1,
  selectedCellId: null,
  lastEffect: null,
  activePray: null,
  stonesRemovedCount: 0,

  initializeGrid: () => {
    const newGrid: GridCell[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        newGrid.push({
          id: `${x}-${y}`,
          x,
          y,
          type: CellType.EMPTY, 
          isHovered: false,
          lastShot: 0,
          targetId: null
        });
      }
    }
    const flowField = generateFlowField(newGrid, END_POS);
    set({ 
      grid: newGrid, 
      phase: GamePhase.BUILDING,
      placedGems: [],
      flowField,
      enemies: [],
      projectiles: [],
      wave: 1,
      playerLives: STARTING_LIVES,
      gold: STARTING_GOLD,
      researchLevel: 1,
      selectedCellId: null,
      lastEffect: null,
      activePray: null,
      stonesRemovedCount: 0
    });
  },

  selectCell: (id) => set({ selectedCellId: id }),

  // Phase 3: Build Phase Logic
  handleCellClick: (x, y) => {
    const state = get();
    const cellIndex = state.grid.findIndex(c => c.x === x && c.y === y);
    if (cellIndex === -1) return;
    const cell = state.grid[cellIndex];

    if (state.phase === GamePhase.BUILDING) {
      if (cell.type !== CellType.EMPTY) {
        set({ selectedCellId: cell.id });
        return;
      }
      
      if ((x === START_POS.x && y === START_POS.y) || (x === END_POS.x && y === END_POS.y)) return;

      // Validate blocking path
      const simulatedGrid = [...state.grid];
      simulatedGrid[cellIndex] = { ...cell, type: CellType.TOWER };
      if (!isPathPossible(simulatedGrid, START_POS, END_POS)) {
          // Visual feedback for blocked path?
          return;
      }

      // Spawn 1 gem and update placedGems list
      const gemType = getRandomGemType(state.activePray);
      const quality = determineGemQuality(state.researchLevel, state.activePray);

      const newGrid = [...state.grid];
      newGrid[cellIndex] = { 
        ...cell, 
        type: CellType.TOWER, 
        gemType, 
        quality,
        placedAt: Date.now() 
      };

      const newPlacedGems = [...state.placedGems, cell.id];
      let newPhase: GamePhase = state.phase;

      // If we have placed 5 gems, switch to SELECTING
      if (newPlacedGems.length >= 5) {
        newPhase = GamePhase.SELECTING;
      }

      set({
        grid: newGrid,
        placedGems: newPlacedGems,
        phase: newPhase,
        flowField: generateFlowField(newGrid, END_POS), // Update flow field immediately for Ground units
        selectedCellId: null,
        lastEffect: {
          id: uuidv4(),
          type: 'SPAWN',
          x,
          y,
          color: GEM_COLORS[gemType]
        }
      });
    }
    else if (state.phase === GamePhase.SELECTING) {
      if (state.placedGems.includes(cell.id)) {
        set({ selectedCellId: cell.id });
      } else {
        set({ selectedCellId: null });
      }
    } else {
        set({ selectedCellId: cell.type === CellType.TOWER || cell.type === CellType.ROCK ? cell.id : null });
    }
  },

  // Phase 3: Selection Logic (Keep one, others become rocks)
  confirmKeepGem: () => {
    const state = get();
    const selectedId = state.selectedCellId;
    
    if (!selectedId || state.phase !== GamePhase.SELECTING || !state.placedGems.includes(selectedId)) return;

    const selectedCell = state.grid.find(c => c.id === selectedId);
    if (!selectedCell || !selectedCell.gemType) return;

    const newGrid = state.grid.map(c => {
      if (c.id === selectedId) return c; // Keep
      if (state.placedGems.includes(c.id)) {
        // Convert others to rock
        return { ...c, type: CellType.ROCK, gemType: undefined, quality: undefined, targetId: null };
      }
      return c;
    });

    set({
      grid: newGrid,
      placedGems: [],
      phase: GamePhase.READY,
      flowField: generateFlowField(newGrid, END_POS),
      selectedCellId: null,
      lastEffect: {
        id: uuidv4(),
        type: 'CONFIRM',
        x: selectedCell.x,
        y: selectedCell.y,
        color: GEM_COLORS[selectedCell.gemType]
      },
      activePray: null
    });
  },

  combineGems: (cellId) => {
    const state = get();
    const cell = state.grid.find(c => c.id === cellId);
    if (!cell || !cell.gemType || !cell.quality) return;

    const sameGems = state.grid.filter(c => 
        c.type === CellType.TOWER && 
        c.gemType === cell.gemType && 
        c.quality === cell.quality &&
        c.id !== cell.id
    );

    if (sameGems.length < 2) return;
    const toRemove = sameGems.slice(0, 2).map(g => g.id);
    const nextQual = NEXT_QUALITY[cell.quality] || cell.quality;

    const newGrid = state.grid.map(c => {
        if (c.id === cellId) return { ...c, quality: nextQual, placedAt: Date.now() };
        if (toRemove.includes(c.id)) return { ...c, type: CellType.ROCK, gemType: undefined, quality: undefined, targetId: null };
        return c;
    });

    set({
        grid: newGrid,
        lastEffect: {
            id: uuidv4(),
            type: 'UPGRADE',
            x: cell.x,
            y: cell.y,
            color: GEM_COLORS[cell.gemType]
        }
    });
  },

  combineSpecialGem: (recipeResult, centerCellId) => {
    const state = get();
    const recipe = RECIPES.find(r => r.result === recipeResult);
    if (!recipe) return;

    const centerCell = state.grid.find(c => c.id === centerCellId);
    if (!centerCell) return;

    const idsToRemove: string[] = [];
    let ingredientsNeeded = [...recipe.ingredients];

    const centerReqIndex = ingredientsNeeded.findIndex(req => req.type === centerCell.gemType && req.quality === centerCell.quality);
    if (centerReqIndex !== -1) {
        ingredientsNeeded.splice(centerReqIndex, 1);
    } else {
        return; 
    }

    for (const req of ingredientsNeeded) {
        const match = state.grid.find(c => 
            c.type === CellType.TOWER && 
            c.gemType === req.type && 
            c.quality === req.quality &&
            c.id !== centerCellId &&
            !idsToRemove.includes(c.id)
        );
        if (match) {
            idsToRemove.push(match.id);
        } else {
            return; 
        }
    }
    
    const newGrid = state.grid.map(c => {
        if (c.id === centerCellId) {
            return { 
                ...c, 
                gemType: recipeResult, 
                quality: GemQuality.SPECIAL, 
                placedAt: Date.now(),
                killCount: 0,
                targetId: null
            };
        }
        if (idsToRemove.includes(c.id)) {
            return { ...c, type: CellType.ROCK, gemType: undefined, quality: undefined, targetId: null };
        }
        return c;
    });

    if (recipeResult === GemType.BLACK_OPAL) {
        const range = 143 * RANGE_SCALE * 2.5; 
        const center = newGrid.find(c => c.id === centerCellId)!;
        for (let i = 0; i < newGrid.length; i++) {
            const t = newGrid[i];
            if (t.type === CellType.TOWER && t.id !== centerCellId) {
                const dist = Math.sqrt(Math.pow(t.x - center.x, 2) + Math.pow(t.y - center.y, 2));
                if (dist <= range) {
                    newGrid[i] = { ...t, damageMultiplier: (t.damageMultiplier || 1) + 0.4 };
                }
            }
        }
    }

    set({
        grid: newGrid,
        lastEffect: {
            id: uuidv4(),
            type: 'UPGRADE',
            x: centerCell.x,
            y: centerCell.y,
            color: GEM_COLORS[recipeResult]
        }
    });
  },

  downgradeGem: (cellId) => {
      const state = get();
      const cell = state.grid.find(c => c.id === cellId);
      if (!cell || !cell.quality || cell.quality === GemQuality.CHIPPED || cell.quality === GemQuality.SPECIAL) return;

      const currentIndex = QUALITY_ORDER.indexOf(cell.quality);
      if (currentIndex <= 0) return;

      const prevQuality = QUALITY_ORDER[currentIndex - 1];
      const newGrid = state.grid.map(c => {
          if (c.id === cellId) {
              return { ...c, quality: prevQuality, placedAt: Date.now() };
          }
          return c;
      });

      set({
          grid: newGrid,
          lastEffect: {
            id: uuidv4(),
            type: 'DOWNGRADE',
            x: cell.x,
            y: cell.y,
            color: GEM_COLORS[cell.gemType!]
          }
      });
  },

  upgradeResearch: () => {
      const state = get();
      if (state.researchLevel >= 7) return;
      
      const cost = RESEARCH_COSTS[state.researchLevel];
      if (state.gold >= cost) {
          set({ 
              gold: state.gold - cost,
              researchLevel: state.researchLevel + 1 
          });
      }
  },

  togglePray: (type, target) => {
      const state = get();
      if (state.activePray?.type === type && state.activePray?.target === target) {
          set({ activePray: null });
          return;
      }
      const cost = type === 'COLOR' ? PRAY_COST_COLOR : PRAY_COST_QUALITY;
      if (state.gold >= cost) {
          set({ 
              activePray: { type, target },
              gold: state.gold - cost
          });
      }
  },

  hoverCell: (x, y) => {
    set((state) => {
      const currentHovered = state.grid.find(c => c.isHovered);
      if (currentHovered && currentHovered.x === x && currentHovered.y === y) return state;
      return {
        grid: state.grid.map((cell) => ({
          ...cell,
          isHovered: cell.x === x && cell.y === y,
        })),
      };
    });
  },

  startWave: () => {
    set({ phase: GamePhase.DEFENDING, selectedCellId: null });
  },

  // Phase 4: Enemy Spawning
  spawnEnemy: () => {
    const state = get();
    const waveData = GET_WAVE_DATA(state.wave);
    
    const rawHp = HP_BASE * Math.pow(HP_GROWTH_FACTOR, state.wave - 1);
    
    const isBoss = waveData.abilities.includes('Boss');
    const isFast = waveData.abilities.includes('Fast');
    const isFlying = waveData.abilities.includes('Flying');
    const hasHighArmor = waveData.abilities.includes('High Armor');
    const isImmune = waveData.abilities.includes('Magic Immune');
    
    const finalHp = isBoss ? rawHp * 5 : rawHp;
    const speed = isFast ? (2.0 + (state.wave * 0.1)) * 1.5 : (2.0 + (state.wave * 0.1));
    const armor = hasHighArmor ? 10 + Math.floor(state.wave / 2) : Math.floor(state.wave / 4);

    const id = `enemy-${Date.now()}-${Math.random()}`;
    const newEnemy: Enemy = {
      id,
      x: START_POS.x,
      y: START_POS.y,
      hp: Math.floor(finalHp),
      maxHp: Math.floor(finalHp),
      baseSpeed: speed,
      speed: speed,
      baseArmor: armor,
      armor: armor,
      distanceTraveled: 0,
      weakness: waveData.weakness,
      isBoss,
      isFast,
      isFlying,
      isImmune,
      isInvisible: waveData.abilities.includes('Invisible'),
      effects: []
    };
    
    set({ enemies: [...state.enemies, newEnemy] });
  },

  spawnProjectile: (projectile) => {
      set((state) => ({ projectiles: [...state.projectiles, projectile] }));
  },

  removeProjectile: (id) => {
      set((state) => ({ projectiles: state.projectiles.filter(p => p.id !== id) }));
  },

  updateTowerCooldown: (cellId, time) => {
      set((state) => ({
          grid: state.grid.map(c => c.id === cellId ? { ...c, lastShot: time } : c)
      }));
  },

  updateTowerTarget: (cellId, targetId) => {
      set((state) => ({
          grid: state.grid.map(c => c.id === cellId ? { ...c, targetId } : c)
      }));
  },

  // Phase 4: Damage Pipeline
  damageEnemy: (id, damage, attackType, isSplash = false) => {
    set((state) => {
      const enemy = state.enemies.find(e => e.id === id);
      if (!enemy || enemy.isDead) return state; // Ignore if already dead/missing

      // Type Multiplier
      let typeMultiplier = DAMAGE_PENALTY; 
      if (enemy.weakness === attackType) {
          typeMultiplier = DAMAGE_MULTIPLIERS[attackType] || 1.0;
      }
      if ((attackType === GemType.OPAL && enemy.weakness === GemType.AQUAMARINE) ||
          (attackType === GemType.AQUAMARINE && enemy.weakness === GemType.OPAL)) {
          typeMultiplier = 1.9;
      }

      // Armor Calc
      const armorShred = enemy.effects
        .filter(e => e.type === 'ARMOR_SHRED')
        .reduce((sum, e) => sum + e.value, 0);
      
      const effectiveArmor = enemy.baseArmor - armorShred;
      const armorMultiplier = calculateArmorDamageMultiplier(effectiveArmor);

      const finalDamage = damage * typeMultiplier * armorMultiplier;

      // Status Effects (Only apply if NOT splash to avoid AOE stun cheese, or allow it?)
      let newEffects = [...enemy.effects];
      if (!enemy.isImmune) {
          const special = GEM_SPECIAL_EFFECTS[attackType];
          
          if (special) {
              if (special.type === 'STUN') {
                  const now = Date.now();
                  const isImmune = enemy.immuneToStunUntil && enemy.immuneToStunUntil > now;
                  if (!isImmune && Math.random() < special.chance) {
                      const stunEnd = now + (special.duration * 1000);
                      enemy.immuneToStunUntil = stunEnd + (STUN_COOLDOWN * 1000);
                      enemy.stunnedUntil = stunEnd;
                  }
              } 
              else if (special.type === 'SLOW' || special.type === 'ARMOR_SHRED' || special.type === 'POISON') {
                  const existingIdx = newEffects.findIndex(e => e.sourceId === attackType && e.type === special.type);
                  if (existingIdx >= 0) {
                      newEffects[existingIdx] = { ...newEffects[existingIdx], duration: special.duration };
                  } else {
                      newEffects.push({
                          sourceId: attackType,
                          type: special.type,
                          value: special.value,
                          duration: special.duration
                      });
                  }
              }
          }
      }

      const newHp = enemy.hp - finalDamage;

      // Create a HIT visual effect for particle system
      let effectUpdate = {};
      if (!isSplash) { 
          effectUpdate = {
              lastEffect: {
                  id: uuidv4(),
                  type: 'HIT',
                  x: enemy.x, 
                  y: enemy.y, 
                  color: GEM_COLORS[attackType]
              }
          }
      }

      if (newHp <= 0) {
          // Trigger Death
          return {
              ...effectUpdate, // Include the final HIT effect (small spark)
              enemies: state.enemies.map(e => {
                  if (e.id === id) {
                      return {
                          ...e,
                          hp: 0,
                          isDead: true,
                          deathTime: Date.now()
                      };
                  }
                  return e;
              }),
              gold: state.gold + GOLD_PER_KILL,
              grid: state.grid.map(c => c.targetId === id ? { ...c, targetId: null } : c)
          };
      }

      return { 
          ...effectUpdate,
          enemies: state.enemies.map(e => {
              if (e.id === id) {
                  return { 
                      ...e, 
                      hp: newHp, 
                      effects: newEffects,
                      armor: effectiveArmor, 
                      stunnedUntil: enemy.stunnedUntil,
                      immuneToStunUntil: enemy.immuneToStunUntil
                  };
              }
              return e;
          }) 
      };
    });
  },

  removeEnemy: (id) => {
    set((state) => {
      const newEnemies = state.enemies.filter(e => e.id !== id);
      return { 
          enemies: newEnemies,
          grid: state.grid.map(c => c.targetId === id ? { ...c, targetId: null } : c)
      };
    });
  },

  damagePlayer: (amount) => {
    set((state) => {
      const newLives = state.playerLives - amount;
      return { playerLives: Math.max(0, newLives) };
    });
  },

  completeWave: () => {
    set((state) => ({
      phase: GamePhase.BUILDING,
      wave: state.wave + 1,
      gold: state.gold + GOLD_PER_WAVE,
      // Clear all targets
      grid: state.grid.map(c => ({ ...c, targetId: null }))
    }));
  },

  // --- ECONOMIC ACTIONS ---
  removeStone: (cellId) => {
    const state = get();
    const cell = state.grid.find(c => c.id === cellId);
    
    // Safety checks
    if (!cell || cell.type !== CellType.ROCK) return;

    // Calculate cost
    const cost = BASE_STONE_COST + (state.stonesRemovedCount * STONE_COST_INCREMENT);

    if (state.gold >= cost) {
        // Update Grid
        const newGrid = state.grid.map(c => 
            c.id === cellId ? { ...c, type: CellType.EMPTY, gemType: undefined, quality: undefined } : c
        );

        // Update FlowField immediately
        const newFlowField = generateFlowField(newGrid, END_POS);

        set({
            grid: newGrid,
            gold: state.gold - cost,
            stonesRemovedCount: state.stonesRemovedCount + 1,
            flowField: newFlowField,
            selectedCellId: null, // Deselect
            lastEffect: {
                id: uuidv4(),
                type: 'SPAWN', // Reuse spawn effect for "poof" logic, ideally create a 'DESTROY' effect
                x: cell.x,
                y: cell.y,
                color: '#888888' // Grey smoke
            }
        });
    }
  },

  addGold: (amount, x, y) => {
      set((state) => ({
          gold: state.gold + amount,
          lastEffect: x !== undefined && y !== undefined ? {
              id: uuidv4(),
              type: 'GOLD',
              x,
              y,
              color: '#FFD700'
          } : state.lastEffect
      }));
  }

}));
