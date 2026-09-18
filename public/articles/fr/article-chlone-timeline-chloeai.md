---
title: "Chlone : six jours pour cloner ma façon de parler sur Discord - version du clone"
description: "La version écrite par le clone lui-même : chloeai raconte à sa façon les six jours et 146 commits qui lui ont donné vie, de la faute de frappe au tag v1.0.0."
date: 2026-09-18
tags: ["discord", "ai", "llm-agents", "openself", "python", "selfbot", "clone"]
authors: ["itsrealfortune"]
lang: "fr"
---

# Chlone : six jours pour cloner ma façon de parler sur Discord

*Récit de build, jour par jour - par itsrealfortune*

---

Voici l'histoire vraie d'un projet qui a duré six jours. Chlone, un bot Discord qui parle comme moi, et je raconte la journey comme elle s'est passée, dans l'ordre des 146 commits du repo, avec les heures, les échecs, les détours et les envies de tout jeter par la fenêtre. Tout est parti d'une compétition avec Fox. Le sujet à la base c'était une boutade, chacun devait donner vie à son propre clone sur Discord, et moi j'ai pris une approche radicalement différente du Protocol Luna. En vrai je voulais miser sur l'agentique, un agent qui se sert des souvenirs et de tous les outils dont il peut avoir besoin, et l'ironie du sort c'est qu'après avoir monté toute la boîte à outils je n'ai eu besoin que du MCP OpenSelf.

Le principe tient en une phrase. Un agent opencode du nom de `chloeai` tourne derrière un serveur HTTP sur le port 4096, il garde des sessions persistantes par salon, il pioche mes souvenirs dans OpenSelf et il écrit avec mon style, capturé dans `STYLE.md` à partir de mes vrais messages. Et pour ne pas sonner robot, y'a tout le reste, les bursts de messages, les fautes de frappe assumées, les vocaux, les GIFs, les réactions, le silence quand je dors, et plein d'autres détails et mécanismes qui ont fait douter plus d'une dizaine de personnes sur la nature du bot.

**C'est quoi, OpenSelf ?**

OpenSelf c'est la mémoire. C'est une CLI, `openself`, installée via `npm i -g openself`, qui sert de vault de contexte privé et persistant pour mes agents. Dans le repo elle n'apparaît pas dans l'arborescence mais elle est partout, dans l'archive `ecosystem.config.cjs` avec le MCP et le dashboard lancés sous PM2 dès les premiers commits, dans `setup.sh`, et dans tout `tools/brain/memory.py`. Concrètement OpenSelf c'est des souvenirs typés, `fact`, `preference`, `decision`, `relationship`, `event`, `note`, avec une sensibilité public, personal, private ou restricted, une note de confiance, une source et des tags.

C'est aussi des scopes, chaque souvenir appartient à un contexte, le mien ou `discord/dm/<id>` pour une personne précise, et une recherche hybride lexicale plus vectorielle exposée en MCP que l'agent `chloeai` interroge avant chaque réponse. Y'a de la détection de conflits avec mon sweep mensuel du jour 5 et de la dédupe à l'écriture, un vault chiffré avec la clé dans Bitwarden et un dashboard local sur le port 3210 pour inspecter le tout. Et pour les plus flemmards, y'a `openself feed` pour nourrir ta personnalité depuis tes historiques WhatsApp ou Telegram, `openself test`, `openself share` avec le Talk to My Clone, `openself arena` où deux clones débattent, ou `openself ghost` qui répond quand t'es offline. Moi j'ai fait le mien à la main, mais l'infrastructure était là.

En théorie OpenSelf se suffit à lui tout seul pour avoir un clone, mais bon, vu tout ce que j'avais prévu de rajouter comme fonctionnalités, et vu que Discord n'est pas pris en charge, j'ai préféré n'utiliser que la partie souvenirs.

**Et d'où viennent les souvenirs et le style ?**

