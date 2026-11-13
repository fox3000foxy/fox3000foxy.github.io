---
title: "Luna Protocol: 50 bin Discord örneğinde 1,5 milyar parametreli modeli neden ince ayarladım ve few-shot priming her şeyi neden değiştirdi"
description: "Daha az veride eğitilmiş daha küçük bir model daha büyük modeli geride bırakabilir, doğru başlatmayı bilmek koşuluyla. Luna Protocolün Hermes 3B modelinden ince ayarlı Qwen 1,5B modeline geçişi ve few-shot primingin neden ilerlemenin gerçek faktörü olduğu."
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
author_sig: "s9SJc+DfDSvu6b39cJcEPh348TvDMedN+thvgVlbWQ7fCz52BemuLcW1X3IPCu77tUzqlTmmA/BDkSwduuCDEw=="
---

# Luna Protocol: 50 bin Discord örneğinde 1,5 milyar parametreli modeli neden ince ayarladım ve few-shot priming her şeyi neden değiştirdi

[İlk makalede](/articles/en/luna-protocol-discord-bot) insanı simüle eden bir Discord botu inşa ettim: uyku, yazım hataları, tereddütler, unutkanlıklar, spontan mesajlar. Davranış sistemi sağlam duruyordu. Bütün bunların arkasındaki LLM 3 milyar parametreli Hermes modeliydi, Q8_0 nicemlenmiş, 3 GB VRAM tüketiyor.

Çalışıyordu. Ama büyük geliyordu.

Bir Discord botunun "nm just chillin, u" demesi için 3 milyar parametreli modele ihtiyacı yoktur. İhtiyacı olan **tarz tutarlılığıdır**: "kurumsal asistan" moduna sapmadan mesaj mesaj kesin konuşma tonunu koruma yeteneği. Ve daha az veride eğitilmiş, birkaç örnekle başlatılmış daha küçük bir modelin bunu basit sistem istemiyle geçmeye zorlayan daha büyük modelden iyi yaptığı ortaya çıkar.

Bu makale Luna Protocol resmi modelleri hakkındadır: neden varlar, neden 3B yerine 1,5B, neden 7,3M yerine 50 bin eğitim örneği ve few-shot priming neden "hoş bonus" statüsünden tüm yaklaşımın kalbine geçti.

---

## 3B modeliyle ilgili sorun

Orijinal yapılandırma Discord verilerinde ince ayarlanmış 3 milyar parametreli `Discord-Micae-Hermes-3-3B.Q8_0.gguf` modelini kullanıyordu. İyi yanıtlar üretiyordu ama:

| Metrik | Hermes-3-3B Q8_0 | Hedef |
|--------|-------------------|--------|
| VRAM kullanımı | ~3 GB | < 1 GB |
| Jeton üretimi | ~30 jeton/sn | ~60+ jeton/sn |
| Model dosyası boyutu | ~3,2 GB | < 1 GB |
| Soğuk başlatma süresi | ~8 sn | ~3 sn |

Mütevazı bir sunucuda 7/24 dönen bot için 3 GB VRAM çoktur. Ve üretim hızı ara sıra mesajlar için doğruyken patlama yanıtlar ya da birden çok aktif kanalda yavaştı.

Soru şuydu: Discord-Dialogues tarzının aynısı yarı parametreyle alınabilir mi?

---

## İnce ayar kararı: neden 7,3M değil 50 bin

[Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) veri kümesi **7,3M değiş tokuş** ve **17M konuşma turu** içerir. Gerçek Discord konuşmalarının devasa külliyatıdır. Bariz yaklaşım tüm veri kümesinde eğitmek olurdu.

Tersini yaptım. **50.000 örnekte** eğittim, mevcut verilerin %1inden azı.

Nedeni şu: **eğitim kümesi boyutu modelin eğitim dağılımına aşırı uyum derecesini doğrudan etkiler**.

7,3M örnekte eğitilmiş model konuşmaların çok belirli istatistiksel dağılımını öğrenir. Bu dağılımı üretmede mükemmel olur ama **katı** da olur: çıkarım anında verilen yeni kalıplara uyum payı azalır.

