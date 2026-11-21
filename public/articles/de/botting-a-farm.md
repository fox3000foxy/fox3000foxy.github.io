---
title: Eine Microsoft-Rewards-Farm botten
description: "Wie ich einen Bot gecodet habe, um Microsoft-Rewards-Punkte in großem Maßstab zu farmen, und warum Microsoft seitdem seine Abwehr verstärkt hat."
date: 2026-03-13
tags:
  - automation
  - javascript
  - reverse-engineering
authors:
  - fox3000foxy
lang: "de"
---
> 

## Einleitung

Ich entdeckte Microsoft Rewards vor ein paar Jahren. Es war während der Einschließung, und damals war ich gezwungen, die Microsft Family Safety elterliche Kontrolle zu verwenden und so durch Edge zu gehen. Dort entdeckte ich Reward.

Ich war damals erst 14 Jahre alt und nichts im Katalog interessierte mich für mich. Jetzt denke ich, dass ich mit den Fähigkeiten, die ich erworben habe, Punkte mit Bots fackeln kann, dann die Codes geben oder sogar billiger verkaufen kann, wenn ich sie wirklich will (aber ehrlich gesagt, ich denke nicht, dass es das ist). Ich erzähle dir, wie ich einen Bot verschlüsselt habe, der auf der Skala Konten farmt.

---

## Was ist Microsoft Rewards?

Kurz gesagt: Es ist ein Programm, das Edge-Nutzer mit Punkten für Aktivitäten wie Forschung, kleine Quizs, Spiele und eine Erweiterung belohnt (aber das ist eine andere Geschichte).

Hier siehst du die "Explore"-Blöcke:![Explore screenshot](assets/20260313_135010_image.png)

Das ist zum Beispiel das "Tagesset."![Daily set screenshot](assets/20260313_135038_image.png)

Sie haben sogar ein Streak-System gemacht. Das ist verrückt genug.![Streak screenshot](assets/20260313_135210_image.png)

Es gibt auch ein Level-System und Fortschritt macht die Routine wirklich süchtig:![Level screenshot](assets/20260313_135340_image.png)

Du hast also viele Möglichkeiten, Punkte zu verdienen, und die meisten sind täglich, und hier wird es sein, einen Bot zu machen, der die Aktivitäten an deiner Stelle macht, um Punkte auf der Skala zu packen und deine Farming-Routine zu vollenden.

Wie du unten sehen können, sind die meisten Belohnungen Geschenkkarten, aber es gibt auch interessante Optionen wie Spiele oder Abonnements.![Rewards screenshot](assets/20260313_135646_image.png)

| Belohnung | Kategorie | Kosten in Punkten |
| --- | --- | --- |
| **Rakuten TV ✓ 1 HD-Film** | Digitale Inhalte | 1 785 |
| **Roblox (Digitalkarte)** | Spiel / digitale Inhalte | 6 750 |
| **Gutschein Microsoft** | Shop / Service | 5 660 |
| **Xbox Geschenkkarte** | Shop / Service | 5 660 |
| **Gutschein Microsoft Solitaire Collection** | Spiel / digitale Inhalte | 1 500 |
| **Minecraft Minecoins** | Spiel / digitale Inhalte | 2 500 |
| **Geschenkkarte League of Legends** | Spiel / digitale Inhalte | 2 000 |
| **Overwatch-Code (digital)** | Spiel / digitale Inhalte | 2 000 |
| **Sea of Thieves ✓ Pack Antike Münzen** | Spiel / digitale Inhalte | 1 700 |
| **Zalando ✓ Geschenkkarte** | Shop / Service | 7 205 |
| **Carrefour ✓ Geschenkkarte** | Shop / Service | 14 410 |
| **Cultura ✓ Geschenkkarte** | Shop / Service | 14 410 |
| **Fnac-Darty ✓ Geschenkkarte** | Shop / Service | 14 410 |
| **La Redoute ✓ Geschenkkarte** | Shop / Service | 14 410 |
| **Mango ✓ Geschenkkarte** | Shop / Service | 36 025 |
| **Wonderbox ✓ Geschenkkarte** | Shop / Service | 14 410 |
| **Yves Rocher ✓ Geschenkkarte** | Shop / Service | 14 410 |
| ** Amazon.de ✓ Geschenkgutscheine** | Shop / Service | 7 205 |
| **Foot Locker ✓ Geschenkkarte** | Shop / Service | 14 410 |
| **IKEA DE ✓ Geschenkkarte** | Shop / Service | 36 025 |
| **IKEA DE ✓ Geschenkkarte (anderes Design)** | Shop / Service | 7 200 |
| **Marionnaud ✓ Geschenkkarte** | Shop / Service | 14 410 |
| **Asos ✓ Geschenkkarte** | Shop / Service | 14 410 |
| **Adidas DE ✓ Geschenkkarte** | Shop / Service | 14 410 |
| **Deliveroo Frankreich ✓ Geschenkkarte** | Shop / Service | 21 615 |
| **H&M France ✓ Geschenkkarte** | Shop / Service | 14 410 |
| **Global Hotel Card (Expedia Group)** | Shop / Service | 7 205 |
| **Über Eats Frankreich ✓ Geschenkkarte** | Shop / Service | 36 025 |

Jetzt, wo du den Nutzen des Programms verstehst, sollten wir uns für Botting interessieren.

---

## Erste Tests

Bevor ich meinen Bot baute, wollte ich sichergehen, dass meine IP nicht für die Verwendung von Hunderten von Konten von derselben Adresse markiert werden würde. Du kennst mich, ich fahre Tor mit einem rotierenden Proxy. Ich will es in einem GitHub Action statt auf einem VPS ausführen.

Also schrieb ich einen einfachen Workflow:
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
Dieser Workflow installiert nur Tor, startet es und macht eine Curl-Anfrage durch ihn.

Der erste Run hat dieses Ergebnis gegeben:![Tor curl first run](assets/20260313_140705_image.png)

Die Statistiken der Zeit waren:!Timings

Ein zweiter Run hat dieses Ergebnis:![Tor curl second run](assets/20260313_140928_image.png)

Wie du siehst kannst, sind die IPs unterschiedlich, also vermeiden wir eine Kennzeichnung für Missbrauch aus derselben IP. Gute Nachricht: Wir können den Farming-Bot weiter entwickeln.

---

## Erster Test mit Selenium

Um die Schnittstelle zu automatisieren, werde ich **Selenium** verwenden: ein Werkzeug, das einen echten Browser (Chrome/Edge/Firefox) anstelle eines Benutzers steuert. Im Rahmen einer GitHub Action bedeutet das, einen Browseer + einen Treiber zu installieren und dann ein Skript zu starten, das sich mit Microsoft Rewards verbindet und dort klickt, wo es nötig ist.

### Beispiel für JavaScript (Node.js + Selenium-webdriver)
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
  // Injizieren script before any page JS runs to reduce automation fingerprinting.
  await (driver as any).sendDevToolsCommand('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });

      // Einige Websites überprüfen auf Chrom Laufzeit und Plugins
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
Dieses Ergebnis bestätigt, dass wir noch nicht verbunden sind, also werde ich jetzt die Login-Anfrage erstellen und die Verbindung zu meinem Microsoft Rewards-Konto testen, um die Aktivitäten zu automatisieren.<!– ## CET ARTICLE EST ENCORE EN COURS DE RÉDACTION, JE METTRAI À JOUR AVEC LES ÉTAPES DE CONNEXION ET DE BOTTING DES ACTIVITÉS BIENTÔT! RESTE À L'ÉCOUTE. –>
