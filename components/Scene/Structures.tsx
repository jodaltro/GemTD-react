import React, { useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useEnvironment, Sparkles, useGLTF, useAnimations } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import { useGameStore } from '../../store/useGameStore';
import { CellType, GemType, COLORS, CELL_SIZE, BOARD_OFFSET_X, BOARD_OFFSET_Z, QUALITY_VISUALS, GemQuality, GRID_SIZE, GEM_STATS, GEM_COLORS } from '../../constants';
import { Enemy, GridCell } from '../../types';
import {
    AQUAMARINE_MIN_FLIGHT_MS,
    AQUAMARINE_PROJECTILE_VISUAL_DELAY_MS,
    AQUAMARINE_RECOVERY_MS,
    AQUAMARINE_WINDUP_MS,
    PROJECTILE_SPEED_GRID_PER_SEC,
} from './attackTimings';

// --- Reusable Materials ---
const rockGeo = new THREE.DodecahedronGeometry(CELL_SIZE * 0.35, 0);
const rockMat = new THREE.MeshStandardMaterial({ color: COLORS.rock, flatShading: true, roughness: 0.9 });
const tempBase = new THREE.Object3D();

// --- GEM CONFIG ---
interface GemMaterialConfig {
    color: string;
    emissiveIntensity: number;
}

type StonefishAimData = {
    hasTarget: boolean;
    localTarget: THREE.Vector3;
    distanceGrid: number;
    targetId: string | null;
};

const DEFAULT_GEM_PHYSICS: GemMaterialConfig = {
    color: '#ffffff', emissiveIntensity: 3.0
};

const GEM_PHYSICS: Record<GemType, GemMaterialConfig> = {
  [GemType.DIAMOND]: { color: '#e0f7fa', emissiveIntensity: 1.0 },
  [GemType.PINK_DIAMOND]: { color: '#f8bbd0', emissiveIntensity: 1.0 },
  [GemType.RUBY]: { color: '#d50000', emissiveIntensity: 1.5 }, 
  [GemType.SAPPHIRE]: { color: '#2962ff', emissiveIntensity: 1.5 }, 
  [GemType.EMERALD]: { color: '#00c853', emissiveIntensity: 1.2 }, 
  [GemType.TOPAZ]: { color: '#ffab00', emissiveIntensity: 1.2 },
  [GemType.AMETHYST]: { color: '#aa00ff', emissiveIntensity: 1.2 },
  [GemType.AQUAMARINE]: { color: '#7fffd4', emissiveIntensity: 1.4 },
  [GemType.OPAL]: { color: '#b2dfdb', emissiveIntensity: 0.8 },
  [GemType.BLACK_OPAL]: { color: '#311b92', emissiveIntensity: 1.5 },
  [GemType.SILVER]: { color: '#eceff1', emissiveIntensity: 0.8 },
  [GemType.GOLD]: { color: '#ffd700', emissiveIntensity: 1.0 },
  [GemType.MALACHITE]: { color: '#1b5e20', emissiveIntensity: 0.8 },
  [GemType.JADE]: { color: '#00bfa5', emissiveIntensity: 0.8 },
  [GemType.STAR_RUBY]: { color: '#b71c1c', emissiveIntensity: 1.5 },
  [GemType.RED_CRYSTAL]: { color: '#ff1744', emissiveIntensity: 1.5 },
  [GemType.DARK_EMERALD]: { color: '#004d40', emissiveIntensity: 0.8 },
  [GemType.URANIUM_238]: { color: '#c6ff00', emissiveIntensity: 2.0 },
  [GemType.BLOOD_STONE]: { color: '#880e4f', emissiveIntensity: 1.0 },
  [GemType.YELLOW_SAPPHIRE]: { color: '#ffff00', emissiveIntensity: 1.0 },
  [GemType.TOURMALINE]: { color: '#d500f9', emissiveIntensity: 1.5 },
};

// Identify Types
const ORB_TYPES = [
    GemType.AMETHYST, GemType.OPAL, GemType.BLACK_OPAL, 
    GemType.URANIUM_238, GemType.TOURMALINE
];

const SNAKE_TYPES = [
    GemType.EMERALD, GemType.DARK_EMERALD
];

const STONEFISH_TYPES = [
    GemType.AQUAMARINE
];

// Preload models
useGLTF.preload('/glb/golem_-_attack.glb');
useGLTF.preload('/glb/diamond.glb');

// Helper smoothstep
function smoothstep(min: number, max: number, value: number): number {
    const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return x * x * (3 - 2 * x);
}

