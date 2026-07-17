---
title: "5 วิธีใช้ GitHub Actions อย่างแยบยล (และสิ่งที่สอนเกี่ยวกับ secrets)"
description: "CI runner กลายเป็น VPS ฟรี บอทที่เปิด PR ให้ตัวเอง การ publish npm แบบไม่มี secret เลยสักตัว ทัวร์ repo ต่างๆ เพื่อจัดแคตตาล็อก pattern GitHub Actions ที่มากกว่าแค่ \"lint + test + deploy\""
date: 2026-07-14
tags:
  - github-actions
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "yyi76kgVPewSDeJLG0JIdO8F/XLqAgt79z45Hov/2JJXF9SQ2lHWnvvNeRsuguAjfm0FEcajqYpvhAQNpKpaEA=="
---

# 5 วิธีใช้ GitHub Actions อย่างแยบยล

บนกระดาษ GitHub Actions มีไว้สำหรับ CI/CD แบบคลาสสิก: คุณ push มันก็ lint, test, deploy ผมเคยเขียนถึงกรณีพิเศษแล้ว -- การใช้ git tag เป็นฐานข้อมูลให้บอทอีเมล (ดูบทความเฉพาะ) แต่พอขุดดู repo ตัวเอง มี pattern แตกต่างกันมากพอที่จะคุ้มกับบทความเดี่ยว ที่ไม่โฟกัสแค่โปรเจกต์เดียว แต่เป็นแคตตาล็อกเทคนิคมากกว่า

ห้าอย่าง จากคลาสสิกที่สุดไปยันบิดเบี้ยวที่สุด

## 1. git tag เป็นสถานะถาวรระหว่างรัน

สรุปสั้น ๆ รายละเอียดเต็มอยู่ในบทความ `email-autoreply` GitHub Actions ถูกออกแบบมาแบบ stateless -- ทุกครั้งที่รันเริ่มจากเครื่องเปล่า วิธีเลี่ยง: เก็บค่า (ID, timestamp, สถานะเล็ก ๆ อะไรก็ได้) ใน git tag เฉพาะ ไม่ใช่ใน branch

```bash
# อ่านสถานะ
git show refs/tags/lastid:data/lastId > data/lastId

# เขียนสถานะ (orphan branch, commit เดียว, force-push tag)
git switch --orphan lastid-tmp
git commit -m "lastId snapshot"
git tag -f lastid
git push --force origin lastid
```

จุดสำคัญ: orphan branch เพื่อไม่ให้ประวัติสะสม และ forced tag แทน branch เพื่อไม่ให้รายการ branch ของ repo รก

## 2. git tag เป็นแคช build ที่คอมไพล์ไว้แล้ว

ตระกูลไอเดียเดียวกัน ใช้ต่างกัน: แทนที่จะเก็บสถานะแอป เก็บ **artefact ของ build** แทน job `build` คอมไพล์โค้ดครั้งเดียว (ตอน push ไป `master`) แล้ว push `dist/` + `node_modules/` ใส่ tag `runtime` job `cron` checkout tag นั้นโดยตรงแทนที่จะรัน `bun install && bun run build` ทุกครั้ง:

```yaml
- name: Checkout runtime snapshot
  uses: actions/checkout@v4
  with:
    ref: refs/tags/runtime
    fetch-depth: 1
# ไม่มี install ไม่มี build -- โค้ดพร้อมแล้ว
- run: node dist/index.js --action
```

นี่เปลี่ยนเวลารันจาก ~20s เหลือ ~10s สำหรับ cron ที่รันบ่อย ๆ มันสำคัญ `actions/cache` ก็ทำงานคล้ายกัน (แคช dependencies) แต่ git tag ตรงไปตรงมากว่าเมื่อคุณต้องการแช่แข็ง artefact ที่มีเวอร์ชันทั้งหมดแล้วชี้ไปตรง ๆ -- ไม่ใช่แค่เร่ง `npm install`

## 3. check บังคับตัวเดียวที่รวมหลาย job

pattern เล็ก ๆ ที่ดูไม่มีอะไรแต่เปลี่ยนชีวิตในการตั้งค่า branch protection บน `konosuba-rpg` CI มีสาม job อิสระ (`typecheck`, `lint`, `tests`) ที่ทำงานขนานกัน -- และ job ที่สี่ `test-battery` ที่ไม่ทำอะไรเลยนอกจาก dependency กับสามตัวแรก:

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

ถ้าไม่มี job ฉากหน้านี้ การตั้งค่า branch ที่ถูกป้องกันจะต้องติ๊ก check บังคับสามตัวแยกกัน -- และอัปเดตรายการนั้นทุกครั้งที่มี job เพิ่มหรือเปลี่ยนชื่อ ด้วย `test-battery` แค่ชื่อเดียวที่ต้องติ๊กใน setting repo และคงที่แม้รายละเอียดภายในจะเปลี่ยน

