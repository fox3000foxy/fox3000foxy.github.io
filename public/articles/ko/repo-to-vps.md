---
title: "Repo에서 VPS로: GitHub Actions를 영속 저장소가 있는 무료 VPS로 바꾸기"
description: "GitHub Actions 러너를 git을 영속 저장소 삼아 영구 VPS로 바꾸는 방법. tmate와 inotify, commit과 amend."
date: 2026-05-29
tags:
  - github
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "7O4RWx71n/iT3IIVM8xpWN1vf6/y84xr0kOdDlsXR+1ckPko/5tnjmR91vr6rlUvyyWTIAAgGiyNt1+wLOseyA=="
---

## GitHub가 6시간짜리 무료 VPS를 줘요. 영구로 만드는 법을 찾았어요.

GitHub Actions가 무료 Linux 기기를 줘요.

말 그대로 진짜 Ubuntu 서버예요. 코어 2개, RAM 7GB, 디스크 14GB. 무료. 실행당 6시간.

유일한 "문제"는 실행이 끝나면 전부 지워져요. 기기가 일회용이에요. 패키지를 설치하고, 코딩하고, 설정하고... 팡 하고 끝나면 전부 사라져요. 아무것도 안 한 것처럼요.

만약에요.

**git을 하드디스크로 쓰면요.**

그러면 갑자기 실행을 살아남는 영속 디스크가 있는 무료 VPS가 생겨요. 다시 접속해도 전부 그대로 있어요. 멈췄던 곳에서 이어가요.

완전히 맛이 갔어요. 설명해 드릴게요.

---

## 배경: GitHub Actions 러너

GitHub Actions 워크플로를 실행하면 GitHub가 VM 하나를 줘요.

코드를 빌드하고 테스트를 돌리고 배포하라고 있는 거예요. 워크플로가 돌고 일을 하고 기기가 없어져요.

하지만 이 VM으로 다른 일을 하지 못할 이유는 없어요. 예를 들어 SSH 셸을 열고 서버처럼 쓰는 것.

제약은 이 기기들이 **무상태**에 **임시**라는 거예요.

- 임시: 실행당 최대 6시간 (`timeout-minutes: 360`, GitHub 상한)
- 무상태: 끝나면 전부 지워져요

그래서 쓸 만한 VPS로 만들려면 두 문제를 풀어야 해요.

1. **실시간으로 그 위에 어떻게 접속하지요?**
2. **두 실행 사이에 디스크를 어떻게 유지하지요?**

여기에서 지저분한 핵이 돼요.

---

## 문제 1: tmate로 라이브 SSH

**tmate**는 공유 가능한 SSH 세션을 만드는 tmux 포크예요.

기기에서 실행하면 링크 둘을 만들어줘요.

- SSH URL (`ssh xxx@nyc1.tmate.io`)
- 웹 URL (브라우저 속 터미널)

이 링크 중 하나로 접속하면 쾅, 실시간으로 기기 속 셸에 있어요.

그래서 워크플로가 tmate를 실행해요.

```bash
tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
tmate -S /tmp/tmate.sock set-option -g remain-on-exit on

# 연결 링크 가져오기
tmate_ssh=$(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}')
tmate_web=$(tmate -S /tmp/tmate.sock display -p '#{tmate_web}')
```

그리고 이 링크들은 Python 스크립트로 저장소 README에 바로 쓰여요. 저장소를 열고 연결 링크를 보고 눌러요. VPS 안에 있어요.

첫 문제 해결. 하지만 진짜 미친 것은 두 번째예요.

---

## 문제 2: 하드디스크로서의 git

모든 것을 바꾸는 생각은 바로 여기예요.

기기는 매 실행마다 지워져요. 그래서 **파일시스템을 `filesystem`이라는 전용 git 브랜치에 저장**해요.

시작할 때 스크립트가 이 브랜치에서 상태를 복원해요.

