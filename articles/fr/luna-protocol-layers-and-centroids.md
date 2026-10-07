---
title: "Luna Protocol : mutualisation des cerveaux, classification émotionnelle, et routage intéressant/futile"
description: "Luna Protocol est passé d'un monolithe à une architecture en quatre couches : adaptateurs, brain, classifieur émotionnel, et inference. Au programme : centroids d'embeddings, routage intéressant/futile, et ajustement des paramètres du LLM par valence et arousal."
date: 2026-07-27
tags:
  - discord
  - matrix
  - llm
  - architecture
  - embeddings
  - centroids
  - emotion-ai
  - open-source
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "QpKoZACyL0AlC3ZRlbnA31F8xkrTHt6myDTm1vSRbsw6stE/0gCxjyq2tgRqAQdWYoS4kIQHieawfKhHwzTYQw=="
---

# Luna Protocol : mutualisation des cerveaux, classification émotionnelle, et routage intéressant/futile

Dans les [deux](/articles/fr/luna-protocol-discord-bot) [articles](/articles/fr/luna-protocol-official-models) précédents, j'ai présenté Luna Protocol comme un bot Discord unique avec un système comportemental complexe et un modèle fine-tuné. Mais l'architecture a depuis bien évolué. Ce qui était un monolithe -- un seul processus Node.js qui gérait à la fois le bot Discord, le comportement, et les appels LLM -- s'est transformé en **quatre couches indépendantes**, chacune avec sa propre responsabilité, son propre langage, et son propre cycle de vie.

Cette séparation a apporté des bénéfices inattendus : la mutualisation des "cerveaux" entre plusieurs plateformes, un système de classification émotionnelle qui ajuste dynamiquement les paramètres du LLM, et un routage intelligent des messages entre deux modèles selon l'importance perçue de la conversation.

L'évolution ne s'est pas faite d'un coup -- elle a suivi un chemin organique. J'ai d'abord séparé le dossier `server/` du repo du bot, créant ainsi **Krystal** d'un côté et laissant **Jade** comme adaptateur Discord. Puis j'ai créé **Pixieglow** (adaptateur Matrix) en reprenant le `llm-core` et le bus d'événements de Jade. Ensuite est venu **Sapphire** pour introduire une classification GENERIC/SEMANTIC avec DistilBERT -- mais les résultats n'étaient pas concluants, je suis donc passé par des centroids d'embeddings, plus malléables pour l'enrichissement d'exemples et plus précis ; la classification est devenue FUTILE/INTERESSANT. J'ai finalement ajouté des centroids de **valence** et **arousal** pour réguler la température et le repeat penalty du LLM. Pour finir, j'ai dégagé tout le code redondant entre Jade et Pixieglow en créant **Emerald**, le cerveau mutualisé, transformant Jade et Pixieglow en simples clients socket-driven.

En parallèle, j'ai tenu à jour un site web qui retrace l'avancement du projet : [protocol-luna.github.io](https://protocol-luna.github.io/).

Cet article raconte comment et pourquoi j'ai découpé ces couches, ce que chaque service fait exactement, et comment des concepts comme les **centroids** (des vecteurs moyens d'embeddings) et les **variables de ressentiment** (inspirées du chatbot PARRY des années 70) ont transformé un simple bot Discord en un système multi-plateforme étonnamment cohérent.

---

## Le problème avec le monolithe

Au départ, Luna Protocol tenait dans un seul processus Node.js. Le code gérait :

- La connexion à Discord (via la bibliothèque Eris)
- L'évaluation des déclencheurs (mentions, mots-clés, follow-up...)
- La simulation de comportements humains (fautes de frappe, hésitations, sommeil...)
- Les appels HTTP au serveur LLM local (llama.cpp)
- La gestion des sessions et de l'anti-spam
- Le pipeline TTS

Tout était dans le même processus, communiquant via des bus d'événements typés (`TypedBus`). Ça fonctionnait, mais avec des limites :

- **Impossible d'ajouter un client Matrix** sans dupliquer tout le code de comportement
- **Le LLM et le bot étaient dans le même repo** : le dossier `server/` existait déjà, mais impossible de faire évoluer l'un sans toucher à l'autre
- **Pas de classification intelligente** : chaque message était traité de la même façon, qu'il s'agisse d'un "lol" ou d'une question existentielle
- **Pas d'état émotionnel persistant** : le bot ne "ressentait" rien

