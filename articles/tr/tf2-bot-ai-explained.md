---
title: "TF2 botları rastgele değil: her zorluk parametresini yeniden keşfettim"
description: "Görüş, nişan, backstab açıları, headshot mantığı, bilinen her hata, Valve hiçbir şeyi belgelemedi. O yüzden kodu kazdık ve hepsini eksiksiz bir teknik föye dönüştürdük."
date: 2026-07-12
authors:
  - fox3000foxy
tags:
  - tf2
  - jeu-ia
  - ingenierie-inversee
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "lzJSZMpN9Ay1lqG+c/G15MUS+dimBCQBkGktDlMmBK2ruQ0ra8Ma3kSPmJ2Xs/evD1eSlcsXrUIZngwoRRJdfw=="
---

## Giriş

![Roketatarla nişan alan TF2 Asker botu](assets/tf2-bot-ai-soldier-aim.png)

Her TF2 oyuncusu bunu en az bir kez söylemiştir: "bu bot hile yapıyor." Ya da tersi: "bu Kolay bot neden roketleri yemeye dikilip duruyor." "Kolay", "Normal", "Zor" ve "Uzman"ın kaputun altında gerçekte ne anlama geldiğini kimse bilmez: Valve dört zorluk etiketi gönderdi ve tam sıfır belgeleme.

O yüzden bir grup (ben, awimii, Mush The Possum ve oyunun derlenmiş kodunu gerçekten kazan büyük kısmı yapan sigsegv) TFBot davranışına dair eksiksiz bir araştırma belgesi topladı. Her mekanik, bilinen her hata, sabit kodlanmış her olasılık. Bu makale tam tutanaktır, özet sürüm değil. Bir Bonk alın, uzun olacak.

---

## Bölüm I: Temeller

### Bot ve Kukla Bot

TF2de insanların "bot" dediği tamamen farklı iki şey vardır:

- **Yapay zekâ Botları (TFBotlar)**: gerçek yapay zekâ, Valveın *Left 4 Dead* serisi için kullandığı aynı PlayerBot/Infected çerçevesi üstüne inşa edilmiş. Rastgele bir sınıf seçerler, hedefi oynarlar, `sv_cheats` olmadan çalışırlar ve gerçek bir oyuncu gibi başarımları tetiklerler.
- **Kukla Botlar**: sıfır yapay zekâ, kendi kendine hareket ya da eylem yapamaz. Yalnızca manuel kontrol için vardırlar: bir oyuncu onları izlemeye, nişan almaya ve ateş etmeye zorlayabilir. Esas olarak testler ya da sinematik ekran görüntüleri ve videoları için kullanılır. Onları doğurmak `sv_cheats 1` gerektirir, bu da oturum için başarımları devre dışı bırakır.

Bu makale tamamen ilk tür hakkındadır.

### Yapay zekâ botlarına (aşağı yukarı) ne yaptırabiliriz

TFBotlar doğrudan kontrol edilemez ama bazı şeyleri yapmaya teşvik edilebilirler:

- Doğru sesli komutları kullanırsan herhangi bir botu (dost ya da düşman) nişangâhınla hedefleyip alay ettirebilirsin.
- Dost bir Medic botu "Medic!" sesli komutunu kullanırsan seni iyileştirir.
- Seni iyileştiren bir Medic botunun hazır UberChargeı varsa "Go go go!" ya da "Chargeı etkinleştir!" demek chargeı hemen tetikletir.
- Hazır chargeı olan bir Medic botu, kendisi ya da iyileştirme hedefi ciddi hasar alır almaz sesli komutsuz otomatik etkinleştirir.
- Botlar yakın takım arkadaşlarıyla kendiliğinden ikili alaylar (High Five) ya da grup alayları (Conga) yaparlar.

### Botları desteklenmeyen haritalarda çalıştırma

Botlar nerede yürüyebileceklerini bilmek için bir gezinme ağına bağlıdır ve çoğu topluluk haritası bunu sağlamaz. Zorlamak için:

1. `sv_cheats 1`
2. `nav_generate`: başlangıç navmeshini inşa eder, ilerleme konsolda gösterilir
3. Oyunun yolları üretmeyi bitirmesini bekle
4. İsteğe bağlı, `nav_edit 1` ile kötü gezinme verilerini manuel düzelt
5. Sunucuyu yeniden yükle ya da yeniden başlat (bu adımı atlamak başarımları devre dışı bırakır)
6. Botları doğurmak için `tf_bot_add <sayı>`

