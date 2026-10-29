import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Sparkles, useGLTF } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import { GemMaterialConfig } from '../shared/types';
import { buildGemMaterial, buildGlowMaterial, getFirePulse } from '../shared/TowerEngine';

useGLTF.preload('/glb/crystal_golem.glb');

// Crystal Golem — elemental de cristal chibi (gema Diamond), fiel à referência
// de 4 vistas: cabeça de cristal facetado com crista + gema na testa, olhos
// amendoados azul-gelo, braços/pés de cristal, tronco blindado de placas.
// Gerado via create-3d-model (Blender 5.2). Altura ≈ 2.8 no export.

const isGlow = (n: string) => /^CrystalEye/i.test(n) && !/^CrystalEyeHl/i.test(n);
const isHighlight = (n: string) => /^CrystalEyeHl/i.test(n);
const isBlueGem = (n: string) => n === 'CrystalChestGem' || n === 'CrystalForeheadGem';
const isCrystal = (n: string) => !isGlow(n) && !isHighlight(n) && !isBlueGem(n);

export const CrystalGolemTower: React.FC<{
    physics: GemMaterialConfig;
    envMap: THREE.Texture | null;
    timeSinceShotRef: React.MutableRefObject<number>;
}> = ({ physics, envMap, timeSinceShotRef }) => {
    const containerRef = useRef<THREE.Group>(null);
    const lightRef = useRef<THREE.PointLight>(null);
    const blinkTimerRef = useRef(0);

    // Cristal de gelo/diamante — branco azulado translúcido com facetas vivas
    const iceMaterial = useMemo(() => buildGemMaterial({
        color: physics.color, emissive: '#bfe0ff', emissiveIntensity: 0.12,
        metalness: 0.05, roughness: 0.06, transmission: 0.35, thickness: 1.4,
        clearcoat: 1.0, clearcoatRoughness: 0.04, ior: 2.42,
        iridescence: 0.8, iridescenceIOR: 1.3,
        iridescenceThicknessRange: [120, 380] as [number, number],
    }, envMap, 1.8), [physics, envMap]);

    // Olhos — azul-gelo vivo
    const eyeMaterial = useMemo(
        () => buildGlowMaterial('#aee6ff', '#1e8cff', 5.0),
        []
    );
    // Reflexo de olho — branco
    const highlightMaterial = useMemo(
        () => buildGlowMaterial('#ffffff', '#ffffff', 6.0),
        []
    );
    // Gemas azuis (testa/peito)
    const gemMaterial = useMemo(
        () => buildGlowMaterial('#aee6ff', '#1e8cff', 7.0),
        []
    );

    const { scene } = useGLTF('/glb/crystal_golem.glb');
    const model = useMemo(() => {
        const clone = SkeletonUtils.clone(scene);
        // Normaliza para a altura alvo e assenta a base no pedestal
        const bbox = new THREE.Box3().setFromObject(clone);
        const height = Math.max(0.0001, bbox.max.y - bbox.min.y);
        const TARGET_HEIGHT = 2.8;
        const s = TARGET_HEIGHT / height;
        clone.scale.setScalar(s);
        clone.position.y = -bbox.min.y * s;

        clone.traverse((obj) => {
            if (!(obj as THREE.Mesh).isMesh) return;
            const mesh = obj as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            const n = mesh.name;
            if (isGlow(n)) mesh.material = eyeMaterial;
            else if (isHighlight(n)) mesh.material = highlightMaterial;
            else if (isBlueGem(n)) mesh.material = gemMaterial;
            else mesh.material = iceMaterial;
        });
        return clone;
    }, [scene, iceMaterial, eyeMaterial, highlightMaterial, gemMaterial]);

    useFrame((state) => {
        const et = state.clock.getElapsedTime();
        const timeSinceShot = timeSinceShotRef.current;
        const firePulse = getFirePulse(timeSinceShot);

        // Respiração do gelo + flash no disparo
        const breath = 1 + Math.sin(et * 1.6) * 0.012;
        if (containerRef.current) {
            let recoilZ = 0;
            if (timeSinceShot < 300) {
                const t = timeSinceShot / 300;
                recoilZ = t < 0.2 ? -(t / 0.2) * 0.16 : -0.16 * (1 - (t - 0.2) / 0.8);
            }
            containerRef.current.position.z = recoilZ;
            containerRef.current.scale.setScalar(breath * (1 + firePulse * 0.08));
        }

        // Pulso das gemas/olhos + piscada ocasional
        const gemPulse = 5.0 + Math.sin(et * 2.0) * 1.2 + firePulse * 6.0;
        gemMaterial.emissiveIntensity = gemPulse;
        eyeMaterial.emissiveIntensity = 3.5 + Math.sin(et * 2.4) * 0.8 + firePulse * 4.0;

        // Piscada: fecha os olhos por ~120ms a cada ~4s (escala Y dos olhos)
        blinkTimerRef.current += et;
        const blinkPhase = et % 4.2;
        const blinkScale = blinkPhase > 4.0 ? 0.25 : 1.0;
        scene.traverse((obj) => {
            const n = obj.name;
            if (isGlow(n)) {
                const target = blinkScale;
                (obj as THREE.Mesh).scale.y = THREE.MathUtils.lerp(
                    (obj as THREE.Mesh).scale.y, target, 0.3
                );
            }
        });

        if (lightRef.current)
            lightRef.current.intensity = 0.8 + Math.sin(et * 2.0) * 0.3 + firePulse * 6;
    });

    return (
        <group ref={containerRef}>
            <primitive object={model} />
            <pointLight ref={lightRef} color="#8fd4ff" intensity={0.8} distance={3.5} decay={2} position={[0, 1.6, 0.5]} />
            <Sparkles count={18} scale={[1.8, 2.8, 1.8]} size={4} speed={0.5} opacity={0.5} color="#bfe8ff" position={[0, 1.4, 0]} />
        </group>
    );
};
