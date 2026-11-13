---
title: Automatizando uma fazenda Microsoft Rewards
description: Como codei um bot para farmar pontos Microsoft Rewards em
  grande escala, e por que a Microsoft reforçou suas defesas desde então.
date: 2026-03-13
tags:
  - automation
  - javascript
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "IRpyI+xJ9iT/jJVkkm0hBThsWJ22PnCfIZYPL9k/GxDEhsoEYpAcS1rLj5kWUyN7OXM6bHp598mzgs/qs7F9IA=="
---

> **Nota (2026) :** Este projeto não é mais mantido. A Microsoft reforçou bastante sua detecção anti-bot, então o que funcionava na época não funciona mais hoje. O código e a abordagem descritos abaixo são mantidos para fins de arquivamento e demonstração apenas.

## Introdução

Descobri o Microsoft Rewards há alguns anos. Foi durante o confinamento, e na época eu era obrigado a usar o controle parental Microsoft Family Safety e portanto passar pelo Edge. Foi aí que descobri o Rewards.

Na época eu tinha só 14 anos e nada no catálogo me interessava. Agora penso que com as habilidades que adquiri, posso farmar pontos com bots, e depois doar os códigos ou até revendê-los mais barato se eu realmente quiser (mas sinceramente, acho que não vou fazer). Vou te contar como codei um bot que farma contas em escala.

---

## O que é o Microsoft Rewards ?

Resumindo : é um programa que recompensa usuários do Edge com pontos por atividades como pesquisas, quizinhos, jogos, e uma extensão (mas isso é outra história).

Você vê aqui os blocos "Explore" :
![Explore screenshot](assets/20260313_135010_image.png)

Aqui por exemplo é o que chamam de "set do dia".
![Daily set screenshot](assets/20260313_135038_image.png)

Eles até fizeram um sistema de streak, é bem louco.
![Streak screenshot](assets/20260313_135210_image.png)

Também há um sistema de nível e a progressão deixa a rotina realmente viciante :
![Level screenshot](assets/20260313_135340_image.png)

Então você tem várias formas de ganhar pontos, e a maioria é diária.
A ideia aqui vai ser fazer um bot que faz as atividades no seu lugar, para farmar pontos em escala e completar sua rotina de farming.

Como você pode ver abaixo, a maioria das recompensas são cartões-presente, mas também há opções interessantes como jogos ou assinaturas.
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
| **Sea of Thieves – Pack Moedas antigas** | Jogo / conteúdo digital | 1 700 |
| **Zalando – Cartão-presente** | Loja / serviço | 7 205 |
| **Carrefour – Cartão-presente** | Loja / serviço | 14 410 |
| **Cultura – Cartão-presente** | Loja / serviço | 14 410 |
| **Fnac‑Darty – Cartão-presente** | Loja / serviço | 14 410 |
| **La Redoute – Cartão-presente** | Loja / serviço | 14 410 |
| **Mango – Cartão-presente** | Loja / serviço | 36 025 |
| **Wonderbox – Cartão-presente** | Loja / serviço | 14 410 |
| **Yves Rocher – Cartão-presente** | Loja / serviço | 14 410 |
| **Amazon.fr – Vale-presente** | Loja / serviço | 7 205 |
| **Foot Locker – Cartão-presente** | Loja / serviço | 14 410 |
| **IKEA FR – Cartão-presente** | Loja / serviço | 36 025 |
| **IKEA FR – Cartão-presente (outro design)** | Loja / serviço | 7 200 |
| **Marionnaud – Cartão-presente** | Loja / serviço | 14 410 |
| **Asos – Cartão-presente** | Loja / serviço | 14 410 |
| **Adidas FR – Cartão-presente** | Loja / serviço | 14 410 |
| **Deliveroo France – Cartão-presente** | Loja / serviço | 21 615 |
| **H&M France – Cartão-presente** | Loja / serviço | 14 410 |
| **Global Hotel Card (Expedia Group)** | Loja / serviço | 7 205 |
| **Uber Eats France – Cartão-presente** | Loja / serviço | 36 025 |

Agora que você entende o interesse do programa, vamos ao botting.

---

## Primeiros testes

Antes de construir meu bot, eu queria ter certeza de que meu IP não seria marcado por usar centenas de contas do mesmo endereço. Você me conhece, passo pelo Tor com um proxy rotativo. Quero rodar em uma GitHub Action em vez de em um VPS.

Então escrevi um workflow simples :

```yaml
# Workflow de teste : instala o Tor e faz um curl através dele
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

Esse workflow só instala o Tor, inicia, e faz uma requisição curl através dele.

O primeiro run deu este resultado :
![Tor curl first run](assets/20260313_140705_image.png)

As estatísticas de tempo foram :
!Timings

Um segundo run deu este resultado :
![Tor curl second run](assets/20260313_140928_image.png)

Como você pode ver, os IPs são diferentes, então evitamos uma marcação por uso abusivo do mesmo IP. Boa notícia : podemos continuar desenvolvendo o bot de farming.

---

## Primeiro teste com Selenium

Para automatizar a interface, vou usar o **Selenium** : uma ferramenta que controla um navegador de verdade (Chrome/Edge/Firefox) no lugar de um usuário. No contexto de uma GitHub Action, isso significa instalar um navegador + seu driver, e depois lançar um script que se conecta ao Microsoft Rewards e clica onde precisa.

### Exemplo de script JavaScript (Node.js + selenium-webdriver)

```js
// Opções do Chrome + anti-detecção de automação via DevTools
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

Resultado do script :

```
DevTools listening on ws://127.0.0.1:50274/devtools/browser/37b9ea79-0e5d-4673-9e91-7ffeaf0d37f8
After navigation: url= https://rewards.bing.com/welcome?idru=%2F
After navigation: title= Bienvenue dans Microsoft Rewards!
Page loaded, sign in button found: Se connecter
```

Esse resultado confirma que ainda estamos desconectados, então agora vou construir a requisição de login e testar a conexão à minha conta Microsoft Rewards para automatizar as atividades.
<!-- ## ESTE ARTIGO AINDA ESTÁ EM REDAÇÃO, VOU ATUALIZAR COM AS ETAPAS DE CONEXÃO E BOTTING DAS ATIVIDADES EM BREVE ! FIQUE LIGADO. -->