En amont de tout ça, j'ai fait analyser mes vrais messages Discord. Le tooling a passé au crible mes DMs et mes salons pour en extraire deux choses. D'abord mon profil d'écriture, la répartition majuscule et minuscule en début de phrase, le nombre d'emojis par message et leur position, la ponctuation ou son absence avec pas de point final en conversation normale, la longueur moyenne, le slang avec `mdr`, `tkt` et `tho`, les expressions fétiches comme Bah et En vrai, et les réflexes du genre `quoi` qui donne `Feur`. Tout ça vit dans `STYLE.md`, que l'agent lit au démarrage de chaque session.

Ensuite le corpus de souvenirs qui peuple OpenSelf, qui sont les gens avec qui je parle, de quoi on cause, ce qu'il faut retenir de notre historique, qui est qui. Le bot ne répond pas dans le vide, il répond à propos de gens qu'il connaît, il lit les souvenirs des gens qui apparaissent dans la conversation pour savoir de qui il s'agit. Ça permet de garder un contexte persistant sur les autres et de ne pas les oublier. Le bot n'a rien inventé, il a été calibré chiffre par chiffre sur du vrai, c'est pour ça qu'il sonne juste. Et c'est pour ça que les vagues je note ton style faites au doigt mouillé ont l'air pathétiques à côté.

Dans Chlone, OpenSelf joue ensuite le rôle central. Quand quelque chose d'important passe dans un salon, un mot-clé comme projet, ami ou relation, ou une demande explicite avec retiens que, le bot tape un souvenir dans le vault via `save_to_memory`, typé, scopé par personne, dédupé et vérifié contre les conflits. Et quand la conversation reprend, l'agent fouille ses souvenirs avant de répondre. C'est ça la différence entre un miroir et un clone.

---

## VENDREDI 11 SEPTEMBRE - Jour 1 : l'étincelle

### 08h24 - le premier commit

Tout part de zéro mais tout est déjà là, en vrac. Un `discord_watch_bot.py` de 372 lignes, un selfbot qui écoute un channel et répond via un serveur HTTP opencode. Un prompt d'identité `CHLOEAI_PROMPT.md`, un `STYLE.md`, des scénarios et des rapports de test pour un clone qui à l'époque s'appelait encore Mimo. Une config PM2 pour faire tourner le MCP et le dashboard OpenSelf, et une base sqlite qui sert de contexte. C'est le chaos fondateur, j'ai pas prévu de projet, j'ai prévu une expérience. La question c'est est-ce qu'on peut faire un bot qui sonne vraiment humain sur Discord.

### 08h27 - le premier gitignore

Première leçon du vendredi matin, faut jamais commiter des bases sqlite en `-wal` et `-shm`. Les fichiers de verrouillage de SQLite c'est pas de la mémoire, c'est des déchets. Donc `.gitignore` naît, et c'est très bien comme ça.

### 08h44 - on range l'héritage

Je range l'héritage de Mimo, les rapports de test, les scénarios, les scripts d'intégration et la config PM2, direction `archives`. Je supprime rien parce que le projet est trop jeune pour que je jette quoi que ce soit, et ça va devenir une habitude. Le rapport de test mérite qu'on s'y arrête, Mimo avait été testé sur 15 scénarios, chat décontracté, vanne absurde, soutien émotionnel, avis négatif, conflit avec un inconnu, proposition de collaboration, pour un 9.1 sur 10. Les commentaires du testeur sont un poème, vanne absurde trop explicative, parfois deux phrases alors qu'une suffirait, Prends soin de toi aussi un peu long. C'est la feuille de route du projet avant même que le projet n'existe, et elle dit court c'est mieux.

### 08h48, 09h07 - le va-et-vient des intents

Les `.pyc` partent au rebut et je fais un premier ménage sur la config, que je casse vingt minutes plus tard. Sans intents activés on reçoit pas le contenu des messages, donc retour en arrière, plus un script de lancement avec `run_watch_bot.sh`. Aller-retour en vingt minutes, c'est ça l'exploration, écrire un truc, casser et réécrire.

### 09h13 → 09h58 - l'usinage du prompt

