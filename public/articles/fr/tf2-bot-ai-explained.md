---
title: "Les bots TF2 ne sont pas aleatoires : J'ai redecouvert chaque parametre de difficulte"
description: "Vision, visee, angles de backstab, logique de headshot, chaque bug connu -- Valve n'a jamais rien documente. Alors on a fouille le code et transforme le tout en fiche technique complete."
date: 2026-07-12
authors:
  - fox3000foxy
tags:
  - tf2
  - jeu-ia
  - ingenierie-inversee
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "5hd0gJo5bToc2ynmcPgVQW6OWEXr9lBvU1jtb7rw8TSBf+ffxdtU0FesNmTq1qp9XViGhvdPEO3D6AdbPYY0Tg=="
---

## Introduction

![Soldat bot TF2 visant avec un lance-roquettes](assets/tf2-bot-ai-soldier-aim.png)

Chaque joueur de TF2 l'a dit au moins une fois : "ce bot triche." Ou l'inverse : "pourquoi ce bot Facile reste plante a manger des roquettes." Personne ne sait vraiment ce que "Facile," "Normal," "Difficile," et "Expert" signifient reellement sous le capot -- Valve a expedie quatre etiquettes de difficulte et exactement zero documentation.

Alors une bande d'entre nous (moi, awimii, Mush The Possum, avec une enorme partie du travail de base fait par sigsegv, qui a vraiment fouille le code descompile du jeu) a rassemble un document de recherche complet sur le comportement des TFBot. Chaque mecanique, chaque bug connu, chaque probabilite codee en dur. Cet article est le compte-rendu integral, pas la version condensee. Prenez un Bonk, c'est un long.

---

## Chapitre I : Les Bases

### Bot vs Bot Marionnette

TF2 a deux choses completement differentes que les gens appellent "bots" :

- **Bots IA (TFBots)** : veritable IA, construite sur le meme framework PlayerBot/Infected que Valve a utilise pour la serie *Left 4 Dead*. Ils choisissent une classe aleatoire, jouent l'objectif, fonctionnent sans `sv_cheats`, et declenchent les succes comme un vrai joueur.
- **Bots Marionnette** : zero IA, incapables de bouger ou d'agir par eux-memes. Ils existent uniquement pour etre controles manuellement -- un joueur peut les forcer a suivre, viser, et tirer, principalement utilises pour les tests ou pour faire des captures d'ecran/videos cinematiques. Les faire apparaitre necessite `sv_cheats 1`, ce qui desactive aussi les succes pour la session.

Cet article porte entierement sur le premier type.

### Ce qu'on peut (plus ou moins) dire aux bots IA de faire

Les TFBot ne sont pas directement controlables, mais il y a une courte liste de choses qu'on peut les inciter a faire :

- Visez n'importe quel bot (allié ou ennemi) avec votre crosshair et il vous narguera si vous utilisez les bonnes commandes vocales.
- Un bot Medic allie vous soigne si vous utilisez la commande vocale "Medic!"
- Si un bot Medic vous soigne et a une UberCharge prete, dire "Go go go!" ou "Activez la charge!" le fait declencher la charge immediatement.
- Un bot Medic avec une charge prete l'active automatiquement des que lui-meme ou sa cible de soin prend des degats serieux, sans commande vocale necessaire.
- Les bots effectuent spontanement des nargues en duo (High Five) ou des nargues de groupe (Conga) avec des coequipiers proches.

### Faire fonctionner les bots sur des cartes non supportees

Les bots dependent d'un maillage de navigation pour savoir ou ils ont le droit de marcher, et la plupart des cartes communautaires n'en fournissent pas. Pour forcer :

1. `sv_cheats 1`
2. `nav_generate` -- construit le navmesh initial, progression affichee dans la console
3. Attendez que le jeu finisse de generer les chemins
4. Optionnellement, corrigez manuellement les mauvaises donnees de navigation avec `nav_edit 1`
5. Rechargez ou redemarrez le serveur (sauter cette etape desactive les succes)
6. `tf_bot_add <nombre>` pour faire apparaitre les bots

