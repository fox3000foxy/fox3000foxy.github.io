---
title: "Laupok이 만든 슈퍼 마리오 월드를 혼자서 플레이하는 AI -- 작동 원리"
description: "Laupok 프로젝트 심층 분석: 슈퍼 마리오 월드를 자율적으로 플레이하는 NEAT 기반 AI. 유전 알고리즘, 신경망, 증강 토폴로지의 신경 진화, 그리고 4200줄의 Lua."
date: 2026-07-11
authors:
  - fox3000foxy
tags:
  - ai
  - lua
  - emulation
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "NCl2JMOxEY0gCjbDqjs8t0gPIgoJLFktJzfqcL+vjpvJ0uRGOCHh+4AWxYDQiSuJntLdtrp7Xtniwb+8hzLDEg=="
---

# Laupok이 만든 슈퍼 마리오 월드를 혼자서 플레이하는 AI -- 작동 원리

Laupok는 **슈퍼 마리오 월드**를 완전히 자율적으로 플레이하는 인공 지능을 만들었다. 사전 정의된 입력도, 녹화된 프레임도 없다. AI는 혼자서, 무작위 돌연변이와 자연 선택을 통해 게임 레벨을 클리어하는 방법을 배운다. 프로젝트는 **BizHawk**라는 멀티 플랫폼 에뮬레이터에서 약 **4200줄**의 Lua 스크립트로 작동한다.

이 프로젝트를 매력적으로 만드는 것은 생물학적 개념을 컴퓨터 과학에 적용한 것이다. 다윈의 **진화론**, **인공 신경망**, 그리고 가장 중요한 **NEAT**(NeuroEvolution of Augmenting Topologies)라는 특정 알고리즘이다. AI는 처음에 게임에 대해 아무것도 모른다. 무작위로 시도하고, 수천 번 실패하며, 점차 움직임, 점프, 생존 방법을 배운다.

이 글에서는 모든 것을 개념별로, 코드 라인별로 분석해 보겠다.

![Laupok가 카메라 앞에서 NEAT 알고리즘을 소개](/images/laupok-mario-ai/neat-title.jpg)

---

## 설정: BizHawk, Lua, 슈퍼 마리오 월드

### BizHawk 에뮬레이터

BizHawk는 NES, SNES, Genesis, PS1, Game Boy 등 수많은 콘솔을 지원하는 오픈소스 에뮬레이터다. 주요 특징은 게임과 함께 **Lua 스크립트**를 실행할 수 있다는 점이다. 이 스크립트는 에뮬레이션의 **RAM**(램덤 액세스 메모리)에 접근할 수 있어, 게임 데이터를 실시간으로 읽고 수정할 수 있다.

구체적으로 이것이 가능한 것:
- 레벨에서 마리오의 위치 읽기
- 화면에 있는 스프라이트(적, 아이템) 파악
- 마리오 주변의 모든 타일(블록) 상태 알기
- 컨트롤러 조작 -- 아무 버튼이나 누르기

이것이 AI에게 플레이를 시키는 데 필요한 전부다.

### 슈퍼 마리오 월드의 메모리 주소

슈퍼 마리오 월드의 RAM에서는 모든 데이터가 특정 주소에 저장된다. 마을과 같은 것으로, 각 주소는 정보 하나를 담은 "집"에 해당한다. 예:

| 주소 | 데이터 |
|------|--------|
| `0x94`-`0x95` | 마리오의 X 위치 (16비트, 리틀 엔디안) |
| `0x96`-`0x97` | 마리오의 Y 위치 |
| `0x14C8`+`i` | 스프라이트 `i` 상태 (>7 = 생존) |
| `0xE4`+`i` | 스프라이트 `i` 하위 X 위치 |
| `0x14E0`+`i` | 스프라이트 `i` 상위 X 위치 |
| `0xD8`+`i` | 스프라이트 `i` 하위 Y 위치 |
| `0x14D4`+`i` | 스프라이트 `i` 상위 Y 위치 |
| `0x170B`+`i` | 확장 스프라이트 `i` 타입 |
| `0x0100` | 게임 상태 (12 = 레벨 클리어) |
| `0x13D4` | 일시정지 활성 |
| `0x0071` | 마리오 죽음 애니메이션 (9 = 사망) |
| `0x1C800`+... | 레벨 타일 테이블 |

