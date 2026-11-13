---
title: "%100 sunucusuz Discord botu: Hono + Cloudflare Workers"
description: Bana ayda 50 €ya mal olan bir Discord botunu sıfır euroyla nasıl
  değiştirdim, interaction endpointleri, Hono, Workers, gerçek zamanlı görsel
  render ve WebSocketsiz tam bir oyun.
date: 2026-05-29
tags:
  - discord
  - cloudflare
  - serverless
  - typescript
  - bots
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "YLSGaZKb4taR/bfyC/KKbvLLQk790EJNGlp5a3K6zHKdfDSOpBI5Vk18JjvcgOuQG1Pwue5QJA3pW8mljhMDMA=="
---

## %100 sunucusuz Discord botu: Hono + Cloudflare Workers = 💸 sıfır

Klasik Discord botlarını kendi makinemde bakımlı tutarak birkaç ay geçirdim.

Sürekli açık WebSocket bağlantısı. Bot sabah 3te kendi kendine yeniden bağlanır. Koyunlara ters baktığım için bot çöker. Fatura yükselir.

Bir gün şunu keşfettim: **bağlantıyı neden sürdüreyim**? Discord ilgilendiğin olayları sana POST ile gönderebilir. Yanıtlarsın, biter.

2021den beri Discord **interaction endpointleri** sunar.

Bu sadece HTTP. WebSocketsiz, kalıcı durumsuz çalışırsın. Bir istek alırsın, JSON gönderirsin, biter. Sonraki istek kendi kendine gelir.

Ve en iyisi: Cloudflare Workers günde 100 bin isteğe kadar **ücretsizdir**. Botların %90ı için bu 0 €/aydır.

Bu makale **Hono** (aşırı hafif web çerçevesi) ve **Cloudflare Workers** kullanarak WebSocketsiz bir Discord botunun nasıl yapılacağını gösterir. İki gerçek proje göstereceğim: **Nibi** (Japonca öğrenme botu, TTS, havalı) ve **Konosuba-RPG** (gerçek zamanlı görsel renderlı _tam_ bir Discord oyunu).

## WebSocket ve Interaction Endpointleri: neden kötü bir fikirdi

Oynamadığında bile bağlantıyı açık tutman gereken bir Minecraft oyunu hayal et.

Ve sunucu her çöktüğünde otomatik yeniden bağlanır. Timeoutları, üstel yeniden bağlanmaları, nefret ettiğimiz tüm o saçma boilerplatei yönetmek zorundasın. Sadece etkileşimleri almak için.

Interaction endpointleri bunun tersidir. Discord URLne POST yapar. Yanıtlarsın. Biter.

Sunucun çökerse? Discord 2-3 kez yeniden dener ve yoluna devam eder. Sıfır drama.

**Önceki maliyet**: bir Node sürecini canlı tutmak için sırf Heroku üzerinde 50 €/ay.

**Sonraki maliyet**: günde 100 bin isteğe kadar Cloudflare üzerinde 0 €/ay.

## Mimari: bu tam olarak nedir?

Discord endpointine bir istek POSTlar.

```plaintext
Discord: "Eh! L'utilisateur a cliqué sur /ping!"
      ↓
    Ton URL (Cloudflare Worker)
      ↓
Tu vérifie que c'est vraiment Discord (signature check)
      ↓
Tu parse le type d'interaction
      ↓
Tu exécute le handler
      ↓
Tu retourne du JSON
      ↓
Discord: "Cool, je vais afficher ça à l'utilisateur"
```

Bu minimal ve okunabilir yığınla saf HTTP.

## Hono + Cloudflare Workers: tutumlu ikili

**Hono** 12 KB ağırlığında bir web çerçevesidir. Her yerde çalışır: Cloudflare Workers, Vercel, AWS Lambda, Deno, Bun... her yerde aynı kod.

Cloudflare Workers uçta işlemdir. İsteklerin en yakın sunucuya ulaşır. Yanıt süresi: \<100 ms. Maliyet: günde 100 bin isteğe kadar ücretsiz.

Hono + Cloudflare ikilisi bir Discord botu için mükemmel eşleşmedir.

İşte tam bir botun minimal kodu:

```typescript
import { Hono } from 'hono';
import { verifyKey } from 'discord-interactions';

const app = new Hono();

app.post('/interactions', async (c) => {
  // 1. Başlıkları al
  const signature = c.req.header('x-signature-ed25519');
  const timestamp = c.req.header('x-signature-timestamp');
  const body = await c.req.text();

  // 2. Gerçekten Discord olduğunu doğrula (spam değil)
  const isValid = verifyKey(
    body,
    signature,
    timestamp,
    c.env.PUBLIC_KEY
  );
  if (!isValid) return c.text('Invalid request', 401);

  // 3. Gönderdiğini ayrıştır
  const interaction = JSON.parse(body);

  // 4. Türe göre yanıtla
  if (interaction.type === 1) {
    // Discord testi (PING)
    return c.json({ type: 1 });
  }

  if (interaction.type === 2) {
    // Bu bir slash komutu
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

İşlevsel bir bot için 30 satır yeter.

`bot.login()`, olay yayıcılar ve callback cehennemini unutursun. Sadece HTTPyi tutarsın.

Cloudflare üzerine dağıtmak için:

```plaintext
npm install -D wrangler
npx wrangler deploy
```

Bum. `https://mon-bot.workers.dev/interactions` gibi bir URLn olur.

Bunu Discord Developer Portal içinde "INTERACTIONS ENDPOINT URL" altına koyarsın ve Discord etkileşimlerini oraya göndermeye başlar.

## İmzayı doğrulamak: sahte istek yok

Discord her isteği bir açık anahtarla imzalar. Kötü imzalı bir istek alırsan? O spamdir. Görmezden gel ve devam et.

`discord-interactions` paketi işi yapar:

```typescript
import { verifyKey } from 'discord-interactions';

const isValid = verifyKey(
  rawBody,           // tam ham metin (ayrıştırılmış JSON değil!)
  signature,         // x-signature-ed25519 başlığı
  timestamp,         // x-signature-timestamp başlığı
  publicKey          // Discord Dev Portalden
);
```

**Önemli tuzak**: imza _tam_ gövdeye bağlıdır. JSON ayrıştırıp yeniden dizgeleĢtirirsen ya da gövdeyi loglarsan imzayı bozarsın.

Önce doğrula. Sonra ayrıştır. Önemli olan sıradır.

## Durum 1: Nibi (Japonca öğrenme botu)

Nibi Japonca öğrenmek için bir Discord botudur. Basit komutlar:

*   `/dictionary kanji` → tanımları gösterir
*   `/pronounce テキスト` → TTS (text-to-speech) üretir
*   `/hello` → karşılama mesajı

Her komut bir TypeScript dosyasıdır:

```plaintext
src/commands/
├── dictionary.ts
├── pronounce.ts
├── hello.ts
└── ...
```

