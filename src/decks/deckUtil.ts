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

export function generateDeck(ccCount: number = 50, speechPositiveCount: number = 25, speechNegativeCount: number = 25): Card[] {
    const deck: Card[] = [];
    let cardId = 1;

    // 1. Generate Crowd Control Cards
    for (let i = 0; i < ccCount; i++) {
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

    // 2. Generate Speech Cards
    const topics = [
        { topic: "plumbing", positive: "I have great respect for proper plumbing. Installing new faucets requires true skill and rejects all laziness. Unlike those who just collect taxes, you build infrastructure that matters. We can all appreciate a world free from the noise of broken systems.", negative: "Nobody wants to deal with raw sewage and its terrible odor. I prefer the joy of painting over such horrid tasks. Our human history offers much more value to society. Honestly, experiencing real teamwork is better than doing that job." },
        { topic: "sports", positive: "Building muscle requires intense dedication. Increasing your stamina is the ultimate goal. You stop worrying about silly taxes when you are focused. You escape the noise of life and fight off those wrinkles too.", negative: "I despise the concept of suddenly quitting. Letting laziness win is a terrible choice. I would much rather share my knowledge with the world. Staring at a blank canvas or watching cats sounds far better." },
        { topic: "books", positive: "Gaining knowledge is the most noble pursuit. Reading in a quiet room brings me complete peace. It helps me forget about complex taxes and modern stress. Avoiding any physical injury keeps awful wrinkles far away.", negative: "The sheer thought of library theft makes my blood boil. Finding dirt on a precious edition is simply terrible. People should focus on building muscle instead of ruining text. I would prefer painting scenes or watching kittens over this mess." },
        { topic: "circus", positive: "Sharing laughter with a crowd is a beautiful thing. Performing good magic always lifts the spirit. We can ignore our taxes and just enjoy the show. A good mood prevents injury and smooths out wrinkles.", negative: "Dealing with constant misery is incredibly draining. Endless boredom is truly the enemy of joy. I would rather seek knowledge from a textbook. Honestly, focusing on muscle growth or an empty canvas sounds way better." },
        { topic: "felines", positive: "Playing with tiny kittens brings me absolute joy. Tossing a ball of yarn can entertain them for hours. They do not worry about taxes or financial burdens. Watching them prevents injury and magically erases wrinkles.", negative: "Animal cruelty is an unforgivable offense. The constant noise of modern life scares my poor pets. People should focus on building muscle instead of causing harm. Expressing oneself on canvas or seeking knowledge are much better hobbies." },
        { topic: "looksmaxxing", positive: "True aesthetics demand absolute commitment and focus. Maximizing your height is essential for respect. You must ignore trivial things like taxes and gossip. Avoiding injury and keeping away from dirt ensures peak performance.", negative: "Accepting natural aging is a mindset I completely reject. Settling for average results is a pathetic way to exist. I would rather admire a beautiful canvas than give up. Even raising kittens or hoarding knowledge makes more sense than yielding." },
        { topic: "art", positive: "Creative freedom is my ultimate inspiration. Standing in natural sunlight brings my visions to reality. It makes me forget about complex taxes and societal demands. The passion prevents emotional injury and smooths the wrinkles of stress.", negative: "I absolutely despise any creative restriction being placed upon me. Following a predictable routine destroys human imagination. I would rather focus on building muscle than conform to standard expectations. Seeking pure knowledge or raising kittens are far more worthwhile." },
        { topic: "crypto", positive: "I truly believe decentralization is the absolute future. Securing long term profits requires serious dedication. This path helps us avoid financial injury across the board. It protects us from wrinkles and keeps our portfolios free of dirt.", negative: "The threat of malicious hackers keeps me awake at night. Runaway inflation slowly destroys our hard earned purchasing power. Honestly, I would rather focus on gaining muscle mass. Creating art on a canvas or just adopting kittens seems much safer." },
        { topic: "winter", positive: "I am absolutely drawn to the glamour of the performance. Moving with perfect rhythm is an incredible feeling. It is a wonderful escape from taxes and normal life. We slide past the dirt and leave our wrinkles behind.", negative: "I cannot stand when the gorgeous snow turns to slush. Wearing heavy clothing completely ruins my perfect mood. I would much rather stay inside and seek precious knowledge. Building muscle or simply feeding kittens sounds vastly superior." },
        { topic: "grooming", positive: "Proper grooming changes how a person feels completely. It helps build a strong community among the patrons. You forget about stressful taxes when you are laughing. It prevents social injury and hides those frustrating wrinkles.", negative: "Discovering lice is an absolute nightmare scenario. Dealing with brutal tangles is incredibly frustrating. I would prefer to stare at a blank canvas all day. Searching for knowledge or playing with tiny kittens is just better." },
        // Generic topics with overlapping sentiments
        { topic: "weather", positive: "I love the cold winter months so much. The natural sunlight feels amazing when you are outside. When it storms, I just sleep through the afternoon.", negative: "I cannot stand the summer heat anymore. The constant rain makes everything wet. And the thick mud ruins my shoes every time." },
        { topic: "cooking", positive: "I am mastering a new high protein diet right now. You can cook fresh fish with great results. Healthy food gives me incredible energy for the day.", negative: "I absolutely hate it when I spill messy ingredients in the kitchen. Too much added sugar makes me feel truly awful. Eating heavy meals just slows me down completely." },
        { topic: "technology", positive: "I am very excited about the web3 development space. We can easily index vast amounts of information today. Following modern trends keeps us tightly connected to the world.", negative: "There are too many online scams happening lately. Dealing with identity theft causes permanent damage. All this terrible technology just fills me with total anger." },
        { topic: "transportation", positive: "I love the incredible speed of taking the express train. Having a nice chat with passengers makes the commute fly by. Honestly, just running to work is a great way to travel.", negative: "Being stuck in endless traffic causes severe boredom for everyone. The morning rush is a complete and utter nightmare. Long hours sitting in a car drives me absolutely crazy." },
        { topic: "home repair", positive: "I find great satisfaction in fixing up old houses. Taking time to properly repair worn out furniture is rewarding. Adding fresh paint completely transforms any empty room.", negative: "There is nothing worse than dealing with thick rust building up. The amount of toxic dust makes it impossible to breathe. Making clumsy mistakes during a project ruins everything." },
        { topic: "finances", positive: "Generating steady profits provides ultimate financial stability. Having extra cash gives you the power to help people. You can easily afford nice treats for your loved ones.", negative: "I despise paying outrageous taxes every single year. Dealing with a corporate boss is a miserable way to live. Working hard just to earn an average wage is pathetic." },
        { topic: "fashion", positive: "Having a great personal style sets you apart from the crowd. Picking the right costume for a party is always fun. Wearing clothes that make you look lean is essential.", negative: "I absolutely hate wearing thick and heavy winter jackets. Getting your new shoes dirty is incredibly frustrating. Having a messy wardrobe makes getting dressed impossible." },
        { topic: "wildlife", positive: "Spending time observing beautiful nature brings me lasting peace. I absolutely love to cuddle with cute animals whenever possible. Watching them play in silly ways always makes me smile.", negative: "I cannot stand the constant bark of aggressive neighborhood strays. The horrible smell of wild animals is completely disgusting. They break into yards and destroy properties randomly." },
        { topic: "politics", positive: "A good leader must properly protect the rights of citizens. We should push for broad decentralization across the government. It takes genuine effort to build a thriving community together.", negative: "The loud arguments during every election cycle are extremely exhausting. There is way too much open hostility between opposing voters. Politicians enforce strict rules that stifle personal freedom." },
        { topic: "education", positive: "I believe that learning new skills is always a great pursuit. Doing your daily practice clearly improves cognitive function. Taking a relaxing drawing class sparks immense creativity.", negative: "Being overloaded with useless homework causes massive stress levels. The absolute restriction of classroom environments is terrible. It creates overwhelming sadness for the younger generation." }
    ];

    for (let i = 0; i < speechPositiveCount; i++) {
        const topicObj = topics[Math.floor(Math.random() * topics.length)];
        deck.push({
            id: `ms_${cardId++}`,
            type: CardType.SpeechPositive,
            title: `Speech: ${topicObj.topic}`,
            description: topicObj.positive,
            text: topicObj.positive
        });
    }

    for (let i = 0; i < speechNegativeCount; i++) {
        const topicObj = topics[Math.floor(Math.random() * topics.length)];
        deck.push({
            id: `ms_${cardId++}`,
            type: CardType.SpeechNegative,
            title: `Speech: ${topicObj.topic}`,
            description: topicObj.negative,
            text: topicObj.negative
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
