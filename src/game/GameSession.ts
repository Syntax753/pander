import { isClose } from "@/common/mathUtil";
import { applyHappinessChanges, AverageHappinessChangeCallback, calcAverageHappiness, DEFAULT_HAPPINESS, FindHappinessChangeCallback, findHappinessChangeDefault, findHappinessChangesForAudience, nameToHappinessFunction, SetHappinessCallback, FindHappinessChangeMatchCallback } from "./happinessUtil";
import { loadLevel } from "./levelFileUtil";
import AudienceMember from "./types/AudienceMember"
import Level, { duplicateLevel } from "./types/Level";
import WordUsageHistory from "./types/WordUsageHistory";
import { findWordCooldownFactor, updateWordUsageHistory, WordCooldownFactorCallback } from "./wordAnalysisUtil";

const _setHappinessNoOp: SetHappinessCallback = (_c: string, _h: number) => { console.warn('setHappiness() not bound in game session.'); }
const _averageHappinessChangeNoOp: AverageHappinessChangeCallback = (_h: number) => { console.warn('onAverageHappinessChange() not bound in game session.'); }

/*
 The GameSession instance handles loading levels and updating game state in response to player commands. It is strictly 
 decoupled from UI and I/O, relying on a caller to pass player input via methods, and subscribing UI components to respond
 as appropriate to published events indicating game state change. GameSession relies on no singletons and can operate headlessly.

 The lifetime of the GameSession instance is intended to be for a player's game, potentially spanning multiple levels and tracking
 cumulative stats.
*/
class GameSession {
  private _audienceMembers: AudienceMember[] = [];
  private _onSetHappiness: SetHappinessCallback = _setHappinessNoOp;
  private _onFindHappinessChange: FindHappinessChangeCallback = findHappinessChangeDefault;
  private _onAverageHappinessChange: AverageHappinessChangeCallback = _averageHappinessChangeNoOp;
  private _findHappinessFunctions: FindHappinessChangeCallback[] = [];
  private _averageHappiness: number = DEFAULT_HAPPINESS;
  private _wordUsageHistory: WordUsageHistory = {};

  constructor(onSetHappiness: SetHappinessCallback, onAverageHappinessChange: AverageHappinessChangeCallback) {
    this._onSetHappiness = onSetHappiness;
    this._onAverageHappinessChange = onAverageHappinessChange;
  }

  // Loads a level and sets session state to begin playing in it.
  async startLevel(levelId: string): Promise<Level> {
    const level = await loadLevel(levelId);
    this._audienceMembers = level.audienceMembers;
    this._onFindHappinessChange = nameToHappinessFunction(level.happinessFunctionName, this._findHappinessFunctions);
    const prevAverageHappiness = this._averageHappiness;
    this._averageHappiness = calcAverageHappiness(this._audienceMembers);
    this._wordUsageHistory = {};
    if (!isClose(prevAverageHappiness, this._averageHappiness)) this._onAverageHappinessChange(this._averageHappiness);
    return duplicateLevel(level);
  }

  // Receive a prompt of player text, make updates to game state, and publish corresponding events that may be received by UI components.
  async prompt(playerText: string, multiplier: number = 1, debug: boolean = false) {
    if (debug) {
      console.log(`[DEBUG] Speech Performed:\n"${playerText}"`);
    }

    const onWordCooldownFactor: WordCooldownFactorCallback = (word: string) => findWordCooldownFactor(word, this._wordUsageHistory);

    let hasMatch = false;
    let onMatchFactory: undefined | ((member: AudienceMember) => FindHappinessChangeMatchCallback);
    if (debug) {
      onMatchFactory = (member: AudienceMember) => (word: string, state: string, delta: number) => {
        hasMatch = true;
        const finalDelta = delta * multiplier;
        console.log(`[DEBUG] ${word} -> ${member.characterId} (${state}) ${finalDelta > 0 ? '+' : ''}${finalDelta.toFixed(2)}`);
      };
    }

    const happinessChanges = await findHappinessChangesForAudience(playerText, this._audienceMembers,
      this._onFindHappinessChange, onWordCooldownFactor, onMatchFactory);

    if (debug && !hasMatch) {
      console.log(`[DEBUG] No matches!`);
    }

    if (multiplier !== 1) {
      happinessChanges.forEach(change => change.happinessDelta *= multiplier);
    }

    updateWordUsageHistory(playerText, this._wordUsageHistory);
    this._averageHappiness = applyHappinessChanges(this._averageHappiness, happinessChanges, this._audienceMembers,
      this._onSetHappiness, this._onAverageHappinessChange);
  }

  /* Can be used to make custom happiness functions available for individual levels that override the default happiness function
     via a `* happinessFunction=` line in `levels.md`. Use to extend the engine to try out different ways of evaluating happiness, e.g.
     compare player text against a vector database. */
  bindFindHappinessFunctions(funcs: FindHappinessChangeCallback[]) {
    this._findHappinessFunctions = funcs;
  }

  get audienceMembers(): AudienceMember[] {
    return this._audienceMembers;
  }

  updateAudience(newAudience: AudienceMember[]): AudienceMember[] {
    this._audienceMembers = newAudience;

    // Recalculate average happiness based on new audience makeup
    const prevAverageHappiness = this._averageHappiness;
    this._averageHappiness = calcAverageHappiness(this._audienceMembers);
    if (!isClose(prevAverageHappiness, this._averageHappiness)) {
      this._onAverageHappinessChange(this._averageHappiness);
    }

    return this._audienceMembers;
  }
}

export default GameSession;