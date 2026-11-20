---
title: Minecraft Bedrock üzerinde herhangi bir pelerini nasıl almalı
description: "Üçüncü parti bir başlatıcı, oyunun eski bir sürümü ve hayır demeyi hiç öğrenmemiş bir pelerin seçici. Tam öğretici artı neden işe yaradığının muhtemel açıklaması."
date: 2026-07-14
tags:
  - minecraft
  - bedrock
  - tutorial
  - reverse-engineering
authors:
  - 9stown
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "TGrDHUmSDt4LencabAcZx9XyhbwJVWeZDz5mmO/TfwZYiCoCGqUHVYGvEVn+xeOTt5Tkca+6xwYzbOO24B6qPQ=="
---

# Minecraft Bedrock üzerinde herhangi bir pelerini nasıl almalı

Javada sahip olmaman gereken bir pelerinle sonuçlanmanın bir sürü çarpık yolu vardır (`cape-mod` makalesine bak). Bedrockta oyun farklıdır, kimlik doğrulama farklıdır ama yine de bir yol vardır: üçüncü parti bir başlatıcı ve kazanılmış sanılan doğrulamayı görmezden gelecek kadar eski bir oyun sürümü yeter.

İşte nasıl yapılacağı ve sonra kaputun altında muhtemelen neler olduğuna bakıyoruz.

## Neye ihtiyacın var

- Zaten Minecraft Bedrocka sahip bir Microsoft hesabı (seninki gayet iyi iş görür)
- Kurulu resmi Minecraft başlatıcısı
- Herhangi bir tarihsel Bedrock sürümünü kurup çalıştırmaya izin veren açık kaynak üçüncü parti bir başlatıcı olan [BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher)
- .NET 8.0 Desktop Runtime
- Windows üzerinde etkinleştirilmiş geliştirici modu

## Adım 1: Bedrockı resmi başlatıcıyla en az bir kez kur

Başka bir şey yapmadan önce resmi Minecraft başlatıcısını aç, **Minecraft: Bedrock Edition** sekmesine git ve **Install** düğmesine tıkla. BedrockLaunchera dokunmadan önce Bedrockın resmi yoldan en az bir kez kurulmuş ve çalıştırılmış olması gerekir.

![Resmi başlatıcıdan Bedrock Edition kurulumu](/images/bedrock-cape/bedrock-cape-01-install-bedrock.png)

## Adım 2: BedrockLauncherı indir

Projenin GitHub releases sayfasına git. **Assets** içinde listelenen son sürümün zipini al.

![BedrockLauncherın GitHub releases sayfası](/images/bedrock-cape/bedrock-cape-02-github-release.png)

## Adım 3: Arşivi çıkar

Zip indirildikten sonra `Downloads` klasörüne çıkar (ya da klasörü sonra bulacağın sürece herhangi bir yere).

![BedrockLauncher arşivinin çıkarılması](/images/bedrock-cape/bedrock-cape-03-extract-zip.png)

## Adım 4: Çalıştırılabilir dosyayı çalıştır

Çıkarılan klasöre git ve `BedrockLauncher.exe` dosyasını çalıştır.

![BedrockLauncher.exe dosyasının çalıştırılması](/images/bedrock-cape/bedrock-cape-04-run-exe.png)

## Adım 5: .NET Desktop Runtime kur ve geliştirici modunu etkinleştir

İlk çalıştırmada Windows büyük olasılıkla **.NET 8.0 Desktop Runtime** isteyecek: kur. Ayrıca `Paramètres > Système > Pour les développeurs` içinde **geliştirici modunu** etkinleştirmek gerekir çünkü BedrockLauncher oyunu gevşek bir paket olarak kurar (ham dosyalar, Storedan imzalı gerçek bir paket değil) ve Windows bu tür kuruluma bu mod olmadan izin vermez.

