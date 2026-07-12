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
author_sig: "zJRm2OAw4I8tnjDnaJ9IqO8lWWVtx8/4Q4PlYN5zjb3DAruBpzkXuGIKeY7sMTXgO+tIhtinMifD/MUCoNolAQ=="
---

# Luna Protocol: 人間を模倣する自律型Discordボットを作った
Discordボットが**眠ったり**、**タイプミスをしたり**、**躊躇したり**、**返答を忘れたり**、ときには自発的にメッセージを送ったりしたらどうでしょうか? それが**Luna Protocol**がやっていることです: ローカルLLM (llama.cpp) を動作させ、不完全な人間のように会話する完全自律型Discordボットです。
堅いプロンプトもロボット的な回答もありません。Lunaには**優先度付きトリガーシステム**、**可変遅延**、**スリープスケジュール**、**自発メッセージ**、さらには音声メッセージを送る**TTSパイプライン**があります。すべてシンプルな`config.yml`ファイルでホットリロード可能に設定できます。
この記事では、完全なアーキテクチャを分解します: 汎用イベントバスからTTSパイプラインまで、トリガーシステム、人間コンポーネント、ファインチューニングデータセットを含めて。
![アーキテクチャ概要 -- グローバルコンポーネントとデータフロー](/images/luna-protocol/01-architecture-overview.svg)

---

## アーキテクチャ: 型付きイベントバス

Lunaの心臓は**タイプdBus** -- 強い型付けされた汎用イベントバス（タイプScript）。すべての基盤となる基本ブロックです。

```typescript
type EventMap = Record<string, unknown[]>;

export class タイプdBus<Events extends EventMap> {
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
│  タイプdBus<K, V> -- on / off / once / emit            │
├──────────────────┬──────────────────────────────────┤
│   core/llm-bus   │       state/state-bus             │
│  token / done /  │     state:changed                 │
│  error / crash / │     → 自動永続化            │
│  flush / ready / │                                   │
│  reset           │                                   │
└────────┬─────────┴────────┬─────────────────────────┘
         │                  │
┌──────────────────┐  ┌────▼──────────────────────┐
│ core/llm-core.ts │  │ bot.ts (Eris)             │
│ ダイレクトモード      │  │ bot/pending.ts             │
│   llama-server   │  │ bot/reactions.ts           │
│ オンラインモード      │  │ state/trigger.ts           │
│   OpenAI API     │  │ state/state.ts             │
│                  │  │ behavior/*                 │
│                  │  │ tts/*                      │
│                  │  │ spontaneous.ts             │
└──────────────────┘  └────────────────────────────┘
```

このアプローチの利点：各モジュールは残りから**切断**されています。LLMはバスにトークンを発行し、ボットが消費し、状態が自動的に更新されます。循環依存はありません。

---

![Message Processing -- メッセージ処理の完全なフロー](/images/luna-protocol/02-message-processing.svg)

## トリガーシステム：Lunaがいつ応答するか誰が決めるのか

各受信メッセージは`evaluateMessage()`で評価され、トリガー理由付きの`TriggerResult`を返します。優先順位の順序は重要です：

| # | 理由 | 条件 | Bypass ignore | Bypass pause |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | はい (0%) | はい |
| 2 | `dm` | DM (`replyInDM = true`) | はい (0%) | いいえ |
| 3 | `name` | "Luna"/"Pixie"/alias (単語全体) | いいえ (8%) | いいえ |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (単語全体) | いいえ (8%) | いいえ |
| 5 | `follow-up` | Botが最後の発言者 + < 15秒 + < 3 / 60秒 | -- | -- |
| 6 | `random` | 非一致メッセージに対する1.5%の確率 | いいえ (8%) | いいえ |

マッチングは**単語全体** (`\b`) : "ai"は"mais"、"vrai"、"lait"に一致しません.

![Trigger evaluation -- 各メッセージのエントリ決定](/images/luna-protocol/03-trigger-evaluation.svg)

### フォローアップメカニズム

Lunaがメッセージに応答すると、`lastSpeaker`として登録されます。15秒以内の後のメッセージは**即座の**応答をトリガーします -- タイマーなし、キーワードチェックなし。予算：60秒のウィンドウで3フォローアップ。

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

