---
title: "Super Mario Bros.: seviye formatı, işaretçiler ve 256 glitch dünyası"
description: "128 seviye × 4 bölge türü 40KB ROMa nasıl sığar, Minus World neden vardır ve bir NES Tenis maçı glitch dünyaları nasıl yükleyebilir."
date: 2026-06-10
tags:
  - retro
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "HZA+qzurPyz/1dQAw7L+W1v+fDSomlykp04B3UaVq56F08eFO/gBW+8HZaHbeuPYvxPtJAH2fVIstOe1/l6yxw=="
---

## Giriş

Super Mario Bros. 40 kilobayt ROMdur. Sekiz dünya, 32 seviye, düşmanlar, müzik, power-uplar, hepsi oraya sığar.

Ama emülatör açıp doğru baytları kurcalarsan 36-1. seviyeyi yükleyebilirsin. Ya da 255-1i. Ya da her şeyi Bowser spriteları ve hiçbir yere gitmeyen borulardan oluşan bir dünyada bulabilirsin.

Bu glitch dünyaları basit bir nedenle vardır: SMB1in seviye depolama sistemi 8-bit optimizasyon harikasıdır ve oyunu okumaması gereken yeri okumaya zorlayınca sonuçlar büyüleyicidir.

Retro Game Mechanics Explained bunun hakkında 4 videoluk bir seri yaptı: bunları oyunun döneminin en çok satanının 6502 koduna tek bir dalışta derleyeceğiz.

![GLITCH OBJECTS: RGMechEx serisinin SMB1 gizli mekanikleri başlığı](/images/smb1-glitch-levels/title-card.jpg)

![World 9-1: Tennis kart takasıyla erişilen ilk glitch dünya](/images/smb1-glitch-levels/v1-title-9-1.jpg)

## Warm start: Tennis RAMi SMB1de neden hayatta kalır

Seviye depolamadan bahsetmeden önce SMB1in nasıl başladığını anlamak gerekir. Çünkü NES Tennis glitchi tamamen oyunun **warm start / cold start tespit sistemine** dayanır.

### Korunan 41 bayt

SMB1 **cold start** (ilk çalıştırma ya da güç açma/kapama) tespit edince tüm RAMi siler. Ama **warm start** (reset düğmesi, güç kesintisi yok) tespit edince **41 baytlık** bir bellek bölgesini korur:

```asm
; Warm startte RAMde korunan 41 bayt
; Adresler $075F-$0787
;
; $075F : başlatma baytı (world - 1)    [1 bayt]
; $0760 : dünya seçim bayrağı (B düğmesi) [1 bayt]
; $0761-$0762 : kullanılmaz                    [2 bayt]
; $0763-$0768 : zamanlayıcı (6 hane, 3ü gösterilir) [6 bayt]
; $0769-$076E : Luigi jetonları                   [6 bayt]
; $076F-$0774 : Mario jetonları                   [6 bayt]
; $0775-$077A : Luigi skoru                   [6 bayt]
; $077B-$0780 : Mario skoru                   [6 bayt]
; $0781-$0786 : en yüksek skor (6 hane, 1i gizli) [6 bayt]
; $0787 : sihirli bayt $A5                 [1 bayt]
```

Bu 41 bayt tek bir özelliğe hizmet eder: oyuncunun game overdan sonra **aynı dünyada devam** etmesine izin vermek. 6-3te ölürsen oyun 6. dünyayı başlatma baytına yazar ve başlık ekranında A + Start basılı tutarsan 6-1den yeniden başlarsın.

![Warm startte RAMde korunan 41 bayt: TOP SCORE, MARIO SCORE, TIMER, WORLD SELECT, CONTINUE WORLD ve sihirli bayt $A5](/images/smb1-glitch-levels/v1-memory-state.jpg)

### Çift warm start doğrulaması

![Cold start ve warm start: reset tespit şeması](/images/smb1-glitch-levels/v1-warm-start.jpg)

SMB1 başlarken tek kriter değil **iki** kriter kontrol eder:

```asm
CheckWarmStart:
  ; 1. $0787deki sihirli bayt $A5i doğrula
  lda $0787
  cmp #$A5
  bne ColdStart        ; $A5 değilse → cold start

  ; 2. En yüksek skorun 6 hanesini doğrula ($0781-$0786)
  ;    Her hane 0 ile 9 arasında olmalı
  ldx #0
CheckLoop:
  lda $0781,x
  cmp #$0A
  bcs ColdStart        ; hane >= 10 → cold start
  inx
  cpx #6
  bne CheckLoop

  ; İki koşul da geçerse → warm start
  ; RAM silinmez, başlangıç dünyası korunur
  jmp WarmBootStart
```

![En yüksek skorun $A5 baytı ve hanelerinin doğrulanması: warm startin kalbi](/images/smb1-glitch-levels/v1-a5-byte.jpg)

Neden çift doğrulama? Çünkü $A5 baytı tesadüfen mevcut olabilir (bu değeri bırakan başka bir oyun ya da RAM çipinin varsayılan bekleme durumu). En yüksek skor hanelerinin geçerli (0-9) olduğunu doğrulayarak verilerin tutarlı olduğundan emin olunur.

### Tennis neden işe yarayan tek oyundur

SMB1 ilk takıldığında (cold start) oyun:
1. Tüm RAMi siler → en yüksek skor = 0, dünya baytı = 0
2. $0787 adresine $A5 yazar

Sonra konsolu kapatmadan Tennise geçilir. Tennis:
- Başlangıçta RAMi temizle**mez** (az NES oyunu yapar)
- En yüksek skor baytlarına **yazmaz** → 0 kalırlar (geçerli)
- $A5 baytına **dokunmaz** → mevcut kalır
- Oyuncunun adım sayacı için **$075F adresini kullanır**

```asm
; Tennis içindeki footstep artışı:
; Kortta oyuncunun her adımında Tennis $075Fdeki baytı artırır.
; Bu aynı bayt SMB1 tarafından "world number - 1" olarak kullanılır.
;
; 0 adım  → world 0 → SMB1 = world 1
; 1-7 adım → world 1-7 → normal dünyalar
; 8+ adım → world 8+ → glitch dünyaları!
;
; Sayaç yalnızca müzik durunca artar
; (adım sesleri müzik çalarken oynamaz).
```

SMB1 geri takıldığında:
1. $A5 baytı hâlâ oradadır (Tennis dokunmadı)
2. En yüksek skor haneleri hâlâ 0dır (geçerli)
3. Dünya baytı artık 8+ değerindedir (Tennis adımlarıyla artırıldı)
4. SMB1 warm start tespit eder → bozuk dünya baytını korur
5. A + Start basılı tut → world 9-1, world A-1, world 36-1 vs.

