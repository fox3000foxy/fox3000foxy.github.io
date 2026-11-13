---
title: Microsoft Rewards 팜 봇 만들기
description: Microsoft Rewards 포인트를 대규모로 모으는 봇을 코딩한 방법, 그리고 Microsoft가 그 이후 방어를 강화한 이유.
date: 2026-03-13
tags:
  - automation
  - javascript
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "M1tJda+SkcFNoBuLJg8kKJH0v8cs5WI0R5yMSrn5UJhZ5hCmkZKkPk3Eu7sgKWwSFIgH8rgFAtONACyGmFKdeA=="
---

> **참고 (2026년):** 이 프로젝트는 더 이상 유지보수되지 않아요. Microsoft가 안티봇 탐지를 크게 강화해서, 당시 통하던 방법이 오늘날에는 더 이상 통하지 않아요. 아래에 설명된 코드와 접근 방식은 기록과 시연 목적으로만 보존해요.

## 소개

Microsoft Rewards를 몇 년 전에 발견했어요. 봉쇄 기간이었고, 당시에는 Microsoft Family Safety 자녀 보호를 써야 해서 Edge를 거쳐야 했어요. 거기에서 Rewards를 발견했어요.

당시 저는 14살이었고 카탈로그에 관심 가는 것이 아무것도 없었어요. 이제는 쌓은 실력으로 봇으로 포인트를 모은 뒤 코드를 나누어 주거나, 정말 원한다면 싸게 되팔 수도 있겠다고 생각해요. 하지만 솔직히, 할 것 같지는 않아요. 규모 있게 계정을 돌리는 봇을 어떻게 코딩했는지 이야기해 드릴게요.

---

## Microsoft Rewards가 뭔가요?

간단히 말하면, 검색이나 작은 퀴즈, 게임, 확장 프로그램 같은 활동에 Edge 사용자에게 포인트를 주는 프로그램이에요. 하지만 확장 프로그램 이야기는 다른 이야기예요.

여기에 "탐색" 블록이 보여요.
![Explore screenshot](assets/20260313_135010_image.png)

예를 들어 여기 있는 것이 그들이 말하는 "오늘의 세트"예요.
![Daily set screenshot](assets/20260313_135038_image.png)

연속 기록 시스템까지 만들었는데, 꽤 대단해요.
![Streak screenshot](assets/20260313_135210_image.png)

레벨 시스템도 있고, 진행 과정이 루틴을 정말 중독적으로 만들어요.
![Level screenshot](assets/20260313_135340_image.png)

그래서 포인트를 얻는 방법이 정말 많고, 대부분 매일 할 수 있어요.
여기서의 아이디어는 활동을 대신해 주는 봇을 만들어서, 대규모로 포인트를 모으고 파밍 루틴을 완성하는 거예요.

아래에서 보시듯, 보상의 대부분은 기프트카드지만 게임이나 구독 같은 흥미로운 선택지도 있어요.
![Rewards screenshot](assets/20260313_135646_image.png)

