---
title: "Repo to VPS: GitHub Actions를 무료 영구 VPS로 바꾸는 방법"
description: GitHub Actions 러너를 git을 영구 저장소로 사용하여 항상 커져 있는 VPS로 바꾸는 방법 -- tmate, inotify, commit --amend.
date: 2026-05-29
tags:
  - github
  - devops
  - vps
  - actions
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "BAjk0J6vx53MQxCtXuDzrByhDWDmAVoFiWkCgKx4Z6i+WYhFsoEUQNj67/F/fBimleSFVx4k28vN3sONapVPlg=="
---

## GitHub가 6시간 동안 공짜 VPS를 준다. 영구적으로 만드는 법을 찾았음.

GitHub Actions가 공짜 Linux 머신을 줘.

그니까, 진짜 Ubuntu 서버임. 2코어, 7GB RAM, 14GB 디스크. 공짜. 실행당 6시간.

유일한 "문제"는: 실행이 끝나면 모든 게 지워진다는 거야. 머신은 일회용이야. 뭐 설치하고, 코딩하고, 설정하고, 그리고 푸, 끝나면 다 사라져. 아무것도 한 게 없는 것처럼.

근데 말이지.

근데 **git을 하드디스크처럼 쓰면** 말이지.

그러면 갑자기, 실행이 끝나도 살아있는 영구 디스크를 가진 공짜 VPS가 생기는 거야. 다시 접속해도 모든 게 그대로 있어. 중단했던 곳부터 다시 시작하면 돼.

완전 개쩔어. 설명해줄게 xD

---

## 배경: GitHub Actions 러너

GitHub Actions 워크플로우를 실행하면, GitHub가 VM을 하나 줘.

원래는 코드 빌드하고, 테스트 돌리고, 배포하라고 있는 거야. 워크플로우가 돌고, 일 끝나면 머신은 파괴됨.

근데 아무도 못하게 하는 건 없어. 이 VM으로 **다른 걸** 하는 걸. 예를 들어, SSH 셸을 열어서 서버처럼 쓰는 거.

요점은, 이 머신들은 **stateless**이고 **임시**라는 거야:
- 임시: 실행당 최대 6시간 (`timeout-minutes: 360`, GitHub 상한선)
- Stateless: 끝나면 다 지워짐

그래서 이걸 쓸만한 VPS로 만들려면 두 가지 문제를 해결해야 해:
1. **실시간으로 어떻게 접속할까?**
2. **실행 사이에 디스크를 어떻게 유지할까?**

여기서부터 레전드 핵짓이 시작됨.

---

## 문제 1: tmate로 실시간 SSH

**tmate**는 tmux의 포크인데, 공유 가능한 SSH 세션을 만들어줘.

머신에서 실행시키면 두 개의 링크가 생성돼:
- SSH URL (`ssh xxx@nyc1.tmate.io`)
- 웹 URL (브라우저에서 터미널)

이 링크 중 하나로 접속하면, 바로 머신의 셸에 들어가지는 거야. 실시간으로.

워크플로우가 tmate를 실행시키는 법:

```bash
tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
tmate -S /tmp/tmate.sock set-option -g remain-on-exit on

tmate_ssh=$(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}')
tmate_web=$(tmate -S /tmp/tmate.sock display -p '#{tmate_web}')
```

그리고 이 링크들은 Python 스크립트로 repo의 README에 바로 써져. repo 열면 접속 링크가 보이고, 클릭하면 돼. 바로 VPS에 접속 완료.

첫 번째 문제 해결. 근데 두 번째가 진짜 미친 거임.

---

## 문제 2: git을 하드디스크처럼

여기서부터 개쩌는 거임.

머신은 실행될 때마다 지워져. 그래서 **파일시스템을 `filesystem`이라는 전용 git 브랜치에 저장**하는 거야.

시작할 때, 스크립트가 이 브랜치에서 상태를 복원해:

```bash
filesystem_branch="filesystem"

git fetch origin "$filesystem_branch":refs/remotes/origin/$filesystem_branch

git checkout -B filesystem-workspace "refs/remotes/origin/$filesystem_branch"
git reset --hard "refs/remotes/origin/$filesystem_branch"
```

