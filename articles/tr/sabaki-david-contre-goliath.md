---
title: "Sabaki vs System One: Davut Golyat'a karşı, dünyanın en küçük karar modeli"
description: "20KB'ye karşı 421M parametre. Sabaki typed-decisions'ta 7 puan bırakıyor ama 25sn CPU süresinden 1ms altı offline hıza iniyor. Örgütsel bir MoE'nin anatomisi."
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
author_sig: "3rVegH4dR5YLQNzv5jA5T5cgiSf/RJA9AEyRDR9bLIyw2pc5dG5Isuwt7tdqg5D/ZxZukSZJT+ZzjsZY98dhKg=="
---

## Giriş

Eylül ayından beri Hacker News ya da Twitter'da takılıyorsan Jev'i görmemen imkansız.

15 Eylül 2026'da TypeSafe Jev'i çıkardı, ilk "System One"ları. Pitch tek cümle: bir label seçmek için LLM'e JSON ürettirmeyi bırakın. Ona bir `state` ver, üstüne tipli sorular ver, sana tipli kararları probalarıyla versin. Tek pass, sample edilecek sıfır token, arkada parse edilecek hiçbir şey yok.

Patladı gitti. Vercel AI Gateway'de ilk gün rekor benimseme, birkaç günde beş Elixir müşterisi, herkes Jev'i kendi şeyiyle benchmarkliyor. Ve açık konuşayım hype anlaşılır. Yıllardır `SADECE {"choice": ...} ile cevap ver` promptlarıyla dua ediyorduk, model bir seçenek uydurmasın, JSON'u bozmasın, alan halüsinasyonu yapmasın diye. Jev bu ihtiyaca isim koydu ve temiz bir API olarak ship etti: `POST /v1/systemone`, `choice / score / noul` sorular, cevapta `probabilities` + `confidence`.

Fikre bayıldım. Eko modeli daha az sevdim, ve net olayım, Jev'e hiç para ödemedim.

Çünkü arkada Jev kapalı bir API. Ağırlıklar bilinmiyor, self-host yok, her karar eşittir bir network round-trip artı dönen bir sayaç. Sonra gelen açık alternatifler de 400M parametre bandında ve zorunlu GPU istiyor.

