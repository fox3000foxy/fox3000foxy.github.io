---
title: "Sabaki vs System One : Davi contra Golias, o menor modelo de decisão do mundo"
description: "20KB contra 421M parâmetros. Sabaki perde 7 pontos no typed-decisions mas sai de 25s CPU para menos de 1ms offline. Anatomia de um MoE organizacional."
date: 2026-11-12
tags:
  - ai
  - system-one
  - typescript
  - cpu
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "nFLuE77LGTbizMGv1lncwrdqalEa7Kxl6Ckq76fqWSrMtH9PWoJhjKS/o+E27slvXFVMUKIH2B6isCO8RJjUHw=="
---

## Introdução

Se você anda pelo Hacker News ou Twitter desde setembro, com certeza já trombou com o Jev.

No dia 15 de setembro de 2026, a TypeSafe lançou o Jev, o primeiro "System One" deles. O pitch cabe numa frase : parem de pedir pra um LLM gerar JSON pra escolher um label. Você passa um `state` mais umas perguntas tipadas, ele devolve decisões tipadas com probas. Um passe, zero token pra amostrar, nada pra parsear depois.

E explodiu. Dia um com adoção recorde no Vercel AI Gateway, cinco clientes Elixir em poucos dias, todo mundo comparando o Jev com a própria solução em benchmark. E, sinceramente, o hype faz sentido. A gente passou anos gambiarreando prompts do tipo `responda SOMENTE com {"choice": ...}` rezando pro modelo não inventar uma opção, não quebrar o JSON, não alucinar um campo. O Jev deu nome pra essa necessidade e entregou numa API limpa : `POST /v1/systemone`, perguntas `choice / score / noul`, respostas com `probabilities` + `confidence`.

Adorei a ideia. O modelo econômico, menos -- e pra deixar claro, nunca paguei pelo Jev.

Porque por trás, o Jev continua sendo uma API fechada. Pesos desconhecidos, sem self-host, cada decisão = um round-trip de rede + um contador girando. E as alternativas open que vieram depois batem nos 400M de parâmetros com GPU obrigatória.

