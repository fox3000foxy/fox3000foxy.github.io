---
title: "Les bots TF2 ne sont pas aléatoires : J'ai redécouvert chaque paramètre de difficulté"
description: "Vision, visée, angles de backstab, logique de headshot, chaque bug connu -- Valve n'a jamais rien documenté. Alors on a fouillé le code et transformé le tout en fiche technique complète."
date: 2026-07-12
authors:
  - fox3000foxy
tags:
  - tf2
  - jeu-ia
  - ingenierie-inversee
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "d4vNgsFgyD2NMsBbIfFCbGcRhOeikzJtzbQ6tcWPjje+YNe8BsGJqnkU5aRr7UVPJe2jeIrIMt93eRJDMdEMFA=="
---

## Introduction

![Soldat bot TF2 visant avec un lance-roquettes](assets/tf2-bot-ai-soldier-aim.png)

Chaque joueur de TF2 l'a dit au moins une fois : « ce bot triche. » Ou l'inverse : « pourquoi ce bot Facile reste planté à manger des roquettes. » Personne ne sait vraiment ce que « Facile », « Normal », « Difficile » et « Expert » signifient réellement sous le capot — Valve a expédié quatre étiquettes de difficulté et exactement zéro documentation.

Alors une bande d'entre nous (moi, awimii, Mush The Possum, avec une énorme partie du travail de base fait par sigsegv, qui a vraiment fouillé le code décompilé du jeu) a rassemblé un document de recherche complet sur le comportement des TFBot. Chaque mécanique, chaque bug connu, chaque probabilité codée en dur. Cet article est le compte-rendu intégral, pas la version condensée. Prenez un Bonk, ça va être long.

---

## Chapitre I : Les Bases

### Bot vs Bot Marionnette

TF2 a deux choses complètement différentes que les gens appellent « bots » :

- **Bots IA (TFBots)** : véritable IA, construite sur le même framework PlayerBot/Infected que Valve a utilisé pour la série *Left 4 Dead*. Ils choisissent une classe aléatoire, jouent l'objectif, fonctionnent sans `sv_cheats` et déclenchent les succès comme un vrai joueur.
- **Bots Marionnette** : zéro IA, incapables de bouger ou d'agir par eux-mêmes. Ils existent uniquement pour être contrôlés manuellement — un joueur peut les forcer à suivre, viser et tirer. Principalement utilisés pour les tests ou pour faire des captures d'écran et vidéos cinématiques. Les faire apparaître nécessite `sv_cheats 1`, ce qui désactive aussi les succès pour la session.

Cet article porte entièrement sur le premier type.

### Ce qu'on peut (plus ou moins) dire aux bots IA de faire

Les TFBot ne sont pas directement contrôlables, mais on peut les inciter à faire certaines choses :

- Visez n'importe quel bot (allié ou ennemi) avec votre crosshair et il vous narguera si vous utilisez les bonnes commandes vocales.
- Un bot Medic allié vous soigne si vous utilisez la commande vocale « Medic! »
- Si un bot Medic vous soigne et a une UberCharge prête, dire « Go go go! » ou « Activez la charge! » le fait déclencher la charge immédiatement.
- Un bot Medic avec une charge prête l'active automatiquement dès que lui-même ou sa cible de soin prend des dégâts sérieux, sans commande vocale nécessaire.
- Les bots effectuent spontanément des nargues en duo (High Five) ou des nargues de groupe (Conga) avec des coéquipiers proches.

### Faire fonctionner les bots sur des cartes non supportées

Les bots dépendent d'un maillage de navigation pour savoir où ils ont le droit de marcher, et la plupart des cartes communautaires n'en fournissent pas. Pour forcer :

1. `sv_cheats 1`
2. `nav_generate` — construit le navmesh initial, progression affichée dans la console
3. Attendez que le jeu finisse de générer les chemins
4. Optionnellement, corrigez manuellement les mauvaises données de navigation avec `nav_edit 1`
5. Rechargez ou redémarrez le serveur (sauter cette étape désactive les succès)
6. `tf_bot_add <nombre>` pour faire apparaître les bots

