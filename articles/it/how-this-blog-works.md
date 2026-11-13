---
title: "Come funziona questo blog?"
description: "Il dietro le quinte del blog: React, Vite, Markdown, la pipeline CI/CD e il flusso di redazione."
date: 2026-03-08
aiGenerated: true
tags:
  - react
  - meta
  - blog
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "/nWJSq67yWpWkhVUNCbZRItFWg/qBNM91RxsPlVgb7y+/HJedVrdRo+7IYzldTRs15fzyMXZrxPKgRgipi0yKQ=="
---

# Come funziona questo blog?

Ti sei mai chiesto come funziona questo blog sotto il cofano? In questo articolo, ti dettaglio tutta l'architettura dell'applicazione, dallo stack tecnico fino al processo di redazione di un articolo. E sì, ti mostro pure come scrivo i miei articoli da VS Code!

## Lo stack tecnico

Questo blog è costruito con tecnologie web moderne:

- **React 19**: per l'interfaccia utente
- **TypeScript**: per codice tipizzato e più affidabile
- **Vite**: come strumento di build ultra-rapido
- **React Router v7**: per la navigazione tra le pagine
- **react-markdown**: per trasformare il Markdown in HTML
- **rehype-raw + rehype-sanitize**: per autorizzare HTML grezzo nel Markdown in tutta sicurezza


## Struttura del progetto

Ecco com'è l'albero del progetto:

![](assets/how-this-blog-works/project-structure.png)

```
├── .github/
│   └── workflows/
│       └── deploy.yml              ← Pipeline CI/CD
├── public/
│   ├── home.md                     ← Contenuto della home page
│   ├── portfolio.md                ← Contenuto del portfolio
│   └── articles/
│       ├── index.json              ← Lista di tutti gli articoli
│       ├── hello-world.md          ← Un articolo
│       ├── how-this-blog-works.md  ← Questo articolo!
│       └── assets/                 ← Immagini degli articoli
├── src/
│   ├── main.tsx                    ← Punto di ingresso React
│   ├── App.tsx                     ← Router principale
│   ├── components/
│   │   ├── Header.tsx              ← Barra di navigazione
│   │   └── Footer.tsx              ← Piè di pagina
│   └── pages/
│       ├── Home.tsx                ← Home page
│       ├── BlogList.tsx            ← Lista degli articoli
│       ├── Article.tsx             ← Lettore di articolo
│       ├── Portfolio.tsx           ← Pagina portfolio
│       └── NotFound.tsx            ← Pagina 404
└── vite.config.ts                  ← Configurazione Vite
```

L'idea centrale è semplice: **il contenuto è separato dal codice**. Le pagine sono scritte in Markdown nella cartella `public/`, e il codice React in `src/` si occupa di mostrarle. Tengo a questa separazione: rende il contenuto facile da rileggere e il codice facile da far evolvere.

## Il sistema di routing

Il file `App.tsx` definisce tutte le route dell'applicazione con React Router:

![](assets/20260308_153440_image.png)


| Route         | Pagina    | Descrizione                                |
| --------------- | ----------- | -------------------------------------------- |
| `/`           | Home      | Home page, carica `home.md`            |
| `/blog`       | BlogList  | Lista di tutti gli articoli                  |
| `/blog/:slug` | Article   | Un articolo, carica `articles/{slug}.md`     |
| `/portfolio`  | Portfolio | Pagina portfolio, carica `portfolio.md`       |
| `*`           | NotFound  | Pagina 404 per gli URL sconosciuti            |

Ogni pagina ha un ruolo ben definito: recupera un file Markdown, lo trasforma in HTML con `react-markdown`, e lo mostra a schermo.

## Come funziona un articolo?

È la parte che preferisco! Ecco il ciclo di vita di un articolo:

### 1. Il file `index.json`

Tutti gli articoli sono referenziati in `public/articles/index.json`. Ogni voce contiene i metadati dell'articolo:

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

