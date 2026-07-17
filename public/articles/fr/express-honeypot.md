---
title: "J'ai construit un honeypot Express ultra-réaliste"
description: "328 faux endpoints avec réponses générées à la volée, spoofing d'en-têtes, logging du trafic bot -- plongée au cœur d'un middleware honeypot Express conçu pour leurrer les scanners."
date: 2026-06-10
aiGenerated: true
tags:
  - express
  - nodejs
  - security
  - honeypot
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "fTf4D+r9rVXa7BIAwh0XnC98K6uAMMQv1axbW89oQvpkL2zDhCnoX12c55wbHJ8lR5juhXMo7Ugpp9oGPUHcYw=="
---

## TL;DR

J'ai créé un middleware Express qui expose **328 endpoints factices** au choix parmi deux variantes : `default` (réponses sobres mais crédibles) et `complete` (réponses très détaillées). Chaque réponse est **générée à la volée** avec des timestamps et des identifiants de requête frais, ce qui rend chaque réponse unique. Il n'y a aucun fichier mock sur le disque. Le middleware peut également **journaliser le trafic** dans un fichier texte et exposer les routes non gérées sur `/newBotsRoute` pour analyser ce que les bots cherchent.

**Ce n'est pas juste un autre renvoi de 404.** C'est un pièce d'ingénierie conçue pour ressembler à un vrai serveur afin que les scanners gaspillent leur temps. Voyons comment ça marche.

## Le problème

Les bots de sécurité, les scrapers et les acteurs malveillants scannent constamment les serveurs web à la recherche de routes courantes :

- `.env`, `wp-config.php`, `admin/`, `phpinfo.php`, etc.
- endpoints d'API comme `/api/version`, `/api/config`
- fichiers de configuration : `dump.sql`, `.git/config`, `docker-compose.yml`
- pages de phishing bancaire : `/lander/sberbank*`, `/index_sber.php`

Une approche typique consiste à bloquer ces requêtes, à renvoyer un 404 ou un 403. Mais cela donne immédiatement au scanner une information précieuse : la route n'existe pas, donc il passe à la suivante. Un honeypot fait l'inverse : **il fait croire au scanner que tout existe**, le faisant perdre du temps à traiter de fausses réponses pendant que votre vrai serveur est protégé derrière des routes connues.

## L'architecture

### 1. Un classifieur, pas une lookup table

La pièce maîtresse est une fonction `classify()` dans `src/services/mockupGenerator.ts` qui prend un chemin d'endpoint et retourne un générateur de réponse. Cette fonction contient des règles hiérarchiques :

1. **Correspondances exactes** -- les endpoints les plus courants ont des générateurs dédiés
2. **Correspondances par motif** -- regex sur le chemin pour détecter des motifs comme `id_rsa`, `wp-admin`, `sitemap.xml`
3. **Classification intelligente** -- chemins comme `/262LBNFp` (6+ caractères aléatoires) sont classifiés comme "battements de cœur C2"
4. **Règles fourre-tout** -- les chemins d'API, les fichiers `.php`, `.html`, `.js`, `.json` et `.asmx` ont des générateurs génériques
5. **Catchall final** -- `genCatchall()` produit une réponse JSON générique avec des métadonnées

Cette approche signifie que les réponses sont **fraîches à chaque requête** -- pas de fichiers statiques, pas de mise en cache, chaque réponse semble provenir d'un vrai serveur avec son propre timestamp.

### 2. Le système de double variante

Chaque générateur supporte deux variantes :

```typescript
type Variant = "default" | "complete";
```

- **`default`** -- réponses concises mais crédibles. Exemple pour `.env` :
  ```
  DB_HOST=localhost
  DB_USER=root
  DB_PASS=s3cur3P@ss
  APP_ENV=development
  APP_DEBUG=true
  ```

- **`complete`** -- réponses très détaillées. Exemple pour `.env` :
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

