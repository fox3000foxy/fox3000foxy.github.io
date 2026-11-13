---
title: "Repo to VPS : mengubah GitHub Actions menjadi VPS gratis dengan penyimpanan persisten"
description: Cara mengubah runner GitHub Actions menjadi VPS permanen dengan git sebagai penyimpanan persisten -- tmate, inotify dan commit --amend.
date: 2026-05-29
tags:
  - github
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "LQEGkDJBQ/RP8jg3qMzjrLP85f4/yJMV8UFUnBmLrUMTUpC18Y86hw3eMIpYrqTl/zCEZWbGNITWWM/gtFfJrw=="
---

## GitHub memberimu VPS gratis selama 6 jam. Saya menemukan cara membuatnya permanen.

GitHub Actions memberimu mesin Linux gratis.

Maksudnya, server Ubuntu sungguhan. 2 core, 7 GB RAM, 14 GB disk. Gratis. Selama 6 jam per run.

Satu-satunya "masalah" : di akhir run, semuanya dihapus. Mesinnya sekali pakai. Kamu menginstal paket, ngoding, mengonfigurasi... dan tiba-tiba, di akhir semuanya hilang. Seolah kamu tidak melakukan apa-apa.

Kecuali.

Kecuali kamu memakai **git sebagai hard disk**.

Dan tiba-tiba, kamu punya VPS gratis dengan disk persisten yang bertahan antar run. Kamu menyambung ulang, semuanya masih ada. Kamu lanjut tepat di mana kamu berhenti.

Ini benar-benar rusak. Biar saya jelaskan.

---

## Konteksnya : runner GitHub Actions

Ketika kamu menjalankan workflow GitHub Actions, GitHub memberimu VM.

Ini dibuat untuk build kodemu, menjalankan tesmu, deploy. Workflow berjalan, mengerjakan tugasnya, dan mesin dihancurkan.

Tapi tidak ada yang melarangmu melakukan hal lain dengan VM ini. Misalnya, membuka shell SSH di atasnya dan memakainya sebagai server.

Batasannya adalah mesin-mesin ini **stateless** dan **sementara** :
- Sementara : 6 jam maks per run (`timeout-minutes: 360`, plafon GitHub)
- Stateless : semuanya dihapus di akhir

Jadi untuk menjadikannya VPS yang bisa dipakai, harus menyelesaikan dua masalah :
1. **Bagaimana terhubung ke sana waktu nyata?**
2. **Bagaimana menjaga disk antara dua run?**

Di sinilah jadi hack kotor.

---

## Masalah 1 : SSH live dengan tmate

**tmate** adalah fork tmux yang membuat sesi SSH yang bisa dibagikan.

Kamu menjalankannya di mesin, ia membangkitkan dua tautan :
- URL SSH (`ssh xxx@nyc1.tmate.io`)
- URL web (terminal di peramban)

Kamu terhubung dengan salah satu tautan ini, dan boom, kamu ada di shell di mesin. Waktu nyata.

Workflow jadi menjalankan tmate :

```bash
tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
tmate -S /tmp/tmate.sock set-option -g remain-on-exit on

# mengambil tautan koneksi
tmate_ssh=$(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}')
tmate_web=$(tmate -S /tmp/tmate.sock display -p '#{tmate_web}')
```

Dan tautan ini ditulis langsung di README repo oleh skrip Python. Kamu membuka repomu, melihat tautan koneksi, mengklik. Kamu pun ada di VPS-mu.

Masalah pertama selesai. Tapi yang kedua benar-benar gila.

---

## Masalah 2 : git sebagai hard disk

Inilah ide yang mengubah segalanya.

Mesin dihapus di setiap run. Jadi kita menyimpan **sistem berkas di branch git khusus**, bernama `filesystem`.

Saat startup, skrip memulihkan keadaan dari branch ini :