**Avertissement :** modifier le navmesh pendant que des bots sont actifs sur le serveur peut planter le jeu. Une fois le maillage existant, vous n'avez pas besoin de le regenerer pour les sessions futures -- ajoutez simplement les bots avec `tf_bot_add`.

Les maillages auto-generes fonctionnent mieux sur les cartes Point de Controle, King of the Hill, Payload, et CTF. Sur les cartes Mannpower, les bots adoptent par defaut un comportement de type CTF mais utilisent a peine les grappins ou les powerups. Si une carte n'a pas d'objectif que l'IA du bot reconnait mais possede une entite de salle d'apparition, definir `tf_bot_offense_must_push_time 0` permet aux bots de combattre quand meme.

*(Source pour cette section : la page Bots du wiki officiel TF2.)*

### Statut actuel, carte par carte

Grace a la mise a jour Hatless, chaque classe fonctionne correctement maintenant, y compris le Spy historiquement bugue. Les bots se comportent correctement sur la plupart des cartes KOTH officielles, certaines cartes Payload, Dustbowl/Gorge Attack-Defense, et les cartes CTF/Mann Manor -- meme si sur ces deux dernieres vous ne pouvez pas les faire apparaitre directement avec `tf_bot_add`. Sur les cartes non supportees (via le processus nav_generate ci-dessus), ils fonctionnent, mais sont nettement moins bons pour imiter un vrai joueur.

Les cartes PLR sont une cause perdue : les bots ne peuvent pas franchir les barrieres sur Hightower et se coincent dans les coins, et sur toutes les autres cartes PLR ils font juste... une fete de la danse au lieu de jouer. Peut-etre que ca sera corrige un jour. Peut-etre pas.

### Comportement general des bots

Un fourre-tout de choses que chaque bot fait independamment de son niveau :

- Les bots utilisent seulement des loadouts de base (un plugin peut leur forcer des armes non-standard, mais les bots vanilla ne choisissent jamais les leurs).
- Les bots Faciles utilisent a peine leur arme secondaire. Les difficultes superieures passent a l'arme secondaire des que le chargeur principal est vide, ou pour compenser la distance.
- Les bots ne savent pas faire de techniques de mouvement -- pas de rocket jump, pas de relocalisation de batiment.
- Apres un kill, un bot peut narguer, meme sous le feu -- sauf s'il porte le renseignement ennemi, et cette regle s'applique aussi en MvM.
- Les bots Spy deguises (joueur ou IA) sont correctement ignores par les autres bots -- jusqu'a ce qu'ils touchent un ennemi, sabotent quelque chose, tirent, ou deviennent invisibles pres d'un. Une fois "decouverts," ce bot/joueur specifique est memorise comme Spy jusqu'a ce qu'il change de deguisement tout en restant invisible, meurt, ou simule sa mort avec le Dead Ringer.
- Les bots Pyro utilisent la Compression Blast liberalement a partir du niveau Normal.
- Les bots Medic priorisent les soins sur tout le monde sauf les Snipers (et, dans une moindre mesure, les Engineers), meme si vous spammez "Medic!" en tant que tel.
- Les bots Medic gravitent vers les Heavies, Soldiers, Demomen et Pyros -- specifiquement si un *humain* joue ces classes. Pas d'humain dans ces roles, pas d'attention particuliere du Medic.
- Les bots restent en position pendant le temps de preparation sur les cartes Attack/Defense et Payload -- sauf les Engineers, Snipers et Spies, qui se deplacent librement (les bots Demoman sont aussi autorises a pre-placer des bombes collantes).
- Les bots Engineer n'ameliorent ni ne desactivent jamais les constructions d'un autre Engineer allie, a moins que cette construction ne se trouve sur le chemin de leur cible. Ils ne reparent parfois tout simplement pas leur propre tourelle, meme quand c'est sur de le faire.
- Les bots Spy reperes passent a leur revolver et reculent au lieu de forcer un coup de couteau.
- Les bots Demoman qui ont localise une sentinelle (generalement en mourant dessus une fois) peuvent parfaitement lancer des bombes collantes dessus depuis l'exterieur de sa portee, en arc de cercle a travers les murs et les plafonds quand la geometrie le permet.
- Les bots Sniper qui ne trouvent pas de cible apres avoir vise utilisent l'une des lignes vocales "Negatives."
- Les Medics allies soignent un Spy deguise sans hesitation.

