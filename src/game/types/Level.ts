import AudienceMember, { duplicateAudienceMember } from "./AudienceMember"

type Level = {
  audienceMembers: AudienceMember[],
  happinessFunctionName: string | null,
  cardCounts?: {
    CrowdControl: number;
    SpeechPositive: number;
    SpeechNegative: number;
  }
};

export function duplicateLevel(level: Level): Level {
  return {
    audienceMembers: level.audienceMembers.map(duplicateAudienceMember),
    happinessFunctionName: level.happinessFunctionName,
    cardCounts: level.cardCounts ? { ...level.cardCounts } : undefined
  }
}

export default Level;