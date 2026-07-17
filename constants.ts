



export const GRID_SIZE = 12; // Small map for development (was 32)
export const CELL_SIZE = 1.0;
export const BOARD_OFFSET_X = -(GRID_SIZE * CELL_SIZE) / 2 + CELL_SIZE / 2;
export const BOARD_OFFSET_Z = -(GRID_SIZE * CELL_SIZE) / 2 + CELL_SIZE / 2;
export const PEDESTAL_HEIGHT = 0.5; // Elevation of the platform under each tower

// Scale factor to convert Warcraft 3/Dota style units to Three.js grid units (Cell Size 1.0)
// Assuming Range 100 ~ 2.5 Grid Cells
export const RANGE_SCALE = 0.03; 

export const START_POS = { x: 0, y: 6 }; // Adjusted for 12 height
export const END_POS = { x: 11, y: 6 };   // Adjusted for 12 width

// Wave & HP Constants
export const HP_BASE = 20;
export const HP_GROWTH_FACTOR = 1.30; // K factor
export const DAMAGE_PENALTY = 0.8; // Reduced damage against wrong type

// Economy & Lives
export const STARTING_LIVES = 20;
export const BOSS_DAMAGE = 20; // Instant game over for standard mode, or massive chunk
export const STARTING_GOLD = 10000;
export const GOLD_PER_KILL = 2;
export const GOLD_PER_WAVE = 10;
export const PRAY_COST_COLOR = 5;
export const PRAY_COST_QUALITY = 15;

// Stone Removal / Terraform Constants
export const BASE_STONE_COST = 50;
export const STONE_COST_INCREMENT = 25;

// Greedy / Gold Mechanic
export const GREEDY_CHANCE = 0.05; // 5% chance on attack (Slightly higher than 1% for gameplay feel, or stick to 1% logic)
export const GREEDY_BONUS_BASE = 5;

// Research / Upgrade Costs
export const RESEARCH_COSTS: Record<number, number> = {
  1: 100, // Cost to go to Lvl 2
  2: 140, // Cost to go to Lvl 3
  3: 200,
  4: 280,
  5: 380,
  6: 500,
  7: 0 // Max level
};

// Combat & Armor Constants
export const ARMOR_REDUCTION_FACTOR = 0.06;
export const NEGATIVE_ARMOR_FACTOR = 0.94;
export const STUN_COOLDOWN = 2.0; // Seconds before an enemy can be stunned again

export enum CellType {
  EMPTY = 0,
  ROCK = 1,
  TOWER = 2,
  BLOCKED = 3,
}

export enum GemType {
  // Basic
  DIAMOND = 'DIAMOND', // White
  EMERALD = 'EMERALD', // Green
  RUBY = 'RUBY',       // Red
  SAPPHIRE = 'SAPPHIRE', // Blue
  AMETHYST = 'AMETHYST', // Violet
  TOPAZ = 'TOPAZ',     // Yellow
  AQUAMARINE = 'AQUAMARINE', // Cyan
  OPAL = 'OPAL',       // Cyan (Alternate)
  
  // Specials
  SILVER = 'SILVER',
  MALACHITE = 'MALACHITE',
  JADE = 'JADE',
  STAR_RUBY = 'STAR_RUBY',
  RED_CRYSTAL = 'RED_CRYSTAL',
  DARK_EMERALD = 'DARK_EMERALD',
  GOLD = 'GOLD',
  PINK_DIAMOND = 'PINK_DIAMOND',
  URANIUM_238 = 'URANIUM_238',
  BLACK_OPAL = 'BLACK_OPAL',
  BLOOD_STONE = 'BLOOD_STONE',
  YELLOW_SAPPHIRE = 'YELLOW_SAPPHIRE',
  TOURMALINE = 'TOURMALINE',
}

export enum GemQuality {
  CHIPPED = 'Chipped',
  FLAWED = 'Flawed',
  NORMAL = 'Normal',
  FLAWLESS = 'Flawless',
  PERFECT = 'Perfect',
  GREAT = 'Great',
  SPECIAL = 'Special', 
}

