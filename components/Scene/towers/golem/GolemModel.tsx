import React, { useRef, useMemo, useEffect, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Sparkles, useGLTF, useAnimations } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import { GemMaterialConfig, StonefishAimData, DiamondAimData } from '../shared/types';
import { buildGemMaterial, buildGlowMaterial } from '../shared/TowerEngine';
import { GemType, GemQuality, QUALITY_VISUALS } from '../../../../constants';
import { Enemy, GridCell } from '../../../../types';
import { ProceduralSnake } from '../snake/Snake';
import { ProceduralStonefish } from '../stonefish/Stonefish';
import { ProceduralDiamondCrown } from '../diamond/DiamondCrown';
import { ProceduralRubyTower } from '../ruby/Ruby';

useGLTF.preload('/glb/golem_-_attack.glb');

export const GolemModel: React.FC<{
    cell: GridCell;
    enemies: Enemy[];
    isSelected: boolean;
    physics: GemMaterialConfig;
    visualConfig: typeof QUALITY_VISUALS[GemQuality];
    isOrbType: boolean;
    isSnakeType: boolean;
    isStonefish: boolean;
    isRubyType: boolean;
    envMap: THREE.Texture | null;
    stonefishAimRef: React.MutableRefObject<StonefishAimData>;
    diamondAimRef: React.MutableRefObject<DiamondAimData>;
}> = ({ cell, enemies, isSelected, physics, visualConfig, isOrbType, isSnakeType, isStonefish, isRubyType, envMap, stonefishAimRef, diamondAimRef }) => {
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
            if ((obj as any).isBone) {
                const name = obj.name.toLowerCase();
                const bone = obj as THREE.Bone;
                if (isOrbType) {
                    if (/leg|thigh|shin|foot|toe|arm|hand|finger|shoulder|clavicle/.test(name)) obj.scale.setScalar(0.001);
                    if (/head|neck/.test(name)) obj.scale.set(0.6, 1.6, 0.6);
                    if (/spine|chest/.test(name)) obj.scale.set(1.2, 1.0, 1.2);
                }
                if (isSnakeType) {
                    if (/leg|thigh|shin|foot|toe|arm|hand|finger|shoulder|clavicle/.test(name)) obj.scale.setScalar(0.001);
                    if (/spine/.test(name)) {
                        if (!name.includes('1') && !name.includes('2')) { obj.scale.set(2.5, 1.3, 2.5); spineRef.current = bone; }
                        else obj.scale.set(1.5, 1.2, 1.5);
                    }
                    if (/neck/.test(name)) { obj.scale.set(5.0, 1.0, 0.4); neckRef.current = bone; }
                    if (/head/.test(name)) { obj.scale.set(0.2, 1.0, 2.5); headRef.current = bone; }
                }
            }
            if ((obj as THREE.Mesh).isMesh) {
                const mesh = obj as THREE.Mesh;
                mesh.castShadow = true; mesh.receiveShadow = true;
                const prevMat = mesh.material as THREE.MeshStandardMaterial;
                const matName = prevMat.name ? prevMat.name.toLowerCase() : '';
                const meshName = mesh.name ? mesh.name.toLowerCase() : '';
                const isEye = /eye|glow|lens|visor|mask|face/i.test(meshName) || /eye|glow|lens|visor/i.test(matName);
                if (isEye) {
                    const eyeColor  = isSnakeType ? '#ffff00' : isStonefish ? '#0088ff' : '#ffffff';
                    const eyeEmit   = isSnakeType ? '#ff0000' : isStonefish ? '#0066ff' : '#ffffff';
                    mesh.material = buildGlowMaterial(eyeColor, eyeEmit, isStonefish ? 8.0 : 5.0);
                } else if (isStonefish) {
                    mesh.material = buildGemMaterial({
                        color: '#7fffff', emissive: '#00e5ff', emissiveIntensity: 0.45,
                        metalness: 0.0, roughness: 0.02, transmission: 0.7, thickness: 1.8,
                        clearcoat: 1.0, clearcoatRoughness: 0.01, ior: 1.65,
                        sheen: 1.0, sheenColor: new THREE.Color('#00ffff'), sheenRoughness: 0.15,
                    }, envMap, 2.2);
                } else {
                    mesh.material = buildGemMaterial({
                        color: physics.color, emissive: physics.color, emissiveIntensity: 0.2,
                        metalness: 0.4, roughness: 0.2, clearcoat: 1.0, clearcoatRoughness: 0.1,
                    }, envMap, 1.0);
                }
            }
        });
    }, [clone, physics, isOrbType, isSnakeType, isStonefish, envMap]);

    useEffect(() => {
        if (isOrbType || isSnakeType || isStonefish || isRubyType) {
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
            attackAction.reset().setLoop(THREE.LoopOnce, 1);
            attackAction.clampWhenFinished = true;
            attackAction.setEffectiveTimeScale(2.0).fadeIn(0.05).play();
            if (idleAction) idleAction.fadeOut(0.05);
        } else if (!attackAction.isRunning()) {
            if (idleAction) idleAction.reset().fadeIn(0.2).play();
            else { attackAction.reset().play(); attackAction.paused = true; attackAction.time = 0; }
        }
    }, [cell.lastShot, actions, names, isOrbType, isSnakeType, isStonefish, isRubyType]);

    useFrame((state) => {
        const et = state.clock.getElapsedTime();
        const now = Date.now();
        const timeSinceShot = now - (cell.lastShot || 0);
        if (timeSinceShotRef.current !== undefined) timeSinceShotRef.current = timeSinceShot;

        if (isOrbType && modelContainer.current) {
            modelContainer.current.position.y = THREE.MathUtils.lerp(modelContainer.current.position.y, Math.sin(et * 2.0) * 0.15, 0.1);
            let recoilZ = 0, recoilScale = 1.0;
            if (timeSinceShot < 300) {
                const t = timeSinceShot / 300;
                if (t < 0.2) { recoilZ = -(t / 0.2) * 0.3; recoilScale = 1 + (t / 0.2) * 0.3; }
                else { recoilZ = -0.3 * (1 - (t - 0.2) / 0.8); recoilScale = 1.3 - 0.3 * ((t - 0.2) / 0.8); }
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
                let targetHeadZ = 0.0, targetHeadY = 0.8, headRotX = -0.2;
                if (timeSinceShot < 400) {
                    const t = timeSinceShot / 400;
                    const lungeIntensity = t < 0.3
                        ? Math.sin((t / 0.3) * (Math.PI / 2))
                        : 1 - Math.sin(((t - 0.3) / 0.7) * (Math.PI / 2));
                    targetHeadZ += lungeIntensity * 2.5;
                    targetHeadY -= lungeIntensity * 0.5;
                    headRotX = -0.2 - lungeIntensity * 0.5;
                }
                headRef.current.position.set(0, targetHeadY, targetHeadZ);
                headRef.current.rotation.x = headRotX;
                headRef.current.rotation.y = Math.sin(et * swaySpeed) * 0.2;
            }
        }
    });

    if (isRubyType) return <ProceduralRubyTower physics={physics} envMap={envMap} timeSinceShotRef={timeSinceShotRef} />;
    if (isSnakeType) return <ProceduralSnake physics={physics} envMap={envMap} timeSinceShotRef={timeSinceShotRef} />;
    if (isStonefish) return <ProceduralStonefish physics={physics} envMap={envMap} timeSinceShotRef={timeSinceShotRef} stonefishAimRef={stonefishAimRef} />;
    if (isDiamondCrown) return <ProceduralDiamondCrown cell={cell} physics={physics} envMap={envMap} timeSinceShotRef={timeSinceShotRef} diamondAimRef={diamondAimRef} />;

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
                scale={[2, 3, 2]} size={4} speed={0.4} opacity={0.3}
                color={physics.color} position={[0, 1.0, 0]}
            />
        </group>
    );
};
