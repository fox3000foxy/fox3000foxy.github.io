---
title: "Luna Protocol: por qué hice fine-tuning de un modelo de 1500M de parámetros con 50k muestras de Discord y convertí el few-shot priming en el arma secreta"
description: "Un modelo más pequeño entrenado con menos datos puede superar a uno más grande, si sabes cómo prepararlo. Esta es la razón por la que Luna Protocol pasó de un Hermes de 3000M a un fine-tune de Qwen de 1500M, y por qué el few-shot priming se convirtió en el verdadero factor decisivo."
date: 2026-07-17
authors:
  - fox3000foxy
tags:
  - discord
  - llm
  - fine-tuning
  - few-shot-learning
  - qwen
  - unsloth
  - open-source
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "WP8Y862LZggE+BBb/cAitmDG+GinX4U6MQ8gSeuw9rJ40KCnsUqsHlsLNrcDyaKiYWZHJAEMYeLN3ctxwv08Ew=="
---

# Luna Protocol: por qué hice fine-tuning de un modelo de 1500M de parámetros con 50k muestras de Discord y convertí el few-shot priming en el arma secreta

En el [primer artículo](/articles/en/luna-protocol-discord-bot), construí un bot de Discord que simula a un ser humano: sueño, errores de tipeo, dudas, olvidos, mensajes espontáneos. El sistema de comportamiento funcionaba muy bien. El LLM detrás de todo era un modelo Hermes de 3000M de parámetros, cuantizado a Q8_0, que consumía 3 GB de VRAM.

Funcionaba. Pero era excesivo.

Un bot de Discord no necesita un modelo de 3000M de parámetros para decir "nm just chillin, u". Lo que necesita es **consistencia de estilo**: la capacidad de mantener un tono conversacional específico, mensaje tras mensaje, sin desviarse hacia un modo de asistente corporativo. Y resulta que un modelo más pequeño, entrenado con menos datos y preparado con algunos ejemplos, logra eso mejor que un modelo más grande que fuerza el resultado mediante un simple prompt de sistema.

Este artículo trata sobre los modelos oficiales de Luna Protocol: por qué existen, por qué son de 1500M en lugar de 3000M, por qué se usaron 50k muestras de entrenamiento en lugar de 7,3M, y por qué el few-shot priming pasó de ser un extra agradable a ser el núcleo de todo el enfoque.

---

## El problema con el modelo de 3000M

La configuración original usaba `Discord-Micae-Hermes-3-3B.Q8_0.gguf`, un modelo de 3000M de parámetros ajustado con datos de Discord. Producía buenas respuestas, pero:

| Métrica | Hermes-3-3B Q8_0 | Objetivo |
|--------|-------------------|--------|
| Uso de VRAM | ~3 GB | < 1 GB |
| Generación de tokens | ~30 tok/s | ~60+ tok/s |
| Tamaño del archivo del modelo | ~3,2 GB | < 1 GB |
| Tiempo de arranque en frío | ~8s | ~3s |

Para un bot que funciona 24/7 en un servidor modesto, 3 GB de VRAM es mucho. Y la velocidad de generación, aunque aceptable para mensajes ocasionales, se sentía lenta durante ráfagas de respuestas o cuando varios canales estaban activos a la vez.

La pregunta era: ¿se puede lograr el mismo estilo de Discord-Dialogues con la mitad de parámetros?

---

## La decisión de fine-tuning: por qué 50k y no 7,3M

El conjunto de datos [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) contiene **7,3M de intercambios** y **17M de turnos**. Es un corpus masivo de conversaciones reales de Discord. El enfoque obvio habría sido entrenar con todo el conjunto de datos.

Hice lo contrario. Entrené con **50.000 muestras**, menos del 1% de los datos disponibles.

Esta es la razón: **el tamaño del conjunto de entrenamiento afecta directamente cuánto sobreajusta el modelo a su distribución de entrenamiento**.

Un modelo entrenado con 7,3M de ejemplos aprende una distribución estadística muy específica de las conversaciones. Se vuelve excelente para reproducir esa distribución, pero también se vuelve **rígido**: tiene menos flexibilidad para adaptarse a nuevos patrones que se le proporcionan en el momento de la inferencia.

