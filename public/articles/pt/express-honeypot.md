---
title: "Construí um honeypot Express ultra-realista"
description: "328 endpoints falsos com respostas geradas na hora, spoofing de cabeçalhos, registro de tráfego de bots -- mergulho no código de um middleware honeypot Express projetado para enganar scanners."
aiGenerated: true
tags:
  - express
  - nodejs
  - security
  - honeypot
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "aBQkdSWlAHMelk2TR9wj2GeCdarj6K9qaFhZzn2oNiD+H3PdL5hrCrSOFDl8+UeWCcM7xUlau4kiy9nB86W/NQ=="
---

## O que é um honeypot Express?

Um honeypot é um chamariz que imita um sistema real para atrair e detectar atacantes. No contexto de uma aplicação web Express, é um middleware que intercepta requisições suspeitas e responde com conteúdos falsos críveis, permitindo analisar o comportamento de bots e scanners sem expor dados reais.

**express-middleware-honeypot** é um pacote npm que transforma sua aplicação Express em um verdadeiro pote de mel. Ele expõe **328 endpoints** cobrindo uma ampla gama de alvos de ataque típicos -- arquivos de configuração, credenciais, páginas de administração, endpoints API, páginas de phishing bancário, e muito mais.

Cada endpoint gera uma resposta **na hora**, com timestamps e identificadores de requisição frescos, tornando cada resposta única e crível.

## Instalação

```bash
npm install express-middleware-honeypot
```

## Uso

### Registro automático com `register()`

A forma mais simples de usar o honeypot é chamando `register()` na sua aplicação Express. Isso registra todos os middlewares -- logging, cabeçalhos, manipulador 404 -- de uma só vez:

```js
const express = require("express");
const { createHoneypot } = require("express-middleware-honeypot");

const app = express();

const instance = createHoneypot({
    knownPaths: ["/", "/login", "/support"],
    knownPatterns: [/^\/blogs\/[^/]+$/],
    knownApiPaths: ["/api/cart", "/api/cart/list"],
    knownApiPatterns: [/^\/api\/cart\/[^/]+$/],
    logTraffic: true,
    is404Handler: true,
    isCompleteResponses: false,
});

instance.register(app);

app.listen(3000, () => {
    console.log("Server running on port 3000");
});
```

### Middleware único com `app.use()`

Para um controle mais preciso, você pode usar o middleware curinga:

```js
const { createHoneypot } = require("express-middleware-honeypot");

const app = express();

// Suas rotas reais primeiro
app.get("/", (req, res) => res.send("Home"));

// Depois o honeypot
const instance = createHoneypot({ /* opções */ });
app.use(instance.middleware);
app.use(instance.phpSpoofer);
```

### Mocks individuais com `app.all()`

Você também pode selecionar endpoints específicos:

```js
const instance = createHoneypot({ /* opções */ });

app.all('/admin', instance.mocks['/admin']);
app.all('/.env', instance.mocks['/.env']);
app.all('/wp-admin', instance.mocks['/wp-admin']);
```

`instance.mocks` é um `Record<string, Middleware>` indexado por caminho de endpoint.

## Spoofing de cabeçalhos

O middleware de cabeçalhos (`instance.headersMiddleware`) define cabeçalhos de resposta realistas -- `Server: nginx/1.24.0`, `X-Frame-Options`, `X-XSS-Protection`, e especialmente um cabeçalho `X-Powered-By` dinâmico baseado na extensão do arquivo:

- `.php` → `X-Powered-By: PHP/8.1.12`
- `.jsp` → `X-Powered-By: JSP/3.0`
- `.aspx/.ashx/.asmx` → `X-Powered-By: ASP.NET`
- `.do/.action` → `X-Powered-By: Servlet/3.0`
- Outros → sem cabeçalho `X-Powered-By`

```js
app.use(instance.headersMiddleware);
app.use(instance.middleware);
```

## PHP Spoofer

O `instance.phpSpoofer` vai além: ele intercepta requisições `*.php` e as **proxy para seu servidor PHP local**, retornando uma renderização PHP real em vez de uma resposta estática:

```js
app.use(instance.phpSpoofer);
```

Como funciona:
1. Captura requisições com `.php` no caminho
2. Remove o sufixo `.php` e faz proxy para `http://localhost:<port>/<base>`
3. Se seu servidor PHP local responder (Valet, Laravel, etc.), o HTML é retornado
4. Se o host não for localhost, retorna um 404 (previne ataques SSRF)
5. Sem servidor PHP local? Passa para o manipulador 404

