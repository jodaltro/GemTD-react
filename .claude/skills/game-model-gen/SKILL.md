---
name: game-model-gen
description: Gera modelos 3D procedurais e exporta como GLB usando three.js + GLTFExporter em Node. Usar quando o usuário pedir um novo modelo 3D, mesh, prop, gema, arma, cenário ou asset .glb/.gltf para o jogo — tanto assets standalone quanto geometria procedural para componentes R3F.
---

# Geração de Modelos 3D (GLB)

Duas rotas — escolher pela necessidade:

**Rota A — Geometria procedural em componente R3F** (preferida no GemTD): escrever a
geometria direto no componente React (como `Stonefish.tsx` faz com LatheGeometry).
Sem arquivo GLB, animável por código, materiais via `buildGemMaterial`. Usar quando o
modelo é de uma torre/efeito e precisa de animação procedural.

**Rota B — Exportar GLB standalone**: quando o asset precisa ser um arquivo (reuso,
skeleton, edição externa, drop-in em `public/glb/`). Usar o template desta skill.

## Workflow da Rota B

1. Copiar `scripts/export-glb.mjs` desta skill para o scratchpad e editar `buildModel()`.
2. Rodar: `node <script>.mjs public/glb/<nome>.glb` (a partir da raiz do projeto — o
   Node resolve `three` pelo `node_modules` do projeto).
3. **Validar com a skill `glb-inspect`** (contagem de tris, nomes de nós, materiais).
4. Integrar: `useGLTF('/glb/<nome>.glb')` + `SkeletonUtils.clone(scene)` se tiver skeleton.

### Restrições do export em Node (sem DOM)
- **Sem texturas embutidas** (GLTFExporter exige canvas) — aplicar materiais/texturas em
  runtime via `buildGemMaterial` do TowerEngine, que é a convenção do projeto de qualquer forma.
- Vertex colors funcionam: `geo.setAttribute('color', ...)` + `vertexColors: true`.
- Nomear todos os meshes/grupos (`mesh.name = '...'`) — o código R3F busca nós por nome.

## Técnicas de modelagem procedural (three.js)

| Forma | Técnica |
|---|---|
| Gemas lapidadas | `OctahedronGeometry`/`IcosahedronGeometry` detail 0 + `flatShading`, ou `CylinderGeometry` com `radialSegments` baixo + scale no Y |
| Corpos orgânicos (peixe, gota) | `LatheGeometry` com perfil de pontos 2D (ver `Stonefish.tsx`) |
| Tentáculos, chifres, correntes | `TubeGeometry` sobre `CatmullRomCurve3` |
| Rochas | `IcosahedronGeometry` detail 1 + deslocar vértices com ruído (`position.needsUpdate`) + `computeVertexNormals` |
| Cristais compostos | Vários prismas (`CylinderGeometry` 6 lados, topo raio 0) com rotações/escalas variadas num `Group` |
| Low-poly stylized | Sempre `flatShading: true` e `detail` 0–1; merge com `BufferGeometryUtils.mergeGeometries` para 1 draw call |
| CSG/booleans | Evitar — compor por interseção visual de meshes é mais barato e robusto |

## A partir de imagem de referência

Quando o usuário enviar uma imagem do modelo desejado:
1. **Olhar a imagem com Read** e decompor em primitivas: silhueta (perfil de Lathe?),
   partes (corpo/apêndices/detalhes), proporções relativas e paleta de cores
   (usar `palette()` do `imglib.py` em `game-texture-gen/scripts/` para as cores exatas).
2. Modelar por aproximação procedural com as técnicas da tabela acima — é uma
   **reinterpretação estilizada**, não fotogrametria/reconstrução exata. Deixar isso
   claro ao usuário quando a referência for complexa (personagens orgânicos detalhados).
3. Exportar, inspecionar com `glb-inspect`, e comparar visualmente com a referência
   (renderizar screenshot no jogo via skill `run`, ou avaliar proporções pelos números).
4. Iterar: ajustar perfil/proporções e re-exportar até aproximar da referência.

## Convenções do projeto GemTD

- GLB vai em `public/glb/` (existentes: `golem_-_attack.glb`, `diamond.glb`, `snake.glb`)
- Escala: torres ocupam ~1 célula (`CELL_SIZE = 1.0`); modelar com bounding ~0.8–1.0 de diâmetro, origem na base (Y=0) — a torre é posicionada em `Y = PEDESTAL_HEIGHT`
- Novo archetype visual de torre: seguir o passo a passo "Adicionando novo archetype" do CLAUDE.md (pasta `towers/<archetype>/`, registro em `shared/gemConfig.ts`, branch em `GolemModel.tsx`)
- Clonar GLTF com skeleton **sempre** via `SkeletonUtils.clone` (three-stdlib)
- Materiais do arquivo GLB são placeholder — o visual final vem de `buildGemMaterial`/`buildGlowMaterial`
