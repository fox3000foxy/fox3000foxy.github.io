---
title: "मैंने अति यथार्थवादी Express honeypot बनाया"
description: "तुरंत उत्पन्न उत्तरों वाले 328 नकली endpoint, हेडर spoofing, बॉट ट्रैफिक logging, स्कैनर को फँसाने के लिए डिजाइन किए Express honeypot middleware के हृदय में गोता।"
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
author_sig: "DgqhsWpDHk/Zu+IcCnA5KxE0RoDG7/bt+Q3vaCCApat7w8G/7dF5SkFuXqxXQT0h4esu0Jm3V5yVQgS1Fq2WvQ=="
---

## TL;DR

मैंने एक Express middleware बनाया जो दो रूपों में चुनकर **328 नकली endpoint** उजागर करता है : `default` (संयमित लेकिन विश्वसनीय उत्तर) और `complete` (बहुत विस्तृत उत्तर)। हर उत्तर ताजे timestamp और अनुरोध पहचान के साथ **तुरंत उत्पन्न** होता है, जो हर उत्तर को अद्वितीय बनाता है। डिस्क पर कोई mock फाइल नहीं है। middleware टेक्स्ट फाइल में **ट्रैफिक log** भी कर सकता है और बॉट क्या खोजते हैं इसका विश्लेषण करने के लिए `/newBotsRoute` पर अप्रबंधित route उजागर कर सकता है।

**यह साधारण 404 लौटाने से कहीं ज्यादा है।** मैंने इंजीनियरिंग का यह टुकड़ा असली सर्वर जैसा लगने के लिए डिजाइन किया, ताकि स्कैनर उस पर अपना समय बर्बाद करें। मैं दिखाता हूँ यह कैसे काम करता है।

## समस्या

सुरक्षा बॉट, scraper और दुर्भावनापूर्ण कर्ता सामान्य route खोजने के लिए वेब सर्वर लगातार स्कैन करते हैं :

- `.env`, `wp-config.php`, `admin/`, `phpinfo.php`, आदि।
- `/api/version`, `/api/config` जैसे API endpoint
- कॉन्फ़िगरेशन फाइलें : `dump.sql`, `.git/config`, `docker-compose.yml`
- बैंकिंग phishing पेज : `/lander/sberbank*`, `/index_sber.php`

मैंने अपने सर्वरों पर यह सीमा देखी : 404 या 403 लौटाना स्कैनर को तुरंत बताता है कि route मौजूद नहीं है, इसलिए वह अगले पर जाता है। मैंने इस honeypot के साथ उल्टा चुना : **स्कैनर को मनवाना कि सब मौजूद है**, ताकि वह नकली उत्तरों पर समय खोए जबकि तुम्हारा असली सर्वर तुम्हारे ज्ञात route के पीछे सुरक्षित रहता है।

## आर्किटेक्चर

### 1. वर्गीकरणकर्ता, lookup table नहीं

मुख्य टुकड़ा `src/services/mockupGenerator.ts` में `classify()` फंक्शन है जो endpoint पथ लेता है और उत्तर जनरेटर लौटाता है। मैंने इसे नियमों के झरने की तरह बनाया :

1. **सटीक मिलान** : सबसे आम endpoint के समर्पित जनरेटर हैं
2. **पैटर्न मिलान** : `id_rsa`, `wp-admin`, `sitemap.xml` जैसे पैटर्न पहचानने के लिए पथ पर regex
3. **बुद्धिमान वर्गीकरण** : `/262LBNFp` जैसे पथ (6+ बेतरतीब अक्षर) "C2 हृदय धड़कन" के रूप में वर्गीकृत होते हैं
4. **सब समेट नियम** : API पथ, `.php`, `.html`, `.js`, `.json` और `.asmx` फाइलों के सामान्य जनरेटर हैं
5. **अंतिम catchall** : `genCatchall()` मेटाडेटा के साथ सामान्य JSON उत्तर बनाता है

मुझे यह दृष्टिकोण पसंद है क्योंकि उत्तर हर अनुरोध पर **ताजे रहते हैं** : कोई स्थिर फाइल नहीं, कोई caching नहीं, हर उत्तर अपना timestamp रखता है जैसे वह असली सर्वर से आया हो।

### 2. दोहरी रूप प्रणाली

हर जनरेटर दो रूप समर्थन करता है :

```typescript
type Variant = "default" | "complete";
```

- **`default`** : संक्षिप्त लेकिन विश्वसनीय उत्तर। `.env` के लिए उदाहरण :
  ```
  DB_HOST=localhost
  DB_USER=root
  DB_PASS=s3cur3P@ss
  APP_ENV=development
  APP_DEBUG=true
  ```

