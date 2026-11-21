---
title: SSH हस्ताक्षर स्क्रिप्ट समझाई गई
description: SSH कमिट हस्ताक्षर हेल्पर की चीड़फाड़ और मैं स्टाइलिश कमिट क्यों चाहता था।
date: 2026-03-08
aiGenerated: true
tags:
  - git
  - security
  - shell
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "X3CSsuIomje54m2xOnfvNQhKqsw5V3bZY8WT0irWZwoZLChspJrlEW4xxgaA1LPEhrRDMohBafKREd2yKlI6Gg=="
---

# कमिट के लिए SSH हस्ताक्षर स्क्रिप्ट, व्याख्या

यह लेख `setup-ssh-signing.sh` स्क्रिप्ट की चीड़फाड़ करता है जिसे मैंने [Gist](https://gist.github.com/fox3000foxy/95500d129cd4bf5c173c323d2492569a) पर प्रकाशित किया। हम देखेंगे कि हर हिस्सा क्या करता है, यह किसी रिपॉजिटरी के स्थानीय SSH हस्ताक्षर को पूरी तरह सहज कैसे बनाता है, और, हाँ, मैंने इसे लिखने की जहमत क्यों उठाई (स्पॉइलर : मैं बस यही चाहता था कि मेरे कमिट में **शान** हो)।

## प्रेरणा

मुझे हमेशा अपने Git वर्कफ़्लो से छेड़छाड़ पसंद रही है, और अपने कमिट के बगल में छोटे "Verified" बैज वाले लोगों को देखकर मैंने सोचा : मैं क्यों नहीं ? अंतर्निहित GPG हस्ताक्षर भारी और वैश्विक है, इसलिए मैंने एक छोटा हेल्पर लिखा जो :

- हस्ताक्षर के लिए समर्पित SSH कुंजी बनाता है,
- सिर्फ वर्तमान रिपॉजिटरी कॉन्फ़िगर करता है,
- पुराने कमिट हस्ताक्षर करने के लिए इतिहास संभवतः फिर से लिखता है,
- और मशीनों के बीच कुंजी ले जाने देता है।

सच कहूँ तो जरूरत ज्यादातर दिखावे की थी। मेरे निजी प्रोजेक्ट कोई हस्ताक्षर आवश्यकता नहीं थोपते, लेकिन किसी कमिट पर हरा "Verified" बैज देखना अपना असर करता है, और इस स्क्रिप्ट को शेल में लिखने में मुझे सच में मजा आया।

> खैर, अपने कमिट हस्ताक्षर करना कोड रिव्यू के लिए चमड़े की जैकेट पहनने जैसा है, पूरी तरह बेकार, लेकिन तुम्हें हैकर जैसा महसूस कराता है।

## स्क्रिप्ट क्या करती है

स्क्रिप्ट ऊपर `set -euo pipefail` वाली एक Bash फाइल है ताकि पहली त्रुटि पर निष्पादन रुक जाए। यह इसका सारांश है :

1. **हस्ताक्षर कुंजी बनाना या आयात करना**
   कुंजियाँ उस फोल्डर में `.git-signing/` में उतरती हैं जहाँ तुम स्क्रिप्ट चलाते हो।
2. **Git को स्थानीय रूप से कॉन्फ़िगर करना**
   यह `gpg.format=ssh`, `user.signingkey`, `commit.gpgsign=true`, `tag.gpgSign=true`, और एक `allowedSignersFile` सेट करता है जो सार्वजनिक कुंजी की ओर इशारा करता है।
3. **मशीनों के बीच कुंजियाँ प्रबंधित करना**
   `--export-keys` / `--import-keys` के माध्यम से, तुम वैश्विक कॉन्फ़िग छुए बिना अपनी निजी कुंजी एक कंप्यूटर से दूसरे में स्थानांतरित कर सकते हो।
4. **वैकल्पिक इतिहास पुनर्लेखन** (`--resign-all`)
   सभी शाखाओं/टैग के सभी कमिट फिर से लिखता है (या फोर्क के लिए सिर्फ वे जो `upstream` में नहीं हैं) और `-S` से उन्हें फिर से हस्ताक्षर करता है, अन्य लेखकों को छुए बिना।
5. **उपयोगी ध्वज**
   गैर इंटरैक्टिव मोड के लिए `--autostash`, `--autopush`, `--commit-date`, `--yes`, आदि।
6. **फोर्क पहचान और सुरक्षा जाँच**
   यह `upstream` रिमोट पहचानता है, इतिहास फिर से लिखने से पहले चेतावनी देता है, आवश्यक उपकरण जाँचता है (`git`, `ssh-keygen`, `zip/unzip`), सही अनुमतियाँ सुनिश्चित करता है, और अगर फाइलसिस्टम अनुमतियाँ बहुत अनुमतिशील हों तो कुंजी की सुरक्षित प्रति भी बनाता है।

स्क्रिप्ट idempotent है : इसे दो बार चलाने से तुम्हारी कुंजी फिर से नहीं बनती और मौजूदा कॉन्फ़िग नहीं मिटती।

## चरण दर चरण ब्योरा

कोड के कुछ मुख्य अंश उनकी व्याख्या के साथ यहाँ हैं।

```bash
#!/usr/bin/env bash
set -euo pipefail

# Configure SSH commit signing in a controlled, repo-local way.
# - Key files are created in the directory where this script is launched.
# - Git config is written locally to the current repository only.
```

हेडर सुरक्षा तय करता है और उद्देश्य प्रलेखित करता है। अगला टुकड़ा `while [[ $# -gt 0 ]]; do case … esac done` लूप के साथ CLI विकल्प (`--name`, `--email`, `--repo`, आदि) पार्स करता है। अनिवार्य पहचान फ़ील्ड बाद में जाँचे जाते हैं :

```bash
if [[ -z "$NAME" || -z "$EMAIL" ]]; then
  echo "Error: missing identity. Provide --name and --email." >&2
  exit 1
fi
```

कुंजी पीढ़ी `$LAUNCH_DIR/.git-signing` में होती है। अगर कुंजी पहले से मौजूद है, तो स्क्रिप्ट उसे जैसी है वैसी रखती है ; `--import-keys` फोल्डर को ZIP से भरने देता है।

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

निजी कुंजी उपयोग योग्य है यह जाँचने के बाद (`ssh-keygen -Y sign …`), स्क्रिप्ट सार्वजनिक कुंजी वाली `allowed_signers` फाइल लिखती है और स्थानीय Git कॉन्फ़िग सेट करती है :

```bash
git -C "$REPO_DIR" config --local gpg.format ssh
git -C "$REPO_DIR" config --local user.signingkey "$RUNTIME_KEY_PATH"
git -C "$REPO_DIR" config --local gpg.ssh.allowedSignersFile "$ALLOWED_SIGNERS"
git -C "$REPO_DIR" config --local commit.gpgsign true
git -C "$REPO_DIR" config --local tag.gpgSign true
```

अगर तुम `--resign-all` से इतिहास पुनर्लेखन माँगते हो, तो स्क्रिप्ट `git filter-branch` कमांड बनाती है जो योग्य कमिट `-S` से फिर से हस्ताक्षर करती है। यह फोर्क की स्थिति का सम्मान करती है, `upstream` में पहले से मौजूद कमिट वैकल्पिक रूप से छोड़कर।

अंतिम परिणाम सार्वजनिक कुंजी और इसे GitHub के **Signing Key** खंड में जोड़ने के निर्देश दिखाता है, परीक्षण विधि के साथ।

## अपने कमिट हस्ताक्षर क्यों करें ?

यह वह पल है जब मैं मानता हूँ कि मुझे इसकी जरूरत नहीं थी। मेरे रिपॉजिटरी मैं जो प्रकाशित करता हूँ उसके लिए कोई उद्गम नहीं माँगते, और मैं रिलीज के लिए हस्ताक्षरित टैग इस्तेमाल नहीं करता। "क्यों" यह है :

- क्योंकि मैं कर सकता था,
- क्योंकि यह अच्छा लगता है (बैज देखा ?),
- क्योंकि इसने मुझे `git filter-branch` और शेल से प्रयोग करने का बहाना दिया,
- और क्योंकि यह ब्लॉग के लिए एक और "मैंने यह खुद बनाया" है।

संक्षेप में, यह सिर्फ दिखावे के लिए था, लेकिन अपने उपकरणों से छेड़छाड़ में मुझे यही पसंद है।

## उपयोग उदाहरण

```bash
# configuration initiale dans le dépôt courant
chmod +x ./setup-ssh-signing.sh
./setup-ssh-signing.sh --name "Your Name" \
                       --email "you@example.com"

# exporter les clés pour une autre machine
./setup-ssh-signing.sh --export-keys ./my-signing-keys.zip

# importer les clés sur une deuxième machine
./setup-ssh-signing.sh --import-keys ./my-signing-keys.zip --repo ./my-repo \
                       --name "Your Name" --email "you@example.com"

# réécrire l'historique et pousser
./setup-ssh-signing.sh --repo ./my-repo --name "Your Name" --email "you@example.com" \
                       --resign-all --autostash --autopush --yes
```

## अंतिम विचार

यह स्क्रिप्ट एक संक्षिप्त उपयोगिता है, लेकिन यह कुछ सिद्धांत रखती है जिन्हें मैं अपनाता हूँ :

- क्रिप्टोग्राफिक कुंजियाँ स्थानीय और प्रति रिपॉजिटरी रखना,
- जब तक तुम माँगो वैश्विक कॉन्फ़िग कभी नहीं छूना,
- सरल आयात/निर्यात और इतिहास पुनर्लेखन देना,
- और पुनः प्रयोज्य निशान रखने के लिए पूरी प्रक्रिया ब्लॉग लेख में प्रलेखित करना।

अगर तुम्हें अपने कमिट में हस्ताक्षर जोड़ने का मन करे, तो इसे आजमाओ ! और अगर तुम सिर्फ स्टाइल के लिए यहाँ हो, तो भी वही। 😎