ここでLunaは興味深くなります。各トリガータイプには独自の**集中閾値**があります：最小/最大遅延、無視する確率、反応する確率。

| Trigger | 最小遅延 | 最大遅延 | 無視 | 反応 |
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
  delay *= 0.5 + Math.random() * 1.5; // アグレッシブなジッター
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

| モード | 効果 |
|------|-------|
| `sleep` | メンションとDMのみ通過 |
| `slow` | 遅延×3-5、リアクションほぼなし |
| `short` | 無視率+30%、リアクションほぼなし |

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

AZERTYの例： `bonjour → bonjpur`, `salut → slaut`, `comment → cpmment`.

3つの修正スタイル：

| スタイル | 動作 |
|-------|-------------|
| `edit` | メッセージを編集 |
| `message` | 新しいメッセージ： `word*` |
| `mixed` | 50/50ランダム（デフォルト） |

---

## 犹予と忘却

**ためらい**：フィリングワードで始まる確率15% (`uh...`, `um...`, `well...`, `hmm...`, `so...`).

**忘却**：トリガーマッチ後でも、Lunaは3%の確率で応答を「忘れる」ことがあります。メッセージなし、リアクションなし -- 見ていなかったかのように。

**テーマ疲労**：直近10メッセージで単語が頻繁に出現する場合（閾値：3回）、遅延が乗算され、無視する確率が15%増加します。

---

## LLMパイプライン: 2つのモード

### `direct`モード (デフォルト)

ボットはHTTPでローカルの`llama-server`に直接リクエストを送信します。モデルはプロンプトキャッシュと4つの同時スロットで共有されます。2つのPM2プロセス：LLMサーバーとボットクライアント。

### `online`モード

ボットはOpenAI互換API（OpenAI、OpenRouter、Groq、Together...）を呼び出します。ローカルLLMは不要です。

### リアルタイムストリーミング

LLMは回答を1行ずつストリーミングします (`\n`). 各行は単語に分割され、 `llmBus.emit("token", word)`. 各行の`\n`ごとに`flush`イベントが発行され -- ボットは蓄積されたメッセージを即座に送信します。遅延のシミュレーションなし：リズムはLLMのものです。

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

5ごとに、Lunaが自らメッセージを投稿する確率は12%です。 サーバーは**線形重み付け**システムで選択されます：最もアクティブなサーバーは最後のサーバーよりN×多くの確率を持ちます。

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

8%の確率で、Lunaはテキストの代わりにボイスメッセージを送信します。完全なパイプライン：

1. **Piper TTS** テキストをWAVに合成
2. **ffmpeg** OGGに変換
3. 波形を計算してDiscordのプレビュー用に生成
4. ファイルをDiscord CDN APIでアップロード
5. 音声メッセージを送信

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

![TTS Pipeline -- 合成テキストからDiscordボイスメッセージへ](/images/luna-protocol/10-tts-pipeline.svg)

---

## スパム対策と永続化

### アンチスパム

`channelId:userId`ごとのキュー。ユーザーごとにチャンネルごとに1つのメッセージのみ。現在の回答が完了次第処理されます。

### セッション制限

8回の交流後、Lunaは30秒の休憩をとります。カウンターは3分の非アクティブ後にリセットされます。

### 自動永続化

各状態変更は`stateBus`に発行されます → 自動保存（debounce 500ms）。手動の`saveAllState()`呼び出しは不要です。永続化される状態：pendingMessages, paused, cooldowns, timestamps, lastSpeaker, フォローアップカウンター。

---

## ホットリロード設定

`config.yml`が1つのファイル。ほとんどの値は**ホットリロード可能** -- 再起動なしで変更が適用されます。

| カテゴリ | Hot-reload |
|-----------|-----------|
| トリガー、キーワード、名前 | ✅ |
| 集中度、遅延 | ✅ |
| タイプミス、バースト、疲労 | ✅ |
| スリープスケジュール | ✅ |
| TTS、音声メッセージ | ✅ |
| Discordトークン、LLMモード | ❌ (再起動が必要) |

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

