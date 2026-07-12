---
title: 이 블로그는 어떻게 동작하나요?
description: "이 블로그의 내부 동작에 대한 심층 분석: React, Vite, Markdown, CI/CD 파이프라인, 글 작성 워크플로우"
date: 2026-03-08
aiGenerated: trueauthors:
  - fox3000foxy
tags:
  - react
  - meta
  - blog
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "r3L6B0KbMWxD0/zMbXndTyNoCdUBW5rFDjb2BtgCESy4xORnC2UsVNPxN9mWwPpFjTf9waS4ptG0K5HkKiEM4A=="
---

# 이 블로그는 어떻게 동작하나요?

이 블로그가 내부적으로 어떻게 돌아가는지 궁금했어? 이 글에서는 앱의 전체 아키텍처를 기술 스택부터 글을 쓰는 과정까지 모두 설명할게. 그리고 맞아, VS Code에서 어떻게 글을 쓰는지도 보여줄 거야!

## 기술 스택

이 블로그는 최신 웹 기술로 만들어졌어:

- **React 19** -- 사용자 인터페이스용
- **TypeScript** -- 타입이 있는 더 안정적인 코드
- **Vite** -- 초고속 빌드 도구
- **React Router v7** -- 페이지 간 네비게이션
- **react-markdown** -- Markdown을 HTML로 변환
- **rehype-raw + rehype-sanitize** -- 보안을 유지하면서 Markdown에서 원시 HTML 허용

모든 건 **GitHub Pages**에서 `fox3000foxy.github.io` 저장소에서 직접 호스팅되고 있어.

## 프로젝트 구조

프로젝트 트리는 이렇게 생겼어:

![](assets/how-this-blog-works/project-structure.png)

```
├── .github/
│   └── workflows/
│       └── deploy.yml        ← CI/CD 파이프라인
├── public/
│   ├── home.md               ← 홈 페이지 콘텐츠
│   ├── portfolio.md          ← 포트폴리오 콘텐츠
│   └── articles/
│       ├── index.json        ← 모든 글 목록
│       ├── hello-world.md    ← 글 예시
│       ├── how-this-blog-works.md  ← 이 글!
│       └── assets/           ← 글 이미지들
├── src/
│   ├── main.tsx              ← React 진입점
│   ├── App.tsx               ← 메인 라우터
│   ├── components/
│   │   ├── Header.tsx        ← 네비게이션 바
│   │   └── Footer.tsx        ← 푸터
│   └── pages/
│       ├── Home.tsx          ← 홈 페이지
│       ├── BlogList.tsx      ← 글 목록
│       ├── Article.tsx       ← 글 읽기 페이지
│       ├── Portfolio.tsx     ← 포트폴리오 페이지
│       └── NotFound.tsx      ← 404 페이지
└── vite.config.ts            ← Vite 설정
```

핵심 아이디어는 간단해: **콘텐츠는 코드와 분리**된다. 페이지는 `public/` 폴더에 Markdown으로 작성되고, `src/`의 React 코드가 렌더링을 담당해.

## 라우팅 시스템

`App.tsx` 파일이 React Router를 사용해 모든 애플리케이션 경로를 정의해:

![](assets/20260308_153440_image.png)

| 경로 | 페이지 | 설명 |
| --------------- | ----------- | --------------------------------------------- |
| `/` | Home | 홈 페이지, `home.md` 로드 |
| `/blog` | BlogList | 모든 글 목록 |
| `/blog/:slug` | Article | 개별 글, `articles/{slug}.md` 로드 |
| `/portfolio` | Portfolio | 포트폴리오 페이지, `portfolio.md` 로드 |
| `*` | NotFound | 알 수 없는 URL용 404 페이지 |

각 페이지는 명확한 역할이 있어: Markdown 파일을 가져와서 `react-markdown`으로 HTML로 변환하고 화면에 표시해.

## 글은 어떻게 동작하나요?

이게 제일 재미있는 부분이야! 글의 생애주기는 이렇게 돼:

### 1. `index.json` 파일

모든 글은 `public/articles/index.json`에 등록돼. 각 항목에는 글의 메타데이터가 들어있어:

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

- **slug** -- 고유 식별자, URL에 사용됨 (`/blog/hello-world`)
- **title** -- 목록에 표시되는 제목
- **description** -- 짧은 요약
- **date** -- 발행일

