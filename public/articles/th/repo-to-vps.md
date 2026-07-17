---
title: "Repo to VPS : เปลี่ยน GitHub Actions เป็น VPS ฟรีพร้อมพื้นที่เก็บข้อมูลถาวร"
description: วิธีเปลี่ยน GitHub Actions runner ให้เป็น VPS ถาวรโดยใช้ git เป็นพื้นที่เก็บข้อมูลถาวร -- tmate, inotify และ commit --amend
date: 2026-05-29
authors:
  - fox3000foxy
tags:
  - github
  - devops
  - automation
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "Tmr+rGp7cOFxX7XognWEaaLP35oDMumbKocXzbcBMO4Pwu6LPyGWw5BFeR8kn+vVpVY2pJkQ2qWzntjt25nvew=="
---

## GitHub แจก VPS ฟรีให้คุณ 6 ชั่วโมง ฉันหาวิธีทำให้มันถาวรได้แล้ว

GitHub Actions ให้เครื่อง Linux ฟรีคุณ

ใช่แล้ว เซิร์ฟเวอร์ Ubuntu จริง ๆ 2 คอร์, RAM 7 GB, ดิสก์ 14 GB ฟรี นาน 6 ชั่วโมงต่อ run

"ปัญหา" เดียวคือ ตอนจบ run ทุกอย่างถูกลบ เครื่องถูกทิ้ง คุณติดตั้งของ เขียนโค้ด ตั้งค่า... แล้วปุ๊บ ตอนจบทุกอย่างหายไป เหมือนคุณไม่ได้ทำอะไรเลย

ยกเว้นแต่

ยกเว้นแต่คุณใช้ **git เป็นฮาร์ดดิสก์**

และแล้ว ทันใดนั้น คุณก็มี VPS ฟรีพร้อมดิสก์ถาวรที่อยู่รอดข้าม run คุณ reconnect ทุกอย่างยังอยู่ คุณกลับมาต่อจากที่ค้างไว้

มันบ้าแตกเลย ให้ฉันอธิบายหน่อย xD

---

## บริบท : GitHub Actions runners

เมื่อคุณรัน workflow GitHub Actions, GitHub จะให้ VM คุณ

มันถูกออกแบบมาให้ build โค้ดของคุณ รันเทส deploy ของคุณ workflow ทำงาน เสร็จภารกิจ แล้วเครื่องก็ถูกทำลาย

แต่ไม่มีอะไรห้ามคุณทำอย่างอื่นกับ VM นี้ เช่น เปิด shell SSH บนนั้นแล้วใช้มันเป็นเซิร์ฟเวอร์

เรื่องคือ เครื่องเหล่านี้เป็น **stateless** และ **ชั่วคราว** :
- ชั่วคราว : สูงสุด 6 ชม. ต่อ run (`timeout-minutes: 360`, เพดานของ GitHub)
- Stateless : ทุกอย่างถูกลบตอนจบ

เพราะฉะนั้นเพื่อทำให้เป็น VPS ที่ใช้งานได้ ต้องแก้สองปัญหา :
1. **จะเชื่อมต่อแบบ real-time ได้ยังไง ?**
2. **จะเก็บดิสก์ข้ามแต่ละ run ได้ยังไง ?**

ตรงนี้แหละที่กลายเป็น hack สกปรก

---

## ปัญหาที่ 1 : SSH แบบ live ด้วย tmate

**tmate** คือ fork ของ tmux ที่สร้าง session SSH ที่แชร์ได้

คุณรันมันบนเครื่อง มันจะสร้างลิงก์สองอัน :
- URL SSH (`ssh xxx@nyc1.tmate.io`)
- URL เว็บ (terminal ในเบราว์เซอร์)

คุณเชื่อมต่อด้วยลิงก์ใดลิงก์หนึ่ง แล้ว boom คุณอยู่ใน shell บนเครื่อง แบบ real-time

workflow ก็เลยรัน tmate :

```bash
tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
tmate -S /tmp/tmate.sock set-option -g remain-on-exit on

# ดึงลิงก์เชื่อมต่อ
tmate_ssh=$(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}')
tmate_web=$(tmate -S /tmp/tmate.sock display -p '#{tmate_web}')
```

