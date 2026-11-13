---
title: "konosuba-rpg kodunu bir hafta sonu okudum ve işte bulduklarım"
description: "Her aksiyonun anında bir WebP görseli ürettiği sıra tabanlı bir Discord RPGsi:
  oyun durumu olarak URL, deterministik RNG, WASM pipelineı, 5 seviyeli önbellek,
  sunucusuz bot."
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
author_sig: "5QxJTmuH3Pv2lIC0G2XLW5NhuQ75hkQQGmQ8wh1FbRviDy0tFontFulooUaxqWCqm/QqOKaMFnr59hIuS4sLIQ=="
---

# konosuba-rpg kodunu bir hafta sonu okudum ve işte bulduklarım

Bu projeyi bir süredir sürdürüyorum ama kendi kodunu dinlenmiş kafayla yeniden okumak hep öğreticidir. konosuba-rpg her aksiyonun anında bir WebP görseli ürettiği sıra tabanlı bir Discord RPGsidir. Spritelar, can barları, savaş mesajlarıyla gerçek bir beste görseldir: hepsi.

Yığın: TypeScript, Hono, Vercel, Cloudflare Workers, Supabase. Tamamen ücretsiz barındırma. Ve Discord botu kalıcı sunucusuz çalışır. Bu yazı bütün bunların nasıl bir arada durduğunu açıklar.

![Oyunun başlangıç durumu](/images/konosuba-rpg/game_init.webp)

---

## Temel tasarım: oyun durumu olarak URL

İlk çarpan şey: oynanış için sunucu tarafında durum yoktur. Bir savaşın tam durumu URLdedir.

```
/konosuba-rpg/fr/abc123/ATK/DEF/ATK/HUG?monster=Vanir&difficulty=hard
```

Seedden sonraki her parça oynanmış bir aksiyondur. Sunucu bu URLyi alır, baştan başlar, tüm aksiyonları sırayla yeniden oynar ve o andaki savaşın bir görselini döndürür. Kullanıcıya bağlı RAMde oturum yok, durum yok.

Discord etkileşimli düğmelerle çalışır: oyuncu "Saldır"a bastığında Discord sunucuya düğmenin `custom_id` değerini gönderir. Bu custom_id yeni aksiyon eklenmiş savaşın sıkıştırılmış URLsini içerir. Sunucu her şeyi sıfırdan yeniden hesaplar ve güncellenmiş görseli döndürür.

```typescript
// processUrl.ts
const VALID_MOVES_SET = new Set(["ATK", "DEF", "HUG", "HEA", "SPE", "USE"]);
// Fonksiyon dışında önceden derlenmiş: her çağrıda yeniden oluşturulmaz

export default function processUrl(url: string): [Random, string[], string, string | null, string | null] {
  const urlParts = url.split("/");
  const moves: string[] = [];
  for (const part of urlParts) {
    if (VALID_MOVES_SET.has(part.toUpperCase())) moves.push(part.toUpperCase());
  }
  // seed = 6. parça, 8096 değer üzerine hashlenmiş
  const seedStr = (urlParts[5] || "").toLowerCase();
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed + seedStr.charCodeAt(i)) % 8096;
  }
  return [new Random(seed), moves, seedStr, monster, difficulty];
}
```

Fonksiyon dışında önceden derlenmiş `Set` bir detaydır ama modüllerin yeniden değerlendirilebildiği bir edge bağlamında her çağrıda yapıyı yeniden inşa etmekten kaçınır.

### RNG: değiştirilmiş RC4

Rastgele üreteç PRNGye çevrilmiş bir RC4 uygulamasıdır (akış şifreleme algoritması).

```typescript
export class Random {
  private S: number[]; // 256 girdili tablo
  private i: number;
  private j: number;

  constructor(seed?: number) {
    this.S = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    let workingSeed = seed || Date.now();
    for (let i = 0; i < 256; i++) {
      j = (j + this.S[i] + (workingSeed & 0xff)) & 0xff;
      // S[i] ve S[j] takası
      [this.S[i], this.S[j]] = [this.S[j], this.S[i]];
      workingSeed >>>= 8;
    }
  }

  next(): number { /* ... */ }
  randint(min: number, max: number): number { /* ... */ }
  choice(array: T[]): T { /* ... */ }
}
```

Neden RC4? Çünkü doğru dağılımlı ve makul seed çakışma dirençli deterministik bir PRNGdir. Aynı seed = aynı sayı dizisi = her seferinde aynı savaş. Bu URLsi korunarak herhangi bir savaşın "yeniden oynanmasına" izin verir ve iki farklı sunucunun (Vercel + Cloudflare) aynı URL için tam aynı sonucu üretmesini garanti eder.

