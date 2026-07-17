---
title: "Luna Protocol：5万件のDiscordサンプルで1.5Bモデルをファインチューニングし、なぜFew-Shotプライミングが秘密兵器になったのか"
description: "少ないデータで学習した小さなモデルが、より大きなモデルを凌駕できる——プロンプトの使い方を知っていれば。Luna Protocolが3B Hermesから1.5B Qwenのファインチューンに切り替えた理由、そしてFew-Shotプライミングが真のゲームチェンジャーになった理由をご紹介します。"
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
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "E+I2zmiVKYZ522Mm3zohK346pe0IehYArJEcGIro8ySF21kVzs0u7avLB2YtucHkwUsGBxnDZl3ldB33rb70GA=="
---

# Luna Protocol：5万件のDiscordサンプルで1.5Bモデルをファインチューニングし、なぜFew-Shotプライミングが秘密兵器になったのか

[最初の記事](/articles/ja/luna-protocol-discord-bot)では、人間をシミュレートするDiscordボットを作りました——睡眠、タイプミス、ためらい、忘れっぽさ、自発的なメッセージ。行動システムはしっかりしていました。その背後にあるLLMは3BパラメータのHermesモデルで、Q8_0に量子化され、3GBのVRAMを消費していました。

動作しました。しかし、オーバーキルでした。

Discordボットが「nm just chillin, u」と言うのに、3Bパラメータのモデルは必要ありません。必要なのは**スタイルの一貫性**——特定の会話調をメッセージごとに維持し、企業のアシスタントモードに陥らない能力です。そして、少ないデータで学習した小さなモデルに、いくつかの例でプライミングをかける方が、大きなモデルがシステムプロンプトで力押しするよりも効果的であることがわかりました。

この記事では、Luna Protocolの公式モデルについて説明します：なぜ存在するのか、なぜ3Bではなく1.5Bなのか、なぜ730万ではなく5万の学習サンプルなのか、そしてなぜFew-Shotプライミングが「あると便利」からアプローチ全体の中核へと変わったのか。

---

## 3Bモデルの問題

元の設定では`Discord-Micae-Hermes-3-3B.Q8_0.gguf`——Discordデータでファインチューニングされた3Bパラメータのモデルを使用していました。良い応答を生成しましたが、次の問題がありました：

| 指標 | Hermes-3-3B Q8_0 | 目標 |
|--------|-------------------|--------|
| VRAM使用量 | ~3 GB | < 1 GB |
| トークン生成速度 | ~30 tok/s | ~60+ tok/s |
| モデルファイルサイズ | ~3.2 GB | < 1 GB |
| コールドスタート時間 | ~8s | ~3s |

24時間365日稼働するボットにとって、3GBのVRAMは大きな負担です。また、生成速度は——たまのメッセージには問題ありませんが——バースト応答や複数チャンネルがアクティブなときにはもたつきを感じさせました。

問題は：同じDiscord-Dialoguesのスタイルを半分のパラメータで実現できるか？

---

## ファインチューニングの判断：なぜ730万ではなく5万なのか

[Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues)データセットには**730万の会話**と**1700万のターン**が含まれています。これは大規模な実際のDiscord会話コーパスです。明白なアプローチはデータセット全体で学習することでした。

私は逆を行いました。**5万サンプル**で学習しました——利用可能なデータの1%未満です。

理由はこれです：**学習セットのサイズは、モデルが学習分布に過学習する度合いに直接影響します**。

730万の例で学習したモデルは、会話の非常に特定の統計的分布を学習します。その分布を再現することに長けますが、同時に**硬直的**になります——推論時に新しいパターンに適応する柔軟性が低くなります。

5万の例で学習したモデルは、Discord会話の全体的なトーンとレジスター（非公式、短縮形、略語、小文字）を学習しますが、**コンテキスト内の例で誘導**されるための十分な柔軟性を保持します。Few-Shotの例は、巨大な学習済み分布と戦うのではなく、より軽量な分布を補完します。

これが核心的な洞察です：**限られた学習データにより、Few-Shotプライミングがより効果的になります**。

---

## モデル：技術詳細

Luna Protocolモデルは、[Qwen2.5-1.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct)の**QLoRAファインチューン**です：