```bash
filesystem_branch="filesystem"

# remote에서 filesystem 브랜치 가져오기
git fetch origin "$filesystem_branch":refs/remotes/origin/$filesystem_branch

# 이 브랜치에서 워크스페이스 복원
git checkout -B filesystem-workspace "refs/remotes/origin/$filesystem_branch"
git reset --hard "refs/remotes/origin/$filesystem_branch"
```

`filesystem` 브랜치가 곧 여러분 하드디스크예요. 파일과 설치, 설정. 전부 안에 있어요.

감이 오시죠? 기기는 일회용이지만 디스크는 git에 살아요. 워크플로를 다시 실행하면 디스크가 복원되고, 멈췄던 곳에서 이어가요.

최대 절전하는 VPS 같아요. 다만 최대 절전이 git 저장소예요.

### 첫 실행: 빈 디스크 만들기

맨 처음 실행에는 `filesystem` 브랜치가 아직 없어요. 만들어야 해요. 사소하지 않아요.

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

`git checkout --orphan`이 핵심이에요. 고아 브랜치는 **히스토리가 전혀 없는** 브랜치예요. 빈 저장소에서 다시 시작하는 것과 같아요.

왜 고아냐고요? 영속 디스크가 소스 코드 히스토리를 통째로 끌고 다니길 원하지 않으니까요. 디스크는 고립된 채 자기 삶을 살아요. 빈 채로 시작해요.

그리고 처음의 `git ls-remote --exit-code`는 그저 깔끔한 검사예요. "remote에 브랜치가 이미 있나요?" 있으면 건드리지 않아요. 없으면 만들어요. 멱등, 좋아하는 대로요.

### 선택적 git clean: 캐시 지키기

이 줄은 멈춰서 볼 만해요.

```bash
git clean -fdx -e .apt-cache -e .cache -e host.conf -e tmate.sock
```

`git clean -fdx`는 git이 추적하지 않는 모든 것을 날려요. 보통은 거칠어요. 워크스페이스를 말끔히 청소해요.

하지만 `-e` (제외)가 특정 파일들을 지켜줘요.

- `.apt-cache` → APT 패키지 캐시 (뒤에 나와요. 영리해요)
- `.cache` → 범용 캐시
- `host.conf` → 세션 SSH 주소
- `tmate.sock` → 진행 중인 tmate 세션 소켓

이 파일들을 청소하면 활성 세션이 깨지거나 캐시를 잃어요. 그래서 리셋 동안 살려둬요.

언뜻 바보 같은 세부 사항이지만, 없으면 전부 터져요.

---

## 자동 저장: 모든 것을 감시하는 inotify

좋아요, 그런데 파일들이 `filesystem` 브랜치에 어떻게 들어가나요?

답: 모든 파일 변경을 감시해서 자동으로 커밋하고 푸시하는 와처.

마법 도구는 **inotifywait**(`inotify-tools` 패키지). 커널 수준에서 파일시스템을 감시하고 파일이 바뀌면 바로 일으켜요.

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock|\.gitignore|\.txt\.swp)(/|$)' .; do
    echo "[autosave] change detected"
    commit_and_push
    sleep 1   # 한 번에 많은 변경이면 디바운스
  done
}