Bir komut bu arayüzü uygular:

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
  ): Promise<interactionresponse>;
}
```

### /pronounce komutu: botu konuşturmak

İyice tuhaf olan bu. Metin gönderirsin (romaji, hiragana, kanji, her şey), bot bunu hiraganaya çevirir, VOICEVOX ya da Google TTS üzerinden TTS üretir ve Discordda bir sesli mesaj gönderir.

```typescript
const pronounce: Command = {
  data: {
    name: 'pronounce',
    description: 'Génère du TTS pour du texte japonais',
    options: [
      {
        type: 3,  // STRING
        name: 'text',
        description: 'Texte à prononcer',
        required: true
      }
    ]
  },

  async execute(interaction, env) {
    const text = interaction.data.options[0].value;

    try {
      // 1. Kuroshiro ile romaji → hiragana çevir
      const hiragana = await kuroshiro.convert(text, { to: 'hiragana' });

      // 2. TTS sesini üret
      const audioBuffer = await generateTTS(hiragana);

      // 3. Dosyayı Discorda yükle
      const uploadFilename = await uploadToDiscord(
        audioBuffer,
        interaction.channel.id,
        env.BOT_TOKEN
      );

      // 4. Sesli mesajı sesle birlikte gönder
      await sendVoiceMessage(
        interaction.channel.id,
        uploadFilename,
        audioBuffer.length / 16000,  // saniye cinsinden süre
        env.BOT_TOKEN
      );

      return {
        type: 4,
        data: { content: `Prononciation pour "${text}"` }
      };
    } catch (err) {
      return {
        type: 4,
        data: {
          content: 'Erreur : impossible de générer l\'audio xD',
          flags: 64  // ephemeral (özel mesaj)
        }
      };
    }
  }
};
```

Çılgınca: harici bir API çağırırsın, bir dosyayı Discorda yüklersin, dosyayla birlikte bir mesaj gönderirsin. Hepsi WebSocketsiz, sadece HTTP.

### Supabase ile kalıcılık

Nibi key-value deposu olarak Supabase kullanır. Bir kullanıcının kayıtlı olup olmadığını kontrol etmek için:

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

Çok temel (gerçek SQL sorguları yok, sadece JSON) ama çalışıyor. Küçük botlar için mükemmel.

## Durum 2: Konosuba-RPG (görsel renderlı Discord oyunu)

Tamam bu çılgınca.

Konosuba-RPG Discordda **tam bir oyundur**. Moblarla savaşırsın, XP kazanırsın, aksesuar kuşanırsın, seviye atlarsın. Her savaş gerçek zamanlı bir **görsel** üretir. Önceden renderlanmış spritesheetlerden kaçınırsın. Görsel oyuncu istatistiklerinden, mobdan ve savaş durumundan dinamik oluşturulur.

Ve görsel Cloudflare Workers’ta \<500 msde üretilir. Kelimenin tam anlamıyla.

### Render mimarisi

```plaintext
Discord (tu cliques "Attack")
    ↓
Cloudflare Worker reçoit l'interaction
    ↓
Mise à jour du game state (XP, HP, etc.)
    ↓
Génère du JSX avec Satori
    ↓
Convertit SVG → PNG avec Resvg (Wasm)
    ↓
Upload l'image vers Discord
    ↓
Envoie le message avec l'image
```

Hepsi bir saniyeden kısa sürede. Çılgınca.

### Workers tarafında görsel render

Konosuba **Satori** (JSX → SVG) ve **Resvg** (SVG → PNG) kullanır:

```typescript
import { Satori } from 'satori';
import initWasm from '@cf-wasm/resvg';

async function renderBattle(gameState: GameState) {
  const resvg = await initWasm();

  // 1. Arayüz için JSX oluştur
  const jsx = (
    <div style="{{" display:="" 'flex',="" gap:="" '20px'="" }}="">
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

Normal JSX yazarsın. SVGye dönüşür. SVG PNGye dönüşür. Bir Cloudflare Worker üzerinde \<100 ms.

Gücü görüyor musun? Bu sadece güzel.

### Oyun durumu ve ilerleme

Oyuncu verileri Supabasededir:

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

Her aksiyon (saldırı, savunma, iyileşme) veritabanında istatistikleri günceller. Ve sonra görseli yeni istatistiklerle yeniden üretirsin.

### Etkileşimler: oynanış düğmeleri

Oyun savaşta aksiyonlar için **düğme etkileşimleri** kullanır:

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

"Attack" düğmesine tıkladığında Discord `custom_id: 'battle_attack'` ile bir etkileşim POSTlar. Handler bunu yönlendirir:

```typescript
if (interaction.type === 3) {
  // Bileşen etkileşimi (düğme tıklaması vs.)
  const customId = interaction.data.custom_id;

  if (customId === 'battle_attack') {
    return await handleAttack(interaction, env);
  }
  if (customId === 'battle_defend') {
    return await handleDefend(interaction, env);
  }
}
```

Ve bum, hasarı hesaplarsın, veritabanını güncellersin, görseli yeniden üretirsin, gönderirsin.

Bağlantı kalıcılığı olmadan tam bir sıra tabanlı oyun. Sadece stateless HTTP. Tamamen kırık.

## Supabase: Workerlar için yapılmış veritabanı

Klasik veritabanları (PostgreSQL, MySQL, MongoDB) kalıcı TCP bağlantıları için tasarlanmıştır. Bir soket açarsın, bağlantıyı açık tutarsın, sorgular gönderirsin. Sorun: **Cloudflare Workers kalıcı TCP bağlantılarını desteklemez**. Her istek geçici bir süreçtir. İstemciye yanıt verir vermez Worker kaybolur.

