---
title: "Luna Protocol : pourquoi j'ai fine-tuné un modèle de 1,5 milliard de paramètres sur 50k échantillons Discord, et pourquoi le few-shot priming a tout changé"
description: "Un modèle plus petit entraîné sur moins de données peut surpasser un modèle plus gros -- à condition de savoir bien l'amorcer. Voici pourquoi Luna Protocol est passé d'un Hermes 3B à un fine-tune Qwen 1,5B, et pourquoi le few-shot priming est devenu le vrai facteur de progrès."
date: 2026-07-17
authors:
  - fox3000foxy
tags:
  - discord
  - llm
  - fine-tuning
  - few-shot-learning
  - qwen
  - unsloth
  - open-source
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+nMe+wl5gkHk05/0EQ000PcDswTNZmZKqNtITRNVV+GGoarYNBDZxIYk2KbjUkdkmuqUhuAXmuXCG3GT7+1U6Q=="
author_sig: "kF7aLK4N8wL6lYoPkymVDx3PNLqiVRT5q61bVVsyMgHQrq444Gjf6JVIYkqDB4QCah2RZTBOZPy6yJVV1lubFA=="
---

# Luna Protocol : pourquoi j'ai fine-tuné un modèle de 1,5 milliard de paramètres sur 50k échantillons Discord, et pourquoi le few-shot priming a tout changé

Dans le [premier article](/articles/en/luna-protocol-discord-bot), j'ai construit un bot Discord qui simule un être humain -- sommeil, fautes de frappe, hésitations, oublis, messages spontanés. Le système comportemental tenait la route. Le LLM derrière tout ça était un modèle Hermes de 3 milliards de paramètres, quantifié en Q8_0, consommant 3 Go de VRAM.

Ça fonctionnait. Mais c'était surdimensionné.

Un bot Discord n'a pas besoin d'un modèle de 3 milliards de paramètres pour dire « nm just chillin, u ». Ce dont il a besoin, c'est de **cohérence stylistique** -- la capacité à conserver un ton conversationnel précis, message après message, sans dériver vers un mode « assistant corporate ». Et il s'avère qu'un modèle plus petit, entraîné sur moins de données et amorcé avec quelques exemples, y parvient mieux qu'un modèle plus gros qui force le passage via un simple prompt système.

Cet article porte sur les modèles officiels de Luna Protocol : pourquoi ils existent, pourquoi 1,5B plutôt que 3B, pourquoi 50k échantillons d'entraînement plutôt que 7,3M, et pourquoi le few-shot priming est passé du statut de « bonus sympa » à celui de cœur de toute l'approche.

---

## Le problème avec le modèle 3B

La configuration d'origine utilisait `Discord-Micae-Hermes-3-3B.Q8_0.gguf` -- un modèle de 3 milliards de paramètres fine-tuné sur des données Discord. Il produisait de bonnes réponses, mais :

| Métrique | Hermes-3-3B Q8_0 | Objectif |
|--------|-------------------|--------|
| Utilisation VRAM | ~3 Go | < 1 Go |
| Génération de tokens | ~30 tok/s | ~60+ tok/s |
| Taille du fichier modèle | ~3,2 Go | < 1 Go |
| Temps de démarrage à froid | ~8s | ~3s |

Pour un bot tournant 24/7 sur un serveur modeste, 3 Go de VRAM, c'est beaucoup. Et la vitesse de génération -- correcte pour des messages occasionnels -- semblait poussive lors de réponses en rafale ou avec plusieurs canaux actifs.

La question était : peut-on obtenir le même style Discord-Dialogues avec deux fois moins de paramètres ?

---

## La décision de fine-tuning : pourquoi 50k, pas 7,3M

Le jeu de données [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) contient **7,3M d'échanges** et **17M de tours de parole**. C'est un corpus massif de vraies conversations Discord. L'approche évidente aurait été d'entraîner sur la totalité du jeu de données.

J'ai fait l'inverse. J'ai entraîné sur **50 000 échantillons** -- moins de 1 % des données disponibles.

Voici pourquoi : **la taille du jeu d'entraînement affecte directement le degré de surapprentissage du modèle vis-à-vis de sa distribution d'entraînement**.

Un modèle entraîné sur 7,3M d'exemples apprend une distribution statistique très spécifique des conversations. Il devient excellent pour reproduire cette distribution, mais il devient aussi **rigide** -- il a moins de marge pour s'adapter à de nouveaux motifs fournis au moment de l'inférence.

