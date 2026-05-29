---
title: "Bot de Discord 100% serverless: Hono + Cloudflare Workers"
description: Cómo reemplacé un bot de Discord que me costaba 50€/mes por cero
  euros -- endpoints de interacción, Hono, Workers, renderizado de imágenes en
  tiempo real y un juego completo sin WebSocket.
date: 2026-05-29
tags:
  - discord
  - cloudflare
  - serverless
  - typescript
  - bots
authors:
  - fox3000foxy
---

## Discord bot 100% serverless : Hono + Cloudflare Workers = 💸 cero

Pasé varios meses manteniendo bots de Discord clásicos en mi propia máquina.

Conexión WebSocket siempre abierta. El bot se reconecta solo a las 3 AM. El bot crashea porque miro mal a las ovejas. La factura sube.

Un día descubrí: **¿para qué mantener una conexión**? Discord puede hacerte POST solo de las cosas que te interesan. Respondes y ya está.

Desde 2021, Discord ofrece los **interaction endpoints**.

Es solo HTTP. Nada de WebSocket. Sin estado persistente. Recibes una request, envías JSON, se acabó. La siguiente request llega solita.

Y lo mejor: Cloudflare Workers es **gratis** hasta 100k requests/día. Para el 90% de los bots, son 0€/mes.

Este artículo te muestra cómo hacer un bot de Discord sin WebSocket usando **Hono** (framework web ultra-ligero) y **Cloudflare Workers**. Te voy a mostrar dos proyectos reales: **Nibi** (bot para aprender japonés, TTS, cool) y **Konosuba-RPG** (un juego de Discord _completo_ con renderizado de imagen en tiempo real xD).

## WebSocket vs. Interaction Endpoints : por qué era una mala idea

Imagina un juego de Minecraft donde tienes que mantener la conexión abierta incluso cuando no estás jugando.

Y el servidor se reconecta automáticamente cada vez que crashea. Tienes que manejar los timeouts, las reconexiones exponenciales, todo el boilerplate de mierda que odiamos. Solo para recibir interacciones.

Los interaction endpoints son lo contrario. Discord hace POST a tu URL. Respondes. Se acabó.

¿Que tu servidor crashea? Discord reintenta 2-3 veces y sigue con lo suyo. Cero drama.

**Costo antes** : 50€/mes en Heroku solo para mantener un proceso Node vivo.

**Costo después** : 0€/mes en Cloudflare hasta 100k requests/día.

## La arquitectura : ¿qué es exactamente?

Discord hace POST de una request a tu endpoint.

```plaintext
Discord: "¡Eh! El usuario hizo clic en /ping!"
      ↓
   Tu URL (Cloudflare Worker)
      ↓
   Verificas que sea realmente Discord (signature check)
      ↓
   Parseas el tipo de interacción
      ↓
   Ejecutas el handler
      ↓
   Devuelves JSON
      ↓
Discord: "Cool, voy a mostrarle esto al usuario"
```

Es HTTP puro. Sin magia. Sin librerías pesadas.

## Hono + Cloudflare Workers : el combo ahorrador

**Hono** es un framework web que pesa 12KB. Funciona en todas partes: Cloudflare Workers, Vercel, AWS Lambda, Deno, Bun... el mismo código en todos lados.

Cloudflare Workers es compute en el edge. Tus requests llegan al servidor más cercano. Tiempo de respuesta: \<100ms. Costo: gratis hasta 100k requests/día.

El combo Hono + Cloudflare es el match perfecto para un bot de Discord.

Aquí está el código mínimo de un bot completo:

```typescript
import { Hono } from 'hono';
import { verifyKey } from 'discord-interactions';

const app = new Hono();

app.post('/interactions', async (c) => {
  // 1. Obtén los headers
  const signature = c.req.header('x-signature-ed25519');
  const timestamp = c.req.header('x-signature-timestamp');
  const body = await c.req.text();

  // 2. Verifica que sea realmente Discord (nada de spam)
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
    // Es una slash command
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

Como, 30 líneas y ya tienes un bot funcional.

Nada de `bot.login()`. Nada de event emitter. Nada de callback hell. Solo HTTP.

Para deploy en Cloudflare:

```plaintext
npm install -D wrangler
npx wrangler deploy
```

Boom. Tienes una URL tipo `https://mon-bot.workers.dev/interactions`.

Pones eso en Discord Developer Portal bajo "INTERACTIONS ENDPOINT URL", y Discord empieza a enviar tus interacciones allí.

## Verificar la firma : nada de fake requests

Discord firma cada request con una clave pública. ¿Recibes una request con mala firma? Es spam. Ignóralo y sigue.

El paquete `discord-interactions` hace el trabajo:

```typescript
import { verifyKey } from 'discord-interactions';

const isValid = verifyKey(
  rawBody,           // texto bruto exacto (¡no JSON parseado!)
  signature,         // header x-signature-ed25519
  timestamp,         // header x-signature-timestamp
  publicKey          // de Discord Dev Portal
);
```

**Trampa importante** : la firma depende del body _exacto_. Si parseas JSON y lo re-stringificas, o si logueas el body, rompes la firma.

