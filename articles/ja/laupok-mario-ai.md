---
title: "Laupokが1人で遊ぶスーパーマリオワールドAIを作った。仕組みはこうだ"
description: "スーパーマリオワールドを自律プレイするLaupok製AIの解説。NEATアルゴリズム、BizHawk、4200行Luaスクリプトの完全ウォークスルー。"
date: 2026-07-11
tags:
  - ai
  - lua
  - emulation
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "nKyCoXAnlbO7xPcf79dtM9ps7SPpWSTIE4ZYj4oveJ+JsKzxknmFe63K7h9Cv5ARYZyWvNrbIjmytnN13NYp1g=="
---

# Laupokが1人で遊ぶスーパーマリオワールドAIを作った。仕組みはこうだ

Laupokは**スーパーマリオワールド**を完全自律で遊ぶ人工知能を作った。ゼロから始まる。定義済みスクリプトなし、記録フレームなしだ。AIはランダム変異と自然選択の力で1人で学んで、ゲームの面をクリアする。プロジェクトはマルチプラットエミュレータ**BizHawk**上で、約**4200行**のLuaスクリプト経由で回る。

このプロジェクトを魅惑的にするのは、情報学に応用した生物概念の上に立ってることだ。**ダーウィンの進化論**と**人工ニューラルネット**、そして**NEAT**（NeuroEvolution of Augmenting Topologies）って特定アルゴリズムだ。AIは最初ゲームを何も知らない。ランダムに行動を試して、何千回も失敗して、少しずつ前に進んで、跳んで、生き延びる方法を理解する。

この記事では全部ほどいていく。概念ごと、コード行ごとだ。

![カメラの前でNEATアルゴリズムを紹介するLaupok](/images/laupok-mario-ai/neat-title.jpg)

---

## セットアップ：BizHawkとLuaとスーパーマリオワールド

### BizHawkエミュレータ

BizHawkは大量の本体に対応するオープンソースエミュレータだ。NES、SNES、Genesis、PS1、Game Boy、その他いろいろだ。特徴はゲームと並行に**Luaスクリプト**を走らせられることだ。このスクリプトはエミュレーションの**RAM**にアクセスできる。つまりリアルタイムでゲームの任意データを読み書きできる。

具体的にはこうできる。
- 面内のマリオ位置を読む
- 画面にいるスプライト（敵、アイテム）を知る
- マリオ周辺の各タイル（ブロック）状態を知る
- コントローラーを操作する。任意ボタンを押せる

AIを遊ばせるのにまさに要るものだ。

### スーパーマリオワールドのメモリアドレス

スーパーマリオワールドのRAMでは各データが特定アドレスに保存される。街区みたいなものだ。各アドレスが情報を含む「家」に対応する。たとえばこうだ。

| アドレス | データ |
|---------|--------|
| `0x94`-`0x95` | マリオのX位置（16ビット、リトルエンディアン） |
| `0x96`-`0x97` | マリオのY位置 |
| `0x14C8`+`i` | スプライト`i`の状態（7超は生存） |
| `0xE4`+`i` | スプライト`i`の下位X位置 |
| `0x14E0`+`i` | スプライト`i`の上位X位置 |
| `0xD8`+`i` | スプライト`i`の下位Y位置 |
| `0x14D4`+`i` | スプライト`i`の上位Y位置 |
| `0x170B`+`i` | extendedスプライト`i`の種別 |
| `0x0100` | ゲーム状態（12は面クリア） |
| `0x13D4` | ポーズ中 |
| `0x0071` | マリオ死亡アニメ（9は死亡） |
| `0x1C800`+... | 面のタイルテーブル |

スプライト位置は2バイト使う。下位バイトと上位バイトだ。位置が255ピクセルを超えうるからね。式はつねに下位 + 上位 × 256だ。

タイルはもっと複雑だ。ベースアドレスは`0x1C800`で、世界内のタイル座標`x`と`y`からオフセットを計算する。タイルあたり16ピクセル刻みだ。

