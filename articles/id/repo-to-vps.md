---
title: "Repo to VPS : mengubah GitHub Actions menjadi VPS gratis dengan penyimpanan persisten"
description: Cara mengubah runner GitHub Actions menjadi VPS permanen dengan git sebagai penyimpanan persisten -- tmate, inotify dan commit --amend.
date: 2026-05-29
authors:
  - fox3000foxy
tags:
  - github
  - devops
  - automation
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "nvOjjW8MR7u9pgcNr9q0FDAJSYjbjIKH+Q3kY1F2jP+1+MEecWiWiH1cAtZJy7ldNx7hl7ewlF3YitoMilPliQ=="
---

## GitHub kasih kamu VPS gratis selama 6 jam. Aku nemu cara bikinnya permanen.

GitHub Actions kasih kamu mesin Linux gratis.

Iya, beneran server Ubuntu. 2 core, 7 GB RAM, 14 GB disk. Gratis. Selama 6 jam per run.

Satu-satunya "masalah" : di akhir run, semuanya dihapus. Mesinnya disposable. Kamu install berbagai hal, ngoding, konfigurasi... dan poof, di akhir semuanya hilang. Seperti tidak pernah terjadi.

Kecuali.

Kecuali kamu pakai **git sebagai hard disk**.

Dan tiba-tiba, kamu punya VPS gratis dengan disk persisten yang bertahan dari run ke run. Kamu reconnect, semuanya masih ada. Kamu lanjutin dari tempat kamu berhenti.

Ini benar-benar gila. Biar aku jelasin xD

---

## Konteks : runner GitHub Actions

Saat kamu menjalankan workflow GitHub Actions, GitHub kasih kamu VM.

Ini dibuat untuk build kode, jalankan test, deploy. Workflow berjalan, melakukan tugasnya, dan mesinnya dihancurkan.

Tapi tidak ada yang melarang kamu melakukan hal lain dengan VM ini. Misalnya, buka shell SSH di atasnya dan pakai sebagai server.

Masalahnya, mesin-mesin ini **stateless** dan **sementara** :
- Sementara : maksimal 6 jam per run (`timeout-minutes: 360`, batas dari GitHub)
- Stateless : semua dihapus di akhir

Jadi untuk menjadikannya VPS yang bisa dipakai, harus selesaikan dua masalah :
1. **Bagaimana cara terhubung secara real-time ?**
2. **Bagaimana cara menyimpan disk antar run ?**

Nah ini jadi hack yang kotor.

---

## Masalah 1 : SSH live dengan tmate

**tmate** adalah fork dari tmux yang membuat session SSH yang bisa dibagikan.

Kamu jalankan di sebuah mesin, dia menghasilkan dua link :
- URL SSH (`ssh xxx@nyc1.tmate.io`)
- URL web (terminal di browser)

Kamu connect dengan salah satu link ini, dan boom, kamu masuk ke shell di mesin itu. Secara real-time.

Workflow-nya menjalankan tmate :

```bash
tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
tmate -S /tmp/tmate.sock set-option -g remain-on-exit on

# ambil link koneksi
tmate_ssh=$(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}')
tmate_web=$(tmate -S /tmp/tmate.sock display -p '#{tmate_web}')
```

Dan link-link ini ditulis langsung ke README repo oleh script Python. Kamu buka repo, kamu lihat link koneksi, kamu klik. Selamat datang di VPS kamu.

Masalah pertama beres. Tapi yang kedua yang benar-benar gila.

---

## Masalah 2 : git sebagai hard disk

Ini dia hal gila.

Mesinnya dihapus setiap run. Jadi kita simpan **sistem file di branch git khusus**, bernama `filesystem`.

Saat startup, script me-restore state dari branch ini :

```bash
filesystem_branch="filesystem"

# ambil branch filesystem dari remote
git fetch origin "$filesystem_branch":refs/remotes/origin/$filesystem_branch

# restore workspace dari branch ini
git checkout -B filesystem-workspace "refs/remotes/origin/$filesystem_branch"
git reset --hard "refs/remotes/origin/$filesystem_branch"
```

Branch `filesystem` ADALAH hard disk kamu. File kamu, installasi kamu, konfigurasi kamu -- semuanya ada di dalamnya.

Kamu lihat kan? Mesinnya disposable, tapi disk-nya hidup di git. Kamu jalankan ulang workflow, disk-nya di-restore, kamu lanjut tepat dari tempat kamu berhenti.

Ini seperti VPS yang hibernate. Cuma hibernasi-nya berupa repo git xD

