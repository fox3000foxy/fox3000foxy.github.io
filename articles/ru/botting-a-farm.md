---
title: Ботить ферму Microsoft Rewards
description: Как я закодил бота для фарма очков Microsoft Rewards в
  большом масштабе -- и почему Microsoft с тех пор усилил защиту.
date: 2026-03-13
tags:
  - automation
  - javascript
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "W6gDDlu2MrEJ/PNHT5r0SOH0OFF9cbDmvAIvZEwvzLENVsJvgKfMVZfhi2aQqOyjKhjIhaFfqly1HLYw8WNGvQ=="
---

> **Заметка (2026) :** Этот проект больше не поддерживается. Microsoft значительно усилил антибот-детект, так что то, что работало тогда, сегодня больше не работает. Код и подход, описанные ниже, сохранены только в целях архива и демонстрации.

## Введение

Я открыл Microsoft Rewards несколько лет назад. Это было во время ковида, и тогда я был обязан использовать родительский контроль Microsoft Family Safety и, значит, сидеть через Edge. Так я и открыл Rewards.

Тогда мне было всего 14, и ничего в каталоге меня не интересовало. Теперь думаю, что с навыками, которые приобрёл, могу фармить очки ботами, а потом раздавать коды или даже перепродавать дешевле, если реально захочу (но честно, думаю, не буду). Расскажу, как я закодил бота, который фармит аккаунты в масштабе.

---

## Что такое Microsoft Rewards ?

Коротко : это программа, награждающая пользователей Edge очками за активности вроде поисков, маленьких квизов, игр и расширения (но это уже другая история).

Ты видишь здесь блоки "Explore" :
![Explore screenshot](assets/20260313_135010_image.png)

Вот, например, то, что они называют "набором дня".
![Daily set screenshot](assets/20260313_135038_image.png)

Они даже сделали систему стриков, это довольно дико.
![Streak screenshot](assets/20260313_135210_image.png)

Есть ещё система уровней, и прогресс делает рутину реально залипательной :
![Level screenshot](assets/20260313_135340_image.png)

Так что есть куча способов зарабатывать очки, и большинство ежедневные.
Идея здесь будет в том, чтобы сделать бота, который делает активности за тебя, чтобы фармить очки в масштабе и закрывать свою фарм-рутину.

Как видишь ниже, большинство наград это подарочные карты, но есть и интересные опции вроде игр или подписок.
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

Теперь, когда понимаешь интерес программы, займёмся ботингом.

---

## Первые тесты

Прежде чем строить бота, я хотел убедиться, что мой IP не будет помечен за использование сотен аккаунтов с одного адреса. Ты меня знаешь, я иду через Tor с ротирующимся прокси. Хочу запускать это в GitHub Action, а не на VPS.

Так что я написал простой воркфлоу :

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

Этот воркфлоу просто ставит Tor, запускает его и делает запрос curl через него.

Первый запуск дал такой результат :
![Tor curl first run](assets/20260313_140705_image.png)

Статистика по времени была :
!Timings

Второй запуск дал такой результат :
![Tor curl second run](assets/20260313_140928_image.png)

Как видишь, IP разные, так что избегаем пометки за злоупотребление с одного IP. Хорошая новость : можно продолжать разрабатывать фарм-бота.

---

## Первый тест с Selenium

Чтобы автоматизировать интерфейс, я буду использовать **Selenium** : инструмент, управляющий настоящим браузером (Chrome/Edge/Firefox) вместо пользователя. В контексте GitHub Action это значит поставить браузер + его драйвер, затем запустить скрипт, который логинится в Microsoft Rewards и кликает куда надо.

### Пример скрипта JavaScript (Node.js + selenium-webdriver)

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
  // Внедряем скрипт до запуска любого JS страницы, чтобы снизить отпечаток автоматизации.
  await (driver as any).sendDevToolsCommand('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });

      // Некоторые сайты проверяют chrome runtime и плагины
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

Результат скрипта :

```
DevTools listening on ws://127.0.0.1:50274/devtools/browser/37b9ea79-0e5d-4673-9e91-7ffeaf0d37f8
After navigation: url= https://rewards.bing.com/welcome?idru=%2F
After navigation: title= Bienvenue dans Microsoft Rewards!
Page loaded, sign in button found: Se connecter
```

Результат подтверждает, что мы всё ещё разлогинены, так что теперь я построю запрос логина и протестирую подключение к своему аккаунту Microsoft Rewards, чтобы автоматизировать активности.
<!-- ## CET ARTICLE EST ENCORE EN COURS DE RÉDACTION, JE METTRAI À JOUR AVEC LES ÉTAPES DE CONNEXION ET DE BOTTING DES ACTIVITÉS BIENTÔT ! RESTE À L'ÉCOUTE. -->
