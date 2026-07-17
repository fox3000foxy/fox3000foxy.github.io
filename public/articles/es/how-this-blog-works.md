---
title: ¿Cómo Funciona Este Blog?
description: "Una exploración a fondo de los internos de este blog: React, Vite,
  Markdown, el pipeline de CI/CD y el flujo de trabajo para escribir artículos."
date: 2026-03-08
aiGenerated: true
authors:
  - fox3000foxy
tags:
  - react
  - meta
  - blog
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "tWSZeUqfpaZ8UpMpYyAVInAMxInllRPkJlIsWDKFnpDBQ0fxWqblAPyC6igqB+cAN8cMknMAu+Z/eDNYgDYDwQ=="
---

# ¿Cómo Funciona Este Blog?

¿Alguna vez te has preguntado cómo funciona este blog por dentro? En este artículo, te explicaré toda la arquitectura de la aplicación, desde el stack tecnológico hasta el proceso de escribir un artículo. Y sí, ¡incluso te mostraré cómo escribo mis artículos desde VS Code!

## El Stack Tecnológico

Este blog está construido con tecnologías web modernas:

- **React 19** -- para la interfaz de usuario
- **TypeScript** -- para código tipado y más fiable
- **Vite** -- como herramienta de construcción ultrarrápida
- **React Router v7** -- para la navegación entre páginas
- **react-markdown** -- para transformar Markdown en HTML
- **rehype-raw + rehype-sanitize** -- para permitir HTML crudo en Markdown de forma segura

Todo está alojado en **GitHub Pages** directamente desde el repositorio `fox3000foxy.github.io`.

## Estructura del Proyecto

Así es como se ve el árbol del proyecto:

![](assets/how-this-blog-works/project-structure.png)

```
├── .github/
│   └── workflows/
│       └── deploy.yml              ← Pipeline de CI/CD
├── public/
│   ├── home.md                     ← Contenido de la página de inicio
│   ├── portfolio.md                ← Contenido del portafolio
│   └── articles/
│       ├── index.json              ← Lista de todos los artículos
│       ├── hello-world.md          ← Un artículo
│       ├── how-this-blog-works.md  ← ¡Este artículo!
│       └── assets/                 ← Imágenes de los artículos
├── src/
│   ├── main.tsx                    ← Punto de entrada de React
│   ├── App.tsx                     ← Enrutador principal
│   ├── components/
│   │   ├── Header.tsx              ← Barra de navegación
│   │   └── Footer.tsx              ← Pie de página
│   └── pages/
│       ├── Home.tsx                ← Página de inicio
│       ├── BlogList.tsx            ← Lista de artículos
│       ├── Article.tsx             ← Lector de artículos
│       ├── Portfolio.tsx           ← Página de portafolio
│       └── NotFound.tsx            ← Página 404
└── vite.config.ts                  ← Configuración de Vite
```

La idea central es simple: **el contenido está separado del código**. Las páginas están escritas en Markdown en la carpeta `public/`, y el código React en `src/` se encarga de renderizarlas.

## El Sistema de Enrutamiento

El archivo `App.tsx` define todas las rutas de la aplicación usando React Router:

![](assets/20260308_153440_image.png)


| Ruta          | Página     | Descripción                                    |
| ------------- | ---------- | ---------------------------------------------- |
| `/`           | Home       | Página de inicio, carga `home.md`              |
| `/blog`       | BlogList   | Lista de todos los artículos                   |
| `/blog/:slug` | Article    | Un artículo individual, carga `articles/{slug}.md` |
| `/portfolio`  | Portfolio  | Página de portafolio, carga `portfolio.md`     |
| `*`           | NotFound   | Página 404 para URLs desconocidas              |

Cada página tiene un rol bien definido: obtiene un archivo Markdown, lo transforma en HTML con `react-markdown`, y lo muestra en pantalla.

## ¿Cómo Funciona un Artículo?

¡Esta es la parte más interesante! Aquí está el ciclo de vida de un artículo:

### 1. El Archivo `index.json`

Todos los artículos están referenciados en `public/articles/index.json`. Cada entrada contiene los metadatos del artículo:

```json
[
  {
    "slug": "hello-world",
    "title": "Hello World",
    "description": "A sample post for Fox's Blog.",
    "date": "2026-03-08"
  }
]
```

