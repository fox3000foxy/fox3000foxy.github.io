---
title: Blog này chạy thế nào?
description: "Hậu trường của blog : React, Vite, Markdown, pipeline CI/CD
  và luồng viết bài."
date: 2026-03-08
aiGenerated: true
tags:
  - react
  - meta
  - blog
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "2Z6MsA/SW32fcJnD70EgXHAJlcJN0QO8D1R2IgWuUh98knHOQkgm6GrTTog/TENsYbZYxo3hlEIxyfFFisuSJg=="
---

# Blog Này Chạy Thế Nào?

Bạn từng thắc mắc blog này chạy thế nào dưới nắp capo? Trong bài này, tôi sẽ trình bày chi tiết toàn bộ kiến trúc ứng dụng, từ stack kỹ thuật tới quy trình viết bài. Và đúng, tôi thậm chí sẽ cho bạn thấy tôi viết bài từ VS Code thế nào!

## Stack Kỹ Thuật

Blog này xây bằng công nghệ web hiện đại :

- **React 19** : cho giao diện người dùng
- **TypeScript** : cho mã có kiểu và đáng tin hơn
- **Vite** : làm công cụ build siêu nhanh
- **React Router v7** : cho điều hướng giữa các trang
- **react-markdown** : để biến Markdown thành HTML
- **rehype-raw + rehype-sanitize** : cho phép HTML thô trong Markdown một cách an toàn


## Cấu Trúc Dự Án

Đây là dáng cây thư mục của dự án :

![](assets/how-this-blog-works/project-structure.png)

```
├── .github/
│   └── workflows/
│       └── deploy.yml              ← Pipeline CI/CD
├── public/
│   ├── home.md                     ← Nội dung trang chủ
│   ├── portfolio.md                ← Nội dung portfolio
│   └── articles/
│       ├── index.json              ← Danh sách mọi bài viết
│       ├── hello-world.md          ← Một bài viết
│       ├── how-this-blog-works.md  ← Chính bài này!
│       └── assets/                 ← Ảnh của bài viết
├── src/
│   ├── main.tsx                    ← Điểm vào React
│   ├── App.tsx                     ← Router chính
│   ├── components/
│   │   ├── Header.tsx              ← Thanh điều hướng
│   │   └── Footer.tsx              ← Chân trang
│   └── pages/
│       ├── Home.tsx                ← Trang chủ
│       ├── BlogList.tsx            ← Danh sách bài viết
│       ├── Article.tsx             ← Trình đọc bài viết
│       ├── Portfolio.tsx           ← Trang portfolio
│       └── NotFound.tsx            ← Trang 404
└── vite.config.ts                  ← Cấu hình Vite
```

Ý tưởng trung tâm đơn giản : **nội dung tách khỏi mã**. Các trang viết bằng Markdown trong thư mục `public/`, và mã React trong `src/` lo hiển thị chúng. Tôi coi trọng tách biệt này : nó khiến nội dung dễ đọc lại và mã dễ tiến hóa.

## Hệ Thống Định Tuyến

Tệp `App.tsx` định nghĩa mọi route của ứng dụng bằng React Router :

![](assets/20260308_153440_image.png)


| Route         | Trang     | Mô tả                                |
| --------------- | ----------- | -------------------------------------------- |
| `/`           | Home      | Trang chủ, tải `home.md`            |
| `/blog`       | BlogList  | Danh sách mọi bài viết                  |
| `/blog/:slug` | Article   | Một bài viết, tải `articles/{slug}.md`     |
| `/portfolio`  | Portfolio | Trang portfolio, tải `portfolio.md`       |
| `*`           | NotFound  | Trang 404 cho URL không biết            |

Mỗi trang có vai trò rõ : nó lấy một tệp Markdown, biến thành HTML bằng `react-markdown`, và hiện lên màn hình.

## Bài Viết Chạy Thế Nào?

Đây là phần tôi thích nhất! Đây là vòng đời của một bài viết :

### 1. Tệp `index.json`

Mọi bài viết được tham chiếu trong `public/articles/index.json`. Mỗi mục chứa metadata của bài viết :

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

