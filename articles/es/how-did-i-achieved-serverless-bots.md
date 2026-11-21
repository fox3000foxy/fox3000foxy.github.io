---
title: "Bot Discord 100% serverless: Hono + Cloudflare Workers"
description: "Cómo reemplacé un bot Discord que me costaba 50€/mes por cero euros: interaction endpoints, Hono, Workers, render de imagen en tiempo real, y un juego completo sin WebSocket."
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
author_sig: "hI1MX7hJYhZM7BCFGsERuPmVl7M7wYbMPy06rXiBTMBCvyeMGeHtiwqu5td+O+Bc8zcA+KfGFgdDRvEYEaLHpA=="
---

## Bot Discord 100% serverless: Hono + Cloudflare Workers = 💸 cero

Pasé unos meses manteniendo bots Discord clásicos en mi propia máquina.

Conexión WebSocket siempre abierta. El bot reconecta solo a las 3 de la mañana. El bot crashea porque miro las ovejas mal de reojo. La factura sube.

Un día descubrí: **¿por qué mantener una conexión**? Discord puede simplemente postearte los eventos que te interesan. Respondes, listo.

Desde 2021, Discord ofrece los **interaction endpoints**.

Es solo HTTP. Trabajas sin WebSocket, sin estado persistente. Recibes una petición, envías JSON, se acabó. La petición siguiente llega sola.

Y lo mejor: Cloudflare Workers es **gratis** hasta 100k peticiones/día. Para el 90% de los bots, son 0€/mes.

Este artículo te muestra cómo hacer un bot Discord sin WebSocket usando **Hono** (framework web ultraligero) y **Cloudflare Workers**. Te voy a mostrar dos proyectos reales: **Nibi** (bot para aprender japonés, TTS, guay) y **Konosuba-RPG** (un juego Discord _completo_ con render de imagen en tiempo real).

## WebSocket vs. Interaction Endpoints: por qué era mala idea

Imagina un juego Minecraft donde tienes que mantener la conexión abierta incluso cuando no juegas.

Y el servidor se reconecta automáticamente cada vez que crashea. Tienes que gestionar los timeouts, las reconexiones exponenciales, todo el boilerplate de mierda que odiamos. Solo para recibir interacciones.

Los interaction endpoints son lo inverso. Discord hace POST a tu URL. Respondes. Se acabó.

¿Si tu servidor crashea? Discord reintenta 2-3 veces y pasa a otra cosa. Cero drama.

**Coste antes**: 50€/mes en Heroku solo para que un proceso Node siga vivo.

**Coste después**: 0€/mes en Cloudflare hasta 100k peticiones/día.

## La arquitectura: ¿qué es al justo?

Discord hace POST de una petición a tu endpoint.

```plaintext
Discord: "¡Eh! ¡El usuario hizo clic en /ping!"
      ↓
   Tu URL (Cloudflare Worker)
      ↓
 Compruebas que es de verdad Discord (chequeo de firma)
      ↓
 Parseas el tipo de interacción
      ↓
 Ejecutas el handler
      ↓
 Devuelves JSON
      ↓
Discord: "Guay, voy a mostrarle eso al usuario"
```

Es HTTP puro, con una stack mínima y legible.

## Hono + Cloudflare Workers: el combo económico

**Hono** es un framework web que pesa 12KB. Corre en todas partes: Cloudflare Workers, Vercel, AWS Lambda, Deno, Bun... el mismo código en todas partes.

Cloudflare Workers es cómputo en el edge. Tus peticiones llegan al servidor más cercano. Tiempo de respuesta: \<100ms. Coste: gratis hasta 100k peticiones/día.

El combo Hono + Cloudflare es el match perfecto para un bot Discord.

Aquí el código mínimo de un bot completo:

```typescript
import { Hono } from 'hono';
import { verifyKey } from 'discord-interactions';

const app = new Hono();

app.post('/interactions', async (c) => {
  // 1. Recupera las cabeceras
  const signature = c.req.header('x-signature-ed25519');
  const timestamp = c.req.header('x-signature-timestamp');
  const body = await c.req.text();

  // 2. Comprueba que es de verdad Discord (no spam)
  const isValid = verifyKey(
    body,
    signature,
    timestamp,
    c.env.PUBLIC_KEY
  );
  if (!isValid) return c.text('Invalid request', 401);

  // 3. Parsea lo que envió
  const interaction = JSON.parse(body);

  // 4. Responde según el tipo
  if (interaction.type === 1) {
    // Discord test (PING)
    return c.json({ type: 1 });
  }

  if (interaction.type === 2) {
    // Es un slash command
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

30 líneas bastan para un bot funcional.

Te olvidas de `bot.login()`, los event emitters y el callback hell. Solo guardas HTTP.

Para desplegar en Cloudflare:

```plaintext
npm install -D wrangler
npx wrangler deploy
```

Boom. Tienes una URL como `https://mon-bot.workers.dev/interactions`.

