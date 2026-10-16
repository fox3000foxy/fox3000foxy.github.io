---
title: "Passei um fim de semana lendo o código do konosuba-rpg e eis o que encontrei"
description: "Um RPG de turno no Discord onde cada ação gera uma imagem WebP na
  hora: URL como estado do jogo, RNG determinístico, pipeline WASM, cache 5
  níveis, bot serverless."
date: 2026-06-10
authors:
  - fox3000foxy
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
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "gVLwV/65rfvhbbbsjFQ4r4MihuF96vLwEqGWIeEqSg3BaB6fFoCmuBiuaj/41zThBSiJOSVdO6hzNDhraZL1jg=="
---

# Passei um fim de semana lendo o código do konosuba-rpg e eis o que encontrei

Mantenho este projeto há um tempo, mas reler o próprio código com calma é sempre instrutivo. konosuba-rpg é um RPG de turno no Discord onde cada ação gera uma imagem WebP na hora. Não é um embed de texto. Uma imagem composta de verdade, com sprites, barras de vida, mensagens de combate -- tudo.

A stack: TypeScript, Hono, Vercel, Cloudflare Workers, Supabase. Hospedagem totalmente gratuita. E o bot do Discord funciona sem servidor persistente. Este post explica como tudo se mantém junto.

![État initial du jeu](/images/konosuba-rpg/game_init.webp)

---

## O design básico: a URL como estado do jogo

A primeira coisa que impressiona: não há nenhum estado no lado do servidor para o gameplay. O estado completo de uma batalha está na URL.

```
/konosuba-rpg/fr/abc123/ATK/DEF/ATK/HUG?monster=Vanir&difficulty=hard
```

Cada segmento após a seed é uma ação jogada. O servidor recebe essa URL, volta ao início, reproduz todas as ações na ordem e retorna uma imagem da batalha naquele instante. Nenhuma sessão, nenhum estado em RAM vinculado a um usuário.

O Discord funciona com botões interativos -- quando o jogador aperta "Atacar", o Discord envia ao servidor o `custom_id` do botão. Esse custom_id contém a URL comprimida da batalha com a nova ação adicionada. O servidor recalcula tudo do zero e retorna a imagem atualizada.

```typescript
// processUrl.ts
const VALID_MOVES_SET = new Set(["ATK", "DEF", "HUG", "HEA", "SPE", "USE"]);
// Pré-compilado fora da função -- não recriado a cada chamada

export default function processUrl(url: string): [Random, string[], string, string | null, string | null] {
  const urlParts = url.split("/");
  const moves: string[] = [];
  for (const part of urlParts) {
    if (VALID_MOVES_SET.has(part.toUpperCase())) moves.push(part.toUpperCase());
  }
  // seed = 6º segmento, hasheado em 8096 valores
  const seedStr = (urlParts[5] || "").toLowerCase();
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed + seedStr.charCodeAt(i)) % 8096;
  }
  return [new Random(seed), moves, seedStr, monster, difficulty];
}
```

O `Set` pré-compilado fora da função é um detalhe, mas evita reconstruir a estrutura a cada invocação em um contexto edge onde os módulos podem ser reavaliados.

### O RNG: RC4 modificado

O gerador aleatório é uma implementação RC4 (algoritmo de cifra de fluxo) desviada para PRNG.

```typescript
export class Random {
  private S: number[]; // tabela de 256 entradas
  private i: number;
  private j: number;

  constructor(seed?: number) {
    this.S = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    let workingSeed = seed || Date.now();
    for (let i = 0; i < 256; i++) {
      j = (j + this.S[i] + (workingSeed & 0xff)) & 0xff;
      // swap S[i] e S[j]
      [this.S[i], this.S[j]] = [this.S[j], this.S[i]];
      workingSeed >>>= 8;
    }
  }

  next(): number { /* ... */ }
  randint(min: number, max: number): number { /* ... */ }
  choice(array: T[]): T { /* ... */ }
}
```