스프라이트 위치는 두 바이트를 사용한다. "하위" 바이트와 "상위" 바이트다. 위치가 255픽셀을 초과할 수 있기 때문이다. 공식은 항상 `하위 + 상위 × 256`이다.

타일은 더 복잡하다: 기본 주소는 `0x1C800`이고, 월드에서 타일의 `x`와 `y` 좌표에 따라 오프셋을 계산한다. 타일당 16픽셀 단위다.

![디버그 오버레이가 있는 슈퍼 마리오 월드. 스프라이트 메모리 주소와 마리오 위치를 표시](/images/laupok-mario-ai/memory-debug.jpg)

---

## 기본: 유전 알고리즘과 신경망

코드를 분석하기 전에, 두 가지 기본 개념을 이해해야 한다. 이것이 없으면 나머지는 의미가 없다.

### 유전 알고리즘

유전 알고리즘은 **진화론**의 시뮬레이션이다. 핵심 아이디어: 약간 다른 특성("유전자")을 가진 **개체군**을 만들고, 환경에서 "살게" 한다. 가장 잘 적응한 개체는 생존하고 번식한다. 적응하지 못하는 개체는 도태된다.

Laupok는 이를 **커비** 비유로 설명한다:
- 커비 개체군이 가시와 토마토가 있는 지형에 나타남
- 가시는 HP를 깎고, 토마토는 회복
- 각 커비에게는 유전자가 있다: 크기, 속도, HP, 행동 (도망, 토마토 찾기, 맹목적 달리기)

![유전자 라벨 "the baby", "size", "speed", "color"이 있는 DNA 이중 나선 -- 개체를 구성하는 유전자](/images/laupok-mario-ai/dna-genes.jpg)

- 15초 후, 누가 가장 오래 생존했는지 확인
- 가장 좋은 커비가 다른 커비와 교배: 아기는 가장 좋은 유전자 절반과 가장 나쁜 유전자 절반을 물려받음
- 아기는 무작위 **돌연변이**를 경험 (조금 더 크고, 조금 더 빠르고...)
- 기존 커비는 새로운 것으로 교체
- 재시작

180세대(~15시간) 후, 커비는 15초 생존에서 **15분**으로 성장했다. 작아졌고(히트박스 축소), 빨라졌으며, 끊임없이 위험에서 도망친다.

![커비 시뮬레이션 0세대: 검은 배경에 무작위로 흩어진 색깔 원. 모두 비슷한 크기](/images/laupok-mario-ai/kirby-gen0.jpg)

![커비 시mulación 1866세대: 커비는 더 작고, 빠르며, 체계적으로 위험에서 도망친다](/images/laupok-mario-ai/kirby-gen1866.jpg)

![커비 시mulación 통계: 적합도, HP, 각 개체의 행동이 성능순으로 순위](/images/laupok-mario-ai/kirby-stats.jpg)

결정적인 점: **해결책을 정의하지 않는다**. 알고리즘이 **스스로 찾는다**. 이것이 최적의 매개변수 조합을 모르는 문제에서 강력한 이유다.

### 인공 신경망

신경망은 인간 뇌의 간소화된 수학적 모델이다. 다음으로 구성된다:
- **입력 뉴런**: 네트워크가 "보는" 것
- **출력 뉴런**: 네트워크가 "결정하는" 것
- **연결 (가중치)**: 각 연결에는 신호를 증폭하거나 감쇠하는 **가중치**가 있다

원리는 단순하다. 각 입력 뉴런은 값을 보낸다. 연결 가중치로 곱해지고, 다른 신호에 더해진다. 결과가 특정 임계값(**활성화 함수**)을 초과하면, 출력 뉴런이 발화한다.

Laupok의 마리오와 마우스 커서 비유에서:
- 입력 뉴런 = 마리오와 커서 사이 거리
- 연결 가중치 = 마리오의 민감도
- 출력 뉴런 = 마리오가 소리치는지 여부

커서가 가까울수록 입력 값이 높다. 가중치가 강하면 출력 신호가 강하고, 마리오는 소리칠 것이다. 가중치를 변경하여 마리오의 민감도를 변경할 수 있다.

![“마리오가 무서워” 데모: 마리오가 부와 마주하고 있고, 입출력 사이 연결 가중치를 표시하는 시냅스 바가 있음](/images/laupok-mario-ai/mario-fear-demo.jpg)

