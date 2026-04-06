import { applyHappinessChanges, AverageHappinessChangeCallback, calcAverageHappiness, DEFAULT_HAPPINESS,
    findHappinessChangesForAudience, SetHappinessCallback } from "./happinessUtil";
import { loadLevel } from "./levelFileUtil";
import AudienceMember from "./types/AudienceMember";
import Level, { duplicateLevel } from "./types/Level";
import WordUsageHistory from "./types/WordUsageHistory";
import { findWordCooldownFactor, updateWordUsageHistory, WordCooldownFactorCallback } from "./wordAnalysisUtil";
import { createDeckForLevel, DeckChangedCallback, getActiveCard, isEndOfDeck, updateCardFromPrompt } from "./deckUtil";
import Deck, { duplicateDeck } from "./types/cards/Deck";
import Card from "./types/cards/Card";
import { calcTurnScore, TurnScore } from "./battleScoringUtil";


const ROUNDS_PER_PLAYER = 3;
const TURN_DURATION_MS = 30000;

export type BattlePlayer = {
  name: string;
  score: number;
  isLocal: boolean;
};

export type TurnEndCallback = (playerIndex: number, turnScore: TurnScore) => void;
export type BattleEndCallback = (players: BattlePlayer[], winnerIndex: number) => void;
export type TurnChangedCallback = (activePlayerIndex: number, card: Card | null, turnNumber: number, totalTurns: number) => void;

class BattleSession {
  private _audienceMembers: AudienceMember[] = [];
  private _onSetHappiness: SetHappinessCallback;
  private _onAverageHappinessChange: AverageHappinessChangeCallback;
  private _onDeckChanged: DeckChangedCallback;
  private _onTurnEnd: TurnEndCallback;
  private _onBattleEnd: BattleEndCallback;
  private _onTurnChanged: TurnChangedCallback;
  private _averageHappiness: number = DEFAULT_HAPPINESS;
  private _wordUsageHistory: WordUsageHistory = {};
  private _deck: Deck = { cards: [], activeCardNo: 0, score: 0 };
  private _cardPlayerTexts: string[] = [];
  private _players: BattlePlayer[] = [];
  private _activePlayerIndex: number = 0;
  private _turnNumber: number = 0;
  private _totalTurns: number = ROUNDS_PER_PLAYER * 2;
  private _turnTimer: ReturnType<typeof setTimeout> | null = null;
  private _isBattleOver: boolean = false;
  private _singlePlayerMode: boolean = false;

  constructor(
    onSetHappiness: SetHappinessCallback,
    onAverageHappinessChange: AverageHappinessChangeCallback,
    onDeckChanged: DeckChangedCallback,
    onTurnEnd: TurnEndCallback,
    onBattleEnd: BattleEndCallback,
    onTurnChanged: TurnChangedCallback,
  ) {
    this._onSetHappiness = onSetHappiness;
    this._onAverageHappinessChange = onAverageHappinessChange;
    this._onDeckChanged = onDeckChanged;
    this._onTurnEnd = onTurnEnd;
    this._onBattleEnd = onBattleEnd;
    this._onTurnChanged = onTurnChanged;
  }

  get players(): BattlePlayer[] { return this._players; }
  get activePlayerIndex(): number { return this._activePlayerIndex; }
  get turnNumber(): number { return this._turnNumber; }
  get totalTurns(): number { return this._totalTurns; }
  get averageHappiness(): number { return this._averageHappiness; }
  get isBattleOver(): boolean { return this._isBattleOver; }

  /** Single-player mode: the active player plays through the entire deck without alternating turns. */
  setSinglePlayerMode(activePlayerIndex: number = 0) {
    this._singlePlayerMode = true;
    this._activePlayerIndex = activePlayerIndex;
  }

  async startBattle(levelId: string, player1Name: string, player2Name: string): Promise<Level> {
    this._players = [
      { name: player1Name, score: 0, isLocal: true },
      { name: player2Name, score: 0, isLocal: true },
    ];

    const level = await loadLevel(levelId);
    this._audienceMembers = level.audienceMembers;
    this._averageHappiness = calcAverageHappiness(this._audienceMembers);
    this._wordUsageHistory = {};
    this._deck = await createDeckForLevel(level);
    this._totalTurns = this._singlePlayerMode
      ? this._deck.cards.length
      : Math.min(ROUNDS_PER_PLAYER * 2, this._deck.cards.length);
    this._turnNumber = 0;
    if (!this._singlePlayerMode) this._activePlayerIndex = 0;
    this._isBattleOver = false;

    this._onDeckChanged(this._deck);
    this._onAverageHappinessChange(this._averageHappiness);
    this._startTurn();

    return duplicateLevel(level);
  }

  private _startTurn() {
    this._cardPlayerTexts = [];
    this._wordUsageHistory = {};

    const card = getActiveCard(this._deck);
    this._onTurnChanged(this._activePlayerIndex, card, this._turnNumber, this._totalTurns);
    this._onDeckChanged(duplicateDeck(this._deck));

    this._turnTimer = setTimeout(() => this.endTurn(), TURN_DURATION_MS);
  }

  async prompt(playerText: string) {
    if (this._isBattleOver) return;

    const onWordCooldownFactor: WordCooldownFactorCallback = (word: string) =>
      findWordCooldownFactor(word, this._wordUsageHistory);

    let happinessChanges = await findHappinessChangesForAudience(
      playerText, this._audienceMembers, onWordCooldownFactor
    );
    updateWordUsageHistory(playerText, this._wordUsageHistory);

    const activeCard = getActiveCard(this._deck);
    if (activeCard) {
      const { didCardChange, happinessChanges: cardHappinessChanges } =
        updateCardFromPrompt(playerText, activeCard);
      if (didCardChange) this._onDeckChanged(duplicateDeck(this._deck));
      if (cardHappinessChanges.length > 0) {
        happinessChanges = happinessChanges.concat(cardHappinessChanges);
      }
    }

    this._averageHappiness = applyHappinessChanges(
      this._averageHappiness, happinessChanges, this._audienceMembers,
      this._onSetHappiness, this._onAverageHappinessChange
    );

    this._cardPlayerTexts.push(playerText);
  }

  endTurn() {
    if (this._isBattleOver) return;
    if (this._turnTimer) {
      clearTimeout(this._turnTimer);
      this._turnTimer = null;
    }

    const activeCard = getActiveCard(this._deck);
    if (activeCard) {
      const turnScore = calcTurnScore(activeCard, this._averageHappiness, this._cardPlayerTexts);
      this._players[this._activePlayerIndex].score += turnScore.totalScore;
      this._onTurnEnd(this._activePlayerIndex, turnScore);
    }

    this._turnNumber++;

    if (this._turnNumber >= this._totalTurns || isEndOfDeck(this._deck)) {
      this._endBattle();
      return;
    }

    // Advance to next card and switch player
    this._deck = duplicateDeck(this._deck);
    this._deck.activeCardNo++;
    if (!this._singlePlayerMode) {
      this._activePlayerIndex = this._activePlayerIndex === 0 ? 1 : 0;
    }
    this._startTurn();
  }

  private _endBattle() {
    this._isBattleOver = true;
    const winnerIndex = this._players[0].score >= this._players[1].score ? 0 : 1;
    this._onBattleEnd([...this._players], winnerIndex);
  }

  getTurnTimeRemaining(): number {
    return TURN_DURATION_MS;
  }

  destroy() {
    if (this._turnTimer) {
      clearTimeout(this._turnTimer);
      this._turnTimer = null;
    }
  }
}

export { TURN_DURATION_MS };
export default BattleSession;
