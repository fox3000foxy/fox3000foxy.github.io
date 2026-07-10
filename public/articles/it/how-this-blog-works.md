---
title: Come Funziona Questo Blog?
description: "Un'analisi approfondita degli interni di questo blog: React, Vite,
  Markdown, la pipeline CI/CD e il flusso di scrittura degli articoli."
date: 2026-03-08
aiGenerated: true
tags:
  - react
  - meta
  - blog
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA=="
author_sig: "MEYCIQCIew8lTtfpto94+iW18p3j6bJ0NYdheI0kEfGsdRxXYwIhAIALoJ3B1ChH9ye3XblU7H+ARnjZIZM8wrfh9QQBUSdM"
---

# Come Funziona Questo Blog?

Ti sei mai chiesto come funziona questo blog sotto il cofano? In questo articolo, ti guiderò attraverso l'intera architettura dell'applicazione, dal tech stack fino al processo di scrittura di un articolo. E sì, ti mostrerò anche come scrivo i miei articoli da VS Code!

## Il Tech Stack

Questo blog è costruito con tecnologie web moderne:

- **React 19** -- per l'interfaccia utente
- **TypeScript** -- per codice tipizzato e più affidabile
- **Vite** -- come strumento di build ultra-veloce
- **React Router v7** -- per la navigazione tra le pagine
- **react-markdown** -- per trasformare Markdown in HTML
- **rehype-raw + rehype-sanitize** -- per permettere HTML grezzo in Markdown rimanendo sicuri

Tutto è ospitato su **GitHub Pages** direttamente dal repository `fox3000foxy.github.io`.

## Struttura del Progetto

Ecco com'è l'albero del progetto:

![](assets/how-this-blog-works/project-structure.png)

```
├── .github/
│   └── workflows/
│       └── deploy.yml        ← Pipeline CI/CD
├── public/
│   ├── home.md               ← Contenuto della homepage
│   ├── portfolio.md          ← Contenuto del portfolio
│   └── articles/
│       ├── index.json        ← Elenco di tutti gli articoli
│       ├── hello-world.md    ← Un articolo
│       ├── how-this-blog-works.md  ← Questo articolo!
│       └── assets/           ← Immagini degli articoli
├── src/
│   ├── main.tsx              ← Punto di ingresso React
│   ├── App.tsx               ← Router principale
│   ├── components/
│   │   ├── Header.tsx        ← Barra di navigazione
│   │   └── Footer.tsx        ← Footer
│   └── pages/
│       ├── Home.tsx          ← Homepage
│       ├── BlogList.tsx      ← Elenco articoli
│       ├── Article.tsx       ← Lettore articoli
│       ├── Portfolio.tsx     ← Pagina portfolio
│       └── NotFound.tsx      ← Pagina 404
└── vite.config.ts            ← Configurazione Vite
```

L'idea centrale è semplice: **il contenuto è separato dal codice**. Le pagine sono scritte in Markdown nella cartella `public/`, e il codice React in `src/` si occupa di renderizzarle.

## Il Sistema di Routing

Il file `App.tsx` definisce tutte le rotte dell'applicazione usando React Router:

![](assets/20260308_153440_image.png)


| Route         | Pagina    | Descrizione                                        |
| --------------- | ----------- | ---------------------------------------------------- |
| `/`           | Home      | Homepage, carica `home.md`                         |
| `/blog`       | BlogList  | Elenco di tutti gli articoli                       |
| `/blog/:slug` | Article   | Un singolo articolo, carica `articles/{slug}.md`   |
| `/portfolio`  | Portfolio | Pagina portfolio, carica `portfolio.md`            |
| `*`           | NotFound  | Pagina 404 per URL sconosciuti                     |

Ogni pagina ha un ruolo ben definito: recupera un file Markdown, lo trasforma in HTML con `react-markdown`, e lo mostra a schermo.

## Come Funziona un Articolo?

Questa è la parte più interessante! Ecco il ciclo di vita di un articolo:

### 1. Il File `index.json`

Tutti gli articoli sono referenziati in `public/articles/index.json`. Ogni voce contiene i metadati dell'articolo:

```json
[
  {
    "slug": "hello-world",
    "title": "Hello World",
    "description": "Un post di esempio per il blog di Fox.",
    "date": "2026-03-08"
  }
]
```

