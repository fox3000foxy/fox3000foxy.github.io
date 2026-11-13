---
title: "Luna Protocol：Discord 50kサンプルで15億パラメータモデルを微調整した理由と、few-shot primingが全部変えた理由"
description: "少ないデータで訓練した小さいモデルの方が大きいモデルに勝てる。ただし起動の仕方を知ってればね。Luna ProtocolがHermes 3Bから微調整Qwen 1.5Bへ移った理由と、few-shot primingが真の進歩要因になった理由がここにある。"
date: 2026-07-17
authors:
  - fox3000foxy
tags:
  - discord
  - llm
  - fine-tuning
  - few-shot-learning
  - qwen
  - unsloth
  - open-source
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "ah8oW9XKvPCtXI9m2yyuYj5fe+rgI7F2UdoEO4IdMdvoiFCeoQ9NjznuYL3U3HntJg3MlxfYroBhVfFXLKvhJQ=="
---

# Luna Protocol：Discord 50kサンプルで15億パラメータモデルを微調整した理由と、few-shot primingが全部変えた理由

[1本目の記事](/articles/en/luna-protocol-discord-bot)では人間を真似るDiscordボットを作った。睡眠、タイプミス、ためらい、忘却、自発メッセージだ。挙動システムは筋が通ってた。その裏のLLMは30億パラメータのHermesモデルで、Q8_0量子化、VRAM 3GB消費だった。

動いてた。でも大きすぎた。

Discordボットに「nm just chillin, u」って言うのに30億パラメータモデルは要らない。要るのは**文体一貫性**だ。正確な会話調子をメッセージごとに保つ能力で、「事務アシスタント」モードに流れないことだ。小さくて少ないデータで訓練したモデルを数例で起動した方が、単純システムプロンプトで通す大きいモデルよりうまくいくことが分かる。

この記事はLuna Protocol公式モデルについてだ。なぜ存在するか、なぜ3Bじゃなく1.5Bか、なぜ7.3Mじゃなく訓練サンプル50kか、なぜfew-shot primingが「いいおまけ」から手法全体の心臓になったかだ。

---

## 3Bモデルの問題

元の設定は`Discord-Micae-Hermes-3-3B.Q8_0.gguf`を使ってた。Discordデータで微調整した30億パラメータモデルだ。良い応答を出してた。でもこうだ。

| 指標 | Hermes-3-3B Q8_0 | 目標 |
|--------|-------------------|--------|
| VRAM使用 | 約3GB | 1GB未満 |
| トークン生成 | 約30トークン/秒 | 60+トークン/秒 |
| モデルファイルサイズ | 約3.2GB | 1GB未満 |
| コールド起動時間 | 約8秒 | 約3秒 |

控えめサーバーで24時間365日回るボットにVRAM 3GBは大きい。生成速度もたまのメッセージには正しいけど、連投応答や複数活性チャンネルではもっさり感じた。

問いはこうだった。Discord-Dialogues文体を半分のパラメータで出せるか。

---

## 微調整の決定：なぜ7.3Mじゃなく50kか

[Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues)データセットは**730万やり取り**と**1,700万発話ターン**を持つ。本物Discord会話の巨大コーパスだ。明らかな手法は全データセットで訓練することだった。

逆をやった。**50,000サンプル**で訓練した。利用可能データの1パーセント未満だ。

理由はこうだ。**訓練データ量はモデルが訓練分布に過学習する度合いに直接影響する**。

730万例で訓練したモデルは会話のとても特定の統計分布を学ぶ。この分布再現は得意になる。でも**硬く**もなる。推論時に渡す新模様に適応する余白が減る。

50k例で訓練したモデルはDiscord会話の一般的調子と語域を学ぶ（くだけた、短い、略語、小文字）。でも文脈内例で**操縦される**柔軟性は残る。few-shot例はすでに学んだ巨大分布と戦わない。軽い分布を補う。

これが中心的直観だ。**限られた訓練データはfew-shot primingを効かせる**。

---

## モデル：技術詳細

Luna Protocolモデルは[Qwen2.5-1.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct)の**QLoRA微調整**だ。