### Neden önce Mario sonra Tennis başlatılmalıdır

Bir incelik: önce SMB1, sonra Tennis, sonra yeniden SMB1 başlatılmalıdır. Doğrudan Tennis ile başlasaydın $A5 baytı hiç yazılmazdı (Tennis $A5 yazmaz), o yüzden warm start tespiti başarısız olur ve RAM silinirdi.

![Tennis adım sayacı: her footstep dünya baytını artırır](/images/smb1-glitch-levels/v1-footstep.jpg)

![Access Glitch Worlds via NES Tennis: kart takasını açıklayan video](/images/smb1-glitch-levels/yt-tennis.jpg)

## SMB1 seviyelerini 40KB içinde nasıl saklar

Nintendo R&D4 görünüşte basit bir sorunu çözmek zorundaydı: karolar, düşmanlar, eşyalarla yatay kayan seviyeleri aşırı sıkı ROM bütçesinde temsil etmek.

Çözüm, **tamamen bağımsız** iki veri katmanına ayırmaktır:

### Kare düzeni (seviyenin haritası)

Her seviye ROMda sıkıştırılmış kare yapısına işaretçiyle tanımlanır. Sıkıştırma ilkeldir ama harikadır: 1-3 veri baytının izlediği "kontrol" baytı.

Kare formatı **dizi** (RLE benzeri) sistemi kullanır:

```asm
; SMB1 kare formatı (basitleştirilmiş)
; Her "komut" bir kontrol baytıdır:
;
; $00-$7F : bir kare koy, 1 sütun ilerle
; $80-$BF : kareyi N kez tekrarla (N = bayt - $80 + 1)
; $C0-$FF : özel komut (satır sonu, atlama, palet değişimi)

Örnek: art arda 3 tuğla çizmek için:
  $82 $01    ; $01 karesini (tuğla) 3 kez tekrarla
```

Her seviye 16 sütunluk 13 satır kare içerir (13×16 = 208 görünür kare). Ama sıkıştırılmış format çok daha alta inmeye izin verir: örneğin gök ve boş sütunlar neredeyse yer tutmaz.

6502de render döngüsü:

```asm
; Kare açma - ana döngü
; Girdi: $XX içindeki tile_data işaretçisi
; Çıktı: PPU RAMinde seviye kare haritası

DecompressTile:
  lda (tile_ptr),y      ; kontrol baytını oku
  iny
  cmp #$80
  bcc SingleTile        ; $00-$7F : tek kare
  cmp #$C0
  bcc RunLength         ; $80-$BF : dizi uzunluğu
  jmp SpecialCommand    ; $C0-$FF : özel komut

SingleTile:
  sta PPU_DATA          ; kareyi doğrudan yaz
  jmp Next

RunLength:
  sec
  sbc #$7E              ; N = control - $7E
  tax
  lda (tile_ptr),y      ; tekrarlanacak kareyi oku
  iny
: sta PPU_DATA
  dex
  bne :-
  jmp Next
```

### Sprite düzeni (düşmanlar ve nesneler)

Paralel olarak düşmanlar ve nesneler (? bloklar, borular, goombalar, koopalar) tamamen ayrı bir yapıda saklanır. Her doğma 2 baytla tanımlanır:

```asm
; SMB1 sprite formatı
; Bayt 0 : X konumu (sütunlarla)
; Bayt 1 : sprite türü + Y sayfa bitleri
; Y dizideki indeksten türetilir

Sprite dizisi:
  $01 $4B    ; 1. sütunda goomba
  $09 $4B    ; 9. sütunda goomba
  $10 $61    ; 16. sütunda ? blok (jeton içerir)
  $15 $54    ; 21. sütunda yeşil koopa
  $FF        ; dizi sonu
```

Her seviye 5 farklı sprite sayfasına başvurabilir (aslında 16 sütunluk 5 "ekran") ama pratikte çoğu seviye yalnızca 2-3 kullanır.

### İşaretçi tablosu

Tasarımın dehası işaretçi tablosudur. Her seviye ROM adresi **çifti** olarak saklanır:

```c
// World Map iç yapısı (basitleştirilmiş)
struct LevelPointer {
    uint16_t tile_ptr;   // Kare verilerinin ROM adresi
    uint16_t sprite_ptr; // Sprite verilerinin ROM adresi
};

// Bölge türü başına 4 ayrı tablo:
// 0 = Water, 1 = Overworld, 2 = Underground, 3 = Castle
LevelPointer level_table[4][128];
```

Tablo başına 128 girdi. 4 bölge türü. **512 olası kombinasyon** ama resmi oyunda yalnızca bir kısmı kullanılır. Geri kalan başlatılmamış RAM ya da işaretçi olarak yorumlanan verilerdir.

Oyun bir seviye yüklerken şunu yapar:

```asm
; Seviye yükleme
; A = AreaType (0-3), X = LevelID (0-127)

LoadLevel:
  sta AREA_TYPE
  asl                  ; 16-bit tabloda ofset için *2
  tax
  lda LevelTable_TilePtr, x
  sta TILE_PTR
  lda LevelTable_TilePtr+1, x
  sta TILE_PTR+1       ; karelere işaretçi
  lda LevelTable_SpritePtr, x
  sta SPRITE_PTR
  lda LevelTable_SpritePtr+1, x
  sta SPRITE_PTR+1     ; spritelara işaretçi
  jsr DecompressTiles
```

Oyun işaretçilere tam güvenir: tablodaki adresi okur ve o adresteki şeyi açar, nokta.

![Level ID $06 (Water): 9-1, 6-2nin su altı sürümü](/images/smb1-glitch-levels/lvl-06-9-1.png)

![Level ID tablosu: 128 olası girdi, 34 atanmış](/images/smb1-glitch-levels/v2-level-id-table.jpg)

![Kare ve sprite işaretçilerinin farklı sırası: Frankenstein seviyelerin nedeni](/images/smb1-glitch-levels/v2-pointer-tables.jpg)

### 34 benzersiz seviye ve 7-bit ID sistemi

![NES RAM çipi (MB8416A): kartuş takasında verileri koruyan odur](/images/smb1-glitch-levels/v1-ram-chip.jpg)

SMB1de 32 seviye değil **34 benzersiz seviye** vardır. Birçok seviye kopyadır (5-3 = 1-3 ama Bullet Billli), "hard mode" bayrağıyla işaretli. Gerçek benzersiz seviyeler:

- **Su** (Tür 0): 3 seviye (2-2, 7-2, bonus bölge 5-2/6-2)
- **Overworld** (Tür 1): 22 seviye (2 bonus bulut odası dahil)
- **Underground** (Tür 2): 3 seviye (yer altı bonus odaları dahil)
- **Castle** (Tür 3): 6 seviye
- \+ 1 ara sahne odası (yer altı/su seviyelerinden önce)
- \+ 1 warp zone 4-2

Her seviyenin **7 bitlik** IDsi vardır. Düşük ağırlıklı 5 bit = alt grup numarası, yüksek ağırlıklı 2 bit = bölge türü:

```asm
; Level ID 7-bit kodlaması
; Bit 6-5 : Tür (00=Water, 01=Overworld, 10=Underground, 11=Castle)
; Bit 4-0 : Alt grup numarası
;
; Water IDler      : $00-$02  (türler 00, numaralar 0-2)
; Overworld IDler  : $20-$35  (türler 01, numaralar 0-21)
; Underground IDler: $40-$42  (türler 10, numaralar 0-2)
; Castle IDler     : $60-$65  (türler 11, numaralar 0-5)
;
; ID $25 = %0100101 → tür 01 (Overworld), numara 5 → 1-1
; ID $23 = %0100011 → tür 01 (Overworld), numara 3 → 6-2
```

**128 olası ID** ($00-$7F), yalnızca 34ü gerçek seviyelere atanmış. Kullanılmayan IDler her şeye işaret eder.

### İşaretçi tabloları: iki liste, iki sıra

Kare ve sprite işaretçileri aynı sırada saklanmaz. Kod iki ayrı 16-bit liste kullanır (iki ayrı tabloda high byte / low byte):

```
Sprite işaretçilerinin sırası:
  İndeks 0-5   : Castle (6 seviye)
  İndeks 6-27  : Overworld (22 seviye)
  İndeks 28-30 : Underground (3 seviye)
  İndeks 31-33 : Water (3 seviye)

Kare işaretçilerinin sırası:
  İndeks 0-2   : Water (3 seviye)
  İndeks 3-24  : Overworld (22 seviye)
  İndeks 25-27 : Underground (3 seviye)
  İndeks 28-33 : Castle (6 seviye)
```

Neden farklı sıralar? Teknik neden yok: veriler geliştirme sırasında muhtemelen böyle organize edildi. Ama büyüleyici bir sonucu vardır: seviye IDsi geçersiz olunca kare ve sprite işaretçileri *farklı* seviyeleri yükler, **Frankenstein seviyeler** yaratır.

Bu iki liste arasında gezinmek için oyun küçük **ofset tabloları** kullanır (içindekiler gibi):

```asm
; Türe göre ofset tabloları (Water, Overworld, Underground, Castle)
; Her girdi = ilgili listedeki başlangıç indeksi

SpriteOffsetTable:
  .byte $1F, $06, $1C, $00    ; Water=31, Overworld=6, Underground=28, Castle=0

TileOffsetTable:
  .byte $00, $03, $19, $1C    ; Water=0, Overworld=3, Underground=25, Castle=28
```

6-2 seviyesini yüklemek için (ID $23, Overworld numara 3):

```asm
; 1. Tür = 01 (Overworld) → ofset tablosunda indeks = 1
; 2. Sprite ofset = SpriteOffsetTable[1] = 6
;    Final indeks = 6 + 3 (seviye numarası) = 9 → 10. sprite işaretçisi
; 3. Tile ofset = TileOffsetTable[1] = 3
;    Final indeks = 3 + 3 = 6 → 7. kare işaretçisi
; 4. Sonuç: kare işaretçi $A619 + sprite işaretçi $9ED0 = 6-2 ✓
```

Peki $43 gibi geçersiz ID ile ne olur (var olmayan Underground numara 3)?

```asm
; ID $43, Tür = 10 (Underground), numara = 3
; Sprite ofset = SpriteOffsetTable[2] = $1C = 28
;   İndeks = 28 + 3 = 31 → 32. sprite işaretçisi = su bonus 5-2!
; Tile ofset = TileOffsetTable[2] = $19 = 25
;   İndeks = 25 + 3 = 28 → 29. kare işaretçisi = 1-4 (Castle)!
;
; Sonuç: 1-4 kareli yer altı seviyesi
; ve 5-2 su bölgesinin Blooperları. Gerçek Frankenstein.
```

![Level ID $43: Frankenstein seviye, 1-4 kareleri + su spriteları 5-2](/images/smb1-glitch-levels/lvl-43-frankenstein.png)

![Exploring Glitch Level Pointers: ofset tabloları açıklandı](/images/smb1-glitch-levels/yt-pointers.jpg)

![World index table: world 9 taşınca glitch seviye yaratır](/images/smb1-glitch-levels/v2-world-index-table.jpg)

### World index table: world 9 neden taşar

Her dünyanın (1-8) ilk seviyesinin indeksini veren 8 baytlık bir ROM tablosu vardır. Ve hemen sonra oyun sırasındaki 36 Level IDnin tablosu.

```asm
; WorldIndexTable (8 bayt)
  .byte 0, 5, 10, 15, 20, 25, 28, 33
;   -> Dünya 1 0. seviyede başlar
;   -> Dünya 2 5. seviyede başlar
;   -> Dünya 8 33. seviyede başlar

; LevelIDTable (36 bayt)
  .byte $25, $28, $29, $26, $24, ... ; 36 Level ID
```

World 9 yüklenmeye çalışılınca oyun WorldIndexTableın var olmayan 9. baytını okur. LevelIDTable içine 1 bayt taşar, $25 değerini okur, sonra $25i LevelIDTable içinde indeks olarak kullanır (37. girdi): bu da SpriteOffsetTable içine yeniden 2 bayt taşar ve 6 değerini okur.

```asm
; World 9 :
;   1. WorldIndexTable[8] (taşma) → LevelIDTable içinde $25 okur
;   2. LevelIDTable[37] (taşma) → SpriteOffsetTable 2. baytını okur = 6
;   3. ID = 6 → var olmayan Water seviye numara 6
;   4. Tile pointer = water işaretçi numara 6 = 6-2 kareleri
;   5. Sprite pointer = indeks 31+6 = 37 > 33 → geçersiz işaretçi
;   6. Sonuç: glitchli spritelı su altı 6-2
;      → world 9-1!
```

World G (16) için taşma daha da ileri gider ve cutscene Level ID $01 üzerine düşer:

```asm
; World G (16) :
;   WorldIndexTable[15] → LevelIDTable içinde $01 okur
;   LevelIDTable[1] = $29 (1-2 giriş ara sahnesi)
;   → world G-1 = 1-2 giriş ara sahnesi
```

## Glitch dünyaları neden vardır

