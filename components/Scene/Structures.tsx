
import React, { useMemo, useRef, useEffect, useLayoutEffect, useState } from 'react';
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

// Preload the GLB to avoid loading it multiple times
useGLTF.preload('/glb/golem_-_attack.glb');

// --- GOLEM GLB TOWER (Shared Model) ---
const GolemModel: React.FC<{ 
    cell: GridCell; 
    enemies: Enemy[];
    isSelected: boolean;
    physics: GemMaterialConfig;
    visualConfig: any;
    isOrbType: boolean;
    isSnakeType: boolean;
}> = ({ cell, enemies, isSelected, physics, visualConfig, isOrbType, isSnakeType }) => {
    const group = useRef<THREE.Group>(null);
    const modelContainer = useRef<THREE.Group>(null);
    const chestGlowRef = useRef<THREE.Mesh>(null);
    
    // Bone References for procedural animation
    const spineRef = useRef<THREE.Bone | null>(null);
    const neckRef = useRef<THREE.Bone | null>(null);
    const headRef = useRef<THREE.Bone | null>(null);
    
    // Load GLB
    const { scene, animations } = useGLTF('/glb/golem_-_attack.glb');
    const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
    const { actions, names } = useAnimations(animations, clone);

    // --- BONE & MATERIAL MODIFICATION ---
    useLayoutEffect(() => {
        clone.traverse((obj) => {
            if (obj.isBone) {
                const name = obj.name.toLowerCase();
                const bone = obj as THREE.Bone;

                // 1. ORB LOGIC (Floating Construct)
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

                // 2. SNAKE LOGIC (Naja Cobra)
                if (isSnakeType) {
                     // Hide all limbs BUT KEEP HIPS (Root of spine)
                     if (
                        name.includes('leg') || name.includes('thigh') || name.includes('shin') || name.includes('foot') || name.includes('toe') ||
                        name.includes('arm') || name.includes('hand') || name.includes('finger') || name.includes('shoulder') || name.includes('clavicle')
                    ) {
                        obj.scale.setScalar(0.001); 
                    }
                    
                    // Body (Spine): MASSIVE TRUNK
                    if (name.includes('spine')) {
                         if (!name.includes('1') && !name.includes('2')) {
                             // Base Spine - Wide base
                             obj.scale.set(2.5, 1.3, 2.5);
                             spineRef.current = bone;
                         } else {
                             // Upper Spines
                             obj.scale.set(1.5, 1.2, 1.5);
                         }
                    }

                    // Neck: THE HOOD 
                    if (name.includes('neck')) {
                        // Wide hood (4.5x width), flattened
                        obj.scale.set(5.0, 1.0, 0.4); 
                        neckRef.current = bone;
                    }
                    
                    // Head: Restore shape
                    if (name.includes('head')) {
                         // Compensate for Neck's scale
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
                        color: isSnakeType ? '#ffff00' : '#ffffff', // Yellow eyes for snakes
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
                        metalness: 0.4, // Metallic scales
                        roughness: 0.2, // Shiny scales
                        clearcoat: 1.0, // Wet look
                        clearcoatRoughness: 0.1,
                        envMapIntensity: 2.0,
                    });
                    mesh.material = newMat;
                }
            }
        });
    }, [clone, physics, isOrbType, isSnakeType]);

    // --- ANIMATION LOGIC ---
    useEffect(() => {
        if (isOrbType || isSnakeType) {
            // Disable default animations for procedural types to avoid fighting controls
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

    // --- FRAME LOOP (Recoil / Posture) ---
    useFrame((state) => {
        const et = state.clock.getElapsedTime();
        const now = Date.now();
        const timeSinceShot = now - (cell.lastShot || 0);

        // --- ORB LOGIC ---
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

        // --- SNAKE POSTURE & ANIMATION ---
        if (isSnakeType && modelContainer.current) {
             // 1. Position: Sink it down so hips are buried
             modelContainer.current.position.y = -0.8; 

             // 2. Procedural Animation (Sinuous Movement)
             if (spineRef.current && neckRef.current && headRef.current) {
                 const swaySpeed = 1.5;
                 
                 // Base Spine: STABLE TRUNK
                 spineRef.current.rotation.x = -0.6; // Slightly back
                 spineRef.current.rotation.z = Math.sin(et * swaySpeed) * 0.1; // Very subtle sway at base

                 // Neck: THE HOOD (Floating)
                 neckRef.current.rotation.x = 0.8; // Forward
                 neckRef.current.rotation.z = Math.sin(et * swaySpeed + 1.2) * 0.2; // Counter sway

                 // --- DISCONNECTED HEAD LOGIC ---
                 // We manually control the position to make it look floating/detached
                 // Default "Floating" Position relative to parent bone
                 let targetHeadY = 0.8; // Hovering above neck
                 let targetHeadZ = 0.0;
                 let targetHeadX = 0.0;
                 let headRotX = -0.2; // Look slightly down

                 // --- ATTACK LUNGE ("Bote") ---
                 // Triggered when shooting (duration increased to 400ms for visibility)
                 if (timeSinceShot < 400) {
                     const t = timeSinceShot / 400; // 0.0 to 1.0
                     
                     // Lunge Intensity Curve: Sharp out, smooth back
                     let lungeIntensity = 0;
                     if (t < 0.3) {
                         lungeIntensity = Math.sin((t / 0.3) * (Math.PI / 2)); // 0 to 1
                     } else {
                         lungeIntensity = 1 - Math.sin(((t - 0.3) / 0.7) * (Math.PI / 2)); // 1 to 0
                     }
                     
                     // LUNGE MOTION: Move Position Z (Forward) and Y (Down)
                     targetHeadZ += lungeIntensity * 2.5; // Strike far forward
                     targetHeadY -= lungeIntensity * 0.5; // Dip down slightly
                     
                     // Head Angle: Snap up to bite
                     headRotX = -0.2 - (lungeIntensity * 0.5); 
                 }

                 // Apply Position (This disconnects it visually from strict skeletal hierarchy)
                 headRef.current.position.set(targetHeadX, targetHeadY, targetHeadZ);
                 headRef.current.rotation.x = headRotX;
                 
                 // Head Look: Sways slightly with time
                 headRef.current.rotation.y = Math.sin(et * swaySpeed) * 0.2;
             }
        }
    });

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
                count={visualConfig.glowIntensity * 5}
                scale={[2, 3, 2]} 
                size={4}
                speed={0.4}
                opacity={0.3}
                color={physics.color}
                position={[0, 1.0, 0]}
            />
        </group>
    );
}

// --- MAIN TOWER CONTAINER ---
const Tower: React.FC<{ 
    cell: GridCell; 
    envMap: THREE.Texture;
    enemies: Enemy[];
    isSelected: boolean;
}> = ({ cell, enemies, isSelected }) => {
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
            if (isSnakeType) s *= 1.4; // Snake needs to be bigger to look intimidating

            group.current.scale.setScalar(s);

            // Look At Logic
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
                // Snake sways in bone logic, group rotation is minimal
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
  
    // Compute Rocks
    const rocks = useMemo(() => grid.filter(c => c.type === CellType.ROCK), [grid]);
    // Compute Towers
    const towers = useMemo(() => grid.filter(c => c.type === CellType.TOWER), [grid]);
  
    // Update Rocks Instance Mesh
    useLayoutEffect(() => {
      if (!rockRef.current) return;
      rockRef.current.count = rocks.length;
      
      rocks.forEach((rock, i) => {
          tempBase.position.set(
              rock.x * CELL_SIZE + BOARD_OFFSET_X, 
              0.2, 
              rock.y * CELL_SIZE + BOARD_OFFSET_Z
          );
          // Random rotation for variety
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
          {/* Rocks (Instanced) */}
          <instancedMesh 
              ref={rockRef} 
              args={[rockGeo, rockMat, GRID_SIZE * GRID_SIZE]} 
              castShadow 
              receiveShadow
              frustumCulled={false}
          />
  
          {/* Towers (Dynamic Components) */}
          {towers.map(cell => (
              <Tower 
                  key={cell.id} 
                  cell={cell} 
                  envMap={envMap} 
                  enemies={enemies}
                  isSelected={cell.id === selectedCellId}
              />
          ))}
      </group>
    );
};
