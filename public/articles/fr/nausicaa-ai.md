## L'IA de Nausicaa : comment j'ai codé un cerveau mythologique

Y'a des projets qui commencent par "tiens si je faisais un jeu d'échecs avec des mythologies ?" et qui finissent par un truc avec une IA qui décide de ses propres hyper-paramètres tous les 5 tours.

Nausicaa c'est ça. Un jeu de plateau stratégique au tour par tour où tu construis ton deck de créatures mythologiques, tu gères ton mana, et tu déploies des unités sur un plateau façon échecs 10x8. Le tout avec une IA qui a ses propres petites crises de personnalité.

J'ai passé pas mal de temps à concevoir cette IA, et honnêtement le résultat est assez ingérable xD

## Le jeu en 2 minutes

Avant de parler du cerveau, faut comprendre le corps :

- **Plateau** : 10x8 cases, zone de déploiement de 2 rangées par joueur
- **Mana** : commence à 1, +1 par tour, max 6. Tu dépenses du mana pour invoquer, attaquer et utiliser des capacités
- **But** : buter l'Oracle adverse

12 unités avec des coûts et des patterns de mouvement différents :

| Unité | Coût | Mouvement | Santé |
| --- | --- | --- | --- |
| **Oracle** | 0 | Roi (8 directions) | 1 |
| **Gobelin** | 1 | Avant 3 cases | 1 |
| **Harpie** | 1 | Roi (8 directions) | 1 |
| **Naïade** | 1 | Diagonale | 1 |
| **Griffin** | 2 | Hop 2 cases | 2 |
| **Sirène** | 2 | Latéral | 1 |
| **Centaure** | 2 | Cavalier (L) | 2 |
| **Archer** | 3 | Latéral | 1 |
| **Phénix** | 3 | Diagonale (cases sombres) | 1 |
| **Métamorphe** | 4 | Échange de place | 1 |
| **Voyant** | 4 | Aucun (génère du mana) | 1 |
| **Titan** | 6 | Limité (attaque zone) | 3 |

Chaque unité a son propre pattern d'attaque aussi. La Sirène tape dans les 4 diagonales, l'Archer tape à distance sur 3 cases, le Titan détruit tout autour de lui en invocation. Bref, un jeu d'échecs avec des mythologies et une couche de deckbuilding xD

## Le cerveau : une IA à coefficients

L'IA de Nausicaa suit un principe assez simple sur le papier : **chaque unité ennemie a un coefficient d'attractivité**. Plus une unité est dangereuse, plus elle attire l'attention de l'IA.

```javascript
const UNITS_ATTRACTIVENESS = {
    "oracle": 100,
    "titan": 95,
    "shapeshifter": 90,
    "phoenix": 80,
    "siren": 70,
    "archer": 70,
    "seer": 70,
    "griffin": 60,
    "centaur": 60,
    "harpy": 50,
    "naiad": 30,
    "gobelin": 20
};
```

L'Oracle est à 100 -- logique, c'est la condition de victoire. Le Titan est à 95 parce qu'il one-shot tout ce qui est à côté de lui à l'invocation. Le Gobelin est à 20, c'est un fantassin de base, on s'en fout un peu.

### Le calcul du coefficient d'attaque

Pour chaque unité ennemie, l'IA calcule :

```
coefficient_attaque = attractivité × importance_attractivite / (distance × importance_distance)
```

En vrai : plus l'unité est dangereuse et proche, plus l'IA veut lui mettre des pains.

```javascript
calculateAttackCoefficient(x1, y1, x2, y2) {
    const distance = this.calculateEuclideanDistance(x1, y1, x2, y2);
    if (distance === 0) return Infinity;
    return (UNITS_ATTRACTIVENESS[unit.type] * COEFFICIENTS_IMPORTANCE["attractiveness"]) / distance;
}
```

### Les hyper-paramètres qui changent tous les 5 tours