- **slug**: l'identificatore unico, usato nell'URL (`/blog/hello-world`)
- **title**: il titolo mostrato nella lista
- **description**: un corto riassunto
- **date**: la data di pubblicazione

### 2. Il file Markdown

Il contenuto dell'articolo è un semplice file `.md` in `public/articles/`. Il nome del file corrisponde allo `slug` definito in `index.json`.

![](assets/20260308_153509_image.png)

Puoi metterci ciò che vuoi: titoli, liste, immagini, tabelle, e persino HTML grezzo grazie a `rehype-raw`!

### 3. Il rendering lato React

Quando visiti `/blog/hello-world`, ecco cosa succede:

1. React Router recupera il parametro `slug` dall'URL
2. Il componente `Article.tsx` carica `/articles/hello-world.md`
3. Il Markdown è trasformato in HTML da `react-markdown`
4. I link verso `assets/` sono automaticamente riscritti verso `/articles/assets/`
5. In parallelo, i metadati sono caricati da `index.json` per mostrare data e descrizione

È semplice così!

## La home page e il portfolio

Le pagine Home e Portfolio funzionano esattamente allo stesso modo: caricano un file Markdown (`home.md` o `portfolio.md`) e lo rendono in HTML.

La particolarità, è che usano uno schema di sanitization personalizzato che autorizza gli attributi `class` e `style` su tutti gli elementi HTML. Mi permette di scrivere HTML stilizzato direttamente nel Markdown, come gallerie di immagini per esempio.

## L'header e il footer

L'header è fissato in cima alla pagina con `position: fixed`. Contiene:

- Il mio avatar GitHub (caricato direttamente da `github.com/fox3000foxy.png`)
- Il titolo del blog
- I link di navigazione: Home, Blog, Portfolio

Il footer è minimalista: solo un copyright con l'anno corrente calcolato dinamicamente.

## Il tema scuro

Il sito resta in modalità scura in permanenza. Ho fatto questa scelta deliberatamente per tenere una lettura confortevole la sera: `color-scheme: dark` è definito negli stili globali, con uno sfondo nero `#000` e testo bianco `#fff`. I link sono blu (`#64b5f6`) e diventano verdi al passaggio (`#81c784`).

## Come scrivo un articolo

Passiamo alla pratica! Ecco il mio workflow per scrivere un nuovo articolo:

### Passo 1: crea il file Markdown

Apro VS Code e creo un nuovo file `.md` in `public/articles/`:

### Passo 2: scrivi il contenuto

Scrivo il contenuto dell'articolo direttamente in Markdown. VS Code ha un'ottima anteprima Markdown integrata:

![](assets/20260308_153613_image.png)

Per le immagini, le metto in `public/articles/assets/` e le referenzio con la sintassi Markdown standard:

```markdown
![descrizione](assets/my-image.png)
```

Il componente `Article.tsx` riscrive automaticamente il percorso `assets/` verso `/articles/assets/` perché le immagini si mostrino correttamente.

### Passo 3: registra l'articolo in index.json

Una volta finito l'articolo, lo aggiungo in `public/articles/index.json` perché appaia nella lista del blog:

![](assets/20260308_153629_image.png)

### Passo 4: testa in locale

Lancio il server di sviluppo Vite:

```bash
pnpm dev
```

Vite parte in qualche millisecondo e posso vedere il mio articolo in tempo reale su `localhost:5173`. Questa rapidità mi permette di verificare ogni modifica quasi istantaneamente:

![](assets/20260308_153703_image.png)

### Passo 5: pubblica

Un semplice `git push` basta! La pipeline CI/CD si occupa del resto automaticamente.

## La pipeline di deploy CI/CD

Ho messo in piedi una pipeline **GitHub Actions** completa che automatizza lint, build e deploy del sito a ogni push su `main`. Vediamola in dettaglio.

Il workflow sta in `.github/workflows/deploy.yml` ed è diviso in due job: **build** e **deploy**.

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

