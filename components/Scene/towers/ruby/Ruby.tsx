import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Sparkles, useGLTF } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import { GemMaterialConfig } from '../shared/types';
import { buildGemMaterial, getFirePulse } from '../shared/TowerEngine';

useGLTF.preload('/glb/ruby.glb');

// Altura alvo do cluster em unidades locais do grupo da torre (o grupo externo
// aplica visualConfig.scale * 0.35, então ~2.6 local ≈ 0.9 world na qualidade Normal)
const RUBY_HEIGHT = 2.6;

export const ProceduralRubyTower: React.FC<{
    physics: GemMaterialConfig;
    envMap: THREE.Texture | null;
    timeSinceShotRef: React.MutableRefObject<number>;
}> = ({ physics, envMap, timeSinceShotRef }) => {
    const containerRef = useRef<THREE.Group>(null);
    const lightRef = useRef<THREE.PointLight>(null);

    const crystalMaterial = useMemo(() => buildGemMaterial({
        color: physics.color, emissive: physics.color, emissiveIntensity: 0.35,
        metalness: 0.1, roughness: 0.05, transmission: 0.55, thickness: 1.5,
        clearcoat: 1.0, clearcoatRoughness: 0.05, ior: 1.76,
    }, envMap, 1.8), [physics, envMap]);

    const rockMaterial = useMemo(() => buildGemMaterial({
        color: '#4a3033', emissive: '#200000', emissiveIntensity: 0.15,
        metalness: 0.0, roughness: 0.95, clearcoat: 0.0, clearcoatRoughness: 1.0,
    }, envMap, 0.4), [envMap]);

    const { scene } = useGLTF('/glb/ruby.glb');
    const model = useMemo(() => {
        const clone = SkeletonUtils.clone(scene);
        const bbox = new THREE.Box3().setFromObject(clone);
        const height = Math.max(0.0001, bbox.max.y - bbox.min.y);
        const s = RUBY_HEIGHT / height;
        clone.scale.setScalar(s);
        clone.position.y = -bbox.min.y * s; // base do cluster no topo do pedestal
        clone.traverse((obj) => {
            if (!(obj as THREE.Mesh).isMesh) return;
            const mesh = obj as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.material = /rock/i.test(mesh.name) ? rockMaterial : crystalMaterial;
        });
        return clone;
    }, [scene, crystalMaterial, rockMaterial]);

    useFrame((state) => {
        const et = state.clock.getElapsedTime();
        const timeSinceShot = timeSinceShotRef.current;
        const firePulse = getFirePulse(timeSinceShot);

        // "Batimento" incandescente + flash no disparo
        crystalMaterial.emissiveIntensity = 0.35 + Math.sin(et * 2.2) * 0.15 + firePulse * 3.0;
        if (lightRef.current)
            lightRef.current.intensity = 1.5 + Math.sin(et * 2.2) * 0.5 + firePulse * 12;

        if (containerRef.current) {
            let recoilZ = 0;
            if (timeSinceShot < 300) {
                const t = timeSinceShot / 300;
                recoilZ = t < 0.2 ? -(t / 0.2) * 0.22 : -0.22 * (1 - (t - 0.2) / 0.8);
            }
            containerRef.current.position.z = recoilZ;
            const breath = 1 + Math.sin(et * 1.8) * 0.015;
            containerRef.current.scale.setScalar(breath * (1 + firePulse * 0.10));
        }
    });

    return (
        <group ref={containerRef}>
            <primitive object={model} />
            <pointLight ref={lightRef} color="#ff2a2a" intensity={1.5} distance={4.5} decay={2} position={[0, 1.4, 0]} />
            <Sparkles count={20} scale={[1.6, 2.6, 1.6]} size={4} speed={0.55} opacity={0.5} color="#ff5040" position={[0, 1.3, 0]} />
        </group>
    );
};