Le découpage en couches a résolu tous ces problèmes.

---

## Les quatre couches

L'architecture actuelle de Luna Protocol est organisée comme un entonnoir à quatre niveaux :

```
Matrix / Discord
      |
      v
  [ADAPTATEURS]      Pixieglow (Matrix) / Jade (Discord)
      |
      v
  [BRAIN]            Emerald (WebSocket, port 3126)
      |
      v
  [CLASSIFIEUR]      Sapphire (HTTP, port 3123)
      |
      v
  [INFERENCE]        Krystal (llama.cpp, ports 3124 / 3125)
```

Chaque couche peut être redémarrée, mise à jour, ou remplacée indépendamment.

---

### Couche 1 : les adaptateurs (Pixieglow et Jade)

Ce sont les couches les plus simples. Leur seul travail est de traduire les événements d'une plateforme de messagerie en un protocole standardisé vers Emerald :

- **Jade** est l'adaptateur Discord. Il utilise la bibliothèque Eris pour se connecter à Discord et forwarder les messages vers Emerald via WebSocket. Il gère aussi le pipeline TTS (synthèse vocale via Piper, conversion en OGG, upload sur Discord).
- **Pixieglow** est l'adaptateur Matrix. Il utilise l'API HTTP Client-Server de Matrix directement (pas de SDK), avec un long-poll sync. Il n'a pas de TTS.

Les deux adaptateurs partagent le même protocole WebSocket défini dans `emerald-client.ts` :

```typescript
type ClientId = "jade" | "pixieglow";

// Événements (adaptateur -> Emerald)
type InEvent = MessageEvent | ReadyEvent | BotMessageEvent | PresenceEvent;

// Commandes (Emerald -> adaptateur)
type OutCommand = RespondCommand | TypingCommand | SetPresenceCommand
                | SpontaneousCommand | ForgotCommand;
```

L'existence de deux adaptateurs avec la même interface prouve la mutualisation : **le même "cerveau" (Emerald) sert indifféremment un bot Discord et un bot Matrix**, avec des comportements identiques. Le protocole est déclaratif : Emerald ne dit pas à l'adaptateur *comment* envoyer un message, il dit *quoi* envoyer (le texte avec un délai, éventuellement un plan de burst, une réaction, etc.). Chaque adaptateur implémente l'exécution concrète selon sa plateforme.

C'est la force de cette architecture : pour ajouter le support de Telegram, Signal, ou autre, il suffit d'écrire un adaptateur qui implémente le protocole WebSocket.

---

### Couche 2 : le cerveau (Emerald)

Emerald est le service central de décision. Il écoute sur le port 3126 en WebSocket et gère :

- **L'évaluation des déclencheurs** : mention, DM, nom, mot-clé, follow-up, aléatoire
- **La simulation comportementale** : délais de concentration, fautes de frappe, hésitations, oublis, burst, fatigue thématique
- **Les cycles de sommeil** : modes sleep / slow / short
- **La gestion des sessions** : cooldown, limites de session, anti-spam
- **Le routage vers Sapphire** : envoi des messages, réception des réponses streamées

Emerald est le service central qui a permis la mutualisation, et c'est celui qui a le plus bénéficié de la séparation. Avant, chaque comportement (typo, burst, hesitation) était entrelacé avec le code Discord. Maintenant, ils sont dans des modules dédiés dans `behavior/` :

```
emerald/src/behavior/
  burst.ts         -- Planification des messages en rafales
  mannerisms.ts    -- Délais, hésitations, réactions, oublis
  sleep.ts         -- Évaluation des horaires de sommeil
  typo.ts          -- Simulation de fautes de frappe (AZERTY/QWERTY)
```

Le cerveau ne sait pas sur quelle plateforme il tourne. Il recoit un `MessageEvent` avec un `clientId` ("jade" ou "pixieglow"), prend une décision, et renvoie une commande. L'adaptateur se charge du reste.

---

### Couche 3 : le classifieur émotionnel (Sapphire)

