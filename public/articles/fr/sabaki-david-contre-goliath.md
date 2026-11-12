---
title: "Sabaki vs System One : David contre Goliath, le plus petit modèle de décision du monde"
description: "20KB contre 421M paramètres. Sabaki perd 7 points sur typed-decisions mais passe de 25s CPU à moins d'1ms offline. Anatomie d'un MoE organisationnel."
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
author_sig: "x6JQCDF4+J8jC4wW049+nYs3Em/zeCRvxwb9f9DPa9ozYTJK8m0lluI+h1QWMtCl0a8Z8eG8IWeu9AsZ2vIeNw=="
---

## Introduction

Si tu traînes sur Hacker News ou Twitter depuis septembre, t'as forcément vu passer Jev.

Le 15 septembre 2026, TypeSafe sort Jev, leur premier "System One". Le pitch tient en une phrase : arrêtez de demander à un LLM de générer du JSON pour choisir un label. Filez-lui un `state` plus des questions typées, il vous rend des décisions typées avec des probas. Une passe, zéro token à sampler, rien à parser derrière.

Ça a explosé. Premier jour d'adoption record sur Vercel AI Gateway, cinq clients Elixir en quelques jours, tout le monde qui benchmarke Jev contre son truc. Et honnêtement la hype se comprend. Ça faisait des années qu'on bricolait des prompts `réponds UNIQUEMENT avec {"choice": ...}` en priant pour que le modèle invente pas une option, casse pas le JSON, hallucine pas un champ. Jev a mis un nom sur ce besoin et l'a ship en API propre : `POST /v1/systemone`, questions `choice / score / noul`, réponses avec `probabilities` + `confidence`.

J'ai adoré l'idée. Le modèle éco, moins -- et pour être clair, j'ai jamais payé pour Jev.

Parce que derrière, Jev reste une API fermée. Poids inconnus, pas de self-host, chaque décision = un round-trip réseau + un compteur qui tourne. Et les alternatives open qui ont suivi tapent dans les 400M de paramètres avec un GPU obligatoire.

Alors j'ai construit l'autre extrême : [Sabaki](https://sabaki.fox3000foxy.com/). Un routeur à mots-clés + une régression logistique en TypeScript pur qui parle le même contrat que Jev (mêmes shapes `choice / score / noul`, même endpoint `/v1/systemone`), mais qui tourne en **moins d'1ms** avec **20 kilooctets** de JSON. Zéro dépendance en mode nano, offline, 0€.

Pour situer : Laya c'est 843 Mo de safetensors à loader. OpenDecider-nano c'est 2 Go de RAM. Sabaki nano invoices c'est 20 Ko. Le rapport en poids tourne autour de **40 000**.

Si tu veux la version carrée et chiffrée, y'a le preprint v1 d'octobre 2026 sur le site : *Sabaki: An Organizational Mixture-of-Experts for Typed Decisions on CPU* ([PDF](/assets/paper/sabaki-organizational-moe-typed-decisions.pdf)). Design, mesures, tradeoffs, tout y est. Cet article c'est la version lisible, avec le code ouvert à côté.

Je l'ai pas écrit dans mon coin en mode benchmark-papier. Je contribue à [azalio/doomLaya](https://github.com/azalio/doomLaya) (mon fork : [fox3000foxy/doomLaya](https://github.com/fox3000foxy/doomLaya)), un harness où Laya et Jev jouent vraiment à FreeDoom avec décisions model-owned, télémétrie par tick et vidéos. J'ai vu Goliath jouer en vrai, et dès que le réseau tousse, lui aussi.

On va ouvrir les moteurs un par un. Comme d'hab, avec le vrai code.

## Le ring où tout le monde accepte de se battre

Y'a un seul dataset que Jev, Laya et OpenDecider citent tous : [LocalLLaMA/typed-decisions](https://huggingface.co/datasets/LocalLLaMA/typed-decisions). 4 workflows synthétiques (support, factures, sécu, traces d'agents), 5 questions par cas, 1200 cas de train, 400 de test, 2000 décisions.

