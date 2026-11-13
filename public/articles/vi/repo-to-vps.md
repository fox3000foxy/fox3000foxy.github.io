---
title: "Repo thành VPS : biến GitHub Actions thành VPS miễn phí với lưu trữ bền vững"
description: Cách biến runner GitHub Actions thành VPS vĩnh viễn với git làm lưu trữ bền vững -- tmate, inotify và commit --amend.
date: 2026-05-29
tags:
  - github
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "yUqKmcTxwu9X20jqmHYsEcyIJp62L7drqQosfJ5mItY7eEqQ7mvsUFSNH8u6D5T/aod1GP8qAVtms6V89+c74A=="
---

## GitHub cho bạn VPS miễn phí 6 giờ. Tôi đã tìm ra cách khiến nó vĩnh viễn.

GitHub Actions cho bạn máy Linux miễn phí.

Kiểu, máy chủ Ubuntu thật. 2 lõi, 7 Go RAM, 14 Go đĩa. Miễn phí. 6 giờ mỗi lần chạy.

"Vấn đề" duy nhất : cuối lần chạy, mọi thứ bị xóa. Máy dùng một lần. Bạn cài gói, bạn code, bạn cấu hình... và pouf, cuối cùng mọi thứ biến mất. Như thể bạn chưa làm gì.

Trừ khi.

Trừ khi bạn dùng **git làm ổ cứng**.

Và lúc đó, đùng cái, bạn có VPS miễn phí với đĩa bền vững sống sót qua các lần chạy. Bạn kết nối lại, mọi thứ còn đó. Bạn tiếp tục nơi đã dừng.

Hoàn toàn điên. Để tôi giải thích.

---

## Bối cảnh : runner GitHub Actions

Khi bạn chạy workflow GitHub Actions, GitHub đưa bạn VM.

Nó sinh ra để build mã, chạy test, deploy. Workflow chạy, làm việc, và máy bị hủy.

Nhưng không gì cấm bạn làm chuyện khác với VM này. Kiểu, mở shell SSH lên đó và dùng nó như máy chủ.

Ràng buộc là các máy này **stateless** và **tạm thời** :
- Tạm thời : tối đa 6 giờ mỗi lần chạy (`timeout-minutes: 360`, trần của GitHub)
- Stateless : mọi thứ bị xóa cuối cùng

Nên để biến nó thành VPS dùng được, phải giải hai bài toán :
1. **Kết nối lên đó thời gian thực thế nào?**
2. **Giữ đĩa giữa hai lần chạy thế nào?**

Tới đây thành mẹo bẩn.

---

## Bài toán 1 : SSH trực tiếp bằng tmate

**tmate** là fork của tmux tạo phiên SSH chia sẻ được.

Bạn chạy nó trên máy, nó sinh hai link :
- URL SSH (`ssh xxx@nyc1.tmate.io`)
- URL web (terminal trong trình duyệt)

Bạn kết nối bằng một trong các link này, và bùm, bạn ở trong shell trên máy. Thời gian thực.

Workflow vì vậy chạy tmate :

```bash
tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
tmate -S /tmp/tmate.sock set-option -g remain-on-exit on

# lấy link kết nối
tmate_ssh=$(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}')
tmate_web=$(tmate -S /tmp/tmate.sock display -p '#{tmate_web}')
```

Và các link này được ghi thẳng vào README của repo bằng script Python. Bạn mở repo, thấy link kết nối, bấm. Bạn ở trong VPS của mình.

Xong bài toán đầu. Nhưng bài thứ hai mới thực sự điên.

---

## Bài toán 2 : git làm ổ cứng

Đây là ý tưởng thay đổi tất cả.

Máy bị xóa mỗi lần chạy. Nên ta lưu **hệ thống tệp trong nhánh git chuyên dụng**, tên là `filesystem`.

Lúc khởi động, script khôi phục trạng thái từ nhánh này :