Sapphire est le service le plus intéressant sur le plan technique. C'est un **middleware LLM** écrit en Python avec FastAPI, qui joue quatre rôles critiques :

1. **Classifieur binaire FUTILE / INTERESSANT** via centroids d'embeddings
2. **Scoreur émotionnel** (valence / arousal) via centroids
3. **Routeur de backends** vers Krystal (petit modèle vs grand modèle)
4. **Injecteur few-shot** et gestionnaire de sessions

#### Les centroids : le coeur de la classification

Un **centroid** est un concept simple : c'est la moyenne d'un ensemble de vecteurs d'embeddings. Concrètement, j'ai rassemblé des centaines d'exemples de messages, je les ai passés dans un modèle d'embedding (`BAAI/bge-small-en-v1.5`, 384 dimensions), et j'ai moyenné les vecteurs obtenus.

Il y a **deux centroids de classification** :

- `futile_centroid` : ~683 messages triviaux ("lol", "ok", "hello") via k-means (k=10, seed=42)
- `interessant_centroid` : ~678 messages substantiels (techniques, personnels, philosophiques) via k-means (k=10, seed=42)

Quand un message arrive :

```python
def classify(text, embedder, futile_centroids, interessant_centroids):
    emb = embedder.query_embed(text)                     # vecteur 384-D
    sim_f = max(cos(emb, c) for c in futile_centroids)     # max sur 10
    sim_i = max(cos(emb, c) for c in interessant_centroids) # max sur 10
    diff = sim_i - sim_f
    label = "INTERESSANT" if diff > 0 else "FUTILE"
    return label, abs(diff), sim_f, sim_i
```

Le score par classe est la **similarité cosinus maximale** parmi ses 10 centroids. Cela capture les sous-types dans chaque catégorie -- une salutation et un au revoir tombent tous deux près d'un des 10 centroids futiles même s'ils sont éloignés dans l'espace d'embedding. Pas d'entraînement, pas de GPU, juste du k-means au démarrage et des produits scalaires à l'exécution.

#### Pourquoi deux modèles ?

Le résultat de cette classification décide quel backend LLM est invoqué :

| Label | Backend Krystal | Modèle | Port |
|-------|----------------|--------|------|
| `FUTILE` | `generic` | Luna-Protocol-1.5B (941 Mo, Q4_K_M) | 3124 |
| `INTERESSANT` | `semantic` | Hermes-3-3B ou 8B (selon config) | 3125 |

L'intuition est simple : un "lol" ou un "nm just chillin u" ne mérite pas d'invoquer un modèle de 8 milliards de paramètres. Le petit modèle fine-tuné Luna 1.5B, entraîné sur 200 000 échantillons Discord, suffit largement pour les échanges légers. En revanche, une question sur la vie, une confidence, ou un débat technique est routée vers le grand modèle qui peut produire une réponse plus riche.

Ce routage économique réduit considérablement la charge sur le serveur LLM : environ 70% des messages sont classés FUTILE et traités par le petit modèle, libérant le grand modèle pour les conversations qui en valent vraiment la peine.

#### L'axe émotionnel : valence et arousal

Mais ce n'est pas tout. Sapphire utilise le **même mécanisme de centroids** sur un axe indépendant pour évaluer l'émotion du message :

Il y a **quatre centroids émotionnels** :

| Pôle | Exemples |
|------|----------|
| `positive` | "hell yeah", "love that", "this is great" |
| `negative` | "shut up", "i hate this", "this sucks" |
| `high_arousal` | "WHAT THE HELL", "omg omg omg", "AAAAA" |
| `low_arousal` | "just chilling", "meh", "i guess" |

Le score se calcule comme une différence de similarité sur chaque axe :

```python
valence = sim(emb, positive) - sim(emb, negative)     # [-1, +1]
arousal = sim(emb, high_arousal) - sim(emb, low_arousal)  # [-1, +1]
```

**Valence** mesure si le message est positif ou négatif. **Arousal** mesure son intensité émotionnelle. Ensemble, ils forment le modèle circumplex de l'affect (Russell, 1980) -- le même modèle psychologique qui a inspiré le chatbot **PARRY** en 1972.

#### Les variables de ressentiment : comment les émotions contrôlent le LLM