![スプライトのメモリアドレスとマリオ位置を示すデバッグオーバーレイ付きスーパーマリオワールド](/images/laupok-mario-ai/memory-debug.jpg)

---

## 基礎：遺伝アルゴリズムとニューラルネット

コードに潜る前に2つの根本概念を理解しなきゃいけない。これなしでは残りが無意味だ。

### 遺伝アルゴリズム

遺伝アルゴリズムは**進化論**のシミュレーションだ。中心発想：**集団**の個体を作って、各々少し違う特徴（「遺伝子」）を持つ。環境で「生き」させる。うまくやったものが生き残って繁殖する。ダメなものは消える。

Laupokは**カービィ**の例えで示す。
- トゲとトマトのある地形にカービィ集団が現れる
- トゲは体力を奪い、トマトは回復する
- 各カービィは遺伝子を持つ。大きさ、速さ、体力、挙動（逃げる、トマト探す、どこでも突っ込む）

![「赤ちゃん」「大きさ」「速さ」「色」のラベル付き二重らせんDNA。個体を構成する遺伝子](/images/laupok-mario-ai/dna-genes.jpg)

- 15秒後、誰がいちばん長く生き残ったか見る
- 最良カービィが他と繁殖する。赤ちゃんは最良の遺伝子半分と「最悪」の半分を受け継ぐ
- 赤ちゃんはランダム**変異**を受ける（ちょっと大きい、ちょっと速いなど）
- 古いカービィは新しいのに置き換わる
- 再開する

180世代後（約15時間）、カービィは生存15秒から**15分**になる。小さく（当たり判定縮小）、速く、常に危険から逃げるようになった。

![カービィシミュレーション世代0：黒背景にランダム散らばった色付き円、大きさは全部似てる](/images/laupok-mario-ai/kirby-gen0.jpg)

![カービィシミュレーション世代1866：カービィは小さく速く、危険から体系的に逃げる](/images/laupok-mario-ai/kirby-gen1866.jpg)

![カービィシミュレーション統計：fitness、体力数、性能順の各個体挙動](/images/laupok-mario-ai/kirby-stats.jpg)

重要な点：**解を定義しない**。アルゴリズムが**1人で見つける**。まさにそれが、どのパラメータ組み合わせが最適か分からない問題に強力なんだ。

### 人工ニューラルネット

ニューラルネットは人脳の単純化数学モデルだ。構成はこうだ。
- **入力ニューロン**（inputs）：ネットが「見る」もの
- **出力ニューロン**（outputs）：ネットが「決める」もの
- **接続**（重み）：各接続は信号を増幅か減衰する**重み**を持つ

仕組みは単純だ。各入力ニューロンが値を送る。接続重みで掛けられて、他の信号と足される。結果があるしきい値（**活性化関数**）を超えたら出力ニューロンが発火する。

マリオとネズミの切れ端のLaupokの例えではこうだ。
- 入力ニューロン = マリオと切れ端の距離
- 接続重み = マリオの敏感さ
- 出力ニューロン = マリオが叫ぶかどうか

切れ端が近いほど入力値は高い。重みが強ければ出力信号は強くて、マリオは叫ぶだろう。重みを変えればマリオの敏感さが変わる。

![「マリオが怖がる」デモ：Booに向き合うマリオと、入力と出力間の接続重みを示すシナプスバー](/images/laupok-mario-ai/mario-fear-demo.jpg)

AIの本物ニューラルネットでは同じ理屈だが、大規模だ。
- **99入力ニューロン**（マリオ視界11×9タイル）
- **8出力ニューロン**（A、B、X、Y、上、下、左、右）
- 間にある**隠れ**ニューロン（hidden）
- 重み様々の数百接続

---

## NEAT：全部変えるアルゴリズム

### 古典遺伝アルゴリズムの問題

遺伝アルゴリズムとニューラルネットを素朴に組み合わせると問題が出る。まったく違うニューラルネット100個を作って、比べ方が分からない。各々独自ニューロン、独自接続、独自重みだ。2つのネットが「近い」か「遠い」かどう知るのか。

