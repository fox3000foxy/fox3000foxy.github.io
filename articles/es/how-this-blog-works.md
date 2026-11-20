---
title: Cómo funciona este blog
description: "Entre bambalinas del blog: React, Vite, Markdown, la pipeline CI/CD
  y el flujo de redacción."
date: 2026-03-08
aiGenerated: true
tags:
  - react
  - meta
  - blog
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "UBTRP2uYqFO63nBYxyj94sTaxsogBDkB/kRZi/LOuiUXGt+qiutH9f467Lx1LOuEPrjogJqj30RfyhRys6jb3A=="
---

# Cómo funciona este blog

¿Alguna vez te preguntaste cómo funciona este blog bajo el capó? En este artículo, te detallo toda la arquitectura de la aplicación, desde el stack técnico hasta el proceso de redacción de un artículo. Y sí, hasta te muestro cómo escribo mis artículos desde VS Code.

## El stack técnico

Este blog está construido con tecnologías web modernas:

- **React 19**: para la interfaz de usuario
- **TypeScript**: para un código tipado y más fiable
- **Vite**: como herramienta de build ultrarrápida
- **React Router v7**: para la navegación entre las páginas
- **react-markdown**: para transformar el Markdown en HTML
- **rehype-raw + rehype-sanitize**: para autorizar HTML en bruto en el Markdown con seguridad


## Estructura del proyecto

Así se ve el árbol del proyecto:

![](assets/how-this-blog-works/project-structure.png)

```
├── .github/
│   └── workflows/
│       └── deploy.yml              ← Pipeline CI/CD
├── public/
│   ├── home.md                     ← Contenido de la página inicio
│   ├── portfolio.md                ← Contenido del portfolio
│   └── articles/
│       ├── index.json              ← Lista de todos los artículos
│       ├── hello-world.md          ← Un artículo
│       ├── how-this-blog-works.md  ← ¡Este artículo!
│       └── assets/                 ← Imágenes de los artículos
├── src/
│   ├── main.tsx                    ← Punto de entrada React
│   ├── App.tsx                     ← Router principal
│   ├── components/
│   │   ├── Header.tsx              ← Barra de navegación
│   │   └── Footer.tsx              ← Pie de página
│   └── pages/
│       ├── Home.tsx                ← Página inicio
│       ├── BlogList.tsx            ← Lista de los artículos
│       ├── Article.tsx             ← Lector de artículo
│       ├── Portfolio.tsx           ← Página portfolio
│       └── NotFound.tsx            ← Página 404
└── vite.config.ts                  ← Configuración Vite
```

La idea central es simple: **el contenido está separado del código**. Las páginas se escriben en Markdown en la carpeta `public/`, y el código React en `src/` se encarga de mostrarlas. Mantengo esa separación: hace el contenido fácil de releer y el código fácil de hacer evolucionar.

## El sistema de ruteo

El archivo `App.tsx` define todas las rutas de la aplicación con React Router:

![](assets/20260308_153440_image.png)


| Ruta          | Página    | Descripción                              |
| --------------- | ----------- | -------------------------------------------- |
| `/`           | Home      | Página inicio, carga `home.md`              |
| `/blog`       | BlogList  | Lista de todos los artículos                |
| `/blog/:slug` | Article   | Un artículo, carga `articles/{slug}.md`     |
| `/portfolio`  | Portfolio | Página portfolio, carga `portfolio.md`      |
| `*`           | NotFound  | Página 404 para las URLs desconocidas       |

Cada página tiene un rol bien definido: recupera un archivo Markdown, lo transforma en HTML con `react-markdown`, y lo muestra en pantalla.

## Cómo funciona un artículo

Esta es la parte que más me gusta. Aquí el ciclo de vida de un artículo:

### 1. El archivo `index.json`

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

- **slug**: el identificador único, usado en la URL (`/blog/hello-world`)
- **title**: el título mostrado en la lista
- **description**: un breve resumen
- **date**: la fecha de publicación

