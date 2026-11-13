---
title: "Repo to VPS: transformar GitHub Actions en VPS gratis con almacenamiento persistente"
description: "Cómo transformar un runner GitHub Actions en VPS permanente con git como almacenamiento persistente: tmate, inotify y commit --amend."
date: 2026-05-29
tags:
  - github
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "aSjr0n8weuxJg6Vltb2Qy7CuamU0urIa10aqbshZn4ufcxHvjTL5wyY6uJBt02z6r8gjmUpGaMNYW3Nw3b0o1Q=="
---

## GitHub te da un VPS gratis durante 6h. Encontré cómo hacerlo permanente.

GitHub Actions te da máquinas Linux gratis.

O sea, verdaderos servidores Ubuntu. 2 núcleos, 7 GB de RAM, 14 GB de disco. Gratis. Durante 6h por run.

El único "problema": al final del run, todo se borra. La máquina es desechable. Instalas paquetes, programas, configuras... y puff, al final todo desaparece. Como si no hubieras hecho nada.

Salvo si.

Salvo si usas **git como disco duro**.

Y ahí, de golpe, tienes un VPS gratis con un disco persistente que sobrevive a los runs. Te reconectas, todo sigue ahí. Retomas donde te habías quedado.

Está completamente roto. Déjame explicarte.

---

## El contexto: los runners GitHub Actions

Cuando lanzas un workflow GitHub Actions, GitHub te da una VM.

Está hecha para compilar tu código, lanzar tus tests, desplegar. El workflow corre, hace su trabajo, y la máquina se destruye.

Pero nada te impide hacer otra cosa con esa VM. Tipo, abrir un shell SSH encima y usarla como un servidor.

La restricción es que esas máquinas son **stateless** y **temporales**:
- Temporal: 6h máx por run (`timeout-minutes: 360`, el tope de GitHub)
- Stateless: todo se borra al final

Así que para convertirla en un VPS usable, hay que resolver dos problemas:
1. **¿Cómo conectarse en tiempo real?**
2. **¿Cómo guardar el disco entre dos runs?**

Ahí se vuelve un hack guarro.

---

## Problema 1: el SSH en vivo con tmate

**tmate** es un fork de tmux que crea una sesión SSH compartible.

Lo lanzas en una máquina, te genera dos enlaces:
- una URL SSH (`ssh xxx@nyc1.tmate.io`)
- una URL web (terminal en el navegador)

Te conectas con uno de esos enlaces, y boom, estás en un shell en la máquina. En tiempo real.

El workflow lanza por tanto tmate:

```bash
tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
tmate -S /tmp/tmate.sock set-option -g remain-on-exit on

# recupera los enlaces de conexión
tmate_ssh=$(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}')
tmate_web=$(tmate -S /tmp/tmate.sock display -p '#{tmate_web}')
```

Y esos enlaces se escriben directo en el README del repo por un script Python. Abres tu repo, ves el enlace de conexión, haces clic. Ya estás en tu VPS.

Primer problema resuelto. Pero es el segundo el que es de verdad loco.

---

## Problema 2: git como disco duro

Aquí la idea que lo cambia todo.

La máquina se borra en cada run. Así que guardamos **el sistema de archivos en una rama git dedicada**, llamada `filesystem`.

Al arrancar, el script restaura el estado desde esa rama:

```bash
filesystem_branch="filesystem"

# recupera la rama filesystem desde el remote
git fetch origin "$filesystem_branch":refs/remotes/origin/$filesystem_branch

# restaura el workspace desde esa rama
git checkout -B filesystem-workspace "refs/remotes/origin/$filesystem_branch"
git reset --hard "refs/remotes/origin/$filesystem_branch"
```

La rama `filesystem` ES tu disco duro. Tus archivos, tus installs, tus configs: todo está dentro.

¿Ves la idea? La máquina es desechable, pero el disco vive en git. Vuelves a lanzar el workflow, el disco se restaura, retomas justo donde estabas.

Es como un VPS que hiberna. Salvo que la hibernación es un repo git.

### Primer lanzamiento: crear el disco vacío

En el primer run, la rama `filesystem` aún no existe. Hay que crearla. Y no es trivial:

```bash
ensure_filesystem_branch() {
  if ! git ls-remote --exit-code origin "refs/heads/$filesystem_branch" >/dev/null 2>&1; then
    git checkout --orphan filesystem-workspace
    git rm -rf --cached .
    git clean -fdx -e .git -e .github -e .github/scripts -e .github/workflows
    git commit --allow-empty -m "init filesystem (empty)"
    push_filesystem
  fi
}
```

El `git checkout --orphan` es la clave. Una rama huérfana es una rama **sin ningún historial**: como si partieras de un repo vacío.

¿Por qué huérfana? Porque NO quieres que tu disco persistente arrastre todo el historial de tu código fuente. El disco queda aislado, con su propia vida. Empieza virgen.

Y el `git ls-remote --exit-code` del principio es solo un check limpio: "¿la rama ya existe en el remote?". Si sí, no tocamos nada. Si no, la creamos. Idempotente, como nos gusta.

### El git clean selectivo: proteger los cachés

Esta línea merece detenerse en ella:

```bash
git clean -fdx -e .apt-cache -e .cache -e host.conf -e tmate.sock
```

`git clean -fdx` quita TODO lo no trackeado por git. Normalmente es violento: limpia el workspace a fondo.

Pero los `-e` (exclude) protegen ciertos archivos:
- `.apt-cache` → el caché de los paquetes APT (volveremos, es ingenioso)
- `.cache` → caché genérico
- `host.conf` → la dirección SSH de la sesión
- `tmate.sock` → el socket de la sesión tmate en curso

Si limpiaras esos archivos, romperías la sesión activa o perderías tu caché. Así que los perdonamos durante el reset.

Un detalle tonto a primera vista, pero sin eso todo peta.

---

## El autosave: inotify que lo vigila todo

Bueno, pero ¿cómo llegan los archivos a la rama `filesystem`?

Respuesta: un watcher que vigila TODOS los cambios de archivos y commitea/pushea automáticamente.

La herramienta mágica es **inotifywait** (del paquete `inotify-tools`). Vigila el filesystem a nivel del kernel y dispara en cuanto un archivo cambia.

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock|\.gitignore|\.txt\.swp)(/|$)' .; do
    echo "[autosave] change detected"
    commit_and_push
    sleep 1   # debounce si montón de cambios de golpe
  done
}

autosave &
```

Diseccionemos los flags inotify, porque cada uno cuenta:
- `-r` → recursivo, vigila todos los subdirectorios
- `-e modify,create,delete,move` → reacciona a esos 4 tipos de eventos
- `--exclude '...'` → una regex para ignorar ciertos archivos

El `--exclude` es crucial. Mira lo que ignora:
- `.git` → evidente, si no cada commit dispararía un autosave que dispararía un commit... bucle infinito. Catástrofe.
- `.apt-cache` y `.cache` → los cachés, que cambian todo el tiempo y no queremos spamear en git
- `host.conf` y `tmate.sock` → los archivos de sesión, que se mueven sin parar
- `.gitignore`, `.txt.swp` → los archivos temporales (los `.swp` son los archivos de edición de vim)

Sin ese exclude, acabarías con un autosave que se dispara en bucle sobre sus propios cambios. El `.git` en la lista es LA línea que te impide pegarte un tiro en el pie.

¿Modificas un archivo? inotify lo detecta al instante, commitea, pushea. En menos de un segundo, tu cambio está en la rama `filesystem`.

¿Instalas un paquete, escribes código, tocas una config? Todo se guarda en tiempo real, automáticamente, sin que hagas nada.

Tienes literalmente un sistema de guardado automático del disco entero. Roto.

### El debounce: no spamear git

El `sleep 1` tras cada save es un **debounce**.

Cuando guardas un archivo en un editor, a menudo genera varios eventos filesystem en ráfaga (creación de un archivo temp, rename, borrado del viejo...). Sin debounce, dispararías 3-4 commits para un solo guardado.

El `sleep 1` dice: "espera un segundo tras un save, que la ráfaga se calme, antes de volver a escuchar". Eso agrupa los cambios cercanos en un solo commit. Ingenioso.

### Y un guardado periódico además

Por si inotify pierde un evento, también hay un save cada 5 segundos:

```bash
periodic_save() {
  while true; do
    sync_from_remote   # recupera los cambios remotos eventuales
    sleep 5
    commit_and_push
  done
}

