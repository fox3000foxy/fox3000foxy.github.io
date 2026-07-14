---
title: "GitHub Actions'ı dahice kullanmanın 5 yolu (ve secret'lar hakkında öğrettikleri)"
description: "CI runner'ı bedava VPS'e dönüştürmek, kendi PR'larını açan bot, sıfır secret'la npm publish. \"lint + test + deploy\"un ötesine geçen GitHub Actions desenlerini kataloglamak için repolarımda bir tur."
date: 2026-07-14
tags:
  - github-actions
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "T/lvLxs0tKi4u8fJzLLIpEKvU8b7Bc+doXcvoupg+IJddRHp3fcrhc/LfkSkg9KFPiqhzq3hpX20YzljaFtn6g=="
---

# GitHub Actions'ı dahice kullanmanın 5 yolu

Kâğıt üstünde, GitHub Actions klasik CI/CD için yapılmıştır: push edersin, lint'ler, test eder, deploy eder. Özel bir durum hakkında zaten yazdım -- git tag'leri bir email botu için veritabanı olarak kullanmak (özel makaleye bakın). Ama kendi repolarımı kazıyınca, tek bir projeye odaklanmaktan çok bir teknik kataloğu gibi ayrı bir makaleyi hak edecek kadar farklı desen var.

Beş şey, en klasikten en çarpık olana.

## 1. Git tag'i, iki çalıştırma arasında kalıcı durum olarak kullanmak

Hızlı özet, tam detaylar `email-autoreply` makalesinde. GitHub Actions doğası gereği durumsuzdur -- her çalıştırma boş bir makineden başlar. Çözüm: bir değeri (ID, zaman damgası, herhangi küçük bir durumu) özel bir git tag'inde saklamak, asla bir branch'te değil.

```bash
# durumu oku
git show refs/tags/lastid:data/lastId > data/lastId

# durumu yaz (öksüz branch, tek commit, tag'i force-push et)
git switch --orphan lastid-tmp
git commit -m "lastId snapshot"
git tag -f lastid
git push --force origin lastid
```

Kilit nokta: tarihçe birikmesin diye öksüz branch, ve repo'nun branch listesini kirletmemek için branch yerine zorlanmış tag.

## 2. Git tag'i önceden derlenmiş derleme önbelleği olarak kullanmak

Aynı fikir ailesi, farklı kullanım: uygulama durumu yerine bir **derleme artefaktı** saklamak. `build` işi kodu bir kez derler (`master`'a push'ta), sonra `dist/` + `node_modules/`'ü bir `runtime` tag'ine push'lar. `cron` işi her seferinde `bun install && bun run build` çalıştırmak yerine doğrudan bu tag'i checkout eder:

```yaml
- name: Checkout runtime snapshot
  uses: actions/checkout@v4
  with:
    ref: refs/tags/runtime
    fetch-depth: 1
# install yok, build yok -- kod hazır
- run: node dist/index.js --action
```

Bu, çalıştırma süresini ~20 saniyeden ~10 saniyeye düşürür. Sık çalışan bir cron'da bunun önemi var. `actions/cache` benzer bir iş yapar (bağımlılıkları önbelleğe alır), ama bir git tag'i, sürümlenmiş bir artefaktı tamamen dondurup açıkça işaret etmek istediğinizde daha doğrudandır -- sadece `npm install`'ı hızlandırmak değil.

## 3. Birden çok işi birleştiren tek bir zorunlu kontrol

Ufak, önemsiz görünen ama branch koruma yapılandırmasında her şeyi değiştiren bir desen. `konosuba-rpg`'de, CI'nin paralel çalışan üç bağımsız işi var (`typecheck`, `lint`, `tests`) -- ve dördüncü bir iş, `test-battery`, ilk üçüne bağımlı olmaktan başka hiçbir şey yapmaz:

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

