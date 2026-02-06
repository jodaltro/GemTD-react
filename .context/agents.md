# GemTD 3D Mobile - Context para AI Agents

## 📋 Informações do Projeto

**Nome**: GemTD 3D Mobile (React Ecosystem)  
**Tipo**: Tower Defense 3D com mecânica de crafting  
**Framework**: React 18 + Three.js (React Three Fiber)  
**Repositório**: jodaltro/GemTD-react  
**Branch Principal**: main

---

## 🎯 Conceito do Jogo

GemTD é uma reimplementação moderna do clássico Tower Defense "Gem TD" (Warcraft 3/Dota 2). A mecânica central envolve:

1. **Construção de Labirinto**: Jogador recebe 5 gemas aleatórias para colocar no tabuleiro 32x32
2. **Seleção Estratégica**: Das 5 gemas colocadas, escolhe 1 para manter como torre (as outras 4 viram pedras/obstáculos)
3. **Combinação de Gemas**: Pode combinar gemas iguais (3 iguais = próximo nível) ou usar receitas especiais
4. **Defesa**: Torres atacam inimigos que seguem o labirinto criado pelo jogador

---

## 🏗️ Stack Tecnológica

### Core
- **React**: 18.3.1
- **TypeScript**: 5.8.2
- **Vite**: 6.2.0 (Build tool)

### 3D & Renderização
- **Three.js**: 0.169.0
- **@react-three/fiber**: 8.17.8 (Reconciler React para Three.js)
- **@react-three/drei**: 9.114.0 (Helpers/Abstrações)
- **@react-three/postprocessing**: 2.16.2 (Bloom, Vignette)
- **postprocessing**: 6.37.0
- **three-stdlib**: 2.36.1
- **three-mesh-bvh**: 0.7.3 (Otimização de raycast)

### Estado & UI
- **Zustand**: 4.5.2 (State management)
- **Tailwind CSS**: Via CDN (Estilização)
- **lucide-react**: 0.454.0 (Ícones)

### Utilitários
- **uuid**: 9.0.1 (IDs únicos para entidades)

---

## 📁 Estrutura de Arquivos

```
/home/jodaltro/jod_projetos/GemTD-react/
├── App.tsx                 # Entry point, layout principal
├── index.tsx               # ReactDOM root render
├── index.html              # HTML base com script module
├── constants.ts            # ⚠️ CÉREBRO DO BALANCEAMENTO
├── types.ts                # TypeScript interfaces
├── vite.config.ts          # Configuração Vite
├── tsconfig.json           # TypeScript config
├── package.json            # Dependências
├── README.md               # Documentação técnica detalhada
│
├── store/
│   └── useGameStore.ts     # ⚠️ ESTADO GLOBAL (Zustand)
│
├── utils/
│   ├── pathfinding.ts      # A* e Flow Field BFS
│   └── gemGeometry.ts      # Geometrias procedurais (legado)
│
├── components/
│   ├── Scene/              # Componentes 3D (R3F)
│   │   ├── GameScene.tsx   # Canvas, Camera, Lights, Post-processing
│   │   ├── Structures.tsx  # ⚠️ Torres (GLB animados + procedural)
│   │   ├── Towers.tsx      # Lógica de combate/targeting
│   │   ├── Enemies.tsx     # Movimento, InstancedMesh, Shaders
│   │   ├── Projectiles.tsx # Física, colisão, dano
│   │   ├── Particles.tsx   # VFX (impactos, spawn, morte)
│   │   ├── Ground.tsx      # Tabuleiro InstancedMesh
│   │   ├── SelectionCursor.tsx # Feedback visual de seleção
│   │   └── Effects.tsx     # Bloom, Vignette (postprocessing)
│   │
│   └── UI/                 # Interface HTML overlay
│       └── Interface.tsx   # HUD, Stats, Receitas, Botões
│
└── glb/                    # Modelos 3D
    └── golem_-_attack.glb  # Modelo base das torres
```

---

## 🧠 Arquitetura de Estado (Zustand)

