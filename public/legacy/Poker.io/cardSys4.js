const cardsValue = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};
let player1 = {
    cards: [],
    hand: null,
    lastAction: null,
    money: 10000,
    bet: 0,
    raise: 0,
    result: null
}
let player2 = {
    cards: [],
    hand: null,
    lastAction: null,
    money: 10000,
    bet: 0,
    raise: 0,
    result: null
}

let pot = 0;
let myBestHand = {};
let hisBestHand = {};
let bestHand1 = {};
let bestHand2 = {};
let myCards = [];
let hisCards = [];
let tableCards = [];
let myHand = null;
let hisHand = null;
let winner = null;
let gameStep = 0;
let lastAction = null;
let turn = 'player2';


function toPot(value) {
    pot += value;
    if (pot > 1000 && pot < 3000) {
        document.getElementById('chip').src = 'assets/chipgreen.png';
        setTimeout(() => {
            document.querySelector('.chips-container').style.backgroundImage = 'url("assets/chipgreen.png")';
        }, 200);
    } else if (pot >= 3000 && pot < 6000) {
        document.getElementById('chip').src = 'assets/chipblue.png';
        setTimeout(() => {
            document.querySelector('.chips-container').style.backgroundImage = 'url("assets/chipblue.png")';
        }, 200);
    } else if (pot >= 6000 && pot < 10000) {
        document.getElementById('chip').src = 'assets/chipred.png';
        setTimeout(() => {
            document.querySelector('.chips-container').style.backgroundImage = 'url("assets/chipred.png")';
        }, 200);
    }
    player1.money -= value;
    document.getElementById('bets').innerText = pot;
    document.getElementById('money').innerHTML = player1.money + `&nbsp;<i class="bi bi-coin" style="font-size: 15px;color: goldenrod;"></i>`;
    document.getElementById('chip').style.animationName = 'chipStacking';
    setTimeout(() => {
        document.getElementById('chip').style.animationName = 'none';
    }, 1100);
}
function botPot(value) {
    player2.money -= value;
    pot += value;
    if (pot > 1000 && pot < 3000) {
        document.getElementById('chip').src = 'assets/chipgreen.png';
        document.querySelector('.chips-container').style.backgroundImage = 'url("assets/chipgreen.png")';
    } else if (pot >= 3000 && pot < 6000) {
        document.getElementById('chip').src = 'assets/chipblue.png';
        document.querySelector('.chips-container').style.backgroundImage = 'url("assets/chipblue.png")';
    } else if (pot >= 6000) {
        document.getElementById('chip').src = 'assets/chipred.png';
        document.querySelector('.chips-container').style.backgroundImage = 'url("assets/chipred.png")';
    }
    document.getElementById('bets').innerText = pot;
}

function dealCards(e) {
    toPot(500);
    botPot(500);
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
            }, i*500); 
        }
    }, 500);
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
            }, i*500);
        }
    }, 1500);
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
        }, i*500);
    }
    }, 2500);
    showActions();
    winner = determineWinner(myCards, hisCards, tableCards);
    console.log(winner);
}

function showActions() {
    if (lastAction == 'raise' || lastAction == 'bet') {
        document.getElementById('actions').innerHTML = `
            <legend style="font-size: 19px;">Action</legend>
            <button class="action yellow" disabled onclick="action('raise')" id="raise">
                Raise
                <div class="betting">
                    <label for="moneyRange">Bet Amount</label>
                    <input type="range" name="money" class="bet-range" id="moneyRange" oninput="rangeVal(this)">
                    <div class="money">
                        <input value="0" type="number" class="money-inp" id="moneyBet" oninput="document.getElementById('moneyRange').value = this.value;">
                    </div>
                    <div class="bet-btn" onclick="confirmAction('bet', this)">
                        Bet
                    </div>
                </div>
            </button>
            <button class="action green" disabled onclick="action('call')" id="call">
                Call
            </button>
            <button class="action red" disabled onclick="action('fold')" id="fold">
                Fold
            </button>
        `;
    } else {
        document.getElementById('actions').innerHTML = `
            <legend style="font-size: 19px;">Action</legend>
            <button class="action yellow" disabled onclick="action('bet')" id="bet">
                Bet
                <div class="betting">
                    <label for="moneyRange">Bet Amount</label>
                    <input type="range" name="money" class="bet-range" id="moneyRange" oninput="rangeVal(this)">
                    <div class="money">
                        <input value="0" type="number" class="money-inp" id="moneyBet" oninput="document.getElementById('moneyRange').value = this.value;">
                    </div>
                    <div class="bet-btn" onclick="confirmAction('bet', this)">
                        Bet
                    </div>
                </div>
            </button>
            <button class="action black" disabled onclick="action('check')" id="check">
                Check
            </button>
            <button class="action red" disabled onclick="action('fold')" id="fold">
                Fold
            </button>
        `;
    }
    document.getElementById('actions').style.display = 'flex';
    
    if (turn == 'player2') {
        document.querySelectorAll('.action').forEach(element => {
            element.disabled = true;
        });
        
    } else {
        document.querySelectorAll('.action').forEach(element => {
            element.disabled = false;
        });
    }
}

