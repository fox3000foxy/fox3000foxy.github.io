---
title: "GitHub Actions'ı Kullanmanın 5 Zekice Yolu (ve sırlar hakkında öğrettikleri)"
description: "Ücretsiz VPS'e dönüşen bir CI runner, kendi pull requestlerini açan bir bot, tek bir sır bile olmadan npm yayını. Klasik 'lint + test + deploy' kalıbının dışına çıkan desenleri listelemek için depolarımda bir tur."
date: 2026-07-14
tags:
  - github-actions
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "+nI5/DlOSKZJfIxM1tve+MbVjceMSX62oD73OzJpqeA/Ka+D+XeEW9HJR93/mQYrLctaFbBFnpYC3dApM1ERLg=="
---

# GitHub Actions'ı Kullanmanın 5 Zekice Yolu

GitHub Actions kağıt üzerinde klasik CI/CD için var: push yaparsın, lint çalışır, test edilir, dağıtılır. Özel bir durum hakkında zaten yazdım (bir e-posta botu için git taglerini veritabanı olarak kullanmak, ilgili makaleye bak). Ama kendi depolarımı karıştırınca, tek bir projeye odaklanan bir makaleden çok teknik kataloğuna benzeyecek kadar desen birikti.

En klasikten en çarpığına, beş kullanım.

## 1. İki run arasında kalıcı durum olarak bir git tagi

Hızlı bir hatırlatma, tüm detay `email-autoreply` makalesinde. GitHub Actions tasarım gereği stateless çalışır: her run tertemiz bir makineden başlar. Geçici çözüm: bir değeri (bir ID, bir zaman damgası, küçük bir durum) asla bir dalda değil, adanmış bir git taginde saklamak.

```bash
# durumu oku
git show refs/tags/lastid:data/lastId > data/lastId

# durumu yaz (öksüz dal, tek bir commit, tagin force-pushu)
git switch --orphan lastid-tmp
git commit -m "lastId snapshot"
git tag -f lastid
git push --force origin lastid
```

Kilit nokta: hiç tarihçe biriktirmemek için öksüz bir dal, ve deponun dal listesini kirletmemek için dal yerine force uygulanan bir tag.

## 2. Önceden derlenmiş yapı önbelleği olarak bir git tagi

Aynı fikir ailesi, farklı kullanım: uygulama durumu saklamak yerine bir **yapı artefaktı** saklıyoruz. `build` işi kodu bir kez derler (`master` üzerine push yapılınca), sonra `dist/` + `node_modules/` içeriğini bir `runtime` tagine pushlar. `cron` işi ise `bun install && bun run build` çalıştırmak yerine doğrudan bu tagi checkout eder:

```yaml
- name: Checkout runtime snapshot
  uses: actions/checkout@v4
  with:
    ref: refs/tags/runtime
    fetch-depth: 1
# kurulum yok, yapı yok, kod zaten hazır
- run: node dist/index.js --action
```

Bu, run süresini ~20 saniyeden ~10 saniyeye indiriyor. Sık çalışan bir cronda bu fark önemli. `actions/cache` benzer bir iş yapar (bağımlılıkları önbelleğe alır) ama bir git tagi, sadece bir `npm install` hızlandırmaktan çok sürümlü bir artefaktı doğrudan sabitleyip açıkça işaret etmek istediğinde daha nettir.

## 3. Birden çok işi toplayan tek bir zorunlu kontrol

Küçük görünen ama korumalı dal yapılandırmasında hayat değiştiren bir desen. `konosuba-rpg` üzerinde CI'ın paralel çalışan üç bağımsız işi var (`typecheck`, `lint`, `tests`) ve dördüncü bir iş, `test-battery`, üçüne bağımlı olmaktan başka bir şey yapmıyor:

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

Bu cephe işi olmadan korumalı dal yapılandırmak üç ayrı zorunlu kontrol işaretlemeyi gerektirirdi ve bir iş her eklendiğinde ya da yeniden adlandırıldığında bu listeyi güncellemek gerekirdi. `test-battery` ile deponun ayarlarında işaretlenecek tek bir isim olur ve iç detay değişse bile sabit kalır.

## 4. Ücretsiz runnerı geçici VPS'e dönüştürmek

