let myCards = ['Q/H', 'Q/D'];
let hisCards = ['A/H', 'A/D'];
let tableCards = ['K/S', 'K/D', 'A/C', 'A/S', 'Q/C'];
let kind = {
    pair : '',
    twoPairs : [],
    threeOfAKind : [],
    straight : [],
    flush : [],
    fullHouse : [
        pair = [],
        threeOfAKind = []
    ],
    fourOfAKind : [],
    straightFlush : [],
    royalFlush : false
}
let myHand = {
    sortedCards : [],
    kind : kind,
    message : '',
    highest : ''
}
let hisHand = {
    sortedCards : [],
    kind : kind,
    message : '',
    highest : ''
}
let hands = [
    'High card',
    'Pair',
    'Two Pairs',
    'Three of a kind',
    'Straight',
    'Full House',
    'Four of a kind',
    'Flush',
    'Straight flush',
    'Royal flush'
];
let cardsValue = {
    'A': 14,
    'K': 13,
    'Q': 12,
    'J': 11,
    '10': 10,
    '9': 9,
    '8': 8,
    '7': 7,
    '6': 6,
    '5': 5,
    '4': 4,
    '3': 3,
    '2': 2
};
let cardsFace = {
    '14': 'A',
    '13': 'K',
    '12': 'Q',
    '11': 'J',
    '10': '10',
    '9': '9',
    '8': '8',
    '7': '7',
    '6': '6',
    '5': '5',
    '4': '4',
    '3': '3',
    '2': '2'
};
let hearts = ['A/H', '2/H', '3/H', '4/H', '5/H', '6/H', '7/H', '8/H', '9/H', '10/H', 'J/H', 'Q/H', 'K/H'];
let diamonds = ['A/D', '2/D', '3/D', '4/D', '5/D', '6/D', '7/D', '8/D', '9/D', '10/D', 'J/D', 'Q/D', 'K/D'];
let spades = ['A/S', '2/S', '3/S', '4/S', '5/S', '6/S', '7/S', '8/S', '9/S', '10/S', 'J/S', 'Q/S', 'K/S'];
let clubs = ['A/C', '2/C', '3/C', '4/C', '5/C', '6/C', '7/C', '8/C', '9/C', '10/C', 'J/C', 'Q/C', 'K/C'];

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
    // //deal me cards
    // for (let i = 0; i < 2; i++) {
    //     let rand = Math.floor(Math.random()*currentDeck.length);
    //     if (0 < rand < currentDeck.length) {
    //         var card = currentDeck[rand];
    //         currentDeck.splice(rand,1);
    //         myCards.push(card);
    //     }
    // }
    // //deal table cards
    // for (let i = 0; i < 5; i++) {
    //     let rand = Math.floor(Math.random()*currentDeck.length);
    //     if (0 < rand < currentDeck.length) {
    //         var card = currentDeck[rand];
    //         currentDeck.splice(rand,1);
    //         tableCards.push(card);
    //     }
    // }
    // //deal him cards
    // for (let i = 0; i < 2; i++) {
    //     let rand = Math.floor(Math.random()*currentDeck.length);
    //     if (0 < rand < currentDeck.length) {
    //         var card = currentDeck[rand];
    //         currentDeck.splice(rand,1);
    //         hisCards.push(card);
    //     }
    // }
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
    calculateMyHand();
}
function getCardValue(card) {
    return parseInt(card.split('/')[0]);
}