---

## Discordun 100 karakter limiti sorunu

Discord düğmelerin `custom_id` değerlerine 100 karakter limiti koyar. Birkaç düzine aksiyondan sonra bir savaş URLsi bu limiti rahat aşar.

Buna iki mekanizma yanıt verir.

### 1. Aksiyonların RLE sıkıştırması

Aksiyonlar tek karakterle kodlanır (`a`=saldırı, `d`=savunma, `h`=sarılma...) ve run-length encoding ile sıkıştırılır:

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

Basittir ama oyuncu Saldırı x10 spamladığında `aaaaaaaaaa` (10 karakter) ifadesinden `a10` (3 karakter) ifadesine geçer. Arayüzdeki "Saldır x4" ve "Saldır x10" düğmeleri tam bunun içindir: savaşı hızlandırırken payloadu iyi sıkıştırmak.

### 2. Sıkıştırma yetmeyince oturum jetonları

Sıkıştırılmış payload hâlâ çok uzunsa kısa bir jetonla veritabanında saklanır:

```typescript
// gameSessionService.ts
const TOKEN_PREFIX = "gs.";
const TOKEN_SIZE = 10; // "gs.aBcDeFgHiJ"

export async function encodeGameplayButtons(buttons: RawButton[]): Promise {
  // Payloadları battle_keye göre gruplar, Supabase toplu ekler
  // custom_id değerini "gs.{token}:{userId}" ile değiştirir
}

export async function decodeGameplayPayloadWithStatus(encodedPayload: string, userID: string) {
  if (!encodedPayload.startsWith(TOKEN_PREFIX)) {
    return { payload: encodedPayload }; // gerek yoksa arama yok
  }
  // Önce bellekten arama, yoksa Supabase
  const cached = tokenToSession.get(token) || await loadTokenRowByToken(token);
  // Sahiplik, TTL (7 gün) ve turn_version doğrular (eski bir durumu yeniden oynatmayı engeller)
}
```

Oturumların 7 günlük TTLsi ve 10 dakikada bir otomatik temizliği vardır. `turnVersion` doğrulaması oyuncu oyunda ilerlediyse eski bir durumu yeniden oynatmayı engeller: kazara "geri dön"e karşı gizli bir koruma.

Bellekteki iki Map (`tokenToSession`, `latestTurnByBattle`) aşağıda göreceğimiz nedenlerle görsel önbellekleriyle aynı `globalThis as unknown as GameSessionGlobals` desenini kullanır.

---

## Görsel render pipelineı

![Bir Slime karşı savaş başlangıcı](/images/konosuba-rpg/shot_01_start.webp)

`/konosuba-rpg/:lang/*` rotası JSON döndürmez. İstek üzerine üretilmiş bir WebP görseli döndürür.

Pipeline 3 bestenmiş katmanda organize edilir:

```
Background (board + frame)
    +
Characters layer (oyuncu + mob spriteları, sabit konumlar)
    +
UI overlay (Satori → SVG → PNG üzerinden can barları, mesajlar, kişisel ikonlar)
    ↓
Photon.watermark() × 2
    ↓
WebP çıktısı
```

**Background**: iki sabit görsel (tahta ve çerçeve), dosya sisteminden yüklenir ve bir kez bestenir.

**Characters layer**: spritelar hesaplanan koordinatlara göre konumlandırılır. Ölü oyuncular hariç tutulur (`activeSlots = slots.filter(s => playerHp[s.i] > 0)`). Düşman spriteları harici bağımlılık yerine özel bir `flipX` ile yatay aynalanır: piksel piksel bir döngü.

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

**UI overlay**: ağır kısımdır bu. Arayüzün JSXsi (can barları, metinler, ikonlar) Satori ile React benzeri tanımlanır, SVG olarak renderlanır, `@cf-wasm/resvg` ile PNGye çevrilir, sonra final beste için Photona içe aktarılır. Satori + resvg, `edge-light` bayrağıyla Cloudflare Workers için özel derlenmiş iki WASM modülüdür.

![Savunma Aksiyonu](/images/konosuba-rpg/shot_03_defend.webp)

![Devam eden savaş](/images/konosuba-rpg/shot_02_combat.webp)

![Sarılma Aksiyonu](/images/konosuba-rpg/shot_04_hug.webp)

---

## Önbellek sistemi: en çok işlenen kısım

5 ayrı önbellek seviyesi vardır. Her biri pipelineın farklı bir ayrıntı düzeyini hedefler.

