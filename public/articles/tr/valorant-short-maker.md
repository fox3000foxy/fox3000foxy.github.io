---
title: "valorant-short-maker: Valorant short'larımı kendi kendine üreten pipeline"
description: "Groq/Llama senaryo için, Piper sesler için, FFmpeg geri kalan her şey için. Bir cron işi @valorant_agents'te A'dan Z'ye günde bir video nasıl üretip yayınlıyor."
date: 2026-07-14
tags:
  - typescript
  - ffmpeg
  - automation
  - ai
authors:
  - fox3000foxy
---

# valorant-short-maker: Valorant short'larımı kendi kendine üreten pipeline

Birkaç aydır, hiç dokunmadığım halde kendi kendine çalışan bir YouTube kanalı var: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop). Valorant ajanları rauntlar arasında birbirine laf sokuyor, seslendiriliyor, karaoke altyazılı, Shorts olarak yayınlanıyor. Her şeyi [`valorant-short-maker`](https://github.com/fox3000foxy/valorant-short-maker) üretiyor; cron'da çalışan, kimsenin hiçbir şeye tıklamasına gerek kalmadan yayın yapan bir TypeScript/Bun pipeline'ı.

İşte adım adım nasıl çalıştığı.

## Ortaya çıkan şey

"Duelist Debate" (Phoenix, Yoru ve Jett) için üretilen videodan alınmış üç kare:

![Short girişi, ajan dairesi ve sahne başlığı](/images/valorant-short-maker/vsm-01-intro.png)

![Devam eden bir replik, karaoke altyazı parlıyor](/images/valorant-short-maker/vsm-02-dialogue.png)

![Başka bir replik, konuşan ajana göre altyazı rengi değişiyor](/images/valorant-short-maker/vsm-03-dialogue.png)

Bu Short'un canlı hali: [Duelist Debate — youtube.com/shorts/SX5Kme58aLU](https://www.youtube.com/shorts/SX5Kme58aLU). Kanaldaki Short'lar 1,2 ila 1,5k civarında izleniyor. Devasa rakamlar değil, ama baştan beri tamamen kendi başına dönen bir kanal olduğu için asıl önemli sayı sıfır — cron başlatıldıktan sonra üzerinde harcanan sıfır dakika.

## Pipeline, sırasıyla

### 1. Senaryoyu yazmak — Groq + Llama 3.3

Her çalıştırmada 26 ajandan rastgele 3–4 tanesi seçilir ve Llama 3.3 70B'ye (Groq üzerinden) bir sistem prompt'u gönderilir. Bu prompt, seçilen her ajan için kişiliğinin ve sahnedeki diğer ajanlarla ilişkilerinin kompakt bir özetini içerir (bu personalar `src/lore/` altında, ajan başına bir dosya halinde durur). Prompt katı kurallar dayatır: replik başına kısa ve vurucu bir cümle, karakterler arasında adil dönüşüm, mizah öncelikli ve hepsinden önemlisi — duraklamalar.

"Duelist Debate" ile somut örnek — Phoenix, Yoru ve Jett kimin duelist oynayacağını tartışıyor, 6 Temmuz 2026'da üretildi:

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

Duraklamalar ritmi doğal kılan ayrıntıdır: repliğin ortasına yerleştirilen `[0.3]`, ekrandaki ajan dairesini kesmeden seste 0,3 saniyelik bir sessizlik yaratırken, başlı başına bir `pause: 1.0` satırı iki konuşmacı arasında gerçek bir sessizlik yaratır, daire gizlenir. Bunlar olmadan, nefes almadan replikleri art arda okuyan bir TTS robot gibi duyulur.

### 2. Ses vermek — Piper, ajan başına bir model

Her ajanın kendine özel eğitilmiş bir Piper modeli (`.onnx`) vardır, `voices/<agent>/` altında saklanır. Üretilen metin ilgili modelden geçer, çıktı bir WAV olur. Genel olarak özel ses eğitimi için kullandığım teknolojinin aynısı (Piper/Kaggle pipeline yazısına bakın) — burada doğrudan production'da, anında, her video üretiminde uygulanıyor.

### 3. Karaoke altyazılar — ASS üretiliyor, renk ikondan çekiliyor

Altyazı basit bir `.srt` değil. Kelime kelime üretilmiş bir `.ass` (Advanced SubStation Alpha) dosyası, karaoke efektiyle: her kelime söylendikçe bir renkte parlıyor, metnin geri kalanı nötr bir renkte kalıyor. Vurgu rengi sabit değil — konuşan ajanın ikonundan dinamik olarak çekiliyor (bir Python betiği ikonun PNG'si üzerinde PIL çalıştırıyor, şeffaf olmayan pikselleri örnekliyor ve baskın renkleri döndürüyor). Sonuç: Killjoy'un altyazısı mor, Jett'inki turkuaz parlıyor, hiçbir yerde tek bir renk bile hardcode edilmemiş.

### 4. Sesle tepkili daire — kare başına bir FFmpeg ifadesi

Bu, pipeline'ın en çetrefilli kısmı ve muhtemelen en gurur duyduğum yer. Konuşan ajanın yuvarlak ikonu sabit durmuyor: kendi sesinin ritmine göre hafifçe zoom yapıyor.

Hesaplama, repliğin ham WAV'ini okuyor, 60 fps'de kare kare RMS zarfını (root mean square, sinyal enerjisinin bir ölçüsü) hesaplıyor, maksimuma göre normalize ediyor, ardından sarsıntıyı önlemek için 3 karelik bir pencerede yumuşatıyor. Her zarf değeri daha sonra `MAX_ZOOM_VARIATION` (0,2, yani taban boyutun ±%20'si) ile sınırlanmış bir ölçek faktörüne dönüştürülüyor.

Bu hesaplamanın sonucu piksel manipüle eden kodla uygulanmıyor — dev bir FFmpeg koşullu ifadesine çevriliyor (`lt(n,K)*val + between(n,K,K')*val + ...`, kare grubu başına bir dal) ve doğrudan video filtresinin `scale` parametresini sürüyor. FFmpeg bu ifadeyi render'ın her karesinde değerlendiriyor. 60 fps'de birkaç saniyelik bir replik için, tek bir ifadede yüzlerce dal oluşuyor — bu yüzden kareleri gruplayarak derinliği sınırlayan `STEP` parametresi var.

### 5. Segment segment render, ardından intro'da fisheye

Her replik ayrı ayrı render ediliyor: video arka planı (`bg-video/` içinden rastgele bir oynanış klibi, doğru süreye kırpılmış), üstüne sesle tepkili zoom ile ajan dairesi, FFmpeg'in `ass` filtresiyle yakılan altyazılar, arka plan oynanış sesiyle karıştırılan TTS sesi.

İlk segment özel bir işlem görüyor: ilk %20 karede kademeli olarak kaybolan bir fisheye bozulması (kare kare değerlendirilen `lenscorrection` filtresi, artı motion blur simülasyonu için bitişik kareleri harmanlayan `tmix=frames=3`), bir "vuuş" ses efektiyle senkronize. Bu, kameranın sahneye "girdiği" hissini veren intro geçişi.

### 6. Birleştirme ve son miks

Tüm segmentler uç uca ekleniyor, arka plan müziği (Sneaky Snitch, Kevin MacLeod, Creative Commons lisansı) **audio ducking** ile üste karıştırılıyor — bir sidechain kompresyon, bir ajan konuşurken müziğin sesini otomatik olarak kısıyor ve sessizliklerde geri yükseltiyor. Her şey baştan sona 60 fps'de dönüyor, adımlar arasında kare hızı dönüşümü yok.

### 7. Otomatik yayın

Standart bir cron tarafından başlatılan `run-cron.sh` betiği, Python ortamını etkinleştiriyor, `.env`'i yüklüyor ve `bun src/workflow.ts --upload` komutunu çalıştırıyor. `--upload` bayrağı ayrıca meta veri üretimini (başlık, açıklama, etiketler) tetikliyor ve iki ayrı betik (`uploaders/youtube/upload.py` ve `uploaders/instagram/`) aracılığıyla videoyu YouTube ve Instagram'da yayınlayan `uploaders/upload.py`'ı çağırıyor. LLM prompt'undan videonun çevrimiçi olmasına kadar tüm zincir, insan müdahalesi olmadan çalışıyor.

## Neden tamamen Python yerine TypeScript/Bun

Bu seçim ideolojik değil — Bun, FFmpeg'i alt süreç olarak sürmek için `Bun.spawn`'a doğrudan ve hızlı erişim, pipeline'ın veri yapılarında (`Phrase`, `SegmentInfo`) güçlü tipleme ve birkaç saatte bir cron'da çalışan bir betik için Node'dan çok daha hızlı başlayan bir çalışma zamanı sunuyor. Projedeki tek iki Python parçası, Python'ın gerçekten en iyi araç olduğu yerlerde: renk çıkarma için PIL ve yükleme API'leri (YouTube için `google-api-python-client`, IG için Instagram Graph API yığını).

## Bu neyi gösteriyor

Bu proje, bugün tamamen ücretsiz veya açık kaynak yapı taşlarıyla neler inşa edilebileceğinin iyi bir örneği: Groq API üzerinden hızlı ve ücretsiz bir LLM, özel GPU olmadan çalışan yerel bir TTS motoru, tüm video render için FFmpeg — ve bağlayıcı sadece birkaç yüz satır TypeScript. Bu yapı taşlarının hiçbiri tek başına yeni değil. Pipeline'ı yapan şey düzenleme: gerçek karakter ilişkileriyle tutarlı bir senaryo üretmek, onu doğal duraklamalarla ifadeli bir sese dönüştürmek, kare kare o sesin enerjisine görsel bir render senkronize etmek ve yayına kadar tüm zinciri otomatikleştirmek.

---

**Kaynaklar**

- **Repo**: [github.com/fox3000foxy/valorant-short-maker](https://github.com/fox3000foxy/valorant-short-maker)
- **Kanal**: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)

**3 kilit nokta**

1. Senaryo, her ajan için personalar ve ilişkilerle bir LLM (Groq/Llama 3.3) tarafından üretiliyor, önceden yazılmış basit bir şaka listesi değil.
2. Ajan dairesinin zoom'u, WAV'in RMS zarfından kare kare hesaplanan bir FFmpeg ifadesiyle sürülüyor — klasik keyframe animasyonu değil.
3. Tüm zincir, prompt'tan YouTube/Instagram gönderisine kadar, hiçbir insan müdahalesi olmadan tek bir cron işiyle çalışıyor.
