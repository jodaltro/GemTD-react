/**
 * TowerEngine — GPU-first rendering engine for all tower types.
 *
 * Generic utilities (all towers):
 *   buildGemMaterial   — PBR gem material with auto envMap + toneMapped handling
 *   buildGlowMaterial  — emissive eye/core glow material
 *   getFirePulse       — normalised attack-glow intensity [0..1]
 *   injectShaderEffects — GPU shader injection via onBeforeCompile
 *   ShaderHandle        — type for runtime uniform updates
 *
 * Instanced projectile pool (Niagara-style, used by Diamond + future towers):
 *   ProjState / createProjPool / tickProjPool
 *
 * Diamond Crown GPU shaders (Nanite-style vertex deform + Lumen caustics):
 *   SPIKE_COUNT / POOL_SIZE / LAUNCH_DURATION
 *   buildCrownMaterial / buildProjectileMaterial / buildSpikeGeometry
 *   CrownShaderHandle / updateCrownShader
 */

import * as THREE from 'three';

// ── Generic utilities ─────────────────────────────────────────────────────────

/**
 * Creates a MeshPhysicalMaterial with standardised gem defaults:
 * - toneMapped: false  (vivid colours, no renderer tone mapping)
 * - envMap / envMapIntensity handled automatically (0 when envMap is null)
 * All params are forwarded and can override any default.
 */
export function buildGemMaterial(
    params: THREE.MeshPhysicalMaterialParameters,
    envMap: THREE.Texture | null,
    envMapIntensity = 1.5
): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
        toneMapped: false,
        ...params,
        envMap: envMap ?? undefined,
        envMapIntensity: envMap ? envMapIntensity : 0,
    });
}

/**
 * Creates a MeshStandardMaterial for eye / core glow meshes.
 * toneMapped: false so emissive colours bloom at full intensity.
 */
export function buildGlowMaterial(
    color: string,
    emissive: string,
    emissiveIntensity = 5
): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
        color,
        emissive: new THREE.Color(emissive),
        emissiveIntensity,
        toneMapped: false,
        roughness: 0.1,
        metalness: 0,
    });
}

/**
 * Returns a normalised attack-glow intensity based on milliseconds since last shot.
 * 1.0 right after firing, decays linearly to 0 at windowMs.
 */
export function getFirePulse(timeSinceShot: number, windowMs = 220): number {
    return timeSinceShot < windowMs ? 1 - timeSinceShot / windowMs : 0;
}

// ── GPU shader injection ──────────────────────────────────────────────────────

export type ShaderHandle = { uniforms: Record<string, { value: unknown }> };

/**
 * Injects custom GLSL into any Three.js material via onBeforeCompile.
 * Writes the compiled shader handle into `handleOut` for runtime uniform updates.
 *
 * uniformsDecl  — GLSL uniform declarations (injected after #include <common>)
 * vertexInject  — injected after #include <begin_vertex>
 * fragmentInject — injected before #include <output_fragment> (outgoingLight in scope)
 */
export function injectShaderEffects(
    material: THREE.Material,
    opts: {
        extraUniforms: Record<string, { value: unknown }>;
        uniformsDecl: string;
        vertexInject?: string;
        fragmentInject?: string;
    },
    handleOut: { current: ShaderHandle | null }
): void {
    (material as any).onBeforeCompile = (shader: any) => {
        Object.assign(shader.uniforms, opts.extraUniforms);
        handleOut.current = shader;

        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>\n${opts.uniformsDecl}`);

        if (opts.vertexInject) {
            shader.vertexShader = shader.vertexShader
                .replace('#include <begin_vertex>', `#include <begin_vertex>\n${opts.vertexInject}`);
        }

        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\n${opts.uniformsDecl}`);

        if (opts.fragmentInject) {
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <output_fragment>', `${opts.fragmentInject}\n#include <output_fragment>`);
        }
    };
}

// ── Instanced projectile pool (Niagara-style) ─────────────────────────────────

