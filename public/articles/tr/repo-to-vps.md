---
title: "Repo to VPS: GitHub Actions'ı ücretsiz kalıcı VPS'ye dönüştürün"
description: Bir GitHub Actions runner'ı git'i kalıcı depolama olarak kullanarak sürekli açık bir VPS'ye dönüştürme -- tmate, inotify ve commit --amend.
date: 2026-05-29
tags:
  - github
  - devops
  - vps
  - actions
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA=="
author_sig: "MEYCIQD1B0xFmLVWntSQqTWMzhb2PV9MoU8wR2/APFpt1CNH3wIhAJkqb32WtfsUYSdhaIQacj5WfnelImt7szgFV+zrFZTL"
---

## GitHub sana 6 saatliğine ücretsiz VPS veriyor. Kalıcı hale getirmenin yolunu buldum.

GitHub Actions sana ücretsiz Linux makineleri veriyor.

Yani, gerçek Ubuntu sunucuları. 2 çekirdek, 7 GB RAM, 14 GB disk. Bedava. Run başına 6 saat.

Tek "sorun": run sonunda her şey siliniyor. Makine tek kullanımlık. Bir şeyler kurarsın, kod yazarsın, ayar çekersin... ve poof, her şey gider. Sanki hiçbir şey yapmamışsın gibi.

Ta ki.

Ta ki **git'i hard disk olarak** kullanana kadar.

Ve işte o an, aniden, run'lar arasında hayatta kalan kalıcı bir diske sahip ücretsiz bir VPS'in olur. Yeniden bağlanırsın, her şey hâlâ oradadır. Kaldığın yerden devam edersin.

Tamamen kırık bu. Anlatayım xD

---

## Arka plan: GitHub Actions runner'ları

Bir GitHub Actions workflow'u başlattığında, GitHub sana bir VM verir.

Kodunu build etmen, testlerini çalıştırman, deploy etmen için yapılmıştır. Workflow çalışır, işini yapar ve makine yok edilir.

Ama bu VM ile başka şeyler yapmanı engelleyen hiçbir şey yok. SSH shell açıp sunucu gibi kullanmak.

