---
name: glb-inspect
description: Inspeciona arquivos GLB/glTF sem dependências — lista meshes, contagem de triângulos/vértices, materiais, texturas, animações, skins e nomes de nós. Usar ao integrar um GLB novo, depurar por que um modelo não aparece/anima, validar um export da skill game-model-gen, ou avaliar peso de asset (budget de tris para mobile).
---

# Inspeção de Assets GLB

Parse direto do binário (sem three.js) — rápido e sem side effects.

## Uso

```bash
node .claude/skills/glb-inspect/scripts/glb-info.mjs public/glb/<arquivo>.glb
node .claude/skills/glb-inspect/scripts/glb-info.mjs public/glb/<arquivo>.glb --json
```

Saída: tamanho, tris/verts totais, nomes de nós, primitives por mesh (com material e
atributos), materiais, texturas, animações (duração e canais) e skins (joints).

## Quando usar

- **Antes de integrar** um GLB novo: descobrir nomes de nós/bones para `getObjectByName`
  e nomes de animação para `useAnimations`
- **Depois de exportar** com a skill `game-model-gen`: validar estrutura e nomes
- **Modelo invisível/errado**: conferir se o mesh esperado existe, se tem NORMAL, se a
  escala/atributos batem
- **Performance mobile**: orçamento por torre ≲ 5k tris (o jogo renderiza dezenas
  simultaneamente); ver `totalTriangles`

## Notas do projeto

- Assets ficam em `public/glb/`; carregados com `useGLTF('/glb/...')`
- GLB com skeleton (ex.: `golem_-_attack.glb`) deve ser clonado com `SkeletonUtils.clone`
  — nunca `scene.clone()` (quebra bind do skeleton)
- Se a animação não toca, comparar o nome exato listado aqui com o usado em `useAnimations`