O yüzden ben diğer ucu inşa ettim: [Sabaki](https://sabaki.fox3000foxy.com/). Keyword router artı saf TypeScript ile yazılmış bir lojistik regresyon, Jev ile aynı kontratı konuşuyor (aynı `choice / score / noul` shape'leri, `serve()` ile sunulan aynı `/v1/systemone` endpoint'i), ama **1ms altında** dönüyor, **20 kilobayt** JSON ile. Nano modda sıfır bağımlılık, offline, 0€.

Ölçek için: Laya 843 MB safetensors yükletiyor. OpenDecider-nano 2 GB RAM istiyor. Sabaki nano invoices 20 KB. Ağırlık oranı **40.000** civarı.

Kareli, rakamlı versiyonu istersen sitede Ekim 2026 preprint v1 var: *Sabaki: An Organizational Mixture-of-Experts for Typed Decisions on CPU* ([PDF](/assets/paper/sabaki-organizational-moe-typed-decisions.pdf)). Tasarım, ölçümler, tradeoff'lar, hepsi içinde. Bu yazı okunabilir versiyon, yanında açık kodla.

Bunu köşemde kağıt-benchmark modunda yazmadım. [azalio/doomLaya](https://github.com/azalio/doomLaya)'ya katkı yapıyorum (benim fork: [fox3000foxy/doomLaya](https://github.com/fox3000foxy/doomLaya)), Laya ve Jev'in model-owned kararlarla, tick başına telemetriyle ve videolarla gerçekten FreeDoom oynadığı bir harness. Golyat'ı sahada oynarken gördüm, network öksürünce o da öksürüyor.

Motorları tek tek açalım. Her zamanki gibi, gerçek kodla.

## Herkesin dövüşmeyi kabul ettiği ring

Jev, Laya ve OpenDecider'ın üçünün de alıntıladığı tek bir dataset var: [LocalLLaMA/typed-decisions](https://huggingface.co/datasets/LocalLLaMA/typed-decisions). 4 sentetik workflow (destek, faturalar, güvenlik, ajan izleri), vaka başına 5 soru, 1200 train vakası, 400 test, 2000 karar.

| Model | Params | Test skoru | Gecikme | Nerede çalışıyor |
|---|---|---|---|---|
| OpenDecider-nano | ~400M | 0.796 | 17ms GPU | GPU, 2 Go RAM |
| Laya typed-decisions | 421M | 0.766 | ~25s/state CPU, ~830ms/vaka MLX | GPU |
| Jev 1.13 | kapalı | ~0.73-0.75 | ~710ms API | sadece API |
| **Sabaki mini** | 22M int8 | **0.69** | **~20ms CPU** | CPU, 22 Mo |
| **Sabaki nano** | ~0 | **0.61** | **<1ms** | her yerde |
| Laya base zero-shot | 421M | 0.362 | aynı | GPU |

Şans 0.318, çoğunluk 0.461. Yani fine-tune'suz 0.362'deki Laya base, "kibar kibar rastgele sallıyorum" seviyesi. Bunu aklında tut, lazım olacak.

Sabaki ile en iyi arasında 7 puan var. GPU'n yoksa diğer yönde 1000x gecikme farkı var. Bütün yazı iki cümlede bu, gerisi nedenini anlamak için.

Yine de dikkat: aynı `choice / score / noul` prizinin arkasında mutfaklar bambaşka. Jev eşittir kapalı API. Laya eşittir fine-tune'lu ModernBERT-large. OpenDecider eşittir distile Ettin-encoder. Sabaki eşittir kelime sayma artı int8 MiniLM. Aynı kontrat, kıyaslanamaz bütçeler.

## Jev, herkesin gördüğü tokat

Hakkını verelim, TypeSafe'e ait olan TypeSafe'in: System One kontratı gerçekten iyi bir fikir.

Eskiden bir ticket'ı ayıklamak için şunu yapıyordun: LLM'e "billing, teknik ve spam arasından seç, JSON cevap ver" diyordun, cevabı parse ediyordun, "Bence billing! 😊" diye cevap verdiği ya da 4. kategori uydurduğu durumlarla uğraşıyordun. Her soru token yakıyordu, her cevap pipeline'ını patlatabilirdi.

Jev anlaşmayı değiştirdi: metni artı kriterli soruları yolluyorsun, her soruyu paralel değerlendirip sana tipli bir değer ve dağılımıyla dönüyor.

```bash
curl https://api.typesafe.ai/v1/systemone \
 -H "Authorization: Bearer $KEY" \
 -H 'content-type: application/json' \
 -d '{"state":"charge double ce mois-ci","questions":{"dept":{"type":"choice","instructions":"Route ce message.","criteria":{"billing":"paiements","technical":"bugs"}}}}}'
```

Cevap: `{ choice, probabilities, confidence }`. Serbest metin yok. Kodun üstüne direkt dallanabiliyor.

Viral olmasının sebebi bu: Python + JS SDK, Claude Code eklentisi, LangChain entegrasyonu, herkes ajanlarını bir öğleden sonra bağlayabiliyordu. TypeSafe dokümantasyonu sağlıklı pattern'i bile dayatıyor: hızlı küçük yargılar için Jev, gerçek kararı kompoze etmek için etrafında deterministik kod, güven düşükse yavaş LLM ya da insan.

Sorun geri kalanı. Ağırlıklar kapalı, offline imkansız, call başına fiyat. Run başına 100 karar alan bir ajan için vergi acıtıyor. 35 tick/s ile Doom için zaten ölü: doomLaya'da Jev MAP01 seed 48'i 68.97sn'de çıkıyor, p50 HTTP 357ms. Run 0.0046$ API maliyeti raporluyor, bu benim faturam değil, benchmark'ın faturası. Çalışıyor, run temiz, ölüm yok. Ama 35 tick/s'de 357ms, sen network beklerken oyunun 12 tick ilerlemesi demek.

Sabaki tam olarak bu kontratı çaldı, aynı sorular, aynı cevaplar, `serve()` ile sunulan aynı `/v1/systemone` endpoint'i, ama datacenter isteyen her şeyi çöpe attı.

## Laya, APIsiz de olacağını gösteren koca açık model

Convai Innovations'tan [Laya](https://github.com/NandhaKishorM/laya), Apache-2.0. Kaputun altında: ModernBERT-large, 421M, seçenek başına 1 tane `[MASK]` token. Her işaretçinin hidden state'i küçük bir MLP'den geçiyor, sorunun seçenekleri üstünde softmax. Jev gibi soru başına tek pass.

```python
pipe = pipeline("text-classification", model="convaiinnovations/laya-typed-decisions")
```

0.766 üstünde durmayı hak ediyor. Bu checkpoint **benchmark train'ine fine-tune'lu**: 1200 vaka, logitler üstünde gauss gürültülü RLCD, log + spherical reward. Aynı model bu fit olmadan 0.362'ye düşüyor. Yani resmen sallıyor. O yüzden Laya skoru "sihirli koca encoder" değil, "koca encoder artı domain üstünde eğitim" demek.

CPU'da resmen külçe. Ölçülen ONNX portu state başına 25sn civarı. MLX FP16'da vaka başına ortalama 830ms, p99 5.3sn say. Ve bir şey cevaplamadan önce 843 MB yüklemen lazım.

doomLaya'da stok Laya MAP01'de 180sn'de patlıyor. Uyarlanmış v3 ([azalio/laya-doom-v3](https://huggingface.co/azalio/laya-doom-v3)), Doom üstünde yeniden eğitilmiş, MPS'te p50 108ms ile 61.43sn'de çıkıyor, arada shotgun'ı da kapıyor. Yani evet oynuyor, ama özel eğitimden sonra, Apple GPU üstünde, gerçek işi yapan scriptli bir executor ile (A*, 15 tick latch'li kapılar, oto aim).

Özetim: kendi task'inde eğitmeden Laya sana 421M'lık pano görevi görüyor. Eğitirsen çok güçlü, ama GPU ve ona uygun datalar lazım.

## OpenDecider, leaderboard'u kazanan

[OpenDecider](https://github.com/manjunathshiva/opendecider), Manjunath'ın herkesi kendi benchmark'ında avlamaya karar vermesi. Sonuç: full fine-tune Ettin-encoder-400m artı MLP kafa ile **0.796**, Qwen3-235B + DeepSeek'ten distile soft target'lar üstünde KL loss.

```bash
pip install opendecider
# L40S'te 17ms/soru, M4 Max'te 18ms, batch'li ~9ms
```

%50 coverage'da selective accuracy Jev'in 0.882'sine karşı 0.943'e çıkıyor. Kağıt üstünde iki dünyanın en iyisi: açık, kalibre, hızlı.

Pratikte: nano'yu yüklemek için 2 GB RAM, 17ms'yi tutmak için zorunlu GPU, phishing'de Jev'in 0.90'ına karşı 0.63 (OOD onu dağıtıyor), ve Laya gibi benchmark train'inde eğitimli. Test hiç görülmedi ama domain görüldü.

Bilek güreşini kazanıyor ama arkada yine GPU'lu 400M var. Bunu Cloudflare Worker'a ya da laptopta oyun döngüsüne sokamazsın.

## 150M'ler ve altındaki boşluk

openJev-verdict-2.0 (151M), julia-1 (144M çok dilli), Open Jev (150M), Largha-150M (144M en+zh), Vela (0.3B-9B). Hepsi ModernBERT ya da mmBERT-small, hepsi CPU'da dönebiliyor, hepsi eğitmesi keyifli (Open Jev Colab T4'te 30dk diyor). Rakamlar self-reported, protokoller farklı, o yüzden cımbızla al, ama aile mevcut.

Generalist Sabaki **22.7M**. Bu tayfanın en küçüğünden yaklaşık 6.5x daha küçük. Runtime'da tanımlı sorulara cevap verip 100M altına inen başka kimse yok.

"dünyanın en küçüğü" bu demek: en iyi skor değil, senin `instructions` + `criteria` metnini okuyup hiçbir uzman cevap veremeyince kararı veren en küçük zarf.

## Sabaki, salak router ve atılabilir uzmanları

Tamam, büyüklerden bu kadar. Davut'a geçelim, çünkü işin eğlencesi burada başlıyor.

Sabaki dünyayı anlayan akıllı koca bir model olmaya çalışmıyor. Örgütsel bir MoE: sistem seviyesinde 1 sparse router, bağımsız uzmanlar, input başına tek aktif. Her plugin ayrı bir npm paketi, manifest'i, ağırlıkları, versiyonu ile. Sadece route ettiğin şeyi kuruyorsun.

[sabaki-js](https://github.com/sabaki-js) org'u: 13 repo, core `sabaki` (129 commit), 6 `@sabaki-js/*` plugin'i, ağırlıklar, Cloudflare worker, kendi plugin'ini yazman için template.

Core'un `package.json`'ı hikayeyi zaten anlatıyor:

```json
"dependencies": { "@typesafe-ai/sdk": "^0.7.0" },
"optionalDependencies": { "onnxruntime-node": "^1.22.0" }
```

Nano modda sıfır runtime bağımlılığı. Sadece derlenmiş TypeScript, kurulacak bir şey yok, iki ONNX versiyonu arasında bozulabilecek bir şey yok.

### Router, ya da birkaç satırda karar vermek

Router `src/index.ts` içinde yaşıyor, tokenization şuna benziyor (`src/index.ts:129`):

```ts
function tokens(s: string): string[] {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/).filter((w) => w.length > 3);
}
```

Küçük harf, aksanları at, minimum 4 harfli kelimeler. Bu filtre bütün gürültüyü atıyor ("le", "de", "ok"). Destek ticket'ında her şeyi değiştiriyor çünkü eşleşmen anlam taşıyan kelimeler üstünden oluyor.

Skorun kendisi `route()` içinde (`src/index.ts:251`), ve her şey burada kopuyor:

```ts
const hits = kws.filter((k) =>
  words.some((w) => w.includes(k) || k.includes(w))).length;
const score = hits / Math.sqrt(kws.length);
```

İki yöne gevşek eşleşme: `billing` `billed`'i yakalıyor, `invoice` `invoicing`'i yakalıyor. Karekök bölmesi büyük keyword listelerini cezalandırmaman için, yoksa 600 kelimelik mail plugin'i içinde "hello" geçen her mailde herkesi ezerdi.

Her plugin'in kendi eşiği var, varsayılan 0.15 `src/index.ts:139` içinde, mail 0.03 çünkü konular kısa. Altında:

```ts
return { domain: "unknown", decision: null, confidence: 0, plugin: null };
```

Bilinmeyen domain eşittir `unknown`, asla seni mutlu etmek için uydurma tahmin yok. Bilerek salak bir yaklaşım, ve `automate > 0.8` eşiklemesini sonra kullanılabilir yapan tam olarak bu: Sabaki cevap veriyorsa gerçekten bir uzman eşleşmiş demektir.

Üstüne `langid` ile dil ekseni var: `languages` bildiren bir plugin sadece kendi dillerinde yarışıyor. Latin phishing ile CJK'yi ayırmak için pratik. Metin çok kısaysa filtre yok, herkes yarışıyor.

Toplam maliyet: karar başına birkaç mikrosaniye. Çarpılacak matris yok, aranacak network yok, sadece string karşılaştırma ve bir bölme.

### Nano, repo'daki favori dosyam

`src/logreg.ts:28`, tokenization:

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

Unigram artı bigram. `charged twice` sana `charged`, `twice` ve `charged twice` çiftini veriyor. 400M'lik transformer çıkarmadan "çifte faturalandırma" yakalamak için gereken her şey bu.

`src/logreg.ts:46`, vektörizasyon, TF-IDF'nin iş yaptığı yer:

```ts
const tf = 1 + Math.log(c);  // sublineer TF
const val = tf * w.idf[i]!;  // sklearn tarzı smooth IDF
```

Bir kelimenin 10. geçişi ilkinden az sayıyor, nadir kelimeler "please"ten ağır basıyor. Birebir sklearn tarifi, 20 soruda tam parite doğrulandı.

Ve tekrar okurken beni güldüren yorum:

```ts
// 3000 boyutu taramak yerine sadece geçen terimlere dokun (seyrek).
for (const [t, c] of counts) {
```

Her ticket'ta 3000 boyut taramak yerine sadece geçen yirmi kelimeye dokunuyorsun. 1ms altında cevap vermesinin sebebi bu. Prod'da her şeyi değiştiren görünmez detaylardan, çünkü karmaşıklık kelime haznesini değil ticket boyutunu takip ediyor.

`src/logreg.ts:86`, çıkarım, üç satırda bitiyor:

```ts
// ikili: 1 satır katsayı + sigmoid
const pPos = 1 / (1 + Math.exp(-s));
// çok sınıflı: nokta çarpım + softmax, argmax
```

Sınıf sayısına göre bir nokta çarpım, bir sigmoid ya da softmax. Tek pass ve bitti. Üretilen sıfır token, yani arkada retry ve parsing sezgiselleriyle tamir edilecek bozulmuş sıfır JSON.

`train.py` tarifi: workflow başına 300 train / 100 test, deterministik split (zamansal yanlılığı önlemek için 5'te 1 test), 3000-6000 kelime haznesi, ölçülen sıfır kayıpla 1e-4'e yuvarlanmış katsayılar. JSON export `{ vocab, idf, questions }`.

Ağırlıklar: invoices için 20 KB (`duplicate` 0.89) mail için 650 KB (`bucket` 0.889). Frontend bundle'a sığacak boyutlar.

Beni çarpan detay: mail'de MiniLM TF-IDF'yi +-0.02 ile takip ediyor. Yani nano aynen ship ediliyor. Mail ayıklamak için GPU'ya para ödemek bana göre değil. Ama agent_trace takılıyor (nano'da `needs_review` 0.59): gözlemlenebilirlik metni fakir, hiçbir kelime kararı gerçekten taşımıyor.

Ağırlıkları plugin'e çeviren fabrika, `src/plugin.ts:52` içinde:

```ts
export function nanoClassifier(manifest, weights, opts = {}) {
  return definePlugin({ manifest,
    classify: (input) => {
      const r = predict(`${from}${input.state}`, weights, q);
      return { decision: r.decision, confidence: r.confidence, domain: manifest.domain };
    }});
}
```

`decide()` nano'da senkron kalıyor, `decideAsync()` mini için ONNX'in kilidini açıyor. İki yol, tek basit kural: async gerekiyorsa mini istiyorsun demek, yoksa nano yeter. Kod yazarken akılda tutması kolay, patlayınca debug etmesi kolay.

Bunun sadece teori olmadığını göstereyim, gerçek kullanım şöyle görünüyor:

```ts
import { Sabaki } from "sabaki";
import customerService from "@sabaki-js/customer-service";

const sabaki = new Sabaki().register(customerService);
sabaki.decide({ state: "charged twice, refund please" });
// { decision: "billing", confidence: 0.31, domain: "customer_service" }
```

### Mini, zor vakalarda oyunu değiştiren 22 MB

Nano'nun limitleri var, az üstte agent_trace'te gördün. MiniLM-L6 bayrağı devralıyor: bütün domain için paylaşılan bir encoder, artı soru başına bir lineer kafa. 8-12 epoch end-to-end fine-tune, lr 2e-5, eğitim için CUDA GPU (çıkarım CPU kalıyor, önemli olan bu).

Kararı veren rakamlar, aynı splitlerde ölçüldü:
- donmuş encoder artı MLP: 0.65
- full fine-tune: 0.68
- 400M'den donmuş embedding'lere distilasyon: denendi, çöpe atıldı, gold label'lardan daha kötü

Dynamo ile ONNX export, tam parite doğrulandı, sonra dinamik int8 quant: 90 MB'den 22 MB'ye, customer_service üstünde **-0.004 accuracy**. ECE aynı ya da daha iyi. Her export yeniden ölçülüyor, yoksa optimizasyon lafta kalır.

1.0.2'den beri ağırlıklar pakete gömülü (`models/<workflow>-int8/` artı export edilen `modelDir`). `npm i` yetiyor, uçak modu OK. Güncellemek eşittir patch yayınlamak, trusted publishing ile imzalı.

Somut: `needs_review` 0.59'dan **0.82**'ye çıkıyor. `disposition` 0.73'ten 0.76'ya. Her yerde ECE < 0.14, sağlıklı OOD şüphesiyle (ejderhalar, tarifler ve boş stringlerde 0.2-0.5). Prod'da agresif eşiklemeye izin veren bu şüphe.

### Generalist, Sabaki'yi gerçekten System One yapan catch-all

Jev ve diğerleri her şeye cevap veriyor: runtime'da tanımlı her soru, her seçenek. Jev'i viral yapan System One kontratı bu, `instructions` + `criteria` ile sorularını ve seçeneklerini koyuyorsun, o kesip atıyor.

Sabaki uzmanları bunu bilmiyor. Kendi sorularını biliyorlar (`category`, `duplicate`, `bucket`) ve başka bir şey bilmiyorlar. Filesiz Sabaki script dışına çıkınca `unknown` dönerdi, Jev'in hep bir şey cevap verdiği yerde.

Generalist bu file. Soru + seçenek + state okuyup skor basan bir cross-encoder, seçenek başına bir pass, softmax, argmax. 22.7M int8 MiniLM, tayfanın 144-151M'inden 6.5x küçük. Ama işi skor değil, uyumluluk: fallback olarak bağlıyken `POST /v1/systemone` Jev gibi her state'i ve her soruyu kabul ediyor. `model` alanı gerçekten kimin cevap verdiğini söylüyor (`@sabaki-js/mail@1.1.2+mini`, `sabaki-generalist-v1`...), yani arayan tarafta hiçbir şey değiştirmiyorsun.

Ve en önemlisi, bir şef değil fallback. `decideAsync()` içinde altın kural: bir uzman routing'i kazanırsa o cevap veriyor. Generalist sadece `unknown` durumunda konuşuyor. Asla tersi. Böylece vasat bir generalist kendi domain'inde iyi bir uzmanı ezmiyor.

Loader `src/generalist.ts` içinde, her call'da ONNX session'ı yeniden yüklememek için klasör başına cache ile:

```ts
export function loadGeneralist(modelDir: string) {
  // klasör başına cache, ONNX session yeniden kullanılıyor
  // tokenizer.json -> Unigram ya da wordpiece, oto algılanıyor
  const sess = await ort.InferenceSession.create(
    path.join(modelDir, "generalist.onnx"),
    { intraOpNumThreads: 2 },
  );
}
```

`SABAKI_GENERALIST_DIR`'i içinde `generalist.onnx` + `tokenizer/` olan bir klasöre doğrultuyorsun, model değiştirilebilir. Id `config.json`'dan geliyor, yoksa `"sabaki-generalist"`. `Map` cache her call'da session reload'u önlüyor.

Girdi formatı klasik cross-encoder: soru, seçenek ve state ayraçlarla birleştirilmiş, skorlanacak seçenek başına bir satır:

```ts
const texts = options.map(
  (o) => `${input.question ?? "decision"} [SEP] ${o} [SEP] ${input.state}`,
);
```

Soru + seçenek + state, `[SEP]` ile ayrılmış, seçenek başına bir satır. Seçenekler 8 ile kaplı (`slice(0, 8)`), bir şey vermezsen varsayılan `["yes", "no"]`. Ötesi arayan tarafta bölünecek, 8 zaten tipli bir karar için geniş.

Sonra akıllı batch geliyor, gösterişsiz durup gecikmeyi seçenek sayısına bölen türden optimizasyon. Seçenek başına bir `session.run` yerine her şey tek forward'da gidiyor:

```ts
// bütün seçenekler için tek batch forward
// (max uzunluğa pad'li), seçenek başına run yerine.
const L = Math.max(...encs.map((e) => e.ids.length));
// [seçenek sayısı, L] içinde ids + attention_mask, padId ile padding
const out = await sess.run({ input_ids, attention_mask });
const scores = Array.from(out["score"].data).map(Number);
```

Her metin encode ediliyor (BERT tarzı wordpiece ya da `tokenizer.json`'a göre unigram SentencePiece), batch'in max uzunluğuna pad'leniyor, `[seçenek_sayısı, L]` tensöründe üst üste konuyor. Tek `sess.run`, seçenek başına bir skor alıyorsun. CPU'da her şeyi değiştiriyor: 8 katı süre yerine 20-36ms.

Sonra softmax + argmax geliyor, Jev'in popülerleştirdiği formatta her seçenek için tam probalarla:

```ts
const pr = softmax(scores);
// bi = max indeksi
const confidence = Math.round(pr[bi] * 1000) / 1000;
const probs = Object.fromEntries(
  options.map((o, i) => [o, Math.round(pr[i] * 1000) / 1000]),
);
```

Ve bunu demoda bırakmayıp prod'da kullanılabilir yapan detay `abstainAt`:

```ts
if (input.abstainAt !== undefined && confidence < input.abstainAt) {
  return { decision: null, confidence, domain: "generalist", probabilities: probs };
}
```

Opt-in, varsayılan çekimserlik yok. `abstainAt: 0.6-0.7` geçiyorsun ve yumuşak kalan her şey tahmin yerine `null` dönüyor. Softmax dağılım dışında bile 1.00 basabildiği için bu lüks değil. GUIDE otonom her kullanım için öneriyor: eşiğin altında kalırsan oto çözmek yerine açıklama istiyorsun.

Bitirmek için generalist fallback'li aynı kurulum: hiçbir uzman eşleşmeyince `unknown` dönmek yerine bayrağı o devralıyor.

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
// routing tutarsa mail uzmanı, yoksa Jev tarzı catch-all olarak generalist
```

Generalist nesilleri, hepsi aynı şekilde ölçüldü, PhishNChips üstünde (2000 mail) ve kıyaslanabilir olan için typed-decisions testinde:
- v4: test 0.29, R=0.026 phishing. Çöplük, konuyla alakasız cevap veriyordu.
- A (22M 80k): 0.546, R=0.406. Bir şeye benzemeye başlıyor.
- servisteki mini v1: **0.536, R=0.616**. Sitede dönen bu. Düzgün phishing recall, vasat test.
- B (144M scratch): 0.568, R=0.062. Daha koca, testte azıcık iyi, phishing'de sıfır.

Sıfırdan 144M'in daha iyi transfer olmaması "genellemek için parametre basarım" fikrine beni iyi soğuttu. Eşit işte büyük olan daha pahalıya aynı sallamayı yapıyor. Catch-all olarak bile küçük olan işi görüyor. Ve hala EN-only (`all-MiniLM-L6-v2`), EN routing, FR dağılım dışı. FR için generalist ile değil, üstünde eğitilmiş bir uzmanla geçeceksin.

## Doom, benim için gerçekten sayılan tek test

doomLaya, Laya ve Jev'in gerçekten FreeDoom oynaması. Model `command / target / weapon` seçiyor, executor A* ile yol çiziyor, kapıları açıyor, nişan alıp tıklıyor. Tick başına telemetri, videolar, run SHA'ları. Katkı yapıyorum, yani uzaktan okuduğum bir leaderboard anlatmıyorum.

v0.1.0, MAP01 seed 48, skill 3, 35 tick/s, aynı executor:

| Model | Sonuç | p50 HTTP | API maliyeti |
|---|---|---|---|
| Laya stock | başarısız 180s | 106ms | $0 |
| Laya v3 uyarlanmış | çıkış 61.43s | 108ms | $0 |
| Jev 1.13 | çıkış 68.97s | 357ms | $0.0046 |

Ölmeden iki temiz çıkış, Laya arada shotgun'ı kapıyor çünkü executor pickup'ı tek başına yönetiyor. Dürüst olalım: Laya v3 Doom üstünde eğitildi, Jev eğitilmedi. Tek seed, tek map, genel bir şey kanıtlamaz. Projenin README'si bunu siyah üstüne beyaz yazıyor, sonucu şişirmemesi de onun şerefine.

Sabaki tarafı ([plugin-doom](https://github.com/sabaki-js/plugin-doom)): Python'da ViZDoom, her tick'te bir JS sunucusunu çağırıyor. Nano ~18k req/s, mini i5 tek thread'de ~71 req/s. 35Hz tick vasat bir laptopta bile rahat geçiyor.

Çıkış pusulasıyla mini MAP01'i 6'da 2-4 run çıkarıyor, nano 0/6. Mantıklı: metin uzamsal bilgiyi kaybediyor, doomLaya stateleri MiniLM de olsa ModernBERT-base de olsa 0.57 civarına çakılıyor. Uzamsal bilgi eksikken hiçbir metin sınıflandırıcı onu sihirle yaratmıyor.

Komşular maçı eşit datayla tekrarladı: [doomgemma](https://github.com/dexmac221/doomgemma) RTX 4070'te 27dk'lık bir LoRA çakıyor ve Gemma 4 E2B'yi oyunda Laya v3 seviyesine (6/6'ya 6/6) izole kararlarda üstüne taşıyor. Eşit boyutta decoder Laya kadar hızlı (270M: 22ms'ye 23ms). Eşit sonuçta Laya ~3x hızlı kalıyor çünkü oraya daha küçük modelle varıyor.

Benim okumam: task üstünde eğitim mimariden ağır basıyor. Eğitilmiş küçük uzman, keşfeden koca generalisti dövüyor. Sabaki'nin iddiası birebir bu. Sonraki makale, *System Switch* ([arXiv:2610.09683](https://arxiv.org/abs/2610.09683)), mantığı sona götürüyor: oynayan hızlı küçük model, bir kapı açılınca devralan akıl yürüten büyük model. Oyuna uygulanmış Sabaki pre-triage (`automate > 0.85 yoksa yükselt`).

## Feda edilenler

Eksik her özellik bir başkasını finanse ediyor, CPU hedeflerken oyunun kuralı bu. Bareiron'da her C satırı bir tradeoff'tu, burada da dürüst liste:

**Sabaki hikaye anlatmıyor.** Verdiğin seçenekler arasından probasıyla kesip atıyor. Açıklama, özet, serbest metin için bir LLM al.

**Generalist için Fransızca hala dağılım dışı.** EN routing (`all-MiniLM-L6-v2`), benzer vakalarda 3/4 EN'e karşı 1/4 FR sonda. Mail plugin'i çoğunluğu FR bir kutudan ama anonimleştirilmiş geliyor: 0 PII, kişisel terimsiz vocab için -0.024 accuracy. Anonimleştirme paralı, ama pazarlık dışıydı.

**Softmax bölgesinden çıkınca fazla özgüvenli.** 1.00 basan yanlışlar görüldü, evet. O yüzden GUIDE'daki pre-triage öneriliyor: eşik altı `null` için `abstainAt: 0.6-0.7`, sonra otomatik için `confidence > 0.85` kapısı, kalanı insan. Ölçülmüş referans: 0.87 kesinlikte 0.62 phishing recall. Kuyruğu ikiye bölersin, reviewer'ları kovamazsın.

**Nano ajan izlerinde zorlanıyor.** Soruya göre 0.34 ile 0.59. Mini `needs_review`'u 0.82'ye çıkarıyor ama `risk / urgency / action` zor kalıyor. Gözlemlenebilirlik metni leksik sinyal olarak zaten fakir.

**Metinle Doom tıkanıyor.** MiniLM de ModernBERT-base de 0.57 civarı. Piksel olmadan metinde kaldığın sürece MAP02 seni kilitliyor. Gerçek bir oyuncu için kredibil yol vision + RL (piksellerden 1.1M parametreli tiny-doom-defender), daha iyi bir metin sınıflandırıcı değil.

**Benchmark batch'lerle kayıyor.** typed-decisions desteler halinde üretiliyor, zamansal split aslında batch split'i. `drift_tool.py` customer_service'te 0.82, agent_trace'te 0.67 basıyor (0.5 eşittir ayırt edilemez). Ölçülmüş sonuç: yayınlanan ağırlıklar resmi split'te 0.61'e karşı karışıkta 0.733 yapıyor. Yani resmi rakam muhafazakar. Platt / temperature+bias kalibrasyonu batch'ler arası transfer olmuyor, o yüzden sadece güncel batch'lerde kalibreli temperature scaling ship ediyoruz. Ev kuralı: önce `drift_tool.py`, 0.6 üstü uyar, 0.8 üstü blokla. Bunu başka kimse yayınlamıyor, herkes yayınlamalı.

## Final sonuç, rakamlarla

Bir yanda laptop i5'i, diğer yanda call başına fatura kesen bir API. Her mod somut olarak şunu veriyor:

- nano: <1ms, ~18k req/s, 20-650 KB, 0 bağımlılık
- mini: ~20ms, ~71 req/s, 22 MB int8, opsiyonel onnxruntime
- generalist: 20-36ms, 22.7M, bildiğim en küçük açık generalist

Yüklü birkaç domain: hepsi için ~2 GB yerine domain başına lazy-load ile ~0.5 GB RAM. Deterministik: 100/100 aynı input aynı output veriyor. Soru başına eşikler, `confidence` üstünde kapı, hiçbir şey eşleşmeyince `unknown`.

Bareiron'da 3+ oyuncu çalıştırmak kasıyordu çünkü her oyuncu 200ms'lik bir chunk'a mal oluyordu. Burada 3+ domain çalıştırmak tık demiyor, çünkü her uzman minicik ve hepsini bir anda yüklemek yerine istek üstüne yükleniyor. "Yeten küçük" felsefesi, başka donanıma uygulanmış hali.

## Felsefe

p2r3 demişti: *"Şu 1 dolarlık minicik çipin Minecraft gibi gelişmiş bir şeyi çalıştırabilmesi fikrini seviyorum."*

Burada da aynı kafa: 20 KB JSON ve yüz satır TS'in bir label için GPU çağrısının yerini alması fikrini seviyorum. Belli ki her şeyin yerini almıyor, saçmalamayalım. Sadece milisaniyede, lokalde, parmak çaprazlamak yerine makulce eşikleyebildiğin bir güvenle bir label istediğin gıcık durumun yerini alıyor.

Tradeoff'lar, siyah üstüne beyaz:
- encoder yerine kelime sayma: 7 puan eksik, 1000'de 1 gecikme, sıfır infra
- koca tek model yerine npm plugin'leri: daha kaba kapı, sonsuz basit ops
- üretim yerine tipli karar: bozulan parsing ve uydurulan seçenekler bitti
- ham güven yerine pre-triage: önce çekimser kal, 0.85 üstü otomatikleştir, kalanı insan

**Aklında kalacak 3 şey:**

1. **7 puan eksik, 1000x hızlı** - 0.75-0.80'e karşı 0.61/0.69, ama 25sn CPU ya da paralı API'ye karşı <1ms/20ms offline CPU. Maliyetsiz skor bir şey anlatmaz.
2. **Basit router artı ayrı uzmanlar** - `hits / sqrt(keywords)`, eşik, `unknown`. Her plugin tek başına eğitiliyor, versiyonlanıyor, ship ediliyor. Mail'de TF-IDF MiniLM'e yapışıyor: GPU burada çöp.
3. **Kalibrasyonu dürüst offline-first** - `npm i`, gömülü ağırlıklar, 0 GPU, ECE < 0.14, çekimserlik, drift tool. Karşılaştırmada GPU'suz 35Hz oyun döngüsünü tutan tek stack.

Proje ilgini çekerse hepsi MIT ile [github.com/sabaki-js](https://github.com/sabaki-js) adresinde. Ölçümlü ve bibtex'li akademik versiyon [preprint v1](/assets/paper/sabaki-organizational-moe-typed-decisions.pdf). Golyat'ı Doom oynarken gerçekten görmek istersen [azalio/doomLaya](https://github.com/azalio/doomLaya) xD
