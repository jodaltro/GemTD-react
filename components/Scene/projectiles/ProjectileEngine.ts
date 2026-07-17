import * as THREE from 'three';
import { GemType } from '../../../constants';

// ── World-space Y constants for enemies ───────────────────────────────────────
export const ENEMY_GROUND_Y      = 0.4;
export const ENEMY_FLYING_Y      = 1.5;
export const HIT_RADIUS          = 0.5;
export const HIT_RADIUS_AQUAMARINE = 0.85;

// ── Projectile visual archetype ───────────────────────────────────────────────
export type ProjectileStyle = 'CRYSTAL' | 'SPIKE' | 'METEOR' | 'ORB' | 'LIQUID' | 'VENOM' | 'HIDDEN';

export function getProjectileStyle(type: GemType): ProjectileStyle {
    switch (type) {
        case GemType.DIAMOND:      return 'HIDDEN';
        case GemType.PINK_DIAMOND:
        case GemType.TOPAZ:
        case GemType.SILVER:
        case GemType.GOLD:
        case GemType.YELLOW_SAPPHIRE: return 'CRYSTAL';
        case GemType.SAPPHIRE:
        case GemType.TOURMALINE:   return 'SPIKE';
        case GemType.AQUAMARINE:   return 'LIQUID';
        case GemType.RUBY:
        case GemType.STAR_RUBY:
        case GemType.RED_CRYSTAL:
        case GemType.BLOOD_STONE:  return 'METEOR';
        case GemType.DARK_EMERALD:
        case GemType.EMERALD:      return 'VENOM';
        case GemType.MALACHITE:
        case GemType.JADE:         return 'LIQUID';
        case GemType.AMETHYST:
        case GemType.OPAL:
        case GemType.BLACK_OPAL:
        case GemType.URANIUM_238:
        default:                   return 'ORB';
    }
}

// ── Geometries (module-level singletons) ──────────────────────────────────────
export const crystalGeo = new THREE.OctahedronGeometry(0.2, 0);
export const spikeGeo   = (() => {
    const g = new THREE.ConeGeometry(0.1, 0.6, 5);
    g.rotateX(Math.PI / 2);
    return g;
})();
export const meteorGeo  = new THREE.TetrahedronGeometry(0.25, 1);
export const orbGeo     = new THREE.IcosahedronGeometry(0.15, 1);
export const liquidGeo  = new THREE.SphereGeometry(0.14, 16, 16);
export const dropletGeo = new THREE.DodecahedronGeometry(0.05, 0);
export const cometGeo   = (() => {
    const g = new THREE.ConeGeometry(0.12, 1.8, 8, 1, true);
    g.translate(0, 0.9, 0);
    g.rotateX(-Math.PI / 2);
    return g;
})();

// ── Vertex shaders ────────────────────────────────────────────────────────────
export const VERTEX_SHADER = `
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec2 vUv;
  varying vec3 vWorldPosition;

  void main() {
    #ifdef USE_INSTANCING_COLOR
      vColor = instanceColor;
    #else
      vColor = vec3(1.0);
    #endif

    vUv = uv;

    mat4 instanceMat = instanceMatrix;
    vec4 worldPosition = modelMatrix * instanceMat * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;

    vec4 mvPosition = viewMatrix * worldPosition;
    vViewPosition = -mvPosition.xyz;

    vNormal = normalize(normalMatrix * mat3(instanceMat) * normal);

    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const LIQUID_VERTEX_SHADER = `
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  uniform float time;

  void main() {
    #ifdef USE_INSTANCING_COLOR
      vColor = instanceColor;
    #else
      vColor = vec3(1.0);
    #endif

    vec3 pos = position;

    float wobble = sin(pos.x * 6.0 + time * 12.0) * 0.04 +
                   sin(pos.y * 5.0 + time * 10.0) * 0.04 +
                   sin(pos.z * 6.0 + time * 14.0) * 0.04;

    pos += normal * wobble;

    mat4 instanceMat = instanceMatrix;
    vec4 worldPosition = modelMatrix * instanceMat * vec4(pos, 1.0);

    vec4 mvPosition = viewMatrix * worldPosition;
    vViewPosition = -mvPosition.xyz;
    vNormal = normalize(normalMatrix * mat3(instanceMat) * normal);

    gl_Position = projectionMatrix * mvPosition;
  }
`;

// ── Fragment shaders ──────────────────────────────────────────────────────────
export const CRYSTAL_FRAG = `
  uniform float time;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);
    float fresnel = pow(1.0 - abs(dot(viewDir, normal)), 2.0);
    float pulse = sin(vWorldPosition.x * 5.0 + time * 20.0) * 0.5 + 0.5;
    vec3 color = vColor * (1.0 + fresnel * 2.0 + pulse);
    gl_FragColor = vec4(color * 2.0, 1.0);
  }