ここで**NEAT**、NeuroEvolution of Augmenting Topologiesの出番だ。**Kenneth Stanley**と**Risto Miikkulainen**が2002年に発明した。この問題を正確に解くアルゴリズムだ。

### 種

NEATの最初の鍵仕組みは**種**だ。ニューラルネットが別のものと違いすぎると、違う種に分類される。類似度は3パラメータで計算する。

1. **Excess**（`EXCES_COEF = 0.50`）：2ネット間で無関係な接続数（違う innovation）
2. **Disjoint**：同じだが、真ん中にある接続について
3. **重み差**（`POIDSDIFF_COEF = 0.92`）：同じ innovation を共有する接続間の平均重み差

スコア式：

```
score = (EXCES_COEF × disjoint) / max(nbConnexions1 + nbConnexions2, 1)
      + POIDSDIFF_COEF × diffPoids
```

このスコアが`DIFF_LIMITE`（1.0）未満なら2ネットは同じ種だ。そうじゃなければ新種を作る。

### innovation

NEATの天才的なところだ。接続が作られるたび、グローバルに一意な**innovation**番号を受ける。この番号は繁殖してもニューラルネットに付いてくる。

具体的には、交叉で赤ちゃんが作られるとき両親の innovation を受け継ぐ。2ネットが同じ innovation を共有したら、同じ祖先由来の接続があるってことだ。大きさの違うネットを比べられるのはこれのおかげだ。

### 交叉

2つのニューラルネットが繁殖するとき、**交叉**はこう動く。

![「CROSSOVER」テキストのオーバーレイで交叉概念を説明するLaupok](/images/laupok-mario-ai/crossover-label.jpg)

1. 高性能なネットが「優性親」になる
2. 赤ちゃんは優性の全接続を受け継ぐ
3. 同じ innovation を共有する各接続について、もう片方の親が置き換えうる（50パーセント）
4. 非優性親の活性接続だけが置き換えられる

赤ちゃんが最良親と少なくとも同等なことが保証される。

### 変異

交叉後、赤ちゃんは設定可能確率で変異を受ける。

![「（小変更 = 変異）」テキストのオーバーレイで変異を説明するLaupok](/images/laupok-mario-ai/mutation-label.jpg)

| 変異 | 確率 | 効果 |
|----------|------------|-------|
| 接続重みリセット | 25% | 重みは完全ランダム化 |
| 重み変異 | 95% | 重みはプラスマイナス0.80変動 |
| 接続追加 | 85% | 未接続2ニューロン間の新規接続 |
| ニューロン追加 | 39% | 接続済み2ニューロン間に隠れニューロン挿入 |

ニューロン追加率が大事だ。ネットが**育つ**のを許す。最初は入出力だけだ。少しずつ隠れニューロンが現れて、ネットはますます複雑になる。

---

## コード：完全ウォークスルー

### 定数

スクリプトは全部のパラメータを定義する定数ブロックから始まる。

```lua
-- マリオ周辺の視界
TAILLE_TILE = 16
TAILLE_VUE_W = TAILLE_TILE * 11  -- 幅176ピクセル
TAILLE_VUE_H = TAILLE_TILE * 9   -- 高さ144ピクセル
NB_TILE_W = TAILLE_VUE_W / TAILLE_TILE  -- 11タイル
NB_TILE_H = TAILLE_VUE_H / TAILLE_TILE  -- 9タイル

-- ニューラルネット
NB_INPUT = NB_TILE_W * NB_TILE_H  -- 99入力（見えるタイル）
NB_OUTPUT = 8  -- A、B、X、Y、上、下、左、右
NB_INDIVIDU_POPULATION = 100  -- 集団あたり個体数
NB_NEURONE_MAX = 100000  -- 隠れニューロン上限

-- Fitness
FITNESS_LEVEL_FINI = 1000000  -- 面終了時の値
NB_FRAME_RESET_BASE = 33  -- 進歩なしリセットまでのフレーム
NB_FRAME_RESET_PROGRES = 300  -- 進歩検出時のフレーム

-- 種
EXCES_COEF = 0.50
POIDSDIFF_COEF = 0.92
DIFF_LIMITE = 1.00

-- 変異
CHANCE_MUTATION_RESET_CONNEXION = 0.25
POIDS_CONNEXION_MUTATION_AJOUT = 0.80
CHANCE_MUTATION_POIDS = 0.95
CHANCE_MUTATION_CONNEXION = 0.85
CHANCE_MUTATION_NEURONE = 0.39
```

