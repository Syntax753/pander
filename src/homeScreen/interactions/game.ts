import { setHappiness } from "@/components/audienceView/audienceEventUtil";
import GameSession from "@/game/GameSession";
import { AverageHappinessChangeCallback } from "@/game/happinessUtil";
import { getDefaultLevelId } from "@/game/levelFileUtil";
import { appendRecentPrompt } from "@/persistence/recentPrompts";
import { assertNonNullable } from "decent-portal";
import { Card } from "@/decks/deckUtil";
import { loadAudienceMember } from "@/game/characterFileUtil";
import AudienceMember from "@/game/types/AudienceMember";

let theOnSetRecentPrompts: Function | null = null;
let theGameSession: GameSession | null = null;

export async function initGame(onSetRecentPrompts: Function, setAverageHappiness: AverageHappinessChangeCallback): Promise<string> {
  theOnSetRecentPrompts = onSetRecentPrompts;
  theGameSession = new GameSession(setHappiness, setAverageHappiness);
  const levelId = await getDefaultLevelId();
  return levelId;
}

export async function promptFromChatInput(playerText: string) {
  const recentPrompts = await appendRecentPrompt(playerText);
  if (theOnSetRecentPrompts) theOnSetRecentPrompts(recentPrompts);
  if (theGameSession) theGameSession.prompt(playerText);
}

export async function promptFromSpeech(playerText: string) {
  if (theGameSession) theGameSession.prompt(playerText);
}

export async function startLevel(levelId: string, setAudienceMembers: Function) {
  assertNonNullable(theGameSession);
  const level = await theGameSession.startLevel(levelId);
  setAudienceMembers([...level.audienceMembers]);
}

export async function playCrowdControlCard(card: Card, currentAudience: AudienceMember[], setAudienceMembers: Function) {
  if (!theGameSession || card.type !== 'CrowdControl') return;

  const newAudience = [...currentAudience];
  const targetCharId = card.targetCharacter!;
  const existingMember = newAudience.find(m => m.characterId === targetCharId);

  if (card.effectType === 'add') {
    if (existingMember) {
      existingMember.count += card.amount!;
    } else {
      const newMember = await loadAudienceMember(targetCharId);
      newMember.count = card.amount!;
      newAudience.push(newMember);
    }
  } else if (card.effectType === 'remove') {
    if (existingMember) {
      existingMember.count -= card.amount!;
      if (existingMember.count <= 0) {
        newAudience.splice(newAudience.indexOf(existingMember), 1);
      }
    }
  } else if (card.effectType === 'halve') {
    if (existingMember) {
      existingMember.count = Math.floor(existingMember.count / 2);
      if (existingMember.count <= 0) {
        newAudience.splice(newAudience.indexOf(existingMember), 1);
      }
    }
  } else if (card.effectType === 'double') {
    if (existingMember) {
      existingMember.count *= 2;
    }
  }

  theGameSession.updateAudience(newAudience);
  setAudienceMembers([...newAudience]);
}

export async function playSpeechCard(card: Card) {
  if (theGameSession && card.text) {
    const isNegative = card.type === 'SpeechNegative';
    const multiplier = isNegative ? -1 : 1;
    await theGameSession.prompt(card.text, multiplier);
  }
}