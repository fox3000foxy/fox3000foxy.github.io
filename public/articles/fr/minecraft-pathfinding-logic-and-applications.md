## Introduction

J'ai passé des heures à regarder des moutons se cogner dans des murs.

Et honnetement ? Meilleur investissement de ma vie xD

Parce que plus tu regardes ces mobs, plus tu réalises qu'ils n'ont rien d'aléatoire. Chaque mouvement est codé, prévisible, et surtout -- complètement cassable. J'ai fini par plonger dans le code source de Minecraft pour piger exactement comment le pathfinding marche, et ce que j'ai découvert c'est que tu peux littéralement mind-control les mobs. Genre, les forcer à aller où TU veux, pas là où le hasard décide.

Ce guide c'est tout ce que j'ai appris en fouillant. L'IA, l'algorithme A*, les malus cachés, les exploits que tu peux balancer en survie. Prépare ta pioche.

---

## Comment fonctionne l'IA des mobs (spoiler : c'est débile)

### Les Goals

Chaque mob a des *goals*. C'est une liste de trucs qu'il PEUT faire et à quel point il a ENVIE de les faire. Plus le nombre est petit, plus c'est prioritaire -- comme une todo list version chaos.

```java
protected void registerGoals() {
   this.goalSelector.addGoal(4, new Zombie.ZombieAttackTurtleEggGoal(this, 1.0, 3));
   this.goalSelector.addGoal(8, new LookAtPlayerGoal(this, Player.class, 8.0F));
   this.goalSelector.addGoal(8, new RandomLookAroundGoal(this));
   this.addBehaviourGoals();
}
```

T'as déjà vu un zombie ignorer un oeuf de tortue pour te courser dessus ? Voilà pourquoi : `ZombieAttackTurtleEggGoal` a priorité 4, alors que `ZombieAttackGoal` (le truc qui lui dit de te bouffer la tronche) est à priorité 2.

Oui, un zombie préfère te manger plutôt que de casser un oeuf. C'est beau l'amour xD

Le goal qui nous intéresse vraiment c'est `WaterAvoidingRandomStrollGoal`, priorité 7. Le "j'ai rien à foutre donc je marche au pif" goal. C'est là que commence le bordel.

### Le mouvement (ou "comment un random march a 1 chance sur 60 de se produire")

Tous les ticks (toutes les 0.05 secondes), le jeu appelle `canUse()` pour voir si le mob daigne bouger. 1 chance sur 60 à chaque tick. Complètement débile comme design, et j'adore ça.

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

Donc pour résumer : si t'es monté sur le mob -> non, si le mob a rien fait depuis 5 secondes -> non, si le random dit non -> non. Le jeu veut VRAIMENT pas que le mob bouge.

Mais quand il bouge, `getPosition()` prend le relais :

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

Regarde ces deux nombres à la fin : c'est le rayon XZ et le rayon Y. Dans l'eau, le mob cherche plus loin (15 au lieu de 10). Si il trouve pas de terre, il se rabat sur `super.getPosition()` qui accepte l'eau. **Résultat : les mobs VEULENT sortir de l'eau.** C'est pour ca que tes animaux nagent comme des malades vers le bord.

P'tit détail croustillant : y'a littéralement 0.1% de chance que le mob prenne `super.getPosition()` au lieu de `LandRandomPos`. Un pour mille. Mojang quoi xD

### LandRandomPos : l'optimisation pourrie qui change tout

C'est MON étape préférée. La plus belle connerie technique qui rend le pathfinding exploitable.

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

`movePosUpOutOfSolid`. Le nom dit tout. Si la position choisie est dans un bloc solide, le jeu la pousse vers le haut jusqu'à ce qu'elle soit dans l'air.

C'est une optimisation : au lieu de perdre du temps à ignorer les positions sous terre, le jeu les remonte à la surface. Malin ? Oui. Mais ça crée un biais de dingue : **les mobs préfèrent les hauteurs**.

