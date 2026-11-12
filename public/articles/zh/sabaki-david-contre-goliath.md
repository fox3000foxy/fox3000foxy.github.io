---
title: "Sabaki vs System One：大卫对阵歌利亚，全球最小的决策模型"
description: "20KB 对 421M 参数。Sabaki 在 typed-decisions 上丢了 7 个点，延迟却从 25 秒 CPU 降到离线 1 毫秒以内。一个组织型 MoE 的解剖。"
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
author_sig: "Qynb62OADISkLudNs+nXsKjFR/19gNcmFlM1dPn3brPadSD/62kR9Sg3q8UHdMgLK2N40gbAsl8kJu7I7ico4w=="
---

## 引言

如果你从九月开始就混 Hacker News 或者 Twitter，你肯定刷到过 Jev。

2026 年 9 月 15 日，TypeSafe 发布了 Jev，他们的第一个“System One”。卖点一句话就能讲清：别再让 LLM 生成 JSON 来选标签了。给他一个 `state` 加上类型化的问题，他直接返回带概率的类型化决策。一次 forward，零 token 采样，后面什么都不用解析。

直接爆了。Vercel AI Gateway 上线首日采用量破纪录，几天之内冒出五个 Elixir 客户端，人人都在拿 Jev 跟自己的东西做 benchmark。说实话这热度不难理解。我们之前多少年都在手搓 `只准回 {"choice": ...}` 这种 prompt，然后祈祷模型别自创一个选项，别把 JSON 写崩，别幻觉出一个字段。Jev 给这个需求起了个名字，还 ship 了一个干净的 API：`POST /v1/systemone`，`choice / score / noul` 三种问题，回答带 `probabilities` 加 `confidence`。

我很喜欢这个想法。除了省钱那个模型，其他都喜欢。说清楚一点，我从来没给 Jev 付过钱。

因为 Jev 骨子里还是个封闭 API。权重未知，不能自托管，每个决策都是一次网络往返加一次计费。后来跟进的开源替代，个个都是 400M 参数起步，还强制要 GPU。

