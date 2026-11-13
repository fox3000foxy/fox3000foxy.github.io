---
title: How This Blog Works
description: "The internals of the blog: React, Vite, Markdown, the CI/CD
  pipeline, and the writing workflow."
date: 2026-03-08
aiGenerated: true
tags:
  - react
  - meta
  - blog
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "hmEJAmKekUg+su4TM00bqrxDCAlacKUjc+EpxmMusOR2zGQAEcFjjNcEOzHr7oJshi8sMTB9/pjPhlR7qYyZaQ=="
---

# How Does This Blog Work?

Ever wondered how this blog works under the hood? In this article, I'll walk you through the whole app architecture, from the tech stack to the article-writing process. And yes, I'll even show you how I write my articles from VS Code!

## The Tech Stack

This blog is built with modern web technologies:

- **React 19**: for the user interface
- **TypeScript**: for typed, more reliable code
- **Vite**: as an ultra-fast build tool
- **React Router v7**: for navigation between pages
- **react-markdown**: for turning Markdown into HTML
- **rehype-raw + rehype-sanitize**: for allowing raw HTML in Markdown safely


## Project Structure

Here's what the project tree looks like:

![](assets/how-this-blog-works/project-structure.png)

```
├── .github/
│   └── workflows/
│       └── deploy.yml              ← CI/CD pipeline
├── public/
│   ├── home.md                     ← Homepage content
│   ├── portfolio.md                ← Portfolio content
│   └── articles/
│       ├── index.json              ← List of all articles
│       ├── hello-world.md          ← An article
│       ├── how-this-blog-works.md  ← This article!
│       └── assets/                 ← Article images
├── src/
│   ├── main.tsx                    ← React entry point
│   ├── App.tsx                     ← Main router
│   ├── components/
│   │   ├── Header.tsx              ← Navigation bar
│   │   └── Footer.tsx              ← Footer
│   └── pages/
│       ├── Home.tsx                ← Homepage
│       ├── BlogList.tsx            ← Article list
│       ├── Article.tsx             ← Article reader
│       ├── Portfolio.tsx           ← Portfolio page
│       └── NotFound.tsx            ← 404 page
└── vite.config.ts                  ← Vite config
```

The core idea is simple: **content is separated from code**. Pages are written in Markdown in the `public/` folder, and the React code in `src/` takes care of displaying them. I care about that separation: it keeps the content easy to reread and the code easy to evolve.

## The Routing System

The `App.tsx` file defines all the app routes with React Router:

![](assets/20260308_153440_image.png)


| Route         | Page      | Description                                |
| --------------- | ----------- | -------------------------------------------- |
| `/`           | Home      | Homepage, loads `home.md`            |
| `/blog`       | BlogList  | List of all articles                  |
| `/blog/:slug` | Article   | One article, loads `articles/{slug}.md`     |
| `/portfolio`  | Portfolio | Portfolio page, loads `portfolio.md`       |
| `*`           | NotFound  | 404 page for unknown URLs            |

Each page has a well-defined role: it fetches a Markdown file, turns it into HTML with `react-markdown`, and displays it on screen.

## How Does an Article Work?

This is my favorite part! Here's an article's lifecycle:

### 1. The `index.json` File

All articles are referenced in `public/articles/index.json`. Each entry holds the article's metadata:

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

- **slug**: the unique identifier, used in the URL (`/blog/hello-world`)
- **title**: the title shown in the list
- **description**: a short summary
- **date**: the publication date

### 2. The Markdown File

The article's content is a plain `.md` file in `public/articles/`. The filename matches the `slug` defined in `index.json`.

![](assets/20260308_153509_image.png)

You can put anything you want in it: titles, lists, images, tables, and even raw HTML thanks to `rehype-raw`!

### 3. React-Side Rendering

When you visit `/blog/hello-world`, here's what happens:

1. React Router grabs the `slug` parameter from the URL
2. The `Article.tsx` component loads `/articles/hello-world.md`
3. The Markdown is turned into HTML by `react-markdown`
4. Links to `assets/` are automatically rewritten to `/articles/assets/`
5. In parallel, metadata is loaded from `index.json` to show the date and description

Simple as that!

## The Homepage and Portfolio

The Home and Portfolio pages work exactly the same way: they load a Markdown file (`home.md` or `portfolio.md`) and render it as HTML.

The special part is they use a custom sanitization schema that allows `class` and `style` attributes on every HTML element. That lets me write styled HTML directly in Markdown, image galleries for example.

## The Header and Footer

The Header is pinned at the top of the page with `position: fixed`. It contains:

- My GitHub avatar (loaded directly from `github.com/fox3000foxy.png`)
- The blog title
- The nav links: Home, Blog, Portfolio

