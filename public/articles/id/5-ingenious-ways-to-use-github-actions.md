---
title: "5 cara cerdik memakai GitHub Actions (dan apa yang ia ajarkan soal secret)"
description: "Runner CI yang diubah menjadi VPS gratis, bot yang membuka pull request-nya sendiri, publish npm tanpa secret sedikit pun. Tur repo saya untuk mendaftar pola GitHub Actions yang keluar dari sekadar lint + test + deploy."
date: 2026-07-14
tags:
  - github-actions
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "wU2vcN3MUXVury+cTrj4m13Bn9zgXfvdaGPT5/fNrBKmamRWYkWDpbRn0YDBAOcEZvIIiarEaOZWt6W5qLl2OQ=="
---

# 5 cara cerdik memakai GitHub Actions

GitHub Actions, di atas kertas, dibuat untuk CI/CD klasik : kamu push, ia lint, ia test, ia deploy. Saya sudah menulis soal kasus khusus (memakai tag git sebagai basis data untuk bot email, lihat artikel khusus). Tapi dengan menggali repo saya sendiri, ada cukup banyak pola berbeda sampai layak jadi artikel tersendiri, kurang terpusat pada satu proyek, lebih katalog teknik.

Lima kegunaan, dari paling klasik hingga paling bengkok.

## 1. Tag git sebagai keadaan persisten antar run

Pengingat cepat, detail lengkapnya ada di artikel `email-autoreply`. GitHub Actions stateless secara desain : setiap run berangkat dari mesin perawan. Akal-akalannya : menyimpan nilai (ID, timestamp, keadaan kecil apa pun) dalam tag git khusus, tidak pernah di branch.

```bash
# membaca keadaan
git show refs/tags/lastid:data/lastId > data/lastId

# menulis keadaan (branch yatim, satu commit, force-push tag)
git switch --orphan lastid-tmp
git commit -m "lastId snapshot"
git tag -f lastid
git push --force origin lastid
```

Poin kuncinya : branch yatim supaya tidak pernah menumpuk riwayat, dan tag yang dipaksa alih-alih branch supaya tidak mengotori daftar branch repo.

## 2. Tag git sebagai cache build pra-kompilasi

Keluarga ide yang sama, kegunaan lain : alih-alih menyimpan keadaan aplikatif, kita menyimpan **artefak build**. Job `build` mengompilasi kode sekali (saat push ke `master`), lalu mendorong `dist/` + `node_modules/` ke tag `runtime`. Job `cron`, checkout langsung tag ini alih-alih menjalankan `bun install && bun run build` di setiap eksekusi :

```yaml
- name: Checkout runtime snapshot
  uses: actions/checkout@v4
  with:
    ref: refs/tags/runtime
    fetch-depth: 1
# tanpa install, tanpa build -- kode sudah siap
- run: node dist/index.js --action
```

Ini mengubah run dari ~20 detik menjadi ~10 detik. Pada cron yang sering berjalan, itu penting. `actions/cache` melakukan pekerjaan serupa (meng cache dependensi), tapi tag git lebih langsung ketika kamu ingin membekukan artefak berversi dan menunjuknya eksplisit, alih-alih sekadar mempercepat `npm install`.

## 3. Satu cek wajib yang mengagregasi banyak job

Pola kecil yang tampak sepele tapi mengubah hidup dalam konfigurasi branch terproteksi. Di `konosuba-rpg`, CI punya tiga job independen (`typecheck`, `lint`, `tests`) yang berjalan paralel, dan job keempat, `test-battery`, yang tidak melakukan apa pun selain bergantung pada tiga yang pertama :

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

Tanpa job fasad ini, mengonfigurasi branch terproteksi menuntut mencentang tiga cek wajib terpisah, dan memperbarui daftar itu setiap kali job ditambahkan atau diganti nama. Dengan `test-battery`, satu nama yang dicentang di pengaturan repo, yang tetap stabil meski detail internal berubah.