```bash
filesystem_branch="filesystem"

# mengambil branch filesystem dari remote
git fetch origin "$filesystem_branch":refs/remotes/origin/$filesystem_branch

# memulihkan workspace dari branch ini
git checkout -B filesystem-workspace "refs/remotes/origin/$filesystem_branch"
git reset --hard "refs/remotes/origin/$filesystem_branch"
```

Branch `filesystem` ADALAH hard disk-mu. Berkasmu, instalasimu, configmu -- semuanya ada di dalamnya.

Kamu paham idenya? Mesinnya sekali pakai, tapi disknya hidup di git. Kamu menjalankan ulang workflow, disk dipulihkan, kamu lanjut tepat di mana kamu berhenti.

Ini seperti VPS yang hibernasi. Kecuali hibernasinya repo git

### Peluncuran pertama : membuat disk kosong

Di run pertama, branch `filesystem` belum ada. Harus dibuat. Dan ini tidak sepele :

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

`git checkout --orphan` itulah kuncinya. Branch yatim adalah branch **tanpa riwayat apa pun** -- seolah kamu mulai dari repo kosong.

Kenapa yatim? Karena kamu TIDAK ingin disk persistenmu menyeret seluruh riwayat kode sumbermu. Disk tetap terisolasi, dengan hidupnya sendiri. Ia mulai perawan.

Dan `git ls-remote --exit-code` di awal, itu cuma cek bersih : "apakah branch sudah ada di remote?". Kalau ya, kita tidak menyentuh apa-apa. Kalau tidak, kita membuatnya. Idempoten, seperti yang kita suka.

### Git clean selektif : melindungi cache

Baris ini layak berhenti sebentar :

```bash
git clean -fdx -e .apt-cache -e .cache -e host.conf -e tmate.sock
```

`git clean -fdx` menghapus SEMUA yang tidak di track git. Normalnya ini keras -- membersihkan workspace habis-habisan.

Tapi `-e` (exclude) melindungi berkas tertentu :
- `.apt-cache` → cache paket APT (nanti kita bahas, ini cerdik)
- `.cache` → cache generik
- `host.conf` → alamat SSH sesi
- `tmate.sock` → socket sesi tmate yang berjalan

Kalau kamu membersihkan berkas-berkas itu, kamu merusak sesi aktif atau kehilangan cache-mu. Jadi kita mengampuninya selama reset.

Detail tampak bodoh pada pandangan pertama, tapi tanpanya semuanya meledak.

---

## Autosave : inotify yang mengawasi segalanya

Oke, tapi bagaimana berkas-berkas sampai di branch `filesystem`?

Jawaban : watcher yang mengawasi SEMUA perubahan berkas dan commit/push otomatis.

Alat ajaibnya adalah **inotifywait** (dari paket `inotify-tools`). Ia mengawasi filesystem di tingkat kernel dan memicu begitu berkas berubah.

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock|\.gitignore|\.txt\.swp)(/|$)' .; do
    echo "[autosave] change detected"
    commit_and_push
    sleep 1   # debounce kalau banyak perubahan sekaligus
  done
}

