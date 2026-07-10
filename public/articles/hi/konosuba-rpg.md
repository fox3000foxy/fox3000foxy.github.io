---
title: "मैंने एक सप्ताहांत konosuba-rpg का कोड पढ़ा और यहाँ बताया कि मुझे क्या मिला"
description: "एक Discord टर्न-बेस्ड RPG जहाँ हर क्रिया तुरंत एक WebP इमेज जनरेट करती है:
  URL गेम स्टेट के रूप में, डिटरमिनिस्टिक RNG, WASM पाइपलाइन, 5-लेवल कैश,
  सर्वरलेस बॉट।"
date: 2026-06-10
tags:
  - discord
  - rpg
  - typescript
  - hono
  - cloudflare-workers
  - supabase
  - wasm
  - gaming
  - serverless
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA=="
author_sig: "MEUCIQCLNJgOt5naEQJTBbFlx8QViswxkxnVK3sIE2fTc3sleAIgaMJ7xlar697M6KIkXryeZ1uaXqrrfS4m6lfWSMldAKE="
---

# मैंने एक सप्ताहांत konosuba-rpg का कोड पढ़ा और यहाँ बताया कि मुझे क्या मिला

मैं इस प्रोजेक्ट को कुछ समय से मेंटेन कर रहा हूँ, लेकिन अपने कोड को शांति से दोबारा पढ़ना हमेशा शिक्षाप्रद होता है। konosuba-rpg एक Discord टर्न-बेस्ड RPG है जहाँ हर क्रिया तुरंत एक WebP इमेज जनरेट करती है। कोई टेक्स्ट एम्बेड नहीं। एक वास्तविक इमेज जो स्प्राइट्स, हेल्थ बार, कॉम्बैट मैसेज — सब कुछ से बनी होती है।

स्टैक: TypeScript, Hono, Vercel, Cloudflare Workers, Supabase। पूरी तरह से मुफ्त होस्टिंग। और Discord बॉट बिना किसी स्थायी सर्वर के चलता है। यह पोस्ट बताता है कि यह सब एक साथ कैसे काम करता है।

![État initial du jeu](/images/konosuba-rpg/game_init.webp)

---

## बेसिक डिज़ाइन: URL गेम स्टेट के रूप में

पहली चीज़ जो ध्यान खींचती है: गेमप्ले के लिए सर्वर साइड पर कोई स्टेट नहीं है। एक पूरे मुकाबले की स्थिति URL में समाई होती है।

```
/konosuba-rpg/fr/abc123/ATK/DEF/ATK/HUG?monster=Vanir&difficulty=hard
```

सीड के बाद प्रत्येक सेगमेंट एक खेली गई चाल है। सर्वर यह URL प्राप्त करता है, शुरुआत से शुरू करता है, सभी चालों को क्रम से दोबारा खेलता है, और उस पल के मुकाबले की एक इमेज लौटाता है। कोई सेशन नहीं, किसी उपयोगकर्ता से जुड़ा कोई RAM स्टेट नहीं।

Discord इंटरैक्टिव बटन के माध्यम से काम करता है — जब खिलाड़ी "Attack" दबाता है, Discord सर्वर को बटन का `custom_id` भेजता है। यह custom_id नई चाल जोड़कर मुकाबले का संपीड़ित URL रखता है। सर्वर सब कुछ शून्य से पुनर्गणना करता है और अपडेटेड इमेज लौटाता है।

```typescript
// processUrl.ts
const VALID_MOVES_SET = new Set(["ATK", "DEF", "HUG", "HEA", "SPE", "USE"]);
// फ़ंक्शन से बाहर प्रीकंपाइल — हर कॉल पर पुनर्निर्मित नहीं

export default function processUrl(url: string): [Random, string[], string, string | null, string | null] {
  const urlParts = url.split("/");
  const moves: string[] = [];
  for (const part of urlParts) {
    if (VALID_MOVES_SET.has(part.toUpperCase())) moves.push(part.toUpperCase());
  }
  // seed = 6वाँ सेगमेंट, 8096 मानों पर हैश किया गया
  const seedStr = (urlParts[5] || "").toLowerCase();
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed + seedStr.charCodeAt(i)) % 8096;
  }
  return [new Random(seed), moves, seedStr, monster, difficulty];
}
```

