---
title: "Minecraft Bedrock'ta herhangi bir pelerini nasil alirsiniz"
description: "Ucuncu parti bir baslatici, oyunun eski bir surumu ve hayir demeyi asla ogrenmemis bir pelerin secici. Tam rehber arti neden calistiginin olasi aciklamasi."
date: 2026-07-14
tags:
  - minecraft
  - bedrock
  - tutorial
  - reverse-engineering
authors:
  - 9stown
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "7zg1vEMgJwyBA8HPg0OOvprfYjzxvd6yqnNm7ephahfyltLM9WS00N4I3wCjK6cuNvgW9Cw25tSPmwzQDiCHQA=="
---

# Minecraft Bedrock'ta herhangi bir pelerini nasil alirsiniz

Java'da olmamaniz gereken bir pelerine sahip olmanin bir suru dolambaçli yolu var (`cape-mod` yazisina bakin). Bedrock'ta oyun farkli, kimlik dogrulama farkli, ama yine de bir yolu var -- mod gerekmiyor, ag paketiyle oynamak gerekmiyor. Sadece ucuncu parti bir baslatici ve beklenen dogrulamaya sahip olmayacak kadar eski bir oyun surumu.

Iste nasil yapilacagi, ardindan da kaputun altinda muhtemelen neler olduguna bakalim.

## Ihtiyaciniz olanlar

- Halihazirda Minecraft Bedrock'a sahip bir Microsoft hesabi (sizinki is gorur)
- Resmi Minecraft baslaticisi kurulu
- [BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher), Bedrock'un herhangi bir tarihi surumunu kurup calistirmaniza olanak saglayan acik kaynakli bir ucuncu parti baslatici
- .NET 8.0 Desktop Runtime
- Windows'ta gelistirici modu etkin

## Adim 1 -- Bedrock'i resmi baslaticiyla en az bir kez kurun

Baska bir sey yapmadan once, resmi Minecraft baslaticisini acin, **Minecraft: Bedrock Edition** sekmesine gidin ve **Yukle**'ye tiklayin. BedrockLauncher'a dokunmadan once Bedrock'in en az bir kez resmi kanaldan kurulmus ve calistirilmis olmasi gerek.

