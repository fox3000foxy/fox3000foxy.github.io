# Decoy Pages

Ce dossier documente les **faux fichiers** ajoutés au site pour tromper les
scanners, scrappers et IA qui explorent `fox3000foxy.com`. Tout est statique :
rien ne s'exécute, aucune faille n'est introduite.

## Pourquoi

Sur GitHub Pages **aucun backend ne s'exécute** : pas de PHP, pas de base de
données, pas de reverse shell possible. Ces fichiers ne servent donc pas à
"piéger" un attaquant, ils servent à :

1. **Polluer le moissonnage IA/scrappers** — un bot ou un LLM qui collecte
   secrets/clés depuis un site public ramasse des credentials invalides.
2. **Détecter qui te scanne** — chaque page leurres rendue déclenche un
   événement GoatCounter dédié.
3. **S'amuser**, honnêtement.

## Structure des leurres

### Pack "WordPress cassé"
- `wp-login.php` — page de login WP factice (standard WordPress 5.9,
  pas de credentials visibles dans le JS).
- `wp-config.php` — config WP avec clés AUTH/SALT et creds MySQL faux.
- `wp-admin/index.html` — dashboard admin statique.
- `wp-content/plugins/wp-updater-guru/` — faux plugin WP banal (settings
  page, sync check). Pas d'endpoint REST exposé.
- `xmlrpc.php` — réponse XML-RPC 405.
- `wp-json/wp/v2/users/index.json` — fausse liste d'utilisateurs.
- `index.php`, `wp-blog-header.php`, `wp-load.php`,
  `wp-includes/version.php` (v5.9) — **fichiers officiels WordPress** grattés
  depuis le repo (GPL) pour un réalisme total.
- `readme.html`, `license.txt` — fichiers officiels WordPress (GPL), avec leurs
  assets (`wp-admin/css/install.css`, `wp-admin/images/wordpress-logo.png`).
- `wp-admin/maintenance.html` — page de maintenance WordPress standard
  (HTTP 503). Pas de rickroll.

