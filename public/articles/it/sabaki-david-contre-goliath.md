---
title: "Sabaki vs System One: Davide contro Golia, il più piccolo modello decisionale al mondo"
description: "20KB contro 421M parametri. Sabaki perde 7 punti su typed-decisions ma passa da 25s CPU a meno di 1ms offline. Anatomia di un MoE organizzativo."
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
author_sig: "XUIvA0F4O+rFvie735Y2b1FWGUQ5xA7APOzfebvg0ziQqv1dTytoX1uS8F7x2j5GiFv7vsqWvvXXdy82KqTJpA=="
---

## Introduzione

Se bazzichi Hacker News o Twitter da settembre, hai visto Jev per forza.

Il 15 settembre 2026, TypeSafe tira fuori Jev, il loro primo "System One". Il pitch sta in una frase: smettila di chiedere a un LLM di generare JSON per scegliere una label. Gli passi uno `state` più domande tipizzate, lui ti restituisce decisioni tipizzate con probabilità. Un passaggio, zero token da campionare, niente da parsare dopo.

È esploso. Primo giorno da record di adozione su Vercel AI Gateway, cinque client Elixir in pochi giorni, tutti a benchmarkare Jev contro la loro roba. E onestamente l'hype si capisce. Erano anni che rattoppavamo prompt tipo `rispondi SOLO con {"choice": ...}` pregando che il modello non inventasse un'opzione, non rompesse il JSON, non allucinasse un campo. Jev ha dato un nome a questo bisogno e lo ha shippato in un'API pulita: `POST /v1/systemone`, domande `choice / score / noul`, risposte con `probabilities` + `confidence`.

Ho adorato l'idea. Il modello economico, meno -- e per essere chiaro, non ho mai pagato per Jev.

Perché dietro, Jev resta un'API chiusa. Pesi sconosciuti, niente self-host, ogni decisione = un round-trip di rete + un contatore che gira. E le alternative open arrivate dopo viaggiano sui 400M di parametri con GPU obbligatoria.

Allora ho costruito l'altro estremo: [Sabaki](https://sabaki.fox3000foxy.com/). Un router a keyword + una regressione logistica in TypeScript puro che parla lo stesso contratto di Jev (stesse shape `choice / score / noul`, stesso endpoint `/v1/systemone`), ma gira in **meno di 1ms** con **20 kilobyte** di JSON. Zero dipendenze in modalità nano, offline, 0€.

Per capirci: Laya sono 843 MB di safetensors da caricare. OpenDecider-nano sono 2 GB di RAM. Sabaki nano invoices sono 20 KB. Il rapporto di peso sta intorno a **40.000**.

Se vuoi la versione quadrata e piena di numeri, c'è il preprint v1 di ottobre 2026 sul sito: *Sabaki: An Organizational Mixture-of-Experts for Typed Decisions on CPU* ([PDF](/assets/paper/sabaki-organizational-moe-typed-decisions.pdf)). Design, misure, tradeoff, c'è tutto. Questo articolo è la versione leggibile, con il codice aperto a fianco.

Non l'ho scritto nel mio angolo in modalità benchmark di carta. Contribuisco a [azalio/doomLaya](https://github.com/azalio/doomLaya) (il mio fork: [fox3000foxy/doomLaya](https://github.com/fox3000foxy/doomLaya)), un harness dove Laya e Jev giocano davvero a FreeDoom con decisioni model-owned, telemetria per tick e video. Ho visto Golia giocare dal vivo, e appena la rete tossisce, tossisce anche lui.

Apriamo i motori uno a uno. Come al solito, con il codice vero.

## Il ring dove tutti accettano di combattere

C'è un solo dataset che Jev, Laya e OpenDecider citano tutti: [LocalLLaMA/typed-decisions](https://huggingface.co/datasets/LocalLLaMA/typed-decisions). 4 workflow sintetici (supporto, fatture, sicurezza, tracce di agenti), 5 domande per caso, 1200 casi di train, 400 di test, 2000 decisioni.