| 보상 | 카테고리 | 포인트 비용 |
| --- | --- | --- |
| **Rakuten TV – HD 영화 1편** | 디지털 콘텐츠 | 1 785 |
| **Roblox (디지털 카드)** | 게임 / 디지털 콘텐츠 | 6 750 |
| **Microsoft 기프트카드** | 스토어 / 서비스 | 5 660 |
| **Xbox 기프트카드** | 스토어 / 서비스 | 5 660 |
| **Microsoft Solitaire Collection 기프트카드** | 게임 / 디지털 콘텐츠 | 1 500 |
| **Minecraft Minecoins** | 게임 / 디지털 콘텐츠 | 2 500 |
| **League of Legends 기프트카드** | 게임 / 디지털 콘텐츠 | 2 000 |
| **Overwatch 코인 코드 (디지털)** | 게임 / 디지털 콘텐츠 | 2 000 |
| **Sea of Thieves – 고대 코인 팩** | 게임 / 디지털 콘텐츠 | 1 700 |
| **Zalando – 기프트카드** | 스토어 / 서비스 | 7 205 |
| **Carrefour – 기프트카드** | 스토어 / 서비스 | 14 410 |
| **Cultura – 기프트카드** | 스토어 / 서비스 | 14 410 |
| **Fnac‑Darty – 기프트카드** | 스토어 / 서비스 | 14 410 |
| **La Redoute – 기프트카드** | 스토어 / 서비스 | 14 410 |
| **Mango – 기프트카드** | 스토어 / 서비스 | 36 025 |
| **Wonderbox – 기프트카드** | 스토어 / 서비스 | 14 410 |
| **Yves Rocher – 기프트카드** | 스토어 / 서비스 | 14 410 |
| **Amazon.fr – 기프트카드** | 스토어 / 서비스 | 7 205 |
| **Foot Locker – 기프트카드** | 스토어 / 서비스 | 14 410 |
| **IKEA FR – 기프트카드** | 스토어 / 서비스 | 36 025 |
| **IKEA FR – 기프트카드 (다른 디자인)** | 스토어 / 서비스 | 7 200 |
| **Marionnaud – 기프트카드** | 스토어 / 서비스 | 14 410 |
| **Asos – 기프트카드** | 스토어 / 서비스 | 14 410 |
| **Adidas FR – 기프트카드** | 스토어 / 서비스 | 14 410 |
| **Deliveroo France – 기프트카드** | 스토어 / 서비스 | 21 615 |
| **H&M France – 기프트카드** | 스토어 / 서비스 | 14 410 |
| **Global Hotel Card (Expedia Group)** | 스토어 / 서비스 | 7 205 |
| **Uber Eats France – 기프트카드** | 스토어 / 서비스 | 36 025 |

이제 프로그램의 매력을 이해하셨으니, 보팅 이야기를 시작해요.

---

## 첫 테스트

봇을 만들기 전에, 같은 주소에서 수백 개 계정을 사용했다고 제 IP가 표시되지 않을지 확인하고 싶었어요. 아시다시피 저는 회전 프록시와 함께 Tor를 거쳐요. VPS 대신 GitHub Action에서 실행하고 싶어요.

그래서 간단한 워크플로를 작성했어요.

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

이 워크플로는 Tor를 설치하고 시작해서, 그것을 통해 curl 요청을 보낼 뿐이에요.

첫 실행 결과는 이렇습니다.
![Tor curl first run](assets/20260313_140705_image.png)

시간 통계는 다음과 같았어요.
!Timings

두 번째 실행 결과는 다음과 같았어요.
![Tor curl second run](assets/20260313_140928_image.png)

보시다시피 IP가 서로 다르니, 같은 IP에서의 남용으로 표시되는 것을 피할 수 있어요. 좋은 소식이에요. 파밍 봇 개발을 계속할 수 있어요.

---

## Selenium으로 첫 테스트

인터페이스를 자동화하기 위해 **Selenium**을 사용할 거예요. 사용자를 대신해 진짜 브라우저(Chrome, Edge, Firefox)를 조종하는 도구예요. GitHub Action 맥락에서는 브라우저와 드라이버를 설치한 뒤, Microsoft Rewards에 로그인해서 필요한 곳을 클릭하는 스크립트를 실행한다는 뜻이에요.

### JavaScript 스크립트 예시 (Node.js + selenium-webdriver)

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
  // 자동화 지문 탐지를 줄이기 위해 페이지 JS가 실행되기 전에 스크립트를 주입해요.
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

스크립트 결과:

```
DevTools listening on ws://127.0.0.1:50274/devtools/browser/37b9ea79-0e5d-4673-9e91-7ffeaf0d37f8
After navigation: url= https://rewards.bing.com/welcome?idru=%2F
After navigation: title= Bienvenue dans Microsoft Rewards!
Page loaded, sign in button found: Se connecter
```

이 결과는 아직 로그아웃 상태임을 확인해 줘요. 이제 로그인 요청을 만들어서 제 Microsoft Rewards 계정에 접속하는 것을 테스트하고, 활동을 자동화할 거예요.
<!-- ## CET ARTICLE EST ENCORE EN COURS DE RÉDACTION, JE METTRAI À JOUR AVEC LES ÉTAPES DE CONNEXION ET DE BOTTING DES ACTIVITÉS BIENTÔT ! RESTE À L'ÉCOUTE. -->