### Problemes / bugs connus

Le document liste un bon nombre de bizarreries de longue date :

- Les bots peuvent essayer de marcher ou de tirer a travers certains props statiques.
- Chaque fois qu'un joueur/bot se demasque, se deguise, ou se revele, les bots proches le "voient" et se retournent pour reagir -- meme si l'evenement s'est produit en dehors de leur champ de vision reel. Ce n'est pas base sur le son ; c'est un contournement du test de vision.
- Rarement, les bots peuvent rester physiquement coinces ensemble en utilisant un teleporteur d'Engineer.
- Les commandes vocales des bots (ex. "Spy!", "En avant!") ne s'affichent pas en texte dans le chat comme celles des joueurs.
- Un bot Medic soignant activement quelqu'un n'esquivera pas les tirs entrants ni ne prendra de kits de soin, meme a des PV critiques.
- Les bots peuvent continuer a bouger pendant une nargue en duo, ce qui brise l'effet prevu du Festive Critical Strike.
- Les bots Medic recemment blesses refusent souvent d'utiliser le Syringe Gun a distance, preferant le corps a corps (ou, dans de tres rares cas, essayant de vous toucher avec le rayon du Medi Gun lui-meme).
- Les bots Medic ne compensent pas la gravite pour les tirs du Syringe Gun -- probablement parce que l'arme n'est pas correctement marquee comme non-hitscan dans le code IA.
- Les bots Spy peuvent voir et suivre un Spy invisible (joueur ou IA) si ce Spy a deja ete decouvert une fois, independamment du niveau de competence du bot qui le suit.
- Meme si un joueur-Spy se deguise en classe de sa propre equipe, heurter un ennemi le demasque quand meme (les bots ne font jamais ca a eux-memes, puisque les bots ne se deguisent jamais en leur propre equipe).
- Les bots respectent l'equilibrage automatique des equipes -- si vous essayez d'entasser des bots d'un cote, vous devez d'abord utiliser `mp_teams_unbalance_limit 0`.
- Les bots Engineer peuvent completement ignorer leurs propres constructions jusqu'a ce qu'elles soient detruites.
- Les bots Heavy essaient parfois de tirer au Minigun alors qu'ils sont a court de munitions, surtout en dessous du niveau Difficile.
- Les bots Medic de l'equipe perdante se suicident occasionnellement pendant la phase d'Humiliation quand aucun ennemi n'est proche -- quelque chose qu'un joueur humain ne peut pas reproduire meme en essayant.
- Regler votre apercu d'equipe sur BLU dans l'ecran de chargement fait que les bots RED vous semblent visuellement rendus en BLU.
- Les bots avec une arme de corps a corps sortie refusent parfois de changer d'arme meme apres avoir ramasse des munitions.
- Apres Jungle Inferno, les bots apparus avec des parametres explicites (ex. `tf_bot_add 5 pyro bleu normal`) peuvent mourir instantanement dans leur propre salle d'apparition. Correctif : `tf_bot_reevaluate_class_in_spawnroom 0` (necessite `sv_cheats 1`).

### Noms des IA

Les noms des bots sont tires d'un grand reservoir de references a TF2, a d'autres jeux Valve, et a la culture de programmation, en grande partie parce que la communaute n'arretait pas d'en demander des specifiques sur les forums Steam. Un echantillon de la liste : *AimBot, Aperture Science Prototype XR7, Black Mesa, Companion Cube, C++, Divide by Zero, GLaDOS, H@XX0RZ, Saxton Hale, The G-Man, trigger_hurt, 0xDEADBEEF*, et des dizaines d'autres dans le meme genre.

Il y a aussi un lot de noms trouves dans un build source fuité qui n'a jamais ete expedie en production, pour des raisons peu claires -- principalement des references a *Last Dragon* et *The Fifth Element* comme *John Spartan, Leeloo Dallas Multipass, Sho'nuff, Bruce Leroy, Big Gulp Huh?*, et *I'm your huckleberry*.

