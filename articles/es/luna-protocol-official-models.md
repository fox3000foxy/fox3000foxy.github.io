---
title: "Luna Protocol: por qué fine-tuneé un modelo de 1,5 mil millones de parámetros sobre 50k muestras Discord, y por qué el few-shot priming lo cambió todo"
description: "Un modelo más pequeño entrenado sobre menos datos puede superar un modelo más grande, a condición de saber iniciarlo bien. He aquí por qué Luna Protocol pasó de un Hermes 3B a un fine-tune Qwen 1,5B, y por qué el few-shot priming se volvió el verdadero factor de progreso."
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
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "XTDNkYNEj/ElDp0JL0TnyO2FI6yJMLLgtCBDJoFsfAqVvdqw+k5a9E+XSRZTWN0CDT2kTgK7xglqxEg79gfYQg=="
---

# Luna Protocol: por qué fine-tuneé un modelo de 1,5 mil millones de parámetros sobre 50k muestras Discord, y por qué el few-shot priming lo cambió todo

En el [primer artículo](/articles/en/luna-protocol-discord-bot), construí un bot Discord que simula un ser humano: sueño, erratas, vacilaciones, olvidos, mensajes espontáneos. El sistema conductual aguantaba el tipo. El LLM tras todo eso era un modelo Hermes de 3 mil millones de parámetros, cuantizado en Q8_0, consumiendo 3 GB de VRAM.

Funcionaba. Pero estaba sobredimensionado.

Un bot Discord no necesita un modelo de 3 mil millones de parámetros para decir « nm just chillin, u ». Lo que necesita es **coherencia estilística**: la capacidad de conservar un tono conversacional preciso, mensaje tras mensaje, sin derivar hacia un modo «asistente corporate». Y resulta que un modelo más pequeño, entrenado sobre menos datos e iniciado con unos ejemplos, lo logra mejor que un modelo más grande que fuerza el paso vía un simple prompt de sistema.

Este artículo trata de los modelos oficiales de Luna Protocol: por qué existen, por qué 1,5B en vez de 3B, por qué 50k muestras de entrenamiento en vez de 7,3M, y por qué el few-shot priming pasó del estatus de «bonus simpático» al de corazón de todo el enfoque.

---

## El problema con el modelo 3B

La configuración original usaba `Discord-Micae-Hermes-3-3B.Q8_0.gguf`, un modelo de 3 mil millones de parámetros fine-tuneado sobre datos Discord. Producía buenas respuestas, pero:

| Métrica | Hermes-3-3B Q8_0 | Objetivo |
|--------|-------------------|--------|
| Uso VRAM | ~3 GB | < 1 GB |
| Generación de tokens | ~30 tok/s | ~60+ tok/s |
| Tamaño del archivo modelo | ~3,2 GB | < 1 GB |
| Arranque en frío | ~8s | ~3s |

Para un bot corriendo 24/7 en un servidor modesto, 3 GB de VRAM es mucho. Y la velocidad de generación, correcta para mensajes ocasionales, parecía lenta en respuestas en ráfaga o con varios canales activos.

La pregunta era: ¿se puede obtener el mismo estilo Discord-Dialogues con la mitad de parámetros?

---

## La decisión de fine-tuning: por qué 50k, no 7,3M

El dataset [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) contiene **7,3M de intercambios** y **17M de turnos de palabra**. Es un corpus masivo de verdaderas conversaciones Discord. El enfoque evidente habría sido entrenar sobre todo el dataset.

Hice lo inverso. Entrené sobre **50 000 muestras**, o sea menos del 1% de los datos disponibles.

He aquí por qué: **el tamaño del juego de entrenamiento afecta directamente el grado de sobreajuste del modelo respecto a su distribución de entrenamiento**.

Un modelo entrenado sobre 7,3M de ejemplos aprende una distribución estadística muy específica de las conversaciones. Se vuelve excelente reproduciendo esa distribución, pero también se vuelve **rígido**: tiene menos margen para adaptarse a nuevos patrones aportados en el momento de la inferencia.

Un modelo entrenado sobre 50k ejemplos aprende el tono y el registro general de las conversaciones Discord (informal, corto, abreviaturas, minúsculas), pero conserva bastante flexibilidad para ser **pilotado por ejemplos en contexto**. Los ejemplos few-shot no luchan contra una distribución masiva ya aprendida: vienen a completar una distribución más ligera.

Es la intuición central: **datos de entrenamiento limitados hacen el few-shot priming más eficaz**.

---

## El modelo: detalles técnicos

El modelo Luna Protocol es un **fine-tune QLoRA** de [Qwen2.5-1.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct):