| パラメータ | 値 |
|-----------|-------|
| ベースモデル | `unsloth/Qwen2.5-1.5B-Instruct-bnb-4bit` |
| 手法 | QLoRA (4-bit) |
| LoRAランク | `r=16`、`lora_alpha=16` |
| 対象モジュール | `q/k/v/o_proj`、`gate/up/down_proj` |
| 訓練可能パラメータ | 18 464 768 / 1 562 179 072 (1.18%) |
| 訓練データ | 約50,000例（Discord-Dialogues部分集合） |
| フィルタ | 例あたり8-512トークン |
| エポック | 2-3 |
| 機材 | Kaggle T4 |
| フレームワーク | [Unsloth](https://github.com/unslothai/unsloth) |

データセットはDiscord-Dialoguesの前処理forkで、きれいな`user`や`assistant`ターンだけ残すよう濾過した。ユーザーとアシスタントのやり取りだけで、システムメッセージもメタデータもボットコマンドもなしだ。後で大事になる。

### 利用可能量子化

| ファイル | 量子化 | サイズ | 備考 |
|------|-------------|------|-------|
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q2_K.gguf` | Q2_K | 676MB | 明らかに劣化。非推奨 |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf` | Q4_K_M | 986MB | サイズと品質の良い妥協（推奨） |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q8_0.gguf` | Q8_0 | 1.65GB | 最高の文体忠実度 |

推奨モデルは**Q4_K_M**だ。1GB未満で、速くて、会話文体をよく保つ。Q2_Kはこのサイズのモデルには劣化しすぎる。Q8_0は最高品質だがメモリ68パーセント増しだ。

---

## few-shot primingの突破

全部変えた部分がここだ。

HuggingFaceのモデルカードに警告がある。

> 素のプロンプトで起動なしだと、このモデルはQwenデフォルトの「アシスタント」調子に戻りがちだ。短いfew-shot起動で大きく変わる。

訓練データをどう構造化したかの直接の帰結だ。

### システムプロンプトだけでは動かない理由

Discord-Dialogues訓練データは`user`や`assistant`ターンしか含まない。訓練セットに**システム役の例はゼロ**だ。モデルはシステムプロンプトを文体指示として従う訓練をされたことがない。

「君はLunaで、気軽に話して」みたいなシステムプロンプトを渡すと、指示は聞くけど出力に翻訳する学んだ堅い模様がない。Qwenデフォルト挙動に戻る。助かる、構造的、少し堅い。

### few-shot例が動く理由

訓練で使ったのと同じChatML形式（`user`や`assistant`ターン構造）で会話例を注入すると、何かが起こる。モデルは訓練由来の模様を認識して、それに合わせて出力を整える。

実際のfew-shot起動はこんな感じだ。

```yaml
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
   assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

この例はシステムプロンプトの後、本物の会話の前に注入される。モデルは指示じゃなく会話履歴の一部として捉える。本物のやり取りとしてね。これが本質的区別だ。気軽調子がどう見えるか*見せて*るんであって、*命令*してない。

### 前と後

few-shot起動なし（素のシステムプロンプト）：

```
User: yo whats good
Bot: Hello! I am doing well, thank you for asking. How can I assist you today?
```

few-shot起動あり（例3つ）：

```
User: yo whats good
Bot: nm just chillin, u
```

違いは鮮やかだ。モデルは語域全部を取る。小文字、略語、気軽調子、短い応答だ。Qwen訓練データ文体じゃなく例文体をなぞる。

---

## メモリと速度：具体的な数字

Hermes-3-3BからLuna-Protocol-1.5Bへの移行は測れる利得を運ぶ。

| 指標 | Hermes-3-3B Q8_0 | Luna-Protocol Q4_K_M | 改善 |
|--------|-------------------|----------------------|-------------|
| VRAM使用 | 約3GB | 約986MB | **67%減** |
| モデルファイルサイズ | 約3.2GB | 約986MB | **69%小** |
| トークン生成 | 約30トークン/秒 | 60+トークン/秒 | **2倍速** |
| コールド起動 | 約8秒 | 約3秒 | **62%速** |
| 文脈窓 | 8192 | 8192 | 同一 |

### 速度利得が本物な理由

小さいモデルは推論が根本から速い。30億じゃなく15億パラメータでこうだ。

- トークンあたり**行列乗算が少ない**：注意層もFFN層も出力射影も全部パラメータ数に線形だ
- **キャッシュ利用が良い**：小さいモデルはL2やL3キャッシュに重みが入りやすい
- **メモリ帯域圧が低い**：トークンあたりVRAMから読むバイトが少ない

控えめ構成でCPUだけ（2コア、GPUなし）だと、1.5Bモデルは3Bモデルの約**2倍速**でトークン生成する。「ボットっぽい」と「打ってる本物っぽい」の違いだ。

### プロンプトキャッシュが利点を増幅する

Luna Protocolはプロンプトキャッシュ有効の`llama-server`を使う（`--cache-reuse 256`）。つまりこうだ。

1. セッション初メッセージがプロンプト処理の完全コストを払う（システムプロンプトとfew-shot例とユーザーメッセージ）
2. 後続メッセージは新しいトークンだけ処理する。キャッシュ前置きが再利用されるからだ
3. few-shot例5つ（約50-150トークン）で、初回後の追加コストは無視できる

few-shot例はセッション初メッセージ後は実質「無料」になる。モデルは限界ゼロコストで文体誘導を受ける。

---

## 実装：コードでどう動くか

Luna Protocolのfew-shot仕組みはきれいで最小だ。3ファイルで全部やる。

### 1. 設定（`config.yml`）

```yaml
few_shot_enabled: true
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
  - user: "whats up"
    assistant: "yooo not much, what about you"
  - user: "how was your day"
    assistant: "it was alright, nothing crazy happened lol"
```

設定はホットリロード可能だ。例を変えて保存すれば、再起動なしでボットは即新文体を取る。

### 2. 整形と注入（`src/core/few-shot.ts`）

`formatFewShotExamples()`関数はYAML例をChatMLメッセージオブジェクトに変換する。

```typescript
export function formatFewShotExamples(
  examples: FewShotExample[],
  username = "user"
): Array<{ role: "user" | "assistant"; content: string }> {
  const messages = [];
  for (const example of examples) {
    messages.push({ role: "user", content: `${username}: ${example.user}` });
    messages.push({ role: "assistant", content: example.assistant });
  }
  return messages;
}
```

`injectFewShotIntoConversation()`関数はシステムプロンプト直後に置く。

```typescript
export function injectFewShotIntoConversation(
  messages: Message[],
  fewShotMessages: Message[]
): Message[] {
  const systemMessage = messages[0];
  const userMessages = messages.slice(1);
  return [systemMessage, ...fewShotMessages, ...userMessages];
}
```

### 3. 統合（`src/core/llm-client.ts`）

LLM呼び出しごとに、有効ならfew-shot例を注入する。

```typescript
let finalMessages = messages;
if (FEW_SHOT_ENABLED && FEW_SHOT_EXAMPLES.length > 0) {
  const fewShotMessages = formatFewShotExamples(FEW_SHOT_EXAMPLES);
  finalMessages = injectFewShotIntoConversation(messages, fewShotMessages);
}
```

モデルが受け取るのはこうだ。`[システムプロンプト] + [few-shot例] + [会話履歴]`だ。

---

## Discord-Dialogues文体を保つ

元Discord-Dialoguesデータセットはとても特定の会話署名を持つ。

- **短いメッセージ**：ターンあたり平均32.8トークン
- **くだけた語域**：略語、小文字、句読点なし
- **速いやり取り**：長い独白じゃなく短い往復複数
- **自然な不完全さ**：タイプミス、「lol」、「fr」、「ngl」、「tbh」

Luna Protocolモデルは2仕組みでこの文体を保つ。

### 1. 微調整が基本分布をずらす

50k訓練サンプルがモデルにDiscord会話の**統計指紋**を教える。応答はだいたい短くて小文字でくだけたって学ぶ。これでモデルデフォルト出力がQwenの「助かるアシスタント」モードから遠ざかる。

### 2. few-shot primingが結果を固定する

few-shot例は微調整で学んだ模様を正確に強化する。**文体錨**として働く。長い会話でモデルが少し堅い調子に流れても、文脈内の例が引き戻す。

組み合わせは各単体より強い。
- few-shotなし微調整：モデルは*全体*くだけてるけど一貫しない
- 微調整なしfew-shot：モデルは例に従おうとするけどアシスタントモードに何度も戻る
- 微調整とfew-shot：モデルは**常に**人物に留まる

---

## 哲学：小さいモデル、賢いprompting

LLMデプロイの常識は「大きい方が良い」って言う。パラメータ増し、訓練データ増し、VRAM増しだ。Luna Protocolは逆を行く。

- **3Bじゃなく1.5B**：半分のパラメータ、半分のメモリ、2倍速い
- **7.3Mじゃなく50kサンプル**：少ない訓練データ、文脈内学習の柔軟性増し
- **システムプロンプトじゃなくfew-shot priming**：モデルに欲しいものを見せる、言うだけじゃない

これは単なる技術最適化じゃなく自覚的設計選択だ。Discordボットは汎用アシスタントじゃなく軽い会話仲間であり続ける必要がある。一貫して速く「nm just chillin, u」って言わなきゃいけない。サーバーVRAM予算を食い尽くさずにね。

結果：月5ドルVPSで回るボットだ。リアルタイム入力の感じが出る速さでトークン生成する。微調整とfew-shot primingの組み合わせで一貫した人格を保つ。各部分の合計より価値がある。

---

## 立ち上げ

### モデルを落とす

```bash
npm run download-model
# Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.ggufを落とす
```

または[HuggingFace](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues)から手動で。

### 設定する

```yaml
# config.yml
llama_model_path: "./models/Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf"
few_shot_enabled: true
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

### 起動する

```bash
npm run dev                    # dev（ホットリロード）
npm run build && npm start     # 本番
./start.sh                     # PM2（llama-server付き本番）
```

---

## 結論

Luna Protocolモデルが証明するのは、文体中心の会話AIには**少ない方が良い**ってことだ。丁寧に選んだ50kサンプルで訓練した1.5Bモデルを数例で起動した方が、何百万例で訓練した3Bモデルに勝つ。メモリコストはごく一部で、生成速度は2倍だ。

few-shot primingが小モデルの中心的仕組みだ。リアルタイム会話アプリに使えるものにするのがこれだ。例は「助ける」だけじゃない。モデル挙動を根本から変える。訓練された形式そのままになぞらせる。

コードはオープンソース、モデルはHuggingFace、データセットは公開だ。人間っぽい会話ボットを作りたいなら、レシピはこうだ。小さいモデル、限られた微調整、堅いfew-shot起動だ。

| リソース | リンク |
|----------|------|
| GitHubリポジトリ | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| モデル（HuggingFace） | [fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues) |
| データセット | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| 1本目の記事 | [Luna Protocol：Discord自律ボットを作った](/articles/en/luna-protocol-discord-bot) |
