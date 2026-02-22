
import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../../store/useGameStore';
import { CELL_SIZE, BOARD_OFFSET_X, BOARD_OFFSET_Z, GemType } from '../../constants';

const tempObj = new THREE.Object3D();
const tempColor = new THREE.Color();

// --- ARCHETYPES DEFINITION ---
type ProjectileStyle = 'CRYSTAL' | 'SPIKE' | 'METEOR' | 'ORB' | 'LIQUID' | 'VENOM' | 'HIDDEN';

const getProjectileStyle = (type: GemType): ProjectileStyle => {
  switch (type) {
    case GemType.DIAMOND:
    case GemType.PINK_DIAMOND:
    case GemType.TOPAZ:
    case GemType.SILVER:
    case GemType.GOLD:
    case GemType.YELLOW_SAPPHIRE:
      return 'CRYSTAL'; 
    
    case GemType.SAPPHIRE:
    // EMERALD removed from here to allow it to fall through to LIQUID
    case GemType.TOURMALINE:
      return 'SPIKE'; 
    case GemType.AQUAMARINE:
      return 'LIQUID';
      
    case GemType.RUBY:
    case GemType.STAR_RUBY:
    case GemType.RED_CRYSTAL:
    case GemType.BLOOD_STONE:
      return 'METEOR'; 
    
    case GemType.DARK_EMERALD:
    case GemType.EMERALD:
      return 'VENOM';

    case GemType.MALACHITE:
    case GemType.JADE:
      return 'LIQUID';

    case GemType.AMETHYST:
    case GemType.OPAL:
    case GemType.BLACK_OPAL:
    case GemType.URANIUM_238:
    default:
      return 'ORB'; 
  }
};

// --- GEOMETRIES ---
const crystalGeo = new THREE.OctahedronGeometry(0.2, 0); 
const spikeGeo = new THREE.ConeGeometry(0.1, 0.6, 5); 
spikeGeo.rotateX(Math.PI / 2); // Point Z-forward
const meteorGeo = new THREE.TetrahedronGeometry(0.25, 1); 
const orbGeo = new THREE.IcosahedronGeometry(0.15, 1); 
// High-poly Sphere for smooth liquid surface
const liquidGeo = new THREE.SphereGeometry(0.14, 16, 16); 
const dropletGeo = new THREE.DodecahedronGeometry(0.05, 0); // Small droplets for trail

// Comet Tail Geometry
const cometGeo = new THREE.ConeGeometry(0.12, 1.8, 8, 1, true);
cometGeo.translate(0, 0.9, 0); 
cometGeo.rotateX(-Math.PI / 2); 

// --- SHADERS ---

const VERTEX_SHADER = `
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

// LIQUID VERTEX SHADER (Smoother Wobble)
const LIQUID_VERTEX_SHADER = `
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

    // Organic Wobble
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

const CRYSTAL_FRAG = `
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

const SPIKE_FRAG = `
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

const METEOR_FRAG = `
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

const ORB_FRAG = `
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

const COMET_FRAG = `
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

// LIQUID / TRANSLUCENT FRAGMENT SHADER (emerald gem-liquid style)
const LIQUID_FRAG = `
  uniform float time;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);
    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.5));
    
    // Sharp specular highlight (glossy liquid surface)
    vec3 halfVec = normalize(lightDir + viewDir);
    float spec = pow(max(dot(normal, halfVec), 0.0), 60.0);
    float specSharp = pow(max(dot(normal, halfVec), 0.0), 200.0);
    
    // Fresnel: edges glow with the gem color, center is very transparent
    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.5);
    
    // Core color: deep translucent tint
    vec3 finalColor = vColor * 0.3 + vColor * fresnel * 2.0 + vec3(spec * 0.4) + vec3(specSharp * 0.9);
    
    // Very transparent in center, opaque at silhouette edges
    float alpha = 0.12 + fresnel * 0.75 + specSharp * 0.6;
    alpha = clamp(alpha, 0.0, 1.0);
    
    gl_FragColor = vec4(finalColor, alpha);
  }