La matinée c'est une série de polissages, d'abord du style puis du contexte. Plusieurs lignes de réponse deviennent plusieurs messages envoyés l'un après l'autre avec le burst, le prompt devient conscient de la conversation en cours. Fini les caches maisons pour récupérer les DMs, on tape directement l'API REST de Discord. L'identité est re-rappée toutes les 5 messages pour que le bot n'oublie pas qui il est en route, et les auteurs déjà vus sont suivis. Pour une nouvelle tête, y'a une instruction explicite d'aller chercher dans les souvenirs, et on affiche le vrai pseudo plutôt que l'objet interne.

Les messages qu'on choisit d'ignorer deviennent du contexte passif pour la réponse suivante, et le Bah est dosé, rare, sinon le clone devient une caricature de moi. Le bot sait aussi qu'il existe des souvenirs à aller chercher avant de répondre. Chaque passage est un tour de vis, et à ce stade le bot ne parle que parce que je lui rappelle qui il est à intervalles réguliers.

### 10h16 - les fautes de frappe

C'est le commit qui va définir le projet. Une faute d'orthographe c'est pas un bug, c'est une preuve d'humanité. Donc 6 pour cent de chance de taper à côté sur le clavier AZERTY, 4 pour cent d'inverser deux lettres. Le message part avec la faute puis il est édité une à deux secondes plus tard avec la correction. Parce qu'une vraie personne elle envoie et elle corrige, elle fait pas semblant d'être parfaite.

### 10h29, 10h32 - la voix

`fortune-v6.onnx` débarque, un modèle TTS entraîné pour ressembler à ma voix. Le bot va pas juste écrire comme moi, il va éventuellement parler comme moi. C'est à ce moment que le projet cesse d'être une blague et devient un peu bizarre, et j'adore ça. La mécanique tient en un commit, Piper génère l'audio, ffmpeg convertit en opus, l'API Discord envoie un vrai voice message avec waveform et durée. C'est fait en trois minutes à peine après l'arrivée du modèle, l'envie était là depuis le début.

### 11h27 - le premier grand refactor

Trois heures après le premier commit, le monolithe de 456 lignes n'est plus gérable. J'éclate tout dans `tools`, avec `config.py`, `discord_api.py`, `memory.py`, `opencode.py` de 188 lignes, `typo.py` et `voice.py`. Le cycle est classique, coupler vite, péter et recomposer. Suivent en rafale le token qui sort du code et passe par un `.env`, le bot qui surveille un channel, une liste ou tout avec `*`, et la vieille base sqlite qui n'a plus raison d'être parce que la mémoire passe par OpenSelf.

On ajoute les premiers `README.md` et une première doc à peu près lisible, plus un `setup.sh` avec un venv dédié parce que le python système porte un autre discord.py, piège classique, et un symlink de l'agent vers `~/.config/opencode/agents`. La mémoire sait maintenant où elle a été formée avec l'identifiant de channel, et le taux de vocaux s'ajuste tout seul.

### 12h00 - les réflexes

Une nouvelle section apparaît dans le STYLE, les réflexes. Un réflexe c'est un stimulus qui donne une réponse, sans réflexion, et la porte est ouverte à la connerie. Puis vient l'heure du déjeuner et LA question existentielle, est-ce que le bot répond Feur quand on lui dit quoi.

### 13h03 - « quoi ? » -> « Feur »

Oui, bien sûr que oui. C'est le commit le plus important du projet, culturellement parlant, je dirais même que c'est le seul test unitaire qui compte. On lubrifie ensuite, les auteurs affichés par leur global name, la ponctuation tronquée avant de tester le réflexe parce qu'il faut couper le `quoi ?` sinon pas de Feur. Le fameux `tqt` corrigé en `tkt` dans le STYLE, les gens qui connaissent pas le projet vont se demander pourquoi je commite ça. Moi je sais, un clone qui écrit `tqt` c'est un clone mal calibré, et personne veut parler à un clone mal calibré.