- **slug** -- el identificador único, usado en la URL (`/blog/hello-world`)
- **title** -- el título mostrado en la lista
- **description** -- un resumen corto
- **date** -- la fecha de publicación

### 2. El Archivo Markdown

El contenido del artículo es un simple archivo `.md` en `public/articles/`. El nombre del archivo coincide con el `slug` definido en `index.json`.

![](assets/20260308_153509_image.png)

¡Puedes poner cualquier cosa ahí: encabezados, listas, imágenes, tablas, e incluso HTML crudo gracias a `rehype-raw`!

### 3. Renderizado del Lado de React

Cuando visitas `/blog/hello-world`, esto es lo que sucede:

1. React Router captura el parámetro `slug` de la URL
2. El componente `Article.tsx` obtiene `/articles/hello-world.md`
3. El Markdown se transforma en HTML mediante `react-markdown`
4. Los enlaces a `assets/` se reescriben automáticamente a `/articles/assets/`
5. En paralelo, los metadatos se cargan desde `index.json` para mostrar la fecha y la descripción

¡Así de simple!

## La Página de Inicio y el Portafolio

Las páginas de Inicio y Portafolio funcionan exactamente igual: cargan un archivo Markdown (`home.md` o `portfolio.md`) y lo renderizan como HTML.

Lo especial es que usan un esquema de sanitización personalizado que permite atributos `class` y `style` en todos los elementos HTML. Esto me permite escribir HTML con estilo directamente en Markdown, como galerías de imágenes por ejemplo.

## El Encabezado y el Pie de Página

El Header está fijado en la parte superior de la página con `position: fixed`. Contiene:

- Mi avatar de GitHub (cargado directamente de `github.com/fox3000foxy.png`)
- El título del blog
- Enlaces de navegación: Inicio, Blog, Portafolio

El Footer es minimalista: solo un copyright con el año actual calculado dinámicamente.

## El Tema Oscuro

El sitio está **siempre en modo oscuro** -- no hay interruptor claro/oscuro. Esta es una elección deliberada: `color-scheme: dark` está configurado en los estilos globales, con fondo negro `#000` y texto blanco `#fff`. Los enlaces son azules (`#64b5f6`) y se vuelven verdes al pasar el ratón (`#81c784`).

## Cómo Escribo un Artículo

¡Ahora la parte práctica! Aquí está mi flujo de trabajo para escribir un nuevo artículo:

### Paso 1: Crear el Archivo Markdown

Abro VS Code y creo un nuevo archivo `.md` en `public/articles/`:

### Paso 2: Escribir el Contenido

Escribo el contenido del artículo directamente en Markdown. VS Code ofrece una excelente vista previa integrada de Markdown:

![](assets/20260308_153613_image.png)

Para las imágenes, las coloco en `public/articles/assets/` y las referencio usando la sintaxis estándar de Markdown:

```markdown
![description](assets/my-image.png)
```

El componente `Article.tsx` reescribe automáticamente la ruta `assets/` a `/articles/assets/` para que las imágenes se muestren correctamente.

### Paso 3: Registrar el Artículo en index.json

Una vez que el artículo está terminado, lo añado a `public/articles/index.json` para que aparezca en la lista del blog:

![](assets/20260308_153629_image.png)

### Paso 4: Probar Localmente

Inicio el servidor de desarrollo de Vite:

```bash
pnpm dev
```

Vite se inicia en milisegundos y puedo ver mi artículo en tiempo real en `localhost:5173`:

![](assets/20260308_153703_image.png)

### Paso 5: Publicar

¡Un simple `git push` es todo lo que se necesita! El pipeline de CI/CD se encarga del resto automáticamente.

## El Pipeline de Despliegue CI/CD

He configurado un pipeline completo de **GitHub Actions** que automatiza el linting, la construcción y el despliegue del sitio cada vez que hago push a `main`. Vamos a desglosarlo.

El workflow vive en `.github/workflows/deploy.yml` y está dividido en dos trabajos: **build** y **deploy**.

### Disparadores

```yaml
on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
```

El pipeline se ejecuta en cada **push** a `main` y en cada **pull request** dirigido a `main`. Esto significa que los PRs se verifican (lint + build) antes de fusionarse, pero solo los pushes a `main` desencadenan un despliegue real.

### Trabajo 1: Build

El trabajo de build se ejecuta en `ubuntu-latest` y pasa por estos pasos:

1. **Checkout** -- Clona el repositorio con historial completo (`fetch-depth: 0`)
2. **Setup pnpm** -- Instala la última versión de pnpm usando `pnpm/action-setup@v4`
3. **Setup Node.js 20** -- Configura Node con caché de pnpm habilitada para instalaciones más rápidas
4. **Install dependencies** -- Ejecuta `pnpm install --frozen-lockfile` para garantizar builds reproducibles (no se permiten cambios en el lockfile)
5. **Lint** -- Ejecuta `pnpm run lint` (ESLint) para detectar problemas de calidad del código antes de construir
6. **Build** -- Ejecuta `pnpm run build`, que primero verifica los tipos de TypeScript (`tsc -b`) y luego empaqueta todo con Vite
7. **Upload artifact** -- Sube la carpeta `dist/` como un artefacto de construcción para el trabajo de deploy

Si algún paso falla -- un error de lint, un error de tipo, un error de build -- todo el pipeline se detiene y no se despliega nada. Esto mantiene el sitio en vivo a salvo de código roto.

### Trabajo 2: Deploy

El trabajo de deploy solo se ejecuta si:

- El trabajo de build tuvo éxito (`needs: build`)
- El evento es un **push** (no un PR)
- La rama es **main**

```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

Entonces:

1. **Descarga el artefacto de build** -- Obtiene la carpeta `dist/` producida por el trabajo de build
2. **Configura GitHub Pages** -- Prepara el entorno de Pages
3. **Sube a Pages** -- Empaqueta la carpeta `dist/` para GitHub Pages
4. **Despliega** -- Publica el sitio usando `actions/deploy-pages@v4`

### El Panorama Completo

Esto es lo que sucede desde la escritura hasta el despliegue:

```
Escribir artículo en VS Code
        ↓
   git add & commit
        ↓
     git push
        ↓
  GitHub Actions se activa
        ↓
  ┌─────────────────┐
  │  TRABAJO BUILD  │
  │  1. Checkout    │
  │  2. Setup pnpm  │
  │  3. Setup Node  │
  │  4. Install     │
  │  5. Lint ✓      │
  │  6. Build ✓     │
  │  7. Upload dist │
  └────────┬────────┘
           ↓
  ┌─────────────────┐
  │ TRABAJO DEPLOY  │
  │  1. Download    │
  │  2. Configure   │
  │  3. Upload      │
  │  4. Deploy 🚀   │
  └─────────────────┘
           ↓
   ¡En vivo en GitHub Pages!
```

Todo el proceso toma aproximadamente un minuto desde el push hasta la publicación. Sin despliegue manual, sin FTP, sin SSH -- solo `git push` y está hecho.

## El Build de Producción

Bajo el capó, el comando `pnpm build` ejecuta:

1. `tsc -b` -- Verifica los tipos de TypeScript
2. `vite build` -- Empaqueta y optimiza todo el código

Vite produce archivos minificados y optimizados con división de código automática. El resultado es un sitio estático ultrarrápido.

## ¿Por Qué Esta Arquitectura?

Podría haber usado un CMS, un generador de sitios estáticos como Hugo o Jekyll, o incluso Next.js. Pero aquí está por qué elegí este enfoque:

- **Simplicidad** -- Escribe en Markdown, haz push a GitHub, está en vivo
- **Control total** -- Sin dependencia de un CMS o base de datos
- **Rendimiento** -- Vite + React = carga rápida
- **Flexibilidad** -- Puedo mezclar Markdown y HTML como quiera
- **Aprendizaje** -- Es un gran proyecto para dominar React y TypeScript
- **CI/CD** -- Verificaciones de calidad automatizadas y despliegue con GitHub Actions

## Conclusión

Este blog es un proyecto simple pero bien pensado: Markdown para el contenido, React para el renderizado, Vite para el rendimiento, GitHub Actions para CI/CD y GitHub Pages para el alojamiento. Sin base de datos, sin servidor backend, solo archivos estáticos servidos eficientemente con un pipeline automatizado que garantiza la calidad en cada push.

Si quieres crear tu propio blog con una arquitectura similar, ¡no dudes en echar un vistazo al [código fuente en GitHub](https://github.com/fox3000foxy/fox3000foxy.github.io)!

Gracias por leer, y nos vemos en el próximo artículo! 🦊
