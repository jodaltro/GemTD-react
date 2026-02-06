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
    GemType.EMERALD, GemType.MALACHITE, GemType.JADE, GemType.DARK_EMERALD
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
    const SHOW_DEBUG_COLORS = true;

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
            new THREE.Vector3(0, 3.0, 0.6),
            new THREE.Vector3(0, 3.2, 0.7)
        ];
        const spineCurve = new THREE.CatmullRomCurve3(curvePoints);
        (spineCurve as any).tension = 0.5;

        const getSnakeWidth = (t: number): number => {
            const baseWidth = 0.35;
            if (t >= 0.92) {
                return baseWidth * 0.001;
            }
            const hoodStart = 0.65;
            const hoodPeak = 0.85;
            const hoodEnd = 0.92;
            if (t >= hoodStart && t < hoodEnd) {
                let hoodFactor = 0;
                if (t <= hoodPeak) {
                    hoodFactor = smoothstep(hoodStart, hoodPeak, t);
                } else {
                    hoodFactor = 1.0 - smoothstep(hoodPeak, hoodEnd, t);
                }
                let widthVal = baseWidth + (hoodFactor * 0.9);
                if (t >= 0.9 && t < 0.92) {
                    const trim = smoothstep(0.9, 0.92, t);
                    widthVal *= (1 - trim * 0.35);
                }
                return widthVal;
            }
            if (t > 0.3 && t < hoodStart) {
                const shrinkFactor = smoothstep(0.3, hoodStart, t);
                return baseWidth * (1.3 - shrinkFactor * 0.3);
            }
            if (t > 0.15 && t <= 0.3) {
                const growth = smoothstep(0.15, 0.3, t);
                return baseWidth * (1.0 + growth * 0.3);
            }
            if (t <= 0.15) {
                const thinning = smoothstep(0, 0.15, t);
                return baseWidth * (0.4 + thinning * 0.6);
            }
            return baseWidth;
        };

        const getSnakeThickness = (t: number): number => {
            const baseThickness = 0.35;
            const width = getSnakeWidth(t);
            if (t >= 0.92) {
                return baseThickness * 0.001;
            }
            if (width > baseThickness * 1.1 && t >= 0.65 && t < 0.92) {
                const flattenRatio = baseThickness / width;
                let thickVal = baseThickness * flattenRatio * 0.5;
                if (t >= 0.9 && t < 0.92) {
                    const trim = smoothstep(0.9, 0.92, t);
                    thickVal *= (1 - trim * 0.4);
                }
                return thickVal;
            }
            if (t > 0.3 && t < 0.65) {
                const shrinkFactor = smoothstep(0.3, 0.65, t);
                return baseThickness * (1.3 - shrinkFactor * 0.3);
            }
            if (t > 0.15 && t <= 0.3) {
                const growth = smoothstep(0.15, 0.3, t);
                return baseThickness * (1.0 + growth * 0.3);
            }
            if (t <= 0.15) {
                const thinning = smoothstep(0, 0.15, t);
                return baseThickness * (0.4 + thinning * 0.6);
            }
            return baseThickness;
        };

        const geometry = new THREE.BufferGeometry();
        const vertices: number[] = [];
        const normals: number[] = [];
        const uvs: number[] = [];
        const colors: number[] = [];
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
                const sectionColor = new THREE.Color();
                if (t < 0.1) {
                    sectionColor.set('#ff3333');
                } else if (t < 0.2) {
                    sectionColor.set('#ff7f2a');
                } else if (t < 0.32) {
                    sectionColor.set('#33aaff');
                } else if (t < 0.44) {
                    sectionColor.set('#1e7ad3');
                } else if (t < 0.56) {
                    sectionColor.set('#00c6a2');
                } else if (t < 0.68) {
                    sectionColor.set('#00e6c0');
                } else if (t < 0.78) {
                    sectionColor.set('#ffd93d');
                } else if (t < 0.86) {
                    sectionColor.set('#c2ff3d');
                } else if (t < 0.92) {
                    sectionColor.set('#9bff8a');
                } else {
                    sectionColor.set('#cc66ff');
                }
                colors.push(sectionColor.r, sectionColor.g, sectionColor.b);
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
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
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
        const gradient = ctx.createLinearGradient(0, 0, 0, 2048);
        gradient.addColorStop(0, physics.color);
        gradient.addColorStop(0.6, physics.color);
        gradient.addColorStop(1, '#1a1a1a');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 2048, 2048);
        const scaleSize = 24;
        const scaleRows = Math.ceil(2048 / scaleSize) + 2;
        const scaleCols = Math.ceil(2048 / scaleSize) + 2;
        for (let row = 0; row < scaleRows; row++) {
            for (let col = 0; col < scaleCols; col++) {
                const offset = (row % 2 === 0) ? 0 : scaleSize / 2;
                const x = col * scaleSize + offset;
                const y = row * scaleSize;
                ctx.save();
                ctx.translate(x, y);
                ctx.beginPath();
                ctx.ellipse(0, 0, scaleSize * 0.42, scaleSize * 0.48, 0, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
                ctx.lineWidth = 1.5;
                ctx.stroke();
                const scaleGradient = ctx.createRadialGradient(
                    -scaleSize * 0.15, -scaleSize * 0.15, 0,
                    0, 0, scaleSize * 0.5
                );
                scaleGradient.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
                scaleGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.08)');
                scaleGradient.addColorStop(1, 'rgba(0, 0, 0, 0.1)');
                ctx.fillStyle = scaleGradient;
                ctx.fill();
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
                ctx.lineWidth = 0.5;
                for (let i = -3; i <= 3; i++) {
                    ctx.beginPath();
                    ctx.moveTo(i * 2, -scaleSize * 0.4);
                    ctx.lineTo(i * 2, scaleSize * 0.4);
                    ctx.stroke();
                }
                ctx.restore();
            }
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(6, 18);
        return new THREE.MeshPhysicalMaterial({
            color: SHOW_DEBUG_COLORS ? '#ffffff' : physics.color,
            emissive: SHOW_DEBUG_COLORS ? '#000000' : physics.color,
            emissiveIntensity: SHOW_DEBUG_COLORS ? 0.0 : 0.2,
            map: SHOW_DEBUG_COLORS ? null : texture,
            vertexColors: true,
            metalness: SHOW_DEBUG_COLORS ? 0.0 : 0.15,
            roughness: SHOW_DEBUG_COLORS ? 0.65 : 0.4,
            clearcoat: SHOW_DEBUG_COLORS ? 0.0 : 0.6,
            clearcoatRoughness: SHOW_DEBUG_COLORS ? 1.0 : 0.25,
            envMap: SHOW_DEBUG_COLORS ? undefined : envMap || undefined,
            envMapIntensity: SHOW_DEBUG_COLORS ? 0 : (envMap ? 1.2 : 0),
            side: THREE.DoubleSide,
        });
    }, [physics.color, envMap]);

    const headMaterial = useMemo(() => {
        return new THREE.MeshPhysicalMaterial({
            color: physics.color,
            emissive: physics.color,
            emissiveIntensity: 0.3,
            metalness: 0.5,
            roughness: 0.25,
            clearcoat: 1.0,
            clearcoatRoughness: 0.1,
            envMap: envMap || undefined,
            envMapIntensity: envMap ? 1.2 : 0,
        });
    }, [physics.color, envMap]);

    useFrame((state) => {
        const et = state.clock.getElapsedTime();
        const timeSinceShot = timeSinceShotRef.current ?? 0;
        let strikeZ = 0;
        let strikeRotation = 0;
        const strikeDuration = 300;
        let tNorm = timeSinceShot / strikeDuration;
        if (timeSinceShot < strikeDuration) {
            if (tNorm < 0.1) {
                const w = smoothstep(0, 0.1, tNorm);
                strikeZ = -0.25 * w;
                strikeRotation = -0.12 * w;
            } else if (tNorm < 0.28) {
                const s = smoothstep(0.1, 0.28, tNorm);
                strikeZ = -0.25 + s * 2.4;
                strikeRotation = -0.12 + s * 0.48;
            } else if (tNorm < 0.45) {
                const r = smoothstep(0.28, 0.45, tNorm);
                strikeZ = 2.15 * (1 - r);
                strikeRotation = 0.36 * (1 - r);
            }
        } else {
            tNorm = 1;
        }
        strikeStateRef.current = { strikeZ, strikeRotation };

        if (bodyRef.current && originalPositions.current) {
            const posArray = bodyRef.current.geometry.attributes.position.array as Float32Array;
            const origArray = originalPositions.current;
            for (let i = 0; i < posArray.length; i += 3) {
                const x = origArray[i];
                const y = origArray[i + 1];
                const z = origArray[i + 2];
                const phase = y * 0.5;
                const wave1 = Math.sin(et * 1.2 + phase) * 0.15;
                const wave2 = Math.sin(et * 0.8 + phase * 1.3) * 0.1;
                const verticalFloat = Math.sin(et * 1.5 + phase * 0.8) * 0.12;
                const depthWave = Math.cos(et * 1.0 + phase * 1.2) * 0.1;
                const heightRatio = Math.max(0, Math.min(1, (y - 0.5) / 2.7));
                const strikeFalloff = smoothstep(0, 0.6, heightRatio);
                const strikeOffset = strikeZ * strikeFalloff;
                const rotationEffect = strikeRotation * strikeFalloff;
                const rotatedY = y - (y - 1.5) * rotationEffect * 0.3;
                const rotatedZ = z + (y - 1.5) * rotationEffect;
                posArray[i] = x + wave1 + wave2;
                posArray[i + 1] = rotatedY + verticalFloat;
                posArray[i + 2] = rotatedZ + depthWave + strikeOffset;
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
