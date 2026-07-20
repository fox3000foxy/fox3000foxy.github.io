---
title: "Makineler Birbirleriyle Nasıl Konuşur: TCP'den mTLS'ye Bir Bakış"
description: "TCP, UDP, TLS, mTLS, HTTP ve WebSocket neden rakip alternatifler değil de üst üste bindirilmiş katmanlardır; ham taşımadan karşılıklı kimlik doğrulamaya kadar makineden makineye iletişimin hiyerarşik bir turu."
date: 2026-07-16
tags: ["tcp", "udp", "tls", "mtls", "websocket", "http", "grpc", "ağ", "dağıtık-mimari", "protokoller"]
authors: ["docteur-turboss"]
lang: "tr"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "n2wNzPeUNQDkfsxBaY6OSmKbRUDl4EIiEMLeigkmNSnbDhvs0F0xg37igPCejYhFrgmO1hyeGSJRP5OolPzq6w=="
---
# Sorun: Çok fazla kısaltma, yeterince hiyerarşi yok

TCP, UDP, TLS, mTLS, WebSocket, HTTP, HTTPS, gRPC, QUIC; bunlardan bahseden çoğu kaynak, onları "kullanım durumuna göre seçilecek" düz bir alternatifler listesi olarak sunar. Gerçekte ise aynı düzlemde değillerdir: bazıları taşıma protokolleridir, bazıları taşımanın etrafına sarılan güvenlik katmanlarıdır, bazıları ise ilk ikisinin üzerine inşa edilen uygulama katmanı protokolleridir. Hiyerarşiyi anlamak, TCP ile TLS arasında neden asla "seçim yapılmadığını" anlamaktır: önce TCP seçilir, _sonra_ üzerine TLS eklenip eklenmeyeceğine karar verilir.

Bu makale, bu hiyerarşiyi katman katman, ham taşımadan karşılıklı kimlik doğrulamaya kadar yeniden inşa eder; her seviyede: neyi garanti ettiği, neyi garanti etmediği ve ne zaman bununla yetinileceği.

# Seviye 1: Taşıma (TCP ve UDP)

Her şey burada başlar. TCP ve UDP, OSI modelinin **Taşıma Katmanı (Layer 4)**'nın iki ana protokolüdür. Rolleri aynıdır: farklı makinelerde çalışan iki uygulama arasında veri akışı taşımak. Ancak bunu başarma biçimleri kökten farklıdır.

Ağ katmanında (Layer 3) bulunan IP'nin (Internet Protokolü) yalnızca paketleri bir ana bilgisayardan diğerine yönlendirdiğini anlamak önemlidir. Ne varmayı, ne sıralamayı, ne de tekilliği garanti eder. Yönlendiriciler her paket için bağımsız yönlendirme kararları alır.

İşte tam da bu garanti eksikliğini TCP telafi ederken, UDP son derece hafif kalmak için bilinçli olarak hiçbir şey eklememeyi tercih eder.

## TCP: Önce güvenilirlik

TCP (İletim Kontrol Protokolü) **bağlantı odaklı** (_connection-oriented_) bir protokoldür. Herhangi bir veri baytı değiş tokuş edilmeden önce, iki makine mantıksal bir bağlantı kurmalıdır.

Bu bağlantı, ünlü **Üç Yollü El Sıkışma (Three-Way Handshake)** ile oluşturulur:

```

İstemci                          Sunucu
SYN ---------------------------->
         <--------------------- SYN + ACK
ACK ---------------------------->
Bağlantı kuruldu
```

Her adımın belirli bir amacı vardır:

*   SYN: istemci bir bağlantı açmak istediğini bildirir ve bir ilk sıra numarası (ISN) sağlar.

*   SYN-ACK: sunucu bağlantıyı kabul eder, SYN'in alındığını onaylar ve kendi sıra numarasını sağlar.

*   ACK: istemci, sunucunun bilgilerini aldığını onaylar.

Bu noktadan itibaren, iki makine bağlantının durumunu bilir ve veri alışverişine başlayabilir.

### **Sıra numaraları**

TCP verileri bir dizi paket olarak değil, **sürekli bir bayt akışı** (_byte stream_) olarak görür.

Gönderilen her baytın bir sıra numarası vardır.

Örnek:

```
Mesaj:

Merhaba

M = bayt 0
e = bayt 1
r = bayt 2
...
```