Olay şu ki, bu makineler **statesiz** ve **geçici**:
- Geçici: run başına maksimum 6 saat (`timeout-minutes: 360`, GitHub'ın tavanı)
- Statesiz: her şey sonunda silinir

Yani bunu kullanılabilir bir VPS yapmak için iki sorunu çözmek gerek:
1. **Gerçek zamanlı olarak nasıl bağlanılır?**
2. **İki run arasında disk nasıl korunur?**

İşte burada işler hack'e dönüşüyor.

---

## Sorun 1: tmate ile canlı SSH

**tmate**, paylaşılabilir bir SSH oturumu oluşturan bir tmux fork'u.

Bir makinede çalıştırırsın, sana iki link üretir:
- bir SSH URL'si (`ssh xxx@nyc1.tmate.io`)
- bir web URL'si (tarayıcıda terminal)

Bu linklerden biriyle bağlanırsın ve boom, makinede bir shell'desin. Gerçek zamanlı.

Workflow tmate'i şöyle başlatır:

```bash
tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
tmate -S /tmp/tmate.sock set-option -g remain-on-exit on
tmate_ssh=$(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}')
tmate_web=$(tmate -S /tmp/tmate.sock display -p '#{tmate_web}')
```

Ve bu linkler bir Python script'iyle direkt repo README'ine yazılır. Reponu açarsın, bağlantı linkini görürsün, tıklarsın. İşte VPS'indesin.

İlk sorun çözüldü. Ama asıl çılgınlık ikincisi.

---

## Sorun 2: git hard disk olarak

İşte manyaklık burada.

Makine her run'da siliniyor. O yüzden **dosya sistemini `filesystem` adında özel bir git dalında** saklıyoruz.

Başlangıçta, script durumu bu daldan geri yükler:

```bash
filesystem_branch="filesystem"
git fetch origin "$filesystem_branch":refs/remotes/origin/$filesystem_branch
git checkout -B filesystem-workspace "refs/remotes/origin/$filesystem_branch"
git reset --hard "refs/remotes/origin/$filesystem_branch"
```

`filesystem` dalı SENİN hard disk'in. Dosyaların, kurulumların, ayarların -- hepsi onun içinde.

Görüyor musun olayı? Makine tek kullanımlık ama disk git'te yaşıyor. Workflow'u yeniden başlatırsın, disk geri yüklenir, kaldığın yerden aynen devam edersin.

Hibernate modu olan bir VPS gibi. Tek farkı hibernasyonun bir git repo'su olması xD

### İlk başlatma: boş diski oluşturmak

İlk run'da `filesystem` dalı henüz yoktur. Oluşturulması gerekir. Ve bu basit bir işlem değil:

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

`git checkout --orphan` anahtar nokta. Yetim (orphan) dal, **hiçbir geçmişi olmayan** bir daldır -- sanki boş bir repodan başlıyormuşsun gibi.

Neden yetim? Çünkü kalıcı diskinin tüm kaynak kod geçmişini taşımasını İSTEMEZsin. Disk ayrı bir şey, kendi hayatı olan. Tertemiz başlar.

Ve baştaki `git ls-remote --exit-code` sadece temiz bir kontrol: "bu dal remote'da zaten var mı?". Varsa dokunma. Yoksa oluştur. Idempotent, sevdiğimiz gibi.

### Seçici git clean: önbellekleri korumak

Şu satırda durup bakmak lazım:

```bash
git clean -fdx -e .apt-cache -e .cache -e host.conf -e tmate.sock
```

`git clean -fdx`, git tarafından takip edilmeyen HER ŞEYİ siler. Normalde vahşidir -- workspace'i kökünden temizler.

Ama `-e` (exclude) bazı şeyleri korur:
- `.apt-cache` → APT paket önbelleği (buna geri döneceğiz, akıllıca)
- `.cache` → genel önbellek
- `host.conf` → oturumun SSH adresi
- `tmate.sock` → mevcut tmate oturumunun soketi

Bu dosyaları temizlersen, aktif oturumu bozar veya önbelleğini kaybedersin. O yüzden reset sırasında onları atlıyoruz.

İlk bakışta aptal bir detay, ama bunlar olmadan her şey patlar.

---

## Otomatik kaydetme: her şeyi izleyen inotify

Peki dosyalar `filesystem` dalına nasıl gidiyor?

Cevap: TÜM dosya değişikliklerini izleyen ve otomatik olarak commit/push yapan bir watcher.

Sihirli araç **inotifywait** (`inotify-tools` paketinden). Kernel seviyesinde dosya sistemini izler ve bir dosya değiştiğinde tetiklenir.

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock|\.gitignore|\.txt\.swp)(/|$)' .; do
    echo "[autosave] change detected"
    commit_and_push
    sleep 1
  done
}

