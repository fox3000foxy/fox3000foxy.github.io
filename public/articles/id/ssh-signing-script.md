---
title: Skrip Penandatanganan SSH Dijelaskan
description: Membedah helper penandatanganan commit SSH dan kenapa saya
  menginginkan commit yang bergaya.
date: 2026-03-08
aiGenerated: true
tags:
  - git
  - security
  - shell
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "dmTLf8s3Q9sgsy0sMpxjem65oWTYi1NxUIUTBbdpU2/UXb/79xJu0RMrOpihQk5KgmxHoQhKP1eMiBLu69t1Pg=="
---

# Skrip penandatanganan SSH untuk commit -- penjelasan

Artikel ini membedah skrip `setup-ssh-signing.sh` yang saya publikasikan di [Gist](https://gist.github.com/fox3000foxy/95500d129cd4bf5c173c323d2492569a). Kita akan melihat apa yang dilakukan setiap bagian, bagaimana ia membuat penandatanganan SSH lokal ke repositori menjadi sama sekali tidak merepotkan, dan, ya, kenapa saya repot-repot menulisnya (bocoran : saya cuma ingin commit saya terlihat **keren**).

## Motivasi

Saya selalu suka mengutak-atik workflow Git saya, dan setelah melihat orang-orang dengan lencana kecil "Verified" di samping commit mereka, saya berpikir : kenapa bukan saya? Penandatanganan GPG bawaan itu berat dan global, jadi saya akhirnya menulis helper kecil yang :

- membuat kunci SSH khusus untuk penandatanganan,
- hanya mengonfigurasi repositori saat ini,
- kalau perlu menulis ulang riwayat untuk menandatangani commit lama,
- dan memungkinkan membawa kunci antar mesin.

Sejujurnya, kebutuhannya sebagian besar soal gengsi. Proyek pribadi saya tidak mewajibkan penandatanganan apa pun, tapi melihat lencana hijau "Verified" pada sebuah commit memang ada efeknya, dan menulis skrip shell ini benar-benar menyenangkan buat saya.

> Ya, menandatangani commit itu agak seperti memakai jaket kulit untuk review kode -- sama sekali tidak berguna, tapi membuatmu merasa seperti hacker.

## Apa yang dilakukan skrip ini

Skrip ini satu berkas Bash dengan `set -euo pipefail` di atas untuk menghentikan eksekusi sejak kesalahan pertama. Berikut ringkasan dari apa yang ia lakukan :

1. **Membuat atau mengimpor kunci penandatanganan**
   Kunci-kuncinya mendarat di `.git-signing/` di folder tempat kamu menjalankan skrip.
2. **Mengonfigurasi Git secara lokal**
   Ia menyetel `gpg.format=ssh`, `user.signingkey`, `commit.gpgsign=true`, `tag.gpgSign=true`, dan `allowedSignersFile` yang menunjuk ke kunci publik.
3. **Mengelola kunci antar mesin**
   Berkat `--export-keys` / `--import-keys`, kamu bisa mentransfer kunci privatmu dari satu komputer ke komputer lain tanpa menyentuh konfigurasi global.
4. **Penulisan ulang riwayat opsional** (`--resign-all`)
   Menulis ulang semua commit dari semua branch/tag (atau hanya yang tidak ada di `upstream` untuk fork) dan menandatanganinya ulang dengan `-S`, tanpa menyentuh penulis lain.
5. **Flag utilitas**
   `--autostash`, `--autopush`, `--commit-date`, `--yes` untuk mode non-interaktif, dll.
6. **Deteksi fork dan pemeriksaan keamanan**
   Ia mendeteksi remote `upstream`, memperingatkan sebelum menulis ulang riwayat, memeriksa alat yang dibutuhkan (`git`, `ssh-keygen`, `zip/unzip`), memastikan izin yang benar, dan bahkan membuat salinan aman dari kunci kalau izin filesystem terlalu longgar.

Skrip ini idempoten : menjalankannya dua kali tidak membuat ulang kuncimu dan tidak menimpa konfigurasi yang sudah ada.

## Langkah demi langkah

Berikut beberapa potongan kunci dari kodenya beserta penjelasannya.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Mengonfigurasi penandatanganan commit SSH dengan cara yang terkendali dan lokal ke repo.
# - Berkas kunci dibuat di direktori tempat skrip ini dijalankan.
# - Konfigurasi Git hanya ditulis secara lokal ke repositori saat ini.
```

Header-nya menetapkan keamanan dan mendokumentasikan tujuan. Bagian berikut mem parsing opsi CLI (`--name`, `--email`, `--repo`, dll.) dengan loop `while [[ $# -gt 0 ]]; do case … esac done`. Kolom identitas yang wajib diisi diperiksa belakangan :

```bash
if [[ -z "$NAME" || -z "$EMAIL" ]]; then
  echo "Error: missing identity. Provide --name and --email." >&2
  exit 1
fi
```

Pembuatan kunci dilakukan di `$LAUNCH_DIR/.git-signing`. Kalau kunci sudah ada, skrip mempertahankannya apa adanya ; `--import-keys` memungkinkan mengisi folder dari ZIP.

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

Setelah memastikan kunci privat bisa dipakai (`ssh-keygen -Y sign …`), skrip menulis berkas `allowed_signers` berisi kunci publik dan menyetel konfigurasi Git lokal :

```bash
git -C "$REPO_DIR" config --local gpg.format ssh
git -C "$REPO_DIR" config --local user.signingkey "$RUNTIME_KEY_PATH"
git -C "$REPO_DIR" config --local gpg.ssh.allowedSignersFile "$ALLOWED_SIGNERS"
git -C "$REPO_DIR" config --local commit.gpgsign true
git -C "$REPO_DIR" config --local tag.gpgSign true
```

Kalau kamu meminta penulisan ulang riwayat dengan `--resign-all`, skrip membangun perintah `git filter-branch` yang menandatangani ulang commit yang memenuhi syarat dengan `-S`. Ia menghormati status fork dengan opsional melewati commit yang sudah ada di `upstream`.

Hasil akhirnya menampilkan kunci publik dan instruksi untuk menambahkannya di bagian **Signing Key** GitHub, beserta resep pengujiannya.

## Kenapa menandatangani commit?

Inilah saatnya saya mengakui bahwa saya tidak membutuhkannya. Repositori saya tidak mewajibkan provenans apa pun untuk apa yang saya publikasikan, dan saya tidak memakai tag bertanda tangan untuk rilis. Alasannya adalah :

- karena saya bisa,
- karena tampilannya bagus (sudah lihat lencananya?),
- karena itu memberi saya alasan untuk bereksperimen dengan `git filter-branch` dan shell,
- dan karena ini satu lagi "saya membangunnya sendiri" untuk blog.

Singkatnya, ini cuma buat gaya, tapi itulah yang saya suka saat mengutak-atik peralatanku.

## Contoh penggunaan

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

# menulis ulang riwayat dan mendorong
./setup-ssh-signing.sh --repo ./my-repo --name "Your Name" --email "you@example.com" \
                       --resign-all --autostash --autopush --yes
```

## Renungan terakhir

Skrip ini tetap utilitas yang ringkas, tapi ia membawa beberapa prinsip yang saya pegang :

- menjaga kunci kriptografi tetap lokal dan per repositori,
- tidak pernah menyentuh konfigurasi global kecuali kamu memintanya,
- menyediakan import/export sederhana dan penulisan ulang riwayat,
- dan mendokumentasikan seluruh proses dalam artikel blog sebagai catatan yang bisa dipakai ulang.

Kalau kamu ingin menambahkan tanda tangan ke commit-commitmu sendiri, cobalah! Dan kalau kamu cuma di sini demi gaya, sama saja. 😎
