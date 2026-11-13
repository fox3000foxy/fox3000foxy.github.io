---
title: "Repo to VPS : GitHub Actions को स्थायी भंडारण वाले मुफ्त VPS में बदलना"
description: git को स्थायी भंडारण बनाकर GitHub Actions runner को स्थायी VPS में कैसे बदलें, tmate, inotify और commit --amend।
date: 2026-05-29
tags:
  - github
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "Fkmvvp6Sg5ujpnkTX3Lx7lglCt16c+DQl4njl3fcvqcdLrtDR7odr9FoJscaAjzYN+JetNHt3uHz9d5xBO2U7A=="
---

## GitHub तुम्हें 6 घंटे मुफ्त VPS देता है। मैंने उसे स्थायी बनाने का तरीका खोजा।

GitHub Actions तुम्हें मुफ्त Linux मशीनें देता है।

जैसे, असली Ubuntu serveur। 2 core, 7 Go RAM, 14 Go डिस्क। मुफ्त। प्रति run 6 घंटे।

एकमात्र "समस्या" : run खत्म होने पर, सब मिट जाता है। मशीन फेंकने योग्य है। तुम पैकेज स्थापित करते हो, तुम कोड करते हो, तुम कॉन्फ़िगर करते हो... और धड़ाम, अंत में सब गायब हो जाता है। जैसे तुमने कुछ किया ही नहीं।

सिवाय अगर।

सिवाय अगर तुम **git को hard disk की तरह** इस्तेमाल करो।

और वहाँ, अचानक, तुम्हारे पास स्थायी डिस्क वाला मुफ्त VPS है जो run बचता है। तुम फिर से जुड़ते हो, सब अभी भी वहाँ है। तुम वहीं फिर से शुरू करते हो जहाँ रुके थे।

यह पूरी तरह टूटा हुआ है। मुझे समझाने दो।

---

## संदर्भ : GitHub Actions runner

जब तुम GitHub Actions workflow चलाते हो, तो GitHub तुम्हें VM देता है।

यह तुम्हारा कोड build करने, तुम्हारे परीक्षण चलाने, deploy करने के लिए बना है। workflow चलता है, अपना काम करता है, और मशीन नष्ट हो जाती है।

लेकिन कुछ भी तुम्हें इस VM से कुछ और करने से नहीं रोकता। जैसे, उस पर SSH shell खोलना और उसे serveur की तरह इस्तेमाल करना।

बाधा यह है कि ये मशीनें **stateless** और **अस्थायी** हैं :
- अस्थायी : प्रति run अधिकतम 6h (`timeout-minutes: 360`, GitHub की छत)
- Stateless : अंत में सब मिट जाता है

इसलिए उसे उपयोगी VPS बनाने के लिए, दो समस्याएँ सुलझानी होंगी :
1. **उस पर वास्तविक समय कैसे जुड़ें ?**
2. **दो run के बीच डिस्क कैसे रखें ?**

यहाँ यह गंदा hack बनता है।

---

## समस्या 1 : tmate से live SSH

**tmate** tmux का fork है जो साझा करने योग्य SSH सत्र बनाता है।

तुम उसे मशीन पर चलाते हो, वह तुम्हें दो लिंक बनाता है :
- SSH URL (`ssh xxx@nyc1.tmate.io`)
- web URL (ब्राउजर में terminal)

तुम इन लिंक से एक से जुड़ते हो, और धड़ाम, तुम वास्तविक समय में मशीन पर shell में हो।

workflow इसलिए tmate चलाता है :

```bash
tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
tmate -S /tmp/tmate.sock set-option -g remain-on-exit on

# कनेक्शन लिंक लेता है
tmate_ssh=$(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}')
tmate_web=$(tmate -S /tmp/tmate.sock display -p '#{tmate_web}')
```

और ये लिंक Python स्क्रिप्ट से सीधे repo README में लिखे जाते हैं। तुम अपना repo खोलते हो, तुम कनेक्शन लिंक देखते हो, तुम क्लिक करते हो। तुम अपने VPS में हो।