Bu cephe iş olmadan, korumalı bir branch yapılandırmak üç ayrı zorunlu kontrolü işaretlemeyi -- ve her iş eklendiğinde ya da yeniden adlandırıldığında bu listeyi güncellemeyi gerektirirdi. `test-battery` ile, repo ayarlarında işaretlenecek tek bir isim, iç detaylar değişse bile sabit kalır.

## 4. Bedava bir runner'ı geçici bir VPS'e dönüştürmek

Bu, hepsinin en çarpığı ve açık ara favorim: `repo-to-vps`, bir GitHub Actions runner'ının amaçlanan kullanımını tamamen gasp ederek onu SSH ile erişilebilen bir Linux makinesine dönüştürür. Bedava. 6 saate kadar (bir işin maksimum süresi).

Prensip: tmate'i başlatmaktan başka neredeyse hiçbir şey yapmayan bir iş:

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

Asıl baş belası, GitHub Actions runner'ının dosya sisteminin **kullan-at** olmasıdır -- iş biter bitmez her şey kaybolur. Saatlerce süren bir SSH oturumu, yaptığınız her şey bir sonraki çalıştırmada buharlaşıyorsa işe yaramaz. Çözüm: dosya sisteminin canlı bir anlık görüntüsü olarak hizmet veren, sürekli senkronize edilen bir git branch'i.

`start-tmate.sh` betiği, sırayla şunları yapar:

1. İş başlangıcında özel bir `filesystem` branch'inden dosya sistemini **geri yükler** (`git reset --hard`).
2. `inotifywait` ile dosya değişikliklerini sürekli **izler** ve bir dosya hareket ettiğinde **hemen commit + push** yapar:

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock)(/|$)' .; do
    commit_and_push
    sleep 1
  done
}
```

3. Her kayıt yeni bir commit oluşturmak yerine öncekini **değiştirir** (`git commit --amend --no-edit`), böylece `filesystem` branch'i her zaman tek bir commit'te kalır -- binlerce anlık görüntü birikimi olmaz.
4. Bir `while true` döngüsü, oturum ölürse tmate'i otomatik olarak yeniden başlatır, `remain-on-exit on` ile terminal `exit` sonrasında bile erişilebilir kalır.
5. tmate tarafından üretilen SSH URL'si bir `host.conf` dosyasına yazılır, `filesystem` branch'ine commit'lenir -- işin log'larına canlı erişim olmadan GitHub API (`gh api .../contents/host.conf`) üzerinden alınabilir.
6. Bir `periodic_save` rutini, `inotifywait` bir olayı kaçırırsa diye her 5 saniyede bir arka planda çalışır.

Sonuç: her yerden erişilebilen tam bir Linux kabuğu, oturumlar arasında kalıcı bir dosya sistemiyle -- oysa alttaki altyapı (bir GitHub Actions runner'ı) kesinlikle bunun için tasarlanmamıştı. Tek gerçek sınır, iş başına 6 saatlik zaman aşımı -- sonrasında iş akışını yeniden başlatmak gerekir.

## 5. Kendi PR'larını açan bir bot

`konosuba-rpg`'de, `dev` branch'ine yapılan bir push, `main`'e açık bir PR olup olmadığını kontrol eden bir işi tetikler -- yoksa `actions/github-script` ve GitHub REST API ile otomatik olarak oluşturur:

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

Burada önemli olan detay, kullanılan token'dır. Bu iş akışı otomatik `GITHUB_TOKEN`'ı **kullanmaz** -- ayrı bir `AUTO_PR_TOKEN` secret'ı gerektirir ve yoksa devam etmeyi reddeder:

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

## 6. Sıfır secret ile npm'e yayınlamak

Beşlinin en sessizi, ama muhtemelen gelecek için en önemlisi: `typescript-virtual-container`'ın `publish.yml` iş akışı **hiçbir npm secret'ı içermez**. `NPM_TOKEN` yok, `NODE_AUTH_TOKEN` yok. Sadece bu:

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

`npm publish` yine de çalışır, çünkü npm kayıt defteri artık OIDC üzerinden **trusted publishing**'i destekliyor: iş akışı kimliğini doğrudan kayıt defterine kanıtlar (tam repo + tam iş akışı, npmjs.org tarafında yapılandırılmış), hiçbir statik token hiçbir yerde iletilmez veya saklanmaz. Sızacak sıfır secret, her altı ayda bir döndürülecek sıfır token.

---

## GitHub secret'ları, derinlemesine

Bu beş desenin hepsi, şu ya da bu şekilde, secret meselesine dokunuyor. İş akışlarımın her yerinde tekrar eden birkaç ilke:

**Bir secret mutlaka basit bir string değildir.** `email-autoreply`'de, `ACCOUNTS_JSON` çok hesaplı yapılandırmanın tüm minimize edilmiş JSON'unu içerir -- sadece bir API anahtarı değil, tam bir veri yapısı, çalışma zamanında olduğu gibi bir dosyaya enjekte edilir:

```yaml
env:
  ACCOUNTS_JSON: ${{ secrets.ACCOUNTS_JSON }}
