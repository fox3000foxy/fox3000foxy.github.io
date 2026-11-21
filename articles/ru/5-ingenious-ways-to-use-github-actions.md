---
title: "5 кривых способов использовать GitHub Actions (и чему это учит про секреты)"
description: "CI-раннер, превращённый в бесплатный VPS, бот, открывающий собственные пул-реквесты, npm-публикация без единого секрета. Обход моих репозиториев ради списка паттернов GitHub Actions за пределами простого «линт + тест + деплой»."
date: 2026-07-14
tags:
  - github-actions
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "EHWtzNtzQ8o/trmllTlcI4xhrZSLmDrNJ+MsbWmr0QHCGHzef2NHRUXLZ4wm82dyybsmKHj7U/ycqHzJi67VhQ=="
---

# 5 кривых способов использовать GitHub Actions

GitHub Actions на бумаге сделан для классического CI/CD : ты пушишь, он линтует, тестит, деплоит. Про один частный случай я уже писал (использование git-тегов как базы данных для email-бота, см. отдельную статью). Но покопавшись в собственных репозиториях, там достаточно разных паттернов, чтобы хватило на отдельную статью, менее завязанную на один проект, больше каталог техник.

Пять применений, от самого классического до самого кривого.

## 1. Git-тег как персистентное состояние между двумя запусками

Быстрое напоминание, полная деталь в статье про `email-autoreply`. GitHub Actions stateless по дизайну : каждый запуск стартует с чистой машины. Обход : хранить значение (ID, timestamp, любое мелкое состояние) в выделенном git-теге, никогда в ветке.

```bash
# читаем состояние
git show refs/tags/lastid:data/lastId > data/lastId

# пишем состояние (сиротская ветка, один коммит, force-push тега)
git switch --orphan lastid-tmp
git commit -m "lastId snapshot"
git tag -f lastid
git push --force origin lastid
```

Ключевое : сиротская ветка, чтобы никогда не копить историю, и форсированный тег вместо ветки, чтобы не засорять список веток репозитория.

## 2. Git-тег как кэш предсобранного билда

То же семейство идеи, другое применение : вместо хранения прикладного состояния храним **артефакт сборки**. Джоба `build` компилирует код один раз (на push в `master`), затем пушит `dist/` + `node_modules/` в тег `runtime`. Джоба `cron`, в свою очередь, чекаутит прямо этот тег вместо того, чтобы гонять `bun install && bun run build` при каждом запуске :

```yaml
- name: Checkout runtime snapshot
  uses: actions/checkout@v4
  with:
    ref: refs/tags/runtime
    fetch-depth: 1
# никакого install, никакого build -- код уже готов
- run: node dist/index.js --action
```

Это меняет запуск с ~20s на ~10s. На cron, крутящемся часто, это считается. `actions/cache` делает похожую работу (кэшировать зависимости), но git-тег прямее, когда хочешь вообще заморозить версионированный артефакт и явно на него указывать, а не просто ускорять `npm install`.

## 3. Один обязательный чек, агрегирующий несколько джоб

Маленький паттерн, выглядящий никак, но меняющий жизнь в настройке защищённой ветки. На `konosuba-rpg` у CI три независимые джобы (`typecheck`, `lint`, `tests`), крутящиеся параллельно, и четвёртая джоба, `test-battery`, не делающая ничего, кроме зависимости от первых трёх :

```yaml
test-battery:
  needs:
    - typecheck
    - lint
    - tests
  runs-on: ubuntu-latest
  steps:
    - run: echo "Typecheck, lint and tests succeeded."
```

Без этой фасадной джобы настройка защищённой ветки потребовала бы отмечать три отдельных обязательных чека и обновлять этот список каждый раз, когда джоба добавляется или переименовывается. С `test-battery` одно имя для галочки в настройках репозитория, стабильное, даже если внутренняя деталь меняется.

## 4. Превратить бесплатный раннер во временный VPS