Là où ça devient marrant, c'est que les coefficients d'importance **changent aléatoirement tous les 5 tours**.

```javascript
if (this.turnCount % 5 === 0) {
    const distanceCoefficient = parseInt(Math.random() * 100);
    const attractivenessCoefficient = parseInt(Math.random() * 100);
    this.regulateImportanceCoefficients({
        distance: distanceCoefficient,
        attractiveness: attractivenessCoefficient
    });
}
```

Un coup l'IA va hyper agressive (attractivité à 95, distance à 5), elle va traverser le plateau pour buter ton Oracle. Le tour suivant, elle va prioriser la distance et se positionner pour prendre le contrôle du terrain.

C'est inspiré du système des fantômes dans Pac-Man -- chaque fantôme a sa propre personnalité (Blinky chasse, Pinky embusque, Inky fait n'importe quoi). Ici, l'IA change sa "personnalité" toutes les phases.

Résultat : **l'IA n'est jamais complètement prévisible**. Un humain peut la lire sur quelques tours, mais pas sur une partie complète. Le CPU ne fait pas deux fois le même match.

### L'Oracle prend la fuite

L'Oracle ennemi a un comportement spécial : il fuit. Littéralement.

```javascript
// L'oracle ne peut pas attaquer, il doit se déplacer
// Inverser la direction du mouvement pour s'éloigner de la cible
const awayFromTarget = {
    row: Math.max(0, Math.min(7, botUnitElement.row + (botUnitElement.row - targetUnitElement.row))),
    col: Math.max(0, Math.min(9, botUnitElement.col + (botUnitElement.col - targetUnitElement.col)))
};
```

L'IA calcule la direction opposée à la menace et déplace l'Oracle dans cette direction. Si y'a un mur, elle cherche la case libre la plus proche de cette direction de fuite.

Résultat : tu passes 3 tours à approcher l'Oracle, et paf, il s'est barré en courant comme une fillette xD

### La boucle de décision complète

Voilà comment l'IA décide de ses actions :

1. **Si y'a plus d'Oracle** (il a été tué), en placer un nouveau
2. **Calculer le coefficient d'attaque** pour chaque unité ennemie depuis chaque unité alliée
3. **Choisir la meilleure paire** (attaquant → cible) avec le meilleur coefficient
4. **Si l'unité peut attaquer la cible** depuis sa position → attaquer
5. **Si l'IA a moins de 4 unités** → invoquer une nouvelle unité depuis la main (la moins chère disponible)
6. **Sinon, se déplacer vers la cible** avec la case de mouvement la plus proche de l'ennemi
7. **Si assez de mana** (> 2), faire un dash (double mouvement) pour se rapprocher encore plus
8. **Si l'unité est l'Oracle** → fuir dans la direction opposée

```javascript
async makeAction(dash=false) {
    // ... tout ça en séquence
    // Le CPU dash si il a assez de mana
    if(botPlayer.mana > 2) {
        this.makeAction(true); // dash récursif
    }
}
```

### Le système de distance

L'IA utilise la distance euclidienne pour ses calculs :

```javascript
calculateEuclideanDistance(x1, y1, x2, y2) {
    const deltaX = Math.pow(x1 - x2, 2);
    const deltaY = Math.pow(y1 - y2, 2);
    return Math.sqrt(deltaX + deltaY) * COEFFICIENTS_IMPORTANCE["distance"];
}
```

Pourquoi euclidienne plutôt que Manhattan ? Parce que les unités ont des patterns de mouvement variés (certaines bougent en L comme le cavalier, d'autres en diagonale). La distance à vol d'oiseau est une meilleure approximation du "danger potentiel" que la distance en cases.

## Ce qui rend l'IA intéressante

### 1. Pas de minimax

J'aurais pu coder un minimax avec alpha-beta pruning comme tout le monde. Mais pour un jeu avec autant de possibilités (12 types d'unités, des patterns de mouvement différents, des capacités spéciales), l'arbre de jeu explose tellement vite que ça deviendrait injouable.

