---
title: "Super Mario Bros. : स्तर प्रारूप, pointer और 256 glitch world"
description: "128 स्तर × 4 क्षेत्र प्रकार 40KB ROM में कैसे समाते हैं, Minus World क्यों मौजूद है, और NES Tennis मैच glitch world कैसे लोड कर सकता है।"
date: 2026-06-10
tags:
  - retro
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "7FVvbVStRQLK41EZz7dGXPYVrMossrtUMfRWI3BGqFxcIrdKXa0zUzVgd/B5Q4yqfypACoDTfjs1S0WkhPJljA=="
---

## परिचय

Super Mario Bros., यह 40 kilobyte ROM है। आठ world, 32 स्तर, शत्रु, संगीत, power-up, सब इसमें समाता है।

लेकिन अगर तुम emulator खोलते हो और सही byte छेड़ते हो, तो तुम स्तर 36-1 लोड कर सकते हो। या 255-1। या ऐसे world में उतर सकते हो जहाँ सब Bowser sprite और कहीं न जाने वाले पाइपों से बना है।

ये glitch world साधारण कारण से मौजूद हैं : SMB1 की स्तर भंडारण प्रणाली 8-bit अनुकूलन का चमत्कार है, और जब हम खेल को वहाँ पढ़ने को मजबूर करते हैं जहाँ नहीं चाहिए, तो यह आकर्षक परिणाम देता है।

Retro Game Mechanics Explained ने इस पर 4 वीडियो की शृंखला बनाई, हम उन्हें अपने समय के सबसे बिके खेल के 6502 कोड में एक ही गोते में संकलित करेंगे।

![GLITCH OBJECTS , SMB1 छिपी यांत्रिकी पर RGMechEx शृंखला का शीर्षक](/images/smb1-glitch-levels/title-card.jpg)

![World 9-1 , cart swap Tennis से पहुँचने योग्य पहले glitch world का शीर्षक स्क्रीन](/images/smb1-glitch-levels/v1-title-9-1.jpg)

## warm start : Tennis की RAM SMB1 में क्यों बचती है

स्तर भंडारण की बात से पहले, समझना होगा कि SMB1 शुरू कैसे होता है। क्योंकि NES Tennis cart swap glitch पूरी तरह खेल के **warm start / cold start पहचान तंत्र** पर टिका है।

### 41 संरक्षित byte

जब SMB1 **cold start** पहचानता है (पहली बार चालू या power off/on), तो वह पूरी RAM मिटाता है। लेकिन जब वह **warm start** पहचानता है (बटन reset, बिजली कटौती नहीं), तो वह **41 byte** स्मृति क्षेत्र संरक्षित करता है :

```asm
; warm start पर RAM में संरक्षित 41 byte
; पते $075F-$0787
;
; $075F : शुरुआत byte (world - 1)    [1 byte]
; $0760 : world चयन flag (B button) [1 byte]
; $0761-$0762 : अप्रयुक्त                    [2 byte]
; $0763-$0768 : timer (6 अंक, 3 दिखाए गए) [6 byte]
; $0769-$076E : Luigi सिक्के                   [6 byte]
; $076F-$0774 : Mario सिक्के                   [6 byte]
; $0775-$077A : Luigi स्कोर                   [6 byte]
; $077B-$0780 : Mario स्कोर                   [6 byte]
; $0781-$0786 : top score (6 अंक, 1 छिपा) [6 byte]
; $0787 : जादुई byte $A5                 [1 byte]
```

ये 41 byte एक ही सुविधा की सेवा करते हैं : खिलाड़ी को game over बाद **उसी world में जारी** रखने देना। अगर तुम 6-3 में मरते हो, तो खेल शुरुआत byte में world 6 लिखता है, और title screen पर, अगर तुम A + Start दबाए रखते हो, तो तुम 6-1 में फिर से शुरू करते हो।

![warm start पर RAM में संरक्षित 41 byte , TOP SCORE, MARIO SCORE, TIMER, WORLD SELECT, CONTINUE WORLD, और जादुई byte $A5](/images/smb1-glitch-levels/v1-memory-state.jpg)

### warm start की दोहरी जाँच

![Cold start बनाम warm start , reset पहचान चित्र](/images/smb1-glitch-levels/v1-warm-start.jpg)

जब SMB1 boot होता है, तो वह एक ही मानदंड नहीं बल्कि **दो** जाँचता है :

```asm
CheckWarmStart:
  ; 1. $0787 पर जादुई byte $A5 जाँचना
  lda $0787
  cmp #$A5
  bne ColdStart        ; $A5 नहीं → cold start

  ; 2. top score के 6 अंक जाँचना ($0781-$0786)
  ;    हर अंक 0 और 9 के बीच होना चाहिए
  ldx #0
CheckLoop:
  lda $0781,x
  cmp #$0A
  bcs ColdStart        ; अंक >= 10 → cold start
  inx
  cpx #6
  bne CheckLoop

  ; अगर दोनों शर्तें गुजरती हैं → warm start
  ; RAM मिटी नहीं है, शुरुआत world संरक्षित है
  jmp WarmStartBoot
```

![$A5 byte और top score अंकों की जाँच , warm start का हृदय](/images/smb1-glitch-levels/v1-a5-byte.jpg)

दोहरी जाँच क्यों ? क्योंकि $A5 byte संयोग से मौजूद हो सकता है (दूसरा खेल जो यह मान छोड़ता है, या RAM chip की डिफ़ॉल्ट विश्राम स्थिति)। top score अंक वैध (0-9) हैं यह जाँचकर, हम सुनिश्चित करते हैं कि डेटा सुसंगत है।

### Tennis एकमात्र खेल क्यों है जो काम करता है

जब हम पहली बार SMB1 डालते हैं (cold start), तो खेल :
1. पूरी RAM मिटाता है → top score = 0, world byte = 0
2. $0787 पते पर $A5 लिखता है

फिर, हम console बंद किए बिना Tennis पर swap करते हैं। Tennis :
- **शुरू में RAM साफ नहीं करता** (कम NES खेल करते हैं)
- **top score byte पर नहीं लिखता** → वे 0 रहते हैं (वैध)
- **$A5 byte को नहीं छूता** → वह मौजूद रहता है
- **$075F पते** को खिलाड़ी कदम counter के लिए इस्तेमाल करता है

```asm
; Tennis में footstep increment :
; court पर खिलाड़ी के हर कदम पर, Tennis $075F पर byte बढ़ाता है।
; वही byte SMB1 "world number - 1" के रूप में इस्तेमाल करता है।
;
; 0 कदम  → world 0 → SMB1 = world 1
; 1-7 कदम → world 1-7 → सामान्य world
; 8+ कदम → world 8+ → glitch world !
;
; counter तभी बढ़ता है जब संगीत रुकता है
; (footstep ध्वनियाँ संगीत के दौरान नहीं बजतीं)।
```

जब हम SMB1 वापस रखते हैं :
1. $A5 byte अभी भी वहाँ है (Tennis ने उसे नहीं छुआ)
2. top score अंक अभी भी 0 हैं (वैध)
3. world byte अब 8+ है (Tennis कदमों से बढ़ाया गया)
4. SMB1 warm start पहचानता है → भ्रष्ट world byte संरक्षित करता है
5. A + Start दबाए रखना → world 9-1, world A-1, world 36-1, आदि।

### Mario को Tennis से पहले boot क्यों करना होगा

