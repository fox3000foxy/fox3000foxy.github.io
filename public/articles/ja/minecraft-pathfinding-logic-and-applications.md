---
title: Minecraftの経路探索ロジックとその応用
description: A*アルゴリズム、ブロックのペナルティ、POIメカニズムを使って、mobの動きをコントロール、予測、悪用する方法 --
  ワイヤレスレッドストーンから最適化された農場まで。
date: 2026-05-29
tags:
  - minecraft
  - pathfinding
  - reverse-engineering
authors:
  - fox3000foxy
---

## 導入

羊が壁にぶつかるのを何時間も見てたんだ。

人生で最高の投資だったわ xD

こういうモブたちを観察すればするほど、その動きに一切ランダム性がないって気づくんだよね。一歩一歩がコード化されてて、予測可能で、そして何より——破壊できる。結局Minecraftのソースコードを掘りまくって、パスファインディングがどう動いてるのか完全に理解したんだけど、要はモブを文字通りマインドコントロールできるってことだ。つまり、ランダムが決める場所じゃなくて、**こっちが行かせたい場所**に強制的に動かせるんだ。

このガイドは俺が掘り当てた全部だ。AIシステム、A*アルゴリズム、隠されたMalice値、サバイバルで使える悪用技。ピッケル持ってこい。

---

## Mob AIの仕組み（ネタバレ：結構バカ）

### Goals（目標）

どのモブにも*目標*のリストがある。やれることと、どれだけそれを**やりたいか**のリスト。数字が小さいほど優先度高い。地獄のTODOリストみたいなもんだ。

```java
protected void registerGoals() {
   this.goalSelector.addGoal(4, new Zombie.ZombieAttackTurtleEggGoal(this, 1.0, 3));
   this.goalSelector.addGoal(8, new LookAtPlayerGoal(this, Player.class, 8.0F));
   this.goalSelector.addGoal(8, new RandomLookAroundGoal(this));
   this.addBehaviourGoals();
}
```

ゾンビがカメの卵を無視してこっちを追いかけてくるのを見たことあるだろ？その理由がこれ：`ZombieAttackTurtleEggGoal`は優先度4、一方`ZombieAttackGoal`（「顔を食う」目標）は優先度2。ゾンビは脈のあるスナックの方が好きなんだ。

俺たちが実際に気にするべき目標は`WaterAvoidingRandomStrollGoal`、優先度7。「他にやることないからぶらぶらする」目標だ。ここからが本番。

### Movement（あるいは「乱歩が1ティックにつき1/60の確率で発動する仕組み」）

毎ティック（0.05秒ごと）、ゲームは`canUse()`を呼び出してモブが動く気あるかチェックする。確率は1ティックにつき1/60。非効率極まりない設計で、それを愛してる。

```java
public boolean canUse() {
   if (this.mob.hasControllingPassenger()) {
      return false;
   } else {
      if (!this.forceTrigger) {
         if (this.checkNoActionTime && this.mob.getNoActionTime() >= 100) {
            return false;
         }
         if (this.mob.getRandom().nextInt(reducedTickDelay(this.interval)) != 0) {
            return false;
         }
      }
      Vec3 $$0 = this.getPosition();
      if ($$0 == null) {
         return false;
      } else {
         this.wantedX = $$0.x;
         this.wantedY = $$0.y;
         this.wantedZ = $$0.z;
         this.forceTrigger = false;
         return true;
      }
   }
}
```

まとめると：モブに乗ってる→ダメ、5秒間何もしてない→ダメ、RNGがノーって言った→ダメ。ゲームはマジでモブに動いてほしくないんだな。

でも動くときは、`getPosition()`が動き出す：

```java
protected Vec3 getPosition() {
   if (this.mob.isInWater()) {
      Vec3 $$0 = LandRandomPos.getPos(this.mob, 15, 7);
      return $$0 == null ? super.getPosition() : $$0;
   } else {
      return this.mob.getRandom().nextFloat() >= this.probability
         ? LandRandomPos.getPos(this.mob, 10, 7)
         : super.getPosition();
   }
}
```

最後の2つの数字？XZ半径とY半径だ。水中ではモブはより広く探す（15対10）。陸が見つからなければ`super.getPosition()`にフォールバックして、水中を受け入れる。**結果：モブは水から出たがる。** 動物が必死に岸に向かって泳ぐ理由はこれだ。

