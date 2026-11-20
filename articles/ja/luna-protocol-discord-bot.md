---
title: "Luna Protocol：人間を真似る自律Discordボットを作った"
description: "Luna ProtocolはローカルLLM搭載の完全自律Discordボット。睡眠、タイプミス、ためらい、忘却、話題疲れ、自発メッセージ付きで自然会話ができる。"
date: 2026-07-11
tags:
  - discord
  - llm
  - typescript
  - event-driven-architecture
  - ai
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "4Exm5Vdv1GJAeL07cyWZrPfTJDZfUVzzAeo3KJGiOPdSOUCiTid/mUokw1E1CnWxB4nhsPY6yjaJDv/+LSVw9w=="
---

# Luna Protocol：人間を真似る自律Discordボットを作った

Discordボットが**寝て**、**タイプミス**して、**ためらって**、返事を**忘れて**、ときどき自分からメッセージを送ってきたらどうする。まさに**Luna Protocol**がやることだ。ローカルLLM（llama.cpp）を回す完全自律Discordボットで、不完全な人間みたいに会話する。

Lunaは文脈起動と割り切った不完全応答で動く。**優先起動システム**、**可変遅延**、**睡眠時間**、**自発メッセージ**、果てはボイスメッセージ送信用**TTSパイプライン**まである。全部単純なホットリロード可能`config.yml`で設定する。

この記事では完全アーキテクチャを解剖する。汎用イベントバスからTTSパイプラインまで、起動システム、人間部品、微調整データセット経由でね。

![Architecture Overview、全体部品とデータフロー](/images/luna-protocol/01-architecture-overview.svg)

---

## アーキテクチャ：型付きイベントバス

Lunaの心臓は**TypedBus**だ。TypeScript強型付けの汎用イベントバスだ。全部が載る基礎部品だ。最初から循環依存を避けたくてこう作った。

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

主に2バスが出る。

- **`llmBus`**：LLMトークン、エラー、クラッシュ、リセットを管理
- **`stateBus`**：自動永続化付き状態変化を管理

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

この手法の利点：各モジュールが残りと**切断**されてる。LLMはバスにトークンを出す。ボットは消費する。stateは自動更新する。循環依存なしだ。

---

![Message Processing、1メッセージの完全処理フロー](/images/luna-protocol/02-message-processing.svg)

## 起動システム：Lunaが返事するか誰が決めるか

各入力メッセージは`evaluateMessage()`で評価されて、起動理由付き`TriggerResult`を返す。優先順が重要だ。

| # | 理由 | 条件 | 無視回避 | 休止回避 |
|---|--------|-----------|---------------|--------------|
| 1 | `mention` | @bot | する（0%） | する |
| 2 | `dm` | `replyInDM = true`付きDM | する（0%） | しない |
| 3 | `name` | 「Luna」や「Pixie」や別名（語全体） | しない（8%） | しない |
| 4 | `keyword` | `hello`、`hi`、`ai`、`bot`など（語全体） | しない（8%） | しない |
| 5 | `follow-up` | ボットが最終話者 + 15秒以内 + 60秒に3回未満 | -- | -- |
| 6 | `random` | 非合致メッセージに1.5パーセント | しない（8%） | しない |

照合は**語全体**（`\b`）だ。「ai」は「mais」や「vrai」や「lait」に合わない。

![Trigger evaluation、各メッセージの入口判定](/images/luna-protocol/03-trigger-evaluation.svg)

### フォローアップ仕組み

Lunaがメッセージに返事すると`lastSpeaker`として登録する。15秒以内の後続メッセージは**即**応答を起こす。タイマーもキーワード確認も短絡する。予算は60秒窓にフォローアップ3回だ。

```typescript
export function canFollowUp(channelId: string, botId: string): boolean {
  const recent = isRecentBotActivity(channelId);
  const speaker = lastSpeaker.get(channelId);
  const count = responseCount.get(channelId) ?? 0;
  return recent && speaker?.userId === botId && count < MAX_FOLLOWUPS;
}
```

### クールダウン

同じチャンネルで2返事の間は8秒だ。メンションとフォローアップが回避する。

---

## 人間挙動：変わる集中力

Lunaが面白くなるのはここだ。各起動種別は独自の**集中しきい値**を持つ。最小や最大遅延、無視確率、反応確率だ。

| 起動 | 最小遅延 | 最大遅延 | 無視 | 反応 |
|---------|----------|----------|--------|----------|
| `mention` | 300ms | 1500ms | 0% | 8% |
| `dm` | 400ms | 1800ms | 0% | 5% |
| `name` | 800ms | 4000ms | 5% | 6% |
| `keyword` | 1000ms | 3500ms | 8% | 4% |
| `follow-up` | 500ms | 2000ms | 0% | 3% |
| `random` | 1500ms | 5000ms | 15% | 2% |

