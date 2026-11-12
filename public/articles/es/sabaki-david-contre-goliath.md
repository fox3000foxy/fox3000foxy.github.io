---
title: "Sabaki vs System One: David contra Goliat, el modelo de decisión más pequeño del mundo"
description: "20KB contra 421M parámetros. Sabaki pierde 7 puntos en typed-decisions pero pasa de 25s en CPU a menos de 1ms offline. Anatomía de un MoE organizacional."
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
author_sig: "381Tj6vbmaUc2VcUUY1CxHPlcORPvCKqcHfUkDIABO/eaUk59izYPPIXlhbPCmjw6o8bhd9kYMjn2VNaedDuWg=="
---

## Introducción

Si te pasas por Hacker News o Twitter desde septiembre, seguro que has visto a Jev.

El 15 de septiembre de 2026, TypeSafe saca Jev, su primer "System One". El pitch cabe en una frase: deja de pedirle a un LLM que genere JSON para elegir una etiqueta. Pásale un `state` más unas preguntas tipadas, y te devuelve decisiones tipadas con sus probas. Una pasada, cero tokens que muestrear, nada que parsear después.

Lo petó. Primer día de adopción récord en Vercel AI Gateway, cinco clientes Elixir en pocos días, todo el mundo bencheando Jev contra su invento. Y la verdad es que el hype se entiende. Llevábamos años apañándonos con prompts de `responde SOLO con {"choice": ...}` rezando para que el modelo no se inventara una opción, no rompiera el JSON, no alucinara un campo. Jev le puso nombre a esa necesidad y lo sirvió en una API limpia: `POST /v1/systemone`, preguntas `choice / score / noul`, respuestas con `probabilities` + `confidence`.

Me encantó la idea. El modelo eco, menos -- y para que quede claro, nunca pagué por Jev.

Porque por detrás, Jev sigue siendo una API cerrada. Pesos desconocidos, sin self-host, cada decisión = un viaje de ida y vuelta por red + un contador que corre. Y las alternativas open que llegaron después se van a los 400M de parámetros con GPU obligatoria.