`NB_INPUT`が99なのはマリオ視界が11×9タイルだからだ。各タイルが入力ニューロン1つだ。タイルが空なら0だ。ブロックなら1だ。敵なら-1だ。

8出力はSNESコントローラーのボタンに対応する。A、B、X、Y、上、下、左、右だ。決定を要点に絞るためStart、Select、L、Rは除く。

### データ構造

スクリプトは3つの主要構造を定義する。

```lua
function newNeurone()
    local neurone = {}
    neurone.valeur = 0    -- ニューロンの現在値
    neurone.id = 0        -- 一意ID
    neurone.type = ""     -- 「input」「output」「hidden」
    return neurone
end

function newConnexion()
    local connexion = {}
    connexion.entree = 0     -- ソースニューロンID
    connexion.sortie = 0     -- 宛先ニューロンID
    connexion.actif = true   -- 隠れニューロン挿入で無効化されうる
    connexion.poids = 0      -- 接続重み
    connexion.innovation = 0 -- 一意innovation番号
    connexion.allume = false -- 表示用：信号通過でtrue
    return connexion
end

function newReseau()
    local reseau = {
        nbNeurone = 0,        -- 隠れニューロン数
        fitness = 1,          -- 性能（進んだ距離）
        idEspeceParent = 0,   -- どの種に属するか
        lesNeurones = {},     -- ニューロンテーブル
        lesConnexions = {}    -- 接続テーブル
    }
    -- 入力で初期化
    for j = 1, NB_INPUT, 1 do
        ajouterNeurone(reseau, j, "input", 1)
    end
    -- 次に出力
    for j = NB_INPUT + 1, NB_INPUT + NB_OUTPUT, 1 do
        ajouterNeurone(reseau, j, "output", 0)
    end
    return reseau
end
```

最初、各ネットは入出力だけを含む。隠れニューロンなし、接続なしだ。要るかどうかはアルゴリズムが決める。

### 変異の詳細

#### 重み変異

```lua
function mutationPoidsConnexions(unReseau)
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            if math.random() < CHANCE_MUTATION_RESET_CONNEXION then
                -- 25%：重みの完全リセット
                unReseau.lesConnexions[i].poids = genererPoids()
            else
                -- 75%：プラスマイナス0.80の変動
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

初期重みはつねに1か-1だ（`genererPoids()`）。プラスマイナス0.80の変動で負値と正値の間を揺れて、ネット挙動が根本から変わりうる。

#### 接続追加

```lua
function mutationAjouterConnexion(unReseau)
    local liste = {}
    -- ニューロン一覧のランダム化
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
                -- 有効接続：inputからoutput、hiddenからhidden、hiddenからoutput
                if (n1.type == "input" and n2.type == "output") or
                   (n1.type == "hidden" and n2.type == "hidden") or
                   (n1.type == "hidden" and n2.type == "output") then
                    -- 接続済みでないか確認
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

outputからinputには繋げない（輪を作る）。繋がってる2ニューロンも繋げない。ランダム化で毎回違う可能性を探ることが保証される。

#### ニューロン追加

いちばん面白い変異だ。