फ़ंक्शन के बाहर प्रीकंपाइल `Set` एक छोटी बात है, लेकिन यह एज कॉन्टेक्स्ट में हर इनवोकेशन पर संरचना को पुनर्निर्मित करने से बचाता है जहाँ मॉड्यूल का पुनर्मूल्यांकन हो सकता है।

### RNG: संशोधित RC4

रैंडम जनरेटर RC4 (स्ट्रीम सिफर एल्गोरिदम) का एक कार्यान्वयन है जिसे PRNG में बदल दिया गया है।

```typescript
export class Random {
  private S: number[]; // 256 एंट्री की टेबल
  private i: number;
  private j: number;

  constructor(seed?: number) {
    this.S = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    let workingSeed = seed || Date.now();
    for (let i = 0; i < 256; i++) {
      j = (j + this.S[i] + (workingSeed & 0xff)) & 0xff;
      // swap S[i] और S[j]
      [this.S[i], this.S[j]] = [this.S[j], this.S[i]];
      workingSeed >>>= 8;
    }
  }

  next(): number { /* ... */ }
  randint(min: number, max: number): number { /* ... */ }
  choice(array: T[]): T { /* ... */ }
}
```

RC4 क्यों? क्योंकि यह एक डिटरमिनिस्टिक PRNG है जिसमें उचित वितरण और उचित सीड कोलिजन प्रतिरोध है। एक ही सीड = संख्याओं का एक ही क्रम = हर बार एक ही मुकाबला। यह किसी भी मुकाबले को उसका URL रखते हुए "रीप्ले" करने की अनुमति देता है, और गारंटी देता है कि दो अलग-अलग सर्वर (Vercel + Cloudflare) एक ही URL के लिए बिल्कुल एक ही परिणाम उत्पन्न करते हैं।

---

## Discord की 100 कैरेक्टर सीमा की समस्या

Discord बटन के `custom_id` पर 100 कैरेक्टर की सीमा लगाता है। कुछ दर्जन चालों के बाद, एक मुकाबले का URL आसानी से इस सीमा को पार कर जाता है।

दो तंत्र इसका समाधान करते हैं।

### 1. RLE संपीड़न

चालों को एक एकल कैरेक्टर (`a`=attack, `d`=defend, `h`=hug...) में एन्कोड किया जाता है और run-length encoding द्वारा संपीड़ित किया जाता है:

```typescript
// movesUtils.ts
export function compressMoves(moves: string): string {
  // "aaaaaadddh" → "a6d3h"
  let result = "";
  let count = 1;
  for (let i = 1; i <= actions.length; i++) {
    if (actions[i] === actions[i - 1]) {
      count++;
    } else {
      result += actions[i - 1] + (count > 1 ? String(count) : "");
      count = 1;
    }
  }
  return head + result;
}
```

सरल, लेकिन जब खिलाड़ी Attack x10 स्पैम करता है तो `aaaaaaaaaa` (10 कैरेक्टर) `a10` (3 कैरेक्टर) में बदल जाता है। UI में "Attack x4" और "Attack x10" बटन इसी के लिए मौजूद हैं — मुकाबले को तेज़ करना और पेलोड को अच्छी तरह संपीड़ित करना।

### 2. सेशन टोकन जब संपीड़न पर्याप्त न हो

यदि संपीड़ित पेलोड अभी भी बहुत लंबा है, तो इसे एक छोटे टोकन के साथ डेटाबेस में संग्रहीत किया जाता है:

```typescript
// gameSessionService.ts
const TOKEN_PREFIX = "gs.";
const TOKEN_SIZE = 10; // "gs.aBcDeFgHiJ"

export async function encodeGameplayButtons(buttons: RawButton[]): Promise {
  // पेलोड को battle_key से समूहित करता है, Supabase में बैच डालता है
  // custom_id को "gs.{token}:{userId}" से बदलता है
}

export async function decodeGameplayPayloadWithStatus(encodedPayload: string, userID: string) {
  if (!encodedPayload.startsWith(TOKEN_PREFIX)) {
    return { payload: encodedPayload }; // ज़रूरत न होने पर कोई लुकअप नहीं
  }
  // पहले मेमोरी में लुकअप, फिर Supabase में यदि न हो
  const cached = tokenToSession.get(token) || await loadTokenRowByToken(token);
  // स्वामित्व, TTL (7 दिन), और turn_version जाँचता है (पुरानी स्थिति को रीप्ले करने से बचाता है)
}
```

