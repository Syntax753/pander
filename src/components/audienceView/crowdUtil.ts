import AudienceMember from "@/game/types/AudienceMember";
import CharacterSpriteset from "./types/CharacterSpriteset";
import CrowdDrawState from "./types/CrowdDrawState";
import { createCharacterDrawState, drawCharacter } from "./characterSpriteUtil";
import CharacterDrawState from "./types/CharacterDrawState";
import { assert } from "decent-portal";
import { UNSPECIFIED_RECT } from "@/drawing/types/Rect";
import { isClose } from "@/common/mathUtil";

type SeatingRequest = CharacterDrawState|null;

function _shuffleSeatingRequests(seatingRequests:SeatingRequest[]) {
  for (let i = seatingRequests.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap:SeatingRequest = seatingRequests[i];
    seatingRequests[i] = seatingRequests[j];
    seatingRequests[j] = swap;
  }
  return seatingRequests;
}

// Return a randomized array of seating requests and empty spaces. All requested audience members will be included in specified counts,
// with draw state initialized, but not yet having dest rects specified.
function _createSeatingRequests(characterSpriteset:CharacterSpriteset, audienceMembers:AudienceMember[], emptyPercent:number = .1):SeatingRequest[] {
  const seatingRequests:SeatingRequest[] = [];
  audienceMembers.forEach(audienceMember => {
    const bodyFrameCount = characterSpriteset.sprites[audienceMember.characterId].bodyRects.length;
    for(let i = 0; i < audienceMember.count; ++i) {
      const bodyFrameI = Math.floor(Math.random() * bodyFrameCount); 
      const characterDrawState = createCharacterDrawState(characterSpriteset, audienceMember.characterId, UNSPECIFIED_RECT, bodyFrameI, audienceMember.happiness);
      seatingRequests.push(characterDrawState);
    }
  });
  const emptySpaceCount = Math.round(seatingRequests.length * emptyPercent);
  for (let i = 0; i < emptySpaceCount; ++i) seatingRequests.push(null);
  _shuffleSeatingRequests(seatingRequests);
  return seatingRequests;
}

// Return a column count and row count sufficient seat the requested number of people and following the aspect ratio of the draw area.
function _calcColumnRowCount(seatingRequestCount:number, drawAreaWidth:number, drawAreaHeight:number):{columnCount:number, rowCount:number} {
  assert(seatingRequestCount > 0);
  assert(drawAreaWidth > 0);
  assert(drawAreaHeight > 0);
  const aspectRatio = drawAreaWidth / drawAreaHeight;
  const rowCount = Math.round(Math.sqrt(seatingRequestCount / aspectRatio));
  const columnCount = Math.ceil(seatingRequestCount / rowCount);
  return {columnCount, rowCount};
}

function _assignSeats(seatingRequests:SeatingRequest[], columnCount:number, rowCount:number, drawAreaWidth:number, drawAreaHeight:number, bodyWidth:number, bodyHeight:number):CharacterDrawState[] {
  const drawStates:CharacterDrawState[] = [];
  rowCount+=2; // Add empty rows at the back to leave room for sprites to extend into this area.
  const seatWidth = drawAreaWidth / columnCount;
  const seatHeight = drawAreaHeight / rowCount;
  const oddRowStaggerWidth = seatWidth * 0.25, evenRowStaggerWidth = -oddRowStaggerWidth;
  const h = Math.round(seatHeight * 1.5); // allow characters to be slightly taller than their seat (50% of previous size for mobile).
  const w = Math.round(bodyWidth * h / bodyHeight); // keep aspect ratio of body intact.
  let seatY = seatHeight;
  
  let emptyBackRowSeatSkipCount = (columnCount * rowCount) - seatingRequests.length;
  for(let rowI = 0; rowI < rowCount; ++rowI) {
    const staggerWidth = (rowI % 2 === 0) ? evenRowStaggerWidth : oddRowStaggerWidth;
    let seatX = staggerWidth;
    for(let colI = 0; colI < columnCount; ++colI) {
      if (emptyBackRowSeatSkipCount > 0) {
        --emptyBackRowSeatSkipCount;
        seatX += seatWidth;
        continue;
      }
      const seatingRequest = seatingRequests.pop();
      if (seatingRequest) {
        const x = seatX - ((w - seatWidth) * .5);
        const y = seatY - h;
        seatingRequest.destRect = {x, y, w, h};
        drawStates.push(seatingRequest);
      }
      seatX += seatWidth;
    }
    seatY += seatHeight;
  }
  return drawStates;
}

function _findBodyWidthHeight(characterSpriteset:CharacterSpriteset):{bodyWidth:number, bodyHeight:number} {
  const characterIds = Object.keys(characterSpriteset.sprites);
  assert(characterIds.length > 0);
  const sprite = characterSpriteset.sprites[characterIds[0]];
  assert(sprite.bodyRects.length > 0);
  const bodyWidth = sprite.bodyRects[0].w;
  const bodyHeight = sprite.bodyRects[0].h;
  return { bodyWidth, bodyHeight };
}

export function createCrowdDrawState(characterSpriteset:CharacterSpriteset, audienceMembers:AudienceMember[], drawAreaWidth:number, drawAreaHeight:number):CrowdDrawState {
  const seatingRequests = _createSeatingRequests(characterSpriteset, audienceMembers);
  if (!seatingRequests.length) return { characterDrawStates:[] };
  const { bodyWidth, bodyHeight } = _findBodyWidthHeight(characterSpriteset);

  const {columnCount, rowCount} = _calcColumnRowCount(seatingRequests.length, drawAreaWidth, drawAreaHeight);
  const characterDrawStates = _assignSeats(seatingRequests, columnCount, rowCount, drawAreaWidth, drawAreaHeight, bodyWidth, bodyHeight);
  
  return { characterDrawStates };
}

export function drawCrowd(crowdDrawState:CrowdDrawState, context:CanvasRenderingContext2D) {
  crowdDrawState.characterDrawStates.forEach(characterDrawState => drawCharacter(characterDrawState, context));
}

export function updateCharacterHappiness(characterId:string, triggerWord:string, happiness:number, crowdDrawState:CrowdDrawState|null) {
  if (!crowdDrawState) return;
  const now = performance.now();
  crowdDrawState.characterDrawStates.forEach(characterDrawState => {
    if (characterDrawState.sprite.id !== characterId || isClose(happiness, characterDrawState.happiness)) return;
    characterDrawState.isNextFlashPositive = happiness >= characterDrawState.happiness;
    characterDrawState.happiness = happiness;
    characterDrawState.nextMoodIconDisplayTime = now;
    characterDrawState.nextBodyFrameChangeTime = now;
    characterDrawState.nextFlashTime = now;
    characterDrawState.nextFlashText = triggerWord;
  });
}