---
title: Script de firma de commits SSH explicado
description: Un recorrido por el ayudante de firma de commits SSH y por qué
  quería commits con estilo.
date: 2026-03-08
aiGenerated: true
tags:
  - git
  - security
  - shell
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA=="
author_sig: "MEYCIQC+/hgBYR80wHqm4eMaUKCExm9vYDSuxglWv4783n6cewIhALrpoJIBUnxN1Wnj0KuR0kVH6awbouVBs9IXpjG8kcgC"
---

# Script de firma de commits SSH explicado

Este artículo explora el script `setup-ssh-signing.sh` que publiqué en [Gist](https://gist.github.com/fox3000foxy/95500d129cd4bf5c173c323d2492569a). Veremos qué hace cada parte, cómo hace que la firma de commits SSH local al repositorio sea sencilla y, sí, por qué me molesté en escribirlo en primer lugar (spoiler: solo quería que mis commits se vieran **con estilo**).

## Motivación

Siempre me ha encantado ajustar mi flujo de trabajo de Git, y después de ver a otras personas con pequeñas insignias «Verified» junto a sus commits pensé: ¿por qué yo no? La firma GPG integrada es un poco pesada y global, así que terminé escribiendo un pequeño ayudante que:

- crea una clave SSH solo para firmar,
- configura solo el repositorio actual,
- opcionalmente reescribe el historial para firmar commits antiguos,
- y permite transferir la clave entre máquinas.

En realidad, la necesidad era principalmente vanidad. No hay ningún requisito técnico para las firmas en mis proyectos personales, pero tener un «Verified» verde en un commit se siente genial, y escribir el script fue un ejercicio divertido de scripting en shell.

> Digo, firmar tus commits es como usar una chaqueta de cuero en una revisión de código -- totalmente innecesario, pero te hace sentir como un hacker.

## Lo que hace el script

El script es un solo archivo Bash con `set -euo pipefail` al principio para que falle rápido. Aquí hay un resumen de alto nivel de su comportamiento:

1. **Generar o importar una clave de firma**  
   Las claves viven en `.git-signing/` en el directorio donde ejecutas el script.
2. **Configurar Git localmente**  
   Establece `gpg.format=ssh`, `user.signingkey`, `commit.gpgsign=true`, `tag.gpgSign=true`, y un `allowedSignersFile` que apunta a la clave pública.
3. **Gestionar claves entre máquinas**  
   Soporte para `--export-keys`/`--import-keys` que te permite mover la clave privada entre computadoras sin tocar el estado global.
4. **Reescritura opcional del historial** (`--resign-all`)  
   Reescribe cada commit en cada rama/tag (o solo aquellos no presentes en `upstream` para forks) y los vuelve a firmar con `-S`, dejando a otros autores intactos.
5. **Flags de utilidad**  
   `--autostash`, `--autopush`, `--commit-date`, `--yes` para modo no interactivo, etc.
6. **Detección de forks y verificaciones de seguridad**  
   Detecta el remoto `upstream`, advierte antes de reescribir el historial, verifica las herramientas necesarias (`git`, `ssh-keygen`, `zip/unzip`), asegura los permisos adecuados, e incluso crea una copia segura de la clave en tiempo de ejecución si los permisos del sistema de archivos son demasiado permisivos.

El script es idempotente: ejecutarlo dos veces no regenerará tu clave ni sobrescribirá la configuración existente.

## Explicación paso a paso

A continuación se muestran algunas de las partes clave del código con explicaciones.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Configure SSH commit signing in a controlled, repo-local way.
# - Key files are created in the directory where this script is launched.
# - Git config is written locally to the current repository only.
```

El encabezado establece seguridad y documenta el objetivo. El siguiente bloque analiza las opciones de CLI (`--name`, `--email`, `--repo`, etc.) con un bucle `while [[ $# -gt 0 ]]; do case … esac done`. Los campos de identidad obligatorios se validan más adelante:

```bash
if [[ -z "$NAME" || -z "$EMAIL" ]]; then
  echo "Error: missing identity. Provide --name and --email." >&2
  exit 1
fi
```

La generación de claves ocurre en `$LAUNCH_DIR/.git-signing`. Si ya existe una clave, el script la deja intacta; `--import-keys` puede poblar el directorio desde un archivo ZIP.

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

Después de asegurarse de que la clave privada es usable (`ssh-keygen -Y sign …`), el script escribe un pequeño archivo `allowed_signers` que contiene la clave pública y establece la configuración local de Git correspondiente:

```bash
git -C "$REPO_DIR" config --local gpg.format ssh
git -C "$REPO_DIR" config --local user.signingkey "$RUNTIME_KEY_PATH"
git -C "$REPO_DIR" config --local gpg.ssh.allowedSignersFile "$ALLOWED_SIGNERS"
git -C "$REPO_DIR" config --local commit.gpgsign true
git -C "$REPO_DIR" config --local tag.gpgSign true
```

Si solicitas la reescritura del historial con `--resign-all`, el script construye un comando `git filter-branch` que vuelve a firmar los commits elegibles con `-S`. Respeta el estado del fork omitiendo opcionalmente los commits ya presentes en `upstream`.

El resultado final imprime la clave pública y las instrucciones para agregarla a la sección **Signing Key** de GitHub, junto con una receta rápida de prueba.

## ¿Por qué firmar commits?

Esta es la parte donde admito que no lo necesitaba. Mis repositorios no requieren procedencia para nada de lo que publico, y no uso tags firmados para releases. El «por qué» es:

- porque podía,
- porque se ve bonito (¿has visto la insignia?),
- porque me dio una excusa para experimentar con `git filter-branch` y scripting en shell,
- y porque es otra pieza de contenido «yo mismo construí esto» para el blog.

En resumen: era solo por apariencia, pero esa es la mitad de la diversión de jugar con herramientas.

## Ejemplos de uso

```bash
# configuración inicial en el repositorio actual
chmod +x ./setup-ssh-signing.sh
./setup-ssh-signing.sh --name "Tu Nombre" \
                       --email "tu@email.com"

# exportar claves para usar en otra máquina
./setup-ssh-signing.sh --export-keys ./my-signing-keys.zip

# importar claves en una segunda máquina
./setup-ssh-signing.sh --import-keys ./my-signing-keys.zip --repo ./my-repo \
                       --name "Tu Nombre" --email "tu@email.com"

# reescribir historial y hacer push
./setup-ssh-signing.sh --repo ./my-repo --name "Tu Nombre" --email "tu@email.com" \
                       --resign-all --autostash --autopush --yes
```

## Reflexiones finales

Este script es una pequeña utilidad, pero encapsula algunas ideas interesantes:

- mantener las claves criptográficas locales y por repositorio,
- nunca tocar la configuración global a menos que lo pidas,
- proporcionar importación/exportación simple y reescritura de historial,
- y documentar todo el proceso en una entrada de blog porque ¿por qué no?

Si te sientes tentado a agregar firmas a tus propios commits, ¡pruébalo! Y si solo estás aquí por los puntos de estilo, igual. 😎