**Uyarı:** sunucuda aktif botlar varken navmeshi değiştirmek oyunu çökertebilir. Ağ mevcut olduktan sonra sonraki oturumlar için yeniden üretmen gerekmez: botları sadece `tf_bot_add` ile ekle.

Otomatik üretilmiş ağlar Kontrol Noktası, King of the Hill, Payload ve CTF haritalarında en iyi çalışır. Mannpower haritalarında botlar varsayılan CTF benzeri davranış benimser ama kancaları ya da powerupları zar zor kullanır. Bir haritanın bot yapay zekâsının tanıdığı bir hedefi yok ama doğma odası varlığı varsa `tf_bot_offense_must_push_time 0` ayarlamak botların yine de savaşmasını sağlar.

*(Bu bölümün kaynağı: resmi TF2 wiki Botlar sayfası.)*

### Güncel durum, harita harita

Hatless güncellemesi sayesinde tarihsel hatalı Spy dahil her sınıf artık düzgün çalışıyor. Botlar çoğu resmi KOTH haritasında, bazı Payload haritalarında, Dustbowl/Gorge Saldırı-Savunma ve CTF/Mann Manor haritalarında düzgün davranır. Son ikisinde onları doğrudan `tf_bot_add` ile doğuramazsın. Desteklenmeyen haritalarda (yukarıdaki nav_generate süreciyle) çalışırlar ama gerçek bir oyuncuyu taklitte belirgin kötüdürler.

PLR haritaları umutsuz vakadır: botlar Hightowerda bariyerleri geçemez ve köşelerde sıkışır, diğer tüm PLR haritalarında sadece oynamak yerine dans partisi yaparlar. Belki bir gün düzelir, belki öyle kalır.

### Botların genel davranışı

Her botun seviyesinden bağımsız yaptığı şeylerin karması:

- Botlar yalnızca temel yüklemeleri kullanır (bir eklenti onlara standart dışı silahlar dayatabilir ama vanilla botlar kendilerininkini asla seçmez).
- Kolay botlar ikincil silahını zar zor kullanır. Üst seviyeler ana şarjör boşalır boşalmaz ya da mesafeyi kapatmak için ikincile geçer.
- Botlar gelişmiş hareket tekniklerini görmezden gelir: roket zıplaması yok, bina yeri değişimi yok.
- Bir bot kill sonrası, ateş altındayken bile alay edebilir; düşman istihbaratını taşıyorsa hariç ve bu kural MvMde de geçerlidir.
- Kılık değiştirmiş Spy botları (oyuncu ya da yapay zekâ) diğer botlarca doğru görmezden gelinir: bir düşmana dokunana, bir şeyi sabote edene, ateş edene ya da yakınında görünmez olana kadar. Bir kez "keşfedilince" o belirli bot/oyuncu, görünmezken kılık değiştirip, ölüp ya da Dead Ringer ile ölüm taklidi yapana kadar Spy olarak ezberlenir.
- Pyro botları Normal seviyeden itibaren Compression Blastı bol kullanır.
- Medic botları "Medic!" diye spamlesen bile Sniperlar (ve daha az ölçüde Engineerlar) hariç herkeste iyileştirmeyi önceler.
- Medic botları Heavy, Soldier, Demoman ve Pyrolara yönelir: özellikle bu sınıfları bir *insan* oynadığında. Bu ilgi bu rollerde bir insanın varlığını izler.
- Botlar Saldırı/Savunma ve Payload haritalarında hazırlık süresinde pozisyonda kalır; serbest hareket eden Engineer, Sniper ve Spyler hariç (Demoman botlarının da yapışkan bombaları önceden yerleştirmesine izin verilir).
- Engineer botları hedeflerinin yolunda değilse dost başka bir Engineerin yapılarını asla yükseltmez ya da devre dışı bırakmaz. Bazen bariz görünse bile kendi taretini tamir etmez.
- Fark edilmiş Spy botları bıçaklamaya zorlamak yerine tabancaya geçip geri çekilir.
- Bir sentryi bulmuş (genelde bir kez üzerinde ölerek) Demoman botları geometri izin verdiğinde menzili dışından duvar ve tavanlardan kavisle yapışkan bombaları mükemmel atabilir.
- Hedef bulamayınca nişan almış Sniper botları "Negatives." seslendirmelerinden birini kullanır.
- Dost Medicler kılık değiştirmiş bir Spyi tereddütsüz iyileştirir.