periodic_save &
```

Cinturón Y tirantes. Sobre todo no queremos perder el estado del disco.

---

## El detalle ingenioso: un solo commit

Si commiteas en cada cambio de archivo, vas a acumular miles de commits. En una hora de sesión, tu historial git explota. El repo se vuelve enorme. Es asqueroso.

La solución es elegante: **enmendamos el commit existente** en vez de crear uno nuevo.

```bash
commit_and_push() {
  (
    flock -n 200 || return   # lock para que dos saves no corran a la vez

    git add -A
    git reset -- .github/workflows/ .github/scripts/   # no toca los scripts

    if ! git diff --cached --quiet; then
      if git rev-parse --verify HEAD >/dev/null 2>&1; then
        git commit --amend --no-edit    # AMEND: machaca el commit previo
      else
        git commit -m "autosave $(date -u +%Y%m%dT%H%M%SZ)"
      fi
      git push --force origin "filesystem-workspace:filesystem"
    fi
  ) 200>/tmp/tmate_autosave.lock
}
```

`git commit --amend` significa: "reemplaza el último commit por este".

Así la rama `filesystem` SIEMPRE tiene un solo commit. Da igual cuántas veces guardes. Es solo un snapshot del estado actual, con force-push una y otra vez.

El `flock` es un cerrojo: como hay dos bucles de save (inotify + periódico), hay que evitar que lancen git a la vez y se pisen. Un solo proceso git a la vez.

Limpio.

---

## El sync_from_remote: gestionar varias sesiones

Mira, un caso en el que no piensas al principio: ¿y si lanzas DOS runs a la vez? ¿O si una sesión modifica la rama `filesystem` mientras otra corre?

El script gestiona eso con un `sync_from_remote` antes de cada commit:

```bash
sync_from_remote() {
  git fetch origin "filesystem":refs/remotes/origin/filesystem
  git merge --ff-only "refs/remotes/origin/filesystem"
}
```

El `--ff-only` (fast-forward only) es importante: significa "mergea SOLO si se puede avanzar limpiamente, sin crear un commit de merge".

Si ambas ramas divergieron (tipo, dos sesiones modificaron archivos distintos), el fast-forward falla silenciosamente (`2>/dev/null || true`) y guardamos el estado local. No es un sistema de merge perfecto, pero evita las corrupciones en el caso simple donde una sola sesión corre.

Honestamente, no hay que lanzar 3 sesiones en paralelo sobre el mismo repo. Pero el código aun así intenta no explotar si pasa. Es defensa.

---

## El caché APT: instalar rápido

Hay un detalle en el workflow que no lo parece pero está bien pensado:

```yaml
- name: Cache & install APT packages (tmate + watcher)
  uses: awalsh128/cache-apt-pkgs-action@v1.6.0
  with:
    packages: tmate inotify-tools
```

tmate e inotify-tools se instalan vía una acción que **cachea los paquetes APT**.

En el primer run, descarga e instala. En los runs siguientes, se restaura desde el caché GitHub Actions: más rápido, sin redescargar.

¿Y te acuerdas del `git clean -fdx -e .apt-cache` de antes? Está ligado. La carpeta `.apt-cache` está protegida de la limpieza justo para que los paquetes que instales durante tu sesión puedan persistir un mínimo.

Todo encaja. Pensé en el ciclo de vida completo.

---

## Los scripts escondidos en /tmp

Otro detalle vicioso pero ingenioso. Al principio del script:

```bash
RUNNER_SCRIPTS_DIR="/tmp/runner-scripts"
rm -rf "$RUNNER_SCRIPTS_DIR"
mkdir -p "$RUNNER_SCRIPTS_DIR"
cp -r .github/scripts "$RUNNER_SCRIPTS_DIR/"
```

Los scripts (`update_readme.py`, etc.) se copian en `/tmp` ANTES de tocar la rama `filesystem`.

¿Por qué? Porque cuando haces el `git reset --hard` hacia la rama `filesystem` (vacía al principio, o con tu disco), los archivos `.github/scripts` del repo fuente desaparecen del workspace.

Pero el script aún los necesita durante la sesión (para actualizar el README en cada relanzamiento de tmate). Así que los esconde en `/tmp`, fuera del alcance de git:

```bash
python3 "$RUNNER_SCRIPTS_DIR/scripts/update_readme.py" --ssh "$tmate_ssh" ...
```

Si no piensas en eso, te tiras 30 minutos sin entender por qué tu script desapareció. Yo pensé en eso.

---

## El shell a medida

Pequeña comodidad: la sesión te da un shell configurado, no un bash desnudo.

El `prestart.sh` copia un `.bashrc` custom:

```bash
if ! grep -q "Custom prompt and aliases for remote sessions" "$HOME/.bashrc"; then
  cp .github/scripts/remote_bashrc "$HOME/.bashrc"