`;

export const SPIKE_FRAG = `
  uniform float time;
  varying vec3 vColor;
  varying vec2 vUv;

  void main() {
    float noise = sin(vUv.x * 20.0 - time * 30.0) * 0.5 + 0.5;
    float core = 1.0 - abs(vUv.y - 0.5) * 2.0;
    core = pow(core, 3.0);
    vec3 color = vColor * (1.0 + noise + core * 5.0);
    gl_FragColor = vec4(color, 1.0);
  }
`;

export const METEOR_FRAG = `
  uniform float time;
  varying vec3 vColor;
  varying vec3 vWorldPosition;

  float rand(vec3 co) {
      return fract(sin(dot(co.xyz ,vec3(12.9898,78.233,45.543))) * 43758.5453);
  }

  void main() {
    float noise = rand(floor(vWorldPosition * 4.0 + time * 10.0));
    vec3 color = vColor * (1.0 + noise * 2.0);
    gl_FragColor = vec4(color, 1.0);
  }
`;

export const ORB_FRAG = `
  uniform float time;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);
    float fresnel = pow(1.0 - dot(normal, viewDir), 2.0);
    vec3 color = vColor * (1.0 + fresnel * 4.0);
    gl_FragColor = vec4(color, 1.0);
  }
`;

export const COMET_FRAG = `
  uniform float time;
  varying vec3 vColor;
  varying vec2 vUv;

  float random (vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
  }

  void main() {
    float scroll = time * -4.0;
    vec2 pos = vUv * vec2(15.0, 5.0);
    pos.y += scroll;
    float r = random(floor(pos));
    float particles = step(0.7, r);
    float fade = 1.0 - smoothstep(0.0, 1.0, vUv.y);
    fade *= fade;
    vec3 color = vColor * particles * 5.0;
    gl_FragColor = vec4(color, particles * fade);
  }
`;

export const LIQUID_FRAG = `
  uniform float time;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);
    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.5));

    vec3 halfVec = normalize(lightDir + viewDir);
    float spec = pow(max(dot(normal, halfVec), 0.0), 60.0);
    float specSharp = pow(max(dot(normal, halfVec), 0.0), 200.0);

    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.5);

    vec3 finalColor = vColor * 0.3 + vColor * fresnel * 2.0 + vec3(spec * 0.4) + vec3(specSharp * 0.9);

    float alpha = 0.12 + fresnel * 0.75 + specSharp * 0.6;
    alpha = clamp(alpha, 0.0, 1.0);

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

// ── Material types ────────────────────────────────────────────────────────────
export interface ProjectileMaterials {
    crystal: THREE.ShaderMaterial;
    spike:   THREE.ShaderMaterial;
    meteor:  THREE.ShaderMaterial;
    orb:     THREE.ShaderMaterial;
    comet:   THREE.ShaderMaterial;
    liquid:  THREE.ShaderMaterial;
}

// ── Material factory ──────────────────────────────────────────────────────────
export function createProjectileMaterials(): ProjectileMaterials {
    const uniforms = { time: { value: 0 } };
    return {
        crystal: new THREE.ShaderMaterial({
            vertexShader: VERTEX_SHADER, fragmentShader: CRYSTAL_FRAG,
            uniforms: { ...uniforms }, transparent: true,
            blending: THREE.AdditiveBlending, depthWrite: false,
        }),
        spike: new THREE.ShaderMaterial({
            vertexShader: VERTEX_SHADER, fragmentShader: SPIKE_FRAG,
            uniforms: { ...uniforms }, transparent: true,
            blending: THREE.AdditiveBlending, depthWrite: false,
        }),
        meteor: new THREE.ShaderMaterial({
            vertexShader: VERTEX_SHADER, fragmentShader: METEOR_FRAG,
            uniforms: { ...uniforms }, transparent: false,
        }),
        orb: new THREE.ShaderMaterial({
            vertexShader: VERTEX_SHADER, fragmentShader: ORB_FRAG,
            uniforms: { ...uniforms }, transparent: true,
            blending: THREE.AdditiveBlending, depthWrite: false,
        }),
        comet: new THREE.ShaderMaterial({
            vertexShader: VERTEX_SHADER, fragmentShader: COMET_FRAG,
            uniforms: { ...uniforms }, transparent: true,
            blending: THREE.AdditiveBlending, depthWrite: false,
        }),
        liquid: new THREE.ShaderMaterial({
            vertexShader: LIQUID_VERTEX_SHADER, fragmentShader: LIQUID_FRAG,
            uniforms: { ...uniforms }, transparent: true,
            blending: THREE.NormalBlending, depthWrite: false,
        }),
    };
}