### `store/useGameStore.ts` - Coração do Jogo

#### Estado Principal
```typescript
{
  grid: GridCell[]           // 32x32 = 1024 células
  phase: GamePhase           // BUILDING | SELECTING | READY | DEFENDING
  placedGems: string[]       // IDs das 5 gemas colocadas
  flowField: FlowField       // Mapa vetorial de navegação
  
  // Entidades
  enemies: Enemy[]           // Lista de inimigos ativos
  projectiles: Projectile[]  // Lista de projéteis ativos
  
  // Economia & Progressão
  wave: number               // Onda atual
  playerLives: number        // 20 inicial
  gold: number               // 10000 inicial
  researchLevel: number      // 1-7 (afeta qualidade das gemas)
  
  // UI & Interação
  selectedCellId: string | null
  lastEffect: VisualEffect | null
  activePray: ActivePray | null  // Buff temporário (COLOR | QUALITY)
  stonesRemovedCount: number     // Terraforming count
}
```

#### Ações Principais
- **Grid**: `initializeGrid()`, `placeGem()`, `selectCell()`
- **Combate**: `damageEnemy()`, `spawnProjectile()`, `handleEnemyDeath()`
- **Economia**: `upgradeResearch()`, `togglePray()`, `removeStone()`
- **Gemas**: `confirmKeepGem()`, `combineGems()`, `combineSpecialGem()`, `downgradeGem()`
- **Ondas**: `startWave()`, `spawnEnemy()`, `endWave()`

---

## 🎮 Fases do Jogo (GamePhase)

### 1. BUILDING
- Jogador coloca 5 gemas no tabuleiro
- Sistema valida se não bloqueia caminho (A* validation)
- UI mostra contador "X/5"

### 2. SELECTING
- Jogador escolhe 1 das 5 gemas para manter
- As outras 4 viram pedras (CellType.ROCK)
- Recalcula Flow Field após confirmação

### 3. READY
- Interface mostra botão "Start Wave"
- Jogador pode combinar gemas, fazer upgrade, remover pedras
- Economia ativa (comprar/vender)

### 4. DEFENDING
- Inimigos spawnam e seguem o Flow Field
- Torres atacam automaticamente
- Ao terminar onda: +Gold, retorna para READY

---

## ⚔️ Sistema de Combate

### Game Loop Distribuído
NÃO há loop centralizado. Cada sistema atualiza via `useFrame` do R3F:

#### `Towers.tsx` (Targeting & Disparo)
```typescript
useFrame((state) => {
  const now = state.clock.elapsedTime;
  towers.forEach(tower => {
    if (now > tower.lastShot + cooldown) {
      const target = findNearestEnemy(tower);
      if (target) {
        spawnProjectile(tower, target);
        tower.lastShot = now;
      }
    }
  });
});
```

#### `Enemies.tsx` (Movimento via Flow Field)
```typescript
useFrame((state, delta) => {
  enemies.forEach(enemy => {
    const direction = flowField[`${enemy.gridX}-${enemy.gridY}`];
    enemy.x += direction.x * enemy.speed * delta;
    enemy.y += direction.y * enemy.speed * delta;
    
    // Atualiza matriz de instância
    updateInstancedMesh(enemy);
  });
});
```

#### `Projectiles.tsx` (Física & Colisão)
```typescript
useFrame((state, delta) => {
  projectiles.forEach(proj => {
    const target = getEnemy(proj.targetId);
    const direction = normalize(target.pos - proj.pos);
    proj.pos += direction * proj.speed * delta;
    
    if (distance(proj.pos, target.pos) < 0.5) {
      damageEnemy(target, proj.damage);
      removeProjectile(proj.id);
    }
  });
});
```

### Dano & Resistências
```typescript
// constants.ts
DAMAGE_MULTIPLIERS = {
  MATCH: 1.5,      // Torre ataca fraqueza do inimigo
  NEUTRAL: 1.0,
  WRONG: 0.8       // Torre de tipo errado
}

// Armadura
armorMultiplier = armor >= 0 
  ? 1 - ((0.06 * armor) / (1 + 0.06 * armor))
  : 2 - Math.pow(0.94, -armor)

finalDamage = baseDamage * typeMultiplier * armorMultiplier
```

