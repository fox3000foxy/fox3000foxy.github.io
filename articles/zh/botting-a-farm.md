---
title: 刷 Microsoft Rewards 农场机器人
description: 我怎么写了个机器人大规模刷 Microsoft Rewards 分，以及微软后来如何加固了防御。
date: 2026-03-13
tags:
  - automation
  - javascript
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "foYhvjTEVXGspg5dg8CPGeV2hdEt7h5hH2TzH1ACE/CjKGVeMXGHqKgesLgZvrmKhSTrgEqrpTuTP4gexnfXjQ=="
---

> **注（2026）：** 这个项目已不再维护。微软大幅加强了反机器人检测，当年能用的方法现在都不行了。下面的代码和方法只做归档和演示用。

## 引言

几年前我发现了 Microsoft Rewards。那时还在疫情期间，我被迫用 Microsoft Family Safety 家长控制，只能走 Edge，就这样发现了 Rewards。

当时我才 14 岁，目录里没什么想要的。现在我想，以我学会的技能，可以写机器人大规模刷分，然后把兑换码送人，甚至便宜卖掉也行（说实话，我觉得我不会真卖）。我来给你讲讲我是怎么写了个能大规模刷号的机器人的。

---

## Microsoft Rewards 是什么？

简单说：这是个奖励 Edge 用户的计划，做搜索、小测验、小游戏之类的活动就给分，还有个扩展（那是另一个故事了）。

你看这里的"Explore"区块：
![Explore screenshot](assets/20260313_135010_image.png)

比如这里就是他们说的"每日套装"。
![Daily set screenshot](assets/20260313_135038_image.png)

他们甚至做了连击系统，挺疯的。
![Streak screenshot](assets/20260313_135210_image.png)

还有等级系统，进度感让日常刷分很容易上瘾：
![Level screenshot](assets/20260313_135340_image.png)

所以赚分的方法很多，而且大多是每天都能做。
这里的目标就是写个机器人替你做这些活动，大规模刷分，完成你的刷分日常。

如下所示，大部分奖励是礼品卡，但也有游戏或订阅这类有意思的选项。
![Rewards screenshot](assets/20260313_135646_image.png)

| 奖励 | 类别 | 所需分数 |
| --- | --- | --- |
| **Rakuten TV – 1 部高清电影** | 数字内容 | 1 785 |
| **Roblox（数字卡）** | 游戏 / 数字内容 | 6 750 |
| **微软礼品卡** | 商店 / 服务 | 5 660 |
| **Xbox 礼品卡** | 商店 / 服务 | 5 660 |
| **Microsoft Solitaire Collection 礼品卡** | 游戏 / 数字内容 | 1 500 |
| **Minecraft Minecoins** | 游戏 / 数字内容 | 2 500 |
| **英雄联盟礼品卡** | 游戏 / 数字内容 | 2 000 |
| **守望先锋硬币兑换码（数字）** | 游戏 / 数字内容 | 2 000 |
| **盗贼之海 – 古钱币包** | 游戏 / 数字内容 | 1 700 |
| **Zalando – 礼品卡** | 商店 / 服务 | 7 205 |
| **家乐福 – 礼品卡** | 商店 / 服务 | 14 410 |
| **Cultura – 礼品卡** | 商店 / 服务 | 14 410 |
| **Fnac‑Darty – 礼品卡** | 商店 / 服务 | 14 410 |
| **La Redoute – 礼品卡** | 商店 / 服务 | 14 410 |
| **Mango – 礼品卡** | 商店 / 服务 | 36 025 |
| **Wonderbox – 礼品卡** | 商店 / 服务 | 14 410 |
| **Yves Rocher – 礼品卡** | 商店 / 服务 | 14 410 |
| **Amazon.fr – 礼品券** | 商店 / 服务 | 7 205 |
| **Foot Locker – 礼品卡** | 商店 / 服务 | 14 410 |
| **宜家法国 – 礼品卡** | 商店 / 服务 | 36 025 |
| **宜家法国 – 礼品卡（另一款设计）** | 商店 / 服务 | 7 200 |
| **Marionnaud – 礼品卡** | 商店 / 服务 | 14 410 |
| **Asos – 礼品卡** | 商店 / 服务 | 14 410 |
| **阿迪达斯法国 – 礼品卡** | 商店 / 服务 | 14 410 |
| **Deliveroo 法国 – 礼品卡** | 商店 / 服务 | 21 615 |
| **H&M 法国 – 礼品卡** | 商店 / 服务 | 14 410 |
| **Global Hotel Card（Expedia 集团）** | 商店 / 服务 | 7 205 |
| **Uber Eats 法国 – 礼品卡** | 商店 / 服务 | 36 025 |

现在你明白这个计划为什么诱人了，来聊刷分机器人吧。

---

## 初步测试

在写机器人之前，我想确认我的 IP 不会因为同一地址登录几百个号被标记。你懂我的，我走 Tor 加轮换代理。我想跑在 GitHub Action 里，而不是 VPS 上。

于是我写了个简单的工作流：

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

这个工作流只做：装 Tor，启动，用 curl 穿过去请求一次。

第一次运行结果：
![Tor curl first run](assets/20260313_140705_image.png)

耗时统计：
!Timings

第二次运行结果：
![Tor curl second run](assets/20260313_140928_image.png)

可以看到两次 IP 不一样，所以不会因为同 IP 滥用被标记。好消息：可以继续开发刷分机器人了。

---

## 用 Selenium 做第一次测试

要操作界面，我用 **Selenium**：它控制一个真正的浏览器（Chrome/Edge/Firefox），替用户点。在 GitHub Action 里，就是装浏览器加 driver，再跑脚本登录 Microsoft Rewards 去点点点。

### JavaScript 示例脚本（Node.js + selenium-webdriver）

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

脚本运行结果：

```
DevTools listening on ws://127.0.0.1:50274/devtools/browser/37b9ea79-0e5d-4673-9e91-7ffeaf0d37f8
After navigation: url= https://rewards.bing.com/welcome?idru=%2F
After navigation: title= Bienvenue dans Microsoft Rewards!
Page loaded, sign in button found: Se connecter
```

这个结果确认我们还没登录，所以接下来我会构造登录请求，连上我的 Microsoft Rewards 账号，把活动的自动化做了。
<!-- ## CET ARTICLE EST ENCORE EN COURS DE RÉDACTION, JE METTRAI À JOUR AVEC LES ÉTAPES DE CONNEXION ET DE BOTTING DES ACTIVITÉS BIENTÔT ! RESTE À L'ÉCOUTE. -->