### 2. El archivo Markdown

El contenido del artículo es un simple archivo `.md` en `public/articles/`. El nombre del archivo corresponde al `slug` definido en `index.json`.

![](assets/20260308_153509_image.png)

Puedes meter lo que quieras: títulos, listas, imágenes, tablas, ¡e incluso HTML en bruto gracias a `rehype-raw`!

### 3. El render en React

Cuando visitas `/blog/hello-world`, esto es lo que pasa:

1. React Router recupera el parámetro `slug` desde la URL
2. El componente `Article.tsx` carga `/articles/hello-world.md`
3. El Markdown se transforma en HTML por `react-markdown`
4. Los enlaces hacia `assets/` se reescriben automáticamente hacia `/articles/assets/`
5. En paralelo, los metadatos se cargan desde `index.json` para mostrar la fecha y la descripción

Así de simple.

## La página inicio y el portfolio

Las páginas Inicio y Portfolio funcionan exactamente igual: cargan un archivo Markdown (`home.md` o `portfolio.md`) y lo renderizan en HTML.

La particularidad es que usan un esquema de sanitización personalizado que autoriza los atributos `class` y `style` en todos los elementos HTML. Eso me permite escribir HTML estilizado directamente en el Markdown, como galerías de imágenes por ejemplo.

## El Header y el Footer

El Header está fijado arriba de la página con `position: fixed`. Contiene:

- Mi avatar GitHub (cargado directamente desde `github.com/fox3000foxy.png`)
- El título del blog
- Los enlaces de navegación: Inicio, Blog, Portfolio

El Footer es minimalista: solo un copyright con el año actual calculado dinámicamente.

## El tema oscuro

El sitio queda en modo oscuro permanentemente. Elegí eso deliberadamente para mantener una lectura cómoda por la noche: `color-scheme: dark` está definido en los estilos globales, con un fondo negro `#000` y texto blanco `#fff`. Los enlaces son azules (`#64b5f6`) y se vuelven verdes al pasar (`#81c784`).

## Cómo escribo un artículo

Pasemos a la práctica. Aquí mi flujo de trabajo para escribir un artículo nuevo:

### Paso 1: Crear el archivo Markdown

Abro VS Code y creo un nuevo archivo `.md` en `public/articles/`:

### Paso 2: Escribir el contenido

Escribo el contenido del artículo directamente en Markdown. VS Code tiene una excelente vista previa Markdown integrada:

![](assets/20260308_153613_image.png)

Para las imágenes, las pongo en `public/articles/assets/` y las referencio con la sintaxis Markdown estándar:

```markdown
![description](assets/my-image.png)
```

El componente `Article.tsx` reescribe automáticamente la ruta `assets/` hacia `/articles/assets/` para que las imágenes se muestren correctamente.

### Paso 3: Registrar el artículo en index.json

Una vez terminado el artículo, lo añado en `public/articles/index.json` para que aparezca en la lista del blog:

![](assets/20260308_153629_image.png)

### Paso 4: Probar en local

Lanzo el servidor de desarrollo Vite:

```bash
pnpm dev
```

Vite arranca en unos milisegundos y puedo ver mi artículo en tiempo real en `localhost:5173`. Esa rapidez me permite comprobar cada modificación casi al instante:

![](assets/20260308_153703_image.png)

### Paso 5: Publicar

¡Un simple `git push` basta! El pipeline CI/CD se encarga del resto automáticamente.

## El pipeline de despliegue CI/CD

Puse en marcha un pipeline **GitHub Actions** completo que automatiza el lint, el build y el despliegue del sitio en cada push a `main`. Veámoslo en detalle.

El workflow está en `.github/workflows/deploy.yml` y se divide en dos jobs: **build** y **deploy**.

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

