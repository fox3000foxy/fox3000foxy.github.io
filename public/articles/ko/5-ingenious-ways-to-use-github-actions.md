---
title: "GitHub Actions를 기발하게 활용하는 5가지 방법 (그리고 시크릿에 대해 배우는 것)"
description: "CI 러너를 무료 VPS로 변신, 스스로 PR을 여는 봇, 시크릿 없는 npm 배포. 단순한 lint+test+deploy를 넘어선 GitHub Actions 패턴 카탈로그."
date: 2026-07-14
tags:
  - github-actions
  - devops
  - automation
authors:
  - fox3000foxy
---

# GitHub Actions를 기발하게 활용하는 5가지 방법

GitHub Actions는 원래 고전적인 CI/CD를 위한 거다: 푸시하면 린트하고, 테스트하고, 배포한다. 특수 케이스에 대해 이미 글을 썼다 -- git 태그를 이메일 봇 데이터베이스로 쓰는 방법(전용 글 참고). 하지만 내 레포를 뒤져보니 하나의 프로젝트에 집중하기보다 카탈로그처럼 정리할 만한 패턴들이 꽤 많았다.

다섯 가지. 가장 평범한 것부터 가장 기발한 것까지.

## 1. git 태그를 런 간 영속 상태로 쓰기

간단히 요약하자면, 자세한 건 `email-autoreply` 글에 있다. GitHub Actions는 설계상 stateless다 -- 매번 빈 머신에서 시작한다. 우회 방법: 값(ID, 타임스탬프 등 작은 상태)을 전용 git 태그에 저장하는 거다. 브랜치가 아니라.

```bash
# 상태 읽기
git show refs/tags/lastid:data/lastId > data/lastId

# 상태 쓰기 (고아 브랜치, 단일 커밋, 태그 force-push)
git switch --orphan lastid-tmp
git commit -m "lastId snapshot"
git tag -f lastid
git push --force origin lastid
```

핵심: 고아 브랜치로 히스토리가 쌓이지 않게 하고, 브랜치 대신 강제 태그로 레포의 브랜치 목록을 더럽히지 않는다.

## 2. git 태그를 미리 컴파일된 빌드 캐시로 쓰기

같은 아이디어 계열, 다른 용도: 앱 상태 대신 **빌드 아티팩트**를 저장한다. `build` 잡이 코드를 한 번 컴파일하고 (`master` 푸시 시), `dist/` + `node_modules/`를 `runtime` 태그에 푸시한다. `cron` 잡은 매번 `bun install && bun run build`를 돌리는 대신 이 태그를 바로 체크아웃한다:

```yaml
- name: Checkout runtime snapshot
  uses: actions/checkout@v4
  with:
    ref: refs/tags/runtime
    fetch-depth: 1
# install도 build도 없이 -- 코드는 이미 준비됨
- run: node dist/index.js --action
```

런 타임이 ~20초에서 ~10초로 줄어든다. 자주 도는 크론에선 의미 있다. `actions/cache`도 비슷한 일을 하지만(의존성 캐싱), git 태그는 버전이 찍힌 아티팩트를 통째로 얼리고 명시적으로 가리킬 때 더 직관적이다 -- 단순히 `npm install`을 빠르게 하는 것 이상.

## 3. 여러 잡을 묶는 단일 필수 체크

별거 아닌 것 같지만 브랜치 보호 설정을 확 바꿔주는 패턴. `konosuba-rpg`에서 CI는 세 개의 독립 잡(`typecheck`, `lint`, `tests`)이 병렬로 돌고 -- 네 번째 잡 `test-battery`는 앞의 세 개에 의존만 할 뿐 아무것도 안 한다:

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

이 외관상 잡이 없으면 보호 브랜치 설정할 때 체크를 세 개 따로 찍고, 잡이 추가되거나 이름이 바뀔 때마다 그 목록을 갱신해야 한다. `test-battery`가 있으면 레포 설정에서 이름 하나만 체크하면 되고, 내부가 바뀌어도 그대로 유지된다.

