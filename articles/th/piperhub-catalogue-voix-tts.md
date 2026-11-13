---
title: >-
  PiperHub: 536 เสียง TTS โอเพนซอร์ส 7 อารมณ์ในโมเดลเดียว ไม่ใช้ GPU ไม่มีบิล
description: >-
  VITS, espeak, ONNX, LJSpeech: Piper ทำให้ Raspberry Pi พูดได้อย่างไร Fortune multi 7 อารมณ์ Kokoro 82M PocketTTS sanoTTS ElevenLabs และ pipertts เนทีฟที่เร็วกว่า wrapper Python 10 เท่า
date: 2026-11-12
tags:
  - tts
  - piper
  - open-source
  - typescript
  - ai
  - catalogue
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "PzdqaRVpUxrTvysd/U96qs7OsQszti9oFZ9JKlq+zrsgilrALj3vbyRdu+VS9FLP9fWDNxcfu9JwLriGzGW51w=="
---

## บทนำ

การทำให้บอท Discord พูดได้มันแพง ไม่ใช่ข้อความ: LLM ในเครื่องสร้างประโยคด้วย GPU แค่ไม่กี่เซนต์ แต่เสียงต้องจ่ายทุกประโยค API สังเคราะห์เสียงคิดเงินตามตัวอักษร และเมื่อบอทพูดทั้งคืน บิลก็ตามมาด้วย

นั่นคือปัญหาที่ผมเจอกับ Luna Protocol บอท Discord ของผมสร้างข้อความด้วย LLM ในเครื่อง แล้วให้เสียง Piper อ่านออกเสียง แปลงเป็น OGG แล้วส่งเป็นข้อความเสียง ทั้งหมดบนเซิร์ฟเวอร์ของผมเอง 0 ยูโรต่อประโยค แม้ตอนตี 3 ที่ Luna ตัดสินใจเล่าชีวิตของตัวเองคนเดียว