सेशन का TTL 7 दिन है और हर 10 मिनट में स्वचालित प्रूनिंग होती है। `turnVersion` जाँच खिलाड़ी द्वारा आगे बढ़ने पर पुरानी स्थिति को रीप्ले करने से रोकती है — आकस्मिक "पीछे जाने" के खिलाफ एक सूक्ष्म सुरक्षा।

मेमोरी में दोनों Maps (`tokenToSession`, `latestTurnByBattle`) उसी `globalThis as unknown as GameSessionGlobals` पैटर्न का उपयोग करती हैं जैसे इमेज कैश करते हैं, उन्हीं कारणों से जो आगे बताए जाएँगे।

---

## इमेज रेंडर पाइपलाइन

![डेब्यू डु कॉम्बैट कॉन्ट्रे उन स्लाइम](/images/konosuba-rpg/shot_01_start.webp)

रूट `/konosuba-rpg/:lang/*` JSON नहीं लौटाता। यह माँग पर जनरेट की गई WebP इमेज लौटाता है।

पाइपलाइन 3 संरचनात्मक परतों में व्यवस्थित है:

```
Background (board + frame)
    +
Characters layer (खिलाड़ी स्प्राइट्स + मॉब, निश्चित स्थान)
    +
UI overlay (HP बार, मैसेज, Satori → SVG → PNG के माध्यम से कैरेक्टर आइकन)
    ↓
Photon.watermark() × 2
    ↓
WebP output
```

**Background**: दो स्थिर छवियाँ (बोर्ड और फ्रेम), फाइलसिस्टम से लोड की गईं और एक बार कंपोज़ की गईं।

**Characters layer**: स्प्राइट्स गणना किए गए निर्देशांकों पर स्थित होते हैं। मरे हुए खिलाड़ी बाहर रखे जाते हैं (`activeSlots = slots.filter(s => playerHp[s.i] > 0)`)। दुश्मन स्प्राइट्स को कस्टम `flipX` से क्षैतिज रूप से मिरर किया जाता है — बाहरी निर्भरता के बजाय पिक्सेल-दर-पिक्सेल लूप।

```typescript
function flipX(img: Photon.PhotonImage): Photon.PhotonImage {
  const w = img.get_width(), h = img.get_height();
  const raw = img.get_raw_pixels();
  const flipped = new Uint8Array(raw.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4;
      const dst = (y * w + (w - 1 - x)) * 4;
      flipped[dst] = raw[src]; flipped[dst+1] = raw[src+1];
      flipped[dst+2] = raw[src+2]; flipped[dst+3] = raw[src+3];
    }
  }
  return new Photon.PhotonImage(flipped, w, h);
}
```

**UI overlay**: यह भारी हिस्सा है। इंटरफ़ेस का JSX (हेल्थ बार, टेक्स्ट, आइकन) React-like तरीके से Satori के साथ वर्णित किया जाता है, SVG में रेंडर किया जाता है, `@cf-wasm/resvg` द्वारा PNG में परिवर्तित किया जाता है, फिर अंतिम रचना के लिए Photon में आयात किया जाता है। Satori + resvg दो WASM मॉड्यूल हैं जिन्हें विशेष रूप से Cloudflare Workers के लिए `edge-light` फ्लैग के साथ संकलित किया गया है।

![एक्शन डिफ़ेंस](/images/konosuba-rpg/shot_03_defend.webp)

![कॉम्बैट इन प्रोग्रेस](/images/konosuba-rpg/shot_02_combat.webp)

![एक्शन हग](/images/konosuba-rpg/shot_04_hug.webp)

---

## कैश सिस्टम — सबसे अधिक काम किया गया हिस्सा

5 अलग-अलग कैश स्तर हैं। प्रत्येक पाइपलाइन के एक अलग ग्रैन्युलैरिटी को लक्षित करता है।

```typescript
// renderImage.ts -- सभी globalThis पर
G.__imageCache  ??= {} as Record; // कच्चे एसेट्स
G.__base64Cache ??= {} as Record;       // एसेट्स का base64 (Satori के लिए)
G.__fontCache   ??= {} as Record; // फॉन्ट
G.__photonCache    ??= new LRUCache(40, freePhoton);
G.__layerCache     ??= new LRUCache(12, freePhoton);
G.__uiPhotonCache  ??= new LRUCache(30, freePhoton);
G.__renderOutputCache ??= new LRUCache(120);
```

