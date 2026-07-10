---
title: "Discord bot 100% serverless : Hono + Cloudflare Workers"
description: Como substituí um bot Discord que me custava 50€/mês por
  zero euros -- interaction endpoints, Hono, Workers, renderização de imagem em
  tempo real, e um jogo completo sem WebSocket.
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
author_sig: "iFGrgUlf+eZo5w0KxiDSNitxLZexy6tTVpcpURdCeB459fI5u0Hj4Ccl5UGkfqKifIZmaGNU5zSs11WPBw/5Mw=="
---

## Discord bot 100% serverless : Hono + Cloudflare Workers = 💸 zero

Passei alguns meses mantendo bots Discord clássicos na minha própria máquina.

Conexão WebSocket sempre aberta. O bot reconecta sozinho às 3 da manhã. O bot crasha porque eu olhei pro lado errado. A conta sobe.

Um dia descobri: **por que manter uma conexão**? O Discord pode te enviar só as coisas que te interessam. Você responde, pronto.

Desde 2021, o Discord oferece os **interaction endpoints**.

É só HTTP. Sem WebSocket. Sem estado persistente. Você recebe uma requisição, envia JSON, acabou. A próxima requisição chega sozinha.

E o melhor: Cloudflare Workers é **gratuito** até 100k requisições/dia. Para 90% dos bots, são 0€/mês.

Este artigo mostra como fazer um bot Discord sem WebSocket usando **Hono** (framework web ultra-leve) e **Cloudflare Workers**. Vou mostrar dois projetos reais: **Nibi** (bot para aprender japonês, TTS, legal) e **Konosuba-RPG** (um jogo Discord _completo_ com renderização de imagem em tempo real xD).

## WebSocket vs. Interaction Endpoints: por que era uma má ideia

Imagine um jogo Minecraft onde você precisa manter a conexão aberta mesmo quando não está jogando.

E o servidor se reconecta automaticamente toda vez que crasha. Você precisa gerenciar timeouts, reconexões exponenciais, todo aquele boilerplate chato que a gente odeia. Só para receber interações.

Os interaction endpoints são o oposto. O Discord faz POST na sua URL. Você responde. Acabou.

Se seu servidor crasha? O Discord tenta de novo 2-3 vezes e segue em frente. Zero drama.

**Custo antes**: 50€/mês no Heroku só pra manter um processo Node vivo.

**Custo depois**: 0€/mês no Cloudflare até 100k requisições/dia.

## A arquitetura: o que é exatamente?

O Discord faz POST de uma requisição no seu endpoint.

```plaintext
Discord: "Ei! O usuário clicou em /ping!"
      ↓
   Sua URL (Cloudflare Worker)
      ↓
Você verifica se é realmente o Discord (verificação de assinatura)
      ↓
Você parseia o tipo de interação
      ↓
Você executa o handler
      ↓
Você retorna JSON
      ↓
Discord: "Legal, vou exibir isso pro usuário"
```

É HTTP puro. Sem magia. Sem bibliotecas pesadas.

## Hono + Cloudflare Workers: o combo econômico

**Hono** é um framework web que pesa 12KB. Roda em qualquer lugar: Cloudflare Workers, Vercel, AWS Lambda, Deno, Bun... o mesmo código em qualquer lugar.

Cloudflare Workers é computação no edge. Suas requisições chegam no servidor mais próximo. Tempo de resposta: \<100ms. Custo: gratuito até 100k requisições/dia.

O combo Hono + Cloudflare é a combinação perfeita para um bot Discord.

Aqui está o código mínimo de um bot completo:

```typescript
import { Hono } from 'hono';
import { verifyKey } from 'discord-interactions';

const app = new Hono();

app.post('/interactions', async (c) => {
  // 1. Pega os headers
  const signature = c.req.header('x-signature-ed25519');
  const timestamp = c.req.header('x-signature-timestamp');
  const body = await c.req.text();

  // 2. Verifica se é realmente o Discord (não é spam)
  const isValid = verifyKey(
    body,
    signature,
    timestamp,
    c.env.PUBLIC_KEY
  );
  if (!isValid) return c.text('Invalid request', 401);

  // 3. Parseia o que foi enviado
  const interaction = JSON.parse(body);

  // 4. Responde conforme o tipo
  if (interaction.type === 1) {
    // Teste do Discord (PING)
    return c.json({ type: 1 });
  }

  if (interaction.type === 2) {
    // É uma slash command
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

Tipo, 30 linhas e é um bot funcional.

Sem `bot.login()`. Sem event emitter. Sem callback hell. Só HTTP.

Para fazer deploy no Cloudflare:

```plaintext
npm install -D wrangler
npx wrangler deploy
```

Boom. Você tem uma URL tipo `https://meu-bot.workers.dev/interactions`.

