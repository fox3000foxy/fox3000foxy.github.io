---
title: >-
  5 วิธีทำนอกหลักสูตรในการใช้ GitHub Actions (และสิ่งที่มันสอนเกี่ยวกับความลับ)
description: >-
  รันเนอร์ CI ที่แปลงเป็น VPS ฟรี, บอทที่เปิด pull requests ของตัวเอง,
  การเผยแพร่ npm ไม่ต้องเปิดเผยความลับใด ๆ. ท่องดู repos ของฉันเพื่อบรรดารูปแบบ
  GitHub Actions ที่เกินกว่างานแบบ \"lint + ทดสอบ + เผยแพร่\".
date: 2026-07-14
tags:
  - github-actions
  - devops
  - automation
authors:
  - fox3000foxy
---

# 5 วิธีเบี่ยงเบนใช้ GitHub Actions

GitHub Actions, บนกระดาษดูเหมือนจะทำงานสำหรับ CI/CD แบบดั้งเดิม: คุณส่ง (push), มันจะทำ lint, มันจะทดสอบ, มันจะทำการ deploy. ฉันได้เขียนมาน้อยแล้วเกี่ยวกับกรณีพิเศษหนึ่ง (ใช้แท็ก git เป็นฐานข้อมูลสำหรับบอทอีเมล, ดูบทความอุทิศ). แต่เมื่อดูใน repo ของตัวเองก็พบรูปแบบต่าง ๆ เพียงพอที่จะทำให้บทความนี้เป็นเรื่องแยกจากเดียวกัน, เกี่ยวกับโปรเจกต์เดียว, แต่เป็นคาตาเลกของเทคนิค.

ห้าแง่มุมการใช้งาน, ตั้งแต่ที่เป็นแบบดั้งเดิมถึงที่เลี่ยงหลอนที่สุด.

## 1. แท็ก git เป็นสถานะระหว่างการรันสองครั้ง

คำเตือนสั้น ๆ, รายละเอียดเต็มอยู่ในบทความเกี่ยวกับ `email-autoreply`. GitHub Actions ถูกออกแบบให้ stateless: แต่ละรันเริ่มจากเครื่องใหม่ทุกครั้ง. ทางหลีกเลี่ยงคือ: เก็บค่าลงในแท็ก git เฉพาะ (ไม่ใช่ branch) เช่น ID, timestamp หรือสถานะเล็ก ๆ

```bash
# อ่านสถานะ
git show refs/tags/lastid:data/lastId > data/lastId

# เขียนสถานะ (สาขาแยกหายไป, คอมมิตเดียว, force-push แท็ก)
git switch --orphan lastid-tmp
git commit -m "สำเนา lastId"
git tag -f lastid
git push --force origin lastid
```

จุดสำคัญ: สาขาหายไปโดยไม่มีการสะสมประวัติ และแท็กบังคับแทนสาขาเพื่อไม่ทำให้รายการสาขาของ repo ถูกปนเปื้อน

## 2. แท็ก Git ใช้เป็นแคชการคอมไพล์ที่ทำล่วงหน้า

แนวคิดเดียวกัน ใช้ในทางอื่น: แทนที่จะเก็บสถานะแอปพลิเคชัน, เราจึงเก็บ **อาร์ติเฟกต์ของการคอมไพล์**.  
งาน `build` จัดทำคอมไพล์โค้ดครั้งเดียว (เมื่อ push ไปยัง `master`), จากนั้นผลัก `dist/` + `node_modules/` ไปยังแท็ก `runtime`.  
งาน `cron` ก็จะ checkout แท็กนี้โดยตรง แทนที่จะรัน `bun install && bun run build` ทุกครั้งที่ทำงาน:

```yaml
- name: Checkout runtime snapshot
  uses: actions/checkout@v4
  with:
    ref: refs/tags/runtime
    fetch-depth: 1
# ไม่ต้องติดตั้ง ไม่ต้องสร้าง -- โค้ดพร้อมใช้งานแล้ว
- run: node dist/index.js --action
```