### Status Effects
- **SLOW**: Reduz velocidade (stackável até 80%)
- **POISON**: Dano por segundo, efeito visual "Slime"
- **ARMOR_SHRED**: Reduz armadura permanentemente
- **STUN**: Paralisa inimigo (cooldown de 2s)

---

## 💎 Sistema de Gemas

### Tipos Básicos (8)
```typescript
DIAMOND, EMERALD, RUBY, SAPPHIRE,
AMETHYST, TOPAZ, AQUAMARINE, OPAL
```

### Gemas Especiais (13)
```typescript
SILVER, MALACHITE, JADE, STAR_RUBY, RED_CRYSTAL,
DARK_EMERALD, GOLD, PINK_DIAMOND, URANIUM_238,
BLACK_OPAL, BLOOD_STONE, YELLOW_SAPPHIRE, TOURMALINE
```

### Qualidade (6 + Special)
```typescript
Q1: CHIPPED   → Q2: FLAWED    → Q3: NORMAL
Q4: FLAWLESS  → Q5: PERFECT   → Q6: GREAT
Q7: SPECIAL (Receitas únicas)
```

### Combinação
**Regra Básica**: 3 gemas iguais (tipo + qualidade) = próximo nível
```typescript
3x Diamond Chipped → 1x Diamond Flawed
3x Ruby Normal → 1x Ruby Flawless
```

**Receitas Especiais**: Definidas em `constants.ts > RECIPES`
```typescript
{
  result: { type: MALACHITE, quality: SPECIAL },
  ingredients: [
    { type: OPAL, quality: CHIPPED },
    { type: EMERALD, quality: CHIPPED },
    { type: AQUAMARINE, quality: CHIPPED }
  ]
}
```

### Stats por Gema (`constants.ts > GEM_STATS`)
```typescript
{
  [GemType.DIAMOND]: {
    [GemQuality.CHIPPED]: {
      damage: 5, range: 150, cooldown: 1.2,
      effects: { SLOW: { value: 0.15, duration: 2 } }
    },
    // ... outros níveis
  }
}
```

---

## 🚶 Pathfinding

### A* (A-Star) - Validação de Bloqueio
**Uso**: APENAS durante fase BUILDING para verificar se colocar torre bloquearia caminho
```typescript
// utils/pathfinding.ts
isPathPossible(grid, START_POS, END_POS): boolean
```

### Flow Field (BFS) - Navegação Inimigos
**Uso**: Gerado 1x após cada colocação de pedra/torre
```typescript
flowField = {
  "0-16": { x: 0.8, y: 0.0 },   // Célula (0,16) deve mover para direita
  "1-16": { x: 0.9, y: 0.1 },
  // ... 1024 células
}
```

**Vantagem**: Centenas de inimigos consultam O(1) direção da célula atual

---

## 🎨 Renderização 3D

### InstancedMesh - Otimização de Draw Calls
**Usado em**:
- `Ground.tsx`: 1024 células do chão (1 draw call)
- `Enemies.tsx`: Todos inimigos (1 draw call)
- `Projectiles.tsx`: Todos projéteis (agrupados por tipo)
- `Particles.tsx`: Efeitos visuais

### Modelos GLB Animados (`Structures.tsx`)

#### Golem (Torre Padrão)
```typescript
// glb/golem_-_attack.glb
- Skeleton animado
- Modificação procedural de ossos (bones)
- Animação de ataque via GLTFActions
```

#### Cobra (Torres de Veneno)
```typescript
// Emerald, Malachite, Jade, Dark Emerald
- Esconde membros via bone.scale.setScalar(0.001)
- Spine: 2.5x largura (tronco grosso)
- Neck: 5.0x largura (capuz)
- Head: Compensação de escala
- Animação procedural de "Bote" (Lunge)
```