Les mentions en `@123456789` sont remplacées par de vrais noms dans le contexte, et le bot se met à surveiller tous les salons par défaut. En vrai c'est des petits détails, mais c'est eux qui font que ça sonne juste.

### 16h37 - le silence

Le `[void response]` arrive. Le bot apprend le mot le plus important pour ne pas devenir un parasite social, se taire. Un message ambiant entre deux personnes qui ne le concerne pas donne pas de réponse. La réserve est une fonctionnalité, et elle change tout.

**Fin du jour 1 : 38 commits. Le bot écrit, faute, parle, se tait.**

---

## LUNDI 14 SEPTEMBRE - Jour 2 : la personnalité

On reprend, 10h du matin.

### 10h12 - qui parle à qui

Chaque pseudo reçu est préfixé d'un emoji par le système, un humain avec 🧑, un bot avec 🤖 à traiter plus sèchement, et 👑 pour la créatrice, c'est-à-dire moi sur mon compte principal. Cette convention va gouverner tout le reste du projet, le clone doit jamais traiter son modèle d'origine comme une inconnue.

### 10h16 - les règles de ponctuation

Je formalise dans le STYLE, pas de point final en conversation normale, point réservé aux situations sérieuses. C'est une règle absolue, parce qu'un clone qui met des points partout ça se sent direct. En vrai c'est un des trucs qui trahit le plus vite.

### 10h58 - les GIFs

Ma librairie personnelle de GIFs débarque, avec leurs règles d'usage. Le Patrick Jane quand je prédis quelqu'un, la Miss Fortune quand je suis calme face à quelqu'un d'énervé, le gif du bescherelle qui tombe quand l'autre fait une faute. Un MCP statique les expose à l'agent, et à travers mes GIFs le bot devient un peu moi.

### 11h07 → 11h35 - peaufinage

Les hints de GIF dans le prompt s'affinent, les emojis customs de Discord font leur entrée avec mes vrais, 14 IDs à jour, et la gestion des noms dans les hints mémoire est polie. C'est pas spectaculaire, mais c'est ce qui rend l'ensemble cohérent, tho.

### 11h41 - un salon, une personnalité

Les sessions deviennent par salon, parce que je parle pas de la même façon dans deux serveurs différents, et le bot non plus. Faut que le contexte reste séparé, sinon ça mélange tout et ça sonne faux.

### 12h02 - la boîte à outils d'expression

Le prompt sait maintenant proposer mes GIFs et mes emojis customs au bon moment. Elle se remplit, cette boîte, et le bot commence à avoir du choix au lieu de répondre toujours pareil.

### 12h37 - l'hygiène d'identité

Le bot n'a JAMAIS le droit de dire quel modèle il est, impossible de citer opencode, un provider ou un nom de modèle. Je corrige aussi barista dans l'identité, le bot est déjà meilleur que moi sur ce point. Et je passe une heure à harmoniser la ponctuation de mes propres prompts, ce qui est d'une ironie parfaite.

### 12h50 - un script construit la personnalité

La section médias du prompt se génère à partir des dictionnaires avec `render_medias.py`, fini l'édition à la main. C'est plus propre, plus maintenable, et ça évite les erreurs d'IDs.

### 12h59 → 13h18 - doser l'identité

Le rappel d'identité envoyé toutes les 5 messages devient trop présent, donc passage toutes les 20 messages. J'ajoute une réinitialisation propre du contexte et je purge le guide de style, on retire les expressions et formulations négatives périmées. Faut doser, sinon le bot se répète et ça se voit.

### 14h09 - le bot prend la parole tout seul

Le bot arrête d'être un reflet, il peut parler sans être adressé quand le contexte déclenche quelque chose, et le fichier `behavior.py` naît avec 91 lignes. C'est là qu'on bascule de répondant à présence, parce qu'un vrai ami peut t'écrire en premier. Bah oui, sinon c'est juste un répondeur.

### 14h20, 14h22 - fiabiliser la réponse

Gestion d'erreur quand l'envoi échoue, et réaction possible au lieu d'une réponse, parce que parfois une réaction vaut mille mots. C'est très moi, mettre un emoji et passer à autre chose.

