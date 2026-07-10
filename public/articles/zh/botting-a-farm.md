---
title: 给 Microsoft Rewards 刷分农场写个机器人
description: 我如何编写了一个机器人来规模化刷 Microsoft Rewards 积分----以及微软的反机器人检测后来是如何追上来的。
date: 2026-03-13
tags:
  - automation
  - javascript
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA=="
author_sig: "smaJkyDAiGoVC95QuH7cOh96jDMLPdYAEjyJQwrMKWD6r9uCYyc9XMvlnEozsDxhWfoX0nzYeKxQW8yceNzUQQ=="
---

> **备注（2026 年）：** 该项目已不再维护。微软显著加强了反机器人检测----当年有效的方法今天已经行不通了。下面描述的代码和方法仅用于存档/教育目的。

### 引言

几年前我发现了 Microsoft Rewards。当时正处于封城期间，但这改变不了我被迫使用 Microsoft Family Safety 家长控制的事实，因此不得不使用 Edge。就在那时我发现了 Rewards。

那时我才 14 岁，目录里没什么我感兴趣的东西。现在我想，以我掌握的技能，我可以用机器人刷积分，然后把兑换码送人，或者如果真的想的话甚至可以低价转卖（以我对自己的了解，我可能不会）。总之，我来聊聊我是如何编写了一个能规模化刷账号的机器人。

---

## 什么是 Microsoft Rewards？

长话短说：这是一个奖励 Edge 用户积分的计划，可以通过搜索、小测验、游戏和一个扩展（那是另一个故事了）来获取积分。

这里你可以看到"探索"内容：
![探索截图](assets/20260313_135010_image.png)

比如这就是他们所谓的"今日精选集"。
![今日精选集截图](assets/20260313_135038_image.png)

他们甚至还搞了个连续签到系统，挺疯狂的。
![连续签到截图](assets/20260313_135210_image.png)

还有等级系统，真的很有意思：
![等级截图](assets/20260313_135340_image.png)

所以你有无数种赚积分的方式，而且大部分是每日任务。
这里的思路是做一个机器人来自动完成这些活动，这样你就可以规模化刷积分，完成你的日常任务。

如下所示，大部分奖励是礼品卡，但也有一些有趣的东西，比如游戏或服务订阅。
![奖励截图](assets/20260313_135646_image.png)

| 奖励 | 类别 | 积分成本 |
| --- | --- | --- |
| **Rakuten TV – 1 部高清电影** | 数字内容 | 1 785 |
| **Roblox（数字卡）** | 游戏 / 数字内容 | 6 750 |
| **Microsoft 礼品卡** | 商店 / 服务 | 5 660 |
| **Xbox 礼品卡** | 商店 / 服务 | 5 660 |
| **Microsoft Solitaire Collection 礼品卡** | 游戏 / 数字内容 | 1 500 |
| **Minecraft Minecoins** | 游戏 / 数字内容 | 2 500 |
| **League of Legends 礼品卡** | 游戏 / 数字内容 | 2 000 |
| **Overwatch 硬币代码（数字版）** | 游戏 / 数字内容 | 2 000 |
| **Sea of Thieves – 古硬币包** | 游戏 / 数字内容 | 1 700 |
| **Zalando – 礼品卡** | 商店 / 服务 | 7 205 |
| **Carrefour – 礼品卡** | 商店 / 服务 | 14 410 |
| **Cultura – 礼品卡** | 商店 / 服务 | 14 410 |
| **Fnac‑Darty – 礼品卡** | 商店 / 服务 | 14 410 |
| **La Redoute – 礼品卡** | 商店 / 服务 | 14 410 |
| **Mango – 礼品卡** | 商店 / 服务 | 36 025 |
| **Wonderbox – 礼品卡** | 商店 / 服务 | 14 410 |
| **Yves Rocher – 礼品卡** | 商店 / 服务 | 14 410 |
| **Amazon.fr – 礼品券** | 商店 / 服务 | 7 205 |
| **Foot Locker – 礼品卡** | 商店 / 服务 | 14 410 |
| **IKEA FR – 礼品卡** | 商店 / 服务 | 36 025 |
| **IKEA FR – 礼品卡（其他设计）** | 商店 / 服务 | 7 200 |
| **Marionnaud – 礼品卡** | 商店 / 服务 | 14 410 |
| **Asos – 礼品卡** | 商店 / 服务 | 14 410 |
| **Adidas FR – 礼品卡** | 商店 / 服务 | 14 410 |
| **Deliveroo France – 礼品卡** | 商店 / 服务 | 21 615 |
| **H&M France – 礼品卡** | 商店 / 服务 | 14 410 |
| **Global Hotel Card（Expedia Group）** | 商店 / 服务 | 7 205 |
| **Uber Eats France – 礼品卡** | 商店 / 服务 | 36 025 |

现在你明白这个积分计划的意义了，接下来我们来聊聊机器人。

---

## 初步测试

在构建我的机器人之前，我想确认我是否会因为从同一个 IP 使用数百个账号而被标记。你了解我，我会用 Tor 配合轮换代理。而且我不想把机器人托管在 VPS 上----我想让它运行在 GitHub Action 中。

所以我写了一个简单的工作流：

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

这个工作流只是安装 Tor、启动它，然后通过 Tor 发起一个 curl 请求。

第一次运行的结果：
![Tor curl 第一次运行](assets/20260313_140705_image.png)

时间统计：
!Timings

第二次运行的结果：
![Tor curl 第二次运行](assets/20260313_140928_image.png)

如你所见，IP 地址不同，所以我们不会因为同一 IP 的滥用使用而被标记。这是个好消息----我们可以继续开发刷分机器人的。

---

## 首次使用 Selenium 测试

为了自动化 UI，我将使用 **Selenium**：一个控制真实浏览器（Chrome/Edge/Firefox）而不是用户操作的工具。在 GitHub Action 的环境中，这意味着安装一个浏览器及其驱动程序，然后运行一个脚本登录 Microsoft Rewards 并在需要的地方点击。

### 示例 JavaScript 脚本（Node.js + selenium-webdriver）

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

好的，这意味着我们还没有登录，所以接下来我们要构建登录请求，看看能否登录到我们的 Microsoft Rewards 账户来执行活动。
<!-- ## 本文仍在编写中，我会尽快更新登录步骤和刷活动步骤！敬请期待。 -->