실제 AI 신경망에서는 같은 로지크이지만 대규모로:
- **99개 입력 뉴런** (마리오의 시야 11×9 타일)
- **8개 출력 뉴런** (A, B, X, Y, 위, 아래, 왼쪽, 오른쪽)
- 그 사이의 **은닉 뉴런**
- 다양한 가중치를 가진 수백 개의 연결

---

## NEAT: 모든 것을 바꾸는 알고리즘

### 기본 유전 알고리즘의 문제

유전 알고리즘을 신경망과 단순히 결합하면 문제가 생긴다: 100개의 완전히 다른 신경망을 만들고 비교할 수 없기 때문이다. 각각 고유의 뉴런, 연결, 가중치를 가지고 있다. 두 네트워크가 "비슷한지" "다른지" 어떻게 알 수 있는가?

여기서 **NEAT**가 등장한다 -- NeuroEvolution of Augmenting Topologies. **Kenneth Stanley**와 **Risto Miikkulainen**가 2002년에 발명했으며, 이 문제를 정확히 해결한다.

### 종

NEAT의 첫 번째 핵심 메커니즘은 **종**이다. 신경망이 다른 네트워크와 너무 다르면, 다른 종으로 분류된다. 유사성은 세 가지 매개변수로 계산된다:

1. **초과** (`EXCES_COEF = 0.50`): 두 네트워크에서 공통점이 없는 연결 수 (다른 혁신)
2. **불연속**: 같은 것이지만 중간 연결에 대해
3. **가중치 차이** (`POIDSDIFF_COEF = 0.92`): 같은 혁신을 공유하는 연결 간의 평균 가중치 차이

점수 공식:

```
점수 = (EXLES_COEF × 불연속) / max(연결수1 + 연결수2, 1)
     + POIDSDIFF_COEF × 가중치차이
```

이 점수가 `DIFF_LIMITE` (1.0) 이하면, 두 네트워크는 같은 종이다. 그렇지 않으면 새로운 종이 생성된다.

### 혁신

이것이 NEAT의 천재성이다. 연결이 생성될 때마다, 고유하고 전역적인 **혁신 번호**가 부여된다. 이 번호는 신경망이 번식한 후에도 따라다닌다.

구체적으로, 교차를 통해 아기가 생성되면, 부모의 혁신을 상속한다. 두 네트워크가 같은 혁신을 공유하면, 같은 조상의 연결이 있다는 뜻이다. 이것이 서로 다른 크기의 네트워크를 비교 가능하게 한다.

### 교차 (크로스오버)

두 신경망이 번식할 때, **교차**는 다음과 같이 작동한다:

![Laupok가 "CROSSOVER" 텍스트를 오버레이하여 교차 개념을 설명](/images/laupok-mario-ai/crossover-label.jpg)

1. 성능이 더 좋은 네트워크가 "우성 부모"가 된다
2. 아기는 우성의 모든 연결을 상속한다
3. 같은 혁신을 공유하는 각 연결에 대해, 다른 부모가 대체할 수 있다 (50% 확률)
4. 비우성 부모의 활성 연결만 대체 가능

이것은 아기가 항상 최소한 최고 부모만큼은 좋다는 것을 보장한다.

### 돌연변이

교차 후, 아기는 설정 가능한 확률로 돌연변이를 경험한다:

![Laupok가 "(small modif = mutation)" 텍스트를 오버레이하여 돌연변이를 설명](/images/laupok-mario-ai/mutation-label.jpg)

| 돌연변이 | 확률 | 효과 |
|----------|------|------|
| 연결 가중치 리셋 | 25% | 가중치가 완전히 무작위화됨 |
| 가중치 돌연변이 | 95% | 가중치가 ±0.80 변동 |
| 연결 추가 | 85% | 연결되지 않은 두 뉴런 사이에 새로운 연결 |
| 뉴런 추가 | 39% | 연결된 두 뉴런 사이에 은닉 뉴런이 삽입됨 |

뉴런 추가율이 중요하다. 이것이 네트워크를 **성장**시키는 것이다. 처음에는 입력과 출력만 있다. 점차 은닉 뉴런이 나타나며 네트워크가 점점 더 복잡해진다.

---

## 코드: 전체 분석

### 상수

