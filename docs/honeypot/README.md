# Honeypot & Decoys

Ce dossier documente les **faux fichiers** ajoutés au site pour tromper les
scanners, scrappers et IA qui explorent `fox3000foxy.com`. Tout est statique :
rien ne s'exécute, aucune faille n'est introduite.

## Pourquoi

Sur GitHub Pages **aucun backend ne s'exécute** : pas de PHP, pas de base de
données, pas de reverse shell possible. Ces fichiers ne servent donc pas à
"piéger" un attaquant, ils servent à :

1. **Polluer le moissonnage IA/scrappers** — un bot ou un LLM qui collecte
   secrets/clés depuis un site public ramasse des credentials invalides.
2. **Détecter qui te scanne** — chaque page leurre rendue déclenche un
   événement GoatCounter dédié.
3. **S'amuser**, honnêtement.

## Structure des leurres

### Pack "WordPress cassé"
- `wp-login.php` — page de login WP factice, pré-remplie de credentials bidon
  (admin / mot de passe fake), avec des indices en commentaire HTML.
- `wp-config.php` — config WP avec clés AUTH/SALT et creds MySQL faux.
- `wp-admin/index.html` — dashboard admin statique.
- `wp-content/plugins/wp-updater-guru/` — faux plugin "backdoor" avec un
  endpoint REST non authentifié (inexistant en réalité).
- `xmlrpc.php` — réponse XML-RPC 405.
- `wp-json/wp/v2/users/index.json` — fausse liste d'utilisateurs.

### Pack "stack moderne"
- `.env.production` / `.env.backup` — faux secrets (DB, OpenAI, Stripe,
  GitHub, Redis) **entièrement invalides**.
- `package.json` — fausse app Next.js.
- `api/*` — endpoints JSON factices (`/api/health`, `/api/auth/session`,
  `/api/users`, `/api/admin`, `/api/internal/config`).
- `_next/static/chunks/main.js` — faux bundle JS avec un "token" et une "DB".

## Honeypot (lecture du dashboard)

Le beacon `/_honeypot/beacon.js` est injecté dans les pages HTML leurres.
Quand un navigateur ou un scanner headless **rend** la page, il appelle
`goatcounter.count()` avec une route dédiée :

- wp-login → `/honeypot/wp-login.php`
- wp-admin → `/honeypot/wp-admin/`

**Dans le dashboard GoatCounter** (`https://fox3000foxy.goatcounter.com`),
filtre sur `/honeypot/` pour voir toutes les sondes. Chaque hit a son `title`
`decoy-<nom>`.

> Limite connue : un bot qui fait `curl` d'un `.php`/`.json` ne rend pas le
> HTML et ne déclenche pas le beacon. On ne capte que les scanners qui
> "rendent" (headless Chrome, crawlers AI, etc.).

## Sitemap (les leurres "fuient" dans le sitemap)

Le script `scripts/inject-decoy-sitemap.ts` (raccordé à la commande `build`)
ajoute les URLs leurres à la fin de `sitemap-0.xml` après le build. L'idée :
ces fichiers vivent dans `public/` mais ne sont pas de vraies pages Astro, donc
ils "fuient" naturellement dans le sitemap — comme un accident de glob sur le
dossier de sortie. Les scanners/IA qui parsent le sitemap trouvent alors
`/wp-login.php`, `/.env.production`, `/api/users/`, etc. comme s'ils étaient
des routes légitimes.

- `_honeypot/` est **volontairement exclu** du sitemap : on ne veut pas qu'un
  scanner découvre le beacon qui les traque.

## Ne pas oublier

- Ne mets jamais de **vrais** secrets dans ces fichiers. Tout est fake à dessein.
- `.env` et `*.local` sont gitignorés : seuls les fichiers listés au-dessus
  (`.env.production`, `.env.backup`) sont réellement déployés.
- Faire un `curl -I` de chaque route après déploiement pour vérifier qu'elles
  répondent en 200 et non en 404.
