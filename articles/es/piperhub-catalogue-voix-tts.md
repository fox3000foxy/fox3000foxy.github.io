---
title: "PiperHub: 536 voces TTS open source, 7 emociones en un modelo, cero GPU, cero factura"
description: "VITS, espeak, ONNX, LJSpeech: cómo Piper hace hablar a una Raspberry Pi. Fortune multi en 7 emociones, Kokoro 82M, PocketTTS, sanoTTS, ElevenLabs, y pipertts nativo 10x más rápido que el wrapper de Python."
date: 2026-11-12
tags:
  - tts
  - piper
  - open-source
  - typescript
  - ai
  - catalogue
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "OLQsuR4OOS5+fgjSVcIPMfLqUNA1NoHkeb5eq1b4Zx3WTdu9JiicamUvti71sb+JLQOnqKUgj5i1H0cC1ZVhOQ=="
---

## Introduction

Hacer hablar a un bot de Discord cuesta caro. No el texto: un LLM local genera frases por unos céntimos de GPU. La voz, en cambio, se paga en cada frase. Las API de síntesis cobran por carácter, y cuando el bot habla toda la noche, la factura sube.

Ese es el problema que tuve con Luna Protocol. Mi bot de Discord genera sus mensajes con un LLM local, luego los lee en voz alta con una voz Piper, los convierte a OGG y los envía como mensajes de voz. Todo en mi propio servidor, por 0 euros por frase, incluso a las 3 de la mañana cuando a Luna le da por contar su vida ella sola.