`globalThis` पर `??=` पैटर्न: एज वर्कर्स में JavaScript मॉड्यूल कुछ कॉन्फ़िगरेशन पर अनुरोधों के बीच पुनर्मूल्यांकित हो सकते हैं। `??=` के साथ `globalThis` पर कैश संग्रहीत करना सुनिश्चित करता है कि वे पुनर्मूल्यांकन से बचे रहें बिना पुनर्निर्मित हुए।

### WASM एविक्शन

Photon इमेज कैश (`photonCache`, `layerCache`, `uiPhotonCache`) एविक्शन कॉलबैक का उपयोग करते हैं:

```typescript
function freePhoton(_key: string, img: Photon.PhotonImage): void {
  try { img.free(); } catch { /* पहले ही मुक्त किया जा चुका */ }
}

new LRUCache(40, freePhoton)
```

`Photon.PhotonImage` एक WASM ऑब्जेक्ट है जिसमें WASM लीनियर मेमोरी के बाहर आवंटित मेमोरी होती है, जो JavaScript GC के दायरे से बाहर है। बिना `.free()` के स्पष्ट कॉल के, यह मेमोरी कभी मुक्त नहीं होती। LRU का एविक्शन स्वचालित रूप से `.free()` ट्रिगर करता है — यह JavaScript में RAII है।

### कैश कीज़ जानबूझकर लॉसी हैं

```typescript
function buildCharactersKey(playerImages: string[][], playerHp: number[], creatureImages: string[], creatureHp: number): string {
  const players = playerImages.map((imgs, i) => `${imgs[0]}:${playerHp[i] > 0 ? 1 : 0}`).join("|");
  return `chars::${players}::${creatureImages[0]}:${creatureHp > 0 ? 1 : 0}`;
}
```

कैरेक्टर्स लेयर की की HP का सटीक मान एन्कोड नहीं करती — सिर्फ `1` (जीवित) या `0` (मृत)। क्योंकि 40 HP वाले खिलाड़ी और 15 HP वाले खिलाड़ी का स्प्राइट एक जैसा होता है। इसलिए एक कैश हिट किसी भी क्षति से बच जाता है जब तक कोई मर न जाए।

दूसरी ओर UI की सटीक HP एन्कोड करती है (हेल्थ बार हर हिट पर बदलता है) और मैसेज का हैश:

```typescript
function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0; // 32-बिट साइन्ड इंटीजर
  }
  return hash.toString(16);
}
```

`Math.imul` गुणा को 32-बिट इंटीजर में बलपूर्वक करता है, जो float64 रूपांतरण से बचाता है और एक स्थिर बहुपद हैश देता है। इसके लिए कोई बाहरी निर्भरता नहीं।

### स्टैक ओवरफ़्लो के बिना base64 रूपांतरण

```typescript
function getBase64Cached(key: string, buf: ArrayBuffer): string {
  if (base64Cache[key]) return base64Cache[key];
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000; // 32768 बाइट्स
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  const b64 = btoa(binary);
  base64Cache[key] = b64;
  return b64;
}
```

`String.fromCharCode(...largeArray)` बड़ी इमेज पर स्टैक ओवरफ़्लो का कारण बन सकता है क्योंकि आर्ग्युमेंट कॉल स्टैक पर पास होते हैं। 32KB चंकिंग इससे बचाती है। परिणाम कैश किया जाता है — एक ही इमेज का base64 रूपांतरण प्रति वर्कर इंस्टेंस केवल एक बार किया जाता है।

---

## STRIPPER.md — अनुक्रमिक awaits का ऑडिट

रिपो में एक फ़ाइल `STRIPPER.md` है जो `await` के समानांतरीकरण ऑडिट का दस्तावेज़ीकरण करती है। कुछ उदाहरण जो इसमें दर्ज हैं:

- खिलाड़ी प्रोफ़ाइल लोड करना तीन Supabase क्वेरी (प्रोग्रेस, रन सारांश, उपलब्धियाँ) श्रृंखला में कर रहा था। उन्हें `Promise.all` में बदल दिया गया — उनके बीच कोई निर्भरता नहीं।
- मुकाबले के अंत में पुरस्कार वितरण (एक्सेसरीज़ + उपभोग्य वस्तुएँ) अनुक्रमिक था। उसी तरह समानांतर किया गया।
- बटन के लिए सेशन टोकन का निर्माण समूह दर समूह हो रहा था। स्वतंत्र समूह अब समानांतर में बनाए जाते हैं।

