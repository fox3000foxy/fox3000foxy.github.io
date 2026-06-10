---
title: "Super Mario Bros. : लेवल फ़ॉर्मेट, पॉइंटर्स और 256 ग्लिच वर्ल्ड्स"
description: "128 लेवल्स × 4 ज़ोन टाइप्स 40KB ROM में कैसे समाते हैं, Minus World क्यों मौजूद है, और NES Tennis के एक मैच से ग्लिच वर्ल्ड्स कैसे लोड होते हैं।"
date: 2026-06-10
tags:
  - retro
  - reverse-engineering
  - nintendo
  - nes
  - 6502
  - mario
authors:
  - fox3000foxy
---

## परिचय

Super Mario Bros. में 40 किलोबाइट ROM है। आठ वर्ल्ड्स, 32 लेवल्स, दुश्मन, संगीत, पावर-अप्स -- सब कुछ इसी में समाया हुआ है।

लेकिन अगर तुम एक एम्यूलेटर खोलो और सही बाइट्स के साथ छेड़छाड़ करो, तो तुम लेवल 36-1 लोड कर सकते हो। या 255-1। या एक ऐसी दुनिया में पहुँच सकते हो जहाँ सब कुछ Bowser के स्प्राइट्स और ऐसी पाइप्स से बना है जो कहीं नहीं ले जातीं।

ये ग्लिच वर्ल्ड्स एक सरल कारण से मौजूद हैं: SMB1 का लेवल स्टोरेज सिस्टम 8-बिट ऑप्टिमाइज़ेशन का एक अद्भुत नमूना है, और जब हम गेम को उस जगह पढ़ने के लिए मजबूर करते हैं जहाँ नहीं पढ़ना चाहिए, तो परिणाम बेहद रोचक आते हैं।

Retro Game Mechanics Explained ने इस पर 4 वीडियो की एक सीरीज़ बनाई है -- हम इसे एक ही लेख में संकलित कर रहे हैं, उस ज़माने के सबसे ज़्यादा बिकने वाले गेम के 6502 कोड में गोता लगाते हुए।

![GLITCH OBJECTS -- RGMechEx की SMB1 की छिपी हुई मैकेनिक्स पर सीरीज़ का शीर्षक कार्ड](/images/smb1-glitch-levels/title-card.jpg)

![World 9-1 -- Tennis कार्ट स्वैप से एक्सेस होने वाले पहले ग्लिच वर्ल्ड का टाइटल स्क्रीन](/images/smb1-glitch-levels/v1-title-9-1.jpg)

## वार्म स्टार्ट: Tennis की RAM SMB1 में क्यों जीवित रहती है

लेवल स्टोरेज की बात करने से पहले, यह समझना ज़रूरी है कि SMB1 कैसे शुरू होता है। क्योंकि NES Tennis का कार्ट स्वैप ग्लिच पूरी तरह से गेम के **वार्म स्टार्ट / कोल्ड स्टार्ट डिटेक्शन सिस्टम** पर निर्भर करता है।

### संरक्षित 41 बाइट्स

जब SMB1 **कोल्ड स्टार्ट** का पता लगाता है (पहली बार पावर ऑन या पावर ऑफ/ऑन), तो यह पूरी RAM मिटा देता है। लेकिन जब यह **वार्म स्टार्ट** का पता लगाता है (रीसेट बटन, पावर कट के बिना), तो यह **41 बाइट्स** की एक मेमोरी क्षेत्र को संरक्षित रखता है:

```asm
; Les 41 bytes préservés en RAM lors d'un warm start
; Adresses $075F-$0787
;
; $075F : byte de démarrage (world - 1)    [1 byte]
; $0760 : flag de sélection de monde (B button) [1 byte]
; $0761-$0762 : inutilisé                    [2 bytes]
; $0763-$0768 : timer (6 digits, 3 affichés) [6 bytes]
; $0769-$076E : coins Luigi                   [6 bytes]
; $076F-$0774 : coins Mario                   [6 bytes]
; $0775-$077A : score Luigi                   [6 bytes]
; $077B-$0780 : score Mario                   [6 bytes]
; $0781-$0786 : top score (6 digits, 1 caché) [6 bytes]
; $0787 : le byte magique $A5                 [1 byte]
```

ये 41 बाइट्स एक ही कार्य के लिए हैं: खिलाड़ी को **गेम ओवर के बाद उसी वर्ल्ड में जारी रखने की अनुमति देना**। अगर तुम 6-3 में मरते हो, तो गेम स्टार्टअप बाइट में वर्ल्ड 6 लिखता है, और टाइटल स्क्रीन पर, अगर तुम A + Start दबाकर रखते हो, तो तुम 6-1 से शुरू करते हो।

![वार्म स्टार्ट के दौरान RAM में संरक्षित 41 बाइट्स -- TOP SCORE, MARIO SCORE, TIMER, WORLD SELECT, CONTINUE WORLD, और जादुई बाइट $A5](/images/smb1-glitch-levels/v1-memory-state.jpg)

### वार्म स्टार्ट की डबल जाँच

![कोल्ड स्टार्ट बनाम वार्म स्टार्ट -- रीसेट डिटेक्शन का डायग्राम](/images/smb1-glitch-levels/v1-warm-start.jpg)

जब SMB1 बूट होता है, तो यह सिर्फ एक मापदंड नहीं बल्कि **दो** जाँचता है:

```asm
CheckWarmStart:
  ; 1. Vérifier le byte magique $A5 à $0787
  lda $0787
  cmp #$A5
  bne ColdStart        ; pas $A5 → cold start

  ; 2. Vérifier les 6 digits du top score ($0781-$0786)
  ;    Chaque digit doit être entre 0 et 9
  ldx #0
CheckLoop:
  lda $0781,x
  cmp #$0A
  bcs ColdStart        ; digit >= 10 → cold start
  inx
  cpx #6
  bne CheckLoop

  ; Si les deux conditions passent → warm start
  ; La RAM n'est pas effacée, le monde de départ est préservé
  jmp WarmStartBoot
```

![बाइट $A5 और टॉप स्कोर के डिजिट्स की जाँच -- वार्म स्टार्ट का कोर](/images/smb1-glitch-levels/v1-a5-byte.jpg)

डबल जाँच क्यों? क्योंकि $A5 बाइट किसी संयोग से भी मौजूद हो सकता है (कोई अन्य गेम जो यह वैल्यू छोड़ गया हो, या RAM चिप की डिफ़ॉल्ट आराम स्थिति)। टॉप स्कोर के डिजिट्स की वैधता (0-9) जाँचकर, हम सुनिश्चित करते हैं कि डेटा सुसंगत है।

### Tennis ही एकमात्र गेम क्यों है जो काम करता है

जब हम पहली बार SMB1 डालते हैं (कोल्ड स्टार्ट), तो गेम:
1. पूरी RAM मिटाता है → टॉप स्कोर = 0, वर्ल्ड बाइट = 0
2. पता $0787 पर $A5 लिखता है

इसके बाद, हम कंसोल बंद किए बिना Tennis पर स्विच करते हैं। Tennis:
- **शुरुआत में RAM साफ नहीं करता** (बहुत कम NES गेम्स ऐसा करते हैं)
- **टॉप स्कोर बाइट्स पर नहीं लिखता** → वे 0 (वैध) बने रहते हैं
- **$A5 बाइट को छूता नहीं** → वह मौजूद रहता है
- **पता $075F** का उपयोग खिलाड़ी के कदमों के काउंटर के लिए करता है

```asm
; Le footstep increment dans Tennis :
; À chaque pas du joueur sur le court, Tennis incrémente le byte à $075F.
; Ce même byte est utilisé par SMB1 comme "world number - 1".
;
; 0 pas  → world 0 → SMB1 = world 1
; 1-7 pas → world 1-7 → worlds normaux
; 8+ pas → world 8+ → glitch worlds !
;
; Le compteur ne s'incrémente que quand la musique s'arrête
; (les footstep sounds ne jouent pas pendant la musique).
```

जब हम SMB1 वापस लगाते हैं:
1. $A5 बाइट अभी भी वहाँ है (Tennis ने इसे नहीं छुआ)
2. टॉप स्कोर के डिजिट्स अभी भी 0 हैं (वैध)
3. वर्ल्ड बाइट अब 8+ है (Tennis के कदमों से बढ़ा)
4. SMB1 वार्म स्टार्ट का पता लगाता है → खराब वर्ल्ड बाइट को संरक्षित करता है
5. A + Start दबाकर रखने पर → world 9-1, world A-1, world 36-1, आदि

