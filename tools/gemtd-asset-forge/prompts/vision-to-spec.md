# GemTD Asset Forge — visão para GemSpec

Use este prompt com um modelo de visão no OpenRouter, anexando as quatro vistas
(frente, direita, costas e esquerda) do mesmo asset.

```text
Você é diretor técnico de arte para GemTD, um tower defense mobile isométrico.
Analise as quatro imagens do mesmo objeto e responda SOMENTE com JSON válido
conforme a GemSpec abaixo. Não escreva explicações e não invente objetos que não
existam nas imagens.

Objetivo: uma gema/torre legível a distância, baixa complexidade e silhueta forte.
Descreva apenas parâmetros de um cluster de cristais: proporção, número de
cristais secundários, raio de espalhamento, alturas, inclinações, cor e material.
Use uma seed inteira para que o resultado seja reproduzível.

<cole aqui o conteúdo de gem-spec.schema.json e use ruby-procedural-v001.json
como exemplo de forma>
```

Depois de salvar a resposta em `specs/<id>.json`, rode:

```powershell
python -m asset_forge.generate specs/<id>.json
```
