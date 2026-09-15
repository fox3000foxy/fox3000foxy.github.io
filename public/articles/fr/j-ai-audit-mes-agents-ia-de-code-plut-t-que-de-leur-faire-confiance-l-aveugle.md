---
title: "J'ai audité mes agents IA de code plutôt que de leur faire confiance à l'aveugle"
description: "Comment deux audits menés pour rédiger le 4ème rapport technique de ma plateforme de trading m'ont révélé deux dérives distinctes : un agent qui oublie parce que le repo ne tient plus dans sa fenêtre de contexte, et un agent qui écrit dix fois plus de code que nécessaire parce que rien ne le pousse à la concision."
date: 2026-09-15
tags: ["ai", "llm-agents", "code-review", "context-window", "trading", "typescript"]
authors: ["docteur-turboss"]
lang: "fr"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "YG6jWL6u7Vt0uCNlXvrERlwNrdUN7ry9WVMA9h3si2Et0EjRH9eSYPlY7GvrdXLBsNp6OcAP9/2eMH+GmbyTDA=="
---
## Le symptôme avant le diagnostic

Chaque édition du rapport technique de la plateforme m'oblige à reparcourir l'architecture en entier : services, agents pipelines de données. C'est en préparant la 4ème édition que quelque chose a fini par me sauter aux yeux, alors que je le voyais grossir progressivement sans jamais m'arrêter dessus : le repo, qui tenait à l'origine en milliers, en comptait moins de 10ko en taille, atteint désormais 100Mo. Pas parce que la plateforme avait dix fois plus de fonctionnalités. Parce que je m'étais reposé sur des agents de type Claude Chat pour implémenter et corriger du code, sans jamais cadrer précisément ce que je leur demandais de faire ni sur quel périmètre.

Écrire le rapport m'a forcé de sortir du mode "ça avance" pour repasser en mode "qu'est-ce qui s'est réellement passe". J'ai fait deux audits distincts sur l'historique du repo. Les deux pointaient vers le même coupable, mais pour deux raisons complètement différentes de l'une de l'autre.

## Audit n°1 : la fenêtre de contexte qui ment

Le premier audit consistait à reprendre, service par service, les corrections faites par un agent IA sur plusieurs mois, et à vérifier si elles étaient cohérentes avec le reste du repo au moment où elles avaient été appliquées.

