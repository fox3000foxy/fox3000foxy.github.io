---
title: "Laupok이 혼자 Super Mario World를 하는 AI를 만들었어요. 어떻게 동작하나요"
description: ""
date: 2026-07-11
tags:
  - ai
  - lua
  - emulation
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "Xy88jnpSG4ZcE/FuqO7tj2TvHYuo8o6E3dcyrLO1VswOwMsPl5PAtu+KJ3IlFCXZvcUwLggcKL3ivbqLSwdIfA=="
---

# Laupok이 혼자 Super Mario World를 하는 AI를 만들었어요. 어떻게 동작하나요

Laupok이 **Super Mario World**를 완전히 자율로 플레이하는 인공지능을 만들었어요. 0에서 출발해요. 미리 정해진 스크립트도 녹화된 프레임도 없어요. AI는 무작위 변이와 자연 선택으로 레벨을 끝내는 법을 혼자 배워요. 프로젝트는 멀티플랫폼 에뮬레이터 **BizHawk** 위에서 약 **4200줄** Lua 스크립트로 돌아요.

이 프로젝트를 매혹적으로 만드는 것은 생물학 개념을 컴퓨터에 적용했다는 거예요. Darwin의 **진화론**과 **인공 신경망**, 그리고 NEAT(NeuroEvolution of Augmenting Topologies)라는 특정 알고리즘이요. AI는 처음에 게임에 대해 아무것도 몰라요. 무작위로 행동을 테스트하고 수천 번 실패하고, 조금씩 앞으로 가고 점프하고 살아남는 법을 이해해요.

이 글에서는 그 모든 것을 뜯어봐요. 개념별로, 코드 줄별로.

![카메라 앞에서 NEAT 알고리즘을 소개하는 Laupok](/images/laupok-mario-ai/neat-title.jpg)

---

## 설정: BizHawk, Lua, Super Mario World

### BizHawk 에뮬레이터

BizHawk는 여러 콘솔을 지원하는 오픈 소스 에뮬레이터예요. NES, SNES, Genesis, PS1, Game Boy 등등. 특징은 게임과 나란히 **Lua 스크립트**를 실행할 수 있다는 거예요. 이 스크립트들은 에뮬레이션의 **RAM**에 닿아서, 게임의 어떤 자료든 실시간으로 읽고 수정할 수 있어요.

구체적으로 할 수 있는 것은요.

- 레벨 속 Mario 위치 읽기
- 화면의 스프라이트(적, 아이템) 알기
- Mario 주변 각 타일(블록) 상태 알기
- 패드 조종. 어떤 버튼이든 누르기

AI가 플레이하게 하기에 정확히 필요한 것이에요.

### Super Mario World 메모리 주소

Super Mario World RAM에서 각 자료는 특정 주소에 저장돼요. 동네 같아요. 각 주소가 정보를 담은 "집" 하나예요. 예를 들면요.

| 주소 | 자료 |
|---------|--------|
| `0x94`-`0x95` | Mario X 위치 (16비트, 리틀엔디언) |
| `0x96`-`0x97` | Mario Y 위치 |
| `0x14C8`+`i` | 스프라이트 `i` 상태 (>7이면 살아 있음) |
| `0xE4`+`i` | 스프라이트 `i` 하위 X 위치 |
| `0x14E0`+`i` | 스프라이트 `i` 상위 X 위치 |
| `0xD8`+`i` | 스프라이트 `i` 하위 Y 위치 |
| `0x14D4`+`i` | 스프라이트 `i` 상위 Y 위치 |
| `0x170B`+`i` | 확장 스프라이트 `i` 종류 |
| `0x0100` | 게임 상태 (12이면 레벨 끝) |
| `0x13D4` | 일시정지 활성 |
| `0x0071` | Mario 죽음 애니메이션 (9이면 사망) |
| `0x1C800`+... | 레벨 타일 표 |

스프라이트 위치는 2바이트를 써요. 하위 바이트와 상위 바이트. 위치가 255픽셀을 넘을 수 있으니까요. 공식은 항상 하위 + 상위 × 256.

타일은 더 복잡해요. 베이스 주소 `0x1C800`, 월드에서 타일의 `x`와 `y` 좌표로 오프셋을 계산하고, 타일당 16픽셀 간격이에요.

![스프라이트 메모리 주소와 Mario 위치를 보여주는 디버그 오버레이가 있는 Super Mario World](/images/laupok-mario-ai/memory-debug.jpg)

---

## 기초: 유전 알고리즘과 신경망

코드에 들어가기 전에 두 가지 기본 개념을 이해해야 해요. 없으면 나머지가 의미가 없어요.

