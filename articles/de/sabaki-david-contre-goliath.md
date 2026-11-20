---
title: "Sabaki vs System One: David gegen Goliath, das kleinste Entscheidungsmodell der Welt"
description: "20KB gegen 421M Parameter. Sabaki verliert 7 Punkte auf typed-decisions, geht aber von 25s CPU auf unter 1ms offline. Anatomie eines organisationalen MoE."
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
author_sig: "q2pSBeTwd0DhjLyubGg2avcevRWuF7QZES5aBZU1cEXGl0IxnHQLmJoOqRfSLM+N53oKoJk1vaeEYqdmygjnXA=="
---

## Einleitung

Wenn du seit September auf Hacker News oder Twitter rumhängst, bist du an Jev garantiert nicht vorbeigekommen.

Am 15. September 2026 haut TypeSafe mit Jev raus, ihrem ersten "System One". Der Pitch passt in einen Satz: Hört auf, einen LLM nach JSON für ein Label zu fragen. Gib ihm einen `state` plus typisierte Fragen, er gibt dir typisierte Entscheidungen mit Wahrscheinlichkeiten zurück. Ein Durchlauf, null Tokens zum Samplen, nichts mehr zu parsen danach.

Das Ding ist explodiert. Rekordadoption am ersten Tag auf dem Vercel AI Gateway, fünf Elixir-Clients in wenigen Tagen, alle benchen Jev gegen ihr eigenes Zeug. Und ehrlich, der Hype ist verständlich. Jahrelang haben wir Prompts vom Typ `antworte NUR mit {"choice": ...}` gebastelt und gebetet, dass das Modell keine Option erfindet, das JSON nicht zerschießt, kein Feld halluziniert. Jev hat diesem Bedarf einen Namen gegeben und als saubere API versendet: `POST /v1/systemone`, Fragen vom Typ `choice / score / noul`, Antworten mit `probabilities` + `confidence`.

Ich fand die Idee super. Nur das Modell dahinter weniger -- und um das klar zu sagen, ich habe nie für Jev bezahlt.

Weil dahinter bleibt Jev eine geschlossene API. Unbekannte Gewichte, kein Self-Hosting, jede Entscheidung = ein Netzwerk-Roundtrip + ein Zähler, der mitläuft. Und die offenen Alternativen, die danach kamen, liegen bei 400M Parametern mit GPU-Pflicht.

