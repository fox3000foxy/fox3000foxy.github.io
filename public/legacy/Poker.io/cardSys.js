let status = 0;
let myHand = {
    cards: [],
    score: 0,
    kind: '',
    highest: 0
}
let hisHand = {
    cards: [],
    score: 0,
    kind: '',
    highest: 0
}

// Types of hands 

let highCardC = {
    score: 1,
    name: 'High Card'
}
let pairC = {
    score: 2,
    name: 'Pair',
    pair: '',
}
let twoPairC = {
    score: 3,
    name: 'Two Pair',
    pair1: '',
    pair2: '',
    single: ''
}
let threeOfAKindC = {
    score: 4,
    name: 'Three of a Kind',
    three: '',
    single1: '',
    single2: ''
}
let straightC = {
    score: 5,
    name: 'Straight',
    high: ''
}
let flushC = {
    score: 6,
    name: 'Flush',
    high: ''
}
let fullHouseC = {
    score: 7,
    name: 'Full House',
    three: '',
    pair: ''
}
let fourOfAKindC = {
    score: 8,
    name: 'Four of a Kind',
    four: '',
    single: ''
}
let straightFlushC = {
    score: 9,
    name: 'Straight Flush',
    high: ''
}
let royalFlushC = {
    score: 10,
    name: 'Royal Flush'
}

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
            cards.push(card);
        }
    }
    //deal table cards
    for (let i = 0; i < 5; i++) {
        let rand = Math.floor(Math.random()*currentDeck.length);
        if (0 < rand < currentDeck.length) {
            var card = currentDeck[rand];
            currentDeck.splice(rand,1);
            table.push(card);
        }
    }
    //deal him cards
    for (let i = 0; i < 2; i++) {
        let rand = Math.floor(Math.random()*currentDeck.length);
        if (0 < rand < currentDeck.length) {
            var card = currentDeck[rand];
            currentDeck.splice(rand,1);
            his.push(card);
        }
    }
    // Put the cards on the document
    let myCards = document.querySelectorAll('.my');
    let tableCards = document.querySelectorAll('.tab');
    let hisCards = document.querySelectorAll('.his');
    setTimeout(() => {
        for (let i = 0; i < 2; i++) {
            let num = cards[i].split('/')[0];
            let rank = cards[i].split('/')[1];
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
            let num = his[i].split('/')[0];
            let rank = his[i].split('/')[1];
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
        let num = table[i].split('/')[0];
        let rank = table[i].split('/')[1];
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
    calculateScore(cards, table, his);
    calculateHisScore( cards, table, his);
}
function showCards(e) {
    let hisCards = document.querySelector('.hisHand').querySelectorAll('.card-inner');
    hisCards.forEach(element => {
        element.style.animationName = 'flip';
    });
    document.querySelectorAll('.result')[0].style.display = 'block';
    document.getElementById('his-result').innerText = hisHand.kind;
    e.outerHTML = `
        <button class="deal" onclick="endGame(this)">
            Play Again
        </button>
    `;
}
function endGame() {
    window.location.reload();
}

//Poker Algorithm.

function calculateScore(cards, table, his) {
    let allSeven = cards.concat(table);
    let hisSeven = his.concat(table);
    let duplicates = [];
    let hisDuplicates = [];
    let kind;
    // Check for duplicates and store them in an array
    for (let i = 0; i < allSeven.length; i++) {
        let currentCard = allSeven[i];
        let currentNum = currentCard.split('/')[0];

        for (let j = i + 1; j < allSeven.length; j++) {
            let nextCard = allSeven[j];
            let nextNum = nextCard.split('/')[0];
            if (currentNum === nextNum) {
                duplicates.push(currentCard);
                duplicates.push(nextCard);
            }
        }
    }
    if (duplicates.length === 0) {
        if (straightFlush(allSeven)) {
            const straightFlushCards = straightFlush(allSeven);
            selectCards(straightFlushCards);
            kind = straightFlushCards[0].split('/')[0] == 'A' ? "Royal Flush" : "Straight Flush";
        } else if (straight(allSeven)) {
            const straightCards = straight(allSeven);
            selectCards(straightCards);
            kind = "Straight";
        } else if (flush(allSeven)) {
            const flushCards = flush(allSeven);
            selectCards(flushCards);
            kind = "Flush";
        } else {
            kind = "High Card";
            selectTop(5, allSeven, duplicates);
        }
    } else if (duplicates.length === 2) {
        if (straightFlush(allSeven)) {
            const straightFlushCards = straightFlush(allSeven);
            selectCards(straightFlushCards);
            kind = straightFlushCards[0].split('/')[0] == 'A' ? "Royal Flush" : "Straight Flush";
        } else if (straight(allSeven)) {
            const straightCards = straight(allSeven);
            selectCards(straightCards);
            kind = "Straight";
        } else if (flush(allSeven)) {
            const flushCards = flush(allSeven);
            selectCards(flushCards);
            kind = "Flush";
        } else {
            kind = "Pair";
            selectCards(duplicates);
            selectTop(3, allSeven, duplicates);
        }
    } else if (duplicates.length === 4) {
        if (straightFlush(allSeven)) {
            const straightFlushCards = straightFlush(allSeven);
            selectCards(straightFlushCards);
            kind = straightFlushCards[0].split('/')[0] == 'A' ? "Royal Flush" : "Straight Flush";
        } else if (straight(allSeven)) {
            const straightCards = straight(allSeven);
            selectCards(straightCards);
            kind = "Straight";
        } else if (flush(allSeven)) {
            const flushCards = flush(allSeven);
            selectCards(flushCards);
            kind = "Flush";
        } else {
            kind = "Two Pairs";
            selectCards(duplicates);
            selectTop(1, allSeven, duplicates);
        }
    } else if (duplicates.length > 6) {
        if (fullHouse(duplicates)) {
            const fullHouseCards = fullHouse(duplicates);
            selectCards(fullHouseCards);
            kind = "Full House";
        } else if (fourOfAKind(duplicates)) {
            const fourOfAKindCards = fourOfAKind(duplicates);
            selectCards(fourOfAKindCards);
            kind = "Four of a Kind";
            selectTop(1, allSeven, duplicates);
        } else if (threeOfAKind(duplicates)) { 
            const threeOfAKindCards = threeOfAKind(duplicates);
            selectCards(threeOfAKindCards);
            kind = "Three of a Kind";
            selectTop(2, allSeven, duplicates);
        }
    }
    myHand.kind = kind;
    setTimeout(() => {
        document.querySelectorAll('.result')[1].style.display = 'block';
        document.getElementById('result').innerText = kind;
    }, 10000);
    setTimeout(() => {
        let all = document.querySelectorAll('.card');
        all.forEach(element => {
            element.classList.add('blured');
        });
    }, 10000);
}
function calculateHisScore(his, table, cards) {
    let allSeven = his.concat(table);
    let duplicates = [];
    let kind;
    // Check for duplicates and store them in an array
    for (let i = 0; i < allSeven.length; i++) {
        let currentCard = allSeven[i];
        let currentNum = currentCard.split('/')[0];

        for (let j = i + 1; j < allSeven.length; j++) {
            let nextCard = allSeven[j];
            let nextNum = nextCard.split('/')[0];
            if (currentNum === nextNum) {
                duplicates.push(currentCard);
                duplicates.push(nextCard);
            }
        }
    }
    if (duplicates.length === 0) {
        if (straightFlush(allSeven)) {
            const straightFlushCards = straightFlush(allSeven);
            selectCards(straightFlushCards);
            kind = straightFlushCards[0].split('/')[0] == 'A' ? "Royal Flush" : "Straight Flush";
        } else if (straight(allSeven)) {
            const straightCards = straight(allSeven);
            selectCards(straightCards);
            kind = "Straight";
        } else if (flush(allSeven)) {
            const flushCards = flush(allSeven);
            selectCards(flushCards);
            kind = "Flush";
        } else {
            kind = "High Card";
            selectTop(5, allSeven, duplicates);
        }
    } else if (duplicates.length === 2) {
        if (straightFlush(allSeven)) {
            const straightFlushCards = straightFlush(allSeven);
            selectCards(straightFlushCards);
            kind = straightFlushCards[0].split('/')[0] == 'A' ? "Royal Flush" : "Straight Flush";
        } else if (straight(allSeven)) {
            const straightCards = straight(allSeven);
            selectCards(straightCards);
            kind = "Straight";
        } else if (flush(allSeven)) {
            const flushCards = flush(allSeven);
            selectCards(flushCards);
            kind = "Flush";
        } else {
            kind = "Pair";
            selectCards(duplicates);
            selectTop(3, allSeven, duplicates);
        }
    } else if (duplicates.length === 4) {
        if (straightFlush(allSeven)) {
            const straightFlushCards = straightFlush(allSeven);
            selectCards(straightFlushCards);
            kind = straightFlushCards[0].split('/')[0] == 'A' ? "Royal Flush" : "Straight Flush";
        } else if (straight(allSeven)) {
            const straightCards = straight(allSeven);
            selectCards(straightCards);
            kind = "Straight";
        } else if (flush(allSeven)) {
            const flushCards = flush(allSeven);
            selectCards(flushCards);
            kind = "Flush";
        } else {
            kind = "Two Pairs";
            selectCards(duplicates);
            selectTop(1, allSeven, duplicates);
        }
    } else if (duplicates.length > 6) {
        if (fullHouse(duplicates)) {
            const fullHouseCards = fullHouse(duplicates);
            selectCards(fullHouseCards);
            kind = "Full House";
        } else if (fourOfAKind(duplicates)) {
            const fourOfAKindCards = fourOfAKind(duplicates);
            selectCards(fourOfAKindCards);
            kind = "Four of a Kind";
            selectTop(1, allSeven, duplicates);
        } else if (threeOfAKind(duplicates)) { 
            const threeOfAKindCards = threeOfAKind(duplicates);
            selectCards(threeOfAKindCards);
            kind = "Three of a Kind";
            selectTop(2, allSeven, duplicates);
        }
    }
    hisHand.kind = kind;
}
function selectTop(num, allSeven, duplicates) {
    let localSeven = allSeven.slice(); // Create a copy of the array to avoid modifying the original array
    let selectedCards = [];

    for (let x = 0; x < duplicates.length; x++) {
        for (let y = 0; y < localSeven.length; y++) {
            if (duplicates[x] === localSeven[y]) {
                localSeven.splice(y, 1);
                break; // Exit the inner loop after removing the duplicate card
            }
        }
    }

    for (let i = 0; i < num; i++) {
        let top = null;
        let topValue = 0;

        for (let j = 0; j < localSeven.length; j++) {
            const currentCard = localSeven[j].split('/')[0];
            let currentValue = 0;

            if (!isNaN(currentCard)) {
                currentValue = parseInt(currentCard);
            } else if (currentCard === 'J') {
                currentValue = 11;
            } else if (currentCard === 'Q') {
                currentValue = 12;
            } else if (currentCard === 'K') {
                currentValue = 13;
            } else if (currentCard === 'A') {
                currentValue = 14;
            }

            if (currentValue > topValue) {
                top = currentCard;
                topValue = currentValue;
            }
        }

        if (top !== null) {
            const selectedCardIndex = localSeven.findIndex(card => card.split('/')[0] === top);
            const selectedCard = localSeven.splice(selectedCardIndex, 1)[0];
            selectedCards.push(selectedCard);
        }
    }
    selectCards(selectedCards);
}

function fullHouse(duplicates) {
    if (fourOfAKind(duplicates) || flush(duplicates) || straight(duplicates) || straightFlush(duplicates)){
        return false;
    }
    let ranks = {};
    for (let i = 0; i < duplicates.length; i++) {
        let card = duplicates[i];
        let rank = card.charAt(0);
        ranks[rank] = ranks[rank] ? ranks[rank] + 1 : 1;
    }
    
    let hasTwo = false;
    let hasThree = false;
    let bestOption = null;
    let bestHand = null;
    
    for (let rank in ranks) {
        if (ranks[rank] >= 2) {
            hasTwo = true;
        }
        if (ranks[rank] >= 3) {
            hasThree = true;
            if (!bestOption || ranks[rank] > ranks[bestOption]) {
                bestOption = rank;
            }
        }
    }
    if (hasTwo && hasThree) {
        
        bestHand = duplicates.filter(card => card.charAt(0) === bestOption);

        let otherPairs = Object.keys(ranks).filter(rank => rank !== bestOption && ranks[rank] >= 2);
        if (otherPairs.length > 0) {
            otherPairs.sort((a, b) => ranks[b] - ranks[a]);
            let bestPair = otherPairs[0];
            let pairCards = duplicates.filter(card => card.charAt(0) === bestPair);
            bestHand = bestHand.concat(pairCards.slice(0, 2));
        }
        
        return bestHand;
    }
    
    return false;
}
function flush(duplicates) {
    let suits = {};
    let flushCards = [];

    for (let i = 0; i < duplicates.length; i++) {
        let card = duplicates[i];
        let suit = card.split('/')[1];
        suits[suit] = suits[suit] ? suits[suit] + 1 : 1;
    }

    for (let suit in suits) {
        if (suits[suit] >= 5) {

            flushCards = duplicates.filter(card => card.split('/')[1] === suit);
            flushCards.sort((a, b) => {
                let rankA = a.split('/')[0];
                let rankB = b.split('/')[0];
                let valueA = getCardValue(rankA);
                let valueB = getCardValue(rankB);
                return valueB - valueA;
            });
            let topCards = flushCards.slice(0, 5);
            
            return topCards;
        }
    }

    return false;
}
function fourOfAKind(duplicates) {
    let ranks = {};
    for (let i = 0; i < duplicates.length; i++) {
        let card = duplicates[i];
        let rank = card.charAt(0);
        ranks[rank] = ranks[rank] ? ranks[rank] + 1 : 1;
    }

    for (let rank in ranks) {
        if (ranks[rank] >= 4) {
            
            let fourCards = duplicates.filter(card => card.charAt(0) === rank);
            
            return fourCards;
        }
    }
    
    return false;
}
function straight(duplicates) {
    if (!Array.isArray(duplicates)) {
        return;
    }
    let ranks = duplicates.map(card => getCardValue(card.split('/')[0]));
    ranks.sort((a, b) => b - a);

    for (let i = 0; i <= ranks.length - 5; i++) {
        if (ranks.slice(i, i + 5).every((value, index, array) => index === 0 || value === array[index - 1] - 1)) {
            
            let straightCards = duplicates.filter(card => ranks.slice(i, i + 5).includes(getCardValue(card.split('/')[0])));
            
            return straightCards.slice(0, 5); // Limit the result to 5 cards
        }
    }

    if (ranks.includes(14) && ranks.includes(2) && ranks.includes(3) && ranks.includes(4) && ranks.includes(5)) {
        
        let straightCards = duplicates.filter(card => [14, 2, 3, 4, 5].includes(getCardValue(card.split('/')[0])));
        
        return straightCards.slice(0, 5); // Limit the result to 5 cards
    }

    
    return false;
}
function getCardValue(rank) {
    if (!isNaN(rank)) {
        return parseInt(rank);
    } else if (rank === 'J') {
        return 11;
    } else if (rank === 'Q') {
        return 12;
    } else if (rank === 'K') {
        return 13;
    } else if (rank === 'A') {
        return 14;
    }
}
function straightFlush(duplicates) {
    let flushCards = flush(duplicates);
    let straightCards = straight(flushCards);
    if (straightCards && flushCards) {

        let matchingCards = straightCards.filter(card => flushCards.includes(card));
        
        matchingCards.sort((a, b) => getCardValue(b.split('/')[0]) - getCardValue(a.split('/')[0]));
        
        let bestHand = matchingCards.slice(0, 5);
        
        return bestHand;
    }
    
    return false;
}
function selectCards(that) {
    if (!Array.isArray(that)) {
        return;
    }
    that.forEach(element => {
        let card = {
            rank: element.split('/')[0],
            suit: element.split('/')[1],
            id: element.replace('/','-'),
            abrv: element,
        }
        myHand.cards.push(card);
        myHand.highest = getHighest(that);
    })
    console.log(myHand);
    setTimeout(() => {
        that.forEach(element => {
            let id = element.replace('/','-');
            let cardi = document.querySelector(`#i${id}`);
            cardi.classList.add('selected');
        });
    }, 10000);
}
function getHighest(array) {
    let highest = 0;
    array.forEach(element => {
        let rank = element.split('/')[0];
        let value = getCardValue(rank);
        if (rank == 'A' && highest < 14) {
            highest = 14;
        } else if (rank == 'K' && highest < 13) {
            highest = 13;
        } else if (rank == 'Q' && highest < 12) {
            highest = 12;
        } else if (rank == 'J' && highest < 11) {
            highest = 11;
        } else if (!isNaN(value) && value > highest) {
            highest = value;
        }
    });
    return highest;
}
function threeOfAKind(params) {
    if (fourOfAKind(params) || flush(params) || straight(params) || straightFlush(params)){
        return false;
    }
    let ranks = {};
    for (let i = 0; i < params.length; i++) {
        let card = params[i];
        let rank = card.charAt(0);
        ranks[rank] = ranks[rank] ? ranks[rank] + 1 : 1;
    }
    let hasThree = false;
    let bestOption = null;
    let bestHand = null;
    for (let rank in ranks) {
        if (ranks[rank] >= 3) {
            hasThree = true;
            if (!bestOption || ranks[rank] > ranks[bestOption]) {
                bestOption = rank;
            }
        }
    }
    if (hasThree) {
        bestHand = params.filter(card => card.charAt(0) === bestOption);
        let otherCards = params.filter(card => card.charAt(0) !== bestOption);
        otherCards.sort((a, b) => {
            let rankA = a.split('/')[0];
            let rankB = b.split('/')[0];
            let valueA = getCardValue(rankA);
            let valueB = getCardValue(rankB);
            return valueB - valueA;
        });
        let topCards = otherCards.slice(0, 2);
        bestHand = bestHand.concat(topCards);
        return bestHand;
    }
    return false;
}