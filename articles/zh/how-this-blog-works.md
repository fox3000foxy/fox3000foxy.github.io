---
title: 这个博客是怎么运转的？
description: 博客的幕后：React、Vite、Markdown、CI/CD 流水线和写作流程。
date: 2026-03-08
aiGenerated: true
tags:
  - react
  - meta
  - blog
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "+Sp0mddmCzxzZMH1la/9sKn2JkWeEo5gM6/5ft+UqOuVrS+W/l0215ji1aMY7hxVs//O19B89MwnDE+2u2sNZg=="
---

# 这个博客是怎么运转的？

你有没有好奇过这个博客在幕后是怎么工作的？在这篇文章里，我会把整个应用的架构拆开给你看，从技术栈到写一篇文章的完整流程。是的，我还会告诉你我是如何在 VS Code 里写文章的！

## 技术栈

这个博客用现代网页技术搭建：

- **React 19**：用户界面
- **TypeScript**：类型更可靠的代码
- **Vite**：超快的构建工具
- **React Router v7**：页面导航
- **react-markdown**：把 Markdown 转成 HTML
- **rehype-raw + rehype-sanitize**：在 Markdown 里安全地使用原生 HTML

## 项目结构

项目目录长这样：

![](assets/how-this-blog-works/project-structure.png)

```
├── .github/
│   └── workflows/
│       └── deploy.yml              ← CI/CD 流水线
├── public/
│   ├── home.md                     ← 首页内容
│   ├── portfolio.md                ← 作品集内容
│   └── articles/
│       ├── index.json              ← 全部文章列表
│       ├── hello-world.md          ← 一篇文章
│       ├── how-this-blog-works.md  ← 就是这篇！
│       └── assets/                 ← 文章图片
├── src/
│   ├── main.tsx                    ← React 入口
│   ├── App.tsx                     ← 主路由
│   ├── components/
│   │   ├── Header.tsx              ← 导航栏
│   │   └── Footer.tsx              ← 页脚
│   └── pages/
│       ├── Home.tsx                ← 首页
│       ├── BlogList.tsx            ← 文章列表
│       ├── Article.tsx             ← 文章阅读器
│       ├── Portfolio.tsx           ← 作品集页
│       └── NotFound.tsx            ← 404 页
└── vite.config.ts                  ← Vite 配置
```

核心思路很简单：**内容和代码分离**。页面用 `public/` 里的 Markdown 写，`src/` 里的 React 代码负责展示。我坚持这种分离：内容容易重读，代码容易演进。

## 路由系统

`App.tsx` 用 React Router 定义了全部路由：

![](assets/20260308_153440_image.png)


| 路由         | 页面      | 说明                                |
| --------------- | ----------- | -------------------------------------------- |
| `/`           | Home      | 首页，加载 `home.md`            |
| `/blog`       | BlogList  | 全部文章列表                  |
| `/blog/:slug` | Article   | 单篇文章，加载 `articles/{slug}.md`     |
| `/portfolio`  | Portfolio | 作品集页，加载 `portfolio.md`       |
| `*`           | NotFound  | 未知 URL 的 404 页            |

每个页面职责明确：取一个 Markdown 文件，用 `react-markdown` 转成 HTML，再显示出来。

## 一篇文章是怎么工作的？

这是我最喜欢的部分！下面是一篇文章的生命周期：

### 1. `index.json` 文件

所有文章都在 `public/articles/index.json` 里登记。每条记录是文章的元数据：

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

- **slug**：唯一标识，用在 URL 里（`/blog/hello-world`）
- **title**：列表里显示的标题
- **description**：一句话简介
- **date**：发布日期

### 2. Markdown 文件

文章正文就是 `public/articles/` 里的一个 `.md` 文件。文件名对应 `index.json` 里的 `slug`。

![](assets/20260308_153509_image.png)

里面想写什么都行：标题、列表、图片、表格，甚至靠 `rehype-raw` 写原生 HTML！

### 3. React 端渲染

当你访问 `/blog/hello-world` 时，会发生这些事：

1. React Router 从 URL 里取出 `slug` 参数
2. `Article.tsx` 组件加载 `/articles/hello-world.md`
3. Markdown 被 `react-markdown` 转成 HTML
4. 指向 `assets/` 的链接被自动重写为 `/articles/assets/`，图片才能正常显示
5. 同时从 `index.json` 加载元数据，显示日期和简介

就这么简单！

## 首页和作品集页

首页和作品集页的原理完全一样：加载一个 Markdown 文件（`home.md` 或 `portfolio.md`）再渲染成 HTML。

特别之处在于，它们用的消毒 schema 是定制的，允许所有 HTML 元素带 `class` 和 `style` 属性。这样我可以直接在 Markdown 里写带样式的 HTML，比如图片画廊。

## 页眉和页脚

页眉用 `position: fixed` 固定在顶部，包含：

- 我的 GitHub 头像（直接从 `github.com/fox3000foxy.png` 加载）
- 博客标题
- 导航链接：首页、博客、作品集