## 4. เปลี่ยน runner ฟรีเป็น VPS ชั่วคราว

อันนี้บิดเบี้ยวที่สุด และเป็นอันโปรดของผมชัด ๆ: `repo-to-vps` แอบใช้ GitHub Actions runner ผิดวัตถุประสงค์โดยสิ้นเชิงเพื่อเปลี่ยนมันเป็นเครื่อง Linux ที่เข้าได้ผ่าน SSH ฟรี นานสูงสุด 6 ชั่วโมง (เวลาสูงสุดของ job)

หลักการ: job ที่แทบไม่ทำอะไรเลยนอกจากรัน tmate:

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

ปัญหาจริง ๆ คือระบบไฟล์ของ runner GitHub Actions เป็นแบบ**ใช้แล้วทิ้ง** -- พอ job จบทุกอย่างก็หายไป เซสชัน SSH ที่อยู่นานหลายชั่วโมงจะไม่มีประโยชน์ถ้าทุกสิ่งที่คุณทำระเหยไปตอนรันครั้งหน้า วิธีแก้: git branch ที่ทำหน้าที่เป็น snapshot สดของระบบไฟล์ ซิงก์ต่อเนื่อง

สคริปต์ `start-tmate.sh` ทำตามลำดับดังนี้:

1. **กู้คืน** ระบบไฟล์จาก branch `filesystem` เฉพาะตอนเริ่ม job (`git reset --hard` ใส่)
2. **เฝ้าดู** การเปลี่ยนแปลงไฟล์ต่อเนื่องด้วย `inotifywait` และ **commit + push ทันที** เมื่อมีไฟล์เคลื่อนไหว:

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock)(/|$)' .; do
    commit_and_push
    sleep 1
  done
}
```

3. ทุกครั้งที่เซฟ **amend** commit ก่อนหน้าแทนที่จะสร้างใหม่ (`git commit --amend --no-edit`) ดังนั้น branch `filesystem` จะอยู่ที่ commit เดียวเสมอ -- ไม่มี snapshot เป็นพัน ๆ สะสม
4. ลูป `while true` รัน tmate ใหม่โดยอัตโนมัติถ้าเซสชันตาย โดยมี `remain-on-exit on` เพื่อให้ terminal ยังเข้าถึงได้แม้หลังจาก `exit`
5. SSH URL ที่ tmate สร้างถูกเขียนลงไฟล์ `host.conf` commit บน branch `filesystem` -- ดึงข้อมูลได้ผ่าน GitHub API (`gh api .../contents/host.conf`) โดยไม่ต้องเข้าถึง log ของ job แบบสด ๆ
6. รูทีน `periodic_save` ทำงานทุก 5 วินาทีในพื้นหลัง เผื่อ `inotifywait` พลาดเหตุการณ์

ผลลัพธ์: shell Linux เต็มรูปแบบ เข้าถึงได้จากทุกที่ พร้อมระบบไฟล์ที่คงอยู่ระหว่างเซสชัน -- ทั้งที่โครงสร้างพื้นฐานข้างใต้ (GitHub Actions runner) ไม่ได้ถูกออกแบบมาเพื่อสิ่งนี้เลย ข้อจำกัดจริง ๆ อย่างเดียวคือ timeout 6 ชั่วโมงต่อ job -- หลังจากนั้นต้องเริ่ม workflow ใหม่

## 5. บอทที่เปิด PR ให้ตัวเอง

บน `konosuba-rpg` การ push ไป branch `dev` จะ trigger job ที่ตรวจสอบว่ามี PR ที่เปิดไปยัง `main` อยู่แล้วหรือไม่ -- และสร้างให้โดยอัตโนมัติถ้ายังไม่มี ผ่าน `actions/github-script` และ GitHub REST API:

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

รายละเอียดที่สำคัญตรงนี้คือ token ที่ใช้ workflow นี้**ไม่**ใช้ `GITHUB_TOKEN` อัตโนมัติ -- มันต้องการ secret `AUTO_PR_TOKEN` แยกต่างหาก และปฏิเสธที่จะทำต่อถ้าไม่มี:

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

## 6. เผยแพร่ขึ้น npm โดยไม่มี secret เลย

เงียบที่สุดในห้าอย่าง แต่น่าจะสำคัญที่สุดสำหรับอนาคต: workflow `publish.yml` ของ `typescript-virtual-container` **ไม่มี secret ของ npm เลย** ไม่มี `NPM_TOKEN` ไม่มี `NODE_AUTH_TOKEN` มีแค่นี้:

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

`npm publish` ยังทำงานได้ เพราะ npm registry ตอนนี้รองรับ **trusted publishing** ผ่าน OIDC: workflow พิสูจน์ตัวตนโดยตรงกับ registry (repo ที่แน่นอน + workflow ที่แน่นอน กำหนดค่าฝั่ง npmjs.org) โดยไม่มี static token ใด ๆ ถูกส่งผ่านหรือเก็บไว้ที่ไหนเลย ไม่มี secret ให้รั่วไหล ไม่มี token ให้หมุนเวียนทุกหกเดือน

---

## GitHub secrets แบบเจาะลึก

ทั้งห้า pattern นี้แตะต้องปัญหาเรื่อง secrets ไม่ทางใดก็ทางหนึ่ง หลักการบางอย่างที่ปรากฏซ้ำ ๆ ใน workflow ของผม:

**secret ไม่จำเป็นต้องเป็นสตริงง่าย ๆ** ใน `email-autoreply` `ACCOUNTS_JSON` มี JSON ที่ย่อแล้วทั้งหมดของการตั้งค่าหลายบัญชี -- ไม่ใช่แค่ API key แต่เป็นโครงสร้างข้อมูลที่สมบูรณ์ ถูกฉีดเข้าไฟล์ตอน runtime ตามนั้น:

```yaml
env:
  ACCOUNTS_JSON: ${{ secrets.ACCOUNTS_JSON }}
