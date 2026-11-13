---
title: Script de firma SSH explicado
description: Disección del helper de firma de commits SSH y por qué yo
  quería commits con estilo.
date: 2026-03-08
aiGenerated: true
tags:
  - git
  - security
  - shell
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "yIFsfKjKnWHlrbfnMrKCUhISxU/kCmKJLz+ySOk26Andl27yURTVF85FVUkIGsUrcso0PqcEaMU7z+pJxD4S0g=="
---

# Script de firma SSH para commits: explicación

Este artículo disecciona el script `setup-ssh-signing.sh` que publiqué en [Gist](https://gist.github.com/fox3000foxy/95500d129cd4bf5c173c323d2492569a). Veremos qué hace cada parte, cómo hace que la firma SSH local a un repo sea totalmente indolora, y, sí, por qué me tomé siquiera la molestia de escribirlo (spoiler: solo quería que mis commits tuvieran **estilo**).

## Motivación

Siempre me encantó trastear con mi flujo de trabajo en Git, y después de ver a gente con pequeñas insignias "Verified" junto a sus commits, me dije: ¿por qué yo no? La firma GPG integrada es pesada y global, así que terminé escribiendo un pequeño helper que:

- crea una clave SSH dedicada a la firma,
- configura únicamente el repo actual,
- reescribe eventualmente el historial para firmar los commits viejos,
- y permite transportar la clave entre máquinas.

Francamente, la necesidad era sobre todo vanidad. Mis proyectos personales no imponen ninguna exigencia de firma, pero ver una insignia verde "Verified" en un commit tiene su efecto, y escribir ese script en shell me dio un verdadero gustazo.

> Bueno, firmar tus commits es un poco como ponerte una chaqueta de cuero para una revisión de código: totalmente inútil, pero te hace sentir un hacker.

## Qué hace el script

El script es un solo archivo Bash con `set -euo pipefail` arriba para interrumpir la ejecución a la primera que falle. Aquí un resumen de lo que hace:

1. **Generar o importar una clave de firma**
   Las claves aterrizan en `.git-signing/` en la carpeta donde lanzas el script.
2. **Configurar Git localmente**
   Fija `gpg.format=ssh`, `user.signingkey`, `commit.gpgsign=true`, `tag.gpgSign=true`, y un `allowedSignersFile` que apunta a la clave pública.
3. **Gestionar las claves entre máquinas**
   Gracias a `--export-keys` / `--import-keys`, puedes transferir tu clave privada de un ordenador a otro sin tocar la config global.
4. **Reescritura de historial opcional** (`--resign-all`)
   Reescribe todos los commits de todas las ramas/tags (o solo los que no están en `upstream` para los forks) y los refirma con `-S`, sin tocar a los demás autores.
5. **Flags utilitarios**
   `--autostash`, `--autopush`, `--commit-date`, `--yes` para el modo no interactivo, etc.
6. **Detección de fork y comprobaciones de seguridad**
   Detecta el remote `upstream`, avisa antes de reescribir el historial, verifica las herramientas necesarias (`git`, `ssh-keygen`, `zip/unzip`), se asegura de los permisos correctos, e incluso crea una copia segura de la clave si los permisos del filesystem son demasiado permisivos.

El script es idempotente: lanzarlo dos veces no regenera tu clave ni machaca la config existente.

## Recorrido paso a paso

Aquí algunos extractos clave del código con sus explicaciones.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Configura la firma SSH de commits de forma controlada, local al repo.
# - Los archivos de clave se crean en el directorio donde se lanza este script.
# - La config de Git se escribe solo localmente en el repo actual.
```

El encabezado plantea la seguridad y documenta el objetivo. El trozo siguiente parsea las opciones CLI (`--name`, `--email`, `--repo`, etc.) con un bucle `while [[ $# -gt 0 ]]; do case … esac done`. Los campos de identidad obligatorios se verifican más tarde:

```bash
if [[ -z "$NAME" || -z "$EMAIL" ]]; then
  echo "Error: missing identity. Provide --name and --email." >&2
  exit 1
fi
```

La generación de clave se hace en `$LAUNCH_DIR/.git-signing`. Si ya existe una clave, el script la conserva tal cual; `--import-keys` permite rellenar la carpeta desde un ZIP.

```bash
mkdir -p "$KEY_DIR"

if [[ -n "$IMPORT_ZIP_PATH" ]]; then
  import_keys_from_zip "$IMPORT_ZIP_PATH"
fi

if [[ ! -f "$KEY_PATH" ]]; then
  ssh-keygen -t ed25519 -N "" -C "$EMAIL signing key" -f "$KEY_PATH" >/dev/null
  echo "Generated signing key: $KEY_PATH"
else
  echo "Signing key already exists: $KEY_PATH"
fi
```

Tras comprobar que la clave privada es usable (`ssh-keygen -Y sign …`), el script escribe un archivo `allowed_signers` con la clave pública y fija la config local de Git:

```bash
git -C "$REPO_DIR" config --local gpg.format ssh
git -C "$REPO_DIR" config --local user.signingkey "$RUNTIME_KEY_PATH"
git -C "$REPO_DIR" config --local gpg.ssh.allowedSignersFile "$ALLOWED_SIGNERS"
git -C "$REPO_DIR" config --local commit.gpgsign true
git -C "$REPO_DIR" config --local tag.gpgSign true
```

Si pides la reescritura de historial con `--resign-all`, el script construye un comando `git filter-branch` que refirma los commits elegibles con `-S`. Respeta el estado del fork saltándose opcionalmente los commits ya presentes en `upstream`.

El resultado final muestra la clave pública y las instrucciones para añadirla en la sección **Signing Key** de GitHub, con una receta de test.

## Por qué firmar tus commits

Es el momento en que confieso que no lo necesitaba. Mis repos no exigen ninguna procedencia para lo que publico, y no uso tags firmados para las releases. El "porqué" es:

- porque podía,
- porque queda bien (¿viste la insignia?),
- porque me dio una excusa para experimentar con `git filter-branch` y shell,
- y porque es un "lo construí yo mismo" más para el blog.

En resumen, era solo para presumir, pero eso es lo que me gusta cuando trasteo con mis herramientas.

## Ejemplos de uso

```bash
# configuración inicial en el repo actual
chmod +x ./setup-ssh-signing.sh
./setup-ssh-signing.sh --name "Your Name" \
                       --email "you@example.com"

# exportar las claves para otra máquina
./setup-ssh-signing.sh --export-keys ./my-signing-keys.zip

# importar las claves en una segunda máquina
./setup-ssh-signing.sh --import-keys ./my-signing-keys.zip --repo ./my-repo \
                       --name "Your Name" --email "you@example.com"

# reescribir el historial y empujar
./setup-ssh-signing.sh --repo ./my-repo --name "Your Name" --email "you@example.com" \
                       --resign-all --autostash --autopush --yes
```

## Últimas reflexiones

Este script sigue siendo una utilidad compacta, pero lleva algunos principios que asumo:

- mantener las claves criptográficas locales y por repo,
- no tocar nunca la config global salvo que lo pidas,
- ofrecer un import/export simple y la reescritura de historial,
- y documentar todo el proceso en un artículo de blog para guardar un rastro reutilizable.

Si te apetece añadir firmas a tus propios commits, ¡pruébalo! Y si solo estás aquí por el estilo, igual. 😎