스크립트는 모든 설정을 정의하는 상수 블록으로 시작한다:

```lua
-- 마리오 주변 시야
TAILLE_TILE = 16
TAILLE_VUE_W = TAILLE_TILE * 11  -- 176픽셀 너비
TAILLE_VUE_H = TAILLE_TILE * 9   -- 144픽셀 높이
NB_TILE_W = TAILLE_VUE_W / TAILLE_TILE  -- 11 타일
NB_TILE_H = TAILLE_VUE_H / TAILLE_TILE  -- 9 타일

-- 신경망
NB_INPUT = NB_TILE_W * NB_TILE_H  -- 99 입력 (보이는 타일)
NB_OUTPUT = 8  -- A, B, X, Y, 위, 아래, 왼쪽, 오른쪽
NB_INDIVIDU_POPULATION = 100  -- 개체군당 개체 수
NB_NEURONE_MAX = 100000  -- 최대 은닉 뉴런 수

-- 적합도
FITNESS_LEVEL_FINI = 1000000  -- 레벨 완료 시 값
NB_FRAME_RESET_BASE = 33  -- 진전 없이 리셋 전 프레임 수
NB_FRAME_RESET_PROGRES = 300  -- 진전 감지 시 프레임 수

-- 종
EXCES_COEF = 0.50
POIDSDIFF_COEF = 0.92
DIFF_LIMITE = 1.00

-- 돌연변이
CHANCE_MUTATION_RESET_CONNEXION = 0.25
POIDS_CONNEXION_MUTATION_AJOUT = 0.80
CHANCE_MUTATION_POIDS = 0.95
CHANCE_MUTATION_CONNEXION = 0.85
CHANCE_MUTATION_NEURONE = 0.39
```

`NB_INPUT`이 99인 이유는 마리오의 시야가 11×9 타일이기 때문이다. 각 타일이 입력 뉴런 하나. 빈 타일 = 0, 블록 = 1, 적 = -1.

8개 출력은 SNES 컨트롤러 버튼에 해당한다: A, B, X, Y, 위, 아래, 왼쪽, 오른쪽. Start, Select, L, R은 제외되어 마리오를 "방해"하지 않게 한다.

### 데이터 구조

스크립트는 세 가지 주요 구조를 정의한다:

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
    connexion.entree = 0     -- 소스 뉴런 ID
    connexion.sortie = 0     -- 대상 뉴런 ID
    connexion.actif = true   -- 은닉 뉴런 삽입 시 비활성화 가능
    connexion.poids = 0      -- 연결 가중치
    connexion.innovation = 0 -- 고유 혁신 번호
    connexion.allume = false -- 표시용: 신호 통과 시 true
    return connexion
end

function newReseau()
    local reseau = {
        nbNeurone = 0,        -- 은닉 뉴런 수
        fitness = 1,          -- 성능 (이동 거리)
        idEspeceParent = 0,   -- 소속된 종
        lesNeurones = {},     -- 뉴런 배열
        lesConnexions = {}    -- 연결 배열
    }
    -- 입력으로 초기화
    for j = 1, NB_INPUT, 1 do
        ajouterNeurone(reseau, j, "input", 1)
    end
    -- 그 다음 출력
    for j = NB_INPUT + 1, NB_INPUT + NB_OUTPUT, 1 do
        ajouterNeurone(reseau, j, "output", 0)
    end
    return reseau
end
```

처음에는 각 네트워크에 입력과 출력만 있다. 은닉 뉴런도, 연결도 없다. 알고리즘이 필요한지 여부를 결정한다.

### 돌연변이 상세

#### 가중치 돌연변이

```lua
function mutationPoidsConnexions(unReseau)
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            if math.random() < CHANCE_MUTATION_RESET_CONNEXION then
                -- 25%: 완전한 가중치 리셋
                unReseau.lesConnexions[i].poids = genererPoids()
            else
                -- 75%: ±0.80 변동
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

초기 가중치는 항상 1 또는 -1이다 (`genererPoids()`). ±0.80 변동으로 음수와 양수 값 사이에서 오갈 수 있어, 네트워크의 동작을 근본적으로 바꾼다.

#### 연결 추가