### Pertama kali jalan : buat disk kosong

Pertama kali run, branch `filesystem` belum ada. Harus dibuat. Dan ini tidak sepele :

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

`git checkout --orphan` adalah kuncinya. Branch orphan adalah branch **tanpa history sama sekali** -- seperti kamu mulai dari repo kosong.

Kenapa orphan? Karena kamu TIDAK ingin disk persisten kamu membawa seluruh history kode sumber. Disk adalah entitas terpisah, punya hidup sendiri. Dia mulai kosong.

Dan `git ls-remote --exit-code` di awal, itu cuma pengecekan bersih : "apakah branch sudah ada di remote?". Kalau iya, tidak dilakukan apa-apa. Kalau tidak, dibuat. Idempoten, seperti yang kita suka.

### Git clean selektif : melindungi cache

Baris ini layak untuk kita bahas :

```bash
git clean -fdx -e .apt-cache -e .cache -e host.conf -e tmate.sock
```

`git clean -fdx` itu MEMBUANG SEMUA yang tidak di-track oleh git. Biasanya ini keras -- membersihkan workspace habis-habisan.

Tapi `-e` (exclude) melindungi beberapa hal :
- `.apt-cache` → cache paket APT (akan dibahas lagi, ini pintar)
- `.cache` → cache generik
- `host.conf` → alamat SSH session
- `tmate.sock` → socket session tmate yang sedang berjalan

Kalau kamu bersihkan file-file itu, kamu akan merusak session aktif atau kehilangan cache. Jadi mereka disisihkan saat reset.

Detail kecil yang kelihatannya sepele, tapi tanpanya semuanya berantakan.

---

## Autosave : inotify yang memantau semuanya

Nah, tapi bagaimana file-file itu masuk ke branch `filesystem`?

Jawaban : sebuah watcher yang memantau SEMUA perubahan file dan commit/push secara otomatis.

Alat ajaibnya adalah **inotifywait** (dari paket `inotify-tools`). Dia memantau filesystem di level kernel dan terpicu saat file berubah.

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

Mari kita bedah flag inotify, karena masing-masing penting :
- `-r` → rekursif, memantau semua sub-direktori
- `-e modify,create,delete,move` → bereaksi terhadap 4 tipe event ini
- `--exclude '...'` → regex untuk mengabaikan file tertentu

`--exclude` sangat krusial. Lihat apa yang diabaikan :
- `.git` → jelas, kalau tidak setiap commit akan memicu autosave yang memicu commit lagi... infinite loop. Bencana.
- `.apt-cache` dan `.cache` → cache, yang sering berubah dan tidak ingin kita spam di git
- `host.conf` dan `tmate.sock` → file session, yang terus berubah
- `.gitignore`, `.txt.swp` → file sementara (`.swp` adalah file editing vim)

Tanpa exclude ini, autosave akan terpicu terus-menerus oleh perubahannya sendiri. `.git` dalam daftar, itu BARIS yang mencegah kamu menembak kaki sendiri.

Kamu modifikasi file? inotify mendeteksinya seketika, commit, push. Kurang dari satu detik, perubahanmu sudah ada di branch `filesystem`.

Kamu install sesuatu, nulis kode, menyentuh konfigurasi -- semua tersimpan real-time, otomatis, tanpa kamu melakukan apapun.

Kamu benar-benar punya sistem backup otomatis seluruh disk. Gila.

### Debounce : jangan spam git

`sleep 1` setelah setiap save adalah **debounce**.

Saat kamu menyimpan file di editor, seringkali menghasilkan beberapa event filesystem beruntun (pembuatan file temp, rename, penghapusan file lama...). Tanpa debounce, kamu akan memicu 3-4 commit untuk satu kali save.

`sleep 1` bilang : "tunggu satu detik setelah save, biar rangkaian eventnya reda, sebelum mendengarkan lagi". Ini mengelompokkan perubahan yang berdekatan menjadi satu commit. Pintar.

### Dan periodic save tambahan

Untuk jaga-jaga kalau inotify kelewatan sesuatu, ada juga save setiap 5 detik :

```bash
periodic_save() {
  while true; do
    sync_from_remote   # ambil perubahan remote yang mungkin ada
    sleep 5
    commit_and_push
  done
}

periodic_save &
```

Sabuk DAN tali pengaman. Kita benar-benar tidak mau kehilangan state disk.

---

## Detail pintar : satu commit aja

