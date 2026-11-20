---
title: SSH 서명 스크립트 설명
description: SSH 커밋 서명 헬퍼를 뜯어보고, 멋진 커밋을 원했던 이유.
date: 2026-03-08
aiGenerated: true
tags:
  - git
  - security
  - shell
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "o1zs16ijlmXg8j1hX+CSdnHbAV7KWmSV2CEeU6TQ/SWj4criV1iIpS6MjKri4V565lc8hRUEHJRXkpYkcBR+OA=="
---

# 커밋용 SSH 서명 스크립트 설명

이 글에서는 제가 [Gist](https://gist.github.com/fox3000foxy/95500d129cd4bf5c173c323d2492569a)에 공개한 `setup-ssh-signing.sh` 스크립트를 뜯어봐요. 각 부분이 무슨 일을 하는지, 로컬 저장소 단위의 SSH 서명을 완전히 수월하게 만드는 방법, 그리고 굳이 이걸 만들었던 이유까지 살펴볼 거예요. 스포일러하자면, 제 커밋을 멋지게 보이게 하고 싶었을 뿐이에요.

## 동기

저는 Git 워크플로를 만지작거리는 것을 늘 좋아했고, 커밋 옆에 작은 "Verified" 배지를 단 사람들을 보고 저도 모르게 생각했어요. 나도 해보면 어떨까? 내장된 GPG 서명은 무겁고 전역 설정이라서, 결국 이렇게 동작하는 작은 헬퍼를 만들었어요.

- 서명 전용 SSH 키를 만들고,
- 현재 저장소에만 설정하고,
- 필요하다면 예전 커밋까지 다시 서명해서 히스토리를 고치고,
- 기기 사이에서 키를 옮길 수 있게 해줘요.

솔직히 말하면, 필요라기보다는 허영심에 가까웠어요. 제 개인 프로젝트에는 서명을 요구하는 규칙이 전혀 없지만, 커밋에 초록색 "Verified" 배지가 붙으면 기분이 좋거든요. 게다가 이 스크립트를 셸로 짜는 과정 자체가 정말 즐거웠어요.

> 커밋에 서명하는 건, 코드 리뷰에 가죽 재킷을 입고 가는 것과 비슷해요. 완전히 쓸모없지만, 해커가 된 기분이 들거든요.

## 스크립트가 하는 일

이 스크립트는 하나의 Bash 파일이고, 맨 위에 `set -euo pipefail`을 두어서 첫 오류에서 바로 실행을 멈춰요. 하는 일을 요약하면 이렇습니다.

1. **서명 키 생성 또는 가져오기**
   스크립트를 실행한 폴더 안의 `.git-signing/`에 키가 들어가요.
2. **Git을 로컬로 설정하기**
   `gpg.format=ssh`와 `user.signingkey`, `commit.gpgsign=true`, `tag.gpgSign=true`, 그리고 공개 키를 가리키는 `allowedSignersFile`을 설정해요.
3. **기기 사이에서 키 관리하기**
   `--export-keys`와 `--import-keys` 덕분에 전역 설정을 건드리지 않고 개인 키를 한 컴퓨터에서 다른 컴퓨터로 옮길 수 있어요.
4. **선택적인 히스토리 다시 쓰기** (`--resign-all`)
   모든 브랜치와 태그의 커밋(포크에서는 `upstream`에 없는 것만)을 전부 다시 쓰고 `-S`로 다시 서명해요. 다른 작성자는 건드리지 않아요.
5. **유틸리티 플래그**
   `--autostash`, `--autopush`, `--commit-date`, 비대화형 모드용 `--yes` 등이 있어요.
6. **포크 감지와 보안 검사**
   `upstream` 리모트를 감지하고, 히스토리를 다시 쓰기 전에 경고하고, 필요한 도구(`git`, `ssh-keygen`, `zip/unzip`)를 확인하고, 올바른 권한을 보장하고, 파일시스템 권한이 너무 너그러우면 키의 안전한 복사본까지 만들어요.

이 스크립트는 멱등적이에요. 두 번 실행해도 키가 다시 만들어지거나 기존 설정이 덮어써지지 않아요.

## 단계별 살펴보기

핵심 코드 조각 몇 개와 그 설명이에요.

```bash
#!/usr/bin/env bash
set -euo pipefail

# 제어된 저장소 로컬 방식으로 SSH 커밋 서명을 설정해요.
# - 키 파일은 이 스크립트를 실행한 디렉터리에 만들어져요.
# - Git 설정은 현재 저장소에만 로컬로 기록돼요.
```

헤더는 안전 장치를 걸고 목표를 문서화해요. 다음 부분은 `while [[ $# -gt 0 ]]; do case … esac done` 루프로 CLI 옵션(`--name`, `--email`, `--repo` 등)을 파싱해요. 필수 신원 필드는 나중에 검사해요.

```bash
if [[ -z "$NAME" || -z "$EMAIL" ]]; then
  echo "Error: missing identity. Provide --name and --email." >&2
  exit 1
fi
```

키 생성은 `$LAUNCH_DIR/.git-signing`에서 일어나요. 키가 이미 있으면 스크립트가 그대로 두고, `--import-keys`로 ZIP에서 폴더를 채울 수 있어요.

```bash
mkdir -p "$KEY_DIR"

if [[ -n "$IMPORT_ZIP_PATH" ]]; then
  import_keys_from_zip "$IMPORT_ZIP_PATH"
fi

if [[ ! -f "$KEY_PATH" ]]; then
  ssh-keygen -t ed25519 -N "" -C "$EMAIL signing key" -f "$KEY_PATH" >/dev/null
  echo "Generated signing key: $KEY_PATH"
else
  echo "Signing key already exists: $KEY_PATH"
fi
```

개인 키가 사용 가능한지 확인한 뒤(`ssh-keygen -Y sign …`), 스크립트는 공개 키가 담긴 `allowed_signers` 파일을 쓰고 Git 로컬 설정을 기록해요.

```bash
git -C "$REPO_DIR" config --local gpg.format ssh
git -C "$REPO_DIR" config --local user.signingkey "$RUNTIME_KEY_PATH"
git -C "$REPO_DIR" config --local gpg.ssh.allowedSignersFile "$ALLOWED_SIGNERS"
git -C "$REPO_DIR" config --local commit.gpgsign true
git -C "$REPO_DIR" config --local tag.gpgSign true
```

`--resign-all`로 히스토리 다시 쓰기를 요청하면, 스크립트는 조건에 맞는 커밋을 `-S`로 다시 서명하는 `git filter-branch` 명령을 만들어요. 포크 상태를 존중해서 `upstream`에 이미 있는 커밋은 선택적으로 건너뛰어요.

마지막 결과로 공개 키와 GitHub의 **Signing Key** 섹션에 추가하는 방법, 그리고 테스트 방법이 출력돼요.

## 왜 커밋에 서명할까요?

이제 고백할 시간인데요, 사실 필요하지 않았어요. 제 저장소에는 제가 게시하는 것에 출처를 요구하는 규칙이 없고, 릴리스에 서명된 태그를 쓰지도 않아요. "이유"라면 이렇습니다.

- 할 수 있었으니까,
- 보기 좋으니까(배지 보셨죠?),
- `git filter-branch`와 셸을 실험할 핑계가 생겼으니까,
- 그리고 "이것도 직접 만들었다"는 목록에 하나 더 추가됐으니까요.

한마디로 멋을 부리려고 만든 거지만, 제 도구를 만지작거릴 때 저는 바로 그 점이 좋아요.

## 사용 예시

```bash
# 현재 저장소에서 초기 설정하기
chmod +x ./setup-ssh-signing.sh
./setup-ssh-signing.sh --name "Your Name" \
                       --email "you@example.com"

# 다른 기기용으로 키 내보내기
./setup-ssh-signing.sh --export-keys ./my-signing-keys.zip

# 두 번째 기기에서 키 가져오기
./setup-ssh-signing.sh --import-keys ./my-signing-keys.zip --repo ./my-repo \
                       --name "Your Name" --email "you@example.com"

# 히스토리를 다시 쓰고 푸시하기
./setup-ssh-signing.sh --repo ./my-repo --name "Your Name" --email "you@example.com" \
                       --resign-all --autostash --autopush --yes
```

## 마지막 생각

이 스크립트는 여전히 작은 유틸리티지만, 제가 고수하는 원칙 몇 가지가 담겨 있어요.

- 암호화 키는 로컬에, 저장소 단위로 두고,
- 직접 요청하지 않는 한 전역 설정을 절대 건드리지 않고,
- 간단한 가져오기와 내보내기, 히스토리 다시 쓰기를 제공하고,
- 재사용 가능한 기록으로 남기기 위해 전 과정을 블로그 글에 문서화해요.

여러분의 커밋에도 서명을 달아 보고 싶어지면 한번 써 보세요! 그냥 멋을 위해서라면, 그것도 환영이에요. 😎