![Resmi baslaticidan Bedrock Edition'i kurma](/images/bedrock-cape/bedrock-cape-01-install-bedrock.png)

## Adim 2 -- BedrockLauncher'i indirin

Projenin GitHub surumler sayfasina gidin. **Assets** altinda listelenen en son surumun zip dosyasini alin.

![BedrockLauncher GitHub surumler sayfasi](/images/bedrock-cape/bedrock-cape-02-github-release.png)

## Adim 3 -- Arsivi cikarin

Zip indirildikten sonra, `Indirilenler` klasorune (veya sonra bulabileceginiz herhangi bir yere) cikarin.

![BedrockLauncher arsivini cikarma](/images/bedrock-cape/bedrock-cape-03-extract-zip.png)

## Adim 4 -- Calistirilabilir dosyayi calistirin

Cikartilan klasore gidin ve `BedrockLauncher.exe`'yi calistirin.

![BedrockLauncher.exe'yi calistirma](/images/bedrock-cape/bedrock-cape-04-run-exe.png)

## Adim 5 -- .NET Desktop Runtime'i yukleyin ve gelistirici modunu etkinlestirin

Ilk calistirmada Windows buyuk ihtimalle **.NET 8.0 Desktop Runtime** isteyecek -- kurun. Ayrica `Ayarlar > Sistem > Gelistiriciler icin` uzerinden **gelistirici modunu** etkinlestirmeniz gerek, cunku BedrockLauncher oyunu loose paket olarak kurar (ham dosyalar, imzali gercek bir Store paketi degil) ve Windows bu mod olmadan bu tarz bir kurulumu reddeder.

![.NET Runtime kurulumu ve gelistirici modunu etkinlestirme](/images/bedrock-cape/bedrock-cape-05-dotnet-devmode.png)

## Adim 6 -- Yeni bir kurulum olusturun

BedrockLauncher'i tekrar baslatin, Microsoft hesabinizla giris yapin, **Installations** sekmesine gidin ve **New installation**'a tiklayin.

![BedrockLauncher'da yeni kurulum olusturma](/images/bedrock-cape/bedrock-cape-06-new-installation.png)

## Adim 7 -- Eski bir surum secin

Kuruluma bir isim verin, sonra surum listesinden **eski** bir surum secin -- tipik olarak `1.16.x` veya daha eski. **Create**'e tiklayin.

![Eski bir surum secme, burada 1.16.0.2](/images/bedrock-cape/bedrock-cape-07-pick-old-version.png)

## Adim 8 -- Kurulumu baslatin

**Play**'e tiklayin. Dosya cikarma islemi bilgisayara bagli olarak on dakikaya kadar surebilir -- baslatici donmus gorunecek ("Yanit Vermiyor"), bu normal, calismaya birakin.

![Cikarma islemi devam ediyor, baslatici yanit vermiyor gorunuyor](/images/bedrock-cape/bedrock-cape-08-launch-extracting.png)

## Adim 9 -- Pelerini secin

Oyun baslatildiktan sonra, hesabinizla giris yapin, yeni bir karakter olusturun ve skin editorunde **Pelerinler** sekmesine gidin. Orada, hic sahip olmadiklariniz da dahil olmak uzere oyunda var olan tum pelerinlerin tam listesini bulacaksiniz (promosyon etkinlikleri, gecmis festivaller, Mob Vote pelerinleri vb.). Istediginizi secin.

**Bu asamada skinin geri kalan gorunumune dokunmayin**, sadece pelerini birakin.

![Karakter editorunde pelerin secimi](/images/bedrock-cape/bedrock-cape-09-choose-cape.png)

## Adim 10 -- Resmi surumu yeniden yukleyin

Resmi baslaticiya geri donun, **Kurulum** sekmesi, ana Bedrock kurulumunda **Kaldir**'a tiklayin, sonra yeniden yukleyin (veya **Guncellemeleri Denetle**'ye tiklayin). Minecraft Bedrock'i bu sefer resmi baslaticidan baslatin.

![Resmi baslaticidan kaldirma ve yeniden yukleme](/images/bedrock-cape/bedrock-cape-10-reinstall-official.png)

Iste bu kadar -- pelerininiz orada, resmi surumde, gercek profilinizde.

## Muhtemelen neler oluyor

Bedrock'un kapali kaynak kodunu kurcalamadim (derlenebilir olan Java'nin aksine), bu yuzden asagidaki **olasi** bir aciklama, kesin bir bilgi degil. Ancak gozlemlenen davranis asagidaki hipoteze oldukca iyi uyuyor.

### Pelerin secici hicbir zaman bir erisim kontrolu degildi

Bedrock'ta pelerin secim ekrani buyuk ihtimalle **oyunda var olan tum pelerinlerin tam listesini** gosteriyor, sadece hesabinizin sahip olduklarini degil. Yeni istemcilerde bir uygulama filtresi (istemci tarafinda veya Xbox/Microsoft yetkilendirme servisine bir ag cagrisi yoluyla) sahip olmadiginiz pelerinleri gri yapar veya gizler.

Kilit nokta, bu filtrenin muhtemelen **sonradan**, yeterince yeni bir surumde eklenmis olmasi. 1.16.x gibi bir surum bu filtreden once gelir veya farkli (ya da var olmayan) bir dogrulama mekanizmasi kullanir: listedeki her sey secilebilir hale gelir, yetki olsun ya da olmasin.

### Pelerin tam olarak nerede saklaniyor?

Bu kisim yeniden yuklemeden sonra neden hayatta kaldigini acikliyor. Bedrock'ta skin/pelerin secimi sadece kullan-at bir yerel dosya degil -- Microsoft hesabiniza bagli Xbox Live profiline buyuk ihtimalle senkronize ediliyor (diger Bedrock platformlarindaki -- mobil, konsol vs. -- skininizi yoneten ayni sistem). Eski istemcide bir pelerin sectiginizde, guncel bir istemcinin mesru bir pelerinle yapacagi gibi bu secimi profil servisine gonderiyor olabilir -- cunku istemcinin bakis acisindan "size ait" bir pelerin ile "secilmis" bir pelerin arasinda hicbir fark yok. Profil servisi ise bu noktada istemciye guveniyor: yazma aninda, arkasinda gercekten yetkinin olup olmadigini yeniden dogrulamadan secimi kaydediyor.

Sonuc: guncel resmi oyunu yeniden baslattiginizda, mevcut skin/pelerininizi profil servisinden aliyor -- ve servis, kurallara uymayan pelerin de dahil olmak uzere kaydedileni sadik bir sekilde geri donduruyor. Yetki kontrolu, eger varsa, buyuk ihtimalle yeni UI'da **secim** aninda gerceklesiyor (bu yuzden yeni istemcilerde filtre var), zaten profilde kayitli olanin **goruntulenmesi** aninda degil.

### Java ile paralellik

Java'daki `cape-mod` ile ayni mantik hatasi ailesinden: bir servis, her adimda kokenini yeniden kontrol etmeden verilere guveniyor. Java'da bu, yanlis profilde tekrarlanan gecerli bir RSA imzasi. Bedrock'ta ise buyuk ihtimalle dogru filtreye hic sahip olmamis eski bir istemci tarafindan kabul edilen ve daha sonra yeniden dogrulama olmaksizin hesabin kalici durumuna yayilan bir pelerin secimi. Her iki durumda da sorun giris noktasi (Java modu, eski Bedrock istemcisi) degil -- yetkiyi asagi akista yeniden dogrulamasi gereken katmanin bunu yapmamasi veya sadece bir kez, yanlis yerde yapmasi.

## Neden hala calisiyor

Birbirini dislamayan iki olasi aciklama:

1. **Mojang muhtemelen bunu oncelikli olarak gormuyor.** Ucuncu parti bir baslatici, cok adimli bir islem gerektiriyor ve sonuc tamamen kozmetik -- oynanis avantaji yok, baskasinin verisi tehlikeye atilmiyor.
2. **Bunu duzgunce duzeltmek, yetkilerin her profil okumasinda yeniden dogrulanmasini gerektirir**, sadece secim aninda degil -- bu da her skin goruntulemede ek bir ag cagrisi demek, sadece estetikle ilgili bir sorun icin.

## Sonuc

Bu rehber on ekran goruntusune sigiyor ama yazilim guvenliginin her yerinde gorulen bir prensibi gosteriyor: eski bir sistem (eski bir istemci surumu, eski bir API, hic guncellenmemis bir servis) hala paylasilan bir duruma yazabildigi surece, gunumuzdeki erisim kontrolu sadece su andan geceni korur. Hala eski API ile konusabilen her sey daha yeni filtreyi atlar -- filtre bozuk oldugu icin degil, ondan onceki surume hic uygulanmadigi icin.

---

**Kaynaklar**

- **BedrockLauncher** : [github.com/bedrockLauncher/BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher)
- **Ilgili makale** : Cape Mod, RSA imza enjeksiyonu ile Java esdegeri

**3 onemli nokta**

1. Eski bir Bedrock surumundeki pelerin secici, yetki filtresi olmadan tum oyun pelerinlerinin tam listesini gosteriyor olabilir.
2. Secim daha sonra herhangi bir mesru pelerin gibi Xbox Live profilinize senkronize olur -- profil servisi istemciye guvenir.
3. Yetki kontrolu, eger varsa, yeni UI'daki secim sirasinda gerceklesir -- hesapta zaten kayitli olanin okunmasi sirasinda degil.
