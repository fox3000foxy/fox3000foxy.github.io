---
title: "Repo to VPS: convierte GitHub Actions en un VPS gratuito con almacenamiento persistente"
description: Cómo convertir un runner de GitHub Actions en un VPS siempre activo usando git como almacenamiento persistente -- tmate, inotify y commit --amend.
date: 2026-05-29
authors:
  - fox3000foxy
tags:
  - github
  - devops
  - automation
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "uXnU/J4ZLGQyyjLi9bCyiOwUlqtIeAJuGPpFZ1WOXmSGe/EZqz0R05BR8M1u+zf4IEU2XZpe1eL+7wFcV9k0iQ=="
---

## GitHub te regala un VPS gratis por 6h. Encontré cómo hacerlo permanente.

GitHub Actions te da máquinas Linux gratis.

O sea, servidores Ubuntu de verdad. 2 núcleos, 7 GB de RAM, 14 GB de disco. Gratis. Por 6h por run.

El único "problema": al final del run, todo se borra. La máquina es desechable. Instalas cosas, programs, configuras... y puf, al final todo desaparece. Como si no hubieras hecho nada.

Salvo si.

Salvo si usas **git como disco duro**.

Y entonces, de repente, tienes un VPS gratis con un disco persistente que sobrevive a los runs. Te reconectas, todo sigue ahí. Retomas donde lo dejaste.

Es completamente roto. Déjame explicarte xD

---

## El contexto: los runners de GitHub Actions

Cuando lanzas un workflow de GitHub Actions, GitHub te da una VM.

Está hecha para compilar tu código, lanzar tus tests, hacer deploy. El workflow corre, hace su trabajo, y la máquina se destruye.

Pero nada te impide hacer otra cosa con esa VM. Abrir un shell SSH y usarla como servidor.

El tema es que estas máquinas son **stateless** y **temporales**:
- Temporal: 6h máx por run (`timeout-minutes: 360`, el límite de GitHub)
- Stateless: todo se borra al final

Así que para convertirla en un VPS funcional, hay que resolver dos problemas:
1. **¿Cómo conectarse en tiempo real?**
2. **¿Cómo mantener el disco entre runs?**

Ahí es cuando se vuelve un hack.

---

## Problema 1: SSH en vivo con tmate

**tmate** es un fork de tmux que crea una sesión SSH compartible.

Lo ejecutas en una máquina y te genera dos enlaces:
- una URL SSH (`ssh xxx@nyc1.tmate.io`)
- una URL web (terminal en el navegador)

Te conectas con uno de esos enlaces, y boom, estás en un shell en la máquina. En tiempo real.

El workflow entonces lanza tmate:

```bash
tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
tmate -S /tmp/tmate.sock set-option -g remain-on-exit on
tmate_ssh=$(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}')
tmate_web=$(tmate -S /tmp/tmate.sock display -p '#{tmate_web}')
```

Y esos enlaces se escriben directo en el README del repo con un script Python. Abres tu repo, ves el enlace de conexión, haces clic. Ya estás en tu VPS.

Primer problema resuelto. Pero el segundo es el que realmente está loco.

---

## Problema 2: git como disco duro

Aquí viene lo enfermizo.

La máquina se borra en cada run. Así que guardamos **el sistema de archivos en una rama git dedicada**, llamada `filesystem`.

Al iniciar, el script restaura el estado desde esa rama:

```bash
filesystem_branch="filesystem"
git fetch origin "$filesystem_branch":refs/remotes/origin/$filesystem_branch
git checkout -B filesystem-workspace "refs/remotes/origin/$filesystem_branch"
git reset --hard "refs/remotes/origin/$filesystem_branch"
```

La rama `filesystem` ES tu disco duro. Tus archivos, tus instalaciones, tus configs -- todo está ahí.

¿Captas? La máquina es desechable, pero el disco vive en git. Vuelves a lanzar el workflow, el disco se restaura, retomas exactamente donde estabas.

Es como un VPS que hiberna. Solo que la hibernación es un repo git xD

### Primer lanzamiento: crear el disco vacío

En el primer run, la rama `filesystem` todavía no existe. Hay que crearla. Y no es trivial:

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