1000'den 1499'a kadar olan baytları içeren bir segment taşıma sırasında kaybolursa, alıcı tam olarak neyin eksik olduğunu tespit edebilir.

Gönderici yalnızca bu kısmı yeniden iletir.

Bu ayrıntı düzeyi, TCP'nin sağlamlığının nedenlerinden biridir.

### **Alındı bildirimleri (ACK)**

Veriler alındıktan sonra, alıcı bir **ACK (Alındı Bildirimi - Acknowledgment)** gönderir.

Çoğu zaman sanılanın aksine, bir ACK şu anlama gelmez:

> "Bu paketi aldım"

Bunun yerine şu anlama gelir:

> "X numarasına kadar tüm baytları aldım."

Örneğin:

```
İstemci gönderir:

0 → 999

Sunucu yanıtlar:

ACK = 1000
```

Bu şu anlama gelir:

> "Bayt 1000'den önceki her şey sorunsuz geldi."

Bu mekanizma, aynı anda birden fazla segmentin alındığını bildirmeye olanak tanır (_kümülatif alındı bildirimleri - cumulative acknowledgments_), böylece kontrol paketlerinin sayısını azaltır.

### **Yeniden iletimler**

Bir ACK asla gelmezse, TCP segmentin kaybolduğunu varsayar.

Onu otomatik olarak yeniden iletir.

Yeniden iletim zaman aşımı (**RTO - Retransmission Timeout**) sabit değildir.

TCP, alınan ACK'ler sayesinde gidiş-dönüş süresini (**RTT**) sürekli ölçer ve gereksiz yeniden iletimleri önlemek için RTO'yu dinamik olarak hesaplar.

Modern uygulamalar ayrıca **Hızlı Yeniden İletim (Fast Retransmit)** gibi mekanizmalar kullanır: bir gönderici birden fazla yinelenen ACK aldığında (genellikle üç), aradaki bir segmentin kaybolduğu sonucunu çıkarır ve zamanlayıcının dolmasını beklemeden onu hemen yeniden gönderir.

### **Paketlerin yeniden sıralanması**

İnternet, iki paketin aynı yolu izleyeceğini kesinlikle garanti etmez.

Örnek:

```
Paket 1
Paris
 ↓
Londra
 ↓
New York

Paket 2
Paris
 ↓
Frankfurt
 ↓
Şikago
 ↓
New York
```

İkinci paket, birinciden önce gelebilir.

TCP daha sonra **sıra dışı** alınan segmentleri geçici olarak bir tamponda (_yeniden birleştirme tamponu - reassembly buffer_) saklar ve uygulamaya teslim etmeden önce bunları yeniden birleştirir.

Uygulama için her şey mükemmel bir sırayla geliyormuş gibi görünür.

### Akış kontrolü

Bir bağlantı yalnızca ağa bağlı değildir.

Alıcının ayrıca sınırlı bir bellek kapasitesi vardır.

Verileri işleyebileceğinden daha hızlı alırsa, tamponları sonunda dolar.

TCP bu sorunu bir **kayan pencere (Sliding Window)** mekanizmasıyla çözer.

Alıcı her ACK'de şunu belirtir:

```
Window = 32768 bayt
```

Bu şu anlama gelir:

> "Bana 32 KB'ye kadar daha gönderebilirsin."

Bu pencere sıfıra düşerse:

```
Window = 0
```

Gönderici, alıcı yeni bir kullanılabilir pencere bildirene kadar iletimleri geçici olarak durdurur.

Bu mekanizma **Akış Kontrolü (Flow Control)** olarak adlandırılır ve hızlı bir ana bilgisayarın daha yavaş bir ana bilgisayarı boğmasını engeller.

### Tıkanıklık kontrolü

Alıcı verileri absorbe edebilse bile, ağın kendisi doygun hale gelebilir.

Yönlendiricilerin sınırlı kuyrukları (_queues_) vardır.

Bunlar taştığında, paketler silinir.

TCP kayıpları bir tıkanıklık işareti olarak yorumlar ve bir **tıkanıklık penceresi (Congestion Window – cwnd)** aracılığıyla hızını otomatik olarak ayarlar.

Modern algoritmalar (işletim sistemine bağlı olarak **Reno**, **CUBIC** veya **BBR** gibi) maksimum hız ve ağ kararlılığı arasında bir denge bulmak için bu pencereyi ayarlar.

TCP'nin ilk sürümleri esas olarak iki mekanizma kullanıyordu:

*   **Slow Start (Yavaş Başlangıç)**: tıkanıklık tespit edilene kadar üstel hız artışı.

