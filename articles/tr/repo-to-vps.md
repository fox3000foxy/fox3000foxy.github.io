---
title: "Repo to VPS: kalıcı depolamayla GitHub Actions'ı ücretsiz VPS'e dönüştürmek"
description: GitHub Actions koşucusunu git kalıcı depolamayla kalıcı VPS'e dönüştürmek, tmate, inotify ve commit --amend.
date: 2026-05-29
tags:
  - github
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "yqiwKdIMrYXggNWG+56LTbzXHkreYNYxhfoxUaDeL09ZTqjfSh+oZZcEzUROw65sLRRyBaZjzIWOYR98w2KU+g=="
---

## GitHub sana 6 saatliğine ücretsiz bir VPS veriyor. Onu kalıcı yapmanın yolunu buldum.

GitHub Actions sana ücretsiz Linux makineleri veriyor.

Yani gerçek Ubuntu sunucuları. 2 çekirdek, 7 GB RAM, 14 GB disk. Bedava. Run başına 6 saatliğine.

Tek "sorun": run sonunda her şey silinir. Makine atılabilirdir. Paket kurarsın, kod yazarsın, yapılandırırsın... ve puf, sonda her şey kaybolur. Sanki hiçbir şey yapmamışsın gibi.

Şöyle olmasa.

**Giti sabit disk olarak** kullansan şöyle olmasa.

Ve bir anda runlar arasında hayatta kalan kalıcı diskli ücretsiz bir VPSin olur. Yeniden bağlanırsın, her şey hâlâ oradadır. Kaldığın yerden devam edersin.

Bu tamamen kırık. Açıklayayım.

---

## Bağlam: GitHub Actions koşucuları

Bir GitHub Actions workflowu çalıştırdığında GitHub sana bir VM verir.

Kodunu derlemek, testlerini çalıştırmak, dağıtmak için yapılmış. Workflow döner, işini yapar ve makine yok edilir.

Ama bu VM ile başka bir şey yapmana hiçbir şey engel değil. Mesela üzerinde bir SSH kabuğu açıp sunucu olarak kullanmak gibi.

Kısıt şu ki bu makineler **stateless** ve **geçicidir**:
- Geçici: run başına 6 saat maksimum (`timeout-minutes: 360`, GitHub tavanı)
- Stateless: sonda her şey silinir

O yüzden kullanılabilir bir VPS yapmak için iki sorunu çözmek gerekir:
1. **Üzerine gerçek zamanlı nasıl bağlanılır?**
2. **Disk iki run arasında nasıl tutulur?**

Burası pis bir hacke dönüşüyor.

---

## Sorun 1: tmate ile canlı SSH

**tmate**, paylaşılabilir bir SSH oturumu oluşturan bir tmux çatalıdır.

Bir makinede çalıştırırsın, sana iki bağlantı üretir:
- bir SSH URLsi (`ssh xxx@nyc1.tmate.io`)
- bir web URLsi (tarayıcıda terminal)

Bu bağlantılardan biriyle bağlanırsın ve bum, makinede bir kabuktesin. Gerçek zamanlı.

Workflow o yüzden tmate çalıştırır:

```bash
tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
tmate -S /tmp/tmate.sock set-option -g remain-on-exit on

# bağlantıları al
tmate_ssh=$(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}')
tmate_web=$(tmate -S /tmp/tmate.sock display -p '#{tmate_web}')
```

Ve bu bağlantılar bir Python scriptiyle doğrudan deponun READMEsi içine yazılır. Deponu açarsın, bağlantıyı görürsün, tıklarsın. İşte VPSindesin.

İlk sorun çözüldü. Ama gerçekten çılgın olan ikincisi.

---

## Sorun 2: sabit disk olarak git

Her şeyi değiştiren fikir işte bu.

Makine her run silinir. O yüzden dosya sistemini `filesystem` adlı adanmış bir git dalında saklıyoruz.

Başlangıçta script durumu bu daldan geri yükler:

```bash
filesystem_branch="filesystem"

# filesystem dalını remotedan al
git fetch origin "$filesystem_branch":refs/remotes/origin/$filesystem_branch

# çalışma alanını bu daldan geri yükle
git checkout -B filesystem-workspace "refs/remotes/origin/$filesystem_branch"
git reset --hard "refs/remotes/origin/$filesystem_branch"
```

`filesystem` dalı senin sabit diskinDİR. Dosyaların, kurulumların, yapılandırmaların, hepsi içindedir.

Fikri görüyor musun? Makine atılabilir ama disk gitte yaşar. Workflowu yeniden çalıştırırsın, disk geri yüklenir, tam kaldığın yerden devam edersin.

Hibernate olan bir VPS gibi. Tek fark hibernasyonun bir git deposu olması.

### İlk çalıştırma: boş diski oluşturmak

En ilk run `filesystem` dalı henüz yoktur. Oluşturmak gerekir. Ve bu önemsiz değildir:

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

`git checkout --orphan` kilit noktadır. Öksüz bir dal **hiç tarihçesi olmayan** bir daldır: sanki boş bir depodan başlıyormuşsun gibi.

Neden öksüz? Çünkü kalıcı diskinin kaynak kodunun tüm tarihçesini sürüklemesini istemezsin. Disk izole kalır, kendi hayatıyla. Tertemiz başlar.

Baştaki `git ls-remote --exit-code` sadece temiz bir kontroldür: "dal remoteda zaten var mı?". Varsa hiçbir şeye dokunmayız. Yoksa oluştururuz. Sevdiğimiz gibi idempotent.

### Seçici git clean: önbellekleri korumak

Bu satır üzerinde durmayı hak ediyor:

```bash
git clean -fdx -e .apt-cache -e .cache -e host.conf -e tmate.sock
```

`git clean -fdx` git tarafından izlenmeyen HER şeyi siler. Normalde serttir: çalışma alanını kökten temizler.

Ama `-e` (hariç tut) bazı dosyaları korur:
- `.apt-cache` → APT paket önbelleği (buna döneceğiz, kurnazca)
- `.cache` → genel önbellek
- `host.conf` → oturumun SSH adresi
- `tmate.sock` → devam eden tmate oturumunun soketi

Şu dosyaları temizleseydin aktif oturumu bozar ya da önbelleğini kaybederdin. O yüzden sıfırlama sırasında es geçilirler.

İlk bakışta aptalca bir detay ama o olmadan her şey patlar.

---

## Otomatik kayıt: her şeyi izleyen inotify

Peki dosyalar `filesystem` dalına nasıl girer?

Yanıt: TÜM dosya değişikliklerini izleyip otomatik commit/push yapan bir izleyici.

Sihirli araç **inotifywait** (`inotify-tools` paketinden). Dosya sistemini çekirdek seviyesinde izler ve bir dosya değişir değişmez tetiklenir.

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock|\.gitignore|\.txt\.swp)(/|$)' .; do
    echo "[autosave] change detected"
    commit_and_push
    sleep 1   # bir anda çok değişiklik olursa debounce
  done
}

