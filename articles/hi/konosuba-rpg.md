---
title: "मैंने konosuba-rpg का कोड पढ़ने में सप्ताहांत बिताया और यह मिला"
description: "Discord turn by turn RPG जहाँ हर क्रिया तुरंत WebP छवि बनाती है : खेल स्थिति के रूप में URL, नियतात्मक RNG, WASM पाइपलाइन, 5 स्तर cache, serverless बॉट।"
date: 2026-06-10
tags:
  - discord
  - rpg
  - typescript
  - hono
  - cloudflare
  - supabase
  - wasm
  - gaming
  - serverless
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "2bIjKu41987DAexv8HE8IxNBhYP0n4fSM/Cqts995v2pz8fHRq3lNG7H8K1FcAH7VFUxS88K8Uk6FoBlnq2J8g=="
---

# मैंने konosuba-rpg का कोड पढ़ने में सप्ताहांत बिताया और यह मिला

मैं यह प्रोजेक्ट काफी समय से बनाए रखता हूँ, लेकिन शांत दिमाग से अपना कोड फिर से पढ़ना हमेशा शिक्षाप्रद होता है। konosuba-rpg एक Discord turn by turn RPG है जहाँ हर क्रिया तुरंत WebP छवि बनाती है। यह असली संयोजित छवि है, sprite, जीवन पट्टियों, युद्ध संदेशों के साथ, सब कुछ।

स्टैक : TypeScript, Hono, Vercel, Cloudflare Workers, Supabase। पूरी तरह मुफ्त होस्टिंग। और Discord बॉट स्थायी सर्वर के बिना चलता है। यह पोस्ट समझाता है कि यह सब एक साथ कैसे टिका है।

![खेल की प्रारंभिक स्थिति](/images/konosuba-rpg/game_init.webp)

---

## बुनियादी डिजाइन : खेल स्थिति के रूप में URL

पहली चीज जो चुभती है : gameplay के लिए serveur तरफ कोई स्थिति नहीं है। युद्ध की पूरी स्थिति URL में समाती है।

```
/konosuba-rpg/fr/abc123/ATK/DEF/ATK/HUG?monster=Vanir&difficulty=hard
```

seed के बाद हर खंड खेली क्रिया है। serveur यह URL पाता है, शुरुआत से फिर शुरू करता है, सभी क्रियाएँ क्रम से फिर से खेलता है, और ठीक उस क्षण के युद्ध की छवि लौटाता है। कोई सत्र नहीं, किसी उपयोगकर्ता से जुड़ी RAM में कोई स्थिति नहीं।

Discord इंटरैक्टिव बटन से काम करता है, जब खिलाड़ी "Attaquer" दबाता है, तो Discord serveur को बटन का `custom_id` भेजता है। इस custom_id में जोड़ी नई क्रिया के साथ युद्ध का संपीड़ित URL होता है। serveur शून्य से सब फिर से गणना करता है और अद्यतन छवि लौटाता है।

```typescript
// processUrl.ts
const VALID_MOVES_SET = new Set(["ATK", "DEF", "HUG", "HEA", "SPE", "USE"]);
// फंक्शन के बाहर पूर्व संकलित, हर कॉल पर फिर से नहीं बनाया जाता

export default function processUrl(url: string): [Random, string[], string, string | null, string | null] {
  const urlParts = url.split("/");
  const moves: string[] = [];
  for (const part of urlParts) {
    if (VALID_MOVES_SET.has(part.toUpperCase())) moves.push(part.toUpperCase());
  }
  // seed = 6वाँ खंड, 8096 मानों पर hash किया गया
  const seedStr = (urlParts[5] || "").toLowerCase();
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed + seedStr.charCodeAt(i)) % 8096;
  }
  return [new Random(seed), moves, seedStr, monster, difficulty];
}
```

फंक्शन के बाहर पूर्व संकलित `Set` एक विवरण है, लेकिन यह edge संदर्भ में हर आह्वान पर संरचना फिर से बनाने से बचाता है जहाँ मॉड्यूल फिर से मूल्यांकित हो सकते हैं।

