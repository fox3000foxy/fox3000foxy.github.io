---
title: Wie funktioniert dieser Blog?
description: "Ein tiefer Einblick in die Interna dieses Blogs: React, Vite,
  Markdown, die CI/CD-Pipeline und der Workflow zum Schreiben von Artikeln."
date: 2026-03-08
aiGenerated: true
tags:
  - react
  - meta
  - blog
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA=="
author_sig: "MEQCIAWKd7e3oF5htVr6bsmj+cLn/0SULFVFFkFb3PGhkVweAiAYIhwWWlsSQQjRT/v+t/OHyQLEh8VEBIbW8u2Jg6Fcww=="
---

# Wie funktioniert dieser Blog?

Schon mal gefragt, wie dieser Blog unter der Haube funktioniert? In diesem Artikel zeige ich dir die gesamte Architektur der Anwendung, vom Tech-Stack bis zum Prozess des Artikel-Schreibens. Und ja, ich zeige dir sogar, wie ich meine Artikel direkt aus VS Code schreibe!

## Der Tech-Stack

Dieser Blog wurde mit modernen Web-Technologien gebaut:

- **React 19** -- für die Benutzeroberfläche
- **TypeScript** -- für typisierten und zuverlässigeren Code
- **Vite** -- als ultraschnelles Build-Tool
- **React Router v7** -- für die Navigation zwischen Seiten
- **react-markdown** -- um Markdown in HTML zu verwandeln
- **rehype-raw + rehype-sanitize** -- um rohes HTML in Markdown zu erlauben, dabei aber sicher zu bleiben

Alles wird auf **GitHub Pages** direkt aus dem Repository `fox3000foxy.github.io` gehostet.

## Projektstruktur

So sieht der Projektbaum aus:

![](assets/how-this-blog-works/project-structure.png)

```
├── .github/
│   └── workflows/
│       └── deploy.yml        ← CI/CD-Pipeline
├── public/
│   ├── home.md               ← Inhalt der Startseite
│   ├── portfolio.md           ← Portfolio-Inhalt
│   └── articles/
│       ├── index.json         ← Liste aller Artikel
│       ├── hello-world.md     ← Ein Artikel
│       ├── how-this-blog-works.md  ← Dieser Artikel!
│       └── assets/            ← Artikel-Bilder
├── src/
│   ├── main.tsx               ← React-Einstiegspunkt
│   ├── App.tsx                ← Haupt-Router
│   ├── components/
│   │   ├── Header.tsx         ← Navigationsleiste
│   │   └── Footer.tsx         ← Fußzeile
│   └── pages/
│       ├── Home.tsx           ← Startseite
│       ├── BlogList.tsx       ← Artikelliste
│       ├── Article.tsx        ← Artikel-Reader
│       ├── Portfolio.tsx      ← Portfolioseite
│       └── NotFound.tsx       ← 404-Seite
└── vite.config.ts             ← Vite-Konfiguration
```

Die Kernidee ist einfach: **Inhalt ist vom Code getrennt**. Seiten werden als Markdown im `public/`-Ordner geschrieben, und der React-Code in `src/` kümmert sich um die Darstellung.

## Das Routing-System

Die `App.tsx`-Datei definiert alle Anwendungsrouten mit React Router:

![](assets/20260308_153440_image.png)


| Route         | Seite     | Beschreibung                                 |
| --------------- | ----------- | --------------------------------------------- |
| `/`           | Home      | Startseite, lädt `home.md`                   |
| `/blog`       | BlogList  | Liste aller Artikel                        |
| `/blog/:slug` | Article   | Ein einzelner Artikel, lädt `articles/{slug}.md` |
| `/portfolio`  | Portfolio | Portfolioseite, lädt `portfolio.md`         |
| `*`           | NotFound  | 404-Seite für unbekannte URLs                   |

Jede Seite hat eine klar definierte Rolle: Sie holt eine Markdown-Datei, wandelt sie mit `react-markdown` in HTML um und zeigt sie auf dem Bildschirm an.

## Wie funktioniert ein Artikel?

Das ist der interessanteste Teil! Hier ist der Lebenszyklus eines Artikels:

### 1. Die `index.json`-Datei

Alle Artikel werden in `public/articles/index.json` referenziert. Jeder Eintrag enthält die Metadaten des Artikels:

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

- **slug** -- die eindeutige Kennung, die in der URL verwendet wird (`/blog/hello-world`)
- **title** -- der Titel, der in der Liste angezeigt wird
- **description** -- eine kurze Zusammenfassung
- **date** -- das Veröffentlichungsdatum

### 2. Die Markdown-Datei

