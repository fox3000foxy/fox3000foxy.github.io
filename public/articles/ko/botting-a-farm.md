---
title: Microsoft Rewards 팜 봇 만들기
description: 대규모로 Microsoft Rewards 포인트를 농사짓는 봇을 코딩한 방법 -- 그리고 Microsoft의 안티봇 탐지가 따라잡은 이유
date: 2026-03-13
tags:
  - automation
  - javascript
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "424y2wUCNsVi+4iinG5HQo1Jwy5ArBiYUwxlKcjqOvWdF9xGi46qLgfIvSVea1nonXIrtmr9qW0MVVWrC7vwUg=="
---

> **참고 (2026년):** 이 프로젝트는 더 이상 유지보수되지 않습니다. Microsoft가 안티봇 탐지를 크게 강화해서 -- 예전에 통했던 방법이 지금은 더 이상 작동하지 않습니다. 아래 설명된 코드와 접근 방식은 기록/교육 목적으로만 보관됩니다.

### 소개

몇 년 전에 Microsoft Rewards를 발견했어. 그때는 락다운 기간이었는데, 그렇다고 해서 Microsoft Family Safety 자녀 보호 기능을 강제로 사용해야 했고 결과적으로 Edge를 써야 했던 건 변함없어. 그때 Rewards를 발견했지.

그 당시 나는 겨우 14살이었고 카탈로그에 있는 어떤 것도 관심이 없었어. 이제는 내가 습득한 기술로 봇으로 포인트를 농사지은 다음, 코드를 나눠주거나 내가 정말 원한다면 더 싸게 재판매할 수도 있겠다고 생각했어 (나 자신을 알지만, 아마 안 할 거야). 어쨌든, 계정을 대규모로 농사짓는 봇을 어떻게 코딩했는지 알려줄게.

---

## Microsoft Rewards가 뭔가요?

간단히 말하면: 검색, 작은 퀴즈, 게임, 확장 프로그램(그건 또 다른 이야기야) 같은 활동에 대해 Edge 사용자에게 포인트를 보상하는 프로그램이야.

여기 "Explore" 항목들이 보여:
![Explore 스크린샷](assets/20260313_135010_image.png)

예를 들어 이것들이 "set of the day"라고 불리는 거야.
![Daily set 스크린샷](assets/20260313_135038_image.png)

스트릭 시스템도 만들었는데, 꽤 정신없어.
![Streak 스크린샷](assets/20260313_135210_image.png)

레벨 시스템도 있고 완전 재미있어:
![Level 스크린샷](assets/20260313_135340_image.png)

포인트를 얻을 수 있는 방법이 엄청 많고, 대부분 매일 할 수 있어.
여기서 할 건 활동을 대신 해주는 봇을 만들어서, 대규모로 포인트를 농사짓고 일과를 완료하는 거야.

아래에서 볼 수 있듯이, 대부분의 보상은 기프트 카드지만 게임이나 서비스 구독 같은 재미있는 것들도 있어.
![Rewards 스크린샷](assets/20260313_135646_image.png)