autosave &
```

Mari bedah flag inotify, karena masing-masing penting :
- `-r` → rekursif, mengawasi semua subfolder
- `-e modify,create,delete,move` → bereaksi pada 4 tipe event ini
- `--exclude '...'` → regex untuk mengabaikan berkas tertentu

`--exclude` ini krusial. Lihat apa yang ia abaikan :
- `.git` → jelas, kalau tidak setiap commit memicu autosave yang memicu commit... loop tak berujung. Bencana.
- `.apt-cache` dan `.cache` → cache, yang berubah terus dan tidak ingin kita spam ke git
- `host.conf` dan `tmate.sock` → berkas sesi, yang bergerak tanpa henti
- `.gitignore`, `.txt.swp` → berkas sementara (`.swp` itu berkas edit vim)

Tanpa exclude ini, kamu berakhir dengan autosave yang terpicu berulang pada perubahannya sendiri. `.git` di daftar, itulah baris yang mencegahmu menembak kakimu sendiri.

Kamu mengubah berkas? inotify mendeteksinya seketika, commit, push. Dalam kurang dari sedetik, perubahanmu ada di branch `filesystem`.

Kamu menginstal paket, menulis kode, menyentuh config -- semuanya disimpan waktu nyata, otomatis, tanpa kamu melakukan apa pun.

Kamu secara harfiah punya sistem simpan otomatis seluruh disk. Rusak.

### Debounce : jangan spam git

`sleep 1` setelah setiap save adalah **debounce**.

Ketika kamu menyimpan berkas di editor, sering itu membangkitkan beberapa event filesystem beruntun (pembuatan berkas temp, rename, penghapusan yang lama...). Tanpa debounce, kamu memicu 3-4 commit untuk satu penyimpanan.

`sleep 1` bilang : "tunggu sedetik setelah save, sampai beruntunnya tenang, sebelum mendengar lagi". Itu mengelompokkan perubahan yang berdekatan jadi satu commit. Cerdik.

### Dan simpanan berkala sebagai tambahan

Seandainya inotify melewatkan event, ada juga save setiap 5 detik :

```bash
periodic_save() {
  while true; do
    sync_from_remote   # mengambil perubahan jarak jauh yang mungkin ada
    sleep 5
    commit_and_push
  done
}

periodic_save &
```

Sabuk DAN suspender. Kita tidak mau kehilangan keadaan disk.

---

## Detail cerdik : satu commit saja

Kalau kamu commit di setiap perubahan berkas, kamu akan menumpuk ribuan commit. Dalam satu jam sesi, riwayat gitmu meledak. Repo menjadi raksasa. Itu menjijikkan.

Solusinya elegan : **kita mengamend commit yang ada** alih-alih membuat yang baru.

```bash
commit_and_push() {
  (
    flock -n 200 || return   # lock supaya dua save tidak jalan bersamaan

    git add -A
    git reset -- .github/workflows/ .github/scripts/   # jangan sentuh skrip

    if ! git diff --cached --quiet; then
      if git rev-parse --verify HEAD >/dev/null 2>&1; then
        git commit --amend --no-edit    # AMEND : menimpa commit sebelumnya
      else
        git commit -m "autosave $(date -u +%Y%m%dT%H%M%SZ)"
      fi
      git push --force origin "filesystem-workspace:filesystem"
    fi
  ) 200>/tmp/tmate_autosave.lock
}
```

`git commit --amend` artinya : "ganti commit terakhir dengan yang ini".

Jadi branch `filesystem` SELALU punya satu commit. Tidak peduli berapa kali kamu menyimpan. Itu hanya snapshot keadaan saat ini, di force-push berulang-ulang.

`flock` itu kunci : karena ada dua loop save (inotify + berkala), harus mencegah mereka menjalankan git bersamaan dan saling menginjak. Satu proses git dalam satu waktu.

Bersih.

---

## Sync_from_remote : menangani banyak sesi

Nah, kasus yang tidak terpikir di awal : bagaimana kalau kamu menjalankan DUA run bersamaan? Atau kalau satu sesi mengubah branch `filesystem` sementara yang lain berjalan?

Skrip menanganinya dengan `sync_from_remote` sebelum setiap commit :

```bash
sync_from_remote() {
  git fetch origin "filesystem":refs/remotes/origin/filesystem
  git merge --ff-only "refs/remotes/origin/filesystem"
}
```

`--ff-only` (fast-forward only) ini penting : artinya "merge HANYA kalau bisa maju bersih, tanpa membuat commit merge".

Kalau kedua branch telah berdivergensi (misalnya, dua sesi mengubah berkas berbeda), fast-forward gagal diam-diam (`2>/dev/null || true`) dan kita menjaga keadaan lokal. Ini bukan sistem merge sempurna, tapi mencegah korupsi dalam kasus sederhana di mana satu sesi saja berjalan.

Sejujurnya, jangan menjalankan 3 sesi paralel di repo yang sama. Tapi kode tetap berusaha tidak meledak kalau itu terjadi. Ini pertahanan.

---

## Cache APT : menginstal cepat

Ada detail di workflow yang tampak sepele tapi dipikirkan matang :

```yaml
- name: Cache & install APT packages (tmate + watcher)
  uses: awalsh128/cache-apt-pkgs-action@v1.6.0
  with:
    packages: tmate inotify-tools
