---
title: "Luna Protocol: 自律型Discordボットが人間らしい会話を実現"
description: "Luna Protocolは、ローカルLLMを搭載した完全自律型Discordボット。睡眠、タイプミス、ためらい、物忘れ、テーマ疲れ、自発的なメッセージなど、人間らしい不完全な会話を実現します。"
date: 2026-07-11
tags:
  - discord-bot
  - llm
  - typescript
  - event-architecture
  - artificial-intelligence
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "K1yQ/taAb7gzGaZixy7lIFk895VHhxxVsRqUgZLDcUZ8FXXhpwEsk8ZQeRq40hbw9Vf6EhpfO9wBKqsFNi8QjQ=="
---

# Luna Protocol: 自律型Discordボットが人間らしい会話を実現

もしDiscordボットが**眠り**、**タイプミス**をし、**ためらい**、返信を**忘れ**、時には自発的にメッセージを送ったらどうでしょうか？それがまさに**Luna Protocol**が実現するものです。ローカルLLM（llama.cpp）を実行する完全自律型Discordボットで、不完全な人間のように会話します。

硬直したプロンプトもロボット的な応答もありません。Lunaには**優先トリガーシステム**、**可変遅延**、**睡眠スケジュール**、**自発的なメッセージ**、そして音声メッセージを送信するための**TTSパイプライン**まで備わっています。すべてホットリロード可能な単一の`config.yml`で設定できます。

この記事では、汎用イベントバスからTTSパイプライン、トリガーシステム、人間らしいコンポーネント、ファインチューニングデータセットまで、完全なアーキテクチャを解説します。

![アーキテクチャ概要 -- グローバルコンポーネントとデータフロー](/images/luna-protocol/01-architecture-overview.svg)

---

## アーキテクチャ: 型付きイベントバス

Lunaの中核は**TypedBus** -- TypeScriptで実装された汎用的で強い型付けのイベントバスです。すべての基盤となる基本要素です。

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

ここから2つの主要なバスが派生します:

- **`llmBus`** -- LLMトークン、エラー、クラッシュ、リセットを管理
- **`stateBus`** -- 自動永続化を伴う状態変更を管理

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

このアプローチの利点: 各モジュールは互いに**分離**されています。LLMがバスにトークンを発行し、ボットがそれを消費し、状態が自動的に更新されます。循環依存関係はありません。

---

![メッセージ処理 -- メッセージの完全な処理フロー](/images/luna-protocol/02-message-processing.svg)

## トリガーシステム: Lunaがいつ応答するかを決める仕組み

受信した各メッセージは`evaluateMessage()`によって評価され、トリガー理由を含む`TriggerResult`が返されます。優先順位は重要です:

| # | 理由 | 条件 | Bypass ignore | Bypass pause |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | はい (0%) | はい |
| 2 | `dm` | ダイレクトメッセージ `replyInDM = true` | はい (0%) | いいえ |
| 3 | `name` | "Luna"/"Pixie"/エイリアス (単語全体) | いいえ (8%) | いいえ |
| 4 | `keyword` | `hello`, `hi`, `ai`, `bot`... (単語全体) | いいえ (8%) | いいえ |
| 5 | `follow-up` | ボットが最後の話者 + 15秒未満 + 60秒あたり3回未満 | -- | -- |
| 6 | `random` | 該当しないメッセージに1.5%の確率 | いいえ (8%) | いいえ |

マッチングは**単語全体**（`\b`）で行われます。"ai"は"mais"、"vrai"、"lait"などの単語の一部にはマッチしません。

![トリガー評価 -- 各メッセージの入力判定](/images/luna-protocol/03-trigger-evaluation.svg)

### フォローアップの仕組み

Lunaがメッセージに応答すると、自身を`lastSpeaker`として登録します。その後15秒以内のメッセージは**即座に**応答をトリガーします -- タイマーもキーワードチェックもありません。予算: 60秒のウィンドウあたり最大3回のフォローアップ。

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### クールダウン

同じチャンネルでの連続応答の間に8秒の間隔があります。メンションとフォローアップではバイパスされます。

---

## 人間らしい動作: 可変集中力

ここがLunaの面白いところです。各トリガータイプには独自の**集中力しきい値**があります。最小/最大遅延、無視する確率、反応する確率です。

