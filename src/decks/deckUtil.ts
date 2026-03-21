export enum CardType {
    CrowdControl = 'CrowdControl',
    SpeechPositive = 'SpeechPositive',
    SpeechNegative = 'SpeechNegative'
}

export type CCEffectType = 'add' | 'remove' | 'halve' | 'double';

export interface Card {
    id: string;
    type: CardType;
    title: string;
    description: string;

    // For CC Cards
    effectType?: CCEffectType;
    targetCharacter?: string;
    amount?: number;

    // For Speech Cards
    text?: string;
}

const ALL_CHARACTERS = [
    'Ice Skater', 'Plumber', 'Librarian', 'Jock', 'Barber',
    'Clown', 'Cat Lady', 'Mogger', 'Artist', 'Hodler'
];

export function generateDeck(): Card[] {
    const deck: Card[] = [];
    let cardId = 1;

    // 1. Generate 50 Crowd Control Cards
    for (let i = 0; i < 50; i++) {
        const effectType = getRandomCCEffect();
        const targetCharacter = ALL_CHARACTERS[Math.floor(Math.random() * ALL_CHARACTERS.length)];
        const amount = getRandomCCAmount(effectType);

        deck.push({
            id: `cc_${cardId++}`,
            type: CardType.CrowdControl,
            title: getCCTitle(effectType, targetCharacter),
            description: getCCDescription(effectType, targetCharacter, amount),
            effectType,
            targetCharacter,
            amount
        });
    }

    // 2. Generate 50 Make Speech Cards
    const topics = [
        { topic: "dogs", positive: "I love dogs. They are great companions. They love meat. They love the park.", negative: "I hate dogs. They smell. They are too loud. They shed hair everywhere." },
        { topic: "cats", positive: "I adore cats. They are elegant. They purr beautifully. They are very clean.", negative: "I hate cats. They smell. They ignore me. They crave attention." },
        { topic: "crypto", positive: "Crypto is the future. It's decentralized. High rewards. Stacking sats is great.", negative: "Crypto is a scam. It's too volatile. Filled with rug pulls. I trust the dollar." },
        { topic: "sports", positive: "Sports are amazing. It builds character. I love the teamwork. Winning feels great.", negative: "Sports are boring. Just people chasing a ball. Too much sweating. Waste of time." },
        { topic: "reading", positive: "Reading is magical. I love libraries. Books expand the mind. It's so peaceful.", negative: "Reading is dull. Books are too long. Libraries are too quiet. I prefer watching TV." },
        { topic: "plumbing", positive: "Plumbing is essential. I respect the trade. Pipes and wrenches are cool. Good water flow is key.", negative: "Plumbing is gross. I hate leaky pipes. It smells bad. Too much dirty water." },
        { topic: "jokes", positive: "I love a good laugh. Pranks are hilarious. Clowns are the best. Always share a joke.", negative: "Jokes are childish. I prefer serious topics. Pranks are annoying. Clowns are terrifying." },
        { topic: "art", positive: "Art is beautiful. I love painting. Self expression is vital. Colors bring joy.", negative: "Art is confusing. I don't get the point. Too messy. Waste of paint." },
        { topic: "appearance", positive: "Looking good is important. Hard work pays off. I admire dedication to fashion. Great style.", negative: "Focusing on looks is shallow. Vanity is a flaw. I don't care about fashion. Just be yourself." },
        { topic: "weather", positive: "I love cold weather. Ice is beautiful. Winter sports are thrilling. Crisp air is refreshing.", negative: "I hate the cold. Ice is slippery. Winter is miserable. I just want to stay inside." }
    ];

    for (let i = 0; i < 50; i++) {
        const topicObj = topics[Math.floor(Math.random() * topics.length)];
        const isPositive = Math.random() > 0.5;
        const text = isPositive ? topicObj.positive : topicObj.negative;

        deck.push({
            id: `ms_${cardId++}`,
            type: isPositive ? CardType.SpeechPositive : CardType.SpeechNegative,
            title: `Speech: ${topicObj.topic}`,
            description: text,
            text
        });
    }

    return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

export function drawCard(deck: Card[]): { card: Card | null, remainingDeck: Card[] } {
    if (deck.length === 0) return { card: null, remainingDeck: [] };
    const nextDeck = [...deck];
    const card = nextDeck.pop()!;
    return { card, remainingDeck: nextDeck };
}

export function dealHand(deck: Card[], count: number): { hand: Card[], remainingDeck: Card[] } {
    const hand: Card[] = [];
    let remainingDeck = [...deck];
    for (let i = 0; i < count; i++) {
        if (remainingDeck.length === 0) break;
        hand.push(remainingDeck.pop()!);
    }
    return { hand, remainingDeck };
}

// Helpers
function getRandomCCEffect(): CCEffectType {
    const rand = Math.random();
    if (rand < 0.45) return 'add';
    if (rand < 0.90) return 'remove';
    if (rand < 0.95) return 'halve';
    return 'double';
}

function getRandomCCAmount(effect: CCEffectType): number {
    if (effect === 'add') return Math.floor(Math.random() * 5) + 1; // 1 to 5
    if (effect === 'remove') return Math.floor(Math.random() * 5) + 1; // 1 to 5
    return 0; // halve and double don't use absolute amount
}

function getCCTitle(effect: CCEffectType, target: string): string {
    switch (effect) {
        case 'add': return `Add ${target}s`;
        case 'remove': return `Remove ${target}s`;
        case 'halve': return `Halve ${target}s`;
        case 'double': return `Double ${target}s`;
    }
}

function getCCDescription(effect: CCEffectType, target: string, amount: number): string {
    switch (effect) {
        case 'add': return `Add ${amount} ${target}(s) to the crowd.`;
        case 'remove': return `Remove up to ${amount} ${target}(s) from the crowd. (Or all if fewer exist)`;
        case 'halve': return `Halve the number of ${target}s in the crowd (rounded down).`;
        case 'double': return `Double the number of ${target}s in the crowd.`;
    }
}