El pipeline se ejecuta en cada **push** a `main` y en cada **pull request** hacia `main`. Las PRs se verifican (lint + build) antes de fusionarse, pero solo los pushes a `main` disparan un despliegue.

### Job 1: Build

El job de build corre en `ubuntu-latest` y sigue estos pasos:

1. **Checkout**: Clona el repo con todo el historial (`fetch-depth: 0`)
2. **Setup pnpm**: Instala la última versión de pnpm con `pnpm/action-setup@v4`
3. **Setup Node.js 20**: Configura Node con la caché pnpm activada para instalaciones más rápidas
4. **Install dependencies**: Ejecuta `pnpm install --frozen-lockfile` para garantizar builds reproducibles (ninguna modificación del lockfile autorizada)
5. **Lint**: Ejecuta `pnpm run lint` (ESLint) para comprobar la calidad del código antes del build
6. **Build**: Ejecuta `pnpm run build`, que primero verifica los tipos TypeScript (`tsc -b`) y luego empaqueta todo con Vite
7. **Upload artifact**: Sube la carpeta `dist/` como artefacto de build para el job de despliegue

Si una etapa falla (error de lint, de tipo o de build), todo el pipeline se detiene y nada se despliega. Esa guardia me protege del código roto en producción y confío en ella en cada push.

### Job 2: Deploy

El job de despliegue solo se ejecuta si:

- El job de build tuvo éxito (`needs: build`)
- El evento es un **push** (no una PR)
- La rama es **main**

```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

Luego procede:

1. **Descarga el artefacto de build**: Recupera la carpeta `dist/` producida por el job de build
2. **Configura GitHub Pages**: Pone en marcha el entorno Pages
3. **Sube hacia Pages**: Prepara la carpeta `dist/` para GitHub Pages
4. **Despliega**: Publica el sitio con `actions/deploy-pages@v4`

### El cuadro completo

Esto es lo que pasa desde la escritura hasta el despliegue:

```
Escribir el artículo en VS Code
          ↓
     git add & commit
          ↓
        git push
          ↓
    GitHub Actions se dispara
          ↓
    ┌─────────────────┐
    │   BUILD JOB     │
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
    │  DEPLOY JOB     │
    │  1. Download    │
    │  2. Configure   │
    │  3. Upload      │
    │  4. Deploy 🚀   │
    └─────────────────┘
             ↓
      En línea en GitHub Pages
```

El proceso entero tarda alrededor de un minuto entre el push y la puesta en línea. Publico con un simple `git push`, todo queda automático sin pasar por FTP ni SSH.

## El build de producción

Bajo el capó, el comando `pnpm build` ejecuta:

1. `tsc -b`: Verifica los tipos TypeScript
2. `vite build`: Empaqueta y optimiza todo el código

Vite produce archivos minificados y optimizados con code-splitting automático. El resultado es un sitio estático ultrarrápido.

## Por qué esta arquitectura

Podría haber usado un CMS, un generador de sitio estático como Hugo o Jekyll, o incluso Next.js. Pero aquí por qué elegí este enfoque:

- **Simplicidad**: Escribe en Markdown, push a GitHub, está en línea
- **Control total**: Ninguna dependencia de un CMS o una base de datos
- **Rendimiento**: Vite + React = carga rápida
- **Flexibilidad**: Puedo mezclar Markdown y HTML como quiera
- **Aprendizaje**: Es un superproyecto para dominar React y TypeScript
- **CI/CD**: Comprobaciones de calidad y despliegue automatizados con GitHub Actions

## Conclusión

Este blog es un proyecto simple pero bien pensado: Markdown para el contenido, React para el render, Vite para el rendimiento, GitHub Actions para el CI/CD, y GitHub Pages para el alojamiento. Solo se apoya en archivos estáticos servidos eficazmente, con un pipeline automatizado que garantiza la calidad en cada push.


Gracias por leer, ¡y hasta pronto en el próximo artículo! 🦊