![.NET çalışma ortamı kurulumu ve geliştirici modu etkinleştirme](/images/bedrock-cape/bedrock-cape-05-dotnet-devmode.png)

## Adım 6: Yeni bir kurulum oluştur

BedrockLauncherı yeniden çalıştır, Microsoft hesabınla bağlan, **Installations** sekmesine git ve **New installation** düğmesine tıkla.

![BedrockLauncher içinde yeni kurulum oluşturma](/images/bedrock-cape/bedrock-cape-06-new-installation.png)

## Adım 7: Eski bir sürüm seç

Kuruluma bir ad ver, sonra sürüm listesinden **eski** bir sürüm seç: tipik olarak `1.16.x` ya da daha eski bir sürüm. **Create** düğmesine tıkla.

![Eski sürüm seçimi, burada 1.16.0.2](/images/bedrock-cape/bedrock-cape-07-pick-old-version.png)

## Adım 8: Kurulumu başlat

**Play** düğmesine tıkla. Dosyaların çıkarılması makineye göre on dakikaya kadar sürebilir: başlatıcı donmuş görünecek ("Not Responding"), bu normal, çalışmaya bırak.

![Çıkarma sürüyor, başlatıcı yanıt vermiyor gibi görünüyor](/images/bedrock-cape/bedrock-cape-08-launch-extracting.png)

## Adım 9: Pelerini seç

Oyun açıldığında hesabınla bağlan, yeni bir karakter oluştur ve görünüm editörüne, **Capes** sekmesine git. Orada oyunda var olan tüm pelerinlerin tam listesini bulacaksın, hiç sahip olmadıkların dahil (tanıtım etkinlikleri pelerinleri, geçmiş festivaller, Mob Vote vs.). İstediğini seç.

**Bu aşamada görünümün geri kalanına dokunma**, sadece pelerini bırak.

![Karakter editöründe pelerin seçimi](/images/bedrock-cape/bedrock-cape-09-choose-cape.png)

## Adım 10: Resmi sürümü yeniden kur

Resmi başlatıcıya dön, **Installation** sekmesi ve ana Bedrock kurulumunda **Uninstall** düğmesine tıkla, sonra yeniden kur (ya da **Check for Updates** yap). Bu sefer resmi başlatıcıdan Minecraft Bedrockı yeniden çalıştır.

![Resmi başlatıcıdan kaldırma ve yeniden kurma](/images/bedrock-cape/bedrock-cape-10-reinstall-official.png)

Ve işte bu: pelerin orada, resmi sürümde, gerçek profilinde.

## Muhtemelen neler oluyor

Kapalı kaynak Bedrock kodunun içine ellerimi sokmadım (decompilesi yapılabilen Javanın tersine), o yüzden sonrası **muhtemel** bir açıklama, mutlak bir kesinlik değil. Ama gözlemlenen davranış şu hipoteze epey uyuyor.

### Pelerin seçici hiç erişim kontrolü olmadı

Bedrockta pelerin seçim ekranı büyük olasılıkla **oyunda var olan tüm pelerinlerin tam listesini** gösterir, yalnızca hesabının sahip olduklarını değil. Güncel istemcilerde uygulamalı bir filtre (istemci tarafı ya da Xbox/Microsoft yetkilendirme servisine ağ çağrısı üzerinden) sahip olmadığın pelerinleri grileştirir ya da gizler.

Kilit nokta şu ki bu filtre muhtemelen **sonradan** eklendi, yeterince güncel bir oyun sürümünde. 1.16.x gibi bir sürüm bu filtreden öncedir ya da farklı bir doğrulama mekanizması kullanır (hatta yok): listedeki her şey yetki olsun olmasın seçilebilir olur.

### Pelerin tam olarak nerede saklanıyor?