| トリガー | 最小遅延 | 最大遅延 | 無視 | 反応 |
|---------|----------|----------|--------|----------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

遅延の計算には以下も考慮されます:
- **メッセージの長さ**: メッセージが長いほど、Lunaが"読む"のに時間がかかります
- **非アクティブ状態**: 10分以上アクティブでない場合、遅延は2倍になります（"起床"のシミュレーション）
- **睡眠**: `slow`モードでは、遅延が3～5倍になります

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

## 睡眠スケジュール

Lunaは眠ることができます。`config.yml`で設定可能:

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
| `sleep` | メンションとダイレクトメッセージのみ通過 |
| `slow` | 遅延×3-5、反応ほぼなし |
| `short` | 無視確率+30%、反応ほぼなし |

睡眠中はDiscordのステータスが`invisible`になります。

---

## タイプミス

Lunaはタイプミスをし、2～4秒後に修正することができます。キーボードレイアウトは設定可能です（AZERTYまたはQWERTY）。

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... toutes les touches adjacentes
};
```

AZERTYの例: `bonjour → bonjpur`, `salut → slaut`, `comment → cpmment`

3つの修正スタイル:

| スタイル | 動作 |
|-------|-------------|
| `edit` | メッセージを編集 |
| `message` | 新しいメッセージ: `word*` |
| `mixed` | 50/50ランダム（デフォルト） |

---

## ためらいと物忘れ

**ためらい**: 15%の確率でフィラーワード（`uh...`、`um...`、`well...`、`hmm...`、`so...`）で始まります。

**物忘れ**: トリガーにマッチした後でも、Lunaは3%の確率で応答を"忘れる"ことがあります。メッセージも反応もなし -- 何も見なかったかのように。

**テーマ疲れ**: 直近10メッセージ内で特定の単語が出現しすぎた場合（しきい値: 3回）、遅延が増加し、無視確率が15%上昇します。

---

## 実際の再現度:ぞっとする瞬間

紙の上では、これらの仕組み(遅延、タイプミス、ためらい、忘却)はただのギミックに聞こえる。だが実際に組み合わさると、その結果は驚くほどで、Lunaと会話している人はまったく気づかない。以下は、誰かがLunaに直接「ボットなのか」と尋ね、その後会話がまったく別の話題へと、ぞっとするほど自然に流れていった実際のやり取りだ。

![LunaとのDiscord会話 -- 最初のやり取り](/images/luna-protocol/realism/realism-01.png)

口調、ためらい、返信のテンポ -- ボットだとわかる要素は一切ない。Lunaは年齢の質問をキャラクターを崩さずに巧みにかわす。

会話はまったく自然に続き、「okay, okay」「yay」「yayy」といった短く人間らしい返信が続く -- まさに人がDiscordで送るようなメッセージだ。

![LunaとのDiscord会話 -- 続き](/images/luna-protocol/realism/realism-02.png)

![LunaとのDiscord会話 -- 話題の転換](/images/luna-protocol/realism/realism-03.png)

![LunaとのDiscord会話 -- 話題転換の続き](/images/luna-protocol/realism/realism-04.png)

![LunaとのDiscord会話 -- やり取りの終わり](/images/luna-protocol/realism/realism-05.png)

恐ろしいのはLunaが「返信する」ことだけではない -- 一貫した意見や相槌、メッセージごとに筋の通った思考の流れを持って**会話を成立させている**ことだ。上で説明したトリガーシステム、集中遅延、ためらいがなければ、この幻想は数メッセージで崩れてしまうだろう。

---

## LLMパイプライン: 2つのモード

### `direct`モード（デフォルト）

ボットはローカルの`llama-server`にHTTPで直接リクエストを送信します。モデルは共有され、プロンプトキャッシュと4つの同時スロットを使用します。2つのPM2プロセス: LLMサーバーとボットクライアント。

### `online`モード

ボットはOpenAI互換のAPI（OpenAI、OpenRouter、Groq、Together...）を呼び出します。ローカルLLMは不要です。

### リアルタイムストリーミング

LLMは応答を行ごとに（`\n`）ストリーミングします。各行は単語に分割され、`llmBus.emit("token", word)`で1語ずつ発行されます。`\n`ごとに`flush`イベントが発行され、ボットは蓄積されたメッセージを即座に送信します。シミュレートされた遅延はありません。リズムはLLMのペースに合わせられます。

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

リクエストキュー（`requestQueue`）はリクエストを1つずつ処理し、キューが100要素を超えると自動的にクリーンアップされます。

---

## 自発的なメッセージ

5分ごとに12%の確率で、Lunaが自発的にメッセージを投稿します。サーバーは**線形重み**システムで選択されます。最もアクティブなサーバーは最後のサーバーよりもN倍高い確率になります。

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

直近5件のメッセージのコンテキストが読み込まれ、Lunaが"自然に"会話に参加します。

---

## TTSパイプライン: 音声メッセージ

8%の確率で、Lunaはテキストの代わりに音声メッセージを送信します。完全なパイプライン:

1. **Piper TTS**がテキストをWAVに合成
2. **ffmpeg**がOGGに変換
3. Discordプレビュー用に波形を計算
4. Discord CDN API経由でファイルをアップロード
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

![TTSパイプライン -- 合成テキストからDiscord音声メッセージへ](/images/luna-protocol/10-tts-pipeline.svg)

---

## アンチスパムと永続化

### アンチスパム

`channelId:userId`ごとのキュー。ユーザーとチャンネルの組み合わせにつき1メッセージのみキューイングされます。現在の応答が終了次第処理されます。

### セッション制限

8回のやり取りの後、Lunaは30秒の休憩を取ります。カウンターは3分間の非アクティブ後にリセットされます。

### 自動永続化

状態の変更は`stateBus`に発行され → 自動保存（500msのデバウンス）。手動での`saveAllState()`呼び出しは不要です。永続化される状態: pendingMessages、paused、cooldowns、timestamps、lastSpeaker、フォローアップカウンター。

---

## ホットリロード設定

単一の`config.yml`ファイル。ほとんどの値は**ホットリロード可能**で、再起動なしで変更が反映されます。

| カテゴリ | ホットリロード |
|-----------|-----------|
| トリガー、キーワード、名前 | ✅ |
| 集中力、遅延 | ✅ |
| タイプミス、バースト、疲れ | ✅ |
| 睡眠スケジュール | ✅ |
| TTS、音声メッセージ | ✅ |
| Discordトークン、LLMモード | ❌（再起動が必要） |

```typescript
// config.ts -- les getters retournent des valeurs live
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## データセット: Discord-Dialogues

