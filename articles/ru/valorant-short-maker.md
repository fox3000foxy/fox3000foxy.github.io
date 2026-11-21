---
title: "valorant-short-maker : пайплайн, сам генерирующий мои шортсы Valorant"
description: "Groq/Llama для скрипта, Piper для голосов, FFmpeg для всего остального. Как cron-задача производит и публикует видео в день на @valorant_agents, от А до Я."
date: 2026-07-14
tags:
  - typescript
  - ffmpeg
  - automation
  - ai
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "CCI1Qzr59TEHToRNwJMNketfxF5I7rfDbda+X5bJBndZqsKgO2qpG7n+BJ73sNlRjyoLO+UUW+SkumfAq8E4mA=="
---

# valorant-short-maker : пайплайн, сам генерирующий мои шортсы Valorant

Уже несколько месяцев YouTube-канал крутится, а я его не трогаю : [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop). Агенты Valorant, подкалывающие друг друга между раундами, озвученные, с субтитрами в караоке, публикуемые как Shorts. Всё генерируется [`valorant-short-maker`](https://github.com/fox3000foxy/valorant-short-maker), пайплайном TypeScript/Bun, который крутится в cron и публикует так, что никому ничего нажимать не надо.

Вот как это работает, шаг за шагом.

## Что получается

Три кадра, вытащенные из сгенерированного видео для "Duelist Debate" (Phoenix, Yoru и Jett) :

![Intro d'un short, cercle d'agent avec le titre de la scène](/images/valorant-short-maker/vsm-01-intro.png)

![Une réplique en cours, sous-titre karaoké qui s'illumine](/images/valorant-short-maker/vsm-02-dialogue.png)

![Une autre réplique, la couleur du sous-titre change selon l'agent](/images/valorant-short-maker/vsm-03-dialogue.png)

Результат вживую в этом Short : [Duelist Debate -- youtube.com/shorts/SX5Kme58aLU](https://www.youtube.com/shorts/SX5Kme58aLU). На канале шортсы крутятся в районе 1,2-1,5k просмотров. Ничего огромного, но это канал, крутящийся сам с начала, так что число, которое реально считается, это ноль -- ноль минут, потраченных на него после запуска cron.

## Пайплайн по порядку

### 1. Написать скрипт -- Groq + Llama 3.3

Каждый запуск тянет 3-4 случайных агентов из 26 доступных и отправляет в Llama 3.3 70B (через Groq) системный промпт, содержащий на каждого выбранного агента компактное резюме его личности и отношений с другими агентами в сцене (эти персоны живут в `src/lore/`, файл на агента). Промпт навязывает точные правила : одна короткая хлёсткая фраза на реплику, честная ротация между персонажами, юмор в приоритете и главное паузы.

Конкретный пример с "Duelist Debate" -- Phoenix, Yoru и Jett спорят, кто будет играть дуэлиста, сгенерировано 6 июля 2026 :

```
// Реплики скрипта оставлены на английском, как их сгенерировал LLM.
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

Паузы это деталь, делающая ритм естественным : `[0.3]` внутри реплики создаёт тишину 0.3 с в аудиофайле, не пряча круг агента на экране, а отдельная строка `pause: 1.0` создаёт настоящую тишину между двумя говорящими со скрытым кругом. Без этого TTS, шпарящий реплики без дыхания, звучит роботизированно.

### 2. Дать голос -- Piper, модель на агента

У каждого агента своя модель Piper (`.onnx`), обученная специально, хранится в `voices/<agent>/`. Сгенерированный текст проходит в соответствующую модель, на выходе WAV. Та же технология, что я использую для обучения кастомных голосов вообще (см. статью про пайплайн Piper/Kaggle) -- здесь применена прямо в проде, на лету, при каждой генерации видео.

### 3. Караоке-субтитры -- сгенерированный ASS, цвет из иконки

Субтитры это не простой `.srt`. Это файл `.ass` (Advanced SubStation Alpha), сгенерированный пословно, с эффектом караоке : каждое слово подсвечивается цветом по мере произнесения, а остаток текста остаётся нейтральным цветом. Акцентный цвет не фиксирован -- он динамически извлекается из иконки говорящего агента (скрипт Python гоняет PIL по PNG иконки, семплирует непрозрачные пиксели и возвращает доминантные цвета). Итог : субтитр Killjoy подсвечивается фиолетовым, Jett сине-зелёным, и ни один цвет нигде не захардкожен.

### 4. Аудиореактивный круг -- выражение FFmpeg на кадр

Самая замороченная часть пайплайна и, наверное, та, которой я горжусь сильнее всего. Круговая иконка говорящего агента не стоит статично : она слегка зумится в ритме собственного голоса.

Расчёт идёт чтением сырого WAV реплики, вычислением огибающей RMS (root mean square, мера энергии сигнала) покадрово на 60 fps, нормализацией по максимуму, затем сглаживанием на окне в 3 кадра, чтобы избежать рывков. Каждое значение огибающей затем конвертируется в ограниченный коэффициент масштаба через `MAX_ZOOM_VARIATION` (0.2, то есть ±20 % вокруг базового размера).

Результат этого расчёта применяется не кодом, манипулирующим пикселями, -- он транслируется в огромное условное выражение FFmpeg (`lt(n,K)*val + between(n,K,K')*val + ...`, ветка на группу кадров), напрямую управляющее параметром `scale` видеofильтра. FFmpeg вычисляет это выражение на каждом кадре рендера. Для реплики в несколько секунд на 60 fps это быстро сотни веток в одном выражении -- отсюда параметр `STEP`, группирующий кадры, чтобы ограничить глубину.

### 5. Рендер по сегментам, затем fisheye на интро

Каждая реплика рендерится отдельно : фоновое видео (случайный кусок одного из геймплейных клипов в `bg-video/`, обрезанный под нужную длительность), сверху круг агента с аудиореактивным зумом, вшитые субтитры через фильтр `ass` в FFmpeg, аудио TTS, смикшированное со звуком геймплея на фоне.

Самый первый сегмент получает особую обработку : искажение fisheye, постепенно рассасывающееся на первых 20 % кадров (фильтр `lenscorrection`, вычисляемый покадрово, плюс `tmix=frames=3`, смешивающий соседние кадры для имитации motion blur), синхронизированное со звуком "whoosh". Это интро-переход, дающий впечатление, что камера "входит" в сцену.

### 6. Конкатенация и финальный микс

Все сегменты конкатенируются встык, фоновая музыка (Sneaky Snitch, Kevin MacLeod, лицензия Creative Commons) миксуется поверх с **аудио-дакингом** -- сайдчейн-компрессией, автоматически приглушающей музыку, пока говорит агент, и поднимающей её в тишине. Всё крутится в 60 fps от начала до конца, никакой конверсии фреймрейта между шагами.

### 7. Автопубликация

Скрипт `run-cron.sh`, запускаемый классическим cron, активирует окружение Python, грузит `.env` и запускает `bun src/workflow.ts --upload`. Флаг `--upload` дополнительно триггерит генерацию метаданных (название, описание, теги) и вызывает `uploaders/upload.py`, публикующий видео на YouTube и в Instagram через два отдельных скрипта (`uploaders/youtube/upload.py` и `uploaders/instagram/`). Вся цепочка, от промпта LLM до видео онлайн, крутится без вмешательства человека.

## Почему TypeScript/Bun, а не что-то целиком на Python

Выбор не идеологический -- просто Bun даёт прямой и быстрый доступ к `Bun.spawn` для управления FFmpeg в субпроцессах, строгую типизацию структур данных пайплайна (`Phrase`, `SegmentInfo`) и рантайм заметно быстрее на старте, чем Node, для скрипта, крутящегося в cron каждые X часов. Единственные два куска Python в проекте там, где Python реально лучше оснащён : PIL для извлечения цветов и API загрузки (`google-api-python-client` для YouTube, стек Instagram Graph API для IG).

## Что это иллюстрирует

Этот проект хороший пример того, что сегодня можно собрать на полностью бесплатных или опенсорсных кирпичах : быстрый и бесплатный LLM через API Groq, локальный движок TTS, работающий без выделенного GPU, FFmpeg для всего видеорендера -- а связка это лишь несколько сотен строк TypeScript. Ни один из этих кирпичей по отдельности не нов. Пайплайн делает компоновка : сгенерировать связный скрипт с настоящими отношениями персонажей, превратить его в выразительное аудио с естественными паузами, синхронизировать визуальный рендер с энергией этого аудио покадрово и автоматизировать всю цепочку до публикации.

---

**Ресурсы**

- **Репо** : [github.com/fox3000foxy/valorant-short-maker](https://github.com/fox3000foxy/valorant-short-maker)
- **Канал** : [@valorant_agents](https://www.youtube.com/@valorant_agents?app=desktop)

**3 ключевых пункта**

1. Скрипт генерируется LLM (Groq/Llama 3.3) с персонами и отношениями на агента, а не простым списком предписанных шуток.
2. Зум круга агента управляется выражением FFmpeg, вычисляемым покадрово из огибающей RMS WAV -- никакой классической анимации по кейфреймам.
3. Вся цепочка, от промпта до поста на YouTube/Instagram, крутится через одну cron-задачу без вмешательства человека.