पहली समस्या सुलझी। लेकिन दूसरी है जो सच में पागल है।

---

## समस्या 2 : hard disk के रूप में git

यहाँ वह विचार है जो सब बदलता है।

मशीन हर run पर मिटती है। इसलिए हम **filesystem को समर्पित git शाखा** में संग्रहित करते हैं, जिसे `filesystem` कहते हैं।

शुरू में, स्क्रिप्ट इस शाखा से स्थिति पुनर्स्थापित करती है :

```bash
filesystem_branch="filesystem"

# remote से filesystem शाखा लेता है
git fetch origin "$filesystem_branch":refs/remotes/origin/$filesystem_branch

# इस शाखा से workspace पुनर्स्थापित करता है
git checkout -B filesystem-workspace "refs/remotes/origin/$filesystem_branch"
git reset --hard "refs/remotes/origin/$filesystem_branch"
```

`filesystem` शाखा तुम्हारी hard disk है। तुम्हारी फाइलें, तुम्हारी install, तुम्हारी config, सब इसमें है।

विचार समझ रहे हो ? मशीन फेंकने योग्य है, लेकिन डिस्क git में रहती है। तुम workflow फिर से चलाते हो, डिस्क पुनर्स्थापित होती है, तुम ठीक वहीं फिर से शुरू करते हो जहाँ थे।

यह hibernate करने वाले VPS जैसा है। सिवाय इसके कि hibernation git repo है

### पहला लॉन्च : खाली डिस्क बनाना

पहले run पर, `filesystem` शाखा अभी मौजूद नहीं है। उसे बनाना होगा। और यह मामूली नहीं है :

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

`git checkout --orphan` कुंजी है। अनाथ शाखा **बिना इतिहास** वाली शाखा है, जैसे तुम खाली repo से फिर से शुरू करते हो।

अनाथ क्यों ? क्योंकि तुम नहीं चाहते कि तुम्हारी स्थायी डिस्क तुम्हारे स्रोत कोड का पूरा इतिहास घसीटे। डिस्क अलग रहती है, अपने जीवन के साथ। वह खाली शुरू होती है।

और शुरुआत में `git ls-remote --exit-code`, यह बस साफ जाँच है : "क्या शाखा remote पर पहले से मौजूद है ?"। अगर हाँ, तो कुछ नहीं छूते। अगर नहीं, तो बनाते हैं। Idempotent, जैसा हमें पसंद है।

### चयनात्मक git clean : cache सुरक्षित करना

यह पंक्ति रुकने योग्य है :

```bash
git clean -fdx -e .apt-cache -e .cache -e host.conf -e tmate.sock
```

`git clean -fdx` वह सब हटाता है जो git track नहीं करता। सामान्यतः यह हिंसक है, workspace को अच्छी तरह साफ करता है।

लेकिन `-e` (exclude) कुछ फाइलें सुरक्षित करते हैं :
- `.apt-cache` → APT पैकेज cache (इस पर लौटेंगे, यह चालाक है)
- `.cache` → सामान्य cache
- `host.conf` → सत्र SSH पता
- `tmate.sock` → चल रहे tmate सत्र का socket

अगर तुम ये फाइलें साफ करते, तो तुम सक्रिय सत्र तोड़ते या अपना cache खोते। इसलिए reset के दौरान उन्हें बचाते हैं।

पहली नजर में मूर्ख विवरण, लेकिन इसके बिना सब टूटता है।

---

## autosave : inotify जो सब देखता है

अच्छा, लेकिन फाइलें `filesystem` शाखा में कैसे पहुँचती हैं ?

उत्तर : watcher जो सभी फाइल बदलाव देखता है और अपने आप commit/push करता है।

जादुई उपकरण **inotifywait** (`inotify-tools` पैकेज से) है। वह kernel स्तर पर filesystem देखता है और जैसे ही फाइल बदलती है trigger करता है।

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock|\.gitignore|\.txt\.swp)(/|$)' .; do
    echo "[autosave] change detected"
    commit_and_push
    sleep 1   # एक साथ बहुत बदलाव होने पर debounce
  done
}

