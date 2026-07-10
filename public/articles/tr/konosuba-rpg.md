---
title: "Bir hafta sonumu konosuba-rpg'nin kodunu okuyarak geçirdim ve işte bulduklarım"
description: "Her eylemin anında WebP görüntüsü oluşturduğu sıra tabanlı bir Discord RPG'si:
  URL oyun durumu olarak, deterministik RNG, WASM hattı, 5 seviyeli önbellek,
  sunucusuz bot."
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
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "KZ4sQvKukPiOLMS2maH6DuWTq5ktguq9fYh0G4fITejxS9fSKwqJmW3n7S0rx3880tRP5SyQT//9kq6/0dCg3g=="
---

# Bir hafta sonumu konosuba-rpg'nin kodunu okuyarak geçirdim ve işte bulduklarım

Bu projeyi bir süredir ben sürdürüyorum, ama kendi kodunu sakin kafayla yeniden okumak her zaman öğreticidir. konosuba-rpg, her eylemin anında WebP görüntüsü oluşturduğu sıra tabanlı bir Discord RPG'si. Bir metin embed'i değil. Sprite'ları, can çubukları, savaş mesajları -- her şeyiyle gerçek bir görüntü.

Stack: TypeScript, Hono, Vercel, Cloudflare Workers, Supabase. Tamamen ücretsiz barındırma. Ve Discord botu kalıcı bir sunucu olmadan çalışıyor. Bu yazı her şeyin nasıl bir arada durduğunu açıklıyor.

![Oyunun başlangıç durumu](/images/konosuba-rpg/game_init.webp)

---

## Temel tasarım: oyun durumu olarak URL

İlk dikkat çeken şey: oynanış için sunucu tarafında hiçbir durum yok. Bir savaşın tüm durumu URL'nin içinde.

```
/konosuba-rpg/fr/abc123/ATK/DEF/ATK/HUG?monster=Vanir&difficulty=hard
```

Seed'den sonraki her segment oynanan bir eylemdir. Sunucu bu URL'yi alır, baştan başlar, tüm eylemleri sırayla yeniden oynar ve o anki savaşın görüntüsünü döndürür. Oturum yok, kullanıcıya bağlı RAM'de durum yok.

Discord etkileşimli düğmelerle çalışır -- oyuncu "Saldır"a bastığında, Discord düğmenin `custom_id`'sini sunucuya gönderir. Bu custom_id, yeni eylem eklenmiş savaşın sıkıştırılmış URL'sini içerir. Sunucu her şeyi sıfırdan yeniden hesaplar ve güncellenmiş görüntüyü döndürür.

```typescript
// processUrl.ts
const VALID_MOVES_SET = new Set(["ATK", "DEF", "HUG", "HEA", "SPE", "USE"]);
// Fonksiyon dışında önceden derlenmiş -- her çağrıda yeniden oluşturulmaz

export default function processUrl(url: string): [Random, string[], string, string | null, string | null] {
  const urlParts = url.split("/");
  const moves: string[] = [];
  for (const part of urlParts) {
    if (VALID_MOVES_SET.has(part.toUpperCase())) moves.push(part.toUpperCase());
  }
  // seed = 6. segment, 8096 değere hash'lenir
  const seedStr = (urlParts[5] || "").toLowerCase();
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed + seedStr.charCodeAt(i)) % 8096;
  }
  return [new Random(seed), moves, seedStr, monster, difficulty];
}
```

Fonksiyon dışında önceden derlenmiş `Set` küçük bir detay, ancak modüllerin yeniden değerlendirilebildiği bir edge bağlamında yapının her çağrıda yeniden oluşturulmasını önler.

### RNG: Değiştirilmiş RC4

Rastgele üreteç, bir PRNG'ye dönüştürülmüş bir RC4 (stream şifreleme algoritması) uygulamasıdır.

```typescript
export class Random {
  private S: number[]; // 256 girişlik tablo
  private i: number;
  private j: number;

  constructor(seed?: number) {
    this.S = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    let workingSeed = seed || Date.now();
    for (let i = 0; i < 256; i++) {
      j = (j + this.S[i] + (workingSeed & 0xff)) & 0xff;
      // S[i] ve S[j]'yi takas et
      [this.S[i], this.S[j]] = [this.S[j], this.S[i]];
      workingSeed >>>= 8;
    }
  }

  next(): number { /* ... */ }
  randint(min: number, max: number): number { /* ... */ }
  choice(array: T[]): T { /* ... */ }
}
```