C'est là que l'inspiration de PARRY devient tangible. PARRY (créé par Kenneth Colby en 1972) était un chatbot conçu pour simuler un patient paranoïaque. Il possédait des variables internes -- peur, colère, méfiance -- qui modifiaient ses réponses. Par exemple, un PARRY "effrayé" répondait de façon plus agressive.

Sapphire fait la même chose, mais avec des variables continues et une méthode plus élégante : les paramètres d'échantillonnage du LLM sont ajustés en temps réel selon l'état émotionnel de la conversation.

##### La température suit l'arousal

```python
temperature = clamp(0.7 + arousal * 0.3, 0.4, 1.0)
```

| Arousal | Température | Effet |
|---------|-------------|-------|
| -1.0 (calme) | 0.40 | Basse créativité, réponses prévisibles |
| 0.0 (neutre) | 0.70 | Créativité par défaut |
| +1.0 (excité) | 1.00 | Maximum de randomité, réponses surprenantes |

Quand quelqu'un est excité ou énervé (arousal élevé), la température monte. Le modèle produit des réponses plus variées, plus créatives, parfois plus chaotiques -- comme un humain qui "s'emballe". Quand la conversation est calme, la température baisse, les réponses sont plus posées.

##### Le repeat penalty suit la valence

```python
repeat_penalty = clamp(1.15 - valence * 0.1, 1.0, 1.3)
```

| Valence | Repeat Penalty | Effet |
|---------|---------------|-------|
| -1.0 (négatif) | 1.25 | Forte pénalité, évite les répétitions |
| 0.0 (neutre) | 1.15 | Valeur par défaut |
| +1.0 (positif) | 1.05 | Faible pénalité, permet les répétitions |

Plus la conversation est négative, plus le modèle est poussé à éviter de se répéter -- comme quelqu'un qui cherche ses mots dans une dispute tendue. Plus la conversation est positive, plus le modèle peut se permettre des affirmations redondantes, comme une conversation détendue.

##### L'état émotionnel cumulatif

Ces scores ne portent pas que sur le message immédiat. Un `EmotionState` maintient une **moyenne exponentielle mobile** de valence et arousal par session :

```python
class EmotionState:
    def __init__(self, decay=0.85, deadzone=0.06):
        self.decay = decay
        self.deadzone = deadzone

    def update(self, key, valence_delta, arousal_delta):
        if abs(valence_delta) < self.deadzone:
            valence_delta = 0.0
        if abs(arousal_delta) < self.deadzone:
            arousal_delta = 0.0
        s = self._state.setdefault(key, {"valence": 0.0, "arousal": 0.0})
        s["valence"] = s["valence"] * self.decay + valence_delta * (1 - self.decay)
        s["arousal"] = s["arousal"] * self.decay + arousal_delta * (1 - self.decay)
        return s
```

Le `decay` à 0.85 signifie que 85% de l'état précédent est conservé à chaque message, et 15% du nouveau signal est intégré. Cela donne une **mémoire émotionnelle** qui lisse les variations brutales : un seul message négatif ne rend pas le bot "triste", mais une série de messages négatifs fait progressivement dériver son humeur.

En pratique : si quelqu'un commence une conversation de façon très excitée (`arousal=+0.8`), la température reste élevée pendant plusieurs échanges, même si les messages suivants sont plus calmes. L'émotion met du temps à redescendre -- comme un humain qui reste "chaud" après une dispute.

---

### Couche 4 : l'inférence (Krystal)

Krystal est la couche la plus basse : un wrapper autour de `llama.cpp` qui expose une API compatible OpenAI (`/v1/chat/completions`). Il tourne en deux instances PM2 :

- `krystal-small` : le modèle Luna 1.5B fine-tuné, sur le port 3124, avec affinité CPU 0
- `krystal-large` : un modèle Hermes 3B, sur le port 3125, avec affinité CPU 0,1

Les deux instances sont des processus `llama-server` pré-compilés, lancés avec `taskset` pour le pinning CPU.