Bunu yapamazsın:

```typescript
// Workers’ta ÇALIŞMAZ
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();  // kalıcı TCP bağlantısı = ölü
```

Ve `pg` ya da `postgres.js` gibi yerel PostgreSQL sürücüleri bile TCP bağlantıları kullanır. Worker üzerinde çökerler.

**Supabase tüm bunları çözer.**

Supabase PostgreSQL üstünde bir REST APIdir. Normal HTTP istekleri yaparsın. Her çağrı bağımsızdır, kalıcı bağlantı yok, yönetilecek durum yok. Sunucusuz modele mükemmel uyar.

```typescript
// Workers’ta MÜKEMMEL çalışır
const { data, error } = await supabase
  .from('players')
  .select('*')
  .eq('discord_id', userId)
  .single();
```

Supabase istemcisi (`@supabase/supabase-js`) kaputun altında `fetch` kullanır. Ve `fetch` Worker üzerinde yereldir. Sıfır yapılandırma, sıfır sürücü, sıfır kalıcı bağlantı.

| Veritabanı | Workers uyumlu mu? | Neden |
| --- | --- | --- |
| **Supabase** | ✅ Evet | Durumsuz REST API, saf HTTP |
| **PlanetScale (MySQL)** | ⚠️ Kısmi | Yalnızca HTTPS bağlantısı, uzun işlem yok |
| **Neon** | ⚠️ Kısmi | Sunucusuz dallar ama TCP sürücü gerekli |
| **Turso (libSQL)** | ⚠️ Kısmi | HTTP mümkün ama sınırlı |
| **Prisma/Prisma Postgres** | ❌ Hayır | Kalıcı TCP gerekli |
| **MongoDB Atlas** | ❌ Hayır | TCP sürücü, yerel REST API yok |
| **Redis (Upstash)** | ✅ Evet | HTTP REST API |

Supabasin gerçek avantajı sadece veritabanı değil: tüm ekosistem uç öncelikli düşünülmüş:

- **Auth**: oturumları yönetmek için REST API, durumsuz çalışır
- **Storage**: HTTP üzerinden dosya yükleme/indirme
- **Realtime**: WebSocket opsiyonel ama REST üzerinden yoklama da yapabilirsin
- **Row Level Security**: güvenlik kuralları backendinde değil, veritabanında

Sunucusuz bir Discord botu için Supabase en basit ve en güvenilir seçimdir. Sürücü yapılandırmazsın, bağlantı sürdürmezsin, timeout yönetmezsin. Sadece HTTP istekleri gönderirsin.

Gerçek bir örnek istersen yukarıda Nibiye bak: kalıcılık kodu kelimenin tam anlamıyla Supabase üzerinde `readJson()` ve `writeJson()`dur. Migrasyonsuz, karmaşık şemasız, ağır yapılandırmasız başlarsın. Doğrudan çalışır. Ve botun büyürse sağlayıcı değiştirmeden gerçek SQL sorgularına geçersin.

## Polyfilller: Node Worker üzerinde çalışmak isteyince

Bazı paketler Node APIleri bekler. Kuromoji (kanji ayrıştırıcı) `XMLHttpRequest` kullanır. Workerlarda `fetch` vardır, `XMLHttpRequest` yoktur.

Basit çözüm: index.ts en üstüne bir polyfill eklemek:

```typescript
// kuromoji için XMLHttpRequest Polyfilli
if (!globalThis.XMLHttpRequest) {
  globalThis.XMLHttpRequest = class {
    // Minimal saplamа
  } as any;
}
```

Ya da adanmış bir modül yapmak:

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

Bu temel bir hack ama çalışıyor.

## Bir npm paketine doğru: hono-discord-interactions

Elle bot yapmak çok boilerplate demektir:

*   Discord imzasını doğrula
*   Etkileşim türlerini yönlendir
*   Komutları, bileşenleri, modalları yönet
*   Geçerli JSON döndür