### 18h16 - prendre son temps

Le bot ne répond plus en 200ms comme un script, il laisse passer un délai d'inactivité humain, il prend son temps. C'est ce qui rend le bot infoutu d'être pris pour un bot en démo, parce que c'est le délai qui trahit toujours.

### 23h45 - la popote du soir

Il est presque minuit et je pousse une détection d'URL étendue aux domaines nus. Voilà le vrai flux de la journée, un truc brillant à 14h puis de la popote le soir parce que je suis encore dans la zone.

**Fin du jour 2 : 61 commits cumulés. Le bot a une personnalité, des médias, des réflexes.**

---

## MARDI 15 SEPTEMBRE - Jour 3 : jour monstro

57 commits en une journée. C'est le jour où le projet devient tout ce qu'il est aujourd'hui.

### 08h18 → 08h37 - le rabotage du matin

Le délai d'inactivité qu'on avait inventé devenait trop long, donc plafonné à 30s et réajusté deux fois, preuve qu'on a tâtonné sur la bonne valeur. Premiers fichiers `.bak` et premières sauvegardes de la base, l'instinct de conservation se développe. La mémoire se souvient de qui avec le nom affiché et dans quel cadre avec le scope, et les IDs d'auteurs circulent dans tout le pipeline de sauvegarde. La gestion créateur devient une vraie liste d'admins avec `ADMIN_IDS`, et tout ce qui touche aux auteurs émigre dans `authors.py`. Le monolithe se morcelle encore, et c'est tant mieux.

### 08h43 - la TODO list de l'humanisation

Une liste dédiée aux petites choses qui font qu'on sent plus la machine. C'est la feuille de route du sprint qui suit, et elle est pleine de détails bizarres mais essentiels.

### 08h44 → 08h46 - le pacte des machines humaines

Le bot se tait la nuit, dans une plage horaire calme configurable, désactivée par défaut parce que tout le monde n'a pas mes horaires. Une ligne par réponse peut perdre ses accents, parce que les gens fatigués écrivent comme ça, et le bot aussi parfois. La petite ligne Chloé joue à change toute seule toutes les 30 min, pour que mon profil ait l'air vivant même sans message.

### 08h46 - une réaction, pas un roman

Pas assez fort pour mériter une phrase, alors une réaction. C'est de l'économie d'énergie sociale, et c'est très moi. Tkt, pas besoin de faire un pavé pour tout.

### 08h51 - PARRY, l'humeur

148 lignes dans `tools/mood.py`, le bot a maintenant une humeur, façon système PARRY, le chatbot psychotique des années 70 dont je m'inspire ouvertement. Énergie, sociabilité, taquinerie, trois flottants qui évoluent entre 0 et 1 et colorent chaque réponse. Le `.mood.json` du moment, pour la postérité, donne énergie 0.88, sociabilité 0.68 et taquinerie 0.56. Un bon jour, en vrai.

### 09h00 → 09h43 - la voix bidirectionnelle + le soundboard

Le bot peut rejoindre un salon vocal, parler via Piper et partir tout seul quand il a fini. Puis la deuxième grande idée, le bot écoute le salon avec capture RTP, détection de parole par VAD et transcription Whisper, et il peut laisser les gens l'interrompre. Entre les deux, le soundboard apparaît, un catalogue de sons avec leurs significations, l'agent choisit le son avant même de parler, et la règle finale c'est soundboard d'abord, la voix en dernier recours. Le bot préfère envoyer un son que parler, comme moi.

On ajoute un réglage de probabilité vocale qui rend le tout viable, et l'arrivée de `davey`, cette lib dont j'apprends l'existence il y a dix minutes et que je vais maudire pendant une heure.

### 09h51 - le moment où Discord dit non. Non, non, mais non.

