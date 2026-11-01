import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

import type { ChatLang } from './assistant';

// Voice for the Ask chat. Reading answers aloud uses the phone's (or browser's) own text-to-speech,
// so it works offline. Listening uses the browser's speech recognition on web; native builds use the
// microphone on the keyboard instead, which needs no extra permission or module.

const LOCALE: Record<ChatLang, string> = { en: 'en-PH', tl: 'fil-PH' };

// Best voice per language, looked up once: a natural or enhanced one if the device has it.
const picked: Partial<Record<ChatLang, string | null>> = {};

async function voiceFor(lang: ChatLang): Promise<string | undefined> {
  if (picked[lang] !== undefined) return picked[lang] ?? undefined;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const prefix = lang === 'tl' ? ['fil', 'tl'] : ['en-PH', 'en'];
    const score = (v: Speech.Voice) =>
      (prefix.findIndex((p) => v.language.toLowerCase().startsWith(p.toLowerCase())) === 0 ? 4 : 0) +
      (/natural|online|neural/i.test(v.name) ? 2 : 0) +
      (v.quality === Speech.VoiceQuality.Enhanced ? 1 : 0);
    const matches = voices.filter((v) => prefix.some((p) => v.language.toLowerCase().startsWith(p.toLowerCase())));
    const best = matches.sort((a, b) => score(b) - score(a))[0];
    picked[lang] = best?.identifier ?? null;
  } catch {
    picked[lang] = null;
  }
  return picked[lang] ?? undefined;
}

export async function speak(text: string, lang: ChatLang, onDone: () => void) {
  Speech.stop();
  const voice = await voiceFor(lang);
  Speech.speak(text, { language: LOCALE[lang], voice, rate: 0.95, onDone, onStopped: onDone, onError: onDone });
}

export function stopSpeaking() {
  Speech.stop();
}

// ---- listening (web only) --------------------------------------------------

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}

function recognitionClass(): (new () => Recognition) | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const canListen = () => recognitionClass() !== null;

// Starts listening; `onText` gets the words so far (and `final` once the person stops talking).
// Returns a function that stops listening early.
export function listen(
  lang: ChatLang,
  handlers: { onText: (text: string, final: boolean) => void; onEnd: (error?: string) => void },
): () => void {
  const Rec = recognitionClass();
  if (!Rec) {
    handlers.onEnd('unsupported');
    return () => {};
  }
  const rec = new Rec();
  rec.lang = LOCALE[lang];
  rec.interimResults = true;
  rec.continuous = false;
  let heard = '';
  rec.onresult = (e) => {
    let text = '';
    let final = false;
    for (let i = 0; i < e.results.length; i++) {
      const r = e.results[i];
      if (!r) continue;
      text += r[0].transcript;
      if (r.isFinal) final = true;
    }
    heard = text.trim();
    handlers.onText(heard, final);
  };
  // The browser fires onerror and then onend; report only the first.
  let ended = false;
  const end = (error?: string) => {
    if (ended) return;
    ended = true;
    handlers.onEnd(error);
  };
  rec.onerror = (e) => end(e.error);
  rec.onend = () => end(heard ? undefined : 'no-speech');
  try {
    rec.start();
  } catch {
    end('busy');
  }
  return () => rec.stop();
}