และลิงก์เหล่านี้ถูกเขียนลง README ของ repo โดยตรงด้วย Python script คุณเปิด repo คุณเห็นลิงก์เชื่อมต่อ คุณคลิก คุณก็อยู่ใน VPS ของคุณแล้ว

ปัญหาแรกแก้ได้ แต่อันที่สองนี่บ้าจริง

---

## ปัญหาที่ 2 : git เป็นฮาร์ดดิสก์

นี่คือสิ่งที่บ้า

เครื่องถูกลบทุก run ดังนั้นเราเก็บ **ระบบไฟล์ไว้ใน branch git ที่แยกต่างหาก** ชื่อว่า `filesystem`

ตอนเริ่มต้น script จะ restore สถานะจาก branch นี้ :

```bash
filesystem_branch="filesystem"

# ดึง branch filesystem จาก remote
git fetch origin "$filesystem_branch":refs/remotes/origin/$filesystem_branch

# restore workspace จาก branch นี้
git checkout -B filesystem-workspace "refs/remotes/origin/$filesystem_branch"
git reset --hard "refs/remotes/origin/$filesystem_branch"
```

branch `filesystem` คือฮาร์ดดิสก์ของคุณ ไฟล์ของคุณ การติดตั้งของคุณ config ของคุณ -- ทุกอย่างอยู่ในนั้น

เห็นมั้ย ? เครื่องทิ้งได้ แต่ดิสก์อยู่ใน git คุณรัน workflow ใหม่ ดิสก์ถูก restore คุณกลับมาต่อตรงที่ค้างไว้

มันเหมือน VPS ที่ hibernate ต่างแค่ hibernation คือ repo git xD

### รันแรก : สร้างดิสก์เปล่า

ใน run แรกสุด branch `filesystem` ยังไม่มี ต้องสร้างมัน และนี่ไม่ใช่เรื่องเล็ก :

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

`git checkout --orphan` คือกุญแจสำคัญ branch กำพร้าคือ branch **ที่ไม่มีประวัติใด ๆ** -- เหมือนเริ่มต้นจาก repo เปล่า

ทำไมต้องกำพร้า ? เพราะคุณไม่ต้องการให้ดิสก์ถาวรของคุณลากประวัติโค้ดต้นฉบับทั้งหมดมาด้วย ดิสก์เป็นของแยกต่างหาก มีชีวิตของมันเอง มันเริ่มต้นแบบบริสุทธิ์

และ `git ls-remote --exit-code` ตอนต้น ก็แค่ check สะอาด ๆ : "branch นี้มีบน remote แล้วหรือยัง ?" ถ้ามีแล้ว ก็ไม่แตะ ถ้ายังไม่มี ก็สร้าง Idempotent อย่างที่ชอบ

### git clean แบบเลือกได้ : ป้องกัน cache

บรรทัดนี้ควรหยุดดู :

```bash
git clean -fdx -e .apt-cache -e .cache -e host.conf -e tmate.sock
```

`git clean -fdx` มันลบทุกอย่างที่ git ไม่ได้ track ปกติมันรุนแรง -- มันล้าง workspace หมดจด

แต่ `-e` (exclude) ปกป้องบางอย่าง :
- `.apt-cache` → cache ของแพ็กเกจ APT (เดี๋ยวกลับมาเรื่องนี้ มันฉลาด)
- `.cache` → cache ทั่วไป
- `host.conf` → ที่อยู่ SSH ของ session
- `tmate.sock` → socket ของ session tmate ปัจจุบัน

ถ้าคุณลบไฟล์พวกนี้ คุณจะทำลาย session ปัจจุบันหรือเสีย cache ดังนั้นเราจึงยกเว้นมันตอน reset

รายละเอียดเล็กน้อยเมื่อมองครั้งแรก แต่ถ้าไม่มีมันทุกอย่างพัง

---

## Autosave : inotify ที่จับตาดูทุกอย่าง

แล้ว ไฟล์ต่าง ๆ ไปอยู่ใน branch `filesystem` ได้ยังไง ?

คำตอบ : watcher ที่เฝ้าดูการเปลี่ยนแปลงของไฟล์ทั้งหมดและ commit/push โดยอัตโนมัติ