autosave &
```

inotify 플래그를 뜯어봐요. 각자 중요해서요.

- `-r` → 재귀, 모든 하위 폴더 감시
- `-e modify,create,delete,move` → 이 4가지 이벤트 종류에 반응
- `--exclude '...'` → 특정 파일을 무시하는 정규식

`--exclude`가 중요해요. 무시하는 것을 보세요.

- `.git` → 당연하죠. 아니면 매 커밋이 자동 저장을 일으키고 자동 저장이 커밋을 일으켜요... 무한 루프. 재앙.
- `.apt-cache`와 `.cache` → 캐시. 계속 바뀌고 git에 스팸하고 싶지 않아요
- `host.conf`와 `tmate.sock` → 계속 움직이는 세션 파일
- `.gitignore`, `.txt.swp` → 임시 파일 (`.swp`는 vim 편집 파일)

이 제외가 없으면 자기 변경에 루프로 일으키는 자동 저장이 돼요. 목록의 `.git`이 바로 자기 발에 총 쏘는 것을 막는 줄이에요.

파일을 고치면요? inotify가 바로 감지하고, 커밋하고, 푸시해요. 1초 미만으로 변경이 `filesystem` 브랜치에 들어가요.

패키지를 설치하고, 코드를 쓰고, 설정을 만져요. 전부 실시간 자동 저장. 손댈 것 없이요.

말 그대로 디스크 전체 자동 저장 시스템이 있어요. 맛이 갔어요.

### 디바운스: git 스팸 금지

매 저장 뒤 `sleep 1`은 **디바운스**예요.

에디터에서 파일을 저장하면 흔히 파일시스템 이벤트 여러 개가 한꺼번에 일어나요 (임시 파일 만들기, 이름 바꾸기, 옛것 지우기...). 디바운스가 없으면 저장 한 번에 커밋 3~4개가 일어나요.

`sleep 1`이 말해요. "저장 뒤 1초 기다려. 한꺼번이가 가라앉을 시간을 줘. 다시 듣기 전에." 가까운 변경들을 커밋 하나로 묶어요. 영리해요.

### 덤으로 주기 저장

inotify가 이벤트를 놓칠 경우를 대비해 5초마다 저장도 있어요.

```bash
periodic_save() {
  while true; do
    sync_from_remote   # 혹시 모를 원격 변경 가져오기
    sleep 5
    commit_and_push
  done
}

periodic_save &
```

안전벨트와 멜빵. 디스크 상태를 절대 잃고 싶지 않아요.

---

## 영리한 세부 사항: 커밋 하나

파일이 바뀔 때마다 커밋하면 수천 개 커밋이 쌓여요. 세션 한 시간에 git 히스토리가 폭발해요. 저장소가 거대해져요. 지저분해요.

해결은 우아해요. 새로 만들지 않고 기존 커밋을 **수정**해요.

```bash
commit_and_push() {
  (
    flock -n 200 || return   # 두 저장이 동시에 돌지 않게 잠금

    git add -A
    git reset -- .github/workflows/ .github/scripts/   # 스크립트는 건드리지 않아요

    if ! git diff --cached --quiet; then
      if git rev-parse --verify HEAD >/dev/null 2>&1; then
        git commit --amend --no-edit    # 수정: 앞선 커밋을 바꿔요
      else
        git commit -m "autosave $(date -u +%Y%m%dT%H%M%SZ)"
      fi
      git push --force origin "filesystem-workspace:filesystem"
    fi
  ) 200>/tmp/tmate_autosave.lock
}
```

`git commit --amend` 뜻은 "마지막 커밋을 이것으로 바꿔"예요.

그래서 `filesystem` 브랜치는 항상 커밋 하나예요. 저장을 몇 번 하든요. 현재 상태 스냅샷 하나를 계속 강제 푸시할 뿐이에요.

`flock`은 자물쇠예요. 저장 루프가 둘(inotify + 주기)이라 git이 동시에 실행되어 서로 밟지 않게 해요. 한 번에 git 프로세스 하나.

깔끔해요.

---

## sync_from_remote: 여러 세션 다루기

처음에는 생각하지 않는 경우예요. 동시에 실행 둘을 띄우면요? 한 세션이 다른 세션이 도는 동안 `filesystem` 브랜치를 고치면요?

스크립트는 매 커밋 전 `sync_from_remote`로 이를 다뤄요.

```bash
sync_from_remote() {
  git fetch origin "filesystem":refs/remotes/origin/filesystem
  git merge --ff-only "refs/remotes/origin/filesystem"
}
```

`--ff-only`(fast-forward만)가 중요해요. "깔끔히 앞으로만 갈 수 있을 때 합쳐"라는 뜻이에요. 합치기 커밋을 만들지 않아요.

두 브랜치가 갈라졌으면 (예를 들어 두 세션이 서로 다른 파일을 고쳤으면) fast-forward가 조용히 실패하고(`2>/dev/null || true`) 로컬 상태를 유지해요. 완벽한 합치기 시스템은 아니지만, 세션 하나가 도는 단순한 경우에 깨지지 않게 해요.

솔직히 같은 저장소에 병렬 세션 셋을 띄우면 안 돼요. 그래도 혹시 일어나면 터지지 않으려고 코드가 애써요. 방어예요.

---

## APT 캐시: 빨리 설치하기

워크플로에 겉보기에는 별것 아닌데 잘 생각된 세부 사항이 있어요.

```yaml
- name: Cache & install APT packages (tmate + watcher)
  uses: awalsh128/cache-apt-pkgs-action@v1.6.0
  with:
    packages: tmate inotify-tools
