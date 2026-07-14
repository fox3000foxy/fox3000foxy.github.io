---
title: "Evolucioné una red neuronal mediante selección natural en lugar de gradiente descendente"
description: "Cómo reemplacé el entrenamiento clásico por gradiente descendente con un algoritmo genético NSGA-II para evolucionar agentes de trading DQN: cuatro versiones, desde sobreajuste hasta evolución Lamarckiana de pesos."
date: 2026-07-13
tags: ["ai", "nsga-ii", "dqn", "trading", "typescript"]
authors: ["docteur-turboss"]
lang: "es"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "uMwUsBZIgYK/R78PG/DPYOSMPw/0Uj+WqBMDtxsyjzH+cpFvLBJaUzHdSxs549OTBbaFVJPoPKlNWJsdNnwFlQ=="
---

## El problema del gradiente descendente por sí solo

Entrenar un agente DQN para trading algorítmico con gradiente descendente clásico tiene un problema simple de enunciar y uno difícil de resolver: el gradiente descendente optimiza _una_ red hacia _un_ mínimo local, en _una_ ventana de mercado. Nada garantiza que este mínimo generalice a un régimen de mercado diferente, y nada en el bucle de entrenamiento impulsa la diversidad; dos ejecuciones partiendo de semillas diferentes a menudo convergen a estrategias casi idénticas, con los mismos puntos ciegos.

La respuesta que exploré: reemplazar (o más bien superponer) el gradiente descendente con un algoritmo genético. En lugar de entrenar un agente, se evoluciona una población de agentes; cada genoma codifica una arquitectura e hiperparámetros; y la selección natural hace la clasificación, mientras que el gradiente descendente sigue ajustando cada individuo dentro de su propia vida.

Este experimento pasó por cuatro versiones en una sola sesión intensiva. Cada versión corregía un defecto estructural de la anterior.

## v1: la versión ingenua, y por qué no fue suficiente

La primera versión hacía lo que cabría esperar de un AG básico: una población de genomas, una función de fitness, selección, cruce, mutación, siguiente generación. Cada genoma codificaba la topología de la red (número de capas, anchura), los hiperparámetros de DQN (tasa de aprendizaje, decaimiento de epsilon, tamaño del búfer de repetición), y algunas elecciones arquitectónicas (qué fuentes de datos consumir, qué tamaño de embedding).

El defecto principal: el fitness se calculaba sobre los mismos datos usados para el entrenamiento. Un agente podía literalmente memorizar una ventana de mercado y obtener una puntuación excelente sin haber aprendido una estrategia generalizable. Sobreajuste clásico, pero amplificado por la selección genética; el AG selecciona activamente los individuos que mejor explotan esta laguna.

## v2: separando entrenamiento y evaluación

La solución obvia fue separar las fases: cada genoma se entrena en una ventana de mercado, luego se evalúa en una ventana diferente, nunca vista durante el entrenamiento. Solo el rendimiento en evaluación cuenta para el fitness.

Este solo cambio hizo que el fitness promedio de la población disminuyera; una señal de que una gran parte de lo que parecía rendimiento en v1 era pura memorización. Doloroso de ver, pero es exactamente la señal que quieres: una puntuación más baja pero honesta es mejor que una inflada y engañosa.

## v3: migrando a NSGA-II y fitness multiobjetivo

Optimizar una única puntuación de fitness (digamos, rendimientos) empuja mecánicamente a los agentes a tomar riesgos extremos para maximizar ese único número. La solución fue cambiAR a NSGA-II (Algoritmo Genético de Ordenamiento No-Dominado II), que optimiza simultáneamente varios objetivos sin reducirlos a una suma ponderada arbitraria: rendimientos, drawdown máximo, ratio de Sharpe, estabilidad entre ventanas.

NSGA-II construye un frente de Pareto: el conjunto de genomas para los cuales ninguna mejora en un objetivo es posible sin degradar otro. En lugar de forzar una única compensación entre riesgo y rendimiento mediante una ponderación preelegida, se mantiene toda la frontera de compromiso y se deja la decisión final abierta.

```
function nonDominatedSort(population: Genome[]): Genome[][] {
  const fronts: Genome[][] = [[]];
  for (const p of population) {
    p.dominationCount = 0;
    p.dominatedSet = [];
    for (const q of population) {
      if (dominates(p, q)) p.dominatedSet.push(q);
      else if (dominates(q, p)) p.dominationCount++;
    }
    if (p.dominationCount === 0) {
      p.rank = 0;
      fronts[0].push(p);
    }
  }
  // ... construcción de frentes posteriores por eliminación iterativa
  return fronts;
}
```

Segunda adición en v3: un **archivo Pareto persistente**. Sin él, un buen genoma encontrado en la generación 12 puede desaparecer para la generación 15 si la suerte del cruce no lo reproduce; incluso si sigue siendo mejor que todo lo que lo reemplazó. El archivo conserva, a través de todas las generaciones, el conjunto de todos los individuos no dominados jamás encontrados, independientemente de la población actual.

