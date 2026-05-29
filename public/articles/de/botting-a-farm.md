---
title: Eine Microsoft-Rewards-Farm boten
description: Wie ich einen Bot programmiert habe, der Microsoft-Rewards-Punkte
  in großem Stil farmt – und warum Microsofts Anti-Bot-Erkennung inzwischen
  nachgezogen hat.
date: 2026-03-13
tags:
  - automation
  - javascript
  - reverse-engineering
authors:
  - fox3000foxy
---

> **Hinweis (2026):** Dieses Projekt wird nicht mehr gewartet. Microsoft hat seine Anti-Bot-Erkennung deutlich verschärft – was damals funktioniert hat, funktioniert heute nicht mehr. Der Code und der unten beschriebene Ansatz werden nur zu Archivierungs-/Bildungszwecken aufbewahrt.

### Einleitung

Vor ein paar Jahren habe ich Microsoft Rewards entdeckt. Damals war während des Lockdowns, aber das ändert nichts daran, dass ich die Microsoft Family Safety-Elternkontrollen nutzen musste und daher Edge verwenden musste. Da habe ich Rewards entdeckt.

Zu der Zeit war ich erst 14 und nichts im Katalog interessierte mich. Jetzt denke ich, dass ich mit den Fähigkeiten, die ich erworben habe, Punkte mit Bots farmen und die Codes dann verschenken oder sogar günstiger weiterverkaufen kann, wenn ich wirklich will (so wie ich mich kenne, werde ich das wahrscheinlich nicht tun). Wie auch immer, ich erzähle dir, wie ich einen Bot programmiert habe, der Accounts in großem Stil farmt.

---

## Was ist Microsoft Rewards?

Kurz gesagt: Es ist ein Programm, das Edge-Benutzer mit Punkten für Aktivitäten wie Suchen, kleine Quizze, Spiele und eine Erweiterung belohnt (das ist eine ganz andere Geschichte).

Hier siehst du „Entdecken“-Sachen:  
![Explore screenshot](assets/20260313_135010_image.png)

Hier ist zum Beispiel das, was sie das „Set des Tages“ nennen.  
![Daily set screenshot](assets/20260313_135038_image.png)

Sie haben sogar ein Streak-System erstellt, es ist ziemlich verrückt.  
![Streak screenshot](assets/20260313_135210_image.png)

Es gibt auch ein Level-System und es macht einfach komplett Spaß:  
![Level screenshot](assets/20260313_135340_image.png)

Du hast also jede Menge Möglichkeiten, Punkte zu sammeln, und die meisten davon sind täglich.  
Die Idee hier ist, einen Bot zu bauen, der die Aktivitäten für dich erledigt, damit du Punkte im großen Stil farmen und deine Farming-Routine absolvieren kannst.

Wie du unten siehst, sind die meisten Belohnungen Geschenkkarten, aber es gibt auch lustige Dinge wie Spiele oder Service-Abonnements.  
![Rewards screenshot](assets/20260313_135646_image.png)