Por que RC4? Porque é um PRNG determinístico com distribuição correta e resistência razoável a colisões de seed. Mesma seed = mesma sequência de números = mesma batalha a cada vez. Isso permite "reproduzir" qualquer batalha mantendo sua URL, e garante que dois servidores diferentes (Vercel + Cloudflare) produzam exatamente o mesmo resultado para a mesma URL.

---

## O problema do limite de 100 caracteres do Discord

O Discord impõe um limite de 100 caracteres nos `custom_id` dos botões. Após algumas dezenas de ações, uma URL de batalha excede facilmente esse limite.

Dois mecanismos respondem a isso.

### 1. Compressão RLE das ações

As ações são codificadas com um único caractere (`a`=attack, `d`=defend, `h`=hug...) e comprimidas por run-length encoding:

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

Simples, mas quando o jogador spammeia Ataque x10, passa de `aaaaaaaaaa` (10 caracteres) para `a10` (3 caracteres). Os botões "Atacar x4" e "Atacar x10" na interface existem justamente para isso -- acelerar a batalha enquanto comprime bem o payload.

### 2. Tokens de sessão quando a compressão não é suficiente

Se o payload comprimido ainda for muito longo, ele é armazenado no banco com um token curto:

```typescript
// gameSessionService.ts
const TOKEN_PREFIX = "gs.";
const TOKEN_SIZE = 10; // "gs.aBcDeFgHiJ"

export async function encodeGameplayButtons(buttons: RawButton[]): Promise {
  // Agrupa os payloads por battle_key, insere em batch no Supabase
  // Substitui o custom_id por "gs.{token}:{userId}"
}

export async function decodeGameplayPayloadWithStatus(encodedPayload: string, userID: string) {
  if (!encodedPayload.startsWith(TOKEN_PREFIX)) {
    return { payload: encodedPayload }; // Sem lookup se não necessário
  }
  // Lookup em memória primeiro, depois Supabase se ausente
  const cached = tokenToSession.get(token) || await loadTokenRowByToken(token);
  // Verifica ownership, TTL (7 dias), e turn_version (evita reproduzir um estado antigo)
}
```

As sessões têm um TTL de 7 dias e uma limpeza automática a cada 10 minutos. A verificação `turnVersion` impede de reproduzir um estado desatualizado se o jogador avançou na partida -- uma proteção discreta contra o "retrocesso" acidental.

Os dois Maps em memória (`tokenToSession`, `latestTurnByBattle`) usam o mesmo padrão `globalThis as unknown as GameSessionGlobals` que os caches de imagem, pelas mesmas razões que veremos mais abaixo.

---

## O pipeline de renderização de imagem

![Début de combat contre un Slime](/images/konosuba-rpg/shot_01_start.webp)

A rota `/konosuba-rpg/:lang/*` não retorna JSON. Ela retorna uma imagem WebP gerada sob demanda.

O pipeline é organizado em 3 camadas compostas:

```
Background (board + frame)
    +
Characters layer (sprites jogadores + mob, posições fixas)
    +
UI overlay (barras HP, mensagens, ícones personagens via Satori → SVG → PNG)
    ↓
Photon.watermark() × 2
    ↓
WebP output
```

**Background**: duas imagens fixas (o tabuleiro e a moldura), carregadas do sistema de arquivos e compostas uma vez.

**Camada de personagens**: os sprites são posicionados de acordo com coordenadas calculadas. Jogadores mortos são excluídos (`activeSlots = slots.filter(s => playerHp[s.i] > 0)`). Os sprites inimigos são espelhados horizontalmente com um `flipX` customizado -- um loop pixel a pixel em vez de uma dependência externa.

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

**Sobreposição de UI**: é a parte pesada. O JSX da interface (barras de vida, textos, ícones) é descrito em React-like com Satori, renderizado em SVG, convertido para PNG por `@cf-wasm/resvg`, e então importado no Photon para a composição final. Satori + resvg são dois módulos WASM compilados especificamente para Cloudflare Workers com a flag `edge-light`.

![Action Défense](/images/konosuba-rpg/shot_03_defend.webp)

![Combat en cours](/images/konosuba-rpg/shot_02_combat.webp)

![Action Câlin](/images/konosuba-rpg/shot_04_hug.webp)

---