Oyunda 32 "meşru" seviye vardır (8 dünya × 4 seviye). Ama işaretçi tablosu bölge türü başına 128 girdi yapar. 32. seviye ötesindeki girdiler ROMda o adreslerde ne varsa içerir: bazen başka bir seviye, bazen ses verileri, bazen RAM, bazen her şey.

![Level ID $01 Water (Minus World): kare işaretçi $AE45, sprite işaretçi $A171](/images/smb1-glitch-levels/minus-world.png)

### Level ID $01 + AreaType 0 = Minus World

Glitch dünyalarının en ünlüsü. AreaType 0 (su) içinde Level ID $01 şuna işaret eder:

- **Tile pointer: $AE45** → 2-2/7-2 su altı bölgesi
- **Sprite pointer: $A171** → 2-2/7-2 spriteları

Sonuç: 2-2ye benzeyen bir su seviyesi ama bayrak direği olmadığı için sonsuz döngüye girer. Seviye sonsuza dek döner.

Bu 36-1 seviyesidir (ya da $-1 dünyasında 36-1).

![SMB1 warm start kontrolü: Minus Worldün var olmasına izin veren odur](/images/smb1-glitch-levels/v4-minus-world.jpg)

```asm
; Bayrak direği Minus Worldde neden eksik:
; 2-2/7-2 spriteları ($A171) dizilerinde bayrak direği
; yoktur. Oyun $FD spritini (bayrak direği) arar
; ama asla bulamaz → sonsuz döngü
;
; Oyun seviyeyi sonsuza dek üretmeye devam eder
; zamanlayıcı sıfıra ulaşana kadar.
```

### RAMe işaret eden işaretçiler

Kare işaretçi ya da sprite işaretçi ROM yerine RAM adresine ($00-$7F) işaret edince oyun RAMin sürekli değişimlerini kare olarak yorumlamaya çalışır:

```asm
; Örnek: Water içinde Level ID $03
; Tile Pointer : $A46B (3-3 - geçerli)
; Sprite Pointer : $009D (sıfır sayfası RAMe işaret eder!)
;
; Sıfır sayfası RAM oyun yazmaçlarını içerir,
; Marionun konumu, sayaçların durumu...
; Oyun bunu sprite dizisi olarak açar
; ve sonuç yazmaç değerleri olan düşmanlı bir seviyedir.
```

Sıfır sayfası değişince (Mario hareket ettiği, zamanlayıcı döndüğü için...) seviyenin "spriteları" da değişir. Bazı glitch dünyalarının sürekli yanıp sönen ve dönüşen düşmanları olmasının sebebi budur.

![Level ID $03 Water: sprite işaretçi $009D RAMe işaret eder, oynanamaz seviye](/images/smb1-glitch-levels/level-03-water.png)

### Level ID $36: boş seviye (Overworld)

Overworld içinde Level ID $36:

- **Tile pointer: $AC35** (1-2)
- **Sprite pointer: $A0D8** (1-2)

Sonuç: hiçbir şey. Oyun seviyeyi yükler ama RGMechEx kataloğunda "seviyesiz" işaretlidir. Kareler geçerli olabilir ama spritelar boş ya da işlevsiz seviye üreten bir yere işaret eder.

### Level ID $1D (Castle): crash şampiyonu

Castle içinde Level ID $1D:

- **Tile pointer: $A210** (4-4)
- **Sprite pointer: $7EA0** (RAM!)

RAMde sprite işaretçi = tanımsız spritelar. Oyun ilk kare satırında Spiny topu ya da Bullet Bill atıcı göstermeye çalışır. Hemen çöker.

```asm
; Sprite işaretçi RAMe işaret edince
; oyun sürekli değişen baytları "doğma" talimatları
; gibi açar. Sonuç:
; - Var olmayan nesnelerin belirmesi (tanımsız değer)
; - NES spriti geçersiz kare göstermeye çalışınca PPU çökmesi
; - Konsolun tam donması
```

## Kataloglanmış 256 glitch dünyası

RGMechEx **tüm seviyelerin** haritalarını üreten bir script yazdı, 4 bölge türü ve her biri 128 ID için.

Dünya sayacı 8 bittir (0-255). 1-8. dünyalar meşrudur. Geriye **248 potansiyel glitch dünyası** kalır. Her glitch dünya bu dünyanın ilk seviyesine karşılık gelir ve Level IDsi WorldIndexTable taşma mekanizmasıyla hesaplanır.

![Glitch dünyaları tablosu: 248 bozuk dünya, 68 erişilebilir ilk seviye](/images/smb1-glitch-levels/v3-glitch-worlds-table.jpg)

128 olası IDden yalnızca **68i bir dünyanın "ilk seviyesidir"** (glitch dünya numarası üzerinden erişilebilir). Diğer 60ı 2+ seviyeler ya da erişilemezdir.

| Tür | Oynanabilir benzersiz ID | Çöken ID | Boş ID |
|------|---------------------|-------------------|-----------|
| Water (0)    | ~20  | ~60  | ~48  |
| Overworld (1)| ~30  | ~55  | ~43  |
| Underground (2) | ~15 | ~65 | ~48  |
| Castle (3)   | ~25  | ~58  | ~45  |

İşaretçiler aynı ROM adreslerine düştüğü için birçok ID aynı seviyeye götürür. Örneğin Level ID $28 (Overworld): kare işaretçi $A7CD (2-1), **38 farklı glitch dünyada** görünür çünkü sprite işaretçi $9F51 birçok IDce yeniden kullanılan dolgu/ses verisi bölgesine işaret eder.

![Level ID $28 (Overworld) haritası: normal spritelı 2-1 kareleri, 38 glitch dünya](/images/smb1-glitch-levels/level-28-overworld.png)

![Super Mario Bros. Glitch Levels Explained: 3. video](/images/smb1-glitch-levels/yt-levels.jpg)

### Gerçekten benzersiz 6 glitch seviyesi

Erişilebilir 19 glitch seviye IDsi arasında yalnızca **6sı yüklenirken hemen çökmez**:

| Dünya | Level ID | Açıklama |
|-------|----------|-------------|
| E-1 (224) | $50 | Uçurum üstünde tek ? blok. Mario anında ölür. |
| W | $57 | Mario doğmada sıkışır, hareket edemez. |
| 42 (133) | $50 | Mario yeterince ileri giderse onu tuzağa düşüren bulut tüneli. |
| 62 (131, 240) | $4D | Donmuş kale: Mario üstte doğar, düşemez → sıkışır. |
| 127 | $4B | Yer altı tüneli ama çok ileri gidilirse çöker. |
| 137 | $4B | Ara sahnelerin otomatik kaydırmasını etkinleştirir. Mario onu sonsuza dek bloklayan tek tuğla blokla karşılaşır. |

