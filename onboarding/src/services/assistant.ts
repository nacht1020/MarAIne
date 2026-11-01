import { GUIDE_SECTIONS } from '@/constants/guide';
import { getMunicipality, type MunicipalityId } from '@/constants/municipalities';
import { PLACES } from '@/constants/places';
import type { RoleId } from '@/constants/roles';
import { SAMPLE_DATA, ZONE_LOOK } from '@/constants/zones';

import { localAnswer } from './localAnswer';
import { supabase } from './supabase';
import { loadCachedZones } from './zones';

// Talks to the sea-guide Edge Function. The Claude API key stays on the server; the app sends the
// question, the recent conversation, and what it already knows (places, zones, rules) as plain text.

// The language the person chose at the start of the chat.
export type ChatLang = 'en' | 'tl';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

async function knowledge(): Promise<string> {
  const places = PLACES.map(
    (p) => `- ${p.name} (${p.kindLabel}, ${getMunicipality(p.town)?.name}): ${p.about} Tip: ${p.tip}`,
  ).join('\n');

  const cached = await loadCachedZones();
  const zones = cached?.zones.length
    ? cached.zones
        .map((z) => `- ${z.name}: ${ZONE_LOOK[z.type].label}. ${ZONE_LOOK[z.type].guidance}${z.reason ? ` Reason: ${z.reason}` : ''}`)
        .join('\n') + (SAMPLE_DATA ? '\n(These zone outlines are SAMPLE DATA, not official ordinances.)' : '')
    : 'Zone list not on this phone yet (it loads after signing in). Point people to the Map tab or the MAO.';

  const rules = GUIDE_SECTIONS.map(
    (s) => `${s.title}:\n${s.do.map((d) => `  Do: ${d}`).join('\n')}\n${s.dont.map((d) => `  Don't: ${d}`).join('\n')}`,
  ).join('\n');

  return [
    `Places in the app:\n${places}`,
    `Marine zones:\n${zones}`,
    `Visitor and coastal rules from the app's Guide:\n${rules}`,
    'Reporting: the Report screen sends reports of illegal or destructive fishing, commercial boats, pollution and habitat damage to Bantay Dagat and the MAO (needs a MarAIne account).',
  ].join('\n\n');
}

export interface AssistantReply {
  text: string;
  // 'ai': Claude through the sea-guide function. 'app': the phone's own answer from its data, used when
  // the AI can't be reached (not deployed yet, or no signal) so the chat always replies.
  source: 'ai' | 'app';
}

async function askAi(history: ChatTurn[], town: MunicipalityId | null, role: RoleId | null, lang: ChatLang): Promise<string> {
  if (!supabase) throw new Error('not configured');
  const { data, error } = await supabase.functions.invoke<{ reply?: string; error?: string }>('sea-guide', {
    body: { messages: history, town, role, lang, knowledge: await knowledge() },
  });
  if (error || !data?.reply) throw new Error(data?.error ?? 'unavailable');
  return data.reply;
}

export async function askAssistant(
  history: ChatTurn[],
  town: MunicipalityId | null,
  role: RoleId | null,
  lang: ChatLang,
): Promise<AssistantReply> {
  try {
    return { text: await askAi(history, town, role, lang), source: 'ai' };
  } catch {
    const question = history[history.length - 1]?.content ?? '';
    return { text: await localAnswer(question, town, role, lang), source: 'app' };
  }
}