`filesystem` 브랜치가 니 하드디스크야. 파일, 설치한 거, 설정 -- 전부 다 여기 있어.

이해됨? 머신은 일회용이지만, 디스크는 git 안에 사는 거야. 워크플로우 다시 실행하면 디스크가 복원되고, 중단했던 데서 바로 계속할 수 있어.

최대절전모드 되는 VPS 같은 거야. 근데 최대절전모드가 git repo라는 게 다름 xD

### 첫 실행: 빈 디스크 만들기

처음 실행할 땐 `filesystem` 브랜치가 아직 없어. 만들어야 하는데, 이게 만만치 않음:

```bash
ensure_filesystem_branch() {
  if ! git ls-remote --exit-code origin "refs/heads/$filesystem_branch" >/dev/null 2>&1; then
    git checkout --orphan filesystem-workspace
    git rm -rf --cached .
    git clean -fdx -e .git -e .github -e .github/scripts -e .github/workflows
    git commit --allow-empty -m "init filesystem (empty)"
    push_filesystem
  fi
}
```

`git checkout --orphan`이 핵심이야. Orphan 브랜치는 **역사가 하나도 없는** 브랜치야 -- 빈 repo에서 다시 시작하는 것과 같아.

왜 orphan이냐고? 니 영구 디스크에 소스 코드 전체 역사를 끌고 오고 싶지 않으니까. 디스크는 별개의 것이고, 자기만의 삶이 있어. 깨끗하게 시작하는 거야.

앞의 `git ls-remote --exit-code`는 그냥 깔끔한 체크야: "이 브랜치가 remote에 이미 있나?" 있으면 건드리지 않음. 없으면 만듦. 멱등성.

### 선택적 git clean: 캐시 보호하기

이 줄은 좀 자세히 볼 가치가 있어:

```bash
git clean -fdx -e .apt-cache -e .cache -e host.conf -e tmate.sock
```

`git clean -fdx`는 git이 추적 안 하는 건 **다** 지워버려. 보통은 존나粗暴한 거야 -- workspace를 싹 밀어버림.

근데 `-e` (exclude)로 몇 가지는 보호해:
- `.apt-cache` → APT 패키지 캐시 (뒤에 다시 나옴, 똑똑한 거임)
- `.cache` → 일반 캐시
- `host.conf` → 세션의 SSH 주소
- `tmate.sock` → 현재 tmate 세션 소켓

이 파일들을 지우면, 활성 세션을 망가뜨리거나 캐시를 잃게 돼. 그래서 리셋할 때 얘네는 살려두는 거야.

언뜻 보면 모르는 디테일이지만, "그냥 되는" 거랑 "진짜 되는" 거를 가르는 차이임.

---

## 오토세이브: 모든 걸 감시하는 inotify

자, 그럼 파일들이 어떻게 `filesystem` 브랜치에 들어가는 걸까?

답변: 모든 파일 변경을 감시하고 자동으로 commit/push 하는 watcher.

마법의 도구는 **inotifywait** (`inotify-tools` 패키지). 커널 수준에서 파일시스템을 감시하고, 파일이 변경되면 바로 트리거됨.

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock|\.gitignore|\.txt\.swp)(/|$)' .; do
    echo "[autosave] change detected"
    commit_and_push
    sleep 1
  done
}