```

tmate와 inotify-tools는 **APT 패키지를 캐시**하는 액션으로 설치돼요.

첫 실행에 내려받고 설치해요. 이어지는 실행에는 GitHub Actions 캐시에서 복원돼요. 더 빠르고 다시 내려받지 않아요.

아까의 `git clean -fdx -e .apt-cache` 기억나시죠? 연결돼 있어요. 세션 동안 설치하는 패키지가 최소한 유지되도록 `.apt-cache` 폴더를 청소로부터 지켜요.

전부 맞물려요. 전체 생애주기를 생각했어요.

---

## /tmp에 숨은 스크립트들

또 교활하지만 영리한 세부 사항. 스크립트 맨 처음에요.

```bash
RUNNER_SCRIPTS_DIR="/tmp/runner-scripts"
rm -rf "$RUNNER_SCRIPTS_DIR"
mkdir -p "$RUNNER_SCRIPTS_DIR"
cp -r .github/scripts "$RUNNER_SCRIPTS_DIR/"
```

스크립트(`update_readme.py` 등)는 `filesystem` 브랜치를 만지기 전에 `/tmp`에 복사돼요.

왜요? `filesystem` 브랜치로 `git reset --hard`를 하면 (처음에는 비었거나 여러분 디스크가 들어 있어요) 소스 저장소의 `.github/scripts` 파일들이 워크스페이스에서 사라지니까요.

하지만 스크립트는 세션 동안 여전히 필요해요 (tmate가 다시 실행될 때마다 README를 고치려고). 그래서 git 손이 닿지 않는 `/tmp`에 숨겨요.

```bash
python3 "$RUNNER_SCRIPTS_DIR/scripts/update_readme.py" --ssh "$tmate_ssh" ...
```

생각하지 않으면 스크립트가 왜 사라졌는지 30분 헤매요. 생각했어요.

---

## 맞춤 셸

작은 편안함: 세션에 그냥 bash가 아니라 설정된 셸을 줘요.

`prestart.sh`가 맞춤 `.bashrc`를 복사해요.

```bash
if ! grep -q "Custom prompt and aliases for remote sessions" "$HOME/.bashrc"; then
  cp .github/scripts/remote_bashrc "$HOME/.bashrc"
fi
sudo cp "$HOME/.bashrc" /root/.bashrc
```

그리고 이 `.bashrc`에는 색 프롬프트와 별칭(`ll`, `lla`, `rm -i`), 무엇보다 `exit` 재정의가 들어 있어요.

```bash
exit() {
    killall -9 -u "$(whoami)" tmate 2>/dev/null || true
    builtin exit "$@"
}

# Ctrl+D는 exit과 같아요
bind -x '"\C-d": "exit"'
```

`exit`(또는 Ctrl+D)를 치면 닫기 전에 tmate 프로세스를 깔끔히 죽여요. 좀비 tmate 세션을 남기지 않게요.

나중에 다시 접속하려고 세션을 죽이지 않고 나가고 싶으면 `tmate-detach` 함수도 있어요. 편안함 세부 사항이지만, 손길 수준을 보여줘요.

---

## 혼자 다시 실행되는 tmate

작은 편안함: 셸에서 `exit`를 치면 보통 tmate 세션이 죽고 영원히 접속이 끊겨요.

하지만 여기서는 tmate가 `while true` 루프 안에 있어요.

```bash
while true; do
  tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
  while tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}' >/dev/null 2>&1; do
    sleep 2
  done
  echo "tmate session ended; restarting..."