Imagine. T'as plein de blocs sous la surface, le jeu génère 10 positions aléatoires. Celles dans les blocs sont poussées vers le haut. Les zones denses (sous une colline) produisent plus de positions valides que les zones creuses. Résultat : le mob va statistiquement plus souvent vers la colline.

Fais-moi confiance, on va casser ça en 2 minutes.

### La sélection : le concours du meilleur bloc

10 positions, un seul gagnant, un concours de score :

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

La position avec le meilleur score GAGNE. Et si on connaît les critères de score, on peut faire gagner la position qu'on veut. C'est comme truquer une election.

---

## Les préférences des mobs (ou "pourquoi ta vache traverse la route")

Chaque mob a des goûts différents. Et ça change tout.

| Mob | Kiffe ça |
| --- | --- |
| **Animaux** (vaches, moutons, cochons) | L'herbe et la lumière (hipsters) |
| **Monstres** (zombies, squelettes) | Le noir (edgelords) |
| **Tortues** | L'eau, sinon le sable, sinon la lumière |
| **Hoglins** | `crimson_nylium` ; détestent `warped_fungus` |
| **Striders** | Que la lave. RIEN d'autre. |
| **Silverfish** | Les blocs infestables (logique) |
| **Guardians** | Eau + lumière (les snobs) |
| **Mooshrooms** | Mycelium + lumière (champignons) |
| **Abeilles** | L'air. Oui, elles préfèrent L'AIR. |

```java
// Animal : regarde en bas, si c'est de l'herbe, score max
public float getWalkTargetValue(BlockPos $$0, LevelReader $$1) {
   return $$1.getBlockState($$0.below()).is(Blocks.GRASS_BLOCK) ? 10.0F : $$1.getPathfindingCostFromLightLevels($$0);
}

// Monstre : exactement l'inverse
public float getWalkTargetValue(BlockPos $$0, LevelReader $$1) {
   return -$$1.getPathfindingCostFromLightLevels($$0);
}
```

Genre les monstres c'est littéralement "si c'est éclairé, score négatif, je vais ailleurs". Ils font LA GUEULE a la lumière xD

Donc tu peux -- littéralement -- guider tes animaux avec de l'herbe et de la lumière, et tes monstres avec du noir. C'est débile et génial à la fois.

---

## L'algorithme A* dans Minecraft (la formule secrète)

Minecraft utilise l'algorithme A* (A-star) pour le pathfinding. Mais Mojang a mis sa patte :

```
f(n) = g(n) + 1.5 × h(n)
```

- **g(n)** = le chemin déjà parcouru (1 par bloc, ~1.41 en diagonale)
- **h(n)** = la distance à vol d'oiseau
- **1.5** = parce que Mojang aime les trucs un peu pétés

Normalement A* utilise `f(n) = g(n) + h(n)`. MOJANG A AJOUTÉ UN FACTEUR 1.5. Pourquoi ? Pour que l'algo aille plus vite vers la destination et coupe moins de branches de recherche. Résultat : le chemin trouvé est "bon" mais pas toujours le meilleur. C'est un A* un peu bourré.

Détail important : **un mob ne peut pathfinder que sur 16 blocs** (sa *follow range*). Si la destination est trop loin, il choisit le bloc le plus proche qu'il PEUT atteindre. Ça veut dire que tu peux créer un monolithe hors de portée, et le mob va pathfinder vers le bloc le plus proche qui le rapproche de ce monolithe -- making ses mouvements complètement prévisibles.

### Les deux exploits qui cassent le jeu

#### 1. Les block updates = recalculation forcée

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

Chaque mise à jour de bloc près du chemin du mob force un recalcul d'A* avec un cooldown d'1 seconde. Tu mets une horloge à 1 seconde à côté d'un mob, et il re-calcule son chemin CONSTAMMENT. C'est l'équivalent de mettre un GPS qui se reset toutes les secondes.

Et si tu fais ça avec 50 mobs en même temps ? Lag city. RIP TPS.