### Tennis से पहले Mario क्यों बूट करना होगा

एक बारीकी: पहले SMB1 बूट करना होगा, फिर Tennis, फिर वापस SMB1। अगर तुम सीधे Tennis से शुरू करो, तो $A5 बाइट कभी नहीं लिखी जाएगी (Tennis $A5 नहीं लिखता), इसलिए वार्म स्टार्ट डिटेक्शन फेल हो जाएगा और RAM मिटा दी जाएगी।

![Tennis का कदम काउंटर: हर कदम वर्ल्ड बाइट बढ़ाता है](/images/smb1-glitch-levels/v1-footstep.jpg)

![NES Tennis के माध्यम से Glitch Worlds एक्सेस करना -- कार्ट स्वैप समझाने वाला वीडियो](/images/smb1-glitch-levels/yt-tennis.jpg)

## SMB1 अपने लेवल्स को 40KB में कैसे स्टोर करता है

Nintendo R&D4 को एक सरल दिखने वाली समस्या हल करनी थी: ऐसे लेवल्स को दर्शाना जो हॉरिज़ॉन्टली स्क्रॉल करते हैं -- टाइल्स, दुश्मन, आइटम्स, सब कुछ एक बेहद सीमित ROM बजट में।

समाधान दो पूरी तरह से स्वतंत्र डेटा लेयर्स का विभाजन है:

### टाइल लेआउट (लेवल का मानचित्र)

हर लेवल ROM में एक कंप्रेस्ड टाइल स्ट्रक्चर की ओर इंगित करने वाले पॉइंटर द्वारा परिभाषित होता है। कंप्रेशन सरल लेकिन शानदार है: एक "कंट्रोल" बाइट जिसके बाद 1-3 डेटा बाइट्स होते हैं।

टाइल फ़ॉर्मेट **रन्स** (RLE-जैसी) व्यवस्था का उपयोग करता है:

```asm
; Format tile SMB1 (simplifié)
; Chaque "commande" est un byte contrôle :
;
; $00-$7F : pose une tile, avance d'1 colonne
; $80-$BF : pose une tile répétée N fois (N = byte - $80 + 1)
; $C0-$FF : commande spéciale (fin de ligne, saut, changement de palette)

Exemple : pour dessiner 3 briques consécutives :
  $82 $01    ; répète la tile $01 (brick) 3 fois
```

हर लेवल में 16 कॉलम की 13 पंक्तियाँ टाइल्स की होती हैं (13×16 = 208 दृश्य टाइल्स)। लेकिन कंप्रेस्ड फ़ॉर्मेट से काफ़ी कम जगह घेरी जा सकती है -- उदाहरण के लिए, आसमान और खाली कॉलम बिल्कुल जगह नहीं लेते।

6502 में रेंडरिंग लूप:

```asm
; Décompression tile - loop principale
; Entrée : pointeur tile_data en $XX
; Sortie : tilemap niveau dans la RAM PPU

DecompressTile:
  lda (tile_ptr),y      ; lire byte contrôle
  iny
  cmp #$80
  bcc SingleTile        ; $00-$7F : tile unique
  cmp #$C0
  bcc RunLength         ; $80-$BF : run-length
  jmp SpecialCommand    ; $C0-$FF : commande spéciale

SingleTile:
  sta PPU_DATA          ; écrire la tile directement
  jmp Next

RunLength:
  sec
  sbc #$7E              ; N = control - $7E
  tax
  lda (tile_ptr),y      ; lire la tile à répéter
  iny
: sta PPU_DATA
  dex
  bne :-
  jmp Next
```

### स्प्राइट लेआउट (दुश्मन और ऑब्जेक्ट्स)

साथ ही, दुश्मन और ऑब्जेक्ट्स (ब्लॉक्स ?, ट्यूब, गूम्बास, कूपास) एक पूरी अलग स्ट्रक्चर में स्टोर होते हैं। हर स्पॉन 2 बाइट्स से परिभाषित होता है:

```asm
; Format sprite SMB1
; Byte 0 : position X (en colonnes)
; Byte 1 : type de sprite + bits de page Y
; Y est dérivé de l'index dans la séquence

Une séquence de sprites :
  $01 $4B    ; goomba à la colonne 1
  $09 $4B    ; goomba à la colonne 9
  $10 $61    ; bloc ? à la colonne 16 (contient pièce)
  $15 $54    ; koopa verte à la colonne 21
  $FF        ; fin de séquence
```

हर लेवल अधिकतम 5 अलग-अलग स्प्राइट पेज रेफ़र कर सकता है (यानी, 16 कॉलम के 5 "स्क्रीन")। लेकिन व्यवहार में अधिकतर लेवल्स सिर्फ 2-3 ही उपयोग करते हैं।

### पॉइंटर्स की टेबल

डिज़ाइन का कमाल पॉइंटर्स की टेबल है। हर लेवल एक **पेयर** के रूप में स्टोर होता है ROM पतों का:

```c
// Structure interne (simplifiée) du World Map
struct LevelPointer {
    uint16_t tile_ptr;   // Adresse ROM des données tiles
    uint16_t sprite_ptr; // Adresse ROM des données sprites
};

// 4 tables séparées, une par AreaType :
// 0 = Water, 1 = Overworld, 2 = Underground, 3 = Castle
LevelPointer level_table[4][128];
```

हर टेबल में 128 प्रविष्टियाँ। 4 ज़ोन टाइप्स। **512 संभावित संयोजन**, लेकिन आधिकारिक गेम में सिर्फ एक अंश ही उपयोग होता है। बाकी अनइनिशियलाइज़्ड RAM है या ऐसा डेटा जिसे पॉइंटर्स के रूप में पढ़ा जाता है।

जब गेम एक लेवल लोड करता है, तो यह ऐसा करता है:

```asm
; Chargement d'un niveau
; A = AreaType (0-3), X = LevelID (0-127)

LoadLevel:
  sta AREA_TYPE
  asl                  ; *2 pour offset dans table 16-bit
  tax
  lda LevelTable_TilePtr, x
  sta TILE_PTR
  lda LevelTable_TilePtr+1, x
  sta TILE_PTR+1       ; pointeur vers les tiles
  lda LevelTable_SpritePtr, x
  sta SPRITE_PTR
  lda LevelTable_SpritePtr+1, x
  sta SPRITE_PTR+1     ; pointeur vers les sprites
  jsr DecompressTiles
```

कोई वैलिडेशन नहीं। कोई जाँच नहीं कि पॉइंटर वैध है या नहीं। गेम टेबल में पता पढ़ता है और उस पते पर जो होता है उसे डीकंप्रेस करता है, बस।

![Level ID $06 (Water) -- 9-1, 6-2 का पानी के नीचे का संस्करण](/images/smb1-glitch-levels/lvl-06-9-1.png)

![Level IDs की टेबल: 128 संभावित प्रविष्टियाँ, 34 असाइन की गईं](/images/smb1-glitch-levels/v2-level-id-table.jpg)

![पॉइंटर्स टाइल्स और स्प्राइट्स का अलग क्रम -- Frankenstein levels का कारण](/images/smb1-glitch-levels/v2-pointer-tables.jpg)

### 34 अद्वितीय लेवल्स और 7-बिट ID सिस्टम

![NES की RAM चिप (MB8416A) -- यही कार्ट्रिज स्वैप के दौरान डेटा को संरक्षित रखती है](/images/smb1-glitch-levels/v1-ram-chip.jpg)

SMB1 के पास 32 लेवल्स नहीं, बल्कि **34 अद्वितीय लेवल्स** हैं। बहुत से लेवल्स डुप्लिकेट हैं (5-3 = 1-3 लेकिन Bullet Bills के साथ) जो "हार्ड मोड" फ्लैग से चिह्नित हैं। असली अद्वितीय लेवल्स:

- **पानी** (टाइप 0): 3 लेवल्स (2-2, 7-2, बोनस ज़ोन 5-2/6-2)
- **ओवरवर्ल्ड** (टाइप 1): 22 लेवल्स (जिनमें 2 बोनस क्लाउड रूम्स शामिल हैं)
- **अंडरग्राउंड** (टाइप 2): 3 लेवल्स (जिनमें भूमिगत बोनस रूम्स शामिल हैं)
- **कैस्टल** (टाइप 3): 6 लेवल्स
- \+ 1 कटसीन रूम (भूमिगत/पानी वाले लेवल्स से पहले)
- \+ 1 वार्प ज़ोन 4-2 का