| Belohnung | Kategorie | Kosten in Punkten |
| --- | --- | --- |
| **Rakuten TV – 1 HD-Film** | Digitale Inhale | 1 785 |
| **Roblox (digitale Karte)** | Spiel / digitale Inhalte | 6 750 |
| **Microsoft-Geschenkkarte** | Shop / Service | 5 660 |
| **Xbox-Geschenkkarte** | Shop / Service | 5 660 |
| **Microsoft Solitaire Collection-Geschenkkarte** | Spiel / digitale Inhalte | 1 500 |
| **Minecraft Minecoins** | Spiel / digitale Inhalte | 2 500 |
| **League of Legends-Geschenkkarte** | Spiel / digitale Inhalte | 2 000 |
| **Overwatch-Münz-Code (digital)** | Spiel / digitale Inhalte | 2 000 |
| **Sea of Thieves – Old Coins-Paket** | Spiel / digitale Inhalte | 1 700 |
| **Zalando – Geschenkkarte** | Shop / Service | 7 205 |
| **Carrefour – Geschenkkarte** | Shop / Service | 14 410 |
| **Cultura – Geschenkkarte** | Shop / Service | 14 410 |
| **Fnac‑Darty – Geschenkkarte** | Shop / Service | 14 410 |
| **La Redoute – Geschenkkarte** | Shop / Service | 14 410 |
| **Mango – Geschenkkarte** | Shop / Service | 36 025 |
| **Wonderbox – Geschenkkarte** | Shop / Service | 14 410 |
| **Yves Rocher – Geschenkkarte** | Shop / Service | 14 410 |
| **Amazon.fr – Geschenkgutschein** | Shop / Service | 7 205 |
| **Foot Locker – Geschenkkarte** | Shop / Service | 14 410 |
| **IKEA FR – Geschenkkarte** | Shop / Service | 36 025 |
| **IKEA FR – Geschenkkarte (anderes Design)** | Shop / Service | 7 200 |
| **Marionnaud – Geschenkkarte** | Shop / Service | 14 410 |
| **Asos – Geschenkkarte** | Shop / Service | 14 410 |
| **Adidas FR – Geschenkkarte** | Shop / Service | 14 410 |
| **Deliveroo Frankreich – Geschenkkarte** | Shop / Service | 21 615 |
| **H&M Frankreich – Geschenkkarte** | Shop / Service | 14 410 |
| **Global Hotel Card (Expedia Group)** | Shop / Service | 7 205 |
| **Uber Eats Frankreich – Geschenkkarte** | Shop / Service | 36 025 |

Nachdem du jetzt den Sinn dieses Programms verstehst, schauen wir uns das Botting an.

---

## Erste Tests

Bevor ich meinen Bot gebaut habe, wollte ich sichergehen, dass meine IP nicht geflaggt wird, wenn ich hunderte Accounts von derselben Adresse aus verwende. Du kennst mich, ich werde Tor mit einem rotierenden Proxy verwenden. Und ich will meinen Bot nicht auf einem VPS hosten – er soll in einer GitHub Action laufen.

Also habe ich einen einfachen Workflow geschrieben:

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

Dieser Workflow installiert einfach Tor, startet es und führt eine Curl-Anfrage darüber aus.

Der erste Durchlauf ergab dieses Ergebnis:  
![Tor curl first run](assets/20260313_140705_image.png)

Die Zeitstatistiken waren:  
!Timings

Ein zweiter Durchlauf ergab dieses Ergebnis:  
![Tor curl second run](assets/20260313_140928_image.png)

Wie du siehst, sind die IPs unterschiedlich, also werden wir nicht für missbräuchliche Nutzung von derselben IP geflaggt. Das sind gute Nachrichten – wir können mit der Entwicklung des Farming-Bots fortfahren.

---

## Erster Test mit Selenium

Um die UI zu automatisieren, verwende ich **Selenium**: ein Tool, das einen echten Browser (Chrome/Edge/Firefox) anstelle eines Benutzers steuert. Im Kontext einer GitHub Action bedeutet das, einen Browser + seinen Treiber zu installieren und dann ein Skript auszuführen, das sich bei Microsoft Rewards anmeldet und dort klickt, wo es nötig ist.

### Beispiel-JavaScript-Skript (Node.js + selenium-webdriver)

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

Ergebnis des Skripts:

```
DevTools listening on ws://127.0.0.1:50274/devtools/browser/37b9ea79-0e5d-4673-9e91-7ffeaf0d37f8
After navigation: url= https://rewards.bing.com/welcome?idru=%2F
After navigation: title= Bienvenue dans Microsoft Rewards!
Page loaded, sign in button found: Se connecter
```

Okay, das bedeutet, dass wir noch nicht eingeloggt sind. Als nächstes bauen wir den Login-Request und schauen, ob wir uns in unser Microsoft-Rewards-Konto einloggen können, um die Aktivitäten zu erledigen.
<!-- ## DIESER ARTIKEL IST NOCH IN ARBEIT, ICH WERDE IHN BALD MIT DEN LOGIN-SCHRITTEN UND DEN BOTTING-SCHRITTEN FÜR AKTIVITÄTEN AKTUALISIEREN! BLEIB DRAN. -->