*   **Congestion Avoidance (Tıkanıklıktan Kaçınma)**: ardından daha ihtiyatlı, genellikle doğrusal büyüme.

Bu sürekli uyum, TCP'nin ağ kalitesi değişimlerine rağmen performanslı kalmasının nedenlerinden biridir.

### Bağlantı kapatma

UDP'nin aksine, bir TCP bağlantısının ayrıca düzgün bir kapanışı vardır.

Her uç nokta, **FIN** bayrağı sayesinde kendi akışını bağımsız olarak kapatır.

Tam bir kapanış genellikle dört alışveriş gerektirir:

```
FIN
ACK
FIN
ACK
```

Bu prosedür, bağlantı sonlandırılmadan önce iletilmekte olan tüm verilerin teslim edilmesini garanti eder.

## UDP: Maksimum basitlik

UDP (Kullanıcı Veri Birimi Protokolü) ters felsefeyi benimser.

**Bağlantısızdır (connectionless)**.

Aşağıdakilerin hiçbiri yoktur:

*   el sıkışma yok;

*   sıra numarası yok;

*   alındı bildirimi yok;

*   yeniden iletim yok;

*   akış kontrolü yok;

*   tıkanıklık kontrolü yok.

Her mesaj, bağımsız bir **veri birimi (datagram)** içinde kapsüllenir, ağa iletilir ve ardından gönderici tarafından unutulur.

```
Uygulama → UDP Veri Birimi → IP → İnternet
```

Protokol, iki gönderim arasında herhangi bir durum tutmaz.

Her veri birimi öncekilerden tamamen bağımsızdır.

### Veri bütünlüğü

UDP teslimatı veya sıralamayı garanti etmese de, bir **sağlama toplamı (checksum)** sayesinde veri bütünlüğünü yine de korur.

Alımda, sağlama toplamı yeniden hesaplanır.

*   Değerler eşleşirse, veri birimi kabul edilir.

*   Aksi takdirde, hemen reddedilir.

UDP bu nedenle bozuk verileri tespit eder, ancak asla kurtarmaya çalışmaz.

### UDP neden bu kadar hızlıdır?

UDP başlığı yalnızca **8 bayt** içerirken, TCP için minimum **20 bayt** (zaman damgaları, SACK veya Window Scaling gibi seçenekler hariç).

Herhangi bir bağlantı sürdürülmediğinden, işletim sisteminin her alışverişin durumunu takip etmesi gerekmez, bu da bellek tüketimini ve işlem maliyetini azaltır.

Uygulama, olası yeniden iletimleri beklemeden verileri geldikleri anda alır.

## Bir veriyi kaybetmenin tercih edilebilir olduğu durumlar

Temel fikir basittir:

> Eski bir bilgi, kaybolmuş bir bilgiden daha az değerli olabilir.

Bir VoIP konuşmasını ele alalım.

Her paket yaklaşık **20 ms** ses taşır.

Bir paket kaybolursa, onu yeniden iletmek genellikle bu 20 ms'den daha uzun sürer.

Sonunda ulaştığında, konuşma zaten ilerlemiş olur.

Çoğu uygulama, yeniden iletimi beklemek yerine kaybı maskelemeyi (interpolasyon, sessizlik, hata düzeltme) tercih eder.

Aynı mantık şunlar için de geçerlidir:

*   gerçek zamanlı çok oyunculu oyunlar;

*   video akışı;

*   telemetri akışları;

*   IoT sensörleri;

*   GPS konum verileri.

Güncel bir değer, mükemmel şekilde güvenilir eski bir değerden neredeyse her zaman daha kullanışlıdır.

# Seviye 2: Şifreleme, TLS