Vous pouvez remplacer tout cela vous-meme : `tf_bot_add heavyweapons blue "Blu Hoovy"` fait apparaitre un Heavy BLU nomme "Blu Hoovy."

---

## Chapitre II : Les Bots Originaux / TFBots -- Plongee dans les Niveaux de Competence

Le cadre original de Sigsegv tient toujours : il est evident que les bots Expert surpassent les bots Facile, mais Valve n'a jamais explique *combien* ni *pourquoi*. Donc la seule facon de savoir est de lire le code. Voici chaque mecanique qui evolue avec la competence.

### Regler la difficulte

En dehors du MvM, la difficulte est controlee par une cvar :

| `tf_bot_difficulty` | Niveau de difficulte |
| --- | --- |
| 0 | Facile |
| 1 | Normal (par defaut) |
| 2 | Difficile |
| 3 | Expert |

`tf_bot_add` accepte aussi un argument de difficulte directement (`easy`/`normal`/`hard`/`expert`).

### Popfiles MvM

Dans Mann vs. Machine, chaque bloc de spawn `TFBot` dans le popfile a une cle `Skill` optionnelle. Pas de cle signifie Facile. Dans les missions de Valve : les Geants sont presque toujours Expert, les Engineers et les Spies sont presque toujours Expert, et les Snipers sont generalement Difficile (occasionnellement Expert). Si vous utilisez `EventChangeAttributes` (ajoute dans la mise a jour Two Cities) pour modifier dynamiquement les bots en cours de vague en fonction d'evenements de carte, la competence du bot est l'une des proprietes que vous pouvez changer a la volee.

### Mode Endless MvM

Le mode Endless n'a jamais ete officiellement expedie, mais dedans, les bots depensent leur argent en ameliorations comme les joueurs -- y compris une amelioration exclusive aux bots qui augmente leur niveau de competence IA en cours de jeu.

### L'entite `bot_generator`

Une entite obscure, largement non documentee, presumee avoir ete utilisee dans le mode entrainement et peut-etre dans le developpement precoce du MvM. Elle expose une entree `SetDifficulty` pour controler le niveau de competence. Au-dela, la piste se refroidit -- Valve ne l'a jamais documentee et personne n'a entierement cartographie son comportement.

### Couleur de lueur oculaire

Les robots MvM ont une particule de lueur oculaire qui change de couleur avec le niveau de competence -- un indicateur visuel que personne en dehors de la communaute n'a jamais explique :

| Competence | Couleur des yeux | RVB |
| --- | --- | --- |
| Facile/Normal | Bleu | `#24b4ff` |
| Difficile/Expert | Jaune | `#fff000` |