- **slug** : định danh duy nhất, dùng trong URL (`/blog/hello-world`)
- **title** : tiêu đề hiện trong danh sách
- **description** : tóm tắt ngắn
- **date** : ngày đăng

### 2. Tệp Markdown

Nội dung bài viết là một tệp `.md` đơn giản trong `public/articles/`. Tên tệp khớp `slug` định nghĩa trong `index.json`.

![](assets/20260308_153509_image.png)

Bạn có thể đặt gì tùy : tiêu đề, danh sách, ảnh, bảng, và cả HTML thô nhờ `rehype-raw`!

### 3. Render Phía React

Khi bạn thăm `/blog/hello-world`, đây là những gì xảy ra :

1. React Router lấy tham số `slug` từ URL
2. Thành phần `Article.tsx` tải `/articles/hello-world.md`
3. Markdown được biến thành HTML bởi `react-markdown`
4. Các link tới `assets/` được tự viết lại thành `/articles/assets/`
5. Song song, metadata được tải từ `index.json` để hiện ngày và mô tả

Đơn giản vậy thôi!

## Trang Chủ và Portfolio

Các trang Chủ và Portfolio chạy đúng cùng cách : chúng tải một tệp Markdown (`home.md` hay `portfolio.md`) và render thành HTML.

Điểm đặc biệt là chúng dùng schema sanitize tùy chỉnh cho phép thuộc tính `class` và `style` trên mọi phần tử HTML. Việc này cho phép tôi viết HTML tạo kiểu trực tiếp trong Markdown, như gallery ảnh chẳng hạn.

## Header và Footer

Header ghim trên đầu trang với `position: fixed`. Nó chứa :

- Avatar GitHub của tôi (tải trực tiếp từ `github.com/fox3000foxy.png`)
- Tiêu đề blog
- Các link điều hướng : Trang chủ, Blog, Portfolio

Footer tối giản : chỉ copyright với năm hiện tại tính động.

## Chủ Đề Tối

Trang luôn ở chế độ tối. Tôi chọn vậy có chủ ý để giữ đọc thoải mái buổi tối : `color-scheme: dark` được đặt trong style toàn cục, với nền đen `#000` và chữ trắng `#fff`. Các link màu xanh (`#64b5f6`) và thành xanh lá khi di chuột (`#81c784`).

## Tôi Viết Bài Thế Nào

Vào thực hành! Đây là workflow của tôi để viết bài mới :

### Bước 1 : Tạo Tệp Markdown

Tôi mở VS Code và tạo tệp `.md` mới trong `public/articles/` :

### Bước 2 : Viết Nội Dung

Tôi viết nội dung bài trực tiếp bằng Markdown. VS Code có xem trước Markdown tích hợp xuất sắc :

![](assets/20260308_153613_image.png)

Với ảnh, tôi đặt chúng trong `public/articles/assets/` và tham chiếu bằng cú pháp Markdown chuẩn :

```markdown
![description](assets/my-image.png)
```

Thành phần `Article.tsx` tự viết lại đường dẫn `assets/` thành `/articles/assets/` để ảnh hiện đúng.

### Bước 3 : Đăng Ký Bài Viết vào index.json

Khi bài xong, tôi thêm nó vào `public/articles/index.json` để nó hiện trong danh sách blog :

![](assets/20260308_153629_image.png)

### Bước 4 : Test Cục Bộ

Tôi chạy máy chủ phát triển Vite :

```bash
pnpm dev
```

Vite khởi động trong vài mili giây và tôi có thể thấy bài thời gian thực trên `localhost:5173`. Tốc độ này cho phép tôi kiểm tra mỗi sửa đổi gần như tức thì :

![](assets/20260308_153703_image.png)

### Bước 5 : Đăng

Một `git push` đơn giản là đủ! Pipeline CI/CD lo phần còn lại tự động.

## Pipeline Triển Khai CI/CD

Tôi đã dựng pipeline **GitHub Actions** đầy đủ tự động hóa lint, build và triển khai trang mỗi lần đẩy lên `main`. Xem chi tiết.

Workflow nằm trong `.github/workflows/deploy.yml` và chia thành hai job : **build** và **deploy**.

### Kích hoạt

