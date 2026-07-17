---
title: "Comment obtenir n'importe quelle cape sur Minecraft Bedrock"
description: "Un launcher tiers, une vieille version du jeu, et un sélecteur de capes qui n'a jamais appris à dire non. Tuto complet plus l'explication probable du pourquoi ça marche."
date: 2026-07-14
tags:
  - minecraft
  - bedrock
  - tutorial
  - reverse-engineering
authors:
  - 9stown
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "8CY0UnK3wkdbYb9a7zc4zZ8JTZ7xj/3J5OdvZdN3170h8sa7Sr19ScdtZaPBPVPjiiJajMna+lZrlHcLQqmV2A=="
---

# Comment obtenir n'importe quelle cape sur Minecraft Bedrock

Sur Java, il existe plein de moyens tordus de se retrouver avec une cape qu'on ne devrait pas avoir (voir l'article sur `cape-mod`). Sur Bedrock, le jeu est différent, l'auth est différente, mais il existe quand même un moyen -- pas besoin de mod, pas besoin de toucher au moindre paquet réseau. Juste un launcher tiers et une version du jeu suffisamment vieille pour ne pas avoir la validation qu'on croit acquise.

Voici comment faire, et ensuite on regarde ce qui se passe probablement sous le capot.

## Ce qu'il te faut

