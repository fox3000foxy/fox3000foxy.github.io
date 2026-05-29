> **Nota (2026):** Questo progetto non è più mantenuto. Microsoft ha notevolmente rafforzato il suo rilevamento anti-bot — ciò che funzionava allora non funziona più oggi. Il codice e l'approccio descritti qui sotto sono conservati solo a scopo di archivio/educativo.

### Introduzione

Qualche anno fa ho scoperto Microsoft Rewards. Allora era durante il lockdown, ma questo non cambia il fatto che ero costretto a usare i controlli parentali di Microsoft Family Safety e quindi dovevo usare Edge. È stato lì che ho scoperto Rewards.

All'epoca avevo solo 14 anni e niente nel catalogo mi interessava. Ora penso che con le competenze che ho acquisito, posso farmare punti con i bot e poi regalare i codici o addirittura rivenderli a prezzo scontato se voglio davvero (conoscendomi, probabilmente non lo farò). Comunque, ti racconterò come ho programmato un bot che farms account su larga scala.

---

## Cos'è Microsoft Rewards?

Per farla breve: è un programma che premia gli utenti di Edge con punti per attività come ricerche, piccoli quiz, giochi e un'estensione (questa è un'altra storia).

Qui puoi vedere roba "Esplora":  
![Screenshot Explore](assets/20260313_135010_image.png)

Qui per esempio c'è quello che chiamano il "set del giorno".  
![Screenshot set giornaliero](assets/20260313_135038_image.png)

Hanno persino creato un sistema di streak, è pazzesco.  
![Screenshot streak](assets/20260313_135210_image.png)

C'è anche un sistema di livelli ed è davvero divertente:  
![Screenshot livelli](assets/20260313_135340_image.png)

Quindi hai tonnellate di modi per guadagnare punti, e la maggior parte sono giornalieri.  
L'idea qui è quella di creare un bot che faccia le attività per te, così puoi farmare punti su larga scala e completare la tua routine di farming.

Come puoi vedere qui sotto, la maggior parte dei premi sono carte regalo, ma ci sono anche cose divertenti come giochi o abbonamenti a servizi.  
![Screenshot premi](assets/20260313_135646_image.png)

| Premio | Categoria | Costo in punti |
| --- | --- | --- |
| **Rakuten TV – 1 film HD** | Contenuti digitali | 1 785 |
| **Roblox (carta digitale)** | Gioco / contenuti digitali | 6 750 |
| **Carta regalo Microsoft** | Negozio / servizio | 5 660 |
| **Carta regalo Xbox** | Negozio / servizio | 5 660 |
| **Carta regalo Microsoft Solitaire Collection** | Gioco / contenuti digitali | 1 500 |
| **Minecraft Minecoins** | Gioco / contenuti digitali | 2 500 |
| **Carta regalo League of Legends** | Gioco / contenuti digitali | 2 000 |
| **Codice coin Overwatch (digitale)** | Gioco / contenuti digitali | 2 000 |
| **Sea of Thieves – Pacchetto Old Coins** | Gioco / contenuti digitali | 1 700 |
| **Zalando – Carta regalo** | Negozio / servizio | 7 205 |
| **Carrefour – Carta regalo** | Negozio / servizio | 14 410 |
| **Cultura – Carta regalo** | Negozio / servizio | 14 410 |
| **Fnac‑Darty – Carta regalo** | Negozio / servizio | 14 410 |
| **La Redoute – Carta regalo** | Negozio / servizio | 14 410 |
| **Mango – Carta regalo** | Negozio / servizio | 36 025 |
| **Wonderbox – Carta regalo** | Negozio / servizio | 14 410 |
| **Yves Rocher – Carta regalo** | Negozio / servizio | 14 410 |
| **Amazon.fr – Buono regalo** | Negozio / servizio | 7 205 |
| **Foot Locker – Carta regalo** | Negozio / servizio | 14 410 |
| **IKEA FR – Carta regalo** | Negozio / servizio | 36 025 |
| **IKEA FR – Carta regalo (altro design)** | Negozio / servizio | 7 200 |
| **Marionnaud – Carta regalo** | Negozio / servizio | 14 410 |
| **Asos – Carta regalo** | Negozio / servizio | 14 410 |
| **Adidas FR – Carta regalo** | Negozio / servizio | 14 410 |
| **Deliveroo France – Carta regalo** | Negozio / servizio | 21 615 |
| **H&M France – Carta regalo** | Negozio / servizio | 14 410 |
| **Global Hotel Card (Expedia Group)** | Negozio / servizio | 7 205 |
| **Uber Eats France – Carta regalo** | Negozio / servizio | 36 025 |

Ora che capisci l'utilità di questo programma, parliamo del botting.

---

## Primi test

Prima di costruire il mio bot, volevo assicurarmi di non essere segnalato per IP usando centinaia di account dallo stesso indirizzo. Mi conosci, userò Tor con un proxy rotante. E non voglio ospitare il mio bot su un VPS — voglio che funzioni in una GitHub Action.

Quindi ho scritto un workflow semplice:

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

Questo workflow installa semplicemente Tor, lo avvia, e fa una richiesta curl attraverso di esso.

Il primo esecuzione ha dato questo risultato:  
![Primo risultato Tor curl](assets/20260313_140705_image.png)

Le statistiche di tempo erano:  
!Timings

Una seconda esecuzione ha dato questo risultato:  
![Secondo risultato Tor curl](assets/20260313_140928_image.png)

Come puoi vedere, gli IP sono diversi, quindi non verremo segnalati per uso abusivo dallo stesso IP. Sono buone notizie — possiamo continuare a sviluppare il bot di farming.

---

## Primo test con Selenium

Per automatizzare l'interfaccia utente, userò **Selenium**: uno strumento che controlla un browser reale (Chrome/Edge/Firefox) invece di un utente. Nel contesto di una GitHub Action, questo significa installare un browser + il suo driver, poi eseguire uno script che accede a Microsoft Rewards e clicca dove necessario.

### Esempio di script JavaScript (Node.js + selenium-webdriver)

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

Risultato dello script:

```
DevTools listening on ws://127.0.0.1:50274/devtools/browser/37b9ea79-0e5d-4673-9e91-7ffeaf0d37f8
After navigation: url= https://rewards.bing.com/welcome?idru=%2F
After navigation: title= Bienvenue dans Microsoft Rewards!
Page loaded, sign in button found: Se connecter
```

Ok, significa che non siamo ancora loggati, quindi ora costruiremo la richiesta di login e vedremo se riusciamo ad accedere al nostro account Microsoft Rewards per fare le attività.
<!-- ## QUESTO ARTICOLO È ANCORA IN LAVORAZIONE, AGGIORNERÒ CON I PASSAGGI DI LOGIN E LE FASI DI BOTTING DELLE ATTIVITÀ PRESTO! RESTA SINTONIZZATO. -->
