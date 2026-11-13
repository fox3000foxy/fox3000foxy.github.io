---
title: Как работает этот блог?
description: "Закулисье блога : React, Vite, Markdown, CI/CD-пайплайн
  и поток написания."
date: 2026-03-08
aiGenerated: true
tags:
  - react
  - meta
  - blog
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "WQT8mLmSFEjosn4TEVep9Jm7kbPK/oyxV4DiaM8hNExjTh4lxmPXP3XsF2XDbfTRurSdUAXd0EhLDXeBRm6FVA=="
---

# Как работает этот блог?

Ты уже спрашивал себя, как этот блог устроен под капотом? В этой статье я детально разберу всю архитектуру приложения, от технического стека до процесса написания статьи. И да, даже покажу, как я пишу статьи из VS Code!

## Технический стек

Этот блог построен на современных веб-технологиях :

- **React 19** : для пользовательского интерфейса
- **TypeScript** : для типизированного и надёжного кода
- **Vite** : как ультрабыстрый инструмент сборки
- **React Router v7** : для навигации между страницами
- **react-markdown** : чтобы превращать Markdown в HTML
- **rehype-raw + rehype-sanitize** : чтобы разрешать сырой HTML в Markdown безопасно


## Структура проекта

Вот как выглядит дерево проекта :

![](assets/how-this-blog-works/project-structure.png)

```
├── .github/
│   └── workflows/
│       └── deploy.yml              ← Pipeline CI/CD
├── public/
│   ├── home.md                     ← Contenu de la page d'accueil
│   ├── portfolio.md                ← Contenu du portfolio
│   └── articles/
│       ├── index.json              ← Liste de tous les articles
│       ├── hello-world.md          ← Un article
│       ├── how-this-blog-works.md  ← Cet article !
│       └── assets/                 ← Images des articles
├── src/
│   ├── main.tsx                    ← Point d'entrée React
│   ├── App.tsx                     ← Routeur principal
│   ├── components/
│   │   ├── Header.tsx              ← Barre de navigation
│   │   └── Footer.tsx              ← Pied de page
│   └── pages/
│       ├── Home.tsx                ← Page d'accueil
│       ├── BlogList.tsx            ← Liste des articles
│       ├── Article.tsx             ← Lecteur d'article
│       ├── Portfolio.tsx           ← Page portfolio
│       └── NotFound.tsx            ← Page 404
└── vite.config.ts                  ← Configuration Vite
```

Центральная идея проста : **контент отделён от кода**. Страницы пишутся в Markdown в папке `public/`, а код React в `src/` занимается их показом. Держусь за это разделение : оно делает контент лёгким для перечитывания, а код лёгким для развития.

## Система роутинга

Файл `App.tsx` определяет все роуты приложения через React Router :

![](assets/20260308_153440_image.png)


| Route         | Page      | Description                                |
| --------------- | ----------- | -------------------------------------------- |
| `/`           | Home      | Page d'accueil, charge `home.md`            |
| `/blog`       | BlogList  | Liste de tous les articles                  |
| `/blog/:slug` | Article   | Un article, charge `articles/{slug}.md`     |
| `/portfolio`  | Portfolio | Page portfolio, charge `portfolio.md`       |
| `*`           | NotFound  | Page 404 pour les URLs inconnues            |

У каждой страницы чёткая роль : она забирает файл Markdown, превращает его в HTML через `react-markdown` и показывает на экране.

## Как работает статья?

Это часть, которую я люблю больше всего! Вот жизненный цикл статьи :

### 1. Файл `index.json`

Все статьи перечислены в `public/articles/index.json`. Каждая запись содержит метаданные статьи :

```json
[
  {
    "slug": "hello-world",
    "title": "Hello World",
    "description": "A sample post for Fox's Blog.",
    "date": "2026-03-08"
  }
]
```

- **slug** : уникальный идентификатор, используется в URL (`/blog/hello-world`)
- **title** : заголовок, показываемый в списке
- **description** : короткое резюме
- **date** : дата публикации