モデルは以下でファインチューニングされています： [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) : **7.3M会話**, **17Mターン**, **140M単語**. 2025年春〜夏の本物のDiscord会話、フィルタリング済み（PII、ToS、ボット、コマンド）。Apache 2.0。

| メトリック | 値 |
|----------|--------|
| サンプル数 | 7 303 464 |
| 総ターン数 | 16 881 010 |
| 総単語数 | 139 922 950 |
| 平均トークン | 32.8 |
| Tokenizer | Hermes-3-Llama-3.1-8B |

使用されている量子化モデルはGGUFです（例：`Discord-Hermes-3-8B.Q3_K_M.gguf`）。

![Discord-Dialoguesデータセットの分布](/images/luna-protocol/dataset-distribution.svg)

---

![Complete Lifecycle -- メッセージから応答までのボットの完全な動作、タイマーとエッジケースを含む](/images/luna-protocol/22-complete-lifecycle.svg)

## アーキテクチャ図

`state-machines/`フォルダにはソースコード全体をカバーする**24のMermaidダイアグラム**が含まれています。各ダイアグラムには人間の言語での詳細な説明があります。

重要なパラメータ：

| # | ダイアグラム | タイプ |
|---|-----------|------|
| 01 | Architecture Overview | `graph` |
| 02 | Message Processing (完全版) | `stateDiagram` |
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

正規表現キャッシュ（`hasWordCache`）は各メッセージでのパターン再コンパイルを防ぎます。

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

| コンテキスト | messageReference | mentionRepliedUser | 重み |
|----------|-----------------|-------------------|-------|
| 冷 | true | false | 70% |
| 冷 | true | true | 20% |
| 冷 | false | false | 10% |
| アクティブ | true | false | 50% |
| アクティブ | true | true | 15% |
| アクティブ | false | false | 30% |
| アクティブ | false | true | 5% |

DMでは、`messageReference`は常に`false`です。

---

## バーストメッセージ

15%の確率で、回答は人間のリズム（各フラグメント間1.5-4秒）で2-3のフラグメントに分割されて送信されます。複数回に分けてタイピングする人をシミュレートします。

![Timing Gantt -- 遅延、リアクション、LLMストリーミング、修正の実際の待ち時間](/images/luna-protocol/21-timing-gantt.svg)

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

LLMを呼び出す前に、Lunaは`startTyping()`を呼び出します。`setInterval`が生成中8秒ごとにインジケーターを更新します。`finally`でクリーンアップ（`clearInterval`）。

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

LLMがクラッシュした場合（`llama-server`プロセスが停止）、Lunaは`llmBus.emit("crash", code)`でイベントを検出し、指数バックオフで再起動を試みます。無限の再起動ループを防ぎます。

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

ChatMLテンプレート (`<|im_start|>/<|im_end|>`) が使用されます。 スレッド数は `os.cpus().length`.

---

## セットアップ

```bash
npm install
cp config.example.yml config.yml
# config.ymlを編集
npm run dev                    # dev (hot reload)
npm run build && npm start     # production
```

| スクリプト | 説明 |
|--------|-------------|
| `build` | 独立したCLIバンドル |
| `start` | ボットを起動 |
| `lint` / `format` / `check` | Biome |
| `test` | テスト (Bun) |
| `download-model` | HuggingFaceからGGUFをダウンロード |
| `diagrams` | MermaidダイアグラムをSVG/PNGにエクスポート |

### PM2デプロイ

```bash
./start.sh   # PM2でllm-server + llm-clientを起動
```

---

## まとめ

Luna Protocol は単なるLLM搭載Discordボットではありません。これは人間の不完全さ -- 忘却、タイプミス、睡眠、ためらい、疲労 -- をシミュレートする**完全な行動システム**です。すべて型付きイベントバスを中心に構築され、24のMermaidダイアグラムが各フローを文書化しています。

コードはオープンソース、データセットは公開、設定はホットリロード可能。興味があるなら、コードを深く掘り下げてみてください -- 見るほど-accessibleです。

| リソース | リンク |
|-----------|------|
| GitHubリポジトリ | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