ฉันเปลี่ยนเวลาการรันจากประมาณ 20 วินาทีเป็นประมาณ 10 วินาที เมื่อใช้ cron ที่ทำงานบ่อย ๆ นั่นเป็นเรื่องสำคัญ `actions/cache` ทำงานคล้าย ๆ กัน (จัดเก็บ dependencies ใน cache) แต่แท็ก git จะตรงกว่าเมื่อฉันต้องการจะจําหนง artefact ที่มีเวอร์ชันและชี้มันโดยตรง แทนที่จะเพียงแค่เร่ง `npm install`

## 3. เพียง check เดียวที่รวมหลายงาน

รูปแบบเล็ก ๆ ที่ดูเหมือนจะไม่สำคัญแต่เปลี่ยนชีวิตในการตั้งค่า branch ที่ป้องกัน

ใน `konosuba-rpg`, CI มีสามงานอิสระ (`typecheck`, `lint`, `tests`) ทำงานพร้อมกัน และงานที่สี่คือ `test-battery` ซึ่งทำไมครุยแค่ขึ้นกับสามงานแรก :

```yaml
test-battery:
  needs:
    - typecheck
    - lint
    - tests
  runs-on: ubuntu-latest
  steps:
    - run: echo "Typecheck, lint และ tests สำเร็จ."
```

ถ้าไม่มีงานหน้าชิ้นนี้ การกำหนดเงื่อนไขให้มีสาขาป้องกัน (protected branch) จะต้องทำเครื่องหมายให้ครบสามรายการตรวจสอบแยกกัน แล้วต้องอัปเดตรายการนี้ทุกครั้งที่มีการเพิ่มหรือตั้งชื่อใหม่ของ job ในขณะที่ด้วย `test-battery` เรามีเพียงชื่อตัวเดียวที่จะต้องเลือกในตั้งค่าของเอกสารนี้ ซึ่งจะคงที่แม้รายละเอียดภายในจะเปลี่ยนแปลง

## 4. แปลง runner ฟรีให้เป็น VPS ชั่วคราว

ตัวนี้เป็นตัวที่ซับซ้อนที่สุดทั้งหมด และเป็นที่ชอบอย่างชัดเจน: `repo-to-vps` เปลี่ยนใช้การใช้งานที่ตั้งใจไว้ของ runner ของ GitHub Actions ให้กลายเป็นเครื่อง Linux ที่สามารถเข้าถึงได้ผ่าน SSH, ฟรี, และใช้งานได้สูงสุด 6 ชั่วโมง (ขีดจำกัดสูงสุดของ job)

