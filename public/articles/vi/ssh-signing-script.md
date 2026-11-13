---
title: Script ký SSH giải thích
description: Mổ xẻ helper ký commit SSH và vì sao tôi muốn commit thật ngầu.
date: 2026-03-08
aiGenerated: true
tags:
  - git
  - security
  - shell
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "sKU1Xh6B3I/TukCgtekVz//cxGuQNcxDfg9zBU3LykwNF2vlN4FOjO1rrrGdz0IzBZNkLDtI4JKEsDDu9QpRpg=="
---

# Script ký SSH cho commit -- giải thích

Bài này mổ xẻ script `setup-ssh-signing.sh` mà tôi đã đăng trên [Gist](https://gist.github.com/fox3000foxy/95500d129cd4bf5c173c323d2492569a). Ta sẽ xem mỗi phần làm gì, cách nó khiến việc ký SSH cục bộ cho một repo trở nên hoàn toàn dễ dàng, và, đúng vậy, vì sao tôi lại bỏ công viết nó (spoiler : tôi chỉ muốn commit của mình trông thật **ngầu**).

## Động lực

Tôi luôn thích vọc workflow Git của mình, và sau khi thấy mọi người có huy hiệu « Verified » nhỏ bên cạnh commit, tôi tự nhủ : sao mình lại không? Chữ ký GPG tích hợp thì nặng nề và toàn cục, nên cuối cùng tôi viết một helper nhỏ :

- tạo một khóa SSH chuyên để ký,
- chỉ cấu hình repo hiện tại,
- có thể viết lại lịch sử để ký các commit cũ,
- và cho phép mang khóa theo giữa các máy.

Thật lòng, nhu cầu chủ yếu là phù phiếm. Các dự án cá nhân của tôi không áp đặt yêu cầu ký nào, nhưng thấy huy hiệu xanh « Verified » trên commit cũng có hiệu ứng riêng, và viết script này bằng shell khiến tôi thực sự vui.

> Thôi nào, ký commit cũng giống như mặc áo khoác da đi review code -- hoàn toàn vô dụng, nhưng cho bạn cảm giác mình là hacker.

## Script làm gì

Script là một tệp Bash duy nhất với `set -euo pipefail` ở đầu để dừng thực thi ngay lỗi đầu tiên. Đây là tóm tắt những gì nó làm :

1. **Tạo hoặc nhập khóa ký**
   Khóa nằm trong `.git-signing/` ở thư mục nơi bạn chạy script.
2. **Cấu hình Git cục bộ**
   Nó đặt `gpg.format=ssh`, `user.signingkey`, `commit.gpgsign=true`, `tag.gpgSign=true`, và một `allowedSignersFile` trỏ tới khóa công khai.
3. **Quản lý khóa giữa các máy**
   Nhờ `--export-keys` / `--import-keys`, bạn có thể chuyển khóa riêng từ máy này sang máy khác mà không đụng tới config toàn cục.
4. **Viết lại lịch sử tùy chọn** (`--resign-all`)
   Viết lại mọi commit của mọi nhánh/tag (hoặc chỉ những commit không nằm trong `upstream` với fork) và ký lại chúng bằng `-S`, không đụng tới các tác giả khác.
5. **Cờ tiện ích**
   `--autostash`, `--autopush`, `--commit-date`, `--yes` cho chế độ không tương tác, v.v.
6. **Phát hiện fork và kiểm tra bảo mật**
   Nó phát hiện remote `upstream`, cảnh báo trước khi viết lại lịch sử, kiểm tra các công cụ cần thiết (`git`, `ssh-keygen`, `zip/unzip`), đảm bảo quyền đúng, và thậm chí tạo bản sao an toàn của khóa nếu quyền filesystem quá thoáng.

Script có tính idempotent : chạy hai lần không tạo lại khóa và không ghi đè config hiện có.

## Diễn tiến từng bước

Dưới đây là vài đoạn mã chính kèm giải thích.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Configure SSH commit signing in a controlled, repo-local way.
# - Key files are created in the directory where this script is launched.
# - Git config is written locally to the current repository only.
```

Phần đầu đặt tính bảo mật và ghi lại mục tiêu. Đoạn tiếp theo phân tích tùy chọn CLI (`--name`, `--email`, `--repo`, v.v.) bằng vòng lặp `while [[ $# -gt 0 ]]; do case … esac done`. Các trường danh tính bắt buộc được kiểm tra sau :

```bash
if [[ -z "$NAME" || -z "$EMAIL" ]]; then
  echo "Error: missing identity. Provide --name and --email." >&2
  exit 1
fi
```

Tạo khóa diễn ra trong `$LAUNCH_DIR/.git-signing`. Nếu khóa đã tồn tại, script giữ nguyên; `--import-keys` cho phép đổ đầy thư mục từ một ZIP.

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

Sau khi kiểm tra khóa riêng dùng được (`ssh-keygen -Y sign …`), script ghi một tệp `allowed_signers` chứa khóa công khai và đặt config Git cục bộ :

```bash
git -C "$REPO_DIR" config --local gpg.format ssh
git -C "$REPO_DIR" config --local user.signingkey "$RUNTIME_KEY_PATH"
git -C "$REPO_DIR" config --local gpg.ssh.allowedSignersFile "$ALLOWED_SIGNERS"
git -C "$REPO_DIR" config --local commit.gpgsign true
git -C "$REPO_DIR" config --local tag.gpgSign true
```

Nếu bạn yêu cầu viết lại lịch sử với `--resign-all`, script dựng một lệnh `git filter-branch` ký lại các commit đủ điều kiện bằng `-S`. Nó tôn trọng trạng thái fork bằng cách tùy chọn bỏ qua các commit đã có trong `upstream`.

Kết quả cuối hiển thị khóa công khai và hướng dẫn thêm nó vào mục **Signing Key** của GitHub, kèm công thức test.

## Vì sao ký commit?

Đây là lúc tôi thú nhận mình không cần nó. Các repo của tôi không đòi hỏi xuất xứ nào cho những gì tôi đăng, và tôi không dùng tag ký cho release. Cái « vì sao » là :

- vì tôi có thể,
- vì nó đẹp (bạn thấy huy hiệu chưa?),
- vì nó cho tôi cớ thử nghiệm với `git filter-branch` và shell,
- và vì đó là thêm một « tôi tự xây cái này » cho blog.

Tóm lại, chỉ để khoe thôi, nhưng đó là điều tôi thích khi vọc công cụ của mình.

## Ví dụ dùng

```bash
# thiết lập ban đầu trong repo hiện tại
chmod +x ./setup-ssh-signing.sh
./setup-ssh-signing.sh --name "Your Name" \
                       --email "you@example.com"

# xuất khóa sang máy khác
./setup-ssh-signing.sh --export-keys ./my-signing-keys.zip

# nhập khóa trên máy thứ hai
./setup-ssh-signing.sh --import-keys ./my-signing-keys.zip --repo ./my-repo \
                       --name "Your Name" --email "you@example.com"

# viết lại lịch sử và đẩy
./setup-ssh-signing.sh --repo ./my-repo --name "Your Name" --email "you@example.com" \
                       --resign-all --autostash --autopush --yes
```

## Suy nghĩ cuối

Script này vẫn là một tiện ích gọn, nhưng nó mang vài nguyên tắc tôi theo :

- giữ khóa mật mã cục bộ và theo từng repo,
- không bao giờ đụng tới config toàn cục trừ khi bạn yêu cầu,
- cung cấp import/export đơn giản và viết lại lịch sử,
- và ghi lại toàn bộ quy trình trong một bài blog để giữ dấu vết tái dùng được.

Nếu bạn muốn thêm chữ ký vào commit của mình, hãy thử nó! Và nếu bạn chỉ tới vì phong cách, cũng vậy. 😎
