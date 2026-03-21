# Pander Deck Configuration

This document outlines the speech cards currently implemented in the game and their exact sentiment breakdown. Each speech is meticulously crafted to hit exactly a 1/1/3 constraint relative to character preferences. 

## Speech Constraints
- **Positive Speech (`SpeechPositive`)**: Contains exactly 1 Loved word and 1 Liked word by the primary character archetype, and exactly 3 Hated/Disliked words strictly belonging to *different* archetypes. By matching these constraints, playing a Positive Speech correctly builds happiness with the target archetype while intentionally penalizing happiness amongst contrasting archetypes via collateral word usage.
- **Negative Speech (`SpeechNegative`)**: Contains exactly 1 Hated word and 1 Disliked word by the primary character archetype, and exactly 3 Loved/Liked words strictly belonging to *different* archetypes. By inverting the mechanics, a Negative Speech is *designed* to be hated by the target archetype, which correctly builds positive happiness amongst contrary archetypes who love those things.

## Speeches by Archetype

### 1. Plumber
**Positive**
> *"I have great respect for proper plumbing. Installing new faucets requires true skill and rejects all laziness. Unlike those who just collect taxes, you build infrastructure that matters. We can all appreciate a world free from the noise of broken systems."*
- **Affinities**: `plumbing` (Plumber Loves), `faucets` (Plumber Likes)
- **Alienations**: `laziness` (Jock/Mogger Dislike), `taxes` (Hodler Dislike), `noise` (Librarian/Artist/Cat Lady Dislike)

**Negative**
> *"Nobody wants to deal with raw sewage and its terrible odor. I prefer the joy of painting over such horrid tasks. Our human history offers much more value to society. Honestly, experiencing real teamwork is better than doing that job."*
- **Affinities**: `painting` (Artist Loves), `history` (Librarian Loves), `teamwork` (Jock Likes)
- **Alienations**: `sewage` (Plumber Hates), `odor` (Plumber Dislike)

### 2. Jock
**Positive**
> *"Building muscle requires intense dedication. Increasing your stamina is the ultimate goal. You stop worrying about silly taxes when you are focused. You escape the noise of life and fight off those wrinkles too."*
- **Affinities**: `muscle` (Jock Loves), `stamina` (Jock Likes)
- **Alienations**: `taxes` (Hodler Dislike), `noise` (Librarian Dislike), `wrinkles` (Mogger Hate)

**Negative**
> *"I despise the concept of suddenly quitting. Letting laziness win is a terrible choice. I would much rather share my knowledge with the world. Staring at a blank canvas or watching cats sounds far better."*
- **Affinities**: `knowledge` (Librarian Loves), `canvas` (Artist Loves), `cats` (Cat Lady Loves)
- **Alienations**: `quitting` (Jock Hates), `laziness` (Jock Dislike)

### 3. Librarian
**Positive**
> *"Gaining knowledge is the most noble pursuit. Reading in a quiet room brings me complete peace. It helps me forget about complex taxes and modern stress. Avoiding any physical injury keeps awful wrinkles far away."*
- **Affinities**: `knowledge` (Librarian Loves), `quiet` (Librarian Likes)
- **Alienations**: `taxes` (Hodler Dislike), `injury` (Jock Hate), `wrinkles` (Mogger Hate)

**Negative**
> *"The sheer thought of library theft makes my blood boil. Finding dirt on a precious edition is simply terrible. People should focus on building muscle instead of ruining text. I would prefer painting scenes or watching kittens over this mess."*
- **Affinities**: `muscle` (Jock Loves), `painting` (Artist Loves), `kittens` (Cat Lady Loves)
- **Alienations**: `theft` (Librarian Hates), `dirt` (Librarian Dislikes)

### 4. Clown
**Positive**
> *"Sharing laughter with a crowd is a beautiful thing. Performing good magic always lifts the spirit. We can ignore our taxes and just enjoy the show. A good mood prevents injury and smooths out wrinkles."*
- **Affinities**: `laughter` (Clown Loves), `magic` (Clown Likes)
- **Alienations**: `taxes` (Hodler Dislike), `injury` (Jock Hate), `wrinkles` (Mogger Hate)

**Negative**
> *"Dealing with constant misery is incredibly draining. Endless boredom is truly the enemy of joy. I would rather seek knowledge from a textbook. Honestly, focusing on muscle growth or an empty canvas sounds way better."*
- **Affinities**: `knowledge` (Librarian Loves), `muscle` (Jock Loves), `canvas` (Artist Loves)
- **Alienations**: `misery` (Clown Hates), `boredom` (Clown Dislike)

### 5. Cat Lady
**Positive**
> *"Playing with tiny kittens brings me absolute joy. Tossing a ball of yarn can entertain them for hours. They do not worry about taxes or financial burdens. Watching them prevents injury and magically erases wrinkles."*
- **Affinities**: `kittens` (Cat Lady Loves), `yarn` (Cat Lady Likes)
- **Alienations**: `taxes` (Hodler Dislike), `injury` (Jock Hate), `wrinkles` (Mogger Hate)

