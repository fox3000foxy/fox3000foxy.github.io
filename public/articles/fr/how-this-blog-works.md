---
title: Comment fonctionne ce blog ?
description: "Les coulisses du blog : React, Vite, Markdown, la pipeline CI/CD
  et le flux de rédaction."
date: 2026-03-08
aiGenerated: true
tags:
  - react
  - meta
  - blog
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "mJBJfnxk0dFtD1gEhUbyRtRr30gT7thT/MB0j31yDcu+3KQTxwg8clQX8wOi8mp4GOUcmD/IUD55+zdfFqZdqA=="
---

# Comment Fonctionne Ce Blog ?

Tu t'es déjà demandé comment ce blog fonctionne sous le capot ? Dans cet article, je vais te détailler toute l'architecture de l'application, de la stack technique jusqu'au processus de rédaction d'un article. Et oui, je vais même te montrer comment j'écris mes articles depuis VS Code !

## La Stack Technique

Ce blog est construit avec des technologies web modernes :

- **React 19** -- pour l'interface utilisateur
- **TypeScript** -- pour un code typé et plus fiable
- **Vite** -- comme outil de build ultra-rapide
- **React Router v7** -- pour la navigation entre les pages
- **react-markdown** -- pour transformer le Markdown en HTML
- **rehype-raw + rehype-sanitize** -- pour autoriser du HTML brut dans le Markdown en toute sécurité

Le tout est hébergé sur **GitHub Pages** directement depuis le dépôt `fox3000foxy.github.io`.

## Structure du Projet

Voici à quoi ressemble l'arborescence du projet :

![](assets/how-this-blog-works/project-structure.png)

```
├── .github/
│   └── workflows/
│       └── deploy.yml              ← Pipeline CI/CD
├── public/
│   ├── home.md                     ← Contenu de la page d'accueil
│   ├── portfolio.md                ← Contenu du portfolio
│   └── articles/
│       ├── index.json              ← Liste de tous les articles
│       ├── hello-world.md          ← Un article
│       ├── how-this-blog-works.md  ← Cet article !
│       └── assets/                 ← Images des articles
├── src/
│   ├── main.tsx                    ← Point d'entrée React
│   ├── App.tsx                     ← Routeur principal
│   ├── components/
│   │   ├── Header.tsx              ← Barre de navigation
│   │   └── Footer.tsx              ← Pied de page
│   └── pages/
│       ├── Home.tsx                ← Page d'accueil
│       ├── BlogList.tsx            ← Liste des articles
│       ├── Article.tsx             ← Lecteur d'article
│       ├── Portfolio.tsx           ← Page portfolio
│       └── NotFound.tsx            ← Page 404
└── vite.config.ts                  ← Configuration Vite
```

L'idée centrale est simple : **le contenu est séparé du code**. Les pages sont écrites en Markdown dans le dossier `public/`, et le code React dans `src/` s'occupe de les afficher.

## Le Système de Routage

Le fichier `App.tsx` définit toutes les routes de l'application avec React Router :

![](assets/20260308_153440_image.png)


| Route         | Page      | Description                                |
| --------------- | ----------- | -------------------------------------------- |
| `/`           | Home      | Page d'accueil, charge `home.md`            |
| `/blog`       | BlogList  | Liste de tous les articles                  |
| `/blog/:slug` | Article   | Un article, charge `articles/{slug}.md`     |
| `/portfolio`  | Portfolio | Page portfolio, charge `portfolio.md`       |
| `*`           | NotFound  | Page 404 pour les URLs inconnues            |

Chaque page a un rôle bien défini : elle récupère un fichier Markdown, le transforme en HTML avec `react-markdown`, et l'affiche à l'écran.

## Comment Fonctionne un Article ?

C'est la partie la plus intéressante ! Voici le cycle de vie d'un article :

### 1. Le Fichier `index.json`

Tous les articles sont référencés dans `public/articles/index.json`. Chaque entrée contient les métadonnées de l'article :

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