```

tmate dan inotify-tools dipasang lewat action yang **meng cache paket APT**.

Di run pertama, ia mengunduh dan memasang. Di run berikutnya, dipulihkan dari cache GitHub Actions -- lebih cepat, tidak perlu mengunduh ulang.

Dan kamu ingat `git clean -fdx -e .apt-cache` tadi? Itu terkait. Folder `.apt-cache` dilindungi dari pembersihan justru supaya paket yang kamu pasang selama sesimu bisa bertahan minimal.

Semuanya nyambung. Saya memikirkan siklus hidup lengkap.

---

## Skrip yang disembunyikan di /tmp

Satu detail licik tapi cerdik lagi. Di awal skrip :

```bash
RUNNER_SCRIPTS_DIR="/tmp/runner-scripts"
rm -rf "$RUNNER_SCRIPTS_DIR"
mkdir -p "$RUNNER_SCRIPTS_DIR"
cp -r .github/scripts "$RUNNER_SCRIPTS_DIR/"
```

Skrip (`update_readme.py`, dll.) disalin ke `/tmp` SEBELUM menyentuh branch `filesystem`.

Kenapa? Karena ketika kamu melakukan `git reset --hard` ke branch `filesystem` (yang kosong di awal, atau yang berisi diskmu), berkas `.github/scripts` dari repo sumber hilang dari workspace.

Tapi skrip masih membutuhkannya selama sesi (untuk memperbarui README di setiap peluncuran ulang tmate). Jadi ia menyembunyikannya di `/tmp`, di luar jangkauan git :

```bash
python3 "$RUNNER_SCRIPTS_DIR/scripts/update_readme.py" --ssh "$tmate_ssh" ...
```

Kalau tidak kepikiran, kamu menghabiskan 30 menit memahami kenapa skripmu hilang. Saya memikirkannya.

---

## Shell sesuai pesanan

Kenyamanan kecil : sesi memberimu shell yang dikonfigurasi, bukan bash telanjang.

`prestart.sh` menyalin `.bashrc` kustom :

```bash
if ! grep -q "Custom prompt and aliases for remote sessions" "$HOME/.bashrc"; then
  cp .github/scripts/remote_bashrc "$HOME/.bashrc"
fi
sudo cp "$HOME/.bashrc" /root/.bashrc
```

Dan `.bashrc` ini berisi prompt berwarna, alias (`ll`, `lla`, `rm -i`), dan terutama override `exit` :

```bash
exit() {
    killall -9 -u "$(whoami)" tmate 2>/dev/null || true
    builtin exit "$@"
}

# Ctrl+D melakukan hal yang sama seperti exit
bind -x '"\C-d": "exit"'
```

Ketika kamu mengetik `exit` (atau Ctrl+D), ia membunuh bersih proses tmate sebelum menutup. Ini mencegah sesi tmate zombie tertinggal.

Ada juga fungsi `tmate-detach` kalau kamu ingin terputus TANPA membunuh sesi (untuk menyambung ulang nanti). Detail kenyamanan, tapi menunjukkan tingkat perhatian.

---

## Tmate yang menyala ulang sendiri

Kenyamanan kecil : kalau kamu mengetik `exit` di shell, normalnya sesi tmate mati dan kamu terputus untuk selamanya.

Kecuali di sini, tmate ada dalam loop `while true` :

```bash
while true; do
  tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
  while tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}' >/dev/null 2>&1; do
    sleep 2
  done
  echo "tmate session ended; restarting..."
