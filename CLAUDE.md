# GemTD React — Guia para Claude Code

## Visão Geral
Tower Defense 3D inspirado no clássico Gem TD (Warcraft 3). Mecânica central: colocar 5 gemas aleatórias, escolher 1 para manter como torre (as outras 4 viram pedras/labirinto), combinar gemas para evoluir, defender de ondas de inimigos.

**Dev server**: `npm run dev` (Vite, porta padrão 5173)  
**Build**: `npm run build`  
**Idioma do usuário**: Português brasileiro

---

## Stack
- React 18.3.1 + TypeScript 5.8
- **Three.js 0.169** via **@react-three/fiber 8.17** (R3F)
- **@react-three/drei 9.114** — helpers (GLB loader, OrbitControls, Sparkles, etc.)
- **@react-three/postprocessing 2.16** — Bloom/Vignette
- **Zustand 4.5** — estado global centralizado
- **three-stdlib 2.36** — SkeletonUtils para clone de GLTFs
- Tailwind CSS via CDN, lucide-react para ícones

---

## Mapa de Arquivos Críticos

| Arquivo | Papel |
|---|---|
| `constants.ts` | **Cérebro do balanceamento**: stats de gemas, receitas, ondas, economia, probabilidades |
| `types.ts` | Interfaces TypeScript globais (GridCell, Enemy, Projectile, GameState…) |
| `store/useGameStore.ts` | **Único estado global** (Zustand). Toda lógica de jogo passa aqui |
| `utils/pathfinding.ts` | A* (validação de bloqueio) + BFS Flow Field (navegação dos inimigos) |
| `components/Scene/GameScene.tsx` | Canvas R3F, câmera, luzes, monta todos os sistemas |
| `components/Scene/Structures.tsx` | Renderiza rochas + **pedestais** (InstancedMesh) e delega torres para `Tower` |
| `components/Scene/Towers.tsx` | **Loop de combate**: targeting + cooldown + disparo de projéteis (useFrame) |
| `components/Scene/Enemies.tsx` | **Loop de inimigos**: spawn, movimento via Flow Field, status effects, InstancedMesh |
| `components/Scene/Projectiles.tsx` | Física dos projéteis, colisão, dano — importa lógica do `ProjectileEngine` |
| `components/Scene/projectiles/ProjectileEngine.ts` | **Engine de projéteis**: estilos, geometrias, shaders GLSL, factory de materiais, constantes de altura |
| `components/Scene/towers/Tower.tsx` | Componente por torre: posicionamento (elevado ao `PEDESTAL_HEIGHT`), lookAt, refs de mira |
| `components/Scene/towers/DiamondEngine.ts` | Shim legado — re-exporta tudo de `shared/TowerEngine.ts` |
| `components/Scene/towers/shared/TowerEngine.ts` | **Engine GPU de torres**: materiais PBR, shader injection, pool instanced — usado por todos os archetypes |
| `components/Scene/towers/shared/types.ts` | `GemMaterialConfig`, `StonefishAimData`, `DiamondAimData`, `smoothstep` |
| `components/Scene/towers/shared/gemConfig.ts` | `GEM_PHYSICS`, `ORB_TYPES`, `SNAKE_TYPES`, `STONEFISH_TYPES`, `RUBY_TYPES` |
| `components/Scene/towers/golem/GolemModel.tsx` | Renderiza GLB golem + branch para Snake/Stonefish/Diamond/Ruby |
| `components/Scene/towers/diamond/DiamondCrown.tsx` | Modelo Diamond: `diamond.glb` + GPU vertex deform + magazine de spikes + pool instanced própria |
| `components/Scene/towers/ruby/Ruby.tsx` | Modelo Ruby: `ruby.glb` (cluster de cristais) + pulso emissivo + recoil |
| `components/Scene/towers/snake/Snake.tsx` | Animação de cobra para Emerald/Dark Emerald |
| `components/Scene/towers/stonefish/Stonefish.tsx` | Animação para Aquamarine |
| `components/UI/Interface.tsx` | HUD completo: stats, botões, receitas, prayer modal |

