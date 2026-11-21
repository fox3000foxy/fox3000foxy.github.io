---
title: 이 블로그는 어떻게 돌아가나요?
description: "블로그의 뒷이야기: React, Vite, Markdown, CI/CD 파이프라인과 집필 흐름."
date: 2026-03-08
aiGenerated: true
tags:
  - react
  - meta
  - blog
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "bBxlzzwwWq1norMVLRTEOac5sMxis57q7EFIHWnLP4GOc4/Zu3RvfM+OpMjwgMx7n4VwJrT9sw6Rpa3fvx2hSw=="
---

# 이 블로그는 어떻게 돌아가나요?

이 블로그가 후드 아래에서 어떻게 돌아가는지 궁금하신 적 있나요? 이 글에서는 기술 스택부터 글 쓰기 과정까지, 애플리케이션 아키텍처 전체를 자세히 보여드릴게요. 맞아요, VS Code에서 글을 쓰는 방법까지 보여드릴게요!

## 기술 스택

이 블로그는 현대 웹 기술로 지어졌어요.

- **React 19**: 사용자 인터페이스용
- **TypeScript**: 타입이 있고 더 믿을 만한 코드용
- **Vite**: 초고속 빌드 도구
- **React Router v7**: 페이지 사이 탐색용
- **react-markdown**: Markdown을 HTML로 바꾸기용
- **rehype-raw + rehype-sanitize**: 안전하게 Markdown에 날것 HTML 허용용


## 프로젝트 구조

프로젝트 트리가 이렇게 생겼어요.

![](assets/how-this-blog-works/project-structure.png)

```
├── .github/
│   └── workflows/
│       └── deploy.yml              ← CI/CD 파이프라인
├── public/
│   ├── home.md                     ← 홈페이지 내용
│   ├── portfolio.md                ← 포트폴리오 내용
│   └── articles/
│       ├── index.json              ← 모든 글 목록
│       ├── hello-world.md          ← 글 하나
│       ├── how-this-blog-works.md  ← 이 글이에요!
│       └── assets/                 ← 글 이미지
├── src/
│   ├── main.tsx                    ← React 진입점
│   ├── App.tsx                     ← 주 라우터
│   ├── components/
│   │   ├── Header.tsx              ← 탐색 바
│   │   └── Footer.tsx              ← 바닥글
│   └── pages/
│       ├── Home.tsx                ← 홈페이지
│       ├── BlogList.tsx            ← 글 목록
│       ├── Article.tsx             ← 글 읽기
│       ├── Portfolio.tsx           ← 포트폴리오 페이지
│       └── NotFound.tsx            ← 404 페이지
└── vite.config.ts                  ← Vite 설정
```

핵심 생각은 단순해요. **콘텐츠는 코드와 분리돼요**. 페이지는 `public/`에 Markdown으로 쓰고, `src/`의 React 코드가 표시를 맡아요. 저는 이 분리를 고수해요. 콘텐츠를 다시 읽기 쉽게 하고 코드를 발전시키기 쉽게 하니까요.

## 라우팅 시스템

`App.tsx` 파일이 React Router로 애플리케이션의 모든 라우트를 정해요.

![](assets/20260308_153440_image.png)


| Route         | Page      | 설명                                |
| --------------- | ----------- | -------------------------------------------- |
| `/`           | Home      | 홈페이지, `home.md` 불러와요            |
| `/blog`       | BlogList  | 모든 글 목록                  |
| `/blog/:slug` | Article   | 글 하나, `articles/{slug}.md` 불러와요     |
| `/portfolio`  | Portfolio | 포트폴리오 페이지, `portfolio.md` 불러와요       |
| `*`           | NotFound  | 알 수 없는 URL용 404 페이지            |

각 페이지의 역할이 분명해요. Markdown 파일을 가져와서 `react-markdown`으로 HTML로 바꾸고 화면에 보여줘요.

## 글은 어떻게 동작하나요?

제가 제일 좋아하는 부분이에요! 글의 생애주기는 이렇습니다.

### 1. `index.json` 파일

모든 글은 `public/articles/index.json`에 참조되어 있어요. 각 항목에 글 메타데이터가 들어 있어요.

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

