---
title: "5 cách sáng tạo để dùng GitHub Actions (và những gì chúng dạy về secrets)"
description: "CI runner biến thành VPS miễn phí, bot tự mở pull request cho chính nó, publish npm không cần secret. Một chuyến tham quan các repo để liệt kê các pattern GitHub Actions vượt ra ngoài \"lint + test + deploy\"."
date: 2026-07-14
tags:
  - github-actions
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "XjZN8RNkk6I4c8gr6gOGd/QlVUa0kwg1CuyNTfnPKKXz3Dwo+A0WXoZj6UZAgTTy0QRp1Nn6r1eWdDEiCzmUfg=="
---

# 5 cách sáng tạo để dùng GitHub Actions

Trên lý thuyết, GitHub Actions dành cho CI/CD cổ điển: bạn push, nó lint, test, deploy. Tôi đã viết về một trường hợp đặc biệt -- dùng git tag làm cơ sở dữ liệu cho bot email (xem bài riêng). Nhưng lục lại các repo của mình, có đủ pattern khác nhau để xứng đáng một bài riêng, ít tập trung vào một dự án, giống catalog kỹ thuật hơn.

Năm thứ, từ cổ điển nhất đến dị nhất.

## 1. Git tag làm trạng thái bền vững giữa các lần chạy

Tóm tắt nhanh, chi tiết đầy đủ trong bài về `email-autoreply`. GitHub Actions được thiết kế stateless -- mỗi lần chạy bắt đầu từ máy trắng. Cách lách: lưu một giá trị (ID, timestamp, bất kỳ trạng thái nhỏ nào) vào một git tag chuyên dụng, không bao giờ trong branch.

```bash
# đọc trạng thái
git show refs/tags/lastid:data/lastId > data/lastId

# ghi trạng thái (branch mồ côi, commit đơn, force-push tag)
git switch --orphan lastid-tmp
git commit -m "lastId snapshot"
git tag -f lastid
git push --force origin lastid
```

Điểm then chốt: branch mồ côi để không bao giờ tích lũy lịch sử, và tag bị ép thay vì branch để không làm bẩn danh sách branch của repo.

## 2. Git tag làm cache build đã biên dịch trước

Cùng họ ý tưởng, mục đích khác: thay vì lưu trạng thái ứng dụng, lưu một **artefact build**. Job `build` biên dịch code một lần (khi push lên `master`), rồi đẩy `dist/` + `node_modules/` vào tag `runtime`. Job `cron` checkout thẳng tag đó thay vì chạy `bun install && bun run build` mỗi lần:

```yaml
- name: Checkout runtime snapshot
  uses: actions/checkout@v4
  with:
    ref: refs/tags/runtime
    fetch-depth: 1
# không install, không build -- code đã sẵn sàng
- run: node dist/index.js --action
```

Điều này giảm thời gian chạy từ ~20s xuống ~10s. Với cron chạy thường xuyên, có ý nghĩa đấy. `actions/cache` làm việc tương tự (cache dependency), nhưng git tag trực tiếp hơn khi bạn muốn đóng băng hẳn một artefact có phiên bản và trỏ rõ ràng vào nó -- không chỉ tăng tốc `npm install`.

## 3. Một check bắt buộc duy nhất gộp nhiều job

Pattern nhỏ trông không có gì nhưng thay đổi hoàn toàn cấu hình branch bảo vệ. Trên `konosuba-rpg`, CI có ba job độc lập (`typecheck`, `lint`, `tests`) chạy song song -- và job thứ tư, `test-battery`, không làm gì ngoài phụ thuộc vào ba job đầu:

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

Không có job mặt tiền này, cấu hình branch bảo vệ sẽ phải tick ba check bắt buộc riêng biệt -- và cập nhật danh sách đó mỗi khi job được thêm vào hoặc đổi tên. Với `test-battery`, chỉ một tên để tick trong cài đặt repo, ổn định ngay cả khi chi tiết bên trong thay đổi.

## 4. Biến runner miễn phí thành VPS tạm thời

