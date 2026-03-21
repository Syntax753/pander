import { useEffect, useState } from "react";

import styles from './HomeScreen.module.css';
import { init } from "./interactions/initialization";
import LoadScreen from '@/loadScreen/LoadScreen';
import TopBar from '@/components/topBar/TopBar';
import AboutDialog from "./dialogs/AboutDialog";
import MicrophonePermissionDialog from "@/homeScreen/dialogs/MicrophonePermissionDialog";
import CharacterSpriteset from "@/components/audienceView/types/CharacterSpriteset";
import AudienceView from "@/components/audienceView/AudienceView";
import AudienceMember from "@/game/types/AudienceMember";
import { enableSpeechAfterDialog } from "./interactions/speech";
import ChatInputBox from "@/components/chat/ChatInputBox";
import { isSpeechAvailable, toggleSpeech } from "@/speech/speechUtil";
import { promptFromChatInput, startLevel, playCrowdControlCard, playSpeechCard } from "./interactions/game";
import LevelSelector from "@/components/levelSelector/LevelSelector";
import HappinessMeter from "@/components/happinessMeter/HappinessMeter";
import { DEFAULT_HAPPINESS } from "@/game/happinessUtil";
import { Card, generateDeck, shuffleDeck, dealHand, drawCard } from "@/decks/deckUtil";
import CardHandBox from "@/components/chat/CardHandBox";
import DeckModal from "@/components/chat/DeckModal";

function HomeScreen() {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [modalDialogName, setModalDialogName] = useState<string | null>(null);
  const [characterSpriteset, setCharacterSpriteset] = useState<CharacterSpriteset | null>(null);
  const [isSpeechEnabled, setIsSpeechEnabled] = useState<boolean>(false);
  const [recentPrompts, setRecentPrompts] = useState<string[]>([]);
  const [audienceMembers, setAudienceMembers] = useState<AudienceMember[]>([]);
  const [levelId, setLevelId] = useState<string | null>(null);
  const [averageHappiness, setAverageHappiness] = useState<number>(DEFAULT_HAPPINESS);

  const [deck, setDeck] = useState<Card[]>([]);
  const [hand, setHand] = useState<Card[]>([]);
  const [isDeckModalOpen, setIsDeckModalOpen] = useState<boolean>(false);

  useEffect(() => {
    if (isLoading) return;

    init(setRecentPrompts, setAverageHappiness).then(initResults => {
      if (!initResults) { setIsLoading(true); return; }
      setCharacterSpriteset(initResults.characterSpriteset);
      setLevelId(initResults.levelId);
    });
  }, [isLoading]);

  useEffect(() => {
    if (levelId === null) return;
    startLevel(levelId, setAudienceMembers);

    if (levelId === 'Card Prototype') {
      const newDeck = shuffleDeck(generateDeck());
      const { hand: newHand, remainingDeck } = dealHand(newDeck, 5);
      setHand(newHand);
      setDeck(remainingDeck);
    } else {
      setHand([]);
      setDeck([]);
    }
  }, [levelId]);

  const handlePlayCard = (card: Card) => {
    if (card.type === 'MakeSpeech') {
      playSpeechCard(card);
    } else if (card.type === 'CrowdControl') {
      playCrowdControlCard(card, audienceMembers, setAudienceMembers);
    }

    const { card: newCard, remainingDeck } = drawCard(deck);
    setDeck(remainingDeck);

    setHand(prevHand => {
      const newHand = [...prevHand];
      const index = newHand.findIndex(c => c.id === card.id);
      if (index !== -1) {
        if (newCard) {
          newHand[index] = newCard;
        } else {
          newHand.splice(index, 1);
        }
      }
      return newHand;
    });
  };

  if (isLoading) return <LoadScreen onComplete={() => setIsLoading(false)} />;

  return (
    <div className={styles.container}>
      <TopBar onAboutClick={() => setModalDialogName(AboutDialog.name)} />
      <div className={styles.content}>
        <LevelSelector selectedLevelId={levelId} onSelect={setLevelId} />
        <AudienceView characterSpriteset={characterSpriteset} audienceMembers={audienceMembers} />
        {levelId === 'Card Prototype' ? (
          <CardHandBox hand={hand} onPlayCard={handlePlayCard} onViewDeck={() => setIsDeckModalOpen(true)} disabled={false} />
        ) : (
          <ChatInputBox recentPrompts={recentPrompts} onSubmit={promptFromChatInput} onToggleSpeech={() => {
            if (!isSpeechAvailable()) { setModalDialogName(MicrophonePermissionDialog.name); return; }
            setIsSpeechEnabled(toggleSpeech());
          }} isSpeechEnabled={isSpeechEnabled} />
        )}
      </div>
      <div className={styles.infoPanel}>
        <HappinessMeter happiness={averageHappiness} />
      </div>

      <AboutDialog
        isOpen={modalDialogName === AboutDialog.name}
        onClose={() => setModalDialogName(null)}
      />
      <MicrophonePermissionDialog
        isOpen={modalDialogName === 'MicrophonePermissionDialog'}
        onApprove={() => enableSpeechAfterDialog(setModalDialogName, setIsSpeechEnabled)}
        onCancel={() => setModalDialogName(null)}
      />
      <DeckModal
        isOpen={isDeckModalOpen}
        deck={deck}
        onClose={() => setIsDeckModalOpen(false)}
      />
    </div>
  );
}

export default HomeScreen;