El `git checkout --orphan` es la clave. Una rama huérfana es una rama **sin ningún historial** -- como si empezaras desde un repo vacío.

¿Por qué huérfana? Porque NO quieres que tu disco persistente arrastre todo el historial de tu código fuente. El disco es algo aparte, que tiene su propia vida. Empieza virgen.

Y el `git ls-remote --exit-code` al principio, es solo una verificación limpia: "¿la rama ya existe en el remoto?". Si sí, no se toca nada. Si no, se crea. Idempotente, como nos gusta.

### El git clean selectivo: proteger las caches

Esta línea merece que nos detengamos:

```bash
git clean -fdx -e .apt-cache -e .cache -e host.conf -e tmate.sock
```

`git clean -fdx` borra TODO lo que no está trackeado por git. Normalmente es violento -- limpia el workspace a fondo.

Pero los `-e` (exclude) protegen ciertas cosas:
- `.apt-cache` → la caché de paquetes APT (volveremos a esto, es inteligente)
- `.cache` → caché genérica
- `host.conf` → la dirección SSH de la sesión
- `tmate.sock` → el socket de la sesión tmate activa

Si limpiaras esos archivos, romperías la sesión activa o perderías tu caché. Así que los perdonas durante el reset.

Un detalle tonto a primera vista, pero sin esto todo explota.

---

## El autosave: inotify vigilando todo

Bueno, pero ¿cómo terminan los archivos en la rama `filesystem`?

Respuesta: un watcher que vigila TODOS los cambios de archivos y hace commit/push automáticamente.

La herramienta mágica es **inotifywait** (del paquete `inotify-tools`). Vigila el sistema de archivos a nivel de kernel y se dispara cuando un archivo cambia.

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock|\.gitignore|\.txt\.swp)(/|$)' .; do
    echo "[autosave] change detected"
    commit_and_push
    sleep 1
  done
}

autosave &
```

Analicemos los flags de inotify, porque cada uno cuenta:
- `-r` → recursivo, vigila todas las subcarpetas
- `-e modify,create,delete,move` → reacciona a estos 4 tipos de eventos (modificación, creación, borrado, movimiento)
- `--exclude '...'` → una regex para ignorar ciertos archivos

El `--exclude` es crucial. Mira lo que ignora:
- `.git` → obviamente, porque si no cada commit dispararía un autosave que dispararía otro commit... bucle infinito. Catástrofe.
- `.apt-cache` y `.cache` → las caches, que cambian todo el tiempo y no quieres spamear en git
- `host.conf` y `tmate.sock` → los archivos de sesión, que se mueven constantemente
- `.gitignore`, `.txt.swp` → los archivos temporales (los `.swp` son los archivos de edición de vim)

Sin ese exclude, terminarías con un autosave que se dispara en bucle por sus propios cambios. El `.git` en la lista, es LA línea que evita que te dispares en el pie.

¿Modificas un archivo? inotify lo detecta al instante, hace commit, hace push. En menos de un segundo, tu cambio está en la rama `filesystem`.

Instalas algo, escribes código, tocas una configuración -- todo se guarda en tiempo real, automáticamente, sin que hagas nada.

Literalmente tienes un sistema de guardado automático del disco entero. Roto.

### El debounce: no spamear git

El `sleep 1` después de cada save es un **debounce**.

Cuando guardas un archivo en un editor, a menudo genera varios eventos del sistema de archivos en ráfaga (creación de un archivo temp, rename, borrado del anterior...). Sin debounce, dispararías 3-4 commits por un solo guardado.

El `sleep 1` dice: "espera un segundo después de un save, mientras la ráfaga se calma, antes de volver a escuchar". Así agrupa los cambios cercanos en un solo commit. Inteligente.

### Y un guardado periódico adicional

Por si inotify se perdiera algo, también hay un save cada 5 segundos:

```bash
periodic_save() {
  while true; do
    sync_from_remote
    sleep 5
    commit_and_push
  done
}