- **slug**: 고유 식별자, URL에 쓰여요 (`/blog/hello-world`)
- **title**: 목록에 표시되는 제목
- **description**: 짧은 요약
- **date**: 발행일

### 2. Markdown 파일

글 내용은 `public/articles/`의 단순 `.md` 파일이에요. 파일 이름이 `index.json`에 정한 `slug`와 일치해요.

![](assets/20260308_153509_image.png)

원하는 것을 넣을 수 있어요. 제목, 목록, 이미지, 표, 심지어 `rehype-raw` 덕분에 날것 HTML까지!

### 3. React 쪽 렌더링

`/blog/hello-world`에 들어가면 이런 일이 일어나요.

1. React Router가 URL에서 `slug` 매개변수를 가져와요
2. `Article.tsx` 컴포넌트가 `/articles/hello-world.md`를 불러와요
3. Markdown이 `react-markdown`으로 HTML로 바뀌어요
4. `assets/` 링크는 자동으로 `/articles/assets/`로 다시 써져요
5. 나란히 메타데이터가 `index.json`에서 불러와져서 날짜와 설명을 보여줘요

이렇게 단순해요!

## 홈 페이지와 포트폴리오

홈과 포트폴리오 페이지는 정확히 같은 방식으로 동작해요. Markdown 파일(`home.md` 또는 `portfolio.md`)을 불러와서 HTML로 렌더링해요.

특이한 점은 모든 HTML 요소에 `class`와 `style` 속성을 허용하는 맞춤형 살균 스키마를 쓴다는 거예요. 그래서 이미지 갤러리처럼 스타일된 HTML을 Markdown에 바로 쓸 수 있어요.

## 헤더와 푸터

헤더는 `position: fixed`로 페이지 위에 고정돼 있어요. 들어있는 것은요.

- 제 GitHub 아바타 (`github.com/fox3000foxy.png`에서 바로 불러와요)
- 블로그 제목
- 탐색 링크: 홈, 블로그, 포트폴리오

푸터는 미니멀해요. 동적으로 계산된 올해 연도가 있는 copyright뿐이에요.

## 다크 테마

사이트는 항상 다크 모드로 있어요. 저녁에 편하게 읽으려고 일부러 고른 거예요. 전역 스타일에 `color-scheme: dark`가 정해져 있고, 검은 배경 `#000`에 흰 글자 `#fff`예요. 링크는 파랑(`#64b5f6`)이고 호버하면 초록(`#81c784`)이 돼요.

## 글을 쓰는 방법

실전으로 넘어가요! 새 글을 쓰는 제 워크플로는 이렇습니다.

### 1단계: Markdown 파일 만들기

VS Code를 열고 `public/articles/`에 새 `.md` 파일을 만들어요.

### 2단계: 내용 쓰기

글 내용을 바로 Markdown으로 써요. VS Code에는 훌륭한 내장 Markdown 미리보기가 있어요.

![](assets/20260308_153613_image.png)

이미지는 `public/articles/assets/`에 두고 표준 Markdown 문법으로 참조해요.

```markdown
![description](assets/my-image.png)
```

`Article.tsx` 컴포넌트가 이미지가 제대로 보이도록 `assets/` 경로를 자동으로 `/articles/assets/`로 다시 써줘요.

### 3단계: index.json에 글 등록하기

글을 마치면 블로그 목록에 나타나도록 `public/articles/index.json`에 추가해요.

![](assets/20260308_153629_image.png)

### 4단계: 로컬에서 테스트하기

Vite 개발 서버를 실행해요.

```bash
pnpm dev
```

Vite는 몇 밀리초 만에 시작되고 `localhost:5173`에서 실시간으로 제 글을 볼 수 있어요. 이 속도 덕분에 매 수정을 거의 바로 확인할 수 있어요.

![](assets/20260308_153703_image.png)

### 5단계: 발행하기

단순한 `git push`면 충분해요! CI/CD 파이프라인이 나머지를 자동으로 맡아요.

## CI/CD 배포 파이프라인

매 `main` 푸시마다 사이트의 린트와 빌드, 배포를 자동화하는 완전한 **GitHub Actions** 파이프라인을 두었어요. 자세히 봐요.

워크플로는 `.github/workflows/deploy.yml`에 있고, **build**와 **deploy** 두 작업으로 나뉘어요.

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