Neden RC4? Çünkü iyi bir dağılıma ve makul seed çarpışma direncine sahip deterministik bir PRNG'dir. Aynı seed = aynı sayı dizisi = her seferinde aynı savaş. Bu, herhangi bir savaşı URL'sini koruyarak "yeniden oynatmayı" sağlar ve iki farklı sunucunun (Vercel + Cloudflare) aynı URL için tam olarak aynı sonucu üretmesini garanti eder.

---

## Discord 100 karakter sınırı sorunu

Discord, düğmelerin `custom_id`'si için 100 karakter sınırı koyar. Birkaç düzine eylemden sonra, bir savaş URL'si bu sınırı rahatça aşar.

Buna yanıt veren iki mekanizma var.

### 1. Eylemlerin RLE sıkıştırması

Eylemler tek bir karakterle kodlanır (`a`=saldırı, `d`=savunma, `h`=sarılmak...) ve run-length encoding ile sıkıştırılır:

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

Basit, ancak oyuncu üst üste 10 Saldırı yaptığında `aaaaaaaaaa` (10 karakter) `a10`'a (3 karakter) dönüşür. UI'daki "x4 Saldır" ve "x10 Saldır" düğmeleri tam da bunun için vardır -- savaşı hızlandırırken payload'u iyi sıkıştırır.

### 2. Sıkıştırma yeterli olmadığında oturum token'ları

Sıkıştırılmış payload hâlâ çok uzunsa, veritabanında kısa bir token ile saklanır:

```typescript
// gameSessionService.ts
const TOKEN_PREFIX = "gs.";
const TOKEN_SIZE = 10; // "gs.aBcDeFgHiJ"

export async function encodeGameplayButtons(buttons: RawButton[]): Promise {
  // Payload'ları battle_key'e göre grupla, Supabase'e toplu ekle
  // custom_id'yi "gs.{token}:{userId}" ile değiştir
}

export async function decodeGameplayPayloadWithStatus(encodedPayload: string, userID: string) {
  if (!encodedPayload.startsWith(TOKEN_PREFIX)) {
    return { payload: encodedPayload }; // Gerekli değilse lookup yapma
  }
  // Önce bellekten, sonra Supabase'den lookup
  const cached = tokenToSession.get(token) || await loadTokenRowByToken(token);
  // Sahiplik, TTL (7 gün) ve turn_version kontrolü (eski durumu yeniden oynatmayı önler)
}
```

Oturumların TTL'si 7 gündür ve her 10 dakikada bir otomatik temizlik yapılır. `turnVersion` kontrolü, oyuncu ilerlemişse eski bir durumun yeniden oynatılmasını engeller -- kazara "geri gitmeye" karşı gizli bir koruma.

Bellekteki iki `Map` (`tokenToSession`, `latestTurnByBattle`), görüntü önbellekleriyle aynı `globalThis as unknown as GameSessionGlobals` desenini kullanır, aşağıda göreceğimiz nedenlerle.

---

## Görüntü işleme hattı