run: printf "%s" "$ACCOUNTS_JSON" > data/accounts.json
```

นี่เลี่ยงการต้อง commit ไฟล์ตั้งค่า แม้จะเข้ารหัสแล้ว และอัปเดตได้ด้วยคลิกเดียวใน setting repo โดยไม่ต้องแตะโค้ด

**`GITHUB_TOKEN` มีข้อจำกัดที่แม่นยำ และนั่นตั้งใจ** token อัตโนมัติที่ GitHub ฉีดให้ทุกรันนั้นทรงพลัง แต่ถูกปิดตายในบางจุด: โดยค่าเริ่มต้นมัน trigger workflow อื่นไม่ได้ และขึ้นอยู่กับการตั้งค่า repo อาจถูกบล็อกโดยกฎ branch protection นั่นคือเหตุผลที่ `create-pull-request.yml` ต้องการ PAT แยก (`AUTO_PR_TOKEN`) -- token จากบัญชีจริง (หรือ GitHub App) ที่มีสิทธิ์ `contents:write` + `pull-requests:write` ชัดเจน แยกจาก token ชั่วคราวของ job

**permissions ถูก scope ทีละ job ไม่ใช่ทั้ง global** ทุก workflow ที่ผมลิสต์ไว้ที่นี่ประกาศบล็อก `permissions:` แบบน้อยที่สุดและมีคอมเมนต์:

```yaml
permissions:
  contents: read
  actions: read
  checks: write
```

`GITHUB_TOKEN` เริ่มต้นในอดีตมีสิทธ์ค่อนข้างกว้างบน repo สาธารณะ การจำกัดมันอย่างชัดแจ้งให้เหลือแค่สิ่งที่ job ต้องการจริง ๆ จะจำกัดความเสียหายถ้า action ของบุคคลที่สามในเชนถูกบุกรุก

**secret ที่ดีที่สุดคือ secret ที่ไม่มีอยู่** pattern OIDC ของ `typescript-virtual-container` เป็นเวอร์ชันที่สมบูรณ์ที่สุดของแนวคิดนี้: แทนที่จะจัดการการหมุนเวียน การหมดอายุ และความเสี่ยงการรั่วไหลของ `NPM_TOKEN` workflow พิสูจน์ตัวตนด้วยการเข้ารหัส (repo นี้แน่นอน workflow นี้แน่นอน) โดยตรงกับบริการภายนอก ตรรกะเดียวกันใช้ได้กับ AWS, Docker Hub, PyPI -- registry และ cloud จำนวนมากขึ้นเรื่อย ๆ รองรับ OIDC จาก GitHub Actions

---

**3 ประเด็นสำคัญ**

1. git tag (orphan, force-push) สามารถทำหน้าที่เป็นฐานข้อมูลแบบมินิมอลหรือแคช build ที่คอมไพล์ไว้แล้ว -- การใช้กลไกเดียวกันสองแบบที่ต่างกัน
2. GitHub Actions runner ฟรีสามารถกลายเป็น SSH shell แบบถาวรได้ถ้าคุณยอมรับการซิงก์ระบบไฟล์ต่อเนื่องไปยัง git branch ด้วยการเซฟอัตโนมัติผ่าน `inotifywait` และ commit แบบ amended เดียว
3. `GITHUB_TOKEN` เริ่มต้นถูกจำกัดโดยเจตนา -- การสร้าง PR ข้าม branch หรือการ publish โดยไม่มี secret ต้องใช้ PAT เฉพาะ หรือเปลี่ยนไปใช้ OIDC trusted publishing