autosave &
```

inotify flag चीड़ते हैं, क्योंकि हर एक मायने रखता है :
- `-r` → पुनरावर्ती, सभी उप फोल्डर देखता है
- `-e modify,create,delete,move` → इन 4 घटना प्रकारों पर प्रतिक्रिया करता है
- `--exclude '...'` → कुछ फाइलें नजरअंदाज करने के लिए regex

`--exclude` महत्वपूर्ण है। देखो वह क्या नजरअंदाज करता है :
- `.git` → जाहिर है, वरना हर commit autosave trigger करता जो commit trigger करता... अनंत लूप। तबाही।
- `.apt-cache` और `.cache` → cache, जो हर समय बदलते हैं और जिन्हें हम git में spam नहीं करना चाहते
- `host.conf` और `tmate.sock` → सत्र फाइलें, जो बिना रुके हिलती हैं
- `.gitignore`, `.txt.swp` → अस्थायी फाइलें (`.swp` vim संपादन फाइलें हैं)

इस exclude के बिना, तुम्हें autosave मिलता जो अपने बदलावों पर लूप में trigger होता। सूची में `.git`, यही वह पंक्ति है जो तुम्हें पैर में गोली मारने से रोकती है।

तुम फाइल बदलते हो ? inotify उसे तुरंत पहचानता है, यह commit करता है, यह push करता है। एक सेकंड से कम में, तुम्हारा बदलाव `filesystem` शाखा में है।

तुम पैकेज स्थापित करते हो, तुम कोड लिखते हो, तुम config छूते हो, सब वास्तविक समय सहेजा जाता है, अपने आप, बिना तुम कुछ करो।

तुम्हारे पास सचमुच पूरे डिस्क की स्वचालित सहेजना तंत्र है। टूटा हुआ।

### debounce : git spam नहीं करना

हर save बाद `sleep 1` **debounce** है।

जब तुम एडिटर में फाइल सहेजते हो, तो अक्सर यह झटके में कई filesystem घटनाएँ बनाता है (अस्थायी फाइल निर्माण, rename, पुरानी हटाना...)। debounce के बिना, तुम एक ही सहेजने के लिए 3-4 commit trigger करते।

`sleep 1` कहता है : "save बाद एक सेकंड प्रतीक्षा करो, जब तक झटका शांत हो, फिर से सुनने से पहले"। यह करीबी बदलावों को एक ही commit में समूहित करता है। चालाक।

### और ऊपर से आवधिक सहेजना

अगर inotify कोई घटना चूक जाए, तो हर 5 सेकंड save भी है :

```bash
periodic_save() {
  while true; do
    sync_from_remote   # संभावित दूरस्थ बदलाव लेता है
    sleep 5
    commit_and_push
  done
}