เครื่องมือมหัศจรรย์คือ **inotifywait** (จากแพ็กเกจ `inotify-tools`) มันเฝ้าดูระบบไฟล์ในระดับ kernel และทำงานทันทีที่ไฟล์เปลี่ยน

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock|\.gitignore|\.txt\.swp)(/|$)' .; do
    echo "[autosave] change detected"
    commit_and_push
    sleep 1   # debounce ในกรณีที่มีหลายเปลี่ยนแปลงพร้อมกัน
  done
}

autosave &
```

มาดู flags ของ inotify กัน แต่ละตัวสำคัญ :
- `-r` → recursive เฝ้าดูทุกโฟลเดอร์ย่อย
- `-e modify,create,delete,move` → ตอบสนองต่อ 4 ประเภทเหตุการณ์นี้
- `--exclude '...'` → regex เพื่อไม่รวมบางไฟล์

`--exclude` สำคัญมาก ดูว่ามันไม่รวมอะไรบ้าง :
- `.git` → แน่นอน ไม่อย่างนั้นทุก commit จะ trigger autosave ที่ trigger commit... loop อนันต์ หายนะ
- `.apt-cache` และ `.cache` → cache ที่เปลี่ยนแปลงตลอดและเราไม่ต้องการ spam ลง git
- `host.conf` และ `tmate.sock` → ไฟล์ session ที่เปลี่ยนแปลงตลอด
- `.gitignore`, `.txt.swp` → ไฟล์ชั่วคราว (`.swp` คือไฟล์ขณะแก้ไขของ vim)

ถ้าไม่มี exclude นี้ คุณจะเจอ autosave ที่ trigger ซ้ำกับตัวเอง `.git` ในรายการคือบรรทัดที่ป้องกันคุณจากการยิงตัวเองตาย

คุณแก้ไขไฟล์ ? inotify ตรวจจับทันที มัน commit มัน push ภายในไม่ถึงวินาที การเปลี่ยนแปลงของคุณอยู่ใน branch `filesystem`

คุณติดตั้งอะไรสักอย่าง คุณเขียนโค้ด คุณแตะ config -- ทุกอย่างถูกบันทึกแบบ real-time อัตโนมัติ โดยที่คุณไม่ต้องทำอะไรเลย

คุณมีระบบสำรองข้อมูลอัตโนมัติของทั้งดิสก์ บ้าไปแล้ว

### Debounce : อย่า spam git

`sleep 1` หลังแต่ละ save คือ **debounce**

เมื่อคุณบันทึกไฟล์ใน editor มักจะเกิดเหตุการณ์ filesystem หลายครั้งเป็นระลอก (สร้าง temp file, rename, ลบของเก่า...) โดยไม่มี debounce คุณจะได้ 3-4 commit ต่อการบันทึกครั้งเดียว

`sleep 1` บอกว่า : "รอ 1 วินาทีหลัง save ให้ระลอกสงบก่อนฟังอีก" มันรวมการเปลี่ยนแปลงที่ใกล้กันเป็น commit เดียว ฉลาด

### และการบันทึกเป็นระยะอีกขั้น

เผื่อ inotify พลาดอะไรไป ก็มี save ทุก 5 วินาทีด้วย :

```bash
periodic_save() {
  while true; do
    sync_from_remote   # ดึงการเปลี่ยนแปลงระยะไกลที่อาจมี
    sleep 5
    commit_and_push
  done
}

