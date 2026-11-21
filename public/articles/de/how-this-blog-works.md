---
title: Wie funktioniert dieser Blog?
description: "Hinter den Kulissen des Blogs: React, Schnell, Markdown, die CI/CD-Pipeline und der Redaktionsstrom."
date: 2026-03-08
aiGenerated: true
tags:
  - react
  - meta
  - blog
authors:
  - fox3000foxy
lang: "de"
---
# 

Hast du dich schon mal gefragt, wie dieser Blog unter der Haube funktioniert? In diesem Artikel werde ich dir die gesamte Architektur der Anwendung, vom technischen Stack bis zum Redaktionsprozess eines Artikels, zeigen. Und ja, ich werde dir sogar zeigen, wie ich meine Artikel aus dem VS Code schreibe!

## Die Stack Technique

Dieser Blog ist mit modernen Web-Technologien gebaut:

- **React 19**: für die Benutzeroberfläche
- **TypeScript**: für einen typisierten und zuverlässigeren Code
- **Beeilung**: als ultraschnelles Build-Werkzeug
- **React Router v7**: für die Navigation zwischen den Seiten
- **react-markdown**: um Markdown in HTML umzuwandeln
- **rehype-raw + rehype sanitize**: um HTML-Rohstoff in Markdown sicher zu erlauben

## Projektstruktur

So sieht der Projektbaum aus:

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
Die zentrale Idee ist einfach: **Der Inhalt ist vom Code** getrennt. Die Seiten sind in Markdown im Ordner geschrieben`public/`und der React-Code in`src/`Ich möchte diese Trennung: es macht den Inhalt leicht zu lesen und den Code leicht zu entwickeln.

## Das Routing-System

Datei`App.tsx`definiert alle Routen der Anwendung mit React Router:

![](assets/20260308_153440_image.png)

| Straße         | Seite      | Beschreibung                                |
| --------------- | ----------- | -------------------------------------------- |
| `/`           | Home      | Startseite, laden`home.md`            |
| `/blog`       | BlogList  | Liste aller Artikel                  |
| `/blog/:slug` | Artikel   | Ein Artikel, geladen`articles/{slug}.md`     |
| `/portfolio`  | Portfolio | Portfolioseite, charge`portfolio.md`       |
| `*`           | NotFound  | Seite 404 für unbekannte URLs            |

Jede Seite hat eine genau definierte Rolle: sie holt eine Markdown-Datei, verwandelt sie in HTML mit`react-markdown`und das Plakat auf dem Bildschirm.

## Wie funktioniert ein Artikel?

Das ist der Teil, den ich am liebsten! Hier ist der Lebenszyklus eines Artikels:

### 1. Datei`index.json`

Alle Artikel werden in`public/articles/index.json`Jeder Eintrag enthält die Metadaten des Artikels:
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
- **slug**: die eindeutige Kennung, die in der URL (`/blog/hello-world`)
- **title**: der Titel in der Liste
- **Beschreibung**: eine kurze Zusammenfassung
- **Datum**: Datum der Veröffentlichung

### 2. Markdown-Datei

Der Inhalt des Artikels ist eine einfache Datei`.md`in`public/articles/`Der Dateiname entspricht dem`slug`definiert in`index.json` .

![](assets/20260308_153509_image.png)

Du kannst alles aufsetzen, was du willst: Titel, Listen, Bilder, Tabellen, und sogar rohes HTML durch`rehype-raw`!

### 3. Die Rendering Seite React

Wenn du Besuch hast`/blog/hello-world`, Hier ist was passiert:

1. React Router erhält den Parameter`slug`von der URL
2. Die Komponente`Article.tsx`Last`/articles/hello-world.md`
3. Markdown wird in HTML von`react-markdown`
4. Links zu`assets/`werden automatisch in`/articles/assets/`
5. Gleichzeitig werden Metadaten von`index.json`zum Anzeigen von Datum und Beschreibung

So einfach ist das!

## Homepage und Portfolio

Home- und Portfolio-Seiten funktionieren genau auf die gleiche Weise: sie laden eine Markdown-Datei (`home.md`oder`portfolio.md`) und machen es in HTML.

Die Besonderheit ist, dass sie ein benutzerdefiniertes Sanizizationsschema verwenden, das Attribute erlaubt`class`und`style`HTML-Elemente. Dadurch kann ich stilisiertes HTml direkt in den Markdown schreiben, wie z.B. Bildergalerien.

## Der Header und der Footer

Der Header wird oben auf der Seite mit`position: fixed`. Es enthält:

- Mein Avatar GitHub (unmittelbar geladen von`github.com/fox3000foxy.png`)
- Der Titel des Blogs
- Die Navigationslinks: Startseite, Blog, Portfolio

Der Footer ist minimalistisch: nur ein Copyright mit dem laufenden Jahr dynamisch berechnet.

## Das dunkle Thema

Die Website bleibt ständig dunkel. Ich habe diese Wahl bewusst, um eine komfortable Lesung am Abend zu halten:`color-scheme: dark`ist in globalen Stile definiert, mit einem schwarzen Hintergrund`#000`und des weißen Textes`#fff`. Die Links sind blau (`#64b5f6`) und werden bei der Überflug (`#81c784`).

## Wie ich einen Artikel schreibe

Lässt du uns zur Praxis übergehen! Hier ist mein Workflow, um einen neuen Artikel zu schreiben:

### Schritt 1: Markdown-Datei erstellen

Ich öffne VS Code und kreiere eine neue Datei`.md`in`public/articles/`:

### Schritt 2: Schreibst du Inhalt

Ich schreibe den Artikelinhalt direkt in Markdown. VS Code hat eine ausgezeichnete Vorschau in Markown integriert:

![](assets/20260308_153613_image.png)

Für Bilder lege ich sie in`public/articles/assets/`und ich referenziere sie mit der Standard-Markdown-Syntax:
```markdown
![description](assets/my-image.png)
```
Die Komponente`Article.tsx`Der Pfad wird automatisch neu geschrieben`assets/`zu`/articles/assets/`so dass die Bilder korrekt angezeigt werden.

### Schritt 3: Artikel in index.json speichern

Nachdem der Artikel fertig ist, füge ich ihn hinzu`public/articles/index.json`um es in der Liste des Blogs zu erscheinen:

![](assets/20260308_153629_image.png)

### Schritt 4: Lokal testen

Ich starte den schnellsten Entwicklungsserver:
```bash
pnpm dev
```
Schnell startet in wenigen Millisekunden und ich kann meinen Artikel in Echtzeit sehen`localhost:5173`Diese Geschwindigkeit ermöglicht es mir, jede Änderung fast sofort zu überprüfen:

![](assets/20260308_153703_image.png)

### Schritt 5: Veröffentlichen

Ein einfacher`git push`Die CI/CD-Pipeline kümmert sich automatisch um den Rest.

## Die I/CD-Versorgungspipeline

Ich habe eine komplette **GitHub Action ** Pipeline eingerichtet, die den Lint, den Build und den Einsatz der Website bei jedem Push automatisiert.`main`Sehen wir uns das mal im Detail an.

Der Workflow ist in`.github/workflows/deploy.yml`und ist in zwei Jobs unterteilt: **build** und **deploy**.

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
Die Pipeline wird mit jedem **push** auf`main`und für jedes **Pull Request**`main`. Die PRs werden also (Lint + Build) überprüft, bevor sie gescannt werden, aber nur die Pushes auf`main`Wir starten den Einsatz.

### Job 1: Bauen

Der Job des Builds dreht sich um`ubuntu-latest`und folgt diesen Schritten:

1. **Checkout**: Klone das Projektarchiv mit der gesamten Geschichte (`fetch-depth: 0`)
2. **Setup pnpm**: Installiert die neueste Version von pnmpm mit`pnpm/action-setup@v4`
3. **Setup Node.js 20**: Konfigurieren du Node mit aktiviertem pnpm-Cache für schnellere Installationen
4. **Install dependencies**: Executiert`pnpm install –frozen-lockfile`zur Gewährleistung reproduzierbarer Builds (keine Änderung des zulässigen Lockfiles)
5. **Lint**: Ausgeführt`pnpm run lint`(ESLint) zur Überprüfung der Codequalität vor dem Build
6. **Build**: Ausführen`pnpm run build`, die zuerst TypeScript (`tsc -b`) und verband alles mit Schnell
7. **Upload articfact**: Datei hochladen`dist/`als Artefakt für den Einsatzjob

Wenn ein Schritt fehlschlägt (Lint-, Typ- oder Buildfehler), stoppt die gesamte Pipeline und nichts wird eingesetzt. Diese Wache schützt mich vor dem gebrochenen Code in der Produktion und ich vertraue auf jeden Push.

### Job 2: Deploy

Der Einsatzjob wird nur ausgeführt, wenn:

- Der Baujob hat bestanden (`needs: build`)
- Das Ereignis ist ein **push** (kein PR)
- Der Zweig ist **main**
```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```
Danach wird Folgendes vorgenommen:

1. **Downloaden du das Artefakt von build**: Ordner zurück`dist/`produziert durch den build Job
2. **GitHub-Konfiguration Seiten**: Umgebung einrichten Seiten
3. **Telever nach Seiten**: Ordner vorbereiten`dist/`für GitHub Pages
4. **Einsatz**: Veröffentlichet die Website mit`actions/deploy-pages@v4`

### Die vollständige Tabelle

Das passiert vom Schreiben bis zum Einsatz:
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
Der gesamte Prozess dauert etwa eine Minute zwischen Push und Online-Einsatz. Ich posten mit einem einfachen`git push`, die alle automatisch bleiben, ohne durch FTP oder SSH zu gehen.

## Der Build der Produktion

Unter der Haube, die Steuerung`pnpm build`führt aus:

1. `tsc -b`: Überprüfen du TypeScript
2. `vite build`: Bundle und optimiert den gesamten Code

Schnell produziert Mini- und optimierte Dateien mit automatischer Splitting-Code. Das Ergebnis ist eine statische, ultraschnelle Website.

## Warum diese Architektur?

Ich hätte einen CMS, einen statischen Site Generator wie Hugo oder Jekyll oder sogar Next.js verwenden können. Aber deshalb habe ich diesen Ansatz gewählt:

- **Vereinfachung**: Schreibe in Markdown, Push auf GitHub, es ist online
- **Volle Kontrolle**: Keine Abhängigkeit von CMS oder Datenbank
- **Performance**: Schnell + React = Schnellladen
- **Flexibilität**: Ich kann Markdown und HTML mischen, wie ich will
- **Lernen**: Es ist ein Superprojekt, um React und TypeScript zu meistern
- **CI/CD**: Qualitätsüberprüfungen und automatisierte Implementierung mit GitHub Aktionen

## Schlussfolgerung

Dieser Blog ist ein einfaches, aber gut durchdachtes Projekt: Markdown für Inhalte, React für Rendering, Schnell für Leistung, GitHub Aktionen für CI/CD und GitHub Pages für Hosting. Er basiert nur auf statischen Dateien, die effizient serviert werden, mit einer automatisierten Pipeline, die Qualität für jeden Push garantiert.

Danke für das Lesen und bald im nächsten Artikel! ✓