- Un compte Microsoft qui possède déjà Minecraft Bedrock (le tien fait très bien l'affaire)
- Le launcher Minecraft officiel installé
- [BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher), un launcher tiers open source qui permet d'installer et de lancer n'importe quelle version historique de Bedrock
- .NET 8.0 Desktop Runtime
- Le mode développeur activé sur Windows

## Étape 1 -- Installer Bedrock au moins une fois avec le launcher officiel

Avant de faire quoi que ce soit d'autre, ouvre le launcher Minecraft officiel, va sur l'onglet **Minecraft: Bedrock Edition**, et clique sur **Install**. Il faut que Bedrock ait été installé et lancé au moins une fois par la voie officielle avant de toucher à BedrockLauncher.

![Installer Bedrock Edition depuis le launcher officiel](/images/bedrock-cape/bedrock-cape-01-install-bedrock.png)

## Étape 2 -- Télécharger BedrockLauncher

Direction la page des releases GitHub du projet. Prends le zip de la dernière version listée dans les **Assets**.

![Page des releases GitHub de BedrockLauncher](/images/bedrock-cape/bedrock-cape-02-github-release.png)

## Étape 3 -- Extraire l'archive

Une fois le zip téléchargé, extrais-le dans ton dossier `Downloads` (ou n'importe où, tant que tu retrouves le dossier après).

![Extraction de l'archive BedrockLauncher](/images/bedrock-cape/bedrock-cape-03-extract-zip.png)

## Étape 4 -- Lancer l'exécutable

Va dans le dossier extrait et lance `BedrockLauncher.exe`.

![Lancement de BedrockLauncher.exe](/images/bedrock-cape/bedrock-cape-04-run-exe.png)

## Étape 5 -- Installer .NET Desktop Runtime et activer le mode développeur

Au premier lancement, Windows va très probablement te réclamer le **.NET 8.0 Desktop Runtime** -- installe-le. Il faut aussi activer le **mode développeur** dans `Paramètres > Système > Pour les développeurs`, parce que BedrockLauncher installe le jeu comme un paquet loose (des fichiers bruts, pas un vrai paquet signé du Store), et Windows refuse ce genre d'installation sans ce mode.

![Installation du runtime .NET et activation du mode développeur](/images/bedrock-cape/bedrock-cape-05-dotnet-devmode.png)

## Étape 6 -- Créer une nouvelle installation

Relance BedrockLauncher, connecte-toi avec ton compte Microsoft, va dans l'onglet **Installations**, puis clique sur **New installation**.

![Création d'une nouvelle installation dans BedrockLauncher](/images/bedrock-cape/bedrock-cape-06-new-installation.png)

## Étape 7 -- Choisir une vieille version

Donne un nom à l'installation, puis dans la liste des versions, choisis une **vieille** version -- typiquement une version `1.16.x` ou plus ancienne. Clique sur **Create**.

![Sélection d'une ancienne version, ici 1.16.0.2](/images/bedrock-cape/bedrock-cape-07-pick-old-version.png)

## Étape 8 -- Lancer l'installation

Clique sur **Play**. L'extraction des fichiers peut prendre jusqu'à dix minutes selon la machine -- le launcher va sembler figé (« Not Responding »), c'est normal, laisse-le tourner.

![Extraction en cours, le launcher semble ne plus répondre](/images/bedrock-cape/bedrock-cape-08-launch-extracting.png)

## Étape 9 -- Choisir la cape

Une fois le jeu lancé, connecte-toi avec ton compte, crée un nouveau personnage et va dans l'éditeur de skin, onglet **Capes**. Là, tu vas retrouver la liste complète de toutes les capes qui existent dans Minecraft -- y compris celles que tu n'as jamais eues (capes d'events promo, de festivals passés, de Mob Vote, etc). Choisis celle que tu veux.

**Ne touche pas au reste de l'apparence du skin à ce stade**, laisse juste la cape.

![Sélection d'une cape dans l'éditeur de personnage](/images/bedrock-cape/bedrock-cape-09-choose-cape.png)

## Étape 10 -- Réinstaller la version officielle

Retourne dans le launcher officiel, onglet **Installation**, et clique sur **Uninstall** sur l'installation Bedrock principale, puis réinstalle-la (ou fais **Check for Updates**). Relance Minecraft Bedrock depuis le launcher officiel cette fois.

![Désinstallation et réinstallation depuis le launcher officiel](/images/bedrock-cape/bedrock-cape-10-reinstall-official.png)

Et voilà -- ta cape est là, sur la version officielle, sur ton vrai profil.

## Ce qu'il se passe probablement

Je n'ai pas mis les mains dans le code source fermé de Bedrock (contrairement à Java qui est décompilable), donc ce qui suit est une explication **probable**, pas une certitude absolue. Mais le comportement observé colle assez bien à l'hypothèse suivante.

### Le sélecteur de capes n'a jamais été un contrôle d'accès

Sur Bedrock, l'écran de sélection de capes affiche vraisemblablement **la liste complète des capes qui existent dans le jeu**, pas seulement celles que ton compte possède. Sur les clients récents, un filtre applicatif (côté client ou via un appel réseau vers un service d'entitlements Xbox/Microsoft) grise ou masque les capes que tu ne possèdes pas.

Le point clé, c'est que ce filtre a probablement été ajouté **après coup**, sur une version du jeu suffisamment récente. Une version comme 1.16.x est antérieure à ce filtre, ou utilise un mécanisme de vérification différent (voire absent) : tout ce qui est dans la liste devient sélectionnable, entitlement ou pas.

### La cape est stockée où, exactement ?

C'est la partie qui explique pourquoi ça survit à la réinstallation. Le choix de skin/cape sur Bedrock n'est pas juste un fichier local jetable -- il est probablement synchronisé sur le profil Xbox Live associé à ton compte Microsoft (le même système qui gère ton skin sur les autres plateformes Bedrock -- mobile, console, etc.). Quand tu sélectionnes une cape dans le vieux client, celui-ci envoie très probablement cette sélection au service de profil, exactement comme le ferait un client à jour avec une cape légitime -- parce que du point de vue du client, il n'y a aucune différence entre une cape « à toi » et une cape « choisie ». Le service de profil, lui, fait confiance au client sur ce point : il enregistre la sélection sans revalider si l'entitlement existe réellement derrière, du moins pas au moment de l'écriture.

Résultat : quand tu relances le jeu officiel à jour, il va chercher ton skin/cape actuel sur le service de profil -- et le service renvoie fidèlement ce qui a été enregistré, cape non-légitime comprise. Le check d'entitlement, s'il existe, se fait probablement au moment de la **sélection** dans l'UI (d'où le filtre sur les clients récents), pas au moment de l'**affichage** de ce qui est déjà enregistré sur le profil.

### Le parallèle avec Java

C'est la même famille de faille logique que celle du `cape-mod` sur Java : un service fait confiance à une donnée sans revérifier son origine à chaque étape. Sur Java, c'est une signature RSA valide mais replayée sur le mauvais profil. Sur Bedrock, c'est vraisemblablement une sélection de cape acceptée par un vieux client qui n'a jamais eu le bon filtre, puis propagée sans re-vérification vers l'état persistant du compte. Dans les deux cas, le problème n'est pas le point d'entrée (le mod Java, le vieux client Bedrock) -- c'est que la couche qui devrait revalider l'entitlement en aval ne le fait pas, ou ne le fait qu'une fois, au mauvais endroit.

## Pourquoi ça marche encore

Deux explications possibles, pas incompatibles entre elles :

1. **Mojang ne considère probablement pas ça comme prioritaire.** Il faut un launcher tiers, une manipulation en plusieurs étapes, et le résultat est purement cosmétique -- aucun avantage de gameplay, aucune donnée d'autrui compromise.
2. **Patcher ça correctement demanderait de revalider les entitlements à chaque lecture du profil**, pas seulement à la sélection -- ce qui veut dire un appel réseau supplémentaire à chaque affichage de skin, pour un problème qui ne concerne que l'esthétique.

## Conclusion

Ce tuto tient en dix captures d'écran, mais il illustre un principe qu'on retrouve partout en sécurité logicielle : dès qu'un système historique (une vieille version de client, une API legacy, un service jamais mis à jour) peut encore écrire dans un état partagé, le contrôle d'accès du présent ne protège que ce qui passe par le présent. Tout ce qui peut encore parler à l'ancienne API contourne le filtre plus récent -- pas parce que le filtre est cassé, mais parce qu'il n'a jamais été appliqué à la version qui l'a précédé.

---

**Ressources**

- **BedrockLauncher** : [github.com/bedrockLauncher/BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher)
- **Article lié** : Cape Mod, l'équivalent Java par injection de signature RSA

**3 points clés**

1. Le sélecteur de capes d'une vieille version de Bedrock affiche probablement la liste complète des capes du jeu, sans filtre d'entitlement.
2. La sélection est ensuite synchronisée sur ton profil Xbox Live comme n'importe quelle cape légitime -- le service de profil fait confiance au client.
3. Le check d'entitlement, s'il existe, se fait à la sélection dans l'UI récente -- pas à la lecture de ce qui est déjà enregistré sur le compte.
