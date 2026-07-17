---
name: game-texture-gen
description: Gera texturas procedurais tileable para jogos 3D (albedo, normal map, roughness, AO, emissive, heightmap) via Python + numpy/PIL. Usar quando o usuário pedir texturas, materiais PBR, skybox, terreno, padrões de superfície (rocha, metal, cristal, lava, água) ou qualquer imagem para aplicar em meshes Three.js/R3F.
---

# Geração de Texturas para Jogos 3D

Gera texturas **por código procedural** (numpy + PIL), não por API de imagem. Isso garante
resultados determinísticos (seed), tileable e editáveis. Ambiente já validado: Python 3.13,
numpy, PIL disponíveis.

## Workflow

1. Perguntar-se: qual mapa é necessário? (albedo / normal / roughness / AO / emissive / height)
2. Escrever um script Python curto no scratchpad importando `texlib.py` desta skill:
   ```python
   import sys; sys.path.insert(0, r'.claude/skills/game-texture-gen/scripts')
   from texlib import *
   ```
3. Compor ruídos → derivar mapas → salvar em `public/textures/<nome>_<mapa>.png`
   (criar a pasta se não existir).
4. **Sempre validar o resultado**: usar Read na PNG gerada para inspecioná-la visualmente
   antes de entregar. Iterar nos parâmetros se não estiver bom.
5. Integrar no jogo via `useTexture` do drei ou `TextureLoader`, com
   `wrapS = wrapT = THREE.RepeatWrapping` para tileable.

## API do texlib (resumo)

| Função | Uso |
|---|---|
| `fbm(size, octaves, freq, seed)` | Base orgânica: rocha, terreno, nuvens, mármore |
| `ridged(size, octaves, freq, seed)` | Cristas afiadas: veios de minério, lava, raios |
| `voronoi(size, points, seed, mode)` | `'f1'` células, `'f2f1'` rachaduras/bordas, `'cell'` id por célula |
| `normal_from_height(h, strength)` | Heightmap → normal map RGB (OpenGL, Y+) |
| `ao_from_height(h, radius, strength)` | AO aproximado via blur FFT |
| `colorize(gray, stops)` | Gradiente de cor: `[(0.0,(r,g,b)), ..., (1.0,(r,g,b))]` |
| `save_gray / save_rgb / save_rgba` | Salvam PNG e imprimem confirmação |

Todas as saídas são tileable (wrap toroidal). Tamanhos recomendados: 256 (mobile), 512 (padrão), 1024 (hero asset).

## Receitas prontas

- **Rocha**: `h = fbm(512, 6, 4)` → albedo `colorize(h, tons de cinza/marrom)`, normal `strength=3`, roughness `0.8 + h*0.2`
- **Cristal/gema**: `v = voronoi(512, 24, mode='f2f1')` como facetas; emissive = `ridged` mascarado por threshold
- **Lava**: base `colorize(fbm, preto→vermelho→laranja→amarelo)` + emissive = mesmo gray com gamma `h**3`
- **Água/caustics**: `ridged(512, 4, 6)` com threshold alto → linhas finas brilhantes (combina com o estilo Lumen do DiamondCrown)
- **Metal riscado**: fbm com `freq` alto só no eixo X (esticar: gerar 512×64 e redimensionar) → roughness anisotrópica fake

## A partir de imagem de referência (enviada pelo usuário)

Quando o usuário enviar uma imagem, usar `imglib.py` (mesma pasta de scripts):

1. **Salvar** a imagem enviada num arquivo (scratchpad) e **olhar com Read** para entender o conteúdo.
2. Processar:
   ```python
   from imglib import *
   img = load('ref.png', size=512)
   print(palette(img, 5))                       # cores dominantes → materiais/VFX
   til = make_tileable(img, blend=0.25)         # remove costuras p/ repetir
   save_rgb(til, 'public/textures/x_albedo.png')
   save_rgb(normal_from_image(til, 3.0), 'public/textures/x_normal.png')
   save_gray(roughness_from_image(til), 'public/textures/x_rough.png')
   ```
3. `remove_background(img)` → recorta objeto de fundo uniforme (vira sprite RGBA).
4. Alternativa "recriar em vez de reaproveitar": analisar a imagem visualmente, extrair
   `palette()`, e regenerar o padrão com as funções procedurais do texlib usando essas
   cores — dá resultado mais limpo/tileable que a foto quando a referência é arte conceitual.

## Convenções do projeto GemTD

- Salvar em `public/textures/` com sufixo do mapa: `lava_albedo.png`, `lava_normal.png`, `lava_emissive.png`
- Materiais de torres **sempre** via `buildGemMaterial` do `TowerEngine` — passar a textura por parâmetro, nunca criar `MeshPhysicalMaterial` direto
- `toneMapped: false` já é aplicado pelo TowerEngine; emissive maps podem usar valores saturados
- Para texturas usadas em shader customizado, injetar como uniform via `injectShaderEffects`
