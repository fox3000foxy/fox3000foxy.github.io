# Proje

Üzerinde çalıştığım projenin adı LLJT:

![](assets/20260313_092734_image.png)

Bu bir web sitesi ve aynı zamanda bir PWA, yani bir mobil uygulama da. Gerçek bir telefon uygulaması gibi hissettirmek için MaterialUI kullanıyor.
Yakın zamanda Mui import'larını yönetmem gerekti ve her ikonu satır satır ayrı ayrı import ederek, destructered import kullanmak yerine 11707 modülden sadece 595'e düştüm: şunu öğrendim ki destructered yaptığında aslında tüm ikon kütüphanesini yüklüyorsun, tek tek import ettiğinde ise sadece ihtiyacın olanları import ediyorsun.

Nibi, bu web sitesine bağlı olan bot. ![](assets/20260313_093102_image.png) Mezuniyet Google Forms üzerinden yapılıyor:
![](assets/20260313_093255_image.png)
Öğrencilerimizi değerlendirmek için çoktan seçmeli testler kullanıyoruz ve ayrıca büyük bir sınavı geçerlerse öğrencilerimize Discord rolleri, emojiler ve kanallar da veriyoruz.

![](assets/20260313_093707_image.png)

Bu projenin amacı, insanların bizimle birlikte Japonca öğrenmesini sağlamak çünkü ben de kendim yapmak istediğim bir şey.
Öğrenciler ayrıca yeteneklerini ödüllendirmek için Crunchyroll ve diğer platformlarla ortaklıkların kilidini açacak.

Nibi ve web sitesi sırasıyla Cloudflare Workers Hono Server Interaction URL ve GitHub Pages ile React Deployement üzerinde barındırılıyor.
Web sitesinin kodu açık kaynak değil, ancak Nibi açık kaynak ve onu [bu GitHub reposunda](https://github.com/let-s-Learn-Japanese-Together/nibi) bulabilirsin. Web sitesi açık kaynak değil çünkü bazı özel bilgiler içeriyor, ama nasıl inşa ettiğimi merak ediyorsan bana Discord'dan falan sorabilirsin, süreci seninle paylaşmaktan mutluluk duyarım! Aslında GitHub Enterprise'a para ödememek için yaptığım bir GitHub Action kullanıyor ve ayrıca ilgini çekerse paylaşabileceğim bir sürü başka havalı araç ve teknik de kullanıyor!

Bir süredir projelerimi barındırmamak ve barındırma ücreti ödememek için işin kestirmesini bulmayı gerçekten seviyorum, bu yüzden Nibi'yi bir Interaction Endpoint Botu yaptım, böylece Cloudflare Workers'da ücretsiz barındırılabiliyor ve ayrıca web sitesini GitHub Pages'de ücretsiz dağıtmak için bir GitHub Action yaptım, böylece barındırma için para ödemek zorunda kalmıyorum. Bence işin kestirmesini bulmak, kod yazmanın en eğlenceli kısımlarından biri ve gerçekten zevk aldığım bir şey! Gerçekten kalıpların dışında düşünmek ve sorunlara yaratıcı çözümler bulmak zorundasın, işte bunu seviyorum. Sadece kod yazmakla ilgili değil, para harcamadan işleri yürütmenin yollarını bulmakla ilgili ve bu gerçekten keyif aldığım bir meydan okuma!

GitHub Actions'ı özel olarak yapılmadığı bir şekilde kullanmak ve Cloudflare Workers'ı bir botu 'barındırmak' için kullanmak aynı zamanda yeni şeyler öğrenmenin ve Bulut Barındırma gibi yeni teknolojiler keşfetmenin bir yolu, ki bu da gerçekten keyif aldığım bir şey. Artık barındırma için para ödemek istemiyorum.

Hâlâ üzerinde çalışıyorum ama ilerlemeyi takip etmek ve nasıl geliştiğini görmek istersen [Discord sunucusuna](https://discord.gg/frKZ9cJ4fD) katılabilirsin, hatta ilgini çekerse projeye katılabilirsin! Sunucu herkese açık ve bu Japonca öğrenme yolculuğunda bize katılmanı çok isteriz! Davet bağlantısını web sitesinde bulabilirsin ya da istersen bana sorabilirsin!
