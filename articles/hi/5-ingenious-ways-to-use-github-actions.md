---
title: "GitHub Actions का इस्तेमाल करने के 5 टेढ़े तरीके (और यह secrets के बारे में क्या सिखाता है)"
description: "CI runner मुफ्त VPS में बदला, बॉट जो अपनी pull request खोलता है, बिना किसी secret के npm publish। मेरे repo का दौरा उन GitHub Actions पैटर्न सूचीबद्ध करने के लिए जो साधारण lint + test + deploy से बाहर हैं।"
date: 2026-07-14
tags:
  - github-actions
  - devops
  - automation
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "in+2ET8MzakGL6cQ6wsn8mY2sSKt2RaWYFjWl8Fnf5EIl6EKpS7GzPC5hDK+/p2cGqUJ4H3ad2DfYhd7suDfqw=="
---

# GitHub Actions का इस्तेमाल करने के 5 टेढ़े तरीके

GitHub Actions, कागज पर, क्लासिक CI/CD के लिए बना है : तुम push करते हो, यह lint करता है, परीक्षण करता है, डिप्लॉय करता है। मैंने एक विशेष मामले पर पहले लिखा है (git टैग को email बॉट के लिए डेटाबेस की तरह इस्तेमाल करना, समर्पित लेख देखें)। लेकिन मेरे खुद के repo खँगालने पर, अलग तकनीकों की सूची बनाने लायक पर्याप्त पैटर्न हैं, एक ही प्रोजेक्ट पर कम केंद्रित, तकनीकों की सूची ज्यादा।

पाँच उपयोग, सबसे क्लासिक से सबसे टेढ़े तक।

## 1. दो run के बीच स्थायी स्थिति के रूप में git टैग

त्वरित अनुस्मारक, पूरा विवरण `email-autoreply` पर लेख में है। GitHub Actions डिजाइन से stateless है : हर run खाली मशीन से शुरू होता है। वैकल्पिक रास्ता : मान (ID, timestamp, कोई भी छोटा राज्य) समर्पित git टैग में संग्रहित करना, कभी शाखा में नहीं।

```bash
# स्थिति पढ़ना
git show refs/tags/lastid:data/lastId > data/lastId

# स्थिति लिखना (अनाथ शाखा, एक ही कमिट, टैग का force-push)
git switch --orphan lastid-tmp
git commit -m "lastId snapshot"
git tag -f lastid
git push --force origin lastid
```

मुख्य बिंदु : इतिहास कभी जमा न करने के लिए अनाथ शाखा, और repo की शाखा सूची प्रदूषित न करने के लिए शाखा के बजाय बलपूर्वक टैग।

## 2. पूर्व संकलित build cache के रूप में git टैग

वही विचार परिवार, दूसरा उपयोग : applicative स्थिति संग्रहित करने के बजाय, **build कलाकृति** संग्रहित की जाती है। `build` job कोड एक बार संकलित करता है (`master` पर push पर), फिर `dist/` + `node_modules/` को `runtime` टैग में push करता है। `cron` job, हर निष्पादन पर `bun install && bun run build` चलाने के बजाय सीधे इस टैग को checkout करता है :

```yaml
- name: Checkout runtime snapshot
  uses: actions/checkout@v4
  with:
    ref: refs/tags/runtime
    fetch-depth: 1
# कोई install नहीं, कोई build नहीं, कोड पहले से तैयार है
- run: node dist/index.js --action
```

यह run को लगभग 20s से लगभग 10s में बदलता है। अक्सर चलने वाले cron पर, यह मायने रखता है। `actions/cache` समान काम करता है (निर्भरताएँ cache करना), लेकिन git टैग ज्यादा सीधा है जब तुम सिर्फ `npm install` तेज करने के बजाय पूरी तरह संस्करणबद्ध कलाकृति स्थिर करके उसे स्पष्ट इंगित करना चाहते हो।

## 3. एक ही अनिवार्य check जो कई job जोड़ता है

छोटा पैटर्न जो मामूली लगता है लेकिन संरक्षित शाखा कॉन्फ़िगरेशन में जीवन बदलता है। `konosuba-rpg` पर, CI में तीन स्वतंत्र job (`typecheck`, `lint`, `tests`) हैं जो समानांतर चलते हैं, और चौथा job, `test-battery`, जो सिर्फ पहले तीनों पर निर्भर करने के अलावा कुछ नहीं करता :

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

इस दिखावटी job के बिना, संरक्षित शाखा कॉन्फ़िगर करने के लिए तीन अलग अनिवार्य check टिक करने होंगे, और हर बार job जोड़े या नाम बदले जाने पर यह सूची अद्यतन करनी होगी। `test-battery` के साथ, repo सेटिंग में टिक करने के लिए एक ही नाम, जो आंतरिक विवरण बदले तब भी स्थिर रहता है।

