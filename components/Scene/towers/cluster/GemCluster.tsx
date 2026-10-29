import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Sparkles, useGLTF } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import { GemType } from '../../../../constants';
import { buildGemMaterial, buildGlowMaterial, getFirePulse } from '../shared/TowerEngine';

useGLTF.preload('/glb/sapphire.glb');
useGLTF.preload('/glb/topaz.glb');
useGLTF.preload('/glb/amethyst.glb');
useGLTF.preload('/glb/opal.glb');
useGLTF.preload('/glb/diamond_level_1.glb');
useGLTF.preload('/glb/emerald.glb');
useGLTF.preload('/glb/aquamarine.glb');
useGLTF.preload('/glb/gold.glb');

// Sabor de animação de cada cluster (fantasia por trás de cada gema):
// ICE    — Rainha do Gelo: pulso lento e frio, brilho constante
// STORM  — Sol dos Anões: energia crepitante, flicker de relâmpago
// ARCANE — Círculo da Feiticeira: gema central levita e gira sobre os monólitos
// MOON   — Ovos de Dragão: shimmer iridescente + fogo-fátuo orbitando
// PRISM  — Rei da Montanha: glints de luz com matiz arco-íris ciclando
// FOREST — Coração da Floresta: respiração vegetal lenta + vagalume orbitando
// TIDE   — Lágrima da Sereia: pulso de marés sobreposto + lágrima levitando
type ClusterFlavor = 'ICE' | 'STORM' | 'ARCANE' | 'MOON' | 'PRISM' | 'FOREST' | 'TIDE' | 'SOLAR';

type ClusterConfig = {
    url: string;
    height: number;          // altura alvo em unidades locais do grupo da torre
    flavor: ClusterFlavor;
    gem: THREE.MeshPhysicalMaterialParameters;
    envIntensity: number;
    rockColor: string;
    lightColor: string;
    sparkleColor: string;
    floatNode?: string;      // nó do GLB animado em runtime (levitação/órbita)
};

export const CLUSTER_CONFIG: Partial<Record<GemType, ClusterConfig>> = {
    [GemType.SAPPHIRE]: {
        url: '/glb/sapphire.glb', height: 2.9, flavor: 'ICE',
        gem: {
            color: '#2962ff', emissive: '#448aff', emissiveIntensity: 0.3,
            metalness: 0.05, roughness: 0.04, transmission: 0.6, thickness: 1.6,
            clearcoat: 1.0, clearcoatRoughness: 0.03, ior: 1.77,
            sheen: 0.6, sheenColor: '#bbdefb', sheenRoughness: 0.2,
        },
        envIntensity: 2.0, rockColor: '#2e3a4a',
        lightColor: '#4d8aff', sparkleColor: '#9fc4ff',
    },
    [GemType.TOPAZ]: {
        url: '/glb/topaz.glb', height: 2.2, flavor: 'STORM',
        gem: {
            color: '#ffab00', emissive: '#ffb300', emissiveIntensity: 0.4,
            metalness: 0.15, roughness: 0.06, transmission: 0.45, thickness: 1.3,
            clearcoat: 1.0, clearcoatRoughness: 0.05, ior: 1.63,
        },
        envIntensity: 1.8, rockColor: '#4a3a26',
        lightColor: '#ffc233', sparkleColor: '#ffd54f',
    },
    [GemType.AMETHYST]: {
        url: '/glb/amethyst.glb', height: 2.6, flavor: 'ARCANE',
        gem: {
            color: '#aa00ff', emissive: '#aa00ff', emissiveIntensity: 0.35,
            metalness: 0.1, roughness: 0.05, transmission: 0.5, thickness: 1.5,
            clearcoat: 1.0, clearcoatRoughness: 0.05, ior: 1.55,
        },
        envIntensity: 1.8, rockColor: '#382a44',
        lightColor: '#bb44ff', sparkleColor: '#d79bff',
        floatNode: 'AmethystFloat',
    },
    [GemType.DIAMOND]: {
        url: '/glb/diamond_level_1.glb', height: 2.8, flavor: 'ICE',
        gem: {
            color: '#8fdef4', emissive: '#bdf7ff', emissiveIntensity: 0.3,
            metalness: 0.0, roughness: 0.12, transmission: 0.55, thickness: 1.8,
            clearcoat: 0.8, clearcoatRoughness: 0.06, ior: 1.55,
        },
        envIntensity: 1.6, rockColor: '#5d564e',
        lightColor: '#bdf7ff', sparkleColor: '#d9faff',
    },
    [GemType.EMERALD]: {
        url: '/glb/emerald.glb', height: 2.5, flavor: 'FOREST',
        gem: {
            color: '#00c853', emissive: '#00e676', emissiveIntensity: 0.3,
            metalness: 0.05, roughness: 0.06, transmission: 0.5, thickness: 1.5,
            clearcoat: 1.0, clearcoatRoughness: 0.06, ior: 1.58,
            sheen: 0.5, sheenColor: '#b9f6ca', sheenRoughness: 0.3,
        },
        envIntensity: 1.8, rockColor: '#2f3b2a',
        lightColor: '#3dff8a', sparkleColor: '#a5ffce',
        floatNode: 'EmeraldFirefly',
    },
    [GemType.AQUAMARINE]: {
        url: '/glb/aquamarine.glb', height: 2.4, flavor: 'TIDE',
        gem: {
            color: '#7fffd4', emissive: '#00e5ff', emissiveIntensity: 0.35,
            metalness: 0.0, roughness: 0.03, transmission: 0.7, thickness: 1.8,
            clearcoat: 1.0, clearcoatRoughness: 0.01, ior: 1.65,
            sheen: 1.0, sheenColor: '#00ffff', sheenRoughness: 0.15,
        },
        envIntensity: 2.2, rockColor: '#3a4a4a',
        lightColor: '#5ce8ff', sparkleColor: '#b2ffff',
        floatNode: 'AquaTear',
    },
    [GemType.GOLD]: {
        url: '/glb/gold.glb', height: 2.89, flavor: 'SOLAR',
        gem: {
            color: '#ffd700', emissive: '#ffb300', emissiveIntensity: 0.45,
            metalness: 0.35, roughness: 0.08, transmission: 0.4, thickness: 1.2,
            clearcoat: 1.0, clearcoatRoughness: 0.06, ior: 1.62,
        },
        envIntensity: 2.0, rockColor: '#4a3a26',
        lightColor: '#ffd54f', sparkleColor: '#ffe082',
        floatNode: 'GoldSun',
    },
    [GemType.OPAL]: {
        url: '/glb/opal.glb', height: 2.0, flavor: 'MOON',
        gem: {
            color: '#e8f5f2', emissive: '#b2dfdb', emissiveIntensity: 0.3,
            metalness: 0.0, roughness: 0.16, transmission: 0.35, thickness: 1.2,
            clearcoat: 1.0, clearcoatRoughness: 0.08, ior: 1.45,
            sheen: 1.0, sheenColor: '#f8bbd0', sheenRoughness: 0.25,
            iridescence: 0.9, iridescenceIOR: 1.3,
            iridescenceThicknessRange: [120, 420] as [number, number],
        },
        envIntensity: 1.6, rockColor: '#3c4442',
        lightColor: '#aef3e7', sparkleColor: '#ffffff',
        floatNode: 'OpalWisp',
    },
};