periodic_save &
```

बेल्ट और सस्पेंडर। हम खासकर डिस्क स्थिति नहीं खोना चाहते।

---

## चालाक विवरण : एक ही commit

अगर तुम हर फाइल बदलाव पर commit करते हो, तो तुम हजारों commit जमा करोगे। एक घंटे सत्र में, तुम्हारा git इतिहास फटता है। repo विशाल हो जाता है। यह गंदा है।

समाधान सुरुचिपूर्ण है : नया बनाने के बजाय **मौजूदा commit संशोधित** करते हैं।

```bash
commit_and_push() {
  (
    flock -n 200 || return   # lock ताकि दो save एक साथ न चलें

    git add -A
    git reset -- .github/workflows/ .github/scripts/   # स्क्रिप्ट मत छुओ

    if ! git diff --cached --quiet; then
      if git rev-parse --verify HEAD >/dev/null 2>&1; then
        git commit --amend --no-edit    # AMEND : पिछला commit मिटाता है
      else
        git commit -m "autosave $(date -u +%Y%m%dT%H%M%SZ)"
      fi
      git push --force origin "filesystem-workspace:filesystem"
    fi
  ) 200>/tmp/tmate_autosave.lock
}
```

`git commit --amend` का मतलब : "आखिरी commit को इससे बदलो"।

इसलिए `filesystem` शाखा में हमेशा एक ही commit है। चाहे तुम कितनी बार सहेजो। यह वर्तमान स्थिति का snapshot है, बार बार force-push किया हुआ।

`flock` ताला है : चूँकि save के दो लूप हैं (inotify + आवधिक), बचना होगा कि वे git एक साथ चलाकर एक दूसरे के पैर न खींचें। एक साथ एक ही git प्रक्रिया।

साफ।

---

## sync_from_remote : कई सत्र प्रबंधित करना

खैर, एक मामला जिसके बारे में तुम शुरू में नहीं सोचते : और अगर तुम एक साथ दो run चलाते हो ? या अगर कोई सत्र दूसरे चलने के दौरान `filesystem` शाखा बदलता है ?

स्क्रिप्ट हर commit से पहले `sync_from_remote` से इसे संभालती है :

```bash
sync_from_remote() {
  git fetch origin "filesystem":refs/remotes/origin/filesystem
  git merge --ff-only "refs/remotes/origin/filesystem"
}
```

`--ff-only` (सिर्फ fast-forward) महत्वपूर्ण है : इसका मतलब "सिर्फ merge करो अगर हम merge commit बनाए बिना साफ आगे बढ़ सकते हैं"।

अगर दोनों शाखाएँ अलग हो गई हैं (जैसे, दो सत्रों ने अलग फाइलें बदलीं), तो fast-forward चुपचाप विफल होता है (`2>/dev/null || true`) और हम स्थानीय स्थिति रखते हैं। यह पूर्ण merge तंत्र नहीं है, लेकिन यह साधारण मामले में भ्रष्टाचार से रोकता है जहाँ एक ही सत्र चलता है।

ईमानदारी से, उसी repo पर 3 सत्र समानांतर नहीं चलाने चाहिए। लेकिन कोड फिर भी कोशिश करता है कि अगर ऐसा होता है तो न फटे। यह बचाव है।

---

## APT cache : तेज स्थापित करना

workflow में एक विवरण है जो मामूली लगता है लेकिन अच्छी तरह सोचा है :

```yaml
- name: Cache & install APT packages (tmate + watcher)
  uses: awalsh128/cache-apt-pkgs-action@v1.6.0
  with:
    packages: tmate inotify-tools
```

tmate और inotify-tools ऐसी क्रिया से स्थापित होते हैं जो **APT पैकेज cache** करती है।

पहले run पर, यह डाउनलोड और स्थापित करता है। अगले run पर, यह GitHub Actions cache से पुनर्स्थापित होता है, तेज, फिर से डाउनलोड की जरूरत नहीं।

और तुम्हें अभी का `git clean -fdx -e .apt-cache` याद है ? यह जुड़ा है। `.apt-cache` फोल्डर सफाई से ठीक इसलिए सुरक्षित है ताकि सत्र के दौरान तुम जो पैकेज स्थापित करते हो वे न्यूनतम बने रह सकें।

सब जुड़ता है। मैंने पूरा जीवन चक्र सोचा।

---

## /tmp में छिपी स्क्रिप्ट

एक और दुष्ट लेकिन चालाक विवरण। स्क्रिप्ट की बिल्कुल शुरुआत में :

```bash
RUNNER_SCRIPTS_DIR="/tmp/runner-scripts"
rm -rf "$RUNNER_SCRIPTS_DIR"
mkdir -p "$RUNNER_SCRIPTS_DIR"
cp -r .github/scripts "$RUNNER_SCRIPTS_DIR/"
```

स्क्रिप्ट (`update_readme.py`, आदि) `filesystem` शाखा छूने से पहले `/tmp` में कॉपी की जाती हैं।

क्यों ? क्योंकि जब तुम `filesystem` शाखा की ओर `git reset --hard` करते हो (जो शुरू में खाली है, या जिसमें तुम्हारी डिस्क है), तो स्रोत repo की `.github/scripts` फाइलें workspace से गायब हो जाती हैं।

लेकिन स्क्रिप्ट को सत्र के दौरान अभी भी उनकी जरूरत है (tmate के हर पुनरारंभ पर README अद्यतन करने के लिए)। इसलिए वह उन्हें git पहुँच से बाहर `/tmp` में छिपाता है :

```bash
python3 "$RUNNER_SCRIPTS_DIR/scripts/update_readme.py" --ssh "$tmate_ssh" ...
```

अगर तुम इसके बारे में नहीं सोचते, तो 30 मिनट जूझते हो यह समझने में कि तुम्हारी स्क्रिप्ट क्यों गायब हुई। मैंने इसके बारे में सोचा।

---

## नाप का shell

छोटा आराम : सत्र तुम्हें कॉन्फ़िगर shell देता है, नंगा bash नहीं।

`prestart.sh` कस्टम `.bashrc` कॉपी करता है :

```bash
if ! grep -q "Custom prompt and aliases for remote sessions" "$HOME/.bashrc"; then
  cp .github/scripts/remote_bashrc "$HOME/.bashrc"