हर लेवल का एक ID **7 बिट्स** पर है। निचले 5 बिट्स = सब-ग्रुप में नंबर, ऊपरी 2 बिट्स = ज़ोन टाइप:

```asm
; Encodage 7-bit du Level ID
; Bits 6-5 : Type (00=Water, 01=Overworld, 10=Underground, 11=Castle)
; Bits 4-0 : Numéro dans le sous-groupe
;
; Water IDs      : $00-$02  (types 00, numéros 0-2)
; Overworld IDs  : $20-$35  (types 01, numéros 0-21)
; Underground IDs: $40-$42  (types 10, numéros 0-2)
; Castle IDs     : $60-$65  (types 11, numéros 0-5)
;
; ID $25 = %0100101 → type 01 (Overworld), numéro 5 → 1-1
; ID $23 = %0100011 → type 01 (Overworld), numéro 3 → 6-2
```

**128 संभावित IDs** ($00-$7F), सिर्फ 34 असली लेवल्स को असाइन किए गए। अनुपयोगी IDs किसी भी चीज़ की ओर इंगित करती हैं।

### पॉइंटर्स की टेबल्स: दो सूचियाँ, दो क्रम

टाइल और स्प्राइट पॉइंटर्स एक ही क्रम में स्टोर नहीं होते। कोड दो अलग 16-बिट सूचियों का उपयोग करता है (हाई बाइट / लो बाइट दो अलग टेबल्स में):

```
Ordre des pointeurs sprites :
  Index 0-5   : Castle (6 niveaux)
  Index 6-27  : Overworld (22 niveaux)
  Index 28-30 : Underground (3 niveaux)
  Index 31-33 : Water (3 niveaux)

Ordre des pointeurs tiles :
  Index 0-2   : Water (3 niveaux)
  Index 3-24  : Overworld (22 niveaux)
  Index 25-27 : Underground (3 niveaux)
  Index 28-33 : Castle (6 niveaux)
```

अलग क्रम क्यों? कोई तकनीकी कारण नहीं -- संभवतः विकास के दौरान डेटा इसी तरह व्यवस्थित किया गया था। लेकिन इसका एक रोचक परिणाम है: जब कोई लेवल ID अवैध होता है, तो टाइल और स्प्राइट पॉइंटर्स *अलग-अलग* लेवल्स लोड करते हैं, जिससे **Frankenstein levels** बनते हैं।

इन दो सूचियों के बीच नेविगेट करने के लिए, गेम छोटी **ऑफसेट टेबल्स** का उपयोग करता है (जैसे विषय सूची):

```asm
; Tables d'offset par type (Water, Overworld, Underground, Castle)
; Chaque entrée = index de début dans la liste correspondante

SpriteOffsetTable:
  .byte $1F, $06, $1C, $00    ; Water=31, Overworld=6, Underground=28, Castle=0

TileOffsetTable:
  .byte $00, $03, $19, $1C    ; Water=0, Overworld=3, Underground=25, Castle=28
```

लेवल 6-2 (ID $23, ओवरवर्ल्ड नंबर 3) लोड करने के लिए:

```asm
; 1. Type = 01 (Overworld) → index dans table d'offset = 1
; 2. Sprite offset = SpriteOffsetTable[1] = 6
;    Index final = 6 + 3 (numéro de niveau) = 9 → 10ème pointeur sprites
; 3. Tile offset = TileOffsetTable[1] = 3
;    Index final = 3 + 3 = 6 → 7ème pointeur tiles
; 4. Résultat : pointeur tiles $A619 + pointeur sprites $9ED0 = 6-2 ✓
```

अब, $43 (अंडरग्राउंड नंबर 3, जो मौजूद नहीं है) जैसे अवैध ID के साथ क्या होता है?

```asm
; ID $43, Type = 10 (Underground), numéro = 3
; Sprite offset = SpriteOffsetTable[2] = $1C = 28
;   Index = 28 + 3 = 31 → 32ème pointeur sprites = eau bonus 5-2 !
; Tile offset = TileOffsetTable[2] = $19 = 25
;   Index = 25 + 3 = 28 → 29ème pointeur tiles = 1-4 (Castle) !
;
; Résultat : un niveau souterrain avec les tiles de 1-4
; et les Bloopers de la zone eau de 5-2. Un vrai Frankenstein.
```

![Level ID $43 -- Frankenstein level: 1-4 की टाइल्स + 5-2 के पानी के स्प्राइट्स](/images/smb1-glitch-levels/lvl-43-frankenstein.png)

![Glitch Level Pointers का अन्वेषण -- ऑफसेट टेबल्स समझाई गईं](/images/smb1-glitch-levels/yt-pointers.jpg)

![वर्ल्ड इंडेक्स टेबल -- जब world 9 का ओवरफ्लो एक ग्लिच लेवल बनाता है](/images/smb1-glitch-levels/v2-world-index-table.jpg)

### वर्ल्ड इंडेक्स टेबल: world 9 ओवरफ्लो क्यों करता है

8 बाइट्स की एक ROM टेबल है जो हर वर्ल्ड (1-8) के पहले लेवल का इंडेक्स देती है। और ठीक उसके बाद, सभी लेवल्स के 36 Level IDs की टेबल गेम क्रम में है।

```asm
; WorldIndexTable (8 bytes)
  .byte 0, 5, 10, 15, 20, 25, 28, 33
;   -> Monde 1 commence au niveau 0
;   -> Monde 2 commence au niveau 5
;   -> Monde 8 commence au niveau 33

; LevelIDTable (36 bytes)
  .byte $25, $28, $29, $26, $24, ... ; les 36 Level IDs
```

जब हम world 9 लोड करने की कोशिश करते हैं, तो गेम WorldIndexTable का 9वाँ बाइट पढ़ता है... जो मौजूद ही नहीं है। यह LevelIDTable में 1 बाइट ओवरफ्लो करता है, $25 वैल्यू पढ़ता है, फिर LevelIDTable में $25 को इंडेक्स (37वीं प्रविष्टि) के रूप में उपयोग करता है -- जो दोबारा SpriteOffsetTable में 2 बाइट्स ओवरफ्लो करता है, और 6 वैल्यू पढ़ता है।

```asm
; World 9 :
;   1. WorldIndexTable[8] (overflow) → lit $25 dans LevelIDTable
;   2. LevelIDTable[37] (overflow) → lit le 2ème byte de SpriteOffsetTable = 6
;   3. ID = 6 → Water level number 6 (qui n'existe pas)
;   4. Tile pointer = pointeur water numéro 6 = tiles de 6-2
;   5. Sprite pointer = index 31+6 = 37 > 33 → pointeur invalide
;   6. Résultat : 6-2 sous l'eau avec des sprites glitchés
;      → world 9-1 !
```

world G (16) के लिए, ओवरफ्लो और भी आगे जाता है और Level ID $01 पर आता है, जो 1-2 से पहले का कटसीन लेवल है:

```asm
; World G (16) :
;   WorldIndexTable[15] → lit $01 dans LevelIDTable
;   LevelIDTable[1] = $29 (cutscene 1-2)
;   → world G-1 = la cutscene d'entrée de 1-2
```

## ग्लिच वर्ल्ड्स क्यों मौजूद हैं

गेम में 32 "वैध" लेवल्स हैं (8 वर्ल्ड्स × 4 लेवल्स)। लेकिन पॉइंटर टेबल प्रत्येक ज़ोन टाइप के लिए 128 प्रविष्टियाँ बनाती है। 32 से ऊपर की प्रविष्टियों में वह होता है जो उन पतों पर ROM में होता है -- कभी कोई अन्य लेवल, कभी साउंड डेटा, कभी RAM, कभी कुछ भी।

![Level ID $01 Water (Minus World) -- टाइल पॉइंटर $AE45, स्प्राइट पॉइंटर $A171](/images/smb1-glitch-levels/minus-world.png)

### Level ID $01 + AreaType 0 = Minus World

ग्लिच वर्ल्ड्स में सबसे प्रसिद्ध। Level ID $01 जो AreaType 0 (पानी) में है, इसकी ओर इंगित करता है:

- **टाइल पॉइंटर: $AE45** → 2-2/7-2 का पानी के नीचे का क्षेत्र
- **स्प्राइट पॉइंटर: $A171** → 2-2/7-2 के स्प्राइट्स

परिणाम: एक पानी का लेवल जो 2-2 जैसा दिखता है, लेकिन अनंत काल तक लूप करता रहता है क्योंकि फ्लैगपोल मौजूद ही नहीं है। लेवल का अंत नहीं, कोई बाहर निकलने का रास्ता नहीं।

यह लेवल 36-1 है (या दुनिया $-1 में 36-1)।

![SMB1 का वार्म स्टार्ट चेक -- यही Minus World को मौजूद रहने देता है](/images/smb1-glitch-levels/v4-minus-world.jpg)

```asm
; Pourquoi le flagpole manque dans le Minus World :
; Les sprites de 2-2/7-2 ($A171) n'ont pas de flagpole
; dans leur séquence. Le jeu cherche le sprite $FD (flagpole)
; mais ne le trouve jamais → boucle infinie
;
; Le jeu continue de générer le niveau à l'infini
; jusqu'à ce que le timer atteigne zéro.
```

### पॉइंटर्स जो RAM की ओर इंगित करते हैं

जब टाइल पॉइंटर या स्प्राइट पॉइंटर ROM के बजाय RAM के पते ($00-$7F) की ओर इंगित करता है, तो गेम RAM के लगातार बदलते मानों को टाइल्स के रूप में पढ़ने की कोशिश करता है:

```asm
; Exemple : Level ID $03 en Water
; Tile Pointer : $A46B (3-3 - valide)
; Sprite Pointer : $009D (pointe vers la RAM page zéro !)
;
; La RAM page zéro contient les registres du jeu,
; la position de Mario, l'état des compteurs...
; Le jeu décompresse ça comme une séquence de sprites,
; et le résultat c'est un niveau avec des ennemis
; qui sont en fait des valeurs de registres.
```

जब ज़ीरो पेज बदलता है (क्योंकि Mario हिलता है, टाइमर चलता है, आदि), तो लेवल के "स्प्राइट्स" भी बदलते हैं। इसलिए कुछ ग्लिच वर्ल्ड्स में दुश्मन टिमटिमाते रहते हैं और लगातार बदलते रहते हैं।

![Level ID $03 Water -- स्प्राइट पॉइंटर $009D RAM की ओर इंगित करता है, अप्रयोग्य लेवल](/images/smb1-glitch-levels/level-03-water.png)

### Level ID $36: खाली लेवल (ओवरवर्ल्ड)

Level ID $36 ओवरवर्ल्ड में:

- **टाइल पॉइंटर: $AC35** (1-2)
- **स्प्राइट पॉइंटर: $A0D8** (1-2)

परिणाम: कुछ नहीं। गेम लेवल लोड करता है लेकिन यह RGMechEx के कैटलॉग में "बिना लेवल" के रूप में चिह्नित है। टाइल्स शायद वैध हैं लेकिन स्प्राइट्स ऐसी जगह की ओर इंगित करते हैं जो एक खाली या गैर-कार्यात्मक लेवल बनाती है।

### Level ID $1D (कैस्टल): क्रैश का चैंपियन

Level ID $1D कैस्टल में:

- **टाइल पॉइंटर: $A210** (4-4)
- **स्प्राइट पॉइंटर: $7EA0** (RAM!)

स्प्राइट पॉइंटर RAM में = अपरिभाषित स्प्राइट्स। गेम पहली टाइल पंक्ति में एक स्पाइनी बॉल या बुलेट बिल ब्लास्टर दिखाने की कोशिश करता है। यह तुरंत क्रैश हो जाता है।

```asm
; Quand le sprite pointer pointe vers la RAM,
; le jeu décompresse des bytes qui changent tout le temps
; comme des instructions "spawn". Le résultat :
; - Apparition d'objets inexistants (valeur undefined)
; - Crash PPU quand le sprite NES essaie d'afficher un tile invalide
; - Freeze complet de la console
```

## 256 ग्लिच वर्ल्ड्स का कैटलॉग

RGMechEx ने एक स्क्रिप्ट लिखा है जो **सभी लेवल्स** के मैप्स जनरेट करता है, 4 ज़ोन टाइप्स के लिए, और हर एक के 128 IDs।

वर्ल्ड काउंटर 8 बिट्स पर है (0-255)। वर्ल्ड्स 1-8 वैध हैं। **248 ग्लिच वर्ल्ड्स** संभावित बचते हैं। हर ग्लिच वर्ल्ड उस वर्ल्ड के पहले लेवल से मेल खाता है, और उसका Level ID WorldIndexTable के ओवरफ्लो मैकेनिज़्म से गणना होता है।

![ग्लिच वर्ल्ड्स की टेबल -- 248 खराब वर्ल्ड्स, 68 पहले लेवल्स एक्सेसिबल](/images/smb1-glitch-levels/v3-glitch-worlds-table.jpg)

128 संभावित IDs में से, सिर्फ **68 किसी वर्ल्ड के "पहले लेवल" हैं** (ग्लिच वर्ल्ड नंबर से एक्सेसेबल)। बाकी 60 लेवल 2+ या अप्रयोग्य हैं।

| टाइप | अद्वितीय खेलने योग्य IDs | क्रैश करने वाले IDs | खाली IDs |
|------|------------------------|---------------------|-----------|
| पानी (0)    | ~20  | ~60  | ~48  |
| ओवरवर्ल्ड (1)| ~30  | ~55  | ~43  |
| अंडरग्राउंड (2) | ~15 | ~65 | ~48  |
| कैस्टल (3)   | ~25  | ~58  | ~45  |

बहुत से IDs एक ही लेवल की ओर ले जाते हैं क्योंकि पॉइंटर्स उन्हीं ROM पतों पर गिरते हैं। उदाहरण के लिए, Level ID $28 (ओवरवर्ल्ड) -- टाइल पॉइंटर $A7CD (2-1) -- **38 अलग-अलग ग्लिच वर्ल्ड्स** में दिखाई देता है, क्योंकि इसका स्प्राइट पॉइंटर $9F51 ROM के एक ऐसे क्षेत्र की ओर इंगित करता है जिसे कई IDs द्वारा पैडिंग/साउंड डेटा के रूप में उपयोग किया जाता है।

![Level ID $28 (ओवरवर्ल्ड) का मानचित्र -- 2-1 की टाइल्स सामान्य स्प्राइट्स के साथ, 38 ग्लिच वर्ल्ड्स](/images/smb1-glitch-levels/level-28-overworld.png)

![Super Mario Bros. Glitch Levels Explained -- तीसरा वीडियो](/images/smb1-glitch-levels/yt-levels.jpg)

### 6 ग्लिच लेवल्स जो सच में अद्वितीय हैं

19 ग्लिच लेवल IDs में से, सिर्फ **6 लोडिंग पर तुरंत क्रैश नहीं होते**:

| वर्ल्ड | Level ID | विवरण |
|-------|----------|-------------|
| E-1 (224) | $50 | एक गड्ढे के ऊपर सिर्फ एक ? ब्लॉक। Mario तुरंत मर जाता है। |
| W | $57 | Mario स्पॉन पर ब्लॉक, हिल नहीं सकता। |
| 42 (133) | $50 | क्लाउड ट्यून जो Mario को फँसाता है अगर वह काफ़ी आगे जाए। |
| 62 (131, 240) | $4D | जमा हुआ कैस्टल: Mario ऊपर स्पॉन होता है, नीचे नहीं गिर सकता → ब्लॉक। |
| 127 | $4B | भूमिगत ट्यून, लेकिन क्रैश अगर बहुत आगे जाओ। |
| 137 | $4B | कटसीन्स का ऑटो-स्क्रॉल एक्टिवेट करता है। Mario एक अकेले ब्रिक ब्लॉक से टकराता है जो हमेशा के लिए रोक देता है। |

![Level ID $50 (क्लाउड ट्यून) -- ग्लिच वर्ल्ड 42-1 और E-1](/images/smb1-glitch-levels/lvl-50-cloud.png)
![Level ID $4D (कैस्टल) -- world 62-1, Mario स्पॉन पर ब्लॉक](/images/smb1-glitch-levels/lvl-4D-castle.png)
![Level ID $4B (ट्यून) -- world 127-1, क्रैश अगर बहुत आगे जाओ](/images/smb1-glitch-levels/lvl-4B-tunnel.png)