### RNG : संशोधित RC4

बेतरतीब जनरेटर RC4 कार्यान्वयन (stream एन्क्रिप्शन एल्गोरिदम) है जिसे PRNG में मोड़ा गया है।

```typescript
export class Random {
  private S: number[]; // 256 प्रविष्टियों की तालिका
  private i: number;
  private j: number;

  constructor(seed?: number) {
    this.S = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    let workingSeed = seed || Date.now();
    for (let i = 0; i < 256; i++) {
      j = (j + this.S[i] + (workingSeed & 0xff)) & 0xff;
      // S[i] और S[j] अदला बदली
      [this.S[i], this.S[j]] = [this.S[j], this.S[i]];
      workingSeed >>>= 8;
    }
  }

  next(): number { /* ... */ }
  randint(min: number, max: number): number { /* ... */ }
  choice(array: T[]): T { /* ... */ }
}
```

RC4 क्यों ? क्योंकि यह सही वितरण और उचित seed टक्कर प्रतिरोध वाला नियतात्मक PRNG है। वही seed = संख्याओं का वही क्रम = हर बार वही युद्ध। यह अपना URL रखकर किसी भी युद्ध को "फिर से खेलने" देता है, और गारंटी देता है कि दो अलग serveur (Vercel + Cloudflare) उसी URL के लिए बिल्कुल वही परिणाम बनाते हैं।

---

## Discord की 100 अक्षर सीमा की समस्या

Discord बटन के `custom_id` पर 100 अक्षर सीमा थोपता है। कुछ दस क्रियाओं के बाद, युद्ध URL इस सीमा को आसानी से पार कर जाता है।

दो तंत्र इसका उत्तर देते हैं।

### 1. क्रियाओं का RLE संपीड़न

क्रियाएँ एक अक्षर से एन्कोड की जाती हैं (`a`=attack, `d`=defend, `h`=hug...) और run-length encoding से संपीड़ित होती हैं :

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

सरल, लेकिन जब खिलाड़ी Attaque x10 spam करता है तो यह `aaaaaaaaaa` (10 अक्षर) से `a10` (3 अक्षर) जाता है। UI में "Attaquer x4" और "Attaquer x10" बटन ठीक इसके लिए मौजूद हैं, युद्ध तेज करने के साथ payload अच्छा संपीड़ित करना।

### 2. जब संपीड़न काफी न हो तो सत्र token

अगर संपीड़ित payload अभी भी बहुत लंबा है, तो वह छोटे token के साथ आधार में संग्रहित होता है :

```typescript
// gameSessionService.ts
const TOKEN_PREFIX = "gs.";
const TOKEN_SIZE = 10; // "gs.aBcDeFgHiJ"

export async function encodeGameplayButtons(buttons: RawButton[]): Promise {
  // battle_key से payload समूह करता है, Supabase में batch डालता है
  // custom_id को "gs.{token}:{userId}" से बदलता है
}

export async function decodeGameplayPayloadWithStatus(encodedPayload: string, userID: string) {
  if (!encodedPayload.startsWith(TOKEN_PREFIX)) {
    return { payload: encodedPayload }; // जरूरत न होने पर कोई lookup नहीं
  }
  // पहले स्मृति में lookup, फिर अनुपस्थित होने पर Supabase
  const cached = tokenToSession.get(token) || await loadTokenRowByToken(token);
  // स्वामित्व, TTL (7 दिन), और turn_version जाँचता है (पुरानी स्थिति फिर से खेलने से रोकता है)
}
```

सत्रों का TTL 7 दिन है और हर 10 मिनट स्वचालित pruning। `turnVersion` जाँच पुरानी स्थिति फिर से खेलने से रोकती है अगर खिलाड़ी खेल में आगे बढ़ चुका है, आकस्मिक "पीछे जाने" के खिलाफ विवेकपूर्ण सुरक्षा।

स्मृति में दो Map (`tokenToSession`, `latestTurnByBattle`) छवि cache वाला `globalThis as unknown as GameSessionGlobals` पैटर्न इस्तेमाल करते हैं, उन्हीं कारणों से जो हम नीचे देखेंगे।

