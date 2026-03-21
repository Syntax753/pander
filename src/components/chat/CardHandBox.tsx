import styles from './CardHandBox.module.css';
import { Card, CardType } from '@/decks/deckUtil';
import AudienceMember from '@/game/types/AudienceMember';
import { predictSpeechImpacts } from '@/game/happinessUtil';

type Props = {
    hand: Card[];
    deckCount: number;
    audienceMembers: AudienceMember[];
    onPlayCard: (card: Card) => void;
    onViewDeck: () => void;
    disabled?: boolean;
}

function CardHandBox({ hand, deckCount, audienceMembers, onPlayCard, onViewDeck, disabled }: Props) {
    return (
        <div className={styles.container}>
            <div className={styles.hand}>
                {hand.map((card, index) => {
                    const isCC = card.type === CardType.CrowdControl;
                    const isPositive = card.type === CardType.SpeechPositive;
                    const isNegative = card.type === CardType.SpeechNegative;

                    let cardStyle = styles.ccCard;
                    if (!isCC) {
                        cardStyle = isPositive ? styles.msPositiveCard : styles.msNegativeCard;
                    }

                    let impacts: { characterId: string, modifier: string }[] = [];
                    if ((isPositive || isNegative) && card.text) {
                        // The engine natively supports negative phrasing without the -1 multiplier, 
                        // so we pass False to isNegative for predictSpeechImpacts, because the text itself causes the hate!
                        impacts = predictSpeechImpacts(card.text, audienceMembers, false);
                    }

                    return (
                        <button
                            key={`${card.id}-${index}`}
                            className={`${styles.card} ${cardStyle}`}
                            onClick={() => onPlayCard(card)}
                            disabled={disabled}
                        >
                            <div className={styles.cardHeader}>
                                <span className={styles.cardType}>{isCC ? 'Crowd Control' : 'Speech'}</span>
                            </div>
                            <h3 className={styles.cardTitle}>{card.title}</h3>
                            <p className={styles.cardDescription}>{card.description}</p>

                            {impacts.length > 0 && (
                                <div className={styles.impactContainer}>
                                    {impacts.map((imp, idx) => (
                                        <span key={idx} className={`${styles.impactTag} ${imp.modifier.includes('-') ? styles.impactNeg : styles.impactPos}`}>
                                            {imp.characterId}s{imp.modifier}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>
            <div className={styles.deckInfo}>
                <button className={styles.viewDeckBtn} onClick={onViewDeck} disabled={disabled}>
                    View Deck
                </button>
                <div className={styles.deckCount}>
                    {deckCount} cards left
                </div>
            </div>
        </div>
    );
}

export default CardHandBox;