Le motif qui revenait sans cesse: l'agent corrigeait un problème localement, dans le fichier où le module qu'il avait sous les yeux, sans avoir vu (ou sans se souvenir de l'avoir vu) l'équivalent ailleurs dans le repo. Résultat: la même interface redéfinie légèrement différemment dans deux services, un renommage appliqué à moitié parce que la deuxième occurrence était hors de la fenêtre de contexte au moment du prompt, une convention de nommage respectée dans un module et ignorée dans le suivant. rien de spectaculaire pris isolément, mais cumulé sur des dizaines de sessions, ça produit exactement le genre de redondance et de code smells qui, plus tard, font perdre le fil à l'outil suivant qu'on lance dessus. Un cercle qui s'auto-alimente: plus le repo grossit et se fragmente, plus il devient difficile pour un agent de le tenir en tête dans son intégralité, plus les corrections deviennent locales et partielles, plus le repo grossit.

Le problème n'est pas que l'agent "ment" ou invente; il répond correctement à la question posée sur le contexte qui lui a été donnée. Le problème est que le périmètre de la question n'a, la plupart du temps, jamais été pensé par moi en amont. Je demandais "corrige cette typo, ce comportement, cette fonction, etc" sans me demander si ce bug avait des cousins ailleurs dans le repo que l'agent ne pouvait pas voir.

## Audit n°2 : quand la verbosité devient du code

Le deuxième audit était plus mécanique: faire tourner un `git log --numstat` sur toute l'historique, agréger lignes ajoutées et caractères ajoutés par commit et regarder la distribution

Les 30 plus gros commits en lignes ajoutées représentaient, à eux seuls, une part largement disproportionnée du volume total du repo. Et systématiquement les mêmes commits ressortaient aussi comme les plus gros en caractères ajoutés. Logique, sauf que le ratio caractères/lignes de ces commits-là étaient pas seulement "plus de lignes", c'était des lignes plus verbeuses: plus de commentaires explicatifs redondants avec le nom des fonctions, plus de blocs de gestion d'erreurs dupliqués au lieu d'être factorisés, plus de docstrings qui reformulaient trois fois la même chose.

C'est la conséquence directe d'un comportement qu'on connaît bien trop en interagissant avec un LLM en chat : sans consigne explicite de concision, il a tendance à "beaucoup parler", à justifier, commenter, reformuler. En conversation ça coûte des tokens de sortie. En génération de code, ce même réflexe se traduit en lignes qui restent dans le repo indéfiniment, commit après commit sans qu'on les relise vraiment tant que ça marche.

## Ce que les deux audtis, mis côte à côte, ont montré

Pour le premier rapport : la cohérence inter-services dû à une fenêtre de contexte trop petite pour tenir tout le repo ce qui entraine des corrections locales, redondances ou encore la divergences des conventions.

Pour le second : `git log --numstat` dû à la verbosité par défaut d'un LLM non cadrée, ce qui cause des lignes/caractères ajoutés disproportionnés, code peu factorisé

Le deux réunis pointe la redondance et le volume, sans me répéter, ça donne un repo trop gros pour qu'un futur agent le tienne en tête, ce qui encore aggrave le premier problème énoncé par le premier audit.

C'est cette dernière ligne qui m'a le plus inquiété en écrivant le rapport: les deux problèmes ne sont pas indépendants, ils se nourrissent l'un l'autre. Plus le code généré est verbeux, plus le repo grossit vite; plus il grossi, moins un agent peut le tenir en contexte; moins il peut le tenir en contexte, plus ses corrections sont locales et redondantes; plus elles sont redondantes, plus ça ajoute de volume. Une boucle de rétroaction négative, entièrement auto-infligée par une utilisation d'agent sans cadrage.

## Pourquoi ce n'est pas un bug ponctuel d'un outil précis

Rien dans ce diagnostic n'est spécifique à un modèle ou un produit en particulier. Un agent de type chat, quel qu'il soit, opère sur ce qu'on lui donne à voir dans sa fenêtre à l'instant T, et génère par défaut la réponse la plus complète et la plus justifiée possible. Ce qui est exactement le comportement qu'on veut d'un assistant conversationnel, et exactement le comportement qu'on ne veut pas d'un outil qui écrit dans un repo de production. Le problème n'est pas l'outil, c'est l'absence de cadrage entre l'outil et le repo: périmètre de fichiers à considérer, format de sortie attendu, budget de lignes ou de verbosité, obligation de citer précisément ce qui existe déjà avant d'écrire quelque chose de nouveau.

## Ce que j'ai changé depuis

Le réflexe que l'on pourrait avoir aurait été de réduire drastiquement ce qui avait été écrit. Personnellement, j'ai décidé de faire autrement. Les audits m'ont servi à autre chose: scanner le code pour y repérer les code smells, et m'en servir pour délimiter précisément où se situaient les vrais problèmes. Les incohérences inter-services, les redondances, les endroits où le fil s'était perdu, plutôt que de deviner. Le volume de code écrit reste significativement le même: verbeux ou non, il reste utile si bien utilisé. Le levier n'était pas de l'empêcher d'écrire mais de savoir précisément où regarder pour corriger ce qui ne collait pas.

## Prochaine étapes

Le découpage du repo en unités plus petites et mieux délimitées. Ainsi que des gardes fou de productions pour l'exécution/documentation. Le problème qui se pose à son tour est simplement une question d'architecture: comment analyse/critiquer et communiquer proprement les services/composants/documentation, qui, une fois séparés, doivent quand même coordonner leurs décisions dans revenir au même monolithe qu'avant.