done
```

Kamu `exit`? Sesi menyala ulang sendiri. Kamu menyambung ulang dengan tautan yang sama.

Ini bodoh, tapi membuat sesi bisa dipakai.

---

## Penyambungan ulang dalam satu perintah

Bagaimana kamu menyambung ulang setelah terputus, tanpa mengobrak-abrik log run setiap kali?

Alamat SSH tmate ditulis dalam berkas `host.conf`, yang di commit ke branch `filesystem` :

```bash
printf '%s' "${tmate_ssh#ssh }" > host.conf
```

Dan karena berkas ini ada di git, kamu bisa mengambilnya lewat API GitHub dengan satu perintah :

```bash
ssh "$(gh api -H 'Accept: application/vnd.github.v3.raw' \
  "/repos/USER/REPO/contents/host.conf?ref=filesystem" | tr -d '\r\n')"
```

Kamu menjalankan itu, ia mencari alamat SSH saat ini di repo, dan menghubungkanmu. Bahkan kalau alamat berubah antara dua sesi.

---

## Alur lengkap

Mari rekap :

1. Kamu memicu workflow (push atau tombol manual)
2. GitHub memberimu VM Ubuntu
3. Skrip memulihkan disk dari branch "filesystem"
4. inotify mulai mengawasi semua perubahan
5. periodic_save commit setiap 5 detik sebagai cadangan
6. tmate menyala → membangkitkan tautan SSH/web
7. Tautan ditulis di README + host.conf
8. Kamu terhubung dengan ssh atau terminal web
9. Kamu melakukan apa pun yang kamu mau -- setiap perubahan berkas = autosave
10. 6 jam kemudian, GitHub membunuh VM
11. Diskmu utuh di branch "filesystem"
12. Kamu menjalankan ulang workflow → kembali ke langkah 3, semuanya masih ada

VPS gratis dengan disk persisten. Hanya dengan git dan GitHub Actions.

---

## Oke, harus jujur : batasannya

Ini hack, bukan VPS sungguhan. Jadi :

- **6 jam maks per run.** Harus menjalankan ulang workflow rutin. Uptime terbatas di setiap run.
- **Disediakan untuk dev dan eksplorasi.** Kamu tidak akan menghosting situsmu di atasnya. Ini untuk menjelajah, dev, debug, menguji lingkungan Linux sekali pakai tapi bisa dipulihkan.
- **GitHub melihat segalanya.** Ini mesin mereka. Jangan taruh yang sensitif.
- **Jaga repo tetap privat.** Kamu mengekspos shell SSH. Repo publik = siapa pun berpotensi terhubung. Ide buruk.
- **Ini di batas syarat penggunaan.** GitHub Actions dibuat untuk CI/CD, bukan untuk VPS gratis. Jadi pakai secukupnya, untuk yang sah, tanpa menyalahgunakan.

### Tumit Achilles yang nyata : git benci berkas besar

Git dibuat untuk teks, bukan untuk filesystem.

Disk persisten hidup di branch git. Jadi semua yang kamu simpan lewat git. Dan git :
- menangani buruk berkas biner besar (image Docker 2 GB di git? lupakan)
- punya batas 100 MB per berkas di GitHub (batas keras, tidak bisa push lebih)
- merekomendasikan tetap di bawah ~5 GB per repo

Jadi kalau kamu `npm install` proyek dengan 500 MB `node_modules`, atau kalau kamu build proyek yang membangkitkan biner berat, push ke `filesystem` akan entah ngadat parah, atau gagal total.

`git commit --amend` membantu (satu commit saja, tanpa riwayat yang menggembung), tapi tidak mengubah fakta bahwa berkas 200 MB tidak akan pernah lewat.

Intinya : **ini bekerja super untuk kode, config, berkas kecil. Tidak bekerja untuk menyimpan data besar atau artefak biner.** Harus diingat tentang apa yang kamu lakukan di sesimu.

### Ini bukan snapshot sistem lengkap

Nuansa penting lain : branch `filesystem` menyimpan **workspace** (folder repo), bukan seluruh sistem.

Kalau kamu melakukan `apt install htop`, binernya masuk ke `/usr/bin/htop`, yang DI LUAR workspace. Jadi ia TIDAK akan disimpan. Di run berikutnya, harus menginstal ulang.

Makanya kita punya cache APT dan `prestart.sh` : untuk menyiapkan ulang lingkungan sistem di setiap startup, karena hanya workspace yang bertahan.

Kalau kamu ingin instalasimu bertahan, harus menaruhnya di workspace (misalnya, menginstal di folder lokal alih-alih sistem). Ini senam yang perlu diintegrasikan.

---

## VPS gratis vs VPS sungguhan : pertandingan

| | repo-to-vps | VPS sungguhan (5€/bulan) |
|---|---|---|
| **Harga** | 0€ | ~5-10€/bulan |
| **Uptime** | 6 jam, harus dijalankan ulang | 24/7 |
| **Disk** | branch git, berkas kecil | SSD sungguhan, beberapa GB |
| **RAM** | ~7 GB (murah hati!) | 1-2 GB seringnya |
| **CPU** | 2-4 core lumayan | 1-2 vCPU |
| **Setup** | clone template | config manual |
| **Persistensi** | workspace saja | sistem lengkap |
| **Legitimasi** | batas CGU | 100% bersih |

Poin menariknya adalah dari sisi spek mentah (RAM, CPU), runner GitHub sering LEBIH BAIK daripada VPS 5€. Tapi uptime 6 jam dan persistensi terbatas pada workspace, itulah yang menjadikannya mainan hacker, bukan server sungguhan.

Untuk belajar, menguji, men-debug sistem Linux cepat di lingkungan yang bisa dipulihkan? Sempurna. Untuk menghosting sesuatu yang serius? Ambil VPS sungguhan.

Tapi untuk lingkungan Linux sementara yang bisa kamu pulihkan sesukamu? Ini gila bagusnya.

---

## Pola di balik semuanya

Kalau kamu mundur selangkah, repo-to-vps dan bot email (artikel saya yang lain) bersandar pada ide yang sama :

> **Git bukan sekadar pengelola versi. Ini sistem penyimpanan persisten, gratis, berversi, bisa diakses lewat API.**

Begitu kamu punya sistem stateless (GitHub Actions, Worker, fungsi serverless) dan ingin menjaga keadaan antara dua eksekusi, git bisa berfungsi sebagai "disk".

- Bot email menyimpan `lastId` di tag git.
- repo-to-vps menyimpan filesystem utuh di branch git.

Pola yang sama, dua skala. Satu nilai di satu sisi, satu disk di sisi lain.

Dan `git commit --amend` + force-push adalah teknik umumnya : **kamu menjaga satu commit yang mewakili keadaan saat ini, ditimpa di setiap pembaruan.**

Ini tidak dibuat untuk itu. Tapi berhasil. Dan gratis.

---

**3 poin yang perlu diingat :**

1. **Satu branch git = satu hard disk persisten** -- Simpan filesystem-mu di branch khusus, pulihkan saat startup, dan kamu punya keadaan yang bertahan dari mesin sekali pakai.

2. **inotify + git = autosave waktu nyata** -- `inotifywait` mengawasi perubahan di tingkat kernel dan push ke git seketika. Dengan `git commit --amend` untuk menjaga satu commit bersih.

3. **tmate mengubah runner menjadi VPS** -- SSH live di mesin GitHub Actions, dengan restart otomatis dan penyambungan ulang dalam satu perintah lewat API GitHub.

Git sebagai hard disk, episode kedua. Saya rasa saya akan berakhir menyimpan segalanya di branch git
