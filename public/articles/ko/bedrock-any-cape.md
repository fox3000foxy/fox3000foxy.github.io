---
title: "Minecraft Bedrock에서 어떤 망토든 얻는 방법"
description: "서드파티 런처, 오래된 게임 버전, 그리고 '아니오'를 배운 적 없는 망토 선택기. 전체 튜토리얼과 작동 원리에 대한 추정 해설."
date: 2026-07-14
tags:
  - minecraft
  - bedrock
  - tutorial
  - reverse-engineering
authors:
  - 9stown
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "T+bYv/sOItS0OEmsrGvxsR9ZAsXMqnFBeXfAlk54NTuECiF8NWvAt1UelRSjEB8+IvcAEClXe8DWxu1ITvgSew=="
---

# Minecraft Bedrock에서 어떤 망토든 얻는 방법

자바 에디션에는 가질 수 없는 망토를 얻는 꼬인 방법이 많다(`cape-mod` 글 참고). 베드락은 게임도 다르고 인증도 다르지만, 그래도 방법이 있다 -- 모드도 필요 없고 네트워크 패킷 조작도 필요 없다. 그냥 서드파티 런처 하나와, 검증이 덜 들어간 오래된 버전의 게임만 있으면 된다.

하는 방법을 알려주고, 그다음에 내부에서 무슨 일이 일어나는지 살펴보자.

## 필요한 것

- Minecraft Bedrock을 이미 소유한 Microsoft 계정 (네 걸로 충분)
- 공식 Minecraft 런처 설치됨
- [BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher), Bedrock의 모든 과거 버전을 설치하고 실행할 수 있는 오픈소스 서드파티 런처
- .NET 8.0 Desktop Runtime
- Windows에 개발자 모드 활성화

## 1단계 -- 공식 런처로 Bedrock을 최소 한 번 설치하기

다른 걸 하기 전에, 공식 Minecraft 런처를 열고 **Minecraft: Bedrock Edition** 탭으로 가서 **Install**을 클릭한다. BedrockLauncher를 건드리기 전에 공식 경로로 Bedrock이 최소 한 번 설치되고 실행되어야 한다.

![공식 런처에서 Bedrock Edition 설치하기](/images/bedrock-cape/bedrock-cape-01-install-bedrock.png)

## 2단계 -- BedrockLauncher 다운로드

프로젝트의 GitHub 릴리스 페이지로 간다. **Assets** 아래에 나열된 최신 버전의 zip을 받는다.

![BedrockLauncher GitHub 릴리스 페이지](/images/bedrock-cape/bedrock-cape-02-github-release.png)

## 3단계 -- 압축 풀기

zip을 다운로드한 후, `Downloads` 폴더(혹은 나중에 찾을 수 있는 아무 곳)에 압축을 푼다.

![BedrockLauncher 압축 풀기](/images/bedrock-cape/bedrock-cape-03-extract-zip.png)

## 4단계 -- 실행 파일 실행

압축 푼 폴더로 들어가서 `BedrockLauncher.exe`를 실행한다.

![BedrockLauncher.exe 실행](/images/bedrock-cape/bedrock-cape-04-run-exe.png)

## 5단계 -- .NET Desktop Runtime 설치 및 개발자 모드 활성화

처음 실행할 때 Windows가 **.NET 8.0 Desktop Runtime**을 요구할 가능성이 높다 -- 설치한다. 또한 `설정 > 시스템 > 개발자용`에서 **개발자 모드**를 활성화해야 한다. BedrockLauncher가 게임을 루스 패키지(원시 파일, 서명된 진짜 Store 패키지가 아님)로 설치하기 때문에, 이 모드 없이는 Windows가 설치를 거부한다.

![.NET 런타임 설치 및 개발자 모드 활성화](/images/bedrock-cape/bedrock-cape-05-dotnet-devmode.png)

## 6단계 -- 새 설치 만들기

BedrockLauncher를 다시 실행하고, Microsoft 계정으로 로그인한 후 **Installations** 탭으로 가서 **New installation**을 클릭한다.

![BedrockLauncher에서 새 설치 만들기](/images/bedrock-cape/bedrock-cape-06-new-installation.png)

## 7단계 -- 오래된 버전 선택

설치에 이름을 붙이고, 버전 목록에서 **오래된** 버전을 선택한다 -- 보통 `1.16.x` 이하. **Create**를 클릭한다.

![오래된 버전 선택, 여기서는 1.16.0.2](/images/bedrock-cape/bedrock-cape-07-pick-old-version.png)

## 8단계 -- 설치 실행

**Play**를 클릭한다. 파일 추출은 컴퓨터에 따라 최대 10분까지 걸릴 수 있다 -- 런처가 멈춘 것처럼 보여도("응답 없음") 정상이니 그대로 둔다.

![추출 진행 중, 런처가 응답하지 않는 것처럼 보임](/images/bedrock-cape/bedrock-cape-08-launch-extracting.png)

## 9단계 -- 망토 선택

게임이 실행되면 계정으로 로그인하고, 새 캐릭터를 만든 후 스킨 편집기에서 **망토(Capes)** 탭으로 간다. 거기에는 한 번도 가져본 적 없는 망토를 포함해 게임에 존재하는 모든 망토의 전체 목록이 표시된다(프로모션 이벤트, 지난 축제, Mob Vote 등). 원하는 걸 골라라.

**이 단계에서는 스킨의 나머지 외형을 건드리지 말고**, 망토만 남겨둔다.

![캐릭터 편집기에서 망토 선택](/images/bedrock-cape/bedrock-cape-09-choose-cape.png)

## 10단계 -- 공식 버전 재설치