fi
sudo cp "$HOME/.bashrc" /root/.bashrc
```

Y ese `.bashrc` contiene un prompt coloreado, alias (`ll`, `lla`, `rm -i`), y sobre todo un override de `exit`:

```bash
exit() {
    killall -9 -u "$(whoami)" tmate 2>/dev/null || true
    builtin exit "$@"
}

# Ctrl+D hace lo mismo que exit
bind -x '"\C-d": "exit"'
```

Cuando escribes `exit` (o Ctrl+D), mata limpiamente los procesos tmate antes de cerrar. Eso evita dejar sesiones tmate zombis.

También hay una función `tmate-detach` si quieres desconectarte SIN matar la sesión (para reconectarte luego). Detalle de comodidad, pero muestra el nivel de cuidado.

---

## El tmate que se relanza solo

Pequeña comodidad: si escribes `exit` en tu shell, normalmente la sesión tmate muere y quedas desconectado para siempre.

Salvo que aquí, tmate está en un bucle `while true`:

```bash
while true; do
  tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
  while tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}' >/dev/null 2>&1; do
    sleep 2
  done
  echo "tmate session ended; restarting..."
done
```

¿Haces `exit`? La sesión se reinicia sola. Te reconectas con el mismo enlace.

Es tonto, pero hace la sesión usable.

---

## La reconexión en un comando

¿Cómo te reconectas tras una desconexión, sin rebuscar en los logs del run cada vez?

La dirección SSH de tmate se escribe en un archivo `host.conf`, commiteado en la rama `filesystem`:

```bash
printf '%s' "${tmate_ssh#ssh }" > host.conf
```

Y como ese archivo está en git, puedes recuperarlo vía la API GitHub con un solo comando:

```bash
ssh "$(gh api -H 'Accept: application/vnd.github.v3.raw' \
  "/repos/USER/REPO/contents/host.conf?ref=filesystem" | tr -d '\r\n')"