遅延計算はこうも考慮する。
- **メッセージ長**：長いほどLunaは「読む」のに時間がかかる
- **無操作**：Lunaが10分不活性なら遅延は2倍だ（「目覚め」再現）
- **睡眠**：`slow`モードでは遅延は3から5倍だ

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
  delay *= 0.5 + Math.random() * 1.5; // 強いジッター
  return delay;
}
```

---

## 睡眠時間

Lunaは寝られる。`config.yml`で設定する。

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
| `sleep` | メンションとDMだけ通る |
| `slow` | 遅延3から5倍、反応ほぼゼロ |
| `short` | 無視確率+30%、反応ほぼゼロ |

睡眠時間中、Discordステータスは`invisible`になる。

---

## タイプミス

Lunaはタイプミスできて、2から4秒後に直す。キーボードレイアウトは設定可能だ（AZERTYかQWERTY）。設定可能に残したのは、きれいすぎる書き方のボットは即バレるからだ。

```typescript
const azertyAdjacent: Record<string, string[]> = {
  a: ["z", "q", "w"],
  z: ["a", "e", "s", "x"],
  e: ["z", "r", "d", "s"],
  // ... 全隣接キー
};
```

AZERTY例：`bonjour → bonjpur`、`salut → slaut`、`comment → cpmment`。

修正3スタイル：

| スタイル | 挙動 |
|-------|-------------|
| `edit` | メッセージを編集する |
| `message` | 新メッセージ：`word*` |
| `mixed` | 50/50ランダム（デフォルト） |

---

## ためらいと忘却

**ためらい**：15パーセントで埋め草から始める（`uh...`、`um...`、`well...`、`hmm...`、`so...`）。

**忘却**：起動に合ってもLunaは3パーセントで返事を「忘れ」うる。そのまま完全沈黙する。何も見なかったみたいにね。人間がうっかりメッセージ飛ばすの見たことあるからこの挙動大好きだ。

**話題疲れ**：直近10メッセージで語が戻りすぎたら（しきい値：3回）、遅延が倍増して無視確率が15パーセント上がる。

---

## 実践のリアルさ：怖くなる瞬間

紙の上ではこの仕組み全部（遅延、タイプミス、ためらい、忘却）はおもちゃに見える。実際、端から端まで組むと結果は驚愕だ。Lunaと会話してる人たちは何も疑わない。ここに本物のやり取りがある。誰かがLunaに直接ボットか聞いて、その後会話がまったく違う話題に流れる。背筋が凍る自然さだ。実条件でここまで信用できるとは思わなかった。

![LunaとのDiscord会話、最初のやり取り](/images/luna-protocol/realism/realism-01.png)

調子もためらいも返事リズムも、ボットを裏切るものは何もない。Lunaは年齢の問いを人物を壊さずかわす。

![LunaとのDiscord会話、やり取りの続き](/images/luna-protocol/realism/realism-02.png)

会話は完全流動的に続く。短く自然な返事で（「okay, okay」「yay」「yayy」）。まさに人間がDiscordで送る種類のメッセージだ。

![LunaとのDiscord会話、話題の漂流](/images/luna-protocol/realism/realism-03.png)

![LunaとのDiscord会話、漂流の続き](/images/luna-protocol/realism/realism-04.png)

![LunaとのDiscord会話、やり取りの終わり](/images/luna-protocol/realism/realism-05.png)

怖いのはLunaが「返事する」だけじゃないことだ。**会話を保つ**んだ。見かけの意見も、振りも、メッセージをまたぐ一貫した思考の糸付きでね。上で述べた起動システムも集中遅延もためらいもなしでは、この錯覚は数メッセージで崩れる。

**ちょっとしたどんでん返し**：上のスクショで**話してる2アカウントは両方Lunaのインスタンス**だ。`PixieGlow`も`Sujet d'SBlow`もボットを試す人間じゃない。互いに話す2つのボットで、各々（挙動意味で）「普通」の相手と話してると確信してるんだ。上のやり取りを読んで片方が人間だと思ったなら、おめでとう。本物のDiscordサーバーで誰でもやる通りに罠に落ちたってことだ。

これは**死んだインターネット理論**の実践版みたいなものだ。この理論（元は陰謀論寄り）は、オンライン内容ややり取りの増える割合が人間じゃなくボット生成になる、果ては「本物の」人間インターネットが少数派になったと仮定する。長く誇張と見なされたけど、Luna Protocolみたいな仕組みが、大した手段も巨大モデルもなしに大規模に信用できる人間存在を真似られるのを示すにつれて、どんどん突飛じゃなくなる。長い会話を裏切らず保てる同じボットの2インスタンスは、互いに話すボット多数派のウェブがどう見えうるのかなり具体的な見取り図だ。