## v4: evolución Lamarckiana y diversidad ambiental

V3 tenía un punto ciego estructural: el genoma describía la arquitectura, pero los pesos aprendidos durante el entrenamiento desaparecían en cada nueva generación. Un hijo nacido del cruce de dos buenos padres heredaba su arquitectura, pero tenía que reaprender desde cero; sin rastro de los pesos que habían hecho eficientes a sus padres.

V4 introduce la **evolución Lamarckiana**: los pesos entrenados se retroalimentan al genoma después del entrenamiento y se transmiten (con mutación) a la descendencia. Esto es una herejía biológica deliberada; Lamarck se equivocaba para los organismos vivos -- la herencia de caracteres adquiridos no existe en biología -- pero nada impide que un AG digital haga trampa inteligentemente: aquí, transmitir conocimiento adquirido acelera radicalmente la convergencia, ya que cada generación reinicia desde una inicialización ya informada en lugar de pesos aleatorios.

Otros tres cambios estructurales en esta versión:

*   **Diversidad ambiental**: cada genoma ya no se evalúa en una sola ventana de mercado sino en varias, extraídas de diferentes regímenes (alcista, bajista, lateral). Un agente que sobresale en una ventana y colapsa en otra ya no puede dominar el frente de Pareto.
    
*   **Regularización de complejidad en FLOPs**: el costo computacional de la red (en FLOPs) se convierte en un objetivo completo en NSGA-II. Esto evita que la evolución converja a arquitecturas masivas simplemente porque tienen más capacidad bruta, sin una ganancia de rendimiento justificada.
    
*   **Interfaz `RLBackend` desacoplada**: el AG ya no conoce los detalles de DQN. Manipula un genoma y llama a `train()` / `evaluate()` a través de una interfaz abstracta, lo que teóricamente permite intercambiar otro algoritmo de RL sin tocar el motor evolutivo.
    

```
interface RLBackend {
  train(genome: Genome, window: MarketWindow): Promise<TrainedWeights>;
  evaluate(genome: Genome, weights: TrainedWeights, window: MarketWindow): Promise<FitnessVector>;
}
```

Último punto técnico: la evaluación cambió a **concurrencia asíncrona acotada**; un grupo de N evaluaciones paralelas en lugar de un bucle secuencial, con un límite explícito para evitar saturar los recursos de GPU/CPU disponibles.

## Lo que v4 corrige frente a v3 en la práctica

Defecto de v3 | Corrección de v4
--- | ---
Pesos perdidos cada generación | Reinyección Lamarckiana de pesos entrenados
Sobreajuste a una única ventana de mercado | Evaluación en múltiples ventanas, regímenes variados
Arquitecturas creciendo sin control | FLOPs como objetivo explícito de Pareto
AG acoplado a detalles de DQN | Interfaz abstracta `RLBackend`
Evaluación secuencial lenta | Concurrencia asíncrona acotada

V4 también corrigió diez errores concretos de "conexión a tierra" de la API; casos donde el código del AG asumía una interfaz para `TradingAgent` que no coincidía exactamente con la implementación real. Este tipo de error es invisible hasta que confrontas el código contra la fuente real del agente: v4 solo se validó después de una relectura línea por línea contra el archivo real.

## Por qué mezclar evolución y gradiente en lugar de elegir uno

Podrías preguntarte por qué no usar solo RL puro, o solo evolución como NEAT. La respuesta es una frase: el gradiente es excelente para el ajuste local (ajustar pesos continuos hacia un óptimo cercano), la evolución es excelente para la exploración global (descubrir arquitecturas y combinaciones de hiperparámetros que ningún gradiente puede alcanzar, porque el espacio de búsqueda discreto no es diferenciable). Usar uno sin el otro significa privarse de una de las dos formas de exploración.

El precio es la complejidad técnica; cuatro versiones no fueron un lujo, fueron el número de iteraciones necesarias para que el bucle AG + RL dejara de sabotearse a sí mismo (sobreajuste, pérdida de buenos individuos, pérdida de pesos adquiridos). Pero el resultado es un sistema que explora un espacio de diseño mucho más amplio que una simple búsqueda en cuadrícula de hiperparámetros, manteniendo al mismo tiempo la eficiencia local del gradiente descendente para cada candidato evaluado.

## Próximo paso

Esta arquitectura evolutiva de un solo nivel (una población plana de genomas DQN) alcanza sus límites cuando crece el número de activos a cubrir. Eso es lo que motivó el paso a una arquitectura jerárquica de tres niveles (Analistas de Activos → Gestores de Sector → Asignador de Cartera), con un AG operando independientemente en cada nivel... pero ese es el tema de otro artículo.