L'approche heuristique (coefficients + distance) donne une IA qui fait des choix intelligents sans avoir besoin d'explorer 10 millions d'états par tour.

### 2. La non-prédictibilité

Le changement aléatoire des hyper-paramètres tous les 5 tours, c'est LA feature qui rend l'IA intéressante à jouer. Un humain qui joue contre une IA déterministe va vite trouver les patterns et l'exploiter. Là, impossible.

En tournoi, ça veut dire que chaque partie est différente. Le joueur doit s'adapter en temps réel, pas juste apprendre une séquence de moves.

### 3. Le système de priorité des unités

L'ordre d'attractivité des unités a été pensé pour créer des dilemmes intéressants :

- Le **Voyant** (70) génère du mana. Si tu le laisses vivre, l'adversaire a plus de ressources. Mais le **Titan** (95) est encore plus dangereux.
- Le **Métamorphe** (90) peut échanger sa place avec n'importe quelle unité. Il peut littéralement voler ton Oracle et le ramener dans son camp.
- L'**Harpie** (50) a une attaque explosive qui la tue aussi. Pas très prioritaire... jusqu'à ce qu'elle soit à côté de 3 de tes unités.

L'IA évalue le danger global en fonction des positions, pas juste de la valeur brute des unités.

### 4. La simulation

Le fichier CPU contient une fonction `activateSimulation()` qui place des unités sur un plateau prédéfini. Utile pour tester des scénarios spécifiques sans refaire une partie complète :

```javascript
activateSimulation() {
    // Place des unités spécifiques sur le plateau
    // Utile pour debugger le comportement de l'IA
    this.game.board = simulation.board;
    this.game.players = simulation.players;
}
```

## Ce que j'aurais pu améliorer

Si je devais continuer à bosser sur cette IA, y'a quelques trucs :

- **Prédiction des moves adverses** : l'IA réagit à l'état actuel, elle ne prédit pas ce que le joueur va faire
- **Gestion du deck** : l'IA pioche des cartes et les joue, mais elle ne planifie pas sa main sur plusieurs tours
- **Utilisation des capacités spéciales** : le Métamorphe et le Centaure ont des capacités que l'IA sous-exploite
- **Apprentissage par renforcement** : faire jouer l'IA contre elle-même pour ajuster les coefficients automatiquement

Mais pour un jeu de navigateur, c'est déjà pas mal. Les potes arrivent à perdre contre, donc l'IA fait le taf xD

## Tester par toi-même

Le jeu est dispo sur [nausicaa-game.github.io](https://nausicaa-game.github.io/). Tu cliques sur "JOUER", tu mets le CPU mode sur ON, et tu vois ce que l'IA fait.

Petit conseil : laisse l'IA jouer contre elle-même une fois. Tu vas la voir faire des trucs chelous quand ses coefficients changent -- une phase agressive, puis soudainement elle recule toutes ses unités.

Le code source complet est sur [GitHub](https://github.com/nausicaa-game/nausicaa-game.github.io), dans `js/cpu.js` si tu veux lire l'IA en détail.

**Les 3 trucs à retenir :**

1. **IA à coefficients heuristiques** -- pas de minimax, chaque unité a une attractivité qui guide les décisions
2. **Hyper-paramètres qui changent tous les 5 tours** -- l'IA alterne entre agressivité et contrôle de terrain, façon Pac-Man
3. **L'Oracle fuit** -- l'unité royale ne combat pas, elle calcule la direction opposée à la menace et se barre

Si t'as des idées pour rendre l'IA encore plus vicieuse, hésite pas à ouvrir une issue ou une PR sur le repo. J'ai déjà des idées pour une version qui apprend de ses défaites, mais ça, c'est pour un prochain article xD