| 보상 | 카테고리 | 필요 포인트 |
| --- | --- | --- |
| **Rakuten TV – HD 영화 1편** | 디지털 콘텐츠 | 1,785 |
| **Roblox (디지털 카드)** | 게임 / 디지털 콘텐츠 | 6,750 |
| **Microsoft 기프트 카드** | 스토어 / 서비스 | 5,660 |
| **Xbox 기프트 카드** | 스토어 / 서비스 | 5,660 |
| **Microsoft Solitaire Collection 기프트 카드** | 게임 / 디지털 콘텐츠 | 1,500 |
| **Minecraft Minecoins** | 게임 / 디지털 콘텐츠 | 2,500 |
| **League of Legends 기프트 카드** | 게임 / 디지털 콘텐츠 | 2,000 |
| **Overwatch 코인 코드 (디지털)** | 게임 / 디지털 콘텐츠 | 2,000 |
| **Sea of Thieves – Old Coins 팩** | 게임 / 디지털 콘텐츠 | 1,700 |
| **Zalando – 기프트 카드** | 스토어 / 서비스 | 7,205 |
| **Carrefour – 기프트 카드** | 스토어 / 서비스 | 14,410 |
| **Cultura – 기프트 카드** | 스토어 / 서비스 | 14,410 |
| **Fnac‑Darty – 기프트 카드** | 스토어 / 서비스 | 14,410 |
| **La Redoute – 기프트 카드** | 스토어 / 서비스 | 14,410 |
| **Mango – 기프트 카드** | 스토어 / 서비스 | 36,025 |
| **Wonderbox – 기프트 카드** | 스토어 / 서비스 | 14,410 |
| **Yves Rocher – 기프트 카드** | 스토어 / 서비스 | 14,410 |
| **Amazon.fr – 기프트 바우처** | 스토어 / 서비스 | 7,205 |
| **Foot Locker – 기프트 카드** | 스토어 / 서비스 | 14,410 |
| **IKEA FR – 기프트 카드** | 스토어 / 서비스 | 36,025 |
| **IKEA FR – 기프트 카드 (다른 디자인)** | 스토어 / 서비스 | 7,200 |
| **Marionnaud – 기프트 카드** | 스토어 / 서비스 | 14,410 |
| **Asos – 기프트 카드** | 스토어 / 서비스 | 14,410 |
| **Adidas FR – 기프트 카드** | 스토어 / 서비스 | 14,410 |
| **Deliveroo France – 기프트 카드** | 스토어 / 서비스 | 21,615 |
| **H&M France – 기프트 카드** | 스토어 / 서비스 | 14,410 |
| **Global Hotel Card (Expedia Group)** | 스토어 / 서비스 | 7,205 |
| **Uber Eats France – 기프트 카드** | 스토어 / 서비스 | 36,025 |

이제 이 프로그램의 요점을 이해했으니, 봇팅에 대해 알아보자.

---

## 첫 번째 테스트

봇을 만들기 전에, 같은 주소에서 수백 개의 계정을 사용해도 IP가 차단되지 않는지 확인하고 싶었어. 알다시피, 나는 Tor와 순환 프록시를 사용할 거야. 그리고 VPS에 봇을 호스팅하고 싶지 않아 -- GitHub Action에서 실행되길 원해.

그래서 간단한 워크플로우를 작성했어:

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

이 워크플로우는 Tor를 설치하고 시작한 다음, Tor를 통해 curl 요청을 보내.

첫 번째 실행 결과:
![Tor curl 첫 실행](assets/20260313_140705_image.png)

시간 통계:
!Timings

두 번째 실행 결과:
![Tor curl 두 번째 실행](assets/20260313_140928_image.png)

보시다시피 IP가 달라서, 같은 IP에서 남용으로 플래그되지 않을 거야. 좋은 소식이야--농사 봇 개발을 계속할 수 있어.

---

## Selenium 첫 번째 테스트

UI를 자동화하기 위해 **Selenium**을 사용할 거야: 사용자 대신 실제 브라우저(Chrome/Edge/Firefox)를 제어하는 도구지. GitHub Action 맥락에서, 이건 브라우저 + 드라이버를 설치한 다음, Microsoft Rewards에 로그인해서 필요한 곳을 클릭하는 스크립트를 실행하는 걸 의미해.

### 예제 JavaScript 스크립트 (Node.js + selenium-webdriver)

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

스크립트 실행 결과:

```
DevTools listening on ws://127.0.0.1:50274/devtools/browser/37b9ea79-0e5d-4673-9e91-7ffeaf0d37f8
After navigation: url= https://rewards.bing.com/welcome?idru=%2F
After navigation: title= Bienvenue dans Microsoft Rewards!
Page loaded, sign in button found: Se connecter
```

좋아, 아직 로그인되지 않았다는 뜻이니까, 이제 로그인 요청을 만들어서 Microsoft Rewards 계정에 로그인할 수 있는지 확인해보자.
<!-- ## 이 글은 아직 작업 중입니다. 곧 로그인 단계와 활동 봇팅 단계로 업데이트하겠습니다! 계속 지켜봐 주세요. -->