Você coloca isso no Discord Developer Portal em "INTERACTIONS ENDPOINT URL", e o Discord começa a enviar suas interações pra lá.

## Verificar a assinatura: sem fake requests

O Discord assina cada requisição com uma chave pública. Se você recebe uma requisição com assinatura errada? É spam. Ignore e continue.

O pacote `discord-interactions` faz o trabalho:

```typescript
import { verifyKey } from 'discord-interactions';

const isValid = verifyKey(
  rawBody,           // texto bruto exato (não JSON parseado!)
  signature,         // header x-signature-ed25519
  timestamp,         // header x-signature-timestamp
  publicKey          // do Discord Dev Portal
);
```

**Armadilha importante**: a assinatura depende do body _exato_. Se você parsear JSON e re-stringificar, ou se der log no body, você quebra a assinatura.

Verifique primeiro. Parseie depois. É a ordem que importa.

## Caso 1: Nibi (bot de aprendizado de japonês)

Nibi é um bot Discord para aprender japonês. Comandos simples:

*   `/dictionary kanji` → exibe as definições
*   `/pronounce テキスト` → gera TTS (text-to-speech)
*   `/hello` → mensagem de boas-vindas

Cada comando é um arquivo TypeScript:

```plaintext
src/commands/
├── dictionary.ts
├── pronounce.ts
├── hello.ts
└── ...
```

Um comando implementa esta interface:

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

### O comando /pronounce: fazer o bot falar

Esse é o mais doido. Você envia texto (romaji, hiragana, kanji, qualquer coisa), o bot converte pra hiragana, gera TTS via VOICEVOX ou Google TTS, e envia uma mensagem de áudio no Discord.

```typescript
const pronounce: Command = {
  data: {
    name: 'pronounce',
    description: 'Gera TTS para texto em japonês',
    options: [
      {
        type: 3,  // STRING
        name: 'text',
        description: 'Texto a ser pronunciado',
        required: true
      }
    ]
  },

  async execute(interaction, env) {
    const text = interaction.data.options[0].value;

    try {
      // 1. Converter romaji → hiragana com Kuroshiro
      const hiragana = await kuroshiro.convert(text, { to: 'hiragana' });

      // 2. Gerar o áudio TTS
      const audioBuffer = await generateTTS(hiragana);

      // 3. Fazer upload do arquivo para o Discord
      const uploadFilename = await uploadToDiscord(
        audioBuffer,
        interaction.channel.id,
        env.BOT_TOKEN
      );

      // 4. Enviar a mensagem com o áudio
      await sendVoiceMessage(
        interaction.channel.id,
        uploadFilename,
        audioBuffer.length / 16000,  // duração em segundos
        env.BOT_TOKEN
      );

      return {
        type: 4,
        data: { content: `Pronúncia para "${text}"` }
      };
    } catch (err) {
      return {
        type: 4,
        data: {
          content: 'Erro: não foi possível gerar o áudio xD',
          flags: 64  // ephemeral (mensagem privada)
        }
      };
    }
  }
};
```

É loucura: você chama uma API externa, faz upload de um arquivo pro Discord, envia uma mensagem com o arquivo. Tudo isso sem WebSocket, só HTTP.

### Persistência com Supabase

Nibi usa Supabase como key-value store. Para verificar se um usuário está registrado:

```typescript
const DatabaseUtils = new DatabaseUtils({
  SUPABASE_URL: env.SUPABASE_URL,
  SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY
});

const users = await DatabaseUtils.readJson('users');
const user = users.find(u => u.id === interaction.member.user.id);

if (!user) {
  // Adicionar o usuário
  users.push({ id: interaction.member.user.id, verified: true });
  await DatabaseUtils.writeJson('users', users);
}
```

É bem básico (sem queries SQL de verdade, só JSON), mas funciona. Para bots pequenos é perfeito.

## Caso 2: Konosuba-RPG (jogo Discord com renderização de imagem)

Ok, essa é louca.

Konosuba-RPG é um **jogo completo** no Discord. Você luta contra mobs, ganha XP, equipa acessórios, sobe de nível. Cada batalha gera uma **imagem** em tempo real. Sem spritesheet pré-renderizada. A imagem é composta dinamicamente a partir das stats do jogador, do mob e do estado do combate.

E a imagem é gerada em \<500ms no Cloudflare Workers. Literalmente.

### A arquitetura de renderização

```plaintext
Discord (você clica "Attack")
    ↓
Cloudflare Worker recebe a interação
    ↓
Atualização do game state (XP, HP, etc.)
    ↓
Gera JSX com Satori
    ↓
Converte SVG → PNG com Resvg (Wasm)
    ↓
Faz upload da imagem para o Discord
    ↓
Envia a mensagem com a imagem
```

Tudo isso em menos de um segundo. É impressionante.

### Renderização de imagem nos Workers

