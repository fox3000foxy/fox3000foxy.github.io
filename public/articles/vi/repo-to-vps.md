---
title: "Repo to VPS: biến GitHub Actions thành VPS miễn phí với bộ nhớ liên tục"
description: Cách biến một runner GitHub Actions thành VPS vĩnh viễn với git làm bộ nhớ liên tục -- tmate, inotify và commit --amend.
date: 2026-05-29
tags:
  - github
  - devops
  - vps
  - actions
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA=="
author_sig: "MEYCIQCjzv1JfBfer8Dw4lOo1oFSMBo0zjD513Z9xFzXKMcTwwIhALLNurocdTFv7wCFyCtATCx5gebh9duvUrXxL/yBJhgP"
---

## GitHub cho bạn một VPS miễn phí trong 6h. Tôi đã tìm ra cách biến nó thành vĩnh viễn.

GitHub Actions cho bạn máy Linux miễn phí.

Đại loại, máy chủ Ubuntu thật sự. 2 nhân, 7 GB RAM, 14 GB ổ cứng. Miễn phí. Trong 6h mỗi lần chạy.

"Vấn đề" duy nhất: khi kết thúc lượt chạy, mọi thứ đều bị xóa. Máy ảo dùng một lần. Bạn cài đặt, code, cấu hình... và rồi vèo, cuối cùng mọi thứ biến mất. Như chưa từng làm gì.

Trừ khi.

Trừ khi bạn dùng **git làm ổ cứng**.

Và thế là, bỗng nhiên bạn có một VPS miễn phí với ổ cứng bền vững sống sót qua các lượt chạy. Bạn kết nối lại, mọi thứ vẫn còn nguyên. Bạn tiếp tục từ chỗ bạn dừng lại.

Hoàn toàn điên rồ. Để tôi giải thích xD

---

## Bối cảnh: runner GitHub Actions

Khi bạn chạy một workflow GitHub Actions, GitHub cấp cho bạn một VM.

Nó được tạo ra để build code, chạy test, deploy. Workflow chạy, làm việc của nó, và máy ảo bị phá hủy.

Nhưng không gì ngăn bạn làm việc khác với VM này. Ví dụ, mở một shell SSH trên đó và dùng nó như một máy chủ.

Vấn đề là, những máy này **stateless** và **tạm thời**:
- Tạm thời: tối đa 6h mỗi lần chạy (`timeout-minutes: 360`, giới hạn của GitHub)
- Stateless: mọi thứ bị xóa khi kết thúc

Vậy để biến nó thành VPS dùng được, cần giải quyết hai vấn đề:
1. **Làm sao kết nối vào nó theo thời gian thực?**
2. **Làm sao giữ ổ cứng giữa các lượt chạy?**

Đây mới là hack bẩn thỉu.

---

## Vấn đề 1: SSH live với tmate

**tmate** là một nhánh của tmux tạo ra một session SSH có thể chia sẻ.

Bạn chạy nó trên một máy, nó tạo ra hai liên kết:
- một URL SSH (`ssh xxx@nyc1.tmate.io`)
- một URL web (terminal trong trình duyệt)

Bạn kết nối bằng một trong các liên kết đó, và boom, bạn ở trong một shell trên máy. Thời gian thực.

Workflow chạy tmate:

```bash
tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
tmate -S /tmp/tmate.sock set-option -g remain-on-exit on

# lấy các liên kết kết nối
tmate_ssh=$(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}')
tmate_web=$(tmate -S /tmp/tmate.sock display -p '#{tmate_web}')
```

Và những liên kết này được ghi trực tiếp vào README của repo bằng script Python. Bạn mở repo, thấy liên kết kết nối, bạn nhấp vào. Bạn đã ở trong VPS của mình.

Vấn đề đầu tiên đã giải quyết. Nhưng vấn đề thứ hai mới thực sự điên rồ.

---

## Vấn đề 2: git làm ổ cứng

Đây là thứ bệnh hoạn.

Máy bị xóa sau mỗi lượt chạy. Vậy chúng ta lưu trữ **hệ thống tệp tin trong một nhánh git riêng**, gọi là `filesystem`.

Khi khởi động, script khôi phục trạng thái từ nhánh này:

```bash
filesystem_branch="filesystem"

# lấy nhánh filesystem từ remote
git fetch origin "$filesystem_branch":refs/remotes/origin/$filesystem_branch

# khôi phục workspace từ nhánh này
git checkout -B filesystem-workspace "refs/remotes/origin/$filesystem_branch"
git reset --hard "refs/remotes/origin/$filesystem_branch"
```

Nhánh `filesystem` CHÍNH LÀ ổ cứng của bạn. Tệp của bạn, cài đặt của bạn, cấu hình của bạn -- tất cả đều ở trong đó.

Bạn thấy không? Máy dùng một lần, nhưng ổ cứng sống trong git. Bạn chạy lại workflow, ổ cứng được khôi phục, bạn tiếp tục chính xác chỗ bạn đã dừng.

Cứ như VPS ngủ đông. Chỉ khác ngủ đông là một repo git xD

### Lần chạy đầu tiên: tạo ổ cứng trống

Ở lần chạy đầu tiên, nhánh `filesystem` chưa tồn tại. Phải tạo nó. Và điều này không hề đơn giản:

```bash
ensure_filesystem_branch() {
  if ! git ls-remote --exit-code origin "refs/heads/$filesystem_branch" >/dev/null 2>&1; then
    git checkout --orphan filesystem-workspace
    git rm -rf --cached .
    git clean -fdx -e .git -e .github -e .github/scripts -e .github/workflows
    git commit --allow-empty -m "init filesystem (empty)"
    push_filesystem
  fi
}
```

`git checkout --orphan` là chìa khóa. Một nhánh orphan là một nhánh **không có bất kỳ lịch sử nào** -- như thể bạn bắt đầu lại từ một repo trống.

Tại sao orphan? Bởi vì bạn KHÔNG muốn ổ cứng của bạn kéo theo toàn bộ lịch sử code nguồn. Ổ cứng là một thứ riêng, có cuộc sống riêng. Nó bắt đầu trống.

Và `git ls-remote --exit-code` ở đầu, chỉ là một kiểm tra sạch sẽ: "nhánh này đã tồn tại trên remote chưa?". Nếu rồi, không động gì. Nếu chưa, tạo nó. Idempotent, như chúng ta thích.

### Git clean chọn lọc: bảo vệ cache

Dòng này đáng để dừng lại:

```bash
git clean -fdx -e .apt-cache -e .cache -e host.conf -e tmate.sock
```

`git clean -fdx` xóa TẤT CẢ những gì không được git theo dõi. Bình thường nó khá mạnh -- dọn sạch workspace triệt để.

Nhưng các `-e` (exclude) bảo vệ một số thứ:
- `.apt-cache` → cache của gói APT (sẽ quay lại, rất thông minh)
- `.cache` → cache chung
- `host.conf` → địa chỉ SSH của session
- `tmate.sock` → socket của session tmate hiện tại

Nếu bạn dọn những tệp đó, bạn sẽ làm hỏng session hiện tại hoặc mất cache. Vậy nên chúng được tha trong quá trình reset.

Một chi tiết nhỏ nhặt thoạt nhìn, nhưng không có nó mọi thứ đổ vỡ.

---

## Tự động lưu: inotify giám sát mọi thứ

Nhưng, làm thế nào các tệp được đưa vào nhánh `filesystem`?

Câu trả lời: một watcher giám sát TẤT CẢ các thay đổi tệp và tự động commit/push.

Công cụ kỳ diệu là **inotifywait** (từ gói `inotify-tools`). Nó giám sát hệ thống tệp ở cấp kernel và kích hoạt ngay khi một tệp thay đổi.

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock|\.gitignore|\.txt\.swp)(/|$)' .; do
    echo "[autosave] change detected"
    commit_and_push
    sleep 1   # debounce nếu có nhiều thay đổi cùng lúc
  done
}

