// MarAIne "Ask" assistant. Supabase Edge Function (Deno) that answers questions about sea and
// weather conditions, snorkeling and diving spots, rules and do's and don'ts around Marinduque.
//
// The model key lives only here, as a Supabase secret; the app never sees it. Either provider works:
//   Claude: ANTHROPIC_API_KEY (used when set)
//   Gemini: GEMINI_API_KEY from Google AI Studio, optional GEMINI_MODEL (default gemini-3.6-flash, falls back to gemini-3.5-flash-lite)
// Answers are grounded: this function fetches the live forecast itself, and the app sends the places,
// zones and rules it already shows. The model is told to say when something is not in that context.
//
// Deploy: npx supabase functions deploy sea-guide --no-verify-jwt
// Secret: npx supabase secrets set GEMINI_API_KEY=...   (or ANTHROPIC_API_KEY=...)

import Anthropic from "npm:@anthropic-ai/sdk";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Same offshore points as the app (onboarding/src/constants/municipalities.ts).
const TOWNS: Record<string, { name: string; lat: number; lng: number }> = {
  boac: { name: "Boac", lat: 13.45, lng: 121.78 },
  buenavista: { name: "Buenavista", lat: 13.2, lng: 121.94 },
  gasan: { name: "Gasan", lat: 13.32, lng: 121.8 },
  mogpog: { name: "Mogpog", lat: 13.54, lng: 121.86 },
  "santa-cruz": { name: "Santa Cruz", lat: 13.55, lng: 122.08 },
  torrijos: { name: "Torrijos", lat: 13.32, lng: 122.14 },
};

// Frozen, so it caches. Everything that changes per request goes in the user turn instead.
const SYSTEM = `You are "Ask MarAIne", the helper inside MarAIne, a coastal app for Marinduque, Philippines.
People who use it: fisherfolk, seaweed and fish-cage farmers, Bantay Dagat and barangay officials, residents, and tourists.

What you help with:
- Sea and weather: whether it is a good day to go out, wind, waves, and whether rough seas or a storm may be coming.
- Places: beaches, islands and reefs, including where snorkeling or diving is possible.
- Rules and do's and don'ts: marine sanctuaries, restricted zones, protecting coral and sea turtles, trash, boat safety.
- Anything else about using the sea in Marinduque safely and responsibly, and how to use MarAIne (Log, Catches, Map, Report, Farm, Patrols, Places, Guide).

How to answer:
- Use only the facts in the CONTEXT block of the user's message for forecasts, places, zones and rules. If the answer is not there, say you do not have that information and say who would know (PAGASA for weather warnings, the MAO, Bantay Dagat, the barangay hall, the municipal tourism office, a licensed dive operator).
- Never invent numbers, prices, schedules, phone numbers, laws, or dive sites. Do not claim a place is a dive site unless the context says it has reefs for snorkeling or diving.
- The forecast is a computer model, not an official warning. You cannot see PAGASA bulletins or storm surge warnings. When asked about storms or storm surge, describe what the forecast shows, then tell the person to check PAGASA and follow their LGU and the Coast Guard. If waves or gusts are high, say plainly that small boats should stay ashore.
- Sea words: below 0.5 m calm, 0.5-1.25 m slight, 1.25-2.5 m moderate (small boats take care), 2.5 m and above rough (small boats should not go out).
- Reply in the language named in the CONTEXT block ("Reply language"). The person chose it at the start of the chat.
- Use simple, everyday words that someone with little schooling understands. Short sentences. No hard or technical words; if you must use one (like "storm surge" or "sanctuary"), say what it means in a few plain words.
- Keep it short and practical: a direct answer first, then at most a few short points. Plain text, no tables, no headings, no emoji.
- Be warm and friendly, like a kind neighbor who knows the sea: greet back when greeted, thank people for caring about the reefs or for reporting, encourage first-time visitors, and end safety answers with a short caring line such as "Ingat sa laot!" or "Stay safe out there!". Stay honest: friendliness never softens a safety warning.
- Never shame anyone. For possible violations say "for review" or "report it to Bantay Dagat", not "illegal fisher" or "violator".`;