- **slug** -- l'identifiant unique, utilisé dans l'URL (`/blog/hello-world`)
- **title** -- le titre affiché dans la liste
- **description** -- un court résumé
- **date** -- la date de publication

### 2. Le Fichier Markdown

Le contenu de l'article est un simple fichier `.md` dans `public/articles/`. Le nom du fichier correspond au `slug` défini dans `index.json`.

![](assets/20260308_153509_image.png)

Tu peux y mettre ce que tu veux : titres, listes, images, tableaux, et même du HTML brut grâce à `rehype-raw` !

### 3. Le Rendu Côté React

Quand tu visites `/blog/hello-world`, voici ce qui se passe :

1. React Router récupère le paramètre `slug` depuis l'URL
2. Le composant `Article.tsx` charge `/articles/hello-world.md`
3. Le Markdown est transformé en HTML par `react-markdown`
4. Les liens vers `assets/` sont automatiquement réécrits vers `/articles/assets/`
5. En parallèle, les métadonnées sont chargées depuis `index.json` pour afficher la date et la description

C'est aussi simple que ça !

## La Page d'Accueil et le Portfolio

Les pages Accueil et Portfolio fonctionnent exactement de la même manière : elles chargent un fichier Markdown (`home.md` ou `portfolio.md`) et le rendent en HTML.

La particularité, c'est qu'elles utilisent un schéma de sanitization personnalisé qui autorise les attributs `class` et `style` sur tous les éléments HTML. Ça me permet d'écrire du HTML stylisé directement dans le Markdown, comme des galeries d'images par exemple.

## Le Header et le Footer

Le Header est épinglé en haut de la page avec `position: fixed`. Il contient :

- Mon avatar GitHub (chargé directement depuis `github.com/fox3000foxy.png`)
- Le titre du blog
- Les liens de navigation : Accueil, Blog, Portfolio

Le Footer est minimaliste : juste un copyright avec l'année courante calculée dynamiquement.

## Le Thème Sombre

Le site est **toujours en mode sombre** -- pas de bascule jour/nuit. C'est un choix délibéré : `color-scheme: dark` est défini dans les styles globaux, avec un fond noir `#000` et du texte blanc `#fff`. Les liens sont bleus (`#64b5f6`) et deviennent verts au survol (`#81c784`).

## Comment J'Écris un Article

Passons à la pratique ! Voici mon workflow pour écrire un nouvel article :

### Étape 1 : Créer le Fichier Markdown

J'ouvre VS Code et je crée un nouveau fichier `.md` dans `public/articles/` :

### Étape 2 : Écrire le Contenu

J'écris le contenu de l'article directement en Markdown. VS Code a un excellent aperçu Markdown intégré :

![](assets/20260308_153613_image.png)

Pour les images, je les place dans `public/articles/assets/` et je les référence avec la syntaxe Markdown standard :

```markdown
![description](assets/my-image.png)
```

Le composant `Article.tsx` réécrit automatiquement le chemin `assets/` vers `/articles/assets/` pour que les images s'affichent correctement.

### Étape 3 : Enregistrer l'Article dans index.json

Une fois l'article terminé, je l'ajoute dans `public/articles/index.json` pour qu'il apparaisse dans la liste du blog :

![](assets/20260308_153629_image.png)

### Étape 4 : Tester en Local

Je lance le serveur de développement Vite :

```bash
pnpm dev
```

Vite démarre en quelques millisecondes et je peux voir mon article en temps réel sur `localhost:5173` :

![](assets/20260308_153703_image.png)

### Étape 5 : Publier

Un simple `git push` suffit ! Le pipeline CI/CD s'occupe du reste automatiquement.

## Le Pipeline de Déploiement CI/CD

J'ai mis en place un pipeline **GitHub Actions** complet qui automatise le lint, le build et le déploiement du site à chaque push sur `main`. Voyons ça en détail.

Le workflow se trouve dans `.github/workflows/deploy.yml` et est divisé en deux jobs : **build** et **deploy**.

### Déclencheurs

```yaml
on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
```