autosave &
```

inotify bayraklarını tek tek açalım çünkü her biri önemli:
- `-r` → özyinelemeli, tüm alt klasörleri izler
- `-e modify,create,delete,move` → bu 4 olay türüne tepki verir
- `--exclude '...'` → bazı dosyaları yoksaymak için bir regex

`--exclude` kritiktir. Neleri yoksaydığına bak:
- `.git` → tabii ki, yoksa her commit bir autosave tetikler, o da bir commit tetikler... sonsuz döngü. Felaket.
- `.apt-cache` ve `.cache` → her zaman değişen ve gite spamlemek istemediğimiz önbellekler
- `host.conf` ve `tmate.sock` → durmadan oynayan oturum dosyaları
- `.gitignore`, `.txt.swp` → geçici dosyalar (`.swp` vim düzenleme dosyalarıdır)

Bu hariç tutma olmadan kendi değişikliklerinde döngüde tetiklenen bir autosave ile kalırdın. Listedeki `.git`, ayağına sıkmanı engelleyen satırdır.

Bir dosyayı mı değiştirdin? inotify anında tespit eder, commitler, pushlar. Bir saniyeden kısa sürede değişikliğin `filesystem` dalındadır.

Bir paket mi kuruyorsun, kod mu yazıyorsun, yapılandırmaya mı dokunuyorsun: her şey gerçek zamanlı, otomatik, hiçbir şey yapmana gerek kalmadan kaydedilir.

Kelimenin tam anlamıyla tüm diskin otomatik yedekleme sistemine sahipsin. Kırık.

### Debounce: giti spamlememek

Her kayıttan sonraki `sleep 1` bir **debounce**tur.

Bir editörde bir dosyayı kaydettiğinde genelde dosya sistemi olayları patlaması üretir (geçici dosya oluşturma, yeniden adlandırma, eskinin silinmesi...). Debounce olmadan tek bir kayıt için 3-4 commit tetiklerdin.

`sleep 1` şunu der: "bir kayıttan sonra bir saniye bekle, patlama yatışsın, yeniden dinlemeden önce". Yakın değişiklikleri tek committe gruplar. Kurnazca.

### Üstüne periyodik bir kayıt daha

inotify bir olayı kaçırır diye bir de 5 saniyede bir kayıt var:

```bash
periodic_save() {
  while true; do
    sync_from_remote   # olası uzak değişiklikleri alır
    sleep 5
    commit_and_push
  done
}

periodic_save &
```

Hem kemer HEM askı. Diskin durumunu kaybetmek hiç istemeyiz.

---

## Kurnaz detay: tek bir commit

Her dosya değişikliğinde commitlersen binlerce commit biriktirirsin. Bir saatlik oturumda git tarihçen patlar. Depo devasa olur. İğrençtir.

Çözüm zariftir: yeni bir tane oluşturmak yerine mevcut commiti **değiştiriyoruz**.

```bash
commit_and_push() {
  (
    flock -n 200 || return   # iki kaydın aynı anda dönmemesi için kilit

    git add -A
    git reset -- .github/workflows/ .github/scripts/   # scriptlere dokunma

    if ! git diff --cached --quiet; then
      if git rev-parse --verify HEAD >/dev/null 2>&1; then
        git commit --amend --no-edit    # AMEND: önceki commiti ezer
      else
        git commit -m "autosave $(date -u +%Y%m%dT%H%M%SZ)"
      fi
      git push --force origin "filesystem-workspace:filesystem"
    fi
  ) 200>/tmp/tmate_autosave.lock
}
```

`git commit --amend` şu demektir: "son commiti bununla değiştir".

Böylece `filesystem` dalında HER ZAMAN tek bir commit olur. Kaç kez kaydedersen kaydet. Sadece mevcut durumun bir anlık görüntüsüdür, tekrar tekrar force-pushlanır.

`flock` bir kilittir: iki kayıt döngüsü olduğu için (inotify + periyodik) gitin aynı anda çalışıp birbirine basmasını engellemek gerekir. Aynı anda tek git süreci.

Temiz.

---

## sync_from_remote: birden çok oturumu yönetmek

İşte başta düşünmediğin bir durum: ya AYNI ANDA İKİ run çalıştırırsan? Ya da bir oturum diğeri dönerken `filesystem` dalını değiştirirse?

Script bunu her committen önce `sync_from_remote` ile yönetir:

```bash
sync_from_remote() {
  git fetch origin "filesystem":refs/remotes/origin/filesystem
  git merge --ff-only "refs/remotes/origin/filesystem"
}
```

`--ff-only` (yalnızca fast-forward) önemlidir: "YALNIZCA merge commiti oluşturmadan temiz ilerlenebiliyorsa birleştir" demektir.

İki dal ıraksadıysa (mesela iki oturum farklı dosyaları değiştirdiyse) fast-forward sessizce başarısız olur (`2>/dev/null || true`) ve yerel durumu koruruz. Mükemmel bir birleştirme sistemi değil ama tek bir oturumun döndüğü basit durumda bozulmaları engeller.

Dürüstçe, aynı depoda paralel 3 oturum çalıştırmamak gerekir. Ama kod yine de o durumda patlamamaya çalışır. Savunmadır bu.

---

## APT önbelleği: hızlı kurmak

Workflowda göze çarpmayan ama iyi düşünülmüş bir detay var:

```yaml
- name: Cache & install APT packages (tmate + watcher)
  uses: awalsh128/cache-apt-pkgs-action@v1.6.0
  with:
    packages: tmate inotify-tools
