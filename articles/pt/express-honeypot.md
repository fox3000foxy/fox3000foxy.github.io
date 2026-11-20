---
title: "Construí um honeypot Express ultrarrealista"
description: "328 endpoints falsos com respostas geradas em tempo real, spoofing de cabeçalhos, logging de tráfego bot, mergulho no coração de um middleware honeypot Express feito para enganar scanners."
date: 2026-06-10
aiGenerated: true
tags:
  - express
  - nodejs
  - security
  - honeypot
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "BLQV9GHwJUa7TqpqJRtX/IX4/2eJku5ZvjI6bDj2OZuIDKbnpfIik7j91OVsPG83ESnCnRNHckT/u42oc6n90g=="
---

## TL;DR

Criei um middleware Express que expõe **328 endpoints falsos** à escolha entre duas variantes : `default` (respostas sóbrias mas críveis) e `complete` (respostas bem detalhadas). Cada resposta é **gerada em tempo real** com timestamps e identificadores de requisição novos, o que torna cada resposta única. Não há nenhum arquivo mock no disco. O middleware também pode **registrar o tráfego** em um arquivo texto e expor as rotas não tratadas em `/newBotsRoute` para analisar o que os bots procuram.

**É bem mais do que um simples retorno de 404.** Projetei essa peça de engenharia para parecer um servidor de verdade, para os scanners perderem tempo nela. Vou mostrar como funciona.

## O problema

Bots de segurança, scrapers e agentes maliciosos escaneiam servidores web sem parar em busca de rotas comuns :

- `.env`, `wp-config.php`, `admin/`, `phpinfo.php`, etc.
- endpoints de API como `/api/version`, `/api/config`
- arquivos de configuração : `dump.sql`, `.git/config`, `docker-compose.yml`
- páginas de phishing bancário : `/lander/sberbank*`, `/index_sber.php`

Vi esse limite nos meus próprios servidores : devolver um 404 ou 403 indica na hora ao scanner que a rota não existe, então ele passa para a próxima. Escolhi o inverso com este honeypot : **fazer o scanner acreditar que tudo existe**, para fazê-lo perder tempo em respostas falsas enquanto seu servidor de verdade fica protegido atrás das suas rotas conhecidas.

## A arquitetura

### 1. Um classificador, não uma tabela de lookup

A peça principal é uma função `classify()` em `src/services/mockupGenerator.ts` que recebe um caminho de endpoint e devolve um gerador de resposta. Construí como uma cascata de regras :

1. **Correspondências exatas** : os endpoints mais comuns têm geradores dedicados
2. **Correspondências por padrão** : regex no caminho para detectar padrões como `id_rsa`, `wp-admin`, `sitemap.xml`
3. **Classificação inteligente** : caminhos como `/262LBNFp` (6+ caracteres aleatórios) são classificados como "batimentos de coração C2"
4. **Regras genéricas** : caminhos de API, arquivos `.php`, `.html`, `.js`, `.json` e `.asmx` têm geradores genéricos
5. **Catchall final** : `genCatchall()` produz uma resposta JSON genérica com metadados

Gosto dessa abordagem porque as respostas ficam **novas a cada requisição** : nenhum arquivo estático, nenhum cache, cada resposta carrega seu próprio timestamp como se viesse de um servidor de verdade.

### 2. O sistema de variante dupla

Cada gerador suporta duas variantes :

```typescript
// Variantes de resposta : concisa ou detalhada
type Variant = "default" | "complete";
```

- **`default`** : respostas concisas mas críveis. Exemplo para `.env` :
  ```
  DB_HOST=localhost
  DB_USER=root
  DB_PASS=s3cur3P@ss
  APP_ENV=development
  APP_DEBUG=true
  ```

- **`complete`** : respostas bem detalhadas. Exemplo para `.env` :
  ```
  # Database
  DB_CONNECTION=mysql
  DB_HOST=db-master-01.internal.example.com
  DB_PORT=3306
  DB_DATABASE=production_app_v2
  DB_USER=admin_service
  DB_PASS=mM9k#2$xL!qR7pZ

  # Redis
  REDIS_HOST=redis-cluster-01.internal.example.com
  REDIS_PORT=6379
  REDIS_PASSWORD=R3d!s_S3cur3_K3y_2025

  # App
  APP_ENV=production
  APP_DEBUG=false
  APP_URL=https://admin.internal.example.com
  APP_KEY=base64:qJ3fR8mL2pX5vB7nC4kA9wE1yH6sD0tG
  ...
  ```