```typescript
// renderImage.ts -- hepsi globalThis üzerinde
G.__imageCache  ??= {} as Record; // ham assetler
G.__base64Cache ??= {} as Record;       // assetlerin base64si (Satori için)
G.__fontCache   ??= {} as Record; // yazı tipleri
G.__photonCache    ??= new LRUCache(40, freePhoton);
G.__layerCache     ??= new LRUCache(12, freePhoton);
G.__uiPhotonCache  ??= new LRUCache(30, freePhoton);
G.__renderOutputCache ??= new LRUCache(120);
```

`globalThis` üzerindeki `??=` deseni: bazı yapılandırmalarda edge workerlardaki JavaScript modülleri istekler arasında yeniden değerlendirilebilir. Önbellekleri `??=` ile `globalThis` üzerinde saklamak yeniden oluşturulmadan bu yeniden değerlendirmelerden sağ çıkmalarını garanti eder.

### WASM tahliyesi

Photon görsel önbellekleri (`photonCache`, `layerCache`, `uiPhotonCache`) bir tahliye geri çağrısı kullanır:

```typescript
function freePhoton(_key: string, img: Photon.PhotonImage): void {
  try { img.free(); } catch { /* zaten serbest */ }
}

new LRUCache(40, freePhoton)
```

`Photon.PhotonImage`, JavaScript çöp toplayıcının dışında doğrusal WASM tarafında ayrılmış belleği olan bir WASM nesnesidir. Bu bellek `.free()` açıkça çağrılana kadar ayrılmış kalır. LRU tahliyesi `.free()` fonksiyonunu otomatik tetikler: bu JavaScriptte taşınmış RAII dir.

### Önbellek anahtarları bilinçli kayıplıdır

```typescript
function buildCharactersKey(playerImages: string[][], playerHp: number[], creatureImages: string[], creatureHp: number): string {
  const players = playerImages.map((imgs, i) => `${imgs[0]}:${playerHp[i] > 0 ? 1 : 0}`).join("|");
  return `chars::${players}::${creatureImages[0]}:${creatureHp > 0 ? 1 : 0}`;
}
```

Characters katmanı anahtarı HPnin tam değerini kodlamaz: sadece `1` (canlı) ya da `0` (ölü). Çünkü 40 HPli bir oyuncunun spriti ile 15 HPli bir oyuncunun spriti aynıdır. Kimse düşmediği sürece bir önbellek isabeti her hasarda hayatta kalır.

UI anahtarı ise tam HPleri (can barı her vuruşta değişir) ve mesajların bir hashini kodlar:

```typescript
function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0; // 32-bit işaretli tam sayı
  }
  return hash.toString(16);
}
```

`Math.imul` çarpmayı 32 bit tam sayıda zorlar, bu float64 dönüşümlerini engeller ve kararlı bir polinom hash verir. Bunun için harici bağımlılık eklemekten kaçınır.

### Yığın taşmasız base64 dönüşümü

```typescript
function getBase64Cached(key: string, buf: ArrayBuffer): string {
  if (base64Cache[key]) return base64Cache[key];
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000; // 32768 bayt
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  const b64 = btoa(binary);
  base64Cache[key] = b64;
  return b64;
}
```

`String.fromCharCode(...largeArray)` argümanlar çağrı yığınından geçirildiği için büyük görsellerde yığın taşmasına neden olabilir. 32KB parçalama bunu engeller. Sonuç önbelleğe alınır: aynı görselin base64 dönüşümü worker örneği başına bir kez yapılır.

---

## STRIPPER.md: sıralı await denetimi

Depoda sıralı `await`lerin paralelleştirme denetimini belgeleyen bir `STRIPPER.md` dosyası vardır. İçinde kaydedilenlerden birkaç örnek:

- Oyuncu profili yükleme Supabase 3 seri istek yapıyordu (ilerleme, run özeti, başarımlar). `Promise.all` içine alındı: aralarında bağımlılık yok.
- Savaş sonu ödül dağıtımı (aksesuarlar + tüketilebilirler) sıralıydı. Aynı şekilde paralelleştirildi.
- Düğmeler için oturum jetonu oluşturma grup grup yapılıyordu. Bağımsız gruplar artık paralel oluşturuluyor.

```typescript
// progressionService.ts -- önce (sıralı)
await grantAccessoryDropRewards(...);
await grantConsumableDropRewards(...);

// sonra
await Promise.all([
  grantAccessoryDropRewards(...),
  grantConsumableDropRewards(...),
]);
```