- **`complete`** : बहुत विस्तृत उत्तर। `.env` के लिए उदाहरण :
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

`complete` रूप में स्टाइल CSS वाले पूरे HTML पेज भी शामिल हैं : प्रशासन पेज, WordPress login स्क्रीन, रूसी में बैंकिंग phishing पेज, आदि। जब तुम सच में स्कैनर को व्यस्त रखना चाहते हो तो मुझे यह दुर्जेय लगता है।

### 3. तुरंत पीढ़ी

हर कॉल पर अद्वितीय timestamp और अनुरोध पहचान बनाने के लिए मैं `Date.now()` और `Date().toISOString()` इस्तेमाल करता हूँ। यहाँ समृद्धि फंक्शन है :

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

JSON उत्तरों के लिए, middleware इन फ़ील्ड के साथ parse और समृद्ध करने की कोशिश करता है। गैर JSON उत्तर जैसे हैं वैसे लौटाए जाते हैं।

### 4. हेडर spoofing middleware

मैंने समर्पित middleware जोड़ा जो माँगी गई फाइल के एक्सटेंशन के अनुसार यथार्थवादी HTTP हेडर सेट करता है :

```typescript
res.setHeader("Server", "nginx/1.24.0");
res.setHeader("X-Frame-Options", "SAMEORIGIN");
res.setHeader("X-XSS-Protection", "1; mode=block");
res.setHeader("X-Content-Type-Options", "nosniff");
res.setHeader("X-Robots-Tag", "noindex, nofollow");
res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

// फाइल एक्सटेंशन आधारित यथार्थवादी X-Powered-By
if (path.endsWith(".php")) res.setHeader("X-Powered-By", "PHP/8.1.12");
else if (path.endsWith(".jsp")) res.setHeader("X-Powered-By", "JSP/3.0");
else if (path.endsWith(".aspx") || path.endsWith(".ashx") || path.endsWith(".asmx"))
  res.setHeader("X-Powered-By", "ASP.NET");
else if (path.endsWith(".do") || path.endsWith(".action"))
  res.setHeader("X-Powered-By", "Servlet/3.0");
```

यह उत्तरों को कहीं ज्यादा विश्वसनीय बनाता है : `X-Powered-By: PHP/8.1.12` और `Server: nginx/1.24.0` वाला `.php` endpoint बिल्कुल असली WordPress सर्वर जैसा लगता है। मैं इस विवरण पर ध्यान देता हूँ क्योंकि अक्सर हेडर ही नकली सर्वर को धोखा देता है।

### 5. PHP Spoofer

`phpSpoofer` मेरा पसंदीदा घटक है। अगर किसी `.php` फाइल के लिए अनुरोध आता है और host localhost है, तो middleware अनुरोध को तुम्हारे स्थानीय PHP सर्वर की ओर **proxy** करता है, जो असली PHP पेज प्रोसेस और लौटाता है। अगर host दूरस्थ है, तो वह किसी भी SSRF प्रयास को रोकने के लिए 404 लौटाता है।