| パラメータ | 値 |
|-----------|-------|
| ベースモデル | `unsloth/Qwen2.5-1.5B-Instruct-bnb-4bit` |
| 手法 | QLoRA（4-bit） |
| LoRAランク | `r=16`, `lora_alpha=16` |
| 対象モジュール | `q/k/v/o_proj`, `gate/up/down_proj` |
| 学習可能パラメータ | 18,464,768 / 1,562,179,072（1.18%） |
| 学習データ | ~50,000例（Discord-Dialoguesサブセット） |
| フィルター | サンプルあたり8-512トークン |
| エポック | 2-3 |
| ハードウェア | Kaggle T4 |
| フレームワーク | [Unsloth](https://github.com/unslothai/unsloth) |

データセットはDiscord-Dialoguesの前処理済みフォークで、クリーンな`user`/`assistant`ターンのみにフィルタリングされています——システムメッセージ、メタデータ、ボットコマンドは含まれません。これは後で重要になります。

### 利用可能な量子化

| ファイル | 量子化 | サイズ | 備考 |
|------|-------------|------|-------|
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q2_K.gguf` | Q2_K | 676 MB | 顕著に劣化——非推奨 |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf` | Q4_K_M | 986 MB | サイズ/品質のバランス良好（推奨） |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q8_0.gguf` | Q8_0 | 1.65 GB | 最高のスタイル忠実度 |

推奨モデルは**Q4_K_M**——1GB未満、高速で、会話スタイルをよく保持します。Q2_Kはこのサイズのモデルでは劣化が大きすぎます。Q8_0は最高品質ですが、68%多くメモリを消費します。

---

## Few-Shotプライミングのブレークスルー

ここからすべてが変わりました。

HuggingFaceのモデルカードには警告があります：

> ベアプロンプトでプライミングなしの場合、このモデルはQwenのデフォルトのアシスタント調に戻る傾向があります。短いFew-Shotプライムが大きな違いを生みます。

これはバグではありません——学習データの構造化方法の直接的な結果です。

### システムプロンプトだけでは機能しない理由

Discord-Dialoguesの学習データには`user`/`assistant`ターンしか含まれていません。学習セットには**システムロールの例がありません**。モデルはシステムプロンプトをスタイル指示として従うように学習されたことがありません。

「あなたの名前はLunaです、カジュアルに話してください」のようなシステムプロンプトを与えると、指示は認識しますが、それを出力に変換するための強力な学習パターンを持っていません。Qwenのデフォルト（親切、構造化、ややフォーマル）に戻ってしまいます。

### Few-Shot例が機能する理由

モデルが学習したものと同じChatML形式（`user`/`assistant`ターン構造を使用）で会話例を注入すると、モデルは「カチッ」とはまります。モデルは学習データからパターンを認識し、出力を一致させます。

実際のFew-Shotプライムは次のようになります：

```yaml
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

これらの例は、システムプロンプトの後、実際の会話の前に注入されます。モデルはこれらを指示ではなく、会話履歴の一部として認識します。これが重要な違いです——カジュアルであるように*言われる*のではなく、カジュアルがどのようなものかを*見せられる*のです。

### 前後比較

Few-Shotプライミングなし（ベアシステムプロンプト）：

```
User: yo whats good
Bot: Hello! I am doing well, thank you for asking. How can I assist you today?
```

Few-Shotプライミングあり（3例）：

```
User: yo whats good
Bot: nm just chillin, u
```

その差は歴然です。モデルは異なる単語を生成するだけでなく、レジスター全体——小文字、略語、カジュアルな調子、短い応答——を採用します。Qwenの学習データのスタイルではなく、例のスタイルに適合します。

---

## メモリと速度：具体的な数値

Hermes-3-3BからLuna-Protocol-1.5Bへの切り替えで、測定可能な向上が得られます：

| 指標 | Hermes-3-3B Q8_0 | Luna-Protocol Q4_K_M | 向上率 |
|--------|-------------------|----------------------|-------------|
| VRAM使用量 | ~3 GB | ~986 MB | **67%削減** |
| モデルファイルサイズ | ~3.2 GB | ~986 MB | **69%小型化** |
| トークン生成速度 | ~30 tok/s | ~60+ tok/s | **2倍高速** |
| コールドスタート | ~8s | ~3s | **62%高速化** |
| コンテキストウィンドウ | 8192 | 8192 | 同じ |

### 速度向上が本物である理由

小さなモデルは単に「遅くない」だけでなく、本質的に推論が高速です。1.5Bパラメータ（3Bではなく）では：

- **トークンあたりの行列乗算が少ない**：アテンション層、FFN層、出力投影はすべてパラメータ数に比例してスケール
- **キャッシュ利用の向上**：小さなモデルはより多くの重みをL2/L3キャッシュに収められる
- **メモリ帯域幅の負荷低減**：トークンあたりにVRAMから読み取るバイト数が減少

一般的なCPUのみの構成（2コア、GPUなし）では、1.5Bモデルは3Bモデルの約**2倍の速度**でトークンを生成します。これは「ボットっぽい」と「人間がタイピングしているように感じる」の違いです。

### プロンプトキャッシングがアドバンテージを増幅

Luna Protocolはプロンプトキャッシングを有効にした`llama-server`（`--cache-reuse 256`）を使用しています。つまり：

1. セッションの最初のメッセージは完全なプロンプト処理コスト（システムプロンプト + Few-Shot例 + ユーザーメッセージ）を支払う
2. 後続のメッセージは*新しい*トークンのみを処理——キャッシュされたプレフィックスが再利用される
3. 5つのFew-Shot例（約50-150トークン）の場合、最初のリクエスト以降のオーバーヘッドは無視できる

Few-Shotの例は、セッションの最初のメッセージ以降、実質的に「無料」になります。モデルは限界費用ゼロでスタイルガイダンスを得られます。

---

## 実装：コードの仕組み

Luna ProtocolのFew-Shotシステムはクリーンでミニマルです。3つのファイルがすべてを処理します：

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

設定はホットリロード可能です。例を変更して保存すると、ボットは即座に新しいスタイルを適用します——再起動は不要です。

### 2. フォーマットと注入（`src/core/few-shot.ts`）

`formatFewShotExamples()`関数はYAMLの例をChatMLメッセージオブジェクトに変換します：

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

`injectFewShotIntoConversation()`関数はそれらをシステムプロンプトの直後に配置します：

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

LLM呼び出しの前に、有効な場合はFew-Shotの例が注入されます：

```typescript
let finalMessages = messages;
if (FEW_SHOT_ENABLED && FEW_SHOT_EXAMPLES.length > 0) {
  const fewShotMessages = formatFewShotExamples(FEW_SHOT_EXAMPLES);
  finalMessages = injectFewShotIntoConversation(messages, fewShotMessages);
}
```

モデルが受け取る：`[system_prompt] + [few_shot_examples] + [conversation_history]`

---

## Discord-Dialoguesのスタイルを維持する

元のDiscord-Dialoguesデータセットには非常に特徴的な会話のシグネチャがあります：

- **短いメッセージ**：ターンあたり平均32.8トークン
- **非公式なレジスター**：略語、小文字、句読点なし
- **素早い応酬**：長いモノローグではなく、短いやりとり
- **自然な不完全さ**：タイプミス、「lol」、「fr」、「ngl」、「tbh」

Luna-Protocolモデルは2つのメカニズムでこのスタイルを保持します：

### 1. ファインチューニングが基本分布をシフト

5万の学習サンプルはモデルにDiscord会話の*統計的指紋*を教えます。応答が典型的に短く、小文字で、非公式であることを学習します。これにより、モデルのデフォルト出力がQwenの親切なアシスタントモードからシフトします。

### 2. Few-Shotプライミングがそれを固定

Few-Shotの例は、ファインチューニング中にモデルが学習した正確なパターンを強化します。これらは**スタイルアンカー**として機能します——長い会話中にモデルがフォーマルな調子にわずかにドリフトしても、コンテキスト内の例が常に引き戻します。

この組み合わせは、どちらかのメカニズム単独よりも強力です：
- Few-Shotなしのファインチューニング：モデルは*概ね*カジュアルだが一貫性がない
- ファインチューニングなしのFew-Shot：モデルは例に従おうとするが、アシスタントモードに戻り続ける
- ファインチューニング + Few-Shot：モデルは**一貫して**キャラクターを保つ

---

## 哲学：小さなモデル、スマートなプロンプティング

LLMデプロイメントの従来の常識は「大きい方が良い」です。より多くのパラメータ、より多くの学習データ、より多くのVRAM。Luna Protocolは逆のアプローチを取ります：

- **3Bではなく1.5B**：半分のパラメータ、半分のメモリ、2倍の速度
- **730万ではなく5万サンプル**：少ない学習データ、コンテキスト内学習のための高い柔軟性
- **システムプロンプトではなくFew-Shotプライミング**：望むものをモデルに*見せる*、単に*伝える*のではない

これは単なる技術的最適化ではありません——設計哲学です。Discordボットは汎用アシスタントである必要はありません。「nm just chillin, u」を一貫して、迅速に、サーバーのVRAM予算をすべて消費せずに言えればよいのです。

結果：月5ドルのVPSで動作し、リアルタイムのタイピングと感じられるほど速くトークンを生成し、ファインチューニングとFew-Shotプライミングの組み合わせ（その合計以上の効果）によって一貫した個性を維持するボット。

---

## セットアップ

### モデルのダウンロード

```bash
npm run download-model
# Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf をダウンロード
```

または[HuggingFace](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues)から手動で。

### 設定

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

### 実行

```bash
npm run dev                    # 開発（ホットリロード）
npm run build && npm start     # 本番
./start.sh                     # PM2（llama-server使用の本番環境）
```

---

## 結論

Luna Protocolモデルは、スタイル特化型の会話AIにおいては**少ない方が多い**ことを証明しています。5万の厳選されたサンプルで学習した1.5Bモデルは、少数の例でプライミングすることで、数百万の例で学習した3Bモデルを——わずかなメモリコストと2倍の生成速度で——凌駕します。

Few-Shotプライミングは小さなモデルにとって単なる「あると便利」ではありません。それは、リアルタイム会話アプリケーションでそれらを実用的にするメカニズムです。例は単に「助ける」だけでなく——モデルが学習した正確な形式にマッチすることで、モデルの振る舞いを根本的に変えます。

コードはオープンソース、モデルはHuggingFace上、データセットは公開されています。人間らしい会話ボットを構築したいなら、レシピはこれです：小さなモデル、限定的なファインチューニング、強力なFew-Shotプライミング。

| リソース | リンク |
|----------|------|
| GitHubリポジトリ | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| モデル（HuggingFace） | [fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues) |
| データセット | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| 最初の記事 | [Luna Protocol：自律型Discordボットを作りました](/articles/ja/luna-protocol-discord-bot) |