面白い詳細：モブが`LandRandomPos`じゃなくて`super.getPosition()`を選ぶ確率が文字通り0.1%ある。千分の一。Mojangさんマジか xD

### LandRandomPos：すべてを壊す最適化

これが**俺の**一番好きなステップだ。パスファインディングを悪用可能にする、最も美しい技術的カオス。

```java
public static Vec3 getPos(PathfinderMob $$0, int $$1, int $$2, ToDoubleFunction<BlockPos> $$3) {
   boolean $$4 = GoalUtils.mobRestricted($$0, $$1);
   return RandomPos.generateRandomPos(() -> {
      BlockPos $$4xx = RandomPos.generateRandomDirection($$0.getRandom(), $$1, $$2);
      BlockPos $$5 = generateRandomPosTowardDirection($$0, $$1, $$4, $$4xx);
      return $$5 == null ? null : movePosUpOutOfSolid($$0, $$5);
   }, $$3);
}
```

`movePosUpOutOfSolid`。名前がすべてを物語ってる。選んだ位置が固体ブロックの中だった場合、ゲームはそれを空中に出るまで上に押し上げる。

最適化なんだ：地下の位置をスキップする時間を無駄にしない代わりに、ゲームは単に地表に押し出す。賢い？確かに。でも、これで**巨大なバイアス**が生まれる：**モブは高台を好む**。

考えてみて。地下にブロックがたくさんある場合、ゲームは10個のランダムな位置を生成する。ブロック内にあるものは上に押し出される。密集した場所（丘の下とか）は空洞の場所より多くの有効な位置を生み出す。結果：モブは統計的に丘の方に行きやすい。

信じてくれ、これからこれをガッツリ破壊するからな。

### 選択：最高のブロックが勝つ

10個の位置、1つの勝者、スコアコンテスト：

```java
public static Vec3 generateRandomPos(Supplier<BlockPos> $$0, ToDoubleFunction<BlockPos> $$1) {
   double $$2 = Double.NEGATIVE_INFINITY;
   BlockPos $$3 = null;
   for(int $$4 = 0; $$4 < 10; ++$$4) {
      BlockPos $$5 = (BlockPos)$$0.get();
      if ($$5 != null) {
         double $$6 = $$1.applyAsDouble($$5);
         if ($$6 > $$2) {
            $$2 = $$6;
            $$3 = $$5;
         }
      }
   }
   return $$3 != null ? Vec3.atBottomCenterOf($$3) : null;
}
```

最高スコアの位置が**勝つ**。そしてスコアリング条件を知ってれば、**こっちの**位置を勝たせられる。選挙を不正操作するようなもんだ。

---

## Mobの好み（あるいは「牛が道路を渡った理由」）

モブによって好みが違う。そしてそれがすべてを変える。

| Mob | 好きなもの |
| --- | --- |
| **動物**（牛、羊、豚） | 草ブロック、明るさ |
| **モンスター**（ゾンビ、スケルトン） | 暗闇（ヒップスター） |
| **カメ** | 水 > 砂 > 明るさ |
| **ホグリン** | `crimson_nylium`；`warped_fungus`は嫌い |
| **ストライダー** | 溶岩とそれだけ |
| **シルバーフィッシュ** | 寄生可能ブロック |
| **ガーディアン** | 水 + 明るさ（スノッブ） |
| **ムーシュルーム** | 菌糸 + 明るさ |
| **ハチ** | 空気。そう、**空気**が好きなんだ。 |

```java
// Animal: look down, if grass -> max score
public float getWalkTargetValue(BlockPos $$0, LevelReader $$1) {
   return $$1.getBlockState($$0.below()).is(Blocks.GRASS_BLOCK) ? 10.0F : $$1.getPathfindingCostFromLightLevels($$0);
}

// Monster: literally the opposite
public float getWalkTargetValue(BlockPos $$0, LevelReader $$1) {
   return -$$1.getPathfindingCostFromLightLevels($$0);
}
```

モンスターは要するに「明るいとこはマイナススコア、俺は出てくわ。」明るさでマジでキレるんだ xD

つまり——文字通り——草と明るさで動物を誘導して、暗闇でモンスターを誘導できる。バカみたいで天才的だ。

---

## MinecraftのA*（秘密の計算式）

MinecraftはパスファインディングにA*（Aスター）を使ってる。でもMojangは独自のひねりを加えた：

```
f(n) = g(n) + 1.5 × h(n)
```