![Heavy bot TF2 en position d'attente](assets/tf2-bot-ai-heavy-idle.png)

### Vision : temps de reconnaissance

Un bot ne reagit pas instantanement quand quelque chose entre dans son champ de vision -- il y a un delai code en dur avant que le reste de l'IA soit meme autorise a reconnaitre la menace :

| Competence | Temps de reconnaissance minimum |
| --- | --- |
| Facile | 1,00 s |
| Normal | 0,50 s |
| Difficile | 0,30 s |
| Expert | 0,20 s |

C'est l'essentiel de l'effet "les bots Faciles ont l'air stupides" en un seul chiffre -- un bot Facile ne vise pas moins bien une fois qu'il vous a remarque, il met juste cinq fois plus de temps a remarquer votre existence.

### Visee : taux de suivi

Les bots ne vous traquent pas en continu. Ils echantillonnent votre position et votre vitesse a un intervalle fixe et prevoyent une ligne droite a partir de la :

| Competence | Intervalle de recalcul | Taux equivalent |
| --- | --- | --- |
| Facile | 1,00 s | 1x/s |
| Normal | 0,25 s | 4x/s |
| Difficile | 0,10 s | 10x/s |
| Expert | 0,05 s | 20x/s |

**Exception :** les bots Spy sont codes en dur avec le taux de suivi Normal quel que soit leur niveau de competence reel -- un Spy Expert vise toujours comme un bot Normal. Il existe aussi une video de demonstration publique comparant les taux de suivi cote a cote si vous voulez voir l'ecart 1x vs 20x en mouvement.

### Visee : competence specifique aux armes

Les bots ne visent pas juste votre centre de masse -- ils ont une logique par arme, parfois vraiment buguee :

**Lance-grenades & Lance-bombes collantes.** Tous les niveaux de competence compensent l'arc vertical, en utilisant une valeur fixe de la cvar `tf_bot_ballistic_elevation_rate`. Parce que cette compensation ne s'active que pour l'ID d'arme de base, les variantes de projectiles plus rapides (Loch-n-Load, tout ce qui a un modificateur de vitesse de projectile) n'ont pas d'arc correctement ajuste. Et comme c'est lie par l'ID d'arme specifiquement, le Loose Cannon -- un ID different -- ne recoit aucune compensation d'arc.

**Huntsman.** Les bots Faciles ne compensent pas la chute de la fleche et ne cherchent jamais les headshots. Les bots de niveau Normal compensent l'arc, mais ne visent la tete qu'a moins de 150 HU. Les bots Difficile/Expert visent toujours la tete.

**Lance-roquettes.** Au-dela de 150 HU, les bots non-Faciles visent vos pieds au lieu du centre de masse, maximisant les chances de degats de zone et de repoussement. A moins de 150 HU, ils passent aux headshots. Les bots Faciles visent toujours le centre de masse quelle que soit la distance. C'est aussi verrouille par ID d'arme : le Direct Hit et le Cow Mangler n'heritent pas de ce comportement. Logique pour le Direct Hit (pas de zone d'effet a exploiter) ; zero sens pour le Cow Mangler -- cette partie de l'IA predate l'existence de l'arme et n'a simplement jamais ete revue.

**Fusils de sniper.** Facile vise le corps. Normal vise environ a 33% du corps vers la tete. Difficile/Expert visent directement la tete. Moins important en MvM, ou les headshots des bots n'obtiennent pas le bonus de degats de toute facon.

### Ouie : sensibilite aux tirs discrets

Chaque coup de feu alerte les bots proches de la position du tireur, meme a travers les murs, jusqu'a 3000 HU avec 100% de chance d'etre remarque (`tf_bot_notice_gunfire_range`). Mais un sous-ensemble d'armes sont marquees "discretes" -- audibles seulement dans 500 HU (`tf_bot_notice_quiet_gunfire_range`), et meme alors avec une chance dependante de la competence :

| Competence | Chance de remarquer un tir discret |
| --- | --- |
| Facile | 10% |
| Normal | 30% |
| Difficile | 60% |
| Expert | 90% |

Cette probabilite est divisee par deux si un tir *bruyant* a ete entendu dans les 3 dernieres secondes -- les sons forts masquent les sons faibles.

La liste des ID d'armes discretes n'a pas ete mise a jour depuis decembre 2010. Tout ajout ulterieur utilisant un nouvel ID d'arme est traite comme bruyant par defaut, peu importe a quel point il devrait logiquement etre discret, sauf s'il reutilise un ID plus ancien. Concretement :

| ID d'arme | Couvre |
| --- | --- |
| `TF_WEAPON_KNIFE` | Tous les couteaux de Spy |
| `TF_WEAPON_FISTS` | Coups de poing specifiques au Heavy (son coup de poing multi-classe est en fait `TF_WEAPON_FIREAXE`) |
| `TF_WEAPON_PDA` | Presume inutilise directement |
| `TF_WEAPON_PDA_ENGINEER_BUILD` | PDA de construction de l'Engineer |
| `TF_WEAPON_PDA_ENGINEER_DESTROY` | PDA de destruction de l'Engineer |
| `TF_WEAPON_PDA_SPY` | Kit de deguisement du Spy |
| `TF_WEAPON_BUILDER` | Kit d'outils de Spy/Engineer/Saboteur |
| `TF_WEAPON_MEDIGUN` | Tous les Medi Guns |
| `TF_WEAPON_DISPENSER` | Probablement inutilise (les Dispensers sont des objets, pas des armes) |
| `TF_WEAPON_INVIS` | Toutes les montres d'invisibilite de Spy |
| `TF_WEAPON_FLAREGUN` | Tous les pistolets a fusee Pyro *sauf* le Manmelter |
| `TF_WEAPON_LUNCHBOX` | Sandwich, Dalokohs Bar, Buffalo Steak Sandvich, Bonk!, Crit-a-Cola |
| `TF_WEAPON_JAR` | Jarate (pas Mad Milk -- ID separe, non-discret) |
| `TF_WEAPON_COMPOUND_BOW` | Huntsman |
| `TF_WEAPON_SWORD` | Eyelander, Skullcutter, Claidheamh Mor, Persian Persuader, Half-Zatoichi |
| `TF_WEAPON_CROSSBOW` | Crusader's Crossbow |

