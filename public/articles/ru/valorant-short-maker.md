---
title: "valorant-short-maker: пайплайн, который сам генерирует мои Shorts по Valorant"
description: "Groq/Llama для сценария, Piper для озвучки, FFmpeg для всего остального. Как cron-задача производит и публикует по видео в день на @valorant_agents, от и до."
date: 2026-07-14
tags:
  - typescript
  - ffmpeg
  - automation
  - ai
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "6I21+Hg4Cm82tQu/1FOZi0kobbC3FB08hr7Sj0vjrkho2ScpCK1ozdPRvHsgYlaYblCIEsByTHY+ogrd0rCl+Q=="
---

# valorant-short-maker: пайплайн, который сам генерирует мои Shorts по Valorant

Уже несколько месяцев один YouTube-канал крутится без моего участия: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop). Агенты Valorant подкалывают друг друга между раундами, озвучены, с караоке-субтитрами, публикуются как Shorts. Всё генерирует [`valorant-short-maker`](https://github.com/fox3000foxy/valorant-short-maker), пайплайн на TypeScript/Bun, который работает по cron и публикует видео без единого клика.

Вот как это работает, шаг за шагом.

## Что получается

Три кадра, вытащенные из видео для «Duelist Debate» (Phoenix, Yoru и Jett):

![Интро Shorts, кружок агента с названием сцены](/images/valorant-short-maker/vsm-01-intro.png)

![Реплика в процессе, караоке-субтитр загорается](/images/valorant-short-maker/vsm-02-dialogue.png)

![Другая реплика, цвет субтитра меняется в зависимости от говорящего агента](/images/valorant-short-maker/vsm-03-dialogue.png)

Результат вживую на этом Shorts: [Duelist Debate -- youtube.com/shorts/SX5Kme58aLU](https://www.youtube.com/shorts/SX5Kme58aLU). Shorts на канале набирают около 1,2–1,5 тысяч просмотров. Ничего грандиозного, но это канал, который с самого начала работает полностью сам, так что число, которое реально важно -- ноль. Ноль минут, потраченных на него после запуска cron.

## Пайплайн по порядку

### 1. Написание сценария -- Groq + Llama 3.3

Каждый запуск выбирает 3–4 случайных агента из 26 доступных и отправляет Llama 3.3 70B (через Groq) системный промпт, содержащий для каждого выбранного агента компактную сводку его личности и отношений с другими агентами в сцене (эти персонажи живут в `src/lore/`, по файлу на агента). Промпт навязывает строгие правила: короткая, хлёсткая фраза на реплику, равномерное чередование персонажей, юмор прежде всего, и главное -- паузы.

Конкретный пример с «Duelist Debate» -- Phoenix, Yoru и Jett спорят, кто будет играть дуэлянта, сгенерировано 6 июля 2026:

```
phoenix: I'm telling you, I've got the skills to play duelist this match.
yoru: Skills, you call burning things skills, Phoenix.
jett: I'm the fastest one here, I should play duelist.
phoenix: Fastest, but can you handle the heat, Jett [0.3] I doubt it.
yoru: Heat, ha, you think your flames are hotter than my rifts.
jett: This isn't about heat or flames, it's about speed and agility.
phoenix: Oh, I see, so now you're an expert on duelists, Yoru [0.3] that's rich.
yoru: At least I don't rely on cheap fire tricks.
jett: Cheap fire tricks, that's what you call Phoenix's abilities.
phoenix: Hey, my fire tricks have gotten us out of tight spots before [0.3] can't say the same for your rifts, Yoru.
yoru: Tight spots, you mean like the time I rifted us out of that trap.
jett: Enough, this is getting nowhere, let's just decide already.
phoenix: Fine, but I'm still saying I'm the best duelist here.
yoru: Please, you think you can take on the enemy team alone [0.3] I doubt it.
jett: I can take them on, no problem, I'm the fastest.
phoenix: Fastest, yeah, but can you outmaneuver them [0.3] that's the question.
yoru: Outmaneuver, ha, you think you can outmaneuver anyone, Phoenix.
jett: This is stupid, we're not going to agree on this.
phoenix: Fine, let's just play and see who comes out on top [0.3] I'm game if you are.
yoru: Bring it on, I'll show you what a real duelist looks like.
jett: I'm not backing down, I'm playing duelist.
phoenix: Oh, this should be good [0.3] let's see how you two do.
yoru: We'll see who comes out on top, won't we, Jett.
jett: Yeah, let's end this debate once and for all.
pause: 0.3
phoenix: Alright, let's get started then [0.3] may the best duelist win.
yoru: I'll make sure to burn you, Phoenix, not with fire, but with my rifts.
jett: I'll take you both down, no problem.
```

Паузы -- та самая деталь, которая делает ритм естественным: `[0.3]` внутри реплики создаёт 0,3 секунды тишины в аудио, не обрывая кружок агента на экране, а отдельная строка `pause: 1.0` даёт настоящую паузу между говорящими, кружок скрыт. Без этого TTS, тараторящий реплики без передышки, звучит как робот.

### 2. Озвучка -- Piper, по модели на агента

У каждого агента своя, специально обученная модель Piper (`.onnx`), хранится в `voices/<agent>/`. Сгенерированный текст проходит через нужную модель, на выходе -- WAV. Та же технология, что я использую для тренировки кастомных голосов в целом (см. статью о пайплайне Piper/Kaggle) -- здесь применяется прямо в проде, на лету, при каждой генерации видео.

### 3. Караоке-субтитры -- генерируемый ASS, цвет вытаскивается из иконки

Субтитры -- не простой `.srt`. Это файл `.ass` (Advanced SubStation Alpha), генерируемый пословно, с караоке-эффектом: каждое слово загорается цветом по мере произнесения, а остальной текст остаётся нейтральным. Цвет акцента не фиксирован -- он динамически извлекается из иконки говорящего агента (Python-скрипт прогоняет PIL по PNG иконки, сэмплирует непрозрачные пиксели и возвращает доминирующие цвета). Результат: субтитр Killjoy горит фиолетовым, Jett -- бирюзовым, и ни один цвет нигде не захардкожен.

### 4. Аудио-реактивный кружок -- по выражению FFmpeg на каждый кадр

Это самая хитрая часть пайплайна и, наверное, та, которой я больше всего горжусь. Круглая иконка говорящего агента не стоит на месте: она слегка зумит в ритме собственного голоса.

Вычисление читает сырой WAV реплики, считает RMS-огибающую (root mean square, мера энергии сигнала) покадрово на 60 fps, нормирует по максимуму, затем сглаживает окном в 3 кадра от рывков. Каждое значение огибающей преобразуется в коэффициент масштабирования, ограниченный `MAX_ZOOM_VARIATION` (0,2, т.е. ±20% от базового размера).

Результат этого вычисления применяется не через код, манипулирующий пикселями -- он переводится в огромное условное выражение FFmpeg (`lt(n,K)*val + between(n,K,K')*val + ...`, по ветке на группу кадров), которое напрямую управляет параметром `scale` видеофильтра. FFmpeg вычисляет это выражение на каждом кадре рендера. Для реплики в пару секунд на 60 fps это быстро превращается в сотни веток в одном выражении -- отсюда параметр `STEP`, группирующий кадры для ограничения глубины.

### 5. Попосегментный рендер, затем fisheye на интро

Каждая реплика рендерится отдельно: видеофон (случайный клип геймплея из `bg-video/`, обрезанный под нужную длительность), сверху кружок агента с аудио-реактивным зумом, субтитры впечатываются через фильтр `ass` FFmpeg, звук TTS смешивается с фоновым звуком геймплея.

Самый первый сегмент получает особую обработку: искажение fisheye, постепенно исчезающее на первых 20% кадров (покадрово вычисляемый фильтр `lenscorrection` плюс `tmix=frames=3`, смешивающий соседние кадры для имитации motion blur), синхронизированное со звуком «вжух». Это интро-переход, создающий ощущение, что камера «влетает» в сцену.

### 6. Склейка и финальный микс

Все сегменты склеиваются встык, фоновая музыка (Sneaky Snitch, Kevin MacLeod, лицензия Creative Commons) накладывается сверху с **audio ducking** -- сайдчейн-компрессия автоматически приглушает музыку, пока агент говорит, и возвращает громкость в паузах. Всё крутится в 60 fps от начала до конца, без конвертации частоты кадров между этапами.

### 7. Автоматическая публикация

Скрипт `run-cron.sh`, запускаемый обычным cron'ом, активирует Python-окружение, загружает `.env` и выполняет `bun src/workflow.ts --upload`. Флаг `--upload` дополнительно запускает генерацию метаданных (название, описание, теги) и вызывает `uploaders/upload.py`, который публикует видео на YouTube и Instagram через два отдельных скрипта (`uploaders/youtube/upload.py` и `uploaders/instagram/`). Вся цепочка, от LLM-промпта до видео онлайн, работает без участия человека.

## Почему TypeScript/Bun, а не всё на Python

Выбор не идеологический -- Bun даёт прямой и быстрый доступ к `Bun.spawn` для управления FFmpeg как подпроцессом, строгую типизацию структур данных пайплайна (`Phrase`, `SegmentInfo`) и рантайм, который стартует заметно быстрее Node для скрипта, запускаемого по cron каждые несколько часов. Единственные два кусочка Python в проекте там, где Python реально лучший инструмент: PIL для извлечения цветов и API для загрузки (`google-api-python-client` для YouTube, стек Instagram Graph API для IG).

## Что это показывает

Этот проект -- хороший пример того, что сегодня можно построить из полностью бесплатных или опенсорсных кирпичиков: быстрый и бесплатный LLM через Groq API, локальный TTS-движок, работающий без выделенного GPU, FFmpeg для всего видеорендеринга -- а связующее звено, всего несколько сотен строк TypeScript. Ни один из этих кирпичиков по отдельности не нов. Пайплайном их делает компоновка: генерация связного сценария с реальными отношениями персонажей, превращение его в выразительное аудио с естественными паузами, покадровая синхронизация визуального рендера с энергией этого аудио и автоматизация всей цепочки вплоть до публикации.

---

**Ресурсы**

- **Репозиторий**: [github.com/fox3000foxy/valorant-short-maker](https://github.com/fox3000foxy/valorant-short-maker)
- **Канал**: [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)

**3 ключевых момента**

1. Сценарий генерируется LLM (Groq/Llama 3.3) с персоналиями и отношениями каждого агента, а не простым списком заготовленных шуток.
2. Зум кружка агента управляется выражением FFmpeg, покадрово вычисляемым из RMS-огибающей WAV -- никакой классической анимации по ключевым кадрам.
3. Вся цепочка, от промпта до поста на YouTube/Instagram, работает через один cron без какого-либо участия человека.