### 2. Файл Markdown

Содержимое статьи это простой файл `.md` в `public/articles/`. Имя файла соответствует `slug`, определённому в `index.json`.

![](assets/20260308_153509_image.png)

Ты можешь класть туда что хочешь : заголовки, списки, картинки, таблицы и даже сырой HTML благодаря `rehype-raw`!

### 3. Рендер на стороне React

Когда заходишь на `/blog/hello-world`, происходит вот что :

1. React Router забирает параметр `slug` из URL
2. Компонент `Article.tsx` грузит `/articles/hello-world.md`
3. Markdown превращается в HTML через `react-markdown`
4. Ссылки на `assets/` автоматически переписываются в `/articles/assets/`
5. Параллельно метаданные грузятся из `index.json`, чтобы показать дату и описание

Это так же просто!

## Главная страница и портфолио

Страницы Главная и Портфолио работают ровно так же : они грузят файл Markdown (`home.md` или `portfolio.md`) и рендерят его в HTML.

Особенность в том, что они используют кастомную схему санитизации, разрешающую атрибуты `class` и `style` на всех HTML-элементах. Это позволяет мне писать стилизованный HTML прямо в Markdown, например галереи картинок.

## Header и Footer

Header прибит к верху страницы через `position: fixed`. Он содержит :

- Мой аватар GitHub (грузится прямо с `github.com/fox3000foxy.png`)
- Название блога
- Навигационные ссылки : Главная, Блог, Портфолио

Footer минималистичный : просто копирайт с динамически вычисляемым текущим годом.

## Тёмная тема

Сайт постоянно в тёмном режиме. Я сделал этот выбор осознанно, чтобы комфортно читать вечером : `color-scheme: dark` задан в глобальных стилях, с чёрным фоном `#000` и белым текстом `#fff`. Ссылки синие (`#64b5f6`) и становятся зелёными при наведении (`#81c784`).

## Как я пишу статью

К практике! Вот мой воркфлоу для написания новой статьи :

### Шаг 1 : Создать файл Markdown

Открываю VS Code и создаю новый файл `.md` в `public/articles/` :

### Шаг 2 : Написать содержимое

Пишу содержимое статьи прямо в Markdown. В VS Code отличный встроенный предпросмотр Markdown :

![](assets/20260308_153613_image.png)

Для картинок кладу их в `public/articles/assets/` и ссылаюсь стандартным синтаксисом Markdown :

```markdown
![description](assets/my-image.png)
```

Компонент `Article.tsx` автоматически переписывает путь `assets/` в `/articles/assets/`, чтобы картинки корректно показывались.

### Шаг 3 : Зарегистрировать статью в index.json

Когда статья готова, добавляю её в `public/articles/index.json`, чтобы она появилась в списке блога :

![](assets/20260308_153629_image.png)

### Шаг 4 : Протестировать локально

Запускаю dev-сервер Vite :

```bash
pnpm dev
```

Vite стартует за миллисекунды, и я вижу статью в реальном времени на `localhost:5173`. Эта скорость позволяет проверять каждое изменение почти мгновенно :

![](assets/20260308_153703_image.png)

### Шаг 5 : Опубликовать

Достаточно простого `git push`! CI/CD-пайплайн занимается остальным автоматически.

## CI/CD-пайплайн деплоя

Я настроил полный пайплайн **GitHub Actions**, автоматизирующий линт, сборку и деплой сайта при каждом push в `main`. Смотрим в деталях.

Воркфлоу лежит в `.github/workflows/deploy.yml` и разбит на две джобы : **build** и **deploy**.

### Триггеры

```yaml
on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
```

Пайплайн выполняется при каждом **push** в `main` и при каждом **pull request** в `main`. PR, таким образом, проверяются (линт + сборка) до мержа, но деплой триггерят только пуши в `main`.

### Джоба 1 : Build