Así que construí el otro extremo: [Sabaki](https://sabaki.fox3000foxy.com/). Un router por palabras clave + una regresión logística en TypeScript puro que habla el mismo contrato que Jev (mismas formas `choice / score / noul`, mismo endpoint `/v1/systemone`), pero que corre en **menos de 1ms** con **20 kilobytes** de JSON. Cero dependencias en modo nano, offline, 0€.

Para ubicarte: Laya son 843 MB de safetensors que cargar. OpenDecider-nano son 2 GB de RAM. Sabaki nano invoices son 20 KB. La relación en peso ronda los **40 000**.

Si quieres la versión seria y con números, tienes el preprint v1 de octubre de 2026 en el sitio: *Sabaki: An Organizational Mixture-of-Experts for Typed Decisions on CPU* ([PDF](/assets/paper/sabaki-organizational-moe-typed-decisions.pdf)). Diseño, medidas, tradeoffs, todo está ahí. Este artículo es la versión legible, con el código abierto al lado.

No lo escribí en mi rincón en plan benchmark de papel. Contribuyo a [azalio/doomLaya](https://github.com/azalio/doomLaya) (mi fork: [fox3000foxy/doomLaya](https://github.com/fox3000foxy/doomLaya)), un harness donde Laya y Jev juegan de verdad a FreeDoom con decisiones model-owned, telemetría por tick y vídeos. Vi jugar a Goliat en vivo, y en cuanto la red tose, él también.

Vamos a abrir los motores uno por uno. Como siempre, con el código de verdad.

## El ring donde todos aceptan pelear

Hay un solo dataset que citan Jev, Laya y OpenDecider: [LocalLLaMA/typed-decisions](https://huggingface.co/datasets/LocalLLaMA/typed-decisions). 4 workflows sintéticos (soporte, facturas, seguridad, trazas de agentes), 5 preguntas por caso, 1200 casos de train, 400 de test, 2000 decisiones.

| Modelo | Params | Score test | Latencia | Dónde corre |
|---|---|---|---|---|
| OpenDecider-nano | ~400M | 0.796 | 17ms GPU | GPU, 2 GB RAM |
| Laya typed-decisions | 421M | 0.766 | ~25s/state CPU, ~830ms/caso MLX | GPU |
| Jev 1.13 | cerrado | ~0.73-0.75 | ~710ms API | solo API |
| **Sabaki mini** | 22M int8 | **0.69** | **~20ms CPU** | CPU, 22 MB |
| **Sabaki nano** | ~0 | **0.61** | **<1ms** | en todas partes |
| Laya base cero-shot | 421M | 0.362 | igual | GPU |

El azar es 0.318, la mayoría 0.461. O sea que Laya base con 0.362 sin fine-tune está al nivel de "respondo al azar siendo educado". Quédate con eso, te va a servir.

7 puntos separan a Sabaki del mejor. 1000x de latencia los separan en la otra dirección cuando no tienes GPU. Todo el artículo en dos frases, el resto es para entender por qué.

Ojo de todos modos: detrás de la misma toma `choice / score / noul`, las cocinas no tienen nada que ver. Jev = API cerrada. Laya = ModernBERT-large fine-tuneado. OpenDecider = Ettin-encoder destilado. Sabaki = conteo de palabras + MiniLM int8. Mismo contrato, presupuestos incomparables.

## Jev, la bofetada que todos vieron pasar

Hay que darle a TypeSafe lo que es de TypeSafe: el contrato System One es una idea muy buena de verdad.

Antes, para clasificar un ticket, hacías esto: le pedías a un LLM "elige entre billing, technical y spam, responde en JSON", parseabas la respuesta, gestionabas los casos en los que responde "¡Yo diría billing! 😊" o se inventa una cuarta categoría. Cada pregunta costaba tokens, cada respuesta podía romperte el pipeline.

Jev cambia el trato: envías el texto + unas preguntas con sus criterios, evalúa cada pregunta en paralelo y te devuelve un valor tipado con su distribución.

```bash
curl https://api.typesafe.ai/v1/systemone \
 -H "Authorization: Bearer $KEY" \
 -H 'content-type: application/json' \
 -d '{"state":"charge double ce mois-ci","questions":{"dept":{"type":"choice","instructions":"Route ce message.","criteria":{"billing":"paiements","technical":"bugs"}}}}}'
```

Respuesta: `{ choice, probabilities, confidence }`. Nada de texto libre. Tu código puede engancharse ahí directo.

Por eso se hizo viral: SDK Python + JS, plugin de Claude Code, integración con LangChain, todo el mundo podía conectar sus agentes en una tarde. La doc de TypeSafe incluso empuja el patrón sano: Jev para los juicios rápidos pequeños, código determinista alrededor para componer la decisión de verdad, LLM lento o humano en cuanto la confianza baja.

El problema es lo demás. Pesos cerrados, offline imposible, precio por llamada. Para un agente que toma 100 decisiones por run, el impuesto pica. Para Doom a 35 ticks/s, está muerto: en doomLaya, Jev termina MAP01 seed 48 en 68.97s con un p50 HTTP de 357ms. El run reporta $0.0046 de coste API -- no es mi factura, es la del benchmark. Funciona, el run sale limpio, sin muertes. Pero 357ms a 35 ticks/s son 12 ticks en los que el juego sigue mientras esperas la red.

Sabaki copió exactamente ese contrato -- mismas preguntas, mismas respuestas, mismo endpoint `/v1/systemone` servido por `serve()` -- quitando todo lo que pide un datacenter.

## Laya, el grande open que demostró que se podía sin API

[Laya](https://github.com/NandhaKishorM/laya) por Convai Innovations, Apache-2.0. Bajo el capó: ModernBERT-large, 421M, con 1 token `[MASK]` por opción. El hidden state de cada marcador pasa por un pequeño MLP, softmax sobre las opciones de la pregunta. Una pasada por pregunta, como Jev.

```python
pipe = pipeline("text-classification", model="convaiinnovations/laya-typed-decisions")
```

El 0.766 merece que nos paremos. Es el checkpoint **fine-tuneado sobre el train del benchmark**: 1200 casos, RLCD con ruido gaussiano sobre los logits, reward log + spherical. El mismo modelo sin ese ajuste cae a 0.362. O sea que adivina. Así que el score de Laya es "encoder grande + entrenamiento en el dominio", no "encoder grande mágico".

En CPU, es un ladrillo. El port ONNX medido ronda los 25s por state. En MLX FP16, cuenta unos 830ms por caso de media con un p99 de 5.3s. Y hay que cargar 843 MB antes de responder nada.

En doomLaya, la Laya stock falla MAP01 en 180s. La v3 adaptada ([azalio/laya-doom-v3](https://huggingface.co/azalio/laya-doom-v3)), reentrenada con Doom, sale en 61.43s con p50 de 108ms en MPS, recogiendo la escopeta por el camino. O sea que sí, juega -- después de un entrenamiento dedicado, sobre GPU de Apple, con un ejecutor scripteado que hace el trabajo de verdad (A*, puertas con latch de 15 ticks, apuntado auto).

Mi resumen: sin entrenamiento en tu tarea, Laya te sirve de pisapapeles de 421M. Con él, es muy fuerte, pero necesitas la GPU y los datos que van con ella.

## OpenDecider, el que ganó el leaderboard

[OpenDecider](https://github.com/manjunathshiva/opendecider), es Manjunath que decidió ir a por todos en su propio benchmark. Resultado: **0.796** con un Ettin-encoder-400m full fine-tune + cabeza MLP, loss KL sobre soft targets destiladas de Qwen3-235B + DeepSeek.

```bash
pip install opendecider
# 17ms/pregunta en L40S, 18ms en M4 Max, ~9ms en batch
```

Con 50% de coverage, la selective accuracy sube a 0.943 contra 0.882 para Jev. Sobre el papel, lo mejor de los dos mundos: open, calibrado, rápido.

En la práctica: 2 GB de RAM para cargar nano, GPU obligatoria para aguantar los 17ms, phishing en 0.63 contra 0.90 para Jev (el OOD lo barre), y como Laya, entrenado sobre el train del benchmark. El test nunca se vio, pero el dominio sí.

Gana el pulso, pero siguen siendo 400M con una GPU detrás. No lo metes en un Worker de Cloudflare ni en un game loop en un portátil.

## Los 150M, y el hueco por debajo

openJev-verdict-2.0 (151M), julia-1 (144M multilingüe), Open Jev (150M), Largha-150M (144M en+zh), Vela (0.3B-9B). Todos ModernBERT o mmBERT-small, todos capaces de correr en CPU, todos majos de entrenar (Open Jev anuncia 30min en un T4 de Colab). Cifras self-reported, protocolos distintos, así que tómalas con pinzas, pero la familia existe.

El generalist de Sabaki hace **22.7M**. Unas 6.5x más pequeño que el más chico de esa banda. Nadie más baja de los 100M para responder preguntas definidas en runtime.

Eso es "el más pequeño del mundo": no la mejor nota, la envoltura más pequeña que lee tus `instructions` + `criteria` y decide cuando ningún especialista sabe responder.

## Sabaki, el router tonto y sus expertos desechables

Vale, ya hablamos bastante de los grandes. Pasemos a David, porque aquí es donde se pone divertido.

Sabaki no intenta ser un modelo grande y listo que entiende el mundo. Es un MoE organizacional: 1 router sparse a nivel sistema, expertos independientes, uno solo activo por input. Cada plugin es un paquete npm separado, con su manifest, sus pesos, su versión. Solo instalas lo que ruteas.

La org [sabaki-js](https://github.com/sabaki-js): 13 repos, el core `sabaki` (129 commits), 6 plugins `@sabaki-js/*`, los pesos, el worker de Cloudflare, la plantilla para escribir el tuyo.

El `package.json` del core ya cuenta la historia:

```json
"dependencies": { "@typesafe-ai/sdk": "^0.7.0" },
"optionalDependencies": { "onnxruntime-node": "^1.22.0" }
```

En modo nano, cero dependencias runtime. Solo TypeScript compilado, nada que instalar, nada que pueda romperse entre dos versiones de ONNX.

### El router, o cómo decidir en pocas líneas

El router vive en `src/index.ts`, y la tokenización se ve así (`src/index.ts:129`):

```ts
function tokens(s: string): string[] {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/).filter((w) => w.length > 3);
}
```

Minúsculas, acentos fuera, palabras de 4 letras mínimo. Ese filtro quita todo el ruido ("le", "de", "ok"). En tickets de soporte, lo cambia todo porque tu matching se hace sobre palabras que aportan significado.

El scoring en sí está en `route()` (`src/index.ts:251`), y ahí es donde se juega todo:

```ts
const hits = kws.filter((k) =>
  words.some((w) => w.includes(k) || k.includes(w))).length;
const score = hits / Math.sqrt(kws.length);
```

Matching laxo en ambos sentidos: `billing` caza `billed`, `invoice` caza `invoicing`. Dividir por la raíz evita penalizar las listas grandes de keywords, si no el plugin de mail con sus 600 palabras aplastaría a todos en cuanto un mail contenga "hello".

Cada plugin tiene su umbral, 0.15 por defecto guardado en `src/index.ts:139`, mail en 0.03 porque los asuntos son cortos. Por debajo:

```ts
return { domain: "unknown", decision: null, confidence: 0, plugin: null };
```

Dominio desconocido = `unknown`, nunca un invento para quedar bien. Es tonto a propósito, y justo eso hace que el umbral `automate > 0.8` sea usable después: cuando Sabaki responde, es porque un especialista de verdad hizo match.

Hay un eje de idioma extra vía `langid`: un plugin que declara `languages` solo compite para sus idiomas. Práctico para separar phishing latino y CJK. Texto demasiado corto = sin filtro, compiten todos.

Coste total: unos microsegundos por decisión. Ninguna matriz que multiplicar, ninguna red que llamar, solo comparaciones de strings y una división.

### Nano, mi archivo favorito del repo

`src/logreg.ts:28`, la tokenización:

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

Unigramas + bigramas. `charged twice` da `charged`, `twice`, y el par `charged twice`. Justo lo que hace falta para cazar "doble cobro" sin sacar un transformer de 400M.

`src/logreg.ts:46`, la vectorización, donde el TF-IDF hace su trabajo:

```ts
const tf = 1 + Math.log(c);  // TF sublineal
const val = tf * w.idf[i]!;  // IDF suavizado estilo sklearn
```

La décima aparición de una palabra cuenta menos que la primera, las palabras raras pesan más que "please". Exactamente la receta de sklearn, paridad exacta verificada en 20 preguntas.

Y el comentario que me hizo sonreír releyendo:

```ts
// Toca solo los términos presentes (disperso) en vez de barrer 3000 dims.
for (const [t, c] of counts) {
```

En vez de barrer 3000 dimensiones en cada ticket, solo tocas la veintena de palabras presentes. Por eso responde en menos de 1ms. Es el tipo de detalle invisible que lo cambia todo en prod, porque la complejidad sigue el tamaño del ticket y no el del vocabulario.

`src/logreg.ts:86`, la inferencia, que cabe en tres líneas:

```ts
// binario: 1 línea de coefs + sigmoide
const pPos = 1 / (1 + Math.exp(-s));
// multiclase: producto escalar + softmax, argmax
```

Un producto escalar, una sigmoide o un softmax según el número de clases. Una pasada y listo. Cero tokens generados, o sea cero JSON roto que arreglar después con reintentos y heurísticas de parseo.

Receta `train.py`: 300 train / 100 test por workflow, split determinista (1 de cada 5 ítems en test para evitar sesgo temporal), vocab 3000-6000, coefs redondeados a 1e-4 con cero pérdida medida. Export JSON `{ vocab, idf, questions }`.

Pesos: 20 KB para invoices (`duplicate` 0.89) hasta 650 KB para mail (`bucket` 0.889). El tipo de tamaño que entra en un bundle frontend.

El detalle que me dejó loco: en mail, MiniLM empata con TF-IDF en +/-0.02. O sea que nano se sirve tal cual. Pagar una GPU para clasificar mails, paso. En cambio agent_trace se atasca (`needs_review` 0.59 en nano): el texto de observabilidad es pobre, ninguna palabra sostiene de verdad la decisión.

La fábrica que convierte pesos en plugin, en `src/plugin.ts:52`:

```ts
export function nanoClassifier(manifest, weights, opts = {}) {
  return definePlugin({ manifest,
    classify: (input) => {
      const r = predict(`${from}${input.state}`, weights, q);
      return { decision: r.decision, confidence: r.confidence, domain: manifest.domain };
    }});
}
```

`decide()` sigue síncrono en nano, `decideAsync()` desbloquea ONNX para mini. Dos caminos, una regla simple: si necesitas async es que quieres mini, si no nano basta. Fácil de recordar cuando programas, fácil de depurar cuando se rompe.

Para enseñarte que no es solo teoría, así se ve un uso real:

```ts
import { Sabaki } from "sabaki";
import customerService from "@sabaki-js/customer-service";

const sabaki = new Sabaki().register(customerService);
sabaki.decide({ state: "charged twice, refund please" });
// { decision: "billing", confidence: 0.31, domain: "customer_service" }
```

### Mini, 22 MB que cambian el juego en los casos duros

Nano tiene sus límites, lo viste con agent_trace justo arriba. MiniLM-L6 toma el relevo: un encoder compartido para todo el dominio, más una cabeza lineal por pregunta. Fine-tune end-to-end durante 8-12 epochs, lr 2e-5, en GPU CUDA para el entrenamiento (la inferencia sigue en CPU, que es lo que cuenta).

Las cifras que decidieron, medidas sobre los mismos splits:
- encoder congelado + MLP: 0.65
- full fine-tune: 0.68
- destilación 400M hacia embeddings congelados: probada, descartada, peor que las gold labels

Export ONNX vía dynamo, paridad exacta verificada, luego cuantif dinámica int8: 90 MB -> 22 MB, **-0.004 accuracy** en customer_service. ECE igual o mejor. Cada export se vuelve a medir, si no la optimización no significa nada.

Desde la 1.0.2, los pesos vienen dentro del paquete (`models/<workflow>-int8/` + `modelDir` exportado). Basta con `npm i`, modo avión OK. Actualizar = publicar un patch, firmado vía trusted publishing.

En concreto: `needs_review` pasa de 0.59 a **0.82**. `disposition` 0.73 -> 0.76. ECE < 0.14 en todas partes, con una duda OOD sana (0.2-0.5 en dragons, recetas y strings vacíos). Esa duda es la que permite el umbral agresivo en prod.

### Generalist, el catch-all que hace que Sabaki sea de verdad System One

Jev y los demás responden a todo: cualquier pregunta, cualquier opción, definidas en runtime. Ese es el contrato System One que hizo viral a Jev, pones tus `instructions` + `criteria` con tus opciones, y decide.

Los especialistas Sabaki no saben hacer eso. Conocen sus preguntas (`category`, `duplicate`, `bucket`) y nada más. Sin red, Sabaki devolvería `unknown` en cuanto te sales del guion, donde Jev siempre responde algo.

El generalist es esa red. Un cross-encoder que lee pregunta + opción + state y saca una nota, una pasada por opción, softmax, argmax. 22.7M MiniLM int8, 6.5x más pequeño que los 144-151M de la banda. Pero su trabajo no es la nota, es la compatibilidad: con él conectado en fallback, `POST /v1/systemone` acepta cualquier state y cualquier pregunta, como Jev. El campo `model` dice quién respondió de verdad (`@sabaki-js/mail@1.1.2+mini`, `sabaki-generalist-v1`...), así que del lado del llamante no cambias nada.

Y sobre todo, es un fallback, no un jefe. Regla de oro en `decideAsync()`: si un especialista gana el ruteo, responde él. El generalist solo habla en `unknown`. Nunca al revés. Así evitas que un generalista mediocre aplaste a un especialista bueno en su dominio.

El loader vive en `src/generalist.ts`, con caché por carpeta para no recargar la sesión ONNX en cada llamada:

```ts
export function loadGeneralist(modelDir: string) {
  // caché por carpeta, sesión ONNX reutilizada
  // tokenizer.json -> Unigram o wordpiece, detectado auto
  const sess = await ort.InferenceSession.create(
    path.join(modelDir, "generalist.onnx"),
    { intraOpNumThreads: 2 },
  );
}
```

Apuntas `SABAKI_GENERALIST_DIR` a una carpeta con `generalist.onnx` + `tokenizer/`, el modelo es intercambiable. El id viene de `config.json`, si no `"sabaki-generalist"`. La caché `Map` evita recargar la sesión en cada llamada.

El formato de entrada es cross-encoder clásico: pregunta, opción y state concatenados con separadores, una línea por opción a puntuar:

```ts
const texts = options.map(
  (o) => `${input.question ?? "decision"} [SEP] ${o} [SEP] ${input.state}`,
);
```

Pregunta + opción + state, separados por `[SEP]`, una línea por opción. Opciones capadas a 8 (`slice(0, 8)`), por defecto `["yes", "no"]` si no das nada. Más allá, toca trocear del lado del llamante, 8 ya es amplio para una decisión tipada.

Luego viene el batch listo, el tipo de optimización que parece poca cosa pero divide la latencia por el número de opciones. En vez de un `session.run` por opción, todo sale en un solo forward:

```ts
// Un solo forward en batch para todas las opciones
// (rellenado a la longitud máxima) en vez de un run por opción.
const L = Math.max(...encs.map((e) => e.ids.length));
// ids + attention_mask en [options.length, L], padding con padId
const out = await sess.run({ input_ids, attention_mask });
const scores = Array.from(out["score"].data).map(Number);
```

Cada texto se codifica (wordpiece estilo BERT o unigram SentencePiece según `tokenizer.json`), se rellena a la longitud máxima del batch, se apila en un tensor `[nb_opciones, L]`. Un solo `sess.run`, recuperas una nota por opción. En CPU lo cambia todo: 20-36ms en vez de 8x ese tiempo.

Después viene el softmax + argmax, con las probas completas para cada opción, exactamente en el formato que popularizó Jev:

```ts
const pr = softmax(scores);
// bi = índice del máximo
const confidence = Math.round(pr[bi] * 1000) / 1000;
const probs = Object.fromEntries(
  options.map((o, i) => [o, Math.round(pr[i] * 1000) / 1000]),
);
```

Y el detalle que hace que esto sirva en prod en vez de quedarse en demo es `abstainAt`:

```ts
if (input.abstainAt !== undefined && confidence < input.abstainAt) {
  return { decision: null, confidence, domain: "generalist", probabilities: probs };
}
```

Opt-in, sin abstención por defecto. Pasas `abstainAt: 0.6-0.7` y todo lo flojo devuelve `null` en vez de una adivinanza. Como el softmax escupe 1.00 incluso cuando falla fuera de distribución, no es un lujo. La GUÍA lo recomienda para todo uso autónomo: bajo el umbral, pides una aclaración en vez de autoresolver.

Para terminar, el mismo montaje con el fallback generalist: cuando ningún especialista hace match, él toma el relevo en vez de devolver `unknown`.

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
// especialista mail si el ruteo hace match, si no generalist en catch-all estilo Jev
```

Las generaciones del generalist, todas medidas igual en PhishNChips (2000 mails) y en el test typed-decisions para comparar lo comparable:
- v4: 0.29 test, R=0.026 phishing. Para tirar, respondía al lado.
- A (22M 80k): 0.546, R=0.406. Empieza a parecerse a algo.
- mini v1 servida: **0.536, R=0.616**. Es la que corre en el sitio. Recall de phishing correcto, test medio.
- B (144M scratch): 0.568, R=0.062. Más grande, apenas mejor en test, nulo en phishing.

El 144M from scratch que no transfiere mejor me curó la idea de "meter más params para generalizar". A igual tarea, el grande cuesta más sin adivinar mejor. Hasta como catch-all, el pequeño hace el trabajo. Y sigue EN-only (`all-MiniLM-L6-v2`), ruteo EN, FR fuera de distribución. Para FR, toca pasar por un especialista entrenado en eso, no por el generalist.

## Doom, el único test que de verdad me importa

doomLaya es Laya y Jev jugando a FreeDoom de verdad. El modelo elige `command / target / weapon`, el ejecutor traza el camino A*, abre las puertas, apunta, clickea. Telemetría por tick, vídeos, SHA de los runs. Contribuyo ahí, así que no hablo de un leaderboard leído de lejos.

v0.1.0, MAP01 seed 48, skill 3, 35 ticks/s, mismo ejecutor:

| Modelo | Resultado | p50 HTTP | Coste API |
|---|---|---|---|
| Laya stock | fallo 180s | 106ms | $0 |
| Laya v3 adaptada | salida 61.43s | 108ms | $0 |
| Jev 1.13 | salida 68.97s | 357ms | $0.0046 |

Dos salidas limpias, sin muertes, con Laya recogiendo la escopeta por el camino porque el ejecutor gestiona el pickup solo. Honestidad obliga: Laya v3 se entrenó con Doom, Jev no. Una seed, un mapa, no prueba nada general. El README del proyecto lo dice en negro sobre blanco, y es de agradecer que no infle el resultado.

Lado Sabaki ([plugin-doom](https://github.com/sabaki-js/plugin-doom)): ViZDoom en Python que llama a un servidor JS en cada tick. Nano ~18k req/s, mini ~71 req/s en un hilo i5. El tick a 35Hz pasa sobrado, hasta en un portátil medio.

Con brújula de salida, mini sale de MAP01 en 2-4 runs de 6, nano 0/6. Lógico: el texto pierde lo espacial, los estados doomLaya se estancan hacia 0.57 ya sea MiniLM o ModernBERT-base. Cuando falta la info espacial, ningún clasificador de texto la reinventa.

Los vecinos repitieron el partido con los mismos datos: [doomgemma](https://github.com/dexmac221/doomgemma) mete una LoRA de 27min en una RTX 4070 y lleva a Gemma 4 E2B al nivel de Laya v3 en juego (6/6 vs 6/6) y por encima en decisiones aisladas. A igual tamaño, un decoder va tan rápido como Laya (270M: 22ms vs 23ms). A igual resultado, Laya sigue ~3x más rápida porque lo logra con un modelo más pequeño.

Mi lectura: el entrenamiento en la tarea cuenta más que la arquitectura. Un especialista pequeño entrenado le gana a un generalista grande que descubre. Exactamente la apuesta de Sabaki. El paper que sigue, *System Switch* ([arXiv:2610.09683](https://arxiv.org/abs/2610.09683)), lleva la lógica hasta el final: modelo pequeño y rápido que juega, modelo grande razonador que retoma cuando se abre una gate. El pre-triage de Sabaki (`automate > 0.85 si no escala`) aplicado al juego.

## Lo que se sacrificó

Cada feature ausente financia otra, esa es la regla del juego cuando apuntas a CPU. La lista honesta, como para Bareiron donde cada línea de C era un tradeoff:

**Sabaki no cuenta historias.** Decide entre opciones que tú le das, con una proba. Para una explicación, un resumen, texto libre, coge un LLM.

**El francés sigue fuera de distribución para el generalist.** Ruteo EN (`all-MiniLM-L6-v2`), sonda 1/4 FR vs 3/4 EN en casos similares. El plugin mail viene de una empresa mayormente FR pero anonimizada: 0 PII, -0.024 accuracy por un vocab sin términos personales. La anonimización se paga, pero no era negociable.

**El softmax se muestra demasiado seguro cuando sale de su zona.** Falsos en 1.00 observados, sí. De ahí el pre-triage recomendado en la GUÍA: `abstainAt: 0.6-0.7` para devolver `null` bajo el umbral, luego gate `confidence > 0.85` para automatizar, humano si no. Referencia medida: recall de phishing 0.62 con precisión 0.87. Para partir la cola en dos, no para despedir reviewers.

**Nano sufre con las trazas de agentes.** 0.34 a 0.59 según la pregunta. Mini sube `needs_review` a 0.82, pero `risk / urgency / action` siguen duros. El texto de observabilidad es simplemente pobre en señales léxicas.

**Doom en texto se estanca.** Hacia 0.57, MiniLM como ModernBERT-base. Mientras sigas en texto sin píxeles, MAP02 te frena. La vía creíble para un jugador de verdad es visión + RL (tiny-doom-defender, 1.1M params desde píxeles), no un mejor clasificador de texto.

**El benchmark deriva por batches.** typed-decisions se genera por hornadas, el split temporal es en realidad un split de batches. `drift_tool.py` saca 0.82 en customer_service, 0.67 en agent_trace (0.5 = indistinguible). Consecuencia medida: los pesos publicados hacen 0.733 en mixto vs 0.61 en split oficial. La cifra oficial es por tanto conservadora. La calibración Platt / temperature+bias no transfiere entre batches, así que solo servimos el temperature scaling calibrado en batches recientes. Regla de la casa: `drift_tool.py` primero, warn por encima de 0.6, block por encima de 0.8. Nadie más publica esto, todos deberían.

## El resultado final, números en mano

De un lado un i5 de portátil, del otro una API que cobra por llamada. Esto es lo que da cada modo en concreto:

- nano: <1ms, ~18k req/s, 20-650 KB, 0 dep
- mini: ~20ms, ~71 req/s, 22 MB int8, onnxruntime en opcional
- generalist: 20-36ms, 22.7M, el generalista open más pequeño que conozco

Varios dominios cargados: ~0.5 GB RAM en lazy-load por dominio en vez de ~2 GB para todo. Determinista: 100/100 inputs idénticos dan el mismo output. Umbrales por pregunta, gate sobre `confidence`, `unknown` cuando nada hace match.

En Bareiron, correr 3+ jugadores se arrastraba porque cada jugador costaba un chunk a 200ms. Aquí correr 3+ dominios pasa sin despeinarse, porque cada experto es minúsculo y se carga bajo demanda en vez de cargarlo todo de golpe. Misma filosofía del "pequeño que basta", aplicada a otro hardware.

## La filo

p2r3 decía: *"Me encanta la idea de que ese chip diminuto de 1 dólar pueda correr algo tan avanzado como Minecraft."*

Mismo rollo aquí: me encanta la idea de que 20 KB de JSON y un centenar de líneas de TS reemplacen una llamada GPU para elegir una etiqueta. Obvio que no reemplaza todo, no nos flipemos. Reemplaza ese caso pesado donde quieres una etiqueta en milisegundos, en local, con una confianza que puedes umbralizar de forma razonable en vez de cruzar los dedos.

Los tradeoffs, escritos en negro sobre blanco:
- encoder -> conteo de palabras: 7 puntos menos, latencia dividida por 1000, infra a cero
- modelo grande único -> plugins npm: gate más gruesa, ops infinitamente más simples
- generación -> decisión tipada: se acabó el parseo que se rompe y las opciones inventadas
- confianza bruta -> pre-triage: abstain primero, automatización por encima de 0.85, humano para el resto

**Las 3 cosas que recordar:**

1. **7 puntos menos, 1000x más rápido** -- 0.61/0.69 vs 0.75-0.80, pero <1ms/20ms CPU offline contra 25s CPU o API de pago. Un score sin su coste no significa nada.
2. **Router simple + expertos separados** -- `hits / sqrt(keywords)`, threshold, `unknown`. Cada plugin se entrena, se versiona y se sirve solo. En mail, TF-IDF empata con MiniLM: la GPU no pinta nada aquí.
3. **Offline-first con calibración honesta** -- `npm i`, pesos incluidos, 0 GPU, ECE < 0.14, abstain, drift tool. El único stack de la comparativa que aguanta un game loop a 35Hz sin GPU.

Si el proyecto te interesa, todo está en MIT en [github.com/sabaki-js](https://github.com/sabaki-js). La versión académica con medidas y bibtex es el [preprint v1](/assets/paper/sabaki-organizational-moe-typed-decisions.pdf). Y si quieres ver jugar a Goliat en Doom de verdad, rumbo a [azalio/doomLaya](https://github.com/azalio/doomLaya) xD
