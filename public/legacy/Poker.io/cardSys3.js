let myCards = [];
let hisCards = [];
let tableCards = [];
let myHand = null;
let hisHand = null;
function dealCards(e) {
    var deck = [
        'A/H', '2/H', '3/H', '4/H', '5/H', '6/H', '7/H', '8/H', '9/H', '10/H', 'J/H', 'Q/H', 'K/H', // Hearts
        'A/D', '2/D', '3/D', '4/D', '5/D', '6/D', '7/D', '8/D', '9/D', '10/D', 'J/D', 'Q/D', 'K/D', // Diamonds
        'A/S', '2/S', '3/S', '4/S', '5/S', '6/S', '7/S', '8/S', '9/S', '10/S', 'J/S', 'Q/S', 'K/S', // Spades
        'A/C', '2/C', '3/C', '4/C', '5/C', '6/C', '7/C', '8/C', '9/C', '10/C', 'J/C', 'Q/C', 'K/C'  // Clubs
    ];
    let currentDeck = deck;
    var cards = [];
    var table = [];
    var his = [];
    // First animation & button change
    document.getElementById('main').style.animationName = 'expand';
    document.querySelector('header').style.display = 'none';
    e.disabled = true;
    setTimeout(() => {
        e.outerHTML = `
        <button class="deal" onclick="showCards(this)">
            Show Cards
        </button>
        `;
    }, 9000);
    //deal me cards
    for (let i = 0; i < 2; i++) {
        let rand = Math.floor(Math.random()*currentDeck.length);
        if (0 < rand < currentDeck.length) {
            var card = currentDeck[rand];
            currentDeck.splice(rand,1);
            myCards.push(card);
        }
    }
    //deal table cards
    for (let i = 0; i < 5; i++) {
        let rand = Math.floor(Math.random()*currentDeck.length);
        if (0 < rand < currentDeck.length) {
            var card = currentDeck[rand];
            currentDeck.splice(rand,1);
            tableCards.push(card);
        }
    }
    //deal him cards
    for (let i = 0; i < 2; i++) {
        let rand = Math.floor(Math.random()*currentDeck.length);
        if (0 < rand < currentDeck.length) {
            var card = currentDeck[rand];
            currentDeck.splice(rand,1);
            hisCards.push(card);
        }
    }
    // Put the cards on the document
    let myElement = document.querySelectorAll('.my');
    let tableElement = document.querySelectorAll('.tab');
    let hisElement = document.querySelectorAll('.his');
    setTimeout(() => {
        for (let i = 0; i < 2; i++) {
            let num = myCards[i].split('/')[0];
            let rank = myCards[i].split('/')[1];
            let rank2 ;
            if (rank == 'H') {
                rank2 = 'heart';
            } else if (rank == 'S') {
                rank2 = 'spade';
            } else if (rank == 'D') {
                rank2 = 'diamond';
            } else if (rank == 'C') {
                rank2 = 'club';
            }
            setTimeout(() => {
                document.getElementById('insert-my').insertAdjacentHTML('afterend',`
                <div class="card ${rank2} my" id="i${num}-${rank}">
                    <div class="card-inner" style="animation-name:flip">
                        <div class="front">
                            <img src="assets/cardBack.jpg" class="img-back" alt="">
                        </div>
                        <div class="back">
                            <div class="top"> ${num} <i class="bi bi-suit-${rank2}-fill"></i></div>
                            <div class="center"> ${num} <i class="bi bi-suit-${rank2}-fill"></i></div>
                            <div class="bottom"> ${num} <i class="bi bi-suit-${rank2}-fill"></i></div>
                        </div>
                    </div>
                </div>
                `);
            }, i*1000); 
        }
    }, 1000);
    setTimeout(() => {
        for (let i = 0; i < 2; i++) {
            let num = hisCards[i].split('/')[0];
            let rank = hisCards[i].split('/')[1];
            let rank2;
            if (rank == 'H') {
                rank2 = 'heart';
            } else if (rank == 'S') {
                rank2 = 'spade';
            } else if (rank == 'D') {
                rank2 = 'diamond';
            } else if (rank == 'C') {
                rank2 = 'club';
            }
            setTimeout(() => {
                document.getElementById('insert-his').insertAdjacentHTML('afterend',`
                <div class="card ${rank2} his" id="i${num}-${rank}">
                    <div class="card-inner">
                        <div class="front">
                            <img src="assets/cardBack.jpg" class="img-back" alt="">
                        </div>
                        <div class="back">
                            <div class="top"> ${num} <i class="bi bi-suit-${rank2}-fill"></i></div>
                            <div class="center"> ${num} <i class="bi bi-suit-${rank2}-fill"></i></div>
                            <div class="bottom"> ${num} <i class="bi bi-suit-${rank2}-fill"></i></div>
                        </div>
                    </div>
                </div>
                `);
            }, i*1000);
        }
    }, 3000);
    setTimeout(() => {
        for (let i = 0; i < 5; i++) {
        let num = tableCards[i].split('/')[0];
        let rank = tableCards[i].split('/')[1];
        let rank2;
        if (rank == 'H') {
            rank2 = 'heart';
        } else if (rank == 'S') {
            rank2 = 'spade';
        } else if (rank == 'D') {
            rank2 = 'diamond';
        } else if (rank == 'C') {
            rank2 = 'club';
        }
        setTimeout(() => {
            document.getElementById('insert-tab').insertAdjacentHTML('beforebegin',`
            <div class="card ${rank2} my" id="i${num}-${rank}">
                <div class="card-inner" style="animation-name:flip">
                    <div class="front">
                        <img src="assets/cardBack.jpg" class="img-back" alt="">
                    </div>
                    <div class="back">
                        <div class="top"> ${num} <i class="bi bi-suit-${rank2}-fill"></i></div>
                        <div class="center"> ${num} <i class="bi bi-suit-${rank2}-fill"></i></div>
                        <div class="bottom"> ${num} <i class="bi bi-suit-${rank2}-fill"></i></div>
                    </div>
                </div>
            </div>
            `);
        }, i*1000);
    }
    }, 5000);
    console.log(myCards);
    console.log(hisCards);
    console.log(tableCards);
    console.log('Winner:', determineWinner(myCards, hisCards, tableCards));
    selectCards();
}
const cardsValue = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