Bunların içinde en çarpığı bu ve açık ara favorim: `repo-to-vps`, bir GitHub Actions runnerını baştan sona saptırıp en fazla 6 saate kadar (bir işin maksimum limiti) SSH ile erişilebilen ücretsiz bir Linux makinesine dönüştürüyor.

Prensip: [tmate](https://tmate.io/) (SSH ya da tarayıcı üzerinden paylaşılabilir terminal oturumu açan bir tmux çatalı) çalıştırmaktan başka neredeyse hiçbir şey yapmayan bir iş:

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

Asıl baş ağrısı, bir GitHub Actions runnerının dosya sisteminin **atılabilir** olması: iş biter bitmez her şey kaybolur. Saatlerce süren bir SSH oturumu, içinde yaptığın her şey bir sonraki run dawn siliniyorsa hiçbir işe yaramaz. Çözüm: dosya sisteminin canlı anlık görüntüsü olarak hizmet eden, sürekli senkronize edilen bir git dalı.

`start-tmate.sh` scripti sırayla şunları yapar:

1. İş başlarken dosya sistemini `filesystem` adlı adanmış bir daldan **geri yükler** (`git reset --hard` ile üzerine).
2. Dosya değişikliklerini `inotifywait` ile sürekli **izler** ve bir dosya oynadığı anda **hemen commit + push yapar**:

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock)(/|$)' .; do
    commit_and_push
    sleep 1   # debounce
  done
}
```

3. Her kayıt yeni bir commit oluşturmak yerine öncekini **değiştirir** (`git commit --amend --no-edit`), böylece `filesystem` dalı her zaman tek committe kalır ve binlerce anlık görüntünün birikmesi engellenir.
4. Bir `while true` döngüsü, oturum ölürse `tmate`i otomatik olarak yeniden başlatır, `remain-on-exit on` ile terminal `exit` sonrasında bile ulaşılabilir kalır.
5. tmate tarafından üretilen SSH URLsi `host.conf` adlı bir dosyaya yazılır, `filesystem` dalına commitlenir, yani GitHub API üzerinden alınabilir (`gh api .../contents/host.conf`), işin loglarına canlı erişmeye hiç gerek kalmaz.
6. `inotifywait` bir olayı kaçırırsa diye 5 saniyede bir arka planda çalışan bir `periodic_save` rutini vardır.

Sonuç: altyapı (bir GitHub Actions runnerı) bunun için kesinlikle tasarlanmamışken, dosya sistemi oturumlar arasında kalıcı, her yerden erişilebilen tam bir Linux kabuğu. Tek gerçek limit iş başına 6 saatlik timeout: sonrasında workflowu yeniden başlatmak gerekir.

## 5. Kendi pull requestlerini açan bir bot

`konosuba-rpg` üzerinde `dev` dalına push yapmak, `main`e açık bir pull request olup olmadığını kontrol eden ve yoksa GitHub REST API üzerinden `actions/github-script` ile otomatik olarak oluşturan bir işi tetikler:

```js
const { data: comparison } = await github.rest.repos.compareCommits({
  owner, repo, base: 'main', head: 'dev',
});
if (comparison.ahead_by === 0) return; // önerilecek bir şey yok

const { data: existing } = await github.rest.pulls.list({
  owner, repo, state: 'open', head: `${owner}:dev`, base: 'main',
});
if (existing.length > 0) return; // zaten açık bir PR var

await github.rest.pulls.create({
  owner, repo, head: 'dev', base: 'main',
  title: 'chore: auto PR from dev to main',
});
```

Burada önemli olan detay kullanılan token. Bu workflow otomatik `GITHUB_TOKEN`ı **kullanmıyor**: ayrı bir `AUTO_PR_TOKEN` sırrı istiyor ve bu yoksa devam etmeyi reddediyor:

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

## 6. Hiçbir sır olmadan npm üzerinde yayınlamak

Beşinin içinde en göze çarpmayanı ama muhtemelen gelecek için en önemlisi: `typescript-virtual-container` deposunun `publish.yml` workflowu **hiç npm sırrı içermiyor**. `NPM_TOKEN` yok, `NODE_AUTH_TOKEN` yok. Sadece bu:

```yaml
permissions:
  id-token: write  # OIDC için gerekli
  contents: read