Devrimci bir şey yok ama yanıt süresinin her milisaniyesinin faturalandığı (ya da soğuk başlatmaya katkıda bulunduğu) sunucusuz bir bağlamda bu önemlidir.

---

## Kalıcı sunucusuz Discord botu

![Zafer](/images/konosuba-rpg/shot_05_win.webp)

Sık yanlış anlaşılan nokta: bir Discord botu illa kalıcı bir WebSocket bağlantısı gerektirmez. Discord bir alternatif sunar: **Interactions Endpoint URL**. Discorda bir HTTPS URL verirsin ve Discord her etkileşim için sana bir POST gönderir (slash komutu, düğme, otomatik tamamlama).

```typescript
// interactions.ts
export async function handleInteractions(c: Context) {
  const body = await c.req.text();
  const isVerified = await verifySignature(c, body); // Ed25519
  if (!isVerified) return c.text("Invalid signature", 401);

  const interaction: Interaction = JSON.parse(body);
  if (interaction.type === 1) return c.json({ type: 1 }); // Discord pingi
  if (interaction.type === 2) return handleSlashCommand(...);
  if (interaction.type === 3) return handleButtonInteraction(...);
  if (interaction.type === 4) return handleAutocomplete(...);
}
```

Discord bir POST gönderir, handler bir Vercel fonksiyonu ya da Cloudflare Worker üzerinde 50-200 ms döner, yanıtlar ve biter. Bakımı yapılacak kalıcı bağlantı yok, açık tutulacak sunucu yok. Discord botunun tamamı Vercel ücretsiz katmanında barındırılır.

Ed25519 doğrulaması (`discord-interactions` içinden `verifyKey`) zorunludur: Discord başlıklarda doğrulaman gereken bir imza gönderir, yoksa endpointi reddeder.

### Özel animasyon: tek bilinçli await

```typescript
// handleSpecialButton.ts
await new Promise(resolve => setTimeout(resolve, 3000)); // 3 saniye
await fetch(`${DISCORD_API_URL}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
  method: "PATCH",
  // ...
});
```

Bu 3 saniyelik bilinçli gecikme STRIPPER.md içinde kasıtlı olarak belgelenmiştir. Meguminin özel saldırısının (Explosion) Discord tarafında bir animasyonu vardır: mesaj önce ara bir görselle güncellenir, sonra 3 saniye sonra sonuçla değiştirilir. Bir Vercel fonksiyonunun gerekenden bilinçli uzun döndüğü tek durum budur.

![Özel saldırı](/images/konosuba-rpg/shot_08_special.webp)

---

## İki platforma dağıtılabilirlik

Aynı kod tabanı değişiklik olmadan Vercel (Node.js) ve Cloudflare Workers (V8 isolate) üzerinde döner:

```typescript
// worker.ts -- Cloudflare giriş noktası
export default {
  fetch(request: Request, env: WorkerBindings): Promise {
    syncBindingsToProcessEnv(env); // CF sırlarını process.enve enjekte eder
    return app.fetch(request, env, ctx);
  }
};

// index.ts -- Vercel/Node giriş noktası
const isVercelRuntime = process.env.VERCEL === "1";
if (!isVercelRuntime) { start(); }
```

Ana fark: statik assetler. Vercelde dosya sisteminden okunur (`/var/task/assets/`). Cloudflare Workerlarda bir `ASSETS` bindingi üzerinden geçer (CF statik assetleri) ve bir HTTPS aynasına yedeklenir (`fox3000foxy.com/konosuba-rpg/assets`). `assetLoader.ts` içindeki `getAssetBytes` önce dosya sistemini deneyerek iki yolu yönetir, sonra fetch.

WASMler (`@cf-wasm/photon/edge-light`, `@cf-wasm/resvg`) her çalışma ortamı için ayrı derlemelere sahiptir. Paket adındaki `edge-light` bayrağı Cloudflare Workers uyumlu derlemeyi belirtir; çalışma anında `new WebAssembly.Module()` izin vermez: WASM önceden derlenmiş olmalıdır.

---

## İlerleme: XP, seviyeler, yakınlık

![Bir boss, 650 HP](/images/konosuba-rpg/shot_06_boss.webp)

Meta ilerleme Supabase ücretsiz katmanına dayanır. Şema `players` tablosu (global XP, seviye, altın), `character_progress` (Darkness, Aqua, Megumin için karakter başına XP/seviye/yakınlık), `runs` (savaş tarihçesi), `inventory_items`, `daily_quests_progress`, `achievements_unlocked`, `game_sessions` içerir.

İlerleme modeli basittir:

```typescript
// characterService.ts
export function computeLevelFromXp(xp: number): number {
  return Math.floor(xp / 100) + 1; // seviye başına 100 XP
}

