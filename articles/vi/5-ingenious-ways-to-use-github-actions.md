---
title: "5 cách lắt léo dùng GitHub Actions (và điều nó dạy về secret)"
description: "Một runner CI biến thành VPS miễn phí, một bot tự mở pull request cho chính nó, publish npm không cần secret nào. Dạo qua các repo của tôi để liệt kê các pattern GitHub Actions vượt khỏi kiểu \"lint + test + deploy\" đơn thuần."
date: 2026-07-14
tags:
  - github-actions
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "ladYWNBv/LOA15Xzo0h4hpIB8diuGJi0/hBhc0pYhA4X4SIIa4MNdjhkLtE+9feOxDOa7qRFbdJtYfoOUWsGYQ=="
---

# 5 cách lắt léo dùng GitHub Actions

GitHub Actions, trên giấy tờ, sinh ra cho CI/CD cổ điển : bạn đẩy, nó lint, nó test, nó deploy. Tôi từng viết về một trường hợp riêng (dùng tag git làm cơ sở dữ liệu cho bot email, xem bài chuyên đề). Nhưng khi lục trong chính các repo của mình, có đủ pattern khác nhau để đáng một bài riêng, ít tập trung vào một dự án, thiên về danh mục kỹ thuật hơn.

Năm cách dùng, từ cổ điển nhất tới quái nhất.

## 1. Tag git làm trạng thái bền vững giữa hai lần chạy

Nhắc nhanh, chi tiết đầy đủ nằm trong bài về `email-autoreply`. GitHub Actions stateless theo thiết kế : mỗi lần chạy khởi đầu từ máy trống. Cách lách : lưu một giá trị (ID, timestamp, bất kỳ trạng thái nhỏ nào) trong một tag git chuyên dụng, không bao giờ trong nhánh.

```bash
# đọc trạng thái
git show refs/tags/lastid:data/lastId > data/lastId

# ghi trạng thái (nhánh mồ côi, một commit duy nhất, force-push tag)
git switch --orphan lastid-tmp
git commit -m "lastId snapshot"
git tag -f lastid
git push --force origin lastid
```

Điểm mấu chốt : một nhánh mồ côi để không bao giờ tích lịch sử, và một tag ép thay vì nhánh để không làm bẩn danh sách nhánh của repo.

## 2. Tag git làm cache build tiền biên dịch

Cùng họ ý tưởng, cách dùng khác : thay vì lưu trạng thái ứng dụng, ta lưu một **artefact build**. Job `build` biên dịch mã một lần (khi đẩy lên `master`), rồi đẩy `dist/` + `node_modules/` vào tag `runtime`. Job `cron` thì checkout trực tiếp tag này thay vì chạy `bun install && bun run build` mỗi lần thực thi :

```yaml
- name: Checkout runtime snapshot
  uses: actions/checkout@v4
  with:
    ref: refs/tags/runtime
    fetch-depth: 1
# không install, không build -- mã đã sẵn sàng
- run: node dist/index.js --action
```

Việc này đổi lần chạy từ ~20s xuống ~10s. Trên cron chạy thường xuyên, điều đó đáng kể. `actions/cache` làm việc tương tự (cache phụ thuộc), nhưng tag git trực tiếp hơn khi bạn muốn thẳng tay đóng băng một artefact có phiên bản và trỏ rõ vào nó, thay vì chỉ tăng tốc một `npm install`.

## 3. Một check bắt buộc duy nhất gom nhiều job

Pattern nhỏ trông chẳng có gì nhưng thay đổi cuộc sống trong cấu hình nhánh bảo vệ. Trên `konosuba-rpg`, CI có ba job độc lập (`typecheck`, `lint`, `tests`) chạy song song, và job thứ tư, `test-battery`, không làm gì khác ngoài phụ thuộc ba job đầu :

```yaml
test-battery:
  needs:
    - typecheck
    - lint
    - tests
  runs-on: ubuntu-latest
  steps:
    - run: echo "Typecheck, lint and tests succeeded."
```

Không có job mặt tiền này, cấu hình nhánh bảo vệ sẽ đòi tích ba check bắt buộc riêng, và cập nhật danh sách đó mỗi khi job được thêm hay đổi tên. Với `test-battery`, một tên duy nhất để tích trong cài đặt repo, ổn định dù chi tiết bên trong thay đổi.

## 4. Biến runner miễn phí thành VPS tạm thời