```lua
function mutationAjouterConnexion(unReseau)
    local liste = {}
    -- 뉴런 리스트 셔플
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
                -- 유효한 연결: 입력→출력, 은닉→은닉, 은닉→출력
                if (n1.type == "input" and n2.type == "output") or
                   (n1.type == "hidden" and n2.type == "hidden") or
                   (n1.type == "hidden" and n2.type == "output") then
                    -- 이미 연결이 없는지 확인
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

출력을 입력에 연결할 수 없다(순환 발생). 이미 연결된 두 뉴런도 연결할 수 없다. 셔플로 매번 다른 가능성이 탐색된다.

#### 뉴런 추가

가장 흥미로운 돌연변이:

```lua
function mutationAjouterNeurone(unReseau)
    if #unReseau.lesConnexions == 0 then return nil end
    if unReseau.nbNeurone == NB_NEURONE_MAX then return nil end

    -- 연결 셔플
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

            -- 은닉 뉴런 생성
            ajouterNeurone(unReseau, indice, "hidden", 1)

            -- 입력을 은닉 뉴런에 연결
            ajouterConnexion(unReseau,
                unReseau.lesConnexions[listeRandom[i]].entree,
                indice, genererPoids())

            -- 은닉 뉴런을 출력에 연결
            ajouterConnexion(unReseau,
                indice,
                unReseau.lesConnexions[listeRandom[i]].sortie,
                genererPoids())
            break
        end
    end
end
```

메커니즘: 기존 연결을 가져다가 **비활성화**하고 중간에 은닉 뉴런을 삽입한다. 원래 연결은 두 개의 새로운 연결로 대체된다: 입력→은닉, 은닉→출력. 배선을 잘라 스위치를 넣는 것과 같다.

이것이 NEAT를 "augmenting Topologies"로 만드는 것이다. 네트워크는 시간이 지남에 따라 **성장**한다. 단순하게 시작하고, 필요할 때만 복잡해진다.

### feedForward

네트워크를 통해 신호를 전파하는 함수:

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

각 활성 연결은 `입력값 × 가중치`를 출력 뉴런에 보낸다. 값은 **축적** (더하기)된다. `allume` 플래그는 시각적 네트워크 표시용이다.

### 게임 메모리 읽기

`getLesInputs()` 함수는 슈퍼 마리오 월드의 세계를 네트워크가 이해할 수 있는 데이터로 변환한다:

```lua
function getLesInputs()
    local lesInputs = {}
    -- 0으로 초기화 (회색 = 없음)
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            lesInputs[getIndiceLesInputs(i, j)] = 0
        end
    end

    -- 스프라이트 (적) = -1 (검정)
    local lesSprites = getLesSprites()
    for i = 1, #lesSprites, 1 do
        local input = convertirPositionPourInput(getLesSprites()[i])
        if input.x > 0 and input.x < (TAILLE_VUE_W / TAILLE_TILE) + 1 then
            lesInputs[getIndiceLesInputs(input.x, input.y)] = -1
        end
    end

    -- 타일 (블록) = 타일 값 (> 0이면 흰색)
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

입력 그리드는 마리오를 중심으로 한 시야: 11타일 너비, 9타일 높이. 각 타일의 값:
- **0** (회색): 없음
- **1** (흰색): 단단한 블록
- **-1** (검정): 적

적은 RAM의 두 목록에서 읽는다: 일반 스프라이트 (`0x14C8`-`0x14F8`)와 확장 스프라이트 (`0x170B`-`0x173B`). 생존한 스프라이트(상태 > 7)의 타일 위치를 마리오 기준으로 계산하고 해당 셀에 -1을 배치한다.

### 적합도: AI가 진행 상황을 인식하는 방법

```lua
function majReseau(unReseau, marioBase)
    local mario = getPositionMario()

    if not niveauFini and memory.readbyte(0x0100) == 12 then
        -- 레벨 완료!
        unReseau.fitness = FITNESS_LEVEL_FINI
        niveauFini = true
    elseif marioBase.x < mario.x then
        -- 마리오가 오른쪽으로 이동
        unReseau.fitness = unReseau.fitness + (mario.x - marioBase.x)
        marioBase.x = mario.x
    end

    -- 입력 업데이트
    local lesInputs = getLesInputs()
    for i = 1, NB_INPUT, 1 do
        unReseau.lesNeurones[i].valeur = lesInputs[i]
    end
end
```

