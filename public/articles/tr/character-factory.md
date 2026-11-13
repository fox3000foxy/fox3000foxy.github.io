---
title: "character-factory inşası: genetikli avatarlar"
description: "DiceBear üstüne bir TypeScript modülü: ülke/etnik kökene göre tutarlı
  üretim, çocukları yansıtmak için küçük bir genetik motoru ve onu bir kart
  oyununda kullanılabilir kılan mühendislik detayları."
date: 2026-05-16
aiGenerated: true
tags:
  - typescript
  - npm
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "SsA34uL9BW7RqU6C2EqqKoMxMKnv4Px2+b/LeC+QnrvChDTl1VizfST/eB3h0pZykmQnJpDrsjJG6EWw9qBp5g=="
---

# character-factory inşası: genetik sistemli avatarlar

[Kurekuta](https://github.com/fox3000foxy/kurekuta/) için binlerce inandırıcı ve birbirinden farklı avatara ihtiyacım vardı: her kartın render motorunun portreye dönüştürdüğü bir karakter "DNA"sı içerdiği özel bir kart oyunu projesi. Hazır bir paket alsam sırıtacağı belli olurdu. Karakter başına seed ile DiceBear avatarları üretmek saçmalık veriyordu: Japon evrenli bir kart İskandinav sarışını çıkabiliyor, iki "kardeş" yabancı gibi duruyordu.

O yüzden [character-factory](https://github.com/fox3000foxy/character-factory) yazdım: DiceBearın Lorelei koleksiyonu üstüne, DiceBearın tek başına vermediği üç özelliği getiren bir TypeScript modülü: **tutarlı demografik profiller**, **küçük bir genetik motoru** ve oyun döngüsünden kullanımı keyifli **akıcı bir builder**.

## Ne yapıyor

En küçük faydalı snippet:

```ts
import { CharacterFactory, Country, Mood } from "character-factory";

const svg = new CharacterFactory()
  .setCountry(Country.Japan)   // ağırlıklı etnik köken → tutarlı ten/saç/kesim/sakal
  .setMood(Mood.Happy)
  .buildSvg();
```

Bu basit zincir Japon demografisine göre ağırlıklı bir etnik köken seçer, birbirine uyan bir ten ve saç rengi çeker, doğru cinsiyet alt grubundan bir kesim seçer, sonra göz/kaş/ağzı "mutlu" modda kilitler. Sonuç SVG olarak çıkar ya da `sharp` kuruluysa herhangi bir boyutta PNG olarak.

Bir karakter sadece bir `CharacterConfig` nesnesidir: yüz, saç, aksesuarlar, sunum. Builder onu içten değiştirir ve JSON, base64 ya da dosya olarak dışa aktarıp birebir geri yükleyebilirsin. Kurekuta için bu kritik: bir kart render edilmiş görseli değil, configi saklar. Böylece çizim hep yeniden üretilebilir ve bir kartın boyutu minicik kalır.

## Rastgele piksel değil, tutarlı demografik profiller

DiceBear seçenekleri tekdüze seçicilerdir. Ten rengi için `["#ffdbb4", "#2c1b18"]` geç, ikisinden biri aynı olasılıkla gelir: logo için tamam, "bana Brezilyalı bir karakter ver" için işe yaramaz.

`character-factory` ülke → etnik köken → özellik pipelineı içerir:

```ts
// Modülün içindekiler:
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

Her katman ağırlıklı bir çekiliştir. Ağırlıklar sosyoloji tezi değil: "Japonyalı"nın kızıl, "İsveçli"nin simsiyah üretmesini engelleyen bir sezgiseldir. Bütün pipeline tek bir çağrıya iner: `setCountry(country)` ya da `randomizeFromCountry(country, gender?)`.

## Küçük bir genetik motoru

En çok eğlendiğim fonksiyon: `projectChild`. İki factory, özellikleri yaklaşık biyolojik baskınlıkla kalıtılan bir çocuk üretebilir:

```ts
const parentA = new CharacterFactory().setCountry(Country.Sweden);
const parentB = new CharacterFactory().setCountry(Country.Japan);
const kid     = parentA.projectChild(parentB.getConfig());
```

Kaputun altında bilerek minicik bir model var. Her ebeveyn 2 alelli bir genotip taşır, her taraftan biri çekilir, baskın ya da çekinik olarak birleştirilir:

```ts
function combine(a: Allele, b: Allele): "dominant" | "recessive" {
  return a === "D" || b === "D" ? "dominant" : "recessive";
}
```

Gerçek bir baskınlık ekseni olan özellikler (ten, göz, saç) açık bir sıralı listeyle çözülür: koyu açığa baskındır, kahverengi/siyah gözler maviye baskındır, simsiyah sarışına baskındır:

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

`resolveByRank` her ebeveynin indeksini bulur, "baskın" alel kombinasyonunda en yükseği, "çekinik"te en düşüğü alır. Fantezi renkler (pastel pembe, lila) sıralamada yok: 50/50 yazı tura yaparlar ve bu doğru davranıştır: biyolojik değiller, o yüzden baskınlığın anlamı yok.

Çiller MC1Rı modeller: iki ebeveynde de varsa %75, birinde varsa %25, hiç yoksa %0. Sakal SRYa bağlı: çocuk kızsa alınır, yoksa sakalı olan ebeveynden kalıtılır. Saç kesiminin biyolojik hiçbir yanı yok: kültürel bir seçimdir, o yüzden çocuk kendi cinsiyet havuzundan çeker, mümkünse dokuyu koruyarak.

Bunların hiçbiri yayına değer genetik değil. Bir his katmanı: çocuklar iki yabancının ortalaması değil, ebeveynlerinin makul bir karışımı gibi durur.

## Az gösterişli ama önemli mühendislik kısımları

Görünürlüğü az ama diffte yerini hak eden birkaç detay:

**Daha güvenli bir `pick`.** Orijinal boş dizide `T` olarak cast edilmiş `undefined` döndürüyordu. TypeScriptte `strict` + `noUncheckedIndexedAccess` ile bu derleyicinin imzaladığı bir yalan. Yeni sürüm `RangeError` fırlatır: üç katman aşağıda `undefined` proplar üretmek yerine çağrı yerinde hemen yakalanır.

**Dizileri bozmayan bir `deepMerge`.** Eski özyineleme, hedef `null` ya da dizi olsa bile kaynak değer nesne olduğu anda devreye giriyordu. `merge({tags: ["a"]}, {tags: ["b"]})` sonucu `{tags: {0: "b"}}` üretiyordu. Yeni sürüm yalnızca iki taraf da düz nesneyken özyinelenir.

**Paralel toplu render.** `batchFactory` PNGleri seri döngüde renderlıyordu: 1000 kartlık dışa aktarma saatler sürüyordu. Şimdi yapılandırılabilir eşzamanlılıkla (varsayılan 4) bir worker havuzu ve önceden boyutlandırılmış bir diziye yazarak sonuç sırasını korur:

```ts
const worker = async () => {
  while (true) {
    const i = nextIndex++;
    if (i >= count) return;
    // renderla ve kaydet
    results[i] = { index: i + 1, filePath, config: clone.getConfig() };
    done++;
    onProgress?.(done, count);
  }
};
await Promise.all(Array.from({ length: concurrency }, () => worker()));
```

1000 karakterlik bir dışa aktarmada bu kahve molasını "çoktan bitti mi?"ye dönüştürdü.

**Bir şey söyleyen bir `sharp` hata mesajı.** `buildPng`, SVG-only kullanıcılara dayatmak istemediğin opsiyonel bir bağımlılık olduğu için `sharp`ı tembel içe aktarır. Eski catch gerçek hatayı yutuyor ve hep "sharp is required." diyordu. Gerçek hata bir sürüm çakışması ya da yerel binding sorunuysa, zaten kurulu bir paketi yeniden kurarak on dakika harcıyordun. Yeni sürüm kurmanı yine söyler ama alttaki hatayı da içerir.

## Sıradaki

Modül [character-factory deposunda](https://github.com/fox3000foxy/character-factory) 1.1.1 sürümünde. Genetik motor yinelemeye devam etmek için ideal yer: henüz test paketi yok, o yüzden tutarlılık değişmezleri ("Doğu Asya kökenli Brezilyalı bir karakterde platin saçla simsiyah göz asla olmaz") yalnızca ağırlıklarla sağlanıyor. `bun test` ya da `vitest` ekleyip ülke başına on bin `randomizeFromCountry` çalıştıran bir tutarlılık testi yazmak sonraki adım.

Kurekuta kendisi şimdilik özel ama içinde bir gün göreceğin her kart sadece bir `CharacterConfig` bloğu ve bir `buildPng()` uzağında.