Verifica primero. Parsea después. Ese es el orden que importa.

## Caso 1 : Nibi (bot de aprendizaje de japonés)

Nibi es un bot de Discord para aprender japonés. Comandos simples:

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

### El comando /pronounce : hacer hablar al bot

Este es el bien loco. Envías texto (romaji, hiragana, kanji, lo que sea), el bot lo convierte a hiragana, genera TTS con VOICEVOX o Google TTS, y envía un mensaje de audio en Discord.

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
          content: 'Error: no se pudo generar el audio xD',
          flags: 64  // ephemeral (mensaje privado)
        }
      };
    }
  }
};
```

Es una locura: llamas a una API externa, subes un archivo a Discord, envías un mensaje con el archivo. Todo sin WebSocket, solo HTTP.

### Persistencia con Supabase

Nibi usa Supabase como key-value store. Para verificar si un usuario está registrado:

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

Es muy básico (nada de SQL de verdad, solo JSON), pero funciona. Para bots pequeños es perfecto.

## Caso 2 : Konosuba-RPG (juego de Discord con renderizado de imagen)

Okay, este está loco.

Konosuba-RPG es un **juego completo** en Discord. Combates mobs, ganas XP, equipas accesorios, subes de nivel. Cada batalla genera una **imagen** en tiempo real. Nada de spritesheet pre-renderizado. La imagen se compone dinámicamente desde las stats del jugador, el mob, y el estado del combate.

Y la imagen se genera en \<500ms en Cloudflare Workers. Literalmente.

### La arquitectura del renderizado

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

Todo esto en menos de un segundo. Es una locura.

### Renderizado de imagen en Workers

Konosuba usa **Satori** (JSX → SVG) y **Resvg** (SVG → PNG):

```typescript
import { Satori } from 'satori';
import initWasm from '@cf-wasm/resvg';

async function renderBattle(gameState: GameState) {
  const resvg = await initWasm();

  // 1. Crear JSX para la UI
  const jsx = (
    <div style="{{" display:="" 'flex',="" gap:="" '20px'="" }}>
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

Escribes JSX normal. Se convierte en SVG. SVG se convierte en PNG. \<100ms en un Cloudflare Worker.

¿Captas el poder? Es simplemente... hermoso xD

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

Cada acción (ataque, defensa, cura) actualiza las stats en la base de datos. Y luego regeneras la imagen con las nuevas stats.

### Interacciones : los botones del gameplay

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

Cuando haces clic en "Attack", Discord hace POST de una interacción con `custom_id: 'battle_attack'`. El handler enruta eso:

```typescript
if (interaction.type === 3) {
  // Component interaction (clic en botón, etc.)
  const customId = interaction.data.custom_id;

  if (customId === 'battle_attack') {
    return await handleAttack(interaction, env);
  }
  if (customId === 'battle_defend') {
    return await handleDefend(interaction, env);
  }
}
```

Y boom, calculas el daño, actualizas la base, regeneras la imagen, envías.

Es un juego por turnos completo sin ninguna persistencia de conexión. Solo HTTP stateless. Totalmente roto xD

## Supabase: la base de datos hecha para Workers

Las bases de datos tradicionales (PostgreSQL, MySQL, MongoDB) están diseñadas para conexiones TCP persistentes. Abres un socket, mantienes la conexión abierta, envías consultas. Problema: **Cloudflare Workers no soporta conexiones TCP persistentes**. Cada petición es un proceso efímero. En cuanto respondes al cliente, el Worker desaparece.

No puedes hacer esto:

```typescript
// Esto NO funciona en Workers
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();  // conexión TCP persistente = muerto
```

Incluso los drivers nativos de PostgreSQL como `pg` o `postgres.js` usan conexiones TCP. En Workers, se caen.

**Supabase lo resuelve todo.**

Supabase es una API REST sobre PostgreSQL. Haces peticiones HTTP normales. Cada llamada es independiente, sin conexión persistente, sin estado que gestionar. Es perfecto para el modelo serverless.

```typescript
// Esto funciona PERFECTAMENTE en Workers
const { data, error } = await supabase
  .from('players')
  .select('*')
  .eq('discord_id', userId)
  .single();
```

El cliente de Supabase (`@supabase/supabase-js`) usa `fetch` internamente. Y `fetch` es nativo en Workers. Cero configuración, cero driver, cero conexión persistente.

| Base de datos | ¿Compatible con Workers? | Por qué |
| --- | --- | --- |
| **Supabase** | ✅ Sí | API REST sin estado, HTTP puro |
| **PlanetScale (MySQL)** | ⚠️ Parcial | Conexión HTTPS solamente, sin transacciones largas |
| **Neon** | ⚠️ Parcial | Ramas serverless pero necesita driver TCP |
| **Turso (libSQL)** | ⚠️ Parcial | HTTP posible pero limitado |
| **Prisma/Prisma Postgres** | ❌ No | Necesita TCP persistente |
| **MongoDB Atlas** | ❌ No | Driver TCP, sin API REST nativa |
| **Redis (Upstash)** | ✅ Sí | API REST sobre HTTP |