### Assets GLB (em `public/glb/`)
- `golem_-_attack.glb` — modelo base de todas as torres (skeleton animado)
- `diamond.glb` — modelo usado pelo DiamondCrown
- `ruby.glb` — cluster de cristais procedural usado pelo Ruby (gerado via skill game-model-gen)
- `snake.glb` — (presente mas Snake usa o golem com bone manipulation)

---

## Constantes-Chave (`constants.ts`)

```
GRID_SIZE = 12        (mapa 12×12)
CELL_SIZE = 1.0
PEDESTAL_HEIGHT = 0.5 (elevação do palanque sob cada torre)
START_POS = { x:0, y:6 }   END_POS = { x:11, y:6 }
STARTING_LIVES = 20,  STARTING_GOLD = 10000
HP_BASE = 20,  HP_GROWTH_FACTOR = 1.30  (HP = 20 * 1.30^wave)
BASE_STONE_COST = 50  (aumenta +25 por pedra removida)
PRAY_COST_COLOR = 5g  (40% chance gema específica)
PRAY_COST_QUALITY = 15g (+2 níveis efetivos)
RANGE_SCALE = 0.03    (converte unidades WC3 → células Three.js)
```

### Enums principais
```typescript
CellType: EMPTY=0, ROCK=1, TOWER=2, BLOCKED=3
GemType: DIAMOND, EMERALD, RUBY, SAPPHIRE, AMETHYST, TOPAZ, AQUAMARINE, OPAL  (básicos)
         SILVER, MALACHITE, JADE, STAR_RUBY, RED_CRYSTAL, DARK_EMERALD, GOLD,
         PINK_DIAMOND, URANIUM_238, BLACK_OPAL, BLOOD_STONE, YELLOW_SAPPHIRE, TOURMALINE
GemQuality: CHIPPED → FLAWED → NORMAL → FLAWLESS → PERFECT → GREAT → SPECIAL
GamePhase: BUILDING → SELECTING → READY → DEFENDING
```

---

## Arquitetura de Estado (Zustand)

O estado vive inteiro em `useGameStore`. Componentes React subscrevem com seletores:
```typescript
const gold = useGameStore(s => s.gold);
const damageEnemy = useGameStore(s => s.damageEnemy);
```

**Fluxo padrão para novas features**:
1. Definir tipo em `types.ts` se necessário
2. Adicionar estado + action em `useGameStore.ts`
3. Consumir na UI em `Interface.tsx` ou no 3D em Scene/

---

## Game Loop (Distribuído via useFrame)

Não há loop centralizado. Cada sistema tem seu `useFrame`:

- **Towers.tsx** — a cada frame: encontra alvo, verifica cooldown, dispara projétil com delay visual (`setTimeout`).
- **Enemies.tsx** — a cada frame: processa status effects, move via Flow Field (ground) ou linha reta (flying), detecta chegada ao END_POS, renderiza InstancedMesh com cores por estado.
- **Projectiles.tsx** — homing physics, colisão por distância, splash damage. Importa geometrias/materiais/constantes do `ProjectileEngine`.

---

## Arquitetura de Torres (hierarquia de componentes)

```
Structures.tsx
  ├── InstancedMesh (rocks)
  ├── InstancedMesh (pedestals — CylinderGeometry hexagonal sob cada torre)
  └── towers/Tower.tsx (por torre ativa no grid, posicionada em Y = PEDESTAL_HEIGHT)
        ├── refs de mira: stonefishAimRef, diamondAimRef
        └── towers/golem/GolemModel.tsx
              ├── [Diamond]   → towers/diamond/DiamondCrown.tsx (diamond.glb + vertex deform + pool própria)
              ├── [Ruby]      → towers/ruby/Ruby.tsx (early-return, ruby.glb + pulso emissivo)
              ├── [Snake]     → towers/snake/Snake.tsx (early-return, geom procedural)
              ├── [Stonefish] → towers/stonefish/Stonefish.tsx (early-return, geom procedural)
              └── [default]   → Golem GLB animado com bone manipulation
```

**Convenção de pasta por archetype** (`towers/<archetype>/`):
- `<Archetype>.tsx` — modelo 3D + animação
- `<Archetype>Projectile.tsx` — pool de projéteis própria (quando o archetype não usa o sistema global)
- Shared entre todos: `towers/shared/TowerEngine.ts`, `towers/shared/types.ts`, `towers/shared/gemConfig.ts`

