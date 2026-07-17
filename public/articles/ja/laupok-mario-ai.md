---
title: "Laupokが作ったスーパーマリオワールドを一人でプレイするAI――その仕組み"
description: "Laupokのプロジェクトの詳細: NEATベースのAIがスーパーマリオワールドを自律的にプレイする方法。遺伝的アルゴリズム、ニューラルネットワーク、拡張トポロジーのニューロ進化、そして4200行のLua。"
date: 2026-07-11
authors:
  - fox3000foxy
tags:
  - ai
  - lua
  - emulation
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "mnuPisopdLEjUz42T48YCBr5pVmWYxSTU9tBXh/jQMz1lefHMEzW27I9GzlVIS9tzzaW5OS8r5r+okSKLzGGgw=="
---

# Laupokが作ったスーパーマリオワールドを一人でプレイするAI――その仕組み

Laupokは**スーパーマリオワールド**を完全に自律的にプレイする人工知能を作った。事前定義された入力も、記録されたフレームもない。AIは独学で、ランダムな突然変異と自然選択を通じて、ゲームのステージをクリアする方法を学ぶ。プロジェクトは**BizHawk**というマルチプラットフォームエミュレーター上で、約**4200行**のLuaスクリプトで動作する。

このプロジェクトを興味深いものにしているのは、計算機科学に適用された生物学的概念に基づいている点だ。ダーウィンの**進化論**、**人工ニューラルネットワーク**、そして最も重要な**NEAT**（NeuroEvolution of Augmenting Topologies）という特定のアルゴリズムだ。AIは最初、ゲームについて何も知らない。ランダムなことを試み、何千回も失敗し、徐々に動き方、ジャンプ方法、生き残り方を学んでいく。

この記事では、概念ごと、コードの行ごとに詳しく説明していく。

![Laupokがカメラ前でNEATアルゴリズムを紹介](/images/laupok-mario-ai/neat-title.jpg)

---

## セットアップ: BizHawk、Lua、スーパーマリオワールド

### BizHawkエミュレーター

BizHawkはオープンソースのエミュレーターで、多数のコンソールをサポートしている――NES、SNES、Genesis、PS1、Game Boyなど。その主要な機能は、ゲームと一緒に**Luaスクリプト**を実行できることだ。これらのスクリプトはエミュレーションの**RAM**（ランダムアクセスメモリ）にアクセスでき、つまりゲームデータをリアルタイムで読み取り――および変更――できる。

具体的に、これができる：
- レベル内のマリオの位置を読む
- 画面内のスプライト（敵、アイテム）を把握する
- マリオの周囲のすべてのタイル（ブロック）の状態を知る
- コントローラーを操作する――任意のボタンを押す

これこそが、AIにプレイさせるために必要なものだ。

### スーパーマリオワールドのメモリアドレス

スーパーマリオワールドのRAMでは、すべてのデータが特定のアドレスに保存される。neighborhood（近隣）のようなもので、各アドレスは1つの情報を含む「家」に対応する。例：

| アドレス | データ |
|---------|--------|
| `0x94`-`0x95` | マリオのX座標（16ビット、リトルエンディアン） |
| `0x96`-`0x97` | マリオのY座標 |
| `0x14C8`+`i` | スプライト`i`の状態（>7 = 生存） |
| `0xE4`+`i` | スプライト`i`の下位X座標 |
| `0x14E0`+`i` | スプライト`i`の上位X座標 |
| `0xD8`+`i` | スプライト`i`の下位Y座標 |
| `0x14D4`+`i` | スプライト`i`の上位Y座標 |
| `0x170B`+`i` | 拡張スプライト`i`のタイプ |
| `0x0100` | ゲーム状態（12 = ステージクリア） |
| `0x13D4` | ポーズ中 |
| `0x0071` | マリオの死亡アニメーション（9 = 死亡） |
| `0x1C800`+... | ステージタイルテーブル |

スプライトの座標は2バイトを使う。「下位」バイトと「上位」バイトだ。座標が255ピクセルを超える可能性があるからだ。式は常に `下位 + 上位 × 256` だ。

