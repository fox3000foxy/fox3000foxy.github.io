## My dumb AI for Nausicaa

You know those projects that start with "hey what if I made a chess game with mythologies?" and end with a thing where the AI decides its own hyper-parameters every 5 turns?

Nausicaa is exactly that. A turn-based board game where you build your deck of mythological creatures, manage your mana, deploy units on a 10x8 grid. And there's an AI that has identity crises.

I spent a fair bit of time on this AI, and the result is pretty unmanageable xD

## The game itself

Before talking about the brain, you gotta understand the body:

- 10x8 board, 2-row deployment zone per player
- Mana starts at 1, +1 per turn, max 6. You spend it to summon, attack, use abilities
- Goal: kill the enemy Oracle

12 units, different costs and movement patterns:

| Unit | Cost | Movement | HP |
| --- | --- | --- | --- |
| Oracle | 0 | King (8 directions) | 1 |
| Goblin | 1 | Forward 3 squares | 1 |
| Harpy | 1 | King (8 directions) | 1 |
| Naiad | 1 | Diagonal | 1 |
| Griffin | 2 | Jump 2 squares | 2 |
| Siren | 2 | Lateral | 1 |
| Centaur | 2 | Knight (L-shape) | 2 |
| Archer | 3 | Lateral | 1 |
| Phoenix | 3 | Diagonal (dark squares) | 1 |
| Shapeshifter | 4 | Swap places | 1 |
| Seer | 4 | None (generates mana) | 1 |
| Titan | 6 | Limited (area attack) | 3 |

Each unit has its own attack pattern. The Siren hits in 4 diagonals, the Archer shoots from 3 squares away, the Titan destroys everything around it on summon. Basically chess with mythos and deckbuilding xD

## How I made the CPU think

The basic idea is stupidly simple: **every enemy unit has an attractiveness coefficient**. The more dangerous it is, the more the AI wants to deal with it.

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

Oracle at 100 -- makes sense, it's the win condition. Titan at 95 because it OSes everything next to it on summon. Goblin at 20, it's a grunt, nobody cares.

Then for each pair of units (one ally, one enemy), I calculate:

```
interest = attractiveness × coeff_attract / (distance × coeff_dist)
```

Basically: the more dangerous and closer you are, the more the AI wants to wreck you.

```javascript
calculateAttackCoefficient(x1, y1, x2, y2) {
    const distance = this.calculateEuclideanDistance(x1, y1, x2, y2);
    if (distance === 0) return Infinity;
    return (UNITS_ATTRACTIVENESS[unit.type] * COEFFICIENTS_IMPORTANCE["attractiveness"]) / distance;
}
```

### The coefficient shuffle

Here's where it gets fun -- the importance coefficients **randomly change every 5 turns**.

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

One turn the AI goes hyper aggro (attract at 95, distance at 5), crossing everything to kill your Oracle. Next turn it prioritizes distance and repositions.

This is stolen from Pac-Man ghosts -- Blinky chases, Pinky ambushes. Here the AI changes "personality" every phase.

**Result: you can't predict the AI over a full game.** The CPU never plays the same match twice.

### The Oracle is a coward

The enemy Oracle runs away. Literally.

```javascript
const awayFromTarget = {
    row: Math.max(0, Math.min(7, botUnitElement.row + (botUnitElement.row - targetUnitElement.row))),
    col: Math.max(0, Math.min(9, botUnitElement.col + (botUnitElement.col - targetUnitElement.col)))
};
```

It calculates the direction opposite to the threat and bolts. If there's a wall, it finds the nearest free square in that direction.

You spend 3 turns getting close to the Oracle, and bam it's run off like a scaredy cat xD

### The decision loop

Here's how the AI decides:

1. If I lost my Oracle (dead), place a new one
2. Calculate the coefficient for every ally → enemy pair
3. Pick the best pair
4. If the unit can attack the target from its position → attack
5. If I have less than 4 units → summon the cheapest available from hand
6. Otherwise, move toward the target (movement square closest to the enemy)
7. If enough mana (> 2), dash (double move) to get even closer
8. If the unit is the Oracle → flee

```javascript
async makeAction(dash=false) {
    // all of this in sequence
    // the CPU dashes if it has enough mana
    if(botPlayer.mana > 2) {
        this.makeAction(true);
    }
}
```

### Why Euclidean distance

I use Euclidean distance:

```javascript
calculateEuclideanDistance(x1, y1, x2, y2) {
    const deltaX = Math.pow(x1 - x2, 2);
    const deltaY = Math.pow(y1 - y2, 2);
    return Math.sqrt(deltaX + deltaY) * COEFFICIENTS_IMPORTANCE["distance"];
}
```

Why not Manhattan? Because units have varied movement patterns (L-shape like the knight, diagonal, etc). Bird's-eye distance is a better approximation of danger.

## Why not minimax

I could've coded a classic minimax. But with 12 unit types, different movement patterns, special abilities... the game tree explodes so fast it becomes unplayable. The heuristic approach makes smart choices without exploring 10 million states.

## What's cool

The attractiveness system creates funny dilemmas:

- The Seer (70) generates mana. If you leave it alive, the opponent has more resources. But the Titan (95) is even more dangerous.
- The Shapeshifter (90) can swap places with any unit. It can steal your Oracle.
- The Harpy (50) has an explosive attack that also kills it. Not a priority... until it's next to 3 of your units.

The AI evaluates overall danger based on positions, not just raw stats.

There's also a `activateSimulation()` function to test scenarios without replaying a full game:

```javascript
activateSimulation() {
    // Place specific units on the board
    // Useful for debugging the AI
    this.game.board = simulation.board;
    this.game.players = simulation.players;
}
```

## What's missing

If I had more time:

- The AI reacts to the current state, it doesn't predict what the player will do
- It doesn't plan its hand over multiple turns
- The Shapeshifter and Centaur have abilities it under-uses
- Reinforcement learning: make it play against itself to tune the coefficients

But for a browser game it does the job. Some friends manage to lose against it, so it's good enough xD

## Try it

Live at [nausicaa-game.github.io](https://nausicaa-game.github.io/). Click "JOUER", CPU mode ON, and watch the AI do its thing.

Tip: let the AI play against itself. You'll see aggressive phases, then poof it backs off completely.

The code is on [GitHub](https://github.com/nausicaa-game/nausicaa-game.github.io) in `js/cpu.js`.

**3 takeaways:**

1. **Heuristic coefficients** -- no minimax, each unit has an attractiveness score
2. **Coefficients that change every 5 turns** -- the AI alternates aggro and control, Pac-Man style
3. **The Oracle runs away** -- it calculates the direction opposite to the threat and books it

If you have ideas to make the AI even more vicious, open an issue. I have plans for a version that learns from its losses, but that'll be for another article xD
