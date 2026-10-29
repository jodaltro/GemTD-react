# GemTD 3D Mobile — Plano de Melhorias

**Projeto**: GemTD-react (React 18 + Three.js/R3F + Zustand)
**Data**: análise do estado atual do código + referências da internet
**Status do build**: ✅ `npm run build` passa (vite 6.4.1, 2258 módulos, 8.6s)

---

## 1. Estado atual (diagnóstico)

A base técnica é sólida: estado centralizado em Zustand, renderização instanciada
(InstancedMesh), Flow Field para pathfinding, engine de torres modular com
arquétipos visuais (Golem, Ruby, GemCluster, Snake, Orb) e shaders de projéteis.
O jogo roda e compila. Porém há distância significativa entre a **intenção** das
mecânicas (descritas em `CLAUDE.md`, `README.md` e nos `special` das gemas) e o
que está **realmente implementado**.

### Achados de código (bugs / lacunas reais)

| # | Achado | Evidência |
|---|---|---|
| 1 | **Dano por tick de POISON não existe** — efeito só tinge o inimigo de "slime" | `GEM_SPECIAL_EFFECTS` aplica `POISON` em `damageEnemy`; `Enemies.tsx` só decrementa durée e liga o visual. Nenhum tick de dano em lugar algum |
| 2 | **Crit (Diamond/Pink Diamond) não implementado** — `specialValue: 2/5` nunca é lido | `damageEnemy` não rola crit; `GEM_STATS` só documenta |
| 3 | **Multishot não implementado** — Topaz "3/4/5/7 Targets", Ruby Great "Multi-Shot (3)", Malachite "Multi-Poison" | `Towers.tsx` sempre escolhe **1** alvo |
| 4 | **Speciais sem efeito real**: Opal "Aura +AS%", Star Ruby "Scales w/ Kills" (`killCount` existe no tipo mas nunca é incrementado), Blood Stone "Bombardment", Uranium "Radiation Aura" (só aplica slow no hit), Pink Diamond "Boss Crit" | `GEM_SPECIAL_EFFECTS` + `Towers.tsx` |
| 5 | **Habilidades de onda não implementadas**: `Evasion`, `Regen`, `Endgame`, `Magic Immune` (só bloqueia status, não dano mágico — não há categoria de dano) | `WAVE_CONFIG` vs `spawnEnemy` |
| 6 | **Número de inimigos fixo** (`totalToSpawn: 10`) — não escala com a onda; dificuldade vem só de HP/velocidade | `Enemies.tsx` |
| 7 | **Sem tela de derrota / vitória** — `damagePlayer` clamp a 0 e nada acontece | `useGameStore.ts:582` |
| 8 | **Economia desbalanceada** — `STARTING_GOLD = 10000` permite comprar todas as pesquisas (≤ 500g) e infinitas pedras na onda 1 | `constants.ts` |
| 9 | **`setTimeout` para spawn de projétil** — vaza após fim de onda/fase, pode disparar para alvo morto e não é limpo na desmontagem | `Towers.tsx:95` |
| 10 | **Complexidade O(P×E) por frame** — `enemies.find` dentro do loop de projéteis e de torres; sem object pooling (push/filter crio arrays novos) | `Projectiles.tsx`, `Towers.tsx` |
| 11 | **Hover re-renderiza tudo** — `hoverCell` faz `grid.map` criando 144 objetos a cada pointermove; `Ground.tsx` e `Interface.tsx` subscrevem o grid inteiro | `useGameStore.ts:382` |
| 12 | **Tailwind via CDN** — dependência de rede em runtime e bundle extra; sem purga/compile | `index.html:7` |
| 13 | **Bundle único de ~1.4 MB (407 kB gzip)** — aviso do próprio Vite (chunk > 500 kB); sem code-splitting de three/drei/postprocessing | build output |
| 14 | **Sem som, música, pause ou controle de velocidade** — essencial para TD mobile | — |
| 15 | **Docs defasados** — `README.md`/agents.md falam em grid 32×32; o jogo usa 12×12; UI mista EN/PT ("START WAVE", "RECIPES" vs "INÍCIO"/"FIM") | `constants.ts:5`, `Interface.tsx` |
| 16 | **`dist/` versionado** no git e skills/`artifacts/` soltos na raiz | git status |
| 17 | **JSX.IntrinsicElements com `any`** no `types.ts` — anula tipagem do reconciliation do R3F | `types.ts:145-242` |

---

## 2. Inspirações da internet (referências)