periodic_save &
```

Cinturón Y tirantes. Sobre todo no queremos perder el estado del disco.

---

## El detalle inteligente: un solo commit

Si haces commit en cada cambio de archivo, acumularías... miles de commits. En una hora de sesión, tu historial git explota. El repo se vuelve enorme. Es asqueroso.

La solución es elegante: **enmiendas el commit existente** en lugar de crear uno nuevo.

```bash
commit_and_push() {
  (
    flock -n 200 || return

    git add -A
    git reset -- .github/workflows/ .github/scripts/

    if ! git diff --cached --quiet; then
      if git rev-parse --verify HEAD >/dev/null 2>&1; then
        git commit --amend --no-edit
      else
        git commit -m "autosave $(date -u +%Y%m%dT%H%M%SZ)"
      fi
      git push --force origin "filesystem-workspace:filesystem"
    fi
  ) 200>/tmp/tmate_autosave.lock
}
```

`git commit --amend` significa: "reemplaza el último commit por este".

Así la rama `filesystem` tiene SIEMPRE un solo commit. No importa cuántas veces guardes. Es solo un snapshot del estado actual, con force-push una y otra vez.

El `flock` es un candado: como hay dos bucles de save (inotify + periódico), hay que evitar que ejecuten git al mismo tiempo y se pisen. Un solo proceso git a la vez.

Limpio.

---

## El sync_from_remote: manejar varias sesiones

Oye, algo en lo que no piensas al principio: ¿y si lanzas DOS runs al mismo tiempo? ¿O si una sesión modifica la rama `filesystem` mientras otra está corriendo?

El script lo maneja con un `sync_from_remote` antes de cada commit:

```bash
sync_from_remote() {
  git fetch origin "filesystem":refs/remotes/origin/filesystem
  git merge --ff-only "refs/remotes/origin/filesystem"
}
```

El `--ff-only` (fast-forward only) es importante: significa "merge SOLO si se puede avanzar limpiamente, sin crear un commit de merge".

Si las dos ramas han divergido (ej. dos sesiones modificaron cosas diferentes), el fast-forward falla silenciosamente (`2>/dev/null || true`) y se mantiene el estado local. No es un sistema de merge perfecto, pero evita corrupciones en el caso simple donde solo corre una sesión.

Honestamente, no deberías lanzar 3 sesiones en paralelo en el mismo repo. Pero el código igual intenta no explotar si pasa. Es defensivo.

---

## La caché APT: instalar rápido

Hay un detalle en el workflow que no parece gran cosa pero está bien pensado:

```yaml
- name: Cache & install APT packages (tmate + watcher)
  uses: awalsh128/cache-apt-pkgs-action@v1.6.0
  with:
    packages: tmate inotify-tools
```

tmate e inotify-tools se instalan a través de una acción que **cachea los paquetes APT**.

En el primer run, descarga e instala. En runs siguientes, se restaura desde la caché de GitHub Actions -- más rápido, sin necesidad de descargar de nuevo.

¿Y te acuerdas del `git clean -fdx -e .apt-cache` de hace rato? Está relacionado. La carpeta `.apt-cache` está protegida de la limpieza precisamente para que los paquetes que instalas durante tu sesión puedan persistir un mínimo.

Todo se tiene.

---

## Los scripts escondidos en /tmp

Otro detalle retorcido pero inteligente. Al principio del script:

```bash
RUNNER_SCRIPTS_DIR="/tmp/runner-scripts"
rm -rf "$RUNNER_SCRIPTS_DIR"
mkdir -p "$RUNNER_SCRIPTS_DIR"
cp -r .github/scripts "$RUNNER_SCRIPTS_DIR/"
```

Los scripts (`update_readme.py`, etc.) se copian a `/tmp` ANTES de tocar la rama `filesystem`.

¿Por qué? Porque cuando haces el `git reset --hard` hacia la rama `filesystem` (que está vacía al principio, o que contiene tu disco), los archivos `.github/scripts` del repo fuente desaparecen del workspace.

Pero los necesita para actualizar el README. Así que los esconde en `/tmp`, fuera del alcance de git:

```bash
python3 "$RUNNER_SCRIPTS_DIR/scripts/update_readme.py" --ssh "$tmate_ssh" ...
```

Si no piensas en ello, tu script desaparece. Yo sí pensé.

---

## El shell a medida

Pequeño comfort final: la sesión te da un shell configurado, no un bash pelado.

El `prestart.sh` copia un `.bashrc` personalizado:

```bash
if ! grep -q "Custom prompt and aliases for remote sessions" "$HOME/.bashrc"; then
  cp .github/scripts/remote_bashrc "$HOME/.bashrc"
