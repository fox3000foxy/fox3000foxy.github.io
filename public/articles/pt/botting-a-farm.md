---
title: Automatizando uma Farm do Microsoft Rewards
description: Como eu codei um bot para farmar pontos do Microsoft Rewards em grande
  escala — e por que a Microsoft reforçou suas defesas desde então.
date: 2026-03-13
tags:
  - automation
  - javascript
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "eHZmqWLPkN/lz4wnfnr8CCkzq0yFJN/x+AENuIa5uzuWS6FMrZqZABpK4PG99e88Qchd6uKqmrPmPNq0x34TNQ=="
---

> **Nota (2026):** Este projeto não é mais mantido. A Microsoft reforçou consideravelmente sua detecção anti-bot — o que funcionava na época não funciona mais hoje. O código e a abordagem descritos abaixo são mantidos apenas para fins de arquivo e demonstração.

## Introdução

Descobri o Microsoft Rewards alguns anos atrás. Foi durante o lockdown, mas isso não muda o fato de que eu era obrigado a usar o controle parental Microsoft Family Safety e, portanto, a usar o Edge. Foi aí que descobri o Rewards.

Na época eu tinha apenas 14 anos e nada no catálogo me interessava. Agora eu penso que com as habilidades que adquiri, posso farmar pontos com bots, depois dar os códigos ou até mesmo revendê-los mais barato se eu realmente quiser (mas honestamente, acho que não vou fazer isso). Enfim, vou te contar como codei um bot que farma contas em escala.

---

## O que é o Microsoft Rewards?

Resumindo: é um programa que recompensa usuários do Edge com pontos por atividades como pesquisas, quizzes, jogos e uma extensão (mas isso é outra história).

Você vê aqui as coisas "Explore":  
![Explore screenshot](assets/20260313_135010_image.png)

Aqui por exemplo é o que eles chamam de "conjunto do dia".  
![Daily set screenshot](assets/20260313_135038_image.png)

Eles ainda fizeram um sistema de streak, é bem louco.  
![Streak screenshot](assets/20260313_135210_image.png)

Tem também um sistema de nível e é simplesmente muito divertido:  
![Level screenshot](assets/20260313_135340_image.png)

Então você tem várias maneiras de ganhar pontos, e a maioria é diária. A ideia aqui é fazer um bot que realiza as atividades no seu lugar, para farmar pontos em escala e completar sua rotina de farming.

Como você pode ver abaixo, a maioria das recompensas são cartões-presente, mas também tem coisas legais como jogos ou assinaturas.  
![Rewards screenshot](assets/20260313_135646_image.png)

| Recompensa | Categoria | Custo em pontos |
| --- | --- | --- |
| **Rakuten TV – 1 filme HD** | Conteúdo digital | 1 785 |
| **Roblox (cartão digital)** | Jogo / conteúdo digital | 6 750 |
| **Cartão-presente Microsoft** | Loja / serviço | 5 660 |
| **Cartão-presente Xbox** | Loja / serviço | 5 660 |
| **Cartão-presente Microsoft Solitaire Collection** | Jogo / conteúdo digital | 1 500 |
| **Minecraft Minecoins** | Jogo / conteúdo digital | 2 500 |
| **Cartão-presente League of Legends** | Jogo / conteúdo digital | 2 000 |
| **Código Overwatch moedas (digital)** | Jogo / conteúdo digital | 2 000 |
| **Sea of Thieves – Pacote de Moedas Antigas** | Jogo / conteúdo digital | 1 700 |
| **Zalando – Cartão-presente** | Loja / serviço | 7 205 |
| **Carrefour – Cartão-presente** | Loja / serviço | 14 410 |
| **Cultura – Cartão-presente** | Loja / serviço | 14 410 |
| **Fnac‑Darty – Cartão-presente** | Loja / serviço | 14 410 |
| **La Redoute – Cartão-presente** | Loja / serviço | 14 410 |
| **Mango – Cartão-presente** | Loja / serviço | 36 025 |
| **Wonderbox – Cartão-presente** | Loja / serviço | 14 410 |
| **Yves Rocher – Cartão-presente** | Loja / serviço | 14 410 |
| **Amazon.fr – Cheque-presente** | Loja / serviço | 7 205 |
| **Foot Locker – Cartão-presente** | Loja / serviço | 14 410 |
| **IKEA FR – Cartão-presente** | Loja / serviço | 36 025 |
| **IKEA FR – Cartão-presente (outro design)** | Loja / serviço | 7 200 |
| **Marionnaud – Cartão-presente** | Loja / serviço | 14 410 |
| **Asos – Cartão-presente** | Loja / serviço | 14 410 |
| **Adidas FR – Cartão-presente** | Loja / serviço | 14 410 |
| **Deliveroo França – Cartão-presente** | Loja / serviço | 21 615 |
| **H&M França – Cartão-presente** | Loja / serviço | 14 410 |
| **Global Hotel Card (Expedia Group)** | Loja / serviço | 7 205 |
| **Uber Eats França – Cartão-presente** | Loja / serviço | 36 025 |

Agora que você entende o valor do programa, vamos nos concentrar no botting.

---

## Primeiros testes

Antes de construir meu bot, eu queria ter certeza de que meu IP não seria marcado por ter usado centenas de contas do mesmo endereço. Você me conhece, vou usar Tor com um proxy rotativo. E não quero hospedar meu bot em um VPS — quero que ele rode em uma GitHub Action.

Então escrevi um workflow simples:

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

Esse workflow apenas instala o Tor, o inicia e faz uma requisição curl através dele.

A primeira execução deu este resultado:  
![Tor curl first run](assets/20260313_140705_image.png)

As estatísticas de tempo foram:  
!Timings

Uma segunda execução deu este resultado:  
![Tor curl second run](assets/20260313_140928_image.png)

Como você pode ver, os IPs são diferentes, então não seremos sinalizados por uso abusivo do mesmo IP. Boa notícia — podemos continuar desenvolvendo o bot de farming.

---

## Primeiro teste com Selenium

Para automatizar a interface, vou usar **Selenium**: uma ferramenta que controla um navegador real (Chrome/Edge/Firefox) no lugar de um usuário. No contexto de uma GitHub Action, isso significa instalar um navegador + seu driver, depois executar um script que se conecta ao Microsoft Rewards e clica onde for necessário.

### Exemplo de script JavaScript (Node.js + selenium-webdriver)

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

Resultado do script:

```
DevTools listening on ws://127.0.0.1:50274/devtools/browser/37b9ea79-0e5d-4673-9e91-7ffeaf0d37f8
After navigation: url= https://rewards.bing.com/welcome?idru=%2F
After navigation: title= Bem-vindo ao Microsoft Rewards!
Page loaded, sign in button found: Entrar
```

Ok, isso significa que ainda não estamos logados, então agora vamos construir a requisição de login e ver se conseguimos nos conectar à nossa conta do Microsoft Rewards para realizar as atividades.
<!-- ## ESTE ARTIGO AINDA ESTÁ SENDO ESCRITO, EM BREVE ATUALIZAREI COM AS ETAPAS DE CONEXÃO E BOTTING DAS ATIVIDADES! FIQUE ATENTO. -->
