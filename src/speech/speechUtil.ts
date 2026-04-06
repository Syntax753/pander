import { Recognizer, setModelsBaseUrl } from 'sl-web-speech';
import { baseUrl } from "@/common/urlUtil";

export type StringCallback = (s:string) => void;

let theRecognizer:Recognizer|null = null;
let theIsSpeechEnabled = false;
let theInitSpeechPromise:Promise<boolean>|null = null;
let theLastPartial:string = '';
let theLastFinal:string = '';

/** Full transcript history — every finalized utterance, in order. Used for post-battle quality scoring. */
const theTranscriptHistory: { text:string, timestamp:number }[] = [];

function _onPartial(speech:string, onPromptFromSpeech:StringCallback) {
  if (speech === theLastPartial) return;
  theLastPartial = speech;
  console.log('[speech] partial:', speech);
  onPromptFromSpeech(speech);
}

function _onFinal(speech:string) {
  theLastFinal = speech;
  if (speech && speech.trim()) {
    theTranscriptHistory.push({ text: speech, timestamp: Date.now() });
    console.log('[speech] final:', speech);
  }
}

export function getTranscriptHistory(): { text:string, timestamp:number }[] {
  return [...theTranscriptHistory];
}

export function clearTranscriptHistory(): void {
  theTranscriptHistory.length = 0;
}

export async function initSpeech(onPromptFromSpeech:StringCallback, 
    onStopTalking:StringCallback):Promise<boolean> {
  if (theInitSpeechPromise) return theInitSpeechPromise;
  theInitSpeechPromise = new Promise<boolean>(async (resolve) => {

    function _onReady() {
      if (!theRecognizer) throw Error('Unexpected');
      theRecognizer.bindCallbacks(
        (speech) => _onPartial(speech, onPromptFromSpeech), 
        () => {}, 
        () => onStopTalking(theLastFinal),
        _onFinal
      );
      resolve(true);
    }

    const modelsUrl = baseUrl('/speech-models/');
    console.log('[speech] models base URL:', modelsUrl);
    setModelsBaseUrl(modelsUrl);
    try {
      theRecognizer = new Recognizer(() => {
        console.log('[speech] recognizer ready');
        _onReady();
      });
    } catch(e) {
      console.error('Error while initializing speech recognizer.', e);
      resolve(false);
    }
  });
  return theInitSpeechPromise;
}

export function isSpeechAvailable():boolean {
  return theRecognizer !== null;
}

export function isSpeechEnabled():boolean {
  return theIsSpeechEnabled;
}

export function toggleSpeech():boolean {
  if (!theRecognizer) return theIsSpeechEnabled;
  if (theIsSpeechEnabled) theRecognizer.mute();
  else theRecognizer.unmute();
  theIsSpeechEnabled = !theIsSpeechEnabled;
  return theIsSpeechEnabled;
}

export function enableSpeech() {
  if (!theRecognizer || theIsSpeechEnabled) return;
  theRecognizer.unmute();
  theIsSpeechEnabled = true;
}