![Level ID $50 (bulut tüneli): glitch dünya 42-1 ve E-1](/images/smb1-glitch-levels/lvl-50-cloud.png)
![Level ID $4D (kale): world 62-1, Mario doğmada sıkışır](/images/smb1-glitch-levels/lvl-4D-castle.png)
![Level ID $4B (tünel): world 127-1, çok ileri gidilirse çöker](/images/smb1-glitch-levels/lvl-4B-tunnel.png)

248 glitch dünyadan gerçekten yeni bir şey üreten altı glitch dünya. Geri kalan yanlış bölge türünde normal seviyeler ya da siyah ekranlardır.

## Seviye formatı ayrıntılı

Tam seviye veri formatına odaklanılır, glitch seviyelerin neden ayakta durduğunu (ya da durmadığını) anlamak için.

### Seviye başlığı: 2 bayt, 6 özellik

Her seviye 6 özelliği kontrol eden 2 baytlık başlıkla başlar:

```asm
; Bayt 0 : zamanlayıcı + Y başlangıç + değiştirici
;   Bit 7-6 : zamanlayıcı (00=değişmez, 01=200, 10=300, 11=400)
;   Bit 5-3 : Y başlangıç Mario (111/110 = otomatik yürüme)
;   Bit 2-0 : seviye türü değiştirici
;              000=varsayılan, 001=dalgalar, 010=tuğla duvar,
;              011=su dibi, 100=gece, 101=kar,
;              110=karlı gece, 111=gri gece

; Bayt 1 : platform + arka plan + zemin deseni
;   Bit 7-6 : özel platform (00=ağaç, 01=mantar,
;                                 10=Bullet Bill, 11=bulut)
;   Bit 5-4 : arka plan (00=yok, 01=bulutlar,
;                           10=dağlar, 11=çitler)
;   Bit 3-0 : başlangıç zemin deseni (0-15)
```

Tür değiştirici görsel varyasyonları kontrol eder: su seviyelerinin üstündeki dalgalar, 8-3ün tuğla fonu, 4-3ün gece paleti, 6-2nin karı vs.

### Kare nesneleri: 2 bayt, Next Screen Bayrağı, 3 slot kuyruk

Başlıktan sonra **kare nesne** listesi gelir, her nesne 2 bayttır. $FD baytı listenin sonunu işaretler.

```asm
; Kare nesne formatı (16 bit):
; Bayt 0 :
;   Bit 7-4 : X konumu (sütun 0-15)
;   Bit 3-0 : Y konumu
;     Y=0-11  : normal Y konumu
;     Y=12    : özel nesneler (delikler, köprüler, ip, ? bloklar)
;     Y=13    : ekran atlama / özel nesneler 2
;     Y=14    : değiştirici/dekor/zemin değişimi
;     Y=15    : özel nesneler 3 (kale, merdivenler, büyük boru)

; Bayt 1 :
;   Bit  7   : NEXT SCREEN FLAG
;   Bit 6-4 : nesne türü (0-7)
;   Bit 3-0 : genişlik/yükseklik / alt tür
```

"next screen" biti konunca mevcut çalışma sütunu 1 artırılır. Bu ilk 16 sütunun ötesine nesne yerleştirmeye izin verir. Oyun onları sırayla yüklediği için nesneler **sırayla** listelenmelidir (soldan sağa):

```asm
; Yükleme rutininin sütun başına İKİ fazı vardır:
; Faz 1 : bu sütunda başlayan yeni nesneleri ara
;            ve kuyruğa ekle (queue)
; Faz 2 : kuyruktaki her nesneyi kareleri çizerek işle
;            ve bu sütunda bitenleri çıkar
```

Kuyruk tam **3 slot** yapar. Doğrudan sonuç: aynı sütunda başlayan 3ten fazla nesne olamaz. Kuyruk doluysa 4. nesne yoksayılır ve asla yüklenmez.

İyi tasarlanmış seviyelerin bu yüzden çok nesne yığmaktan kaçınmasıdır. 1-2deki örnek: tavandaki 1up blok + yanındaki tuğlalar 3 limitine uymak için iki ayrı nesneye bölünmüştür.

### Özel Y konumu: 12, 13, 14, 15

Y=12 olunca nesnenin Y konumu yoktur (türe göre sabit kodludur):

```asm
; Y=12 : Y konumsuz nesneler
;   Tür 0 : delik (zemini siler)
;   Tür 1 : hareketli platform ipi
;   Tür 2-4 : sabit Yli köprüler
;   Tür 5 : su/lavlı delik
;   Tür 6-7 : ? blok sıraları
```

Y=13 olunca iki alt grup. Bayt 1in 6. biti 1 ise:

```asm
; Y=13, bit6=1 : özel nesneler
;   0 = L-boru (ara sahne), 1 = bayrak direği, 2-3 = köprü/balta/çekiç (kale sonu)
;   4 = ekran durdurma, 5 = rastgele düşmanlar, 6 = seviye döngüsü, 7+ = olası crash
```

Bit6=0 ise düşük ağırlıklı 5 bit **ekran atlamayı** kodlar (tek tek next screen bayrağıyla geçmeden doğrudan N ekranına atlama).

Y=14 olunca: tür değiştiriciyi değiştirmek için bit6=1 ile aynı ilke, fon + zemin desenini değiştirmek için bit6=0.

### Zemin desenleri: 16 zemin motifi

Seviyelerin zemini tekil nesnelerden yapılmaz. SMB1 bir sonraki değişime kadar tüm sütunlara uygulanan arka plan motifi **zemin desenleri** kullanır:

```asm
; Zemin desenleri (4 bit = 16 olasılık)
;   0 = tam boş
;   1 = 2 kare yüksek zemin
;   2 = 1 kare yüksek zemin
;   3 = zemin + alt
;   4 = zemin + alt 2
;   5 = zemin 1/2 kare
;   6 = 3/4 zemin
;   ... 15e kadar = tam dolu (zemin + tavan)
```

Deliklerin nesne olmasının sebebi budur: geri kalan için deseni değiştirmeden belirli bir sütunda zemin desenini ezerler.

### 256 bayt limiti ve tekrar

Bir seviyenin tüm kare verileri **maksimum 256 bayta** sığar. 6502nin Y yazmacı indeks olarak kullanılır ve 8 bittir. Oyun $FD baytını bulmadan verilerin sonuna gelirse **başa döner** ve 256 baytı sonsuza dek tekrarlar:

```asm
; İndeks Y = 8 bit → maksimum 256 bayt kare verisi
; Y taşarsa (255 → 0) $FD ile karşılaşmadan → tekrar
; Spritelar için aynısı ama boru nesneleri (3 bayt)
; her yüklemede indeks paritesini kaydırır.
```

