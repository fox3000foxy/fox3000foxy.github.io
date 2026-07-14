---
title: "5 formas ingeniosas de usar GitHub Actions (y lo que enseñan sobre los secretos)"
description: "Un runner CI convertido en VPS gratuito, un bot que abre sus propias pull requests, un publish npm sin un solo secreto. Un recorrido por mis repos para catalogar patrones de GitHub Actions que van más allá de \"lint + test + deploy\"."
date: 2026-07-14
tags:
  - github-actions
  - devops
  - automation
authors:
  - fox3000foxy
---

# 5 formas ingeniosas de usar GitHub Actions

Sobre el papel, GitHub Actions sirve para CI/CD clásico: haces push, lintea, testea, despliega. Ya escribí sobre un caso especial -- usar git tags como base de datos para un bot de email (ver el artículo dedicado). Pero rebuscando en mis propios repos, hay suficientes patrones distintos como para merecer un artículo aparte, menos centrado en un solo proyecto, más catálogo de técnicas.

Cinco cosas, de la más clásica a la más retorcida.

## 1. Un git tag como estado persistente entre ejecuciones

Resumen rápido, los detalles completos están en el artículo de `email-autoreply`. GitHub Actions es sin estado por diseño -- cada ejecución parte de una máquina limpia. La solución: almacenar un valor (un ID, un timestamp, cualquier pequeño estado) en un git tag dedicado, nunca en una rama.

```bash
# leer estado
git show refs/tags/lastid:data/lastId > data/lastId

# escribir estado (rama huérfana, un solo commit, force-push del tag)
git switch --orphan lastid-tmp
git commit -m "lastId snapshot"
git tag -f lastid
git push --force origin lastid
```

El punto clave: una rama huérfana para nunca acumular historial, y un tag forzado en vez de una rama para no contaminar la lista de ramas del repo.

## 2. Un git tag como caché de build precompilado

Misma familia de ideas, otro uso: en vez de guardar estado de aplicación, se guarda un **artefacto de build**. El job `build` compila el código una vez (en push a `master`) y luego sube `dist/` + `node_modules/` a un tag `runtime`. El job `cron` hace checkout de ese tag directamente en vez de ejecutar `bun install && bun run build` cada vez:

```yaml
- name: Checkout runtime snapshot
  uses: actions/checkout@v4
  with:
    ref: refs/tags/runtime
    fetch-depth: 1
# sin install, sin build -- el código ya está listo
- run: node dist/index.js --action
```

Esto cambia la ejecución de ~20s a ~10s. En un cron que corre seguido, importa. `actions/cache` hace un trabajo similar (cachear dependencias), pero un git tag es más directo cuando quieres congelar completamente un artefacto versionado y apuntarlo explícitamente -- no solo acelerar un `npm install`.

## 3. Un solo check obligatorio que agrupa varios jobs

Un pequeño patrón que no parece gran cosa pero que cambia la vida en la configuración de ramas protegidas. En `konosuba-rpg`, la CI tiene tres jobs independientes (`typecheck`, `lint`, `tests`) que corren en paralelo -- y un cuarto job, `test-battery`, que no hace nada más que depender de los tres primeros:

```yaml
test-battery:
  needs:
    - typecheck
    - lint
    - tests
  runs-on: ubuntu-latest
  steps:
    - run: echo "Typecheck, lint and tests succeeded."
```

Sin este job fachada, configurar una rama protegida requeriría marcar tres checks obligatorios separados -- y actualizar esa lista cada vez que se añade o renombra un job. Con `test-battery`, un solo nombre que marcar en los ajustes del repo, estable aunque cambien los detalles internos.

## 4. Convertir un runner gratuito en un VPS temporal

Este es el más retorcido de todos, y claramente mi favorito: `repo-to-vps` desvía completamente el uso previsto de un runner de GitHub Actions para convertirlo en una máquina Linux accesible por SSH, gratis, hasta 6 horas (la duración máxima de un job).

El principio: un job que no hace casi nada más que lanzar tmate:

```yaml
name: debug-runner
on:
  push:
    branches: [main, master]
  workflow_dispatch:
permissions:
  contents: write
  actions: write
jobs:
  debug:
    runs-on: ubuntu-latest
    timeout-minutes: 360
    steps:
      - uses: actions/checkout@v4
      - uses: awalsh128/cache-apt-pkgs-action@v1.6.0
        with:
          packages: tmate inotify-tools
      - run: bash .github/scripts/start-tmate.sh
```

El verdadero problema es que el sistema de archivos de un runner de GitHub Actions es **desechable** -- en cuanto termina el job, todo desaparece. Una sesión SSH que dura horas no sirve de nada si todo lo que haces se evapora en la siguiente ejecución. La solución: una rama git que sirve de snapshot en vivo del sistema de archivos, sincronizada continuamente.

El script `start-tmate.sh` hace, por orden:

1. **Restaura** el sistema de archivos desde una rama dedicada `filesystem` al iniciar el job (`git reset --hard` sobre ella).
2. **Vigila** los cambios de archivos continuamente con `inotifywait`, y hace **commit + push inmediatamente** en cuanto un archivo se mueve:

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock)(/|$)' .; do
    commit_and_push
    sleep 1
  done
}
```

3. Cada guardado **enmienda** el commit anterior en vez de crear uno nuevo (`git commit --amend --no-edit`), así que la rama `filesystem` siempre está en un solo commit -- sin acumulación de miles de snapshots.
4. Un bucle `while true` relanza tmate automáticamente si la sesión muere, con `remain-on-exit on` para que el terminal siga siendo accesible incluso después de un `exit`.
5. La URL SSH generada por tmate se escribe en un archivo `host.conf`, commiteado en la rama `filesystem` -- recuperable vía la API de GitHub (`gh api .../contents/host.conf`) sin haber tenido nunca acceso en vivo a los logs del job.
6. Una rutina `periodic_save` corre cada 5 segundos en segundo plano, por si `inotifywait` se pierde algún evento.

Resultado: un shell Linux completo, accesible desde cualquier sitio, con un sistema de archivos que persiste entre sesiones -- aunque la infraestructura subyacente (un runner de GitHub Actions) no fue diseñada para nada de esto. El único límite real es el timeout de 6 horas por job -- después hay que relanzar el workflow.

## 5. Un bot que abre sus propias pull requests

En `konosuba-rpg`, un push a la rama `dev` dispara un job que comprueba si ya existe una pull request abierta hacia `main` -- y crea una automáticamente si no, mediante `actions/github-script` y la API REST de GitHub:

```js
const { data: comparison } = await github.rest.repos.compareCommits({
  owner, repo, base: 'main', head: 'dev',
});
if (comparison.ahead_by === 0) return;

const { data: existing } = await github.rest.pulls.list({
  owner, repo, state: 'open', head: `${owner}:dev`, base: 'main',
});
if (existing.length > 0) return;

await github.rest.pulls.create({
  owner, repo, head: 'dev', base: 'main',
  title: 'chore: auto PR from dev to main',
});
```

El detalle que importa aquí es el token usado. Este workflow **no** usa el `GITHUB_TOKEN` automático -- exige un secreto `AUTO_PR_TOKEN` aparte, y se niega a continuar si falta:

```yaml
- name: Validate pull request token
  env:
    AUTO_PR_TOKEN: ${{ secrets.AUTO_PR_TOKEN }}
  run: |
    if [ -z "$AUTO_PR_TOKEN" ]; then
      echo "AUTO_PR_TOKEN is required... Use a PAT or GitHub App token with contents:write and pull-requests:write."
      exit 1
    fi
```

## 6. Publicar en npm sin ningún secreto

El más discreto de los cinco, pero probablemente el más importante para el futuro: el workflow `publish.yml` de `typescript-virtual-container` no contiene **ningún secreto npm**. Sin `NPM_TOKEN`, sin `NODE_AUTH_TOKEN`. Solo esto:

```yaml
permissions:
  id-token: write
  contents: read
jobs:
  publish:
    steps:
      - uses: actions/setup-node@v6
        with:
          registry-url: 'https://registry.npmjs.org'
      - run: npm publish
```

`npm publish` funciona igual porque el registro npm ahora soporta **trusted publishing** vía OIDC: el workflow demuestra su identidad directamente al registro (repo exacto + workflow exacto, configurados en npmjs.org), sin que ningún token estático transite ni se almacene en ningún sitio. Cero secretos que puedan filtrarse, cero tokens que rotar cada seis meses.

---

## Los secretos de GitHub, en profundidad

Estos cinco patrones tocan todos, de una forma u otra, la cuestión de los secretos. Algunos principios que se repiten en todos mis workflows:

**Un secreto no es necesariamente una cadena simple.** En `email-autoreply`, `ACCOUNTS_JSON` contiene el JSON minificado entero de la configuración multi-cuenta -- no solo una clave API, una estructura de datos completa, inyectada tal cual en un archivo en tiempo de ejecución:

```yaml
env:
  ACCOUNTS_JSON: ${{ secrets.ACCOUNTS_JSON }}
run: printf "%s" "$ACCOUNTS_JSON" > data/accounts.json
```

Esto evita tener que commitear un archivo de configuración, incluso cifrado, y se actualiza con un clic en los ajustes del repo sin tocar el código.

**`GITHUB_TOKEN` tiene límites precisos, y es a propósito.** El token automático que GitHub inyecta en cada ejecución es potente, pero sellado en ciertos puntos: por defecto no puede disparar otro workflow, y según la configuración del repo puede ser bloqueado por reglas de protección de rama. Justo por eso `create-pull-request.yml` exige un PAT aparte (`AUTO_PR_TOKEN`) -- un token de una cuenta real (o de una GitHub App), con derechos explícitos `contents:write` + `pull-requests:write`, distinto del token efímero del job.

**Los permisos se scopean job por job, no globalmente.** Cada workflow que he listado aquí declara un bloque `permissions:` mínimo y comentado:

```yaml
permissions:
  contents: read
  actions: read
  checks: write
```

El `GITHUB_TOKEN` por defecto tiene históricamente derechos bastante amplios sobre un repo público; restringirlo explícitamente a lo que el job realmente necesita limita el daño si una action de terceros en la cadena resulta comprometida.

**El mejor secreto es el que no existe.** El patrón OIDC de `typescript-virtual-container` es la versión más lograda de esta idea: en vez de gestionar la rotación, expiración y riesgo de fuga de un `NPM_TOKEN`, el workflow demuestra criptográficamente su identidad (este repo exacto, este workflow exacto) directamente al servicio tercero. Misma lógica disponible para AWS, Docker Hub, PyPI -- cada vez más registros y clouds soportan OIDC desde GitHub Actions.

---

**3 puntos clave**

1. Un git tag (huérfano, force-pusheado) puede servir como base de datos minimalista o caché de build precompilado -- dos usos distintos del mismo mecanismo.
2. Un runner gratuito de GitHub Actions puede convertirse en un shell SSH persistente si aceptas sincronizar continuamente su sistema de archivos hacia una rama git, con autoguardado por `inotifywait` y un solo commit enmendado.
3. El `GITHUB_TOKEN` por defecto está limitado a propósito -- crear PRs entre ramas o publicar sin secretos requiere o bien un PAT dedicado, o bien pasarse a OIDC trusted publishing.