type Turn = { role: "user" | "assistant"; content: string };

const MAX_TURNS = 12;
const MAX_CHARS = 1500;

async function getJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

const max = (xs: unknown) => {
  const nums = Array.isArray(xs) ? xs.filter((x): x is number => typeof x === "number") : [];
  return nums.length ? Math.max(...nums) : null;
};

// Live forecast for one town: now, and the worst of the next 48 hours.
async function forecast(townId: string): Promise<string> {
  const t = TOWNS[townId];
  if (!t) return "No town chosen, so no forecast. Ask the person which town they are near.";
  const at = `latitude=${t.lat}&longitude=${t.lng}&timezone=Asia%2FManila&forecast_days=2`;
  try {
    const [marine, weather] = await Promise.all([
      getJson(`https://marine-api.open-meteo.com/v1/marine?${at}&current=wave_height,wave_period&hourly=wave_height`),
      getJson(
        `https://api.open-meteo.com/v1/forecast?${at}&current=wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation,weather_code,temperature_2m` +
          "&hourly=wind_gusts_10m,precipitation,precipitation_probability&daily=sunrise,sunset,precipitation_probability_max,precipitation_sum,weather_code&wind_speed_unit=kmh",
      ),
    ]);
    const mc = (marine.current ?? {}) as Record<string, number | null>;
    const wc = (weather.current ?? {}) as Record<string, number | null>;
    const mh = (marine.hourly ?? {}) as Record<string, unknown>;
    const wh = (weather.hourly ?? {}) as Record<string, unknown>;
    const daily = (weather.daily ?? {}) as Record<string, string[]>;
    return [
      `Forecast for the sea off ${t.name} (Open-Meteo model, not an official warning):`,
      `Now: waves ${mc.wave_height ?? "unknown"} m (period ${mc.wave_period ?? "unknown"} s), wind ${wc.wind_speed_10m ?? "unknown"} km/h from ${wc.wind_direction_10m ?? "?"} degrees, gusts ${wc.wind_gusts_10m ?? "unknown"} km/h, rain ${wc.precipitation ?? 0} mm.`,
      `Next 48 hours: highest waves ${max(mh.wave_height) ?? "unknown"} m, strongest gusts ${max(wh.wind_gusts_10m) ?? "unknown"} km/h, heaviest hourly rain ${max(wh.precipitation) ?? "unknown"} mm.`,
      `Sky now: WMO weather code ${wc.weather_code ?? "unknown"} (0 clear, 1-3 cloud, 45-48 fog, 51-57 drizzle, 61-67 rain, 80-82 showers, 95-99 thunderstorm), air ${wc.temperature_2m ?? "?"} °C.`,
      `Rain: chance today up to ${(daily.precipitation_probability_max as unknown as number[] | undefined)?.[0] ?? "unknown"}%, total today about ${(daily.precipitation_sum as unknown as number[] | undefined)?.[0] ?? "unknown"} mm. Hourly rain chance from now: ${Array.isArray(wh.precipitation_probability) ? (wh.precipitation_probability as number[]).slice(0, 24).map((p, i) => `${String(i).padStart(2, "0")}h:${p}%`).join(" ") : "unknown"} (hours are 00-23 today).`,
      `Sunrise ${daily.sunrise?.[0]?.split("T")[1] ?? "?"}, sunset ${daily.sunset?.[0]?.split("T")[1] ?? "?"}.`,
    ].join("\n");
  } catch {
    return `The forecast for ${t.name} could not be loaded right now. Say so and suggest checking PAGASA.`;
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  let body: { messages?: Turn[]; town?: string; role?: string; lang?: string; knowledge?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }

  // Keep requests small: the function is open to app users who are not signed in (tourists).
  const history = (body.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  if (history.length === 0 || history[history.length - 1]!.role !== "user") return json({ error: "Send a question." }, 400);
  while (history[0] && history[0].role !== "user") history.shift();

  const now = new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "full", timeStyle: "short" });
  const context = [
    "CONTEXT (from the MarAIne app and live data; use only this for facts):",
    `Date and time in Marinduque: ${now}.`,
    `Reply language: ${body.lang === "tl" ? "Filipino (Tagalog), simple everyday words" : "English, simple everyday words"}.`,
    `The person's role: ${body.role ?? "not set"}.`,
    await forecast(body.town ?? ""),
    (body.knowledge ?? "").slice(0, 12_000),
    "END CONTEXT",
  ].join("\n\n");

  // The live context rides on the newest question, so earlier turns and the system prompt stay cacheable.
  const last = history[history.length - 1]!;
  const messages: Turn[] = [...history.slice(0, -1), { role: "user", content: `${context}\n\nQuestion: ${last.content}` }];

  const ask = Deno.env.get("ANTHROPIC_API_KEY") ? askClaude : Deno.env.get("GEMINI_API_KEY") ? askGemini : null;
  if (!ask) return json({ error: "The assistant is not set up yet." }, 503);

  try {
    const reply = await ask(messages);
    if (reply === REFUSED) {
      return json({ reply: "I can't help with that one. Ask me about the sea, weather, places, or the rules around Marinduque." });
    }
    return json({ reply: reply || "Sorry, I don't have an answer for that. Try asking another way." });
  } catch (error) {
    const status = error instanceof Anthropic.APIError || error instanceof GeminiError ? error.status : undefined;
    if (status === 429) return json({ error: "Too many questions right now. Try again in a minute." }, 429);
    console.error("Model API error", status, error instanceof Error ? error.message : error);
    return json({ error: "The assistant is unavailable right now." }, status ? 502 : 500);
  }
});

