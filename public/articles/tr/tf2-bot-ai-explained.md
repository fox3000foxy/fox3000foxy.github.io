---
title: "TF2 Botları Rastgele Değil: Her Zorluk Ayarını Tersine Mühendislikle Çözdüm"
description: "Görüş, nişan alma takibi, casus bıçaklama açıları, nişancı kafa vuruşu mantığı, bilinen her hata -- Valve bunların hiçbirini belgelemedi. Biz de kodu inceledik ve tam bir teknik şartname haline getirdik."
date: 2026-07-12
authors:
  - fox3000foxy
tags:
  - tf2
  - game-ai
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "fZ9nzT/SX8uQKBA+UFDhcV8QJ49AybeABViQHeFB4m/5T0hDnZ/e2vw1AN/TLrIbaMl2cwp8vZF8jqvU4bi/GA=="
---

## Giriş

![TF2 Soldier bot roketatarla nişan alıyor](assets/tf2-bot-ai-soldier-aim.png)

Her TF2 oyuncusu en az bir kez şöyle demiştir: "bu bot hile yapıyor." Ya da tam tersi: "neden bu Kolay bot öylece durup roket yiyor?" Kimse "Kolay," "Normal," "Zor" ve "Uzman" seviyelerinin perde arkasında gerçekte ne *anlama* geldiğini bilmiyor -- Valve dört zorluk etiketi ve sıfır dokümantasyon yayınladı.

Biz de bir grup insan (ben, awimii, Mush The Possum ve temel çalışmaların büyük kısmını yapan, derlenmiş oyun kodunu didik didik eden sigsegv) TFBot davranışları hakkında kapsamlı bir araştırma belgesi hazırladık. Her mekanik, bilinen her hata, sabit kodlanmış her olasılık. Bu makale tam yazı, kısaltılmışı değil. Bir Bonk alın, uzun bir yazı olacak.

---

## Bölüm I: Temel Bilgiler

### Bot vs Kukla Bot

TF2'de insanların "bot" dediği iki tamamen farklı şey vardır:

- **Yapay zeka botları (TFBot'lar)**: gerçek yapay zeka, Valve'ın *Left 4 Dead* serisinde kullandığı PlayerBot/Infected altyapısı üzerine inşa edilmiştir. Rastgele bir sınıf seçerler, hedefe yönelik oynarlar, `sv_cheats` olmadan çalışırlar ve gerçek bir oyuncu gibi başarımları tetiklerler.
- **Kukla botlar**: sıfır yapay zeka, kendi başlarına hareket edemez veya iş yapamazlar. Tamamen manuel kontrol için vardırlar -- bir oyuncu onları takip etmeye, nişan almaya ve ateş etmeye zorlayabilir, çoğunlukla test etmek veya sinematik ekran görüntüleri/videoları çekmek için kullanılır. Onları oluşturmak `sv_cheats 1` gerektirir ve bu da oturum boyunca başarımları devre dışı bırakır.

Bu makale tamamen birinci tür hakkındadır.

### Yapay zeka botlarına (bir şekilde) ne yaptırılabilir?

TFBot'lar doğrudan kontrol edilemez, ancak onları yönlendirebileceğiniz kısa bir liste vardır:

- Nişangahınızı herhangi bir bota (dost veya düşman) doğrultun ve doğru ses komutlarını kullanırsanız size karşılık verir.
- Dost bir Medic botu, "Medic!" ses komutunu kullanırsanız sizi iyileştirir.
- Bir Medic botu sizi iyileştiriyorsa ve ÜberCharge'ı hazırsa, "Go go go!" veya "Activate charging!" demek şarjı anında kullanmasını sağlar.
- Şarjı hazır olan bir Medic botu, kendisi veya iyileştirdiği hedef ciddi hasar aldığında, ses komutuna gerek kalmadan otomatik olarak şarjı patlatır.
- Botlar, yakındaki takım arkadaşlarıyla kendiliğinden partner taklitleri (High Five) veya grup taklitleri (Conga) yaparlar.

### Desteklenmeyen haritalarda botları çalıştırma

Botlar, nerede yürüyebileceklerini bilmek için bir navigasyon ağına ihtiyaç duyar ve çoğu topluluk haritası bununla birlikte gelmez. Zorlamak için:

1. `sv_cheats 1`
2. `nav_generate` -- ilk navmesh'i oluşturur, ilerleme konsolda gösterilir
3. Oyunun yolları oluşturmayı bitirmesini bekleyin
4. İsteğe bağlı olarak `nav_edit 1` ile hatalı nav verilerini manuel olarak düzeltin
5. Sunucuyu yeniden yükleyin veya yeniden başlatın (bunu atlamak başarımları devre dışı bırakır)
6. Botları oluşturmak için `tf_bot_add <sayı>`

**Uyarı:** botlar sunucuda aktifken navmesh'i değiştirmek oyunu çökertebilir. Mesh bir kere oluştuktan sonra gelecekteki oturumlar için yeniden oluşturmanız gerekmez -- sadece `tf_bot_add` ile botları tekrar ekleyin.

Otomatik oluşturulan mesh'ler en iyi Kontrol Noktası, Tepenin Kralı, Payload ve CTF haritalarında çalışır. Mannpower haritalarında botlar varsayılan olarak CTF tarzı oynar ancak kanca veya güçlendirmeleri pek kullanmazlar. Bir haritanın bot yapay zekasının tanıdığı bir hedefi yoksa ancak bir doğum odası varlığı varsa, `tf_bot_offense_must_push_time 0` ayarını yapmak botların yine de savaşmasını sağlar.

*(Bu bölümün kaynağı: resmi TF2 Wiki'nin Botlar sayfası.)*

### Güncel durum, harita harita

Hatless güncellemesi sayesinde, tarihsel olarak hatalı Casus da dahil olmak üzere her sınıf artık doğru çalışıyor. Botlar çoğu resmi KOTH haritasında, bazı Payload haritalarında, Dustbowl/Gorge Attack-Defense haritalarında ve CTF/Mann Manor haritalarında düzgün davranıyor -- ancak son ikisinde onları doğrudan `tf_bot_add` ile oluşturamazsınız. Desteklenmeyen haritalarda (yukarıdaki nav_generate süreciyle) çalışıyorlar, ancak gerçek bir oyuncuyu taklit etmede belirgin şekilde daha kötüler.

PLR haritaları kayıp bir dava: botlar Hightower'daki bariyerleri temizleyemiyor ve köşelere sıkışıyor, diğer tüm PLR haritalarında ise oyun oynamak yerine... dans partisi yapıyorlar. Bu bir gün düzeltilebilir. Düzeltilmeyebilir de.

### Genel bot davranışı

Zorluktan bağımsız olarak her botun yaptığı şeyler:

- Botlar yalnızca stok yüklemeleri kullanır (bir eklenti stok olmayan silahları zorlayabilir, ancak çıplak botlar kendi silahlarını asla seçmez).
- Kolay botlar ikincil silahlarına neredeyse hiç dokunmaz. Yüksek zorluklar, ana silahları biter bitmez veya menzili telafi etmek için ikincile geçer.
- Botlar hareket teknikleri yapamaz -- roket zıplaması, bina taşıma gibi şeyler yok.
- Bir öldürmeden sonra, bir bot ateş altındayken bile taklit yapabilir -- düşman istihbaratını taşırken hariç, bu kural MvM'de de geçerlidir.
- Gizlenmiş Casus botları (oyuncu veya yapay zeka), bir düşmana dokunana, bir şeyi sabote edene, ateş edene veya yakınlarında görünmez olana kadar diğer botlar tarafından doğru şekilde yok sayılır. "Açığa çıktıktan" sonra, o belirli bot/oyuncu, görünmez kalırken kılık değiştirene, ölene veya Dead Ringer ile ölüm taklidi yapana kadar Casus olarak hatırlanır.
- Pyro botları, Kolay'ın üzerindeki her zorlukta Sıkıştırma Patlaması'nı cömertçe kullanır.
- Medic botları, "Medic!" diye ne kadar spam yaparsanız yapın, herkesi iyileştirmeyi Nişancılara (ve daha az ölçüde Mühendislere) tercih eder.
- Medic botları, Ağır Sıkletler, Askerler, Bombacılar ve Pyrolara yönelir -- özellikle de bir *insan* bu sınıfları oynuyorsa. Bu rollerde insan yoksa, Medic'in özel bir ilgisi olmaz.
- Botlar, Saldırı/Savunma ve Payload haritalarında hazırlık süresi boyunca pozisyon korur -- Mühendisler, Nişancılar ve Casuslar hariç, onlar serbestçe hareket eder (Bombacı botlarının da önceden sticky yerleştirmesine izin verilir).
- Mühendis botları, başka bir dost Mühendisin binalarını asla yükseltmez veya sabote etmezi temizlemez, meğerki o bina hedeflerinin yolunda olmasın. Ayrıca bazen... güvenli olsa bile kendi taretlerini tamir etmezler.
- Fark edilen Casus botları, bıçaklamayı zorlamak yerine tabancalarına geçip geri çekilirler.
- Bir sentryi tespit etmiş Bombacı botları (genellikle ona bir kez ölerek), menzil dışından mükemmel bir şekilde sticky bombalarını fırlatabilir, geometri izin verdiğinde duvarların ve tavanların etrafından dolaştırabilir.
- Nişancı botları, nişan aldıktan sonra hedef bulamazsa "Negatif" ses satırlarından birini kullanır.
- Dost Medic'ler, gizlenmiş bir Casusu tereddüt etmeden iyileştirir.

### Bilinen sorunlar / hatalar

Belge, uzun süredir var olan bir dizi tuhaflığı listeler:

- Botlar, bazı sabit sahne dekorlarının içinden yürümeye veya ateş etmeye çalışabilir.
- Bir oyuncu/bot maske çıkardığında, kılık değiştirdiğinde veya açığa çıktığında, yakındaki botlar onu "görür" ve tepki vermek için döner -- bu olay gerçek görüş alanları dışında gerçekleşse bile. Ses tabanlı değildir; görüş kontrolünü atlayan bir durumdur.
- Nadiren, botlar bir Mühendis teleporter'ını kullanırken fiziksel olarak birbirine sıkışabilir.
- Bot ses komutları (örn. "Spy!", "Forward!"), oyuncularınki gibi sohbet metni olarak görüntülenmez.
- Birini aktif olarak iyileştiren Medic botu, kritik derecede düşük canı olsa bile gelen ateşten kaçmaz veya sağlık kitleri almaz.
- Botlar, bir partner taklidi yaparken hareket etmeye devam edebilir, bu da Festive Critical Strike'ın amaçlanan etkisini bozar.
- Yakın zamanda hasar almış Medic botları, menzilde Şırınga Tabancası'nı kullanmayı reddedip yakın dövüşü tercih eder (veya çok nadir durumlarda, size Medi Gun ışınıyla vurmaya çalışır).
- Medic botları, Şırınga Tabancası atışlarında yerçekimi düşüşünü telafi etmez -- muhtemelen silah, yapay zeka kodunda hitscan olmayan olarak doğru şekilde işaretlenmediği için.
- Casus botları, gizlenmiş bir Casusu (oyuncu veya yapay zeka), o Casus bir kez bile gizliliğini ifşa etmişse, izleyen botun beceri seviyesinden bağımsız olarak görebilir ve takip edebilir.
- Bir oyuncu-Casus kendi takımının sınıfı gibi gizlense bile, bir düşmana çarpmak onu hala ele verir (botlar bunu kendilerine asla yapmaz, çünkü botlar asla kendi takımları gibi gizlenmez).
- Botlar takım otomatik dengesine saygı duyar -- botları bir takımda yığmaya çalışıyorsanız, önce `mp_teams_unbalance_limit 0` gerekir.
- Mühendis botları, kendi binalarını yok olana kadar tamamen görmezden gelebilir.
- Ağır Sıklet botları, çoğunlukla Zor zorluğunun altında, kritik derecede düşük cephaneyken Minigun'u ateşlemeye çalışabilir.
- Kaybeden takımın Medic botları, yakınlarda düşman yokken Aşağılama aşamasında bazen intihar eder -- bir insan oyuncunun denese bile tekrarlayamayacağı bir şey.
- Yükleme ekranı takım önizlemenizi BLU olarak ayarlamak, RED botlarının size BLU olarak görünmesini sağlar.
- Yakın dövüş silahı çıkarmış botlar, cephane aldıktan sonra bile bazen silah değiştirmeyi reddeder.
- Jungle Inferno sonrası, açık parametrelerle oluşturulan botlar (örn. `tf_bot_add 5 pyro blue normal`) kendi doğum odalarında anında ölebilir. Düzeltme: `tf_bot_reevaluate_class_in_spawnroom 0` (`sv_cheats 1` gerektirir).

### Yapay zeka isimleri

Bot isimleri, TF2, diğer Valve oyunları ve programlama kültürüne referanslar içeren geniş bir havuzdan çekilir, büyük ölçüde topluluğun Steam forumlarında belirli isimleri talep etmesi nedeniyle. Listenin bir örneği: *AimBot, Aperture Science Prototype XR7, Black Mesa, Companion Cube, C++, Divide by Zero, GLaDOS, H@XX0RZ, Saxton Hale, The G-Man, trigger_hurt, 0xDEADBEEF* ve bu minvalde düzinelerce daha.

Ayrıca, sızdırılmış bir kaynak yapısında bulunan ancak net olmayan nedenlerle üretime hiç gönderilmemiş bir dizi isim daha vardır -- çoğunlukla *Last Dragon* ve *The Fifth Element* referansları: *John Spartan, Leeloo Dallas Multipass, Sho'nuff, Bruce Leroy, Big Gulp Huh?* ve *I'm your huckleberry*.

Bunların hepsini kendiniz geçersiz kılabilirsiniz: `tf_bot_add heavyweapons blue "Blu Hoovy"`, "Blu Hoovy" adlı bir BLU Ağır Sıklet oluşturur.

---

## Bölüm II: Orijinal Botlar / TFBot'lar -- Beceri Seviyesi Derinlemesine İnceleme

Sigsegv'in orijinal çerçevesi hâlâ geçerlidir: Uzman botların Kolay botları geride bıraktığı açıktır, ancak Valve *ne kadar* veya *neden* olduğunu asla açıklamadı. Tek yol kodu okumaktır. İşte beceriyle ölçeklenen her mekanik.

### Zorluk ayarlama

MvM dışında, zorluk tek bir cvar ile kontrol edilir:

| `tf_bot_difficulty` | Beceri seviyesi |
| --- | --- |
| 0 | Kolay |
| 1 | Normal (varsayılan) |
| 2 | Zor |
| 3 | Uzman |

`tf_bot_add` ayrıca doğrudan bir zorluk argümanı kabul eder (`easy`/`normal`/`hard`/`expert`).

### MvM pop dosyaları

Mann vs. Machine'de, pop dosyasındaki her `TFBot` oluşturma bloğunda isteğe bağlı bir `Skill` anahtarı bulunur. Anahtar yoksa Kolay anlamına gelir. Valve'ın kendi görevlerinde: Devler neredeyse her zaman Uzman, Mühendisler ve Casuslar neredeyse her zaman Uzman ve Nişancılar genellikle Zor'dur (ara sıra Uzman). Botları harita olaylarına göre dalga ortasında dinamik olarak değiştirmek için `EventChangeAttributes` (İki Şehir güncellemesinde eklendi) kullanıyorsanız, bot becerisi anında değiştirmenize izin verilen özelliklerden biridir.

### MvM Sonsuz Mod

Sonsuz mod hiçbir zaman resmi olarak yayınlanmadı, ancak bu modda botlar tıpkı oyuncular gibi paralarını yükseltmelere harcar -- oyun ortasında yapay zeka beceri seviyelerini artıran bota özel bir yükseltme de dahil.

### `bot_generator` varlığı

Eğitim modunda ve muhtemelen erken MvM geliştirmesinde kullanıldığı düşünülen, belirsiz, büyük ölçüde belgelenmemiş bir varlık. Beceri seviyesini kontrol etmek için bir `SetDifficulty` girdisi sunar. Bunun ötesinde iz kaybolur -- Valve onu asla belgelemedi ve kimse davranışını tam olarak haritalamadı.

### Göz parıltısı rengi

MvM robotlarının, beceri seviyesine göre renk değiştiren bir göz parıltısı parçacığı vardır -- topluluk dışında kimsenin açıklamadığı görsel bir ipucu:

| Beceri | Göz rengi | RGB |
| --- | --- | --- |
| Kolay/Normal | Mavi | `#24b4ff` |
| Zor/Uzman | Sarı | `#fff000` |

![TF2 Heavy bot bekleme pozisyonunda](assets/tf2-bot-ai-heavy-idle.png)

### Görüş: tanıma süresi

Bir bot, bir şey görüş alanına girer girmez tepki vermez -- yapay zekanın tehdidi kabul etmesine izin verilmeden önce sabit kodlanmış bir gecikme vardır:

| Beceri | Minimum tanıma süresi |
| --- | --- |
| Kolay | 1.00 s |
| Normal | 0.50 s |
| Zor | 0.30 s |
| Uzman | 0.20 s |

"Kolay botlar aptal hissettiriyor" etkisinin çoğu tek bir sayıdadır -- bir Kolay bot sizi fark ettiğinde daha kötü nişan almaz, sadece var olduğunuzu fark etmesi beş kat daha uzun sürer.

### Nişan: takip hızı

Botlar sizi sürekli takip etmez. Konumunuzu ve hızınızı sabit bir aralıkta örnekler ve oradan düz bir çizgi tahmin ederler:

| Beceri | Yeniden hesaplama aralığı | Eşdeğer hız |
| --- | --- | --- |
| Kolay | 1.00 s | 1x/sn |
| Normal | 0.25 s | 4x/sn |
| Zor | 0.10 s | 10x/sn |
| Uzman | 0.05 s | 20x/sn |

**İstisna:** Casus botları, gerçek beceri seviyelerinden bağımsız olarak Normal takip hızına sabit kodlanmıştır -- bir Uzman Casus hâlâ Normal bir bot gibi nişan alır. Ayrıca, 1x'e karşı 20x farkını hareket halinde görmek isterseniz, takip hızlarını yan yana karşılaştıran halka açık bir gösterim videosu da vardır.

### Nişan alma: silaha özgü beceri

Botlar sadece kütle merkezinize nişan almaz -- silah başına mantıkları vardır, bazıları gerçekten hatalıdır:

**Bombaatar ve Yapışkan Bombaatar.** Tüm beceri seviyeleri, `tf_bot_ballistic_elevation_rate` cvar'ından sabit bir değer kullanarak dikey yayı telafi eder. Bu telafi yalnızca temel silah kimliği için çalıştığından, daha hızlı mermi varyantları (Loch-n-Load, mermi hızı değiştiricili herhangi bir şey) doğru ayarlanmış yaylar alamaz. Ve silah kimliğine göre anahtarlandığı için, Loose Cannon -- tamamen farklı bir kimlik -- hiç yay telafisi almaz.

**Huntsman.** Kolay botlar ok düşüşünü telafi etmez ve asla kafa vuruşu yapmaz. Normal beceri botları yayı telafi eder, ancak yalnızca 150 HU içinde kafayı hedefler. Zor/Uzman botlar her zaman kafaya gider.

**Roketatarlar.** 150 HU'nun ötesinde, Kolay olmayan botlar kütle merkezi yerine ayaklarınıza nişan alır, sıçrama hasarını ve geri tepme şansını maksimize eder. 150 HU içinde kafa vuruşlarına geçerler. Kolay botlar menzilden bağımsız olarak her zaman kütle merkezine nişan alır. Bu da silah kimliğine kilitlidir: Direct Hit ve Cow Mangler bu davranışı devralmaz. Direct Hit için mantıklıdır (kullanılacak AoE yoktur); Cow Mangler için hiçbir anlam ifade etmez -- yapay zekanın bu kısmı silahın var olmasından öncedir ve asla güncellenmemiştir.

**Nişancı Tüfekleri.** Kolay vücuda nişan alır. Normal, vücuttan kafaya yaklaşık %33 oranında nişan alır. Zor/Uzman doğrudan kafaya nişan alır. MvM'de daha az önemlidir, çünkü bot kafa vuruşları zaten hasar bonusu almaz.

### Duyma: gizli atışlara duyarlılık

Her silah sesi, yakındaki botları atıcının konumuna karşı uyarır, duvarların içinden bile, 3000 HU'ya kadar %100 fark etme şansıyla (`tf_bot_notice_gunfire_range`). Ancak bir alt küme silah "gizli" olarak işaretlenmiştir -- yalnızca 500 HU içinde duyulabilir (`tf_bot_notice_quiet_gunfire_range`) ve o zaman bile beceriye bağlı bir şansla:

| Beceri | Gizli atışı fark etme şansı |
| --- | --- |
| Kolay | %10 |
| Normal | %30 |
| Zor | %60 |
| Uzman | %90 |

Son 3 saniye içinde *yüksek* bir atış duyulduysa bu olasılık yarıya iner -- yüksek sesler sessizleri maskeler.

Gizli silah kimliği listesi Aralık 2010'dan beri güncellenmemiştir. Bu tarihten sonra yepyeni bir silah kimliği kullanılarak eklenen herhangi bir şey, mantıksal olarak ne kadar sessiz olması gerekirse gereksin, varsayılan olarak yüksek sesli kabul edilir -- meğerki eski bir kimliği yeniden kullanmış olsun. Somut olarak:

| Silah kimliği | Kapsadıkları |
| --- | --- |
| `TF_WEAPON_KNIFE` | Tüm Casus bıçakları |
| `TF_WEAPON_FISTS` | Ağır Sıklet'e özel yumruklar (çok sınıflı yumruğu aslında `TF_WEAPON_FIREAXE`) |
| `TF_WEAPON_PDA` | Doğrudan kullanılmadığı düşünülüyor |
| `TF_WEAPON_PDA_ENGINEER_BUILD` | Mühendis'in İnşa PDA'sı |
| `TF_WEAPON_PDA_ENGINEER_DESTROY` | Mühendis'in Yıkım PDA'sı |
| `TF_WEAPON_PDA_SPY` | Casus'un kılık değiştirme seti |
| `TF_WEAPON_BUILDER` | Casus'un Mühendis/Sapper araç seti |
| `TF_WEAPON_MEDIGUN` | Tüm Medi Gun'lar |
| `TF_WEAPON_DISPENSER` | Muhtemelen kullanılmamıştır (Dağıtıcılar nesnedir, silah değildir) |
| `TF_WEAPON_INVIS` | Tüm Casus görünmezlik saatleri |
| `TF_WEAPON_FLAREGUN` | Manmelter *hariç* tüm Pyro işaret fişek tabancaları |
| `TF_WEAPON_LUNCHBOX` | Sandviç, Dalokohs Bar, Buffalo Biftek Sandviçi, Bonk!, Crit-a-Cola |
| `TF_WEAPON_JAR` | Jarate (Mad Milk değil -- ayrı, gizli olmayan kimlik) |
| `TF_WEAPON_COMPOUND_BOW` | Huntsman |
| `TF_WEAPON_SWORD` | Eyelander, Skullcutter, Claidheamh Mòr, Persian Persuader, Half-Zatoichi |
| `TF_WEAPON_CROSSBOW` | Crusader's Crossbow |

Listenin çürüdüğünün klasik örneği: Manmelter, gizli liste dondurulduktan sonra eklenen kendi kimliğini (`TF_WEAPON_RAYGUN_REVENGE`) aldı -- bu yüzden her pratik anlamda bir işaret fişek tabancası olmasına rağmen yüksek sesli kabul edilir. Daha sonra çıkan Scorch Shot, temel `TF_WEAPON_FLAREGUN` kimliğini yeniden kullanır ve bu nedenle hâlâ gizli kabul edilir. Mantıksız, ama kod böyle.

### Strateji: tehdit önceliklendirmesi

Aynı anda birden fazla düşman görünür olduğunda, botlar mesafe, ateş altında olup olmadıkları ve -- Kolay'ın üzerinde -- birincil tehdidin iyileştirilip iyileştirilmediğini değerlendirir:

| Beceri | Bunun yerine iyileştiriciyi hedefler? |
| --- | --- |
| Kolay | Hayır |
| Normal | %50 şans |
| Zor | Evet |
| Uzman | Evet |

500 HU'nun ötesindeki düşmanlar normalde acil olmayan olarak önceliksizleştirilir. İstisnalar: Zor/Uzman botlar uzaktaki Medic'leri ve Mühendisleri her zaman acil tehdit olarak görür ve kabaca size doğru nişan alan herhangi bir düşman Nişancı, mesafe ve beceriden bağımsız olarak her zaman acil kabul edilir.

| Beceri | Uzaktaki Medic'ler/Mühendisler/nişan alan Nişancılar = acil tehdit? |
| --- | --- |
| Kolay/Normal | Hayır |
| Zor/Uzman | Evet |

Bu Nişancı kontrolünün gerçekten eğlenceli bir geçmişi vardır. Sigsegv'in orijinal yazısı, oyunun nişancının nişan vektörü ile botun göreceli konumu arasındaki nokta çarpımının *tam olarak sıfır* olmasını gerektirdiğini varsaydı -- kayan nokta matematiğinde neredeyse hiç tetiklenmeyecek kadar hassas bir karşılaştırma, tüm özelliği fiilen ölü kod haline getiriyor. Daha sonra yapılan bir düzeltme (daha temiz bir Hex-Rays derlemesine teşekkürler) gerçek kontrolün `nokta çarpımı > 0` olduğunu gösterdi: doğrudan size bakan ile size dik açıyla bakan arasındaki herhangi bir Nişancı acil tehdit sayılır; dikten arkaya dönük olan herhangi bir şey sayılmaz. Orijinal yanlış okuma, bir SSE float karşılaştırmasının kötü bir derlemesinden geldi -- bir AAA ikili dosyasını tersine mühendislikle çözmek kesin bir bilim değildir.

### Hareket: kaçınma

Kolay botlar asla kaçınmaz, nokta. Normal ve üstü botlar, bir savaş silahı tutuyorlarsa, son 3 saniye içinde bir düşman görmüşlerse ve bu düşmanın onlara görüş hattı varsa, sola/sağa kaçarlar (3'te 1 sol, 3'te 1 sağ, 3'te 1 hiçbir şey, tespit edilen boşluklara göre ağırlıklandırılır).

Şu durumlardan herhangi biri geçerliyse kaçınmazlar: `DisableDodge` özelliği ayarlanmışsa, mevcut davranış acele etmeyi söylüyorsa, şu anda dokunulmazsa (herhangi bir über), taklit/tahrik ortasındaysa, Mühendis oynuyorsa, Casus olarak görünmez veya gizlenmişse, Nişancı olarak nişan almış veya Ağır Sıklet olarak döndürülmüşse veya Huntsman çekişi ortasındaysa.

### Hareket: düşmanları itmekten kaçınma

Normal'in üzerinde, botlar hareket ederken özellikle düşmanlara çarpmamaya çalışır:

| Beceri | Düşmanlara çarpmaktan kaçınır? |
| --- | --- |
| Kolay | Hayır |
| Normal | Hayır |
| Zor | Evet |
| Uzman | Evet |

Pratikte bu yalnızca Casus botları için önemlidir -- bir düşman oyuncusuyla garip bir çarpışmayı önlemek, bir kılık değiştirmeyi bozacak türden bir şeydir.

### Pyro: hava patlaması ustalığı

Hava patlaması iki amaca hizmet eder: mermileri yansıtmak (PvP ve MvM) ve yakındaki düşmanları uçurumlardan itmek (yalnızca PvP). Botun geçerli bir fırsatta tetiği çekmesi, beceri tabanlı bir yazı tura atışıdır:

| Beceri | Hava patlaması tetikleme şansı |
| --- | --- |
| Kolay | %0 |
| Normal | %50 |
| Zor | %90 |
| Uzman | %100 |

Kolay Pyro botları kelimenin tam anlamıyla hava patlaması yapamaz -- atış, "nadiren" değil, asla başarılı olmayacak şekilde sabit kodlanmıştır.

### Casus: kılık değiştirme etkililiği

İki ayrı eksen beceriyle ölçeklenir. Kılık değiştirme *seçimi*:

| Beceri | Kılık değiştirme yöntemi |
| --- | --- |
| Kolay/Normal | Düşman takımının gerçekte ne oynadığını yok sayarak rastgele sınıf |
| Zor/Uzman | Gerçek bir düşman oyuncusu seçer ve onların tam sınıfını kopyalar |

Kılık değiştirme *rol yapma*:

| Beceri | Gizliyken/görünmezken davranış |
| --- | --- |
| Kolay/Normal | Düşman oyuncuları gördüğünde onlara bakar (şüpheli) |
| Zor/Uzman | Kasıtlı olarak göz temasından kaçınır (daha inandırıcı) |

### Casus: bıçaklama saldırganlığı

Uzun mesafede (300 HU'ya kadar, `tf_bot_spy_knife_range`), bir Casus botu yalnızca kurbanı görebiliyorsa ve kurbana en azından kısmen sırtı dönükse bıçaklamaya girişir. Beceri, bu sırt açısının merkezden ne kadar sapmasına izin verildiğini belirler:

| Beceri | Açı toleransı |
| --- | --- |
| Kolay | Doğrudan size baksa bile dener |
| Normal | Sırtınızdan ±45° |
| Zor | Sırtınızdan ±78° |
| Uzman | Sırtınızdan ±90° (tam arka 180° yay) |

Kolay Casus botları işlevsel olarak intihara meyillidir -- tam karşılarına bakan birine bıçaklamayı deneyeceklerdir. **İstisna:** Mann vs. Machine'de, her Casus botu gerçek beceriden bağımsız olarak Normal açı kısıtlamasına zorlanır.

### Taktikler: silah seçimi

Yalnızca Kolay'ın üzerinde devreye girer ve MvM'de çoğunlukla önemsizdir çünkü botların genellikle katı silah kısıtlamaları vardır:

- **Scout**: ana silahın şarjörü boşaldığında ikincile geçer.
- **Soldier**: boş şarjörde *ve* hedef 500 HU'dan yakınsa ikincile geçer.
- **Sniper**: 750 HU'dan yakın hedefler için ikincile geçer.
- **Pyro**: 750 HU'dan uzak hedefler için ikincile geçer, meğerki o hedef bir Soldier veya Demoman olmasın.

### Taktikler: siperde yeniden doldurma

MvM'de kullanılmaz. Botun mevcut davranışı geri çekilmesini söylemiyorsa, ana şarjörü boşsa ve überli değilse, yüksek becerili botlar geçici olarak sipere çekilip size boş silahla tıklamak yerine yeniden doldurur:

| Beceri | Yeniden doldurmak için geri çekilir? |
| --- | --- |
| Kolay | Hayır |
| Normal | Hayır |
| Zor | Evet |
| Uzman | Evet |

### KP modu: savunmacı gezintisi

MvM'de kullanılmaz. Bir kontrol noktasını savunurken, yüksek becerili botların öldürmek için noktayı terk etme olasılığı daha yüksektir ("ara ve yok et"), ancak yalnızca `tf_bot_defense_must_defend_time` üzerinde makul bir süre kalmışsa:

| Beceri | Gezinti şansı |
| --- | --- |
| Kolay | %10 |
| Normal | %50 |
| Zor | %75 |
| Uzman | %90 |

### KP modu: ele geçirmeyi engelleme

MvM'de kullanılmaz. Düşman ele geçirme girişimine itiraz eden savunmacı botlar:

| Beceri | Ele geçirmeyi engellemeye çalışır? |
| --- | --- |
| Kolay | Hayır |
| Normal | %50 şans |
| Zor | Evet |
| Uzman | Evet |

---

## Tam özet tablosu

<div style="overflow-x:auto">

| Özellik | Kolay | Normal | Zor | Uzman | Notlar |
| --- | --- | --- | --- | --- | --- |
| Görüş: tanıma süresi | 1.00s | 0.50s | 0.30s | 0.20s | |
| Nişan: takip hızı | 1x/s | 4x/s | 10x/s | 20x/s | Casuslar her zaman Normal kullanır |
| Bomba/sticky yay telafisi | Evet | Evet | Evet | Evet | Loose Cannon hariç |
| Huntsman dikey telafi | Hayır | Evet | Evet | Evet | |
| Huntsman kafa vuruşları | Hayır | <150 HU | Evet | Evet | |
| Roketatar ayak atışları | Hayır | Evet | Evet | Evet | Direct Hit & Cow Mangler hariç |
| Nişancı Tüfeği nişan noktası | Vücut | ~%33 kafaya | Kafa | Kafa | |
| Gizli atışları fark etme şansı | %10 | %30 | %60 | %90 | Yüksek atışlar maskelerse yarıya iner |
| İyileştiriciyi hedefleme | Hayır | %50 | Evet | Evet | |
| Uzaktaki Medic/Mühendis/Nişancı = tehdit | Hayır | Hayır | Evet | Evet | |
| Kaçınma | Hayır | Evet | Evet | Evet | Uzun istisna listesi |
| Düşmanlara çarpmaktan kaçınma | Hayır | Hayır | Evet | Evet | Çoğunlukla Casus için önemli |
| Hava patlaması tetikleme şansı | %0 | %50 | %90 | %100 | |
| Casus kılık sınıfı seçimi | Rastgele | Rastgele | Gerçek düşmanla eşleşir | Gerçek düşmanla eşleşir | |
| Casus kılıktayken göz teması | Bakar (belli) | Bakar | Kaçınır (inandırıcı) | Kaçınır | |
| Casus bıçaklama açısı | ~0° | ±45° | ±78° | ±90° | MvM Normal'i zorlar |
| Silah seçimi mantığı | Hayır | Evet | Evet | Evet | MvM'de daha az önemli |
| Siperde yeniden doldurma | Hayır | Hayır | Evet | Evet | MvM'de yok |
| KP savunmacı gezintisi | %10 | %50 | %75 | %90 | MvM'de yok |
| KP ele geçirmeyi engelleme | Hayır | %50 | Evet | Evet | MvM'de yok |

</div>

---

## Sonuç

![TF2 Heavy bot minigun ile nişan alıyor](assets/tf2-bot-ai-heavy-aim.png)

Bunların hiçbiri Valve'ın yanlış tahminleri değil -- kasıtlı, tamamen belirlenmiş bir puanlama ve olasılık sistemi, sadece hiçbir yerde resmi olarak yazılmamış. Hatırlamaya değer birkaç şey:

1. **"Beceri" bağımsız kadranlardan oluşan bir demettir**, tek bir küresel çarpan değil. Tepki süresi, nişan hızı ve her taktiksel davranış ayrı ayrı ölçeklenir ve birkaçı (Casus takip hızı, MvM bıçaklama açısı) beceriden bağımsız olarak sabit kodlanmış geçersiz kılmalar alır.
2. **Bunların bir kısmı gerçekten hatalı, sadece eski değil.** 2010'dan beri dondurulmuş gizli silah listesi, hiçbir iyi sebep olmadan ayak atışı mantığı eksik olan Cow Mangler, yıllar süren doğru derleme çalışmaları gerektiren Nişancı nokta-çarpım kontrolü -- Valve'ın yapay zeka kodunun, diğer 17 yaşındaki herhangi bir kod tabanı gibi yara izleri vardır.
3. **Bunların hepsini kullanabilirsiniz.** Bir Nişancı botunun Normal'de size kafa vuruşu yapmayacağını, bir Kolay Pyro'nun roketinizi gerçekten geri gönderemeyeceğini, bir Kolay Casus'un yüz yüze size bıçaklamaya çalışacağını bilin. Bu şans değil. Bu bir teknik şartname.

Bu mümkün kılan orijinal kod dalışları için sigsegv'e, bot komutları ve harita desteği hakkındaki temel dokümantasyon için TF2 Wiki'sine ve 17 yıllık bir bot yapay zekasını kurcalayıp tam olarak neden böyle davrandığını anlamaya çalışan topluluktaki herkese çok teşekkürler.