| Modèle | Params | Score test | Latence | Où ça tourne |
|---|---|---|---|---|
| OpenDecider-nano | ~400M | 0.796 | 17ms GPU | GPU, 2 Go RAM |
| Laya typed-decisions | 421M | 0.766 | ~25s/state CPU, ~830ms/cas MLX | GPU |
| Jev 1.13 | fermé | ~0.73-0.75 | ~710ms API | API only |
| **Sabaki mini** | 22M int8 | **0.69** | **~20ms CPU** | CPU, 22 Mo |
| **Sabaki nano** | ~0 | **0.61** | **<1ms** | partout |
| Laya base zéro-shot | 421M | 0.362 | pareil | GPU |

Le hasard c'est 0.318, la majorité 0.461. Donc Laya base à 0.362 sans fine-tune, c'est le niveau "je réponds au pif en étant poli". Retiens ça, ça va servir.

7 points séparent Sabaki du meilleur. 1000x de latence les séparent dans l'autre sens quand t'as pas de GPU. Voilà tout l'article en deux phrases, le reste c'est pour comprendre pourquoi.

Attention quand même : derrière la même prise `choice / score / noul`, les cuisines n'ont rien à voir. Jev = API fermée. Laya = ModernBERT-large fine-tuné. OpenDecider = Ettin-encoder distillé. Sabaki = comptage de mots + MiniLM int8. Même contrat, budgets incomparables.

## Jev, la claque que tout le monde a vue passer

Faut rendre à TypeSafe ce qui est à TypeSafe : le contrat System One, c'est une vraie bonne idée.

Avant, pour trier un ticket, tu faisais ça : tu demandais à un LLM "choisis entre billing, technique et spam, réponds en JSON", tu parsais la réponse, tu gérais les cas où il répond "Je dirais billing ! 😊" ou invente une 4ème catégorie. Chaque question coûtait des tokens, chaque réponse pouvait casser ton pipeline.

Jev change le deal : tu envoies le texte + des questions avec leurs critères, il évalue chaque question en parallèle et te rend une valeur typée avec sa distribution.

```bash
curl https://api.typesafe.ai/v1/systemone \
 -H "Authorization: Bearer $KEY" \
 -H 'content-type: application/json' \
 -d '{"state":"charge double ce mois-ci","questions":{"dept":{"type":"choice","instructions":"Route ce message.","criteria":{"billing":"paiements","technical":"bugs"}}}}}'
```

Réponse : `{ choice, probabilities, confidence }`. Pas de texte libre. Ton code peut brancher dessus direct.

C'est pour ça que c'est devenu viral : SDK Python + JS, plugin Claude Code, intégration LangChain, tout le monde pouvait brancher ses agents dessus en une aprem. La doc TypeSafe pousse même le pattern sain : Jev pour les petits jugements rapides, code déterministe autour pour composer la vraie décision, LLM lent ou humain dès que la confiance est basse.

Le souci c'est le reste. Poids fermés, offline impossible, prix au call. Pour un agent qui prend 100 décisions par run, la taxe pique. Pour Doom à 35 ticks/s, c'est mort : dans doomLaya, Jev sort MAP01 seed 48 en 68.97s avec un p50 HTTP à 357ms. Le run rapporte $0.0046 de coût API -- pas ma facture, celle du benchmark. Ça marche, le run est propre, sans mort. Mais 357ms à 35 ticks/s, ça fait 12 ticks où le jeu continue pendant que t'attends le réseau.

Sabaki a piqué exactement ce contrat -- mêmes questions, mêmes réponses, même endpoint `/v1/systemone` servi par `serve()` -- en virant tout ce qui demande un datacenter.

## Laya, le gros open qui a montré que c'était faisable sans API