Kalau kamu commit setiap perubahan file, kamu akan mengumpulkan ribuan commit. Dalam satu jam session, history git kamu meledak. Repo jadi besar. Ini menjijikkan.

Solusinya elegan : **kita amend commit yang ada** daripada membuat yang baru.

```bash
commit_and_push() {
  (
    flock -n 200 || return   # lock biar dua save tidak berjalan bersamaan

    git add -A
    git reset -- .github/workflows/ .github/scripts/   # jangan sentuh scripts

    if ! git diff --cached --quiet; then
      if git rev-parse --verify HEAD >/dev/null 2>&1; then
        git commit --amend --no-edit    # AMEND : timpa commit sebelumnya
      else
        git commit -m "autosave $(date -u +%Y%m%dT%H%M%SZ)"
      fi
      git push --force origin "filesystem-workspace:filesystem"
    fi
  ) 200>/tmp/tmate_autosave.lock
}
```

`git commit --amend` artinya : "ganti commit terakhir dengan yang ini".

Jadi branch `filesystem` SELALU hanya punya satu commit. Tidak peduli berapa kali kamu save. Hanya snapshot dari state terkini, di-force-push berulang kali.

`flock` adalah kunci : karena ada dua loop save (inotify + periodic), harus dicegah agar mereka tidak menjalankan git bersamaan dan saling menginjak. Hanya satu proses git dalam satu waktu.

Bersih.

---

## Sync_from_remote : menangani beberapa session

Nah, sesuatu yang tidak terpikirkan di awal : gimana kalau kamu menjalankan DUA run bersamaan? Atau kalau satu session memodifikasi branch `filesystem` sementara yang lain berjalan?

Script menangani ini dengan `sync_from_remote` sebelum setiap commit :

```bash
sync_from_remote() {
  git fetch origin "filesystem":refs/remotes/origin/filesystem
  git merge --ff-only "refs/remotes/origin/filesystem"
}
```

`--ff-only` (fast-forward only) itu penting : artinya "merge HANYA kalau bisa maju dengan bersih, tanpa membuat commit merge".

Kalau kedua branch divergen (misalnya, dua session memodifikasi hal berbeda), fast-forward gagal secara diam-diam (`2>/dev/null || true`) dan state lokal dipertahankan. Ini bukan sistem merge yang sempurna, tapi menghindari korupsi dalam kasus sederhana di mana hanya satu session yang berjalan.

Sejujurnya, jangan jalankan 3 session paralel di repo yang sama. Tapi kode ini tetap berusaha untuk tidak meledak kalau itu terjadi. Ini pertahanan.

---

## Cache APT : install cepat

Ada detail di workflow yang kelihatan sepele tapi dipikirkan dengan baik :

```yaml
- name: Cache & install APT packages (tmate + watcher)
  uses: awalsh128/cache-apt-pkgs-action@v1.6.0
  with:
    packages: tmate inotify-tools
```

tmate dan inotify-tools diinstall melalui action yang **me-cache paket APT**.

Di run pertama, download dan install. Di run berikutnya, di-restore dari cache GitHub Actions -- lebih cepat, tidak perlu download ulang.

Dan ingat `git clean -fdx -e .apt-cache` dari tadi? Itu terkait. Folder `.apt-cache` dilindungi dari pembersihan justru agar paket yang kamu install selama session bisa bertahan minimal.

Semuanya terkait. Aku sudah memikirkan siklus hidup lengkap.

---

## Script yang disembunyikan di /tmp

Satu lagi detail licik tapi pintar. Di awal script :

```bash
RUNNER_SCRIPTS_DIR="/tmp/runner-scripts"
rm -rf "$RUNNER_SCRIPTS_DIR"
mkdir -p "$RUNNER_SCRIPTS_DIR"
cp -r .github/scripts "$RUNNER_SCRIPTS_DIR/"
```

Script (`update_readme.py`, dll.) dicopy ke `/tmp` SEBELUM menyentuh branch `filesystem`.

Kenapa? Karena saat kamu melakukan `git reset --hard` ke branch `filesystem` (yang kosong di awal, atau berisi disk kamu), file `.github/scripts` dari repo sumber akan hilang dari workspace.

Tapi script masih diperlukan selama session (untuk update README setiap kali tmate restart). Jadi dia disembunyikan di `/tmp`, di luar jangkauan git :

```bash
python3 "$RUNNER_SCRIPTS_DIR/scripts/update_readme.py" --ssh "$tmate_ssh" ...
```