autosave &
```

Phân tích các flag inotify, vì mỗi cái đều có lý do:
- `-r` → đệ quy, giám sát tất cả thư mục con
- `-e modify,create,delete,move` → phản ứng với 4 loại sự kiện này
- `--exclude '...'` → regex để bỏ qua một số tệp

`--exclude` rất quan trọng. Xem nó bỏ qua gì:
- `.git` → hiển nhiên, nếu không mỗi commit sẽ kích hoạt autosave rồi lại kích hoạt commit... vòng lặp vô hạn. Thảm họa.
- `.apt-cache` và `.cache` → cache, thay đổi liên tục và không muốn spam vào git
- `host.conf` và `tmate.sock` → tệp session, thay đổi không ngừng
- `.gitignore`, `.txt.swp` → tệp tạm thời (`.swp` là tệp soạn thảo của vim)

Nếu không có exclude này, bạn sẽ gặp autosave kích hoạt vòng lặp trên chính các thay đổi của nó. `.git` trong danh sách, đó là DÒNG ngăn bạn tự bắn vào chân mình.

Bạn sửa một tệp? inotify phát hiện ngay lập tức, nó commit, nó push. Trong chưa đầy một giây, thay đổi của bạn đã ở trong nhánh `filesystem`.

Bạn cài một công cụ, bạn viết code, bạn sửa cấu hình -- mọi thứ được lưu trong thời gian thực, tự động, không cần bạn làm gì.

Bạn thực sự có một hệ thống tự động sao lưu toàn bộ ổ cứng. Điên rồ.

### Debounce: không spam git

`sleep 1` sau mỗi lần lưu là một **debounce**.

Khi bạn lưu tệp trong trình soạn thảo, thường có nhiều sự kiện hệ thống tệp phát ra liên tiếp (tạo tệp tạm, rename, xóa tệp cũ...). Không có debounce, bạn sẽ kích hoạt 3-4 commit cho một lần lưu.

`sleep 1` nói: "chờ một giây sau khi lưu, để loạt sự kiện lắng xuống, trước khi lắng nghe lại". Nó gom các thay đổi gần nhau vào một commit duy nhất. Thông minh.

### Và thêm một bản lưu định kỳ

Phòng trường hợp inotify bỏ sót thứ gì, cũng có một bản lưu mỗi 5 giây:

```bash
periodic_save() {
  while true; do
    sync_from_remote   # lấy các thay đổi từ xa nếu có
    sleep 5
    commit_and_push
  done
}

periodic_save &
```

Vừa đai vừa dây treo. Không muốn mất trạng thái ổ cứng.

---

## Chi tiết thông minh: chỉ một commit

Nếu bạn commit mỗi khi tệp thay đổi, bạn sẽ tích lũy hàng ngàn commit. Trong một giờ session, lịch sử git của bạn nổ tung. Repo trở nên khổng lồ. Thật kinh khủng.

Giải pháp rất thanh lịch: **chúng ta amend commit hiện tại** thay vì tạo commit mới.

```bash
commit_and_push() {
  (
    flock -n 200 || return   # lock để hai luồng lưu không chạy cùng lúc

    git add -A
    git reset -- .github/workflows/ .github/scripts/   # đừng động vào scripts

    if ! git diff --cached --quiet; then
      if git rev-parse --verify HEAD >/dev/null 2>&1; then
        git commit --amend --no-edit    # AMEND: ghi đè commit trước đó
      else
        git commit -m "autosave $(date -u +%Y%m%dT%H%M%SZ)"
      fi
      git push --force origin "filesystem-workspace:filesystem"
    fi
  ) 200>/tmp/tmate_autosave.lock
}
```

`git commit --amend` nghĩa là: "thay thế commit cuối cùng bằng commit này".

Vì vậy nhánh `filesystem` LUÔN LUÔN chỉ có một commit. Không quan trọng bạn lưu bao nhiêu lần. Nó chỉ là một snapshot của trạng thái hiện tại, force-push hết lần này đến lần khác.

`flock` là một khóa: vì có hai vòng lặp lưu (inotify + định kỳ), cần tránh chúng chạy git cùng lúc và giẫm lên nhau. Chỉ một tiến trình git tại một thời điểm.

Sạch sẽ.

---

## Sync_from_remote: xử lý nhiều session

Ồ, một thứ bạn không nghĩ tới lúc đầu: nếu bạn chạy HAI lượt cùng lúc thì sao? Hoặc nếu một session sửa nhánh `filesystem` trong khi session khác đang chạy?

Script xử lý việc này bằng `sync_from_remote` trước mỗi commit:

```bash
sync_from_remote() {
  git fetch origin "filesystem":refs/remotes/origin/filesystem
  git merge --ff-only "refs/remotes/origin/filesystem"
}
```

`--ff-only` (fast-forward only) rất quan trọng: nó có nghĩa là "merge CHỈ KHI chúng ta có thể tiến thẳng, không tạo commit merge".

Nếu hai nhánh đã phân nhánh (kiểu, hai session sửa những thứ khác nhau), fast-forward thất bại im lặng (`2>/dev/null || true`) và giữ trạng thái local. Đây không phải hệ thống merge hoàn hảo, nhưng nó tránh hỏng hóc trong trường hợp đơn giản chỉ có một session chạy.

Thành thật, không nên chạy 3 session song song trên cùng một repo. Nhưng code vẫn cố gắng không phát nổ nếu điều đó xảy ra. Đó là phòng vệ.

---

## Cache APT: cài đặt nhanh

Có một chi tiết trong workflow trông không quan trọng nhưng được thiết kế tốt:

```yaml
- name: Cache & install APT packages (tmate + watcher)
  uses: awalsh128/cache-apt-pkgs-action@v1.6.0
  with:
    packages: tmate inotify-tools
