---
title: Wie funktioniert dieser Blog?
description: "Die Kulissen des Blogs: React, Vite, Markdown, die CI/CD-Pipeline
  und der Redaktionsfluss."
date: 2026-03-08
aiGenerated: true
tags:
  - react
  - meta
  - blog
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "MYLnuC2rRJtbEgnsEHMfSoULYhnGzrNrBqTWqOfTlT3jJotZwTmck7E95P8wvWT6wGNmGaoEuZocTxCmwz5UKw=="
---

# Wie funktioniert dieser Blog?

Hast du dich schon gefragt, wie dieser Blog unter der Haube funktioniert? In diesem Artikel lege ich dir die gesamte Architektur der App dar, vom Tech-Stack bis zum Prozess, einen Artikel zu schreiben. Und ja, ich zeige dir sogar, wie ich meine Artikel aus VS Code schreibe!

## Der Tech-Stack

Dieser Blog ist mit modernen Webtechnologien gebaut:

- **React 19**: für die Benutzeroberfläche
- **TypeScript**: für typisierten und verlässlicheren Code
- **Vite**: als ultra-schnelles Build-Tool
- **React Router v7**: für die Navigation zwischen den Seiten
- **react-markdown**: um Markdown in HTML zu verwandeln
- **rehype-raw + rehype-sanitize**: um rohes HTML im Markdown sicher zu erlauben


## Projektstruktur

So sieht der Projektbaum aus:

![](assets/how-this-blog-works/project-structure.png)

```
├── .github/
│   └── workflows/
│       └── deploy.yml              ← CI/CD-Pipeline
├── public/
│   ├── home.md                     ← Inhalt der Startseite
│   ├── portfolio.md                ← Inhalt des Portfolios
│   └── articles/
│       ├── index.json              ← Liste aller Artikel
│       ├── hello-world.md          ← Ein Artikel
│       ├── how-this-blog-works.md  ← Dieser Artikel !
│       └── assets/                 ← Bilder der Artikel
├── src/
│   ├── main.tsx                    ← React-Einstiegspunkt
│   ├── App.tsx                     ← Hauptrouter
│   ├── components/
│   │   ├── Header.tsx              ← Navigationsleiste
│   │   └── Footer.tsx              ← Fußzeile
│   └── pages/
│       ├── Home.tsx                ← Startseite
│       ├── BlogList.tsx            ← Artikelliste
│       ├── Article.tsx             ← Artikelreader
│       ├── Portfolio.tsx           ← Portfolioseite
│       └── NotFound.tsx            ← 404-Seite
└── vite.config.ts                  ← Vite-Konfiguration
```

Die zentrale Idee ist simpel: **Der Inhalt ist vom Code getrennt**. Die Seiten sind in Markdown im `public/`-Ordner geschrieben, und der React-Code in `src/` kümmert sich darum, sie anzuzeigen. Mir liegt an dieser Trennung: Sie macht den Inhalt leicht nachlesbar und den Code leicht weiterentwickelbar.

## Das Routing-System

Die Datei `App.tsx` definiert alle Routen der App mit React Router:

![](assets/20260308_153440_image.png)


| Route         | Page      | Description                                |
| --------------- | ----------- | -------------------------------------------- |
| `/`           | Home      | Startseite, lädt `home.md`            |
| `/blog`       | BlogList  | Liste aller Artikel                  |
| `/blog/:slug` | Article   | Ein Artikel, lädt `articles/{slug}.md`     |
| `/portfolio`  | Portfolio | Portfolioseite, lädt `portfolio.md`       |
| `*`           | NotFound  | 404-Seite für unbekannte URLs            |

Jede Seite hat eine klar definierte Rolle: Sie holt eine Markdown-Datei, verwandelt sie mit `react-markdown` in HTML und zeigt sie auf dem Bildschirm an.

## Wie funktioniert ein Artikel?

Das ist der Teil, den ich am liebsten mag! Hier der Lebenszyklus eines Artikels:

### 1. Die Datei `index.json`

Alle Artikel sind in `public/articles/index.json` referenziert. Jeder Eintrag enthält die Metadaten des Artikels:

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

- **slug**: die eindeutige Kennung, genutzt in der URL (`/blog/hello-world`)
- **title**: der in der Liste angezeigte Titel
- **description**: eine kurze Zusammenfassung
- **date**: das Veröffentlichungsdatum