fi
sudo cp "$HOME/.bashrc" /root/.bashrc
```

Y ese `.bashrc` contiene un prompt colorido, alias (`ll`, `lla`, `rm -i`), y sobre todo algo ingenioso: un override de `exit`:

```bash
exit() {
    killall -9 -u "$(whoami)" tmate 2>/dev/null || true
    builtin exit "$@"
}

bind -x '"\C-d": "exit"'
```

Cuando escribes `exit` (o Ctrl+D), mata limpiamente los procesos tmate antes de cerrar. Así evitas dejar sesiones tmate zombie tiradas en la máquina.

También hay una función `tmate-detach` por si quieres desconectarte SIN matar la sesión (para reconectarte después). Detalle de comfort, pero muestra el nivel de cuidado.

---

## El tmate que se reinicia solo

Pequeño comfort: si escribes `exit` en tu shell, normalmente la sesión tmate muere y te desconectas para siempre.

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

¿`exit`? La sesión se reinicia sola. Puedes reconectarte con el mismo enlace. Reconexión estable, incluso después de una desconexión.

Es absurdo, pero lo hace usable.

---

## La reconexión en un comando

¿Cómo te reconectas después de una desconexión, sin tener que revisar los logs del run cada vez?

La dirección SSH de tmate se escribe en un archivo `host.conf`, que a su vez está commiteado en la rama `filesystem`:

```bash
printf '%s' "${tmate_ssh#ssh }" > host.conf
```

Y como ese archivo está en git, puedes recuperarlo vía la API de GitHub con un solo comando:

```bash
ssh "$(gh api -H 'Accept: application/vnd.github.v3.raw' \
  "/repos/USER/REPO/contents/host.conf?ref=filesystem" | tr -d '\r\n')"
```

Lanzas esto, va a buscar la dirección SSH actual en el repo, y te conecta directamente. Incluso si la dirección cambió entre sesiones.

Listo.

---

## El flujo completo

Recapitulemos:

```
1. Lanzas el workflow (push o botón manual)
2. GitHub te da una VM Ubuntu
3. El script restaura el disco desde la rama "filesystem"
4. inotify empieza a vigilar todos los cambios
5. periodic_save hace commit cada 5s como backup
6. tmate arranca → genera los enlaces SSH/web
7. Los enlaces se escriben en el README + host.conf
8. Te conectas con ssh o el terminal web
9. Haces lo que quieras (programar, instalar, debug...)
   └── cada cambio de archivo = autosave instantáneo a git