- **Mazing** é a mecânica mais profunda do gênero: a métrica que importa é
  **"time-on-target"** — quanto mais tempo o creep passa no alcance das torres,
  mais dano acumulado, sem gastar ouro extra. Guia completo em
  [Maul Tactics — Mazing guide](https://maultactics.gg/articles/mazing-guide).
- Os blocos **"Slates"** do Gem TD+ (Air/Hold/Ancient/Slow/Wraith/Spell/Poison/
  Elder/Range/Damage/Viper) — torres/terreno craftados com gemas que dão aura e
  efeitos ao labirinto — são o diferencial de profundidade do jogo original.
  Árvore completa de gemas em [Gem TD Helper (gemtd.top)](https://gemtd.top/).
- **Gem Tower Defense clássico (Dota 2)** tem temporadas, placar de recordes e
  versões por season — viável como modelo de meta/leaderboard
  ([gemtowerdefense.com](https://gemtowerdefense.com/)).
- **Rogue Tower / roguelikes TD** (upgrades aleatórios e sinergias) mostram o
  apelo de "uma run diferente a cada vez"
  ([SteamPeek](https://steampeek.hu/?appid=1843760)).
- **Performance R3F**: reuso de geometria/material, instancing, LOD e
  `frameloop="demand" ` + `invalidate()`
  ([React Three Fiber — Scaling performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance),
  [Pitfalls](https://r3f.docs.pmnd.rs/advanced/pitfalls)).
- Guia de design de Tower Defense (economia, curva de dificuldade, ondas):
  [designthegame.com](https://www.designthegame.com/learning/tutorial/tower-defense-design-guide).

**Síntese para o GemTD 3D**: os pilares que separam um TD "ok" de um "viciante"
são (a) labirinto com escolhas reais de layout, (b) árvore de gemas com
sinergias/slates, (c) variedade honesta de inimigos/habilidades, (d) economia
com trade-offs, e (e) feedback (som + números de dano + ondas claras).

---

## 3. Plano de melhorias

Organizado por pilares, com **prioridade** (P0 = base para tudo / P1 = alto
impacto / P2 = polish e extensões). Cada item indica os arquivos afetados.

### P0 — Correções que destravam a profundidade

1. **Implementar os efeitos prometidos nas gemas** (fechar o gap "especial escrito ≠ implementado"):
   - Dano de poison por tick (processar em `Enemies.tsx/useFrame` ou novo tick em `damageEnemy`). Arquivos: `store/useGameStore.ts`, `components/Scene/Enemies.tsx`
   - Crit para Diamond e Pink Diamond (rolar `specialValue` no cálculo de dano). Arquivo: `store/useGameStore.ts`
   - Multishot (Topaz, Ruby Great, Malachite): permitir que `Towers.tsx` selecione N alvos e dispare N projéteis. Arquivo: `components/Scene/Towers.tsx`
   - Aura de ataque speed da Opal (buff nas torres do raio, como o Black Opal). Arquivo: `constants.ts` + `store/useGameStore.ts`
   - Star Ruby (killCount já no tipo — incrementar em `damageEnemy` e somar ao dano). Arquivo: `store/useGameStore.ts`
   - Blood Stone "Bombardment" e Uranium "Radiation Aura" (DoT de área). Arquivo: `store/useGameStore.ts` + `components/Scene/Projectiles.tsx`

2. **Habilidades de onda honestas**: implementar `Evasion` (crit miss), `Regen`
   (HP/s no inimigo), `Endgame` (todo player não pode bloquear 100% do caminho? —
   na prática: imaginário/voo), e `Magic Immune` com categoria de dano
   (físico/mágico) em vez de só bloquear status. Arquivos: `constants.ts`,
   `types.ts`, `store/useGameStore.ts`.

3. **Game over e vitória**: tela de derrota quando `playerLives === 0`; modal de
   vitória para ondas finais; botão "New Game" (`initializeGrid`). Arquivos:
   `components/UI/Interface.tsx`, `store/useGameStore.ts`.

4. **Economia com trade-offs**: recalibrar `STARTING_GOLD` (destravar pesquisa
   progressivamente), custos de pedra, gold/kill e income por onda; adicionar
   "leak" (inimigo que passa custa mais vidas) e gold com escala por onda.
   Arquivo: `constants.ts`.

### P1 — Profundidade de gameplay (o que a internet ensina)

5. **Escala real de ondas**: `totalToSpawn` crescer por onda (fórmula em
   `constants.ts`), composição mista por onda (fast + tank + flying), e
   intervalos de spawn dinâmicos. Arquivos: `constants.ts` (`WAVE_CONFIG` +
   nova `WAVE_DEF`), `components/Scene/Enemies.tsx`.

6. **Antifrustração do mazing**: exibir "path length" / porcentagem de benefício
   do labirinto (tempo em alvo), e garantir que A* não deixe o jogador trancar o
   caminho sem perceber (feedback visual vermelho ao bloquear). Arquivos:
   `utils/pathfinding.ts`, `components/Scene/Ground.tsx`, `SelectionCursor.tsx`.

7. **Slates / blocos de terreno com efeito** (feature marcante do Gem TD+): novas
   células craftadas com gemas (Slow Slate, Damage Slate, Range Slate, Ancestral…)
   que funcionam como torres de aura/labirinto. Arquivo: `constants.ts`
   (`RECIPES` + novo `CellType.SLATE`), `types.ts`, `store/useGameStore.ts`,
   `components/Scene/Structures.tsx`.

8. **Torre "Pick 1 de 5" mais legível**: durante o SELECTING, destacar stats e
   recomendação (fraqueza da próxima onda); permitir re-rolar com custo.
   Arquivo: `components/UI/Interface.tsx`.

### P1 — Performance & técnica (mobile é o alvo)

9. **Matar o O(P×E)**: índice de inimigos por id (Map) no frame; pooling de
   projéteis (arrays fixos de slots reutilizados — referência: tinha no
   `DiamondCrown` aposentado); substituir `setTimeout` por fila de eventos
   agendados em `useFrame` (agendamento por `lastShot + cooldown + delay`).
   Arquivos: `components/Scene/Towers.tsx`, `Projectiles.tsx`,
   `store/useGameStore.ts`.

10. **Reduzir re-renders**: `hoverCell` sem recriar o grid (set parcial só da
    célula; ou estado local de hover no `Ground`); seletores granulares no
    `Interface` e `Ground` (evitar subscrever o grid inteiro). Arquivos:
    `store/useGameStore.ts`, `components/UI/Interface.tsx`,
    `components/Scene/Ground.tsx`.

11. **Bundle**: `manualChunks` (three/drei/postprocessing separados) + lazy
    import do pós-processamento; migrar Tailwind para build local (`tailwindcss`
    como dep com PostCSS) para remover o CDN. Arquivos: `vite.config.ts`,
    `index.html`, `package.json`.

12. **Controles mobile**: não bloquear zoom/`user-scalable` no touch (usar
    multi-touch para câmera), botão de velocidade (1×/2×/3×), pausa. Arquivos:
    `index.html`, `GameScene.tsx`, `Interface.tsx`.

### P2 — Polimento, meta e distribuição

13. **Persistência**: salvar progresso em `localStorage` (melhor pesquisa, onda
    atingida, estatísticas) — item já listado como roadmap no agents.md.
    Arquivo: `store/useGameStore.ts` (middleware `persist` do Zustand).

14. **Som & música**: WebAudio-procedural (sem assets) para tiros, impactos,
    gold, wave start e música ambiente leve. Arquivo novo: `components/audio/`.
    Publishers: iPhone precisa interação para iniciar áudio.

15. **Números de dano e feedback**: floating damage numbers, glow da torre
    atacando, onboarding/tutorial de primeiro contato (as regras do Gem TD são
    obscuras). Arquivos: `components/Scene/`, `components/UI/Interface.tsx`.

16. **Variedade visual de inimigos**: mais geometrias (orbe, esfera, cristal) por
    habilidade (flying, boss, regen), já instanciadas. Arquivo:
    `components/Scene/Enemies.tsx`.

17. **Meta & liderança**: tela de recorde local + suporte a placar online
    (inspiração no clássico browser com seasons). Arquivo: `Interface.tsx` +
    serviço novo.

18. **Limpeza**: mover Tailwind/CDN deprecado, remover `dist/` do controle de
    versão, padronizar idioma (labels PT-BR), atualizar `README`/agents.md com o
    grid 12×12 e a arquitetura atual de torres (GemCluster config-driven).

---

## 4. Roadmap sugerido (8 fases ~exemplo)

| Fase | Conteúdo | Esforço |
|---|---|---|
| 1 | Bugs P0 (poison, crit, multishot, game over) + economia | 2–3 sessões |
| 2 | Habilidades de onda + escala de spawn | 1–2 sessões |
| 3 | Performance (pooling, hover, bundles) | 1–2 sessões |
| 4 | Slates/terreno com efeito | 2–3 sessões |
| 5 | Som + números de dano + tutorial | 2 sessões |
| 6 | Persistência + velocidade/pausa | 1 sessão |
| 7 | Polimento visual de inimigos e ondas | 1–2 sessões |
| 8 | Leaderboard/meta + distribuição (PWA) | 2 sessões |

>Cada fase fecha com `npm run build` ✅ e teste manual no navegador (achei o
>dev server na porta 3000 pelo `vite.config.ts` — não 5173 como o README diz).

---

## 5. Riscos & recomendações

- **Não mexer no balanceamento às cegas**: mudanças em `constants.ts` alteram
  toda a curva — valide com uma planilha de DPS por gema × HP de onda.
- **POISON com crit**: ao implementar DoT, cuidado com stackding infinito —
  definir máximo de stacks por fonte (o `sourceId` já existe).
- **Multishot**: garantir que o mesmo projétil não acerte o mesmo alvo (skip por
  alvo já selecionado).
- **Mobile-first**: manter < 50 draw calls e testar em device real; considere
  `frameloop="demand"` + `invalidate()` quando não há movimento (fase READY).