Le pipeline s'exécute à chaque **push** sur `main` et à chaque **pull request** visant `main`. Les PRs sont donc vérifiées (lint + build) avant d'être mergées, mais seuls les pushes sur `main` déclenchent un déploiement.

### Job 1 : Build

Le job de build tourne sur `ubuntu-latest` et suit ces étapes :

1. **Checkout** -- Clone le dépôt avec tout l'historique (`fetch-depth: 0`)
2. **Setup pnpm** -- Installe la dernière version de pnpm avec `pnpm/action-setup@v4`
3. **Setup Node.js 20** -- Configure Node avec le cache pnpm activé pour des installations plus rapides
4. **Install dependencies** -- Exécute `pnpm install --frozen-lockfile` pour garantir des builds reproductibles (pas de modification du lockfile autorisée)
5. **Lint** -- Exécute `pnpm run lint` (ESLint) pour vérifier la qualité du code avant le build
6. **Build** -- Exécute `pnpm run build`, qui vérifie d'abord les types TypeScript (`tsc -b`) puis bundle le tout avec Vite
7. **Upload artifact** -- Téléverse le dossier `dist/` comme artefact de build pour le job de déploiement

Si une étape échoue -- une erreur de lint, de type ou de build -- tout le pipeline s'arrête et rien n'est déployé. Ça protège le site en production du code cassé.

### Job 2 : Deploy

Le job de déploiement ne s'exécute que si :

- Le job de build a réussi (`needs: build`)
- L'événement est un **push** (pas une PR)
- La branche est **main**

```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

Il procède ensuite :

1. **Télécharge l'artefact de build** -- Récupère le dossier `dist/` produit par le job de build
2. **Configure GitHub Pages** -- Met en place l'environnement Pages
3. **Téléverse vers Pages** -- Prépare le dossier `dist/` pour GitHub Pages
4. **Déploie** -- Publie le site avec `actions/deploy-pages@v4`

### Le Tableau Complet

Voici ce qui se passe de l'écriture au déploiement :

```
Écrire l'article dans VS Code
         ↓
   git add & commit
         ↓
      git push
         ↓
  GitHub Actions se déclenche
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
    En ligne sur GitHub Pages !
```

Le processus entier prend environ une minute entre le push et la mise en ligne. Pas de déploiement manuel, pas de FTP, pas de SSH -- juste `git push` et c'est fait.

## Le Build de Production

Sous le capot, la commande `pnpm build` exécute :

1. `tsc -b` -- Vérifie les types TypeScript
2. `vite build` -- Bundle et optimise tout le code

Vite produit des fichiers minifiés et optimisés avec du code-splitting automatique. Le résultat est un site statique ultra-rapide.

## Pourquoi Cette Architecture ?

J'aurais pu utiliser un CMS, un générateur de site statique comme Hugo ou Jekyll, ou même Next.js. Mais voici pourquoi j'ai choisi cette approche :

- **Simplicité** -- Écris en Markdown, push sur GitHub, c'est en ligne
- **Contrôle total** -- Pas de dépendance à un CMS ou une base de données
- **Performance** -- Vite + React = chargement rapide
- **Flexibilité** -- Je peux mélanger Markdown et HTML comme je veux
- **Apprentissage** -- C'est un super projet pour maîtriser React et TypeScript
- **CI/CD** -- Vérifications de qualité et déploiement automatisés avec GitHub Actions

## Conclusion

Ce blog est un projet simple mais bien pensé : Markdown pour le contenu, React pour le rendu, Vite pour la performance, GitHub Actions pour le CI/CD, et GitHub Pages pour l'hébergement. Pas de base de données, pas de serveur backend, juste des fichiers statiques servis efficacement avec un pipeline automatisé qui garantit la qualité à chaque push.

Si tu veux créer ton propre blog avec une architecture similaire, n'hésite pas à jeter un coup d'œil au [code source sur GitHub](https://github.com/fox3000foxy/fox3000foxy.github.io) !

Merci d'avoir lu, et à bientôt dans le prochain article ! 🦊