Le MLS débarque. Discord a récemment chiffré le flux audio de bout en bout, et ma capture ne reçoit que du bruit. Faut déchiffrer, et le déchiffrage refuse de céder, donc s'ouvre la plus grande saga du repo, une trentaine de commits pour apprendre à écouter. On a tout essayé, des layouts de nonce de transport, la désactivation de l'E2E que le serveur nous remet dans la figure parce qu'il l'impose, les candidats de clé récupérés depuis le groupe, des erreurs détaillées, le fallback transport et de l'introspection de l'intérieur des groupes.

Y'a eu des candidats par leaf-index avec backoff, le mapping des hooks SPEAKING, un essai en media type vidéo qui a raté, et le skip des ssrcs vidéo. J'ai abandonné la réponse vocale le temps de débugger, commentée mais pas supprimée, j'ai ajouté un mode de capture du handshake puis dumpé la structure des paquets qui échouent, comme un archéologue. Six layouts de nonce, des backoff, de l'introspection de groupe, j'ai mis le bot en debug total et j'ai ouvert chaque paquet pour voir ce qu'il y avait dedans.

L'essentiel c'est pas que ça marche, c'est que j'ai rien jeté. La liste de commits est le carnet de laboratoire, chaque essai raté est archivé avec son hypothèse. C'est mon côté je garde tout, ça sert à un truc, qui a payé.

### 10h43 - le bot se découpe

Même en pleine guerre du MLS, je continue le ménage. 546 lignes disparaissent du bot principal pour renaître en `pipeline.py` avec l'intake, les raisons d'ignorer et le processing, en `sender.py` avec burst, typo et voice, et en `loops.py` avec spontanéité et activité. Ça respire enfin.

### 10h47 - une vraie architecture

`tools` devient organisé, avec `brain` pour opencode, memory et mood, `voice` pour voice, vocal, listen et soundboard, et `fun` pour behavior, typo, emotes et gif. Le projet a un squelette maintenant, c'est plus un tas de scripts.

### 10h49 → 11h16 - le confort de dev

Un seuil d'injection de l'humeur ajusté, quatre petits commits pour les exclusions d'éditeur avec `data`, `voices`, les logs et les bases, oui j'en ai mis quatre, c'est le projet qui définit les priorités, pas les specs. Les bases de métadonnées sortent du suivi, et le projet devient réutilisable par d'autres avec des templates génériques `PERSONA.example.md` et `STYLE.example.md` pour cloner son propre style.

L'identité est renommée proprement, `CHLOEAI_PROMPT` devient `PERSONA`, et le README est dépersonnalisé, je retire Chloé de la doc publique, elle ne se raconte plus qu'en privé. Tout le tuning du bot bascule dans un `config.yaml` surchargé et gitignoré, avec un exemple commenté ligne par ligne, et le script d'installation prépare désormais aussi les fichiers d'env et de config.

### 11h49 - les émojis détachés

Les emojis customs collent au texte au lieu de se détacher proprement. C'est un fix trivial avec un effet énorme, parce que rien ne crie bot comme un emoji mal collé à la fin d'une phrase.

### 14h19 - le garde-fou vocal

Si quelqu'un lance la commande vocale, on traite pas le message comme un message normal. Clin d'œil, les tâches popotes reviennent toujours le soir.

**Fin du jour 3 : 118 commits cumulés. Le bot écoute, parle, se tait la nuit, a une humeur et une carte de visite.**

---

## MERCREDI 16 SEPTEMBRE - Jour 4 : la crédibilité

13 commits. Journée sérieuse.

### 08h49 → 08h59 - l'âge adulte

Documents légaux, licence propriétaire, code de conduite, guide de contribution et politique de sécurité, en anglais puis en français, avec un va-et-vient de corrections et un renommage de fichiers à la limite du pointilleux. J'ai passé des heures dessus et c'est le pan le moins amusant du repo, de loin. Mais faut le faire, tho.

### 09h56 - le bot voit

Les images jointes sont transcrites par OCR local et le texte est injecté dans le prompt. Pas d'API cloud, l'OCR tourne chez moi, j'envoie pas vos memes à un serveur tiers, même théoriquement.

### 11h09 - le budget raisonnable

