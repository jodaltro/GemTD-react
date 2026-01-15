
import React, { useRef, useLayoutEffect, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../../store/useGameStore';
import { BOARD_OFFSET_X, BOARD_OFFSET_Z, CELL_SIZE } from '../../constants';

const PARTICLE_COUNT = 800; // Increased count to handle complex events
const tempObj = new THREE.Object3D();

// Particle structure
type Particle = {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
  rotationSpeed: number;
  color: THREE.Color;
  mode: 'EXPLODE' | 'IMPLODE' | 'FLOAT'; // New modes
  targetX?: number; // For implosion
  targetY?: number;
  targetZ?: number;
};

export const Particles: React.FC = () => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const lastEffect = useGameStore((state) => state.lastEffect);
  
  // Pool of particles
  const particles = useRef<Particle[]>([]);

  // Initialize pool
  useLayoutEffect(() => {
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.current.push({
        active: false,
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        life: 0, maxLife: 0,
        scale: 0,
        rotationSpeed: 0,
        color: new THREE.Color(),
        mode: 'EXPLODE'
      });
    }
  }, []);

  // Listen for effects
  useEffect(() => {
    if (!lastEffect) return;

    // determine spawn parameters
    let spawnCount = 20;
    let mode: 'EXPLODE' | 'IMPLODE' | 'FLOAT' = 'EXPLODE';
    
    // Calculate World Coordinates
    let worldX = 0;
    let worldY = 0;
    let worldZ = 0;

    if (lastEffect.type === 'HIT') {
        spawnCount = 10;
        mode = 'EXPLODE';
        // Store HIT passes gridX and worldHeight (in Y) but misses GridZ logic in store?
        // Assuming we fix/interpret consistently:
        // x is gridX, y is height? No, store passes targetY (height).
        // Let's rely on standard logic: x=GridX, y=GridY for non-HIT.
        // For HIT, rely on best effort interpretation or assume store fixed.
        // Reverting to standard safe logic:
        // We know for sure UPGRADE/DOWNGRADE/SPAWN/CONFIRM pass grid coords.
        worldX = lastEffect.x * CELL_SIZE + BOARD_OFFSET_X;
        worldZ = lastEffect.y * CELL_SIZE + BOARD_OFFSET_Z;
        worldY = 0.6;
    } else {
        worldX = lastEffect.x * CELL_SIZE + BOARD_OFFSET_X;
        worldZ = lastEffect.y * CELL_SIZE + BOARD_OFFSET_Z;
        worldY = 0.6;
    }

    if (lastEffect.type === 'UPGRADE') {
      // FUSION: Implosion Effect
      spawnCount = 60;
      mode = 'IMPLODE';
    } else if (lastEffect.type === 'DOWNGRADE') {
      // SHATTER: Heavy Explosion
      spawnCount = 40;
      mode = 'EXPLODE';
    } else if (lastEffect.type === 'SPAWN' || lastEffect.type === 'GOLD') {
      mode = 'FLOAT';
    }

    let spawned = 0;
    for (const p of particles.current) {
      if (!p.active && spawned < spawnCount) {
        p.active = true;
        p.mode = mode;
        p.color.set(lastEffect.color);
        p.rotationSpeed = (Math.random() - 0.5) * 10;
        p.maxLife = 1.0;

        if (mode === 'IMPLODE') {
            // Spawn in a ring/sphere AROUND the center
            const theta = Math.random() * Math.PI * 2;
            const radius = 1.5; // Start outside
            const yOffset = (Math.random() - 0.5) * 1.0;
            
            p.x = worldX + Math.cos(theta) * radius;
            p.z = worldZ + Math.sin(theta) * radius;
            p.y = worldY + yOffset;
            
            p.targetX = worldX;
            p.targetY = worldY;
            p.targetZ = worldZ;
            
            p.life = 0.6; // Shorter life for snappy implosion
            p.maxLife = 0.6;
            p.scale = Math.random() * 0.15 + 0.05;
        } else if (mode === 'EXPLODE') {
            // Start at center, burst out
            p.x = worldX;
            p.y = worldY;
            p.z = worldZ;
            
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            const speed = lastEffect.type === 'DOWNGRADE' ? 0.2 : 0.15;
            
            p.vx = Math.sin(phi) * Math.cos(theta) * speed;
            p.vy = Math.cos(phi) * speed;
            p.vz = Math.sin(phi) * Math.sin(theta) * speed;
            
            p.life = lastEffect.type === 'DOWNGRADE' ? 0.8 : 0.3;
            p.maxLife = p.life;
            p.scale = Math.random() * 0.1 + 0.05;
            if (lastEffect.type === 'DOWNGRADE') {
                p.scale *= 1.5; // Bigger chunks for shatter
            }
        } else {
            // FLOAT (Spawn/Gold)
            p.x = worldX + (Math.random() - 0.5) * 0.5;
            p.z = worldZ + (Math.random() - 0.5) * 0.5;
            p.y = worldY;
            
            p.vx = 0;
            p.vy = 0.05 + Math.random() * 0.05;
            p.vz = 0;
            
            p.life = 1.0;
            p.maxLife = 1.0;
            p.scale = Math.random() * 0.1 + 0.05;
        }
        
        // Add brightness/emission
        p.color.multiplyScalar(2.0);
        spawned++;
      }
    }
  }, [lastEffect]);

  // Animation Loop
  useFrame((state, delta) => {
    if (!meshRef.current) return;

    let activeCount = 0;
    
    // Simulate
    particles.current.forEach((p, i) => {
      if (!p.active) {
        tempObj.position.set(0, -100, 0);
        tempObj.scale.setScalar(0);
        tempObj.updateMatrix();
        meshRef.current!.setMatrixAt(i, tempObj.matrix);
        return;
      }
      
      activeCount++;

      if (p.mode === 'IMPLODE') {
          // Move towards target
          const dx = p.targetX! - p.x;
          const dy = p.targetY! - p.y;
          const dz = p.targetZ! - p.z;
          
          // Easing function: Accelerate as it gets closer?
          // Simple Lerp for visual effect
          const speed = 5.0 * delta;
          p.x += dx * speed;
          p.y += dy * speed;
          p.z += dz * speed;
          
          // Shrink as it reaches center to simulate fusion
          const distSq = dx*dx + dy*dy + dz*dz;
          if (distSq < 0.05) {
              p.active = false; // Absorbed
          }
      } 
      else {
          // Physics movement
          p.x += p.vx;
          p.y += p.vy;
          p.z += p.vz;
          
          // Friction & Gravity
          p.vx *= 0.92;
          p.vy *= 0.92;
          p.vz *= 0.92;
          
          if (p.mode === 'EXPLODE') {
              p.vy -= 0.01; // Gravity debris
          }
      }

      // Life
      p.life -= delta;
      if (p.life <= 0) {
        p.active = false;
      }

      // Update Matrix
      tempObj.position.set(p.x, p.y, p.z);
      
      // Scale
      const lifeRatio = p.life / p.maxLife;
      let scale = p.scale;
      
      if (p.mode === 'IMPLODE') {
          // Fade in then maintain
           scale = p.scale * (1 - Math.pow(lifeRatio - 1, 2)); // Simple curve
      } else {
          // Shrink out
          scale = p.scale * (1 - Math.pow(1 - lifeRatio, 3)); 
      }
      
      tempObj.scale.setScalar(scale);
      tempObj.rotation.set(
          p.life * p.rotationSpeed, 
          p.life * p.rotationSpeed, 
          p.life * p.rotationSpeed
      ); 
      tempObj.updateMatrix();

      meshRef.current!.setMatrixAt(i, tempObj.matrix);
      meshRef.current!.setColorAt(i, p.color);
    });

    if (activeCount > 0) {
        meshRef.current.instanceMatrix.needsUpdate = true;
        if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, PARTICLE_COUNT]}
      frustumCulled={false}
    >
      <planeGeometry args={[0.5, 0.5]} />
      <meshBasicMaterial 
        transparent 
        opacity={1.0} 
        side={THREE.DoubleSide} 
        blending={THREE.AdditiveBlending} 
        depthWrite={false}
      />
    </instancedMesh>
  );
};