Então construí o outro extremo : [Sabaki](https://sabaki.fox3000foxy.com/). Um roteador por palavras-chave + uma regressão logística em TypeScript puro que fala o mesmo contrato do Jev (mesmos shapes `choice / score / noul`, mesmo endpoint `/v1/systemone`), mas que roda em **menos de 1ms** com **20 kilobytes** de JSON. Zero dependência no modo nano, offline, grátis.

Pra situar : Laya são 843 MB de safetensors pra carregar. OpenDecider-nano são 2 GB de RAM. Sabaki nano invoices são 20 KB. A proporção de peso gira em torno de **40 000**.

Se você quer a versão quadrada e com números, tem o preprint v1 de outubro de 2026 no site : *Sabaki: An Organizational Mixture-of-Experts for Typed Decisions on CPU* ([PDF](/assets/paper/sabaki-organizational-moe-typed-decisions.pdf)). Design, medições, tradeoffs, tudo lá. Este artigo é a versão legível, com o código aberto do lado.

Não escrevi isso no meu canto em modo benchmark de papel. Eu contribuo pro [azalio/doomLaya](https://github.com/azalio/doomLaya) (meu fork : [fox3000foxy/doomLaya](https://github.com/fox3000foxy/doomLaya)), um harness onde Laya e Jev jogam FreeDoom de verdade com decisões model-owned, telemetria por tick e vídeos. Vi o Golias jogar ao vivo, e quando a rede tosse, ele tosse junto.

Vamos abrir os motores um por um. Como sempre, com o código de verdade.

## O ringue onde todo mundo aceita lutar

Tem um único dataset que Jev, Laya e OpenDecider citam todos : [LocalLLaMA/typed-decisions](https://huggingface.co/datasets/LocalLLaMA/typed-decisions). 4 workflows sintéticos (suporte, faturas, segurança, traces de agentes), 5 perguntas por caso, 1200 casos de treino, 400 de teste, 2000 decisões.

| Modelo | Params | Score teste | Latência | Onde roda |
|---|---|---|---|---|
| OpenDecider-nano | ~400M | 0.796 | 17ms GPU | GPU, 2 GB RAM |
| Laya typed-decisions | 421M | 0.766 | ~25s/state CPU, ~830ms/caso MLX | GPU |
| Jev 1.13 | fechado | ~0.73-0.75 | ~710ms API | só API |
| **Sabaki mini** | 22M int8 | **0.69** | **~20ms CPU** | CPU, 22 MB |
| **Sabaki nano** | ~0 | **0.61** | **<1ms** | em todo lugar |
| Laya base zero-shot | 421M | 0.362 | igual | GPU |

O acaso é 0.318, a maioria é 0.461. Então Laya base com 0.362 sem fine-tune é nível "respondo no chute sendo educado". Guarda isso, vai ser útil.

7 pontos separam o Sabaki do melhor. 1000x de latência separam no sentido contrário quando você não tem GPU. Aí está o artigo inteiro em duas frases, o resto é pra entender o porquê.

Mas atenção : por trás da mesma tomada `choice / score / noul`, as cozinhas não têm nada a ver. Jev = API fechada. Laya = ModernBERT-large com fine-tune. OpenDecider = Ettin-encoder destilado. Sabaki = contagem de palavras + MiniLM int8. Mesmo contrato, orçamentos incomparáveis.

## Jev, o tapa que todo mundo viu passar

Tem que dar pra TypeSafe o que é da TypeSafe : o contrato System One é uma ideia realmente boa.

Antes, pra triar um ticket, você fazia isso : pedia pra um LLM "escolhe entre billing, técnico e spam, responde em JSON", parseava a resposta, lidava com os casos onde ele responde "Eu diria billing ! 😊" ou inventa uma 4ª categoria. Cada pergunta custava tokens, cada resposta podia quebrar seu pipeline.

O Jev muda o jogo : você manda o texto + perguntas com seus critérios, ele avalia cada pergunta em paralelo e devolve um valor tipado com sua distribuição.

```bash
curl https://api.typesafe.ai/v1/systemone \
 -H "Authorization: Bearer $KEY" \
 -H 'content-type: application/json' \
 -d '{"state":"charge double ce mois-ci","questions":{"dept":{"type":"choice","instructions":"Route ce message.","criteria":{"billing":"paiements","technical":"bugs"}}}}}'
```

Resposta : `{ choice, probabilities, confidence }`. Sem texto livre. Seu código pode plugar direto em cima.

É por isso que viralizou : SDK Python + JS, plugin Claude Code, integração LangChain, todo mundo conseguia plugar seus agentes numa tarde. A doc da TypeSafe empurra até o padrão saudável : Jev pros julgamentos pequenos e rápidos, código determinístico em volta pra compor a decisão de verdade, LLM lento ou humano assim que a confiança cai.

O problema é o resto. Pesos fechados, offline impossível, preço por chamada. Pra um agente que toma 100 decisões por run, a taxa dói. Pra Doom a 35 ticks/s, é morte : no doomLaya, o Jev sai da MAP01 seed 48 em 68.97s com p50 HTTP de 357ms. O run dá $0.0046 de custo de API -- não é minha fatura, é a do benchmark. Funciona, o run é limpo, sem morte. Mas 357ms a 35 ticks/s dá 12 ticks onde o jogo continua enquanto você espera a rede.

O Sabaki roubou exatamente esse contrato -- mesmas perguntas, mesmas respostas, mesmo endpoint `/v1/systemone` servido por `serve()` -- tirando tudo que pede um datacenter.

## Laya, o grandão open que mostrou que dava pra fazer sem API

[Laya](https://github.com/NandhaKishorM/laya) pela Convai Innovations, Apache-2.0. Debaixo do capô : ModernBERT-large, 421M, com 1 token `[MASK]` por opção. O hidden state de cada marcador passa num MLP pequeno, softmax nas opções da pergunta. Um passe por pergunta, igual ao Jev.

```python
pipe = pipeline("text-classification", model="convaiinnovations/laya-typed-decisions")
```

O 0.766 merece uma pausa. É o checkpoint **com fine-tune no treino do benchmark** : 1200 casos, RLCD com ruído gaussiano nos logits, reward log + spherical. O mesmo modelo sem esse ajuste cai pra 0.362. Ou seja, ele chuta. Então o score da Laya é "encoder grandão + treino no domínio", não "encoder grandão mágico".

Em CPU, é um tijolo. A porta ONNX medida gira em torno de 25s por state. Em MLX FP16, conta 830ms por caso na média com p99 de 5.3s. E tem que carregar 843 MB antes de responder qualquer coisa.

No doomLaya, a Laya stock falha a MAP01 em 180s. A v3 adaptada ([azalio/laya-doom-v3](https://huggingface.co/azalio/laya-doom-v3)), retreinada em Doom, sai em 61.43s com p50 de 108ms em MPS, pegando a shotgun no caminho. Então sim, joga -- depois de treino dedicado, em GPU Apple, com um executor com script que faz o trabalho de verdade (A*, portas com latch de 15 ticks, mira auto).

Meu resumo : sem treino na sua tarefa, a Laya serve de peso de papel de 421M. Com treino, é muito forte, mas precisa da GPU e dos dados que acompanham.

## OpenDecider, o que venceu o leaderboard

[OpenDecider](https://github.com/manjunathshiva/opendecider), é o Manjunath que resolveu buscar todo mundo no próprio benchmark deles. Resultado : **0.796** com Ettin-encoder-400m full fine-tune + cabeça MLP, loss KL em soft targets destilados de Qwen3-235B + DeepSeek.

```bash
pip install opendecider
# 17ms/pergunta na L40S, 18ms na M4 Max, ~9ms em batch
```

Com 50% de coverage, a selective accuracy sobe pra 0.943 contra 0.882 do Jev. No papel, o melhor dos dois mundos : open, calibrado, rápido.

Na prática : 2 GB de RAM pra carregar o nano, GPU obrigatória pra segurar os 17ms, phishing em 0.63 contra 0.90 do Jev (o OOD lava ele), e igual à Laya, treinado no treino do benchmark. O teste nunca foi visto, mas o domínio sim.

Ele vence o braço de ferro, mas continua sendo 400M com uma GPU atrás. Você não enfia isso num Worker Cloudflare nem num loop de jogo no laptop.

## Os 150M, e o buraco embaixo

openJev-verdict-2.0 (151M), julia-1 (144M multilíngue), Open Jev (150M), Largha-150M (144M en+zh), Vela (0.3B-9B). Todos ModernBERT ou mmBERT-small, todos capazes de rodar em CPU, todos tranquilos de treinar (Open Jev anuncia 30min num T4 Colab). Números self-reported, protocolos diferentes, então pega com pinça, mas a família existe.

O generalist Sabaki tem **22.7M**. Cerca de 6.5x menor que o menor dessa turma. Ninguém mais desce abaixo dos 100M pra responder perguntas definidas em runtime.

É isso, "o menor do mundo" : não o melhor score, o menor envelope que lê suas `instructions` + `criteria` e decide quando nenhum especialista sabe responder.

## Sabaki, o roteador burro e seus especialistas descartáveis

Bom, chega de falar dos grandes. Vamos pro Davi, porque é aqui que fica divertido.

O Sabaki não tenta ser um modelão esperto que entende o mundo. É um MoE organizacional : 1 roteador esparso no nível do sistema, especialistas independentes, um só ativo por input. Cada plugin é um pacote npm separado, com seu manifest, seus pesos, sua versão. Você instala só o que roteia.

A org [sabaki-js](https://github.com/sabaki-js) : 13 repos, o core `sabaki` (129 commits), 6 plugins `@sabaki-js/*`, os pesos, o worker Cloudflare, o template pra escrever o seu.

O `package.json` do core já conta a história :

```json
"dependencies": { "@typesafe-ai/sdk": "^0.7.0" },
"optionalDependencies": { "onnxruntime-node": "^1.22.0" }
```

No modo nano, zero dependência de runtime. Só TypeScript compilado, nada pra instalar, nada que pode quebrar entre duas versões do ONNX.

### O roteador, ou como decidir em poucas linhas

O roteador mora em `src/index.ts`, e a tokenização é assim (`src/index.ts:129`) :

```ts
function tokens(s: string): string[] {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/).filter((w) => w.length > 3);
}
```

Minúsculas, acentos fora, palavras de 4 letras no mínimo. Esse filtro tira todo o ruído ("le", "de", "ok"). Em ticket de suporte, isso muda tudo porque seu matching acontece em palavras que carregam sentido.

O scoring em si está em `route()` (`src/index.ts:251`), e é aí que tudo se decide :

```ts
const hits = kws.filter((k) =>
  words.some((w) => w.includes(k) || k.includes(w))).length;
const score = hits / Math.sqrt(kws.length);
```

Matching frouxo nos dois sentidos : `billing` pega `billed`, `invoice` pega `invoicing`. A divisão pela raiz evita penalizar listas grandes de keywords, senão o plugin mail com suas 600 palavras esmagaria todo mundo assim que um email contém "hello".

Cada plugin tem seu limiar, padrão 0.15 guardado em `src/index.ts:139`, mail em 0.03 porque os assuntos são curtos. Abaixo disso :

```ts
return { domain: "unknown", decision: null, confidence: 0, plugin: null };
```

Domínio desconhecido = `unknown`, nunca um chute inventado pra agradar. É uma abordagem propositalmente burra, e é exatamente isso que torna o limiar `automate > 0.8` usável depois : quando o Sabaki responde, é porque um especialista realmente bateu.

Tem um eixo de idioma de brinde via `langid` : um plugin que declara `languages` só concorre pros seus idiomas. Prático pra separar phishing latino e CJK. Texto curto demais = sem filtro, todo mundo concorre.

Custo total : alguns microssegundos por decisão. Nenhuma matriz pra multiplicar, nenhuma rede pra chamar, só comparações de strings e uma divisão.

### Nano, meu arquivo favorito do repo

`src/logreg.ts:28`, a tokenização :

```ts
function tokens(s: string): string[] {
  const words = s.toLowerCase().split(/[^a-z0-9]+/)
    .filter((w) => /^[a-z]{3,}$/.test(w));
  const out = [...words];
  for (let i = 0; i < words.length - 1; i++)
    out.push(`${words[i]} ${words[i + 1]}`);
  return out;
}
```

Unigramas + bigramas. `charged twice` dá `charged`, `twice`, e o par `charged twice`. É tudo que precisa pra captar "cobrança dupla" sem tirar um transformer de 400M da cartola.

`src/logreg.ts:46`, a vetorização, onde o TF-IDF faz seu trabalho :

```ts
const tf = 1 + Math.log(c);  // TF sublinear
const val = tf * w.idf[i]!;  // IDF suave estilo sklearn
```

A 10ª ocorrência de uma palavra conta menos que a primeira, palavras raras pesam mais que "please". Exatamente a receita do sklearn, paridade exata verificada em 20 perguntas.

E o comentário que me fez sorrir relendo :

```ts
// Toca só nos termos presentes (esparso) em vez de varrer 3000 dims.
for (const [t, c] of counts) {
```

Em vez de varrer 3000 dimensões a cada ticket, você toca só na vintena de palavras presentes. É por isso que responde em menos de 1ms. É o tipo de detalhe invisível que muda tudo em prod, porque a complexidade segue o tamanho do ticket e não o do vocabulário.

`src/logreg.ts:86`, a inferência, que cabe em três linhas :

```ts
// binário : 1 linha de coefs + sigmoide
const pPos = 1 / (1 + Math.exp(-s));
// multiclasse : produto escalar + softmax, argmax
```

Um produto escalar, uma sigmoide ou um softmax conforme o número de classes. Um passe e acabou. Zero token gerado, então zero JSON quebrado pra consertar depois com retry e heurística de parsing.

Receita `train.py` : 300 treino / 100 teste por workflow, split determinístico (1 item em 5 no teste pra evitar viés temporal), vocab 3000-6000, coefs arredondados pra 1e-4 com zero perda medida. Export JSON `{ vocab, idf, questions }`.

Pesos : 20 KB pra invoices (`duplicate` 0.89) até 650 KB pra mail (`bucket` 0.889). Do tipo de tamanho que passa num bundle frontend.

O detalhe que me grudou na cadeira : em mail, o MiniLM cola no TF-IDF a +/-0.02. Então o nano shippa como está. Pagar GPU pra triar email, conta comigo não. Já agent_trace trava (`needs_review` 0.59 no nano) : o texto de observabilidade é pobre, nenhuma palavra carrega a decisão de verdade.

A fábrica que transforma pesos em plugin, em `src/plugin.ts:52` :

```ts
export function nanoClassifier(manifest, weights, opts = {}) {
  return definePlugin({ manifest,
    classify: (input) => {
      const r = predict(`${from}${input.state}`, weights, q);
      return { decision: r.decision, confidence: r.confidence, domain: manifest.domain };
    }});
}
```

`decide()` continua síncrono nano, `decideAsync()` libera ONNX pra mini. Dois caminhos, uma regra simples : se você precisa de async é porque quer mini, senão nano basta. Fácil de lembrar quando você programa, fácil de debugar quando quebra.

Pra mostrar que não é só teoria, olha como é um uso real :

```ts
import { Sabaki } from "sabaki";
import customerService from "@sabaki-js/customer-service";

const sabaki = new Sabaki().register(customerService);
sabaki.decide({ state: "charged twice, refund please" });
// { decision: "billing", confidence: 0.31, domain: "customer_service" }
```

### Mini, 22 MB que mudam o jogo nos casos duros

O Nano tem seus limites, você viu em agent_trace logo acima. O MiniLM-L6 pega o bastão : um encoder compartilhado pra todo o domínio, mais uma cabeça linear por pergunta. Fine-tune end-to-end por 8-12 epochs, lr 2e-5, em GPU CUDA pro treino (a inferência continua em CPU, é isso que conta).

Os números que decidiram, medidos nos mesmos splits :
- encoder congelado + MLP : 0.65
- full fine-tune : 0.68
- destilação 400M pra embeddings congelados : testada, descartada, pior que os gold labels

Export ONNX via dynamo, paridade exata verificada, depois quant dinâmica int8 : 90 MB -> 22 MB, **-0.004 accuracy** em customer_service. ECE igual ou melhor. Cada export é remedido, senão a otimização não quer dizer nada.

Desde a 1.0.2, os pesos vêm embutidos no pacote (`models/<workflow>-int8/` + `modelDir` exportado). `npm i` basta, modo avião OK. Atualizar = publicar um patch, assinado via trusted publishing.

Concreto : `needs_review` vai de 0.59 pra **0.82**. `disposition` 0.73 -> 0.76. ECE < 0.14 em todo lugar, com uma dúvida OOD saudável (0.2-0.5 em dragões, receitas e strings vazias). É essa dúvida que permite o limiar agressivo em prod.

### Generalist, o catch-all que faz o Sabaki ser System One de verdade

O Jev e os outros respondem tudo : qualquer pergunta, quaisquer opções, definidas em runtime. É esse o contrato System One que fez o Jev viralizar -- você coloca suas `instructions` + `criteria` com suas opções, ele decide.

Os especialistas Sabaki não sabem fazer isso. Eles conhecem suas perguntas (`category`, `duplicate`, `bucket`) e nada mais. Sem rede de proteção, o Sabaki devolveria `unknown` assim que você sai do roteiro, onde o Jev sempre responde alguma coisa.

O generalist é essa rede. Um cross-encoder que lê pergunta + opção + state e solta um score, um passe por opção, softmax, argmax. 22.7M MiniLM int8 -- 6.5x menor que os 144-151M da turma. Mas o trabalho dele não é o score, é a compatibilidade : com ele plugado como fallback, o `POST /v1/systemone` aceita qualquer state e quaisquer perguntas, igual ao Jev. O campo `model` diz quem respondeu de verdade (`@sabaki-js/mail@1.1.2+mini`, `sabaki-generalist-v1`...), então do lado de quem chama você não muda nada.

E acima de tudo, é um fallback, não um chefe. Regra de ouro em `decideAsync()` : se um especialista vence o roteamento, ele responde. O generalist só fala no `unknown`. Nunca o contrário. Isso evita que um generalista mediano esmague um especialista bom no próprio domínio.

O loader mora em `src/generalist.ts`, com cache por pasta pra não recarregar a sessão ONNX a cada chamada :

```ts
export function loadGeneralist(modelDir: string) {
  // cache por pasta, sessão ONNX reutilizada
  // tokenizer.json -> Unigram ou wordpiece, detectado auto
  const sess = await ort.InferenceSession.create(
    path.join(modelDir, "generalist.onnx"),
    { intraOpNumThreads: 2 },
  );
}
```

Você aponta `SABAKI_GENERALIST_DIR` pra uma pasta com `generalist.onnx` + `tokenizer/`, o modelo é trocável. O id vem de `config.json`, senão `"sabaki-generalist"`. O cache `Map` evita recarregar a sessão a cada chamada.

O formato de entrada é cross-encoder clássico : pergunta, opção e state concatenados com separadores, uma linha por opção pra pontuar :

```ts
const texts = options.map(
  (o) => `${input.question ?? "decision"} [SEP] ${o} [SEP] ${input.state}`,
);
```

Pergunta + opção + state, separados por `[SEP]`, uma linha por opção. Opções limitadas a 8 (`slice(0, 8)`), padrão `["yes", "no"]` se você não passa nada. Acima disso, tem que fatiar do lado de quem chama -- 8 já é largo pra uma decisão tipada.

Depois vem o batch esperto, aquele tipo de otimização que parece boba mas divide a latência pelo número de opções. Em vez de um `session.run` por opção, tudo vai num único forward :

```ts
// Um único forward em batch para todas as opções
// (preenchido até o comprimento máximo) em vez de um run por opção.
const L = Math.max(...encs.map((e) => e.ids.length));
// ids + attention_mask em [options.length, L], padding no padId
const out = await sess.run({ input_ids, attention_mask });
const scores = Array.from(out["score"].data).map(Number);
```

Cada texto é codificado (wordpiece estilo BERT ou unigram SentencePiece conforme `tokenizer.json`), preenchido até o comprimento máximo do batch, empilhado num tensor `[nb_options, L]`. Um único `sess.run`, você recupera um score por opção. Em CPU isso muda tudo : 20-36ms em vez de 8x esse tempo.

Aí vem o softmax + argmax, com as probas completas pra cada opção, exatamente no formato que o Jev popularizou :

```ts
const pr = softmax(scores);
// bi = índice do max
const confidence = Math.round(pr[bi] * 1000) / 1000;
const probs = Object.fromEntries(
  options.map((o, i) => [o, Math.round(pr[i] * 1000) / 1000]),
);
```

E o detalhe que torna o troço usável em prod em vez de ficar demo é o `abstainAt` :

```ts
if (input.abstainAt !== undefined && confidence < input.abstainAt) {
  return { decision: null, confidence, domain: "generalist", probabilities: probs };
}
```

Opt-in, sem abstenção por padrão. Você passa `abstainAt: 0.6-0.7` e tudo que está mole volta `null` em vez de um chute. Como o softmax solta uns 1.00 mesmo quando erra fora da distribuição, não é luxo. O GUIDE recomenda pra todo uso autônomo : abaixo do limiar, você pede clarificação em vez de auto-resolver.

Pra fechar, aí está a mesma montagem com o fallback generalist : quando nenhum especialista bate, é ele que assume em vez de devolver `unknown`.

```ts
import { Sabaki, definePlugin, loadGeneralist } from "sabaki";
import mail from "@sabaki-js/mail";

const backend = loadGeneralist(process.env.SABAKI_GENERALIST_DIR!);
const generalist = definePlugin({
  manifest: { name: "@sabaki-js/generalist", domain: "generalist",
    version: "0.1.0", questions: ["decision"], keywords: [] },
  classify: (input) => backend.decide(input),
});

const sabaki = new Sabaki().register(mail).setFallback(generalist);

await sabaki.decideAsync({
  state: "le client dit que l'app a supprimé ses données",
  question: "c'est urgent ?",
  options: ["yes", "no"],
  abstainAt: 0.65,
});
// especialista mail se o roteamento bater, senão generalist como catch-all estilo Jev
```

As gerações do generalist, todas medidas igual no PhishNChips (2000 emails) e no teste typed-decisions pra comparar o comparável :
- v4 : 0.29 teste, R=0.026 phishing. Pra jogar fora, respondia do lado.
- A (22M 80k) : 0.546, R=0.406. Começa a parecer alguma coisa.
- mini v1 servida : **0.536, R=0.616**. É a que roda no site. Recall phishing ok, teste médio.
- B (144M scratch) : 0.568, R=0.062. Maior, mal melhor no teste, nulo em phishing.

O 144M from scratch que não transfere melhor me acalmou bem na ideia de "colocar mais params pra generalizar". Em tarefa igual, o grande custa mais caro sem chutar melhor. Mesmo como catch-all, o pequeno faz o trabalho. E ele continua EN-only (`all-MiniLM-L6-v2`), roteamento EN, FR fora da distribuição. Pra FR, tem que passar por um especialista treinado nisso, não pelo generalist.

## Doom, o único teste que importa de verdade pra mim

doomLaya é Laya e Jev jogando FreeDoom pra valer. O modelo escolhe `command / target / weapon`, o executor traça o caminho A*, abre as portas, mira, clica. Telemetria por tick, vídeos, SHA dos runs. Eu contribuo pra isso, então não estou falando de um leaderboard lido de longe.

v0.1.0, MAP01 seed 48, skill 3, 35 ticks/s, mesmo executor :

| Modelo | Resultado | p50 HTTP | Custo API |
|---|---|---|---|
| Laya stock | falha 180s | 106ms | $0 |
| Laya v3 adaptada | saída 61.43s | 108ms | $0 |
| Jev 1.13 | saída 68.97s | 357ms | $0.0046 |

Duas saídas limpas, sem morte, com a Laya pegando a shotgun no caminho porque o executor cuida do pickup sozinho. Honestidade obriga : a Laya v3 foi treinada em Doom, o Jev não. Um seed, um mapa, não prova nada geral. O README do projeto diz preto no branco, e é mérito dele não supervender o resultado.

Do lado Sabaki ([plugin-doom](https://github.com/sabaki-js/plugin-doom)) : ViZDoom em Python que chama um servidor JS a cada tick. Nano ~18k req/s, mini ~71 req/s numa thread i5. O tick 35Hz passa folgado, mesmo num laptop mediano.

Com bússola de saída, a mini sai da MAP01 em 2-4 runs de 6, nano 0/6. Lógico : o texto perde o espacial, os estados doomLaya batem no teto perto de 0.57 seja MiniLM ou ModernBERT-base. Quando falta info espacial, nenhum classificador de texto reinventa ela.

Os vizinhos refizeram a partida com dados iguais : [doomgemma](https://github.com/dexmac221/doomgemma) cola uma LoRA de 27min numa RTX 4070 e leva o Gemma 4 E2B ao nível da Laya v3 em jogo (6/6 vs 6/6) e acima em decisões isoladas. Em tamanho igual, um decoder vai tão rápido quanto a Laya (270M : 22ms vs 23ms). Em resultado igual, a Laya continua ~3x mais rápida porque chega lá com um modelo menor.

Minha leitura : o treino na tarefa conta mais que a arquitetura. Um especialista pequeno treinado bate um generalista grandão que está descobrindo. Exatamente a aposta do Sabaki. O paper que vem depois, *System Switch* ([arXiv:2610.09683](https://arxiv.org/abs/2610.09683)), leva a lógica até o fim : modelo pequeno e rápido que joga, modelo grandão que raciocina e retoma quando um gate abre. O pré-triage Sabaki (`automate > 0.85 senão escala`) aplicado ao jogo.

## O que foi sacrificado

Cada feature ausente financia outra, é a regra do jogo quando você mira CPU. A lista honesta, igual no Bareiron onde cada linha de C era um tradeoff :

**Sabaki não conta história.** Ele decide entre opções que você dá, com uma proba. Pra explicação, resumo, texto livre, pega um LLM.

**O francês continua fora da distribuição pro generalist.** Roteamento EN (`all-MiniLM-L6-v2`), sonda 1/4 FR vs 3/4 EN em casos parecidos. O plugin mail veio de uma caixa majoritariamente FR mas anonimizada : 0 PII, -0.024 accuracy por um vocab sem termos pessoais. A anonimização se paga, mas era inegociável.

**O softmax se mostra confiante demais quando sai da sua área.** Falsos a 1.00 observados, sim. Daí o pré-triage recomendado no GUIDE : `abstainAt: 0.6-0.7` pra devolver `null` abaixo do limiar, depois gate `confidence > 0.85` pra automatizar, humano senão. Referência medida : recall phishing 0.62 com precisão 0.87. Dá pra cortar a fila em dois, não dá pra mandar os revisores embora.

**O Nano sofre nos traces de agentes.** 0.34 a 0.59 conforme a pergunta. A mini sobe `needs_review` pra 0.82, mas `risk / urgency / action` continuam duros. O texto de observabilidade é só pobre em sinais lexicais.

**Doom em texto bate no teto.** Perto de 0.57, MiniLM igual a ModernBERT-base. Enquanto você fica no texto sem pixels, a MAP02 te trava. O caminho crível pra um jogador de verdade é visão + RL (tiny-doom-defender, 1.1M params a partir de pixels), não um classificador de texto melhor.

**O benchmark deriva por batches.** O typed-decisions é gerado por fornadas, o split temporal é na prática um split de batches. `drift_tool.py` dá 0.82 em customer_service, 0.67 em agent_trace (0.5 = indistinguível). Consequência medida : os pesos publicados fazem 0.733 no misto vs 0.61 no split oficial. O número oficial é então conservador. A calibração Platt / temperature+bias não transfere entre batches, então a gente shippa só o temperature scaling calibrado em batches recentes. Regra da casa : `drift_tool.py` primeiro, warn acima de 0.6, block acima de 0.8. Ninguém mais publica isso, todo mundo devia.

## O resultado final, números na mão

De um lado um i5 de laptop, do outro uma API que cobra por chamada. Olha o que cada modo entrega na prática :

- nano : <1ms, ~18k req/s, 20-650 KB, 0 dep
- mini : ~20ms, ~71 req/s, 22 MB int8, onnxruntime opcional
- generalist : 20-36ms, 22.7M, o menor generalista open que conheço

Vários domínios carregados : ~0.5 GB RAM em lazy-load por domínio em vez de ~2 GB pra tudo. Determinístico : 100/100 inputs idênticos dão o mesmo output. Limiares por pergunta, gate em `confidence`, `unknown` quando nada bate.

No Bareiron, rodar 3+ jogadores engasgava porque cada jogador custava um chunk a 200ms. Aqui rodar 3+ domínios passa sem chiar, porque cada especialista é minúsculo e carregado sob demanda em vez de carregar tudo de uma vez. Mesma filosofia do "pequeno que basta", aplicada a outro hardware.

## A filosofia

O p2r3 dizia : *"Só gosto da ideia de que esse chipzinho de 1 dólar consegue rodar algo tão avançado quanto Minecraft."*

Mesma vibe aqui : adoro a ideia de que 20 KB de JSON e uma centena de linhas de TS substituem uma chamada GPU pra escolher um label. Óbvio que não substitui tudo, não vamos viajar. Substitui aquele caso chato onde você quer um label em milissegundos, local, com uma confiança que dá pra cortar num limiar em vez de cruzar os dedos.

Os tradeoffs, escritos preto no branco :
- encoder -> contagem de palavras : 7 pontos a menos, latência dividida por 1000, infra zerada
- modelão único -> plugins npm : gate mais grosso, ops infinitamente mais simples
- geração -> decisão tipada : chega de parsing que quebra e opções inventadas
- confiança bruta -> pré-triage : abstain primeiro, automação acima de 0.85, humano pro resto

**As 3 coisas pra levar :**

1. **7 pontos a menos, 1000x mais rápido** -- 0.61/0.69 vs 0.75-0.80, mas <1ms/20ms CPU offline contra 25s CPU ou API paga. Um score sem seu custo não quer dizer nada.
2. **Roteador simples + especialistas separados** -- `hits / sqrt(keywords)`, threshold, `unknown`. Cada plugin treina, versiona e shippa sozinho. Em mail, TF-IDF cola no MiniLM : GPU não serve pra nada aqui.
3. **Offline-first com calibração honesta** -- `npm i`, pesos embutidos, 0 GPU, ECE < 0.14, abstain, drift tool. A única stack do comparativo que segura um game loop a 35Hz sem GPU.

Se o projeto te interessa, está tudo em MIT em [github.com/sabaki-js](https://github.com/sabaki-js). A versão acadêmica com medições e bibtex é o [preprint v1](/assets/paper/sabaki-organizational-moe-typed-decisions.pdf). E se você quer ver o Golias jogando Doom de verdade, vai pra [azalio/doomLaya](https://github.com/azalio/doomLaya) xD
