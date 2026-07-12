---
itle: "Xây dựng character-factory: avatar với hệ thống di truyền"
description: "Một module TypeScript xây trên DiceBear: tạo nhất quán theo quốc gia/sắc tộc,
  một engine di truyền nhỏ để mô phỏng con cái, và các chi tiết kỹ thuật giúp nó
  dùng được trong một game bài."
date: 2026-05-16
aiGenerated: trueauthors:
  - fox3000foxy
tags:
  - typescript
  - npm
  - open-source
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "YIciDaM04UPlUKWmbDdJqNjOBuPA4VCtIQOr2hOgUDBzSDWgIuAAxOAgGW+9QFrCr/hxESOyEk+3F/888hvc3w=="
---

# Xây dựng character-factory: avatar với hệ thống di truyền

Tôi cần hàng ngàn avatar đáng tin và riêng biệt cho [Kurekuta](https://github.com/fox3000foxy/kurekuta/) -- một dự án game bài cá nhân nơi mỗi lá bài chứa một "ADN" nhân vật mà engine render biến thành chân dung. Mua một gói có sẵn thì sẽ bị phát hiện ngay. Tạo avatar DiceBear theo seed từng nhân vật thì ra toàn thứ vớ vẩn: một lá bài theo chủ đề Nhật Bản có thể ra một cô gái tóc vàng Bắc Âu, và hai "anh chị em" trông chẳng giống nhau.

Vì thế tôi viết [character-factory](https://github.com/fox3000foxy/character-factory) -- một module TypeScript xây trên bộ Lorelei của DiceBear, bổ sung ba thứ mà DiceBear đơn lẻ không có: **hồ sơ nhân khẩu nhất quán**, **một engine di truyền nhỏ**, và **một builder mượt** dễ dùng từ vòng lặp game.

## Nó làm gì

Đoạn code ngắn nhất có ích:

```ts
import { CharacterFactory, Country, Mood } from "character-factory";

const svg = new CharacterFactory()
  .setCountry(Country.Japan)   // dân tộc có trọng số → da/tóc/kiểu tóc/râu nhất quán
  .setMood(Mood.Happy)
  .buildSvg();
```

Chuỗi đơn giản này chọn một dân tộc theo trọng số nhân khẩu Nhật Bản, chọn màu da và màu tóc hợp nhau, chọn kiểu tóc trong phân nhóm giới tính phù hợp, rồi khóa mắt/lông mày/miệng ở chế độ "vui vẻ". Kết quả xuất ra SVG hoặc, nếu cài `sharp`, ra PNG ở bất kỳ kích thước nào.

Một nhân vật chỉ là một object `CharacterConfig` -- khuôn mặt, tóc, phụ kiện, cách trình bày. Builder sửa nó nội bộ, và bạn có thể xuất nó ra JSON, base64 hoặc file, rồi nạp lại y hệt. Với Kurekuta điều này rất quan trọng: một lá bài lưu config, không phải ảnh đã render. Nhờ đó hình ảnh luôn tái tạo được và kích thước lá bài vẫn rất nhỏ.

## Hồ sơ nhân khẩu nhất quán, không phải pixel ngẫu nhiên

Các tùy chọn của DiceBear là bộ chọn đồng đều. Truyền `["#ffdbb4", "#2c1b18"]` cho màu da và bạn sẽ nhận được cái này hay cái kia với xác suất như nhau -- OK cho logo, vô dụng cho "hãy cho tôi một nhân vật từ Brazil."

`character-factory` có một pipeline quốc gia → sắc tộc → đặc điểm:

```ts
// Nội dung bên trong module:
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
  hairColors: [/* chủ yếu đen/nâu sẫm, không có vàng */],
  hairCuts:   { male: [...], female: [...] },
  beardProbability: 0.15,
};
```

Mỗi tầng là một lần rút có trọng số. Các trọng số không phải là luận văn xã hội học -- đó là heuristic ngăn "đến từ Nhật Bản" sinh ra tóc đỏ và "đến từ Thụy Điển" sinh ra tóc đen tuyền. Toàn bộ pipeline chỉ gói gọn trong một lần gọi: `setCountry(country)` hoặc `randomizeFromCountry(country, gender?)`.

## Một engine di truyền nhỏ

Chức năng tôi thích nhất: `projectChild`. Hai factory có thể sinh ra một đứa con có các đặc điểm thừa hưởng với tính trội sinh học gần đúng:

```ts
const parentA = new CharacterFactory().setCountry(Country.Sweden);
const parentB = new CharacterFactory().setCountry(Country.Japan);
const kid     = parentA.projectChild(parentB.getConfig());
```

Bên dưới, đó là một mô hình cố tình rất nhỏ. Mỗi cha mẹ mang kiểu gen 2 alen, một từ mỗi bên, kết hợp thành trội hoặc lặn:

```ts
function combine(a: Allele, b: Allele): "dominant" | "recessive" {
  return a === "D" || b === "D" ? "dominant" : "recessive";
}
```

Các đặc điểm có trục trội thực sự (da, mắt, tóc) được giải quyết bằng một danh sách thứ tự rõ ràng -- tối trội sáng, mắt nâu/đen trội xanh, đen tuyền trội vàng:

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

`resolveByRank` tìm chỉ số của mỗi cha mẹ, lấy chỉ số cao nhất trên tổ hợp alen "trội" và thấp nhất trên "lặn". Các màu tóc giả tưởng (hồng pastel, tím hoa cà) không nằm trong thứ tự -- chúng random 50/50, đó là hành vi đúng: chúng không mang tính sinh học, nên trội/lặn vô nghĩa.

Tàn nhang mô phỏng MC1R: 75% nếu cả cha và mẹ đều có, 25% nếu chỉ một người mang, 0% nếu không ai có. Râu liên kết với SRY: bỏ nếu đứa trẻ là nữ, nếu không thì thừa hưởng từ cha/mẹ có râu. Kiểu tóc không liên quan gì đến sinh học -- đó là lựa chọn văn hóa, nên đứa trẻ chọn từ pool giới tính của chính nó, giữ kết cấu nếu có thể.

Không thứ nào trong số này là di truyền đáng để công bố. Đó là một tầng cảm giác: đứa trẻ trông giống sự pha trộn hợp lý của cha mẹ, chứ không phải trung bình của hai người lạ.

## Những phần kỹ thuật kém hào nhoáng nhưng quan trọng

Vài thứ không hào nhoáng nhưng xứng đáng có mặt trong diff:

**Một `pick` an toàn hơn.** Bản gốc trả về `undefined` cast thành `T` trên mảng rỗng. Với `strict` + `noUncheckedIndexedAccess` trong TypeScript, đó là lời nói dối mà compiler ký vào. Phiên bản mới ném `RangeError` -- bắt ngay tại điểm gọi thay vì sinh ra các prop `undefined` ở ba tầng sâu hơn.

**Một `deepMerge` không làm hỏng mảng.** Đệ quy cũ kích hoạt ngay khi giá trị nguồn là object, kể cả khi đích là `null` hay một mảng. `merge({tags: ["a"]}, {tags: ["b"]})` cho ra `{tags: {0: "b"}}`. Phiên bản mới chỉ đệ quy khi cả hai vế đều là object thường.

**Render batch song song.** `batchFactory` render PNG theo vòng lặp tuần tự -- xuất 1000 lá bài mất cả thế kỷ. Giờ nó là một pool worker với độ đồng thời có thể cấu hình (mặc định 4), giữ thứ tự kết quả bằng cách ghi vào một mảng được cấp phát trước:

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

Khi xuất 1000 nhân vật, nó biến một khoảng nghỉ giải lao thành "xong rồi à?"

**Thông báo lỗi `sharp` có ý nghĩa.** `buildPng` import `sharp` dạng lazy vì nó là dependency tùy chọn mà bạn không muốn áp đặt lên người dùng SVG-only. Catch cũ nuốt mất lỗi thật và luôn báo "sharp is required." Nếu lỗi thực sự là xung đột phiên bản hoặc vấn đề bindings native, bạn mất mười phút cài lại thứ đã cài. Phiên bản mới vẫn bảo bạn cài nó, nhưng kèm lỗi gốc bên dưới.

## Tiếp theo

Module đang ở phiên bản 1.1.1 trên [kho character-factory](https://github.com/fox3000foxy/character-factory). Engine di truyền là nơi lý tưởng để tiếp tục cải tiến -- chưa có bộ kiểm thử nào, nên các bất biến nhất quán ("một nhân vật Brazil gốc Đông Á sẽ không bao giờ có mắt đen tuyền với tóc bạch kim") chỉ được đảm bảo bởi các trọng số. Thêm `bun test` hoặc `vitest` và viết một kiểm thử nhất quán chạy mười ngàn lần `randomizeFromCountry` mỗi quốc gia là bước tiếp theo.

Kurekuta hiện vẫn là dự án riêng, nhưng mỗi lá bài bạn sẽ thấy trong đó chẳng qua là một blob `CharacterConfig` và một `buildPng()` để tồn tại.