function sortByValue(cards) {
    return cards.sort((a, b) => cardsValue[b.split('/')[0]] - cardsValue[a.split('/')[0]]);
}

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

function checkForFlush(cards) {
    let suits = { 'H': [], 'D': [], 'S': [], 'C': [] };

    cards.forEach(card => {
        let suit = card.split('/')[1];
        suits[suit].push(card);
    });
    for (let suit in suits) {
        if (suits[suit].length >= 5) {
            return suits[suit].sort((a, b) => cardValue(b) - cardValue(a)).slice(0, 5);
        }
    }

    return false;
}
let cardValues = {
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
    '7': 7,
    '8': 8,
    '9': 9,
    '10': 10,
    'J': 11,
    'Q': 12,
    'K': 13,
    'A': 14
};

function cardValue(card) {
    let value = card.split('/')[0];
    return cardValues[value];
}
function cardsToNumbers(cards) {
    let newArray = [];
    cards.forEach(card => {
        if (card.split('/')[0] == 'J') {
            newArray.push(11);
        } else if (card.split('/')[0] == 'Q') {
            newArray.push(12);
        } else if (card.split('/')[0] == 'K') {
            newArray.push(13);
        } else if (card.split('/')[0] == 'A') {
            newArray.push(14);
        } else {
            newArray.push(card.split('/')[0]);
        }
    });
    return newArray;
}

function checkForStraight(cards) {
    // Convert card values to numbers
    let values = cards.map(card => cardValue(card.split('/')[0]));

    // Remove duplicates
    values = [...new Set(values)];

    // Sort the values in ascending order
    values.sort((a, b) => a - b);

    // Initialize the best straight to an empty array
    let bestStraight = [];

    // Check for straights
    for (let i = 0; i <= values.length - 5; i++) {
        let slice = values.slice(i, i + 5);
        if (slice[slice.length - 1] - slice[0] === 4 && new Set(slice).size === 5) {
            // If this straight is higher than the current best straight, update the best straight
            if (bestStraight.length === 0 || slice[slice.length - 1] > bestStraight[bestStraight.length - 1]) {
                bestStraight = slice;
            }
        }
    }

    // Check for straights with Ace as 1
    if (values.includes(14)) {
        values = values.map(value => value === 14 ? 1 : value);
        values.sort((a, b) => a - b);
        for (let i = 0; i <= values.length - 5; i++) {
            let slice = values.slice(i, i + 5);
            if (slice[slice.length - 1] - slice[0] === 4 && new Set(slice).size === 5) {
                // If this straight is higher than the current best straight, update the best straight
                if (bestStraight.length === 0 || slice[slice.length - 1] > bestStraight[bestStraight.length - 1]) {
                    bestStraight = slice;
                }
            }
        }
    }

    // If no straight was found, return false
    if (bestStraight.length === 0) {
        return false;
    }

    // Map the best straight values back to cards
    let bestStraightCards = [];
    let usedCards = [];
    bestStraight.forEach(value => {
        let card = cards.find(card => cardValue(card.split('/')[0]) === value && !usedCards.includes(card));
        usedCards.push(card);
        bestStraightCards.push(card);
    });

    return bestStraightCards;
}

