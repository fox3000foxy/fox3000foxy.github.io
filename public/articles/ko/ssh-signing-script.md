---
title: SSH 커밋 서명 스크립트 설명
description: SSH 커밋 서명 헬퍼의 분석과 내가 스타일리시한 커밋을 원했던 이유
date: 2026-03-08
aiGenerated: true
authors:
  - fox3000foxy
tags:
  - git
  - security
  - shell
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "9SPGzvm3GW4GxpvMgn9VNTuin5gf9dhTQ2oTSnFXN5jAjsPV467wj/VjYXnfr13QIlxGCqed8rlbuSseL2KdIg=="
---

# SSH 커밋 서명 스크립트 설명

이 글은 내가 [Gist](https://gist.github.com/fox3000foxy/95500d129cd4bf5c173c323d2492569a)에 올린 `setup-ssh-signing.sh` 스크립트를 자세히 살펴본다. 각 부분이 무엇을 하는지, 어떻게 저장소-로컬 SSH 커밋 서명을 간편하게 만드는지, 그리고 솔직히 말해서 내가 왜 이걸 만들었는지까지 살펴볼 거야 (스포일러: 그냥 내 커밋을 **스타일리시하게** 만들고 싶었어).

## 동기

나는 항상 내 Git 워크플로우를 조정하는 걸 좋아했어. 다른 사람들의 커밋 옆에 있는 작은 "Verified" 배지를 보고 나는 생각했지: 왜 나는 안 돼? 기본 제공 GPG 서명은 좀 무겁고 전역 설정이라서, 결국 작은 헬퍼를 만들게 됐어:

- 서명 전용 SSH 키 생성
- 현재 저장소만 설정
- 선택적으로 과거 커밋에 서명하도록 히스토리 재작성
- 키를 다른 기기로 옮길 수 있게 내보내기/가져오기 지원

사실, 필요성은 대부분 허영심이었어. 내 개인 프로젝트에 서명이 기술적으로 필요한 건 아니지만, 커밋에 초록색 "Verified"가 있는 건 멋져 보이고, 스크립트를 작성하는 것 자체가 셸 스크립팅의 재미있는 연습이었어.

> 그러니까, 커밋에 서명하는 건 코드 리뷰에 가죽 자켓 입고 가는 거랑 비슷해 -- 완전 불필요하지만, 해커 된 기분이 들어.

## 스크립트가 하는 일

이 스크립트는 단일 Bash 파일이고, 상단에 `set -euo pipefail`이 있어서 실패 시 빠르게 중단돼. 대략적인 동작은 이렇다:

1. **서명 키 생성 또는 가져오기**
   스크립트를 실행한 디렉토리의 `.git-signing/`에 키가 저장돼.
2. **로컬 Git 설정**
   `gpg.format=ssh`, `user.signingkey`, `commit.gpgsign=true`, `tag.gpgSign=true`, 그리고 공개 키를 가리키는 `allowedSignersFile`을 설정해.
3. **크로스-머신 키 관리**
   `--export-keys`/`--import-keys` 옵션으로 개인 키를 전역 상태를 건드리지 않고 다른 컴퓨터로 옮길 수 있어.
4. **선택적 히스토리 재작성** (`--resign-all`)
   모든 브랜치/태그의 모든 커밋을 재작성하고 `-S` 플래그로 다시 커밋해. 다른 작성자는 건드리지 않아.
5. **유틸리티 플래그**
   `--autostash`, `--autopush`, `--commit-date`, `--yes` 등 비대화형 모드 지원.
6. **포크 인식 및 안전 검사**
   `upstream` 리모트 감지, 히스토리 재작성 전 경고, 필수 도구(`git`, `ssh-keygen`, `zip/unzip`) 확인, 권한 확인, 파일시스템 권한이 너무 느슨하면 보안 런타임 복사본 생성.

스크립트는 멱등적이다: 두 번 실행해도 키를 다시 생성하거나 기존 설정을 덮어쓰지 않아.

## 단계별 분석

다음은 설명과 함께 코드의 주요 부분들이다.

```bash
#!/usr/bin/env bash
set -euo pipefail

# 통제된 저장소-로컬 방식으로 SSH 커밋 서명을 설정한다.
# - 키 파일은 이 스크립트가 실행된 디렉토리에 생성된다.
# - Git 설정은 현재 저장소에만 로컬로 기록된다.
```

헤더는 안전성을 확보하고 목표를 문서화한다. 다음 청크는 `while [[ $# -gt 0 ]]; do case … esac done` 루프로 CLI 옵션(`--name`, `--email`, `--repo` 등)을 파싱한다. 필수 신원 필드는 나중에 확인된다:

```bash
if [[ -z "$NAME" || -z "$EMAIL" ]]; then
  echo "Error: missing identity. Provide --name and --email." >&2
  exit 1
fi
```

키 생성은 `$LAUNCH_DIR/.git-signing`에서 이루어진다. 키가 이미 존재하면 스크립트는 그대로 두고, `--import-keys`로 ZIP 파일에서 디렉토리를 채울 수 있다.

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

개인 키를 사용할 수 있는지 확인한 후(`ssh-keygen -Y sign …`), 스크립트는 공개 키를 포함한 작은 `allowed_signers` 파일을 작성하고 Git 로컬 설정을 구성한다:

```bash
git -C "$REPO_DIR" config --local gpg.format ssh
git -C "$REPO_DIR" config --local user.signingkey "$RUNTIME_KEY_PATH"
git -C "$REPO_DIR" config --local gpg.ssh.allowedSignersFile "$ALLOWED_SIGNERS"
git -C "$REPO_DIR" config --local commit.gpgsign true
git -C "$REPO_DIR" config --local tag.gpgSign true
```

`--resign-all`로 히스토리 재작성을 요청하면, 스크립트는 `git filter-branch` 명령을 만들어 자격이 되는 커밋을 `-S`로 다시 커밋한다. 포크 상태를 존중하여 선택적으로 `upstream`에 이미 있는 커밋은 건너뛴다.

마지막 출력은 공개 키와 GitHub의 **Signing Key** 섹션에 추가하는 방법, 그리고 빠른 테스트 레시피를 보여준다.

## 왜 커밋 서명인가?

이제 솔직히 말할 부분이다. 사실 필요하지 않았다. 내 저장소는 내가 게시하는 어떤 것에도 출처 증명이 필요하지 않고, 릴리스에 서명된 태그를 사용하지도 않는다. "왜"의 이유는:

- 할 수 있으니까,
- 깔끔해 보이니까 (배지 본 적 있어?),
- `git filter-branch`와 셸 스크립팅을 실험할 핑계가 생겼으니까,
- 그리고 블로그에 올릴 "내가 직접 만든" 콘텐츠가 하나 더 생겼으니까.

요약하자면: 그냥 보여주기용이었지만, 도구를 가지고 노는 재미의 절반은 그런 거야.

## 사용 예시

```bash
# 현재 저장소에 초기 설정
chmod +x ./setup-ssh-signing.sh
./setup-ssh-signing.sh --name "Your Name" \
                       --email "you@example.com"

# 다른 기기에서 사용할 키 내보내기
./setup-ssh-signing.sh --export-keys ./my-signing-keys.zip

# 두 번째 기기에서 키 가져오기
./setup-ssh-signing.sh --import-keys ./my-signing-keys.zip --repo ./my-repo \
                       --name "Your Name" --email "you@example.com"

# 히스토리 재작성 및 푸시
./setup-ssh-signing.sh --repo ./my-repo --name "Your Name" --email "you@example.com" \
                       --resign-all --autostash --autopush --yes
```

## 마지막 생각

이 스크립트는 작은 유틸리티지만, 몇 가지 좋은 아이디어를 담고 있어:

- 암호화 키를 로컬 및 저장소별로 유지
- 요청하지 않으면 전역 설정을 절대 건드리지 않음
- 간단한 가져오기/내보내기 및 히스토리 재작성 제공
- 왜 안 되겠어, 라는 마인드로 전체 과정을 블로그 글로 문서화

커밋에 서명을 추가하고 싶다면, 한번 사용해 봐! 그리고 그냥 스타일 포인트 때문에 온 거라면, 나랑 같은 생각이야. 😎