La metes en el Discord Developer Portal bajo "INTERACTIONS ENDPOINT URL", y Discord empieza a enviar tus interacciones ahí.

## Verificar la firma: nada de fake requests

Discord firma cada petición con una clave pública. ¿Si recibes una petición con mala firma? Es spam. Ignora y sigue.

El paquete `discord-interactions` hace el trabajo:

```typescript
import { verifyKey } from 'discord-interactions';

const isValid = verifyKey(
  rawBody,           // texto en bruto exacto (¡no JSON parseado!)
  signature,         // header x-signature-ed25519
  timestamp,         // header x-signature-timestamp
  publicKey          // de Discord Dev Portal
);
```

**Trampa importante**: la firma depende del body _exacto_. Si parseas JSON y re-stringify, o si logueas el body, rompes la firma.

Verifica primero. Parsea después. Ese es el orden que cuenta.

## Caso 1: Nibi (bot aprendizaje del japonés)

Nibi es un bot Discord para aprender japonés. Comandos simples:

*   `/dictionary kanji` → muestra las definiciones
*   `/pronounce テキスト` → genera TTS (text-to-speech)
*   `/hello` → mensaje de bienvenida

Cada comando es un archivo TypeScript:

```plaintext
src/commands/
├── dictionary.ts
├── pronounce.ts
├── hello.ts
└── ...
```

Un comando implementa esta interfaz:

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

### El comando /pronounce: hacer hablar al bot

Es el que es bien raro. Envías texto (romaji, hiragana, kanji, lo que sea), el bot lo convierte a hiragana, genera TTS vía VOICEVOX o Google TTS, y envía un mensaje audio en Discord.

```typescript
const pronounce: Command = {
  data: {
    name: 'pronounce',
    description: 'Genera TTS para texto japonés',
    options: [
      {
        type: 3,  // STRING
        name: 'text',
        description: 'Texto a pronunciar',
        required: true
      }
    ]
  },

  async execute(interaction, env) {
    const text = interaction.data.options[0].value;

    try {
      // 1. Convertir romaji → hiragana con Kuroshiro
      const hiragana = await kuroshiro.convert(text, { to: 'hiragana' });

      // 2. Generar el audio TTS
      const audioBuffer = await generateTTS(hiragana);

      // 3. Subir el archivo a Discord
      const uploadFilename = await uploadToDiscord(
        audioBuffer,
        interaction.channel.id,
        env.BOT_TOKEN
      );

      // 4. Enviar el mensaje con el audio
      await sendVoiceMessage(
        interaction.channel.id,
        uploadFilename,
        audioBuffer.length / 16000,  // duración en segundos
        env.BOT_TOKEN
      );

      return {
        type: 4,
        data: { content: `Pronunciación para "${text}"` }
      };
    } catch (err) {
      return {
        type: 4,
        data: {
          content: 'Error: imposible generar el audio xD',
          flags: 64  // ephemeral (mensaje privado)
        }
      };
    }
  }
};
```

Es una locura: llamas una API externa, subes un archivo a Discord, envías un mensaje con el archivo. Todo eso sin WebSocket, solo HTTP.

### Persistencia con Supabase

Nibi usa Supabase como key-value store. Para comprobar si un usuario está registrado:

```typescript
const DatabaseUtils = new DatabaseUtils({
  SUPABASE_URL: env.SUPABASE_URL,
  SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY
});

const users = await DatabaseUtils.readJson('users');
const user = users.find(u => u.id === interaction.member.user.id);

if (!user) {
  // Añadir el usuario
  users.push({ id: interaction.member.user.id, verified: true });
  await DatabaseUtils.writeJson('users', users);
}
```

Es muy básico (sin verdaderas consultas SQL, solo JSON), pero funciona. Para los bots pequeños es perfecto.

## Caso 2: Konosuba-RPG (juego Discord con render de imagen)

Okay esta es una locura.

Konosuba-RPG es un **juego completo** en Discord. Combates mobs, ganas XP, equipas accesorios, subes de nivel. Cada battle genera una **imagen** en tiempo real. Evitas los spritesheets prerenderizados. La imagen se compone dinámicamente desde las stats del jugador, el mob, y el estado del combate.

Y la imagen se genera en \<500ms en Cloudflare Workers. Literalmente.

### La arquitectura del render

```plaintext
Discord (haces clic en "Attack")
    ↓
Cloudflare Worker recibe la interacción
    ↓
Actualización del game state (XP, HP, etc.)
    ↓
Genera JSX con Satori
    ↓
Convierte SVG → PNG con Resvg (Wasm)
    ↓
Sube la imagen a Discord
    ↓
Envía el mensaje con la imagen
```

