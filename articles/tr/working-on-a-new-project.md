---
title: Yeni Bir Proje Üzerinde Çalışmak
description: Yeni bir web sitesini başlatma ve geliştirme sürecine bir bakış.
date: 2026-03-13
tags:
  - meta
  - webdev
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "wLexvSkX+lDgGCPNlk1QiZaZeseKkTquUf2YBbKhR9IpF+GuGNHEhEwe7H9V4/Ociwb1tpSs7S4xMru7Nle1Mg=="
---

# Proje

Üzerinde çalıştığım projenin adı LLJT:

![](assets/20260313_092734_image.png)

Bu aynı zamanda bir PWA olan bir web sitesi, yani mobil uygulama gibi kullanılabiliyor. Gerçek bir telefon uygulaması gibi davranması için MaterialUI kullanıyor.
Mui importlarıyla bir süre uğraştım: yıkıcı import yerine her ikonu satır satır import ederek 11707 modülden sonunda 595 modüle indim. O zaman yıkıcı importun tüm ikon kütüphanesini yüklediğini, bireysel importların ise sadece kullanılanları yüklediğini öğrendim.

Nibi bu web sitesine bağlı bot.![](assets/20260313_093102_image.png)Notlandırma Google Forms üzerinden yapılıyor:
![](assets/20260313_093255_image.png)
Öğrencilerimizi testlerle değerlendiriyoruz ve önemli bir sınavı geçtiklerinde onlara Discord rolleri, emojiler ve kanallar da veriyoruz.

![](assets/20260313_093707_image.png)

Bu projenin amacı insanların bizimle birlikte Japonca öğrenmesine yardım etmek, çünkü bu benim de kendim yapmak istediğim bir şey.
Öğrenciler ilerlemelerini ödüllendirmek için Crunchyroll ve diğer platformlarla ortaklıkların da kilidini açacak.

Nibi ve site sırasıyla Cloudflare Workers (Hono Server ile Interaction URL) ve React ile GitHub Pages tarafından barındırılıyor.
Sitenin kodu açık kaynak değil ama Nibi açık kaynak ve onu [bu GitHub deposunda](https://github.com/let-s-Learn-Japanese-Together/nibi) bulabilirsin. Site özel bilgiler içerdiği için gizli kalıyor ama onu nasıl inşa ettiğimi bilmek istersen bana Discord üzerinden sor, süreci sana memnuniyetle anlatırım! GitHub Enterprise için ödeme yapmamak için oluşturduğum bir GitHub Action ve ilgini çekerse anlatabileceğim başka araçlar ve teknikler kullanıyor!

Birkaç gündür projelerimi barındırma için ödeme yapmadan barındırmak için geçici çözümler bulmaktan çok keyif alıyorum. Bu yüzden Nibi'yi Interaction Endpoint botu yaptım, Cloudflare Workers üzerinde ücretsiz barındırmak için, ve siteyi GitHub Pages üzerinde ücretsiz dağıtmak için bir GitHub Action oluşturdum. Bu geçici çözümleri aramak benim için kodun en heyecan verici kısımlarından biri olmaya devam ediyor: farklı düşünmek ve yaratıcı çözümler inşa etmek gerekiyor ve beni motive eden tam olarak bu bütçesiz meydan okuma!

GitHub Actions'ı tasarlanan kullanımının dışında kullanmak ve bir botu "barındırmak" için Cloudflare Workers kullanmak, aynı zamanda yeni şeyler öğrenmenin ve bulut barındırma gibi yeni teknolojiler keşfetmenin bir yolu. Artık barındırma için ödeme yapmak istemiyorum.

Hâlâ üzerinde çalışıyorum ama ilerlemeyi takip etmek ve nasıl geliştiğini görmek için [Discord sunucusuna](https://discord.gg/frKZ9cJ4fD) katılabilirsin, hatta ilgini çekerse projeye katılabilirsin bile! Sunucu herkese açık ve birlikte Japonca öğrenmek için daha fazla insan görmek isteriz! Davet bağlantısını sitede bulursun ya da doğrudan bana sorabilirsin!
