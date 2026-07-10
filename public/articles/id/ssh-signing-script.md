---
title: Skrip Penandatanganan SSH Dijelaskan
description: Menguraikan helper penandatanganan komit SSH dan mengapa saya ingin
  komit yang bergaya.
date: 2026-03-08
aiGenerated: true
tags:
  - git
  - security
  - shell
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA=="
author_sig: "MEUCIBkEHiNfRtGaYq6PXA3mkF9ObQYXvWug/1yQbJnXa2r+AiEAh1BCWq7M5UfMZytoNnj5E1RxhaChhBgkrJE0iKAC4zw="
---

# Skrip Penandatanganan SSH untuk Komit -- Penjelasan

Artikel ini menguraikan skrip `setup-ssh-signing.sh` yang saya publikasikan di [Gist](https://gist.github.com/fox3000foxy/95500d129cd4bf5c173c323d2492569a). Kita akan lihat apa yang dilakukan setiap bagian, bagaimana cara membuat penandatanganan SSH lokal untuk sebuah repositori menjadi sangat mudah, dan, ya, mengapa saya repot-repot menulisnya (spoiler: saya hanya ingin komit saya terlihat **keren**).

## Motivasi

Saya selalu suka mengutak-atik alur kerja Git saya, dan setelah melihat orang-orang dengan lencana « Verified » kecil di samping komit mereka, saya berpikir: kenapa bukan saya? Penandatanganan GPG bawaan terasa berat dan global, jadi saya akhirnya menulis helper kecil yang:

- membuat kunci SSH khusus untuk penandatanganan,
- hanya mengonfigurasi repositori saat ini,
- opsionalnya menulis ulang riwayat untuk menandatangani komit lama,
- dan memungkinkan membawa kunci antar mesin.

Sejujurnya, kebutuhannya lebih karena gaya. Tidak ada persyaratan teknis penandatanganan di proyek pribadi saya, tetapi melihat lencana hijau « Verified » pada komit itu terasa keren, dan menulis skripnya adalah kesenangan tersendiri di shell.

> Baik, menandatangani komit itu seperti memakai jaket kulit untuk review kode -- sama sekali tidak berguna, tetapi membuatmu merasa seperti seorang hacker.

## Apa yang Dilakukan Skrip

Skrip ini adalah satu file Bash dengan `set -euo pipefail` di atas agar cepat gagal jika ada masalah. Berikut ringkasan apa yang dilakukannya:

1. **Membuat atau mengimpor kunci penandatanganan**  
   Kunci ditempatkan di `.git-signing/` dalam direktori tempat kamu menjalankan skrip.
2. **Mengonfigurasi Git secara lokal**  
   Mengatur `gpg.format=ssh`, `user.signingkey`, `commit.gpgsign=true`, `tag.gpgSign=true`, dan `allowedSignersFile` yang mengarah ke kunci publik.
3. **Mengelola kunci antar mesin**  
   Dengan `--export-keys` / `--import-keys`, kamu bisa membawa kunci privat dari satu komputer ke komputer lain tanpa menyentuh konfigurasi global.
4. **Penulisan ulang riwayat opsional** (`--resign-all`)  
   Menulis ulang semua komit di semua cabang/tag (atau hanya yang tidak ada di `upstream` untuk fork) dan menandatanganinya ulang dengan `-S`, tanpa mengubah penulis lain.
5. **Flag utilitas**  
   `--autostash`, `--autopush`, `--commit-date`, `--yes` untuk mode non-interaktif, dll.
6. **Deteksi fork dan pemeriksaan keamanan**  
   Mendeteksi remote `upstream`, memperingatkan sebelum menulis ulang riwayat, memeriksa alat yang diperlukan (`git`, `ssh-keygen`, `zip/unzip`), memastikan izin yang benar, dan bahkan membuat salinan aman kunci jika izin filesystem terlalu longgar.

Skrip ini idempoten: menjalankannya dua kali tidak akan membuat ulang kunci atau menimpa konfigurasi yang sudah ada.

## Penjelasan Langkah demi Langkah

Berikut beberapa cuplikan kunci dari kode beserta penjelasannya.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Configure SSH commit signing in a controlled, repo-local way.
# - Key files are created in the directory where this script is launched.
# - Git config is written locally to the current repository only.
```

Header ini menetapkan keamanan dan mendokumentasikan tujuan. Bagian berikutnya mem-parsing opsi CLI (`--name`, `--email`, `--repo`, dll.) dengan loop `while [[ $# -gt 0 ]]; do case … esac done`. Bidang identitas wajib diperiksa nanti:

```bash
if [[ -z "$NAME" || -z "$EMAIL" ]]; then
  echo "Error: missing identity. Provide --name and --email." >&2
  exit 1
fi
```

Pembuatan kunci terjadi di `$LAUNCH_DIR/.git-signing`. Jika kunci sudah ada, skrip akan membiarkannya; `--import-keys` memungkinkan mengisi direktori dari file ZIP.

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

Setelah memverifikasi bahwa kunci privat dapat digunakan (`ssh-keygen -Y sign …`), skrip menulis file `allowed_signers` kecil yang berisi kunci publik dan mengatur konfigurasi Git lokal:

```bash
git -C "$REPO_DIR" config --local gpg.format ssh
git -C "$REPO_DIR" config --local user.signingkey "$RUNTIME_KEY_PATH"
git -C "$REPO_DIR" config --local gpg.ssh.allowedSignersFile "$ALLOWED_SIGNERS"
git -C "$REPO_DIR" config --local commit.gpgsign true
git -C "$REPO_DIR" config --local tag.gpgSign true
```

Jika kamu meminta penulisan ulang riwayat dengan `--resign-all`, skrip akan menyusun perintah `git filter-branch` yang menandatangani ulang komit yang memenuhi syarat dengan `-S`. Skrip ini menghormati status fork dengan secara opsional melewati komit yang sudah ada di `upstream`.

Hasil akhirnya menampilkan kunci publik dan petunjuk untuk menambahkannya di bagian **Signing Key** GitHub, lengkap dengan resep pengujian kecil.

## Mengapa Menandatangani Komit?

Inilah saatnya saya mengakui bahwa saya tidak membutuhkannya. Repositori saya tidak memerlukan provenans untuk apa yang saya publikasikan, dan saya tidak menggunakan tag yang ditandatangani untuk rilis. « Mengapa » nya adalah:

- karena saya bisa,
- karena terlihat bagus (lihat lencananya?),
- karena ini memberi saya alasan untuk bereksperimen dengan `git filter-branch` dan shell,
- dan karena ini adalah satu lagi « saya membuat ini sendiri » untuk blog.

Singkatnya, ini hanya untuk pamer, tetapi itulah yang menyenangkan saat mengutak-atik alat sendiri.

## Contoh Penggunaan

```bash
# konfigurasi awal di repositori saat ini
chmod +x ./setup-ssh-signing.sh
./setup-ssh-signing.sh --name "Your Name" \
                       --email "you@example.com"

# mengekspor kunci untuk mesin lain
./setup-ssh-signing.sh --export-keys ./my-signing-keys.zip

# mengimpor kunci di mesin kedua
./setup-ssh-signing.sh --import-keys ./my-signing-keys.zip --repo ./my-repo \
                       --name "Your Name" --email "you@example.com"

# menulis ulang riwayat dan push
./setup-ssh-signing.sh --repo ./my-repo --name "Your Name" --email "you@example.com" \
                       --resign-all --autostash --autopush --yes
```

## Pemikiran Terakhir

Skrip ini adalah utilitas kecil, tetapi mengandung beberapa ide menarik:

- menyimpan kunci kriptografis secara lokal dan per repositori,
- tidak pernah menyentuh konfigurasi global kecuali kamu memintanya,
- menyediakan impor/ekspor sederhana dan penulisan ulang riwayat,
- dan mendokumentasikan seluruh proses dalam artikel blog, karena kenapa tidak.

Jika kamu tertarik untuk menambahkan tanda tangan ke komitmu sendiri, cobalah! Dan jika kamu hanya di sini untuk gayanya, sama saja. 😎
