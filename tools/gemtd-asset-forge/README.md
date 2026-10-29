# GemTD Asset Forge

Gerador procedural offline em **Python** para os assets geométricos do GemTD.
Ele não depende de uma API 3D paga: uma `GemSpec` descreve o asset e o código
transforma essa especificação em vértices, faces e materiais PBR exportados em
`.glb`. Não há dependências externas nesta primeira versão.

## Primeiro GLB

Na pasta deste projeto:

```powershell
python -m asset_forge.generate specs/ruby-procedural-v001.json
```

Cada execução cria um bundle próprio em `out/<asset-id>/`. O GLB bruto fica em
`out/ruby-procedural-v001/model.glb`; copie o GLB polido aprovado para
`../../public/glb/` com o nome final do asset.

Para validar o arquivo real que Blender importará e gerar um preview isométrico:

```powershell
python -m asset_forge.validate out/ruby-procedural-v001/model.glb --preview out/ruby-procedural-v001/preview.png
```

O comando também cria `model-polished.glb`, `model.blend`, `qa.json` e o
preview no mesmo bundle. A Studio inclui também `spec.json`, `vfx.json` e
`references/front|right|back|left.*` dentro da pasta do asset.

## Fluxo com OpenRouter

1. Produza quatro imagens consistentes: frente, direita, costas e esquerda.
2. Envie-as a um modelo de visão do OpenRouter com o prompt em
   `prompts/vision-to-spec.md`.
3. Salve o JSON retornado em `specs/`.
4. Rode `python -m asset_forge.generate specs/<id>.json`.
5. Compare o GLB renderizado com as referências, ajuste a spec e repita.

A LLM controla apenas a `ArtSpec`. Ela nunca escreve vértices/faces brutos,
código Python ou scripts Blender. Isso mantém a malha válida, determinística e
segura de iterar. Além da forma, a spec possui `finish` (raio e segmentos de
bevel), `surface` (ferramenta de tratamento geométrico), `texture` (veios PBR
procedurais) e `vfx` (parâmetros de partículas). `surface.mode` só aceita
`faceted`, `softened` ou `sculpted`: os dois últimos aplicam Laplacian Smooth
preservando volume antes do bevel; não há execução de código retornado pelo modelo.
O Blender executa os dois primeiros e grava um emitter editável; o jogo consome
o arquivo `out/<asset>/vfx.json` para renderizar as partículas em GPU.

## Studio com quatro vistas

Crie `tools/gemtd-asset-forge/.env` (ele é ignorado pelo Git):

```text
OPENROUTER_API_KEY=sua-chave
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
# Opcional: permite escolher um modelo padrão de visão.
OPENROUTER_VISION_MODEL=google/gemini-3.8-flash
# Opcional: modelo textual usado pelo modo prompt, sem imagens.
OPENROUTER_PROMPT_MODEL=deepseek/deepseek-chat-v3-0324
```

Inicie a interface local:

```powershell
python -m asset_forge.studio
```

Abra `http://127.0.0.1:8765`. A interface fixa os slots de **frente, direita,
costas e esquerda**, envia os quatro rótulos e imagens ao modelo de visão, salva
as referências localmente no bundle `out/<asset>/references/` e apresenta uma GemSpec
editável. Depois, ela gera o GLB sem custo de API e chama o Blender para
suavizar as bordas, aplicar o material procedural, criar o projeto `.blend`,
exportar um `-polished.glb` e renderizar o preview isométrico. A chave nunca é
enviada ao navegador.

### Modo prompt: ideia → anatomia → construção

Também é possível começar sem imagens. Descreva a intenção visual no campo
**Pesquisar e transformar prompt em plano 3D** e, quando fizer sentido, mantenha
a pesquisa habilitada. A chamada usa o server tool `openrouter:web_search`:
o modelo pode procurar anatomia ou construção real antes de decompor o objeto.
Esse recurso é opt-in porque a busca e o contexto retornado têm custo adicional.

Quando a caixa de pesquisa está marcada, ela agora é uma fase obrigatória e
auditável: o Forge executa uma busca dedicada, exige de 2 a 6 URLs reais e grava
consultas, achados e fontes em `build-brief.json`. Se o provedor não devolver
fontes, o plano falha explicitamente; para seguir deliberadamente sem internet,
desmarque a caixa. A interface mostra em tempo real as fases Jev, pesquisa,
direção DeepSeek e gravação do bundle.

Antes da LLM diretora escrever a GemSpec, o `typesafe/jev-1.13` faz três
decisões tipadas: a família executável (`crystal-cluster`, `geode-egg` ou
`organic-guardian`), a primeira revisão obrigatória (`silhouette-first`,
`anatomy-first` ou `cavity-surface-first`) e a prioridade de pesquisa. A LLM
recebe essa rota como contrato: ela não pode trocar silenciosamente a família
que será construída. A decisão, confiança e critérios ficam em
`build-brief.json` no campo `jevRoute`.