**Avertissement :** modifier le navmesh pendant que des bots sont actifs sur le serveur peut planter le jeu. Une fois le maillage existant, vous n'avez pas besoin de le régénérer pour les sessions futures — ajoutez simplement les bots avec `tf_bot_add`.

Les maillages auto-générés fonctionnent mieux sur les cartes Point de Contrôle, King of the Hill, Payload et CTF. Sur les cartes Mannpower, les bots adoptent par défaut un comportement de type CTF mais utilisent à peine les grappins ou les powerups. Si une carte n'a pas d'objectif que l'IA du bot reconnaît mais possède une entité de salle d'apparition, définir `tf_bot_offense_must_push_time 0` permet aux bots de combattre quand même.

*(Source pour cette section : la page Bots du wiki officiel TF2.)*

### Statut actuel, carte par carte

Grâce à la mise à jour Hatless, chaque classe fonctionne correctement maintenant, y compris le Spy historiquement bugué. Les bots se comportent correctement sur la plupart des cartes KOTH officielles, certaines cartes Payload, Dustbowl/Gorge Attack-Defense et les cartes CTF/Mann Manor — même si sur ces deux dernières vous ne pouvez pas les faire apparaître directement avec `tf_bot_add`. Sur les cartes non supportées (via le processus nav_generate ci-dessus), ils fonctionnent, mais sont nettement moins bons pour imiter un vrai joueur.

Les cartes PLR sont une cause perdue : les bots ne peuvent pas franchir les barrières sur Hightower et se coincent dans les coins, et sur toutes les autres cartes PLR ils font juste... une fête de la danse au lieu de jouer. Peut-être que ça sera corrigé un jour. Peut-être pas.

### Comportement général des bots

Un fourre-tout de choses que chaque bot fait indépendamment de son niveau :

- Les bots utilisent seulement des loadouts de base (un plugin peut leur forcer des armes non-standard, mais les bots vanilla ne choisissent jamais les leurs).
- Les bots Faciles utilisent à peine leur arme secondaire. Les difficultés supérieures passent à l'arme secondaire dès que le chargeur principal est vide, ou pour compenser la distance.
- Les bots ne savent pas faire de techniques de mouvement — pas de rocket jump, pas de relocalisation de bâtiment.
- Après un kill, un bot peut narguer, même sous le feu — sauf s'il porte le renseignement ennemi, et cette règle s'applique aussi en MvM.
- Les bots Spy déguisés (joueur ou IA) sont correctement ignorés par les autres bots — jusqu'à ce qu'ils touchent un ennemi, sabotent quelque chose, tirent ou deviennent invisibles près d'un. Une fois « découverts », ce bot/joueur spécifique est mémorisé comme Spy jusqu'à ce qu'il change de déguisement tout en restant invisible, meure ou simule sa mort avec le Dead Ringer.
- Les bots Pyro utilisent la Compression Blast libéralement à partir du niveau Normal.
- Les bots Medic priorisent les soins sur tout le monde sauf les Snipers (et, dans une moindre mesure, les Engineers), même si vous spammez « Medic! » en tant que tel.
- Les bots Medic gravitent vers les Heavies, Soldiers, Demomen et Pyros — spécifiquement si un *humain* joue ces classes. Pas d'humain dans ces rôles, pas d'attention particulière du Medic.
- Les bots restent en position pendant le temps de préparation sur les cartes Attack/Defense et Payload — sauf les Engineers, Snipers et Spies, qui se déplacent librement (les bots Demoman sont aussi autorisés à pré-placer des bombes collantes).
- Les bots Engineer n'améliorent ni ne désactivent jamais les constructions d'un autre Engineer allié, à moins que cette construction ne se trouve sur le chemin de leur cible. Ils ne réparent parfois tout simplement pas leur propre tourelle, même quand ça semble évident.
- Les bots Spy repérés passent à leur revolver et reculent au lieu de forcer un coup de couteau.
- Les bots Demoman qui ont localisé une sentinelle (généralement en mourant dessus une fois) peuvent parfaitement lancer des bombes collantes dessus depuis l'extérieur de sa portée, en arc de cercle à travers les murs et les plafonds quand la géométrie le permet.
- Les bots Sniper qui ne trouvent pas de cible après avoir visé utilisent l'une des lignes vocales « Negatives. »
- Les Medics alliés soignent un Spy déguisé sans hésitation.

