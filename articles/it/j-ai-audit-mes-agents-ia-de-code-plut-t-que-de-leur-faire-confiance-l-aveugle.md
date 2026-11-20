---
title: "Ho auditato i miei agenti IA di codice invece di fidarmi ciecamente"
description: "Come due audit fatti per scrivere il 4° report tecnico della mia piattaforma di trading mi hanno rivelato due derive distinte: un agente che dimentica perché il repo non sta più nella sua finestra di contesto, e un agente che scrive dieci volte più codice del necessario perché niente lo spinge alla concisione."
date: 2026-09-15
tags: ["ai", "llm-agents", "code-review", "context-window", "trading", "typescript"]
authors: ["docteur-turboss"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "nVmkOJf/+Vufuoovadk5ABbwgqecANhYy+3bICyjssBf9v+kLHeD5qeupCAs3GprnU2DmGQg+SNH9Sy+xIJJEQ=="
---

## Il sintomo prima della diagnosi

Ogni edizione del report tecnico della piattaforma mi obbliga a ripercorrere l'architettura intera: servizi, agenti, pipeline di dati. È preparando la 4ª edizione che il volume del repo alla fine mi è saltato agli occhi, mentre lo vedevo crescere progressivamente senza fermarmici mai sopra: il repo, che all'origine stava in poche migliaia di righe, meno di 10ko, raggiunge ormai 100Mo. La piattaforma aveva a malapena più funzionalità. Mi ero semplicemente appoggiato su agenti tipo Claude Chat per implementare e correggere codice, senza inquadrare con precisione cosa chiedevo loro né su quale perimetro.

Scrivere il report mi ha costretto a uscire dalla modalità "avanza" per tornare in modalità "cos'è successo davvero". Ho fatto due audit distinti sullo storico del repo. Entrambi puntavano alla stessa causa, per due ragioni completamente diverse.

## Audit n°1: la finestra di contesto che mente

Il primo audit consisteva a riprendere, servizio per servizio, le correzioni fatte da un agente IA su vari mesi, e a verificare se erano coerenti col resto del repo al momento in cui erano state applicate.

Il motivo che tornava senza sosta: l'agente correggeva un problema localmente, nel file o nel modulo che aveva sotto gli occhi, senza aver visto l'equivalente altrove nel repo, o senza ricordarsene. Risultato: la stessa interfaccia ridefinita leggermente diversa in due servizi, una ridenominazione applicata a metà perché la seconda occorrenza era fuori dalla finestra di contesto al momento del prompt, una convenzione di nomi rispettata in un modulo e ignorata nel successivo. Niente di spettacolare preso isolatamente, ma cumulato su decine di sessioni, produce esattamente la ridondanza e i code smell che fanno perdere il filo allo strumento successivo che ci lanci sopra. Un circolo che si autoalimenta: più il repo cresce e si frammenta, più diventa difficile per un agente tenerlo in testa nella sua integralità, più le correzioni diventano locali e parziali, più il repo cresce.

Il problema non è che l'agente "mente" o inventa; risponde correttamente alla domanda posta sul contesto che gli è stato dato. Il problema è che io non avevo, quasi mai, definito il perimetro della domanda a monte. Chiedevo "correggi questo refuso, questo comportamento, questa funzione" senza chiedermi se questo bug avesse equivalenti altrove nel repo che l'agente non poteva vedere.

## Audit n°2: quando la verbosità diventa codice

Il secondo audit era più meccanico: far girare un `git log --numstat` su tutto lo storico, aggregare righe aggiunte e caratteri aggiunti per commit e guardare la distribuzione.

I 30 commit più grossi in righe aggiunte rappresentavano, da soli, una parte largamente sproporzionata del volume totale del repo. Sistematicamente, gli stessi commit risultavano anche i più grossi in caratteri aggiunti. Era prevedibile, solo che il rapporto caratteri/righe di quei commit non era legato solo al numero di righe: le righe stesse erano più verbose, con più commenti esplicativi ridondanti col nome delle funzioni, più blocchi di gestione errori duplicati invece di essere fattorizzati, più docstring che riformulavano tre volte la stessa cosa.

È la conseguenza diretta di un comportamento noto quando si interagisce con un LLM in chat: senza consegna esplicita di concisione, tende a parlare molto, a giustificare, commentare, riformulare. In conversazione, costa token di uscita. In generazione di codice, questo stesso riflesso si traduce in righe che restano nel repo all'infinito, commit dopo commit, senza rileggerle davvero finché il codice funziona.

## Cosa i due audit, fianco a fianco, hanno mostrato

Per il primo report: la coerenza inter-servizi soffre di una finestra di contesto troppo piccola per tenere tutto il repo, il che porta a correzioni locali, ridondanze e divergenze di convenzioni.

Per il secondo: `git log --numstat` mostra una verbosità di default di un LLM non inquadrato, il che causa righe e caratteri aggiunti sproporzionati e codice poco fattorizzato.

I due riuniti puntano a ridondanza e volume: danno un repo troppo grosso perché un futuro agente lo tenga in testa, il che aggrava ancora il primo problema messo in evidenza dal primo audit.

È quest'ultima riga che mi ha preoccupato di più scrivendo il report: i due problemi sono legati, si nutrono a vicenda. Più il codice generato è verboso, più il repo cresce in fretta; più cresce, meno un agente può tenerlo in contesto; meno può tenerlo in contesto, più le sue correzioni sono locali e ridondanti; più sono ridondanti, più aggiungono volume. Un ciclo di retroazione negativa, interamente causato da un uso di agenti senza inquadramento.

## Perché non è un bug puntuale di uno strumento preciso

Niente in questa diagnosi è specifico di un modello o un prodotto in particolare. Un agente tipo chat, qualsiasi sia, opera su ciò che gli diamo da vedere nella sua finestra all'istante T, e genera di default la risposta più completa e giustificata possibile. È esattamente il comportamento atteso di un assistente conversazionale, ed esattamente quello da evitare per uno strumento che scrive in un repo di produzione. Il problema viene dall'assenza di inquadramento tra lo strumento e il repo: perimetro di file da considerare, formato di uscita atteso, budget di righe o verbosità, obbligo di citare con precisione ciò che esiste già prima di scrivere qualcosa di nuovo.

## Cosa ho cambiato da allora

Il riflesso logico sarebbe stato ridurre drasticamente ciò che era stato scritto. Personalmente, ho deciso di fare altrimenti. Gli audit mi sono serviti ad altro: scansionare il codice per individuarvi i code smell, e servirmene per delimitare con precisione dove stavano i veri problemi. Le incoerenze inter-servizi, le ridondanze, i punti dove il filo si era perso, invece di tirare a indovinare. Il volume di codice scritto resta significativamente lo stesso: verboso o no, resta utile se ben usato. La leva era sapere con precisione dove guardare per correggere ciò che non quadrava, invece di impedire all'agente di scrivere.

## Prossimi passi

Il taglio del repo in unità più piccole e meglio delimitate. Oltre a presidi di produzione per esecuzione e documentazione. Il problema che si pone a sua volta è una questione di architettura: come analizzare, criticare e far comunicare pulitamente i servizi, componenti e documentazione che, una volta separati, devono comunque coordinare le loro decisioni senza tornare allo stesso monolite di prima.