L'exemple classique de la liste qui pourrit : le Manmelter a recu son propre ID (`TF_WEAPON_RAYGUN_REVENGE`), ajoute apres que la liste des armes discretes ait ete gelee -- donc il est traite comme bruyant, malgre etre un pistolet a fusee dans tous les sens pratiques. Le Scorch Shot, sorti encore plus tard, reutilise l'ID de base `TF_WEAPON_FLAREGUN` et est donc toujours considere comme discret. Insense, mais c'est le code.

### Strategie : priorisation des menaces

Quand plusieurs ennemis sont visibles a la fois, les bots ponderent la distance, s'ils se font tirer dessus, et -- au-dessus de Facile -- si la menace principale est en train d'etre soignee :

| Competence | Vise le soigneur a la place ? |
| --- | --- |
| Facile | Non |
| Normal | 50% de chance |
| Difficile | Oui |
| Expert | Oui |

Les ennemis a plus de 500 HU sont normalement depriorises comme non-immediats. Exceptions : les bots Difficile/Expert traitent toujours les Medics et Engineers distants comme des menaces immediates, et tout Sniper ennemi visant approximativement dans votre direction est toujours traite comme immediat quelle que soit la distance et la competence.

| Competence | Medics/Engineers distants/Snipers visant = menace immediate ? |
| --- | --- |
| Facile/Normal | Non |
| Difficile/Expert | Oui |

Cette verification du Sniper a une histoire vraiment amusante. L'ecrit original de Sigsegv supposait que le jeu exigeait que le produit scalaire entre le vecteur de visee du sniper et la position relative du bot soit *exactement zero* -- une comparaison si precise qu'elle ne se declencherait presque jamais en calcul flottant, rendant toute la fonctionnalite effectivement du code mort. Une correction publiee plus tard (credit a une decompilation Hex-Rays plus propre) a montre que la verification reelle est `produit scalaire > 0` : tout Sniper faisant face de directement vers vous a perpendiculairement a vous est considere comme une menace immediate ; tout ce qui va de perpendiculaire a tournant le dos ne l'est pas. La mauvaise lecture originale venait d'une mauvaise decompilation d'une comparaison SSE de flottants -- faire du reverse-engineering sur un binaire AAA n'est pas une science exacte.

### Mouvement : esquive

Les bots Faciles n'esquivent jamais, point final. Les bots Normal et superieurs esquivent a gauche/droite (33% gauche, 33% droite, 33% ne rien faire, pondere contre les trous detectes) quand ils tiennent une arme de combat, ont vu un ennemi dans les 3 dernieres secondes, et que cet ennemi a une ligne de vue sur eux.

Ils n'esquiveront *pas* si l'un de ces cas s'applique : attribut `DisableDodge` defini, comportement actuel dit de se depcher, actuellement invulnerable (n'importe quel uber), en pleine nargue/provocation, joue Engineer, invisible ou deguise en Spy, en visee comme Sniper ou en rotation comme Heavy, ou en train de bander le Huntsman.

### Mouvement : eviter de bousculer les ennemis

Au-dessus de Normal, les bots essaient specifiquement de ne pas rentrer dans les ennemis en se deplacant :