autosave &
```

inotify 플래그를 하나씩 뜯어보자, 왜냐면 각각 의미가 있으니까:
- `-r` → 재귀적, 모든 하위 폴더 감시
- `-e modify,create,delete,move` → 이 4가지 이벤트 유형에 반응 (수정, 생성, 삭제, 이동)
- `--exclude '...'` → 특정 파일을 무시하는 정규식

`--exclude`가 중요해. 뭘 무시하는지 보자:
- `.git` → 당연히, 아니면 commit할 때마다 autosave가 트리거되고, 그게 또 commit을 트리거하고... 무한 루프. 재앙.
- `.apt-cache`랑 `.cache` → 캐시, 계속 변하고 git에 spam하고 싶지 않은 것들
- `host.conf`랑 `tmate.sock` → 세션 파일, 계속 바뀜
- `.gitignore`, `.txt.swp` → 임시 파일 (`.swp`는 vim 편집 파일)

이 exclude가 없으면, autosave가 자기 변경사항에 계속 트리거되는 지옥이 펼쳐져. 목록에 있는 `.git`이 바로 니 발에 총 쏘는 걸 막아주는 줄임.

파일 하나 수정하면? inotify가 즉시 감지하고, commit하고, push함. 1초도 안 돼서 변경사항이 `filesystem` 브랜치에 들어가.

뭐 설치하고, 코드 쓰고, 설정 건드리면 -- 모든 게 실시간으로 자동 저장돼. 니가 아무것도 안 해도.

말 그대로 디스크 전체의 자동 백업 시스템이 있는 거야. 개쩔지.

### 디바운스: git 스팸 방지

매 save 후 `sleep 1`은 **디바운스**야.

에디터에서 파일을 저장하면, 보통 파일시스템 이벤트가 여러 개 연속으로 발생해 (임시 파일 생성, 이름 변경, 예전 거 삭제...). 디바운스 없으면 저장 한 번에 3-4개의 commit이 생겨.

`sleep 1`은 "save 후 1초 기다려, 연속 이벤트가 진정될 때까지, 그 다음에 다시 감시해"라는 뜻이야. 가까운 시간의 변경사항을 하나의 commit으로 묶는 거지. 똑똑해.

### 주기적 저장도 추가로

inotify가 놓칠 경우를 대비해서, 5초마다 저장하는 것도 있어:

```bash
periodic_save() {
  while true; do
    sync_from_remote
    sleep 5
    commit_and_push
  done
}

periodic_save &
```

안전벨트에 멜빵까지. 디스크 상태는 절대 잃고 싶지 않으니까.

---

## 똑똑한 디테일: 단일 commit

파일이 바뀔 때마다 commit하면 수천 개의 commit이 쌓일 거야. 한 시간 세션만 해도 git 역사가 폭발해. repo가 엄청나게 커짐. 개더러움.

해결책은 우아해: **새 commit을 만드는 대신 기존 commit을 수정(amend)하는 거야.**

```bash
commit_and_push() {
  (
    flock -n 200 || return

    git add -A
    git reset -- .github/workflows/ .github/scripts/

    if ! git diff --cached --quiet; then
      if git rev-parse --verify HEAD >/dev/null 2>&1; then
        git commit --amend --no-edit
      else
        git commit -m "autosave $(date -u +%Y%m%dT%H%M%SZ)"
      fi
      git push --force origin "filesystem-workspace:filesystem"
    fi
  ) 200>/tmp/tmate_autosave.lock
}
```

`git commit --amend`는 "마지막 commit을 이걸로 대체해"라는 뜻이야.

그래서 `filesystem` 브랜치에는 **항상 commit이 하나만** 있어. 아무리 많이 저장해도. 그냥 현재 상태의 스냅샷을 계속 force-push 하는 거야.

`flock`은 잠금 장치야: 저장 루프가 두 개(inotify + 주기적) 있으니까, 동시에 git을 실행해서 서로 충돌하는 걸 방지하는 거야. 한 번에 하나의 git 프로세스만.

깔끔해.

---

## sync_from_remote: 여러 세션 처리하기

자, 처음에 생각 못 하는 거: 두 개의 실행을 동시에 하면? 또는 한 세션이 `filesystem` 브랜치를 수정하는 동안 다른 세션이 돌아가면?

스크립트는 commit 전에 `sync_from_remote`로 이걸 처리해:

```bash
sync_from_remote() {
  git fetch origin "filesystem":refs/remotes/origin/filesystem
  git merge --ff-only "refs/remotes/origin/filesystem"
}
```

`--ff-only` (fast-forward only)가 중요해: "merge commit을 만들지 않고 깔끔하게 진행할 수 있을 때만 MERGE 한다"는 뜻이지.

두 브랜치가 갈라졌으면 (예: 두 세션이 다른 걸 수정함), fast-forward는 조용히 실패하고(`2>/dev/null || true`) 로컬 상태를 유지해. 완벽한 merge 시스템은 아니지만, 세션이 하나만 돌아가는 간단한 경우에는 손상을 방지해줘.

솔직히, 같은 repo에서 3개 세션을 동시에 돌리면 안 됨. 그래도 코드는 그래도 폭발하지 않으려고 시도는 해. 방어적인 거지.

---

## APT 캐시: 빠르게 설치하기

워크플로우에 눈에 띄지 않지만 잘 설계된 디테일이 하나 있어:

```yaml
- name: Cache & install APT packages (tmate + watcher)
  uses: awalsh128/cache-apt-pkgs-action@v1.6.0
  with:
    packages: tmate inotify-tools