248 में से सिर्फ छह ग्लिच वर्ल्ड्स ऐसा कुछ बनाते हैं जो सच में नया हो। बाकी सामान्य लेवल्स हैं गलत ज़ोन टाइप के साथ, या काले स्क्रीन।

## लेवल फ़ॉर्मेट विस्तार से

लेवल डेटा के सटीक फ़ॉर्मेट पर ध्यान दें, ताकि यह समझा जा सके कि ग्लिच लेवल्स क्यों टिकते हैं (या नहीं)।

### लेवल हेडर: 2 बाइट्स, 6 गुण

हर लेवल 2 बाइट्स के एक हेडर से शुरू होता है जो 6 गुणों को नियंत्रित करता है:

```asm
; Byte 0 : timer + Y start + modifier
;   Bits 7-6 : timer (00=inchangé, 01=200, 10=300, 11=400)
;   Bits 5-3 : Y start Mario (111/110 = autowalk)
;   Bits 2-0 : level type modifier
;              000=default, 001=waves, 010=brick wall,
;              011=water bottom, 100=night, 101=snow,
;              110=snow night, 111=gray night

; Byte 1 : platform + background + floor pattern
;   Bits 7-6 : special platform (00=tree, 01=mushroom,
;                                 10=Bullet Bill, 11=cloud)
;   Bits 5-4 : background (00=none, 01=clouds,
;                           10=montains, 11=fences)
;   Bits 3-0 : floor pattern initial (0-15)
```

मॉडिफ़ायर टाइप दृश्य भिन्नताओं को नियंत्रित करता है: पानी के लेवल्स के ऊपर लहरें, 8-3 की ईंट पृष्ठभूमि, 4-3 की रात्रि पैलेट, 6-2 की बर्फ, आदि।

### टाइल ऑब्जेक्ट्स: 2 बाइट्स, नेक्स्ट स्क्रीन फ्लैग, 3-स्लॉट क्यू

हेडर के बाद **टाइल ऑब्जेक्ट्स** की एक सूची आती है, हर ऑब्जेक्ट 2 बाइट्स का होता है। $FD बाइट सूची का अंत चिह्नित करता है।

```asm
; Format objet tile (16 bits) :
; Byte 0 :
;   Bits 7-4 : X position (colonne 0-15)
;   Bits 3-0 : Y position
;     Y=0-11  : position Y normale
;     Y=12    : objets spéciaux (trous, ponts, rope, ? blocks)
;     Y=13    : screen skip / objets spéciaux 2
;     Y=14    : changement de modifier/scenery/floor
;     Y=15    : objets spéciaux 3 (château, escaliers, gros tuyau)

; Byte 1 :
;   Bit  7   : NEXT SCREEN FLAG
;   Bits 6-4 : type d'objet (0-7)
;   Bits 3-0 : largeur/hauteur / sous-type
```

जब "नेक्स्ट स्क्रीन" बिट सेट होता है, तो वर्तमान कार्य कॉलम 1 बढ़ जाता है। यह पहले 16 कॉलम से परे ऑब्जेक्ट्स रखने की अनुमति देता है। ऑब्जेक्ट्स **क्रम में** (बाएं से दाएं) सूचीबद्ध होने चाहिए क्योंकि गेम उन्हें क्रमिक रूप से लोड करता है:

```asm
; La routine de chargement a DEUX phases par colonne :
; Phase 1 : chercher les nouveaux objets qui commencent sur cette colonne
;            et les ajouter à la file d'attente (queue)
; Phase 2 : traiter chaque objet dans la queue en dessinant les tiles,
;            et retirer ceux qui finissent sur cette colonne
```

क्यू में बिल्कुल **3 स्लॉट्स** होते हैं। सीधा परिणाम: एक ही कॉलम पर 3 से ज़्यादा ऑब्जेक्ट्स शुरू नहीं हो सकते। अगर क्यू भरी हो, तो चौथा ऑब्जेक्ट अनदेखा कर दिया जाता है और कभी लोड नहीं होगा।

इसलिए अच्छी तरह डिज़ाइन किए गए लेवल्स बहुत सारे ऑब्जेक्ट्स एकत्र करने से बचते हैं। 1-2 में उदाहरण: छत में 1up ब्लॉक वाला कॉलम + उसके बगल की ईंटें 3 की सीमा का सम्मान करने के लिए दो अलग ऑब्जेक्ट्स में विभाजित हैं।

### विशेष Y पोज़िशन: 12, 13, 14, 15

जब Y=12 होता है, तो ऑब्जेक्ट की कोई Y पोज़िशन नहीं होती (यह टाइप द्वारा हार्डकोडेड होती है):

```asm
; Y=12 : objets sans Y position
;   Type 0 : trou (supprime le sol)
;   Type 1 : rope de plateforme mobile
;   Types 2-4 : ponts à Y fixe
;   Type 5 : trou avec eau/lave
;   Types 6-7 : rangées de ? blocks
```

जब Y=13 होता है, दो सब-ग्रुप्स। अगर बाइट 1 का बिट 6 = 1 हो:

```asm
; Y=13, bit6=1 : objets spéciaux
;   0 = L-pipe (cutscene), 1 = flagpole, 2-3 = pont/axe/hamer (fin château)
;   4 = stop screen, 5 = random enemies, 6 = loop level, 7+ = crash possible
```

अगर bit6=0, तो निचले 5 बिट्स एक **स्क्रीन स्किप** एन्कोड करते हैं (बिना नेक्स्ट स्क्रीन फ्लैग के एक-एक करके गुज़रे, सीधे N स्क्रीन पर जाना)।

जब Y=14: वही सिद्धांत bit6=1 से मॉडिफ़ायर टाइप बदलने के लिए, bit6=0 से पृष्ठभूमि + फ्लोर पैटर्न बदलने के लिए।

### फ्लोर पैटर्न्स: 16 ज़मीन के पैटर्न्स

लेवल्स की ज़मीन अलग-अलग ऑब्जेक्ट्स से नहीं बनती। SMB1 **फ्लोर पैटर्न्स** का उपयोग करता है, एक बैकग्राउंड पैटर्न जो अगले बदलाव तक सभी कॉलम्स पर लागू होता है:

```asm
; Floor patterns (4 bits = 16 possibilités)
;   0 = vide total
;   1 = sol 2 tiles haut
;   2 = sol 1 tile haut
;   3 = sol + bottom
;   4 = sol + bottom 2
;   5 = sol 1/2 tile
;   6 = 3/4 sol
;   ... jusqu'à 15 = rempli total (sol + plafond)
```

इसलिए छेद ऑब्जेक्ट्स हैं: वे एक विशिष्ट कॉलम पर फ्लोर पैटर्न को ओवरराइड करते हैं, बाकी सब के लिए पैटर्न बदले बिना।

### 256 बाइट्स की सीमा और रीपीट

एक लेवल का सारा टाइल डेटा **अधिकतम 256 बाइट्स** में समाता है। 6502 का Y रजिस्टर इंडेक्स के रूप में उपयोग होता है, और इसमें 8 बिट्स होते हैं। अगर गेम $FD बाइट मिले बिना डेटा के अंत तक पहुँच जाता है, **तो यह शुरुआत पर वापस लूप करता है** और 256 बाइट्स को अनंत काल तक दोहराता है:

```asm
; Index Y = 8 bits → max 256 bytes de données tiles
; Si Y overflow (255 → 0) sans rencontrer $FD → repeat
; Même chose pour les sprites, mais les objets pipe (3 bytes)
; décalent la parité de l'index à chaque chargement.
```

कुछ ग्लिच लेवल्स इस रीपीट का फ़ायदा उठाते हैं ऐसे लेवल्स बनाने के लिए जो "अनिश्चित काल" तक चलते हैं।

### स्प्राइट सिस्टम: 2 बाइट्स + पाइप ट्रांज़िशन्स

स्प्राइट्स समान फ़ॉर्मेट का पालन करते हैं, लेकिन हेडर के बिना और कुछ महत्वपूर्ण अंतरों के साथ। $FF बाइट सूची का अंत चिह्नित करता है।

