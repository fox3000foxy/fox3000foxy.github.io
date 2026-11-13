---
title: "PiperHub: 536 açık kaynak TTS sesi, tek modelde 7 duygu, sıfır GPU, sıfır fatura"
description: "VITS, espeak, ONNX, LJSpeech: Piper bir Raspberry Pi'yi nasıl konuşturuyor. 7 duygulu Fortune multi, Kokoro 82M, PocketTTS, sanoTTS, ElevenLabs - ve resmi Python wrapper'dan 10 kat hızlı natif pipertts."
date: 2026-11-12
tags:
  - tts
  - piper
  - open-source
  - typescript
  - ai
  - catalogue
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "oVObeZHyR+aQwIr+CLB4qgowyMKqScYq0CDB2z2cDtEM5bihwlNKt4cLJCt4cK52VS9KldJw3a2r+t0Cy8PjMg=="
---

## Giriş

Bir Discord botunu konuşturmak pahalı. Metin değil: yerel bir LLM birkaç sentlik GPU ile cümle üretiyor. Ses ise her cümlede ödeniyor. Sentez API'leri karakter başına ücret alıyor, bot bütün gece konuşunca fatura da peşinden geliyor.

Luna Protocol ile yaşadığım sorun buydu. Discord botum mesajlarını yerel LLM ile üretiyor, sonra bir Piper sesiyle yüksek sesle okutuyor, OGG'ye çeviriyor ve sesli mesaj olarak gönderiyor. Hepsi kendi sunucumda, cümle başına 0 euro, sabah 3'te Luna tek başına hayatını anlatmaya karar verdiğinde bile.

