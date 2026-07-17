import React, { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Sparkles, useGLTF } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import { GemMaterialConfig, DiamondAimData } from '../shared/types';
import { BOARD_OFFSET_X, BOARD_OFFSET_Z, CELL_SIZE, GemType, GEM_STATS } from '../../../../constants';
import { GridCell } from '../../../../types';
import { useGameStore } from '../../../../store/useGameStore';
import {
    SPIKE_COUNT, POOL_SIZE,
    CrownShaderHandle,
    buildCrownMaterial, buildProjectileMaterial, buildSpikeGeometry,
    createProjPool, updateCrownShader, getFirePulse,
} from '../shared/TowerEngine';

useGLTF.preload('/glb/diamond.glb');

const DIAMOND_SCALE   = 1.1;
const DIAMOND_Y       = 0.65;
const RELOAD_DURATION = 1.2;
const PROJ_SPEED      = 12;
const PROJ_LIFE       = 3.0;
const PROJ_HIT_DIST   = 0.5;
const LAUNCH_DURATION = 0.12;

type BoundsData = {
    topY: number; radius: number; height: number;
    rawYMin: number; rawHeight: number;
};

// Module-level reusables — avoids GC pressure in the hot render path
const _dcDir    = new THREE.Vector3();
const _dcDummy  = new THREE.Object3D();
const _dcUp     = new THREE.Vector3(0, 1, 0);
const _dcTarget = new THREE.Vector3();

