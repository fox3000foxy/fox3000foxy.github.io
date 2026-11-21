---
title: "PiperHub : 536 open-source TTS-голосов, 7 эмоций в одной модели, ноль GPU, ноль счетов"
description: "VITS, espeak, ONNX, LJSpeech : как Piper заставляет Raspberry Pi говорить. Fortune multi в 7 эмоциях, Kokoro 82M, PocketTTS, sanoTTS, ElevenLabs -- и нативный pipertts в 10 раз быстрее официального Python-враппера."
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
author_sig: "r/1j+riYl7C+mLR29xxUR/oat+bEOWZDvRugGvUMbi5fGRXrJlZRT1+5rxeYajV8Yg/GQ1JQfiRXQ+O1ojhfbw=="
---

## Introduction

Озвучить Discord-бота стоит дорого. Не текст : локальный LLM генерирует фразы за копейки GPU. Голос оплачивается за каждую фразу. API синтеза берут плату за символы, и когда бот болтает всю ночь, счёт растёт следом.

У меня была именно такая проблема с Luna Protocol. Мой Discord-бот генерирует сообщения локальным LLM, потом зачитывает их вслух голосом Piper, конвертирует в OGG и отправляет как голосовые сообщения. Всё на моём собственном сервере, за 0 евро за фразу, даже в 3 часа ночи, когда Луна решает сама рассказать о своей жизни.