```bash
filesystem_branch="filesystem"

# lấy nhánh filesystem từ remote
git fetch origin "$filesystem_branch":refs/remotes/origin/$filesystem_branch

# khôi phục workspace từ nhánh này
git checkout -B filesystem-workspace "refs/remotes/origin/$filesystem_branch"
git reset --hard "refs/remotes/origin/$filesystem_branch"
```

Nhánh `filesystem` CHÍNH LÀ ổ cứng của bạn. Tệp, cài đặt, cấu hình của bạn -- tất cả trong đó.

Bạn thấy ý tưởng chứ? Máy dùng một lần, nhưng đĩa sống trong git. Bạn chạy lại workflow, đĩa được khôi phục, bạn tiếp tục đúng nơi đã dừng.

Như VPS ngủ đông. Chỉ có điều ngủ đông là repo git.

### Lần chạy đầu : tạo đĩa trống

Ngay lần chạy đầu, nhánh `filesystem` chưa tồn tại. Phải tạo. Và việc này không tầm thường :

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

`git checkout --orphan` là chìa khóa. Nhánh mồ côi là nhánh **không có lịch sử nào** -- như thể bạn khởi đầu từ repo trống.

Vì sao mồ côi? Vì bạn KHÔNG muốn đĩa bền vững lôi theo toàn bộ lịch sử mã nguồn. Đĩa ở riêng, sống đời riêng. Nó khởi đầu trinh nguyên.

Và `git ls-remote --exit-code` ở đầu, chỉ là kiểm tra sạch : "nhánh đã tồn tại trên remote chưa?". Nếu có, không đụng gì. Nếu chưa, ta tạo. Idempotent, như ta thích.

### git clean chọn lọc : bảo vệ cache

Dòng này đáng dừng lại :

```bash
git clean -fdx -e .apt-cache -e .cache -e host.conf -e tmate.sock
```

`git clean -fdx` xóa MỌI thứ git không theo dõi. Bình thường việc này bạo lực -- nó dọn workspace sạch bong.

Nhưng các `-e` (loại trừ) bảo vệ vài tệp :
- `.apt-cache` → cache gói APT (ta sẽ quay lại, nó láu)
- `.cache` → cache chung
- `host.conf` → địa chỉ SSH của phiên
- `tmate.sock` → socket của phiên tmate đang chạy

Nếu bạn dọn các tệp đó, bạn phá phiên đang chạy hay mất cache. Nên ta tha chúng lúc reset.

Chi tiết trông ngu lúc đầu, nhưng thiếu nó mọi thứ vỡ.

---

## Tự lưu : inotify canh mọi thứ

Được, nhưng tệp vào nhánh `filesystem` bằng cách nào?

Trả lời : watcher canh MỌI thay đổi tệp và commit/đẩy tự động.

Công cụ kỳ diệu là **inotifywait** (từ gói `inotify-tools`). Nó canh filesystem ở tầng kernel và kích hoạt hễ tệp đổi.

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock|\.gitignore|\.txt\.swp)(/|$)' .; do
    echo "[autosave] change detected"
    commit_and_push
    sleep 1   # debounce nếu nhiều thay đổi dồn dập
  done
}