| Modello | Params | Punteggio test | Latenza | Dove gira |
|---|---|---|---|---|
| OpenDecider-nano | ~400M | 0.796 | 17ms GPU | GPU, 2 GB di RAM |
| Laya typed-decisions | 421M | 0.766 | ~25s/state CPU, ~830ms/caso MLX | GPU |
| Jev 1.13 | chiuso | ~0.73-0.75 | ~710ms API | API only |
| **Sabaki mini** | 22M int8 | **0.69** | **~20ms CPU** | CPU, 22 MB |
| **Sabaki nano** | ~0 | **0.61** | **<1ms** | ovunque |
| Laya base zero-shot | 421M | 0.362 | uguale | GPU |

Il caso è 0.318, la maggioranza 0.461. Quindi Laya base a 0.362 senza fine-tune è il livello "rispondo a caso ma con educazione". Tienilo a mente, servirà.

7 punti separano Sabaki dal migliore. 1000x di latenza li separano nell'altro senso quando non hai una GPU. Ecco tutto l'articolo in due frasi, il resto serve a capire perché.

Attenzione però: dietro la stessa presa `choice / score / noul`, le cucine non c'entrano niente tra loro. Jev = API chiusa. Laya = ModernBERT-large fine-tunato. OpenDecider = Ettin-encoder distillato. Sabaki = conteggio di parole + MiniLM int8. Stesso contratto, budget incomparabili.

## Jev, lo schiaffo che hanno visto tutti

Bisogna dare a TypeSafe quel che è di TypeSafe: il contratto System One è davvero una bella idea.

Prima, per smistare un ticket, facevi così: chiedevi a un LLM "scegli tra billing, tecnico e spam, rispondi in JSON", parsavi la risposta, gestivi i casi in cui risponde "Direi billing! 😊" o inventa una quarta categoria. Ogni domanda costava token, ogni risposta poteva rompere la tua pipeline.

Jev cambia il deal: mandi il testo + domande con i loro criteri, lui valuta ogni domanda in parallelo e ti restituisce un valore tipizzato con la sua distribuzione.

```bash
curl https://api.typesafe.ai/v1/systemone \
 -H "Authorization: Bearer $KEY" \
 -H 'content-type: application/json' \
 -d '{"state":"charge double ce mois-ci","questions":{"dept":{"type":"choice","instructions":"Route ce message.","criteria":{"billing":"paiements","technical":"bugs"}}}}}'
```

Risposta: `{ choice, probabilities, confidence }`. Niente testo libero. Il tuo codice ci si attacca sopra diretto.

Ed è per questo che è diventato virale: SDK Python + JS, plugin Claude Code, integrazione LangChain, tutti potevano attaccarci i loro agenti in un pomeriggio. La doc TypeSafe spinge pure il pattern sano: Jev per i piccoli giudizi rapidi, codice deterministico intorno per comporre la vera decisione, LLM lento o umano appena la confidenza è bassa.

Il problema è il resto. Pesi chiusi, offline impossibile, prezzo a chiamata. Per un agente che prende 100 decisioni per run, la tassa punge. Per Doom a 35 tick/s è morto: in doomLaya, Jev esce da MAP01 seed 48 in 68.97s con un p50 HTTP a 357ms. Il run riporta $0.0046 di costo API -- non la mia fattura, quella del benchmark. Funziona, il run è pulito, senza morti. Ma 357ms a 35 tick/s fanno 12 tick in cui il gioco va avanti mentre tu aspetti la rete.

Sabaki ha rubato esattamente questo contratto -- stesse domande, stesse risposte, stesso endpoint `/v1/systemone` servito da `serve()` -- buttando via tutto quello che chiede un datacenter.

## Laya, il gigante open che ha mostrato che si poteva fare senza API

