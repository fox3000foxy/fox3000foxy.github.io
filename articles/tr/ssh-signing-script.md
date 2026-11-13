---
title: SSH imzalama scripti açıklaması
description: SSH commit imzalama yardımcısının incelenmesi ve neden havalı commitler
  istediğim.
date: 2026-03-08
aiGenerated: true
tags:
  - git
  - security
  - shell
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "XW31faRBML3T9T64oRRX/1APpBceJ+TYcv7ymXtOJg7y2Wl7F1LyV405r4QwKbvcWytclskoC3DLmnvaMSRJAw=="
---

# Commitler için SSH imzalama scripti, açıklama

Bu makale [Gist](https://gist.github.com/fox3000foxy/95500d129cd4bf5c173c323d2492569a) üzerinde yayınladığım `setup-ssh-signing.sh` scriptini inceliyor. Her parçanın ne yaptığını, bir depoya yerel SSH imzalamayı nasıl tamamen ağrısız hale getirdiğini ve evet, neden onu yazmaya zahmet ettiğimi göreceğiz (spoiler: sadece commitlerimin **havası** olmasını istedim).

## Motivasyon

Git workflowumla oynamayı hep sevdim ve commitlerinin yanında küçük "Verified" rozetleri olan insanları gördükten sonra kendime dedim ki: neden ben de olmasın? Yerleşik GPG imzası ağır ve global, o yüzden sonunda şunları yapan küçük bir yardımcı yazdım:

- imzalamaya adanmış bir SSH anahtarı oluşturur,
- yalnızca mevcut depoyu yapılandırır,
- gerekirse eski commitleri imzalamak için tarihçeyi yeniden yazar,
- ve anahtarı makineler arasında taşımaya izin verir.

Açıkçası ihtiyaç daha çok kibirle ilgiliydi. Kişisel projelerim hiçbir imza gereksinimi dayatmıyor ama bir commit üzerinde yeşil "Verified" rozeti görmek etkisini gösteriyor ve bu scripti kabukta yazmak bana gerçekten keyif verdi.

> Yani, commitlerini imzalamak kod incelemesi için deri ceket giymek gibi, tamamen gereksiz ama kendini hacker gibi hissettiriyor.

## Script ne yapıyor

Script, en üstte ilk hatada çalışmayı durdurmak için `set -euo pipefail` olan tek bir Bash dosyası. İşte yaptıklarının özeti:

1. **İmza anahtarı üret ya da içe aktar**
   Anahtarlar scripti çalıştırdığın klasördeki `.git-signing/` içine düşer.
2. **Giti yerel olarak yapılandır**
   `gpg.format=ssh`, `user.signingkey`, `commit.gpgsign=true`, `tag.gpgSign=true` ve genel anahtarı gösteren bir `allowedSignersFile` ayarlar.
3. **Anahtarları makineler arasında yönet**
   `--export-keys` / `--import-keys` sayesinde özel anahtarını global yapılandırmaya dokunmadan bir bilgisayardan diğerine aktarabilirsin.
4. **İsteğe bağlı tarihçe yeniden yazımı** (`--resign-all`)
   Tüm dal ve etiketlerdeki tüm commitleri yeniden yazar (forklar için `upstream` içinde olmayanlarla sınırlı da olabilir) ve diğer yazarlara dokunmadan `-S` ile yeniden imzalar.
5. **Yardımcı bayraklar**
   Etkileşimsiz mod için `--autostash`, `--autopush`, `--commit-date`, `--yes` vs.
6. **Fork tespiti ve güvenlik kontrolleri**
   `upstream` uzaktanını tespit eder, tarihçeyi yeniden yazmadan önce uyarır, gerekli araçları kontrol eder (`git`, `ssh-keygen`, `zip/unzip`), doğru izinleri sağlar ve dosya sistemi izinleri fazla genişse anahtarın güvenli bir kopyasını bile oluşturur.

Script idempotent: iki kez çalıştırmak anahtarını yeniden üretmez ve mevcut yapılandırmayı ezmez.

## Adım adım akış

İşte açıklamalarıyla kodun kilit alıntıları.

```bash
#!/usr/bin/env bash
set -euo pipefail

# SSH commit imzalamayı kontrollü, depoya yerel bir şekilde yapılandır.
# - Anahtar dosyaları bu scriptin çalıştırıldığı dizinde oluşturulur.
# - Git yapılandırması yalnızca mevcut depoya yerel olarak yazılır.
```

Başlık güvenliği ortaya koyar ve amacı belgeler. Sonraki parça CLI seçeneklerini (`--name`, `--email`, `--repo` vs.) bir `while [[ $# -gt 0 ]]; do case … esac done` döngüsüyle ayrıştırır. Zorunlu kimlik alanları daha sonra kontrol edilir:

```bash
if [[ -z "$NAME" || -z "$EMAIL" ]]; then
  echo "Error: missing identity. Provide --name and --email." >&2
  exit 1
fi
```

Anahtar üretimi `$LAUNCH_DIR/.git-signing` içinde yapılır. Bir anahtar zaten varsa script onu olduğu gibi korur; `--import-keys` klasörü bir ZIPten doldurmaya izin verir.

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

Özel anahtarın kullanılabilir olduğunu doğruladıktan sonra (`ssh-keygen -Y sign …`) script genel anahtarı içeren bir `allowed_signers` dosyası yazar ve yerel Git yapılandırmasını ayarlar:

```bash
git -C "$REPO_DIR" config --local gpg.format ssh
git -C "$REPO_DIR" config --local user.signingkey "$RUNTIME_KEY_PATH"
git -C "$REPO_DIR" config --local gpg.ssh.allowedSignersFile "$ALLOWED_SIGNERS"
git -C "$REPO_DIR" config --local commit.gpgsign true
git -C "$REPO_DIR" config --local tag.gpgSign true
```

`--resign-all` ile tarihçe yeniden yazımı istersen script, uygun commitleri `-S` ile yeniden imzalayan bir `git filter-branch` komutu kurar. `upstream` içinde zaten bulunan commitleri isteğe bağlı atlayarak fork durumuna saygı gösterir.

Final sonuç genel anahtarı ve onu GitHubın **Signing Key** bölümüne ekleme talimatlarını bir test tarifiyle gösterir.

## Commitleri neden imzalamalı?

İhtiyacım olmadığını itiraf ettiğim an burası. Depolarım yayınladıklarım için hiçbir kaynak zorunluluğu koymuyor ve releaseler için imzalı etiket kullanmıyorum. "Neden" sorusu:

- çünkü yapabiliyordum,
- çünkü güzel duruyor (rozeti gördün mü?),
- çünkü bana `git filter-branch` ve kabukla deney yapma bahanesi verdi,
- ve çünkü blog için bir "bunu kendim inşa ettim" daha.

Kısacası sırf hava atmak içindi ama araçlarımla oynarken sevdiğim şey bu.

## Kullanım örnekleri

```bash
# mevcut depoda ilk kurulum
chmod +x ./setup-ssh-signing.sh
./setup-ssh-signing.sh --name "Your Name" \
                       --email "you@example.com"

# anahtarları başka bir makineye aktar
./setup-ssh-signing.sh --export-keys ./my-signing-keys.zip

# anahtarları ikinci bir makineye içe aktar
./setup-ssh-signing.sh --import-keys ./my-signing-keys.zip --repo ./my-repo \
                       --name "Your Name" --email "you@example.com"

# tarihçeyi yeniden yaz ve pushla
./setup-ssh-signing.sh --repo ./my-repo --name "Your Name" --email "you@example.com" \
                       --resign-all --autostash --autopush --yes
```

## Son düşünceler

Bu script kompakt bir yardımcı olmaya devam ediyor ama savunduğum birkaç ilkeyi taşıyor:

- kriptografik anahtarları yerel ve depo başına tutmak,
- sen istemedikçe global yapılandırmaya asla dokunmamak,
- basit bir içe/dışa aktarma ve tarihçe yeniden yazımı sağlamak,
- ve yeniden kullanılabilir bir iz bırakmak için tüm süreci bir blog yazısında belgelemek.

Kendi commitlerine imza ekleme isteği duyarsan dene! Ve sadece stil için buradaysan, o da olur. 😎