### Bilinen sorunlar / hatalar

Belge uzun süredir bir sürü tuhaflık listeler:

- Botlar bazı statik aksesuarların içinden yürümeye ya da ateş etmeye çalışabilir.
- Bir oyuncu/bot her maskesini düşürdüğünde, kılık değiştirdiğinde ya da kendini belli ettiğinde yakın botlar onu "görür" ve tepki için döner: olay gerçek görüş alanları dışında olsa bile. Bu sese dayalı değildir; görüş testinin bir atlatmasıdır.
- Nadiren botlar bir Engineer ışınlayıcı kullanırken fiziksel birbirine sıkışıp kalabilir.
- Botların sesli komutları (ör. "Spy!", "İleri!") oyuncularınki gibi sohbette metin olarak görünmez.
- Aktif birini iyileştiren bir Medic botu kritik HPde bile gelen ateşlerden kaçmaz ya da sağlık kiti almaz.
- Botlar ikili alay sırasında hareket etmeye devam edebilir, bu Festive Critical Strikeın amaçlanan etkisini bozar.
- Yakın zamanda yaralanmış Medic botları menzilde Syringe Gun kullanmayı genelde reddeder, yakın dövüşü tercih eder (ya da çok nadir durumda Medi Gun ışınının kendisiyle sana dokunmaya çalışır).
- Medic botları Syringe Gun atışları için yerçekimini telafi etmez: muhtemelen silah yapay zekâ kodunda hitscan dışı olarak doğru işaretlenmemiştir.
- Spy botları bir görünmez Spyi (oyuncu ya da yapay zekâ), o Spy bir kez keşfedildiyse görüp izleyebilir; izleyen botun beceri seviyesinden bağımsız.
- Bir oyuncu Spy kendi takımının sınıfına bürünse bile düşmana çarpmak onu yine de maskesini düşürür (botlar kendilerine bunu asla yapmaz çünkü botlar asla kendi takımına bürünmez).
- Botlar otomatik takım dengelemeye saygı duyar: botları bir tarafa yığmaya çalışırsan önce `mp_teams_unbalance_limit 0` kullanmak gerekir.
- Engineer botları yok edilene kadar kendi yapılarını tamamen görmezden gelebilir.
- Heavy botları özellikle Zor seviyenin altında cephanesi bitmişken Minigun ateşlemeyi bazen dener.
- Kaybeden takımın Medic botları Yakın dövüş fazasında yakın düşman yokken ara sıra intihar eder: insan oyuncunun denese bile üretemeyeceği bir şey.
- Yükleme ekranında takım önizlemeni BLU yapmak RED botlarının sana görsel BLU işlenmiş görünmesine neden olur.
- Yakın dövüş silahı çekili botlar cephane aldıktan sonra bile bazen silah değiştirmeyi reddeder.
- Jungle Infernodan sonra açık parametrelerle doğmuş botlar (ör. `tf_bot_add 5 pyro bleu normal`) kendi doğma odasında anında ölebilir. Düzeltme: `tf_bot_reevaluate_class_in_spawnroom 0` (`sv_cheats 1` gerektirir).

### Yapay zekâ isimleri

Bot isimleri TF2, diğer Valve oyunları ve programlama kültürüne göndermelerden büyük bir havuzdan alınır, büyük ölçüde topluluk Steam forumlarında belirli olanları istemeyi bırakmadığı için. Listeden bir örnek: *AimBot, Aperture Science Prototype XR7, Black Mesa, Companion Cube, C++, Divide by Zero, GLaDOS, H@XX0RZ, Saxton Hale, The G-Man, trigger_hurt, 0xDEADBEEF* ve aynı tarzda onlarcası.

Üretime hiç gönderilmemiş sızmış kaynak derlemede bulunmuş, nedenleri pek belli olmayan bir grup isim de var: esas olarak *Last Dragon* ve *The Fifth Element* göndermeleri: *John Spartan, Leeloo Dallas Multipass, Sho'nuff, Bruce Leroy, Big Gulp Huh?* ve *I'm your huckleberry*.