적합도는 단순하다. **오른쪽으로 이동한 거리**다. 마리오가 10픽셀 이동하면 적합도가 10 증가한다. 마리오가 왼쪽으로 이동하면 아무 일도 일어나지 않는다(패널티 없음). 레벨이 완료되면(주소 `0x0100` == 12), 적합도가 1,000,000이 된다.

의도적으로 단순하다. 적을 죽이는 보너스도, 죽는 패널티도 없다. 그냥: 오른쪽으로 가라.

### 지능형 리셋

마리오가 33프레임 동안 움직이지 않으면, 레벨이 리셋되고 다음 개체로 넘어간다. 하지만 마리오가 진전을 보인 경우(현재 적합도가 시작과 다름), 300프레임을 기다린다 -- 네트워크가 "무엇이 옳았는지"를 "이해"할 기회를 준다.

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

조건 `memory.readbyte(0x0071) ~= 9`은 마리오가 죽음 애니메이션 중이 아님을 확인한다. 마리오가 이미 죽었다면 리셋할 이유가 없다.

### 메인 루프

루프는 30fps(슈퍼 마리오 월드의 일반 속도)로 실행된다:

```lua
while true do
    local fitnessAvant = laPopulation[idPopulation].fitness

    -- 표시 (네트워크, 정보)
    if forms.ischecked(estAccelere) then
        emu.limitframerate(false)  -- 가속
    else
        emu.limitframerate(true)   -- 30fps
    end

    -- 3가지 중요 함수
    majReseau(laPopulation[idPopulation], marioBase)
    feedForward(laPopulation[idPopulation])
    appliquerLesBoutons(laPopulation[idPopulation])

    emu.frameadvance()
    nbFrame = nbFrame + 1

    -- 진전 없이 리셋
    -- ...
    -- 모든 개체 테스트 후 새로운 세대
    -- ...
end
```

3가지 중요 함수는 `majReseau`, `feedForward`, `appliquerLesBoutons`이다. 하나라도 비활성화하면 마리오가 멈춘다.

### 크로스오버

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

아기는 더 나은 부모로부터 상속한다. 같은 혁신을 공유하는 각 연결에 대해, 다른 부모가 50% 확률로 대체할 수 있다 -- 하지만 **연결이 활성인 경우에만**. 이것은 중요한 수정이다. 그렇지 않으면 무의미한 은닉 뉴런이 생성될 수 있다.

### 종 선택

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

    -- 각 종은 평균 적합도에 비례하여 자손 수를 생성
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

아이디어: 평균 적합도가 10,000인 종은 평균 적합도가 1인 종보다 훨씬 많은 자손을 생성할 수 있다. 이것이 작동하는 **자연 선택**이다.

`choisirParent`는 룰렛 선택을 사용한다. 개체의 적합도가 높을수록, 부모로 선택될 확률이 높다.

### 저장과 로드

개체군은 `.pop` 파일에 저장된다:

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

저장에는 이전 개체군의 최고 개체도 포함된다. 이전 개체군의 최고가 새로운 것보다 나으면, 기반으로 이전 것으로 되돌린다. 이것은 **우생학**의 일종이다. 최고는 결코 잃어버리지 않는다.

### 네트워크 시각화

Laupok는 게임 위에 오버레이되는 신경망 비주얼라이저를 추가했다:

```lua
function dessinerUnReseau(unReseau)
    -- 입력: 마리오 주변 11×9 그리드
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

네트워크가 무엇을 하는지 이해하는 데 매우 유용하다. 활성 연결은 흰색, 비활성은 반투명. 입력은 흰/검/회색 셀의 그리드. 출력은 어떤 버튼이 눌렸는지 보여준다.

---

## 결과

### AI가 배운 것

수시간 (그리고 수일)의 실행 동안, AI는 혼자서 다음을 발견했다:

1. **오른쪽으로 이동**: 가장 기본적인 동작이지만, 오른쪽 버튼을 누르고 있어야 함
2. **적을 뛰어넘기**: "적 감지" 입력을 A 또는 B 버튼에 연결
3. **장애물 회피**: 일부 네트워크는 더 나아가기 위해 일시적으로 후퇴하는 것을 배움
4. **레벨 클리어**: 가장 좋은 개체는 슈퍼 마리오 월드의 첫 번째 레벨을 클리어할 수 있었다

![AI가 제어하는 마리오가 슈퍼 마리오 월드 레벨에서 부와 대치 -- 신경망이 실시간으로 행동을 결정](/images/laupok-mario-ai/mario-ai-playing.jpg)

### 한계

프로젝트에는 한계가 있다:

- **단일 레벨**: AI는 특정 레벨에서 훈련된다. 다른 레벨로 자동 일반화되지 않음
- **훈련 시간**: 만족스러운 결과를 얻는 데 수십 시간이 걸림
- **이해 없음**: AI는 자신이 하는 일을 "이해하지" 못한다. 무작위 돌연변이를 통해 적합도 함수(이동 거리)를 최적화할 뿐
- **T배깅**: Laupok는 마리오가 적을 보면 제자리에서 점프하는 경향이 있다고 지적한다. 적합도가 증가하기 때문이다 (점프 중에 조금 전진)

---

## 실험 재현 방법

Laupok는 모든 것을 공유했다. 단계는 다음과 같다:

1. **BizHawk 다운로드** [tasvideos.org](https://tasvideos.org/BizHawk)에서 (다운로드 섹션)
2. **슈퍼 마리오 월드 USA ROM 확보** (자신의 카트리지에서 복사)
3. **Lua 스크립트 다운로드** [Pastebin](https://pastebin.com/Jcvdqhqm)에서 -- `mario.lua`로 이름 변경
4. **스크립트를 ROM과 같은 폴더에 배치**
5. **BizHawk 시작**, ROM 열기
6. **Lua 콘솔에서**: `dofile("mario.lua")` 또는 Script > Open Script 메뉴를 통해
7. **레벨 시작에서 세이브 스테이트 생성** (Savestate > Save State 메뉴) `debut.state`로 이름 지정
8. **스크립트 재시작** -- 작동한다

스크립트에는 옵션이 있는 양식이 포함되어 있다:
- **가속**: 30fps 제한을 비활성화하여 더 빠르게
- **네트워크 표시**: 게임 위에 신경망을 표시
- **정보 표시**: 세대, 적합도, 종 수를 표시하는 배너
- **일시정지**: 실행 일시정지
- **저장/로드**: 현재 개체군을 `.pop` 파일에 저장

---

## 참고 자료

| 자료 | 링크 |
|------|------|
| Laupok 메인 영상 | [마리오를 혼자서 플레이하는 AI를 만들었다](https://www.youtube.com/watch?v=F63GNXGHVwM) |
| 코드 리뷰 + 설정 영상 | [AI 설정 방법 + 소스 코드 리뷰](https://www.youtube.com/watch?v=u5xCl1bSe6o) |
| 전체 소스 코드 | [Pastebin Jcvdqhqm](https://pastebin.com/Jcvdqhqm) |
| 원본 NEAT 논문 | Stanley & Miikkulainen, "Evolving Neural Networks through Augmenting Topologies", 2002 |
| N8Programs 튜토리얼 | [NEAT 구현 분석](https://n8programs.github.io/) (JavaScript이지만 개념은 동일) |
| 16blings (Laupok의 영감) | [AI가 슈퍼 마리오 월드를 플레이](https://www.youtube.com/watch?v=qv6IFaOz3bA) |
| BizHawk | [tasvideos.org/BizHawk](https://tasvideos.org/BizHawk) |
| 슈퍼 마리오 월드 메모리 | [SMW Central - RAM Map](https://www.smwcentral.net/?p=section&a=details&id=21702) |

---

## 결론

Laupok가 한 것은 학술적 알고리즘(NEAT, 2002)을 가져다가 에뮬레이터(BizHawk)용으로 Lua로 다시 작성하고 슈퍼 마리오 월드에 적용한 것이다. 결과: AI가 사전 지식 없이 무작위 돌연변이와 자연 선택만으로 게임 플레이 방법을 처음부터 배운다.

이것은 유전 알고리즘의 힘의 아름다운 예시다. 딥러닝도, GPU도, 수백만의 훈련 데이터도 없다. 자연 선택, Lua, 그리고 큰 인내만 있다.

코드는 주석이 달려 있고 공유되어 있으며, Laupok는 두 개의 설명 영상을 만들었다 -- 하나는 큰 개념용, 하나는 코드용. 이 주제에 관심이 있다면, 뛰어들어보라. 생각보다 더 접근하기 쉽다.
