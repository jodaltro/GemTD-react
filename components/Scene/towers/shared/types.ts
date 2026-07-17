import * as THREE from 'three';

export interface GemMaterialConfig {
    color: string;
    emissiveIntensity: number;
}

export type StonefishAimData = {
    hasTarget: boolean;
    localTarget: THREE.Vector3;
    distanceGrid: number;
    targetId: string | null;
};

export type DiamondAimData = {
    hasTarget: boolean;
    localTarget: THREE.Vector3;
    targetId: string | null;
};

export function smoothstep(min: number, max: number, value: number): number {
    const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return x * x * (3 - 2 * x);
}

export function minimumJerk01(value: number): number {
    const t = THREE.MathUtils.clamp(value, 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
}
