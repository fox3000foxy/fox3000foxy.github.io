---
title: "GitHub Actions를 비틀어 쓰는 5가지 방법 (그리고 시크릿에 대해 배우는 것)"
description: "무료 VPS가 된 CI 러너, 스스로 풀 리퀘스트를 여는 봇, 시크릿 없는 npm 게시. 단순한 lint와 test, deploy를 벗어난 GitHub Actions 패턴들을 제 저장소 순회로 정리해요."
date: 2026-07-14
tags:
  - github-actions
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "O5S2jfLqWq3MD7j2KTPj12gGWM6sKup+Ia/XMqzLUlNMY8QxhJceMfPwR7fU3o2arARcaX6mf2GyUx2BXeq3kA=="
---

# GitHub Actions를 비틀어 쓰는 5가지 방법

GitHub Actions는 겉으로 보면 고전적인 CI와 CD용이에요. 푸시하면 린트하고 테스트하고 배포해요. 특별한 경우 하나는 이미 쓴 적이 있어요 (이메일 봇용 데이터베이스로 git 태그를 쓰는 것, 전용 글 참고). 하지만 제 저장소들을 뒤져 보니 하나의 프로젝트에 집중한 글보다 덜하고 기법 카탈로그에 가까운 별도 글로 쓸 만큼 패턴이 다양해요.

다섯 가지 용도, 가장 고전적인 것부터 가장 비튼 것까지요.

## 1. 두 실행 사이의 영속 상태로 쓰는 git 태그

빠른 복습인데, 자세한 내용은 `email-autoreply` 글이에요. GitHub Actions는 설계상 무상태예요. 매 실행이 깨끗한 기기에서 시작해요. 우회는 전용 git 태그에 값(ID, 타임스탬프, 작은 상태 무엇이든)을 저장하는 거예요. 브랜치에는 절대 저장하지 않아요.

```bash
# 상태 읽기
git show refs/tags/lastid:data/lastId > data/lastId

# 상태 쓰기 (고아 브랜치, 커밋 하나, 태그 강제 푸시)
git switch --orphan lastid-tmp
git commit -m "lastId snapshot"
git tag -f lastid
git push --force origin lastid
```

핵심은 히스토리가 쌓이지 않게 고아 브랜치를 쓰고, 저장소 브랜치 목록을 더럽히지 않으려고 브랜치 대신 강제 태그를 쓰는 거예요.

## 2. 미리 컴파일된 빌드 캐시로 쓰는 git 태그

같은 계열 아이디어, 다른 용도예요. 애플리케이션 상태를 저장하는 대신 **빌드 산출물**을 저장해요. `build` 작업이 코드(`master`로 푸시될 때)를 한 번 컴파일한 뒤 `dist/`와 `node_modules/`를 `runtime` 태그로 푸시해요. `cron` 작업은 매번 `bun install && bun run build`를 돌리는 대신 이 태그를 바로 체크아웃해요.

```yaml
- name: Checkout runtime snapshot
  uses: actions/checkout@v4
  with:
    ref: refs/tags/runtime
    fetch-depth: 1
# install도 build도 없어요. 코드는 이미 준비됐어요
- run: node dist/index.js --action
```

실행이 20초쯤에서 10초쯤으로 바뀌어요. 자주 도는 크론에서는 중요해요. `actions/cache`도 비슷한 일(의존성 캐시)을 하지만, 버전이 고정된 산출물을 통째로 고정해서 명시적으로 가리키고 싶을 때는 단순히 `npm install`을 빠르게 하는 것보다 git 태그가 더 직접적이에요.

## 3. 여러 작업을 묶는 필수 체크 하나

별것 아닌 것 같지만 보호 브랜치 설정에서는 삶을 바꿔주는 작은 패턴이에요. `konosuba-rpg`에서 CI는 병렬로 도는 독립 작업 셋(`typecheck`, `lint`, `tests`)과 다른 셋에만 의존하는 네 번째 작업 `test-battery`로 이루어져 있어요.

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

이 겉보기 작업이 없으면 보호 브랜치를 설정할 때 필수 체크 셋을 따로따로 체크해야 하고, 작업이 추가되거나 이름이 바뀔 때마다 목록을 고쳐야 해요. `test-battery`가 있으면 저장소 설정에서 체크할 이름 하나뿐이고, 내부 세부 사항이 바뀌어도 안정적이에요.