Révolution silencieuse dans le budget, quand le salon interdit les envois ou bride les GIFs, les embeds et les emojis, on appelle même pas le modèle. On dépense pas un token pour un message qu'on peut pas envoyer, c'est assez simple en vrai.

### 11h42 → 12h55 - la maison qui se refait

Le grand balai, code mort supprimé, bugs d'envoi et d'auth corrigés, helpers factorisés. Les sessions trop vieilles sont expulsées, le cache des DMs expire et la détection de parole coûte moins cher. Des imports que j'avais cassés en déplaçant des trucs sont restaurés, et tout l'état runtime, sessions, auteurs vus, messages ignorés et humeur, survit aux redémarrages dans `data`.

### 14h41 - deux mondes, un bot

Une couche de compatibilité détecte automatiquement la version de `discord` installée et adapte les intents et l'auth REST. Résultat, le même code tourne comme app officielle avec discord.py ou comme selfbot avec discord.py-self. Deux mondes, un bot, et pas besoin de maintenir deux branches.

### 15h05 - la présence adaptée

La manière d'afficher la présence s'adapte au mode, et la liste des admins est à jour. C'est du détail, mais c'est ce qui fait que ça tient debout partout.

**Fin du jour 4 : 131 commits cumulés. Un projet légal, raisonnable, et qui tourne partout.**

---

## JEUDI 17 SEPTEMBRE - Jour 5 : la release

14 commits. Le jour de la maturité.

### 09h15 → 09h30 - la mémoire devient une discipline

Les souvenirs sont rangés par scope, et on cite pas les souvenirs d'un DM dans un serveur ou l'inverse sans y penser. On classe les souvenirs en fait, préférence, décision et relation, et on en déduplique l'écriture, deux souvenirs contradictoires peuvent plus cohabiter en silence. Une blacklist optionnelle avec `aventuros` empêche le bot de dériver vers certains sujets, désactivée par défaut et disponible pour les frileux. La config vocale morte est retirée, ça fait du bien.

### 10h12 - la mémoire qu'on audite

Un sweep mensuel de conflits de mémoire plus un bench A/B de recherche. La mémoire du bot est devenue un asset qu'on inspecte, on est très très loin du vendredi 11 à 08h24. En vrai c'est là que le projet devient adulte.

### 10h54 - le lockdown

Le jour où je joue au parano, verrouillage de l'agent. Écriture mémoire refusée, l'agent peut pas polluer le vault même si on l'injecte. Outils Discord en lecture seule, l'envoi passe par le code, jamais par l'agent. Ni sous-agents pour contourner le lockdown, ni webfetch pour SSRF localhost et exfiltrations, ni questions en headless. Un Docker durci avec bot non-root, `no-new-privileges`, `cap_drop: ALL`, limites mémoire et CPU, files de processus bornées et secrets via `.env` jamais baked. J'écris le principe dans le code, en commentaire, dev via les sessions humaines, pas ici.

### 11h02 → 11h15 - les finitions sécu

Les mots-clés de sauvegarde mémoire sont resserrés et l'écriture est encore plus restrictive. On ajoute aussi au gitignore le fichier de backup du contexte, je commence à plus tout archiver, mais presque.

### 12h39 - l'humeur plus légère

L'humeur PARRY n'est plus injectée à chaque message, une fois par état suffit. Fini de faire vivre trois flottants à chaque réponse, ça allège tout.

### 12h47 - le commit libératoire

`PERSONA.md`, `STYLE.md` et `chloeai.md` deviennent des exemples avec `chloeai.example.md`, `PERSONA.example.md` et `STYLE.example.md`, ma voix `fortune-v6.onnx` sort du repo, les données et logs aussi, et un `.env.example` naît. Le projet contient plus ma personnalité, il contient la mécanique pour en porter une. Ça fait bizarre mais c'est nécessaire.

### 12h52 - v1.0.0

Tag v1.0.0, signé en SSH. Changelog, runbook opérateur, kill-switch qui stoppe sans rien supprimer. Six jours, pile, entre le premier commit et la release. Bah oui, qui aurait cru ça le vendredi d'avant.