Der Artikel-Inhalt ist eine einfache `.md`-Datei in `public/articles/`. Der Dateiname entspricht dem `slug` aus der `index.json`.

![](assets/20260308_153509_image.png)

Du kannst alles Mögliche hineinpacken: Überschriften, Listen, Bilder, Tabellen und sogar rohes HTML, dank `rehype-raw`!

### 3. Rendering auf React-Seite

Wenn du `/blog/hello-world` besuchst, passiert Folgendes:

1. React Router fängt den `slug`-Parameter aus der URL ab
2. Die `Article.tsx`-Komponente holt `/articles/hello-world.md`
3. Das Markdown wird von `react-markdown` in HTML umgewandelt
4. Links zu `assets/` werden automatisch zu `/articles/assets/` umgeschrieben
5. Parallel dazu werden die Metadaten aus `index.json` geladen, um Datum und Beschreibung anzuzeigen

So einfach ist das!

## Die Startseite und das Portfolio

Die Startseite und die Portfolioseite funktionieren genauso: Sie laden eine Markdown-Datei (`home.md` oder `portfolio.md`) und rendern sie als HTML.

Das Besondere ist, dass sie ein benutzerdefiniertes Sanitierungs-Schema verwenden, das `class`- und `style`-Attribute auf allen HTML-Elementen erlaubt. Dadurch kann ich gestyltes HTML direkt in Markdown schreiben, wie zum Beispiel Bildergalerien.

## Der Header und der Footer

Der Header ist mit `position: fixed` oben auf der Seite fixiert. Er enthält:

- Mein GitHub-Avatar (direkt von `github.com/fox3000foxy.png` geladen)
- Den Blog-Titel
- Navigationslinks: Home, Blog, Portfolio

Der Footer ist minimalistisch: nur ein Copyright mit dem aktuellen Jahr, dynamisch berechnet.

## Das dunkle Design

Die Seite ist **immer im Dark Mode** -- kein Hell/Dunkel-Umschalter. Das ist eine bewusste Entscheidung: `color-scheme: dark` ist in den globalen Styles gesetzt, mit schwarzem Hintergrund `#000` und weißem Text `#fff`. Links sind blau (`#64b5f6`) und werden beim Überfahren grün (`#81c784`).

## Wie ich einen Artikel schreibe

Jetzt zum praktischen Teil! Hier ist mein Workflow zum Schreiben eines neuen Artikels:

### Schritt 1: Markdown-Datei erstellen

Ich öffne VS Code und erstelle eine neue `.md`-Datei in `public/articles/`:

### Schritt 2: Inhalt schreiben

Ich schreibe den Artikel-Inhalt direkt in Markdown. VS Code bietet eine hervorragende integrierte Markdown-Vorschau:

![](assets/20260308_153613_image.png)

Für Bilder lege ich sie in `public/articles/assets/` ab und verweise mit der standardmäßigen Markdown-Syntax darauf:

```markdown
![description](assets/my-image.png)
```

Die `Article.tsx`-Komponente schreibt den Pfad `assets/` automatisch zu `/articles/assets/` um, damit die Bilder korrekt angezeigt werden.

### Schritt 3: Artikel in index.json registrieren

Sobald der Artikel fertig ist, füge ich ihn zu `public/articles/index.json` hinzu, damit er in der Blog-Liste erscheint:

![](assets/20260308_153629_image.png)

### Schritt 4: Lokal testen

Ich starte den Vite-Dev-Server:

```bash
pnpm dev
```

Vite startet in Millisekunden und ich kann meinen Artikel in Echtzeit unter `localhost:5173` sehen:

![](assets/20260308_153703_image.png)

### Schritt 5: Veröffentlichen

Ein einfaches `git push` reicht! Die CI/CD-Pipeline erledigt den Rest automatisch.

## Die CI/CD-Deployment-Pipeline

Ich habe eine vollständige **GitHub Actions**-Pipeline eingerichtet, die Linting, Build und Deployment der Website automatisiert, jedes Mal wenn ich auf `main` pushe. Schauen wir sie uns genauer an.

Der Workflow lebt in `.github/workflows/deploy.yml` und ist in zwei Jobs aufgeteilt: **build** und **deploy**.

### Auslöser

```yaml
on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
```

Die Pipeline läuft bei jedem **Push** auf `main` und bei jedem **Pull Request**, der auf `main` abzielt. Das bedeutet, dass PRs vor dem Merge geprüft werden (Lint + Build), aber nur Pushs auf `main` lösen tatsächlich ein Deployment aus.

### Job 1: Build

Der Build-Job läuft auf `ubuntu-latest` und durchläuft diese Schritte:

1. **Checkout** -- Klont das Repository mit vollständiger Historie (`fetch-depth: 0`)
2. **Setup pnpm** -- Installiert die neueste Version von pnpm mit `pnpm/action-setup@v4`
3. **Setup Node.js 20** -- Konfiguriert Node mit pnpm-Caching für schnellere Installationen
4. **Abhängigkeiten installieren** -- Führt `pnpm install --frozen-lockfile` aus, um reproduzierbare Builds zu gewährleisten (keine Lockfile-Änderungen erlaubt)
5. **Lint** -- Führt `pnpm run lint` (ESLint) aus, um Code-Qualitätsprobleme vor dem Build zu erkennen
6. **Build** -- Führt `pnpm run build` aus, das zuerst TypeScript-Typen prüft (`tsc -b`) und dann alles mit Vite bündelt
7. **Artifact hochladen** -- Lädt den `dist/`-Ordner als Build-Artefakt für den Deploy-Job hoch

Wenn einer der Schritte fehlschlägt -- ein Lint-Fehler, ein Typ-Fehler, ein Build-Fehler -- stoppt die gesamte Pipeline und es wird nichts deployed. Das schützt die Live-Seite vor fehlerhaftem Code.

### Job 2: Deploy

Der Deploy-Job läuft nur, wenn:

- Der Build-Job erfolgreich war (`needs: build`)
- Das Ereignis ein **Push** ist (kein PR)
- Der Branch **main** ist

```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

Dann:

1. **Build-Artefakt herunterladen** -- Holt den `dist/`-Ordner aus dem Build-Job
2. **GitHub Pages konfigurieren** -- Richtet die Pages-Umgebung ein
3. **Zu Pages hochladen** -- Packt den `dist/`-Ordner für GitHub Pages
4. **Deployen** -- Veröffentlicht die Seite mit `actions/deploy-pages@v4`

### Das vollständige Bild

So läuft es vom Schreiben bis zum Deployment:

```
Artikel in VS Code schreiben
        ↓
   git add & commit
        ↓
      git push
        ↓
  GitHub Actions wird ausgelöst
        ↓
  ┌─────────────────┐
  │   BUILD-JOB     │
  │  1. Checkout    │
  │  2. Setup pnpm  │
  │  3. Setup Node  │
  │  4. Installieren│
  │  5. Lint ✓      │
  │  6. Build ✓     │
  │  7. Upload dist │
  └────────┬────────┘
           ↓
  ┌─────────────────┐
  │  DEPLOY-JOB     │
  │  1. Herunterl.  │
  │  2. Konfigurieren│
  │  3. Hochladen   │
  │  4. Deploy 🚀   │
  └─────────────────┘
           ↓
    Live auf GitHub Pages!
```

Der gesamte Vorgang dauert etwa eine Minute vom Push bis zur Live-Schaltung. Kein manuelles Deployment, kein FTP, kein SSH -- nur `git push` und es ist erledigt.

## Der Production Build

Unter der Haube führt `pnpm build` Folgendes aus:

1. `tsc -b` -- Prüft TypeScript-Typen
2. `vite build` -- Bündelt und optimiert den gesamten Code

Vite produziert minifizierte und optimierte Dateien mit automatischem Code-Splitting. Das Ergebnis ist eine blitzschnelle statische Website.

## Warum diese Architektur?

Ich hätte ein CMS, einen Static-Site-Generator wie Hugo oder Jekyll oder sogar Next.js verwenden können. Aber hier ist, warum ich mich für diesen Ansatz entschieden habe:

- **Einfachheit** -- In Markdown schreiben, auf GitHub pushen, es ist live
- **Volle Kontrolle** -- Keine Abhängigkeit von einem CMS oder einer Datenbank
- **Leistung** -- Vite + React = schnelles Laden
- **Flexibilität** -- Ich kann Markdown und HTML nach Belieben mischen
- **Lernen** -- Es ist ein großartiges Projekt, um React und TypeScript zu meistern
- **CI/CD** -- Automatisierte Qualitätschecks und Deployment mit GitHub Actions

## Fazit

Dieser Blog ist ein einfaches, aber durchdachtes Projekt: Markdown für Inhalte, React fürs Rendering, Vite für Leistung, GitHub Actions für CI/CD und GitHub Pages fürs Hosting. Keine Datenbank, kein Backend-Server, nur statische Dateien, die effizient ausgeliefert werden, mit einer automatisierten Pipeline, die bei jedem Push die Qualität sicherstellt.

Wenn du deinen eigenen Blog mit einer ähnlichen Architektur erstellen möchtest, schau dir gerne den [Quellcode auf GitHub](https://github.com/fox3000foxy/fox3000foxy.github.io) an!

Danke fürs Lesen und bis zum nächsten Artikel! 🦊
