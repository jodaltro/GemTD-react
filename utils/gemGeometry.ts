
import { GemType } from '../constants';

export type ShapeType = 'octahedron' | 'box' | 'icosahedron' | 'capsule' | 'cylinder' | 'cone' | 'dodecahedron' | 'tetrahedron' | 'torusKnot';

export interface PartConfig {
  shape: ShapeType;
  args: any[]; // Arguments for the geometry constructor
  scale: [number, number, number];
  position: [number, number, number];
  rotation?: [number, number, number];
}

export interface GolemDesign {
  body: PartConfig;
  core: PartConfig;
  head: PartConfig;
  leftArm: PartConfig;
  rightArm: PartConfig;
  visor: PartConfig;
}

// 1. SHARP DESIGN (Crystal Types)
// Floating Shards Construct
const SHARP_DESIGN: GolemDesign = {
    body: { shape: 'octahedron', args: [1, 0], scale: [0.35, 0.6, 0.35], position: [0, 0.1, 0] },
    core: { shape: 'octahedron', args: [1, 0], scale: [0.18, 0.25, 0.18], position: [0, 0.1, 0] },
    head: { shape: 'octahedron', args: [1, 0], scale: [0.2, 0.3, 0.2], position: [0, 0.65, 0] },
    // Arms: Stacks of floating crystal shards
    leftArm: { shape: 'octahedron', args: [1, 0], scale: [0.12, 0.18, 0.12], position: [-0.35, 0.35, 0] },
    rightArm: { shape: 'octahedron', args: [1, 0], scale: [0.12, 0.18, 0.12], position: [0.35, 0.35, 0] },
    visor: { shape: 'box', args: [1, 0.05, 0.05], scale: [0.15, 1, 1], position: [0, 0, 0.14] }
};

// 2. BLOCKY DESIGN (Heavy Types)
// Floating Ancient Rocks
const BLOCKY_DESIGN: GolemDesign = {
    body: { shape: 'dodecahedron', args: [1, 0], scale: [0.35, 0.35, 0.35], position: [0, 0.1, 0] },
    core: { shape: 'box', args: [1, 1, 1], scale: [0.2, 0.2, 0.2], position: [0, 0.1, 0.1] },
    head: { shape: 'box', args: [1, 1, 1], scale: [0.22, 0.25, 0.22], position: [0, 0.55, 0] },
    // Arms: Floating heavy stones
    leftArm: { shape: 'dodecahedron', args: [1, 0], scale: [0.15, 0.15, 0.15], position: [-0.4, 0.3, 0] },
    rightArm: { shape: 'dodecahedron', args: [1, 0], scale: [0.15, 0.15, 0.15], position: [0.4, 0.3, 0] },
    visor: { shape: 'box', args: [1, 0.08, 0.02], scale: [0.25, 1, 1], position: [0, 0.05, 0.13] }
};

// 3. ROUND DESIGN (Organic/Magic Types)
// Fluid Magic Blobs (Brush-like smooth forms)
const ROUND_DESIGN: GolemDesign = {
    body: { shape: 'icosahedron', args: [1, 1], scale: [0.32, 0.45, 0.32], position: [0, 0.1, 0] },
    core: { shape: 'icosahedron', args: [1, 1], scale: [0.16, 0.16, 0.16], position: [0, 0.1, 0] },
    head: { shape: 'icosahedron', args: [1, 1], scale: [0.22, 0.22, 0.22], position: [0, 0.6, 0] },
    // Arms: Smooth spherical segments that will form a tapered limb
    leftArm: { shape: 'icosahedron', args: [1, 1], scale: [0.14, 0.14, 0.14], position: [-0.35, 0.3, 0] },
    rightArm: { shape: 'icosahedron', args: [1, 1], scale: [0.14, 0.14, 0.14], position: [0.35, 0.3, 0] },
    visor: { shape: 'box', args: [0.4, 0.08, 0.05], scale: [0.4, 1, 1], position: [0, 0, 0.2] }
};

export const getGolemDesign = (type: GemType): GolemDesign => {
    // 1. Sharp/Crystal
    const isSharp = [
        GemType.DIAMOND, GemType.TOPAZ, GemType.SILVER, GemType.GOLD, 
        GemType.PINK_DIAMOND, GemType.YELLOW_SAPPHIRE, GemType.URANIUM_238
    ].includes(type);

    // 2. Blocky/Heavy
    const isBlocky = [
        GemType.EMERALD, GemType.JADE, GemType.MALACHITE, 
        GemType.DARK_EMERALD, GemType.TOURMALINE, GemType.AQUAMARINE
    ].includes(type);
    
    if (isSharp) return SHARP_DESIGN;
    if (isBlocky) return BLOCKY_DESIGN;
    return ROUND_DESIGN;
};
