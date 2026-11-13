---
title: "Hice evolucionar una red de neuronas por selección natural en vez de por descenso de gradiente"
description: "Cómo reemplacé el entrenamiento clásico por descenso de gradiente por un algoritmo genético NSGA-II para hacer evolucionar agentes DQN de trading: cuatro versiones, del sobreajuste a la evolución lamarckiana de los pesos."
date: 2026-07-13
tags: ["ai", "nsga-ii", "dqn", "trading", "typescript"]
authors: ["docteur-turboss"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "QKsO3S/bt+f44iTw1apnyOGcrPnbTWS89dK9KALG3E6XGZJdgi28dEPHYCTkdLUcaJYesJh2aq2WxYHwli2j/w=="
---
## El problema del descenso de gradiente por sí solo

Entrenar un agente DQN para trading algorítmico con el descenso de gradiente clásico plantea un problema simple de enunciar y difícil de resolver: el gradiente optimiza _una_ red hacia _un_ mínimo local, sobre _una_ ventana de mercado. Nada garantiza que ese mínimo generalice a un régimen de mercado distinto, y nada en el bucle de entrenamiento empuja hacia la diversidad; dos ejecuciones que parten de semillas distintas suelen converger hacia estrategias casi idénticas, con los mismos puntos ciegos.

La respuesta que exploré: reemplazar (o más bien superponer) el descenso de gradiente con un algoritmo genético. En vez de entrenar un agente, haces evolucionar una población de agentes; cada uno un genoma que codifica una arquitectura y unos hiperparámetros; y dejas que la selección natural haga la criba, mientras el gradiente sigue puliendo cada individuo dentro de su propia vida.

Este runner pasó por cuatro versiones en una sola sesión de trabajo intensiva. Cada una corrigió un defecto estructural de la anterior.

## v1: la versión ingenua, y por qué no bastaba

La primera versión hacía lo que se espera de un GA básico: una población de genomas, una función de fitness, selección, cruce, mutación, generación siguiente. Cada genoma codificaba la topología de la red (número de capas, anchura), los hiperparámetros DQN (learning rate, epsilon decay, tamaño del replay buffer), y algunas decisiones arquitectónicas (qué fuentes de datos consumir, qué tamaño de embedding).

El defecto principal: el fitness se calculaba sobre los mismos datos que el entrenamiento. Un agente podía literalmente memorizar una ventana de mercado y obtener una puntuación excelente sin haber aprendido una estrategia generalizable. Sobreajuste clásico, pero amplificado por la selección genética; el GA selecciona activamente a los individuos que mejor explotan ese fallo.

## v2: separar entrenamiento y evaluación

La corrección evidente era separar las fases: cada genoma se entrena sobre una ventana de mercado, y luego se evalúa sobre una ventana distinta, nunca vista durante el entrenamiento. Solo el rendimiento en evaluación cuenta para el fitness.

Solo ese cambio hizo caer el fitness medio de la población; señal de que buena parte de lo que parecía rendimiento en la v1 era memorización pura. Doloroso de ver, pero es exactamente la señal que buscas: una puntuación más baja pero honesta vale más que una puntuación inflada y engañosa.

## v3: pasar a NSGA-II y un fitness multiobjetivo

Optimizar una sola puntuación de fitness (digamos el rendimiento) empuja mecánicamente hacia agentes que asumen riesgos extremos para maximizar esa única cifra. La solución fue pasar a NSGA-II (Non-dominated Sorting Genetic Algorithm II), que optimiza simultáneamente varios objetivos sin reducirlos a una suma ponderada arbitraria: rendimiento, drawdown máximo, ratio de Sharpe, estabilidad entre ventanas.

NSGA-II construye un frente de Pareto: el conjunto de genomas para los que ninguna mejora en un objetivo es posible sin degradar otro. En vez de forzar un único compromiso entre rendimiento y riesgo mediante una ponderación elegida de antemano, conservas toda la frontera de compromisos y dejas la elección final abierta.

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
  // ... construcción de los frentes siguientes por retirada iterativa
  return fronts;
}
```

Segundo añadido de la v3: un **archivo de Pareto persistente**. Sin él, un buen genoma encontrado en la generación 12 puede desaparecer en la generación 15 si el azar del cruce no lo reproduce; aunque siga siendo mejor que todo lo que lo reemplazó. El archivo conserva, a través de todas las generaciones, el conjunto de individuos no dominados jamás encontrados, con independencia de la población actual.

## v4: evolución lamarckiana y diversidad ambiental

La v3 tenía un punto ciego estructural: el genoma describía la arquitectura, pero los pesos aprendidos durante el entrenamiento desaparecían con cada nueva generación. Un descendiente nacido del cruce de dos buenos padres heredaba su arquitectura, pero tenía que reaprender desde cero; ningún rastro de los pesos que habían hecho rendir a sus padres.

La v4 introduce la **evolución lamarckiana**: los pesos entrenados se reinyectan en el genoma tras el entrenamiento, y se transmiten (con mutación) a la descendencia. Es una herejía biológica asumida; Lamarck se equivocaba con los organismos vivos, la herencia de los caracteres adquiridos no existe en biología; pero nada impide que un GA numérico haga trampas con inteligencia: aquí, transmitir lo adquirido acelera radicalmente la convergencia, porque cada generación parte de un punto de inicialización ya informado en vez de pesos aleatorios.

Otros tres cambios estructurales en esta versión:

*   **Diversidad ambiental**: cada genoma ya no se evalúa sobre una sola ventana de mercado sino sobre varias, sacadas de regímenes distintos (alcista, bajista, lateral). Un agente que brilla en una ventana y se hunde en otra ya no puede dominar el frente de Pareto.

*   **Regularización por complejidad FLOPs**: el coste de cálculo de la red (en FLOPs) se convierte en un objetivo de pleno derecho dentro de NSGA-II. Eso evita que la evolución converja hacia arquitecturas masivas simplemente porque tienen más capacidad bruta, sin que lo justifique la ganancia de rendimiento.

*   **Interfaz** `RLBackend` **desacoplada**: el GA ya no conoce los detalles de DQN. Manipula un genoma y llama a `train()` / `evaluate()` a través de una interfaz abstracta, lo que permite en teoría enchufar otro algoritmo RL sin tocar el motor evolutivo.


```
interface RLBackend {
  train(genome: Genome, window: MarketWindow): Promise<TrainedWeights>;
  evaluate(genome: Genome, weights: TrainedWeights, window: MarketWindow): Promise<FitnessVector>;
}
```

Último punto técnico: la evaluación pasó a **concurrencia asíncrona acotada**; un pool de N evaluaciones en paralelo en vez de un bucle secuencial, con un límite explícito para no saturar los recursos GPU/CPU disponibles.

## Lo que corrige la v4 respecto a la v3 en la práctica

Defecto v3 Corrección v4 Pesos perdidos en cada generación Reinyección lamarckiana de los pesos entrenados Sobreajuste a una sola ventana de mercado Evaluación sobre ventanas múltiples, regímenes variados Arquitecturas que crecen sin restricción FLOPs como objetivo Pareto explícito GA acoplado a los detalles de DQN Interfaz `RLBackend` abstracta Evaluación secuencial lenta Concurrencia async acotada

La v4 también corrigió diez bugs concretos de "grounding" de API; casos donde el código del GA suponía una interfaz para `TradingAgent` que no correspondía exactamente con la implementación real. Ese tipo de bug es invisible hasta que confrontas el código con el verdadero código fuente del agente: la v4 solo se validó tras releer línea por línea frente al archivo real.

## Por qué mezclar evolución y gradiente en vez de elegir uno u otro

Podrías preguntarte por qué no hacer simplemente RL puro, o evolución pura estilo NEAT. La respuesta cabe en una frase: el gradiente es excelente para afinar localmente (ajustar pesos continuos hacia un óptimo cercano), la evolución es excelente para explorar globalmente (descubrir arquitecturas y combinaciones de hiperparámetros que ningún gradiente puede alcanzar, porque el espacio de búsqueda discreto no es diferenciable). Usar uno sin el otro es privarte de una de las dos formas de exploración.

El precio a pagar es la complejidad de ingeniería; cuatro versiones no eran un lujo, era el número de iteraciones necesarias para que el bucle GA + RL dejara de autosabotearse (sobreajuste, pérdida de buenos individuos, pérdida de pesos adquiridos). Pero el resultado es un sistema que explora un espacio de diseño mucho más amplio que un simple grid search de hiperparámetros, manteniendo la eficacia local del gradiente para cada candidato evaluado.

## Próximo paso

Esta arquitectura evolutiva de un solo nivel (una población plana de genomas DQN) toca techo cuando el número de activos a cubrir sube. Eso motivó el paso a una arquitectura jerárquica de tres niveles (Asset Analysts → Sector Managers → Portfolio Allocator), con un GA operando de forma independiente en cada nivel... pero eso es tema de otro artículo.