Держаться на нуле значит найти бесплатные голоса и хостить их самому. И тут всё усложнилось : модели разбросаны по десяткам репозиториев Hugging Face, лицензии мутные, никак не узнать, откуда взялся тот или иной голос и работает ли он вообще. Поэтому я построил [PiperHub](https://piperhub.org/), open-source каталог голосов для Piper TTS.

Цифры на сегодня : **536 моделей** показано, **71 язык** представлен, **3755 speakers** в списке. Каждая модель привязана к своему исходному датасету, когда он известен, -- происхождение это часть звука, как сказано на главной.

Остаётся вопрос, который мне задают часто : чего стоит Piper против Kokoro, PocketTTS, sanoTTS и ElevenLabs ? И почему модуль `pipertts` от Fortune в 10 раз быстрее официального Python-враппера ? В этой статье вскрываю движки, с кодом в подтверждение.

## PiperHub, le catalogue

Прежде чем вскрывать движки, посмотрим, какую проблему решает PiperHub.

### D'où viennent les voix

Код лежит на [github.com/fox3000foxy/piper-bank](https://github.com/fox3000foxy/piper-bank). Astro, статический сайт, ноль серверов : английский в корне, ещё 15 локалей под `/<code>/` (fr, de, es, it, pt, ru, tr, ja, ko, zh, id, hi, ar, vi, th). Та же схема, что у моего блога, в общем-то.

Источник истины никто руками не правит. Это пайплайн :

```bash
npm install
npm run data    # регенерирует src/data/*.json (python3 scripts/generate_data.py)
npx astro dev   # локальный dev
npm run build   # статический build в dist/
```

Конкретно : репозиторий-краулер поддерживает `models_mapping.csv` и `datasets_mapping.csv`, зеркала голосов живут на Hugging Face, сэмплы это аудиофайлы. `npm run data` стягивает всё это и выплёвывает `src/data/*.json`. Сайт только читает статичный JSON.

В сырых данных на текущий момент (555 записей, на сайте показано 536, -- краул всегда чуть впереди отображения) :

| Qualité | Modèles |
|---|---|
| medium | 437 |
| high | 67 |
| low | 50 |

| Sample rate | Modèles |
|---|---|
| 22050 Hz | 486 |
| 16000 Hz | 47 |

486 голосов на 22050 Гц, стандарт Piper. 47 на 16000 Гц, маленькие быстрые голоса для встраиваемых систем. Фонемизатор это `espeak` в 509 случаях, -- к этому ещё вернёмся, это сердце системы.

### La provenance, ou pourquoi chaque modèle a un dataset

То, что делает PiperHub полезным, а не просто списком, это связь модель <-> датасет. Пример с главной : голос **Astra - Valorant Piper TTS** привязан к датасету **Astra - LJSpeech Dataset**. Открываешь обе страницы, проверяешь репозитории и лицензии с обеих сторон.

130 датасетов в каталоге. И каталог честно показывает состояние войск : 25 моделей помечены `usable: false` (битые файлы или формат `piperPlus`, которому нужен форкнутый рантайм). Модуль `pipertts` отвергает такие голоса с понятной ошибкой вместо того, чтобы странно крашиться позже. 48 моделей мультиспикерные, -- включая две, которые нас заинтересуют.

По гайдам сайт закрывает базу в три шага : **Build a dataset**, **Train a voice**, **Use a voice**, плюс страница Piper Plus. На входе датасет в формате LJSpeech, на выходе ONNX. Сказать просто, делать долго, -- отсюда следующий раздел.

## Piper sous le capot : VITS, espeak, ONNX

### Une phrase, trois étapes

Когда ты просишь Piper сказать "bonjour", происходит вот что :

```
"bonjour"
  -> [phonémisation espeak-ng] -> b O~ Z u R
  -> [encodeur VITS + flow + décodeur] -> waveform 22050 Hz
```

Ноль отдельного вокодера. В этом и суть VITS : end-to-end модель, которая идёт от текста (фонемизированного) straight к waveform. Тогда как старые пайплайны делали текст -> спектрограмма (Tacotron), а потом спектрограмма -> аудио (HiFi-GAN, две модели, два обучения), VITS учит всё разом с условным VAE, нормализующими флоу и GAN-дискриминатором на декодере. Одно обучение, одна модель, один экспорт в ONNX.

Декодер выдаёт straight 22050 Гц. На этом sample rate секунда речи = 22050 чисел. Модель маленькая (десятки мегабайт в качестве medium), а инференс это чистый CPU : перемножение матриц на оптимизированном графе ONNX. Отсюда Raspberry Pi как официальная цель, -- Piper родился в Rhasspy, open-source голосовом ассистенте, сделанном для работы на Pi.

### espeak-ng, le phonémiseur qui fait tout le sale boulot

Перед VITS надо превратить текст в фонемы. 509 моделей из 555 используют `espeak` :

```bash
echo "bonjour" | espeak-ng --ipa -v fr
# bO~'ZuR
```

espeak-ng знает произношение десятков языков. Модель VITS никогда не учит французскую орфографию с её `eau`, которые читаются как `o`, -- она учит отображение фонем в звук. Это радикально упрощает обучение и объясняет, почему Piper покрывает 71 язык : для нового языка подключаешь соответствующий голос espeak и обучаешь.

Те, что обходятся без espeak, тащат собственный фонемизатор, и тут начинается экзотика : `hebrew` (Nakdimon ONNX + 494 строки IPA-правил), `pinyin` (полный BERT g2pW с разрешением полисемии, -- один и тот же китайский иероглиф читается по-разному в зависимости от слова), `thai` (настоящий немодифицированный TLTK), `japanese` (сегментация lindera + UniDic). Модуль `pipertts` везёт все семь, сверенных до идентичности с Python-референсом. Ещё вернёмся.

### Le dataset : du LJSpeech, toujours du LJSpeech

Стандартный формат обучения это LJSpeech : папка `wavs/`, полная клипов, плюс `metadata.csv` :

```
LJ001-0001|Printing, in the only sense with which we are at present concerned...|printing in the only sense...
LJ001-0002|in being comparatively modern...|in being comparatively modern...
```

`fileid|transcription|normalized`, один клип = одна фраза, несколько секунд. Исходный датасет это 13 000 фраз на английском, прочитанных одной дикторшей, общественное достояние. Чтобы обучить русский голос, записываешь ту же структуру по-русски : выровненные текст + аудио, нескольких часов хватит на приличный medium, больше на high.

Три качества в каталоге примерно соответствуют размеру модели + длительности обучения. Low : маленький, быстрый, роботизированный. Medium : золотая середина, 437 моделей. High : больше, медленнее, естественнее, -- 67 моделей, включая Fortune.

### Les trois boutons magiques

Каждый голос Piper выставляет три параметра инференса, с почти универсальными дефолтами :

```json
"inference": { "noise_scale": 0.667, "length_scale": 1, "noise_w": 0.8 }
```

- `noise_scale` (0.667) : вариативность голоса. Выше = выразительнее, ниже = стабильнее. Выход стохастический : два синтеза одной фразы дают два чуть разных аудио.
- `noise_w` (0.8) : вариативность тайминга, ритм.
- `length_scale` (1.0) : скорость. Выше 1 замедляет, ниже ускоряет. Простейший способ заставить Луну говорить быстрее, когда она злится.

Запомни `noise_scale`, он пригодится для эмоций.

## Fortune multi : 7 émotions, 1 seul ONNX

Ладно, переходим к местной звезде.

В каталоге три модели Fortune, обученные ItsRealFortune (привет) :

| Modèle | Repo | Voix |
|---|---|---|
| ItsRealFortune - French (FR) High | `fox3000foxy/piper-fortune-v6` | 1 (voice-0) |
| ItsRealFortune - French (FR) **Multi** High | `fox3000foxy/piper-checkpoints-fortune-fr-multi` | **7** |
| ItsRealFortune - English (EN) **Multi** High | `fox3000foxy/piper-checkpoints-fortune-en-multi` | **7** |

Мульти FR это вот что :

```
normal, joyeuse, storytelling, colere, triste, surprise, interrogative
```

Семь эмоциональных окрасок в **одном файле ONNX**. Мульти EN такой же, с исторической опечаткой в именах : `suprised` вместо `surprised`. Она в весах, оставляем, это часть фольклора.

### Comment ça marche, un speakerId ?

Мультиспикерный VITS это та же модель с одним дополнительным входом : эмбеддингом спикера. При обучении каждый клип помечен своим стилем, модель учит таблицу эмбеддингов (по одному на стиль) вместе со всем остальным. На инференсе ты выбираешь строку таблицы :

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
    speakerId: i,           // 0 = обычный ... 5 = удивление
    outputFile: `./fortune-${styles[i]}.wav`,
  });
}
```

Одна фраза, семь прочтений. `speakerId: 5` (удивление) с чуть подкрученным `noise_scale`, и у тебя убедительное восклицание. `speakerId: 4` (грусть), `length_scale: 1.1` для замедления, и у тебя траурное объявление. Именно так Луна модулирует голос : мозг выбирает эмоцию (валентность/возбуждение, см. мою статью про центроиды), TTS выбирает speakerId.

Датасет за этим стоит под скромным именем **Fortune French - Dataset**, с лицензией под названием "Fortune's Café". Да, лицензия называется как кафе. Нет, она остаётся.

### Pourquoi c'est malin économiquement

Семь эмоций = одно скачивание, одна загрузка в RAM, одна ONNX-сессия. Альтернатива (семь отдельных моделей) умножила бы хранилище и заставляла бы перезагружать граф при каждой смене эмоции, -- неиграбельно для бота, который меняет тон прямо посреди фразы. А тут `speakerId` это просто индекс в тензоре. Маржинальная стоимость : ноль.

## Les concurrents : Kokoro, PocketTTS, sanoTTS

Piper делит CPU с тремя серьёзными претендентами, тремя разными философиями.

### Kokoro 82M, le roi qualité/prix

[Kokoro](https://huggingface.co/hexgrad/Kokoro-82M) от hexgrad. 82 миллиона параметров, модифицированная архитектура StyleTTS 2 с декодером ISTFTNet, **без этапа диффузии**. Отсутствие диффузии решает всё : никакого итеративного цикла денойзинга, отсюда ультрабыстрый инференс.

| | Kokoro-82M |
|---|---|
| Params | 82M |
| Poids | ~300 Mo (164 Mo en FP16) |
| Licence | Apache 2.0 (commercial OK) |
| Langues | 8, 54 voix preset + blending |
| CPU | quasi temps réel |
| GPU | 36 à 96x temps réel |
| Tests aveugles | au niveau de Google et Amazon |

Обучен на менее чем 100 часах аудио примерно за 1000 долларов, а слепые слушатели ставят его на уровень премиальных голосов Google и Amazon. Потому он и взлетел : премиальное качество, бесплатно, локально, пермиссивно.

Против Piper : Kokoro выигрывает в чистой естественности (StyleTTS 2 > маленький VITS) и в лицензии (Apache 2.0 против движка под GPL-3.0 у Piper). Piper выигрывает в покрытии (71 язык против 8, 3755 спикеров против 54 голосов) и в экосистеме голосов сообщества. Для английской наррации Kokoro трудно побить. Для французского с 7 эмоциями, турецкого или суахили Piper часто вообще единственный в гонке.

### PocketTTS (Kyutai), le clonage sur CPU

[Kyutai](https://kyutai.org/tts/) играет другую партию : маленькая модель **с клонированием голоса**, которая работает на CPU.

| Modèle | Params | WER | UTMOS | SIM | Vitesse CPU (1 thread) |
|---|---|---|---|---|---|
| Pocket TTS | ~100M | 0.92% | 4.364 | 0.923 | 2.8x temps réel |
| Pocket TTS small | 1.9M / 6.9M / 18.2M | - | - | - | CPU, clonage inclus |

WER ниже 1% (произносит правильно), UTMOS 4.36 (воспринимаемое качество отличное), SIM 0.923 (клон реально похож на цель). А small-версии спускаются до **1.9M параметров** с клонированием. 1.9M. Мой роутер Sabaki весит почти столько в JSON.

Против Piper : PocketTTS выигрывает в клонировании (Piper читает фиксированными голосами) и в компактности флагмана. Piper выигрывает в языках (small пока только английский) и в зрелости экосистемы (536 готовых голосов против "обучи свой").

### sanoTTS, le modèle qui tient sur une puce à 3 dollars

[sanoTTS](https://github.com/ampixa/sanoTTS) (`sano` = "маленький" по-непальски), это Bareiron мира TTS : полный нейронный стек от фонем до PCM 22.05 кГц **на микроконтроллере**.

| Système | Params | SCOREQ | UTMOS | DNS-SIG |
|---|---|---|---|---|
| sanoTTS (heart-nano) | 0.29M | 2.29 | 2.45 | 3.35 |
| TinyTTS | 1.62M | 3.94 | 3.65 | 3.62 |

0.29M параметров. 2 МБ голос. `pip install sanotts`, `sanotts say "Hello" --voice amy`, и оно говорит. В браузере тоже.

Но смотри на оценки : SCOREQ 2.29 против 3.94 у TinyTTS, UTMOS 2.45. Говорит, да. Не поёт. Это ультимативный tradeoff : на 0.29M ты влезаешь везде, но качество следует за размером. Piper medium это в 100 раз больше весов за голос совсем другой лиги.

### Le tableau qui résume

| | Piper | Kokoro 82M | PocketTTS | sanoTTS |
|---|---|---|---|---|
| Params typiques | ~10-60M | 82M | ~100M / 2-18M | 0.3-1.4M |
| Langues | 71 | 8 | EN (+ smalls EN) | multilingue, petit |
| Voix dispos | 3755 speakers | 54 + blending | clonage (la tienne) | quelques voix |
| Clonage | non | non (natif) | **oui, CPU** | non |
| Licence moteur | GPL-3.0 | Apache 2.0 | open (Kyutai) | open |
| Entraînable maison | oui (LJSpeech) | oui (plus lourd) | oui | oui |
| Qualité FR | bonne (multi émotions) | correcte (EN-first) | EN-only | faible |

Выбор зависит от твоего ограничения, абсолютного победителя нет : чистое EN-качество -> Kokoro. Клонирование на CPU -> PocketTTS. Микроконтроллер -> sanoTTS. Покрытие языков + французские эмоциональные голоса + ноль инфры -> Piper.

## ElevenLabs, le Goliath facturé

А ещё есть ElevenLabs. 70+ языков, выразительный Eleven v3 с audio-тегами и драматическими диалогами, топовое качество в слепых тестах. Jev мира TTS, в каком-то смысле : все его видели, все бенчмаркали против него.

Прайсинг 2026, в круглых цифрах :

| Modèle API | Prix / 1000 caractères |
|---|---|
| Flash / Turbo, v3 Conversational | $0.05 |
| Multilingual v2, Eleven v3 | $0.10 |

1000 символов это примерно 1 минута аудио. То есть от $0.05 до $0.10 за минуту. План Pro за $99 включает около 990k символов, оверэйдж бьёт по тому же тарифу. Для YouTube-канала, который выпускает по видео в день с озвучкой (мой `valorant-short-maker` делает ровно это, но на бесплатном Piper), считай от $1.50 до $3 в месяц за каждую ежедневную минуту озвучки. Десять минут в день : $15-30/мес. Платить можно, но считать приходится.

Когда оно того стоит : когда голос **это** продукт (дубляж, аудиокнига, реклама), когда надо 70 языков к завтрашнему утру, когда клонирование должно получиться идеально с первого раза. А вот когда не стоит никогда : Discord-бот, который болтает всю ночь, внутренние уведомления, дев, объёмы, которые взрываются. Луна, рассказывающая о своей жизни в 3 часа ночи на ElevenLabs, это мой счёт за свет в слезах.

Арифметика простая : Piper = 0 евро маржинально, качество "хорошее". ElevenLabs = крутящийся счётчик, качество "отличное". Между ними целый мир, где "хорошее и бесплатное" выигрывает, -- в этом вся ставка PiperHub.

## pipertts : pourquoi le natif met 10x au wrapper Python

Репозиторий [itsrealfortune/pipertts](https://github.com/itsrealfortune/pipertts), 75 коммитов : нативный порт Piper на TypeScript. Заголовок README : "In-process Piper TTS for Node.js. No Python required."

### Le coût du spawn

Исторический враппер (`PiperTTS`) это `python3 -m piper`, спавнящийся в субпроцессе **при каждом синтезе** :

```
synthèse = spawn(python) + chargement du modèle + inférence + kill
```

Каждая фраза оплачивает старт интерпретатора + загрузку весов. Замерено на `en_US-lessac-medium` : **~2.2s на строку**.

Натив (`PiperNativeTTS`) держит ONNX-сессию **горячей в памяти** :

```
load une fois -> session persistante -> inférence par phrase
```

Замерено так же : **~0.22s на строку**. 10x берутся отсюда : убиваем спавн и перезагрузку, чудесный инференс тут вообще ни при чём. Сам инференс ONNX с обеих сторон одинаковый.

Бонусом первая загрузка кеширует оптимизированный граф рядом с `.onnx` (`<model>.ortopt-<platform>-<arch>-v<ort>.onnx`), что делает следующие загрузки примерно на 35% быстрее. Ключ кеша комбинирует platform, arch и версию ORT, и обновляется, если модель изменилась. Отключается через `cacheOptimizedModel: false`.

### Le pont espeak : 0.4ms contre 15ms

Та же логика для фонемизации. Враппер дёргает бинарник `espeak-ng` через CLI на фразу : около 15ms спавна каждый раз. Натив встраивает N-API бридж (`src/native/espeak-bridge/`, порт `espeakbridge.c`), с пребилдами под Linux x64/arm64 : **~0.4ms на вызов**, фонемы байт-в-байт. Без аддона автоматический откат на CLI. `PIPER_ESPEAK_BRIDGE=0` чтобы форсировать CLI.

### Les 7 phoneme_type, tous portés

| Type | Moteur | Notes |
|---|---|---|
| `espeak` | bridge N-API ou CLI | clauses byte-identiques |
| `text` | passthrough codepoints | trivial |
| `hebrew` | Nakdimon ONNX + règles IPA | sorties identiques |
| `lithuanian` | espeak + dico de stress 189k entrées | sorties identiques |
| `pinyin` | BERT g2pW ONNX + WordPiece | désambiguïsation des polyphones OK |
| `thai` | vrai TLTK non modifié sous Pyodide/WASM | 7/7 identiques (1er appel lent, suite rapide) |
| `japanese` | lindera-wasm + UniDic + moteur de mores TS | segmentation exacte, **pas d'accent lexical** |

А арабский диакритизируется автоматически (ташкиль, отключаемо). 509 espeak-голосов каталога идут через быстрый бридж, экзотика через свой движок. 71 тест в сьюте, ограничение задокументировано там, где жмёт (японское ударение, UniDic не даёт никаких данных, -- признано, ничего не спрятано).

### Les formats et le streaming

`wav` по умолчанию, `raw` PCM, `mp3`, `ogg`, `opus` : ffmpeg, когда он есть, иначе чисто-JS фолбэки (lamejs для mp3, opusscript + Ogg-муксер для opus, корреляция 0.993 с источником). И главное `synthesizeChunks()` : async-генератор, который yield'ит по фразам, с `sentenceSilence` между фразами. Для Луны это значит начать проигрывать аудио, пока конец ещё синтезируется, -- стриминг TTS без выделенного сервера.

Полное использование, со встроенным каталогом PiperHub (`hub:` + автоматический mirror-фолбэк, если авторский репозиторий больше не отдаёт файлы) :

```ts
const tts = await PiperNativeTTS.load({
  model: "hub:glados-french-medium-voice",
  modelsDir: "./models",
});