autosave &
```

Mổ các cờ inotify, vì cờ nào cũng đáng :
- `-r` → đệ quy, canh mọi thư mục con
- `-e modify,create,delete,move` → phản ứng với 4 kiểu sự kiện này
- `--exclude '...'` → regex để bỏ qua vài tệp

`--exclude` then chốt. Xem nó bỏ qua gì :
- `.git` → hiển nhiên, nếu không mỗi commit kích hoạt autosave kích hoạt commit... vòng lặp vô hạn. Thảm họa.
- `.apt-cache` và `.cache` → cache, đổi liên tục mà ta không muốn spam vào git
- `host.conf` và `tmate.sock` → tệp phiên, động không ngừng
- `.gitignore`, `.txt.swp` → tệp tạm (`.swp` là tệp chỉnh sửa của vim)

Không có exclude này, bạn sẽ có autosave tự kích hoạt vòng lặp trên chính thay đổi của nó. `.git` trong danh sách, chính là dòng ngăn bạn tự bắn vào chân.

Bạn sửa tệp? inotify phát hiện tức thì, nó commit, nó đẩy. Dưới một giây, thay đổi của bạn đã vào nhánh `filesystem`.

Bạn cài gói, bạn viết mã, bạn đụng config -- mọi thứ được lưu thời gian thực, tự động, mà bạn không phải làm gì.

Bạn đúng nghĩa có hệ thống tự lưu toàn bộ đĩa. Điên.

### Debounce : không spam git

`sleep 1` sau mỗi lần lưu là **debounce**.

Khi bạn lưu tệp trong trình chỉnh, thường nó sinh nhiều sự kiện filesystem dồn dập (tạo tệp tạm, đổi tên, xóa cái cũ...). Không debounce, bạn kích 3-4 commit cho một lần lưu.

`sleep 1` nói : "chờ một giây sau lần lưu, cho đợt dồn lắng xuống, rồi mới nghe lại". Việc này gom thay đổi gần nhau thành một commit. Láu.

### Và thêm lưu định kỳ

Phòng khi inotify hụt sự kiện, còn lưu mỗi 5 giây :

```bash
periodic_save() {
  while true; do
    sync_from_remote   # lấy thay đổi từ xa nếu có
    sleep 5
    commit_and_push
  done
}

periodic_save &
```

Cả thắt lưng VÀ dây đeo. Ta nhất quyết không muốn mất trạng thái đĩa.

---

## Chi tiết láu : một commit duy nhất

Nếu bạn commit mỗi lần tệp đổi, bạn sẽ tích hàng nghìn commit. Trong một giờ phiên, lịch sử git nổ tung. Repo thành khổng lồ. Kinh tởm.

Giải pháp thanh lịch : **sửa commit hiện có** thay vì tạo commit mới.

```bash
commit_and_push() {
  (
    flock -n 200 || return   # khóa để hai lần lưu không chạy cùng lúc

    git add -A
    git reset -- .github/workflows/ .github/scripts/   # không đụng script

    if ! git diff --cached --quiet; then
      if git rev-parse --verify HEAD >/dev/null 2>&1; then
        git commit --amend --no-edit    # AMEND : ghi đè commit trước
      else
        git commit -m "autosave $(date -u +%Y%m%dT%H%M%SZ)"
      fi
      git push --force origin "filesystem-workspace:filesystem"
    fi
  ) 200>/tmp/tmate_autosave.lock
}
```

`git commit --amend` nghĩa là : "thay commit cuối bằng cái này".

Nhờ vậy nhánh `filesystem` LUÔN chỉ một commit. Dù bạn lưu bao nhiêu lần. Nó chỉ là snapshot trạng thái hiện tại, force-push đi đẩy lại.

`flock` là khóa : vì có hai vòng lưu (inotify + định kỳ), phải tránh chúng chạy git cùng lúc và giẫm nhau. Một tiến trình git tại một thời điểm.

Gọn.

---

## sync_from_remote : xử lý nhiều phiên

Này, trường hợp bạn lúc đầu không nghĩ tới : nếu bạn chạy HAI lần cùng lúc thì sao? Hay một phiên sửa nhánh `filesystem` trong khi phiên khác chạy?

Script xử lý việc đó bằng `sync_from_remote` trước mỗi commit :

```bash
sync_from_remote() {
  git fetch origin "filesystem":refs/remotes/origin/filesystem
  git merge --ff-only "refs/remotes/origin/filesystem"
}
```

`--ff-only` (chỉ fast-forward) quan trọng : nghĩa là "merge CHỈ nếu tiến sạch được, không tạo commit merge".

Nếu hai nhánh đã rẽ (kiểu, hai phiên sửa các tệp khác nhau), fast-forward thất bại lặng lẽ (`2>/dev/null || true`) và ta giữ trạng thái cục bộ. Không phải hệ thống merge hoàn hảo, nhưng tránh hỏng trong trường hợp đơn giản chỉ một phiên chạy.

Thật lòng, đừng chạy 3 phiên song song trên cùng repo. Nhưng mã vẫn cố không nổ nếu chuyện đó xảy ra. Đó là phòng thủ.

---

## Cache APT : cài nhanh

Có chi tiết trong workflow trông không có gì mà nghĩ kỹ :

```yaml
- name: Cache & install APT packages (tmate + watcher)
  uses: awalsh128/cache-apt-pkgs-action@v1.6.0
  with:
    packages: tmate inotify-tools