function minimumJerk01(value: number): number {
    const t = THREE.MathUtils.clamp(value, 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
}

// --- Procedural Snake ---
const ProceduralSnake: React.FC<{
    physics: GemMaterialConfig;
    envMap: THREE.Texture | null;
    timeSinceShotRef: React.MutableRefObject<number>;
}> = ({ physics, envMap, timeSinceShotRef }) => {
    const bodyRef = useRef<THREE.Mesh>(null);
    const coreRef = useRef<THREE.Group>(null);
    const groupRef = useRef<THREE.Group>(null);
    const originalPositions = useRef<Float32Array | null>(null);
    const debugLoggedRef = useRef<boolean>(false);
    const strikeStateRef = useRef({ strikeZ: 0, strikeRotation: 0 });

    const bodyGeometry = useMemo(() => {
        const curvePoints = [
            new THREE.Vector3(0, 0, -1.5),
            new THREE.Vector3(0.6, 0, -0.6),
            new THREE.Vector3(-0.3, 0, 0.3),
            new THREE.Vector3(0, 0.3, 0.9),
            new THREE.Vector3(0, 1.2, 0.6),
            new THREE.Vector3(0.15, 2.1, 0.3),
            new THREE.Vector3(0, 2.7, 0.45),
            new THREE.Vector3(0, 3.0, 0.8),
            new THREE.Vector3(0, 3.1, 1.4),
            new THREE.Vector3(0, 3.0, 2.1)
        ];
        const spineCurve = new THREE.CatmullRomCurve3(curvePoints);
        (spineCurve as any).tension = 0.5;

        const getSnakeWidth = (t: number): number => {
            const base = 0.22;
            // === TAIL (0 → 0.18): thin tip grows to body width ===
            if (t <= 0.18) {
                return base * smoothstep(0, 0.18, t);
            }
            // === BODY (0.18 → 0.40): uniform cylinder ===
            if (t <= 0.40) return base;

            // === GRADUAL EXPANSION into HOOD (0.40 → 0.85) ===
            // Uses a single smoothstep over the full range for seamless gradient
            const hoodPeak = 0.85;
            const hoodEnd = 0.92;
            const hoodMaxExtra = 0.9; // Same as original hood

            if (t <= hoodPeak) {
                const expand = smoothstep(0.40, hoodPeak, t);
                return base + expand * hoodMaxExtra;
            }

            // === HOOD CLOSING → SNOUT (0.85 → 0.92) ===
            if (t <= hoodEnd) {
                const close = smoothstep(hoodPeak, hoodEnd, t);
                const peakWidth = base + hoodMaxExtra;
                // Closes to a narrow snout but keeps some width for the bico
                return peakWidth * (1.0 - close * 0.88);
            }

            // === SNOUT TIP (0.92+): pointed forward ===
            const tipClose = smoothstep(0.92, 0.98, t);
            const snoutWidth = (base + hoodMaxExtra) * 0.12;
            return snoutWidth * (1.0 - tipClose * 0.95);
        };

        const getSnakeThickness = (t: number): number => {
            const base = 0.22;
            // === TAIL (0 → 0.18): grows from thin to body ===
            if (t <= 0.18) {
                return base * smoothstep(0, 0.18, t);
            }
            // === BODY (0.18 → 0.40): uniform cylinder (round cross-section) ===
            if (t <= 0.40) return base;

            // === HOOD FLATTENING (0.40 → 0.85): gradually becomes thin & flat ===
            // Original hood was flattenRatio * 0.5 — very thin at peak
            const hoodPeak = 0.85;
            const hoodEnd = 0.92;

            if (t <= hoodPeak) {
                const flatten = smoothstep(0.40, hoodPeak, t);
                return base * (1.0 - flatten * 0.82); // → ~18% of base at peak (very flat)
            }

            // === HOOD CLOSING → SNOUT (0.85 → 0.92): slightly thicker for rounded bico ===
            if (t <= hoodEnd) {
                const close = smoothstep(hoodPeak, hoodEnd, t);
                const peakThick = base * 0.18;
                return peakThick * (1.0 - close * 0.6);
            }

            // === SNOUT TIP (0.92+) ===
            const tipClose = smoothstep(0.92, 0.98, t);
            return base * 0.07 * (1.0 - tipClose * 0.9);
        };

        const geometry = new THREE.BufferGeometry();
        const vertices: number[] = [];
        const normals: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];

        const radialSegments = 32;
        const tubularSegments = 256;

        const frames = spineCurve.computeFrenetFrames(tubularSegments, true);

        for (let i = 0; i <= tubularSegments; i++) {
            const t = i / tubularSegments;
            const pos = spineCurve.getPointAt(t);
            const N = frames.normals[i];
            const B = frames.binormals[i];
            const widthRadius = getSnakeWidth(t);
            const thickRadius = getSnakeThickness(t);
            for (let j = 0; j <= radialSegments; j++) {
                const v = j / radialSegments;
                const angle = v * Math.PI * 2;
                const sin = Math.sin(angle);
                const cos = -Math.cos(angle);
                const vx = pos.x + (B.x * sin * widthRadius) + (N.x * cos * thickRadius);
                const vy = pos.y + (B.y * sin * widthRadius) + (N.y * cos * thickRadius);
                const vz = pos.z + (B.z * sin * widthRadius) + (N.z * cos * thickRadius);
                vertices.push(vx, vy, vz);
                const nx = (B.x * sin) + (N.x * cos);
                const ny = (B.y * sin) + (N.y * cos);
                const nz = (B.z * sin) + (N.z * cos);
                const normalVector = new THREE.Vector3(nx, ny, nz).normalize();
                normals.push(normalVector.x, normalVector.y, normalVector.z);
                uvs.push(v, t);
            }
        }

        for (let i = 0; i < tubularSegments; i++) {
            for (let j = 0; j < radialSegments; j++) {
                const a = (radialSegments + 1) * i + j;
                const b = (radialSegments + 1) * (i + 1) + j;
                const c = (radialSegments + 1) * (i + 1) + (j + 1);
                const d = (radialSegments + 1) * i + (j + 1);
                indices.push(a, b, d);
                indices.push(b, c, d);
            }
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);

        return geometry;
    }, []);

    useLayoutEffect(() => {
        if (bodyRef.current && !originalPositions.current) {
            originalPositions.current = bodyRef.current.geometry.attributes.position.array.slice() as Float32Array;
        }
    }, []);

    const material = useMemo(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 2048;
        canvas.height = 2048;
        const ctx = canvas.getContext('2d')!;

        // Uniform emerald color base
        ctx.fillStyle = physics.color;
        ctx.fillRect(0, 0, 2048, 2048);

        // Subtle crystalline veins (internal gem inclusions)
        for (let i = 0; i < 60; i++) {
            const sx = Math.random() * 2048;
            const sy = Math.random() * 2048;
            const len = 20 + Math.random() * 50;
            const angle = Math.random() * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx + Math.cos(angle) * len, sy + Math.sin(angle) * len);
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.02 + Math.random() * 0.04})`;
            ctx.lineWidth = 0.3 + Math.random() * 0.8;
            ctx.stroke();
        }

        // Sparse mineral inclusions
        for (let i = 0; i < 200; i++) {
            const sx = Math.random() * 2048;
            const sy = Math.random() * 2048;
            const r = 1 + Math.random() * 2;
            ctx.beginPath();
            ctx.arc(sx, sy, r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${0.01 + Math.random() * 0.03})`;
            ctx.fill();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(5, 14);

        // Normal map for surface depth (gemstone roughness)
        const nCanvas = document.createElement('canvas');
        nCanvas.width = 512;
        nCanvas.height = 512;
        const nCtx = nCanvas.getContext('2d')!;
        nCtx.fillStyle = '#8080ff'; // neutral normal
        nCtx.fillRect(0, 0, 512, 512);
        // Add bumps
        for (let i = 0; i < 300; i++) {
            const bx = Math.random() * 512;
            const by = Math.random() * 512;
            const br = 2 + Math.random() * 6;
            const bGrad = nCtx.createRadialGradient(bx, by, 0, bx, by, br);
            bGrad.addColorStop(0, 'rgba(160, 160, 255, 0.5)');
            bGrad.addColorStop(1, 'rgba(128, 128, 255, 0)');
            nCtx.fillStyle = bGrad;
            nCtx.fillRect(bx - br, by - br, br * 2, br * 2);
        }
        const normalTex = new THREE.CanvasTexture(nCanvas);
        normalTex.wrapS = THREE.RepeatWrapping;
        normalTex.wrapT = THREE.RepeatWrapping;
        normalTex.repeat.set(5, 14);

        return new THREE.MeshPhysicalMaterial({
            color: physics.color,
            emissive: physics.color,
            emissiveIntensity: 0.1,
            map: texture,
            normalMap: normalTex,
            normalScale: new THREE.Vector2(0.15, 0.15),
            vertexColors: false,
            metalness: 0.05,
            roughness: 0.08,
            clearcoat: 1.0,
            clearcoatRoughness: 0.02,
            envMap: envMap || undefined,
            envMapIntensity: envMap ? 2.5 : 0,
            sheen: 0.1,
            sheenColor: new THREE.Color(physics.color).multiplyScalar(1.2),
            sheenRoughness: 0.2,
            transparent: true,
            transmission: 0.85,
            opacity: 0.7,
            thickness: 0.8,
            ior: 1.57,
            attenuationColor: new THREE.Color(physics.color),
            attenuationDistance: 1.2,
            specularIntensity: 1.2,
            specularColor: new THREE.Color('#ffffff'),
            side: THREE.DoubleSide,
            depthWrite: false,
        });
    }, [physics.color, envMap]);

    const headMaterial = useMemo(() => {
        return new THREE.MeshPhysicalMaterial({
            color: physics.color,
            emissive: physics.color,
            emissiveIntensity: 0.1,
            metalness: 0.05,
            roughness: 0.08,
            clearcoat: 1.0,
            clearcoatRoughness: 0.02,
            envMap: envMap || undefined,
            envMapIntensity: envMap ? 2.5 : 0,
            transparent: true,
            transmission: 0.85,
            opacity: 0.7,
            thickness: 0.8,
            ior: 1.57,
            attenuationColor: new THREE.Color(physics.color),
            attenuationDistance: 1.2,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
    }, [physics.color, envMap]);

    useFrame((state) => {
        const et = state.clock.getElapsedTime();
        const timeSinceShot = timeSinceShotRef.current ?? 0;
        let strikeZ = 0;
        let strikeRotation = 0;
        let strikeIntensity = 0; // 0 = idle, 1 = peak strike
        const strikeDuration = 400;
        let tNorm = timeSinceShot / strikeDuration;
        if (timeSinceShot < strikeDuration) {
            // Wind-up: slight pullback
            if (tNorm < 0.12) {
                const w = smoothstep(0, 0.12, tNorm);
                strikeZ = -0.3 * w;
                strikeRotation = -0.15 * w;
                strikeIntensity = w * 0.3;
            // Strike forward
            } else if (tNorm < 0.30) {
                const s = smoothstep(0.12, 0.30, tNorm);
                strikeZ = -0.3 + s * 2.8;
                strikeRotation = -0.15 + s * 0.55;
                strikeIntensity = 0.3 + s * 0.7;
            // Return to rest
            } else if (tNorm < 0.65) {
                const r = smoothstep(0.30, 0.65, tNorm);
                strikeZ = 2.5 * (1 - r);
                strikeRotation = 0.40 * (1 - r);
                strikeIntensity = 1.0 * (1 - r);
            }
        } else {
            tNorm = 1;
        }
        strikeStateRef.current = { strikeZ, strikeRotation };

        if (bodyRef.current && originalPositions.current) {
            const posArray = bodyRef.current.geometry.attributes.position.array as Float32Array;
            const origArray = originalPositions.current;

            // Find Y range for height normalization
            const maxY = 3.2;
            const minY = -0.5;
            const yRange = maxY - minY;

            for (let i = 0; i < posArray.length; i += 3) {
                const x = origArray[i];
                const y = origArray[i + 1];
                const z = origArray[i + 2];

                // Ring-based parameter: all vertices in the same ring get the same value
                const vertexIndex = i / 3;
                const ringIndex = Math.floor(vertexIndex / 33); // radialSegments + 1 = 33
                const tParam = ringIndex / 256; // tubularSegments = 256

                // Normalized height: 0 = tail tip, 1 = head tip
                const heightNorm = Math.max(0, Math.min(1, (y - minY) / yRange));

                // --- Idle animation (always active) ---
                const phase = y * 0.5;
                const wave1 = Math.sin(et * 1.2 + phase) * 0.15;
                const wave2 = Math.sin(et * 0.8 + phase * 1.3) * 0.1;
                const verticalFloat = Math.sin(et * 1.5 + phase * 0.8) * 0.12;
                const depthWave = Math.cos(et * 1.0 + phase * 1.2) * 0.1;

                // --- Tail serpentine: ring-based so all verts in a ring move together (no deformation) ---
                const tailFade = 1.0 - smoothstep(0.0, 0.45, tParam); // 1 at tail tip, 0 at mid-body
                const serpentineX = Math.sin(et * 1.8 + tParam * 8.0) * 0.35 * tailFade;
                const serpentineZ = Math.cos(et * 1.4 + tParam * 6.0) * 0.20 * tailFade;
                const serpentineY = Math.sin(et * 1.0 + tParam * 5.0) * 0.08 * tailFade;

                // --- Strike deformation: whole body participates naturally ---
                // tParam goes 0 (tail) → 1 (head), so we use it for smooth full-body motion
                // Head leads forward, body follows with delay, tail counterbalances backward
                const strikeForward = smoothstep(0.2, 1.0, tParam); // 0 at tail → 1 at head (body follows)
                const strikeback = smoothstep(0.25, 0.0, tParam);   // 1 at tail tip → 0 at lower body

                // Forward push: entire upper body moves, intensity grows toward head
                const forwardOffset = strikeZ * strikeForward;
                // Tail counterbalance: slight backward pull
                const backwardOffset = -strikeZ * 0.25 * strikeback;

                // Body wave during strike: a traveling wave that makes the motion look organic
                const strikeWave = Math.sin(tParam * Math.PI) * strikeIntensity * 0.15; // lateral body flex

                // Rotation: whole body tilts, stronger at head
                const bodyTilt = strikeRotation * (tParam * 0.8 + 0.1); // even tail gets a tiny bit
                const rotatedY = y - (y - 1.5) * bodyTilt * 0.3;
                const rotatedZ = z + (y - 1.5) * bodyTilt;

                // Reduce idle wave amplitude during strike for a "tense" feel
                const bodyStraighten = Math.sin(tParam * Math.PI); // peaks at middle body
                const waveScale = 1.0 - strikeIntensity * bodyStraighten * 0.5;

                posArray[i] = x + (wave1 + wave2) * waveScale + serpentineX * (1.0 - strikeIntensity * 0.6) + strikeWave;
                posArray[i + 1] = rotatedY + verticalFloat * (1.0 - strikeIntensity * 0.4) + serpentineY * (1.0 - strikeIntensity * 0.8);
                posArray[i + 2] = rotatedZ + depthWave * waveScale + forwardOffset + backwardOffset + serpentineZ * (1.0 - strikeIntensity * 0.6);
            }
            bodyRef.current.geometry.attributes.position.needsUpdate = true;
            bodyRef.current.geometry.computeVertexNormals();
            if (coreRef.current) {
                const vertexCount = posArray.length / 3;
                const topVerticesCount = Math.floor(vertexCount * 0.02);
                let avgX = 0, avgY = 0, avgZ = 0;
                let count = 0;
                for (let i = vertexCount - topVerticesCount; i < vertexCount; i++) {
                    const idx = i * 3;
                    avgX += posArray[idx];
                    avgY += posArray[idx + 1];
                    avgZ += posArray[idx + 2];
                    count++;
                }
                avgX /= count;
                avgY /= count;
                avgZ /= count;
                coreRef.current.position.set(avgX, avgY, avgZ);
            }
        }
        if (timeSinceShot > 40 && timeSinceShot < 150 && !debugLoggedRef.current) {
            console.log('SNAKE_DEBUG_STRIKE', {
                timeSinceShot,
                tNorm,
                strikeZ,
                strikeRotation,
                headPos: coreRef.current ? coreRef.current.position.toArray() : null,
            });
            debugLoggedRef.current = true;
        }
        if (timeSinceShot > 260) {
            debugLoggedRef.current = false;
        }
    });

    return (
        <group ref={groupRef} scale={0.8} position={[0, 0.5, 0]}>
            <mesh ref={bodyRef} geometry={bodyGeometry} material={material} castShadow receiveShadow />
            <group ref={coreRef} position={[0, 3.2, 0.7]} />
        </group>
    );
};

// --- Procedural Aquamarine (Water Drop Crystal) ---
const ProceduralStonefishLegacy: React.FC<{
    physics: GemMaterialConfig;
    envMap: THREE.Texture | null;
    timeSinceShotRef: React.MutableRefObject<number>;
}> = ({ physics, envMap, timeSinceShotRef }) => {
    const bodyRef = useRef<THREE.Group>(null);
    const droplets = useRef<(THREE.Mesh | null)[]>([]);

    // Pear/drop crystal — pointy bottom, wide round head at top
    const teardropGeo = useMemo(() => {
        const pts: THREE.Vector2[] = [];
        const SEGMENTS = 32;
        for (let i = 0; i <= SEGMENTS; i++) {
            const t = i / SEGMENTS; // 0 = top (pointy tip after PI flip), 1 = bottom (round head after flip)
            let r: number;
            if (t < 0.1) {
                // Thin point (becomes bottom tip visually after rotation)
                r = t / 0.1 * 0.08;
            } else if (t < 0.35) {
                // Gradually widens toward body
                const s = (t - 0.1) / 0.25;
                r = 0.08 + s * 0.25;
            } else if (t < 0.9) {
                // Big round pear head — widest around 65-70%
                const s = (t - 0.35) / 0.55;
                r = 0.33 + Math.sin(s * Math.PI) * 0.35;
            } else {
                // Closes smoothly at bottom of geo (= top of head visually)
                const s = (t - 0.9) / 0.1;
                r = 0.33 * (1 - s);
            }
            const y = t * 1.8 - 0.3;
            pts.push(new THREE.Vector2(r, y));
        }
        pts.push(new THREE.Vector2(0, 1.5));
        return new THREE.LatheGeometry(pts, 32);
    }, []);

    // Crystal material
    const crystalMat = useMemo(() => new THREE.MeshPhysicalMaterial({
        color: '#7fffff',
        emissive: '#00e5ff',
        emissiveIntensity: 0.45,
        metalness: 0.0,
        roughness: 0.02,
        transmission: 0.7,
        thickness: 1.8,
        clearcoat: 1.0,
        clearcoatRoughness: 0.01,
        ior: 1.65,
        sheen: 1.0,
        sheenColor: new THREE.Color('#00ffff'),
        sheenRoughness: 0.15,
        envMap: envMap || undefined,
        envMapIntensity: envMap ? 2.2 : 0,
        toneMapped: false,
    }), [envMap]);

    // Water tendril material — high transmission, glowing liquid
    const waterMat = useMemo(() => new THREE.MeshPhysicalMaterial({
        color: '#c0f8ff',
        emissive: '#00d4ff',
        emissiveIntensity: 0.5,
        metalness: 0.0,
        roughness: 0.0,
        transmission: 0.92,
        thickness: 0.3,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        ior: 1.33, // water IOR
        envMap: envMap || undefined,
        envMapIntensity: envMap ? 1.5 : 0,
        depthWrite: false,
        toneMapped: false,
    }), [envMap]);

    // Tendril config: more segments for smooth fluid curves
    const TENDRIL_SEGMENTS = 14; // per arm — dense chain for smooth liquid flow
    const TENDRIL_COUNT = 4; // 4 tendrils total (2 left, 2 right)
    const DROPLET_COUNT = 16; // splashing drops

    // Catmull-Rom interpolation helper for smooth liquid curves
    const catmullRom = (p0: number, p1: number, p2: number, p3: number, t: number) => {
        const t2 = t * t, t3 = t2 * t;
        return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    };

    // Store refs for all tendrils (4 tendrils × TENDRIL_SEGMENTS each)
    const tendrils = useRef<(THREE.Mesh | null)[][]>([[], [], [], []]);

    useFrame((state) => {
        const et = state.clock.getElapsedTime();
        const timeSinceShot = timeSinceShotRef.current ?? Number.POSITIVE_INFINITY;
        const isAttacking = timeSinceShot < 420;
        const attackT = THREE.MathUtils.clamp(timeSinceShot / 420, 0, 1);
        const attackBurst = isAttacking
            ? (attackT < 0.18 ? attackT / 0.18 : 1 - (attackT - 0.18) / 0.82)
            : 0;

        // Float animation
        if (bodyRef.current) {
            const floatY = 1.2 + Math.sin(et * 1.1) * 0.1;
            bodyRef.current.position.y = THREE.MathUtils.lerp(bodyRef.current.position.y, floatY, 0.1);
            bodyRef.current.rotation.z = Math.sin(et * 0.65) * 0.04;
            bodyRef.current.rotation.x = Math.sin(et * 0.45) * 0.03;
            bodyRef.current.position.z = THREE.MathUtils.lerp(bodyRef.current.position.z, -attackBurst * 0.1, 0.18);
        }

        // === FLUID TENDRIL SIMULATION ===
        // Each tendril uses control points animated with sine harmonics,
        // then Catmull-Rom interpolation creates smooth liquid flow between them.
        const tendrilConfigs = [
            { side: -1, zOff: 0.0,  speed: 1.0, phase: 0.0,   yBase: -0.1 },  // left upper
            { side: -1, zOff: 0.2,  speed: 0.85, phase: 1.5,  yBase: -0.25 }, // left lower
            { side:  1, zOff: 0.0,  speed: 1.0, phase: 0.8,   yBase: -0.1 },  // right upper
            { side:  1, zOff: -0.2, speed: 0.85, phase: 2.3,  yBase: -0.25 }, // right lower
        ];

        for (let tIdx = 0; tIdx < TENDRIL_COUNT; tIdx++) {
            const cfg = tendrilConfigs[tIdx];
            const side = cfg.side;
            const sp = cfg.speed;
            const ph = cfg.phase;

            // Generate 6 control points for the tendril path (animated fluid dynamics)
            const cpCount = 6;
            const cpX: number[] = [], cpY: number[] = [], cpZ: number[] = [];
            for (let c = 0; c < cpCount; c++) {
                const ct = c / (cpCount - 1); // 0..1 along tendril
                const flowPhase = et * sp * 1.6 + ph + c * 0.9;
                const forwardCannon = attackBurst * (0.4 + ct * 2.4);
                const converge = attackBurst * 0.85;

                // X: spreads outward with wave perturbation
                const baseSpread = 0.3 + ct * 0.9;
                const waveX = Math.sin(flowPhase * 1.1) * 0.12 * ct;
                const spread = THREE.MathUtils.lerp(baseSpread, 0.08 + ct * 0.15, converge);
                cpX.push(side * (spread + waveX * (1 - converge)));

                // Y: rises then curves down — gravity-like arc + wave
                const arc = -ct * ct * 0.6 + ct * 0.15; // parabolic droop
                const waveY = Math.sin(flowPhase) * 0.18 * (0.3 + ct * 0.7);
                const turbulence = Math.sin(flowPhase * 2.7 + c * 1.3) * 0.06 * ct;
                cpY.push(cfg.yBase + arc + waveY + turbulence + attackBurst * (0.1 - ct * 0.35));

                // Z: sinusoidal sway — fluid undulation
                const waveZ = Math.sin(flowPhase * 0.7 + c * 0.5) * 0.3 * ct;
                const secondaryZ = Math.cos(flowPhase * 1.9) * 0.08 * ct * ct;
                cpZ.push(cfg.zOff + waveZ + secondaryZ + forwardCannon);
            }

            // Interpolate segments along spline
            for (let i = 0; i < TENDRIL_SEGMENTS; i++) {
                const mesh = tendrils.current[tIdx]?.[i];
                if (!mesh) continue;

                const u = i / (TENDRIL_SEGMENTS - 1); // 0..1
                const splineT = u * (cpCount - 1);
                const idx = Math.min(Math.floor(splineT), cpCount - 2);
                const frac = splineT - idx;

                // Catmull-Rom through control points
                const i0 = Math.max(idx - 1, 0);
                const i1 = idx;
                const i2 = Math.min(idx + 1, cpCount - 1);
                const i3 = Math.min(idx + 2, cpCount - 1);

                const px = catmullRom(cpX[i0], cpX[i1], cpX[i2], cpX[i3], frac);
                const py = catmullRom(cpY[i0], cpY[i1], cpY[i2], cpY[i3], frac);
                const pz = catmullRom(cpZ[i0], cpZ[i1], cpZ[i2], cpZ[i3], frac);

                mesh.position.set(px, py, pz);

                // Fluid-like scaling: thick at base, thins out, with pulsation
                const baseSc = 0.14 * (1 - u * 0.7);
                const pulse = 1 + Math.sin(et * 3.0 + i * 0.8 + ph) * 0.15;
                const cannonPressurize = 1 + attackBurst * (0.35 + u * 0.75);
                const scaleXZ = baseSc * pulse * THREE.MathUtils.lerp(1, 0.75, attackBurst);
                // Stretch along flow direction for connected liquid look
                const scaleY = baseSc * 1.6 * pulse * cannonPressurize;
                mesh.scale.set(scaleXZ, scaleY, scaleXZ);

                // Orient segment along flow (look at next point)
                if (i < TENDRIL_SEGMENTS - 1) {
                    const nextU = (i + 1) / (TENDRIL_SEGMENTS - 1);
                    const nextSplineT = nextU * (cpCount - 1);
                    const nextIdx = Math.min(Math.floor(nextSplineT), cpCount - 2);
                    const nextFrac = nextSplineT - nextIdx;
                    const ni0 = Math.max(nextIdx - 1, 0);
                    const ni1 = nextIdx;
                    const ni2 = Math.min(nextIdx + 1, cpCount - 1);
                    const ni3 = Math.min(nextIdx + 2, cpCount - 1);
                    const nx = catmullRom(cpX[ni0], cpX[ni1], cpX[ni2], cpX[ni3], nextFrac);
                    const ny = catmullRom(cpY[ni0], cpY[ni1], cpY[ni2], cpY[ni3], nextFrac);
                    const nz = catmullRom(cpZ[ni0], cpZ[ni1], cpZ[ni2], cpZ[ni3], nextFrac);
                    // Look in flow direction
                    const dx = nx - px, dy = ny - py, dz = nz - pz;
                    mesh.rotation.set(
                        Math.atan2(dz, Math.sqrt(dx * dx + dy * dy)),
                        0,
                        Math.atan2(dy, dx)
                    );
                }
            }
        }

        // Splashing water droplets — surface tension behavior
        for (let i = 0; i < DROPLET_COUNT; i++) {
            const d = droplets.current[i];
            if (d) {
                const angle = (i / DROPLET_COUNT) * Math.PI * 2 + et * 0.45 + Math.sin(et * 0.3 + i) * 0.5;
                const heightPhase = et * 0.9 + i * 1.2;
                // Some droplets orbit close, some far — surface tension scatter
                const baseRadius = 0.5 + (i % 3) * 0.25;
                const radius = baseRadius + Math.sin(et * 0.6 + i * 2.1) * 0.2;
                // Height: some float near body, some splash up/down
                const driftY = Math.sin(heightPhase) * 0.4 + Math.sin(heightPhase * 2.3) * 0.15;
                d.position.set(
                    Math.cos(angle) * radius,
                    driftY + (i % 2 === 0 ? 0.1 : -0.2),
                    Math.sin(angle) * radius
                );
                // Pulsating scale — like water drops forming/breaking
                const ds = 0.04 + Math.sin(et * 2.5 + i * 1.9) * 0.02;
                const stretch = 1 + Math.abs(Math.sin(et * 1.5 + i * 2.0)) * 0.4;
                d.scale.set(ds, ds * stretch, ds);
            }
        }
    });

    return (
        <group ref={bodyRef}>
            {/* ===== TEARDROP CRYSTAL BODY ===== */}
            <mesh geometry={teardropGeo} material={crystalMat} castShadow
                  position={[0, 0.5, 0]} rotation={[Math.PI, 0, 0]}>
            </mesh>

            {/* ===== FLUID WATER TENDRILS + DROPLETS ===== */}
            <group position={[0, 0.7, 0]}>
                {/* 4 tendrils, each with TENDRIL_SEGMENTS spheres */}
                {Array.from({ length: TENDRIL_COUNT }).map((_, tIdx) => (
                    <group key={`tendril-${tIdx}`}>
                        {Array.from({ length: TENDRIL_SEGMENTS }).map((_, i) => (
                            <mesh key={`t${tIdx}-s${i}`}
                                  ref={(el) => { if (!tendrils.current[tIdx]) tendrils.current[tIdx] = []; tendrils.current[tIdx][i] = el; }}
                                  material={waterMat}>
                                <sphereGeometry args={[1, 10, 8]} />
                            </mesh>
                        ))}
                    </group>
                ))}
                {/* Splashing water droplets */}
                {Array.from({ length: DROPLET_COUNT }).map((_, i) => (
                    <mesh key={`drop-${i}`} ref={(el) => { droplets.current[i] = el; }} material={waterMat}>
                        <sphereGeometry args={[1, 8, 6]} />
                    </mesh>
                ))}
            </group>
        </group>
    );
};

const ProceduralStonefish: React.FC<{
    physics: GemMaterialConfig;
    envMap: THREE.Texture | null;
    timeSinceShotRef: React.MutableRefObject<number>;
    stonefishAimRef: React.MutableRefObject<StonefishAimData>;
}> = ({ physics, envMap, timeSinceShotRef, stonefishAimRef }) => {
    const bodyRef = useRef<THREE.Group>(null);
    const tendrils = useRef<(THREE.Mesh | null)[][]>([[], [], [], []]);
    const droplets = useRef<(THREE.Mesh | null)[]>([]);
    const prevTimeSinceShotRef = useRef<number>(Number.POSITIVE_INFINITY);
    const smoothedTargetRef = useRef(new THREE.Vector3(0, 0.45, 3.0));
    const smoothedTargetVelRef = useRef(new THREE.Vector3());
    const shotLockRef = useRef({
        targetId: null as string | null,
        lockedTargetLocal: new THREE.Vector3(0, 0.45, 3.0),
        distanceGrid: 1,
        flightMs: AQUAMARINE_MIN_FLIGHT_MS,
    });

    const TENDRIL_COUNT = 4;
    const TENDRIL_SEGMENTS = 18;
    const DROPLET_COUNT = 24;
    const INNER_FLUID_COUNT = 18;
    const CONTROL_POINTS = 6;
    const RAW_SAMPLES = 28;

    const fluidGroupOffset = useMemo(() => new THREE.Vector3(0, 0.7, 0), []);
    const nozzleCenter = useMemo(() => new THREE.Vector3(0, -0.05, 0.2), []);
    const upAxis = useMemo(() => new THREE.Vector3(0, 1, 0), []);

    const armConfigs = useMemo(() => ([
        { side: -1, ySlot: 0.30, zSlot: 0.10, phase: 0.0,  base: new THREE.Vector3(-0.34, 0.10, 0.05) },
        { side: -1, ySlot: -0.35, zSlot: -0.06, phase: 1.1, base: new THREE.Vector3(-0.30, -0.16, 0.10) },
        { side:  1, ySlot: 0.30, zSlot: -0.10, phase: 0.55, base: new THREE.Vector3(0.34, 0.10, 0.05) },
        { side:  1, ySlot: -0.35, zSlot: 0.06, phase: 1.75, base: new THREE.Vector3(0.30, -0.16, 0.10) },
    ]), []);

    const teardropGeo = useMemo(() => {
        const pts: THREE.Vector2[] = [];
        const SEGMENTS = 32;
        for (let i = 0; i <= SEGMENTS; i++) {
            const t = i / SEGMENTS;
            let r: number;
            if (t < 0.1) {
                r = (t / 0.1) * 0.08;
            } else if (t < 0.35) {
                const s = (t - 0.1) / 0.25;
                r = 0.08 + s * 0.25;
            } else if (t < 0.9) {
                const s = (t - 0.35) / 0.55;
                r = 0.33 + Math.sin(s * Math.PI) * 0.35;
            } else {
                const s = (t - 0.9) / 0.1;
                r = 0.33 * (1 - s);
            }
            pts.push(new THREE.Vector2(r, t * 1.8 - 0.3));
        }
        pts.push(new THREE.Vector2(0, 1.5));
        return new THREE.LatheGeometry(pts, 32);
    }, []);

    const crystalMat = useMemo(() => new THREE.MeshPhysicalMaterial({
        color: '#7fffff',
        emissive: '#00e5ff',
        emissiveIntensity: 0.26 + physics.emissiveIntensity * 0.015,
        metalness: 0.0,
        roughness: 0.07,
        transmission: 0.7,
        thickness: 1.8,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
        ior: 1.65,
        sheen: 1.0,
        sheenColor: new THREE.Color('#00ffff'),
        sheenRoughness: 0.24,
        envMap: envMap || undefined,
        envMapIntensity: envMap ? 1.5 : 0,
        toneMapped: false,
    }), [envMap, physics.emissiveIntensity]);

    const waterMat = useMemo(() => new THREE.MeshPhysicalMaterial({
        color: '#c0f8ff',
        emissive: '#00d4ff',
        emissiveIntensity: 0.5,
        metalness: 0.0,
        roughness: 0.0,
        transmission: 0.92,
        thickness: 0.3,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        ior: 1.33,
        envMap: envMap || undefined,
        envMapIntensity: envMap ? 1.5 : 0,
        depthWrite: false,
        toneMapped: false,
    }), [envMap]);

    const innerFluidMat = useMemo(() => new THREE.MeshPhysicalMaterial({
        color: '#a7f5ff',
        emissive: '#4fdfff',
        emissiveIntensity: 0.22,
        metalness: 0,
        roughness: 0.03,
        transmission: 0.94,
        thickness: 0.42,
        transparent: true,
        opacity: 0.48,
        ior: 1.33,
        envMap: envMap || undefined,
        envMapIntensity: envMap ? 1.3 : 0,
        depthWrite: false,
        toneMapped: false,
    }), [envMap]);

    const innerFluid = useRef<(THREE.Mesh | null)[]>([]);

    const innerFluidSeeds = useMemo(() => {
        const fract = (v: number) => v - Math.floor(v);
        const hash = (v: number) => fract(Math.sin(v * 91.371 + 12.73) * 47453.5453);
        return Array.from({ length: INNER_FLUID_COUNT }, (_, i) => ({
            phase: hash(i * 0.71 + 0.9) * Math.PI * 2,
            radius: 0.06 + hash(i * 1.27 + 3.2) * 0.24,
            swirl: 0.6 + hash(i * 1.91 + 1.4) * 1.4,
            yBias: -0.55 + hash(i * 2.23 + 5.7) * 1.1,
            scale: 0.04 + hash(i * 0.57 + 7.5) * 0.055,
            wobble: 0.05 + hash(i * 1.37 + 6.6) * 0.14,
        }));
    }, []);

    const armScratch = useMemo(() => (
        Array.from({ length: TENDRIL_COUNT }, () => ({
            control: Array.from({ length: CONTROL_POINTS }, () => new THREE.Vector3()),
            raw: Array.from({ length: RAW_SAMPLES }, () => new THREE.Vector3()),
            uniform: Array.from({ length: TENDRIL_SEGMENTS }, () => new THREE.Vector3()),
            tangents: Array.from({ length: TENDRIL_SEGMENTS }, () => new THREE.Vector3(0, 0, 1)),
            lengths: new Float32Array(RAW_SAMPLES),
            tip: new THREE.Vector3(),
            tipDir: new THREE.Vector3(0, 0, 1),
        }))
    ), []);

    const dropletSeeds = useMemo(() => {
        const fract = (v: number) => v - Math.floor(v);
        const hash = (v: number) => fract(Math.sin(v * 12.9898 + 78.233) * 43758.5453123);
        return Array.from({ length: DROPLET_COUNT }, (_, i) => ({
            arm: i % TENDRIL_COUNT,
            orbitPhase: hash(i + 0.3) * Math.PI * 2,
            orbitRadius: 0.38 + hash(i * 1.31 + 2.1) * 0.7,
            heightBias: -0.28 + hash(i * 0.73 + 4.2) * 0.8,
            lag: 0.12 + hash(i * 1.9 + 9.7) * 0.95,
            phase: hash(i * 2.7 + 1.7) * Math.PI * 2,
            splash: hash(i * 3.9 + 0.4),
        }));
    }, []);

    const temp = useMemo(() => ({
        desiredTarget: new THREE.Vector3(),
        chosenTarget: new THREE.Vector3(),
        bodyPos: new THREE.Vector3(),
        fluidTarget: new THREE.Vector3(),
        attackTarget: new THREE.Vector3(),
        tip: new THREE.Vector3(),
        idleTip: new THREE.Vector3(),
        dir: new THREE.Vector3(),
        tmp1: new THREE.Vector3(),
        tmp2: new THREE.Vector3(),
        tmp3: new THREE.Vector3(),
        tangent: new THREE.Vector3(),
        dropIdle: new THREE.Vector3(),
        dropTrail: new THREE.Vector3(),
        dropSplash: new THREE.Vector3(),
        jitter: new THREE.Vector3(),
    }), []);

    const catmullRom = (p0: number, p1: number, p2: number, p3: number, t: number) => {
        const t2 = t * t;
        const t3 = t2 * t;
        return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    };

    const sampleSplinePoint = (out: THREE.Vector3, cps: THREE.Vector3[], u: number) => {
        const splineT = u * (cps.length - 1);
        const idx = Math.min(Math.floor(splineT), cps.length - 2);
        const frac = splineT - idx;
        const i0 = Math.max(idx - 1, 0);
        const i1 = idx;
        const i2 = Math.min(idx + 1, cps.length - 1);
        const i3 = Math.min(idx + 2, cps.length - 1);
        out.set(
            catmullRom(cps[i0].x, cps[i1].x, cps[i2].x, cps[i3].x, frac),
            catmullRom(cps[i0].y, cps[i1].y, cps[i2].y, cps[i3].y, frac),
            catmullRom(cps[i0].z, cps[i1].z, cps[i2].z, cps[i3].z, frac),
        );
    };

    const resampleArm = (armIdx: number) => {
        const a = armScratch[armIdx];
        for (let i = 0; i < RAW_SAMPLES; i++) {
            sampleSplinePoint(a.raw[i], a.control, i / (RAW_SAMPLES - 1));
        }
        a.lengths[0] = 0;
        for (let i = 1; i < RAW_SAMPLES; i++) {
            a.lengths[i] = a.lengths[i - 1] + a.raw[i].distanceTo(a.raw[i - 1]);
        }
        const totalLen = a.lengths[RAW_SAMPLES - 1];
        if (totalLen < 1e-5) {
            for (let i = 0; i < TENDRIL_SEGMENTS; i++) {
                a.uniform[i].copy(a.control[0]);
                a.tangents[i].set(0, 0, 1);
            }
            a.tip.copy(a.control[a.control.length - 1]);
            a.tipDir.set(0, 0, 1);
            return;
        }
        let cursor = 1;
        for (let i = 0; i < TENDRIL_SEGMENTS; i++) {
            const targetLen = totalLen * (i / (TENDRIL_SEGMENTS - 1));
            while (cursor < RAW_SAMPLES - 1 && a.lengths[cursor] < targetLen) cursor++;
            const hi = cursor;
            const lo = Math.max(0, hi - 1);
            const l0 = a.lengths[lo];
            const l1 = a.lengths[hi];
            const alpha = THREE.MathUtils.clamp((targetLen - l0) / Math.max(l1 - l0, 1e-5), 0, 1);
            a.uniform[i].copy(a.raw[lo]).lerp(a.raw[hi], alpha);
        }
        for (let i = 0; i < TENDRIL_SEGMENTS; i++) {
            const prev = a.uniform[Math.max(0, i - 1)];
            const next = a.uniform[Math.min(TENDRIL_SEGMENTS - 1, i + 1)];
            a.tangents[i].copy(next).sub(prev);
            if (a.tangents[i].lengthSq() < 1e-6) a.tangents[i].set(0, 0, 1);
        }
        a.tip.copy(a.uniform[TENDRIL_SEGMENTS - 1]);
        a.tipDir.copy(a.tangents[TENDRIL_SEGMENTS - 1]).normalize();
    };

    const springDampVec3 = (current: THREE.Vector3, velocity: THREE.Vector3, target: THREE.Vector3, omega: number, dt: number) => {
        if (dt <= 0) return;
        const f = 1 + 2 * dt * omega;
        const oo = omega * omega;
        const hoo = dt * oo;
        const hhoo = dt * hoo;
        const detInv = 1 / (f + hhoo);

        const cx = current.x, cy = current.y, cz = current.z;
        const vx = velocity.x, vy = velocity.y, vz = velocity.z;
        const tx = target.x, ty = target.y, tz = target.z;

        current.x = (f * cx + dt * vx + hhoo * tx) * detInv;
        current.y = (f * cy + dt * vy + hhoo * ty) * detInv;
        current.z = (f * cz + dt * vz + hhoo * tz) * detInv;

        velocity.x = (vx + hoo * (tx - cx)) * detInv;
        velocity.y = (vy + hoo * (ty - cy)) * detInv;
        velocity.z = (vz + hoo * (tz - cz)) * detInv;
    };

    const hash01 = (v: number) => {
        const n = Math.sin(v * 12.9898 + 78.233) * 43758.5453123;
        return n - Math.floor(n);
    };

    useFrame((state, delta) => {
        const et = state.clock.getElapsedTime();
        const dt = Math.min(delta, 0.05);
        const timeSinceShot = timeSinceShotRef.current ?? Number.POSITIVE_INFINITY;
        const prevTimeSinceShot = prevTimeSinceShotRef.current;
        const shotTriggered = timeSinceShot < prevTimeSinceShot && timeSinceShot < (AQUAMARINE_PROJECTILE_VISUAL_DELAY_MS + 60);

        const aim = stonefishAimRef.current;
        temp.desiredTarget.copy(aim.hasTarget ? aim.localTarget : shotLockRef.current.lockedTargetLocal);
        springDampVec3(smoothedTargetRef.current, smoothedTargetVelRef.current, temp.desiredTarget, 12, dt);

        if (shotTriggered) {
            shotLockRef.current.lockedTargetLocal.copy(aim.hasTarget ? aim.localTarget : smoothedTargetRef.current);
            shotLockRef.current.targetId = aim.targetId;
            shotLockRef.current.distanceGrid = Math.max(aim.distanceGrid || 0.6, 0.6);
            shotLockRef.current.flightMs = Math.max(
                AQUAMARINE_MIN_FLIGHT_MS,
                (shotLockRef.current.distanceGrid / PROJECTILE_SPEED_GRID_PER_SEC) * 1000
            );
        }
        prevTimeSinceShotRef.current = timeSinceShot;

        const flightMs = shotLockRef.current.flightMs;
        const impactMs = AQUAMARINE_PROJECTILE_VISUAL_DELAY_MS + flightMs;
        const recoverEndMs = impactMs + AQUAMARINE_RECOVERY_MS;
        const attackWindowMs = Math.max(420, recoverEndMs);
        const isAttack = timeSinceShot < attackWindowMs;

        const windupT = minimumJerk01(timeSinceShot / AQUAMARINE_WINDUP_MS);
        const preDelayT = minimumJerk01((timeSinceShot - AQUAMARINE_WINDUP_MS) / Math.max(1, AQUAMARINE_PROJECTILE_VISUAL_DELAY_MS - AQUAMARINE_WINDUP_MS));
        const flightT = minimumJerk01((timeSinceShot - AQUAMARINE_PROJECTILE_VISUAL_DELAY_MS) / Math.max(flightMs, 1));
        const recoverT = minimumJerk01((timeSinceShot - impactMs) / AQUAMARINE_RECOVERY_MS);

        let pressurize = 0;
        if (timeSinceShot < AQUAMARINE_WINDUP_MS) pressurize = windupT;
        else if (timeSinceShot < AQUAMARINE_PROJECTILE_VISUAL_DELAY_MS) pressurize = 1 - preDelayT * 0.08;
        else if (timeSinceShot < impactMs) pressurize = 0.92 - flightT * 0.62;
        else if (timeSinceShot < recoverEndMs) pressurize = 0.3 * (1 - recoverT);
        pressurize = THREE.MathUtils.clamp(pressurize, 0, 1);

        let travelAlpha = 0;
        if (timeSinceShot >= AQUAMARINE_PROJECTILE_VISUAL_DELAY_MS && timeSinceShot < impactMs) {
            travelAlpha = flightT;
        } else if (timeSinceShot >= impactMs && timeSinceShot < recoverEndMs) {
            const rebound = Math.sin(recoverT * Math.PI * 2.2) * Math.exp(-3.2 * recoverT) * 0.08;
            travelAlpha = THREE.MathUtils.clamp(1 - recoverT + rebound, 0, 1.05);
        }
        const releaseStretch = THREE.MathUtils.clamp((timeSinceShot - AQUAMARINE_PROJECTILE_VISUAL_DELAY_MS) / 75, 0, 1) * (1 - THREE.MathUtils.clamp((timeSinceShot - impactMs) / 120, 0, 1));
        const impactPulse = timeSinceShot >= impactMs ? Math.exp(-(timeSinceShot - impactMs) / 130) : 0;
        const attackEnergy = THREE.MathUtils.clamp(Math.max(pressurize * 0.85, travelAlpha, impactPulse), 0, 1.2);

        temp.chosenTarget.copy(isAttack ? shotLockRef.current.lockedTargetLocal : smoothedTargetRef.current);

        if (bodyRef.current) {
            const floatY = 1.2 + Math.sin(et * 1.1) * 0.1;
            bodyRef.current.position.y = THREE.MathUtils.lerp(bodyRef.current.position.y, floatY - pressurize * 0.03 + impactPulse * 0.02, 0.14);
            bodyRef.current.position.z = THREE.MathUtils.lerp(bodyRef.current.position.z, -(pressurize * 0.12 + releaseStretch * 0.05) + impactPulse * 0.04, 0.18);
            bodyRef.current.position.x = THREE.MathUtils.lerp(bodyRef.current.position.x, -temp.chosenTarget.x * 0.018 * attackEnergy, 0.08);
            bodyRef.current.rotation.z = Math.sin(et * 0.65) * 0.04 + temp.chosenTarget.x * 0.012;
            bodyRef.current.rotation.x = Math.sin(et * 0.45) * 0.03 - pressurize * 0.06 + impactPulse * 0.03;
        }

        temp.bodyPos.copy(bodyRef.current?.position ?? new THREE.Vector3(0, 1.2, 0));
        temp.fluidTarget.copy(temp.chosenTarget).sub(temp.bodyPos).sub(fluidGroupOffset);
        temp.fluidTarget.x = THREE.MathUtils.clamp(temp.fluidTarget.x, -3.2, 3.2);
        temp.fluidTarget.y = THREE.MathUtils.clamp(temp.fluidTarget.y, -0.6, 2.4);
        temp.fluidTarget.z = Math.max(temp.fluidTarget.z, 1.2);

        waterMat.emissiveIntensity = 0.46 + attackEnergy * 0.68 + impactPulse * 0.25;
        waterMat.opacity = THREE.MathUtils.clamp(0.62 + attackEnergy * 0.2, 0.55, 0.9);
        waterMat.thickness = 0.25 + attackEnergy * 0.18;
        crystalMat.emissiveIntensity = 0.24 + pressurize * 0.08 + impactPulse * 0.05;
        innerFluidMat.emissiveIntensity = 0.18 + attackEnergy * 0.25 + impactPulse * 0.14;
        innerFluidMat.opacity = THREE.MathUtils.clamp(0.38 + attackEnergy * 0.22, 0.34, 0.66);

        for (let tIdx = 0; tIdx < TENDRIL_COUNT; tIdx++) {
            const cfg = armConfigs[tIdx];
            const a = armScratch[tIdx];
            const cps = a.control;
            const convergence = THREE.MathUtils.clamp(Math.max(pressurize, travelAlpha) + releaseStretch * 0.2, 0, 1);
            const ph = cfg.phase;

            cps[0].copy(cfg.base);

            temp.attackTarget.copy(temp.fluidTarget);
            temp.attackTarget.x += cfg.side * 0.08 * (1 - convergence);
            temp.attackTarget.y += cfg.ySlot * 0.08 * (1 - convergence);
            temp.attackTarget.z += cfg.zSlot * 0.05 * (1 - convergence);
            if (impactPulse > 0.001) {
                temp.tmp1.copy(temp.attackTarget).sub(nozzleCenter);
                if (temp.tmp1.lengthSq() > 1e-6) {
                    temp.tmp1.normalize();
                    temp.attackTarget.addScaledVector(temp.tmp1, impactPulse * 0.15 * (0.9 + tIdx * 0.05));
                }
            }

            temp.idleTip.set(
                cfg.side * (0.95 + Math.sin(et * 0.9 + ph) * 0.14),
                cfg.ySlot * 0.52 + Math.sin(et * 1.6 + ph * 1.7) * 0.16,
                1.18 + cfg.zSlot * 0.3 + Math.cos(et * 1.2 + ph) * 0.2
            );

            temp.tip.copy(temp.idleTip).lerp(temp.attackTarget, THREE.MathUtils.clamp(travelAlpha, 0, 1));
            if (timeSinceShot < AQUAMARINE_PROJECTILE_VISUAL_DELAY_MS) {
                temp.tip.lerp(nozzleCenter, pressurize * 0.68);
                temp.tip.z -= pressurize * (0.2 + Math.abs(cfg.ySlot) * 0.07);
                temp.tip.x += cfg.side * pressurize * 0.045;
            }

            temp.dir.copy(temp.tip).sub(nozzleCenter);
            const dirLen = Math.max(temp.dir.length(), 1e-4);
            temp.dir.divideScalar(dirLen);

            const idleNoiseX = Math.sin(et * 2.1 + ph * 1.9) * 0.14 * (1 - convergence);
            const idleNoiseY = Math.cos(et * 1.8 + ph * 1.2) * 0.1 * (1 - convergence);
            const cannonNarrow = 1 - convergence * 0.9;

            cps[1].set(
                cfg.base.x + cfg.side * (0.38 + idleNoiseX),
                cfg.base.y + 0.15 + cfg.ySlot * 0.18 + idleNoiseY * 0.6,
                cfg.base.z + 0.18 + Math.sin(et * 1.4 + ph) * 0.06
            ).lerp(
                temp.tmp1.copy(nozzleCenter)
                    .addScaledVector(temp.dir, 0.16)
                    .addScaledVector(temp.tmp2.set(1, 0, 0), cfg.side * (0.24 * cannonNarrow))
                    .addScaledVector(temp.tmp3.set(0, 1, 0), cfg.ySlot * (0.14 * cannonNarrow)),
                convergence
            );

            cps[2].set(
                cfg.base.x + cfg.side * (0.72 + Math.sin(et * 1.8 + ph * 0.7) * 0.2 * (1 - convergence)),
                cfg.base.y + 0.26 + cfg.ySlot * 0.28 + Math.cos(et * 2.0 + ph) * 0.12 * (1 - convergence),
                0.7 + Math.sin(et * 1.2 + ph) * 0.2
            ).lerp(
                temp.tmp1.copy(nozzleCenter)
                    .addScaledVector(temp.dir, 0.46 + travelAlpha * 0.28)
                    .addScaledVector(temp.tmp2.set(1, 0, 0), cfg.side * (0.16 * cannonNarrow))
                    .addScaledVector(temp.tmp3.set(0, 1, 0), cfg.ySlot * (0.1 * cannonNarrow)),
                convergence
            );

            cps[3].set(
                cfg.base.x + cfg.side * (0.9 + (hash01((tIdx + 1) * 11.3) * 2 - 1) * 0.05),
                cfg.ySlot * 0.45 + Math.sin(et * 1.25 + ph * 1.1) * 0.14 * (1 - convergence),
                1.0 + Math.cos(et * 1.4 + ph * 0.9) * 0.22
            ).lerp(
                temp.tmp1.copy(nozzleCenter)
                    .addScaledVector(temp.dir, dirLen * (0.42 + 0.25 * THREE.MathUtils.clamp(travelAlpha, 0, 1)))
                    .addScaledVector(temp.tmp2.set(1, 0, 0), cfg.side * (0.09 * cannonNarrow))
                    .addScaledVector(temp.tmp3.set(0, 1, 0), cfg.ySlot * (0.07 * cannonNarrow)),
                THREE.MathUtils.clamp(travelAlpha * 0.9 + pressurize * 0.55, 0, 1)
            );

            cps[4].copy(temp.idleTip).lerp(cps[3], 0.25).lerp(
                temp.tmp1.copy(temp.tip)
                    .addScaledVector(temp.dir, -(0.27 + (1 - THREE.MathUtils.clamp(travelAlpha, 0, 1)) * 0.16))
                    .addScaledVector(temp.tmp2.set(1, 0, 0), cfg.side * (0.06 * cannonNarrow))
                    .addScaledVector(temp.tmp3.set(0, 1, 0), cfg.ySlot * (0.05 * cannonNarrow)),
                THREE.MathUtils.clamp(travelAlpha + pressurize * 0.35, 0, 1)
            );
            cps[5].copy(temp.tip);

            for (let c = 1; c < cps.length - 1; c++) {
                const amp = (0.07 + c * 0.015) * (1 - convergence * 0.85);
                const hz = et * (1.45 + c * 0.35) + ph * 2.0;
                cps[c].x += Math.sin(hz + c * 0.3) * amp;
                cps[c].y += Math.cos(hz * 1.15 + c * 0.2) * amp * 0.75;
                cps[c].z += Math.sin(hz * 0.85 + c * 0.5) * amp * 0.55;
            }

            resampleArm(tIdx);

            for (let i = 0; i < TENDRIL_SEGMENTS; i++) {
                const mesh = tendrils.current[tIdx]?.[i];
                if (!mesh) continue;
                const u = i / (TENDRIL_SEGMENTS - 1);
                const point = a.uniform[i];
                const tangent = a.tangents[i];

                mesh.position.copy(point);
                temp.tangent.copy(tangent);
                if (temp.tangent.lengthSq() > 1e-6) {
                    mesh.quaternion.setFromUnitVectors(upAxis, temp.tangent.normalize());
                }

                const taper = 0.135 * (1 - u * 0.72);
                const pulse = 1 + Math.sin(et * 3.2 + i * 0.75 + ph * 2.0) * 0.08;
                const bulgeCenter = THREE.MathUtils.clamp(0.12 + travelAlpha * 0.78, 0.1, 0.95);
                const sigma = 0.08 + 0.07 * (1 - THREE.MathUtils.clamp(travelAlpha, 0, 1));
                const bulge = 1 + attackEnergy * 0.85 * Math.exp(-Math.pow((u - bulgeCenter) / sigma, 2));
                const necking = 1 - pressurize * 0.45 * Math.exp(-Math.pow((u - 0.88) / 0.12, 2));
                const radial = Math.max(0.02, taper * pulse * bulge * necking);
                const stretch = radial * (1.35 + attackEnergy * 0.35) * (1 + releaseStretch * (0.65 + u * 0.6));
                mesh.scale.set(radial, stretch, radial);
            }
        }

        for (let i = 0; i < DROPLET_COUNT; i++) {
            const d = droplets.current[i];
            if (!d) continue;

            const seed = dropletSeeds[i];
            const arm = armScratch[seed.arm];
            const tipDir = arm.tipDir.lengthSq() > 1e-6 ? arm.tipDir : temp.tmp1.set(0, 0, 1);

            const idleAngle = seed.orbitPhase + et * (0.42 + seed.splash * 0.3) + Math.sin(et * 0.33 + seed.phase) * 0.35;
            const idleRadius = seed.orbitRadius + Math.sin(et * 0.9 + seed.phase * 1.1) * 0.08;
            temp.dropIdle.set(
                Math.cos(idleAngle) * idleRadius,
                seed.heightBias + Math.sin(et * 1.15 + seed.phase) * 0.22,
                Math.sin(idleAngle) * idleRadius * 0.85
            );

            const trailMix = THREE.MathUtils.clamp(attackEnergy * 1.1, 0, 1);
            const lag = seed.lag * (0.35 + (1 - THREE.MathUtils.clamp(travelAlpha, 0, 1)) * 0.6);
            const swirl = et * (4.8 + seed.splash * 2.2) + seed.phase * 2.0;
            temp.jitter.set(
                Math.sin(swirl + i) * (0.05 + seed.splash * 0.08),
                Math.cos(swirl * 1.2 + i * 0.7) * (0.05 + seed.splash * 0.1),
                Math.sin(swirl * 0.85 + i * 0.4) * (0.06 + seed.splash * 0.08)
            );
            temp.dropTrail.copy(arm.tip).addScaledVector(tipDir, -lag).addScaledVector(temp.jitter, 0.45 + impactPulse * 0.8);

            temp.dropSplash.copy(temp.fluidTarget);
            if (impactPulse > 0.001) {
                const angle = seed.orbitPhase + et * 6.0;
                const rad = (0.16 + seed.splash * 0.42) * impactPulse;
                temp.dropSplash.x += Math.cos(angle) * rad;
                temp.dropSplash.y += 0.03 + Math.abs(Math.sin(angle * 1.1 + seed.phase)) * (0.09 + seed.splash * 0.16) * impactPulse;
                temp.dropSplash.z += Math.sin(angle) * rad * 0.85;
            }

            const splashMix = THREE.MathUtils.clamp(impactPulse * (0.35 + seed.splash * 0.9), 0, 1);
            temp.tmp1.copy(temp.dropIdle).lerp(temp.dropTrail, trailMix).lerp(temp.dropSplash, splashMix);
            d.position.copy(temp.tmp1);

            const ds = 0.03 + (0.012 + seed.splash * 0.018) * (0.5 + trailMix * 0.9 + impactPulse * 0.8);
            const stretch = 1 + Math.abs(Math.sin(et * 2.3 + seed.phase * 2.4)) * (0.35 + attackEnergy * 0.4);
            d.scale.set(ds, ds * stretch, ds);
            d.visible = true;
        }

        for (let i = 0; i < INNER_FLUID_COUNT; i++) {
            const blob = innerFluid.current[i];
            if (!blob) continue;
            const seed = innerFluidSeeds[i];
            const pulse = 0.35 + attackEnergy * 0.65;
            const phase = et * (0.9 + seed.swirl) + seed.phase;
            const orbit = seed.radius + Math.sin(phase * 1.7) * seed.wobble * (1 + attackEnergy * 0.4);
            const x = Math.cos(phase) * orbit;
            const z = Math.sin(phase * 0.92 + seed.phase * 0.37) * orbit * 0.9;
            const y = seed.yBias * 0.42 + Math.sin(phase * 1.2 + seed.phase) * 0.08 + Math.cos(et * 1.4 + i) * 0.03;
            blob.position.set(x, y, z);
            const squash = 1 + Math.sin(phase * 2.1) * 0.25 * pulse;
            blob.scale.set(seed.scale * (0.85 + pulse * 0.3), seed.scale * squash, seed.scale * (1.05 - (squash - 1) * 0.5));
            blob.visible = true;
        }
    });

    return (
        <group ref={bodyRef}>
            <mesh geometry={teardropGeo} material={crystalMat} castShadow position={[0, 0.5, 0]} rotation={[Math.PI, 0, 0]} />

            <group position={[0, 0.5, 0]} rotation={[Math.PI, 0, 0]}>
                {Array.from({ length: INNER_FLUID_COUNT }).map((_, i) => (
                    <mesh key={`stonefish-inner-fluid-${i}`} ref={(el) => { innerFluid.current[i] = el; }} material={innerFluidMat}>
                        <sphereGeometry args={[1, 14, 12]} />
                    </mesh>
                ))}
            </group>

            <group position={[0, 0.7, 0]}>
                {Array.from({ length: TENDRIL_COUNT }).map((_, tIdx) => (
                    <group key={`tendril-cannon-${tIdx}`}>
                        {Array.from({ length: TENDRIL_SEGMENTS }).map((_, i) => (
                            <mesh
                                key={`tc${tIdx}-s${i}`}
                                ref={(el) => {
                                    if (!tendrils.current[tIdx]) tendrils.current[tIdx] = [];
                                    tendrils.current[tIdx][i] = el;
                                }}
                                material={waterMat}
                            >
                                <sphereGeometry args={[1, 10, 8]} />
                            </mesh>
                        ))}
                    </group>
                ))}

                {Array.from({ length: DROPLET_COUNT }).map((_, i) => (
                    <mesh key={`stonefish-drop-${i}`} ref={(el) => { droplets.current[i] = el; }} material={waterMat}>
                        <sphereGeometry args={[1, 8, 6]} />
                    </mesh>
                ))}
            </group>
        </group>
    );
};

const ProceduralDiamondCrown: React.FC<{
    physics: GemMaterialConfig;
    envMap: THREE.Texture | null;
    timeSinceShotRef: React.MutableRefObject<number>;
}> = ({ physics, envMap, timeSinceShotRef }) => {
    const groupRef = useRef<THREE.Group>(null);
    const { scene } = useGLTF('/glb/diamond.glb');

    const crownMaterial = useMemo(() => new THREE.MeshPhysicalMaterial({
        color: physics.color,
        emissive: '#c7f6ff',
        emissiveIntensity: 0.12,
        metalness: 0.04,
        roughness: 0.06,
        transmission: 0.88,
        thickness: 1.2,
        clearcoat: 1,
        clearcoatRoughness: 0.01,
        ior: 2.05,
        envMap: envMap || undefined,
        envMapIntensity: envMap ? 2.6 : 0,
        toneMapped: false,
    }), [envMap, physics.color]);

    const crown = useMemo(() => {
        const root = new THREE.Group();
        const ringCount = 8;

        for (let i = 0; i < ringCount; i++) {
            const angle = (i / ringCount) * Math.PI * 2;
            const base = SkeletonUtils.clone(scene);
            base.position.set(Math.cos(angle) * 0.52, 0.88, Math.sin(angle) * 0.52);
            base.rotation.set(0, -angle + Math.PI * 0.5, 0);
            base.scale.setScalar(0.17);
            root.add(base);

            const top = SkeletonUtils.clone(scene);
            top.position.set(Math.cos(angle) * 0.62, 1.18, Math.sin(angle) * 0.62);
            top.rotation.set(-Math.PI * 0.12, -angle, 0);
            top.scale.setScalar(0.11 + (i % 2 === 0 ? 0.03 : 0));
            root.add(top);
        }

        const center = SkeletonUtils.clone(scene);
        center.position.set(0, 1.22, 0);
        center.scale.setScalar(0.2);
        root.add(center);

        root.traverse((obj) => {
            if ((obj as THREE.Mesh).isMesh) {
                const mesh = obj as THREE.Mesh;
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                mesh.material = crownMaterial;
            }
        });

        return root;
    }, [scene, crownMaterial]);

    useFrame((state) => {
        const et = state.clock.getElapsedTime();
        const timeSinceShot = timeSinceShotRef.current;
        const firePulse = timeSinceShot < 220 ? 1 - (timeSinceShot / 220) : 0;

        if (groupRef.current) {
            groupRef.current.rotation.y = et * 0.26;
            groupRef.current.position.y = 0.04 + Math.sin(et * 1.6) * 0.02;
            const pulseScale = 1 + firePulse * 0.14;
            groupRef.current.scale.setScalar(pulseScale);
        }

        crownMaterial.emissiveIntensity = 0.12 + firePulse * 0.55 + Math.sin(et * 2.8) * 0.04;
    });

    return (
        <group ref={groupRef}>
            <primitive object={crown} />
            <Sparkles
                count={18}
                scale={[2.0, 1.4, 2.0]}
                size={3}
                speed={0.4}
                opacity={0.4}
                color={physics.color}
                position={[0, 1.0, 0]}
            />
        </group>
    );
};

const GolemModel: React.FC<{ 
    cell: GridCell; 
    enemies: Enemy[];
    isSelected: boolean;
    physics: GemMaterialConfig;
    visualConfig: any;
    isOrbType: boolean;
    isSnakeType: boolean;
    isStonefish: boolean;
    envMap: THREE.Texture | null;
    stonefishAimRef: React.MutableRefObject<StonefishAimData>;
}> = ({ cell, enemies, isSelected, physics, visualConfig, isOrbType, isSnakeType, isStonefish, envMap, stonefishAimRef }) => {
    const group = useRef<THREE.Group>(null);
    const modelContainer = useRef<THREE.Group>(null);
    const chestGlowRef = useRef<THREE.Mesh>(null);
    const timeSinceShotRef = useRef<number>(0);
    const spineRef = useRef<THREE.Bone | null>(null);
    const neckRef = useRef<THREE.Bone | null>(null);
    const headRef = useRef<THREE.Bone | null>(null);
    const isDiamondCrown = cell.gemType === GemType.DIAMOND;
    const { scene, animations } = useGLTF('/glb/golem_-_attack.glb');
    const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
    const { actions, names } = useAnimations(animations, clone);

    useLayoutEffect(() => {
        clone.traverse((obj) => {
            if (obj.isBone) {
                const name = obj.name.toLowerCase();
                const bone = obj as THREE.Bone;
                if (isOrbType) {
                    if (
                        name.includes('leg') || name.includes('thigh') || name.includes('shin') || name.includes('foot') || name.includes('toe') ||
                        name.includes('arm') || name.includes('hand') || name.includes('finger') || name.includes('shoulder') || name.includes('clavicle')
                    ) {
                        obj.scale.setScalar(0.001); 
                    }
                    if (name.includes('head') || name.includes('neck')) {
                        obj.scale.set(0.6, 1.6, 0.6); 
                    }
                    if (name.includes('spine') || name.includes('chest')) {
                        obj.scale.set(1.2, 1.0, 1.2);
                    }
                }
                if (isSnakeType) {
                    if (
                        name.includes('leg') || name.includes('thigh') || name.includes('shin') || name.includes('foot') || name.includes('toe') ||
                        name.includes('arm') || name.includes('hand') || name.includes('finger') || name.includes('shoulder') || name.includes('clavicle')
                    ) {
                        obj.scale.setScalar(0.001); 
                    }
                    if (name.includes('spine')) {
                        if (!name.includes('1') && !name.includes('2')) {
                            obj.scale.set(2.5, 1.3, 2.5);
                            spineRef.current = bone;
                        } else {
                            obj.scale.set(1.5, 1.2, 1.5);
                        }
                    }
                    if (name.includes('neck')) {
                        obj.scale.set(5.0, 1.0, 0.4); 
                        neckRef.current = bone;
                    }
                    if (name.includes('head')) {
                        obj.scale.set(0.2, 1.0, 2.5); 
                        headRef.current = bone;
                    }
                }
                // Stonefish uses procedural geometry — no bone manipulation needed
            }
            if ((obj as THREE.Mesh).isMesh) {
                const mesh = obj as THREE.Mesh;
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                const prevMat = mesh.material as THREE.MeshStandardMaterial;
                const matName = prevMat.name ? prevMat.name.toLowerCase() : '';
                const meshName = mesh.name ? mesh.name.toLowerCase() : '';
                const isEye = /eye|glow|lens|visor|mask|face/i.test(meshName) || /eye|glow|lens|visor/i.test(matName);
                if (isEye) {
                    mesh.material = new THREE.MeshStandardMaterial({
                        color: isSnakeType ? '#ffff00' : isStonefish ? '#0088ff' : '#ffffff',
                        emissive: isSnakeType ? '#ff0000' : isStonefish ? '#0066ff' : '#ffffff',
                        emissiveIntensity: isStonefish ? 8.0 : 5.0,
                        toneMapped: false,
                        roughness: 0.1,
                        metalness: 0.0
                    });
                } else if (isStonefish) {
                    const crystalMat = new THREE.MeshPhysicalMaterial({
                        color: '#7fffff',
                        emissive: '#00e5ff',
                        emissiveIntensity: 0.45,
                        metalness: 0.0,
                        roughness: 0.02,
                        transmission: 0.7,
                        thickness: 1.8,
                        clearcoat: 1.0,
                        clearcoatRoughness: 0.01,
                        ior: 1.65,
                        sheen: 1.0,
                        sheenColor: new THREE.Color('#00ffff'),
                        sheenRoughness: 0.15,
                        envMap: envMap || undefined,
                        envMapIntensity: envMap ? 2.2 : 0,
                        toneMapped: false,
                    });
                    mesh.material = crystalMat;
                    mesh.material.needsUpdate = true;
                } else {
                    const newMat = new THREE.MeshPhysicalMaterial({
                        color: physics.color,
                        emissive: physics.color,
                        emissiveIntensity: 0.2,
                        metalness: 0.4,
                        roughness: 0.2,
                        clearcoat: 1.0,
                        clearcoatRoughness: 0.1,
                        envMap: envMap || undefined,
                        envMapIntensity: envMap ? 1.0 : 0,
                    });
                    mesh.material = newMat;
                    mesh.material.needsUpdate = true;
                }
            }
        });
    }, [clone, physics, isOrbType, isSnakeType, isStonefish, envMap]);

    useEffect(() => {
        if (isOrbType || isSnakeType || isStonefish) {
            Object.values(actions).forEach(a => (a as THREE.AnimationAction | null)?.stop());
            return;
        }
        const attackName = names.find(n => /attack/i.test(n)) || names[0];
        const attackAction = actions[attackName];
        const idleName = names.find(n => /idle/i.test(n));
        const idleAction = idleName ? actions[idleName] : null;
        if (!attackAction) return;
        const now = Date.now();
        const timeSinceShot = now - (cell.lastShot || 0);
        const shotJustFired = cell.lastShot && timeSinceShot < 100; 
        if (shotJustFired) {
            attackAction.reset();
            attackAction.setLoop(THREE.LoopOnce, 1);
            attackAction.clampWhenFinished = true;
            attackAction.setEffectiveTimeScale(2.0);
            attackAction.fadeIn(0.05).play();
            if (idleAction) idleAction.fadeOut(0.05);
        } else if (!attackAction.isRunning()) {
            if (idleAction) {
                idleAction.reset().fadeIn(0.2).play();
            } else {
                attackAction.reset().play();
                attackAction.paused = true; 
                attackAction.time = 0;
            }
        }
    }, [cell.lastShot, actions, names, isOrbType, isSnakeType, isStonefish]);

    useFrame((state) => {
        const et = state.clock.getElapsedTime();
        const now = Date.now();
        const timeSinceShot = now - (cell.lastShot || 0);
        if (timeSinceShotRef.current !== undefined) {
            timeSinceShotRef.current = timeSinceShot;
        }
        if (isOrbType && modelContainer.current) {
            const floatY = 0.0 + Math.sin(et * 2.0) * 0.15; 
            modelContainer.current.position.y = THREE.MathUtils.lerp(modelContainer.current.position.y, floatY, 0.1);
            let recoilZ = 0;
            let recoilScale = 1.0;
            if (timeSinceShot < 300) { 
                const t = timeSinceShot / 300; 
                if (t < 0.2) {
                    const kick = t / 0.2;
                    recoilZ = -0.3 * kick;
                    recoilScale = 1.0 + (0.3 * kick); 
                } else {
                    const recover = (t - 0.2) / 0.8;
                    recoilZ = -0.3 * (1 - recover);
                    recoilScale = 1.3 - (0.3 * recover);
                }
            }
            modelContainer.current.position.z = recoilZ;
            modelContainer.current.scale.set(1, 1, recoilScale); 
        }
        if (isSnakeType && modelContainer.current) {
             modelContainer.current.position.y = -0.8; 
             if (spineRef.current && neckRef.current && headRef.current) {
                 const swaySpeed = 1.5;
                 spineRef.current.rotation.x = -0.6;
                 spineRef.current.rotation.z = Math.sin(et * swaySpeed) * 0.1;
                 neckRef.current.rotation.x = 0.8;
                 neckRef.current.rotation.z = Math.sin(et * swaySpeed + 1.2) * 0.2;
                 let targetHeadY = 0.8;
                 let targetHeadZ = 0.0;
                 let targetHeadX = 0.0;
                 let headRotX = -0.2;
                 if (timeSinceShot < 400) {
                     const t = timeSinceShot / 400;
                     let lungeIntensity = 0;
                     if (t < 0.3) {
                         lungeIntensity = Math.sin((t / 0.3) * (Math.PI / 2));
                     } else {
                         lungeIntensity = 1 - Math.sin(((t - 0.3) / 0.7) * (Math.PI / 2));
                     }
                     targetHeadZ += lungeIntensity * 2.5;
                     targetHeadY -= lungeIntensity * 0.5;
                     headRotX = -0.2 - (lungeIntensity * 0.5); 
                 }
                 headRef.current.position.set(targetHeadX, targetHeadY, targetHeadZ);
                 headRef.current.rotation.x = headRotX;
                 headRef.current.rotation.y = Math.sin(et * swaySpeed) * 0.2;
             }
        }
    });

    if (isSnakeType) {
        return (
            <ProceduralSnake 
                physics={physics}
                envMap={envMap}
                timeSinceShotRef={timeSinceShotRef}
            />
        );
    }

    if (isStonefish) {
        return (
            <ProceduralStonefish
                physics={physics}
                envMap={envMap}
                timeSinceShotRef={timeSinceShotRef}
                stonefishAimRef={stonefishAimRef}
            />
        );
    }

    if (isDiamondCrown) {
        return (
            <ProceduralDiamondCrown
                physics={physics}
                envMap={envMap}
                timeSinceShotRef={timeSinceShotRef}
            />
        );
    }

    return (
        <group ref={group}>
            <group ref={modelContainer}>
                <primitive object={clone} />
                {isOrbType && (
                    <mesh ref={chestGlowRef} position={[0, 1.2, 0.3]} visible={false}>
                         <sphereGeometry args={[0.4, 16, 16]} />
                         <meshBasicMaterial color={physics.color} transparent opacity={1} blending={THREE.AdditiveBlending} />
                    </mesh>
                )}
            </group>
            <Sparkles 
                count={(isSnakeType || isStonefish) ? 0 : visualConfig.glowIntensity * 5}
                scale={[2, 3, 2]} 
                size={4}
                speed={0.4}
                opacity={0.3}
                color={physics.color}
                position={[0, 1.0, 0]}
            />
        </group>
    );
};

const Tower: React.FC<{ 
    cell: GridCell; 
    envMap: THREE.Texture | null;
    enemies: Enemy[];
    isSelected: boolean;
}> = ({ cell, envMap, enemies, isSelected }) => {
    const group = useRef<THREE.Group>(null);
    const lookTargetWorldRef = useRef(new THREE.Vector3());
    const currentLookRef = useRef(new THREE.Vector3());
    const stonefishLocalTargetRef = useRef(new THREE.Vector3());
    const stonefishAimRef = useRef<StonefishAimData>({
        hasTarget: false,
        localTarget: new THREE.Vector3(0, 0.45, 3.0),
        distanceGrid: 0,
        targetId: null,
    });
    const quality = (cell.quality || GemQuality.CHIPPED) as GemQuality;
    const visualConfig = QUALITY_VISUALS[quality] || QUALITY_VISUALS[GemQuality.CHIPPED];
    const physics = GEM_PHYSICS[cell.gemType!] || DEFAULT_GEM_PHYSICS;
    const isOrbType    = cell.gemType ? ORB_TYPES.includes(cell.gemType)       : false;
    const isSnakeType  = cell.gemType ? SNAKE_TYPES.includes(cell.gemType)     : false;
    const isStonefish  = cell.gemType ? STONEFISH_TYPES.includes(cell.gemType) : false;

    useFrame((state) => {
        const et = state.clock.getElapsedTime();
        if (group.current) {
            const x = cell.x * CELL_SIZE + BOARD_OFFSET_X;
            const z = cell.y * CELL_SIZE + BOARD_OFFSET_Z;
            group.current.position.set(x, 0, z);
            let s = visualConfig.scale * 0.35; 
            if (isSelected) s *= 1.1 + Math.sin(et * 8) * 0.05;
            if (isOrbType) s *= 0.9;
            if (isSnakeType) s *= 0.7;
            if (isStonefish) s *= 1.0;
            group.current.scale.setScalar(s);
            if (cell.targetId) {
                const target = enemies.find(e => e.id === cell.targetId);
                if (target && !target.isDead) {
                    const tx = target.x * CELL_SIZE + BOARD_OFFSET_X;
                    const ty = target.isFlying ? 1.5 : 0.4;
                    const tz = target.y * CELL_SIZE + BOARD_OFFSET_Z;
                    const targetPos = lookTargetWorldRef.current.set(tx, 0, tz);
                    const currentLook = currentLookRef.current.set(0, 0, 1).applyQuaternion(group.current.quaternion).add(group.current.position);
                    const lerpedLook = currentLook.lerp(targetPos, 0.15);
                    group.current.lookAt(lerpedLook.x, 0, lerpedLook.z);

                    if (isStonefish) {
                        const localTarget = stonefishLocalTargetRef.current.set(tx, ty, tz);
                        group.current.worldToLocal(localTarget);
                        stonefishAimRef.current.hasTarget = true;
                        stonefishAimRef.current.localTarget.copy(localTarget);
                        stonefishAimRef.current.distanceGrid = Math.sqrt(
                            Math.pow(target.x - cell.x, 2) + Math.pow(target.y - cell.y, 2)
                        );
                        stonefishAimRef.current.targetId = target.id;
                    }
                } else if (isStonefish) {
                    stonefishAimRef.current.hasTarget = false;
                    stonefishAimRef.current.targetId = null;
                }
            } else {
                if (isStonefish) {
                    stonefishAimRef.current.hasTarget = false;
                    stonefishAimRef.current.targetId = null;
                }
                if (!isSnakeType && !isStonefish) {
                     group.current.rotation.y = Math.sin(et * 0.5) * 0.2;
                }
            }
        }
    });

    return (
        <group ref={group}>
            <GolemModel 
                cell={cell}
                enemies={enemies}
                isSelected={isSelected}
                physics={physics}
                visualConfig={visualConfig}
                isOrbType={isOrbType}
                isSnakeType={isSnakeType}
                isStonefish={isStonefish}
                envMap={envMap}
                stonefishAimRef={stonefishAimRef}
            />
        </group>
    );
};

export const Structures: React.FC = () => {
    const grid = useGameStore((state) => state.grid);
    const enemies = useGameStore((state) => state.enemies);
    const selectedCellId = useGameStore((state) => state.selectedCellId);
    const envMap = useEnvironment({ preset: 'city' });
    const rockRef = useRef<THREE.InstancedMesh>(null);
    const rocks = useMemo(() => grid.filter(c => c.type === CellType.ROCK), [grid]);
    const towers = useMemo(() => grid.filter(c => c.type === CellType.TOWER), [grid]);

    useLayoutEffect(() => {
      if (!rockRef.current) return;
      rockRef.current.count = rocks.length;
      rocks.forEach((rock, i) => {
          tempBase.position.set(
              rock.x * CELL_SIZE + BOARD_OFFSET_X, 
              0.2, 
              rock.y * CELL_SIZE + BOARD_OFFSET_Z
          );
          tempBase.rotation.set(rock.x * 123, rock.y * 456, rock.x + rock.y); 
          const scale = 1 + Math.sin(rock.x * 13 + rock.y * 7) * 0.2;
          tempBase.scale.setScalar(scale);
          tempBase.updateMatrix();
          rockRef.current!.setMatrixAt(i, tempBase.matrix);
      });
      rockRef.current.instanceMatrix.needsUpdate = true;
    }, [rocks]);

    return (
      <group>
          <instancedMesh 
              ref={rockRef} 
              args={[rockGeo, rockMat, GRID_SIZE * GRID_SIZE]} 
              castShadow 
              receiveShadow
              frustumCulled={false}
          />

          {towers.map(cell => (
              <Tower 
                  key={cell.id} 
                  cell={cell} 
                  envMap={envMap as THREE.Texture | null} 
                  enemies={enemies}
                  isSelected={cell.id === selectedCellId}
              />
          ))}
      </group>
    );
};
