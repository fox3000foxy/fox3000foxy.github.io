---
title: "PiperHub: 536 giọng TTS mã nguồn mở, 7 cảm xúc trong một model, không GPU, không hóa đơn"
description: "VITS, espeak, ONNX, LJSpeech: cách Piper làm cho Raspberry Pi biết nói. Fortune multi với 7 cảm xúc, Kokoro 82M, PocketTTS, sanoTTS, ElevenLabs - và pipertts native nhanh gấp 10 lần wrapper Python."
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
author_sig: "Zjb4tls1hp38J3cbd/gLh/lVz8hjtLYe1NMqgyGe85H4qPtVAnJQ2Nm5XtRt9I95CSQd3oHx26/VDq3UrStmzQ=="
---

## Giới thiệu

Cho một bot Discord biết nói, tốn kém lắm. Không phải phần text: một LLM local sinh câu chỉ tốn vài xu GPU. Còn giọng nói thì tính tiền theo từng câu. Các API tổng hợp giọng nói tính theo ký tự, và khi bot nói suốt đêm, hóa đơn chạy theo.

Đó là vấn đề mình gặp với Luna Protocol. Bot Discord của mình sinh tin nhắn bằng LLM local, rồi đọc to bằng giọng Piper, convert sang OGG, và gửi đi dưới dạng tin nhắn thoại. Tất cả chạy trên server của chính mình, với giá 0 euro mỗi câu, ngay cả lúc 3h sáng khi Luna tự quyết định kể chuyện đời mình.