```

tmate và inotify-tools được cài qua action **cache gói APT**.

Lần chạy đầu, nó tải và cài. Các lần sau, nó khôi phục từ cache GitHub Actions -- nhanh hơn, không cần tải lại.

Và bạn nhớ `git clean -fdx -e .apt-cache` lúc nãy chứ? Liên quan đấy. Thư mục `.apt-cache` được bảo vệ khỏi dọn dẹp đúng để các gói bạn cài trong phiên có thể bền tối thiểu.

Mọi thứ khớp. Tôi đã nghĩ tới toàn bộ vòng đời.

---

## Script giấu trong /tmp

Thêm chi tiết hiểm mà láu. Ngay đầu script :

```bash
RUNNER_SCRIPTS_DIR="/tmp/runner-scripts"
rm -rf "$RUNNER_SCRIPTS_DIR"
mkdir -p "$RUNNER_SCRIPTS_DIR"
cp -r .github/scripts "$RUNNER_SCRIPTS_DIR/"
```

Các script (`update_readme.py`, v.v.) được chép vào `/tmp` TRƯỚC khi đụng tới nhánh `filesystem`.

Vì sao? Vì khi bạn làm `git reset --hard` về nhánh `filesystem` (ban đầu trống, hay chứa đĩa của bạn), các tệp `.github/scripts` của repo nguồn biến mất khỏi workspace.

Nhưng script vẫn cần chúng trong phiên (để cập nhật README mỗi lần tmate chạy lại). Nên nó giấu chúng trong `/tmp`, ngoài tầm git :

```bash
python3 "$RUNNER_SCRIPTS_DIR/scripts/update_readme.py" --ssh "$tmate_ssh" ...
```

Nếu bạn không nghĩ tới, bạn vật vã 30 phút để hiểu vì sao script biến mất. Tôi đã nghĩ tới.

---

## Shell đo ni đóng giày

Tiện nghi nhỏ : phiên cho bạn shell đã cấu hình, không phải bash trần.

`prestart.sh` chép `.bashrc` custom :

```bash
if ! grep -q "Custom prompt and aliases for remote sessions" "$HOME/.bashrc"; then
  cp .github/scripts/remote_bashrc "$HOME/.bashrc"
fi
sudo cp "$HOME/.bashrc" /root/.bashrc
```

Và `.bashrc` này chứa prompt màu, alias (`ll`, `lla`, `rm -i`), và nhất là ghi đè `exit` :

```bash
exit() {
    killall -9 -u "$(whoami)" tmate 2>/dev/null || true
    builtin exit "$@"
}

# Ctrl+D làm giống exit
bind -x '"\C-d": "exit"'
```

Khi bạn gõ `exit` (hay Ctrl+D), nó giết sạch tiến trình tmate trước khi đóng. Việc này tránh để lại phiên tmate zombie.

Ngoài ra có hàm `tmate-detach` nếu bạn muốn ngắt KẾT NỐI mà KHÔNG giết phiên (để kết nối lại sau). Chi tiết tiện nghi, nhưng cho thấy mức chăm chút.

---

## tmate tự chạy lại

Tiện nghi nhỏ : nếu bạn gõ `exit` trong shell, bình thường phiên tmate chết và bạn mất kết nối vĩnh viễn.

Chỉ có điều ở đây, tmate nằm trong vòng `while true` :

```bash
while true; do
  tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
  while tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}' >/dev/null 2>&1; do
    sleep 2
  done
  echo "tmate session ended; restarting..."
