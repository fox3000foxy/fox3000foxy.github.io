---
title: Bu Blog Nasıl Çalışıyor?
description: "Bu blogun iç işleyişine derin bir dalış: React, Vite, Markdown,
  CI/CD pipeline'ı ve makale yazma iş akışı."
date: 2026-03-08
aiGenerated: true
authors:
  - fox3000foxy
tags:
  - react
  - meta
  - blog
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "QW+VCEskjT9551csSpFBmWTJyX9dGo2T06yJfut+Y9G5teJ5XQ0Enj0/GVifq8Xd5Qebh1Yurjw8x3/hn35MZA=="
---

# Bu Blog Nasıl Çalışıyor?

Hiç bu blogun perde arkasında nasıl çalıştığını merak ettin mi? Bu yazıda, uygulamanın tüm mimarisini, teknoloji yığınından makale yazma sürecine kadar adım adım anlatacağım. Ve evet, makalelerimi VS Code'dan nasıl yazdığımı bile göstereceğim!

## Teknoloji Yığını

Bu blog, modern web teknolojileriyle inşa edildi:

- **React 19** -- kullanıcı arayüzü için
- **TypeScript** -- tipli ve daha güvenilir kod için
- **Vite** -- ultra hızlı bir derleme aracı olarak
- **React Router v7** -- sayfalar arası navigasyon için
- **react-markdown** -- Markdown'ı HTML'ye dönüştürmek için
- **rehype-raw + rehype-sanitize** -- Markdown'da ham HTML'e izin verirken güvenli kalmak için

Her şey **GitHub Pages** üzerinde doğrudan `fox3000foxy/blog` reposundan barındırılıyor.

## Proje Yapısı

Proje ağacı şöyle görünüyor:

![](assets/how-this-blog-works/project-structure.png)

```
├── .github/
│   └── workflows/
│       └── deploy.yml         ← CI/CD pipeline'ı
├── public/
│   ├── home.md                ← Ana sayfa içeriği
│   ├── portfolio.md           ← Portfolyo içeriği
│   └── articles/
│       ├── index.json         ← Tüm makalelerin listesi
│       ├── hello-world.md     ← Bir makale
│       ├── how-this-blog-works.md  ← Bu makale!
│       └── assets/            ← Makale görselleri
├── src/
│   ├── main.tsx               ← React giriş noktası
│   ├── App.tsx                ← Ana yönlendirici
│   ├── components/
│   │   ├── Header.tsx         ← Navigasyon çubuğu
│   │   └── Footer.tsx         ← Alt bilgi
│   └── pages/
│       ├── Home.tsx           ← Ana sayfa
│       ├── BlogList.tsx       ← Makale listesi
│       ├── Article.tsx        ← Makale okuyucu
│       ├── Portfolio.tsx      ← Portfolyo sayfası
│       └── NotFound.tsx       ← 404 sayfası
└── vite.config.ts             ← Vite yapılandırması
```

Temel fikir basit: **içerik koddan ayrılmıştır**. Sayfalar `public/` klasöründe Markdown olarak yazılır ve `src/` içindeki React kodu onları görüntülemekle ilgilenir.

## Yönlendirme Sistemi

`App.tsx` dosyası, React Router kullanarak tüm uygulama rotalarını tanımlar:

![](assets/20260308_153440_image.png)

| Rota          | Sayfa      | Açıklama                                      |
| --------------- | ----------- | ------------------------------------------------ |
| `/`           | Home      | Ana sayfa, `home.md` dosyasını yükler           |
| `/blog`       | BlogList  | Tüm makalelerin listesi                         |
| `/blog/:slug` | Article   | Tek bir makale, `articles/{slug}.md` dosyasını yükler |
| `/portfolio`  | Portfolio | Portfolyo sayfası, `portfolio.md` dosyasını yükler |
| `*`           | NotFound  | Bilinmeyen URL'ler için 404 sayfası             |

Her sayfanın iyi tanımlanmış bir rolü vardır: bir Markdown dosyasını getirir, `react-markdown` ile HTML'ye dönüştürür ve ekranda gösterir.

## Bir Makale Nasıl Çalışır?

Bu en ilginç kısım! İşte bir makalenin yaşam döngüsü:

### 1. `index.json` Dosyası

Tüm makaleler `public/articles/index.json` dosyasında referanslanır. Her girdi, makalenin metaverilerini içerir:

```json
[
  {
    "slug": "hello-world",
    "title": "Hello World",
    "description": "A sample post for Fox's Blog.",
    "date": "2026-03-08"
  }
]
```

- **slug** -- benzersiz tanımlayıcı, URL'de kullanılır (`/blog/hello-world`)
- **title** -- listede görüntülenen başlık
- **description** -- kısa bir özet
- **date** -- yayınlanma tarihi

