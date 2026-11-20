---
title: Bu blog nasıl çalışıyor?
description: "Blogun perde arkası: React, Vite, Markdown, CI/CD pipelineı ve
  yazım akışı."
date: 2026-03-08
aiGenerated: true
tags:
  - react
  - meta
  - blog
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "5MWhvuis22fNtiBXTjK93Htv6NIJLBd917KK+v02X7VBTb1ZPcV2Upzd0G8loIh1CjXsLKsGN+Pgsw9XmlCM4A=="
---

# Bu Blog Nasıl Çalışıyor?

Bu blogun kaputun altında nasıl çalıştığını hiç merak ettin mi? Bu makalede uygulamanın tüm mimarisini, teknik yığından bir makale yazma sürecine kadar detaylandıracağım. Ve evet, makalelerimi VS Code üzerinden nasıl yazdığımı bile göstereceğim!

## Teknik Yığın

Bu blog modern web teknolojileriyle inşa edildi:

- **React 19**: kullanıcı arayüzü için
- **TypeScript**: tipli ve daha güvenilir kod için
- **Vite**: ultra hızlı derleme aracı olarak
- **React Router v7**: sayfalar arası gezinme için
- **react-markdown**: Markdownı HTMLye dönüştürmek için
- **rehype-raw + rehype-sanitize**: Markdown içinde ham HTMLye güvenli şekilde izin vermek için


## Proje Yapısı

Proje ağacı şöyle görünür:

![](assets/how-this-blog-works/project-structure.png)

```
├── .github/
│   └── workflows/
│       └── deploy.yml              ← CI/CD Pipelineı
├── public/
│   ├── home.md                     ← Ana sayfa içeriği
│   ├── portfolio.md                ← Portföy içeriği
│   └── articles/
│       ├── index.json              ← Tüm makalelerin listesi
│       ├── hello-world.md          ← Bir makale
│       ├── how-this-blog-works.md  ← Bu makale!
│       └── assets/                 ← Makalelerin görselleri
├── src/
│   ├── main.tsx                    ← React giriş noktası
│   ├── App.tsx                     ← Ana yönlendirici
│   ├── components/
│   │   ├── Header.tsx              ← Gezinme çubuğu
│   │   └── Footer.tsx              ← Alt bilgi
│   └── pages/
│       ├── Home.tsx                ← Ana sayfa
│       ├── BlogList.tsx            ← Makale listesi
│       ├── Article.tsx             ← Makale okuyucu
│       ├── Portfolio.tsx           ← Portföy sayfası
│       └── NotFound.tsx            ← 404 sayfası
└── vite.config.ts                  ← Vite yapılandırması
```

Merkez fikir basittir: **içerik koddan ayrıdır**. Sayfalar `public/` klasöründe Markdown yazılır ve `src/` içindeki React kodu onları göstermekle ilgilenir. Bu ayrıma önem veriyorum: içeriği yeniden okumayı kolaylaştırır ve kodu geliştirmeyi kolaylaştırır.

## Yönlendirme Sistemi

`App.tsx` dosyası React Router ile uygulamanın tüm rotalarını tanımlar:

![](assets/20260308_153440_image.png)


| Rota          | Sayfa     | Açıklama                                   |
| --------------- | ----------- | -------------------------------------------- |
| `/`           | Home      | Ana sayfa, `home.md` yükler                |
| `/blog`       | BlogList  | Tüm makalelerin listesi                      |
| `/blog/:slug` | Article   | Bir makale, `articles/{slug}.md` yükler    |
| `/portfolio`  | Portfolio | Portföy sayfası, `portfolio.md` yükler     |
| `*`           | NotFound  | Bilinmeyen URLler için 404 sayfası           |

Her sayfanın net bir rolü vardır: bir Markdown dosyası alır, `react-markdown` ile HTMLye dönüştürür ve ekranda gösterir.

## Bir Makale Nasıl Çalışır?

En sevdiğim kısım bu! İşte bir makalenin yaşam döngüsü:

### 1. `index.json` Dosyası

Tüm makaleler `public/articles/index.json` içinde referanslanır. Her girdi makalenin meta verilerini içerir:

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

- **slug**: URLde kullanılan benzersiz tanımlayıcı (`/blog/hello-world`)
- **title**: listede gösterilen başlık
- **description**: kısa bir özet
- **date**: yayın tarihi