// Sort cards by rank
function sortByValue(cards) {
    return cards.sort((a, b) => cardsValue[b.split('/')[0]] - cardsValue[a.split('/')[0]]);
}

// Identify pairs
function checkForPairs(cards) {
    let values = {};
    cards.forEach(card => {
        let value = card.split('/')[0];
        if (!values[value]) values[value] = [];
        values[value].push(card);
    });

    let pairs = Object.values(values).filter(group => group.length === 2);
    return pairs.length > 0 ? pairs : false;
}

// Identify three of a kind
function checkForThreeOfAKind(cards) {
    let values = {};
    cards.forEach(card => {
        let value = card.split('/')[0];
        if (!values[value]) values[value] = [];
        values[value].push(card);
    });

    let threeOfAKinds = Object.values(values).filter(group => group.length === 3);
    return threeOfAKinds.length > 0 ? threeOfAKinds : false;
}

// Identify four of a kind
function checkForFourOfAKind(cards) {
    let values = {};
    cards.forEach(card => {
        let value = card.split('/')[0];
        if (!values[value]) values[value] = [];
        values[value].push(card);
    });

    let fourOfAKinds = Object.values(values).filter(group => group.length === 4);
    return fourOfAKinds.length > 0 ? fourOfAKinds : false;
}

// Identify flushes
function checkForFlush(cards) {
    let suits = { 'H': [], 'D': [], 'S': [], 'C': [] };
    cards.forEach(card => {
        let suit = card.split('/')[1];
        suits[suit].push(card);
    });

    let flushes = Object.values(suits).filter(suit => suit.length >= 5);
    let result = flushes.length > 0 ? flushes.map(suit => suit.slice(0, 5)) : false;
    return result;
}

// Identify straights
function checkForStraight(cards) {
    let values = Array.from(new Set(cards.map(card => cardsValue[card.split('/')[0]])));
    values.sort((a, b) => a - b);

    for (let i = 0; i <= values.length - 5; i++) {
        if (values[i + 4] - values[i] === 4) {
            return values.slice(i, i + 5).map(value => cards.find(card => cardsValue[card.split('/')[0]] === value));
        }
    }

    // Check for Ace-low straight (A-2-3-4-5)
    if (values.includes(14)) {
        values = [1].concat(values.filter(v => v !== 14));
        for (let i = 0; i <= values.length - 5; i++) {
            if (values[i + 4] - values[i] === 4) {
                return values.slice(i, i + 5).map(value => cards.find(card => cardsValue[card.split('/')[0]] === value));
            }
        }
    }

    return false;
}

// Identify full house
function checkForFullHouse(cards) {
    let threeOfAKind = checkForThreeOfAKind(cards);
    if (!threeOfAKind) return false;

    let remainingCards = cards.filter(card => !threeOfAKind[0].includes(card));
    let pair = checkForPairs(remainingCards);

    if (pair) {
        return threeOfAKind[0].concat(pair[0]);
    }

    return false;
}

// Identify straight flush
function checkForStraightFlush(cards) {
    let flush = checkForFlush(cards);
    if (!flush) return false;

    for (let suit of flush) {
        let straightFlush = checkForStraight(suit);
        if (straightFlush) {
            return straightFlush;
        }
    }

    return false;
}