## O sistema de cache -- a parte mais trabalhada

Há 5 níveis de cache distintos. Cada um visa uma granularidade diferente do pipeline.

```typescript
// renderImage.ts -- todos em globalThis
G.__imageCache  ??= {} as Record; // assets brutos
G.__base64Cache ??= {} as Record;       // base64 dos assets (para Satori)
G.__fontCache   ??= {} as Record; // fontes
G.__photonCache    ??= new LRUCache(40, freePhoton);
G.__layerCache     ??= new LRUCache(12, freePhoton);
G.__uiPhotonCache  ??= new LRUCache(30, freePhoton);
G.__renderOutputCache ??= new LRUCache(120);
```

O padrão `??=` no `globalThis`: os módulos JavaScript nos workers edge podem ser reavaliados entre requisições em algumas configurações. Armazenar os caches no `globalThis` com `??=` garante que eles sobrevivam a essas reavaliações sem serem recriados.

### A evicção WASM

Os caches de imagem Photon (`photonCache`, `layerCache`, `uiPhotonCache`) usam um callback de evicção:

```typescript
function freePhoton(_key: string, img: Photon.PhotonImage): void {
  try { img.free(); } catch { /* já liberado */ }
}

new LRUCache(40, freePhoton)
```

`Photon.PhotonImage` é um objeto WASM com memória alocada no lado linear do WASM, fora do GC do JavaScript. Sem uma chamada explícita a `.free()`, essa memória nunca é liberada. A evicção do LRU aciona `.free()` automaticamente -- é RAII trazido para JavaScript.

### As chaves de cache são intencionalmente lossy

```typescript
function buildCharactersKey(playerImages: string[][], playerHp: number[], creatureImages: string[], creatureHp: number): string {
  const players = playerImages.map((imgs, i) => `${imgs[0]}:${playerHp[i] > 0 ? 1 : 0}`).join("|");
  return `chars::${players}::${creatureImages[0]}:${creatureHp > 0 ? 1 : 0}`;
}
```

A chave da camada de personagens não codifica o valor exato dos HP -- apenas `1` (vivo) ou `0` (morto). Porque o sprite de um jogador com 40 HP e de um jogador com 15 HP é idêntico. Um cache hit sobrevive a qualquer dano, desde que ninguém caia.

A chave da UI, por outro lado, codifica os HP exatos (a barra de vida muda a cada golpe) e um hash das mensagens:

```typescript
function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0; // inteiro 32-bit sinalizado
  }
  return hash.toString(16);
}
```

`Math.imul` força a multiplicação em inteiro de 32 bits, o que evita conversões float64 e dá um hash polinomial estável. Nenhuma dependência externa para isso.

### A conversão base64 sem stack overflow

```typescript
function getBase64Cached(key: string, buf: ArrayBuffer): string {
  if (base64Cache[key]) return base64Cache[key];
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000; // 32768 bytes
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  const b64 = btoa(binary);
  base64Cache[key] = b64;
  return b64;
}
```

`String.fromCharCode(...largeArray)` pode causar um stack overflow em imagens grandes porque os argumentos são passados na call stack. O chunking de 32KB evita isso. O resultado é armazenado em cache -- a conversão base64 de uma mesma imagem é feita apenas uma vez por instância de worker.

---

## STRIPPER.md -- auditoria de awaits sequenciais

Há um arquivo `STRIPPER.md` no repositório que documenta uma auditoria de paralelização dos `await`. Alguns exemplos do que está registrado:

- O carregamento do perfil do jogador fazia 3 requisições Supabase em série (progressão, resumo de run, achievements). Elas foram passadas para `Promise.all` -- não há dependência entre elas.
- A distribuição das recompensas de fim de batalha (acessórios + consumíveis) era sequencial. Paralelizada da mesma forma.
- A criação dos tokens de sessão para os botões era feita grupo por grupo. Os grupos independentes agora são criados em paralelo.

```typescript
// progressionService.ts -- antes (sequencial)
await grantAccessoryDropRewards(...);
await grantConsumableDropRewards(...);

// depois
await Promise.all([
  grantAccessoryDropRewards(...),
  grantConsumableDropRewards(...),
]);
```

