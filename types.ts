
import React from 'react';
import { CellType, GemType, GamePhase, GemQuality } from './constants';
import * as THREE from 'three';

export interface GridCell {
  id: string;
  x: number;
  y: number;
  type: CellType;
  gemType?: GemType; 
  quality?: GemQuality;
  isHovered: boolean;
  placedAt?: number;
  
  // Phase 4: Combat Stats
  lastShot?: number; // Timestamp
  targetId?: string | null; // The enemy this tower is currently aiming at
  killCount?: number; 
  damageMultiplier?: number;
}

export interface FlowField {
  [key: string]: { x: number; y: number } | null;
}

export type StatusEffectType = 'SLOW' | 'ARMOR_SHRED' | 'STUN' | 'POISON';

export interface StatusEffect {
  sourceId: string;
  type: StatusEffectType;
  value: number;
  duration: number;
}

export interface Enemy {
  id: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  baseSpeed: number;
  speed: number;
  armor: number;
  baseArmor: number;
  distanceTraveled: number;
  
  weakness: GemType;
  isFlying: boolean;
  isInvisible: boolean;
  isBoss: boolean;
  isFast: boolean;
  isImmune: boolean; // Magic Immune
  
  effects: StatusEffect[];
  stunnedUntil?: number;
  immuneToStunUntil?: number;
  
  // Death Animation State
  isDead?: boolean;
  deathTime?: number;
}

// Phase 4: Projectiles
export interface Projectile {
  id: string;
  x: number;
  y: number;
  z: number;
  targetId: string;
  damage: number;
  sourceType: GemType;
  speed: number;
  color: string;
  isSplash: boolean;
  splashRadius?: number;
  homing: boolean;
  spawnTime: number;
  vx?: number;
  vy?: number;
  vz?: number;
}

export interface VisualEffect {
  id: string;
  type: 'SPAWN' | 'CONFIRM' | 'UPGRADE' | 'DOWNGRADE' | 'DEATH' | 'HIT' | 'GOLD';
  x: number;
  y: number;
  color: string;
}

export type PrayType = 'COLOR' | 'QUALITY';

export interface ActivePray {
  type: PrayType;
  target?: GemType; 
}

export interface GameState {
  grid: GridCell[];
  phase: GamePhase;
  placedGems: string[]; 
  flowField: FlowField;
  enemies: Enemy[];
  projectiles: Projectile[];
  wave: number;
  playerLives: number;
  gold: number;
  researchLevel: number;
  selectedCellId: string | null;
  lastEffect: VisualEffect | null;
  activePray: ActivePray | null;
  
  // Economic Logic
  stonesRemovedCount: number;
  
  initializeGrid: () => void;
  handleCellClick: (x: number, y: number) => void;
  selectCell: (id: string | null) => void;
  confirmKeepGem: () => void;
  combineGems: (cellId: string) => void;
  combineSpecialGem: (recipeResult: GemType, centerCellId: string) => void;
  downgradeGem: (cellId: string) => void;
  upgradeResearch: () => void;
  togglePray: (type: PrayType, target?: GemType) => void;
  hoverCell: (x: number | null, y: number | null) => void;
  startWave: () => void;
  spawnEnemy: () => void;
  spawnProjectile: (projectile: Projectile) => void;
  removeProjectile: (id: string) => void;
  damageEnemy: (id: string, damage: number, attackType: GemType, isSplash?: boolean) => void;
  removeEnemy: (id: string) => void;
  damagePlayer: (amount: number) => void;
  completeWave: () => void;
  updateTowerCooldown: (cellId: string, time: number) => void;
  updateTowerTarget: (cellId: string, targetId: string | null) => void;
  
  // New Economic Actions
  removeStone: (cellId: string) => void;
  addGold: (amount: number, x?: number, y?: number) => void;
}

// Global augmentation for R3F types
// We duplicate this into React.JSX namespace for newer React type definitions
declare global {
  namespace JSX {
    interface IntrinsicElements {
      // Core
      group: any;
      mesh: any;
      instancedMesh: any;
      primitive: any;
      
      // Lights
      ambientLight: any;
      directionalLight: any;
      pointLight: any;
      spotLight: any;
      
      // Cameras
      orthographicCamera: any;
      perspectiveCamera: any;
      
      // Helpers
      gridHelper: any;
      axesHelper: any;
      
      // Geometries
      planeGeometry: any;
      boxGeometry: any;
      sphereGeometry: any;
      cylinderGeometry: any;
      ringGeometry: any;
      circleGeometry: any;
      dodecahedronGeometry: any;
      octahedronGeometry: any;
      tetrahedronGeometry: any;
      icosahedronGeometry: any;
      coneGeometry: any;
      torusKnotGeometry: any;
      
      // Materials
      meshBasicMaterial: any;
      meshStandardMaterial: any;
      meshPhongMaterial: any;
      shaderMaterial: any;
      meshPhysicalMaterial: any;
      
      // Catch-all
      [elemName: string]: any;
    }
  }

  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        // Core
        group: any;
        mesh: any;
        instancedMesh: any;
        primitive: any;
        
        // Lights
        ambientLight: any;
        directionalLight: any;
        pointLight: any;
        spotLight: any;
        
        // Cameras
        orthographicCamera: any;
        perspectiveCamera: any;
        
        // Helpers
        gridHelper: any;
        axesHelper: any;
        
        // Geometries
        planeGeometry: any;
        boxGeometry: any;
        sphereGeometry: any;
        cylinderGeometry: any;
        ringGeometry: any;
        circleGeometry: any;
        dodecahedronGeometry: any;
        octahedronGeometry: any;
        tetrahedronGeometry: any;
        icosahedronGeometry: any;
        coneGeometry: any;
        torusKnotGeometry: any;
        
        // Materials
        meshBasicMaterial: any;
        meshStandardMaterial: any;
        meshPhongMaterial: any;
        shaderMaterial: any;
        meshPhysicalMaterial: any;
        
        // Catch-all
        [elemName: string]: any;
      }
    }
  }
}
