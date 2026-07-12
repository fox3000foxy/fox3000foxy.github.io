---
title: "Luna Protocol: 人間を模倣する自律型Discordボットを作った"
description: "Luna Protocolは、ローカルLLMを備えた完全自律型Discordボットで、睡眠、タイプミス、躊躇、忘却、テーマ疲労、自発的なメッセージによる自然な会話が可能です。"
date: 2026-07-11
tags:
  - discord-bot
  - llm
  - typescript
  - イベント駆動アーキテクチャ
  - 人工知能
  - オープンソース
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "ymnxOFGc7UN1HF8oUAOFjxejS9tCFSpCUWHkdHIjgk4aXXwVdbWXyhesroNSe18Q+gfLifpxljcqlAFeVVWkhA=="
---

# Luna Protocol: 人間を模倣する自律型Discordボットを作った
Discordボットが**眠ったり**、**タイプミスをしたり**、**躊躇したり**、**返答を忘れたり**、ときには自発的にメッセージを送ったりしたらどうでしょうか? それが**Luna Protocol**がactly doing: ローカルLLM (llama.cpp) を動作させ、不完全な人間のように会話する完全自律型Discordボットです。
堅いプロンプトもロボット的な回答もありません。Lunaには**優先度付きトリガーシステム**、**可変遅延**、**スリープスケジュール**、**自発メッセージ**、さらには音声メッセージを送る**TTSパイプライン**があります。すべてシンプルな`config.yml`ファイルでホットリロード可能に設定できます。
この記事では、完全なアーキテクチャを分解します: 汎用イベントバスからTTSパイプラインまで、トリガーシステム、人間コンポーネント、ファインチューニングデータセットを含めて。
![アーキテクチャ概要 -- グローバルコンポーネントとデータフロー](/images/luna-protocol/01-architecture-overview.svg)

---

## アーキテクチャ: 型付きイベントバス

Lunaの心臓は**TypedBus** -- 強い型付けされた汎用イベントバス（TypeScript）。すべての基盤となる基本ブロックです。

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

そこから2つのメインバスが派生します：

- **`llmBus`** -- LLMトークン、エラー、クラッシュ、リセットを管理
- **`stateBus`** -- 自動永続化付きの状態変更を管理

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

このアプローチの利点：各モジュールは残りから**切断**されています。LLMはバスにトークンを発行し、ボットが消費し、状態が自動的に更新されます。循環依存はありません。

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

### フォローアップメカニズム

Quand Luna répond à un message, elle s'enregistre comme `lastSpeaker`. Tout message suivant dans les 15 secondes déclenche une réponse **immédiate** -- pas de timer, pas de vérification de keyword. Budget : 3 follow-ups par fenêtre de 60 secondes.

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### クールダウン

同じチャンネルでの2つの回答間の8秒。メンションとフォローアップで回避。

---

## 人間的行動: 可変コンセントレーション

C'est ici que Luna devient intéressante. Chaque type de déclenchement a ses propres **seuils de concentration** : un délai min/max, une chance d'ignorer, et une chance de réagir.

| Trigger | Délai min | Délai max | Ignore | Réaction |
|---------|----------|----------|--------|----------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

遅延の計算は以下も考慮します：
- **メッセージの長さ**：メッセージが長いほど、Lunaが「読む」のに時間がかかります
- **非アクティブ**：Lunaが10分間アクティブでない場合、遅延は2倍になります（「起床」シミュレーション）
- **睡眠**：`slow`モードでは、遅延は3～5倍になります

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

## スリープスケジュール

Lunaは眠ることができます。`config.yml`で設定可能：

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

睡眠時間中、Discordのステータスは`invisible`に変わります。

---

## タイプミス

