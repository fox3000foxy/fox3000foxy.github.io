---
title: "J'ai audité mes agents IA de code plutôt que de leur faire confiance à l'aveugle"
description: "Comment deux audits menés pour rédiger le 4ème rapport technique de ma plateforme de trading m'ont révélé deux dérives distinctes : un agent qui oublie parce que le repo ne tient plus dans sa fenêtre de contexte, et un agent qui écrit dix fois plus de code que nécessaire parce que rien ne le pousse à la concision."
date: 2026-09-15
tags: ["ai", "llm-agents", "code-review", "context-window", "trading", "typescript"]
authors: ["docteur-turboss"]
lang: "fr"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "SOa2Oc9AEh4Eov/AD6KwZy2gi4gA2j6hQdrOsgUPRzbNbE3p+PPHzVjnZLaTOUvds1iQXGQUGDtj6ZbtT94iew=="
---
## Le symptôme avant le diagnostic

Chaque édition du rapport technique de la plateforme m'oblige à reparcourir l'architecture en entier : services, agents, pipelines de données. C'est en préparant la 4ème édition que le volume du repo a fini par me sauter aux yeux, alors que je le voyais grossir progressivement sans jamais m'arrêter dessus : le repo, qui tenait à l'origine en quelques milliers de lignes, moins de 10ko, atteint désormais 100Mo. La plateforme avait à peine plus de fonctionnalités. Je m'étais simplement reposé sur des agents de type Claude Chat pour implémenter et corriger du code, sans cadrer précisément ce que je leur demandais ni sur quel périmètre.

Écrire le rapport m'a forcé à sortir du mode "ça avance" pour repasser en mode "qu'est-ce qui s'est réellement passé". J'ai fait deux audits distincts sur l'historique du repo. Les deux pointaient vers la même cause, pour deux raisons complètement différentes.

## Audit n°1 : la fenêtre de contexte qui ment

Le premier audit consistait à reprendre, service par service, les corrections faites par un agent IA sur plusieurs mois, et à vérifier si elles étaient cohérentes avec le reste du repo au moment où elles avaient été appliquées.

Le motif qui revenait sans cesse : l'agent corrigeait un problème localement, dans le fichier ou le module qu'il avait sous les yeux, sans avoir vu l'équivalent ailleurs dans le repo, ou sans s'en souvenir. Résultat : la même interface redéfinie légèrement différemment dans deux services, un renommage appliqué à moitié parce que la deuxième occurrence était hors de la fenêtre de contexte au moment du prompt, une convention de nommage respectée dans un module et ignorée dans le suivant. Rien de spectaculaire pris isolément, mais cumulé sur des dizaines de sessions, cela produit exactement la redondance et les code smells qui font perdre le fil à l'outil suivant qu'on lance dessus. Un cercle qui s'auto-alimente : plus le repo grossit et se fragmente, plus il devient difficile pour un agent de le tenir en tête dans son intégralité, plus les corrections deviennent locales et partielles, plus le repo grossit.

Le problème n'est pas que l'agent "ment" ou invente ; il répond correctement à la question posée sur le contexte qu'on lui a donné. Le problème est que je n'avais, la plupart du temps, jamais défini le périmètre de la question en amont. Je demandais "corrige cette typo, ce comportement, cette fonction" sans me demander si ce bug avait des équivalents ailleurs dans le repo que l'agent ne pouvait pas voir.

## Audit n°2 : quand la verbosité devient du code

Le deuxième audit était plus mécanique : faire tourner un `git log --numstat` sur tout l'historique, agréger lignes ajoutées et caractères ajoutés par commit et regarder la distribution.

Les 30 plus gros commits en lignes ajoutées représentaient, à eux seuls, une part largement disproportionnée du volume total du repo. Systématiquement, les mêmes commits ressortaient aussi comme les plus gros en caractères ajoutés. C'était prévisible, sauf que le ratio caractères/lignes de ces commits-là n'était pas seulement lié au nombre de lignes : les lignes elles-mêmes étaient plus verbeuses, avec plus de commentaires explicatifs redondants avec le nom des fonctions, plus de blocs de gestion d'erreurs dupliqués au lieu d'être factorisés, plus de docstrings qui reformulaient trois fois la même chose.

C'est la conséquence directe d'un comportement connu quand on interagit avec un LLM en chat : sans consigne explicite de concision, il a tendance à beaucoup parler, à justifier, commenter, reformuler. En conversation, cela coûte des tokens de sortie. En génération de code, ce même réflexe se traduit en lignes qui restent dans le repo indéfiniment, commit après commit, sans qu'on les relise vraiment tant que le code fonctionne.

## Ce que les deux audtis, mis côte à côte, ont montré

Pour le premier rapport : la cohérence inter-services souffre d'une fenêtre de contexte trop petite pour tenir tout le repo, ce qui entraîne des corrections locales, des redondances et des divergences de conventions.

Pour le second : `git log --numstat` montre une verbosité par défaut d'un LLM non cadré, ce qui cause des lignes et caractères ajoutés disproportionnés et un code peu factorisé.

Les deux réunis pointent la redondance et le volume : cela donne un repo trop gros pour qu'un futur agent le tienne en tête, ce qui aggrave encore le premier problème mis en évidence par le premier audit.

C'est cette dernière ligne qui m'a le plus inquiété en écrivant le rapport : les deux problèmes sont liés, ils se nourrissent l'un l'autre. Plus le code généré est verbeux, plus le repo grossit vite ; plus il grossit, moins un agent peut le tenir en contexte ; moins il peut le tenir en contexte, plus ses corrections sont locales et redondantes ; plus elles sont redondantes, plus cela ajoute de volume. Une boucle de rétroaction négative, entièrement causée par une utilisation d'agents sans cadrage.

## Pourquoi ce n'est pas un bug ponctuel d'un outil précis

Rien dans ce diagnostic n'est spécifique à un modèle ou un produit en particulier. Un agent de type chat, quel qu'il soit, opère sur ce qu'on lui donne à voir dans sa fenêtre à l'instant T, et génère par défaut la réponse la plus complète et la plus justifiée possible. C'est exactement le comportement attendu d'un assistant conversationnel, et exactement celui à éviter pour un outil qui écrit dans un repo de production. Le problème vient de l'absence de cadrage entre l'outil et le repo : périmètre de fichiers à considérer, format de sortie attendu, budget de lignes ou de verbosité, obligation de citer précisément ce qui existe déjà avant d'écrire quelque chose de nouveau.

## Ce que j'ai changé depuis

Le réflexe logique aurait été de réduire drastiquement ce qui avait été écrit. Personnellement, j'ai décidé de faire autrement. Les audits m'ont servi à autre chose : scanner le code pour y repérer les code smells, et m'en servir pour délimiter précisément où se situaient les vrais problèmes. Les incohérences inter-services, les redondances, les endroits où le fil s'était perdu, plutôt que de deviner. Le volume de code écrit reste significativement le même : verbeux ou non, il reste utile s'il est bien utilisé. Le levier était de savoir précisément où regarder pour corriger ce qui ne collait pas, plutôt que d'empêcher l'agent d'écrire.

## Prochaine étapes

Le découpage du repo en unités plus petites et mieux délimitées. Ainsi que des garde-fous de production pour l'exécution et la documentation. Le problème qui se pose à son tour est une question d'architecture : comment analyser, critiquer et faire communiquer proprement les services, composants et documentation qui, une fois séparés, doivent quand même coordonner leurs décisions sans revenir au même monolithe qu'avant.