## 4. मुफ्त runner को अस्थायी VPS में बदलना

यह सबसे टेढ़ा है, और स्पष्ट रूप से मेरा पसंदीदा : `repo-to-vps` GitHub Actions runner के नियत उपयोग को पूरी तरह मोड़कर उसे SSH से पहुँचने योग्य Linux मशीन बनाता है, मुफ्त, 6 घंटे तक (एक job की अधिकतम सीमा)।

सिद्धांत : एक job जो [tmate](https://tmate.io/) (tmux का fork जो SSH या ब्राउजर से साझा करने योग्य terminal सत्र उजागर करता है) चलाने के अलावा लगभग कुछ नहीं करता :

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

असली सिरदर्द यह है कि GitHub Actions runner का filesystem **फेंकने योग्य** है : जैसे ही job खत्म होता है, सब गायब हो जाता है। घंटों चलने वाला SSH सत्र बेकार है अगर तुम उसमें जो करते हो वह अगले run पर वाष्पित हो जाता है। समाधान : git शाखा जो filesystem का live snapshot बनती है, लगातार समकालिक।

`start-tmate.sh` स्क्रिप्ट, क्रम में, करता है :

1. job शुरू होने पर समर्पित `filesystem` शाखा से filesystem **पुनर्स्थापित** करता है (उस पर `git reset --hard`)।
2. `inotifywait` से लगातार फाइल बदलाव **निगरानी** करता है, और जैसे ही कोई फाइल हिलती है **तुरंत commit + push** करता है :

```bash
autosave() {
  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|\.apt-cache|\.cache|host\.conf|tmate\.sock)(/|$)' .; do
    commit_and_push
    sleep 1   # debounce
  done
}
```

3. हर सहेजना नया बनाने के बजाय पिछला कमिट **संशोधित** करता है (`git commit --amend --no-edit`), इसलिए `filesystem` शाखा हमेशा एक ही कमिट पर रहती है, जो हजारों snapshot जमा होने से रोकता है।
4. `while true` लूप सत्र मरने पर `tmate` अपने आप फिर से चलाता है, `remain-on-exit on` के साथ ताकि `exit` के बाद भी terminal पहुँच योग्य रहे।
5. tmate द्वारा उत्पन्न SSH URL `host.conf` फाइल में लिखा जाता है, `filesystem` शाखा पर committ किया जाता है, इसलिए job के live log तक कभी पहुँचे बिना GitHub API (`gh api .../contents/host.conf`) से पुनः प्राप्त किया जा सकता है।
6. `periodic_save` दिनचर्या पृष्ठभूमि में हर 5 सेकंड चलती है, अगर `inotifywait` कोई घटना चूक जाए।

परिणाम : पूरा Linux shell, कहीं से भी पहुँच योग्य, सत्रों के बीच बना रहने वाला filesystem के साथ, जबकि अंतर्निहित बुनियादी ढाँचा (GitHub Actions runner) इसके लिए बिल्कुल डिजाइन नहीं किया गया था। एकमात्र असली सीमा प्रति job 6h timeout है : उसके बाद workflow फिर से चलाना होगा।

## 5. बॉट जो अपनी pull request खोलता है

`konosuba-rpg` पर, `dev` शाखा पर push एक job ट्रिगर करता है जो जाँचता है कि `main` की ओर पहले से खुली pull request है या नहीं, और वरना `actions/github-script` और GitHub REST API से अपने आप बनाता है :

```js
const { data: comparison } = await github.rest.repos.compareCommits({
  owner, repo, base: 'main', head: 'dev',
});
if (comparison.ahead_by === 0) return; // प्रस्ताव करने को कुछ नहीं
```

```js
const { data: existing } = await github.rest.pulls.list({
  owner, repo, state: 'open', head: `${owner}:dev`, base: 'main',
});
if (existing.length > 0) return; // पहले से खुली PR है

await github.rest.pulls.create({
  owner, repo, head: 'dev', base: 'main',
  title: 'chore: auto PR from dev to main',
});
```

यहाँ मायने रखने वाला विवरण इस्तेमाल किया token है। यह workflow स्वचालित `GITHUB_TOKEN` इस्तेमाल **नहीं** करता : यह अलग `AUTO_PR_TOKEN` secret माँगता है, और उसके अनुपस्थित होने पर जारी रखने से मना करता है :

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

## 6. बिना किसी secret के npm पर प्रकाशित करना

पाँचों में सबसे विवेकी, लेकिन शायद भविष्य के लिए सबसे महत्वपूर्ण : `typescript-virtual-container` का `publish.yml` workflow **कोई npm secret नहीं** रखता। कोई `NPM_TOKEN` नहीं, कोई `NODE_AUTH_TOKEN` नहीं। बस यह :

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

`npm publish` फिर भी काम करता है, क्योंकि npm रजिस्ट्री अब OIDC से **trusted publishing** समर्थन करती है : workflow अपनी पहचान सीधे रजिस्ट्री को साबित करता है (सटीक repo + workflow, npmjs.org तरफ कॉन्फ़िगर), बिना किसी स्थिर token के कहीं पारगमन या संग्रहित हुए। लीक करने को शून्य secret, हर छह महीने घुमाने को शून्य token।

---

## GitHub secrets, गहराई में

ये पाँच पैटर्न सभी, किसी न किसी तरह, secrets प्रश्न छूते हैं। कुछ सिद्धांत जो मेरे सभी workflow में लौटते हैं :

**secret जरूरी नहीं साधारण स्ट्रिंग हो।** `email-autoreply` में, `ACCOUNTS_JSON` बहु खाता config का पूरा minified JSON रखता है : साधारण API कुंजी के बजाय पूरी डेटा संरचना, runtime पर जैसी है वैसी फाइल में डाली गई :

```yaml
env:
  ACCOUNTS_JSON: ${{ secrets.ACCOUNTS_JSON }}
run: printf "%s" "$ACCOUNTS_JSON" > data/accounts.json
```

यह config फाइल commit करने से बचाता है, चाहे एन्क्रिप्टेड भी हो, और कोड छुए बिना repo सेटिंग में एक क्लिक में अद्यतन होता है।

**`GITHUB_TOKEN` की सटीक सीमाएँ हैं, और यह जानबूझकर है।** स्वचालित token जो GitHub हर run में डालता है शक्तिशाली है, लेकिन कुछ बिंदुओं पर सीलबंद : डिफ़ॉल्ट रूप से, वह दूसरा workflow ट्रिगर नहीं कर सकता, और repo कॉन्फ़िगरेशन के अनुसार वह शाखा सुरक्षा नियमों से रोका जा सकता है। ठीक इसीलिए `create-pull-request.yml` अलग PAT (`AUTO_PR_TOKEN`) माँगता है : token जो असली खाते (या GitHub App) से आता है, स्पष्ट अधिकार `contents:write` + `pull-requests:write` के साथ, job के अल्पकालिक token से अलग।

**अनुमतियाँ job दर job scope होती हैं, वैश्विक नहीं।** यहाँ सूचीबद्ध हर workflow न्यूनतम और टिप्पणित `permissions:` ब्लॉक घोषित करता है :

```yaml
permissions:
  contents: read
  actions: read
  checks: write
  # Only allow writing checks, everything else is read-only
```

सार्वजनिक repo पर डिफ़ॉल्ट `GITHUB_TOKEN` के ऐतिहासिक रूप से काफी व्यापक अधिकार हैं ; उसे स्पष्ट रूप से उतने तक सीमित करना जितना job को सच में चाहिए, नुकसान सीमित करता है अगर शृंखला में कोई तृतीय पक्ष क्रिया (`uses: कोई-एक/action@संस्करण`) समझौता की हुई निकले।

**सबसे अच्छा secret वह है जो मौजूद नहीं है।** `typescript-virtual-container` का OIDC पैटर्न इस विचार का सबसे परिपूर्ण संस्करण है : `NPM_TOKEN` के घूर्णन, समाप्ति और लीक जोखिम प्रबंधित करने के बजाय, workflow अपनी पहचान क्रिप्टोग्राफिक रूप से साबित करता है (यह सटीक repo, यह सटीक workflow) सीधे तृतीय पक्ष सेवा को। AWS, Docker Hub, PyPI के लिए भी वही तर्क उपलब्ध : ज्यादा से ज्यादा रजिस्ट्री और क्लाउड GitHub Actions से OIDC समर्थन करते हैं।

---

**3 मुख्य बिंदु**

1. git टैग (अनाथ, force-push किया हुआ) न्यूनतम डेटाबेस या पूर्व संकलित build cache बन सकता है : एक ही तंत्र के दो अलग उपयोग।
2. मुफ्त GitHub Actions runner स्थायी SSH shell बन सकता है अगर उसके filesystem को git शाखा की ओर लगातार समकालिक करना स्वीकार किया जाए, `inotifywait` से autosave और एक ही संशोधित कमिट के साथ।
3. डिफ़ॉल्ट `GITHUB_TOKEN` जानबूझकर सीमित है : अंतर शाखा PR बनाना या बिना secret प्रकाशित करने के लिए या तो समर्पित PAT चाहिए, या OIDC trusted publishing की ओर जाना।