```lua
function mutationAjouterNeurone(unReseau)
    if #unReseau.lesConnexions == 0 then return nil end
    if unReseau.nbNeurone == NB_NEURONE_MAX then return nil end

    -- 接続のランダム化
    local listeRandom = {}
    for i = 1, #unReseau.lesConnexions, 1 do
        local pos = math.random(1, #listeRandom+1)
        table.insert(listeRandom, pos, i)
    end

    for i = 1, #listeRandom, 1 do
        if unReseau.lesConnexions[listeRandom[i]].actif then
            -- 既存接続を無効化
            unReseau.lesConnexions[listeRandom[i]].actif = false
            unReseau.nbNeurone = unReseau.nbNeurone + 1
            local indice = unReseau.nbNeurone + NB_INPUT + NB_OUTPUT

            -- 隠れニューロンを作る
            ajouterNeurone(unReseau, indice, "hidden", 1)

            -- 入力を隠れニューロンへ接続
            ajouterConnexion(unReseau,
                unReseau.lesConnexions[listeRandom[i]].entree,
                indice, genererPoids())

            -- 隠れニューロンを出力へ接続
            ajouterConnexion(unReseau,
                indice,
                unReseau.lesConnexions[listeRandom[i]].sortie,
                genererPoids())
            break
        end
    end
end
```

仕組み：既存接続を1つ取って**無効化**して、真ん中に隠れニューロンを挿入する。元の接続は2つの新接続に置き換わる。入力から隠れへと隠れから出力へだ。電線を切って間にスイッチを挟むみたいなものだ。

これがNEATの「augmenting topologies」を作る。ネットは時間とともに**育つ**。単純に始まって、必要なら複雑になるだけだ。

### feedForward

信号をネットに伝える関数だ。

```lua
function feedForward(unReseau)
    -- 出力ニューロンのリセット
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur = 0
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].allume = false
        end
    end

    -- 伝播
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

各活性接続は出力ニューロンへ`入力値 × 重み`を送る。値は**累積**（加算）される。`allume`フラグはネットの視覚表示用だ。

### ゲームメモリの読み取り

`getLesInputs()`関数はスーパーマリオワールド世界をネットが分かるデータに翻訳する。

```lua
function getLesInputs()
    local lesInputs = {}
    -- 0で初期化（灰は無）
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            lesInputs[getIndiceLesInputs(i, j)] = 0
        end
    end

    -- スプライト（敵）= -1（黒）
    local lesSprites = getLesSprites()
    for i = 1, #lesSprites, 1 do
        local input = convertirPositionPourInput(getLesSprites()[i])
        if input.x > 0 and input.x < (TAILLE_VUE_W / TAILLE_TILE) + 1 then
            lesInputs[getIndiceLesInputs(input.x, input.y)] = -1
        end
    end

    -- タイル（ブロック）= タイル値（0超で白）
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

入力グリッドはマリオ中心の視界だ。幅11タイル、高さ9だ。各タイルはこうだ。
- **0**（灰）：無
- **1**（白）：固体ブロック
- **-1**（黒）：敵

敵はRAM内2リストから読む。通常スプライト（`0x14C8`-`0x14F8`）とextendedスプライト（`0x170B`-`0x173B`）だ。各生存スプライト（状態7超）について、マリオ相対のタイル位置を計算して対応マスに-1を置く。

### fitness：AIが進歩を知る方法

```lua
function majReseau(unReseau, marioBase)
    local mario = getPositionMario()

    if not niveauFini and memory.readbyte(0x0100) == 12 then
        -- 面終了！
        unReseau.fitness = FITNESS_LEVEL_FINI
        niveauFini = true
    elseif marioBase.x < mario.x then
        -- マリオが右へ進む
        unReseau.fitness = unReseau.fitness + (mario.x - marioBase.x)
        marioBase.x = mario.x
    end

    -- 入力の更新
    local lesInputs = getLesInputs()
    for i = 1, NB_INPUT, 1 do
        unReseau.lesNeurones[i].valeur = lesInputs[i]
    end
end
```

fitnessは単純だ。**右へ進んだ距離**だ。マリオが10ピクセル進めばfitnessは10増える。マリオが戻っても何も起きない（罰なし）。面終了（アドレス`0x0100`が12）でfitnessは1,000,000になる。

わざと単純だ。数えるのは右への進行だけだ。敵を倒しても点なし、死んでも損なしだ。

### 賢いリセット

マリオが33フレーム動かなければ面をリセットして次の個体に行く。でもマリオが進歩してたら（現fitnessが開始時と違う）、300フレーム待つ。ネットが「うまくいったことを理解」する機会を与える。

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