```

tmate랑 inotify-tools는 **APT 패키지를 캐싱**하는 액션으로 설치돼.

처음 실행 시 다운로드해서 설치함. 이후 실행에서는 GitHub Actions 캐시에서 복원됨 -- 더 빠르고, 다시 다운로드할 필요 없음.

아까 `git clean -fdx -e .apt-cache` 기억나? 연결되는 거야. `.apt-cache` 폴더가 청소에서 보호되는 이유는, 세션 중에 설치한 패키지가 최소한 유지되도록 하기 위해서야.

전부 다 연결되어 있어. 전체 라이프사이클을 생각했어.

---

## /tmp에 숨겨진 스크립트들

또 하나 교활하지만 똑똑한 디테일. 스크립트 맨 처음에:

```bash
RUNNER_SCRIPTS_DIR="/tmp/runner-scripts"
rm -rf "$RUNNER_SCRIPTS_DIR"
mkdir -p "$RUNNER_SCRIPTS_DIR"
cp -r .github/scripts "$RUNNER_SCRIPTS_DIR/"
```

스크립트들(`update_readme.py` 등)은 `filesystem` 브랜치를 건드리기 **전에** `/tmp`로 복사돼.

왜? `git reset --hard`로 `filesystem` 브랜치로 전환하면 (처음엔 비어있거나 니 디스크가 들어있음), source repo의 `.github/scripts` 파일들이 workspace에서 사라지거든.

근데 세션 중에 스크립트가 여전히 필요해 (tmate가 다시 시작될 때마다 README를 업데이트하려면). 그래서 git의 손이 닿지 않는 `/tmp`에 숨겨두고, 나중에 필요할 때 불러오는 거야:

```bash
python3 "$RUNNER_SCRIPTS_DIR/scripts/update_readme.py" --ssh "$tmate_ssh" ...
```

이걸 생각 안 하면 뒤통수 맞는 버그야: "내 스크립트 왜 사라졌지?". 내가 생각했어.

---

## 맞춤형 셸

마지막으로 작은 편의: 세션이 기본 bash가 아니라 설정된 셸을 제공해.

`prestart.sh`가 커스텀 `.bashrc`를 복사해:

```bash
if ! grep -q "Custom prompt and aliases for remote sessions" "$HOME/.bashrc"; then
  cp .github/scripts/remote_bashrc "$HOME/.bashrc"
fi
sudo cp "$HOME/.bashrc" /root/.bashrc
```

이 `.bashrc`에는 컬러 프롬프트, alias (`ll`, `lla`, `rm -i`), 그리고 특히 똑똑한 게 하나 있어: `exit` 오버라이드:

```bash
exit() {
    killall -9 -u "$(whoami)" tmate 2>/dev/null || true
    builtin exit "$@"
}

bind -x '"\C-d": "exit"'
```

`exit` (또는 Ctrl+D)를 입력하면, 닫기 전에 tmate 프로세스를 깔끔하게 죽여. 머신에 좀비 tmate 세션이 남는 걸 방지하는 거야.

세션을 죽이지 **않고** 연결을 끊고 싶으면 `tmate-detach` 함수도 있어 (나중에 다시 접속하려고). 편의 기능이지만, 얼마나 신경 썼는지 보여줘.

---

## tmate 자동 재시작

작은 편의: 셸에서 `exit`를 치면, 보통 tmate 세션이 죽고 영원히 연결이 끊겨.

근데 여기서는 tmate가 `while true` 루프 안에 있어:

```bash
while true; do
  tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
  while tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}' >/dev/null 2>&1; do
    sleep 2
  done

  echo "tmate session ended; restarting..."