### 2. Markdown Dosyası

Makalenin içeriği `public/articles/` içinde basit bir `.md` dosyasıdır. Dosya adı `index.json` içinde tanımlı `slug` ile eşleşir.

![](assets/20260308_153509_image.png)

İstediğini koyabilirsin: başlıklar, listeler, görseller, tablolar ve `rehype-raw` sayesinde ham HTML bile!

### 3. React Tarafında Render

`/blog/hello-world` adresini ziyaret ettiğinde şunlar olur:

1. React Router URLden `slug` parametresini alır
2. `Article.tsx` bileşeni `/articles/hello-world.md` dosyasını yükler
3. Markdown `react-markdown` tarafından HTMLye dönüştürülür
4. `assets/` bağlantıları otomatik olarak `/articles/assets/` yoluna yeniden yazılır
5. Paralel olarak meta veriler tarihi ve açıklamayı göstermek için `index.json` dosyasından yüklenir

Bu kadar basit!

## Ana Sayfa ve Portföy

Ana Sayfa ve Portföy sayfaları tamamen aynı şekilde çalışır: bir Markdown dosyası (`home.md` ya da `portfolio.md`) yükleyip HTML olarak render ederler.

Özellikleri, tüm HTML öğelerinde `class` ve `style` özniteliklerine izin veren özel bir sanitizasyon şeması kullanmalarıdır. Bu, bana doğrudan Markdown içinde stilize HTML yazma izni verir, örneğin görsel galerileri gibi.

## Header ve Footer

Header `position: fixed` ile sayfanın üstüne sabitlenmiştir. Şunları içerir:

- GitHub avatarım (doğrudan `github.com/fox3000foxy.png` adresinden yüklenir)
- Blog başlığı
- Gezinme bağlantıları: Ana Sayfa, Blog, Portföy

Footer minimalisttir: dinamik hesaplanan güncel yılla sadece bir telif hakkı.

## Koyu Tema

Site kalıcı olarak koyu modda kalır. Akşam rahat okuma için bu seçimi bilinçli yaptım: global stillerde `color-scheme: dark` tanımlıdır, siyah arka plan `#000` ve beyaz metin `#fff` ile. Bağlantılar mavidir (`#64b5f6`) ve üzerine gelince yeşil olur (`#81c784`).

## Bir Makaleyi Nasıl Yazıyorum

Pratiğe geçelim! İşte yeni bir makale yazma workflowum:

### Adım 1: Markdown Dosyasını Oluşturmak

VS Code açar ve `public/articles/` içinde yeni bir `.md` dosyası oluştururum:

### Adım 2: İçeriği Yazmak

Makalenin içeriğini doğrudan Markdown yazarım. VS Codeun mükemmel bir yerleşik Markdown önizlemesi vardır:

![](assets/20260308_153613_image.png)

Görseller için onları `public/articles/assets/` içine koyar ve standart Markdown sözdizimiyle referanslarım:

```markdown
![description](assets/my-image.png)
```

`Article.tsx` bileşeni görsellerin doğru görüntülenmesi için `assets/` yolunu otomatik olarak `/articles/assets/` yoluna yeniden yazar.

### Adım 3: Makaleyi index.json içine Kaydetmek

Makale bitince blog listesinde görünmesi için onu `public/articles/index.json` içine eklerim:

![](assets/20260308_153629_image.png)

### Adım 4: Yerelde Test Etmek

Vite geliştirme sunucusunu çalıştırırım:

```bash
pnpm dev
```

Vite milisaniyeler içinde başlar ve makalemi `localhost:5173` üzerinde gerçek zamanlı görebilirim. Bu hız her değişikliği neredeyse anında kontrol etmeme izin verir:

![](assets/20260308_153703_image.png)

### Adım 5: Yayınlamak

Basit bir `git push` yeter! CI/CD pipelineı gerisini otomatik halleder.

## CI/CD Dağıtım Pipelineı

Her `main` pushunda sitenin lint, derleme ve dağıtımını otomatikleştiren eksiksiz bir **GitHub Actions** pipelineı kurdum. Ayrıntılı bakalım.

Workflow `.github/workflows/deploy.yml` içindedir ve iki işe bölünmüştür: **build** ve **deploy**.

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