Konosuba usa **Satori** (JSX → SVG) e **Resvg** (SVG → PNG):

```typescript
import { Satori } from 'satori';
import initWasm from '@cf-wasm/resvg';

async function renderBattle(gameState: GameState) {
  const resvg = await initWasm();

  // 1. Criar JSX para a UI
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

Você escreve JSX normal. Vira SVG. SVG vira PNG. \<100ms em um Cloudflare Worker.

Saca o poder? É simplesmente... lindo xD

### Game state e progressão

Os dados do jogador ficam no Supabase:

```typescript
const player = await db
  .from('players')
  .select('*')
  .eq('discord_id', interaction.user.id)
  .single();

// O jogador venceu
const { data: updated } = await db
  .from('players')
  .update({
    level: player.level + 1,
    xp: player.xp + xpGain
  })
  .eq('id', player.id);
```

Cada ação (ataque, defesa, cura) atualiza as stats no banco. E aí você regenera a imagem com as novas stats.

### Interações: os botões do gameplay

O jogo usa **button interactions** para as ações em combate:

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
      style: 2,  // Secondary (cinza)
      label: 'Defend',
      custom_id: 'battle_defend'
    }
  ]
}
```

Quando você clica em "Attack", o Discord faz POST de uma interação com `custom_id: 'battle_attack'`. O handler roteia isso:

```typescript
if (interaction.type === 3) {
  // Component interaction (clique em botão, etc.)
  const customId = interaction.data.custom_id;

  if (customId === 'battle_attack') {
    return await handleAttack(interaction, env);
  }
  if (customId === 'battle_defend') {
    return await handleDefend(interaction, env);
  }
}
```

E pronto, você calcula o dano, atualiza o banco, regenera a imagem, envia.

É um jogo turn-based completo sem nenhuma persistência de conexão. Apenas HTTP stateless. Completamente louco xD

## Supabase: a DB feita para os Workers

Bancos de dados clássicos (PostgreSQL, MySQL, MongoDB) são projetados para conexões TCP persistentes. Você abre um socket, mantém a conexão aberta, envia queries. Problema: **Cloudflare Workers não suporta conexões TCP persistentes**. Cada requisição é um processo efêmero. Assim que você responde ao cliente, o Worker desaparece.

Você não pode fazer isso:

```typescript
// Isso NÃO funciona no Workers
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();  // conexão TCP persistente = morto
```

E até mesmo os drivers nativos de PostgreSQL como `pg` ou `postgres.js` usam conexões TCP. No Workers, eles quebram.

**Supabase resolve tudo isso.**

Supabase é uma API REST sobre PostgreSQL. Você faz requisições HTTP normais. Cada chamada é independente, sem conexão persistente, sem estado para gerenciar. É perfeitamente adaptado ao modelo serverless.

```typescript
// Isso funciona PERFEITAMENTE no Workers
const { data, error } = await supabase
  .from('players')
  .select('*')
  .eq('discord_id', userId)
  .single();
```

O cliente Supabase (`@supabase/supabase-js`) usa `fetch` por baixo dos panos. E `fetch` é nativo no Workers. Zero configuração, zero driver, zero conexão persistente.

| Banco de dados | Compatível com Workers? | Por quê |
| --- | --- | --- |
| **Supabase** | ✅ Sim | REST API sem estado, HTTP puro |
| **PlanetScale (MySQL)** | ⚠️ Parcial | Conexão HTTPS apenas, sem transações longas |
| **Neon** | ⚠️ Parcial | Branches serverless mas driver TCP necessário |
| **Turso (libSQL)** | ⚠️ Parcial | HTTP possível mas limitado |
| **Prisma/Prisma Postgres** | ❌ Não | Requer TCP persistente |
| **MongoDB Atlas** | ❌ Não | Driver TCP, sem REST API nativa |
| **Redis (Upstash)** | ✅ Sim | REST API HTTP |

A verdadeira vantagem do Supabase não é só o banco -- é todo o ecossistema que é pensado edge-first:

- **Auth**: API REST para gerenciar sessões, funciona sem estado
- **Storage**: Upload/download de arquivos via HTTP
- **Realtime**: WebSocket opcional, mas você também pode fazer polling via REST
- **Row Level Security**: as regras de segurança estão no banco, não no seu backend

Para um bot Discord serverless, Supabase é a escolha mais simples e confiável. Sem driver para configurar, sem conexão para manter, sem timeouts. Apenas requisições HTTP.

Se você quiser um exemplo real, olhe o Nibi acima: o código de persistência é literalmente `readJson()` e `writeJson()` no Supabase. Sem migrations, sem schemas complexos, sem configuração louca. Funciona direto. E se seu bot crescer, você migra para queries SQL de verdade sem mudar de provider.

## Polyfills: quando o Node quer rodar no Workers

