---
title: "5 formas retorcidas de usar GitHub Actions (y lo que enseñan sobre los secrets)"
description: "Un runner CI convertido en VPS gratis, un bot que abre sus propias pull requests, un publish npm sin el menor secret. Recorrido por mis repos para listar los patrones GitHub Actions que salen del simple \"lint + test + deploy\"."
date: 2026-07-14
tags:
  - github-actions
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "rtdnAOJ4rcSpG77nwxZ89yYkm18i9JyFouTB00oB8wxSfFnmBmpcXaNeOdinfIyoi1NJW85O0Mt1Q8Qln1/zLw=="
---

# 5 formas retorcidas de usar GitHub Actions

GitHub Actions, sobre el papel, está hecho para CI/CD clásico: haces push, hace lint, testea, despliega. Ya escribí sobre un caso particular (usar tags git como base de datos para un bot email, ver el artículo dedicado). Pero rebuscando en mis propios repos, hay suficientes patrones distintos como para que valga un artículo aparte, menos centrado en un solo proyecto, más catálogo de técnicas.

Cinco usos, del más clásico al más retorcido.

## 1. Un tag git como estado persistente entre dos runs

Recordatorio rápido, el detalle completo está en el artículo sobre `email-autoreply`. GitHub Actions es stateless por diseño: cada run parte de una máquina virgen. El rodeo: guardar un valor (un ID, un timestamp, cualquier estado pequeño) en un tag git dedicado, nunca en una rama.

```bash
# leer el estado
git show refs/tags/lastid:data/lastId > data/lastId

# escribir el estado (rama huérfana, un solo commit, force-push del tag)
git switch --orphan lastid-tmp
git commit -m "lastId snapshot"
git tag -f lastid
git push --force origin lastid
```

El punto clave: una rama huérfana para no acumular nunca historial, y un tag forzado en vez de una rama para no contaminar la lista de ramas del repo.

## 2. Un tag git como caché de build precompilado

Misma familia de idea, otro uso: en vez de guardar un estado aplicativo, guardamos un **artefacto de build**. El job `build` compila el código una vez (en push hacia `master`), y luego empuja `dist/` + `node_modules/` en un tag `runtime`. El job `cron`, por su parte, hace checkout directamente de ese tag en vez de correr `bun install && bun run build` en cada ejecución:

```yaml
- name: Checkout runtime snapshot
  uses: actions/checkout@v4
  with:
    ref: refs/tags/runtime
    fetch-depth: 1
# sin install, sin build: el código ya está listo
- run: node dist/index.js --action
```

Eso cambia el run de ~20s a ~10s. En un cron que corre a menudo, cuenta. `actions/cache` hace un trabajo similar (cachear dependencias), pero un tag git es más directo cuando quieres directamente congelar un artefacto versionado y apuntarlo explícitamente, en vez de simplemente acelerar un `npm install`.

## 3. Un solo check obligatorio que agrega varios jobs

Pequeño patrón que parece nada pero que cambia la vida en configuración de rama protegida. En `konosuba-rpg`, la CI tiene tres jobs independientes (`typecheck`, `lint`, `tests`) que corren en paralelo, y un cuarto job, `test-battery`, que no hace más que depender de los tres primeros:

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

Sin ese job fachada, configurar una rama protegida exigiría marcar tres checks obligatorios separados, y actualizar esa lista cada vez que se añade o renombra un job. Con `test-battery`, un solo nombre que marcar en los ajustes del repo, que queda estable aunque el detalle interno cambie.

## 4. Transformar un runner gratis en VPS temporal

Este es el más retorcido de todos, y claramente mi favorito: `repo-to-vps` desvía por completo el uso previsto de un runner GitHub Actions para convertirlo en una máquina Linux accesible por SSH, gratis, durante hasta 6 horas (el límite máximo de un job).

El principio: un job que no hace casi nada más que lanzar [tmate](https://tmate.io/) (un fork de tmux que expone una sesión de terminal compartible por SSH o navegador):

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

El verdadero rompecabezas es que el filesystem de un runner GitHub Actions es **desechable**: en cuanto termina el job, todo desaparece. Una sesión SSH que dura horas no sirve de nada si todo lo que haces en ella se evapora en el próximo run. La solución: una rama git que sirve de snapshot en vivo del filesystem, sincronizada en continuo.

El script `start-tmate.sh` hace, en orden:

1. **Restaura** el filesystem desde una rama dedicada `filesystem` al arrancar el job (`git reset --hard` sobre ella).
2. **Vigila** los cambios de archivos con `inotifywait` en continuo, y hace **commit + push de inmediato** en cuanto un archivo se mueve:

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock)(/|$)' .; do
    commit_and_push
    sleep 1   # debounce
  done
}
```

3. Cada guardado **enmienda** el commit anterior en vez de crear uno nuevo (`git commit --amend --no-edit`), así la rama `filesystem` siempre queda en un solo commit, lo que evita la acumulación de miles de snapshots.
4. Un bucle `while true` relanza `tmate` automáticamente si la sesión muere, con `remain-on-exit on` para que la terminal siga alcanzable incluso tras un `exit`.
5. La URL SSH generada por tmate se escribe en un archivo `host.conf`, commiteado en la rama `filesystem`, así recuperable vía la API de GitHub (`gh api .../contents/host.conf`) sin haber tenido nunca acceso a los logs del job en directo.
6. Una rutina `periodic_save` corre cada 5 segundos en segundo plano, por si `inotifywait` pierde un evento.

Resultado: un shell Linux completo, accesible desde cualquier sitio, con un filesystem que persiste entre sesiones, aunque la infraestructura subyacente (un runner GitHub Actions) no se diseñó en absoluto para eso. El único verdadero límite es el timeout de 6h por job: después hay que relanzar el workflow.

## 5. Un bot que abre sus propias pull requests

En `konosuba-rpg`, un push en la rama `dev` dispara un job que comprueba si ya existe una pull request abierta hacia `main`, y crea una automáticamente si no, vía `actions/github-script` y la API REST de GitHub:

```js
const { data: comparison } = await github.rest.repos.compareCommits({
  owner, repo, base: 'main', head: 'dev',
});
if (comparison.ahead_by === 0) return; // nada que proponer