### Problèmes / bugs connus

Le document liste un bon nombre de bizarreries de longue date :

- Les bots peuvent essayer de marcher ou de tirer à travers certains props statiques.
- Chaque fois qu'un joueur/bot se démasque, se déguise ou se révèle, les bots proches le « voient » et se retournent pour réagir — même si l'événement s'est produit en dehors de leur champ de vision réel. Ce n'est pas basé sur le son ; c'est un contournement du test de vision.
- Rarement, les bots peuvent rester physiquement coincés ensemble en utilisant un téléporteur d'Engineer.
- Les commandes vocales des bots (ex. « Spy! », « En avant! ») ne s'affichent pas en texte dans le chat comme celles des joueurs.
- Un bot Medic soignant activement quelqu'un n'esquivera pas les tirs entrants ni ne prendra de kits de soin, même à des PV critiques.
- Les bots peuvent continuer à bouger pendant une nargue en duo, ce qui brise l'effet prévu du Festive Critical Strike.
- Les bots Medic récemment blessés refusent souvent d'utiliser le Syringe Gun à distance, préférant le corps à corps (ou, dans de très rares cas, essayant de vous toucher avec le rayon du Medi Gun lui-même).
- Les bots Medic ne compensent pas la gravité pour les tirs du Syringe Gun — probablement parce que l'arme n'est pas correctement marquée comme non-hitscan dans le code IA.
- Les bots Spy peuvent voir et suivre un Spy invisible (joueur ou IA) si ce Spy a déjà été découvert une fois, indépendamment du niveau de compétence du bot qui le suit.
- Même si un joueur-Spy se déguise en classe de sa propre équipe, heurter un ennemi le démasque quand même (les bots ne font jamais ça à eux-mêmes, puisque les bots ne se déguisent jamais en leur propre équipe).
- Les bots respectent l'équilibrage automatique des équipes — si vous essayez d'entasser des bots d'un côté, vous devez d'abord utiliser `mp_teams_unbalance_limit 0`.
- Les bots Engineer peuvent complètement ignorer leurs propres constructions jusqu'à ce qu'elles soient détruites.
- Les bots Heavy essaient parfois de tirer au Minigun alors qu'ils sont à court de munitions, surtout en dessous du niveau Difficile.
- Les bots Medic de l'équipe perdante se suicident occasionnellement pendant la phase d'Humiliation quand aucun ennemi n'est proche — quelque chose qu'un joueur humain ne peut pas reproduire même en essayant.
- Régler votre aperçu d'équipe sur BLU dans l'écran de chargement fait que les bots RED vous semblent visuellement rendus en BLU.
- Les bots avec une arme de corps à corps sortie refusent parfois de changer d'arme même après avoir ramassé des munitions.
- Après Jungle Inferno, les bots apparus avec des paramètres explicites (ex. `tf_bot_add 5 pyro bleu normal`) peuvent mourir instantanément dans leur propre salle d'apparition. Correctif : `tf_bot_reevaluate_class_in_spawnroom 0` (nécessite `sv_cheats 1`).

### Noms des IA

Les noms des bots sont tirés d'un grand réservoir de références à TF2, à d'autres jeux Valve et à la culture de programmation, en grande partie parce que la communauté n'arrêtait pas d'en demander des spécifiques sur les forums Steam. Un échantillon de la liste : *AimBot, Aperture Science Prototype XR7, Black Mesa, Companion Cube, C++, Divide by Zero, GLaDOS, H@XX0RZ, Saxton Hale, The G-Man, trigger_hurt, 0xDEADBEEF*, et des dizaines d'autres dans le même genre.

Il y a aussi un lot de noms trouvés dans un build source fuité qui n'a jamais été expédié en production, pour des raisons peu claires — principalement des références à *Last Dragon* et *The Fifth Element* comme *John Spartan, Leeloo Dallas Multipass, Sho'nuff, Bruce Leroy, Big Gulp Huh?* et *I'm your huckleberry*.