50 bin örnekte eğitilmiş model Discord konuşmalarının genel ton ve kaydını öğrenir (resmi olmayan, kısa, kısaltmalar, küçük harfler) ama **bağlam içi örneklerle sürülmek** için yeterli esneklik korur. Few-shot örnekler zaten öğrenilmiş devasa dağılımla savaşmaz: daha hafif dağılımı tamamlamaya gelir.

Merkez sezgisi budur: **sınırlı eğitim verileri few-shot priming daha etkili kılar**.

---

## Model: teknik ayrıntılar

Luna Protocol modeli [Qwen2.5-1.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct) modelinin **QLoRA** ince ayarıdır:

| Parametre | Değer |
|-----------|-------|
| Taban modeli | `unsloth/Qwen2.5-1.5B-Instruct-bnb-4bit` |
| Yöntem | QLoRA (4-bit) |
| LoRA rütbesi | `r=16`, `lora_alpha=16` |
| Hedeflenen modüller | `q/k/v/o_proj`, `gate/up/down_proj` |
| Eğitilebilir parametreler | 18 464 768 / 1 562 179 072 (%1,18) |
| Eğitim verileri | ~50 000 örnek (Discord-Dialogues alt kümesi) |
| Filtre | örnek başına 8-512 jeton |
| Dönem | 2-3 |
| Donanım | Kaggle T4 |
| Çerçeve | [Unsloth](https://github.com/unslothai/unsloth) |

Veri kümesi Discord-Dialogues önceden işlenmiş çatalıdır, yalnızca temiz `user`/`assistant` turları tutmak için filtrelenmiş: yalnızca kullanıcı ve asistan değiş tokuşları, sistem mesajı, meta veri ya da bot komutu yok. Devamı için önemlidir.

### Mevcut nicemlemeler

| Dosya | Nicemleme | Boyut | Notlar |
|------|-------------|------|-------|
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q2_K.gguf` | Q2_K | 676 MB | Belirgin bozulmuş: önerilmez |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf` | Q4_K_M | 986 MB | İyi boyut/kalite uzlaşması (önerilir) |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q8_0.gguf` | Q8_0 | 1,65 GB | En iyi tarz sadakati |

Önerilen model **Q4_K_M** dir: 1 GB altı, hızlı ve konuşma tarzını iyi korur. Q2_K bu boyutta model için fazla bozulur. Q8_0 en iyi kaliteyi verir ama %68 fazla bellek tüketir.

---

## Few-shot priming atılımı

Her şeyi değiştiren kısım işte burası.

Modelin HuggingFace kartında bir uyarı vardır:

> Çıplak istem ve başlatmasız bu model Qwen varsayılan "asistan" tonuna düşme eğilimindedir. Kısa few-shot başlatma büyük fark yaratır.

Bu eğitim verilerinin yapılandırılma biçiminin doğrudan sonucudur.

### Neden yalnızca sistem istemleri işe yaramaz

Discord-Dialogues eğitim verileri yalnızca `user`/`assistant` turları içerir. Eğitim kümesinde **sistem rolü örneği yoktur**. Model stil direktifi olarak sistem istemlerini izlemeye hiç eğitilmemiştir.

"Luna adındasın, rahat konuş" türü sistem istemi verilince talimatı duyar ama çıktısına çevirmek için öğrenilmiş sağlam kalıbı yoktur. O zaman Qwen varsayılan davranışına düşer: yardımsever, yapılandırılmış, hafif resmi.

### Few-shot örnekler neden işe yarar

Eğitimde kullanılan aynı ChatML formatında (`user`/`assistant` tur yapısıyla) konuşma örnekleri enjekte edilince bir şey tetiklenir. Model eğitiminden kalıbı tanır ve çıktısını ona göre hizalar.

Pratikte few-shot başlatma şuna benzer:

```yaml
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

Bu örnekler sistem isteminden sonra ve gerçek konuşmadan önce enjekte edilir. Model onları konuşma geçmişinin parçası, talimattan çok gerçek değiş tokuş olarak algılar. Bu esas ayrımdır: rahat tonun nasıl göründüğünü ona *emretmek* yerine *gösteririz*.

### Önce / sonra

Few-shot başlatmasız (çıplak sistem istemi):

```
User: yo whats good
Bot: Hello! I am doing well, thank you for asking. How can I assist you today?
```

Few-shot başlatmayla (3 örnek):

```
User: yo whats good
Bot: nm just chillin, u
```

Fark çarpıcıdır. Model tüm kaydı benimser: küçük harfler, kısaltmalar, rahat ton, kısa yanıtlar. Qwen eğitim verilerinin tarzından çok örneklerin tarzını taklit eder.

---

## Bellek ve hız: somut sayılar

Hermes-3-3B modelinden Luna-Protocol-1.5B modeline geçiş ölçülebilir kazanımlar getirir:

| Metrik | Hermes-3-3B Q8_0 | Luna-Protocol Q4_K_M | İyileşme |
|--------|-------------------|----------------------|-------------|
| VRAM kullanımı | ~3 GB | ~986 MB | **%67 az** |
| Model dosyası boyutu | ~3,2 GB | ~986 MB | **%69 küçük** |
| Jeton üretimi | ~30 jeton/sn | ~60+ jeton/sn | **2 kat hızlı** |
| Soğuk başlatma | ~8 sn | ~3 sn | **%62 hızlı** |
| Bağlam penceresi | 8192 | 8192 | Aynı |

### Hız kazancı neden gerçektir

Küçük modeller çıkarımda temelde hızlıdır. 3B yerine 1,5B parametreyle:

- Jeton başına **daha az matris çarpımı**: dikkat katmanları, FFN katmanları ve çıktı projeksiyonu hepsi parametre sayısıyla doğrusal ölçeklenir
- **Daha iyi önbellek kullanımı**: küçük model ağırlıklarının daha fazlasını L2/L3 önbelleğe sığdırır
- **Daha az bellek bant genişliği baskısı**: jeton başına VRAMden okunacak daha az bayt

Mütevazı yapılandırmada, yalnızca CPU (2 çekirdek, GPU yok) 1,5B model jetonları 3B modelin yaklaşık **2 katı** hızında üretir. "Bot kokmak" ile "yazan gerçek insan gibi" arasındaki fark budur.

### İstem önbelleği avantajı büyütür

Luna Protocol önbellek etkin `llama-server` kullanır (`--cache-reuse 256`). Bu şu anlama gelir:

1. Oturumun ilk mesajı istem işlemenin tam maliyetini öder (sistem istemi + few-shot örnekleri + kullanıcı mesajı)
2. Sonraki mesajlar yalnızca *yeni* jetonları işler çünkü önbelleğe alınmış önek yeniden kullanılır
3. 5 few-shot örnekle (~50-150 jeton) ek yük ilk istekten sonra ihmal edilir olur

Few-shot örnekler pratikte oturumun ilk mesajından sonra "bedava" olur. Model marjinal sıfır maliyetle tarz rehberliğinden yararlanır.

---

## Uygulama: kodda nasıl çalışır

Luna Protocol few-shot sistemi temiz ve minimaldir. Her şeyi üç dosya yönetir.

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

Yapılandırma hot-reload yapılabilir. Örnekler değiştirilir, kaydedilir ve bot yeni tarzı yeniden başlatmadan hemen benimser.

### 2. Biçimleme ve enjeksiyon (`src/core/few-shot.ts`)

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

`injectFewShotIntoConversation()` fonksiyonu onları sistem isteminden hemen sonra yerleştirir:

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

LLM her çağrılmadan önce few-shot örnekler etkinse enjekte edilir:

```typescript
let finalMessages = messages;
if (FEW_SHOT_ENABLED && FEW_SHOT_EXAMPLES.length > 0) {
  const fewShotMessages = formatFewShotExamples(FEW_SHOT_EXAMPLES);
  finalMessages = injectFewShotIntoConversation(messages, fewShotMessages);
}
```

Model şunu alır: `[sistem_istemi] + [few_shot_örnekleri] + [konuşma_geçmişi]`

---

## Discord-Dialogues tarzını korumak

Orijinal Discord-Dialogues veri kümesinin çok belirli konuşma imzası vardır:

- **Kısa mesajlar**: tur başına ortalama 32,8 jeton
- **Resmi olmayan kayıt**: kısaltmalar, küçük harfler, noktalama yokluğu
- **Hızlı değiş tokuşlar**: uzun monologlardan çok birkaç kısa değiş tokuş
- **Doğal kusurlar**: yazım hataları, "lol", "fr", "ngl", "tbh"

Luna Protocol modeli bu tarzı iki mekanizmayla korur:

### 1. İnce ayar taban dağılımı kaydırır

50 bin eğitim örneği modele Discord konuşmalarının **istatistiksel ayak izini** öğretir. Yanıtların tipik kısa, küçük harfli ve resmi olmayan olduğunu öğrenir. Bu modelin varsayılan çıktısını Qwen "yardımsever asistan" modundan uzaklaştırır.

### 2. Few-shot priming sonucu kilitler

Few-shot örnekler ince ayar sırasında öğrenilen kalıpları tam pekiştirir. **Tarz çapası** görevi görür: model uzun konuşmada hafif resmi tona sapsa bile bağlamdaki örnekler onu geri çeker.

Kombinasyon her mekanizmadan tek başına güçlüdür:
- Few-shot olmadan ince ayar: model *genelde* rahat ama tutarsızdır
- İnce ayar olmadan few-shot: model örnekleri izlemeye çalışır ama sürekli asistan moduna düşer
- İnce ayar + few-shot: model **sürekli** karakterde kalır

---

## Felsefe: daha küçük model, daha akıllı istemleme

LLM dağıtımında yaygın bilgelik "daha büyük daha iyidir" der. Daha fazla parametre, daha fazla eğitim verisi, daha fazla VRAM. Luna Protocol ters yolu alır:

- **3B yerine 1,5B**: yarı parametre, yarı bellek, iki kat hızlı
- **7,3M yerine 50 bin örnek**: daha az eğitim verisi, bağlam içi öğrenmeye daha fazla esneklik
- **Sistem istemleri yerine few-shot priming**: modele ne istediğini söylemek değil göstermek

Bu basit teknik optimizasyondan çok üstlenilmiş tasarım seçimidir. Discord botunun genelci asistan değil hafif konuşma yoldaşı kalması gerekir. Tutarlı, hızlı ve sunucunun tüm VRAM bütçesini yutmadan "nm just chillin, u" demelidir.

Sonuç: ayda 5 $ VPSde dönen, gerçek zamanlı yazıyormuş izlenimi verecek kadar hızlı jeton üreten ve parçalarının toplamından değerli ince ayar ve few-shot priming kombinasyonu sayesinde tutarlı kişilik sürdüren bot.

---

## Kurulum

### Modeli indir

```bash
npm run download-model
# Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf indirir
```

Ya da [HuggingFaceden](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues) manuel.

### Yapılandır

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

### Çalıştır

```bash
npm run dev                    # geliştirme (hot reload)
npm run build && npm start     # üretim
./start.sh                     # PM2 (llama-server ile üretim)
```

---

## Sonuç

Luna Protocol modelleri tarz odaklı konuşma yapay zekâsı için **azın çok olduğunu** kanıtlar. Özenle seçilmiş 50 bin örnekte eğitilmiş, birkaç örnekle başlatılmış 1,5B model, milyonlarca örnekte eğitilmiş 3B modeli geride bırakır; belleğin bir bölümü maliyet ve iki kat üretim hızıyla.

Few-shot priming küçük modeller için merkez mekanizmayı oluşturur. Onları gerçek zamanlı konuşma uygulamalarına uygun yapan odur. Örnekler "yardım etmekten" çok fazlasını yapar: modelin davranışını temel değiştirir, eğitildiği formatı tam taklit eder.

Kod açık kaynaktır, model HuggingFacededir ve veri kümesi herkese açıktır. İnsansı izlenimi veren konuşma botu inşa etmek istersen tarif: küçük model, sınırlı ince ayar, sağlam few-shot başlatma.

| Kaynak | Bağlantı |
|----------|------|
| GitHub deposu | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Model (HuggingFace) | [fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues) |
| Veri kümesi | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| İlk makale | [Luna Protocol: özerk bir Discord botu yarattım](/articles/tr/luna-protocol-discord-bot) |