```

tmate ve inotify-tools APT paketlerini **önbelleğe alan** bir aksiyonla kurulur.

İlk run indirir ve kurar. Sonraki runlarda GitHub Actions önbelleğinden geri yüklenir: daha hızlı, yeniden indirmeye gerek yok.

Ve az önceki `git clean -fdx -e .apt-cache`i hatırlıyor musun? Bağlantılı. `.apt-cache` klasörü temizlikten tam da oturum sırasında kurduğun paketlerin minimum kalıcılığı için korunur.

Her şey birbirine oturur. Yaşam döngüsünün tamamını düşündüm.

---

## /tmp içinde saklanan scriptler

Yine kısır ama kurnaz bir detay. Scriptin en başında:

```bash
RUNNER_SCRIPTS_DIR="/tmp/runner-scripts"
rm -rf "$RUNNER_SCRIPTS_DIR"
mkdir -p "$RUNNER_SCRIPTS_DIR"
cp -r .github/scripts "$RUNNER_SCRIPTS_DIR/"
```

Scriptler (`update_readme.py` vs.) `filesystem` dalına dokunmadan ÖNCE `/tmp` içine kopyalanır.

Neden? Çünkü `filesystem` dalına `git reset --hard` yaptığında (başlangıçta boş ya da diskini içeren) kaynak deponun `.github/scripts` dosyaları çalışma alanından kaybolur.

Ama script oturum sırasında onlara hâlâ ihtiyaç duyar (tmate her yeniden başladığında READMEyi güncellemek için). O yüzden gitin erişemeyeceği `/tmp` içine saklar:

```bash
python3 "$RUNNER_SCRIPTS_DIR/scripts/update_readme.py" --ssh "$tmate_ssh" ...
```

Bunu düşünmezsen scriptinin neden kaybolduğunu anlamak için 30 dakika debelenirsin. Ben düşündüm.

---

## Ölçüye göre kabuk

Küçük konfor: oturum sana çıplak bir bash değil, yapılandırılmış bir kabuk verir.

`prestart.sh` özel bir `.bashrc` kopyalar:

```bash
if ! grep -q "Custom prompt and aliases for remote sessions" "$HOME/.bashrc"; then
  cp .github/scripts/remote_bashrc "$HOME/.bashrc"
fi
sudo cp "$HOME/.bashrc" /root/.bashrc
```

Ve bu `.bashrc` renkli bir istem, takma adlar (`ll`, `lla`, `rm -i`) ve hepsinden önemlisi bir `exit` geçersiz kılma içerir:

```bash
exit() {
    killall -9 -u "$(whoami)" tmate 2>/dev/null || true
    builtin exit "$@"
}

# Ctrl+D exit ile aynı şeyi yapar
bind -x '"\C-d": "exit"'
```

`exit` (ya da Ctrl+D) yazdığında kapanmadan önce tmate süreçlerini temizce öldürür. Zombi tmate oturumları bırakmayı engeller.

Daha sonra yeniden bağlanmak için oturumu öldürMEDEN ayrılmak istersen bir `tmate-detach` fonksiyonu da var. Konfor detayı ama özen seviyesini gösterir.

---

## Kendi kendine yeniden başlayan tmate

Küçük konfor: kabuğuna `exit` yazarsan normalde tmate oturumu ölür ve temelli bağlantın kesilir.

Ama burada tmate bir `while true` döngüsündedir:

```bash
while true; do
  tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
  while tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}' >/dev/null 2>&1; do
    sleep 2
  done
  echo "tmate session ended; restarting..."