```typescript
// progressionService.ts -- पहले (अनुक्रमिक)
await grantAccessoryDropRewards(...);
await grantConsumableDropRewards(...);

// बाद में
await Promise.all([
  grantAccessoryDropRewards(...),
  grantConsumableDropRewards(...),
]);
```

इसमें कोई क्रांतिकारी बात नहीं, लेकिन सर्वरलेस कॉन्टेक्स्ट में जहाँ प्रतिक्रिया समय की हर मिलीसेकंड बिल योग्य है (या कोल्ड स्टार्ट में योगदान करती है), यह मायने रखता है।

---

## बिना स्थायी सर्वर के Discord बॉट

![विजय](/images/konosuba-rpg/shot_05_win.webp)

एक अक्सर गलत समझी जाने वाली बात: Discord बॉट को जरूरी नहीं कि एक स्थायी WebSocket कनेक्शन की आवश्यकता हो। Discord एक विकल्प प्रदान करता है: **Interactions Endpoint URL**। आप Discord को एक HTTPS URL प्रदान करते हैं, और Discord प्रत्येक इंटरैक्शन (स्लैश कमांड, बटन, ऑटोकम्प्लीट) के लिए आपको एक POST भेजता है।

```typescript
// interactions.ts
export async function handleInteractions(c: Context) {
  const body = await c.req.text();
  const isVerified = await verifySignature(c, body); // Ed25519
  if (!isVerified) return c.text("Invalid signature", 401);

  const interaction: Interaction = JSON.parse(body);
  if (interaction.type === 1) return c.json({ type: 1 }); // Discord ping
  if (interaction.type === 2) return handleSlashCommand(...);
  if (interaction.type === 3) return handleButtonInteraction(...);
  if (interaction.type === 4) return handleAutocomplete(...);
}
```

Discord एक POST भेजता है, हैंडलर Vercel फ़ंक्शन या Cloudflare Worker पर 50-200ms चलता है, जवाब देता है, और समाप्त। कोई स्थायी कनेक्शन बनाए रखने की ज़रूरत नहीं, कोई सर्वर चालू रखने की ज़रूरत नहीं। पूरा Discord बॉट Vercel के फ्री टियर पर होस्ट किया गया है।

Ed25519 सत्यापन (`discord-interactions` से `verifyKey`) अनिवार्य है — Discord हेडर में एक सिग्नेचर भेजता है जिसे आपको सत्यापित करना होता है, अन्यथा वह एंडपॉइंट को अस्वीकार कर देता है।

### विशेष एनिमेशन — एकमात्र जानबूझकर किया गया await

```typescript
// handleSpecialButton.ts
await new Promise(resolve => setTimeout(resolve, 3000)); // 3 सेकंड
await fetch(`${DISCORD_API_URL}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
  method: "PATCH",
  // ...
});
```

यह जानबूझकर 3 सेकंड की देरी STRIPPER.md में जानबूझकर के रूप में दस्तावेज़ित है। Megumin का विशेष हमला (Explosion) Discord साइड पर एक एनिमेशन रखता है — संदेश को पहले एक मध्यवर्ती दृश्य के साथ अपडेट किया जाता है, फिर 3 सेकंड बाद परिणाम के साथ संशोधित किया जाता है। यह एकमात्र मामला है जहाँ Vercel फ़ंक्शन जानबूझकर आवश्यकता से अधिक समय तक चलता है।

![विशेष हमला](/images/konosuba-rpg/shot_08_special.webp)

---

## दो प्लेटफ़ॉर्म पर डिप्लॉयेबिलिटी

एक ही कोडबेस बिना संशोधन के Vercel (Node.js) और Cloudflare Workers (V8 आइसोलेट्स) पर चलता है:

```typescript
// worker.ts -- Cloudflare एंट्रीपॉइंट
export default {
  fetch(request: Request, env: WorkerBindings): Promise {
    syncBindingsToProcessEnv(env); // CF सीक्रेट्स को process.env में इंजेक्ट करता है
    return app.fetch(request, env, ctx);
  }
};

