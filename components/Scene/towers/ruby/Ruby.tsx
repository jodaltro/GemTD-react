import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Sparkles, useGLTF } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import { GemMaterialConfig } from '../shared/types';
import { buildGemMaterial, buildGlowMaterial, getFirePulse } from '../shared/TowerEngine';

useGLTF.preload('/glb/ruby.glb');

// Ruby Runestone (monolito rúnico) — gerado via skill game-model-blender.
// Altura ≈ 2.10 no export Blender. Materiais reaplicados aqui com envMap/pulso.
const SENTINEL_REF_HEIGHT = 2.10;
const SENTINEL_TARGET_HEIGHT = 2.7;

// Materiais por prefixo de nó (ver build_model.py):
//   RockDisc → disco escuro   Glow*/GemCore → emissivo (runas/anel/núcleo)
//   Rock* → rocha   demais (RubyMonolith/RubySat/FloatShard) → cristal de rubi
const isDisc = (n: string) => n === 'RockDisc';
const isRock = (n: string) => /^Rock/i.test(n) && n !== 'RockDisc';
const isGlow = (n: string) => /^Glow/i.test(n);
const isHotGem = (n: string) => /^Gem/i.test(n);
const isFloatShard = (n: string) => /^FloatShard/i.test(n);

export const ProceduralRubyTower: React.FC<{
    physics: GemMaterialConfig;
    envMap: THREE.Texture | null;
    timeSinceShotRef: React.MutableRefObject<number>;
}> = ({ physics, envMap, timeSinceShotRef }) => {
    const containerRef = useRef<THREE.Group>(null);
    const lightRef = useRef<THREE.PointLight>(null);
    const ringRef = useRef<THREE.Object3D | null>(null); // anel rúnico
    const shardsRef = useRef<Array<{ mesh: THREE.Object3D; base: THREE.Vector3; phase: number }>>([]);

    const rubyMaterial = useMemo(() => buildGemMaterial({
        color: physics.color, emissive: physics.color, emissiveIntensity: 0.35,
        metalness: 0.1, roughness: 0.05, transmission: 0.4, thickness: 1.2,
        clearcoat: 1.0, clearcoatRoughness: 0.05, ior: 1.76,
    }, envMap, 1.8), [physics, envMap]);

    const rockMaterial = useMemo(() => buildGemMaterial({
        color: '#5a382e', emissive: '#000000', emissiveIntensity: 0,
        metalness: 0.0, roughness: 0.95, clearcoat: 0.0, clearcoatRoughness: 1.0,
    }, envMap, 0.35), [envMap]);

    const discMaterial = useMemo(() => buildGemMaterial({
        color: '#14161a', emissive: '#000000', emissiveIntensity: 0,
        metalness: 0.4, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.4,
    }, envMap, 0.5), [envMap]);

    const glowMaterial = useMemo(
        () => buildGlowMaterial('#ff5555', physics.color, 3.0),
        [physics]
    );

    // Rubi "quente" — gema opaca com leve emissão (peito, testa, bossas). SEM
    // transmission (senão a emissão atravessa a rocha e vira "lanterna").
    const hotGemMaterial = useMemo(() => buildGemMaterial({
        color: physics.color, emissive: '#a00000', emissiveIntensity: 0.4,
        metalness: 0.1, roughness: 0.15, transmission: 0.0, thickness: 0.5,
        clearcoat: 1.0, clearcoatRoughness: 0.1, ior: 1.76,
    }, envMap, 1.2), [physics, envMap]);

    const { scene } = useGLTF('/glb/ruby.glb');
    const model = useMemo(() => {
        const clone = SkeletonUtils.clone(scene);
        shardsRef.current = []; // reset (evita acúmulo entre re-clones)
        // Escala para a altura alvo e assenta o ponto mais baixo (disco) no pedestal.
        const bbox = new THREE.Box3().setFromObject(clone);
        const s = SENTINEL_TARGET_HEIGHT / SENTINEL_REF_HEIGHT;
        clone.scale.setScalar(s);
        clone.position.y = -bbox.min.y * s;

        clone.traverse((obj) => {
            if (!(obj as THREE.Mesh).isMesh) return;
            const mesh = obj as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            const n = mesh.name;
            if (isDisc(n)) mesh.material = discMaterial;
            else if (isGlow(n)) mesh.material = glowMaterial;
            else if (isHotGem(n)) mesh.material = hotGemMaterial;
            else if (isRock(n)) mesh.material = rockMaterial;
            else mesh.material = rubyMaterial;

            if (n === 'GlowRing') ringRef.current = mesh;
            if (isFloatShard(n)) {
                shardsRef.current.push({ mesh, base: mesh.position.clone(), phase: shardsRef.current.length });
            }
        });
        return clone;
    }, [scene, rubyMaterial, rockMaterial, discMaterial, glowMaterial]);

    useFrame((state) => {
        const et = state.clock.getElapsedTime();
        const timeSinceShot = timeSinceShotRef.current;
        const firePulse = getFirePulse(timeSinceShot);

        // Olhos/núcleo/anel pulsam como brasa viva; disparo dá flash forte
        // Emissões moderadas — glow forte só nos olhos/anel; rubis discretos.
        const emberPulse = 2.5 + Math.sin(et * 2.4) * 0.6 + firePulse * 5.0;
        glowMaterial.emissiveIntensity = emberPulse;
        rubyMaterial.emissiveIntensity = 0.15 + firePulse * 1.5;
        hotGemMaterial.emissiveIntensity = 0.4 + Math.sin(et * 2.4) * 0.2 + firePulse * 2.0;
        if (lightRef.current)
            lightRef.current.intensity = 0.5 + Math.sin(et * 2.2) * 0.2 + firePulse * 8;

        // Anel rúnico gira devagar (rotação local, não mexe na posição)
        if (ringRef.current) ringRef.current.rotation.y = et * 0.35;

        // Lascas de rubi flutuam (bob vertical) e giram lentamente ao redor do eixo
        for (const s of shardsRef.current) {
            s.mesh.position.y = s.base.y + Math.sin(et * 1.3 + s.phase * 2.1) * 0.12;
            s.mesh.rotation.y = et * 0.8 + s.phase;
            s.mesh.rotation.z = Math.sin(et * 0.9 + s.phase) * 0.2;
        }

        // Toda a animação de corpo é feita no CONTAINER inteiro — nunca reposicionar
        // meshes individuais do GLB (isso descola as peças; o Blender já as montou).
        if (containerRef.current) {
            // Recoil pra trás + respiração de escala no disparo
            let recoilZ = 0;
            if (timeSinceShot < 300) {
                const t = timeSinceShot / 300;
                recoilZ = t < 0.2 ? -(t / 0.2) * 0.10 : -0.10 * (1 - (t - 0.2) / 0.8);
            }
            containerRef.current.position.z = recoilZ;
            const breath = 1 + Math.sin(et * 1.8) * 0.01;
            containerRef.current.scale.setScalar(breath * (1 + firePulse * 0.05));
        }
    });

    return (
        <group ref={containerRef}>
            <primitive object={model} />
            <pointLight ref={lightRef} color="#ff4030" intensity={0.4} distance={2.5} decay={3} position={[0, 2.3, 0]} />
            <Sparkles count={16} scale={[2.0, 2.6, 2.0]} size={4} speed={0.5} opacity={0.45} color="#ff5040" position={[0, 1.4, 0]} />
        </group>
    );
};