const r = await tts.synthesize("Bonjour, je suis GLaDOS.", {
  outputFormat: "ogg",   // straight в Discord
  lengthScale: 0.95,     // чуть быстрее
});
```

Голоса сообщества (GLaDOS и персонажи игр), отсутствующие в официальном манифесте, -- вот ровно зачем существует PiperHub, и `pipertts` это хорошо знает : `hub:<slug>`, URL страницы piperhub или голый slug, всё работает. Голоса с флагом `usable: false` отвергаются с понятной ошибкой.

## Ce qui a été sacrifié

Каждая отсутствующая фича финансирует другую. Честный список :

**Piper звучит роботизированно рядом с ElevenLabs.** VITS medium на 22050 Гц это чисто, но плоско рядом с большой выразительной моделью. Мультиэмоции частично компенсируют (7 стилей > 1 плоского стиля), но аудиокнига ElevenLabs v3 всё равно выше. Это цена десятков мегабайт.

**espeak ошибается.** Имена собственные, англицизмы, аббревиатуры : у фонемизации по правилам есть слепые зоны. "Spoiler" по-французски espeak читает как может. Большие модели с нейронным G2P ошибаются реже. В проде нужен словарь исключений для твоих терминов.

**Ноль нативного клонирования.** Piper читает фиксированными голосами. Если хочешь СВОЙ голос, тебе в PocketTTS или ElevenLabs. Мультиспикер даёт вариации, но не твой тембр.

**Японский остаётся без лексического ударения.** UniDic не даёт никаких данных об ударении, поэтому сегментация точная, а мелодика приблизительная. Задокументировано в README, ничего под ковром.

**Тайский тормозит на первом вызове.** TLTK крутится под немодифицированным Pyodide/WASM : первый вызов занимает секунды (загрузка), следующие быстрые. 7/7 идентично референсу, но предусмотри warm-up.

**Данные голодны.** Приличный high-голос требует часов чистого выровненного аудио. Датасет Fortune это часы записи + чистки. Ноль магии : garbage in, robot out.

**В каталоге есть мёртвые голоса.** 25 моделей с флагом `usable: false`. Это признано и отфильтровано, но напоминает : краудсорсинг голосов это ещё и краудсорсинг заброшенности.

## Le résultat final

С одной стороны счётчик ElevenLabs, с другой Raspberry Pi :

- PiperHub : 536 показанных моделей, 71 язык, 3755 спикеров, 130 привязанных датасетов, гайды dataset -> training -> usage
- Piper : end-to-end VITS, espeak, ONNX CPU, LJSpeech, low/medium/high, стандарт 22050 Гц
- Fortune multi : 7 эмоций FR + 7 EN, по 1 ONNX, `speakerId` для переключения, лицензия "Fortune's Café"
- Kokoro 82M : премиальное EN-качество, Apache 2.0, 54 голоса, почти реалтайм на CPU
- PocketTTS : клонирование на CPU, ~100M потом 2-18M, WER 0.92%
- sanoTTS : 0.29M, 2 МБ, микроконтроллер, качество следует за размером
- ElevenLabs : $0.05-0.10/1000 символов, 70+ языков, топ-качество, крутящийся счётчик
- нативный pipertts : ~0.22s/строка против ~2.2s у враппера, бридж espeak 0.4ms, 7 phoneme_type, wav/raw/mp3/ogg/opus, стриминг по фразам

Луна говорит на этом каждый день. 0 евро за TTS, эмоции под управлением мозга, OGG straight в Discord. Против ElevenLabs слышно, конечно. Но в 3 часа ночи, когда она решает рассказать о своей жизни, мой счёт спит спокойно.

## La philo

p2r3 говорил : *"J'aime juste l'idée que cette toute petite puce à 1 balles puisse faire tourner quelque chose d'aussi avancé que Minecraft."*

Тот же трип здесь, применённый к голосу : мне нравится идея, что несколько десятков мегабайт ONNX заставляют Raspberry Pi говорить на 71 языке, без облака, без аккаунта, без счётчика. Это, конечно, не заменит ни одну студию дубляжа. Оно заменяет тот нудный случай, когда тебе нужен приличный голос, локальный, бесплатный, который говорит ночью и не выставляет счёт.

Трейдоффы, чёрным по белому :
- премиальное качество -> маленький VITS : слегка роботизированно, зато локально и бесплатно
- модель на эмоцию -> speakerId : 7 голосов по цене одного в RAM
- спавн Python -> постоянная сессия : в 10 раз быстрее, ноль Python для установки
- дикий каталог -> привязанное происхождение : каждый голос знает, откуда он и работает ли ещё
- платный API -> 0 евро маржинально : менее красиво, чем ElevenLabs, зато счёт спит спокойно

**3 вещи, которые стоит запомнить :**

1. **Piper = TTS для CPU** -- VITS + espeak + ONNX, 71 язык, голоса в десятки мегабайт, которые крутятся на Pi. Менее красиво, чем ElevenLabs, бесконечно дешевле.
2. **Fortune multi = 7 эмоций по цене одной** -- один ONNX, `speakerId` для переключения, FR + EN. Эмбеддинг спикера вместо 7 моделей.
3. **Натив убивает спавн** -- `pipertts` держит ONNX-сессию горячей : 0.22s/строка против 2.2s, бридж espeak 0.4ms против 15ms CLI. Тот же инференс, в 10 раз меньше ожидания.

Если проект интересен, каталог это [piperhub.org](https://piperhub.org/), код сайта [github.com/fox3000foxy/piper-bank](https://github.com/fox3000foxy/piper-bank), нативный модуль [github.com/itsrealfortune/pipertts](https://github.com/itsrealfortune/pipertts). А если хочешь послушать, как Луна рассказывает о своей жизни в 3 часа ночи, это в Discord xD