---

## LLMパイプライン：2モード

### `direct`モード（デフォルト）

ボットはHTTPでローカル`llama-server`に直接リクエストを送る。モデルは共有で、プロンプトキャッシュと4並行スロット付きだ。PM2プロセス2つ：LLMサーバーとボットクライアントだ。

### `online`モード

ボットはOpenAI互換の任意APIを呼ぶ（OpenAI、OpenRouter、Groq、Togetherなど）。APIキー1つ要るだけだ。LLMはプロバイダー側で回る。

### リアルタイム配信

LLMは応答を行ごと（`\n`）に配信する。各行は語に切られて、`llmBus.emit("token", word)`で1つずつ出る。各`\n`で`flush`イベントが出る。ボットは溜まったメッセージを即送る。リズムはLLMに直接従う。

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

待ち行列（`requestQueue`）はリクエストを1つずつ処理する。待ちが100超えたら自動掃除する。

---

## 自発メッセージ

5分ごとに12パーセントでLunaは自分からメッセージを出す。サーバーは**線形重み**制で選ぶ。いちばん活性なサーバーは最下位のN倍出やすい。

```typescript
const total = (ranked.length * (ranked.length + 1)) / 2;
let roll = Math.random() * total;
for (let i = 0; i < ranked.length; i++) {
  roll -= ranked.length - i;
  if (roll <= 0) return ranked[i];
}
```

直近5メッセージの文脈を読んで、Lunaは「自然に」会話に参加する。

---

## TTSパイプライン：ボイスメッセージ

8パーセントでLunaはテキストじゃなくボイスメッセージを送る。完全パイプライン：

1. **Piper TTS**がテキストをWAV合成する
2. **ffmpeg**がOGG変換する
3. Discordプレビュー用waveformを計算する
4. Discord CDN API経由でファイルを上げる
5. ボイスメッセージを送る

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

![TTS Pipeline、合成テキストからDiscordボイスメッセージへ](/images/luna-protocol/10-tts-pipeline.svg)

---

## スパム対策と永続化

### スパム対策

`channelId:userId`ごとの待ち行列だ。チャンネルごとユーザーごとに待ちメッセージ1つだ。進行中の返事が終わり次第処理する。

### セッション上限

8往復後、Lunaは30秒休む。3分不活性でカウンタリセットだ。

### 自動永続化

各状態変化は`stateBus`に出る → 自動保存（500msデバウンス）。手動`saveAllState()`呼び出しはもう要らない。永続状態はこうだ。pendingMessages、paused、cooldowns、timestamps、lastSpeaker、フォローアップカウンタだ。

---

## ホットリロード設定

`config.yml`1つだ。大半の値は**ホットリロード可能**だ。変更は再起動なしに反映される。進行中会話を切らずに遅延を live 調整したかった。

| カテゴリ | ホットリロード |
|-----------|-----------|
| 起動、キーワード、名前 | ✅ |
| 集中、遅延 | ✅ |
| タイポ、バースト、疲れ | ✅ |
| 睡眠スケジュール | ✅ |
| TTS、ボイスメッセージ | ✅ |
| Discordトークン、LLMモード | ❌（再起動必要） |

```typescript
// config.ts。getterは live 値を返す
export const config = {
  get typoChance() { return raw.typoChance ?? 0.06; },
  get concentration() { return raw.concentration; },
  // ...
};
```

---

## データセット：Discord-Dialogues

モデルは[Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues)で微調整する。**730万やり取り**、**1,700万ターン**、**1億4,000万語**だ。2025年春夏の本物Discord会話を濾過したものだ（PII、ToS、ボット、コマンド）。Apache 2.0だ。

| 指標 | 値 |
|----------|--------|
| サンプル | 7 303 464 |
| 合計ターン | 16 881 010 |
| 合計語 | 139 922 950 |
| 平均トークン | 32.8 |
| トークナイザ | Hermes-3-Llama-3.1-8B |

使う量子化モデルはGGUFだ（たとえば`Discord-Hermes-3-8B.Q3_K_M.gguf`）。

![Discord-Dialoguesデータセット分布](/images/luna-protocol/dataset-distribution.svg)

---

![Complete Lifecycle、タイマーと際どいケース込みのメッセージから返事までのボット完全挙動](/images/luna-protocol/22-complete-lifecycle.svg)

## アーキテクチャ図

`state-machines/`フォルダは全ソースを覆う**24のMermaid図**を持つ。各図に人間言語の詳しい説明付きだ。

重要どころ：