done
```

Bạn `exit`? Phiên tự khởi động lại. Bạn kết nối lại bằng cùng link.

Ngớ ngẩn, nhưng khiến phiên dùng được.

---

## Kết nối lại bằng một lệnh

Bạn kết nối lại sau khi mất kết nối thế nào, mà không phải lục log lần chạy mỗi lần?

Địa chỉ SSH của tmate được ghi vào tệp `host.conf`, commit trong nhánh `filesystem` :

```bash
printf '%s' "${tmate_ssh#ssh }" > host.conf
```

Và vì tệp này trong git, bạn lấy được nó qua API GitHub bằng một lệnh duy nhất :

```bash
ssh "$(gh api -H 'Accept: application/vnd.github.v3.raw' \
  "/repos/USER/REPO/contents/host.conf?ref=filesystem" | tr -d '\r\n')"
```

Bạn chạy nó, nó đi lấy địa chỉ SSH hiện tại trong repo, và kết nối bạn. Ngay cả khi địa chỉ đã đổi giữa hai phiên.

---

## Luồng đầy đủ

Tóm lại :

1. Bạn kích hoạt workflow (đẩy hay nút tay)
2. GitHub đưa bạn VM Ubuntu
3. Script khôi phục đĩa từ nhánh "filesystem"
4. inotify bắt đầu canh mọi thay đổi
5. periodic_save commit mỗi 5s để dự phòng
6. tmate khởi động → sinh link SSH/web
7. Link được ghi vào README + host.conf
8. Bạn kết nối bằng ssh hay terminal web
9. Bạn làm gì tùy -- mỗi thay đổi tệp = tự lưu
10. 6 giờ sau, GitHub giết VM
11. Đĩa của bạn nguyên vẹn trong nhánh "filesystem"
12. Bạn chạy lại workflow → về bước 3, mọi thứ còn đó

VPS miễn phí với đĩa bền vững. Chỉ bằng git và GitHub Actions.

---

## Được, phải trung thực : giới hạn

Đây là mẹo, không phải VPS thật. Nên :

- **Tối đa 6 giờ mỗi lần chạy.** Phải chạy lại workflow thường xuyên. Uptime giới hạn mỗi lần chạy.
- **Dành cho dev và khám phá.** Bạn sẽ không host trang của mình trên đó. Nó để khám phá, dev, gỡ lỗi, test môi trường Linux dùng một lần mà khôi phục được.
- **GitHub thấy hết.** Đó là máy của họ. Đừng đặt gì nhạy cảm.
- **Giữ repo riêng tư.** Bạn phơi shell SSH. Repo công khai = bất kỳ ai cũng có thể kết nối vào. Ý tệ.
- **Nó ở rìa điều khoản dùng.** GitHub Actions sinh ra cho CI/CD, không phải VPS miễn phí. Nên dùng tiết chế, cho việc hợp lệ, không lạm dụng.

### Gót chân Achilles thật : git ghét tệp lớn

Git sinh ra cho văn bản, không phải filesystem.

Đĩa bền vững sống trong nhánh git. Nên mọi thứ bạn lưu đều qua git. Và git :
- xử lý kém tệp nhị phân lớn (ảnh Docker 2 Go trong git? quên đi)
- có giới hạn 100 Mo cho mỗi tệp trên GitHub (giới hạn cứng, không đẩy được vượt)
- khuyến nghị ở dưới ~5 Go cho mỗi repo

Nên nếu bạn `npm install` dự án với 500 Mo `node_modules`, hay build dự án sinh nhị phân nặng, lần đẩy lên `filesystem` sẽ hoặc ì ạch tới chết, hoặc thất bại thẳng.

`git commit --amend` giúp (một commit duy nhất, không lịch sử phình), nhưng không đổi được việc tệp 200 Mo sẽ không bao giờ qua.

Đại khái : **nó chạy siêu tốt cho mã, config, tệp nhỏ. Nó không chạy để lưu dữ liệu lớn hay artefact nhị phân.** Phải nhớ điều đó về những gì bạn làm trong phiên.

### Không phải snapshot hệ thống đầy đủ

Sắc thái quan trọng khác : nhánh `filesystem` lưu **workspace** (thư mục repo), không phải toàn bộ hệ thống.

Nếu bạn làm `apt install htop`, nhị phân vào `/usr/bin/htop`, nằm NGOÀI workspace. Nên nó sẽ KHÔNG được lưu. Lần chạy sau, phải cài lại.

Đó là lý do ta có cache APT và `prestart.sh` : để chuẩn bị lại môi trường hệ thống mỗi lần khởi động, vì chỉ workspace bền vững.

Nếu bạn muốn cài đặt của mình sống sót, phải đặt chúng trong workspace (kiểu, cài vào thư mục cục bộ thay vì hệ thống). Đó là bài thể dục cần nhập tâm.

---

## VPS miễn phí so với VPS thật : trận đấu

| | repo-to-vps | VPS thật (5€/tháng) |
|---|---|---|
| **Giá** | 0€ | ~5-10€/tháng |
| **Uptime** | 6 giờ, phải chạy lại | 24/7 |
| **Đĩa** | nhánh git, tệp nhỏ | SSD thật, nhiều Go |
| **RAM** | ~7 Go (hào phóng!) | Thường 1-2 Go |
| **CPU** | 2-4 lõi ổn | 1-2 vCPU |
| **Setup** | clone mẫu | cấu hình tay |
| **Bền vững** | chỉ workspace | toàn bộ hệ thống |
| **Hợp lệ** | rìa CGU | 100% sạch |

Điểm thú vị là về spec thô (RAM, CPU), runner GitHub thường TỐT HƠN VPS 5€. Nhưng uptime 6 giờ và bền vững giới hạn ở workspace, đó là thứ biến nó thành đồ chơi hacker, không phải máy chủ thật.

Để học, test, gỡ lỗi hệ thống Linux nhanh trong môi trường khôi phục được? Hoàn hảo. Để host thứ gì nghiêm túc? Lấy VPS thật.

Nhưng với môi trường Linux tạm thời mà bạn có thể khôi phục tùy ý? Đúng là thiên tài.

---

## Mẫu đằng sau tất cả

Nếu bạn lùi lại, repo-to-vps và bot email (bài kia của tôi) dựa trên cùng ý tưởng :

> **Git không chỉ là quản lý phiên bản. Đó là hệ thống lưu trữ bền vững, miễn phí, có phiên bản, truy cập được qua API.**

Hễ bạn có hệ thống stateless (GitHub Actions, Worker, hàm serverless) mà muốn giữ trạng thái giữa hai lần thực thi, git có thể đóng vai "đĩa".

- Bot email lưu `lastId` trong tag git.
- repo-to-vps lưu cả filesystem trong nhánh git.

Cùng mẫu, hai quy mô. Một giá trị một bên, một đĩa một bên.

Và `git commit --amend` + force-push là kỹ thuật chung : **bạn giữ một commit duy nhất đại diện trạng thái hiện tại, ghi đè mỗi lần cập nhật.**

Nó không sinh ra cho việc đó. Nhưng nó chạy. Và miễn phí.

---

**3 điểm cần nhớ :**

1. **Nhánh git = ổ cứng bền vững** -- Lưu filesystem vào nhánh chuyên dụng, khôi phục lúc khởi động, và bạn có trạng thái sống sót qua máy dùng một lần.

2. **inotify + git = tự lưu thời gian thực** -- `inotifywait` canh thay đổi ở tầng kernel và đẩy lên git tức thì. Với `git commit --amend` để giữ một commit sạch duy nhất.

3. **tmate biến runner thành VPS** -- SSH trực tiếp lên máy GitHub Actions, với khởi động lại tự động và kết nối lại bằng một lệnh qua API GitHub.

Git làm ổ cứng, tập hai. Tôi nghĩ mình sẽ lưu mọi thứ vào nhánh git mất
