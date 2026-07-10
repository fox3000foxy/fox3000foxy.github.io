---
title: "Super Mario Bros.: Level formatı, göstergeçler ve 256 glitch world"
description: "128 level × 4 alan türü 40KB ROM'a nasıl sığıyor, Minus World neden var ve bir NES Tennis maçı nasıl glitch world'leri yükleyebiliyor."
date: 2026-06-10
tags:
  - retro
  - reverse-engineering
  - nintendo
  - nes
  - "6502"
  - mario
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "qgQ/roVX3eD2mu7vdxsNy4P1KYwMhgvGRALK2Uoah53489LxLTzZxQMBCU69a+FErSRglH+SILYGI5+g9WKs8Q=="
---

## Giriş

Super Mario Bros., 40 kilobyte ROM. Sekiz dünya, 32 level, düşmanlar, müzik, güçlendirmeler, hepsi bunun içinde.

Ama eğer bir emülatör açıp doğru byte'ları kurcalarsan, 36-1 levelini yükleyebilirsin. Veya 255-1'i. Veya her yerin Bowser sprite'larından ve hiçbir yere götürmeyen borulardan oluştuğu bir world'e düşebilirsin.

Bu glitch world'ler basit bir nedenden dolayı var: SMB1'in level depolama sistemi 8-bit optimizasyonu mucizesidir ve oyunu olmaması gereken yeri okumaya zorladığında, büyüleyici sonuçlar ortaya çıkar.

Retro Game Mechanics Explained bu konuda 4 videoluk bir seri yaptı -- bunları dönemin en çok satan oyununun 6502 kodunda tek bir dalışa derleyeceğiz.

![GLITCH OBJECTS -- RGMechEx'in SMB1'in gizli mekanikleri üzerine serisinin başlık kartı](/images/smb1-glitch-levels/title-card.jpg)