A variante `complete` inclui também páginas HTML completas com CSS estilizado : páginas de administração, telas de login WordPress, páginas de phishing bancário em russo, etc. Acho imbatível quando você quer mesmo ocupar um scanner.

### 3. Geração em tempo real

Uso `Date.now()` e `Date().toISOString()` para produzir timestamps e identificadores de requisição únicos a cada chamada. Eis a função de enriquecimento :

```typescript
// Enriquece a resposta com timestamp e versão novos
function enrichResponse(response: Record<string, unknown>): Record<string, unknown> {
  return {
    ...response,
    timestamp: getTimestamp(),
    version: "1.0",
    lastUpdated: getTimestamp(),
  };
}
```

Para respostas JSON, o middleware tenta interpretar e enriquecer com esses campos. Respostas não JSON são devolvidas como estão.

### 4. O middleware de spoofing de cabeçalhos

Adicionei um middleware dedicado que define cabeçalhos HTTP realistas conforme a extensão do arquivo pedido :

```typescript
// Cabeçalhos realistas + X-Powered-By conforme a extensão
res.setHeader("Server", "nginx/1.24.0");
res.setHeader("X-Frame-Options", "SAMEORIGIN");
res.setHeader("X-XSS-Protection", "1; mode=block");
res.setHeader("X-Content-Type-Options", "nosniff");
res.setHeader("X-Robots-Tag", "noindex, nofollow");
res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

// X-Powered-By realista baseado na extensão do arquivo
if (path.endsWith(".php")) res.setHeader("X-Powered-By", "PHP/8.1.12");
else if (path.endsWith(".jsp")) res.setHeader("X-Powered-By", "JSP/3.0");
else if (path.endsWith(".aspx") || path.endsWith(".ashx") || path.endsWith(".asmx"))
  res.setHeader("X-Powered-By", "ASP.NET");
else if (path.endsWith(".do") || path.endsWith(".action"))
  res.setHeader("X-Powered-By", "Servlet/3.0");
```

Isso deixa as respostas bem mais críveis : um endpoint `.php` com `X-Powered-By: PHP/8.1.12` e `Server: nginx/1.24.0` parece exatamente um servidor WordPress de verdade. Faço questão desse detalhe porque muitas vezes é o cabeçalho que entrega um servidor falso.

### 5. O PHP Spoofer

O `phpSpoofer` continua sendo meu componente favorito. Se chega uma requisição para um arquivo `.php` e o host é localhost, o middleware faz **proxy** da requisição para seu servidor PHP local, que processa e devolve uma página PHP de verdade. Se o host é remoto, devolve um 404 para bloquear qualquer tentativa de SSRF.