export enum GamePhase {
  BUILDING = 'BUILDING',     // Placing 5 gems
  SELECTING = 'SELECTING',   // Choosing 1 to keep
  READY = 'READY',           // Maze is set, ready to start wave
  DEFENDING = 'DEFENDING',   // Wave active, enemies moving
}

// Visual Constants
export const COLORS = {
  ground: '#1e293b', // Slate 800
  groundHighlight: '#334155', // Slate 700
  rock: '#475569', // Slate 600
  cursor: '#22d3ee', // Cyan 400
  gridLines: '#0f172a', // Slate 900
  start: '#22c55e', // Green 500
  end: '#ef4444',   // Red 500
  enemy: '#ef4444', // Red 500
  enemyHighlight: '#fca5a5', // Red 300
};

export const GEM_COLORS = {
  [GemType.DIAMOND]: '#b9f2ff', 
  [GemType.EMERALD]: '#50c878', 
  [GemType.RUBY]: '#e0115f', 
  [GemType.SAPPHIRE]: '#0f52ba', 
  [GemType.AMETHYST]: '#9966cc', 
  [GemType.TOPAZ]: '#ffc87c', 
  [GemType.AQUAMARINE]: '#7fffd4', 
  [GemType.OPAL]: '#a8c3bc',
  
  // Specials - distinct colors
  [GemType.SILVER]: '#c0c0c0',
  [GemType.MALACHITE]: '#0b6623', // Dark forest green
  [GemType.JADE]: '#00a86b',
  [GemType.STAR_RUBY]: '#9b111e', // Deep red
  [GemType.RED_CRYSTAL]: '#ff0000', // Pure red
  [GemType.DARK_EMERALD]: '#174a2c', // Very dark green
  [GemType.GOLD]: '#ffd700', // Gold
  [GemType.PINK_DIAMOND]: '#ff69b4', // Hot pink
  [GemType.URANIUM_238]: '#ccff00', // Neon lime
  [GemType.BLACK_OPAL]: '#333333', // Dark grey/black
  [GemType.BLOOD_STONE]: '#8a0303', // Blood red
  [GemType.YELLOW_SAPPHIRE]: '#fff700', // Bright Yellow
  [GemType.TOURMALINE]: '#ff00ff', // Magenta/Chaos
};

// --- VISUAL EVOLUTION CONFIG ---
export interface VisualConfig {
  scale: number;
  glowIntensity: number; // For the sparkle shader (Aura)
  colorMix: number; // 0 = dull/dark, 1 = vibrant
}

export const QUALITY_VISUALS: Record<string, VisualConfig> = {
  [GemQuality.CHIPPED]: { scale: 0.8, glowIntensity: 0.0, colorMix: 0.6 },
  [GemQuality.FLAWED]: { scale: 0.9, glowIntensity: 0.2, colorMix: 0.75 },
  [GemQuality.NORMAL]: { scale: 1.0, glowIntensity: 0.4, colorMix: 0.9 },
  [GemQuality.FLAWLESS]: { scale: 1.15, glowIntensity: 0.7, colorMix: 1.0 },
  [GemQuality.PERFECT]: { scale: 1.3, glowIntensity: 1.0, colorMix: 1.1 }, // >1 bloom
  [GemQuality.GREAT]: { scale: 1.5, glowIntensity: 1.5, colorMix: 1.2 },
  [GemQuality.SPECIAL]: { scale: 1.6, glowIntensity: 2.0, colorMix: 1.3 },
};


// --- PROBABILITY & DISTRIBUTION ---
export const QUALITY_ORDER = [
  GemQuality.CHIPPED,
  GemQuality.FLAWED,
  GemQuality.NORMAL,
  GemQuality.FLAWLESS,
  GemQuality.PERFECT,
  GemQuality.GREAT
];