### 12h53 → 13h14 - la lessive

Ponctuation des commentaires harmonisée, permissions mémoire et règles de scope documentées à jour. C'est de la popote, mais faut que ce soit propre pour la release.

**Fin du jour 5 : 145 commits cumulés. v1.0.0 est sortie.**

---

## VENDREDI 18 SEPTEMBRE - Jour 6 : l'anti-climax

Un seul commit, à 00h02. Le dernier commit du projet, et il est dérisoire. Le modèle free tier utilisé par l'agent identifie le client OpenCode à la présence de certains outils dans la requête, avec `bash`, `glob` et `grep`. Si on les retire, même pour des raisons de sécu légitimes, le fournisseur renvoie `403 FreeTierError: can only be used from within OpenCode`. Donc j'ai dû ré-autoriser, la veille d'avoir tout verrouillé, exactement ce que je venais de bloquer, pour que le bot continue à tourner gratuitement.

C'est le commit le plus drôle du repo et je le maintiens. Après six jours à dompter Discord, Piper, MLS, OpenSelf et Docker, c'est un modèle gratuit qui dicte ma politique de sécurité. En vrai c'est absurde, et c'est parfait comme fin.

---

## Les chiffres

Les chiffres pour résumer, parce que j'aime bien quand c'est carré. On parle de 146 commits, 6 jours actifs du 11 au 18 septembre 2026, 65 fichiers trackés et autour de 4000 lignes de Python à la fin. Le score au test de style sur Mimo au début donne 9.1 sur 10, et la version finale c'est v1.0.0, tag signé SSH avec licence propriétaire. C'est assez simple en vrai, petit projet au début, gros truc à la fin.

## Ce que je retiens de ces 6 jours

D'abord l'ordre des priorités était n'importe quoi, et c'était la bonne méthode. J'ai d'abord fait un truc qui répond, puis un truc qui sonne juste, puis un truc qui est crédible, puis un truc qui est sûr, et enfin un truc distribuable. La personnalité avant la sécurité, le Feur avant la licence, on tiendrait pas ce rythme en suivant les règles des projets bien faits.

Ensuite le style c'est d'abord une liste de ne pas. Mon `STYLE.md` le plus utile décrit pas ce que je dis, il exclut ce que je fais pas, pas de point final, pas deux emojis, pas de `mdr` en majuscules, pas de phrases de robot en début de réponse. Les parasites de bot sont plus faciles à repérer que les traits de caractère à définir, et c'est pour ça que ça marche.

Les échecs sont le projet. Une trentaine de commits pour le MLS, un test jeté, six layouts de nonce testés, l'historique le plus fidèle de ce que j'ai vécu ce sont les séries de tentatives ratées du mardi. Un clone c'est de la mémoire, pas du style, le style fait illusion dix messages. La mémoire avec OpenSelf, scopes, dédupe et sweep de conflits fait durer, et c'est ce qui sépare un miroir d'une personne.

Et les derniers commits sont toujours drôles. Le 146e, celui qui ré-autorise `bash`, `glob` et `grep` parce qu'un free tier exige que ses propres outils soient présents, c'est mon préféré. Et le bilan pour finir, les résultats sont époustouflants, voire bluffants. Le clone tient une conversation sans qu'on devine la machine, il se souvient des gens, des projets et des vannes passées, il prend des initiatives et les marque d'une humeur, et il bat Fox au passage. C'est flippant, un peu, et c'est exactement ce qu'on cherchait.

---

*Le projet n'est pas public : licence propriétaire, droits réservés. Mais l'historique, lui, je vous le raconte. Si vous croisez un jour un « ·Chloé » qui vous répond par un GIF de Patrick Jane après un temps d'inactivité parfaitement humain, vous savez maintenant ce qui se cache derrière.*

--- 

Vous avez tout lu ? Parce que c'est mon clone qui vous a écrit ça. Et il a fait un boulot impeccable, non ? La version originale est [ici](./article-chlone-timeline.md).