periodic_save &
```

คาดเข็มขัดและเอาเชือกผูก เราไม่อยากเสียสถานะดิสก์เด็ดขาด

---

## รายละเอียดที่ฉลาด : commit เดียว

ถ้าคุณ commit ทุกครั้งที่ไฟล์เปลี่ยน คุณจะสะสมเป็นพัน commit ในหนึ่งชั่วโมง ประวัติ git ของคุณจะระเบิด repo ใหญ่ขึ้น มันเละเทะ

วิธีแก้สง่างาม : **เรา amend commit ที่มีอยู่** แทนที่จะสร้างใหม่

```bash
commit_and_push() {
  (
    flock -n 200 || return   # lock ป้องกันไม่ให้สอง saves รันพร้อมกัน

    git add -A
    git reset -- .github/workflows/ .github/scripts/   # อย่าแตะ scripts

    if ! git diff --cached --quiet; then
      if git rev-parse --verify HEAD >/dev/null 2>&1; then
        git commit --amend --no-edit    # AMEND : ทับ commit ก่อนหน้า
      else
        git commit -m "autosave $(date -u +%Y%m%dT%H%M%SZ)"
      fi
      git push --force origin "filesystem-workspace:filesystem"
    fi
  ) 200>/tmp/tmate_autosave.lock
}
```

`git commit --amend` แปลว่า : "แทนที่ commit ล่าสุดด้วยอันนี้"

ดังนั้น branch `filesystem` จะมี **แค่ commit เดียวเสมอ** ไม่สำคัญว่าคุณบันทึกกี่ครั้ง มันเป็น snapshot ของสถานะปัจจุบัน force-push ซ้ำแล้วซ้ำเล่า

`flock` คือล็อก : เพราะมีสอง loop บันทึก (inotify + เป็นระยะ) ต้องป้องกันไม่ให้ทั้งคู่รัน git พร้อมกันและเหยียบกันเอง ครั้งละหนึ่ง process git เท่านั้น

สะอาด

---

## Sync_from_remote : จัดการหลาย session

นี่คือสิ่งที่คุณอาจไม่คิดตอนแรก : แล้วถ้าคุณรัน TWO runs พร้อมกันล่ะ ? หรือถ้า session หนึ่งแก้ไข branch `filesystem` ขณะที่อีก session ทำงาน ?

script จัดการด้วย `sync_from_remote` ก่อนแต่ละ commit :

```bash
sync_from_remote() {
  git fetch origin "filesystem":refs/remotes/origin/filesystem
  git merge --ff-only "refs/remotes/origin/filesystem"
}
```

`--ff-only` (fast-forward only) สำคัญ : แปลว่า "merge เฉพาะเมื่อสามารถเดินหน้าได้อย่างสะอาด โดยไม่ต้องสร้าง merge commit"

ถ้าทั้งสอง branch แยกกัน (เช่น สอง session แก้ไขคนละอย่าง) fast-forward จะล้มเหลวเงียบ ๆ (`2>/dev/null || true`) และคงสถานะ local ไว้ มันไม่ใช่ระบบ merge ที่สมบูรณ์แบบ แต่ป้องกัน corruption ในกรณีง่าย ๆ ที่มีแค่ session เดียวทำงาน

จริง ๆ ไม่ควรเปิด 3 session พร้อมกันใน repo เดียว แต่โค้ดก็พยายามไม่ระเบิดถ้ามันเกิดขึ้น นี่คือการป้องกัน

---

## Cache APT : ติดตั้งเร็ว

มีรายละเอียดใน workflow ที่ดูไม่สำคัญแต่คิดมาอย่างดี :

```yaml
- name: Cache & install APT packages (tmate + watcher)
  uses: awalsh128/cache-apt-pkgs-action@v1.6.0
  with:
    packages: tmate inotify-tools
```

tmate และ inotify-tools ถูกติดตั้งผ่าน action ที่ **cache แพ็กเกจ APT**

ใน run แรก มันดาวน์โหลดและติดตั้ง ใน run ต่อ ๆ ไป มันถูก restore จาก cache ของ GitHub Actions -- เร็วขึ้น ไม่ต้องโหลดใหม่

และจำ `git clean -fdx -e .apt-cache` เมื่อกี้ได้มั้ย ? มันเกี่ยวข้องกัน โฟลเดอร์ `.apt-cache` ถูกป้องกันจากการล้างเพื่อให้แพ็กเกจที่คุณติดตั้งระหว่าง session สามารถคงอยู่ได้บ้าง

ทุกอย่างเชื่อมโยงกัน ฉันคิดถึงวงจรชีวิตทั้งหมดแล้ว

---

## Scripts ที่ซ่อนใน /tmp

อีกรายละเอียดที่แสบแต่ฉลาด ตอนต้นของ script :

```bash
RUNNER_SCRIPTS_DIR="/tmp/runner-scripts"
rm -rf "$RUNNER_SCRIPTS_DIR"
mkdir -p "$RUNNER_SCRIPTS_DIR"
cp -r .github/scripts "$RUNNER_SCRIPTS_DIR/"
```

Scripts (`update_readme.py`, ฯลฯ) ถูกคัดลอกไป `/tmp` ก่อนที่จะแตะต้อง branch `filesystem`

ทำไม ? เพราะเมื่อคุณทำ `git reset --hard` ไปที่ branch `filesystem` (ซึ่งว่างตอนแรก หรือมีดิสก์ของคุณอยู่) ไฟล์ `.github/scripts` จาก repo ต้นทางจะหายไปจาก workspace

แต่ script ยังต้องการมันระหว่าง session (เพื่อ update README ทุกครั้งที่ tmate เริ่มใหม่) ดังนั้นมันจึงซ่อนไว้ใน `/tmp` ให้พ้นจาก git :

```bash
python3 "$RUNNER_SCRIPTS_DIR/scripts/update_readme.py" --ssh "$tmate_ssh" ...
```

ถ้าคุณไม่คิดถึงตรงนี้ คุณจะเสียเวลา 30 นาทีงงว่า script หายไปไหน ฉันคิดถึงมันแล้ว

---

## Shell ที่ปรับแต่งเอง

ความสะดวกเล็กน้อย : session ให้ shell ที่ตั้งค่าแล้ว ไม่ใช่ bash เปล่า ๆ

`prestart.sh` คัดลอก `.bashrc` ที่กำหนดเอง :

```bash
if ! grep -q "Custom prompt and aliases for remote sessions" "$HOME/.bashrc"; then
  cp .github/scripts/remote_bashrc "$HOME/.bashrc"