Todo eso en menos de un segundo. Es una locura.

### Render de imagen en Workers

Konosuba usa **Satori** (JSX → SVG) y **Resvg** (SVG → PNG):

```typescript
import { Satori } from 'satori';
import initWasm from '@cf-wasm/resvg';

async function renderBattle(gameState: GameState) {
  const resvg = await initWasm();

  // 1. Crear JSX para la UI
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

Escribes JSX normal. Se vuelve SVG. SVG se vuelve PNG. \<100ms en un Cloudflare Worker.

¿Captas la potencia? Es simplemente hermoso.

### Game state y progresión

Los datos del jugador están en Supabase:

```typescript
const player = await db
  .from('players')
  .select('*')
  .eq('discord_id', interaction.user.id)
  .single();

// El jugador ganó
const { data: updated } = await db
  .from('players')
  .update({
    level: player.level + 1,
    xp: player.xp + xpGain
  })
  .eq('id', player.id);
```

Cada acción (ataque, defensa, cura) actualiza las stats en base. Y luego regeneras la imagen con las nuevas stats.

### Interacciones: los botones del gameplay

El juego usa **button interactions** para las acciones en combate:

```typescript
{
  type: 1,  // ActionRow
  components: [
    {
      type: 2,  // Button
      style: 1,  // Primary (azul)
      label: 'Attack',
      custom_id: 'battle_attack'
    },
    {
      type: 2,
      style: 2,  // Secondary (gris)
      label: 'Defend',
      custom_id: 'battle_defend'
    }
  ]
}
```

Cuando haces clic en "Attack", Discord hace POST de una interacción con `custom_id: 'battle_attack'`. El handler la rutea:

```typescript
if (interaction.type === 3) {
  // Component interaction (button click, etc.)
  const customId = interaction.data.custom_id;

  if (customId === 'battle_attack') {
    return await handleAttack(interaction, env);
  }
  if (customId === 'battle_defend') {
    return await handleDefend(interaction, env);
  }
}
```

Y boom, calculas los daños, actualizas la base, regeneras la imagen, envías.

Es un juego turn-based completo sin ninguna persistencia de conexión. Solo HTTP stateless. Completamente roto.

## Supabase: la DB hecha para los Workers

Las bases de datos clásicas (PostgreSQL, MySQL, MongoDB) están diseñadas para conexiones TCP persistentes. Abres un socket, mantienes la conexión abierta, envías peticiones. Problema: **Cloudflare Workers no soporta las conexiones TCP persistentes**. Cada petición es un proceso efímero. En cuanto respondes al cliente, el Worker desaparece.

No puedes hacer esto:

```typescript
// Esto NO funciona en Workers
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();  // conexión TCP persistente = dead
```

E incluso los drivers PostgreSQL nativos como `pg` o `postgres.js` usan conexiones TCP. En Workers, petan.

**Supabase resuelve todo eso.**

Supabase es una API REST sobre PostgreSQL. Haces peticiones HTTP normales. Cada llamada es independiente, sin conexión persistente, sin estado que gestionar. Está perfectamente adaptado al modelo serverless.

```typescript
// Esto funciona PERFECTO en Workers
const { data, error } = await supabase
  .from('players')
  .select('*')
  .eq('discord_id', userId)
  .single();
```

El cliente Supabase (`@supabase/supabase-js`) usa `fetch` bajo el capó. Y `fetch` es nativo en Workers. Cero configuración, cero driver, cero conexión persistente.

| Base de datos | ¿Compatible Workers? | Por qué |
| --- | --- | --- |
| **Supabase** | ✅ Sí | REST API sin estado, HTTP puro |
| **PlanetScale (MySQL)** | ⚠️ Parcial | Conexión HTTPS solo, sin transacciones largas |
| **Neon** | ⚠️ Parcial | Ramas serverless pero driver TCP necesario |
| **Turso (libSQL)** | ⚠️ Parcial | HTTP posible pero limitado |
| **Prisma/Prisma Postgres** | ❌ No | Necesita TCP persistente |
| **MongoDB Atlas** | ❌ No | Driver TCP, sin REST API nativa |
| **Redis (Upstash)** | ✅ Sí | REST API HTTP |

La verdadera ventaja de Supabase no es solo la DB: es todo el ecosistema pensado edge-first:

- **Auth**: API REST para gestionar las sesiones, funciona sin estado
- **Storage**: Subida/descarga de archivos vía HTTP
- **Realtime**: WebSocket opcional, pero también puedes sondear vía REST
- **Row Level Security**: las reglas de seguridad están en la DB, no en tu backend

Para un bot Discord serverless, Supabase es la elección más simple y fiable. No configuras ningún driver, no mantienes ninguna conexión, no gestionas ningún timeout. Solo envías peticiones HTTP.

Si quieres un verdadero ejemplo, mira Nibi arriba: el código de persistencia es literalmente `readJson()` y `writeJson()` sobre Supabase. Arrancas sin migraciones, sin esquema complejo, sin config pesada. Funciona directo. Y si tu bot se vuelve grande, migras hacia verdaderas consultas SQL sin cambiar de provider.

## Polyfills: cuando Node quiere correr en Workers

Algunos paquetes esperan APIs Node. Kuromoji (parser kanji) usa `XMLHttpRequest`. Los Workers tienen `fetch`, no `XMLHttpRequest`.

Solución simple: añadir un polyfill arriba del index.ts:

```typescript
// Polyfill XMLHttpRequest para kuromoji
if (!globalThis.XMLHttpRequest) {
  globalThis.XMLHttpRequest = class {
    // Stub mínimo
  } as any;
}
```

O hacer un módulo dedicado:

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

Es hack básico, pero funciona.

## Hacia un paquete npm: hono-discord-interactions

A mano, hacer un bot es mucho boilerplate:

*   Comprueba la firma Discord
*   Rutea los tipos de interacción
*   Gestiona los comandos, components, modals
*   Devuelve JSON válido

Se podría abstraer todo eso en un paquete npm. Tipo:

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

Boum. 20 líneas en vez de 200. Eso reduciría Nibi a la mitad fácil.

Idea para más tarde.

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

URL resultante: `https://mon-bot.workers.dev/interactions`