```asm
; Format sprite (2 bytes) :
; Byte 0 : position X (colonne)
; Byte 1 :
;   Bit 7 : NEXT SCREEN FLAG
;   Bits 6-0 : type de sprite
;       Certains types incluent : goomba, koopa, Blooper,
;       Bullet Bill, Lakitu, Spiny, plateformes,
;       commande warp zone, toad/princesse,
;       commandes de spawn de groupes d'ennemis
```

बाइट 1 का निचला बिट **हार्ड लेवल फ्लैग** है: अगर 1 सेट हो, तो स्प्राइट सिर्फ लेवल्स ≥ 5-3 में दिखता है। इस तरह "हार्ड मोड" लेवल्स बनते हैं।

Y पोज़िशन 15 = **स्क्रीन स्किप** (टाइल्स के समान)। Y पोज़िशन 14 = **पाइप ट्रांज़िशन** (3 बाइट्स):

```asm
; Sprite Y=14 : pipe/vine transition (3 bytes !)
;   Byte 0 : position X
;   Byte 1 : bits 6-0 = Level ID 7-bit (destination)
;   Byte 2 : bits 4-0 = screen de destination
;            bits 7-5 = world où cette transition est valide
;
; Pourquoi un world ? Les bonus rooms sont réutilisées entre mondes.
; Exemple : la salle bonus de 1-1 est aussi utilisée par 2-1 et 7-1.
; Cette salle a 3 transitions, une par monde, pour que Mario
; réapparaisse au bon endroit.
```

स्प्राइट्स में **कोई क्यू सिस्टम नहीं** है। एकमात्र सीमा यह है कि स्पॉन क्षेत्र में (दाईं ओर बस बाहर स्क्रीन) एक साथ 4 से ज़्यादा स्प्राइट्स लोड नहीं हो सकते। इससे ज़्यादा, स्प्राइट्स अनदेखे कर दिए जाते हैं।

## ग्लिच वर्ल्ड्स तक कैसे पहुँचें

दो मुख्य विधियाँ हैं।

### क्लासिक विधि: वॉल क्लिप

वॉल क्लिप (दीवारों से गुज़रना) सामान्य लेवल से बाहर निकलने और छिपी वार्प ज़ोन तक चलने की अनुमति देता है। RAM के माध्यम से वर्ल्ड काउंटर में हेरफेर करके, हम कोई भी Level ID लोड कर सकते हैं।

तकनीक:
1. World 1-2: छिपे अंतिम पाइप में जाओ
2. दाईं दीवार पर वॉल क्लिप करो
3. वार्प ज़ोन तक खाली में चलो
4. गेम मानों को वर्ल्ड्स के रूप में पढ़ता है

लेकिन यह विधि सिर्फ ग्लिच वर्ल्ड्स के एक छोटे हिस्से तक पहुँच देती है।

### एक्सट्रीम विधि: NES Tennis कार्ट स्वैप

पूरा विवरण ऊपर "वार्म स्टार्ट" अनुभाग में देखें। संक्षेप में: Tennis का कदम काउंटर SMB1 के वर्ल्ड स्टार्ट बाइट के समान RAM बाइट पर लिखता है, और वार्म स्टार्ट डिटेक्शन इस वैल्यू को संरक्षित करता है।

### बिडलर्स का कोना: सब कुछ एक्सप्लोर करने के लिए कोड

अगर तुम एम्यूलेटर में खुद सभी ग्लिच एक्सप्लोर करना चाहते हो, तो तुम Level ID सीधे पैच कर सकते हो:

```asm
; Patch pour FCEUX / Mesen :
; Adresse RAM $075F = Level ID actuel
; Adresse RAM $0760 = Area Type (0=Water, 1=Overworld, 2=Underground, 3=Castle)

; Exemple : charger le Level 57 (0x39) en Overworld
; Dans l'émulateur, ouvrir le traceur mémoire et écrire :
; $075F = 0x39
; $0760 = 0x01
; Puis entrer dans un tuyau de warp ou mourir et recommencer
; → Le jeu charge le niveau ID $39 en Overworld
```

RGMechEx ने 128 लेवल्स × 4 टाइप्स की पूरी सूची [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html) पर प्रकाशित की है, स्वचालित रूप से जनरेटेड मैप्स के साथ। हर प्रविष्टि टाइल पॉइंटर, स्प्राइट पॉइंटर, और लेवल का एक दृश्य मानचित्र दिखाती है।

## सबसे विचित्र लेवल्स

### Level ID $1F (पानी): एक में 15 ग्लिच वर्ल्ड्स

टाइल पॉइंटर $A302 (3-4) और स्प्राइट पॉइंटर $02A0 का संयोजन 15 अलग-अलग ग्लिच वर्ल्ड्स देता है (D-1, J-1, Y-1, Z-1, 55-1, 73-1...)। व्याख्या: स्प्राइट पॉइंटर ROM के एक ऐसे क्षेत्र की ओर इंगित करता है जिसमें खेलने योग्य परिणाम देने के लिए पर्याप्त रूप से वैध स्प्राइट्स के करीब डेटा है, लेकिन 3-4 की कैस्टल टाइल्स और ओवरवर्ल्ड स्प्राइट्स का संयोजन एक हास्यास्पद रेंडरिंग बनाता है।

### Level ID $28 (ओवरवर्ल्ड): 38 ग्लिच वर्ल्ड्स = रिकॉर्ड

बिल्कुल रिकॉर्ड। 38 ग्लिच वर्ल्ड प्रविष्टियाँ एक ही लेवल (2-1 टाइल्स + $9F51 स्प्राइट्स) की ओर इंगित करती हैं। क्यों? क्योंकि स्प्राइट पॉइंटर $9F51 ROM के एक ऐसे क्षेत्र में गिरता है जिसे कई IDs द्वारा पैडिंग/साउंड डेटा के रूप में पुनः उपयोग किया जाता है।

### Level ID $49 (अंडरग्राउंड): FDS लेवल

टाइल पॉइंटर $76AE + स्प्राइट पॉइंटर $1C9D। टाइल पॉइंटर ROM के Famicom Disk System संस्करण के लिए आरक्षित क्षेत्र की ओर इंगित करता है। परिणाम: एक लेवल जिसमें ऐसी टाइल्स हैं जो मानक कार्ट्रिज में मौजूद नहीं हैं। यह वह लेवल है जो 52-1 और 196-1 बनाता है।

### Level ID $00-$02: असली बोनस लेवल्स

ये IDs गेम के वैध सब-लेवल्स द्वारा उपयोग होते हैं:

- **$00**: 5-2/6-2 का पानी के नीचे का क्षेत्र (H-1, 39-1 द्वारा उपयोग)
- **$01**: 2-2/7-2 का पानी (Minus World, 36-1)
- **$02**: 8-4 का सब-लेवल (136-1, 151-1, 215-1)

सामान्य रूप से एक्सेसेबल "बोनस" लेवल और ग्लिच वर्ल्ड के बीच अंतर यह है कि वार्प ज़ोन वर्तमान वर्ल्ड की जाँच करते हैं:

```asm
; Vérification warp zone (simplifié)
; Le jeu vérifie que le monde cible est entre 1 et 8
CheckWarp:
  lda TARGET_WORLD
  cmp #1
  bcc InvalidWarp       ; < 1 → refusé
  cmp #9
  bcs InvalidWarp       ; > 8 → refusé
  ; world valide entre 1 et 8 uniquement
  jmp DoWarp
```

8 से ज़्यादा या 0 नंबर वाले ग्लिच वर्ल्ड्स सामान्य पाइप्स से नहीं पहुँचे जा सकते। वॉल क्लिप या कार्ट स्वैप ज़रूरी है।

## कुछ लेवल्स क्रैश क्यों करते हैं: जंप टेबल्स

जब गेम एक टाइल ऑब्जेक्ट लोड करता है, तो वह इसके टाइप को एक **जंप टेबल** में इंडेक्स के रूप में उपयोग करता है:

```asm
; Jump table des objets tiles standards (types 0-11)
JumpTable_TileObjects:
  .word Obj_Special       ; type 0 : bloc ?, hidden, flagpole...
  .word Obj_Platform      ; type 1 : plateforme spéciale
  .word Obj_BrickRow      ; type 2 : rangée de briques
  .word Obj_BlockRow      ; type 3 : rangée de blocks
  .word Obj_CoinRow       ; type 4 : rangée de pièces
  .word Obj_BrickCol      ; type 5 : colonne de briques
  .word Obj_BlockCol      ; type 6 : colonne de blocks
  .word Obj_Pipe          ; type 7 : tuyau
  .word Obj_8             ; type 8
  .word Obj_9             ; type 9
  .word Obj_10            ; type 10
  .word Obj_11            ; type 11
```