Pipeline her **push** üzerinde `main` üzerine ve `main` hedefli her **pull request** üzerinde çalışır. PRler birleştirilmeden önce doğrulanır (lint + build) ama yalnızca `main` üzerindeki pushlar dağıtımı tetikler.

### İş 1: Build

Derleme işi `ubuntu-latest` üzerinde döner ve şu adımları izler:

1. **Checkout**: Depoyu tüm tarihçeyle klonlar (`fetch-depth: 0`)
2. **Setup pnpm**: `pnpm/action-setup@v4` ile en güncel pnpm sürümünü kurar
3. **Setup Node.js 20**: Daha hızlı kurulumlar için pnpm önbelleği etkin Node yapılandırır
4. **Install dependencies**: Yeniden üretilebilir derlemeleri garantilemek için `pnpm install --frozen-lockfile` çalıştırır (lockfile değişikliğine izin yok)
5. **Lint**: Derlemeden önce kod kalitesini kontrol etmek için `pnpm run lint` (ESLint) çalıştırır
6. **Build**: Önce TypeScript türlerini kontrol eden (`tsc -b`) sonra her şeyi Vite ile paketleyen `pnpm run build` çalıştırır
7. **Upload artifact**: Dağıtım işi için `dist/` klasörünü derleme artefaktı olarak yükler

Bir adım başarısız olursa (lint, tür ya da derleme hatası) tüm pipeline durur ve hiçbir şey dağıtılmaz. Bu koruma beni üretimde kırık koddan korur ve her pushta ona güvenirim.

### İş 2: Deploy

Dağıtım işi yalnızca şunlarsa çalışır:

- Derleme işi başarılıysa (`needs: build`)
- Olay bir **push** ise (PR değil)
- Dal **main** ise

```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

Sonra şöyle ilerler:

1. **Derleme artefaktını indir**: Derleme işinin ürettiği `dist/` klasörünü alır
2. **GitHub Pagesi yapılandır**: Pages ortamını kurar
3. **Pagese yükle**: `dist/` klasörünü GitHub Pages için hazırlar
4. **Dağıt**: Siteyi `actions/deploy-pages@v4` ile yayınlar

### Tam Tablo

Yazımdan dağıtıma neler olduğu:

```
Écrire l'article dans VS Code
          ↓
    git add & commit
          ↓
        git push
          ↓
    GitHub Actions se déclenche
          ↓
    ┌─────────────────┐
    │   BUILD JOB     │
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
    │  DEPLOY JOB     │
    │  1. Download    │
    │  2. Configure   │
    │  3. Upload      │
    │  4. Deploy 🚀   │
    └─────────────────┘
             ↓
      En ligne sur GitHub Pages !
```

Tüm süreç push ile çevrimiçi olma arasında yaklaşık bir dakika sürer. Basit bir `git push` ile yayınlarım, her şey FTP ya da SSH olmadan otomatik kalır.

## Üretim Derlemesi

Kaputun altında `pnpm build` komutu şunu çalıştırır:

1. `tsc -b`: TypeScript türlerini kontrol eder
2. `vite build`: Tüm kodu paketler ve optimize eder

Vite otomatik kod bölmeli minifiye ve optimize dosyalar üretir. Sonuç ultra hızlı statik bir sitedir.

## Neden Bu Mimari?

Bir CMS, Hugo ya da Jekyll gibi bir statik site üretici, hatta Next.js kullanabilirdim. Ama bu yaklaşımı seçmemin nedenleri:

- **Sadelik**: Markdown yaz, GitHuba pushla, çevrimiçi
- **Tam kontrol**: CMS ya da veritabanı bağımlılığı yok
- **Performans**: Vite + React = hızlı yükleme
- **Esneklik**: Markdown ve HTMLyi istediğim gibi karıştırabilirim
- **Öğrenme**: React ve TypeScriptte ustalaşmak için süper bir proje
- **CI/CD**: GitHub Actions ile otomatik kalite kontrolleri ve dağıtım

## Sonuç

Bu blog basit ama iyi düşünülmüş bir projedir: içerik için Markdown, render için React, performans için Vite, CI/CD için GitHub Actions ve barındırma için GitHub Pages. Verimli sunulan statik dosyalara dayanır, her pushta kaliteyi garantileyen otomatik bir pipeline ile.

Okuduğun için teşekkürler, sonraki makalede görüşmek üzere! 🦊