タイルの場合はより複雑で、ベースアドレスは`0x1C800`で、タイルの`x`と`y`座標に基づいてオフセットを計算する。1タイルあたり16ピクセルのステップだ。

![デバッグオーバーレイ付きのスーパーマリオワールド。スプライトのメモリアドレスとマリオの位置を表示](/images/laupok-mario-ai/memory-debug.jpg)

---

## 基本: 遺伝的アルゴリズムとニューラルネットワーク

コードを深掘りする前に、2つの基本概念を理解する必要がある。これがなければ、他のすべてが意味をなさない。

### 遺伝的アルゴリズム

遺伝的アルゴリズムは**進化論**のシミュレーションだ。核心のアイデア：わずかに異なる特性（「遺伝子」）を持つ**個体群**を作成し、それらを環境に「生かす」。最も適応した個体は生き残り、繁殖する。適応しない個体は淘汰される。

Laupokはこれを**カービィ**のアナロジーで説明する：
- カービィの個体群がトゲとトマトのある地形に現れる
- トゲはHPを減らし、トマトは回復する
- 各カービィには遺伝子がある：サイズ、速度、HP、行動（逃げる、トマトを探す、盲目で走る）

![DNA二重らせんに「the baby」「size」「speed」「color」のラベル -- 個体を構成する遺伝子](/images/laupok-mario-ai/dna-genes.jpg)

- 15秒後、誰が最も長く生き残ったかを確認する
- 最高のカービィが他のカービィと交配：赤ちゃんは最高の遺伝子の半分と最悪の遺伝子の半分を継承する
- 赤ちゃんはランダムな**突然変異**を受ける（少し大きく、少し速く...）
- 古いカービィは新しいものに置き換えられる
- 再開する

180世代（約15時間）後、カービィは15秒の生存から**15分**に成長した。小さくなり（ヒットボックスが縮小）、速くなり、常に危険から逃げるようになった。

![カービィシミュレーション第0世代：黒い背景にランダムに配置された色付きの円。すべて同じサイズ](/images/laupok-mario-ai/kirby-gen0.jpg)

![カービィシミュレーション第1866世代：カービィはより小さく、速くなり、系統的に危険から逃げる](/images/laupok-mario-ai/kirby-gen1866.jpg)

![カービィシミュレーション統計：フィットネス、HP、各個体の行動がパフォーマンス順にランキング](/images/laupok-mario-ai/kirby-stats.jpg)

重要な点は、**解決策を定義しない**ことだ。アルゴリズムは**自力で見つける**。これが最適なパラメータの組み合わせがわからない問題において強力な所以だ。

### 人工ニューラルネットワーク

ニューラルネットワークは人間の脳の簡略化された数学的モデルだ。以下で構成される：
- **入力ニューロン**：ネットワークが「見る」もの
- **出力ニューロン**：ネットワークが「決める」もの
- **接続（重み）**：各接続には信号を増幅または減衰する**重み**がある

 principleはシンプルだ。各入力ニューロンは値を送信する。接続重みで乗算され、他の信号に加算される。結果があるしきい値（**活性化関数**）を超えると、出力ニューロンが発火する。

Laupokのマリオとマウスカーソルのアナロジーでは：
- 入力ニューロン = マリオとカーソルの距離
- 接続重み = マリオの感度
- 出力ニューロン = マリオが叫ぶかどうか

カーソルが近いほど、入力値が高くなる。重みが強ければ、出力信号も強く、マリオは叫ぶだろう。重みを変えることで、マリオの感度を変えることができる。

![「マリオは怖い」デモ：マリオがブーと対峙し、入力と出力の接続重みを示すシナプスバーがある](/images/laupok-mario-ai/mario-fear-demo.jpg)

実際のAIのニューラルネットワークでは、同じロジックだが大規模になる：
- **99個の入力ニューロン**（マリオの視界の11×9タイル）
- **8個の出力ニューロン**（A、B、X、Y、上、下、左、右）
- その間の**隠れニューロン**
- 異なる重みを持つ数百の接続