---

## छवि रेंडर पाइपलाइन

![Slime के खिलाफ युद्ध शुरुआत](/images/konosuba-rpg/shot_01_start.webp)

`/konosuba-rpg/:lang/*` route JSON नहीं लौटाती। वह माँग पर उत्पन्न WebP छवि लौटाती है।

पाइपलाइन 3 संयोजित layer में व्यवस्थित है :

```
Background (board + frame)
    +
Characters layer (खिलाड़ी sprite + mob, स्थिर स्थितियाँ)
    +
UI overlay (HP पट्टियाँ, संदेश, Satori → SVG → PNG से व्यक्तिगत आइकन)
    ↓
Photon.watermark() × 2
    ↓
WebP output
```

**Background** : दो स्थिर छवियाँ (पट्ट और फ्रेम), filesystem से लोड और एक बार संयोजित।

**Characters layer** : sprite गणना निर्देशांक अनुसार स्थित हैं। मरे खिलाड़ी बाहर हैं (`activeSlots = slots.filter(s => playerHp[s.i] > 0)`)। शत्रु sprite कस्टम `flipX` से क्षैतिज mirror किए गए हैं, बाहरी निर्भरता के बजाय pixel दर pixel लूप।

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

**UI overlay** : यह भारी हिस्सा है। इंटरफेस JSX (जीवन पट्टियाँ, पाठ, आइकन) Satori से React जैसे वर्णित है, SVG में रेंडर, `@cf-wasm/resvg` से PNG में बदला, फिर अंतिम संयोजन के लिए Photon में आयात। Satori + resvg दो WASM मॉड्यूल हैं जो `edge-light` flag के साथ Cloudflare Workers के लिए विशेष संकलित हैं।

![Défense क्रिया](/images/konosuba-rpg/shot_03_defend.webp)

![चलता युद्ध](/images/konosuba-rpg/shot_02_combat.webp)

![Câlin क्रिया](/images/konosuba-rpg/shot_04_hug.webp)

---

## cache तंत्र, सबसे मेहनत वाला हिस्सा

5 अलग cache स्तर हैं। हर एक पाइपलाइन की अलग दानेदारी लक्षित करता है।

```typescript
// renderImage.ts , सब globalThis पर
G.__imageCache  ??= {} as Record; // कच्चे assets
G.__base64Cache ??= {} as Record;       // assets का base64 (Satori के लिए)
G.__fontCache   ??= {} as Record; // font
G.__photonCache    ??= new LRUCache(40, freePhoton);
G.__layerCache     ??= new LRUCache(12, freePhoton);
G.__uiPhotonCache  ??= new LRUCache(30, freePhoton);
G.__renderOutputCache ??= new LRUCache(120);
```

`globalThis` पर `??=` पैटर्न : edge worker में JavaScript मॉड्यूल कुछ कॉन्फ़िगरेशन पर अनुरोधों के बीच फिर से मूल्यांकित हो सकते हैं। `??=` के साथ `globalThis` पर cache संग्रहित करना गारंटी देता है कि वे इन पुनर्मूल्यांकन से बिना फिर से बनाए बचते हैं।

### WASM निष्कासन

Photon छवि cache (`photonCache`, `layerCache`, `uiPhotonCache`) निष्कासन callback इस्तेमाल करते हैं :

```typescript
function freePhoton(_key: string, img: Photon.PhotonImage): void {
  try { img.free(); } catch { /* पहले ही मुक्त */ }
}

new LRUCache(40, freePhoton)
```

`Photon.PhotonImage` WASM ऑब्जेक्ट है जिसकी स्मृति रैखिक WASM तरफ आवंटित है, JavaScript GC के बाहर। यह स्मृति आवंटित रहती है जब तक `.free()` स्पष्ट न बुलाया जाए। LRU निष्कासन `.free()` अपने आप trigger करता है, यह JavaScript में लाया RAII है।

### cache कुंजियाँ जानबूझकर lossy हैं