### 2. Die Markdown-Datei

Der Inhalt des Artikels ist eine simple `.md`-Datei in `public/articles/`. Der Dateiname entspricht dem in `index.json` definierten `slug`.

![](assets/20260308_153509_image.png)

Du kannst hineintun, was du willst: Titel, Listen, Bilder, Tabellen und sogar rohes HTML dank `rehype-raw`!

### 3. Das Rendering auf React-Seite

Wenn du `/blog/hello-world` besuchst, passiert Folgendes:

1. React Router holt den `slug`-Parameter aus der URL
2. Die Komponente `Article.tsx` lädt `/articles/hello-world.md`
3. Das Markdown wird von `react-markdown` in HTML verwandelt
4. Die Links nach `assets/` werden automatisch nach `/articles/assets/` umgeschrieben
5. Parallel werden die Metadaten aus `index.json` geladen, um Datum und Beschreibung anzuzeigen

So einfach ist das!

## Die Startseite und das Portfolio

Die Start- und Portfolioseiten funktionieren exakt genauso: Sie laden eine Markdown-Datei (`home.md` oder `portfolio.md`) und rendern sie in HTML.

Die Besonderheit ist, dass sie ein angepasstes Sanitization-Schema nutzen, das die Attribute `class` und `style` auf allen HTML-Elementen erlaubt. Das erlaubt mir, gestyltes HTML direkt ins Markdown zu schreiben, wie zum Beispiel Bildergalerien.

## Header und Footer

Der Header ist oben auf der Seite mit `position: fixed` angepinnt. Er enthält:

- Meinen GitHub-Avatar (direkt von `github.com/fox3000foxy.png` geladen)
- Den Blogtitel
- Die Navigationslinks: Start, Blog, Portfolio

Der Footer ist minimalistisch: Nur ein Copyright mit dem dynamisch berechneten aktuellen Jahr.

## Das dunkle Theme

Die Seite bleibt permanent im Dark Mode. Ich habe diese Wahl bewusst getroffen, um abends komfortabel lesen zu können: `color-scheme: dark` ist in den globalen Styles definiert, mit schwarzem Hintergrund `#000` und weißem Text `#fff`. Die Links sind blau (`#64b5f6`) und werden beim Hover grün (`#81c784`).

## Wie ich einen Artikel schreibe

Zur Praxis! Hier mein Workflow, um einen neuen Artikel zu schreiben:

### Schritt 1: Die Markdown-Datei erstellen

Ich öffne VS Code und erstelle eine neue `.md`-Datei in `public/articles/`:

### Schritt 2: Den Inhalt schreiben

Ich schreibe den Artikelinhalt direkt in Markdown. VS Code hat eine exzellente eingebaute Markdown-Vorschau:

![](assets/20260308_153613_image.png)

Für Bilder lege ich sie in `public/articles/assets/` und referenziere sie mit der Standard-Markdown-Syntax:

```markdown
![description](assets/my-image.png)
```

Die Komponente `Article.tsx` schreibt den Pfad `assets/` automatisch nach `/articles/assets/` um, damit die Bilder korrekt angezeigt werden.

### Schritt 3: Den Artikel in index.json registrieren

Sobald der Artikel fertig ist, füge ich ihn in `public/articles/index.json` hinzu, damit er in der Blogliste erscheint:

![](assets/20260308_153629_image.png)

### Schritt 4: Lokal testen

Ich starte den Vite-Dev-Server:

```bash
pnpm dev
```

Vite startet in wenigen Millisekunden und ich kann meinen Artikel live auf `localhost:5173` sehen. Diese Geschwindigkeit erlaubt mir, jede Änderung fast augenblicklich zu prüfen:

![](assets/20260308_153703_image.png)

### Schritt 5: Veröffentlichen

Ein simples `git push` reicht! Die CI/CD-Pipeline kümmert sich automatisch um den Rest.

## Die CI/CD-Deployment-Pipeline

Ich habe eine komplette **GitHub-Actions**-Pipeline aufgesetzt, die Lint, Build und Deployment der Seite bei jedem Push auf `main` automatisiert. Schauen wir uns das im Detail an.

Der Workflow liegt in `.github/workflows/deploy.yml` und ist in zwei Jobs geteilt: **build** und **deploy**.