**Negative**
> *"Animal cruelty is an unforgivable offense. The constant noise of modern life scares my poor pets. People should focus on building muscle instead of causing harm. Expressing oneself on canvas or seeking knowledge are much better hobbies."*
- **Affinities**: `muscle` (Jock Loves), `canvas` (Artist Loves), `knowledge` (Librarian Loves)
- **Alienations**: `cruelty` (Cat Lady Hates), `noise` (Cat Lady Dislikes)

### 6. Mogger
**Positive**
> *"True aesthetics demand absolute commitment and focus. Maximizing your height is essential for respect. You must ignore trivial things like taxes and gossip. Avoiding injury and keeping away from dirt ensures peak performance."*
- **Affinities**: `aesthetics` (Mogger Loves), `height` (Mogger Likes)
- **Alienations**: `taxes` (Hodler Dislike), `injury` (Jock Hate), `dirt` (Librarian Dislike)

**Negative**
> *"Accepting natural aging is a mindset I completely reject. Settling for average results is a pathetic way to exist. I would rather admire a beautiful canvas than give up. Even raising kittens or hoarding knowledge makes more sense than yielding."*
- **Affinities**: `canvas` (Artist Loves), `kittens` (Cat Lady Loves), `knowledge` (Librarian Loves)
- **Alienations**: `aging` (Mogger Hates), `average` (Mogger Dislikes)

### 7. Artist
**Positive**
> *"Creative freedom is my ultimate inspiration. Standing in natural sunlight brings my visions to reality. It makes me forget about complex taxes and societal demands. The passion prevents emotional injury and smooths the wrinkles of stress."*
- **Affinities**: `freedom` (Artist Loves), `sunlight` (Artist Likes)
- **Alienations**: `taxes` (Hodler Dislike), `injury` (Jock Hate), `wrinkles` (Mogger Hate)

**Negative**
> *"I absolutely despise any creative restriction being placed upon me. Following a predictable routine destroys human imagination. I would rather focus on building muscle than conform to standard expectations. Seeking pure knowledge or raising kittens are far more worthwhile."*
- **Affinities**: `muscle` (Jock Loves), `knowledge` (Librarian Loves), `kittens` (Cat Lady Loves)
- **Alienations**: `restriction` (Artist Hates), `routine` (Artist Dislikes)

### 8. Hodler
**Positive**
> *"I truly believe decentralization is the absolute future. Securing long term profits requires serious dedication. This path helps us avoid financial injury across the board. It protects us from wrinkles and keeps our portfolios free of dirt."*
- **Affinities**: `decentralization` (Hodler Loves), `profits` (Hodler Likes)
- **Alienations**: `injury` (Jock Hate), `wrinkles` (Mogger Hate), `dirt` (Librarian Dislikes)

**Negative**
> *"The threat of malicious hackers keeps me awake at night. Runaway inflation slowly destroys our hard earned purchasing power. Honestly, I would rather focus on gaining muscle mass. Creating art on a canvas or just adopting kittens seems much safer."*
- **Affinities**: `muscle` (Jock Loves), `canvas` (Artist Loves), `kittens` (Cat Lady Loves)
- **Alienations**: `hackers` (Hodler Hates), `inflation` (Hodler Dislikes)

### 9. Ice Skater
**Positive**
> *"I am absolutely drawn to the glamour of the performance. Moving with perfect rhythm is an incredible feeling. It is a wonderful escape from taxes and normal life. We slide past the dirt and leave our wrinkles behind."*
- **Affinities**: `glamour` (Ice Skater Loves), `rhythm` (Ice Skater Likes)
- **Alienations**: `taxes` (Hodler Dislike), `dirt` (Librarian Dislike), `wrinkles` (Mogger Hate)

**Negative**
> *"I cannot stand when the gorgeous snow turns to slush. Wearing heavy clothing completely ruins my perfect mood. I would much rather stay inside and seek precious knowledge. Building muscle or simply feeding kittens sounds vastly superior."*
- **Affinities**: `knowledge` (Librarian Loves), `muscle` (Jock Loves), `kittens` (Cat Lady Loves)
- **Alienations**: `slush` (Ice Skater Hate), `heavy` (Ice Skater Dislike)

### 10. Barber
**Positive**
> *"Proper grooming changes how a person feels completely. It helps build a strong community among the patrons. You forget about stressful taxes when you are laughing. It prevents social injury and hides those frustrating wrinkles."*
- **Affinities**: `grooming` (Barber Loves), `community` (Barber Likes)
- **Alienations**: `taxes` (Hodler Dislike), `injury` (Jock Hate), `wrinkles` (Mogger Hate)

**Negative**
> *"Discovering lice is an absolute nightmare scenario. Dealing with brutal tangles is incredibly frustrating. I would prefer to stare at a blank canvas all day. Searching for knowledge or playing with tiny kittens is just better."*
- **Affinities**: `canvas` (Artist Loves), `knowledge` (Librarian Loves), `kittens` (Cat Lady Loves)
- **Alienations**: `lice` (Barber Hate), `tangles` (Barber Dislike)
