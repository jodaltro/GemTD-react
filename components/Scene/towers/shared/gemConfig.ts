import { GemType } from '../../../../constants';
import { GemMaterialConfig } from './types';

export const DEFAULT_GEM_PHYSICS: GemMaterialConfig = {
    color: '#ffffff', emissiveIntensity: 3.0,
};

export const GEM_PHYSICS: Record<GemType, GemMaterialConfig> = {
    [GemType.DIAMOND]:       { color: '#e0f7fa', emissiveIntensity: 1.0 },
    [GemType.PINK_DIAMOND]:  { color: '#f8bbd0', emissiveIntensity: 1.0 },
    [GemType.RUBY]:          { color: '#d50000', emissiveIntensity: 1.5 },
    [GemType.SAPPHIRE]:      { color: '#2962ff', emissiveIntensity: 1.5 },
    [GemType.EMERALD]:       { color: '#00c853', emissiveIntensity: 1.2 },
    [GemType.TOPAZ]:         { color: '#ffab00', emissiveIntensity: 1.2 },
    [GemType.AMETHYST]:      { color: '#aa00ff', emissiveIntensity: 1.2 },
    [GemType.AQUAMARINE]:    { color: '#7fffd4', emissiveIntensity: 1.4 },
    [GemType.OPAL]:          { color: '#b2dfdb', emissiveIntensity: 0.8 },
    [GemType.BLACK_OPAL]:    { color: '#311b92', emissiveIntensity: 1.5 },
    [GemType.SILVER]:        { color: '#eceff1', emissiveIntensity: 0.8 },
    [GemType.GOLD]:          { color: '#ffd700', emissiveIntensity: 1.0 },
    [GemType.MALACHITE]:     { color: '#1b5e20', emissiveIntensity: 0.8 },
    [GemType.JADE]:          { color: '#00bfa5', emissiveIntensity: 0.8 },
    [GemType.STAR_RUBY]:     { color: '#b71c1c', emissiveIntensity: 1.5 },
    [GemType.RED_CRYSTAL]:   { color: '#ff1744', emissiveIntensity: 1.5 },
    [GemType.DARK_EMERALD]:  { color: '#004d40', emissiveIntensity: 0.8 },
    [GemType.URANIUM_238]:   { color: '#c6ff00', emissiveIntensity: 2.0 },
    [GemType.BLOOD_STONE]:   { color: '#880e4f', emissiveIntensity: 1.0 },
    [GemType.YELLOW_SAPPHIRE]: { color: '#ffff00', emissiveIntensity: 1.0 },
    [GemType.TOURMALINE]:    { color: '#d500f9', emissiveIntensity: 1.5 },
};

export const ORB_TYPES = [
    GemType.AMETHYST, GemType.OPAL, GemType.BLACK_OPAL,
    GemType.URANIUM_238, GemType.TOURMALINE,
];

export const SNAKE_TYPES = [
    GemType.EMERALD, GemType.DARK_EMERALD,
];

export const STONEFISH_TYPES = [
    GemType.AQUAMARINE,
];

export const RUBY_TYPES = [
    GemType.RUBY,
];