การอยู่ที่ 0 ยูโรหมายถึงการหาเสียงฟรีและโฮสต์เอง และตรงนี้แหละที่เรื่องยุ่ง: โมเดลกระจัดกระจายอยู่บน repo Hugging Face หลายสิบแห่ง ไลเซนส์คลุมเครือ ไม่มีทางรู้ว่าเสียงไหนมาจากไหนหรือยังใช้งานได้ไหม ผมเลยสร้าง [PiperHub](https://piperhub.org/) ซึ่งเป็นแค็ตตาล็อกโอเพนซอร์สของเสียงสำหรับ Piper TTS

ตัวเลขวันนี้: **536 โมเดล**ที่แสดง **71 ภาษา**ที่มี **3755 speakers**ที่ลิสต์ไว้ แต่ละโมเดลเชื่อมกับ dataset ต้นฉบับเมื่อเรารู้จัก ที่มาของเสียงเป็นส่วนหนึ่งของเสียง ตามที่หน้าแรกบอก

เหลือคำถามที่คนถามผมบ่อย: Piper สู้ Kokoro, PocketTTS, sanoTTS กับ ElevenLabs ได้แค่ไหน และทำไมโมดูล `pipertts` ของ Fortune ถึงเร็วกว่า wrapper Python ทางการ 10 เท่า บทความนี้เปิดเครื่องยนต์ พร้อมโค้ดเป็นหลักฐาน

## PiperHub แค็ตตาล็อก

ก่อนเปิดเครื่องยนต์ มาดูปัญหาที่ PiperHub แก้กันก่อน

### เสียงมาจากไหน

โค้ดอยู่ที่ [github.com/fox3000foxy/piper-bank](https://github.com/fox3000foxy/piper-bank) Astro เว็บสแตติก ไม่มีเซิร์ฟเวอร์: ภาษาอังกฤษที่ root อีก 15 ภาษาใต้ `/<code>/` (fr, de, es, it, pt, ru, tr, ja, ko, zh, id, hi, ar, vi, th) แพทเทิร์นเดียวกับบล็อกของผมเลย

แหล่งความจริงไม่มีใครแก้ด้วยมือ มันคือ pipeline:

```bash
npm install
npm run data    # สร้าง src/data/*.json ใหม่ (python3 scripts/generate_data.py)
npx astro dev   # dev ในเครื่อง
npm run build   # บิลด์สแตติกลง dist/
```

จริงๆ แล้ว: repo crawler ดูแล `models_mapping.csv` กับ `datasets_mapping.csv` เสียง mirror อยู่บน Hugging Face ตัวอย่างคือไฟล์เสียง `npm run data` ดึงทั้งหมดแล้วคายออกมาเป็น `src/data/*.json` เว็บแค่อ่าน JSON สแตติก

ในข้อมูลดิบตอนนี้ (555 รายการ เว็บแสดง 536 งานครอวล์นำหน้าการแสดงผลนิดหน่อยเสมอ):

| คุณภาพ | โมเดล |
|---|---|
| medium | 437 |
| high | 67 |
| low | 50 |

| Sample rate | โมเดล |
|---|---|
| 22050 Hz | 486 |
| 16000 Hz | 47 |

486 เสียงที่ 22050 Hz มาตรฐาน Piper 47 เสียงที่ 16000 Hz เสียงเล็กเร็วสำหรับงานฝังตัว phonemizer คือ `espeak` ใน 509 เคส เดี๋ยวกลับมา มันคือหัวใจของระบบ

### ที่มา หรือทำไมทุกโมเดลต้องมี dataset

สิ่งที่ทำให้ PiperHub มีประโยชน์แทนที่จะเป็นแค่ลิสต์ คือลิงก์โมเดลกับ dataset ตัวอย่างจากหน้าแรก: เสียง **Astra - Valorant Piper TTS** เชื่อมกับ dataset **Astra - LJSpeech Dataset** เปิดทั้งสองหน้า ตรวจ repo กับไลเซนส์ทั้งสองฝั่ง

130 dataset ที่อ้างอิงไว้ และแค็ตตาล็อกซื่อสัตย์เรื่องสภาพกองทัพ: 25 โมเดลถูกติดธง `usable: false` (ไฟล์พัง หรือฟอร์แมต `piperPlus` ที่ต้องใช้ runtime สาย fork) โมดูล `pipertts` ปฏิเสธเสียงพวกนี้ด้วย error ชัดเจนแทนที่จะแครชแปลกๆ ทีหลัง 48 โมเดลเป็น multi-speaker รวมถึงสองตัวที่เราจะสนใจ

ฝั่งไกด์ เว็บทำงานสามขั้น: **Build a dataset**, **Train a voice**, **Use a voice** บวกหน้า Piper Plus dataset ฟอร์แมต LJSpeech เป็นอินพุต ONNX เป็นเอาต์พุต พูดง่าย ทำยาว เลยต้องมีส่วนถัดไป

## Piper ใต้ฝากระโปรง: VITS, espeak, ONNX

### หนึ่งประโยค สามขั้นตอน

เมื่อคุณขอให้ Piper พูดคำว่า "bonjour" จะเกิดสิ่งนี้:

```
"bonjour"
  -> [phonémisation espeak-ng] -> b O~ Z u R
  -> [encodeur VITS + flow + décodeur] -> waveform 22050 Hz
```

ไม่มี vocoder แยก นั่นคือ VITS: โมเดล end-to-end จากข้อความ (ที่แปลงเป็นเสียงพูดแล้ว) ไป waveform ตรงๆ ในขณะที่ pipeline เก่าทำข้อความแล้ว spectrogram (Tacotron) แล้ว spectrogram แล้วเสียง (HiFi-GAN สองโมเดล สองรอบเทรน) VITS เรียนทุกอย่างทีเดียวด้วย conditional VAE, normalizing flows และ discriminator แบบ GAN บน decoder เทรนครั้งเดียว โมเดลเดียว export ONNX ครั้งเดียว

decoder คาย 22050 Hz ตรงๆ ที่ sample rate นี้ หนึ่งวินาทีของเสียงเท่ากับ 22050 ตัวเลข โมเดลเล็ก (หลักสิบ MB ในคุณภาพ medium) และ inference เป็น CPU ล้วน: คูณเมทริกซ์บนกราฟ ONNX ที่ optimize แล้ว นั่นคือเหตุผลที่ Raspberry Pi เป็นเป้าหมายทางการ Piper เกิดใน Rhasspy ผู้ช่วยเสียงโอเพนซอร์สที่ออกแบบมาให้รันบน Pi

### espeak-ng ตัวแปลงเสียงที่ทำงานสกปรกทั้งหมด

ก่อน VITS ต้องแปลงข้อความเป็น phoneme 509 โมเดลจาก 555 ใช้ `espeak`:

```bash
echo "bonjour" | espeak-ng --ipa -v fr
# bO~'ZuR
```

espeak-ng รู้การออกเสียงหลายสิบภาษา โมเดล VITS ไม่เคยเรียนสะกดฝรั่งเศสที่ `eau` ออกเสียง `o` มันเรียนจาก phoneme ไปเสียง ทำให้เทรนง่ายมาก และอธิบายว่าทำไม Piper ครอบคลุม 71 ภาษา: ภาษาใหม่ก็ต่อเสียง espeak ที่ตรงกันแล้วเทรน

เสียงที่ไม่ใช้ espeak มี phonemizer ของตัวเอง และตรงนี้เริ่มแปลก: `hebrew` (โมเดล Nakdimon ONNX กับกฎ IPA 494 บรรทัด), `pinyin` (BERT g2pW เต็มตัวพร้อมแก้ polyphone อักษรจีนตัวเดียวกันออกเสียงต่างกันตามคำ), `thai` (TLTK จริงไม่ดัดแปลง), `japanese` (ตัดคำ lindera กับ UniDic) โมดูล `pipertts` พกมาทั้งหมด ตรวจแล้วว่าตรงกับ Python อ้างอิง เดี๋ยวกลับมา

### dataset: LJSpeech เสมอ LJSpeech

ฟอร์แมตเทรนมาตรฐานคือ LJSpeech: โฟลเดอร์ `wavs/` เต็มไปด้วยคลิป กับ `metadata.csv`:

```
LJ001-0001|Printing, in the only sense with which we are at present concerned...|printing in the only sense...
LJ001-0002|in being comparatively modern...|in being comparatively modern...
```

`fileid|transcription|normalized` หนึ่งคลิปเท่ากับหนึ่งประโยค ไม่กี่วินาที dataset ต้นฉบับคือประโยคอังกฤษ 13,000 ประโยคอ่านโดยผู้พูดคนเดียว public domain จะเทรนเสียงฝรั่งเศสก็อัดโครงสร้างเดียวกันเป็นฝรั่งเศส: ข้อความกับเสียงที่ align กัน ไม่กี่ชั่วโมงพอสำหรับ medium ที่ใช้ได้ มากกว่านั้นสำหรับ high

สามคุณภาพในแค็ตตาล็อกตรงกับขนาดโมเดลกับระยะเวลาเทรนคร่าวๆ Low: เล็ก เร็ว หุ่นยนต์ Medium: จุดลงตัว มี 437 โมเดล High: ใหญ่กว่า ช้ากว่า ธรรมชาติ กว่า มี 67 โมเดล รวมถึง Fortune

### ปุ่มวิเศษสามปุ่ม

ทุกเสียง Piper มีพารามิเตอร์ inference สามตัว ค่าเริ่มต้นแทบสากล:

```json
"inference": { "noise_scale": 0.667, "length_scale": 1, "noise_w": 0.8 }
```

- `noise_scale` (0.667): ความหลากหลายของเสียง สูงกว่าหมายถึงแสดงอารมณ์มาก ต่ำกว่าหมายถึงนิ่งกว่า เอาต์พุตสุ่ม: สังเคราะห์ประโยคเดียวกันสองครั้งได้เสียงต่างกันเล็กน้อย
- `noise_w` (0.8): ความหลากหลายของจังหวะ
- `length_scale` (1.0): ความเร็ว เกิน 1 ช้าลง ต่ำกว่า 1 เร็วขึ้น วิธีง่ายสุดที่จะทำให้ Luna พูดเร็วขึ้นตอนโมโห

จำ `noise_scale` ไว้ เดี๋ยวใช้กับอารมณ์

## Fortune multi: 7 อารมณ์ 1 ONNX

เอาล่ะ มาดาวเด่นท้องถิ่นกัน

แค็ตตาล็อกลิสต์สามโมเดล Fortune ที่เทรนโดย ItsRealFortune (หวัดดี):

| โมเดล | Repo | เสียง |
|---|---|---|
| ItsRealFortune - French (FR) High | `fox3000foxy/piper-fortune-v6` | 1 (voice-0) |
| ItsRealFortune - French (FR) **Multi** High | `fox3000foxy/piper-checkpoints-fortune-fr-multi` | **7** |
| ItsRealFortune - English (EN) **Multi** High | `fox3000foxy/piper-checkpoints-fortune-en-multi` | **7** |

ตัว FR multi คือแบบนี้:

```
normal, joyeuse, storytelling, colere, triste, surprise, interrogative
```

เจ็ดอารมณ์ใน**ไฟล์ ONNX เดียว** ตัว EN multi เหมือนกัน มี typo ประวัติศาสตร์ในชื่อ: `suprised` แทน `surprised` มันอยู่ใน weight เราเก็บไว้ เป็นส่วนหนึ่งของตำนาน

### speakerId ทำงานอย่างไร

VITS multi-speaker คือโมเดลเดียวกันที่มีอินพุตเพิ่ม: speaker embedding ตอนเทรน แต่ละคลิปแท็กสไตล์ โมเดลเรียนตาราง embedding (สไตล์ละหนึ่ง) พร้อมส่วนที่เหลือ ตอน inference เลือกแถวของตาราง:

```ts
import { PiperNativeTTS } from "pipertts";

const tts = await PiperNativeTTS.load({
  model: "hub:itsrealfortune-french-fr-multi-high",
  modelsDir: "./models",
});

const styles = [
  "normal", "joyeuse", "storytelling",
  "colere", "triste", "surprise", "interrogative",
];

for (let i = 0; i < styles.length; i++) {
  const r = await tts.synthesize("Quelle merveilleuse nouvelle !", {
    speakerId: i,           // 0 = ปกติ ... 5 = ประหลาดใจ
    outputFile: `./fortune-${styles[i]}.wav`,
  });
}
```

ประโยคเดียว อ่านเจ็ดแบบ `speakerId: 5` (surprise) กับ `noise_scale` ที่ดันขึ้นนิดหน่อย ได้อุทานที่น่าเชื่อ `speakerId: 4` (triste) กับ `length_scale: 1.1` ให้ช้าลง ได้ประกาศงานศพ นี่คือวิธีที่ Luna ปรับเสียง: สมองเลือกอารมณ์ (valence/arousal ดูบทความ centroids ของผม) TTS เลือก speakerId

dataset เบื้องหลังชื่อเรียบๆ ว่า **Fortune French - Dataset** กับไลเซนส์ชื่อ "Fortune's Café" ใช่ ไลเซนส์ชื่อเหมือนคาเฟ่ ไม่ มันอยู่ต่อ

### ทำไมมันฉลาดเชิงเศรษฐศาสตร์

เจ็ดอารมณ์หมายถึงดาวน์โหลดครั้งเดียว โหลดเข้า RAM ครั้งเดียว session ONNX เดียว ทางเลือก (เจ็ดโมเดลแยก) คูณพื้นที่เก็บข้อมูลและบังคับ reload กราฟทุกครั้งที่เปลี่ยนอารมณ์ ใช้ไม่ได้กับบอทที่เปลี่ยนโทนกลางประโยค ตรงนี้ `speakerId` แค่ index ใน tensor ต้นทุนเพิ่ม: ศูนย์

## คู่แข่ง: Kokoro, PocketTTS, sanoTTS

Piper แบ่ง CPU กับคู่แข่งจริงจังสามราย สามปรัชญาต่างกัน

### Kokoro 82M ราชาคุณภาพต่อราคา

[Kokoro](https://huggingface.co/hexgrad/Kokoro-82M) โดย hexgrad 82 ล้านพารามิเตอร์ สถาปัตย์ StyleTTS 2 ดัดแปลงพร้อม decoder ISTFTNet **ไม่มีขั้น diffusion** การไม่มี diffusion คือทุกอย่าง: ไม่มีลูป denoise ซ้ำ inference เร็วสุดๆ

| | Kokoro-82M |
|---|---|
| Params | 82M |
| Poids | ~300 Mo (164 Mo en FP16) |
| Licence | Apache 2.0 (commercial OK) |
| Langues | 8, 54 voix preset + blending |
| CPU | quasi temps réel |
| GPU | 36 à 96x temps réel |
| Tests aveugles | au niveau de Google et Amazon |

เทรนด้วยเสียงไม่ถึง 100 ชั่วโมงราคาแค่ประมาณ 1000 ดอลลาร์ และผู้ฟัง blind test จัดให้อยู่ระดับเสียงพรีเมียมของ Google กับ Amazon นั่นคือเหตุผลที่มันระเบิด: คุณภาพพรีเมียม ฟรี ในเครื่อง permissive

เจอ Piper: Kokoro ชนะเรื่องธรรมชาติล้วนๆ (StyleTTS 2 ดีกว่า VITS ตัวเล็ก) กับไลเซนส์ (Apache 2.0 เทียบกับเอนจิน GPL-3.0 ของ Piper) Piper ชนะเรื่องครอบคลุม (71 ภาษาเทียบ 8, 3755 speakers เทียบ 54 เสียง) กับระบบนิเวศเสียงชุมชน งานบรรยายอังกฤษ Kokoro เอาชนะยาก งานฝรั่งเศส 7 อารมณ์ ตุรกี หรือสวาฮิลี Piper มักเป็นตัวเดียวในสนาม

### PocketTTS (Kyutai) โคลนเสียงบน CPU

[Kyutai](https://kyutai.org/tts/) เล่นอีกเพลง: โมเดลเล็ก**พร้อมโคลนเสียง** รันบน CPU

| โมเดล | พารามิเตอร์ | WER | UTMOS | SIM | ความเร็ว CPU (1 thread) |
|---|---|---|---|---|---|
| Pocket TTS | ~100M | 0.92% | 4.364 | 0.923 | 2.8x temps réel |
| Pocket TTS small | 1.9M / 6.9M / 18.2M | - | - | - | CPU, clonage inclus |

WER ต่ำกว่า 1% (ออกเสียงถูก) UTMOS 4.36 (คุณภาพที่รู้สึกว่ายอดเยี่ยม) SIM 0.923 (โคลนเหมือนเป้าหมายจริง) และรุ่น small ลงถึง **1.9M พารามิเตอร์**พร้อมโคลน 1.9M เราเตอร์ Sabaki ของผมขนาด JSON เกือบเท่านี้

เจอ Piper: PocketTTS ชนะเรื่องโคลน (Piper อ่านด้วยเสียงตายตัว) กับความกะทัดรัดของ flagship Piper ชนะเรื่องภาษา (ตัว small ตอนนี้อังกฤษอย่างเดียว) กับความสุกของระบบนิเวศ (536 เสียงพร้อมใช้เทียบกับ "เทรนของตัวเอง")

### sanoTTS โมเดลที่อยู่บนชิป 3 ดอลลาร์

[sanoTTS](https://github.com/ampixa/sanoTTS) (`sano` แปลว่า "เล็ก" ในภาษาเนปาล) คือ Bareiron ของ TTS: stack neural ทั้งชุดจาก phoneme ไป PCM 22.05 kHz **บนไมโครคอนโทรลเลอร์**

| ระบบ | พารามิเตอร์ | SCOREQ | UTMOS | DNS-SIG |
|---|---|---|---|---|
| sanoTTS (heart-nano) | 0.29M | 2.29 | 2.45 | 3.35 |
| TinyTTS | 1.62M | 3.94 | 3.65 | 3.62 |

0.29M พารามิเตอร์ เสียง 2 MB `pip install sanotts` แล้ว `sanotts say "Hello" --voice amy` มันพูด ในเบราว์เซอร์ด้วย

แต่ดูคะแนน: SCOREQ 2.29 เทียบกับ 3.94 ของ TinyTTS UTMOS 2.45 พูดได้ ใช่ ร้องเพลง ไม่ มันคือ tradeoff สุดขั้ว: ที่ 0.29M อยู่ได้ทุกที่แต่คุณภาพตามขนาด Piper medium หนักกว่า 100 เท่าเพื่อเสียงคนละลีก

### ตารางสรุป

| | Piper | Kokoro 82M | PocketTTS | sanoTTS |
|---|---|---|---|---|
| Params typiques | ~10-60M | 82M | ~100M / 2-18M | 0.3-1.4M |
| Langues | 71 | 8 | EN (+ smalls EN) | multilingue, petit |
| Voix dispos | 3755 speakers | 54 + blending | clonage (la tienne) | quelques voix |
| Clonage | non | non (natif) | **oui, CPU** | non |
| Licence moteur | GPL-3.0 | Apache 2.0 | open (Kyutai) | open |
| Entraînable maison | oui (LJSpeech) | oui (plus lourd) | oui | oui |
| Qualité FR | bonne (multi émotions) | correcte (EN-first) | EN-only | faible |

ตัวเลือกขึ้นกับข้อจำกัด ไม่มีผู้ชนะสัมบูรณ์: คุณภาพ EN ล้วนไป Kokoro โคลนบน CPU ไป PocketTTS ไมโครคอนโทรลเลอร์ไป sanoTTS ครอบคลุมภาษากับเสียงฝรั่งเศสมีอารมณ์กับศูนย์ infra ไป Piper

## ElevenLabs ยักษ์ที่เก็บเงิน

แล้วก็มี ElevenLabs 70 กว่าภาษา Eleven v3 แสดงอารมณ์พร้อม audio tag กับบทสนทนาดราม่า คุณภาพ top ของ blind test เป็น Jev ของ TTS ประมาณนั้น: ทุกคนเคยเห็น ทุกคนเคยเทียบ

ราคา 2026 ตัวเลขกลมๆ:

| โมเดล API | ราคา / 1000 ตัวอักษร |
|---|---|
| Flash / Turbo, v3 Conversational | $0.05 |
| Multilingual v2, Eleven v3 | $0.10 |

1000 ตัวอักษรได้เสียงประมาณ 1 นาที ดังนั้นนาทีละ $0.05 ถึง $0.10 แผน Pro $99 รวมประมาณ 990k ตัวอักษร overage คิดอัตราเดียวกัน สำหรับช่อง YouTube ที่ออกวิดีโอพากย์เสียงวันละคลิป (ผมทำแบบนั้นกับ `valorant-short-maker` แต่ใช้ Piper ฟรี) นับ $1.50 ถึง $3 ต่อเดือนสำหรับทุกนาทีพากย์รายวัน วันละสิบนาที: $15 ถึง $30 ต่อเดือน จ่ายได้ แต่นับ

เมื่อไหร่คุ้ม: เมื่อเสียง**คือ**สินค้า (พากย์ หนังสือเสียง โฆษณา) เมื่อต้องได้ 70 ภาษาพรุ่งนี้เช้า เมื่อโคลนต้องเป๊ะตั้งแต่ครั้งแรก แต่ไม่คุ้มเลยสำหรับ: บอท Discord ที่พูดทั้งคืน notification ภายใน dev ปริมาณระเบิด Luna เล่าชีวิตตอนตี 3 บน ElevenLabs คือบิลไฟผมร้องไห้

คณิตง่าย: Piper เท่ากับ 0 ยูโรเพิ่ม คุณภาพ "ดี" ElevenLabs เท่ากับมิเตอร์วิ่ง คุณภาพ "ยอดเยี่ยม" ระหว่างกันมีโลกที่ "ดีและฟรี" ชนะ นั่นคือเดิมพันทั้งหมดของ PiperHub

## pipertts: ทำไมเนทีฟเร็วกว่า wrapper Python 10 เท่า

repo [itsrealfortune/pipertts](https://github.com/itsrealfortune/pipertts) 75 commit: พอร์ต Piper เนทีฟเป็น TypeScript ชื่อ README: "In-process Piper TTS for Node.js. No Python required."

### ต้นทุนของ spawn

wrapper ดั้งเดิม (`PiperTTS`) คือ `python3 -m piper` ที่ spawn เป็น sub-process **ทุกครั้งที่สังเคราะห์**:

```
synthèse = spawn(python) + chargement du modèle + inférence + kill
```

ทุกประโยคจ่ายค่าสตาร์ท interpreter กับโหลด weight วัดบน `en_US-lessac-medium`: **ประมาณ 2.2 วินาทีต่อบรรทัด**

เนทีฟ (`PiperNativeTTS`) เก็บ session ONNX **อุ่นในหน่วยความจำ**:

```
load une fois -> session persistante -> inférence par phrase
```

วัดแบบเดียวกัน: **ประมาณ 0.22 วินาทีต่อบรรทัด** 10 เท่ามาจากตรงนี้: ฆ่า spawn กับ reload ส่วน inference มหัศจรรย์ไม่เกี่ยวตรงนี้ inference ONNX เองเหมือนกันทั้งสองฝั่ง

เป็นโบนัส load ครั้งแรก cache กราฟที่ optimize ไว้ข้าง `.onnx` (`<model>.ortopt-<platform>-<arch>-v<ort>.onnx`) ทำให้ load ครั้งต่อไปเร็วขึ้นประมาณ 35% คีย์ cache รวม platform, arch กับเวอร์ชัน ORT และ refresh ถ้าโมเดลเปลี่ยน ปิดได้ด้วย `cacheOptimizedModel: false`

### สะพาน espeak: 0.4ms เทียบ 15ms

ตรรกะเดียวกันสำหรับ phonemization wrapper เรียกไบนารี `espeak-ng` ผ่าน CLI ทุกประโยค: spawn ประมาณ 15ms ทุกครั้ง เนทีฟฝัง bridge N-API (`src/native/espeak-bridge/` พอร์ตจาก `espeakbridge.c`) พร้อม prebuild สำหรับ Linux x64/arm64: **ประมาณ 0.4ms ต่อครั้ง** phoneme ตรงระดับ byte ไม่มี addon ถอยอัตโนมัติไป CLI `PIPER_ESPEAK_BRIDGE=0` เพื่อบังคับ CLI

### phoneme_type ทั้ง 7 พอร์ตหมดแล้ว

| ชนิด | เอนจิน | หมายเหตุ |
|---|---|---|
| `espeak` | bridge N-API ou CLI | clauses byte-identiques |
| `text` | passthrough codepoints | trivial |
| `hebrew` | Nakdimon ONNX + règles IPA | sorties identiques |
| `lithuanian` | espeak + dico de stress 189k entrées | sorties identiques |
| `pinyin` | BERT g2pW ONNX + WordPiece | désambiguïsation des polyphones OK |
| `thai` | vrai TLTK non modifié sous Pyodide/WASM | 7/7 identiques (1er appel lent, suite rapide) |
| `japanese` | lindera-wasm + UniDic + moteur de mores TS | segmentation exacte, **pas d'accent lexical** |

และภาษาอาหรับใส่สระอัตโนมัติ (tashkeel ปิดได้) 509 เสียง espeak ในแค็ตตาล็อกผ่าน bridge เร็ว ตัวแปลกผ่านเอนจินเฉพาะ 71 เทสต์ในชุด ข้อจำกัดเอกสารไว้ตรงที่ติด (สำเนียงญี่ปุ่น UniDic ไม่ให้ข้อมูลมา ยอมรับ ไม่มีซ่อน)

### ฟอร์แมตกับ streaming

`wav` ค่าเริ่มต้น `raw` PCM `mp3` `ogg` `opus`: ใช้ ffmpeg เมื่อมี ไม่งั้น fallback JS ล้วน (lamejs สำหรับ mp3, opusscript กับ Ogg muxer สำหรับ opus สหสัมพันธ์ 0.993 กับต้นฉบับ) และสำคัญสุด `synthesizeChunks()`: async generator ที่ yield ทีละประโยค มี `sentenceSilence` ระหว่างประโยค สำหรับ Luna หมายถึงเริ่มเล่นเสียงขณะที่ตอนท้ายกำลังสังเคราะห์ สตรีม TTS โดยไม่ต้องมีเซิร์ฟเวอร์เฉพาะ

การใช้งานเต็ม พร้อมแค็ตตาล็อก PiperHub ในตัว (`hub:` กับ mirror fallback อัตโนมัติถ้า repo ผู้แต่งเลิกเสิร์ฟไฟล์):

```ts
const tts = await PiperNativeTTS.load({
  model: "hub:glados-french-medium-voice",
  modelsDir: "./models",
});

const r = await tts.synthesize("Bonjour, je suis GLaDOS.", {
  outputFormat: "ogg",   // ตรงสำหรับ Discord
  lengthScale: 0.95,     // เร็วขึ้นนิด
});
```

เสียงชุมชน (GLaDOS กับตัวละครเกม) ไม่อยู่ใน manifest ทางการ นั่นคือเหตุผลที่ PiperHub มีอยู่พอดี และ `pipertts` รู้ดี: `hub:<slug>` URL หน้า piperhub หรือ slug เปล่า ใช้ได้หมด เสียงที่ติดธง `usable: false` ถูกปฏิเสธด้วย error ชัดเจน

## สิ่งที่สละไป

ทุกฟีเจอร์ที่หายไปจ่ายให้อีกอัน รายการซื่อสัตย์:

**Piper ฟังดูหุ่นยนต์ข้าง ElevenLabs** VITS medium บน 22050 Hz สะอาดแต่แบนเทียบกับโมเดลใหญ่แสดงอารมณ์ multi-emotion ชดเชยบางส่วน (7 สไตล์ดีกว่า 1 สไตล์แบน) แต่หนังสือเสียง ElevenLabs v3 ยังเหนือกว่า นั่นคือราคาของหลักสิบ MB

**espeak ผิด** ชื่อเฉพาะ คำยืม ตัวย่อ: phonemization ด้วยกฎมีจุดบอด "Spoiler" ในภาษาฝรั่งเศส espeak อ่านเท่าที่ทำได้ โมเดลใหญ่ที่มี G2P neural พลาดน้อยกว่า ใน prod ต้องมีพจนานุกรมข้อยกเว้นสำหรับศัพท์งาน

**โคลนเนทีฟศูนย์** Piper อ่านด้วยเสียงตายตัว ถ้าอยากได้เสียงตัวเอง ไป PocketTTS หรือ ElevenLabs multi-speaker ให้ความหลากหลาย ไม่เคยให้ timbre ของคุณ

**ญี่ปุ่นยังไม่มี lexical accent** UniDic ไม่ให้ข้อมูล accent การตัดคำถูกต้องแต่ทำนองประมาณ เอกสารไว้ใน README ไม่มีหมก

**ไทยช้าครั้งแรก** TLTK รันใต้ Pyodide/WASM ไม่ดัดแปลง: ครั้งแรกใช้เวลาหลายวินาที (โหลด) ครั้งต่อไปเร็ว 7/7 ตรงกับอ้างอิง แต่เผื่อ warm-up

**ข้อมูลหิว** เสียง high ที่ดีต้องใช้เสียงสะอาด align กันหลายชั่วโมง dataset Fortune คือชั่วโมงอัดกับทำความสะอาด ศูนย์เวทมนตร์: garbage in, robot out

**แค็ตตาล็อกมีเสียงตาย** 25 โมเดลติดธง `usable: false` ยอมรับและกรองแล้ว แต่เตือนว่าการคราวด์ซอร์สเสียงก็คือคราวด์ซอร์สการทิ้งด้วย

## ผลลัพธ์สุดท้าย

ฝั่งหนึ่งมิเตอร์ ElevenLabs อีกฝั่ง Raspberry Pi:

- PiperHub: 536 โมเดลที่แสดง 71 ภาษา 3755 speakers 130 dataset ที่เชื่อม ไกด์ dataset แล้ว training แล้ว usage
- Piper: VITS end-to-end, espeak, ONNX บน CPU, LJSpeech, low/medium/high, มาตรฐาน 22050 Hz
- Fortune multi: 7 อารมณ์ FR กับ 7 EN, อย่างละ 1 ONNX, `speakerId` สำหรับสลับ, ไลเซนส์ "Fortune's Café"
- Kokoro 82M: คุณภาพพรีเมียม EN, Apache 2.0, 54 เสียง, เกือบ real time บน CPU
- PocketTTS: โคลนบน CPU, ประมาณ 100M แล้ว 2-18M, WER 0.92%
- sanoTTS: 0.29M, 2 MB, ไมโครคอนโทรลเลอร์, คุณภาพตามขนาด
- ElevenLabs: $0.05-0.10/1000 ตัวอักษร, 70 กว่าภาษา, คุณภาพ top, มิเตอร์วิ่ง
- pipertts เนทีฟ: ประมาณ 0.22 วินาทีต่อบรรทัดเทียบกับ wrapper ประมาณ 2.2 วินาที, bridge espeak 0.4ms, phoneme_type 7 แบบ, wav/raw/mp3/ogg/opus, สตรีมทีละประโยค

Luna พูดด้วยสิ่งนี้ทุกวัน TTS 0 ยูโร อารมณ์ขับโดยสมอง OGG ตรงสำหรับ Discord เจอ ElevenLabs ได้ยินความต่าง แน่นอน แต่ตอนตี 3 ที่เธอตัดสินใจเล่าชีวิต บิลของผมนอนหลับสนิท

## ปรัชญา

p2r3 พูดว่า: *"J'aime juste l'idée que cette toute petite puce à 1 balles puisse faire tourner quelque chose d'aussi avancé que Minecraft."*

ฟีลเดียวกันตรงนี้ ใช้กับเสียง: ผมชอบไอเดียที่ ONNX หลักสิบ MB ทำให้ Raspberry Pi พูด 71 ภาษา โดยไม่มีคลาวด์ ไม่มีบัญชี ไม่มีมิเตอร์ มันแทนสตูดิโอพากย์ไม่ได้แน่นอน แต่มันแทนเคสน่ารำคาญที่อยากได้เสียงที่ใช้ได้ ในเครื่อง ฟรี พูดกลางคืนโดยไม่เก็บเงิน

tradeoff เขียนขาวดำ:
- คุณภาพพรีเมียมแลก VITS เล็ก: หุ่นยนต์นิดหน่อย แต่ในเครื่องและฟรี
- โมเดลละอารมณ์แลก speakerId: 7 เสียงในราคาเดียวใน RAM
- spawn Python แลก session ค้าง: เร็วขึ้น 10 เท่า ไม่ต้องติดตั้ง Python
- แค็ตตาล็อกป่าแลกที่มาผูก: ทุกเสียงรู้ว่ามาจากไหนและยังใช้ได้ไหม
- API เก็บเงินแลก 0 ยูโรเพิ่ม: สวยน้อยกว่า ElevenLabs แต่บิลนอนหลับสนิท

**3 อย่างที่ต้องจำ:**

1. **Piper คือ TTS ของ CPU** คือ VITS กับ espeak กับ ONNX 71 ภาษา เสียงหลักสิบ MB ที่รันบน Pi สวยน้อยกว่า ElevenLabs ถูกกว่าไม่รู้กี่เท่า
2. **Fortune multi คือ 7 อารมณ์ในราคาหนึ่ง** คือ ONNX เดียว `speakerId` สำหรับสลับ FR กับ EN speaker embedding แทน 7 โมเดล
3. **เนทีฟฆ่า spawn** `pipertts` เก็บ session ONNX อุ่นไว้: 0.22 วินาทีต่อบรรทัดเทียบกับ 2.2 วินาที bridge espeak 0.4ms เทียบกับ CLI 15ms inference เดียวกัน รอน้อยลง 10 เท่า

ถ้าโปรเจกต์น่าสนใจ แค็ตตาล็อกคือ [piperhub.org](https://piperhub.org/) โค้ดเว็บ [github.com/fox3000foxy/piper-bank](https://github.com/fox3000foxy/piper-bank) โมดูลเนทีฟ [github.com/itsrealfortune/pipertts](https://github.com/itsrealfortune/pipertts) และถ้าอยากฟัง Luna เล่าชีวิตตอนตี 3 อยู่บน Discord xD
