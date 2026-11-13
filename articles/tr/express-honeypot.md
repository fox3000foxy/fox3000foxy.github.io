---
title: "Ultra gerçekçi bir Express honeypot inşa ettim"
description: "Anında üretilmiş yanıtlarla 328 sahte endpoint, başlık sahteciliği, bot trafiği kaydı, tarayıcıları oltaya düşürmek için tasarlanmış bir Express honeypot middlewareinin kalbine dalış."
date: 2026-06-10
aiGenerated: true
tags:
  - express
  - nodejs
  - security
  - honeypot
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "LMrHTeZRl8nbXYqY0BMNjRVaLaRprM2+dMrudaRnfO+DWIKcmUCz9Fn3jewpU7ptKDv5ZuBiUsGqxPoQzeC4fw=="
---

## TL;DR

İki varyanttan birini seçen **328 sahte endpoint** sunan bir Express middlewarei oluşturdum: `default` (sade ama inandırıcı yanıtlar) ve `complete` (çok ayrıntılı yanıtlar). Her yanıt taze zaman damgaları ve istek kimlikleriyle **anında üretilir**, bu da her yanıtı benzersiz kılar. Diskte hiç mock dosyası yok. Middleware ayrıca trafiği bir metin dosyasına **kaydedebilir** ve botların ne aradığını analiz etmek için yönetilmeyen rotaları `/newBotsRoute` üzerinde sunabilir.

**Bu basit bir 404 döndürmeden çok daha fazlası.** Bu mühendislik parçasını tarayıcıların zamanını üzerinde harcayacağı gerçek bir sunucuya benzemesi için tasarladım. Nasıl çalıştığını gösteriyorum.

## Sorun

Güvenlik botları, kazıyıcılar ve kötü niyetli aktörler yaygın rotalar için web sunucularını sürekli tarar:

- `.env`, `wp-config.php`, `admin/`, `phpinfo.php` vs.
- `/api/version`, `/api/config` gibi API endpointleri
- yapılandırma dosyaları: `dump.sql`, `.git/config`, `docker-compose.yml`
- banka oltalama sayfaları: `/lander/sberbank*`, `/index_sber.php`

Bu sınırı kendi sunucularımda gördüm: 404 ya da 403 döndürmek tarayıcıya rotanın var olmadığını hemen söyler, o da sonrakine geçer. Bu honeypot ile tersini seçtim: **tarayıcıyı her şeyin var olduğuna inandırmak**, gerçek sunucun bilinen rotalarının arkasında korunurken onun zamanını sahte yanıtlar üzerinde kaybettirmek.

## Mimari

### 1. Bir arama tablosu değil, bir sınıflandırıcı

Merkez parça, bir endpoint yolunu alıp yanıt üretici döndüren `src/services/mockupGenerator.ts` içindeki bir `classify()` fonksiyonu. Onu bir kural basamağı olarak inşa ettim:

1. **Tam eşleşmeler**: en yaygın endpointlerin adanmış üreticileri var
2. **Desen eşleşmeleri**: `id_rsa`, `wp-admin`, `sitemap.xml` gibi desenleri tespit etmek için yol üzerinde regex
3. **Akıllı sınıflandırma**: `/262LBNFp` (6+ rastgele karakter) gibi yollar "C2 kalp atışı" olarak sınıflandırılır
4. **Her şeyi yakalayan kurallar**: API yolları, `.php`, `.html`, `.js`, `.json` ve `.asmx` dosyalarının genel üreticileri var
5. **Final yakalama**: `genCatchall()` meta verili genel bir JSON yanıtı üretir

Bu yaklaşımı seviyorum çünkü yanıtlar her istekte **taze** kalır: statik dosya yok, önbellek yok, her yanıt gerçek bir sunucudan gelmiş gibi kendi zaman damgasını taşır.

### 2. Çift varyant sistemi

Her üretici iki varyantı destekler:

```typescript
type Variant = "default" | "complete";
```

- **`default`**: özlü ama inandırıcı yanıtlar. `.env` için örnek:
  ```
  DB_HOST=localhost
  DB_USER=root
  DB_PASS=s3cur3P@ss
  APP_ENV=development
  APP_DEBUG=true
  ```

