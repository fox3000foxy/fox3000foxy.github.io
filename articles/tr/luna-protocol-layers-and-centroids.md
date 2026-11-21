---
title: "Luna Protocol: beyinlerin ortaklaştırılması, duygusal sınıflandırma ve ilginç/faydasız yönlendirme"
description: "Luna Protocol monolitten dört katmanlı mimariye geçti: adaptörler, brain, duygusal sınıflandırıcı ve inference. Programda: embedding centroidleri, ilginç/faydasız yönlendirme ve valence ile arousal üzerinden LLM parametre ayarı."
date: 2026-07-27
tags:
  - discord
  - matrix
  - llm
  - architecture
  - embeddings
  - centroids
  - emotion-ai
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "zTa8qDfl7SBBiOk0oswMeCd075ht/M8AQ9/GxbX62wm0VhzXmiWHXhv+6xn5GUVyWHLTjprOqGhxye6sGL0Rag=="
---

# Luna Protocol: beyinlerin ortaklaştırılması, duygusal sınıflandırma ve ilginç/faydasız yönlendirme

Önceki [iki](/articles/tr/luna-protocol-discord-bot) [makalede](/articles/tr/luna-protocol-official-models) Luna Protocolü karmaşık davranış sistemi ve ince ayarlı modelli tekil Discord botu sundum. Ama mimari o zamandan iyi evrildi. Monolit olan şey: Discord botu, davranışı ve LLM çağrılarını yöneten tek Node.js süreci, **dört bağımsız katmana** dönüştü; her birinin kendi sorumluluğu, kendi dili ve kendi yaşam döngüsü var.

Bu ayrım beklenmedik faydalar getirdi: birkaç platform arasında "beyinlerin" ortaklaştırılması, LLM parametrelerini dinamik ayarlayan duygusal sınıflandırma sistemi ve konuşmanın algılanan önemine göre iki model arası akıllı mesaj yönlendirme.

Evrim bir seferde olmadı: organik bir yolu izledi. Önce bot deposundan `server/` klasörünü ayırdım, böylece bir yanda **Krystal** yaratıp **Jade**i Discord adaptörü bıraktım. Sonra Jadein `llm-core` ve olay veriyolunu geri alıp **Pixieglow** (Matrix adaptörü) yarattım. Sonra DistilBERT ile GENERIC/SEMANTIC sınıflandırma getirmek için **Sapphire** geldi. Sonuçlar ikna edici değildi, o yüzden örnek zenginleştirme için daha yoğrulabilir ve daha hassas embedding centroidlerine geçtim; sınıflandırma FUTILE/INTERESSANT oldu. Sonunda LLM sıcaklık ve repeat penalty değerlerini düzenlemek için **valence** ve **arousal** centroidleri ekledim. Bitirmek için Jade ile Pixieglow arası tüm yedek kodu **Emerald**, ortaklaştırılmış beyin yaratarak kaldırdım; Jade ile Pixieglow soket sürümlü basit istemcilere dönüştü.