## 4. 무료 러너를 임시 VPS로 탈바꿈시키기

제일 기발하고 분명 제일 마음에 드는 거: `repo-to-vps`는 GitHub Actions 러너의 원래 용도를 완전히 비틀어서 SSH로 접속 가능한 Linux 머신으로 만든다. 무료. 최대 6시간(잡 최대 시간).

원리: tmate를 실행하는 것 말고는 거의 아무것도 안 하는 잡.

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

진짜 난제는 GitHub Actions 러너의 파일시스템이 **일회용**이라는 점이다 -- 잡이 끝나는 순간 전부 사라진다. 몇 시간짜리 SSH 세션도 다음 실행에서 증발하면 무의미하다. 해결책: 파일시스템의 라이브 스냅샷 역할을 하는 git 브랜치, 지속적으로 동기화.

`start-tmate.sh` 스크립트는 순서대로:

1. 잡 시작 시 전용 `filesystem` 브랜치에서 파일시스템을 **복원**한다 (`git reset --hard`).
2. `inotifywait`로 파일 변경을 지속적으로 **감시**하고, 파일이 바뀌는 즉시 **커밋 + 푸시**한다:

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock)(/|$)' .; do
    commit_and_push
    sleep 1
  done
}
```

3. 저장할 때마다 새 커밋 대신 이전 커밋을 **수정**한다 (`git commit --amend --no-edit`), 그래서 `filesystem` 브랜치는 항상 단일 커밋 상태 -- 수천 개의 스냅샷이 쌓이지 않는다.
4. `while true` 루프로 세션이 죽으면 tmate를 자동 재시작, `remain-on-exit on`으로 `exit` 후에도 터미널 접속 가능.
5. tmate가 생성한 SSH URL을 `host.conf` 파일에 쓰고 `filesystem` 브랜치에 커밋 -- 잡 로그를 라이브로 볼 수 없어도 GitHub API (`gh api .../contents/host.conf`)로 가져올 수 있다.
6. `periodic_save` 루틴이 5초마다 백그라운드에서 돌면서 `inotifywait`가 이벤트를 놓친 경우에 대비한다.

결과: 어디서든 접속 가능한 완전한 Linux 셸. 세션 간에 파일시스템이 유지된다 -- 기반 인프라(GitHub Actions 러너)는 전혀 그런 용도로 설계되지 않았는데도. 유일한 진짜 제한은 잡당 6시간 타임아웃 -- 그 이후엔 워크플로우를 다시 시작해야 한다.

## 5. 스스로 PR을 여는 봇

`konosuba-rpg`에서 `dev` 브랜치 푸시가 `main`으로 열린 PR이 이미 있는지 확인하는 잡을 트리거한다 -- 없으면 `actions/github-script`와 GitHub REST API로 자동 생성:

```js
const { data: comparison } = await github.rest.repos.compareCommits({
  owner, repo, base: 'main', head: 'dev',
});
if (comparison.ahead_by === 0) return;

const { data: existing } = await github.rest.pulls.list({
  owner, repo, state: 'open', head: `${owner}:dev`, base: 'main',
});
if (existing.length > 0) return;

await github.rest.pulls.create({
  owner, repo, head: 'dev', base: 'main',
  title: 'chore: auto PR from dev to main',
});
```

여기서 중요한 건 사용된 토큰이다. 이 워크플로우는 자동 `GITHUB_TOKEN`을 **안 쓴다** -- 별도 `AUTO_PR_TOKEN` 시크릿을 요구하고, 없으면 실행을 거부한다:

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

## 6. 시크릿 없이 npm에 배포하기

다섯 가지 중 가장 조용하지만, 미래를 위해 가장 중요한 것: `typescript-virtual-container`의 `publish.yml` 워크플로우는 **npm 시크릿이 전혀 없다**. `NPM_TOKEN`도, `NODE_AUTH_TOKEN`도 없다. 그냥 이거:

```yaml
permissions:
  id-token: write
  contents: read
jobs:
  publish:
    steps:
      - uses: actions/setup-node@v6
        with:
          registry-url: 'https://registry.npmjs.org'
      - run: npm publish