export const SPAWN_PROBABILITIES: Record<number, Record<GemQuality, number>> = {
  1: { [GemQuality.CHIPPED]: 100, [GemQuality.FLAWED]: 0, [GemQuality.NORMAL]: 0, [GemQuality.FLAWLESS]: 0, [GemQuality.PERFECT]: 0, [GemQuality.GREAT]: 0, [GemQuality.SPECIAL]: 0 },
  2: { [GemQuality.CHIPPED]: 80, [GemQuality.FLAWED]: 20, [GemQuality.NORMAL]: 0, [GemQuality.FLAWLESS]: 0, [GemQuality.PERFECT]: 0, [GemQuality.GREAT]: 0, [GemQuality.SPECIAL]: 0 },
  3: { [GemQuality.CHIPPED]: 60, [GemQuality.FLAWED]: 30, [GemQuality.NORMAL]: 10, [GemQuality.FLAWLESS]: 0, [GemQuality.PERFECT]: 0, [GemQuality.GREAT]: 0, [GemQuality.SPECIAL]: 0 },
  4: { [GemQuality.CHIPPED]: 50, [GemQuality.FLAWED]: 30, [GemQuality.NORMAL]: 20, [GemQuality.FLAWLESS]: 0, [GemQuality.PERFECT]: 0, [GemQuality.GREAT]: 0, [GemQuality.SPECIAL]: 0 },
  5: { [GemQuality.CHIPPED]: 40, [GemQuality.FLAWED]: 30, [GemQuality.NORMAL]: 20, [GemQuality.FLAWLESS]: 10, [GemQuality.PERFECT]: 0, [GemQuality.GREAT]: 0, [GemQuality.SPECIAL]: 0 },
  6: { [GemQuality.CHIPPED]: 30, [GemQuality.FLAWED]: 30, [GemQuality.NORMAL]: 20, [GemQuality.FLAWLESS]: 15, [GemQuality.PERFECT]: 5, [GemQuality.GREAT]: 0, [GemQuality.SPECIAL]: 0 },
  // Max Level (7+)
  7: { [GemQuality.CHIPPED]: 10, [GemQuality.FLAWED]: 20, [GemQuality.NORMAL]: 30, [GemQuality.FLAWLESS]: 30, [GemQuality.PERFECT]: 10, [GemQuality.GREAT]: 0, [GemQuality.SPECIAL]: 0 },
};

// --- WAVE DEFINITIONS ---
export interface WaveDef {
  weakness: GemType;
  abilities: string[]; // Fast, Flying, Invisible, Immune, Regen, Boss
}

export const WAVE_CONFIG: Record<number, WaveDef> = {
  1: { weakness: GemType.TOPAZ, abilities: [] },
  2: { weakness: GemType.AQUAMARINE, abilities: [] },
  3: { weakness: GemType.DIAMOND, abilities: ['Fast'] },
  4: { weakness: GemType.AMETHYST, abilities: ['Flying'] },
  5: { weakness: GemType.EMERALD, abilities: [] },
  6: { weakness: GemType.EMERALD, abilities: [] },
  7: { weakness: GemType.AMETHYST, abilities: [] },
  8: { weakness: GemType.AMETHYST, abilities: ['Invisible', 'Flying'] },
  9: { weakness: GemType.DIAMOND, abilities: ['Evasion'] },
  10: { weakness: GemType.SAPPHIRE, abilities: ['Boss', 'High Armor'] },
  11: { weakness: GemType.EMERALD, abilities: [] },
  12: { weakness: GemType.AMETHYST, abilities: [] },
  13: { weakness: GemType.TOPAZ, abilities: ['Fast'] },
  14: { weakness: GemType.AQUAMARINE, abilities: [] },
  15: { weakness: GemType.RUBY, abilities: ['Flying'] },
  16: { weakness: GemType.AMETHYST, abilities: ['Magic Immune'] },
  17: { weakness: GemType.RUBY, abilities: [] },
  18: { weakness: GemType.AMETHYST, abilities: ['Invisible', 'Flying'] },
  19: { weakness: GemType.SAPPHIRE, abilities: ['Evasion'] },
  20: { weakness: GemType.AMETHYST, abilities: ['Boss', 'Flying'] },
  // Gap fillers
  30: { weakness: GemType.EMERALD, abilities: ['Boss', 'Regen'] },
  31: { weakness: GemType.AQUAMARINE, abilities: ['Magic Immune', 'Evasion'] },
};

export const GET_WAVE_DATA = (wave: number): WaveDef => {
  if (WAVE_CONFIG[wave]) return WAVE_CONFIG[wave];
  // Fallback for unlisted waves (Endgame 36+) or gaps
  if (wave >= 36) return { weakness: GemType.AMETHYST, abilities: ['Endgame'] };
  
  // Cyclic fallback for intermediate gaps
  const types = [GemType.TOPAZ, GemType.AQUAMARINE, GemType.DIAMOND, GemType.EMERALD, GemType.RUBY, GemType.SAPPHIRE];
  return { weakness: types[wave % types.length], abilities: [] };
};