Bazı glitch seviyeler "süresiz" süren seviyeler üretmek için bu tekrardan yararlanır.

### Sprite sistemi: 2 bayt + boru geçişleri

Spritelar benzer formatı izler ama başlıksız ve birkaç kilit farkla. $FF baytı listenin sonunu işaretler.

```asm
; Sprite formatı (2 bayt):
; Bayt 0 : X konumu (sütun)
; Bayt 1 :
;   Bit 7 : NEXT SCREEN FLAG
;   Bit 6-0 : sprite türü
;       Bazı türler: goomba, koopa, Blooper,
;       Bullet Bill, Lakitu, Spiny, platformlar,
;       warp zone komutu, toad/prenses,
;       düşman grubu doğurma komutları
```

Bayt 1in düşük ağırlıklı biti **hard level bayrağıdır**: 1 ise sprite yalnızca ≥ 5-3 seviyelerinde belirir. "hard mode" seviyeleri böyle yaratılır.

Y konumu 15 = **ekran atlama** (karelerle aynı). Y konumu 14 = **boru geçişi** (3 bayt):

```asm
; Sprite Y=14 : boru/sarmaşık geçişi (3 bayt!)
;   Bayt 0 : X konumu
;   Bayt 1 : bit 6-0 = 7-bit Level ID (hedef)
;   Bayt 2 : bit 4-0 = hedef ekran
;            bit 7-5 = bu geçişin geçerli olduğu dünya
;
; Neden dünya? Bonus odalar dünyalar arasında yeniden kullanılır.
; Örnek: 1-1 bonus odası 2-1 ve 7-1 tarafından da kullanılır.
; Bu odanın 3 geçişi vardır, dünya başına bir tane, böylece Mario
; doğru yerde yeniden belirir.
```

Spriteların **kuyruk sistemi yoktur**. Tek limit doğma bölgesinde (hemen ekran dışı sağda) aynı anda yüklenebilecek 4ten fazla sprite olamamasıdır. Ötesi yoksayılır.

## Glitch dünyalarına nasıl erişilir

İki ana yöntem vardır.

### Klasik yöntem: duvar klibi

Duvar klibi (duvarlardan geçme) normal seviyeden çıkıp gizli warp bölgesine kadar yürümeye izin verir. RAM üzerinden dünya sayacını manipüle ederek herhangi bir Level ID yüklenebilir.

Teknik:
1. World 1-2: gizli bitiş borusuna git
2. Sağ duvarda duvar klibi yap
3. Boşlukta warp bölgesine kadar yürü
4. Oyun değerleri dünya olarak yorumlar

Ama bu yöntem glitch dünyalarının yalnızca küçük kısmına erişim verir.

### Ekstrem yöntem: NES Tennis kart takası

Tam detay için yukarıdaki "Warm start" bölümüne bak. Özet: Tennis adım sayacı SMB1 başlangıç dünyasıyla aynı RAM baytına yazar ve warm start tespiti bu değeri korur.

### Meraklı köşesi: her şeyi keşfetme kodu

Emülatörde tüm glitchi kendin keşfetmek istersen Level IDyi doğrudan yamayabilirsin:

```asm
; FCEUX / Mesen için yama:
; RAM adresi $075F = mevcut Level ID
; RAM adresi $0760 = Bölge Türü (0=Water, 1=Overworld, 2=Underground, 3=Castle)

; Örnek: Overworldde Seviye 57 (0x39) yükle
; Emülatörde bellek izleyiciyi aç ve yaz:
; $075F = 0x39
; $0760 = 0x01
; Sonra warp borusuna gir ya da öl ve yeniden başla
; → Oyun ID $39 seviyesini Overworldde yükler
```

RGMechEx otomatik üretilmiş haritalı 128 seviye × 4 türün tam listesini [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html) üzerinde yayınladı. Her girdi kare işaretçiyi, sprite işaretçiyi ve seviyenin görsel haritasını gösterir.

## En saçma seviyeler

### Level ID $1F (Water): tekte 15 glitch dünya

Kare işaretçi $A302 (3-4) ile sprite işaretçi $02A0 birleşimi 15 farklı glitch dünya verir (D-1, J-1, Y-1, Z-1, 55-1, 73-1...). Açıklama: sprite işaretçi oynanabilir sonuçlar üretecek kadar geçerli spritelara yakın veriler içeren ROM bölgesine işaret eder ama 3-4 kale kareleriyle overworld spritelarının kombinasyonu absürt bir render yaratır.

### Level ID $28 (Overworld): 38 glitch dünya = rekor

Mutlak rekor. 38 glitch dünya girdisi aynı seviyeye işaret eder (2-1 kareleri + $9F51 spriteları). Neden? Çünkü sprite işaretçi $9F51 birçok IDce yeniden kullanılan dolgu/ses verisi bölgesine düşer.

### Level ID $49 (Underground): FDS seviyesi

Kare işaretçi $76AE + sprite işaretçi $1C9D. Kare işaretçi Famicom Disk System sürümüne ayrılmış ROM bölgesine işaret eder. Sonuç: standart kartuşta var olmayan kareli bir seviye. 52-1 ve 196-1 seviyelerini gösteren seviye budur.

### Level ID $00-$02: gerçek bonus seviyeler

Bu IDler oyunun meşru alt seviyelerince kullanılır:

- **$00**: 5-2/6-2 su altı bölgesi (H-1, 39-1 kullanır)
- **$01**: 2-2/7-2 suyu (Minus World, 36-1)
- **$02**: 8-4 alt seviyesi (136-1, 151-1, 215-1)

Normal erişilen "bonus" seviye ile glitch dünya arasındaki fark warp zoneların mevcut dünyayı doğrulamasıdır:

```asm
; Warp zone doğrulaması (basitleştirilmiş)
; Oyun hedef dünyanın 1 ile 8 arasında olduğunu doğrular
CheckWarp:
  lda TARGET_WORLD
  cmp #1
  bcc InvalidWarp       ; < 1 → reddedildi
  cmp #9
  bcs InvalidWarp       ; > 8 → reddedildi
  ; yalnızca 1 ile 8 arası geçerli dünya
  jmp DoWarp
```

Numarası > 8 ya da 0 olan glitch dünyalarına normal borularla ulaşılamaz. Duvar klibi ya da kart takası gerekir.

## Bazı seviyeler neden çöker: jump tablelar

Oyun bir kare nesnesi yüklerken türünü **jump table** içinde indeks olarak kullanır:

```asm
; Standart kare nesnelerinin jump tableı (türler 0-11)
JumpTable_TileObjects:
  .word Obj_Special       ; tür 0 : ? blok, gizli, bayrak direği...
  .word Obj_Platform      ; tür 1 : özel platform
  .word Obj_BrickRow      ; tür 2 : tuğla sırası
  .word Obj_BlockRow      ; tür 3 : blok sırası
  .word Obj_CoinRow       ; tür 4 : jeton sırası
  .word Obj_BrickCol      ; tür 5 : tuğla sütunu
  .word Obj_BlockCol      ; tür 6 : blok sütunu
  .word Obj_Pipe          ; tür 7 : boru
  .word Obj_8             ; tür 8
  .word Obj_9             ; tür 9
  .word Obj_10            ; tür 10
  .word Obj_11            ; tür 11
```

![Jump tablelar: geçersiz nesne türü oyunu neden çökertir](/images/smb1-glitch-levels/v4-jump-table.jpg)

Bir nesnenin türü geçersizse (≥12) oyun bu tabloda var olmayan bir işaretçiye atlar. **4 olası sonuç**:

1. **Geçerli işaretçi** → nesne normal yüklenir
2. **Başka jump tablea işaretçi** (örtüşme) → farklı bir nesne belirir. Örnek: tür 12 Y=13 tablosuna işaret eder, bu da L-boru verir.
3. **Çalıştırılabilir koda işaretçi** → rastgele kod çalıştırma (olası crash)
4. **Açık yer tutucu (NOP)** → nesne hiçbir şey yapmaz (bazı spritelar böyledir, hareket etmeden yerinde uçan düşmanlar üretir)

![Glitch seviye ID $58: sprite işaretçi geçersiz adrese işaret eder, oyun çöker](/images/smb1-glitch-levels/v4-glitch-58-crash.jpg)

![Glitch seviye ID $50: bulut tüneli, bozuk verilerle üretilmiş seviye](/images/smb1-glitch-levels/v4-glitch-50.jpg)

Glitch seviye ID $58 (çöken tünel): sprite işaretçi NES standart haritasında **var olmayan** bellek bölgesine işaret eder. Oyun aynı Koopayı kare başına 5 kez (0,0) konumunda yüklemeye çalışır, bu PPUyu doyurur ve donmaya neden olur.

```asm
; ID $58 neden çöker:
; Sprite işaretçi → geçersiz adres (standart NES alanı dışı)
; → Oyun belirsiz baytları sprite türleri olarak okur
; → Geçersiz $00 Koopa (handlersız tür) özyinelemeli çağrıda döngüye girer
; → 6502 yığın taşması → donma
```

### Boru warp paradoksu

`target_world BETWEEN 1 AND 8` kontrolünü hatırla. Glitch dünyada bir boru bile bulsan oyun hedef dünyanın 1 ile 8 arasında olduğunu doğrular. Glitch dünyaların numaraları > 8dir (36-1, 255-1...), o yüzden warp başarısız olur.

Minus Worldün sonu olmamasının sebebi de budur: bayrak direği spritelarda yoktur ve borular hiçbir yere gitmez.

### Tek sütunda 5 nesne numarası

Sütun başına 3 nesne limitini aşmaya izin veren uç durum vardır. Kuyruk bloklanınca (slotlar dolu + sonraki nesnede next screen bayrağı eksik) oyun mevcut sütunu next screen bayraklı nesne bulana kadar döngüde "ön işler". Her ön işleme sırasında:

```asm
; Sütunun ön işlenmesi sırasında:
; 1. Kuyruktaki nesnelerin kalan genişliği
;    her "sahte sütun ilerlemede" azaltılır
; 2. Bir nesne genişlik=0a ulaşırsa kuyruktan çıkar
; 3. Serbest slot aynı sütunda eklenen yeni nesneyle
;    doldurulabilir

; Sonuç: aynı sütunda 5e kadar nesne işlenebilir.
; Teknik: ekran sınırını geçen 2 nesne yerleştir
; (slot 1 ve 2), öncekinden X < olan 1 kukla nesne (kuyruğu bloklar),
; sonra sonraki ekranın X=0ına 3 nesne (biri next screen bayraklı).
```

Buna "queue skip" denir ve bazı romhackerlar formatın normalde izin verdiğinden daha yoğun seviyeler yaratmak için kullanır.

## Sürümler arası farklar

### Famicom Disk System

SMB1in FDS sürümünün **farklı bellek haritası** vardır. Tüm seviye işaretçileri kaymıştır ama veriler aynıdır. Değişen şey: glitch dünya indeksleri tamamen farklıdır:

```
FDS World 36 → Level ID $09 (5-3 su sürümü)
  → Bayrak direği mevcut! Seviye bitirilebilir.
  → Sonra: $27 (normal 7-3) → $44 (4-4 underground)
  → $44 bitirilebilir → balta çalışır → oyun sonu!
  
  Yani FDS Minus World NES sürümünün tersine oyunun
  tamamlanmasına götürebilen "bonus dünya"dır.
```

Favori FDS seviyem: **ID $5F**, alçak tünelde 3-3 ikinci yarısının yer altı sürümü (otomatik kaydırıcı olması yazık).

### The Lost Levels (Japon Super Mario Bros. 2)

Lost Levels birçok şeyi değiştirir:

1. **Aynı kare/sprite sırası**: artık Frankenstein seviye yok (geçersiz IDde bile kareler ve spritelar aynı seviyeyi yükler)
2. İki ayrı high/low tablo yerine **tek 16-bit işaretçi tablosu**
3. **4 disk dosyası**: ROM FDS için bölündü:
   - Dosya 1: world 1-4
   - Dosya 2: world 5-8
   - Dosya 3: world 9 + ses motoru
   - Dosya 4: world A-D (tamamen farklı işaretçi tablosu)
4. **Aynı Level ID = yüklenen dosyaya göre 4 olası seviye**
5. **Artık Tennis glitchi yok**: continue seçeneği (game overdan sonra aynı dünyada devam) warm starti gereksiz kılar ve oyun world > 9 ise **hemen sıfırlar**
6. **Yeni nesneler**: zehirli mantar, görünmez blok, görünmez ateş çiçeği blok, ters borular, rüzgâr: ama mevcut listelerin ortasına eklendi → SMB1 ile **geriye uyumsuzluk**
7. World 4 sonrası hep kırmızı **Piranha Plant**, yalnızca world 2/B/3/C/7de yeşil **yay tahtaları**

### Super Mario All-Stars (SNES)

Aynı 6502 rutinlerle doğrudan port (SNES uyumlu modda NES kodunu çalıştırır):