Сборочная джоба крутится на `ubuntu-latest` и идёт по шагам :

1. **Checkout** : Клонирует репозиторий со всей историей (`fetch-depth: 0`)
2. **Setup pnpm** : Ставит последнюю версию pnpm через `pnpm/action-setup@v4`
3. **Setup Node.js 20** : Настраивает Node с включённым кэшем pnpm для более быстрых установок
4. **Install dependencies** : Выполняет `pnpm install --frozen-lockfile`, чтобы гарантировать воспроизводимые сборки (никаких модификаций lockfile)
5. **Lint** : Выполняет `pnpm run lint` (ESLint), чтобы проверить качество кода до сборки
6. **Build** : Выполняет `pnpm run build`, сначала проверяющий типы TypeScript (`tsc -b`), затем бандлящий всё через Vite
7. **Upload artifact** : Заливает папку `dist/` как артефакт сборки для деплой-джобы

Если шаг падает (ошибка линта, типов или сборки), весь пайплайн останавливается и ничего не деплоится. Эта стража защищает меня от сломанного кода в проде, и я на неё полагаюсь при каждом push.

### Джоба 2 : Deploy

Деплой-джоба выполняется, только если :

- Сборочная джоба успешна (`needs: build`)
- Событие это **push** (не PR)
- Ветка **main**

```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

Дальше она идёт так :

1. **Скачивает артефакт сборки** : Забирает папку `dist/`, произведённую сборочной джобой
2. **Настраивает GitHub Pages** : Готовит окружение Pages
3. **Заливает в Pages** : Готовит папку `dist/` для GitHub Pages
4. **Деплоит** : Публикует сайт через `actions/deploy-pages@v4`

### Полная картина

Вот что происходит от написания до деплоя :

```
Пишу статью в VS Code
          ↓
    git add & commit
          ↓
       git push
          ↓
   GitHub Actions триггерится
          ↓
   ┌─────────────────┐
   │   BUILD JOB     │
   │  1. Checkout    │
   │  2. Setup pnpm  │
   │  3. Setup Node  │
   │  4. Install     │
   │  5. Lint ✓      │
   │  6. Build ✓     │
   │  7. Upload dist │
   └────────┬────────┘
            ↓
   ┌─────────────────┐
   │  DEPLOY JOB     │
   │  1. Download    │
   │  2. Configure   │
   │  3. Upload      │
   │  4. Deploy 🚀   │
   └─────────────────┘
            ↓
     Онлайн на GitHub Pages !
```

Весь процесс занимает около минуты между push и выходом онлайн. Публикую простым `git push`, всё остаётся автоматическим без FTP и SSH.

## Продакшн-сборка

Под капотом команда `pnpm build` выполняет :

1. `tsc -b` : Проверяет типы TypeScript
2. `vite build` : Бандлит и оптимизирует весь код

Vite даёт минифицированные и оптимизированные файлы с автоматическим code-splitting. Итог это ультрабыстрый статичный сайт.

## Почему такая архитектура?

Я мог бы использовать CMS, генератор статичных сайтов вроде Hugo или Jekyll, или даже Next.js. Но вот почему я выбрал этот подход :

- **Простота** : Пиши в Markdown, пушь на GitHub, оно онлайн
- **Полный контроль** : Никакой зависимости от CMS или базы данных
- **Производительность** : Vite + React = быстрая загрузка
- **Гибкость** : Могу мешать Markdown и HTML как хочу
- **Учёба** : Отличный проект, чтобы освоить React и TypeScript
- **CI/CD** : Проверки качества и автодеплой через GitHub Actions

## Заключение

Этот блог простой, но продуманный проект : Markdown для контента, React для рендера, Vite для производительности, GitHub Actions для CI/CD и GitHub Pages для хостинга. Он опирается только на статичные файлы, отдаваемые эффективно, с автоматизированным пайплайном, гарантирующим качество при каждом push.


Спасибо, что прочитал, и до встречи в следующей статье! 🦊
