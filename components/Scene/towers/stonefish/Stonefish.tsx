import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { GemMaterialConfig, StonefishAimData, minimumJerk01 } from '../shared/types';
import { buildGemMaterial } from '../shared/TowerEngine';
import {
    AQUAMARINE_MIN_FLIGHT_MS,
    AQUAMARINE_PROJECTILE_VISUAL_DELAY_MS,
    AQUAMARINE_RECOVERY_MS,
    AQUAMARINE_WINDUP_MS,
    PROJECTILE_SPEED_GRID_PER_SEC,
} from '../../attackTimings';

export const ProceduralStonefish: React.FC<{
    physics: GemMaterialConfig;
    envMap: THREE.Texture | null;
    timeSinceShotRef: React.MutableRefObject<number>;
    stonefishAimRef: React.MutableRefObject<StonefishAimData>;
}> = ({ physics, envMap, timeSinceShotRef, stonefishAimRef }) => {
    const bodyRef = useRef<THREE.Group>(null);
    const tendrils = useRef<(THREE.Mesh | null)[][]>([[], [], [], []]);
    const droplets = useRef<(THREE.Mesh | null)[]>([]);
    const prevTimeSinceShotRef = useRef<number>(Number.POSITIVE_INFINITY);
    const smoothedTargetRef = useRef(new THREE.Vector3(0, 0.45, 3.0));
    const smoothedTargetVelRef = useRef(new THREE.Vector3());
    const shotLockRef = useRef({
        targetId: null as string | null,
        lockedTargetLocal: new THREE.Vector3(0, 0.45, 3.0),
        distanceGrid: 1,
        flightMs: AQUAMARINE_MIN_FLIGHT_MS,
    });

    const TENDRIL_COUNT = 4;
    const TENDRIL_SEGMENTS = 18;
    const DROPLET_COUNT = 24;
    const INNER_FLUID_COUNT = 18;
    const CONTROL_POINTS = 6;
    const RAW_SAMPLES = 28;

    const fluidGroupOffset = useMemo(() => new THREE.Vector3(0, 0.7, 0), []);
    const nozzleCenter = useMemo(() => new THREE.Vector3(0, -0.05, 0.2), []);
    const upAxis = useMemo(() => new THREE.Vector3(0, 1, 0), []);

    const armConfigs = useMemo(() => ([
        { side: -1, ySlot: 0.30,  zSlot: 0.10,  phase: 0.0,  base: new THREE.Vector3(-0.34,  0.10, 0.05) },
        { side: -1, ySlot: -0.35, zSlot: -0.06, phase: 1.1,  base: new THREE.Vector3(-0.30, -0.16, 0.10) },
        { side:  1, ySlot: 0.30,  zSlot: -0.10, phase: 0.55, base: new THREE.Vector3( 0.34,  0.10, 0.05) },
        { side:  1, ySlot: -0.35, zSlot: 0.06,  phase: 1.75, base: new THREE.Vector3( 0.30, -0.16, 0.10) },
    ]), []);

    const teardropGeo = useMemo(() => {
        const pts: THREE.Vector2[] = [];
        for (let i = 0; i <= 32; i++) {
            const t = i / 32;
            let r: number;
            if (t < 0.1) r = (t / 0.1) * 0.08;
            else if (t < 0.35) r = 0.08 + ((t - 0.1) / 0.25) * 0.25;
            else if (t < 0.9)  r = 0.33 + Math.sin(((t - 0.35) / 0.55) * Math.PI) * 0.35;
            else               r = 0.33 * (1 - (t - 0.9) / 0.1);
            pts.push(new THREE.Vector2(r, t * 1.8 - 0.3));
        }
        pts.push(new THREE.Vector2(0, 1.5));
        return new THREE.LatheGeometry(pts, 32);
    }, []);

    const crystalMat = useMemo(() => buildGemMaterial({
        color: '#7fffff', emissive: '#00e5ff',
        emissiveIntensity: 0.26 + physics.emissiveIntensity * 0.015,
        metalness: 0.0, roughness: 0.07, transmission: 0.7, thickness: 1.8,
        clearcoat: 1.0, clearcoatRoughness: 0.05, ior: 1.65,
        sheen: 1.0, sheenColor: new THREE.Color('#00ffff'), sheenRoughness: 0.24,
    }, envMap, 1.5), [envMap, physics.emissiveIntensity]);

    const waterMat = useMemo(() => buildGemMaterial({
        color: '#c0f8ff', emissive: '#00d4ff', emissiveIntensity: 0.5,
        metalness: 0.0, roughness: 0.0, transmission: 0.92, thickness: 0.3,
        transparent: true, opacity: 0.72, side: THREE.DoubleSide, ior: 1.33,
        depthWrite: false,
    }, envMap, 1.5), [envMap]);

    const innerFluidMat = useMemo(() => buildGemMaterial({
        color: '#a7f5ff', emissive: '#4fdfff', emissiveIntensity: 0.22,
        metalness: 0, roughness: 0.03, transmission: 0.94, thickness: 0.42,
        transparent: true, opacity: 0.48, ior: 1.33, depthWrite: false,
    }, envMap, 1.3), [envMap]);

    const innerFluid = useRef<(THREE.Mesh | null)[]>([]);

    const innerFluidSeeds = useMemo(() => {
        const fract = (v: number) => v - Math.floor(v);
        const hash = (v: number) => fract(Math.sin(v * 91.371 + 12.73) * 47453.5453);
        return Array.from({ length: INNER_FLUID_COUNT }, (_, i) => ({
            phase: hash(i * 0.71 + 0.9) * Math.PI * 2,
            radius: 0.06 + hash(i * 1.27 + 3.2) * 0.24,
            swirl: 0.6 + hash(i * 1.91 + 1.4) * 1.4,
            yBias: -0.55 + hash(i * 2.23 + 5.7) * 1.1,
            scale: 0.04 + hash(i * 0.57 + 7.5) * 0.055,
            wobble: 0.05 + hash(i * 1.37 + 6.6) * 0.14,
        }));
    }, []);

    const armScratch = useMemo(() => (
        Array.from({ length: TENDRIL_COUNT }, () => ({
            control: Array.from({ length: CONTROL_POINTS }, () => new THREE.Vector3()),
            raw: Array.from({ length: RAW_SAMPLES }, () => new THREE.Vector3()),
            uniform: Array.from({ length: TENDRIL_SEGMENTS }, () => new THREE.Vector3()),
            tangents: Array.from({ length: TENDRIL_SEGMENTS }, () => new THREE.Vector3(0, 0, 1)),
            lengths: new Float32Array(RAW_SAMPLES),
            tip: new THREE.Vector3(),
            tipDir: new THREE.Vector3(0, 0, 1),
        }))
    ), []);

    const dropletSeeds = useMemo(() => {
        const fract = (v: number) => v - Math.floor(v);
        const hash = (v: number) => fract(Math.sin(v * 12.9898 + 78.233) * 43758.5453123);
        return Array.from({ length: DROPLET_COUNT }, (_, i) => ({
            arm: i % TENDRIL_COUNT,
            orbitPhase: hash(i + 0.3) * Math.PI * 2,
            orbitRadius: 0.38 + hash(i * 1.31 + 2.1) * 0.7,
            heightBias: -0.28 + hash(i * 0.73 + 4.2) * 0.8,
            lag: 0.12 + hash(i * 1.9 + 9.7) * 0.95,
            phase: hash(i * 2.7 + 1.7) * Math.PI * 2,
            splash: hash(i * 3.9 + 0.4),
        }));
    }, []);

    const temp = useMemo(() => ({
        desiredTarget: new THREE.Vector3(), chosenTarget: new THREE.Vector3(),
        bodyPos: new THREE.Vector3(), fluidTarget: new THREE.Vector3(),
        attackTarget: new THREE.Vector3(), tip: new THREE.Vector3(),
        idleTip: new THREE.Vector3(), dir: new THREE.Vector3(),
        tmp1: new THREE.Vector3(), tmp2: new THREE.Vector3(), tmp3: new THREE.Vector3(),
        tangent: new THREE.Vector3(), dropIdle: new THREE.Vector3(),
        dropTrail: new THREE.Vector3(), dropSplash: new THREE.Vector3(),
        jitter: new THREE.Vector3(),
    }), []);

    const catmullRom = (p0: number, p1: number, p2: number, p3: number, t: number) => {
        const t2 = t * t, t3 = t2 * t;
        return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    };

    const sampleSplinePoint = (out: THREE.Vector3, cps: THREE.Vector3[], u: number) => {
        const splineT = u * (cps.length - 1);
        const idx = Math.min(Math.floor(splineT), cps.length - 2);
        const frac = splineT - idx;
        const i0 = Math.max(idx - 1, 0), i1 = idx;
        const i2 = Math.min(idx + 1, cps.length - 1), i3 = Math.min(idx + 2, cps.length - 1);
        out.set(
            catmullRom(cps[i0].x, cps[i1].x, cps[i2].x, cps[i3].x, frac),
            catmullRom(cps[i0].y, cps[i1].y, cps[i2].y, cps[i3].y, frac),
            catmullRom(cps[i0].z, cps[i1].z, cps[i2].z, cps[i3].z, frac),
        );
    };

    const resampleArm = (armIdx: number) => {
        const a = armScratch[armIdx];
        for (let i = 0; i < RAW_SAMPLES; i++) sampleSplinePoint(a.raw[i], a.control, i / (RAW_SAMPLES - 1));
        a.lengths[0] = 0;
        for (let i = 1; i < RAW_SAMPLES; i++) a.lengths[i] = a.lengths[i - 1] + a.raw[i].distanceTo(a.raw[i - 1]);
        const totalLen = a.lengths[RAW_SAMPLES - 1];
        if (totalLen < 1e-5) {
            for (let i = 0; i < TENDRIL_SEGMENTS; i++) { a.uniform[i].copy(a.control[0]); a.tangents[i].set(0, 0, 1); }
            a.tip.copy(a.control[a.control.length - 1]); a.tipDir.set(0, 0, 1); return;
        }
        let cursor = 1;
        for (let i = 0; i < TENDRIL_SEGMENTS; i++) {
            const targetLen = totalLen * (i / (TENDRIL_SEGMENTS - 1));
            while (cursor < RAW_SAMPLES - 1 && a.lengths[cursor] < targetLen) cursor++;
            const hi = cursor, lo = Math.max(0, hi - 1);
            const alpha = THREE.MathUtils.clamp((targetLen - a.lengths[lo]) / Math.max(a.lengths[hi] - a.lengths[lo], 1e-5), 0, 1);
            a.uniform[i].copy(a.raw[lo]).lerp(a.raw[hi], alpha);
        }
        for (let i = 0; i < TENDRIL_SEGMENTS; i++) {
            const prev = a.uniform[Math.max(0, i - 1)], next = a.uniform[Math.min(TENDRIL_SEGMENTS - 1, i + 1)];
            a.tangents[i].copy(next).sub(prev);
            if (a.tangents[i].lengthSq() < 1e-6) a.tangents[i].set(0, 0, 1);
        }
        a.tip.copy(a.uniform[TENDRIL_SEGMENTS - 1]);
        a.tipDir.copy(a.tangents[TENDRIL_SEGMENTS - 1]).normalize();
    };

    const springDampVec3 = (current: THREE.Vector3, velocity: THREE.Vector3, target: THREE.Vector3, omega: number, dt: number) => {
        if (dt <= 0) return;
        const f = 1 + 2 * dt * omega, oo = omega * omega, hoo = dt * oo, hhoo = dt * hoo;
        const detInv = 1 / (f + hhoo);
        const cx = current.x, cy = current.y, cz = current.z;
        const vx = velocity.x, vy = velocity.y, vz = velocity.z;
        const tx = target.x, ty = target.y, tz = target.z;
        current.x = (f * cx + dt * vx + hhoo * tx) * detInv;
        current.y = (f * cy + dt * vy + hhoo * ty) * detInv;
        current.z = (f * cz + dt * vz + hhoo * tz) * detInv;
        velocity.x = (vx + hoo * (tx - cx)) * detInv;
        velocity.y = (vy + hoo * (ty - cy)) * detInv;
        velocity.z = (vz + hoo * (tz - cz)) * detInv;
    };

    const hash01 = (v: number) => { const n = Math.sin(v * 12.9898 + 78.233) * 43758.5453123; return n - Math.floor(n); };

    useFrame((state, delta) => {
        const et = state.clock.getElapsedTime();
        const dt = Math.min(delta, 0.05);
        const timeSinceShot = timeSinceShotRef.current ?? Number.POSITIVE_INFINITY;
        const prevTimeSinceShot = prevTimeSinceShotRef.current;
        const shotTriggered = timeSinceShot < prevTimeSinceShot && timeSinceShot < (AQUAMARINE_PROJECTILE_VISUAL_DELAY_MS + 60);

        const aim = stonefishAimRef.current;
        temp.desiredTarget.copy(aim.hasTarget ? aim.localTarget : shotLockRef.current.lockedTargetLocal);
        springDampVec3(smoothedTargetRef.current, smoothedTargetVelRef.current, temp.desiredTarget, 12, dt);

        if (shotTriggered) {
            shotLockRef.current.lockedTargetLocal.copy(aim.hasTarget ? aim.localTarget : smoothedTargetRef.current);
            shotLockRef.current.targetId = aim.targetId;
            shotLockRef.current.distanceGrid = Math.max(aim.distanceGrid || 0.6, 0.6);
            shotLockRef.current.flightMs = Math.max(AQUAMARINE_MIN_FLIGHT_MS, (shotLockRef.current.distanceGrid / PROJECTILE_SPEED_GRID_PER_SEC) * 1000);
        }
        prevTimeSinceShotRef.current = timeSinceShot;

        const flightMs = shotLockRef.current.flightMs;
        const impactMs = AQUAMARINE_PROJECTILE_VISUAL_DELAY_MS + flightMs;
        const recoverEndMs = impactMs + AQUAMARINE_RECOVERY_MS;
        const attackWindowMs = Math.max(420, recoverEndMs);
        const isAttack = timeSinceShot < attackWindowMs;

        const windupT = minimumJerk01(timeSinceShot / AQUAMARINE_WINDUP_MS);
        const preDelayT = minimumJerk01((timeSinceShot - AQUAMARINE_WINDUP_MS) / Math.max(1, AQUAMARINE_PROJECTILE_VISUAL_DELAY_MS - AQUAMARINE_WINDUP_MS));
        const flightT = minimumJerk01((timeSinceShot - AQUAMARINE_PROJECTILE_VISUAL_DELAY_MS) / Math.max(flightMs, 1));
        const recoverT = minimumJerk01((timeSinceShot - impactMs) / AQUAMARINE_RECOVERY_MS);

        let pressurize = 0;
        if (timeSinceShot < AQUAMARINE_WINDUP_MS) pressurize = windupT;
        else if (timeSinceShot < AQUAMARINE_PROJECTILE_VISUAL_DELAY_MS) pressurize = 1 - preDelayT * 0.08;
        else if (timeSinceShot < impactMs) pressurize = 0.92 - flightT * 0.62;
        else if (timeSinceShot < recoverEndMs) pressurize = 0.3 * (1 - recoverT);
        pressurize = THREE.MathUtils.clamp(pressurize, 0, 1);

        let travelAlpha = 0;
        if (timeSinceShot >= AQUAMARINE_PROJECTILE_VISUAL_DELAY_MS && timeSinceShot < impactMs) {
            travelAlpha = flightT;
        } else if (timeSinceShot >= impactMs && timeSinceShot < recoverEndMs) {
            const rebound = Math.sin(recoverT * Math.PI * 2.2) * Math.exp(-3.2 * recoverT) * 0.08;
            travelAlpha = THREE.MathUtils.clamp(1 - recoverT + rebound, 0, 1.05);
        }
        const releaseStretch = THREE.MathUtils.clamp((timeSinceShot - AQUAMARINE_PROJECTILE_VISUAL_DELAY_MS) / 75, 0, 1) * (1 - THREE.MathUtils.clamp((timeSinceShot - impactMs) / 120, 0, 1));
        const impactPulse = timeSinceShot >= impactMs ? Math.exp(-(timeSinceShot - impactMs) / 130) : 0;
        const attackEnergy = THREE.MathUtils.clamp(Math.max(pressurize * 0.85, travelAlpha, impactPulse), 0, 1.2);

        temp.chosenTarget.copy(isAttack ? shotLockRef.current.lockedTargetLocal : smoothedTargetRef.current);

        if (bodyRef.current) {
            const floatY = 1.2 + Math.sin(et * 1.1) * 0.1;
            bodyRef.current.position.y = THREE.MathUtils.lerp(bodyRef.current.position.y, floatY - pressurize * 0.03 + impactPulse * 0.02, 0.14);
            bodyRef.current.position.z = THREE.MathUtils.lerp(bodyRef.current.position.z, -(pressurize * 0.12 + releaseStretch * 0.05) + impactPulse * 0.04, 0.18);
            bodyRef.current.position.x = THREE.MathUtils.lerp(bodyRef.current.position.x, -temp.chosenTarget.x * 0.018 * attackEnergy, 0.08);
            bodyRef.current.rotation.z = Math.sin(et * 0.65) * 0.04 + temp.chosenTarget.x * 0.012;
            bodyRef.current.rotation.x = Math.sin(et * 0.45) * 0.03 - pressurize * 0.06 + impactPulse * 0.03;
        }

        temp.bodyPos.copy(bodyRef.current?.position ?? new THREE.Vector3(0, 1.2, 0));
        temp.fluidTarget.copy(temp.chosenTarget).sub(temp.bodyPos).sub(fluidGroupOffset);
        temp.fluidTarget.x = THREE.MathUtils.clamp(temp.fluidTarget.x, -3.2, 3.2);
        temp.fluidTarget.y = THREE.MathUtils.clamp(temp.fluidTarget.y, -0.6, 2.4);
        temp.fluidTarget.z = Math.max(temp.fluidTarget.z, 1.2);

        waterMat.emissiveIntensity = 0.46 + attackEnergy * 0.68 + impactPulse * 0.25;
        waterMat.opacity = THREE.MathUtils.clamp(0.62 + attackEnergy * 0.2, 0.55, 0.9);
        waterMat.thickness = 0.25 + attackEnergy * 0.18;
        crystalMat.emissiveIntensity = 0.24 + pressurize * 0.08 + impactPulse * 0.05;
        innerFluidMat.emissiveIntensity = 0.18 + attackEnergy * 0.25 + impactPulse * 0.14;
        innerFluidMat.opacity = THREE.MathUtils.clamp(0.38 + attackEnergy * 0.22, 0.34, 0.66);

        for (let tIdx = 0; tIdx < TENDRIL_COUNT; tIdx++) {
            const cfg = armConfigs[tIdx];
            const a = armScratch[tIdx];
            const cps = a.control;
            const convergence = THREE.MathUtils.clamp(Math.max(pressurize, travelAlpha) + releaseStretch * 0.2, 0, 1);
            const ph = cfg.phase;

            cps[0].copy(cfg.base);
            temp.attackTarget.copy(temp.fluidTarget);
            temp.attackTarget.x += cfg.side * 0.08 * (1 - convergence);
            temp.attackTarget.y += cfg.ySlot * 0.08 * (1 - convergence);
            temp.attackTarget.z += cfg.zSlot * 0.05 * (1 - convergence);
            if (impactPulse > 0.001) {
                temp.tmp1.copy(temp.attackTarget).sub(nozzleCenter);
                if (temp.tmp1.lengthSq() > 1e-6) {
                    temp.tmp1.normalize();
                    temp.attackTarget.addScaledVector(temp.tmp1, impactPulse * 0.15 * (0.9 + tIdx * 0.05));
                }
            }
            temp.idleTip.set(
                cfg.side * (0.95 + Math.sin(et * 0.9 + ph) * 0.14),
                cfg.ySlot * 0.52 + Math.sin(et * 1.6 + ph * 1.7) * 0.16,
                1.18 + cfg.zSlot * 0.3 + Math.cos(et * 1.2 + ph) * 0.2
            );
            temp.tip.copy(temp.idleTip).lerp(temp.attackTarget, THREE.MathUtils.clamp(travelAlpha, 0, 1));
            if (timeSinceShot < AQUAMARINE_PROJECTILE_VISUAL_DELAY_MS) {
                temp.tip.lerp(nozzleCenter, pressurize * 0.68);
                temp.tip.z -= pressurize * (0.2 + Math.abs(cfg.ySlot) * 0.07);
                temp.tip.x += cfg.side * pressurize * 0.045;
            }
            temp.dir.copy(temp.tip).sub(nozzleCenter);
            const dirLen = Math.max(temp.dir.length(), 1e-4);
            temp.dir.divideScalar(dirLen);

            const idleNoiseX = Math.sin(et * 2.1 + ph * 1.9) * 0.14 * (1 - convergence);
            const idleNoiseY = Math.cos(et * 1.8 + ph * 1.2) * 0.1 * (1 - convergence);
            const cannonNarrow = 1 - convergence * 0.9;

            cps[1].set(
                cfg.base.x + cfg.side * (0.38 + idleNoiseX),
                cfg.base.y + 0.15 + cfg.ySlot * 0.18 + idleNoiseY * 0.6,
                cfg.base.z + 0.18 + Math.sin(et * 1.4 + ph) * 0.06
            ).lerp(temp.tmp1.copy(nozzleCenter).addScaledVector(temp.dir, 0.16).addScaledVector(temp.tmp2.set(1, 0, 0), cfg.side * (0.24 * cannonNarrow)).addScaledVector(temp.tmp3.set(0, 1, 0), cfg.ySlot * (0.14 * cannonNarrow)), convergence);

            cps[2].set(
                cfg.base.x + cfg.side * (0.72 + Math.sin(et * 1.8 + ph * 0.7) * 0.2 * (1 - convergence)),
                cfg.base.y + 0.26 + cfg.ySlot * 0.28 + Math.cos(et * 2.0 + ph) * 0.12 * (1 - convergence),
                0.7 + Math.sin(et * 1.2 + ph) * 0.2
            ).lerp(temp.tmp1.copy(nozzleCenter).addScaledVector(temp.dir, 0.46 + travelAlpha * 0.28).addScaledVector(temp.tmp2.set(1, 0, 0), cfg.side * (0.16 * cannonNarrow)).addScaledVector(temp.tmp3.set(0, 1, 0), cfg.ySlot * (0.1 * cannonNarrow)), convergence);

            cps[3].set(
                cfg.base.x + cfg.side * (0.9 + (hash01((tIdx + 1) * 11.3) * 2 - 1) * 0.05),
                cfg.ySlot * 0.45 + Math.sin(et * 1.25 + ph * 1.1) * 0.14 * (1 - convergence),
                1.0 + Math.cos(et * 1.4 + ph * 0.9) * 0.22
            ).lerp(temp.tmp1.copy(nozzleCenter).addScaledVector(temp.dir, dirLen * (0.42 + 0.25 * THREE.MathUtils.clamp(travelAlpha, 0, 1))).addScaledVector(temp.tmp2.set(1, 0, 0), cfg.side * (0.09 * cannonNarrow)).addScaledVector(temp.tmp3.set(0, 1, 0), cfg.ySlot * (0.07 * cannonNarrow)), THREE.MathUtils.clamp(travelAlpha * 0.9 + pressurize * 0.55, 0, 1));

            cps[4].copy(temp.idleTip).lerp(cps[3], 0.25).lerp(temp.tmp1.copy(temp.tip).addScaledVector(temp.dir, -(0.27 + (1 - THREE.MathUtils.clamp(travelAlpha, 0, 1)) * 0.16)).addScaledVector(temp.tmp2.set(1, 0, 0), cfg.side * (0.06 * cannonNarrow)).addScaledVector(temp.tmp3.set(0, 1, 0), cfg.ySlot * (0.05 * cannonNarrow)), THREE.MathUtils.clamp(travelAlpha + pressurize * 0.35, 0, 1));
            cps[5].copy(temp.tip);

            for (let c = 1; c < cps.length - 1; c++) {
                const amp = (0.07 + c * 0.015) * (1 - convergence * 0.85);
                const hz = et * (1.45 + c * 0.35) + ph * 2.0;
                cps[c].x += Math.sin(hz + c * 0.3) * amp;
                cps[c].y += Math.cos(hz * 1.15 + c * 0.2) * amp * 0.75;
                cps[c].z += Math.sin(hz * 0.85 + c * 0.5) * amp * 0.55;
            }
            resampleArm(tIdx);

            for (let i = 0; i < TENDRIL_SEGMENTS; i++) {
                const mesh = tendrils.current[tIdx]?.[i];
                if (!mesh) continue;
                const u = i / (TENDRIL_SEGMENTS - 1);
                mesh.position.copy(a.uniform[i]);
                temp.tangent.copy(a.tangents[i]);
                if (temp.tangent.lengthSq() > 1e-6) mesh.quaternion.setFromUnitVectors(upAxis, temp.tangent.normalize());
                const taper = 0.135 * (1 - u * 0.72);
                const pulse = 1 + Math.sin(et * 3.2 + i * 0.75 + ph * 2.0) * 0.08;
                const bulgeCenter = THREE.MathUtils.clamp(0.12 + travelAlpha * 0.78, 0.1, 0.95);
                const sigma = 0.08 + 0.07 * (1 - THREE.MathUtils.clamp(travelAlpha, 0, 1));
                const bulge = 1 + attackEnergy * 0.85 * Math.exp(-Math.pow((u - bulgeCenter) / sigma, 2));
                const necking = 1 - pressurize * 0.45 * Math.exp(-Math.pow((u - 0.88) / 0.12, 2));
                const radial = Math.max(0.02, taper * pulse * bulge * necking);
                const stretch = radial * (1.35 + attackEnergy * 0.35) * (1 + releaseStretch * (0.65 + u * 0.6));
                mesh.scale.set(radial, stretch, radial);
            }
        }

        for (let i = 0; i < DROPLET_COUNT; i++) {
            const d = droplets.current[i];
            if (!d) continue;
            const seed = dropletSeeds[i];
            const arm = armScratch[seed.arm];
            const tipDir = arm.tipDir.lengthSq() > 1e-6 ? arm.tipDir : temp.tmp1.set(0, 0, 1);
            const idleAngle = seed.orbitPhase + et * (0.42 + seed.splash * 0.3) + Math.sin(et * 0.33 + seed.phase) * 0.35;
            const idleRadius = seed.orbitRadius + Math.sin(et * 0.9 + seed.phase * 1.1) * 0.08;
            temp.dropIdle.set(Math.cos(idleAngle) * idleRadius, seed.heightBias + Math.sin(et * 1.15 + seed.phase) * 0.22, Math.sin(idleAngle) * idleRadius * 0.85);
            const trailMix = THREE.MathUtils.clamp(attackEnergy * 1.1, 0, 1);
            const lag = seed.lag * (0.35 + (1 - THREE.MathUtils.clamp(travelAlpha, 0, 1)) * 0.6);
            const swirl = et * (4.8 + seed.splash * 2.2) + seed.phase * 2.0;
            temp.jitter.set(Math.sin(swirl + i) * (0.05 + seed.splash * 0.08), Math.cos(swirl * 1.2 + i * 0.7) * (0.05 + seed.splash * 0.1), Math.sin(swirl * 0.85 + i * 0.4) * (0.06 + seed.splash * 0.08));
            temp.dropTrail.copy(arm.tip).addScaledVector(tipDir, -lag).addScaledVector(temp.jitter, 0.45 + impactPulse * 0.8);
            temp.dropSplash.copy(temp.fluidTarget);
            if (impactPulse > 0.001) {
                const angle = seed.orbitPhase + et * 6.0;
                const rad = (0.16 + seed.splash * 0.42) * impactPulse;
                temp.dropSplash.x += Math.cos(angle) * rad;
                temp.dropSplash.y += 0.03 + Math.abs(Math.sin(angle * 1.1 + seed.phase)) * (0.09 + seed.splash * 0.16) * impactPulse;
                temp.dropSplash.z += Math.sin(angle) * rad * 0.85;
            }
            const splashMix = THREE.MathUtils.clamp(impactPulse * (0.35 + seed.splash * 0.9), 0, 1);
            temp.tmp1.copy(temp.dropIdle).lerp(temp.dropTrail, trailMix).lerp(temp.dropSplash, splashMix);
            d.position.copy(temp.tmp1);
            const ds = 0.03 + (0.012 + seed.splash * 0.018) * (0.5 + trailMix * 0.9 + impactPulse * 0.8);
            const stretch = 1 + Math.abs(Math.sin(et * 2.3 + seed.phase * 2.4)) * (0.35 + attackEnergy * 0.4);
            d.scale.set(ds, ds * stretch, ds);
            d.visible = true;
        }

        for (let i = 0; i < INNER_FLUID_COUNT; i++) {
            const blob = innerFluid.current[i];
            if (!blob) continue;
            const seed = innerFluidSeeds[i];
            const pulse = 0.35 + attackEnergy * 0.65;
            const phase = et * (0.9 + seed.swirl) + seed.phase;
            const orbit = seed.radius + Math.sin(phase * 1.7) * seed.wobble * (1 + attackEnergy * 0.4);
            blob.position.set(Math.cos(phase) * orbit, seed.yBias * 0.42 + Math.sin(phase * 1.2 + seed.phase) * 0.08 + Math.cos(et * 1.4 + i) * 0.03, Math.sin(phase * 0.92 + seed.phase * 0.37) * orbit * 0.9);
            const squash = 1 + Math.sin(phase * 2.1) * 0.25 * pulse;
            blob.scale.set(seed.scale * (0.85 + pulse * 0.3), seed.scale * squash, seed.scale * (1.05 - (squash - 1) * 0.5));
            blob.visible = true;
        }
    });

    return (
        <group ref={bodyRef}>
            <mesh geometry={teardropGeo} material={crystalMat} castShadow position={[0, 0.5, 0]} rotation={[Math.PI, 0, 0]} />
            <group position={[0, 0.5, 0]} rotation={[Math.PI, 0, 0]}>
                {Array.from({ length: INNER_FLUID_COUNT }).map((_, i) => (
                    <mesh key={`sf-inner-${i}`} ref={(el) => { innerFluid.current[i] = el; }} material={innerFluidMat}>
                        <sphereGeometry args={[1, 14, 12]} />
                    </mesh>
                ))}
            </group>
            <group position={[0, 0.7, 0]}>
                {Array.from({ length: TENDRIL_COUNT }).map((_, tIdx) => (
                    <group key={`tc-${tIdx}`}>
                        {Array.from({ length: TENDRIL_SEGMENTS }).map((_, i) => (
                            <mesh key={`tc${tIdx}-${i}`} ref={(el) => { if (!tendrils.current[tIdx]) tendrils.current[tIdx] = []; tendrils.current[tIdx][i] = el; }} material={waterMat}>
                                <sphereGeometry args={[1, 10, 8]} />
                            </mesh>
                        ))}
                    </group>
                ))}
                {Array.from({ length: DROPLET_COUNT }).map((_, i) => (
                    <mesh key={`sf-drop-${i}`} ref={(el) => { droplets.current[i] = el; }} material={waterMat}>
                        <sphereGeometry args={[1, 8, 6]} />
                    </mesh>
                ))}
            </group>
        </group>
    );
};