run: printf "%s" "$ACCOUNTS_JSON" > data/accounts.json
```

Bu, şifrelenmiş bile olsa bir yapılandırma dosyasını commit etmek zorunda kalmayı önler ve koda dokunmadan repo ayarlarında tek tıklamayla güncellenebilir.

**`GITHUB_TOKEN`'ın kesin sınırları vardır ve bu kasıtlıdır.** GitHub'ın her çalıştırmaya enjekte ettiği otomatik token güçlüdür, ancak belirli noktalarda mühürlenmiştir: varsayılan olarak başka bir iş akışını tetikleyemez ve repo yapılandırmasına bağlı olarak branch koruma kuralları tarafından engellenebilir. `create-pull-request.yml`'in ayrı bir PAT (`AUTO_PR_TOKEN`) gerektirmesinin nedeni tam olarak budur -- gerçek bir hesaptan (veya bir GitHub App'ten) token, açık `contents:write` + `pull-requests:write` haklarıyla, işin geçici token'ından ayrı.

**İzinler global değil, iş bazında kapsamlandırılır.** Burada listelediğim her iş akışı, minimal ve yorumlanmış bir `permissions:` bloğu bildirir:

```yaml
permissions:
  contents: read
  actions: read
  checks: write
```

Varsayılan `GITHUB_TOKEN` tarihsel olarak halka açık bir repo'da oldukça geniş haklara sahiptir; onu işin gerçekten ihtiyaç duyduğuyla açıkça sınırlamak, zincirdeki bir üçüncü taraf action'ının ele geçirildiği ortaya çıkarsa hasarı sınırlar.

**En iyi secret, var olmayan secret'tır.** `typescript-virtual-container`'ın OIDC deseni, bu fikrin en tamamlanmış versiyonudur: bir `NPM_TOKEN`'ın döndürülmesini, süresinin dolmasını ve sızma riskini yönetmek yerine, iş akışı kriptografik olarak kimliğini (bu tam repo, bu tam iş akışı) doğrudan üçüncü taraf hizmete kanıtlar. Aynı mantık AWS, Docker Hub, PyPI için de mevcut -- giderek daha fazla kayıt defteri ve bulut, GitHub Actions'tan OIDC'yi destekliyor.

---

**3 kilit nokta**

1. Bir git tag'i (öksüz, force-push edilmiş), minimalist bir veritabanı veya önceden derlenmiş derleme önbelleği olarak hizmet verebilir -- aynı mekanizmanın iki farklı kullanımı.
2. Bedava bir GitHub Actions runner'ı, dosya sistemini `inotifywait` ile otomatik kaydedip tek bir değiştirilmiş commit ile bir git branch'ine sürekli senkronize etmeyi kabul ederseniz, kalıcı bir SSH kabuğu haline gelebilir.
3. Varsayılan `GITHUB_TOKEN` kasıtlı olarak sınırlıdır -- branch'ler arası PR'lar oluşturmak veya secret'sız yayınlamak ya özel bir PAT ya da OIDC trusted publishing'e geçiş gerektirir.