Muốn giữ mức 0 euro, bạn phải tìm giọng miễn phí và tự host. Và chỗ này bắt đầu rắc rối: các model nằm rải rác trên hàng chục repo Hugging Face, license mập mờ, không có cách nào biết giọng kia đến từ đâu hay còn chạy được không. Nên mình đã build [PiperHub](https://piperhub.org/), một catalog mã nguồn mở cho giọng Piper TTS.

Số liệu hôm nay: **536 model** hiển thị, **71 ngôn ngữ** được đại diện, **3755 speaker** được liệt kê. Mỗi model được gắn với dataset gốc khi mình biết rõ, nguồn gốc là một phần của âm thanh, như trang chủ vẫn nói.

Còn một câu hỏi người ta hay hỏi mình: Piper so với Kokoro, PocketTTS, sanoTTS và ElevenLabs thì sao? Và vì sao module `pipertts` của Fortune nhanh gấp 10 lần wrapper Python chính thức? Bài này sẽ mở máy ra cho bạn xem, kèm code làm bằng chứng.

## PiperHub, catalog

Trước khi mở máy, hãy nhìn vào vấn đề mà PiperHub giải quyết.

### Giọng đến từ đâu

Code nằm ở [github.com/fox3000foxy/piper-bank](https://github.com/fox3000foxy/piper-bank). Astro, site tĩnh, không server: tiếng Anh ở root, 15 locale khác dưới `/<code>/` (fr, de, es, it, pt, ru, tr, ja, ko, zh, id, hi, ar, vi, th). Thật ra cùng pattern như blog của mình.

Nguồn sự thật, không ai sửa bằng tay. Nó là một pipeline:

```bash
npm install
npm run data    # tạo lại src/data/*.json (python3 scripts/generate_data.py)
npx astro dev   # dev local
npm run build   # build tĩnh vào dist/
```

Cụ thể: một repo crawler duy trì `models_mapping.csv` và `datasets_mapping.csv`, các giọng mirror sống trên Hugging Face, sample là file audio. `npm run data` kéo tất cả về và nhả ra `src/data/*.json`. Site chỉ đọc JSON tĩnh.

Trong dữ liệu thô hiện tại (555 entry, site hiển thị 536, crawler luôn chạy trước hiển thị một chút):

| Chất lượng | Model |
|---|---|
| medium | 437 |
| high | 67 |
| low | 50 |

| Sample rate | Model |
|---|---|
| 22050 Hz | 486 |
| 16000 Hz | 47 |

486 giọng ở 22050 Hz, chuẩn Piper. 47 giọng ở 16000 Hz, mấy giọng nhỏ chạy nhanh cho thiết bị nhúng. Bộ phonemizer là `espeak` trong 509 trường hợp, mình sẽ quay lại, đó là trái tim của hệ thống.

### Nguồn gốc, hay vì sao mỗi model có một dataset

Thứ làm PiperHub hữu ích thay vì chỉ là một list, là liên kết model <-> dataset. Ví dụ lấy trên home: giọng **Astra - Valorant Piper TTS** được gắn với dataset **Astra - LJSpeech Dataset**. Bạn mở hai trang, bạn kiểm tra repo và license của từng bên.

130 dataset được tham chiếu. Và catalog nói thật về tình trạng đội quân: 25 model bị gắn cờ `usable: false` (file hỏng, hoặc định dạng `piperPlus` cần runtime fork). Module `pipertts` từ chối mấy giọng này bằng lỗi rõ ràng thay vì crash kỳ lạ sau đó. 48 model là multi-speaker, trong đó có hai model mà chúng ta sẽ quan tâm.

Về guide, site làm tròn việc trong ba bước: **Build a dataset**, **Train a voice**, **Use a voice**, cộng thêm một trang Piper Plus. Đầu vào là dataset định dạng LJSpeech, đầu ra là ONNX. Nói thì đơn giản, làm thì lâu, nên mới có phần tiếp theo.

## Piper dưới nắp capo: VITS, espeak, ONNX

### Một câu nói, ba bước

Khi bạn bảo Piper nói "bonjour", chuyện xảy ra là:

```
"bonjour"
  -> [phonémisation espeak-ng] -> b O~ Z u R
  -> [encodeur VITS + flow + décodeur] -> waveform 22050 Hz
```

Không có vocoder riêng. Đó chính là VITS: một model end-to-end đi thẳng từ text (đã phiên âm) ra waveform. Trong khi pipeline cũ làm text -> spectrogram (Tacotron) rồi spectrogram -> audio (HiFi-GAN, hai model, hai lần train), VITS học tất cả một lần với VAE có điều kiện, flow chuẩn hóa và discriminator kiểu GAN trên decoder. Một lần train, một model, một export ONNX.

Decoder nhả thẳng 22050 Hz. Ở sample rate này, một giây nói bằng 22050 con số. Model nhỏ (vài chục MB ở chất lượng medium) và inference là thuần CPU: nhân ma trận trên đồ thị ONNX đã tối ưu. Nên Raspberry Pi là target chính thức, Piper sinh ra trong Rhasspy, một trợ lý giọng nói mã nguồn mở làm để chạy trên Pi.

### espeak-ng, bộ phiên âm làm hết việc bẩn

Trước VITS, phải biến text thành phoneme. 509 model trên 555 dùng `espeak`:

```bash
echo "bonjour" | espeak-ng --ipa -v fr
# bO~'ZuR
```

espeak-ng biết phát âm của hàng chục ngôn ngữ. Model VITS không bao giờ học chính tả tiếng Pháp với mấy chữ `eau` phát âm thành `o`, nó học từ phoneme ra âm thanh. Việc này đơn giản hóa training cực nhiều và giải thích vì sao Piper phủ 71 ngôn ngữ: với ngôn ngữ mới, bạn cắm giọng espeak tương ứng vào rồi train.

Mấy model không dùng espeak thì có phonemizer riêng, và chỗ này bắt đầu lạ: `hebrew` (Nakdimon ONNX + 494 dòng rule IPA), `pinyin` (BERT g2pW đầy đủ với giải nghĩa polyphone, cùng một ký tự Trung Quốc phát âm khác nhau tùy từ), `thai` (TLTK thật không chỉnh sửa), `japanese` (tách từ lindera + UniDic). Module `pipertts` port cả bảy, đã verify giống hệt bản Python tham chiếu. Mình sẽ quay lại.

### Dataset: toàn LJSpeech

Định dạng train chuẩn là LJSpeech: một thư mục `wavs/` đầy clip, cộng một file `metadata.csv`:

```
LJ001-0001|Printing, in the only sense with which we are at present concerned...|printing in the only sense...
LJ001-0002|in being comparatively modern...|in being comparatively modern...
```

`fileid|transcription|normalized`, một clip bằng một câu, vài giây. Dataset gốc là 13 000 câu tiếng Anh đọc bởi một speaker nữ duy nhất, public domain. Để train giọng Pháp, bạn thu cùng cấu trúc bằng tiếng Pháp: text + audio đã align, vài giờ là đủ cho medium ổn, nhiều hơn cho high.

Ba chất lượng trong catalog tương ứng đại khái với kích thước model + thời gian train. Low: nhỏ, nhanh, robotic. Medium: điểm ngọt, với 437 model. High: to hơn, chậm hơn, tự nhiên hơn, 67 model, trong đó có các Fortune.

### Ba nút thần kỳ

Mỗi giọng Piper có ba tham số inference, với default gần như phổ quát:

```json
"inference": { "noise_scale": 0.667, "length_scale": 1, "noise_w": 0.8 }
```

- `noise_scale` (0.667): độ biến thiên của giọng. Cao hơn thì biểu cảm hơn, thấp hơn thì ổn định hơn. Đầu ra là ngẫu nhiên: hai lần tổng hợp cùng một câu cho hai audio hơi khác nhau.
- `noise_w` (0.8): độ biến thiên của timing, nhịp điệu.
- `length_scale` (1.0): tốc độ. Trên 1 thì chậm lại, dưới 1 thì nhanh lên. Cách đơn giản nhất để Luna nói nhanh hơn khi cô ấy nổi giận.

Giữ lại `noise_scale`, nó sẽ dùng cho phần cảm xúc.

## Fortune multi: 7 cảm xúc, 1 file ONNX duy nhất

Rồi, sang ngôi sao địa phương.

Catalog liệt kê ba model Fortune train bởi ItsRealFortune (chào bạn):

| Model | Repo | Giọng |
|---|---|---|
| ItsRealFortune - French (FR) High | `fox3000foxy/piper-fortune-v6` | 1 (voice-0) |
| ItsRealFortune - French (FR) **Multi** High | `fox3000foxy/piper-checkpoints-fortune-fr-multi` | **7** |
| ItsRealFortune - English (EN) **Multi** High | `fox3000foxy/piper-checkpoints-fortune-en-multi` | **7** |

Bản multi FR là thế này:

```
normal, joyeuse, storytelling, colere, triste, surprise, interrogative
```

Bảy biến thể cảm xúc trong **một file ONNX duy nhất**. Bản multi EN cũng vậy, với một typo lịch sử trong tên: `suprised` thay vì `surprised`. Nó nằm trong weight, mình giữ lại, đó là một phần folklore.

### SpeakerId hoạt động thế nào?

VITS multi-speaker là cùng một model với thêm một đầu vào: một embedding speaker. Khi train, mỗi clip được gắn tag với style của nó, model học một bảng embedding (một dòng mỗi style) cùng lúc với phần còn lại. Khi inference, bạn chọn dòng trong bảng:

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
    speakerId: i,           // 0 = normal ... 5 = surprise
    outputFile: `./fortune-${styles[i]}.wav`,
  });
}
```

Cùng một câu, bảy cách đọc. `speakerId: 5` (surprise) với `noise_scale` đẩy lên một chút, và bạn có một câu cảm thán đáng tin. `speakerId: 4` (triste), `length_scale: 1.1` để nói chậm lại, và bạn có một thông báo buồn. Luna điều chỉnh giọng kiểu đó: bộ não chọn cảm xúc (valence/arousal, xem bài của mình về centroid), TTS chọn speakerId.

Dataset đằng sau có tên đơn giản là **Fortune French - Dataset**, với license tên là "Fortune's Café". Đúng, license tên như một quán cà phê. Không, nó vẫn giữ nguyên.

### Vì sao cách này khôn ngoan về kinh tế

Bảy cảm xúc bằng một lần tải, một lần nạp RAM, một session ONNX. Lựa chọn khác (bảy model riêng) sẽ nhân dung lượng lưu trữ và buộc reload đồ thị mỗi lần đổi cảm xúc, không chơi được với bot đổi tông giữa câu. Còn đây, `speakerId` chỉ là một index trong tensor. Chi phí biên: bằng không.

## Đối thủ: Kokoro, PocketTTS, sanoTTS

Piper chia sẻ CPU với ba đối thủ nghiêm túc, ba triết lý khác nhau.

### Kokoro 82M, vua hiệu năng giá

[Kokoro](https://huggingface.co/hexgrad/Kokoro-82M), của hexgrad. 82 triệu tham số, kiến trúc StyleTTS 2 chỉnh sửa với decoder ISTFTNet, **không có bước diffusion**. Không có diffusion làm nên tất cả: không vòng lặp khử nhiễu lặp đi lặp lại, nên inference cực nhanh.

| | Kokoro-82M |
|---|---|
| Params | 82M |
| Poids | ~300 Mo (164 Mo en FP16) |
| Licence | Apache 2.0 (commercial OK) |
| Langues | 8, 54 voix preset + blending |
| CPU | quasi temps réel |
| GPU | 36 à 96x temps réel |
| Tests aveugles | au niveau de Google et Amazon |

Train trên chưa tới 100h audio với khoảng 1000 đô, và người nghe mù xếp nó ngang giọng premium của Google và Amazon. Đó là lý do nó bùng nổ: chất lượng premium, miễn phí, local, permissif.

So với Piper: Kokoro thắng về độ tự nhiên thuần (StyleTTS 2 hơn VITS cỡ nhỏ) và license (Apache 2.0 so với engine GPL-3.0 của Piper). Piper thắng về độ phủ (71 ngôn ngữ so với 8, 3755 speaker so với 54 giọng) và hệ sinh thái giọng cộng đồng. Với narration tiếng Anh, Kokoro khó bị đánh bại. Với tiếng Pháp 7 cảm xúc, tiếng Thổ hay tiếng Swahili, Piper thường là lựa chọn duy nhất.

### PocketTTS (Kyutai), nhân bản giọng trên CPU

[Kyutai](https://kyutai.org/tts/) chơi một bản nhạc khác: model nhỏ **có nhân bản giọng**, chạy trên CPU.

| Model | Params | WER | UTMOS | SIM | Tốc độ CPU (1 thread) |
|---|---|---|---|---|---|
| Pocket TTS | ~100M | 0.92% | 4.364 | 0.923 | 2.8x temps réel |
| Pocket TTS small | 1.9M / 6.9M / 18.2M | - | - | - | CPU, clonage inclus |

WER dưới 1% (phát âm chuẩn), UTMOS 4.36 (chất lượng cảm nhận xuất sắc), SIM 0.923 (bản clone giống target thật). Và bản small xuống tới **1.9M tham số** kèm nhân bản. 1.9M. Router Sabaki của mình làm file JSON gần bằng cỡ đó.

So với Piper: PocketTTS thắng về nhân bản (Piper đọc bằng giọng cố định) và độ gọn của flagship. Piper thắng về ngôn ngữ (bản small hiện tại chỉ tiếng Anh) và độ chín của hệ sinh thái (536 giọng sẵn sàng so với "tự train đi").

### sanoTTS, model chạy trên chip 3 đô

[sanoTTS](https://github.com/ampixa/sanoTTS) (`sano` nghĩa là "nhỏ" trong tiếng Nepal), là Bareiron của TTS: một stack neural đầy đủ đi từ phoneme ra PCM 22.05 kHz **trên vi điều khiển**.

| Hệ thống | Params | SCOREQ | UTMOS | DNS-SIG |
|---|---|---|---|---|
| sanoTTS (heart-nano) | 0.29M | 2.29 | 2.45 | 3.35 |
| TinyTTS | 1.62M | 3.94 | 3.65 | 3.62 |

0.29M tham số. 2 MB một giọng. `pip install sanotts`, `sanotts say "Hello" --voice amy`, nó nói. Trên trình duyệt cũng vậy.

Nhưng nhìn điểm đi: SCOREQ 2.29 so với 3.94 của TinyTTS, UTMOS 2.45. Nó nói được, đúng. Nó hát được, không. Đó là tradeoff cuối cùng: ở 0.29M bạn chạy được mọi nơi nhưng chất lượng đi theo kích thước. Piper medium nặng gấp 100 lần để có giọng ở đẳng cấp khác.

### Bảng tóm tắt

| | Piper | Kokoro 82M | PocketTTS | sanoTTS |
|---|---|---|---|---|
| Params typiques | ~10-60M | 82M | ~100M / 2-18M | 0.3-1.4M |
| Langues | 71 | 8 | EN (+ smalls EN) | multilingue, petit |
| Voix dispos | 3755 speakers | 54 + blending | clonage (la tienne) | quelques voix |
| Clonage | non | non (natif) | **oui, CPU** | non |
| Licence moteur | GPL-3.0 | Apache 2.0 | open (Kyutai) | open |
| Entraînable maison | oui (LJSpeech) | oui (plus lourd) | oui | oui |
| Qualité FR | bonne (multi émotions) | correcte (EN-first) | EN-only | faible |

Lựa chọn tùy vào ràng buộc của bạn, không có người thắng tuyệt đối: chất lượng EN thuần thì Kokoro. Nhân bản CPU thì PocketTTS. Vi điều khiển thì sanoTTS. Phủ ngôn ngữ + giọng Pháp cảm xúc + không infra thì Piper.

## ElevenLabs, gã khổng lồ tính phí

Rồi còn ElevenLabs. Hơn 70 ngôn ngữ, Eleven v3 biểu cảm với audio tag và hội thoại kịch tính, chất lượng top blind test. Kiểu Jev của TTS: ai cũng từng thấy qua, ai cũng từng benchmark so với nó.

Giá 2026, số tròn:

| Model API | Giá / 1000 ký tự |
|---|---|
| Flash / Turbo, v3 Conversational | $0.05 |
| Multilingual v2, Eleven v3 | $0.10 |

1000 ký tự làm được khoảng 1 phút audio. Nên $0.05 đến $0.10 một phút. Gói Pro $99 gồm khoảng 990k ký tự, phí vượt gói cũng tính vậy. Với một kênh YouTube ra một video mỗi ngày có voice off (tool `valorant-short-maker` của mình làm đúng việc đó, nhưng bằng Piper miễn phí), tính $1.50 đến $3 mỗi tháng cho mỗi phút voice off hằng ngày. Mười phút mỗi ngày: $15 đến $30/tháng. Trả được, nhưng phải đếm.

Khi nào đáng tiền: khi giọng nói **là** sản phẩm (lồng tiếng, audiobook, quảng cáo), khi cần 70 ngôn ngữ vào sáng mai, khi nhân bản phải chuẩn ngay lần đầu. Còn không bao giờ đáng cho: bot Discord nói suốt đêm, thông báo nội bộ, dev, volume bùng nổ. Luna kể chuyện đời lúc 3h sáng bằng ElevenLabs thì hóa đơn điện nhà mình khóc luôn.

Phép tính đơn giản: Piper bằng 0 euro biên, chất lượng "tốt". ElevenLabs bằng đồng hồ chạy tiền, chất lượng "xuất sắc". Ở giữa, có một thế giới nơi "tốt và miễn phí" thắng, đó là toàn bộ cược của PiperHub.

## pipertts: vì sao bản native nhanh gấp 10 lần wrapper Python

Repo [itsrealfortune/pipertts](https://github.com/itsrealfortune/pipertts), 75 commit: một port native của Piper sang TypeScript. Tiêu đề README: "In-process Piper TTS for Node.js. No Python required."

### Cái giá của spawn

Wrapper lịch sử (`PiperTTS`) là `python3 -m piper` spawn trong subprocess **mỗi lần tổng hợp**:

```
synthèse = spawn(python) + chargement du modèle + inférence + kill
```

Mỗi câu trả tiền khởi động interpreter + nạp weight. Đo trên `en_US-lessac-medium`: **khoảng 2.2s mỗi dòng**.

Bản native (`PiperNativeTTS`) giữ session ONNX **nóng trong bộ nhớ**:

```
load une fois -> session persistante -> inférence par phrase
```

Đo y hệt: **khoảng 0.22s mỗi dòng**. Con số 10x đến từ đó: mình giết spawn và reload, inference thần kỳ chẳng liên quan gì ở đây. Bản thân inference ONNX giống nhau ở cả hai bên.

Bonus, lần load đầu cache đồ thị đã tối ưu cạnh file `.onnx` (`<model>.ortopt-<platform>-<arch>-v<ort>.onnx`), giúp các lần nạp sau nhanh hơn khoảng 35%. Khóa cache kết hợp platform, arch và phiên bản ORT, và tự refresh nếu model đổi. Tắt được bằng `cacheOptimizedModel: false`.

### Cầu espeak: 0.4ms so với 15ms

Cùng logic cho phiên âm. Wrapper gọi binary `espeak-ng` qua CLI mỗi câu: khoảng 15ms spawn mỗi lần. Bản native nhúng bridge N-API (`src/native/espeak-bridge/`, port của `espeakbridge.c`), với prebuild cho Linux x64/arm64: **khoảng 0.4ms mỗi gọi**, phoneme giống từng byte. Không có addon thì tự rơi về CLI. `PIPER_ESPEAK_BRIDGE=0` để ép dùng CLI.

### 7 phoneme_type, port hết

| Kiểu | Engine | Ghi chú |
|---|---|---|
| `espeak` | bridge N-API ou CLI | clauses byte-identiques |
| `text` | passthrough codepoints | trivial |
| `hebrew` | Nakdimon ONNX + règles IPA | sorties identiques |
| `lithuanian` | espeak + dico de stress 189k entrées | sorties identiques |
| `pinyin` | BERT g2pW ONNX + WordPiece | désambiguïsation des polyphones OK |
| `thai` | vrai TLTK non modifié sous Pyodide/WASM | 7/7 identiques (1er appel lent, suite rapide) |
| `japanese` | lindera-wasm + UniDic + moteur de mores TS | segmentation exacte, **pas d'accent lexical** |

Và tiếng Ả Rập được gắn dấu tự động (tashkeel, tắt được). 509 giọng espeak trong catalog chạy qua bridge nhanh, mấy giọng lạ chạy qua engine riêng. 71 test trong suite, ràng buộc ghi rõ ở chỗ kẹt (giọng Nhật, UniDic không đưa dữ liệu, đã thừa nhận, không giấu gì).

### Định dạng và streaming

`wav` mặc định, `raw` PCM, `mp3`, `ogg`, `opus`: ffmpeg khi có, nếu không thì fallback thuần JS (lamejs cho mp3, opusscript + muxer Ogg cho opus, tương quan 0.993 với nguồn). Và nhất là `synthesizeChunks()`: một generator async nhả theo câu, với `sentenceSilence` giữa các câu. Với Luna, nghĩa là bắt đầu phát audio trong khi phần cuối đang tổng hợp, streaming TTS mà không cần server riêng.

Dùng đầy đủ, với catalog PiperHub tích hợp (`hub:` + fallback mirror tự động nếu repo tác giả không còn phục vụ file):

```ts
const tts = await PiperNativeTTS.load({
  model: "hub:glados-french-medium-voice",
  modelsDir: "./models",
});

