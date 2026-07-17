
import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../../store/useGameStore';
import { CELL_SIZE, BOARD_OFFSET_X, BOARD_OFFSET_Z } from '../../constants';
import { GemType } from '../../constants';
import {
    getProjectileStyle,
    crystalGeo, spikeGeo, meteorGeo, orbGeo, liquidGeo, dropletGeo, cometGeo,
    createProjectileMaterials,
    ENEMY_GROUND_Y, ENEMY_FLYING_Y, HIT_RADIUS, HIT_RADIUS_AQUAMARINE,
} from './projectiles/ProjectileEngine';

const tempObj = new THREE.Object3D();
const tempColor = new THREE.Color();

export const Projectiles: React.FC = () => {
  const crystalRef  = useRef<THREE.InstancedMesh>(null);
  const spikeRef    = useRef<THREE.InstancedMesh>(null);
  const meteorRef   = useRef<THREE.InstancedMesh>(null);
  const orbRef      = useRef<THREE.InstancedMesh>(null);
  const liquidRef   = useRef<THREE.InstancedMesh>(null);
  const dropletsRef = useRef<THREE.InstancedMesh>(null);
  const cometRef    = useRef<THREE.InstancedMesh>(null);

  const projectiles    = useGameStore((state) => state.projectiles);
  const enemies        = useGameStore((state) => state.enemies);
  const damageEnemy    = useGameStore((state) => state.damageEnemy);
  const removeProjectile = useGameStore((state) => state.removeProjectile);

  const materials = useMemo(() => createProjectileMaterials(), []);

  useFrame((state, delta) => {
    const time = state.clock.getElapsedTime();

    materials.crystal.uniforms.time.value = time;
    materials.spike.uniforms.time.value   = time;
    materials.meteor.uniforms.time.value  = time;
    materials.orb.uniforms.time.value     = time;
    materials.comet.uniforms.time.value   = time;
    materials.liquid.uniforms.time.value  = time;

    let cCount = 0, sCount = 0, mCount = 0, oCount = 0, lCount = 0, dCount = 0;

    for (let i = 0; i < projectiles.length; i++) {
      const proj   = projectiles[i];
      const target = enemies.find(e => e.id === proj.targetId);

      if (!target || target.isDead) {
        removeProjectile(proj.id);
        continue;
      }

      const isAquamarine = proj.sourceType === GemType.AQUAMARINE;
      const enemyHeight  = target.isFlying ? ENEMY_FLYING_Y : ENEMY_GROUND_Y;
      const hitRadius    = isAquamarine ? HIT_RADIUS_AQUAMARINE : HIT_RADIUS;

      const dx   = target.x - proj.x;
      const dy   = enemyHeight - proj.y;
      const dz   = target.y - proj.z;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

      // ── Hit detection ──────────────────────────────────────────────────────
      if (dist < hitRadius) {
        damageEnemy(proj.targetId, proj.damage, proj.sourceType, false);
        if (proj.isSplash) {
          enemies.forEach(e => {
            if (e.id === target.id || e.isDead) return;
            const d2 = Math.sqrt(Math.pow(e.x - target.x, 2) + Math.pow(e.y - target.y, 2));
            if (d2 < (proj.splashRadius || 1.5)) {
              damageEnemy(e.id, proj.damage * 0.5, proj.sourceType, true);
            }
          });
        }
        removeProjectile(proj.id);
        continue;
      }

      // ── Movement ───────────────────────────────────────────────────────────
      const prevX = proj.x;
      const prevY = proj.y;
      const prevZ = proj.z;

      if (isAquamarine) {
        const currentDist  = Math.max(dist, 0.001);
        const speedMult    = currentDist > 4 ? 2.4 : 1.9;
        const moveDist     = proj.speed * speedMult * delta;

        const desiredX = dx / currentDist;
        const desiredY = dy / currentDist;
        const desiredZ = dz / currentDist;

        const currentVelMag = Math.hypot(proj.vx ?? 0, proj.vy ?? 0, proj.vz ?? 0);
        let cdX = currentVelMag > 0.0001 ? (proj.vx ?? 0) / currentVelMag : desiredX;
        let cdY = currentVelMag > 0.0001 ? (proj.vy ?? 0) / currentVelMag : desiredY;
        let cdZ = currentVelMag > 0.0001 ? (proj.vz ?? 0) / currentVelMag : desiredZ;

        const turnLerp = Math.min(1, delta * 8.5);
        cdX += (desiredX - cdX) * turnLerp;
        cdY += (desiredY - cdY) * turnLerp;
        cdZ += (desiredZ - cdZ) * turnLerp;

        const dirMag = Math.max(Math.hypot(cdX, cdY, cdZ), 0.001);
        cdX /= dirMag; cdY /= dirMag; cdZ /= dirMag;

        proj.vx = cdX * proj.speed * speedMult;
        proj.vy = cdY * proj.speed * speedMult;
        proj.vz = cdZ * proj.speed * speedMult;

        if (moveDist >= currentDist) {
          proj.x = target.x; proj.y = enemyHeight; proj.z = target.y;
        } else {
          proj.x += cdX * moveDist;
          proj.y += cdY * moveDist;
          proj.z += cdZ * moveDist;
        }
      } else {
        const moveDist = proj.speed * delta;
        if (moveDist >= dist) {
          proj.x = target.x; proj.y = enemyHeight; proj.z = target.y;
        } else {
          const factor = moveDist / dist;
          proj.x += dx * factor;
          proj.y += dy * factor;
          proj.z += dz * factor;
        }
      }

      // ── Segment hit sweep ──────────────────────────────────────────────────
      const segDX = proj.x - prevX;
      const segDY = proj.y - prevY;
      const segDZ = proj.z - prevZ;
      const segLenSq = segDX*segDX + segDY*segDY + segDZ*segDZ;
      if (segLenSq > 0.000001) {
        const toTX = target.x - prevX;
        const toTY = enemyHeight - prevY;
        const toTZ = target.y - prevZ;
        const t = Math.min(1, Math.max(0, (toTX*segDX + toTY*segDY + toTZ*segDZ) / segLenSq));
        const cx = prevX + segDX * t;
        const cy = prevY + segDY * t;
        const cz = prevZ + segDZ * t;
        const missDist = Math.hypot(target.x - cx, enemyHeight - cy, target.y - cz);

        if (missDist < hitRadius) {
          damageEnemy(proj.targetId, proj.damage, proj.sourceType, false);
          if (proj.isSplash) {
            enemies.forEach(e => {
              if (e.id === target.id || e.isDead) return;
              const d2 = Math.sqrt(Math.pow(e.x - target.x, 2) + Math.pow(e.y - target.y, 2));
              if (d2 < (proj.splashRadius || 1.5)) {
                damageEnemy(e.id, proj.damage * 0.5, proj.sourceType, true);
              }
            });
          }
          removeProjectile(proj.id);
          continue;
        }
      }

      // ── Visuals ────────────────────────────────────────────────────────────
      const style = getProjectileStyle(proj.sourceType);
      if (style === 'HIDDEN') continue;

      const rX = proj.x * CELL_SIZE + BOARD_OFFSET_X;
      const rY = proj.y;
      const rZ = proj.z * CELL_SIZE + BOARD_OFFSET_Z;
      const tX = target.x * CELL_SIZE + BOARD_OFFSET_X;
      const tY = target.isFlying ? ENEMY_FLYING_Y : ENEMY_GROUND_Y;
      const tZ = target.y * CELL_SIZE + BOARD_OFFSET_Z;

      const age         = time - proj.spawnTime;
      const growProgress = Math.min(age * 5.0, 1.0);
      const scaleMult   = 1 - Math.pow(1 - growProgress, 3);

      tempObj.position.set(rX, rY, rZ);
      tempObj.lookAt(tX, tY, tZ);

      if (style === 'CRYSTAL') {
        tempObj.rotateZ(time * 15);
        tempObj.scale.set(0.6 * scaleMult, 0.6 * scaleMult, 2.5 * scaleMult);
        tempObj.updateMatrix();
        crystalRef.current!.setMatrixAt(cCount, tempObj.matrix);
        crystalRef.current!.setColorAt(cCount, tempColor.set(proj.color));
        cCount++;
      } else if (style === 'SPIKE') {
        tempObj.rotateZ(time * 25);
        tempObj.scale.set(1.2 * scaleMult, 1.2 * scaleMult, 2.0 * scaleMult);
        tempObj.updateMatrix();
        spikeRef.current!.setMatrixAt(sCount, tempObj.matrix);
        spikeRef.current!.setColorAt(sCount, tempColor.set(proj.color));
        sCount++;
      } else if (style === 'METEOR') {
        tempObj.rotation.set(time * 8 + i, time * 5, i);
        const pulse = 1.0 + Math.sin(time * 20 + i) * 0.2;
        const s = pulse * scaleMult;
        tempObj.scale.set(s, s, s);
        tempObj.updateMatrix();
        meteorRef.current!.setMatrixAt(mCount, tempObj.matrix);
        meteorRef.current!.setColorAt(mCount, tempColor.set(proj.color));
        mCount++;
      } else if (style === 'LIQUID' || style === 'VENOM') {
        const isVenom    = style === 'VENOM';
        const venomPulse = isVenom ? (0.88 + Math.sin(time * 20 + i * 0.6) * 0.16) : 1.0;
        if (isAquamarine) {
          const wrapPulse = 1.0 + Math.sin(time * 40 + i) * 0.15;
          tempObj.scale.set(0.45 * scaleMult, 0.45 * scaleMult, 3.2 * scaleMult * wrapPulse);
          tempObj.rotateZ(Math.sin(time * 30 + i) * 0.35);
        } else {
          tempObj.scale.set(0.6 * scaleMult * venomPulse, 0.6 * scaleMult, 2.5 * scaleMult * (isVenom ? 1.2 : 1.0));
        }
        tempObj.updateMatrix();
        liquidRef.current!.setMatrixAt(lCount, tempObj.matrix);
        liquidRef.current!.setColorAt(lCount, tempColor.set(proj.color));
        lCount++;

        // Trail droplets
        const wx = tX - rX;
        const wy = tY - rY;
        const wz = tZ - rZ;
        const wDist = Math.sqrt(wx*wx + wy*wy + wz*wz) || 0.001;
        const nx = wx / wDist;
        const ny = wy / wDist;
        const nz = wz / wDist;

        const numDrops = isVenom ? 8 : 5;
        for (let k = 1; k <= numDrops; k++) {
          const lag    = k * 0.35;
          const jitter = isVenom ? 0.22 : 0.15;
          const dX = rX - (nx * lag) + (Math.random() - 0.5) * jitter;
          const dY = rY - (ny * lag) + (Math.random() - 0.5) * jitter;
          const dZ = rZ - (nz * lag) + (Math.random() - 0.5) * jitter;
          tempObj.position.set(dX, dY, dZ);
          tempObj.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
          const dScale = ((scaleMult * (isVenom ? 0.65 : 0.5)) / (1 + k * 0.3)) * venomPulse;
          tempObj.scale.setScalar(dScale);
          tempObj.updateMatrix();
          if (dropletsRef.current) {
            dropletsRef.current.setMatrixAt(dCount, tempObj.matrix);
            dropletsRef.current.setColorAt(dCount, tempColor.set(proj.color).multiplyScalar(isVenom ? 1.2 : 1.0));
          }
          dCount++;
        }
      } else { // ORB + comet tail
        const s = scaleMult;
        tempObj.scale.set(s, s, s);
        tempObj.updateMatrix();
        orbRef.current!.setMatrixAt(oCount, tempObj.matrix);
        orbRef.current!.setColorAt(oCount, tempColor.set(proj.color));

        const tailScale = s * 1.2;
        tempObj.scale.set(tailScale, tailScale, tailScale);
        tempObj.updateMatrix();
        cometRef.current!.setMatrixAt(oCount, tempObj.matrix);
        cometRef.current!.setColorAt(oCount, tempColor);

        oCount++;
      }
    }

    // ── Flush instance counts ──────────────────────────────────────────────
    if (crystalRef.current) {
      crystalRef.current.count = cCount;
      crystalRef.current.instanceMatrix.needsUpdate = true;
      if (crystalRef.current.instanceColor) crystalRef.current.instanceColor.needsUpdate = true;
    }
    if (spikeRef.current) {
      spikeRef.current.count = sCount;
      spikeRef.current.instanceMatrix.needsUpdate = true;
      if (spikeRef.current.instanceColor) spikeRef.current.instanceColor.needsUpdate = true;
    }
    if (meteorRef.current) {
      meteorRef.current.count = mCount;
      meteorRef.current.instanceMatrix.needsUpdate = true;
      if (meteorRef.current.instanceColor) meteorRef.current.instanceColor.needsUpdate = true;
    }
    if (liquidRef.current) {
      liquidRef.current.count = lCount;
      liquidRef.current.instanceMatrix.needsUpdate = true;
      if (liquidRef.current.instanceColor) liquidRef.current.instanceColor.needsUpdate = true;
    }
    if (dropletsRef.current) {
      dropletsRef.current.count = dCount;
      dropletsRef.current.instanceMatrix.needsUpdate = true;
      if (dropletsRef.current.instanceColor) dropletsRef.current.instanceColor.needsUpdate = true;
    }
    if (orbRef.current) {
      orbRef.current.count = oCount;
      orbRef.current.instanceMatrix.needsUpdate = true;
      if (orbRef.current.instanceColor) orbRef.current.instanceColor.needsUpdate = true;
    }
    if (cometRef.current) {
      cometRef.current.count = oCount;
      cometRef.current.instanceMatrix.needsUpdate = true;
      if (cometRef.current.instanceColor) cometRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group>
      <instancedMesh ref={crystalRef}  args={[crystalGeo,  materials.crystal, 100]} frustumCulled={false} />
      <instancedMesh ref={spikeRef}    args={[spikeGeo,    materials.spike,   100]} frustumCulled={false} />
      <instancedMesh ref={meteorRef}   args={[meteorGeo,   materials.meteor,  100]} frustumCulled={false} />
      <instancedMesh ref={liquidRef}   args={[liquidGeo,   materials.liquid,  100]} frustumCulled={false} />
      <instancedMesh ref={dropletsRef} args={[dropletGeo,  materials.liquid,  500]} frustumCulled={false} />
      <instancedMesh ref={orbRef}      args={[orbGeo,      materials.orb,     100]} frustumCulled={false} />
      <instancedMesh ref={cometRef}    args={[cometGeo,    materials.comet,   100]} frustumCulled={false} />
    </group>
  );
};