fi
sudo cp "$HOME/.bashrc" /root/.bashrc
```

และ `.bashrc` นี้มี prompt สี, alias (`ll`, `lla`, `rm -i`), และที่สำคัญคือ override ของ `exit` :

```bash
exit() {
    killall -9 -u "$(whoami)" tmate 2>/dev/null || true
    builtin exit "$@"
}

# Ctrl+D ทำเหมือน exit
bind -x '"\C-d": "exit"'
```

เมื่อคุณพิมพ์ `exit` (หรือ Ctrl+D) มันจะ kill process tmate อย่างสะอาดก่อนปิด ป้องกันไม่ให้เหลือ session tmate zombie

ยังมีฟังก์ชัน `tmate-detach` ถ้าคุณต้องการตัดการเชื่อมต่อ โดยไม่ฆ่า session (เพื่อ reconnect ทีหลัง) รายละเอียดเพื่อความสะดวก แต่แสดงถึงระดับความใส่ใจ

---

## tmate ที่เริ่มตัวเองใหม่

ความสะดวกเล็กน้อย : ถ้าคุณพิมพ์ `exit` ใน shell ปกติ session tmate จะตายและคุณจะขาดการเชื่อมต่อถาวร

แต่ที่นี่ tmate อยู่ใน loop `while true` :

```bash
while true; do
  tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
  while tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}' >/dev/null 2>&1; do
    sleep 2
  done
  echo "tmate session ended; restarting..."
done
```

คุณ `exit` ? session จะเริ่มใหม่เอง คุณ reconnect ด้วยลิงก์เดิม

มันบ้าแต่ทำให้มันใช้ได้

---

## การ reconnect ด้วยคำสั่งเดียว

คุณจะ reconnect หลังจากขาดการเชื่อมต่อ โดยไม่ต้องไปค้น log ของ run ทุกครั้งได้ยังไง ?

ที่อยู่ SSH ของ tmate ถูกเขียนในไฟล์ `host.conf` ที่ commit ไว้ใน branch `filesystem` :

```bash
printf '%s' "${tmate_ssh#ssh }" > host.conf
```

และเพราะไฟล์นี้อยู่ใน git คุณสามารถดึงมันผ่าน GitHub API ด้วยคำสั่งเดียว :

```bash
ssh "$(gh api -H 'Accept: application/vnd.github.v3.raw' \
  "/repos/USER/REPO/contents/host.conf?ref=filesystem" | tr -d '\r\n')"
