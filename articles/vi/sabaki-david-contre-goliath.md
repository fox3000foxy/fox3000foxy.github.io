---
title: "Sabaki vs System One: David đấu Goliath, mô hình ra quyết định nhỏ nhất thế giới"
description: "20KB đấu 421M tham số. Sabaki thua 7 điểm trên typed-decisions nhưng từ 25s CPU xuống dưới 1ms offline. Mổ xẻ một MoE kiểu tổ chức."
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
author_sig: "GCJs7elJsGwpJHmnof8k6DE+sIB2FI/fKGHTBjlYjcRxsxdWDBQXcyBtrXlqPed+A4iQIL7Oci3FUXUdgOHIkA=="
---

## Giới thiệu

Nếu bạn hay lướt Hacker News hay Twitter từ tháng 9, chắc chắn bạn đã thấy cái tên Jev lướt qua.

Ngày 15 tháng 9 năm 2026, TypeSafe tung ra Jev, con "System One" đầu tiên của họ. Pitch gói trong một câu: đừng bắt LLM sinh JSON để chọn label nữa. Ném cho nó một `state` cộng vài câu hỏi có kiểu, nó trả lại quyết định có kiểu kèm xác suất. Một pass duy nhất, zero token phải sample, không có gì để parse sau đó.

Nó nổ tung thật. Ngày đầu đạt adoption kỷ lục trên Vercel AI Gateway, vài ngày có ngay năm khách Elixir, ai cũng lôi Jev ra benchmark với đồ nhà mình. Và nói thật hype này dễ hiểu. Mấy năm trời tụi mình toàn chế prompt kiểu `chỉ trả lời đúng {"choice": ...}` rồi cầu nguyện cho model đừng bịa thêm option, đừng làm vỡ JSON, đừng hallucinate thêm field. Jev gọi tên đúng cái nhu cầu đó rồi ship thành API sạch: `POST /v1/systemone`, câu hỏi `choice / score / noul`, câu trả lời kèm `probabilities` + `confidence`.

Mình thích ý tưởng này thật. Còn cái mô hình kinh tế thì thích ít hơn, và nói cho rõ, mình chưa bao giờ trả tiền cho Jev.

Vì đằng sau Jev vẫn là API đóng. Trọng số mù tịt, không self-host được, mỗi quyết định là một round-trip mạng cộng một cái đồng hồ tính tiền đang chạy. Còn mấy bản open đi theo sau thì toàn cỡ 400M tham số, bắt buộc phải có GPU.