**Classificação por tipo** (em `shared/gemConfig.ts`):

| Archetype | Gem Types | Técnica |
|---|---|---|
| **Golem** (default) | Sapphire, Topaz, Gold… | GLB padrão com attack animation |
| **DiamondCrown** | Diamond | `diamond.glb` + GPU vertex deform + magazine de spikes + pool instanced |
| **Ruby** | Ruby | `ruby.glb` (cluster de cristais na rocha) + pulso emissivo + flash/recoil no disparo |
| **Orb** | Amethyst, Opal, Black Opal, Uranium, Tourmaline | Esconde membros, head/spine reescalados → floating chest |
| **Snake** | Emerald, Dark Emerald | Procedural: early-return do GolemModel, ProceduralSnake |
| **Stonefish** | Aquamarine | Fully procedural: LatheGeometry pear-shaped + Catmull-Rom tendrils |

### Diamond Crown — mecânica de magazine de spikes
- 5 spikes ficam estendidas; disparam **sequencialmente** (round-robin, não aleatório)
- Cada spike disparada **fica retraída** (não cresce de volta individualmente)
- Quando todas as 5 são gastas → **reload** inicia (1,2 s), crown pulsa azul claro
- Após reload, **todas as 5 crescem simultaneamente** (efeito "burst")
- Estado: `spikeAmmoRef` (boolean[5]), `reloadingRef`, `reloadTimerRef`, `nextSpikeRef`
- Regra de cooldown: `ammo[i]=false` mantém `cooldown[i]=1.0` (spike fica flat); decay só ocorre quando `ammo[i]=true`

### Aquamarine (ProceduralStonefish) — detalhes
- Body: `LatheGeometry` (perfil gota/pera), `rotation={[Math.PI,0,0]}` (ponta pra baixo)
- Material: via `buildGemMaterial`, transmission 0.7, ior 1.65, sheen ciano
- Float: `y = 1.2 + sin(t*1.1)*0.1`, sway suave
- Attack: lunge no z-axis em 400ms (20% in, 80% ease-out)
- Water tendrils: 4 tendrils × 14 esferas por Catmull-Rom splines com animação senoidal
- Water droplets: 16 orbitando com escala elipsoidal pulsante

### Adicionando novo archetype visual
1. Criar pasta `towers/<archetype>/` com `<Archetype>.tsx` (modelo) e opcionalmente `<Archetype>Projectile.tsx`
2. Adicionar array constante em `shared/gemConfig.ts`
3. Detectar em `Tower.tsx` → passar como prop para `GolemModel`
4. Procedural puro: criar componente em `towers/<archetype>/`, early-return em `golem/GolemModel.tsx`
5. Baseado no golem: adicionar bone manipulation em `GolemModel.useLayoutEffect`
6. Usar `buildGemMaterial` / `buildGlowMaterial` de `shared/TowerEngine` para materiais
7. Diamond é o padrão de referência: projétil com pool própria em `diamond/DiamondCrown.tsx`, skip do `spawnProjectile` em `Towers.tsx`, dano aplicado diretamente via `useGameStore.getState().damageEnemy`

---

## Sistema de Dano

```typescript
// Pipeline em damageEnemy() (useGameStore.ts)
typeMultiplier = enemy.weakness === attackType ? DAMAGE_MULTIPLIERS[attackType] : DAMAGE_PENALTY (0.8)
effectiveArmor = enemy.baseArmor - armorShred  // ARMOR_SHRED effects
armorMultiplier = armor>=0 ? 1 - (0.06*armor)/(1+0.06*armor) : 2 - 0.94^(-armor)
finalDamage = baseDamage * typeMultiplier * armorMultiplier * (tower.damageMultiplier || 1)
```

**Status Effects** (aplicados em `damageEnemy`, processados em `Enemies.tsx/useFrame`):
- SLOW: reduz velocidade multiplicativamente
- POISON: dano por tick (visual slime overlay)
- ARMOR_SHRED: reduz armadura base permanentemente
- STUN: zera velocidade (cooldown de 2s entre stuns)

---

## Pathfinding