```typescript
function buildCharactersKey(playerImages: string[][], playerHp: number[], creatureImages: string[], creatureHp: number): string {
  const players = playerImages.map((imgs, i) => `${imgs[0]}:${playerHp[i] > 0 ? 1 : 0}`).join("|");
  return `chars::${players}::${creatureImages[0]}:${creatureHp > 0 ? 1 : 0}`;
}
```

characters layer कुंजी HP का सटीक मान एन्कोड नहीं करती, सिर्फ `1` (जीवित) या `0` (मरा)। क्योंकि 40 HP वाले खिलाड़ी और 15 HP वाले खिलाड़ी का sprite समान है। cache hit इसलिए किसी भी नुकसान से बचता है जब तक कोई गिरता नहीं।

UI कुंजी इसके विपरीत सटीक HP एन्कोड करती है (जीवन पट्टी हर चोट पर बदलती है) और संदेशों का hash :

```typescript
function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0; // हस्ताक्षरित 32-बिट पूर्णांक
  }
  return hash.toString(16);
}
```

`Math.imul` गुणा को 32 बिट पूर्णांक में बाध्य करता है, जो float64 रूपांतरण से बचाता है और स्थिर बहुपद hash देता है। यह इसके लिए बाहरी निर्भरता जोड़ने से बचाता है।

### बिना stack overflow base64 रूपांतरण

```typescript
function getBase64Cached(key: string, buf: ArrayBuffer): string {
  if (base64Cache[key]) return base64Cache[key];
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000; // 32768 octet
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  const b64 = btoa(binary);
  base64Cache[key] = b64;
  return b64;
}
```

`String.fromCharCode(...largeArray)` बड़ी छवियों पर stack overflow कर सकता है क्योंकि तर्क call stack पर भेजे जाते हैं। 32Ko chunking इससे बचाता है। परिणाम cache किया जाता है, एक ही छवि का base64 रूपांतरण worker उदाहरण में सिर्फ एक बार किया जाता है।

---

## STRIPPER.md, क्रमिक await का ऑडिट

repo में `STRIPPER.md` फाइल है जो `await` समानांतरीकरण ऑडिट प्रलेखित करती है। इसमें दर्ज कुछ उदाहरण :

- खिलाड़ी प्रोफाइल लोड 3 Supabase अनुरोध क्रम में करता था (प्रगति, run सारांश, achievement)। उन्हें `Promise.all` में डाला गया, उनके बीच कोई निर्भरता नहीं।
- युद्ध अंत पुरस्कार वितरण (सहायक वस्तुएँ + उपभोग्य) क्रमिक था। वैसे ही समानांतर किया गया।
- बटन के लिए सत्र token निर्माण समूह दर समूह होता था। स्वतंत्र समूह अब समानांतर बनाए जाते हैं।

```typescript
// progressionService.ts , पहले (क्रमिक)
await grantAccessoryDropRewards(...);
await grantConsumableDropRewards(...);

// बाद में
await Promise.all([
  grantAccessoryDropRewards(...),
  grantConsumableDropRewards(...),
]);
```

कुछ क्रांतिकारी नहीं, लेकिन serverless संदर्भ में जहाँ उत्तर समय का हर मिलीसेकंड बिल किया जाता है (या cold start में योगदान देता है), यह मायने रखता है।

---

## स्थायी सर्वर रहित Discord बॉट

![Victoire](/images/konosuba-rpg/shot_05_win.webp)

अक्सर गलत समझा बिंदु : Discord बॉट को जरूरी नहीं स्थायी WebSocket कनेक्शन चाहिए। Discord विकल्प देता है : **Interactions Endpoint URL**। तुम Discord को HTTPS URL देते हो, और Discord हर interaction (slash command, बटन, autocomplete) के लिए POST भेजता है।

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

Discord POST भेजता है, handler Vercel फंक्शन या Cloudflare Worker पर 50-200ms चलता है, जवाब देता है, और खत्म। बनाए रखने को कोई स्थायी कनेक्शन नहीं, जलाए रखने को कोई serveur नहीं। पूरा Discord बॉट Vercel free tier पर होस्ट है।