Это самое кривое из всех и явно моё любимое : `repo-to-vps` полностью уводит предусмотренное применение раннера GitHub Actions, делая из него доступную по SSH машину Linux, бесплатную, до 6 часов (максимальный лимит джобы).

Принцип : джоба, почти ничего не делающая, кроме запуска [tmate](https://tmate.io/) (форк tmux, выставляющий расшариваемую терминальную сессию по SSH или браузеру) :

```yaml
name: debug-runner
on:
  push:
    branches: [main, master]
  workflow_dispatch:
permissions:
  contents: write
  actions: write
jobs:
  debug:
    runs-on: ubuntu-latest
    timeout-minutes: 360
    steps:
      - uses: actions/checkout@v4
      - uses: awalsh128/cache-apt-pkgs-action@v1.6.0
        with:
          packages: tmate inotify-tools
      - run: bash .github/scripts/start-tmate.sh
```

Настоящая головоломка : файловая система раннера GitHub Actions **одноразовая** : как только джоба завершается, всё исчезает. SSH-сессия на часы бесполезна, если всё, что ты в ней делаешь, испаряется при следующем запуске. Решение : ветка git, служащая живым снапшотом файловой системы, непрерывно синхронизируемая.

Скрипт `start-tmate.sh` делает по порядку :

1. **Восстанавливает** файловую систему из выделенной ветки `filesystem` на старте джобы (`git reset --hard` на неё).
2. **Наблюдает** изменения файлов через `inotifywait` непрерывно и **коммитит + пушит сразу**, как только файл шевельнулся :

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock)(/|$)' .; do
    commit_and_push
    sleep 1   # debounce
  done
}
```

3. Каждое сохранение **аммендит** предыдущий коммит вместо создания нового (`git commit --amend --no-edit`), так что ветка `filesystem` всегда остаётся на одном коммите, что избегает накопления тысяч снапшотов.
4. Цикл `while true` перезапускает `tmate` автоматически, если сессия умерла, с `remain-on-exit on`, чтобы терминал оставался доступен даже после `exit`.
5. SSH-URL, сгенерированный tmate, пишется в файл `host.conf`, коммитящийся в ветку `filesystem`, так что достаётся через API GitHub (`gh api .../contents/host.conf`), ни разу не имея доступа к логам джобы вживую.
6. Рутина `periodic_save` крутится каждые 5 секунд в фоне, на случай если `inotifywait` пропустит событие.

Итог : полный шелл Linux, доступный откуда угодно, с файловой системой, персистентной между сессиями, при том что нижележащая инфраструктура (раннер GitHub Actions) совершенно для этого не проектировалась. Единственный настоящий лимит это таймаут 6 ч на джобу : после чего надо перезапустить воркфлоу.

## 5. Бот, открывающий собственные пул-реквесты

На `konosuba-rpg` push в ветку `dev` триггерит джобу, проверяющую, есть ли уже открытый пул-реквест в `main`, и автоматически создающую его, если нет, через `actions/github-script` и REST API GitHub :

```js
const { data: comparison } = await github.rest.repos.compareCommits({
  owner, repo, base: 'main', head: 'dev',
});
if (comparison.ahead_by === 0) return; // нечего предлагать

const { data: existing } = await github.rest.pulls.list({
  owner, repo, state: 'open', head: `${owner}:dev`, base: 'main',
});
if (existing.length > 0) return; // уже есть открытый PR

await github.rest.pulls.create({
  owner, repo, head: 'dev', base: 'main',
  title: 'chore: auto PR from dev to main',
});
```

Важная здесь деталь это используемый токен. Этот воркфлоу **не** использует автоматический `GITHUB_TOKEN` : он требует отдельный секрет `AUTO_PR_TOKEN` и отказывается продолжать, если его нет :

```yaml
- name: Validate pull request token
  env:
    AUTO_PR_TOKEN: ${{ secrets.AUTO_PR_TOKEN }}
  run: |
    if [ -z "$AUTO_PR_TOKEN" ]; then
      echo "AUTO_PR_TOKEN is required... Use a PAT or GitHub App token with contents:write and pull-requests:write."
      exit 1
    fi