所以我造了另一个极端：[Sabaki](https://sabaki.fox3000foxy.com/)。一个关键词路由器加一个纯 TypeScript 逻辑回归，说的跟 Jev 是同一份契约（同样的 `choice / score / noul` shape，同样的 `/v1/systemone` endpoint），但跑在**1 毫秒以内**，只要 **20KB** 的 JSON。nano 模式零依赖，离线，0 块钱。

给你个 concept：Laya 要加载 843MB 的 safetensors。OpenDecider-nano 要 2GB 内存。Sabaki nano invoices 只要 20KB。重量比大概是 **40000 倍**。

想要方方正正带数字的版本，网站上有 2026 年 10 月的 preprint v1：*Sabaki: An Organizational Mixture-of-Experts for Typed Decisions on CPU*（[PDF](/assets/paper/sabaki-organizational-moe-typed-decisions.pdf)）。设计，测量，tradeoff，全在里面。这篇文章是可读版，代码开着放在旁边。

我不是关起门来写了篇 benchmark 论文。我在给 [azalio/doomLaya](https://github.com/azalio/doomLaya) 做贡献（我的 fork：[fox3000foxy/doomLaya](https://github.com/fox3000foxy/doomLaya)），一个真的让 Laya 和 Jev 进 FreeDoom 里打怪的 harness，决策 model-owned，每 tick 遥测，还有录像。Goliath 实战打成什么样我亲眼见过，网络一咳嗽，它也一样咳嗽。

咱们把引擎一个一个拆开。老规矩，带着真代码拆。

## 所有人都在同一个擂台上打

Jev、Laya、OpenDecider 认的只有同一个数据集：[LocalLLaMA/typed-decisions](https://huggingface.co/datasets/LocalLLaMA/typed-decisions)。4 个合成 workflow（客服，发票，安全，agent 轨迹），每个 case 5 个问题，1200 个训练 case，400 个测试 case，2000 个决策。

| 模型 | 参数 | 测试分数 | 延迟 | 运行环境 |
|---|---|---|---|---|
| OpenDecider-nano | ~400M | 0.796 | 17ms GPU | GPU，2 Go 内存 |
| Laya typed-decisions | 421M | 0.766 | ~25s/state CPU，~830ms/用例 MLX | GPU |
| Jev 1.13 | 闭源 | ~0.73-0.75 | ~710ms API | 仅 API |
| **Sabaki mini** | 22M int8 | **0.69** | **~20ms CPU** | CPU，22 Mo |
| **Sabaki nano** | ~0 | **0.61** | **<1ms** | 到处都能跑 |
| Laya base 零样本 | 421M | 0.362 | 相同 | GPU |

随机猜是 0.318，多数类是 0.461。所以 Laya base 不微调只有 0.362，基本就是“礼貌地瞎猜”。记住这个，后面有用。

Sabaki 跟第一名差 7 个点。没 GPU 的时候，延迟反过来差 1000 倍。整篇文章其实就这两句话，剩下的都是解释为什么。

先打个预防针：同一个 `choice / score / noul` 接口后面，厨房完全不是一回事。Jev 是封闭 API。Laya 是微调过的 ModernBERT-large。OpenDecider 是蒸馏出来的 Ettin-encoder。Sabaki 是数词加 MiniLM int8。契约一样，预算完全不是一个量级。

## Jev，所有人都见过的那记耳光

该给 TypeSafe 的 credit 得给：System One 这份契约，真的是个好想法。

以前给工单分类，你得这么干：让 LLM“在 billing、技术、spam 里选一个，只回 JSON”，然后解析回答，还要处理它回你“ 我觉得是 billing！😊”或者自创第四个分类的情况。每个问题都要烧 token，每个回答都可能搞崩你的 pipeline。

Jev 把 deal 改了：你发文本加带标准的问题，他把每个问题并行评估一遍，还你一个带分布的类型化值。

```bash
curl https://api.typesafe.ai/v1/systemone \
 -H "Authorization: Bearer $KEY" \
 -H 'content-type: application/json' \
 -d '{"state":"charge double ce mois-ci","questions":{"dept":{"type":"choice","instructions":"Route ce message.","criteria":{"billing":"paiements","technical":"bugs"}}}}}'
```

回答：`{ choice, probabilities, confidence }`。没有自由文本。你的代码可以直接接着写分支。

这就是它病毒式传播的原因：Python 加 JS 的 SDK，Claude Code 插件，LangChain 集成，一下午谁都能把自己的 agent 接上去。TypeSafe 的文档推的也是健康用法：Jev 管快速小判断，外面围一圈确定性代码拼出真正的决策，置信度一低就走慢速 LLM 或者人工。

问题在剩下的部分。权重封闭，离线没门，按调用收费。一个 run 要做 100 个决策的 agent，这税就很肉了。Doom 35 ticks/s 的节奏更没戏：在 doomLaya 里，Jev 打 MAP01 seed 48 用了 68.97 秒，p50 HTTP 357ms。这次 run 的 API 账单是 $0.0046，不是我的账单，是 benchmark 的账单。run 本身是干净的，零死亡通关。但 35 ticks/s 的节奏下 357ms，等于游戏往前跑了 12 个 tick，你还在等网络。

Sabaki 偷的就是这份契约，同样的 questions，同样的 answers，同样的 `/v1/systemone`（由 `serve()`  serve 出来），只不过把需要数据中心的部分全砍了。

## Laya，不用 API 也能搞定的开源大块头

[ Laya](https://github.com/NandhaKishorM/laya) 出自 Convai Innovations，Apache-2.0。盖子底下：ModernBERT-large，421M，每个选项 1 个 `[MASK]` token。每个 marker 的 hidden state 过一个小 MLP，在问题的选项上 softmax。跟 Jev 一样，每个问题一次 forward。

```python
pipe = pipeline("text-classification", model="convaiinnovations/laya-typed-decisions")
```

0.766 这个数值得停下来说两句。这是**在 benchmark 训练集上微调过的 checkpoint**：1200 个 case，RLCD 加 logits 高斯噪声，log 加 spherical reward。同一个模型不做这个 fit，直接掉到 0.362。基本就是瞎猜。所以 Laya 的分数，意思是“大 encoder 加领域内训练”，不是“大 encoder 有魔法”。

在 CPU 上，它就是块砖。测过的 ONNX 移植版每个 state 要 25 秒左右。MLX FP16 平均每个 case 830ms，p99 到 5.3 秒。而且张嘴回答之前，先加载 843MB。

在 doomLaya 里，原版 Laya 180 秒没走出 MAP01。适配过的 v3（[azalio/laya-doom-v3](https://huggingface.co/azalio/laya-doom-v3)，在 Doom 数据上重训过）61.43 秒通关，MPS 上 p50 108ms，顺手还捡了把 shotgun。所以是的，能打，但在专用训练之后，在苹果 GPU 上，而且真正干活的是外面那个脚本执行器（A*，15 tick latch 的门，自动瞄准）。

我的总结：不在你的任务上训，Laya 就是个 421M 的镇纸。训了，很强，但 GPU 和数据都得备齐。

## OpenDecider，登顶榜首的那个

[OpenDecider](https://github.com/manjunathshiva/opendecider)，是 Manjunath 决定在所有人的 benchmark 上把所有人赢一遍。结果：Ettin-encoder-400m 全量微调加 MLP 头，KL loss 吃 Qwen3-235B 加 DeepSeek 蒸出来的软目标，干到 **0.796**。

```bash
pip install opendecider
# L40S 上 17ms/问题，M4 Max 上 18ms，batch 之后约 9ms
```

50% coverage 下 selective accuracy 到 0.943，Jev 是 0.882。纸面上两全其美：开源，校准好，速度快。

实际上：加载 nano 要 2GB 内存，想稳住 17ms 就得上 GPU，phishing 只有 0.63（Jev 是 0.90，OOD 直接把它洗了），而且跟 Laya 一样，在 benchmark 的训练集上训过。测试集是没见过，领域见过。

力气比赢了，但还是 400M 身后站着 GPU。你塞不进 Cloudflare Worker，也塞不进笔记本上的游戏循环。

## 150M 档，以及下面的真空地带

openJev-verdict-2.0（151M），julia-1（144M 多语言），Open Jev（150M），Largha-150M（144M 英加中），Vela（0.3B 到 9B）。全是 ModernBERT 或者 mmBERT-small，全能在 CPU 上跑，训起来都很友好（Open Jev 号称 Colab T4 上 30 分钟）。数字都是 self-reported，协议各不相同，所以看看就好，但这个家族确实存在。

通用 Sabaki 只有 **22.7M**。比这一档里最小的还小 6.5 倍左右。100M 以下，能回答运行时定义的问题，除了我们没别人。

这就是“世界最小”的意思：不是分数最高，是能读你的 `instructions` 加 `criteria`、能在没有专家会答的时候兜底的最小外壳。

## Sabaki，笨路由器和它的一次性专家们

行，大的说完了。轮到大卫了，好玩的部分在这里。

Sabaki 不装聪明大模型，不假装理解世界。它是个组织型 MoE：系统层 1 个稀疏路由器，一堆独立专家，每次输入只激活一个。每个插件都是独立 npm 包，带自己的 manifest、权重、版本。你路由到谁，才装谁。

[sabaki-js](https://github.com/sabaki-js) 这个 org：13 个仓库，core `sabaki`（129 个 commit），6 个 `@sabaki-js/*` 插件，权重，Cloudflare worker，还有教你写自己插件的模板。

core 的 `package.json` 已经把故事讲完了：

```json
"dependencies": { "@typesafe-ai/sdk": "^0.7.0" },
"optionalDependencies": { "onnxruntime-node": "^1.22.0" }
```

nano 模式零运行时依赖。全是编译好的 TypeScript，不用装东西，也就没有什么东西会在两个 ONNX 版本之间碎掉。

### 路由器，或者说几行代码怎么做决策

路由器住在 `src/index.ts`，分词长这样（`src/index.ts:129`）：

```ts
function tokens(s: string): string[] {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/).filter((w) => w.length > 3);
}
```

小写，去 accents，4 个字母起收。这个过滤干掉了所有噪音（“le”，“de”，“ok”）。在客服工单上效果是质变，因为你的匹配全落在有实义的词上。

打分本身在 `route()` 里（`src/index.ts:251`），胜负手就在这里：

```ts
const hits = kws.filter((k) =>
  words.some((w) => w.includes(k) || k.includes(w))).length;
const score = hits / Math.sqrt(kws.length);
```

双向宽松匹配：`billing` 能抓住 `billed`，`invoice` 能抓住 `invoicing`。除以词表长度的平方根，是为了不惩罚关键词多的大插件，不然 mail 插件带着 600 个词，邮件里有个“hello”就把所有人都压死了。

每个插件有自己的阈值，默认 0.15 存在 `src/index.ts:139`，mail 是 0.03 因为标题都很短。低于阈值：

```ts
return { domain: "unknown", decision: null, confidence: 0, plugin: null };
```

未知领域就回 `unknown`，绝不为了讨好你现编一个猜测。方法蠢得理直气壮，后面 `automate > 0.8` 的阈值能用，全靠这个：Sabaki 敢回答，就说明真有个专家命中了。

额外还有个语言轴，靠 `langid`：声明了 `languages` 的插件只参与自己语言的竞争。拉丁 phishing 和 CJK 分流就靠它。文本太短就不过滤，所有人都下场。

总成本：每次决策几微秒。不乘矩阵，不调网络，就是字符串比较加一次除法。

### Nano，我最喜欢的仓库文件

`src/logreg.ts:28`，分词：

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

unigram 加 bigram。`charged twice` 给出 `charged`、`twice`，再加一个 `charged twice`。想抓住“重复收费”，这些就够了，不用请 400M 的 transformer 出山。

`src/logreg.ts:46`，向量化，TF-IDF 干活的地方：

```ts
const tf = 1 + Math.log(c);  // 次线性 TF
const val = tf * w.idf[i]!;  // sklearn 风格的平滑 IDF
```

一个词出现第 10 次，重要性远不如第 1 次，稀有词比“please”值钱。标准 sklearn 配方，20 个问题上验证过数值完全一致。

还有重读时让我笑出来的注释：

```ts
// 只碰出现的词（稀疏），而不是扫 3000 个维度。
for (const [t, c] of counts) {
```

每个工单只碰实际出现的二十来个词，而不是每次扫 3000 维。这就是 1 毫秒以内回答的原因。prod 里 invisible 的细节决定一切，因为复杂度跟着工单长度走，不跟着词表走。

`src/logreg.ts:86`，推理，三行写完：

```ts
// 二分类：1 行系数 + sigmoid
const pPos = 1 / (1 + Math.exp(-s));
// 多分类：点积 + softmax，argmax
```

一次点积，按类别数走 sigmoid 或者 softmax。一遍 forward，结束。零 token 生成，所以后面没有碎掉的 JSON 等着你写 retry 和解析 heuristic 来擦屁股。

`train.py` 配方：每个 workflow 300 训练加 100 测试，确定性切分（每 5 个取 1 个进测试，防止时间偏置），词表 3000 到 6000，系数四舍五入到 1e-4，实测零精度损失。导出 JSON `{ vocab, idf, questions }`。

权重：invoices 的 20KB（`duplicate` 0.89）到 mail 的 650KB（`bucket` 0.889）。这种体型塞前端 bundle 都没压力。

让我惊讶的细节：在 mail 上，MiniLM 和 TF-IDF 差 ±0.02。所以 nano 直接 ship。为邮件分类买 GPU，我拒绝。但 agent_trace 卡住了（nano 下 `needs_review` 0.59）：可观测文本太贫，几乎没有词真的携带决策信号。

把权重变成插件的工厂，在 `src/plugin.ts:52`：

```ts
export function nanoClassifier(manifest, weights, opts = {}) {
  return definePlugin({ manifest,
    classify: (input) => {
      const r = predict(`${from}${input.state}`, weights, q);
      return { decision: r.decision, confidence: r.confidence, domain: manifest.domain };
    }});
}
```

`decide()` 走同步 nano，`decideAsync()` 解锁 ONNX 给 mini。两条路，一条规矩：要 async 说明你要 mini，不然 nano 就够。写代码好记，挂了好查。

证明不只是纸上谈兵，给你看真实用法长什么样：

```ts
import { Sabaki } from "sabaki";
import customerService from "@sabaki-js/customer-service";

const sabaki = new Sabaki().register(customerService);
sabaki.decide({ state: "charged twice, refund please" });
// { decision: "billing", confidence: 0.31, domain: "customer_service" }
```

### Mini，22MB，在硬骨头上翻盘

nano 的上限，你在上面 agent_trace 那里已经看到了。MiniLM-L6 接棒：全领域共享一个 encoder，每个问题一个线性头。端到端微调 8 到 12 个 epoch，lr 2e-5，训练在 CUDA GPU 上（推理还是 CPU，这才是重点）。

拍板用的数字，同样切分上测的：
- encoder 冻结加 MLP：0.65
- 全量微调：0.68
- 400M 向冻结 embedding 蒸馏：试过，扔了，不如 gold label

经 dynamo 导出 ONNX，数值一致性验证过，再动态 int8 量化：90MB 压到 22MB，在 customer_service 上 accuracy 只掉 **0.004**。ECE 不变甚至更好。每次导出都重测，不测的优化等于没说。

从 1.0.2 开始权重直接进包（`models/<workflow>-int8/` 加 `modelDir` 导出）。`npm i` 就行，断网 OK。更新等于发 patch，走 trusted publishing 签名。

具体效果：`needs_review` 从 0.59 涨到 **0.82**。`disposition` 0.73 到 0.76。ECE 全线 < 0.14，OOD 还有健康的怀疑（dragons、菜谱、空字符串上 0.2 到 0.5）。prod 里敢做激进阈值，全靠这份怀疑。

### Generalist，让 Sabaki 真正成为 System One 的兜底网

Jev 它们什么都答：运行时定义的任意问题、任意选项。这是 System One 让 Jev 爆了的契约，你把 `instructions` 加 `criteria` 和选项递过去，它就拍板。

Sabaki 的专家不会这个。它们只认识自己的问题（`category`，`duplicate`，`bucket`），别的都不会。没有兜底，你一出脚本 Sabaki 就回 `unknown`，而 Jev 永远有话说。

generalist 就是这张网。一个 cross-encoder，读问题加选项加 state，吐一个分数，每个选项一次 forward，softmax，argmax。22.7M MiniLM int8，比 144 到 151M 那一档小 6.5 倍。但它的 job 不是刷分，是兼容：接上 fallback，`POST /v1/systemone` 就跟 Jev 一样，什么 state、什么问题都接。`model` 字段写明到底谁答的（`@sabaki-js/mail@1.1.2+mini`，`sabaki-generalist-v1`...），调用方什么都不用改。

而且重点，它是 fallback，不是老大。`decideAsync()` 里的铁律：专家路由赢了，专家答。只有 `unknown` 的时候 generalist 才开口。绝不反过来。这样才不会让一个平庸的通才压住自己地盘上的优秀专家。

loader 住在 `src/generalist.ts`，按目录缓存，别每次调用都重载 ONNX session：

```ts
export function loadGeneralist(modelDir: string) {
  // 按目录缓存，复用 ONNX session
  // tokenizer.json -> Unigram 或 wordpiece，自动检测
  const sess = await ort.InferenceSession.create(
    path.join(modelDir, "generalist.onnx"),
    { intraOpNumThreads: 2 },
  );
}
```

把 `SABAKI_GENERALIST_DIR` 指向一个装着 `generalist.onnx` 加 `tokenizer/` 的目录，模型随便换。id 来自 `config.json`，没有就叫 `"sabaki-generalist"`。`Map` 缓存保证每次调用不重载 session。

输入格式，经典 cross-encoder：问题、选项、state 用分隔符拼起来，每个待打分选项一行：

```ts
const texts = options.map(
  (o) => `${input.question ?? "decision"} [SEP] ${o} [SEP] ${input.state}`,
);
```

问题加选项加 state，`[SEP]` 隔开，每个选项一行。选项上限 8 个（`slice(0, 8)`），不给就默认 `["yes", "no"]`。再多调用方自己切，类型化决策 8 个已经很宽了。

然后是 batch 的小聪明，看着不起眼，延迟直接除以选项数。每个选项一次 `session.run` 改成全部一次 forward：

```ts
// 所有选项一次 batch forward
// （pad 到最大长度），而不是每个选项跑一次。
const L = Math.max(...encs.map((e) => e.ids.length));
// ids + attention_mask 形状 [options.length, L]，按 padId 做 padding
const out = await sess.run({ input_ids, attention_mask });
const scores = Array.from(out["score"].data).map(Number);
```

每段文本编码（按 `tokenizer.json` 走 BERT 式 wordpiece 或者 SentencePiece unigram），pad 到 batch 里最长，堆成 `[选项数, L]` 张量。一次 `sess.run`，每个选项拿一个分数。在 CPU 上这就是一切：20 到 36ms，而不是 8 倍的时间。

然后 softmax 加 argmax，每个选项完整概率，就是 Jev 带火的那个格式：

```ts
const pr = softmax(scores);
// bi = 最大值的下标
const confidence = Math.round(pr[bi] * 1000) / 1000;
const probs = Object.fromEntries(
  options.map((o, i) => [o, Math.round(pr[i] * 1000) / 1000]),
);
```

让这东西从 demo 变成 prod 可用的细节，是 `abstainAt`：

```ts
if (input.abstainAt !== undefined && confidence < input.abstainAt) {
  return { decision: null, confidence, domain: "generalist", probabilities: probs };
}
```

opt-in，默认不弃权。你传 `abstainAt: 0.6-0.7`，拿不准的就回 `null` 而不是瞎猜。softmax 分布外也敢吐 1.00，不加这个不行。GUIDE 给所有自主用法都推荐它：低于阈值就去问人澄清，别自己硬解。

最后，带 generalist fallback 的完整接法：专家都没命中，它接管而不是回 `unknown`。

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
// 路由命中就走 mail 专家，否则 generalist 像 Jev 一样兜底
```

generalist 每一代，都在 PhishNChips（2000 封邮件）和 typed-decisions 测试集上同样测过，能对齐的都对齐：
- v4：测试 0.29，phishing R=0.026。扔掉，答的都是隔壁的题。
- A（22M 80k）：0.546，R=0.406。开始像人话了。
- 线上 mini v1：**0.536，R=0.616**。网站上跑的就是这个。phishing recall 还行，测试一般。
- B（144M 从零训）：0.568，R=0.062。更大，测试好一丁点，phishing 拉胯。

144M 从零训还没迁移好，这一下把我“堆参数换泛化”的念头浇灭了。同一个任务，更大的更贵，猜得还没更好。连兜底这个活，小的也干得了。而且它是纯英文（`all-MiniLM-L6-v2`），路由英文，法语是分布外。法语请走专门训过的专家，别找 generalist。

## Doom，对我来说唯一算数的测试

doomLaya，就是让 Laya 和 Jev 真进 FreeDoom 里打。模型选 `command / target / weapon`，执行器管 A* 寻路、开门、瞄准、开火。每 tick 遥测，录像，run 的 SHA。我是 contributor，不是远处读了个榜单就来聊。

v0.1.0，MAP01 seed 48，skill 3，35 ticks/s，同一个执行器：

| 模型 | 结果 | p50 HTTP | API 成本 |
|---|---|---|---|
| Laya 原版 | 通关失败 180s | 106ms | $0 |
| Laya v3 适配版 | 通关 61.43s | 108ms | $0 |
| Jev 1.13 | 通关 68.97s | 357ms | $0.0046 |

两次干净通关，零死亡，Laya 顺手捡了 shotgun，因为执行器自己管 pickup。诚实一点：Laya v3 在 Doom 上训过，Jev 没有。一个 seed，一张图，证明不了通用结论。项目 README 白纸黑字写了，不吹，这点值得尊敬。

Sabaki 这边（[plugin-doom](https://github.com/sabaki-js/plugin-doom)）：Python 版 ViZDoom 每 tick 调一次 JS 服务器。nano 约 18k req/s，i5 单线程 mini 约 71 req/s。35Hz 的 tick，中端笔记本都轻松拿下。

带出口罗盘，mini 6 次跑里通关 2 到 4 次，nano 0/6。合理：文本丢了空间信息，doomLaya 的 state 在 0.57 左右封顶，MiniLM 和 ModernBERT-base 都一样。空间信息没了，什么文本分类器都变不出来。

邻居们用同样数据重打了一遍：[doomgemma](https://github.com/dexmac221/doomgemma) 在 RTX 4070 上花 27 分钟打个 LoRA，把 Gemma 4 E2B 奶到游戏里跟 Laya v3 同级（6/6 对 6/6），孤立决策上还更高。同体量下 decoder 跟 Laya 一样快（270M：22ms 对 23ms）。同效果下 Laya 还是快 3 倍左右，因为它用更小的模型办到了。

我的解读：任务上训练过，比架构重要。训过的专家 beating 没见过的通才。这正是 Sabaki 的赌注。后续那篇 *System Switch*（[arXiv:2610.09683](https://arxiv.org/abs/2610.09683)）把这个逻辑推到底：小模型快速打，gate 一开大模型接管推理。Sabaki 的预分拣（`automate > 0.85 否则升级`）用在游戏里，就是这个味。

## 被牺牲掉的东西

每个缺掉的 feature，都在给另一个 feature 买单，想跑 CPU 就得认这个规矩。诚实清单，跟 Bareiron 一样，每行 C 都是 tradeoff：

**Sabaki 不讲故事。** 它在你给的选项里拍板，附一个概率。想要解释、总结、自由文本，请出门找 LLM。

**generalist 的法语还是分布外。** 路由英文（`all-MiniLM-L6-v2`），相似 case 上法语探针只有英语的 1/4 对 3/4。mail 插件来自一个 mostly 法语但匿名化过的邮箱：零 PII，代价是 accuracy 掉 0.024，词表里没有个人词。匿名化是要花钱的，但这条没得谈。

**softmax 出了舒适区还敢装自信。** 见过错到 1.00 的，是的。所以 GUIDE 里推荐预分拣：`abstainAt: 0.6-0.7` 先把拿不准的变成 `null`，再用 `confidence > 0.85` 的 gate 做自动，剩下来给人。实测参考：phishing recall 0.62，precision 0.87。队列砍一半可以，指望它开掉 reviewer 不行。

**nano 在 agent 轨迹上吃力。** 按问题 0.34 到 0.59。mini 把 `needs_review` 拉到 0.82，但 `risk / urgency / action` 还是硬。可观测文本的词汇信号就是贫。

**文本 Doom 到顶了。** 0.57 左右，MiniLM 和 ModernBERT-base 都一样。只用文本不要像素，MAP02 就卡住。真想做个玩家，可信的路是视觉加 RL（tiny-doom-defender，从像素起 1.1M 参数），不是更好的文本分类器。

**benchmark 按 batch 漂。** typed-decisions 按批生成，时间切分其实是 batch 切分。`drift_tool.py` 在 customer_service 上打出 0.82，agent_trace 上 0.67（0.5 等于不可区分）。实测后果：发布的权重混合 0.733，官方切分 0.61。所以官方数字是保守的。Platt 校准和 temperature 加 bias 在 batch 之间迁不过去，所以只 ship 在最近 batch 上校准的 temperature scaling。家规：先跑 `drift_tool.py`，过 0.6 警告，过 0.8 拉闸。别人都不发这个，人人都该发。

## 最终结果，数字说话

一边是笔记本 i5，一边是按调用收费的 API。每种模式实际长这样：

- nano：<1ms，约 18k req/s，20 到 650KB，0 依赖
- mini：约 20ms，约 71 req/s，22MB int8，onnxruntime 可选
- generalist：20 到 36ms，22.7M，我知道的最小开源通才

多领域全装：lazy-load 每个领域约 0.5GB 内存，而不是全量 2GB。确定性：100 个相同输入，100 个相同输出。按问题设阈值，`confidence` 上做 gate，谁都不认识就回 `unknown`。

Bareiron 上 3 个以上玩家就卡，因为每个玩家都是一个 200ms 的 chunk。这里 3 个以上领域随便跑，因为每个专家都小，还按需加载而不是全堆进内存。同一个“小而够用”的哲学，换了块硬件而已。

## 哲学

p2r3 说过：*“我就喜欢这种感觉，一块 1 块钱的小芯片，能跑起 Minecraft 这么高级的东西。”*

一样的感觉：我喜欢 20KB JSON 加一百行 TS 就顶掉一次 GPU 调用的感觉。当然不是什么都能顶，别闹。顶的是那种烦人的 case：你要一个 label，要毫秒级，要本地，要置信度能拿来切阈值而不是闭眼祈祷。

tradeoff，白纸黑字：
- encoder 换成数词：少 7 个点，延迟除以 1000，infra 归零
- 单一大模型换成 npm 插件：gate 粗一点，ops 简单一万倍
- 生成换成类型化决策：碎解析和自创选项成为历史
- 原始置信换成预分拣：先弃权，0.85 以上自动，剩下给人

**三句话记住：**

1. **少 7 个点，快 1000 倍**，0.61/0.69 对 0.75 到 0.80，但 CPU 离线 <1ms/20ms，对面是 25 秒 CPU 或者付费 API。脱离成本谈分数，毫无意义。
2. **简单路由器加独立专家**，`hits / sqrt(keywords)`，阈值，`unknown`。每个插件独立训练、独立版本、独立发布。在 mail 上 TF-IDF 追平 MiniLM：这里 GPU 就是没用。
3. **离线优先，校准诚实**，`npm i`，权重进包，零 GPU，ECE < 0.14，弃权，drift 工具。整个对比里唯一能在 35Hz 游戏循环里活下来还不用 GPU 的 stack。

项目有兴趣，MIT 全开源在 [github.com/sabaki-js](https://github.com/sabaki-js)。带测量和 bibtex 的学术版是 [preprint v1](/assets/paper/sabaki-organizational-moe-typed-decisions.pdf)。想看 Goliath 真进 Doom 里打，去 [azalio/doomLaya](https://github.com/azalio/doomLaya) xD