done
```

`exit` mi yaptın? Oturum kendi kendine yeniden başlar. Aynı bağlantıyla yeniden bağlanırsın.

Aptalca ama oturumu kullanılabilir kılar.

---

## Tek komutla yeniden bağlanma

Her seferinde run loglarında kazı yapmadan bir kopuş sonrası nasıl yeniden bağlanırsın?

tmate SSH adresi `filesystem` dalına commitlenen bir `host.conf` dosyasına yazılır:

```bash
printf '%s' "${tmate_ssh#ssh }" > host.conf
```

Ve bu dosya gitte olduğu için onu GitHub API üzerinden tek bir komutla alabilirsin:

```bash
ssh "$(gh api -H 'Accept: application/vnd.github.v3.raw' \
  "/repos/USER/REPO/contents/host.conf?ref=filesystem" | tr -d '\r\n')"
```

Bunu çalıştırırsın, depodaki güncel SSH adresini çeker ve bağlanır. Adres iki oturum arasında değişmiş olsa bile.

---

## Tam akış

Özetleyelim:

1. Workflowu tetiklersin (push ya da manuel düğme)
2. GitHub sana bir Ubuntu VM verir
3. Script diski "filesystem" dalından geri yükler
4. inotify tüm değişiklikleri izlemeye başlar
5. periodic_save yedek olarak her 5 saniyede commitler
6. tmate başlar → SSH/web bağlantılarını üretir
7. Bağlantılar README + host.conf içine yazılır
8. ssh ya da web terminaliyle bağlanırsın
9. İstediğini yaparsın: her dosya değişikliği = otomatik kayıt
10. 6 saat sonra GitHub VM i öldürür
11. Diskin "filesystem" dalında bozulmadan durur
12. Workflowu yeniden çalıştırırsın → 3. adıma dön, her şey hâlâ orada

Kalıcı diskli ücretsiz bir VPS. Sadece git ve GitHub Actions ile.

---

## Tamam, dürüst olalım: limitler

Bu bir hack, gerçek bir VPS değil. O yüzden:

- **Run başına 6 saat maksimum.** Workflowu düzenli yeniden başlatmak gerekir. Her run sınırlı çalışma süresi.
- **Dev ve keşfe ayrılmış.** Siteni bunun üstünde barındırmayacaksın. Keşfetmek, dev, debug, atılabilir ama kurtarılabilir bir Linux ortamını test etmek içindir.
- **GitHub her şeyi görür.** Onların makineleri. Hassas bir şey koyma.
- **Depoyu özel tut.** Bir SSH kabuğu sunuyorsun. Herkese açık bir depo = potansiyel olarak herkes bağlanabilir. Kötü fikir.
- **Kullanım koşullarının sınırında.** GitHub Actions CI/CD için yapılmıştır, ücretsiz VPS için değil. O yüzden ölçülü, meşru şeyler için, abartmadan kullanmalı.

### Gerçek Aşil topuğu: git büyük dosyalardan nefret eder

Git metin içindir, dosya sistemi için değil.

Kalıcı disk bir git dalında yaşar. O yüzden kaydettiğin her şey gitten geçer. Ve git:
- büyük ikili dosyaları kötü yönetir (gitte 2 GB Docker imajı mı? unut)
- GitHubda dosya başına 100 MB limiti vardır (sert limit, ötesini pushlamaz)
- depo başına ~5 GB altında kalınması önerilir

O yüzden 500 MB `node_modules` olan bir proje `npm install` edersen ya da ağır ikililer üreten bir proje derlersen `filesystem`e push ya çok kasar ya da düpedüz başarısız olur.

`git commit --amend` yardımcı olur (tek bir commit, şişen tarihçe yok) ama 200 MB dosyanın asla geçmeyeceği gerçeğini değiştirmez.

Kabaca: **kod, yapılandırma, küçük dosyalar için süper çalışır. Büyük verileri ya da ikili artefaktları saklamak için çalışmaz.** Oturumunda ne yaptığına dair bunu aklında tutmak gerekir.

### Tam bir sistem anlık görüntüsü değil

Bir önemli nüans daha: `filesystem` dalı **çalışma alanını** (depo klasörü) kaydeder, tüm sistemi değil.

`apt install htop` yaparsan ikili `/usr/bin/htop` içine gider ki bu çalışma alanının DIŞINDADIR. O yüzden kaydedilMEZ. Sonraki run yeniden kurmak gerekir.

APT önbelleği ve `prestart.sh` bu yüzden var: yalnızca çalışma alanı kalıcı olduğu için sistem ortamını her başlatmada yeniden hazırlamak.

Kurulumlarının hayatta kalmasını istiyorsan onları çalışma alanına koymak gerekir (mesela sistem yerine yerel bir klasöre kurmak). Sindirilmesi gereken bir jimnastik.

---

## Ücretsiz VPS ve gerçek VPS: maç

| | repo-to-vps | Gerçek VPS (5 €/ay) |
|---|---|---|
| **Fiyat** | 0 € | ~5-10 €/ay |
| **Çalışma süresi** | 6 saat, yeniden başlatmalı | 7/24 |
| **Disk** | git dalı, küçük dosyalar | gerçek SSD, birkaç GB |
| **RAM** | ~7 GB (cömert!) | genelde 1-2 GB |
| **CPU** | düzgün 2-4 çekirdek | 1-2 vCPU |
| **Kurulum** | bir şablonu klonla | manuel yapılandırma |
| **Kalıcılık** | yalnızca çalışma alanı | tam sistem |
| **Meşruiyet** | KG sınırında | %100 temiz |

İlginç nokta, ham özelliklerde (RAM, CPU) GitHub koşucusunun 5 €luk bir VPS ten genelde DAHA İYİ olmasıdır. Ama 6 saatlik çalışma süresi ve çalışma alanıyla sınırlı kalıcılık onu gerçek bir sunucu değil, hacker oyuncağı yapar.

Öğrenmek, test etmek, kurtarılabilir bir ortamda hızlıca bir Linux sisteminde hata ayıklamak için? Mükemmel. Ciddi bir şey barındırmak için? Gerçek bir VPS al.

Ama istenirse geri yüklenebilen geçici bir Linux ortamı için? Bu düpedüz harika.

---

## Tüm bunların arkasındaki desen

Geri çekilip bakarsan repo-to-vps ve e-posta botu (diğer makalem) aynı fikre dayanır:

> **Git sadece bir sürüm yöneticisi değildir. Ücretsiz, sürümlü, bir API üzerinden erişilebilir kalıcı bir depolama sistemidir.**

Stateless bir sistemin (GitHub Actions, bir Worker, sunucusuz bir fonksiyon) olur olmaz iki çalıştırma arasında durum tutmak istersin, git "disk" görevi görebilir.

- E-posta botu bir git taginde `lastId` saklar.
- repo-to-vps bir git dalında koca bir dosya sistemi saklar.

Aynı desen, iki ölçek. Bir tarafta bir değer, diğer tarafta bir disk.

Ve `git commit --amend` + force-push ortak tekniktir: **mevcut durumu temsil eden, her güncellemede ezilen tek bir commit tutarsın.**

Bunun için yapılmadı. Ama çalışıyor. Ve bedava.

---

**Akılda tutulacak 3 nokta:**

1. **Bir git dalı = kalıcı bir sabit disk**: Dosya sistemini adanmış bir dalda sakla, başlangıçta geri yükle, atılabilir makinelere hayatta kalan bir duruma sahip ol.

2. **inotify + git = gerçek zamanlı otomatik kayıt**: `inotifywait` değişiklikleri çekirdek seviyesinde izler ve gite anında pushlar. Temiz tek commit tutmak için `git commit --amend` ile.

3. **tmate koşucuyu VPS e dönüştürür**: GitHub Actions makinesinde canlı SSH, otomatik yeniden başlatma ve GitHub API üzerinden tek komutla yeniden bağlanma.

Sabit disk olarak git, ikinci bölüm. Sanırım her şeyi git dallarında saklayarak bitireceğim.
