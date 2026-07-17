---
title: "character-factory 만들기: 유전학을 가진 아바타"
description: "DiceBear 기반 TypeScript 모듈: 국가/민족별 일관된 생성, 자식 투영을 위한 작은 유전학 엔진, 카드
  게임에서 사용할 수 있게 만든 엔지니어링 세부사항"
date: 2026-05-16
aiGenerated: true
authors:
  - fox3000foxy
tags:
  - typescript
  - npm
  - open-source
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "1oJ8EQI4y5V9Tu3tTbUs2P4hvYmGu4o/xx9xxlsWOpVUlbHPlq82J5y1wMXoCYdCQuUKQhxL5I7VT3qtcYwHFg=="
---

# character-factory 만들기: 유전학을 가진 아바타

[Kurekuta](https://github.com/fox3000foxy/kurekuta/)를 위해 수천 개의 그럴듯하고 구별되는 아바타가 필요했어 -- 모든 카드가 캐릭터 "DNA"를 가지고 있고 렌더러가 그걸 초상화로 바꿔주는 개인 카드 게임 프로젝트야. 스톡 팩을 사면 평범해 보였을 거야. 시드별로 일회성 DiceBear 아바타를 생성하는 건 잘못된 방식으로 랜덤하다고 느껴졌어: 일본풍 카드가 스칸디나비아 금발이 나올 수 있고, 두 "형제자매"가 전혀 낯선 사람처럼 보였거든.

그래서 [character-factory](https://github.com/fox3000foxy/character-factory)를 만들었어 -- DiceBear의 Lorelei 컬렉션 위에 TypeScript 모듈로, DiceBear만으로는 안 되는 세 가지를 추가했어: **일관된 인구통계**, **작은 유전학 엔진**, 그리고 게임 루프에서 사용하기 좋은 **fluent builder**.

## 하는 일

가장 작은 유용한 코드 조각:

```ts
import { CharacterFactory, Country, Mood } from "character-factory";

const svg = new CharacterFactory()
  .setCountry(Country.Japan)   // 가중치 기반 민족 → 일관된 피부/머리/컷/수염
  .setMood(Mood.Happy)
  .buildSvg();
```

저 단일 체인은 일본의 인구 구성을 반영한 민족을 선택하고, 어울리는 피부톤과 머리색을 뽑고, 올바른 성별 하위 풀에서 헤어스타일을 고른 다음, 눈/눈썹/입을 "행복한" 조합으로 고정해. 결과는 SVG로 렌더링되거나, `sharp`가 설치되어 있으면 원하는 크기의 PNG로 렌더링돼.

캐릭터는 그냥 `CharacterConfig` 객체야 -- 얼굴, 머리, 액세서리, 프레젠테이션. 빌더가 내부에서 하나를 변형하고, JSON, base64, 파일로 꺼내거나 같은 방식으로 다시 불러올 수 있어. Kurekuta에서 이게 중요한 이유: 카드는 렌더링된 이미지가 아니라 설정을 저장하므로, 아트는 항상 재현 가능하고 카드 파일 크기는 아주 작게 유지돼.

## 일관된 인구통계, 단순한 랜덤 픽셀이 아님

DiceBear의 옵션은 균일한 선택기야. `["#ffdbb4", "#2c1b18"]`를 피부색으로 넘기면 둘 중 하나가 동일한 확률로 나와 -- 로고에는 괜찮지만 "브라질 출신 캐릭터를 줘"에는 쓸모없어.

`character-factory`는 국가 → 민족 → 특성 파이프라인을 제공해:

```ts
// 모듈 안의 실제 내용:
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
  hairColors: [/* mostly black/dark brown, no blonde */],
  hairCuts:   { male: [...], female: [...] },
  beardProbability: 0.15,
};
```

각 레이어는 가중치 기반 선택이야. 가중치는 사회학 논문이 아니야 -- "일본에서"가 빨간 머리를 만들지 않고 "스웨덴에서"가 새까만 머리를 만들지 않게 하는 휴리스틱일 뿐이야. 전체 파이프라인은 한 번의 호출로 줄어들어: `setCountry(country)` 또는 `randomizeFromCountry(country, gender?)`.

## 작은 유전학 엔진

내가 가장 재미있게 만든 기능: `projectChild`. 두 팩토리가 아이를 만들 수 있고, 그 아이의 특성은 대략적인 생물학적 우성으로 유전돼:

```ts
const parentA = new CharacterFactory().setCountry(Country.Sweden);
const parentB = new CharacterFactory().setCountry(Country.Japan);
const kid     = parentA.projectChild(parentB.getConfig());
```

내부는 의도적으로 아주 작은 모델이야. 각 부모는 2-대립유전자 유전자형을 가진 것으로 처리되고, 각 부모에게서 하나씩 뽑아 우성 또는 열성으로 결합해:

```ts
function combine(a: Allele, b: Allele): "dominant" | "recessive" {
  return a === "D" || b === "D" ? "dominant" : "recessive";
}
```

실제 우성 축이 있는 특성(피부, 눈, 머리)은 명시적인 순서 목록에 따라 해결돼 -- 더 어두운 것이 밝은 것보다 우성, 갈색/검은 눈이 파란 눈보다 우성, 새까만 머리가 금발보다 우성:

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

`resolveByRank`는 각 부모의 인덱스를 찾아, "우성" 대립유전자 조합에서는 더 높은 인덱스를 선택하고 "열성"에서는 더 낮은 인덱스를 선택해. 판타지 색상(파스텔 핑크, 라일락)은 순서에 없어 -- 50/50 동전 던지기로 폴백되는데, 이게 올바른 동작이야: 생물학적이지 않으니까 우성이 의미가 없거든.

주근깨는 MC1R을 모델링해: 양쪽 부모가 있으면 75%, 한쪽만 가지고 있으면 25%, 아무도 없으면 0%. 수염은 SRY 연결: 아이가 여성이면 제거되고, 그렇지 않으면 수염이 있는 부모에게서 상속받아. 헤어스타일은 생물학적이지 않아 -- 문화적 선택이니까, 아이는 자신의 성별 풀에서 고르고 가능하면 질감을 유지해.

이 중 어느 것도 출판할 수준의 유전학은 아니야. 그냥 느낌 레이어야: 아이들이 평균낸 두 낯선 사람처럼 보이기보다는 부모의 그럴듯한 혼합처럼 보이게 하는 거야.

## 중요했던 지루한 엔지니어링 부분

화려하지는 않지만 diff에서 자리를 차지한 몇 가지:

**더 안전한 `pick`.** 원래는 빈 배열에서 `undefined`를 `T`로 캐스팅해서 반환했어. TypeScript에서 `strict` + `noUncheckedIndexedAccess`를 사용하면, 컴파일러가 승인하는 거짓말이지. 새 버전은 `RangeError`를 던져 -- 3단계 아래에서 `undefined` prop이 생기는 대신 호출 지점에서 즉시 잡혀.

**배열을 망가뜨리지 않는 `deepMerge`.** 예전 재귀는 대상 값이 객체일 때마다 발동했는데, 대상 슬롯이 `null`이거나 배열이어도 마찬가지였어. `merge({tags: ["a"]}, {tags: ["b"]})`가 `{tags: {0: "b"}}`를 만들어냈어. 새 버전은 양쪽이 모두 일반 객체일 때만 재귀해.

**병렬 배치 렌더링.** `batchFactory`가 PNG를 직렬 루프로 렌더링하곤 했어 -- 1000장 카드 내보내기에 몇 분이 걸렸지. 이제는 설정 가능한 동시성(기본 4)의 워커 풀이고, 미리 크기가 지정된 배열에 써서 결과 순서를 유지해:

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

1000개 캐릭터 내보내기에서 커피 한 잔 마실 시간이 "벌써 끝났어?"로 바뀌었어.

**뭔가 말해주는 `sharp` 에러 메시지.** `buildPng`는 `sharp`를 lazy-import하는데, SVG-only 사용자에게 강제하고 싶지 않은 peer-ish 의존성이기 때문이야. 예전 catch는 실제 에러를 삼키고 항상 "sharp is required."라고 말했어. 실제 실패가 버전 불일치나 네이티브 바인딩 문제였다면, 이미 설치된 걸 다시 설치하는 데 10분을 허비했겠지. 새 버전은 여전히 설치하라고 말하지만, 기본 에러도 포함시켜.

## 다음은 무엇인가

모듈은 현재 [character-factory 저장소](https://github.com/fox3000foxy/character-factory)에서 1.1.1 버전이야. 유전학 엔진이 계속 반복할 분명한 장소야 -- 아직 테스트 스위트가 없어서, 일관성 불변식("브라질 동아시아-중심 캐릭터가 절대 새까만 눈과 백금발을 가지면 안 됨")은 가중치로만 강제되고 있어. `bun test`나 `vitest`를 추가하고 국가별로 `randomizeFromCountry`를 만 번 실행하는 일관성 테스트를 작성하는 게 다음 단계야.

Kurekuta 자체는 지금은 비공개지만, 언젠가 보게 될 모든 카드는 `CharacterConfig` blob 하나와 `buildPng()` 호출 하나만 있으면 존재할 수 있어.
