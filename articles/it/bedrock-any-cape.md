---
title: "Come ottenere qualsiasi mantello su Minecraft Bedrock"
description: "Un launcher di terzi, una vecchia versione del gioco, e un selettore di mantelli che non ha mai imparato a dire no. Tutorial completo più la probabile spiegazione del perché funziona."
date: 2026-07-14
tags:
  - minecraft
  - bedrock
  - tutorial
  - reverse-engineering
authors:
  - 9stown
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "eGmWnnqCJtxjvcOxw03VqZamaeaRmClsLAsBCDNEiaYdtFJczAZt4Na0ecfWPaA7jj7k9DebVrRnpEfLOJjJzw=="
---

# Come ottenere qualsiasi mantello su Minecraft Bedrock

Su Java, esistono un sacco di modi strani per ritrovarti con un mantello che non dovresti avere (vedi l'articolo su `cape-mod`). Su Bedrock, il gioco è diverso, l'auth è diversa, ma esiste comunque un modo: ti basta un launcher di terzi e una versione del gioco abbastanza vecchia da ignorare la validazione che si crede acquisita.

Ecco come fare, e poi guardiamo cosa succede probabilmente sotto il cofano.

## Cosa ti serve

- Un account Microsoft che possiede già Minecraft Bedrock (il tuo va benissimo)
- Il launcher Minecraft ufficiale installato
- [BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher), un launcher di terzi open source che permette di installare e lanciare qualsiasi versione storica di Bedrock
- .NET 8.0 Desktop Runtime
- La modalità sviluppatore attivata su Windows

## Passo 1: installa Bedrock almeno una volta col launcher ufficiale

Prima di fare qualsiasi altra cosa, apri il launcher Minecraft ufficiale, vai sulla scheda **Minecraft: Bedrock Edition**, e clicca su **Install**. Bedrock deve essere stato installato e lanciato almeno una volta per via ufficiale prima di toccare BedrockLauncher.

![Installer Bedrock Edition depuis le launcher officiel](/images/bedrock-cape/bedrock-cape-01-install-bedrock.png)

## Passo 2: scarica BedrockLauncher

Vai sulla pagina delle release GitHub del progetto. Prendi lo zip dell'ultima versione elencata negli **Assets**.

![Page des releases GitHub de BedrockLauncher](/images/bedrock-cape/bedrock-cape-02-github-release.png)

## Passo 3: estrai l'archivio

Una volta scaricato lo zip, estrailo nella tua cartella `Downloads` (o ovunque, basta che ritrovi la cartella dopo).

![Extraction de l'archive BedrockLauncher](/images/bedrock-cape/bedrock-cape-03-extract-zip.png)

## Passo 4: lancia l'eseguibile

Vai nella cartella estratta e lancia `BedrockLauncher.exe`.

![Lancement de BedrockLauncher.exe](/images/bedrock-cape/bedrock-cape-04-run-exe.png)

## Passo 5: installa .NET Desktop Runtime e attiva la modalità sviluppatore

Al primo lancio, Windows molto probabilmente ti chiederà il **.NET 8.0 Desktop Runtime**: installalo. Bisogna anche attivare la **modalità sviluppatore** in `Impostazioni > Sistema > Per gli sviluppatori`, perché BedrockLauncher installa il gioco come pacchetto loose (file grezzi, non un vero pacchetto firmato dallo Store), e Windows rifiuta questo tipo di installazione senza questa modalità.

![Installation du runtime .NET et activation du mode développeur](/images/bedrock-cape/bedrock-cape-05-dotnet-devmode.png)

## Passo 6: crea una nuova installazione

Rilancia BedrockLauncher, accedi col tuo account Microsoft, vai nella scheda **Installations**, poi clicca su **New installation**.

![Création d'une nouvelle installation dans BedrockLauncher](/images/bedrock-cape/bedrock-cape-06-new-installation.png)

## Passo 7: scegli una vecchia versione

Dai un nome all'installazione, poi nella lista delle versioni, scegli una versione **vecchia**: tipicamente una `1.16.x` o più antica. Clicca su **Create**.

![Sélection d'une ancienne version, ici 1.16.0.2](/images/bedrock-cape/bedrock-cape-07-pick-old-version.png)

## Passo 8: lancia l'installazione

Clicca su **Play**. L'estrazione dei file può prendere fino a dieci minuti secondo la macchina: il launcher sembrerà bloccato ("Not Responding"), è normale, lascialo girare.

![Extraction en cours, le launcher semble ne plus répondre](/images/bedrock-cape/bedrock-cape-08-launch-extracting.png)

## Passo 9: scegli il mantello

Una volta lanciato il gioco, accedi col tuo account, crea un nuovo personaggio e vai nell'editor di skin, scheda **Capes**. Lì, ritroverai la lista completa di tutti i mantelli che esistono in Minecraft: compresi quelli che non hai mai avuto (mantelli di eventi promo, di festival passati, di Mob Vote, ecc). Scegli quello che vuoi.

**Non toccare il resto dell'aspetto della skin a questo punto**, lascia solo il mantello.

![Sélection d'une cape dans l'éditeur de personnage](/images/bedrock-cape/bedrock-cape-09-choose-cape.png)

## Passo 10: reinstalla la versione ufficiale

Torna nel launcher ufficiale, scheda **Installation**, e clicca su **Uninstall** sull'installazione Bedrock principale, poi reinstallala (o fai **Check for Updates**). Rilancia Minecraft Bedrock stavolta dal launcher ufficiale.

![Désinstallation et réinstallation depuis le launcher officiel](/images/bedrock-cape/bedrock-cape-10-reinstall-official.png)

E voilà: il tuo mantello è lì, sulla versione ufficiale, sul tuo vero profilo.

## Cosa succede probabilmente

Non ho messo le mani nel codice sorgente chiuso di Bedrock (a differenza di Java che è decompilabile), quindi ciò che segue è una spiegazione **probabile**, non una certezza assoluta. Ma il comportamento osservato si adatta abbastanza bene all'ipotesi seguente.

### Il selettore di mantelli non è mai stato un controllo di accesso

Su Bedrock, la schermata di selezione mantelli mostra verosimilmente **la lista completa dei mantelli che esistono nel gioco**, non solo quelli che il tuo account possiede. Sui client recenti, un filtro applicativo (lato client o via una chiamata rete verso un servizio di entitlement Xbox/Microsoft) rende grigi o nasconde i mantelli che non possiedi.

Il punto chiave, è che questo filtro è stato probabilmente aggiunto **dopo**, su una versione del gioco abbastanza recente. Una versione come 1.16.x è anteriore a questo filtro, o usa un meccanismo di verifica diverso (se non assente): tutto ciò che è nella lista diventa selezionabile, entitlement o no.

### Il mantello è salvato dove, esattamente?

È la parte che spiega perché sopravvive alla reinstallazione. La scelta di skin/mantello su Bedrock non è solo un file locale usa e getta: è probabilmente sincronizzata sul profilo Xbox Live associato al tuo account Microsoft (lo stesso sistema che gestisce la tua skin sulle altre piattaforme Bedrock: mobile, console, ecc.). Quando selezioni un mantello nel vecchio client, questo invia molto probabilmente questa selezione al servizio di profilo, esattamente come farebbe un client aggiornato con un mantello legittimo: perché dal punto di vista del client, non c'è alcuna differenza tra un mantello "tuo" e un mantello "scelto". Il servizio di profilo, lui, si fida del client su questo punto: registra la selezione senza rivalidare se l'entitlement esiste davvero dietro, almeno non al momento della scrittura.

Risultato: quando rilanci il gioco ufficiale aggiornato, va a cercare la tua skin/mantello attuale sul servizio di profilo: e il servizio restituisce fedelmente ciò che è stato registrato, mantello non legittimo compreso. Il check di entitlement, se esiste, si fa probabilmente solo al momento della **selezione** nella UI (da cui il filtro sui client recenti), e lascia passare la **visualizzazione** di ciò che è già registrato sul profilo.

### Il parallelo con Java

È la stessa famiglia di falla logica di quella del `cape-mod` su Java: un servizio si fida di un dato senza riverificarne l'origine a ogni passo. Su Java, è una firma RSA valida ma rigiocata sul profilo sbagliato. Su Bedrock, è verosimilmente una selezione di mantello accettata da un vecchio client che non ha mai avuto il filtro giusto, poi propagata senza riverifica verso lo stato persistente dell'account. In entrambi i casi, il problema non è il punto di ingresso (il mod Java, il vecchio client Bedrock): è che lo strato che dovrebbe rivalidare l'entitlement a valle non lo fa, o lo fa una volta sola, nel posto sbagliato.

## Perché funziona ancora

Due spiegazioni possibili, non incompatibili tra loro:

1. **Mojang probabilmente non lo considera prioritario.** Serve un launcher di terzi, una manipolazione in più passi, e il risultato è puramente cosmetico: nessun vantaggio di gameplay, nessun dato altrui compromesso.
2. **Patcharlo correttamente richiederebbe di rivalidare gli entitlement a ogni lettura del profilo**, non solo alla selezione: il che vuol dire una chiamata rete in più a ogni visualizzazione di skin, per un problema che riguarda solo l'estetica.

## Conclusione

Questo tutorial sta in dieci screenshot, ma illustra un principio che si ritrova ovunque in sicurezza software: appena un sistema storico (una vecchia versione di client, una API legacy, un servizio mai aggiornato) può ancora scrivere in uno stato condiviso, il controllo di accesso del presente protegge solo ciò che passa dal presente. Tutto ciò che può ancora parlare alla vecchia API aggira il filtro più recente: il filtro funziona sulle versioni recenti, ma non è mai stato applicato alla versione che l'ha preceduto.

---

**Risorse**

- **BedrockLauncher**: [github.com/bedrockLauncher/BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher)
- **Articolo collegato**: Cape Mod, l'equivalente Java per iniezione di firma RSA

**3 punti chiave**

1. Il selettore di mantelli di una vecchia versione di Bedrock mostra probabilmente la lista completa dei mantelli del gioco, senza filtro di entitlement.
2. La selezione è poi sincronizzata sul tuo profilo Xbox Live come qualsiasi mantello legittimo: il servizio di profilo si fida del client.
3. Il check di entitlement, se esiste, si fa alla selezione nella UI recente: non alla lettura di ciò che è già registrato sull'account.