- **slug** -- l'identificatore univoco, usato nell'URL (`/blog/hello-world`)
- **title** -- il titolo mostrato nell'elenco
- **description** -- un breve riassunto
- **date** -- la data di pubblicazione

### 2. Il File Markdown

Il contenuto dell'articolo è un semplice file `.md` in `public/articles/`. Il nome del file corrisponde allo `slug` definito in `index.json`.

![](assets/20260308_153509_image.png)

Puoi metterci qualsiasi cosa: intestazioni, elenchi, immagini, tabelle e persino HTML grezzo grazie a `rehype-raw`!

### 3. Rendering lato React

Quando visiti `/blog/hello-world`, ecco cosa succede:

1. React Router cattura il parametro `slug` dall'URL
2. Il componente `Article.tsx` recupera `/articles/hello-world.md`
3. Il Markdown viene trasformato in HTML da `react-markdown`
4. I link a `assets/` vengono automaticamente riscritti a `/articles/assets/`
5. In parallelo, i metadati vengono caricati da `index.json` per mostrare data e descrizione

Semplice, no?

## La Homepage e il Portfolio

Le pagine Home e Portfolio funzionano esattamente allo stesso modo: caricano un file Markdown (`home.md` o `portfolio.md`) e lo renderizzano come HTML.

La particolarità è che usano uno schema di sanitizzazione personalizzato che permette gli attributi `class` e `style` su tutti gli elementi HTML. Questo mi permette di scrivere HTML stilizzato direttamente in Markdown, come le gallerie di immagini per esempio.

## L'Header e il Footer

L'Header è fissato in cima alla pagina con `position: fixed`. Contiene:

- Il mio avatar GitHub (caricato direttamente da `github.com/fox3000foxy.png`)
- Il titolo del blog
- Link di navigazione: Home, Blog, Portfolio

Il Footer è minimalista: solo un copyright con l'anno corrente calcolato dinamicamente.

## Il Tema Scuro

Il sito è **sempre in modalità scura** -- niente interruttore chiaro/scuro. È una scelta deliberata: `color-scheme: dark` è impostato negli stili globali, con sfondo nero `#000` e testo bianco `#fff`. I link sono blu (`#64b5f6`) e diventano verdi al passaggio del mouse (`#81c784`).

## Come Scrivo un Articolo

Ora la parte pratica! Ecco il mio flusso di lavoro per scrivere un nuovo articolo:

### Passo 1: Creare il File Markdown

Apro VS Code e creo un nuovo file `.md` in `public/articles/`:

### Passo 2: Scrivere il Contenuto

Scrivo il contenuto dell'articolo direttamente in Markdown. VS Code offre un'ottima anteprima Markdown integrata:

![](assets/20260308_153613_image.png)

Per le immagini, le metto in `public/articles/assets/` e le referenzio usando la sintassi Markdown standard:

```markdown
![descrizione](assets/my-image.png)
```

Il componente `Article.tsx` riscrive automaticamente il percorso `assets/` in `/articles/assets/` in modo che le immagini vengano visualizzate correttamente.

### Passo 3: Registrare l'Articolo in index.json

Una volta che l'articolo è finito, lo aggiungo a `public/articles/index.json` così appare nell'elenco del blog:

![](assets/20260308_153629_image.png)

### Passo 4: Testare Localmente

Avvio il server di sviluppo Vite:

```bash
pnpm dev
```

Vite si avvia in millisecondi e posso vedere il mio articolo in tempo reale su `localhost:5173`:

![](assets/20260308_153703_image.png)

### Passo 5: Pubblicare

Un semplice `git push` è tutto ciò che serve! La pipeline CI/CD si occupa automaticamente del resto.

## La Pipeline di Deploy CI/CD

Ho configurato una pipeline completa **GitHub Actions** che automatizza linting, build e deploy del sito ogni volta che faccio push su `main`. Analizziamola.

Il workflow vive in `.github/workflows/deploy.yml` ed è suddiviso in due job: **build** e **deploy**.

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

La pipeline viene eseguita a ogni **push** su `main` e a ogni **pull request** che ha come target `main`. Questo significa che le PR vengono controllate (lint + build) prima del merge, ma solo i push su `main` attivano effettivamente un deploy.

### Job 1: Build

