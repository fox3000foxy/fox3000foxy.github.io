---
title: "5 cara cerdik menggunakan GitHub Actions (dan apa yang diajarkan tentang secrets)"
description: "CI runner disulap jadi VPS gratis, bot yang membuka PR-nya sendiri, publish npm tanpa secret sama sekali. Tur ke repo-repo saya untuk membuat katalog pola GitHub Actions yang melampaui \"lint + test + deploy\"."
date: 2026-07-14
tags:
  - github-actions
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "8qFads06wDGPg/Iwjfr1llhz07afepDrsmoHZ9zhTpjtBcz7v9iC9YIdNndvy/f8iCpu9NjJX3cUcmaVrFX8Nw=="
---

# 5 cara cerdik menggunakan GitHub Actions

Di atas kertas, GitHub Actions untuk CI/CD klasik: kamu push, dia lint, test, deploy. Saya sudah menulis tentang kasus khusus -- menggunakan git tag sebagai database untuk bot email (lihat artikel khusus). Tapi menggali repo-repo saya sendiri, ada cukup banyak pola berbeda sehingga layak dibuat artikel tersendiri, kurang fokus pada satu proyek, lebih seperti katalog teknik.

Lima hal, dari yang paling klasik sampai paling nyeleneh.

## 1. Git tag sebagai state persisten antar run

Rekap cepat, detail lengkapnya di artikel `email-autoreply`. GitHub Actions didesain stateless -- setiap run mulai dari mesin kosong. Akal-akalannya: simpan sebuah nilai (ID, timestamp, state kecil apa pun) di git tag khusus, jangan pernah di branch.

```bash
# baca state
git show refs/tags/lastid:data/lastId > data/lastId

# tulis state (orphan branch, commit tunggal, force-push tag)
git switch --orphan lastid-tmp
git commit -m "lastId snapshot"
git tag -f lastid
git push --force origin lastid
```

Poin kuncinya: orphan branch agar tidak pernah menumpuk history, dan forced tag alih-alih branch agar tidak mengotori daftar branch repo.

## 2. Git tag sebagai cache build yang sudah dikompilasi

Satu keluarga ide, beda penggunaan: alih-alih menyimpan state aplikasi, simpan **artefak build**. Job `build` mengompilasi kode sekali (saat push ke `master`), lalu push `dist/` + `node_modules/` ke tag `runtime`. Job `cron` checkout langsung tag itu daripada menjalankan `bun install && bun run build` setiap eksekusi:

```yaml
- name: Checkout runtime snapshot
  uses: actions/checkout@v4
  with:
    ref: refs/tags/runtime
    fetch-depth: 1
# tidak ada install, tidak ada build -- kode sudah siap
- run: node dist/index.js --action
```

Ini mengubah waktu run dari ~20 detik ke ~10 detik. Pada cron yang sering jalan, ini berarti. `actions/cache` melakukan pekerjaan serupa (cache dependensi), tapi git tag lebih langsung ketika kamu ingin membekukan artefak berversi secara utuh dan menunjuknya secara eksplisit -- bukan cuma mempercepat `npm install`.

## 3. Satu required check yang menggabungkan banyak job

Pola kecil yang kelihatannya sepele tapi mengubah hidup dalam konfigurasi branch protection. Di `konosuba-rpg`, CI punya tiga job independen (`typecheck`, `lint`, `tests`) yang berjalan paralel -- dan job keempat, `test-battery`, yang tidak melakukan apa pun selain bergantung pada tiga job pertama:

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

Tanpa job fasad ini, mengonfigurasi branch yang dilindungi akan mengharuskan mencentang tiga check wajib terpisah -- dan memperbarui daftar itu setiap kali job ditambahkan atau diganti nama. Dengan `test-battery`, cukup satu nama untuk dicentang di pengaturan repo, yang tetap stabil meskipun detail internal berubah.

## 4. Mengubah runner gratis menjadi VPS sementara

Ini yang paling nyeleneh, dan jelas favorit saya: `repo-to-vps` sepenuhnya membajak penggunaan yang dimaksud dari runner GitHub Actions untuk menjadikannya mesin Linux yang bisa diakses via SSH, gratis, hingga 6 jam (durasi maksimum job).

Prinsipnya: sebuah job yang hampir tidak melakukan apa pun selain menjalankan tmate:

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

Masalah sebenarnya adalah filesystem runner GitHub Actions bersifat **sekali pakai** -- begitu job selesai, semuanya hilang. Sesi SSH yang berlangsung berjam-jam tidak berguna jika semua yang kamu lakukan menguap pada run berikutnya. Solusinya: branch git yang berfungsi sebagai snapshot langsung dari filesystem, disinkronkan terus-menerus.

Script `start-tmate.sh` melakukan, secara berurutan:

1. **Memulihkan** filesystem dari branch `filesystem` khusus saat job dimulai (`git reset --hard` ke branch itu).
2. **Mengawasi** perubahan file secara terus-menerus dengan `inotifywait`, dan **commit + push segera** begitu ada file yang berubah:

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock)(/|$)' .; do
    commit_and_push
    sleep 1
  done
}
```

3. Setiap penyimpanan **mengamend** commit sebelumnya alih-alih membuat yang baru (`git commit --amend --no-edit`), jadi branch `filesystem` selalu berada di satu commit -- tidak ada penumpukan ribuan snapshot.
4. Loop `while true` memulai ulang tmate secara otomatis jika sesi mati, dengan `remain-on-exit on` agar terminal tetap bisa dijangkau bahkan setelah `exit`.
5. URL SSH yang dihasilkan tmate ditulis ke file `host.conf`, di-commit ke branch `filesystem` -- bisa diambil via GitHub API (`gh api .../contents/host.conf`) tanpa pernah punya akses langsung ke log job.
6. Rutin `periodic_save` berjalan setiap 5 detik di latar belakang, kalau-kalau `inotifywait` melewatkan event.

Hasilnya: shell Linux lengkap, bisa diakses dari mana saja, dengan filesystem yang bertahan antar sesi -- padahal infrastruktur di bawahnya (runner GitHub Actions) sama sekali tidak dirancang untuk ini. Satu-satunya batasan nyata adalah timeout 6 jam per job -- setelah itu harus memulai ulang workflow.

## 5. Bot yang membuka PR-nya sendiri

Di `konosuba-rpg`, push ke branch `dev` memicu job yang memeriksa apakah sudah ada PR terbuka ke `main` -- dan membuatnya secara otomatis jika belum, via `actions/github-script` dan GitHub REST API:

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

Detail yang penting di sini adalah token yang digunakan. Workflow ini **tidak** menggunakan `GITHUB_TOKEN` otomatis -- ia memerlukan secret `AUTO_PR_TOKEN` terpisah, dan menolak melanjutkan jika tidak ada:

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

## 6. Publish ke npm tanpa secret sama sekali

Yang paling tenang dari kelimanya, tapi mungkin paling penting untuk masa depan: workflow `publish.yml` dari `typescript-virtual-container` **tidak mengandung secret npm apa pun**. Tidak ada `NPM_TOKEN`, tidak ada `NODE_AUTH_TOKEN`. Hanya ini:

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

`npm publish` tetap berfungsi, karena registry npm sekarang mendukung **trusted publishing** via OIDC: workflow membuktikan identitasnya langsung ke registry (repo persis + workflow persis, dikonfigurasi di sisi npmjs.org), tanpa ada token statis yang transit atau disimpan di mana pun. Nol secret yang bisa bocor, nol token yang harus dirotasi setiap enam bulan.

---

## GitHub secrets, secara mendalam

Kelima pola ini semuanya menyentuh, dengan satu atau lain cara, persoalan secrets. Beberapa prinsip yang berulang di semua workflow saya:

**Sebuah secret tidak selalu berupa string sederhana.** Di `email-autoreply`, `ACCOUNTS_JSON` berisi seluruh JSON terminifikasi dari konfigurasi multi-akun -- bukan cuma API key, struktur data lengkap, diinjeksi begitu saja ke file saat runtime:

```yaml
env:
  ACCOUNTS_JSON: ${{ secrets.ACCOUNTS_JSON }}
run: printf "%s" "$ACCOUNTS_JSON" > data/accounts.json
```

Ini menghindari harus commit file konfigurasi, bahkan yang terenkripsi, dan bisa diperbarui dengan satu klik di pengaturan repo tanpa menyentuh kode.

**`GITHUB_TOKEN` punya batasan yang tepat, dan itu disengaja.** Token otomatis yang disuntikkan GitHub ke setiap run itu kuat, tapi disegel pada titik-titik tertentu: secara default ia tidak bisa memicu workflow lain, dan tergantung konfigurasi repo bisa diblokir oleh aturan branch protection. Itulah kenapa `create-pull-request.yml` memerlukan PAT terpisah (`AUTO_PR_TOKEN`) -- token dari akun sungguhan (atau GitHub App), dengan hak eksplisit `contents:write` + `pull-requests:write`, terpisah dari token sementara job.

**Izin di-scope per job, bukan global.** Setiap workflow yang saya daftarkan di sini mendeklarasikan blok `permissions:` minimal dan dikomentari:

```yaml
permissions:
  contents: read
  actions: read
  checks: write
```

`GITHUB_TOKEN` bawaan secara historis punya hak yang cukup luas di repo publik; membatasinya secara eksplisit ke apa yang benar-benar dibutuhkan job membatasi kerusakan jika action pihak ketiga dalam rantai ternyata terkompromi.

**Secret terbaik adalah yang tidak ada.** Pola OIDC dari `typescript-virtual-container` adalah versi paling lengkap dari ide ini: alih-alih mengelola rotasi, kedaluwarsa, dan risiko kebocoran `NPM_TOKEN`, workflow membuktikan identitasnya secara kriptografis (repo persis ini, workflow persis ini) langsung ke layanan pihak ketiga. Logika yang sama tersedia untuk AWS, Docker Hub, PyPI -- semakin banyak registry dan cloud yang mendukung OIDC dari GitHub Actions.

---

**3 poin kunci**

1. Sebuah git tag (orphan, force-push) bisa berfungsi sebagai database minimalis atau cache build yang sudah dikompilasi -- dua penggunaan berbeda dari mekanisme yang sama.
2. Runner GitHub Actions gratis bisa menjadi shell SSH persisten jika kamu menerima untuk terus menyinkronkan filesystem-nya ke branch git, dengan autosave via `inotifywait` dan satu commit yang diamend.
3. `GITHUB_TOKEN` bawaan sengaja dibatasi -- membuat PR lintas branch atau publish tanpa secret memerlukan PAT khusus, atau beralih ke OIDC trusted publishing.