---

## NEAT: すべてを変えるアルゴリズム

### 基本的な遺伝的アルゴリズムの問題

遺伝的アルゴリズムをニューラルネットワークと素直に組み合わせると、問題がある。100個の全く異なるニューラルネットワークを作成し、比較できないからだ。各ネットワークには独自のニューロン、接続、重みがある。2つのネットワークが「似ている」のか「異なる」のか、どうやって判断するか？

ここで**NEAT**が登場する――NeuroEvolution of Augmenting Topologies。**Kenneth Stanley**と**Risto Miikkulainen**が2002年に発明し、この問題を正確に解決する。

### 種

NEATの最初の鍵となるメカニズムは**種**だ。ニューラルネットワークが他のネットワークとあまりに異なる場合、異なる種に分類される。類似性は3つのパラメータで計算される：

1. **過剰**（`EXCES_COEF = 0.50`）：2つのネットワークで共通点のない接続の数（異なるイノベーション）
2. **不連続**：同じだが、中間の接続について
3. **重みの差**（`POIDSDIFF_COEF = 0.92`）：同じイノベーションを共有する接続間の平均重み差

スコアの式：

```
スコア = (EXCES_COEF × 不連続) / max(接続数1 + 接続数2, 1)
       + POIDSDIFF_COEF × 重み差
```

このスコアが`DIFF_LIMITE`（1.0）を下回ると、2つのネットワークは同じ種になる。そうでなければ、新しい種が作成される。

### イノベーション

これがNEATの天才だ。接続が作成されるたびに、ユニークでグローバルな**イノベーション番号**が割り当てられる。この番号はニューラルネットワークが繁殖した後も追随する。

具体的には、交差によって赤ちゃんが作成されると、親のイノベーションを継承する。2つのネットワークが同じイノベーションを共有している場合、同じ祖先からの接続があることを意味する。これが異なるサイズのネットワークを比較可能にするものだ。

### 交差（クロスオーバー）

2つのニューラルネットワークが繁殖するとき、**クロスオーバー**は以下のように機能する：

![Laupokが「CROSSOVER」のテキストをオーバーレイしてクロスオーバーの概念を説明](/images/laupok-mario-ai/crossover-label.jpg)

1. 成績の良いネットワークが「優性親」となる
2. 赤ちゃんは優性親のすべての接続を継承する
3. 同じイノベーションを共有する各接続について、もう一方の親が置き換えることができる（50%の確率）
4. 非優性親のアクティブな接続のみが置き換え可能

これにより、赤ちゃんは常に最善の親と同等か、それ以上であることが保証される。

### 突然変異

交差後、赤ちゃんは設定可能な確率で突然変異を受ける：

![Laupokが「(small modif = mutation)」のテキストをオーバーレイして突然変異を説明](/images/laupok-mario-ai/mutation-label.jpg)

| 突然変異 | 確率 | 効果 |
|----------|------|------|
| 接続重みのリセット | 25% | 重みが完全にランダム化される |
| 重みの突然変異 | 95% | 重みが±0.80変動する |
| 接続の追加 | 85% | 未接続の2つのニューロン間に新しい接続 |
| ニューロンの追加 | 39% | 2つの接続されたニューロン間に隠れニューロンが挿入される |

ニューロン追加率が重要だ。これがネットワークを**成長**させるものだ。最初は入力と出力のみ。徐々に隠れニューロンが現れ、ネットワークはより複雑になっていく。

---

## コード: 完全なウォークスルー

### 定数

スクリプトはすべての設定を定義する定数ブロックから始まる：