### 유전 알고리즘

유전 알고리즘이란 **진화론**의 시뮬레이션이에요. 핵심 생각: 서로 조금씩 다른 특성("유전자")을 가진 개체들의 **집단**을 만들어요. 환경에서 "살게" 해요. 잘 해내는 것들이 살아남고 번식해요. 못 해내는 것들은 사라져요.

Laupok은 **Kirby** 비유로 보여줘요.

- 가시와 토마토가 있는 지형에 Kirby 집단이 나와요
- 가시는 체력을 깎고 토마토는 채워줘요
- 각 Kirby에는 유전자가 있어요. 크기, 속도, 체력, 행동(도망, 토마토 찾기, 아무 데나 돌진)

!["아기", "크기", "속도", "색" 라벨이 있는 이중 나선 DNA. 개체를 이루는 유전자](/images/laupok-mario-ai/dna-genes.jpg)

- 15초 뒤 누가 가장 오래 살아남았는지 봐요
- 최고 Kirby가 다른 것들과 번식해요. 아기들은 최고의 절반과 "최악"의 절반 유전자를 물려받아요
- 아기들은 무작위 **변이**를 겪어요 (조금 더 크고, 조금 더 빠르고...)
- 옛 Kirby들은 새들로 교체돼요
- 다시 시작해요

180세대(~15시간) 뒤 Kirby들은 생존 15초에서 **15분**으로 가요. 작아지고(충돌 범위 축소), 빨라지고, 끊임없이 위험을 피해요.

![Kirby 시뮬레이션 0세대: 검은 바탕에 무작위로 흩어진 색 원들, 크기가 비슷해요](/images/laupok-mario-ai/kirby-gen0.jpg)

![Kirby 시뮬레이션 1866세대: Kirby들이 더 작고 빠르고 체계적으로 위험을 피해요](/images/laupok-mario-ai/kirby-gen1866.jpg)

![Kirby 시뮬레이션 통계: 성능순으로 정렬된 각 개체의 적합도와 체력, 행동](/images/laupok-mario-ai/kirby-stats.jpg)

핵심 지점: **해법을 정하지 않아요**. 알고리즘이 혼자 **찾아요**. 최적의 매개변수 조합이 무엇인지 모르는 문제에 강력해지는 이유가 바로 그거예요.

### 인공 신경망

신경망은 인간 뇌의 단순 수학 모델이에요. 구성은요.

- **입력 뉴런** (inputs): 네트워크가 "보는" 것
- **출력 뉴런** (outputs): 네트워크가 "정하는" 것
- **연결** (가중치): 각 연결에는 신호를 키우거나 줄이는 **가중치**가 있어요

원리는 단순해요. 각 입력 뉴런이 값을 보내요. 연결 가중치가 곱해지고 다른 신호들에 더해져요. 결과가 일정 임계값(**활성화 함수**)을 넘으면 출력 뉴런이 켜져요.

Mario와 쥐 끝 비유에서요.

- 입력 뉴런 = Mario와 끝 사이 거리
- 연결 가중치 = Mario 민감도
- 출력 뉴런 = Mario가 소리를 지르거나 말거나

끝이 가까울수록 입력값이 커져요. 가중치가 강하면 출력 신호가 강하고, Mario가 소리를 질러요. 가중치를 바꾸면 Mario 민감도가 바뀌어요.

![Mario가 Boo 앞에서 시냅스 바가 입력과 출력 사이 연결 가중치를 보여주는 "Mario가 무서워요" 데모](/images/laupok-mario-ai/mario-fear-demo.jpg)

AI의 진짜 신경망에서는 같은 논리지만 규모가 달라요.

- **입력 뉴런 99개** (Mario 시야 11×9 타일)
- **출력 뉴런 8개** (A, B, X, Y, 위, 아래, 왼쪽, 오른쪽)
- **숨은 뉴런** (hidden) 사이에
- 가중치가 제각각인 수백 개 연결

---

## NEAT: 모든 것을 바꾸는 알고리즘

### 고전 유전 알고리즘의 문제

유전 알고리즘과 신경망을 순진하게 합치면 문제가 있어요. 완전히 다른 신경망 100개를 만들고 비교할 방법을 몰라요. 각자 자기 뉴런과 연결, 가중치가 있어요. 두 네트워크가 "가까운지" "먼지" 어떻게 알까요?

거기에 **NEAT**가 와요. NeuroEvolution of Augmenting Topologies. **Kenneth Stanley**와 **Risto Miikkulainen**이 2002년에 발명했고, 바로 이 문제를 풀어요.

### 종