jobs:
  publish:
    steps:
      - uses: actions/setup-node@v6
        with:
          registry-url: 'https://registry.npmjs.org'
      - run: npm publish
```

`npm publish` yine de çalışıyor çünkü npm kayıt defteri artık OIDC üzerinden **trusted publishing** destekliyor: workflow kimliğini doğrudan kayıt defterine kanıtlıyor (npmjs.org tarafında yapılandırılmış tam depo + workflow), arada hiçbir statik token geçmiyor ve hiçbir yerde saklanmıyor. Sızdırılacak sıfır sır, altı ayda bir döndürülecek sıfır token.

---

## GitHub sırları, derinlemesine

Bu beş desenin hepsi bir şekilde sırlar konusuna dokunuyor. Workflowlarımın hepsinde tekrar eden birkaç ilke:

**Bir sır illa basit bir dize olmak zorunda değil.** `email-autoreply` içinde `ACCOUNTS_JSON`, çok hesaplı yapılandırmanın minifiye edilmiş JSONunun tamamını içerir: basit bir API anahtarından çok, çalışma anında olduğu gibi bir dosyaya enjekte edilen tam bir veri yapısı:

```yaml
env:
  ACCOUNTS_JSON: ${{ secrets.ACCOUNTS_JSON }}
run: printf "%s" "$ACCOUNTS_JSON" > data/accounts.json
```

Bu, şifreli bile olsa bir yapılandırma dosyasını commitlemekten kurtarır ve koda dokunmadan deponun ayarlarından tek tıkla güncellenir.

**`GITHUB_TOKEN`ın kesin limitleri var ve bu istenerek yapılmış.** GitHubın her runa enjekte ettiği otomatik token güçlüdür ama bazı noktalarda mühürlüdür: varsayılan olarak başka bir workflow tetikleyemez ve deponun yapılandırmasına göre dal koruma kurallarına takılabilir. `create-pull-request.yml`in ayrı bir PAT (`AUTO_PR_TOKEN`) istemesi tam olarak bu yüzden: işin geçici tokenından farklı, açık `contents:write` + `pull-requests:write` haklarına sahip, gerçek bir hesaptan (ya da bir GitHub App üzerinden) gelen bir token.

**İzinler global değil, iş iş kapsanır.** Burada listelediğim her workflow minimal ve yorumlu bir `permissions:` bloğu bildirir:

```yaml
permissions:
  contents: read
  actions: read
  checks: write
  # Sadece check yazmaya izin ver, geri kalan her şey salt okunur
```

Genel bir depoda varsayılan `GITHUB_TOKEN` tarihsel olarak oldukça geniş haklara sahiptir; onu işin gerçekten ihtiyaç duyduğuyla açıkça sınırlamak, zincirdeki üçüncü parti bir aksiyon (`uses: birisi/action@sürüm`) ele geçirilmiş çıkarsa zararı sınırlar.

**En iyi sır var olmayan sırdır.** `typescript-virtual-container`ın OIDC deseni bu fikrin en olgun hali: bir `NPM_TOKEN`ın rotasyonunu, süresini ve sızma riskini yönetmek yerine workflow kriptografik olarak kimliğini (tam olarak bu depo, tam olarak bu workflow) doğrudan üçüncü parti servise kanıtlıyor. Aynı mantık AWS, Docker Hub, PyPI için de mevcut: giderek daha fazla kayıt defteri ve bulut GitHub Actions üzerinden OIDC destekliyor.

---

**3 kilit nokta**

1. Bir git tagi (öksüz, force-pushlanan) minimalist bir veritabanı ya da önceden derlenmiş yapı önbelleği olarak kullanılabilir: aynı mekanizmanın iki farklı kullanımı.
2. Ücretsiz bir GitHub Actions runnerı, dosya sistemini bir git dalına sürekli senkronize etmeyi kabul edersen `inotifywait` ile otomatik kayıt ve tek bir değiştirilen commit ile kalıcı bir SSH kabuğuna dönüşebilir.
3. Varsayılan `GITHUB_TOKEN` bilinçli olarak sınırlıdır: dallar arası PR oluşturmak ya da sırsız yayın yapmak ya adanmış bir PAT ya da OIDC trusted publishing geçişi gerektirir.