// index.ts -- Vercel/Node एंट्रीपॉइंट
const isVercelRuntime = process.env.VERCEL === "1";
if (!isVercelRuntime) { start(); }
```

मुख्य अंतर: स्टैटिक एसेट्स। Vercel पर, वे फाइलसिस्टम (`/var/task/assets/`) से पढ़े जाते हैं। Cloudflare Workers पर, वे `ASSETS` बाइंडिंग (CF स्टैटिक एसेट्स) से HTTTPS मिरर (`fox3000foxy.com/konosuba-rpg/assets`) पर फ़ॉलबैक के साथ जाते हैं। `assetLoader.ts` में `getAssetBytes` पहले फाइलसिस्टम, फिर fetch कोशिश करके दोनों पथों को संभालता है।

WASM (`@cf-wasm/photon/edge-light`, `@cf-wasm/resvg`) के प्रत्येक रनटाइम के लिए अलग-अलग बिल्ड हैं। पैकेज के नाम में `edge-light` फ्लैग Cloudflare Workers-संगत बिल्ड को दर्शाता है, जो रनटाइम पर `new WebAssembly.Module()` की अनुमति नहीं देता — WASM को प्री-कंपाइल होना चाहिए।

---

## प्रोग्रेस: XP, लेवल, अफ़िनिटी

![एक बॉस, 650 HP](/images/konosuba-rpg/shot_06_boss.webp)

मेटा-प्रोग्रेस Supabase फ्री टियर पर आधारित है। स्कीमा में एक टेबल `players` (ग्लोबल XP, लेवल, गोल्ड), `character_progress` (Darkness, Aqua, Megumin के लिए प्रति कैरेक्टर XP/लेवल/अफ़िनिटी), `runs` (मुकाबलों का इतिहास), `inventory_items`, `daily_quests_progress`, `achievements_unlocked`, `game_sessions` शामिल हैं।

प्रोग्रेस मॉडल सरल है:

```typescript
// characterService.ts
export function computeLevelFromXp(xp: number): number {
  return Math.floor(xp / 100) + 1; // 100 XP प्रति लेवल
}

export function getLevelFactor(level: number): number {
  return 1 + 0.2 * (level - 1); // +20% स्टैट्स प्रति लेवल
}