### 2. Markdown 파일

글 콘텐츠는 `public/articles/` 안에 있는 간단한 `.md` 파일이야. 파일명은 `index.json`에 정의된 `slug`와 일치해.

![](assets/20260308_153509_image.png)

rehype-raw 덕분에 제목, 목록, 이미지, 테이블, 심지어 원시 HTML까지 무엇이든 넣을 수 있어!

### 3. React 측 렌더링

`/blog/hello-world`에 방문하면 이런 일이 일어나:

1. React Router가 URL에서 `slug` 파라미터를 가져와
2. `Article.tsx` 컴포넌트가 `/articles/hello-world.md`를 가져와
3. `react-markdown`이 Markdown을 HTML로 변환해
4. `assets/` 링크가 자동으로 `/articles/assets/`로 재작성돼
5. 동시에 `index.json`에서 메타데이터를 로드해 날짜와 설명을 표시해

이렇게 간단해!

## 홈 페이지와 포트폴리오

홈과 포트폴리오 페이지도 똑같은 방식으로 동작해: Markdown 파일(`home.md` 또는 `portfolio.md`)을 로드해서 HTML로 렌더링해.

특별한 점은 모든 HTML 요소에 `class`와 `style` 속성을 허용하는 커스텀 새니티제이션 스키마를 사용한다는 거야. 이렇게 하면 이미지 갤러리 같은 스타일된 HTML을 Markdown에서 직접 작성할 수 있어.

## 헤더와 푸터

헤더는 `position: fixed`로 페이지 상단에 고정되어 있어. 내용은:

- 내 GitHub 아바타 (`github.com/fox3000foxy.png`에서 직접 로드)
- 블로그 제목
- 네비게이션 링크: Home, Blog, Portfolio

푸터는 미니멀해: 현재 연도가 동적으로 계산된 저작권 표시만 있어.

## 다크 테마

사이트는 **항상 다크 모드**야 -- 라이트/다크 토글이 없어. 의도적인 선택이지: 전역 스타일에 `color-scheme: dark`가 설정되어 있고, 검은 배경 `#000`에 흰색 텍스트 `#fff`를 사용해. 링크는 파란색(`#64b5f6`)이고 호버 시 초록색(`#81c784`)으로 변해.

## 내가 글을 쓰는 방법

이제 실용적인 부분이야! 새 글을 쓰는 내 워크플로우:

### 1단계: Markdown 파일 생성

VS Code를 열고 `public/articles/`에 새 `.md` 파일을 만들어:

### 2단계: 내용 작성

글 내용을 Markdown으로 직접 작성해. VS Code는 훌륭한 내장 Markdown 미리보기를 제공해:

![](assets/20260308_153613_image.png)

이미지는 `public/articles/assets/`에 넣고 표준 Markdown 문법으로 참조해:

```markdown
![description](assets/my-image.png)
```

`Article.tsx` 컴포넌트가 `assets/` 경로를 자동으로 `/articles/assets/`로 재작성해서 이미지가 올바르게 표시돼.

### 3단계: index.json에 글 등록

글이 완성되면 `public/articles/index.json`에 추가해서 블로그 목록에 나타나게 해:

![](assets/20260308_153629_image.png)

### 4단계: 로컬에서 테스트

Vite 개발 서버를 시작해:

```bash
pnpm dev
```

Vite는 몇 밀리초 만에 시작하고 `localhost:5173`에서 글을 실시간으로 볼 수 있어:

![](assets/20260308_153703_image.png)

### 5단계: 배포

`git push` 하나면 끝이야! CI/CD 파이프라인이 나머지를 자동으로 처리해.

## CI/CD 배포 파이프라인

`main`에 푸시할 때마다 린팅, 빌드, 배포를 자동화하는 완전한 **GitHub Actions** 파이프라인을 설정했어. 자세히 살펴보자.

워크플로우는 `.github/workflows/deploy.yml`에 있고 **build**와 **deploy** 두 개의 작업으로 나뉘어.

### 트리거

```yaml
on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
```

파이프라인은 `main`에 **push**할 때마다와 `main`을 대상으로 하는 **pull request**마다 실행돼. PR은 병합 전에 검사(린트 + 빌드)를 받지만, `main`에 푸시할 때만 실제 배포가 이루어져.