done
```

`exit`을 쳐? 세션이 자동으로 다시 시작돼. 같은 링크로 다시 접속할 수 있어.

멍청하지만 이걸 쓸만하게 만든다.

---

## 한 줄로 재접속

연결 끊긴 후에 어떻게 다시 접속할까? 매번 실행 로그를 뒤지지 않고?

tmate의 SSH 주소는 `host.conf` 파일에 쓰여 있고, 이 파일 자체가 `filesystem` 브랜치에 commit되어 있어:

```bash
printf '%s' "${tmate_ssh#ssh }" > host.conf
```

이 파일이 git에 있으니까, GitHub API로 한 줄 명령어로 가져올 수 있어:

```bash
ssh "$(gh api -H 'Accept: application/vnd.github.v3.raw' \
  "/repos/USER/REPO/contents/host.conf?ref=filesystem" | tr -d '\r\n')"
```

이걸 실행하면, repo에서 현재 SSH 주소를 가져와서 바로 접속해. 세션 사이에 주소가 바뀌어도 상관없음.

완전 매끄러워.

---

## 전체 플로우

전체 내용을 정리해보자:

```
1. 워크플로우 실행 (push 또는 수동 버튼)
2. GitHub가 Ubuntu VM을 줌
3. 스크립트가 "filesystem" 브랜치에서 디스크를 복원
4. inotify가 모든 파일 변경을 감시 시작
5. periodic_save가 5초마다 백업 커밋
6. tmate 시작 → SSH/웹 링크 생성
7. 링크가 README + host.conf에 기록됨
8. SSH나 웹 터미널로 접속
9. 하고 싶은 거 다 함 (코딩, 설치, 디버그)
   └── 모든 파일 변경 = 즉시 git으로 autosave