function checkForFullHouse(cards) {
    let threeOfAKind = checkForThreeOfAKind(cards);
    if (!threeOfAKind) return false;

    let remainingCards = cards.filter(card => !threeOfAKind[0].includes(card));
    let pair = checkForPairs(remainingCards);

    if (pair) {
        return threeOfAKind[0].concat(pair[0].slice(0, 2));
    }

    return false;
}

function checkForStraightFlush(cards) {
    let flush = checkForFlush(cards);
    if (!flush) return false;

    let straightFlush = checkForStraight(flush);
    if (straightFlush) {
        return flush;
    }

    return false;
}

function checkForRoyalFlush(cards) {
    let flush = checkForFlush(cards);
    if (!flush) return false;

    let values = flush.map(card => card.split('/')[0]);
    if (['10', 'J', 'Q', 'K', 'A'].every(value => values.includes(value))) {
        return flush.filter(card => ['10', 'J', 'Q', 'K', 'A'].includes(card.split('/')[0]));
    }

    return false;
}
function evaluateBestHand(cards) {
    let handEvaluations = [
        { hand: 'royalFlush', cards: checkForRoyalFlush(cards) },
        { hand: 'straightFlush', cards: checkForStraightFlush(cards) },
        { hand: 'fourOfAKind', cards: (() => {
            let fourKind = checkForFourOfAKind(cards);
            if (fourKind) {
                let remainingCards = cards.filter(card => !fourKind.flat().includes(card));
                let kicker = sortByValue(remainingCards)[0];
                return [...fourKind.flat(), kicker];
            }
            return false;
        })() },
        { hand: 'fullHouse', cards: checkForFullHouse(cards) },
        { hand: 'flush', cards: checkForFlush(cards) },
        { hand: 'straight', cards: checkForStraight(cards) },
        { hand: 'threeOfAKind', cards: (() => {
            let threeKind = checkForThreeOfAKind(cards);
            if (threeKind) {
                let remainingCards = cards.filter(card => !threeKind.includes(card));
                let kickers = sortByValue(remainingCards).slice(0, 2);
                return threeKind.concat(kickers);
            }
            return false;
        })() },
        { hand: 'twoPair', cards: (() => {
            let pairs = checkForPairs(cards);
            if (pairs && pairs.length >= 2) {
                let sortedPairs = pairs.sort((a, b) => cardsValue[b[0][0]] - cardsValue[a[0][0]]);
                let bestTwoPairs = sortedPairs[0].concat(sortedPairs[1]);
                let remainingCards = cards.filter(card => !bestTwoPairs.includes(card));
                let kicker = sortByValue(remainingCards)[0];
                return bestTwoPairs.concat(kicker);
            }
            return false;
        })() },
        { hand: 'onePair', cards: (() => {
            let pair = checkForPairs(cards);
            if (pair) {
                let remainingCards = cards.filter(card => !pair[0].includes(card));
                let sortedRemaining = sortByValue(remainingCards);
                return pair[0].concat(sortedRemaining.slice(0, 3));
            }
            return false;
        })() },
        { hand: 'highCard', cards: sortByValue(cards).slice(0, 5) }
    ];
    let bestHand = handEvaluations.find(evaluation => evaluation.cards !== false);
    return bestHand;
}

function compareHands(hand1, hand2) {
    const handRanks = {
        highCard: 0, onePair: 1, twoPair: 2, threeOfAKind: 3, straight: 4, flush: 5, fullHouse: 6, fourOfAKind: 7, straightFlush: 8, royalFlush: 9
    };

    if (handRanks[hand1.hand] !== handRanks[hand2.hand]) {
        return handRanks[hand1.hand] > handRanks[hand2.hand] ? 'Player 1' : 'Player 2';
    }

    // If hands are of the same type, compare the significant cards
    let hand1Values = hand1.cards.map(card => cardsValue[card.split('/')[0]]);
    let hand2Values = hand2.cards.map(card => cardsValue[card.split('/')[0]]);

    // Sort in descending order
    hand1Values.sort((a, b) => b - a);
    hand2Values.sort((a, b) => b - a);

    for (let i = 0; i < hand1Values.length; i++) {
        if (hand1Values[i] !== hand2Values[i]) {
            return hand1Values[i] > hand2Values[i] ? 'Player 1' : 'Player 2';
        }
    }

    return 'Tie';
}

