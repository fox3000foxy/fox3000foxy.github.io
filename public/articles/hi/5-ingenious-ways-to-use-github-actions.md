---
title: "GitHub Actions का रचनात्मक उपयोग करने के 5 तरीके (और secrets के बारे में ये क्या सिखाते हैं)"
description: "CI runner मुफ़्त VPS में बदला, खुद PR खोलने वाला बॉट, बिना किसी secret के npm publish। अपने repos का दौरा, उन GitHub Actions पैटर्न्स की सूची जो \"lint + test + deploy\" से आगे जाते हैं।"
date: 2026-07-14
tags:
  - github-actions
  - devops
  - automation
authors:
  - fox3000foxy
---

# GitHub Actions का रचनात्मक उपयोग करने के 5 तरीके

कागज़ पर, GitHub Actions क्लासिक CI/CD के लिए है: आप push करते हैं, यह lint करता है, test करता है, deploy करता है। मैंने एक विशेष केस पर पहले ही लिखा है -- email bot के लिए git tags को database की तरह इस्तेमाल करना (समर्पित आर्टिकल देखें)। लेकिन अपने repos खंगालने पर, इतने अलग-अलग पैटर्न हैं कि यह एक अलग आर्टिकल के लायक है, किसी एक प्रोजेक्ट पर कम फोकस, तकनीकों का कैटलॉग ज़्यादा।

पाँच चीज़ें, सबसे क्लासिक से सबसे पेचीदा तक।

## 1. git tag रन के बीच स्थायी स्टेट के रूप में

त्वरित रिकैप, पूरी डिटेल `email-autoreply` आर्टिकल में है। GitHub Actions डिज़ाइन से स्टेटलेस है -- हर रन एक खाली मशीन से शुरू होता है। जुगाड़: एक वैल्यू (ID, टाइमस्टैम्प, कोई भी छोटा स्टेट) एक समर्पित git tag में स्टोर करो, ब्रांच में कभी नहीं।

```bash
# स्टेट पढ़ें
git show refs/tags/lastid:data/lastId > data/lastId

# स्टेट लिखें (orphan branch, सिंगल commit, tag force-push)
git switch --orphan lastid-tmp
git commit -m "lastId snapshot"
git tag -f lastid
git push --force origin lastid
```

मुख्य बिंदु: हिस्ट्री कभी जमा न हो इसलिए ऑर्फन ब्रांच, और ब्रांच की जगह फोर्स्ड टैग ताकि repo की ब्रांच लिस्ट गंदी न हो।

## 2. git tag प्रीकंपाइल्ड बिल्ड कैश के रूप में

एक ही आइडिया फैमिली, अलग उपयोग: एप्लिकेशन स्टेट के बजाय, एक **बिल्ड आर्टिफैक्ट** स्टोर करते हैं। `build` जॉब कोड को एक बार कंपाइल करता है (`master` पर push पर), फिर `dist/` + `node_modules/` को `runtime` टैग में push करता है। `cron` जॉब हर बार `bun install && bun run build` चलाने के बजाय सीधे उस टैग को checkout करता है:

```yaml
- name: Checkout runtime snapshot
  uses: actions/checkout@v4
  with:
    ref: refs/tags/runtime
    fetch-depth: 1
# कोई install नहीं, कोई build नहीं -- कोड तैयार है
- run: node dist/index.js --action
```

यह रन टाइम को ~20s से ~10s कर देता है। अक्सर चलने वाले cron पर, यह मायने रखता है। `actions/cache` समान काम करता है (डिपेंडेंसी कैश करना), लेकिन git tag ज़्यादा डायरेक्ट है जब आप एक वर्ज़न्ड आर्टिफैक्ट को पूरी तरह फ्रीज़ करके स्पष्ट रूप से पॉइंट करना चाहते हैं -- सिर्फ `npm install` तेज़ करना नहीं।

## 3. एक सिंगल रिक्वायर्ड चेक जो कई जॉब्स को एग्रीगेट करता है

एक छोटा पैटर्न जो ज़्यादा नहीं दिखता लेकिन ब्रांच प्रोटेक्शन कॉन्फिग में सब कुछ बदल देता है। `konosuba-rpg` पर, CI के तीन इंडिपेंडेंट जॉब (`typecheck`, `lint`, `tests`) पैरेलल चलते हैं -- और चौथा जॉब, `test-battery`, जो कुछ नहीं करता सिवाय पहले तीन पर डिपेंड करने के:

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

इस फ़साद जॉब के बिना, प्रोटेक्टेड ब्रांच कॉन्फ़िगर करने के लिए तीन अलग-अलग ज़रूरी चेक टिक करने पड़ते -- और हर बार जॉब जुड़ने या रीनेम होने पर वह लिस्ट अपडेट करनी पड़ती। `test-battery` के साथ, repo सेटिंग्स में सिर्फ एक नाम टिक करना है, जो इंटरनल डिटेल बदलने पर भी स्टेबल रहता है।