export const ProceduralDiamondCrown: React.FC<{
    cell:             GridCell;
    physics:          GemMaterialConfig;
    envMap:           THREE.Texture | null;
    timeSinceShotRef: React.MutableRefObject<number>;
    diamondAimRef:    React.MutableRefObject<DiamondAimData>;
}> = ({ cell, physics: _physics, envMap, timeSinceShotRef, diamondAimRef }) => {
    const groupRef        = useRef<THREE.Group>(null);
    const attackLightRef  = useRef<THREE.PointLight>(null);
    const shaderRef       = useRef<CrownShaderHandle | null>(null);
    const instancedMeshRef = useRef<THREE.InstancedMesh | null>(null);

    const { scene: glbScene } = useGLTF('/glb/diamond.glb');

    const boundsRef        = useRef<BoundsData>({ topY: 1.0, radius: 0.6, height: 0.3, rawYMin: 0, rawHeight: 0.3 });
    const spikeCooldownRef = useRef<number[]>(Array(SPIKE_COUNT).fill(0));
    const prevShotRef      = useRef<number>(Number.POSITIVE_INFINITY);
    const recoilRef        = useRef<number>(0);
    const projectilePool   = useRef(createProjPool(POOL_SIZE));

    // Per-projectile metadata not in ProjState
    const poolMetaRef = useRef<Array<{ targetId: string | null; damage: number }>>(
        Array.from({ length: POOL_SIZE }, () => ({ targetId: null, damage: 0 }))
    );

    // ── Spike magazine ────────────────────────────────────────────────────────
    const spikeAmmoRef   = useRef<boolean[]>(Array(SPIKE_COUNT).fill(true));
    const nextSpikeRef   = useRef<number>(0);
    const reloadingRef   = useRef<boolean>(false);
    const reloadTimerRef = useRef<number>(0);

    const tmpDir      = useMemo(() => new THREE.Vector3(), []);
    const fallbackDir = useMemo(() => new THREE.Vector3(0, 0.2, 1), []);

    // ── Materials ─────────────────────────────────────────────────────────────
    const { scene } = useThree();

    const crownMaterial = useMemo(() => buildCrownMaterial(envMap, shaderRef), [envMap]);
    const projMaterial  = useMemo(buildProjectileMaterial, []);
    const spikeGeometry = useMemo(buildSpikeGeometry, []);

    // ── Crown mesh ────────────────────────────────────────────────────────────
    const crown = useMemo(() => {
        const root    = new THREE.Group();
        const diamond = SkeletonUtils.clone(glbScene);
        const center  = new THREE.Vector3();

        diamond.traverse((obj) => {
            if (!(obj as THREE.Mesh).isMesh) return;
            const mesh = obj as THREE.Mesh;
            const geom = (mesh.geometry as THREE.BufferGeometry).clone();
            geom.computeBoundingBox();
            const bbox = geom.boundingBox;
            if (!bbox) return;

            const meshCenter = bbox.getCenter(new THREE.Vector3());
            center.copy(meshCenter);

            const radius = Math.max(
                Math.abs(bbox.max.x - meshCenter.x),
                Math.abs(bbox.max.z - meshCenter.z)
            ) * DIAMOND_SCALE;

            const rawYMin   = bbox.min.y;
            const rawHeight = Math.max(0.0001, bbox.max.y - rawYMin);

            boundsRef.current = {
                radius,
                topY:   (bbox.max.y - meshCenter.y) * DIAMOND_SCALE + DIAMOND_Y,
                height: rawHeight * DIAMOND_SCALE,
                rawYMin,
                rawHeight,
            };

            mesh.geometry      = geom;
            mesh.castShadow    = true;
            mesh.receiveShadow = true;
            mesh.material      = crownMaterial;
        });

        diamond.scale.setScalar(DIAMOND_SCALE);
        diamond.position.set(
            -center.x * DIAMOND_SCALE,
            -center.y * DIAMOND_SCALE,
            -center.z * DIAMOND_SCALE
        );
        root.add(diamond);
        return root;
    }, [glbScene, crownMaterial]);

    // ── GPU-instanced projectile pool — attached directly to scene root ───────
    // Must live outside the tower hierarchy to avoid inheriting tower scale/rotation.
    const instancedMesh = useMemo(() => {
        const mesh = new THREE.InstancedMesh(spikeGeometry, projMaterial, POOL_SIZE);
        mesh.frustumCulled = false;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        const dummy = new THREE.Object3D();
        dummy.position.set(0, -9999, 0);
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        for (let i = 0; i < POOL_SIZE; i++) mesh.setMatrixAt(i, dummy.matrix);
        mesh.instanceMatrix.needsUpdate = true;
        instancedMeshRef.current = mesh;
        return mesh;
    }, [spikeGeometry, projMaterial]);

    useEffect(() => {
        scene.add(instancedMesh);
        return () => { scene.remove(instancedMesh); };
    }, [scene, instancedMesh]);

    // ── Frame loop ────────────────────────────────────────────────────────────
    useFrame((state, delta) => {
        const et            = state.clock.getElapsedTime();
        const timeSinceShot = timeSinceShotRef.current;
        const firePulse     = getFirePulse(timeSinceShot);
        const aim           = diamondAimRef.current;
        const hasTarget     = aim.hasTarget;

        if (attackLightRef.current)
            attackLightRef.current.intensity = firePulse * 14;

        // ── GPU shader uniforms ───────────────────────────────────────────────
        if (shaderRef.current) {
            const isReloading = reloadingRef.current;
            const reloadGlow  = isReloading
                ? Math.sin((reloadTimerRef.current / RELOAD_DURATION) * Math.PI) * 0.6
                : 0;
            crownMaterial.emissive.setStyle(
                isReloading ? '#60d0ff' : firePulse > 0.05 ? '#a0d0ff' : '#000000'
            );
            crownMaterial.emissiveIntensity = Math.max(firePulse * 2.8, reloadGlow);

            const { rawYMin, rawHeight } = boundsRef.current;
            updateCrownShader(
                shaderRef.current, et, rawYMin, rawHeight,
                Math.max(firePulse, reloadGlow * 0.4),
                spikeCooldownRef.current
            );
        }

        // ── Reload timer ──────────────────────────────────────────────────────
        if (reloadingRef.current) {
            reloadTimerRef.current += delta;
            if (reloadTimerRef.current >= RELOAD_DURATION) {
                reloadingRef.current = false;
                spikeAmmoRef.current.fill(true);
                nextSpikeRef.current = 0;
            }
        }

        // ── Spike cooldown decay ──────────────────────────────────────────────
        for (let i = 0; i < SPIKE_COUNT; i++) {
            if (spikeAmmoRef.current[i]) {
                spikeCooldownRef.current[i] = Math.max(0, spikeCooldownRef.current[i] - delta * 2.5);
            } else {
                spikeCooldownRef.current[i] = 1.0;
            }
        }

        // ── Fire event ────────────────────────────────────────────────────────
        if (timeSinceShot < 120 && prevShotRef.current >= 120 && !reloadingRef.current) {
            let spikeIndex = -1;
            for (let attempt = 0; attempt < SPIKE_COUNT; attempt++) {
                const candidate = (nextSpikeRef.current + attempt) % SPIKE_COUNT;
                if (spikeAmmoRef.current[candidate]) {
                    spikeIndex = candidate;
                    nextSpikeRef.current = (candidate + 1) % SPIKE_COUNT;
                    break;
                }
            }

            if (spikeIndex >= 0) {
                recoilRef.current = 1.0;
                spikeAmmoRef.current[spikeIndex] = false;

                const spikeAngle = (spikeIndex / SPIKE_COUNT) * Math.PI * 2;
                const { topY, radius, height } = boundsRef.current;
                const tipRadius = radius * 0.10;
                const tipY      = topY + height * 1.75;

                // Spawn position in world space
                const spawnPosWorld = new THREE.Vector3(
                    Math.cos(spikeAngle) * tipRadius,
                    tipY,
                    Math.sin(spikeAngle) * tipRadius
                );
                if (groupRef.current) groupRef.current.localToWorld(spawnPosWorld);

                // Spike outward direction in world space
                const crownWorldPos = new THREE.Vector3();
                const spikeTipWorld = new THREE.Vector3(
                    Math.cos(spikeAngle) * tipRadius, tipY, Math.sin(spikeAngle) * tipRadius
                );
                if (groupRef.current) {
                    groupRef.current.getWorldPosition(crownWorldPos);
                    groupRef.current.localToWorld(spikeTipWorld);
                }
                const spikeOutward = spikeTipWorld.sub(crownWorldPos).normalize();

                // Direction to target in world space.
                // aim.localTarget is in Tower group local space.
                // Tower group = groupRef.parent.parent (outer group → Tower group).
                let launchDir: THREE.Vector3;
                if (hasTarget) {
                    const towerGroup = groupRef.current?.parent?.parent;
                    const targetWorld = aim.localTarget.clone();
                    if (towerGroup) towerGroup.localToWorld(targetWorld);
                    launchDir = targetWorld.sub(spawnPosWorld).normalize();
                } else {
                    launchDir = fallbackDir.clone().normalize();
                }

                launchDir = launchDir.lerp(spikeOutward, 0.25).normalize();

                // Calculate damage from cell stats
                const typeStats = GEM_STATS[GemType.DIAMOND];
                const stats = cell.quality ? (typeStats[cell.quality] || typeStats['Special']) : typeStats['Special'];
                const damage = stats
                    ? (stats.minDmg + Math.random() * (stats.maxDmg - stats.minDmg)) * (cell.damageMultiplier || 1)
                    : 0;

                // Find a free slot in the pool
                let projIdx = -1;
                for (let j = 0; j < POOL_SIZE; j++) {
                    if (!projectilePool.current[j].active) { projIdx = j; break; }
                }
                if (projIdx >= 0) {
                    const proj = projectilePool.current[projIdx];
                    proj.active  = true;
                    proj.life    = PROJ_LIFE;
                    proj.launchT = 0;
                    proj.rot     = 0;
                    proj.vel.copy(launchDir).multiplyScalar(PROJ_SPEED);
                    proj.dir.copy(launchDir);
                    proj.pos.copy(spawnPosWorld); // world space
                    poolMetaRef.current[projIdx].targetId = aim.targetId;
                    poolMetaRef.current[projIdx].damage   = damage;
                }

                if (spikeAmmoRef.current.every(a => !a)) {
                    reloadingRef.current  = true;
                    reloadTimerRef.current = 0;
                }
            }
        }
        prevShotRef.current = timeSinceShot;

        // ── Crown animation ───────────────────────────────────────────────────
        if (groupRef.current) {
            const floatY = DIAMOND_Y + Math.sin(et * 1.1) * 0.08;
            groupRef.current.position.set(0, floatY, 0);

            if (hasTarget) {
                const dir = tmpDir.copy(aim.localTarget).normalize();
                groupRef.current.rotation.y = Math.atan2(dir.x, dir.z);
                groupRef.current.rotation.x = THREE.MathUtils.lerp(
                    groupRef.current.rotation.x, Math.PI / 2, 0.18
                );
                groupRef.current.rotation.z = 0;
                groupRef.current.position.y += 1.0;
            } else {
                groupRef.current.rotation.y = et * 0.3;
                groupRef.current.rotation.z = Math.sin(et * 0.7) * 0.025;
                groupRef.current.rotation.x = Math.cos(et * 0.5) * 0.015;
            }

            recoilRef.current = Math.max(0, recoilRef.current - delta * 4.2);
            if (recoilRef.current > 0) {
                const recoilDir = tmpDir.copy(hasTarget ? aim.localTarget : fallbackDir).normalize();
                groupRef.current.position.addScaledVector(recoilDir, -0.28 * recoilRef.current);
            }
            groupRef.current.scale.setScalar(1 + firePulse * 0.12);
        }

        // ── Projectile pool — physics + render in world space ────────────────
        // instancedMesh lives at scene root (no parent transform), so instance
        // matrices are written directly in world space — no local conversion needed.
        const mesh = instancedMeshRef.current;
        if (!mesh) return;

        const enemies     = useGameStore.getState().enemies;
        const damageEnemy = useGameStore.getState().damageEnemy;
        const pool        = projectilePool.current;
        const meta        = poolMetaRef.current;

        for (let i = 0; i < pool.length; i++) {
            const p = pool[i];

            if (p.active) {
                p.life -= delta;

                const enemy = meta[i].targetId ? enemies.find(e => e.id === meta[i].targetId) : null;
                if (enemy && !enemy.isDead) {
                    const ey = enemy.isFlying ? 1.5 : 0.4;
                    _dcTarget.set(
                        enemy.x * CELL_SIZE + BOARD_OFFSET_X,
                        ey,
                        enemy.y * CELL_SIZE + BOARD_OFFSET_Z
                    );

                    const dist = _dcTarget.distanceTo(p.pos);
                    if (dist < PROJ_HIT_DIST) {
                        p.active = false;
                        damageEnemy(enemy.id, meta[i].damage, GemType.DIAMOND, false);
                        if (attackLightRef.current)
                            attackLightRef.current.intensity = 18;
                    } else if (p.life <= 0) {
                        p.active = false;
                    } else {
                        const desired = _dcDir.copy(_dcTarget).sub(p.pos).normalize();
                        const steer   = Math.min(1, delta * 6);
                        p.vel.lerp(desired.multiplyScalar(PROJ_SPEED), steer);
                        p.vel.normalize().multiplyScalar(PROJ_SPEED);
                        p.dir.copy(p.vel).normalize();
                    }
                } else if (p.life <= 0) {
                    p.active = false;
                }
            }

            if (!p.active) {
                _dcDummy.position.set(0, -9999, 0);
                _dcDummy.scale.setScalar(0);
                _dcDummy.updateMatrix();
                mesh.setMatrixAt(i, _dcDummy.matrix);
                continue;
            }

            // Advance in world space
            p.pos.addScaledVector(p.vel, delta);
            p.rot += delta * 11;
            if (p.launchT < LAUNCH_DURATION) p.launchT = Math.min(p.launchT + delta, LAUNCH_DURATION);

            const lt = p.launchT / LAUNCH_DURATION;
            const s  = (1 - Math.pow(1 - lt, 3)) * 1.2;

            // Write world-space matrix directly (mesh has no parent transform)
            _dcDummy.position.copy(p.pos);
            _dcDummy.quaternion.setFromUnitVectors(_dcUp, _dcDir.copy(p.dir).normalize());
            _dcDummy.rotateY(p.rot);
            _dcDummy.scale.setScalar(s);
            _dcDummy.updateMatrix();
            mesh.setMatrixAt(i, _dcDummy.matrix);
        }

        mesh.instanceMatrix.needsUpdate = true;
    });

    return (
        <group>
            <group ref={groupRef}>
                <primitive object={crown} />
                <Sparkles count={18} scale={1.5} size={3.5} speed={0.5} color="#b0e0ff" opacity={0.65} />
            </group>
            <pointLight ref={attackLightRef} color="#b0e0ff" intensity={0} distance={5} decay={2} />
        </group>
    );
};