```lua
-- マリオの周囲の視界
TAILLE_TILE = 16
TAILLE_VUE_W = TAILLE_TILE * 11  -- 176ピクセル幅
TAILLE_VUE_H = TAILLE_TILE * 9   -- 144ピクセル高
NB_TILE_W = TAILLE_VUE_W / TAILLE_TILE  -- 11タイル
NB_TILE_H = TAILLE_VUE_H / TAILLE_TILE  -- 9タイル

-- ニューラルネットワーク
NB_INPUT = NB_TILE_W * NB_TILE_H  -- 99入力（可见タイル）
NB_OUTPUT = 8  -- A, B, X, Y, 上, 下, 左, 右
NB_INDIVIDU_POPULATION = 100  -- 個体群あたりの個体数
NB_NEURONE_MAX = 100000  -- 最大隠れニューロン数

-- フィットネス
FITNESS_LEVEL_FINI = 1000000  -- ステージクリア時の値
NB_FRAME_RESET_BASE = 33  -- 進展なしのフレーム数（リセット前）
NB_FRAME_RESET_PROGRES = 300  -- 進展検出時のフレーム数

-- 種
EXCES_COEF = 0.50
POIDSDIFF_COEF = 0.92
DIFF_LIMITE = 1.00

-- 突然変異
CHANCE_MUTATION_RESET_CONNEXION = 0.25
POIDS_CONNEXION_MUTATION_AJOUT = 0.80
CHANCE_MUTATION_POIDS = 0.95
CHANCE_MUTATION_CONNEXION = 0.85
CHANCE_MUTATION_NEURONE = 0.39
```

`NB_INPUT`が99なのは、マリオの視界が11×9タイルだからだ。各タイルが1つの入力ニューロン。空タイル = 0、ブロック = 1、敵 = -1。

8つの出力はSNESコントローラーのボタンに対応する：A、B、X、Y、上、下、左、右。Start、Select、L、Rは除外され、マリオを「邪魔」しないようにしている。

### データ構造

スクリプトは3つの主要な構造を定義する：

```lua
function newNeurone()
    local neurone = {}
    neurone.valeur = 0    -- 現在のニューロン値
    neurone.id = 0        -- ユニークな識別子
    neurone.type = ""     -- "input", "output", または "hidden"
    return neurone
end

function newConnexion()
    local connexion = {}
    connexion.entree = 0     -- ソースニューロンID
    connexion.sortie = 0     -- デスティネーションニューロンID
    connexion.actif = true   -- 隠れニューロン挿入時に無効化可能
    connexion.poids = 0      -- 接続重み
    connexion.innovation = 0 -- ユニークなイノベーション番号
    connexion.allume = false -- 表示用：信号通過時にtrue
    return connexion
end

function newReseau()
    local reseau = {
        nbNeurone = 0,        -- 隠れニューロン数
        fitness = 1,          -- パフォーマンス（移動距離）
        idEspeceParent = 0,   -- 所属する種
        lesNeurones = {},     -- ニューロン配列
        lesConnexions = {}    -- 接続配列
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

最初は各ネットワークに入力と出力のみ。隠れニューロンも接続もない。アルゴリズムが必要かどうかを判断する。

### 突然変異の詳細

#### 重みの突然変異

```lua
function mutationPoidsConnexions(unReseau)
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            if math.random() < CHANCE_MUTATION_RESET_CONNEXION then
                -- 25%：完全な重みリセット
                unReseau.lesConnexions[i].poids = genererPoids()
            else
                -- 75%：±0.80の変動
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

初期重みは常に1または-1（`genererPoids()`）。±0.80の変動により、負から正の値に振れ、ネットワークの動作をradicalに変える。

#### 接続の追加

