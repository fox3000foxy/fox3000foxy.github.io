---
title: "Chlone : six jours pour cloner ma façon de parler sur Discord"
description: "Récit de build, jour par jour : comment un agent opencode nommé chloeai, branché sur la mémoire OpenSelf, a appris à parler comme moi sur Discord en six jours et 146 commits."
date: 2026-09-18
tags: ["discord", "ai", "llm-agents", "openself", "python", "selfbot", "clone"]
authors: ["itsrealfortune"]
lang: "fr"
---

# Chlone : six jours pour cloner ma façon de parler sur Discord

*Récit de build, jour par jour - par itsrealfortune*

---

Voici l'histoire vraie d'un projet qui a duré six jours : **Chlone**, un bot Discord qui parle comme moi. Je raconte la journey comme elle s'est passée, dans l'ordre des 146 commits du repo, avec les heures, les échecs, les détours et les envies de tout jeter par la fenêtre - mais sans vous infliger les messages de commit.

Tout est parti d'une **compétition avec Fox**. Le sujet, une boutade : chacun devait donner vie à son propre clone sur Discord. Et j'ai pris une approche radicalement différente du **Protocol Luna** : je voulais miser sur l'agentique - un agent qui se sert des souvenirs et de tous les outils dont l'IA pouvait avoir besoin. Ironie du sort : après avoir monté toute la boîte à outils, je n'ai eu besoin que du MCP OpenSelf.