```yaml
on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
```

Pipeline chạy mỗi lần **đẩy** lên `main` và mỗi **pull request** nhắm `main`. Các PR vì vậy được kiểm tra (lint + build) trước khi merge, nhưng chỉ các lần đẩy lên `main` mới kích hoạt triển khai.

### Job 1 : Build

Job build chạy trên `ubuntu-latest` và theo các bước :

1. **Checkout** : Clone repo với toàn bộ lịch sử (`fetch-depth: 0`)
2. **Setup pnpm** : Cài bản pnpm mới nhất bằng `pnpm/action-setup@v4`
3. **Setup Node.js 20** : Cấu hình Node với cache pnpm bật để cài nhanh hơn
4. **Install dependencies** : Chạy `pnpm install --frozen-lockfile` để đảm bảo build tái tạo được (không cho sửa lockfile)
5. **Lint** : Chạy `pnpm run lint` (ESLint) để kiểm tra chất lượng mã trước build
6. **Build** : Chạy `pnpm run build`, kiểm tra kiểu TypeScript trước (`tsc -b`) rồi bundle tất cả bằng Vite
7. **Upload artifact** : Tải thư mục `dist/` lên làm artefact build cho job triển khai

Nếu một bước hỏng (lỗi lint, kiểu hay build), toàn bộ pipeline dừng và không gì được triển khai. Chốt này bảo vệ tôi khỏi mã hỏng trong production và tôi tin nó mỗi lần đẩy.

### Job 2 : Deploy

Job triển khai chỉ chạy nếu :

- Job build thành công (`needs: build`)
- Sự kiện là **đẩy** (không phải PR)
- Nhánh là **main**

```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

Sau đó nó tiến hành :

1. **Tải artefact build** : Lấy thư mục `dist/` do job build tạo
2. **Cấu hình GitHub Pages** : Dựng môi trường Pages
3. **Tải lên Pages** : Chuẩn bị thư mục `dist/` cho GitHub Pages
4. **Triển khai** : Đăng trang bằng `actions/deploy-pages@v4`

### Bảng Đầy Đủ

Đây là những gì xảy ra từ viết tới triển khai :

```
Viết bài trong VS Code
          ↓
    git add & commit
          ↓
       git push
          ↓
   GitHub Actions kích hoạt
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
     Trực tuyến trên GitHub Pages !
```

Toàn bộ quá trình mất khoảng một phút giữa đẩy và lên sóng. Tôi đăng bằng `git push` đơn giản, mọi thứ vẫn tự động mà không qua FTP hay SSH.

## Build Production

Dưới nắp capo, lệnh `pnpm build` chạy :

1. `tsc -b` : Kiểm tra kiểu TypeScript
2. `vite build` : Bundle và tối ưu toàn bộ mã

Vite cho ra tệp thu gọn và tối ưu với code-splitting tự động. Kết quả là trang tĩnh siêu nhanh.

## Vì Sao Kiến Trúc Này?

Tôi có thể dùng CMS, trình tạo trang tĩnh như Hugo hay Jekyll, hay thậm chí Next.js. Nhưng đây là lý do tôi chọn cách này :

- **Đơn giản** : Viết bằng Markdown, đẩy lên GitHub, lên sóng
- **Kiểm soát toàn bộ** : Không phụ thuộc CMS hay cơ sở dữ liệu nào
- **Hiệu năng** : Vite + React = tải nhanh
- **Linh hoạt** : Tôi có thể trộn Markdown và HTML tùy ý
- **Học hỏi** : Đó là dự án siêu hay để thành thạo React và TypeScript
- **CI/CD** : Kiểm tra chất lượng và triển khai tự động bằng GitHub Actions

## Kết luận

Blog này là dự án đơn giản mà nghĩ kỹ : Markdown cho nội dung, React cho render, Vite cho hiệu năng, GitHub Actions cho CI/CD, và GitHub Pages cho host. Nó chỉ dựa trên tệp tĩnh phục vụ hiệu quả, với pipeline tự động đảm bảo chất lượng mỗi lần đẩy.


Cảm ơn đã đọc, và hẹn gặp trong bài tiếp theo! 🦊