![Bir Slime'a karşı savaş başlangıcı](/images/konosuba-rpg/shot_01_start.webp)

`/konosuba-rpg/:lang/*` rotası JSON döndürmez. İsteğe bağlı oluşturulmuş bir WebP görüntüsü döndürür.

İşleme hattı 3 bileşik katman halinde düzenlenmiştir:

```
Background (tahta + çerçeve)
    +
Characters layer (oyuncu sprite'ları + mob, sabit konumlar)
    +
UI overlay (can çubukları, mesajlar, Satori ile karakter simgeleri → SVG → PNG)
    ↓
Photon.watermark() × 2
    ↓
WebP çıktısı
```

**Background** : iki sabit görüntü (tahta ve çerçeve), dosya sisteminden yüklenir ve bir kez birleştirilir.

**Characters layer** : sprite'lar hesaplanmış koordinatlara göre konumlandırılır. Ölü oyuncular hariç tutulur (`activeSlots = slots.filter(s => playerHp[s.i] > 0)`). Düşman sprite'ları özel bir `flipX` ile yatay olarak yansıtılır -- harici bir bağımlılık yerine piksel piksel bir döngü.

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

**UI overlay** : ağır kısım. Arayüzün JSX'i (can çubukları, metinler, simgeler) React benzeri Satori ile tanımlanır, SVG'ye dönüştürülür, `@cf-wasm/resvg` ile PNG'ye çevrilir ve son birleştirme için Photon'a aktarılır. Satori + resvg, Cloudflare Workers için `edge-light` flag'i ile özel olarak derlenmiş iki WASM modülüdür.

![Savunma Eylemi](/images/konosuba-rpg/shot_03_defend.webp)

![Devam eden savaş](/images/konosuba-rpg/shot_02_combat.webp)

![Sarılmak Eylemi](/images/konosuba-rpg/shot_04_hug.webp)

---

## Önbellek sistemi -- en çok üzerinde çalışılan kısım

Her biri hattın farklı bir ayrıntı düzeyini hedefleyen 5 ayrı önbellek seviyesi vardır.

```typescript
// renderImage.ts -- hepsi globalThis üzerinde
G.__imageCache  ??= {} as Record; // ham varlıklar
G.__base64Cache ??= {} as Record;       // varlıkların base64'ü (Satori için)
G.__fontCache   ??= {} as Record; // yazı tipleri
G.__photonCache    ??= new LRUCache(40, freePhoton);
G.__layerCache     ??= new LRUCache(12, freePhoton);
G.__uiPhotonCache  ??= new LRUCache(30, freePhoton);
G.__renderOutputCache ??= new LRUCache(120);
```

`globalThis` üzerinde `??=` deseni: edge worker'lardaki JavaScript modülleri, bazı yapılandırmalarda istekler arasında yeniden değerlendirilebilir. Önbellekleri `??=` ile `globalThis` üzerinde saklamak, yeniden oluşturulmadan bu yeniden değerlendirmelerden kurtulmalarını sağlar.

### WASM tahliyesi

Photon görüntü önbellekleri (`photonCache`, `layerCache`, `uiPhotonCache`) bir tahliye geri çağrısı kullanır:

```typescript
function freePhoton(_key: string, img: Photon.PhotonImage): void {
  try { img.free(); } catch { /* zaten serbest bırakıldı */ }
}

new LRUCache(40, freePhoton)
```

`Photon.PhotonImage`, JavaScript GC'sinin dışında, WASM doğrusal belleği tarafında tahsis edilmiş belleği olan bir WASM nesnesidir. Açık `.free()` çağrısı olmadan bu bellek asla serbest kalmaz. LRU tahliyesi `.free()`'i otomatik olarak tetikler -- bu JavaScript'e taşınmış RAII'dir.

### Önbellek anahtarları bilerek kayıplıdır

```typescript
function buildCharactersKey(playerImages: string[][], playerHp: number[], creatureImages: string[], creatureHp: number): string {
  const players = playerImages.map((imgs, i) => `${imgs[0]}:${playerHp[i] > 0 ? 1 : 0}`).join("|");
  return `chars::${players}::${creatureImages[0]}:${creatureHp > 0 ? 1 : 0}`;
}
```

Karakter katmanı anahtarı, HP'nin tam değerini kodlamaz -- sadece `1` (canlı) veya `0` (ölü). Çünkü 40 HP'lik bir oyuncunun sprite'ı ile 15 HP'lik bir oyuncunun sprite'ı aynıdır. Bu nedenle önbellek isabeti, kimse ölmediği sürece herhangi bir hasardan sağ çıkar.

UI anahtarı ise tam HP'yi (can çubuğu her vuruşta değişir) ve mesajların bir hash'ini kodlar:

```typescript
function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0; // 32-bit işaretli tam sayı
  }
  return hash.toString(16);
}
```

`Math.imul`, çarpmayı 32-bit tam sayıya zorlar, bu da float64 dönüşümlerini önler ve kararlı bir polinom hash'i verir. Bunun için harici bir bağımlılık yoktur.

### Stack taşması olmadan base64 dönüşümü

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

`String.fromCharCode(...largeArray)`, büyük görüntülerde stack taşmasına neden olabilir çünkü argümanlar çağrı yığınından geçirilir. 32KB'lik parçalama bunu önler. Sonuç önbelleğe alınır -- aynı görüntünün base64 dönüşümü, worker örneği başına yalnızca bir kez yapılır.

---

## STRIPPER.md -- sıralı await denetimi

Repoda, `await`'leri paralelleştirme denetimini belgeleyen bir `STRIPPER.md` dosyası var. Kaydedilenlerden birkaç örnek:

- Oyuncu profili yüklemesi, Supabase'e 3 sıralı sorgu yapıyordu (ilerleme, koşu özeti, başarımlar). Aralarında bağımlılık olmadığı için `Promise.all`'a dönüştürüldü.
- Savaş sonu ödül dağıtımı (aksesuarlar + sarf malzemeleri) sıralıydı. Aynı şekilde paralelleştirildi.
- Düğmeler için oturum token'ı oluşturma grup grup yapılıyordu. Bağımsız gruplar artık paralel oluşturuluyor.

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

Devrim niteliğinde bir şey değil, ancak her milisaniyelik yanıt süresinin faturalandırıldığı (veya cold start'a katkıda bulunduğu) sunucusuz bir bağlamda bu önemlidir.

---

## Kalıcı sunucu olmadan Discord botu

![Zafer](/images/konosuba-rpg/shot_05_win.webp)

Sıkça yanlış anlaşılan bir nokta: bir Discord botu mutlaka kalıcı bir WebSocket bağlantısı gerektirmez. Discord bir alternatif sunar: **Interactions Endpoint URL**. Discord'a bir HTTPS URL'si sağlarsınız ve Discord her etkileşim için (slash komutu, düğme, otomatik tamamlama) size bir POST gönderir.

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

Discord bir POST gönderir, işleyici bir Vercel fonksiyonu veya Cloudflare Worker üzerinde 50-200ms çalışır, yanıt verir ve biter. Kalıcı bağlantı yok, açık tutulacak sunucu yok. Botun tamamı Vercel free tier'da barındırılır.

Ed25519 doğrulaması (`discord-interactions`'dan `verifyKey`) zorunludur -- Discord, başlıklarda doğrulamanız gereken bir imza gönderir, aksi takdirde endpoint'i reddeder.

### Özel animasyon -- tek kasıtlı await

```typescript
// handleSpecialButton.ts
await new Promise(resolve => setTimeout(resolve, 3000)); // 3 saniye
await fetch(`${DISCORD_API_URL}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
  method: "PATCH",
  // ...
});
```

Bu 3 saniyelik kasıtlı gecikme, STRIPPER.md'de kasıtlı olarak belgelenmiştir. Megumin'in özel saldırısı (Patlama) Discord tarafında bir animasyona sahiptir -- mesaj önce ara bir görselle güncellenir, ardından 3 saniye sonra sonuçla değiştirilir. Bu, bir Vercel fonksiyonunun gereğinden uzun çalıştığı tek durumdur.

![Özel saldırı](/images/konosuba-rpg/shot_08_special.webp)

---

## İki platformda dağıtılabilirlik

Aynı kod tabanı, değişiklik yapılmadan Vercel (Node.js) ve Cloudflare Workers (V8 isolates) üzerinde çalışır:

```typescript
// worker.ts -- Cloudflare giriş noktası
export default {
  fetch(request: Request, env: WorkerBindings): Promise {
    syncBindingsToProcessEnv(env); // CF sırlarını process.env'e enjekte eder
    return app.fetch(request, env, ctx);
  }
};

// index.ts -- Vercel/Node giriş noktası
const isVercelRuntime = process.env.VERCEL === "1";
if (!isVercelRuntime) { start(); }
```

Temel fark: statik varlıklar. Vercel'de dosya sisteminden okunur (`/var/task/assets/`). Cloudflare Workers'ta, bir HTTPS mirror'a (`fox3000foxy.com/konosuba-rpg/assets`) geri dönüşlü `ASSETS` binding'inden (CF statik varlıkları) geçerler. `assetLoader.ts` içindeki `getAssetBytes`, önce dosya sistemini, ardından fetch'i deneyerek her iki yolu da yönetir.

WASM'ler (`@cf-wasm/photon/edge-light`, `@cf-wasm/resvg`) her çalışma zamanı için ayrı derlemelere sahiptir. Paket adındaki `edge-light` flag'i, çalışma zamanında `new WebAssembly.Module()`'e izin vermeyen Cloudflare Workers uyumlu derlemeyi belirtir -- WASM önceden derlenmiş olmalıdır.

---

## İlerleme: XP, seviyeler, yakınlık

![Bir patron, 650 HP](/images/konosuba-rpg/shot_06_boss.webp)

Meta-ilerleme Supabase free tier'a dayanır. Şema; `players` (genel XP, seviye, altın), `character_progress` (Darkness, Aqua, Megumin için karakter başına XP/seviye/yakınlık), `runs` (savaş geçmişi), `inventory_items`, `daily_quests_progress`, `achievements_unlocked`, `game_sessions` tablolarını içerir.

İlerleme modeli basittir:

```typescript
// characterService.ts
export function computeLevelFromXp(xp: number): number {
  return Math.floor(xp / 100) + 1; // Seviye başına 100 XP
}

export function getLevelFactor(level: number): number {
  return 1 + 0.2 * (level - 1); // Seviye başına +%20 stat
}

export function getAffinityFactor(affinity: number): number {
  const stars = Math.floor(affinity / 20); // Yıldız başına 20 puan, maksimum 5 yıldız
  return 1.2 ** stars; // üstel ilerleme
}
```

Bu faktörler, her `processGame` başlangıcında karakter istatistiklerine uygulanır. Kazuma, oyuncunun genel seviyesini takip eder; diğer üçünün her birinin kendi XP/seviyesi vardır. Yakınlık (bir karakterle ilgili drop'ları toplayarak kazanılır) istatistiklerini bağımsız olarak çarpar.

![İyileştirme](/images/konosuba-rpg/shot_07_heal.webp)

Drop sistemi, zorluğa göre ağırlıklandırılmış ganimet tabloları kullanır:

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
  // ...Legendary'e kadar
};
```

---

## Testler

Üç takım: birim, performans ve sızıntı.

Sızıntı testi özellikle doğrudandır:

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

1200 `processGame` yinelemesi, öncesi ve sonrası zorunlu GC, heap delta < 20MB. Bu test geçerse, `processGame` sızdırmıyordur. Render testi (`renderImage.spec.ts`) ise çalışma süresini pratik bir eşiğin altında kontrol eder.

Ayrıca tüm hattı profillemek için bir `bench.ts` betiği vardır:

```
RENDER_PERF=1 npx tsx bench.ts --runs=20 --warmup=3 --monster=Dragon
```

`RENDER_PERF=1` ile, her servisteki `withPerf` sarmalayıcısı zamanlamaları kaydeder:

```typescript
export async function withPerf(scope: string, label: string, work: () => Promise): Promise {
  const perf = createPerfLogger(scope);
  if (!perf.enabled) return work(); // devre dışıysa sıfır ek yük
  perf.mark(`${label}:start`);
  try { return await work(); }
  finally { perf.done(`${label}:done`); }
}
```

`createPerfLogger`, `DEV_MODE` ve `RENDER_PERF` `1` değilse no-op'lar döndürür. Üretimde hiçbir ek yük yoktur.

---

## Çalıştırmanın maliyeti

- **Vercel free tier** : ayda 100GB bant genişliği, 1M sunucusuz çağrı. Görüntü oluşturma bir çağrı olarak sayılır.
- **Cloudflare Workers free tier** : günde 100K istek, istek başına 10ms CPU süresi (render Workers'ta bunu aşabilir, bu nedenle Vercel birincil).
- **Supabase free tier** : 500MB veritabanı, 5GB bant genişliği. Binlerce oyuncu için yeterlidir.

Tüm backend, önemli bir hacme kadar sıfır maliyetle çalışır. Tek sürtüşme noktası, Cloudflare Workers'ın CPU sınırıdır -- görüntü oluşturma, WASM nedeniyle CPU yoğunlukludur, bu nedenle Vercel'in birincil, Workers'ın ise CDR yedeklemesi stratejisi.

---

## Hatırlanmaya değer 3 şey

1. **Oyun durumu olarak URL** sadece hoş bir numara değil -- Discord tarafından dayatılan bir kısıtlamadır (düğmelerin 100 karakter sınırı vardır) ve RLE sıkıştırma + yedek olarak oturum token'ı ile durumsuz bir mimariyi zorunlu kılmıştır. Kısıtlama tasarımı belirlemiştir.

2. **Açık tahliyeli WASM önbelleği**: `PhotonImage`'ler JavaScript heap'inin dışında bellek ayırır ve `.free()` olmadan asla GC edilmez. `freePhoton`'u LRU tahliyesine bağlamak, JavaScript'te RAII'dir. Kodda göze çarpmaz, ancak onsuz worker üretimde sızdırırdı.

3. **WebSocket olmadan sunucusuz Discord botu**: WebSocket ağ geçidi yaklaşımından daha az bilinir, ancak durumsuz işleme yapan bir bot için (her etkileşim bağımsızdır), Interactions Endpoint kesinlikle üstündür -- yeniden bağlanma yok, heartbeat yok, sürdürülecek süreç yok. Discord, kullanılabilirliği kendi altyapıları tarafında yönetir.

---

*Repo : [fox3000foxy/konosuba-rpg](https://github.com/fox3000foxy/konosuba-rpg)*

*Kaynak kodu lisansı özel -- yeniden dağıtım yok, kullanımı ücretsiz.*