La variante `complete` inclut également des pages HTML complètes avec CSS stylisé -- pages d'administration, écrans de connexion WordPress, pages de phishing bancaire en russe, etc.

### 3. Génération à la volée

Le générateur utilise `Date.now()` et `Date().toISOString()` pour produire des timestamps et des identifiants de requête uniques à chaque appel. Voici la fonction d'enrichissement :

```typescript
function enrichResponse(response: Record<string, unknown>): Record<string, unknown> {
  return {
    ...response,
    timestamp: getTimestamp(),
    version: "1.0",
    lastUpdated: getTimestamp(),
  };
}
```

Pour les réponses JSON, le middleware tente de parser et d'enrichir avec ces champs. Les réponses non-JSON sont renvoyées telles quelles.

### 4. Le middleware de spooofing d'en-têtes

Un middleware dédié définit des en-têtes HTTP réalistes en fonction de l'extension du fichier demandé :

```typescript
res.setHeader("Server", "nginx/1.24.0");
res.setHeader("X-Frame-Options", "SAMEORIGIN");
res.setHeader("X-XSS-Protection", "1; mode=block");
res.setHeader("X-Content-Type-Options", "nosniff");
res.setHeader("X-Robots-Tag", "noindex, nofollow");
res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

// X-Powered-By réaliste basé sur l'extension du fichier
if (path.endsWith(".php")) res.setHeader("X-Powered-By", "PHP/8.1.12");
else if (path.endsWith(".jsp")) res.setHeader("X-Powered-By", "JSP/3.0");
else if (path.endsWith(".aspx") || path.endsWith(".ashx") || path.endsWith(".asmx"))
  res.setHeader("X-Powered-By", "ASP.NET");
else if (path.endsWith(".do") || path.endsWith(".action"))
  res.setHeader("X-Powered-By", "Servlet/3.0");
```

Cela rend les réponses beaucoup plus crédibles -- un endpoint `.php` avec `X-Powered-By: PHP/8.1.12` et `Server: nginx/1.24.0` ressemble exactement à un vrai serveur WordPress.

### 5. Le PHP Spoofer

L'un des composants les plus intéressants est le `phpSpoofer`. Si une requête arrive pour un fichier `.php` et que l'hôte est localhost, le middleware **proxifie** la requête vers votre serveur PHP local, qui traite et renvoie une vraie page PHP. Si l'hôte n'est pas localhost, il renvoie un 404 (pour empêcher les attaques SSRF).