## 4. मुफ़्त runner को टेंपरेरी VPS में बदलना

यह सबसे पेचीदा है, और साफ तौर पर मेरा फेवरेट: `repo-to-vps` GitHub Actions runner के इच्छित उपयोग को पूरी तरह हाईजैक करके इसे SSH से एक्सेस होने वाली Linux मशीन बना देता है। मुफ़्त। 6 घंटे तक (एक जॉब की अधिकतम अवधि)।

सिद्धांत: एक जॉब जो tmate लॉन्च करने के अलावा लगभग कुछ नहीं करता:

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

असली सिरदर्द यह है कि GitHub Actions runner का फ़ाइलसिस्टम **डिस्पोज़ेबल** है -- जॉब खत्म होते ही सब गायब। घंटों चलने वाला SSH सेशन बेकार है अगर आपने जो कुछ भी किया वह अगले रन में उड़ जाए। समाधान: एक git ब्रांच जो फ़ाइलसिस्टम के लाइव स्नैपशॉट का काम करे, लगातार सिंक।

`start-tmate.sh` स्क्रिप्ट क्रम से यह करती है:

1. जॉब स्टार्ट पर एक समर्पित `filesystem` ब्रांच से फ़ाइलसिस्टम **रीस्टोर** करती है (`git reset --hard`)।
2. `inotifywait` से लगातार फ़ाइल बदलावों को **वॉच** करती है, और फ़ाइल हिलते ही **तुरंत commit + push**:

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock)(/|$)' .; do
    commit_and_push
    sleep 1
  done
}
```

3. हर सेव पिछले commit को नया बनाने के बजाय **amend** करता है (`git commit --amend --no-edit`), इसलिए `filesystem` ब्रांच हमेशा एक ही commit पर रहती है -- हज़ारों स्नैपशॉट का जमावड़ा नहीं।
4. `while true` लूप सेशन मरने पर tmate को ऑटोमैटिक रीस्टार्ट करता है, `remain-on-exit on` के साथ ताकि `exit` के बाद भी टर्मिनल पहुँच योग्य रहे।
5. tmate द्वारा जनरेट किया गया SSH URL `host.conf` फ़ाइल में लिखा जाता है, `filesystem` ब्रांच पर commit -- जॉब के लॉग्स तक लाइव एक्सेस के बिना भी GitHub API (`gh api .../contents/host.conf`) से रिट्रीव किया जा सकता है।
6. `periodic_save` रूटीन हर 5 सेकंड में बैकग्राउंड में चलता है, अगर `inotifywait` कोई इवेंट मिस कर दे तो।

नतीजा: एक पूरा Linux शेल, कहीं से भी एक्सेस किया जा सकता है, फ़ाइलसिस्टम सेशन के बीच बना रहता है -- जबकि अंडरलाइंग इंफ़्रास्ट्रक्चर (GitHub Actions runner) बिल्कुल इसके लिए डिज़ाइन नहीं किया गया था। एकमात्र असली सीमा है प्रति जॉब 6-घंटे का टाइमआउट -- जिसके बाद वर्कफ़्लो रीस्टार्ट करना पड़ता है।

## 5. खुद अपनी PR खोलने वाला बॉट

`konosuba-rpg` पर, `dev` ब्रांच पर push एक जॉब ट्रिगर करता है जो चेक करता है कि `main` की ओर कोई खुली PR पहले से मौजूद है या नहीं -- और नहीं होने पर ऑटोमैटिकली बना देता है, `actions/github-script` और GitHub REST API से:

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

यहाँ जो डिटेल मायने रखती है वह है इस्तेमाल किया गया टोकन। यह वर्कफ़्लो ऑटोमैटिक `GITHUB_TOKEN` का इस्तेमाल **नहीं** करता -- यह एक अलग `AUTO_PR_TOKEN` सीक्रेट की माँग करता है, और न होने पर जारी रखने से मना कर देता है:

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

## 6. बिना किसी secret के npm पर publish करना

पाँचों में सबसे शांत, लेकिन शायद भविष्य के लिए सबसे महत्वपूर्ण: `typescript-virtual-container` के `publish.yml` वर्कफ़्लो में **कोई npm सीक्रेट नहीं है**। न `NPM_TOKEN`, न `NODE_AUTH_TOKEN`। बस यह:

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

`npm publish` फिर भी काम करता है, क्योंकि npm रजिस्ट्री अब OIDC के ज़रिए **trusted publishing** सपोर्ट करती है: वर्कफ़्लो सीधे रजिस्ट्री को अपनी पहचान साबित करता है (सटीक repo + सटीक वर्कफ़्लो, npmjs.org साइड पर कॉन्फ़िगर), बिना किसी स्टैटिक टोकन के कहीं ट्रांज़िट या स्टोर हुए। लीक होने के लिए ज़ीरो सीक्रेट, हर छह महीने में रोटेट करने के लिए ज़ीरो टोकन।

---

## GitHub secrets, गहराई में

ये पाँचों पैटर्न किसी न किसी तरह से सीक्रेट के सवाल को छूते हैं। कुछ सिद्धांत जो मेरे सभी वर्कफ़्लो में बार-बार आते हैं:

**सीक्रेट ज़रूरी नहीं कि एक सिंपल स्ट्रिंग हो।** `email-autoreply` में, `ACCOUNTS_JSON` मल्टी-अकाउंट कॉन्फ़िग का पूरा मिनिफ़ाइड JSON रखता है -- सिर्फ API की नहीं, एक पूरी डेटा स्ट्रक्चर, रनटाइम पर जस की तस फ़ाइल में इंजेक्ट:

```yaml
env:
  ACCOUNTS_JSON: ${{ secrets.ACCOUNTS_JSON }}
