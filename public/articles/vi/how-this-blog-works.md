---
title: Blog này hoạt động như thế nào ?
description: "Hậu trường của blog: React, Vite, Markdown, pipeline CI/CD và quy trình viết bài."
date: 2026-03-08
aiGenerated: true
authors:
  - fox3000foxy
tags:
  - react
  - meta
  - blog
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "I3ELWCVydzEABep6Bky4E4ESwxqFLso9VsQy5H71KrvVg1UWLqgX8VQ+YkBxlOCBE6pKtQT0qwNbALetEVVW3g=="
---

# Blog Này Hoạt Động Như Thế Nào ?

Bạn đã bao giờ tự hỏi blog này hoạt động ra sao dưới mui xe chưa ? Trong bài viết này, tôi sẽ trình bày chi tiết toàn bộ kiến trúc của ứng dụng, từ stack kỹ thuật cho đến quy trình viết một bài. Và vâng, tôi thậm chí sẽ chỉ cho bạn cách tôi viết bài ngay từ VS Code !

## Stack Kỹ Thuật

Blog này được xây dựng với các công nghệ web hiện đại :

- **React 19** -- cho giao diện người dùng
- **TypeScript** -- cho mã nguồn có kiểu và đáng tin cậy hơn
- **Vite** -- công cụ build siêu nhanh
- **React Router v7** -- cho điều hướng giữa các trang
- **react-markdown** -- để chuyển đổi Markdown thành HTML
- **rehype-raw + rehype-sanitize** -- để cho phép HTML thô trong Markdown một cách an toàn

Toàn bộ được lưu trữ trên **GitHub Pages** trực tiếp từ kho `fox3000foxy.github.io`.

## Cấu Trúc Dự Án

Đây là cây thư mục của dự án :

![](assets/how-this-blog-works/project-structure.png)

```
├── .github/
│   └── workflows/
│       └── deploy.yml              ← Pipeline CI/CD
├── public/
│   ├── home.md                     ← Nội dung trang chủ
│   ├── portfolio.md                ← Nội dung portfolio
│   └── articles/
│       ├── index.json              ← Danh sách tất cả bài viết
│       ├── hello-world.md          ← Một bài viết
│       ├── how-this-blog-works.md  ← Chính bài viết này !
│       └── assets/                 ← Hình ảnh của bài viết
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

Ý tưởng trung tâm rất đơn giản : **nội dung được tách biệt khỏi mã nguồn**. Các trang được viết bằng Markdown trong thư mục `public/`, và mã React trong `src/` đảm nhận việc hiển thị chúng.

## Hệ Thống Định Tuyến

Tệp `App.tsx` định nghĩa tất cả các route của ứng dụng với React Router :

![](assets/20260308_153440_image.png)


| Route         | Trang      | Mô tả                                   |
| --------------- | ----------- | ----------------------------------------- |
| `/`           | Home      | Trang chủ, tải `home.md`                 |
| `/blog`       | BlogList  | Danh sách tất cả bài viết                |
| `/blog/:slug` | Article   | Một bài viết, tải `articles/{slug}.md`   |
| `/portfolio`  | Portfolio | Trang portfolio, tải `portfolio.md`      |
| `*`           | NotFound  | Trang 404 cho các URL không xác định      |

Mỗi trang có một vai trò rõ ràng : nó lấy một tệp Markdown, chuyển đổi thành HTML bằng `react-markdown`, và hiển thị lên màn hình.

## Một Bài Viết Hoạt Động Như Thế Nào ?

Đây là phần thú vị nhất ! Đây là vòng đời của một bài viết :

### 1. Tệp `index.json`

Tất cả bài viết được tham chiếu trong `public/articles/index.json`. Mỗi mục chứa siêu dữ liệu của bài viết :

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

- **slug** -- định danh duy nhất, được dùng trong URL (`/blog/hello-world`)
- **title** -- tiêu đề hiển thị trong danh sách
- **description** -- một tóm tắt ngắn
- **date** -- ngày xuất bản

### 2. Tệp Markdown

Nội dung của bài viết là một tệp `.md` đơn giản trong `public/articles/`. Tên tệp tương ứng với `slug` được định nghĩa trong `index.json`.

![](assets/20260308_153509_image.png)

Bạn có thể đặt bất cứ thứ gì bạn muốn : tiêu đề, danh sách, hình ảnh, bảng biểu, và thậm chí cả HTML thô nhờ `rehype-raw` !

### 3. Render Phía React

Khi bạn truy cập `/blog/hello-world`, đây là những gì xảy ra :

1. React Router lấy tham số `slug` từ URL
2. Component `Article.tsx` tải `/articles/hello-world.md`
3. Markdown được chuyển đổi thành HTML bởi `react-markdown`
4. Các đường dẫn đến `assets/` được tự động viết lại thành `/articles/assets/`
5. Song song đó, siêu dữ liệu được tải từ `index.json` để hiển thị ngày và mô tả

Đơn giản vậy thôi !

## Trang Chủ và Portfolio

Trang Chủ và Portfolio hoạt động hoàn toàn giống nhau : chúng tải một tệp Markdown (`home.md` hoặc `portfolio.md`) và render thành HTML.

Điểm đặc biệt là chúng sử dụng một lược đồ sanitization tùy chỉnh cho phép các thuộc tính `class` và `style` trên tất cả các phần tử HTML. Điều này cho phép tôi viết HTML có kiểu dáng trực tiếp trong Markdown, chẳng hạn như thư viện ảnh.

## Header và Footer

Header được ghim ở đầu trang với `position: fixed`. Nó chứa :

- Avatar GitHub của tôi (tải trực tiếp từ `github.com/fox3000foxy.png`)
- Tiêu đề blog
- Các liên kết điều hướng : Trang chủ, Blog, Portfolio

Footer rất tối giản : chỉ là bản quyền với năm hiện tại được tính động.

## Chế Độ Tối

Trang web **luôn ở chế độ tối** -- không có nút chuyển ngày/đêm. Đó là một lựa chọn có chủ đích : `color-scheme: dark` được định nghĩa trong các style toàn cục, với nền đen `#000` và chữ trắng `#fff`. Các liên kết có màu xanh lam (`#64b5f6`) và chuyển sang màu xanh lá khi di chuột (`#81c784`).