Quedarte en 0 euros significa encontrar voces gratis y alojarlas tú. Y ahí se complicó: modelos repartidos por decenas de repos de Hugging Face, licencias poco claras, sin forma de saber de dónde viene tal voz ni si todavía funciona. Así que construí [PiperHub](https://piperhub.org/), un catálogo open source de voces para Piper TTS.

Las cifras de hoy: **536 modelos** publicados, **71 idiomas** representados, **3755 speakers** listados. Cada modelo está enlazado a su dataset de origen cuando lo conozco. La procedencia forma parte del sonido, como dice la página principal.

Queda una pregunta que me hacen a menudo: ¿qué vale Piper frente a Kokoro, PocketTTS, sanoTTS y ElevenLabs? ¿Y por qué el módulo `pipertts` de Fortune es 10x más rápido que el wrapper oficial de Python? Este artículo abre los motores, con código para probarlo.

## PiperHub, el catálogo

Antes de abrir los motores, veamos el problema que resuelve PiperHub.

### De dónde vienen las voces

El código está en [github.com/fox3000foxy/piper-bank](https://github.com/fox3000foxy/piper-bank). Astro, sitio estático, cero servidor: el inglés en la raíz, 15 locales más bajo `/<code>/` (fr, de, es, it, pt, ru, tr, ja, ko, zh, id, hi, ar, vi, th). El mismo patrón que mi blog, de hecho.

Nadie edita la fuente de la verdad a mano. Es un pipeline:

```bash
npm install
npm run data    # regenera src/data/*.json (python3 scripts/generate_data.py)
npx astro dev   # dev local
npm run build   # build estática en dist/
```

En concreto: un repo crawler mantiene `models_mapping.csv` y `datasets_mapping.csv`, las voces espejo viven en Hugging Face, los samples son archivos de audio. `npm run data` lo descarga todo y escupe `src/data/*.json`. El sitio solo lee JSON estático.

En los datos brutos del momento (555 entradas, el sitio muestra 536, el crawl siempre va un poco por delante de la vista):

| Calidad | Modelos |
|---|---|
| medium | 437 |
| high | 67 |
| low | 50 |

| Sample rate | Modelos |
|---|---|
| 22050 Hz | 486 |
| 16000 Hz | 47 |

486 voces en 22050 Hz, el estándar Piper. 47 en 16000 Hz, las voces pequeñas y rápidas para embedded. El fonemizador es `espeak` en 509 casos. Volveré a eso, es el corazón del sistema.

### La procedencia, o por qué cada modelo tiene un dataset

Lo que hace útil a PiperHub en vez de ser solo una lista es el enlace modelo <-> dataset. Ejemplo tomado de la home: la voz **Astra - Valorant Piper TTS** está enlazada al dataset **Astra - LJSpeech Dataset**. Abres ambas páginas, verificas los repos y las licencias de cada lado.

130 datasets referenciados. Y el catálogo es honesto sobre el estado de las tropas: 25 modelos marcados `usable: false` (archivos rotos, o formato `piperPlus` que pide un runtime fork). El módulo `pipertts` rechaza estas voces con un error explícito en vez de fallar de forma rara más tarde. 48 modelos son multi-speaker, incluidos los dos que nos van a interesar.

En guías, el sitio hace el trabajo en tres pasos: **Build a dataset**, **Train a voice**, **Use a voice**, más una página Piper Plus. Dataset en formato LJSpeech como entrada, ONNX como salida. Fácil de decir, largo de hacer, de ahí la sección siguiente.

## Piper bajo el capó: VITS, espeak, ONNX

### Una frase, tres pasos

Cuando le pides a Piper que diga "bonjour", pasa esto:

```
"bonjour"
  -> [phonémisation espeak-ng] -> b O~ Z u R
  -> [encodeur VITS + flow + décodeur] -> waveform 22050 Hz
```

Cero vocoder separado. Eso es VITS: un modelo end-to-end que va del texto (fonemizado) al waveform directamente. Donde los pipelines viejos hacían texto -> espectrograma (Tacotron) y luego espectrograma -> audio (HiFi-GAN, dos modelos, dos entrenamientos), VITS lo aprende todo de golpe con un VAE condicional, flows normalizantes y un discriminador tipo GAN en el decodificador. Un solo entrenamiento, un solo modelo, una sola exportación ONNX.

El decodificador escupe 22050 Hz directamente. A ese sample rate, un segundo de voz son 22050 números. El modelo es pequeño (unas decenas de MB en calidad medium) y la inferencia es pura CPU: multiplicaciones de matrices en un grafo ONNX optimizado. De ahí la Raspberry Pi como objetivo oficial. Piper nació en Rhasspy, un asistente de voz open source hecho para correr en Pi.

### espeak-ng, el fonemizador que hace todo el trabajo sucio

Antes de VITS, hay que transformar texto en fonemas. 509 modelos de 555 usan `espeak`:

```bash
echo "bonjour" | espeak-ng --ipa -v fr
# bO~'ZuR
```

espeak-ng conoce la pronunciación de decenas de idiomas. El modelo VITS nunca aprende la ortografía francesa con sus `eau` que se pronuncian `o`. Aprende de fonemas a sonido. Eso simplifica muchísimo el entrenamiento y explica por qué Piper cubre 71 idiomas: para un idioma nuevo, conectas la voz espeak correspondiente y entrenas.

Las que pasan de espeak tienen su propio fonemizador, y ahí se pone exótico: `hebrew` (Nakdimon ONNX + 494 líneas de reglas IPA), `pinyin` (BERT g2pW completo con desambiguación de polífonos, el mismo carácter chino se pronuncia distinto según la palabra), `thai` (verdadero TLTK sin modificar), `japanese` (segmentación lindera + UniDic). El módulo `pipertts` los trae los siete, verificados idénticos a la referencia Python. Volveré a eso.

### El dataset: LJSpeech, siempre LJSpeech

El formato estándar de entrenamiento es LJSpeech: una carpeta `wavs/` llena de clips, más un `metadata.csv`:

```
LJ001-0001|Printing, in the only sense with which we are at present concerned...|printing in the only sense...
LJ001-0002|in being comparatively modern...|in being comparatively modern...
```

`fileid|transcription|normalized`, un clip es una frase, unos segundos. El dataset original son 13.000 frases en inglés leídas por una sola locutora, dominio público. Para entrenar una voz francesa, grabas la misma estructura en francés: texto + audio alineados, unas horas bastan para un medium correcto, más para un high.

Las tres calidades del catálogo corresponden más o menos al tamaño del modelo + el tiempo de entrenamiento. Low: pequeño, rápido, robótico. Medium: el punto ideal, con 437 modelos. High: más grande, más lento, más natural, 67 modelos, incluidos los Fortune.

### Los tres botones mágicos

Cada voz Piper expone tres parámetros de inferencia, con valores casi universales:

```json
"inference": { "noise_scale": 0.667, "length_scale": 1, "noise_w": 0.8 }
```

- `noise_scale` (0.667): variabilidad de la voz. Más alto es más expresivo, más bajo es más estable. La salida es estocástica: dos síntesis de la misma frase dan dos audios un poco distintos.
- `noise_w` (0.8): variabilidad del timing, el ritmo.
- `length_scale` (1.0): velocidad. Por encima de 1 frena, por debajo acelera. La forma más simple de hacer que Luna hable más rápido cuando se emociona.

Quédate con `noise_scale`, servirá para las emociones.

## Fortune multi: 7 emociones, 1 solo ONNX

Bien, pasemos a la estrella local.

El catálogo lista tres modelos Fortune entrenados por ItsRealFortune (hola):

| Modelo | Repo | Voces |
|---|---|---|
| ItsRealFortune - French (FR) High | `fox3000foxy/piper-fortune-v6` | 1 (voice-0) |
| ItsRealFortune - French (FR) **Multi** High | `fox3000foxy/piper-checkpoints-fortune-fr-multi` | **7** |
| ItsRealFortune - English (EN) **Multi** High | `fox3000foxy/piper-checkpoints-fortune-en-multi` | **7** |

El multi FR es esto:

```
normal, joyeuse, storytelling, colere, triste, surprise, interrogative
```

Siete versiones emocionales en **un solo archivo ONNX**. El multi EN igual, con una errata histórica en los nombres: `suprised` en vez de `surprised`. Está en los pesos, la conservo, forma parte del folclore.

### Cómo funciona un speakerId

VITS multi-speaker es el mismo modelo con una entrada más: un embedding de speaker. En el entrenamiento, cada clip va etiquetado con su estilo, el modelo aprende una tabla de embeddings (una por estilo) a la vez que el resto. En inferencia, eliges la fila de la tabla:

```ts
import { PiperNativeTTS } from "pipertts";

const tts = await PiperNativeTTS.load({
  model: "hub:itsrealfortune-french-fr-multi-high",
  modelsDir: "./models",
});

const styles = [
  "normal", "joyeuse", "storytelling",
  "colere", "triste", "surprise", "interrogative",
];

for (let i = 0; i < styles.length; i++) {
  const r = await tts.synthesize("Quelle merveilleuse nouvelle !", {
    speakerId: i,           // 0 = normal ... 5 = surprise
    outputFile: `./fortune-${styles[i]}.wav`,
  });
}
```

Misma frase, siete lecturas. `speakerId: 5` (surprise) con un `noise_scale` un poco alto, y tienes una exclamación creíble. `speakerId: 4` (triste), `length_scale: 1.1` para frenar, y tienes un anuncio fúnebre. Así modula Luna su voz: el cerebro elige la emoción (valencia/arousal, ver mi artículo sobre centroides), el TTS elige el speakerId.

El dataset detrás se llama sobriamente **Fortune French - Dataset**, con una licencia llamada "Fortune's Café". Sí, la licencia se llama como un café. No, se queda.

### Por qué es listo en lo económico

Siete emociones es una sola descarga, una sola carga en RAM, una sola sesión ONNX. La alternativa (siete modelos separados) multiplicaría el almacenamiento y obligaría a recargar el grafo en cada cambio de emoción, imposible para un bot que cambia de tono en mitad de la frase. Aquí, `speakerId` es solo un índice en un tensor. Coste marginal: cero.

## Los competidores: Kokoro, PocketTTS, sanoTTS

Piper comparte la CPU con tres rivales serios, tres filosofías distintas.

### Kokoro 82M, el rey calidad/precio

[Kokoro](https://huggingface.co/hexgrad/Kokoro-82M), por hexgrad. 82 millones de parámetros, arquitectura StyleTTS 2 modificada con decodificador ISTFTNet, **sin paso de difusión**. La ausencia de difusión lo hace todo: ningún bucle de denoising iterativo, así que inferencia ultrarrápida.

| | Kokoro-82M |
|---|---|
| Params | 82M |
| Pesos | ~300 MB (164 MB en FP16) |
| Licencia | Apache 2.0 (comercial OK) |
| Idiomas | 8, 54 voces preset + blending |
| CPU | casi tiempo real |
| GPU | 36 a 96x tiempo real |
| Tests ciegos | al nivel de Google y Amazon |

Entrenado con menos de 100h de audio por unos 1000 dólares, y los oyentes ciegos lo ponen al nivel de las voces premium de Google y Amazon. Por eso explotó: calidad premium, gratis, local, permisivo.

Frente a Piper: Kokoro gana en naturalidad pura (StyleTTS 2 > VITS pequeño) y licencia (Apache 2.0 contra motor GPL-3.0 para Piper). Piper gana en cobertura (71 idiomas contra 8, 3755 speakers contra 54 voces) y ecosistema de voces comunitarias. Para narración en inglés, Kokoro es duro de batir. Para francés con 7 emociones, turco o suajili, Piper suele ser el único en liza.

### PocketTTS (Kyutai), la clonación en CPU

[Kyutai](https://kyutai.org/tts/) juega otra partida: modelo pequeño **con clonación de voz** que corre en CPU.

| Modelo | Params | WER | UTMOS | SIM | Velocidad CPU (1 hilo) |
|---|---|---|---|---|---|
| Pocket TTS | ~100M | 0.92% | 4.364 | 0.923 | 2.8x tiempo real |
| Pocket TTS small | 1.9M / 6.9M / 18.2M | - | - | - | CPU, clonación incluida |

WER bajo 1% (pronuncia bien), UTMOS 4.36 (calidad percibida excelente), SIM 0.923 (el clon se parece de verdad al objetivo). Y las versiones small bajan a **1.9M parámetros** con clonación. 1.9M. Mi router Sabaki casi ocupa eso en JSON.

Frente a Piper: PocketTTS gana en clonación (Piper lee con voces fijas) y compacidad del flagship. Piper gana en idiomas (el small es inglés only por ahora) y madurez del ecosistema (536 voces listas contra "entrena la tuya").

### sanoTTS, el modelo que cabe en un chip de 3 dólares

[sanoTTS](https://github.com/ampixa/sanoTTS) (`sano` es "pequeño" en nepalí), es el Bareiron del TTS: un stack neuronal completo que va de fonemas a PCM 22.05 kHz **en microcontrolador**.

| Sistema | Params | SCOREQ | UTMOS | DNS-SIG |
|---|---|---|---|---|
| sanoTTS (heart-nano) | 0.29M | 2.29 | 2.45 | 3.35 |
| TinyTTS | 1.62M | 3.94 | 3.65 | 3.62 |

0.29M parámetros. 2 MB por voz. `pip install sanotts`, `sanotts say "Hello" --voice amy`, y habla. En navegador también.

Pero mira los scores: SCOREQ 2.29 contra 3.94 para TinyTTS, UTMOS 2.45. Habla, sí. Canta, no. Es el tradeoff final: con 0.29M cabes en todas partes pero la calidad sigue al tamaño. Piper medium son 100x más pesos para una voz de otra liga.

### La tabla resumen

| | Piper | Kokoro 82M | PocketTTS | sanoTTS |
|---|---|---|---|---|
| Params típicos | ~10-60M | 82M | ~100M / 2-18M | 0.3-1.4M |
| Idiomas | 71 | 8 | EN (+ smalls EN) | multilingüe, pequeño |
| Voces disp. | 3755 speakers | 54 + blending | clonación (la tuya) | pocas voces |
| Clonación | no | no (nativo) | **sí, CPU** | no |
| Licencia motor | GPL-3.0 | Apache 2.0 | open (Kyutai) | open |
| Entrenable en casa | sí (LJSpeech) | sí (más pesado) | sí | sí |
| Calidad FR | buena (multi emoción) | aceptable (EN-first) | EN-only | floja |

Tu elección depende de tu límite, no hay ganador absoluto: calidad EN pura -> Kokoro. Clonación CPU -> PocketTTS. Microcontrolador -> sanoTTS. Cobertura de idiomas + voces francesas emocionales + cero infra -> Piper.

## ElevenLabs, el Goliat facturado

Y luego está ElevenLabs. 70+ idiomas, Eleven v3 expresivo con audio tags y diálogos dramáticos, calidad top en blind tests. El Jev del TTS, en cierto modo: todo el mundo lo ha visto pasar, todo el mundo ha hecho benchmark contra él.

El pricing 2026, en cifras redondas:

| Modelo API | Precio / 1000 caracteres |
|---|---|
| Flash / Turbo, v3 Conversational | $0.05 |
| Multilingual v2, Eleven v3 | $0.10 |

1000 caracteres son más o menos 1 minuto de audio. O sea $0.05 a $0.10 el minuto. El plan Pro de $99 incluye unos 990k caracteres, el overage pega con la misma tarifa. Para un canal de YouTube que saca un vídeo al día con voz en off (mi `valorant-short-maker` hace justo eso, pero con Piper gratis), cuenta $1.50 a $3 al mes por cada minuto diario de voz en off. Diez minutos al día: $15 a $30/mes. Se puede pagar, pero se cuenta.

Cuándo vale la pena: cuando la voz **es** el producto (doblaje, audiolibro, publi), cuando necesitas 70 idiomas mañana por la mañana, cuando la clonación tiene que ser perfecta a la primera. En cambio nunca vale la pena para: bot de Discord que habla toda la noche, notificaciones internas, dev, volúmenes que explotan. Luna contando su vida a las 3 de la mañana en ElevenLabs es mi factura de la luz llorando.

El cálculo es simple: Piper es 0 euros marginal, calidad "buena". ElevenLabs es contador girando, calidad "excelente". Entre los dos hay un mundo donde "buena y gratis" gana. Esa es toda la apuesta de PiperHub.

## pipertts: por qué lo nativo humilla al wrapper de Python por 10x

El repo [itsrealfortune/pipertts](https://github.com/itsrealfortune/pipertts), 75 commits: un port nativo de Piper en TypeScript. Título del README: "In-process Piper TTS for Node.js. No Python required."

### El coste del spawn

El wrapper histórico (`PiperTTS`) es `python3 -m piper` lanzado en subproceso **en cada síntesis**:

```
synthèse = spawn(python) + chargement du modèle + inférence + kill
```

Cada frase paga el arranque del intérprete + la carga de los pesos. Medido en `en_US-lessac-medium`: **~2.2s por línea**.

Lo nativo (`PiperNativeTTS`) mantiene la sesión ONNX **caliente en memoria**:

```
load une fois -> session persistante -> inférence par phrase
```

Medido igual: **~0.22s por línea**. El 10x sale de ahí: matas el spawn y la recarga, la inferencia milagrosa no tiene nada que ver. La inferencia ONNX en sí es la misma en ambos lados.

De bonus, la primera carga cachea el grafo optimizado junto al `.onnx` (`<model>.ortopt-<platform>-<arch>-v<ort>.onnx`), lo que hace las cargas siguientes un 35% más rápidas. La clave del caché combina platform, arch y versión de ORT, y se refresca si el modelo cambia. Desactivable con `cacheOptimizedModel: false`.

### El puente espeak: 0.4ms contra 15ms

Misma lógica para la fonemización. El wrapper llama al binario `espeak-ng` en CLI por frase: unos 15ms de spawn cada vez. Lo nativo trae un bridge N-API (`src/native/espeak-bridge/`, port de `espeakbridge.c`), con prebuilds para Linux x64/arm64: **~0.4ms por llamada**, fonemas byte idénticos. Sin el addon, repliegue automático al CLI. `PIPER_ESPEAK_BRIDGE=0` para forzar el CLI.

### Los 7 phoneme_type, todos portados

| Tipo | Motor | Notas |
|---|---|---|
| `espeak` | bridge N-API o CLI | cláusulas byte idénticas |
| `text` | passthrough de codepoints | trivial |
| `hebrew` | Nakdimon ONNX + reglas IPA | salidas idénticas |
| `lithuanian` | espeak + dicc. de stress 189k entradas | salidas idénticas |
| `pinyin` | BERT g2pW ONNX + WordPiece | desambiguación de polífonos OK |
| `thai` | verdadero TLTK sin modificar bajo Pyodide/WASM | 7/7 idénticos (1a llamada lenta, resto rápido) |
| `japanese` | lindera-wasm + UniDic + motor de moras TS | segmentación exacta, **sin acento léxico** |

Y el árabe se diacritiza automáticamente (tashkeel, desactivable). 509 voces espeak del catálogo pasan por el puente rápido, las exóticas por su motor dedicado. 71 tests en la suite, límite documentado donde duele (el acento japonés, UniDic no trae ningún dato, asumido, nada oculto).

### Los formatos y el streaming

`wav` por defecto, `raw` PCM, `mp3`, `ogg`, `opus`: ffmpeg cuando está, si no fallbacks en JS puro (lamejs para mp3, opusscript + muxer Ogg para opus, correlación 0.993 con la fuente). Y sobre todo `synthesizeChunks()`: un generador async que devuelve por frase, con `sentenceSilence` entre frases. Para Luna, eso es empezar a reproducir el audio mientras el final se sintetiza. Streaming de TTS sin servidor dedicado.

Uso completo, con el catálogo PiperHub integrado (`hub:` + fallback espejo automático si el repo del autor ya no sirve los archivos):

```ts
const tts = await PiperNativeTTS.load({
  model: "hub:glados-french-medium-voice",
  modelsDir: "./models",
});

const r = await tts.synthesize("Bonjour, je suis GLaDOS.", {
  outputFormat: "ogg",   // directo para Discord
  lengthScale: 0.95,     // un poco más rápido
});
```

Voces comunitarias (GLaDOS y personajes de juegos) ausentes del manifest oficial. Justo por eso existe PiperHub, y `pipertts` lo sabe bien: `hub:<slug>`, URL de página piperhub, o slug desnudo, todo vale. Las voces marcadas `usable: false` se rechazan con un error claro.

## Lo que se sacrificó

Cada feature ausente financia otra. La lista honesta:

**Piper suena robótico al lado de ElevenLabs.** VITS medium en 22050 Hz es limpio pero plano comparado con un modelo grande expresivo. Lo multi emoción compensa en parte (7 estilos > 1 estilo plano), pero un audiolibro ElevenLabs v3 sigue por encima. Es el precio de las decenas de MB.

**espeak se equivoca.** Nombres propios, anglicismos, abreviaturas: la fonemización por reglas tiene puntos ciegos. "Spoiler" en francés, espeak lo lee como puede. Los modelos grandes con G2P neuronal fallan menos. En prod, necesitas un dicc. de excepciones para los términos de negocio.

**Cero clonación nativa.** Piper lee con voces fijas. Si quieres TU voz, vete a PocketTTS o ElevenLabs. Lo multi-speaker da variaciones, nunca tu timbre.

**El japonés sigue sin acento léxico.** UniDic no trae ningún dato de acento, así que la segmentación es exacta pero la melodía es aproximada. Documentado en el README, nada bajo la alfombra.

**El tailandés tarda en la primera llamada.** TLTK corre bajo Pyodide/WASM sin modificar: la primera llamada tarda segundos (carga), las siguientes son rápidas. 7/7 idénticos a la referencia, pero prevé un warm-up.

**Los datos tienen hambre.** Una voz high correcta pide horas de audio limpio alineado. El dataset Fortune son horas de grabación + limpieza. Cero magia: garbage in, robot out.

**El catálogo tiene voces muertas.** 25 modelos marcados `usable: false`. Es asumido y filtrado, pero recuerda que el crowdsourcing de voces también es crowdsourcing de abandono.

## El resultado final

De un lado un contador ElevenLabs, del otro una Raspberry Pi:

- PiperHub: 536 modelos publicados, 71 idiomas, 3755 speakers, 130 datasets enlazados, guías dataset -> training -> uso
- Piper: VITS end-to-end, espeak, ONNX CPU, LJSpeech, low/medium/high, 22050 Hz estándar
- Fortune multi: 7 emociones FR + 7 EN, 1 ONNX cada uno, `speakerId` para cambiar, licencia "Fortune's Café"
- Kokoro 82M: calidad premium EN, Apache 2.0, 54 voces, casi tiempo real en CPU
- PocketTTS: clonación CPU, ~100M luego 2-18M, WER 0.92%
- sanoTTS: 0.29M, 2 MB, microcontrolador, calidad que sigue al tamaño
- ElevenLabs: $0.05-0.10/1000 caracteres, 70+ idiomas, top calidad, contador girando
- pipertts nativo: ~0.22s/línea contra ~2.2s wrapper, puente espeak 0.4ms, 7 phoneme_type, wav/raw/mp3/ogg/opus, streaming por frase

Luna habla con eso cada día. 0 euros de TTS, emociones pilotadas por el cerebro, OGG directo para Discord. Frente a ElevenLabs se nota, claro. Pero a las 3 de la mañana cuando decide contar su vida, mi factura duerme tranquila.

## La filo

p2r3 decía: *"Me encanta la idea de que ese chip diminuto de 1 dólar pueda correr algo tan avanzado como Minecraft."*

Mismo rollo aquí, aplicado a la voz: me encanta la idea de que unas decenas de MB de ONNX hagan hablar a una Raspberry Pi en 71 idiomas, sin nube, sin cuenta, sin contador. Obviamente no reemplaza a ningún estudio de doblaje. Reemplaza el caso molesto donde quieres una voz correcta, local, gratis, que hable de noche sin facturarte.

Los tradeoffs, escritos en blanco y negro:
- calidad premium -> VITS pequeño: un poco robótico, pero local y gratis
- un modelo por emoción -> speakerId: 7 voces por el precio de una en RAM
- spawn Python -> sesión persistente: 10x más rápido, cero Python que instalar
- catálogo salvaje -> procedencia enlazada: cada voz sabe de dónde viene y si todavía funciona
- API facturada -> 0 euros marginal: menos bonito que ElevenLabs, pero la factura duerme tranquila

**Las 3 cosas que debes recordar:**

1. **Piper es el TTS de la CPU** : VITS + espeak + ONNX, 71 idiomas, voces en decenas de MB que corren en Pi. Menos bonito que ElevenLabs, infinitamente más barato.
2. **Fortune multi son 7 emociones por el precio de una** : un solo ONNX, `speakerId` para cambiar, FR + EN. El embedding de speaker en vez de 7 modelos.
3. **Lo nativo mata el spawn** : `pipertts` mantiene la sesión ONNX caliente: 0.22s/línea contra 2.2s, puente espeak 0.4ms contra 15ms CLI. Misma inferencia, 10x menos espera.

Si el proyecto te interesa, el catálogo es [piperhub.org](https://piperhub.org/), el código del sitio [github.com/fox3000foxy/piper-bank](https://github.com/fox3000foxy/piper-bank), el módulo nativo [github.com/itsrealfortune/pipertts](https://github.com/itsrealfortune/pipertts). Y si quieres oír a Luna contar su vida a las 3 de la mañana, es en Discord xD