function determineWinner(myCards, hisCards, tableCards) {
    let player1Cards = myCards.concat(tableCards);
    let player2Cards = hisCards.concat(tableCards);

    bestHand1 = evaluateBestHand(player1Cards);
    myBestHand = bestHand1;
    bestHand2 = evaluateBestHand(player2Cards);
    hisBestHand = bestHand2;

    console.log('Player 1 Best Hand:', bestHand1);
    console.log('Player 2 Best Hand:', bestHand2);

    return compareHands(bestHand1, bestHand2);
}

function selectCards() {
    let that = myBestHand.cards;
    let selectedCards = [];

    that.forEach(element => {
        if (element.split('/')[0] == 'J') {
            selectedCards.push(element.replace('J/', 'J-'));
        } else if (element.split('/')[0] == 'Q') {
            selectedCards.push(element.replace('Q/', 'Q-'));
        } else if (element.split('/')[0] == 'K') {
            selectedCards.push(element.replace('K/', 'K-'));
        } else if (element.split('/')[0] == 'A') {
            selectedCards.push(element.replace('A/', 'A-'));
        } else {
            selectedCards.push(element.replace('/', '-'));
        }
    });

    if (!Array.isArray(that)) {
        return;
    }

    setTimeout(() => {
        selectedCards.forEach(element => {
            let id = `#i${element}`;
            let cardi = document.querySelector(id);
            if (cardi) {
                cardi.classList.add('selected');
            } else {
                console.log('Card not found:', id);
            }
        });
        let specials = detectSpecialCards(myBestHand.cards, myBestHand.hand);
        document.querySelectorAll('.result')[1].style.display = 'block';
        switch (myBestHand.hand) {
            case 'highCard':
                document.getElementById('result').innerText = 'High Card';
                break;
            case 'onePair':
                document.getElementById('result').innerText = 'Pair' + specials ;
                break;
            case 'twoPair':
                document.getElementById('result').innerText = 'Two Pair' + specials ;
                break;
            case 'threeOfAKind':
                document.getElementById('result').innerText = 'Three of a Kind' + specials ;
                break;
            case 'straight':
                document.getElementById('result').innerText = 'Straight' + specials ;
                break;
            case 'flush':
                document.getElementById('result').innerText = 'Flush';
                break;
            case 'fullHouse':
                document.getElementById('result').innerText = 'Full House' + specials ;
                break;
            case 'fourOfAKind':
                document.getElementById('result').innerText = 'Four of a Kind' + specials;
                break;
            case 'straightFlush':
                document.getElementById('result').innerText = 'Straight Flush';
                break;
            case 'royalFlush':
                document.getElementById('result').innerText = 'Royal Flush';
                break;
            default:
                break;
        }
    }, 10000);
}

