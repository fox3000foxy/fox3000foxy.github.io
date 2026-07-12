---
title: "Luna Protocol: أنشأت بوت Discord مستقلاً يحاكي الكائن البشري"
description: "Luna Protocol هو بوت Discord مستقل تمامًا مزود بنموذج لغة محلي، قادر على المحادثة الطبيعية مع النوم وأخطاء الطباعة والتردد والنسيان وإجهاد المواضيع والرسائل العفوية."
date: 2026-07-11
tags:
  - discord-bot
  - llm
  - typescript
  - هندسة-مبنية-على-الأحداث
  - الذكاء-الاصطناعي
  - مفتوح-المصدر
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "QnONLaNcKbjkThO8BxJ4NF2RFVDcd/wvXjoljn54JqNaLFoEnVM5H7npiOfS2Ojfz8l/EuKw4TJcPGa6jqxH2g=="
---

# Luna Protocol: أنشأت بوت Discord مستقلاً يحاكي الكائن البشري
ماذا لو كان بوت Discord قادرًا على **النوم** وارتكاب **أخطاء الطباعة** وال**تردد** و**نسيان** الرد، وأحيانًا إرسال رسالة من تلقاء نفسه؟ هذا بالضبط ما يفعله **Luna Protocol**: بوت Discord مستقل تمامًا يعمل بنموذج لغة محلي (llama.cpp) ويتحدث مثل كائن بشري غير مثالي.
بدون مطالبات صارمة، بدون ردود روبوتية. لدى Luna **نظام إطلاق أولوية** و**تأخيرات متغيرة** و**جداول نوم** و**رسائل عفوية**، وحتى **خط أنابيب TTS** لإرسال الرسائل الصوتية. كل ذلك قابل للتكوين عبر ملف `config.yml` بسيط قابل لإعادة التحميل.
في هذه المقالة، نحلل الهيكلية الكاملة: من ناقل الأحداث العام إلى خط أنابيب TTS، مرورًا بنظام الإطلاق والمكونات البشرية ومجموعة بيانات الضبط الدقيق.
![نظرة عامة على الهيكلية -- المكونات العامة وتدفق البيانات](/images/luna-protocol/01-architecture-overview.svg)

---

## الهندسة المعمارية: ناقل أحداث مُنقَّب

Le cœur de Luna est un **TypedBus** -- un bus d'événements générique fortement typé en TypeScript. C'est la brique fondamentale sur laquelle tout repose.

```typescript
type EventMap = Record<string, unknown[]>;

export class TypedBus<Events extends EventMap> {
  private listeners = new Map<keyof Events, Set<(...args: unknown[]) => void>>();

  on<K extends keyof Events>(event: K, listener: (...args: Events[K]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as (...args: unknown[]) => void);
  }

  emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
    this.listeners.get(event)?.forEach((fn) => { fn(...args); });
  }
}
```

Deux buses principaux en découlent :

- **`llmBus`** -- gère les tokens LLM, les erreurs, les crashes, le reset
- **`stateBus`** -- gère les changements d'état avec persistence automatique

```
┌─────────────────────────────────────────────────────┐
│                   core/bus.ts                        │
│  TypedBus<K, V> -- on / off / once / emit            │
├──────────────────┬──────────────────────────────────┤
│   core/llm-bus   │       state/state-bus             │
│  token / done /  │     state:changed                 │
│  error / crash / │     → persistence auto            │
│  flush / ready / │                                   │
│  reset           │                                   │
└────────┬─────────┴────────┬─────────────────────────┘
         │                  │
┌──────────────────┐  ┌────▼──────────────────────┐
│ core/llm-core.ts │  │ bot.ts (Eris)             │
│ mode direct      │  │ bot/pending.ts             │
│   llama-server   │  │ bot/reactions.ts           │
│ mode online      │  │ state/trigger.ts           │
│   OpenAI API     │  │ state/state.ts             │
│                  │  │ behavior/*                 │
│                  │  │ tts/*                      │
│                  │  │ spontaneous.ts             │
└──────────────────┘  └────────────────────────────┘
```