autosave &
```

inotify flag'lerini inceleyelim, çünkü her biri önemli:
- `-r` → recursive, tüm alt klasörleri izler
- `-e modify,create,delete,move` → bu 4 olay türüne tepki verir (değişiklik, oluşturma, silme, taşıma)
- `--exclude '...'` → bazı dosyaları yok saymak için bir regex

`--exclude` hayati önemde. Neleri yok saydığına bak:
- `.git` → tabii ki, yoksa her commit bir autosave tetikler, o da bir commit tetikler... sonsuz döngü. Felaket.
- `.apt-cache` ve `.cache` → sürekli değişen ve git'i spamlamak istemediğimiz önbellekler
- `host.conf` ve `tmate.sock` → durmadan değişen oturum dosyaları
- `.gitignore`, `.txt.swp` → geçici dosyalar (`.swp` vim düzenleme dosyaları)

Bu exclude olmadan, autosave kendi değişiklikleriyle döngüye girerdi. Listedeki `.git`, ayağına sıkmaktan seni koruyan SATIR.

Bir dosyayı değiştirirsin? inotify anında algılar, commit atar, push yapar. Bir saniyeden kısa sürede, değişikliğin `filesystem` dalında.

Bir şey kurarsın, kod yazarsın, ayar değiştirirsin -- her şey gerçek zamanlı, otomatik, sen hiçbir şey yapmadan kaydedilir.

Gerçek anlamda tüm diskin otomatik yedekleme sistemine sahipsin. Kırık.

### Debounce: git'i spamlamamak

Her kayıttan sonraki `sleep 1` bir **debounce**.

Bir editörde dosya kaydettiğinde, genelde peş peşe birden fazla dosya sistemi olayı oluşur (geçici dosya oluşturma, rename, eskisini silme...). Debounce olmadan, tek bir kayıt için 3-4 commit tetiklenirdi.

`sleep 1` şunu der: "bir kayıttan sonra bir saniye bekle, patlama dinsin, sonra tekrar dinlemeye başla". Yakın zamandaki değişiklikleri tek bir commit'te toplar. Akıllıca.

### Bir de periyodik yedekleme

Her ihtimale karşı, inotify bir şey kaçırırsa diye her 5 saniyede bir de kayıt var:

```bash
periodic_save() {
  while true; do
    sync_from_remote
    sleep 5
    commit_and_push
  done
}

periodic_save &
```

Kuşak gibi askı gibi. Disk durumunu kaybetmek istemiyoruz hiç.

---

## Akıllı detay: tek commit

Her dosya değişikliğinde commit atarsan... binlerce commit birikir. Bir saatlik oturumda git geçmişin patlar. Repo kocaman olur. İğrenç.

Çözüm zarif: **yeni commit oluşturmak yerine varolanı değiştiriyoruz (amend).**

```bash
commit_and_push() {
  (
    flock -n 200 || return

    git add -A
    git reset -- .github/workflows/ .github/scripts/

    if ! git diff --cached --quiet; then
      if git rev-parse --verify HEAD >/dev/null 2>&1; then
        git commit --amend --no-edit
      else
        git commit -m "autosave $(date -u +%Y%m%dT%H%M%SZ)"
      fi
      git push --force origin "filesystem-workspace:filesystem"
    fi
  ) 200>/tmp/tmate_autosave.lock
}
```

`git commit --amend` şu anlama gelir: "son commit'i bununla değiştir."

Böylece `filesystem` dalında HER ZAMAN tek bir commit olur. Ne kadar kaydedersen kaydet. Sadece mevcut durumun bir anlık görüntüsü, defalarca force-push edilmiş.

`flock` bir kilit: iki kaydetme döngüsü olduğu için (inotify + periyodik), ikisinin aynı anda git'i çalıştırıp birbirine girmesini engellemek gerek. Aynı anda tek bir git işlemi.

Temiz.

---

## sync_from_remote: birden çok oturumu yönetmek

İlk başta aklına gelmeyen bir şey: ya aynı anda İKİ run başlatırsan? Ya da bir oturum `filesystem` dalını değiştirirken başka bir oturum çalışıyorsa?

Script bunu her commit'ten önce `sync_from_remote` ile halleder:

```bash
sync_from_remote() {
  git fetch origin "filesystem":refs/remotes/origin/filesystem
  git merge --ff-only "refs/remotes/origin/filesystem"
}
```

`--ff-only` (sadece fast-forward) önemli: "SADECE düzgün bir şekilde ilerletebiliyorsak merge yap, merge commit'i oluşturmadan" anlamına gelir.

İki dal birbirinden ayrılmışsa (mesela iki oturum farklı şeyleri değiştirmişse), fast-forward sessizce başarısız olur (`2>/dev/null || true`) ve yerel durum korunur. Mükemmel bir merge sistemi değil, ama tek bir oturumun çalıştığı basit durumda bozulmaları önler.

Açıkçası, aynı repo'da 3 paralel oturum başlatmamalısın. Ama kod yine de patlamamaya çalışıyor. Savunma amaçlı.

---

## APT önbelleği: hızlı kurulum

Workflow'da göze çarpmayan ama iyi düşünülmüş bir detay var:

```yaml
- name: Cache & install APT packages (tmate + watcher)
  uses: awalsh128/cache-apt-pkgs-action@v1.6.0
  with:
    packages: tmate inotify-tools