파이프라인은 `main`으로의 매 **push**와 `main`을 향한 매 **pull request**에 실행돼요. PR은 합치기 전에 검증(린트 + 빌드)받고, `main`으로의 푸시만이 배포를 일으켜요.

### 작업 1: 빌드

빌드 작업은 `ubuntu-latest`에서 돌고 다음 단계를 따라요.

1. **Checkout**: 전체 히스토리와 함께 저장소를 복제해요 (`fetch-depth: 0`)
2. **Setup pnpm**: `pnpm/action-setup@v4`로 최신 pnpm을 설치해요
3. **Setup Node.js 20**: 더 빠른 설치를 위해 pnpm 캐시를 켜고 Node를 설정해요
4. **Install dependencies**: 재현 가능한 빌드를 보장하려고 `pnpm install --frozen-lockfile`을 실행해요 (lockfile 수정 허용 안 해요)
5. **Lint**: 빌드 전에 코드 품질을 확인하려고 `pnpm run lint`(ESLint)를 실행해요
6. **Build**: 먼저 TypeScript 타입을 확인(`tsc -b`)한 뒤 Vite로 전부 묶는 `pnpm run build`를 실행해요
7. **Upload artifact**: 배포 작업을 위해 `dist/` 폴더를 빌드 산출물로 올려요

한 단계라도 실패하면(린트, 타입, 빌드 오류) 파이프라인 전체가 멈추고 아무것도 배포되지 않아요. 깨진 코드가 프로덕션에 가는 것을 막아주는 장치이고, 매 푸시마다 의지해요.

### 작업 2: 배포

배포 작업은 다음일 때만 실행돼요.

- 빌드 작업이 성공했어요 (`needs: build`)
- 이벤트가 **push**예요 (PR이 아니에요)
- 브랜치가 **main**이에요

```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

그리고 이렇게 진행해요.

1. **빌드 산출물 내려받기**: 빌드 작업이 만든 `dist/` 폴더를 가져와요
2. **GitHub Pages 설정**: Pages 환경을 세팅해요
3. **Pages로 올리기**: `dist/` 폴더를 GitHub Pages용으로 준비해요
4. **배포**: `actions/deploy-pages@v4`로 사이트를 올려요

### 전체 그림

쓰기에서 배포까지 일어나는 일은 이렇습니다.

```
VS Code에서 글 쓰기
          ↓
    git add와 commit
          ↓
       git push
          ↓
   GitHub Actions 발동
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
     GitHub Pages에 온라인!
```

푸시부터 온라인까지 전 과정이 1분쯤 걸려요. 단순한 `git push`로 발행하고, 전부 FTP나 SSH 없이 자동으로 남아요.

## 프로덕션 빌드

후드 아래에서 `pnpm build` 명령은 이렇게 실행돼요.

1. `tsc -b`: TypeScript 타입을 확인해요
2. `vite build`: 모든 코드를 묶고 최적화해요

Vite는 자동 코드 스플리팅이 있는 minify되고 최적화된 파일을 만들어요. 결과는 초고속 정적 사이트예요.

## 왜 이 아키텍처인가요?

CMS나 Hugo, Jekyll 같은 정적 사이트 생성기, 심지어 Next.js를 쓸 수도 있었어요. 하지만 이 접근을 고른 이유는 이렇습니다.

- **단순함**: Markdown으로 쓰고 GitHub에 푸시하면 온라인이에요
- **완전한 통제**: CMS나 데이터베이스 의존성 없어요
- **성능**: Vite + React = 빠른 불러오기
- **유연함**: Markdown과 HTML을 원하는 대로 섞을 수 있어요
- **학습**: React와 TypeScript를 익히는 훌륭한 프로젝트예요
- **CI/CD**: GitHub Actions로 품질 검사와 배포 자동화예요

## 결론

이 블로그는 단순하지만 잘 생각된 프로젝트예요. 콘텐츠는 Markdown, 렌더링은 React, 성능은 Vite, CI와 CD는 GitHub Actions, 호스팅은 GitHub Pages. 효율적으로 서빙되는 정적 파일에만 기대고, 매 푸시마다 품질을 보장하는 자동 파이프라인이 있어요.


읽어 주셔서 감사하고, 다음 글에서 만나요! 🦊
