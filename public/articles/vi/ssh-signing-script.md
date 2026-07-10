---
title: Script ký commit SSH được giải thích
description: Phân tích helper ký commit SSH và tại sao tôi muốn commit có phong cách.
date: 2026-03-08
aiGenerated: true
tags:
  - git
  - security
  - shell
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA=="
author_sig: "MEUCIQCoZ9ann9Y0LIcAT5m7nnCoSzlC68O4kkjepd//fvHHbwIgTDwwQbbOOzU2By4Ds8xaupQKxNl5pZGWkKguN7v73OQ="
---

# Script ký commit SSH -- giải thích chi tiết

Bài viết này phân tích script `setup-ssh-signing.sh` mà tôi đã đăng trên [Gist](https://gist.github.com/fox3000foxy/95500d129cd4bf5c173c323d2492569a). Chúng ta sẽ xem từng phần làm gì, cách nó giúp việc ký SSH trong một kho lưu trữ cục bộ trở nên hoàn toàn dễ dàng, và, đúng vậy, tại sao tôi lại mất công viết nó (spoiler: tôi chỉ muốn commit của mình trông **ngầu** thôi).

## Động lực

Tôi luôn thích mày mò workflow Git của mình, và sau khi thấy người khác có huy hiệu « Verified » nhỏ xinh bên cạnh commit, tôi tự nhủ: sao mình không thử nhỉ? Ký GPG tích hợp sẵn thì nặng nề và mang tính toàn cục, nên cuối cùng tôi đã viết một helper nhỏ có thể:

- tạo một khoá SSH riêng để ký,
- chỉ cấu hình kho lưu trữ hiện tại,
- tuỳ chọn viết lại lịch sử để ký các commit cũ,
- và cho phép mang khoá giữa các máy.

Thú thật, nhu cầu chủ yếu là để làm đẹp. Không có yêu cầu kỹ thuật nào về chữ ký trong các dự án cá nhân của tôi, nhưng thấy một huy hiệu xanh « Verified » trên commit thì cũng oách lắm, và viết script này cũng là một niềm vui với shell.

> Ừ thì, ký commit cũng giống như mặc áo khoác da đi review code -- hoàn toàn vô dụng, nhưng làm bạn có cảm giác như một hacker.

## Script làm gì

Script là một file Bash duy nhất với `set -euo pipefail` ở đầu để lỗi là dừng ngay. Đây là tóm tắt những gì nó làm:

1. **Tạo hoặc nhập khoá ký**  
   Khoá được đặt trong `.git-signing/` ở thư mục bạn chạy script.
2. **Cấu hình Git cục bộ**  
   Nó đặt `gpg.format=ssh`, `user.signingkey`, `commit.gpgsign=true`, `tag.gpgSign=true`, và `allowedSignersFile` trỏ tới khoá công khai.
3. **Quản lý khoá giữa các máy**  
   Nhờ `--export-keys` / `--import-keys`, bạn có thể mang khoá riêng từ máy này sang máy khác mà không cần động tới cấu hình toàn cục.
4. **Viết lại lịch sử tuỳ chọn** (`--resign-all`)  
   Viết lại tất cả commit trên mọi nhánh/tag (hoặc chỉ những commit chưa có trong `upstream` đối với fork) và ký lại bằng `-S`, mà không ảnh hưởng đến tác giả khác.
5. **Cờ tiện ích**  
   `--autostash`, `--autopush`, `--commit-date`, `--yes` cho chế độ không tương tác, v.v.
6. **Phát hiện fork và kiểm tra bảo mật**  
   Nó phát hiện remote `upstream`, cảnh báo trước khi viết lại lịch sử, kiểm tra công cụ cần thiết (`git`, `ssh-keygen`, `zip/unzip`), đảm bảo quyền truy cập đúng, và thậm chí tạo bản sao an toàn của khoá nếu quyền filesystem quá thoáng.

Script có tính idempotent: chạy hai lần sẽ không tạo lại khoá hay ghi đè cấu hình hiện có.

## Phân tích từng bước

Dưới đây là một số đoạn mã chính kèm giải thích.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Configure SSH commit signing in a controlled, repo-local way.
# - Key files are created in the directory where this script is launched.
# - Git config is written locally to the current repository only.
```

Phần mở đầu đặt tính bảo mật và ghi lại mục đích. Đoạn tiếp theo phân tích các cờ CLI (`--name`, `--email`, `--repo`, v.v.) bằng vòng lặp `while [[ $# -gt 0 ]]; do case … esac done`. Các trường định danh bắt buộc được kiểm tra sau:

```bash
if [[ -z "$NAME" || -z "$EMAIL" ]]; then
  echo "Error: missing identity. Provide --name and --email." >&2
  exit 1
fi
```

Việc tạo khoá diễn ra trong `$LAUNCH_DIR/.git-signing`. Nếu khoá đã tồn tại, script sẽ để yên; `--import-keys` cho phép nạp thư mục từ file ZIP.

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

Sau khi xác nhận khoá riêng có thể dùng được (`ssh-keygen -Y sign …`), script ghi một file `allowed_signers` nhỏ chứa khoá công khai và đặt cấu hình Git cục bộ:

```bash
git -C "$REPO_DIR" config --local gpg.format ssh
git -C "$REPO_DIR" config --local user.signingkey "$RUNTIME_KEY_PATH"
git -C "$REPO_DIR" config --local gpg.ssh.allowedSignersFile "$ALLOWED_SIGNERS"
git -C "$REPO_DIR" config --local commit.gpgsign true
git -C "$REPO_DIR" config --local tag.gpgSign true
```

Nếu bạn yêu cầu viết lại lịch sử với `--resign-all`, script xây dựng lệnh `git filter-branch` để ký lại các commit đủ điều kiện bằng `-S`. Nó tôn trọng trạng thái fork bằng cách tuỳ chọn bỏ qua các commit đã có trong `upstream`.

Kết quả cuối cùng hiển thị khoá công khai và hướng dẫn thêm nó vào phần **Signing Key** trên GitHub, kèm một công thức kiểm thử nhỏ.

## Tại sao nên ký commit?

Đây là lúc tôi thú nhận rằng tôi không hề cần nó. Kho lưu trữ của tôi không yêu cầu xác thực nguồn gốc cho những gì tôi xuất bản, và tôi cũng không dùng tag đã ký cho bản phát hành. « Tại sao » là:

- vì tôi có thể,
- vì nó đẹp (thấy huy hiệu chưa?),
- vì nó cho tôi cơ hội để thử nghiệm với `git filter-branch` và shell,
- và vì nó là một « tự tay tôi xây dựng » nữa cho blog.

Tóm lại, chỉ để khoe thôi, nhưng đó mới là cái hay khi ta tự mày mò công cụ của mình.

## Ví dụ sử dụng

```bash
# thiết lập ban đầu trong kho lưu trữ hiện tại
chmod +x ./setup-ssh-signing.sh
./setup-ssh-signing.sh --name "Your Name" \
                       --email "you@example.com"

# xuất khoá sang máy khác
./setup-ssh-signing.sh --export-keys ./my-signing-keys.zip

# nhập khoá trên máy thứ hai
./setup-ssh-signing.sh --import-keys ./my-signing-keys.zip --repo ./my-repo \
                       --name "Your Name" --email "you@example.com"

# viết lại lịch sử và đẩy lên
./setup-ssh-signing.sh --repo ./my-repo --name "Your Name" --email "you@example.com" \
                       --resign-all --autostash --autopush --yes
```

## Suy nghĩ cuối cùng

Script này là một tiện ích nhỏ, nhưng nó chứa một vài ý tưởng hay:

- giữ khoá mật mã cục bộ và theo từng kho lưu trữ,
- không bao giờ động tới cấu hình toàn cục trừ khi bạn yêu cầu,
- cung cấp import/export đơn giản và viết lại lịch sử,
- và ghi lại toàn bộ quá trình trong một bài blog, bởi sao không nhỉ.

Nếu bạn muốn thêm chữ ký vào commit của mình, hãy thử nó! Và nếu bạn chỉ ở đây vì phong cách, cũng vậy luôn. 😎
