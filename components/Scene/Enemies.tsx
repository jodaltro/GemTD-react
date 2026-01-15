
import React, { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../../store/useGameStore';
import { GamePhase, BOARD_OFFSET_X, BOARD_OFFSET_Z, CELL_SIZE, END_POS, GEM_COLORS, BOSS_DAMAGE } from '../../constants';

const tempObj = new THREE.Object3D();
const tempColor = new THREE.Color();

// Stylized "Void Knot" enemy shape
const enemyGeo = new THREE.TorusKnotGeometry(0.2, 0.08, 64, 8); 

// Slime/Poison Overlay Geometry (slightly larger)
const slimeGeo = new THREE.TorusKnotGeometry(0.21, 0.09, 64, 8);

export const Enemies: React.FC = () => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const slimeRef = useRef<THREE.InstancedMesh>(null); // Visual layer for poisoned status
  
  // Connect to store
  const phase = useGameStore((state) => state.phase);
  const flowField = useGameStore((state) => state.flowField);
  const spawnEnemy = useGameStore((state) => state.spawnEnemy);
  const removeEnemy = useGameStore((state) => state.removeEnemy);
  const damagePlayer = useGameStore((state) => state.damagePlayer);
  const completeWave = useGameStore((state) => state.completeWave);
  const storeEnemies = useGameStore((state) => state.enemies);
  
  // Wave Logic State
  const waveState = useRef({
    spawnCount: 0,
    spawnTimer: 0,
    totalToSpawn: 10,
    active: false
  });

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
      roughness: 0.1, // Wet look
      metalness: 0.1,
      transmission: 0.2, // Jelly-like
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
    if (!meshRef.current) return;
    meshRef.current.count = storeEnemies.length;
    if (slimeRef.current) slimeRef.current.count = storeEnemies.length;
    
    storeEnemies.forEach((enemy, i) => {
        // --- DEATH ANIMATION LOGIC ---
        if (enemy.isDead && enemy.deathTime) {
            const timeSinceDeath = (Date.now() - enemy.deathTime) / 1000;
            const duration = 0.5; // Animation duration in seconds

            if (timeSinceDeath > duration) {
                // Animation complete, remove entity
                removeEnemy(enemy.id);
                // Hide immediately for this frame to avoid flicker before store update propagates
                tempObj.scale.set(0,0,0);
                tempObj.updateMatrix();
                meshRef.current!.setMatrixAt(i, tempObj.matrix);
                if (slimeRef.current) slimeRef.current.setMatrixAt(i, tempObj.matrix);
                return;
            }

            // Animate Death: Shrink and Spin Wildly
            const progress = timeSinceDeath / duration;
            const scale = (1 - progress) * (enemy.isBoss ? 2.5 : 1.0);
            
            const x = enemy.x * CELL_SIZE + BOARD_OFFSET_X;
            const z = enemy.y * CELL_SIZE + BOARD_OFFSET_Z;
            const y = enemy.isFlying ? 1.5 : 0.4;
            
            tempObj.position.set(x, y, z);
            tempObj.scale.set(scale, scale, scale);
            tempObj.rotation.set(
                progress * 10, // Spin X
                progress * 20, // Spin Y
                progress * 10  // Spin Z
            );
            tempObj.updateMatrix();
            meshRef.current!.setMatrixAt(i, tempObj.matrix);
            // Hide slime during death for simplicity
            if (slimeRef.current) {
                tempObj.scale.setScalar(0);
                tempObj.updateMatrix();
                slimeRef.current.setMatrixAt(i, tempObj.matrix);
            }
            
            // Fade color to black/burnt
            tempColor.set('#ff0000').lerp(new THREE.Color('#000000'), progress);
            meshRef.current!.setColorAt(i, tempColor);
            
            return; // Skip normal logic for dead enemies
        }

        // --- NORMAL LOGIC ---

        // Status Effect Processing
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
            meshRef.current!.setMatrixAt(i, tempObj.matrix);
            if (slimeRef.current) slimeRef.current.setMatrixAt(i, tempObj.matrix);
            return;
        }

        // Render
        const x = enemy.x * CELL_SIZE + BOARD_OFFSET_X;
        const z = enemy.y * CELL_SIZE + BOARD_OFFSET_Z;
        const y = enemy.isFlying ? 1.5 : 0.4;
        const scale = enemy.isBoss ? 2.5 : 1.0;

        tempObj.position.set(x, y, z);
        tempObj.scale.set(scale, scale, scale);
        tempObj.lookAt(END_POS.x * CELL_SIZE + BOARD_OFFSET_X, y, END_POS.y * CELL_SIZE + BOARD_OFFSET_Z);
        
        if (!isStunned) tempObj.rotateZ(state.clock.getElapsedTime() * 2);
        
        tempObj.updateMatrix();
        meshRef.current!.setMatrixAt(i, tempObj.matrix);

        // Render Slime Overlay if Poisoned
        if (slimeRef.current) {
            if (isPoisoned) {
                // Pulse the slime slightly to look alive/dripping
                const slimePulse = 1.05 + Math.sin(state.clock.getElapsedTime() * 10) * 0.05;
                const s = scale * slimePulse;
                tempObj.scale.set(s, s, s);
                tempObj.updateMatrix();
                slimeRef.current.setMatrixAt(i, tempObj.matrix);
            } else {
                // Hide slime
                tempObj.scale.setScalar(0);
                tempObj.updateMatrix();
                slimeRef.current.setMatrixAt(i, tempObj.matrix);
            }
        }

        // Colors & Opacity
        if (enemy.weakness && GEM_COLORS[enemy.weakness]) {
             tempColor.set(GEM_COLORS[enemy.weakness]);
             const healthPct = enemy.hp / enemy.maxHp;
             tempColor.lerp(new THREE.Color('#ff0000'), 1 - healthPct);
             
             if (isStunned) tempColor.lerp(new THREE.Color('#00ffff'), 0.5);
             else if (isPoisoned) tempColor.lerp(new THREE.Color('#00ff00'), 0.4); // Green tint on base mesh too
             else if (currentSpeed < enemy.baseSpeed) tempColor.lerp(new THREE.Color('#aaaaaa'), 0.3);

             // Invisible enemies are ghost-like
             if (enemy.isInvisible) material.opacity = 0.2;
             else material.opacity = 1.0;

             meshRef.current!.setColorAt(i, tempColor);
        } else {
             meshRef.current!.setColorAt(i, new THREE.Color('#ffffff'));
        }
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    
    if (slimeRef.current) {
        slimeRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
        <instancedMesh 
            ref={meshRef} 
            args={[enemyGeo, undefined, 100]} 
            material={material} 
            castShadow
            frustumCulled={false} 
        />
        {/* Slime Overlay Mesh */}
        <instancedMesh
            ref={slimeRef}
            args={[slimeGeo, slimeMaterial, 100]}
            frustumCulled={false}
        />
    </group>
  );
};