सूक्ष्मता : पहले SMB1 boot करना होगा, फिर Tennis, फिर फिर से SMB1। अगर तुम सीधे Tennis से शुरू करते, तो $A5 byte कभी लिखा नहीं जाता (Tennis $A5 नहीं लिखता), इसलिए warm start पहचान विफल होती और RAM मिट जाती।

![Tennis कदम counter : हर footstep world byte बढ़ाता है](/images/smb1-glitch-levels/v1-footstep.jpg)

![Access Glitch Worlds via NES Tennis , cart swap समझाने वाला वीडियो](/images/smb1-glitch-levels/yt-tennis.jpg)

## SMB1 40KB में अपने स्तर कैसे संग्रहित करता है

Nintendo R&D4 को दिखने में सरल समस्या सुलझानी थी : tile, शत्रु, item के साथ क्षैतिज scroll करने वाले स्तरों को दर्शाना, सब अति तंग ROM बजट में।

समाधान दो **पूरी तरह स्वतंत्र** डेटा परतों में अलगाव है :

### tile layout (स्तर नक्शा)

हर स्तर ROM में संपीड़ित tile संरचना की ओर pointer से परिभाषित है। संपीड़न प्राथमिक लेकिन शानदार है : 1-3 डेटा byte के बाद "नियंत्रण" byte।

tile प्रारूप **run** (RLE जैसा) तंत्र इस्तेमाल करता है :

```asm
; SMB1 tile प्रारूप (सरलीकृत)
; हर "कमांड" नियंत्रण byte है :
;
; $00-$7F : tile रखता है, 1 कॉलम आगे बढ़ता है
; $80-$BF : N बार दोहराई tile रखता है (N = byte - $80 + 1)
; $C0-$FF : विशेष कमांड (पंक्ति अंत, छलांग, palette बदलाव)

उदाहरण : लगातार 3 ईंटें बनाने के लिए :
  $82 $01    ; tile $01 (brick) 3 बार दोहराता है
```

हर स्तर में tile की 16 कॉलम की 13 पंक्तियाँ होती हैं (13×16 = 208 दिखते tile)। लेकिन संपीड़ित प्रारूप काफी नीचे जाने देता है, उदाहरण के लिए, आसमान और खाली कॉलम लगभग जगह नहीं लेते।

6502 में रेंडर लूप :

```asm
; Tile विसंपीड़न - मुख्य loop
; प्रवेश : $XX में tile_data pointer
; निकास : PPU RAM में स्तर tilemap

DecompressTile:
  lda (tile_ptr),y      ; नियंत्रण byte पढ़ना
  iny
  cmp #$80
  bcc SingleTile        ; $00-$7F : एकल tile
  cmp #$C0
  bcc RunLength         ; $80-$BF : run-length
  jmp SpecialCommand    ; $C0-$FF : विशेष कमांड

SingleTile:
  sta PPU_DATA          ; tile सीधे लिखना
  jmp Next

RunLength:
  sec
  sbc #$7E              ; N = control - $7E
  tax
  lda (tile_ptr),y      ; दोहराने वाली tile पढ़ना
  iny
: sta PPU_DATA
  dex
  bne :-
  jmp Next
```

### sprite layout (शत्रु और वस्तुएँ)

समानांतर में, शत्रु और वस्तुएँ (?, ब्लॉक, पाइप, goomba, koopa) पूरी तरह अलग संरचना में संग्रहित हैं। हर spawn 2 byte से परिभाषित है :

```asm
; SMB1 sprite प्रारूप
; Byte 0 : X स्थिति (कॉलम में)
; Byte 1 : sprite प्रकार + पेज Y बिट
; Y अनुक्रम में सूचकांक से व्युत्पन्न है

sprite अनुक्रम :
  $01 $4B    ; कॉलम 1 पर goomba
  $09 $4B    ; कॉलम 9 पर goomba
  $10 $61    ; कॉलम 16 पर ? ब्लॉक (सिक्का रखता है)
  $15 $54    ; कॉलम 21 पर हरा koopa
  $FF        ; अनुक्रम अंत
```

हर स्तर sprite के 5 पेज तक संदर्भ दे सकता है (आखिर, 16 कॉलम के 5 "screen"), लेकिन व्यवहार में ज्यादातर स्तर सिर्फ 2-3 इस्तेमाल करते हैं।

### pointer तालिका

डिजाइन की प्रतिभा pointer तालिका है। हर स्तर ROM पतों की **जोड़ी** के रूप में संग्रहित है :

```c
// World Map की आंतरिक संरचना (सरलीकृत)
struct LevelPointer {
    uint16_t tile_ptr;   // tile डेटा का ROM पता
    uint16_t sprite_ptr; // sprite डेटा का ROM पता
};

// 4 अलग तालिकाएँ, प्रति AreaType एक :
// 0 = Water, 1 = Overworld, 2 = Underground, 3 = Castle
LevelPointer level_table[4][128];
```

प्रति तालिका 128 प्रविष्टियाँ। 4 क्षेत्र प्रकार। **512 संभावित संयोजन**, लेकिन सिर्फ अंश आधिकारिक खेल इस्तेमाल करता है। बाकी, अनारंभ RAM है या डेटा है जिसकी pointer के रूप में व्याख्या की जाती है।

जब खेल स्तर लोड करता है, तो वह यह करता है :

```asm
; स्तर लोड करना
; A = AreaType (0-3), X = LevelID (0-127)

LoadLevel:
  sta AREA_TYPE
  asl                  ; 16-बिट तालिका में offset के लिए *2
  tax
  lda LevelTable_TilePtr, x
  sta TILE_PTR
  lda LevelTable_TilePtr+1, x
  sta TILE_PTR+1       ; tile की ओर pointer
  lda LevelTable_SpritePtr, x
  sta SPRITE_PTR
  lda LevelTable_SpritePtr+1, x
  sta SPRITE_PTR+1     ; sprite की ओर pointer
  jsr DecompressTiles
```

खेल pointer पर पूर्ण भरोसा देता है : वह तालिका में पता पढ़ता है और उस पते पर जो है उसे विसंपीड़ित करता है, बस।

![Level ID $06 (Water) , 9-1, 6-2 का पानी के नीचे संस्करण](/images/smb1-glitch-levels/lvl-06-9-1.png)

![Level ID तालिका : 128 संभावित प्रविष्टियाँ, 34 निर्दिष्ट](/images/smb1-glitch-levels/v2-level-id-table.jpg)

![tile और sprite pointer का अलग क्रम , Frankenstein level का कारण](/images/smb1-glitch-levels/v2-pointer-tables.jpg)

### 34 अनोखे स्तर और 7-बिट ID तंत्र

![NES RAM chip (MB8416A) , वही है जो cartouche swap करने पर डेटा रखता है](/images/smb1-glitch-levels/v1-ram-chip.jpg)

SMB1 में 32 स्तर नहीं, बल्कि **34 अनोखे स्तर** हैं। बहुत से स्तर दोहरे हैं (5-3 = 1-3 लेकिन Bullet Bill के साथ) "hard mode" ध्वज से चिह्नित। असली अनोखे स्तर :

- **पानी** (प्रकार 0) : 3 स्तर (2-2, 7-2, बोनस क्षेत्र 5-2/6-2)
- **Overworld** (प्रकार 1) : 22 स्तर (2 बादल बोनस कमरे सहित)
- **Underground** (प्रकार 2) : 3 स्तर (भूमिगत बोनस कमरे सहित)
- **Castle** (प्रकार 3) : 6 स्तर
- \+ 1 cutscene कमरा (भूमिगत/पानी स्तरों से पहले)
- \+ 4-2 का 1 warp क्षेत्र