- **g(n)** = すでに移動した距離（1ブロックにつき1、斜めは約1.41）
- **h(n)** = 目的地までの直線距離
- **1.5** = Mojangがちょっと壊れたのが好きだから

通常のA*は`f(n) = g(n) + h(n)`。**MOJANGは1.5倍を追加した。** なぜ？アルゴリズムがより速く目的地に収束して、検索ブランチを減らすため。結果：パスは「十分良い」けど常に最適とは限らない。酔っぱらったA*だ。

主な制限：**モブは16ブロックしかパスファインディングできない**（*フォローレンジ*）。目的地が遠すぎる場合、最も近い到達可能なブロックを選ぶ。つまり、範囲外にモノリスを建てれば、モブはそれに近づくための最も近いブロックに向かってパスを通す——動きを完全に予測可能にできる。

### ゲームを壊す2つの悪用技

#### 1. ブロック更新で再計算が強制される

```java
public boolean shouldRecomputePath(BlockPos $$0) {
   if (this.hasDelayedRecomputation) return false;
   if (this.path != null && !this.path.isDone() && this.path.getNodeCount() != 0) {
      Node $$1 = this.path.getEndNode();
      Vec3 $$2 = new Vec3(
         ((double)$$1.x + this.mob.getX()) / 2.0,
         ((double)$$1.y + this.mob.getY()) / 2.0,
         ((double)$$1.z + this.mob.getZ()) / 2.0
      );
      return $$0.closerToCenterThan($$2, (double)(this.path.getNodeCount() - this.path.getNextNodeIndex()));
   }
   return false;
}
```

モブのパス付近のブロック更新はすべて、1秒のクールダウンでA*の再計算を強制する。モブの隣に1秒クロックを置けば、**常に**再計算し続ける。毎秒リセットされるGPSみたいなもんだ。

そしてこれを50体のモブでやったら？ラグシティ。TPSさようなら。

#### 2. パスファインディングMalice（ブロックコストペナルティ）

一部のブロックはモブを怖がらせる。文字通り。すべてのブロックにはenumで定義されたコストがある：

| ブロック / 条件 | Malice |
| --- | --- |
| **ハニーブロック** | 通過に+8 |
| **粉雪** | 通行不可 |
| **閉じたドア** | 通行不可 |
| **炎** | 通過+16、隣接+8 |
| **動物 & 村人** | 炎 = -1（絶対ダメ） |
| **サボテン / スイートベリー** | 通行不可；隣接+8 |
| **水** | 通過または隣接+8 |
| **マグマ** | 隣接+8 |

動物はさらに極端：

```java
protected Animal(EntityType<? extends Animal> $$0, Level $$1) {
   super($$0, $$1);
   this.setPathfindingMalus(PathType.DANGER_FIRE, 16.0F);
   this.setPathfindingMalus(PathType.DAMAGE_FIRE, -1.0F);
}
```

DAMAGE_FIREの-1.0Fは文字通り「禁止」。動物は炎の中を歩くくらいなら虚無に飛び込みたいんだ。

### 演習：壮大なパスコンテスト

村人が複数のパスから選ぶ場合：

- **パスA**：15ブロックだけど水に隣接6回（各+8）
- **パスB**：18ブロックで水ブロック2回（+8）+ 水隣接1回（+8）
- **パスC**：14ブロック直線...でも炎 → 村人には通行不可
- **パスD**：16ブロックでマグマ隣接1回（+8）+ ハニー隣接1回（+8）
- **パスE**：25ブロックでサボテンだらけ（どこも+8）→ 合計90.82 LOL

勝者はたいてい**パスB**：遠回りが報われる。なぜなら水が**高い**から。

村人は要するに脚のついたコスト計算機なんだ xD

### モブによって選ぶパスが違う

村人：「炎？ノー感謝、バイバイ」
ゾンビ：「炎？OK爺ちゃん *炎の中を歩いてく*」

村人が通ってゾンビは通らない——あるいはその逆——のハイウェイを文字通り作れる。

---

## 村人：究極のカオス

村人はMinecraftで最も誤解されてる存在だ。でも一度コードを読めば、ただの勤務時間のある予測可能な機械だってわかる。

### センサーとメモリー

9個のセンサーが20ティック（1秒）ごとに動く。各センサーは村人の周りの半径をスキャンして、結果をメモリーに保存する。村人はすべてを見て、すべてを覚えて、それに応じて行動する。