```typescript
const phpSpoofer = async (req, res, next) => {
  if (!req.path?.match(/\.php$/)) return next();
  const host = req.headers?.host;
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]")) {
    const baseUrl = req.originalUrl.replace(/\.php.*$/, "");
    const response = await fetch(`http://${host}${baseUrl}`);
    // असली PHP उत्तर लौटाता है
  } else {
    res.status(404).send("404 Not Found");
  }
};
```

यह अनुमति देता है, जब तुम WordPress स्थानीय चलाते हो, कि honeypot बॉट को **असली** WordPress पेज परोसे : मेरे अनुभव के अनुसार अधिकतम यथार्थवाद।

### 6. ट्रैफिक logging और विश्लेषण

मैंने दो जिम्मेदारियाँ अलग कीं : `TrafficService` हर अनुरोध JSON-lines फाइल में log करता है। `UnhandledRoutesService` फिर इन log का विश्लेषण करता है ताकि बॉट द्वारा माँगे गए पथ पहचाने जो honeypot में कवर करने बाकी हैं।

```typescript
app.get("/newBotsRoute", async (_req, res) => {
  const routes = await unhandledRoutesService.getUnhandledRoutes(
    additionalEndpoints, knownPathOptions
  );
  res.setHeader("Content-Type", "text/plain");
  res.send(routes.join("\n"));
});
```

मुझे यह प्रतिपुष्टि लूप पसंद है : जितना तुम honeypot चलाते हो, उतना सीखते हो कि बॉट क्या खोजते हैं, और तुम इन पथों को अपने ज्ञात endpoint में जोड़ सकते हो।

### 7. ज्ञात endpoint और बहिष्करण

middleware `knownPaths`, `knownPatterns`, `knownApiPaths` और `knownApiPatterns` सूचियाँ स्वीकार करता है। इनसे मेल खाने वाली हर route तुम्हारी असली application की ओर middleware पार करती है। मुझे यह फ़िल्टर अपरिहार्य लगता है : तुम्हारे असली endpoint अक्षुण्ण रहते हैं, honeypot उन्हें कभी रोकता नहीं।

```typescript
const matches = (p) => p === endpoint || p.startsWith(endpoint + "/");
```

## 328 endpoint विस्तार में

वे कैसे वर्गीकृत हैं (वर्गीकरणकर्ता से अंश) :

| श्रेणी | endpoint उदाहरण |
|---|---|
| क्रेडेंशियल लीक | `.env`, `secrets.json`, `aws/credentials`, `etc/shadow` |
| SSH कुंजियाँ | `.ssh/id_rsa`, `.ssh/id_ed25519` |
| डेटाबेस कॉन्फ़िग | `config/database`, `wp-config.php`, `docker-compose.yml` |
| प्रशासन पैनल | `/admin`, `/wp-admin`, `/manage/account/login` |
| API उत्तर | `/api/version`, `/api/config`, `.do`, `.ashx` |
| बैंकिंग phishing | `/lander/sber*`, `/index_sber.php` |
| C2 हृदय धड़कन | 6+ अक्षरों के बेतरतीब पथ (`/262LBNFp`) |
| क्रिया/बाजार | `/stock/mzhishu`, `/kline/1m/1`, `/m/allticker/1` |
| गेम/कैसीनो | `/proxy/games`, `/Ctrls/GetSysCoin`, `/room/getRoomBangFans` |
| कॉन्फ़िगरेशन फाइलें | `config.json`, `config.yml`, `sitemap.xml`, `ads.txt` |
| लैंडिंग पेज | `/about`, `/contact`, `/products`, `/blog` |

## विशेष कोड और endpoint

मैंने विशेष मामलों के लिए विशिष्ट जनरेटर जोड़े :

- **`genLanding()`** : СберБанк, Тинькофф, Газпромбанк के लिए रूसी में बैंकिंग phishing पेज
- **`genC2Heartbeat()`** : `agent_id`, `group`, `version` के साथ यथार्थवादी C2 हृदय धड़कन उत्तर
- **`genScannerPath()`** : विशिष्ट स्कैनर के लिए जाल (nmap NICE पोर्ट, Hazelcast, CGI)
- **`genChineseApi()`** : `msg: "成功"` (सफलता) के साथ चीनी API उत्तर
- **`genMerchant()`** : `balance`, `fee_rate`, `tier` के साथ व्यापारी प्रोफाइल

## इसे कैसे इस्तेमाल करें

### स्थापना

```bash
npm install express-middleware-honeypot
```

### स्व पंजीकरण के साथ बुनियादी उपयोग

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

### app.use() के साथ (एकल catchall middleware)

```javascript
const { createHoneypot } = require("express-middleware-honeypot");
const app = express();

// तुम्हारी असली route पहले
app.get("/", (req, res) => res.send("Home"));

// फिर catchall honeypot
const instance = createHoneypot({ /* विकल्प */ });
app.use(instance.headersMiddleware);
app.use(instance.middleware);
```

### पूर्ण बनाम डिफ़ॉल्ट उत्तर

```javascript
// पूरे HTML पेज के साथ विस्तृत उत्तर
const instance = createHoneypot({ isCompleteResponses: true });
```

### ट्रैफिक logging

```javascript
const instance = createHoneypot({ logTraffic: true });
// बॉट क्या माँगते हैं यह देखने के लिए traffic.txt फाइल देखो
```

## निष्कर्ष

यह Express honeypot middleware साधारण चारे से कहीं आगे जाता है। **328 endpoint**, **तुरंत पीढ़ी**, **गतिशील हेडर spoofing**, **ट्रैफिक logging** और असली WordPress उत्तरों के लिए **PHP proxy** तक के साथ, मैंने इसे यथासंभव यथार्थवादी रहने के लिए डिजाइन किया।

स्कैनर नकली प्रशासन पेज, विश्वसनीय `.env` फाइलों और बैंकिंग phishing पेजों पर समय खोते हैं जबकि तुम्हारी असली application सुरक्षित रहती है। मुझे विशेष रूप से दोहरी रूप प्रणाली और बुद्धिमान वर्गीकरण पसंद है : हर उत्तर ताजा रहता है और माँगे गए पथ के अनुकूल होता है।

स्रोत कोड GitHub पर उपलब्ध है : [https://github.com/fox3000foxy/express-honeypot-middleware](https://github.com/fox3000foxy/express-honeypot-middleware)
