---
title: Microsoft Rewardsファームのボット化
description: Microsoft Rewardsのポイントを大規模に稼ぐボットをコードした方法----そしてMicrosoftのアンチボット検出が追いついた理由。
date: 2026-03-13
authors:
  - fox3000foxy
tags:
  - automation
  - javascript
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "/5tCBlvaRLorzJiO0FwORq3JNXI30GnBH6MXy22JpejDshlC22FuQ68wfk0bBspNbHdJ0L46BzWWoY65jLVqog=="
---

> **Note (2026):** このプロジェクトはもはやメンテナンスされていません。Microsoftはアンチボット検出を大幅に強化しており、当時有効だった手法は現在では機能しません。以下で説明するコードとアプローチは、アーカイブおよび教育目的のみで残されています。

### はじめに

数年前、Microsoft Rewardsを発見した。当時はロックダウン中だったけど、それはともかく、Microsoftファミリーセーフティのペアレンタルコントロールを強制されていて、Edgeを使わざるを得なかったんだ。そこでRewardsを知った。

当時俺は14歳で、カタログのどの商品にも興味がなかった。今では身につけたスキルを使って、ボットでポイントを稼いで、コードを配ったり、本当にしたければ安く転売したりできると思う（自分のことだから、たぶんやらないけど）。とにかく、アカウントを大規模にファームするボットをどうやって作ったか話すよ。

---

## Microsoft Rewardsって何？

簡単に言うと：Edgeユーザーに検索や小クイズ、ゲーム、拡張機能（それはまた別の話）などのアクティビティに対してポイントを与えるプログラムだ。

ここに「Explore」系のものが見える：
![Explore screenshot](assets/20260313_135010_image.png)

例えば、これが「本日のセット」ってやつだ。
![Daily set screenshot](assets/20260313_135038_image.png)

連続ログインのシステムまであって、結構すごい。
![Streak screenshot](assets/20260313_135210_image.png)

レベルシステムもあって、とにかく楽しい：
![Level screenshot](assets/20260313_135340_image.png)

こんな風にポイントを稼ぐ方法がたくさんあって、ほとんどは毎日のものだ。
ここでのアイデアは、アクティビティを代わりにやってくれるボットを作って、ポイントを大規模に稼いで、ファームのルーティンを完了させることだ。

下に見えるように、ほとんどの報酬はギフトカードだけど、ゲームやサービスサブスクリプションみたいな面白いものもある。
![Rewards screenshot](assets/20260313_135646_image.png)

| 報酬 | カテゴリ | 必要ポイント数 |
| --- | --- | --- |
| **Rakuten TV – 1 HD movie** | Digital content | 1 785 |
| **Roblox (digital card)** | Game / digital content | 6 750 |
| **Microsoft gift card** | Store / service | 5 660 |
| **Xbox gift card** | Store / service | 5 660 |
| **Microsoft Solitaire Collection gift card** | Game / digital content | 1 500 |
| **Minecraft Minecoins** | Game / digital content | 2 500 |
| **League of Legends gift card** | Game / digital content | 2 000 |
| **Overwatch coin code (digital)** | Game / digital content | 2 000 |
| **Sea of Thieves – Old Coins pack** | Game / digital content | 1 700 |
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

このプログラムのポイントがわかったところで、ボット化について見ていこう。

---

## 最初のテスト

ボットを作る前に、同じアドレスから何百ものアカウントを使ってもIPがフラグされないことを確認したかったんだ。俺のことだから、Torと回転式プロキシを使う。それにVPSでボットをホストしたくない----GitHub Actionで実行したいんだ。

というわけで、シンプルなワークフローを書いた：

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

このワークフローはTorをインストールして起動し、curlリクエストをTor経由で行うだけだ。

最初の実行結果：
![Tor curl first run](assets/20260313_140705_image.png)

タイムスタッツ：
!Timings

2回目の実行結果：
![Tor curl second run](assets/20260313_140928_image.png)

見ての通りIPが違うから、同一IPからの濫用でフラグされることはない。朗報だ----ファーミングボットの開発を続けられる。

---

## Seleniumを使った最初のテスト

UIを自動化するために**Selenium**を使う：ユーザーの代わりに実際のブラウザ（Chrome/Edge/Firefox）を制御するツールだ。GitHub Actionの文脈では、ブラウザとそのドライバーをインストールし、Microsoft Rewardsにログインしてクリックするスクリプトを実行する。

### JavaScriptのサンプルスクリプト（Node.js + selenium-webdriver）

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
  // ページJS実行前にスクリプトを注入し、自動化のフィンガープリンティングを軽減する。
  await (driver as any).sendDevToolsCommand('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });

      // 一部のサイトはchromeランタイムとプラグインをチェックする
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

スクリプトの結果：

```
DevTools listening on ws://127.0.0.1:50274/devtools/browser/37b9ea79-0e5d-4673-9e91-7ffeaf0d37f8
After navigation: url= https://rewards.bing.com/welcome?idru=%2F
After navigation: title= Bienvenue dans Microsoft Rewards!
Page loaded, sign in button found: Se connecter
```

よし、まだログインしてないってことだ。次はログインリクエストを作って、Microsoft Rewardsアカウントにサインインしてアクティビティを実行できるか試してみよう。
<!-- ## この記事はまだ作成中です。ログイン手順とアクティビティのボット化手順は後日更新します！お楽しみに。 -->