Bunların hepsini kendin değiştirebilirsin: `tf_bot_add heavyweapons blue "Blu Hoovy"` "Blu Hoovy" adlı bir BLU Heavy doğurur.

---

## Bölüm II: Orijinal Botlar / TFBotlar, Beceri Seviyelerine Dalış

Sigsegvin orijinal çerçevesi hâlâ geçerli: Uzman botların Kolay botlardan açık üstün olduğu bellidir ama Valve *ne kadar* ya da *neden* olduğunu hiç açıklamadı. O yüzden bilmenin tek yolu kodu okumaktır. İşte beceriyle evrilen her mekanik.

### Zorluğu ayarlamak

MvM dışında zorluk bir cvar ile kontrol edilir:

| `tf_bot_difficulty` | Zorluk seviyesi |
| --- | --- |
| 0 | Kolay |
| 1 | Normal (varsayılan) |
| 2 | Zor |
| 3 | Uzman |

`tf_bot_add` doğrudan bir zorluk argümanı da kabul eder (`easy`/`normal`/`hard`/`expert`).

### MvM popfileları

Mann vs. Machinede popfiledaki her `TFBot` doğma bloğunun opsiyonel bir `Skill` anahtarı vardır. Anahtar yokluğu Kolay seviyeye karşılık gelir. Valve görevlerinde: Devler neredeyse hep Uzmandır, Engineerlar ve Spylar neredeyse hep Uzmandır ve Sniperlar genelde Zordur (ara sıra Uzman). Dalga sırasında harita olaylarına göre botları dinamik değiştirmek için `EventChangeAttributes` (Two Cities güncellemesinde eklendi) kullanırsan bot becerisi anında değiştirebileceğin özelliklerden biridir.

### Sonsuz MvM Modu

Sonsuz mod hiç resmi gönderilmedi ama içinde botlar oyuncular gibi paralarını yükseltmelere harcar; oyunda yapay zekâ beceri seviyesini artıran bota özel yükseltme dahil.

### `bot_generator` varlığı

Büyük ölçüde belgelenmemiş karanlık bir varlık, eğitim modunda ve belki erken MvM geliştirmede kullanılmış varsayılır. Seviyeyi kontrol için `SetDifficulty` girdisini sunar. Ötesi soğuk izdir: Valve onu hiç belgelemedi ve kimse davranışını tamamen haritalamadı.

### Göz parıltısı rengi

MvM robotlarının beceri seviyesiyle rengi değişen bir göz parıltısı parçacığı vardır, topluluk dışında kimsenin açıklamadığı görsel bir gösterge:

| Beceri | Göz rengi | RGB |
| --- | --- | --- |
| Kolay/Normal | Mavi | `#24b4ff` |
| Zor/Uzman | Sarı | `#fff000` |

![Bekleme pozisyonunda TF2 Heavy botu](assets/tf2-bot-ai-heavy-idle.png)

### Görüş: tanıma süresi

Görüş alanına bir şey girince bir bot anında tepki vermez: tehdidi yapay zekânın geri kalanının tanımasına bile izin verilmeden önce sabit kodlanmış bir gecikme vardır:

| Beceri | Minimum tanıma süresi |
| --- | --- |
| Kolay | 1,00 sn |
| Normal | 0,50 sn |
| Zor | 0,30 sn |
| Uzman | 0,20 sn |

"Kolay botlar aptal görünür" etkisinin özü tek bir sayıdadır: bir Kolay bot seni fark edince daha kötü nişan almaz, varlığını fark etmesi beş kat uzun sürer.

### Nişan: izleme hızı

Botlar seni sürekli izlemez. Konumunu ve hızını sabit aralıkla örnekler ve oradan düz bir çizgi öngörür:

| Beceri | Yeniden hesaplama aralığı | Eşdeğer hız |
| --- | --- | --- |
| Kolay | 1,00 sn | 1x/sn |
| Normal | 0,25 sn | 4x/sn |
| Zor | 0,10 sn | 10x/sn |
| Uzman | 0,05 sn | 20x/sn |

**İstisna:** Spy botları gerçek beceri seviyesi ne olursa olsun Normal izleme hızıyla sabit kodlanmıştır: Uzman bir Spy hep Normal bir bot gibi nişan alır. Hareketli 1x ve 20x farkını görmek istersen yan yana karşılaştıran herkese açık bir tanıtım videosu da vardır.