NEAT의 첫 핵심 구조는 **종**이에요. 신경망이 다른 것과 너무 달라지면 다른 종으로 분류돼요. 유사도는 세 매개변수로 계산돼요.

1. **Excess** (`EXCES_COEF = 0.50`): 두 네트워크 사이 아무 관계 없는 연결 수 (다른 혁신)
2. **Disjoint**: 마찬가지지만 중간에 있는 연결에 대해
3. **가중치 차이** (`POIDSDIFF_COEF = 0.92`): 같은 혁신을 공유하는 연결 사이 평균 가중치 차이

점수 공식:

```
score = (EXCES_COEF × disjoint) / max(nbConnexions1 + nbConnexions2, 1)
      + POIDSDIFF_COEF × diffPoids
```

이 점수가 `DIFF_LIMITE`(1.0)보다 작으면 두 네트워크는 같은 종이에요. 아니면 새 종을 만들어요.

### 혁신

NEAT의 천재성이에요. 연결이 만들어질 때마다 고유하고 전역적인 **혁신** 번호를 받아요. 이 번호는 번식해도 신경망을 따라다녀요.

구체적으로 아기가 교차로 만들어지면 부모의 혁신을 물려받아요. 두 네트워크가 같은 혁신을 공유하면 같은 조상에서 온 연결이 있다는 뜻이에요. 크기가 다른 네트워크를 비교할 수 있게 하는 것이 바로 이거예요.

### 교차

두 신경망이 번식하면 **교차**가 이렇게 동작해요.

!["CROSSOVER" 오버레이 글자와 함께 교차 개념을 설명하는 Laupok](/images/laupok-mario-ai/crossover-label.jpg)

1. 성능이 좋은 네트워크가 "우성 부모"가 돼요
2. 아기는 우성의 모든 연결을 물려받아요
3. 같은 혁신을 공유하는 각 연결마다 다른 부모가 대신할 수 있어요 (50퍼센트 확률)
4. 비우성 부모의 활성 연결만이 대신할 수 있어요

이렇게 하면 아기는 항상 최고 부모만큼은 좋아요.

### 변이

교차 뒤 아기는 설정 가능한 확률로 변이를 겪어요.

![ "(petite modif = mutation)" 오버레이 글자와 함께 변이를 설명하는 Laupok](/images/laupok-mario-ai/mutation-label.jpg)

| 변이 | 확률 | 효과 |
|----------|------------|-------|
| 연결 가중치 리셋 | 25% | 가중치가 완전히 무작위돼요 |
| 가중치 변이 | 95% | 가중치가 앞뒤 0.80씩 변해요 |
| 연결 추가 | 85% | 아직 연결되지 않은 두 뉴런 사이 새 연결 |
| 뉴런 추가 | 39% | 연결된 두 뉴런 사이에 숨은 뉴런 삽입 |

뉴런 추가율이 중요해요. 네트워크가 **자라게** 하는 것이 바로 이거예요. 처음에는 입력과 출력뿐이에요. 서서히 숨은 뉴런들이 나타나고 네트워크가 점점 복잡해져요.

---

## 코드: 전체 따라가기

### 상수

스크립트는 모든 매개변수를 정하는 상수 블록으로 시작해요.

```lua
-- Mario 주변 시야
TAILLE_TILE = 16
TAILLE_VUE_W = TAILLE_TILE * 11  -- 너비 176픽셀
TAILLE_VUE_H = TAILLE_TILE * 9   -- 높이 144픽셀
NB_TILE_W = TAILLE_VUE_W / TAILLE_TILE  -- 11타일
NB_TILE_H = TAILLE_VUE_H / TAILLE_TILE  -- 9타일

-- 신경망
NB_INPUT = NB_TILE_W * NB_TILE_H  -- 99개 입력 (보이는 타일)
NB_OUTPUT = 8  -- A, B, X, Y, Haut, Bas, Gauche, Droite
NB_INDIVIDU_POPULATION = 100  -- 집단당 개체
NB_NEURONE_MAX = 100000  -- 숨은 뉴런 한도

-- 적합도
FITNESS_LEVEL_FINI = 1000000  -- 레벨을 마치면 값
NB_FRAME_RESET_BASE = 33  -- 진전 없이 리셋까지 프레임
NB_FRAME_RESET_PROGRES = 300  -- 진전이 감지되면 프레임

-- 종
EXCES_COEF = 0.50
POIDSDIFF_COEF = 0.92
DIFF_LIMITE = 1.00

-- 변이
CHANCE_MUTATION_RESET_CONNEXION = 0.25
POIDS_CONNEXION_MUTATION_AJOUT = 0.80
CHANCE_MUTATION_POIDS = 0.95
CHANCE_MUTATION_CONNEXION = 0.85
CHANCE_MUTATION_NEURONE = 0.39
```