### 작업 1: Build

Build 작업은 `ubuntu-latest`에서 실행되며 다음 단계를 거쳐:

1. **Checkout** -- 전체 히스토리로 저장소 클론 (`fetch-depth: 0`)
2. **Setup pnpm** -- `pnpm/action-setup@v4`로 최신 pnpm 설치
3. **Setup Node.js 20** -- 더 빠른 설치를 위해 pnpm 캐싱 활성화하여 Node 설정
4. **Install dependencies** -- `pnpm install --frozen-lockfile` 실행 (락파일 변경 불가)
5. **Lint** -- `pnpm run lint` (ESLint)로 코드 품질 확인
6. **Build** -- `pnpm run build` 실행, 먼저 TypeScript 타입 검사(`tsc -b`) 후 Vite로 번들링
7. **Upload artifact** -- `dist/` 폴더를 빌드 아티팩트로 업로드

어느 단계든 실패하면 -- 린트 에러, 타입 에러, 빌드 에러 -- 전체 파이프라인이 중단되고 아무것도 배포되지 않아. 이렇게 라이브 사이트가 깨진 코드로부터 안전해.

### 작업 2: Deploy

Deploy 작업은 다음 조건에서만 실행돼:

- Build 작업이 성공했을 때 (`needs: build`)
- 이벤트가 **push**일 때 (PR이 아닐 때)
- 브랜치가 **main**일 때

```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

그러면:

1. **빌드 아티팩트 다운로드** -- Build 작업이 만든 `dist/` 폴더를 가져와
2. **GitHub Pages 설정** -- Pages 환경 구성
3. **Pages에 업로드** -- GitHub Pages용으로 `dist/` 폴더 패키징
4. **배포** -- `actions/deploy-pages@v4`로 사이트 게시

### 전체 그림

글을 쓰고 배포까지의 과정:

```
VS Code에서 글 작성
        ↓
   git add & commit
        ↓
      git push
        ↓
  GitHub Actions 트리거
        ↓
  ┌─────────────────┐
  │   BUILD 작업     │
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
  │  DEPLOY 작업     │
  │  1. Download    │
  │  2. Configure   │
  │  3. Upload      │
  │  4. Deploy 🚀   │
  └─────────────────┘
           ↓
    GitHub Pages에 라이브!
```

푸시부터 라이브까지 전체 과정은 약 1분 정도 걸려. 수동 배포, FTP, SSH 없음 -- 그냥 `git push`면 끝이야.

## 프로덕션 빌드

내부적으로 `pnpm build` 명령은 다음을 실행해:

1. `tsc -b` -- TypeScript 타입 검사
2. `vite build` -- 모든 코드 번들링 및 최적화

Vite는 자동 코드 분할로 축소 및 최적화된 파일을 생성해. 결과는 엄청 빠른 정적 사이트야.

## 왜 이 아키텍처인가?

CMS, Hugo나 Jekyll 같은 정적 사이트 생성기, 또는 Next.js를 사용할 수도 있었어. 하지만 이 방식을 선택한 이유는:

- **단순함** -- Markdown으로 작성하고 GitHub에 푸시하면 바로 라이브
- **완전한 제어** -- CMS나 데이터베이스에 의존하지 않음
- **성능** -- Vite + React = 빠른 로딩
- **유연성** -- Markdown과 HTML을 원하는 대로 섞어 쓸 수 있음
- **학습** -- React와 TypeScript를 마스터하기 좋은 프로젝트
- **CI/CD** -- GitHub Actions로 자동화된 품질 검사 및 배포

## 결론

이 블로그는 단순하지만 잘 생각된 프로젝트야: 콘텐츠는 Markdown, 렌더링은 React, 성능은 Vite, CI/CD는 GitHub Actions, 호스팅은 GitHub Pages. 데이터베이스도, 백엔드 서버도 없이, 자동화된 파이프라인이 모든 푸시에서 품질을 보장하면서 효율적으로 제공되는 정적 파일일 뿐이야.

비슷한 아키텍처로 자신만의 블로그를 만들고 싶다면, [GitHub의 소스 코드](https://github.com/fox3000foxy/fox3000foxy.github.io)를 확인해 봐!

읽어줘서 고마워, 다음 글에서 보자! 🦊