- **Warp zone düzeltildi**: artık Minus World yok (metinden önce sol boruya girmek doğru dünyaya götürür)
- **Çökme**: çoğu glitch seviye çöker (ID $6A ve 9-1 hariç)
- **Eklenen kale nesneleri**: daha benzersiz renderlar
- **Ama**: **4-2 wrong warp** hâlâ çalışır (yamalanmadı!)

### 4-2 wrong warp: nesne yerleştirme hatası

4-2de iki boru geçiş nesnesi vardır: sarmaşık (warp zone) ve boru (jeton odası). İlk geçiş nesnesi (sarmaşığınki) sarmaşık ekranda belirmeden **çok önce** yerleştirilir. İkincisi (borununki) seviyede **çok geç** yerleştirilir.

```asm
; 4-2de geçişlerin zamanlaması:
; Geçiş nesnesi 1 (sarmaşık → warp zone) : sarmaşıktan 3 ekran önce yerleştirilir
; Geçiş nesnesi 2 (boru → jeton odası) : borudan 1 ekran sonra yerleştirilir
;
; Normalde Mario boruya ulaşmadan önce ilk nesne devre dışı kalır.
; Ama Mario hızlı giderse (ya da B+sağ blok kısayolunu kullanırsa) sarmaşık
; geçişi boruya dokunduğunda hâlâ aktiftir!
; → Oyun jeton odası yerine warp zone yükler.
;
; Nesne sarmaşığın hemen sonrasına ama borudan önce
; yerleştirilseydi hata var olmazdı.
```

### Döngülü seviyeler

Döngüler (8-4, 7-4) nasıl çalışır? Seviyenin ekran numaraları ve sabit Y konumlarıyla **kontrol noktaları** vardır:

```asm
; Kontrol noktası: {screen_number, vertical_position}
; Mario bu kontrol noktasından doğru yükseklikte geçerse → seviye devam eder
; Yoksa → 4 ekran geri warp (64 blok)
;
; Sonsuz döngü için: vertical_position = $F0
; (ekranın altının altında) → doğrulamak imkânsız.
;
; Kontrol noktaları teklidir (tek bayrak) world 7 hariç
; o üçlü kullanır (3 bayrak, en az 1inde başarısız olmak gerekir)
;
; Geri warp serttir: kare veri ofseti sabit değere ayarlanır,
; sprite veri ofseti 0a sıfırlanır. Mevcut düşmanlar
; anında boşaltılır → firebarlar kaybolur.
```

## Formatı değiştirmek, kodu değil

Bu mimarinin en büyüleyici derslerinden biri SMB1 geliştiricilerinin 6502 render koduna hiç dokunmadan çok etkileyici bir seviye sistemi yaratmayı başarmasıdır. Seviyeler arası tüm varyasyon **verilerden** (işaretçiler, nesneler, spritelar, zemin desenleri) gelir, koddan değil.

256 glitch dünya vardır çünkü **işaretçi tabloları 128 girdi × 4 tür boyutludur** ve oyun okuduğu değerleri asla doğrulamaz. İşaretçi RAMe düşünce oyun Marionun yazmaçlarını kare olarak yorumlar. İşaretçi ses verilerine düşünce oyun müziği seviye tasarımı olarak oynar. Ve jump tablelar taşınca oyun crash olana kadar her şeyi çalıştırır.

![More Super Mario Bros. Mechanics Explained: 4. video](/images/smb1-glitch-levels/yt-mechanics.jpg)

## Bütün bunlardan ne öğrenilebilir

1. **Kare/sprite ayrımı**: iki katmanın tam bağımsızlığı, benzersiz Frankenstein seviyeler yaratan farklı depolama sıralarıyla
2. **RLE sıkıştırma + nesne sistemi**: seviyeler bitmap değil yerleştirilmiş nesne listeleridir, zemin için zemin desenleriyle
3. **3 slot kuyruk**: donanımın (ve seviye tasarımının) katı limiti
4. **İşaretçilere tam güven**: oyun işaretçilere ve jump tablelara güvenir, bu ya oynanabilir glitchler ya crash üretir
5. **Maksimum 256 bayt**: 6502 Y yazmacının limiti, çok ileri gidilirse verilerin tekrar etmesine neden olur
6. **Warm start / cold start**: Tennis → Mario kart takasına kapı açan "devam" sistemi

En güzeli: bütün bunlar 40KB içine sığan 6502 kodudur. Kod doğrudan donanımla konuşur ve her bellek erişimine tam güvenir. İşaretçi bozuksa oyun çöker. Ve crashlere glitch dünyaları deriz.

## Akılda tutulacak 3 şey

1. **Glitch dünyaları kötü düşen işaretçilerdir**: Oyun 128 ID × 4 bölge türüne sahiptir ama yalnızca 34 benzersiz seviye. Dünya numarası bozulunca (Tennis ya da duvar klibiyle) oyun başka bir seviye için tasarlanmış işaretçi yükler ve 512 olası kombinasyon öngörülemez sonuçlar üretir.

2. **Minus World warp hatasıyla bozulmanın birleşimidir**: 1-2deki sol boru metin belirmeden etkinleştirilirse world 36 (0x24) yükler. Bu dünya Level ID $01e işaret eder (2-2 suyu), bayrak direksiz bir seviye. Ve world 36 için boru geçişi olmadığı için seviye sonsuz döngüye girer. Doğrulama yokluğu ikonu yaratır.

3. **Tennis → Mario, OoT → Paper Mario tan 15 yıl önce**: NES RAMi kapasitörler ve SMB1in warm start / cold start sistemi sayesinde kartuş takasında hayatta kalır. Tennis adım sayacı (adım seslerini oynatarak RAM baytını artıran) tam dünya numarası adresine düşer. En yüksek skor hanelerinin 0 kalması, $A5 baytının bozulmaması gerekir ve oyunun warm start tespit etmesi gerekir: yalnızca Tennis ile işe yaramış mükemmel bir tesadüfler yarışması.

[Retro Game Mechanics Explained](https://www.youtube.com/c/RetroGameMechanicsExplained) orijinal videoları inanılmaz bir karınca işidir: 6502 sökümünde detay seviyesi, tüm seviyelerin otomatik haritaları, kart takası ve warm start açıklamaları. Seriyi izlemediysen izle, kısadır ve her dakika yoğundur.

Haritaların kaynak kodu [rgmechex.com](https://rgmechex.com/tech/smb1levels/index.html) adresinde mevcuttur ve tam SMB1 sökümü birçok depoda açık kaynaktır. 40 yıl önce Japon programcılar bu seviye sistemini sıfır birim testi ve sıfır hata izleyiciyle 6502de yazdı ve bugün kodlarını açarak optimizasyon teknikleri öğrenmeye devam ediyoruz.