Đây là cái dị nhất, và rõ ràng là cái tôi thích nhất: `repo-to-vps` hoàn toàn bẻ cong mục đích sử dụng của runner GitHub Actions để biến nó thành một máy Linux truy cập được qua SSH, miễn phí, lên đến 6 giờ (thời lượng tối đa của một job).

Nguyên lý: một job hầu như không làm gì ngoài việc chạy tmate:

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

Vấn đề thực sự là hệ thống tệp của runner GitHub Actions là **dùng một lần** -- job kết thúc là mọi thứ biến mất. Phiên SSH kéo dài hàng giờ vô nghĩa nếu mọi thứ bạn làm bốc hơi ở lần chạy sau. Giải pháp: một branch git đóng vai snapshot trực tiếp của hệ thống tệp, đồng bộ liên tục.

Script `start-tmate.sh` thực hiện, theo thứ tự:

1. **Khôi phục** hệ thống tệp từ branch `filesystem` chuyên dụng khi job bắt đầu (`git reset --hard` lên đó).
2. **Theo dõi** thay đổi tệp liên tục với `inotifywait`, và **commit + push ngay lập tức** khi có tệp thay đổi:

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock)(/|$)' .; do
    commit_and_push
    sleep 1
  done
}
```

3. Mỗi lần lưu **sửa đổi** commit trước thay vì tạo commit mới (`git commit --amend --no-edit`), vì vậy branch `filesystem` luôn ở một commit duy nhất -- không tích lũy hàng nghìn snapshot.
4. Vòng lặp `while true` khởi động lại tmate tự động nếu phiên chết, với `remain-on-exit on` để terminal vẫn truy cập được ngay cả sau `exit`.
5. URL SSH do tmate tạo được ghi vào tệp `host.conf`, commit lên branch `filesystem` -- có thể lấy qua GitHub API (`gh api .../contents/host.conf`) mà không cần truy cập trực tiếp vào log của job.
6. Quy trình `periodic_save` chạy mỗi 5 giây trong nền, phòng khi `inotifywait` bỏ lỡ sự kiện.

Kết quả: một shell Linux hoàn chỉnh, truy cập từ bất cứ đâu, với hệ thống tệp tồn tại giữa các phiên -- mặc dù cơ sở hạ tầng bên dưới (runner GitHub Actions) hoàn toàn không được thiết kế cho việc này. Giới hạn thực sự duy nhất là timeout 6 giờ mỗi job -- sau đó phải khởi động lại workflow.

## 5. Bot tự mở pull request cho chính nó

Trên `konosuba-rpg`, push lên branch `dev` kích hoạt job kiểm tra xem đã có PR mở tới `main` chưa -- và tự động tạo nếu chưa, qua `actions/github-script` và GitHub REST API:

```js
const { data: comparison } = await github.rest.repos.compareCommits({
  owner, repo, base: 'main', head: 'dev',
});
if (comparison.ahead_by === 0) return;

const { data: existing } = await github.rest.pulls.list({
  owner, repo, state: 'open', head: `${owner}:dev`, base: 'main',
});
if (existing.length > 0) return;

await github.rest.pulls.create({
  owner, repo, head: 'dev', base: 'main',
  title: 'chore: auto PR from dev to main',
});
```

Chi tiết quan trọng ở đây là token được sử dụng. Workflow này **không** dùng `GITHUB_TOKEN` tự động -- nó yêu cầu secret `AUTO_PR_TOKEN` riêng, và từ chối tiếp tục nếu thiếu:

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

## 6. Xuất bản lên npm không cần secret

Yên tĩnh nhất trong năm cái, nhưng có lẽ quan trọng nhất cho tương lai: workflow `publish.yml` của `typescript-virtual-container` **không chứa bất kỳ secret npm nào**. Không `NPM_TOKEN`, không `NODE_AUTH_TOKEN`. Chỉ có thế này:

```yaml
permissions:
  id-token: write
  contents: read