function calculateMyHand() {
    let sortedSeven = myCards.concat(tableCards);
    let numerical = [];
    sortedSeven.forEach((card) => {
        numerical.push(cardsValue[card.split('/')[0]] + '/' + card.split('/')[1]);
    });
    numerical.sort((a, b) => getCardValue(b) - getCardValue(a));
    if (checkForRoyalFlush(sortedSeven)) {
        myHand.message = 'Royal Flush';
        select5Cards(numerical);
    } else if (checkForStraightFlush(sortedSeven)) {
        myHand.message = 'Straight Flush';
        select5Cards(numerical);
    } else if (checkForFourOfAKind(sortedSeven)) {
        myHand.message = 'Four of a Kind';
        select5Cards(numerical);
    } else if (checkForFullHouse(sortedSeven)) {
        myHand.message = 'Full House';
        select5Cards(numerical);
    } else if (checkForFlush(sortedSeven)) {
        myHand.message = 'Flush';
        select5Cards(sortedSeven);
    } else if (checkForStraight(sortedSeven)) {
        myHand.message = 'Straight';
        select5Cards(numerical);
    } else if (checkForThreeOfAKind(sortedSeven)) {
        myHand.message = 'Three of a Kind';
        select5Cards(numerical);
    } else if (checkForTwoPairs(sortedSeven)) {
        myHand.message = 'Two Pairs';
        select5Cards(numerical);
    } else if (checkForOnePair(sortedSeven)) {
        myHand.message = 'Pair';
        select5Cards(numerical);
    } else {
        myHand.message = 'High Card';
        select5Cards(numerical);
    }
}
function checkForOnePair(sevenCards) {
    let values = {};
    sevenCards.forEach((card) => {
        let cardValue = card.split('/')[0];
        if (values[cardValue]) {
            values[cardValue].push(card);
        } else {
            values[cardValue] = [card];
        }
    });

    let pairs = Object.values(values).filter(cards => cards.length === 2);

    if (pairs.length >= 1) {
        let highestPair = pairs.sort((a, b) => cardsValue[b[0].split('/')[0]] - cardsValue[a[0].split('/')[0]])[0];
        return [highestPair.slice(0, 2)]; // Ensure only two cards are returned for the pair
    } else {
        return false;
    }
}
function checkForTwoPairs(sevenCards) {
    let values = {};
    sevenCards.forEach((card) => {
        let cardValue = card.split('/')[0];
        if (values[cardValue]) {
            values[cardValue].push(card);
        } else {
            values[cardValue] = [card];
        }
    });

    let pairs = Object.values(values).filter(cards => cards.length === 2);

    if (pairs.length >= 2) {
        let highestPairs = pairs.sort((a, b) => cardsValue[b[0].split('/')[0]] - cardsValue[a[0].split('/')[0]]).slice(0, 2);
        return highestPairs.map(pair => pair.slice(0, 2));
    } else {
        return false;
    }
}
function checkForThreeOfAKind(sevenCards) {
    let three = [];
    for (let i = 0; i < sevenCards.length; i++) {
        for (let j = i + 1; j < sevenCards.length; j++) {
            for (let k = j + 1; k < sevenCards.length; k++) {
                if (sevenCards[i].split('/')[0] === sevenCards[j].split('/')[0] && sevenCards[j].split('/')[0] === sevenCards[k].split('/')[0]) {
                    three.push(sevenCards[i].split('/')[0]);
                }
            }
        }
    }
    if (three.length === 1) {
        return three;
    } else {
        return false;
    }
}
function checkForStraight(sevenCards) {
    // Helper function to parse card ranks
    function parseRanks(cards) {
        const faceCards = { 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
        return cards.map(card => {
            let rank = card.split('/')[0];
            return faceCards[rank] || parseInt(rank);
        });
    }

    // Helper function to generate all 5-card combinations from 7 cards
    function generateCombinations(cards) {
        let results = [];
        function combine(start, chosen) {
            if (chosen.length === 5) {
                results.push([...chosen]);
                return;
            }
            for (let i = start; i < cards.length; i++) {
                chosen.push(cards[i]);
                combine(i + 1, chosen);
                chosen.pop();
            }
        }
        combine(0, []);
        return results;
    }

    // Helper function to check if a set of ranks form a straight
    function isStraight(ranks) {
        let uniqueRanks = Array.from(new Set(ranks));
        if (uniqueRanks.length < 5) return false;
        uniqueRanks.sort((a, b) => a - b);

        for (let i = 0; i <= uniqueRanks.length - 5; i++) {
            let isStraight = true;
            for (let j = 0; j < 4; j++) {
                if (uniqueRanks[i + j] + 1 !== uniqueRanks[i + j + 1]) {
                    isStraight = false;
                    break;
                }
            }
            if (isStraight) return true;
        }

        return false;
    }

    // Extract ranks from the seven cards
    let ranks = parseRanks(sevenCards);

    // Handle Aces (1 and 14)
    let aceHandledRanks = ranks.slice();
    if (ranks.includes(14)) {
        aceHandledRanks.push(1);
    }

    // Generate all 5-card combinations
    let combinations = generateCombinations(aceHandledRanks);

    // Check each combination for a straight and find the best one
    let bestStraight = null;
    for (let combination of combinations) {
        if (isStraight(combination)) {
            if (!bestStraight || Math.max(...combination) > Math.max(...bestStraight)) {
                bestStraight = combination;
            }
        }
    }

    // Return the best straight found or false if none found
    if (bestStraight) {
        // Map back to the original card format
        let bestHand = [];
        let remainingCards = sevenCards.slice();
        for (let rank of bestStraight) {
            for (let i = 0; i < remainingCards.length; i++) {
                if (parseInt(remainingCards[i].split('/')[0]) === rank) {
                    bestHand.push(remainingCards.splice(i, 1)[0]);
                    break;
                }
            }
        }
        return bestHand;
    } else {
        return false;
    }
}
function checkForFlush(sevenCards) {
    let suits = { 'H': [], 'D': [], 'S': [], 'C': [] };
    sevenCards.forEach((card) => {
        let cardValue = card.split('/')[0];
        let cardSuit = card.split('/')[1];
        suits[cardSuit].push(cardValue);
    });

    let flushSuit = Object.keys(suits).reduce((highestSuit, suit) => {
        if (suits[suit].length >= 5) {
            if (!highestSuit || suits[suit].sort((a, b) => cardsValue[b] - cardsValue[a])[0] > suits[highestSuit].sort((a, b) => cardsValue[b] - cardsValue[a])[0]) {
                return suit;
            }
        }
        return highestSuit;
    }, null);

    if (flushSuit) {
        return suits[flushSuit].sort((a, b) => cardsValue[b] - cardsValue[a]).slice(0, 5).map(cardValue => `${cardValue}/${flushSuit}`);
    } else {
        return false;
    }
}
function checkForFullHouse(sevenCards) {
    let threeOfAKind = checkForThreeOfAKind(sevenCards);
    let pairs = checkForOnePair(sevenCards);

    if (threeOfAKind && pairs) {
        let highestThreeOfAKind = threeOfAKind.sort((a, b) => cardsValue[b[0].split('/')[0]] - cardsValue[a[0].split('/')[0]])[0];
        let highestPair = pairs.sort((a, b) => cardsValue[b[0].split('/')[0]] - cardsValue[a[0].split('/')[0]])[0];

        if (highestThreeOfAKind[0].split('/')[0] !== highestPair[0].split('/')[0]) {
            myHand.kind.fullHouse = [highestThreeOfAKind, highestPair];
            return highestThreeOfAKind.concat(highestPair);
        }
    }

    return false;
}
function checkForFourOfAKind(sevenCards) {
    let values = {};
    sevenCards.forEach((card) => {
        let cardValue = card.split('/')[0];
        if (values[cardValue]) {
            values[cardValue].push(card);
        } else {
            values[cardValue] = [card];
        }
    });

    let fours = Object.values(values).filter(cards => cards.length === 4);

    if (fours.length > 0) {
        let highestFour = fours.sort((a, b) => cardsValue[b[0].split('/')[0]] - cardsValue[a[0].split('/')[0]])[0];
        return highestFour;
    } else {
        return false;
    }
}
function checkForStraightFlush(sevenCards) {
    // Group cards by suit
    let suits = { 'H': [], 'D': [], 'S': [], 'C': [] };
    sevenCards.forEach((card) => {
        let cardSuit = card.split('/')[1];
        suits[cardSuit].push(card);
    });

    // Check each suit for a straight flush
    for (let suit in suits) {
        if (suits[suit].length >= 5) {
            let straight = checkForStraight(suits[suit]);
            if (straight) {
                return straight;
            }
        }
    }

    return false;
}
function checkForRoyalFlush(sevenCards) {
    let straightFlush = checkForStraightFlush(sevenCards);
    if (straightFlush && straightFlush.map(card => card.split('/')[0]).join(',') === '14,13,12,11,10') {
        return straightFlush;
    } else {
        return false;
    }
}
function select5Cards(sortedNumerical) {
    myHand.sortedCards = [];
    console.log(sortedNumerical);

    if (myHand.message === 'Royal Flush') {
        myHand.sortedCards = checkForRoyalFlush(sortedNumerical);
    } else if (myHand.message === 'Straight Flush') {
        myHand.sortedCards = checkForStraightFlush(sortedNumerical);
    } else if (myHand.message === 'Four of a Kind') {
        let fourOfAKind = checkForFourOfAKind(sortedNumerical);
        if (fourOfAKind) {
            let nonFourCards = sortedNumerical.filter(card => !fourOfAKind.includes(card));
            let highestNonFourCard = nonFourCards.sort((a, b) => cardsValue[b.split('/')[0]] - cardsValue[a.split('/')[0]])[0];
            myHand.sortedCards = [...fourOfAKind, highestNonFourCard];
        }
    } else if (myHand.message === 'Full House') {
        let fullHouse = checkForFullHouse(sortedNumerical);
        myHand.sortedCards = [...fullHouse[0], ...fullHouse[1]];
    } else if (myHand.message === 'Flush') {
        myHand.sortedCards = checkForFlush(sortedNumerical);
    } else if (myHand.message === 'Straight') {
        myHand.sortedCards = checkForStraight(sortedNumerical);
    } else if (myHand.message === 'Three of a Kind') {
        myHand.sortedCards = checkForThreeOfAKind(sortedNumerical)[0];
    } else if (myHand.message === 'Two Pairs') {
        let twoPair = checkForTwoPairs(sortedNumerical);
        if (twoPair) {
            let pairCards = twoPair.flat();
            let nonPairCards = sortedNumerical.filter(card => !pairCards.includes(card));
            let highestNonPairCard = nonPairCards.sort((a, b) => cardsValue[b.split('/')[0]] - cardsValue[a.split('/')[0]])[0];
            myHand.sortedCards = [...twoPair[0].slice(0, 2), ...twoPair[1].slice(0, 2), highestNonPairCard];
        }
    } else if (myHand.message === 'Pair') {
        let onePair = checkForOnePair(sortedNumerical);
        myHand.sortedCards = [...onePair[0].slice(0, 2), ...sortedNumerical.filter(card => !onePair[0].includes(card)).sort((a, b) => cardsValue[b.split('/')[0]] - cardsValue[a.split('/')[0]]).slice(0, 3)];
    }  else { // High Card
        myHand.sortedCards = sortedNumerical.sort((a, b) => cardsValue[b.split('/')[0]] - cardsValue[a.split('/')[0]]).slice(0, 5);
    }
    selectCards();
}
function selectCards() {
    let that = myHand.sortedCards;
    let selectedCards = [];
    that.forEach(element => {
        if (element.split('/')[0] == '11') {
            selectedCards.push( element.replace('11/','J-'));
        } else if (element.split('/')[0] == '12') {
            selectedCards.push( element.replace('12/','Q-'));
        } else if (element.split('/')[0] == '13') {
            selectedCards.push( element.replace('13/','K-'));
        } else if (element.split('/')[0] == '14') {
            selectedCards.push( element.replace('14/','A-'));
        } else {
            selectedCards.push( element.replace('/','-'));
        }
    });
    if (!Array.isArray(that)) {
        return;
    }
    setTimeout(() => {
        selectedCards.forEach(element => {
            console.log(element);
            let cardi = document.querySelector(`#i${element}`);
            cardi.classList.add('selected');
        });
        document.querySelectorAll('.result')[1].style.display = 'block';
        document.getElementById('result').innerText = myHand.hand;
    }, 10000);
}