`NB_INPUT`이 99인 것은 Mario 시야가 11×9 타일이라서예요. 각 타일이 입력 뉴런 하나예요. 타일이 비었으면 0. 블록이면 1. 적이면 -1.

8개 출력은 SNES 패드 버튼에 해당해요. A, B, X, Y, 위, 아래, 왼쪽, 오른쪽. 결정을 핵심으로 한정하려고 Start, Select, L, R은 빼요.

### 자료구조

스크립트는 세 가지 주요 구조를 정해요.

```lua
function newNeurone()
    local neurone = {}
    neurone.valeur = 0    -- 현재 뉴런 값
    neurone.id = 0        -- 고유 식별자
    neurone.type = ""     -- "input", "output", 또는 "hidden"
    return neurone
end

function newConnexion()
    local connexion = {}
    connexion.entree = 0     -- 원천 뉴런 ID
    connexion.sortie = 0     -- 목적 뉴런 ID
    connexion.actif = true   -- 숨은 뉴런이 삽입되면 비활성화될 수 있어요
    connexion.poids = 0      -- 연결 가중치
    connexion.innovation = 0 -- 고유 혁신 번호
    connexion.allume = false -- 표시용: 신호가 지나가면 true
    return connexion
end

function newReseau()
    local reseau = {
        nbNeurone = 0,        -- 숨은 뉴런 수
        fitness = 1,          -- 성능 (간 거리)
        idEspeceParent = 0,   -- 어느 종에 속해요
        lesNeurones = {},     -- 뉴런 표
        lesConnexions = {}    -- 연결 표
    }
    -- 입력으로 초기화
    for j = 1, NB_INPUT, 1 do
        ajouterNeurone(reseau, j, "input", 1)
    end
    -- 다음 출력
    for j = NB_INPUT + 1, NB_INPUT + NB_OUTPUT, 1 do
        ajouterNeurone(reseau, j, "output", 0)
    end
    return reseau
end
```

처음에 각 네트워크는 입력과 출력만 있어요. 숨은 뉴런도 연결도 없어요. 필요한지 정하는 것이 알고리즘이에요.

### 변이 자세히

#### 가중치 변이

```lua
function mutationPoidsConnexions(unReseau)
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            if math.random() < CHANCE_MUTATION_RESET_CONNEXION then
                -- 25% : 가중치 완전 리셋
                unReseau.lesConnexions[i].poids = genererPoids()
            else
                -- 75% : 앞뒤 0.80씩 변동
                if math.random() >= 0.5 then
                    unReseau.lesConnexions[i].poids =
                        unReseau.lesConnexions[i].poids - POIDS_CONNEXION_MUTATION_AJOUT
                else
                    unReseau.lesConnexions[i].poids =
                        unReseau.lesConnexions[i].poids + POIDS_CONNEXION_MUTATION_AJOUT
                end
            end
        end
    end
end
```

초기 가중치는 항상 1 또는 -1(`genererPoids()`). 앞뒤 0.80 변동이 음수와 양수 사이를 오가게 해서 네트워크 행동을 근본적으로 바꿔요.

#### 연결 추가

```lua
function mutationAjouterConnexion(unReseau)
    local liste = {}
    -- 뉴런 목록 무작위화
    for i, v in ipairs(unReseau.lesNeurones) do
        local pos = math.random(1, #liste+1)
        table.insert(liste, pos, v)
    end

    local traitement = false
    for i = 1, #liste, 1 do
        for j = 1, #liste, 1 do
            if i ~= j then
                local n1 = liste[i]
                local n2 = liste[j]
                -- 유효 연결: input→output, hidden→hidden, hidden→output
                if (n1.type == "input" and n2.type == "output") or
                   (n1.type == "hidden" and n2.type == "hidden") or
                   (n1.type == "hidden" and n2.type == "output") then
                    -- 이미 연결이 있는지 확인
                    local dejaConnexion = false
                    for k = 1, #unReseau.lesConnexions, 1 do
                        if unReseau.lesConnexions[k].entree == n1.id
                            and unReseau.lesConnexions[k].sortie == n2.id then
                            dejaConnexion = true
                            break
                        end
                    end
                    if dejaConnexion == false then
                        traitement = true
                        ajouterConnexion(unReseau, n1.id, n2.id)
                    end
                end
            end
            if traitement then break end
        end
        if traitement then break end
    end
end
```

출력을 입력에 연결할 수 없어요 (사이클이 생겨요). 이미 연결된 두 뉴런도 연결할 수 없어요. 무작위화가 매번 다른 가능성을 탐색하도록 보장해요.