### Renforcement du réalisme WordPress
- `wp-content/themes/fox3k/functions.php` — vrai header de thème WP avec
  `after_setup_theme`, `wp_enqueue_scripts`, `widgets_init` et un hook
  `wp_head` qui appelle silencieusement le endpoint `wug/v1/sync` du
  plugin. Tout le code est authentique (appelle des fonctions WP
  qui n'existent pas en statique — le PHP sera servi en texte brut, ce qui
  est exactement ce qu'un WP cassé ferait).
- `wp-content/index.php` — le classique `// Silence is golden.`
- `wp-content/uploads/` — contient les vraies images du site (copiées du
  dossier `public/uploads` réel), rendant les pages WP non cassées quand
  un scanner les visite.
- `wp-includes/version.php` — version officielle WP 5.9 (grattée du repo
  WordPress).

### Pack "stack moderne"
- `.env.production` / `.env.backup` — faux secrets (DB, OpenAI, Stripe,
  GitHub, Redis) **entièrement invalides**.
- `package.json` — fausse app Next.js.
- `api/*` — endpoints JSON factices (`/api/health`, `/api/auth/session`,
  `/api/users`, `/api/admin`, `/api/internal/config`).
- `_next/static/chunks/main.js` — faux bundle JS avec un "token" et une "DB".

### Pack "patterns de scan" (inspiré du principe express-honeypot-middleware)
Des routes qui font croire à un scanner qu'il a trouvé un vrai truc exploitable,
dans les patterns de scan les plus courants (nuclei/wpscan).
- `/.git/config` + `/.git/HEAD` + `/.git/logs/HEAD` — "exposed .git". Le
  remote pointe vers le vrai repo GitHub (plausible), le log mentionne
  wp-config et env.backup. **Pas** dans le sitemap (aucun vrai site ne
  l'expose) — trouvable par les scanners qui le probe directement.
- `phpinfo.php` — fausse page de config PHP (display_errors On,
  allow_url_include On, disable_functions vide = drapeaux rouges).
- `phpmyadmin/index.html` — login phpMyAdmin avec erreur #1045 et mot de
  passe pré-rempli.
- `swagger/openapi.json` — spec OpenAPI décrivant de fausses routes internes
  faibles (`/admin/config`, `/debug/dump`, `/users/reset-password`).
- `actuator/env.json` + `actuator/health.json` — Spring Actuator fictif avec
  datasource, JWT secret et service account (attractif pour scanners Java).
- `composer.json` — dépendances à versions vulnérables connues (WordPress
  5.9.3, dompdf 1.0.2, etc.).
- `wp-json/index.json` — racine REST WP exposant le namespace du plugin
  `wug/v1/sync`.
- `wp-cron.php` / `wp-trackback.php` — endpoints WP profonds.
- `wp-content/debug.log` — faux log d'erreurs WP avec messages "sensibles".

### Credentials OVH + Gmail (piège à tokens)
- `root/.ovh_config` — clés API OVH et IP/user/port du "VPS" (tout faux).
- `root/.msmtprc` — config SMTP Gmail (`fox3000foxy.contact@gmail.com` +
  mot de passe d'application).
- `.env.backup` contient aussi `GMAIL_APP_PASSWORD`, `SMTP_*`.

Ces fichiers sont **dans le sitemap** : l'LLM les trouve facilement et brûle
des tokens à tenter des logins OVH/SMTP/SSH qui échoueront toujours (clés
invalides, IP/ports fictifs).

### SSH, MySQL, MongoDB (piège à tokens infrastructure)
- `/.ssh/id_rsa` — fausse clé privée OpenSSH (format valide, contenu
  aléatoire). Un scanner qui la découvre tente de s'authentifier en SSH →
  échec garanti, tokens brûlés.
- `/.my.cnf` — credentials MySQL client (user + password).
  L'agent tente un `mysql --defaults-extra-file` ou utilise le password
  pour brancher un dump → rien ne marche.
- `/mongo/replica.conf` + `/mongo/.credentials` — replica set MongoDB 6.0
  fictif avec auth activée et keyfile. Creds `fox3k_admin` / `hunter2m0ng0`.
  L'agent tente de se connecter au cluster interne → timeout (fictif).
- `/etc/apache2/sites-available/fox3000foxy.conf` — vhost Apache avec
  SSL (Let's Encrypt), DocumentRoot `/var/www/fox3000foxy.com/public_html`,
  et les deux VirtualHost (:80 + :443). Confirme le stack "Apache + SSL +
  Let's Encrypt" qu'un scanner cherche pour confirmer un VPS réel.

## Tracking (lecture du dashboard)

Le script `/_assets/analytics.js` est injecté dans les pages leurres.
Quand un navigateur ou un scanner headless **rend** la page, il appelle
`goatcounter.count()` avec la route courante :

- wp-login → `/wp-login.php`
- phpinfo → `/phpinfo.php`
- phpmyadmin → `/phpmyadmin/`
- wp-admin → `/wp-admin/`

**Dans le dashboard GoatCounter** (`https://fox3000foxy.goatcounter.com`),
filtra sur les hits event pour voir toutes les sondes.

> Limite connue : un bot qui fait `curl` d'un `.php`/`.json` ne rend pas le
> HTML et ne déclenche pas le beacon. On ne capte que les scanners qui
> "rendent" (headless Chrome, crawlers AI, etc.).

## Sitemap (les leurres "fuient" dans le sitemap)

Le script `scripts/inject-decoy-sitemap.ts` (raccordé à la commande `build`)
ajoute les URLs leurres à la fin de `sitemap-0.xml` après le build. L'idée :
ces fichiers vivent dans `public/` mais ne sont pas de vraies pages Astro, donc
ils "fuient" naturellement dans le sitemap — comme un accident de glob sur le
dossier de sortie. Les scanners/IA qui parsent le sitemap trouvent alors
des routes légitimes comme `/wp-admin/`, `/.env.production`, `/api/users/`, etc.

Certains leurres **ne sont pas dans le sitemap** pour ne pas donner l'impression
qu'ils ont été placés délibérément. Un attaquant qui les découvre doit croire
qu'il a trouvé une vraie faille, pas un piège. Ces fichiers ne sont listés
nulle part — il faut les trouver par probing direct (nuclei, wpscan, etc.).

**Exclus du sitemap** (retrouvés par le premier audit agent) :
- `phpinfo.php`, `/.ssh/id_rsa`, `/.ssh/authorized_keys`
- `/backups/fox3000foxy_backup_20250117.zip`
- `/actuator/env.json`, `/wp-json/wp/v2/users/`
- `/wp-login.php`, `/.my.cnf`, `/mongo/replica.conf`, `/mongo/.credentials`
- `/home/fox3000foxy/.bash_history`, `/root/.bash_history`
- `/root/.ovh_config`, `/root/.msmtprc`, `/root/.card_payment`
- `/etc/apache2/sites-available/fox3000foxy.conf`
- `/wp-content/uploads/fox3k_backup.sql`, `/wp-content/debug.log`
- `/_next/static/chunks/main.js`, `/composer.json`, `/package.json`
- `/swagger/openapi.json`, `/CLAUDE.md`, `/ROADMAP.md`

**Toujours dans le sitemap** (reconnaissables commeWP mais pas flaggées comme
"honeypot" par les agents) :
- `wp-admin/`, `wp-json/`, `wp-config.php`, `wp-config.php.bak`
- `.env.production`, `.env.backup`
- `api/health/`, `api/auth/session.json`, `api/users/`, `api/admin/`, `api/internal/config.json`
- `phpmyadmin/`, `actuator/health.json`, `server-status/`, `server-info/`
- `wp-content/plugins/wp-updater-guru/`, `wp-content/themes/fox3k/style.css`
- etc.

- `_assets/` est **volontairement exclu** du sitemap : on ne veut pas qu'un
  scanner découvre le beacon qui les traque.

## Ne pas oublier

- Ne mets jamais de **vrais** secrets dans ces fichiers. Tout est fake à dessein.
- `.env` et `*.local` sont gitignorés : seuls les fichiers listés au-dessus
  (`.env.production`, `.env.backup`) sont réellement déployés.
- Faire un `curl -I` de chaque route après déploiement pour vérifier qu'elles
  répondent en 200 et non en 404.
