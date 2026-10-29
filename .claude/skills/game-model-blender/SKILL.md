---
name: game-model-blender
description: Gera modelos 3D esculpidos (orgânicos ou hard-surface) como GLB usando Blender embedado via módulo Python `bpy` (headless, sem GUI, sem Blender instalado, sem GPU, sem serviço externo). Usar quando o pedido for personagem, criatura, golem, torre com corpo orgânico/detalhado, ou qualquer asset que o procedural three.js (skill game-model-gen) faz ficar tosco. A LLM analisa a referência e escreve o script bpy; o Blender embedado esculpe (skin+subsurf/metaball/boolean), aplica materiais com cor/emissão e exporta o .glb texturizado direto em public/glb/.
---

# Geração de Modelos 3D via Blender embedado (bpy)

Fluxo: **LLM analisa referência → escreve script `bpy` → Blender headless esculpe e
exporta GLB → valida com `glb-inspect` → integra no jogo.** Tudo roda no ambiente, sem
Blender instalado e sem serviço externo — `bpy` É o Blender como módulo Python.

Quando usar ESTA skill vs `game-model-gen` (procedural three.js):
- **Orgânico / personagem / criatura / golem / corpo contínuo** → esta skill (Blender).
  O three.js puro não tem skin modifier, subsurf nem sculpt → fica tosco.
- **Cristal, gema, prisma, forma geométrica simples** → `game-model-gen` já basta.

## Setup (uma vez por ambiente)

`bpy` precisa casar com a versão do Python. Blender 5.x → Python 3.13; Blender 4.x → 3.11.

```bash
py -3.13 -m ensurepip --upgrade          # se o 3.13 não tiver pip
py -3.13 -m pip install bpy --timeout 120 --retries 5   # ~340 MB, uma vez
py -3.13 -c "import bpy; print(bpy.app.version_string)"  # valida
```

Neste ambiente já está instalado: **bpy 5.2.0 (Blender 5.2 LTS) no Python 3.13**.
Sempre invocar os scripts com `py -3.13 <script>.py` (não `node`, não `blender`).

## Workflow

1. **Analisar a referência** (imagem via Read, ou descrição). Decompor em: silhueta,
   partes (corpo/membros/adornos), proporções, paleta (cores hex exatas), materiais
   (pedra fosca? cristal translúcido? metal? emissivo?).
2. **Escrever o script** a partir de `scripts/build_model.py`, editando `build()`.
   Escolher a técnica pela forma (tabela abaixo). Reusar os helpers do template.
3. **Rodar headless**: `py -3.13 scripts/build_model.py public/glb/<nome>.glb`
   (o script faz `import bpy` — não precisa do executável do Blender).
4. **Validar** com a skill `glb-inspect` (tris, nomes de nós, materiais, texturas).
5. **Renderizar** para conferir: o template tem `render_preview(png)` que usa o
   Eevee/Cycles do próprio Blender headless e salva um PNG — olhar com Read. (Ou o
   harness R3F da skill `run`.)
6. **Integrar**: `useGLTF('/glb/<nome>.glb')`. Materiais do GLB já trazem cor/emissão,
   então pode usar direto OU sobrescrever com `buildGemMaterial` para o look do projeto.

## Técnicas de escultura em bpy (tabela de decisão)

| Forma desejada | Técnica bpy |
|---|---|
| **Corpo orgânico contínuo** (golem, criatura) | **Skin modifier** sobre um "esqueleto" de arestas + **Subdivision Surface**. Cada vértice vira um volume; arestas conectam → massa única lisa. Técnica-chave. |
| Blobs que se fundem (lava, slime) | **Metaball** objects → `convert(target='MESH')` |
| Rocha / superfície irregular | Mesh base + **Displace** modifier com textura Voronoi/Noise |
| Hard-surface (escudo, arma) | Primitivas + **Bevel** + **Boolean** modifiers |
| Cristal facetado | `primitive_ico_sphere`/cone, `shade_flat`, sem subsurf |
| Suavizar | `shade_smooth()` + **Subdivision Surface** (1–2 níveis) |
| Reduzir polígonos p/ game | **Decimate** (ratio) — mirar orçamento ≲ 8k tris/torre |

**Regra de ouro (orgânicos)**: esqueleto de arestas → Skin modifier (raio por vértice
via `skin_vertices[0].data[i].radius`) → Subdivision Surface → `shade_smooth`. Dá o corpo
contínuo e liso que metaballs no three.js não conseguem. Marcar um vértice-raiz com
`skin_vertices[...].data[i].use_root = True`.