#### 뉴런 추가

가장 흥미로운 변이예요.

```lua
function mutationAjouterNeurone(unReseau)
    if #unReseau.lesConnexions == 0 then return nil end
    if unReseau.nbNeurone == NB_NEURONE_MAX then return nil end

    -- 연결 무작위화
    local listeRandom = {}
    for i = 1, #unReseau.lesConnexions, 1 do
        local pos = math.random(1, #listeRandom+1)
        table.insert(listeRandom, pos, i)
    end

    for i = 1, #listeRandom, 1 do
        if unReseau.lesConnexions[listeRandom[i]].actif then
            -- 기존 연결 비활성화
            unReseau.lesConnexions[listeRandom[i]].actif = false
            unReseau.nbNeurone = unReseau.nbNeurone + 1
            local indice = unReseau.nbNeurone + NB_INPUT + NB_OUTPUT

            -- 숨은 뉴런 만들기
            ajouterNeurone(unReseau, indice, "hidden", 1)

            -- 입력을 숨은 뉴런에 연결
            ajouterConnexion(unReseau,
                unReseau.lesConnexions[listeRandom[i]].entree,
                indice, genererPoids())

            -- 숨은 뉴런을 출력에 연결
            ajouterConnexion(unReseau,
                indice,
                unReseau.lesConnexions[listeRandom[i]].sortie,
                genererPoids())
            break
        end
    end
end
```

구조: 기존 연결 하나를 가져와 **비활성화**하고, 중간에 숨은 뉴런을 끼워요. 원래 연결이 두 새 연결로 바뀌어요. 입력에서 숨은, 숨은에서 출력. 전선을 잘라서 스위치를 끼우는 것과 같아요.

NEAT가 "augmenting topologies"인 이유가 바로 이거예요. 네트워크가 시간과 함께 **자라요**. 단순하게 시작해서 필요할 때만 복잡해져요.

### 피드포워드

네트워크에 신호를 전파하는 함수예요.

```lua
function feedForward(unReseau)
    -- 출력 뉴런 리셋
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur = 0
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].allume = false
        end
    end

    -- 전파
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            local avantTraitement = unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur =
                unReseau.lesNeurones[unReseau.lesConnexions[i].entree].valeur *
                unReseau.lesConnexions[i].poids +
                unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur

            if avantTraitement ~= unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur then
                unReseau.lesConnexions[i].allume = true
            else
                unReseau.lesConnexions[i].allume = false
            end
        end
    end
end
```

각 활성 연결이 `입력값 × 가중치`를 출력 뉴런으로 보내요. 값은 **누적**(덧셈)돼요. `allume` 깃발은 네트워크 시각 표시용일 뿐이에요.

### 게임 메모리 읽기

`getLesInputs()` 함수는 Super Mario World 세상을 네트워크가 이해하는 자료로 바꿔요.

```lua
function getLesInputs()
    local lesInputs = {}
    -- 0으로 초기화 (회색 = 없음)
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            lesInputs[getIndiceLesInputs(i, j)] = 0
        end
    end

    -- 스프라이트(적) = -1 (검정)
    local lesSprites = getLesSprites()
    for i = 1, #lesSprites, 1 do
        local input = convertirPositionPourInput(getLesSprites()[i])
        if input.x > 0 and input.x < (TAILLE_VUE_W / TAILLE_TILE) + 1 then
            lesInputs[getIndiceLesInputs(input.x, input.y)] = -1
        end
    end

    -- 타일(블록) = 타일 값 (0보다 크면 흰색)
    local lesTiles = getLesTiles()
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            local indice = getIndiceLesInputs(i, j)
            if lesTiles[indice] ~= 0 then
                lesInputs[indice] = lesTiles[indice]
            end
        end
    end

    return lesInputs
end
```

입력 격자는 Mario 중심 시야예요. 너비 11타일, 높이 9타일. 각 타일 값은요.

- **0** (회색): 없음
- **1** (흰색): 고체 블록
- **-1** (검정): 적

적은 RAM의 두 목록에서 읽어요. 일반 스프라이트(`0x14C8`-`0x14F8`)와 확장 스프라이트(`0x170B`-`0x173B`). 살아 있는 각 스프라이트(상태 > 7)마다 Mario 기준 타일 위치를 계산하고 해당 칸에 -1을 넣어요.

### 적합도: AI가 진전하는지 아는 방법