#### 2. Les malus de blocs (Pathfinding Malice)

Certains blocs font peur aux mobs. Littéralement. Chaque bloc a un coût associé, défini par une énumération :

| Bloc / Condition | Malus |
| --- | --- |
| **Bloc de miel** | +8 à traverser |
| **Poudreuse** | Infranchissable |
| **Portes fermées** | Infranchissable |
| **Feu** | +16 à traverser, +8 à longer |
| **Animaux & Villageois** | Feu = -1 (NOPE) |
| **Cactus / Sweet berry** | Infranchissable ; adjacent = +8 |
| **Eau** | +8 à traverser ou longer |
| **Magma** | +8 à longer (ouille) |

Les animaux sont encore plus extrêmes :

```java
protected Animal(EntityType<? extends Animal> $$0, Level $$1) {
   super($$0, $$1);
   this.setPathfindingMalus(PathType.DANGER_FIRE, 16.0F);
   this.setPathfindingMalus(PathType.DAMAGE_FIRE, -1.0F);
}
```

DAMAGE_FIRE à -1.0F, c'est littéralement "interdit". Un animal préfère se jeter dans le vide plutôt que de traverser du feu. Fiou.

### Exercice : le grand concours de chemins

Imagine un villageois qui doit choisir entre plusieurs chemins.

- **Chemin A** : 15 blocs mais 6 blocs longent de l'eau (+8 chaque)
- **Chemin B** : 18 blocs avec 2 blocs d'eau (+8) et 1 bloc adjacent d'eau (+8)
- **Chemin C** : 14 blocs tout droits... mais avec du feu -> IMPASSABLE pour un villageois
- **Chemin D** : 16 blocs avec 1 bloc adjacent magma (+8) + 1 bloc adjacent miel (+8)
- **Chemin E** : 25 blocs mais des cactus partout (+8 partout) -> 90.82 de coût total LOL

Calcul mental :

- Chemin A : 15 blocs + 6×8 pour l'eau = 15 + 48 = **63** ... mais y'a le 1.5×distance à ajouter. Faisons les vrais calculs.
- Chemin B : plus long mais moins de malus. Le cost total = distance cumulée + malus.
- Chemin D : le magma et le miel stack leurs malus.

Le gagnant c'est souvent le **Chemin B** : le détour est rentable parce que l'eau est CHÈRE.

Un villageois c'est essentiellement un calculateur de coûts avec des jambes xD

### Chaque mob a ses goûts

Un villageois : "du feu ? NON MERCI BYE"
Un zombie : "du feu ? OK boomer *traverse en flambant*"

T'as littéralement des routes que certains mobs prennent et d'autres non. Tu peux faire des autoroutes à villageois où les zombies se font cramer.

---

## Les villageois : le bazar ultime

Ok, les villageois. C'est LE truc le moins compris de tout Minecraft. Mais une fois que t'as pogné le code, tu te rends compte que ce sont des machines prévisibles avec des horaires de bureau.

### Senseurs et mémoires

9 senseurs, qui tournent toutes les 20 ticks (1 seconde). Chacun scrute un rayon autour du villageois et stocke le résultat en mémoire. Le villageois voit tout, se souvient de tout, et agit en fonction.

Genre : "est-ce que y'a un ennemi ? un item par terre ? un joueur avec qui parler ?" -- il checke TOUT.

### Les packages (ses phases de la journée)

Le cerveau d'un villageois c'est des packages d'activité qui s'activent selon l'heure :

| Package | Horaire | Le villageois... |
| --- | --- | --- |
| **Core** | H24 | Ouvre des portes, nage (80% du temps), et ACQUIERT DES POI |
| **Work** | 8h-15h | "Je vais bosser" -- marche vers son poste |
| **Meet** | 15h-17h | "Apéro !" -- va à la cloche, papote |
| **Rest** | 18h-6h | "Faut dormir" -- va au lit |
| **Idle** | 6h-8h, 17h-18h | "Je glande" -- se balade, fait des bébés, saute sur les lits |
| **Panic** | Blessure/hostile | "AU SECOURS" -- FUITE |

