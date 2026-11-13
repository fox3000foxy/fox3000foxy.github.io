---
title: "Xây dựng character-factory : avatar với di truyền học"
description: "Một module TypeScript trên DiceBear : tạo nhất quán theo
  quốc gia/dân tộc, một động cơ di truyền nhỏ để dự đoán con cái, và
  chi tiết kỹ thuật giúp nó dùng được trong game thẻ bài."
date: 2026-05-16
aiGenerated: true
tags:
  - typescript
  - npm
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "1evlQShzvWpjjOJ/R4T/0SF9z2Y5+4ZGHdDCImL+Ak6Yl0jm395vSTrv0jKGdOH+VVd9Ryp+arO8geJhVm2GIw=="
---

# Xây character-factory : avatar với hệ di truyền

Tôi cần hàng nghìn avatar đáng tin và khác biệt cho [Kurekuta](https://github.com/fox3000foxy/kurekuta/) -- một dự án game thẻ bài riêng, nơi mỗi lá bài chứa một "ADN" nhân vật mà động cơ render biến thành chân dung. Mua một gói làm sẵn, nhìn là biết ngay. Tạo avatar DiceBear theo seed từng nhân vật, cho ra thứ linh tinh : một lá bài bối cảnh Nhật Bản có thể rơi vào cô tóc vàng Scandinavia, và hai "anh chị em" trông như người xa lạ.

Vì vậy tôi viết [character-factory](https://github.com/fox3000foxy/character-factory) -- một module TypeScript trên bộ sưu tập Lorelei của DiceBear mang lại ba tính năng DiceBear đơn lẻ không có : **hồ sơ nhân khẩu nhất quán**, **một động cơ di truyền nhỏ**, và **một builder mượt** dễ dùng từ vòng lặp game.

## Nó làm gì

Snippet nhỏ nhất hữu ích :

```ts
import { CharacterFactory, Country, Mood } from "character-factory";

const svg = new CharacterFactory()
  .setCountry(Country.Japan)   // dân tộc có trọng số → da/tóc/kiểu/râu nhất quán
  .setMood(Mood.Happy)
  .buildSvg();
```

Chuỗi đơn giản này bốc một dân tộc có trọng số theo nhân khẩu Nhật Bản, rút màu da và màu tóc hợp nhau, chọn kiểu tóc trong đúng nhóm giới tính, rồi khóa mắt/lông mày/miệng ở chế độ "vui". Kết quả ra SVG hoặc, khi đã cài `sharp`, ra PNG ở bất kỳ kích thước nào.

Một nhân vật chỉ là một object `CharacterConfig` -- khuôn mặt, tóc, phụ kiện, trình bày. Builder sửa nó bên trong, và bạn có thể xuất ra JSON, base64 hoặc tệp, rồi tải lại giống hệt. Với Kurekuta điều này then chốt : một lá bài lưu config, không lưu ảnh đã render. Nhờ vậy art luôn tái tạo được và kích thước mỗi lá bài vẫn tí hon.

## Hồ sơ nhân khẩu nhất quán, không phải điểm ảnh ngẫu nhiên

Các tùy chọn DiceBear là bộ chọn đều. Truyền `["#ffdbb4", "#2c1b18"]` cho màu da và bạn sẽ nhận cái này hoặc cái kia với cùng xác suất -- ổn cho logo, vô dụng cho "cho tôi một nhân vật từ Brazil."

`character-factory` mang một pipeline quốc gia → dân tộc → đặc điểm :

```ts
// Những gì có trong module :
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
  hairColors: [/* chủ yếu đen/nâu đậm, không tóc vàng */],
  hairCuts:   { male: [...], female: [...] },
  beardProbability: 0.15,
};
```

Mỗi lớp là một lần rút có trọng số. Các trọng số không phải luận án xã hội học -- đó là heuristic ngăn "đến từ Nhật Bản" sinh ra tóc đỏ và "đến từ Thụy Điển" sinh ra tóc đen tuyền. Toàn bộ pipeline gói trong một gọi duy nhất : `setCountry(country)` hoặc `randomizeFromCountry(country, gender?)`.

## Một động cơ di truyền nhỏ

Hàm tôi chơi vui nhất : `projectChild`. Hai factory có thể sinh một đứa con mà đặc điểm được thừa hưởng với tính trội sinh học gần đúng :

```ts
const parentA = new CharacterFactory().setCountry(Country.Sweden);
const parentB = new CharacterFactory().setCountry(Country.Japan);
const kid     = parentA.projectChild(parentB.getConfig());
```

Bên dưới, đó là một mô hình cố ý tí hon. Mỗi bố mẹ mang một kiểu gen 2 alen, một rút từ mỗi bên, kết hợp thành trội hoặc lặn :

```ts
function combine(a: Allele, b: Allele): "dominant" | "recessive" {
  return a === "D" || b === "D" ? "dominant" : "recessive";
}
```

Các đặc điểm có trục trội thật (da, mắt, tóc) được giải bằng danh sách thứ tự rõ ràng -- tối trội hơn sáng, mắt nâu/đen trội hơn xanh, đen tuyền trội hơn vàng hoe :

```ts
const HAIR_DOMINANCE_ORDER = [
  HairColor.LightBlonde,   // lặn nhất
  HairColor.GoldenBlonde,
  HairColor.HoneyBlonde,
  HairColor.Auburn,
  HairColor.Red,
  HairColor.Copper,
  HairColor.LightBrown,
  HairColor.Brown,
  HairColor.DarkBrown,
  HairColor.SoftBlack,
  HairColor.JetBlack,      // trội nhất
] as const;
```

`resolveByRank` tìm index của mỗi bố mẹ, lấy index cao hơn trên tổ hợp alen "trội" và thấp hơn trên "lặn". Màu fantasy (hồng pastel, tử đinh hương) không nằm trong thứ tự -- chúng tung đồng xu 50/50, đó là hành vi đúng : chúng không sinh học, nên tính trội vô nghĩa.

Tàn nhang mô hình hóa MC1R : 75% nếu cả hai bố mẹ đều có, 25% nếu chỉ một bên mang, 0% nếu không ai có. Râu gắn với SRY : bỏ nếu con là nữ, ngược lại thừa hưởng từ bên bố mẹ có râu. Kiểu tóc không có gì sinh học -- đó là lựa chọn văn hóa, nên đứa con bốc từ pool giới tính của chính nó, giữ lại chất tóc nếu có thể.

Không gì trong số này là di truyền đáng đăng báo. Đó là một lớp cảm nhận : lũ trẻ trông như hỗn hợp hợp lý của bố mẹ chúng, không phải trung bình của hai người xa lạ.

## Những phần kỹ thuật kém hào nhoáng nhưng đáng giá

Vài chi tiết ít thấy nhưng xứng đáng có chỗ trong diff :

**Một `pick` an toàn hơn.** Bản gốc trả về `undefined` ép thành `T` trên mảng rỗng. Với `strict` + `noUncheckedIndexedAccess` trong TypeScript, đó là lời nói dối mà trình biên dịch ký tên. Phiên bản mới ném `RangeError` -- bắt ngay tại chỗ gọi thay vì sinh prop `undefined` ba tầng sâu hơn.

**Một `deepMerge` không làm hỏng mảng.** Đệ quy cũ kích hoạt hễ giá trị nguồn là object, dù đích là `null` hay mảng. `merge({tags: ["a"]}, {tags: ["b"]})` sinh ra `{tags: {0: "b"}}`. Phiên bản mới chỉ đệ quy khi cả hai bên đều là object thuần.

**Render batch song song.** `batchFactory` render PNG trong vòng lặp nối tiếp -- xuất 1000 lá bài mất cả buổi. Giờ đây là pool worker với đồng thời cấu hình được (mặc định 4), giữ thứ tự kết quả bằng cách ghi vào mảng định kích thước trước :

```ts
const worker = async () => {
  while (true) {
    const i = nextIndex++;
    if (i >= count) return;
    // render and save
    results[i] = { index: i + 1, filePath, config: clone.getConfig() };
    done++;
    onProgress?.(done, count);
  }
};
await Promise.all(Array.from({ length: concurrency }, () => worker()));
```

Trên một lần xuất 1000 nhân vật, việc đó biến giờ nghỉ cà phê thành "xong rồi á?"

**Một thông báo lỗi `sharp` nói được điều gì.** `buildPng` import `sharp` lười vì đó là phụ thuộc tùy chọn mà bạn không muốn áp lên người dùng chỉ cần SVG. Catch cũ nuốt lỗi thật và luôn nói "sharp is required." Nếu lỗi thực là xung đột phiên bản hay vấn đề binding native, bạn mất mười phút cài lại một gói đã cài rồi. Phiên bản mới vẫn bảo bạn cài nó, nhưng kèm lỗi gốc bên trong.

## Tiếp theo

Module đang ở 1.1.1 trên [repo character-factory](https://github.com/fox3000foxy/character-factory). Động cơ di truyền là nơi lý tưởng để tiếp tục lặp -- chưa có suite test nào, nên các bất biến nhất quán ("một nhân vật Brazil gốc Đông Á sẽ không bao giờ có mắt đen tuyền với tóc bạch kim") mới chỉ được đảm bảo bởi trọng số. Thêm `bun test` hoặc `vitest` và viết một test nhất quán chạy mười nghìn `randomizeFromCountry` cho mỗi quốc gia, đó là bước tiếp theo.

Bản thân Kurekuta hiện vẫn riêng tư, nhưng mỗi lá bài bạn một ngày nào đó thấy trong đó chỉ là một blob `CharacterConfig` và một `buildPng()` chờ tồn tại.