Yeniden kurulmadan sağ çıkmayı açıklayan kısım bu. Bedrockta görünüm/pelerin seçimi atılabilir yerel bir dosyadan ibaret değildir: büyük olasılıkla Microsoft hesabına bağlı Xbox Live profilinde senkronize edilir (diğer Bedrock platformlarında: mobil, konsol vs. görünümünü yöneten sistemin aynısı). Eski istemcide bir pelerin seçtiğinde bunu büyük olasılıkla profil servisine aynen meşru pelerinli güncel bir istemcinin yapacağı gibi gönderir, çünkü istemcinin gözünde "senin" bir pelerinle "seçilmiş" bir pelerin arasında fark yoktur. Profil servisi de bu noktada istemciye güvenir: yetkilendirmenin gerçekten arkada var olup olmadığını yeniden doğrulamadan seçimi kaydeder, en azından yazma anında değil.

Sonuç: güncel resmi oyunu yeniden çalıştırdığında mevcut görünümünü/pelerinini profil servisinden çeker ve servis kaydedileni sadakatle döndürür, meşru olmayan pelerin dahil. Yetki kontrolü varsa muhtemelen yalnızca UI içinde **seçim** anında yapılır (güncel istemcilerdeki filtre bu yüzden) ve hesapta zaten kayıtlı olanın **görüntülenmesini** serbest geçirir.

### Java ile paralellik

Javadaki `cape-mod` ile aynı mantıksal açık ailesi: bir servis her adımda kaynağını yeniden doğrulamadan bir veriye güvenir. Javada geçerli ama yanlış profilde tekrar oynatılan bir RSA imzasıdır. Bedrockta büyük olasılıkla doğru filtreye hiç sahip olmamış eski bir istemci tarafından kabul edilen bir pelerin seçimi, sonra hesabın kalıcı durumuna yeniden doğrulama olmadan yayılır. İki durumda da sorun giriş noktası değildir (Java modu, eski Bedrock istemcisi): yetkilendirmeyi aşağıda yeniden doğrulaması gereken katmanın bunu yapmaması, ya da yanlış yerde bir kez yapmasıdır.

## Neden hâlâ işe yarıyor

Birbiriyle uyumsuz olmayan iki olası açıklama:

1. **Mojang bunu muhtemelen öncelikli görmüyor.** Üçüncü parti bir başlatıcı, çok adımlı bir manipülasyon gerekir ve sonuç tamamen kozmetiktir: oyun avantajı yok, başkasının verisi ele geçirilmiş değil.
2. **Bunu düzgün yamalamak yetkilendirmeleri profilin her okunuşunda yeniden doğrulamayı gerektirirdi**, yalnızca seçimde değil: bu da yalnızca estetikle ilgili bir sorun için her görünüm gösteriminde ek bir ağ çağrısı demektir.

## Sonuç

Bu öğretici on ekran görüntüsüne sığar ama yazılım güvenliğinde her yerde bulunan bir ilkeyi gösterir: tarihsel bir sistem (eski bir istemci sürümü, legacy bir API, hiç güncellenmemiş bir servis) paylaşılan bir duruma hâlâ yazabildiği anda, bugünün erişim kontrolü yalnızca bugünden geçeni korur. Eski API ile hâlâ konuşabilen her şey daha yeni filtreyi atlatır: filtre güncel sürümlerde çalışır ama onu önceleyen sürüme hiç uygulanmamıştır.

---

**Kaynaklar**

- **BedrockLauncher**: [github.com/bedrockLauncher/BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher)
- **İlgili makale**: Cape Mod, RSA imzası enjeksiyonuyla Java eşdeğeri

**3 kilit nokta**

1. Eski bir Bedrock sürümünün pelerin seçicisi büyük olasılıkla oyunun tüm pelerin listesini yetki filtresi olmadan gösterir.
2. Seçim sonra herhangi bir meşru pelerin gibi Xbox Live profilinde senkronize edilir: profil servisi istemciye güvenir.
3. Varsa yetki kontrolü güncel UI içinde seçimde yapılır: hesapta zaten kayıtlı olanın okunmasında değil.