### Nişan: silaha özel beceri

Botlar sadece kütle merkezine nişan almaz: silaha göre mantıkları vardır, bazen gerçekten hatalı:

**Bombaatar ve Yapışkan Bomba Atar.** Tüm beceri seviyeleri `tf_bot_ballistic_elevation_rate` cvarının sabit değerini kullanarak dikey yayı telafi eder. Bu telafi yalnızca temel silah IDsi için etkinleştiği için daha hızlı mermili varyantlar (Loch-n-Load, mermi hızı değiştiricili her şey) doğru ayarlanmış yaya sahip değildir. Ve özellikle silah IDsiyle bağlı olduğu için Loose Cannon (farklı bir ID) hiç yay telafisi almaz.

**Huntsman.** Kolay botlar ok düşmesini telafi etmez ve headshot aramaz. Normal seviye botlar yayı telafi eder ama yalnızca 150 HU altında kafayı hedefler. Zor/Uzman botlar hep kafayı hedefler.

**Roketatar.** 150 HU ötesinde Kolay olmayan botlar kütle merkezi yerine ayaklarını hedefler, alan hasarı ve itme şansını maksimize eder. 150 HU altında headshotlara geçer. Kolay botlar mesafeden bağımsız hep kütle merkezini hedefler. Bu da silah IDsiyle kilitlidir: Direct Hit ve Cow Mangler bu davranışı kalıtmaz. Direct Hit için mantıklıdır (suistimal edilecek alan etkisi yok); Cow Mangler için sıfır anlam: yapay zekânın bu kısmı silahın varlığından öncedir ve hiç gözden geçirilmemiştir.

**Keskin nişancı tüfekleri.** Kolay gövdeyi hedefler. Normal gövdeden kafaya ~%33 hedefler. Zor/Uzman doğrudan kafayı hedefler. MvMde daha az önemlidir; bot headshotları zaten hasar bonusu almaz.

### İşitme: sessiz atışlara duyarlılık

Her silah sesi, duvarlar ardından bile yakındaki botları atıcının konumuna karşı 3000 HUye kadar %100 fark edilme şansıyla uyarır (`tf_bot_notice_gunfire_range`). Ama bir alt küme silah "sessiz" işaretlidir: yalnızca 500 HU içinde duyulur (`tf_bot_notice_quiet_gunfire_range`) ve o zaman bile beceriye bağlı şansla:

| Beceri | Sessiz atışı fark etme şansı |
| --- | --- |
| Kolay | %10 |
| Normal | %30 |
| Zor | %60 |
| Uzman | %90 |

Bu olasılık son 3 saniyede *gürültülü* bir atış duyulduysa yarıya iner: güçlü sesler zayıf sesleri maskeler.

Sessiz silah ID listesi Aralık 2010dan beri güncellenmedi. Yeni ID kullanan sonraki her ekleme mantıksal ne kadar sessiz olması gerekirse gereksin varsayılan gürültülü sayılır; daha eski bir IDyi yeniden kullanmadıkça. Somut olarak:

| Silah IDsi | Kapsar |
| --- | --- |
| `TF_WEAPON_KNIFE` | Tüm Spy bıçakları |
| `TF_WEAPON_FISTS` | Heavye özel yumruklar (çok sınıflı yumruğu aslında `TF_WEAPON_FIREAXE`dir) |
| `TF_WEAPON_PDA` | Doğrudan kullanılmadığı varsayılır |
| `TF_WEAPON_PDA_ENGINEER_BUILD` | Engineer inşa PDAi |
| `TF_WEAPON_PDA_ENGINEER_DESTROY` | Engineer yıkım PDAi |
| `TF_WEAPON_PDA_SPY` | Spy kılık kiti |
| `TF_WEAPON_BUILDER` | Spy/Engineer/Sabotajcı alet kiti |
| `TF_WEAPON_MEDIGUN` | Tüm Medi Gunlar |
| `TF_WEAPON_DISPENSER` | Muhtemelen kullanılmaz (Dispenserler eşya, silah değil) |
| `TF_WEAPON_INVIS` | Tüm Spy görünmezlik saatleri |
| `TF_WEAPON_FLAREGUN` | Manmelter *hariç* tüm Pyro işaret fişekleri |
| `TF_WEAPON_LUNCHBOX` | Sandviç, Dalokohs Bar, Buffalo Steak Sandvich, Bonk!, Crit-a-Cola |
| `TF_WEAPON_JAR` | Jarate (Mad Milk değil: ayrı ID, sessiz değil) |
| `TF_WEAPON_COMPOUND_BOW` | Huntsman |
| `TF_WEAPON_SWORD` | Eyelander, Skullcutter, Claidheamh Mor, Persian Persuader, Half-Zatoichi |
| `TF_WEAPON_CROSSBOW` | Crusader's Crossbow |