Nada de revolucionário, mas em um contexto serverless onde cada milissegundo de tempo de resposta é faturado (ou contribui para o cold start), isso importa.

---

## O bot do Discord sem servidor persistente

![Victoire](/images/konosuba-rpg/shot_05_win.webp)

Ponto frequentemente mal compreendido: um bot do Discord não necessariamente requer uma conexão WebSocket persistente. O Discord oferece uma alternativa: as **Interactions Endpoint URL**. Você fornece uma URL HTTPS para o Discord, e o Discord envia um POST para cada interação (slash command, botão, autocomplete).

```typescript
// interactions.ts
export async function handleInteractions(c: Context) {
  const body = await c.req.text();
  const isVerified = await verifySignature(c, body); // Ed25519
  if (!isVerified) return c.text("Invalid signature", 401);

  const interaction: Interaction = JSON.parse(body);
  if (interaction.type === 1) return c.json({ type: 1 }); // ping Discord
  if (interaction.type === 2) return handleSlashCommand(...);
  if (interaction.type === 3) return handleButtonInteraction(...);
  if (interaction.type === 4) return handleAutocomplete(...);
}
```

O Discord envia um POST, o handler executa em 50-200ms em uma função Vercel ou um Cloudflare Worker, responde, e pronto. Nenhuma conexão permanente para manter, nenhum servidor para manter ligado. A totalidade do bot do Discord está hospedada no free tier da Vercel.

A verificação Ed25519 (`verifyKey` do `discord-interactions`) é obrigatória -- o Discord envia uma assinatura nos headers que você deve validar, caso contrário ele rejeita o endpoint.

### A animação especial -- o único await intencional

```typescript
// handleSpecialButton.ts
await new Promise(resolve => setTimeout(resolve, 3000)); // 3 segundos
await fetch(`${DISCORD_API_URL}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
  method: "PATCH",
  // ...
});
```

Esse atraso voluntário de 3 segundos está documentado no STRIPPER.md como intencional. O ataque especial da Megumin (Explosion) tem uma animação no Discord -- a mensagem é primeiro atualizada com um visual intermediário, e depois modificada 3 segundos depois com o resultado. É o único caso em que uma função Vercel executa voluntariamente por mais tempo que o necessário.

![Attaque spéciale](/images/konosuba-rpg/shot_08_special.webp)

---

## A capacidade de deploy em duas plataformas

O mesmo codebase executa no Vercel (Node.js) e no Cloudflare Workers (V8 isolates) sem modificação:

```typescript
// worker.ts -- entrypoint Cloudflare
export default {
  fetch(request: Request, env: WorkerBindings): Promise {
    syncBindingsToProcessEnv(env); // injeta os secrets CF no process.env
    return app.fetch(request, env, ctx);
  }
};

// index.ts -- entrypoint Vercel/Node
const isVercelRuntime = process.env.VERCEL === "1";
if (!isVercelRuntime) { start(); }
```

A diferença principal: os assets estáticos. No Vercel, eles são lidos do sistema de arquivos (`/var/task/assets/`). No Cloudflare Workers, eles passam por um binding `ASSETS` (assets estáticos CF) com fallback para um mirror HTTPS (`fox3000foxy.com/konosuba-rpg/assets`). O `getAssetBytes` no `assetLoader.ts` gerencia ambos os caminhos tentando o sistema de arquivos primeiro, depois fetch.

Os WASM (`@cf-wasm/photon/edge-light`, `@cf-wasm/resvg`) têm builds separados para cada runtime. A flag `edge-light` no nome do pacote designa o build compatível com Cloudflare Workers, que não permite `new WebAssembly.Module()` em runtime -- o WASM deve ser pré-compilado.

---

## A progressão: XP, níveis, afinidade

![Un boss, 650 HP](/images/konosuba-rpg/shot_06_boss.webp)

A meta-progressão se baseia no Supabase free tier. O esquema inclui uma tabela `players` (XP global, nível, gold), `character_progress` (XP/nível/afinidade por personagem para Darkness, Aqua, Megumin), `runs` (histórico de batalhas), `inventory_items`, `daily_quests_progress`, `achievements_unlocked`, `game_sessions`.

O modelo de progressão é simples:

```typescript
// characterService.ts
export function computeLevelFromXp(xp: number): number {
  return Math.floor(xp / 100) + 1; // 100 XP por nível
}