หลักการคือ: งานหนึ่งที่แทบทำไมต่ออย่างอื่นแต่จะเรียกใช้ [tmate](https://tmate.io/) (ปลดสาขา tmux ที่ให้เซสชันเทอร์มินัลสามารถใช้ร่วมกันผ่าน SSH หรือเว็บ) :

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

ปัญหาแท้จริงคือระบบไฟล์ของ runner GitHub Actions เป็น **ใช้ทิ้งได้** : ตอ้งงานเสร็จสิ้น ทุกอย่างก็หายไป การเเถ้เชือก SSH ที่ใช้เวลาหลายชั่วโมงก็ไม่มีประโยชน์ หากสิ่งที่คุณทำจบอยุติไปเมื่อเดินรันครั้งต่อไป วิธีแก้ไข : สาขา git ที่ทำหน้าที่เป็นสแนปช็อตสดุดีของระบบไฟล์ ส่งซิงค์ต่อเนื่อง

สคริปต์ `start-tmate.sh` ทำตามลำดับดังนี้ :

1. **ฟื้นระบบไฟล์** จากสาขาเฉพาะ `filesystem` เมื่อเริ่มงาน (`git reset --hard` บนสาขานั้น)
2. **เฝ้าระวังการเปลี่ยนแปลงของไฟล์** ด้วย `inotifywait` อย่างต่อเนื่อง และ **ตัดสิน + ส่งผลบันทึก** ทันทีเมื่อไฟล์มีการเคลื่อนย้าย :

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock)(/|$)' .; do
    commit_and_push
    sleep 1   # ลดความถี่
  done
}
```

3. ทุกการสำรองข้อมูล **แก้ไข** คอมมิตก่อนหน้าแทนการสร้างคอมมิตใหม่ (`git commit --amend --no-edit`), ดังนั้นสาขา `filesystem` จะยังคงมีคอมมิตเดียวเสมอ ซึ่งช่วยป้องกันการสะสมของ snapshot หลายพันสเตจ  
4. ลูป `while true` จะรีสตาร์ท `tmate` โดยอัตโนมัติถ้าส่วนเบื้องต้นตาย, ด้วย `remain-on-exit on` เพื่อให้เทอร์มินัลยังคงเข้าถึงได้แม้หลังจาก `exit`  
5. URL SSH ที่สร้างโดย tmate จะถูกบันทึกไว้ในไฟล์ `host.conf`, คอมมิตในสาขา `filesystem`, ดังนั้นจึงสามารถดึงได้ผ่าน API GitHub (`gh api .../contents/host.conf`) โดยไม่ต้องเข้าถึง log ของงานแบบสด  
6. กระบวนการ `periodic_save` ทำงานทุก ๆ 5 วินาทีใน background, ในกรณีที่ `inotifywait` ลืมเหตุการณ์  

Result : หน้าจอ Linux ที่สมบูรณ์, สามารถเข้าถึงได้ทุกที่, พร้อม filesystem ที่ยั่งยืนระหว่าง session, ในขณะที่โครงสร้างพื้นฐาน (runner GitHub Actions) ไม่ได้ออกแบบมาเพื่อเท่านี้. การจำกัดจริง ๆ คือเวลา timeout 6h ต่อ job: หลังจากนั้นต้องรีสตาร์ท workflow  

## 5. บอทที่เปิด pull requests ของตนเอง  

บน `konosuba-rpg`, บริการ push ไปสาขา `dev` จะเรียกจ็อบที่ตรวจสอบว่ามี pull request เปิดอยู่แล้วต่อ `main` หรือไม่ แล้วสร้างอัตโนมัติหากไม่มี, ผ่าน `actions/github-script` และ API REST GitHub :

```js
const { data: comparison } = await github.rest.repos.compareCommits({
  owner, repo, base: 'main', head: 'dev',
});
if (comparison.ahead_by === 0) return; // ไม่มีอะไรเสนอ

const { data: existing } = await github.rest.pulls.list({
  owner, repo, state: 'open', head: `${owner}:dev`, base: 'main',
});
if (existing.length > 0) return; // มี PR เปิดอยู่แล้ว

await github.rest.pulls.create({
  owner, repo, head: 'dev', base: 'main',
  title: 'chore: auto PR from dev to main',
});
```

รายละเอียดที่สำคัญในที่นี้คือโทเค็นที่ใช้. เวิร์กโฟลว์นี้ **ไม่**ใช้ `GITHUB_TOKEN` อัตโนมัติ : มันต้องการความลับ `AUTO_PR_TOKEN` แยกต่างหาก และจะปฏิเสธการดำเนินต่อถ้าไม่พบ :

```yaml
- name: Validate pull request token
  env:
    AUTO_PR_TOKEN: ${{ secrets.AUTO_PR_TOKEN }}
  run: |
    if [ -z "$AUTO_PR_TOKEN" ]; then
      echo "AUTO_PR_TOKEN ต้องการเป็นสิ่งจำเป็น... ใช้ PAT หรือ GitHub App token ด้วยสิทธิ์ contents:write และ pull-requests:write."
      exit 1
    fi
```

## 6. เผยแพร่บน npm โดยไม่มีความลับใด ๆ

เป็นเรื่องที่ละเอียดอ่อนที่สุดในห้าตัว แต่คงเป็นสิ่งสำคัญที่สุดสำหรับอนาคต: workflow `publish.yml` ของ `typescript-virtual-container` ไม่ได้บรรจุ **รหัสผ่าน npm ใด ๆ**. ไม่มี `NPM_TOKEN` ใด ๆ, ไม่มี `NODE_AUTH_TOKEN` ใด ๆ. แค่แค่นี้:

```yaml
permissions:
  id-token: write  # จำเป็นสำหรับ OIDC
  contents: read
jobs:
  publish:
    steps:
      - uses: actions/setup-node@v6
        with:
          registry-url: 'https://registry.npmjs.org'
      - run: npm publish