```

tmate và inotify-tools được cài qua một action **cache các gói APT**.

Ở lần chạy đầu tiên, nó tải xuống và cài đặt. Ở các lần sau, nó được khôi phục từ cache GitHub Actions -- nhanh hơn, không cần tải lại.

Và bạn nhớ `git clean -fdx -e .apt-cache` lúc nãy không? Có liên quan đấy. Thư mục `.apt-cache` được bảo vệ khỏi dọn dẹp chính xác để các gói bạn cài trong session có thể tồn tại tối thiểu.

Mọi thứ kết nối với nhau. Tôi đã nghĩ về toàn bộ vòng đời.

---

## Các script giấu trong /tmp

Một chi tiết lắt léo nhưng thông minh nữa. Ngay đầu script:

```bash
RUNNER_SCRIPTS_DIR="/tmp/runner-scripts"
rm -rf "$RUNNER_SCRIPTS_DIR"
mkdir -p "$RUNNER_SCRIPTS_DIR"
cp -r .github/scripts "$RUNNER_SCRIPTS_DIR/"
```

Các script (`update_readme.py`, v.v.) được sao chép vào `/tmp` TRƯỚC KHI đụng vào nhánh `filesystem`.

Tại sao? Bởi vì khi bạn làm `git reset --hard` về nhánh `filesystem` (lúc đầu trống, hoặc chứa ổ cứng của bạn), các tệp `.github/scripts` từ repo nguồn biến mất khỏi workspace.

Nhưng script vẫn cần chúng trong session (để cập nhật README mỗi khi tmate khởi động lại). Vậy nên nó giấu chúng trong `/tmp`, ngoài tầm với của git:

```bash
python3 "$RUNNER_SCRIPTS_DIR/scripts/update_readme.py" --ssh "$tmate_ssh" ...
```

Nếu bạn không nghĩ đến điều này, bạn sẽ vật lộn 30 phút để hiểu tại sao script của bạn biến mất. Tôi đã nghĩ đến nó.

---

## Shell tùy chỉnh

Một chút tiện nghi: session cấp cho bạn một shell đã cấu hình, không phải bash trần trụi.

`prestart.sh` sao chép một `.bashrc` tùy chỉnh:

```bash
if ! grep -q "Custom prompt and aliases for remote sessions" "$HOME/.bashrc"; then
  cp .github/scripts/remote_bashrc "$HOME/.bashrc"
fi
sudo cp "$HOME/.bashrc" /root/.bashrc
```

Và `.bashrc` này chứa prompt màu sắc, alias (`ll`, `lla`, `rm -i`), và đặc biệt là ghi đè `exit`:

```bash
exit() {
    killall -9 -u "$(whoami)" tmate 2>/dev/null || true
    builtin exit "$@"
}

# Ctrl+D làm tương tự exit
bind -x '"\C-d": "exit"'
```

Khi bạn gõ `exit` (hoặc Ctrl+D), nó giết sạch các tiến trình tmate trước khi đóng. Tránh để lại các session tmate zombie.

Cũng có hàm `tmate-detach` nếu bạn muốn ngắt kết nối MÀ KHÔNG giết session (để kết nối lại sau). Chi tiết tiện nghi, nhưng cho thấy mức độ chăm chút.

---

## Tmate tự khởi động lại

Tiện nghi nhỏ: nếu bạn gõ `exit` trong shell, bình thường session tmate chết và bạn mất kết nối vĩnh viễn.

Nhưng ở đây, tmate nằm trong vòng lặp `while true`:

```bash
while true; do
  tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
  while tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}' >/dev/null 2>&1; do
    sleep 2
  done
  echo "tmate session ended; restarting..."