[Laya](https://github.com/NandhaKishorM/laya) par Convai Innovations, Apache-2.0. Sous le capot : ModernBERT-large, 421M, avec 1 token `[MASK]` par option. Le hidden state de chaque marqueur passe dans un petit MLP, softmax sur les options de la question. Une passe par question, comme Jev.

```python
pipe = pipeline("text-classification", model="convaiinnovations/laya-typed-decisions")
```

Le 0.766 mérite qu'on s'y arrête. C'est le checkpoint **fine-tuné sur le train du benchmark** : 1200 cas, RLCD avec bruit gaussien sur les logits, reward log + spherical. Le même modèle sans ce fit tombe à 0.362. Autant dire qu'il devine. Donc le score Laya, c'est "gros encodeur + entraînement sur le domaine", pas "gros encodeur magique".

Sur CPU, c'est un parpaing. Le port ONNX mesuré tourne autour de 25s par state. En MLX FP16, compte 830ms par cas en moyenne avec un p99 à 5.3s. Et faut loader 843 Mo avant de répondre quoi que ce soit.

Dans doomLaya, la Laya stock échoue MAP01 en 180s. La v3 adaptée ([azalio/laya-doom-v3](https://huggingface.co/azalio/laya-doom-v3)), ré-entraînée sur du Doom, sort en 61.43s avec p50 108ms sur MPS, en ramassant le shotgun au passage. Donc oui, ça joue -- après entraînement dédié, sur GPU Apple, avec un exécuteur scripté qui fait le vrai boulot (A*, portes avec latch 15 ticks, visée auto).

Mon résumé : sans entraînement sur ta tâche, Laya te sert de presse-papier à 421M. Avec, c'est très fort, mais faut le GPU et les datas qui vont avec.

## OpenDecider, celui qui a gagné le leaderboard

[OpenDecider](https://github.com/manjunathshiva/opendecider), c'est Manjunath qui a décidé d'aller chercher tout le monde sur leur propre benchmark. Résultat : **0.796** avec un Ettin-encoder-400m full fine-tune + tête MLP, loss KL sur des soft targets distillées de Qwen3-235B + DeepSeek.

```bash
pip install opendecider
# 17ms/question sur L40S, 18ms sur M4 Max, ~9ms batché
```

À 50% de coverage, la selective accuracy monte à 0.943 contre 0.882 pour Jev. Sur le papier, le meilleur des deux mondes : open, calibré, rapide.

En pratique : 2 Go de RAM pour charger nano, GPU requis pour tenir les 17ms, phishing à 0.63 contre 0.90 pour Jev (l'OOD le lave), et comme Laya, entraîné sur le train du benchmark. Le test n'a jamais été vu, mais le domaine oui.

Il gagne le bras de fer, mais ça reste 400M avec un GPU derrière. Tu le colles pas dans un Worker Cloudflare ou dans une boucle de jeu sur un laptop.

## Les 150M, et le trou en dessous

openJev-verdict-2.0 (151M), julia-1 (144M multilingue), Open Jev (150M), Largha-150M (144M en+zh), Vela (0.3B-9B). Tous des ModernBERT ou mmBERT-small, tous capables de tourner sur CPU, tous sympas à entraîner (Open Jev annonce 30min sur un T4 Colab). Chiffres self-reported, protocoles différents, donc à prendre avec des pincettes, mais la famille existe.

Le generalist Sabaki fait **22.7M**. Environ 6.5x plus petit que le plus petit de cette bande. Personne d'autre ne descend sous les 100M pour répondre à des questions définies à runtime.

C'est ça, "le plus petit du monde" : pas le meilleur score, la plus petite enveloppe qui lit tes `instructions` + `criteria` et tranche quand aucun spécialiste ne sait répondre.

## Sabaki, le routeur débile et ses experts jetables

Bon, assez parlé des gros. Passons à David, parce que c'est là que ça devient marrant.

Sabaki n'essaie pas d'être un gros modèle malin qui comprend le monde. C'est un MoE organisationnel : 1 routeur sparse au niveau système, des experts indépendants, un seul actif par input. Chaque plugin est un package npm séparé, avec son manifest, ses poids, sa version. Tu installes que ce que tu routes.

L'org [sabaki-js](https://github.com/sabaki-js) : 13 repos, le core `sabaki` (129 commits), 6 plugins `@sabaki-js/*`, les poids, le worker Cloudflare, le template pour écrire le tien.

Le `package.json` du core raconte déjà l'histoire :

```json
"dependencies": { "@typesafe-ai/sdk": "^0.7.0" },
"optionalDependencies": { "onnxruntime-node": "^1.22.0" }
```

En mode nano, zéro dépendance runtime. Que du TypeScript compilé, rien à installer, rien qui peut casser entre deux versions d'ONNX.

### Le routeur, ou comment décider en quelques lignes

Le routeur vit dans `src/index.ts`, et la tokenization ressemble à ça (`src/index.ts:129`) :

```ts
function tokens(s: string): string[] {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/).filter((w) => w.length > 3);
}
```

Minuscules, accents virés, mots de 4 lettres minimum. Ce filtre vire tout le bruit ("le", "de", "ok"). Sur du ticket support, ça change tout parce que ton matching se fait sur des mots qui portent un sens.

Le scoring lui-même est dans `route()` (`src/index.ts:251`), et c'est là que tout se joue :

```ts
const hits = kws.filter((k) =>
  words.some((w) => w.includes(k) || k.includes(w))).length;
const score = hits / Math.sqrt(kws.length);
```

Matching lâche dans les deux sens : `billing` attrape `billed`, `invoice` attrape `invoicing`. La division par la racine évite de pénaliser les grosses listes de keywords, sinon le plugin mail avec ses 600 mots écraserait tout le monde dès qu'un mail contient "hello".

Chaque plugin a son seuil, défaut 0.15 stocké dans `src/index.ts:139`, mail à 0.03 parce que les sujets sont courts. En dessous :

```ts
return { domain: "unknown", decision: null, confidence: 0, plugin: null };
```

Domaine inconnu = `unknown`, jamais un guess inventé pour faire plaisir. C'est volontairement bête comme approche, et c'est exactement ce qui rend le seuillage `automate > 0.8` utilisable plus tard : quand Sabaki répond, c'est qu'un spécialiste a vraiment matché.

Y'a un axe langue en prime via `langid` : un plugin qui déclare `languages` ne concourt que pour ses langues. Pratique pour séparer phishing latin et CJK. Texte trop court = pas de filtre, tout le monde concourt.

Coût total : quelques microsecondes par décision. Aucune matrice à multiplier, aucun réseau à appeler, juste des comparaisons de strings et une division.

### Nano, mon fichier préféré du repo

`src/logreg.ts:28`, la tokenization :

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

Unigrammes + bigrammes. `charged twice` donne `charged`, `twice`, et la paire `charged twice`. C'est tout ce qu'il faut pour capter "double facturation" sans sortir un transformer de 400M.

`src/logreg.ts:46`, la vectorisation, là où le TF-IDF fait son taf :

```ts
const tf = 1 + Math.log(c);  // TF sublinéaire
const val = tf * w.idf[i]!;  // IDF smooth façon sklearn
```

La 10ème occurrence d'un mot compte moins que la première, les mots rares pèsent plus que "please". Exactement la recette sklearn, parité exacte vérifiée sur 20 questions.

Et le commentaire qui m'a fait sourire en relisant :

```ts
// Touche seulement les termes presents (creux) au lieu de balayer 3000 dims.
for (const [t, c] of counts) {
```

Au lieu de balayer 3000 dimensions à chaque ticket, tu touches uniquement la vingtaine de mots présents. Voilà pourquoi ça répond en moins d'1ms. C'est le genre de détail invisible qui change tout en prod, parce que la complexité suit la taille du ticket et pas celle du vocabulaire.

`src/logreg.ts:86`, l'inférence, qui tient en trois lignes :

```ts
// binaire : 1 ligne de coefs + sigmoïde
const pPos = 1 / (1 + Math.exp(-s));
// multiclasse : produit scalaire + softmax, argmax
```

Un produit scalaire, une sigmoïde ou un softmax selon le nombre de classes. Une passe et c'est fini. Zéro token généré, donc zéro JSON cassé à réparer derrière avec des retry et des heuristiques de parsing.

Recette `train.py` : 300 train / 100 test par workflow, split déterministe (1 item sur 5 en test pour éviter le biais temporel), vocab 3000-6000, coefs arrondis à 1e-4 avec zéro perte mesurée. Export JSON `{ vocab, idf, questions }`.

Poids : 20 Ko pour invoices (`duplicate` 0.89) à 650 Ko pour mail (`bucket` 0.889). Le genre de taille qui passe dans un bundle frontend.

Le détail qui m'a scotché : sur mail, MiniLM colle TF-IDF à +/-0.02. Donc nano shippe tel quel. Payer un GPU pour trier des mails, très peu pour moi. En revanche agent_trace coince (`needs_review` 0.59 en nano) : le texte d'observabilité est pauvre, aucun mot ne porte vraiment la décision.

La fabrique qui transforme des poids en plugin, dans `src/plugin.ts:52` :

```ts
export function nanoClassifier(manifest, weights, opts = {}) {
  return definePlugin({ manifest,
    classify: (input) => {
      const r = predict(`${from}${input.state}`, weights, q);
      return { decision: r.decision, confidence: r.confidence, domain: manifest.domain };
    }});
}
```

`decide()` reste synchrone nano, `decideAsync()` débloque ONNX pour mini. Deux chemins, une règle simple : si t'as besoin d'async c'est que tu veux mini, sinon nano suffit. Facile à retenir quand tu codes, facile à debugger quand ça casse.

Pour te montrer que c'est pas juste de la théorie, voilà à quoi ressemble un usage réel :

```ts
import { Sabaki } from "sabaki";
import customerService from "@sabaki-js/customer-service";

const sabaki = new Sabaki().register(customerService);
sabaki.decide({ state: "charged twice, refund please" });
// { decision: "billing", confidence: 0.31, domain: "customer_service" }
```

### Mini, 22 Mo qui changent la donne sur les cas durs

Nano a ses limites, tu l'as vu sur agent_trace juste au-dessus. MiniLM-L6 reprend le flambeau : un encodeur partagé pour tout le domaine, plus une tête linéaire par question. Fine-tune end-to-end pendant 8-12 epochs, lr 2e-5, sur GPU CUDA pour l'entraînement (l'inférence reste CPU, c'est ça qui compte).

Les chiffres qui ont tranché, mesurés sur les mêmes splits :
- encodeur gelé + MLP : 0.65
- full fine-tune : 0.68
- distillation 400M vers embeddings gelés : testée, jetée, moins bonne que les gold labels

Export ONNX via dynamo, parité exacte vérifiée, puis quantif dynamique int8 : 90 Mo -> 22 Mo, **-0.004 accuracy** sur customer_service. ECE inchangée ou meilleure. Chaque export est re-mesuré, sinon l'optimisation ne veut rien dire.

Depuis la 1.0.2, les poids sont embarqués dans le package (`models/<workflow>-int8/` + `modelDir` exporté). `npm i` suffit, mode avion OK. Mettre à jour = publier un patch, signé via trusted publishing.

Concret : `needs_review` passe de 0.59 à **0.82**. `disposition` 0.73 -> 0.76. ECE < 0.14 partout, avec un doute OOD sain (0.2-0.5 sur dragons, recettes et strings vides). C'est ce doute qui autorise le seuillage agressif en prod.

### Generalist, le catch-all qui rend Sabaki vraiment System One

Jev et les autres répondent à tout : n'importe quelle question, n'importe quelles options, définies à runtime. C'est ça le contrat System One qui a rendu Jev viral -- tu poses tes `instructions` + `criteria` avec tes options, il tranche.

Les spécialistes Sabaki savent pas faire ça. Ils connaissent leurs questions (`category`, `duplicate`, `bucket`) et rien d'autre. Sans filet, Sabaki renverrait `unknown` dès que tu sors du script, là où Jev répond toujours quelque chose.

Le generalist c'est ce filet. Un cross-encoder qui lit question + option + state et sort un score, une passe par option, softmax, argmax. 22.7M MiniLM int8 -- 6.5x plus petit que les 144-151M de la bande. Mais son job c'est pas le score, c'est la compatibilité : avec lui branché en fallback, `POST /v1/systemone` accepte n'importe quel state et n'importe quelles questions, comme Jev. Le champ `model` dit qui a vraiment répondu (`@sabaki-js/mail@1.1.2+mini`, `sabaki-generalist-v1`...), donc côté appelant tu changes rien.

Et surtout, c'est un fallback, pas un chef. Règle d'or dans `decideAsync()` : si un spécialiste gagne le routage, il répond. Le generalist ne parle que sur `unknown`. Jamais l'inverse. Ça évite qu'un généraliste moyen vienne écraser un spécialiste bon sur son domaine.

Le loader vit dans `src/generalist.ts`, avec un cache par dossier pour ne pas recharger la session ONNX à chaque call :

```ts
export function loadGeneralist(modelDir: string) {
  // cache par dossier, session ONNX réutilisée
  // tokenizer.json -> Unigram ou wordpiece, détecté auto
  const sess = await ort.InferenceSession.create(
    path.join(modelDir, "generalist.onnx"),
    { intraOpNumThreads: 2 },
  );
}
```

Tu pointes `SABAKI_GENERALIST_DIR` vers un dossier avec `generalist.onnx` + `tokenizer/`, le modèle est swappable. L'id vient de `config.json`, sinon `"sabaki-generalist"`. Le cache `Map` évite de reloader la session à chaque call.

Le format d'entrée, c'est du cross-encoder classique : question, option et state concaténés avec des séparateurs, une ligne par option à scorer :

```ts
const texts = options.map(
  (o) => `${input.question ?? "decision"} [SEP] ${o} [SEP] ${input.state}`,
);
```

Question + option + state, séparés par `[SEP]`, une ligne par option. Options capées à 8 (`slice(0, 8)`), défaut `["yes", "no"]` si tu donnes rien. Au-delà, faut découper côté appelant -- 8 c'est déjà large pour une décision typée.

Ensuite vient le batch malin, le genre d'optimisation qui ne paie pas de mine mais qui divise la latence par le nombre d'options. Au lieu d'un `session.run` par option, tout part en un seul forward :

```ts
// Un seul forward batché pour toutes les options
// (rembourré à la longueur max) au lieu d'un run par option.
const L = Math.max(...encs.map((e) => e.ids.length));
// ids + attention_mask en [options.length, L], padding au padId
const out = await sess.run({ input_ids, attention_mask });
const scores = Array.from(out["score"].data).map(Number);
```

Chaque texte est encodé (wordpiece façon BERT ou unigram SentencePiece selon `tokenizer.json`), paddé à la longueur max du batch, empilé en tenseur `[nb_options, L]`. Un seul `sess.run`, tu récupères un score par option. Sur CPU ça change tout : 20-36ms au lieu de 8x ce temps.

Puis vient le softmax + argmax, avec les probas complètes pour chaque option, exactement dans le format que Jev a popularisé :

```ts
const pr = softmax(scores);
// bi = index du max
const confidence = Math.round(pr[bi] * 1000) / 1000;
const probs = Object.fromEntries(
  options.map((o, i) => [o, Math.round(pr[i] * 1000) / 1000]),
);
```

Et le détail qui rend le truc utilisable en prod au lieu de rester une démo, c'est `abstainAt` :

```ts
if (input.abstainAt !== undefined && confidence < input.abstainAt) {
  return { decision: null, confidence, domain: "generalist", probabilities: probs };
}
```

Opt-in, pas d'abstention par défaut. Tu passes `abstainAt: 0.6-0.7` et tout ce qui est mou revient `null` au lieu d'un guess. Vu que le softmax sort des 1.00 même quand il a tort hors-distrib, c'est pas du luxe. Le GUIDE le recommande pour tout usage autonome : en dessous du seuil, tu demandes une clarification au lieu d'auto-résoudre.

Pour finir, voilà le même montage avec le fallback generalist : quand aucun spécialiste ne matche, c'est lui qui prend le relais au lieu de rendre `unknown`.

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
// spécialiste mail si le routing matche, sinon generalist en catch-all façon Jev
```

Les générations du generalist, toutes mesurées pareil sur PhishNChips (2000 mails) et sur le test typed-decisions pour comparer ce qui est comparable :
- v4 : 0.29 test, R=0.026 phishing. À jeter, ça répondait à côté.
- A (22M 80k) : 0.546, R=0.406. Ça commence à ressembler à quelque chose.
- mini v1 servie : **0.536, R=0.616**. C'est celle qui tourne sur le site. Recall phishing correct, test moyen.
- B (144M scratch) : 0.568, R=0.062. Plus gros, à peine meilleur en test, nul en phishing.

Le 144M from scratch qui transfère pas mieux, ça m'a bien calmé sur l'idée de "mettre plus de params pour généraliser". À tâche égale, le gros coûte plus cher sans deviner mieux. Même comme catch-all, le petit fait le taf. Et il reste EN-only (`all-MiniLM-L6-v2`), routage EN, FR hors-distrib. Pour du FR, faut passer par un spécialiste entraîné dessus, pas par le generalist.

## Doom, le seul test qui compte vraiment pour moi

doomLaya, c'est Laya et Jev qui jouent à FreeDoom pour de vrai. Le modèle choisit `command / target / weapon`, l'exécuteur trace le chemin A*, ouvre les portes, vise, clique. Télémétrie par tick, vidéos, SHA des runs. J'y contribue, donc je parle pas d'un leaderboard lu de loin.

v0.1.0, MAP01 seed 48, skill 3, 35 ticks/s, même exécuteur :

| Modèle | Résultat | p50 HTTP | Coût API |
|---|---|---|---|
| Laya stock | échec 180s | 106ms | $0 |
| Laya v3 adaptée | sortie 61.43s | 108ms | $0 |
| Jev 1.13 | sortie 68.97s | 357ms | $0.0046 |

Deux sorties propres, sans mort, avec Laya qui ramasse le shotgun au passage parce que l'exécuteur gère le pickup tout seul. Honnêteté oblige : Laya v3 a été entraînée sur Doom, Jev non. Un seed, une map, ça prouve rien de général. Le README du projet le dit noir sur blanc, et c'est à son honneur de pas survendre le résultat.

Côté Sabaki ([plugin-doom](https://github.com/sabaki-js/plugin-doom)) : ViZDoom en Python qui appelle un serveur JS à chaque tick. Nano ~18k req/s, mini ~71 req/s sur un thread i5. Le tick 35Hz passe large, même sur un laptop moyen.

Avec boussole de sortie, mini sort MAP01 en 2-4 runs sur 6, nano 0/6. Logique : le texte perd le spatial, les états doomLaya plafonnent vers 0.57 que ce soit MiniLM ou ModernBERT-base. Quand l'info spatiale manque, aucun classifieur texte ne la réinvente.

Les voisins ont refait le match à données égales : [doomgemma](https://github.com/dexmac221/doomgemma) colle une LoRA 27min sur une RTX 4070 et amène Gemma 4 E2B au niveau Laya v3 en jeu (6/6 vs 6/6) et au-dessus en décisions isolées. À taille égale, un décodeur va aussi vite que Laya (270M : 22ms vs 23ms). À résultat égal, Laya reste ~3x plus rapide parce qu'elle y arrive avec un plus petit modèle.

Ma lecture : l'entraînement sur la tâche compte plus que l'architecture. Un petit spécialiste entraîné bat un gros généraliste qui découvre. Exactement le pari Sabaki. Le papier qui suit, *System Switch* ([arXiv:2610.09683](https://arxiv.org/abs/2610.09683)), pousse la logique jusqu'au bout : petit modèle rapide qui joue, gros modèle raisonneur qui reprend la main quand une gate s'ouvre. Le pre-triage Sabaki (`automate > 0.85 sinon escalade`) appliqué au jeu.

## Ce qui a été sacrifié

Chaque feature absente finance une autre, c'est la règle du jeu quand tu vises le CPU. La liste honnête, comme pour Bareiron où chaque ligne de C était un tradeoff :

**Sabaki raconte rien.** Il tranche entre des options que tu lui donnes, avec une proba. Pour une explication, un résumé, du texte libre, prends un LLM.

**Le français reste hors-distrib pour le generalist.** Routage EN (`all-MiniLM-L6-v2`), sonde 1/4 FR vs 3/4 EN sur cas similaires. Le plugin mail vient d'une boîte majoritairement FR mais anonymisée : 0 PII, -0.024 accuracy pour un vocab sans termes personnels. L'anonymisation se paie, mais c'était non négociable.

**Le softmax se montre trop sûr quand il sort de sa zone.** Des faux à 1.00 observés, oui. D'où le pre-triage recommandé dans le GUIDE : `abstainAt: 0.6-0.7` pour rendre `null` sous le seuil, puis gate `confidence > 0.85` pour automatiser, humain sinon. Référence mesurée : recall phishing 0.62 à précision 0.87. De quoi couper la file en deux, pas de quoi virer les reviewers.

**Nano galère sur les traces d'agents.** 0.34 à 0.59 selon la question. Mini remonte `needs_review` à 0.82, mais `risk / urgency / action` restent durs. Le texte d'observabilité est juste pauvre en signaux lexicaux.

**Doom en texte plafonne.** Vers 0.57, MiniLM comme ModernBERT-base. Tant que tu restes sur du texte sans pixels, MAP02 te bloque. La voie crédible pour un vrai joueur, c'est vision + RL (tiny-doom-defender, 1.1M params depuis pixels), pas un meilleur classifieur texte.

**Le benchmark dérive par batches.** typed-decisions est généré par fournées, le split temporel est en fait un split de batches. `drift_tool.py` sort 0.82 sur customer_service, 0.67 sur agent_trace (0.5 = indistinguable). Conséquence mesurée : les poids publiés font 0.733 en mixte vs 0.61 sur split officiel. Le chiffre officiel est donc conservateur. La calibration Platt / temperature+bias ne transfère pas entre batches, donc on shippe juste le temperature scaling calibré sur batches récents. Règle maison : `drift_tool.py` d'abord, warn au-dessus de 0.6, block au-dessus de 0.8. Personne d'autre ne publie ça, tout le monde devrait.

## Le résultat final, chiffres en main

D'un côté un i5 de laptop, de l'autre une API qui facture au call. Voilà ce que chaque mode donne concrètement :

- nano : <1ms, ~18k req/s, 20-650 Ko, 0 dep
- mini : ~20ms, ~71 req/s, 22 Mo int8, onnxruntime en optionnel
- generalist : 20-36ms, 22.7M, le plus petit généraliste open que je connaisse

Plusieurs domaines chargés : ~0.5 Go RAM en lazy-load par domaine au lieu de ~2 Go pour tout. Déterministe : 100/100 inputs identiques donnent le même output. Seuils par question, gate sur `confidence`, `unknown` quand rien ne matche.

Sur Bareiron, faire tourner 3+ joueurs ça ramait parce que chaque joueur coûtait un chunk à 200ms. Ici faire tourner 3+ domaines ça passe sans broncher, parce que chaque expert est minuscule et chargé à la demande au lieu de tout loader d'un coup. Même philosophie du "petit qui suffit", appliquée à un autre hardware.

## La philo

p2r3 disait : *"J'aime juste l'idée que cette toute petite puce à 1 balles puisse faire tourner quelque chose d'aussi avancé que Minecraft."*

Même délire ici : j'aime l'idée que 20 Ko de JSON et une centaine de lignes de TS remplacent un appel GPU pour choisir un label. Ça remplace évidemment pas tout, faut pas déconner. Ça remplace le cas relou où tu veux un label en millisecondes, en local, avec une confiance que tu peux raisonnablement seuiller au lieu de croiser les doigts.

Les tradeoffs, écrits noir sur blanc :
- encodeur -> comptage de mots : 7 points en moins, latence divisée par 1000, infra à zéro
- gros modèle unique -> plugins npm : gate plus grossière, ops infiniment plus simples
- génération -> décision typée : fini le parsing qui casse et les options inventées
- confiance brute -> pre-triage : abstain d'abord, automatisation au-dessus de 0.85, humain pour le reste

**Les 3 trucs à retenir :**

1. **7 points en moins, 1000x plus rapide** -- 0.61/0.69 vs 0.75-0.80, mais <1ms/20ms CPU offline contre 25s CPU ou API payante. Un score sans son coût ne veut rien dire.
2. **Routeur simple + experts séparés** -- `hits / sqrt(keywords)`, threshold, `unknown`. Chaque plugin s'entraîne, se versionne et se shippe seul. Sur mail, TF-IDF colle MiniLM : le GPU ne sert à rien ici.
3. **Offline-first avec calibration honnête** -- `npm i`, poids embarqués, 0 GPU, ECE < 0.14, abstain, drift tool. Le seul stack du comparo qui tient une game loop à 35Hz sans GPU.

Si le projet t'intéresse, tout est en MIT sur [github.com/sabaki-js](https://github.com/sabaki-js). La version académique avec mesures et bibtex, c'est le [preprint v1](/assets/paper/sabaki-organizational-moe-typed-decisions.pdf). Et si tu veux voir Goliath jouer à Doom pour de vrai, direction [azalio/doomLaya](https://github.com/azalio/doomLaya) xD