#### Orbes (Torres Mágicas)
```typescript
// Amethyst, Opal, Black Opal, Uranium, Tourmaline
- Esconde membros e pernas
- Mantém só tronco flutuando
- Scale Head: 0.6x, 1.6x, 0.6x (alongado)
```

### Shaders Customizados

#### Inimigos (`Enemies.tsx`)
```glsl
// Vertex Shader: Veias emissivas procedurais
float veinPattern = sin(vPosition.x * 10.0) * sin(vPosition.y * 10.0);
vColor = mix(baseColor, emissiveColor, veinPattern * 0.3);
```

#### Projéteis (`Projectiles.tsx`)
- **Crystal**: Pulsação emissiva
- **Spike**: Trail de fragmentos
- **Meteor**: Chamas oscilantes
- **Orb**: Glow suave
- **Liquid**: Deformação orgânica + gotas

---

## 📊 Balanceamento (`constants.ts`)

### Economia
```typescript
STARTING_GOLD = 10000
GOLD_PER_KILL = 2
GOLD_PER_WAVE = 10
BASE_STONE_COST = 50           // Aumenta +25 por pedra removida
PRAY_COST_COLOR = 5            // 40% chance gema específica
PRAY_COST_QUALITY = 15         // +2 níveis de qualidade
```

### Inimigos & Ondas
```typescript
HP_BASE = 20
HP_GROWTH_FACTOR = 1.30        // HP_wave = HP_BASE * (1.30 ^ wave)

WAVE_CONFIG = {
  1: { weakness: TOPAZ, abilities: [] },
  3: { weakness: DIAMOND, abilities: ['Fast'] },
  4: { weakness: AMETHYST, abilities: ['Flying'] },
  8: { weakness: AMETHYST, abilities: ['Invisible', 'Flying'] },
  10: { weakness: SAPPHIRE, abilities: ['Boss', 'High Armor'] }
}
```

### Pesquisa (Research)
```typescript
RESEARCH_COSTS = {
  1: 100,  // Lvl 1→2
  2: 140,  // Lvl 2→3
  3: 200,
  4: 280,
  5: 380,
  6: 500,
  7: 0     // Max
}

SPAWN_PROBABILITIES[7] = {
  CHIPPED: 10%, FLAWED: 20%, NORMAL: 30%,
  FLAWLESS: 30%, PERFECT: 10%, GREAT: 0%
}
```

---

## 🐛 Debugging & Development

### Rodar Localmente
```bash
cd /home/jodaltro/jod_projetos/GemTD-react
npm install
npm run dev  # Vite dev server
```

### Estrutura de Debug
- **Console**: Zustand actions loggadas via middleware (se ativo)
- **Three.js Inspector**: F12 → Three.js devtools
- **Stats Panel**: FPS/Memory via `@react-three/drei/Stats` (se habilitado)

### Comandos Git (via mcp_gitkraken)
```bash
git status          # Ver mudanças
git branch          # Listar branches
git log --oneline   # Histórico
git diff            # Ver alterações
```

---

## ⚠️ Arquivos Críticos (Não Modificar Sem Contexto)

### 1. `constants.ts`
**Por quê**: Contém TODO o balanceamento do jogo
- Stats de gemas (dano, alcance, cooldown)
- Configuração de ondas (HP, habilidades)
- Receitas especiais
- Probabilidades de spawn
- Multiplicadores de dano/armadura

### 2. `store/useGameStore.ts` (650 linhas)
**Por quê**: Único ponto de verdade do estado
- Lógica de combate (damageEnemy, applyEffects)
- Sistema de ondas (spawnEnemy, endWave)
- Validação de combinação de gemas
- Flow Field regeneration

### 3. `components/Scene/Structures.tsx` (456 linhas)
**Por quê**: Animações complexas de modelos 3D
- Modificação procedural de bones
- Sincronização com sistema de combate
- Clonagem eficiente de GLTFs via SkeletonUtils

---

## 🔧 Patterns & Best Practices

