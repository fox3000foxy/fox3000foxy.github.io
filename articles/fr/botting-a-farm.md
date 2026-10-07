---
title: Botter une ferme Microsoft Rewards
description: Comment j'ai codé un bot pour farmer des points Microsoft Rewards à
  grande échelle -- et pourquoi Microsoft a depuis renforcé ses défenses.
date: 2026-03-13
tags:
  - automation
  - javascript
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "40KbE6Ps5igof4Podud2apA2UdRrlLku9+kyCVlqpar7caXffYhCfWvXn3PVy93ZmyLSglB19Y1gqhPK0Rgt8g=="
---

> **Note (2026) :** Ce projet n'est plus maintenu. Microsoft a considérablement renforcé sa détection anti-bot -- ce qui marchait à l'époque ne fonctionne plus aujourd'hui. Le code et l'approche décrits ci-dessous sont conservés à des fins d'archivage et de démonstration uniquement.

## Introduction

J'ai découvert Microsoft Rewards il y a quelques années. C'était pendant le confinement, mais ça ne change rien au fait que j'étais obligé d'utiliser le contrôle parental Microsoft Family Safety et donc de passer par Edge. C'est là que j'ai découvert Rewards.

À l'époque j'avais seulement 14 ans et rien dans le catalogue ne m'intéressait. Maintenant je me dis qu'avec les compétences que j'ai acquises, je peux farmer des points avec des bots, puis donner les codes ou même les revendre moins cher si j'en ai vraiment envie (mais honnêtement, je pense pas le faire). Bref, je vais te raconter comment j'ai codé un bot qui farm des comptes à l'échelle.

---

## C'est quoi Microsoft Rewards ?