Ed25519 जाँच (`discord-interactions` से `verifyKey`) अनिवार्य है, Discord हेडर में हस्ताक्षर भेजता है जिसे तुम्हें मान्य करना होगा, वरना वह endpoint अस्वीकार करता है।

### विशेष एनीमेशन, एकमात्र जानबूझकर await

```typescript
// handleSpecialButton.ts
await new Promise(resolve => setTimeout(resolve, 3000)); // 3 सेकंड
await fetch(`${DISCORD_API_URL}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
  method: "PATCH",
  // ...
});
```

3 सेकंड का यह स्वैच्छिक विलंब STRIPPER.md में जानबूझकर प्रलेखित है। Megumin का विशेष हमला (Explosion) Discord तरफ एनीमेशन रखता है, संदेश पहले मध्यवर्ती दृश्य से अद्यतन होता है, फिर 3 सेकंड बाद परिणाम से संशोधित होता है। यही एकमात्र मामला है जहाँ Vercel फंक्शन जानबूझकर जरूरत से ज्यादा चलता है।

![विशेष हमला](/images/konosuba-rpg/shot_08_special.webp)

---

## दो प्लेटफॉर्म पर परिनियोजन योग्यता

वही codebase बिना संशोधन Vercel (Node.js) और Cloudflare Workers (V8 isolates) पर चलता है :

```typescript
// worker.ts , Cloudflare entrypoint
export default {
  fetch(request: Request, env: WorkerBindings): Promise {
    syncBindingsToProcessEnv(env); // CF secret process.env में डालता है
    return app.fetch(request, env, ctx);
  }
};

// index.ts , Vercel/Node entrypoint
const isVercelRuntime = process.env.VERCEL === "1";
if (!isVercelRuntime) { start(); }
```

मुख्य अंतर : स्थिर asset। Vercel पर, वे filesystem से पढ़े जाते हैं (`/var/task/assets/`)। Cloudflare Workers पर, वे `ASSETS` binding (CF स्थिर asset) से गुजरते हैं, HTTPS mirror (`fox3000foxy.com/konosuba-rpg/assets`) की ओर fallback के साथ। `assetLoader.ts` में `getAssetBytes` filesystem पहले, फिर fetch आजमाकर दोनों रास्ते संभालता है।

WASM (`@cf-wasm/photon/edge-light`, `@cf-wasm/resvg`) के हर runtime के लिए अलग build हैं। पैकेज नाम में `edge-light` flag Cloudflare Workers संगत build दर्शाता है, जो runtime पर `new WebAssembly.Module()` अनुमति नहीं देता, WASM पूर्व संकलित होना चाहिए।

---

## प्रगति : XP, स्तर, आत्मीयता

![Boss, 650 HP](/images/konosuba-rpg/shot_06_boss.webp)

meta-प्रगति Supabase free tier पर टिकी है। schema में `players` तालिका (वैश्विक XP, स्तर, gold), `character_progress` (Darkness, Aqua, Megumin के लिए प्रति पात्र XP/स्तर/आत्मीयता), `runs` (युद्ध इतिहास), `inventory_items`, `daily_quests_progress`, `achievements_unlocked`, `game_sessions` हैं।

प्रगति मॉडल सरल है :

```typescript
// characterService.ts
export function computeLevelFromXp(xp: number): number {
  return Math.floor(xp / 100) + 1; // प्रति स्तर 100 XP
}

export function getLevelFactor(level: number): number {
  return 1 + 0.2 * (level - 1); // प्रति स्तर +20% stats
}