Lunaはタイプミスをすることができます -- 2-4秒後に修正します。キーボードレイアウトは設定可能（AZERTYまたはQWERTY）。

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... 隣接するすべてのキー
};
```

Exemple AZERTY : `bonjour → bonjpur`, `salut → slaut`, `comment → cpmment`.

3つの修正スタイル：

| Style | Comportement |
|-------|-------------|
| `edit` | Édite le message |
| `message` | Nouveau message : `word*` |
| `mixed` | 50/50 aléatoire (défaut) |

---

## 犹予と忘却

**Hésitations** : 15% de chance de commencer par un mot de remplissage (`uh...`, `um...`, `well...`, `hmm...`, `so...`).

**Oublis** : même après avoir matché un trigger, Luna peut "oublier" de répondre avec une probabilité de 3%. Pas de message, pas de réaction -- comme si elle n'avait rien vu.

**Fatigue thématique** : si un mot revient trop souvent dans les 10 derniers messages (seuil : 3 occurrences), les délais sont multipliés et la chance d'ignore augmente de 15%.

---

## LLMパイプライン: 2つのモード

### `direct`モード (デフォルト)

ボットはHTTPでローカルの`llama-server`に直接リクエストを送信します。モデルはプロンプトキャッシュと4つの同時スロットで共有されます。2つのPM2プロセス：LLMサーバーとボットクライアント。

### `online`モード

ボットはOpenAI互換API（OpenAI、OpenRouter、Groq、Together...）を呼び出します。ローカルLLMは不要です。

### リアルタイムストリーミング

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

キュー（`requestQueue`）はリクエストを1つずつ処理し、100要素を超えると自動クリーンアップされます。

---

## 自発的なメッセージ

Toutes les 5 minutes, 12% de chance que Luna poste un message de son propre chef. サーバーは**線形重み付け**システムで選択されます：最もアクティブなサーバーは最後のサーバーよりN×多くの確率を持ちます。

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

過去5メッセージのコンテキストが読み込まれ、Lunaは「自然に」会話に参加します。

---

## TTSパイプライン: ボイスメッセージ

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

## スパム対策と永続化

### アンチスパム

`channelId:userId`ごとのキュー。ユーザーごとにチャンネルごとに1つのメッセージのみ。現在の回答が完了次第処理されます。

### セッション制限

8回の交流後、Lunaは30秒の休憩をとります。カウンターは3分の非アクティブ後にリセットされます。

### 自動永続化

Chaque mutation d'état émet sur `stateBus` → sauvegarde automatique (debounce 500ms). Plus besoin d'appels `saveAllState()` manuels. L'état persisté inclut : pendingMessages, paused, cooldowns, timestamps, lastSpeaker, compteurs de follow-up.

---

## ホットリロード設定

`config.yml`が1つのファイル。ほとんどの値は**ホットリロード可能** -- 再起動なしで変更が適用されます。

| Catégorie | Hot-reload |
|-----------|-----------|
| Triggers, keywords, noms | ✅ |
| Concentration, délais | ✅ |
| Typos, burst, fatigue | ✅ |
| Sleep schedules | ✅ |
| TTS, voice messages | ✅ |
| Discord token, LLM mode | ❌ (redémarrage requis) |

```typescript
// config.ts -- ゲッターはライブ値を返します
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## データセット: Discord-Dialogues

Le modèle est fine-tuné sur [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) : **7.3M échanges**, **17M tours**, **140M mots**. Des vraies conversations Discord printemps-été 2025, filtrées (PII, ToS, bots, commandes). Apache 2.0.

| Métrique | Valeur |
|----------|--------|
| Échantillons | 7 303 464 |
| Tours totaux | 16 881 010 |
| Mots totaux | 139 922 950 |
| Tokens moyens | 32.8 |
| Tokenizer | Hermes-3-Llama-3.1-8B |

使用されている量子化モデルはGGUFです（例：`Discord-Hermes-3-8B.Q3_K_M.gguf`）。

![Distribution du dataset Discord-Dialogues](/images/luna-protocol/dataset-distribution.svg)