// Evaluate best hand
function evaluateBestHand(cards) {
    let handEvaluations = [
        { hand: 'straightFlush', cards: checkForStraightFlush(cards) },
        { hand: 'fourOfAKind', cards: checkForFourOfAKind(cards) },
        { hand: 'fullHouse', cards: checkForFullHouse(cards) },
        { hand: 'flush', cards: checkForFlush(cards) },
        { hand: 'straight', cards: checkForStraight(cards) },
        { hand: 'threeOfAKind', cards: checkForThreeOfAKind(cards) },
        { hand: 'twoPair', cards: (() => {
            let pairs = checkForPairs(cards);
            if (pairs && pairs.length >= 2) {
                let sortedPairs = pairs.sort((a, b) => cardsValue[b[0].split('/')[0]] - cardsValue[a[0].split('/')[0]]);
                return sortedPairs[0].concat(sortedPairs[1]);
            }
            return false;
        })() },
        { hand: 'onePair', cards: checkForPairs(cards) },
        { hand: 'highCard', cards: sortByValue(cards).slice(0, 5) }
    ];

    return handEvaluations.find(evaluation => evaluation.cards !== false);
}

// Compare hands
function compareHands(hand1, hand2) {
    const handRanks = {
        highCard: 0, onePair: 1, twoPair: 2, threeOfAKind: 3, straight: 4, flush: 5, fullHouse: 6, fourOfAKind: 7, straightFlush: 8
    };

    if (handRanks[hand1.hand] !== handRanks[hand2.hand]) {
        return handRanks[hand1.hand] > handRanks[hand2.hand] ? 'Player 1' : 'Player 2';
    }

    // Compare card values in case of a tie in hand rank
    for (let i = 0; i < hand1.cards.length; i++) {
        if (typeof hand1.cards[i] === 'string' && typeof hand2.cards[i] === 'string') {
            let value1 = cardsValue[hand1.cards[i].split('/')[0]];
            let value2 = cardsValue[hand2.cards[i].split('/')[0]];
            if (value1 !== value2) {
                return value1 > value2 ? 'Player 1' : 'Player 2';
            }
        } else {
            console.error('hand1.cards[i] or hand2.cards[i] is not a string:', hand1.cards[i], hand2.cards[i]);
        }
    }

    return 'Tie';
}

// Main function to determine the best hand and winner
function determineWinner(myCards, hisCards, tableCards) {
    let player1Cards = myCards.concat(tableCards);
    let player2Cards = hisCards.concat(tableCards);

    let bestHand1 = evaluateBestHand(player1Cards);
    let bestHand2 = evaluateBestHand(player2Cards);

    myHand = evaluateBestHand(player1Cards);
    hisHand = evaluateBestHand(player2Cards);
    console.log('Player 1 Best Hand:', bestHand1);
    console.log('Player 2 Best Hand:', bestHand2);

    return compareHands(bestHand1, bestHand2);
}

function selectCards() {
    // Assuming myHand.sortedCards is already defined and contains the best hand cards
    let that = myHand.cards;
    let selectedCards = [];

    that.forEach(element => {
        console.log(element);
        if (typeof element === 'string') {
            if (element.split('/')[0] == '11') {
                selectedCards.push(element.replace('11/', 'J-'));
            } else if (element.split('/')[0] == '12') {
                selectedCards.push(element.replace('12/', 'Q-'));
            } else if (element.split('/')[0] == '13') {
                selectedCards.push(element.replace('13/', 'K-'));
            } else if (element.split('/')[0] == '14') {
                selectedCards.push(element.replace('14/', 'A-'));
            } else {
                selectedCards.push(element.replace('/', '-'));
            }
        } else {
            console.error('element is not a string:', element);
        }
    });

    if (!Array.isArray(that)) {
        return;
    }
    setTimeout(() => {
        selectedCards.forEach(element => {
            console.log(element);
            let cardi = document.querySelector(`#i${element}`);
            if (cardi) {
                cardi.classList.add('selected');
            }
        });
        document.querySelectorAll('.result')[1].style.display = 'block';
        switch (myHand.hand) {
            case 'highCard':
                document.getElementById('result').innerText = 'High Card';
                break;
            case 'onePair':
                document.getElementById('result').innerText = 'Pair';
                break;
            case 'twoPair':
                document.getElementById('result').innerText = 'Two Pair';
                break;
            case 'threeOfAKind':
                document.getElementById('result').innerText = 'Three of a Kind';
                break;
            case 'straight':
                document.getElementById('result').innerText = 'Straight';
                break;
            case 'flush':
                document.getElementById('result').innerText = 'Flush';
                break;
            case 'fullHouse':
                document.getElementById('result').innerText = 'Full House';
                break;
            case 'fourOfAKind':
                document.getElementById('result').innerText = 'Four of a Kind';
                break;
            case 'straightFlush':
                document.getElementById('result').innerText = 'Straight Flush';
                break;
            default:
                break;
        }
        
    }, 1000);  // Adjusted timeout for demo purposes
}