## Cách Tôi Viết Một Bài Viết

Chuyển sang thực hành nào ! Đây là quy trình làm việc của tôi để viết một bài viết mới :

### Bước 1 : Tạo Tệp Markdown

Tôi mở VS Code và tạo một tệp `.md` mới trong `public/articles/` :

### Bước 2 : Viết Nội Dung

Tôi viết nội dung bài viết trực tiếp bằng Markdown. VS Code có tính năng xem trước Markdown tích hợp rất tốt :

![](assets/20260308_153613_image.png)

Đối với hình ảnh, tôi đặt chúng trong `public/articles/assets/` và tham chiếu bằng cú pháp Markdown tiêu chuẩn :

```markdown
![description](assets/my-image.png)
```

Component `Article.tsx` tự động viết lại đường dẫn `assets/` thành `/articles/assets/` để hình ảnh hiển thị chính xác.

### Bước 3 : Đăng Ký Bài Viết trong index.json

Sau khi hoàn thành bài viết, tôi thêm nó vào `public/articles/index.json` để nó xuất hiện trong danh sách blog :

![](assets/20260308_153629_image.png)

### Bước 4 : Kiểm Tra Cục Bộ

Tôi chạy máy chủ phát triển Vite :

```bash
pnpm dev
```

Vite khởi động trong vài mili giây và tôi có thể thấy bài viết của mình trong thời gian thực tại `localhost:5173` :

![](assets/20260308_153703_image.png)

### Bước 5 : Xuất Bản

Chỉ cần `git push` là đủ ! Pipeline CI/CD sẽ tự động xử lý phần còn lại.

## Pipeline Triển Khai CI/CD

Tôi đã thiết lập một pipeline **GitHub Actions** hoàn chỉnh giúp tự động hóa việc lint, build và triển khai trang web mỗi khi push lên `main`. Hãy xem chi tiết nào.

Workflow nằm trong `.github/workflows/deploy.yml` và được chia thành hai job : **build** và **deploy**.

### Bộ Kích Hoạt

```yaml
on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
```

Pipeline chạy mỗi khi **push** lên `main` và mỗi **pull request** nhắm vào `main`. Các PR được kiểm tra (lint + build) trước khi merge, nhưng chỉ các push lên `main` mới kích hoạt triển khai.

### Job 1 : Build