export function getLevelFactor(level: number): number {
  return 1 + 0.2 * (level - 1); // +20% stats por nível
}

export function getAffinityFactor(affinity: number): number {
  const stars = Math.floor(affinity / 20); // 20 pontos por estrela, 5 estrelas max
  return 1.2 ** stars; // progressão exponencial
}
```

Esses fatores são aplicados às stats dos personagens no início de cada `processGame`. Kazuma segue o nível global do jogador, os outros três têm cada um seu próprio XP/nível. A afinidade (ganha ao recuperar drops relacionados a um personagem) multiplica suas stats independentemente.

![Soin](/images/konosuba-rpg/shot_07_heal.webp)

O sistema de drops utiliza loot tables ponderadas por dificuldade:

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
  // ...até Legendary
};
```

---

## Os testes

Três suites: unitários, perf e leaks.

O teste de leak é particularmente direto:

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
  expect(after - before).toBeLessThan(20); // max 20MB de crescimento heap
});
```

1200 iterações de `processGame`, GC forçado antes e depois, delta heap < 20MB. Se esse teste passar, `processGame` não vaza. O teste de render (`renderImage.spec.ts`) verifica o tempo de execução sob um limite prático.

Há também um script `bench.ts` para perfilar o pipeline completo:

```
RENDER_PERF=1 npx tsx bench.ts --runs=20 --warmup=3 --monster=Dragon
```

Com `RENDER_PERF=1`, o wrapper `withPerf` em cada serviço registra os timings:

```typescript
export async function withPerf(scope: string, label: string, work: () => Promise): Promise {
  const perf = createPerfLogger(scope);
  if (!perf.enabled) return work(); // zero overhead se desativado
  perf.mark(`${label}:start`);
  try { return await work(); }
  finally { perf.done(`${label}:done`); }
}
```

`createPerfLogger` retorna no-ops se `DEV_MODE` e `RENDER_PERF` não estiverem em `1`. Nenhum overhead em produção.

---

## O que custa para manter funcionando

- **Vercel free tier**: 100GB de banda, 1M de invocações serverless por mês. A renderização de imagem conta como uma invocação.
- **Cloudflare Workers free tier**: 100K requisições/dia, 10ms de CPU time por requisição (a renderização pode exceder isso nos Workers, daí o Vercel como primário).
- **Supabase free tier**: 500MB de banco, 5GB de banda. Suficiente para milhares de jogadores.

Todo o backend funciona a custo zero até um volume significativo. O único ponto de atrito é o limite de CPU do Cloudflare Workers -- a renderização de imagem é CPU-intensive por causa do WASM, daí a estratégia do Vercel como primário e Workers como CDN de failover.

---

## As 3 coisas que merecem ser lembradas

1. **A URL como estado do jogo** não é apenas um truque legal -- é uma restrição imposta pelo Discord (os botões têm um limite de 100 caracteres) que forçou uma arquitetura stateless com compressão RLE + token de sessão como fallback. A restrição ditou o design.

2. **O cache WASM com evicção explícita**: os `PhotonImage` alocam fora do heap do JavaScript e nunca serão coletados pelo GC sem `.free()`. Conectar `freePhoton` à evicção do LRU é RAII em JavaScript. É discreto no código, mas sem isso o worker vazaria em produção.

3. **Um bot Discord serverless sem WebSocket**: é menos conhecido que a abordagem WebSocket gateway, mas para um bot que faz processamento stateless (cada interação é independente), o Interactions Endpoint é estritamente superior -- sem reconexão, sem heartbeat, sem processo para manter. O Discord gerencia a disponibilidade do lado da infraestrutura deles.

---

*Repo : [fox3000foxy/konosuba-rpg](https://github.com/fox3000foxy/konosuba-rpg)*

*Licença source-available customizada -- sem redistribuição, free to use.*