हर स्तर की **7 बिट** ID है। 5 कम वजन बिट = उपसमूह में संख्या, 2 उच्च वजन बिट = क्षेत्र प्रकार :

```asm
; Level ID का 7-बिट एन्कोडिंग
; बिट 6-5 : प्रकार (00=Water, 01=Overworld, 10=Underground, 11=Castle)
; बिट 4-0 : उपसमूह में संख्या
;
; Water ID      : $00-$02  (प्रकार 00, संख्या 0-2)
; Overworld ID  : $20-$35  (प्रकार 01, संख्या 0-21)
; Underground ID: $40-$42  (प्रकार 10, संख्या 0-2)
; Castle ID     : $60-$65  (प्रकार 11, संख्या 0-5)
;
; ID $25 = %0100101 → प्रकार 01 (Overworld), संख्या 5 → 1-1
; ID $23 = %0100011 → प्रकार 01 (Overworld), संख्या 3 → 6-2
```

**128 संभावित ID** ($00-$7F), सिर्फ 34 असली स्तरों को निर्दिष्ट। अप्रयुक्त ID कुछ भी इंगित करते हैं।

### pointer तालिकाएँ : दो सूचियाँ, दो क्रम

tile और sprite pointer उसी क्रम में संग्रहित नहीं हैं। कोड दो अलग 16-बिट सूचियाँ इस्तेमाल करता है (दो अलग तालिकाओं में high byte / low byte) :

```
sprite pointer क्रम :
  सूचकांक 0-5   : Castle (6 स्तर)
  सूचकांक 6-27  : Overworld (22 स्तर)
  सूचकांक 28-30 : Underground (3 स्तर)
  सूचकांक 31-33 : Water (3 स्तर)

tile pointer क्रम :
  सूचकांक 0-2   : Water (3 स्तर)
  सूचकांक 3-24  : Overworld (22 स्तर)
  सूचकांक 25-27 : Underground (3 स्तर)
  सूचकांक 28-33 : Castle (6 स्तर)
```

अलग क्रम क्यों ? कोई तकनीकी कारण नहीं, शायद विकास के दौरान डेटा ऐसे व्यवस्थित हुआ था। लेकिन यह आकर्षक परिणाम बनाता है : जब स्तर ID अमान्य होती है, तो tile और sprite pointer *अलग* स्तर लोड करते हैं, **Frankenstein level** बनाते हुए।

इन दो सूचियों के बीच navigate करने के लिए, खेल छोटी **offset तालिकाएँ** इस्तेमाल करता है (सामग्री तालिका जैसी) :

```asm
; प्रति प्रकार offset तालिकाएँ (Water, Overworld, Underground, Castle)
; हर प्रविष्टि = संबंधित सूची में शुरुआत सूचकांक

SpriteOffsetTable:
  .byte $1F, $06, $1C, $00    ; Water=31, Overworld=6, Underground=28, Castle=0

TileOffsetTable:
  .byte $00, $03, $19, $1C    ; Water=0, Overworld=3, Underground=25, Castle=28
```

स्तर 6-2 (ID $23, Overworld संख्या 3) लोड करने के लिए :

```asm
; 1. प्रकार = 01 (Overworld) → offset तालिका में सूचकांक = 1
; 2. Sprite offset = SpriteOffsetTable[1] = 6
;    अंतिम सूचकांक = 6 + 3 (स्तर संख्या) = 9 → 10वाँ sprite pointer
; 3. Tile offset = TileOffsetTable[1] = 3
;    अंतिम सूचकांक = 3 + 3 = 6 → 7वाँ tile pointer
; 4. परिणाम : tile pointer $A619 + sprite pointer $9ED0 = 6-2 ✓
```

अब, $43 (Underground संख्या 3, जो मौजूद नहीं है) जैसी अमान्य ID के साथ क्या होता है ?

```asm
; ID $43, प्रकार = 10 (Underground), संख्या = 3
; Sprite offset = SpriteOffsetTable[2] = $1C = 28
;   सूचकांक = 28 + 3 = 31 → 32वाँ sprite pointer = पानी बोनस 5-2 !
; Tile offset = TileOffsetTable[2] = $19 = 25
;   सूचकांक = 25 + 3 = 28 → 29वाँ tile pointer = 1-4 (Castle) !
;
; परिणाम : 1-4 tile वाला भूमिगत स्तर
; और 5-2 पानी क्षेत्र के Blooper। असली Frankenstein।
```

![Level ID $43 , Frankenstein level : tile 1-4 + sprite पानी 5-2](/images/smb1-glitch-levels/lvl-43-frankenstein.png)

![Exploring Glitch Level Pointers , offset तालिकाएँ समझाई गईं](/images/smb1-glitch-levels/yt-pointers.jpg)

![world index table , जब world 9 overflow glitch level बनाता है](/images/smb1-glitch-levels/v2-world-index-table.jpg)

### world index table : world 9 overflow क्यों करता है

8 byte वाली ROM तालिका है जो हर world (1-8) के पहले स्तर का सूचकांक देती है। और ठीक बाद, खेल क्रम में सभी स्तरों के 36 Level ID की तालिका।

```asm
; WorldIndexTable (8 byte)
  .byte 0, 5, 10, 15, 20, 25, 28, 33
;   -> World 1 स्तर 0 पर शुरू होता है
;   -> World 2 स्तर 5 पर शुरू होता है
;   -> World 8 स्तर 33 पर शुरू होता है

; LevelIDTable (36 byte)
  .byte $25, $28, $29, $26, $24, ... ; 36 Level ID
```

जब world 9 लोड करने की कोशिश की जाती है, तो खेल WorldIndexTable का 9वाँ byte पढ़ता है... जो मौजूद नहीं है। वह LevelIDTable में 1 byte overflow करता है, मान $25 पढ़ता है, फिर LevelIDTable (37वीं प्रविष्टि) में सूचकांक के रूप में $25 इस्तेमाल करता है, जो SpriteOffsetTable में फिर से 2 byte overflow करता है, और मान 6 पढ़ता है।

```asm
; World 9 :
;   1. WorldIndexTable[8] (overflow) → LevelIDTable में $25 पढ़ता है
;   2. LevelIDTable[37] (overflow) → SpriteOffsetTable का दूसरा byte पढ़ता है = 6
;   3. ID = 6 → Water level number 6 (जो मौजूद नहीं है)
;   4. Tile pointer = water pointer संख्या 6 = 6-2 tile
;   5. Sprite pointer = सूचकांक 31+6 = 37 > 33 → अमान्य pointer
;   6. परिणाम : glitch sprite के साथ पानी के नीचे 6-2
;      → world 9-1 !
```

world G (16) के लिए, overflow और आगे जाता है और Level ID $01 पर गिरता है, जो 1-2 से पहले cutscene स्तर है :

```asm
; World G (16) :
;   WorldIndexTable[15] → LevelIDTable में $01 पढ़ता है
;   LevelIDTable[1] = $29 (cutscene 1-2)
;   → world G-1 = 1-2 प्रवेश cutscene
```

## glitch world क्यों मौजूद हैं