### Trigger

```yaml
on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
```

Die Pipeline läuft bei jedem **Push** auf `main` und bei jedem **Pull Request** auf `main`. PRs werden also vor dem Merge geprüft (Lint + Build), aber nur Pushes auf `main` lösen ein Deployment aus.

### Job 1: Build

Der Build-Job läuft auf `ubuntu-latest` und folgt diesen Schritten:

1. **Checkout**: Klont das Repo mit der gesamten Historie (`fetch-depth: 0`)
2. **Setup pnpm**: Installiert die neueste pnpm-Version mit `pnpm/action-setup@v4`
3. **Setup Node.js 20**: Konfiguriert Node mit aktiviertem pnpm-Cache für schnellere Installationen
4. **Install dependencies**: Führt `pnpm install --frozen-lockfile` aus, um reproduzierbare Builds zu garantieren (keine Lockfile-Änderung erlaubt)
5. **Lint**: Führt `pnpm run lint` (ESLint) aus, um die Codequalität vor dem Build zu prüfen
6. **Build**: Führt `pnpm run build` aus, das zuerst die TypeScript-Typen prüft (`tsc -b`) und dann alles mit Vite bundelt
7. **Upload artifact**: Lädt den `dist/`-Ordner als Build-Artefakt für den Deployment-Job hoch

Wenn ein Schritt fehlschlägt (Lint-, Typ- oder Buildfehler), stoppt die ganze Pipeline und nichts wird deployed. Diese Wache schützt mich vor kaputtem Code in Produktion und ich verlasse mich bei jedem Push darauf.

### Job 2: Deploy

Der Deployment-Job läuft nur, wenn:

- Der Build-Job erfolgreich war (`needs: build`)
- Das Event ein **Push** ist (kein PR)
- Der Branch **main** ist

```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

Er geht dann so vor:

1. **Lädt das Build-Artefakt herunter**: Holt den vom Build-Job produzierten `dist/`-Ordner
2. **Konfiguriert GitHub Pages**: Richtet die Pages-Umgebung ein
3. **Lädt zu Pages hoch**: Bereitet den `dist/`-Ordner für GitHub Pages vor
4. **Deployed**: Veröffentlicht die Seite mit `actions/deploy-pages@v4`

### Die komplette Tabelle

Hier passiert vom Schreiben bis zum Deployment:

```
Artikel in VS Code schreiben
          ↓
    git add & commit
          ↓
       git push
          ↓
   GitHub Actions löst aus
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
     Online auf GitHub Pages !
```

Der ganze Prozess dauert etwa eine Minute zwischen Push und Onlinestellung. Ich veröffentliche mit einem simplen `git push`, alles bleibt automatisch ohne FTP oder SSH.

## Der Produktionsbuild

Unter der Haube führt der Befehl `pnpm build` aus:

1. `tsc -b`: Prüft die TypeScript-Typen
2. `vite build`: Bundelt und optimiert den ganzen Code

Vite produziert minifizierte und optimierte Dateien mit automatischem Code-Splitting. Das Ergebnis ist eine ultra-schnelle statische Seite.

## Warum diese Architektur?

Ich hätte ein CMS, einen statischen Seitengenerator wie Hugo oder Jekyll oder sogar Next.js nutzen können. Aber hier, warum ich diesen Ansatz gewählt habe:

- **Simplizität**: In Markdown schreiben, auf GitHub pushen, es ist online
- **Totale Kontrolle**: Keine Abhängigkeit von CMS oder Datenbank
- **Performance**: Vite + React = schnelles Laden
- **Flexibilität**: Ich kann Markdown und HTML mischen, wie ich will
- **Lernen**: Es ist ein super Projekt, um React und TypeScript zu beherrschen
- **CI/CD**: Qualitätsprüfungen und automatisiertes Deployment mit GitHub Actions

## Fazit

Dieser Blog ist ein simples, aber gut durchdachtes Projekt: Markdown für den Inhalt, React fürs Rendering, Vite für die Performance, GitHub Actions für CI/CD und GitHub Pages fürs Hosting. Er beruht nur auf effizient servierten statischen Dateien, mit einer automatisierten Pipeline, die bei jedem Push die Qualität garantiert.


Danke fürs Lesen, und bis bald im nächsten Artikel! 🦊