Alguns pacotes esperam APIs do Node. Kuromoji (parser de kanji) usa `XMLHttpRequest`. Os Workers têm `fetch`, não `XMLHttpRequest`.

Solução simples: adicionar um polyfill no topo do index.ts:

```typescript
// Polyfill XMLHttpRequest para kuromoji
if (!globalThis.XMLHttpRequest) {
  globalThis.XMLHttpRequest = class {
    // Stub mínimo
  } as any;
}
```

Ou fazer um módulo dedicado:

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

É um hack básico, mas funciona.

## Rumo a um pacote npm: hono-discord-interactions

Na mão, fazer um bot dá muito boilerplate:

*   Verificar a assinatura do Discord
*   Rotear os tipos de interação
*   Gerenciar comandos, components, modals
*   Retornar JSON válido

Dá pra abstrair tudo isso em um pacote npm. Tipo:

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

Boom. 20 linhas em vez de 200. Reduziria o Nibi pela metade fácil.

Ideia para depois xD

## Deploy

### Cloudflare Workers

```plaintext
npm install -D wrangler

# wrangler.toml
[env.production]
name = "meu-bot"
main = "src/index.ts"

# Secrets
wrangler secret put PUBLIC_KEY --env production
wrangler secret put BOT_TOKEN --env production
wrangler secret put SUPABASE_URL --env production

# Deploy
wrangler deploy --env production
```

URL resultante: `https://meu-bot.workers.dev/interactions`

Custo: **gratuito** até 100k requisições/dia. Acima disso: $0.50/milhão.

Spoiler: você nunca vai gastar as 100k requisições a menos que tenha 10.000 usuários ativos.

### Vercel

```plaintext
npm run vercel:deploy
```

URL: `https://meu-bot-xyz.vercel.app/api/interactions`

Mesma coisa, gratuito.

### Os dois ao mesmo tempo

Hono roda em qualquer lugar. Você pode fazer deploy do mesmo código no Cloudflare E no Vercel. Útil para redundância ou testar antes de escolher.

## Checklist rápida

1.  Criar uma Application no Discord Developer Portal
2.  Copiar PUBLIC\_KEY, BOT\_TOKEN, APP\_ID
3.  Criar o projeto:
4.  Escrever index.ts (verificação de assinatura + roteamento)
5.  Registrar as slash commands (uma vez):
6.  Fazer deploy:
7.  Colocar a URL no Discord (Developer Portal → Application → Interactions Endpoint URL)
8.  O Discord testa a conexão (você precisa responder ao PING)
9.  Convidar o bot para um servidor
10.  Pronto

## Vantagens vs Limitações

**Vantagens**

*   Barato (gratuito até 100k req/dia)
*   Escalável (sem gerenciamento de conexão)
*   Simples (sem boilerplate de WebSocket)
*   Rápido (Cloudflare = servidores no edge)
*   Portátil (código Hono = vários hosts)

**Limitações**

*   Sem eventos de servidor em tempo real (membro entrou, cargo adicionado, mensagem deletada, etc.) -- você recebe apenas as interações (slash commands, buttons, modals)
*   Timeout de 3 segundos para responder -- senão o Discord exibe "Application did not respond"
*   Se precisar de eventos reais -- precisa de um webhook HTTP separado ou uma conexão WebSocket auxiliar

Para 90% dos bots (tudo baseado em slash commands)? Está de bom tamanho.

## Para concluir

Passei bastante tempo otimizando KonosubaRPG e Nibi para economizar o máximo de requisições possível, ou para reduzir o tempo de processamento a quente, ou para reduzir o boot cold. Resultado, tenho performances incríveis em praticamente tudo.  
Saiba que eu comecei a "cloudificar" (nem sei se isso existe) a maioria dos meus projetos porque tinha uma preguiça monumental de continuar hospedando eles na minha própria VM. Sério, acho que foram as Github Actions que me salvaram a pele. Os workers também, mas na verdade quando vi que podia fazer daemons com as Github Actions e os schedules, isso realmente me salvou.

Vou provavelmente escrever um artigo sobre um projeto chamado [email-autoreply](https://github.com/fox3000foxy/email-autoreply/), então assinem o feed RSS para vê-lo sair em breve :)).

**Os 3 pontos para reter:**

1.  **Interaction endpoints = HTTP serverless** -- Sem WebSocket, sem conexão persistente. O Discord faz POST, você responde. Gratuito no Cloudflare.
2.  **Hono é a ferramenta perfeita** -- Framework leve (12KB), multi-runtime, zero dependências. Código idêntico no Cloudflare, Vercel, Node, em qualquer lugar.
3.  **Renderizar imagem no Workers = loucura** -- Satori + Resvg (Wasm) permite compor UIs dinâmicas em JSX e convertê-las em PNG em \<100ms. Um jogo completo pode rodar nisso.

É doente xD

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