Thế nên mình build cực còn lại: [Sabaki](https://sabaki.fox3000foxy.com/). Một router keyword cộng hồi quy logistic bằng TypeScript thuần, nói đúng cùng contract với Jev (cùng shape `choice / score / noul`, cùng endpoint `/v1/systemone`), nhưng chạy trong **dưới 1ms** với file JSON **20 kilobyte**. Chế độ nano thì zero dependency, offline, 0€.

Để bạn dễ hình dung: Laya là 843 MB safetensors phải load. OpenDecider-nano là 2 GB RAM. Sabaki nano invoices là 20 KB. Tỉ lệ cân nặng cỡ **40 000**.

Nếu bạn muốn bản vuông vắn đầy số liệu, có preprint v1 tháng 10 năm 2026 trên site: *Sabaki: An Organizational Mixture-of-Experts for Typed Decisions on CPU* ([PDF](/assets/paper/sabaki-organizational-moe-typed-decisions.pdf)). Thiết kế, đo đạc, tradeoff, đủ hết. Còn bài này là bản dễ đọc, kèm code mở bên cạnh.

Mình không viết nó một mình kiểu benchmark giấy. Mình có contribute cho [azalio/doomLaya](https://github.com/azalio/doomLaya) (fork của mình: [fox3000foxy/doomLaya](https://github.com/fox3000foxy/doomLaya)), một harness nơi Laya và Jev chơi FreeDoom thật với quyết định do model cầm, telemetry theo từng tick và video. Mình đã thấy Goliath chơi ngoài đời thật, và cứ mạng lag một cái là nó cũng chịu.

Giờ mình mở từng cái động cơ ra một. Như mọi khi, với code thật.

## Cái sàn đấu mà ai cũng chịu chơi

Chỉ có một dataset mà Jev, Laya và OpenDecider đều trích: [LocalLLaMA/typed-decisions](https://huggingface.co/datasets/LocalLLaMA/typed-decisions). 4 workflow tổng hợp (support, hóa đơn, bảo mật, trace agent), 5 câu hỏi mỗi case, 1200 case train, 400 case test, 2000 quyết định.

| Modèle | Params | Score test | Latence | Où ça tourne |
|---|---|---|---|---|
| OpenDecider-nano | ~400M | 0.796 | 17ms GPU | GPU, 2 Go RAM |
| Laya typed-decisions | 421M | 0.766 | ~25s/state CPU, ~830ms/cas MLX | GPU |
| Jev 1.13 | fermé | ~0.73-0.75 | ~710ms API | API only |
| **Sabaki mini** | 22M int8 | **0.69** | **~20ms CPU** | CPU, 22 Mo |
| **Sabaki nano** | ~0 | **0.61** | **<1ms** | partout |
| Laya base zéro-shot | 421M | 0.362 | pareil | GPU |

Random là 0.318, majority là 0.461. Nên Laya base 0.362 mà không fine-tune thì đúng tầm "trả lời bừa nhưng lịch sự". Nhớ kỹ chỗ này, lát nó sẽ có ích.

7 điểm ngăn cách Sabaki với con top nhất. 1000x độ trễ ngăn theo chiều ngược lại khi bạn không có GPU. Cả bài gói trong hai câu đó, phần còn lại là để hiểu tại sao.

Nhưng cẩn thận: đằng sau cùng một ổ cắm `choice / score / noul`, nồi niêu bên trong chẳng liên quan gì nhau. Jev = API đóng. Laya = ModernBERT-large fine-tune. OpenDecider = Ettin-encoder distill. Sabaki = đếm từ + MiniLM int8. Cùng contract, ngân sách khác một trời một vực.

## Jev, cú tát mà ai cũng thấy

Cái gì của TypeSafe thì trả cho TypeSafe: contract System One đúng là một ý tưởng hay thật.

Trước đây, để phân loại một ticket, bạn làm thế này: bạn hỏi LLM "chọn giữa billing, kỹ thuật và spam, trả lời bằng JSON", rồi parse câu trả lời, rồi xử lý mấy ca nó trả lời "Mình nghĩ là billing ! 😊" hay bịa thêm category thứ 4. Mỗi câu hỏi tốn token, mỗi câu trả lời đều có thể làm sập pipeline.

Jev đổi kèo: bạn gửi text + câu hỏi kèm tiêu chí, nó đánh giá từng câu hỏi song song rồi trả về giá trị có kiểu kèm phân phối của nó.

```bash
curl https://api.typesafe.ai/v1/systemone \
 -H "Authorization: Bearer $KEY" \
 -H 'content-type: application/json' \
 -d '{"state":"charge double ce mois-ci","questions":{"dept":{"type":"choice","instructions":"Route ce message.","criteria":{"billing":"paiements","technical":"bugs"}}}}}'
```

Trả lời: `{ choice, probabilities, confidence }`. Không text tự do. Code của bạn cắm vào xài ngay được.

Đó là lý do nó thành viral: SDK Python + JS, plugin Claude Code, tích hợp LangChain, ai cũng cắm agent của mình vào trong một buổi chiều. Doc TypeSafe còn đẩy đúng pattern lành mạnh: Jev cho mấy phán đoán nhỏ cần nhanh, code deterministic bọc quanh để ráp quyết định thật, LLM chậm hoặc con người nhảy vào khi confidence thấp.

Vấn đề là phần còn lại. Trọng số đóng, offline bất khả thi, tính tiền theo call. Với một agent quất 100 quyết định mỗi run, tiền thuế này đau. Với Doom chạy 35 ticks/s thì chết hẳn: trong doomLaya, Jev clear MAP01 seed 48 trong 68.97s với p50 HTTP 357ms. Run đó tốn $0.0046 tiền API, không phải hóa đơn của mình, mà là của benchmark. Nó chạy được, run sạch, không chết mạng nào. Nhưng 357ms ở 35 ticks/s thì tức là 12 tick game vẫn chạy trong lúc bạn đứng chờ mạng.

Sabaki chôm đúng contract đó, cùng câu hỏi, cùng câu trả lời, cùng endpoint `/v1/systemone` do `serve()` phục vụ, nhưng vứt hết mọi thứ cần datacenter.

## Laya, con open bự chứng minh làm được mà khỏi cần API

[Laya](https://github.com/NandhaKishorM/laya) của Convai Innovations, Apache-2.0. Dưới nắp capo: ModernBERT-large, 421M, với 1 token `[MASK]` mỗi option. Hidden state của từng marker chạy qua một MLP nhỏ, softmax trên các option của câu hỏi. Một pass mỗi câu hỏi, giống Jev.

```python
pipe = pipeline("text-classification", model="convaiinnovations/laya-typed-decisions")
```

Con 0.766 đáng để dừng lại mổ xẻ. Đó là checkpoint **fine-tune trên tập train của benchmark**: 1200 case, RLCD với nhiễu Gauss trên logit, reward log + spherical. Cùng model mà không fit kiểu đó thì rớt xuống 0.362. Nói thẳng là đoán mò. Nên điểm Laya là "encoder bự + train đúng domain", chứ không phải "encoder bự thần kỳ".

Trên CPU, nó nặng như cục gạch. Bản port ONNX đo được cỡ 25s mỗi state. Trên MLX FP16, tính trung bình 830ms mỗi case với p99 5.3s. Mà phải load 843 MB trước khi trả lời bất cứ thứ gì.

Trong doomLaya, Laya stock fail MAP01 trong 180s. Bản v3 adapt ([azalio/laya-doom-v3](https://huggingface.co/azalio/laya-doom-v3)), train lại trên data Doom, clear trong 61.43s với p50 108ms trên MPS, tiện tay lụm luôn khẩu shotgun. Nên đúng, nó chơi được, sau khi train riêng, trên GPU Apple, với một executor scripted gánh việc thật (A*, cửa có latch 15 tick, ngắm tự động).

Mình tóm gọn: không train trên task của bạn, Laya chỉ là cái kẹp giấy 421M. Có train thì rất mạnh, nhưng bạn phải có GPU và data đi kèm.

## OpenDecider, kẻ thắng leaderboard

[OpenDecider](https://github.com/manjunathshiva/opendecider), là lúc Manjunath quyết định đi gõ đầu từng người trên chính benchmark của họ. Kết quả: **0.796** với Ettin-encoder-400m full fine-tune + đầu MLP, loss KL trên soft target distill từ Qwen3-235B + DeepSeek.

```bash
pip install opendecider
# 17ms/question sur L40S, 18ms sur M4 Max, ~9ms batché
```

Ở 50% coverage, selective accuracy lên tới 0.943 so với 0.882 của Jev. Trên giấy, best cả hai thế giới: open, calibré, nhanh.

Thực tế: load nano tốn 2 GB RAM, muốn giữ 17ms thì bắt buộc GPU, phishing 0.63 so với 0.90 của Jev (gặp OOD là bị vả), và giống Laya, nó train trên tập train của benchmark. Tập test thì chưa thấy bao giờ, nhưng domain thì thấy rồi.

Nó thắng trận vật tay, nhưng vẫn là 400M với GPU chống lưng. Bạn không nhét nó vào Worker Cloudflare hay vòng lặp game trên laptop được.

## Lũ 150M, và cái hố bên dưới

openJev-verdict-2.0 (151M), julia-1 (144M đa ngữ), Open Jev (150M), Largha-150M (144M en+zh), Vela (0.3B-9B). Toàn ModernBERT hay mmBERT-small, con nào cũng chạy CPU được, con nào cũng dễ train (Open Jev báo 30 phút trên T4 Colab). Số liệu tự công bố, protocol mỗi nơi một kiểu, nên đọc với nhúm muối, nhưng cái họ này tồn tại thật.

Con generalist Sabaki chỉ **22.7M**. Nhỏ hơn khoảng 6.5x so với con bé nhất đám kia. Không ai khác chui xuống dưới 100M để trả lời câu hỏi định nghĩa lúc runtime.

Đó chính là nghĩa của "nhỏ nhất thế giới": không phải điểm cao nhất, mà là cái vỏ nhỏ nhất mà vẫn đọc được `instructions` + `criteria` của bạn rồi chốt khi không chuyên gia nào biết trả lời.

## Sabaki, con router ngố và dàn expert xài một lần

Rồi, nói về mấy con bự đủ rồi. Qua David đi, vì đây mới là chỗ vui.

Sabaki không cố làm model bự thông minh hiểu cả thế giới. Nó là MoE kiểu tổ chức: 1 router thưa ở tầng hệ thống, các expert độc lập, mỗi input chỉ một expert chạy. Mỗi plugin là một package npm riêng, có manifest, trọng số, version riêng. Bạn cài đúng cái bạn route tới.

Org [sabaki-js](https://github.com/sabaki-js): 13 repo, core `sabaki` (129 commit), 6 plugin `@sabaki-js/*`, trọng số, worker Cloudflare, template để viết plugin của riêng bạn.

File `package.json` của core đã kể hết câu chuyện:

```json
"dependencies": { "@typesafe-ai/sdk": "^0.7.0" },
"optionalDependencies": { "onnxruntime-node": "^1.22.0" }
```

Ở chế độ nano, zero dependency runtime. Chỉ TypeScript biên dịch sẵn, không có gì để cài, không có gì vỡ giữa hai bản ONNX.

### Con router, hay cách quyết định trong vài dòng

Router nằm trong `src/index.ts`, và đoạn tokenize trông thế này (`src/index.ts:129`):

```ts
function tokens(s: string): string[] {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/).filter((w) => w.length > 3);
}
```

Chữ thường, bỏ dấu, từ tối thiểu 4 chữ. Cái lọc này đá hết nhiễu ("le", "de", "ok"). Trên ticket support, nó thay đổi tất cả vì matching của bạn đánh trên mấy từ thật sự có nghĩa.

Còn scoring nằm trong `route()` (`src/index.ts:251`), và mọi thứ quyết định ở đây:

```ts
const hits = kws.filter((k) =>
  words.some((w) => w.includes(k) || k.includes(w))).length;
const score = hits / Math.sqrt(kws.length);
```

Matching lỏng cả hai chiều: `billing` bắt được `billed`, `invoice` bắt được `invoicing`. Chia cho căn bậc hai để khỏi phạt mấy list keyword dài, nếu không plugin mail với 600 từ của nó đè bẹp tất cả chỉ vì một mail có chữ "hello".

Mỗi plugin có ngưỡng riêng, mặc định 0.15 nằm ở `src/index.ts:139`, mail là 0.03 vì subject ngắn. Dưới ngưỡng:

```ts
return { domain: "unknown", decision: null, confidence: 0, plugin: null };
```

Domain lạ = `unknown`, không bao giờ bịa guess cho vui. Ngố một cách cố ý, và đó đúng là thứ khiến ngưỡng `automate > 0.8` xài được về sau: khi Sabaki trả lời, tức là một chuyên gia đã match thật.

Khuyến mãi thêm trục ngôn ngữ qua `langid`: plugin nào khai `languages` thì chỉ đua trong ngôn ngữ đó. Tiện để tách phishing Latin với CJK. Text quá ngắn = khỏi lọc, ai cũng được đua.

Tổng chi phí: vài micro giây mỗi quyết định. Không ma trận nào phải nhân, không mạng nào phải gọi, chỉ so string với một phép chia.

### Nano, file mình thích nhất repo

`src/logreg.ts:28`, đoạn tokenize:

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

Unigram + bigram. `charged twice` cho ra `charged`, `twice`, và cặp `charged twice`. Chỉ cần vậy là đủ bắt "bị tính tiền hai lần" mà khỏi lôi transformer 400M ra.

`src/logreg.ts:46`, đoạn vector hóa, nơi TF-IDF làm việc của nó:

```ts
const tf = 1 + Math.log(c);  // TF dưới tuyến
const val = tf * w.idf[i]!;  // IDF mượt kiểu sklearn
```

Lần xuất hiện thứ 10 của một từ ít giá trị hơn lần đầu, từ hiếm nặng ký hơn "please". Đúng công thức sklearn, parity chuẩn đã verify trên 20 câu hỏi.

Và cái comment làm mình bật cười khi đọc lại:

```ts
// Chỉ chạm vào term có mặt (thưa) thay vì quét 3000 chiều.
for (const [t, c] of counts) {
```

Thay vì quét 3000 chiều mỗi ticket, bạn chỉ chạm vào hai chục từ đang có mặt. Đó là lý do nó trả lời dưới 1ms. Kiểu chi tiết vô hình nhưng lên prod thì đổi hết cục diện, vì độ phức tạp ăn theo độ dài ticket chứ không ăn theo cỡ vocab.

`src/logreg.ts:86`, đoạn suy luận, gói trong ba dòng:

```ts
// nhị phân: 1 dòng coef + sigmoid
const pPos = 1 / (1 + Math.exp(-s));
// đa lớp: tích vô hướng + softmax, argmax
```

Một tích vô hướng, một sigmoid hay softmax tùy số lớp. Một pass là xong. Zero token sinh ra, nên zero JSON vỡ phải vá bằng retry và mẹo parse.

Công thức `train.py`: 300 train / 100 test mỗi workflow, split deterministic (1 item trên 5 vào test để tránh bias thời gian), vocab 3000-6000, coef làm tròn tới 1e-4 mà không mất accuracy đo được. Export JSON `{ vocab, idf, questions }`.

Trọng số: 20 KB cho invoices (`duplicate` 0.89) tới 650 KB cho mail (`bucket` 0.889). Cỡ này nhét vào bundle frontend ngon lành.

Chi tiết làm mình choáng: trên mail, MiniLM bám TF-IDF trong +-0.02. Nên nano ship luôn. Bắt trả tiền GPU để phân loại mail thì thôi, mình xin kiếu. Ngược lại agent_trace kẹt (`needs_review` 0.59 ở nano): text observability nghèo, không từ nào thật sự gánh quyết định.

Cái factory biến trọng số thành plugin, trong `src/plugin.ts:52`:

```ts
export function nanoClassifier(manifest, weights, opts = {}) {
  return definePlugin({ manifest,
    classify: (input) => {
      const r = predict(`${from}${input.state}`, weights, q);
      return { decision: r.decision, confidence: r.confidence, domain: manifest.domain };
    }});
}
```

`decide()` giữ đồng bộ cho nano, `decideAsync()` mở ONNX cho mini. Hai đường, một luật đơn giản: cần async tức là bạn muốn mini, còn không nano đủ xài. Dễ nhớ khi code, dễ debug khi hỏng.

Để cho bạn thấy đây không chỉ là lý thuyết, đây là lúc xài thật trông ra sao:

```ts
import { Sabaki } from "sabaki";
import customerService from "@sabaki-js/customer-service";

const sabaki = new Sabaki().register(customerService);
sabaki.decide({ state: "charged twice, refund please" });
// { decision: "billing", confidence: 0.31, domain: "customer_service" }
```

### Mini, 22 MB đổi cục diện trên case khó

Nano có giới hạn, bạn thấy trên agent_trace ngay bên trên. MiniLM-L6 lên tiếp sức: một encoder chung cho cả domain, cộng một đầu tuyến tính mỗi câu hỏi. Fine-tune end-to-end 8-12 epoch, lr 2e-5, trên GPU CUDA lúc train (lúc suy luận vẫn CPU, cái đó mới quan trọng).

Mấy con số đã chốt hạ, đo trên cùng split:
- encoder đông cứng + MLP: 0.65
- full fine-tune: 0.68
- distill 400M về embedding đông cứng: test rồi, vứt, thua gold label

Export ONNX qua dynamo, parity chuẩn đã verify, rồi quant int8 động: 90 MB xuống 22 MB, **-0.004 accuracy** trên customer_service. ECE giữ nguyên hoặc tốt hơn. Mỗi bản export đều đo lại, không thì optimize chẳng nghĩa lý gì.

Từ bản 1.0.2, trọng số nhúng luôn trong package (`models/<workflow>-int8/` + `modelDir` export sẵn). `npm i` là xong, bật chế độ máy bay vẫn OK. Update = publish patch, ký qua trusted publishing.

Cụ thể: `needs_review` từ 0.59 lên **0.82**. `disposition` 0.73 lên 0.76. ECE < 0.14 mọi nơi, với hoài nghi OOD lành mạnh (0.2-0.5 trên rồng, công thức nấu ăn và string rỗng). Chính cái hoài nghi này cho phép ngưỡng gắt ở prod.

### Generalist, lưới hứng biến Sabaki thành System One thật

Jev và đám còn lại trả lời mọi thứ: bất kỳ câu hỏi nào, bất kỳ option nào, định nghĩa lúc runtime. Đó là contract System One làm Jev viral, bạn quăng `instructions` + `criteria` với option của bạn vào, nó chốt.

Mấy chuyên gia Sabaki không biết làm vậy. Chúng chỉ biết câu hỏi của mình (`category`, `duplicate`, `bucket`) và hết. Không có lưới hứng, Sabaki sẽ trả `unknown` ngay khi bạn ra khỏi kịch bản, chỗ Jev vẫn trả lời gì đó.

Generalist là cái lưới đó. Một cross-encoder đọc câu hỏi + option + state rồi nhả điểm, một pass mỗi option, softmax, argmax. 22.7M MiniLM int8, nhỏ hơn 6.5x so với đám 144-151M. Nhưng job của nó không phải điểm số, mà là tương thích: cắm nó làm fallback, `POST /v1/systemone` nhận bất kỳ state và bất kỳ câu hỏi nào, giống Jev. Field `model` nói ai đã trả lời thật (`@sabaki-js/mail@1.1.2+mini`, `sabaki-generalist-v1`...), nên phía gọi bạn chẳng đổi gì.

Và quan trọng, nó là fallback, không phải sếp. Luật vàng trong `decideAsync()`: chuyên gia thắng routing thì chuyên gia trả lời. Generalist chỉ mở miệng khi `unknown`. Không bao giờ ngược lại. Vậy mới khỏi chuyện generalist tầm tầm đè đầu chuyên gia giỏi đúng sân nhà.

Loader nằm trong `src/generalist.ts`, có cache theo thư mục để khỏi load lại session ONNX mỗi call:

```ts
export function loadGeneralist(modelDir: string) {
  // cache theo thư mục, tái dùng session ONNX
  // tokenizer.json -> Unigram hay wordpiece, tự phát hiện
  const sess = await ort.InferenceSession.create(
    path.join(modelDir, "generalist.onnx"),
    { intraOpNumThreads: 2 },
  );
}
```

Bạn trỏ `SABAKI_GENERALIST_DIR` tới thư mục có `generalist.onnx` + `tokenizer/`, model thay nóng được. Id lấy từ `config.json`, không thì `"sabaki-generalist"`. Cache `Map` khỏi reload session mỗi call.

Format input là cross-encoder cổ điển: câu hỏi, option và state nối nhau bằng separator, mỗi option cần chấm điểm một dòng:

```ts
const texts = options.map(
  (o) => `${input.question ?? "decision"} [SEP] ${o} [SEP] ${input.state}`,
);
```

Câu hỏi + option + state, ngăn bằng `[SEP]`, mỗi option một dòng. Option chặn ở 8 (`slice(0, 8)`), mặc định `["yes", "no"]` nếu bạn không đưa gì. Hơn nữa thì cắt phía bên gọi, 8 là rộng rồi cho một quyết định có kiểu.

Rồi tới batch khôn, kiểu optimize nhìn không ra gì nhưng chia độ trễ theo số option. Thay vì một `session.run` mỗi option, tất cả đi trong một forward:

```ts
// Một forward batch duy nhất cho mọi option
// (độn tới độ dài max) thay vì một run mỗi option.
const L = Math.max(...encs.map((e) => e.ids.length));
// ids + attention_mask thành [options.length, L], padding bằng padId
const out = await sess.run({ input_ids, attention_mask });
const scores = Array.from(out["score"].data).map(Number);
```

Mỗi text được encode (wordpiece kiểu BERT hay unigram SentencePiece tùy `tokenizer.json`), pad tới độ dài max của batch, xếp thành tensor `[số_option, L]`. Một `sess.run` duy nhất, bạn lấy một điểm mỗi option. Trên CPU nó đổi hết: 20-36ms thay vì gấp 8 lần đó.

Rồi tới softmax + argmax, với proba đầy đủ cho từng option, đúng format Jev đã popularize:

```ts
const pr = softmax(scores);
// bi = index của max
const confidence = Math.round(pr[bi] * 1000) / 1000;
const probs = Object.fromEntries(
  options.map((o, i) => [o, Math.round(pr[i] * 1000) / 1000]),
);
```

Và chi tiết biến đồ chơi demo thành đồ xài prod được là `abstainAt`:

```ts
if (input.abstainAt !== undefined && confidence < input.abstainAt) {
  return { decision: null, confidence, domain: "generalist", probabilities: probs };
}
```

Opt-in, mặc định không từ chối. Bạn truyền `abstainAt: 0.6-0.7` và mọi thứ yếu trả về `null` thay vì guess bừa. Vì softmax nhả 1.00 ngay cả khi sai ngoài phân phối, thiếu cái này là mệt. GUIDE khuyên dùng cho mọi tác vụ tự động: dưới ngưỡng thì hỏi lại thay vì tự chốt.

Cuối cùng, đây là cùng dàn đó với fallback generalist: khi không chuyên gia nào match, nó đỡ thay vì trả `unknown`.

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
// chuyên gia mail nếu routing match, không thì generalist đỡ kiểu Jev
```

Các đời generalist, đều đo như nhau trên PhishNChips (2000 mail) và trên test typed-decisions để so cái so được:
- v4: 0.29 test, R=0.026 phishing. Vứt, trả lời trật lất.
- A (22M 80k): 0.546, R=0.406. Bắt đầu ra hình người.
- mini v1 đang serve: **0.536, R=0.616**. Bản đang chạy trên site. Recall phishing ổn, test trung bình.
- B (144M scratch): 0.568, R=0.062. Bự hơn, test nhỉnh hơn tí, phishing dở tệ.

Con 144M train từ đầu mà transfer không khá hơn làm mình tỉnh hẳn vụ "đắp thêm param để tổng quát hơn". Cùng task, con bự tốn tiền hơn mà đoán có giỏi hơn đâu. Ngay cả làm lưới hứng, con nhỏ vẫn gánh được. Và nó vẫn EN-only (`all-MiniLM-L6-v2`), routing EN, FR là ngoài phân phối. Muốn FR thì đi qua chuyên gia train FR, đừng qua generalist.

## Doom, bài test duy nhất mình quan tâm thật

doomLaya là nơi Laya và Jev chơi FreeDoom thật. Model chọn `command / target / weapon`, executor vẽ đường A*, mở cửa, ngắm, bấm. Telemetry từng tick, video, SHA của run. Mình có contribute nên mình không nói về leaderboard đọc từ xa.

v0.1.0, MAP01 seed 48, skill 3, 35 ticks/s, cùng executor:

| Modèle | Résultat | p50 HTTP | Coût API |
|---|---|---|---|
| Laya stock | échec 180s | 106ms | $0 |
| Laya v3 adaptée | sortie 61.43s | 108ms | $0 |
| Jev 1.13 | sortie 68.97s | 357ms | $0.0046 |

Hai pha clear sạch, không chết, Laya tiện tay lụm khẩu shotgun vì executor tự lo pickup. Trung thực mà nói: Laya v3 đã train trên Doom, Jev thì không. Một seed, một map, chẳng chứng minh gì tổng quát. README dự án nói trắng ra, và điểm đáng nể là nó không nổ kết quả.

Phía Sabaki ([plugin-doom](https://github.com/sabaki-js/plugin-doom)): ViZDoom bằng Python gọi server JS mỗi tick. Nano ~18k req/s, mini ~71 req/s trên một thread i5. Tick 35Hz qua nhẹ, ngay cả laptop tầm trung.

Có la bàn cửa ra, mini clear MAP01 trong 2-4 run trên 6, nano 0/6. Hợp lý: text mất thông tin không gian, state doomLaya kẹt quanh 0.57 dù MiniLM hay ModernBERT-base. Khi thông tin không gian thiếu, không classifier text nào bịa ra được.

Mấy nhà bên đã đá lại trận đó trên cùng data: [doomgemma](https://github.com/dexmac221/doomgemma) đắp LoRA 27 phút trên RTX 4070 rồi đưa Gemma 4 E2B ngang Laya v3 lúc chơi (6/6 vs 6/6) và hơn lúc quyết định lẻ. Cùng cỡ, decoder chạy nhanh ngang Laya (270M: 22ms vs 23ms). Cùng kết quả, Laya vẫn nhanh hơn ~3x vì nó làm được với model nhỏ hơn.

Mình đọc thế này: train đúng task quan trọng hơn kiến trúc. Chuyên gia nhỏ được train ăn đứt generalist bự lần đầu gặp việc. Đúng kèo Sabaki cược. Paper đi sau, *System Switch* ([arXiv:2610.09683](https://arxiv.org/abs/2610.09683)), đẩy logic tới cùng: model nhỏ nhanh chơi, model reasoner bự giành lại tay lái khi cổng mở. Pre-triage Sabaki (`automate > 0.85 không thì leo thang`) áp vào game.

## Cái đã hy sinh

Mỗi feature vắng mặt nuôi một feature khác, đó là luật chơi khi bạn nhắm CPU. List trung thực, giống Bareiron nơi mỗi dòng C là một tradeoff:

**Sabaki không kể chuyện.** Nó chốt giữa option bạn đưa, kèm proba. Muốn giải thích, tóm tắt, text tự do thì lấy LLM.

**Tiếng Pháp vẫn ngoài phân phối với generalist.** Routing EN (`all-MiniLM-L6-v2`), probe 1/4 FR vs 3/4 EN trên case tương tự. Plugin mail từ một hộp thư chủ yếu FR nhưng đã ẩn danh: 0 PII, -0.024 accuracy để lấy vocab không term cá nhân. Ẩn danh phải trả giá, nhưng chỗ này không thương lượng được.

**Softmax tỏ ra chắc cú quá khi ra khỏi sân nhà.** Đã thấy sai mà 1.00, có. Nên GUIDE khuyên pre-triage: `abstainAt: 0.6-0.7` để trả `null` dưới ngưỡng, rồi gate `confidence > 0.85` mới tự động, còn lại người xử. Tham chiếu đã đo: recall phishing 0.62 ở precision 0.87. Đủ để chẻ hàng đợi làm đôi, chưa đủ để đuổi reviewer.

**Nano vật vã trên trace agent.** 0.34 tới 0.59 tùy câu hỏi. Mini kéo `needs_review` lên 0.82, nhưng `risk / urgency / action` vẫn khoai. Text observability nghèo tín hiệu từ vựng thật.

**Doom text kẹt trần.** Quanh 0.57, MiniLM hay ModernBERT-base cũng vậy. Chừng nào còn text không pixel, MAP02 chặn bạn. Đường khả thi cho tay chơi thật là vision + RL (tiny-doom-defender, 1.1M param từ pixel), không phải classifier text ngon hơn.

**Benchmark trôi theo batch.** typed-decisions sinh theo mẻ, split thời gian thực ra là split mẻ. `drift_tool.py` nhả 0.82 trên customer_service, 0.67 trên agent_trace (0.5 = không phân biệt được). Hệ quả đã đo: trọng số public đạt 0.733 ở mix so với 0.61 trên split chính thức. Nên số chính thức thiên về thận trọng. Calib Platt / temperature+bias không transfer giữa batch, nên chỉ ship temperature scaling calib trên batch gần nhất. Luật nhà: chạy `drift_tool.py` trước, warn trên 0.6, block trên 0.8. Chẳng ai khác public cái này, mà ai cũng nên làm.

## Kết quả cuối, số liệu trong tay

Một bên là i5 laptop, bên kia là API tính tiền theo call. Đây là thứ mỗi chế độ cho ra cụ thể:

- nano: <1ms, ~18k req/s, 20-650 KB, 0 dep
- mini: ~20ms, ~71 req/s, 22 MB int8, onnxruntime optional
- generalist: 20-36ms, 22.7M, generalist open nhỏ nhất mình biết

Nhiều domain cùng load: ~0.5 GB RAM lazy-load theo domain thay vì ~2 GB cho tất cả. Deterministic: 100/100 input giống nhau cho output giống nhau. Ngưỡng theo câu hỏi, gate trên `confidence`, `unknown` khi không gì match.

Trên Bareiron, chạy 3+ người chơi là lag vì mỗi người tốn một chunk 200ms. Ở đây chạy 3+ domain vẫn mượt, vì mỗi expert tí hon và load khi cần thay vì load hết một cục. Cùng triết lý "nhỏ mà đủ", áp qua phần cứng khác.

## Triết lý

p2r3 từng nói: *"J'aime juste l'idée que cette toute petite puce à 1 balles puisse faire tourner quelque chose d'aussi avancé que Minecraft."*

Cùng mood ở đây: mình thích ý tưởng 20 KB JSON với trăm dòng TS thay một cú gọi GPU để chọn label. Dĩ nhiên nó không thay mọi thứ, đừng đùa. Nó thay đúng ca khó chịu nơi bạn muốn một label trong mili giây, local, với confidence đủ tử tế để đặt ngưỡng thay vì nhắm mắt cầu may.

Tradeoff, viết trắng mực đen:
- encoder thành đếm từ: kém 7 điểm, độ trễ chia 1000, infra về zero
- model bự duy nhất thành plugin npm: gate thô hơn, ops dễ hơn vô hạn
- sinh text thành quyết định có kiểu: hết parse vỡ và option bịa
- confidence thô thành pre-triage: abstain trước, tự động trên 0.85, còn lại người lo

**3 thứ cần nhớ:**

1. **Kém 7 điểm, nhanh hơn 1000x** - 0.61/0.69 vs 0.75-0.80, nhưng <1ms/20ms CPU offline so với 25s CPU hay API trả tiền. Điểm mà không kèm chi phí thì vô nghĩa.
2. **Router đơn giản + expert tách rời** - `hits / sqrt(keywords)`, threshold, `unknown`. Mỗi plugin train, version và ship riêng. Trên mail, TF-IDF bám MiniLM: GPU ở đây vô dụng.
3. **Offline-first với calib trung thực** - `npm i`, trọng số nhúng sẵn, 0 GPU, ECE < 0.14, abstain, drift tool. Stack duy nhất trong kèo này giữ được game loop 35Hz mà không cần GPU.

Nếu bạn hứng thú, tất cả MIT trên [github.com/sabaki-js](https://github.com/sabaki-js). Bản học thuật với đo đạc và bibtex là [preprint v1](/assets/paper/sabaki-organizational-moe-typed-decisions.pdf). Còn muốn xem Goliath chơi Doom thật thì qua [azalio/doomLaya](https://github.com/azalio/doomLaya) xD
