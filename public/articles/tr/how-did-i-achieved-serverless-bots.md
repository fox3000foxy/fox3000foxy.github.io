---
title: "%100 sunucusuz Discord botu: Hono + Cloudflare Workers"
description: Bana ayda 50€'ya mal olan bir Discord botunu sıfır euro ile nasıl
  değiştirdim -- etkileşim uç noktaları, Hono, Workers, gerçek zamanlı görüntü
  oluşturma ve WebSocket olmadan eksiksiz bir oyun.
date: 2026-05-29
tags:
  - discord
  - cloudflare
  - serverless
  - typescript
  - bots
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA=="
author_sig: "MEUCIQCS5Oe8Tv1xTqe18vdrEV2ckEHTfNYQ/e11ZPEzAvNfxQIgFkKZXthVdizTgYRFQ2U24ccuHCr6aJ7+qAUAJvtD3OM="
---

## Discord bot %100 serverless : Hono + Cloudflare Workers = 💸 sıfır

Birkaç ay boyunca klasik Discord botlarını kendi makinemde çalıştırdım.

WebSocket bağlantısı hep açık. Bot gece 3'te kendi kendine yeniden bağlanıyor. Bot çöküyor çünkü koyunlara yanlış baktım resmen. Fatura yükseliyor.

Bir gün fark ettim: **neden bir bağlantıyı açık tutayım ki** ? Discord sana sadece **ilgini çeken şeyleri** POST'layabilir. Sen cevaplarsın, olur biter.

2021'den beri Discord **interaction endpoints** sunuyor.

Sadece HTTP. WebSocket yok. Kalıcı durum yok. Bir istek alırsın, JSON gönderirsin, biter. Sonraki istek kendi gelir.

En iyisi: Cloudflare Workers **ücretsiz**, günde 100k isteğe kadar. Botların %90'ı için ayda 0€.