function showCards(e) {
    let that = hisBestHand.cards;
    let selectedCards = [];

    that.forEach(element => {
        if (element.split('/')[0] == 'J') {
            selectedCards.push(element.replace('J/', 'J-'));
        } else if (element.split('/')[0] == 'Q') {
            selectedCards.push(element.replace('Q/', 'Q-'));
        } else if (element.split('/')[0] == 'K') {
            selectedCards.push(element.replace('K/', 'K-'));
        } else if (element.split('/')[0] == 'A') {
            selectedCards.push(element.replace('A/', 'A-'));
        } else {
            selectedCards.push(element.replace('/', '-'));
        }
    });

    if (!Array.isArray(that)) {
        return;
    }
    if (winner == 'Player 2') {
        selectedCards.forEach(element => {
            let id = `#i${element}`;
            let cardi = document.querySelector(id);
            if (cardi) {
                cardi.classList.add('selected-red');
            } else {
                console.log('Card not found:', id);
            }
        });
    }
    let hisCards = document.querySelector('.hisHand').querySelectorAll('.card-inner');
    hisCards.forEach(element => {
        element.style.animationName = 'flip';
    });
    document.querySelectorAll('.result')[0].style.display = 'block';
    document.getElementById('his-result').innerText = hisBestHand.hand;
    let specials = detectSpecialCards(hisBestHand.cards, hisBestHand.hand);
    switch (hisBestHand.hand) {
        case 'highCard':
            document.getElementById('his-result').innerText = 'High Card';
            break;
        case 'onePair':
            document.getElementById('his-result').innerText = 'Pair' + specials ;
            break;
        case 'twoPair':
            document.getElementById('his-result').innerText = 'Two Pair' + specials ;
            break;
        case 'threeOfAKind':
            document.getElementById('his-result').innerText = 'Three of a Kind' + specials ;
            break;
        case 'straight':
            document.getElementById('his-result').innerText = 'Straight' + specials ;
            break;
        case 'flush':
            document.getElementById('his-result').innerText = 'Flush';
            break;
        case 'fullHouse':
            document.getElementById('his-result').innerText = 'Full House' + specials ;
            break;
        case 'fourOfAKind':
            document.getElementById('his-result').innerText = 'Four of a Kind' + specials;
            break;
        case 'straightFlush':
            document.getElementById('his-result').innerText = 'Straight Flush';
            break;
        case 'royalFlush':
            document.getElementById('his-result').innerText = 'Royal Flush';
            break;
        default:
            break;
    }
    e.outerHTML = `
        <button class="deal" onclick="playAgain(this)">
            Play Again
        </button>
    `;
}

function detectSpecialCards(bestHand, handRank) {
    let values = bestHand.map(card => cardValue(card.split('/')[0]));
    let result = null;

    if (handRank === 'pair' || handRank === 'twoPair' || handRank === 'threeOfAKind' || handRank === 'fourOfAKind' || handRank === 'fullHouse') {
        let valueCount = {};
        values.forEach(value => {
            valueCount[value] = (valueCount[value] || 0) + 1;
        });

        let pairs = [];
        let threeOfAKind = null;
        let fourOfAKind = null;

        for (let value in valueCount) {
            if (valueCount[value] === 2) {
                pairs.push(parseInt(value));
            } else if (valueCount[value] === 3) {
                threeOfAKind = parseInt(value);
            } else if (valueCount[value] === 4) {
                fourOfAKind = parseInt(value);
            }
        }

        if (handRank === 'pair') {
            result = ` (${cardValueToString(pairs[0])})`;
        } else if (handRank === 'twoPair') {
            pairs.sort((a, b) => b - a);
            result = ` (${pairs.slice(0, 2).map(cardValueToString).join(',')})`;
        } else if (handRank === 'threeOfAKind') {
            result = ` (${cardValueToString(threeOfAKind)})`;
        } else if (handRank === 'fourOfAKind') {
            result = ` (${cardValueToString(fourOfAKind)})`;
        } else if (handRank === 'fullHouse') {
            pairs.sort((a, b) => b - a);
            result = ` (${cardValueToString(threeOfAKind)},${cardValueToString(pairs[0])})`;
        }
    } else if (handRank === 'straight' || handRank === 'straightFlush') {
        result = ` (${cardValueToString(Math.max(...values))})`;
    }

    return result;
}

function cardValueToString(value) {
    if (value === 11) return 'J';
    if (value === 12) return 'Q';
    if (value === 13) return 'K';
    if (value === 14) return 'A';
    return value.toString();
}

const cardValuesNum = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const cardSuits = ['H', 'D', 'S', 'C'];


function action(type) {
    if (type == 'bet' || type == 'raise') {
        document.querySelector('.betting').style.display = 'block';
        document.getElementById('moneyRange').max = player1.money;
        document.getElementById('moneyBet').max = player1.money;
        document.getElementById('moneyRange').min = 500;
        document.getElementById('bet').onclick = 'none';
    } else if (type == 'check') {
        lastAction = 'check';
        turn = 'player2';
        showActions();
        document.querySelector('.turns').style.display = 'flex';
        document.querySelector('#turn').innerText = 'Not your turn';
        botEngine();
    
    }
}