export function getAffinityFactor(affinity: number): number {
  const stars = Math.floor(affinity / 20); // प्रति तारा 20 अंक, अधिकतम 5 तारे
  return 1.2 ** stars; // घातांकीय प्रगति
}
```

ये कारक हर `processGame` शुरुआत में पात्र stats पर लागू होते हैं। Kazuma खिलाड़ी के वैश्विक स्तर का पालन करता है, अन्य तीनों का अपना XP/स्तर है। आत्मीयता (किसी पात्र से जुड़े drop पाकर जीती) उसकी stats स्वतंत्र गुणा करती है।

![उपचार](/images/konosuba-rpg/shot_07_heal.webp)

drop तंत्र कठिनाई से भारित loot table इस्तेमाल करता है :

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

तीन सुइट : इकाई, perf, और leak।

leak परीक्षण विशेष रूप से सीधा है :

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

`processGame` के 1200 दोहराव, पहले और बाद में बाध्य GC, heap delta < 20MB। अगर यह परीक्षण पास होता है, तो `processGame` लीक नहीं करता। render परीक्षण (`renderImage.spec.ts`) बल्कि व्यावहारिक सीमा के नीचे निष्पादन समय जाँचता है।

पूरा पाइपलाइन profile करने के लिए `bench.ts` स्क्रिप्ट भी है :

```
RENDER_PERF=1 npx tsx bench.ts --runs=20 --warmup=3 --monster=Dragon
```

`RENDER_PERF=1` के साथ, हर service में `withPerf` wrapper timing log करता है :

```typescript
export async function withPerf(scope: string, label: string, work: () => Promise): Promise {
  const perf = createPerfLogger(scope);
  if (!perf.enabled) return work(); // निष्क्रिय होने पर zero overhead
  perf.mark(`${label}:start`);
  try { return await work(); }
  finally { perf.done(`${label}:done`); }
}
```

`createPerfLogger` no-op लौटाता है अगर `DEV_MODE` और `RENDER_PERF` `1` पर नहीं हैं। production में कोई overhead नहीं।

---

## इसे चलाने की लागत क्या है

- **Vercel free tier** : 100GB bandwidth, प्रति माह 1M serverless invocation। छवि render invocation गिना जाता है।
- **Cloudflare Workers free tier** : 100K अनुरोध/दिन, प्रति अनुरोध 10ms CPU time (WASM के कारण render Workers पर इससे पार कर सकता है, इसीलिए Vercel प्राथमिक)।
- **Supabase free tier** : 500MB आधार, 5GB bandwidth। हजारों खिलाड़ियों के लिए काफी।

पूरा backend महत्वपूर्ण आयतन तक शून्य लागत चलता है। एकमात्र घर्षण बिंदु Cloudflare Workers CPU सीमा है, छवि render WASM के कारण CPU गहन है, इसीलिए Vercel प्राथमिक और Workers failover CDN रणनीति है।

---

## 3 चीजें जो याद रखने योग्य हैं

1. **खेल स्थिति के रूप में URL** सिर्फ अच्छी चाल नहीं है, यह Discord थोपी बाधा है (बटन 100 अक्षर सीमा) जिसने fallback के रूप में RLE संपीड़न + सत्र token वाली stateless आर्किटेक्चर बाध्य की। बाधा ने डिजाइन तय किया।

2. **स्पष्ट निष्कासन वाला WASM cache** : `PhotonImage` JavaScript heap के बाहर आवंटित करते हैं और `.free()` के बिना कभी GC नहीं होंगे। LRU निष्कासन पर `freePhoton` जोड़ना JavaScript में RAII है। कोड में विवेकपूर्ण है, लेकिन इसके बिना worker production में लीक करेगा।

3. **बिना WebSocket serverless Discord बॉट** : यह WebSocket gateway दृष्टिकोण से कम ज्ञात है, लेकिन बॉट के लिए जो stateless प्रोसेसिंग करता है (हर interaction स्वतंत्र है), Interactions Endpoint कड़ाई से बेहतर है, कोई पुनः जुड़ाव नहीं, कोई heartbeat नहीं, बनाए रखने को कोई प्रक्रिया नहीं। Discord उनकी infra तरफ उपलब्धता संभालता है।

---

*Repo : [fox3000foxy/konosuba-rpg](https://github.com/fox3000foxy/konosuba-rpg)*

*कस्टम source-available लाइसेंस, कोई पुनर्वितरण नहीं, free to use।*
