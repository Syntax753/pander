import styles from './CardHandBox.module.css';
import { Card, CardType } from '@/decks/deckUtil';

type Props = {
    hand: Card[];
    deckCount: number;
    onPlayCard: (card: Card) => void;
    onViewDeck: () => void;
    disabled?: boolean;
}

function CardHandBox({ hand, deckCount, onPlayCard, onViewDeck, disabled }: Props) {
    return (
        <div className={styles.container}>
            <div className={styles.hand}>
                {hand.map((card, index) => {
                    const isCC = card.type === CardType.CrowdControl;
                    const isPositive = card.type === CardType.SpeechPositive;

                    let cardStyle = styles.ccCard;
                    if (!isCC) {
                        cardStyle = isPositive ? styles.msPositiveCard : styles.msNegativeCard;
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