Le fine-tune du modèle Luna a lui aussi évolué depuis le deuxième article : il est maintenant entraîné sur **200 000 échantillons** (contre 50 000 précédemment), toujours à partir de Qwen2.5-1.5B-Instruct via QLoRA. Les 200k échantillons sont un sous-ensemble du dataset Discord-Dialogues, filtrés pour ne garder que les conversations les plus naturelles et les plus diverses. Le but : élargir le registre stylistique du modèle sans perdre la flexibilité qui rend le few-shot priming si efficace.

---

## Le schéma complet : un message en transit

Voici ce qui se passe concrètement quand quelqu'un envoie "je suis vraiment triste aujourd'hui" sur Discord :

1. **Jade** recoit le message via l'API Gateway Discord. Il le transforme en `MessageEvent` et l'envoie à Emerald via WebSocket.
2. **Emerald** évalue le déclencheur (mention ? nom ? mot-clé ?). C'est une mention directe. Il calcule un délai de concentration, vérifie le cooldown, la session, la fatigue thématique. Il décide de répondre et envoie le message à Sapphire via HTTP.
3. **Sapphire** embedd le message avec `bge-small-en-v1.5`.
   - Classification : le message est plus proche du centroid `interessant` que du centroid `futile` (diff = +0.31) -> **INTERESSANT**
   - Émotion : valence négative (-0.42), arousal modéré (0.35)
   - Routage : direction `KRYSTAL_SEMANTIC_URL` (port 3125, grand modèle)
   - Paramètres échantillonnage : température = 0.80 (arousal augmenté), repeat_penalty = 1.19 (valence négative)
   - L'état émotionnel de la session est mis à jour avec ces valeurs
4. **Krystal** (instance large) génère la réponse avec les paramètres ajustés émotionnellement et la renvoie à Sapphire.
5. **Sapphire** stream la réponse vers Emerald avec les métadonnées (label, valence, arousal, statistiques de débogage).
6. **Emerald** décide d'ajouter une hésitation ("oh..."), planifie un burst (2 fragments), et choisit une réaction. Il envoie une `RespondCommand` à Jade.
7. **Jade** exécute : attend le délai initial, envoie le premier fragment avec l'hésitation, attend 1.5s, envoie le second fragment. Il montre l'indicateur de frappe pendant toute la génération.

Tout cela en moins de 3 secondes pour l'utilisateur.

---

## Les centroids : pourquoi c'est mieux qu'un classifieur neuronal