モデルは[Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues)でファインチューニングされています: **730万のやり取り**、**1690万ターン**、**1億4000万語**。2025年春から夏にかけての実際のDiscord会話をフィルタリングしたもの（PII、ToS、ボット、コマンドを除去）。Apache 2.0ライセンス。

| 指標 | 値 |
|----------|--------|
| サンプル数 | 7 303 464 |
| 総ターン数 | 16 881 010 |
| 総単語数 | 139 922 950 |
| 平均トークン数 | 32.8 |
| トークナイザー | Hermes-3-Llama-3.1-8B |

使用される量子化モデルはGGUFです（例: `Discord-Hermes-3-8B.Q3_K_M.gguf`）。

![Discord-Dialoguesデータセットの分布](/images/luna-protocol/dataset-distribution.svg)

---

![完全なライフサイクル -- メッセージから応答までのボットの完全な動作（タイマーとエッジケースを含む）](/images/luna-protocol/22-complete-lifecycle.svg)

## アーキテクチャ図

`state-machines/`ディレクトリにはソースコード全体をカバーする**24のMermaid図**が含まれています。各図には人間の言葉による詳細な説明が付いています。

最も重要なもの:

| # | 図 | タイプ |
|---|-----------|-------|
| 01 | アーキテクチャ概要 | `graph` |
| 02 | メッセージ処理（完全版） | `stateDiagram` |
| 03 | トリガー評価 | `flowchart` |
| 04 | LLMコアキュー（3バックエンド） | `stateDiagram` |
| 10 | TTSパイプライン | `flowchart` |
| 13 | 状態永続化 | `flowchart` |
| 21 | タイミングガント | `gantt` |
| 22 | 完全なライフサイクル | `stateDiagram` |

これらの図は、受信メッセージから応答、タイマー、エッジケースに至るまでの完全なフローを理解するための宝庫です。