- **A*** em `isPathPossible()` — valida antes de colocar cada gema (evita bloqueio de caminho)
- **BFS Flow Field** em `generateFlowField()` — regenerado após toda mudança de layout; inimigos consultam em O(1)
- Células walkers: apenas `CellType.EMPTY` (rocks e towers bloqueiam)

---

## TowerEngine — API do Engine GPU

`components/Scene/towers/shared/TowerEngine.ts` é o ponto central de rendering de torres. **Sempre importar daqui** para novos materiais ou efeitos.

```typescript
// ── Materiais (todas as torres)
buildGemMaterial(params, envMap, envMapIntensity?)
// → MeshPhysicalMaterial com toneMapped:false e envMap automático
// → Usado por Diamond, Snake, Stonefish, Golem

buildGlowMaterial(color, emissive, emissiveIntensity?)
// → MeshStandardMaterial para olhos/núcleo brilhante

// ── Shader GPU (injeção em qualquer material)
injectShaderEffects(material, { extraUniforms, uniformsDecl, vertexInject?, fragmentInject? }, handleOut)
// → onBeforeCompile com inject após #include <begin_vertex> e antes de #include <output_fragment>
// → handleOut.current recebe o shader compilado para atualizar uniforms por frame

// ── Pool de projéteis instanced (Niagara-style)
createProjPool(count)          // → ProjState[]
tickProjPool(pool, mesh, delta) // → atualiza física + sincroniza InstancedMesh

// ── Utilitários
getFirePulse(timeSinceShot, windowMs?) // → [0..1], 1 logo após disparo
```

**Diamond Crown especificamente:**
```typescript
buildCrownMaterial(envMap, shaderOut) // GPU spike deform + caustics Lumen-style
updateCrownShader(handle, time, yMin, yHeight, firePulse, cooldowns[])
buildProjectileMaterial() / buildSpikeGeometry()
SPIKE_COUNT=5 / POOL_SIZE=6 / LAUNCH_DURATION=0.12
```

---

## ProjectileEngine — API do Engine de Projéteis

`components/Scene/projectiles/ProjectileEngine.ts` centraliza tudo que é reutilizável pelos projéteis. **Sempre importar daqui** ao criar novos estilos de projétil ou consultar alturas Y.

```typescript
// ── Constantes de altura (mundo 3D) ──────────────────────────────────────────
ENEMY_GROUND_Y = 0.4   // Y world de inimigos terrestres
ENEMY_FLYING_Y = 1.5   // Y world de inimigos voadores
HIT_RADIUS          = 0.5   // raio de colisão padrão
HIT_RADIUS_AQUAMARINE = 0.85

// ── Estilo visual por tipo de gema ───────────────────────────────────────────
type ProjectileStyle = 'CRYSTAL' | 'SPIKE' | 'METEOR' | 'ORB' | 'LIQUID' | 'VENOM' | 'HIDDEN'
getProjectileStyle(type: GemType): ProjectileStyle

// ── Geometrias singleton (module-level, nunca recriar) ───────────────────────
crystalGeo, spikeGeo, meteorGeo, orbGeo, liquidGeo, dropletGeo, cometGeo

// ── Shaders GLSL exportados ───────────────────────────────────────────────────
VERTEX_SHADER, LIQUID_VERTEX_SHADER
CRYSTAL_FRAG, SPIKE_FRAG, METEOR_FRAG, ORB_FRAG, COMET_FRAG, LIQUID_FRAG

// ── Factory de materiais (chamar dentro de useMemo) ───────────────────────────
createProjectileMaterials(): ProjectileMaterials
// → { crystal, spike, meteor, orb, comet, liquid } — cada um ShaderMaterial com uniform `time`
```

**Alturas de spawn em `Towers.tsx`** (sempre `PEDESTAL_HEIGHT + offset_relativo`):
| Archetype | spawnY |
|---|---|
| Golem (default) | `PEDESTAL_HEIGHT + 0.6` = 1.1 |
| Snake | `PEDESTAL_HEIGHT + 0.55` = 1.05 |
| Orb | `PEDESTAL_HEIGHT + 1.2` = 1.7 |

---

## Patterns de Código