export function getAffinityFactor(affinity: number): number {
  const stars = Math.floor(affinity / 20); // 20 पॉइंट प्रति स्टार, अधिकतम 5 स्टार
  return 1.2 ** stars; // एक्सपोनेंशियल प्रोग्रेस
}
```

ये फैक्टर प्रत्येक `processGame` की शुरुआत में कैरेक्टर स्टैट्स पर लागू होते हैं। Kazuma खिलाड़ी के ग्लोबल लेवल का अनुसरण करता है, बाकी तीनों का अपना XP/लेवल है। अफ़िनिटी (एक कैरेक्टर से संबंधित ड्रॉप प्राप्त करके अर्जित) स्वतंत्र रूप से उनके स्टैट्स को गुणा करती है।

![हील](/images/konosuba-rpg/shot_07_heal.webp)

ड्रॉप सिस्टम कठिनाई-भारित लूट टेबल का उपयोग करता है:

```typescript
const LOOT_TABLE_BY_DIFFICULTY: Record = {
  [MonsterDifficulty.Easy]: {
    baseRolls: 2, bonusRollChance: 0.1, maxBonusRolls: 2,
    rarityWeights: [
      { rarity: Rarity.Bronze, weight: 68 },
      { rarity: Rarity.Silver, weight: 25 },
      { rarity: Rarity.Gold,   weight: 6  },
      { rarity: Rarity.Epic,   weight: 1  },
    ],
  },
  // ...Legendary तक
};
```

---

## परीक्षण

तीन सूट: यूनिट, परफॉरमेंस, और लीक।

लीक टेस्ट विशेष रूप से प्रत्यक्ष है:

```typescript
// leaks.spec.ts
it('does not show strong heap growth across repeated runs', async () => {
  global.gc();
  const before = heapUsedMb();

  for (let i = 0; i < 1200; i++) {
    await processGame(new Random(), ['ATK', 'DEF', 'HUG', 'ATK', 'DEF'], 'Dragon', Lang.English);
  }

  global.gc();
  const after = heapUsedMb();
  expect(after - before).toBeLessThan(20); // अधिकतम 20MB heap वृद्धि
});
```

`processGame` के 1200 पुनरावृत्तियाँ, पहले और बाद में फोर्स्ड GC, delta heap < 20MB। यदि यह परीक्षण पास होता है, `processGame` लीक नहीं करता। रेंडर टेस्ट (`renderImage.spec.ts`) इसके बजाय एक व्यावहारिक सीमा के तहत निष्पादन समय की जाँच करता है।

पूर्ण पाइपलाइन को प्रोफाइल करने के लिए एक स्क्रिप्ट `bench.ts` भी है:

```
RENDER_PERF=1 npx tsx bench.ts --runs=20 --warmup=3 --monster=Dragon
```

`RENDER_PERF=1` के साथ, प्रत्येक सेवा में `withPerf` रैपर टाइमिंग लॉग करता है:

```typescript
export async function withPerf(scope: string, label: string, work: () => Promise): Promise {
  const perf = createPerfLogger(scope);
  if (!perf.enabled) return work(); // निष्क्रिय होने पर शून्य ओवरहेड
  perf.mark(`${label}:start`);
  try { return await work(); }
  finally { perf.done(`${label}:done`); }
}
```

`createPerfLogger` नो-ऑप्स लौटाता है यदि `DEV_MODE` और `RENDER_PERF` `1` पर नहीं हैं। प्रोडक्शन में कोई ओवरहेड नहीं।

---

## इसे चलाने में कितना खर्च आता है

- **Vercel फ्री टियर**: 100GB बैंडविड्थ, प्रति माह 1M सर्वरलेस इनवोकेशन। इमेज रेंडर एक इनवोकेशन माना जाता है।
- **Cloudflare Workers फ्री टियर**: 100K अनुरोध/दिन, प्रति अनुरोध 10ms CPU समय (रेंडर Workers पर इसे पार कर सकता है, इसलिए Vercel प्राथमिक है)।
- **Supabase फ्री टियर**: 500MB डेटाबेस, 5GB बैंडविड्थ। हज़ारों खिलाड़ियों के लिए पर्याप्त।

पूरा बैकएंड एक महत्वपूर्ण वॉल्यूम तक शून्य लागत पर चलता है। एकमात्र घर्षण बिंदु Cloudflare Workers की CPU सीमा है — WASM के कारण इमेज रेंडर CPU-इंटेंसिव है, इसलिए Vercel को प्राथमिक और Workers को फ़ेलओवर CDN के रूप में रखने की रणनीति है।

---

## 3 चीज़ें जो याद रखने लायक हैं

1. **URL गेम स्टेट के रूप में** केवल एक अच्छी ट्रिक नहीं है — यह Discord द्वारा लगाई गई एक बाध्यता है (बटन की 100 कैरेक्टर सीमा) जिसने RLE संपीड़न + फ़ॉलबैक के रूप में सेशन टोकन के साथ एक स्टेटलेस आर्किटेक्चर को मजबूर किया। बाध्यता ने डिज़ाइन को निर्धारित किया।

2. **स्पष्ट एविक्शन के साथ WASM कैश**: `PhotonImage` JavaScript heap के बाहर आवंटित होते हैं और `.free()` के बिना कभी GC'd नहीं होंगे। LRU के एविक्शन पर `freePhoton` को जोड़ना JavaScript में RAII है। यह कोड में सूक्ष्म है, लेकिन इसके बिना वर्कर प्रोडक्शन में लीक करेगा।

3. **WebSocket के बिना एक सर्वरलेस Discord बॉट**: यह WebSocket गेटवे दृष्टिकोण से कम ज्ञात है, लेकिन स्टेटलेस प्रोसेसिंग करने वाले बॉट के लिए (प्रत्येक इंटरैक्शन स्वतंत्र है), Interactions Endpoint सख्ती से बेहतर है — कोई पुनःकनेक्शन नहीं, कोई हार्टबीट नहीं, कोई बनाए रखने वाली प्रक्रिया नहीं। Discord अपने इन्फ्रा की ओर से उपलब्धता का प्रबंधन करता है।

---

*Repo : [fox3000foxy/konosuba-rpg](https://github.com/fox3000foxy/konosuba-rpg)*

*Licence source-available custom -- pas de redistribution, free to use.*