Bütün bunlar bir npm paketinde soyutlanabilir. Şöyle bir şey:

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

Bum. 200 yerine 20 satır. Nibiyi kolayca yarıya indirirdi.

Sonraya fikir.

## Dağıtım

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

Maliyet: günde 100 bin isteğe kadar **ücretsiz**. Ötesi: 0,50 $/milyon.

Spoiler: 10.000 aktif kullanıcın olmadıkça 100 bin isteği asla harcamayacaksın.

### Vercel

```plaintext
npm run vercel:deploy
```

URL: `https://mon-bot-xyz.vercel.app/api/interactions`

Aynısı, ücretsiz.

### İkisi birden

Hono her yerde çalışır. Aynı kodu hem Cloudflare hem Vercelde dağıtabilirsin. Yedeklilik ya da seçmeden önce test için kullanışlı.

## Hızlı kontrol listesi

1.  Discord Developer Portal üzerinde bir Uygulama oluştur
2.  PUBLIC\_KEY, BOT\_TOKEN, APP\_ID kopyala
3.  Projeyi oluştur:
4.  index.ts yaz (imza doğrulama + yönlendirme)
5.  Slash komutlarını kaydet (bir kez):
6.  Dağıt:
7.  URLyi Discorda koy (Developer Portal → Application → Interactions Endpoint URL)
8.  Discord bağlantıyı test eder (PINGe yanıt vermelisin)
9.  Botu bir sunucuya davet et
10.  Tamamdır

## Avantajlar ve Sınırlamalar

**Avantajlar**

*   Minimal maliyet (günde 100 bin isteğe kadar ücretsiz)
*   Ölçeklenebilir (bağlantı yönetimi olmadan)
*   Basit (WebSocket boilerplatei olmadan)
*   Hızlı (Cloudflare = uçta sunucular)
*   Taşınabilir (Hono kodu = birden çok host)

**Sınırlamalar**

*   Yalnızca etkileşimleri alırsın (slash komutları, düğmeler, modallar), gerçek zamanlı sunucu olayları olmadan (üye katıldı, rol eklendi, mesaj silindi vs.)
*   Yanıtlamak için 3 saniyelik timeout: yoksa Discord "Application did not respond" gösterir
*   Gerçek olaylar gerekirse: ayrı bir HTTP webhook ya da yardımcı bir WebSocket bağlantısı gerekir

Botların %90ı için (hepsi slash komut tabanlı)? Bu tamamdır.

## Sonuç olarak

KonosubaRPG ve Nibiyi ya olası en çok isteği tasarruf etmek, ya sıcak işlemci süresini azaltmak ya da soğuk başlatmayı kısaltmak için optimize ederek epey zaman geçirdim. Sonuç, hemen her şeyde sağlam performanslarım var.
Bil ki çoğu projemi bulutlaştırmaya başlamıştım (bunun denip denmediğini bile bilmiyorum) çünkü kendi VMimde barındırmaya devam etmeye anıtsal bir üşengeçliğim vardı. Gerçekten sanırım kıçımı kurtaran Github Actions oldu. Workerlar da ama aslında Github Actions ve zamanlamalarla daemonlar yapabileceğimi gördüğümde bu beni gerçekten kurtardı cidden.

Yakında [email-autoreply](https://github.com/fox3000foxy/email-autoreply/) adlı bir proje hakkında bir makale yazacağım, o yüzden yakında çıktığını görmek için RSS akışına abone olun :)).

**Akılda tutulacak 3 nokta:**

1.  **Interaction endpointleri = sunucusuz HTTP**: WebSocketsiz, kalıcı bağlantısız. Discord POSTlar, yanıtlarsın. Cloudflare üzerinde ücretsiz.
2.  **Hono mükemmel araçtır**: Hafif çerçeve (12 KB), çok çalışma ortamlı, sıfır bağımlılık. Cloudflare, Vercel, Node üzerinde aynı kod, her yerde.
3.  **Worker üzerinde görsel render = çılgınca**: Satori + Resvg (Wasm) JSX ile dinamik arayüzler besteleyip \<100 msde PNGye çevirmene izin verir. Tam bir oyun bunun üstünde dönebilir.

Bu hasta.

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