खेल में 32 "वैध" स्तर हैं (8 world × 4 स्तर)। लेकिन pointer तालिका प्रति क्षेत्र प्रकार 128 प्रविष्टियाँ करती है। स्तर 32 से परे प्रविष्टियों में वह है जो उन पतों पर ROM में है, कभी दूसरा स्तर, कभी ध्वनि डेटा, कभी RAM, कभी कुछ भी।

![Level ID $01 Water (Minus World) , tile pointer $AE45, sprite pointer $A171](/images/smb1-glitch-levels/minus-world.png)

### Level ID $01 + AreaType 0 = Minus World

सबसे प्रसिद्ध glitch world। AreaType 0 (पानी) में Level ID $01 इंगित करता है :

- **Tile pointer : $AE45** → 2-2/7-2 पानी के नीचे क्षेत्र
- **Sprite pointer : $A171** → 2-2/7-2 sprite

परिणाम : पानी स्तर जो 2-2 जैसा है, लेकिन अनंत लूप करता है क्योंकि flagpole मौजूद नहीं है। स्तर हमेशा के लिए लूप करता है।

यह स्तर 36-1 है (या world $-1 में 36-1)।

![SMB1 warm start check , वही है जो Minus World को मौजूद करने देता है](/images/smb1-glitch-levels/v4-minus-world.jpg)

```asm
; Minus World में flagpole क्यों छूटा है :
; 2-2/7-2 sprite ($A171) में उनके अनुक्रम में flagpole नहीं है
; खेल sprite $FD (flagpole) खोजता है
; लेकिन कभी नहीं पाता → अनंत लूप
;
; खेल स्तर अनंत बनाता रहता है
; जब तक timer शून्य न पहुँचे।
```

### pointer जो RAM की ओर इंगित करते हैं

जब tile pointer या sprite pointer ROM के बजाय RAM पते ($00-$7F) की ओर इंगित करता है, तो खेल RAM के लगातार बदलावों को tile की तरह व्याख्या करने की कोशिश करता है :

```asm
; उदाहरण : Water में Level ID $03
; Tile Pointer : $A46B (3-3 - वैध)
; Sprite Pointer : $009D (शून्य RAM पेज की ओर इंगित करता है !)
;
; शून्य RAM पेज में खेल register हैं,
; Mario स्थिति, counter स्थिति...
; खेल इसे sprite अनुक्रम की तरह विसंपीड़ित करता है,
; और परिणाम ऐसा स्तर है जिसमें शत्रु हैं
; जो असल में register मान हैं।
```

जब शून्य पेज बदलता है (क्योंकि Mario हिलता है, timer चलता है, आदि), तो स्तर के "sprite" भी बदलते हैं। इसीलिए कुछ glitch world में शत्रु हैं जो झपकते और लगातार बदलते हैं।

![Level ID $03 Water , sprite pointer $009D RAM की ओर इंगित करता है, खेलने अयोग्य स्तर](/images/smb1-glitch-levels/level-03-water.png)

### Level ID $36 : खाली स्तर (Overworld)

Overworld में Level ID $36 :

- **Tile pointer : $AC35** (1-2)
- **Sprite pointer : $A0D8** (1-2)

परिणाम : कुछ नहीं। खेल स्तर लोड करता है लेकिन वह RGMechEx सूची में "बिना स्तर" चिह्नित है। tile शायद वैध हैं लेकिन sprite ऐसी जगह इंगित करते हैं जो खाली या निष्क्रिय स्तर बनाती है।

### Level ID $1D (Castle) : crash का चैंपियन

Castle में Level ID $1D :

- **Tile pointer : $A210** (4-4)
- **Sprite pointer : $7EA0** (RAM !)

RAM में Sprite pointer = अपरिभाषित sprite। खेल tile की पहली पंक्ति में Spiny ball या Bullet Bill blaster दिखाने की कोशिश करता है। यह तुरंत crash करता है।

```asm
; जब sprite pointer RAM की ओर इंगित करता है,
; खेल हर समय बदलने वाले byte को
; "spawn" निर्देशों की तरह विसंपीड़ित करता है
; परिणाम :
; - अनस्तित्व वस्तुओं का प्रकट होना (अपरिभाषित मान)
; - PPU Crash जब NES sprite अमान्य tile दिखाने की कोशिश करता है
; - console का पूरा Freeze
```

## सूचीबद्ध 256 glitch world

RGMechEx ने स्क्रिप्ट लिखी जो **सभी स्तरों** के नक्शे बनाती है, 4 क्षेत्र प्रकारों के लिए, और हर एक के 128 ID।

world counter 8 बिट (0-255) पर है। world 1-8 वैध हैं। **248 संभावित glitch world** बचे हैं। हर glitch world इस world के पहले स्तर से मेल खाता है, और उसकी Level ID WorldIndexTable overflow तंत्र से गणना की जाती है।

![glitch world तालिका , 248 भ्रष्ट world, 68 पहले स्तर पहुँच योग्य](/images/smb1-glitch-levels/v3-glitch-worlds-table.jpg)

128 संभावित ID में से, सिर्फ **68 इस world के "first level" हैं** (glitch world number से पहुँच योग्य)। अन्य 60 स्तर 2+ या अपहुँच योग्य हैं।

| प्रकार | खेलने योग्य अनोखे ID | crash करने वाले ID | खाली ID |
|------|---------------------|-------------------|-----------|
| Water (0)    | ~20  | ~60  | ~48  |
| Overworld (1)| ~30  | ~55  | ~43  |
| Underground (2) | ~15 | ~65 | ~48  |
| Castle (3)   | ~25  | ~58  | ~45  |

बहुत से ID उसी स्तर की ओर ले जाते हैं क्योंकि pointer उसी ROM पतों पर गिरते हैं। Level ID $28 (Overworld) उदाहरण के लिए, tile pointer $A7CD (2-1), **38 अलग glitch world** में प्रकट होता है, क्योंकि उसका sprite pointer $9F51 ROM क्षेत्र में गिरता है जो बहुत से ID से padding/ध्वनि डेटा के रूप में इस्तेमाल होता है।

![Level ID $28 (Overworld) स्तर नक्शा , सामान्य sprite के साथ 2-1 tile, 38 glitch world](/images/smb1-glitch-levels/level-28-overworld.png)

![Super Mario Bros. Glitch Levels Explained , तीसरा वीडियो](/images/smb1-glitch-levels/yt-levels.jpg)

### 6 सच में अनोखे glitch level

19 पहुँच योग्य glitch level ID में से, सिर्फ **6 लोड पर तुरंत crash नहीं करते** :

| World | Level ID | विवरण |
|-------|----------|-------------|
| E-1 (224) | $50 | खाई ऊपर एकल ? block। Mario तुरंत मरता है। |
| W | $57 | Mario spawn अवरुद्ध, हिलने में असमर्थ। |
| 42 (133) | $50 | बादल सुरंग जो Mario फँसाती है अगर वह काफी दूर जाता है। |
| 62 (131, 240) | $4D | जमा महल : Mario ऊपर spawn करता है, गिर नहीं सकता → अवरुद्ध। |
| 127 | $4B | भूमिगत सुरंग, लेकिन बहुत दूर जाने पर crash करता है। |
| 137 | $4B | cutscene का स्वचालित scroll सक्रिय करता है। Mario एकल brick block से मिलता है जो उसे हमेशा रोकता है। |

