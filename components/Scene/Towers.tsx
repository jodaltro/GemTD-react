import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../../store/useGameStore';
import {
  CellType, GEM_STATS, RANGE_SCALE, GEM_COLORS,
  GREEDY_CHANCE, GREEDY_BONUS_BASE, CRIT_CHANCE,
  GemType, GemQuality, PEDESTAL_HEIGHT,
} from '../../constants';
import { ENEMY_GROUND_Y, ENEMY_FLYING_Y } from './projectiles/ProjectileEngine';
import { ORB_TYPES, CLUSTER_TYPES, SNAKE_TYPES } from './towers/shared/gemConfig';
import { Enemy } from '../../types';

// ── P0: Multi-attack gems (Topaz / Ruby Great / Malachite) ──────────────────
const getMultiTargetCount = (gemType: GemType, stats: { special: string; specialValue?: number }): number => {
  const s = stats.special || '';
  if (gemType === GemType.TOPAZ) {
    const m = s.match(/(\d+)\s*Targets?/);
    if (m) return Math.min(parseInt(m[1], 10), 8);
  }
  if (s.includes('Multi-Shot')) {
    const m = s.match(/\((\d+)\)/);
    if (m) return parseInt(m[1], 10);
  }
  if (s.includes('Multi-Poison')) return 3;
  return 1;
};

const isCritGem = (gemType: GemType) => gemType === GemType.DIAMOND || gemType === GemType.PINK_DIAMOND;