![जंप टेबल्स: अवैध ऑब्जेक्ट टाइप गेम को क्यों क्रैश करता है](/images/smb1-glitch-levels/v4-jump-table.jpg)

अगर ऑब्जेक्ट का अवैध टाइप है (≥12), तो गेम एक ऐसे पॉइंटर पर कूदता है जो इस टेबल में मौजूद ही नहीं है। **4 संभावित परिणाम**:

1. **वैध पॉइंटर** → ऑब्जेक्ट सामान्य रूप से लोड होता है
2. **किसी अन्य जंप टेबल की ओर पॉइंटर** (ओवरलैप) → अलग ऑब्जेक्ट दिखता है। उदाहरण: टाइप 12 Y=13 टेबल की ओर इंगित करता है, जिससे L-pipe बनता है।
3. **एग्ज़िक्यूटेबल की ओर पॉइंटर** → यादृच्छिक कोड का निष्पादन (संभावित क्रैश)
4. **स्पष्ट प्लेसहोल्डर (NOP)** → ऑब्जेक्ट कुछ नहीं करता (कुछ स्प्राइट्स ऐसे ही होते हैं, ऐसे दुश्मन बनाते हैं जो एक ही जगह पर उड़ते रहते हैं बिना हिले)

![ग्लिच लेवल ID $58: स्प्राइट पॉइंटर अवैध पते की ओर इंगित करता है, गेम क्रैश](/images/smb1-glitch-levels/v4-glitch-58-crash.jpg)

![ग्लिच लेवल ID $50: क्लाउड ट्यून, खराब डेटा से जनरेटेड लेवल](/images/smb1-glitch-levels/v4-glitch-50.jpg)

ग्लिच लेवल ID $58 (क्रैश करने वाला ट्यून): इसका स्प्राइट पॉइंटर ऐसी मेमोरी रीजन की ओर इंगित करता है जो **बिना ROM मैपर वाले NES पर मौजूद ही नहीं है**। गेम (0,0) पोज़िशन पर हर फ्रेम में एक ही Koopa को 5 बार लोड करने की कोशिश करता है, जिससे PPU भर जाती है और फ़्रीज़ हो जाता है।

```asm
; Pourquoi ID $58 crashe :
; Sprite pointer → adresse invalide (hors espace NES standard)
; → Le jeu lit des bytes indéterminés comme des types de sprite
; → Le Koopa $00 (type invalide sans handler) boucle en appel récursif
; → Stack overflow 6502 → freeze
```

### पाइप वार्प का पैराडॉक्स

याद रखो `target_world BETWEEN 1 AND 8` चेक। भले ही तुम ग्लिच वर्ल्ड में एक पाइप ढूंढ लो, गेम जाँचता है कि गंतव्य वर्ल्ड 1 और 8 के बीच है। ग्लिच वर्ल्ड्स के नंबर > 8 हैं (36-1, 255-1...), इसलिए वार्प फेल हो जाता है।

इसलिए Minus World का अंत नहीं है: स्प्राइट्स में फ्लैगपोल मौजूद नहीं है, और पाइप्स कहीं नहीं ले जातीं।

### एक कॉलम में 5 ऑब्जेक्ट्स का ट्रिक

एक ऐसा एज केस मौजूद है जो प्रति कॉलम 3 ऑब्जेक्ट्स की सीमा को तोड़ने की अनुमति देता है। जब क्यू ब्लॉक हो जाती है (स्लॉट्स भरे + अगला ऑब्जेक्ट नेक्स्ट स्क्रीन फ्लैग के बिना), तो गेम वर्तमान कॉलम को नेक्स्ट स्क्रीन फ्लैग वाला ऑब्जेक्ट मिलने तक लूप में "प्री-प्रोसेस" करता है। हर प्री-प्रोसेसिंग के दौरान:

```asm
; Pendant le prétraitement de colonne :
; 1. Les objets dans la queue voient leur largeur restante
;    décrémentée à chaque "fausse avancée" de colonne
; 2. Si un objet atteint largeur=0, il quitte la queue
; 3. Un slot libéré peut être rempli par un nouvel objet
;    ajouté dans la même colonne

; Résultat : jusqu'à 5 objets peuvent être traités sur la même colonne.
; Technique : placer 2 objets qui traversent la screen boundary
; (slots 1 et 2), 1 objet dummy en X < précédent (bloque la queue),
; puis 3 objets à X=0 de l'écran suivant (dont un avec next screen flag).
```

इसे "क्यू स्किप" कहते हैं और कुछ रोमहैकर्स फ़ॉर्मेट की सामान्य सीमा से ज़्यादा घने लेवल्स बनाने के लिए इसका उपयोग करते हैं।

## संस्करणों के बीच अंतर

### Famicom Disk System

SMB1 का FDS संस्करण एक **अलग मेमोरी मैप** रखता है। सभी लेवल पॉइंटर्स शिफ्ट हो जाते हैं, लेकिन डेटा वही होता है। जो बदलता है: ग्लिच वर्ल्ड्स के इंडिकेस पूरी तरह अलग होते हैं:

```
FDS World 36 → Level ID $09 (eau version de 5-3)
  → Le flagpole est présent ! On peut finir le niveau.
  → Ensuite : $27 (7-3 normal) → $44 (4-4 underground)
  → $44 est finissable → la hache fonctionne → fin du jeu !
  
Le Minus World FDS est donc un "bonus world" qui peut mener
à la complétion du jeu, contrairement à la version NES.
```

मेरा पसंदीदा FDS लेवल: **ID $5F**, 3-3 के दूसरे हिस्से का एक भूमिगत संस्करण निचले ट्यून में (दुख की बात है कि यह ऑटोस्क्रोलर है)।

### The Lost Levels (Super Mario Bros. जापानी संस्करण)

Lost Levels बहुत सी चीज़ें बदलता है:

1. **टाइल्स/स्प्राइट्स का समान क्रम**: कोई Frankenstein levels नहीं (टाइल्स और स्प्राइट्स अवैध ID के साथ भी एक ही लेवल लोड करते हैं)
2. **एक ही 16-बिट पॉइंटर टेबल** दो अलग high/low टेबल्स के बजाय
3. **4 डिस्क फ़ाइलें**: ROM को FDS के लिए स्प्लिट किया गया:
   - फ़ाइल 1: वर्ल्ड्स 1-4
   - फ़ाइल 2: वर्ल्ड्स 5-8
   - फ़ाइल 3: वर्ल्ड 9 + साउंड इंजन
   - फ़ाइल 4: वर्ल्ड्स A-D (पूरी तरह अलग पॉइंटर टेबल)
4. **एक ही Level ID = 4 संभावित लेवल्स** लोड की गई फ़ाइल के अनुसार
5. **कोई Tennis ग्लिच नहीं**: कंटिन्यू ऑप्शन (गेम ओवर के बाद उसी वर्ल्ड में जारी) वार्म स्टार्ट को अनावश्यक बनाता है, और गेम world > 9 होने पर **तुरंत रीसेट** करता है
6. **नए ऑब्जेक्ट्स**: ज़हरीला मशरूम, अदृश्य ब्लॉक, अदृश्य फ़ायर फ्लावर ब्लॉक, उल्टे पाइप्स, हवा -- लेकिन मौजूदा सूचियों के बीच में डाले गए → SMB1 के साथ **बैकवर्ड असंगतता**
7. **Piranha Plants हमेशा लाल** वर्ल्ड 4 के बाद, **हरे स्प्रिंगबोर्ड** सिर्फ वर्ल्ड्स 2/B/3/C/7 में

### Super Mario All-Stars (SNES)

सीधा पोर्ट समान 6502 रूटीन्स के साथ (SNES NES कोड को संगत मोड में चलाता है):

- **वार्प ज़ोन फिक्स**: कोई Minus World नहीं (बाएं पाइप में टेक्स्ट से पहले एंटर करने से सही वर्ल्ड में पहुँचते हैं)
- **क्रैश**: अधिकतर ग्लिच लेवल्स क्रैश करते हैं (सिर्फ ID $6A और 9-1 को छोड़कर)
- **कैस्टल ऑब्जेक्ट्स जोड़े गए**: और अद्वितीय रेंडरिंग
- **लेकिन**: **4-2 रँग वार्प** अभी भी काम करता है (पैच नहीं हुआ!)

