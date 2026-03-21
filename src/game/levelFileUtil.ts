/* This module intentionally reads from files every time instead of 
   storing to data structures so that changes to files in the middle 
   of a game session can be applied without reloading the app. */

import { parseNameValueLines, parseSections } from "@/common/markdownUtil";
import { baseUrl } from "@/common/urlUtil";
import Level from "./types/Level";
import { loadAudienceMember } from "./characterFileUtil";
import AudienceMember from "./types/AudienceMember";

async function _getLevelsText(): Promise<string> {
  const response = await fetch(baseUrl('/levels/levels.md'));
  return await response.text();
}

export async function getLevelIds(): Promise<string[]> {
  const levelsText = await _getLevelsText();
  const sections = parseSections(levelsText);
  const sectionNames = Object.keys(sections).filter(sectionName => sectionName !== 'General');
  return sectionNames;
}

export async function loadLevel(levelId: string): Promise<Level> {
  const levelsText = await _getLevelsText();
  const sections = parseSections(levelsText);
  const levelSection = sections[levelId];
  if (!levelSection) throw Error(`Did not find "${levelId}" section in levels.md`);
  const nameValuePairs = parseNameValueLines(levelSection);

  const level: Level = { audienceMembers: [], happinessFunctionName: nameValuePairs.happinessFunction || null };
  const parsedCC = parseInt(nameValuePairs.CrowdControl);
  const parsedSP = parseInt(nameValuePairs.SpeechPositive);
  const parsedSN = parseInt(nameValuePairs.SpeechNegative);

  const cardCounts = {
    CrowdControl: isNaN(parsedCC) ? 50 : parsedCC,
    SpeechPositive: isNaN(parsedSP) ? 25 : parsedSP,
    SpeechNegative: isNaN(parsedSN) ? 25 : parsedSN,
  };
  level.cardCounts = cardCounts;

  const characterIds = Object.keys(nameValuePairs).filter(id => !['happinessFunction', 'CrowdControl', 'SpeechPositive', 'SpeechNegative'].includes(id));
  for (let i = 0; i < characterIds.length; ++i) {
    const characterId = characterIds[i];
    try {
      const audienceMember: AudienceMember = await loadAudienceMember(characterId);
      audienceMember.count = parseInt(nameValuePairs[characterId]);
      level.audienceMembers.push(audienceMember);
    } catch (err) {
      console.error(`Could not load "${characterId}" from characters.md. Skipping.`);
    }
  }
  return level;
}

export async function getDefaultLevelId(): Promise<string> {
  const levelsText = await _getLevelsText();
  const lines = levelsText.split('\n');
  for (let i = 0; i < lines.length; ++i) {
    const trimmedLine = lines[i].trim();
    if (trimmedLine.startsWith('# ')) {
      const sectionName = trimmedLine.slice(2).trim();
      if (sectionName !== 'General') return sectionName;
    }
  }
  throw new Error('No levels defined in levels.md.');
}