```typescript
// Proxy para PHP local em localhost, 404 em host remoto (anti-SSRF)
const phpSpoofer = async (req, res, next) => {
  if (!req.path?.match(/\.php$/)) return next();
  const host = req.headers?.host;
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]")) {
    const baseUrl = req.originalUrl.replace(/\.php.*$/, "");
    const response = await fetch(`http://${host}${baseUrl}`);
    // devolve a resposta PHP real
  } else {
    res.status(404).send("404 Not Found");
  }
};
```

Isso permite, quando você roda WordPress localmente, ter o honeypot servindo páginas WordPress **de verdade** aos bots : o máximo de realismo na minha experiência.

### 6. Logging e análise de tráfego

Separei duas responsabilidades : o `TrafficService` registra cada requisição em um arquivo JSON-lines. O `UnhandledRoutesService` analisa depois esses logs para identificar os caminhos pedidos pelos bots que ainda faltam cobrir no honeypot.

```typescript
// Expõe as rotas pedidas pelos bots ainda não cobertas pelo honeypot
app.get("/newBotsRoute", async (_req, res) => {
  const routes = await unhandledRoutesService.getUnhandledRoutes(
    additionalEndpoints, knownPathOptions
  );
  res.setHeader("Content-Type", "text/plain");
  res.send(routes.join("\n"));
});
```

Adoro esse ciclo de feedback : quanto mais você deixa o honeypot rodar, mais aprende o que os bots procuram, e pode adicionar esses caminhos aos seus endpoints conhecidos.

### 7. Endpoints conhecidos e exclusão

O middleware aceita listas de `knownPaths`, `knownPatterns`, `knownApiPaths` e `knownApiPatterns`. Toda rota que bate com elas atravessa o middleware para sua aplicação de verdade. Acho esse filtro indispensável : seus endpoints reais ficam intactos, o honeypot nunca os intercepta.

```typescript
// Rota conhecida atravessa o honeypot para a aplicação real
const matches = (p) => p === endpoint || p.startsWith(endpoint + "/");
```

## Os 328 endpoints em detalhe

Veja como são classificados (trecho do classificador) :

| Categoria | Exemplos de endpoints |
|---|---|
| Vazamentos de credentials | `.env`, `secrets.json`, `aws/credentials`, `etc/shadow` |
| Chaves SSH | `.ssh/id_rsa`, `.ssh/id_ed25519` |
| Configs de banco de dados | `config/database`, `wp-config.php`, `docker-compose.yml` |
| Painéis de administração | `/admin`, `/wp-admin`, `/manage/account/login` |
| Respostas API | `/api/version`, `/api/config`, `.do`, `.ashx` |
| Phishing bancário | `/lander/sber*`, `/index_sber.php` |
| Batimentos de coração C2 | Caminhos aleatórios de 6+ caracteres (`/262LBNFp`) |
| Ações/Bolsa | `/stock/mzhishu`, `/kline/1m/1`, `/m/allticker/1` |
| Jogos/Cassino | `/proxy/games`, `/Ctrls/GetSysCoin`, `/room/getRoomBangFans` |
| Arquivos de configuração | `config.json`, `config.yml`, `sitemap.xml`, `ads.txt` |
| Landing pages | `/about`, `/contact`, `/products`, `/blog` |

## Códigos e endpoints especiais

Adicionei geradores especializados para casos específicos :

- **`genLanding()`** : páginas de phishing bancário em russo para СберБанк, Тинькофф, Газпромбанк
- **`genC2Heartbeat()`** : resposta de batimento de coração C2 realista com `agent_id`, `group`, `version`
- **`genScannerPath()`** : armadilhas para scanners específicos (portas nmap NICE, Hazelcast, CGI)
- **`genChineseApi()`** : respostas de API chinesas com `msg: "成功"` (sucesso)
- **`genMerchant()`** : perfis de comerciantes com `balance`, `fee_rate`, `tier`

## Como usar

### Instalação

```bash
# Instala o middleware honeypot
npm install express-middleware-honeypot
```

### Uso básico com autorregistro

```javascript
// Cria o honeypot com rotas conhecidas e registra no app Express
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
app.listen(3000);
```

### Com app.use() (middleware genérico único)

```javascript
// Honeypot genérico depois das rotas reais
const { createHoneypot } = require("express-middleware-honeypot");
const app = express();

// Suas rotas reais primeiro
app.get("/", (req, res) => res.send("Home"));

// Depois o honeypot genérico
const instance = createHoneypot({ /* options */ });
app.use(instance.headersMiddleware);
app.use(instance.middleware);
```

### Respostas completas vs. padrão

```javascript
// Respostas detalhadas com páginas HTML completas
const instance = createHoneypot({ isCompleteResponses: true });
```

### Logging de tráfego

```javascript
// Ativa o logging : ver traffic.txt para o que os bots pedem
const instance = createHoneypot({ logTraffic: true });
// Consulte o arquivo traffic.txt para ver o que os bots pedem
```

## Conclusão

Esse middleware honeypot Express vai bem além de uma simples isca. Com **328 endpoints**, **geração em tempo real**, **spoofing dinâmico de cabeçalhos**, **logging de tráfego** e até um **proxy PHP** para respostas WordPress de verdade, projetei para ficar o mais realista possível.

Os scanners perdem tempo em páginas de administração falsas, arquivos `.env` críveis e páginas de phishing bancário enquanto sua aplicação de verdade fica protegida. Gosto especialmente do sistema de variante dupla e da classificação inteligente : cada resposta fica nova e adaptada ao caminho pedido.

O código-fonte está no GitHub : [https://github.com/fox3000foxy/express-honeypot-middleware](https://github.com/fox3000foxy/express-honeypot-middleware)