| # | 図 | 種別 |
|---|-----------|------|
| 01 | Architecture Overview | `graph` |
| 02 | Message Processing（完全） | `stateDiagram` |
| 03 | Trigger Evaluation | `flowchart` |
| 04 | LLM Core Queue（3バックエンド） | `stateDiagram` |
| 10 | TTS Pipeline | `flowchart` |
| 13 | State Persistence | `flowchart` |
| 21 | Timing Gantt | `gantt` |
| 22 | Complete Lifecycle | `stateDiagram` |

この図群は完全フローを理解する金鉱だ。入力メッセージから返事まで、タイマーと際どいケース経由でね。

---

## 詳細の起動コード

起動は`state/trigger.ts`の`evaluateMessage()`で評価する。完全理屈はこうだ。

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

  // ... 名前、キーワード、フォローアップ、ランダムの照合
}
```

正規表現キャッシュ（`hasWordCache`）で各メッセージのパターン再コンパイルを避ける。

---

## リアクション

Lunaは絵文字でメッセージに反応する。サーバーのカスタム絵文字を使う確率30パーセント、unicode絵文字70パーセントだ。反応は集中遅延の後に出る。返事と同じずらしリズムだ。読む時間かけた感じがするからこのずれ好きだ。

Lunaのメッセージへのリアクションコマンド：
- ❌ → Stop
- ▶️ → Start
- 🗑️ → Clear

---

## 返事スタイル

返事スタイルはチャンネル内Luna最近活動で重み付けする。

| 文脈 | messageReference | mentionRepliedUser | 重み |
|----------|-----------------|-------------------|-------|
| 冷 | true | false | 70% |
| 冷 | true | true | 20% |
| 冷 | false | false | 10% |
| 熱 | true | false | 50% |
| 熱 | true | true | 15% |
| 熱 | false | false | 30% |
| 熱 | false | true | 5% |

DMでは`messageReference`はつねに`false`だ。

---

## 連投メッセージ

15パーセントで返事は2、3断片に切られて、人間リズム（断片間1.5から4秒）で送られる。何回かに分けて打つ人を再現する。

![Timing Gantt、遅延、反応、LLM配信、修正の実待ち時間](/images/luna-protocol/21-timing-gantt.svg)

---

## 動的ステータス

LunaのDiscordステータスは設定済み複数プリセットを15分ごとに回す。対応種別：Playing（0）、Streaming（1）、Listening（2）、Watching（3）、Custom（4）、Competing（5）だ。睡眠中、ステータスは`invisible`になる。

```yaml
dynamic_status_presets:
  - status: online
    text: "avec les pixels"
    type: 0       # Playing
  - status: idle
    text: "du bruit blanc"
    type: 2       # Listening
```

ランダムジッター（0.5から1.0倍）で予測可能ローテを避ける。繰り返し避けに試行の10パーセントは飛ばす。

## 入力中表示

LLM呼び出し前にLunaは`startTyping()`を呼ぶ。生成中`setInterval`で8秒ごとに入力中表示を更新する。`finally`で掃除する（`clearInterval`）。

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

## クラッシュ後回復

LLMがクラッシュしたら（死ぬ`llama-server`プロセス）、Lunaは`llmBus.emit("crash", code)`経由で検出して指数バックオフで再起動を試みる。無限再起動ループを避ける。

## LLMパラメータ

パラメータは`src/config.ts`にハードコードする。

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

ChatMLテンプレ（`<|im_start|>/<|im_end|>`）を使う。スレッド数は`os.cpus().length`で自動検出する。

---

## 立ち上げ

```bash
npm install
cp config.example.yml config.yml
# config.ymlを編集
npm run dev                    # dev（ホットリロード）
npm run build && npm start     # 本番
```

| スクリプト | 説明 |
|--------|-------------|
| `build` | 自立CLIをまとめる |
| `start` | ボットを起動 |
| `lint` / `format` / `check` | Biome |
| `test` | テスト（Bun） |
| `download-model` | HuggingFaceからGGUF |
| `diagrams` | Mermaid図をSVGやPNG書き出し |

### PM2デプロイ

```bash
./start.sh   # PM2下でllm-serverとllm-clientを起動
```

---

## 結論

Luna ProtocolはLLM付きDiscordボットを大きく超える。**完全な挙動システム**で人間不完全さを真似る。忘却も、タイプミスも、睡眠も、ためらいも、疲れもね。全部型付きイベントバス中心に組み立てて、各フロー文書化のMermaid図24枚付きだ。

コードはオープンソース、データセットは公開、設定はホットリロード可能だ。興味が出たらコードに潜って。見た目より取っ付きやすいよ。挙動のいろんな考えを試す土台に使って、各モジュールは別々に取り出せる。

| リソース | リンク |
|-----------|------|
| GitHubリポジトリ | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| データセット | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Atlas Map | [atlas.nomic.ai](https://atlas.nomic.ai/data/mookiezi/discord-alpha/map) |