done
```

`exit`를 쳐요? 세션이 혼자 다시 시작돼요. 같은 링크로 다시 접속해요.

바보 같지만, 세션을 쓸 만하게 해요.

---

## 명령 하나로 다시 접속하기

끊긴 뒤에 매번 실행 로그를 뒤지지 않고 어떻게 다시 접속하나요?

tmate SSH 주소는 `filesystem` 브랜치에 커밋된 `host.conf` 파일에 쓰여요.

```bash
printf '%s' "${tmate_ssh#ssh }" > host.conf
```

그리고 이 파일이 git에 있으니 GitHub API로 명령 하나로 가져올 수 있어요.

```bash
ssh "$(gh api -H 'Accept: application/vnd.github.v3.raw' \
  "/repos/USER/REPO/contents/host.conf?ref=filesystem" | tr -d '\r\n')"
```

이것을 실행하면 저장소에서 현재 SSH 주소를 가져와서 접속해요. 두 세션 사이에 주소가 바뀌어도요.

---

## 전체 흐름

정리해요.

1. 워크플로를 일으켜요 (푸시 또는 손 버튼)
2. GitHub가 Ubuntu VM 하나를 줘요
3. 스크립트가 "filesystem" 브랜치에서 디스크를 복원해요
4. inotify가 모든 변경 감시를 시작해요
5. periodic_save가 백업으로 5초마다 커밋해요
6. tmate가 시작돼 SSH와 웹 링크를 만들어요
7. 링크가 README + host.conf에 쓰여요
8. ssh나 웹 터미널로 접속해요
9. 원하는 것을 해요. 파일 변경마다 자동 저장
10. 6시간 뒤 GitHub가 VM을 죽여요
11. 디스크는 "filesystem" 브랜치에 온전해요
12. 워크플로를 다시 실행해요 → 3단계로 돌아가고 전부 그대로 있어요

git와 GitHub Actions만으로 영속 디스크가 있는 무료 VPS.

---

## 좋아요, 솔직해져요. 한계

핵이지 진짜 VPS가 아니에요. 그래서요.

- **실행당 최대 6시간.** 워크플로를 자주 다시 실행해야 해요. 매 실행마다 가동 시간이 제한돼요.
- **개발과 탐험용.** 사이트를 그 위에 호스팅하지 않아요. 일회용이지만 되살릴 수 있는 Linux 환경에서 탐험하고 개발하고 디버깅하려고요.
- **GitHub가 전부 봐요.** 자기들 기기예요. 민감한 것 두지 마세요.
- **저장소는 비공개로 두세요.** SSH 셸을 노출해요. 공개 저장소 = 누구나 접속할 가능성. 나쁜 생각.
- **이용 조건 경계에 있어요.** GitHub Actions는 CI와 CD용이지 무료 VPS용이 아니에요. 정당하게, 남용 없이, 아껴 쓰세요.

### 진짜 아킬레스건: git은 큰 파일을 싫어해요

Git은 텍스트용이지 파일시스템용이 아니에요.

영속 디스크는 git 브랜치에 살아요. 그래서 저장하는 모든 것이 git을 거쳐요. 그리고 git은요.

- 큰 바이너리 파일을 못 다뤄요 (2GB Docker 이미지를 git에요? 잊어요)
- GitHub 파일당 100MB 한도 (하드 한도, 그 위는 푸시가 안 돼요)
- 저장소당 ~5GB 이하 권장

그래서 500MB `node_modules` 프로젝트를 `npm install`하거나 무거운 바이너리를 만드는 프로젝트를 빌드하면 `filesystem` 푸시가 죽도록 느려지거나 아예 실패해요.

`git commit --amend`가 도와줘요 (커밋 하나, 부푸는 히스토리 없어요). 하지만 200MB 파일이 절대 통과하지 못하는 것은 바뀌지 않아요.

대충요. **코드와 설정, 작은 파일에는 최고예요. 큰 자료나 바이너리 산출물 저장에는 안 돼요.** 세션에서 하는 일에 이 점을 염두에 둬야 해요.

### 완전한 시스템 스냅샷이 아니에요

또 다른 중요한 뉘앙스: `filesystem` 브랜치는 **워크스페이스**(저장소 폴더)를 저장하지 전체 시스템을 저장하지 않아요.

`apt install htop`을 하면 바이너리가 워크스페이스 밖 `/usr/bin/htop`에 가요. 그래서 저장되지 않아요. 다음 실행에 다시 설치해야 해요.

그래서 APT 캐시와 `prestart.sh`가 있어요. 워크스페이스만 유지되니 매 시작 때 시스템 환경을 다시 준비하려고요.

설치를 살리고 싶으면 워크스페이스에 넣어야 해요 (예를 들어 시스템이 아니라 로컬 폴더에 설치). 익혀야 하는 체조예요.

---

## 무료 VPS 대 진짜 VPS: 대결

| | repo-to-vps | 진짜 VPS (월 5유로) |
|---|---|---|
| **가격** | 0유로 | ~월 5-10유로 |
| **가동 시간** | 6시간, 다시 실행 | 24시간 |
| **디스크** | git 브랜치, 작은 파일 | 진짜 SSD, 수 GB |
| **RAM** | ~7 GB (후해요!) | 흔히 1-2 GB |
| **CPU** | 괜찮은 코어 2-4개 | vCPU 1-2개 |
| **설정** | 템플릿 복제 | 손 설정 |
| **영속** | 워크스페이스만 | 전체 시스템 |
| **정당성** | 이용 조건 경계 | 100퍼센트 깨끗 |

흥미로운 지점은 날것 스펙(RAM, CPU)으로는 GitHub 러너가 흔히 5유로 VPS보다 낫다는 거예요. 하지만 6시간 가동 시간과 워크스페이스 한정 영속이 해커 장난감으로 만드는 것이지 진짜 서버가 아니에요.

배우고 테스트하고 일회용이지만 되살릴 수 있는 Linux 환경에서 빨리 시스템 하나 디버깅하려고요? 완벽. 진지한 무엇을 호스팅하려고요? 진짜 VPS를 사세요.

하지만 마음대로 복원할 수 있는 임시 Linux 환경으로는요? 그냥 genial해요.

---

## 그 뒤 패턴

뒤로 물러나 보면 repo-to-vps와 이메일 봇(제 다른 글)은 같은 생각에 기대요.

> **Git은 버전 관리자만이 아니에요. 무료이고 버전이 있으며 API로 닿는 영속 저장 시스템이에요.**

무상태 시스템(GitHub Actions, Worker, 서버리스 함수)이 있고 두 실행 사이에 상태를 유지하고 싶어지면 git이 "디스크"가 될 수 있어요.

- 이메일 봇은 git 태그에 `lastId` 하나를 저장해요.
- repo-to-vps는 git 브랜치에 파일시스템 전체를 저장해요.

같은 패턴, 두 규모. 한쪽은 값 하나, 다른 쪽은 디스크 하나.

그리고 `git commit --amend`와 강제 푸시가 공통 기법이에요. **현재 상태를 나타내는 커밋 하나를 유지하고 매 고치기마다 덮어써요.**

그렇게 쓰라고 만든 것이 아니에요. 하지만 동작해요. 그리고 무료예요.

---

**기억할 3가지:**

1. **git 브랜치 하나 = 영속 하드디스크 하나**: 파일시스템을 전용 브랜치에 저장하고 시작할 때 복원하면 일회용 기기를 살아남는 상태가 생겨요.

2. **inotify + git = 실시간 자동 저장**: `inotifywait`가 커널 수준에서 변경을 감시해서 git에 바로 푸시해요. 깔끔한 커밋 하나로 유지하는 `git commit --amend`와 함께요.

3. **tmate가 러너를 VPS로 바꿔요**: GitHub Actions 기기의 라이브 SSH. 자동 재시작과 GitHub API 경유 명령 하나 다시 접속.

하드디스크로서의 Git, 두 번째 편. 결국 전부 git 브랜치에 저장하게 될 것 같아요