Coste: **gratis** hasta 100k peticiones/día. Más allá: $0.50/millón.

Spoiler: nunca gastarás las 100k peticiones a menos que tengas 10 000 usuarios activos.

### Vercel

```plaintext
npm run vercel:deploy
```

URL: `https://mon-bot-xyz.vercel.app/api/interactions`

Igual, gratis.

### Ambos a la vez

Hono corre en todas partes. Puedes desplegar el mismo código en Cloudflare Y Vercel. Útil para la redundancia o probar antes de elegir.

## Checklist rápida

1.  Crear una Aplicación en el Discord Developer Portal
2.  Copiar PUBLIC_KEY, BOT_TOKEN, APP_ID
3.  Crear el proyecto:
4.  Escribir index.ts (verif firma + routing)
5.  Registrar los slash commands (una vez):
6.  Deploy:
7.  Meter la URL en Discord (Developer Portal → Application → Interactions Endpoint URL)
8.  Discord prueba la conexión (tienes que responder al PING)
9.  Invitar el bot a un servidor
10.  Listo

## Ventajas vs Limitaciones

**Ventajas**

*   Coste mínimo (gratis hasta 100k req/día)
*   Escalable (sin gestión de conexión)
*   Simple (sin boilerplate WebSocket)
*   Rápido (Cloudflare = servidores en el edge)
*   Portable (código Hono = varios hosts)

**Limitaciones**

*   Solo recibes las interacciones (slash commands, buttons, modals), sin los eventos servidor en tiempo real (miembro se une, rol añadido, mensaje borrado, etc.)
*   Timeout de 3 segundos para responder: si no Discord muestra "Application did not respond"
*   Si necesitas verdaderos events: hace falta un webhook HTTP separado o una conexión WebSocket auxiliar

¿Para el 90% de los bots (todo basado en slash commands)? Está bien.

## Para concluir

Pasé bastante tiempo optimizando KonosubaRPG y Nibi para ahorrar o bien el máximo de peticiones posibles, o bien para reducir el tiempo de procesador en caliente, o bien para reducir el boot cold. Resultado, tengo unos perfs de locos en casi todo.
Hay que saber que había empezado a cloudificar (ni siquiera sé si eso se dice) la mayoría de mis proyectos porque tenía una pereza monumental de seguir alojándolos en mi propia VM. De verdad, creo que son las Github Actions las que me salvaron el pellejo. Los workers también, pero en realidad cuando vi que podía hacer daemons con las Github Actions y los schedules, eso me salvó de verdad.

Seguro escribiré un artículo sobre un proyecto llamado [email-autoreply](https://github.com/fox3000foxy/email-autoreply/), ¡así que suscribíos al feed RSS para verlo salir próximamente :))!

**Los 3 puntos a recordar:**

1.  **Interaction endpoints = HTTP serverless**: sin WebSocket, sin conexión persistente. Discord hace POST, respondes. Gratis en Cloudflare.
2.  **Hono es la herramienta perfecta**: Framework ligero (12KB), multiruntime, cero dependencias. Código idéntico en Cloudflare, Vercel, Node, en todas partes.
3.  **Render de imagen en Workers = locura**: Satori + Resvg (Wasm) te deja componer UIs dinámicas en JSX y convertirlas en PNG en \<100ms. Un juego completo puede correr sobre eso.

Es una locura.

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