### 4-2 रँग वार्प: ऑब्जेक्ट प्लेसमेंट का बग

4-2 में, दो पाइप ट्रांज़िशन ऑब्जेक्ट्स हैं: बेल (वार्प ज़ोन) और पाइप (कॉइन कैश रूम)। पहला ट्रांज़िशन ऑब्जेक्ट (बेल वाला) बेल स्क्रीन पर दिखने से **बहुत पहले** रखा जाता है। दूसरा (पाइप) लेवल में **बहुत देर से** रखा जाता है।

```asm
; Timing des transitions dans 4-2 :
; Objet transition 1 (vigne → warp zone) : placé 3 écrans avant la vigne
; Objet transition 2 (tuyau → coin cash) : placé 1 écran après le tuyau
;
; Normalement le premier objet est désactivé avant que Mario
; n'atteigne le tuyau. Mais si Mario va vite (ou utilise
; le raccourci du bloc B+right), la transition de la vigne
; est toujours active quand il touche le tuyau !
; → Le jeu charge la warp zone au lieu du coin cash.
;
; Si l'objet avait été placé juste après la vigne mais avant
; le tuyau, le bug n'existerait pas.
```

### लूप वाले लेवल्स

लूप्स (8-4, 7-4) कैसे काम करते हैं? लेवल में **चेकपॉइंट्स** होते हैं जिनमें स्क्रीन नंबर और Y पोज़िशन हार्डकोडेड होते हैं:

```asm
; Checkpoint : {screen_number, vertical_position}
; Si Mario passe ce checkpoint à la bonne hauteur → niveau continue
; Sinon → warp back de 4 écrans (64 blocks)
;
; Pour faire une boucle infinie : vertical_position = $F0
; (en dessous du bas de l'écran) → impossible de valider.
;
; Les checkpoints sont simples (un seul flag) sauf pour world 7
; qui utilise des triplets (3 flags, il faut en échouer au moins 1)
;
; Le warp back est rude : offset de tile data réglé à une valeur
; hardcodée, offset de sprite data remis à 0. Les ennemis présents
; sont déchargés instantanément → les firebars disparaissent.
```

## फ़ॉर्मेट बदलो, कोड नहीं

इस आर्किटेक्चर का सबसे रोचक सबक यह है कि SMB1 के डेवलपर्स ने एक बहुत ही अभिव्यंजक लेवल सिस्टम बनाने में कामयाबी हासिल की बिना 6502 रेंडरिंग कोड को कभी छुए। लेवल्स के बीच सारा भिन्नता **डेटा** (पॉइंटर्स, ऑब्जेक्ट्स, स्प्राइट्स, फ्लोर पैटर्न्स) से आता है, कोड से नहीं।

256 ग्लिच वर्ल्ड्स इसलिए मौजूद हैं क्योंकि **पॉइंटर टेबल्स 128 प्रविष्टियों × 4 टाइप्स के लिए साइज़ की गई हैं**, और गेम जो मान पढ़ता है उसकी कभी वैलिडेशन नहीं करता। जब पॉइंटर RAM में गिरता है, तो गेम Mario के रजिस्टर्स को टाइल्स के रूप में पढ़ता है। जब पॉइंटर साउंड डेटा में गिरता है, तो गेम लेवल डिज़ाइन के रूप में संगीत बजाता है। और जब जंप टेबल्स ओवरफ्लो होती हैं, तो गेम क्रैश होने तक कुछ भी चलाता है।

![Super Mario Bros. Mechanics Explained -- चौथा वीडियो](/images/smb1-glitch-levels/yt-mechanics.jpg)

## इससे क्या सीखा जा सकता है

1. **टाइल्स/स्प्राइट्स का विभाजन**: दोनों लेयर्स की पूर्ण स्वतंत्रता, अलग स्टोरेज क्रम के साथ जो अद्वितीय Frankenstein levels बनाता है
2. **RLE कंप्रेशन + ऑब्जेक्ट सिस्टम**: लेवल्स बिटमैप्स नहीं बल्कि रखे गए ऑब्जेक्ट्स की सूचियाँ हैं, ज़मीन के लिए फ्लोर पैटर्न्स के साथ
3. **3-स्लॉट क्यू**: हार्डवेयर (और लेवल डिज़ाइन) की कठोर सीमा
4. **कोई वैलिडेशन नहीं**: गेम पॉइंटर्स और जंप टेबल्स पर भरोसा करता है, जो या तो खेलने योग्य ग्लिच्स या क्रैश बनाता है
5. **256 बाइट्स अधिकतम**: 6502 Y रजिस्टर की सीमा, जिससे बहुत आगे जाने पर डेटा दोहराता है
6. **वार्म स्टार्ट / कोल्ड स्टार्ट**: एक "जारी रखने" का सिस्टम जिसने Tennis कार्ट स्वैप → Mario के लिए दरवाज़ा खोला

सबसे अच्छी बात: यह सब 40KB में समाया हुआ 6502 कोड है। कोई एब्स्ट्रैक्शन लेयर नहीं, कोई मेमोरी एक्सेस वैलिडेशन नहीं, कोई एक्सेप्शन हैंडलर नहीं। अगर पॉइंटर खराब है, तो गेम क्रैश। और क्रैश को हम ग्लिच वर्ल्ड्स कहते हैं।

## 3 याद रखने योग्य बातें

1. **ग्लिच वर्ल्ड्स गलत जगह गिरने वाले पॉइंटर्स हैं** -- गेम में 128 IDs × 4 ज़ोन टाइप्स हैं, लेकिन सिर्फ 34 अद्वितीय लेवल्स। जब वर्ल्ड नंबर खराब हो जाता है (Tennis या वॉल क्लिप से), तो गेम किसी अन्य लेवल के लिए डिज़ाइन किया गया पॉइंटर लोड करता है, और 512 संभावित संयोजन अनपेक्षित परिणाम देते हैं।

2. **Minus World वार्प बग और भ्रष्टाचार का संयोजन है** -- 1-2 का बायां पाइप, अगर टेक्स्ट दिखने से पहले एक्टिवेट हो, तो वर्ल्ड 36 (0x24) लोड करता है। यह वर्ल्ड Level ID $01 (2-2 का पानी) की ओर इंगित करता है, एक बिना फ्लैगपोल वाला लेवल। और चूंकि वर्ल्ड 36 के लिए कोई पाइप ट्रांज़िशन नहीं है, लेवल अनंत काल तक लूप करता रहता है। जाँच की कमी आइकन बनाती है।

3. **Tennis → Mario, OoT → Paper Mario से 15 साल पहले** -- NES की RAM कंडेंसर्स और SMB1 के वार्म स्टार्ट / कोल्ड स्टार्ट सिस्टम के कारण कार्ट्रिज स्वैप से बची रहती है। Tennis का कदम काउंटर (जो पैरों की आवाज़ बजाते हुए एक RAM बाइट बढ़ाता है) वर्ल्ड नंबर के पते पर बिल्कुल सही जाकर गिरता है। टॉप स्कोर के डिजिट्स को 0 बने रहना होता है, $A5 बाइट बरकरार रहना चाहिए, और गेम को वार्म स्टार्ट का पता लगाना होता है -- एक सही परिस्थितियों का मिलाप जो सिर्फ Tennis के साथ काम किया।

[Retro Game Mechanics Explained](https://www.youtube.com/c/RetroGameMechanicsExplained) के मूल वीडियो एक शानदार काम हैं -- 6502 डिसएसेंबली पर विवरण का स्तर, सभी लेवल्स के स्वचालित मैप्स, कार्ट स्वैप और वार्म स्टार्ट की व्याख्या। अगर तुमने सीरीज़ नहीं देखी, तो देखो, छोटी है और हर मिनट भरपूर है।

मैप्स का सोर्स कोड [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html) पर उपलब्ध है, और SMB1 का पूरा डिसएसेंबली कई रिपोज़ पर ओपन सोर्स है। 40 साल पहले, जापानी प्रोग्रामर्स ने इस लेवल सिस्टम को 6502 में ज़ीरो यूनिट टेस्ट और ज़ीरो बग ट्रैकर के साथ लिखा था, और आज भी हम उनका कोड खोलकर नई चीज़ें सीख रहे हैं।