const { data: existing } = await github.rest.pulls.list({
  owner, repo, state: 'open', head: `${owner}:dev`, base: 'main',
});
if (existing.length > 0) return; // ya hay una PR abierta

await github.rest.pulls.create({
  owner, repo, head: 'dev', base: 'main',
  title: 'chore: auto PR from dev to main',
});
```

El detalle que cuenta aquí es el token usado. Este workflow NO usa el `GITHUB_TOKEN` automático: exige un secret `AUTO_PR_TOKEN` separado, y se niega a continuar si falta:

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

## 6. Publicar en npm sin ningún secret

El más discreto de los cinco, pero probablemente el más importante para el futuro: el workflow `publish.yml` de `typescript-virtual-container` no contiene **ningún secret npm**. Ningún `NPM_TOKEN`, ningún `NODE_AUTH_TOKEN`. Solo esto:

```yaml
permissions:
  id-token: write  # Required for OIDC
  contents: read
jobs:
  publish:
    steps:
      - uses: actions/setup-node@v6
        with:
          registry-url: 'https://registry.npmjs.org'
      - run: npm publish
```

`npm publish` funciona igual, porque el registro npm ya soporta el **trusted publishing** vía OIDC: el workflow prueba su identidad directamente ante el registro (repo + workflow exactos, configurados en npmjs.org), sin que ningún token estático transite ni se guarde en ningún sitio. Cero secrets que filtrar, cero tokens que rotar cada seis meses.

---

## Los secrets de GitHub, en profundidad

Esos cinco patrones tocan todos, de un modo u otro, la cuestión de los secrets. Algunos principios que se repiten en todas partes en mis workflows:

**Un secret no es forzosamente una cadena simple.** En `email-autoreply`, `ACCOUNTS_JSON` contiene el JSON minificado entero de la config multicuenta: una estructura de datos completa en vez de una simple clave API, inyectada tal cual en un archivo en runtime:

```yaml
env:
  ACCOUNTS_JSON: ${{ secrets.ACCOUNTS_JSON }}
run: printf "%s" "$ACCOUNTS_JSON" > data/accounts.json
```

Eso evita tener que commitear un archivo de config, aunque sea cifrado, y se actualiza en un clic en los ajustes del repo sin tocar el código.

**`GITHUB_TOKEN` tiene límites precisos, y es a propósito.** El token automático que GitHub inyecta en cada run es potente, pero sellado en ciertos puntos: por defecto, no puede disparar otro workflow, y según la configuración del repo puede quedar bloqueado por reglas de protección de rama. Es exactamente por eso que `create-pull-request.yml` exige un PAT (`AUTO_PR_TOKEN`) separado: un token que viene de una cuenta real (o de una GitHub App), con derechos explícitos `contents:write` + `pull-requests:write`, distinto del token efímero del job.

**Los permisos se acotan job por job, no globalmente.** Cada workflow que listé aquí declara un bloque `permissions:` mínimo y comentado:

```yaml
permissions:
  contents: read
  actions: read
  checks: write
  # Only allow writing checks, everything else is read-only
```

El `GITHUB_TOKEN` por defecto tiene históricamente derechos bastante amplios en un repo público; restringirlo explícitamente a lo que el job necesita de verdad limita los daños si una acción de terceros en la cadena (`uses: alguien/action@versión`) resulta comprometida.

**El mejor secret es el que no existe.** El patrón OIDC de `typescript-virtual-container` es la versión más lograda de esa idea: en vez de gestionar la rotación, la expiración y el riesgo de fuga de un `NPM_TOKEN`, el workflow prueba criptográficamente su identidad (ese repo preciso, ese workflow preciso) directamente ante el servicio tercero. Misma lógica disponible para AWS, Docker Hub, PyPI: cada vez más registros y clouds soportan OIDC desde GitHub Actions.

---

**3 puntos clave**

1. Un tag git (huérfano, con force-push) puede servir de base de datos minimalista o de caché de build precompilado: dos usos distintos del mismo mecanismo.
2. Un runner GitHub Actions gratis puede convertirse en un shell SSH persistente si aceptas sincronizar su filesystem en continuo hacia una rama git, con autoguardado por `inotifywait` y un solo commit enmendado.
3. El `GITHUB_TOKEN` por defecto está deliberadamente limitado: crear PRs entre ramas o publicar sin secret exige o bien un PAT dedicado, o bien pasar al trusted publishing OIDC.