![Level ID $50 (cloud tunnel) , glitch world 42-1 और E-1](/images/smb1-glitch-levels/lvl-50-cloud.png)
![Level ID $4D (castle) , world 62-1, Mario spawn अवरुद्ध](/images/smb1-glitch-levels/lvl-4D-castle.png)
![Level ID $4B (tunnel) , world 127-1, बहुत दूर जाने पर crash करता है](/images/smb1-glitch-levels/lvl-4B-tunnel.png)

248 में से छह glitch world जो सच में नया कुछ बनाते हैं। बाकी, गलत क्षेत्र प्रकार वाले सामान्य स्तर हैं, या काली स्क्रीन हैं।

## विस्तार में स्तर प्रारूप

स्तर डेटा के सटीक प्रारूप पर ध्यान, यह समझने के लिए कि glitch level क्यों टिकते हैं (या नहीं)।

### स्तर header : 2 byte, 6 गुण

हर स्तर 2 byte header से शुरू होता है जो 6 गुण नियंत्रित करता है :

```asm
; Byte 0 : timer + Y start + modifier
;   बिट 7-6 : timer (00=अपरिवर्तित, 01=200, 10=300, 11=400)
;   बिट 5-3 : Y start Mario (111/110 = autowalk)
;   बिट 2-0 : level type modifier
;              000=default, 001=waves, 010=brick wall,
;              011=water bottom, 100=night, 101=snow,
;              110=snow night, 111=gray night

; Byte 1 : platform + background + floor pattern
;   बिट 7-6 : special platform (00=tree, 01=mushroom,
;                                 10=Bullet Bill, 11=cloud)
;   बिट 5-4 : background (00=none, 01=clouds,
;                           10=montains, 11=fences)
;   बिट 3-0 : प्रारंभिक floor pattern (0-15)
```

प्रकार modifier दृश्य भिन्नताएँ नियंत्रित करता है : पानी स्तरों के ऊपर लहरें, 8-3 की ईंट पृष्ठभूमि, 4-3 की रात palette, 6-2 की बर्फ, आदि।

### tile वस्तुएँ : 2 byte, Next Screen Flag, 3 slot कतार

header बाद **tile वस्तुओं** की सूची आती है, हर वस्तु 2 byte करती है। byte $FD सूची अंत चिह्नित करता है।

```asm
; tile वस्तु प्रारूप (16 बिट) :
; Byte 0 :
;   बिट 7-4 : X स्थिति (कॉलम 0-15)
;   बिट 3-0 : Y स्थिति
;     Y=0-11  : सामान्य Y स्थिति
;     Y=12    : विशेष वस्तुएँ (गड्ढे, पुल, rope, ? block)
;     Y=13    : screen skip / विशेष वस्तुएँ 2
;     Y=14    : modifier/scenery/floor बदलाव
;     Y=15    : विशेष वस्तुएँ 3 (महल, सीढ़ियाँ, बड़ा पाइप)

; Byte 1 :
;   बिट  7   : NEXT SCREEN FLAG
;   बिट 6-4 : वस्तु प्रकार (0-7)
;   बिट 3-0 : चौड़ाई/ऊँचाई / उप प्रकार
```

जब "next screen" बिट सेट होता है, तो वर्तमान कार्य कॉलम 1 बढ़ता है। यह पहले 16 कॉलम से परे वस्तुएँ रखने देता है। वस्तुएँ **क्रम में** सूचीबद्ध होनी चाहिए (बाएँ से दाएँ) क्योंकि खेल उन्हें क्रमिक लोड करता है :

```asm
; लोड दिनचर्या में प्रति कॉलम दो चरण हैं :
; चरण 1 : इस कॉलम पर शुरू होने वाली नई वस्तुएँ खोजना
;            और उन्हें कतार (queue) में जोड़ना
; चरण 2 : कतार में हर वस्तु tile बनाकर प्रोसेस करना,
;            और जो इस कॉलम पर खत्म होती हैं उन्हें हटाना
```

कतार ठीक **3 slot** करती है। सीधा परिणाम : उसी कॉलम पर शुरू होने वाली 3 से ज्यादा वस्तुएँ नहीं हो सकतीं। अगर कतार भरी है, तो चौथी वस्तु नजरअंदाज की जाती है और कभी लोड नहीं होगी।

इसीलिए अच्छी तरह डिजाइन स्तर बहुत सी वस्तुएँ ढेर करने से बचते हैं। 1-2 में उदाहरण : छत में 1up block + बगल की ईंटें 3 की सीमा सम्मान देने के लिए दो अलग वस्तुओं में बाँटी गई हैं।

### विशेष Y स्थिति : 12, 13, 14, 15

जब Y=12, तो वस्तु की Y स्थिति नहीं होती (वह प्रकार से hardcoded है) :

```asm
; Y=12 : Y स्थिति रहित वस्तुएँ
;   प्रकार 0 : गड्ढा (जमीन हटाता है)
;   प्रकार 1 : चल platform rope
;   प्रकार 2-4 : स्थिर Y वाले पुल
;   प्रकार 5 : पानी/लावा वाला गड्ढा
;   प्रकार 6-7 : ? block पंक्तियाँ
```

जब Y=13, तो दो उपसमूह। अगर byte 1 का बिट 6 1 है :

```asm
; Y=13, bit6=1 : विशेष वस्तुएँ
;   0 = L-pipe (cutscene), 1 = flagpole, 2-3 = पुल/धुरी/hamer (महल अंत)
;   4 = stop screen, 5 = random enemies, 6 = loop level, 7+ = संभावित crash
```

अगर bit6=0, तो 5 कम वजन बिट **screen skip** एन्कोड करते हैं (एक एक करके next screen flag से गुजरे बिना सीधे N स्क्रीन पर छलांग)।

जब Y=14 : bit6=1 के साथ प्रकार modifier बदलने के लिए वही सिद्धांत, पृष्ठभूमि + floor pattern बदलने के लिए bit6=0।

### floor pattern : जमीन के 16 रूप

स्तरों की जमीन अलग वस्तुओं से नहीं बनी है। SMB1 **floor pattern** इस्तेमाल करता है, पृष्ठभूमि रूप जो अगले बदलाव तक सभी कॉलम पर लागू होता है :

```asm
; Floor pattern (4 बिट = 16 संभावनाएँ)
;   0 = पूर्ण खाली
;   1 = 2 tile ऊँची जमीन
;   2 = 1 tile ऊँची जमीन
;   3 = जमीन + bottom
;   4 = जमीन + bottom 2
;   5 = जमीन 1/2 tile
;   6 = 3/4 जमीन
;   ... 15 तक = पूर्ण भरा (जमीन + छत)
```

इसीलिए गड्ढे वस्तुएँ हैं : वे बाकी सब के लिए pattern बदले बिना विशिष्ट कॉलम पर floor pattern override करते हैं।

### 256 byte सीमा और repeat

स्तर का सारा tile डेटा **अधिकतम 256 byte** में समाता है। 6502 का Y register सूचकांक के रूप में इस्तेमाल होता है, और वह 8 बिट करता है। अगर खेल $FD byte मिले बिना डेटा अंत पहुँचता है, तो **वह शुरुआत में लूप** करता है और 256 byte अनंत दोहराता है :

```asm
; सूचकांक Y = 8 बिट → अधिकतम 256 byte tile डेटा
; अगर Y overflow (255 → 0) बिना $FD मिले → repeat
; sprite के लिए भी वही, लेकिन pipe वस्तुएँ (3 byte)
; हर लोड पर सूचकांक समता बदलती हैं।
```

कुछ glitch level इस repeat का शोषण करते हैं ताकि "अनंत" चलने वाले स्तर बनाएँ।

