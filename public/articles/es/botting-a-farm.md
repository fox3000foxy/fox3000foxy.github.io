---
title: Automatizando una Granja de Microsoft Rewards
description: Cómo programé un bot para cultivar puntos de Microsoft Rewards a
  escala -- y por qué la detección antibots de Microsoft ya se ha puesto al día.
date: 2026-03-13
authors:
  - fox3000foxy
tags:
  - automation
  - javascript
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "jlotIjFNlZa9OImFO8FeUF9+ZJrMHCtFbSCajXUJBo2fbmUrNONPw2IKA9CqclrEivjyQKoVAuGgoZeKa/2AJQ=="
---

> **Nota (2026):** Este proyecto ya no tiene mantenimiento. Microsoft ha endurecido significativamente su detección de bots -- lo que funcionaba antes ya no funciona hoy. El código y el enfoque descritos a continuación se conservan solo con fines educativos/de archivo.

### Introducción

Hace algunos años descubrí Microsoft Rewards. En ese entonces era durante el confinamiento, pero eso no cambia el hecho de que me obligaron a usar los controles parentales de Microsoft Family Safety y por lo tanto tuve que usar Edge. Fue ahí cuando descubrí Rewards.

En ese momento solo tenía 14 años y nada del catálogo me interesaba. Ahora pienso que con las habilidades que he adquirido, puedo generar puntos con bots y luego regalar los códigos o incluso revenderlos más baratos si realmente quiero (conociéndome, probablemente no lo haré). De todas formas, te contaré cómo programé un bot que cultiva cuentas a escala.

---

## ¿Qué es Microsoft Rewards?

En pocas palabras: es un programa que recompensa a los usuarios de Edge con puntos por actividades como búsquedas, pequeños cuestionarios, juegos y una extensión (esa es otra historia).

Aquí puedes ver cosas de «Explorar»:  
![Captura de Explore](assets/20260313_135010_image.png)

Aquí, por ejemplo, lo que llaman el «set del día».  
![Captura del set diario](assets/20260313_135038_image.png)

Incluso crearon un sistema de rachas, es bastante loco.  
![Captura de rachas](assets/20260313_135210_image.png)

También hay un sistema de niveles y es simplemente divertido:  
![Captura de niveles](assets/20260313_135340_image.png)

Así que tienes montones de formas de ganar puntos, y la mayoría son diarias.  
La idea aquí va a ser hacer un bot que haga las actividades por ti, para que puedas generar puntos a escala y completar tu rutina de cultivo.

Como puedes ver abajo, la mayoría de las recompensas son tarjetas de regalo, pero también hay cosas divertidas como juegos o suscripciones a servicios.  
![Captura de recompensas](assets/20260313_135646_image.png)

| Recompensa | Categoría | Costo en puntos |
| --- | --- | --- |
| **Rakuten TV – 1 película HD** | Contenido digital | 1 785 |
| **Roblox (tarjeta digital)** | Juego / contenido digital | 6 750 |
| **Tarjeta regalo Microsoft** | Tienda / servicio | 5 660 |
| **Tarjeta regalo Xbox** | Tienda / servicio | 5 660 |
| **Tarjeta regalo Microsoft Solitaire Collection** | Juego / contenido digital | 1 500 |
| **Minecraft Minecoins** | Juego / contenido digital | 2 500 |
| **Tarjeta regalo League of Legends** | Juego / contenido digital | 2 000 |
| **Código de monedas Overwatch (digital)** | Juego / contenido digital | 2 000 |
| **Sea of Thieves – Paquete de Monedas Antiguas** | Juego / contenido digital | 1 700 |
| **Zalando – Tarjeta regalo** | Tienda / servicio | 7 205 |
| **Carrefour – Tarjeta regalo** | Tienda / servicio | 14 410 |
| **Cultura – Tarjeta regalo** | Tienda / servicio | 14 410 |
| **Fnac‑Darty – Tarjeta regalo** | Tienda / servicio | 14 410 |
| **La Redoute – Tarjeta regalo** | Tienda / servicio | 14 410 |
| **Mango – Tarjeta regalo** | Tienda / servicio | 36 025 |
| **Wonderbox – Tarjeta regalo** | Tienda / servicio | 14 410 |
| **Yves Rocher – Tarjeta regalo** | Tienda / servicio | 14 410 |
| **Amazon.fr – Vales regalo** | Tienda / servicio | 7 205 |
| **Foot Locker – Tarjeta regalo** | Tienda / servicio | 14 410 |
| **IKEA FR – Tarjeta regalo** | Tienda / servicio | 36 025 |
| **IKEA FR – Tarjeta regalo (otro diseño)** | Tienda / servicio | 7 200 |
| **Marionnaud – Tarjeta regalo** | Tienda / servicio | 14 410 |
| **Asos – Tarjeta regalo** | Tienda / servicio | 14 410 |
| **Adidas FR – Tarjeta regalo** | Tienda / servicio | 14 410 |
| **Deliveroo France – Tarjeta regalo** | Tienda / servicio | 21 615 |
| **H&M France – Tarjeta regalo** | Tienda / servicio | 14 410 |
| **Global Hotel Card (Expedia Group)** | Tienda / servicio | 7 205 |
| **Uber Eats France – Tarjeta regalo** | Tienda / servicio | 36 025 |

Ahora que entiendes el propósito de este programa, pasemos al botting.

---

## Primeras pruebas

Antes de construir mi bot, quería asegurarme de que no me marcarían la IP por usar cientos de cuentas desde la misma dirección. Me conoces, voy a usar Tor con un proxy rotatorio. Y no quiero alojar mi bot en un VPS -- quiero que se ejecute en una GitHub Action.

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

Este workflow simplemente instala Tor, lo inicia y hace una solicitud curl a través de él.

La primera ejecución dio este resultado:  
![Primera ejecución Tor curl](assets/20260313_140705_image.png)

Las estadísticas de tiempo fueron:  
!Timings

Una segunda ejecución dio este resultado:  
![Segunda ejecución Tor curl](assets/20260313_140928_image.png)

Como puedes ver, las IPs son diferentes, así que no nos marcarán por uso abusivo desde la misma IP. Esas son buenas noticias -- podemos seguir desarrollando el bot de cultivo.

---

## Primera prueba con Selenium

Para automatizar la interfaz, voy a usar **Selenium**: una herramienta que controla un navegador real (Chrome/Edge/Firefox) en lugar de un usuario. En el contexto de una GitHub Action, esto significa instalar un navegador + su driver, y luego ejecutar un script que inicia sesión en Microsoft Rewards y hace clic donde sea necesario.

### Script de ejemplo en JavaScript (Node.js + selenium-webdriver)

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

Resultado del script:

```
DevTools listening on ws://127.0.0.1:50274/devtools/browser/37b9ea79-0e5d-4673-9e91-7ffeaf0d37f8
After navigation: url= https://rewards.bing.com/welcome?idru=%2F
After navigation: title= Bienvenue dans Microsoft Rewards!
Page loaded, sign in button found: Se connecter
```

Vale, eso significa que todavía no hemos iniciado sesión, así que ahora construiremos la solicitud de inicio de sesión y veremos si podemos acceder a nuestra cuenta de Microsoft Rewards para hacer las actividades.
<!-- ## ESTE ARTÍCULO SIGUE SIENDO UN TRABAJO EN PROCESO, ¡LO ACTUALIZARÉ CON LOS PASOS DE INICIO DE SESIÓN Y LOS PASOS DE BOTTING DE ACTIVIDADES PRONTO! ESTAD ATENTOS. -->