| Parámetro | Valor |
|-----------|-------|
| Modelo base | `unsloth/Qwen2.5-1.5B-Instruct-bnb-4bit` |
| Método | QLoRA (4-bit) |
| Rango LoRA | `r=16`, `lora_alpha=16` |
| Módulos objetivo | `q/k/v/o_proj`, `gate/up/down_proj` |
| Parámetros entrenables | 18 464 768 / 1 562 179 072 (1,18 %) |
| Datos de entrenamiento | ~50 000 ejemplos (subconjunto de Discord-Dialogues) |
| Filtro | 8-512 tokens por muestra |
| Épocas | 2-3 |
| Material | Kaggle T4 |
| Framework | [Unsloth](https://github.com/unslothai/unsloth) |

El dataset es un fork preprocesado de Discord-Dialogues, filtrado para conservar solo turnos `user`/`assistant` limpios: solo intercambios usuario y asistente, sin mensajes sistema ni metadatos ni comandos de bot. Es importante para lo que sigue.

### Cuantizaciones disponibles

| Archivo | Cuantización | Tamaño | Notas |
|------|-------------|------|-------|
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q2_K.gguf` | Q2_K | 676 MB | Claramente degradado: desaconsejado |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf` | Q4_K_M | 986 MB | Buen compromiso tamaño/calidad (recomendado) |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q8_0.gguf` | Q8_0 | 1,65 GB | Mejor fidelidad estilística |

El modelo recomendado es **Q4_K_M**: menos de 1 GB, rápido, y preserva bien el estilo conversacional. El Q2_K se degrada demasiado para un modelo de este tamaño. El Q8_0 ofrece la mejor calidad pero consume 68% de memoria más.

---

## La ruptura del few-shot priming

Aquí la parte que lo cambió todo.

La ficha del modelo en HuggingFace lleva una advertencia:

> Con un prompt desnudo y sin arranque, este modelo tiende a recaer en el tono por defecto «asistente» de Qwen. Un corto arranque few-shot marca una gran diferencia.

Es una consecuencia directa de cómo se estructuraron los datos de entrenamiento.

### Por qué los prompts de sistema solos no funcionan

Los datos de entrenamiento Discord-Dialogues solo contienen turnos `user`/`assistant`. No hay **ningún ejemplo de rol sistema** en el juego de entrenamiento. El modelo nunca se entrenó a seguir prompts de sistema como directivas de estilo.

Cuando le das un prompt de sistema tipo «Te llamas Luna, habla de forma relajada», oye la instrucción pero no tiene un patrón aprendido sólido para traducirla en salida. Recae entonces en el comportamiento por defecto de Qwen: servicial, estructurado, ligeramente formal.

### Por qué los ejemplos few-shot funcionan

Cuando inyectas ejemplos de conversación en el mismo formato ChatML que el usado en el entrenamiento (con la estructura de turnos `user`/`assistant`), algo se dispara. El modelo reconoce el patrón de su entrenamiento y alinea su salida en consecuencia.

Así se ve un arranque few-shot en la práctica:

```yaml
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

Esos ejemplos se inyectan tras el prompt de sistema y antes de la verdadera conversación. El modelo los percibe como parte del historial de conversación, o sea como un intercambio real más que como instrucciones. Es una distinción esencial: le *muestras* cómo es el tono relajado en vez de *ordenárselo*.

### Antes / después

Sin arranque few-shot (prompt de sistema desnudo):

```
User: yo whats good
Bot: Hello! I am doing well, thank you for asking. How can I assist you today?
```

Con arranque few-shot (3 ejemplos):

```
User: yo whats good
Bot: nm just chillin, u
```

La diferencia es flagrante. El modelo adopta todo el registro: minúsculas, abreviaturas, tono relajado, respuestas cortas. Calca el estilo de los ejemplos más que el de los datos de entrenamiento de Qwen.

---

## Memoria y velocidad: las cifras concretas

El paso de Hermes-3-3B a Luna-Protocol-1.5B aporta ganancias medibles:

| Métrica | Hermes-3-3B Q8_0 | Luna-Protocol Q4_K_M | Mejora |
|--------|-------------------|----------------------|-------------|
| Uso VRAM | ~3 GB | ~986 MB | **67% menos** |
| Tamaño del archivo modelo | ~3,2 GB | ~986 MB | **69% más pequeño** |
| Generación de tokens | ~30 tok/s | ~60+ tok/s | **2x más rápido** |
| Arranque en frío | ~8s | ~3s | **62% más rápido** |
| Ventana de contexto | 8192 | 8192 | Idéntica |

### Por qué la ganancia de velocidad es real

Los modelos más pequeños son fundamentalmente más rápidos en inferencia. Con 1,5B de parámetros en vez de 3B:

- **Menos multiplicaciones matriciales** por token: las capas de atención, las capas FFN y la proyección de salida evolucionan todas linealmente con el número de parámetros
- **Mejor uso del caché**: el modelo más pequeño mete más de sus pesos en el caché L2/L3
- **Menos presión sobre el ancho de banda memoria**: menos bytes que leer desde la VRAM por token

En una configuración modesta, solo CPU (2 núcleos, sin GPU), el modelo 1,5B genera tokens a unas **2 veces la velocidad** del modelo 3B. Es la diferencia entre «huele a bot» y «parece una persona real escribiendo».

### El caché de prompt amplifica la ventaja

Luna Protocol usa `llama-server` con el caché de prompt activado (`--cache-reuse 256`). Eso significa que:

1. El primer mensaje de una sesión paga el coste completo del procesamiento del prompt (prompt de sistema + ejemplos few-shot + mensaje usuario)
2. Los mensajes siguientes solo procesan los *nuevos* tokens, porque el prefijo en caché se reutiliza
3. Con 5 ejemplos few-shot (~50-150 tokens), el sobrecoste se vuelve despreciable tras la primera petición

Los ejemplos few-shot se vuelven en la práctica «gratis» tras el primer mensaje de una sesión. El modelo se beneficia de un guiado de estilo a coste marginal nulo.

---

## La implementación: cómo funciona en código

El sistema few-shot de Luna Protocol es limpio y mínimo. Tres archivos lo gestionan todo.

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

La configuración es recargable en caliente. Modificas los ejemplos, guardas, y el bot adopta de inmediato el nuevo estilo, sin reinicio.

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

La función `injectFewShotIntoConversation()` los coloca justo tras el prompt de sistema:

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

El modelo recibe: `[prompt_sistema] + [ejemplos_few_shot] + [historial_de_conversación]`

---

## Conservar el estilo Discord-Dialogues

El dataset Discord-Dialogues de origen tiene una firma conversacional muy específica:

- **Mensajes cortos**: 32,8 tokens de media por turno
- **Registro informal**: abreviaturas, minúsculas, ausencia de puntuación
- **Intercambios rápidos**: varios intercambios cortos en vez de largos monólogos
- **Imperfecciones naturales**: erratas, «lol», «fr», «ngl», «tbh»

El modelo Luna Protocol preserva ese estilo gracias a dos mecanismos:

### 1. El fine-tuning desplaza la distribución base

Las 50k muestras de entrenamiento enseñan al modelo la **huella estadística** de las conversaciones Discord. Aprende que las respuestas son típicamente cortas, en minúsculas e informales. Eso aleja la salida por defecto del modelo del modo «asistente servicial» de Qwen.

### 2. El few-shot priming bloquea el resultado

Los ejemplos few-shot refuerzan justo los patrones aprendidos durante el fine-tuning. Actúan como un **anclaje estilístico**: aunque el modelo derive ligeramente hacia un tono más formal en una conversación larga, los ejemplos presentes en el contexto lo devuelven atrás.

La combinación es más potente que cada mecanismo por separado:
- Fine-tuning sin few-shot: el modelo es *globalmente* relajado pero inconsistente
- Few-shot sin fine-tuning: el modelo intenta seguir los ejemplos pero recae sin cesar en modo asistente
- Fine-tuning + few-shot: el modelo queda **constantemente** en personaje

---

## La filosofía: modelo más pequeño, prompting más listo

La sabiduría convencional en despliegue de LLM dice «más grande, mejor». Más parámetros, más datos de entrenamiento, más VRAM. Luna Protocol toma el camino inverso:

- **1,5B en vez de 3B**: mitad de parámetros, mitad de memoria, dos veces más rápido
- **50k muestras en vez de 7,3M**: menos datos de entrenamiento, más flexibilidad para el aprendizaje en contexto
- **Few-shot priming en vez de prompts de sistema**: mostrar al modelo lo que queremos, no solo decírselo

Es una decisión de diseño asumida, mucho más que una simple optimización técnica. Un bot Discord necesita seguir siendo un compañero conversacional ligero más que un asistente generalista. Debe decir «nm just chillin, u» de forma coherente, rápida, y sin engullir todo el presupuesto VRAM del servidor.

Resultado: un bot que corre en un VPS a 5 $/mes, genera tokens bastante rápido para dar la impresión de una escritura en tiempo real, y mantiene una personalidad coherente gracias a una combinación de fine-tuning y few-shot priming que vale más que la suma de sus partes.

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

### Lanzar

```bash
npm run dev                    # dev (recarga en caliente)
npm run build && npm start     # producción
./start.sh                     # PM2 (producción con llama-server)
```

---

## Conclusión

Los modelos Luna Protocol prueban que para una IA conversacional centrada en el estilo, **menos es mejor**. Un modelo de 1,5B entrenado sobre 50k muestras cuidadosamente elegidas, iniciado con unos ejemplos, supera un modelo de 3B entrenado sobre millones de ejemplos, por una fracción del coste en memoria y una velocidad de generación dos veces superior.

El few-shot priming constituye el mecanismo central para los modelos pequeños. Es lo que los hace viables para aplicaciones conversacionales en tiempo real. Los ejemplos hacen mucho más que «ayudar»: cambian fundamentalmente el comportamiento del modelo, calcando justo el formato sobre el que se entrenó.

El código es open source, el modelo está en HuggingFace, y el dataset es público. Si quieres construir un bot conversacional que dé la impresión de ser humano, la receta es: modelo pequeño, fine-tuning limitado, arranque few-shot sólido.

| Recurso | Enlace |
|----------|------|
| Repo GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Modelo (HuggingFace) | [fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues) |
| Dataset | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Primer artículo | [Luna Protocol: creé un bot Discord autónomo](/articles/en/luna-protocol-discord-bot) |