```

```text
`npm publish` marche quand même, parce que le registre npm supporte désormais le **trusted publishing** via OIDC : le workflow prouve son identité directement au registre (repo + workflow exacts, configurés côté npmjs.org), sans qu'aucun token statique ne transite ni ne soit stocké nulle part. Zéro secret à faire fuiter, zéro token à faire tourner tous les six mois.

---

## Les secrets GitHub, en profondeur

Ces cinq patterns touchent tous, d'une manière ou d'une autre, à la question des secrets. Quelques principes qui reviennent partout dans mes workflows :

**Un secret n'est pas forcément une chaîne simple.** Dans `email-autoreply`, `ACCOUNTS_JSON` contient le JSON minifié entier de la config multi-comptes : une structure de données complète plutôt qu'une simple clé API, injectée telle quelle dans un fichier au runtime :
```

```yaml
env:
  ACCOUNTS_JSON: ${{ secrets.ACCOUNTS_JSON }}
run: printf "%s" "$ACCOUNTS_JSON" > data/accounts.json
```

มันช่วยหลีกเลี่ยงการต้อง commit ไฟล์คอนฟิก แม้จะเข้ารหัสแล้ว และมันอัปเดตในคลิกเดียวใน settings ของ repo โดยไม่ต้องแก้ไขโค้ด

**`GITHUB_TOKEN` มีขีดจำกัดที่ชัดเจน, และมันเป็นสิ่งที่ตั้งใจ.**

โทเคนอัตโนมัติที่ GitHub แทรกทุกครั้งของการรันนั้นมีพลัง แต่มีข้อจำกัดบางประการ: โดยปริยาย, มันไม่สามารถเรียกใช้งาน workflow อื่น ๆ ได้, และตามการตั้งค่าของ repo มันอาจถูกบล็อกโดยกฎการปกป้องสาขา

นั่นเป็นเหตุผลที่ `create-pull-request.yml` ต้องการ PAT (`AUTO_PR_TOKEN`) แยก: โทเคนที่มาจากบัญชีจริง (หรือ GitHub App), มีสิทธิ์แบบชัดเจน `contents:write` + `pull-requests:write`, แตกต่างจากโทเคนชั่วคราวของ job

**สิทธิ์ถูกกำหนดให้กับ job แรกละ job ไม่ใช่ทั่วโลก.**  
แต่ละ workflow ที่ฉันได้อธิบายไว้ที่นี่ประกาศบล็อก `permissions:` อย่างน้อยที่สุดและมีความหมายคอมเมนต์:

```yaml
permissions:
  contents: read
  actions: read
  checks: write
  # เฉพาะการเขียนตรวจสอบ ทุกอย่างอื่นเป็นแบบอ่านอย่างเดียว
```

Le `GITHUB_TOKEN` par défaut a historiquement des droits assez larges sur un repo public ; le restreindre explicitement à ce dont le job a réellement besoin limite les dégâts si une action tierce dans la chaîne (`uses: quelqu-un/action@version`) se révèle compromise.

**Le meilleur secret est celui qui n'existe pas.**  
Le pattern OIDC de `typescript-virtual-container` est la version la plus aboutie de cette idée : au lieu de gérer la rotation, l'expiration et le risque de fuite d'un `NPM_TOKEN`, le workflow prouve cryptographiquement son identité (ce repo précis, ce workflow précis) directement au service tiers. Même logique disponible pour AWS, Docker Hub, PyPI : de plus en plus de registres et clouds supportent OIDC depuis GitHub Actions.

---

**3 points clés**

1. Un tag git (orphelin, force-pushé) peut servir de base de données minimaliste ou de cache de build précompilé : deux usages distincts du même mécanisme.

2. Un runner GitHub Actions gratuit peut devenir un shell SSH persistant si on accepte de synchroniser son filesystem en continu vers une branche git, avec autosave par `inotifywait` et un seul commit amendé.

3. Le `GITHUB_TOKEN` par défaut est volontairement limité : créer des PR inter-branches ou publier sans secret demande soit un PAT dédié, soit un passage à l'OIDC trusted publishing.