Bu yazıda sana WebSocket olmadan Discord botu nasıl yapılır göstereceğim, **Hono** (ultra hafif web framework) ve **Cloudflare Workers** kullanarak. Sana iki gerçek proje göstereceğim: **Nibi** (Japonca öğrenme botu, TTS, havalı) ve **Konosuba-RPG** (gerçek zamanlı image render'lı _komple_ bir Discord oyunu xD).

## WebSocket vs. Interaction Endpoints : neden kötü bir fikirdi

Oynamadığın zaman bile bağlantıyı açık tutman gereken bir Minecraft oyunu düşünelim.

Ve sunucu her çöktüğünde kendi kendine yeniden bağlanıyor. Timeout'ları, exponential reconnection'ları, nefret ettiğimiz tüm o boktan boilerplate'leri yönetmek zorundasın. Sırf interaction almak için.

Interaction endpoints tam tersi. Discord senin URL'ine POST atar. Sen cevaplarsın. Biter.

Sunucun çöktü mü ? Discord 2-3 kere tekrar dener ve geçer. Sıfır drama.

**Öncesi maliyet** : Heroku'da sadece bir Node prosesini canlı tutmak için aylık 50€.

**Sonrası maliyet** : Cloudflare'da günde 100k isteğe kadar ayda 0€.

## Mimari : tam olarak ne bu ?

Discord endpoint'ine POST isteği atar.

```plaintext
Discord: "Hey! Kullanıcı /ping'e tıkladı!"
      ↓
   Senin URL'n (Cloudflare Worker)
      ↓
   Gerçekten Discord mu diye kontrol edersin (imza doğrulama)
      ↓
   Interaction türünü parse edersin
      ↓
   Handler'ı çalıştırırsın
      ↓
   JSON döndürürsün
      ↓
Discord: "Havalı, bunu kullanıcıya göstereceğim"
```

Saf HTTP. Sihir yok. Ağır kütüphane yok.

## Hono + Cloudflare Workers : ekonomik combo

**Hono** 12KB ağırlığında bir web framework. Her yerde çalışır: Cloudflare Workers, Vercel, AWS Lambda, Deno, Bun... aynı kod her yerde.

Cloudflare Workers edge'de compute demek. İsteklerin en yakın sunucuya gider. Yanıt süresi: \<100ms. Maliyet: günde 100k isteğe kadar ücretsiz.

Hono + Cloudflare bir Discord botu için mükemmel eşleşme.

İşte komple bir botun minimal kodu:

```typescript
import { Hono } from 'hono';
import { verifyKey } from 'discord-interactions';

const app = new Hono();

app.post('/interactions', async (c) => {
  // 1. Header'ları al
  const signature = c.req.header('x-signature-ed25519');
  const timestamp = c.req.header('x-signature-timestamp');
  const body = await c.req.text();

  // 2. Gerçekten Discord mu diye kontrol et (spam değil)
  const isValid = verifyKey(
    body,
    signature,
    timestamp,
    c.env.PUBLIC_KEY
  );
  if (!isValid) return c.text('Invalid request', 401);

  // 3. Ne gönderdiğini parse et
  const interaction = JSON.parse(body);

  // 4. Türe göre cevap ver
  if (interaction.type === 1) {
    // Discord test (PING)
    return c.json({ type: 1 });
  }

  if (interaction.type === 2) {
    // Bu bir slash command
    const name = interaction.data.name;
    if (name === 'ping') {
      return c.json({
        type: 4,
        data: { content: 'Pong!' }
      });
    }
  }

  return c.json({ type: 4, data: { content: 'Unknown command' } });
});

export default app;
```

Yani 30 satırda çalışan bir bot.

`bot.login()` yok. Event emitter yok. Callback hell yok. Sadece HTTP.

Cloudflare'e deploy etmek için:

```plaintext
npm install -D wrangler
npx wrangler deploy
```

Boom. `https://mon-bot.workers.dev/interactions` gibi bir URL'n olur.

Bunu Discord Developer Portal'da "INTERACTIONS ENDPOINT URL" kısmına koyarsın ve Discord interaction'larını oraya göndermeye başlar.

## İmza doğrulama : sahte istek yok

Discord her isteği bir public key ile imzalar. Yanlış imzalı istek mi geldi ? Spamdır. Görmezden gel ve devam et.

`discord-interactions` paketi işi yapıyor:

```typescript
import { verifyKey } from 'discord-interactions';

const isValid = verifyKey(
  rawBody,           // aynen ham metin (parse edilmiş JSON değil !)
  signature,         // header x-signature-ed25519
  timestamp,         // header x-signature-timestamp
  publicKey          // Discord Dev Portal'dan
);
```

**Önemli tuzak** : imza body'nin _birebir aynısına_ bağlı. JSON parse edip tekrar stringify edersen veya body'i loglarsan imzayı bozarsın.

Önce doğrula. Sonra parse et. Sıra önemli.

## Vaka 1 : Nibi (Japonca öğrenme botu)

Nibi Japonca öğrenmek için bir Discord botu. Basit komutlar:

*   `/dictionary kanji` → tanımları gösterir
*   `/pronounce テキスト` → TTS (text-to-speech) üretir
*   `/hello` → karşılama mesajı

Her komut bir TypeScript dosyası:

```plaintext
src/commands/
├── dictionary.ts
├── pronounce.ts
├── hello.ts
└── ...
```

Bir komut şu interface'i implemente eder:

```typescript
interface Command {
  data: {
    name: string;
    description: string;
    options?: SlashCommandOption[];
  };
  execute(
    interaction: Interaction,
    env: Bindings
  ): Promise<InteractionResponse>;
}
```

### /pronounce komutu : botu konuşturmak

İşte bu çılgınca olan. Metin gönderirsin (romaji, hiragana, kanji, her neyse), bot bunu hiragana'ya çevirir, VOICEVOX veya Google TTS ile TTS üretir ve Discord'a sesli mesaj gönderir.

```typescript
const pronounce: Command = {
  data: {
    name: 'pronounce',
    description: 'Japonca metin için TTS üretir',
    options: [
      {
        type: 3,  // STRING
        name: 'text',
        description: 'Telaffuz edilecek metin',
        required: true
      }
    ]
  },

  async execute(interaction, env) {
    const text = interaction.data.options[0].value;

    try {
      // 1. Kuroshiro ile romaji → hiragana çevir
      const hiragana = await kuroshiro.convert(text, { to: 'hiragana' });

      // 2. TTS sesi oluştur
      const audioBuffer = await generateTTS(hiragana);

      // 3. Dosyayı Discord'a yükle
      const uploadFilename = await uploadToDiscord(
        audioBuffer,
        interaction.channel.id,
        env.BOT_TOKEN
      );

      // 4. Sesli mesajı gönder
      await sendVoiceMessage(
        interaction.channel.id,
        uploadFilename,
        audioBuffer.length / 16000,  // saniye cinsinden süre
        env.BOT_TOKEN
      );

      return {
        type: 4,
        data: { content: `"${text}" için telaffuz` }
      };
    } catch (err) {
      return {
        type: 4,
        data: {
          content: 'Hata : ses oluşturulamadı xD',
          flags: 64  // ephemeral (gizli mesaj)
        }
      };
    }
  }
};
```

Deli işi: harici bir API çağırırsın, Discord'a dosya yüklersin, dosyayla mesaj gönderirsin. WebSocket olmadan, sadece HTTP ile.

### Supabase ile kalıcılık

Nibi, key-value store olarak Supabase kullanıyor. Kullanıcının kayıtlı olup olmadığını kontrol etmek için:

```typescript
const DatabaseUtils = new DatabaseUtils({
  SUPABASE_URL: env.SUPABASE_URL,
  SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY
});

const users = await DatabaseUtils.readJson('users');
const user = users.find(u => u.id === interaction.member.user.id);

if (!user) {
  // Kullanıcıyı ekle
  users.push({ id: interaction.member.user.id, verified: true });
  await DatabaseUtils.writeJson('users', users);
}
```

Çok basit (gerçek SQL sorgusu değil, sadece JSON), ama iş görüyor. Küçük botlar için mükemmel.

## Vaka 2 : Konosuba-RPG (görsel render'lı Discord oyunu)

Tamam bu çılgınca.

Konosuba-RPG Discord üzerinde **komple bir oyun**. Moblarla savaşırsın, XP kazanırsın, eşya takarsın, seviye atlarsın. Her savaş gerçek zamanlı **görsel** üretir. Önceden render edilmiş spritesheet yok. Görsel, oyuncunun statlarına, mob'a ve savaş durumuna göre dinamik olarak oluşturulur.

Ve görsel Cloudflare Workers üzerinde \<500ms'de oluşur. Gerçekten.

### Render mimarisi

```plaintext
Discord ("Attack" butonuna tıklarsın)
    ↓
Cloudflare Worker interaction'ı alır
    ↓
Oyun durumu güncellenir (XP, HP, vb.)
    ↓
Satori ile JSX oluşturulur
    ↓
Resvg (Wasm) ile SVG → PNG dönüşümü
    ↓
Görsel Discord'a yüklenir
    ↓
Görselle birlikte mesaj gönderilir
```

Hepsi bir saniyeden kısa sürede. İnanılmaz.

### Workers tarafında görsel render

Konosuba **Satori** (JSX → SVG) ve **Resvg** (SVG → PNG) kullanıyor:

```typescript
import { Satori } from 'satori';
import initWasm from '@cf-wasm/resvg';

async function renderBattle(gameState: GameState) {
  const resvg = await initWasm();

  // 1. UI için JSX oluştur
  const jsx = (
    <div style={{ display: 'flex', gap: '20px' }}>
      <div>
        <h1>{gameState.player.name}</h1>
        <p>HP: {gameState.player.hp}/{gameState.player.maxHp}</p>
      </div>
      <div>
        <h1>{gameState.enemy.name}</h1>
        <p>HP: {gameState.enemy.hp}/{gameState.enemy.maxHp}</p>
      </div>
    </div>
  );

  // 2. JSX → SVG
  const svg = await satori.render(jsx, {
    width: 1200,
    height: 800,
    fonts: [/* ... */]
  });

  // 3. SVG → PNG
  const png = resvg.render(svg).asPng();

  return png;  // Uint8Array
}
```

Normal JSX yazarsın. SVG'ye dönüşür. SVG, PNG olur. Cloudflare Worker'da \<100ms.

Gücü anlıyor musun ? Sadece... çok güzel xD

### Oyun durumu ve ilerleme

Oyuncu verileri Supabase'te:

```typescript
const player = await db
  .from('players')
  .select('*')
  .eq('discord_id', interaction.user.id)
  .single();

// Oyuncu kazandı
const { data: updated } = await db
  .from('players')
  .update({
    level: player.level + 1,
    xp: player.xp + xpGain
  })
  .eq('id', player.id);
```

Her eylem (saldırı, savunma, iyileşme) veritabanındaki statları günceller. Sonra yeni statlarla görseli yeniden oluşturursun.

### Interaction'lar : oynanış butonları

Oyun, savaş eylemleri için **button interaction** kullanıyor:

```typescript
{
  type: 1,  // ActionRow
  components: [
    {
      type: 2,  // Button
      style: 1,  // Primary (mavi)
      label: 'Attack',
      custom_id: 'battle_attack'
    },
    {
      type: 2,
      style: 2,  // Secondary (gri)
      label: 'Defend',
      custom_id: 'battle_defend'
    }
  ]
}
```

"Attack" butonuna tıkladığında Discord `custom_id: 'battle_attack'` ile bir interaction POST'lar. Handler şöyle yönlendirir:

```typescript
if (interaction.type === 3) {
  // Component interaction (buton tıklaması, vb.)
  const customId = interaction.data.custom_id;

  if (customId === 'battle_attack') {
    return await handleAttack(interaction, env);
  }
  if (customId === 'battle_defend') {
    return await handleDefend(interaction, env);
  }
}
```

Ve boom, hasarı hesaplarsın, veritabanını güncellersin, görseli yeniden oluşturursun, gönderirsin.

Hiçbir bağlantı kalıcılığı olmayan komple bir sıra tabanlı oyun. Sadece HTTP stateless. Tamamen kırık xD

## Supabase: Workers için yapılmış veritabanı

Geleneksel veritabanları (PostgreSQL, MySQL, MongoDB) kalıcı TCP bağlantıları için tasarlanmıştır. Bir soket açarsın, bağlantıyı canlı tutarsın, sorgular gönderirsin. Sorun: **Cloudflare Workers kalıcı TCP bağlantılarını desteklemez**. Her istek geçici bir süreçtir. İstemciye yanıt verdiğin an Worker kaybolur.

Bunu yapamazsın:

```typescript
// Bu Workers'ta ÇALIŞMAZ
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();  // kalıcı TCP bağlantısı = ölü
```

`pg` veya `postgres.js` gibi native PostgreSQL sürücüleri bile TCP bağlantıları kullanır. Workers'ta çökerler.

**Supabase her şeyi çözüyor.**

Supabase, PostgreSQL üzerinde bir REST API'sidir. Normal HTTP istekleri yaparsın. Her çağrı bağımsızdır, kalıcı bağlantı yok, yönetilecek durum yok. Serverless modeli için mükemmel.

```typescript
// Bu Workers'ta MÜKEMMEL çalışır
const { data, error } = await supabase
  .from('players')
  .select('*')
  .eq('discord_id', userId)
  .single();
```

Supabase istemcisi (`@supabase/supabase-js`) altında `fetch` kullanır. Ve `fetch` Workers'ta native. Sıfır yapılandırma, sıfır sürücü, sıfır kalıcı bağlantı.

| Veritabanı | Workers uyumlu mu? | Neden |
| --- | --- | --- |
| **Supabase** | ✅ Evet | Durumsuz REST API, saf HTTP |
| **PlanetScale (MySQL)** | ⚠️ Kısmen | Yalnızca HTTPS bağlantısı, uzun işlemler yok |
| **Neon** | ⚠️ Kısmen | Serverless dallanma ama TCP sürücüsü gerekli |
| **Turso (libSQL)** | ⚠️ Kısmen | HTTP mümkün ama sınırlı |
| **Prisma/Prisma Postgres** | ❌ Hayır | Kalıcı TCP gerektirir |
| **MongoDB Atlas** | ❌ Hayır | TCP sürücüsü, native REST API yok |
| **Redis (Upstash)** | ✅ Evet | HTTP üzerinden REST API |

Supabase'in gerçek avantajı sadece DB değil -- tüm ekosistemin edge-first düşünülerek tasarlanmış olması:

- **Auth**: Oturumlar için REST API, durumsuz çalışır
- **Storage**: HTTP ile dosya yükleme/indirme
- **Realtime**: İsteğe bağlı WebSocket, ama REST ile de poll yapabilirsin
- **Row Level Security**: güvenlik kuralları DB'de yaşar, backend'inde değil

Serverless bir Discord botu için Supabase en basit ve en güvenilir seçimdir. Yapılandırılacak sürücü yok, korunacak bağlantı yok, zaman aşımı yok. Sadece HTTP istekleri.

Gerçek bir örnek istersen, yukarıdaki Nibi'ye bak: kalıcılık kodu tam anlamıyla Supabase üzerinde `readJson()` ve `writeJson()`. Migration yok, karmaşık şema yok, çılgın yapılandırma yok. Kutudan çıktığı gibi çalışır. Ve botun büyürse, sağlayıcı değiştirmeden gerçek SQL sorgularına geçebilirsin.

## Polyfill'ler : Node Workers'ta çalışmak istediğinde

Bazı paketler Node API'leri bekler. Kuromoji (kanji parser) `XMLHttpRequest` kullanır. Workers'ta `XMLHttpRequest` değil `fetch` var.

Basit çözüm: index.ts'nin tepesine bir polyfill ekle:

```typescript
// Kuromoji için XMLHttpRequest polyfill
if (!globalThis.XMLHttpRequest) {
  globalThis.XMLHttpRequest = class {
    // Minimal stub
  } as any;
}
```

Ya da ayrı bir modül yap:

```typescript
// src/utils/polyfills.ts
export function setupPolyfills() {
  if (!globalThis.XMLHttpRequest) { /* ... */ }
  if (!globalThis.Buffer) { /* ... */ }
}

// src/index.ts
import { setupPolyfills } from './utils/polyfills';
setupPolyfills();
```

Basit bir hack, ama çalışıyor.

## Bir npm paketine doğru : hono-discord-interactions

Elden bot yapmak çok boilerplate:

*   Discord imzasını doğrula
*   Interaction türlerini yönlendir
*   Komutları, component'leri, modal'ları yönet
*   Geçerli JSON döndür

Bunların hepsini bir npm paketinde soyutlayabiliriz. Şöyle:

```typescript
import { createDiscordHandler } from 'hono-discord-interactions';

const handler = createDiscordHandler({
  publicKey: env.PUBLIC_KEY,
  commands: [
    {
      name: 'ping',
      execute: async (interaction) => ({
        type: 4,
        data: { content: 'Pong!' }
      })
    },
    {
      name: 'hello',
      execute: async (interaction) => ({
        type: 4,
        data: { content: `Hi ${interaction.member.user.username}!` }
      })
    }
  ]
});

const app = new Hono();
app.post('/interactions', handler);
export default app;
```

Bam. 200 satır yerine 20 satır. Nibi'yi rahatça yarıya indirir.

Sonra düşünürüz xD

## Deploy

### Cloudflare Workers

```plaintext
npm install -D wrangler

# wrangler.toml
[env.production]
name = "mon-bot"
main = "src/index.ts"

# Secrets
wrangler secret put PUBLIC_KEY --env production
wrangler secret put BOT_TOKEN --env production
wrangler secret put SUPABASE_URL --env production

# Deploy
wrangler deploy --env production
```

Sonuç URL: `https://mon-bot.workers.dev/interactions`

Maliyet: günde 100k isteğe kadar **ücretsiz**. Üstü: $0.50/milyon.

Spoiler: 10.000 aktif kullanıcın olmadıkça 100k isteği asla geçmezsin.

### Vercel

```plaintext
npm run vercel:deploy
```

URL: `https://mon-bot-xyz.vercel.app/api/interactions`

Aynı, ücretsiz.

### İkisi birden

Hono her yerde çalışır. Aynı kodu Cloudflare VE Vercel'e deploy edebilirsin. Yedeklilik için veya seçmeden önce test etmek için kullanışlı.

## Hızlı kontrol listesi

1.  Discord Developer Portal'da bir Application oluştur
2.  PUBLIC\_KEY, BOT\_TOKEN, APP\_ID'yi kopyala
3.  Projeyi oluştur:
4.  index.ts yaz (imza doğrulama + yönlendirme)
5.  Slash command'ları kaydet (bir kere):
6.  Deploy et:
7.  URL'yi Discord'a ekle (Developer Portal → Application → Interactions Endpoint URL)
8.  Discord bağlantıyı test eder (PING'e cevap vermelisin)
9.  Botu bir sunucuya davet et
10. Oldu bu

## Avantajlar vs Sınırlamalar

**Avantajlar**

*   Ucuz (günde 100k isteğe kadar ücretsiz)
*   Ölçeklenebilir (bağlantı yönetimi yok)
*   Basit (WebSocket boilerplate yok)
*   Hızlı (Cloudflare = edge sunucular)
*   Taşınabilir (Hono kodu = birden çok host)

**Sınırlamalar**

*   Gerçek zamanlı sunucu olayları yok (üye katıldı, rol eklendi, mesaj silindi, vb.) -- sadece interaction alırsın (slash commands, butonlar, modallar)
*   Cevap vermek için 3 saniye timeout -- yoksa Discord "Application did not respond" gösterir
*   Gerçek event'ler gerekiyorsa -- ayrı bir HTTP webhook veya ek WebSocket bağlantısı gerekir

Botların %90'ı için (slash command tabanlı her şey) ? Yeter.

## Sonuç olarak

KonosubaRPG ve Nibi'yi optimize etmek için epey zaman harcadım -- ya mümkün olduğunca az istek yapmak için, ya sıcak işlemci süresini azaltmak için, ya da soğuk başlatmayı düşürmek için. Sonuç olarak, neredeyse her şeyde epey iyi performans aldım.
Şunu bilmelisin ki projelerimin çoğunu cloud'a taşımaya (buna denir mi bilmiyorum) başlamıştım çünkü kendi VM'de barındırmaya devam etmek için inanılmaz bir üşengeçliğim vardı. Gerçekten, Github Actions benim kıçımı kurtardı diyebilirim. Workers da öyle, ama aslında Github Actions ve schedule'larla daemon yapabildiğimi görünce gerçekten kurtulmuştum valla.

Muhtemelen [email-autoreply](https://github.com/fox3000foxy/email-autoreply/) adlı bir proje hakkında yazı yazacağım, o yüzden çıktığını görmek için RSS beslemesine abone olun :))

**Unutulmaması gereken 3 şey:**

1.  **Interaction endpoints = HTTP serverless** -- WebSocket yok, kalıcı bağlantı yok. Discord POST atar, sen cevaplarsın. Cloudflare'da ücretsiz.
2.  **Hono mükemmel araç** -- Hafif framework (12KB), çoklu runtime, sıfır bağımlılık. Cloudflare, Vercel, Node, her yerde aynı kod.
3.  **Workers'ta görsel render = deli işi** -- Satori + Resvg (Wasm) ile dinamik UI'ları JSX'te oluşturup \<100ms'de PNG'ye çevirebilirsin. Komple bir oyun bununla çalışabilir.

Hastalık bu xD

```plaintext
wrangler deploy
```

```plaintext
npm run register-commands
```

```plaintext
npm init -y
npm install hono discord-interactions
npm install -D wrangler typescript
```
