---
title: "Chlone: Discord'da konuşma tarzımı klonlamak için altı gün"
description: "Gün gün build anlatısı: chloeai adlı bir opencode ajanı, OpenSelf belleğine bağlı, altı günde ve 146 committe Discord'da benim gibi konuşmayı nasıl öğrendi."
date: 2026-09-18
tags: ["discord", "ai", "llm-agents", "openself", "python", "selfbot", "clone"]
authors: ["itsrealfortune"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "AyuGx/bLjO7aRdK/4zWAnoz7g31U10bKnLqJhOyaVgL2GMWFopcbfuoixqFrkmNl1mA4A6XaCzcShryu0x7OzA=="
---

# Chlone: Discord'da konuşma tarzımı klonlamak için altı gün

*Gün gün build anlatısı - itsrealfortune tarafından*

---

İşte altı gün sürmüş bir projenin gerçek hikâyesi: **Chlone**, benim gibi konuşan bir Discord botu. Yolculuğu olduğu gibi anlatıyorum, deponun 146 commitinin sırasıyla, saatleriyle, başarısızlıklarıyla, sapmalarıyla ve her şeyi pencereden atma istekleriyle, ama commit mesajlarını size dayatmadan.

Her şey **Fox ile bir rekabetten** çıktı. Konu, bir şakaydı: herkes Discordda kendi klonuna hayat verecekti. Ve ben **Protocol Lunadan** kökten farklı bir yaklaşım aldım: ajanlığa oynamak istedim, anıları ve yapay zekânın ihtiyaç duyabileceği tüm araçları kullanan bir ajan. Kaderin ironisi: tüm alet kutusunu kurduktan sonra yalnızca OpenSelf MCPsine ihtiyacım oldu.

İlke, tek cümle: `chloeai` adlı bir [opencode](https://opencode.ai) ajanı bir HTTP sunucusunun arkasında döner (port 4096), kanal başına kalıcı oturumlar tutar, anılarımı OpenSelften çeker ve gerçek mesajlarımdan `STYLE.md` içinde yakalanmış tarzımla yazar. Ve robot gibi duyulmamak için: mesaj patlamaları, üstlenilmiş yazım hataları, sesliler, GIFler, tepkiler, uyurken sessizlik ve botun doğası hakkında ondan fazla insanı şüpheye düşüren bir sürü başka detay ve mekanizma.

**OpenSelf nedir?**

OpenSelf, bellektir. Yapay zekâ ajanlarım için özel ve kalıcı bir bağlam kasası görevi gören bir CLI (`openself`, `npm i -g openself` ile kurulur). Depoda ağaçta görünmez ama her yerdedir: ilk commitlerden PM2 altında çalıştırılan MCP ve OpenSelf dashboardu ile `ecosystem.config.cjs` arşivinde, `setup.sh` içinde (`npm i -g openself`) ve tüm `tools/brain/memory.py` içinde.

Somut olarak OpenSelf şudur:

- **tipli anılar** (`fact`, `preference`, `decision`, `relationship`, `event`, `note`), hassasiyetle (public / personal / private / restricted), güven notuyla, kaynakla, etiketlerle;
- **kapsamlar**: her anı bir bağlama aittir, benimki ya da belirli bir kişi için `discord/dm/<id>`;
- ajanın her yanıttan önce sorguladığı MCPde sunulan **hibrit arama** (sözlüksel + vektörel) (`openself_openself_search_memory`, `openself_openself_get_context`);
- **çakışma tespiti** (5. gündeki aylık sweepim) ve yazımda tekilleme;
- şifreli bir **kasa** (anahtar Bitwardenda) ve her şeyi incelemek için **yerel dashboard** (port 3210);
- ve benden daha tembeller için: kişiliğini WhatsApp/Telegram geçmişlerinden beslemek için `openself feed`, `openself test`, `openself share` ("Talk to My Clone", bir web sayfası), `openself arena` (tartışan iki klon) ya da çevrimdışıyken yanıt veren `openself ghost`. Ben kendiminkini elle yaptım ama altyapı oradaydı.

Teoride OpenSelf tek başına bir klona sahip olmak için yeter ama eklemeyi planladığım tüm özellikler düşünülünce ve Discord desteklenmediği için yalnızca anı kısmını kullanmayı tercih ettim.

**Peki anılar ve tarz nereden geliyor?**

Bunların öncesinde gerçek Discord mesajlarımı analiz ettim. Takımlar DMlerimi ve kanallarımı tarayıp iki şey çıkardı:

1. **Yazım profilim**: cümle başında büyük/küçük harf dağılımı, mesaj başına emoji sayısı ve konumu, noktalama (ya da yokluğu: normal sohbette noktasız cümleler), ortalama uzunluk, slang (`mdr`, `tkt`, `tho`), fetiş ifadeler ("Bah", "En vrai") ve `quoi` -> `Feur` türü refleksler. Bütün bunlar her oturum başında ajanın okuduğu `STYLE.md` içinde yaşar.
2. OpenSelfi dolduran **anı külliyatı**: konuştuğum insanlar kim, ne hakkında konuşuyoruz, tarihçemizden ne hatırlanmalı, kim kimdir. Bot boşluğa yanıt vermez: "tanıdığı" insanlar *hakkında* yanıt verir. Sohbette görünen insanların anılarını kim olduklarını bilmek için okur. Bu diğerleri hakkında kalıcı bağlam tutmayı, onları unutmamayı sağlar.

Bot hiçbir şey icat etmedi: gerçeğe sayı sayısına kalibre edildi. Bu yüzden kulağa doğru gelir ve parmak hesabı "tarzını not ediyorum" yaklaşımları yanında acınası durur.

Chlone içinde OpenSelf sonra merkezi rolü oynar: kanalda önemli bir şey geçtiğinde ("projet", "ami", "relation" gibi anahtar kelime ya da "retiens que..." gibi açık istek) bot `save_to_memory` ile kasaya bir anı yazar, tipli, kişi kapsamlı, tekillenmiş, çakışmalara karşı kontrol edilmiş. Ve sohbet devam ettiğinde ajan yanıtlamadan önce anılarını kazar. Ayna ile klon arasındaki fark budur.

---

---

## CUMA 11 EYLÜL - 1. Gün: kıvılcım

### 08.24 - ilk commit

Her şey sıfırdan başlar ama her şey zaten oradadır, darmadağın. 372 satırlık bir `discord_watch_bot.py`, bir kanalı dinleyip opencode HTTP sunucusu üzerinden yanıt veren bir selfbot. Bir kimlik istemi `CHLOEAI_PROMPT.md`. Bir `STYLE.md`. O zamanlar hâlâ **Mimo** denen bir klon için senaryolar ve test raporları. MCP ve OpenSelf dashboardunu çalıştırmak için bir PM2 yapılandırması. Ve bağlam görevi gören bir sqlite tabanı.

Bu kurucu kaostur. Proje planlamadım: bir deney planladım. Discordda *gerçekten* insansı duyulan bir bot yapılabilir mi?

### 08.27 - ilk gitignore

Cuma sabahının ilk dersi: `-wal` / `-shm`li sqlite tabanlarını asla commitlememek. SQLite kilit dosyaları bellek değildir, çöptür. `.gitignore` doğar.

### 08.44 - miras toplanır

Mimo mirasını toplarım: test raporları, senaryolar, entegrasyon scriptleri, PM2 yapılandırması. `archives/` yönüne. Hiçbir şeyi silmem, proje bir şey atmak için çok gençtir. Bu alışkanlık olacak.

Test raporu üzerinde durmayı hak eder: Mimo **15 senaryoda** test edilmişti (rahat sohbet, absürt espri, duygusal destek, olumsuz görüş, yabancıyla çatışma, iş birliği önerisi...) **9,1/10** için. Testçinin yorumları şiirdir: *"absürt espri fazla açıklayıcı"*, *"bazen 1 yeterken 2 cümle"*, *""Prends soin de toi aussi" biraz uzun"*. Bu proje daha var olmadan projenin yol haritasıdır: **kısa = daha iyi**.

### 08.48, 09.07 - intentlerin gidip gelmesi

`.pyc`ler çöpe ve yapılandırmada ilk temizlik... yirmi dakika sonra bozduğum: intentler etkin olmadan mesaj içerikleri alınmaz. Geri dönüş artı bir çalıştırma scripti (`run_watch_bot.sh`). 20 dakikada gidiş dönüş: keşif budur. İlk sürümü yazmak, bozmak, yeniden yazmak.

### 09.13 → 09.58 - istemin işlenmesi

Sabah bir dizi ciladır, önce tarz, sonra bağlam:

- çok satırlı yanıt = art arda gönderilen çok mesaj (patlama), istem devam eden sohbetin bilincine varır;
- DMleri almak için ev yapımı önbellekler bitti: doğrudan Discord REST APIye vurulur;
- botun yolda kim olduğunu unutmaması için kimlik her 5 mesajda yeniden hatırlatılır;
- zaten görülmüş yazarların izlenmesi: yeni bir kafa için anılarda arama talimatı açıktır;
- iç nesne yerine gerçek takma adın gösterimi;
- görmezden gelmeyi seçtiğimiz mesajlar sonraki yanıt için pasif bağlam olur;
- "Bah" dozlanır: nadir, yoksa klon benim karikatürüme dönüşür;
- bot yanıtlamadan önce gidip alınacak anılar olduğunu bilir.

Her geçiş bir vida sıkmadır. Bot bu aşamada yalnızca düzenli aralıklarla kim olduğunu hatırlattığım için "konuşur".

### 10.16 - yazım hataları

Projeyi tanımlayacak commit. Bir yazım hatası bug değildir: **insanlık kanıtıdır**. AZERTY klavyede yana tuşlama %6 şans, iki harfi ters çevirme %4. Mesaj hatayla gider, sonra 1-2 saniye sonra düzeltmeyle **düzenlenir**. Çünkü gerçek bir kişi gönderir ve düzeltir.

### 10.29, 10.32 - ses

`fortune-v6.onnx`: *benim* sesime benzemesi için eğitilmiş bir TTS modeli. Bot sadece benim gibi yazmayacak, sonunda benim gibi *konuşacak*. Projenin şaka olmaktan çıkıp biraz tuhaflaştığı an budur. Bayılırım.

Mekanik tek commite sığar: Piper sesi üretir, ffmpeg opusa çevirir, Discord API dalga formu ve süreyle gerçek bir "voice message" gönderir. Modelin gelişinden ancak 3 dakikada yapılır. İstek başından beri oradaydı.

### 11.27 - ilk büyük refactor

İlk committen üç saat sonra 456 satırlık monolit artık yönetilemez. Her şeyi `tools/` içine patlatırım: `config.py`, `discord_api.py`, `memory.py`, `opencode.py` (188 satır), `typo.py`, `voice.py`. Döngü klasiktir: hızlı bağla, kır, yeniden beste.

Ardından sel gibi gelir:

- jeton koddan çıkar ve `.env` üzerinden geçer;
- bot bir kanalı, bir listeyi ya da hepsini (`*`) izler;
- eski sqlite tabanının nedeni kalmaz: bellek OpenSelften geçer;
- ilk `README.md`ler ve aşağı yukarı okunur ilk belge;
- bir `setup.sh`: adanmış venv (sistem pythonu başka bir discord.py taşır, klasik tuzak), ajanın `~/.config/opencode/agents/` yoluna symlinki, çalışmaya hazır;
- bellek *nerede* eğitildiğini bilir (kanal tanımlayıcı) ve sesli oranı kendini ayarlar.

### 12.00 - refleksler

STYLE içinde yeni bölüm: refleksler. Refleks uyaran -> yanıttır, düşünmeden. Kapı absürt yanıtlara açıktır.

Sonra öğle yemeği saati gelir ve VAROLUŞSAL soru: bot `quoi` denince `Feur` yanıtı verir mi?

### 13.03 - "quoi ?" -> "Feur"

Evet. Tabii ki evet. Kültürel olarak projenin en önemli commitidir. Hatta derim: sayılan tek birim testtir.

Sonra yağlarız:

- yazarlar *global name* ile gösterilir;
- refleksi test etmeden önce noktalama kırpılır (`quoi ?` kesilmeli yoksa `Feur` gitmez);
- STYLE içindeki meşhur `tqt`nin `tkt` olarak düzeltilmesi, projeyi bilmeyenler neden bunu commitlediğimi merak edecek. Ben biliyorum: `tqt` yazan klon kötü kalibre klondur ve kimse kötü kalibre klonla konuşmak istemez;
- `@123456789` bahsetmeleri bağlamda gerçek adlarla değiştirilir;
- bot varsayılan tüm kanalları izlemeye başlar.

### 16.37 - sessizlik

`[void response]`. Bot sosyal bir parazit olmamak için en önemli kelimeyi öğrenir: **susmak**. Onu ilgilendirmeyen iki kişi arası ortam mesajı sessizlik çağırır. Çekingenlik bir özelliktir.

**1. günün sonu: 38 commit. Bot yazar, hata yapar, konuşur, susar.**

---

---

## PAZARTESİ 14 EYLÜL - 2. Gün: kişilik

Devam, sabah 10.

### 10.12 - kim kiminle konuşuyor

Alınan her takma ad sistemce bir emojiyle ön eklenir: 🧑 bir insan, 🤖 bir bot (daha kuru davranılacak), 👑 **yaratıcı, yani ana hesabımdaki ben**. Bu uzlaşım projenin geri kalanını yönetecek: klon "orijinal model"ine asla yabancı gibi davranmamalıdır.

### 10.16 - noktalama kuralları

STYLE içinde resmileştiririm: normal sohbette noktasız cümleler, nokta ciddi durumlara ayrılır. Mutlak kural. Her yere nokta koyan klon hemen hissedilir.

### 10.58 - GIFler

Kişisel GIF kütüphanem, kullanım kurallarıyla gelir: birini tahmin ederken Patrick Jane, kızgın birine karşı sakinken Miss Fortune, diğeri hata yapınca düşen bescherelle gifi. Statik bir MCP onları ajana sunar. Bot GIFlerim üzerinden biraz ben olur.

### 11.07 → 11.35 - ince ayar

İstemdeki GIF ipuçları incelir, Discord özel emojileri girer (gerçeklerim, 14 güncel ID) ve bellek ipuçlarında ad yönetimi cilalanır.

### 11.41 - bir kanal, bir kişilik

Oturumlar **kanal başına** olur: iki farklı sunucuda aynı şekilde konuşmam ve bot da konuşmaz.

### 12.02 - ifade alet kutusu

İstem artık GIFlerimi *ve* özel emojilerimi doğru anda önermeyi bilir. Kutu dolar.

### 12.37 - kimlik hijyeni

- bot hangi model olduğunu ASLA söyleme hakkı yoktur, opencode, sağlayıcı, model adı anılamaz;
- kimlikte "barista" düzeltmesi (bot bu noktada benden iyidir);
- kendi istemlerimin noktalamasını uyumlamak için bir saat harcarım ki bu mükemmel bir ironidir.

### 12.50 - kişiliği bir script inşa eder

İstemin medya bölümü sözlüklerden üretilir (`render_medias.py`), elle düzenleme bitti.

### 12.59 → 13.18 - kimliği dozlamak

Her 5 mesajda gönderilen kimlik hatırlatıcısı fazla mevcut olur: her 20 mesaja geçiş. Temiz bir bağlam sıfırlama eklenir. Ve tarz rehberinin temizliği: süresi dolmuş olumsuz ifade ve formülasyonlar çıkarılır.

### 14.09 - bot kendi kendine konuşur

Bot refleks olmaktan çıkar: bir şey bağlamı tetiklediğinde **hitap edilmeden konuşabilir** (`behavior.py` dosyası doğar, 91 satır). İşte "yanıtlayan"dan "mevcudiyet"e geçilen yerdir: gerçek bir arkadaş önce yazabilir.

### 14.20, 14.22 - yanıtı güvenilir kılmak

Gönderim başarısız olunca hata yönetimi ve yanıt yerine olası tepki, bazen tepki bin kelimeye bedeldir.

### 18.16 - zaman ayırmak

Bot artık script gibi 200 msde yanıt vermez. İnsani bir hareketsizlik gecikmesi bırakır, "zaman ayırır". Botu demoda yakalanamaz yapan budur: ele veren hep gecikmedir.

### 23.45 - akşam çıraklığı

Neredeyse gece yarısı ve çıplak alan adlarına genişletilmiş URL tespiti iterim. İşte günün gerçek ritmi: 14.00te parlak bir ilerleme, sonra akşam çıraklık çünkü hâlâ bölgedeyim.

**2. günün sonu: kümülatif 61 commit. Botun kişiliği, medyası, refleksleri var.**

---

---

## SALI 15 EYLÜL - 3. Gün: canavar gün

Bir günde 57 commit. Projenin bugünkü her şeyi olduğu gündür.

### 08.18 → 08.37 - sabah törpüleme

- icat ettiğimiz hareketsizlik gecikmesi fazla uzun olmuştu: 30 sn tavan (ve iki kez yeniden ayar, doğru değerde el yordamı kanıtı);
- ilk `.bak` dosyaları ve tabanın ilk yedekleri: korunma içgüdüsü gelişir;
- bellek *kimi* (görünen ad) ve *hangi çerçevede* (kapsam) hatırlar;
- yazar IDleri tüm kayıt pipelineında dolaşır;
- "yaratıcı" yönetimi gerçek bir admin listesi olur (`ADMIN_IDS`) ve yazarlara dokunan her şey `authors.py` dosyasına göçer. Monolit yine parçalanır.

### 08.43 - insanlaştırma YAPILACAKLAR listesi

Makineyi daha az hissettiren küçük şeylere adanmış bir liste. Sonraki sprintin yol haritasıdır.

### 08.44 → 08.46 - insani makinelerin paktı

- bot gece susar, yapılandırılabilir sessiz saat aralığında (varsayılan devre dışı, herkesin saatleri benimki değil);
- yanıt başına bir satır aksanlarını kaybedebilir. Yorgun insanlar böyle yazar. Bot da bazen;
- "Chloé ... oynuyor" küçük satırı profilim mesajsız bile canlı görünsün diye her 30 dakikada kendi değişir.

### 08.46 - roman değil, tepki

Cümleyi hak etmeyecek kadar hafif mesaj mı? Bir tepki yeter. Sosyal enerji ekonomisi ve bu çok benim.

### 08.51 - PARRY, ruh hali

`tools/mood.py` içinde 148 satır. Botun artık **ruh hali** vardır, açıkça ilham aldığım 70lerin psikotik chatbotu PARRY sistemi tarzı: enerji, sosyallik, alaycılık, 0 ile 1 arası evrilen ve her yanıtı renklendiren üç kayan sayı. Günün `.mood.json` dosyası, gelecek için: enerji 0,88, sosyallik 0,68, alaycılık 0,56. İyi bir gün.

### 09.00 → 09.43 - çift yönlü ses + soundboard

- bot **sesli** kanala katılabilir, Piper üzerinden konuşur ve bitince kendi gider;
- sonra ikinci büyük fikir: bot kanalı **dinler** (RTP yakalama, VAD konuşma tespiti, Whisper transkripsiyon) ve insanların onu kesmesine izin verebilir;
- arada soundboard belirir: anlamlarıyla bir ses kataloğu, ajan konuşmadan önce sesi **seçer** ve final kural "önce soundboard, son çare ses"tir, bot konuşmaktansa ses göndermeyi tercih eder. Benim gibi;
- her şeyi yaşanabilir kılan bir sesli olasılık ayarı;
- ve on dakika önce varlığını öğrendiğim ve bir saat lanetleyeceğim `davey` libinin gelişi.

### 09.51 - Discordun hayır dediği an. Hayır, hayır, ama hayır.

**MLS** gelir. Discord yakın zamanda ses akışını uçtan uca şifreledi ve yakalamam yalnızca gürültü alır. Şifreyi çözmek gerekir ve şifre çözme inat eder. Deponun en büyük sagası açılır, dinlemeyi öğrenmek için otuz commit.

Her şeyi denedik: taşıma nonce düzenleri, E2Enin devre dışı bırakılması (sunucu suratımıza geri koyar, dayatır), gruptan alınmış anahtar adayları, ayrıntılı hatalar, taşıma yedeği, grupların içinden içgörü, backofflu leaf-index başına adaylar, SPEAKING hook eşlemesi, başarısız video medya türü denemesi ve video ssrc atlama...

Yanıtı hata ayıklayana kadar sesli yanıtı bıraktım (yorumlanmış, silinmemiş), handshake yakalama modu ekledim, sonra başarısız paketlerin yapısını arkeolog gibi döktüm. Altı nonce düzeni. Backofflar. Grup içgörüsü. Botu tam debuga aldım ve içinde ne olduğunu görmek için her paketi açtım.

Önemli olan çalışması değil, **hiçbir şeyi atmamış** olmamdır. Commit listesi laboratuvar defteridir: her başarısız deneme hipoteziyle arşivlenir. Benim "her şeyi saklarım, gelecekteki debug işe yarar" tarafım karşılığını verdi.

### 10.43 - bot dilimlenir

Tam MLS savaşı ortasında bile temizliğe devam ederim. Ana bottan 546 satır kaybolur, `pipeline.py` (alım, görmezden gelme nedenleri, işleme), `sender.py` (patlama, yazım hatası, ses) ve `loops.py` (kendiliğindenlik, aktivite) olarak yeniden doğar.

### 10.47 - gerçek bir mimari

`tools/` organize olur: `brain/` (opencode, memory, mood), `voice/` (voice, vocal, listen, soundboard), `fun/` (behavior, typo, emotes, gif). Projenin artık iskeleti vardır.

### 10.49 → 11.16 - geliştirici konforu

- ayarlanmış bir ruh hali enjeksiyon eşiği;
- editör hariç tutmaları için dört küçük commit (`data/`, `voices/`, loglar, tabanlar), evet dört tane koydum, öncelikleri proje belirler, specler değil;
- meta veri tabanları izlemeden çıkar;
- proje başkalarınca yeniden kullanılabilir olur: kendi tarzını klonlamak için genel `PERSONA.example.md` ve `STYLE.example.md` şablonları;
- kimlik temiz yeniden adlandırılır (`CHLOEAI_PROMPT` `PERSONA` olur) ve README kişisellikten arındırılır, herkese açık belgeden "Chloé" çıkarılır, kendini yalnızca özelde anlatır;
- botun tüm ayarı gitignore edilen, satır satır yorumlu örnekli `config.yaml` içine geçer;
- kurulum scripti artık env ve yapılandırma dosyalarını da hazırlar.

### 11.49 - ayrık emojiler

Özel emojiler düzgün ayrılmak yerine metne yapışır. Önemsiz düzeltme, devasa etki: cümle sonuna kötü yapışmış emoji kadar "bot" bağıran şey yoktur.

### 14.19 - sesli bekçi

Biri sesli komutu başlatırsa mesaj normal mesaj gibi işlenmez. Göz kırpma: çıraklık görevleri akşam hep döner.

**3. günün sonu: kümülatif 118 commit. Bot dinler, konuşur, gece susar, ruh hali ve kartviziti vardır.**

---

---

## ÇARŞAMBA 16 EYLÜL - 4. Gün: inanılırlık

13 commit. "ciddi" gün.

### 08.49 → 08.59 - yetişkinlik

Yasal belgeler: **sahipli** lisans, davranış kuralları, katkı rehberi, güvenlik politikası, önce İngilizce sonra Fransızca, düzeltme gidip gelmesi ve titizlik sınırında dosya yeniden adlandırmayla. Saatler harcadım ve deponun açık ara en az eğlenceli tarafıdır.

### 09.56 - bot görür

Ekli görseller yerel OCR ile yazıya dökülür ve metin isteme enjekte edilir. OCR yerelde bende döner. Memelerinizi üçüncü parti sunucuya göndermem, teoride bile.

### 11.09 - makul bütçe

Bütçede sessiz devrim: kanal gönderimleri yasaklayınca ya da GIFleri, embedleri ve emojileri kısınca **modeli bile çağırmayız**. Gönderemeyeceğimiz mesaja jeton harcamayız.

### 11.42 → 12.55 - evin yenilenmesi

- büyük süpürme: ölü kod silinir, gönderim ve kimlik doğrulama hataları düzeltilir, yardımcılar çarpanlarına ayrılır;
- çok yaşlı oturumlar atılır, DM önbelleği sona erer, konuşma tespiti ucuzlar;
- modül taşırken bozduğum içe aktarmalar geri yüklenir ve tüm çalışma anı durumu (oturumlar, görülmüş yazarlar, görmezden gelinmiş mesajlar, ruh hali) `data/` içinde yeniden başlatmalara dayanır.

### 14.41 - iki dünya, bir bot

Bir uyumluluk katmanı kurulu `discord` sürümünü otomatik tespit edip intentleri ve REST kimlik doğrulamasını uyarlar. Sonuç: aynı kod **resmi uygulama** (discord.py) ya da **selfbot** (discord.py-self) olarak döner. İki dünya, bir bot.

### 15.05 - uyarlanmış mevcudiyet

Mevcudiyeti gösterme biçimi moda uyar ve admin listesi günceldir.

**4. günün sonu: kümülatif 131 commit. Yasal, makul ve her yerde dönen bir proje.**

---

---

## PERŞEMBE 17 EYLÜL - 5. Gün: sürüm

14 commit. Olgunluk günü.

### 09.15 → 09.30 - bellek disipline dönüşür

- anılar kapsama göre düzenlenir ve DM anısı sunucuda (ya da tersi) düşünmeden alıntılanmaz;
- anılar sınıflanır (olgu, tercih, karar, ilişki...) ve yazımı tekillenir: iki çelişkili anı artık sessizce bir arada yaşayamaz;
- opsiyonel bir kara liste (`aventuros`) botun belli konulara sapmasını engeller. Varsayılan devre dışı, çekingenler için mevcut;
- ölü sesli yapılandırma çıkarılır.

### 10.12 - denetlenen bellek

Aylık bellek çakışma **sweepi** + A/B arama benchi. Botun belleği denetlenen bir varlığa dönüştü. Cuma 11, 08.24ten çok çok uzaktayız.

### 10.54 - kilitlenme

Paranoyak oynadığım gün. Ajanın kilitlenmesi:

- bellek yazımı **reddedildi** (ajan enjekte edilse bile kasayı kirletemez);
- Discord araçları **salt okunur** (gönderim koddan geçer, ajandan asla);
- kilitlenmeyi atlatacak **alt ajan yok**, localhost SSRF ve sızdırmalar için webfetch yok, headless soru yok;
- sertleştirilmiş Docker: root olmayan bot, `no-new-privileges`, `cap_drop: ALL`, bellek/CPU limitleri, sınırlı süreç kuyrukları, asla baked olmayan `.env` üzerinden sırlar.

İlkeyi koda yorum olarak yazarım: *"dev insan oturumlarıyla, burada değil"*.

### 11.02 → 11.15 - güvenlik rötuşları

Bellek kayıt anahtar kelimeleri sıkılaştırılır ve yazım daha da kısıtlayıcı olur. Bağlam yedeği de gitignorea eklenir, her şeyi arşivlememeye başlarım, ama neredeyse.

### 12.39 - daha hafif ruh hali

PARRY ruh hali artık her mesaja enjekte edilmez: durum başına bir kez. Her yanıta 3 kayan sayı yaşatmak bitti.

### 12.47 - özgürleştiren commit

`PERSONA.md`, `STYLE.md` ve `chloeai.md` **örneklere** dönüşür (`chloeai.example.md`, `PERSONA.example.md`, `STYLE.example.md`), sesim `fortune-v6.onnx` depodan çıkar, veriler ve loglar da, bir `.env.example` doğar. Proje artık *benim* kişiliğimi içermez: bir kişilik taşımak için **mekaniği** içerir.

### 12.52 - v1.0.0

**Tag v1.0.0, SSH ile imzalı.** Changelog, operatör runbook, kill-switch (hiç silmeden durdurur). İlk commit ile sürüm arası tamı tamına altı gün.

### 12.53 → 13.14 - çamaşır

Yorum noktalaması uyumlandı, bellek izinleri ve kapsam kuralları güncel belgelendi.

**5. günün sonu: kümülatif 145 commit. v1.0.0 çıktı.**

---

---

## CUMA 18 EYLÜL - 6. Gün: anti-doruk

Tek commit, 00.02de.

Projenin son commiti ve gülünçtür. Ajanın kullandığı "free tier" modeli OpenCode istemcisini istekteki belli araçların **varlığıyla** tanımlar (`bash`, `glob`, `grep`). Onları meşru güvenlik nedenleriyle bile çıkarırsan sağlayıcı `403 FreeTierError: can only be used from within OpenCode` döndürür. O yüzden kilitlediğim her şeyi, her şeyi kilitlediğim ertesinde, botun bedava dönmeye devam etmesi için yeniden yetkilendirmek zorunda kaldım.

Bu deponun en komik commitidir ve arkasındayım: Discord, Piper, MLS, OpenSelf ve Dockerı ehlileştirmek için 6 gün sonra güvenlik politikamı **bedava bir yapay zekâ modeli** dikte eder.

---

---

## Rakamlar


|                                               |                                                |
| --------------------------------------------- | ---------------------------------------------- |
| Commitler                                     | **146**                                        |
| Aktif günler                                  | **6** (11 -> 18 eylül 2026)                    |
| İzlenen dosyalar                              | 65                                             |
| Final Python satırları                        | ~4 000                                         |
| Tarz test skoru (Mimo, ilk günler)            | **9,1/10**                                     |
| Final sürüm                                   | v1.0.0 (SSH imzalı tag, sahipli lisans) |

## Bu 6 günden aklımda kalanlar

1. **Öncelik sırası saçmaydı ve bu doğru yöntemdi.** Önce *yanıt veren* bir bot, sonra *kulağa doğru gelen* bir bot, sonra *inanılır* bir bot, sonra *güvenli* bir bot ve son olarak *dağıtılabilir* bir bot inşa ettim. Güvenlikten önce kişilik, lisanstan önce `Feur`. "İyi yapılmış" projelerin kurallarını izleyerek bu ritim tutulamaz.
2. **Tarz önce bir "yapma" listesidir.** En faydalı `STYLE.md` ne söylediğimi anlatmaz, yapmadıklarımı dışlar: cümleleri noktasız bitirmek, emojileri tekle sınırlamak, `mdr`yi küçük yazmak, yanıt başında "Je vérifie juste un détail" türü girişsiz doğrudan dalmak. Bot parazitleri karakter özelliklerinden daha kolay tespit edilir.
3. **Başarısızlıklar projedir.** MLS için otuz commit, atılmış bir test, test edilmiş altı nonce düzeni. Yaşadıklarımın en sadık tarihçesi salı günkü başarısız deneme serileridir.
4. **Klon bellektir, tarz değil.** Tarz on mesaj illüzyon yapar. Bellek (OpenSelf, kapsamlar, tekilleme, çakışma sweepi) kalıcı kılar. Ayna ile insanı ayıran budur.
5. **Son commitler hep komiktir.** 146ncı, free tier kendi araçlarının mevcut olmasını istediği için `bash`, `glob` ve `grep`i yeniden yetkilendiren, favorimdir.

Ve bitirmek için bilanço: **sonuçlar büyüleyici, hatta blufftur.** Klon makineyi belli etmeden sohbet sürdürür, insanları, projeleri, geçmiş esprileri hatırlar, inisiyatif alır ve ruh haliyle damgalar, üstelik Foxu yener. Biraz ürkütücü ve tam aradığımız şey bu.

---

*Proje herkese açık değil: sahipli lisans, tüm hakları saklıdır. Ama tarihçesini size anlatırım. Bir gün insan gibi mükemmel hareketsizlik süresinden sonra Patrick Jane GIFiyle yanıt veren bir "·Chloé" ile karşılaşırsanız... arkasında ne saklı olduğunu artık biliyorsunuz.*

---

Klonum makalenin kendi sürümünü yazdı, [burada](./article-chlone-timeline-chloeai.md) okuyabilirsiniz.