10. 6h después, GitHub mata la VM
11. Pero tu disco está intacto en la rama "filesystem"
12. Vuelves a lanzar el workflow → vuelta al paso 3, todo sigue ahí
```

Un VPS. Gratis. Con disco persistente. Solo con git y GitHub Actions.

---

## Vale, seamos honestos: los límites

Es un hack, no un VPS de verdad. Así que:

- **6h máx por run.** Hay que relanzar el workflow regularmente. Nada de uptime infinito.
- **No para producción.** No vas a hostear tu sitio ahí. Es para explorar, desarrollar, debuggear, probar algo en un Linux desechable pero recuperable.
- **GitHub lo ve todo.** Son sus máquinas. No pongas nada sensible.
- **Mantén el repo privado.** Estás exponiendo un shell SSH. Un repo público = cualquiera puede potencialmente conectarse. Mala idea.
- **Está al límite de los términos de uso.** GitHub Actions es para CI/CD, no para VPS gratis. Así que úsalo con moderación, para cosas legítimas, sin abusar.

### El verdadero talón de Aquiles: git odia los archivos grandes

Hay un límite más técnico, y es el más importante de entender.

**Git está hecho para texto, no para un sistema de archivos.**

El disco persistente vive en una rama git. Así que todo lo que guardas pasa por git. Y git:
- maneja mal los archivos binarios grandes (¿una imagen Docker de 2 GB en git? olvídalo)
- tiene un límite de 100 MB por archivo en GitHub (hard limit, no hace push si lo superas)
- recomienda mantenerse bajo ~5 GB por repo

Así que si haces `npm install` de un proyecto con 500 MB de `node_modules`, o si compilas algo que genera binarios pesados, el push a `filesystem` o va a ir lentísimo, o va a fallar directamente.

El `git commit --amend` ayuda (un solo commit, sin historial que crezca), pero no cambia el hecho de que un archivo de 200 MB nunca pasará.

En resumen: **funciona genial para código, configuraciones, archivos pequeños. No funciona para guardar datos grandes o artefactos binarios.** Hay que tenerlo en cuenta sobre lo que haces en tu sesión.

### No es un snapshot completo del sistema

Otro matiz importante: la rama `filesystem` guarda el **workspace** (la carpeta del repo), no todo el sistema.

Si haces `apt install htop`, el binario va a `/usr/bin/htop`, que está FUERA del workspace. Por lo tanto NO se guardará. En el próximo run, hay que reinstalarlo.

Por eso tenemos la caché APT y el `prestart.sh`: para re-preparar el entorno del sistema en cada inicio, ya que solo el workspace persiste.

Si quieres que tus instalaciones sobrevivan, hay que ponerlas en el workspace (ej. instalar en una carpeta local en lugar de en todo el sistema). Es una gimnasia a la que hay que acostumbrarse.

---

## VPS gratis vs VPS de verdad: la comparativa

| | repo-to-vps | VPS de verdad (5€/mes) |
|---|---|---|
| **Precio** | 0€ | ~5-10€/mes |
| **Uptime** | 6h, hay que relanzar | 24/7 |
| **Disco** | rama git, archivos pequeños | SSD real, varios GB |
| **RAM** | ~7 GB (¡generoso!) | 1-2 GB a menudo |
| **CPU** | 2-4 núcleos decentes | 1-2 vCPU |
| **Setup** | clonar un template | configuración manual |
| **Persistencia** | solo workspace | sistema completo |
| **Legitimidad** | al límite de los TOS | 100% legal |

Lo gracioso es que en especificaciones brutas (RAM, CPU), el runner de GitHub suele ser MEJOR que un VPS de 5€. Pero el uptime de 6h y la persistencia limitada al workspace es lo que lo convierte en un juguete de hacker.

¿Para aprender, probar, debuguear algo Linux rápido en un entorno recuperable? Perfecto. ¿Para hostear algo serio? Cógete un VPS de verdad.

---

## El patrón detrás de todo esto

Si miras con perspectiva, repo-to-vps y el bot de email (mi otro artículo) se basan en la misma idea:

> **Git no es solo un gestor de versiones. Es un sistema de almacenamiento persistente, gratuito, versionado, accesible vía API.**

En cuanto tienes un sistema stateless (GitHub Actions, un Worker, una función serverless) y quieres mantener un estado entre dos ejecuciones, git puede servir como "disco".

- El bot de email guarda un `lastId` en un tag de git.
- repo-to-vps guarda un sistema de archivos entero en una rama de git.

Mismo patrón, dos escalas. Un valor de un lado, un disco del otro.

Y el `git commit --amend` + force-push es la técnica común: **mantienes un solo commit que representa el estado actual, sobrescrito en cada actualización.**

No fue hecho para esto. Pero funciona. Y es gratis.

---

**Las 3 cosas que recordar:**

1. **Una rama git = un disco duro persistente** -- Guarda tu sistema de archivos en una rama dedicada, restaura al iniciar, y tienes un estado que sobrevive a máquinas desechables.

2. **inotify + git = autosave en tiempo real** -- `inotifywait` vigila los cambios a nivel de kernel y hace push a git al instante. Con `git commit --amend` para mantener un solo commit limpio.

3. **tmate transforma un runner en VPS** -- SSH en vivo en una máquina de GitHub Actions, con reinicio automático y reconexión en un comando vía la API de GitHub.

Git como disco duro, segundo episodio. Creo que voy a terminar guardándolo todo en ramas de git xD