Vous pouvez remplacer tout cela vous-même : `tf_bot_add heavyweapons blue "Blu Hoovy"` fait apparaître un Heavy BLU nommé « Blu Hoovy. »

---

## Chapitre II : Les Bots Originaux / TFBots — Plongée dans les Niveaux de Compétence

Le cadre original de Sigsegv tient toujours : il est évident que les bots Expert surpassent les bots Facile, mais Valve n'a jamais expliqué *combien* ni *pourquoi*. Donc la seule façon de savoir est de lire le code. Voici chaque mécanique qui évolue avec la compétence.

### Régler la difficulté

En dehors du MvM, la difficulté est contrôlée par une cvar :

| `tf_bot_difficulty` | Niveau de difficulté |
| --- | --- |
| 0 | Facile |
| 1 | Normal (par défaut) |
| 2 | Difficile |
| 3 | Expert |

`tf_bot_add` accepte aussi un argument de difficulté directement (`easy`/`normal`/`hard`/`expert`).

### Popfiles MvM

Dans Mann vs. Machine, chaque bloc de spawn `TFBot` dans le popfile a une clé `Skill` optionnelle. Pas de clé signifie Facile. Dans les missions de Valve : les Géants sont presque toujours Expert, les Engineers et les Spies sont presque toujours Expert, et les Snipers sont généralement Difficile (occasionnellement Expert). Si vous utilisez `EventChangeAttributes` (ajouté dans la mise à jour Two Cities) pour modifier dynamiquement les bots en cours de vague en fonction d'événements de carte, la compétence du bot est l'une des propriétés que vous pouvez changer à la volée.

### Mode Endless MvM

Le mode Endless n'a jamais été officiellement expédié, mais dedans, les bots dépensent leur argent en améliorations comme les joueurs — y compris une amélioration exclusive aux bots qui augmente leur niveau de compétence IA en cours de jeu.

### L'entité `bot_generator`

Une entité obscure, largement non documentée, présumée avoir été utilisée dans le mode entraînement et peut-être dans le développement précoce du MvM. Elle expose une entrée `SetDifficulty` pour contrôler le niveau de compétence. Au-delà, la piste se refroidit — Valve ne l'a jamais documentée et personne n'a entièrement cartographié son comportement.

### Couleur de lueur oculaire

Les robots MvM ont une particule de lueur oculaire qui change de couleur avec le niveau de compétence — un indicateur visuel que personne en dehors de la communauté n'a jamais expliqué :

| Compétence | Couleur des yeux | RVB |
| --- | --- | --- |
| Facile/Normal | Bleu | `#24b4ff` |
| Difficile/Expert | Jaune | `#fff000` |