```typescript
// ✅ InstancedMesh para renderizar muitos objetos (rochas, pedestais, inimigos, projéteis)
// ✅ useFrame(state, delta) para animações (nunca setInterval)
// ✅ SkeletonUtils.clone(scene) para clonar GLTFs com skeleton
// ✅ Refs mutáveis (useRef) para dados de frame (timeSinceShotRef, aimRef)
// ✅ useMemo para geometrias e materiais (criação única)
// ✅ Seletores granulares no Zustand (não subscrever todo o state)
// ✅ buildGemMaterial() do TowerEngine para todos os materiais de torres
// ✅ injectShaderEffects() para GPU vertex/fragment customization
// ✅ Importar ENEMY_GROUND_Y / ENEMY_FLYING_Y do ProjectileEngine (nunca hardcodar 0.4 / 1.5)
// ✅ Importar PEDESTAL_HEIGHT de constants.ts ao calcular Y world de torres/projéteis
```

---

## Receitas Especiais (resumo)

13 gemas especiais craftadas via `combineSpecialGem()`. Definidas em `RECIPES` em `constants.ts`.
Exemplo: SILVER = Sapphire(Chipped) + Topaz(Chipped) + Diamond(Chipped) → Splash & Slow.
Mechanic: pedra central deve ser um dos ingredientes; as outras são consumidas (viram rocha).

---

## BLACK_OPAL — Mecânica Especial
Ao ser craftado, aplica `damageMultiplier += 0.4` em todas as torres no raio. Implementado diretamente em `combineSpecialGem()` no store.

---

## Fluxo de Ataque (ponta a ponta)

**Torres comuns (Golem, Snake, Stonefish, Orb):**
1. `Towers.tsx/useFrame` — verifica `now >= lastShot + cooldown`
2. Encontra alvo mais próximo no range
3. Chama `updateTowerCooldown()` + `setTimeout(impactDelay, () => spawnProjectile(...))`
4. `Projectiles.tsx/useFrame` — move projétil via velocidade homing
5. Ao atingir (dist < 0.5): chama `damageEnemy()` no store
6. `damageEnemy` calcula `typeMultiplier × armorMultiplier × damageMultiplier`, aplica status effects, gera `lastEffect` HIT, marca `isDead` se HP ≤ 0
7. `Enemies.tsx` anima morte (shrink + spin 0.5s), então `removeEnemy()`

**Diamond (pool própria):**
1. `Towers.tsx/useFrame` — verifica cooldown, chama `updateTowerCooldown()`, **não chama** `spawnProjectile` (skip via guard)
2. `timeSinceShotRef` em `GolemModel.tsx` detecta `cell.lastShot` atualizado → alimenta `DiamondCrown.tsx`
3. `DiamondCrown.tsx/useFrame` — detecta `timeSinceShot < 120ms`, aciona spike round-robin, spawna projétil na pool interna
4. Pool interna (world space): homing physics, ao atingir chama `useGameStore.getState().damageEnemy()` diretamente

---

## Anti-patterns (nunca fazer)
- Local `useState` para entidades de jogo → usar Zustand store
- Meshes individuais em loop → usar `InstancedMesh`
- A* a cada frame → Flow Field pré-computado
- `setInterval` para animação → `useFrame(state, delta)`
- Mutar estado Zustand diretamente → chamar actions
- Criar materiais/geometrias dentro do `useFrame` → `useMemo`
- `new THREE.MeshPhysicalMaterial({...envMap})` direto em torres → usar `buildGemMaterial` do TowerEngine
- Loop de deformação de vértice na CPU em `useFrame` → usar `injectShaderEffects` com GLSL no vertex shader
- Hardcodar `0.4` / `1.5` como altura Y de inimigos → usar `ENEMY_GROUND_Y` / `ENEMY_FLYING_Y` do `ProjectileEngine`
- Hardcodar altura Y de spawn de projétil → sempre `PEDESTAL_HEIGHT + offset_relativo_do_modelo`
- Importar de `towers/TowerEngine.ts`, `towers/types.ts` ou `towers/gemConfig.ts` (caminhos antigos removidos) → usar `towers/shared/TowerEngine.ts`, `towers/shared/types.ts`, `towers/shared/gemConfig.ts`
- Chamar `spawnProjectile` no store para Diamond → Diamond gerencia pool própria em `diamond/DiamondCrown.tsx`