Listenin çürümesinin klasik örneği: Manmelter kendi ID'sini aldı (`TF_WEAPON_RAYGUN_REVENGE`), sessiz silah listesi dondurulduktan sonra eklendi, o yüzden pratik her anlamda işaret fişeği olmasına rağmen gürültülü sayılır. Daha da sonra çıkan Scorch Shot temel `TF_WEAPON_FLAREGUN` IDyi yeniden kullanır ve bu yüzden hâlâ sessiz sayılır. Saçma ama kod bu.

### Strateji: tehdit önceliği

Aynı anda birden çok düşman görünürken botlar mesafeyi, üzerlerine ateş açılıp açılmadığını ve Kolayın üstünde ana tehdidin iyileştirilip iyileştirilmediğini ağırlıklandırır:

| Beceri | Onun yerine şifacıyı mı hedefler? |
| --- | --- |
| Kolay | Hayır |
| Normal | %50 şans |
| Zor | Evet |
| Uzman | Evet |

500 HU ötesindeki düşmanlar normalde acil dışı olarak önceliksizleştirilir. İstisnalar: Zor/Uzman botları uzak Medic ve Engineerları hep acil tehdit sayar ve kabaca sana doğru nişan alan her düşman Sniper mesafe ve beceriden bağımsız hep acil sayılır.

| Beceri | Uzak Medic/Engineer/Nişan alan Sniper = acil tehdit mi? |
| --- | --- |
| Kolay/Normal | Hayır |
| Zor/Uzman | Evet |

Bu Sniper kontrolünün anlatmayı hep sevdiğim şaşırtıcı bir hikâyesi vardır. Sigsegvin orijinal yazısı oyunun sniperın nişan vektörü ile botun göreli konumu arasındaki nokta çarpımın *tam sıfır* olmasını gerektirdiğini varsayıyordu: kayan noktada neredeyse hiç tetiklenmeyecek kadar hassas bir karşılaştırma, tüm işlevi fiilen ölü kod yapardı. Sonra yayınlanan bir düzeltme (daha temiz bir Hex-Rays derlemesine borçlu) gerçek kontrolün `nokta çarpım > 0` olduğunu gösterdi: doğrudan sana dönükten sana dik olana kadar yüzü dönük her Sniper acil tehdit sayılır; dikten arkası dönüğe giden hiçbir şey sayılmaz. Orijinal yanlış okuma kayan noktalı SSE karşılaştırmasının kötü derlemesinden geliyordu. AAA ikili üzerinde tersine mühendislik yaklaşık bir egzersiz olmaya devam ediyor.

### Hareket: kaçınma

Kolay botlar asla kaçınmaz, nokta. Normal ve üstü botlar bir savaş silahı tutarken, son 3 saniyede bir düşman görmüşken ve bu düşmanın üzerlerinde görüş hattı varken sola/sağa kaçınır (%33 sol, %33 sağ, %33 hiçbir şey yapma, tespitli çukurlara karşı ağırlıklı).

Şu durumlardan biri geçerliyse kaçınMAzlar: `DisableDodge` özniteliği ayarlı, mevcut davranış acele et diyor, şu an yenilmez (herhangi bir uber), tam alay/tahrikte, Engineer oynuyor, Spy olarak görünmez ya da kılık değiştirmiş, Sniper olarak nişan alıyor ya da Heavy olarak dönüyor, ya da Huntsmanı geriyor.

### Hareket: düşmanlara çarpmaktan kaçınma

Normalin üstünde botlar hareket ederken özellikle düşmanların içine girmemeye çalışır:

| Beceri | Düşmanlara çarpmaktan kaçınır mı? |
| --- | --- |
| Kolay | Hayır |
| Normal | Hayır |
| Zor | Evet |
| Uzman | Evet |