Un modelo entrenado con 50k ejemplos aprende el tono y el registro general de las conversaciones de Discord (informal, breve, con abreviaturas, en minúsculas), pero conserva suficiente flexibilidad para dejarse **guiar por ejemplos en contexto**. Los ejemplos few-shot no compiten contra una distribución masiva ya aprendida, sino que complementan una más ligera.

Esta es la idea clave: **los datos de entrenamiento limitados hacen que el few-shot priming sea más eficaz**.

---

## El modelo: detalles técnicos

El modelo Luna Protocol es un **fine-tune QLoRA** de [Qwen2.5-1.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct):

| Parámetro | Valor |
|-----------|-------|
| Modelo base | `unsloth/Qwen2.5-1.5B-Instruct-bnb-4bit` |
| Método | QLoRA (4-bit) |
| Rango LoRA | `r=16`, `lora_alpha=16` |
| Módulos objetivo | `q/k/v/o_proj`, `gate/up/down_proj` |
| Parámetros entrenables | 18.464.768 / 1.562.179.072 (1,18%) |
| Datos de entrenamiento | ~50.000 ejemplos (subconjunto de Discord-Dialogues) |
| Filtro | 8-512 tokens por muestra |
| Épocas | 2-3 |
| Hardware | Kaggle T4 |
| Framework | [Unsloth](https://github.com/unslothai/unsloth) |

El conjunto de datos es un fork preprocesado de Discord-Dialogues, filtrado para contener solo turnos limpios de `user`/`assistant`: sin mensajes de sistema, sin metadatos, sin comandos de bot. Esto es importante para más adelante.

### Cuantizaciones disponibles

| Archivo | Cuantización | Tamaño | Notas |
|------|-------------|------|-------|
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q2_K.gguf` | Q2_K | 676 MB | Notablemente degradado; no recomendado |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf` | Q4_K_M | 986 MB | Buen equilibrio tamaño/calidad (recomendado) |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q8_0.gguf` | Q8_0 | 1,65 GB | Mejor fidelidad de estilo |

El modelo recomendado es **Q4_K_M**: pesa menos de 1 GB, es rápido y conserva bien el estilo conversacional. El Q2_K se degrada demasiado en un modelo de este tamaño. El Q8_0 ofrece la mejor calidad, pero usa un 68% más de memoria.

---

## El avance del few-shot priming

Aquí está la parte que lo cambió todo.

La ficha del modelo en HuggingFace incluye una advertencia:

> Con un prompt desnudo y sin preparación, este modelo tiende a caer en el tono de asistente predeterminado de Qwen. Un breve few-shot priming marca una gran diferencia.

Esto no es un error, sino una consecuencia directa de cómo se estructuraron los datos de entrenamiento.

### Por qué los prompts de sistema por sí solos no funcionan

Los datos de entrenamiento de Discord-Dialogues contienen únicamente turnos `user`/`assistant`. **No hay ejemplos con rol de sistema** en el conjunto de entrenamiento. El modelo nunca fue entrenado para seguir prompts de sistema como directivas de estilo.

Cuando se le da un prompt de sistema como "Te llamas Luna, habla de forma casual", el modelo oye la instrucción, pero no tiene un patrón aprendido sólido para traducirla en una salida concreta. Vuelve entonces al comportamiento predeterminado de Qwen: servicial, estructurado, ligeramente formal.

### Por qué funcionan los ejemplos few-shot

Cuando se inyectan conversaciones de ejemplo en el mismo formato ChatML con el que se entrenó el modelo (usando la estructura de turnos `user`/`assistant`), algo hace clic. El modelo reconoce el patrón proveniente de su entrenamiento y ajusta su salida para coincidir con él.

Así es como se ve un few-shot priming en la práctica:

```yaml
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

Estos ejemplos se inyectan después del prompt de sistema y antes de la conversación real. El modelo los percibe como parte del historial de conversación, no como instrucciones. Esta es una distinción crucial: no se le *dice* que sea casual, se le *muestra* cómo es serlo.

### Antes y después

Sin few-shot priming (prompt de sistema desnudo):

```
User: yo whats good
Bot: Hello! I am doing well, thank you for asking. How can I assist you today?
```

Con few-shot priming (3 ejemplos):

```
User: yo whats good
Bot: nm just chillin, u
```

La diferencia es enorme. El modelo no solo produce palabras distintas: adopta todo el registro: minúsculas, abreviaturas, tono casual, respuestas cortas. Se ajusta al estilo de los ejemplos, no al de los datos de entrenamiento de Qwen.

---

## Memoria y velocidad: las cifras concretas

El cambio de Hermes-3-3B a Luna-Protocol-1.5B ofrece mejoras medibles:

| Métrica | Hermes-3-3B Q8_0 | Luna-Protocol Q4_K_M | Mejora |
|--------|-------------------|----------------------|-------------|
| Uso de VRAM | ~3 GB | ~986 MB | **67% menos** |
| Tamaño del archivo | ~3,2 GB | ~986 MB | **69% más pequeño** |
| Generación de tokens | ~30 tok/s | ~60+ tok/s | **2 veces más rápido** |
| Arranque en frío | ~8s | ~3s | **62% más rápido** |
| Ventana de contexto | 8192 | 8192 | Igual |

### Por qué la ganancia de velocidad es real

Los modelos más pequeños no son solo "un poco menos lentos": son fundamentalmente más rápidos en inferencia. Con 1500M de parámetros en lugar de 3000M:

- **Menos multiplicaciones de matrices** por token: las capas de atención, las capas FFN y la proyección de salida escalan de forma lineal con el número de parámetros
- **Mejor uso de la caché**: el modelo más pequeño cabe mejor en la caché L2/L3
- **Menor presión sobre el ancho de banda de memoria**: menos bytes que leer desde la VRAM por token

En una configuración modesta solo con CPU (2 núcleos, sin GPU), el modelo de 1500M genera tokens a aproximadamente **el doble de velocidad** que el de 3000M. Esa es la diferencia entre "se nota que es un bot" y "parece una persona escribiendo".

### El caché de prompt amplifica la ventaja

Luna Protocol usa `llama-server` con el caché de prompt activado (`--cache-reuse 256`). Esto significa que:

1. El primer mensaje de una sesión paga el coste completo de procesar el prompt (prompt de sistema + ejemplos few-shot + mensaje del usuario)
2. Los mensajes siguientes solo procesan los tokens *nuevos*: el prefijo en caché se reutiliza
3. Con 5 ejemplos few-shot (~50-150 tokens), el sobrecoste es insignificante después de la primera solicitud

Los ejemplos few-shot resultan prácticamente "gratis" tras el primer mensaje de una sesión. El modelo obtiene guía de estilo sin coste marginal.

---

## La implementación: cómo funciona en el código

El sistema few-shot de Luna Protocol es limpio y minimalista. Tres archivos se encargan de todo.

### 1. Configuración (`config.yml`)

```yaml
few_shot_enabled: true
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
  - user: "whats up"
    assistant: "yooo not much, what about you"
  - user: "how was your day"
    assistant: "it was alright, nothing crazy happened lol"
```

La configuración se puede recargar en caliente. Cambia los ejemplos, guarda, y el bot adopta el nuevo estilo de inmediato, sin necesidad de reiniciar.

### 2. Formateo e inyección (`src/core/few-shot.ts`)

La función `formatFewShotExamples()` convierte los ejemplos YAML en objetos de mensaje ChatML:

```typescript
export function formatFewShotExamples(
  examples: FewShotExample[],
  username = "user"
): Array<{ role: "user" | "assistant"; content: string }> {
  const messages = [];
  for (const example of examples) {
    messages.push({ role: "user", content: `${username}: ${example.user}` });
    messages.push({ role: "assistant", content: example.assistant });
  }
  return messages;
}
```

La función `injectFewShotIntoConversation()` los coloca justo después del prompt de sistema:

```typescript
export function injectFewShotIntoConversation(
  messages: Message[],
  fewShotMessages: Message[]
): Message[] {
  const systemMessage = messages[0];
  const userMessages = messages.slice(1);
  return [systemMessage, ...fewShotMessages, ...userMessages];
}
```

### 3. Integración (`src/core/llm-client.ts`)

Antes de cada llamada al LLM, los ejemplos few-shot se inyectan si están activados:

```typescript
let finalMessages = messages;
if (FEW_SHOT_ENABLED && FEW_SHOT_EXAMPLES.length > 0) {
  const fewShotMessages = formatFewShotExamples(FEW_SHOT_EXAMPLES);
  finalMessages = injectFewShotIntoConversation(messages, fewShotMessages);
}
```

El modelo recibe: `[prompt_de_sistema] + [ejemplos_few_shot] + [historial_de_conversación]`

---

## Manteniendo el estilo de Discord-Dialogues

El conjunto de datos original de Discord-Dialogues tiene una firma conversacional muy específica:

- **Mensajes cortos**: un promedio de 32,8 tokens por turno
- **Registro informal**: abreviaturas, minúsculas, ausencia de puntuación
- **Intercambios rápidos**: múltiples intercambios breves en lugar de monólogos largos
- **Imperfecciones naturales**: errores de tipeo, "lol", "fr", "ngl", "tbh"

El modelo Luna Protocol preserva este estilo mediante dos mecanismos:

### 1. El fine-tuning desplaza la distribución base

Las 50k muestras de entrenamiento enseñan al modelo la **huella estadística** de las conversaciones de Discord. Aprende que las respuestas suelen ser cortas, en minúsculas e informales. Esto aleja la salida predeterminada del modelo del modo de asistente servicial de Qwen.

### 2. El few-shot priming lo fija en su lugar

Los ejemplos few-shot refuerzan exactamente los patrones que el modelo aprendió durante el fine-tuning. Actúan como un **ancla de estilo**: incluso si el modelo se desvía ligeramente hacia un tono más formal durante una conversación larga, los ejemplos presentes en el contexto lo hacen volver.

La combinación es más potente que cada mecanismo por separado:
- Fine-tuning sin few-shot: el modelo es *generalmente* casual, pero inconsistente
- Few-shot sin fine-tuning: el modelo intenta seguir los ejemplos, pero vuelve constantemente al modo asistente
- Fine-tuning + few-shot: el modelo se mantiene **de forma constante** en el personaje

---

## La filosofía: modelo más pequeño, prompting más inteligente

La sabiduría convencional en el despliegue de LLM dice que "más grande es mejor". Más parámetros, más datos de entrenamiento, más VRAM. Luna Protocol toma el camino contrario:

- **1500M en lugar de 3000M**: la mitad de parámetros, la mitad de memoria, el doble de velocidad
- **50k muestras en lugar de 7,3M**: menos datos de entrenamiento, más flexibilidad para el aprendizaje en contexto
- **Few-shot priming en lugar de prompts de sistema**: mostrarle al modelo lo que quieres, no solo decírselo

Esto no es solo una optimización técnica, es una filosofía de diseño. Un bot de Discord no necesita ser un asistente de propósito general. Necesita decir "nm just chillin, u" de forma consistente, rápida y sin devorar todo el presupuesto de VRAM del servidor.

El resultado: un bot que funciona en un VPS de 5 $/mes, genera tokens lo bastante rápido como para parecer una escritura en tiempo real, y mantiene una personalidad coherente gracias a una combinación de fine-tuning y few-shot priming que vale más que la suma de sus partes.

---

## Puesta en marcha

### Descargar el modelo

```bash
npm run download-model
# Descarga Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf
```

O manualmente desde [HuggingFace](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues).

### Configurar

```yaml
# config.yml
llama_model_path: "./models/Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf"
few_shot_enabled: true
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

### Ejecutar

```bash
npm run dev                    # desarrollo (recarga en caliente)
npm run build && npm start     # producción
./start.sh                     # PM2 (producción con llama-server)
```

---

## Conclusión

Los modelos Luna Protocol demuestran que, para una IA conversacional centrada en el estilo, **menos es más**. Un modelo de 1500M entrenado con 50k muestras cuidadosamente elegidas, preparado con algunos ejemplos, supera a un modelo de 3000M entrenado con millones de ejemplos, con una fracción del coste de memoria y el doble de velocidad de generación.

El few-shot priming no es solo un extra agradable para los modelos pequeños. Es el mecanismo que los hace viables para aplicaciones conversacionales en tiempo real. Los ejemplos no solo "ayudan": cambian fundamentalmente el comportamiento del modelo, al ajustarse exactamente al formato con el que fue entrenado.

El código es de código abierto, el modelo está en HuggingFace y el conjunto de datos es público. Si quieres construir un bot conversacional que se sienta humano, la receta es: modelo pequeño, fine-tuning limitado, few-shot priming sólido.

| Recurso | Enlace |
|----------|------|
| Repositorio de GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Modelo (HuggingFace) | [fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues) |
| Conjunto de datos | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Primer artículo | [Luna Protocol: creé un bot de Discord autónomo](/articles/en/luna-protocol-discord-bot) |