```

Lanzas eso, busca la dirección SSH actual en el repo, y te conecta. Aunque la dirección haya cambiado entre dos sesiones.

---

## El flow completo

Recapitulemos:

1. Disparas el workflow (push o botón manual)
2. GitHub te da una VM Ubuntu
3. El script restaura el disco desde la rama "filesystem"
4. inotify empieza a vigilar todos los cambios
5. periodic_save commitea cada 5s en backup
6. tmate arranca → genera los enlaces SSH/web
7. Los enlaces se escriben en el README + host.conf
8. Te conectas con ssh o el terminal web
9. Haces lo que quieras: cada cambio de archivo = autosave
10. 6h después, GitHub mata la VM
11. Tu disco queda intacto en la rama "filesystem"
12. Vuelves a lanzar el workflow → vuelta al paso 3, todo sigue ahí

Un VPS gratis con disco persistente. Solo con git y GitHub Actions.

---

## Bueno, hay que ser honesto: los límites

Es un hack, no un verdadero VPS. Así que:

- **6h máx por run.** Hay que relanzar el workflow regularmente. Uptime limitado en cada run.
- **Reservado al dev y a la exploración.** No vas a alojar tu sitio ahí. Es para explorar, desarrollar, depurar, probar un entorno Linux desechable pero recuperable.
- **GitHub lo ve todo.** Son sus máquinas. No metas nada sensible.
- **Mantén el repo privado.** Expones un shell SSH. Un repo público = cualquiera puede potencialmente conectarse. Mala idea.
- **Está al límite de las condiciones de uso.** GitHub Actions está hecho para CI/CD, no para VPS gratis. Así que úsalo con parsimonia, para lo legítimo, sin abusar.

### El verdadero talón de Aquiles: git odia los archivos grandes

Git está hecho para texto, no para un filesystem.

El disco persistente vive en una rama git. Así que todo lo que guardas pasa por git. Y git:
- gestiona mal los archivos binarios grandes (¿una imagen Docker de 2 GB en git? olvida)
- tiene un límite de 100 MB por archivo en GitHub (límite duro, no hace push más allá)
- recomienda quedarse bajo ~5 GB por repo

Así que si haces `npm install` de un proyecto con 500 MB de `node_modules`, o si compilas un proyecto que genera binarios pesados, el push hacia `filesystem` o bien irá lentísimo, o bien fallará directamente.

El `git commit --amend` ayuda (un solo commit, sin historial que engorde), pero no cambia que un archivo de 200 MB nunca pasará.

En resumen: **funciona superbién para código, configs, archivos pequeños. No funciona para guardar datos gordos o artefactos binarios.** Hay que tener eso en mente sobre lo que haces en tu sesión.

### No es un snapshot sistema completo

Otro matiz importante: la rama `filesystem` guarda el **workspace** (la carpeta del repo), no todo el sistema.

Si haces `apt install htop`, el binario va a `/usr/bin/htop`, que está FUERA del workspace. Así que NO se guardará. En el próximo run, hay que reinstalarlo.

Por eso tenemos el caché APT y el `prestart.sh`: para repreparar el entorno sistema en cada arranque, visto que solo el workspace persiste.

Si quieres que tus installs sobrevivan, hay que meterlas en el workspace (tipo, instalar en una carpeta local en vez de en sistema). Es una gimnasia que integrar.

---

## VPS gratis vs verdadero VPS: el duelo

| | repo-to-vps | Verdadero VPS (5€/mes) |
|---|---|---|
| **Precio** | 0€ | ~5-10€/mes |
| **Uptime** | 6h, a relanzar | 24/7 |
| **Disco** | rama git, archivos pequeños | verdadero SSD, varios GB |
| **RAM** | ~7 GB (¡generoso!) | 1-2 GB a menudo |
| **CPU** | 2-4 núcleos correctos | 1-2 vCPU |
| **Setup** | clona un template | config manual |
| **Persistencia** | workspace solo | sistema completo |
| **Legitimidad** | límite de las CGU | 100% limpio |

El punto interesante es que en specs brutas (RAM, CPU), el runner GitHub suele ser MEJOR que un VPS a 5€. Pero el uptime de 6h y la persistencia limitada al workspace lo convierten en un juguete de hacker, no en un verdadero servidor.

¿Para aprender, probar, depurar un sistema Linux rápido en un entorno recuperable? Perfecto. ¿Para alojar algo serio? Coge un verdadero VPS.

Pero para un entorno Linux temporal que puedes restaurar a voluntad, es simplemente genial.

---

## El patrón tras todo eso

Si tomas distancia, repo-to-vps y el bot email (mi otro artículo) se apoyan en la misma idea:

> **Git no es solo un gestor de versiones. Es un sistema de almacenamiento persistente, gratis, versionado, accesible vía una API.**

En cuanto tienes un sistema stateless (GitHub Actions, un Worker, una función serverless) y quieres guardar un estado entre dos ejecuciones, git puede servir de "disco".

- El bot email guarda un `lastId` en un tag git.
- repo-to-vps guarda un filesystem entero en una rama git.

Mismo patrón, dos escalas. Un valor de un lado, un disco del otro.

Y el `git commit --amend` + force-push es la técnica común: **guardas un solo commit que representa el estado actual, machacado en cada update.**

No está hecho para eso. Pero funciona. Y es gratis.

---

**Los 3 puntos a recordar:**

1. **Una rama git = un disco duro persistente**: Guarda tu filesystem en una rama dedicada, restaura al arrancar, y tienes un estado que sobrevive a las máquinas desechables.

2. **inotify + git = autosave en tiempo real**: `inotifywait` vigila los cambios a nivel kernel y hace push hacia git al instante. Con `git commit --amend` para mantener un solo commit limpio.

3. **tmate transforma un runner en VPS**: SSH en vivo sobre una máquina GitHub Actions, con reinicio automático y reconexión en un comando vía la API GitHub.

Git como disco duro, segundo episodio. Creo que voy a terminar guardándolo todo en ramas git.