export function getLevelFactor(level: number): number {
  return 1 + 0.2 * (level - 1); // seviye başına +%20 istatistik
}

export function getAffinityFactor(affinity: number): number {
  const stars = Math.floor(affinity / 20); // yıldız başına 20 puan, maksimum 5 yıldız
  return 1.2 ** stars; // üstel ilerleme
}
```

Bu çarpanlar her `processGame` başında karakter istatistiklerine uygulanır. Kazuma oyuncunun global seviyesini izler, diğer üçünün her birinin kendi XP/seviyesi vardır. Yakınlık (bir karaktere bağlı dropları alarak kazanılır) istatistiklerini bağımsız çarpar.

![İyileşme](/images/konosuba-rpg/shot_07_heal.webp)

Drop sistemi zorluğa göre ağırlıklı ganimet tabloları kullanır:

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
  // ...Legendarye kadar
};
```

---

## Testler

Üç paket: birim, performans ve sızıntı.

Sızıntı testi özellikle nettir:

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
  expect(after - before).toBeLessThan(20); // maksimum 20MB heap büyümesi
});
```

1200 `processGame` yinelemesi, önce ve sonra zorla GC, heap farkı < 20MB. Bu test geçerse `processGame` sızdırmaz. Render testi (`renderImage.spec.ts`) daha çok pratik bir eşik altında çalışma süresini doğrular.

Tam pipelineı profilleyen bir `bench.ts` scripti de vardır:

```
RENDER_PERF=1 npx tsx bench.ts --runs=20 --warmup=3 --monster=Dragon
```

`RENDER_PERF=1` ile her servisteki `withPerf` sarmalayıcı zamanlamaları loglar:

```typescript
export async function withPerf(scope: string, label: string, work: () => Promise): Promise {
  const perf = createPerfLogger(scope);
  if (!perf.enabled) return work(); // devre dışıyken sıfır maliyet
  perf.mark(`${label}:start`);
  try { return await work(); }
  finally { perf.done(`${label}:done`); }
}
```

`createPerfLogger`, `DEV_MODE` ve `RENDER_PERF` `1` değilse no-op döndürür. Üretimde maliyet yok.

---

## Çalıştırmanın maliyeti nedir

- **Vercel ücretsiz katmanı**: 100GB bant genişliği, ayda 1M sunucusuz çağrı. Görsel render bir çağrı sayılır.
- **Cloudflare Workers ücretsiz katmanı**: günde 100 bin istek, istek başına 10 ms CPU süresi (render WASM yüzünden Workerlarda bunu aşabilir, o yüzden birincil Vercel).
- **Supabase ücretsiz katmanı**: 500MB veritabanı, 5GB bant genişliği. Binlerce oyuncu için yeterli.

Backendin tamamı anlamlı bir hacme kadar sıfır maliyetle döner. Tek sürtünme noktası Cloudflare Workers CPU limitidir: görsel render WASM yüzünden CPU yoğundur, o yüzden birincil Vercel ve yedek CDN olarak Workers stratejisi.

---

## Akılda tutulmaya değer 3 şey

1. **Oyun durumu olarak URL** sadece hoş bir numara değildir: Discordun dayattığı bir kısıtlamadır (düğmelerde 100 karakter limiti) ve yedek olarak RLE sıkıştırma + oturum jetonlu stateless bir mimariyi zorunlu kılmıştır. Kısıtlama tasarımı dikte etmiştir.

2. **Açık tahliyeli WASM önbelleği**: `PhotonImage` nesneleri JavaScript heapinin dışında yer ayırır ve `.free()` olmadan asla GClenmez. `freePhoton` fonksiyonunu LRU tahliyesine bağlamak JavaScriptte RAII dir. Kodda gizlidir ama o olmadan worker üretimde sızdırırdı.

3. **WebSocketsiz sunucusuz bir Discord botu**: WebSocket gateway yaklaşımından daha az bilinir ama stateless işlem yapan bir bot için (her etkileşim bağımsızdır) Interactions Endpoint kesinlikle üstündür: yeniden bağlanma yok, heartbeat yok, bakımı yapılacak süreç yok. Discord kullanılabilirliği kendi altyapısı tarafında yönetir.

---

*Repo: [fox3000foxy/konosuba-rpg](https://github.com/fox3000foxy/konosuba-rpg)*

*Özel kaynak mevcut lisans: yeniden dağıtım yok, kullanımı ücretsiz.*
