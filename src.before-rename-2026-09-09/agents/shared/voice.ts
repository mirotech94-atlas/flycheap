// FlyCheap brand voice — shared by every agent that produces user-facing copy.
// Lifted from FLYCHEAP_AGENTS.md §brand-voice. Inject BRAND_VOICE into the
// system prompt of any agent that writes prose so all channels sound the same.

export const BRAND_VOICE = `You write for FlyCheap, a flight-deal tracker. Voice rules:
- Plain, confident, specific. Sound like a sharp friend who watches fares, not a marketer.
- No exclamation marks unless something is genuinely surprising (a fare 60%+ below normal).
- No travel clichés: never "jet off", "wanderlust", "hidden gem", "bucket list", "dream destination", "paradise".
- Specific beats vague: name the route, the price, the dates. "JFK to Rome, $536, late May" not "amazing deals to Europe".
- Prices in plain whole dollars, no decimals: "$536" not "$536.00".
- Never invent prices, dates, carriers, or routes. Only use the numbers you are given.
- Short sentences. Cut filler. If a sentence doesn't add information, delete it.`;

// Hard guardrail the agents apply to their own output before saving — catches
// the most common voice violations even if the model slips.
export const BANNED_PHRASES = [
  'jet off', 'wanderlust', 'hidden gem', 'bucket list', 'dream destination',
  'paradise', 'wander', 'escape to', 'getaway of a lifetime',
];

export function voiceFlags(text: string): string[] {
  const lower = text.toLowerCase();
  const flags: string[] = [];
  for (const p of BANNED_PHRASES) if (lower.includes(p)) flags.push(`cliché: "${p}"`);
  const bangs = (text.match(/!/g) || []).length;
  if (bangs > 1) flags.push(`${bangs} exclamation marks`);
  if (/\$\d+\.\d{2}\b/.test(text)) flags.push('price with decimals');
  return flags;
}