```

`npm publish`가 작동하는 건, npm 레지스트리가 이제 OIDC를 통한 **trusted publishing**을 지원하기 때문이다: 워크플로우가 바로 레지스트리에 자신의 신원을 증명하고(npmjs.org 쪽에 설정된 정확한 레포 + 워크플로우), 정적 토큰이 어디에도 저장되거나 전송되지 않는다. 유출될 시크릿도, 6개월마다 교체할 토큰도 없다.

---

## GitHub 시크릿, 깊이 파보기

이 다섯 패턴은 전부 어떤 식으로든 시크릿 문제에 닿아 있다. 내 워크플로우 전체에 걸쳐 반복되는 몇 가지 원칙:

**시크릿이 꼭 단순한 문자열일 필요는 없다.** `email-autoreply`에서 `ACCOUNTS_JSON`은 멀티계정 설정의 축소된 JSON 전체를 담고 있다 -- 단순한 API 키가 아니라 완전한 데이터 구조를 런타임에 파일로 그대로 주입한다:

```yaml
env:
  ACCOUNTS_JSON: ${{ secrets.ACCOUNTS_JSON }}
run: printf "%s" "$ACCOUNTS_JSON" > data/accounts.json
```

설정 파일을 커밋할 필요가 없고(암호화된 것도), 레포 설정에서 한 번 클릭으로 코드 수정 없이 업데이트 가능하다.

**`GITHUB_TOKEN`은 정확한 제한이 있고, 그건 의도된 거다.** GitHub가 각 실행에 주입하는 자동 토큰은 강력하지만 특정 지점에서 봉인되어 있다: 기본적으로 다른 워크플로우를 트리거할 수 없고, 레포 설정에 따라 브랜치 보호 규칙에 막힐 수 있다. 바로 그래서 `create-pull-request.yml`이 별도 PAT(`AUTO_PR_TOKEN`)을 요구하는 거다 -- 진짜 계정(또는 GitHub App)의 토큰, 명시적 `contents:write` + `pull-requests:write` 권한, 잡의 임시 토큰과 분리된.

**권한은 전역이 아니라 잡별로 스코핑된다.** 여기 나열한 모든 워크플로우는 최소한의 주석 달린 `permissions:` 블록을 선언한다:

```yaml
permissions:
  contents: read
  actions: read
  checks: write
```

기본 `GITHUB_TOKEN`은 역사적으로 공개 레포에 꽤 넓은 권한을 가진다; 잡이 실제로 필요로 하는 것만으로 명시적으로 제한하면 체인 속 서드파티 액션이 손상되었을 때 피해를 줄일 수 있다.

**최고의 시크릿은 존재하지 않는 시크릿이다.** `typescript-virtual-container`의 OIDC 패턴은 이 아이디어의 가장 완성된 버전이다: `NPM_TOKEN`의 교체, 만료, 유출 위험을 관리하는 대신, 워크플로우가 암호학적으로 자신의 신원(이 정확한 레포, 이 정확한 워크플로우)을 서드파티 서비스에 직접 증명한다. AWS, Docker Hub, PyPI에도 동일한 로직 사용 가능 -- 점점 더 많은 레지스트리와 클라우드가 GitHub Actions의 OIDC를 지원하고 있다.

---

**핵심 3가지**

1. git 태그(고아, force-push)는 미니멀리스트 데이터베이스나 미리 컴파일된 빌드 캐시 역할을 할 수 있다 -- 같은 메커니즘의 두 가지 용도.
2. 무료 GitHub Actions 러너는 `inotifywait`로 자동 저장하고 단일 수정 커밋으로 git 브랜치에 파일시스템을 지속 동기화하면 영속 SSH 셸이 될 수 있다.
3. 기본 `GITHUB_TOKEN`은 의도적으로 제한되어 있다 -- 브랜치 간 PR을 만들거나 시크릿 없이 배포하려면 전용 PAT나 OIDC trusted publishing으로 전환이 필요하다.