页脚极简：只有一个用当前年份动态计算的版权行。

## 深色主题

全站永远是深色模式。我是故意这样选的，为了晚上阅读舒服：全局样式里写了 `color-scheme: dark`，背景纯黑 `#000`，文字纯白 `#fff`。链接是蓝色（`#64b5f6`），悬停变绿（`#81c784`）。

## 我怎么写文章

进入实战！下面是我写一篇新文章的工作流：

### 第 1 步：创建 Markdown 文件

打开 VS Code，在 `public/articles/` 里新建一个 `.md` 文件：

### 第 2 步：写正文

直接用 Markdown 写正文。VS Code 自带的 Markdown 预览很好用：

![](assets/20260308_153613_image.png)

图片放在 `public/articles/assets/` 里，用标准 Markdown 语法引用：

```markdown
![description](assets/my-image.png)
```

`Article.tsx` 组件会自动把 `assets/` 路径重写为 `/articles/assets/`，图片就能正常显示。

### 第 3 步：在 index.json 里登记文章

文章写完后，把它加进 `public/articles/index.json`，它才会出现在博客列表里：

![](assets/20260308_153629_image.png)

### 第 4 步：本地测试

启动 Vite 开发服务器：

```bash
pnpm dev
```

Vite 几毫秒就起来了，我在 `localhost:5173` 上实时看文章。改完立刻能看到，验证速度极快：

![](assets/20260308_153703_image.png)

### 第 5 步：发布

一个 `git push` 就够了！剩下的全交给 CI/CD 流水线自动处理。

## CI/CD 部署流水线

我搭了一条完整的 **GitHub Actions** 流水线，每次 push 到 `main` 就自动做 lint、构建和部署。来细看一下。

工作流在 `.github/workflows/deploy.yml` 里，分成两个 job：**build** 和 **deploy**。

### 触发条件

```yaml
on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
```

每次 **push** 到 `main`、每次指向 `main` 的** pull request** 都会触发流水线。PR 先被验证（lint + build）再合并，只有 push 到 `main` 才会真正部署。

### Job 1：Build

构建 job 跑在 `ubuntu-latest` 上，步骤如下：

1. **Checkout**：克隆仓库，带完整历史（`fetch-depth: 0`）
2. **Setup pnpm**：用 `pnpm/action-setup@v4` 装最新版 pnpm
3. **Setup Node.js 20**：配置 Node，并打开 pnpm 缓存让安装更快
4. **Install dependencies**：跑 `pnpm install --frozen-lockfile`，保证构建可复现（不允许改 lockfile）
5. **Lint**：跑 `pnpm run lint`（ESLint），构建前先查代码质量
6. **Build**：跑 `pnpm run build`，先做 TypeScript 类型检查（`tsc -b`），再用 Vite 打包
7. **Upload artifact**：把 `dist/` 目录作为构建产物上传，供部署 job 用

任何一步失败（lint、类型或构建报错），整条流水线停下，什么都不部署。这道防线让我每次 push 都很安心。

### Job 2：Deploy

部署 job 只在满足以下条件时跑：

- 构建 job 成功（`needs: build`）
- 事件是 **push**（不是 PR）
- 分支是 **main**

```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

它接着做：

1. **下载构建产物**：取回构建 job 产出的 `dist/` 目录
2. **配置 GitHub Pages**：准备 Pages 环境
3. **上传到 Pages**：把 `dist/` 目录准备好给 GitHub Pages
4. **部署**：用 `actions/deploy-pages@v4` 发布站点

### 完整全景

从写作到上线是这样的：

```
在 VS Code 里写文章
          ↓
     git add & commit
          ↓
        git push
          ↓
    GitHub Actions 触发
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
      在 GitHub Pages 上线！
```

从 push 到上线，整个过程大约一分钟。我只管 `git push`，剩下全自动，不用 FTP 也不用 SSH。

## 生产构建

底层 `pnpm build` 其实执行了：

1. `tsc -b`：检查 TypeScript 类型
2. `vite build`：打包并优化全部代码

Vite 产出压缩优化过的文件，还带自动代码分割。最终是一个超快的纯静态站。

## 为什么选这个架构？

我本可以用 CMS、Hugo/Jekyll 这类静态站生成器，甚至 Next.js。但我选这个方案的原因是：

- **简单**：用 Markdown 写，push 到 GitHub，就上线了
- **完全可控**：不依赖任何 CMS 或数据库
- **性能**：Vite + React = 加载飞快
- **灵活**：Markdown 和 HTML 想怎么混就怎么混
- **学习**：这是个掌握 React 和 TypeScript 的好项目
- **CI/CD**：GitHub Actions 自动做质量检查和部署

## 结语

这个博客是个简单但用心的项目：Markdown 管内容，React 管渲染，Vite 管性能，GitHub Actions 管 CI/CD，GitHub Pages 管托管。全靠高效 served 的静态文件，加一条每次 push 自动保驾的流水线。

感谢阅读，下篇文章见！🦊