`memory.readbyte(0x0071) ~= 9`条件はマリオが死亡アニメ中か確認する。マリオがすでに死亡アニメならリセットは無駄だ。

### メインループ

ループは30fpsで回る（スーパーマリオワールドの通常速度）。

```lua
while true do
    local fitnessAvant = laPopulation[idPopulation].fitness

    -- 表示（ネット、情報）
    if forms.ischecked(estAccelere) then
        emu.limitframerate(false)  -- 高速化
    else
        emu.limitframerate(true)   -- 30fps
    end

    -- 3つの生命線関数
    majReseau(laPopulation[idPopulation], marioBase)
    feedForward(laPopulation[idPopulation])
    appliquerLesBoutons(laPopulation[idPopulation])

    emu.frameadvance()
    nbFrame = nbFrame + 1

    -- 進歩なければリセット
    -- ...
    -- 全個体試験で新世代
    -- ...
end
```

3つの生命線関数は`majReseau`、`feedForward`、`appliquerLesBoutons`だ。1つ切るだけでマリオは動かなくなる。

### 交叉

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

赤ちゃんは最良親を受け継ぐ。同じ innovation を共有する各接続について、もう片方の親が50パーセントで置き換える。**ただし接続が活性の場合だけ**だ。大事な修正だ。これなしでは無駄な隠れニューロンが作られうる。

### 種による選択

```lua
function nouvelleGeneration(laPopulation, lesEspeces)
    local laNouvellePopulation = newPopulation()
    local nbIndividuACreer = NB_INDIVIDU_POPULATION

    -- 種ごとの平均fitness計算
    for i = 1, #lesEspeces, 1 do
        lesEspeces[i].fitnessMoyenne = 0
        for j = 1, #lesEspeces[i].lesReseaux, 1 do
            lesEspeces[i].fitnessMoyenne =
                lesEspeces[i].fitnessMoyenne + lesEspeces[i].lesReseaux[j].fitness
        end
        lesEspeces[i].fitnessMoyenne =
            lesEspeces[i].fitnessMoyenne / #lesEspeces[i].lesReseaux
    end

    -- 各種は平均fitness比例の子数を作る
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

考え方：平均fitness 10,000の種は平均1の種よりずっと多くの子を作る権利がある。行動中の**自然選択**だ。

`choisirParent`はルーレット選択を使う。fitnessが高い個体ほど親に選ばれやすい。

### 保存と読み込み

集団は`.pop`ファイルに保存される。

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

保存は過去全集団の最良個体も含む。旧集団の最良が新集団の最良より良ければ、旧を土台に取り戻す。**エリート主義**の一形態だ。最良は絶対失わない。

### ネットの描画

Laupokはゲーム上に重ねるニューラルネット可視化を足した。

```lua
function dessinerUnReseau(unReseau)
    -- 入力：マリオ周辺11×9グリッド
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            local xT = ENCRAGE_X_INPUT + (i - 1) * TAILLE_INPUT
            local yT = ENCRAGE_Y_INPUT + (j - 1) * TAILLE_INPUT
            local couleurFond = "gray"
            if unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur < 0 then
                couleurFond = "black"   -- 敵
            elseif unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur > 0 then
                couleurFond = "white"   -- ブロック
            end
            gui.drawRectangle(xT, yT, TAILLE_INPUT, TAILLE_INPUT, "black", couleurFond)
        end
    end

    -- 出力：8ボタン
    for i = 1, NB_OUTPUT, 1 do
        local xT = ENCRAGE_X_OUTPUT
        local yT = ENCRAGE_Y_OUTPUT + ESPACE_Y_OUTPUT * (i - 1)
        if sigmoid(unReseau.lesNeurones[i + NB_INPUT].valeur) then
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "white")
        else
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "black")
        end
    end

    -- 接続
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

ネットが何してるか理解するのに超便利だ。活性接続は白、不活性は半透明だ。入力は白黒灰マスのグリッドだ。出力はどのボタンが押されてるか示す。

---

## 結果

### AIが学んだこと

何時間も（何日も）回すうちに、AIは1人で発見した。