`;


export const Projectiles: React.FC = () => {
  const crystalRef = useRef<THREE.InstancedMesh>(null);
  const spikeRef = useRef<THREE.InstancedMesh>(null);
  const meteorRef = useRef<THREE.InstancedMesh>(null);
  const orbRef = useRef<THREE.InstancedMesh>(null);
  const liquidRef = useRef<THREE.InstancedMesh>(null);
  const dropletsRef = useRef<THREE.InstancedMesh>(null); // New trail droplets
  const cometRef = useRef<THREE.InstancedMesh>(null); 

  const projectiles = useGameStore((state) => state.projectiles);
  const enemies = useGameStore((state) => state.enemies);
  const damageEnemy = useGameStore((state) => state.damageEnemy);
  const removeProjectile = useGameStore((state) => state.removeProjectile);

  // Define Materials
  const materials = useMemo(() => {
      const uniforms = { time: { value: 0 } };
      return {
          crystal: new THREE.ShaderMaterial({ vertexShader: VERTEX_SHADER, fragmentShader: CRYSTAL_FRAG, uniforms: { ...uniforms }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
          spike: new THREE.ShaderMaterial({ vertexShader: VERTEX_SHADER, fragmentShader: SPIKE_FRAG, uniforms: { ...uniforms }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
          meteor: new THREE.ShaderMaterial({ vertexShader: VERTEX_SHADER, fragmentShader: METEOR_FRAG, uniforms: { ...uniforms }, transparent: false }), 
          orb: new THREE.ShaderMaterial({ vertexShader: VERTEX_SHADER, fragmentShader: ORB_FRAG, uniforms: { ...uniforms }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
          comet: new THREE.ShaderMaterial({ vertexShader: VERTEX_SHADER, fragmentShader: COMET_FRAG, uniforms: { ...uniforms }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
          liquid: new THREE.ShaderMaterial({ vertexShader: LIQUID_VERTEX_SHADER, fragmentShader: LIQUID_FRAG, uniforms: { ...uniforms }, transparent: true, blending: THREE.NormalBlending, depthWrite: false }),
      };
  }, []);

  useFrame((state, delta) => {
    const time = state.clock.getElapsedTime();
    
    // Update Uniforms
    materials.crystal.uniforms.time.value = time;
    materials.spike.uniforms.time.value = time;
    materials.meteor.uniforms.time.value = time;
    materials.orb.uniforms.time.value = time;
    materials.comet.uniforms.time.value = time;
    materials.liquid.uniforms.time.value = time;

    // Reset counts
    let cCount = 0, sCount = 0, mCount = 0, oCount = 0, lCount = 0, dCount = 0;

    // Iterate all projectiles
    for (let i = 0; i < projectiles.length; i++) {
      const proj = projectiles[i];
      const target = enemies.find(e => e.id === proj.targetId);

      // --- LOGIC: Movement & Hit Detection ---
      if (!target || target.isDead) {
        removeProjectile(proj.id);
        continue;
      }

      const isAquamarine = proj.sourceType === GemType.AQUAMARINE;
      const enemyHeight = target.isFlying ? 1.5 : 0.4;
      // Aquamarine gets a small predictive lock so it can "stick" to targets
      // even when the enemy is moving directly towards the tower.
      const lockAhead = isAquamarine ? 0.12 : 0;
      const dx = (target.x + lockAhead) - proj.x;
      const dy = enemyHeight - proj.y;
      const dz = target.y - proj.z;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      const hitRadius = isAquamarine ? 0.75 : 0.5;
      const speedMult = isAquamarine ? 1.7 : 1;
      const moveDist = proj.speed * speedMult * delta;
      const willReachThisFrame = moveDist >= dist;

      if (dist < hitRadius || willReachThisFrame) {
        if (willReachThisFrame) {
          proj.x = target.x;
          proj.y = enemyHeight;
          proj.z = target.y;
        }
        // HIT
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

      // Move
      // Prevent overshoot that can make the projectile orbit around the target.
      if (moveDist >= dist) {
        proj.x = target.x;
        proj.y = enemyHeight;
        proj.z = target.y;
      } else {
        const factor = moveDist / dist;
        proj.x += dx * factor;
        proj.y += dy * factor;
        proj.z += dz * factor;
      }

      // --- VISUALS: Positioning & Animation ---
      const style = getProjectileStyle(proj.sourceType);
      if (style === 'HIDDEN') {
        continue;
      }
      
      const rX = proj.x * CELL_SIZE + BOARD_OFFSET_X;
      const rY = proj.y;
      const rZ = proj.z * CELL_SIZE + BOARD_OFFSET_Z;
      const tX = target.x * CELL_SIZE + BOARD_OFFSET_X;
      const tY = target.isFlying ? 1.5 : 0.4;
      const tZ = target.y * CELL_SIZE + BOARD_OFFSET_Z;

      // Scale Animation (Grow on spawn)
      const age = time - proj.spawnTime;
      const growProgress = Math.min(age * 5.0, 1.0); 
      const scaleMult = 1 - Math.pow(1 - growProgress, 3); 

      tempObj.position.set(rX, rY, rZ);
      tempObj.lookAt(tX, tY, tZ);

      // Unique Animations per Archetype
      if (style === 'CRYSTAL') {
          tempObj.rotateZ(time * 15);
          tempObj.scale.set(0.6 * scaleMult, 0.6 * scaleMult, 2.5 * scaleMult); 
          
          tempObj.updateMatrix();
          crystalRef.current!.setMatrixAt(cCount, tempObj.matrix);
          crystalRef.current!.setColorAt(cCount, tempColor.set(proj.color)); 
          cCount++;
      } 
      else if (style === 'SPIKE') {
          tempObj.rotateZ(time * 25);
          tempObj.scale.set(1.2 * scaleMult, 1.2 * scaleMult, 2.0 * scaleMult);

          tempObj.updateMatrix();
          spikeRef.current!.setMatrixAt(sCount, tempObj.matrix);
          spikeRef.current!.setColorAt(sCount, tempColor.set(proj.color));
          sCount++;
      }
      else if (style === 'METEOR') {
          tempObj.rotation.set(time * 8 + i, time * 5, i);
          const pulse = 1.0 + Math.sin(time * 20 + i) * 0.2;
          const s = pulse * scaleMult;
          tempObj.scale.set(s, s, s);
          
          tempObj.updateMatrix();
          meteorRef.current!.setMatrixAt(mCount, tempObj.matrix);
          meteorRef.current!.setColorAt(mCount, tempColor.set(proj.color));
          mCount++;
      }
      else if (style === 'LIQUID' || style === 'VENOM') {
          const isVenom = style === 'VENOM';
          const venomPulse = isVenom ? (0.88 + Math.sin(time * 20 + i * 0.6) * 0.16) : 1.0;
          if (isAquamarine) {
              // Aquamarine looks like a short sticky tentacle wrapping the target.
              const wrapPulse = 1.0 + Math.sin(time * 40 + i) * 0.15;
              tempObj.scale.set(0.45 * scaleMult, 0.45 * scaleMult, 3.2 * scaleMult * wrapPulse);
              tempObj.rotateZ(Math.sin(time * 30 + i) * 0.35);
          } else {
              // Liquid blob stretches to look like a flying stream
              tempObj.scale.set(0.6 * scaleMult * venomPulse, 0.6 * scaleMult, 2.5 * scaleMult * (isVenom ? 1.2 : 1.0)); 
          }
          
          tempObj.updateMatrix();
          liquidRef.current!.setMatrixAt(lCount, tempObj.matrix);
          liquidRef.current!.setColorAt(lCount, tempColor.set(proj.color));
          lCount++;

          // --- LIQUID TRAIL DROPLETS ---
          const wx = tX - rX;
          const wy = tY - rY;
          const wz = tZ - rZ;
          const wDist = Math.sqrt(wx*wx + wy*wy + wz*wz) || 0.001;
          const nx = wx / wDist;
          const ny = wy / wDist;
          const nz = wz / wDist;

          const numDrops = isVenom ? 8 : 5;
          for (let k = 1; k <= numDrops; k++) {
              const lag = k * 0.35; 
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
      }
      else { // ORB with Comet Tail
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

    // Update instances
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
      <instancedMesh ref={crystalRef} args={[crystalGeo, materials.crystal, 100]} frustumCulled={false} />
      <instancedMesh ref={spikeRef} args={[spikeGeo, materials.spike, 100]} frustumCulled={false} />
      <instancedMesh ref={meteorRef} args={[meteorGeo, materials.meteor, 100]} frustumCulled={false} />
      {/* Liquid Blob - High Poly Sphere */}
      <instancedMesh ref={liquidRef} args={[liquidGeo, materials.liquid, 100]} frustumCulled={false} />
      {/* Liquid Droplets - Trail (High count for spray) */}
      <instancedMesh ref={dropletsRef} args={[dropletGeo, materials.liquid, 500]} frustumCulled={false} />
      {/* Orb Head */}
      <instancedMesh ref={orbRef} args={[orbGeo, materials.orb, 100]} frustumCulled={false} />
      {/* Comet Tail */}
      <instancedMesh ref={cometRef} args={[cometGeo, materials.comet, 100]} frustumCulled={false} />
    </group>
  );
};