```lua
function majReseau(unReseau, marioBase)
    local mario = getPositionMario()

    if not niveauFini and memory.readbyte(0x0100) == 12 then
        -- 레벨 끝!
        unReseau.fitness = FITNESS_LEVEL_FINI
        niveauFini = true
    elseif marioBase.x < mario.x then
        -- Mario가 오른쪽으로 가요
        unReseau.fitness = unReseau.fitness + (mario.x - marioBase.x)
        marioBase.x = mario.x
    end

    -- 입력 고치기
    local lesInputs = getLesInputs()
    for i = 1, NB_INPUT, 1 do
        unReseau.lesNeurones[i].valeur = lesInputs[i]
    end
end
```

적합도는 단순해요. **오른쪽으로 간 거리**예요. Mario가 10픽셀 가면 적합도가 10 올라가요. 뒤로 가면 아무 일도 없어요 (벌점 없어요). 레벨이 끝나면(주소 `0x0100` == 12) 적합도가 1,000,000이 돼요.

일부러 단순해요. 오른쪽으로 가는 진전만이 중요해요. 적을 죽여도 아무것도 없고 죽어도 잃는 것 없어요.

### 영리한 리셋

Mario가 33프레임 동안 움직이지 않으면 레벨을 리셋하고 다음 개체로 넘어가요. 하지만 Mario가 진전했으면(현재 적합도가 시작 때와 다르면) 300프레임 기다려요. 네트워크가 잘한 것을 "이해"할 기회를 주는 거예요.

```lua
if fitnessAvant == laPopulation[idPopulation].fitness
   and memory.readbyte(0x13D4) == 0 then
    nbFrameStop = nbFrameStop + 1
    local nbFrameReset = NB_FRAME_RESET_BASE
    if fitnessInit ~= laPopulation[idPopulation].fitness
       and memory.readbyte(0x0071) ~= 9 then
        nbFrameReset = NB_FRAME_RESET_PROGRES
    end
    if nbFrameStop > nbFrameReset then
        nbFrameStop = 0
        lancerNiveau()
        idPopulation = idPopulation + 1
        -- ...
    end
end
```

`memory.readbyte(0x0071) ~= 9` 조건은 Mario가 죽음 애니메이션 중이 아닌지 확인해요. Mario가 이미 죽음 애니메이션 중이면 리셋이 소용없어져요.

### 주 루프

루프는 30fps(Super Mario World 정상 속도)로 돌아요.

```lua
while true do
    local fitnessAvant = laPopulation[idPopulation].fitness

    -- 표시 (네트워크, 정보)
    if forms.ischecked(estAccelere) then
        emu.limitframerate(false)  -- 빠르게
    else
        emu.limitframerate(true)   -- 30fps
    end

    -- 3개 생명 함수
    majReseau(laPopulation[idPopulation], marioBase)
    feedForward(laPopulation[idPopulation])
    appliquerLesBoutons(laPopulation[idPopulation])

    emu.frameadvance()
    nbFrame = nbFrame + 1

    -- 진전 없으면 리셋
    -- ...
    -- 모든 개체를 테스트하면 새 세대
    -- ...
end
```

세 생명 함수는 `majReseau`, `feedForward`, `appliquerLesBoutons`예요. 하나만 꺼도 Mario가 더 이상 움직이지 않아요.

### 교차

```lua
function crossover(unReseau1, unReseau2)
    local leReseau = newReseau()
    local leBon = unReseau1
    local leNul = unReseau2

    if leBon.fitness < leNul.fitness then
        leBon = unReseau2
        leNul = unReseau1
    end

    leReseau = copier(leBon)

    for i = 1, #leReseau.lesConnexions, 1 do
        for j = 1, #leNul.lesConnexions, 1 do
            if leReseau.lesConnexions[i].innovation == leNul.lesConnexions[j].innovation
               and leNul.lesConnexions[j].actif then
                if math.random() > 0.5 then
                    leReseau.lesConnexions[i] = leNul.lesConnexions[j]
                end
            end
        end
    end
    leReseau.fitness = 1
    return leReseau
end
```

아기는 좋은 부모를 물려받아요. 같은 혁신을 공유하는 각 연결마다 다른 부모가 50퍼센트 확률로 대신해요. 하지만 **연결이 활성일 때만**이요. 중요한 수정이에요. 이것이 없으면 쓸모없는 숨은 뉴런이 만들어질 수 있었어요.

### 종별 선택