### 1. Performance
```typescript
// ✅ BOM: InstancedMesh
<instancedMesh args={[geometry, material, 1000]}>
  {/* Atualizar matriz via ref */}
</instancedMesh>

// ❌ RUIM: 1000 meshes individuais
{enemies.map(e => <mesh key={e.id} />)}
```

### 2. Estado
```typescript
// ✅ BOM: Zustand action
const damageEnemy = useGameStore(s => s.damageEnemy);
damageEnemy(enemyId, 50);

// ❌ RUIM: Mutar estado diretamente
enemy.hp -= 50;
```

### 3. Animações 3D
```typescript
// ✅ BOM: useFrame com delta
useFrame((state, delta) => {
  ref.current.position.x += speed * delta;
});

// ❌ RUIM: setInterval
setInterval(() => obj.position.x += speed, 16);
```

### 4. Pathfinding
```typescript
// ✅ BOM: Flow Field (gera 1x, consulta O(1))
const direction = flowField[`${enemy.x}-${enemy.y}`];

// ❌ RUIM: A* por inimigo (O(n log n) cada frame)
enemies.forEach(e => aStar(grid, e.pos, END_POS));
```

---

## 🚀 Próximos Passos & Roadmap

### Features Planejadas
- [ ] Sistema de salvamento (localStorage)
- [ ] Leaderboard global
- [ ] Modo Hardcore (1 vida)
- [ ] Gemas Únicas (Legendary tier)
- [ ] Multiplayer Co-op
- [ ] Editor de mapas customizados
- [ ] Sons & Música

### Otimizações Pendentes
- [ ] Object pooling para projéteis
- [ ] Frustum culling para inimigos off-screen
- [ ] Level of Detail (LOD) para torres distantes
- [ ] Web Workers para pathfinding

---

## 📚 Referências Técnicas

### Documentação Oficial
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber)
- [Three.js](https://threejs.org/docs/)
- [Zustand](https://github.com/pmndrs/zustand)
- [Vite](https://vitejs.dev/)

### Conceitos Importantes
- **Flow Field Pathfinding**: [Red Blob Games](https://www.redblobgames.com/pathfinding/grids/algorithms.html)
- **InstancedMesh**: [Three.js Docs](https://threejs.org/docs/#api/en/objects/InstancedMesh)
- **Skeletal Animation**: [Three.js Animation System](https://threejs.org/docs/#manual/en/introduction/Animation-system)

---

## 🤖 Instruções para AI Agents

### Antes de Modificar Código
1. ✅ Ler `constants.ts` para entender balanceamento
2. ✅ Verificar `types.ts` para interfaces TypeScript
3. ✅ Consultar `useGameStore.ts` para actions disponíveis
4. ✅ Testar mudanças com `npm run dev`

### Ao Criar Features
1. **Estado**: Adicionar em `useGameStore.ts` primeiro
2. **UI**: Depois implementar em `Interface.tsx`
3. **3D**: Por último, adicionar em componentes Scene/

### Ao Corrigir Bugs
1. **Console**: Verificar erros no navegador F12
2. **Zustand DevTools**: Inspecionar estado (se habilitado)
3. **Three.js Scene**: Verificar hierarquia de objetos

### Comunicação com Usuário
- 🇧🇷 Usuário prefere PORTUGUÊS
- ⚡ Ser conciso mas completo
- 🔗 Usar links para arquivos: [arquivo](caminho)
- ⚠️ Alertar sobre breaking changes

---

## 📝 Notas Adicionais

### Convenções de Código
- **Nomes**: camelCase para variáveis, PascalCase para componentes
- **Imports**: Absolutos via tsconfig paths
- **Tipos**: Sempre usar TypeScript interfaces (types.ts)

### Git Workflow
- **Branch**: main (desenvolvimento direto)
- **Commits**: Mensagens descritivas em inglês
- **Push**: Apenas após testes locais

### Performance Targets
- **FPS**: 60fps mínimo em mobile
- **Draw Calls**: < 50 por frame
- **Bundle Size**: < 2MB inicial

---

**Última Atualização**: 16/01/2026  
**Mantenedor**: jodaltro  
**Versão**: 0.0.0
