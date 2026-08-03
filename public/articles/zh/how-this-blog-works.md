---
title: 这个博客是如何运作的？
description: 深入解析这个博客的内部架构：React、Vite、Markdown、CI/CD 流水线和文章写作流程。
date: 2026-03-08
aiGenerated: true
authors:
  - fox3000foxy
tags:
  - react
  - meta
  - blog
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "Npao7ZA4M+mh3BW8vW3eqIAzTRE43Y8x6O7Y7UaAnFlsXxcptXIYm+PTPkAkueImJw8KOa86CcWSrFVVbxsCkg=="
---

# 这个博客是如何运作的？

想知道这个博客在底层是如何运作的吗？在这篇文章中，我会带你了解整个应用的架构，从技术栈到写文章的全流程。没错，我甚至还会展示我是如何从 VS Code 里写文章的！

## 技术栈

这个博客是用现代 Web 技术构建的：

- **React 19** -- 用户界面
- **TypeScript** -- 类型安全、更可靠的代码
- **Vite** -- 超快的构建工具
- **React Router v7** -- 页面导航
- **react-markdown** -- 将 Markdown 转换为 HTML
- **rehype-raw + rehype-sanitize** -- 在 Markdown 中安全使用原始 HTML

一切托管在 **GitHub Pages** 上，直接从 `fox3000foxy/blog` 仓库部署。

## 项目结构

这是项目的目录树：

![](assets/how-this-blog-works/project-structure.png)

```
├── .github/
│   └── workflows/
│       └── deploy.yml        ← CI/CD 流水线
├── public/
│   ├── home.md               ← 首页内容
│   ├── portfolio.md           ← 作品集内容
│   └── articles/
│       ├── index.json         ← 所有文章的列表
│       ├── hello-world.md     ← 一篇文章
│       ├── how-this-blog-works.md  ← 就是这篇文章！
│       └── assets/            ← 文章配图
├── src/
│   ├── main.tsx               ← React 入口
│   ├── App.tsx                ← 主路由器
│   ├── components/
│   │   ├── Header.tsx         ← 导航栏
│   │   └── Footer.tsx         ← 页脚
│   └── pages/
│       ├── Home.tsx           ← 首页
│       ├── BlogList.tsx       ← 文章列表
│       ├── Article.tsx        ← 文章阅读器
│       ├── Portfolio.tsx      ← 作品集页面
│       └── NotFound.tsx       ← 404 页面
└── vite.config.ts             ← Vite 配置
```

核心思想很简单：**内容与代码分离**。页面以 Markdown 格式写在 `public/` 文件夹中，`src/` 中的 React 代码负责渲染它们。

## 路由系统

`App.tsx` 使用 React Router 定义了所有应用路由：

![](assets/20260308_153440_image.png)


| 路由 | 页面 | 说明 |
| --------------- | ----------- | --------------------------------------------- |
| `/` | Home | 首页，加载 `home.md` |
| `/blog` | BlogList | 所有文章的列表 |
| `/blog/:slug` | Article | 单篇文章，加载 `articles/{slug}.md` |
| `/portfolio` | Portfolio | 作品集页面，加载 `portfolio.md` |
| `*` | NotFound | 未知 URL 的 404 页面 |

每个页面都有明确的职责：获取 Markdown 文件，用 `react-markdown` 转换为 HTML，然后显示在屏幕上。

## 文章是如何运作的？

这是最有趣的部分！以下是文章的生命周期：

### 1. `index.json` 文件

所有文章都在 `public/articles/index.json` 中引用。每条记录包含文章的元数据：

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

- **slug** -- 唯一标识符，用于 URL（`/blog/hello-world`）
- **title** -- 列表中显示的标题
- **description** -- 简短摘要
- **date** -- 发布日期

### 2. Markdown 文件

文章内容是一个简单的 `.md` 文件，放在 `public/articles/` 中。文件名与 `index.json` 中定义的 `slug` 一致。

![](assets/20260308_153509_image.png)

你可以放任何内容进去：标题、列表、图片、表格，甚至借助 `rehype-raw` 还可以写原始 HTML！

### 3. React 端渲染

当你访问 `/blog/hello-world` 时，会发生以下事情：

1. React Router 从 URL 中提取 `slug` 参数
2. `Article.tsx` 组件获取 `/articles/hello-world.md`
3. `react-markdown` 将 Markdown 转换为 HTML
4. 对 `assets/` 的链接会自动重写为 `/articles/assets/`
5. 同时从 `index.json` 加载元数据以显示日期和描述

就是这么简单！

## 首页和作品集

首页和作品集页面的工作方式完全一样：加载一个 Markdown 文件（`home.md` 或 `portfolio.md`）并渲染为 HTML。

特别之处在于它们使用了一个自定义的清理模式，允许所有 HTML 元素上使用 `class` 和 `style` 属性。这样我就可以在 Markdown 中直接编写带样式的 HTML，比如图片画廊。

## 头部和页脚

头部固定在页面顶部（`position: fixed`）。它包含：

- 我的 GitHub 头像（直接从 `github.com/fox3000foxy.png` 加载）
- 博客标题
- 导航链接：首页、博客、作品集

页脚极简：只有版权信息，年份动态计算。

## 深色主题

网站**始终处于深色模式**----没有亮/暗切换。这是刻意的选择：全局样式中设置了 `color-scheme: dark`，黑色背景 `#000`，白色文字 `#fff`。链接为蓝色（`#64b5f6`），悬停时变为绿色（`#81c784`）。

## 我是如何写文章的