---

## トリガーコードの詳細

トリガーは`state/trigger.ts`の`evaluateMessage()`によって評価されます。以下が完全なロジックです:

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

正規表現キャッシュ（`hasWordCache`）により、毎回のメッセージでパターンを再コンパイルする必要がありません。

---

## リアクション

Lunaは絵文字でメッセージにリアクションします。30%の確率でサーバーのカスタム絵文字、70%の確率でUnicode絵文字を使用します。リアクションは集中力遅延の後、即座ではなく遅延してトリガーされます。

Lunaのメッセージに対するリアクションコマンド:
- ❌ → 停止
- ▶️ → 開始
- 🗑️ → クリア

---

## 応答スタイル

応答スタイルはチャンネルでのLunaの最近のアクティビティに応じて重み付けされます:

| コンテキスト | messageReference | mentionRepliedUser | 重み |
|----------|-----------------|-------------------|-------|
| コールド | true | false | 70% |
| コールド | true | true | 20% |
| コールド | false | false | 10% |
| アクティブ | true | false | 50% |
| アクティブ | true | true | 15% |
| アクティブ | false | false | 30% |
| アクティブ | false | true | 5% |

ダイレクトメッセージでは、`messageReference`は常に`false`です。

---

## 分割メッセージ

15%の確率で、応答は2～3の断片に分割され、人間らしいリズム（断片間1.5～4秒）で送信されます。複数回に分けてタイピングする人の動作をシミュレートします。

![タイミングガント図 -- 遅延、リアクション、LLMストリーミング、修正の実際の待機時間](/images/luna-protocol/21-timing-gantt.svg)

---

## 動的ステータス

LunaのDiscordステータスは設定された複数のプリセット間で切り替わり、15分ごとにローテーションします。サポートされているタイプ: Playing (0)、Streaming (1)、Listening (2)、Watching (3)、Custom (4)、Competing (5)。睡眠中はステータスが`invisible`になります。

```yaml
dynamic_status_presets:
  - status: online
    text: "avec les pixels"
    type: 0       # Playing
  - status: idle
    text: "du bruit blanc"
    type: 2       # Listening
```

ランダムなジッター（×0.5-1.0）により、予測可能なローテーションを避けます。試行の10%はスキップされ、繰り返しを防ぎます。

## タイピングインジケーター

LLMを呼び出す前に、Lunaは`startTyping()`を呼び出します。`setInterval`は生成中に8秒ごとにインジケーターを更新します。`finally`ブロックでクリーンアップされます（`clearInterval`）。

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

LLMがクラッシュした場合（`llama-server`プロセスが停止）、Lunaは`llmBus.emit("crash", code)`を介してイベントを検出し、指数バックオフで再起動を試みます。無限再起動ループを回避します。

## LLMパラメーター

パラメーターは`src/config.ts`にハードコードされています:

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

ChatMLテンプレート（`<|im_start|>/<|im_end|>`）が使用されています。スレッド数は`os.cpus().length`で自動検出されます。

---

## セットアップ

```bash
npm install
cp config.example.yml config.yml
# config.ymlを編集
npm run dev                    # 開発（ホットリロード）
npm run build && npm start     # 本番
```

| スクリプト | 説明 |
|--------|-------------|
| `build` | スタンドアロンCLIバンドル |
| `start` | ボットを起動 |
| `lint` / `format` / `check` | Biome |
| `test` | テスト（Bun） |
| `download-model` | HuggingFaceからGGUFをダウンロード |
| `diagrams` | Mermaid図をSVG/PNGにエクスポート |

### PM2デプロイ

```bash
./start.sh   # PM2でllm-server + llm-clientを起動
```

---

## 結論

Luna Protocolは、単なるLLMを搭載したDiscordボットではありません。**人間の不完全さ**をシミュレートする**完全な行動システム**です。物忘れ、タイプミス、睡眠、ためらい、疲れ。すべて型付きイベントバスを中心にアーキテクチャが構築され、24のMermaid図が各フローを文書化しています。

コードはオープンソース、データセットは公開、設定はホットリロード可能です。興味があれば、コードを覗いてみてください -- 見た目よりも簡単です。

| リソース | リンク |
|-----------|------|
| GitHubリポジトリ | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| データセット | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlasマップ | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