The Footer is minimalist: just a copyright with the dynamically computed current year.

## The Dark Theme

The site stays in dark mode permanently. I made that choice deliberately to keep reading comfortable in the evening: `color-scheme: dark` is set in the global styles, with a black `#000` background and white `#fff` text. Links are blue (`#64b5f6`) and turn green on hover (`#81c784`).

## How I Write an Article

Let's get practical! Here's my workflow for writing a new article:

### Step 1: Create the Markdown File

I open VS Code and create a new `.md` file in `public/articles/`:

### Step 2: Write the Content

I write the article's content directly in Markdown. VS Code has an excellent built-in Markdown preview:

![](assets/20260308_153613_image.png)

For images, I put them in `public/articles/assets/` and reference them with standard Markdown syntax:

```markdown
![description](assets/my-image.png)
```

The `Article.tsx` component automatically rewrites the `assets/` path to `/articles/assets/` so images display correctly.

### Step 3: Register the Article in index.json

Once the article is done, I add it in `public/articles/index.json` so it shows up in the blog list:

![](assets/20260308_153629_image.png)

### Step 4: Test Locally

I start the Vite dev server:

```bash
pnpm dev
```

Vite boots in milliseconds and I can see my article live on `localhost:5173`. That speed lets me check every change almost in real time:

![](assets/20260308_153703_image.png)

### Step 5: Publish

A simple `git push` is enough! The CI/CD pipeline takes care of the rest automatically.

## The CI/CD Deploy Pipeline

I set up a complete **GitHub Actions** pipeline that automates lint, build, and site deploy on every push to `main`. Let's look at it in detail.

The workflow lives in `.github/workflows/deploy.yml` and is split into two jobs: **build** and **deploy**.

### Triggers

```yaml
on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
```

The pipeline runs on every **push** to `main` and every **pull request** targeting `main`. PRs are checked (lint + build) before merging, but only pushes to `main` trigger a deploy.

### Job 1: Build

The build job runs on `ubuntu-latest` and follows these steps:

1. **Checkout**: Clones the repo with full history (`fetch-depth: 0`)
2. **Setup pnpm**: Installs the latest pnpm with `pnpm/action-setup@v4`
3. **Setup Node.js 20**: Configures Node with pnpm cache enabled for faster installs
4. **Install dependencies**: Runs `pnpm install --frozen-lockfile` to guarantee reproducible builds (no lockfile changes allowed)
5. **Lint**: Runs `pnpm run lint` (ESLint) to check code quality before the build
6. **Build**: Runs `pnpm run build`, which first type-checks TypeScript (`tsc -b`) then bundles everything with Vite
7. **Upload artifact**: Uploads the `dist/` folder as a build artifact for the deploy job

If any step fails (lint, type, or build error), the whole pipeline stops and nothing deploys. That guard protects me from broken code in production and I rely on it on every push.

### Job 2: Deploy

The deploy job only runs if:

- The build job succeeded (`needs: build`)
- The event is a **push** (not a PR)
- The branch is **main**

```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

It then proceeds:

1. **Download the build artifact**: Fetches the `dist/` folder produced by the build job
2. **Configure GitHub Pages**: Sets up the Pages environment
3. **Upload to Pages**: Prepares the `dist/` folder for GitHub Pages
4. **Deploy**: Publishes the site with `actions/deploy-pages@v4`

### The Full Picture

Here's what happens from writing to deploying:

```
Write the article in VS Code
          ↓
     git add & commit
          ↓
        git push
          ↓
    GitHub Actions triggers
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
      Live on GitHub Pages!
```

The whole process takes about a minute between push and going live. I publish with a simple `git push`, everything stays automatic with no FTP or SSH.

## The Production Build

Under the hood, the `pnpm build` command runs:

1. `tsc -b`: Checks TypeScript types
2. `vite build`: Bundles and optimizes all the code

Vite produces minified, optimized files with automatic code-splitting. The result is an ultra-fast static site.

## Why This Architecture?

I could have used a CMS, a static site generator like Hugo or Jekyll, or even Next.js. But here's why I picked this approach:

- **Simplicity**: Write in Markdown, push to GitHub, it's live
- **Full control**: No dependency on a CMS or database
- **Performance**: Vite + React = fast loading
- **Flexibility**: I can mix Markdown and HTML however I want
- **Learning**: It's a great project for mastering React and TypeScript
- **CI/CD**: Quality checks and automated deploys with GitHub Actions

## Conclusion

This blog is a simple but well-thought-out project: Markdown for content, React for rendering, Vite for performance, GitHub Actions for CI/CD, and GitHub Pages for hosting. It relies only on static files served efficiently, with an automated pipeline that guarantees quality on every push.


Thanks for reading, and see you in the next article! 🦊