## Materiais e cores (exportam no GLB!)

Ao contrário do export via three.js/Node, o Blender **embute materiais PBR com cor** no
GLB. Usar `Principled BSDF` (ver helper `make_material()` no template). Cores no Blender
são **linear**; converter de hex sRGB com `srgb_to_linear()`. Emissivo via
`Emission Color` + `Emission Strength`. Nomear objetos e materiais (o código R3F acha nós
por nome/prefixo: `RockBody`, `RubyCore`, `GlowEye_L`…).

## Export GLB game-ready

O template já chama `export_scene.gltf` com `export_apply=True` (aplica skin/subsurf/
decimate — ESSENCIAL, senão sai a malha base tosca) e `export_yup=True` (convenção R3F).

## Verificação visual OBRIGATÓRIA contra referência (compare.py)

**Nunca julgue "está bom" por um render de um ângulo só** — engana. Quando há imagem de
referência, use o mecanismo de comparação a CADA iteração:

```bash
py -3.13 .claude/skills/game-model-blender/scripts/compare.py \
    public/glb/<nome>.glb <referencia.jpg> <saida_compare.png>
```

Gera um contact sheet: **[referência | frente | 3/4 | lado]**. Abra com Read e compare
lado a lado. Itere no `build()` até aproximar. Guarde a referência em
`.claude/skills/game-model-blender/reference/`.

Notas do compare.py:
- A FRENTE do modelo aponta +Y no Blender (az=0 → câmera em +Y olhando a face).
- Usa rotação direta da câmera (`to_track_quat`), NÃO constraint TRACK_TO — constraint
  não é avaliado antes de `render()` em modo headless e sai tela cinza.
- Precisa de PIL (`pip install pillow`; já vem com o ambiente do bpy aqui).

## Hero render (imagem de showcase / referência-alvo)

Para gerar uma imagem "concept art" do asset (iluminação dramática: fundo escuro, rim
light colorido, glow, bloom):

```bash
py -3.13 .claude/skills/game-model-blender/scripts/hero_render.py public/glb/<nome>.glb <saida.png>
```

Útil como showcase do resultado E como referência-alvo estilizada quando não há arte
externa. Câmera 3/4 herói, key+rim+fill lights.

## Cristais / gemas / monolitos (helpers crystal / engraved_pillar)

- `crystal(name, r_base, r_top, body_h, tip_h, location, mat, sides=6, rot, taper_top)`
  → prisma facetado com ponta piramidal (cristal lapidado). Base de vários = cluster.
- `engraved_pillar(...)` → cubo com bevel (monolito/runestone). Runas = octaedros glow
  chatos (`ico(subdiv=1, flat=True, scale=(1,0.3,1.5))`) na face.
- Gema translúcida: `make_material(..., transmission=0.55, emission_strength=0.5)`.
- Lascas flutuantes: nós `FloatShard_*` animados no runtime (orbita/bob).

## Pedra facetada / low-poly angular (golem, rocha)

Para superfície de PEDRA (não "boneco liso"), use `skinned_skeleton(..., faceted=True)`:
Displace com textura Voronoi (placas) + Decimate DISSOLVE (funde faces coplanares em
facetas grandes) + `shade_flat`. Ajuste `strength` do displace e `angle_limit` do
decimate para mais/menos quebra. Gemas incrustadas: octaedros `ico(subdiv=1, flat=True)`
espalhados (ombros, joelhos, peito, flancos).

## Armadilha: nomes de nó vs mesh-data

O glTF exporter nomeia cada mesh pelo **mesh-data** do Blender, não pelo objeto. Se você
só setar `obj.name = 'RockBody'`, o mesh no GLB sai como `Torus`/`Icosphere` e o matching
de material por nome no R3F falha (tudo cai no material default). O template resolve com
`sync_mesh_names()` (copia `obj.name → obj.data.name`) antes do export. Sempre chamar.

## Convenções do projeto GemTD

- GLB em `public/glb/`; torre ~1 célula (`CELL_SIZE = 1.0`); origem na base (Y=0), a torre
  fica em `Y = PEDESTAL_HEIGHT`. O template normaliza a altura e assenta o pé em Y=0.
- Nomear meshes por função para o código R3F aplicar material/animação por prefixo.
- Sempre validar com `glb-inspect` e renderizar antes de integrar.