## 4. 무료 러너를 임시 VPS로 바꾸기

가장 비튼 것이고, 확실히 제 최애예요. `repo-to-vps`는 GitHub Actions 러너의 의도된 용도를 완전히 비틀어서 최대 6시간(작업 최대 한도) 동안 SSH로 닿는 무료 Linux 기기로 만들어요.

원리는 [tmate](https://tmate.io/)(SSH나 브라우저로 공유할 수 있는 터미널 세션을 여는 tmux 포크)를 실행하는 것 말고는 거의 아무것도 하지 않는 작업이에요.

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

진짜 어려운 점은 GitHub Actions 러너의 파일시스템이 **일회용**이라는 거예요. 작업이 끝나면 전부 사라져요. 거기서 하는 일이 다음 실행에 증발해 버리면 몇 시간짜리 SSH 세션이 소용없어요. 해결책은 파일시스템의 라이브 스냅샷 역할을 하는 git 브랜치를 계속 동기화하는 거예요.

`start-tmate.sh` 스크립트는 순서대로 이렇게 해요.

1. 작업 시작 때 전용 `filesystem` 브랜치에서 파일시스템을 **복원**해요 (그 위에 `git reset --hard`).
2. `inotifywait`로 파일 변경을 계속 **감시**하고, 파일이 움직이면 바로 **커밋하고 푸시**해요.

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock)(/|$)' .; do
    commit_and_push
    sleep 1   # debounce
  done
}
```

3. 매 저장은 새로 만들지 않고 이전 커밋을 **수정**해요 (`git commit --amend --no-edit`). 그래서 `filesystem` 브랜치는 항상 커밋 하나를 유지하고, 수천 개 스냅샷이 쌓이지 않아요.
4. `while true` 루프가 세션이 죽으면 `tmate`를 자동으로 다시 실행해요. `exit` 뒤에도 터미널에 닿도록 `remain-on-exit on`을 켜고요.
5. tmate가 만든 SSH URL은 `host.conf` 파일에 쓰이고 `filesystem` 브랜치에 커밋돼서, 작업 로그에 직접 닿은 적 없이 GitHub API(`gh api .../contents/host.conf`)로 가져올 수 있어요.
6. `inotifywait`가 이벤트를 놓칠 경우를 대비해 `periodic_save` 루틴이 5초마다 백그라운드로 돌아요.

결과: 파일시스템이 세션 사이에 유지되는 완전한 Linux 셸이 어디에서든 닿아요. 그런데 밑바탕 인프라(GitHub Actions 러너)는 전혀 그렇게 설계되지 않았어요. 유일한 진짜 한도는 작업당 6시간 타임아웃이에요. 그 뒤에는 워크플로를 다시 실행해야 해요.

## 5. 스스로 풀 리퀘스트를 여는 봇

`konosuba-rpg`에서는 `dev` 브랜치 푸시가 `main`으로 열린 풀 리퀘스트가 있는지 확인하고, 없으면 `actions/github-script`와 GitHub REST API로 자동으로 하나 만드는 작업을 일으켜요.

```js
const { data: comparison } = await github.rest.repos.compareCommits({
  owner, repo, base: 'main', head: 'dev',
});
if (comparison.ahead_by === 0) return; // 제안할 것 없어요

const { data: existing } = await github.rest.pulls.list({
  owner, repo, state: 'open', head: `${owner}:dev`, base: 'main',
});
if (existing.length > 0) return; // 이미 열린 PR 있어요

