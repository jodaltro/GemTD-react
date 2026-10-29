import React, { useRef, useMemo, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../../store/useGameStore';
import { GamePhase, BOARD_OFFSET_X, BOARD_OFFSET_Z, CELL_SIZE, END_POS, GEM_COLORS, BOSS_DAMAGE } from '../../constants';
import { Enemy } from '../../types';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

const tempObj = new THREE.Object3D();
const tempColor = new THREE.Color();

// P0: Poison DoT accumulator (per enemy+source, integer ticks to avoid store churn)
const poisonAcc = new Map<string, number>();

// Fallback geometry when the GLB is not available yet
const fallbackGeo = new THREE.TorusKnotGeometry(0.2, 0.08, 64, 8);
const slimeGeo = new THREE.TorusKnotGeometry(0.21, 0.09, 64, 8);

// P0: Enemy archetype models (from public/glb/enemies.glb)
type EnemyArch = 'creep' | 'evader' | 'regen' | 'mag' | 'flyer' | 'boss' | 'endgame';
const ARCHES: EnemyArch[] = ['creep', 'evader', 'regen', 'mag', 'flyer', 'boss', 'endgame'];

const archFor = (e: Enemy): EnemyArch => {
  if (e.isBoss) return 'boss';
  if (e.isEndgame) return 'endgame';
  if (e.isEvader) return 'evader';
  if (e.isRegen) return 'regen';
  if (e.isImmune) return 'mag';
  if (e.isFlying) return 'flyer';
  return 'creep';
};

export const Enemies: React.FC = () => {
  const meshRefs = {
    creep: useRef<THREE.InstancedMesh>(null),
    evader: useRef<THREE.InstancedMesh>(null),
    regen: useRef<THREE.InstancedMesh>(null),
    mag: useRef<THREE.InstancedMesh>(null),
    flyer: useRef<THREE.InstancedMesh>(null),
    boss: useRef<THREE.InstancedMesh>(null),
    endgame: useRef<THREE.InstancedMesh>(null),
  };
  const slimeRef = useRef<THREE.InstancedMesh>(null); // Visual layer for poisoned status

  // Connect to store
  const phase = useGameStore((state) => state.phase);
  const flowField = useGameStore((state) => state.flowField);
  const spawnEnemy = useGameStore((state) => state.spawnEnemy);
  const removeEnemy = useGameStore((state) => state.removeEnemy);
  const damagePlayer = useGameStore((state) => state.damagePlayer);
  const completeWave = useGameStore((state) => state.completeWave);
  const dealPlainDamage = useGameStore((state) => state.dealPlainDamage);
  const storeEnemies = useGameStore((state) => state.enemies);

  // Wave Logic State
  const waveState = useRef({
    spawnCount: 0,
    spawnTimer: 0,
    totalToSpawn: 10,
    active: false
  });

  // Load enemies.glb (graceful fallback to the torus knot)
  const [gltf, setGltf] = useState<GLTF | null>(null);
  useEffect(() => {
    let cancelled = false;
    const loader = new GLTFLoader();
    loader.load('/glb/enemies.glb', (g) => { if (!cancelled) setGltf(g); }, undefined, () => {});
    return () => { cancelled = true; };
  }, []);

  const geometries = useMemo(() => {
    const map: Partial<Record<EnemyArch, THREE.BufferGeometry>> = {};
    if (!gltf) return map;
    gltf.scene.traverse(obj => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const key = mesh.name.toLowerCase();
      if (key.includes('creep')) map.creep = mesh.geometry;
      else if (key.includes('evader')) map.evader = mesh.geometry;
      else if (key.includes('regen')) map.regen = mesh.geometry;
      else if (key.includes('magimmune')) map.mag = mesh.geometry;
      else if (key.includes('flyer')) map.flyer = mesh.geometry;
      else if (key.includes('boss')) map.boss = mesh.geometry;
      else if (key.includes('endgame')) map.endgame = mesh.geometry;
    });
    return map;
  }, [gltf]);
  const geoFor = (a: EnemyArch) => geometries[a] || fallbackGeo;

  // Procedural Texture Generation
  const { map, emissiveMap } = useMemo(() => {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { map: null, emissiveMap: null };

    ctx.fillStyle = '#1a0505';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#330000';
    ctx.lineWidth = 2;
    for(let i=0; i<30; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const r = Math.random() * 20 + 10;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);

    const eCanvas = document.createElement('canvas');
    eCanvas.width = size;
    eCanvas.height = size;
    const eCtx = eCanvas.getContext('2d');
    if (!eCtx) return { map: texture, emissiveMap: null };

    eCtx.fillStyle = '#000000';
    eCtx.fillRect(0, 0, size, size);
    eCtx.lineCap = 'round';
    eCtx.shadowBlur = 10;
    eCtx.shadowColor = '#ffffff';
    const drawVein = () => {
        eCtx.strokeStyle = '#ffffff';
        eCtx.lineWidth = Math.random() * 3 + 1;
        eCtx.beginPath();
        let x = Math.random() * size;
        let y = Math.random() * size;
        eCtx.moveTo(x, y);
        for(let j=0; j<5; j++) {
             x += (Math.random() - 0.5) * 60;
             y += (Math.random() - 0.5) * 60;
             eCtx.lineTo(x, y);
        }
        eCtx.stroke();
    };
    for(let k=0; k<8; k++) drawVein();
    const eTexture = new THREE.CanvasTexture(eCanvas);
    return { map: texture, emissiveMap: eTexture };
  }, []);

  const material = useMemo(() => new THREE.MeshStandardMaterial({
    map: map,
    emissiveMap: emissiveMap,
    emissive: new THREE.Color('#ff0000'),
    emissiveIntensity: 2.0,
    roughness: 0.4,
    metalness: 0.8,
    transparent: true,
  }), [map, emissiveMap]);

  const slimeMaterial = useMemo(() => new THREE.MeshPhysicalMaterial({
      color: '#00ff00',
      emissive: '#004400',
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.6,
      roughness: 0.1,
      metalness: 0.1,
      transmission: 0.2,
      thickness: 0.5,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1
  }), []);

  // Wave Spawning Logic
  useFrame((state, delta) => {
    if (phase === GamePhase.DEFENDING) {
        if (!waveState.current.active) {
            waveState.current.active = true;
            waveState.current.spawnCount = 0;
            waveState.current.spawnTimer = 0;
        }

        if (waveState.current.spawnCount < waveState.current.totalToSpawn) {
            waveState.current.spawnTimer += delta;
            if (waveState.current.spawnTimer > 1.5) {
                spawnEnemy();
                waveState.current.spawnCount++;
                waveState.current.spawnTimer = 0;
            }
        } else if (storeEnemies.length === 0) {
            waveState.current.active = false;
            completeWave();
        }
    }
  });

  // Movement & Rendering Logic
  useFrame((state, delta) => {
    if (!meshRefs.creep.current) return;
    const time = state.clock.getElapsedTime();

    const counts: Record<EnemyArch, number> = { creep: 0, evader: 0, regen: 0, mag: 0, flyer: 0, boss: 0, endgame: 0 };
    if (slimeRef.current) slimeRef.current.count = storeEnemies.length;

    storeEnemies.forEach((enemy, i) => {
        const arch = archFor(enemy);
        const mesh = meshRefs[arch].current;
        const idx = counts[arch];

        // Death Animation Logic
        if (enemy.isDead && enemy.deathTime) {
            const timeSinceDeath = (Date.now() - enemy.deathTime) / 1000;
            const duration = 0.5;

            if (timeSinceDeath > duration) {
                removeEnemy(enemy.id);
                tempObj.scale.set(0,0,0);
                tempObj.updateMatrix();
                mesh?.setMatrixAt(idx, tempObj.matrix);
                if (slimeRef.current) slimeRef.current.setMatrixAt(i, tempObj.matrix);
                return;
            }

            const progress = timeSinceDeath / duration;
            const scale = (1 - progress) * (enemy.isBoss ? 2.5 : 1.0);
            const x = enemy.x * CELL_SIZE + BOARD_OFFSET_X;
            const z = enemy.y * CELL_SIZE + BOARD_OFFSET_Z;
            const y = enemy.isFlying ? 1.5 : 0.4;

            tempObj.position.set(x, y, z);
            tempObj.scale.set(scale, scale, scale);
            tempObj.rotation.set(progress * 10, progress * 20, progress * 10);
            tempObj.updateMatrix();
            mesh?.setMatrixAt(idx, tempObj.matrix);

            if (slimeRef.current) {
                tempObj.scale.setScalar(0);
                tempObj.updateMatrix();
                slimeRef.current.setMatrixAt(i, tempObj.matrix);
            }

            tempColor.set('#ff0000').lerp(new THREE.Color('#000000'), progress);
            mesh?.setColorAt(idx, tempColor);
            counts[arch] = idx + 1;
            return;
        }

        // Status Effects
        if (enemy.effects.length > 0) {
            for (let eIdx = enemy.effects.length - 1; eIdx >= 0; eIdx--) {
                enemy.effects[eIdx].duration -= delta;
                if (enemy.effects[eIdx].duration <= 0) {
                    enemy.effects.splice(eIdx, 1);
                }
            }
        }

        let speedMultiplier = 1.0;
        let isPoisoned = false;

        // P0: Poison DoT — accumulated magic damage, blocked by Magic Immune
        for (const eff of enemy.effects) {
            if (eff.type === 'POISON' && eff.duration > 0) {
                const key = `${enemy.id}:${eff.sourceId}`;
                const acc = (poisonAcc.get(key) || 0) + eff.value * delta;
                let whole = Math.floor(acc);
                poisonAcc.set(key, acc - whole);
                while (whole > 0) {
                    dealPlainDamage(enemy.id, 1);
                    whole--;
                }
            }
        }

        // P0: Regen — heals when enemy has not been hit for 2s
        if (enemy.isRegen && enemy.regenPerSec && enemy.hp < enemy.maxHp) {
            const sinceHit = (Date.now() - (enemy.lastHitAt || 0)) / 1000;
            if (sinceHit >= 2.0) {
                enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.regenPerSec * delta);
            }
        }

        enemy.effects.forEach(e => {
            if (e.type === 'SLOW') {
                speedMultiplier *= (1.0 - e.value);
            }
            if (e.type === 'POISON') {
                isPoisoned = true;
            }
        });

        const isStunned = enemy.stunnedUntil && enemy.stunnedUntil > Date.now();
        if (isStunned) speedMultiplier = 0;

        const currentSpeed = enemy.baseSpeed * speedMultiplier;
        enemy.speed = currentSpeed;

        // Movement
        let targetX = enemy.x;
        let targetY = enemy.y;

        if (enemy.isFlying) {
            const dirX = END_POS.x - enemy.x;
            const dirY = END_POS.y - enemy.y;
            const dist = Math.sqrt(dirX*dirX + dirY*dirY);
            if (dist > 0.1 && currentSpeed > 0) {
                targetX += (dirX / dist) * currentSpeed * delta;
                targetY += (dirY / dist) * currentSpeed * delta;
            }
        } else {
            const cellId = `${Math.round(enemy.x)}-${Math.round(enemy.y)}`;
            const flow = flowField[cellId];

            if (flow && currentSpeed > 0) {
                targetX += flow.x * currentSpeed * delta;
                targetY += flow.y * currentSpeed * delta;
            } else if (currentSpeed > 0) {
                const dirX = END_POS.x - enemy.x;
                const dirY = END_POS.y - enemy.y;
                const dist = Math.sqrt(dirX*dirX + dirY*dirY);
                if (dist > 0.1) {
                   targetX += (dirX / dist) * currentSpeed * delta;
                   targetY += (dirY / dist) * currentSpeed * delta;
                }
            }
        }

        enemy.x = targetX;
        enemy.y = targetY;
        enemy.distanceTraveled += currentSpeed * delta;

        // Check End
        const distToEnd = Math.sqrt(Math.pow(enemy.x - END_POS.x, 2) + Math.pow(enemy.y - END_POS.y, 2));
        if (distToEnd < 0.5) {
            damagePlayer(enemy.isBoss ? BOSS_DAMAGE : 1);
            removeEnemy(enemy.id);
            tempObj.scale.set(0,0,0);
            tempObj.updateMatrix();
            mesh?.setMatrixAt(idx, tempObj.matrix);
            if (slimeRef.current) slimeRef.current.setMatrixAt(i, tempObj.matrix);
            return;
        }

        // Pose (archetype-aware procedural animation)
        const x = enemy.x * CELL_SIZE + BOARD_OFFSET_X;
        const z = enemy.y * CELL_SIZE + BOARD_OFFSET_Z;
        const baseY = enemy.isFlying ? 1.5 : 0.4;
        let y = baseY;

        let scale = enemy.isBoss ? 2.5 : 1.0;
        if (arch === 'regen') scale *= 1 + 0.12 * Math.sin(time * 4);
        else if (arch === 'mag') scale *= 1 + 0.04 * Math.sin(time * 3);
        else if (arch === 'boss') scale *= 1 + 0.05 * Math.sin(time * 2);
        else if (arch === 'endgame') scale *= 1 + 0.08 * Math.sin(time * 3);
        else if (arch === 'evader') scale *= 1 + 0.06 * Math.sin(time * 18 + enemy.distanceTraveled);

        if (enemy.isFlying) y += Math.sin(time * 2.2 + enemy.distanceTraveled) * (0.12 + currentSpeed * 0.05);
        else if (arch === 'evader') y += Math.sin(time * 30 + enemy.id.length) * 0.05;

        tempObj.position.set(x, y, z);
        tempObj.scale.set(scale, scale, scale);
        tempObj.lookAt(END_POS.x * CELL_SIZE + BOARD_OFFSET_X, y, END_POS.y * CELL_SIZE + BOARD_OFFSET_Z);

        // Momentum lean: ground runners pitch into their movement
        if (!isStunned && currentSpeed > 0.6 && !enemy.isFlying && arch === 'creep') {
            tempObj.rotateX(-Math.min(0.3, currentSpeed * 0.09));
        }

        if (!isStunned) {
            if (arch === 'evader') {
                tempObj.rotateZ(time * 5 + Math.sin(time * 23 + enemy.id.length) * 0.9);
                tempObj.position.x += (Math.random() - 0.5) * 0.07;
                tempObj.position.z += (Math.random() - 0.5) * 0.07;
            } else if (arch === 'regen') tempObj.rotateZ(time * 1.5);
            else if (arch === 'mag') tempObj.rotateZ(time * 1.2);
            else if (arch === 'flyer') {
                tempObj.rotateZ(time * 0.9);
                tempObj.rotateX(Math.sin(time * 2.4) * 0.32);
            } else if (arch === 'boss') tempObj.rotateZ(time * 0.55);
            else if (arch === 'endgame') tempObj.rotateZ(time * 0.9);
            else tempObj.rotateZ(time * 2.5);
        }

        tempObj.updateMatrix();
        mesh?.setMatrixAt(idx, tempObj.matrix);

        // Colors
        tempColor.set(GEM_COLORS[enemy.weakness] || '#ffffff');

        const healthPct = enemy.hp / enemy.maxHp;
        tempColor.lerp(new THREE.Color('#ff0000'), 1 - healthPct);

        if (isStunned) tempColor.lerp(new THREE.Color('#00ffff'), 0.5);
        else if (isPoisoned) tempColor.lerp(new THREE.Color('#00ff00'), 0.4);
        else if (currentSpeed < enemy.baseSpeed && currentSpeed > 0) tempColor.lerp(new THREE.Color('#aaaaaa'), 0.3);

        mesh?.setColorAt(idx, tempColor);

        // Invisible enemies are ghost-like
        if (enemy.isInvisible) material.opacity = 0.2;
        else material.opacity = 1.0;

        // Slime overlay for poisoned enemies (single instanced mesh, store-indexed)
        if (slimeRef.current) {
            if (isPoisoned) {
                const slimePulse = 1.05 + Math.sin(time * 10) * 0.05;
                const s = scale * slimePulse;
                tempObj.scale.set(s, s, s);
                tempObj.updateMatrix();
                slimeRef.current.setMatrixAt(i, tempObj.matrix);
            } else {
                tempObj.scale.setScalar(0);
                tempObj.updateMatrix();
                slimeRef.current.setMatrixAt(i, tempObj.matrix);
            }
        }

        counts[arch] = idx + 1;
    });

    // Flush instance counts per archetype
    for (const a of ARCHES) {
        const ref = meshRefs[a].current;
        if (!ref) continue;
        ref.count = counts[a];
        ref.instanceMatrix.needsUpdate = true;
        if (ref.instanceColor) ref.instanceColor.needsUpdate = true;
    }

    if (slimeRef.current) {
        slimeRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
        {ARCHES.map(a => (
            <instancedMesh
                key={a}
                ref={meshRefs[a]}
                args={[geoFor(a), material, 100]}
                castShadow
                frustumCulled={false}
            />
        ))}
        <instancedMesh
            ref={slimeRef}
            args={[slimeGeo, slimeMaterial, 100]}
            frustumCulled={false}
        />
    </group>
  );
};