const r = await tts.synthesize("Bonjour, je suis GLaDOS.", {
  outputFormat: "ogg",   // thẳng cho Discord
  lengthScale: 0.95,     // nhanh hơn một chút
});
```

Giọng cộng đồng (GLaDOS và nhân vật game) vắng mặt trong manifest chính thức, đó đúng là lý do PiperHub tồn tại, và `pipertts` biết rõ: `hub:<slug>`, URL trang piperhub, hay slug trần, cái nào cũng chạy. Giọng bị gắn `usable: false` thì bị từ chối với lỗi rõ ràng.

## Những gì đã hy sinh

Mỗi tính năng vắng mặt nuôi một tính năng khác. List trung thực:

**Piper nghe robotic cạnh ElevenLabs.** VITS medium trên 22050 Hz thì sạch nhưng phẳng so với model biểu cảm lớn. Bản multi cảm xúc bù lại một phần (7 style hơn 1 style phẳng), nhưng audiobook ElevenLabs v3 vẫn ở trên. Đó là giá của vài chục MB.

**espeak đọc sai.** Tên riêng, từ mượn tiếng Anh, viết tắt: phiên âm bằng rule có điểm mù. "Spoiler" trong tiếng Pháp, espeak đọc theo kiểu của nó. Model lớn có G2P neural thì sai ít hơn. Chạy prod thì cần từ điển ngoại lệ cho thuật ngữ chuyên môn.

**Không nhân bản native.** Piper đọc bằng giọng cố định. Nếu bạn muốn giọng CỦA BẠN, đi về phía PocketTTS hay ElevenLabs. Multi-speaker cho biến thể, không bao giờ cho timbre của bạn.

**Tiếng Nhật vẫn không có trọng âm từ vựng.** UniDic không đưa dữ liệu trọng âm, nên tách từ chính xác nhưng giai điệu chỉ tương đối. Ghi trong README, không giấu gì dưới thảm.

**Tiếng Thái chậm ở gọi đầu.** TLTK chạy dưới Pyodide/WASM không chỉnh sửa: gọi đầu mất vài giây (nạp), các gọi sau nhanh. 7/7 giống bản tham chiếu, nhưng nhớ warm-up.

**Dữ liệu thì đói.** Một giọng high đúng nghĩa cần hàng giờ audio sạch đã align. Dataset Fortune là hàng giờ thu âm + làm sạch. Không có phép màu: rác vào, robot ra.

**Catalog có giọng chết.** 25 model gắn cờ `usable: false`. Đã thừa nhận và lọc, nhưng nó nhắc rằng crowdsourcing giọng cũng là crowdsourcing bỏ dở.

## Kết quả cuối cùng

Một bên là đồng hồ ElevenLabs, một bên là Raspberry Pi:

- PiperHub: 536 model hiển thị, 71 ngôn ngữ, 3755 speaker, 130 dataset liên kết, guide dataset -> training -> usage
- Piper: VITS end-to-end, espeak, ONNX CPU, LJSpeech, low/medium/high, chuẩn 22050 Hz
- Fortune multi: 7 cảm xúc FR + 7 EN, mỗi bản 1 ONNX, `speakerId` để chuyển, license "Fortune's Café"
- Kokoro 82M: chất lượng premium EN, Apache 2.0, 54 giọng, gần như realtime CPU
- PocketTTS: nhân bản CPU, khoảng 100M rồi 2-18M, WER 0.92%
- sanoTTS: 0.29M, 2 MB, vi điều khiển, chất lượng đi theo kích thước
- ElevenLabs: $0.05-0.10/1000 ký tự, hơn 70 ngôn ngữ, top chất lượng, đồng hồ chạy tiền
- pipertts native: khoảng 0.22s/dòng so với khoảng 2.2s wrapper, bridge espeak 0.4ms, 7 phoneme_type, wav/raw/mp3/ogg/opus, streaming theo câu

Luna nói bằng đống này mỗi ngày. 0 euro TTS, cảm xúc lái bởi bộ não, OGG thẳng cho Discord. So với ElevenLabs thì nghe ra khác, rõ ràng. Nhưng lúc 3h sáng khi cô ấy quyết định kể chuyện đời, hóa đơn nhà mình ngủ yên.

## Triết lý

p2r3 nói: *"J'aime juste l'idée que cette toute petite puce à 1 balles puisse faire tourner quelque chose d'aussi avancé que Minecraft."*

Cùng vibe ở đây, áp cho giọng nói: mình thích ý tưởng vài chục MB ONNX làm một con Raspberry Pi nói 71 ngôn ngữ, không cloud, không tài khoản, không đồng hồ tiền. Nó rõ ràng không thay studio lồng tiếng nào. Nó thay chỗ khó chịu khi bạn muốn một giọng đúng mức, local, miễn phí, nói ban đêm mà không tính tiền bạn.

Tradeoff, viết đen trên trắng:
- chất lượng premium -> VITS nhỏ: hơi robotic, nhưng local và miễn phí
- một model mỗi cảm xúc -> speakerId: 7 giọng với giá RAM của một
- spawn Python -> session bền: nhanh gấp 10 lần, không cần cài Python
- catalog hoang dã -> nguồn gốc gắn kèm: mỗi giọng biết nó từ đâu đến và còn chạy không
- API tính phí -> 0 euro biên: kém đẹp hơn ElevenLabs, nhưng hóa đơn ngủ yên

**3 điều cần nhớ:**

1. **Piper là TTS của CPU** - VITS + espeak + ONNX, 71 ngôn ngữ, giọng nặng vài chục MB chạy trên Pi. Kém đẹp hơn ElevenLabs, rẻ hơn vô hạn.
2. **Fortune multi bằng 7 cảm xúc với giá một** - một ONNX duy nhất, `speakerId` để chuyển, FR + EN. Embedding speaker thay vì 7 model.
3. **Bản native giết spawn** - `pipertts` giữ session ONNX nóng: 0.22s/dòng so với 2.2s, bridge espeak 0.4ms so với 15ms CLI. Cùng inference, bớt chờ 10 lần.

Nếu dự án làm bạn quan tâm, catalog ở [piperhub.org](https://piperhub.org/), code site ở [github.com/fox3000foxy/piper-bank](https://github.com/fox3000foxy/piper-bank), module native ở [github.com/itsrealfortune/pipertts](https://github.com/itsrealfortune/pipertts). Và nếu bạn muốn nghe Luna kể chuyện đời lúc 3h sáng, gặp trên Discord xD
