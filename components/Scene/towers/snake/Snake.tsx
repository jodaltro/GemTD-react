import React, { useRef, useMemo, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { GemMaterialConfig, smoothstep } from '../shared/types';
import { buildGemMaterial } from '../shared/TowerEngine';

export const ProceduralSnake: React.FC<{
    physics: GemMaterialConfig;
    envMap: THREE.Texture | null;
    timeSinceShotRef: React.MutableRefObject<number>;
}> = ({ physics, envMap, timeSinceShotRef }) => {
    const bodyRef = useRef<THREE.Mesh>(null);
    const coreRef = useRef<THREE.Group>(null);
    const groupRef = useRef<THREE.Group>(null);
    const originalPositions = useRef<Float32Array | null>(null);
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
            new THREE.Vector3(0, 3.0, 0.8),
            new THREE.Vector3(0, 3.1, 1.4),
            new THREE.Vector3(0, 3.0, 2.1),
        ];
        const spineCurve = new THREE.CatmullRomCurve3(curvePoints);
        (spineCurve as any).tension = 0.5;

        const getSnakeWidth = (t: number): number => {
            const base = 0.22;
            if (t <= 0.18) return base * smoothstep(0, 0.18, t);
            if (t <= 0.40) return base;
            const hoodPeak = 0.85, hoodEnd = 0.92, hoodMaxExtra = 0.9;
            if (t <= hoodPeak) return base + smoothstep(0.40, hoodPeak, t) * hoodMaxExtra;
            if (t <= hoodEnd) {
                const close = smoothstep(hoodPeak, hoodEnd, t);
                return (base + hoodMaxExtra) * (1.0 - close * 0.88);
            }
            return (base + hoodMaxExtra) * 0.12 * (1.0 - smoothstep(0.92, 0.98, t) * 0.95);
        };

        const getSnakeThickness = (t: number): number => {
            const base = 0.22;
            if (t <= 0.18) return base * smoothstep(0, 0.18, t);
            if (t <= 0.40) return base;
            const hoodPeak = 0.85, hoodEnd = 0.92;
            if (t <= hoodPeak) return base * (1.0 - smoothstep(0.40, hoodPeak, t) * 0.82);
            if (t <= hoodEnd) {
                const peakThick = base * 0.18;
                return peakThick * (1.0 - smoothstep(hoodPeak, hoodEnd, t) * 0.6);
            }
            return base * 0.07 * (1.0 - smoothstep(0.92, 0.98, t) * 0.9);
        };

        const vertices: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
        const radialSegments = 32, tubularSegments = 256;
        const frames = spineCurve.computeFrenetFrames(tubularSegments, true);

        for (let i = 0; i <= tubularSegments; i++) {
            const t = i / tubularSegments;
            const pos = spineCurve.getPointAt(t);
            const N = frames.normals[i], B = frames.binormals[i];
            const wr = getSnakeWidth(t), tr = getSnakeThickness(t);
            for (let j = 0; j <= radialSegments; j++) {
                const angle = (j / radialSegments) * Math.PI * 2;
                const sin = Math.sin(angle), cos = -Math.cos(angle);
                vertices.push(pos.x + B.x * sin * wr + N.x * cos * tr, pos.y + B.y * sin * wr + N.y * cos * tr, pos.z + B.z * sin * wr + N.z * cos * tr);
                const n = new THREE.Vector3(B.x * sin + N.x * cos, B.y * sin + N.y * cos, B.z * sin + N.z * cos).normalize();
                normals.push(n.x, n.y, n.z);
                uvs.push(j / radialSegments, t);
            }
        }
        for (let i = 0; i < tubularSegments; i++) {
            for (let j = 0; j < radialSegments; j++) {
                const a = (radialSegments + 1) * i + j, b = (radialSegments + 1) * (i + 1) + j;
                const c = b + 1, d = a + 1;
                indices.push(a, b, d, b, c, d);
            }
        }
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geom.setIndex(indices);
        return geom;
    }, []);

    useLayoutEffect(() => {
        if (bodyRef.current && !originalPositions.current) {
            originalPositions.current = bodyRef.current.geometry.attributes.position.array.slice() as Float32Array;
        }
    }, []);

    const material = useMemo(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 2048; canvas.height = 2048;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = physics.color;
        ctx.fillRect(0, 0, 2048, 2048);
        for (let i = 0; i < 60; i++) {
            const sx = Math.random() * 2048, sy = Math.random() * 2048;
            const len = 20 + Math.random() * 50, angle = Math.random() * Math.PI * 2;
            ctx.beginPath(); ctx.moveTo(sx, sy);
            ctx.lineTo(sx + Math.cos(angle) * len, sy + Math.sin(angle) * len);
            ctx.strokeStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.04})`;
            ctx.lineWidth = 0.3 + Math.random() * 0.8; ctx.stroke();
        }
        for (let i = 0; i < 200; i++) {
            const sx = Math.random() * 2048, sy = Math.random() * 2048, r = 1 + Math.random() * 2;
            ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,255,${0.01 + Math.random() * 0.03})`; ctx.fill();
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(5, 14);

        const nCanvas = document.createElement('canvas');
        nCanvas.width = 512; nCanvas.height = 512;
        const nCtx = nCanvas.getContext('2d')!;
        nCtx.fillStyle = '#8080ff'; nCtx.fillRect(0, 0, 512, 512);
        for (let i = 0; i < 300; i++) {
            const bx = Math.random() * 512, by = Math.random() * 512, br = 2 + Math.random() * 6;
            const g = nCtx.createRadialGradient(bx, by, 0, bx, by, br);
            g.addColorStop(0, 'rgba(160,160,255,0.5)'); g.addColorStop(1, 'rgba(128,128,255,0)');
            nCtx.fillStyle = g; nCtx.fillRect(bx - br, by - br, br * 2, br * 2);
        }
        const normalTex = new THREE.CanvasTexture(nCanvas);
        normalTex.wrapS = normalTex.wrapT = THREE.RepeatWrapping;
        normalTex.repeat.set(5, 14);

        return buildGemMaterial({
            color: physics.color, emissive: physics.color, emissiveIntensity: 0.1,
            map: texture, normalMap: normalTex, normalScale: new THREE.Vector2(0.15, 0.15),
            metalness: 0.05, roughness: 0.08, clearcoat: 1.0, clearcoatRoughness: 0.02,
            sheen: 0.1, sheenColor: new THREE.Color(physics.color).multiplyScalar(1.2), sheenRoughness: 0.2,
            transparent: true, transmission: 0.85, opacity: 0.7, thickness: 0.8,
            ior: 1.57, attenuationColor: new THREE.Color(physics.color), attenuationDistance: 1.2,
            specularIntensity: 1.2, specularColor: new THREE.Color('#ffffff'),
            side: THREE.DoubleSide, depthWrite: false,
        }, envMap, 2.5);
    }, [physics.color, envMap]);

    useFrame((state) => {
        const et = state.clock.getElapsedTime();
        const timeSinceShot = timeSinceShotRef.current ?? 0;
        const strikeDuration = 400;
        let strikeZ = 0, strikeRotation = 0, strikeIntensity = 0;
        const tNorm = timeSinceShot / strikeDuration;
        if (timeSinceShot < strikeDuration) {
            if (tNorm < 0.12) {
                const w = smoothstep(0, 0.12, tNorm);
                strikeZ = -0.3 * w; strikeRotation = -0.15 * w; strikeIntensity = w * 0.3;
            } else if (tNorm < 0.30) {
                const s = smoothstep(0.12, 0.30, tNorm);
                strikeZ = -0.3 + s * 2.8; strikeRotation = -0.15 + s * 0.55; strikeIntensity = 0.3 + s * 0.7;
            } else if (tNorm < 0.65) {
                const r = smoothstep(0.30, 0.65, tNorm);
                strikeZ = 2.5 * (1 - r); strikeRotation = 0.40 * (1 - r); strikeIntensity = 1.0 * (1 - r);
            }
        }
        strikeStateRef.current = { strikeZ, strikeRotation };

        if (bodyRef.current && originalPositions.current) {
            const posArray = bodyRef.current.geometry.attributes.position.array as Float32Array;
            const origArray = originalPositions.current;
            const maxY = 3.2, minY = -0.5, yRange = maxY - minY;
            for (let i = 0; i < posArray.length; i += 3) {
                const x = origArray[i], y = origArray[i + 1], z = origArray[i + 2];
                const ringIndex = Math.floor((i / 3) / 33);
                const tParam = ringIndex / 256;
                const phase = y * 0.5;
                const wave1 = Math.sin(et * 1.2 + phase) * 0.15;
                const wave2 = Math.sin(et * 0.8 + phase * 1.3) * 0.1;
                const verticalFloat = Math.sin(et * 1.5 + phase * 0.8) * 0.12;
                const depthWave = Math.cos(et * 1.0 + phase * 1.2) * 0.1;
                const tailFade = 1.0 - smoothstep(0.0, 0.45, tParam);
                const serpentineX = Math.sin(et * 1.8 + tParam * 8.0) * 0.35 * tailFade;
                const serpentineZ = Math.cos(et * 1.4 + tParam * 6.0) * 0.20 * tailFade;
                const serpentineY = Math.sin(et * 1.0 + tParam * 5.0) * 0.08 * tailFade;
                const strikeForward = smoothstep(0.2, 1.0, tParam);
                const strikeback = smoothstep(0.25, 0.0, tParam);
                const forwardOffset = strikeZ * strikeForward;
                const backwardOffset = -strikeZ * 0.25 * strikeback;
                const strikeWave = Math.sin(tParam * Math.PI) * strikeIntensity * 0.15;
                const bodyTilt = strikeRotation * (tParam * 0.8 + 0.1);
                const rotatedY = y - (y - 1.5) * bodyTilt * 0.3;
                const rotatedZ = z + (y - 1.5) * bodyTilt;
                const bodyStraighten = Math.sin(tParam * Math.PI);
                const waveScale = 1.0 - strikeIntensity * bodyStraighten * 0.5;
                posArray[i] = x + (wave1 + wave2) * waveScale + serpentineX * (1.0 - strikeIntensity * 0.6) + strikeWave;
                posArray[i + 1] = rotatedY + verticalFloat * (1.0 - strikeIntensity * 0.4) + serpentineY * (1.0 - strikeIntensity * 0.8);
                posArray[i + 2] = rotatedZ + depthWave * waveScale + forwardOffset + backwardOffset + serpentineZ * (1.0 - strikeIntensity * 0.6);
                void (maxY - minY - yRange); // suppress unused
            }
            bodyRef.current.geometry.attributes.position.needsUpdate = true;
            bodyRef.current.geometry.computeVertexNormals();
            if (coreRef.current) {
                const vc = posArray.length / 3;
                const top = Math.floor(vc * 0.02);
                let ax = 0, ay = 0, az = 0, cnt = 0;
                for (let i = vc - top; i < vc; i++) {
                    ax += posArray[i * 3]; ay += posArray[i * 3 + 1]; az += posArray[i * 3 + 2]; cnt++;
                }
                coreRef.current.position.set(ax / cnt, ay / cnt, az / cnt);
            }
        }
    });

    return (
        <group ref={groupRef} scale={0.8} position={[0, 0.5, 0]}>
            <mesh ref={bodyRef} geometry={bodyGeometry} material={material} castShadow receiveShadow />
            <group ref={coreRef} position={[0, 3.2, 0.7]} />
        </group>
    );
};