Kalau tidak dipikirkan, kamu akan pusing 30 menit mencari tahu kenapa script kamu hilang. Aku sudah pikirkan itu.

---

## Shell custom

Sedikit kenyamanan : session memberi kamu shell yang sudah dikonfigurasi, bukan bash kosong.

`prestart.sh` menyalin `.bashrc` custom :

```bash
if ! grep -q "Custom prompt and aliases for remote sessions" "$HOME/.bashrc"; then
  cp .github/scripts/remote_bashrc "$HOME/.bashrc"
fi
sudo cp "$HOME/.bashrc" /root/.bashrc
```

Dan `.bashrc` ini berisi prompt berwarna, alias (`ll`, `lla`, `rm -i`), dan yang terpenting override `exit` :

```bash
exit() {
    killall -9 -u "$(whoami)" tmate 2>/dev/null || true
    builtin exit "$@"
}

# Ctrl+D sama seperti exit
bind -x '"\C-d": "exit"'
```

Saat kamu ketik `exit` (atau Ctrl+D), ini mematikan proses tmate dengan bersih sebelum menutup. Ini mencegah session tmate zombie.

Ada juga fungsi `tmate-detach` kalau kamu ingin disconnect TANPA mematikan session (untuk reconnect nanti). Detail kenyamanan, tapi menunjukkan tingkat perhatian.

---

## Tmate yang restart sendiri

Sedikit kenyamanan : kalau kamu ketik `exit` di shell, biasanya session tmate mati dan kamu disconnect untuk selamanya.

Tapi di sini, tmate ada di dalam loop `while true` :

```bash
while true; do
  tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
  while tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}' >/dev/null 2>&1; do
    sleep 2
  done
  echo "tmate session ended; restarting..."
done
```

Kamu `exit` ? Session restart otomatis. Kamu reconnect dengan link yang sama.

Ini konyol, tapi membuatnya bisa dipakai.

---

## Reconnect dalam satu perintah

Bagaimana cara reconnect setelah disconnect, tanpa harus mencari-cari di log run setiap kali?

Alamat SSH tmate ditulis di file `host.conf`, di-commit ke branch `filesystem` :

```bash
printf '%s' "${tmate_ssh#ssh }" > host.conf
```

Dan karena file ini ada di git, kamu bisa ambil melalui API GitHub dengan satu perintah :

```bash
ssh "$(gh api -H 'Accept: application/vnd.github.v3.raw' \
  "/repos/USER/REPO/contents/host.conf?ref=filesystem" | tr -d '\r\n')"
```

Kamu jalankan ini, dia akan mengambil alamat SSH terkini dari repo, dan connect. Bahkan jika alamatnya berubah antar session.

---

## Flow lengkap

Mari rekap :

1. Kamu trigger workflow (push atau tombol manual)
2. GitHub kasih kamu VM Ubuntu
3. Script me-restore disk dari branch "filesystem"
4. inotify mulai memantau semua perubahan
5. periodic_save commit setiap 5 detik sebagai backup
6. tmate mulai → menghasilkan link SSH/web
7. Link ditulis ke README + host.conf
8. Kamu connect dengan ssh atau terminal web
9. Kamu lakukan apapun yang kamu mau -- setiap perubahan file = autosave
10. 6 jam kemudian, GitHub mematikan VM
11. Disk kamu utuh di branch "filesystem"
12. Kamu jalankan ulang workflow → kembali ke langkah 3, semuanya masih ada

VPS gratis dengan disk persisten. Hanya dengan git dan GitHub Actions.

---

## Baiklah, harus jujur : keterbatasannya

Ini hack, bukan VPS beneran. Jadi :

- **Maksimal 6 jam per run.** Harus jalankan ulang workflow secara teratur. Tidak ada uptime tanpa batas.
- **Bukan untuk production.** Kamu tidak akan host situs di sini. Ini untuk eksplorasi, dev, debug, testing sesuatu di Linux disposable tapi bisa dipulihkan.
- **GitHub melihat semuanya.** Ini mesin mereka. Jangan simpan data sensitif.
- **Jaga repo tetap private.** Kamu mengekspos shell SSH. Repo public = siapapun berpotensi connect. Ide buruk.
- **Ini di batas ketentuan penggunaan.** GitHub Actions dibuat untuk CI/CD, bukan untuk VPS gratis. Jadi gunakan secukupnya, untuk hal yang sah, tanpa menyalahgunakan.

### Achilles heel yang sesungguhnya : git benci file besar

Git dibuat untuk teks, bukan untuk filesystem.

