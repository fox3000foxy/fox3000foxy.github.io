---
title: Lavorando a un Nuovo Progetto
description: Uno sguardo al processo di avvio e sviluppo di un nuovo sito web.
date: 2026-03-13
tags:
  - meta
  - webdev
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "dpXnrgQycspmyKhK3D0KQbc2sQ+eW6I42nlZoRPeEcoNVKadNjht5Ugria6wnJuJ3/IndYwQgmumr28WHlDeYw=="
---

# Il Progetto

Il progetto a cui sto lavorando si chiama LLJT:

![](assets/20260313_092734_image.png)

Questo è un sito web che è anche una PWA, quindi anche un'app mobile. Usa MaterialUI per sembrare una vera app per telefono.
Di recente ho dovuto gestire le importazioni di Mui, e sono passato da 11707 moduli a solo 595 alla fine, importando manualmente ogni icona per riga, invece di usare l'import destrutturato: ho imparato che quando fai l'import destrutturato, carichi in realtà l'intera libreria di icone, mentre importandole singolarmente importi solo quelle che ti servono...

Nibi è il bot collegato a questo sito.![](assets/20260313_093102_image.png)La valutazione si basa su Google Forms:
![](assets/20260313_093255_image.png)
Usiamo test a risposta multipla per valutare i nostri studenti, e assegniamo anche ruoli Discord, e quindi emoji e canali, ai nostri studenti, se superano un esame importante.

![](assets/20260313_093707_image.png)

L'obiettivo di questo progetto è far sì che le persone imparino il giapponese insieme a noi, dato che è una cosa che voglio fare anch'io.
Gli studenti sbloccheranno anche partnership con Crunchyroll e altre piattaforme, per premiarli per le loro capacità.

Nibi e il sito web sono ospitati rispettivamente da Cloudflare Workers Hono Server Interaction URL e GitHub Pages con React Deployement.
Il codice del sito web non è open source, ma Nibi sì, e puoi trovarlo in [questo repository GitHub](https://github.com/let-s-Learn-Japanese-Together/nibi). Il sito web non è open source perché contiene alcune informazioni private, ma se vuoi sapere come l'ho costruito, puoi chiedermelo su Discord o altro, e sarò felice di condividere il processo! In realtà usa una GitHub Action che ho creato così non devo pagare per GitHub Enterprise, e usa anche molti altri strumenti e tecniche interessanti che posso condividere con te se sei interessato!

Da qualche giorno amo davvero trovare soluzioni alternative per i miei progetti per evitare di ospitarli, e per evitare di pagare per ospitarli, ecco perché ho fatto di Nibi un bot Interaction Endpoint, così può essere ospitato gratuitamente su Cloudflare Workers, e ho anche creato una GitHub Action per pubblicare il sito web gratuitamente su GitHub Pages, così non devo pagare per ospitarlo. Trovo che trovare soluzioni alternative sia una delle parti più divertenti della programmazione, ed è qualcosa che mi piace davvero fare! Devi davvero pensare fuori dagli schemi e trovare soluzioni creative ai problemi, ed è questo che amo. Non si tratta solo di scrivere codice, ma di trovare modi per far funzionare le cose senza spendere soldi, ed è una sfida che mi piace davvero!

Usare GitHub Actions in un modo non proprio previsto, e usare Cloudflare Workers per "ospitare" un bot è anche un modo per imparare cose nuove e scoprire nuove tecnologie, come il Cloud Hosting, che è qualcosa che mi piace molto. Non voglio davvero più pagare per l'hosting.

Ci sto ancora lavorando ma puoi unirti al [server Discord](https://discord.gg/frKZ9cJ4fD) se vuoi seguire i progressi e vedere come si evolve, e magari anche unirti al progetto se sei interessato! Il server è aperto a tutti, e ci piacerebbe avere più persone che si uniscano a noi in questo viaggio per imparare il giapponese insieme! Puoi trovare il link d'invito sul sito web, o chiedermelo se vuoi!