- **`complete`**: çok ayrıntılı yanıtlar. `.env` için örnek:
  ```
  # Database
  DB_CONNECTION=mysql
  DB_HOST=db-master-01.internal.example.com
  DB_PORT=3306
  DB_DATABASE=production_app_v2
  DB_USER=admin_service
  DB_PASS=mM9k#2$xL!qR7pZ

  # Redis
  REDIS_HOST=redis-cluster-01.internal.example.com
  REDIS_PORT=6379
  REDIS_PASSWORD=R3d!s_S3cur3_K3y_2025

  # App
  APP_ENV=production
  APP_DEBUG=false
  APP_URL=https://admin.internal.example.com
  APP_KEY=base64:qJ3fR8mL2pX5vB7nC4kA9wE1yH6sD0tG
  ...
  ```

`complete` varyantı ayrıca stilli CSSli tam HTML sayfaları içerir: yönetim sayfaları, WordPress giriş ekranları, Rusça banka oltalama sayfaları vs. Bir tarayıcıyı gerçekten oyalamak istediğinde müthiş buluyorum.

### 3. Anında üretim

Her çağrıda benzersiz zaman damgaları ve istek kimlikleri üretmek için `Date.now()` ve `Date().toISOString()` kullanıyorum. İşte zenginleştirme fonksiyonu:

```typescript
function enrichResponse(response: Record<string, unknown>): Record<string, unknown> {
  return {
    ...response,
    timestamp: getTimestamp(),
    version: "1.0",
    lastUpdated: getTimestamp(),
  };
}
```

JSON yanıtları için middleware ayrıştırıp bu alanlarla zenginleştirmeye çalışır. JSON olmayan yanıtlar olduğu gibi döndürülür.

### 4. Başlık sahteciliği middlewarei

İstenen dosyanın uzantısına göre gerçekçi HTTP başlıkları ayarlayan adanmış bir middleware ekledim:

```typescript
res.setHeader("Server", "nginx/1.24.0");
res.setHeader("X-Frame-Options", "SAMEORIGIN");
res.setHeader("X-XSS-Protection", "1; mode=block");
res.setHeader("X-Content-Type-Options", "nosniff");
res.setHeader("X-Robots-Tag", "noindex, nofollow");
res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

// dosya uzantısına dayalı gerçekçi X-Powered-By
if (path.endsWith(".php")) res.setHeader("X-Powered-By", "PHP/8.1.12");
else if (path.endsWith(".jsp")) res.setHeader("X-Powered-By", "JSP/3.0");
else if (path.endsWith(".aspx") || path.endsWith(".ashx") || path.endsWith(".asmx"))
  res.setHeader("X-Powered-By", "ASP.NET");
else if (path.endsWith(".do") || path.endsWith(".action"))
  res.setHeader("X-Powered-By", "Servlet/3.0");
```

Bu yanıtları çok daha inandırıcı kılar: `X-Powered-By: PHP/8.1.12` ve `Server: nginx/1.24.0` başlıklı bir `.php` endpointi tam olarak gerçek bir WordPress sunucusuna benzer. Bu detaya önem veriyorum çünkü sahte bir sunucuyu ele veren genelde başlıktır.

### 5. PHP Sahtekârı

`phpSpoofer` favori bileşenim olmaya devam ediyor. Bir `.php` dosyası için istek gelir ve host localhost ise middleware isteği yerel PHP sunucuna **vekiller**, o da gerçek bir PHP sayfası işleyip döndürür. Host uzaksa SSRF girişimlerini engellemek için 404 döndürür.