```

tmate ve inotify-tools, **APT paketlerini önbelleğe alan** bir action ile kuruluyor.

İlk run'da indirir ve kurar. Sonraki run'larda GitHub Actions önbelleğinden geri yüklenir -- daha hızlı, yeniden indirmeye gerek kalmaz.

Az önceki `git clean -fdx -e .apt-cache`'i hatırladın mı? İşte bağlantılı. `.apt-cache` klasörü, oturum sırasında kurduğun paketlerin bir şekilde kalıcı olabilmesi için temizlikten korunuyor.

Her şey birbirini tutuyor.

---

## /tmp'ye gizlenen script'ler

Sinsi ama akıllıca bir detay daha. Script'in en başında:

```bash
RUNNER_SCRIPTS_DIR="/tmp/runner-scripts"
rm -rf "$RUNNER_SCRIPTS_DIR"
mkdir -p "$RUNNER_SCRIPTS_DIR"
cp -r .github/scripts "$RUNNER_SCRIPTS_DIR/"
```

Script'ler (`update_readme.py` vb.) `filesystem` dalına dokunmadan ÖNCE `/tmp`'ye kopyalanır.

Neden? Çünkü `git reset --hard` ile `filesystem` dalına geçtiğinde (başlangıçta boş veya diskin neyse o), kaynak repodaki `.github/scripts` dosyaları workspace'ten kaybolur.

Ama README'i güncellemek için hâlâ gereklidir. O yüzden `/tmp`'ye saklar:

```bash
python3 "$RUNNER_SCRIPTS_DIR/scripts/update_readme.py" --ssh "$tmate_ssh" ...
```

Düşünmezsen script'in kaybolur. Ben düşündüm.

---

## Özel yapım shell

Son bir konfor: oturum sana çıplak bir bash değil, yapılandırılmış bir shell veriyor.

`prestart.sh` özel bir `.bashrc` kopyalar:

```bash
if ! grep -q "Custom prompt and aliases for remote sessions" "$HOME/.bashrc"; then
  cp .github/scripts/remote_bashrc "$HOME/.bashrc"
fi
sudo cp "$HOME/.bashrc" /root/.bashrc
```

Ve bu `.bashrc` renkli bir prompt, alias'lar (`ll`, `lla`, `rm -i`) ve işte akıllı bir şey içerir: `exit` override'ı:

```bash
exit() {
    killall -9 -u "$(whoami)" tmate 2>/dev/null || true
    builtin exit "$@"
}

bind -x '"\C-d": "exit"'
```

`exit` (veya Ctrl+D) yazdığında, kapatmadan önce tmate process'lerini temizce öldürür. Böylece makinede zombi tmate oturumları kalmaz.

Bir de `tmate-detach` fonksiyonu var, oturumu öldürmeden bağlantıyı kesmek istersen diye (sonra tekrar bağlanmak için). Küçük bir konfor detayı, ama özen seviyesini gösteriyor.

---

## Kendi kendine yeniden başlayan tmate

Küçük bir konfor: shell'de `exit` yazdığında, normalde tmate oturumu ölür ve bir daha bağlanamazsın.

Ama burada tmate bir `while true` döngüsü içinde:

```bash
while true; do
  tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
  while tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}' >/dev/null 2>&1; do
    sleep 2
  done

  echo "tmate session ended; restarting..."