Pratikte bu yalnızca Spy botları için önemlidir: düşman oyuncuyla sakar bir çarpışmadan kaçınmak kılık bozan türden bir şeydir.

### Pyro: airblast ustalığı

airblast iki şeye yarar: mermileri yansıtmak (PvP ve MvM) ve düşmanları kenarlardan itmek (yalnızca PvP). Botun geçerli bir fırsat karşısında tetiğe basıp basmaması beceriye dayalı yazı turadır:

| Beceri | airblast tetikleme şansı |
| --- | --- |
| Kolay | %0 |
| Normal | %50 |
| Zor | %90 |
| Uzman | %100 |

Kolay Pyro botları kelimenin tam anlamıyla airblast yapamaz: çekiliş asla başarmayacak şekilde sabit kodlanmıştır, sadece "nadiren" değil.

### Spy: kılık etkinliği

Beceriye göre iki ayrı eksen evrilir. *Kılık* seçimi:

| Beceri | Kılık yöntemi |
| --- | --- |
| Kolay/Normal | Rastgele sınıf, düşman takımın gerçekte ne oynadığını görmezden gelir |
| Zor/Uzman | Gerçek bir düşman oyuncu seçer ve tam sınıfını kopyalar |

Kılıkta *davranış*:

| Beceri | Kılıkta/görünmezlikte davranış |
| --- | --- |
| Kolay/Normal | Görünce düşman oyunculara diker (şüpheli) |
| Zor/Uzman | Bilerek göz temasından kaçınır (daha inandırıcı) |

### Spy: backstab saldırganlığı

Uzun menzilde (300 HUye kadar, `tf_bot_spy_knife_range`) bir Spy botu kurbanı görebiliyorsa ve kurbanın sırtı en az kısmen dönükse backstabe girişir. Beceri sırt açısının ne kadar merkez dışı olabileceğini belirler:

| Beceri | Açı toleransı |
| --- | --- |
| Kolay | Doğrudan yüzüne bakıyorsan bile dener |
| Normal | Sırtından ±45° |
| Zor | Sırtından ±78° |
| Uzman | Sırtından ±90° (tam 180° arka yay) |

Kolay Spy botları işlevsel intiharcıdır: gözlerinin içine bakan birini bıçaklamaya çalışırlar. **İstisna:** Mann vs. Machinede her Spy botu gerçek beceri seviyesi ne olursa olsun Normal açı kısıtına zorlanır.

### Taktikler: silah seçimi

Bu mantık yalnızca Kolayın üstündeki seviyeleri ilgilendirir, MvMde ilgisi azdır çünkü botların orada genelde katı silah kısıtları vardır:

- **Scout**: birincilin şarjörü boşalınca ikincile geçer.
- **Soldier**: şarjör boşsa *ve* hedef 500 HU altındaysa ikincile geçer.
- **Sniper**: 750 HU altındaki hedefler için ikincile geçer.
- **Pyro**: hedef Soldier ya da Demoman değilse 750 HU üstündeki hedefler için ikincile geçer.

### Taktikler: siperde yeniden doldurma

MvMde olmayan mantık. Botun mevcut davranışı geri çekilmesini söylemiyorsa, ana şarjörü boşsa ve ubersiz savunmasız kalıyorsa üst seviye botlar boş silahla suratına tıklamak yerine yeniden doldurmak için geçici sipere çekilir:

| Beceri | Doldurmak için çekilir mi? |
| --- | --- |
| Kolay | Hayır |
| Normal | Hayır |
| Zor | Evet |
| Uzman | Evet |

### CP Modu: savunmacı başıboşluğu

MvMde olmayan mantık. Bir kontrol noktasını savunurken üst seviye botların noktayı kill kovalamak için terk etme ("ara ve yok et") olasılığı daha yüksektir ama yalnızca `tf_bot_defense_must_defend_time` üzerinde yeterli süre varken:

| Beceri | Başıboşluk şansı |
| --- | --- |
| Kolay | %10 |
| Normal | %50 |
| Zor | %75 |
| Uzman | %90 |

### CP Modu: ele geçirme engelleme

MvMde olmayan mantık. Düşman ele geçirme girişimine itiraz eden savunmacı botlar:

| Beceri | Ele geçirmeyi engellemeye çalışır mı? |
| --- | --- |
| Kolay | Hayır |
| Normal | %50 şans |
| Zor | Evet |
| Uzman | Evet |

---

## Tam özet tablosu

<div style="overflow-x:auto">

| Yön | Kolay | Normal | Zor | Uzman | Notlar |
| --- | --- | --- | --- | --- | --- |
| Görüş: tanıma süresi | 1,00 sn | 0,50 sn | 0,30 sn | 0,20 sn | |
| Nişan: izleme hızı | 1x/sn | 4x/sn | 10x/sn | 20x/sn | Spylar hep Normal kullanır |
| Bombaatar/yapışkan yay telafisi | Evet | Evet | Evet | Evet | Loose Cannon muaf |
| Huntsman dikey telafisi | Hayır | Evet | Evet | Evet | |
| Huntsman headshotları | Hayır | <150 HU | Evet | Evet | |
| Roketatar ayak atışı | Hayır | Evet | Evet | Evet | Direct Hit ve Cow Mangler muaf |
| Keskin nişancı tüfeği nişan noktası | Gövde | kafaya ~%33 | Kafa | Kafa | |
| Sessiz atışları fark etme şansı | %10 | %30 | %60 | %90 | Gürültülü atışlarla maskelenirse yarıya iner |
| Şifacıyı hedefler | Hayır | %50 | Evet | Evet | |
| Uzak Medic/Engineer/Nişan alan Sniper = tehdit | Hayır | Hayır | Evet | Evet | |
| Kaçınma | Hayır | Evet | Evet | Evet | Uzun istisna listesi |
| Düşmanlara çarpmaktan kaçınma | Hayır | Hayır | Evet | Evet | Spy için önemli |
| airblast tetikleme şansı | %0 | %50 | %90 | %100 | |
| Spy kılık sınıfı seçimi | Rastgele | Rastgele | Gerçek düşmana uyar | Gerçek düşmana uyar | |
| Kılıkta Spy göz teması | Diker (bariz) | Diker | Kaçınır (inandırıcı) | Kaçınır | |
| Spy backstab açısı | ~0° | ±45° | ±78° | ±90° | MvM Normal zorlar |
| Silah seçimi mantığı | Hayır | Evet | Evet | Evet | MvMde daha az ilgili |
| Siperde yeniden doldurma | Hayır | Hayır | Evet | Evet | MvMde yok |
| CP savunmacı başıboşluğu | %10 | %50 | %75 | %90 | MvMde yok |
| CP ele geçirme engelleme | Hayır | %50 | Evet | Evet | MvMde yok |

</div>

---

## Sonuç

![Minigunla nişan alan TF2 Heavy botu](assets/tf2-bot-ai-heavy-aim.png)

Bütün bunlar Valvedan bilinçli bir sistemi yansıtır: tamamen deterministik skorlar ve olasılıklar, sadece resmi hiç belgelenmemiş. Bu dalıştan sonra aklımda kalan noktalar:

1. **"Beceri" global bir çarpan değil, bağımsız imleçler kümesidir.** Tepki süresi, nişan hızı ve her taktik davranış ayrı evrilir ve bazıları (Spy izleme hızı, MvM backstab açısı) seviyeden bağımsız sabit kodlanmış geçersiz kılmalara sahiptir.
2. **Bir kısmı gerçekten hatalı, sadece eski değil.** 2010dan beri donmuş sessiz silah listesi, hiçbir geçerli nedensiz ayak atış mantığsız Cow Mangler, doğru derlenmesi yıllar alan Sniper nokta çarpım kontrolü: Valve yapay zekâ kodunun 17 yıllık herhangi bir kod tabanı gibi yara izleri vardır.
3. **Bütün bunları kullanabilirsin.** Normalde bir Sniper botunun sana headshot atmayacağını, Kolay bir Pyronun roketini kelimenin tam anlamıyla yansıtamayacağını, Kolay bir Spyin suratına bıçaklamaya çalışacağını bil. Bu şans değildir. Bu teknik föydür.

Kodu orijinal kazan ve bunun çoğunu mümkün kılan sigsegve, bot komutları ve harita desteğine dair temel belgeler için TF2 wikisine ve 17 yıllık bir bot yapay zekâsını tam ne yaptığını anlamak için kurcalamaya devam eden topluluktaki herkese muazzam teşekkürler.