### sprite तंत्र : 2 byte + pipe transition

sprite समान प्रारूप चलते हैं, लेकिन header के बिना और कुछ मुख्य अंतरों के साथ। byte $FF सूची अंत चिह्नित करता है।

```asm
; sprite प्रारूप (2 byte) :
; Byte 0 : X स्थिति (कॉलम)
; Byte 1 :
;   बिट 7 : NEXT SCREEN FLAG
;   बिट 6-0 : sprite प्रकार
;       कुछ प्रकार शामिल हैं : goomba, koopa, Blooper,
;       Bullet Bill, Lakitu, Spiny, platform,
;       warp क्षेत्र कमांड, toad/राजकुमारी,
;       शत्रु समूह spawn कमांड
```

byte 1 का कम वजन बिट **hard level flag** है : अगर 1 पर सेट है, तो sprite सिर्फ ≥ 5-3 स्तरों में प्रकट होता है। "hard mode" स्तर ऐसे बनाए जाते हैं।

Y स्थिति 15 = **screen skip** (tile जैसा)। Y स्थिति 14 = **pipe transition** (3 byte) :

```asm
; Sprite Y=14 : pipe/vine transition (3 byte !)
;   Byte 0 : X स्थिति
;   Byte 1 : बिट 6-0 = Level ID 7-बिट (गंतव्य)
;   Byte 2 : बिट 4-0 = गंतव्य screen
;            बिट 7-5 = world जहाँ यह transition वैध है
;
; world क्यों ? बोनस कमरे world के बीच फिर से इस्तेमाल होते हैं।
; उदाहरण : 1-1 बोनस कक्ष 2-1 और 7-1 भी इस्तेमाल करते हैं।
; इस कक्ष में 3 transition हैं, प्रति world एक, ताकि Mario
; सही जगह फिर से प्रकट हो।
```

sprite में **queue तंत्र नहीं** है। एकमात्र सीमा है कि spawn क्षेत्र (स्क्रीन दाएँ ठीक बाहर) में एक साथ लोड 4 से ज्यादा sprite नहीं हो सकते। उसके परे, sprite नजरअंदाज किए जाते हैं।

## glitch world तक कैसे पहुँचें

दो मुख्य विधियाँ हैं।

### क्लासिक विधि : wall clip

wall clip (दीवारों से गुजरना) सामान्य स्तर से निकलकर छिपे warzone तक चलने देता है। RAM से world counter हेरफेर करके, कोई भी Level ID लोड किया जा सकता है।

तकनीक :
1. World 1-2 : छिपे अंत पाइप में जाना
2. दाएँ दीवार पर wall clip करना
3. warp क्षेत्र तक शून्य में चलना
4. खेल मानों को world की तरह व्याख्या करता है

लेकिन यह विधि glitch world के छोटे हिस्से तक ही पहुँच देती है।

### चरम विधि : NES Tennis cart swap

पूरा विवरण के लिए ऊपर "warm start" खंड देखो। संक्षेप में : Tennis कदम counter SMB1 शुरुआत world वाले RAM byte पर लिखता है, और warm start पहचान यह मान संरक्षित करती है।

### छेड़छाड़ कोना : सब खोजने का कोड

अगर तुम emulator में सारे glitch खुद खोजना चाहते हो, तो तुम Level ID सीधे patch कर सकते हो :

```asm
; FCEUX / Mesen के लिए Patch :
; RAM पता $075F = वर्तमान Level ID
; RAM पता $0760 = Area Type (0=Water, 1=Overworld, 2=Underground, 3=Castle)

; उदाहरण : Overworld में Level 57 (0x39) लोड करना
; emulator में, स्मृति tracer खोलो और लिखो :
; $075F = 0x39
; $0760 = 0x01
; फिर warp पाइप में प्रवेश करो या मरो और फिर से शुरू करो
; → खेल Overworld में स्तर ID $39 लोड करता है
```

RGMechEx ने tile pointer, sprite pointer, और स्तर का दृश्य नक्शा दिखाने वाली हर प्रविष्टि के साथ 128 स्तर × 4 प्रकार की पूरी सूची [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html) पर प्रकाशित की।

## सबसे wtf स्तर

### Level ID $1F (Water) : एक में 15 glitch world

tile pointer $A302 (3-4) sprite pointer $02A0 से संयुक्त 15 अलग glitch world देता है (D-1, J-1, Y-1, Z-1, 55-1, 73-1...)। व्याख्या : sprite pointer ROM क्षेत्र की ओर इंगित करता है जिसमें खेलने योग्य परिणाम बनाने के लिए वैध sprite के पर्याप्त करीब डेटा है, लेकिन overworld sprite के साथ महल 3-4 tile का संयोजन बेतुका रेंडर बनाता है।

### Level ID $28 (Overworld) : 38 glitch world = record

पूर्ण record। 38 glitch world प्रविष्टियाँ उसी स्तर की ओर इंगित करती हैं (2-1 tile + $9F51 sprite)। क्यों ? क्योंकि sprite pointer $9F51 ROM क्षेत्र में गिरता है जो बहुत से ID से padding/ध्वनि डेटा के रूप में इस्तेमाल होता है।

### Level ID $49 (Underground) : FDS स्तर

Tile pointer $76AE + sprite pointer $1C9D। tile pointer Famicom Disk System संस्करण के लिए आरक्षित ROM क्षेत्र की ओर इंगित करता है। परिणाम : ऐसे tile वाला स्तर जो मानक कार्ट्रिज में मौजूद नहीं हैं। यह वह स्तर है जो स्तर 52-1 और 196-1 प्रकट करता है।

### Level ID $00-$02 : असली बोनस स्तर

ये ID खेल के वैध उपस्तरों इस्तेमाल करते हैं :

- **$00** : 5-2/6-2 पानी के नीचे क्षेत्र (H-1, 39-1 इस्तेमाल करते हैं)
- **$01** : 2-2/7-2 पानी (Minus World, 36-1)
- **$02** : 8-4 उपस्तर (136-1, 151-1, 215-1)

सामान्यतः पहुँच योग्य "बोनस" स्तर और glitch world के बीच अंतर यह है कि warp क्षेत्र वर्तमान world जाँचते हैं :

```asm
; warp क्षेत्र जाँच (सरलीकृत)
; खेल जाँचता है कि लक्ष्य world 1 और 8 के बीच है
CheckWarp:
  lda TARGET_WORLD
  cmp #1
  bcc InvalidWarp       ; < 1 → अस्वीकृत
  cmp #9
  bcs InvalidWarp       ; > 8 → अस्वीकृत
  ; सिर्फ 1 और 8 के बीच वैध world
  jmp DoWarp
```

8 से ज्यादा या 0 संख्या वाले glitch world सामान्य पाइपों से नहीं पहुँचे जा सकते। wall clip या cart swap चाहिए।

## कुछ स्तर crash क्यों करते हैं : jump table

जब खेल tile वस्तु लोड करता है, तो वह उसके प्रकार को **jump table** में सूचकांक के रूप में इस्तेमाल करता है :

