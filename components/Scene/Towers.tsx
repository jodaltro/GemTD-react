
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../../store/useGameStore';
import { CellType, GEM_STATS, RANGE_SCALE, GEM_COLORS, GREEDY_CHANCE, GREEDY_BONUS_BASE, GemType, GemQuality } from '../../constants';
import * as THREE from 'three';
import { AQUAMARINE_PROJECTILE_VISUAL_DELAY_MS } from './attackTimings';

// Phase 4: Combat Loop - Tower Logic
export const Towers: React.FC = () => {
  const grid = useGameStore((state) => state.grid);
  const enemies = useGameStore((state) => state.enemies);
  const wave = useGameStore((state) => state.wave);
  const spawnProjectile = useGameStore((state) => state.spawnProjectile);
  const updateTowerCooldown = useGameStore((state) => state.updateTowerCooldown);
  const updateTowerTarget = useGameStore((state) => state.updateTowerTarget);
  const addGold = useGameStore((state) => state.addGold);

  const towers = React.useMemo(() => grid.filter(c => c.type === CellType.TOWER && c.gemType && c.quality), [grid]);
  
  // Use a ref to track the R3F clock time accessibly within callbacks
  const clockRef = useRef(0);

  // Define types that float/shoot from chest
  const ORB_TYPES = [
      GemType.AMETHYST, GemType.OPAL, GemType.BLACK_OPAL, 
      GemType.URANIUM_238, GemType.TOURMALINE
  ];

  useFrame((state) => {
    // Update clock ref every frame
    clockRef.current = state.clock.getElapsedTime();
    const now = Date.now(); 

    towers.forEach(tower => {
        if (!tower.gemType || !tower.quality) return;

        // Get Stats
        const typeStats = GEM_STATS[tower.gemType];
        const stats = typeStats[tower.quality] || typeStats['Special'];
        if (!stats) return;

        // Find Target Logic (Run every frame to track rotation)
        let target = null;
        let minDist = Infinity;
        const range = stats.range;
        
        // 1. If we already have a target, check if it's still valid/in range
        if (tower.targetId) {
            const currentTarget = enemies.find(e => e.id === tower.targetId);
            if (currentTarget && !currentTarget.isDead && !currentTarget.isInvisible) {
                 const dist = Math.sqrt(Math.pow(tower.x - currentTarget.x, 2) + Math.pow(tower.y - currentTarget.y, 2));
                 if (dist <= (range / RANGE_SCALE) * 0.035) {
                     target = currentTarget;
                 }
            }
        }

        // 2. If no valid target, scan for new one
        if (!target) {
            for (const enemy of enemies) {
                // Check valid target: not invisible, not dead
                if (enemy.isInvisible || enemy.isDead) continue;

                const dist = Math.sqrt(Math.pow(tower.x - enemy.x, 2) + Math.pow(tower.y - enemy.y, 2));
                if (dist <= (range / RANGE_SCALE) * 0.035) { 
                    if (dist < minDist) {
                        minDist = dist;
                        target = enemy;
                    }
                }
            }
        }
        
        // Update State if target changed
        const currentTargetId = target ? target.id : null;
        if (tower.targetId !== currentTargetId) {
            updateTowerTarget(tower.id, currentTargetId);
        }

        // Fire Logic (Check cooldown)
        if (target && (!tower.lastShot || now >= tower.lastShot + stats.cooldown)) {
            const damage = stats.minDmg + Math.random() * (stats.maxDmg - stats.minDmg);
            const multiplier = tower.damageMultiplier || 1;

            // Update Cooldown - Set to NOW (Time of fire)
            updateTowerCooldown(tower.id, now);

            // --- DELAY PROJECTILE SPAWN ---
            // Visual delay for recoil impact
            const isOrb = ORB_TYPES.includes(tower.gemType);
            const isSnake = tower.gemType === GemType.EMERALD || tower.gemType === GemType.DARK_EMERALD;
            const isAquamarine = tower.gemType === GemType.AQUAMARINE;
            // Snake: spawn mid-stroke (~90ms) to align with forward reach
            const impactDelay = isSnake
                ? 90
                : (isOrb ? 50 : (isAquamarine ? AQUAMARINE_PROJECTILE_VISUAL_DELAY_MS : 200));

            setTimeout(() => {
                let spawnX = tower.x;
                let spawnZ = tower.y;
                let spawnY = 0.5; 

                if (target) {
                    const dirX = target.x - tower.x;
                    const dirZ = target.y - tower.y; 
                    const len = Math.sqrt(dirX * dirX + dirZ * dirZ);
                    let fX = 0;
                    let fZ = 0;

                    if (len > 0.001) {
                        fX = dirX / len;
                        fZ = dirZ / len;

                        if (isSnake) {
                            // Snake mouth position - spawn at mouth tip using same forward dir
                            const offsetForward = 0.38;
                            spawnX = tower.x + (fX * offsetForward);
                            spawnZ = tower.y + (fZ * offsetForward);
                            spawnY = 0.55; // Lower to align with mouth, not the top glow
                        } else if (isOrb) {
                            // Floating Chest Center Spawn
                            // Slightly forward to clear the mesh
                            const offsetForward = 0.3; 
                            spawnX = tower.x + (fX * offsetForward);
                            spawnZ = tower.y + (fZ * offsetForward);
                            spawnY = 1.2; // Chest Height
                        } else {
                            // Standard Golem (Right Hand approximation)
                            // Right Vector (-fZ, fX)
                            const rX = -fZ;
                            const rZ = fX;
                            const offsetRight = 0.45; 
                            const offsetForward = 0.5; 
                            spawnX = tower.x + (rX * offsetRight) + (fX * offsetForward);
                            spawnZ = tower.y + (rZ * offsetRight) + (fZ * offsetForward);
                            spawnY = 0.6; // Hand Height
                        }
                    }
                    
                    const spawnTime = clockRef.current;

                    console.log('SNAKE_DEBUG_SPAWN', {
                        impactDelay,
                        timeSinceShotAtSpawn: Date.now() - now,
                        spawn: { x: spawnX, y: spawnY, z: spawnZ },
                        dir: { x: fX, z: fZ },
                        tower: { x: tower.x, y: tower.y },
                    });

                    const dirToTargetX = target.x - spawnX;
                    const dirToTargetY = (target.isFlying ? 1.5 : 0.4) - spawnY;
                    const dirToTargetZ = target.y - spawnZ;
                    const dirMag = Math.max(Math.hypot(dirToTargetX, dirToTargetY, dirToTargetZ), 0.001);

                    spawnProjectile({
                        id: `proj-${tower.id}-${Date.now()}`,
                        x: spawnX,
                        y: spawnY,
                        z: spawnZ, 
                        targetId: target.id,
                        damage: damage * multiplier,
                        sourceType: tower.gemType!,
                        speed: 15.0, 
                        color: GEM_COLORS[tower.gemType!],
                        isSplash: stats.special.includes('Splash') || stats.special.includes('Area'),
                        splashRadius: stats.special.includes('Area') ? 2.5 : 1.5,
                        homing: true,
                        spawnTime: spawnTime,
                        vx: (dirToTargetX / dirMag) * 15.0,
                        vy: (dirToTargetY / dirMag) * 15.0,
                        vz: (dirToTargetZ / dirMag) * 15.0,
                    });

                     // --- GREEDY MECHANIC ---
                    if (stats.special.includes('Gold Chance') || tower.gemType === GemType.GOLD) {
                        if (Math.random() <= GREEDY_CHANCE) {
                            const goldAmount = Math.ceil(wave * 0.5) + GREEDY_BONUS_BASE;
                            addGold(goldAmount, tower.x, tower.y);
                        }
                    }
                }
            }, impactDelay);
        }
    });
  });

  return null;
};