```lua
function nouvelleGeneration(laPopulation, lesEspeces)
    local laNouvellePopulation = newPopulation()
    local nbIndividuACreer = NB_INDIVIDU_POPULATION

    -- 종별 평균 적합도 계산
    for i = 1, #lesEspeces, 1 do
        lesEspeces[i].fitnessMoyenne = 0
        for j = 1, #lesEspeces[i].lesReseaux, 1 do
            lesEspeces[i].fitnessMoyenne =
                lesEspeces[i].fitnessMoyenne + lesEspeces[i].lesReseaux[j].fitness
        end
        lesEspeces[i].fitnessMoyenne =
            lesEspeces[i].fitnessMoyenne / #lesEspeces[i].lesReseaux
    end

    -- 각 종은 평균 적합도에 비례해 아이를 만들어요
    for i = 1, #lesEspeces, 1 do
        local nbEnfant = math.ceil(
            #lesEspeces[i].lesReseaux *
            lesEspeces[i].fitnessMoyenne / fitnessMoyenneGlobal)

        for j = 1, nbEnfant, 1 do
            local unReseau = crossover(
                choisirParent(lesEspeces[i].lesReseaux),
                choisirParent(lesEspeces[i].lesReseaux))
            mutation(unReseau)
            laNouvellePopulation[indiceNouvelleEspece] = copier(unReseau)
        end
    end
end
```

생각: 평균 적합도 10,000인 종은 평균 1인 종보다 훨씬 많은 아이를 만들 권리가 있어요. 동작 중인 **자연 선택**이에요.

`choisirParent`는 룰렛 선택을 써요. 적합도가 높은 개체일수록 부모로 뽑힐 확률이 높아요.

### 저장과 불러오기

집단은 `.pop` 파일에 저장돼요.

```lua
function sauvegarderUnReseau(unReseau, fichier)
    io.write(unReseau.nbNeurone .. "\n")
    io.write(#unReseau.lesConnexions .. "\n")
    io.write(unReseau.fitness .. "\n")
    for i = 1, unReseau.nbNeurone, 1 do
        local indice = NB_INPUT + NB_OUTPUT + i
        io.write(unReseau.lesNeurones[indice].id .. "\n")
    end
    for i = 1, #unReseau.lesConnexions, 1 do
        local actif = 1
        if unReseau.lesConnexions[i].actif ~= true then actif = 0 end
        io.write(actif .. "\n" ..
            unReseau.lesConnexions[i].entree .. "\n" ..
            unReseau.lesConnexions[i].sortie .. "\n" ..
            unReseau.lesConnexions[i].poids .. "\n" ..
            unReseau.lesConnexions[i].innovation .. "\n")
    end
end
```

저장에는 이전 모든 집단 중 최고 개체도 포함돼요. 옛 집단 최고가 새 집단 최고보다 좋으면 옛 것을 토대로 다시 시작해요. 일종의 **엘리트주의**예요. 최고를 절대 잃지 않아요.

### 네트워크 그리기

Laupok은 게임 위에 신경망 시각화를 더했어요.

```lua
function dessinerUnReseau(unReseau)
    -- 입력: Mario 주변 11×9 격자
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            local xT = ENCRAGE_X_INPUT + (i - 1) * TAILLE_INPUT
            local yT = ENCRAGE_Y_INPUT + (j - 1) * TAILLE_INPUT
            local couleurFond = "gray"
            if unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur < 0 then
                couleurFond = "black"   -- 적
            elseif unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur > 0 then
                couleurFond = "white"   -- 블록
            end
            gui.drawRectangle(xT, yT, TAILLE_INPUT, TAILLE_INPUT, "black", couleurFond)
        end
    end

    -- 출력: 8개 버튼
    for i = 1, NB_OUTPUT, 1 do
        local xT = ENCRAGE_X_OUTPUT
        local yT = ENCRAGE_Y_OUTPUT + ESPACE_Y_OUTPUT * (i - 1)
        if sigmoid(unReseau.lesNeurones[i + NB_INPUT].valeur) then
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "white")
        else
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "black")
        end
    end

    -- 연결
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            local alpha = 25
            if unReseau.lesConnexions[i].allume then alpha = 255 end
            local couleur = forms.createcolor(255, 255, 255, alpha)
            gui.drawLine(
                lesPositions[unReseau.lesConnexions[i].entree].x,
                lesPositions[lesConnexions[i].entree].y,
                lesPositions[unReseau.lesConnexions[i].sortie].x,
                lesPositions[lesConnexions[i].sortie].y,
                couleur)
        end
    end
end
```

네트워크가 무엇을 하는지 이해하는 데 아주 유용해요. 활성 연결은 흰색, 비활성은 반투명. 입력은 흰색과 검정, 회색 칸 격자. 출력은 어떤 버튼이 눌렸는지 보여줘요.

---

## 결과

### AI가 배운 것

실행 몇 시간(그리고 며칠)이 지나면서 AI는 혼자 발견했어요.

