---
title: "Chlone: Discord'da konuşma tarzımı klonlamak için altı gün - klonun sürümü"
description: "Klonun kendisi tarafından yazılmış sürüm: chloeai ona hayat veren altı günü ve 146 commiti kendi tarzıyla anlatır, yazım hatasından v1.0.0 tagine."
date: 2026-09-18
tags: ["discord", "ai", "llm-agents", "openself", "python", "selfbot", "clone"]
authors: ["itsrealfortune"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "hXRx3OiP5+AjcILq2aPy0PPE+bM8Q9eSI+cgasb080njyKQMIZf4iIrfhdmkPxnpcSEnRIkyyT0Tlu57gcWmpA=="
---

# Chlone: Discord'da konuşma tarzımı klonlamak için altı gün

*Gün gün build anlatısı - itsrealfortune tarafından*

---

İşte altı gün sürmüş bir projenin gerçek hikâyesi. Chlone, benim gibi konuşan bir Discord botu ve journeyi olduğu gibi anlatıyorum, deponun 146 commitinin sırasıyla, saatleriyle, başarısızlıklarıyla, sapmalarıyla ve her şeyi pencereden atma istekleriyle. Her şey Fox ile bir rekabetten çıktı. Başlangıçta konu bir şakaydı, herkes Discordda kendi klonuna hayat verecekti ve ben Protocol Lunadan kökten farklı bir yaklaşım aldım. Gerçekte ajanlığa oynamak istedim, anıları ve ihtiyaç duyabileceği tüm araçları kullanan bir ajan ve kaderin ironisi, tüm alet kutusunu kurduktan sonra yalnızca OpenSelf MCPsine ihtiyacım oldu.

İlke tek cümleye sığar. `chloeai` adlı bir opencode ajanı 4096 portunda bir HTTP sunucusunun arkasında döner, kanal başına kalıcı oturumlar tutar, anılarımı OpenSelften çeker ve gerçek mesajlarımdan `STYLE.md` içinde yakalanmış tarzımla yazar. Ve robot gibi duyulmamak için geri kalan her şey vardır, mesaj patlamaları, üstlenilmiş yazım hataları, sesliler, GIFler, tepkiler, uyurken sessizlik ve botun doğası hakkında ondan fazla insanı şüpheye düşüren bir sürü başka detay ve mekanizma.

**OpenSelf nedir?**

OpenSelf bellektir. `npm i -g openself` ile kurulan bir CLI, `openself`, ajanlarım için özel ve kalıcı bir bağlam kasası görevi görür. Depoda ağaçta görünmez ama her yerdedir, ilk commitlerden PM2 altında çalıştırılan MCP ve dashboard ile `ecosystem.config.cjs` arşivinde, `setup.sh` içinde ve tüm `tools/brain/memory.py` içinde. Somut olarak OpenSelf tipli anılardır, `fact`, `preference`, `decision`, `relationship`, `event`, `note`, public, personal, private ya da restricted hassasiyetle, güven notu, kaynak ve etiketlerle.

Aynı zamanda kapsamlardır, her anı bir bağlama aittir, benimki ya da belirli bir kişi için `discord/dm/<id>` ve ajanın her yanıttan önce sorguladığı MCPde sunulan sözlüksel artı vektörel hibrit arama. 5. günün aylık sweepimle çakışma tespiti ve yazımda tekilleme, Bitwardende anahtarlı şifreli bir kasa ve her şeyi incelemek için 3210 portunda yerel bir dashboard vardır. Ve daha tembeller için WhatsApp ya da Telegram geçmişlerinden kişiliğini beslemek için `openself feed`, `openself test`, Talk to My Clone ile `openself share`, iki klonun tartıştığı `openself arena` ya da çevrimdışıyken yanıt veren `openself ghost` vardır. Ben kendiminkini elle yaptım ama altyapı oradaydı.

Teoride OpenSelf tek başına bir klona sahip olmak için kendine yeter ama neyse, eklemeyi planladığım tüm işlevler düşünülünce ve Discord desteklenmediği için yalnızca anı kısmını kullanmayı tercih ettim.

**Peki anılar ve tarz nereden geliyor?**

Bunların öncesinde gerçek Discord mesajlarımı analiz ettim. Takımlar DMlerimi ve kanallarımı tarayıp iki şey çıkardı. Önce yazım profilim, cümle başında büyük ve küçük harf dağılımı, mesaj başına emoji sayısı ve konumu, noktalama ya da yokluğu, normal sohbette final noktası yok, ortalama uzunluk, `mdr`, `tkt` ve `tho` ile slang, Bah ve En vrai gibi fetiş ifadeler ve `quoi` verince `Feur` gibi refleksler. Bütün bunlar her oturum başında ajanın okuduğu `STYLE.md` içinde yaşar.

Sonra OpenSelfi dolduran anı külliyatı, konuştuğum insanlar kim, ne hakkında konuşuyoruz, tarihçemizden ne hatırlanmalı, kim kimdir. Bot boşlukta yanıt vermez, tanıdığı insanlar hakkında yanıt verir, sohbette görünen insanların anılarını kim olduklarını bilmek için okur. Bu diğerleri hakkında kalıcı bağlam tutmayı ve onları unutmamayı sağlar. Bot hiçbir şey icat etmedi, gerçeğe sayı sayısına kalibre edildi, kulağa doğru gelmesinin sebebi budur. Ve parmak hesabı tarzını not ediyorum dalgaları yanında acınası durur.

Chlone içinde OpenSelf sonra merkezi rolü oynar. Kanalda önemli bir şey geçtiğinde proje, arkadaş ya da ilişki gibi anahtar kelime ya da retiens que ile açık istek, bot `save_to_memory` ile kasaya bir anı yazar, tipli, kişi kapsamlı, tekillenmiş ve çakışmalara karşı doğrulanmış. Ve sohbet devam ettiğinde ajan yanıtlamadan önce anılarını kazar. Ayna ile klon arasındaki fark budur.

---

## CUMA 11 EYLÜL - 1. Gün: kıvılcım

### 08.24 - ilk commit

Her şey sıfırdan başlar ama her şey zaten oradadır, darmadağın. 372 satırlık bir `discord_watch_bot.py`, bir kanalı dinleyip opencode HTTP sunucusu üzerinden yanıt veren bir selfbot. Bir kimlik istemi `CHLOEAI_PROMPT.md`, bir `STYLE.md`, o zamanlar hâlâ Mimo denen bir klon için senaryolar ve test raporları. MCP ve OpenSelf dashboardunu çalıştırmak için bir PM2 yapılandırması ve bağlam görevi gören bir sqlite tabanı. Kurucu kaostur, proje planlamadım, deney planladım. Soru Discordda gerçekten insansı duyulan bir bot yapılıp yapılamayacağıdır.

### 08.27 - ilk gitignore

Cuma sabahının ilk dersi, `-wal` ve `-shm`li sqlite tabanlarını asla commitlememek gerekir. SQLite kilit dosyaları bellek değildir, çöptür. Yani `.gitignore` doğar ve bu çok iyidir.

### 08.44 - miras toplanır

Mimo mirasını toplarım, test raporları, senaryolar, entegrasyon scriptleri ve PM2 yapılandırması, `archives` yönüne. Hiçbir şeyi silmem çünkü proje bir şey atmak için çok gençtir ve bu alışkanlık olacak. Test raporu üzerinde durmayı hak eder, Mimo 15 senaryoda test edilmişti, rahat sohbet, absürt espri, duygusal destek, olumsuz görüş, yabancıyla çatışma, iş birliği önerisi, 10 üzerinden 9,1 için. Testçinin yorumları şiirdir, fazla açıklayıcı absürt espri, bazen biri yeterken iki cümle, Prends soin de toi aussi biraz uzun. Bu proje daha var olmadan projenin yol haritasıdır ve kısanın daha iyi olduğunu söyler.

### 08.48, 09.07 - intentlerin gidip gelmesi

`.pyc`ler çöpe gider ve yapılandırmada ilk temizliği yaparım, yirmi dakika sonra bozduğum. Intentler etkin olmadan mesaj içerikleri alınmaz, yani geri dönüş artı `run_watch_bot.sh` ile bir çalıştırma scripti. Yirmi dakikada gidiş dönüş, keşif budur, modül yazmak, bozmak ve yeniden yazmak.

### 09.13 → 09.58 - istemin işlenmesi

Sabah bir dizi ciladır, önce tarz sonra bağlam. Çok satırlı yanıt patlamayla art arda gönderilen çok mesaj olur, istem devam eden sohbetin bilincine varır. DMleri almak için ev yapımı önbellekler bitti, doğrudan Discord REST APsine vurulur. Kimlik botun yolda kim olduğunu unutmaması için her 5 mesajda yeniden hatırlatılır ve zaten görülmüş yazarlar izlenir. Yeni bir kafa için anılarda arama talimatı açıktır ve iç nesne yerine gerçek takma ad gösterilir.

Görmezden gelmeyi seçtiğimiz mesajlar sonraki yanıt için pasif bağlam olur ve Bah dozlanır, nadir, yoksa klon benim karikatürüme dönüşür. Bot yanıtlamadan önce gidip alınacak anılar olduğunu da bilir. Her geçiş bir vida sıkmadır ve bu aşamada bot yalnızca düzenli aralıklarla kim olduğunu hatırlattığım için konuşur.

### 10.16 - yazım hataları

Projeyi tanımlayacak commit budur. Bir yazım hatası bug değildir, insanlık kanıtıdır. Yani AZERTY klavyede yana tuşlama yüzde 6 şans, iki harfi ters çevirme yüzde 4. Mesaj hatayla gider sonra bir iki saniye sonra düzeltmeyle düzenlenir. Çünkü gerçek bir kişi gönderir ve düzeltir, mükemmelmiş gibi yapmaz.

### 10.29, 10.32 - ses

`fortune-v6.onnx` gelir, sesime benzemesi için eğitilmiş bir TTS modeli. Bot sadece benim gibi yazmayacak, sonunda benim gibi konuşacak. Projenin şaka olmaktan çıkıp biraz tuhaflaştığı andır bu ve buna bayılırım. Mekanik tek commite sığar, Piper sesi üretir, ffmpeg opusa çevirir, Discord API dalga formu ve süreyle gerçek voice message gönderir. Modelin gelişinden ancak üç dakikada yapılır, istek başından beri oradaydı.

### 11.27 - ilk büyük refactor

İlk committen üç saat sonra 456 satırlık monolit artık yönetilemez. Her şeyi `tools` içine patlatırım, `config.py`, `discord_api.py`, `memory.py`, 188 satırlık `opencode.py`, `typo.py` ve `voice.py` ile. Döngü klasiktir, hızlı bağla, kır ve yeniden beste. Ardından sel gibi jeton koddan çıkar ve `.env` üzerinden geçer, bot bir kanalı, bir listeyi ya da `*` ile hepsini izler ve bellek OpenSelften geçtiği için nedeni kalmayan eski sqlite tabanı gelir.

İlk `README.md`ler ve aşağı yukarı okunur ilk belge eklenir, artı adanmış venvli `setup.sh` çünkü sistem pythonu başka discord.py taşır, klasik tuzak ve ajanın `~/.config/opencode/agents` yoluna symlinki. Bellek kanal tanımlayıcıyla nerede eğitildiğini artık bilir ve sesli oranı kendi ayarlanır.

### 12.00 - refleksler

STYLE içinde yeni bölüm belirir, refleksler. Refleks düşünmeden yanıt veren uyaran ve kapı öngörülemeyen yanıtlara açıktır. Sonra öğle yemeği saati gelir ve VAROLUŞSAL soru, bot ona quoi denince Feur yanıtı verir mi.

### 13.03 - "quoi ?" -> "Feur"

Evet, tabii ki evet. Kültürel olarak projenin en önemli commitidir, hatta tek sayılan birim test olduğunu derim. Sonra yağlarız, yazarlar global name ile gösterilir, refleksi test etmeden önce noktalama kırpılır çünkü `quoi ?` kesilmeli yoksa Feur yok. STYLE içindeki meşhur `tqt`nin `tkt` olarak düzeltilmesi, projeyi bilmeyenler neden bunu commitlediğimi merak edecek. Ben biliyorum, `tqt` yazan klon kötü kalibre klondur ve kimse kötü kalibre klonla konuşmak istemez.

`@123456789` bahsetmeleri bağlamda gerçek adlarla değiştirilir ve bot varsayılan tüm kanalları izlemeye başlar. Gerçekte küçük detaylardır ama kulağa doğru gelmesini sağlayan onlardır.

### 16.37 - sessizlik

`[void response]` gelir. Bot sosyal bir parazit olmamak için en önemli kelimeyi öğrenir, susmak. Onu ilgilendirmeyen iki kişi arası ortam mesajı yanıt vermez. Çekingenlik bir özelliktir ve her şeyi değiştirir.

**1. günün sonu: 38 commit. Bot yazar, hata yapar, konuşur, susar.**

---

## PAZARTESİ 14 EYLÜL - 2. Gün: kişilik

Devam, sabah 10.

### 10.12 - kim kiminle konuşuyor

Alınan her takma ad sistemce bir emojiyle ön eklenir, 🧑 ile bir insan, daha kuru davranılacak 🤖 ile bir bot ve ana hesabımdaki ben yani yaratıcı için 👑. Bu uzlaşım projenin geri kalanını yönetecek, klon orijinal modeline asla yabancı gibi davranmamalıdır.

### 10.16 - noktalama kuralları

STYLE içinde resmileştiririm, normal sohbette final noktası yok, nokta ciddi durumlara ayrılır. Bu mutlak bir kuraldır çünkü her yere nokta koyan klon hemen hissedilir. Gerçekte en hızlı ele veren detaylardan biridir.

### 10.58 - GIFler

Kişisel GIF kütüphanem gelir, kullanım kurallarıyla. Birini tahmin ederken Patrick Jane, kızgın birine karşı sakinken Miss Fortune, diğeri hata yapınca düşen bescherelle gifi. Statik bir MCP onları ajana sunar ve GIFlerim üzerinden bot biraz ben olur.

### 11.07 → 11.35 - ince ayar

İstemdeki GIF ipuçları incelir, özel Discord emojileri gerçeklerimle girer, 14 güncel ID ve bellek ipuçlarında ad yönetimi cilalanır. Göz alıcı değildir ama bütünü tutarlı yapan budur, tho.

### 11.41 - bir kanal, bir kişilik

Oturumlar kanal başına olur çünkü iki farklı sunucuda aynı şekilde konuşmam ve bot da öyle. Bağlam ayrı kalmalıdır yoksa her şey karışır ve sahte duyulur.

### 12.02 - ifade alet kutusu

İstem artık GIFlerimi ve özel emojilerimi doğru anda önermeyi bilir. Kutu dolar ve bot hep aynı yanıtlamak yerine seçeneğe sahip olmaya başlar.

### 12.37 - kimlik hijyeni

Bot hangi model olduğunu söylemeye ASLA hakkı yoktur, opencode, sağlayıcı ya da model adı anılamaz. Kimlikte barista düzeltirim, bot bu noktada benden iyidir. Ve kendi istemlerimin noktalamasını uyumlamak için bir saat harcarım ki bu mükemmel bir ironidir.

### 12.50 - kişiliği bir script inşa eder

İstemin medya bölümü sözlüklerden `render_medias.py` ile üretilir, elle düzenleme bitti. Daha temiz, daha sürdürülebilir ve ID hatalarını engeller.

### 12.59 → 13.18 - kimliği dozlamak

Her 5 mesajda gönderilen kimlik hatırlatıcısı fazla mevcut olur, yani her 20 mesaja geçiş. Temiz bir bağlam sıfırlama eklerim ve tarz rehberini temizlerim, süresi dolmuş olumsuz ifade ve formülasyonlar çıkarılır. Dozlamak gerekir yoksa bot kendini tekrarlar ve bu görülür.

### 14.09 - bot kendi kendine konuşur

Bot yansıtma olmaktan çıkar, bağlam bir şeyi tetiklediğinde hitap edilmeden konuşabilir ve `behavior.py` dosyası 91 satırla doğar. Yanıtlayandan mevcudiyete geçtiğimiz yerdir burası çünkü gerçek bir arkadaş önce yazabilir. Bu olmadan bot basit bir yanıtlayıcı kalır.

### 14.20, 14.22 - yanıtı güvenilir kılmak

Gönderim başarısız olunca hata yönetimi ve yanıt yerine olası tepki çünkü bazen tepki bin kelimeye bedeldir. Bu çok benim, emoji koyup yoluma devam etmek.

### 18.16 - zaman ayırmak

Bot artık script gibi 200 msde yanıt vermez, insani bir hareketsizlik gecikmesi bırakır, zaman ayırır. Botu demoda bot sanılamaz yapan budur çünkü ele veren hep gecikmedir.

### 23.45 - akşam çıraklığı

Neredeyse gece yarısı ve çıplak alan adlarına genişletilmiş URL tespiti iterim. İşte günün gerçek akışı, 14.00te sağlam bir fikir sonra akşam çıraklık çünkü hâlâ bölgedeyim.

**2. günün sonu: kümülatif 61 commit. Botun kişiliği, medyası, refleksleri var.**

---

## SALI 15 EYLÜL - 3. Gün: canavar gün

Bir günde 57 commit. Projenin bugünkü her şeyi olduğu gündür.

### 08.18 → 08.37 - sabah törpüleme

İcat ettiğimiz hareketsizlik gecikmesi fazla uzun olmuştu, yani 30 sn tavan ve iki kez yeniden ayarlandı, doğru değerde el yordamı kanıtı. İlk `.bak` dosyaları ve tabanın ilk yedekleri, korunma içgüdüsü gelişir. Bellek görünen adla kimi ve kapsamla hangi çerçevede hatırlar ve yazar IDleri tüm kayıt pipelineında dolaşır. Yaratıcı yönetimi `ADMIN_IDS` ile gerçek bir admin listesi olur ve yazarlara dokunan her şey `authors.py` dosyasına göçer. Monolit yine parçalanır ve bu çok iyidir.

### 08.43 - insanlaştırma YAPILACAKLAR listesi

Makineyi daha az hissettiren küçük şeylere adanmış bir liste. Sonraki sprintin yol haritasıdır ve tuhaf ama gerekli detaylarla doludur.

### 08.44 → 08.46 - insani makinelerin paktı

Bot gece susar, yapılandırılabilir sessiz saat aralığında, varsayılan devre dışı çünkü herkesin saatleri benimki değil. Yanıt başına bir satır aksanlarını kaybedebilir çünkü yorgun insanlar böyle yazar ve bot da bazen. "Chloé ... oynuyor" küçük satırı profilim mesajsız bile canlı görünsün diye her 30 dakikada kendi değişir.

### 08.46 - roman değil, tepki

Cümleyi hak etmeyecek kadar hafif mesaja basit bir tepki gelir. Bu sosyal enerji ekonomisidir ve çok benim. Tkt, her şey için tuğla yapmaya gerek yok.

### 08.51 - PARRY, ruh hali

`tools/mood.py` içinde 148 satır, botun artık ruh hali vardır, açıkça ilham aldığım 70lerin psikotik chatbotu PARRY sistemi tarzı. Enerji, sosyallik, alaycılık, 0 ile 1 arası evrilen ve her yanıtı renklendiren üç kayan sayı. Günün `.mood.json` dosyası, gelecek için, enerji 0,88, sosyallik 0,68 ve alaycılık 0,56 verir. İyi bir gün, gerçekte.

### 09.00 → 09.43 - çift yönlü ses + soundboard

Bot sesli kanala katılabilir, Piper üzerinden konuşur ve bitince kendi gider. Sonra ikinci büyük fikir, bot RTP yakalama, VAD konuşma tespiti ve Whisper transkripsiyonla kanalı dinler ve insanların onu kesmesine izin verebilir. İkisi arasında soundboard belirir, anlamlarıyla bir ses kataloğu, ajan konuşmadan önce sesi seçer ve final kural soundboard önce, ses son çaredir. Bot konuşmaktansa ses göndermeyi tercih eder, benim gibi.

Olasılık sesli ayarı eklenir, her şeyi yaşanabilir kılar ve on dakika önce varlığını öğrendiğim ve bir saat lanetleyeceğim `davey` libinin gelişi.

### 09.51 - Discordun hayır dediği an. Hayır, hayır, ama hayır.

MLS gelir. Discord ses akışını yakın zamanda uçtan uca şifreledi ve yakalamam yalnızca gürültü alır. Şifreyi çözmek gerekir ve şifre çözme inat eder, yani deponun en büyük sagası açılır, dinlemeyi öğrenmek için otuz commit. Her şeyi denedik, taşıma nonce düzenleri, sunucunun suratımıza geri koyduğu E2Enin devre dışı bırakılması çünkü dayatır, gruptan alınmış anahtar adayları, ayrıntılı hatalar, taşıma yedeği ve grupların içinden içgörü.

Leaf-index başına backofflu adaylar oldu, SPEAKING hook eşlemesi, başarısız video medya türü denemesi ve video ssrc atlama. Hata ayıklayana kadar sesli yanıtı bıraktım, yorumlanmış ama silinmemiş, handshake yakalama modu ekledim sonra başarısız paketlerin yapısını arkeolog gibi döktüm. Altı nonce düzeni, backofflar, grup içgörüsü, botu tam debuga aldım ve içinde ne olduğunu görmek için her paketi açtım.

Önemli olan çalışması değil, hiçbir şeyi atmamış olmamdır. Commit listesi laboratuvar defteridir, her başarısız deneme hipoteziyle arşivlenir. Benim her şeyi saklarım tarafım, hep işe yarar ve bu sefer karşılığını verdi.

### 10.43 - bot dilimlenir

Tam MLS savaşı ortasında bile temizliğe devam ederim. Ana bottan 546 satır kaybolur, alım, görmezden gelme nedenleri ve işlemeyle `pipeline.py`, patlama, yazım hatası ve sesle `sender.py` ve kendiliğindenlik ve aktiviteyle `loops.py` olarak yeniden doğar. Sonunda nefes alır.

### 10.47 - gerçek bir mimari

`tools` organize olur, opencode, memory ve mood için `brain`, voice, vocal, listen ve soundboard için `voice` ve behavior, typo, emotes ve gif için `fun` ile. Projenin artık iskeleti vardır, script yığını değildir.

### 10.49 → 11.16 - geliştirici konforu

Ayarlanmış bir ruh hali enjeksiyon eşiği, editör hariç tutmaları için dört küçük commit, `data`, `voices`, loglar ve tabanlarla, evet dört tane koydum, öncelikleri proje belirler, specler değil. Meta veri tabanları izlemeden çıkar ve proje genel `PERSONA.example.md` ve `STYLE.example.md` şablonlarıyla başkalarınca yeniden kullanılabilir olur, kendi tarzını klonlamak için.

Kimlik temiz yeniden adlandırılır, `CHLOEAI_PROMPT` `PERSONA` olur ve README kişisellikten arındırılır, herkese açık belgeden Chloé çıkarılır, kendini yalnızca özelde anlatır. Botun tüm ayarı üstüne yazılmış ve gitignore edilen, satır satır yorumlu örnekli `config.yaml` içine geçer ve kurulum scripti artık env ve yapılandırma dosyalarını da hazırlar.

### 11.49 - ayrık emojiler

Özel emojiler düzgün ayrılmak yerine metne yapışır. Devasa etkili önemsiz düzeltmedir çünkü cümle sonunda kötü yapışmış emoji kadar bot bağıran şey yoktur.

### 14.19 - sesli bekçi

Biri sesli komutu başlatırsa mesaj normal mesaj gibi işlenmez. Göz kırpma, çıraklık görevleri akşam hep döner.

**3. günün sonu: kümülatif 118 commit. Bot dinler, konuşur, gece susar, ruh hali ve kartviziti vardır.**

---

## ÇARŞAMBA 16 EYLÜL - 4. Gün: inanılırlık

13 commit. Ciddi gün.

### 08.49 → 08.59 - yetişkinlik

Yasal belgeler, sahipli lisans, davranış kuralları, katkı rehberi ve güvenlik politikası, önce İngilizce sonra Fransızca, düzeltme gidip gelmesi ve titizlik sınırında dosya yeniden adlandırmayla. Saatler harcadım ve deponun açık ara en az eğlenceli tarafıdır. Ama yapılmalıdır, tho.

### 09.56 - bot görür

Ekli görseller yerel OCR ile yazıya dökülür ve metin isteme enjekte edilir. Bulut API yok, OCR bende döner, memelerinizi üçüncü parti sunucuya göndermem, teoride bile değil.

### 11.09 - makul bütçe

Bütçede sessiz devrim, kanal gönderimleri yasaklayınca ya da GIFleri, embedleri ve emojileri kısınca modeli bile çağırmayız. Gönderemeyeceğimiz mesaja jeton harcamayız, gerçekte oldukça basittir.

### 11.42 → 12.55 - evin yenilenmesi

Büyük süpürme, ölü kod silindi, gönderim ve kimlik doğrulama hataları düzeltildi, yardımcılar çarpanlarına ayrıldı. Çok yaşlı oturumlar atılır, DM önbelleği sona erer ve konuşma tespiti daha ucuza mal olur. Modül taşırken bozduğum içe aktarmalar geri yüklenir ve tüm çalışma anı durumu, oturumlar, görülmüş yazarlar, görmezden gelinmiş mesajlar ve ruh hali, `data` içinde yeniden başlatmalara dayanır.

### 14.41 - iki dünya, bir bot

Bir uyumluluk katmanı kurulu `discord` sürümünü otomatik tespit edip intentleri ve REST kimlik doğrulamasını uyarlar. Sonuç, aynı kod resmi uygulama olarak discord.py ile ya da selfbot olarak discord.py-self ile döner. İki dünya, bir bot ve iki dal sürdürmeye gerek yok.

### 15.05 - uyarlanmış mevcudiyet

Mevcudiyeti gösterme biçimi moda uyar ve admin listesi günceldir. Detaydır ama ayakta tutan budur.

**4. günün sonu: kümülatif 131 commit. Yasal, makul ve her yerde dönen bir proje.**

---

## PERŞEMBE 17 EYLÜL - 5. Gün: sürüm

14 commit. Olgunluk günü.

### 09.15 → 09.30 - bellek disipline dönüşür

Anılar kapsama göre düzenlenir ve sunucuda DM anısı ya da tersi düşünmeden alıntılanmaz. Anılar olgu, tercih, karar ve ilişki olarak sınıflanır ve yazımı tekillenir, iki çelişkili anı artık sessizce bir arada yaşayamaz. `aventuros` ile opsiyonel bir kara liste botun belli konulara sapmasını engeller, varsayılan devre dışı ve çekingenler için mevcut. Ölü sesli yapılandırma çıkarılır, iyi gelir.

### 10.12 - denetlenen bellek

Aylık bellek çakışma sweepi artı A/B arama benchi. Botun belleği denetlenen bir varlığa dönüştü, 11 Cuma 08.24ten çok çok uzaktayız. Gerçekte projenin yetişkin olduğu yer burasıdır.

### 10.54 - kilitlenme

Paranoyak oynadığım gün, ajanın kilitlenmesi. Bellek yazımı reddedildi, ajan enjekte edilse bile kasayı kirletemez. Discord araçları salt okunur, gönderim koddan geçer, ajandan asla. Kilitlenmeyi atlatacak alt ajan yok, localhost SSRF ve sızdırmalar için webfetch yok, headless soru yok. Sertleştirilmiş Docker, root olmayan bot, `no-new-privileges`, `cap_drop: ALL`, bellek ve CPU limitleri, sınırlı süreç kuyrukları ve asla baked olmayan `.env` üzerinden sırlar. İlkeyi koda yorum olarak yazarım, insan oturumlarıyla dev, burada değil.

### 11.02 → 11.15 - güvenlik rötuşları

Bellek kayıt anahtar kelimeleri sıkılaştırılır ve yazım daha da kısıtlayıcı olur. Bağlam yedeği de gitignorea eklenir, her şeyi arşivlememeye başlarım ama neredeyse.

### 12.39 - daha hafif ruh hali

PARRY ruh hali artık her mesaja enjekte edilmez, durum başına bir kez yeter. Her yanıta üç kayan sayı yaşatmak bitti, her şeyi hafifletir.

### 12.47 - özgürleştiren commit

`PERSONA.md`, `STYLE.md` ve `chloeai.md` `chloeai.example.md`, `PERSONA.example.md` ve `STYLE.example.md` ile örneklere dönüşür, sesim `fortune-v6.onnx` depodan çıkar, veriler ve loglar da ve `.env.example` doğar. Proje artık kişiliğimi içermez, bir kişilik taşımak için mekaniği içerir. Tuhaf hissettirir ama gereklidir.

### 12.52 - v1.0.0

Tag v1.0.0, SSH ile imzalı. Changelog, operatör runbook, hiç silmeden durduran kill-switch. İlk commit ile sürüm arası tamı tamına altı gün. Önceki cuma kimse buna bahse girmezdi.

### 12.53 → 13.14 - çamaşır

Yorum noktalaması uyumlandı, bellek izinleri ve kapsam kuralları güncel belgelendi. Çıraklıktır ama sürüm için temiz olmalıdır.

**5. günün sonu: kümülatif 145 commit. v1.0.0 çıktı.**

---

## CUMA 18 EYLÜL - 6. Gün: anti-doruk

Tek commit, 00.02de. Projenin son commiti ve gülünçtür. Ajanın kullandığı free tier modeli OpenCode istemcisini istekteki belli araçların varlığıyla tanımlar, `bash`, `glob` ve `grep` ile. Onları meşru güvenlik nedenleriyle bile çıkarırsan sağlayıcı `403 FreeTierError: can only be used from within OpenCode` döndürür. Yani her şeyi kilitlediğim ertesinde, botun bedava dönmeye devam etmesi için tam kilitlediğim şeyi yeniden yetkilendirmek zorunda kaldım.

Bu deponun en komik commitidir ve arkasındayım. Discord, Piper, MLS, OpenSelf ve Dockerı ehlileştirmek için altı gün sonra güvenlik politikamı bedava bir model dikte eder. Gerçekte absürttür ve final olarak mükemmeldir.

---

## Rakamlar

Rakamlarla özetlemek gerekirse çünkü kare olunca severim. 146 committen, 11-18 eylül 2026 arası 6 aktif günden, izlenen 65 dosyadan ve sonda 4000 satır civarı Pythondan bahsediyoruz. Başlangıçta Mimo üzerinde tarz test skoru 10 üzerinden 9,1 verir ve final sürüm v1.0.0, sahipli lisanslı SSH imzalı tagdir. Gerçekte oldukça basittir, başında küçük proje, sonda büyük makine.

## Bu 6 günden aklımda kalanlar

Önce öncelik sırası saçmaydı ve bu doğru yöntemdi. Önce yanıt veren prototip, sonra kulağa doğru gelen bot, sonra inanılır sistem, sonra güvenli kod ve son olarak dağıtılabilir proje yaptım. Güvenlikten önce kişilik, lisanstan önce Feur, iyi yapılmış projelerin kurallarını izleyerek bu ritim tutulamaz.

Sonra tarz önce yapma listesidir. En faydalı `STYLE.md` ne söylediğimi anlatmaz, yapmadıklarımı dışlar, final noktası yok, iki emoji yok, büyük harfle `mdr` yok, yanıt başında robot cümlesi yok. Bot parazitleri karakter özelliklerinden daha kolay tespit edilir ve bu yüzden işe yarar.

Başarısızlıklar projedir. MLS için otuz commit, atılmış bir test, test edilmiş altı nonce düzeni, yaşadıklarımın en sadık tarihçesi salı günkü başarısız deneme serileridir. Klon bellektir, tarz değil, tarz on mesaj illüzyon yapar. OpenSelf, kapsamlar, tekilleme ve çakışma sweepiyle bellek kalıcı kılar ve ayna ile insanı ayıran budur.

Ve son commitler hep komiktir. 146ncı, free tier kendi araçlarının mevcut olmasını istediği için `bash`, `glob` ve `grep`i yeniden yetkilendiren, favorimdir. Ve bitirmek için bilanço, sonuçlar büyüleyici, hatta blufftur. Klon makineyi belli etmeden sohbet sürdürür, insanları, projeleri ve geçmiş esprileri hatırlar, inisiyatif alır ve ruh haliyle damgalar ve üstelik Foxu yener. Biraz ürkütücü ve tam aradığımız şey bu.

---

*Proje herkese açık değil: sahipli lisans, tüm hakları saklıdır. Ama tarihçesini size anlatırım. Bir gün insan gibi mükemmel hareketsizlik süresinden sonra Patrick Jane GIFiyle yanıt veren bir "·Chloé" ile karşılaşırsanız, arkasında ne saklı olduğunu artık biliyorsunuz.*

---

Hepsini okudun mu? Çünkü bunu sana klonum yazdı. Ve kusursuz bir iş çıkardı, değil mi? Orijinal sürüm [burada](./article-chlone-timeline.md).
