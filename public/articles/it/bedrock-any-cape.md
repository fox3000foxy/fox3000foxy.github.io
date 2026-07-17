---
title: "Come ottenere qualsiasi mantello su Minecraft Bedrock"
description: "Un launcher di terze parti, una vecchia versione del gioco e un selettore di mantelli che non ha mai imparato a dire di no. Tutorial completo piu la probabile spiegazione del perche funziona."
date: 2026-07-14
tags:
  - minecraft
  - bedrock
  - tutorial
  - reverse-engineering
authors:
  - 9stown
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "Lp6K//MOpsNpVKHCN8QydlaLrWMdIW65gvaTxFv+wx66p38KbhFRapJC/k/tSVprhq2fmlkNW4MD/UFUFg6e1Q=="
---

# Come ottenere qualsiasi mantello su Minecraft Bedrock

Su Java ci sono un sacco di modi contorti per ritrovarsi con un mantello che non dovresti avere (vedi l'articolo su `cape-mod`). Su Bedrock il gioco e diverso, l'autenticazione e diversa, ma c'e comunque un modo -- niente mod, niente pacchetti di rete da manipolare. Solo un launcher di terze parti e una versione del gioco abbastanza vecchia da non avere la validazione che ci si aspetterebbe.

Ecco come fare, e poi vediamo cosa succede probabilmente sotto il cofano.

## Cosa ti serve

- Un account Microsoft che possiede gia Minecraft Bedrock (il tuo va benissimo)
- Il launcher ufficiale di Minecraft installato
- [BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher), un launcher di terze parti open source che ti permette di installare ed eseguire qualsiasi versione storica di Bedrock
- .NET 8.0 Desktop Runtime
- Modalita sviluppatore attivata su Windows

## Passo 1 -- Installare Bedrock almeno una volta con il launcher ufficiale

Prima di fare qualsiasi altra cosa, apri il launcher ufficiale di Minecraft, vai alla scheda **Minecraft: Bedrock Edition** e clicca su **Installa**. Bedrock deve essere stato installato e avviato almeno una volta tramite il canale ufficiale prima di toccare BedrockLauncher.

![Installare Bedrock Edition dal launcher ufficiale](/images/bedrock-cape/bedrock-cape-01-install-bedrock.png)

## Passo 2 -- Scaricare BedrockLauncher

Vai alla pagina delle release GitHub del progetto. Prendi lo zip dell'ultima versione elencata negli **Assets**.

![Pagina delle release GitHub di BedrockLauncher](/images/bedrock-cape/bedrock-cape-02-github-release.png)

## Passo 3 -- Estrarre l'archivio

Una volta scaricato lo zip, estrailo nella tua cartella `Downloads` (o ovunque, purche tu riesca a ritrovare la cartella dopo).

![Estrazione dell'archivio di BedrockLauncher](/images/bedrock-cape/bedrock-cape-03-extract-zip.png)

## Passo 4 -- Avviare l'eseguibile

Entra nella cartella estratta e avvia `BedrockLauncher.exe`.

![Avvio di BedrockLauncher.exe](/images/bedrock-cape/bedrock-cape-04-run-exe.png)

## Passo 5 -- Installare .NET Desktop Runtime e attivare la modalita sviluppatore

Al primo avvio, Windows ti chiedera molto probabilmente il **.NET 8.0 Desktop Runtime** -- installalo. Devi anche attivare la **modalita sviluppatore** in `Impostazioni > Sistema > Per sviluppatori`, perche BedrockLauncher installa il gioco come pacchetto loose (file grezzi, non un vero pacchetto firmato dello Store), e Windows rifiuta questo tipo di installazione senza quella modalita.

![Installazione del runtime .NET e attivazione della modalita sviluppatore](/images/bedrock-cape/bedrock-cape-05-dotnet-devmode.png)

## Passo 6 -- Creare una nuova installazione

Riavvia BedrockLauncher, accedi con il tuo account Microsoft, vai alla scheda **Installations** e clicca su **New installation**.

![Creazione di una nuova installazione in BedrockLauncher](/images/bedrock-cape/bedrock-cape-06-new-installation.png)

## Passo 7 -- Scegliere una vecchia versione

Dai un nome all'installazione, poi nella lista delle versioni scegli una versione **vecchia** -- tipicamente `1.16.x` o precedente. Clicca su **Create**.

![Selezione di una vecchia versione, qui 1.16.0.2](/images/bedrock-cape/bedrock-cape-07-pick-old-version.png)

## Passo 8 -- Avviare l'installazione

Clicca su **Play**. L'estrazione dei file puo richiedere fino a dieci minuti a seconda del computer -- il launcher sembrera bloccato ("Non risponde"), e normale, lascialo girare.

![Estrazione in corso, il launcher sembra non rispondere](/images/bedrock-cape/bedrock-cape-08-launch-extracting.png)

## Passo 9 -- Scegliere il mantello

Una volta avviato il gioco, accedi con il tuo account, crea un nuovo personaggio e vai nell'editor della skin, scheda **Mantelli**. Li troverai l'elenco completo di tutti i mantelli che esistono nel gioco -- compresi quelli che non hai mai avuto (mantelli di eventi promo, festival passati, Mob Vote, ecc.). Scegli quello che vuoi.

**Non toccare il resto dell'aspetto della skin in questa fase**, lascia solo il mantello.

![Selezione di un mantello nell'editor del personaggio](/images/bedrock-cape/bedrock-cape-09-choose-cape.png)

## Passo 10 -- Reinstallare la versione ufficiale

Torna al launcher ufficiale, scheda **Installazione**, e clicca su **Disinstalla** sull'installazione Bedrock principale, poi reinstallala (o premi **Verifica aggiornamenti**). Avvia Minecraft Bedrock questa volta dal launcher ufficiale.

![Disinstallazione e reinstallazione dal launcher ufficiale](/images/bedrock-cape/bedrock-cape-10-reinstall-official.png)

Ecco fatto -- il tuo mantello e li, sulla versione ufficiale, sul tuo profilo reale.

## Cosa sta probabilmente succedendo

Non ho messo le mani nel codice sorgente chiuso di Bedrock (a differenza di Java che e decompilabile), quindi cio che segue e una spiegazione **probabile**, non una certezza assoluta. Ma il comportamento osservato si adatta abbastanza bene all'ipotesi seguente.

### Il selettore di mantelli non e mai stato un controllo d'accesso

Su Bedrock, la schermata di selezione dei mantelli mostra probabilmente **l'elenco completo di tutti i mantelli che esistono nel gioco**, non solo quelli che il tuo account possiede. Sui client recenti, un filtro applicativo (lato client o tramite una chiamata di rete a un servizio di entitlement Xbox/Microsoft) mette in grigio o nasconde i mantelli che non possiedi.

Il punto chiave e che questo filtro e stato probabilmente aggiunto **in un secondo momento**, su una versione del gioco sufficientemente recente. Una versione come 1.16.x e precedente a questo filtro, o usa un meccanismo di verifica diverso (o assente): tutto cio che e nella lista diventa selezionabile, entitlement o meno.

### Dove viene memorizzato esattamente il mantello?

Questa e la parte che spiega perche sopravvive alla reinstallazione. La scelta di skin/mantello su Bedrock non e solo un file locale usa e getta -- e probabilmente sincronizzata sul profilo Xbox Live associato al tuo account Microsoft (lo stesso sistema che gestisce la tua skin sulle altre piattaforme Bedrock -- mobile, console, ecc.). Quando selezioni un mantello nel vecchio client, questo invia molto probabilmente quella selezione al servizio di profilo, esattamente come farebbe un client aggiornato con un mantello legittimo -- perche dal punto di vista del client, non c'e alcuna differenza tra un mantello "tuo" e un mantello "scelto". Il servizio di profilo, dal canto suo, si fida del client su questo punto: registra la selezione senza riconvalidare se l'entitlement esista effettivamente dietro, almeno non al momento della scrittura.

Risultato: quando riavvii il gioco ufficiale aggiornato, questo recupera la tua skin/mantello attuale dal servizio di profilo -- e il servizio restituisce fedelmente cio che e stato salvato, mantello non legittimo incluso. Il controllo di entitlement, se esiste, avviene probabilmente al momento della **selezione** nella UI (da cui il filtro sui client recenti), non al momento della **visualizzazione** di cio che e gia salvato sul profilo.

### Il parallelo con Java

E la stessa famiglia di falla logica del `cape-mod` su Java: un servizio si fida di dati senza riverificarne l'origine a ogni passo. Su Java, e una firma RSA valida riprodotta sul profilo sbagliato. Su Bedrock, e probabilmente una selezione di mantello accettata da un vecchio client che non ha mai avuto il filtro giusto, e poi propagata senza riverifica allo stato persistente dell'account. In entrambi i casi, il problema non e il punto d'ingresso (la mod Java, il vecchio client Bedrock) -- ma il fatto che il livello che dovrebbe riconvalidare l'entitlement a valle non lo fa, o lo fa solo una volta, nel posto sbagliato.

## Perche funziona ancora

Due possibili spiegazioni, non incompatibili tra loro:

1. **Mojang probabilmente non lo considera prioritario.** Serve un launcher di terze parti, una procedura in piu passi, e il risultato e puramente estetico -- nessun vantaggio di gameplay, nessun dato altrui compromesso.
2. **Patchare correttamente richiederebbe di riconvalidare gli entitlement a ogni lettura del profilo**, non solo alla selezione -- il che significa una chiamata di rete aggiuntiva a ogni visualizzazione della skin, per un problema che riguarda solo l'estetica.

## Conclusione

Questo tutorial sta in dieci screenshot, ma illustra un principio che si trova ovunque nella sicurezza del software: appena un sistema legacy (una vecchia versione client, una API legacy, un servizio mai aggiornato) puo ancora scrivere in uno stato condiviso, il controllo d'accesso attuale protegge solo cio che passa attraverso il presente. Tutto cio che puo ancora parlare con la vecchia API aggira il filtro piu recente -- non perche il filtro e rotto, ma perche non e mai stato applicato alla versione che l'ha preceduto.

---

**Risorse**

- **BedrockLauncher** : [github.com/bedrockLauncher/BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher)
- **Articolo correlato** : Cape Mod, l'equivalente Java tramite iniezione di firma RSA

**3 punti chiave**

1. Il selettore di mantelli di una vecchia versione di Bedrock mostra probabilmente l'elenco completo di tutti i mantelli del gioco, senza filtro di entitlement.
2. La selezione viene poi sincronizzata sul tuo profilo Xbox Live come qualsiasi mantello legittimo -- il servizio di profilo si fida del client.
3. Il controllo di entitlement, se esiste, avviene alla selezione nella UI recente -- non alla lettura di cio che e gia salvato sull'account.