| Competence | Evite de bousculer les ennemis ? |
| --- | --- |
| Facile | Non |
| Normal | Non |
| Difficile | Oui |
| Expert | Oui |

En pratique, cela n'a d'importance que pour les bots Spy -- eviter une collision genante avec un joueur ennemi est exactement le genre de chose qui compromet un deguisement.

### Pyro : maitrise de l'airblast

L'airblast sert a deux choses : reflechir les projectiles (PvP et MvM) et pousser les ennemis proches des rebords (PvP seulement). Que le bot appuie ou non sur la detente face a une opportunite valide est un pile-ou-face base sur la competence :

| Competence | Chance de declencher l'airblast |
| --- | --- |
| Facile | 0% |
| Normal | 50% |
| Difficile | 90% |
| Expert | 100% |

Les bots Pyro Faciles ne peuvent litteralement pas faire d'airblast -- le tirage est code en dur pour ne jamais reussir, pas juste "rarement."

### Spy : efficacite du deguisement

Deux axes distincts evoluent avec la competence. Choix du *deguisement* :

| Competence | Methode de deguisement |
| --- | --- |
| Facile/Normal | Classe aleatoire, ignorant ce que l'equipe ennemie joue reellement |
| Difficile/Expert | Choisit un vrai joueur ennemi et copie sa classe exacte |

*Comportement* en deguisement :

| Competence | Comportement en deguisement/invisibilite |
| --- | --- |
| Facile/Normal | Fixe les joueurs ennemis quand il les voit (suspect) |
| Difficile/Expert | Evite deliberement le contact visuel (plus convaincant) |

### Spy : agressivite du backstab

