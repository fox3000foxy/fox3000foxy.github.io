---
title: "Luna Protocol: 50k Discord örneğiyle 1.5B modelini neden fine-tune ettim ve few-shot priming neden gizli silah oldu"
description: "Daha az veriyle eğitilmiş daha küçük bir model, nasıl prime edileceğini biliyorsanız daha büyük bir modeli geçebilir. İşte Luna Protocol'ün neden 3B Hermes'ten 1.5B Qwen fine-tune'una geçtiği ve few-shot priming'in neden asıl oyun değiştirici olduğu."
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
author_sig: "/TEaZ6qx8GR4tHx29WbW/iiIHmIRPSdWbb1N/EakvgPdRk7yMSWZYzY+ToQxMyilOTxzE9UffA5EDVsCFldQKA=="
---

# Luna Protocol: 50k Discord örneğiyle 1.5B modelini neden fine-tune ettim ve few-shot priming neden gizli silah oldu

[İlk makalede](/articles/en/luna-protocol-discord-bot), bir insanı simüle eden bir Discord botu yapmıştım -- uyku, yazım hataları, tereddütler, unutkanlık, kendiliğinden mesajlar. Davranışsal sistem sağlamdı. Arkasındaki LLM, Q8_0 ile quantize edilmiş, 3GB VRAM tüketen 3B Hermes modeliydi.

Çalışıyordu. Ama gereğinden fazlaydı.

Bir Discord botunun "nm just chillin, u" demek için 3B parametreli bir modele ihtiyacı yok. İhtiyacı olan şey **stil tutarlılığı** -- belirli bir konuşma tonunu, mesajdan mesaja, kurumsal asistan moduna kaymadan koruyabilme yeteneği. Ve görünen o ki, daha az veriyle eğitilmiş, birkaç örnekle prime edilmiş daha küçük bir model, bunu bir sistem prompt'uyla zorlamaya çalışan daha büyük bir modelden daha iyi yapıyor.

Bu makale, resmi Luna Protocol modelleri hakkında: neden var oldukları, neden 3B yerine 1.5B oldukları, neden 7.3M yerine 50k eğitim örneği kullanıldığı ve few-shot priming'in neden "güzel bir ekstra"dan tüm yaklaşımın merkezine dönüştüğü.

---

## 3B modeliyle ilgili sorun

Orijinal kurulum `Discord-Micae-Hermes-3-3B.Q8_0.gguf` kullanıyordu -- Discord verisiyle fine-tune edilmiş 3B parametreli bir model. İyi yanıtlar üretiyordu, ama:

| Metrik | Hermes-3-3B Q8_0 | Hedef |
|--------|-------------------|--------|
| VRAM kullanımı | ~3 GB | < 1 GB |
| Token üretimi | ~30 tok/s | ~60+ tok/s |
| Model dosya boyutu | ~3.2 GB | < 1 GB |
| Soğuk başlatma süresi | ~8s | ~3s |

7/24 mütevazı bir sunucuda çalışan bir bot için 3GB VRAM çok fazla. Ve üretim hızı -- ara sıra gelen mesajlar için yeterli olsa da -- toplu yanıtlarda veya birden fazla kanal aktifken ağır kalıyordu.

Soru şuydu: aynı Discord-Dialogues stilini yarı parametreyle elde edebilir miyiz?

---

## Fine-tuning kararı: neden 7.3M değil de 50k

[Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) veri seti **7.3M etkileşim** ve **17M tur** içeriyor. Gerçek Discord konuşmalarından oluşan dev bir külliyat. Bariz yaklaşım, tüm veri setiyle eğitim yapmak olurdu.

Ben tam tersini yaptım. **50.000 örnek** üzerinde eğittim -- mevcut verinin %1'inden azı.

İşte nedeni: **eğitim setinin boyutu, modelin eğitim dağılımına ne kadar overfit olacağını doğrudan etkiler**.

7.3M örnekle eğitilmiş bir model, konuşmaların çok spesifik bir istatistiksel dağılımını öğrenir. Bu dağılımı yeniden üretmede mükemmelleşir, ama aynı zamanda **katılaşır** -- çıkarım anında sağlanan yeni kalıplara uyum sağlama esnekliği azalır.