공식 런처로 돌아가서 **설치** 탭에서 메인 Bedrock 설치를 **제거**한 후 다시 설치한다(혹은 **업데이트 확인**을 누른다). 이번에는 공식 런처에서 Minecraft Bedrock을 실행한다.

![공식 런처에서 제거 및 재설치](/images/bedrock-cape/bedrock-cape-10-reinstall-official.png)

이제 됐다 -- 망토가 공식 버전에서, 네 실제 프로필에 적용되어 있다.

## 아마도 내부에서 일어나는 일

베드락의 폐쇄 소스 코드를 직접 들여다본 건 아니라서(자바는 디컴파일 가능하지만), 아래 설명은 **추정**이지 확실한 건 아니다. 하지만 관찰된 동작은 다음 가설과 꽤 잘 맞는다.

### 망토 선택기는 원래 접근 제어가 아니었다

베드락에서 망토 선택 화면은 네 계정이 소유한 망토만이 아니라 **게임에 존재하는 전체 망토 목록**을 표시할 가능성이 크다. 최신 클라이언트에서는 애플리케이션 필터(클라이언트 측 또는 Xbox/Microsoft 자격 서비스로의 네트워크 호출)가 소유하지 않은 망토를 회색으로 표시하거나 숨긴다.

핵심은 이 필터가 아마도 **나중에 추가된 것**이라는 점이다. 1.16.x 같은 버전은 이 필터보다 이전이거나, 다른(혹은 없는) 검증 메커니즘을 사용한다: 목록에 있는 모든 것이 선택 가능해지며, 자격 여부는 상관없다.

### 망토는 정확히 어디에 저장되는가?

이 부분이 재설치 후에도 살아남는 이유를 설명한다. Bedrock에서 스킨/망토 선택은 그냥 버리는 로컬 파일이 아니다 -- Microsoft 계정에 연결된 Xbox Live 프로필에 동기화될 가능성이 크다(모바일, 콘솔 등 다른 Bedrock 플랫폼에서 스킨을 관리하는 것과 동일한 시스템). 오래된 클라이언트에서 망토를 선택하면, 최신 클라이언트가 정상 망토와 똑같이 보내는 것과 같은 방식으로 프로필 서비스에 그 선택을 전송할 가능성이 크다 -- 클라이언트 입장에서는 "네가 소유한" 망토와 "선택된" 망토 사이에 차이가 없기 때문이다. 프로필 서비스는 이 지점에서 클라이언트를 신뢰한다: 적어도 쓰기 시점에는 실제 자격이 존재하는지 재검증하지 않고 선택을 기록한다.

결과: 최신 공식 게임을 다시 실행하면, 현재 스킨/망토를 프로필 서비스에서 가져오고 -- 서비스는 저장된 그대로 충실히 반환하며, 비정상 망토도 포함된다. 자격 확인이 존재한다면 아마도 최근 UI에서 **선택** 시점에 이루어지며(그래서 최신 클라이언트에서 필터가 있는 것), 이미 프로필에 저장된 것을 **표시**하는 시점에는 이루어지지 않는다.

### 자바와의 평행

자바의 `cape-mod`와 동일한 계열의 논리 결함이다: 서비스가 모든 단계에서 데이터의 출처를 재확인하지 않고 신뢰한다. 자바에서는 유효한 RSA 서명이 잘못된 프로필에 재생되는 방식이다. 베드락에서는 올바른 필터가 없었던 오래된 클라이언트가 망토 선택을 수락하고, 그게 계정의 영구 상태로 재검증 없이 전파되는 방식일 것이다. 두 경우 모두 문제는 진입점(자바 모드, 오래된 베드락 클라이언트)이 아니라 -- 자격을 하류에서 재검증해야 하는 계층이 그걸 하지 않거나, 한 번만, 잘못된 위치에서 한다는 점이다.

## 왜 아직도 되는가

두 가지 가능한 설명, 상호 배타적이지 않다:

1. **Mojang은 이걸 우선순위로 보지 않을 가능성이 크다.** 서드파티 런처와 여러 단계의 조작이 필요하고, 결과는 순수하게 치장용이다 -- 게임플레이 이점도 없고, 타인의 데이터도 손상되지 않는다.
2. **이걸 제대로 고치려면 프로필을 읽을 때마다 자격을 재검증해야 한다**, 선택할 때만이 아니라 -- 즉 스킨을 표시할 때마다 네트워크 호출이 추가되어야 하며, 이건 순수 미관 문제다.

## 결론

이 튜토리얼은 스크린샷 10장으로 끝나지만, 소프트웨어 보안 어디에서나 볼 수 있는 원칙을 보여준다: 레거시 시스템(오래된 클라이언트 버전, 레거시 API, 업데이트되지 않은 서비스)이 여전히 공유 상태에 쓸 수 있는 한, 현재의 접근 제어는 현재를 통과하는 것만 보호한다. 여전히 과거 API와 통신할 수 있는 모든 것은 최신 필터를 우회한다 -- 필터가 깨져서가 아니라, 그 이전 버전에 적용된 적이 없기 때문이다.

---

**자료**

- **BedrockLauncher** : [github.com/bedrockLauncher/BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher)
- **관련 글** : Cape Mod, RSA 서명 주입 방식의 자바 에디션 버전

**3가지 핵심**

1. 오래된 Bedrock 버전의 망토 선택기는 아마도 자격 필터 없이 게임 내 모든 망토의 전체 목록을 보여준다.
2. 선택은 일반 망토와 마찬가지로 Xbox Live 프로필에 동기화된다 -- 프로필 서비스는 클라이언트를 신뢰한다.
3. 자격 확인이 있다면 최근 UI의 선택 시점에 이루어지며 -- 이미 계정에 저장된 것을 읽을 때는 이루어지지 않는다.