A longue portee (jusqu'a 300 HU, `tf_bot_spy_knife_range`), un bot Spy ne s'engage dans un backstab que s'il peut voir la victime et que le dos de la victime est au moins partiellement tourne. La competence determine a quel point cet angle de dos peut etre decentre :

| Competence | Tolerance d'angle |
| --- | --- |
| Facile | Tente meme si vous lui faites face directement |
| Normal | ±45° de votre dos |
| Difficile | ±78° de votre dos |
| Expert | ±90° de votre dos (arc arriere complet de 180°) |

Les bots Spy Faciles sont fonctionnellement suicidaires -- ils tenteront un coup de couteau sur quelqu'un qui les regarde droit dans les yeux. **Exception :** dans Mann vs. Machine, chaque bot Spy est force a la contrainte d'angle Normal quel que soit son niveau de competence reel.

### Tactiques : selection d'armes

Ne s'active qu'au-dessus de Facile, et surtout sans importance en MvM puisque les bots y ont generalement des restrictions d'armes strictes :

- **Scout** : passe a l'arme secondaire quand le chargeur du primaire est vide.
- **Soldier** : passe a l'arme secondaire quand le chargeur est vide *et* la cible a moins de 500 HU.
- **Sniper** : passe a l'arme secondaire pour les cibles a moins de 750 HU.
- **Pyro** : passe a l'arme secondaire pour les cibles a plus de 750 HU, sauf si cette cible est un Soldier ou un Demoman.

### Tactiques : rechargement a couvert

Pas utilise en MvM. Si le comportement actuel du bot ne lui dit pas de battre en retraite, que son chargeur principal est vide, et qu'il n'est pas uberise, les bots de niveau superieur se retireront temporairement a couvert pour recharger au lieu de cliquer sur une arme vide face a vous :

| Competence | Se retire pour recharger ? |
| --- | --- |
| Facile | Non |
| Normal | Non |
| Difficile | Oui |
| Expert | Oui |

### Mode CP : errance du defenseur

Pas utilise en MvM. En defendanant un point de controle, les bots de niveau superieur sont plus susceptibles de quitter le point pour chasser des kills ("search and destroy"), mais seulement avec un temps decent restant sur `tf_bot_defense_must_defend_time` :

| Competence | Chance d'errer |
| --- | --- |
| Facile | 10% |
| Normal | 50% |
| Difficile | 75% |
| Expert | 90% |

### Mode CP : blocage de capture

Pas utilise en MvM. Les bots defenseurs contestant une tentative de capture ennemie :

| Competence | Tentera de bloquer la capture ? |
| --- | --- |
| Facile | Non |
| Normal | 50% de chance |
| Difficile | Oui |
| Expert | Oui |

---

## Le tableau recapitulatif complet

<div style="overflow-x:auto">

| Aspect | Facile | Normal | Difficile | Expert | Notes |
| --- | --- | --- | --- | --- | --- |
| Vision : temps de reconnaissance | 1,00s | 0,50s | 0,30s | 0,20s | |
| Visee : taux de suivi | 1x/s | 4x/s | 10x/s | 20x/s | Les Spies utilisent toujours Normal |
| Compensation d'arc grenade/bombe collante | Oui | Oui | Oui | Oui | Loose Cannon exempt |
| Compensation verticale Huntsman | Non | Oui | Oui | Oui | |
| Headshots Huntsman | Non | <150 HU | Oui | Oui | |
| Tir aux pieds Lance-roquettes | Non | Oui | Oui | Oui | Direct Hit & Cow Mangler exempts |
| Point de visee Fusil de sniper | Corps | ~33% vers tete | Tete | Tete | |
| Chance de remarquer les tirs discrets | 10% | 30% | 60% | 90% | Divisee par 2 si masquee par tirs bruyants |
| Vise le soigneur | Non | 50% | Oui | Oui | |
| Medic/Engineer/Sniper distant = menace | Non | Non | Oui | Oui | |
| Esquive | Non | Oui | Oui | Oui | Longue liste d'exceptions |
| Evite de bousculer les ennemis | Non | Non | Oui | Oui | Surtout important pour Spy |
| Chance de declencher l'airblast | 0% | 50% | 90% | 100% | |
| Choix de classe du deguisement Spy | Aleatoire | Aleatoire | Correspond a un vrai ennemi | Correspond a un vrai ennemi | |
| Contact visuel Spy en deguisement | Fixe (evident) | Fixe | Evite (convaincant) | Evite | |
| Angle de backstab Spy | ~0° | ±45° | ±78° | ±90° | MvM force Normal |
| Logique de selection d'armes | Non | Oui | Oui | Oui | Moins pertinent en MvM |
| Rechargement a couvert | Non | Non | Oui | Oui | Pas en MvM |
| Errance defenseur CP | 10% | 50% | 75% | 90% | Pas en MvM |
| Blocage de capture CP | Non | 50% | Oui | Oui | Pas en MvM |

</div>

---

## Conclusion

![Heavy bot TF2 visant avec un minigun](assets/tf2-bot-ai-heavy-aim.png)

Rien de tout cela n'est le fruit d'une erreur de conception de la part de Valve -- c'est un systeme delibere, entierement deterministe, de scores et de probabilites, simplement jamais ecrit nulle part officiellement. Quelques points a retenir :

1. **La "competence" est un ensemble de curseurs independants**, pas un multiplicateur global. Le temps de reaction, la cadence de visee, et chaque comportement tactique evoluent separement, et certains (taux de suivi Spy, angle de backstab MvM) ont des ecrasements codes en dur quel que soit le niveau.
2. **Une partie est vraiment buguee, pas juste vieille.** La liste des armes discretes gelee depuis 2010, le Cow Mangler sans logique de tir aux pieds pour aucune bonne raison, la verification du produit scalaire du Sniper qui a pris des annees pour etre correctement decompilee -- le code IA de Valve a des cicatrices comme n'importe quelle base de code de 17 ans.
3. **Vous pouvez utiliser tout cela.** Sachez qu'un bot Sniper ne vous headshotera pas en Normal, qu'un Pyro Facile ne peut litteralement pas reflechir votre roquette, qu'un Spy Facile essaiera de vous poignarder face a face. Ce n'est pas de la chance. C'est une fiche technique.

Un immense merci a sigsegv pour la plongee dans le code original qui a rendu la majeure partie de cela possible, au wiki TF2 pour la documentation de base sur les commandes de bots et le support des cartes, et a tous ceux dans la communaute qui continuent de trifouiller une IA de bot vieille de 17 ans pour comprendre exactement pourquoi elle fait ce qu'elle fait.