Đây là quái nhất trong tất cả, và rõ ràng là món tôi thích nhất : `repo-to-vps` bẻ hoàn toàn mục đích dự kiến của runner GitHub Actions để biến nó thành máy Linux truy cập được qua SSH, miễn phí, tới 6 giờ (giới hạn tối đa của một job).

Nguyên tắc : một job hầu như không làm gì khác ngoài chạy [tmate](https://tmate.io/) (một fork của tmux phơi bày phiên terminal chia sẻ được qua SSH hay trình duyệt) :

```yaml
name: debug-runner
on:
  push:
    branches: [main, master]
  workflow_dispatch:
permissions:
  contents: write
  actions: write
jobs:
  debug:
    runs-on: ubuntu-latest
    timeout-minutes: 360
    steps:
      - uses: actions/checkout@v4
      - uses: awalsh128/cache-apt-pkgs-action@v1.6.0
        with:
          packages: tmate inotify-tools
      - run: bash .github/scripts/start-tmate.sh
```

Bài toán hóc búa thật sự là filesystem của runner GitHub Actions **dùng một lần** : hễ job kết thúc, mọi thứ biến mất. Một phiên SSH kéo dài hàng giờ chẳng để làm gì nếu mọi thứ bạn làm trong đó bốc hơi ở lần chạy tiếp. Giải pháp : một nhánh git đóng vai snapshot trực tiếp của filesystem, đồng bộ liên tục.

Script `start-tmate.sh` làm, theo thứ tự :

1. **Khôi phục** filesystem từ nhánh chuyên dụng `filesystem` lúc job khởi động (`git reset --hard` lên nó).
2. **Theo dõi** thay đổi tệp bằng `inotifywait` liên tục, và **commit + đẩy ngay** hễ tệp nào động đậy :

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock)(/|$)' .; do
    commit_and_push
    sleep 1   # debounce
  done
}
```

3. Mỗi lần lưu **sửa** commit trước thay vì tạo commit mới (`git commit --amend --no-edit`), nên nhánh `filesystem` luôn ở một commit duy nhất, tránh tích hàng nghìn snapshot.
4. Vòng lặp `while true` chạy lại `tmate` tự động nếu phiên chết, với `remain-on-exit on` để terminal vẫn tiếp cận được ngay cả sau `exit`.
5. URL SSH do tmate tạo được ghi vào tệp `host.conf`, commit lên nhánh `filesystem`, nên lấy được qua API GitHub (`gh api .../contents/host.conf`) mà không bao giờ cần truy cập log job trực tiếp.
6. Routine `periodic_save` chạy mỗi 5 giây trong nền, phòng khi `inotifywait` hụt sự kiện.

Kết quả : một shell Linux đầy đủ, truy cập được từ bất cứ đâu, với filesystem bền vững giữa các phiên, trong khi hạ tầng bên dưới (runner GitHub Actions) hoàn toàn không được thiết kế cho việc đó. Giới hạn thật duy nhất là timeout 6 giờ mỗi job : sau đó phải chạy lại workflow.

## 5. Bot tự mở pull request cho chính nó

Trên `konosuba-rpg`, một lần đẩy lên nhánh `dev` kích hoạt job kiểm tra đã có pull request mở nào tới `main` chưa, và tự tạo một cái nếu chưa, qua `actions/github-script` và API REST GitHub :

```js
const { data: comparison } = await github.rest.repos.compareCommits({
  owner, repo, base: 'main', head: 'dev',
});
if (comparison.ahead_by === 0) return; // không có gì để đề xuất

const { data: existing } = await github.rest.pulls.list({
  owner, repo, state: 'open', head: `${owner}:dev`, base: 'main',
});
if (existing.length > 0) return; // đã có PR mở

await github.rest.pulls.create({
  owner, repo, head: 'dev', base: 'main',
  title: 'chore: auto PR from dev to main',
});
```

Chi tiết đáng kể ở đây là token dùng. Workflow này **không** dùng `GITHUB_TOKEN` tự động : nó đòi một secret `AUTO_PR_TOKEN` riêng, và từ chối tiếp tục nếu thiếu :

```yaml
- name: Validate pull request token
  env:
    AUTO_PR_TOKEN: ${{ secrets.AUTO_PR_TOKEN }}
  run: |
    if [ -z "$AUTO_PR_TOKEN" ]; then
      echo "AUTO_PR_TOKEN is required... Use a PAT or GitHub App token with contents:write and pull-requests:write."
      exit 1
    fi