```typescript
const phpSpoofer = async (req, res, next) => {
  if (!req.path?.match(/\.php$/)) return next();
  const host = req.headers?.host;
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]")) {
    const baseUrl = req.originalUrl.replace(/\.php.*$/, "");
    const response = await fetch(`http://${host}${baseUrl}`);
    // gerçek PHP yanıtını döndür
  } else {
    res.status(404).send("404 Not Found");
  }
};
```

Bu, WordPressi yerelde çalıştırdığında honeypotun botlara **gerçek** WordPress sayfaları sunmasını sağlar: deneyimime göre maksimum gerçekçilik.

### 6. Trafik kaydı ve analizi

İki sorumluluğu ayırdım: `TrafficService` her isteği JSON-lines dosyasına kaydeder. `UnhandledRoutesService` sonra bu logları analiz edip honeypotta kapsanması gereken, botların istediği yolları belirler.

```typescript
app.get("/newBotsRoute", async (_req, res) => {
  const routes = await unhandledRoutesService.getUnhandledRoutes(
    additionalEndpoints, knownPathOptions
  );
  res.setHeader("Content-Type", "text/plain");
  res.send(routes.join("\n"));
});
```

Bu geri bildirim döngüsüne bayılıyorum: honeypotu ne kadar uzun çalıştırırsan botların ne aradığını o kadar öğrenirsin ve bu yolları bilinen endpointlerine ekleyebilirsin.

### 7. Bilinen endpointler ve hariç tutma

Middleware `knownPaths`, `knownPatterns`, `knownApiPaths` ve `knownApiPatterns` listelerini kabul eder. Bunlarla eşleşen her rota middlewarei geçip gerçek uygulamana ulaşır. Bu filtreyi vazgeçilmez buluyorum: gerçek endpointlerin bozulmadan kalır, honeypot onları asla yakalamaz.

```typescript
const matches = (p) => p === endpoint || p.startsWith(endpoint + "/");
```

## 328 endpoint ayrıntılı

Sınıflandırmaları şöyle (sınıflandırıcıdan alıntı):

| Kategori | Örnek endpointler |
|---|---|
| Kimlik bilgisi sızıntıları | `.env`, `secrets.json`, `aws/credentials`, `etc/shadow` |
| SSH anahtarları | `.ssh/id_rsa`, `.ssh/id_ed25519` |
| Veritabanı yapılandırmaları | `config/database`, `wp-config.php`, `docker-compose.yml` |
| Yönetim panelleri | `/admin`, `/wp-admin`, `/manage/account/login` |
| API yanıtları | `/api/version`, `/api/config`, `.do`, `.ashx` |
| Banka oltalama | `/lander/sber*`, `/index_sber.php` |
| C2 kalp atışları | 6+ karakterli rastgele yollar (`/262LBNFp`) |
| Hisse/Borsa | `/stock/mzhishu`, `/kline/1m/1`, `/m/allticker/1` |
| Oyun/Kumarhane | `/proxy/games`, `/Ctrls/GetSysCoin`, `/room/getRoomBangFans` |
| Yapılandırma dosyaları | `config.json`, `config.yml`, `sitemap.xml`, `ads.txt` |
| Açılış sayfaları | `/about`, `/contact`, `/products`, `/blog` |

## Özel kodlar ve endpointler

Özel durumlar için uzmanlaşmış üreticiler ekledim:

- **`genLanding()`**: СберБанк, Тинькофф, Газпромбанк için Rusça banka oltalama sayfaları
- **`genC2Heartbeat()`**: `agent_id`, `group`, `version` ile gerçekçi C2 kalp atışı yanıtı
- **`genScannerPath()`**: belirli tarayıcılar için tuzaklar (nmap NICE portları, Hazelcast, CGI)
- **`genChineseApi()`**: `msg: "成功"` (başarı) ile Çince API yanıtları
- **`genMerchant()`**: `balance`, `fee_rate`, `tier` ile satıcı profilleri

## Nasıl kullanılır

### Kurulum

```bash
npm install express-middleware-honeypot
```

### Otomatik kayıtlı temel kullanım

```javascript
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
app.listen(3000);
```

### app.use() ile (tek her şeyi yakalayan middleware)

```javascript
const { createHoneypot } = require("express-middleware-honeypot");
const app = express();

// Önce gerçek rotaların

app.get("/", (req, res) => res.send("Home"));

// Sonra her şeyi yakalayan honeypot
const instance = createHoneypot({ /* seçenekler */ });
app.use(instance.headersMiddleware);
app.use(instance.middleware);
```

### Tam yanıtlar ve varsayılan

```javascript
// Tam HTML sayfalarıyla ayrıntılı yanıtlar
const instance = createHoneypot({ isCompleteResponses: true });
```

### Trafik kaydı

```javascript
const instance = createHoneypot({ logTraffic: true });
// botların ne istediğini görmek için traffic.txt dosyasına bak
```

## Sonuç

Bu Express honeypot middlewarei basit bir yemden çok öteye gider. **328 endpoint**, **anında üretim**, **dinamik başlık sahteciliği**, **trafik kaydı** ve gerçek WordPress yanıtları için bir **PHP vekili** bile ile onu olabildiğince gerçekçi kalacak şekilde tasarladım.

Tarayıcılar sahte yönetim sayfalarında, inandırıcı `.env` dosyalarında ve banka oltalama sayfalarında zaman kaybederken gerçek uygulaman korunur. Çift varyant sistemini ve akıllı sınıflandırmayı özellikle seviyorum: her yanıt taze kalır ve istenen yola uyarlanır.

Kaynak kodu GitHubda mevcut: [https://github.com/fox3000foxy/express-honeypot-middleware](https://github.com/fox3000foxy/express-honeypot-middleware)