Also habe ich das andere Extrem gebaut: [Sabaki](https://sabaki.fox3000foxy.com/). Ein Keyword-Router + eine logistische Regression in purem TypeScript, der denselben Vertrag spricht wie Jev (dieselben `choice / score / noul`-Shapes, derselbe Endpoint `/v1/systemone`, serviert von `serve()`), aber in **unter 1ms** läuft mit **20 Kilobyte** JSON. Null Dependencies im Nano-Modus, offline, 0€.

Zur Einordnung: Laya sind 843 MB Safetensors zum Laden. OpenDecider-nano sind 2 GB RAM. Sabaki nano invoices sind 20 KB. Das Gewichtsverhältnis liegt bei etwa **40.000**.

Wenn du die eckige, mit Zahlen belegte Version willst, gibt es das Preprint v1 vom Oktober 2026 auf der Seite: *Sabaki: An Organizational Mixture-of-Experts for Typed Decisions on CPU* ([PDF](/assets/paper/sabaki-organizational-moe-typed-decisions.pdf)). Design, Messungen, Tradeoffs, alles drin. Dieser Artikel hier ist die lesbare Version, mit offenem Code daneben.

Ich habe das nicht in meiner Ecke als Benchmark-Papier geschrieben. Ich arbeite mit an [azalio/doomLaya](https://github.com/azalio/doomLaya) (mein Fork: [fox3000foxy/doomLaya](https://github.com/fox3000foxy/doomLaya)), einem Harness, in dem Laya und Jev wirklich FreeDoom spielen mit model-owned Entscheidungen, Telemetrie pro Tick und Videos. Ich habe Goliath live spielen sehen, und sobald das Netzwerk hustet, hustet er mit.

Wir machen jetzt die Motoren einzeln auf. Wie immer, mit dem echten Code.

## Der Ring, auf den sich alle einigen

Es gibt genau ein Dataset, das Jev, Laya und OpenDecider alle zitieren: [LocalLLaMA/typed-decisions](https://huggingface.co/datasets/LocalLLaMA/typed-decisions). 4 synthetische Workflows (Support, Rechnungen, Security, Agent-Traces), 5 Fragen pro Fall, 1200 Train-Fälle, 400 Test-Fälle, 2000 Entscheidungen.

| Modell | Params | Test-Score | Latenz | Wo es läuft |
|---|---|---|---|---|
| OpenDecider-nano | ~400M | 0.796 | 17ms GPU | GPU, 2 GB RAM |
| Laya typed-decisions | 421M | 0.766 | ~25s/state CPU, ~830ms/Fall MLX | GPU |
| Jev 1.13 | geschlossen | ~0.73-0.75 | ~710ms API | nur API |
| **Sabaki mini** | 22M int8 | **0.69** | **~20ms CPU** | CPU, 22 MB |
| **Sabaki nano** | ~0 | **0.61** | **<1ms** | überall |
| Laya Basis Zero-Shot | 421M | 0.362 | gleich | GPU |

Zufall liegt bei 0.318, Mehrheit bei 0.461. Laya Basis mit 0.362 ohne Fine-Tune heißt also: "ich rate höflich drauflos". Merk dir das, du brauchst es noch.

7 Punkte trennen Sabaki vom Besten. 1000x Latenz trennen sie in die andere Richtung, wenn du keine GPU hast. Das ist der ganze Artikel in zwei Sätzen, der Rest erklärt dir, warum.

Aber Vorsicht: Hinter demselben `choice / score / noul`-Anschluss stecken komplett verschiedene Küchen. Jev = geschlossene API. Laya = fine-getunter ModernBERT-large. OpenDecider = destillierter Ettin-Encoder. Sabaki = Wortzählung + MiniLM int8. Gleicher Vertrag, unvergleichbare Budgets.

## Jev, die Klatsche, die jeder mitbekommen hat

Man muss TypeSafe lassen, was TypeSafe gehört: Der System-One-Vertrag ist echt eine gute Idee.

Früher hast du zum Sortieren eines Tickets das hier gemacht: du fragst einen LLM "wähl zwischen Billing, Technik und Spam, antworte in JSON", du parst die Antwort, du handelst die Fälle ab, in denen er "Ich würde sagen Billing! 😊" antwortet oder eine vierte Kategorie erfindet. Jede Frage kostete Tokens, jede Antwort konnte deine Pipeline sprengen.

Jev dreht den Deal um: du schickst den Text + Fragen mit ihren Kriterien, er wertet jede Frage parallel aus und gibt dir einen typisierten Wert mit seiner Verteilung zurück.

```bash
curl https://api.typesafe.ai/v1/systemone \
 -H "Authorization: Bearer $KEY" \
 -H 'content-type: application/json' \
 -d '{"state":"charge double ce mois-ci","questions":{"dept":{"type":"choice","instructions":"Route ce message.","criteria":{"billing":"paiements","technical":"bugs"}}}}}'
```

Antwort: `{ choice, probabilities, confidence }`. Kein freier Text. Dein Code kann direkt darauf verzweigen.

Darum ging das viral: Python- + JS-SDK, Claude-Code-Plugin, LangChain-Integration, jeder konnte seine Agenten an einem Nachmittag anschließen. Die TypeSafe-Doku pusht sogar das gesunde Pattern: Jev für kleine schnelle Urteile, deterministischer Code drumherum für die echte zusammengesetzte Entscheidung, langsamer LLM oder Mensch sobald die Confidence niedrig ist.

Das Problem ist der Rest. Geschlossene Gewichte, offline unmöglich, Preis pro Call. Für einen Agenten, der 100 Entscheidungen pro Run trifft, tut die Steuer weh. Für Doom mit 35 Ticks/s ist es tot: in doomLaya schafft Jev MAP01 Seed 48 in 68.97s mit p50 HTTP von 357ms. Der Run meldet $0.0046 API-Kosten -- nicht meine Rechnung, die vom Benchmark. Es läuft, der Run ist sauber, ohne Tod. Aber 357ms bei 35 Ticks/s, das sind 12 Ticks, in denen das Spiel weiterläuft, während du aufs Netzwerk wartest.

Sabaki hat genau diesen Vertrag geklaut -- dieselben Fragen, dieselben Antworten, derselbe Endpoint `/v1/systemone`, serviert von `serve()` -- und alles rausgeworfen, was ein Datacenter braucht.

## Laya, der dicke Offene, der gezeigt hat, dass es ohne API geht

[Laya](https://github.com/NandhaKishorM/laya) von Convai Innovations, Apache-2.0. Unter der Haube: ModernBERT-large, 421M, mit 1 `[MASK]`-Token pro Option. Der Hidden State jedes Markers geht durch ein kleines MLP, Softmax über die Optionen der Frage. Ein Durchlauf pro Frage, wie bei Jev.

```python
pipe = pipeline("text-classification", model="convaiinnovations/laya-typed-decisions")
```

Die 0.766 verdienen einen genaueren Blick. Das ist der Checkpoint, **fine-getunt auf dem Train-Split des Benchmarks**: 1200 Fälle, RLCD mit Gauß-Rauschen auf den Logits, Log- + Spherical-Reward. Dasselbe Modell ohne diesen Fit fällt auf 0.362. Sprich: es rät. Der Laya-Score heißt also "großer Encoder + Training auf der Domäne", nicht "großer magischer Encoder".

Auf CPU ist das ein Ziegelstein. Der gemessene ONNX-Port liegt bei rund 25s pro State. In MLX FP16 rechne mit 830ms pro Fall im Schnitt mit p99 bei 5.3s. Und du musst erst 843 MB laden, bevor irgendwas antwortet.

In doomLaya scheitert die Stock-Laya an MAP01 in 180s. Die angepasste v3 ([azalio/laya-doom-v3](https://huggingface.co/azalio/laya-doom-v3)), neu trainiert auf Doom, kommt in 61.43s raus mit p50 108ms auf MPS, und sammelt nebenbei die Shotgun ein. Also ja, das spielt -- nach dediziertem Training, auf Apple-GPU, mit einem gescripteten Executor, der die echte Arbeit macht (A*, Türen mit 15-Tick-Latch, Auto-Aim).

Mein Fazit: ohne Training auf deine Aufgabe ist Laya ein 421M-Briefbeschwerer. Mit Training ist es sehr stark, aber du brauchst die GPU und die passenden Daten dazu.

## OpenDecider, der das Leaderboard gewonnen hat

[OpenDecider](https://github.com/manjunathshiva/opendecider), das ist Manjunath, der beschlossen hat, alle auf ihrem eigenen Benchmark zu jagen. Ergebnis: **0.796** mit einem voll fine-getunten Ettin-Encoder-400m + MLP-Head, KL-Loss auf Soft Targets destilliert aus Qwen3-235B + DeepSeek.

```bash
pip install opendecider
# 17ms/Frage auf L40S, 18ms auf M4 Max, ~9ms gebatcht
```

Bei 50% Coverage steigt die selektive Accuracy auf 0.943 gegen 0.882 für Jev. Auf dem Papier das Beste aus beiden Welten: offen, kalibriert, schnell.

In der Praxis: 2 GB RAM zum Laden von Nano, GPU-Pflicht für die 17ms, Phishing bei 0.63 gegen 0.90 für Jev (OOD zieht ihn ab), und wie Laya trainiert auf dem Train-Split des Benchmarks. Der Test wurde nie gesehen, aber die Domäne schon.

Er gewinnt das Armdrücken, aber es bleiben 400M mit einer GPU dahinter. Das klebst du nicht in einen Cloudflare-Worker oder in eine Game-Loop auf einem Laptop.

## Die 150M-Klasse, und das Loch darunter

openJev-verdict-2.0 (151M), julia-1 (144M mehrsprachig), Open Jev (150M), Largha-150M (144M en+zh), Vela (0.3B-9B). Alles ModernBERT oder mmBERT-small, alle CPU-fähig, alle nett zu trainieren (Open Jev meldet 30min auf einer T4 auf Colab). Selbst berichtete Zahlen, verschiedene Protokolle, also mit Vorsicht zu genießen, aber die Familie existiert.

Der Sabaki-Generalist macht **22.7M**. Etwa 6.5x kleiner als der kleinste aus dieser Truppe. Kein anderer geht unter 100M runter, um zur Runtime definierte Fragen zu beantworten.

Das ist es, "der kleinste der Welt": nicht der beste Score, sondern die kleinste Hülle, die deine `instructions` + `criteria` liest und entscheidet, wenn kein Spezialist Bescheid weiß.

## Sabaki, der dumme Router und seine Wegwerf-Experten

Gut, genug über die Großen geredet. Kommen wir zu David, weil es hier lustig wird.

Sabaki versucht nicht, ein großes schlaues Modell zu sein, das die Welt versteht. Es ist ein organisationales MoE: 1 sparser Router auf Systemebene, unabhängige Experten, einer aktiv pro Input. Jedes Plugin ist ein eigenes npm-Package, mit seinem Manifest, seinen Gewichten, seiner Version. Du installierst nur, was du routest.

Die Org [sabaki-js](https://github.com/sabaki-js): 13 Repos, der Core `sabaki` (129 Commits), 6 `@sabaki-js/*`-Plugins, die Gewichte, der Cloudflare-Worker, das Template für dein eigenes.

Die `package.json` vom Core erzählt die Geschichte schon:

```json
"dependencies": { "@typesafe-ai/sdk": "^0.7.0" },
"optionalDependencies": { "onnxruntime-node": "^1.22.0" }
```

Im Nano-Modus null Runtime-Dependencies. Nur kompiliertes TypeScript, nichts zu installieren, nichts, was zwischen zwei ONNX-Versionen brechen kann.

### Der Router, oder wie man in wenigen Zeilen entscheidet

Der Router lebt in `src/index.ts`, und die Tokenisierung sieht so aus (`src/index.ts:129`):

```ts
function tokens(s: string): string[] {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/).filter((w) => w.length > 3);
}
```

Kleinbuchstaben, Akzente raus, Wörter mit mindestens 4 Buchstaben. Dieser Filter wirft den ganzen Rausch raus ("le", "de", "ok"). Bei Support-Tickets ändert das alles, weil dein Matching auf Wörtern läuft, die Bedeutung tragen.

Das Scoring selbst steckt in `route()` (`src/index.ts:251`), und hier entscheidet sich alles:

```ts
const hits = kws.filter((k) =>
  words.some((w) => w.includes(k) || k.includes(w))).length;
const score = hits / Math.sqrt(kws.length);
```

Lockeres Matching in beide Richtungen: `billing` fängt `billed`, `invoice` fängt `invoicing`. Die Division durch die Wurzel bestraft große Keyword-Listen nicht, sonst würde das Mail-Plugin mit seinen 600 Wörtern alles plattmachen, sobald eine Mail "hello" enthält.

Jedes Plugin hat seine Schwelle, Standard 0.15 gespeichert in `src/index.ts:139`, Mail bei 0.03 weil Betreffs kurz sind. Darunter:

```ts
return { domain: "unknown", decision: null, confidence: 0, plugin: null };
```

Unbekannte Domäne = `unknown`, nie ein erfundener Guess, nur um nett zu sein. Absichtlich doof, und genau das macht das Thresholding `automate > 0.8` später benutzbar: wenn Sabaki antwortet, dann weil ein Spezialist wirklich gematcht hat.

Obendrauf gibt es eine Sprachachse über `langid`: ein Plugin, das `languages` deklariert, tritt nur für seine Sprachen an. Praktisch, um lateinisches Phishing und CJK zu trennen. Text zu kurz = kein Filter, alle treten an.

Gesamtkosten: ein paar Mikrosekunden pro Entscheidung. Keine Matrix zu multiplizieren, kein Netzwerk anzurufen, nur String-Vergleiche und eine Division.

### Nano, meine Lieblingsdatei im Repo

`src/logreg.ts:28`, die Tokenisierung:

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

Unigramme + Bigramme. `charged twice` gibt `charged`, `twice`, und das Paar `charged twice`. Das reicht, um "doppelte Abrechnung" zu erkennen, ohne einen 400M-Transformer rauszuholen.

`src/logreg.ts:46`, die Vektorisierung, wo TF-IDF seine Arbeit macht:

```ts
const tf = 1 + Math.log(c);  // sublineares TF
const val = tf * w.idf[i]!;  // smoothes IDF wie bei sklearn
```

Das zehnte Vorkommen eines Wortes zählt weniger als das erste, seltene Wörter wiegen mehr als "please". Genau das sklearn-Rezept, exakte Parität auf 20 Fragen verifiziert.

Und der Kommentar, bei dem ich beim Wiederlesen grinsen musste:

```ts
// berührt nur vorhandene Terme (sparse) statt 3000 Dims zu scannen.
for (const [t, c] of counts) {
```

Statt bei jedem Ticket 3000 Dimensionen zu scannen, fasst du nur die rund zwanzig vorhandenen Wörter an. Darum antwortet das in unter 1ms. Das ist so ein unsichtbares Detail, das in Prod alles ändert, weil die Komplexität der Ticketgröße folgt und nicht der Vokabulargröße.

`src/logreg.ts:86`, die Inferenz, die in drei Zeilen passt:

```ts
// binär: 1 Zeile Coefs + Sigmoid
const pPos = 1 / (1 + Math.exp(-s));
// multiklasse: Skalarprodukt + Softmax, Argmax
```

Ein Skalarprodukt, ein Sigmoid oder ein Softmax je nach Klassenzahl. Ein Durchlauf und fertig. Null Tokens generiert, also null kaputtes JSON, das du danach mit Retries und Parsing-Heuristiken flicken musst.

Rezept `train.py`: 300 Train / 100 Test pro Workflow, deterministischer Split (jedes fünfte Item in Test, um Zeitbias zu vermeiden), Vocab 3000-6000, Coefs auf 1e-4 gerundet bei null gemessenem Verlust. Export als JSON `{ vocab, idf, questions }`.

Gewichte: 20 KB für invoices (`duplicate` 0.89) bis 650 KB für Mail (`bucket` 0.889). Eine Größe, die in ein Frontend-Bundle passt.

Das Detail, das mich umgehauen hat: auf Mail klebt MiniLM mit +/-0.02 an TF-IDF. Also shippt Nano so wie es ist. Eine GPU zum Mailsortieren bezahlen, nee danke. Dafür klemmt agent_trace (`needs_review` 0.59 in Nano): Observability-Text ist arm, kein Wort trägt die Entscheidung wirklich.

Die Fabrik, die aus Gewichten ein Plugin macht, in `src/plugin.ts:52`:

```ts
export function nanoClassifier(manifest, weights, opts = {}) {
  return definePlugin({ manifest,
    classify: (input) => {
      const r = predict(`${from}${input.state}`, weights, q);
      return { decision: r.decision, confidence: r.confidence, domain: manifest.domain };
    }});
}
```

`decide()` bleibt synchron für Nano, `decideAsync()` schaltet ONNX für Mini frei. Zwei Wege, eine simple Regel: wenn du Async brauchst, willst du Mini, sonst reicht Nano. Leicht zu merken beim Coden, leicht zu debuggen wenn es kracht.

Damit du siehst, dass das nicht nur Theorie ist, hier echte Nutzung:

```ts
import { Sabaki } from "sabaki";
import customerService from "@sabaki-js/customer-service";

const sabaki = new Sabaki().register(customerService);
sabaki.decide({ state: "charged twice, refund please" });
// { decision: "billing", confidence: 0.31, domain: "customer_service" }
```

### Mini, 22 MB, die bei schweren Fällen alles ändern

Nano hat seine Grenzen, du hast es oben bei agent_trace gesehen. MiniLM-L6 übernimmt: ein geteilter Encoder für die ganze Domäne, plus ein linearer Head pro Frage. End-to-end Fine-Tune über 8-12 Epochen, lr 2e-5, auf CUDA-GPU fürs Training (Inferenz bleibt CPU, darauf kommt es an).

Die Zahlen, die entschieden haben, gemessen auf denselben Splits:
- eingefrorener Encoder + MLP: 0.65
- volles Fine-Tune: 0.68
- Distillation 400M auf eingefrorene Embeddings: getestet, verworfen, schlechter als die Gold-Labels

ONNX-Export via Dynamo, exakte Parität verifiziert, dann dynamische int8-Quantisierung: 90 MB -> 22 MB, **-0.004 Accuracy** auf customer_service. ECE gleich oder besser. Jeder Export wird neu vermessen, sonst heißt die Optimierung nichts.

Seit 1.0.2 stecken die Gewichte im Package (`models/<workflow>-int8/` + exportiertes `modelDir`). `npm i` reicht, Flugmodus OK. Updaten = Patch publishen, signiert via Trusted Publishing.

Konkret: `needs_review` geht von 0.59 auf **0.82**. `disposition` 0.73 -> 0.76. ECE < 0.14 überall, mit gesundem OOD-Zweifel (0.2-0.5 auf Drachen, Rezepten und leeren Strings). Genau dieser Zweifel erlaubt aggressives Thresholding in Prod.

### Generalist, das Catch-all, das Sabaki erst wirklich zu System One macht

Jev und die anderen antworten auf alles: jede Frage, jede Option, zur Runtime definiert. Das ist der System-One-Vertrag, der Jev viral gemacht hat -- du stellst deine `instructions` + `criteria` mit deinen Optionen, er entscheidet.

Die Sabaki-Spezialisten können das nicht. Sie kennen ihre Fragen (`category`, `duplicate`, `bucket`) und sonst nichts. Ohne Netz würde Sabaki `unknown` zurückgeben, sobald du vom Skript abweichst, wo Jev immer irgendwas antwortet.

Der Generalist ist dieses Netz. Ein Cross-Encoder, der Frage + Option + State liest und einen Score ausspuckt, ein Durchlauf pro Option, Softmax, Argmax. 22.7M MiniLM int8 -- 6.5x kleiner als die 144-151M der Truppe. Aber sein Job ist nicht der Score, sondern Kompatibilität: mit ihm als Fallback angeschlossen akzeptiert `POST /v1/systemone` jeden State und jede Frage, wie Jev. Das Feld `model` sagt, wer wirklich geantwortet hat (`@sabaki-js/mail@1.1.2+mini`, `sabaki-generalist-v1`...), also änderst du aufruferseitig nichts.

Und vor allem ist es ein Fallback, kein Chef. Goldene Regel in `decideAsync()`: wenn ein Spezialist das Routing gewinnt, antwortet er. Der Generalist redet nur bei `unknown`. Nie umgekehrt. So wischt kein mittelmäßiger Generalist einen guten Spezialisten auf dessen Domäne weg.

Der Loader lebt in `src/generalist.ts`, mit Cache pro Ordner, damit du die ONNX-Session nicht bei jedem Call neu lädst:

```ts
export function loadGeneralist(modelDir: string) {
  // Cache pro Ordner, ONNX-Session wird wiederverwendet
  // tokenizer.json -> Unigram oder Wordpiece, auto erkannt
  const sess = await ort.InferenceSession.create(
    path.join(modelDir, "generalist.onnx"),
    { intraOpNumThreads: 2 },
  );
}
```

Du zeigst `SABAKI_GENERALIST_DIR` auf einen Ordner mit `generalist.onnx` + `tokenizer/`, das Modell ist austauschbar. Die ID kommt aus `config.json`, sonst `"sabaki-generalist"`. Der `Map`-Cache erspart das Neuladen der Session bei jedem Call.

Das Input-Format ist klassischer Cross-Encoder: Frage, Option und State verkettet mit Trennern, eine Zeile pro zu scorender Option:

```ts
const texts = options.map(
  (o) => `${input.question ?? "decision"} [SEP] ${o} [SEP] ${input.state}`,
);
```

Frage + Option + State, getrennt durch `[SEP]`, eine Zeile pro Option. Optionen gedeckelt auf 8 (`slice(0, 8)`), Default `["yes", "no"]` wenn du nichts gibst. Darüber hinaus musst du aufruferseitig stückeln -- 8 ist schon breit für eine typisierte Entscheidung.

Dann kommt das schlaue Batching, so eine Optimierung, die unscheinbar aussieht, aber die Latenz durch die Optionszahl teilt. Statt einem `session.run` pro Option geht alles in einem Forward raus:

```ts
// Ein einziger gebatchter Forward für alle Optionen
// (auf Max-Länge aufgefüllt) statt ein Run pro Option.
const L = Math.max(...encs.map((e) => e.ids.length));
// ids + attention_mask als [options.length, L], Padding mit padId
const out = await sess.run({ input_ids, attention_mask });
const scores = Array.from(out["score"].data).map(Number);
```

Jeder Text wird encodiert (BERT-Wordpiece oder SentencePiece-Unigram je nach `tokenizer.json`), auf die Max-Länge des Batches gepaddet, zu einem Tensor `[anz_options, L]` gestapelt. Ein einziges `sess.run`, du kriegst einen Score pro Option. Auf CPU ändert das alles: 20-36ms statt 8x so viel.

Dann kommt Softmax + Argmax, mit den kompletten Probs für jede Option, genau in dem Format, das Jev populär gemacht hat:

```ts
const pr = softmax(scores);
// bi = Index des Maximums
const confidence = Math.round(pr[bi] * 1000) / 1000;
const probs = Object.fromEntries(
  options.map((o, i) => [o, Math.round(pr[i] * 1000) / 1000]),
);
```

Und das Detail, das das Ding in Prod benutzbar macht statt nur eine Demo zu bleiben, ist `abstainAt`:

```ts
if (input.abstainAt !== undefined && confidence < input.abstainAt) {
  return { decision: null, confidence, domain: "generalist", probabilities: probs };
}
```

Opt-in, keine Enthaltung per Default. Du gibst `abstainAt: 0.6-0.7` mit und alles Wackelige kommt als `null` zurück statt als Guess. Weil der Softmax auch bei Fehlschüssen außerhalb der Verteilung 1.00 ausspuckt, ist das kein Luxus. Der GUIDE empfiehlt es für jede autonome Nutzung: unter der Schwelle fragst du nach statt automatisch aufzulösen.

Zum Schluss noch dasselbe Setup mit Generalist-Fallback: wenn kein Spezialist matcht, springt er ein statt `unknown` zu liefern.

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
// Spezialist für Mail wenn das Routing matcht, sonst Generalist als Catch-all wie bei Jev
```

Die Generationen des Generalisten, alle gleich gemessen auf PhishNChips (2000 Mails) und auf dem typed-decisions-Test, um Vergleichbares zu vergleichen:
- v4: 0.29 Test, R=0.026 Phishing. Wegwerfen, lag daneben.
- A (22M 80k): 0.546, R=0.406. Fängt an, nach was auszusehen.
- mini v1 serviert: **0.536, R=0.616**. Die läuft auf der Seite. Ordentlicher Phishing-Recall, mittlerer Test.
- B (144M from scratch): 0.568, R=0.062. Größer, kaum besser im Test, mies im Phishing.

Der 144M-from-scratch, der nicht besser transferiert, hat mich bei der Idee "mehr Params für Generalisierung" ziemlich runtergeholt. Bei gleicher Aufgabe kostet der Große mehr, ohne besser zu raten. Selbst als Catch-all macht der Kleine den Job. Und er bleibt EN-only (`all-MiniLM-L6-v2`), EN-Routing, FR out-of-distrib. Für FR nimmst du einen darauf trainierten Spezialisten, nicht den Generalisten.

## Doom, der einzige Test, der für mich wirklich zählt

doomLaya, das ist Laya und Jev, die wirklich FreeDoom spielen. Das Modell wählt `command / target / weapon`, der Executor plant den Weg per A*, öffnet Türen, zielt, klickt. Telemetrie pro Tick, Videos, SHAs der Runs. Ich arbeite da mit, ich rede also nicht über ein Leaderboard aus der Ferne.

v0.1.0, MAP01 Seed 48, Skill 3, 35 Ticks/s, derselbe Executor:

| Modell | Ergebnis | p50 HTTP | API-Kosten |
|---|---|---|---|
| Laya Stock | Fehlschlag 180s | 106ms | $0 |
| Laya v3 angepasst | Ausgang 61.43s | 108ms | $0 |
| Jev 1.13 | Ausgang 68.97s | 357ms | $0.0046 |

Zwei saubere Ausgänge, ohne Tod, Laya schnappt unterwegs die Shotgun auf, weil der Executor das Pickup allein handelt. Ehrlichkeitspflicht: Laya v3 wurde auf Doom trainiert, Jev nicht. Ein Seed, eine Map, das beweist nichts Allgemeines. Das README vom Projekt sagt das schwarz auf weiß, und es ehrt das Projekt, das Ergebnis nicht zu überverkaufen.

Auf Sabaki-Seite ([plugin-doom](https://github.com/sabaki-js/plugin-doom)): ViZDoom in Python ruft pro Tick einen JS-Server auf. Nano ~18k req/s, Mini ~71 req/s auf einem i5-Thread. Der 35Hz-Tick geht locker durch, selbst auf einem mittleren Laptop.

Mit Ausgangskompass schafft Mini MAP01 in 2-4 von 6 Runs, Nano 0/6. Logisch: der Text verliert das Räumliche, die Doom-States deckeln bei etwa 0.57, ob MiniLM oder ModernBERT-base. Wenn die räumliche Info fehlt, erfindet sie kein Textklassifizierer neu.

Die Nachbarn haben das Rematch mit gleichen Daten gemacht: [doomgemma](https://github.com/dexmac221/doomgemma) klebt eine 27min-LoRA auf einer RTX 4070 drauf und bringt Gemma 4 E2B im Spiel auf Laya-v3-Niveau (6/6 vs 6/6) und darüber bei isolierten Entscheidungen. Bei gleicher Größe ist ein Decoder so schnell wie Laya (270M: 22ms vs 23ms). Bei gleichem Ergebnis bleibt Laya etwa 3x schneller, weil sie es mit einem kleineren Modell schafft.

Meine Lesart: Training auf der Aufgabe zählt mehr als Architektur. Ein kleiner trainierter Spezialist schlägt einen großen Generalisten, der Neuland betritt. Genau die Sabaki-Wette. Das Folge-Paper, *System Switch* ([arXiv:2610.09683](https://arxiv.org/abs/2610.09683)), zieht die Logik bis zum Ende durch: kleines schnelles Modell, das spielt, großes Reasoner-Modell, das übernimmt, wenn ein Gate aufgeht. Das Sabaki-Pre-Triage (`automate > 0.85 sonst Eskalation`), angewandt aufs Spiel.

## Was geopfert wurde

Jedes fehlende Feature finanziert ein anderes, das ist die Spielregel, wenn du auf CPU zielst. Die ehrliche Liste, wie bei Bareiron, wo jede C-Zeile ein Tradeoff war:

**Sabaki erzählt nichts.** Es entscheidet zwischen Optionen, die du ihm gibst, mit einer Proba. Für Erklärungen, Zusammenfassungen, freien Text, nimm einen LLM.

**Französisch bleibt out-of-distrib für den Generalisten.** EN-Routing (`all-MiniLM-L6-v2`), Sonde 1/4 FR vs 3/4 EN auf ähnlichen Fällen. Das Mail-Plugin kommt aus einer Firma mit Mehrheit FR, aber anonymisiert: 0 PII, -0.024 Accuracy für ein Vocab ohne persönliche Begriffe. Anonymisierung kostet, war aber nicht verhandelbar.

**Der Softmax zeigt sich zu sicher außerhalb seiner Zone.** Falsche mit 1.00 gesehen, ja. Darum das empfohlene Pre-Triage aus dem GUIDE: `abstainAt: 0.6-0.7`, um unter der Schwelle `null` zu liefern, dann Gate `confidence > 0.85` zum Automatisieren, Mensch für den Rest. Gemessene Referenz: Phishing-Recall 0.62 bei Präzision 0.87. Genug, um die Schlange zu halbieren, nicht genug, um Reviewer rauszuwerfen.

**Nano kämpft mit Agent-Traces.** 0.34 bis 0.59 je nach Frage. Mini hebt `needs_review` auf 0.82, aber `risk / urgency / action` bleiben hart. Observability-Text ist einfach arm an lexikalischen Signalen.

**Doom in Text deckelt.** Bei etwa 0.57, MiniLM wie ModernBERT-base. Solange du auf Text ohne Pixel bleibst, blockt dich MAP02. Der glaubwürdige Weg zu einem echten Spieler ist Vision + RL (tiny-doom-defender, 1.1M Params aus Pixeln), kein besserer Textklassifizierer.

**Der Benchmark driftet in Batches.** typed-decisions wird in Chargen generiert, der zeitliche Split ist eigentlich ein Batch-Split. `drift_tool.py` meldet 0.82 auf customer_service, 0.67 auf agent_trace (0.5 = ununterscheidbar). Gemessene Folge: die publizierten Gewichte machen 0.733 gemischt vs 0.61 auf offiziellem Split. Die offizielle Zahl ist also konservativ. Platt-Kalibrierung / Temperature+Bias transferiert nicht zwischen Batches, also shippen wir nur Temperature-Scaling kalibriert auf frischen Batches. Hausregel: erst `drift_tool.py`, Warnung über 0.6, Block über 0.8. Kein anderer publiziert das, alle sollten es.

## Das Endergebnis, mit Zahlen in der Hand

Auf der einen Seite ein Laptop-i5, auf der anderen eine API, die pro Call abrechnet. So sieht jeder Modus konkret aus:

- Nano: <1ms, ~18k req/s, 20-650 KB, 0 Deps
- Mini: ~20ms, ~71 req/s, 22 MB int8, onnxruntime optional
- Generalist: 20-36ms, 22.7M, der kleinste offene Generalist, den ich kenne

Mehrere Domänen geladen: ~0.5 GB RAM im Lazy-Load pro Domäne statt ~2 GB für alles. Deterministisch: 100/100 identische Inputs geben denselben Output. Schwellen pro Frage, Gate auf `confidence`, `unknown` wenn nichts matcht.

Auf Bareiron haben 3+ Spieler geruckelt, weil jeder Spieler einen Chunk für 200ms kostete. Hier laufen 3+ Domänen locker durch, weil jeder Experte winzig ist und bei Bedarf geladen wird, statt alles auf einmal zu laden. Dieselbe Philo vom "Kleinen, das reicht", angewandt auf andere Hardware.

## Die Philo

p2r3 sagte: *"Ich mag einfach die Idee, dass dieser winzige 1-Euro-Chip etwas so Fortgeschrittenes wie Minecraft laufen lassen kann."*

Gleicher Trip hier: ich mag die Idee, dass 20 KB JSON und hundert Zeilen TS einen GPU-Call ersetzen, um ein Label zu wählen. Das ersetzt natürlich nicht alles, muss man nicht diskutieren. Es ersetzt den nervigen Fall, wo du ein Label in Millisekunden willst, lokal, mit einer Confidence, die du halbwegs sauber threshholden kannst statt Daumen zu drücken.

Die Tradeoffs, schwarz auf weiß:
- Encoder -> Wortzählung: 7 Punkte weniger, Latenz durch 1000 geteilt, Infra auf null
- einzelnes großes Modell -> npm-Plugins: gröberes Gate, unendlich einfachere Ops
- Generierung -> typisierte Entscheidung: Schluss mit kaputtem Parsing und erfundenen Optionen
- rohe Confidence -> Pre-Triage: erst Enthaltung, Automatisierung über 0.85, Mensch für den Rest

**Die 3 Dinger zum Mitnehmen:**

1. **7 Punkte weniger, 1000x schneller** -- 0.61/0.69 vs 0.75-0.80, aber <1ms/20ms CPU offline gegen 25s CPU oder Bezahl-API. Ein Score ohne seine Kosten heißt nichts.
2. **Simpler Router + getrennte Experten** -- `hits / sqrt(keywords)`, Threshold, `unknown`. Jedes Plugin trainiert, versioniert und shippt allein. Auf Mail klebt TF-IDF an MiniLM: die GPU bringt hier nichts.
3. **Offline-first mit ehrlicher Kalibrierung** -- `npm i`, Gewichte eingebettet, 0 GPU, ECE < 0.14, Enthaltung, Drift-Tool. Der einzige Stack im Vergleich, der eine Game-Loop mit 35Hz ohne GPU hält.

Wenn dich das Projekt interessiert, alles ist MIT auf [github.com/sabaki-js](https://github.com/sabaki-js). Die akademische Version mit Messungen und Bibtex ist das [Preprint v1](/assets/paper/sabaki-organizational-moe-typed-decisions.pdf). Und wenn du Goliath live Doom spielen sehen willst, ab zu [azalio/doomLaya](https://github.com/azalio/doomLaya) xD