Le package **Panic** est le seul qui peut interrompre TOUS les autres. Même si le villageois est en train de dormir ou de bosser, si y'a un zombie, PANIQUE GÉNÉRALE.

### Acquire POI : le truc qui permet la redstone sans fil

```java
Set<Pair<Holder<PoiType>, BlockPos>> $$12 = (Set)$$10xx.findAllClosestFirstWithType(
   $$0, $$11, $$8x.blockPosition(), 48, PoiManager.Occupancy.HAS_SPACE
)
```

`Acquire POI` scanne dans un rayon de 48 blocs tous les POI (points d'interet). Il garde les 5 plus proches, vérifie qu'un chemin existe, et acquiert le premier accessible.

Chaque POI a un nombre limité de slots :
- **Postes de travail** : 1 slot
- **Lits** : 1 slot
- **Cloches** : 32 slots

Le truc DINGUE : **le slot est réservé au moment de l'acquisition, PAS à l'arrivée**. Un villageois peut verrouiller un composter depuis l'autre bout de la map, sans jamais l'atteindre.

Tu captes la puissance ?

### Redstone sans fil. Oui, SANS FIL.

1. Tu mets un villageois dans un minecart avec un chemin vers un composter
2. Il acquiert le composter (slot pris, plus personne peut l'utiliser)
3. Le villageois est trop loin pour cliquer dessus -- la bone meal reste
4. Tu BALADES ce villageois n'importe où dans le monde, il garde le slot
5. Quand tu veux activer ton machin, tu T U E S le villageois
6. Le slot se libère, un autre villageois acquiert le composter, retire la bone meal
7. BLOCK UPDATE -> n'importe quel circuit redstone activé

T'as littéralement créé un signal redstone sans fil, transmissible dans tout le monde, avec zéro chunk load nécessaire sur le chemin. Tu peux brancher ça sur une ender pearl stasis chamber, te faire téléporter depuis n'importe où en tuant un villageois.

Mon utilisation préférée ? Un mini-jeu "bounty hunter" : tu mets plusieurs villageois avec des composters, le joueur doit tuer LE BON villageois pour activer la sortie. C'est complètement wtf comme mécanique xD

### Le Pathfinding Deadlock (ou "le villageois qui freeze pour toujours")

Y'a un bug TROP bon entre `Acquire POI` (qui voit un chemin) et la navigation réelle (qui refuse de l'emprunter). Ça arrive quand le bloc au-dessus du poste de travail est pas marchable. Résultat :

- Core package : "je veux acquérir le POI"
- Navigation : "je peux pas marcher là"
- Résultat : le villageois reste FIGÉ, pour toujours, à se battre avec lui-même.

Littéralement des villageois frozen en place, utilisables comme décoration ou comme "props" dans des builds. Un tank à armure stand ? Oui. Un garde qui bouge pas ? Oui. Macabre ? Ptet. Mais efficace xD

---

## Conclusion

Le pathfinding des mobs Minecraft c'est pas du hasard. C'est un système déterministe, basé sur des scores, prévisible ET pétable.

**Les trois trucs à retenir :**

1. **Des blocs sous les pieds = biais de hauteur** -- remplis ou vide le sous-sol pour guider les mobs
2. **Les malus sont différents pour chaque mob** -- crée des routes que certains prennent et pas d'autres
3. **Les POI slots sont réservés à distance** -- redstone sans fil gratuite, téléportation, tout ça

Le code source de Minecraft c'est une mine d'or de mécaniques sous-exploitées. J'ai passé des heures à lire du Java décompilé et franchement ? Chaque ligne est un Easter Egg fonctionnel. Sauf que ceux-là, tu t'en sers en survie pour faire de la redstone sans fil avec des villageois. Meilleur jeu confirmé.

xD
