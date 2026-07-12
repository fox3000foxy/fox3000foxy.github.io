---
title: Боттинг фермы Microsoft Rewards
description: Как я написал бота для массового фарма очков Microsoft Rewards -- и
  почему их антибот-защита с тех пор ужесточилась.
date: 2026-03-13authors:
  - fox3000foxy
tags:
  - automation
  - javascript
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "/3AyGPgfhgFWbvtRWYcnBuR1O02ECKM5M2MKwasRjrnrVxALFE1Lc86zim/y4qRSIql3zWRVyn3FiUv7/GGlUg=="
---

> **Примечание (2026):** Этот проект больше не поддерживается. Microsoft значительно усилила свою антибот-защиту -- то, что работало тогда, сегодня уже не работает. Код и подход, описанные ниже, сохранены только в архивных/образовательных целях.

### Введение

Несколько лет назад я открыл для себя Microsoft Rewards. Тогда был карантин, но это не отменяет того факта, что меня заставили использовать Microsoft Family Safety и, соответственно, Edge. Именно тогда я и узнал о Rewards.

В то время мне было всего 14, и ничего в каталоге меня не интересовало. Теперь я понимаю, что с приобретёнными навыками могу фармить очки с помощью ботов, а затем раздавать коды или даже перепродавать их дешевле, если очень захочу (зная себя, я, вероятно, не буду). В любом случае, я расскажу, как я написал бота для массового фарма аккаунтов.

---

## Что такое Microsoft Rewards?

Коротко: это программа, которая награждает пользователей Edge очками за такие действия, как поисковые запросы, небольшие викторины, игры и расширение (это уже совсем другая история).

Здесь можно увидеть раздел «Explore»:  
![Explore screenshot](assets/20260313_135010_image.png)

А вот, например, то, что они называют «набором дня».  
![Daily set screenshot](assets/20260313_135038_image.png)

Они даже создали систему серий, довольно безумно.  
![Streak screenshot](assets/20260313_135210_image.png)

Также есть система уровней, и это просто весело:  
![Level screenshot](assets/20260313_135340_image.png)

В общем, есть куча способов зарабатывать очки, и большинство из них ежедневные.  
Идея в том, чтобы сделать бота, который будет выполнять все действия за тебя, чтобы ты мог фармить очки в масштабе и выполнять свою ежедневную рутину.

Как видно ниже, большинство наград -- это подарочные карты, но есть и забавные вещи вроде игр или подписок на сервисы.  
![Rewards screenshot](assets/20260313_135646_image.png)

| Награда | Категория | Стоимость в очках |
| --- | --- | --- |
| **Rakuten TV – 1 HD фильм** | Цифровой контент | 1 785 |
| **Roblox (цифровая карта)** | Игры / цифровой контент | 6 750 |
| **Подарочная карта Microsoft** | Магазин / сервис | 5 660 |
| **Подарочная карта Xbox** | Магазин / сервис | 5 660 |
| **Подарочная карта Microsoft Solitaire Collection** | Игры / цифровой контент | 1 500 |
| **Minecraft Minecoins** | Игры / цифровой контент | 2 500 |
| **Подарочная карта League of Legends** | Игры / цифровой контент | 2 000 |
| **Код Overwatch coin (цифровой)** | Игры / цифровой контент | 2 000 |
| **Sea of Thieves – набор Old Coins** | Игры / цифровой контент | 1 700 |
| **Zalando – Подарочная карта** | Магазин / сервис | 7 205 |
| **Carrefour – Подарочная карта** | Магазин / сервис | 14 410 |
| **Cultura – Подарочная карта** | Магазин / сервис | 14 410 |
| **Fnac‑Darty – Подарочная карта** | Магазин / сервис | 14 410 |
| **La Redoute – Подарочная карта** | Магазин / сервис | 14 410 |
| **Mango – Подарочная карта** | Магазин / сервис | 36 025 |
| **Wonderbox – Подарочная карта** | Магазин / сервис | 14 410 |
| **Yves Rocher – Подарочная карта** | Магазин / сервис | 14 410 |
| **Amazon.fr – Подарочный ваучер** | Магазин / сервис | 7 205 |
| **Foot Locker – Подарочная карта** | Магазин / сервис | 14 410 |
| **IKEA FR – Подарочная карта** | Магазин / сервис | 36 025 |
| **IKEA FR – Подарочная карта (другой дизайн)** | Магазин / сервис | 7 200 |
| **Marionnaud – Подарочная карта** | Магазин / сервис | 14 410 |
| **Asos – Подарочная карта** | Магазин / сервис | 14 410 |
| **Adidas FR – Подарочная карта** | Магазин / сервис | 14 410 |
| **Deliveroo France – Подарочная карта** | Магазин / сервис | 21 615 |
| **H&M France – Подарочная карта** | Магазин / сервис | 14 410 |
| **Global Hotel Card (Expedia Group)** | Магазин / сервис | 7 205 |
| **Uber Eats France – Подарочная карта** | Магазин / сервис | 36 025 |

Теперь, когда ты понимаешь суть этой программы, давай поговорим о боттинге.

---

## Первые тесты

Прежде чем создавать своего бота, я хотел убедиться, что мой IP не будет забанен за использование сотен аккаунтов с одного адреса. Ты меня знаешь -- я буду использовать Tor с ротирующимся прокси. И я не хочу хостить бота на VPS -- я хочу, чтобы он работал в GitHub Action.

Поэтому я написал простой воркфлоу:

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

Этот воркфлоу просто устанавливает Tor, запускает его и делает curl-запрос через него.

Первый запуск дал такой результат:  
![Tor curl first run](assets/20260313_140705_image.png)

Статистика времени была такой:  
!Timings

Второй запуск дал такой результат:  
![Tor curl second run](assets/20260313_140928_image.png)

Как видишь, IP-адреса разные, так что нас не забанят за чрезмерное использование с одного IP. Это хорошая новость -- можно продолжать разработку бота для фарма.

---

## Первый тест с Selenium

Для автоматизации UI я буду использовать **Selenium**: инструмент, который управляет реальным браузером (Chrome/Edge/Firefox) вместо пользователя. В контексте GitHub Action это означает установку браузера + его драйвера, а затем запуск скрипта, который входит в Microsoft Rewards и кликает там, где нужно.

### Пример JavaScript-скрипта (Node.js + selenium-webdriver)

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

Результат работы скрипта:

```
DevTools listening on ws://127.0.0.1:50274/devtools/browser/37b9ea79-0e5d-4673-9e91-7ffeaf0d37f8
After navigation: url= https://rewards.bing.com/welcome?idru=%2F
After navigation: title= Bienvenue dans Microsoft Rewards!
Page loaded, sign in button found: Se connecter
```

Окей, это значит, что мы ещё не вошли. Теперь мы создадим запрос на вход и посмотрим, сможем ли мы войти в наш аккаунт Microsoft Rewards, чтобы выполнять действия.
<!-- ## ЭТА СТАТЬЯ ЕЩЁ В ПРОЦЕССЕ НАПИСАНИЯ, Я ОБНОВЛЮ ЕЁ ШАГАМИ ПО ВХОДУ И АВТОМАТИЗАЦИИ ДЕЙСТВИЙ В БЛИЖАЙШЕЕ ВРЕМЯ! СЛЕДИ ЗА ОБНОВЛЕНИЯМИ. -->