![Heavy bot TF2 en position d'attente](assets/tf2-bot-ai-heavy-idle.png)

### Vision : temps de reconnaissance

Un bot ne réagit pas instantanément quand quelque chose entre dans son champ de vision — il y a un délai codé en dur avant que le reste de l'IA soit même autorisé à reconnaître la menace :

| Compétence | Temps de reconnaissance minimum |
| --- | --- |
| Facile | 1,00 s |
| Normal | 0,50 s |
| Difficile | 0,30 s |
| Expert | 0,20 s |

C'est l'essentiel de l'effet « les bots Faciles ont l'air stupides » en un seul chiffre — un bot Facile ne vise pas moins bien une fois qu'il vous a remarqué, il met juste cinq fois plus de temps à remarquer votre existence.

### Visée : taux de suivi

Les bots ne vous traquent pas en continu. Ils échantillonnent votre position et votre vitesse à un intervalle fixe et prévoient une ligne droite à partir de là :

| Compétence | Intervalle de recalcul | Taux équivalent |
| --- | --- | --- |
| Facile | 1,00 s | 1x/s |
| Normal | 0,25 s | 4x/s |
| Difficile | 0,10 s | 10x/s |
| Expert | 0,05 s | 20x/s |

**Exception :** les bots Spy sont codés en dur avec le taux de suivi Normal quel que soit leur niveau de compétence réel — un Spy Expert vise toujours comme un bot Normal. Il existe aussi une vidéo de démonstration publique comparant les taux de suivi côte à côte si vous voulez voir l'écart 1x vs 20x en mouvement.

### Visée : compétence spécifique aux armes

Les bots ne visent pas juste votre centre de masse — ils ont une logique par arme, parfois vraiment buguée :

**Lance-grenades & Lance-bombes collantes.** Tous les niveaux de compétence compensent l'arc vertical, en utilisant une valeur fixe de la cvar `tf_bot_ballistic_elevation_rate`. Parce que cette compensation ne s'active que pour l'ID d'arme de base, les variantes de projectiles plus rapides (Loch-n-Load, tout ce qui a un modificateur de vitesse de projectile) n'ont pas d'arc correctement ajusté. Et comme c'est lié par l'ID d'arme spécifiquement, le Loose Cannon — un ID différent — ne reçoit aucune compensation d'arc.

**Huntsman.** Les bots Faciles ne compensent pas la chute de la flèche et ne cherchent jamais les headshots. Les bots de niveau Normal compensent l'arc, mais ne visent la tête qu'à moins de 150 HU. Les bots Difficile/Expert visent toujours la tête.

**Lance-roquettes.** Au-delà de 150 HU, les bots non-Faciles visent vos pieds au lieu du centre de masse, maximisant les chances de dégâts de zone et de repoussement. À moins de 150 HU, ils passent aux headshots. Les bots Faciles visent toujours le centre de masse quelle que soit la distance. C'est aussi verrouillé par ID d'arme : le Direct Hit et le Cow Mangler n'héritent pas de ce comportement. Logique pour le Direct Hit (pas de zone d'effet à exploiter) ; zéro sens pour le Cow Mangler — cette partie de l'IA prédate l'existence de l'arme et n'a simplement jamais été revue.

**Fusils de sniper.** Facile vise le corps. Normal vise environ à 33% du corps vers la tête. Difficile/Expert visent directement la tête. Moins important en MvM, où les headshots des bots n'obtiennent pas le bonus de dégâts de toute façon.

### Ouïe : sensibilité aux tirs discrets

Chaque coup de feu alerte les bots proches de la position du tireur, même à travers les murs, jusqu'à 3000 HU avec 100% de chance d'être remarqué (`tf_bot_notice_gunfire_range`). Mais un sous-ensemble d'armes sont marquées « discrètes » — audibles seulement dans 500 HU (`tf_bot_notice_quiet_gunfire_range`), et même alors avec une chance dépendante de la compétence :

| Compétence | Chance de remarquer un tir discret |
| --- | --- |
| Facile | 10% |
| Normal | 30% |
| Difficile | 60% |
| Expert | 90% |

Cette probabilité est divisée par deux si un tir *bruyant* a été entendu dans les 3 dernières secondes — les sons forts masquent les sons faibles.

La liste des ID d'armes discrètes n'a pas été mise à jour depuis décembre 2010. Tout ajout ultérieur utilisant un nouvel ID d'arme est traité comme bruyant par défaut, peu importe à quel point il devrait logiquement être discret, sauf s'il réutilise un ID plus ancien. Concrètement :

| ID d'arme | Couvre |
| --- | --- |
| `TF_WEAPON_KNIFE` | Tous les couteaux de Spy |
| `TF_WEAPON_FISTS` | Coups de poing spécifiques au Heavy (son coup de poing multi-classe est en fait `TF_WEAPON_FIREAXE`) |
| `TF_WEAPON_PDA` | Présumé inutilisé directement |
| `TF_WEAPON_PDA_ENGINEER_BUILD` | PDA de construction de l'Engineer |
| `TF_WEAPON_PDA_ENGINEER_DESTROY` | PDA de destruction de l'Engineer |
| `TF_WEAPON_PDA_SPY` | Kit de déguisement du Spy |
| `TF_WEAPON_BUILDER` | Kit d'outils de Spy/Engineer/Saboteur |
| `TF_WEAPON_MEDIGUN` | Tous les Medi Guns |
| `TF_WEAPON_DISPENSER` | Probablement inutilisé (les Dispensers sont des objets, pas des armes) |
| `TF_WEAPON_INVIS` | Toutes les montres d'invisibilité de Spy |
| `TF_WEAPON_FLAREGUN` | Tous les pistolets à fusée Pyro *sauf* le Manmelter |
| `TF_WEAPON_LUNCHBOX` | Sandwich, Dalokohs Bar, Buffalo Steak Sandvich, Bonk!, Crit-a-Cola |
| `TF_WEAPON_JAR` | Jarate (pas Mad Milk — ID séparé, non-discret) |
| `TF_WEAPON_COMPOUND_BOW` | Huntsman |
| `TF_WEAPON_SWORD` | Eyelander, Skullcutter, Claidheamh Mor, Persian Persuader, Half-Zatoichi |
| `TF_WEAPON_CROSSBOW` | Crusader's Crossbow |