done
```

`exit` yaparsın? Oturum kendi kendine yeniden başlar. Aynı linkle tekrar bağlanabilirsin. Düşüşten sonra bile istikrarlı bağlantı.

Aptalca ama kullanışlı hale getiriyor.

---

## Tek komutla yeniden bağlanma

Düşüşten sonra, her seferinde run log'larını karıştırmadan nasıl yeniden bağlanırsın?

tmate'in SSH adresi `host.conf` dosyasına yazılır ve `filesystem` dalında commit'lenir:

```bash
printf '%s' "${tmate_ssh#ssh }" > host.conf
```

Ve bu dosya git'te olduğu için, GitHub API'si ile tek bir komutla alabilirsin:

```bash
ssh "$(gh api -H 'Accept: application/vnd.github.v3.raw' \
  "/repos/USER/REPO/contents/host.conf?ref=filesystem" | tr -d '\r\n')"
```

Bunu çalıştırırsın, repo'daki güncel SSH adresini alır ve direkt bağlanır. İki oturum arasında adres değişmiş olsa bile.

Tamam.

---

## Tam akış

Özetleyelim:

```
1. Workflow'u tetiklersin (push veya manuel buton)
2. GitHub sana bir Ubuntu VM verir
3. Script diski "filesystem" dalından geri yükler
4. inotify tüm değişiklikleri izlemeye başlar
5. periodic_save her 5 saniyede bir yedek commit atar
6. tmate başlar → SSH/web linklerini oluşturur
7. Linkler README + host.conf'a yazılır
8. ssh veya web terminali ile bağlanırsın
9. Ne istersen yaparsın (kod yaz, kur, debug et...)
   └── her dosya değişikliği = git'e anlık otomatik kayıt