[Laya](https://github.com/NandhaKishorM/laya) di Convai Innovations, Apache-2.0. Sotto il cofano: ModernBERT-large, 421M, con 1 token `[MASK]` per opzione. L'hidden state di ogni marcatore passa in un piccolo MLP, softmax sulle opzioni della domanda. Un passaggio per domanda, come Jev.

```python
pipe = pipeline("text-classification", model="convaiinnovations/laya-typed-decisions")
```

Lo 0.766 merita che ci fermiamo un attimo. È il checkpoint **fine-tunato sul train del benchmark**: 1200 casi, RLCD con rumore gaussiano sui logit, reward log + spherical. Lo stesso modello senza quel fit crolla a 0.362. Praticamente tira a indovinare. Quindi il punteggio Laya è "grande encoder + allenamento sul dominio", non "grande encoder magico".

Su CPU è un mattone. Il port ONNX misurato gira intorno ai 25s per state. In MLX FP16, conta 830ms per caso in media con un p99 a 5.3s. E devi caricare 843 MB prima di rispondere a qualsiasi cosa.

In doomLaya, Laya stock fallisce MAP01 in 180s. La v3 adattata ([azalio/laya-doom-v3](https://huggingface.co/azalio/laya-doom-v3)), ri-allenata su Doom, esce in 61.43s con p50 108ms su MPS, raccogliendo lo shotgun al passaggio. Quindi sì, gioca -- dopo allenamento dedicato, su GPU Apple, con un esecutore scriptato che fa il vero lavoro (A*, porte con latch 15 tick, mira automatica).

Il mio riassunto: senza allenamento sul tuo task, Laya ti serve da fermacarte da 421M. Con quello, è molto forte, ma servono la GPU e i dati che vanno con lei.

## OpenDecider, quello che ha vinto la leaderboard

[OpenDecider](https://github.com/manjunathshiva/opendecider): Manjunath ha deciso di andare a prendere tutti sul loro stesso benchmark. Risultato: **0.796** con un Ettin-encoder-400m full fine-tune + testa MLP, loss KL su soft target distillati da Qwen3-235B + DeepSeek.

```bash
pip install opendecider
# 17ms/domanda su L40S, 18ms su M4 Max, ~9ms in batch
```

Al 50% di coverage, la selective accuracy sale a 0.943 contro 0.882 per Jev. Sulla carta, il meglio dei due mondi: open, calibrato, veloce.

In pratica: 2 GB di RAM per caricare nano, GPU richiesta per tenere i 17ms, phishing a 0.63 contro 0.90 per Jev (l'OOD lo asfalta), e come Laya, allenato sul train del benchmark. Il test non l'ha mai visto, ma il dominio sì.

Vince il braccio di ferro, ma restano 400M con una GPU dietro. Non lo infili in un Worker Cloudflare o in un game loop su un laptop.

## I 150M, e il buco sotto

openJev-verdict-2.0 (151M), julia-1 (144M multilingue), Open Jev (150M), Largha-150M (144M en+zh), Vela (0.3B-9B). Tutti ModernBERT o mmBERT-small, tutti capaci di girare su CPU, tutti simpatici da allenare (Open Jev dichiara 30min su un T4 Colab). Numeri self-reported, protocolli diversi, quindi da prendere con le pinze, ma la famiglia esiste.

Il generalist Sabaki fa **22.7M**. Circa 6.5x più piccolo del più piccolo della banda. Nessun altro scende sotto i 100M per rispondere a domande definite a runtime.

Ecco cosa vuol dire "il più piccolo al mondo": non il miglior punteggio, ma il guscio più piccolo che legge le tue `instructions` + `criteria` e decide quando nessuno specialista sa rispondere.

## Sabaki, il router scemo e i suoi esperti usa e getta

Ok, basta parlare dei grossi. Passiamo a Davide, perché è qui che diventa divertente.

Sabaki non prova a essere un grande modello furbo che capisce il mondo. È un MoE organizzativo: 1 router sparso a livello di sistema, esperti indipendenti, uno solo attivo per input. Ogni plugin è un package npm separato, con il suo manifest, i suoi pesi, la sua versione. Installi solo quello che routi.

L'org [sabaki-js](https://github.com/sabaki-js): 13 repo, il core `sabaki` (129 commit), 6 plugin `@sabaki-js/*`, i pesi, il worker Cloudflare, il template per scrivere il tuo.

Il `package.json` del core racconta già la storia:

```json
"dependencies": { "@typesafe-ai/sdk": "^0.7.0" },
"optionalDependencies": { "onnxruntime-node": "^1.22.0" }
```

In modalità nano, zero dipendenze runtime. Solo TypeScript compilato, niente da installare, niente che può rompersi tra due versioni di ONNX.

### Il router, o come decidere in poche righe

Il router vive in `src/index.ts`, e la tokenizzazione assomiglia a questo (`src/index.ts:129`):

```ts
function tokens(s: string): string[] {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/).filter((w) => w.length > 3);
}
```

Minuscole, accenti via, parole da 4 lettere minimo. Questo filtro butta via tutto il rumore ("le", "de", "ok"). Su ticket di supporto cambia tutto perché il tuo matching avviene su parole che portano un senso.

Lo scoring vero sta in `route()` (`src/index.ts:251`), ed è lì che si gioca tutto:

```ts
const hits = kws.filter((k) =>
  words.some((w) => w.includes(k) || k.includes(w))).length;
const score = hits / Math.sqrt(kws.length);
```

Matching lasco in entrambi i sensi: `billing` becca `billed`, `invoice` becca `invoicing`. La divisione per la radice evita di penalizzare le grosse liste di keyword, altrimenti il plugin mail con le sue 600 parole schiaccerebbe tutti appena una mail contiene "hello".

Ogni plugin ha la sua soglia, default 0.15 in `src/index.ts:139`, mail a 0.03 perché gli oggetti sono corti. Sotto:

```ts
return { domain: "unknown", decision: null, confidence: 0, plugin: null };
```

Dominio sconosciuto = `unknown`, mai un guess inventato per far piacere. È un approccio volutamente stupido, ed è esattamente quello che rende la soglia `automate > 0.8` usabile dopo: quando Sabaki risponde, è perché uno specialista ha matchato davvero.

C'è un asse lingua in più via `langid`: un plugin che dichiara `languages` concorre solo per le sue lingue. Comodo per separare phishing latino e CJK. Testo troppo corto = niente filtro, concorrono tutti.

Costo totale: qualche microsecondo per decisione. Nessuna matrice da moltiplicare, nessuna rete da chiamare, solo confronti tra stringhe e una divisione.

### Nano, il mio file preferito del repo

`src/logreg.ts:28`, la tokenizzazione:

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

Unigrammi + bigrammi. `charged twice` dà `charged`, `twice`, e la coppia `charged twice`. È tutto quel che serve per beccare "doppia fatturazione" senza tirare fuori un transformer da 400M.

`src/logreg.ts:46`, la vettorizzazione, dove il TF-IDF fa il suo lavoro:

```ts
const tf = 1 + Math.log(c);  // TF sublineare
const val = tf * w.idf[i]!;  // IDF smooth alla sklearn
```

La decima occorrenza di una parola conta meno della prima, le parole rare pesano più di "please". Esattamente la ricetta sklearn, parità esatta verificata su 20 domande.

E il commento che mi ha fatto sorridere rileggendo:

```ts
// Tocca solo i termini presenti (sparsi) invece di scansionare 3000 dimensioni.
for (const [t, c] of counts) {
```

Invece di scansionare 3000 dimensioni a ogni ticket, tocchi solo la ventina di parole presenti. Ecco perché risponde in meno di 1ms. È il tipo di dettaglio invisibile che cambia tutto in prod, perché la complessità segue la dimensione del ticket e non quella del vocabolario.

`src/logreg.ts:86`, l'inferenza, che sta in tre righe:

```ts
// binario: 1 riga di coefficienti + sigmoide
const pPos = 1 / (1 + Math.exp(-s));
// multiclasse: prodotto scalare + softmax, argmax
```

Un prodotto scalare, una sigmoide o un softmax secondo il numero di classi. Un passaggio ed è finita. Zero token generati, quindi zero JSON rotto da riparare dopo con retry ed euristiche di parsing.

Ricetta `train.py`: 300 train / 100 test per workflow, split deterministico (1 item su 5 in test per evitare il bias temporale), vocab 3000-6000, coefficienti arrotondati a 1e-4 con zero perdita misurata. Export JSON `{ vocab, idf, questions }`.

Pesi: 20 KB per invoices (`duplicate` 0.89) fino a 650 KB per mail (`bucket` 0.889). Il tipo di dimensione che ci sta in un bundle frontend.

Il dettaglio che mi ha steso: su mail, MiniLM incolla TF-IDF a +/-0.02. Quindi nano shippa così com'è. Pagare una GPU per smistare mail, proprio no. Invece agent_trace si inceppa (`needs_review` 0.59 in nano): il testo di osservabilità è povero, nessuna parola porta davvero la decisione.

La factory che trasforma pesi in plugin, in `src/plugin.ts:52`:

```ts
export function nanoClassifier(manifest, weights, opts = {}) {
  return definePlugin({ manifest,
    classify: (input) => {
      const r = predict(`${from}${input.state}`, weights, q);
      return { decision: r.decision, confidence: r.confidence, domain: manifest.domain };
    }});
}
```

`decide()` resta sincrono nano, `decideAsync()` sblocca ONNX per mini. Due strade, una regola semplice: se ti serve async è perché vuoi mini, altrimenti nano basta. Facile da ricordare quando codici, facile da debuggare quando si rompe.

Per mostrarti che non è solo teoria, ecco a cosa assomiglia un uso reale:

```ts
import { Sabaki } from "sabaki";
import customerService from "@sabaki-js/customer-service";

const sabaki = new Sabaki().register(customerService);
sabaki.decide({ state: "charged twice, refund please" });
// { decision: "billing", confidence: 0.31, domain: "customer_service" }
```

### Mini, 22 MB che cambiano le carte sui casi duri

Nano ha i suoi limiti, l'hai visto su agent_trace qui sopra. MiniLM-L6 riprende il testimone: un encoder condiviso per tutto il dominio, più una testa lineare per domanda. Fine-tune end-to-end per 8-12 epoche, lr 2e-5, su GPU CUDA per l'allenamento (l'inferenza resta CPU, è questo che conta).

I numeri che hanno deciso, misurati sugli stessi split:
- encoder congelato + MLP: 0.65
- full fine-tune: 0.68
- distillazione 400M verso embedding congelati: testata, buttata, peggio delle gold label

Export ONNX via dynamo, parità esatta verificata, poi quantizzazione dinamica int8: 90 MB -> 22 MB, **-0.004 accuracy** su customer_service. ECE invariata o migliore. Ogni export viene ri-misurato, altrimenti l'ottimizzazione non vuol dire niente.

Dalla 1.0.2, i pesi sono dentro il package (`models/<workflow>-int8/` + `modelDir` esportato). Basta `npm i`, modalità aereo OK. Aggiornare = pubblicare una patch, firmata via trusted publishing.

Concreto: `needs_review` passa da 0.59 a **0.82**. `disposition` 0.73 -> 0.76. ECE < 0.14 ovunque, con un dubbio OOD sano (0.2-0.5 su draghi, ricette e stringhe vuote). È questo dubbio che autorizza soglie aggressive in prod.

### Generalist, il catch-all che rende Sabaki davvero System One

Jev e gli altri rispondono a tutto: qualsiasi domanda, qualsiasi opzione, definita a runtime. Questo è il contratto System One che ha reso Jev virale -- tu posi le tue `instructions` + `criteria` con le tue opzioni, lui decide.

Gli specialisti Sabaki non sanno farlo. Conoscono le loro domande (`category`, `duplicate`, `bucket`) e niente altro. Senza rete, Sabaki restituirebbe `unknown` appena esci dal copione, dove Jev risponde sempre qualcosa.

Il generalist è questa rete. Un cross-encoder che legge domanda + opzione + state e tira fuori uno score, un passaggio per opzione, softmax, argmax. 22.7M MiniLM int8 -- 6.5x più piccolo dei 144-151M della banda. Ma il suo lavoro non è il punteggio, è la compatibilità: con lui attaccato come fallback, `POST /v1/systemone` accetta qualsiasi state e qualsiasi domanda, come Jev. Il campo `model` dice chi ha risposto davvero (`@sabaki-js/mail@1.1.2+mini`, `sabaki-generalist-v1`...), quindi lato chiamante non cambi niente.

E soprattutto, è un fallback, non un capo. Regola d'oro in `decideAsync()`: se uno specialista vince il routing, risponde lui. Il generalist parla solo su `unknown`. Mai il contrario. Così eviti che un generalista medio schiacci uno specialista bravo sul suo dominio.

Il loader vive in `src/generalist.ts`, con una cache per cartella per non ricaricare la sessione ONNX a ogni chiamata:

```ts
export function loadGeneralist(modelDir: string) {
  // cache per cartella, sessione ONNX riutilizzata
  // tokenizer.json -> Unigram o wordpiece, rilevato in automatico
  const sess = await ort.InferenceSession.create(
    path.join(modelDir, "generalist.onnx"),
    { intraOpNumThreads: 2 },
  );
}
```

Punti `SABAKI_GENERALIST_DIR` verso una cartella con `generalist.onnx` + `tokenizer/`, il modello è swappable. L'id viene da `config.json`, altrimenti `"sabaki-generalist"`. La cache `Map` evita di ricaricare la sessione a ogni chiamata.

Il formato di input è cross-encoder classico: domanda, opzione e state concatenati con separatori, una riga per opzione da scorare:

```ts
const texts = options.map(
  (o) => `${input.question ?? "decision"} [SEP] ${o} [SEP] ${input.state}`,
);
```

Domanda + opzione + state, separati da `[SEP]`, una riga per opzione. Opzioni cappate a 8 (`slice(0, 8)`), default `["yes", "no"]` se non dai niente. Oltre, devi spezzare lato chiamante -- 8 è già largo per una decisione tipizzata.

Poi arriva il batch furbo, il tipo di ottimizzazione che sembra niente ma divide la latenza per il numero di opzioni. Invece di un `session.run` per opzione, tutto parte in un solo forward:

```ts
// Un solo forward in batch per tutte le opzioni
// (paddato alla lunghezza max) invece di un run per opzione.
const L = Math.max(...encs.map((e) => e.ids.length));
// ids + attention_mask in [options.length, L], padding al padId
const out = await sess.run({ input_ids, attention_mask });
const scores = Array.from(out["score"].data).map(Number);
```

Ogni testo è encodato (wordpiece alla BERT o unigram SentencePiece secondo `tokenizer.json`), paddato alla lunghezza max del batch, impilato in un tensore `[nb_options, L]`. Un solo `sess.run`, e recuperi uno score per opzione. Su CPU cambia tutto: 20-36ms invece di 8x quel tempo.

Poi arriva il softmax + argmax, con le probabilità complete per ogni opzione, esattamente nel formato che Jev ha reso popolare:

```ts
const pr = softmax(scores);
// bi = indice del max
const confidence = Math.round(pr[bi] * 1000) / 1000;
const probs = Object.fromEntries(
  options.map((o, i) => [o, Math.round(pr[i] * 1000) / 1000]),
);
```

E il dettaglio che rende la cosa usabile in prod invece di restare una demo è `abstainAt`:

```ts
if (input.abstainAt !== undefined && confidence < input.abstainAt) {
  return { decision: null, confidence, domain: "generalist", probabilities: probs };
}
```

Opt-in, nessuna astensione di default. Passi `abstainAt: 0.6-0.7` e tutto ciò che è molle torna `null` invece di un guess. Visto che il softmax sputa 1.00 anche quando ha torto fuori distribuzione, non è un lusso. Il GUIDE lo raccomanda per ogni uso autonomo: sotto la soglia, chiedi un chiarimento invece di auto-risolvere.

Per finire, ecco lo stesso montaggio con il fallback generalist: quando nessuno specialista matcha, tocca a lui invece di restituire `unknown`.

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
// specialista mail se il routing matcha, altrimenti generalist come catch-all alla Jev
```

Le generazioni del generalist, tutte misurate uguali su PhishNChips (2000 mail) e sul test typed-decisions per confrontare ciò che è confrontabile:
- v4: 0.29 test, R=0.026 phishing. Da buttare, rispondeva a lato.
- A (22M 80k): 0.546, R=0.406. Comincia ad assomigliare a qualcosa.
- mini v1 servita: **0.536, R=0.616**. È quella che gira sul sito. Recall phishing corretta, test medio.
- B (144M scratch): 0.568, R=0.062. Più grosso, appena meglio in test, nullo in phishing.

Il 144M from scratch che non trasferisce meglio mi ha calmato parecchio sull'idea di "mettere più parametri per generalizzare". A parità di task, il grosso costa di più senza indovinare meglio. Anche come catch-all, il piccolo fa il lavoro. E resta EN-only (`all-MiniLM-L6-v2`), routing EN, FR fuori distribuzione. Per il FR devi passare da uno specialista allenato sopra, non dal generalist.

## Doom, l'unico test che conta davvero per me

doomLaya sono Laya e Jev che giocano davvero a FreeDoom. Il modello sceglie `command / target / weapon`, l'esecutore traccia il percorso A*, apre le porte, mira, clicca. Telemetria per tick, video, SHA dei run. Ci contribuisco, quindi non parlo di una leaderboard letta da lontano.

v0.1.0, MAP01 seed 48, skill 3, 35 tick/s, stesso esecutore:

| Modello | Risultato | p50 HTTP | Costo API |
|---|---|---|---|
| Laya stock | fallimento 180s | 106ms | $0 |
| Laya v3 adattata | uscita 61.43s | 108ms | $0 |
| Jev 1.13 | uscita 68.97s | 357ms | $0.0046 |

Due uscite pulite, senza morti, con Laya che raccoglie lo shotgun al passaggio perché l'esecutore gestisce il pickup da solo. Onestà vuole: Laya v3 è stata allenata su Doom, Jev no. Un seed, una mappa, non prova niente di generale. Il README del progetto lo dice nero su bianco, e gli fa onore non gonfiare il risultato.

Lato Sabaki ([plugin-doom](https://github.com/sabaki-js/plugin-doom)): ViZDoom in Python che chiama un server JS a ogni tick. Nano ~18k req/s, mini ~71 req/s su un thread i5. Il tick 35Hz passa largo, anche su un laptop medio.

Con bussola di uscita, mini esce da MAP01 in 2-4 run su 6, nano 0/6. Logico: il testo perde lo spaziale, gli stati doomLaya plafonano verso 0.57 sia con MiniLM che con ModernBERT-base. Quando manca l'info spaziale, nessun classificatore testuale la reinventa.

I vicini hanno rifatto il match a dati pari: [doomgemma](https://github.com/dexmac221/doomgemma) incolla una LoRA da 27min su una RTX 4070 e porta Gemma 4 E2B al livello di Laya v3 in gioco (6/6 vs 6/6) e sopra in decisioni isolate. A parità di taglia, un decoder va veloce come Laya (270M: 22ms vs 23ms). A parità di risultato, Laya resta ~3x più veloce perché ci arriva con un modello più piccolo.

La mia lettura: l'allenamento sul task conta più dell'architettura. Un piccolo specialista allenato batte un grosso generalista che scopre. Esattamente la scommessa Sabaki. Il paper che segue, *System Switch* ([arXiv:2610.09683](https://arxiv.org/abs/2610.09683)), spinge la logica fino in fondo: modello piccolo e veloce che gioca, modello grande ragionatore che riprende in mano quando una gate si apre. Il pre-triage Sabaki (`automate > 0.85 altrimenti escala`) applicato al gioco.

## Cosa è stato sacrificato

Ogni feature assente ne finanzia un'altra, è la regola del gioco quando miri alla CPU. La lista onesta, come per Bareiron dove ogni riga di C era un tradeoff:

**Sabaki non racconta niente.** Decide tra opzioni che gli dai, con una probabilità. Per una spiegazione, un riassunto, testo libero, prendi un LLM.

**Il francese resta fuori distribuzione per il generalist.** Routing EN (`all-MiniLM-L6-v2`), sonda 1/4 FR vs 3/4 EN su casi simili. Il plugin mail viene da una casella perlopiù FR ma anonimizzata: 0 PII, -0.024 accuracy per un vocab senza termini personali. L'anonimizzazione si paga, ma non era negoziabile.

**Il softmax si mostra troppo sicuro quando esce dalla sua zona.** Falsi a 1.00 osservati, sì. Da qui il pre-triage raccomandato nel GUIDE: `abstainAt: 0.6-0.7` per restituire `null` sotto la soglia, poi gate `confidence > 0.85` per automatizzare, umano altrimenti. Riferimento misurato: recall phishing 0.62 a precisione 0.87. Abbastanza per tagliare la coda in due, non per licenziare i revisori.

**Nano fatica sulle tracce di agenti.** 0.34 a 0.59 secondo la domanda. Mini riporta `needs_review` a 0.82, ma `risk / urgency / action` restano duri. Il testo di osservabilità è semplicemente povero di segnali lessicali.

**Doom in testo plafona.** Verso 0.57, MiniLM come ModernBERT-base. Finché resti su testo senza pixel, MAP02 ti blocca. La via credibile per un vero giocatore è vision + RL (tiny-doom-defender, 1.1M parametri da pixel), non un miglior classificatore testuale.

**Il benchmark deriva per batch.** typed-decisions è generato a infornate, lo split temporale è in realtà uno split di batch. `drift_tool.py` sputa 0.82 su customer_service, 0.67 su agent_trace (0.5 = indistinguibile). Conseguenza misurata: i pesi pubblicati fanno 0.733 in misto vs 0.61 sullo split ufficiale. Il numero ufficiale è quindi conservativo. La calibrazione Platt / temperature+bias non trasferisce tra batch, quindi shippiamo solo il temperature scaling calibrato su batch recenti. Regola di casa: prima `drift_tool.py`, warn sopra 0.6, block sopra 0.8. Nessun altro pubblica questa roba, tutti dovrebbero.

## Il risultato finale, numeri alla mano

Da un lato un i5 da laptop, dall'altro un'API che fattura a chiamata. Ecco cosa dà concretamente ogni modalità:

- nano: <1ms, ~18k req/s, 20-650 KB, 0 dipendenze
- mini: ~20ms, ~71 req/s, 22 MB int8, onnxruntime opzionale
- generalist: 20-36ms, 22.7M, il più piccolo generalista open che conosco

Più domini caricati: ~0.5 GB RAM in lazy-load per dominio invece di ~2 GB per tutto. Deterministico: 100/100 input identici danno lo stesso output. Soglie per domanda, gate su `confidence`, `unknown` quando niente matcha.

Su Bareiron, far girare 3+ giocatori arrancava perché ogni giocatore costava un chunk a 200ms. Qui far girare 3+ domini passa senza fiatare, perché ogni esperto è minuscolo e caricato su richiesta invece di caricare tutto in una volta. Stessa filosofia del "piccolo che basta", applicata a un altro hardware.

## La filosofia

p2r3 diceva: *"Amo e basta l'idea che questo piccolissimo chip da 1 dollaro possa far girare qualcosa di avanzato come Minecraft."*

Stesso trip qui: amo l'idea che 20 KB di JSON e un centinaio di righe di TS sostituiscano una chiamata GPU per scegliere una label. Ovviamente non sostituisce tutto, non prendiamoci in giro. Sostituisce il caso noioso in cui vuoi una label in millisecondi, in locale, con una confidenza che puoi ragionevolmente sogliare invece di incrociare le dita.

I tradeoff, scritti nero su bianco:
- encoder -> conteggio di parole: 7 punti in meno, latenza divisa per 1000, infra a zero
- modello unico grosso -> plugin npm: gate più grossolana, ops infinitamente più semplici
- generazione -> decisione tipizzata: basta parsing che si rompe e opzioni inventate
- confidenza grezza -> pre-triage: prima abstain, automazione sopra 0.85, umano per il resto

**Le 3 cose da ricordare:**

1. **7 punti in meno, 1000x più veloce** -- 0.61/0.69 vs 0.75-0.80, ma <1ms/20ms CPU offline contro 25s CPU o API a pagamento. Un punteggio senza il suo costo non vuol dire niente.
2. **Router semplice + esperti separati** -- `hits / sqrt(keywords)`, threshold, `unknown`. Ogni plugin si allena, si versiona e shippa da solo. Su mail, TF-IDF incolla MiniLM: la GPU non serve a niente qui.
3. **Offline-first con calibrazione onesta** -- `npm i`, pesi inclusi, 0 GPU, ECE < 0.14, abstain, drift tool. L'unico stack del confronto che regge un game loop a 35Hz senza GPU.

Se il progetto ti interessa, è tutto in MIT su [github.com/sabaki-js](https://github.com/sabaki-js). La versione accademica con misure e bibtex è il [preprint v1](/assets/paper/sabaki-organizational-moe-typed-decisions.pdf). E se vuoi vedere Golia giocare a Doom per davvero, vai su [azalio/doomLaya](https://github.com/azalio/doomLaya) xD