La pipeline gira a ogni **push** su `main` e a ogni **pull request** verso `main`. Le PR sono quindi verificate (lint + build) prima di essere fuse, ma solo i push su `main` innescano un deploy.

### Job 1: Build

Il job di build gira su `ubuntu-latest` e segue questi passi:

1. **Checkout**: clona il deposito con tutto lo storico (`fetch-depth: 0`)
2. **Setup pnpm**: installa l'ultima versione di pnpm con `pnpm/action-setup@v4`
3. **Setup Node.js 20**: configura Node col cache pnpm attivato per installazioni più rapide
4. **Install dependencies**: esegue `pnpm install --frozen-lockfile` per garantire build riproducibili (nessuna modifica del lockfile autorizzata)
5. **Lint**: esegue `pnpm run lint` (ESLint) per verificare la qualità del codice prima della build
6. **Build**: esegue `pnpm run build`, che verifica prima i tipi TypeScript (`tsc -b`) poi fa bundle del tutto con Vite
7. **Upload artifact**: carica la cartella `dist/` come artefatto di build per il job di deploy

Se un passo fallisce (errore di lint, di tipo o di build), tutta la pipeline si ferma e niente è deployato. Questa guardia mi protegge dal codice rotto in produzione e mi ci affido a ogni push.

### Job 2: Deploy

Il job di deploy gira solo se:

- Il job di build è riuscito (`needs: build`)
- L'evento è un **push** (non una PR)
- Il branch è **main**

```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

Procede poi:

1. **Scarica l'artefatto di build**: recupera la cartella `dist/` prodotta dal job di build
2. **Configura GitHub Pages**: mette in piedi l'ambiente Pages
3. **Carica verso Pages**: prepara la cartella `dist/` per GitHub Pages
4. **Deploya**: pubblica il sito con `actions/deploy-pages@v4`

### Il quadro completo

Ecco cosa succede dalla scrittura al deploy:

```
Scrivi l'articolo in VS Code
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
   │  4. Install     │
   │  5. Lint ok      │
   │  6. Build ok     │
   │  7. Upload dist │
   └────────┬────────┘
            ↓
   ┌─────────────────┐
   │  DEPLOY JOB     │
   │  1. Download    │
   │  2. Configure   │
   │  3. Upload      │
   │  4. Deploy avvio   │
   └─────────────────┘
            ↓
     Online su GitHub Pages!
```

Il processo intero prende circa un minuto tra il push e la messa online. Pubblico con un semplice `git push`, il tutto resta automatico senza passare da FTP né SSH.

## La build di produzione

Sotto il cofano, il comando `pnpm build` esegue:

1. `tsc -b`: verifica i tipi TypeScript
2. `vite build`: fa bundle e ottimizza tutto il codice

Vite produce file minificati e ottimizzati con code-splitting automatico. Il risultato è un sito statico ultra-rapido.

## Perché questa architettura?

Avrei potuto usare un CMS, un generatore di sito statico come Hugo o Jekyll, o persino Next.js. Ma ecco perché ho scelto questo approccio:

- **Semplicità**: scrivi in Markdown, fai push su GitHub, è online
- **Controllo totale**: nessuna dipendenza da un CMS o un database
- **Performance**: Vite + React = caricamento rapido
- **Flessibilità**: posso mischiare Markdown e HTML come voglio
- **Apprendimento**: è un super progetto per padroneggiare React e TypeScript
- **CI/CD**: verifiche di qualità e deploy automatizzati con GitHub Actions

## Conclusione

Questo blog è un progetto semplice ma ben pensato: Markdown per il contenuto, React per il rendering, Vite per la performance, GitHub Actions per il CI/CD, e GitHub Pages per l'hosting. Poggia solo su file statici serviti efficacemente, con una pipeline automatizzata che garantisce la qualità a ogni push.


Grazie di aver letto, e a presto nel prossimo articolo!