10. 6 saat sonra GitHub VM'i öldürür
11. Ama diskin "filesystem" dalında sapasağlamdır
12. Workflow'u yeniden başlatırsın → 3. adıma dön, her şey hâlâ orada
```

Bir VPS. Ücretsiz. Kalıcı diskli. Sadece git ve GitHub Actions ile.

---

## Tamam, dürüst olalım: sınırlamalar

Bu bir hack, gerçek VPS değil. Yani:

- **Run başına maksimum 6 saat.** Workflow'u düzenli olarak yeniden başlatman gerekir. Sonsuz uptime yok.
- **Prod için değil.** Siteni burada barındırmayacaksın. Keşfetmek, geliştirmek, debug yapmak, tek kullanımlık ama kurtarılabilir bir Linux'ta bir şey test etmek için.
- **GitHub her şeyi görür.** Onların makineleri. Hassas bir şey koyma.
- **Repoyu gizli tut.** Bir SSH shell'i açıyorsun. Herkese açık repo = potansiyel olarak herkes bağlanabilir. Kötü fikir.
- **Kullanım koşullarının sınırında.** GitHub Actions CI/CD için yapılmıştır, ücretsiz VPS için değil. Ölçülü, meşru, suistimal etmeden kullan.

### Gerçek zayıf nokta: git büyük dosyalardan nefret eder

Daha teknik bir sınırlama var ve anlaşılması en önemlisi.

**Git metin için yapılmıştır, dosya sistemi için değil.**

Kalıcı disk bir git dalında yaşar. Yani kaydettiğin her şey git'ten geçer. Ve git:
- büyük binary dosyaları kötü yönetir (2 GB'lık bir Docker imajı git'te? unut gitsin)
- GitHub'da dosya başına 100 MB sınırı vardır (hard limit, üstü push olmaz)
- repo başına ~5 GB'ın altında kalmanı önerir

Yani 500 MB `node_modules`'lu bir projede `npm install` yaparsan veya ağır binary'ler çıkaran bir şey build edersen, `filesystem`'e push ya deli gibi yavaşlar ya da tamamen başarısız olur.

`git commit --amend` yardımcı olur (tek commit, şişen geçmiş yok), ama 200 MB'lık bir dosyanın asla geçmeyeceği gerçeğini değiştirmez.

Kısacası: **kod, ayar dosyaları, küçük dosyalar için harika çalışır. Büyük verileri veya binary artifaktları depolamak için çalışmaz.** Oturumunda ne yaptığını buna göre ayarlamalısın.

### Tam sistem anlık görüntüsü değil

Bir diğer önemli nüans: `filesystem` dalı **workspace'i** (repo klasörünü) kaydeder, tüm sistemi değil.

`apt install htop` yaparsan, binary `/usr/bin/htop`'a gider, ki bu workspace DIŞINDADIR. Yani kaydedilmez. Sonraki run'da yeniden kurman gerekir.

İşte bu yüzden APT önbelleği ve `prestart.sh` var: her başlangıçta sistem ortamını yeniden hazırlamak için, çünkü sadece workspace kalıcı.

Kurulumlarının hayatta kalmasını istiyorsan, onları workspace'in içine koymalısın (mesela sistem yerine yerel bir klasöre kurmak). Alışman gereken bir jimnastik.

---

## Ücretsiz VPS vs gerçek VPS: karşılaştırma

| | repo-to-vps | Gerçek VPS (5€/ay) |
|---|---|---|
| **Fiyat** | 0€ | ~5-10€/ay |
| **Çalışma süresi** | 6 saat, yeniden başlatmak gerek | 7/24 |
| **Disk** | git dalı, küçük dosyalar | gerçek SSD, birkaç GB |
| **RAM** | ~7 GB (cömert!) | genelde 1-2 GB |
| **CPU** | 2-4 iyi çekirdek | 1-2 vCPU |
| **Kurulum** | template'i clone'la | manuel yapılandırma |
| **Kalıcılık** | sadece workspace | tam sistem |
| **Meşruiyet** | kullanım koşullarının sınırında | %100 clean |

Komik olan şu ki ham özelliklerde (RAM, CPU) GitHub runner genelde 5€'luk bir VPS'ten DAHA İYİ. Ama 6 saatlik çalışma süresi ve workspace ile sınırlı kalıcılık, bunu gerçek bir sunucu değil, bir hacker oyuncağı yapıyor.

Öğrenmek, test etmek, kurtarılabilir bir ortamda hızlıca bir Linux şeyini debug etmek için? Mükemmel. Ciddi bir şey barındırmak için? Gerçek bir VPS al.

Ama dilediğin gibi geri yükleyebileceğin geçici bir Linux ortamı için? Harika.

---

## Tüm bunların ardındaki desen

Geriye çekilip bakarsan, repo-to-vps ve email bot'u (diğer yazım) aynı fikre dayanıyor:

> **Git sadece bir versiyon yöneticisi değil. API'si ile erişilebilen, ücretsiz, versiyonlu, kalıcı bir depolama sistemidir.**

Statesiz bir sistemin (GitHub Actions, bir Worker, serverless fonksiyon) olduğunda ve iki çalıştırma arasında bir durum tutmak istediğinde, git "disk" görevi görebilir.

- Email bot'u bir `lastId`'yi bir git tag'inde saklar.
- repo-to-vps bütün bir dosya sistemini bir git dalında saklar.

Aynı desen, iki farklı ölçek. Bir tarafta bir değer, diğer tarafta bir disk.

Ve `git commit --amend` + force-push ortak teknik: **her güncellemede üzerine yazılan, mevcut durumu temsil eden tek bir commit tutuyorsun.**

Bunun için yapılmadı. Ama çalışıyor. Ve ücretsiz.

---

**Unutulmaması gereken 3 şey:**

1. **Bir git dalı = kalıcı bir hard disk** -- Dosya sistemini özel bir dalda sakla, başlangıçta geri yükle, tek kullanımlık makinelerde hayatta kalan bir durumun olsun.

2. **inotify + git = gerçek zamanlı otomatik kayıt** -- `inotifywait` kernel seviyesinde değişiklikleri izler ve anında git'e push eder. `git commit --amend` ile temiz bir tek commit korunur.

3. **tmate runner'ı VPS'e dönüştürür** -- GitHub Actions makinesinde canlı SSH, otomatik yeniden başlatma ve GitHub API'si ile tek komutta yeniden bağlanma.

Git hard disk olarak, ikinci bölüm. Sanırım sonunda her şeyi git dallarında saklayacağım xD