const REFUSED = "\u0000refused";

async function askClaude(messages: Turn[]): Promise<string> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" }, // short chat answers
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages,
  });
  if (response.stop_reason === "refusal") return REFUSED;
  return response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

class GeminiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Google AI Studio (Gemini API) over plain REST, so no extra package is needed. The main model answers
// best; when it is slow, busy or unavailable (free keys often are), the fast lite model answers instead.
// Measured on the free tier (Oct 2026): 3.6-flash about 6 s, 3.5-flash-lite under 1 s; 3.7/3.8-flash timed out.
async function askGemini(messages: Turn[]): Promise<string> {
  const models = [Deno.env.get("GEMINI_MODEL") || "gemini-3.6-flash", "gemini-3.5-flash-lite"];
  let lastError: unknown;
  for (const [i, model] of models.entries()) {
    try {
      return await geminiOnce(model, messages, i === 0 ? 25_000 : 20_000);
    } catch (error) {
      lastError = error;
      const retry = !(error instanceof GeminiError) || error.status === 404 || error.status === 429 || error.status >= 500;
      if (!retry) throw error;
      console.error("Gemini model failed, trying the next one", model, error instanceof Error ? error.message : error);
    }
  }
  throw lastError;
}

async function geminiOnce(model: string, messages: Turn[], timeoutMs: number): Promise<string> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": Deno.env.get("GEMINI_API_KEY")! },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: 4000 },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new GeminiError(res.status, (await res.text()).slice(0, 300));
  const data = await res.json();
  if (data.promptFeedback?.blockReason) return REFUSED;
  const candidate = data.candidates?.[0];
  if (candidate?.finishReason === "SAFETY") return REFUSED;
  return ((candidate?.content?.parts ?? []) as { text?: string; thought?: boolean }[])
    .filter((p) => p.text && !p.thought)
    .map((p) => p.text)
    .join("")
    .trim();
}