### 2. Markdown Dosyası

Makale içeriği, `public/articles/` içinde basit bir `.md` dosyasıdır. Dosya adı, `index.json` içinde tanımlanan `slug` ile eşleşir.

![](assets/20260308_153509_image.png)

İçine her şeyi koyabilirsin: başlıklar, listeler, görseller, tablolar ve hatta `rehype-raw` sayesinde ham HTML!

### 3. React Tarafında İşleme

`/blog/hello-world` sayfasını ziyaret ettiğinde şunlar olur:

1. React Router, URL'den `slug` parametresini alır
2. `Article.tsx` bileşeni `/articles/hello-world.md` dosyasını getirir
3. Markdown, `react-markdown` tarafından HTML'ye dönüştürülür
4. `assets/` bağlantıları otomatik olarak `/articles/assets/` olarak yeniden yazılır
5. Paralel olarak, metaveriler `index.json`'dan yüklenerek tarih ve açıklama görüntülenir

Bu kadar basit!

## Ana Sayfa ve Portfolyo

Ana sayfa ve Portfolyo sayfaları tam olarak aynı şekilde çalışır: bir Markdown dosyası (`home.md` veya `portfolio.md`) yükler ve HTML olarak işler.

Özel olan şey, tüm HTML öğelerinde `class` ve `style` niteliklerine izin veren özel bir temizleme şeması kullanmalarıdır. Bu, Markdown içinde doğrudan stillendirilmiş HTML yazmama olanak tanır, örneğin görsel galerileri gibi.

## Başlık ve Alt Bilgi

Başlık, sayfanın üstüne `position: fixed` ile sabitlenmiştir. Şunları içerir:

- GitHub avatarım (doğrudan `github.com/fox3000foxy.png` adresinden yüklenir)
- Blog başlığı
- Gezinme bağlantıları: Ana Sayfa, Blog, Portfolyo

Alt bilgi minimalisttir: sadece dinamik olarak hesaplanan güncel yılı içeren bir telif hakkı.

## Karanlık Tema

Site **her zaman karanlık moddadır** -- açık/karanlık geçişi yoktur. Bu bilinçli bir seçimdir: global stillerde siyah arka plan `#000` ve beyaz metin `#fff` ile `color-scheme: dark` ayarlanmıştır. Bağlantılar mavidir (`#64b5f6`) ve üzerine gelindiğinde yeşile döner (`#81c784`).

## Bir Makaleyi Nasıl Yazıyorum

Şimdi pratik kısma geçelim! İşte yeni bir makale yazma iş akışım:

### Adım 1: Markdown Dosyasını Oluştur

VS Code'u açarım ve `public/articles/` içinde yeni bir `.md` dosyası oluştururum:

### Adım 2: İçeriği Yaz

Makale içeriğini doğrudan Markdown olarak yazarım. VS Code mükemmel bir yerleşik Markdown önizlemesi sunar:

![](assets/20260308_153613_image.png)

Görseller için, onları `public/articles/assets/` klasörüne koyarım ve standart Markdown sözdizimiyle referans veririm:

```markdown
![açıklama](assets/my-image.png)
```

`Article.tsx` bileşeni, `assets/` yolunu otomatik olarak `/articles/assets/` olarak yeniden yazar, böylece görseller doğru görüntülenir.

### Adım 3: Makaleyi index.json'a Kaydet

Makale bittiğinde, blog listesinde görünmesi için `public/articles/index.json` dosyasına eklerim:

![](assets/20260308_153629_image.png)

### Adım 4: Yerelde Test Et

Vite geliştirme sunucusunu başlatırım:

```bash
pnpm dev
```

Vite milisaniyeler içinde başlar ve makalemi `localhost:5173` adresinde gerçek zamanlı olarak görebilirim:

![](assets/20260308_153703_image.png)

### Adım 5: Yayınla

Sadece `git push` yapmak yeterli! CI/CD pipeline'ı gerisini otomatik olarak halleder.

## CI/CD Dağıtım Pipeline'ı

`main` branch'ine her push yaptığımda lint, build ve deploy işlemlerini otomatikleştiren tam bir **GitHub Actions** pipeline'ı kurdum. Gelin adım adım inceleyelim.

Workflow, `.github/workflows/deploy.yml` dosyasında yaşar ve iki job'a ayrılmıştır: **build** ve **deploy**.

### Tetikleyiciler

```yaml
on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
```

Pipeline, `main` branch'ine her **push**ta ve `main`'i hedefleyen her **pull request**te çalışır. Bu sayede PR'lar birleştirilmeden önce kontrol edilir (lint + build), ancak sadece `main`'e yapılan push'lar gerçekten dağıtımı tetikler.

### Job 1: Build