```

## 6. Đăng lên npm không cần secret nào

Kín đáo nhất trong năm, nhưng có lẽ quan trọng nhất cho tương lai : workflow `publish.yml` của `typescript-virtual-container` không chứa **secret npm nào**. Không `NPM_TOKEN`, không `NODE_AUTH_TOKEN`. Chỉ có vậy :

```yaml
permissions:
  id-token: write  # Required for OIDC
  contents: read
jobs:
  publish:
    steps:
      - uses: actions/setup-node@v6
        with:
          registry-url: 'https://registry.npmjs.org'
      - run: npm publish
```

`npm publish` vẫn chạy, vì registry npm giờ hỗ trợ **trusted publishing** qua OIDC : workflow chứng minh danh tính trực tiếp với registry (đúng repo + đúng workflow, cấu hình phía npmjs.org), mà không token tĩnh nào đi qua hay lưu ở đâu. Không secret để rò rỉ, không token để xoay vòng mỗi sáu tháng.

---

## Secret GitHub, chuyên sâu

Năm pattern này đều chạm, cách này hay cách khác, tới câu hỏi secret. Vài nguyên tắc lặp lại khắp các workflow của tôi :

**Secret không nhất thiết là chuỗi đơn giản.** Trong `email-autoreply`, `ACCOUNTS_JSON` chứa toàn bộ JSON thu gọn của cấu hình đa tài khoản : một cấu trúc dữ liệu đầy đủ thay vì khóa API đơn thuần, bơm nguyên vào tệp lúc runtime :

```yaml
env:
  ACCOUNTS_JSON: ${{ secrets.ACCOUNTS_JSON }}
run: printf "%s" "$ACCOUNTS_JSON" > data/accounts.json
```

Việc này tránh phải commit tệp cấu hình, dù mã hóa, và cập nhật trong một cú bấm ở cài đặt repo mà không đụng tới mã.

**`GITHUB_TOKEN` có giới hạn chính xác, và đó là chủ ý.** Token tự động GitHub bơm mỗi lần chạy rất mạnh, nhưng bị niêm phong ở vài điểm : mặc định, nó không thể kích hoạt workflow khác, và tùy cấu hình repo nó có thể bị chặn bởi quy tắc bảo vệ nhánh. Đó chính xác là lý do `create-pull-request.yml` đòi PAT (`AUTO_PR_TOKEN`) riêng : một token tới từ tài khoản thật (hay GitHub App), với quyền rõ ràng `contents:write` + `pull-requests:write`, khác với token phù du của job.

**Quyền scope theo từng job, không phải toàn cục.** Mỗi workflow tôi liệt kê ở đây đều khai báo khối `permissions:` tối thiểu và có comment :

```yaml
permissions:
  contents: read
  actions: read
  checks: write
  # Only allow writing checks, everything else is read-only
```

`GITHUB_TOKEN` mặc định trong lịch sử có quyền khá rộng trên repo công khai ; giới hạn rõ nó ở đúng những gì job thực sự cần sẽ hạn chế thiệt hại nếu một action bên thứ ba trong chuỗi (`uses: ai-đó/action@phiên-bản`) hóa ra bị xâm phạm.

**Secret tốt nhất là secret không tồn tại.** Pattern OIDC của `typescript-virtual-container` là phiên bản hoàn thiện nhất của ý này : thay vì quản lý xoay vòng, hết hạn và nguy cơ rò rỉ của `NPM_TOKEN`, workflow chứng minh danh tính bằng mật mã (đúng repo này, đúng workflow này) trực tiếp với dịch vụ bên thứ ba. Logic tương tự có cho AWS, Docker Hub, PyPI : ngày càng nhiều registry và cloud hỗ trợ OIDC từ GitHub Actions.

---

**3 điểm chính**

1. Tag git (mồ côi, force-push) có thể đóng vai cơ sở dữ liệu tối giản hay cache build tiền biên dịch : hai cách dùng riêng của cùng một cơ chế.
2. Runner GitHub Actions miễn phí có thể thành shell SSH bền vững nếu chấp nhận đồng bộ filesystem liên tục lên nhánh git, với autosave bằng `inotifywait` và một commit duy nhất được sửa.
3. `GITHUB_TOKEN` mặc định bị giới hạn có chủ ý : tạo PR liên nhánh hay đăng không cần secret đòi hoặc PAT chuyên dụng, hoặc chuyển sang trusted publishing OIDC.