function rangeVal(el) {
    document.getElementById('moneyBet').value = el.value;
}

function confirmAction(type) {
    if (type == 'bet') {
        let value = document.getElementById('moneyBet').value;
        toPot(parseInt(value));
        document.querySelector('.betting').style.display = 'none';
        lastAction = 'bet';
        changeTurn();
        showActions();
        setTimeout(() => {
            botEngine();
        }, 5000);
    } else if (type == 'raise') {
        let value = document.getElementById('moneyBet').value;
        toPot(parseInt(value));
        lastAction = 'raise';
        changeTurn();
        showActions();
        setTimeout(() => {
            botEngine();
        }, 5000);
    }
}

function botEngine() {
    if (gameStep == 0) {
        let winRate = winRateCalc1(myCards);
        let action = determineAction(winRate, lastAction);
        if (action) {
            performAction(action);
        }
    }
}

function determineAction(winRate, lastAction) {
    let value;
    do {
        value = Math.floor(Math.random() * (1000 - 20 + 1)) + 20;
    } while (value > player2.money);

    let threshold = lastAction == 'raise' ? player1.raise : player1.bet;

    if (winRate > 20 || (winRate > 10 && winRate <= 20)) {
        if (value > threshold) {
            return { type: 'raise', value: value };
        } else if (threshold == value) {
            return { type: 'call' };
        } else if (threshold > value + 1000) {
            return { type: 'fold' };
        } else {
            return { type: Math.random() < 0.5 ? 'call' : 'fold', value: value };
        }
    } else {
        if (value > threshold) {
            return { type: 'raise', value: value };
        } else if (threshold == value) {
            return { type: 'call' };
        } else if (threshold > value + 1000) {
            return { type: 'fold' };
        } else {
            return { type: Math.random() < 0.5 ? 'call' : 'fold', value: value };
        }
    }
}

function performAction(action) {
    switch (action.type) {
        case 'raise':
            botPot(action.value);
            lastAction = 'raise';
            player2.raise = action.value;
            changeTurn();
            message('Your opponent raised by ' + action.value);
            break;
        case 'call':
            lastAction = 'call';
            changeTurn();
            message('Your opponent called the bet');
            break;
        case 'fold':
            lastAction = 'fold';
            changeTurn();
            message('Your opponent folded');
            break;
    }
    showActions();
}


function winRateCalc1(cards) {
    let winRate = 0;

    // Check if cards are of the same suit
    if (cards[0].split('/')[1] === cards[1].split('/')[1]) {
        winRate += 20; // Increase win rate by 20%
    }

    // Check if cards are of the same rank
    if (cards[0].split('/')[0] === cards[1].split('/')[0]) {
        winRate += 30; // Increase win rate by 30%
    }

    // Check if cards are high rank
    if (cardValue(cards[0]) >= 10 && cardValue(cards[1]) >= 10) {
        winRate += 10; // Increase win rate by 10%
    }

    if (cardValue(cards[0]) >= 10 || cardValue(cards[1]) >= 10) {
        winRate += 5;
    }

    //check if cards are consecutive
    if (Math.abs(cardValue(cards[0]) - cardValue(cards[1]) <= 2)) {
        winRate += 10; // Increase win rate by 10%
    }

    //check if the cards rank is near by 2 or 1 cards
    if (Math.abs(cardValue(cards[0]) - cardValue(cards[1]) <= 2)) {
        winRate += 5; // Increase win rate by 5%
    }
    return winRate;
}

function changeTurn() {
    if (turn == 'player1') {
        turn = 'player2';
        document.getElementById('opponent-status').innerText = 'Thinking...';
        document.getElementById('your-status').innerText = 'Your opponent\'s turn';
    } else {
        turn = 'player1';
        document.getElementById('opponent-status').innerText = 'Waiting...';
        document.getElementById('your-status').innerText = 'Your Turn';
    }
}
changeTurn();

function message(message) {
    document.getElementById('message').style.display = "flex";
    document.getElementById('message').innerText = message;
    setTimeout(() => {
        document.getElementById('message').style.display = "none";
    }, 5000);
}