```typescript
const phpSpoofer = async (req, res, next) => {
  if (!req.path?.match(/\.php$/)) return next();
  const host = req.headers?.host;
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]")) {
    const baseUrl = req.originalUrl.replace(/\.php.*$/, "");
    const response = await fetch(`http://${host}${baseUrl}`);
    // renvoie la réponse PHP réelle
  } else {
    res.status(404).send("404 Not Found");
  }
};
```

Cela permet aux développeurs qui exécutent WordPress en local d'avoir le honeypot qui sert de **vraies** pages WordPress aux bots -- le nec plus ultra du réalisme.

### 6. Journalisation et analyse du trafic

Le `TrafficService` journalise chaque requête dans un fichier JSON-lines. Le `UnhandledRoutesService` analyse ensuite ces logs pour identifier les chemins que les bots ont demandés mais qui ne sont pas encore couverts par le honeypot.

```typescript
app.get("/newBotsRoute", async (_req, res) => {
  const routes = await unhandledRoutesService.getUnhandledRoutes(
    additionalEndpoints, knownPathOptions
  );
  res.setHeader("Content-Type", "text/plain");
  res.send(routes.join("\n"));
});
```

Cette boucle de rétroaction signifie que plus vous laissez tourner le honeypot, plus vous apprenez sur ce que les bots recherchent -- et vous pouvez ajouter ces chemins à vos endpoints connus.

### 7. Endpoints connus et exclusion

Le middleware accepte des listes de `knownPaths`, `knownPatterns`, `knownApiPaths` et `knownApiPatterns`. Toute route qui correspond à celle-ci passe à travers le middleware (vers votre vraie application). Cela garantit que vos vrais endpoints ne sont pas interceptés par le honeypot.

```typescript
const matches = (p) => p === endpoint || p.startsWith(endpoint + "/");
```

## Les 328 endpoints en détail

Voici comment ils sont classifiés (extrait du classifieur) :

| Catégorie | Exemples d'endpoints |
|---|---|
| Fuites de credentials | `.env`, `secrets.json`, `aws/credentials`, `etc/shadow` |
| Clés SSH | `.ssh/id_rsa`, `.ssh/id_ed25519` |
| Configs de base de données | `config/database`, `wp-config.php`, `docker-compose.yml` |
| Panneaux d'administration | `/admin`, `/wp-admin`, `/manage/account/login` |
| Réponses API | `/api/version`, `/api/config`, `.do`, `.ashx` |
| Phishing bancaire | `/lander/sber*`, `/index_sber.php` |
| Battements de cœur C2 | Chemins aléatoires de 6+ caractères (`/262LBNFp`) |
| Actions/Bourse | `/stock/mzhishu`, `/kline/1m/1`, `/m/allticker/1` |
| Jeux/Casino | `/proxy/games`, `/Ctrls/GetSysCoin`, `/room/getRoomBangFans` |
| Fichiers de configuration | `config.json`, `config.yml`, `sitemap.xml`, `ads.txt` |
| Pages d'atterrissage | `/about`, `/contact`, `/products`, `/blog` |

## Codes et endpoints spéciaux

Le classifieur contient des générateurs spécialisés pour des cas particuliers :

- **`genLanding()`** -- pages de phishing bancaire en russe pour СберБанк, Тинькофф, Газпромбанк
- **`genC2Heartbeat()`** -- réponse de battement de cœur C2 réaliste avec `agent_id`, `group`, `version`
- **`genScannerPath()`** -- pièges pour scanners spécifiques (ports nmap NICE, Hazelcast, CGI)
- **`genChineseApi()`** -- réponses d'API chinoises avec `msg: "成功"` (succès)
- **`genMerchant()`** -- profils de commerçants avec `balance`, `fee_rate`, `tier`

## Comment l'utiliser

### Installation

```bash
npm install express-middleware-honeypot
```

### Usage de base avec auto-enregistrement

```javascript
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

### Avec app.use() (middleware fourre-tout unique)

```javascript
const { createHoneypot } = require("express-middleware-honeypot");
const app = express();

// Vos vraies routes en premier
app.get("/", (req, res) => res.send("Home"));

// Ensuite le honeypot fourre-tout
const instance = createHoneypot({ /* options */ });
app.use(instance.headersMiddleware);
app.use(instance.middleware);
```

### Réponses complètes vs. par défaut

```javascript
// Réponses détaillées avec pages HTML complètes
const instance = createHoneypot({ isCompleteResponses: true });
```

### Journalisation du trafic

```javascript
const instance = createHoneypot({ logTraffic: true });
// Consultez le fichier traffic.txt pour voir ce que les bots demandent
```

## Conclusion

Ce middleware honeypot Express va bien au-delà d'un simple leurre. Avec **328 endpoints**, une **génération à la volée**, un **spoofing d'en-têtes dynamique**, une **journalisation du trafic** et même un **proxy PHP** pour de vraies réponses WordPress, il est conçu pour être aussi réaliste que possible.

Les scanners perdent du temps à crawler des pages d'administration factices, des fichiers `.env` crédibles et des pages de phishing bancaire pendant que votre vraie application reste protégée. Le système de double variante et la classification intelligente garantissent que chaque réponse est fraîche et adaptée au chemin demandé.

Le code source est disponible sur GitHub : [https://github.com/fox3000foxy/express-honeypot-middleware](https://github.com/fox3000foxy/express-honeypot-middleware)