Disk persisten hidup di branch git. Jadi semua yang kamu simpan melewati git. Dan git :
- tidak cocok untuk file biner besar (image Docker 2 GB di git? lupakan)
- punya batas 100 MB per file di GitHub (hard limit, tidak bisa push lebih)
- merekomendasikan tetap di bawah ~5 GB per repo

Jadi kalau kamu `npm install` project dengan 500 MB `node_modules`, atau build sesuatu yang menghasilkan biner berat, push ke `filesystem` akan sangat lambat atau bahkan gagal total.

`git commit --amend` membantu (satu commit, tidak ada history yang membengkak), tapi tidak mengubah fakta bahwa file 200 MB tidak akan pernah berhasil.

Intinya : **ini bekerja sangat baik untuk kode, konfigurasi, file kecil. Tidak bekerja untuk menyimpan data besar atau artefak biner.** Harus diingat saat melakukan sesuatu di session.

### Ini bukan snapshot sistem lengkap

Nuansa penting lainnya : branch `filesystem` menyimpan **workspace** (folder repo), bukan seluruh sistem.

Kalau kamu `apt install htop`, biner-nya masuk ke `/usr/bin/htop`, yang DI LUAR workspace. Jadi tidak akan DISIMPAN. Di run berikutnya, harus install ulang.

Itulah kenapa ada cache APT dan `prestart.sh` : untuk menyiapkan ulang environment sistem setiap startup, karena hanya workspace yang bertahan.

Kalau kamu ingin installasi kamu bertahan, harus taruh di workspace (misalnya, install di folder lokal daripada di sistem). Ini gaya olahraga yang harus dibiasakan.

---

## VPS gratis vs VPS beneran : perbandingan

| | repo-to-vps | VPS Beneran (5€/bulan) |
|---|---|---|
| **Harga** | 0€ | ~5-10€/bulan |
| **Uptime** | 6 jam, harus restart | 24/7 |
| **Disk** | branch git, file kecil | SSD beneran, beberapa GB |
| **RAM** | ~7 GB (besar!) | 1-2 GB biasanya |
| **CPU** | 2-4 core lumayan | 1-2 vCPU |
| **Setup** | clone template | konfigurasi manual |
| **Persistensi** | workspace saja | sistem lengkap |
| **Legitimasi** | batas Syarat Ketentuan | 100% bersih |

Lucunya, dari segi spek mentah (RAM, CPU), runner GitHub seringkali LEBIH BAIK daripada VPS 5€. Tapi uptime 6 jam dan persistensi terbatas di workspace, inilah yang menjadikannya mainan hacker, bukan server beneran.

Untuk belajar, testing, debugging Linux cepat dalam environment yang bisa dipulihkan? Sempurna. Untuk host sesuatu yang serius? Ambil VPS beneran.

Tapi untuk environment Linux sementara yang bisa kamu restore kapan saja? Ini luar biasa.

---

## Pattern di balik semua ini

Kalau kamu lihat dari jauh, repo-to-vps dan bot email (artikelku yang lain) didasari ide yang sama :

> **Git bukan hanya version control. Ini adalah sistem penyimpanan persisten, gratis, versioned, bisa diakses via API.**

Begitu kamu punya sistem stateless (GitHub Actions, Worker, fungsi serverless) dan kamu ingin menjaga state antar eksekusi, git bisa berfungsi sebagai "disk".

- Bot email menyimpan `lastId` di git tag.
- repo-to-vps menyimpan seluruh filesystem di branch git.

Pattern sama, dua skala. Satu nilai di satu sisi, satu disk di sisi lain.

Dan `git commit --amend` + force-push adalah teknik umumnya : **kamu menyimpan satu commit yang merepresentasikan state terkini, ditimpa setiap update.**

Ini tidak dirancang untuk itu. Tapi berhasil. Dan gratis.

---

**3 hal yang perlu diingat :**

1. **Branch git = hard disk persisten** -- Simpan filesystem di branch khusus, restore saat startup, dan kamu punya state yang bertahan dari mesin disposable.

2. **inotify + git = autosave real-time** -- `inotifywait` memantau perubahan di level kernel dan push ke git secara instan. Dengan `git commit --amend` untuk menjaga satu commit yang bersih.

3. **tmate mengubah runner menjadi VPS** -- SSH live di mesin GitHub Actions, dengan auto-restart dan reconnect satu perintah via API GitHub.

Git sebagai hard disk, episode kedua. Kayaknya aku akan berakhir menyimpan semuanya di branch git xD