50k örnekle eğitilmiş bir model, Discord konuşmalarının genel tonunu ve üslubunu öğrenir (informal, kısa form, kısaltmalar, küçük harf), ancak **bağlam içi örneklerle yönlendirilmeye** yetecek esnekliği korur. Few-shot örnekleri, dev bir öğrenilmiş dağılımla savaşmaz -- daha hafif bir dağılımı tamamlar.

Temel içgörü şudur: **sınırlı eğitim verisi, few-shot priming'i daha verimli kılar**.

---

## Model: teknik detaylar

Luna Protocol modeli, [Qwen2.5-1.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct)'un bir **QLoRA fine-tune**'udur:

| Parametre | Değer |
|-----------|-------|
| Temel model | `unsloth/Qwen2.5-1.5B-Instruct-bnb-4bit` |
| Yöntem | QLoRA (4-bit) |
| LoRA rank | `r=16`, `lora_alpha=16` |
| Hedef modüller | `q/k/v/o_proj`, `gate/up/down_proj` |
| Eğitilebilir parametreler | 18,464,768 / 1,562,179,072 (%1.18) |
| Eğitim verisi | ~50,000 örnek (Discord-Dialogues alt kümesi) |
| Filtre | Örnek başına 8-512 token |
| Epoch | 2-3 |
| Donanım | Kaggle T4 |
| Framework | [Unsloth](https://github.com/unslothai/unsloth) |

Veri seti, Discord-Dialogues'un ön işlenmiş bir fork'udur ve yalnızca temiz `user`/`assistant` turlarını içerecek şekilde filtrelenmiştir -- sistem mesajı yok, metadata yok, bot komutu yok. Bu, sonrası için önemli.

### Mevcut quantizasyonlar

| Dosya | Quantizasyon | Boyut | Notlar |
|------|-------------|------|-------|
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q2_K.gguf` | Q2_K | 676 MB | Belirgin şekilde düşük kalite -- önerilmez |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf` | Q4_K_M | 986 MB | İyi boyut/kalite dengesi (önerilen) |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q8_0.gguf` | Q8_0 | 1.65 GB | En iyi stil sadakati |

Önerilen model **Q4_K_M** -- 1GB'ın altında, hızlı ve konuşma stilini iyi koruyor. Q2_K, bu kadar küçük bir modelde çok fazla kalite kaybına yol açıyor. Q8_0 en iyi kaliteyi sunuyor ama %68 daha fazla bellek kullanıyor.

---

## Few-shot priming atılımı

İşte her şeyi değiştiren kısım.

HuggingFace model kartında bir uyarı var:

> Çıplak bir prompt ve priming olmadan, bu model Qwen'in varsayılan asistan tonuna geri dönme eğilimindedir. Kısa bir few-shot prime büyük fark yaratır.

Bu bir hata değil -- eğitim verisinin nasıl yapılandırıldığının doğrudan bir sonucu.

### Sistem prompt'ları neden tek başına çalışmaz

Discord-Dialogues eğitim verisi yalnızca `user`/`assistant` turları içerir. Eğitim setinde **hiçbir sistem rolü örneği yoktur**. Model, sistem prompt'larını stil yönergeleri olarak takip etmek üzere eğitilmemiştir.

Ona "Adın Luna, rahat konuş" gibi bir sistem prompt'u verdiğinizde, talimatı duyar ancak bunu çıktıya dönüştürmek için güçlü bir öğrenilmiş kalıba sahip değildir. Qwen'in varsayılanına geri döner: yardımsever, yapılandırılmış, biraz resmi.

### Few-shot örnekleri neden işe yarar

Modelin eğitildiği ChatML formatında (`user`/`assistant` tur yapısını kullanarak) örnek konuşmalar eklediğinizde, bir şeyler yerine oturur. Model, eğitim verisinden bu kalıbı tanır ve çıktısını buna göre ayarlar.

Bir few-shot prime pratikte şöyle görünür:

```yaml
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

Bu örnekler, sistem prompt'undan sonra ve gerçek konuşmadan önce eklenir. Model bunları talimat olarak değil, konuşma geçmişinin bir parçası olarak görür. Bu kritik bir ayrımdır -- modele rahat olması *söylenmez*, rahat olmanın neye benzediği *gösterilir*.

### Öncesi ve sonrası

Few-shot priming olmadan (çıplak sistem prompt'u):

```
User: yo whats good
Bot: Hello! I am doing well, thank you for asking. How can I assist you today?
```

Few-shot priming ile (3 örnek):

```
User: yo whats good
Bot: nm just chillin, u
```

Fark çarpıcı. Model sadece farklı kelimeler üretmiyor -- tüm üslubu benimsiyor: küçük harf, kısaltmalar, rahat ton, kısa yanıtlar. Örneklerin stilini takip ediyor, Qwen'in eğitim verisinin stilini değil.

---

## Bellek ve hız: somut rakamlar

Hermes-3-3B'den Luna-Protocol-1.5B'ye geçiş ölçülebilir kazanımlar sağlıyor:

| Metrik | Hermes-3-3B Q8_0 | Luna-Protocol Q4_K_M | İyileşme |
|--------|-------------------|----------------------|-------------|
| VRAM kullanımı | ~3 GB | ~986 MB | **%67 daha az** |
| Model dosya boyutu | ~3.2 GB | ~986 MB | **%69 daha küçük** |
| Token üretimi | ~30 tok/s | ~60+ tok/s | **2 kat daha hızlı** |
| Soğuk başlatma | ~8s | ~3s | **%62 daha hızlı** |
| Bağlam penceresi | 8192 | 8192 | Aynı |

### Hız kazancı neden gerçek

Daha küçük modeller sadece "daha az yavaş" değildir -- çıkarım için temelde daha hızlıdırlar. 3B yerine 1.5B parametreyle:

- **Token başına daha az matris çarpımı**: attention katmanları, FFN katmanları ve çıktı projeksiyonu, parametre sayısıyla doğrusal olarak ölçeklenir
- **Daha iyi önbellek kullanımı**: daha küçük model, ağırlıklarının daha fazlasını L2/L3 önbelleğe sığdırabilir
- **Daha düşük bellek bant genişliği baskısı**: token başına VRAM'den daha az bayt okunur

Mütevazı bir CPU-only kurulumda (2 çekirdek, GPU yok), 1.5B model tokenları kabaca **3B modelin 2 katı hızda** üretir. Bu, "bot gibi hissettiriyor" ile "insan yazıyormuş gibi hissettiriyor" arasındaki farktır.

### Prompt önbelleğe alma avantajı katlıyor

Luna Protocol, prompt önbelleğe alma etkin (`--cache-reuse 256`) `llama-server` kullanır. Bu şu anlama gelir:

1. Bir oturumdaki ilk mesaj, tam prompt işleme maliyetini öder (sistem prompt'u + few-shot örnekleri + kullanıcı mesajı)
2. Sonraki mesajlar yalnızca *yeni* tokenları işler -- önbelleğe alınan önek yeniden kullanılır
3. 5 few-shot örneğiyle (~50-150 token), ilk istekten sonra ek yük ihmal edilebilir düzeydedir

Few-shot örnekleri, bir oturumdaki ilk mesajdan sonra etkin bir şekilde "ücretsizdir". Model, sıfır marjinal maliyetle stil rehberliği alır.

---

## Uygulama: kodda nasıl çalışır

Luna Protocol'deki few-shot sistemi temiz ve minimaldir. Her şeyi üç dosya yönetir:

### 1. Yapılandırma (`config.yml`)

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

Yapılandırma sıcak yeniden yüklenebilir. Örnekleri değiştirin, kaydedin ve bot hemen yeni stili benimser -- yeniden başlatma gerekmez.

### 2. Biçimlendirme ve enjeksiyon (`src/core/few-shot.ts`)

`formatFewShotExamples()` fonksiyonu YAML örneklerini ChatML mesaj nesnelerine dönüştürür:

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

`injectFewShotIntoConversation()` fonksiyonu bunları sistem prompt'undan hemen sonra yerleştirir:

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

### 3. Entegrasyon (`src/core/llm-client.ts`)

Her LLM çağrısından önce, etkinleştirilmişse few-shot örnekleri eklenir:

```typescript
let finalMessages = messages;
if (FEW_SHOT_ENABLED && FEW_SHOT_EXAMPLES.length > 0) {
  const fewShotMessages = formatFewShotExamples(FEW_SHOT_EXAMPLES);
  finalMessages = injectFewShotIntoConversation(messages, fewShotMessages);
}
```

Model şunu alır: `[sistem_prompt] + [few_shot_örnekleri] + [konuşma_geçmişi]`

---

## Discord-Dialogues stilini korumak

Orijinal Discord-Dialogues veri setinin çok spesifik bir konuşma imzası vardır:

- **Kısa mesajlar**: tur başına ortalama 32.8 token
- **Informal üslup**: kısaltmalar, küçük harf, noktalama işareti yok
- **Hızlı gidiş-geliş**: uzun monologlar yerine kısa karşılıklı konuşmalar
- **Doğal kusurlar**: yazım hataları, "lol", "fr", "ngl", "tbh"

Luna-Protocol modeli bu stili iki mekanizma aracılığıyla korur:

### 1. Fine-tuning temel dağılımı kaydırır

50k eğitim örneği, modele Discord konuşmalarının *istatistiksel parmak izini* öğretir. Yanıtların tipik olarak kısa, küçük harfli ve informal olduğunu öğrenir. Bu, modelin varsayılan çıktısını Qwen'in yardımsever-asistan modundan uzaklaştırır.

### 2. Few-shot priming bunu kilitler

Few-shot örnekleri, modelin fine-tuning sırasında öğrendiği kalıpları tam olarak pekiştirir. Bir **stil çapası** görevi görürler -- model uzun bir konuşma sırasında resmi tona hafifçe kayarsa bile, bağlamdaki örnekler onu geri çeker.

Kombinasyon, tek başına her iki mekanizmadan daha güçlüdür:
- Few-shot olmadan fine-tuning: model *genel olarak* rahat ama tutarsız
- Fine-tuning olmadan few-shot: model örnekleri takip etmeye çalışır ama sürekli asistan moduna döner
- Fine-tuning + few-shot: model **sürekli olarak** karakterde kalır

---

## Felsefe: daha küçük model, daha akıllı prompting

LLM dağıtımında geleneksel bilgelik "büyük daha iyidir" der. Daha fazla parametre, daha fazla eğitim verisi, daha fazla VRAM. Luna Protocol tam tersi yaklaşımı benimser:

- **3B yerine 1.5B**: yarı parametre, yarı bellek, iki kat hız
- **7.3M yerine 50k örnek**: daha az eğitim verisi, bağlam içi öğrenme için daha fazla esneklik
- **Sistem prompt'ları yerine few-shot priming**: modele ne istediğinizi söylemeyin, gösterin

Bu sadece teknik bir optimizasyon değil -- bir tasarım felsefesidir. Bir Discord botunun genel amaçlı bir asistan olması gerekmez. Tutarlı, hızlı bir şekilde "nm just chillin, u" diyebilmeli ve sunucunuzun tüm VRAM bütçesini yutmamalıdır.

Sonuç: ayda 5$'lık bir VPS'te çalışan, tokenları gerçek zamanlı yazma hissi verecek kadar hızlı üreten ve parçalarının toplamından daha büyük bir fine-tuning ve few-shot priming kombinasyonuyla tutarlı bir kişiliği sürdüren bir bot.

---

## Kurulum

### Modeli indirin

```bash
npm run download-model
# Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf dosyasını indirir
```

Ya da [HuggingFace](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues) üzerinden manuel olarak.

### Yapılandırma

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

### Çalıştırma

```bash
npm run dev                    # geliştirme (sıcak yeniden yükleme)
npm run build && npm start     # üretim
./start.sh                     # PM2 (llama-server ile üretim)
```

---

## Sonuç

Luna Protocol modelleri, stile özgü konuşma yapay zekası için **azın çok olduğunu** kanıtlıyor. 50k özenle seçilmiş örnekle eğitilmiş, birkaç örnekle prime edilmiş 1.5B model, milyonlarca örnekle eğitilmiş 3B modeli -- çok daha az bellek maliyeti ve iki kat üretim hızıyla -- geride bırakıyor.

Few-shot priming, küçük modeller için sadece güzel bir ekstra değildir. Onları gerçek zamanlı konuşma uygulamaları için uygulanabilir kılan mekanizmadır. Örnekler sadece "yardım etmez" -- modelin tam olarak eğitildiği formatı eşleştirerek davranışını temelden değiştirir.

Kod açık kaynak, model HuggingFace'te ve veri seti herkese açık. İnsan gibi hissettiren bir konuşma botu yapmak istiyorsanız, tarif şu: küçük model, sınırlı fine-tuning, güçlü few-shot priming.

| Kaynak | Bağlantı |
|----------|------|
| GitHub deposu | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Model (HuggingFace) | [fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues) |
| Veri seti | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| İlk makale | [Luna Protocol: Otonom bir Discord botu oluşturdum](/articles/en/luna-protocol-discord-bot) |