TLS (Taşıma Katmanı Güvenliği, SSL'in halefi) TCP'nin yerini almaz, onun üzerine eklenir. Somut olarak, TLS normal bir TCP bağlantısı kurar, ardından içinde şifreli bir oturum müzakere eder: sertifika değişimi, bir şifreleme algoritması üzerinde anlaşma, oturum anahtarlarının türetilmesi. Daha sonra iletilen her şey şifrelenir ve doğrulanır.

Genellikle karıştırılan üç ayrı garanti:

*   **Gizlilik**: iki taraftan başka hiç kimse içeriği okuyamaz.

*   **Bütünlük**: iletilen verilerdeki herhangi bir değişiklik tespit edilir.

*   **Kimlik Doğrulama**: ancak klasik TLS'de, tek yönlüdür: istemci, sunucunun gerçekten iddia ettiği kişi olduğunu doğrular (güvenilir bir otorite tarafından imzalanmış sertifikası aracılığıyla), ancak sunucu istemcinin kimliği hakkında hiçbir şey doğrulamaz. Bu, bir siteyi ziyaret ettiğinizde HTTPS'nin tam olarak modelidir: tarayıcı siteyi doğrular, site sizi doğrulamaz (kullanıcı kimlik doğrulaması ayrı bir mekanizma olan oturum çerezi, token aracılığıyla yapılır).

TLS 1.3 (önerilen güncel sürüm), el sıkışmayı normal durumda tek bir gidiş-dönüşe indirgemiştir (TLS 1.2'de iki iken), bu da bağlantı gecikmesini önemli ölçüde azaltır.

## Seviye 2b: mTLS — kimlik doğrulama karşılıklı hale gelir

mTLS (karşılıklı TLS), ek bir kısıtlama ile TLS'dir: sunucu ayrıca istemciden de bir sertifika _talep eder_ ve bunu doğrular. Her iki taraf da ortak bir güvenilir otorite tarafından imzalanmış bir sertifika aracılığıyla kimliklerini kanıtlar.

Bu, dağıtık bir mimaride hizmetten hizmete iletişim için doğal mekanizmadır: klasik HTTPS'nin bir tarayıcının genel bir sunucuyla konuşması için yeterli olduğu yerde, mTLS farklı bir soruyu yanıtlar; _bir iç hizmet, yetkili başka bir iç hizmetle mi yoksa ağa sızmış bir saldırganla mı konuştuğunu nasıl bilir?_

```
İstemci                                          Sunucu
  │──── ClientHello ─────────────────────────────▶│
  │◀─── ServerHello + sunucu sertifikası ──────────│
  │──── sunucu sertifikasını doğrula ──────────────│
  │──── KENDİ istemci sertifikasını gönder ───────▶│
  │◀─── istemci sertifikasını doğrula ─────────────│
  │──── oturum anahtarları türetilir, şifreli kanal▶│
```

mTLS'nin karşılığı operasyoneldir: dahili bir sertifika otoritesi (CA), her hizmete sertifika dağıtmak için bir mekanizma ve bir döndürme/iptal stratejisi gerekir. Az sayıda hizmete sahip tek makinelik bir ortamda, bu bazen faydadan çok karmaşıklık getirir — mTLS, hizmetler arası trafik tam olarak kontrol edilmeyen bir ağdan (birden çok ana bilgisayar, çok kiracılı bulut) geçtiğinde veya hiçbir hizmetin yalnızca ağın "içinde" olduğu için örtük olarak güvenilir olmadığı _zero trust_ tipi bir politika istendiğinde gerekli hale gelir.

# Seviye 3: TCP+TLS üzerinde uygulama katmanı protokolleri

Taşıma ve şifreleme yerine oturduktan sonra, geriye _alışverişlerin nasıl yapılandırılacağını_ tanımlamak kalır. Bu, uygulama katmanı protokollerinin rolüdür.

## HTTP / HTTPS

HTTP, istek-yanıt protokolüdür: istemci bir bağlantı açar (veya keep-alive ile mevcut birini yeniden kullanır), bir istek gönderir, bir yanıt bekler, bağlantı daha sonra kapanabilir veya yeniden kullanılabilir. HTTPS, HTTP'nin TLS üzerinde olmasıdır — S, protokolün anlambilimini değiştirmez, yalnızca taşımanın şifrelenmiş olmasını sağlar.

İstek-yanıt modelinin yapısal bir sınırlaması vardır: sunucu asla ilk konuşamaz. Yalnızca istemcinin talep ettiği şeylere yanıt verebilir. Sık yoklama (polling) için (her saniye "yeni bir şey var mı?" diye kontrol etmek), çalışır ancak kaynak israfına neden olur — her istek, çoğu zaman bildirilecek yeni bir şey olmamasına rağmen, protokol yükünü yeniden oluşturur.

## WebSocket (WS / WSS)

WebSocket tam olarak bu sınırlamayı yanıtlar. Bağlantı klasik bir HTTP isteği olarak başlar (`Upgrade: websocket` başlığı ile), ancak el sıkışma kabul edildikten sonra, alttaki TCP bağlantısı artık bir HTTP istek-yanıt kanalı değildir — istemci ve sunucunun her an mesaj gönderebildiği, her alışverişte istek-yanıt döngüsünü yeniden başlatmaya gerek olmayan çift yönlü tam çift yönlü (full-duplex) bir kanal haline gelir.

```
GET /chat HTTP/1.1
Host: example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13

HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

WSS, HTTPS'nin HTTP üzerinde TLS olması gibi, WebSocket'in TLS üzerinde olmasıdır. Gerçek zamanlı sunucu itme (push) gerektiren her şey için tercih edilen protokoldür — sohbet, bildirimler, ticaret akışları, oyun etkinlikleri — çıplak TCP üzerinde kendi ikili protokolünü yönetmek istemediğinizde.

## gRPC

Mikroservis dünyası dışında daha az bilinir ancak hizmetten hizmete iletişimde merkezidir: gRPC, HTTP/2'ye dayanır (dolayısıyla TCP + isteğe bağlı TLS), mesajları Protocol Buffers ile serileştirir (çoğu REST API'nin metin JSON'unun aksine ikili, tür belirtilmiş, kompakt) ve HTTP/2'nin çoğullaması sayesinde yerel olarak çift yönlü akışa izin verir (tek bir TCP bağlantısı üzerinde birden fazla mantıksal akış, sıralı HTTP/1.1 isteklerinin sahip olacağı head-of-line blocking olmadan).

## QUIC / HTTP3

QUIC, taşıma seviyesinde TCP yerine UDP'den başlayarak işleri değiştirir, aynı zamanda TCP'nin yerel olarak sunduğu güvenilirlik garantilerini üzerine yeniden uygular — ancak genel olarak değil, akış bazında, bu da taşıma seviyesinde head-of-line blocking'i ortadan kaldırır (bir akışta kaybolan paket, aynı bağlantının diğer akışlarını engellemez). TLS 1.3, üzerine eklenmek yerine doğrudan QUIC'in içine entegre edilmiştir, bu da el sıkışma gecikmesini daha da azaltır. HTTP/3, QUIC üzerinde HTTP'dir.

# Genel bakış: her protokolün yeri

Katman Protokoller Rol Taşıma TCP, UDP Bayt taşımak, güvenilir veya değil Taşıma (yeni nesil) QUIC UDP + akış bazında güvenilirlik + gömülü TLS Güvenlik TLS, mTLS Şifreleme, bütünlük, kimlik doğrulama (tek veya karşılıklı) Uygulama HTTP/HTTPS, WS/WSS, gRPC Alışverişleri yapılandırma (istek-yanıt, çift yönlü, tür belirtilmiş RPC)

Somut bir örnek: bir web panosu ve iç hizmetleri olan bir mikroservis mimarisi, makul bir şekilde HTTPS (pano ↔ genel API, tarayıcı tarafında tek yönlü kimlik doğrulama yeterli), mTLS (içte hizmet ↔ hizmet, karşılıklı kimlik doğrulama gerekli) ve WSS (panoya gerçek zamanlı bildirimler) birleştirebilir — tümü aynı TCP + TLS temeli üzerine inşa edilmiş üç farklı uygulama katmanı protokolü.

## Pratikte nasıl seçim yapılır

Üç soru genellikle karar vermek için yeterlidir:

1.  **Güvenilirlik ve sıralamaya mı ihtiyacım var, yoksa verinin tazeliği garantili teslimattan daha mı önemli?** → Evetse TCP, hayırsa UDP (veya her ikisini de farklı bir uzlaşmayla birleştiren QUIC).

2.  **Sunucu mesaj başlatabilmeli mi, yoksa istemci her zaman ilk talebi mi yapar?** → Sunucu itmeli (push) ise WebSocket/gRPC akışı, değilse klasik HTTP.

3.  **Her iki taraf da birbirine kimliğini kanıtlamalı mı, yoksa yalnızca birinin doğrulanması mı gerekiyor?** → Zero-trust ortamında hizmetten hizmete için mTLS, klasik genel istemci için basit TLS.

Operasyonel karmaşıklık eklenen her katmanla artar: çıplak TCP'nin yönetilecek altyapısı yoktur, TLS sertifikalar gerektirir, mTLS bir CA ve döndürme stratejisi gerektirir, gRPC paylaşılan bir Protobuf şema tanımı gerektirir. Doğru refleks, karmaşıklığı yalnızca alttaki katman somut bir sınır gösterdiğinde artırmaktır, önceden değil.