L'avantage de cette approche : chaque module est **déconnecté** du reste. Le LLM émet des tokens sur le bus, le bot les consomme, le state se met à jour automatiquement. Aucune dépendance circulaire.

---

![Message Processing -- flux complet de traitement d'un message](/images/luna-protocol/02-message-processing.svg)

## Le système de déclenchement : qui décide quand Luna répond ?

Chaque message entrant est évalué par `evaluateMessage()` qui retourne un `TriggerResult` avec une raison de déclenchement. L'ordre de priorité est critique :

| # | Raison | Conditions | Bypass ignore | Bypass pause |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | Oui (0%) | Oui |
| 2 | `dm` | MP avec `replyInDM = true` | Oui (0%) | Non |
| 3 | `name` | "Luna"/"Pixie"/alias (mot entier) | Non (8%) | Non |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (mot entier) | Non (8%) | Non |
| 5 | `follow-up` | Bot était dernier locuteur + < 15s + < 3 / 60s | -- | -- |
| 6 | `random` | 1.5% de chance sur les messages non correspondants | Non (8%) | Non |

Le matching est **mot entier** (`\b`) : "ai" ne correspond pas à "mais", "vrai", "lait".

![Trigger evaluation -- décision d'entrée pour chaque message](/images/luna-protocol/03-trigger-evaluation.svg)

### Le mécanisme de follow-up

Quand Luna répond à un message, elle s'enregistre comme `lastSpeaker`. Tout message suivant dans les 15 secondes déclenche une réponse **immédiate** -- pas de timer, pas de vérification de keyword. Budget : 3 follow-ups par fenêtre de 60 secondes.

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### Le cooldown

8 secondes entre deux réponses dans le même canal. Contourné par les mentions et les follow-ups.

---

## Les comportements humains : la concentration variable

C'est ici que Luna devient intéressante. Chaque type de déclenchement a ses propres **seuils de concentration** : un délai min/max, une chance d'ignorer, et une chance de réagir.

| Trigger | Délai min | Délai max | Ignore | Réaction |
|---------|----------|----------|--------|----------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

Le calcul du délai prend aussi en compte :
- **La longueur du message** : plus le message est long, plus Luna met de temps à "lire"
- **L'inactivité** : si Luna n'a pas été active depuis 10 minutes, le délai est multiplié par 2 (simulation du "réveil")
- **Le sommeil** : en mode `slow`, le délai est multiplié par 3 à 5

```typescript
export function computeDelay(
  reason: string | null = null,
  sleepBehavior?: string | null,
  msgLength?: number,
  inactivityMs?: number
): number {
  const t = getThresholds(reason);
  let delay = t.delay_min + Math.random() * (t.delay_max - t.delay_min);
  if (msgLength) {
    const readingFactor = Math.min(msgLength / 500, 3);
    delay *= 1 + readingFactor * (0.3 + Math.random() * 0.7);
  }
  if (sleepBehavior === "slow") {
    delay *= 3 + Math.random() * 2;
  }
  delay *= 0.5 + Math.random() * 1.5; // jitter agressif
  return delay;
}
```

---

## جدول النوم

Luna peut dormir. Configurable via `config.yml` :

```yaml
timezone: "Europe/Paris"
time_schedules:
  - start: "00:00"
    end: "07:00"
    behavior: sleep
  - start: "23:00"
    end: "00:00"
    behavior: slow
  - start: "07:00"
    end: "08:00"
    behavior: short
```

| Mode | Effet |
|------|-------|
| `sleep` | Seules les mentions et MP passent |
| `slow` | Délai ×3-5, réactions quasi nulles |
| `short` | Chance d'ignore +30%, réactions quasi nulles |

Pendant les heures de sommeil, le statut Discord passe en `invisible`.

---

## أخطاء الكتابة

Luna peut faire des fautes de frappe -- et les corriger après 2-4 secondes. Le layout clavier est configurable (AZERTY ou QWERTY).

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... toutes les touches adjacentes
};
```

Exemple AZERTY : `bonjour → bonjpur`, `salut → slaut`, `comment → cpmment`.

Trois styles de correction :

| Style | Comportement |
|-------|-------------|
| `edit` | Édite le message |
| `message` | Nouveau message : `word*` |
| `mixed` | 50/50 aléatoire (défaut) |

---

## التردد والنسian

**Hésitations** : 15% de chance de commencer par un mot de remplissage (`uh...`, `um...`, `well...`, `hmm...`, `so...`).

**Oublis** : même après avoir matché un trigger, Luna peut "oublier" de répondre avec une probabilité de 3%. Pas de message, pas de réaction -- comme si elle n'avait rien vu.

**Fatigue thématique** : si un mot revient trop souvent dans les 10 derniers messages (seuil : 3 occurrences), les délais sont multipliés et la chance d'ignore augmente de 15%.

---

## خط أنابيب LLM: وضعان

### Mode `direct` (défaut)

Le bot envoie directement les requêtes à un `llama-server` local en HTTP. Le modèle est partagé, avec prompt cache et 4 slots concurrents. Deux processus PM2 : le serveur LLM et le client bot.

### Mode `online`

Le bot appelle n'importe quelle API compatible OpenAI (OpenAI, OpenRouter, Groq, Together...). Pas de LLM local nécessaire.

### Le streaming en temps réel

Le LLM stream sa réponse ligne par ligne (`\n`). Chaque ligne est découpée en mots, émis un par un sur `llmBus.emit("token", word)`. À chaque `\n`, un événement `flush` est émis -- le bot envoie immédiatement le message accumulé. Pas de délai simulé : le rythme est celui du LLM.

```typescript
function emitWordTokens(chunk: string): void {
  const words = chunk.match(/\S+/g) ?? [];
  wordEmitQueue.push(() => {
    let i = 0;
    const emitNext = () => {
      llmBus.emit("token", words[i]);
      i++;
      if (i < words.length) {
        const delay = MIN_WORD_DELAY + Math.random() * (MAX_WORD_DELAY - MIN_WORD_DELAY);
        setTimeout(emitNext, delay);
      } else {
        llmBus.emit("flush");
      }
    };
    emitNext();
  });
}
```

La file d'attente (`requestQueue`) traite les requêtes une par une, avec nettoyage automatique quand la file dépasse 100 éléments.

---

## الرسائل العفوية

Toutes les 5 minutes, 12% de chance que Luna poste un message de son propre chef. Le serveur est sélectionné par un système de **poids linéaire** : le serveur le plus actif a N× plus de chances que le dernier.

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

Le contexte des 5 derniers messages est lu, et Luna joint la conversation "naturellement".

---

## خط أنابيب TTS: الرسائل الصوتية

Avec 8% de chance, Luna envoie un message vocal au lieu de texte. La pipeline complète :

1. **Piper TTS** synthétise le texte en WAV
2. **ffmpeg** convertit en OGG
3. Le waveform est calculé pour l'aperçu Discord
4. Le fichier est uploadé via l'API Discord CDN
5. Le message vocal est envoyé

```typescript
export async function sendTextAsVoiceMessage(
  channelId: string, replyToMessageId: string, text: string
): Promise<void> {
  const safe = sanitizeForTTS(text);
  const { audio: wavBuf } = await synthesize(safe);
  const oggBuf = await wavToOgg(wavBuf);
  const durationSecs = await getAudioDuration(oggBuf);
  const waveform = buildWaveformBase64();
  const { uploadUrl, uploadFilename } = await requestUploadUrl(channelId, oggBuf.byteLength, durationSecs);
  await putFileToUploadUrl(uploadUrl, oggBuf);
  await postVoiceMessage(channelId, uploadFilename, durationSecs, waveform, replyToMessageId);
}
```

![TTS Pipeline -- du texte synthétisé au message vocal Discord](/images/luna-protocol/10-tts-pipeline.svg)

---

## مكافحة البريد العشوائي والاستمرارية

### Anti-spam

File d'attente par `channelId:userId`. Un seul message en file par utilisateur par canal. Traité dès que la réponse en cours se termine.

### Limites de session

Après 8 échanges, Luna fait une pause de 30 secondes. Le compteur se réinitialise après 3 minutes d'inactivité.

### Persistence automatique

Chaque mutation d'état émet sur `stateBus` → sauvegarde automatique (debounce 500ms). Plus besoin d'appels `saveAllState()` manuels. L'état persisté inclut : pendingMessages, paused, cooldowns, timestamps, lastSpeaker, compteurs de follow-up.

---

## تكوين إعادة التحميل الفوري

Un seul fichier `config.yml`. La plupart des valeurs sont **hot-reloadable** -- les changements sont pris en compte sans redémarrage.

| Catégorie | Hot-reload |
|-----------|-----------|
| Triggers, keywords, noms | ✅ |
| Concentration, délais | ✅ |
| Typos, burst, fatigue | ✅ |
| Sleep schedules | ✅ |
| TTS, voice messages | ✅ |
| Discord token, LLM mode | ❌ (redémarrage requis) |

```typescript
// config.ts -- les getters retournent des valeurs live
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## مجموعة البيانات: Discord-Dialogues

Le modèle est fine-tuné sur [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) : **7.3M échanges**, **17M tours**, **140M mots**. Des vraies conversations Discord printemps-été 2025, filtrées (PII, ToS, bots, commandes). Apache 2.0.

| Métrique | Valeur |
|----------|--------|
| Échantillons | 7 303 464 |
| Tours totaux | 16 881 010 |
| Mots totaux | 139 922 950 |
| Tokens moyens | 32.8 |
| Tokenizer | Hermes-3-Llama-3.1-8B |

Le modèle quantifié utilisé est un GGUF (par exemple `Discord-Hermes-3-8B.Q3_K_M.gguf`).

![Distribution du dataset Discord-Dialogues](/images/luna-protocol/dataset-distribution.svg)

---

![Complete Lifecycle -- comportement complet du bot du message à la réponse, incluant les timers et cas limites](/images/luna-protocol/22-complete-lifecycle.svg)

## مخططات الهندسة المعمارية

Le dossier `state-machines/` contient **24 diagrammes Mermaid** couvrant l'ensemble du code source. Chaque diagramme a une explication détaillée en langage humain.

Parmi les plus importants :

| # | Diagramme | Type |
|---|-----------|------|
| 01 | Architecture Overview | `graph` |
| 02 | Message Processing (complet) | `stateDiagram` |
| 03 | Trigger Evaluation | `flowchart` |
| 04 | LLM Core Queue (3 backends) | `stateDiagram` |
| 10 | TTS Pipeline | `flowchart` |
| 13 | State Persistence | `flowchart` |
| 21 | Timing Gantt | `gantt` |
| 22 | Complete Lifecycle | `stateDiagram` |

Ces diagrammes sont une mine d'or pour comprendre le flux complet : du message entrant à la réponse, en passant par les timers et les cas limites.

---

## Le code de déclenchement en détail

Le trigger est évalué par `evaluateMessage()` dans `state/trigger.ts`. Voici la logique complète :

```typescript
export function evaluateMessage(
  message: Eris.Message, botId: string, botUsername: string, isFollowUp = false
): TriggerResult {
  if (message.author.bot) return { shouldRespond: false, reason: null, botName: "" };
  if (message.content === "-stop") return { shouldRespond: true, reason: "stop", botName: "" };
  if (message.content === "-start") return { shouldRespond: true, reason: "start", botName: "" };
  if (message.content === "-clear") return { shouldRespond: true, reason: "clear", botName: "" };

  const isMentioned = message.mentions.some((u) => u.id === botId);
  if (isMentioned) return { shouldRespond: true, reason: "mention", botName };
  if (!message.guildID) return { shouldRespond: true, reason: "dm", botName };
  if (isPaused()) return { shouldRespond: false, reason: null, botName: "" };
  if (isOnCooldown(channelId)) return { shouldRespond: false, reason: null, botName };

  // ... matching par nom, keyword, follow-up, random
}
```

Le cache de regex (`hasWordCache`) évite de recompiler les patterns à chaque message.

---

## ردود الفعل

Luna réagit aux messages avec des emojis. 30% de chance d'utiliser un emoji custom du serveur, 70% un emoji unicode. La réaction est déclenchée après le délai de concentration, pas immédiatement.

Les commandes par réaction sur les messages de Luna :
- ❌ → Stop
- ▶️ → Start
- 🗑️ → Clear

---

## أسلوب الرد

Le style de réponse est pondéré selon l'activité récente de Luna dans le canal :

| Contexte | messageReference | mentionRepliedUser | Poids |
|----------|-----------------|-------------------|-------|
| Froid | true | false | 70% |
| Froid | true | true | 20% |
| Froid | false | false | 10% |
| Actif | true | false | 50% |
| Actif | true | true | 15% |
| Actif | false | false | 30% |
| Actif | false | true | 5% |

En MP, `messageReference` est toujours `false`.

---

## رسائل متسلسلة

Avec 15% de chance, une réponse est découpée en 2-3 fragments envoyés au rythme humain (1.5-4 secondes entre chaque fragment). Simule quelqu'un qui tape en plusieurs fois.

![Timing Gantt -- temps d'attente réels pour les délais, réactions, streaming LLM et corrections](/images/luna-protocol/21-timing-gantt.svg)

---

## الحالة الديناميكية

Le statut Discord de Luna alterne entre plusieurs presets configurés, tournant toutes les 15 minutes. Types supportés : Playing (0), Streaming (1), Listening (2), Watching (3), Custom (4), Competing (5). Pendant le sommeil, le statut passe en `invisible`.

```yaml
dynamic_status_presets:
  - status: online
    text: "avec les pixels"
    type: 0       # Playing
  - status: idle
    text: "du bruit blanc"
    type: 2       # Listening
```

Un jitter aléatoire (×0.5-1.0) évite les rotations prévisibles. 10% des tentatives sont sautées pour éviter la répétition.

## L'indicateur de frappe

Avant d'appeler le LLM, Luna appelle `startTyping()`. Un `setInterval` rafraîchit l'indicateur toutes les 8 secondes pendant la génération. Nettoyé dans le `finally` (`clearInterval`).

```typescript
const startTyping = () => {
  client.sendChannelTyping(message.channel.id);
  typingIntervals.set(
    message.channel.id,
    setInterval(() => {
      client.sendChannelTyping(message.channel.id);
    }, 8000)
  );
};
```

## La récupération après crash

Si le LLM crash (processus `llama-server` qui meurt), Luna détecte l'événement via `llmBus.emit("crash", code)` et tente de redémarrer avec un backoff exponentiel. Évite les boucles de redémarrage infini.

## معلمات LLM

Les paramètres sont hardcodés dans `src/config.ts` :

```yaml
temp: 0.75
dynatemp-range: 0.15
top-k: 40
top-p: 0.95
min-p: 0.05
repeat-penalty: 1.12
repeat-last-n: 256
presence-penalty: 0.1
batch: 4096
ubatch: 256
context: 4096
```

Le template ChatML (`<|im_start|>/<|im_end|>`) est utilisé. Le nombre de threads est auto-détecté via `os.cpus().length`.

---

## الإعداد

```bash
npm install
cp config.example.yml config.yml
# éditer config.yml
npm run dev                    # dev (hot reload)
npm run build && npm start     # production
```

| Script | Description |
|--------|-------------|
| `build` | Bundle CLI autonome |
| `start` | Lance le bot |
| `lint` / `format` / `check` | Biome |
| `test` | Tests (Bun) |
| `download-model` | GGUF depuis HuggingFace |
| `diagrams` | Exporte les diagrammes Mermaid en SVG/PNG |

### Déploiement PM2

```bash
./start.sh   # lance llm-server + llm-client sous PM2
```

---

## الخلاصة

Luna Protocol n'est pas juste un bot Discord avec un LLM. C'est un **système comportemental complet** qui simule les imperfections humaines : les oublis, les fautes de frappe, le sommeil, les hésitations, la fatigue. Le tout architecturé autour d'un bus d'événements typé, avec 24 diagrammes Mermaid documentant chaque flux.

Le code est open source, le dataset est public, et la configuration est hot-reloadable. Si le sujet vous intéresse, plongez dans le code -- c'est plus accessible qu'il n'y paraît.

| Ressource | Lien |
|-----------|------|
| Dépôt GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