```asm
; मानक tile वस्तुओं की Jump table (प्रकार 0-11)
JumpTable_TileObjects:
  .word Obj_Special       ; प्रकार 0 : ? ब्लॉक, hidden, flagpole...
  .word Obj_Platform      ; प्रकार 1 : विशेष platform
  .word Obj_BrickRow      ; प्रकार 2 : ईंट पंक्ति
  .word Obj_BlockRow      ; प्रकार 3 : block पंक्ति
  .word Obj_CoinRow       ; प्रकार 4 : सिक्का पंक्ति
  .word Obj_BrickCol      ; प्रकार 5 : ईंट कॉलम
  .word Obj_BlockCol      ; प्रकार 6 : block कॉलम
  .word Obj_Pipe          ; प्रकार 7 : पाइप
  .word Obj_8             ; प्रकार 8
  .word Obj_9             ; प्रकार 9
  .word Obj_10            ; प्रकार 10
  .word Obj_11            ; प्रकार 11
```

![jump table : अमान्य वस्तु प्रकार खेल crash क्यों कराता है](/images/smb1-glitch-levels/v4-jump-table.jpg)

अगर वस्तु का प्रकार अमान्य है (≥12), तो खेल इस तालिका में मौजूद न pointer पर छलांग लगाता है। **4 संभावित परिणाम** :

1. **वैध Pointer** → वस्तु सामान्य लोड होती है
2. **दूसरी jump table की ओर Pointer** (अतिव्यापन) → अलग वस्तु प्रकट होती है। उदाहरण : प्रकार 12 Y=13 तालिका की ओर इंगित करता है, जो L-pipe देता है।
3. **निष्पादन योग्य की ओर Pointer** → बेतरतीब कोड निष्पादन (संभावित crash)
4. **स्पष्ट Placeholder (NOP)** → वस्तु कुछ नहीं करती (कुछ sprite ऐसे हैं, जगह पर उड़ने वाले शत्रु बनाते हैं बिना हिले)

![Glitch level ID $58 : sprite pointer अमान्य पते की ओर इंगित करता है, खेल crash करता है](/images/smb1-glitch-levels/v4-glitch-58-crash.jpg)

![Glitch level ID $50 : cloud tunnel, भ्रष्ट डेटा से उत्पन्न स्तर](/images/smb1-glitch-levels/v4-glitch-50.jpg)

glitch level ID $58 (crash करने वाली सुरंग) : उसका sprite pointer स्मृति क्षेत्र की ओर इंगित करता है जो **ROM mapper रहित NES पर मौजूद नहीं है**। खेल स्थिति (0,0) पर प्रति frame 5 बार वही Koopa लोड करने की कोशिश करता है, जो PPU संतृप्त करता है और freeze कराता है।

```asm
; ID $58 crash क्यों करता है :
; Sprite pointer → अमान्य पता (मानक NES स्थान से बाहर)
; → खेल अनिर्धारित byte को sprite प्रकारों की तरह पढ़ता है
; → Koopa $00 (बिना handler अमान्य प्रकार) पुनरावर्ती कॉल में लूप करता है
; → 6502 Stack overflow → freeze
```

### pipe warp विरोधाभास

`target_world BETWEEN 1 AND 8` जाँच याद रखो। भले ही तुम्हें glitch world में पाइप मिले, खेल जाँचता है कि गंतव्य world 1 और 8 के बीच है। glitch world की संख्याएँ 8 से ज्यादा हैं (36-1, 255-1...), इसलिए warp विफल होती है।

इसीलिए Minus World का अंत नहीं है : sprite में flagpole मौजूद नहीं है, और पाइप कहीं नहीं ले जाते।

### एक कॉलम में 5 वस्तुओं की चाल

edge case मौजूद है जो प्रति कॉलम 3 वस्तुओं की सीमा पार करने देता है। जब कतार अवरुद्ध होती है (slot भरे + अगली वस्तु में next screen flag छूटा), तो खेल next screen flag वाली वस्तु मिलने तक लूप में वर्तमान कॉलम "पूर्व प्रोसेस" करता है। हर पूर्व प्रोसेसिंग के दौरान :

```asm
; कॉलम पूर्व प्रोसेसिंग के दौरान :
; 1. कतार में वस्तुएँ अपनी बची चौड़ाई देखती हैं
;    कॉलम की हर "नकली बढ़त" पर घटाई जाती है
; 2. अगर वस्तु चौड़ाई=0 पहुँचती है, तो वह कतार छोड़ती है
; 3. मुक्त slot नई वस्तु से भरा जा सकता है
;    उसी कॉलम में जोड़ी गई

; परिणाम : उसी कॉलम पर 5 तक वस्तुएँ प्रोसेस हो सकती हैं।
; तकनीक : screen सीमा पार करने वाली 2 वस्तुएँ रखना
; (slot 1 और 2), X < पिछला वाली 1 dummy वस्तु (कतार अवरुद्ध करती है),
; फिर अगले screen के X=0 पर 3 वस्तुएँ (एक next screen flag वाली)।
```

इसे "queue skip" कहते हैं और कुछ romhacker इसका इस्तेमाल प्रारूप सामान्यतः देने से घने स्तर बनाने के लिए करते हैं।

## संस्करणों के बीच अंतर

### Famicom Disk System

SMB1 का FDS संस्करण **अलग memory map** रखता है। सभी स्तर pointer बदले हुए हैं, लेकिन डेटा वही है। जो बदलता है : glitch world सूचकांक पूरी तरह अलग हैं :

```
FDS World 36 → Level ID $09 (5-3 का पानी संस्करण)
  → flagpole मौजूद है ! स्तर खत्म किया जा सकता है।
  → फिर : $27 (सामान्य 7-3) → $44 (4-4 underground)
  → $44 खत्म करने योग्य है → कुल्हाड़ी काम करती है → खेल अंत !

FDS Minus World इसलिए "बोनस world" है जो
खेल पूर्णता तक ले जा सकता है, NES संस्करण के विपरीत।
```

मेरा पसंदीदा FDS स्तर : **ID $5F**, निचली tunnel में 3-3 दूसरे भाग का भूमिगत संस्करण (अफसोस कि यह autoscroller है)।

### The Lost Levels (जापानी Super Mario Bros. 2)

Lost Levels बहुत कुछ बदलता है :

1. **समान tile/sprite क्रम** : और Frankenstein level नहीं (tile और sprite अमान्य ID से भी वही स्तर लोड करते हैं)
2. high/low अलग दो तालिकाओं के बजाय **एकल 16-बिट pointer तालिका**
3. FDS के लिए split **4 डिस्क फाइल** :
   - फाइल 1 : world 1-4
   - फाइल 2 : world 5-8
   - फाइल 3 : world 9 + sound engine
   - फाइल 4 : world A-D (पूरी तरह अलग pointer तालिका)
4. **वही Level ID = 4 संभावित स्तर** लोड फाइल अनुसार
5. **और Tennis glitch नहीं** : continue विकल्प (game over बाद उसी world में जारी) warm start बेकार बनाता है, और खेल world > 9 होने पर **तुरंत reset** करता है
6. **नई वस्तुएँ** : जहरीला मशरूम, अदृश्य block, अदृश्य block fire flower, उल्टे पाइप, हवा, लेकिन मौजूदा सूचियों के बीच डाली गईं → SMB1 के साथ **backward असंगति**
7. world 4 बाद **Piranha Plant हमेशा लाल**, **हरे springboard** सिर्फ world 2/B/3/C/7 में

### Super Mario All-Stars (SNES)

उसी 6502 दिनचर्या वाला सीधा portage (SNES संगत मोड में NES कोड निष्पादित करता है) :