```lua
function mutationAjouterConnexion(unReseau)
    local liste = {}
    -- ニューロンリストをシャッフル
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
                -- 有効な接続：入力→出力、隠れ→隠れ、隠れ→出力
                if (n1.type == "input" and n2.type == "output") or
                   (n1.type == "hidden" and n2.type == "hidden") or
                   (n1.type == "hidden" and n2.type == "output") then
                    -- 既に接続がないか確認
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

出力を入力に接続することはできない（サイクルが生じる）。また、既に接続された2つのニューロンを接続することもできない。シャッフルにより、毎回異なる可能性が探索されることが保証される。

#### ニューロンの追加

これが最も興味深い突然変異だ：

```lua
function mutationAjouterNeurone(unReseau)
    if #unReseau.lesConnexions == 0 then return nil end
    if unReseau.nbNeurone == NB_NEURONE_MAX then return nil end

    -- 接続をシャッフル
    local listeRandom = {}
    for i = 1, #unReseau.lesConnexions, 1 do
        local pos = math.random(1, #listeRandom+1)
        table.insert(listeRandom, pos, i)
    end

    for i = 1, #listeRandom, 1 do
        if unReseau.lesConnexions[listeRandom[i]].actif then
            -- 既存の接続を無効化
            unReseau.lesConnexions[listeRandom[i]].actif = false
            unReseau.nbNeurone = unReseau.nbNeurone + 1
            local indice = unReseau.nbNeurone + NB_INPUT + NB_OUTPUT

            -- 隠れニューロンを作成
            ajouterNeurone(unReseau, indice, "hidden", 1)

            -- 入力を隠れニューロンに接続
            ajouterConnexion(unReseau,
                unReseau.lesConnexions[listeRandom[i]].entree,
                indice, genererPoids())

            -- 隠れニューロンを出力に接続
            ajouterConnexion(unReseau,
                indice,
                unReseau.lesConnexions[listeRandom[i]].sortie,
                genererPoids())
            break
        end
    end
end
```

メカニズム：既存の接続を取り、**無効化し**、間に隠れニューロンを挿入する。元の接続は2つの新しい接続に置き換えられる：入力→隠れ、隠れ→出力。配線を切ってスパイスを入れるようなものだ。

これがNEATを「augmenting Topologies」にする所以だ。ネットワークは時間とともに**成長**する。シンプルに始まり、必要なときだけ複雑になる。

### feedForward

信号をネットワーク全体に伝播させる関数だ：

```lua
function feedForward(unReseau)
    -- 出力ニューロンをリセット
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

各アクティブな接続は`入力値 × 重み`を出力ニューロンに送信する。値は**蓄積**（加算）される。`allume`フラグはネットワークの視覚的表示用のみ。

### ゲームメモリの読み取り

`getLesInputs()`関数はスーパーマリオワールドの世界をネットワークが理解できるデータに変換する：

```lua
function getLesInputs()
    local lesInputs = {}
    -- 0で初期化（灰色 = なし）
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

    -- タイル（ブロック）= タイル値（> 0なら白）
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

入力グリッドはマリオを中心にした視界：11タイル幅、9タイル高。各タイルの値：
- **0**（灰色）：なし
- **1**（白色）：固体ブロック
- **-1**（黒色）：敵

敵はRAM内の2つのリストから読み取られる：通常スプライト（`0x14C8`-`0x14F8`）と拡張スプライト（`0x170B`-`0x173B`）。生存中のスプライト（状態 > 7）について、マリオに対するタイル位置を計算し、対応するセルに-1を配置する。

### フィットネス：AIが進行を認識する方法

```lua
function majReseau(unReseau, marioBase)
    local mario = getPositionMario()

    if not niveauFini and memory.readbyte(0x0100) == 12 then
        -- ステージクリア！
        unReseau.fitness = FITNESS_LEVEL_FINI
        niveauFini = true
    elseif marioBase.x < mario.x then
        -- マリオが右に移動
        unReseau.fitness = unReseau.fitness + (mario.x - marioBase.x)
        marioBase.x = mario.x
    end

    -- 入力を更新
    local lesInputs = getLesInputs()
    for i = 1, NB_INPUT, 1 do
        unReseau.lesNeurones[i].valeur = lesInputs[i]
    end
end
```

フィットネスはシンプルだ。**右に移動した距離**だ。マリオが10ピクセル移動すれば、フィットネスは10増加する。マリオが左に移動しても何も起こらない（罰なし）。ステージがクリアされると（アドレス`0x0100` == 12）、フィットネスは1,000,000になる。

意図的にシンプルだ。敵を倒すボーナスも、死ぬ罰もない。ただ、右に動け。

### インテリジェントリセット

マリオが33フレーム動かないと、レベルがリセットされ、次の個体に移る。しかし、マリオが進展した場合（現在のフィットネスが開始時と異なる）、300フレーム待つ――ネットワークが「何が正しかったか」を「理解」する機会を与える。

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

条件`memory.readbyte(0x0071) ~= 9`は、マリオが死亡アニメーション中でないことを確認する。マリオが既に死んでいるならリセットする意味がない。

### メインループ

ループは30fps（スーパーマリオワールドの通常速度）で実行される：

```lua
while true do
    local fitnessAvant = laPopulation[idPopulation].fitness

    -- 表示（ネットワーク、情報）
    if forms.ischecked(estAccelere) then
        emu.limitframerate(false)  -- 高速化
    else
        emu.limitframerate(true)   -- 30fps
    end

    -- 3つの重要機能
    majReseau(laPopulation[idPopulation], marioBase)
    feedForward(laPopulation[idPopulation])
    appliquerLesBoutons(laPopulation[idPopulation])

    emu.frameadvance()
    nbFrame = nbFrame + 1

    -- 進展なしでリセット
    -- ...
    -- 全個体テスト後、新しい世代
    -- ...
end
```

3つの重要機能は`majReseau`、`feedForward`、`appliquerLesBoutons`だ。いずれかを無効にすると、マリオは動かなくなる。

### クロスオーバー

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

赤ちゃんはより良い親から継承する。同じイノベーションを共有する各接続について、もう一方の親に50%の確率で置き換える機会があるが、**接続がアクティブな場合のみ**。これは重要な修正だ。さもなければ、無駄な隠れニューロンが作成される可能性がある。

### 種の選択

```lua
function nouvelleGeneration(laPopulation, lesEspeces)
    local laNouvellePopulation = newPopulation()
    local nbIndividuACreer = NB_INDIVIDU_POPULATION

    -- 種ごとの平均フィットネスを計算
    for i = 1, #lesEspeces, 1 do
        lesEspeces[i].fitnessMoyenne = 0
        for j = 1, #lesEspeces[i].lesReseaux, 1 do
            lesEspeces[i].fitnessMoyenne =
                lesEspeces[i].fitnessMoyenne + lesEspeces[i].lesReseaux[j].fitness
        end
        lesEspeces[i].fitnessMoyenne =
            lesEspeces[i].fitnessMoyenne / #lesEspeces[i].lesReseaux
    end

    -- 各種は平均フィットネスに比例した子孫数を作成
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

アイデア：平均フィットネスが10,000の種は、平均フィットネスが1の種よりもはるかに多くの子孫を作成できる。これが**自然選択**の実行だ。

`choisirParent`はルーレット選択を使用する。個体のフィットネスが高いほど、親として選ばれる確率が高くなる。

### 保存と読み込み

個体群は`.pop`ファイルに保存される：

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

保存には以前のすべての個体群の最良の個体も含まれる。古い個体群の最良の方が新しいものよりも優れている場合、基盤として古いものに revert する。これは**優生学**の一種だ。最良のものは決して失われない。

### ネットワークの可視化

Laupokはゲーム上にオーバーレイされるニューラルネットワークビジュアライザーを追加した：

```lua
function dessinerUnReseau(unReseau)
    -- 入力：マリオ周囲の11×9グリッド
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

    -- 出力：8つのボタン
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

ネットワークが何をしているかを理解するのに非常に便利だ。アクティブな接続は白、非アクティブは半透明。入力は白/黒/灰のセルのグリッド。出力はどのボタンが押されているかを示す。

---

## 結果

### AIが学んだこと

時間（および日）の実行を通じて、AIは自力で以下を発見した：

1. **右に移動**：最も基本的な動作だが、右ボタンを押し続ける必要がある
2. **敵を飛び越える**：「敵検出」入力をAまたはBボタンに接続することで
3. **障害物を回避**：一部のネットワークは、さらに進むために一時的に後退することを学んだ
4. **ステージをクリア**：最良の個体はスーパーマリオワールドの最初のステージをクリアできた

![AIが制御するマリオがスーパーマリオワールドのレベルでブーと対峙 -- ニューラルネットワークがリアルタイムでアクションを決定](/images/laupok-mario-ai/mario-ai-playing.jpg)

### 限界

プロジェクトには限界がある：

- **単一レベル**：AIは特定のレベルでトレーニングされる。他のレベルに自動的に一般化しない
- **トレーニング時間**：満足のいく結果を得るのに数十時間かかる
- **理解なし**：AIは自分が何をしているかを「理解」しない。ランダムな突然変異を通じてフィットネス関数（移動距離）を最適化する
- **Tバギング**：Laupokは、マリオが敵を見るとその場でジャンプする傾向があると指摘する。これはフィットネスが増加するからだ（ジャンプ中に少し前進する）

---

## 実験を再現する方法

Laupokはすべてを共有した。ステップは以下の通り：

1. **BizHawkをダウンロード** [tasvideos.org](https://tasvideos.org/BizHawk)から（ダウンロードセクション）
2. **スーパーマリオワールドのUSA ROMを入手**（自前のカートリッジからのプライベートコピー）
3. **Luaスクリプトをダウンロード** [Pastebin](https://pastebin.com/Jcvdqhqm)から――`mario.lua`に名前を変更
4. **スクリプトをROMと同じフォルダに配置**
5. **BizHawkを起動**、ROMを開く
6. **Luaコンソールで**：`dofile("mario.lua")`またはScript > Open Scriptメニューから
7. **レベルの開始でセーブステートを作成**（Savestate > Save Stateメニュー）`debut.state`に名前をつける
8. **スクリプトを再起動**――動作する

スクリプトには以下のオプションを含むフォームがある：
- **高速化**：30fps制限を無効にして高速化
- **ネットワーク表示**：ゲーム上にニューラルネットワークを表示
- **情報表示**：世代、フィットネス、種の数を表示するバナー
- **ポーズ**：実行を一時停止
- **保存/読み込み**：現在の個体群を`.pop`ファイルに保存

---

## 参考文献

| リソース | リンク |
|---------|--------|
| Laupokのメイン動画 | [マリオを一人でプレイするAIを作った](https://www.youtube.com/watch?v=F63GNXGHVwM) |
| コードレビュー＋セットアップ動画 | [AIのセットアップ方法＋ソースコードレビュー](https://www.youtube.com/watch?v=u5xCl1bSe6o) |
| 完全なソースコード | [Pastebin Jcvdqhqm](https://pastebin.com/Jcvdqhqm) |
| 元のNEAT論文 | Stanley & Miikkulainen, "Evolving Neural Networks through Augmenting Topologies", 2002 |
| N8Programsチュートリアル | [NEAT実装ウォークスルー](https://n8programs.github.io/)（JavaScriptだが概念は同一） |
| 16blings（Laupokのインスピレーション） | [AIがスーパーマリオワールドをプレイ](https://www.youtube.com/watch?v=qv6IFaOz3bA) |
| BizHawk | [tasvideos.org/BizHawk](https://tasvideos.org/BizHawk) |
| スーパーマリオワールドのメモリ | [SMW Central - RAM Map](https://www.smwcentral.net/?p=section&a=details&id=21702) |

---

## まとめ

Laupokがやったことは、学術的なアルゴリズム（NEAT、2002）を採用し、エミュレーター（BizHawk）用にLuaで書き直し、スーパーマリオワールドに適用したことだ。結果：AIがゼロからゲームのプレイ方法を学び、事前知識はなく、ランダムな突然変異と自然選択のみで。

これは遺伝的アルゴリズムの力の美しい例だ。ディープラーニングも、GPUも、数百万のトレーニングデータもない。自然選択、Lua、そして大きな忍耐力だけだ。

コードはコメント付きで共有されており、Laupokは2つの解説動画を作成した――大きな概念用とコード用の2本だ。このトピックに興味があれば、飛び込んでみよう。思っている以上に手が届きやすい。