// Phase 4: Combat Loop - Tower Logic
export const Towers: React.FC = () => {
  const grid = useGameStore((state) => state.grid);
  const enemies = useGameStore((state) => state.enemies);
  const wave = useGameStore((state) => state.wave);
  const spawnProjectile = useGameStore((state) => state.spawnProjectile);
  const updateTowerCooldown = useGameStore((state) => state.updateTowerCooldown);
  const updateTowerTarget = useGameStore((state) => state.updateTowerTarget);
  const addGold = useGameStore((state) => state.addGold);

  const towers = React.useMemo(() => grid.filter(c => c.type === CellType.TOWER && c.gemType && c.quality), [grid]);

  // ── P0: Opal attack-speed aura → per-tower cooldown multiplier ─────────────
  const cooldownMult = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of towers) map[t.id] = 1;

    for (const opal of towers) {
      if (opal.gemType !== GemType.OPAL) continue;
      const typeStats = GEM_STATS[opal.gemType];
      const stats = typeStats[opal.quality!] || typeStats[GemQuality.SPECIAL];
      if (!stats || !stats.specialValue) continue;
      const auraR = (stats.range / RANGE_SCALE) * 0.035; // overrides own attack range as aura radius
      for (const t of towers) {
        const d = Math.hypot(t.x - opal.x, t.y - opal.y);
        if (d <= auraR && (map[t.id] ?? 1) > 0.35) {
          map[t.id] = Math.max(0.35, (map[t.id] ?? 1) * (1 - stats.specialValue / 100));
        }
      }
    }
    return map;
  }, [towers]);
  const cooldownMultRef = useRef(cooldownMult);
  cooldownMultRef.current = cooldownMult;

  // Use a ref to track the R3F clock time accessibly within callbacks
  const clockRef = useRef(0);

  useFrame((state) => {
    clockRef.current = state.clock.getElapsedTime();
    const now = Date.now();

    towers.forEach(tower => {
        if (!tower.gemType || !tower.quality) return;

        const typeStats = GEM_STATS[tower.gemType];
        const stats = typeStats[tower.quality] || typeStats['Special'];
        if (!stats) return;

        const effectiveCooldown = stats.cooldown * (cooldownMultRef.current[tower.id] ?? 1);

        // ── Target acquisition (primary) ────────────────────────────────────
        let primary: Enemy | null = null;
        let minDist = Infinity;
        const range = stats.range;
        const rangeCells = (range / RANGE_SCALE) * 0.035;

        if (tower.targetId) {
            const currentTarget = enemies.find(e => e.id === tower.targetId);
            if (currentTarget && !currentTarget.isDead && !currentTarget.isInvisible) {
                 const dist = Math.hypot(tower.x - currentTarget.x, tower.y - currentTarget.y);
                 if (dist <= rangeCells) primary = currentTarget;
            }
        }

        if (!primary) {
            for (const enemy of enemies) {
                if (enemy.isInvisible || enemy.isDead) continue;
                const dist = Math.hypot(tower.x - enemy.x, tower.y - enemy.y);
                if (dist <= rangeCells && dist < minDist) {
                    minDist = dist;
                    primary = enemy;
                }
            }
        }

        const currentTargetId = primary ? primary.id : null;
        if (tower.targetId !== currentTargetId) {
            updateTowerTarget(tower.id, currentTargetId);
        }

        // ── P0: Multi-shot → choose up to N distinct targets ────────────────
        let targets: Enemy[] = [];
        if (primary) {
            targets.push(primary);
            const multi = getMultiTargetCount(tower.gemType, stats);
            if (multi > 1) {
                const inRange = enemies
                    .filter(e => e !== primary && !e.isDead && !e.isInvisible)
                    .map(e => ({ e, d: Math.hypot(tower.x - e.x, tower.y - e.y) }))
                    .filter(x => x.d <= rangeCells)
                    .sort((a, b) => a.d - b.d);
                for (const { e } of inRange) {
                    if (targets.length >= multi) break;
                    if (!targets.includes(e)) targets.push(e);
                }
            }
        }

        // ── Fire Logic (per target) ─────────────────────────────────────────
        if (targets.length > 0 && (!tower.lastShot || now >= tower.lastShot + effectiveCooldown)) {
            const multiplier = tower.damageMultiplier || 1;
            const killMult = tower.gemType === GemType.STAR_RUBY ? (1 + (tower.killCount || 0) * 0.05) : 1;

            // Splash config (Red Crystal excluded from splash pool; explicit 'Splash'/'Area'/'Bombardment')
            const specialStr = stats.special || '';
            const isSplash = specialStr.includes('Splash') || specialStr.includes('Area') || specialStr.includes('Bombardment');
            const splashRadius = specialStr.includes('Area') ? 2.5 : (specialStr.includes('Bombardment') ? 3.0 : 1.5);

            updateTowerCooldown(tower.id, now);

            // Archetype timing
            const isOrb = ORB_TYPES.includes(tower.gemType);
            const isCluster = CLUSTER_TYPES.includes(tower.gemType);
            const isSnake = SNAKE_TYPES.includes(tower.gemType);
            const impactDelay = isSnake ? 90 : (isOrb ? 50 : (isCluster ? 120 : 200));

            const baseDamage = stats.minDmg + Math.random() * (stats.maxDmg - stats.minDmg);
            const rollCrit = isCritGem(tower.gemType) && Math.random() < CRIT_CHANCE;
            const critMult = rollCrit
                ? (stats.specialValue || (tower.gemType === GemType.PINK_DIAMOND ? 3.5 : 2))
                : 1;

            targets.forEach(target => {
                const setOff = (t: Enemy) => {
                    const fire = (tt: Enemy) => {
                        let spawnX = tower.x;
                        let spawnZ = tower.y;
                        let spawnY = PEDESTAL_HEIGHT + 0.5;

                        const dirX = tt.x - tower.x;
                        const dirZ = tt.y - tower.y;
                        const len = Math.sqrt(dirX * dirX + dirZ * dirZ);
                        let fX = 0;
                        let fZ = 0;

                        if (len > 0.001) {
                            fX = dirX / len;
                            fZ = dirZ / len;

                            if (isSnake) {
                                const offsetForward = 0.38;
                                spawnX = tower.x + (fX * offsetForward);
                                spawnZ = tower.y + (fZ * offsetForward);
                                spawnY = PEDESTAL_HEIGHT + 0.55;
                            } else if (isOrb) {
                                const offsetForward = 0.3;
                                spawnX = tower.x + (fX * offsetForward);
                                spawnZ = tower.y + (fZ * offsetForward);
                                spawnY = PEDESTAL_HEIGHT + 1.2;
                            } else if (isCluster) {
                                const offsetForward = 0.15;
                                spawnX = tower.x + (fX * offsetForward);
                                spawnZ = tower.y + (fZ * offsetForward);
                                spawnY = PEDESTAL_HEIGHT + 0.75;
                            } else {
                                const rX = -fZ;
                                const rZ = fX;
                                const offsetRight = 0.45;
                                const offsetForward = 0.5;
                                spawnX = tower.x + (rX * offsetRight) + (fX * offsetForward);
                                spawnZ = tower.y + (rZ * offsetRight) + (fZ * offsetForward);
                                spawnY = PEDESTAL_HEIGHT + 0.6;
                            }
                        }

                        const spawnTime = clockRef.current;

                        const dirToTargetX = tt.x - spawnX;
                        const dirToTargetY = (tt.isFlying ? ENEMY_FLYING_Y : ENEMY_GROUND_Y) - spawnY;
                        const dirToTargetZ = tt.y - spawnZ;
                        const dirMag = Math.max(Math.hypot(dirToTargetX, dirToTargetY, dirToTargetZ), 0.001);

                        spawnProjectile({
                            id: `proj-${tower.id}-${tt.id}-${Date.now()}`,
                            x: spawnX,
                            y: spawnY,
                            z: spawnZ,
                            targetId: tt.id,
                            damage: baseDamage * multiplier * killMult * critMult,
                            sourceType: tower.gemType!,
                            sourceCellId: tower.id,
                            speed: 15.0,
                            color: GEM_COLORS[tower.gemType!],
                            isSplash,
                            splashRadius,
                            homing: true,
                            spawnTime: spawnTime,
                            vx: (dirToTargetX / dirMag) * 15.0,
                            vy: (dirToTargetY / dirMag) * 15.0,
                            vz: (dirToTargetZ / dirMag) * 15.0,
                        });

                        // GREEDY MECHANIC (per shot, rare)
                        if (specialStr.includes('Gold Chance') || tower.gemType === GemType.GOLD) {
                            if (Math.random() <= GREEDY_CHANCE) {
                                const goldAmount = Math.ceil(wave * 0.5) + GREEDY_BONUS_BASE;
                                addGold(goldAmount, tower.x, tower.y);
                            }
                        }
                    };
                    setTimeout(() => fire(t), impactDelay);
                };
                setOff(target);
            });
        }
    });
  });

  return null;
};