jobs:
  publish:
    steps:
      - uses: actions/setup-node@v6
        with:
          registry-url: 'https://registry.npmjs.org'
      - run: npm publish
```

`npm publish` vẫn hoạt động, vì registry npm hiện hỗ trợ **trusted publishing** qua OIDC: workflow chứng minh danh tính trực tiếp với registry (repo chính xác + workflow chính xác, được cấu hình phía npmjs.org), không token tĩnh nào được truyền hay lưu trữ ở bất cứ đâu. Không secret để rò rỉ, không token để xoay vòng mỗi sáu tháng.

---

## GitHub secrets, đào sâu

Năm pattern này đều chạm đến, bằng cách này hay cách khác, vấn đề secrets. Vài nguyên tắc lặp đi lặp lại trong các workflow của tôi:

**Secret không nhất thiết là chuỗi đơn giản.** Trong `email-autoreply`, `ACCOUNTS_JSON` chứa toàn bộ JSON đã nén của cấu hình đa tài khoản -- không chỉ một API key, mà là một cấu trúc dữ liệu hoàn chỉnh, được tiêm nguyên dạng vào tệp lúc runtime:

```yaml
env:
  ACCOUNTS_JSON: ${{ secrets.ACCOUNTS_JSON }}
run: printf "%s" "$ACCOUNTS_JSON" > data/accounts.json
```

Điều này tránh phải commit tệp cấu hình, kể cả đã mã hóa, và có thể cập nhật bằng một cú click trong cài đặt repo mà không cần chạm vào code.

**`GITHUB_TOKEN` có giới hạn chính xác, và đó là cố ý.** Token tự động GitHub tiêm vào mỗi lần chạy rất mạnh, nhưng bị niêm phong ở một số điểm: mặc định nó không thể kích hoạt workflow khác, và tùy cấu hình repo có thể bị chặn bởi quy tắc bảo vệ branch. Đó chính là lý do `create-pull-request.yml` yêu cầu PAT riêng (`AUTO_PR_TOKEN`) -- token từ tài khoản thật (hoặc GitHub App), với quyền rõ ràng `contents:write` + `pull-requests:write`, tách biệt với token tạm thời của job.

**Quyền được scope theo từng job, không toàn cục.** Mỗi workflow tôi liệt kê ở đây đều khai báo khối `permissions:` tối thiểu và có chú thích:

```yaml
permissions:
  contents: read
  actions: read
  checks: write
```

`GITHUB_TOKEN` mặc định trong lịch sử có quyền khá rộng trên repo công khai; giới hạn rõ ràng chỉ những gì job thực sự cần sẽ hạn chế thiệt hại nếu một action bên thứ ba trong chuỗi bị xâm phạm.

**Secret tốt nhất là secret không tồn tại.** Pattern OIDC của `typescript-virtual-container` là phiên bản hoàn chỉnh nhất của ý tưởng này: thay vì quản lý vòng xoay, hết hạn và rủi ro rò rỉ của `NPM_TOKEN`, workflow chứng minh danh tính bằng mật mã (repo chính xác này, workflow chính xác này) trực tiếp với dịch vụ bên thứ ba. Logic tương tự có sẵn cho AWS, Docker Hub, PyPI -- ngày càng nhiều registry và cloud hỗ trợ OIDC từ GitHub Actions.

---

**3 điểm chính**

1. Một git tag (mồ côi, force-push) có thể làm cơ sở dữ liệu tối giản hoặc cache build đã biên dịch trước -- hai cách dùng khác nhau của cùng một cơ chế.
2. Một runner GitHub Actions miễn phí có thể trở thành shell SSH bền vững nếu bạn chấp nhận đồng bộ liên tục hệ thống tệp của nó vào một branch git, với tự động lưu qua `inotifywait` và một commit sửa đổi duy nhất.
3. `GITHUB_TOKEN` mặc định bị giới hạn có chủ đích -- tạo PR giữa các branch hoặc xuất bản không cần secret đòi hỏi hoặc PAT chuyên dụng, hoặc chuyển sang OIDC trusted publishing.