1. **오른쪽으로 가기**: 가장 기본 행동이지만 오른쪽 버튼을 누르고 있어야 해요
2. **적 위로 점프하기**: "적 감지" 입력을 A나 B 버튼에 연결해서
3. **장애물 피하기**: 어떤 네트워크는 더 잘 가려고 잠시 뒤로 가는 법을 배웠어요
4. **레벨 끝내기**: 최고 개체가 Super Mario World 첫 레벨을 마칠 수 있었어요

![Super Mario World 레벨에서 Boo 앞의 AI 조종 Mario. 신경망이 실시간으로 행동을 정해요](/images/laupok-mario-ai/mario-ai-playing.jpg)

### 한계

프로젝트의 한계예요.

- **단일 레벨**: AI는 특정 레벨 하나로 훈련돼요. 다른 레벨로 자동으로 일반화하지 않아요
- **훈련 시간**: 만족스러운 결과에 수십 시간이 필요해요
- **이해 없음**: AI는 무엇을 하는지 "이해"하지 않아요. 무작위 변이로 적합도 함수(간 거리)를 최적화해요
- **T-배깅**: Mario가 적을 보면 제자리 점프하는 경향이 있다고 Laupok은 적어요. 점프하면서 조금 가서 적합도가 올라가니까요

---

## 실험 재현 방법

Laupok이 전부 공유했어요. 단계는 이렇습니다.

1. [tasvideos.org](https://tasvideos.org/BizHawk)에서 **BizHawk 다운로드** (Download 섹션)
2. **Super Mario World USA 롬** 구하기 (자기 카트리지의 사적 복사)
3. [Pastebin](https://pastebin.com/Jcvdqhqm)에서 **Lua 스크립트 다운로드**. `mario.lua`로 이름 바꾸기
4. **롬과 같은 폴더에 스크립트 두기**
5. **BizHawk 실행**, 롬 열기
6. **Lua 콘솔에서**: `dofile("mario.lua")` 또는 메뉴 Script > Open Script
7. 레벨 시작 지점에 **세이브 스테이트 저장** (메뉴 Savestate > Save State). `debut.state`라고 이름 짓기
8. **스크립트 다시 실행**. 돼요

스크립트에 옵션 폼이 들어 있어요.

- **가속**: 30fps 한도를 꺼서 더 빠르게
- **네트워크 표시**: 신경망을 오버레이로 보여줘요
- **정보 표시**: 세대와 적합도, 종 수를 담은 배너를 보여줘요
- **일시정지**: 실행을 멈춰요
- **저장과 불러오기**: 현재 집단을 `.pop` 파일에 저장해요

---

## 출처와 참고

| 자료 | 링크 |
|-----------|------|
| Laupok 주 영상 | [j'ai créé une IA qui joue à mario toute seule](https://www.youtube.com/watch?v=F63GNXGHVwM) |
| 코드 리뷰와 설정 영상 | [comment setup l'ia + code source review](https://www.youtube.com/watch?v=u5xCl1bSe6o) |
| 완전한 소스 코드 | [Pastebin Jcvdqhqm](https://pastebin.com/Jcvdqhqm) |
| NEAT 원본 논문 | Stanley & Miikkulainen, "Evolving Neural Networks through Augmenting Topologies", 2002 |
| N8Programs 튜토리얼 | [NEAT implementation walkthrough](https://n8programs.github.io/) (JavaScript지만 개념은 같아요) |
| 16blings (Laupok 영감) | [AI plays Super Mario World](https://www.youtube.com/watch?v=qv6IFaOz3bA) |
| BizHawk | [tasvideos.org/BizHawk](https://tasvideos.org/BizHawk) |
| Super Mario World 메모리 | [SMW Central - RAM Map](https://www.smwcentral.net/?p=section&a=details&id=21702) |

---

## 결론

Laupok이 한 것은 학술 알고리즘(NEAT, 2002년)을 가져와 에뮬레이터(BizHawk)용 Lua로 다시 쓰고 Super Mario World에 적용한 거예요. 결과: 사전 지식 없이 0에서 게임하는 법을 배우는 AI. 무작위 변이와 자연 선택만으로요.

유전 알고리즘의 힘을 보여주는 아름다운 예예요. 레시피는 세 재료예요. 자연 선택, Lua 조금, 인내 많이. 딥러닝도 없고, GPU도 없고, 대규모 훈련 자료도 없어요.

코드는 주석이 있고, 공유되고, Laupok이 설명 영상 둘을 만들었어요. 큰 개념용 하나, 코드용 하나. 주제에 관심 있으면 뛰어들어 보세요. 보기보다 쉬워요.