export interface ProjState {
    pos:     THREE.Vector3;
    vel:     THREE.Vector3;
    dir:     THREE.Vector3;
    rot:     number;    // accumulated Y-axis spin (radians)
    life:    number;    // seconds remaining
    launchT: number;    // seconds since spawn (for scale-in)
    active:  boolean;
}

export function createProjPool(count: number): ProjState[] {
    return Array.from({ length: count }, () => ({
        pos:     new THREE.Vector3(),
        vel:     new THREE.Vector3(),
        dir:     new THREE.Vector3(0, 0, 1),
        rot:     0,
        life:    0,
        launchT: 0,
        active:  false,
    }));
}

const _dummy = new THREE.Object3D();
const _UP    = new THREE.Vector3(0, 1, 0);

/**
 * Advances physics for every active projectile and syncs the InstancedMesh matrices.
 * launchDuration — seconds for the scale-in ease (0 → full size).
 */
export function tickProjPool(
    pool: ProjState[],
    mesh: THREE.InstancedMesh,
    delta: number,
    launchDuration = 0.12
): void {
    for (let i = 0; i < pool.length; i++) {
        const p = pool[i];

        if (p.active) {
            p.life -= delta;
            if (p.life <= 0) {
                p.active = false;
            } else {
                p.pos.addScaledVector(p.vel, delta);
                p.rot += delta * 11;

                if (p.launchT < launchDuration)
                    p.launchT = Math.min(p.launchT + delta, launchDuration);

                const lt = p.launchT / launchDuration;
                const s  = (1 - Math.pow(1 - lt, 3)) * 1.2; // ease-out cubic

                _dummy.position.copy(p.pos);
                _dummy.quaternion.setFromUnitVectors(_UP, p.dir);
                _dummy.rotateY(p.rot);
                _dummy.scale.setScalar(s);
                _dummy.updateMatrix();
                mesh.setMatrixAt(i, _dummy.matrix);
                continue;
            }
        }

        // Inactive — push far off-screen (cheaper than toggling visibility)
        _dummy.position.set(0, -9999, 0);
        _dummy.scale.setScalar(0);
        _dummy.updateMatrix();
        mesh.setMatrixAt(i, _dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
}

// ── Diamond Crown — GPU spike deformation + Lumen caustics ───────────────────

export const SPIKE_COUNT    = 5;
export const POOL_SIZE      = 6;
export const LAUNCH_DURATION = 0.12; // seconds for shard to scale from 0 → full

// GLSL shared by both vertex and fragment passes
const CROWN_UNIFORMS = /* glsl */`
uniform float uTime;
uniform float uYMin;
uniform float uYHeight;
uniform float uFirePulse;
uniform float uCD0; uniform float uCD1; uniform float uCD2;
uniform float uCD3; uniform float uCD4;
`;

// Nanite-style GPU spike deformation — replaces the old 25-line CPU vertex loop
const VERT_DEFORM = /* glsl */`{
    float h   = max(uYHeight, 1e-4);
    float ty  = (transformed.y - uYMin) / h;
    float ang = atan(transformed.z, transformed.x);
    float spk = pow(max(0.0, cos(ang * float(${SPIKE_COUNT}))), 6.0);
    float rn  = min(1.0, length(transformed.xz) / (h * 0.7));
    float eT  = smoothstep(0.62, 1.0, rn);
    float tT  = smoothstep(0.70, 1.0, ty);
    // Dynamic indexing is invalid in GLSL ES — cascade with step() instead
    float si = mod(floor((ang + 3.14159265) / 6.28318530 * float(${SPIKE_COUNT})), float(${SPIKE_COUNT}));
    float cd = uCD0;
    if (si > 0.5) cd = uCD1;
    if (si > 1.5) cd = uCD2;
    if (si > 2.5) cd = uCD3;
    if (si > 3.5) cd = uCD4;
    transformed.y += spk * eT * tT * 2.0 * h * smoothstep(0.0, 1.0, 1.0 - cd);
}`;

// Lumen-inspired prismatic caustics — additive to outgoingLight before output
const FRAG_CAUSTICS = /* glsl */`{
    float ct = uTime * 0.8;
    vec3  wp = vWorldPosition.xyz;
    float ci = sin(wp.x * 3.1 + ct) * cos(wp.z * 2.7 - ct * 1.3);
    float cj = sin(wp.x * 4.7 - ct * 0.9) * cos(wp.y * 3.3 + ct);
    float c  = pow(max(0.0, ci * 0.5 + cj * 0.5), 3.0);
    outgoingLight += vec3(
        sin(ct * 1.1 + 0.000) * 0.5 + 0.5,
        sin(ct * 1.1 + 2.094) * 0.5 + 0.5,
        sin(ct * 1.1 + 4.189) * 0.5 + 0.5
    ) * c * 0.35 * (0.2 + uFirePulse * 0.8);
}`;

export type CrownShaderHandle = ShaderHandle;

/**
 * Builds the Diamond Crown material:
 * - Full PBR diamond (IOR 2.42, iridescence, transmission)
 * - GPU vertex spike deformation
 * - Prismatic caustics in fragment shader
 */
export function buildCrownMaterial(
    envMap: THREE.Texture | null,
    shaderOut: { current: CrownShaderHandle | null }
): THREE.MeshPhysicalMaterial {
    const mat = buildGemMaterial({
        color: '#ffffff',
        metalness: 0, roughness: 0.04,
        transmission: 0.95, thickness: 1.8,
        clearcoat: 1, clearcoatRoughness: 0.02,
        ior: 2.42,
        iridescence: 1, iridescenceIOR: 1.3,
        iridescenceThicknessRange: [100, 400] as [number, number],
    }, envMap, 2.5);

    injectShaderEffects(mat, {
        extraUniforms: {
            uTime:     { value: 0 },
            uYMin:     { value: 0 },
            uYHeight:  { value: 1 },
            uFirePulse:{ value: 0 },
            uCD0: { value: 0 }, uCD1: { value: 0 }, uCD2: { value: 0 },
            uCD3: { value: 0 }, uCD4: { value: 0 },
        },
        uniformsDecl:   CROWN_UNIFORMS,
        vertexInject:   VERT_DEFORM,
        fragmentInject: FRAG_CAUSTICS,
    }, shaderOut);

    return mat;
}

export function buildProjectileMaterial(): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
        color: '#d0f0ff',
        emissive: new THREE.Color('#40a0ff'),
        emissiveIntensity: 5,
        metalness: 0, roughness: 0,
        transmission: 0.5, thickness: 0.3,
        clearcoat: 1, clearcoatRoughness: 0,
        ior: 2.42,
        iridescence: 0.8, iridescenceIOR: 1.3,
        iridescenceThicknessRange: [100, 300] as [number, number],
        toneMapped: false,
    });
}

/** Elongated octahedron — classic diamond shard silhouette. */
export function buildSpikeGeometry(): THREE.BufferGeometry {
    const g = new THREE.OctahedronGeometry(0.11, 0);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * 4.2);
    p.needsUpdate = true;
    g.computeVertexNormals();
    return g;
}

/** Update all GPU uniform values each frame. */
export function updateCrownShader(
    handle: CrownShaderHandle,
    time: number,
    yMin: number,
    yHeight: number,
    firePulse: number,
    cooldowns: number[]
): void {
    const u = handle.uniforms;
    u.uTime.value      = time;
    u.uYMin.value      = yMin;
    u.uYHeight.value   = yHeight;
    u.uFirePulse.value = firePulse;
    u.uCD0.value = cooldowns[0] ?? 0;
    u.uCD1.value = cooldowns[1] ?? 0;
    u.uCD2.value = cooldowns[2] ?? 0;
    u.uCD3.value = cooldowns[3] ?? 0;
    u.uCD4.value = cooldowns[4] ?? 0;
}
