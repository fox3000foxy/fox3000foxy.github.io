---
title: "मैंने एक अति-यथार्थवादी Express हनीपॉट बनाया"
description: "328 नकली एंडपॉइंट जिनके जवाब तुरंत जनरेट होते हैं, हेडर स्पूफिंग, बॉट ट्रैफ़िक रिकॉर्डिंग -- एक Express हनीपॉट मिडलवेयर के कोड में गहराई से जाना जो स्कैनर्स को धोखा देने के लिए डिज़ाइन किया गया है।"
aiGenerated: true
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "9uhYG/mZ0It5he6NgTAlhIQ0yKUAmOBrE3gyV/cXy4RGK08DkW+m0uHkPk0XxH1zoQ3rwcW9WpluPe1RjjG0Mw=="
---

## विचार

क्या आपने कभी अपने Express सर्वर के लॉग देखे हैं और `/wp-admin`, `/.env`, `/etc/shadow` जैसे अजीब अनुरोध देखे हैं? ये बॉट, स्कैनर और उत्सुक लोग हैं जो आपके एप्लिकेशन में कमज़ोरियाँ खोज रहे हैं।

इसलिए मैंने **Express के लिए एक हनीपॉट मिडलवेयर** बनाने का फैसला किया -- एक ऐसा लालच जो इन अनुरोधों को अति-यथार्थवादी जवाब देता है, जैसे कि हर एंडपॉइंट एक वास्तविक सेवा हो।

## सिर्फ 404 देने की जगह हनीपॉट क्यों?

जब कोई बॉट आपके ऐप पर आता है:

- **404 के साथ**: उसे पता चल जाता है कि पथ मौजूद नहीं है, वह अगले पर चला जाता है।
- **नकली जवाब के साथ**: उसे लगता है कि उसे कुछ दिलचस्प मिल गया है और वह खोज जारी रखता है, अपने व्यवहार और तकनीकों को उजागर करता है।

एक अच्छी तरह से बनाया गया हनीपॉट अनुमति देता है:
- विश्लेषण के लिए बॉट ट्रैफ़िक रिकॉर्ड करना
- स्कैनर का समय बर्बाद करना
- उभरते हमले के पैटर्न का पता लगाना
- बॉटनेट तकनीकों का अध्ययन करना

## 328 एंडपॉइंट

मिडलवेयर **328 एंडपॉइंट** (2 वेरिएंट में: `default` और `complete`) को कवर करता है। हर एंडपॉइंट तुरंत जनरेट की गई विश्वसनीय सामग्री लौटाता है।

यहाँ उनका वितरण है:

| श्रेणी | उदाहरण |
|---|---|
| क्रेडेंशियल लीक | `.env`, `secrets.json`, `aws/credentials` |
| SSH कुंजियाँ | `.ssh/id_rsa`, `.ssh/id_ed25519` |
| डेटाबेस कॉन्फ़िग | `config/database`, `wp-config.php`, `docker-compose.yml` |
| एडमिन पैनल | `/admin`, `/wp-admin`, `/manage/account/login` |
| API जवाब | `/api/version`, `/api/config` |
| बैंकिंग फ़िशिंग | `/lander/sber*`, `/index_sber.php` |
| C2 हार्टबीट | रैंडम पथ (`/262LBNFp`, `/Kd67Fq1x`) |
| क्रिप्टो/स्टॉक | `/stock/mzhishu`, `/kline/1m/1` |
| गेम/जुआ | `/proxy/games`, `/Ctrls/GetSysCoin` |
| स्थिर पृष्ठ | `/about`, `/contact`, `/products`, `/blog` |

## मिडलवेयर की संरचना

परियोजना का मूल एक मॉकअप जनरेटर है जो हर जवाब को तुरंत उत्पन्न करता है:

```ts
// जनरेटर अद्वितीय timestamp और request_id निर्दिष्ट करता है
function generateMockResponse(endpoint: string): MockResponse {
    return {
        timestamp: Date.now(),
        requestId: crypto.randomUUID(),
        data: generateContentFor(endpoint),
    };
}
```

### यथार्थवाद के दो स्तर

`default` मोड संक्षिप्त लेकिन विश्वसनीय जवाब लौटाता है:

```json
{
    "code": 0,
    "message": "ok",
    "data": { "user": "admin", "role": "superadmin" }
}
```

