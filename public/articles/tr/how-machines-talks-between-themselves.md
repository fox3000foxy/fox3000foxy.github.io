---
title: "Makineler birbiriyle nasıl konuşur: TCP'den mTLS'e bir tur"
description: "TCP, UDP, TLS, mTLS, HTTP ve WebSocket neden rakip alternatifler değil, üst üste yığılmış katmanlardır; ham aktarımdan karşılıklı kimlik doğrulamaya makineden makineye iletişimin hiyerarşik turu."
date: 2026-07-16
tags: ["tcp", "udp", "tls", "mtls", "websocket", "http", "grpc", "réseau", "architecture-distribuée", "protocoles"]
authors: ["docteur-turboss"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "lB+D+8RGE3xgbHiANw3M7/3dj+/ybTEytAJh7XGqAdvfjkZkNN9APFt0nJ0Glpa1ZXgtUOD4dYM/fBUaGnVj8Q=="
---

# Sorun: çok fazla kısaltma, yeterince hiyerarşi yok

TCP, UDP, TLS, mTLS, WebSocket, HTTP, HTTPS, gRPC, QUIC; bunlardan bahseden kaynakların çoğu bunları "kullanım durumuna göre seçilecek" birbirinin yerine geçebilir düz bir seçenek listesi olarak sunar. Gerçekte aynı düzlemde değillerdir: bazıları aktarım protokolleridir, bazıları aktarımın etrafına sarılan güvenlik katmanlarıdır, bazıları ise ilk ikisine dayanan uygulama protokolleridir. Hiyerarşiyi anlamak, neden TCP ile TLS arasında asla "seçim" yapmadığımızı anlamaktır: TCPyi seçeriz, _sonra_ üzerine TLS koyup koymayacağımıza karar veririz.

Bu makale bu hiyerarşiyi katman katman, ham aktarımdan karşılıklı kimlik doğrulamaya yeniden inşa eder; her seviye için neyi garanti ettiği, neyi garanti etmediği ve ne zaman onunla yetinileceğiyle.

# Seviye 1: aktarım (TCPye karşı UDP)

Her şey burada başlar. TCP ve UDP, OSI modelinin **Aktarım (Katman 4)** katmanının iki ana protokolüdür. Rolleri aynıdır: farklı makinelerde çalışan iki uygulama arasında bir veri akışı taşımak. Oysa bunu başarma biçimleri kökten farklıdır.

IPnin (Internet Protocol), ağ katmanında (Katman 3) bulunan, paketleri yalnızca bir hosttan diğerine ilettiğini anlamak önemlidir. Ne varmalarını, ne sıralarını, ne de benzersizliklerini garanti eder. Yönlendiriciler her paket için basitçe bağımsız yönlendirme kararları alır.

TCPnin telafi etmeye geldiği şey tam olarak bu garanti yokluğudur, oysa UDP bilinçli olarak aşırı hafif kalmak için hiçbir şey eklememeyi seçer.

## TCP: önce güvenilirlik

TCP (Transmission Control Protocol) **bağlantı yönelimli** (_connection-oriented_) bir protokoldür. Tek bir veri baytı değiş tokuş etmeden önce iki makine mantıksal bir bağlantı kurmalıdır.

Bu bağlantı ünlü **Three-Way Handshake** sayesinde oluşturulur:

```

Client                           Serveur
SYN ---------------------------->
        <--------------------- SYN + ACK
ACK ----------------------------> 
Connexion établie
```

Her adımın kesin bir amacı vardır:

*   SYN: istemci bir bağlantı açmak istediğini duyurur ve ilk sıra numarasını verir (Initial Sequence Number - ISN).
    
*   SYN-ACK: sunucu bağlantıyı kabul eder, SYNi onaylar ve sırayla kendi sıra numarasını verir.
    
*   ACK: istemci sunucunun bilgilerinin alındığını onaylar.
    

Bu andan itibaren iki makine bağlantının durumunu bilir ve veri değiş tokuş etmeye başlayabilir.

### **Sıra numaraları**

TCP verileri bir paket dizisi olarak değil, **sürekli bir bayt akışı** (_byte stream_) olarak görür.

Gönderilen her baytın bir sıra numarası vardır.

Örnek:

```
Message :

Bonjour

B = octet 0
o = octet 1
n = octet 2
...
```

Aktarım sırasında 1000 ila 1499 baytlarını içeren bir parça kaybolursa alıcı tam olarak neyin eksik olduğunu tespit edebilir.

Gönderici yalnızca o kısmı yeniden iletir.

Bu ayrıntı düzeyi TCPnin sağlamlığının nedenlerinden biridir.

### **Alındı onayları (ACK)**

Verileri aldıktan sonra hedef bir **ACK (Acknowledgment)** gönderir.

Genelde hayal edilenin tersine bir ACK şu anlama gelmez:

> "Bu paketi aldım"

Daha çok şu anlama gelir:

> "X numarasına kadar tüm baytları aldım."

Örneğin:

```
Client envoie :

0 → 999

Serveur répond :

ACK = 1000
```

Bu şu demektir:

> "1000 baytından önceki her şey sağ salim vardı."

Bu mekanizma birkaç parçayı aynı anda onaylamaya izin verir (_cumulative acknowledgments_), böylece kontrol paketi sayısını azaltır.

### **Yeniden iletimler**

Bir ACK hiç gelmezse TCP parçanın kaybolduğunu varsayar.

Onu otomatik olarak yeniden iletir.

Yeniden iletim gecikmesi (**Retransmission Timeout: RTO**) sabit değildir.

TCP alınan ACKler sayesinde gidiş dönüş süresini (**RTT**) sürekli ölçer ve gereksiz yeniden iletimlerden kaçınmak için RTOyu dinamik hesaplar.

Modern uygulamalar **Fast Retransmit** gibi mekanizmalar da kullanır: bir gönderici birkaç yinelenen ACK aldığında (genelde üç) arada bir parçanın kaybolduğu sonucunu çıkarır ve zamanlayıcının dolmasını beklemeden hemen yeniden gönderir.

### **Paketlerin yeniden sıralanması**

İnternet iki paketin aynı yolu izleyeceğini kesinlikle garanti etmez.

Örnek:

```
Paquet 1
Paris
  ↓
Londres
  ↓
New York

Paquet 2
Paris
  ↓
Francfort
  ↓
Chicago
  ↓
New York
```

İkinci paket birinciden önce varabilir.

TCP **sıra dışı** alınan parçaları geçici olarak bir tamponda (_reassembly buffer_) saklar, sonra uygulamaya teslim etmeden önce yeniden birleştirir.

Uygulama için her şey mükemmel sırayla geliyormuş gibi görünür.

### Akış kontrolü

Bir bağlantı yalnızca ağa bağlı değildir.

Alıcının da sınırlı bir bellek kapasitesi vardır.

Verileri işleyebildiğinden hızlı alırsa tamponları dolar.

TCP bu sorunu **kayan bir pencere (Sliding Window)** sayesinde çözer.

Alıcı her ACK içinde şunu belirtir:

```
Window = 32768 octets
```

Bu şu demektir:

> "Bana 32 KB daha gönderebilirsin."

Bu pencere sıfıra düşerse:

```
Window = 0
```

Gönderici, alıcı yeni bir uygun pencere duyurana kadar iletimleri geçici askıya alır.

Bu mekanizma **akış kontrolünü (Flow Control)** oluşturur ve hızlı bir hostun daha yavaş bir hostu boğmasını engeller.

### Tıkanıklık kontrolü

Alıcı verileri soğurabilse bile ağın kendisi doygun hale gelebilir.

Yönlendiricilerin sınırlı kuyrukları (_queues_) vardır.

Taştıklarında paketler silinir.

TCP kayıpları tıkanıklık işareti olarak yorumlar ve bir **tıkanıklık penceresi (Congestion Window: cwnd)** sayesinde hızını otomatik uyarlar.

Modern algoritmalar (işletim sistemine göre **Reno**, **CUBIC** ya da **BBR** gibi) maksimum hız ile ağ kararlılığı arasında denge bulmak için bu pencereyi ayarlar.

TCPnin ilk sürümleri başlıca iki mekanizma kullanıyordu:

*   **Slow Start**: tıkanıklık tespit edilene kadar hızın üstel artışı.
    
*   **Congestion Avoidance**: sonra daha temkinli, genelde doğrusal büyüme.
    

Bu sürekli uyarlama, ağ kalite değişimlerine rağmen TCPnin performanslı kalmasının nedenlerinden biridir.

### Bağlantıyı kapatma

UDPnin tersine bir TCP bağlantısının temiz bir kapanışı da vardır.

Her uç **FIN** bayrağıyla akışını bağımsız kapatır.

Tam bir kapanış genelde dört değiş tokuş gerektirir:

```
FIN
ACK
FIN
ACK
```

Bu prosedür, bağlantı yok edilmeden önce transit tüm verilerin gerçekten teslim edildiğini garanti eder.

## UDP: maksimum sadelik

UDP (User Datagram Protocol) ters felsefeyi benimser.

**Bağlantısızdır (connectionless)**.

Şunlar yoktur:

*   handshake yok;
    
*   sıra numarası yok;
    
*   alındı onayı yok;
    
*   yeniden iletim yok;
    
*   akış kontrolü yok;
    
*   tıkanıklık kontrolü yok.
    

Her mesaj basitçe bağımsız bir **datagramda** kapsüllenir, ağa iletilir, sonra gönderici tarafından unutulur.

```
Application → Datagramme UDP → IP → Internet
```

Protokol iki gönderi arasında durum tutmaz.

Her datagram öncekilerden tamamen bağımsızdır.

### Veri bütünlüğü

UDP ne teslimi ne sırayı garanti etse de yine de bir **checksum** sayesinde veri bütünlüğünü korur.

Alımda checksum yeniden hesaplanır.

*   Değerler uyuşursa datagram kabul edilir.
    
*   Yoksa hemen reddedilir.
    

Yani UDP bozuk verileri tespit eder ama onları kurtarmaya asla çalışmaz.

### UDP neden bu kadar hızlı?

UDP başlığı yalnızca **8 bayt** içerir, seçenekler sayılmadan minimum **20 bayt** olan TCPye karşı (timestamps, SACK ya da Window Scaling gibi seçenekler hariç).

Bakımı yapılan bağlantı olmadığı için işletim sistemi her değiş tokuşun durumunu izlemek zorunda değildir, bu da bellek tüketimini ve işleme maliyetini azaltır.

Uygulama verileri varır varmaz, olası yeniden iletimleri beklemeden alır.

## Veri kaybetmenin tercih edilir olduğu durum

Temel fikir basittir:

> Eski bir bilgi kayıp bir bilgiden daha az değerli olabilir.

Bir VoIP konuşmasını alalım.

Her paket yaklaşık **20 ms** ses taşır.

Bir paket kaybolursa yeniden iletmek genelde bu 20 msden uzun sürer.

Sonunda vardığında konuşma çoktan ilerlemiştir.

Çoğu uygulama o zaman kaybı maskelemeyi (interpolasyon, sessizlik, hata düzeltme) yeniden iletimi beklemeye tercih eder.

Aynı mantık şunlara uygulanır:

*   gerçek zamanlı çok oyunculu oyunlar;
    
*   video akışı;
    
*   telemetri akışları;
    
*   IoT sensörleri;
    
*   GPS konum verileri.
    

Yeni bir değer neredeyse her zaman mükemmel güvenilir eski bir değerden daha faydalıdır.

# Seviye 2: şifreleme, TLS

TLS (Transport Layer Security, SSLin halefi) TCPnin yerini almaz, üzerine eklenir. Somut olarak TLS normal bir TCP bağlantısı kurar, sonra içinde şifreli bir oturum müzakere eder: sertifika değişimi, şifreleme algoritmasında anlaşma, oturum anahtarlarının türetilmesi. Sonra geçen her şey şifrelenir ve kimliği doğrulanır.

Genelde karıştırılan üç ayrı garanti:

*   **Gizlilik**: iki taraftan başka kimse içeriği okuyamaz.
    
*   **Bütünlük**: transitte verilerin her değişimi tespit edilir.
    
*   **Kimlik doğrulama**: ama klasik TLS de tek yönlüdür: istemci sunucunun iddia ettiği kişi olduğunu doğrular (güvenilir bir otoritece imzalı sertifikası üzerinden) ama sunucu istemcinin kimliği hakkında hiçbir şey doğrulamaz. Bir siteyi ziyaret ettiğinde HTTPS modeli tam olarak budur: tarayıcı siteyi doğrular, site seni doğrulamaz (kullanıcı doğrulama ayrı bir mekanizmadan geçer, oturum çerezi, jeton).
    

TLS 1.3 (önerilen güncel sürüm) handshakei yaygın durumda tek gidiş dönüşe indirdi, TLS 1.2deki ikiye karşı, bu da bağlantı gecikmesini belirgin azaltır.

## Seviye 2bis: mTLS, kimlik doğrulama karşılıklı olur

mTLS (mutual TLS), ek bir kısıtlı TLS tir: sunucu istemciden _de_ bir sertifika ister ve onu doğrular. İki taraf da ortak güvenilir bir otoritece imzalı bir sertifika üzerinden kimliğini kanıtlar.

Dağıtık bir mimaride servisten servise iletişim için doğal mekanizmadır: klasik HTTPS bir tarayıcının herkese açık bir sunucuyla konuşması için yeterliyken mTLS farklı bir soruyu yanıtlar; _bir iç servis, yetkili başka bir iç servisle konuştuğunu, ağa düşmüş bir saldırganla değil, nereden bilir?_

```
Client                                          Serveur
  │──── ClientHello ─────────────────────────────▶│
  │◀─── ServerHello + certificat serveur ──────────│
  │──── vérifie le certificat serveur ─────────────│
  │──── envoie SON PROPRE certificat client ──────▶│
  │◀─── vérifie le certificat client ───────────────│
  │──── clés de session dérivées, canal chiffré ──▶│
```

mTLSin karşılığı operasyoneldir: bir iç sertifika otoritesi (CA), her servise sertifika dağıtım mekanizması ve döndürme/iptal stratejisi gerekir. Az servisli tek makineli bir ortamda bu bazen faydadan çok karmaşıklıktır: mTLS, servisler arası trafik tam kontrol etmediğimiz bir ağdan geçtiği andan (birden çok host, çok kiracılı bulut) ya da _zero trust_ türü bir politika istendiği andan itibaren gerekli olur; ağın "içinde" olması sırfıyla hiçbir servis örtük güvenilir sayılmaz.

# Seviye 3: TCP+TLS üstündeki uygulama protokolleri

Aktarım ve şifreleme yerinde olduğunda _değiş tokuşların nasıl yapılandırılacağını_ tanımlamak kalır. Uygulama protokollerinin rolü budur.

## HTTP / HTTPS

HTTP bir istek yanıt protokolüdür: istemci bir bağlantı açar (ya da keep-alive ile yeniden kullanır), bir istek gönderir, bir yanıt bekler, bağlantı sonra kapanabilir ya da yeniden kullanılabilir. HTTPS basitçe TLS üzerinde HTTPdir: S protokolün semantiğini hiç değiştirmez, yalnızca aktarımın şifreli olduğu gerçeğini değiştirir.

İstek yanıt modelinin yapısal bir limiti vardır: sunucu asla önce konuşamaz. Yalnızca istemcinin istediğine yanıt verebilir. Sık yoklama için (her saniye "yeni bir şey var mı?" diye kontrol etmek) çalışır ama kaynak israf eder: çoğu zaman duyuracak yeni bir şey yokken her istek protokol yükünü yeniden yaratır.

## WebSocket (WS / WSS)

WebSocket tam olarak bu limite yanıt verir. Bağlantı klasik bir HTTP isteği olarak başlar (`Upgrade: websocket` başlığıyla) ama el sıkışma kabul edildikten sonra alttaki TCP bağlantısı artık bir HTTP istek yanıt kanalı değildir: istemci ve sunucunun her değiş tokuşta bir istek yanıt döngüsünü yeniden yayımlamadan istediği zaman mesaj gönderebildiği çift yönlü tam çift yönlü bir kanala dönüşür.

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

WSS basitçe TLS üzerinde WebSocket tir, tıpkı HTTPSin TLS üzerinde HTTP olması gibi. Çıplak TCP üstünde kendi ikili protokolünü yönetmek istemeden gerçek zamanlı sunucu itmesi gerektiren her şey için seçim protokolüdür: sohbet, bildirimler, alım satım akışları, oyun olayları.

## gRPC

Mikroservis dünyası dışında az bilinir ama servisten servise iletişimde merkezidir: gRPC HTTP/2ye dayanır (yani TCP + opsiyonel TLS), mesajları Protocol Buffers ile serileştirir (çoğu REST API sinin metin JSONunun tersine ikili, tipli, kompakt) ve HTTP/2nin çoklaması sayesinde doğal olarak çift yönlü akışa izin verir (head-of-line blocking olacak birkaç sıralı HTTP/1.1 isteğinin tersine tek bir TCP bağlantısında birkaç mantıksal akış).

## QUIC / HTTP3

QUIC, aktarım seviyesinde TCP yerine UDPden başlayarak oyunu değiştirir, üstüne TCPnin doğal sunduğu güvenilirlik garantilerini yeniden uygular: ama küresel yerine akış akış, bu da aktarım seviyesinde head-of-line blockingi ortadan kaldırır (bir akışta kaybolan bir paket aynı bağlantının diğer akışlarını artık bloklamaz). TLS 1.3, üzerine eklenmek yerine doğrudan QUIC içine gömülüdür, bu da handshake gecikmesini daha da azaltır. HTTP/3, QUIC üzerinde HTTPdir.

# Genel bakış: her protokol nerede durur

Katman Protokoller Rol Aktarım TCP, UDP Baytları gezdirmek, güvenilir ya da değil Aktarım (yeni nesil) QUIC UDP + akış başı güvenilirlik + gömülü TLS Güvenlik TLS, mTLS Şifreleme, bütünlük, kimlik doğrulama (tek ya da karşılıklı) Uygulama HTTP/HTTPS, WS/WSS, gRPC Değiş tokuşları yapılandırmak (istek yanıt, çift yönlü, tipli RPC)

Somut bir örnek fikirleri sabitlemek için: web panolu ve iç servisli bir mikroservis mimarisi makul şekilde HTTPS (pano ↔ herkese açık API, tarayıcı tarafında tek yönlü doğrulama yeterli), mTLS (dâhili servisten servise, karşılıklı doğrulama gerekli) ve WSS (panoya itilen gerçek zamanlı bildirimler) birleştirebilir: üç farklı uygulama protokolü, hepsi aynı TCP + TLS tabanı üstüne inşa edilmiş.

## Pratikte nasıl seçmeli

Genelde karar vermek için üç soru yeter:

1.  **Güvenilirliğe ve sıraya mı ihtiyacım var, yoksa verinin tazeliği garantili tesliminden önce mi gelir?** → Evetse TCP, hayırsa UDP (ya da farklı bir uzlaşmayla ikisini birden almak için QUIC).
    
2.  **Sunucu mesaj başlatabilmeli mi, yoksa istemci hep ilk isteği mi yapar?** → Sunucu itmeliyse WebSocket/gRPC akışı, yoksa klasik HTTP.
    
3.  **İki taraf da birbirine kimliğini kanıtlamalı mı, yoksa yalnızca birinin doğrulanması mı gerekir?** → zero-trust ortamında servisten servise için mTLS, klasik herkese açık istemci için basit TLS.
    

Eklenen her katmanda operasyonel karmaşıklık artar, çıplak TCPnin yönetilecek altyapısı yoktur, TLS sertifika ister, mTLS bir CA ve döndürme stratejisi ister, gRPC paylaşılan bir Protobuf şema tanımı ister. Doğru refleks, karmaşıklığa ancak alttaki katman somut bir limit gösterdiğinde çıkmaktır, önceden değil.