Pour faire court : c'est un programme qui récompense les utilisateurs d'Edge avec des points pour des activités comme les recherches, des petits quiz, des jeux, et une extension (mais ça c'est une autre histoire).

Tu vois ici les trucs "Explore" :  
![Explore screenshot](assets/20260313_135010_image.png)

Là par exemple c'est ce qu'ils appellent le "set du jour".  
![Daily set screenshot](assets/20260313_135038_image.png)

Ils ont même fait un système de streak, c'est assez dingue.  
![Streak screenshot](assets/20260313_135210_image.png)

Y'a aussi un système de niveau et c'est juste complètement fun :  
![Level screenshot](assets/20260313_135340_image.png)

Donc t'as plein de façons de gagner des points, et la plupart sont quotidiennes.  
L'idée ici ça va être de faire un bot qui fait les activités à ta place, pour farmer des points à l'échelle et compléter ta routine de farming.

Comme tu peux le voir ci-dessous, la plupart des récompenses sont des cartes cadeaux, mais y'a aussi des trucs sympas comme des jeux ou des abonnements.  
![Rewards screenshot](assets/20260313_135646_image.png)

| Récompense | Catégorie | Coût en points |
| --- | --- | --- |
| **Rakuten TV – 1 film HD** | Contenu numérique | 1 785 |
| **Roblox (carte digitale)** | Jeu / contenu numérique | 6 750 |
| **Carte cadeau Microsoft** | Boutique / service | 5 660 |
| **Carte cadeau Xbox** | Boutique / service | 5 660 |
| **Carte cadeau Microsoft Solitaire Collection** | Jeu / contenu numérique | 1 500 |
| **Minecraft Minecoins** | Jeu / contenu numérique | 2 500 |
| **Carte cadeau League of Legends** | Jeu / contenu numérique | 2 000 |
| **Code Overwatch pièces (digital)** | Jeu / contenu numérique | 2 000 |
| **Sea of Thieves – Pack Pièces anciennes** | Jeu / contenu numérique | 1 700 |
| **Zalando – Carte cadeau** | Boutique / service | 7 205 |
| **Carrefour – Carte cadeau** | Boutique / service | 14 410 |
| **Cultura – Carte cadeau** | Boutique / service | 14 410 |
| **Fnac‑Darty – Carte cadeau** | Boutique / service | 14 410 |
| **La Redoute – Carte cadeau** | Boutique / service | 14 410 |
| **Mango – Carte cadeau** | Boutique / service | 36 025 |
| **Wonderbox – Carte cadeau** | Boutique / service | 14 410 |
| **Yves Rocher – Carte cadeau** | Boutique / service | 14 410 |
| **Amazon.fr – Chèque cadeau** | Boutique / service | 7 205 |
| **Foot Locker – Carte cadeau** | Boutique / service | 14 410 |
| **IKEA FR – Carte cadeau** | Boutique / service | 36 025 |
| **IKEA FR – Carte cadeau (autre design)** | Boutique / service | 7 200 |
| **Marionnaud – Carte cadeau** | Boutique / service | 14 410 |
| **Asos – Carte cadeau** | Boutique / service | 14 410 |
| **Adidas FR – Carte cadeau** | Boutique / service | 14 410 |
| **Deliveroo France – Carte cadeau** | Boutique / service | 21 615 |
| **H&M France – Carte cadeau** | Boutique / service | 14 410 |
| **Global Hotel Card (Expedia Group)** | Boutique / service | 7 205 |
| **Uber Eats France – Carte cadeau** | Boutique / service | 36 025 |

Maintenant que tu comprends l'intérêt du programme, intéressons-nous au botting.

---

## Premiers tests

Avant de construire mon bot, je voulais être sûr que mon IP ne serait pas marquée pour avoir utilisé des centaines de comptes depuis la même adresse. Tu me connais, je vais utiliser Tor avec un proxy rotatif. Et je ne veux pas héberger mon bot sur un VPS -- je veux qu'il tourne dans une GitHub Action.

Donc j'ai écrit un workflow simple :

```yaml
name: Tor Proxy Curl

on:
  workflow_dispatch:

jobs:
  tor-proxy-curl:
    runs-on: ubuntu-latest

    steps:
      - name: Install Tor and curl
        run: |
          sudo apt-get update
          sudo apt-get install -y tor curl

      - name: Start Tor service
        run: |
          sudo systemctl enable tor
          sudo systemctl start tor
          for i in {1..30}; do
            if ss -lnt | grep -q ':9050'; then
              echo "Tor SOCKS proxy is listening on 127.0.0.1:9050"
              exit 0
            fi
            sleep 1
          done
          echo "Tor SOCKS proxy did not start in time"
          sudo journalctl -u tor --no-pager | tail -n 50
          exit 1

      - name: Set proxy environment variables
        run: |
          echo "ALL_PROXY=socks5h://127.0.0.1:9050" >> "$GITHUB_ENV"
          echo "all_proxy=socks5h://127.0.0.1:9050" >> "$GITHUB_ENV"
          echo "HTTP_PROXY=socks5h://127.0.0.1:9050" >> "$GITHUB_ENV"
          echo "http_proxy=socks5h://127.0.0.1:9050" >> "$GITHUB_ENV"
          echo "HTTPS_PROXY=socks5h://127.0.0.1:9050" >> "$GITHUB_ENV"
          echo "https_proxy=socks5h://127.0.0.1:9050" >> "$GITHUB_ENV"
          echo "NO_PROXY=localhost,127.0.0.1" >> "$GITHUB_ENV"
          echo "no_proxy=localhost,127.0.0.1" >> "$GITHUB_ENV"

      - name: Execute curl via Tor proxy
        run: |
          echo "Using proxy: $ALL_PROXY"
          curl --fail --silent --show-error --proxy "$ALL_PROXY" https://check.torproject.org/api/ip
```

Ce workflow installe juste Tor, le démarre, et fait une requête curl à travers lui.

Le premier run a donné ce résultat :  
![Tor curl first run](assets/20260313_140705_image.png)

Les stats de temps étaient :  
!Timings

Un deuxième run a donné ce résultat :  
![Tor curl second run](assets/20260313_140928_image.png)

Comme tu peux le voir, les IP sont différentes, donc on se fera pas flag pour utilisation abusive depuis la même IP. Bonne nouvelle -- on peut continuer à développer le bot de farming.

---

## Premier test avec Selenium

Pour automatiser l'interface, je vais utiliser **Selenium** : un outil qui contrôle un vrai navigateur (Chrome/Edge/Firefox) à la place d'un utilisateur. Dans le contexte d'une GitHub Action, ça veut dire installer un navigateur + son driver, puis lancer un script qui se connecte à Microsoft Rewards et clique là où il faut.

### Exemple de script JavaScript (Node.js + selenium-webdriver)

```js
import { Builder, By, Capabilities, until, WebDriver } from 'selenium-webdriver';

const chromeOptions = {
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    // '--proxy-server=socks5://127.0.0.1:9050'
  ],
  excludeSwitches: ['enable-automation'],
  useAutomationExtension: false,
};

async function applyStealth(driver: WebDriver) {
  // Inject script before any page JS runs to reduce automation fingerprinting.
  await (driver as any).sendDevToolsCommand('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });

      // Some sites check for chrome runtime and plugins
      window.chrome = { runtime: {} };
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
    `,
  });
}

(async () => {
  const caps = Capabilities.chrome().set('goog:chromeOptions', chromeOptions);
  const driver = await new Builder().withCapabilities(caps).build();

  await applyStealth(driver);

  try {
    const targetUrl = 'https://rewards.bing.com/';
    await driver.get(targetUrl);

    console.log('After navigation: url=', await driver.getCurrentUrl());
    console.log('After navigation: title=', await driver.getTitle());

    const signInButton = await driver.wait(
      until.elementLocated(By.css('#rewards-header-sign-in')),
      20000,
      'Timed out waiting for sign-in button (may indicate 400/blocked page)'
    );

    console.log('Page loaded, sign in button found:', await signInButton.getText());
  } finally {
    await driver.quit();
  }
})();
```

Résultat du script :

```
DevTools listening on ws://127.0.0.1:50274/devtools/browser/37b9ea79-0e5d-4673-9e91-7ffeaf0d37f8
After navigation: url= https://rewards.bing.com/welcome?idru=%2F
After navigation: title= Bienvenue dans Microsoft Rewards!
Page loaded, sign in button found: Se connecter
```

Ok, ça veut dire qu'on est pas encore connecté, donc maintenant on va construire la requête de login et voir si on peut se connecter à notre compte Microsoft Rewards pour faire les activités.
<!-- ## CET ARTICLE EST ENCORE EN COURS DE RÉDACTION, JE METTRAI À JOUR AVEC LES ÉTAPES DE CONNEXION ET DE BOTTING DES ACTIVITÉS BIENTÔT ! RESTE À L'ÉCOUTE. -->
