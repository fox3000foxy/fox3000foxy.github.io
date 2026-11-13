---
title: Botear una granja de Microsoft Rewards
description: Cómo programé un bot para farmear puntos de Microsoft Rewards a
  gran escala, y por qué Microsoft reforzó desde entonces sus defensas.
date: 2026-03-13
tags:
  - automation
  - javascript
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "bVeuMiF0bzMnKEocylNuLm9OC7tF8ur9Vgc7od7Sae9X9oZ4gudnVg8Elq7S36gjUcC4yFjR8NkwL4zxGpj/lA=="
---

> **Nota (2026):** Este proyecto ya no se mantiene. Microsoft reforzó considerablemente su detección antibots, así que lo que funcionaba en la época ya no funciona hoy. El código y el enfoque descritos abajo se conservan solo con fines de archivo y demostración.

## Introducción

Descubrí Microsoft Rewards hace unos años. Fue durante el confinamiento, y en la época estaba obligado a usar el control parental Microsoft Family Safety y por tanto pasar por Edge. Ahí descubrí Rewards.

En la época solo tenía 14 años y nada del catálogo me interesaba. Ahora me digo que con las habilidades que adquirí, puedo farmear puntos con bots, y luego regalar los códigos o incluso revenderlos más baratos si de verdad me apetece (pero honestamente, creo que no lo haré). Te voy a contar cómo programé un bot que farmea cuentas a escala.

---

## Qué es Microsoft Rewards

Para abreviar: es un programa que recompensa a los usuarios de Edge con puntos por actividades como búsquedas, pequeños quizzes, juegos, y una extensión (pero eso es otra historia).

Aquí ves los bloques "Explore":
![Explore screenshot](assets/20260313_135010_image.png)

Ahí por ejemplo está lo que llaman el "set del día".
![Daily set screenshot](assets/20260313_135038_image.png)

Hasta hicieron un sistema de racha, es bastante loco.
![Streak screenshot](assets/20260313_135210_image.png)

También hay un sistema de nivel y la progresión hace la rutina de verdad adictiva:
![Level screenshot](assets/20260313_135340_image.png)

Así que tienes un montón de formas de ganar puntos, y la mayoría son diarias.
La idea aquí va a ser hacer un bot que haga las actividades en tu lugar, para farmear puntos a escala y completar tu rutina de farmeo.

Como puedes ver abajo, la mayoría de las recompensas son tarjetas regalo, pero también hay opciones interesantes como juegos o suscripciones.
![Rewards screenshot](assets/20260313_135646_image.png)

| Recompensa | Categoría | Coste en puntos |
| --- | --- | --- |
| **Rakuten TV: 1 peli HD** | Contenido digital | 1 785 |
| **Roblox (tarjeta digital)** | Juego / contenido digital | 6 750 |
| **Tarjeta regalo Microsoft** | Tienda / servicio | 5 660 |
| **Tarjeta regalo Xbox** | Tienda / servicio | 5 660 |
| **Tarjeta regalo Microsoft Solitaire Collection** | Juego / contenido digital | 1 500 |
| **Minecraft Minecoins** | Juego / contenido digital | 2 500 |
| **Tarjeta regalo League of Legends** | Juego / contenido digital | 2 000 |
| **Código Overwatch monedas (digital)** | Juego / contenido digital | 2 000 |
| **Sea of Thieves: Pack Monedas antiguas** | Juego / contenido digital | 1 700 |
| **Zalando: Tarjeta regalo** | Tienda / servicio | 7 205 |
| **Carrefour: Tarjeta regalo** | Tienda / servicio | 14 410 |
| **Cultura: Tarjeta regalo** | Tienda / servicio | 14 410 |
| **Fnac‑Darty: Tarjeta regalo** | Tienda / servicio | 14 410 |
| **La Redoute: Tarjeta regalo** | Tienda / servicio | 14 410 |
| **Mango: Tarjeta regalo** | Tienda / servicio | 36 025 |
| **Wonderbox: Tarjeta regalo** | Tienda / servicio | 14 410 |
| **Yves Rocher: Tarjeta regalo** | Tienda / servicio | 14 410 |
| **Amazon.fr: Cheque regalo** | Tienda / servicio | 7 205 |
| **Foot Locker: Tarjeta regalo** | Tienda / servicio | 14 410 |
| **IKEA FR: Tarjeta regalo** | Tienda / servicio | 36 025 |
| **IKEA FR: Tarjeta regalo (otro diseño)** | Tienda / servicio | 7 200 |
| **Marionnaud: Tarjeta regalo** | Tienda / servicio | 14 410 |
| **Asos: Tarjeta regalo** | Tienda / servicio | 14 410 |
| **Adidas FR: Tarjeta regalo** | Tienda / servicio | 14 410 |
| **Deliveroo France: Tarjeta regalo** | Tienda / servicio | 21 615 |
| **H&M France: Tarjeta regalo** | Tienda / servicio | 14 410 |
| **Global Hotel Card (Expedia Group)** | Tienda / servicio | 7 205 |
| **Uber Eats France: Tarjeta regalo** | Tienda / servicio | 36 025 |

Ahora que entiendes el interés del programa, pasemos al botting.

---

## Primeras pruebas

Antes de construir mi bot, quería estar seguro de que mi IP no quedaría marcada por usar cientos de cuentas desde la misma dirección. Ya me conoces, paso por Tor con un proxy rotativo. Quiero ejecutarlo en una GitHub Action en vez de en un VPS.

Así que escribí un workflow simple:

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

Este workflow solo instala Tor, lo arranca, y hace una petición curl a través de él.

El primer run dio este resultado:
![Tor curl first run](assets/20260313_140705_image.png)

Las estadísticas de tiempo fueron:
!Timings

Un segundo run dio este resultado:
![Tor curl second run](assets/20260313_140928_image.png)

Como puedes ver, las IP son distintas, así que evitamos un marcado por uso abusivo desde la misma IP. Buena noticia: podemos seguir desarrollando el bot de farmeo.

---

## Primera prueba con Selenium

Para automatizar la interfaz, voy a usar **Selenium**: una herramienta que controla un navegador real (Chrome/Edge/Firefox) en lugar de un usuario. En el contexto de una GitHub Action, eso significa instalar un navegador + su driver, y luego lanzar un script que inicia sesión en Microsoft Rewards y hace clic donde toca.

### Ejemplo de script JavaScript (Node.js + selenium-webdriver)

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
  // Inyecta el script antes de que corra cualquier JS de la página para reducir la huella de automatización.
  await (driver as any).sendDevToolsCommand('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });

      // Algunos sitios comprueban el runtime de chrome y los plugins
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

Resultado del script:

```
DevTools listening on ws://127.0.0.1:50274/devtools/browser/37b9ea79-0e5d-4673-9e91-7ffeaf0d37f8
After navigation: url= https://rewards.bing.com/welcome?idru=%2F
After navigation: title= Bienvenue dans Microsoft Rewards!
Page loaded, sign in button found: Se connecter
```

Este resultado confirma que seguimos desconectados, así que ahora voy a construir la petición de login y probar la conexión a mi cuenta de Microsoft Rewards para automatizar las actividades.
<!-- ## ESTE ARTÍCULO AÚN ESTÁ EN REDACCIÓN, ¡ACTUALIZARÉ CON LOS PASOS DE CONEXIÓN Y BOTTEO DE ACTIVIDADES PRONTO! SIGUE ATENTO. -->
