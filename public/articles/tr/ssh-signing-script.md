---
title: SSH commit imzalama scripti açıklaması
description: SSH commit imzalama yardımcısının adım adım açıklaması ve neden şık
  commit'ler istediğim.
date: 2026-03-08
aiGenerated: true
authors:
  - fox3000foxy
tags:
  - git
  - security
  - shell
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "m0rAN3yN1jE5hI6YzqeaCjFsHKISvrwjeq6BNPAsaQ5CVBswtkOCBXAttNSLlhQ1y9hwbdmqVavA/fKfjQhx0w=="
---

# SSH commit imzalama scripti açıklaması

Bu yazı, [Gist](https://gist.github.com/fox3000foxy/95500d129cd4bf5c173c323d2492569a) üzerinde yayınladığım `setup-ssh-signing.sh` scriptini derinlemesine inceliyor. Her bir parçanın ne yaptığına, repository bazlı SSH commit imzalamayı nasıl acısız hale getirdiğine ve evet, neden bunu yazma zahmetine girdiğime bakacağız (spoiler: sadece commit'lerimin **şık** görünmesini istedim).

## Motivasyon

Git iş akışımı özelleştirmeyi her zaman sevmişimdir ve başkalarının commit'lerinin yanındaki küçük "Doğrulandı" rozetlerini gördükten sonra düşündüm: neden ben de yapmıyorum? Yerleşik GPG imzalama biraz ağır ve genel olduğu için, ufak bir yardımcı script yazmaya karar verdim:

- sadece imzalama için bir SSH anahtarı oluşturur,
- yalnızca mevcut repository'i yapılandırır,
- isteğe bağlı olarak eski commit'leri imzalamak için geçmişi yeniden yazar,
- ve anahtarı makineler arasında taşımana izin verir.

Aslında ihtiyaç tamamen kibirden ibaretti. Kişisel projelerimde imzaların teknik bir gerekliliği yok, ama commit'te yeşil bir "Doğrulandı" rozeti görmek havalı hissettiriyor ve scripti yazmak da shell script yazma açısından eğlenceli bir alıştırmaydı.

> Yani, commit'lerini imzalamak, kod incelemesine deri ceketle gitmek gibi -- tamamen gereksiz, ama kendini hacker gibi hissettiriyor.

## Script ne yapıyor

Script, başında `set -euo pipefail` olan tek bir Bash dosyası, böylece hata durumunda hemen duruyor. İşte davranışının yüksek seviyeli özeti:

1. **İmza anahtarı oluştur veya içe aktar**  
   Anahtarlar, scripti çalıştırdığın dizinin altındaki `.git-signing/` klasöründe yaşar.
2. **Git'i yerel olarak yapılandır**  
   `gpg.format=ssh`, `user.signingkey`, `commit.gpgsign=true`, `tag.gpgSign=true` ve genel anahtarı gösteren bir `allowedSignersFile` ayarlar.
3. **Anahtarları makineler arasında yönet**  
   `--export-keys`/`--import-keys` desteği, özel anahtarı genel duruma dokunmadan bilgisayarlar arasında taşımanı sağlar.
4. **İsteğe bağlı geçmiş yeniden yazma** (`--resign-all`)  
   Her branch/tag'deki her commit'i (veya fork'lar için `upstream`'de olmayanları) yeniden imzalar ve diğer yazarlara dokunmadan `-S` ile yeniden commit'ler.
5. **Yardımcı flag'ler**  
   `--autostash`, `--autopush`, `--commit-date`, `--yes` (etkileşimsiz mod) vb.
6. **Fork farkındalığı ve güvenlik kontrolleri**  
   `upstream` remote'u algılar, geçmişi yeniden yazmadan önce uyarır, gerekli araçları (`git`, `ssh-keygen`, `zip/unzip`) kontrol eder, doğru izinleri sağlar ve hatta dosya sistemi izinleri çok gevşekse anahtarın güvenli bir çalışma zamanı kopyasını oluşturur.

Script idempotenttir: iki kere çalıştırmak anahtarını yeniden oluşturmaz veya varolan yapılandırmayı üzerine yazmaz.

## Adım adım inceleme

Aşağıda kodun açıklamalı bazı önemli kısımları var.

```bash
#!/usr/bin/env bash
set -euo pipefail

# SSH commit imzalamayı kontrollü, repo-bazlı bir şekilde yapılandır.
# - Anahtar dosyaları bu scriptin çalıştırıldığı dizinde oluşturulur.
# - Git yapılandırması sadece mevcut repository'e yerel olarak yazılır.
```

Başlık güvenliği sağlar ve hedefi belgeler. Sonraki kısım, CLI seçeneklerini (`--name`, `--email`, `--repo` vb.) bir `while [[ $# -gt 0 ]]; do case … esac done` döngüsüyle ayrıştırır. Zorunlu kimlik alanları daha sonra kontrol edilir:

```bash
if [[ -z "$NAME" || -z "$EMAIL" ]]; then
  echo "Error: missing identity. Provide --name and --email." >&2
  exit 1
fi
```

Anahtar oluşturma `$LAUNCH_DIR/.git-signing` altında gerçekleşir. Eğer anahtar zaten varsa script ona dokunmaz; `--import-keys` bir ZIP dosyasından dizini doldurabilir.

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

Özel anahtarın kullanılabilir olduğundan emin olduktan sonra (`ssh-keygen -Y sign …`), script genel anahtarı içeren ufak bir `allowed_signers` dosyası yazar ve Git yerel yapılandırmasını buna göre ayarlar:

```bash
git -C "$REPO_DIR" config --local gpg.format ssh
git -C "$REPO_DIR" config --local user.signingkey "$RUNTIME_KEY_PATH"
git -C "$REPO_DIR" config --local gpg.ssh.allowedSignersFile "$ALLOWED_SIGNERS"
git -C "$REPO_DIR" config --local commit.gpgsign true
git -C "$REPO_DIR" config --local tag.gpgSign true
```

`--resign-all` ile geçmiş yeniden yazmayı talep edersen, script uygun commit'leri `-S` ile yeniden imzalayan bir `git filter-branch` komutu oluşturur. Fork durumuna saygı göstererek, isteğe bağlı olarak `upstream`'de zaten var olan commit'leri atlar.

Son çıktı, genel anahtarı ve onu GitHub'ın **İmzalama Anahtarı** bölümüne ekleme talimatlarını, hızlı bir test tarifiyle birlikte yazdırır.

## Neden commit imzalamalı?

İşte ihtiyacım olmadığını itiraf ettiğim kısım. Repolarım yayınladığım hiçbir şey için kaynak doğrulaması gerektirmiyor ve sürümler için imzalı tag kullanmıyorum. "Neden" şu:

- çünkü yapabilirdim,
- çünkü şık görünüyor (rozeti gördün mü?),
- çünkü bana `git filter-branch` ve shell script ile deney yapma bahanesi verdi,
- ve çünkü bu, blog için bir "bunu kendim yaptım" içeriği daha.

Kısacası: sadece gösteriş içindi, ama araçlarla oynamanın eğlencesinin yarısı da bu zaten.

## Kullanım örnekleri

```bash
# mevcut repoda ilk kurulum
chmod +x ./setup-ssh-signing.sh
./setup-ssh-signing.sh --name "Adın Soyadın" \
                       --email "ornek@email.com"

# anahtarları başka bir makinede kullanmak için dışa aktar
./setup-ssh-signing.sh --export-keys ./my-signing-keys.zip

# ikinci makinede anahtarları içe aktar
./setup-ssh-signing.sh --import-keys ./my-signing-keys.zip --repo ./my-repo \
                       --name "Adın Soyadın" --email "ornek@email.com"

# geçmişi yeniden yaz ve pushla
./setup-ssh-signing.sh --repo ./my-repo --name "Adın Soyadın" --email "ornek@email.com" \
                       --resign-all --autostash --autopush --yes
```

## Son düşünceler

Bu script küçük bir yardımcı, ama içinde birkaç güzel fikir barındırıyor:

- kriptografik anahtarları yerel ve repo bazlı tut,
- istemedikçe genel yapılandırmaya dokunma,
- basit içe/dışa aktarma ve geçmiş yeniden yazma sun,
- ve neden olmasın diye tüm süreci bir blog yazısında belgele.

Eğer kendi commit'lerine imza eklemek istersen, dene bir şans! Ve eğer sadece stil puanları için buradaysan, aynı şekilde. 😎