Le choix des centroids d'embeddings plutôt qu'un classifieur traditionnel (comme le DistilBERT que j'utilisais avant) mérite une explication.

Un classifieur neuronal apprend une frontière de décision entre les classes -- typiquement une transformation non-linéaire qui projette les entrées vers des probabilités. Il est précis, mais :

- Il nécessite des données d'entraînement étiquetées
- Il est sensible au changement de distribution (data drift)
- Il est difficile à interpréter
- Il doit être ré-entraîné pour ajouter une nouvelle classe

Un centroid, en revanche, est un **vecteur moyen** d'embeddings d'exemples. La classification se fait par similarité cosinus à ce vecteur moyen. Avantages :

- **Pas d'entraînement** : on calcule juste la moyenne d'embeddings d'exemples choisis à la main
- **Facile à interpréter** : on peut regarder quels exemples sont les plus proches du centroid pour comprendre "ce que le centroid a appris"
- **Ajout d'une classe** : on ajoute juste un nouveau centroid -- pas de ré-entraînement
- **Robuste** : le centroid est une moyenne, donc les outliers ont peu d'impact

Le vrai pouvoir des centroids, c'est qu'ils transforment un problème de classification en un problème de **mesure de distance spatiale**. On peut visualiser les catégories comme des régions dans un espace à 384 dimensions (ou en 2D/3D après réduction dimensionnelle PCA/t-SNE).

### Visualisation 3D des centroids

En pratique, voici à quoi ressemblent les centroids de classification dans l'espace d'embedding. Chaque point est un message d'exemple, projeté en 3D par PCA (les 384 dimensions originales sont réduites à 3 pour la visualisation). Les points bleus sont les messages futiles, les points jaunes les messages intéressants. Les **20 marqueurs en diamant** sont les centroids k-means (10 par classe, seed=42). Passez la souris sur un point pour voir le texte original de l'exemple.

<iframe src="assets/centroids-plot.html" style="width:100%;height:550px;border:none;border-radius:8px;" loading="lazy" title="Classification par centroïdes - vue 3D interactive"></iframe>

Deux exemples de test sont affichés en rouge : "lol" (classé futile) et "i feel sad today" (classé intéressant). Même après réduction de 384 à 3 dimensions (14,7% de variance expliquée), les deux clusters sont clairement séparés. L'annotation en haut montre les comptes exacts et la zone ambiguë.

Le centroid du message d'entrée se promène dans cet espace en fonction de son contenu. La classification FUTILE/INTERESSANT consiste simplement à mesurer quel centroid est le plus proche par similarité cosinus. On peut ainsi représenter chaque message comme un point dans un espace à multiples dimensions, chaque dimension correspondant à une propriété sémantique.

---

## Ce que ça change en pratique

Les utilisateurs ne voient pas les couches, les centroids, ou les ajustements de température. Mais ils ressentent les effets :

- **Réponses plus rapides** pour les messages simples (le petit modèle est 2x plus rapide et gère 70% du trafic)
- **Ton adaptatif** : si vous êtes énervé, le bot "sent" l'énervement et adapte son style
- **Cohérence cross-plateforme** : un bot Matrix et un bot Discord partagent le même cerveau et le même état émotionnel
- **Pas de "mode assistant"** : le fine-tune + few-shot + routage intelligent évite les réponses corporate

Le passage à 200k échantillons d'entraînement pour le petit modèle a encore renforcé ces effets : le modèle capture mieux la diversité des conversations Discord sans perdre la malléabilité que permet le few-shot priming.

---

## L'infrastructure complète

Voici les services qui tournent actuellement :

| Service | Technologie | Port(s) | Rôle |
|---------|------------|---------|------|
| Pixieglow | TypeScript (Bun) | -- | Adaptateur Matrix |
| Jade | TypeScript (esbuild) | -- | Adaptateur Discord |
| Emerald | TypeScript (Bun) | 3126 (WebSocket) | Cerveau / décisions |
| Sapphire | Python (FastAPI) | 3123 (HTTP) | Classifieur + émotion |
| Krystal small | llama.cpp (PM2) | 3124 | Petit modèle (1.5B, futile) |
| Krystal large | llama.cpp (PM2) | 3125 | Grand modèle (3B+, interessant) |

Les dépendances entre services sont unidirectionnelles : l'adaptateur dépend d'Emerald, Emerald dépend de Sapphire, Sapphire dépend de Krystal. Pas de cycle. Chaque service peut être redémarré indépendamment.

---

## Conclusion

Diviser Luna Protocol en quatre couches n'a pas été qu'un exercice d'architecture. C'était une réponse à des limitations concrètes : impossibilité de supporter Matrix, manque de conscience émotionnelle, absence de priorisation intelligente des messages.

Aujourd'hui, le système est plus robuste (un crash du LLM ne tue pas le bot), plus extensible (un adaptateur Telegram ou WhatsApp suivrait le même protocole WebSocket), et plus "vivant" : le bot adapte son comportement, son ton, et même les paramètres du LLM à l'état émotionnel perçu de la conversation.

Les centroids d'embeddings sont l'élément clé qui rend tout cela possible sans complexité démesurée : pas de réseau de neurones entraîné, pas de pipeline de données étiquetées, juste des moyennes de vecteurs et des similarités cosinus. C'est une technique simple, incroyablement efficace, et terriblement sous-estimée.

| Ressource | Lien |
|----------|------|
| Site web du projet | [protocol-luna.github.io](https://protocol-luna.github.io/) |
| Pixieglow | [protocol-luna/pixieglow](https://github.com/protocol-luna/pixieglow) |
| Emerald | [protocol-luna/emerald](https://github.com/protocol-luna/emerald) |
| Sapphire | [protocol-luna/sapphire](https://github.com/protocol-luna/sapphire) |
| Krystal | [protocol-luna/krystal](https://github.com/protocol-luna/krystal) |
| Article 1 : le bot Discord | [Luna Protocol : j'ai créé un bot Discord autonome](/articles/fr/luna-protocol-discord-bot) |
| Article 2 : le fine-tuning | [Luna Protocol : pourquoi j'ai fine-tuné un modèle de 1,5B](/articles/fr/luna-protocol-official-models) |