// --- DAMAGE MATRIX ---
export const DAMAGE_MULTIPLIERS: Record<GemType, number> = {
  [GemType.AMETHYST]: 1.75,
  [GemType.EMERALD]: 1.70,
  [GemType.TOPAZ]: 1.60,
  [GemType.AQUAMARINE]: 1.90, 
  [GemType.OPAL]: 1.90,
  [GemType.SAPPHIRE]: 1.75,
  [GemType.RUBY]: 1.80,
  [GemType.DIAMOND]: 1.60,
  // Specials inherit base types logic in store, these are placeholders
  [GemType.SILVER]: 1.0, 
  [GemType.MALACHITE]: 1.0,
  [GemType.JADE]: 1.0,
  [GemType.STAR_RUBY]: 1.0,
  [GemType.RED_CRYSTAL]: 1.0,
  [GemType.DARK_EMERALD]: 1.0,
  [GemType.GOLD]: 1.0,
  [GemType.PINK_DIAMOND]: 1.0,
  [GemType.URANIUM_238]: 1.0,
  [GemType.BLACK_OPAL]: 1.0,
  [GemType.BLOOD_STONE]: 1.0,
  [GemType.YELLOW_SAPPHIRE]: 1.0,
  [GemType.TOURMALINE]: 1.0,
};

// --- SPECIAL EFFECT DEFINITIONS ---
// Used for applying buffs/debuffs in the damage pipeline
export const GEM_SPECIAL_EFFECTS: Record<string, any> = {
  [GemType.SAPPHIRE]: { type: 'SLOW', value: 0.2, duration: 2.0 }, // 20% slow
  [GemType.SILVER]: { type: 'SLOW', value: 0.3, duration: 3.0 },
  [GemType.URANIUM_238]: { type: 'SLOW', value: 0.15, duration: 1.0 },
  [GemType.YELLOW_SAPPHIRE]: { type: 'SLOW', value: 0.4, duration: 3.0 },
  
  [GemType.GOLD]: { type: 'ARMOR_SHRED', value: 5, duration: 5.0 },
  [GemType.RED_CRYSTAL]: { type: 'ARMOR_SHRED', value: 3, duration: 5.0 }, // Only affects air really
  
  [GemType.DARK_EMERALD]: { type: 'STUN', chance: 0.125, duration: 1.5 },
  
  // POISON GEMS
  [GemType.EMERALD]: { type: 'POISON', value: 5, duration: 5.0 },
  [GemType.MALACHITE]: { type: 'POISON', value: 8, duration: 5.0 },
  [GemType.JADE]: { type: 'POISON', value: 6, duration: 5.0 },
};

// --- RECIPES ---
export interface Recipe {
  result: GemType;
  ingredients: { type: GemType; quality: GemQuality }[];
  description: string;
}