## 4. Mengubah runner gratis menjadi VPS sementara

Yang ini paling bengkok dari semuanya, dan jelas favorit saya : `repo-to-vps` mengalihkan sepenuhnya kegunaan yang dimaksud dari runner GitHub Actions untuk menjadikannya mesin Linux yang bisa diakses SSH, gratis, hingga 6 jam (batas maks satu job).

Prinsipnya : job yang hampir tidak melakukan apa pun selain menjalankan [tmate](https://tmate.io/) (fork tmux yang mengekspos sesi terminal yang bisa dibagikan lewat SSH atau peramban) :

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

Teka-teki sesungguhnya adalah filesystem runner GitHub Actions itu **sekali pakai** : begitu job selesai, semuanya hilang. Sesi SSH yang bertahan berjam-jam tidak ada gunanya kalau semua yang kamu lakukan di sana menguap di run berikutnya. Solusinya : branch git yang berfungsi sebagai snapshot live filesystem, disinkronkan terus-menerus.

Skrip `start-tmate.sh` melakukan, berurutan :

1. **Memulihkan** filesystem dari branch khusus `filesystem` saat job dimulai (`git reset --hard` ke sana).
2. **Mengawasi** perubahan berkas dengan `inotifywait` terus-menerus, dan **commit + push segera** begitu berkas bergerak :

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock)(/|$)' .; do
    commit_and_push
    sleep 1   # debounce
  done
}
```

3. Setiap simpanan **meng amend** commit sebelumnya alih-alih membuat yang baru (`git commit --amend --no-edit`), jadi branch `filesystem` selalu tetap satu commit, yang mencegah akumulasi ribuan snapshot.
4. Loop `while true` menyalakan ulang `tmate` otomatis kalau sesi mati, dengan `remain-on-exit on` supaya terminal tetap bisa dijangkau bahkan setelah `exit`.
5. URL SSH yang dibangkitkan tmate ditulis dalam berkas `host.conf`, yang di commit ke branch `filesystem`, jadi bisa diambil lewat API GitHub (`gh api .../contents/host.conf`) tanpa pernah punya akses ke log job secara langsung.
6. Rutin `periodic_save` berjalan setiap 5 detik di latar belakang, seandainya `inotifywait` melewatkan event.

Hasilnya : shell Linux lengkap, bisa diakses dari mana saja, dengan filesystem yang bertahan antar sesi, padahal infrastruktur di bawahnya (runner GitHub Actions) sama sekali tidak dirancang untuk itu. Satu-satunya batas nyata adalah timeout 6 jam per job : setelah itu workflow harus dijalankan ulang.

## 5. Bot yang membuka pull request-nya sendiri

Di `konosuba-rpg`, push ke branch `dev` memicu job yang memeriksa apakah sudah ada pull request terbuka ke `main`, dan otomatis membuatnya kalau belum, lewat `actions/github-script` dan API REST GitHub :

```js
const { data: comparison } = await github.rest.repos.compareCommits({
  owner, repo, base: 'main', head: 'dev',
});
if (comparison.ahead_by === 0) return; // tidak ada yang diusulkan

const { data: existing } = await github.rest.pulls.list({
  owner, repo, state: 'open', head: `${owner}:dev`, base: 'main',
});
if (existing.length > 0) return; // sudah ada PR terbuka