Paralel olarak projenin ilerlemesini izleyen bir web sitesi tuttum: [protocol-luna.github.io](https://protocol-luna.github.io/).

Bu makale bu katmanları nasıl ve neden böldüğümü, her servisin tam ne yaptığını ve **centroid** (embedding vektör ortalamaları) ile 70lerin PARRY chatbotundan ilhamlı **hissetme değişkenleri** gibi kavramların basit Discord botunu şaşırtıcı tutarlı çok platformlu sisteme nasıl dönüştürdüğünü anlatır.

---

## Monolitle ilgili sorun

Başlangıçta Luna Protocol tek Node.js sürecine sığıyordu. Kod şunları yönetiyordu:

- Eris kütüphanesiyle Discorda bağlantı
- Tetikleyici değerlendirmesi (bahsetmeler, anahtar kelimeler, takip...)
- İnsani davranış simülasyonu (yazım hataları, tereddütler, uyku...)
- Yerel LLM sunucusuna (llama.cpp) HTTP çağrıları
- Oturum ve anti-spam yönetimi
- TTS pipelineı

Her şey aynı süreçteydi, tipli olay veriyollarıyla (`TypedBus`) iletişim kuruyordu. Çalışıyordu ama limitlerle:

- Davranış kodunun tamamını kopyalamadan **Matrix istemcisi eklemek imkânsız**
- **LLM ve bot aynı depodaydı**: `server/` klasörü zaten vardı ama birini diğerine dokunmadan evrimleştirmek imkânsız
- **Farksız işleme**: her mesaj aynı işleniyordu, "lol" ya da varoluşsal soru olsun
- **Duygusal amnezi**: bot hiçbir şey "hissetmiyordu"

Katmanlara bölme tüm bu sorunları çözdü.

---

## Dört katman

Luna Protocol mevcut mimarisi dört seviyeli huni düzenlenmiştir:

```
Matrix / Discord
      |
      v
  [ADAPTÖRLER]      Pixieglow (Matrix) / Jade (Discord)
      |
      v
  [BRAIN]            Emerald (WebSocket, port 3126)
      |
      v
  [SINIFLANDIRICI]   Sapphire (HTTP, port 3123)
      |
      v
  [INFERENCE]        Krystal (llama.cpp, port 3124 / 3125)
```

Her katman bağımsız yeniden başlatılabilir, güncellenebilir ya da değiştirilebilir.

---

### Katman 1: adaptörler (Pixieglow ve Jade)

En basit katmanlardır. Tek işleri mesajlaşma platformu olaylarını Emeralda standart protokole çevirmektir:

- **Jade** Discord adaptörüdür. Discorda bağlanmak için Eris kütüphanesini kullanır ve mesajları WebSocket üzerinden Emeralda iletir. TTS pipelineını da yönetir (Piper ile ses sentezi, OGGye dönüştürme, Discorda yükleme).
- **Pixieglow** Matrix adaptörüdür. Doğrudan Matrix HTTP Client-Server API kullanır (SDK yok), uzun yoklama eşzamanlamasıyla. TTSsi yoktur.

İki adaptör `emerald-client.ts` içinde tanımlı aynı WebSocket protokolü paylaşır:

```typescript
type ClientId = "jade" | "pixieglow";

// Olaylar (adaptör -> Emerald)
type InEvent = MessageEvent | ReadyEvent | BotMessageEvent | PresenceEvent;

// Komutlar (Emerald -> adaptör)
type OutCommand = RespondCommand | TypingCommand | SetPresenceCommand
                | SpontaneousCommand | ForgotCommand;
```

Aynı arayüzlü iki adaptörün varlığı ortaklaştırmayı kanıtlar: **aynı "beyin" (Emerald) farksız Discord botu ve Matrix botu sunar**, aynı davranışlarla. Protokol bildirimseldir: Emerald adaptöre mesajı *nasıl* göndereceğini söylemez, *neyi* göndereceğini söyler (gecikmeli metin, belki patlama planı, tepki vs.). Her adaptör platforma göre somut yürütmeyi uygular.

Bu mimarinin gücü budur: Telegram, Signal ya da başka destek eklemek için WebSocket protokolünü uygulayan bir adaptör yazmak yeter.

---

### Katman 2: beyin (Emerald)

Emerald merkezi karar servisidir. 3126 portunda WebSocket dinler ve yönetir:

- **Tetikleyici değerlendirmesi**: bahsetme, DM, ad, anahtar kelime, takip, rastgele
- **Davranış simülasyonu**: konsantrasyon gecikmeleri, yazım hataları, tereddütler, unutkanlıklar, patlama, tematik yorgunluk
- **Uyku döngüleri**: sleep / slow / short modları
- **Oturum yönetimi**: bekleme süresi, oturum limitleri, anti-spam
- **Sapphirea yönlendirme**: mesaj gönderme, akışlı yanıtlar alma

Emerald ortaklaştırmayı mümkün kılan merkezi servistir ve ayrılıktan en çok yararlanan odur. Önce her davranış (yazım hatası, patlama, tereddüt) Discord koduyla iç içeydi. Artık `behavior/` içinde adanmış modüllerdedirler:

```
emerald/src/behavior/
  burst.ts         -- Patlama mesaj planlaması
  mannerisms.ts    -- Gecikmeler, tereddütler, tepkiler, unutkanlıklar
  sleep.ts         -- Uyku saati değerlendirmesi
  typo.ts          -- Yazım hatası simülasyonu (AZERTY/QWERTY)
```

Beyin hangi platformda döndüğünü bilmez. `clientId` ("jade" ya da "pixieglow") ile `MessageEvent` alır, karar verir ve komut döndürür. Geri kalanı adaptör halleder.

---

### Katman 3: duygusal sınıflandırıcı (Sapphire)

Sapphire teknik açıdan en ilginç servistir. Dört kritik rol oynayan FastAPI ile Python yazılmış **LLM middleware**dir:

1. Embedding centroidleriyle ikili **FUTILE / INTERESSANT sınıflandırıcı**
2. Centroidlerle **duygusal skorlayıcı** (valence / arousal)
3. Krystala **backend yönlendirici** (küçük model ve büyük model)
4. **Few-shot enjektör** ve oturum yöneticisi

#### Centroidler: sınıflandırmanın kalbi

**Centroid** basit kavramdır: embedding vektör kümesinin ortalamasıdır. Somut olarak yüzlerce örnek mesaj topladım, embedding modelinden (`BAAI/bge-small-en-v1.5`, 384 boyut) geçirdim ve elde edilen vektörlerin ortalamasını aldım.

**İki sınıflandırma centroidi** vardır:

- `futile_centroid`: k-means (k=10, seed=42) ile ~683 önemsiz mesaj ("lol", "ok", "hello")
- `interessant_centroid`: k-means (k=10, seed=42) ile ~678 önemli mesaj (teknik, kişisel, felsefi)

Mesaj gelince:

```python
def classify(text, embedder, futile_centroids, interessant_centroids):
    emb = embedder.query_embed(text)                     # 384 boyutlu vektör
    sim_f = max(cos(emb, c) for c in futile_centroids)     # 10 üzerinde maks
    sim_i = max(cos(emb, c) for c in interessant_centroids) # 10 üzerinde maks
    diff = sim_i - sim_f
    label = "INTERESSANT" if diff > 0 else "FUTILE"
    return label, abs(diff), sim_f, sim_i
```

Sınıf başına skor 10 centroidi arasında **maksimum kosinüs benzerliğidir**. Bu her kategoride alt türleri yakalar: selamlama ve vedalaşma embedding uzayında uzak olsalar bile 10 faydasız centroidten birine yakın düşer. Başlangıçta yalnızca k-means ve çalışırken nokta çarpımlar: eğitimsiz, GPUsuz.

#### Neden iki model?

Bu sınıflandırmanın sonucu hangi LLM backendinin çağrılacağını belirler:

| Etiket | Krystal Backend | Model | Port |
|-------|----------------|--------|------|
| `FUTILE` | `generic` | Luna-Protocol-1.5B (941 MB, Q4_K_M) | 3124 |
| `INTERESSANT` | `semantic` | Hermes-3-3B ya da 8B (yapılandırmaya göre) | 3125 |

Sezgi basittir: "lol" ya da "nm just chillin u" 8 milyar parametreli modeli çağırmayı hak etmez. 200.000 Discord örneğinde ince ayarlı küçük Luna 1.5B modeli hafif değiş tokuşlara fazlasıyla yeter. Buna karşılık hayat sorusu, sır ya da teknik tartışma daha zengin yanıt üretebilen büyük modele yönlendirilir.

Bu ekonomik yönlendirme LLM sunucusu yükünü önemli azaltır: mesajların yaklaşık %70i FUTILE sınıflanır ve küçük modelce işlenir, büyük model gerçekten değer konuşmalara serbest kalır.

#### Duygusal eksen: valence ve arousal

Ama hepsi bu değildir. Sapphire duyguyu değerlendirmek için bağımsız eksende **aynı centroid mekanizmasını** kullanır:

**Dört duygusal centroid** vardır:

| Kutup | Örnekler |
|------|----------|
| `positive` | "hell yeah", "love that", "this is great" |
| `negative` | "shut up", "i hate this", "this sucks" |
| `high_arousal` | "WHAT THE HELL", "omg omg omg", "AAAAA" |
| `low_arousal` | "just chilling", "meh", "i guess" |

Skor her eksende benzerlik farkı hesaplanır:

```python
valence = sim(emb, positive) - sim(emb, negative)     # [-1, +1]
arousal = sim(emb, high_arousal) - sim(emb, low_arousal)  # [-1, +1]
```

**Valence** mesajın olumlu mu olumsuz mu olduğunu ölçer. **Arousal** duygusal yoğunluğunu ölçer. Birlikte 1972de **PARRY** chatbotuna ilham veren aynı psikolojik model olan etki çember modelini (Russell, 1980) oluşturur.

#### Hissetme değişkenleri: duygular LLMyi nasıl kontrol eder

PARRY ilhamının somutlaştığı yer burasıdır. PARRY (1972de Kenneth Colby tarafından yaratılmış) paranoyak hastayı simüle tasarlanmış bir chatbottu. Yanıtlarını değiştiren iç değişkenleri (korku, öfke, güvensizlik) vardı. Örneğin "korkmuş" PARRY daha saldırgan yanıtlıyordu.

Sapphire aynısını yapar ama sürekli değişkenler ve daha zarif yöntemle: sohbetin duygusal durumuna göre LLM örnekleme parametreleri gerçek zamanlı ayarlanır.

##### Sıcaklık arousalı izler

```python
temperature = clamp(0.7 + arousal * 0.3, 0.4, 1.0)
```

| Arousal | Sıcaklık | Etki |
|---------|-------------|-------|
| -1.0 (sakin) | 0.40 | Düşük yaratıcılık, öngörülebilir yanıtlar |
| 0.0 (nötr) | 0.70 | Varsayılan yaratıcılık |
| +1.0 (heyecanlı) | 1.00 | Maksimum rastgelelik, şaşırtıcı yanıtlar |

Biri heyecanlı ya da kızgınsa (yüksek arousal) sıcaklık yükselir. Model daha çeşitli, daha yaratıcı, bazen daha kaotik yanıtlar üretir; "coşan" insan gibi. Sohbet sakinse sıcaklık düşer, yanıtlar daha soğukkanlıdır.

##### Repeat penalty valencei izler

```python
repeat_penalty = clamp(1.15 - valence * 0.1, 1.0, 1.3)
```

| Valence | Repeat Penalty | Etki |
|---------|---------------|-------|
| -1.0 (olumsuz) | 1.25 | Güçlü ceza, tekrarlardan kaçınır |
| 0.0 (nötr) | 1.15 | Varsayılan değer |
| +1.0 (olumlu) | 1.05 | Zayıf ceza, tekrarlara izin verir |

Sohbet ne olumsuz, model kendini tekrar etmemeye o kadar itilir; gergin tartışmada kelimelerini arayan biri gibi. Sohbet ne olumlu, model gereksiz olumlamalara o kadar izin verebilir; rahat sohbet gibi.

##### Birikimli duygusal durum

Bu skorlar yalnızca anlık mesajı taşımaz. `EmotionState`, oturum başına valence ve arousal **üstel hareketli ortalamasını** tutar:

```python
class EmotionState:
    def __init__(self, decay=0.85, deadzone=0.06):
        self.decay = decay
        self.deadzone = deadzone

    def update(self, key, valence_delta, arousal_delta):
        if abs(valence_delta) < self.deadzone:
            valence_delta = 0.0
        if abs(arousal_delta) < self.deadzone:
            arousal_delta = 0.0
        s = self._state.setdefault(key, {"valence": 0.0, "arousal": 0.0})
        s["valence"] = s["valence"] * self.decay + valence_delta * (1 - self.decay)
        s["arousal"] = s["arousal"] * self.decay + arousal_delta * (1 - self.decay)
        return s
```

0,85 `decay`, her mesajda önceki durumun %85i korunur ve yeni sinyalin %15i bütünleşir demektir. Bu ani değişimleri yumuşatan **duygusal bellek** verir: tek olumsuz mesaj botu "üzmez" ama bir dizi olumsuz mesaj ruh halini yavaşça sürükler.

Pratikte: biri sohbete çok heyecanlı başlarsa (`arousal=+0,8`) sonraki mesajlar daha sakin olsa bile sıcaklık birkaç değiş tokuş yüksek kalır. Duygu düşmeye zaman alır; tartışmadan sonra "sıcak" kalan insan gibi.

---

### Katman 4: inference (Krystal)

Krystal en alt katmandır: `llama.cpp` etrafında OpenAI uyumlu API (`/v1/chat/completions`) sunan sarmalayıcı. İki PM2 örneğinde döner:

- `krystal-small`: 3124 portunda ince ayarlı Luna 1.5B modeli, CPU yakınlığı 0
- `krystal-large`: 3125 portunda Hermes 3B modeli, CPU yakınlığı 0,1

İki örnek `taskset` ile CPU sabitlemeli çalıştırılan önceden derlenmiş `llama-server` süreçleridir.

Luna modelinin ince ayarı da ikinci makaleden beri evrildi: artık **200.000 örnekte** eğitilir (önce 50.000), hep Qwen2.5-1.5B-Instruct üzerinden QLoRA ile. 200 bin örnek Discord-Dialogues veri kümesinin alt kümesidir, en doğal ve çeşitli konuşmalar tutulmak için filtrelenmiş. Amaç: few-shot priming etkili kılan esnekliği kaybetmeden modelin tarz kaydını genişletmek.

---

## Eksiksiz şema: transitte bir mesaj

Discordda biri "je suis vraiment triste aujourd'hui" gönderince somut olan:

1. **Jade** mesajı Discord API Gateway üzerinden alır. `MessageEvent` dönüştürüp WebSocket ile Emeralda gönderir.
2. **Emerald** tetikleyiciyi değerlendirir (bahsetme mi? ad mı? anahtar kelime mi?). Doğrudan bahsetmedir. Konsantrasyon gecikmesi hesaplar, bekleme süresini, oturumu, tematik yorgunluğu kontrol eder. Yanıtlamaya karar verip mesajı HTTP ile Sapphirea gönderir.
3. **Sapphire** mesajı `bge-small-en-v1.5` ile gömer.
   - Sınıflandırma: mesaj `futile` centroidtense `interessant` centroidine yakındır (diff = +0,31) -> **INTERESSANT**
   - Duygu: olumsuz valence (-0,42), orta arousal (0,35)
   - Yönlendirme: `KRYSTAL_SEMANTIC_URL` yönü (port 3125, büyük model)
   - Örnekleme parametreleri: sıcaklık = 0,80 (artmış arousal), repeat_penalty = 1,19 (olumsuz valence)
   - Oturumun duygusal durumu bu değerlerle güncellenir
4. **Krystal** (büyük örnek) duygusal ayarlanmış parametrelerle yanıtı üretir ve Sapphirea döndürür.
5. **Sapphire** yanıtı meta verilerle (etiket, valence, arousal, hata ayıklama istatistikleri) Emeralda akıtır.
6. **Emerald** tereddüt ("oh...") eklemeye, patlama planlamaya (2 parça) ve tepki seçmeye karar verir. Jade `RespondCommand` gönderir.
7. **Jade** çalıştırır: başlangıç gecikmesini bekler, tereddütlü ilk parçayı gönderir, 1,5 sn bekler, ikinci parçayı gönderir. Tüm üretim boyunca yazıyor göstergesini gösterir.

Bunların hepsi kullanıcı için 3 saniyeden kısa sürer.

---

## Centroidler: neden sinir sınıflandırıcıdan iyidir

Geleneksel sınıflandırıcı (önce kullandığım DistilBERT gibi) yerine embedding centroidleri seçimi açıklamayı hak eder.

Sinir sınıflandırıcı sınıflar arası karar sınırı öğrenir, tipik girdileri olasılıklara yansıtan doğrusal olmayan dönüşüm. Hassastır ama:

- Etiketli eğitim verisi gerektirir
- Dağılım değişimine duyarlıdır (data drift)
- Yorumlaması zordur
- Yeni sınıf eklemek için yeniden eğitilmelidir

Centroid ise tersine örnek embeddinglerinin **ortalama vektörüdür**. Sınıflandırma bu ortalama vektöre kosinüs benzerliğiyle yapılır. Avantajlar:

- **Eğitim gerekmez**: elle seçilmiş örnek embeddinglerinin ortalaması hesaplanır
- **Yorumlaması kolay**: centroidin "ne öğrendiğini" anlamak için ona en yakın örneklere bakılabilir
- **Sınıf ekleme**: yeniden eğitimsiz yeni centroid eklenir
- **Sağlam**: centroid ortalamadır, o yüzden aykırı değerlerin etkisi azdır

Centroidlerin gerçek gücü sınıflandırma sorununu **uzamsal mesafe ölçümü** sorununa dönüştürmesidir. Kategoriler 384 boyutlu uzayda bölgeler görselleştirilebilir (PCA/t-SNE ile boyut indirgeme sonrası 2D/3D).

### Centroidlerin 3D görselleştirmesi

Pratikte sınıflandırma centroidleri embedding uzayında şöyle görünür. Her nokta PCA ile 3D yansıtılmış örnek mesajdır (görselleştirme için 384 orijinal boyut 3e indirilir). Mavi noktalar faydasız mesajlar, sarı noktalar ilginç mesajlardır. **20 elmas işaret** k-means centroidleridir (sınıf başına 10, seed=42). Metin için nokta üzerine gel.

<iframe src="assets/centroids-plot.html" style="width:100%;height:550px;border:none;border-radius:8px;" loading="lazy" title="Centroïdlerle sınıflandırma: etkileşimli 3D görünüm"></iframe>

İki test örneği kırmızıyla gösterilir: "lol" (faydasız sınıflı) ve "i feel sad today" (ilginç sınıflı). 384 boyuttan 3e indirgemeden sonra bile (%14,7 açıklanmış varyans) iki küme açık ayrıdır. Üstteki ek açıklama tam sayımları ve belirsiz bölgeyi gösterir.

Girdi mesajının centroidi içeriğine göre bu uzayda gezinir. FUTILE/INTERESSANT sınıflandırması basitçe kosinüs benzerliğince hangi centroidin en yakın olduğunu ölçer. Böylece her mesaj çok boyutlu uzayda bir nokta temsil edilebilir, her boyut anlamsal özelliğe karşılık gelir.

---

## Pratikte neyi değiştirir

Kullanıcılar katmanları, centroidleri ya da sıcaklık ayarlarını görmez. Ama etkileri hisseder:

- Basit mesajlar için **daha hızlı yanıtlar** (küçük model 2 kat hızlı ve trafiğin %70ini yönetir)
- **Uyarlanabilir ton**: kızgınsan bot kızgınlığı "hisseder" ve tarzını uyarlar
- **Platformlar arası tutarlılık**: Matrix botu ve Discord botu aynı beyni ve aynı duygusal durumu paylaşır
- **Korunmuş otantik ton**: ince ayar + few-shot + akıllı yönlendirme kurumsal yanıtları engeller

Küçük model için 200 bin eğitim örneğine geçiş bu etkileri daha güçlendirdi: model few-shot priming mümkün kılan yoğrulabilirliği kaybetmeden Discord konuşmalarının çeşitliliğini iyi yakalar.

---

## Eksiksiz altyapı

İşte şu an dönen servisler:

| Servis | Teknoloji | Port(lar) | Rol |
|---------|------------|---------|------|
| Pixieglow | TypeScript (Bun) | -- | Matrix adaptörü |
| Jade | TypeScript (esbuild) | -- | Discord adaptörü |
| Emerald | TypeScript (Bun) | 3126 (WebSocket) | Beyin / kararlar |
| Sapphire | Python (FastAPI) | 3123 (HTTP) | Sınıflandırıcı + duygu |
| Krystal small | llama.cpp (PM2) | 3124 | Küçük model (1.5B, faydasız) |
| Krystal large | llama.cpp (PM2) | 3125 | Büyük model (3B+, ilginç) |

Servisler arası bağımlılıklar tek yönlüdür: adaptör Emeralda, Emerald Sapphirea, Sapphire Krystala bağlıdır. Graf döngüsüz kalır. Her servis bağımsız yeniden başlatılabilir.

---

## Sonuç

Luna Protocolü dört katmana bölmek sadece mimari egzersiz değildi. Somut limitlere yanıttı: Matrix destekleyememe, duygusal bilinç yokluğu, akıllı mesaj önceliği yokluğu.

Bugün sistem daha sağlamdır (LLM crashi botu öldürmez), daha genişletilebilirdir (Telegram ya da WhatsApp adaptörü aynı WebSocket protokolünü izlerdi) ve daha "canlıdır": bot davranışını, tonunu ve hatta LLM parametrelerini sohbetin algılanan duygusal durumuna uyarlar.

Embedding centroidleri bütün bunları ölçüsüz karmaşıklık olmadan mümkün kılan kilit öğedir: eğitilmiş sinir ağı yok, etiketli veri pipelineı yok, sadece vektör ortalamaları ve kosinüs benzerlikleri. Basit, inanılmaz etkili ve feci az değer gören bir tekniktir.

| Kaynak | Bağlantı |
|----------|------|
| Proje web sitesi | [protocol-luna.github.io](https://protocol-luna.github.io/) |
| Pixieglow | [protocol-luna/pixieglow](https://github.com/protocol-luna/pixieglow) |
| Emerald | [protocol-luna/emerald](https://github.com/protocol-luna/emerald) |
| Sapphire | [protocol-luna/sapphire](https://github.com/protocol-luna/sapphire) |
| Krystal | [protocol-luna/krystal](https://github.com/protocol-luna/krystal) |
| Makale 1: Discord botu | [Luna Protocol: özerk bir Discord botu yarattım](/articles/tr/luna-protocol-discord-bot) |
| Makale 2: ince ayar | [Luna Protocol: 1,5B modeli neden ince ayarladım](/articles/tr/luna-protocol-official-models) |