export const RECIPES: Recipe[] = [
  {
    result: GemType.SILVER,
    ingredients: [
      { type: GemType.SAPPHIRE, quality: GemQuality.CHIPPED },
      { type: GemType.TOPAZ, quality: GemQuality.CHIPPED },
      { type: GemType.DIAMOND, quality: GemQuality.CHIPPED },
    ],
    description: "Splash & Slow",
  },
  {
    result: GemType.MALACHITE,
    ingredients: [
      { type: GemType.OPAL, quality: GemQuality.CHIPPED },
      { type: GemType.EMERALD, quality: GemQuality.CHIPPED },
      { type: GemType.AQUAMARINE, quality: GemQuality.CHIPPED },
    ],
    description: "Multi-shot Poison",
  },
  {
    result: GemType.JADE,
    ingredients: [
      { type: GemType.EMERALD, quality: GemQuality.NORMAL },
      { type: GemType.OPAL, quality: GemQuality.NORMAL },
      { type: GemType.SAPPHIRE, quality: GemQuality.FLAWED },
    ],
    description: "Poison & Gold Chance",
  },
  {
    result: GemType.STAR_RUBY,
    ingredients: [
      { type: GemType.RUBY, quality: GemQuality.CHIPPED },
      { type: GemType.RUBY, quality: GemQuality.FLAWED },
      { type: GemType.AMETHYST, quality: GemQuality.CHIPPED },
    ],
    description: "Dano escala com Kills",
  },
  {
    result: GemType.RED_CRYSTAL,
    ingredients: [
      { type: GemType.EMERALD, quality: GemQuality.FLAWLESS },
      { type: GemType.RUBY, quality: GemQuality.NORMAL },
      { type: GemType.AMETHYST, quality: GemQuality.FLAWED },
    ],
    description: "Anti-Air Armor Reduction",
  },
  {
    result: GemType.DARK_EMERALD,
    ingredients: [
      { type: GemType.EMERALD, quality: GemQuality.PERFECT },
      { type: GemType.SAPPHIRE, quality: GemQuality.FLAWLESS },
      { type: GemType.TOPAZ, quality: GemQuality.FLAWED },
    ],
    description: "Stun Chance (12.5%)",
  },
  {
    result: GemType.GOLD,
    ingredients: [
      { type: GemType.AMETHYST, quality: GemQuality.PERFECT },
      { type: GemType.AMETHYST, quality: GemQuality.FLAWLESS },
      { type: GemType.DIAMOND, quality: GemQuality.FLAWED },
    ],
    description: "Armor Reduction (-5)",
  },
  {
    result: GemType.PINK_DIAMOND,
    ingredients: [
      { type: GemType.DIAMOND, quality: GemQuality.PERFECT },
      { type: GemType.DIAMOND, quality: GemQuality.NORMAL },
      { type: GemType.TOPAZ, quality: GemQuality.NORMAL },
    ],
    description: "Massive Crit (Boss Killer)",
  },
  {
    result: GemType.URANIUM_238,
    ingredients: [
      { type: GemType.TOPAZ, quality: GemQuality.PERFECT },
      { type: GemType.OPAL, quality: GemQuality.FLAWED },
      { type: GemType.SAPPHIRE, quality: GemQuality.NORMAL },
    ],
    description: "Radiation Aura (Dmg + Slow)",
  },
  {
    result: GemType.BLACK_OPAL,
    ingredients: [
      { type: GemType.OPAL, quality: GemQuality.PERFECT },
      { type: GemType.DIAMOND, quality: GemQuality.FLAWLESS },
      { type: GemType.AQUAMARINE, quality: GemQuality.NORMAL },
    ],
    description: "Mystic Aura (Snapshot Dmg Buff)",
  },
  {
    result: GemType.BLOOD_STONE,
    ingredients: [
      { type: GemType.RUBY, quality: GemQuality.PERFECT },
      { type: GemType.AQUAMARINE, quality: GemQuality.FLAWLESS },
      { type: GemType.AMETHYST, quality: GemQuality.NORMAL },
    ],
    description: "Global Attack / Bombardment",
  },
  {
    result: GemType.YELLOW_SAPPHIRE,
    ingredients: [
      { type: GemType.SAPPHIRE, quality: GemQuality.PERFECT },
      { type: GemType.RUBY, quality: GemQuality.FLAWLESS },
      { type: GemType.TOPAZ, quality: GemQuality.FLAWLESS },
    ],
    description: "Slow Area + Splash",
  },
  {
    result: GemType.TOURMALINE,
    ingredients: [
      { type: GemType.AQUAMARINE, quality: GemQuality.PERFECT },
      { type: GemType.OPAL, quality: GemQuality.FLAWLESS },
      { type: GemType.AQUAMARINE, quality: GemQuality.FLAWED },
      { type: GemType.EMERALD, quality: GemQuality.FLAWED },
    ],
    description: "Chaos Damage",
  },
];


// --- GEM STATS MATRIX ---
export interface GemStatModel {
  minDmg: number;
  maxDmg: number;
  range: number;
  cooldown: number; // in ms
  special: string;
  specialValue?: number; // Generic value holder (poison dmg, slow %, crit mult)
}

