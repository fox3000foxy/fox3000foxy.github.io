---
title: "character-factory 만들기: 유전자가 있는 아바타"
description: "DiceBear 위의 TypeScript 모듈. 국가와 민족별로 일관된 생성, 아이를 투영하는 작은 유전 엔진, 그리고 카드 게임에서 쓸 수 있게 만든 엔지니어링 세부 사항."
date: 2026-05-16
aiGenerated: true
tags:
  - typescript
  - npm
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "fHebzHOZt1jb8lAF2sXozR4e7xk6rvwo4MhP6vD/l5zFhJWq2Zw46XrhU8TdkmSN6YyXwpH/O2+I2JKXc2xdAg=="
---

# character-factory 만들기: 유전 시스템이 있는 아바타

[Kurekuta](https://github.com/fox3000foxy/kurekuta/)에 쓸 믿을 만하고 서로 다른 수천 개의 아바타가 필요했어요. 각 카드가 캐릭터 "DNA"를 담고 있고 렌더링 엔진이 이를 초상화로 바꾸는 비공개 카드 게임 프로젝트예요. 기성 팩을 사는 것은 티가 날 것 같았어요. 캐릭터별 시드로 DiceBear 아바타를 생성하면 엉망이 됐어요. 일본 세계관 카드에서 스칸디나비아 금발이 나오고, "남매" 둘이 낯선 사람처럼 생겼어요.

그래서 [character-factory](https://github.com/fox3000foxy/character-factory)를 썼어요. DiceBear의 Lorelei 컬렉션 위에 올린 TypeScript 모듈로, DiceBear만으로는 얻을 수 없는 세 가지 기능을 더해요. **일관된 인구통계 프로필**과 **작은 유전 엔진**, 그리고 게임 루프에서 쓰기 편한 **유창한 빌더**예요.

## 하는 일

가장 작은 유용한 스니펫이에요.

```ts
import { CharacterFactory, Country, Mood } from "character-factory";

const svg = new CharacterFactory()
  .setCountry(Country.Japan)   // 가중 민족 → 일관된 피부/머리/컷/수염
  .setMood(Mood.Happy)
  .buildSvg();
```

이 간단한 체인은 일본 인구통계로 가중한 민족을 뽑고, 어울리는 피부색과 머리색을 뽑고, 올바른 성별 하위 그룹에서 머리 모양을 고른 뒤, 눈과 눈썹, 입을 "행복" 모드로 고정해요. 결과는 SVG로 나오고, `sharp`이 설치되어 있으면 원하는 크기의 PNG로도 나와요.

캐릭터는 그저 `CharacterConfig` 객체예요. 얼굴, 머리, 액세서리, 표현이죠. 빌더가 내부에서 수정하고, JSON이나 base64, 파일로 내보냈다가 똑같이 다시 불러올 수 있어요. Kurekuta에는 이것이 중요해요. 카드에는 렌더링된 이미지가 아니라 설정이 저장되거든요. 그래서 아트는 항상 재현 가능하고 카드 크기는 아주 작게 유지돼요.

## 무작위 픽셀이 아닌, 일관된 인구통계 프로필

DiceBear 옵션은 균등 선택기예요. 피부색에 `["#ffdbb4", "#2c1b18"]`를 넘기면 둘 중 하나가 같은 확률로 나와요. 로고에는 괜찮지만 "브라질 사람 캐릭터를 줘" 같은 요청에는 쓸모없어요.

`character-factory`는 국가에서 민족으로, 민족에서 특성으로 이어지는 파이프라인을 내장하고 있어요.

```ts
// 모듈 안에 있는 내용:
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
  hairColors: [/* 주로 검정/짙은 갈색, 금발 없음 */],
  hairCuts:   { male: [...], female: [...] },
  beardProbability: 0.15,
};
```

각 층은 가중 추첨이에요. 가중치가 사회학 논문은 아니고, "일본 출신"이 빨간 머리로 나오거나 "스웨덴 출신"이 새까만 머리로 나오는 것을 막는 휴리스틱이에요. 파이프라인 전체는 `setCountry(country)`나 `randomizeFromCountry(country, gender?)` 한 번 호출로 요약돼요.

## 작은 유전 엔진

제가 가장 재미있게 만든 기능이에요. `projectChild`예요. 두 팩토리가 대략적인 생물학적 우성을 따라 특성을 물려받은 아이를 만들 수 있어요.

```ts
const parentA = new CharacterFactory().setCountry(Country.Sweden);
const parentB = new CharacterFactory().setCountry(Country.Japan);
const kid     = parentA.projectChild(parentB.getConfig());
```

내부적으로는 일부러 아주 작게 만든 모델이에요. 각 부모는 2개의 대립유전자로 된 유전자형을 지니고, 양쪽에서 하나씩 뽑아 우성이나 열성으로 조합해요.

```ts
function combine(a: Allele, b: Allele): "dominant" | "recessive" {
  return a === "D" || b === "D" ? "dominant" : "recessive";
}
```

진짜 우성 축이 있는 특성(피부, 눈, 머리)은 명시적인 순서 목록으로 풀어요. 짙은 색이 옅은 색을 누르고, 갈색과 검은 눈이 파란 눈을 누르고, 새까만 머리가 금발을 눌러요.

```ts
const HAIR_DOMINANCE_ORDER = [
  HairColor.LightBlonde,   // 가장 열성
  HairColor.GoldenBlonde,
  HairColor.HoneyBlonde,
  HairColor.Auburn,
  HairColor.Red,
  HairColor.Copper,
  HairColor.LightBrown,
  HairColor.Brown,
  HairColor.DarkBrown,
  HairColor.SoftBlack,
  HairColor.JetBlack,      // 가장 우성
] as const;
```

`resolveByRank`는 각 부모의 인덱스를 찾아서, 대립유전자 조합이 "우성"이면 더 높은 쪽을, "열성"이면 더 낮은 쪽을 가져와요. 판타지 색(파스텔 분홍, 라일락)은 순서에 없어요. 50대 50 동전 던지기를 하는데, 이것이 올바른 동작이에요. 생물학적이지 않으니 우성이 의미가 없거든요.

주근깨는 MC1R을 모델링해요. 부모 둘 다 있으면 75퍼센트, 한쪽만 있으면 25퍼센트, 없으면 0퍼센트예요. 수염은 SRY와 연결돼요. 아이가 여자면 제거하고, 아니면 수염이 있던 부모에게서 물려받아요. 머리 모양은 생물학과 무관해요. 문화적 선택이라서 아이는 자신의 성별 풀에서 뽑되, 가능하면 질감을 유지해요.

이 중 어느 것도 논문에 낼 유전학은 아니에요. 느낌의 층이에요. 아이들이 낯선 둘의 평균이 아니라 부모를 그럴듯하게 섞은 모습으로 나와요.

## 덜 화려하지만 중요했던 엔지니어링 부분

눈에 잘 띄지 않지만 diff에 들어갈 가치가 있던 세부 사항 몇 가지예요.

**더 안전한 `pick`.** 원래 함수는 빈 배열에 `undefined`를 `T`로 캐스팅해서 돌려줬어요. TypeScript의 `strict`와 `noUncheckedIndexedAccess`에서는 컴파일러가 서명하는 거짓말이에요. 새 버전은 `RangeError`를 던져요. 세 단계 아래에서 `undefined` props를 만드는 대신 호출 지점에서 바로 잡혀요.

**배열을 망가뜨리지 않는 `deepMerge`.** 예전 재귀는 소스 값이 객체이기만 하면 대상이 `null`이나 배열이어도 발동했어요. `merge({tags: ["a"]}, {tags: ["b"]})`가 `{tags: {0: "b"}}`를 만들었어요. 새 버전은 양쪽이 모두 일반 객체일 때만 재귀해요.

**병렬 배치 렌더링.** `batchFactory`는 PNG를 직렬 루프로 렌더링했어요. 1000장 카드 내보내기에 한참 걸렸어요. 이제는 설정 가능한 동시성(기본값 4)의 워커 풀로, 미리 크기를 잡은 배열에 쓰면서 결과 순서를 유지해요.

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

1000개 캐릭터 내보내기에서 커피 한 잔 마실 시간이 "벌써 끝났다고?"로 바뀌었어요.

**제대로 말해 주는 `sharp` 오류 메시지.** `buildPng`는 SVG 전용 사용자에게 강요하고 싶지 않은 선택적 의존성이라 `sharp`을 느리게 import해요. 예전 catch는 진짜 오류를 삼키고 항상 "sharp is required."라고 말했어요. 실제 실패가 버전 충돌이나 네이티브 바인딩 문제면, 이미 설치된 패키지를 다시 설치하면서 10분을 날렸어요. 새 버전은 설치하라고 말하면서도 근본 오류를 함께 보여줘요.

## 다음 단계

모듈은 [character-factory 저장소](https://github.com/fox3000foxy/character-factory)에서 1.1.1 버전이에요. 유전 엔진이 계속 다듬기 좋은 지점이에요. 아직 테스트 모음이 없어서, 일관성 불변식("동아시아 조상의 브라질 캐릭터는 절대 새까만 눈에 백금발이 되지 않는다")은 가중치로만 보장돼요. `bun test`나 `vitest`를 추가하고 국가별로 만 번씩 `randomizeFromCountry`를 돌리는 일관성 테스트를 쓰는 것이 다음 단계예요.

Kurekuta 자체는 아직 비공개지만, 언젠가 보게 될 모든 카드는 그저 `CharacterConfig` blob 하나와 `buildPng()` 한 번 거리에 있어요.
