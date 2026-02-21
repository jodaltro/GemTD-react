# GemTD 3D Mobile (React Ecosystem) - Documentação Técnica

## 1. Visão Geral
**GemTD 3D Mobile** é uma reinterpretação do clássico Tower Defense "Gem TD" (Warcraft 3 / Dota 2), construído com tecnologias web modernas focadas em alta performance gráfica e jogabilidade mobile. O jogo utiliza **React Three Fiber (R3F)** para renderização 3D e **Zustand** para gerenciamento de estado global.

A mecânica central envolve construir um labirinto para os inimigos colocando 5 gemas aleatórias no tabuleiro, escolher 1 para manter (as outras viram pedras/obstáculos), e combinar gemas iguais ou receitas especiais para criar torres poderosas.

---

## 2. Como Executar Localmente

### Pré-requisitos
*   **Node.js** v18 ou superior — [nodejs.org](https://nodejs.org)
*   **npm** v9+ (incluído com o Node.js) ou **yarn**

### Passos

```bash
# 1. Clone o repositório
git clone https://github.com/seu-usuario/GemTD-react.git
cd GemTD-react

# 2. Instale as dependências
npm install

# 3. Inicie o servidor de desenvolvimento (hot-reload)
npm run dev
```

O servidor estará disponível em **http://localhost:5173** (porta padrão do Vite).

### Outros comandos úteis

| Comando | Descrição |
|---|---|
| `npm run dev` | Inicia o servidor de desenvolvimento com hot-reload |
| `npm run build` | Gera o bundle de produção em `dist/` |
| `npm run preview` | Serve localmente o bundle de produção gerado |

> **Dica mobile**: Para testar em um dispositivo físico na mesma rede, execute `npm run dev -- --host` e acesse o IP local exibido no terminal.

---

## 3. Stack Tecnológica
<!-- unchanged -->

*   **Core**: React 18
*   **3D Engine**: Three.js + @react-three/fiber
*   **Abstrações 3D**: @react-three/drei (Environment, OrbitControls, useGLTF, Sparkles)
*   **Estado**: Zustand (Gerenciamento centralizado de lógica de jogo)
*   **Estilização UI**: Tailwind CSS
*   **Pós-Processamento**: @react-three/postprocessing (Bloom, Vignette)
*   **Algoritmos**: A* (Validação de caminho) e BFS (Flow Field para pathfinding dos inimigos)

---

## 4. Arquitetura do Sistema

### 4.1. Gerenciamento de Estado (`store/useGameStore.ts`)
O coração do jogo. Controla:
*   **Grid**: Matriz 32x32 células (`grid`).
*   **Fases do Jogo**: `BUILDING` (Colocar 5) -> `SELECTING` (Escolher 1) -> `READY` -> `DEFENDING` (Onda ativa).
*   **Economia**: Ouro, Vidas, Nível de Pesquisa.
*   **Entidades**: Lista de Inimigos e Projéteis.
*   **Lógica de Combate**: Dano, Status Effects (Slow, Poison, Stun), Cooldowns.

### 4.2. Ciclo de Renderização (Game Loop)
O jogo não usa um loop único centralizado tradicional. Em vez disso, distribui a lógica usando o hook `useFrame` do R3F em componentes específicos para otimização:
*   **`Enemies.tsx`**: Controla movimento dos inimigos via Flow Field, atualiza posições e gerencia animações de morte.
*   **`Towers.tsx`**: Detecta alvos, gerencia cooldowns e dispara projéteis.
*   **`Projectiles.tsx`**: Move projéteis, detecta colisão e aplica dano.
*   **`Structures.tsx`**: Anima as torres (Golems/Cobras) proceduralmente (Recoil, Idle Sway, Attack Lunge).

### 4.3. Pathfinding (`utils/pathfinding.ts`)
*   **A* (A-Star)**: Usado *apenas* durante a fase de construção para validar se a colocação de uma torre bloquearia completamente o caminho (impede "maze blocking").
*   **Flow Field (BFS)**: Gera um mapa vetorial de direção para cada célula do grid em direção ao final. Extremamente eficiente para mover centenas de inimigos simultaneamente, pois eles apenas consultam a direção da célula atual.

---

## 5. Mecânicas de Jogo

### 5.1. Sistema de Gemas
*   **Tipos**: 8 Básicos (Diamond, Emerald, Ruby, etc.) + Especiais (Malachite, Silver, Jade, etc.).
*   **Qualidade**: Chipped (Q1) até Great (Q6) e Special (Q7). Definida por probabilidade baseada no nível de pesquisa (`researchLevel`).
*   **Combinação**:
    *   **Mesmo Tipo/Qualidade**: 2 iguais = Próximo nível de qualidade.
    *   **Receitas Especiais**: Combinações específicas (ex: Malachite = Opal Q1 + Emerald Q1 + Aquamarine Q1).

### 5.2. Torres e Modelos 3D (`components/Scene/Structures.tsx`)
As torres não são estáticas. Elas usam modelos GLB animados e lógica procedural:
*   **Golem Genérico**: Usado para a maioria das gemas. Possui animações de ataque esquelético.
*   **Cobra (SnakeModel)**: Usado para gemas de veneno (Emerald, Malachite, Jade). Implementa uma animação procedural de "Bote" (Lunge), onde a cabeça se desconecta visualmente do pescoço para atacar.
*   **Orbs**: Gemas mágicas flutuantes (Amethyst, Opal) modificam a escala dos ossos do Golem para esconder membros e deixar apenas o tronco flutuando.

### 5.3. Inimigos (`components/Scene/Enemies.tsx`)
*   **Renderização**: InstancedMesh (1 draw call para todos os inimigos) para alta performance.
*   **Lógica de Onda**: Configurações definidas em `constants.ts` (HP, Velocidade, Armadura, Habilidades como 'Flying', 'Invisible', 'Boss').
*   **Visual**: Shader customizado para efeito de "veias" emissivas e overlay de "Slime" quando envenenados.

### 5.4. Projéteis (`components/Scene/Projectiles.tsx`)
*   **Arquétipos**: Crystal, Spike, Meteor, Orb, Liquid.
*   **Shaders**: Cada tipo tem um Vertex/Fragment shader único (ex: Meteoro pulsa, Líquido oscila organicamente).
*   **Trilha**: Projéteis líquidos deixam "gotas" para trás usando instancing.

---

## 6. Fluxo de Dados (Exemplo: Ataque)

1.  **Frame Update (`Towers.tsx`)**: Torre verifica se `now > lastShot + cooldown`.
2.  **Targeting**: Busca inimigo mais próximo dentro do alcance (baseado em `GEM_STATS`).
3.  **Disparo**:
    *   Atualiza `lastShot`.
    *   Chama `spawnProjectile` na Store.
    *   `Structures.tsx` detecta o tiro e dispara a animação do modelo 3D (ex: Cobra dá o bote).
4.  **Movimento (`Projectiles.tsx`)**: Projétil move-se via `useFrame` em direção ao ID do alvo.
5.  **Colisão**: Se `dist < 0.5`:
    *   Chama `damageEnemy` na Store.
    *   Aplica Dano (calculando resistências/armadura).
    *   Aplica Efeitos (Slow, Poison, Stun).
    *   Gera Partículas (`Particles.tsx`) no local do impacto.
    *   Remove o projétil.

---

## 7. Performance & Otimizações
*   **InstancedMesh**: Usado para Chão, Pedras, Inimigos, Projéteis e Partículas. Permite milhares de objetos com poucas chamadas de desenho (draw calls).
*   **Zustand**: Atualizações de estado fora do ciclo de renderização React onde possível, minimizando re-renders de componentes UI pesados.
*   **GLTF Preloading**: Modelos pesados são pré-carregados.
*   **SkeletonUtils.clone**: Permite clonar o modelo GLB (skinned mesh) eficientemente para múltiplas torres, mantendo animações independentes.

---

## 8. Estrutura de Arquivos

*   `App.tsx`: Entry point, layout principal.
*   `constants.ts`: "Cérebro" de balanceamento (status das gemas, ondas, probabilidades).
*   `types.ts`: Definições TypeScript globais.
*   `store/`: Lógica de estado (Redux-like mas simplificado).
*   `utils/`:
    *   `pathfinding.ts`: Lógica A* e FlowField.
    *   `gemGeometry.ts`: (Legado/Auxiliar) Definições de geometria procedural.
*   `components/Scene/`: Componentes 3D (R3F).
    *   `GameScene.tsx`: Configuração de Câmera, Luzes e Post-Processing.
    *   `Structures.tsx`: Lógica complexa de modelos 3D das torres.
    *   `Enemies.tsx`, `Projectiles.tsx`, `Particles.tsx`: Renderizadores instanciados.
*   `components/UI/`: Interface HTML overlay (HUD, Receitas, Botões).
