import styles from './DeckModal.module.css';
import { Card, CardType } from '@/decks/deckUtil';

type Props = {
    isOpen: boolean;
    deck: Card[];
    onClose: () => void;
}

function DeckModal({ isOpen, deck, onClose }: Props) {
    if (!isOpen) return null;

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <div className={styles.header}>
                    <h2>Remaining Deck ({deck.length} Cards)</h2>
                    <button className={styles.closeBtn} onClick={onClose}>&times;</button>
                </div>
                <div className={styles.cardList}>
                    {[...deck].reverse().map((card, idx) => {
                        const isCC = card.type === CardType.CrowdControl;
                        const isPositive = !isCC && card.title.includes('(Positive)');

                        let rowStyle = styles.rowCC;
                        if (!isCC) {
                            rowStyle = isPositive ? styles.rowMSPositive : styles.rowMSNegative;
                        }

                        return (
                            <div key={`${card.id}-${idx}`} className={`${styles.cardRow} ${rowStyle}`}>
                                <span className={styles.rowType}>{isCC ? 'CC' : 'Speech'}</span>
                                <span className={styles.rowTitle}>{card.title}</span>
                                <span className={styles.rowDesc}>{card.description}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export default DeckModal;
