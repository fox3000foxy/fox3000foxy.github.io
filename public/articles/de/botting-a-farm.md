---
title: Eine Microsoft-Rewards-Farm botten
description: Wie ich einen Bot gecodet habe, um Microsoft-Rewards-Punkte in
  großem Maßstab zu farmen, und warum Microsoft seitdem seine Abwehr verstärkt hat.
date: 2026-03-13
tags:
  - automation
  - javascript
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "6B3txqg5NqIeNEsHb+FBxNjEKFVUSw6C9x0ZZm6rP3J1syS7m3W/wXNOczwkKN6RVrKlu3q4PeLVCcfniwWWSQ=="
---

> **Hinweis (2026) :** Dieses Projekt wird nicht mehr gepflegt. Microsoft hat seine Anti-Bot-Erkennung erheblich verstärkt, also funktioniert das, was damals ging, heute nicht mehr. Der Code und der unten beschriebene Ansatz werden nur zu Archiv- und Demonstrationszwecken aufbewahrt.

## Einleitung

Ich habe Microsoft Rewards vor ein paar Jahren entdeckt. Es war während des Lockdowns, und damals musste ich die Microsoft Family Safety-Kindersicherung nutzen und also über Edge gehen. Dort habe ich Rewards entdeckt.

Damals war ich erst 14 und nichts im Katalog interessierte mich. Jetzt denke ich mir, dass ich mit den Fähigkeiten, die ich erworben habe, Punkte mit Bots farmen kann, dann die Codes verschenken oder sogar billiger weiterverkaufen, wenn ich wirklich Lust habe (aber ehrlich gesagt glaube ich nicht, dass ich es mache). Ich erzähle dir, wie ich einen Bot gecodet habe, der Konten in großem Maßstab farmt.

---

## Was ist Microsoft Rewards?

Kurz gesagt: Es ist ein Programm, das Edge-Nutzer mit Punkten für Aktivitäten wie Suchen, kleine Quizze, Spiele und eine Erweiterung belohnt (aber das ist eine andere Geschichte).

Du siehst hier die "Explore"-Blöcke:  
![Explore screenshot](assets/20260313_135010_image.png)

Dort zum Beispiel ist das, was sie das "Tagesset" nennen.  
![Daily set screenshot](assets/20260313_135038_image.png)

Sie haben sogar ein Streak-System eingebaut, das ist ziemlich verrückt.  
![Streak screenshot](assets/20260313_135210_image.png)

Es gibt auch ein Levelsystem und der Fortschritt macht die Routine richtig süchtig:  
![Level screenshot](assets/20260313_135340_image.png)

Du hast also viele Möglichkeiten, Punkte zu verdienen, und die meisten sind täglich.  
Die Idee hier wird sein, einen Bot zu bauen, der die Aktivitäten für dich erledigt, um Punkte in großem Maßstab zu farmen und deine Farming-Routine zu vervollständigen.

Wie du unten sehen kannst, sind die meisten Belohnungen Geschenkkarten, aber es gibt auch interessante Optionen wie Spiele oder Abos.  
![Rewards screenshot](assets/20260313_135646_image.png)

| Belohnung | Kategorie | Kosten in Punkten |
| --- | --- | --- |
| **Rakuten TV – 1 HD-Film** | Digitale Inhalte | 1 785 |
| **Roblox (digitale Karte)** | Spiel / digitale Inhalte | 6 750 |
| **Microsoft-Geschenkkarte** | Shop / Service | 5 660 |
| **Xbox-Geschenkkarte** | Shop / Service | 5 660 |
| **Microsoft Solitaire Collection-Geschenkkarte** | Spiel / digitale Inhalte | 1 500 |
| **Minecraft Minecoins** | Spiel / digitale Inhalte | 2 500 |
| **League of Legends-Geschenkkarte** | Spiel / digitale Inhalte | 2 000 |
| **Overwatch-Münzen-Code (digital)** | Spiel / digitale Inhalte | 2 000 |
| **Sea of Thieves – Antike Münzen-Pack** | Spiel / digitale Inhalte | 1 700 |
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
| **Deliveroo France – Geschenkkarte** | Shop / Service | 21 615 |
| **H&M France – Geschenkkarte** | Shop / Service | 14 410 |
| **Global Hotel Card (Expedia Group)** | Shop / Service | 7 205 |
| **Uber Eats France – Geschenkkarte** | Shop / Service | 36 025 |

Jetzt, wo du den Reiz des Programms verstehst, schauen wir uns das Botten an.

---

## Erste Tests

Bevor ich meinen Bot baue, wollte ich sicher sein, dass meine IP nicht markiert wird, weil ich Hunderte Konten von derselben Adresse genutzt habe. Du kennst mich, ich gehe über Tor mit rotierendem Proxy. Ich will es in einer GitHub Action laufen lassen statt auf einem VPS.

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

Dieser Workflow installiert nur Tor, startet es und macht eine curl-Anfrage hindurch.

Der erste Run gab dieses Ergebnis:  
![Tor curl first run](assets/20260313_140705_image.png)

Die Zeitstatistiken waren:  
!Timings

Ein zweiter Run gab dieses Ergebnis:  
![Tor curl second run](assets/20260313_140928_image.png)

Wie du sehen kannst, sind die IPs verschieden, also vermeiden wir eine Markierung wegen missbräuchlicher Nutzung von derselben IP. Gute Nachricht: Wir können mit der Entwicklung des Farming-Bots weitermachen.

---

## Erster Test mit Selenium

Um die Oberfläche zu automatisieren, werde ich **Selenium** nutzen: ein Tool, das einen echten Browser (Chrome/Edge/Firefox) anstelle eines Nutzers steuert. Im Kontext einer GitHub Action heißt das, einen Browser + seinen Driver zu installieren und dann ein Skript zu starten, das sich bei Microsoft Rewards anmeldet und dort klickt, wo es muss.

### Beispielskript in JavaScript (Node.js + selenium-webdriver)

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
  // Skript injizieren, bevor irgendein Seiten-JS läuft, um Automation-Fingerprinting zu reduzieren.
  await (driver as any).sendDevToolsCommand('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });

      // Manche Seiten prüfen Chrome-Runtime und Plugins
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

Dieses Ergebnis bestätigt, dass wir noch ausgeloggt sind, also werde ich jetzt die Login-Anfrage bauen und die Verbindung zu meinem Microsoft-Rewards-Konto testen, um die Aktivitäten zu automatisieren.
<!-- ## CET ARTICLE EST ENCORE EN COURS DE RÉDACTION, JE METTRAI À JOUR AVEC LES ÉTAPES DE CONNEXION ET DE BOTTING DES ACTIVITÉS BIENTÔT! RESTE À L'ÉCOUTE. -->
