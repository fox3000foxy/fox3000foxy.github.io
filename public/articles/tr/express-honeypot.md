---
title: "Gerçeküstü bir Express honeypot'u inşa ettim"
description: "Anında oluşturulan yanıtlar, başlık sahteciliği, bot trafiği kaydı ile 328 sahte uç nokta -- tarayıcıları kandırmak için tasarlanmış bir Express honeypot middleware'inin koduna derinlemesine bir dalış."
date: "2026-06-10"
aiGenerated: true
authors:
  - fox3000foxy
tags:
  - express
  - nodejs
  - security
  - honeypot
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "050qAeb6uWcYRN/AmRI0j5YX107DrDI21GsOqo0kqwqRQqS4INoHZZJ2J4utXPDOqsjKh7EjRYGm3zxsjBhIkQ=="
---

## Fikir

Botlar ve otomatik tarayıcılar, güvenlik açıkları bulmak için web uygulamalarını sürekli tarar. `.env` dosyaları, yönetici panelleri, veritabanı yedekleri, SSH kimlik bilgileri -- istismar edilebilecek her şeyi ararlar.

Sadece 404 döndürmek yerine daha ilginç bir şey yapmak istedim: saldırganların savunmasız bir hedef bulduklarına inanmalarını sağlayacak **inandırıcı içerikle yanıt veren bir Express honeypot'u**.

## Özellikler

Bu middleware, iki varyanta (varsayılan ve tam) ayrılmış **328 uç nokta** sunar. Her istek, gerçek bir sunucuyu taklit eden, taze zaman damgaları ve istek kimlikleriyle anında oluşturulmuş benzersiz bir yanıt alır.

## Başlarken

```bash
npm install express-middleware-honeypot
```

Otomatik kayıt ile temel kullanım:

```js
const express = require("express");
const { createHoneypot } = require("express-middleware-honeypot");

const app = express();

const instance = createHoneypot({
    knownPaths: ["/", "/login", "/support"],
    knownPatterns: [/^\/blogs\/[^/]+$/],
    knownApiPaths: ["/api/cart", "/api/cart/list"],
    knownApiPatterns: [/^\/api\/cart\/[^/]+$/],
    logTraffic: true,
    is404Handler: true,
    isCompleteResponses: false,
});

instance.register(app);

app.listen(3000, () => {
    console.log("Sunucu 3000 portunda çalışıyor");
});
```

## Nasıl çalışır

### Anında oluşturma

Diskte sahte dosya yok. `mockupGenerator.ts` servisi, her yanıtı istek anında şunlarla oluşturur:

- Benzersiz zaman damgası ve istek kimliği
- Uç noktaya göre özelleştirilmiş içerik (kimlik bilgileri, yapılandırmalar, giriş sayfaları, API yanıtları)
- Dinamik `X-Powered-By` sahteciliği ile gerçekçi HTTP başlıkları

### Başlık sahteciliği

`headersMiddleware`, yol uzantısına göre dinamik olarak `X-Powered-By` başlığını seçer:

- `.php` → `X-Powered-By: PHP/8.1.12`
- `.jsp` → `X-Powered-By: JSP/3.0`
- `.aspx/.ashx/.asmx` → `X-Powered-By: ASP.NET`
- `.do/.action` → `X-Powered-By: Servlet/3.0`
- Diğer yollar → `X-Powered-By` başlığı yok

### 328 uç nokta

| Tür | Örnek uç noktalar |
|---|---|
| Kimlik bilgisi sızıntıları | `.env`, `secrets.json`, `aws/credentials`, `etc/shadow` |
| SSH anahtarları | `.ssh/id_rsa`, `.ssh/id_ed25519` |
| Veritabanı yapılandırmaları | `config/database`, `wp-config.php`, `docker-compose.yml` |
| Yönetici panelleri | `/admin`, `/wp-admin`, `/manage/account/login` |
| API yanıtları | `/api/version`, `/api/config`, `.do`, `.ashx` |
| Bankacılık phishing | `/lander/sber*`, `/index_sber.php` |
| C2 kalp atışları | 6+ karakterli rastgele yollar (`/262LBNFp`, `/Kd67Fq1x`) |
| Hisse senedi/Kripto | `/stock/mzhishu`, `/kline/1m/1`, `/m/allticker/1` |
| Kumar/Oyun | `/proxy/games`, `/Ctrls/GetSysCoin`, `/room/getRoomBangFans` |
| Yapılandırma dosyaları | `config.json`, `config.yml`, `sitemap.xml`, `ads.txt` |
| Açılış sayfaları | `/about`, `/contact`, `/products`, `/blog` |

### PHP sahteciliği

`instance.phpSpoofer`, `*.php` isteklerini yakalar ve bunları yerel geliştirme sunucunuza proxy'leyerek statik sahte yanıt yerine gerçek PHP işlenmiş çıktısını döndürür.

### Trafik kaydı

Trafik, JSON-lines formatında `traffic.txt` dosyasına kaydedilebilir. İşlenmemiş bilinmeyen yollar, `GET /newBotsRoute` aracılığıyla çıkarılabilir.

## HoneypotInstance API

```ts
interface HoneypotInstance {
  mocks: Record<string, Middleware>;
  middleware: Middleware;
  headersMiddleware: Middleware;
  phpSpoofer: Middleware;
  notFoundHandler: Middleware;
  register(app: RouteApp): void;
  getUnhandledRoutes(): Promise<string[]>;
  getNotCoveredEndpoints(): string[];
}
```

## Neden etkili

Otomatik tarayıcılar, savunmasız sitelerin belirli dosyalara sahip olmasını bekler. 404 yerine gerçek içerikle yanıt vererek honeypot şunları yapabilir:

1. Saldırganların sahte sonuçları analiz ederek **zaman kaybetmesini sağlar**
2. Daha sonra analiz için **parmak izlerini kaydeder**
3. Gerçek güvenlik açıklarından **dikkati dağıtır**
4. İşlenmemiş yollar aracılığıyla **yeni saldırı modellerini ortaya çıkarır**

## Sonuç

Tam kaynak kodu GitHub'da [github.com/anomalyco/express-honeypot-middleware](https://github.com/anomalyco/express-honeypot-middleware) adresinde mevcuttur. Denemekten, issue açmaktan veya katkıda bulunmaktan çekinmeyin.