fi
sudo cp "$HOME/.bashrc" /root/.bashrc
```

और इस `.bashrc` में रंगीन prompt, उपनाम (`ll`, `lla`, `rm -i`), और खासकर `exit` override है :

```bash
exit() {
    killall -9 -u "$(whoami)" tmate 2>/dev/null || true
    builtin exit "$@"
}

# Ctrl+D exit जैसा करता है
bind -x '"\C-d": "exit"'
```

जब तुम `exit` टाइप करते हो (या Ctrl+D), तो वह बंद करने से पहले tmate प्रक्रियाएँ साफ मारता है। यह zombie tmate सत्र छोड़ने से रोकता है।

बिना सत्र मारे disconnect होने के लिए `tmate-detach` फंक्शन भी है (बाद में फिर से जुड़ने के लिए)। आराम विवरण, लेकिन यह देखभाल स्तर दिखाता है।

---

## tmate जो खुद फिर से शुरू होता है

छोटा आराम : अगर तुम अपने shell में `exit` टाइप करते हो, तो सामान्यतः tmate सत्र मरता है और तुम अच्छे के लिए disconnect हो।

सिवाय यहाँ, tmate `while true` लूप में है :

```bash
while true; do
  tmate -S /tmp/tmate.sock new-session -d "bash --rcfile $HOME/.bashrc -i"
  while tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}' >/dev/null 2>&1; do
    sleep 2
  done
  echo "tmate session ended; restarting..."
done
```

तुम `exit` करते हो ? सत्र अपने आप फिर से शुरू होता है। तुम उसी लिंक से फिर से जुड़ते हो।

यह मूर्ख है, लेकिन यह सत्र को उपयोगी बनाता है।

---

## एक कमांड में पुनः जुड़ाव

हर बार run log में खोजे बिना, deco बाद कैसे फिर से जुड़ते हो ?

tmate का SSH पता `host.conf` फाइल में लिखा जाता है, `filesystem` शाखा में committ किया हुआ :

```bash
printf '%s' "${tmate_ssh#ssh }" > host.conf
```

और चूँकि यह फाइल git में है, तुम इसे एक ही कमांड से GitHub API से ले सकते हो :

```bash
ssh "$(gh api -H 'Accept: application/vnd.github.v3.raw' \
  "/repos/USER/REPO/contents/host.conf?ref=filesystem" | tr -d '\r\n')"