```

## 6. Публикация на npm вообще без секретов

Самый незаметный из пяти, но, вероятно, самый важный на будущее : воркфлоу `publish.yml` в `typescript-virtual-container` не содержит **никакого npm-секрета**. Никакого `NPM_TOKEN`, никакого `NODE_AUTH_TOKEN`. Только это :

```yaml
permissions:
  id-token: write  # Required for OIDC
  contents: read
jobs:
  publish:
    steps:
      - uses: actions/setup-node@v6
        with:
          registry-url: 'https://registry.npmjs.org'
      - run: npm publish
```

`npm publish` всё равно работает, потому что реестр npm теперь поддерживает **trusted publishing** через OIDC : воркфлоу доказывает свою идентичность прямо реестру (точные репо + воркфлоу, настроенные на стороне npmjs.org), без того чтобы какой-либо статичный токен где-то ходил или хранился. Ноль секретов для утечки, ноль токенов для ротации каждые полгода.

---

## Секреты GitHub вглубь

Эти пять паттернов все так или иначе касаются вопроса секретов. Несколько принципов, повторяющихся во всех моих воркфлоу :

**Секрет не обязательно простая строка.** В `email-autoreply` `ACCOUNTS_JSON` содержит целый минифицированный JSON мультиаккаунтной конфигурации : полноценная структура данных вместо простого API-ключа, впрыскиваемая как есть в файл в рантайме :

```yaml
env:
  ACCOUNTS_JSON: ${{ secrets.ACCOUNTS_JSON }}
run: printf "%s" "$ACCOUNTS_JSON" > data/accounts.json
```

Это избегает коммита файла конфигурации, хоть шифрованного, и обновляется в один клик в настройках репо, не трогая код.

**У `GITHUB_TOKEN` точные лимиты, и это задумано.** Автоматический токен, впрыскиваемый GitHub при каждом запуске, мощен, но запечатан в отдельных местах : по умолчанию он не может триггерить другой воркфлоу, а в зависимости от настроек репо может блокироваться правилами защиты ветки. Именно поэтому `create-pull-request.yml` требует отдельный PAT (`AUTO_PR_TOKEN`) : токен от настоящего аккаунта (или GitHub App) с явными правами `contents:write` + `pull-requests:write`, отдельный от эфемерного токена джобы.

**Права скоупятся джоба за джобой, а не глобально.** Каждый перечисленный здесь воркфлоу объявляет минимальный и прокомментированный блок `permissions:` :

```yaml
permissions:
  contents: read
  actions: read
  checks: write
  # Only allow writing checks, everything else is read-only
```

Дефолтный `GITHUB_TOKEN` исторически имеет довольно широкие права на публичном репо ; явное ограничение до реально нужного джобе лимитирует ущерб, если сторонний экшен в цепочке (`uses: quelqu-un/action@version`) окажется скомпрометирован.

**Лучший секрет тот, которого нет.** OIDC-паттерн `typescript-virtual-container` самая зрелая версия этой идеи : вместо управления ротацией, истечением и риском утечки `NPM_TOKEN` воркфлоу криптографически доказывает свою идентичность (этот точный репо, этот точный воркфлоу) прямо стороннему сервису. Та же логика доступна для AWS, Docker Hub, PyPI : всё больше реестров и облаков поддерживают OIDC из GitHub Actions.

---

**3 ключевых пункта**

1. Git-тег (сиротский, форспушенный) может служить минималистичной базой данных или кэшем предсобранного билда : два разных применения одного механизма.
2. Бесплатный раннер GitHub Actions может стать персистентным шеллом SSH, если согласиться непрерывно синхронизировать его файловую систему в ветку git, с автосейвом через `inotifywait` и одним аммендимым коммитом.
3. Дефолтный `GITHUB_TOKEN` намеренно ограничен : создание PR между ветками или публикация без секрета требует либо выделенного PAT, либо перехода на OIDC trusted publishing.