L'exemple classique de la liste qui pourrit : le Manmelter a reçu son propre ID (`TF_WEAPON_RAYGUN_REVENGE`), ajouté après que la liste des armes discrètes ait été gelée — donc il est traité comme bruyant, malgré être un pistolet à fusée dans tous les sens pratiques. Le Scorch Shot, sorti encore plus tard, réutilise l'ID de base `TF_WEAPON_FLAREGUN` et est donc toujours considéré comme discret. Insensé, mais c'est le code.

### Stratégie : priorisation des menaces

Quand plusieurs ennemis sont visibles à la fois, les bots pondèrent la distance, s'ils se font tirer dessus et — au-dessus de Facile — si la menace principale est en train d'être soignée :

| Compétence | Vise le soigneur à la place ? |
| --- | --- |
| Facile | Non |
| Normal | 50% de chance |
| Difficile | Oui |
| Expert | Oui |

Les ennemis à plus de 500 HU sont normalement dépriorisés comme non-immédiats. Exceptions : les bots Difficile/Expert traitent toujours les Medics et Engineers distants comme des menaces immédiates, et tout Sniper ennemi visant approximativement dans votre direction est toujours traité comme immédiat quelle que soit la distance et la compétence.

| Compétence | Medics/Engineers distants/Snipers visant = menace immédiate ? |
| --- | --- |
| Facile/Normal | Non |
| Difficile/Expert | Oui |

Cette vérification du Sniper a une histoire vraiment amusante. L'écrit original de Sigsegv supposait que le jeu exigeait que le produit scalaire entre le vecteur de visée du sniper et la position relative du bot soit *exactement zéro* — une comparaison si précise qu'elle ne se déclencherait presque jamais en calcul flottant, rendant toute la fonctionnalité effectivement du code mort. Une correction publiée plus tard (crédit à une décompilation Hex-Rays plus propre) a montré que la vérification réelle est `produit scalaire > 0` : tout Sniper faisant face de directement vers vous à perpendiculairement à vous est considéré comme une menace immédiate ; tout ce qui va de perpendiculaire à tournant le dos ne l'est pas. La mauvaise lecture originale venait d'une mauvaise décompilation d'une comparaison SSE de flottants — faire du reverse-engineering sur un binaire AAA n'est pas une science exacte.

### Mouvement : esquive

Les bots Faciles n'esquivent jamais, point final. Les bots Normal et supérieurs esquivent à gauche/droite (33% gauche, 33% droite, 33% ne rien faire, pondéré contre les trous détectés) quand ils tiennent une arme de combat, ont vu un ennemi dans les 3 dernières secondes et que cet ennemi a une ligne de vue sur eux.

Ils n'esquiveront *pas* si l'un de ces cas s'applique : attribut `DisableDodge` défini, comportement actuel dit de se dépêcher, actuellement invulnérable (n'importe quel uber), en pleine nargue/provocation, joue Engineer, invisible ou déguisé en Spy, en visée comme Sniper ou en rotation comme Heavy, ou en train de bander le Huntsman.

### Mouvement : éviter de bousculer les ennemis

Au-dessus de Normal, les bots essaient spécifiquement de ne pas rentrer dans les ennemis en se déplaçant :

| Compétence | Évite de bousculer les ennemis ? |
| --- | --- |
| Facile | Non |
| Normal | Non |
| Difficile | Oui |
| Expert | Oui |