### アクティビティパッケージ

村人の脳は時間に基づいてアクティブになるアクティビティパッケージに分かれてる：

| パッケージ | 時間 | 村人の行動… |
| --- | --- | --- |
| **Core** | 24/7 | ドアを開け、泳ぎ（80%の確率で）、POIを取得 |
| **Work** | 午前8時〜午後3時 | 「仕事だ」— 仕事場に行く |
| **Meet** | 午後3時〜午後5時 | 「ハッピーアワー！」— 鐘のところに行き、交流 |
| **Rest** | 午後6時〜午前6時 | 「就寝時間」— ベッドに行く |
| **Idle** | 午前6時〜午前8時、午後5時〜午後6時 | 「暇だ」— ぶらつき、繁殖、ベッドで飛び跳ねる |
| **Panic** | ダメージ / 敵対 | 「逃げろ」— 逃走 |

**Panic**だけが他すべてを中断できる唯一のパッケージだ。村人が寝てようが働いてようが、ゾンビがいたらパニックモード。

### Acquire POI：ワイヤレスレッドストーンを可能にする仕組み

```java
Set<Pair<Holder<PoiType>, BlockPos>> $$12 = (Set)$$10xx.findAllClosestFirstWithType(
   $$0, $$11, $$8x.blockPosition(), 48, PoiManager.Occupancy.HAS_SPACE
)
```

`Acquire POI`は48ブロック半径内のすべての有効なPOIをスキャンする。最も近い5つを保持し、パスが存在するか確認して、到達可能な最も近いものを取得する。各POIには限られたスロットがある：
- **仕事場**：1スロット
- **ベッド**：1スロット
- **鐘**：32スロット

**ヤバいこと**：**スロットは到着時じゃなくて取得時に予約される。** 村人はマップの反対側からコンポスターをロックできるのに、そこにたどり着く必要すらない。

どこへ向かってるかわかるだろ？

### ワイヤレスレッドストーン。そう、**ワイヤレス**だ。

1. 村人をコンポスターへのパスがある状態でトロッコに入れる
2. 村人がコンポスターを取得する（スロット取得、他の誰も使えない）
3. 村人は遠すぎてクリックできない — 骨粉はそのまま
4. この村人を**世界中のどこにでも**移動させろ、スロットは保持され続ける
5. 何かを起動したいとき、村人を**殺せ**
6. スロットが解放され、別の村人がコンポスターを取得し、骨粉を取り除く
7. ブロック更新 → 任意のレッドストーン回路が起動

これでワイヤレスレッドストーンができた。世界中どこでも送信可能で、経路にチャンクロードも必要ない。これにエンダーパール静止ステーションを組み合わせれば、村人を殺すだけでどこからでもテレポートできる。

俺の一番好きな使い方？賞金稼ぎミニゲーム：複数の村人にコンポスターを持たせて、プレイヤーは**正しい**村人を殺して出口を起動しなきゃいけない。完全に意味不明な仕組みだ xD

### パスファインディングデッドロック（あるいは「永遠にフリーズする村人」）

`Acquire POI`（パスが見える）と実際のナビゲーション（それに従うのを拒否する）の間にバグがある。仕事場の上のブロックが歩行可能じゃないときに発生する。結果：

- Coreパッケージ：「POIを取得したい」
- ナビゲーション：「そこに歩けない」
- 結果：村人は**永遠に**フリーズして、自分自身と戦い続ける。

文字通り凍った村人、装飾や小道具として使える。防具立てタンク？あり。動かない警備員？あり。陰気？かも。効果的？めっちゃ xD

---

## 結論

Mobのパスファインディングはランダムじゃない。決定論的でスコアベースのシステムで、予測可能で**破壊可能**だ。

**覚えておくべき3つのこと：**

1. **下の固体ブロック = 高さバイアス** — 地下を埋めるか空にしてモブを誘導
2. **Maliceはモブごとに違う** — あるモブは通って他は通らないルートを作れる
3. **POIスロットは遠距離で予約される** — 無料のワイヤレスレッドストーン、テレポート、全部使える

Minecraftのソースコードは使われていない仕組みの宝庫だ。俺は何時間もデコンパイルされたJavaを読んだけど、正直？どの行も機能するイースターエッグだ。ただしこれらはサバイバルで村人ワイヤレスレッドストーンに使える。最高のゲーム確認済み xD