- **Warp क्षेत्र ठीक किया गया** : और Minus World नहीं (पाठ प्रकट होने से पहले बाएँ पाइप में प्रवेश सही world ले जाता है)
- **Plantage** : ज्यादातर glitch level crash करते हैं (ID $6A और 9-1 सिवाय)
- **जोड़े महल वस्तुएँ** : ज्यादा अनोखे रेंडर
- **लेकिन** : **4-2 wrong warp** अभी भी काम करता है (patch नहीं !)

### 4-2 wrong warp : वस्तु placement bug

4-2 में, दो pipe transition वस्तुएँ हैं : बेल (warp क्षेत्र) और पाइप (coin cash कमरा)। पहली transition वस्तु (बेल वाली) बेल स्क्रीन पर प्रकट होने से **काफी पहले** रखी गई है। दूसरी (पाइप वाली) स्तर में **बहुत देर** रखी गई है।

```asm
; 4-2 में transition समय :
; transition वस्तु 1 (बेल → warp क्षेत्र) : बेल से 3 स्क्रीन पहले रखी गई
; transition वस्तु 2 (पाइप → coin cash) : पाइप के 1 स्क्रीन बाद रखी गई
;
; सामान्यतः पहली वस्तु Mario
; पाइप पहुँचने से पहले निष्क्रिय होती है। लेकिन अगर Mario तेज जाता है (या
; ब्लॉक B+right shortcut इस्तेमाल करता है), तो बेल transition
; अभी भी सक्रिय है जब वह पाइप छूता है !
; → खेल coin cash के बजाय warp क्षेत्र लोड करता है।
;
; अगर वस्तु बेल ठीक बाद लेकिन पाइप से पहले
; रखी गई होती, तो bug मौजूद नहीं होता।
```

### लूप स्तर

loop (8-4, 7-4) कैसे काम करते हैं ? स्तर में hardcoded स्क्रीन संख्या और Y स्थितियों वाले **checkpoint** हैं :

```asm
; Checkpoint : {screen_number, vertical_position}
; अगर Mario सही ऊँचाई पर यह checkpoint पार करता है → स्तर जारी रहता है
; वरना → 4 स्क्रीन पीछे warp (64 block)
;
; अनंत लूप बनाने के लिए : vertical_position = $F0
; (स्क्रीन नीचे के नीचे) → मान्य करना असंभव।
;
; checkpoint सरल हैं (एकल flag) world 7 सिवाय
; जो triplet इस्तेमाल करता है (3 flag, कम से कम 1 विफल होना होगा)
;
; warp back कठोर है : tile data offset hardcoded मान पर सेट,
; sprite data offset 0 पर वापस। मौजूद शत्रु
; तुरंत unload होते हैं → firebar गायब हो जाते हैं।
```

## प्रारूप बदलना, कोड नहीं

इस आर्किटेक्चर के सबसे आकर्षक सबकों में से एक यह है कि SMB1 developer 6502 रेंडर कोड कभी छुए बिना बहुत अभिव्यंजक स्तर तंत्र बनाने में सफल रहे। स्तरों के बीच सारी भिन्नता **डेटा** (pointer, वस्तुएँ, sprite, floor pattern) से आती है, कोड से नहीं।

256 glitch world मौजूद हैं क्योंकि **pointer तालिकाएँ 128 प्रविष्टियों × 4 प्रकार के लिए आकार** की हैं, और खेल कभी उन मानों को मान्य नहीं करता जिन्हें वह पढ़ता है। जब pointer RAM में गिरता है, तो खेल Mario register को tile की तरह व्याख्या करता है। जब pointer ध्वनि डेटा में गिरता है, तो खेल level design के रूप में संगीत बजाता है। और जब jump table overflow करती हैं, तो खेल crash तक कुछ भी निष्पादित करता है।

![More Super Mario Bros. Mechanics Explained , चौथा वीडियो](/images/smb1-glitch-levels/yt-mechanics.jpg)

## इन सबसे क्या सीख सकते हैं

1. **tile/sprite अलगाव** : दो परतों की पूर्ण स्वतंत्रता, अलग भंडारण क्रमों के साथ जो अनोखे Frankenstein level बनाते हैं
2. **संपीड़न RLE + वस्तु तंत्र** : स्तर bitmap नहीं बल्कि रखी वस्तुओं की सूचियाँ हैं, जमीन के लिए floor pattern के साथ
3. **3 slot कतार** : hardware (और स्तर डिजाइन) की कड़ी सीमा
4. **pointer पर पूर्ण भरोसा** : खेल pointer और jump table पर भरोसा करता है, जो या तो खेलने योग्य glitch या crash बनाता है
5. **अधिकतम 256 byte** : 6502 Y register की सीमा, जो बहुत दूर जाने पर डेटा दोहराती है
6. **Warm start / cold start** : "जारी" तंत्र जिसने cart swap Tennis → Mario का द्वार खोला

सबसे सुंदर : यह सब, 40KB में समाने वाला 6502 कोड है। कोड सीधे hardware से संवाद करता है और हर स्मृति पहुँच पर पूर्ण भरोसा देता है। अगर pointer सड़ा है, तो खेल crash करता है। और crash को हम glitch world कहते हैं।

## याद रखने वाली 3 चीजें

1. **glitch world खराब गिरने वाले pointer हैं** , खेल में 128 ID × 4 क्षेत्र प्रकार हैं, लेकिन सिर्फ 34 अनोखे स्तर। जब world number भ्रष्ट होता है (Tennis या wall clip से), तो खेल दूसरे स्तर के लिए डिजाइन pointer लोड करता है, और 512 संभावित संयोजन अप्रत्याशित परिणाम बनाते हैं।

2. **Minus World warp bug और भ्रष्टाचार का संयुक्त है** , 1-2 में बायाँ पाइप, अगर पाठ प्रकट होने से पहले सक्रिय होता है, तो world 36 (0x24) लोड करता है। यह world Level ID $01 (2-2 पानी) की ओर इंगित करता है, flagpole रहित स्तर। और चूँकि world 36 के लिए pipe transition नहीं है, स्तर अनंत लूप करता है। जाँच अनुपस्थिति icon बनाती है।

3. **Tennis → Mario, OoT → Paper Mario से 15 साल पहले** , NES RAM condenser और SMB1 warm start / cold start तंत्र से cartridge swap बचती है। Tennis कदम counter (जो कदम ध्वनि बजाकर RAM byte बढ़ाता है) ठीक world number पते पर गिरता है। top score अंक 0 रहने होंगे, $A5 byte अक्षुण्ण होना होगा, और खेल को warm start पहचानना होगा, परिस्थितियों का पूर्ण संयोग जो सिर्फ Tennis से काम करता था।

[Retro Game Mechanics Explained](https://www.youtube.com/c/RetroGameMechanicsExplained) के मूल वीडियो चींटी काम हैं, 6502 disassembly, सभी स्तरों के स्वचालित नक्शे, cart swap और warm start व्याख्याओं पर विवरण स्तर। अगर तुमने शृंखला नहीं देखी, तो देखो, यह छोटी है और हर मिनट घना है।

नक्शों का स्रोत कोड [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html) पर उपलब्ध है, और SMB1 का पूरा disassembly बहुत से repo पर ओपन सोर्स है। 40 साल पहले, जापानी programmer ने शून्य इकाई परीक्षण और शून्य bug tracker के साथ 6502 में यह स्तर तंत्र लिखा था, और हम आज उनका कोड खोलकर अनुकूलन तकनीकें सीखना जारी रखते हैं।