await github.rest.pulls.create({
  owner, repo, head: 'dev', base: 'main',
  title: 'chore: auto PR from dev to main',
});
```

Detail yang penting di sini adalah token yang dipakai. Workflow ini **tidak** memakai `GITHUB_TOKEN` otomatis : ia menuntut secret terpisah `AUTO_PR_TOKEN`, dan menolak lanjut kalau tidak ada :

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

## 6. Menerbitkan ke npm tanpa secret apa pun

Yang paling diam dari kelimanya, tapi mungkin paling penting untuk masa depan : workflow `publish.yml` dari `typescript-virtual-container` tidak berisi **secret npm apa pun**. Tanpa `NPM_TOKEN`, tanpa `NODE_AUTH_TOKEN`. Hanya ini :

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

`npm publish` tetap berhasil, karena registri npm kini mendukung **trusted publishing** lewat OIDC : workflow membuktikan identitasnya langsung ke registri (repo + workflow yang persis, dikonfigurasi di sisi npmjs.org), tanpa token statis apa pun transit maupun disimpan di mana pun. Nol secret yang bisa bocor, nol token yang diputar setiap enam bulan.

---

## Secret GitHub, secara mendalam

Kelima pola ini semuanya menyentuh soal secret, dengan satu atau lain cara. Beberapa prinsip yang kembali di semua workflow saya :

**Secret belum tentu string sederhana.** Di `email-autoreply`, `ACCOUNTS_JSON` berisi JSON minifikasi utuh dari config multi-akun : struktur data lengkap alih-alih sekadar kunci API, disuntikkan apa adanya ke berkas saat runtime :

```yaml
env:
  ACCOUNTS_JSON: ${{ secrets.ACCOUNTS_JSON }}
run: printf "%s" "$ACCOUNTS_JSON" > data/accounts.json
```

Ini menghindari keharusan meng commit berkas config, bahkan yang terenkripsi, dan diperbarui dalam sekali klik di pengaturan repo tanpa menyentuh kode.

**`GITHUB_TOKEN` punya batas tepat, dan itu disengaja.** Token otomatis yang disuntikkan GitHub ke setiap run itu kuat, tapi tersegel pada poin tertentu : secara bawaan, ia tidak bisa memicu workflow lain, dan tergantung konfigurasi repo ia bisa diblokir oleh aturan proteksi branch. Tepat karena itulah `create-pull-request.yml` menuntut PAT terpisah (`AUTO_PR_TOKEN`) : token yang berasal dari akun sungguhan (atau GitHub App), dengan hak eksplisit `contents:write` + `pull-requests:write`, berbeda dari token fana job.

**Izin di scoping per job, bukan global.** Setiap workflow yang saya daftarkan di sini mendeklarasikan blok `permissions:` yang minimal dan dikomentari :

```yaml
permissions:
  contents: read
  actions: read
  checks: write
  # Only allow writing checks, everything else is read-only
```

`GITHUB_TOKEN` bawaan secara historis punya hak cukup luas di repo publik ; membatasinya eksplisit pada apa yang benar-benar dibutuhkan job membatasi kerusakan kalau action pihak ketiga dalam rantai (`uses: seseorang/action@versi`) ternyata dikompromikan.

**Secret terbaik adalah yang tidak ada.** Pola OIDC dari `typescript-virtual-container` adalah versi paling matang dari ide ini : alih-alih mengelola rotasi, kedaluwarsa, dan risiko bocornya `NPM_TOKEN`, workflow membuktikan kriptografis identitasnya (repo tepat ini, workflow tepat ini) langsung ke layanan pihak ketiga. Logika yang sama tersedia untuk AWS, Docker Hub, PyPI : makin banyak registri dan cloud mendukung OIDC dari GitHub Actions.

---

**3 poin kunci**

1. Tag git (yatim, di force-push) bisa berfungsi sebagai basis data minimalis atau cache build pra-kompilasi : dua kegunaan berbeda dari mekanisme yang sama.
2. Runner GitHub Actions gratis bisa menjadi shell SSH persisten kalau kita menerima menyinkronkan filesystemnya terus-menerus ke branch git, dengan autosave lewat `inotifywait` dan satu commit yang di amend.
3. `GITHUB_TOKEN` bawaan sengaja dibatasi : membuat PR antar-branch atau menerbitkan tanpa secret menuntut PAT khusus atau beralih ke trusted publishing OIDC.