10. 6시간 후, GitHub가 VM을 죽임
11. 하지만 디스크는 "filesystem" 브랜치에 그대로 있음
12. 워크플로우 다시 실행 → 3단계로 돌아감, 모든 게 그대로 있음
```

VPS. 공짜. 영구 디스크 있음. git과 GitHub Actions만으로.

---

## 솔직히 말하면: 한계점

이건 핵이야, 진짜 VPS가 아니야. 그러니까:

- **실행당 최대 6시간.** 정기적으로 워크플로우를 다시 실행해야 해. 무한 uptime 없음.
- **프로덕션용 아님.** 여기 사이트 호스팅하지 마. 탐색, 개발, 디버그, 일회용이지만 복구 가능한 Linux에서 뭐 테스트하기 좋아.
- **GitHub가 다 봄.** GitHub의 머신이야. 민감한 거 넣지 마.
- **repo는 private으로 유지해.** SSH 셸을 노출하는 거야. Public repo면 잠재적으로 누구나 접속할 수 있어. 나쁜 생각.
- **이용약관에 걸릴 수 있음.** GitHub Actions는 CI/CD용이지, 공짜 VPS용이 아니야. 적당히, 합법적인 용도로, 남용하지 말고 써.

### 진짜 아킬레스건: git은 큰 파일을 싫어함

더 기술적인 한계가 하나 있는데, 이게 가장 이해해야 할 부분이야.

**git은 텍스트용이지, 파일시스템용이 아냐.**

영구 디스크는 git 브랜치 안에 살아. 그래서 저장하는 모든 게 git을 통과해. 그리고 git은:
- 큰 바이너리 파일을 잘 못 다뤄 (2GB Docker 이미지를 git에? 포기해)
- GitHub에서 파일당 100MB 제한이 있어 (하드 한계, 그 이상은 push 안 됨)
- repo당 ~5GB 이하를 권장해

그러니까 `node_modules` 500MB짜리 프로젝트를 `npm install` 하거나, 무거운 바이너리를 뱉는 빌드를 하면, `filesystem`으로의 push가 엄청 느리거나 아예 실패할 거야.

`git commit --amend`가 도움은 돼 (commit 하나, 역사가 불어나지 않음), 하지만 200MB 파일이 통과하지 못하는 건 변함없어.

요약하자면: **코드, 설정, 작은 파일에는 완전 잘 됨. 큰 데이터나 바이너리 아티팩트 저장에는 안 됨.** 세션에서 뭘 할지 이걸 명심해야 해.

### 완전한 시스템 스냅샷이 아님

또 다른 중요한 차이점: `filesystem` 브랜치는 **workspace** (repo 폴더)를 저장하지, 시스템 전체가 아니야.

`apt install htop`을 하면, 바이너리는 `/usr/bin/htop`에 가는데, 이건 workspace **밖**이야. 그래서 저장되지 않아. 다음 실행 때 다시 설치해야 해.

이게 APT 캐시랑 `prestart.sh`가 있는 이유야: 시스템 환경을 매 시작마다 다시 준비하는 거지, workspace만 유지되니까.

설치한 게 유지되게 하려면 workspace 안에 설치해야 해 (예: 시스템이 아닌 로컬 폴더에 설치). 이걸 감안한 작업 방식이 필요해.

---

## 공짜 VPS vs 진짜 VPS: 비교

| | repo-to-vps | 진짜 VPS (5€/월) |
|---|---|---|
| **가격** | 0€ | ~5-10€/월 |
| **Uptime** | 6시간, 재시작 필요 | 24/7 |
| **디스크** | git 브랜치, 작은 파일 | 진짜 SSD, 수 GB |
| **RAM** | ~7GB (넉넉해!) | 보통 1-2GB |
| **CPU** | 2-4코어 괜찮음 | 1-2 vCPU |
| **설정** | 템플릿 clone | 수동 설정 |
| **영속성** | workspace만 | 전체 시스템 |
| **합법성** | 이용약관에 걸릴 수 있음 | 100% 깔끔 |

웃긴 건 순수 스펙(RAM, CPU)만 보면 GitHub 러너가 5€ VPS보다 종종 **더 좋아**. 근데 6시간 uptime 제한과 workspace로만 제한된 영속성이 이걸 해커의 장난감으로 만들지, 진짜 서버로 만들지는 않아.

배우고, 테스트하고, 복구 가능한 환경에서 Linux 작업을 빨리 해볼 때? 완벽해. 진지한 걸 호스팅할 때? 진짜 VPS 써.

하지만 원할 때 복원할 수 있는 임시 Linux 환경으로는? 그냥 쩔어.

---

## 이 모든 것의 패턴

한 걸음 물러서서 보면, repo-to-vps와 이메일 봇(내 다른 글)은 같은 아이디어에 기반해:

> **git은 그냥 버전 관리 도구가 아니야. 무료이고, 버전이 있고, API로 접근 가능한 영구 저장소 시스템이야.**

Stateless 시스템(GitHub Actions, Worker, 서버리스 함수)이 있고 실행 사이에 상태를 유지하고 싶다면, git을 "디스크"로 쓸 수 있어.

- 이메일 봇은 `lastId`를 git 태그에 저장해.
- repo-to-vps는 파일시스템 전체를 git 브랜치에 저장해.

같은 패턴, 다른 규모. 한쪽은 값, 다른 쪽은 디스크.

그리고 `git commit --amend` + force-push가 공통 기술이야: **현재 상태를 나타내는 단일 commit을 유지하고, 업데이트할 때마다 덮어써.** 역사가 불어나지 않고, 그냥 살아있는 스냅샷일 뿐.

원래 이렇게 쓰라고 만든 건 아니야. 근데 먹히고, 공짜야. 그리고 그게 아름다운 거지.

---

**기억할 3가지:**

1. **git 브랜치 = 영구 하드디스크** -- 파일시스템을 전용 브랜치에 저장하고, 시작할 때 복원하면 일회용 머신을 넘어서는 상태를 가질 수 있어.

2. **inotify + git = 실시간 autosave** -- `inotifywait`가 커널 수준에서 변경을 감시하고 즉시 git으로 push해. `git commit --amend`로 깔끔한 단일 commit 유지.

3. **tmate가 러너를 VPS로 바꾼다** -- GitHub Actions 머신에서 실시간 SSH, 자동 재시작, GitHub API로 한 줄 재접속.

git을 하드디스크처럼, 두 번째 에피소드. 결국엔 모든 걸 git 브랜치에 저장하게 될지도 xD