---

![Complete Lifecycle -- comportement complet du bot du message à la réponse, incluant les timers et cas limites](/images/luna-protocol/22-complete-lifecycle.svg)

## アーキテクチャ図

`state-machines/`フォルダにはソースコード全体をカバーする**24のMermaidダイアグラム**が含まれています。各ダイアグラムには人間の言語での詳細な説明があります。

重要なパラメータ：

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

これらのダイアグラムは、受信メッセージから回答までの完全なフローを理解するための金鉱です。タイマーとエッジケースを含みます。

---

## トリガーの詳細コード

トリガーは`state/trigger.ts`の`evaluateMessage()`によって評価されます。完全なロジック：

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

  // ... 名前、キーワード、フォローアップ、ランダムのマッチング
}
```

Le cache de regex (`hasWordCache`) évite de recompiler les patterns à chaque message.

---

## リアクション

Lunaはメッセージに絵文字で反応します。サーバーのカスタム絵文字を使用する確率30%、Unicode絵文字70%。リアクションは集中遅延後にトリガーされ、即座には行われません。

Lunaのメッセージに対するリアクションコマンド：
- ❌ → Stop
- ▶️ → Start
- 🗑️ → Clear

---

## 応答スタイル

レスポンススタイルはLunaの最近のチャンネル活動に応じて重み付けされます：

| Contexte | messageReference | mentionRepliedUser | Poids |
|----------|-----------------|-------------------|-------|
| Froid | true | false | 70% |
| Froid | true | true | 20% |
| Froid | false | false | 10% |
| Actif | true | false | 50% |
| Actif | true | true | 15% |
| Actif | false | false | 30% |
| Actif | false | true | 5% |

DMでは、`messageReference`は常に`false`です。

---

## バーストメッセージ

Avec 15% de chance, une réponse est découpée en 2-3 fragments envoyés au rythme humain (1.5-4 secondes entre chaque fragment). Simule quelqu'un qui tape en plusieurs fois.

![Timing Gantt -- temps d'attente réels pour les délais, réactions, streaming LLM et corrections](/images/luna-protocol/21-timing-gantt.svg)

---

## ダイナミックステータス

LunaのDiscordステータスは設定されたプリセットを15分ごとに切り替えます。サポートされるタイプ：Playing (0)、Streaming (1)、Listening (2)、Watching (3)、Custom (4)、Competing (5)。睡眠中はステータスが`invisible`に変わります。

```yaml
dynamic_status_presets:
  - status: online
    text: "ピクセルで"
    type: 0       # Playing
  - status: idle
    text: "ホワイトノイズ"
    type: 2       # Listening
```

ランダムなジッター（×0.5-1.0）は予測可能なローテーションを防ぎます。10%の試行は繰り返しを避けるためスキップされます。

## タイピングインジケーター

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

## クラッシュ後の復旧

Si le LLM crash (processus `llama-server` qui meurt), Luna détecte l'événement via `llmBus.emit("crash", code)` et tente de redémarrer avec un backoff exponentiel. Évite les boucles de redémarrage infini.

## LLMパラメータ

パラメータは`src/config.ts`にハードコードされています：

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

## セットアップ

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

### PM2デプロイ

```bash
./start.sh   # lance llm-server + llm-client sous PM2
```

---

## まとめ

Luna Protocol n'est pas juste un bot Discord avec un LLM. C'est un **système comportemental complet** qui simule les imperfections humaines : les oublis, les fautes de frappe, le sommeil, les hésitations, la fatigue. Le tout architecturé autour d'un bus d'événements typé, avec 24 diagrammes Mermaid documentant chaque flux.

Le code est open source, le dataset est public, et la configuration est hot-reloadable. Si le sujet vous intéresse, plongez dans le code -- c'est plus accessible qu'il n'y paraît.

| Ressource | Lien |
|-----------|------|
| Dépôt GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
