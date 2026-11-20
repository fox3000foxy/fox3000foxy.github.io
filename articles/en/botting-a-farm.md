---
title: Botting a Microsoft Rewards Farm
description: How I coded a bot to farm Microsoft Rewards points at
  scale -- and why Microsoft has since hardened its defenses.
date: 2026-03-13
tags:
  - automation
  - javascript
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "QwBIM5ZWglSWqjMdI23YlT9JAe+NvUcH2CSB6gvC+3IAsoQ18165XuunBmvwGhQ9QQaPxBI6Nt9YtKnjHM20Yg=="
---

> **Note (2026):** This project is no longer maintained. Microsoft has considerably hardened its anti-bot detection, so what worked back then no longer works today. The code and approach below are kept for archiving and demonstration purposes only.

## Introduction

I discovered Microsoft Rewards a few years ago. It was during lockdown, and back then I was forced to use the Microsoft Family Safety parental controls and therefore go through Edge. That's how I discovered Rewards.

At the time I was only 14 and nothing in the catalog interested me. Now I figure that with the skills I've picked up, I can farm points with bots, then give the codes away or even resell them cheaper if I really feel like it (but honestly, I don't think I'll do it). Let me tell you how I coded a bot that farms accounts at scale.

---

## What Is Microsoft Rewards?

To keep it short: it's a program that rewards Edge users with points for activities like searches, small quizzes, games, and an extension (but that's another story).

You can see the "Explore" blocks here:
![Explore screenshot](assets/20260313_135010_image.png)

Here for example is what they call the "daily set".
![Daily set screenshot](assets/20260313_135038_image.png)

They even made a streak system, which is pretty wild.
![Streak screenshot](assets/20260313_135210_image.png)

There's also a level system and the progression makes the routine genuinely addictive:
![Level screenshot](assets/20260313_135340_image.png)

So you've got plenty of ways to earn points, and most of them are daily.
The idea here is to build a bot that does the activities for you, to farm points at scale and complete your farming routine.

As you can see below, most rewards are gift cards, but there are also interesting options like games or subscriptions.
![Rewards screenshot](assets/20260313_135646_image.png)

| Reward | Category | Point cost |
| --- | --- | --- |
| **Rakuten TV – 1 HD movie** | Digital content | 1 785 |
| **Roblox (digital card)** | Game / digital content | 6 750 |
| **Microsoft gift card** | Store / service | 5 660 |
| **Xbox gift card** | Store / service | 5 660 |
| **Microsoft Solitaire Collection gift card** | Game / digital content | 1 500 |
| **Minecraft Minecoins** | Game / digital content | 2 500 |
| **League of Legends gift card** | Game / digital content | 2 000 |
| **Overwatch coins code (digital)** | Game / digital content | 2 000 |
| **Sea of Thieves – Ancient Coins pack** | Game / digital content | 1 700 |
| **Zalando – Gift card** | Store / service | 7 205 |
| **Carrefour – Gift card** | Store / service | 14 410 |
| **Cultura – Gift card** | Store / service | 14 410 |
| **Fnac‑Darty – Gift card** | Store / service | 14 410 |
| **La Redoute – Gift card** | Store / service | 14 410 |
| **Mango – Gift card** | Store / service | 36 025 |
| **Wonderbox – Gift card** | Store / service | 14 410 |
| **Yves Rocher – Gift card** | Store / service | 14 410 |
| **Amazon.fr – Gift voucher** | Store / service | 7 205 |
| **Foot Locker – Gift card** | Store / service | 14 410 |
| **IKEA FR – Gift card** | Store / service | 36 025 |
| **IKEA FR – Gift card (other design)** | Store / service | 7 200 |
| **Marionnaud – Gift card** | Store / service | 14 410 |
| **Asos – Gift card** | Store / service | 14 410 |
| **Adidas FR – Gift card** | Store / service | 14 410 |
| **Deliveroo France – Gift card** | Store / service | 21 615 |
| **H&M France – Gift card** | Store / service | 14 410 |
| **Global Hotel Card (Expedia Group)** | Store / service | 7 205 |
| **Uber Eats France – Gift card** | Store / service | 36 025 |

Now that you get the point of the program, let's get into botting.

---

## First tests

Before building my bot, I wanted to make sure my IP wouldn't get flagged for using hundreds of accounts from the same address. You know me, I go through Tor with a rotating proxy. I want to run it in a GitHub Action rather than on a VPS.

So I wrote a simple workflow:

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

This workflow just installs Tor, starts it, and makes a curl request through it.

The first run gave this result:
![Tor curl first run](assets/20260313_140705_image.png)

The timing stats were:
!Timings

A second run gave this result:
![Tor curl second run](assets/20260313_140928_image.png)

As you can see, the IPs are different, so we avoid flagging for abusive use from the same IP. Good news: we can keep building the farming bot.

---

## First test with Selenium

To automate the UI, I'll use **Selenium**: a tool that controls a real browser (Chrome/Edge/Firefox) in place of a user. In a GitHub Action context, that means installing a browser + its driver, then running a script that signs into Microsoft Rewards and clicks where it needs to.

### Example JavaScript script (Node.js + selenium-webdriver)

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

Script output:

```
DevTools listening on ws://127.0.0.1:50274/devtools/browser/37b79ea79-0e5d-4673-9e91-7ffeaf0d37f8
After navigation: url= https://rewards.bing.com/welcome?idru=%2F
After navigation: title= Welcome to Microsoft Rewards!
Page loaded, sign in button found: Se connecter
```

That result confirms we're still signed out, so now I'll build the login request and test signing into my Microsoft Rewards account to automate the activities.
<!-- ## THIS ARTICLE IS STILL BEING WRITTEN, I'LL UPDATE WITH THE LOGIN AND ACTIVITY BOTTING STEPS SOON! STAY TUNED. -->