Il job di build viene eseguito su `ubuntu-latest` e passa attraverso questi step:

1. **Checkout** -- Clona il repository con tutta la storia (`fetch-depth: 0`)
2. **Setup pnpm** -- Installa l'ultima versione di pnpm usando `pnpm/action-setup@v4`
3. **Setup Node.js 20** -- Configura Node con la cache di pnpm per installazioni più veloci
4. **Installa dipendenze** -- Esegue `pnpm install --frozen-lockfile` per garantire build riproducibili (niente modifiche al lockfile)
5. **Lint** -- Esegue `pnpm run lint` (ESLint) per individuare problemi di qualità del codice prima del build
6. **Build** -- Esegue `pnpm run build`, che prima controlla i tipi TypeScript (`tsc -b`) poi impacchetta tutto con Vite
7. **Carica artefatto** -- Carica la cartella `dist/` come artefatto di build per il job di deploy

Se uno qualsiasi degli step fallisce -- un errore di lint, un errore di tipo, un errore di build -- l'intera pipeline si ferma e nulla viene pubblicato. Questo protegge il sito live da codice rotto.

### Job 2: Deploy

Il job di deploy viene eseguito solo se:

- Il job di build è riuscito (`needs: build`)
- L'evento è un **push** (non una PR)
- Il branch è **main**

```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

Poi:

1. **Scarica l'artefatto di build** -- Prende la cartella `dist/` prodotta dal job di build
2. **Configura GitHub Pages** -- Prepara l'ambiente Pages
3. **Carica su Pages** -- Impacchetta la cartella `dist/` per GitHub Pages
4. **Pubblica** -- Pubblica il sito usando `actions/deploy-pages@v4`

### Il Quadro Completo

Ecco cosa succede dalla scrittura al deploy:

```
Scrivi articolo in VS Code
        ↓
   git add & commit
        ↓
      git push
        ↓
  GitHub Actions si attiva
        ↓
  ┌─────────────────┐
  │   BUILD JOB     │
  │  1. Checkout    │
  │  2. Setup pnpm  │
  │  3. Setup Node  │
  │  4. Installa    │
  │  5. Lint ✓      │
  │  6. Build ✓     │
  │  7. Carica dist │
  └────────┬────────┘
           ↓
  ┌─────────────────┐
  │  DEPLOY JOB     │
  │  1. Scarica     │
  │  2. Configura   │
  │  3. Carica      │
  │  4. Pubblica 🚀  │
  └─────────────────┘
           ↓
    Live su GitHub Pages!
```

L'intero processo richiede circa un minuto dal push alla pubblicazione. Nessun deploy manuale, niente FTP, niente SSH -- solo `git push` ed è fatta.

## Il Build di Produzione

Sotto il cofano, il comando `pnpm build` esegue:

1. `tsc -b` -- Controlla i tipi TypeScript
2. `vite build` -- Impacchetta e ottimizza tutto il codice

Vite produce file minificati e ottimizzati con code-splitting automatico. Il risultato è un sito statico velocissimo.

## Perché Questa Architettura?

Avrei potuto usare un CMS, un generatore di siti statici come Hugo o Jekyll, o persino Next.js. Ma ecco perché ho scelto questo approccio:

- **Semplicità** -- Scrivi in Markdown, fai push su GitHub, è live
- **Controllo totale** -- Nessuna dipendenza da un CMS o database
- **Performance** -- Vite + React = caricamento veloce
- **Flessibilità** -- Posso mischiare Markdown e HTML come voglio
- **Apprendimento** -- È un bel progetto per padroneggiare React e TypeScript
- **CI/CD** -- Controlli di qualità automatici e deploy con GitHub Actions

## Conclusione

Questo blog è un progetto semplice ma ben pensato: Markdown per i contenuti, React per il rendering, Vite per le performance, GitHub Actions per la CI/CD, e GitHub Pages per l'hosting. Niente database, niente server backend, solo file statici serviti in modo efficiente con una pipeline automatizzata che garantisce la qualità a ogni push.

Se vuoi creare il tuo blog con un'architettura simile, dai un'occhiata al [codice sorgente su GitHub](https://github.com/fox3000foxy/fox3000foxy.github.io)!

Grazie per aver letto, e ci vediamo al prossimo articolo! 🦊
