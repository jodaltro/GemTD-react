---
name: game-sprite-gen
description: Gera sprites RGBA para VFX e UI de jogos 3D — glows de partículas, anéis de shockwave/AoE, flashes de impacto, fumaça, gotas, spritesheets animados e ícones. Usar quando o usuário pedir sprites, partículas, efeitos visuais 2D, billboards, texturas de partícula ou ícones raster para o jogo.
---

# Geração de Sprites e VFX 2D

Gera sprites **por código** (numpy + PIL), com fundo transparente, prontos para uso como
billboard/`PointsMaterial.map`/`SpriteMaterial` no Three.js. Para ícones de UI vetoriais,
preferir escrever SVG diretamente (ou usar lucide-react, já no projeto).

## Workflow

1. Escrever script Python curto no scratchpad:
   ```python
   import sys; sys.path.insert(0, r'.claude/skills/game-sprite-gen/scripts')
   from spritelib import *
   ```
2. Salvar em `public/sprites/<nome>.png` (criar pasta se não existir).
3. **Validar com Read** na PNG gerada (inspecionar visualmente) antes de entregar; iterar.
4. Integrar: `useTexture` do drei → `SpriteMaterial`/`PointsMaterial` com
   `transparent: true`, `depthWrite: false`, e `blending: THREE.AdditiveBlending` para glows.

## API do spritelib

| Função | Uso |
|---|---|
| `glow(size, color, core, falloff)` | Glow radial aditivo — partícula básica, muzzle flash |
| `ring(size, color, radius, width)` | Shockwave, indicador de range/AoE no chão |
| `star_burst(size, color, spikes, sharpness)` | Flash de impacto, brilho de gema |
| `smoke_puff(size, color, seed)` | Fumaça/nuvem — variar `seed` por frame |
| `droplet(size, color)` | Gota de água/veneno com highlight |
| `spritesheet(frames, cols)` | Empacota frames em sheet para animação UV |
| `over(base, top)` | Compor sprites (ex.: glow + star_burst) |
| `save(arr, path)` | Salva RGBA |

Tamanhos: 64–128 para partículas, 256 para hero VFX, sheets de 4×2 ou 4×4 frames.

## Receitas

- **Impacto de projétil**: `over(glow(256, cor), star_burst(256, branco, spikes=4, sharpness=16))`
- **Indicador de range de torre**: `ring(256, cor_da_gema, radius=0.85, width=0.06)` num plane deitado no chão
- **Slime/poison overlay**: `smoke_puff` com cor verde + alpha baixo
- **Sheet de fumaça animada**: `spritesheet([smoke_puff(128, seed=i) for i in range(8)], cols=4)` → animar offset UV no shader
- **Trail de projétil**: gradiente `glow` esticado (gerar e usar `PIL.Image.resize` para 256×64)

## A partir de imagem de referência

Se o usuário enviar uma imagem para virar sprite: usar `remove_background()` e `palette()`
do `imglib.py` (em `.claude/skills/game-texture-gen/scripts/`) para recortar o objeto e
extrair as cores; ou analisar a imagem visualmente e recriar o efeito com as primitivas
do spritelib usando a paleta extraída (resultado mais limpo para VFX).

## Convenções do projeto GemTD

- Salvar em `public/sprites/`
- Cores das gemas estão em `constants.ts` (`GEM_DATA[...].color`) — usar as mesmas cores nos VFX da gema correspondente
- Projéteis usam shaders GLSL do `ProjectileEngine`; sprites servem para impactos, auras e UI de mundo — não substituir os shaders existentes sem pedido explícito
- Para muitos sprites simultâneos, usar `InstancedMesh` de planes billboard ou `Points`, nunca um `<sprite>` por partícula