Com quatro vistas, há uma etapa adicional para manter a decisão honesta: o
modelo de visão primeiro grava apenas uma observação neutra em
`vision-observation.json`; Jev classifica essa observação; só então a segunda
análise visual recebe a rota obrigatória e cria a GemSpec. A rota completa é
salva em `jev-route.json` no mesmo bundle.

O resultado salva `build-brief.json` no bundle do asset. Ele contém a silhueta,
a hierarquia de peças (primária, secundária e terciária), notas de superfície e
material, e uma lista explícita de ferramentas futuras para características que
o gerador ainda não sabe executar. Assim, uma ideia como "criatura alada" não é
falsamente exportada como uma criatura pronta: o brief pode descrever esqueleto,
músculos, placas e asas, enquanto a GemSpec escolhe apenas o módulo executável
mais próximo. O plano é levado para `construction-plan.json` ao usar
**Construir por etapas**.

### Construção deliberada e seleção

Em vez de tentar acertar uma malha inteira em uma única chamada, o Studio pode:

1. Exportar etapas (`01-massing`, volumes principais, composição e acabamento)
   para aprovar a silhueta antes de detalhar;
2. gerar de 3 a 16 candidatos determinísticos no subdiretório `candidates/`;
3. pedir ao `typesafe/jev-1.13` uma decisão tipada entre esses programas;
4. promover apenas o vencedor ao `model.glb` principal e então validá-lo no
   Blender.

Jev escolhe entre parâmetros seguros e resumos das malhas: ele não gera ou
executa Python/Blender. A próxima camada de qualidade é comparar renders de
candidatos contra as vistas de referência antes da promoção — útil para
fidelidade visual, mas não necessária para a construção procedural básica.

### Modelos escolhidos

- **`google/gemini-3.8-flash`** é o padrão para todas as análises das quatro
  vistas: aceita imagem e saída estruturada, é rápido e tem custo baixo.
- **`openai/gpt-6-astra`** fica disponível no campo de modelo para uma revisão
  de arte final. Use-o somente quando um candidato já estiver próximo de ser
  publicado, pois não há motivo para pagar pelo modelo mais forte em cada ajuste
  de parâmetros.
- Não usamos um modelo `:free` como base do pipeline visual: disponibilidade,
  limites e qualidade variam, prejudicando a repetibilidade dos assets.
- **`deepseek/deepseek-chat-v3-0324`** é o padrão do modo por prompt. Ele não
  recebe imagens: Jev faz a classificação tipada e o DeepSeek transforma a rota
  e a descrição em GemSpec/brief estruturados. O modelo suporta saída
  estruturada e tem múltiplos provedores no OpenRouter, o que também evita
  depender da cota do provedor visual.

## Famílias executáveis

O gerador implementa `crystal-cluster`, ideal para Ruby, Sapphire, Topaz,
Amethyst, Emerald, Diamond e Aquamarine. Personagens com rig/animação (golem,
cobra) continuam usando um asset base rigado.

`organic-guardian` é a primeira família anatômica modular: gera um mestre
estático com `Organic_Body`, `Organic_Head`, cada `Organic_Limb`, cauda e placas
`Organic_Armor_Plate` separadas. O exemplo
`specs/stone-guardian-v001.json` produz 43 meshes e cerca de 179 mil triângulos
após o acabamento no Blender. É uma base de escultura e direção de arte, não
um personagem animado: rig, pesos, olhos/expressão e animações continuam sendo
uma ferramenta posterior, que poderá usar os nomes dessas peças.

O preset padrão do Studio é `hero`: um prop de alta densidade, próximo de 100 mil
triângulos, para priorizar a aprovação artística. O modo `game-mobile` continua
disponível para uma versão otimizada posterior; ele não é o alvo desta fase.

No modo `hero`, cada cristal central, macrocristal e microcristal é exportado
como mesh separado no GLB. Isso preserva centenas de peças editáveis no Blender;
uma versão de produção pode agrupá-las mais tarde caso seja necessário. Toda QA
também salva um projeto `.blend` ao lado do GLB, já com as peças separadas.

## Onde o Matrix-3D se encaixa

O Matrix-3D não é usado para gerar torres: ele cria mundos panorâmicos e produz
uma cena em `.ply`/Gaussian splats, não um objeto GLB de baixa complexidade. Ele
pode ser avaliado mais tarde para concept/protótipo de cenários do GemTD. Para
gemas, este gerador procedural oferece geometria editável, reprodutível e
adequada ao jogo desde a primeira tentativa.
