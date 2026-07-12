---
title: "character-factory'yi İnşa Etmek: Genetikle Avatar Oluşturma"
description: "DiceBear üzerine bir TypeScript modülü: tutarlı ülke/etnisite
  tabanlı oluşturma, çocukları yansıtmak için küçük bir genetik motoru ve bir
  kart oyununda kullanışlı hale getiren mühendislik detayları."
date: 2026-05-16
aiGenerated: true
tags:
  - typescript
  - npm
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "dCnsoN0IHoqbj335yGrh9tcWDMlhk8I+6zejnO7uV22wTaUXmhmQ/HUfpp0CClrUI6Kp0Fekyt5TpkvLy8vQAw=="
---

# character-factory'yi İnşa Etmek: Genetikle Avatar Oluşturma

[Kurekuta](https://github.com/fox3000foxy/kurekuta/) için binlerce inandırıcı, farklı avatara ihtiyacım vardı -- her kartın bir karakter "DNA"sı taşıdığı ve renderleyicinin bunu bir portreye dönüştürdüğü özel bir kart oyunu projesi. Hazır bir paket satın almak stok gibi görünürdü. Tohum başına tek seferlik DiceBear avatarları üretmek yanlış şekilde rastgele hissettiriyordu: Japon temalı bir kart İskandinav sarışınına düşebiliyordu ve iki "kardeş" birbirine yabancı gibi görünüyordu.

Bu yüzden [character-factory](https://github.com/fox3000foxy/character-factory)'i yazdım -- DiceBear'ın Lorelei koleksiyonunun üzerine, DiceBear'ın tek başına vermediği üç şeyi ekleyen bir TypeScript modülü: **tutarlı demografiler**, **küçük bir genetik motoru** ve **bir oyun döngüsünden kullanması keyifli akıcı bir builder**.

## Ne işe yarıyor

Kullanışlı en küçük parça:

```ts
import { CharacterFactory, Country, Mood } from "character-factory";

const svg = new CharacterFactory()
  .setCountry(Country.Japan)   // ağırlıklı etnisite → tutarlı ten/saç/sakal
  .setMood(Mood.Happy)
  .buildSvg();
```

Bu tek zincir, Japonya'nın demografik karışımına göre ağırlıklı bir etnisite seçer, birbiriyle uyumlu bir ten rengi ve saç rengi çeker, doğru cinsiyet alt havuzundan bir saç stili seçer ve ardından gözleri/kaşları/ağzı "mutlu" bir kombinasyona kilitler. Sonuç SVG olarak işlenir veya `sharp` kuruluysa herhangi bir boyutta PNG olarak.

Bir karakter sadece bir `CharacterConfig` nesnesidir -- yüz, saç, aksesuarlar, sunum. Builder bunu dahili olarak değiştirir ve sen onu JSON, base64 veya dosya olarak çekip aynı şekilde tekrar yükleyebilirsin. Kurekuta için bu önemlidir: bir kart, işlenmiş görüntüyü değil, yapılandırmayı saklar, böylece sanat her zaman yeniden üretilebilir ve kartın dosya boyutu küçük kalır.

## Rastgele pikseller değil, tutarlı demografiler

DiceBear'ın seçenekleri tek tip seçicilerdir. Ten rengi için `["#ffdbb4", "#2c1b18"]` geçirirsen ikisinden birini eşit olasılıkla alırsın -- bir logo için iyi, "bana Brezilya'dan bir karakter ver" için işe yaramaz.

`character-factory` bir ülke → etnisite → özellik pipeline'ı sunar:

```ts
// Modülün içinde gerçekte olan:
ethnicitiesByCountry[Country.Brazil] = [
  { ethnicity: Ethnicity.WestEuropean,  weight: 35 },
  { ethnicity: Ethnicity.BlackAfrican,  weight: 25 },
  { ethnicity: Ethnicity.Latino,        weight: 30 },
  // ...
];

ETHNICITY_PROFILES[Ethnicity.EastAsian] = {
  skinColors: [
    { color: SkinColor.Light,  weight: 35 },
    { color: SkinColor.Warm,   weight: 40 },
    { color: SkinColor.Medium, weight: 20 },
    // ...
  ],
  hairColors: [/* çoğunlukla siyah/koyu kahve, sarışın yok */],
  hairCuts:   { male: [...], female: [...] },
  beardProbability: 0.15,
};
```

Her katman ağırlıklı bir çekiliştir. Ağırlıklar bir sosyoloji makalesi değil -- "Japonya'dan" bir kızıl saçlı, "İsveç'ten" ise simsiyah saçlı üretmesini engelleyen bir buluşsal yöntem. Tüm pipeline tek bir çağrıya indirgenir: `setCountry(country)` veya `randomizeFromCountry(country, gender?)`.

## Küçük bir genetik motoru

En eğlendiğim özellik: `projectChild`. İki fabrika, özellikleri yaklaşık biyolojik baskınlıkla miras alan bir çocuk üretebilir:

```ts
const parentA = new CharacterFactory().setCountry(Country.Sweden);
const parentB = new CharacterFactory().setCountry(Country.Japan);
const kid     = parentA.projectChild(parentB.getConfig());
```

Perde arkasında kasıtlı olarak küçük bir model var. Her ebeveyn, her iki taraftan çekilen 2-allel bir genotip taşıyor gibi kabul edilir ve baskın veya çekinik olarak birleştirilir:

```ts
function combine(a: Allele, b: Allele): "dominant" | "recessive" {
  return a === "D" || b === "D" ? "dominant" : "recessive";
}
```

Gerçek bir baskınlık ekseni olan özellikler (ten, göz, saç) açık bir sıralı listeye göre çözümlenir -- koyu ten açık ten üzerinde baskın, kahverengi/siyah gözler mavi göz üzerinde baskın, simsiyah saç sarışın üzerinde baskın:

```ts
const HAIR_DOMINANCE_ORDER = [
  HairColor.LightBlonde,   // en çekinik
  HairColor.GoldenBlonde,
  HairColor.HoneyBlonde,
  HairColor.Auburn,
  HairColor.Red,
  HairColor.Copper,
  HairColor.LightBrown,
  HairColor.Brown,
  HairColor.DarkBrown,
  HairColor.SoftBlack,
  HairColor.JetBlack,      // en baskın
] as const;
```

`resolveByRank` her ebeveynin indeksini bulur, "baskın" allel kombinasyonunda yüksek olanı, "çekinik"te ise düşük olanı seçer. Fantazi renkleri (pastel pembe, leylak) sıralamada yoktur -- yazı tura atar gibi %50/%50'ye düşerler, ki bu doğru davranıştır: biyolojik değillerdir, bu yüzden baskınlık bir anlam ifade edemez.

Çiller MC1R'yi modeller: her iki ebeveynde varsa %75, sadece birinde taşınıyorsa %25, hiçbirinde yoksa %0. Sakal SRY bağlantılıdır: çocuk kadınsa kaldırılır, aksi halde sakalı olan ebeveynden miras alınır. Saç stili biyolojik değildir -- kültürel bir seçimdir, bu yüzden çocuk kendi cinsiyet havuzundan seçer, mümkünse doku korunur.

Bunların hiçbiri yayın kalitesinde genetik değil. Bu bir his katmanı: çocuklar, iki yabancının ortalaması alınmış gibi değil, ebeveynlerinin makul bir karışımı gibi görünür.

## Önemli Olan Sıkıcı Mühendislik Kısımları

Gösterişli olmayan ama diff'te yerini hak eden birkaç şey:

**Daha güvenli bir `pick`.** Orijinali, boş bir dizide `undefined`'ı `T` olarak cast edip döndürüyordu. TypeScript'te `strict` + `noUncheckedIndexedAccess` ile bu, derleyicinin onayladığı bir yalan. Yeni sürüm bir `RangeError` fırlatıyor -- üç seviye aşağıda `undefined` prop'lar üretmek yerine çağrı noktasında hemen yakalanıyor.

**Dizileri bozmayan bir `deepMerge`.** Eski özyineleme, kaynak değer bir nesne olduğunda, hedef alan `null` veya bir dizi olsa bile ateşleniyordu. `merge({tags: ["a"]}, {tags: ["b"]})`, `{tags: {0: "b"}}` üretiyordu. Yeni sürüm sadece her iki taraf da düz nesne olduğunda özyineleme yapıyor.

**Paralel toplu işleme.** `batchFactory` eskiden PNG'leri seri bir döngüde render ediyordu -- 1000 kartlık bir dışa aktarma dakikalarca sürüyordu. Artık yapılandırılabilir eşzamanlılığa (varsayılan 4) sahip bir worker havuzu ve sonuçları önceden boyutlandırılmış bir diziye yazarak sırayı koruyor:

```ts
const worker = async () => {
  while (true) {
    const i = nextIndex++;
    if (i >= count) return;
    // render et ve kaydet
    results[i] = { index: i + 1, filePath, config: clone.getConfig() };
    done++;
    onProgress?.(done, count);
  }
};
await Promise.all(Array.from({ length: concurrency }, () => worker()));
```

1000 karakterlik bir dışa aktarmada bu, kahve molasını "çoktan bitti mi?" anına dönüştürdü.

**Bir şey söyleyen `sharp` hata mesajı.** `buildPng`, `sharp`'ı tembelce import eder çünkü bu, sadece SVG kullanan kullanıcılara zorlamak istemediğin akran bağımlılığı gibidir. Eski catch gerçek hatayı yutardı ve her zaman "sharp gerekli" derdi. Gerçek hata bir sürüm uyuşmazlığı veya yerel bağlama sorunuysa, zaten kurulu olan bir şeyi kurmak için on dakika harcardın. Yeni sürüm hala kurmanı söyler, ama altta yatan hatayı da içerir.

## Sırada ne var

Modül [character-factory reposunda](https://github.com/fox3000foxy/character-factory) 1.1.1 sürümünde. Genetik motoru, üzerinde yinelemeye devam etmek için bariz yer -- henüz bir test paketi yok, bu yüzden tutarlı değişmezler ("Brezilyalı bir Doğu Asya eğilimli karakterin hiçbir zaman simsiyah gözlerle platin saçı eşleştirmemesi") sadece ağırlıklar tarafından zorlanıyor. `bun test` veya `vitest` eklemek ve ülke başına on bin `randomizeFromCountry` çağrısı çalıştıran bir tutarlılık testi yazmak bir sonraki adım.

Kurekuta'nın kendisi şimdilik özel, ama sonunda göreceğin her kart bir `CharacterConfig` blob'u ve bir `buildPng()` çağrısı uzaklığında.