Un modèle entraîné sur 50k exemples apprend le ton et le registre général des conversations Discord (informel, court, abréviations, minuscules), mais il conserve assez de flexibilité pour être **piloté par des exemples en contexte**. Les exemples few-shot ne luttent pas contre une distribution massive déjà apprise -- ils viennent compléter une distribution plus légère.

C'est l'intuition centrale : **des données d'entraînement limitées rendent le few-shot priming plus efficace**.

---

## Le modèle : détails techniques

Le modèle Luna Protocol est un **fine-tune QLoRA** de [Qwen2.5-1.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct) :

| Paramètre | Valeur |
|-----------|-------|
| Modèle de base | `unsloth/Qwen2.5-1.5B-Instruct-bnb-4bit` |
| Méthode | QLoRA (4-bit) |
| Rang LoRA | `r=16`, `lora_alpha=16` |
| Modules ciblés | `q/k/v/o_proj`, `gate/up/down_proj` |
| Paramètres entraînables | 18 464 768 / 1 562 179 072 (1,18 %) |
| Données d'entraînement | ~50 000 exemples (sous-ensemble de Discord-Dialogues) |
| Filtre | 8-512 tokens par échantillon |
| Époques | 2-3 |
| Matériel | Kaggle T4 |
| Framework | [Unsloth](https://github.com/unslothai/unsloth) |

Le jeu de données est un fork prétraité de Discord-Dialogues, filtré pour ne conserver que des tours `user`/`assistant` propres -- pas de messages système, pas de métadonnées, pas de commandes de bot. C'est important pour la suite.

### Quantifications disponibles

| Fichier | Quantification | Taille | Remarques |
|------|-------------|------|-------|
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q2_K.gguf` | Q2_K | 676 Mo | Nettement dégradé -- déconseillé |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf` | Q4_K_M | 986 Mo | Bon compromis taille/qualité (recommandé) |
| `Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q8_0.gguf` | Q8_0 | 1,65 Go | Meilleure fidélité stylistique |

Le modèle recommandé est **Q4_K_M** -- moins d'1 Go, rapide, et il préserve bien le style conversationnel. Le Q2_K se dégrade trop pour un modèle de cette taille. Le Q8_0 offre la meilleure qualité mais consomme 68 % de mémoire en plus.

---

## La percée du few-shot priming

Voici la partie qui a tout changé.

La fiche du modèle sur HuggingFace comporte un avertissement :

> Avec un prompt nu et sans amorçage, ce modèle a tendance à retomber dans le ton par défaut « assistant » de Qwen. Un court amorçage few-shot fait une grande différence.

Ce n'est pas un bug -- c'est une conséquence directe de la façon dont les données d'entraînement ont été structurées.

### Pourquoi les prompts système seuls ne fonctionnent pas

Les données d'entraînement Discord-Dialogues ne contiennent que des tours `user`/`assistant`. Il n'y a **aucun exemple de rôle système** dans le jeu d'entraînement. Le modèle n'a jamais été entraîné à suivre des prompts système comme directives de style.

Quand on lui donne un prompt système du type « Tu t'appelles Luna, parle de façon décontractée », il entend l'instruction mais n'a pas de motif appris solide pour la traduire en sortie. Il retombe alors sur le comportement par défaut de Qwen : serviable, structuré, légèrement formel.

### Pourquoi les exemples few-shot fonctionnent

Quand on injecte des exemples de conversation dans le même format ChatML que celui utilisé à l'entraînement (avec la structure de tours `user`/`assistant`), quelque chose se déclenche. Le modèle reconnaît le motif issu de son entraînement et aligne sa sortie en conséquence.

Voici à quoi ressemble un amorçage few-shot en pratique :

```yaml
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

Ces exemples sont injectés après le prompt système et avant la vraie conversation. Le modèle les perçoit comme faisant partie de l'historique de conversation, pas comme des instructions. C'est une distinction essentielle -- on ne lui *dit* pas d'être décontracté, on lui *montre* à quoi ça ressemble.

### Avant / après

Sans amorçage few-shot (prompt système nu) :

```
User: yo whats good
Bot: Hello! I am doing well, thank you for asking. How can I assist you today?
```

Avec amorçage few-shot (3 exemples) :

```
User: yo whats good
Bot: nm just chillin, u
```

La différence est flagrante. Le modèle ne produit pas juste des mots différents -- il adopte tout le registre : minuscules, abréviations, ton décontracté, réponses courtes. Il calque le style des exemples, pas celui des données d'entraînement de Qwen.

---

## Mémoire et vitesse : les chiffres concrets

Le passage de Hermes-3-3B à Luna-Protocol-1.5B apporte des gains mesurables :

| Métrique | Hermes-3-3B Q8_0 | Luna-Protocol Q4_K_M | Amélioration |
|--------|-------------------|----------------------|-------------|
| Utilisation VRAM | ~3 Go | ~986 Mo | **67 % de moins** |
| Taille du fichier modèle | ~3,2 Go | ~986 Mo | **69 % plus petit** |
| Génération de tokens | ~30 tok/s | ~60+ tok/s | **2x plus rapide** |
| Démarrage à froid | ~8s | ~3s | **62 % plus rapide** |
| Fenêtre de contexte | 8192 | 8192 | Identique |

### Pourquoi le gain de vitesse est réel

Les modèles plus petits ne sont pas juste « un peu moins lents » -- ils sont fondamentalement plus rapides en inférence. Avec 1,5B de paramètres au lieu de 3B :

- **Moins de multiplications matricielles** par token : les couches d'attention, les couches FFN et la projection de sortie évoluent toutes linéairement avec le nombre de paramètres
- **Meilleure utilisation du cache** : le modèle plus petit fait tenir davantage de ses poids dans le cache L2/L3
- **Moins de pression sur la bande passante mémoire** : moins d'octets à lire depuis la VRAM par token

Sur une configuration modeste, CPU seul (2 cœurs, pas de GPU), le modèle 1,5B génère des tokens à environ **2 fois la vitesse** du modèle 3B. C'est la différence entre « ça sent le bot » et « on dirait une vraie personne en train de taper ».

### Le cache de prompt amplifie l'avantage

Luna Protocol utilise `llama-server` avec le cache de prompt activé (`--cache-reuse 256`). Cela signifie que :

1. Le premier message d'une session paie le coût complet du traitement du prompt (prompt système + exemples few-shot + message utilisateur)
2. Les messages suivants ne traitent que les *nouveaux* tokens -- le préfixe mis en cache est réutilisé
3. Avec 5 exemples few-shot (~50-150 tokens), le surcoût devient négligeable après la première requête

Les exemples few-shot deviennent en pratique « gratuits » après le premier message d'une session. Le modèle bénéficie d'un guidage de style à coût marginal nul.

---

## L'implémentation : comment ça fonctionne en code

Le système few-shot de Luna Protocol est propre et minimal. Trois fichiers gèrent tout.

### 1. Configuration (`config.yml`)

```yaml
few_shot_enabled: true
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
  - user: "whats up"
    assistant: "yooo not much, what about you"
  - user: "how was your day"
    assistant: "it was alright, nothing crazy happened lol"
```

La configuration est rechargeable à chaud. On modifie les exemples, on enregistre, et le bot adopte immédiatement le nouveau style -- sans redémarrage.

### 2. Formatage et injection (`src/core/few-shot.ts`)

La fonction `formatFewShotExamples()` convertit les exemples YAML en objets de message ChatML :

```typescript
export function formatFewShotExamples(
  examples: FewShotExample[],
  username = "user"
): Array<{ role: "user" | "assistant"; content: string }> {
  const messages = [];
  for (const example of examples) {
    messages.push({ role: "user", content: `${username}: ${example.user}` });
    messages.push({ role: "assistant", content: example.assistant });
  }
  return messages;
}
```

La fonction `injectFewShotIntoConversation()` les place juste après le prompt système :

```typescript
export function injectFewShotIntoConversation(
  messages: Message[],
  fewShotMessages: Message[]
): Message[] {
  const systemMessage = messages[0];
  const userMessages = messages.slice(1);
  return [systemMessage, ...fewShotMessages, ...userMessages];
}
```

### 3. Intégration (`src/core/llm-client.ts`)

Avant chaque appel au LLM, les exemples few-shot sont injectés s'ils sont activés :

```typescript
let finalMessages = messages;
if (FEW_SHOT_ENABLED && FEW_SHOT_EXAMPLES.length > 0) {
  const fewShotMessages = formatFewShotExamples(FEW_SHOT_EXAMPLES);
  finalMessages = injectFewShotIntoConversation(messages, fewShotMessages);
}
```

Le modèle reçoit : `[prompt_système] + [exemples_few_shot] + [historique_de_conversation]`

---

## Conserver le style Discord-Dialogues

Le jeu de données Discord-Dialogues d'origine a une signature conversationnelle très spécifique :

- **Messages courts** : 32,8 tokens en moyenne par tour
- **Registre informel** : abréviations, minuscules, absence de ponctuation
- **Échanges rapides** : plusieurs échanges courts plutôt que de longs monologues
- **Imperfections naturelles** : fautes de frappe, « lol », « fr », « ngl », « tbh »

Le modèle Luna Protocol préserve ce style grâce à deux mécanismes :

### 1. Le fine-tuning déplace la distribution de base

Les 50k échantillons d'entraînement enseignent au modèle l'**empreinte statistique** des conversations Discord. Il apprend que les réponses sont typiquement courtes, en minuscules et informelles. Cela éloigne la sortie par défaut du modèle du mode « assistant serviable » de Qwen.

### 2. Le few-shot priming verrouille le résultat

Les exemples few-shot renforcent exactement les motifs appris pendant le fine-tuning. Ils agissent comme un **ancrage stylistique** -- même si le modèle dérive légèrement vers un ton plus formel au cours d'une longue conversation, les exemples présents dans le contexte le ramènent en arrière.

La combinaison est plus puissante que chaque mécanisme pris isolément :
- Fine-tuning sans few-shot : le modèle est *globalement* décontracté mais inconsistant
- Few-shot sans fine-tuning : le modèle essaie de suivre les exemples mais retombe sans cesse en mode assistant
- Fine-tuning + few-shot : le modèle reste **constamment** dans le personnage

---

## La philosophie : modèle plus petit, prompting plus malin

La sagesse conventionnelle en déploiement de LLM dit « plus gros, c'est mieux ». Plus de paramètres, plus de données d'entraînement, plus de VRAM. Luna Protocol prend le chemin inverse :

- **1,5B au lieu de 3B** : moitié moins de paramètres, moitié moins de mémoire, deux fois plus rapide
- **50k échantillons au lieu de 7,3M** : moins de données d'entraînement, plus de flexibilité pour l'apprentissage en contexte
- **Few-shot priming au lieu de prompts système** : montrer au modèle ce qu'on veut, pas juste le lui dire

Ce n'est pas qu'une simple optimisation technique -- c'est un choix de conception. Un bot Discord n'a pas besoin d'être un assistant généraliste. Il doit dire « nm just chillin, u » de façon cohérente, rapide, et sans engloutir tout le budget VRAM du serveur.

Résultat : un bot qui tourne sur un VPS à 5 $/mois, génère des tokens assez vite pour donner l'impression d'une frappe en temps réel, et maintient une personnalité cohérente grâce à une combinaison de fine-tuning et de few-shot priming qui vaut plus que la somme de ses parties.

---

## Mise en place

### Télécharger le modèle

```bash
npm run download-model
# Télécharge Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf
```

Ou manuellement depuis [HuggingFace](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues).

### Configurer

```yaml
# config.yml
llama_model_path: "./models/Luna-Protocol-1.5B-Fine-Tuned-Qwen2.5.Q4_K_M.gguf"
few_shot_enabled: true
few_shot_examples:
  - user: "yo whats good"
    assistant: "nm just chillin, u"
  - user: "bored af"
    assistant: "lol same energy fr"
  - user: "hey how are you"
    assistant: "im doing pretty good tbh, just vibing"
```

### Lancer

```bash
npm run dev                    # dev (rechargement à chaud)
npm run build && npm start     # production
./start.sh                     # PM2 (production avec llama-server)
```

---

## Conclusion

Les modèles Luna Protocol prouvent que pour une IA conversationnelle axée sur le style, **moins, c'est mieux**. Un modèle de 1,5B entraîné sur 50k échantillons soigneusement choisis, amorcé avec quelques exemples, surpasse un modèle de 3B entraîné sur des millions d'exemples -- pour une fraction du coût en mémoire et une vitesse de génération deux fois supérieure.

Le few-shot priming n'est pas qu'un simple plus pour les petits modèles. C'est le mécanisme qui les rend viables pour des applications conversationnelles en temps réel. Les exemples ne se contentent pas d'« aider » -- ils changent fondamentalement le comportement du modèle, en calquant exactement le format sur lequel il a été entraîné.

Le code est open source, le modèle est sur HuggingFace, et le jeu de données est public. Si vous voulez construire un bot conversationnel qui donne l'impression d'être humain, la recette est : petit modèle, fine-tuning limité, amorçage few-shot solide.

| Ressource | Lien |
|----------|------|
| Dépôt GitHub | [fox3000foxy/luna-protocol-project](https://github.com/fox3000foxy/luna-protocol-project) |
| Modèle (HuggingFace) | [fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues](https://huggingface.co/fox3000foxy/Luna-Protocol-1.5B-Discord-Dialogues) |
| Jeu de données | [Discord-Dialogues](https://huggingface.co/datasets/mookiezi/Discord-Dialogues) |
| Premier article | [Luna Protocol : j'ai créé un bot Discord autonome](/articles/en/luna-protocol-discord-bot) |