0 euroda kalmak, ücretsiz sesler bulup kendin host etmek demek. İşin karıştığı yer de burası: onlarca Hugging Face reposuna dağılmış modeller, muğlak lisanslar, şu sesin nereden geldiğini ya da hâlâ çalışıp çalışmadığını bilmenin yolu yok. Ben de [PiperHub](https://piperhub.org/)'ı kurdum, Piper TTS için açık kaynak bir ses kataloğu.

Günün rakamları: görüntülenen **536 model**, temsil edilen **71 dil**, listelenen **3755 speaker**. Bildiğimde her model kaynak datasetine bağlı, ana sayfanın dediği gibi kaynak sesin bir parçası.

Bana sık sorulan bir soru kaldı: Kokoro, PocketTTS, sanoTTS ve ElevenLabs karşısında Piper ne durumda? Ve Fortune'un `pipertts` modülü neden resmi Python wrapper'dan 10 kat hızlı? Bu yazı motorları açıyor, kod kanıtıyla.

## PiperHub, katalog

Motorları açmadan önce PiperHub'un çözdüğü soruna bakalım.

### Sesler nereden geliyor

Kod [github.com/fox3000foxy/piper-bank](https://github.com/fox3000foxy/piper-bank) adresinde. Astro, statik site, sıfır sunucu: kökte İngilizce, `/<code>/` altında 15 locale daha (fr, de, es, it, pt, ru, tr, ja, ko, zh, id, hi, ar, vi, th). Aslında blogumla aynı pattern.

Gerçek kaynağı kimse elle düzenlemiyor. Bu bir pipeline:

```bash
npm install
npm run data    # src/data/*.json dosyalarını yeniden üretir (python3 scripts/generate_data.py)
npx astro dev   # yerel dev
npm run build   # dist/ içine statik build
```

Somut olarak: bir crawler repo `models_mapping.csv` ve `datasets_mapping.csv` dosyalarını tutuyor, ayna sesler Hugging Face'te yaşıyor, sample'lar ses dosyaları. `npm run data` hepsini çekip `src/data/*.json` olarak kusuyor. Site sadece statik JSON okuyor.

Şu anki ham veride (555 kayıt, site 536 gösteriyor, crawl görüntüden hep biraz önde):

| Kalite | Model |
|---|---|
| medium | 437 |
| high | 67 |
| low | 50 |

| Sample rate | Model |
|---|---|
| 22050 Hz | 486 |
| 16000 Hz | 47 |

22050 Hz'de 486 ses, Piper standardı. 16000 Hz'de 47 ses, gömülü için hızlı küçük sesler. Phonemizer 509 vakada `espeak`, oraya döneceğiz, sistemin kalbi bu.

### Kaynak, ya da her modelin neden bir dataseti var

PiperHub'u sadece liste olmaktan çıkarıp işe yarar yapan şey model <-> dataset bağı. Anasayfadan alınan örnek: **Astra - Valorant Piper TTS** sesi **Astra - LJSpeech Dataset**'e bağlı. İki sayfayı açıyorsun, iki tarafın repo ve lisanslarını kontrol ediyorsun.

Referans verilen 130 dataset. Katalog birliklerin durumu konusunda dürüst: 25 model `usable: false` işaretli (bozuk dosyalar ya da fork runtime isteyen `piperPlus` formatı). `pipertts` modülü bu sesleri sonradan tuhaf crash vermek yerine açık hatayla reddediyor. 48 model multi-speaker, ilgimizi çekecek ikisi dahil.

Rehber tarafında site işi üç adımda bitiriyor: **Build a dataset**, **Train a voice**, **Use a voice**, artı bir Piper Plus sayfası. Girdi olarak LJSpeech formatında dataset, çıktı olarak ONNX. Söylemesi kolay, yapması uzun, o yüzden sonraki bölüm.

## Kaputun altında Piper: VITS, espeak, ONNX

### Bir cümle, üç adım

Piper'dan "bonjour" demesini istediğinde olan şu:

```
"bonjour"
  -> [phonémisation espeak-ng] -> b O~ Z u R
  -> [encodeur VITS + flow + décodeur] -> waveform 22050 Hz
```

Ayrı vocoder yok. VITS bu demek: metinden (fonemlenmiş) doğrudan waveform'a giden uçtan uca tek model. Eski pipeline'lar metin -> spektrogram (Tacotron) sonra spektrogram -> ses (HiFi-GAN, iki model, iki eğitim) yaparken, VITS koşullu VAE, normalleştirici flow'lar ve decoder üzerinde GAN tarzı discriminator ile hepsini bir anda öğreniyor. Tek eğitim, tek model, tek ONNX export.

Decoder doğrudan 22050 Hz kusuyor. Bu sample rate'te bir saniye konuşma 22050 sayıya eşit. Model küçük (medium kalitede birkaç düzine MB) ve çıkarım saf CPU: optimize ONNX grafiği üzerinde matris çarpımları. Raspberry Pi'nin resmi hedef olmasının sebebi bu, Piper Rhasspy'de doğdu, Pi'de çalışmak için yapılmış açık kaynak sesli asistan.

### espeak-ng, bütün kirli işi yapan fonemleyici

VITS'ten önce metni fonemlere çevirmek gerek. 555 modelden 509'u `espeak` kullanıyor:

```bash
echo "bonjour" | espeak-ng --ipa -v fr
# bO~'ZuR
```

espeak-ng onlarca dilin telaffuzunu biliyor. VITS modeli `eau`'nun `o` diye okunduğu Fransızca imlayı hiç öğrenmiyor, fonemlerden sese öğreniyor. Bu eğitimi enorm şekilde basitleştiriyor ve Piper'ın neden 71 dili kapsadığını açıklıyor: yeni dil için uygun espeak sesini bağlıyorsun ve eğitiyorsun.

espeak'siz yapanların kendi fonemleyicisi var, burası egzotikleşiyor: `hebrew` (Nakdimon ONNX + 494 satır IPA kuralı), `pinyin` (polyphone belirsizliğini çözen tam BERT g2pW, aynı Çince karakter kelimeye göre farklı okunuyor), `thai` (değiştirilmemiş gerçek TLTK), `japanese` (lindera segmentasyon + UniDic). `pipertts` modülü yedisini de taşıyor, Python referansıyla birebir doğrulanmış. Oraya döneceğiz.

### Dataset: LJSpeech, hep LJSpeech

Standart eğitim formatı LJSpeech: kliplerle dolu `wavs/` klasörü artı `metadata.csv`:

```
LJ001-0001|Printing, in the only sense with which we are at present concerned...|printing in the only sense...
LJ001-0002|in being comparatively modern...|in being comparatively modern...
```

`fileid|transcription|normalized`, bir klip bir cümle, birkaç saniye. Orijinal dataset tek kadın konuşmacının okuduğu 13 000 İngilizce cümle, kamu malı. Fransızca ses eğitmek için aynı yapıyı Fransızca kaydediyorsun: hizalanmış metin + ses, düzgün medium için birkaç saat yeter, high için daha fazla.

Katalogdaki üç kalite kabaca model boyutu + eğitim süresine denk geliyor. Low: küçük, hızlı, robotik. Medium: tatlı nokta, 437 modelle. High: daha büyük, daha yavaş, daha doğal, Fortune'lar dahil 67 model.

### Üç sihirli düğme

Her Piper sesi üç çıkarım parametresi sunuyor, neredeyse evrensel varsayılanlarla:

```json
"inference": { "noise_scale": 0.667, "length_scale": 1, "noise_w": 0.8 }
```

- `noise_scale` (0.667): ses değişkenliği. Yüksekse daha etkileyici, düşükse daha stabil. Çıktı stokastik: aynı cümlenin iki sentezi biraz farklı iki ses veriyor.
- `noise_w` (0.8): zamanlama değişkenliği, ritim.
- `length_scale` (1.0): hız. 1'in üstü yavaşlatıyor, altı hızlandırıyor. Luna sinirlenince daha hızlı konuşturmanın en kolay yolu.

`noise_scale`'i aklında tut, duygular için lazım olacak.

## Fortune multi: 7 duygu, 1 ONNX

Tamam, yerel yıldıza geçelim.

Katalog ItsRealFortune'un eğittiği üç Fortune modelini listeliyor (selam):

| Model | Repo | Ses |
|---|---|---|
| ItsRealFortune - French (FR) High | `fox3000foxy/piper-fortune-v6` | 1 (voice-0) |
| ItsRealFortune - French (FR) **Multi** High | `fox3000foxy/piper-checkpoints-fortune-fr-multi` | **7** |
| ItsRealFortune - English (EN) **Multi** High | `fox3000foxy/piper-checkpoints-fortune-en-multi` | **7** |

FR multi şu:

```
normal, joyeuse, storytelling, colere, triste, surprise, interrogative
```

**Tek ONNX dosyasında** yedi duygusal varyasyon. EN multi aynı, isimlerde tarihi yazım hatasıyla: `surprised` yerine `suprised`. Ağırlıkların içinde, tutuyoruz, folklorun parçası.

### SpeakerId nasıl çalışıyor?

Multi-speaker VITS, ek bir girdili aynı model: speaker embedding. Eğitimde her klip stiliyle etiketleniyor, model gerisiyle aynı anda bir embedding tablosu (stil başına bir tane) öğreniyor. Çıkarımda tablonun satırını seçiyorsun:

```ts
import { PiperNativeTTS } from "pipertts";

const tts = await PiperNativeTTS.load({
  model: "hub:itsrealfortune-french-fr-multi-high",
  modelsDir: "./models",
});

const styles = [
  "normal", "joyeuse", "storytelling",
  "colere", "triste", "surprise", "interrogative",
];

for (let i = 0; i < styles.length; i++) {
  const r = await tts.synthesize("Quelle merveilleuse nouvelle !", {
    speakerId: i,           // 0 = normal ... 5 = surprise
    outputFile: `./fortune-${styles[i]}.wav`,
  });
}
```

Aynı cümle, yedi okuyuş. Biraz yükseltilmiş `noise_scale` ile `speakerId: 5` (surprise), inandırıcı bir ünlemin oluyor. Yavaşlatmak için `length_scale: 1.1` ile `speakerId: 4` (triste), cenaze duyurun hazır. Luna sesini böyle modüle ediyor: beyin duyguyu seçiyor (valence/arousal, centroid yazıma bak), TTS speakerId'yi seçiyor.

Arkasındaki dataset sade isimli **Fortune French - Dataset**, lisansın adı "Fortune's Café". Evet, lisansın adı kafe gibi. Hayır, değişmiyor.

### Neden ekonomik olarak akıllıca

Yedi duygu tek indirme, RAM'de tek yükleme, tek ONNX oturumu demek. Alternatif (yedi ayrı model) depolamayı katlar ve her duygu değişiminde grafiği yeniden yükletirdi, cümle ortasında ton değiştiren bot için oynanamaz. Burada `speakerId` tensörde bir indeksten ibaret. Marjinal maliyet: sıfır.

## Rakipler: Kokoro, PocketTTS, sanoTTS

Piper CPU'yu üç ciddi rakiplerle paylaşıyor, üç farklı felsefe.

### Kokoro 82M, fiyat performans kralı

[Kokoro](https://huggingface.co/hexgrad/Kokoro-82M), hexgrad'den. 82 milyon parametre, ISTFTNet decoder'lı değiştirilmiş StyleTTS 2 mimarisi, **difüzyon adımı yok**. Her şeyi yapan difüzyonun yokluğu: iteratif gürültü giderme döngüsü yok, yani ultra hızlı çıkarım.

| | Kokoro-82M |
|---|---|
| Params | 82M |
| Poids | ~300 Mo (164 Mo en FP16) |
| Licence | Apache 2.0 (commercial OK) |
| Langues | 8, 54 voix preset + blending |
| CPU | quasi temps réel |
| GPU | 36 à 96x temps réel |
| Tests aveugles | au niveau de Google et Amazon |

100 saatten az sesle yaklaşık 1000 dolara eğitildi, kör dinleyiciler onu Google ve Amazon'un premium sesleriyle aynı seviyeye koyuyor. Patlamasının sebebi bu: premium kalite, ücretsiz, yerel, permissif.

Piper'a karşı: Kokoro saf doğallıkta (StyleTTS 2 küçük VITS'ten iyi) ve lisansta kazanıyor (Piper için GPL-3.0 motora karşı Apache 2.0). Piper kapsamda (8'e karşı 71 dil, 54 sese karşı 3755 speaker) ve topluluk ses ekosisteminde kazanıyor. İngilizce anlatım için Kokoro'yu yenmek zor. 7 duygulu Fransızca, Türkçe ya da Swahili için Piper genelde tek yarışmacı.

### PocketTTS (Kyutai), CPU'da klonlama

[Kyutai](https://kyutai.org/tts/) başka telden çalıyor: CPU'da çalışan **ses klonlamalı** küçük model.

| Model | Params | WER | UTMOS | SIM | CPU hızı (1 thread) |
|---|---|---|---|---|---|
| Pocket TTS | ~100M | 0.92% | 4.364 | 0.923 | 2.8x temps réel |
| Pocket TTS small | 1.9M / 6.9M / 18.2M | - | - | - | CPU, clonage inclus |

WER %1'in altında (doğru telaffuz ediyor), UTMOS 4.36 (mükemmel algılanan kalite), SIM 0.923 (klon hedefe gerçekten benziyor). Small sürümler klonlama dahil **1.9M parametreye** iniyor. 1.9M. Sabaki router'ım JSON olarak neredeyse bu boyutta.

Piper'a karşı: PocketTTS klonlamada kazanıyor (Piper sabit seslerle okuyor) ve flagship kompaktlığında. Piper dillerde kazanıyor (small şimdilik sadece İngilizce) ve ekosistem olgunluğunda (kendin eğit'e karşı hazır 536 ses).

### sanoTTS, 3 dolarlık çipe sığan model

[sanoTTS](https://github.com/ampixa/sanoTTS) (Nepalcede `sano` "küçük" demek), TTS'in Bareiron'u: fonemlerden 22.05 kHz PCM'e giden tam nöral stack **mikrodenetleyicide**.

| Sistem | Params | SCOREQ | UTMOS | DNS-SIG |
|---|---|---|---|---|
| sanoTTS (heart-nano) | 0.29M | 2.29 | 2.45 | 3.35 |
| TinyTTS | 1.62M | 3.94 | 3.65 | 3.62 |

0.29M parametre. Ses başına 2 MB. `pip install sanotts`, `sanotts say "Hello" --voice amy`, konuşuyor. Tarayıcıda da.

Ama skorlara bak: TinyTTS'in 3.94'üne karşı SCOREQ 2.29, UTMOS 2.45. Konuşuyor, evet. Şarkı söylemiyor, hayır. Nihai tradeoff bu: 0.29M'de her yere sığarsın ama kalite boyutu takip ediyor. Piper medium başka ligde ses için 100 kat ağırlık demek.

### Özet tablo

| | Piper | Kokoro 82M | PocketTTS | sanoTTS |
|---|---|---|---|---|
| Params typiques | ~10-60M | 82M | ~100M / 2-18M | 0.3-1.4M |
| Langues | 71 | 8 | EN (+ smalls EN) | multilingue, petit |
| Voix dispos | 3755 speakers | 54 + blending | clonage (la tienne) | quelques voix |
| Clonage | non | non (natif) | **oui, CPU** | non |
| Licence moteur | GPL-3.0 | Apache 2.0 | open (Kyutai) | open |
| Entraînable maison | oui (LJSpeech) | oui (plus lourd) | oui | oui |
| Qualité FR | bonne (multi émotions) | correcte (EN-first) | EN-only | faible |

Seçim kısıtına bağlı, mutlak kazanan yok: saf EN kalitesi Kokoro. CPU klonlama PocketTTS. Mikrodenetleyici sanoTTS. Dil kapsamı + duygulu Fransızca sesler + sıfır altyapı Piper.

## ElevenLabs, faturalı Goliath

Bir de ElevenLabs var. 70+ dil, audio tag'li ve dramatik diyaloglu etkileyici Eleven v3, kör testlerde top kalite. TTS'in Jev'i gibi bir şey: herkes görmüştür, herkes karşılaştırmıştır.

2026 fiyatlandırması, yuvarlak rakamlarla:

| API Modeli | Fiyat / 1000 karakter |
|---|---|
| Flash / Turbo, v3 Conversational | $0.05 |
| Multilingual v2, Eleven v3 | $0.10 |

1000 karakter yaklaşık 1 dakika ses yapıyor. Yani dakika başına $0.05 ila $0.10. 99 dolarlık Pro plan yaklaşık 990k karakter içeriyor, aşım aynı tarifeden vuruyor. Seslendirmeli günde bir video çıkaran YouTube kanalı için (benim `valorant-short-maker`'ım tam bunu yapıyor ama ücretsiz Piper ile), günlük her seslendirme dakikası için ayda $1.50 ila $3 hesapla. Günde on dakika: ayda $15 ila $30. Ödenir ama sayılır.

Ne zaman değer: sesin ta kendisi ürün olduğunda (dublaj, sesli kitap, reklam), yarın sabah 70 dil lazım olduğunda, klonlamanın ilk seferde mükemmel olması gerektiğinde. Buna karşılık şunlar için asla değmez: bütün gece konuşan Discord botu, dahili bildirimler, dev, patlayan hacimler. ElevenLabs ile sabah 3'te hayatını anlatan Luna, ağlayan elektrik faturam demek.

Hesap basit: Piper sıfır marjinal euro, "iyi" kalite. ElevenLabs dönen sayaç, "mükemmel" kalite. Arada "iyi ve ücretsiz"in kazandığı bir dünya var, PiperHub'un bütün iddiası bu.

## pipertts: natif neden Python wrapper'a 10 kat fark atıyor

Repo [itsrealfortune/pipertts](https://github.com/itsrealfortune/pipertts), 75 commit: Piper'ın TypeScript'e natif portu. README başlığı: "In-process Piper TTS for Node.js. No Python required."

### Spawn maliyeti

Tarihi wrapper (`PiperTTS`), **her sentezde** alt süreçte spawn edilen `python3 -m piper`:

```
synthèse = spawn(python) + chargement du modèle + inférence + kill
```

Her cümle yorumlayıcı başlatma + ağırlık yükleme ödüyor. `en_US-lessac-medium` üzerinde ölçüldü: **satır başına yaklaşık 2.2 sn**.

Natif (`PiperNativeTTS`) ONNX oturumunu bellekte **sıcak tutuyor**:

```
load une fois -> session persistante -> inférence par phrase
```

Aynı şekilde ölçüldü: **satır başına yaklaşık 0.22 sn**. 10 kat buradan geliyor: spawn ve reload'u öldürüyoruz, mucizevi çıkarımın bununla alakası yok. ONNX çıkarımının kendisi iki tarafta da aynı.

Bonus, ilk yükleme optimize grafiği `.onnx` yanına cache'liyor (`<model>.ortopt-<platform>-<arch>-v<ort>.onnx`), sonraki yüklemeleri yaklaşık %35 hızlandırıyor. Cache anahtarı platform, arch ve ORT sürümünü birleştiriyor, model değişirse tazeleniyor. `cacheOptimizedModel: false` ile kapatılabilir.

### espeak köprüsü: 0.4ms'ye karşı 15ms

Fonemleme için aynı mantık. Wrapper cümle başına CLI ile `espeak-ng` binary'sini çağırıyor: her seferinde yaklaşık 15ms spawn. Natif N-API bridge gömüyor (`src/native/espeak-bridge/`, `espeakbridge.c` portu), Linux x64/arm64 prebuild'leriyle: **çağrı başına yaklaşık 0.4ms**, bayt bayt aynı fonemler. Addon yoksa CLI'ye otomatik düşüyor. CLI'yi zorlamak için `PIPER_ESPEAK_BRIDGE=0`.

### 7 phoneme_type, hepsi taşındı

| Tür | Motor | Notlar |
|---|---|---|
| `espeak` | bridge N-API ou CLI | clauses byte-identiques |
| `text` | passthrough codepoints | trivial |
| `hebrew` | Nakdimon ONNX + règles IPA | sorties identiques |
| `lithuanian` | espeak + dico de stress 189k entrées | sorties identiques |
| `pinyin` | BERT g2pW ONNX + WordPiece | désambiguïsation des polyphones OK |
| `thai` | vrai TLTK non modifié sous Pyodide/WASM | 7/7 identiques (1er appel lent, suite rapide) |
| `japanese` | lindera-wasm + UniDic + moteur de mores TS | segmentation exacte, **pas d'accent lexical** |

Arapça otomatik harekeleniyor (tashkeel, kapatılabilir). Katalogdaki 509 espeak sesi hızlı köprüden geçiyor, egzotikler özel motoruyla. Suite'te 71 test, tıkandığı yerde kısıt belgeli (Japonca vurgu, UniDic veri vermiyor, kabul edildi, gizlenen bir şey yok).

### Formatlar ve streaming

Varsayılan `wav`, `raw` PCM, `mp3`, `ogg`, `opus`: varsa ffmpeg, yoksa saf JS fallback'ler (mp3 için lamejs, opus için opusscript + Ogg muxer, kaynakla 0.993 korelasyon). Ve özellikle `synthesizeChunks()`: cümleler arası `sentenceSilence` ile cümle başına veren async generator. Luna için bu, son sentezlenirken sesi oynatmaya başlamak demek, özel sunucusuz TTS streaming.

PiperHub kataloğu entegre tam kullanım (`hub:` + yazar reposu dosyaları sunmuyorsa otomatik ayna fallback):

```ts
const tts = await PiperNativeTTS.load({
  model: "hub:glados-french-medium-voice",
  modelsDir: "./models",
});

const r = await tts.synthesize("Bonjour, je suis GLaDOS.", {
  outputFormat: "ogg",   // Discord için direkt
  lengthScale: 0.95,     // biraz daha hızlı
});
```

Resmi manifestte yok topluluk sesleri (GLaDOS ve oyun karakterleri), PiperHub'un var olma sebebi tam bu, `pipertts` de bunu iyi biliyor: `hub:<slug>`, piperhub sayfa URL'si ya da çıplak slug, hepsi çalışıyor. `usable: false` işaretli sesler açık hatayla reddediliyor.

## Nelerden vazgeçildi

Eksik her özellik bir başkasını finanse ediyor. Dürüst liste:

**Piper ElevenLabs yanında robotik geliyor.** 22050 Hz'de VITS medium temiz ama büyük etkileyici modele kıyasla düz. Multi-duygu kısmen telafi ediyor (düz 1 stilden iyi 7 stil), ama ElevenLabs v3 sesli kitap üstte kalıyor. Onlarca MB'nin bedeli bu.

**espeak yanlış okuyor.** Özel isimler, İngilizce alıntılar, kısaltmalar: kurallı fonemlemenin kör noktaları var. Fransızca "Spoiler"ı espeak elinden geldiğince okuyor. Nöral G2P'li büyük modeller daha az çuvallıyor. Prod'da iş terimleri için istisna sözlüğü gerek.

**Sıfır natif klonlama.** Piper sabit seslerle okuyor. SENİN sesini istiyorsan istikamet PocketTTS ya da ElevenLabs. Multi-speaker varyasyon veriyor, tınıını asla.

**Japonca sözlüksel vurgusuz kalıyor.** UniDic vurgu verisi vermiyor, segmentasyon tam ama melodi yaklaşık. README'de belgeli, halının altına süpürülen bir şey yok.

**Tayca ilk çağrıda sürünüyor.** TLTK değiştirilmemiş Pyodide/WASM altında çalışıyor: ilk çağrı saniyeler sürüyor (yükleme), sonrakiler hızlı. Referansla 7/7 aynı ama ısınma öngör.

**Veriler aç.** Düzgün high ses hizalanmış temiz ses saatleri istiyor. Fortune dataseti saatlerce kayıt + temizlik demek. Sihir yok: çöp girer, robot çıkar.

**Katalogda ölü sesler var.** 25 model `usable: false` işaretli. Kabul edildi ve filtrelendi ama ses crowdsourcing'inin terk crowdsourcing'i de olduğunu hatırlatıyor.

## Nihai sonuç

Bir yanda ElevenLabs sayacı, öbür yanda Raspberry Pi:

- PiperHub: görüntülenen 536 model, 71 dil, 3755 speaker, bağlı 130 dataset, dataset -> training -> usage rehberleri
- Piper: uçtan uca VITS, espeak, ONNX CPU, LJSpeech, low/medium/high, standart 22050 Hz
- Fortune multi: 7 FR + 7 EN duygu, her biri 1 ONNX, geçiş için `speakerId`, "Fortune's Café" lisansı
- Kokoro 82M: premium EN kalite, Apache 2.0, 54 ses, neredeyse gerçek zamanlı CPU
- PocketTTS: CPU klonlama, yaklaşık 100M sonra 2-18M, WER %0.92
- sanoTTS: 0.29M, 2 MB, mikrodenetleyici, boyutu takip eden kalite
- ElevenLabs: $0.05-0.10/1000 karakter, 70+ dil, top kalite, dönen sayaç
- natif pipertts: wrapper ~2.2 sn/satıra karşı ~0.22 sn/satır, espeak köprüsü 0.4ms, 7 phoneme_type, wav/raw/mp3/ogg/opus, cümle başına streaming

Luna her gün bununla konuşuyor. 0 euro TTS, beyinle yönetilen duygular, Discord için direkt OGG. ElevenLabs karşısında duyuluyor, tabii. Ama sabah 3'te hayatını anlatmaya karar verdiğinde faturam mışıl mışıl uyuyor.

## Felsefe

p2r3 demişti: *"J'aime juste l'idée que cette toute petite puce à 1 balles puisse faire tourner quelque chose d'aussi avancé que Minecraft."*

Burada aynı kafa, sese uygulanmış: birkaç düzine MB ONNX'un Raspberry Pi'yi bulut olmadan, hesap olmadan, sayaç olmadan 71 dilde konuşturması fikrini seviyorum. Hiçbir dublaj stüdyosunun yerini tutmadığı açık. Tutulduğu yer, yerel, ücretsiz, gece seni ücretlendirmeden konuşan düzgün ses istediğin gıcık durum.

Tradeoff'lar, beyaz üstüne siyah yazılmış:
- premium kalite -> küçük VITS: biraz robotik ama yerel ve ücretsiz
- duygu başına bir model -> speakerId: RAM'de bir fiyatına 7 ses
- Python spawn -> kalıcı oturum: 10 kat hızlı, kurulacak Python yok
- vahşi katalog -> bağlı kaynak: her ses nereden geldiğini ve hâlâ çalışıp çalışmadığını biliyor
- faturalı API -> sıfır marjinal euro: ElevenLabs'tan çirkin ama fatura mışıl uyuyor

**Akılda kalacak 3 şey:**

1. **Piper CPU'nun TTS'i** - VITS + espeak + ONNX, 71 dil, Pi'de çalışan onlarca MB'lık sesler. ElevenLabs'tan çirkin, sonsuz ucuz.
2. **Fortune multi biri fiyatına 7 duygu** - tek ONNX, geçiş için `speakerId`, FR + EN. 7 model yerine speaker embedding.
3. **Natif spawn'ı öldürüyor** - `pipertts` ONNX oturumunu sıcak tutuyor: 2.2 sn/satıra karşı 0.22 sn/satır, 15ms CLI'ye karşı 0.4ms espeak köprüsü. Aynı çıkarım, 10 kat az bekleme.

Proje ilgini çekerse katalog [piperhub.org](https://piperhub.org/) adresinde, site kodu [github.com/fox3000foxy/piper-bank](https://github.com/fox3000foxy/piper-bank) adresinde, natif modül [github.com/itsrealfortune/pipertts](https://github.com/itsrealfortune/pipertts) adresinde. Luna'nın sabah 3'te hayatını anlatmasını dinlemek istersen Discord'da görüşürüz xD