La verdadera ventaja de Supabase no es solo la BD -- es todo el ecosistema pensado para edge:

- **Auth**: API REST para sesiones, funciona sin estado
- **Storage**: Subida/descarga de archivos vía HTTP
- **Realtime**: WebSocket opcional, pero puedes hacer poll vía REST
- **Row Level Security**: las reglas de seguridad viven en la BD, no en tu backend

Para un bot de Discord serverless, Supabase es la opción más simple y fiable. Sin driver que configurar, sin conexión que mantener, sin timeouts. Solo peticiones HTTP.

Si quieres un ejemplo real, mira Nibi más arriba: su código de persistencia es literalmente `readJson()` y `writeJson()` sobre Supabase. Sin migraciones, sin esquemas complejos, sin configuraciones locas. Funciona de inmediato. Y si tu bot crece, puedes migrar a consultas SQL reales sin cambiar de proveedor.

## Polyfills : cuando Node quiere funcionar en Workers

Algunos paquetes esperan APIs de Node. Kuromoji (parser de kanji) usa `XMLHttpRequest`. Los Workers tienen `fetch`, no `XMLHttpRequest`.

Solución simple: añadir un polyfill al inicio del index.ts:

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

Es un hack básico, pero funciona.

## Hacia un paquete npm : hono-discord-interactions

A mano, hacer un bot tiene mucho boilerplate:

*   Verificar la firma de Discord
*   Enrutar los tipos de interacción
*   Manejar comandos, components, modals
*   Devolver JSON válido

Podríamos abstraer todo eso en un paquete npm. Algo como:

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

Bum. 20 líneas en vez de 200. Reduciría Nibi a la mitad fácil.

Idea para después xD

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

Costo: **gratis** hasta 100k requests/día. Más allá: $0.50/millón.

Spoiler: nunca gastarás las 100k requests a menos que tengas 10 000 usuarios activos.

### Vercel

```plaintext
npm run vercel:deploy
```

URL: `https://mon-bot-xyz.vercel.app/api/interactions`

Igual, gratis.

### Ambos a la vez

Hono funciona en todos lados. Puedes desplegar el mismo código en Cloudflare Y Vercel. Útil para redundancia o probar antes de elegir.

## Checklist rápida

1.  Crear una Application en Discord Developer Portal
2.  Copiar PUBLIC\_KEY, BOT\_TOKEN, APP\_ID
3.  Crear el proyecto:
4.  Escribir index.ts (verificar firma + routing)
5.  Registrar los slash commands (una vez):
6.  Deploy:
7.  Poner la URL en Discord (Developer Portal → Application → Interactions Endpoint URL)
8.  Discord prueba la conexión (debes responder al PING)
9.  Invitar el bot a un servidor
10.  Ya está

## Ventajas vs Limitaciones

**Ventajas**

*   Barato (gratis hasta 100k req/día)
*   Escalable (sin gestión de conexiones)
*   Simple (sin boilerplate de WebSocket)
*   Rápido (Cloudflare = servidores en el edge)
*   Portable (código Hono = varios hosts)

**Limitaciones**

*   Sin eventos de servidor en tiempo real (miembro se une, rol añadido, mensaje eliminado, etc.) -- solo recibes interacciones (slash commands, buttons, modals)
*   Timeout de 3 segundos para responder -- si no, Discord muestra "Application did not respond"
*   Si necesitas eventos de verdad -- necesitas un webhook HTTP separado o una conexión WebSocket auxiliar

¿Para el 90% de los bots (todo basado en slash commands)? Está bien.

## Para concluir

Pasé bastante tiempo optimizando KonosubaRPG y Nibi para ahorrar la mayor cantidad de requests posibles, o para reducir el tiempo de procesador en caliente, o para reducir el boot cold. Resultado, tengo unas buenas perfos en casi todo.
Hay que saber que empecé a cloudificar (ni siquiera sé si esa palabra existe) la mayoría de mis proyectos porque tenía una pereza monumental de seguir alojándolos en mi propia VM. De verdad, creo que fueron las Github Actions las que me salvaron el pellejo. Los workers también, pero en cuanto vi que podía hacer daemons con las Github Actions y los schedules, eso sí que me salvó de verdad.

Seguramente escribiré un artículo sobre un proyecto llamado [email-autoreply](https://github.com/fox3000foxy/email-autoreply/), así que suscríbete al feed RSS para verlo salir próximamente :))

**Las 3 cosas para recordar:**

1.  **Interaction endpoints = HTTP serverless** -- Nada de WebSocket, nada de conexión persistente. Discord hace POST, tú respondes. Gratis en Cloudflare.
2.  **Hono es la herramienta perfecta** -- Framework ligero (12KB), multi-runtime, cero dependencias. Código idéntico en Cloudflare, Vercel, Node, en todos lados.
3.  **Renderizar imagen en Workers = locura** -- Satori + Resvg (Wasm) te deja componer UIs dinámicas en JSX y convertirlas a PNG en \<100ms. Un juego completo puede funcionar con eso.

Es una locura xD

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