Job build chạy trên `ubuntu-latest` và thực hiện các bước sau :

1. **Checkout** -- Clone kho với toàn bộ lịch sử (`fetch-depth: 0`)
2. **Setup pnpm** -- Cài đặt phiên bản pnpm mới nhất với `pnpm/action-setup@v4`
3. **Setup Node.js 20** -- Cấu hình Node với bộ nhớ đệm pnpm đã được kích hoạt để cài đặt nhanh hơn
4. **Install dependencies** -- Chạy `pnpm install --frozen-lockfile` để đảm bảo các bản build có thể tái tạo (không cho phép sửa đổi lockfile)
5. **Lint** -- Chạy `pnpm run lint` (ESLint) để kiểm tra chất lượng mã trước khi build
6. **Build** -- Chạy `pnpm run build`, trước tiên kiểm tra kiểu TypeScript (`tsc -b`) sau đó bundle mọi thứ với Vite
7. **Upload artifact** -- Tải lên thư mục `dist/` như một artifact build cho job triển khai

Nếu bất kỳ bước nào thất bại -- lỗi lint, kiểu hay build -- toàn bộ pipeline dừng lại và không có gì được triển khai. Điều này bảo vệ trang web production khỏi mã hỏng.

### Job 2 : Deploy

Job triển khai chỉ chạy nếu :

- Job build đã thành công (`needs: build`)
- Sự kiện là **push** (không phải PR)
- Nhánh là **main**

```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

Sau đó nó tiến hành :

1. **Tải artifact build** -- Lấy thư mục `dist/` được tạo bởi job build
2. **Cấu hình GitHub Pages** -- Thiết lập môi trường Pages
3. **Tải lên Pages** -- Chuẩn bị thư mục `dist/` cho GitHub Pages
4. **Triển khai** -- Xuất bản trang web với `actions/deploy-pages@v4`

### Bảng Tổng Quan Đầy Đủ

Đây là những gì xảy ra từ lúc viết đến khi triển khai :

```
Viết bài trong VS Code
         ↓
   git add & commit
         ↓
      git push
         ↓
 GitHub Actions được kích hoạt
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

Toàn bộ quy trình mất khoảng một phút từ lúc push đến khi lên mạng. Không triển khai thủ công, không FTP, không SSH -- chỉ cần `git push` và xong.

## Build cho Production

Dưới mui xe, lệnh `pnpm build` thực thi :

1. `tsc -b` -- Kiểm tra kiểu TypeScript
2. `vite build` -- Bundle và tối ưu hóa toàn bộ mã nguồn

Vite tạo ra các tệp đã được minify và tối ưu hóa với tính năng code-splitting tự động. Kết quả là một trang web tĩnh siêu nhanh.

## Tại Sao Kiến Trúc Này ?

Tôi đã có thể dùng CMS, một trình tạo trang web tĩnh như Hugo hay Jekyll, hoặc thậm chí Next.js. Nhưng đây là lý do tôi chọn cách tiếp cận này :

- **Đơn giản** -- Viết Markdown, push lên GitHub, là lên mạng
- **Kiểm soát hoàn toàn** -- Không phụ thuộc vào CMS hay cơ sở dữ liệu
- **Hiệu năng** -- Vite + React = tải nhanh
- **Linh hoạt** -- Tôi có thể kết hợp Markdown và HTML tùy ý
- **Học tập** -- Đây là một dự án tuyệt vời để làm chủ React và TypeScript
- **CI/CD** -- Kiểm tra chất lượng và triển khai tự động với GitHub Actions

## Kết Luận

Blog này là một dự án đơn giản nhưng được thiết kế tốt : Markdown cho nội dung, React cho render, Vite cho hiệu năng, GitHub Actions cho CI/CD, và GitHub Pages cho lưu trữ. Không cơ sở dữ liệu, không máy chủ backend, chỉ là các tệp tĩnh được phục vụ hiệu quả với một pipeline tự động đảm bảo chất lượng mỗi lần push.

Nếu bạn muốn tạo blog riêng với kiến trúc tương tự, đừng ngần ngại xem [mã nguồn trên GitHub](https://github.com/fox3000foxy/fox3000foxy.github.io) !

Cảm ơn bạn đã đọc, và hẹn gặp lại trong bài viết tiếp theo ! 🦊