```

คุณรันมัน มันไปหาที่อยู่ SSH ปัจจุบันใน repo แล้วเชื่อมต่อ แม้ว่าที่อยู่จะเปลี่ยนระหว่าง session

---

## Flow เต็ม

สรุป :

1. คุณ trigger workflow (push หรือปุ่ม manual)
2. GitHub ให้ VM Ubuntu คุณ
3. Script restore ดิสก์จาก branch "filesystem"
4. inotify เริ่มเฝ้าดูทุกการเปลี่ยนแปลง
5. periodic_save commit ทุก 5 วินาทีเป็น backup
6. tmate เริ่ม → สร้างลิงก์ SSH/web
7. ลิงก์ถูกเขียนใน README + host.conf
8. คุณเชื่อมต่อด้วย ssh หรือ terminal เว็บ
9. คุณทำอะไรก็ได้ -- ทุกการเปลี่ยนแปลงไฟล์ = autosave
10. 6 ชม. ต่อมา GitHub ฆ่า VM
11. ดิสก์ของคุณยังคงอยู่ใน branch "filesystem"
12. คุณรัน workflow ใหม่ → กลับไปขั้นตอนที่ 3 ทุกอย่างยังอยู่

VPS ฟรีพร้อมดิสก์ถาวร แค่ใช้ git และ GitHub Actions

---

## เอาล่ะ ต้องซื่อสัตย์ : ข้อจำกัด

นี่คือ hack ไม่ใช่ VPS จริง ดังนั้น :

- **สูงสุด 6 ชม. ต่อ run.** ต้องรัน workflow ซ้ำเป็นประจำ ไม่มี uptime ไม่รู้จบ
- **ไม่ใช่สำหรับ production.** คุณจะไม่โฮสต์เว็บไซต์ของคุณบนนี้ มันไว้สำหรับสำรวจ, dev, debug, ทดสอบอะไรใน Linux ที่ทิ้งได้แต่กู้คืนได้
- **GitHub เห็นทุกอย่าง.** มันคือเครื่องของพวกเขา อย่าใส่อะไรที่ละเอียดอ่อน
- **เก็บ repo เป็น private.** คุณกำลังเปิด shell SSH การมี repo public = ใครก็ได้อาจเชื่อมต่อได้ ความคิดไม่ดี
- **มันใกล้เส้นเงื่อนไขการใช้งาน.** GitHub Actions มีไว้สำหรับ CI/CD ไม่ใช่ VPS ฟรี ดังนั้นใช้อย่างพอประมาณ สำหรับสิ่งที่ชอบด้วยกฎหมาย ไม่ใช้เกินควร

### จุดอ่อนจริง : git ไม่ชอบไฟล์ใหญ่

git สร้างมาสำหรับข้อความ ไม่ใช่ระบบไฟล์

ดิสก์ถาวรอาศัยอยู่ใน branch git ดังนั้นทุกอย่างที่คุณบันทึกผ่าน git และ git :
- จัดการไฟล์ไบนารีใหญ่ได้ไม่ดี (Docker image 2 GB ใน git ? ลืมไปเลย)
- มีขีดจำกัด 100 MB ต่อไฟล์บน GitHub (hard limit push ไม่ผ่าน)
- แนะนำให้อยู่ต่ำกว่า ~5 GB ต่อ repo

ดังนั้นถ้าคุณ `npm install` โปรเจกต์ที่มี `node_modules` 500 MB หรือ build อะไรที่สร้างไบนารีหนัก ๆ push ไป `filesystem` จะช้ามากหรือล้มเหลวเลย

`git commit --amend` ช่วยได้ (commit เดียว ไม่มีประวัติพอง) แต่ไม่ได้เปลี่ยนความจริงที่ว่าไฟล์ 200 MB จะไม่มีทางผ่าน

โดยสรุป : **มันใช้ได้ดีสำหรับโค้ด, configs, ไฟล์เล็ก ๆ ใช้ไม่ได้สำหรับเก็บข้อมูลใหญ่หรือ artefacts ไบนารี** ต้องจำไว้เวลาทำอะไรใน session

### มันไม่ใช่ snapshot ระบบเต็ม

ความแตกต่างสำคัญอีกอย่าง : branch `filesystem` บันทึก **workspace** (โฟลเดอร์ของ repo) ไม่ใช่ทั้งระบบ

ถ้าคุณทำ `apt install htop` ไบนารีไปอยู่ที่ `/usr/bin/htop` ซึ่งอยู่นอก workspace ดังนั้นมันจะไม่ถูกบันทึก ใน run หน้า ต้องติดตั้งใหม่

นี่คือเหตุผลที่มี cache APT และ `prestart.sh` : เพื่อเตรียมสภาพแวดล้อมระบบใหม่ทุกครั้งที่เริ่ม เพราะมีแค่ workspace ที่คงอยู่

ถ้าคุณต้องการให้สิ่งที่ติดตั้งอยู่รอด ต้องวางไว้ใน workspace (เช่น ติดตั้งในโฟลเดอร์ local แทนที่จะเป็นระบบ) นี่คือการปรับวิธีคิดที่ต้องทำ

---

## VPS ฟรี vs VPS จริง : เปรียบเทียบ

| | repo-to-vps | VPS จริง (5€/เดือน) |
|---|---|---|
| **ราคา** | 0€ | ~5-10€/เดือน |
| **Uptime** | 6 ชม. ต้องรันใหม่ | 24/7 |
| **ดิสก์** | branch git, ไฟล์เล็ก | SSD จริง, หลาย GB |
| **RAM** | ~7 GB (ใจดีมาก !) | 1-2 GB บ่อยครั้ง |
| **CPU** | 2-4 คอร์พอใช้ | 1-2 vCPU |
| **Setup** | clone template | ตั้งค่าด้วยตนเอง |
| **การคงอยู่** | workspace เท่านั้น | ระบบเต็ม |
| **ความชอบธรรม** | ใกล้เส้น CGU | 100% สะอาด |

เรื่องตลกคือในด้านสเปกดิบ (RAM, CPU), GitHub runner มักจะดีกว่า VPS 5€ ด้วยซ้ำ แต่ uptime 6 ชม. และการคงอยู่จำกัดแค่ workspace ทำให้มันเป็นของเล่น hacker ไม่ใช่เซิร์ฟเวอร์จริง

สำหรับเรียนรู้ ทดสอบ debug อะไร Linux ในสภาพแวดล้อมที่กู้คืนได้ ? เหมาะสุด สำหรับโฮสต์อะไรที่จริงจัง ? ใช้ VPS จริง

แต่สำหรับสภาพแวดล้อม Linux ชั่วคราวที่คุณสามารถ restore เมื่อไหร่ก็ได้ ? มันเจ๋งสุด ๆ

---

## รูปแบบเบื้องหลังทั้งหมดนี้

ถ้าคุณมองในภาพกว้าง repo-to-vps และ bot email (บทความอื่นของฉัน) ตั้งอยู่บนแนวคิดเดียวกัน :

> **Git ไม่ใช่แค่ระบบควบคุมเวอร์ชัน มันคือระบบจัดเก็บข้อมูลถาวร ฟรี มี version เข้าถึงได้ผ่าน API**

เมื่อคุณมีระบบ stateless (GitHub Actions, Worker, ฟังก์ชัน serverless) และคุณต้องการเก็บสถานะระหว่างการทำงาน git สามารถใช้เป็น "ดิสก์"

- bot email เก็บ `lastId` ใน git tag
- repo-to-vps เก็บระบบไฟล์ทั้งหมดใน git branch

รูปแบบเดียวกัน สองขนาด ค่าหนึ่งอัน ดิสก์อีกอัน

และ `git commit --amend` + force-push คือเทคนิคร่วม : **คุณเก็บ commit เดียวที่แทนสถานะปัจจุบัน ทับทุกครั้งที่มีการอัปเดต**

มันไม่ได้ออกแบบมาเพื่อสิ่งนี้ แต่มันใช้ได้ และมันฟรี

---

**3 เรื่องที่ต้องจำ :**

1. **git branch = ฮาร์ดดิสก์ถาวร** -- เก็บระบบไฟล์ของคุณใน branch ที่แยกต่างหาก, restore ตอนเริ่มต้น, และคุณมีสถานะที่อยู่รอดจากเครื่องที่ทิ้งได้

2. **inotify + git = autosave แบบ real-time** -- `inotifywait` เฝ้าดูการเปลี่ยนแปลงระดับ kernel และ push ไป git ทันที ด้วย `git commit --amend` เพื่อเก็บ commit เดียวที่สะอาด

3. **tmate เปลี่ยน runner เป็น VPS** -- SSH แบบ live บนเครื่อง GitHub Actions พร้อม restart อัตโนมัติและ reconnect ด้วยคำสั่งเดียวผ่าน GitHub API

Git เป็นฮาร์ดดิสก์ ตอนที่สอง ฉันว่าฉันจะลงเอยด้วยการเก็บทุกอย่างใน git branches xD
