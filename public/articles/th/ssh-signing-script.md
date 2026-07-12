---
itle: อธิบายสคริปต์เซ็นชื่อ SSH
description: เจาะลึก helper สำหรับเซ็นชื่อคอมมิต SSH และว่าทำไมฉันถึงอยากได้คอมมิตที่ดูเท่
date: 2026-03-08
aiGenerated: trueauthors:
  - fox3000foxy
tags:
  - git
  - security
  - shell
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "k++rlq5ZUKaEptuE0EGdO/2eq+m793oRtFCCu4gpterScgUpqSGHybUdaEwPbrqCDCQ6Qy3Qls8qyjoaxJGBpQ=="
---

# สคริปต์เซ็นชื่อ SSH สำหรับคอมมิต -- คำอธิบาย

บทความนี้เจาะลึกสคริปต์ `setup-ssh-signing.sh` ที่我เผยแพร่บน [Gist](https://gist.github.com/fox3000foxy/95500d129cd4bf5c173c323d2492569a) เราจะมาดูกันว่าแต่ละส่วนทำอะไร, ทำให้การเซ็นชื่อ SSH เฉพาะพื้นที่ในรีโพสิทอรี่เป็นเรื่องง่ายดาย และ, ใช่แล้ว, ทำไม我ถึงเสียเวลามาเขียนมัน (สปอยเลอร์: ฉันแค่อยากให้คอมมิตของฉันดู **เท่**)

## แรงจูงใจ

ฉันชอบปรับแต่ง Git workflow ของฉันมาตลอด และหลังจากเห็นคนอื่นมีป้าย "Verified" เล็ก ๆ ข้างคอมมิตของพวกเขา ฉันก็เลยคิดว่า: ทำไมฉันไม่ได้ล่ะ? GPG ในตัวมันดูยุ่งยากและเป็นระบบ global ฉันก็เลยเขียน helper เล็ก ๆ ที่:

- สร้างคีย์ SSH ที่ใช้สำหรับเซ็นชื่อโดยเฉพาะ
- ตั้งค่าเฉพาะรีโพสิทอรี่ปัจจุบัน
- เขียนประวัติใหม่เพื่อเซ็นชื่อคอมมิตเก่า (ถ้าต้องการ)
- และให้คุณสามารถย้ายคีย์ระหว่างเครื่องได้

เอาจริง ๆ ความต้องการหลักคือ vanity ไม่มีข้อกำหนดทางเทคนิคให้ต้องเซ็นชื่อในโปรเจกต์ส่วนตัวของฉัน แต่เห็นป้ายเขียว "Verified" บนคอมมิตมันก็เท่ดี และการเขียนสคริปต์นี้มันสนุกดีเหมือนกัน

> ว่าแต่ เซ็นชื่อคอมมิตก็เหมือนใส่แจ็กเก็ตหนังเวลาไปรีวิวโค้ด -- ไร้ประโยชน์โดยสิ้นเชิง แต่ทำให้คุณรู้สึกเหมือนเป็นแฮกเกอร์

## สคริปต์ทำอะไร

สคริปต์เป็นไฟล์ Bash เดียวที่มี `set -euo pipefail` ไว้ข้างบนเพื่อให้หยุดทำงานทันทีเมื่อมีข้อผิดพลาด นี่คือสรุปว่ามันทำอะไร:

1. **สร้างหรือนำเข้าคีย์เซ็นชื่อ**  
   คีย์ต่าง ๆ จะถูกเก็บใน `.git-signing/` ในโฟลเดอร์ที่คุณรันสคริปต์
2. **ตั้งค่า Git ในเครื่อง**  
   มันจะตั้งค่า `gpg.format=ssh`, `user.signingkey`, `commit.gpgsign=true`, `tag.gpgSign=true`, และ `allowedSignersFile` ที่ชี้ไปยังคีย์สาธารณะ
3. **จัดการคีย์ระหว่างเครื่อง**  
   ด้วย `--export-keys` / `--import-keys` คุณสามารถย้ายคีย์ส่วนตัวจากเครื่องหนึ่งไปอีกเครื่องหนึ่งได้โดยไม่ต้องแตะ config global
4. **เขียนประวัติใหม่ (optional)** (`--resign-all`)  
   เขียนคอมมิตทั้งหมดในทุก branch/tag (หรือเฉพาะที่ไม่ได้อยู่ใน `upstream` สำหรับ fork) และเซ็นชื่อใหม่ด้วย `-S` โดยไม่กระทบผู้แต่งคนอื่น
5. **Flags อำนวยความสะดวก**  
   `--autostash`, `--autopush`, `--commit-date`, `--yes` สำหรับโหมดไม่ต้องยืนยัน ฯลฯ
6. **การตรวจจับ fork และตรวจสอบความปลอดภัย**  
   มันตรวจจับ remote `upstream`, เตือนก่อนเขียนประวัติใหม่, ตรวจสอบเครื่องมือที่จำเป็น (`git`, `ssh-keygen`, `zip/unzip`), ตรวจสอบสิทธิ์ที่ถูกต้อง, และสร้างสำเนาคีย์ที่ปลอดภัยถ้าสิทธิ์ของ filesystem เปิดกว้างเกินไป

สคริปต์เป็น idempotent: รันสองครั้งจะไม่สร้างคีย์ใหม่หรือทับการตั้งค่าที่มีอยู่

## ทีละขั้นตอน

นี่คือบางส่วนสำคัญของโค้ดพร้อมคำอธิบาย

```bash
#!/usr/bin/env bash
set -euo pipefail

# Configure SSH commit signing in a controlled, repo-local way.
# - Key files are created in the directory where this script is launched.
# - Git config is written locally to the current repository only.
```

ส่วนหัวกำหนดความปลอดภัยและอธิบายวัตถุประสงค์ ส่วนถัดไปแยกวิเคราะห์ตัวเลือก CLI (`--name`, `--email`, `--repo`, ฯลฯ) ด้วยลูป `while [[ $# -gt 0 ]]; do case … esac done` ฟิลด์ข้อมูลประจำตัวที่จำเป็นจะถูกตรวจสอบในภายหลัง:

```bash
if [[ -z "$NAME" || -z "$EMAIL" ]]; then
  echo "Error: missing identity. Provide --name and --email." >&2
  exit 1
fi
```

การสร้างคีย์จะทำใน `$LAUNCH_DIR/.git-signing` ถ้ามีคีย์อยู่แล้ว สคริปต์จะไม่แตะมัน; `--import-keys` จะใช้เติมโฟลเดอร์จาก ZIP

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

หลังจากตรวจสอบว่าคีย์ส่วนตัวใช้งานได้ (`ssh-keygen -Y sign …`) สคริปต์จะเขียนไฟล์ `allowed_signers` เล็ก ๆ ที่มีคีย์สาธารณะ และตั้งค่า Git config ในเครื่อง:

```bash
git -C "$REPO_DIR" config --local gpg.format ssh
git -C "$REPO_DIR" config --local user.signingkey "$RUNTIME_KEY_PATH"
git -C "$REPO_DIR" config --local gpg.ssh.allowedSignersFile "$ALLOWED_SIGNERS"
git -C "$REPO_DIR" config --local commit.gpgsign true
git -C "$REPO_DIR" config --local tag.gpgSign true
```

ถ้าคุณขอเขียนประวัติใหม่ด้วย `--resign-all` สคริปต์จะสร้างคำสั่ง `git filter-branch` ที่เซ็นชื่อคอมมิตที่เข้าเงื่อนไขอีกครั้งด้วย `-S` มันคำนึงถึงสถานะ fork โดยข้ามคอมมิตที่อยู่ใน `upstream` แล้ว (ถ้าต้องการ)

ผลลัพธ์สุดท้ายจะแสดงคีย์สาธารณะและคำแนะนำในการเพิ่มมันในส่วน **Signing Key** ของ GitHub พร้อมคำสั่งทดสอบ

## ทำไมต้องเซ็นชื่อคอมมิต?

นี่คือตอนที่ฉันสารภาพว่าฉันไม่จำเป็นต้องทำเลย รีโพสิทอรี่ของฉันไม่มีข้อกำหนดเรื่องแหล่งที่มาสำหรับสิ่งที่ฉันเผยแพร่ และ我ไม่ได้ใช้แท็กเซ็นชื่อสำหรับรีลีส "ทำไม" ก็คือ:

- เพราะฉันทำได้
- เพราะมันดูดี (เห็นป้ายนั่นไหม?)
- เพราะมันเป็นข้ออ้างให้ฉันได้ลองเล่น `git filter-branch` และ shell
- และเพราะมันเป็นอีกหนึ่ง "ฉันสร้างของสิ่งนี้เอง" สำหรับบล็อก

สรุปคือ แค่จะอวด แต่ที่สนุกคือตอนได้ปรับแต่งเครื่องมือของตัวเอง

## ตัวอย่างการใช้งาน

```bash
# ตั้งค่าเริ่มต้นในรีโพสิทอรี่ปัจจุบัน
chmod +x ./setup-ssh-signing.sh
./setup-ssh-signing.sh --name "Your Name" \
                       --email "you@example.com"

# ส่งออกคีย์สำหรับเครื่องอื่น
./setup-ssh-signing.sh --export-keys ./my-signing-keys.zip

# นำเข้าคีย์บนเครื่องที่สอง
./setup-ssh-signing.sh --import-keys ./my-signing-keys.zip --repo ./my-repo \
                       --name "Your Name" --email "you@example.com"

# เขียนประวัติใหม่และพุช
./setup-ssh-signing.sh --repo ./my-repo --name "Your Name" --email "you@example.com" \
                       --resign-all --autostash --autopush --yes
```

## ความคิดสุดท้าย

สคริปต์นี้เป็นยูทิลิตี้เล็ก ๆ แต่มีไอเดียเจ๋ง ๆ อยู่บ้าง:

- เก็บคีย์เข้ารหัสในเครื่องแยกตามรีโพสิทอรี่
- ไม่แตะ config global เลยยกเว้นคุณขอ
- มี import/export ง่าย ๆ และเขียนประวัติใหม่
- และบันทึกกระบวนการทั้งหมดในบทความบล็อก เผื่อไว้ก็ดี

ถ้าอยากลองเพิ่มเซ็นชื่อให้คอมมิตของคุณ ลองดูสิ! และถ้าคุณแค่เข้ามาเพราะสไตล์ ก็เหมือนกัน 😎