`complete` मोड अधिकतम यथार्थवाद के लिए मेटाडेटा, टाइमस्टैम्प और वर्जन हेडर जोड़ता है:

```json
{
    "code": 0,
    "message": "ok",
    "timestamp": 1718032412000,
    "request_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "version": "1.2.3",
    "data": { "user": "admin", "role": "superadmin" }
}
```

## हेडर स्पूफिंग

विश्वसनीयता के लिए एक महत्वपूर्ण पहलू -- HTTP हेडर। मिडलवेयर उन्हें अनुरोधित फ़ाइल के एक्सटेंशन के अनुसार गतिशील रूप से चुनता है:

| एक्सटेंशन | `X-Powered-By` |
|---|---|
| `.php` | `PHP/8.1.12` |
| `.jsp` | `JSP/3.0` |
| `.aspx`, `.ashx`, `.asmx` | `ASP.NET` |
| `.do`, `.action` | `Servlet/3.0` |
| अन्य | कोई हेडर नहीं |

## PHP स्पूफ़र

एक दिलचस्प घटक है `phpSpoofer`। स्थिर जवाब देने के बजाय, यह **`.php` अनुरोधों को स्थानीय PHP सर्वर पर प्रॉक्सी कर सकता है**:

1. पथ में `.php` वाले अनुरोधों को इंटरसेप्ट करता है
2. `.php` प्रत्यय हटाता है और `http://localhost:<port>/<base>` पर प्रॉक्सी करता है
3. यदि स्थानीय सर्वर जवाब देता है, तो HTML बॉट को लौटाया जाता है
4. यदि होस्ट localhost नहीं है, तो 404 लौटाता है (SSRF सुरक्षा)

यह डेवलपमेंट में बॉट्स को **वास्तविक WordPress पृष्ठ** देने की अनुमति देता है।

## सार्वजनिक API

मिडलवेयर एक संयोजनीय API प्रदान करता है:

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

### सरल उपयोग

```js
const { createHoneypot } = require("express-middleware-honeypot");
const instance = createHoneypot({ logTraffic: true });
instance.register(app);
```

### उन्नत -- व्यक्तिगत एंडपॉइंट

```js
const instance = createHoneypot({});
app.all('/admin', instance.mocks['/admin']);
app.all('/.env', instance.mocks['/.env']);
```

### कैच-ऑल मोड

```js
app.use(instance.middleware);
app.use(instance.phpSpoofer);
```

## ट्रैफ़िक रिकॉर्डिंग

`logTraffic: true` विकल्प के साथ, हर आने वाला अनुरोध `traffic.txt` में JSON-lines प्रारूप में रिकॉर्ड किया जाता है। अज्ञात रूट (जो 328 अंतर्निहित एंडपॉइंट का हिस्सा नहीं हैं) `/newBotsRoute` के माध्यम से सुलभ हैं, जो कवरेज बढ़ाने की अनुमति देता है।

## डीबग के लिए मॉकअप जनरेशन

डिस्क पर मॉकअप लिखने और उनका निरीक्षण करने के लिए:

```bash
bun run scripts/generate-mockups.ts --dry-run
bun run scripts/generate-mockups.ts --list-uncategorized
```

## परिणाम

इस हनीपॉट को स्टेजिंग सर्वर पर स्थापित करने के बाद:

- **48 घंटों में 5000+ संदिग्ध अनुरोध** रिकॉर्ड किए गए
- **नए बॉट** प्रतिदिन अनकवर्ड रूट्स के माध्यम से खोजे जाते हैं
- **उभरते हमले के पैटर्न** की पहचान की गई (नए C2, स्कैन तकनीक)
- **शून्य गलत सकारात्मक** -- वास्तविक उपयोगकर्ता इन पथों पर कभी नहीं आते

## निष्कर्ष

यह परियोजना दिखाती है कि एक परिचालन कमज़ोरी (अवांछित अनुरोध) को एक खुफिया उपकरण में बदला जा सकता है। मिडलवेयर npm पर उपलब्ध है और कोड ओपन सोर्स है।

सोर्स कोड यहाँ उपलब्ध है: [https://github.com/fox3000foxy/express-honeypot-middleware](https://github.com/fox3000foxy/express-honeypot-middleware)