```

तुम यह चलाते हो, यह repo में वर्तमान SSH पता लेने जाता है, और तुम्हें जोड़ता है। भले ही पता दो सत्रों के बीच बदला हो।

---

## पूरा प्रवाह

संक्षेप करते हैं :

1. तुम workflow trigger करते हो (push या मैन्युअल बटन)
2. GitHub तुम्हें Ubuntu VM देता है
3. स्क्रिप्ट "filesystem" शाखा से डिस्क पुनर्स्थापित करती है
4. inotify सभी बदलाव देखना शुरू करता है
5. periodic_save backup में हर 5s commit करता है
6. tmate शुरू होता है → SSH/web लिंक बनाता है
7. लिंक README + host.conf में लिखे जाते हैं
8. तुम ssh या web terminal से जुड़ते हो
9. तुम जो चाहते हो करते हो, हर फाइल बदलाव = autosave
10. 6 घंटे बाद, GitHub VM मारता है
11. तुम्हारी डिस्क "filesystem" शाखा में अक्षुण्ण है
12. तुम workflow फिर से चलाते हो → चरण 3 पर वापसी, सब अभी भी वहाँ है

स्थायी डिस्क वाला मुफ्त VPS। सिर्फ git और GitHub Actions से।

---

## अच्छा, ईमानदार होना होगा : सीमाएँ

यह hack है, असली VPS नहीं। इसलिए :

- **प्रति run अधिकतम 6h।** workflow नियमित फिर से चलाना होगा। हर run पर सीमित Uptime।
- **dev और खोज के लिए आरक्षित।** तुम इस पर अपनी साइट host नहीं करोगे। यह खोजने, dev, debug, फेंकने योग्य लेकिन पुनः प्राप्त Linux वातावरण परखने के लिए है।
- **GitHub सब देखता है।** यह उनकी मशीनें हैं। कुछ संवेदनशील मत रखो।
- **repo निजी रखो।** तुम SSH shell उजागर करते हो। सार्वजनिक repo = कोई भी संभावित उससे जुड़ सकता है। बुरा विचार।
- **यह उपयोग शर्तों की सीमा पर है।** GitHub Actions CI/CD के लिए बना है, मुफ्त VPS के लिए नहीं। इसलिए संयम से इस्तेमाल करो, वैध के लिए, दुरुपयोग के बिना।

### असली Achilles एड़ी : git बड़ी फाइलों से नफरत करता है

Git पाठ के लिए बना है, filesystem के लिए नहीं।

स्थायी डिस्क git शाखा में रहती है। इसलिए जो कुछ तुम सहेजते हो वह git से गुजरता है। और git :
- बड़ी बाइनरी फाइलें खराब संभालता है (git में 2 Go Docker छवि ? भूल जाओ)
- GitHub पर प्रति फाइल 100 Mo सीमा है (कठोर सीमा, उसके परे push नहीं होता)
- प्रति repo ~5 Go नीचे रहने की सिफारिश करता है

इसलिए अगर तुम 500 Mo `node_modules` वाला प्रोजेक्ट `npm install` करते हो, या तुम भारी binary बनाने वाला प्रोजेक्ट build करते हो, तो `filesystem` की ओर push या तो बहुत धीमा होगा, या पूरी तरह विफल होगा।

`git commit --amend` मदद करता है (एक ही commit, फूलता इतिहास नहीं), लेकिन यह तथ्य नहीं बदलता कि 200 Mo फाइल कभी नहीं जाएगी।

मोटे तौर पर : **यह कोड, config, छोटी फाइलों के लिए बढ़िया काम करता है। यह बड़े डेटा या बाइनरी कलाकृतियाँ संग्रहित करने के लिए काम नहीं करता।** अपने सत्र में जो करते हो उस पर इसे ध्यान में रखना होगा।

### यह पूर्ण तंत्र snapshot नहीं है

एक और महत्वपूर्ण बारीकी : `filesystem` शाखा **workspace** (repo फोल्डर) सहेजती है, पूरा तंत्र नहीं।

अगर तुम `apt install htop` करते हो, तो binary `/usr/bin/htop` में जाता है, जो workspace से बाहर है। इसलिए वह सहेजा नहीं जाएगा। अगले run पर, फिर से स्थापित करना होगा।

इसीलिए हमारे पास APT cache और `prestart.sh` है : हर शुरू में तंत्र वातावरण फिर से तैयार करने के लिए, चूँकि सिर्फ workspace बना रहता है।

अगर तुम चाहते हो कि तुम्हारी install बचें, तो उन्हें workspace में रखना होगा (जैसे, तंत्र में बजाय स्थानीय फोल्डर में स्थापित करना)। यह एकीकृत करने की कसरत है।

---

## मुफ्त VPS बनाम असली VPS : मैच

| | repo-to-vps | असली VPS (5€/महीना) |
|---|---|---|
| **कीमत** | 0€ | ~5-10€/महीना |
| **Uptime** | 6h, फिर से चलाना होगा | 24/7 |
| **डिस्क** | git शाखा, छोटी फाइलें | असली SSD, कई Go |
| **RAM** | ~7 Go (उदार !) | अक्सर 1-2 Go |
| **CPU** | सही 2-4 core | 1-2 vCPU |
| **Setup** | template clone करो | मैन्युअल config |
| **स्थायित्व** | सिर्फ workspace | पूरा तंत्र |
| **वैधता** | CGU सीमा | 100% साफ |

दिलचस्प बिंदु यह है कि कच्चे spec तरफ (RAM, CPU), GitHub runner अक्सर 5€ VPS से बेहतर है। लेकिन 6h uptime और सिर्फ workspace स्थायित्व, यही इसे hacker खिलौना बनाता है, असली serveur नहीं।

सीखने, परखने, फेंकने योग्य लेकिन पुनः प्राप्त Linux वातावरण में Linux तंत्र vite fait debug करने के लिए ? एकदम सही। कुछ भी गंभीर host करने के लिए ? असली VPS लो।

लेकिन अस्थायी Linux वातावरण के लिए जिसे तुम इच्छा से पुनर्स्थापित कर सकते हो ? यह बस शानदार है।

---

## इन सबके पीछे pattern

अगर तुम पीछे हटते हो, तो repo-to-vps और email बॉट (मेरा दूसरा लेख) उसी विचार पर टिके हैं :

> **Git सिर्फ संस्करण प्रबंधक नहीं है। यह स्थायी, मुफ्त, संस्करणबद्ध भंडारण तंत्र है, API से पहुँच योग्य।**

जैसे ही तुम्हारे पास stateless तंत्र (GitHub Actions, Worker, serverless फंक्शन) है और तुम दो निष्पादनों के बीच स्थिति रखना चाहते हो, git "डिस्क" बन सकता है।

- email बॉट git टैग में `lastId` संग्रहित करता है।
- repo-to-vps पूरी filesystem git शाखा में संग्रहित करता है।

वही pattern, दो पैमाने। एक तरफ एक मान, दूसरी तरफ डिस्क।

और `git commit --amend` + force-push सामान्य तकनीक है : **तुम एक ही commit रखते हो जो वर्तमान स्थिति दर्शाता है, हर अद्यतन पर मिटाया हुआ।**

यह इसके लिए नहीं बना है। लेकिन काम करता है। और मुफ्त है।

---

**याद रखने वाले 3 बिंदु :**

1. **git शाखा = स्थायी hard disk** , अपनी filesystem समर्पित शाखा में संग्रहित करो, शुरू में पुनर्स्थापित करो, और तुम्हारे पास स्थिति है जो फेंकने योग्य मशीनें बचती है।

2. **inotify + git = वास्तविक समय autosave** , `inotifywait` kernel स्तर पर बदलाव देखता है और तुरंत git की ओर push करता है। साफ एकल commit रखने के लिए `git commit --amend` के साथ।

3. **tmate runner को VPS में बदलता है** , GitHub Actions मशीन पर live SSH, स्वचालित restart और GitHub API से एक कमांड में पुनः जुड़ाव के साथ।

hard disk के रूप में Git, दूसरा episode। मुझे लगता है मैं सब कुछ git शाखाओं में संग्रहित करके खत्म करूँगा