![World 9-1 -- Tennis kart değişimi ile erişilebilen ilk glitch world'ün açılış ekranı](/images/smb1-glitch-levels/v1-title-9-1.jpg)

## Warm start: Tennis'in RAM'i SMB1'de neden hayatta kalıyor

Level depolamadan bahsetmeden önce, SMB1'in nasıl başladığını anlamamız gerekir. Çünkü NES Tennis kart değişimi glitch'i tamamen oyunun **warm start / cold start tespit sistemi**ne bağlıdır.

### Korunan 41 byte

SMB1 bir **cold start** tespit ettiğinde (ilk kez açma veya kapatma-açma), tüm RAM'i siler. Ama bir **warm start** tespit ettiğinde (düğme sıfırlama, güç kesintisi yok), **41 byte**'lık bir bellek alanını korur:

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

Bu 41 byte tek bir işlev için kullanılır: oyuncunun **game over'dan sonra aynı dünyada devam etmesine** izin vermek. 6-3'te ölürsen, oyun world 6'yı başlangıç byte'ına yazar ve açılış ekranında A + Start'a basılı tutarsan, 6-1'den başlarsın.

![Warm start sırasında korunan 41 byte -- TOP SCORE, MARIO SCORE, TIMER, WORLD SELECT, CONTINUE WORLD ve sihirli byte $A5](/images/smb1-glitch-levels/v1-memory-state.jpg)

### Warm start'un çift kontrolü

![Cold start vs warm start -- sıfırlama tespit diyagramı](/images/smb1-glitch-levels/v1-warm-start.jpg)

SMB1 açıldığında, tek bir kriter değil **ikisini** kontrol eder:

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

![Byte $A5 ve top score'un basamaklarının kontrolü -- warm start'un kalbi](/images/smb1-glitch-levels/v1-a5-byte.jpg)

Neden çift kontrol? Çünkü byte $A5 rastgele olabilir (başka bir oyunun bu değeri bırakması veya RAM çipinin varsayılan dinlenme durumu). Top score'un basamaklarının geçerli (0-9) olduğunu kontrol ederek, verilerin tutarlı olduğundan emin oluruz.

### Neden Tennis tek çalışan oyun

SMB1'i ilk kez taktığımızda (cold start), oyun:
1. Tüm RAM'i siler → top score = 0, world byte = 0
2. $0787 adresine $A5 yazar

Sonra konsolu kapatmadan Tennis'e geçeriz. Tennis:
- **Başlangıçta RAM'i temizlemez** (az sayıda NES oyunu bunu yapar)
- **Top score byte'larına yazmaz** → 0'da kalırlar (geçerli)
- **$A5 byte'ına dokunmaz** → mevcut kalır
- **$075F adresini** oyuncu adım sayacı için kullanır

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

SMB1'i geri taktığımızda:
1. $A5 byte'ı hala orada (Tennis dokunmadı)
2. Top score basamakları hala 0 (geçerli)
3. World byte'ı artık 8+ (Tennis adımlarıyla arttı)
4. SMB1 warm start tespit eder → bozulmuş world byte'ını korur
5. A + Start'a basılı tut → world 9-1, world A-1, world 36-1, vb.

### Neden önce Mario sonra Tennis başlatılmalı

Bir incelik: önce SMB1'i, sonra Tennis'i, sonra tekrar SMB1'i başlatmalısın. Doğrudan Tennis ile başlasaydın, $A5 byte'ı hiç yazılmazdı (Tennis $A5 yazmaz), bu yüzden warm start tespiti başarısız olurdu ve RAM silinirdi.

![Tennis'in adım sayacı: her adım world byte'ını artırır](/images/smb1-glitch-levels/v1-footstep.jpg)

![NES Tennis ile Glitch World'lere Erişim -- kart değişimi açıklayan video](/images/smb1-glitch-levels/yt-tennis.jpg)

## SMB1 level'larını 40KB'a nasıl depolar

Nintendo R&D4, dışarıdan basit görünen bir sorunu çözmek zorundaydı: yatay kayan level'ları tile'lar, düşmanlar, nesnelerle temsil etmek, hepsini aşırı sıkı bir ROM bütçesinde.

Çözüm, **tamamen bağımsız** iki veri katmanına ayrılmadır:

### Tile düzeni (level haritası)

Her level, ROM'da sıkıştırılmış bir tile yapısına işaret eden bir göstergeç ile tanımlanır. Sıkıştırma ilkel ama zekice: bir "kontrol" byte'ı ve ardından 1-3 byte veri.

Tile formatı bir **çalıştırma** (RLE benzeri) sistemi kullanır:

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

Her level 16 sütundan oluşan 13 satır tile içerir (13×16 = 208 görünür tile). Ama sıkıştırılmış format çok daha aşağı inebilir -- örneğin, gökyüzü ve boş sütunlar neredeyse hiç yer kaplamaz.

6502'deki işleme döngüsü:

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

### Sprite düzeni (düşmanlar ve nesneler)

Paralel olarak, düşmanlar ve nesneler (soru blokları, borular, goombas, koopas) tamamen ayrı bir yapıda depolanır. Her spawn 2 byte ile tanımlanır:

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

Her level, farklı 5 sprite sayfasına kadar (yani, 16 sütundan oluşan 5 "ekran") başvurabilir, ama pratikte çoğu level sadece 2-3 tane kullanır.

### Göstergeç tablosu

Tasarım dehası göstergeç tablosudur. Her level bir ROM adresi **çifti** olarak depolanır:

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

Tablo başına 128 giriş. 4 alan türü. **512 olası kombinasyon**, ama sadece bir kısmı resmi oyun tarafından kullanılır. Geri kalanı, başlatılmamış RAM veya göstergeç olarak yorumlanan verilerdir.

Oyun bir level yüklediğinde şunu yapar:

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

Doğrulama yok. Göstergeçin geçerli olup olmadığını kontrol etme yok. Oyun tablodaki adresi okur ve o adreste bulunanı sıkıştırır, nokta.

![Level ID $06 (Water) -- 9-1, 6-2'nin sualtı versiyonu](/images/smb1-glitch-levels/lvl-06-9-1.png)

![Level ID tablosu: 128 olası giriş, 34 atanmış](/images/smb1-glitch-levels/v2-level-id-table.jpg)

![Tile ve sprite göstergeçlerinin farklı sırası -- Frankenstein level'ların nedeni](/images/smb1-glitch-levels/v2-pointer-tables.jpg)

### 34 benzersiz level ve 7-bit ID sistemi

![NES'in RAM çipi (MB8416A) -- kartları değiştirdiğimizde verileri koruyan çip](/images/smb1-glitch-levels/v1-ram-chip.jpg)

SMB1'de 32 level değil, **34 benzersiz level** vardır. Birçok level tekrardır (5-3 = 1-3 ama Bullet Bill'lerle) "hard mode" bayrağıyla işaretlenmiştir. Gerçek benzersiz level'lar:

- **Su** (Tür 0): 3 level (2-2, 7-2, bonus alanı 5-2/6-2)
- **Overworld** (Tür 1): 22 level (bulut bonus odaları dahil)
- **Underground** (Tür 2): 3 level (yeraltı bonus odaları dahil)
- **Castle** (Tür 3): 6 level
- \+ 1 kesme sahnesi odası (yeraltı/su level'larından önce)
- \+ 1 warp bölgesi 4-2'den

Her level **7 bit**'lik bir ID'ye sahiptir. 5 alt bit = alt grup içindeki numara, 2 üst bit = alan türü:

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

**128 olası ID** ($00-$7F), sadece 34'ü gerçek level'lara atanmış. Kullanılmayan ID'ler herhangi bir şeye işaret eder.

### Göstergeç tabloları: iki liste, iki sıra

Tile ve sprite göstergeçleri aynı sırayla depolanmaz. Kod, ayrı iki 16-bit liste kullanır (iki farklı tabloda high byte / low byte):

```
Sprite göstergeçlerinin sırası:
  Index 0-5   : Castle (6 level)
  Index 6-27  : Overworld (22 level)
  Index 28-30 : Underground (3 level)
  Index 31-33 : Water (3 level)

Tile göstergeçlerinin sırası:
  Index 0-2   : Water (3 level)
  Index 3-24  : Overworld (22 level)
  Index 25-27 : Underground (3 level)
  Index 28-33 : Castle (6 level)
```

Neden farklı sıralar? Teknik bir neden yok -- muhtemelen veriler geliştirme sırasında böyle düzenlendi. Ama bu büyüleyici bir sonuca yol açar: bir level ID'si geçersiz olduğunda, tile ve sprite göstergeçleri *farklı* level'lar yükler ve **Frankenstein level'lar** oluşturur.

Bu iki liste arasında gezinmek için oyun küçük **offset tabloları** kullanır (bir içindekiler tablosu gibi):

```asm
; Tables d'offset par type (Water, Overworld, Underground, Castle)
; Chaque entrée = index de début dans la liste correspondante

SpriteOffsetTable:
  .byte $1F, $06, $1C, $00    ; Water=31, Overworld=6, Underground=28, Castle=0

TileOffsetTable:
  .byte $00, $03, $19, $1C    ; Water=0, Overworld=3, Underground=25, Castle=28
```

6-2 level'ını (ID $23, Overworld numara 3) yüklemek için:

```asm
; 1. Type = 01 (Overworld) → index dans table d'offset = 1
; 2. Sprite offset = SpriteOffsetTable[1] = 6
;    Index final = 6 + 3 (numéro de niveau) = 9 → 10ème pointeur sprites
; 3. Tile offset = TileOffsetTable[1] = 3
;    Index final = 3 + 3 = 6 → 7ème pointeur tiles
; 4. Résultat : pointeur tiles $A619 + pointeur sprites $9ED0 = 6-2 ✓
```

Şimdi, $43 (Underground numara 3, var olmayan) gibi geçersiz bir ID ile ne olur?

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

![Level ID $43 -- Frankenstein level: 1-4 tile'ları + 5-2 su sprite'ları](/images/smb1-glitch-levels/lvl-43-frankenstein.png)

![Glitch Level Göstergeçlerini Keşfetmek -- offset tabloları açıklanıyor](/images/smb1-glitch-levels/yt-pointers.jpg)

![World index tablosu -- world 9 taşması bir glitch level oluşturduğunda](/images/smb1-glitch-levels/v2-world-index-table.jpg)

### World index tablosu: world 9 neden taşar

Her world'ün (1-8) ilk level'ının indexini veren 8 byte'lık bir ROM tablosu vardır. Ve hemen ardından, tüm level'ların oyun sırasına göre 36 Level ID tablosu.

```asm
; WorldIndexTable (8 bytes)
  .byte 0, 5, 10, 15, 20, 25, 28, 33
;   -> Monde 1 commence au niveau 0
;   -> Monde 2 commence au niveau 5
;   -> Monde 8 commence au niveau 33

; LevelIDTable (36 bytes)
  .byte $25, $28, $29, $26, $24, ... ; les 36 Level IDs
```

World 9'u yüklemeye çalıştığımızda, oyun WorldIndexTable'ın 9. byte'ını okur... bu mevcut değildir. LevelIDTable'a 1 byte taşar, $25 değerini okur, sonra LevelIDTable'da indeks olarak $25 kullanır (37. giriş) -- bu SpriteOffsetTable'a 2 byte taşar ve 6 değerini okur.

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

World G (16) için, taşma daha da ileri gidip 1-2'den önceki kesme sahnesi olan Level ID $01'e düşer:

```asm
; World G (16) :
;   WorldIndexTable[15] → lit $01 dans LevelIDTable
;   LevelIDTable[1] = $29 (cutscene 1-2)
;   → world G-1 = la cutscene d'entrée de 1-2
```

## Glitch world'ler neden var

Oyunun 32 "meşru" level'ı var (8 dünya × 4 level). Ama göstergeç tablosu alan türü başına 128 giriş yapıyor. 32. level'ın ötesindeki girişler, bu adreslerde ROM'da bulunanı içerir -- bazen başka bir level, bazen ses verileri, bazen RAM, bazen de herhangi bir şey.

![Level ID $01 Water (Minus World) -- tile göstergeci $AE45, sprite göstergeci $A171](/images/smb1-glitch-levels/minus-world.png)

### Level ID $01 + AreaType 0 = Minus World

Glitch world'lerin en ünlüsü. AreaType 0 (su) içindeki Level ID $01 şunlara işaret eder:

- **Tile göstergeci: $AE45** → 2-2/7-2'nin sualtı bölgesi
- **Sprite göstergeci: $A171** → 2-2/7-2'nin sprite'ları

Sonuç: 2-2'ye benzeyen ama sonsuza kadar dönen bir su level'ı çünkü flagpole mevcut değil. Level sonu yok, çıkış yok.

Bu 36-1 level'ıdır (veya $-1 dünyasında 36-1).

![SMB1'in warm start kontrolü -- Minus World'ün var olmasını sağlayan](/images/smb1-glitch-levels/v4-minus-world.jpg)

```asm
; Pourquoi le flagpole manque dans le Minus World :
; Les sprites de 2-2/7-2 ($A171) n'ont pas de flagpole
; dans leur séquence. Le jeu cherche le sprite $FD (flagpole)
; mais ne le trouve jamais → boucle infinie
;
; Le jeu continue de générer le niveau à l'infini
; jusqu'à ce que le timer atteigne zéro.
```

### RAM'a işaret eden göstergeçler

Tile göstergeci veya sprite göstergeci ROM yerine RAM'daki ($00-$7F) bir adrese işaret ettiğinde, oyun RAM'deki sürekli değişimleri tile olarak yorumlamaya çalışır:

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

Sıfır sayfası değiştiğinde (Mario hareket ettiğinde, zamanlayıcı döndüğünde vb.), level'ın "sprite'ları" da değişir. Bu yüzden bazı glitch world'lerde titreyen ve sürekli dönüşen düşmanlar bulunur.

![Level ID $03 Water -- sprite göstergeci $009D RAM'a işaret ediyor, oynanamayan level](/images/smb1-glitch-levels/level-03-water.png)

### Level ID $36: boş level (Overworld)

Overworld'de Level ID $36:

- **Tile göstergeci: $AC35** (1-2)
- **Sprite göstergeci: $A0D8** (1-2)

Sonuç: hiçbir şey. Oyun level'ı yükler ama RGMechEx kataloğunda "levelsiz" olarak işaretlenmiştir. Tile'lar belki geçerlidir ama sprite'lar boş veya çalışmayan bir level üreten bir yere işaret eder.

### Level ID $1D (Castle): çökme şampiyonu

Castle'da Level ID $1D:

- **Tile göstergeci: $A210** (4-4)
- **Sprite göstergeci: $7EA0** (RAM!)

Sprite göstergeci RAM'de = tanımsız sprite'lar. Oyun tile'ların ilk satırında bir Spiny topu veya Bullet Bill blaster göstermeye çalışır. Hemen çöker.

```asm
; Quand le sprite pointer pointe vers la RAM,
; le jeu décompresse des bytes qui changent tout le temps
; comme des instructions "spawn". Le résultat :
; - Apparition d'objets inexistants (valeur undefined)
; - Crash PPU quand le sprite NES essaie d'afficher un tile invalide
; - Freeze complet de la console
```

## Kataloglanan 256 glitch world

RGMechEx, **tüm level'ların** haritasını oluşturan bir script yazdı, 4 alan türü ve her biri 128 ID için.

World sayacı 8 bit (0-255) üzerindedir. World 1-8 meşrudur. Kalan **248 potansiyel glitch world** vardır. Her glitch world bu world'ün ilk level'ına karşılık gelir ve Level ID'si WorldIndexTable taşma mekanizması tarafından hesaplanır.

![Glitch world tablosu -- 248 bozulmuş dünya, 68 erişilebilir ilk level](/images/smb1-glitch-levels/v3-glitch-worlds-table.jpg)

128 olası ID'den sadece **68'i bir world'ün "ilk level"ıdır** (glitch world numarası ile erişilebilir). Diğer 60'ı 2+ level veya erişilemez.

| Tür | Oynanabilir benzersiz ID'ler | Çöken ID'ler | Boş ID'ler |
|------|---------------------|-------------------|-----------|
| Water (0)    | ~20  | ~60  | ~48  |
| Overworld (1)| ~30  | ~55  | ~43  |
| Underground (2) | ~15 | ~65 | ~48  |
| Castle (3)   | ~25  | ~58  | ~45  |

Birçok ID aynı adrese düşen göstergeçler nedeniyle aynı level'a gider. Örneğin Level ID $28 (Overworld) -- tile göstergeci $A7CD (2-1) -- **38 farklı glitch world'de** görünür, çünkü sprite göstergeci $9F51 ROM'un birçok ID tarafından yeniden kullanılan ses verileri/padding bölgesine işaret eder.

![Level ID $28 (Overworld) haritası -- 2-1 tile'ları normal sprite'larla, 38 glitch world](/images/smb1-glitch-levels/level-28-overworld.png)

![Super Mario Bros. Glitch Levels Explained -- 3. video](/images/smb1-glitch-levels/yt-levels.jpg)

### Gerçekten benzersiz 6 glitch level

Erişilebilir 19 glitch level ID'sinden sadece **6'sı yükleme sırasında hemen çökmüyor**:

| World | Level ID | Açıklama |
|-------|----------|-------------|
| E-1 (224) | $50 | Bir uçurumun üzerinde tek bir ? bloğu. Mario anında ölür. |
| W | $57 | Mario spawn'da kilitli, hareket edemiyor. |
| 42 (133) | $50 | Mario yeterince ileri giderse tuzağa düşüren bulut tüneli. |
| 62 (131, 240) | $4D | Donmuş kale: Mario yukarıda spawn olur, düşemez → kilitli. |
| 127 | $4B | Yeraltı tüneli, ama çok ileri gidersen çöker. |
| 137 | $4B | Kesme sahnelerinin otomatik kaydırmayı etkinleştirir. Mario'yu ebediyen bloklayan tek bir tuğla blokla karşılaşır. |

![Level ID $50 (bulut tüneli) -- glitch world 42-1 ve E-1](/images/smb1-glitch-levels/lvl-50-cloud.png)
![Level ID $4D (kale) -- world 62-1, Mario spawn'da kilitli](/images/smb1-glitch-levels/lvl-4D-castle.png)
![Level ID $4B (tünel) -- world 127-1, çok ileri gidersen çöker](/images/smb1-glitch-levels/lvl-4B-tunnel.png)

248'den sadece 6 glitch world gerçekten yeni bir şey üretiyor. Geri kalanı, yanlış alan türüne sahip normal level'lar veya siyah ekranlar.

## Level formatı detaylı olarak

Level verilerinin kesin formatına bir göz atalım, glitch level'ların neden ayakta durduğunu (ya da durmadığını) anlamak için.

### Level başlığı: 2 byte, 6 özellik

Her level, 6 özelliği kontrol eden 2 byte'lık bir başlıkla başlar:

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

Tür değiştirici görsel varyasyonları kontrol eder: su level'larının üstündeki dalgalar, 8-3'ün tuğla arka planı, 4-3'ün gece paleti, 6-2'nin karı vb.

### Tile nesneleri: 2 byte, Next Screen Flag, 3 slot'luk kuyruk

Başlıktan sonra bir **tile nesnesi** listesi gelir, her nesne 2 byte. $FD byte'ı listenin sonunu işaret eder.

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

"Next screen" biti ayarlandığında, mevcut çalışma sütunu 1 artırılır. Bu, ilk 16 sütunun ötesine nesneler yerleştirmeye olanak tanır. Nesneler **sırayla** (soldan sağa) listelenmelidir çünkü oyun bunları sıralı olarak yükler:

```asm
; La routine de chargement a DEUX phases par colonne :
; Phase 1 : chercher les nouveaux objets qui commencent sur cette colonne
;            et les ajouter à la file d'attente (queue)
; Phase 2 : traiter chaque objet dans la queue en dessinant les tiles,
;            et retirer ceux qui finissent sur cette colonne
```

Kuyruk tam olarak **3 slot** yapar. Doğrudan sonuç: aynı sütunda başlayan 3'ten fazla nesne olamaz. Kuyruk doluysa, 4. nesne yok sayılır ve hiç yüklenmez.

Bu yüzden iyi tasarlanmış level'lar çok fazla nesne yığmaktan kaçınır. 1-2'deki örnek: tavan içindeki 1up bloğu ile yanındaki tuğlalar, 3 limitine uymak için iki ayrı nesneye bölünmüştür.

### Özel Y pozisyonu: 12, 13, 14, 15

Y=12 olduğunda, nesnenin Y pozisyonu yoktur (tür tarafından hardcoded):

```asm
; Y=12 : objets sans Y position
;   Type 0 : trou (supprime le sol)
;   Type 1 : rope de plateforme mobile
;   Types 2-4 : ponts à Y fixe
;   Type 5 : trou avec eau/lave
;   Types 6-7 : rangées de ? blocks
```

Y=13 olduğunda, iki alt grup vardır. Byte 1'in 6. biti 1 ise:

```asm
; Y=13, bit6=1 : objets spéciaux
;   0 = L-pipe (cutscene), 1 = flagpole, 2-3 = pont/axe/hamer (fin château)
;   4 = stop screen, 5 = random enemies, 6 = loop level, 7+ = crash possible
```

bit6=0 ise, en düşük 5 bit bir **ekran atlama** (next screen flag ile tek tek geçmek yerine doğrudan N ekranına atlamak) kodlar.

Y=14 olduğunda: bit6=1 ile tür değiştiriciyi, bit6=0 ile arka planı + zemin desenini değiştirmek için aynı prensip.

### Zemin desenleri: 16 zemin deseni

Level'ların zemini tek tek nesnelerden yapılmamıştır. SMB1 **zemin desenleri** kullanır, bir sonraki değişikliğe kadar tüm sütunlara uygulanan bir arka plan deseni:

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

Bu yüzden delikler nesnedir: belirli bir sütunda zemin desenini override eder, geri kalanını değiştirmeye gerek kalmaz.

### 256 byte limiti ve tekrar

Bir level'ın tüm tile verileri **en fazla 256 byte**'a sığar. 6502'nin Y register'ı indeks olarak kullanılır ve 8 bit yapar. Oyun verilerin sonuna $FD byte'ı bulamadan ulaşırsa, **başa döner** ve 256 byte'ı sonsuza kadar tekrarlar:

```asm
; Index Y = 8 bits → max 256 bytes de données tiles
; Si Y overflow (255 → 0) sans rencontrer $FD → repeat
; Même chose pour les sprites, mais les objets pipe (3 bytes)
; décalent la parité de l'index à chaque chargement.
```

Bazı glitch level'lar bu tekrarı, level'ları "sonsuza kadar" sürecek şekilde üretmek için kullanır.

### Sprite sistemi: 2 byte + boru geçişleri

Sprite'lar benzer bir format izler, ama başlıksız ve birkaç temel farkla. $FF byte'ı listenin sonunu işaret eder.

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

Byte 1'in en düşük biti **hard level flag**'idir: 1'e ayarlanırsa, sprite sadece 5-3 ve üzeri level'larda görünür. "Hard mode" level'ları böyle oluşturulur.

Y pozisyonu 15 = **ekran atlama** (tile'lar ile aynı). Y pozisyonu 14 = **boru geçişi** (3 byte):

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

Sprite'ların **kuyruk sistemi yoktur**. Tek sınırlama, spawn bölgesinde (sağda ekranda) aynı anda 4'ten fazla sprite'ın yüklenememesidir. Aksi takdirde sprite'lar yok sayılır.

## Glitch world'lere nasıl erişilir

İki ana yöntem vardır.

### Klasik yöntem: wall clip

Wall clip (duvarlardan geçme), normal level'dan çıkıp gizli warp bölgesine yürümemizi sağlar. RAM üzerinden world sayacını manipüle ederek, herhangi bir Level ID yükleyebiliriz.

Teknik:
1. World 1-2: gizli bitiş borusuna git
2. Sağdaki duvarda wall clip yap
3. Warp bölgesine kadar boşlukta yürü
4. Oyun değerleri world olarak yorumlar

Ama bu yöntem sadece bir kısmına erişim sağlar.

### Extreme yöntem: NES Tennis kart değişimi

Ayrıntılar için yukarıdaki "Warm start" bölümüne bakın. Özetle: Tennis'in adım sayacı, SMB1'in world byte'ına aynı RAM byte'ına yazar ve warm start tespiti bu değeri korur.

### Hackçiler köşesi: keşfetmek için kod

Tüm glitch world'leri bir emülatörde kendin keşfetmek istersen, Level ID'sini doğrudan yamalayabilirsin:

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

RGMechEx, 128 level × 4 türün otomatik oluşturulmuş haritalarla tam listesini [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html) adresinde yayınladı. Her giriş tile göstergecini, sprite göstergecini ve level'ın görsel haritasını gösterir.

## En çok wtf dedirten level'lar

### Level ID $1F (Water): 15 glitch world tek çatı altında

Tile göstergeci $A302 (3-4) ile sprite göstergeci $02A0 kombinasyonu 15 farklı glitch world verir (D-1, J-1, Y-1, Z-1, 55-1, 73-1...). Açıklama: sprite göstergeci, geçerli sprite'lara yeterince yakın veriler içeren bir ROM alanına işaret eder, ama 3-4 kale tile'larının overworld sprite'larıyla kombinasyonu saçma bir render üretir.

### Level ID $28 (Overworld): 38 glitch world = rekor

Mutlak rekor. 38 glitch world girişi aynı level'a (2-1 tile + $9F51 sprite) işaret eder. Neden? Çünkü sprite göstergeci $9F51, birçok ID tarafından yeniden kullanılan ses verileri/padding bölgesine düşen bir ROM alanına işaret eder.

### Level ID $49 (Underground): FDS level'ı

Tile göstergeci $76AE + sprite göstergeci $1C9D. Tile göstergeci, Famicom Disk System sürümüne ayrılmış ROM alanına işaret eder. Sonuç: standart kartta mevcut olmayan tile'lara sahip level. Bu level 52-1 ve 196-1 level'larını görünür kılar.

### Level ID $00-$02: gerçek bonus level'ları

Bu ID'ler oyunun meşru alt level'ları tarafından kullanılır:

- **$00**: 5-2/6-2 sualtı bölgesi (H-1, 39-1 tarafından kullanılır)
- **$01**: 2-2/7-2 suyu (Minus World, 36-1)
- **$02**: 8-4 alt level'ı (136-1, 151-1, 215-1)

Normalde erişilebilir bir "bonus" level ile glitch world arasındaki fark, warp bölgelerinin mevcut world'ü kontrol etmesidir:

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

8'den büyük veya 0 numaralı glitch world'ler normal borularla ulaşılamaz. Wall clip veya kart değişimi gerekir.

## Bazı level'lar neden çöker: jump tabloları

Oyun bir tile nesnesi yüklediğinde, türünü bir **jump tablosunda** indeks olarak kullanır:

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

![Jump tabloları: neden geçersiz bir nesne türü oyunu çökertir](/images/smb1-glitch-levels/v4-jump-table.jpg)

Bir nesnenin geçersiz türü varsa (≥12), oyun tabloda olmayan bir göstergeçe atlar. **4 olası sonuç**:

1. **Geçerli göstergeç** → nesne normal yüklenir
2. **Başka bir jump tablosuna göstergeç** (çakışma) → farklı bir nesne görünür. Örnek: tür 12, Y=13 tablosuna işaret eder, bu bir L-pipe verir.
3. **Çalıştırılabilir koda göstergeç** → rastgele kod çalıştırma (muhtemelen çökme)
4. **Açık NOP yer tutucusu** → nesne hiçbir şey yapmaz (bazı sprite'lar böyledir, yerinde uçan ama hareket etmeyen düşmanlar üretir)

![Glitch level ID $58: sprite göstergeci geçersiz bir adrese işaret ediyor, oyun çöküyor](/images/smb1-glitch-levels/v4-glitch-58-crash.jpg)

![Glitch level ID $50: bulut tüneli, bozulmuş verilerden üretilen level](/images/smb1-glitch-levels/v4-glitch-50.jpg)

Glitch level ID $58 (çöken tünel): sprite göstergeci, **ROM mapper'ı olmayan NES'te mevcut olmayan** bir bellek bölgesine işaret eder. Oyun aynı Koopa'yı (0,0) konumunda kare başına 5 kez yüklemeye çalışır, bu PPU'yu doyurur ve donmaya neden olur.

```asm
; Pourquoi ID $58 crashe :
; Sprite pointer → adresse invalide (hors espace NES standard)
; → Le jeu lit des bytes indéterminés comme des types de sprite
; → Le Koopa $00 (type invalide sans handler) boucle en appel récursif
; → Stack overflow 6502 → freeze
```

### Boru warp paradoksu

`target_world BETWEEN 1 AND 8` kontrolünü hatırla. Bir glitch world'de bir boru bulsan bile, oyun hedef world'ün 1 ile 8 arasında olduğunu kontrol eder. Glitch world'lerin numaraları 8'den büyüktür (36-1, 255-1...), bu yüzden warp başarısız olur.

Bu yüzden Minus World'ün sonu yoktur: flagpole sprite'larda mevcut değildir ve borular hiçbir yere götürmez.

### Sütunda 5 nesne hilesi

Sütun başına 3 nesme limitini aşmaya izin veren bir köşe durumu vardır. Kuyruk dolduğunda (slot'lar dolu + sonraki nesnede next screen flag eksik), oyun mevcut sütunu bir next screen flag'li nesne bulana kadar döngü içinde "ön işler". Her ön işlem sırasında:

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

Buna "queue skip" denir ve bazı romhacker'lar tarafından formatın normalde izin verdiğinden daha yoğun level'lar oluşturmak için kullanılır.

## Sürümler arasındaki farklar

### Famicom Disk System

SMB1'in FDS sürümü farklı bir **bellek haritasına** sahiptir. Tüm level göstergeçleri kaydırılmıştır ama veriler aynıdır. Değişen şey: glitch world endeksleri tamamen farklıdır:

```
FDS World 36 → Level ID $09 (eau version de 5-3)
  → Le flagpole est présent ! On peut finir le niveau.
  → Ensuite : $27 (7-3 normal) → $44 (4-4 underground)
  → $44 est finissable → la hache fonctionne → fin du jeu !
  
Le Minus World FDS est donc un "bonus world" qui peut mener
à la complétion du jeu, contrairement à la version NES.
```

Favori FDS level'ım: **ID $5F**, 3-3'ün ikinci yarısının yeraltı versiyonu alçak tünelde (otomatik kaydırıcı olduğu için yazık).

### The Lost Levels (Super Mario Bros. 2 Japon)

Lost Levels birçok şeyi değiştirir:

1. **Tile/sprite sırası aynı**: Artık Frankenstein level'lar yok (tile'lar ve sprite'lar geçersiz ID ile bile aynı level'ı yükler)
2. **Tek 16-bit göstergeç tablosu** ayrı high/low tabloları yerine
3. **4 disk dosyası**: ROM FDS için bölünmüş:
   - Dosya 1: world 1-4
   - Dosya 2: world 5-8
   - Dosya 3: world 9 + ses motoru
   - Dosya 4: world A-D (tamamen farklı göstergeç tablosu)
4. **Aynı Level ID = 4 olası level** yüklenen dosyaya göre
5. **Artık Tennis glitch'i yok**: continue seçeneği (game over'dan sonra aynı world'de devam) warm start'ı gereksiz yapar ve oyun **hemen sıfırlar** world > 9 ise
6. **Yeni nesneler**: zehir mantarı, görünmeyen blok, görünmeyen ateş çiçeği bloğu, ters borular, rüzgar -- ama mevcut listelerin ortasına eklendi → SMB1 ile **geriye uyumluluk sorunu**
7. **Piranha Plant'lar** world 4'ten sonra **her zaman kırmızı**, **çengeller** sadece world 2/B/3/C/7'de **yeşil**

### Super Mario All-Stars (SNES)

Aynı 6502 rutinleriyle doğrudan port (SNES, NES kodunu uyumlu modda çalıştırır):

- **Warp bölgesi düzeltildi**: Artık Minus World yok (soldaki boruya metinden önce girmek doğru world'e götürür)
- **Çökme**: Çoğu glitch level çöker (ID $6A ve 9-1 hariç)
- **Kale nesneleri eklendi**: Daha benzersiz render'lar
- **Ama**: **4-2 wrong warp** hala çalışıyor (yamalanmamış!)

### 4-2 wrong warp: bir nesne yerleştirme hatası

4-2'de iki boru geçiş nesnesi vardır: asma ipi (warp bölgesi) ve boru (para odası). İlk geçiş nesnesi (asma ipi olan), asma ipi ekranda görmeden **çok önce** yerleştirilmiştir. İkinci (boru), level'da **çok geç** yerleştirilmiştir.

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

### Döngü level'ları

Döngüler (8-4, 7-4) nasıl çalışır? Level, hardcoded ekran numaraları ve Y pozisyonlarına sahip **kontrol noktalarına** sahiptir:

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

## Formatı değiştir, kodu değil

Bu mimarinin en büyüleyici derslerinden biri, SMB1 geliştiricilerinin 6502 işleme koduna hiç dokunmadan son derece expresif bir level sistemi oluşturmayı başarmış olmasıdır. Level'lar arasındaki tüm çeşitlilik **verilerden** (göstergeçler, nesneler, sprite'lar, zemin desenleri) gelir, koddan değil.

248 glitch world, **göstergeç tablolarının 128 giriş × 4 tür için boyutlandırılmış** olmasından ve oyunun okuduğu değerleri hiç doğrulamamasından dolayı var. Bir göstergeç RAM'e düştüğünde, oyun Mario'nun register'larını tile olarak yorumlar. Bir göstergeç ses verilerine düştüğünde, oyun müziği level tasarımı olarak çalar. Ve jump tabloları taştığında, oyun çökene kadar her şeyi çalıştırır.

![Daha Fazla Super Mario Bros. Mekanikleri Açıklandı -- 4. video](/images/smb1-glitch-levels/yt-mechanics.jpg)

## Tüm bunlardan neler öğrenebiliriz

1. **Tile/sprite ayrımı**: iki katmanın toplam bağımsızlığı, benzersiz Frankenstein level'lar oluşturan farklı depolama sıralarıyla
2. **RLE sıkıştırması + nesne sistemi**: level'lar bitmap'ler değil, yerleştirilmiş nesne listeleridir, zemin için zemin desenleriyle
3. **3 slot'luk kuyruk**: donanımın (ve level tasarımının) katı limiti
4. **Doğrulama yok**: oyun göstergeçlere ve jump tablolarına güvenir, bu da ya oynanabilir glitch'ler ya da çökme üretir
5. **Maksimum 256 byte**: 6502 Y register limiti, verilerin çok ileri gidildiğinde tekrar etmesine neden olur
6. **Warm start / cold start**: "devam etme" sistemi, Tennis kart değişimi → Mario'nun kapısını açtı

En güzeli: tüm bunlar 40KB'a sığan 6502 kodudur. Soyutlama katmanı yok, bellek erişim doğrulaması yok, istisna yöneticisi yok. Göstergeç bozuksa, oyun çöker. Ve çökmelere glitch world diyoruz.

## 3 şey

1. **Glitch world'ler yanlış yere düşen göstergeçlerdir** -- Oyunun 128 ID × 4 alan türü var ama sadece 34 benzersiz level. World numarası bozulduğunda (Tennis veya wall clip ile), oyun başka bir level için tasarlanmış bir göstergeç yükler ve 512 olası kombinasyon öngörülemeyen sonuçlar üretir.

2. **Minus World, warp hatasının bozulmayla birleşimidir** -- 1-2'deki soldaki boru, metin appearing'den önce etkinleştirilirse, 36 (0x24) world'ünü yükler. Bu world, Level ID $01'e (2-2 suyu) işaret eder, flagpole'siz bir level. Ve world 36 için boru geçişi olmadığından, level sonsuza kadar döner. Doğrulama eksikliği ikonu yaratır.

3. **Tennis → Mario, OoT → Paper Mario'dan 15 yıl önce** -- NES'in RAM'i, kondansatörler ve SMB1'in warm start / cold start sistemi sayesinde kart değişiminden hayatta kalır. Tennis'in adım sayacı (adım sesini çalarken bir RAM byte'ını artıran), world numarasının tam adresine düşer. Top score'un basamaklarının 0'da kalması, $A5 byte'ının sağlam olması ve oyunun warm start tespit etmesi gerekir -- sadece Tennis ile çalışan mükemmel bir koşullar birleşimi.

Orijinal videolar [Retro Game Mechanics Explained](https://www.youtube.com/c/RetroGameMechanicsExplained) tarafından yapılmıştır -- 6502 deassembly, tüm level'ların otomatik haritaları, kart değişimi ve warm start açıklamaları üzerindeki detay seviyesi mükemmel. Seriyi görmediysen, izle, kısa ve her dakikası yoğun.

Map'lerin kaynak kodu [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html) adresinde mevcut ve SMB1'in tam deassembly'si birçok repo'da açık kaynak. 40 yıl önce, Japon programcılar bu level sistemini 6502'de sıfır birim testi ve sıfır hata izleyici ile yazdı ve bugün hala kodlarını açarak yeni şeyler öğreniyoruz.