En pratique, cela n'a d'importance que pour les bots Spy — éviter une collision gênante avec un joueur ennemi est exactement le genre de chose qui compromet un déguisement.

### Pyro : maîtrise de l'airblast

L'airblast sert à deux choses : réfléchir les projectiles (PvP et MvM) et pousser les ennemis proches des rebords (PvP seulement). Que le bot appuie ou non sur la détente face à une opportunité valide est un pile-ou-face basé sur la compétence :

| Compétence | Chance de déclencher l'airblast |
| --- | --- |
| Facile | 0% |
| Normal | 50% |
| Difficile | 90% |
| Expert | 100% |

Les bots Pyro Faciles ne peuvent littéralement pas faire d'airblast — le tirage est codé en dur pour ne jamais réussir, pas juste « rarement. »

### Spy : efficacité du déguisement

Deux axes distincts évoluent avec la compétence. Choix du *déguisement* :

| Compétence | Méthode de déguisement |
| --- | --- |
| Facile/Normal | Classe aléatoire, ignorant ce que l'équipe ennemie joue réellement |
| Difficile/Expert | Choisit un vrai joueur ennemi et copie sa classe exacte |

*Comportement* en déguisement :

| Compétence | Comportement en déguisement/invisibilité |
| --- | --- |
| Facile/Normal | Fixe les joueurs ennemis quand il les voit (suspect) |
| Difficile/Expert | Évite délibérément le contact visuel (plus convaincant) |

### Spy : agressivité du backstab