run: printf "%s" "$ACCOUNTS_JSON" > data/accounts.json
```

यह कॉन्फ़िग फ़ाइल commit करने से बचाता है, एन्क्रिप्टेड भी, और repo सेटिंग्स में एक क्लिक से बिना कोड छुए अपडेट हो जाता है।

**`GITHUB_TOKEN` की सटीक सीमाएँ हैं, और यह जानबूझकर है।** GitHub हर रन में जो ऑटोमैटिक टोकन इंजेक्ट करता है वह शक्तिशाली है, लेकिन कुछ बिंदुओं पर सील है: डिफ़ॉल्ट रूप से यह दूसरा वर्कफ़्लो ट्रिगर नहीं कर सकता, और repo कॉन्फ़िग के अनुसार ब्रांच प्रोटेक्शन रूल्स से ब्लॉक हो सकता है। इसीलिए `create-pull-request.yml` एक अलग PAT (`AUTO_PR_TOKEN`) की माँग करता है -- असली अकाउंट (या GitHub App) का टोकन, स्पष्ट `contents:write` + `pull-requests:write` अधिकारों के साथ, जॉब के अस्थायी टोकन से अलग।

**परमिशन जॉब दर जॉब स्कोप होती हैं, ग्लोबली नहीं।** यहाँ लिस्टेड हर वर्कफ़्लो एक मिनिमल, कमेंटेड `permissions:` ब्लॉक डिक्लेयर करता है:

```yaml
permissions:
  contents: read
  actions: read
  checks: write
```

डिफ़ॉल्ट `GITHUB_TOKEN` का ऐतिहासिक रूप से पब्लिक repo पर काफ़ी व्यापक अधिकार होता है; इसे स्पष्ट रूप से सिर्फ उसी तक सीमित करना जो जॉब को वास्तव में चाहिए, नुकसान को सीमित करता है अगर चेन में कोई थर्ड-पार्टी एक्शन कंप्रोमाइज़ हो जाए।

**सबसे अच्छा सीक्रेट वह है जो मौजूद ही नहीं है।** `typescript-virtual-container` का OIDC पैटर्न इस विचार का सबसे पूर्ण संस्करण है: `NPM_TOKEN` के रोटेशन, एक्सपायरी और लीक रिस्क को मैनेज करने के बजाय, वर्कफ़्लो क्रिप्टोग्राफ़िक रूप से अपनी पहचान (यह सटीक repo, यह सटीक वर्कफ़्लो) सीधे थर्ड-पार्टी सर्विस को साबित करता है। यही लॉजिक AWS, Docker Hub, PyPI के लिए भी उपलब्ध -- ज़्यादा से ज़्यादा रजिस्ट्री और क्लाउड GitHub Actions से OIDC सपोर्ट कर रहे हैं।

---

**3 मुख्य बिंदु**

1. एक git tag (orphan, force-pushed) मिनिमलिस्ट डेटाबेस या प्रीकंपाइल्ड बिल्ड कैश के रूप में काम कर सकता है -- एक ही मैकेनिज़्म के दो अलग-अलग उपयोग।
2. एक मुफ़्त GitHub Actions runner एक स्थायी SSH शेल बन सकता है अगर आप उसके फ़ाइलसिस्टम को `inotifywait` से ऑटोसेव करके और एक सिंगल अमेंडेड commit के साथ git ब्रांच में लगातार सिंक करना स्वीकार करें।
3. डिफ़ॉल्ट `GITHUB_TOKEN` जानबूझकर सीमित है -- क्रॉस-ब्रांच PR बनाने या बिना सीक्रेट के publish करने के लिए या तो समर्पित PAT चाहिए, या OIDC trusted publishing पर स्विच करना होगा।