现在来说实际操作部分！以下是我写新文章的工作流：

### 第一步：创建 Markdown 文件

我打开 VS Code，在 `public/articles/` 中创建一个新的 `.md` 文件：

### 第二步：写内容

我直接用 Markdown 写文章内容。VS Code 提供了出色的内置 Markdown 预览：

![](assets/20260308_153613_image.png)

对于图片，我把它们放在 `public/articles/assets/` 中，然后用标准 Markdown 语法引用：

```markdown
![description](assets/my-image.png)
```

`Article.tsx` 组件会自动将 `assets/` 路径重写为 `/articles/assets/`，确保图片正确显示。

### 第三步：在 index.json 中注册文章

文章写完后，我把它添加到 `public/articles/index.json` 中，这样它就会出现在博客列表中：

![](assets/20260308_153629_image.png)

### 第四步：本地测试

我启动 Vite 开发服务器：

```bash
pnpm dev
```

Vite 在毫秒内启动，我可以在 `localhost:5173` 实时查看文章：

![](assets/20260308_153703_image.png)

### 第五步：发布

只需一个 `git push` 就搞定了！CI/CD 流水线会自动处理后续工作。

## CI/CD 部署流水线

我设置了一个完整的 **GitHub Actions** 流水线，每次推送到 `main` 时自动运行代码检查、构建和部署。我们来分解一下。

工作流位于 `.github/workflows/deploy.yml`，分为两个任务：**构建**和**部署**。

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

流水线在每次推送到 `main` 时以及每个针对 `main` 的拉动请求时运行。这意味着 PR 在合并前会经过检查（代码检查+构建），但只有推送到 `main` 才会触发部署。

### 任务 1：构建

构建任务在 `ubuntu-latest` 上运行，包含以下步骤：

1. **检出代码** -- 克隆仓库，包含完整历史（`fetch-depth: 0`）
2. **设置 pnpm** -- 使用 `pnpm/action-setup@v4` 安装最新版 pnpm
3. **设置 Node.js 20** -- 配置 Node，启用 pnpm 缓存以加快安装速度
4. **安装依赖** -- 运行 `pnpm install --frozen-lockfile` 确保可重现构建（不允许更改锁文件）
5. **代码检查** -- 运行 `pnpm run lint`（ESLint）在构建前检查代码质量
6. **构建** -- 运行 `pnpm run build`，先检查 TypeScript 类型（`tsc -b`），然后用 Vite 打包
7. **上传产物** -- 将 `dist/` 文件夹作为构建产物上传，供部署任务使用

如果任何一步失败----代码检查错误、类型错误、构建错误----整个流水线停止，不会部署任何内容。这样可以防止问题代码上线。

### 任务 2：部署

部署任务仅在以下条件满足时运行：

- 构建任务成功（`needs: build`）
- 事件是**推送**（不是 PR）
- 分支是 **main**

```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

然后它：

1. **下载构建产物** -- 获取构建任务生成的 `dist/` 文件夹
2. **配置 GitHub Pages** -- 设置 Pages 环境
3. **上传到 Pages** -- 打包 `dist/` 文件夹供 GitHub Pages 使用
4. **部署** -- 使用 `actions/deploy-pages@v4` 发布网站

### 全景图

以下是从写作到部署的完整流程：

```
在 VS Code 中写文章
        ↓
   git add & commit
        ↓
      git push
        ↓
  GitHub Actions 触发
        ↓
  ┌─────────────────┐
  │   构建任务       │
  │  1. 检出代码    │
  │  2. 设置 pnpm   │
  │  3. 设置 Node   │
  │  4. 安装依赖    │
  │  5. 代码检查 ✓  │
  │  6. 构建 ✓      │
  │  7. 上传 dist   │
  └────────┬────────┘
           ↓
  ┌─────────────────┐
  │  部署任务       │
  │  1. 下载产物    │
  │  2. 配置        │
  │  3. 上传        │
  │  4. 部署 🚀     │
  └─────────────────┘
           ↓
    在 GitHub Pages 上线！
```

从推送到上线，整个过程大约需要一分钟。无需手动部署、无需 FTP、无需 SSH----只需 `git push` 就完成了。

## 生产构建

在底层，`pnpm build` 命令运行：

1. `tsc -b` -- 检查 TypeScript 类型
2. `vite build` -- 打包和优化所有代码

Vite 生成经过压缩和优化的文件，并自动进行代码分割。最终成果是一个极快的静态网站。

## 为什么选择这种架构？

我本可以使用 CMS、像 Hugo 或 Jekyll 这样的静态站点生成器，甚至 Next.js。但我选择这个方案的原因如下：

- **简单** -- 用 Markdown 写，推送到 GitHub，自动上线
- **完全掌控** -- 不依赖 CMS 或数据库
- **性能** -- Vite + React = 加载飞快
- **灵活** -- 我可以随意混用 Markdown 和 HTML
- **学习** -- 这是一个掌握 React 和 TypeScript 的好项目
- **CI/CD** -- 通过 GitHub Actions 实现自动化质量检查和部署

## 总结

这个博客虽然简单，但经过精心设计：Markdown 负责内容，React 负责渲染，Vite 负责性能，GitHub Actions 负责 CI/CD，GitHub Pages 负责托管。没有数据库，没有后端服务器，只有高效提供的静态文件，以及每次推送时保证质量的自动化流水线。

如果你想创建类似架构的博客，欢迎查看 [GitHub 上的源代码](https://github.com/fox3000foxy/blog)！

感谢阅读，下篇文章见！🦊