À longue portée (jusqu'à 300 HU, `tf_bot_spy_knife_range`), un bot Spy ne s'engage dans un backstab que s'il peut voir la victime et que le dos de la victime est au moins partiellement tourné. La compétence détermine à quel point cet angle de dos peut être décentré :

| Compétence | Tolérance d'angle |
| --- | --- |
| Facile | Tente même si vous lui faites face directement |
| Normal | ±45° de votre dos |
| Difficile | ±78° de votre dos |
| Expert | ±90° de votre dos (arc arrière complet de 180°) |

Les bots Spy Faciles sont fonctionnellement suicidaires — ils tenteront un coup de couteau sur quelqu'un qui les regarde droit dans les yeux. **Exception :** dans Mann vs. Machine, chaque bot Spy est forcé à la contrainte d'angle Normal quel que soit son niveau de compétence réel.

### Tactiques : sélection d'armes

Ne s'active qu'au-dessus de Facile, et surtout sans importance en MvM puisque les bots y ont généralement des restrictions d'armes strictes :

- **Scout** : passe à l'arme secondaire quand le chargeur du primaire est vide.
- **Soldier** : passe à l'arme secondaire quand le chargeur est vide *et* la cible a moins de 500 HU.
- **Sniper** : passe à l'arme secondaire pour les cibles à moins de 750 HU.
- **Pyro** : passe à l'arme secondaire pour les cibles à plus de 750 HU, sauf si cette cible est un Soldier ou un Demoman.

### Tactiques : rechargement à couvert

Pas utilisé en MvM. Si le comportement actuel du bot ne lui dit pas de battre en retraite, que son chargeur principal est vide et qu'il n'est pas uberisé, les bots de niveau supérieur se retireront temporairement à couvert pour recharger au lieu de cliquer sur une arme vide face à vous :

| Compétence | Se retire pour recharger ? |
| --- | --- |
| Facile | Non |
| Normal | Non |
| Difficile | Oui |
| Expert | Oui |

### Mode CP : errance du défenseur

Pas utilisé en MvM. En défendant un point de contrôle, les bots de niveau supérieur sont plus susceptibles de quitter le point pour chasser des kills (« search and destroy »), mais seulement avec un temps décent restant sur `tf_bot_defense_must_defend_time` :

| Compétence | Chance d'errer |
| --- | --- |
| Facile | 10% |
| Normal | 50% |
| Difficile | 75% |
| Expert | 90% |

### Mode CP : blocage de capture

Pas utilisé en MvM. Les bots défenseurs contestant une tentative de capture ennemie :

| Compétence | Tentera de bloquer la capture ? |
| --- | --- |
| Facile | Non |
| Normal | 50% de chance |
| Difficile | Oui |
| Expert | Oui |

---

## Le tableau récapitulatif complet

<div style="overflow-x:auto">

| Aspect | Facile | Normal | Difficile | Expert | Notes |
| --- | --- | --- | --- | --- | --- |
| Vision : temps de reconnaissance | 1,00s | 0,50s | 0,30s | 0,20s | |
| Visée : taux de suivi | 1x/s | 4x/s | 10x/s | 20x/s | Les Spies utilisent toujours Normal |
| Compensation d'arc grenade/bombe collante | Oui | Oui | Oui | Oui | Loose Cannon exempt |
| Compensation verticale Huntsman | Non | Oui | Oui | Oui | |
| Headshots Huntsman | Non | <150 HU | Oui | Oui | |
| Tir aux pieds Lance-roquettes | Non | Oui | Oui | Oui | Direct Hit & Cow Mangler exempts |
| Point de visée Fusil de sniper | Corps | ~33% vers tête | Tête | Tête | |
| Chance de remarquer les tirs discrets | 10% | 30% | 60% | 90% | Divisée par 2 si masquée par tirs bruyants |
| Vise le soigneur | Non | 50% | Oui | Oui | |
| Medic/Engineer/Sniper distant = menace | Non | Non | Oui | Oui | |
| Esquive | Non | Oui | Oui | Oui | Longue liste d'exceptions |
| Évite de bousculer les ennemis | Non | Non | Oui | Oui | Surtout important pour Spy |
| Chance de déclencher l'airblast | 0% | 50% | 90% | 100% | |
| Choix de classe du déguisement Spy | Aléatoire | Aléatoire | Correspond à un vrai ennemi | Correspond à un vrai ennemi | |
| Contact visuel Spy en déguisement | Fixe (évident) | Fixe | Évite (convaincant) | Évite | |
| Angle de backstab Spy | ~0° | ±45° | ±78° | ±90° | MvM force Normal |
| Logique de sélection d'armes | Non | Oui | Oui | Oui | Moins pertinent en MvM |
| Rechargement à couvert | Non | Non | Oui | Oui | Pas en MvM |
| Errance défenseur CP | 10% | 50% | 75% | 90% | Pas en MvM |
| Blocage de capture CP | Non | 50% | Oui | Oui | Pas en MvM |

</div>

---

## Conclusion

![Heavy bot TF2 visant avec un minigun](assets/tf2-bot-ai-heavy-aim.png)

Rien de tout cela n'est le fruit d'une erreur de conception de la part de Valve — c'est un système délibéré, entièrement déterministe, de scores et de probabilités, simplement jamais écrit nulle part officiellement. Quelques points à retenir :

1. **La « compétence » est un ensemble de curseurs indépendants**, pas un multiplicateur global. Le temps de réaction, la cadence de visée et chaque comportement tactique évoluent séparément, et certains (taux de suivi Spy, angle de backstab MvM) ont des écrasements codés en dur quel que soit le niveau.
2. **Une partie est vraiment buguée, pas juste vieille.** La liste des armes discrètes gelée depuis 2010, le Cow Mangler sans logique de tir aux pieds pour aucune bonne raison, la vérification du produit scalaire du Sniper qui a pris des années pour être correctement décompilée — le code IA de Valve a des cicatrices comme n'importe quelle base de code de 17 ans.
3. **Vous pouvez utiliser tout cela.** Sachez qu'un bot Sniper ne vous headshotera pas en Normal, qu'un Pyro Facile ne peut littéralement pas réfléchir votre roquette, qu'un Spy Facile essaiera de vous poignarder face à face. Ce n'est pas de la chance. C'est une fiche technique.

Un immense merci à sigsegv pour la plongée dans le code original qui a rendu la majeure partie de cela possible, au wiki TF2 pour la documentation de base sur les commandes de bots et le support des cartes, et à tous ceux dans la communauté qui continuent de trifouiller une IA de bot vieille de 17 ans pour comprendre exactement pourquoi elle fait ce qu'elle fait.
