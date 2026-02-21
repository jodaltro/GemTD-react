import React, { useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useEnvironment, Sparkles, useGLTF, useAnimations } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import { useGameStore } from '../../store/useGameStore';
import { CellType, GemType, COLORS, CELL_SIZE, BOARD_OFFSET_X, BOARD_OFFSET_Z, QUALITY_VISUALS, GemQuality, GRID_SIZE, GEM_STATS, GEM_COLORS } from '../../constants';
import { Enemy, GridCell } from '../../types';

// --- Reusable Materials ---
const rockGeo = new THREE.DodecahedronGeometry(CELL_SIZE * 0.35, 0);
const rockMat = new THREE.MeshStandardMaterial({ color: COLORS.rock, flatShading: true, roughness: 0.9 });
const tempBase = new THREE.Object3D();

// --- GEM CONFIG ---
interface GemMaterialConfig {
    color: string;
    emissiveIntensity: number;
}

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
  [GemType.AQUAMARINE]: { color: '#00e5ff', emissiveIntensity: 1.2 },
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

// Preload models
useGLTF.preload('/glb/golem_-_attack.glb');

// Helper smoothstep
function smoothstep(min: number, max: number, value: number): number {
    const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return x * x * (3 - 2 * x);
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

const GolemModel: React.FC<{ 
    cell: GridCell; 
    enemies: Enemy[];
    isSelected: boolean;
    physics: GemMaterialConfig;
    visualConfig: any;
    isOrbType: boolean;
    isSnakeType: boolean;
    envMap: THREE.Texture | null;
}> = ({ cell, enemies, isSelected, physics, visualConfig, isOrbType, isSnakeType, envMap }) => {
    const group = useRef<THREE.Group>(null);
    const modelContainer = useRef<THREE.Group>(null);
    const chestGlowRef = useRef<THREE.Mesh>(null);
    const timeSinceShotRef = useRef<number>(0);
    const spineRef = useRef<THREE.Bone | null>(null);
    const neckRef = useRef<THREE.Bone | null>(null);
    const headRef = useRef<THREE.Bone | null>(null);
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
                        color: isSnakeType ? '#ffff00' : '#ffffff',
                        emissive: isSnakeType ? '#ff0000' : '#ffffff',
                        emissiveIntensity: 5.0,
                        toneMapped: false,
                        roughness: 0.1,
                        metalness: 0.0
                    });
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
    }, [clone, physics, isOrbType, isSnakeType, envMap]);

    useEffect(() => {
        if (isOrbType || isSnakeType) {
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
    }, [cell.lastShot, actions, names, isOrbType, isSnakeType]);

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
                count={isSnakeType ? 0 : visualConfig.glowIntensity * 5}
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
    const quality = (cell.quality || GemQuality.CHIPPED) as GemQuality;
    const visualConfig = QUALITY_VISUALS[quality] || QUALITY_VISUALS[GemQuality.CHIPPED];
    const physics = GEM_PHYSICS[cell.gemType!] || DEFAULT_GEM_PHYSICS;
    const isOrbType = cell.gemType ? ORB_TYPES.includes(cell.gemType) : false;
    const isSnakeType = cell.gemType ? SNAKE_TYPES.includes(cell.gemType) : false;

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
            group.current.scale.setScalar(s);
            if (cell.targetId) {
                const target = enemies.find(e => e.id === cell.targetId);
                if (target && !target.isDead) {
                    const tx = target.x * CELL_SIZE + BOARD_OFFSET_X;
                    const tz = target.y * CELL_SIZE + BOARD_OFFSET_Z;
                    const targetPos = new THREE.Vector3(tx, 0, tz);
                    const currentLook = new THREE.Vector3(0, 0, 1).applyQuaternion(group.current.quaternion).add(group.current.position);
                    const lerpedLook = currentLook.lerp(targetPos, 0.15);
                    group.current.lookAt(lerpedLook.x, 0, lerpedLook.z);
                }
            } else {
                if (!isSnakeType) {
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
                envMap={envMap}
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