const SPECIAL_GEM_STATS: Record<string, GemStatModel> = {
  [GemType.SILVER]: { minDmg: 30, maxDmg: 30, range: 600 * RANGE_SCALE, cooldown: 800, special: 'Splash & Slow' },
  [GemType.MALACHITE]: { minDmg: 20, maxDmg: 25, range: 600 * RANGE_SCALE, cooldown: 600, special: 'Multi-Poison' },
  [GemType.JADE]: { minDmg: 30, maxDmg: 35, range: 500 * RANGE_SCALE, cooldown: 1000, special: 'Poison + Gold' },
  [GemType.STAR_RUBY]: { minDmg: 50, maxDmg: 50, range: 600 * RANGE_SCALE, cooldown: 1200, special: 'Scales w/ Kills' },
  [GemType.RED_CRYSTAL]: { minDmg: 60, maxDmg: 70, range: 600 * RANGE_SCALE, cooldown: 1000, special: 'Air Armor Redux' },
  [GemType.DARK_EMERALD]: { minDmg: 90, maxDmg: 150, range: 79 * RANGE_SCALE, cooldown: 1000, special: 'Stun 12.5%' },
  [GemType.GOLD]: { minDmg: 160, maxDmg: 190, range: 114 * RANGE_SCALE, cooldown: 1000, special: 'Armor Redux (-5)' },
  [GemType.PINK_DIAMOND]: { minDmg: 30, maxDmg: 110, range: 600 * RANGE_SCALE, cooldown: 800, special: 'Boss Crit' },
  [GemType.URANIUM_238]: { minDmg: 47, maxDmg: 47, range: 64 * RANGE_SCALE, cooldown: 200, special: 'Radiation Aura' },
  [GemType.BLACK_OPAL]: { minDmg: 24, maxDmg: 25, range: 143 * RANGE_SCALE, cooldown: 800, special: 'Snapshot Buff' },
  [GemType.BLOOD_STONE]: { minDmg: 68, maxDmg: 68, range: 100 * RANGE_SCALE, cooldown: 1500, special: 'Bombardment' },
  [GemType.YELLOW_SAPPHIRE]: { minDmg: 60, maxDmg: 75, range: 600 * RANGE_SCALE, cooldown: 1000, special: 'Area Slow' },
  [GemType.TOURMALINE]: { minDmg: 30, maxDmg: 400, range: 121 * RANGE_SCALE, cooldown: 500, special: 'Chaos Dmg' },
};

