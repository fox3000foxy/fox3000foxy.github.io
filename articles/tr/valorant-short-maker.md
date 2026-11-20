---
title: "valorant-short-maker: Valorant shortlarımı kendi kendine üreten pipeline"
description: "Senaryo için Groq/Llama, sesler için Piper, geri kalan her şey için FFmpeg. Bir cron işinin @valorant_agents üzerinde baştan sona günde bir video üretip yayınlaması."
date: 2026-07-14
tags:
  - typescript
  - ffmpeg
  - automation
  - ai
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "XKCD0ixdKfU5C6R/64+5mHiZRMU3QKb7X2Ez4bxzr9z8/zrvJOVHv/kEixvlOPLHDabJRy5vvDQnZJpe9mV33Q=="
---

# valorant-short-maker: Valorant shortlarımı kendi kendine üreten pipeline

Birkaç aydır bir YouTube kanalı ben elimi sürmeden dönüyor: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop). İki round arasında birbirine laf sokan Valorant ajanları, seslendirilmiş, karaoke altyazılı, Shorts olarak yayınlanmış. Her şey [`valorant-short-maker`](https://github.com/fox3000foxy/valorant-short-maker) tarafından üretiliyor, cron ile çalışan ve kimsenin hiçbir şeye tıklamasına gerek kalmadan yayınlayan bir TypeScript/Bun pipelineı.

İşte adım adım nasıl çalıştığı.

## Ortaya çıkan şey

"Duelist Debate" (Phoenix, Yoru ve Jett) için üretilen videodan çıkarılmış üç kare:

![Bir short introsu, sahne başlıklı ajan çemberi](/images/valorant-short-maker/vsm-01-intro.png)

![Devam eden bir replik, aydınlanan karaoke altyazısı](/images/valorant-short-maker/vsm-02-dialogue.png)

![Başka bir replik, altyazının rengi ajana göre değişiyor](/images/valorant-short-maker/vsm-03-dialogue.png)

Canlı sonuç bu Shortta: [Duelist Debate: youtube.com/shorts/SX5Kme58aLU](https://www.youtube.com/shorts/SX5Kme58aLU). Kanalda Shortlar 1,2 ila 1,5k izlenme civarında dönüyor. Muazzam bir şey değil ama kanal başından beri kendi kendine dönüyor, o yüzden gerçekten önemli olan sayı sıfır: cron başlatıldığından beri üzerine harcanan sıfır dakika.

## Pipeline, sırasıyla

### 1. Senaryoyu yazmak: Groq + Llama 3.3

Her run mevcut 26 ajan arasından rastgele 3 ila 4 ajan seçer ve Groq üzerinden Llama 3.3 70B modeline, sahnede bulunan her seçili ajan için kişiliğinin ve diğer ajanlarla ilişkilerinin kompakt bir özetini içeren bir sistem istemi gönderir (bu personalar `src/lore/` içinde yaşar, ajan başına bir dosya). İstem kesin kurallar dayatır: replik başına kısa ve çarpıcı tek cümle, karakterler arasında adil dönüş, öncelik mizahta ve hepsinden önemlisi duraklamalarda.

Somut bir örnek "Duelist Debate" ile: hangisinin duelist oynayacağını tartışan Phoenix, Yoru ve Jett, 6 Temmuz 2026da üretildi:

```
phoenix: I'm telling you, I've got the skills to play duelist this match.
yoru: Skills, you call burning things skills, Phoenix.
jett: I'm the fastest one here, I should play duelist.
phoenix: Fastest, but can you handle the heat, Jett [0.3] I doubt it.
yoru: Heat, ha, you think your flames are hotter than my rifts.
jett: This isn't about heat or flames, it's about speed and agility.
phoenix: Oh, I see, so now you're an expert on duelists, Yoru [0.3] that's rich.
yoru: At least I don't rely on cheap fire tricks.
jett: Cheap fire tricks, that's what you call Phoenix's abilities.
phoenix: Hey, my fire tricks have gotten us out of tight spots before [0.3] can't say the same for your rifts, Yoru.
yoru: Tight spots, you mean like the time I rifted us out of that trap.
jett: Enough, this is getting nowhere, let's just decide already.
phoenix: Fine, but I'm still saying I'm the best duelist here.
yoru: Please, you think you can take on the enemy team alone [0.3] I doubt it.
jett: I can take them on, no problem, I'm the fastest.
phoenix: Fastest, yeah, but can you outmaneuver them [0.3] that's the question.
yoru: Outmaneuver, ha, you think you can outmaneuver anyone, Phoenix.
jett: This is stupid, we're not going to agree on this.
phoenix: Fine, let's just play and see who comes out on top [0.3] I'm game if you are.
yoru: Bring it on, I'll show you what a real duelist looks like.
jett: I'm not backing down, I'm playing duelist.
phoenix: Oh, this should be good [0.3] let's see how you two do.
yoru: We'll see who comes out on top, won't we, Jett.
jett: Yeah, let's end this debate once and for all.
pause: 0.3
phoenix: Alright, let's get started then [0.3] may the best duelist win.
yoru: I'll make sure to burn you, Phoenix, not with fire, but with my rifts.
jett: I'll take you both down, no problem.
```

Duraklamalar ritmi doğal yapan detay: bir repliğin ortasına yerleştirilen `[0.3]`, ekrandaki ajan çemberini kesmeden ses dosyasında 0.3 saniyelik sessizlik yaratır, oysa tek başına bir `pause: 1.0` satırı iki konuşmacı arasında çember gizlenmiş gerçek bir sessizlik yaratır. Bunlar olmadan nefes almadan replikleri zincirleyen bir TTS robotik duyulur.

### 2. Ses vermek: Piper, ajan başına bir model

Her ajanın özel olarak eğitilmiş kendi Piper modeli (`.onnx`) vardır, `voices/<ajan>/` içinde saklanır. Üretilen metin ilgili modelden geçer ve bir WAV çıkar. Bu, genel olarak özel ses eğitimi için kullandığım teknolojinin aynısı (Piper/Kaggle pipelineı hakkındaki makaleye bak): burada doğrudan prod ortamında, anında, her video üretiminde uygulanmış.

### 3. Karaoke altyazıları: üretilmiş ASS, ikondan çıkarılan renk

Altyazı basit bir `.srt` değil. Kelime kelime üretilmiş bir `.ass` (Advanced SubStation Alpha) dosyası, karaoke efektli: her kelime telaffuz edildikçe bir vurgu renginde aydınlanır, metnin geri kalanı nötr bir renkte kalır. Vurgu rengi sabit değil: konuşan ajanın ikonundan dinamik olarak çıkarılır (bir Python scripti ikonun PNGsi üzerinde PIL çalıştırır, saydam olmayan pikselleri örnekler ve baskın renkleri döndürür). Sonuç: Killjoyun altyazısı mor, Jettinki mavi yeşil aydınlanır ve hiçbir renk bir yerde sabit kodlanmamıştır.

### 4. Sese tepki veren çember: kare başına bir FFmpeg ifadesi

Bu pipelineın en çarpık kısmı ve muhtemelen en gurur duyduğum kısım. Konuşan ajanın yuvarlak ikonu statik kalmaz: kendi sesinin ritmiyle hafifçe büyüyüp küçülür.

Hesap, repliğin ham WAV dosyasını okuyarak, 60 fps ile kare kare RMS zarfını (root mean square, sinyal enerjisinin bir ölçüsü) hesaplayarak, maksimuma göre normalize ederek, sonra sarsıntıları önlemek için 3 karelik bir pencerede yumuşatarak yapılır. Her zarf değeri sonra `MAX_ZOOM_VARIATION` (0.2, yani temel boyutun ±%20si) ile sınırlı bir ölçek faktörüne dönüştürülür.

Bu hesabın sonucu pikselleri manipüle eden bir kodla uygulanmaz: doğrudan video filtresinin `scale` parametresini süren devasa bir koşullu FFmpeg ifadesine (`lt(n,K)*val + between(n,K,K')*val + ...`, kare grubu başına bir dal) çevrilir. FFmpeg bu ifadeyi renderın her karesinde değerlendirir. 60 fps ile birkaç saniyelik bir replik için bu tek bir ifadede hızla yüzlerce dal yapar, o yüzden derinliği sınırlamak için kareleri gruplayan `STEP` parametresi vardır.

### 5. Parça parça render, sonra introda balıkgözü

Her replik tek tek render edilir: video arka planı (`bg-video/` içindeki oynanış kliplerinden rastgele alıntı, doğru süreye kesilmiş), üstte sese tepki veren zoom ile ajan çemberi, FFmpegin `ass` filtresiyle gömülü altyazılar, arka planda oynanış sesiyle karıştırılmış TTS sesi.

En ilk parça özel bir işlem görür: ilk %20 kare üzerinde giderek çözülen bir balıkgözü bozulması (kare kare değerlendirilen `lenscorrection` filtresi artı bitişik kareleri karıştırıp hareket bulanıklığı simüle eden bir `tmix=frames=3`), bir "whoosh" sesiyle senkronize. Kameranın sahnenin içine "girdiği" izlenimini veren intro geçişi bu.

### 6. Birleştirme ve final miksaj

Tüm parçalar uç uca birleştirilir, arka plan müziği (Sneaky Snitch, Kevin MacLeod, Creative Commons lisansı) **ses ducking** ile üstüne karıştırılır: bir ajan konuşurken müziğin sesini otomatik kısan, sessizliklerde yükselten bir sidechain kompresörü. Her şey baştan sona 60 fps döner, adımlar arasında kare hızı dönüşümü yok.

### 7. Otomatik yayın

Klasik bir cron tarafından çalıştırılan `run-cron.sh` scripti Python ortamını etkinleştirir, `.env` dosyasını yükler ve `bun src/workflow.ts --upload` komutunu çalıştırır. `--upload` bayrağı ayrıca meta veri üretimini (başlık, açıklama, etiketler) tetikler ve iki ayrı script üzerinden YouTube ve Instagramda videoyu yayınlayan `uploaders/upload.py` dosyasını çağırır (`uploaders/youtube/upload.py` ve `uploaders/instagram/`). LLM isteminden çevrimiçi videoya tüm zincir insan müdahalesi olmadan döner.

## Neden tamamen Python bir şey yerine TypeScript/Bun

Seçim ideolojik değil: Bun, FFmpegi alt süreç olarak sürmek için `Bun.spawn` üzerinden doğrudan ve hızlı erişim, pipeline veri yapıları üzerinde güçlü tipleme (`Phrase`, `SegmentInfo`) ve X saatte bir cronda dönen bir script için Nodetan belirgin şekilde daha hızlı başlatma süresi verir. Projedeki iki Python parçası gerçekten Pythonın en iyi donanımlı olduğu yerlerdedir: renk çıkarma için PIL ve yükleme APIleri (YouTube için `google-api-python-client`, IG için Instagram Graph API yığını).

## Bunun gösterdiği şey

Bu proje bugün tamamen ücretsiz ya da açık kaynak tuğlalarla neler inşa edilebileceğinin güzel bir örneği: Groq API üzerinden hızlı ve ücretsiz bir LLM, adanmış GPU olmadan çalışan yerel bir TTS motoru, tüm video render için FFmpeg, ve tutkal olarak sadece birkaç yüz satır TypeScript. Bu tuğlaların hiçbiri tek başına yeni değil. Pipelineı yapan şey düzenlenişi: gerçek karakter ilişkileriyle tutarlı bir senaryo üretmek, onu doğal duraklamalarla etkileyici sese dönüştürmek, görsel renderı bu sesin enerjisine kare kare senkronize etmek ve tüm zinciri yayına kadar otomatikleştirmek.

---

**Kaynaklar**

- **Repo**: [github.com/fox3000foxy/valorant-short-maker](https://github.com/fox3000foxy/valorant-short-maker)
- **Kanal**: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)

**3 kilit nokta**

1. Senaryo önceden yazılmış şaka listesinden değil, ajan başına personalar ve ilişkilerle bir LLM (Groq/Llama 3.3) tarafından üretilir.
2. Ajan çemberinin zoomu klasik keyframe animasyonuyla değil, WAVın RMS zarfından kare kare hesaplanan bir FFmpeg ifadesiyle sürülür.
3. İstemden YouTube/Instagram gönderisine tüm zincir insan müdahalesi olmadan tek bir cron işiyle döner.