Build job'ı `ubuntu-latest` üzerinde çalışır ve şu adımlardan geçer:

1. **Checkout** -- Repoyu tam geçmişiyle klonlar (`fetch-depth: 0`)
2. **Setup pnpm** -- `pnpm/action-setup@v4` kullanarak en son pnpm sürümünü kurar
3. **Setup Node.js 20** -- Node'u pnpm önbelleği etkinken yapılandırır (daha hızlı kurulum için)
4. **Install dependencies** -- Tekrarlanabilir derlemeler için `pnpm install --frozen-lockfile` çalıştırır (lockfile değişikliklerine izin verilmez)
5. **Lint** -- Derlemeden önce kod kalitesi sorunlarını yakalamak için `pnpm run lint` (ESLint) çalıştırır
6. **Build** -- Önce TypeScript türlerini kontrol eden (`tsc -b`) ardından her şeyi Vite ile paketleyen `pnpm run build` çalıştırır
7. **Upload artifact** -- `dist/` klasörünü deploy job'ı için bir build yapıtı olarak yükler

Herhangi bir adım başarısız olursa -- bir lint hatası, bir tür hatası, bir derleme hatası -- tüm pipeline durur ve hiçbir şey dağıtılmaz. Bu, canlı siteyi bozuk koddan korur.

### Job 2: Deploy

Deploy job'ı sadece şu durumlarda çalışır:

- Build job'ı başarılı olduysa (`needs: build`)
- Olay bir **push** ise (PR değil)
- Branch **main** ise

```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

Ardından:

1. **Build yapıtını indirir** -- Build job'ının ürettiği `dist/` klasörünü alır
2. **GitHub Pages'i yapılandırır** -- Pages ortamını kurar
3. **Pages'e yükler** -- `dist/` klasörünü GitHub Pages için paketler
4. **Dağıtır** -- `actions/deploy-pages@v4` kullanarak siteyi yayınlar

### Tam Resim

İşte yazmadan dağıtıma kadar olan süreç:

```
VS Code'da makaleyi yaz
        ↓
   git add & commit
        ↓
      git push
        ↓
  GitHub Actions tetiklenir
        ↓
  ┌─────────────────┐
  │   BUILD JOB'ı   │
  │  1. Checkout    │
  │  2. Setup pnpm  │
  │  3. Setup Node  │
  │  4. Install     │
  │  5. Lint ✓      │
  │  6. Build ✓     │
  │  7. Upload dist │
  └────────┬────────┘
           ↓
  ┌─────────────────┐
  │  DEPLOY JOB'ı   │
  │  1. Download    │
  │  2. Configure   │
  │  3. Upload      │
  │  4. Deploy 🚀   │
  └─────────────────┘
           ↓
    GitHub Pages'de canlı!
```

Tüm süreç, push'tan canlı yayına kadar yaklaşık bir dakika sürer. Manuel dağıtım yok, FTP yok, SSH yok -- sadece `git push` ve iş tamam.

## Production Derlemesi

Perde arkasında, `pnpm build` komutu şunları çalıştırır:

1. `tsc -b` -- TypeScript türlerini kontrol eder
2. `vite build` -- Tüm kodu paketler ve optimize eder

Vite, otomatik kod bölme ile küçültülmüş ve optimize edilmiş dosyalar üretir. Sonuç, uçuk hızlı bir statik sitedir.

## Neden Bu Mimari?

Bir CMS, Hugo veya Jekyll gibi bir statik site oluşturucu, hatta Next.js kullanabilirdim. Ama bu yaklaşımı seçmemin nedeni şu:

- **Basitlik** -- Markdown yaz, GitHub'a pushla, canlıya çıksın
- **Tam kontrol** -- Bir CMS veya veritabanına bağımlılık yok
- **Performans** -- Vite + React = hızlı yükleme
- **Esneklik** -- Markdown ve HTML'i dilediğim gibi karıştırabilirim
- **Öğrenme** -- React ve TypeScript'i ustalaşmak için harika bir proje
- **CI/CD** -- GitHub Actions ile otomatik kalite kontrolleri ve dağıtım

## Sonuç

Bu blog basit ama iyi düşünülmüş bir proje: içerik için Markdown, işleme için React, performans için Vite, CI/CD için GitHub Actions ve barındırma için GitHub Pages. Veritabanı yok, arka uç sunucusu yok, sadece her push'ta kaliteyi sağlayan otomatik bir pipeline ile verimli bir şekilde sunulan statik dosyalar.

Eğer benzer bir mimariyle kendi blogunu oluşturmak istersen, [GitHub'daki kaynak koda](https://github.com/fox3000foxy/blog) göz atmaktan çekinme!

Okuduğun için teşekkürler, bir sonraki makalede görüşmek üzere! 🦊
