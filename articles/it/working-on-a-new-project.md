---
title: "Lavoro su un nuovo progetto"
description: "Uno sguardo al processo di avvio e sviluppo di un nuovo sito web."
date: 2026-03-13
tags:
  - meta
  - webdev
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "sz/1X5vK1HrPKKeb4zZliZxIcppDmZKTi8gtqgx3/yNg2CJVSfHe1tfM8ihmHSd8jXIdeTr2wZ1xGqu9Gt3Dng=="
---

# Il progetto

Il progetto su cui lavoro si chiama LLJT:

![](assets/20260313_092734_image.png)

È un sito web che è anche una PWA, quindi usabile come un'app mobile. Usa MaterialUI per comportarsi come una vera app telefono.
Ho passato un po' sugli import Mui: sono passato da 11707 moduli a 595 alla fine, importando ogni icona riga per riga invece dell'import destrutturato. Ho imparato in quel momento che l'import destrutturato carica tutta la libreria di icone, mentre gli import individuali caricano solo quelle usate.

Nibi è il bot collegato a questo sito web.![](assets/20260313_093102_image.png)La valutazione poggia su Google Forms:
![](assets/20260313_093255_image.png)
Usiamo QCM per valutare i nostri studenti, e attribuiamo anche ruoli Discord, oltre a emoji e canali, ai nostri studenti quando superano un esame importante.

![](assets/20260313_093707_image.png)

Lo scopo di questo progetto è aiutare la gente a imparare il giapponese insieme a noi, perché è qualcosa che voglio fare anch'io.

Gli studenti sbloccheranno anche partnership con Crunchyroll e altre piattaforme, per ricompensare la loro progressione.

Nibi e il sito sono ospitati rispettivamente da Cloudflare Workers (Interaction URL con Hono Server) e GitHub Pages con React.
Il codice del sito non è open source, ma Nibi lo è, e potete trovarlo su [questo deposito GitHub](https://github.com/let-s-Learn-Japanese-Together/nibi). Il sito resta privato perché contiene info private, ma se volete sapere come l'ho costruito, chiedetemi su Discord e vi spiegherò il processo con piacere! Usa una GitHub Action che ho creato per evitare di pagare GitHub Enterprise, oltre a vari altri strumenti e tecniche che posso descrivervi se vi interessa!

Da qualche giorno, mi diverto un sacco a trovare soluzioni di aggiramento per ospitare i miei progetti senza pagare hosting. Ecco perché ho fatto di Nibi un bot Interaction Endpoint, per ospitarlo gratis su Cloudflare Workers, e ho creato una GitHub Action per deployare il sito gratis su GitHub Pages. Cercare questi aggiramenti resta per me una delle parti più stimolanti del codice: bisogna ragionare altrimenti e costruire soluzioni creative, ed è esattamente questa sfida senza budget che mi motiva!

Usare GitHub Actions fuori dal suo uso previsto, e usare Cloudflare Workers per "ospitare" un bot, è anche un modo per imparare cose nuove e scoprire nuove tecnologie, come l'hosting cloud. Non voglio più pagare per l'hosting.

Ci lavoro ancora ma potete unirvi al [server Discord](https://discord.gg/frKZ9cJ4fD) se volete seguire l'avanzamento e vedere come evolve, e magari unirvi al progetto se vi interessa! Il server è aperto a tutti, e ci piacerebbe avere più gente per imparare il giapponese insieme! Troverete il link di invito sul sito, o potete chiedermelo direttamente!