1. **右へ進む**：いちばん基本的挙動だが、右ボタン押しっぱなしが必要だ
2. **敵を飛び越える**：「敵検出」入力をAかBボタンに繋いで
3. **障害物を避ける**：一部のネットはもっと先へ進むため一時後退を学んだ
4. **面を終える**：最良個体はスーパーマリオワールド1面を終えられた

![スーパーマリオワールドの面でBooに向き合うAI操作マリオ。ニューラルネットがリアルタイムで行動決定](/images/laupok-mario-ai/mario-ai-playing.jpg)

### 限界

プロジェクトには限界がある。

- **1面だけ**：AIは特定1面で訓練される。他面に自動一般化しない
- **訓練時間**：満足いく結果に数十時間要る
- **理解なし**：AIはやってることを「分かって」ない。fitness関数（進んだ距離）をランダム変異で最適化してる
- **屈伸煽り**：敵を見るとマリオはその場跳びしがちだとLaupokは記す。跳ぶと少し進んでfitnessが上がるからだ

---

## 実験を再現する方法

Laupokは全部共有した。手順はこうだ。

1. **BizHawkを落とす**。[tasvideos.org](https://tasvideos.org/BizHawk)から（Download節）
2. **スーパーマリオワールドのUSA ROMを入手する**（自分のカートリッジの私的コピー）
3. **Luaスクリプトを落とす**。[Pastebin](https://pastebin.com/Jcvdqhqm)から。`mario.lua`に改名する
4. **ROMと同じフォルダにスクリプトを置く**
5. **BizHawkを起動**してROMを開く
6. **Luaコンソールで**：`dofile("mario.lua")`かメニューScript > Open Scriptから
7. 面頭で**stateを保存**する（メニューSavestate > Save State）。`debut.state`と名付ける
8. **スクリプトを再起動**する。動く

スクリプトは選択肢付きフォームを含む。
- **高速化**：30fps制限を外して速く進める
- **ネット表示**：ニューラルネットを重ねて見せる
- **情報表示**：世代、fitness、種数の帯を表示する
- **Pause**：実行を止める
- **保存や読み込み**：現集団を`.pop`ファイルに永続化する

---

## 出典と参照

| リソース | リンク |
|-----------|------|
| Laupokのメイン動画 | [j'ai créé une IA qui joue à mario toute seule](https://www.youtube.com/watch?v=F63GNXGHVwM) |
| コードレビューとsetup動画 | [comment setup l'ia + code source review](https://www.youtube.com/watch?v=u5xCl1bSe6o) |
| 完全ソース | [Pastebin Jcvdqhqm](https://pastebin.com/Jcvdqhqm) |
| NEAT原論文 | Stanley & Miikkulainen, "Evolving Neural Networks through Augmenting Topologies", 2002 |
| N8Programsのチュートリアル | [NEAT implementation walkthrough](https://n8programs.github.io/)（JavaScriptだが概念は同一） |
| 16blings（Laupokの着想元） | [AI plays Super Mario World](https://www.youtube.com/watch?v=qv6IFaOz3bA) |
| BizHawk | [tasvideos.org/BizHawk](https://tasvideos.org/BizHawk) |
| スーパーマリオワールドのメモリ | [SMW Central - RAM Map](https://www.smwcentral.net/?p=section&a=details&id=21702) |

---

## 結論

Laupokがやったのは、学術アルゴリズム（NEAT、2002年）を取って、エミュレータ（BizHawk）用にLuaで書き直して、スーパーマリオワールドに適用したことだ。結果：事前知識ゼロで1人でゲームを遊ぶことを学ぶAIだ。ランダム変異と自然選択だけだ。

遺伝アルゴリズムの力の見事な例だ。レシピは3材料だ。自然選択、少しのLua、大量の忍耐だ。ディープラーニングなし、GPUなし、大量訓練データなしだ。

コードはコメント付きで共有されて、Laupokは2つの解説動画を作った。1つは大概念用、1つはコード用だ。興味が出たら潜って。見た目より取っ付きやすいよ。