Isso permite executar uma aplicação WordPress/PHP real localmente e servir páginas realmente renderizadas aos bots enquanto usa respostas estáticas em produção.

## Opções de configuração

| Opção | Tipo | Padrão | Descrição |
|---|---|---|---|
| `knownPaths` | `string[]` | `[]` | Caminhos gerenciados pela app real (excluídos dos mocks) |
| `knownPatterns` | `RegExp[]` | `[]` | Expressões regulares para caminhos reais |
| `knownApiPaths` | `string[]` | `[]` | Caminhos API da app real |
| `knownApiPatterns` | `RegExp[]` | `[]` | Expressões regulares para caminhos API reais |
| `logTraffic` | `boolean` | `false` | Registra todo o tráfego em `traffic.txt` |
| `is404Handler` | `boolean` | `false` | Registra um manipulador 404 de fallback |
| `isCompleteResponses` | `boolean` | `false` | Usa a variante «complete» (rica em detalhes) |
| `additionalEndpoints` | `string[]` | `["/not_covered_endpoint_test"]` | Endpoints adicionais além dos 328 integrados |
| `enrichResponses` | `boolean` | `true` | Enriquece respostas JSON com timestamp/versão |

## Os mocks -- 328 endpoints em duas variantes

O gerador de mocks (`src/services/mockupGenerator.ts`) produz respostas **na hora** para 328 endpoints, cada um em duas variantes:

- **Default** -- sucinto mas crível (`{ code: 0, message: "ok", data: {...} }`)
- **Complete** -- respostas ricas com timestamps, ID de requisição, metadados, cabeçalhos de versão, etc.

Para escrever os mocks em disco (depuração):

```bash
bun run scripts/generate-mockups.ts --dry-run          # apenas prévia
bun run scripts/generate-mockups.ts --list-uncategorized  # endpoints curinga
```

### Tipos de conteúdo servidos

| Tipo | Exemplos de endpoints |
|---|---|
| Vazamentos de credenciais | `.env`, `secrets.json`, `aws/credentials`, `etc/shadow` |
| Chaves SSH | `.ssh/id_rsa`, `.ssh/id_ed25519` |
| Configs de banco de dados | `config/database`, `wp-config.php`, `docker-compose.yml` |
| Painéis de administração | `/admin`, `/wp-admin`, `/manage/account/login` |
| Respostas API | `/api/version`, `/api/config`, `.do`, `.ashx` |
| Phishing bancário | `/lander/sber*`, `/index_sber.php` |
| Batimentos C2 | Rotas aleatórias de 6+ caracteres (`/262LBNFp`, `/Kd67Fq1x`) |
| Ações/Crypto | `/stock/mzhishu`, `/kline/1m/1`, `/m/allticker/1` |
| Jogos/Apostas | `/proxy/games`, `/Ctrls/GetSysCoin`, `/room/getRoomBangFans` |
| Arquivos de configuração | `config.json`, `config.yml`, `sitemap.xml`, `ads.txt` |
| Páginas iniciais | `/about`, `/contact`, `/products`, `/blog` |

## Endpoints de análise

| Rota | Descrição |
|---|---|
| `GET /newBotsRoute` | Retorna rotas desconhecidas não gerenciadas encontradas nos logs de tráfego |
| `GET /notCoveredAdditionalEndpoints` | Retorna endpoints adicionais não cobertos pelos 328 integrados |

## API HoneypotInstance

```ts
interface HoneypotInstance {
  mocks: Record<string, Middleware>;       // Manipuladores individuais
  middleware: Middleware;                  // Middleware curinga
  headersMiddleware: Middleware;           // Cabeçalhos de resposta realistas
  phpSpoofer: Middleware;                  // Middleware de spoofing PHP
  notFoundHandler: Middleware;             // Manipulador 404 de fallback
  register(app: RouteApp): void;           // Registra todos os manipuladores
  getUnhandledRoutes(): Promise<string[]>; // Rotas de bots não gerenciadas
  getNotCoveredEndpoints(): string[];      // Endpoints adicionais não cobertos
}
```

## Desenvolvimento

```bash
bun install
bun test          # 36+ testes
bun run build     # TypeScript → dist/
```

## Nota de segurança

Este pacote é uma ferramenta de chamariz/engano. Não exponha dados sensíveis reais através da sua aplicação enquanto ele estiver em execução.

## Licença

MIT

---

O código-fonte está disponível no GitHub : [express-honeypot-middleware](https://github.com/fox3000foxy/express-honeypot-middleware)
