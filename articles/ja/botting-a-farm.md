---
title: Microsoft Rewardsのファームをボット化する
description: Microsoft Rewardsのポイントを大規模にファームするボットをどうコーディングしたか。そしてMicrosoftがその後防御をどう固めたか。
date: 2026-03-13
tags:
  - automation
  - javascript
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "WijdIf1gJg5r2TiKfW79j4gz63N/XlqRMT7UdzYPEClfEnsgcXJahEZq0qCAsu5T2jfwSa0Gyu0lOXh/Q497ng=="
---

> **注意（2026年）：** このプロジェクトはもう保守してない。Microsoftはボット対策の検出を大幅に強化したので、当時動いたものは今はもう動かない。以下のコードと手法はアーカイブとデモ目的でのみ残してある。

## はじめに

Microsoft Rewardsを知ったのは数年前だ。ロックダウン期間中で、当時はMicrosoft Family Safetyのペアレンタルコントロールを使う義務があってEdge経由だった。そこでRewardsに出会った。

当時は14歳だけでカタログに欲しいものは何もなかった。今思うと、身に付けたスキルでポイントをファームするボットを作って、コードを配ったり、気が向けば安く売ったりもできる（でも正直やる気はない）。複数アカウントを規模化してファームするボットをどうコーディングしたか話すよ。

---

## Microsoft Rewardsって何？

手短に言うと、Edgeユーザーが検索とか小クイズとかゲームとか拡張機能（でもそれは別の話）みたいな活動でポイントをもらえるプログラムだ。

ここに見える「Explore」ブロックがそれだ。
![Explore screenshot](assets/20260313_135010_image.png)

たとえばここにあるのが「今日のセット」って呼ばれるものだ。
![Daily set screenshot](assets/20260313_135038_image.png)

streakの仕組みまで作ってて、なかなかすごい。
![Streak screenshot](assets/20260313_135210_image.png)

レベル制度もあって、進捗がルーティンをほんと中毒性のあるものにしてる。
![Level screenshot](assets/20260313_135340_image.png)

ポイント稼ぎ方はたくさんあって、ほとんどが毎日できる。
ここでの狙いは、代わりに活動をこなすボットを作って、大規模にポイントをファームしてファーミングルーティンを完成させることだ。

下で見える通り、報酬のほとんどはギフトカードだけど、ゲームやサブスクみたいな面白い選択肢もある。
![Rewards screenshot](assets/20260313_135646_image.png)

| 報酬 | カテゴリ | ポイント |
| --- | --- | --- |
| **Rakuten TV – HD映画1本** | デジタルコンテンツ | 1 785 |
| **Roblox（デジタルカード）** | ゲーム / デジタルコンテンツ | 6 750 |
| **Microsoftギフトカード** | ストア / サービス | 5 660 |
| **Xboxギフトカード** | ストア / サービス | 5 660 |
| **Microsoft Solitaire Collectionギフトカード** | ゲーム / デジタルコンテンツ | 1 500 |
| **Minecraft Minecoins** | ゲーム / デジタルコンテンツ | 2 500 |
| **League of Legendsギフトカード** | ゲーム / デジタルコンテンツ | 2 000 |
| **Overwatchコインコード（デジタル）** | ゲーム / デジタルコンテンツ | 2 000 |
| **Sea of Thieves – Ancient Coinsパック** | ゲーム / デジタルコンテンツ | 1 700 |
| **Zalando – ギフトカード** | ストア / サービス | 7 205 |
| **Carrefour – ギフトカード** | ストア / サービス | 14 410 |
| **Cultura – ギフトカード** | ストア / サービス | 14 410 |
| **Fnac‑Darty – ギフトカード** | ストア / サービス | 14 410 |
| **La Redoute – ギフトカード** | ストア / サービス | 14 410 |
| **Mango – ギフトカード** | ストア / サービス | 36 025 |
| **Wonderbox – ギフトカード** | ストア / サービス | 14 410 |
| **Yves Rocher – ギフトカード** | ストア / サービス | 14 410 |
| **Amazon.fr – ギフト券** | ストア / サービス | 7 205 |
| **Foot Locker – ギフトカード** | ストア / サービス | 14 410 |
| **IKEA FR – ギフトカード** | ストア / サービス | 36 025 |
| **IKEA FR – ギフトカード（別デザイン）** | ストア / サービス | 7 200 |
| **Marionnaud – ギフトカード** | ストア / サービス | 14 410 |
| **Asos – ギフトカード** | ストア / サービス | 14 410 |
| **Adidas FR – ギフトカード** | ストア / サービス | 14 410 |
| **Deliveroo France – ギフトカード** | ストア / サービス | 21 615 |
| **H&M France – ギフトカード** | ストア / サービス | 14 410 |
| **Global Hotel Card (Expedia Group)** | ストア / サービス | 7 205 |
| **Uber Eats France – ギフトカード** | ストア / サービス | 36 025 |

プログラムの旨みが分かったところで、ボット化の話に入ろう。

---

## 最初のテスト

ボットを作る前に、同じアドレスから何百ものアカウントを使ったせいでIPに印を付けられないか確かめたかった。私らしくTor経由でローテートするプロキシを使う。VPSじゃなくGitHub Actionで実行したい。

だからシンプルなワークフローを書いた。

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

このワークフローはTorを入れて起動して、経由でcurlリクエストを投げるだけだ。

最初のrunはこうなった。
![Tor curl first run](assets/20260313_140705_image.png)

時間 stats はこうだった。
!Timings

2回目のrunはこうなった。
![Tor curl second run](assets/20260313_140928_image.png)

見ての通りIPが違う。だから同じIPからの乱用で印を付けられる心配はない。いい知らせだ。ファーミングボットの開発を続けられる。

---

## Seleniumでの初テスト

画面を自動化するため**Selenium**を使う。ユーザーの代わりに本物のブラウザ（ChromeやEdgeやFirefox）を操作するツールだ。GitHub Actionの文脈では、ブラウザとドライバーを入れて、Microsoft Rewardsにログインしてしかるべき場所をクリックするスクリプトを走らせるってことだ。

### JavaScriptスクリプト例（Node.js + selenium-webdriver）

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
  // ページのJSが動く前に注入して自動化の指紋を減らす。
  await (driver as any).sendDevToolsCommand('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });

      // chromeランタイムやプラグインを見るサイトもある
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

この結果でまだログアウト状態なのが確認できた。だから次はログインリクエストを作って、Microsoft Rewardsアカウントへの接続をテストして、活動のボット化へ進む。
<!-- ## この記事はまだ執筆中です。ログインと活動ボット化の手順は近日追記します！お楽しみに。 -->