// Merging Basic and Special stats for the complete lookup
export const GEM_STATS: Record<string, Record<string, GemStatModel>> = {
  [GemType.AMETHYST]: { 
    [GemQuality.CHIPPED]: { minDmg: 9, maxDmg: 13, range: 143 * RANGE_SCALE, cooldown: 800, special: 'Air Priority' },
    [GemQuality.FLAWED]: { minDmg: 18, maxDmg: 25, range: 161 * RANGE_SCALE, cooldown: 1000, special: 'Air Priority' },
    [GemQuality.NORMAL]: { minDmg: 30, maxDmg: 40, range: 179 * RANGE_SCALE, cooldown: 1000, special: 'Air Priority' },
    [GemQuality.FLAWLESS]: { minDmg: 60, maxDmg: 75, range: 186 * RANGE_SCALE, cooldown: 1000, special: 'Air Priority' },
    [GemQuality.PERFECT]: { minDmg: 140, maxDmg: 150, range: 215 * RANGE_SCALE, cooldown: 1000, special: 'Massive Range' },
    [GemQuality.GREAT]: { minDmg: 350, maxDmg: 400, range: 235 * RANGE_SCALE, cooldown: 1000, special: 'Air Destroyer' },
  },
  [GemType.AQUAMARINE]: { 
    [GemQuality.CHIPPED]: { minDmg: 6, maxDmg: 8, range: 50 * RANGE_SCALE, cooldown: 500, special: 'Fast Attack' },
    [GemQuality.FLAWED]: { minDmg: 12, maxDmg: 15, range: 52 * RANGE_SCALE, cooldown: 500, special: 'Fast Attack' },
    [GemQuality.NORMAL]: { minDmg: 24, maxDmg: 30, range: 54 * RANGE_SCALE, cooldown: 500, special: 'Fast Attack' },
    [GemQuality.FLAWLESS]: { minDmg: 48, maxDmg: 55, range: 57 * RANGE_SCALE, cooldown: 500, special: 'Fast Attack' },
    [GemQuality.PERFECT]: { minDmg: 100, maxDmg: 120, range: 79 * RANGE_SCALE, cooldown: 500, special: 'Range Boost' },
    [GemQuality.GREAT]: { minDmg: 280, maxDmg: 280, range: 85 * RANGE_SCALE, cooldown: 500, special: 'Fixed Damage' },
  },
  [GemType.DIAMOND]: { 
    [GemQuality.CHIPPED]: { minDmg: 8, maxDmg: 12, range: 72 * RANGE_SCALE, cooldown: 800, special: 'Crit 25% (2x)', specialValue: 2 },
    [GemQuality.FLAWED]: { minDmg: 16, maxDmg: 18, range: 79 * RANGE_SCALE, cooldown: 800, special: 'Crit 25% (2x)', specialValue: 2 },
    [GemQuality.NORMAL]: { minDmg: 30, maxDmg: 37, range: 86 * RANGE_SCALE, cooldown: 800, special: 'Crit 25% (2x)', specialValue: 2 },
    [GemQuality.FLAWLESS]: { minDmg: 58, maxDmg: 65, range: 93 * RANGE_SCALE, cooldown: 800, special: 'Crit 25% (2x)', specialValue: 2 },
    [GemQuality.PERFECT]: { minDmg: 140, maxDmg: 150, range: 107 * RANGE_SCALE, cooldown: 800, special: 'Crit 25% (2x)', specialValue: 2 },
    [GemQuality.GREAT]: { minDmg: 300, maxDmg: 350, range: 121 * RANGE_SCALE, cooldown: 800, special: 'Crit 25% (5x)', specialValue: 5 },
  },
  [GemType.EMERALD]: { 
    [GemQuality.CHIPPED]: { minDmg: 9, maxDmg: 13, range: 79 * RANGE_SCALE, cooldown: 1000, special: 'Poison 6 dmg/3s', specialValue: 2 },
    [GemQuality.FLAWED]: { minDmg: 10, maxDmg: 14, range: 79 * RANGE_SCALE, cooldown: 1000, special: 'Poison 12 dmg/4s', specialValue: 3 },
    [GemQuality.NORMAL]: { minDmg: 15, maxDmg: 25, range: 86 * RANGE_SCALE, cooldown: 1000, special: 'Poison 25 dmg/5s', specialValue: 5 },
    [GemQuality.FLAWLESS]: { minDmg: 30, maxDmg: 38, range: 100 * RANGE_SCALE, cooldown: 1000, special: 'Poison 48 dmg/6s', specialValue: 8 },
    [GemQuality.PERFECT]: { minDmg: 80, maxDmg: 90, range: 128 * RANGE_SCALE, cooldown: 1000, special: 'Poison 128 dmg/8s', specialValue: 16 },
    [GemQuality.GREAT]: { minDmg: 250, maxDmg: 250, range: 128 * RANGE_SCALE, cooldown: 1000, special: 'Poison 1500 dmg/30s', specialValue: 50 },
  },
  [GemType.OPAL]: { 
    [GemQuality.CHIPPED]: { minDmg: 4, maxDmg: 5, range: 86 * RANGE_SCALE, cooldown: 800, special: 'Aura +10% AS', specialValue: 10 },
    [GemQuality.FLAWED]: { minDmg: 10, maxDmg: 10, range: 100 * RANGE_SCALE, cooldown: 800, special: 'Aura +15% AS', specialValue: 15 },
    [GemQuality.NORMAL]: { minDmg: 20, maxDmg: 20, range: 114 * RANGE_SCALE, cooldown: 800, special: 'Aura +20% AS', specialValue: 20 },
    [GemQuality.FLAWLESS]: { minDmg: 40, maxDmg: 40, range: 128 * RANGE_SCALE, cooldown: 800, special: 'Aura +25% AS', specialValue: 25 },
    [GemQuality.PERFECT]: { minDmg: 85, maxDmg: 85, range: 143 * RANGE_SCALE, cooldown: 800, special: 'Aura +35% AS', specialValue: 35 },
    [GemQuality.GREAT]: { minDmg: 180, maxDmg: 180, range: 214 * RANGE_SCALE, cooldown: 800, special: 'Aura +50% AS', specialValue: 50 },
  },
  [GemType.RUBY]: { 
    [GemQuality.CHIPPED]: { minDmg: 8, maxDmg: 10, range: 114 * RANGE_SCALE, cooldown: 1200, special: 'Splash 25', specialValue: 25 },
    [GemQuality.FLAWED]: { minDmg: 16, maxDmg: 20, range: 114 * RANGE_SCALE, cooldown: 1200, special: 'Splash 25', specialValue: 25 },
    [GemQuality.NORMAL]: { minDmg: 30, maxDmg: 35, range: 114 * RANGE_SCALE, cooldown: 1200, special: 'Splash 30', specialValue: 30 },
    [GemQuality.FLAWLESS]: { minDmg: 60, maxDmg: 70, range: 114 * RANGE_SCALE, cooldown: 1200, special: 'Splash 30', specialValue: 30 },
    [GemQuality.PERFECT]: { minDmg: 120, maxDmg: 140, range: 128 * RANGE_SCALE, cooldown: 1200, special: 'Pure Dmg Splash', specialValue: 30 },
    [GemQuality.GREAT]: { minDmg: 300, maxDmg: 350, range: 128 * RANGE_SCALE, cooldown: 1200, special: 'Multi-Shot (3)', specialValue: 3 },
  },
  [GemType.SAPPHIRE]: { 
    [GemQuality.CHIPPED]: { minDmg: 5, maxDmg: 8, range: 72 * RANGE_SCALE, cooldown: 1000, special: 'Slow 10%', specialValue: 10 },
    [GemQuality.FLAWED]: { minDmg: 10, maxDmg: 13, range: 107 * RANGE_SCALE, cooldown: 1000, special: 'Slow 20%', specialValue: 20 },
    [GemQuality.NORMAL]: { minDmg: 16, maxDmg: 21, range: 114 * RANGE_SCALE, cooldown: 1000, special: 'Slow 25%', specialValue: 25 },
    [GemQuality.FLAWLESS]: { minDmg: 30, maxDmg: 40, range: 121 * RANGE_SCALE, cooldown: 1000, special: 'Slow 30%', specialValue: 30 },
    [GemQuality.PERFECT]: { minDmg: 60, maxDmg: 75, range: 200 * RANGE_SCALE, cooldown: 1000, special: 'Slow 40%', specialValue: 40 },
    [GemQuality.GREAT]: { minDmg: 150, maxDmg: 200, range: 200 * RANGE_SCALE, cooldown: 1000, special: 'Freeze Chance', specialValue: 100 },
  },
  [GemType.TOPAZ]: { 
    [GemQuality.CHIPPED]: { minDmg: 4, maxDmg: 4, range: 72 * RANGE_SCALE, cooldown: 1000, special: '3 Targets', specialValue: 3 },
    [GemQuality.FLAWED]: { minDmg: 8, maxDmg: 8, range: 72 * RANGE_SCALE, cooldown: 1000, special: '3 Targets', specialValue: 3 },
    [GemQuality.NORMAL]: { minDmg: 14, maxDmg: 14, range: 72 * RANGE_SCALE, cooldown: 1000, special: '4 Targets', specialValue: 4 },
    [GemQuality.FLAWLESS]: { minDmg: 25, maxDmg: 25, range: 72 * RANGE_SCALE, cooldown: 1000, special: '4 Targets', specialValue: 4 },
    [GemQuality.PERFECT]: { minDmg: 75, maxDmg: 75, range: 86 * RANGE_SCALE, cooldown: 1000, special: '5 Targets', specialValue: 5 },
    [GemQuality.GREAT]: { minDmg: 250, maxDmg: 250, range: 100 * RANGE_SCALE, cooldown: 1000, special: '7 Targets', specialValue: 7 },
  },
  // Special Gems map directly to a "Special" quality bucket for simpler lookup, or handle key presence
  ...Object.keys(SPECIAL_GEM_STATS).reduce((acc, key) => {
    acc[key] = { [GemQuality.SPECIAL]: SPECIAL_GEM_STATS[key] };
    return acc;
  }, {} as any)
};