done
```

Bạn `exit`? Session tự động khởi động lại. Bạn kết nối lại với cùng liên kết.

Thật điên rồ, nhưng nó làm cho công cụ trở nên dùng được.

---

## Kết nối lại bằng một lệnh

Làm thế nào để kết nối lại sau khi mất kết nối, mà không phải lục tung log của run mỗi lần?

Địa chỉ SSH của tmate được ghi vào tệp `host.conf`, được commit trong nhánh `filesystem`:

```bash
printf '%s' "${tmate_ssh#ssh }" > host.conf
```

Vì tệp này nằm trong git, bạn có thể lấy nó qua API GitHub bằng một lệnh duy nhất:

```bash
ssh "$(gh api -H 'Accept: application/vnd.github.v3.raw' \
  "/repos/USER/REPO/contents/host.conf?ref=filesystem" | tr -d '\r\n')"
```

Bạn chạy lệnh này, nó lấy địa chỉ SSH hiện tại từ repo và kết nối bạn. Kể cả nếu địa chỉ đã thay đổi giữa các session.

---

## Luồng hoàn chỉnh

Tóm lại:

1. Bạn kích hoạt workflow (push hoặc nút thủ công)
2. GitHub cấp cho bạn một VM Ubuntu
3. Script khôi phục ổ cứng từ nhánh "filesystem"
4. inotify bắt đầu giám sát mọi thay đổi
5. periodic_save commit mỗi 5s dự phòng
6. tmate khởi động → tạo các liên kết SSH/web
7. Các liên kết được ghi vào README + host.conf
8. Bạn kết nối bằng ssh hoặc terminal web
9. Bạn làm gì tùy thích -- mỗi thay đổi tệp = autosave
10. 6h sau, GitHub giết VM
11. Ổ cứng của bạn còn nguyên trong nhánh "filesystem"
12. Bạn chạy lại workflow → quay lại bước 3, mọi thứ vẫn còn

Một VPS miễn phí với ổ cứng bền vững. Chỉ với git và GitHub Actions.

---

## Thành thật mà nói: những giới hạn

Đây là hack, không phải VPS thật. Vậy nên:

- **Tối đa 6h mỗi lần chạy.** Phải chạy lại workflow thường xuyên. Không có uptime vô hạn.
- **Không dùng cho production.** Bạn sẽ không host trang web ở đây. Nó dành cho khám phá, dev, debug, thử nghiệm một thứ trong Linux dùng một lần nhưng có thể phục hồi.
- **GitHub thấy mọi thứ.** Đó là máy của họ. Đừng đặt gì nhạy cảm.
- **Giữ repo ở chế độ private.** Bạn đang phơi bày một shell SSH. Repo public = bất kỳ ai cũng có thể kết nối. Ý tưởng tồi.
- **Nó ở ranh giới điều khoản sử dụng.** GitHub Actions được tạo cho CI/CD, không phải VPS miễn phí. Vậy hãy dùng có chừng mực, cho mục đích chính đáng, không lạm dụng.

### Điểm yếu thực sự: git ghét tệp lớn

Git được tạo cho văn bản, không phải cho hệ thống tệp.

Ổ cứng sống trong một nhánh git. Vậy mọi thứ bạn lưu đều qua git. Và git:
- xử lý kém các tệp nhị phân lớn (một image Docker 2 GB trong git? quên đi)
- có giới hạn 100 MB mỗi tệp trên GitHub (hard limit, không push được qua)
- khuyến nghị dưới ~5 GB mỗi repo

Vậy nếu bạn `npm install` một dự án với 500 MB `node_modules`, hoặc build thứ gì đó ra tệp nhị phân nặng, push lên `filesystem` sẽ hoặc rất chậm, hoặc hoàn toàn thất bại.

`git commit --amend` giúp ích (chỉ một commit, không lịch sử phình to), nhưng không thay đổi sự thật rằng một tệp 200 MB sẽ không bao giờ qua được.

Tóm lại: **nó hoạt động tuyệt vời cho code, cấu hình, tệp nhỏ. Nó không hoạt động để lưu dữ liệu lớn hoặc artifact nhị phân.** Phải ghi nhớ điều này khi làm việc trong session của bạn.

### Đây không phải snapshot hệ thống hoàn chỉnh

Một sắc thái quan trọng khác: nhánh `filesystem` lưu **workspace** (thư mục của repo), không phải toàn bộ hệ thống.

Nếu bạn `apt install htop`, tệp nhị phân sẽ vào `/usr/bin/htop`, nằm NGOÀI workspace. Vậy nó sẽ KHÔNG được lưu. Ở lần chạy sau, phải cài lại.

Đó là lý do có cache APT và `prestart.sh`: để chuẩn bị lại môi trường hệ thống mỗi lần khởi động, vì chỉ workspace mới tồn tại.

Nếu bạn muốn các cài đặt của mình sống sót, phải đặt chúng trong workspace (kiểu, cài trong thư mục local thay vì hệ thống). Đó là một bài tập cần làm quen.

---

## VPS miễn phí vs VPS thật: so sánh

| | repo-to-vps | VPS thật (5€/tháng) |
|---|---|---|
| **Giá** | 0€ | ~5-10€/tháng |
| **Uptime** | 6h, phải chạy lại | 24/7 |
| **Ổ cứng** | nhánh git, tệp nhỏ | SSD thật, nhiều GB |
| **RAM** | ~7 GB (hào phóng!) | 1-2 GB thường |
| **CPU** | 2-4 nhân ổn | 1-2 vCPU |
| **Thiết lập** | clone template | cấu hình thủ công |
| **Tồn tại** | workspace chỉ | hệ thống hoàn chỉnh |
| **Hợp pháp** | ranh giới ĐKSD | 100% sạch sẽ |

Điều buồn cười là về specs thô (RAM, CPU), runner GitHub thường TỐT HƠN VPS 5€. Nhưng uptime 6h và tồn tại giới hạn trong workspace, đó là thứ biến nó thành đồ chơi hacker, không phải máy chủ thật.

Để học, thử nghiệm, debug Linux nhanh trong môi trường có thể phục hồi? Hoàn hảo. Để host bất cứ thứ gì nghiêm túc? Hãy mua VPS thật.

Nhưng cho môi trường Linux tạm thời mà bạn có thể khôi phục tùy ý? Nó thật sự tuyệt vời.

---

## Pattern đằng sau tất cả

Nếu bạn lùi lại, repo-to-vps và bot email (bài viết khác của tôi) đều dựa trên cùng một ý tưởng:

> **Git không chỉ là trình quản lý phiên bản. Nó là hệ thống lưu trữ bền vững, miễn phí, có phiên bản, có thể truy cập qua API.**

Khi bạn có một hệ thống stateless (GitHub Actions, Worker, serverless function) và muốn giữ trạng thái giữa các lần thực thi, git có thể làm "ổ cứng".

- Bot email lưu `lastId` trong một tag git.
- repo-to-vps lưu toàn bộ hệ thống tệp trong một nhánh git.

Cùng pattern, hai quy mô. Một bên là giá trị, một bên là ổ cứng.

Và `git commit --amend` + force-push là kỹ thuật chung: **bạn giữ một commit duy nhất đại diện cho trạng thái hiện tại, bị ghi đè mỗi lần cập nhật.**

Nó không được tạo ra cho việc này. Nhưng nó hoạt động. Và nó miễn phí.

---

**3 điều cần nhớ:**

1. **Một nhánh git = ổ cứng bền vững** -- Lưu hệ thống tệp của bạn trong một nhánh riêng, khôi phục khi khởi động, và bạn có trạng thái sống sót qua các máy dùng một lần.

2. **inotify + git = autosave thời gian thực** -- `inotifywait` giám sát thay đổi ở cấp kernel và push lên git ngay lập tức. Với `git commit --amend` để giữ một commit duy nhất, sạch sẽ.

3. **tmate biến runner thành VPS** -- SSH live trên máy GitHub Actions, với tự động khởi động lại và kết nối lại bằng một lệnh qua API GitHub.

Git làm ổ cứng, tập hai. Tôi nghĩ tôi sẽ kết thúc với việc lưu mọi thứ trong các nhánh git xD