export const GemClusterTower: React.FC<{
    gemType: GemType;
    envMap: THREE.Texture | null;
    timeSinceShotRef: React.MutableRefObject<number>;
}> = ({ gemType, envMap, timeSinceShotRef }) => {
    const containerRef = useRef<THREE.Group>(null);
    const lightRef = useRef<THREE.PointLight>(null);
    const config = CLUSTER_CONFIG[gemType]!;

    const gemMaterial = useMemo(
        () => buildGemMaterial(config.gem, envMap, config.envIntensity),
        [config, envMap]
    );
    const rockMaterial = useMemo(() => buildGemMaterial({
        color: config.rockColor, emissive: '#000000', emissiveIntensity: 0,
        metalness: 0.0, roughness: 0.95, clearcoat: 0.0, clearcoatRoughness: 1.0,
    }, envMap, 0.4), [config, envMap]);
    // Nós Glow*/GemCore embutidos (runas, halos, núcleos) usam material emissivo
    const glowMaterial = useMemo(
        () => buildGlowMaterial('#ffffff', config.lightColor, 5.0),
        [config]
    );
    // MOON (fogo-fátuo), FOREST (vagalume) e SOLAR (sol) brilham por conta
    // própria; os demais nós flutuantes usam o material da gema
    const floatMaterial = useMemo(
        () => (config.flavor === 'MOON' || config.flavor === 'FOREST' || config.flavor === 'SOLAR')
            ? glowMaterial
            : gemMaterial,
        [config, gemMaterial, glowMaterial]
    );

    const { scene } = useGLTF(config.url);
    const { model, floatObj, floatBase } = useMemo(() => {
        const clone = SkeletonUtils.clone(scene);
        const bbox = new THREE.Box3().setFromObject(clone);
        const height = Math.max(0.0001, bbox.max.y - bbox.min.y);
        const s = config.height / height;
        clone.scale.setScalar(s);
        clone.position.y = -bbox.min.y * s; // base do cluster no topo do pedestal

        let floatObj: THREE.Object3D | null = null;
        clone.traverse((obj) => {
            if (!(obj as THREE.Mesh).isMesh) return;
            const mesh = obj as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            if (/(rock|geode_(egg_shell|cavity_rim))/i.test(mesh.name)) mesh.material = rockMaterial;
            else if (/^Glow/i.test(mesh.name) && mesh.name !== config.floatNode) mesh.material = glowMaterial;
            else if (config.floatNode && mesh.name === config.floatNode) {
                mesh.material = floatMaterial;
                floatObj = mesh;
            }
            else mesh.material = gemMaterial;
        });
        return { model: clone, floatObj, floatBase: floatObj ? (floatObj as THREE.Object3D).position.clone() : null };
    }, [scene, config, gemMaterial, rockMaterial, floatMaterial]);

    const baseEmissiveHSL = useMemo(() => {
        const hsl = { h: 0, s: 0, l: 0 };
        new THREE.Color(config.gem.emissive as string).getHSL(hsl);
        return hsl;
    }, [config]);

    useFrame((state) => {
        const et = state.clock.getElapsedTime();
        const timeSinceShot = timeSinceShotRef.current;
        const firePulse = getFirePulse(timeSinceShot);

        // Pulso emissivo temático + flash no disparo
        let idleGlow: number;
        switch (config.flavor) {
            case 'ICE':
                idleGlow = 0.3 + Math.sin(et * 1.1) * 0.08;
                break;
            case 'STORM':
                idleGlow = 0.4 + (Math.sin(et * 9.3) * Math.sin(et * 5.1) * 0.5 + 0.5) * 0.25;
                break;
            case 'ARCANE':
                idleGlow = 0.35 + Math.sin(et * 0.9) * 0.15;
                break;
            case 'MOON':
                idleGlow = 0.3 + Math.sin(et * 1.4) * 0.1;
                gemMaterial.emissive.setHSL(
                    (baseEmissiveHSL.h + Math.sin(et * 0.45) * 0.12 + 1) % 1,
                    Math.max(baseEmissiveHSL.s, 0.35), Math.min(baseEmissiveHSL.l + 0.1, 0.85)
                );
                break;
            case 'PRISM':
                idleGlow = 0.3 + Math.sin(et * 5.3) * Math.sin(et * 2.1) * 0.12;
                gemMaterial.emissive.setHSL((et * 0.05) % 1, 0.3, 0.8); // arco-íris lento
                break;
            case 'FOREST':
                idleGlow = 0.3 + Math.sin(et * 0.7) * 0.12;
                break;
            case 'TIDE':
                idleGlow = 0.3 + (Math.sin(et * 1.3) + Math.sin(et * 2.15) * 0.5) * 0.12;
                break;
            case 'SOLAR':
                // Sol do Rei: brasa dourada constante com ondulação majestosa
                idleGlow = 0.45 + Math.sin(et * 1.2) * 0.15 + Math.sin(et * 0.4) * 0.08;
                break;
        }
        gemMaterial.emissiveIntensity = idleGlow + firePulse * 3.0;
        if (lightRef.current) {
            const flicker = config.flavor === 'STORM' ? Math.sin(et * 11.7) * 0.4 : Math.sin(et * 2.0) * 0.3;
            lightRef.current.intensity = 1.3 + flicker + firePulse * 12;
        }

        // Nó flutuante: levitação (ARCANE/TIDE) ou órbita (MOON/FOREST)
        if (floatObj && floatBase) {
            if (config.flavor === 'ARCANE') {
                floatObj.position.y = floatBase.y + Math.sin(et * 1.6) * 0.16;
                floatObj.rotation.y = et * 1.4;
                floatObj.rotation.x = Math.sin(et * 0.7) * 0.1;
            } else if (config.flavor === 'SOLAR') {
                // Sol sobre o monólito: levitação suave + rotação lenta e digna
                floatObj.position.y = floatBase.y + Math.sin(et * 0.9) * 0.14;
                floatObj.rotation.y = et * 0.6;
                floatObj.rotation.x = Math.sin(et * 0.45) * 0.08;
            } else if (config.flavor === 'TIDE') {
                // Lágrima: sobe e desce como maré, giro lento
                floatObj.position.y = floatBase.y + Math.sin(et * 1.1) * 0.18;
                floatObj.rotation.y = et * 0.5;
            } else {
                // Vagalume/fogo-fátuo: órbita irregular
                const speed = config.flavor === 'FOREST' ? 0.65 : 0.9;
                const orbitR = (Math.hypot(floatBase.x, floatBase.z) || 0.45) * (1 + Math.sin(et * 1.7) * 0.15);
                floatObj.position.set(
                    Math.cos(et * speed) * orbitR,
                    floatBase.y + Math.sin(et * 2.3) * 0.12,
                    Math.sin(et * speed) * orbitR
                );
                // Vagalume pisca
                if (config.flavor === 'FOREST' && floatMaterial !== gemMaterial) {
                    (floatMaterial as THREE.MeshStandardMaterial).emissiveIntensity =
                        4.0 + (Math.sin(et * 6.7) * 0.5 + 0.5) * 4.0;
                }
            }
        }

        // Recoil + respiração (mesma família do Ruby)
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
            <pointLight ref={lightRef} color={config.lightColor} intensity={1.3} distance={4.5} decay={2} position={[0, 1.4, 0]} />
            <Sparkles count={20} scale={[1.6, 2.6, 1.6]} size={4} speed={0.55} opacity={0.5} color={config.sparkleColor} position={[0, 1.3, 0]} />
        </group>
    );
};