await github.rest.pulls.create({
  owner, repo, head: 'dev', base: 'main',
  title: 'chore: auto PR from dev to main',
});
```

여기서 중요한 세부 사항은 쓰는 토큰이에요. 이 워크플로는 자동 `GITHUB_TOKEN`을 **쓰지 않아요**. 별도 시크릿 `AUTO_PR_TOKEN`을 요구하고, 없으면 진행을 거부해요.

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

## 6. 시크릿 없이 npm에 게시하기

다섯 가지 중 가장 눈에 띄지 않지만, 아마 미래를 위해 가장 중요해요. `typescript-virtual-container`의 `publish.yml` 워크플로에는 **npm 시크릿이 전혀 없어요**. `NPM_TOKEN`도 `NODE_AUTH_TOKEN`도 없어요. 이거뿐이에요.

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

`npm publish`는 그래도 동작해요. npm 레지스트리가 이제 OIDC를 통한 **트러스티드 퍼블리싱**을 지원하니까요. 워크플로가 정적 토큰을 어디에도 주고받거나 저장하지 않고 레지스트리에 직접 신원을 증명해요 (npmjs.org 쪽에 설정된 정확한 저장소와 워크플로). 유출할 시크릿도 없고, 6개월마다 돌릴 토큰도 없어요.

---

## GitHub 시크릿, 깊이 들어가기

이 다섯 가지 패턴은 어떤 식으로든 모두 시크릿 문제에 닿아요. 제 워크플로 도처에 돌아오는 원칙 몇 가지예요.

**시크릿이 꼭 단순 문자열은 아니에요.** `email-autoreply`에서 `ACCOUNTS_JSON`은 멀티 계정 설정의 minify된 JSON 전체를 담고 있어요. 단순 API 키가 아니라 완전한 자료구조를 런타임에 파일에 그대로 주입해요.

```yaml
env:
  ACCOUNTS_JSON: ${{ secrets.ACCOUNTS_JSON }}
run: printf "%s" "$ACCOUNTS_JSON" > data/accounts.json
```

암호화했더라도 설정 파일을 커밋할 필요가 없고, 코드를 건드리지 않고 저장소 설정에서 클릭 한 번으로 고쳐져요.

**`GITHUB_TOKEN`에는 정확한 한도가 있고, 의도된 거예요.** 매 실행에 GitHub이 주입하는 자동 토큰은 강력하지만 몇 가지 점에서 봉인되어 있어요. 기본적으로 다른 워크플로를 일으킬 수 없고, 저장소 설정에 따라 브랜치 보호 규칙에 막힐 수 있어요. 바로 그래서 `create-pull-request.yml`이 별도 PAT(`AUTO_PR_TOKEN`)를 요구해요. 진짜 계정(또는 GitHub App)에서 온 토큰으로, 명시적 권한 `contents:write`와 `pull-requests:write`를 가지고 작업의 단명 토큰과 구분돼요.

**권한은 전체가 아니라 작업별로 범위를 정해요.** 여기 나열한 각 워크플로는 최소 권한의 주석 달린 `permissions:` 블록을 선언해요.

```yaml
permissions:
  contents: read
  actions: read
  checks: write
  # Only allow writing checks, everything else is read-only
```

공개 저장소의 기본 `GITHUB_TOKEN`은 역사적으로 꽤 넓은 권한이 있어요. 작업에 실제로 필요한 것으로 명시적으로 좁히면 체인의 서드파티 액션(`uses: quelqu-un/action@version`) 중 하나가 손상됐을 때 피해를 제한해요.

**가장 좋은 시크릿은 존재하지 않는 시크릿이에요.** `typescript-virtual-container`의 OIDC 패턴이 이 생각의 가장 완성된 버전이에요. `NPM_TOKEN`의 교체와 만료, 유출 위험을 관리하는 대신, 워크플로가 제삼자 서비스에 직접 암호학적으로 신원을 증명해요 (바로 이 저장소, 바로 이 워크플로). AWS, Docker Hub, PyPI에도 같은 논리가 있어요. 점점 더 많은 레지스트리와 클라우드가 GitHub Actions의 OIDC를 지원해요.

---

**핵심 3가지**

1. git 태그(고아, 강제 푸시)는 미니멀 데이터베이스나 미리 컴파일된 빌드 캐시로 쓸 수 있어요. 같은 메커니즘의 서로 다른 두 용도예요.
2. git 브랜치에 파일시스템을 계속 동기화하면 무료 GitHub Actions 러너가 영속 셸이 될 수 있어요. `inotifywait` 자동 저장과 커밋 하나로 수정이요.
3. 기본 `GITHUB_TOKEN`은 의도적으로 제한돼요. 브랜치 사이 PR 만들기나 시크릿 없는 게시는 전용 PAT나 OIDC 트러스티드 퍼블리싱으로 넘어가야 해요.