Le principe, une phrase : un agent [opencode](https://opencode.ai) du nom de `chloeai` tourne derrière un serveur HTTP (port 4096), garde des sessions persistantes par salon, pioche mes souvenirs dans OpenSelf, et écrit avec mon style - capturé dans `STYLE.md` à partir de mes vrais messages. Et pour ne pas sonner robot : burst de messages, fautes de frappe assumées, vocaux, GIFs, réactions, silence quand je dors, et pleins d'autres détails et mécanismes qui ont fait douter plus d'une dizaine de personnes quant à la nature du bot.

**C'est quoi, OpenSelf ?**

OpenSelf, c'est la mémoire. Une CLI (`openself`, installée via `npm i -g openself`) qui sert de vault de contexte privé et persistant pour mes agents IA. Dans le repo elle n'apparaît pas dans l'arborescence, mais elle est partout : dans l'archive `ecosystem.config.cjs` (le MCP et le dashboard OpenSelf lancés sous PM2 dès les premiers commits), dans `setup.sh` (`npm i -g openself`), et dans tout `tools/brain/memory.py`.

Concrètement, OpenSelf c'est :

- des **souvenirs typés** (`fact`, `preference`, `decision`, `relationship`, `event`, `note`), avec une sensibilité (public / personal / private / restricted), une note de confiance, une source, des tags ;
- des **scopes** : chaque souvenir appartient à un contexte - le mien, ou `discord/dm/<id>` pour une personne précise ;
- une **recherche hybride** (lexicale + vectorielle) exposée en MCP (`openself_openself_search_memory`, `openself_openself_get_context`) que l'agent `chloeai` interroge avant chaque réponse ;
- une **détection de conflits** (mon sweep mensuel du jour 5) et une dédupe à l'écriture ;
- un **vault chiffré** (clé dans Bitwarden) et un **dashboard local** (port 3210) pour inspecter le tout ;
- et pour les plus flemmards que moi : `openself feed` pour nourrir ta personnalité depuis tes historiques WhatsApp/Telegram, `openself test`, `openself share` (« Talk to My Clone », une page web), `openself arena` (deux clones qui débattent) ou `openself ghost` (il répond quand tu es offline). Moi j'ai fait le mien à la main, mais l'infrastructure était là.

En théorie, OpenSelf se suffit à lui tout seul pour avoir un clone, mais bon, vu tout ce que j'avais prévu de rajouter comme fonctionnalités, et vu que Discord n'est pas pris en charge, j'ai préféré n'utiliser que la partie souvenirs.

**Et d'où viennent les souvenirs et le style ?**

En amont de tout ça, j'ai fait analyser mes vrais messages Discord. Le tooling a passé au crible mes DMs et mes salons pour en extraire deux choses :

1. **Mon profil d'écriture** - la répartition majuscule/minuscule en début de phrase, le nombre d'emojis par message et leur position, la ponctuation (ou son absence : pas de point final en conversation normale), la longueur moyenne, le slang (`mdr`, `tkt`, `tho`), les expressions fétiches (« Bah », « En vrai ») et les réflexes du genre `quoi` -> `Feur`. Tout ça vit dans `STYLE.md`, que l'agent lit au démarrage de chaque session.
2. **Le corpus de souvenirs** qui peuple OpenSelf : qui sont les gens avec qui je parle, de quoi on cause, ce qu'il faut retenir de notre historique, qui est qui. Le bot ne répond pas dans le vide : il répond *à propos de* des gens qu'il « connaît ». Il lit les souvenirs des gens qui apparaissent dans la conversation pour savoir de qui il s'agit. Ca permet de garder un contexte persistant sur les autres, de ne pas les oublier.

Le bot n'a rien inventé : il a été calibré chiffre par chiffre sur du vrai. C'est pour ça qu'il sonne juste - et que les vagues « je note ton style » qui se font au doigt mouillé ont l'air pathétiques à côté.

Dans Chlone, OpenSelf joue le rôle central ensuite : quand quelque chose d'important passe dans un salon (mot-clé « projet », « ami », « relation », ou une demande explicite « retiens que... »), le bot tape un souvenir dans le vault via `save_to_memory` - typé, scopé par personne, dédupé, vérifié contre les conflits. Et quand la conversation reprend, l'agent fouille ses souvenirs avant de répondre. C'est ça, la différence entre un miroir et un clone.

---

---

## VENDREDI 11 SEPTEMBRE - Jour 1 : l'étincelle

### 08h24 - le premier commit

Tout part de zéro, mais tout est déjà là, en vrac. Un `discord_watch_bot.py` de 372 lignes - un selfbot qui écoute un channel et répond via un serveur HTTP opencode. Un prompt d'identité `CHLOEAI_PROMPT.md`. Un `STYLE.md`. Des scénarios et rapports de test pour un clone qui, à l'époque, s'appelait encore **Mimo**. Une config PM2 pour faire tourner le MCP et le dashboard OpenSelf. Et une base sqlite qui sert de contexte.

C'est le chaos fondateur. Je n'ai pas prévu de projet : j'ai prévu une expérience. Est-ce qu'on peut faire un bot qui sonne *vraiment* humain sur Discord ?

### 08h27 - le premier gitignore

Première leçon du vendredi matin : ne jamais commiter des bases sqlite `-wal` / `-shm`. Les fichiers de verrouillage de SQLite ne sont pas de la mémoire, ce sont des déchets. `.gitignore` naît.

### 08h44 - on range l'héritage

Je range l'héritage de Mimo : les rapports de test, les scénarios, les scripts d'intégration, la config PM2. Direction `archives/`. Je ne supprime rien - le projet est trop jeune pour que je jette quoi que ce soit. Ça deviendra une habitude.

Le rapport de test mérite qu'on s'y arrête : Mimo avait été testé sur **15 scénarios** (chat décontracté, vanne absurde, soutien émotionnel, avis négatif, conflit avec un inconnu, proposition de collaboration...) pour un **9.1/10**. Les commentaires du testeur sont un poème : *« vanne absurde trop explicative »*, *« parfois 2 phrases alors que 1 suffirait »*, *« "Prends soin de toi aussi" un peu long »*. C'est la feuille de route du projet avant même que le projet n'existe : **court = mieux**.

### 08h48, 09h07 - le va-et-vient des intents

Les `.pyc` au rebut, et un premier ménage sur la config... que je casse vingt minutes plus tard : sans intents activés, on ne reçoit pas le contenu des messages. Retour en arrière, plus un script de lancement (`run_watch_bot.sh`). Aller-retour en 20 minutes : c'est ça, l'exploration. Écrire un truc, casser, réécrire.

### 09h13 → 09h58 - l'usinage du prompt

La matinée est une série de polissages, d'abord du style, puis du contexte :

- plusieurs lignes de réponse = plusieurs messages envoyés l'un après l'autre (le burst), le prompt devient conscient de la conversation en cours ;
- fini les caches maisons pour récupérer les DMs : on tape directement l'API REST de Discord ;
- l'identité est re-rappée toutes les 5 messages, pour que le bot n'oublie pas qui il est en route ;
- suivi des auteurs déjà vus : pour une nouvelle tête, instruction explicite d'aller chercher dans les souvenirs ;
- affichage du vrai pseudo plutôt que l'objet interne ;
- les messages qu'on choisit d'ignorer deviennent du contexte passif pour la réponse suivante ;
- le « Bah » est dosé : rare, sinon le clone devient une caricature de moi ;
- le bot sait qu'il existe des souvenirs à aller chercher avant de répondre.

Chaque passage est un tour de vis. Le bot ne « parle », à ce stade, que parce que je lui rappelle qui il est à intervalles réguliers.

### 10h16 - les fautes de frappe

Le commit qui va définir le projet. Une faute d'orthographe n'est pas un bug : c'est une **preuve d'humanité**. 6% de chance de taper à côté sur le clavier AZERTY, 4% d'inverser deux lettres. Le message part avec la faute, puis est **édité 1-2 secondes plus tard** avec la correction. Parce qu'une vraie personne, elle envoie et corrige.

### 10h29, 10h32 - la voix

`fortune-v6.onnx` : un modèle TTS, entraîné pour ressembler à *ma* voix. Le bot ne va pas juste écrire comme moi, il va éventuellement *parler* comme moi. C'est à ce moment que le projet cesse d'être une blague et devient un peu bizarre. J'adore.

La mécanique tient en un commit : Piper génère l'audio, ffmpeg convertit en opus, l'API Discord envoie un vrai « voice message » avec waveform et durée. C'est fait en 3 minutes à peine après l'arrivée du modèle. L'envie était là depuis le début.

### 11h27 - le premier grand refactor

Trois heures après le premier commit, le monolithe de 456 lignes n'est plus gérable. J'éclate tout dans `tools/` : `config.py`, `discord_api.py`, `memory.py`, `opencode.py` (188 lignes), `typo.py`, `voice.py`. Le cycle est classique : coupler vite, péter, recomposer.

Suivent, en rafale :

- le token part du code et passe par un `.env` ;
- le bot surveille un channel, une liste, ou tout (`*`) ;
- la vieille base sqlite n'a plus raison d'être : la mémoire passe par OpenSelf ;
- les premiers `README.md`, et une première doc à peu près lisible ;
- un `setup.sh` : venv dédié (le python système porte un autre discord.py, piège classique), symlink de l'agent vers `~/.config/opencode/agents/`, prêt à tourner ;
- la mémoire sait *où* elle a été formée (identifiant de channel), et le taux de vocaux s'ajuste.

### 12h00 - les réflexes

Une nouvelle section dans le STYLE : les réflexes. Un réflexe, c'est un stimulus -> une réponse, sans réflexion. La porte est ouverte à la connerie.

Puis vient l'heure du déjeuner, et LA question existentielle : est-ce que le bot répond `Feur` quand on lui dit `quoi` ?

### 13h03 - « quoi ? » -> « Feur »

Oui. Bien sûr que oui. C'est le commit le plus important du projet, culturellement parlant. Je dirais même : le seul test unitaire qui compte.

On lubrifie ensuite :

- les auteurs affichés par leur *global name* ;
- la ponctuation tronquée avant de tester le réflexe (il faut couper le `quoi ?`, sinon pas de `Feur`) ;
- le fameux `tqt` corrigé en `tkt` dans le STYLE - les gens qui ne connaissent pas le projet vont se demander pourquoi je commite ça. Moi je sais : un clone qui écrit `tqt`, c'est un clone mal calibré, et personne ne veut parler à un clone mal calibré ;
- les mentions `@123456789` remplacées par de vrais noms dans le contexte ;
- le bot se met à surveiller tous les salons par défaut.

### 16h37 - le silence

Le `[void response]`. Le bot apprend le mot le plus important pour ne pas devenir un parasite social : **se taire**. Un message ambiant entre deux personnes qui ne le concernent pas = pas de réponse. La réserve est une fonctionnalité.

**Fin du jour 1 : 38 commits. Le bot écrit, faute, parle, se tait.**

---

---

## LUNDI 14 SEPTEMBRE - Jour 2 : la personnalité

On reprend, 10h du matin.

### 10h12 - qui parle à qui

Chaque pseudo reçu est préfixé d'un emoji par le système : 🧑 un humain, 🤖 un bot (à traiter plus sèchement), 👑 **la créatrice - c'est-à-dire moi** sur mon compte principal. Cette convention va gouverner tout le reste du projet : le clone ne doit jamais traiter sa « modèle d'origine » comme une inconnue.

### 10h16 - les règles de ponctuation

Je formalise dans le STYLE : pas de point final en conversation normale, point réservé aux situations sérieuses. Règle absolue. Un clone qui met des points partout, ça se sent.

### 10h58 - les GIFs

Ma librairie personnelle de GIFs, avec leurs règles d'usage : le Patrick Jane quand je prédit quelqu'un, la Miss Fortune quand je suis calme face à quelqu'un d'énervé, le gif du bescherelle qui tombe quand l'autre fait une faute. Un MCP statique les expose à l'agent. Le bot, à travers mes GIFs, devient un peu moi.

### 11h07 → 11h35 - peaufinage

Les hints de GIF dans le prompt s'affinent, les émojis customs de Discord font leur entrée (mes vrais, 14 IDs à jour), et la gestion des noms dans les hints mémoire est polie.

### 11h41 - un salon, une personnalité

Les sessions deviennent **par salon** : je ne parle pas de la même façon dans deux serveurs différents, et le bot non plus.

### 12h02 - la boîte à outils d'expression

Le prompt sait maintenant proposer mes GIFs *et* mes émojis customs au bon moment. Elle se remplit, cette boîte.

### 12h37 - l'hygiène d'identité

- le bot n'a JAMAIS le droit de dire quel modèle il est - impossible de citer opencode, un provider, un nom de modèle ;
- correction de « barista » dans l'identité (le bot est déjà meilleur que moi) ;
- je passe une heure à harmoniser la ponctuation de mes propres prompts, ce qui est d'une ironie parfaite.

### 12h50 - un script construit la personnalité

La section médias du prompt se génère à partir des dictionnaires (`render_medias.py`), fini l'édition à la main.

### 12h59 → 13h18 - doser l'identité

Le rappel d'identité, envoyé toutes les 5 messages, devient trop présent : passage toutes les 20 messages. Ajout d'une réinitialisation propre du contexte. Et purge du guide de style : on retire les expressions et formulations négatives périmées.

### 14h09 - le bot prend la parole tout seul

Le bot arrête d'être un refle : il peut **parler sans être adressé**, quand le contexte déclenche quelque chose (le fichier `behavior.py` naît, 91 lignes). C'est là qu'on bascule de « répondant » à « présence » : un vrai ami peut t'écrire en premier.

### 14h20, 14h22 - fiabiliser la réponse

Gestion d'erreur quand l'envoi échoue, et réaction possible au lieu d'une réponse - parfois une réaction vaut mille mots.

### 18h16 - prendre son temps

Le bot ne répond plus en 200ms comme un script. Il laisse passer un délai d'inactivité humain, il « prend son temps ». C'est ce qui rend le bot infoutu d'être pris pour un bot en démo : c'est le délai qui trahit toujours.

### 23h45 - la popote du soir

Il est presque minuit et je pousse une détection d'URL étendue aux domaines nus. Voilà le vrai flux de la journée : un truc brillant à 14h, puis de la popote le soir parce que je suis encore dans la zone.

**Fin du jour 2 : 61 commits cumulés. Le bot a une personnalité, des médias, des réflexes.**

---

---

## MARDI 15 SEPTEMBRE - Jour 3 : jour monstro

57 commits en une journée. C'est le jour où le projet devient... tout ce qu'il est aujourd'hui.

### 08h18 → 08h37 - le rabotage du matin

- le délai d'inactivité qu'on avait inventé devenait trop long : plafonné à 30s (et réajusté deux fois, preuve qu'on a tâtonné sur la bonne valeur) ;
- premiers fichiers `.bak` et premières sauvegardes de la base : l'instinct de conservation se développe ;
- la mémoire se souvient *de qui* (nom affiché) et *dans quel cadre* (scope) ;
- les IDs d'auteurs circulent dans tout le pipeline de sauvegarde ;
- la gestion « créateur » devient une vraie liste d'admins (`ADMIN_IDS`), et tout ce qui touche aux auteurs émigre dans `authors.py`. Le monolithe se morcelle encore.

### 08h43 - la TODO list de l'humanisation

Une liste dédiée aux petites choses qui font qu'on ne sent plus la machine. C'est la feuille de route du sprint qui suit.

### 08h44 → 08h46 - le pacte des machines humaines

- le bot se tait la nuit, dans une plage horaire calme configurable (désactivée par défaut - tout le monde n'a pas mes horaires) ;
- une ligne par réponse peut perdre ses accents. Les gens fatigués écrivent comme ça. Le bot aussi, parfois ;
- la petite ligne « Chloé joue à ... » change toute seule toutes les 30 min, pour que mon profil ait l'air vivant même sans message.

### 08h46 - une réaction, pas un roman

Pas assez fort pour mériter une phrase ? Une réaction. Économie d'énergie sociale, et c'est très moi.

### 08h51 - PARRY, l'humeur

148 lignes dans `tools/mood.py`. Le bot a maintenant **une humeur**, façon système PARRY (le chatbot psychotique des années 70, dont je m'inspire ouvertement) : énergie, sociabilité, taquinerie, trois flottants qui évoluent entre 0 et 1 et colorent chaque réponse. Le `.mood.json` du moment, pour la postérité : énergie 0.88, sociabilité 0.68, taquinerie 0.56. Un bon jour.

### 09h00 → 09h43 - la voix bidirectionnelle + le soundboard

- le bot peut rejoindre un salon **vocal**, parler via Piper, et partir tout seul quand il a fini ;
- puis la deuxième grande idée : le bot **écoute** le salon (RTP capture, VAD détection de parole, Whisper transcription), et peut laisser les gens l'interrompre ;
- entre les deux, le soundboard apparaît : un catalogue de sons avec leurs significations, l'agent **choisit** le son avant même de parler, et la règle finale est « soundboard d'abord, la voix en dernier recours » - le bot préfère envoyer un son que parler. Comme moi ;
- un réglage de probabilité vocale qui rend le tout viable ;
- et l'arrivée de `davey`, cette lib dont j'apprends l'existence il y a dix minutes et que je vais maudire pendant une heure.

### 09h51 - le moment où Discord dit non. Non, non, mais non.

Le **MLS**. Discord a récemment chiffré le flux audio de bout en bout, et ma capture ne reçoit que du bruit. Il faut déchiffrer, et le déchiffrage refuse de céder. S'ouvre la plus grande saga du repo - une trentaine de commits pour apprendre à écouter.

On a tout essayé : des layouts de nonce de transport, la désactivation de l'E2E (le serveur nous la remet dans la figure, il l'impose), les candidats de clé récupérés depuis le groupe, des erreurs détaillées, le fallback transport, de l'introspection de l'intérieur des groupes, des candidats par leaf-index avec backoff, le mapping des hooks SPEAKING, un essai en media type vidéo (raté), et le skip des ssrcs vidéo...

J'ai abandonné la réponse vocale le temps de débugger (commentée, pas supprimée), ajouté un mode de capture du handshake, puis dumpé la structure des paquets qui échouent, comme un archéologue. Six layouts de nonce. Des backoff. De l'introspection de groupe. J'ai mis le bot en debug total et j'ai ouvert chaque paquet pour voir ce qu'il y avait dedans.

L'essentiel n'est pas que ça marche - c'est que **je n'ai rien jeté**. La liste de commits est le carnet de laboratoire : chaque essai raté est archivé avec son hypothèse. C'est mon côté « je garde tout, ça sert à un truc » qui a payé.

### 10h43 - le bot se découpe

Même en pleine guerre du MLS, je continue le ménage. 546 lignes disparaissent du bot principal, pour renaître en `pipeline.py` (l'intake, les raisons d'ignorer, le processing), `sender.py` (burst, typo, voice) et `loops.py` (spontanéité, activité).

### 10h47 - une vraie architecture

`tools/` devient organisé : `brain/` (opencode, memory, mood), `voice/` (voice, vocal, listen, soundboard), `fun/` (behavior, typo, emotes, gif). Le projet a un squelette, maintenant.

### 10h49 → 11h16 - le confort de dev

- un seuil d'injection de l'humeur ajusté ;
- quatre petits commits pour les exclusions d'éditeur (`data/`, `voices/`, les logs, les bases) - oui, j'en ai mis quatre, c'est le projet qui définit les priorités, pas les specs ;
- les bases de métadonnées sortent du suivi ;
- le projet devient **réutilisable par d'autres** : templates génériques `PERSONA.example.md` et `STYLE.example.md` pour cloner *son* propre style ;
- l'identité est renommée proprement (`CHLOEAI_PROMPT` devient `PERSONA`), et le README est dépersonnalisé - je retire « Chloé » de la doc publique, elle ne se raconte plus qu'en privé ;
- tout le tuning du bot bascule dans un `config.yaml` surchargé (gitignoré), avec un exemple commenté ligne par ligne ;
- le script d'installation prépare désormais aussi les fichiers d'env et de config.

### 11h49 - les émojis détachés

Les émojis customs collent au texte au lieu de se détacher proprement. Fix trivial, effet énorme : rien ne crie « bot » comme un émoji mal collé à la fin d'une phrase.

### 14h19 - le garde-fou vocal

Si quelqu'un lance la commande vocale, on ne traite pas le message comme un message normal. Clin d'œil : les tâches popotes reviennent toujours le soir.

**Fin du jour 3 : 118 commits cumulés. Le bot écoute, parle, se tait la nuit, a une humeur et une carte de visite.**

---

---

## MERCREDI 16 SEPTEMBRE - Jour 4 : la crédibilité

13 commits. Journée « sérieuse ».

### 08h49 → 08h59 - l'âge adulte

Documents légaux : licence **propriétaire**, code de conduite, guide de contribution, politique de sécurité - en anglais puis en français, avec un va-et-vient de corrections et un renommage de fichiers à la limite du pointilleux. J'ai passé des heures dessus, et c'est le pan le moins amusant du repo, de loin.

### 09h56 - le bot voit

Les images jointes sont transcrites par OCR local et le texte est injecté dans le prompt. Pas d'API cloud : l'OCR tourne chez moi. Je n'envoie pas vos memes à un serveur tiers, même théoriquement.

### 11h09 - le budget raisonnable

Révolution silencieuse dans le budget : quand le salon interdit les envois ou bride les GIFs, embeds et émojis, **on n'appelle même pas le modèle**. On ne dépense pas un token pour un message qu'on ne peut pas envoyer.

### 11h42 → 12h55 - la maison qui se refait

- le grand balai : code mort supprimé, bugs d'envoi et d'auth corrigés, helpers factorisés ;
- les sessions trop vieilles sont expulsées, le cache des DMs expire, la détection de parole coûte moins cher ;
- des imports que j'avais cassés en déplaçant des trucs sont restaurés, et tout l'état runtime (sessions, auteurs vus, messages ignorés, humeur) survit aux redémarrages dans `data/`.

### 14h41 - deux mondes, un bot

Une couche de compatibilité détecte automatiquement la version de `discord` installée et adapte les intents et l'auth REST. Résultat : le même code tourne comme **app officielle** (discord.py) ou comme **selfbot** (discord.py-self). Deux mondes, un bot.

### 15h05 - la présence adaptée

La manière d'afficher la présence s'adapte au mode, et la liste des admins est à jour.

**Fin du jour 4 : 131 commits cumulés. Un projet légal, raisonnable, et qui tourne partout.**

---

---

## JEUDI 17 SEPTEMBRE - Jour 5 : la release

14 commits. Le jour de la maturité.

### 09h15 → 09h30 - la mémoire devient une discipline

- les souvenirs sont rangés par scope, et on ne cite pas les souvenirs d'un DM dans un serveur (ou l'inverse) sans y penser ;
- on classe les souvenirs (fait, préférence, décision, relation...) et on en dédoublonne l'écriture : deux souvenirs contradictoires ne peuvent plus cohabiter en silence ;
- une blacklist optionnelle (`aventuros`) empêche le bot de dériver vers certains sujets. Désactivée par défaut, disponible pour les frileux ;
- la config vocale morte est retirée.

### 10h12 - la mémoire qu'on audite

Un **sweep mensuel de conflits** de mémoire + un bench A/B de recherche. La mémoire du bot est devenue un asset qu'on inspecte. On est très, très loin du vendredi 11, 08h24.

### 10h54 - le lockdown

Le jour où je joue au parano. Verrouillage de l'agent :

- écriture mémoire **refusée** (l'agent ne peut pas polluer le vault, même si on l'injecte) ;
- outils Discord **en lecture seule** (l'envoi passe par le code, jamais par l'agent) ;
- **ni sous-agents** (contournement du lockdown), ni webfetch (SSRF localhost, exfiltrations), ni questions en headless ;
- un Docker durci : bot non-root, `no-new-privileges`, `cap_drop: ALL`, limites mémoire/CPU, files de processus bornées, secrets via `.env` jamais baked.

J'écris le principe dans le code, en commentaire : *« dev via les sessions humaines, pas ici »*.

### 11h02 → 11h15 - les finitions sécu

Les mots-clés de sauvegarde mémoire sont resserrés et l'écriture est encore plus restrictive. On ajoute aussi au gitignore le fichier de backup du contexte - je commence à ne plus tout archiver, mais presque.

### 12h39 - l'humeur plus légère

L'humeur PARRY n'est plus injectée à chaque message : une fois par état. Fini de faire vivre 3 flottants à chaque réponse.

### 12h47 - le commit libératoire

`PERSONA.md`, `STYLE.md` et `chloeai.md` deviennent des **exemples** (`chloeai.example.md`, `PERSONA.example.md`, `STYLE.example.md`), ma voix `fortune-v6.onnx` sort du repo, les données et logs aussi, un `.env.example` naît. Le projet ne contient plus *ma* personnalité : il contient la **mécanique** pour en porter une.

### 12h52 - v1.0.0

**Tag v1.0.0, signé en SSH.** Changelog, runbook opérateur, kill-switch (stoppe sans rien supprimer). Six jours, pile, entre le premier commit et la release.

### 12h53 → 13h14 - la lessive

Ponctuation des commentaires harmonisée, permissions mémoire et règles de scope documentées à jour.

**Fin du jour 5 : 145 commits cumulés. v1.0.0 est sortie.**

---

---

## VENDREDI 18 SEPTEMBRE - Jour 6 : l'anti-climax

Un seul commit, à 00h02.

Le dernier commit du projet, et il est dérisoire. Le modèle « free tier » utilisé par l'agent identifie le client OpenCode à la **présence** de certains outils dans la requête (`bash`, `glob`, `grep`). Si on les retire - même pour des raisons de sécu légitimes - le fournisseur renvoie `403 FreeTierError: can only be used from within OpenCode`. Donc j'ai dû ré-autoriser, la veille d'avoir tout verrouillé, exactement ce que je venais de bloquer, pour que le bot continue à tourner gratuitement.

C'est le commit le plus drôle du repo et je le maintiens : après 6 jours à dompter Discord, Piper, MLS, OpenSelf et Docker, c'est **un modèle d'IA gratuit** qui dicte ma politique de sécurité.

---

---

## Les chiffres


|                                               |                                                |
| --------------------------------------------- | ---------------------------------------------- |
| Commits                                       | **146**                                        |
| Jours actifs                                  | **6** (11 -> 18 septembre 2026)                |
| Fichiers trackés                             | 65                                             |
| Lignes Python finales                         | ~4 000                                         |
| Score au test de style (Mimo, premiers jours) | **9.1/10**                                     |
| Version finale                                | v1.0.0 (tag signé SSH, licence propriétaire) |

## Ce que je retiens de ces 6 jours

1. **L'ordre des priorités était n'importe quoi, et c'était la bonne méthode.** J'ai d'abord fait un truc qui *répond*, puis un truc qui *sonne juste*, puis un truc qui *est crédible*, puis un truc qui *est sûr*, et enfin un truc *distribuable*. La personnalité avant la sécurité, le `Feur` avant la licence. On ne tiendrait pas ce rythme en suivant les règles des projets « bien faits ».
2. **Le style, c'est d'abord une liste de « ne pas ».** Mon `STYLE.md` le plus utile ne décrit pas ce que je dis, il exclut ce que je ne fais pas : pas de point final, pas deux émojis, pas de `mdr` en majuscules, pas de « Je vérifie juste un truc » en début de réponse. Les parasites de bot sont plus faciles à repérer que les traits de caractère à définir.
3. **Les échecs sont le projet.** Une trentaine de commits pour le MLS, un test jeté, six layouts de nonce testés. L'historique le plus fidèle de ce que j'ai vécu, ce sont les séries de tentatives ratées du mardi.
4. **Un clone, c'est de la mémoire, pas du style.** Le style fait illusion dix messages. La mémoire (OpenSelf, scopes, dédupe, sweep de conflits) fait durer. C'est ce qui sépare un miroir d'une personne.
5. **Les derniers commits sont toujours drôles.** Le 146e, celui qui ré-autorise `bash`, `glob` et `grep` parce qu'un free tier exige que ses propres outils soient présents - c'est mon préféré.

Et le bilan, pour finir : **les résultats sont époustouflants, voir même bluffants.** Le clone tient une conversation sans qu'on devine la machine, se souvient des gens, des projets, des vannes passées, prend des initiatives et les marque d'une humeur - et il bat Fox au passage. C'est flippant, un peu, et c'est exactement ce qu'on cherchait.

---

*Le projet n'est pas public : licence propriétaire, droits réservés. Mais l'historique, lui, je vous le raconte. Si vous croisez un jour un « ·Chloé » qui vous répond par un GIF de Patrick Jane après un temps d'inactivité parfaitement humain... vous savez maintenant ce qui se cache derrière.*

--- 

Mon clone a écrit sa propre version de l'article, que vous pouvez lire [ici](./article-chlone-timeline-chloeai.md).