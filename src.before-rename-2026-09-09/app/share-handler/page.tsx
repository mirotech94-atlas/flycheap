import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Web Share Target landing — invoked by the OS when the user shares a URL/text
// to the installed PWA. We parse common airline/OTA URLs into a tracked-search
// prefill and redirect to /searches?origin=…&depart=…&return=… which the
// search form picks up.
//
// Recognized patterns (best-effort):
//   - Aviasales / kiwi / google flights / kayak / momondo URLs with iata codes
//     and ISO dates somewhere in the query string.
//   - Plain text mentions of "JFK → CAI Jul 7 → Aug 28" via natural-language
//     extraction (regex only — no LLM).
const IATA = /\b([A-Z]{3})\b/g;
const ISO_DATE = /\b(\d{4}-\d{2}-\d{2})\b/g;

function parse(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const iata = Array.from(text.matchAll(IATA)).map(m => m[1]).filter(c => c !== 'USD' && c !== 'GMT' && c !== 'UTC');
  const dates = Array.from(text.matchAll(ISO_DATE)).map(m => m[1]).sort();
  if (iata[0]) out.origin = iata[0];
  if (iata[1]) out.destination = iata[1];
  if (dates[0]) out.depart = dates[0];
  if (dates[1]) out.return = dates[1];
  return out;
}

export default async function ShareHandler({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const pick = (k: string) => Array.isArray(params[k]) ? params[k]![0] : (params[k] as string | undefined);
  const blob = [pick('title'), pick('text'), pick('url')].filter(Boolean).join(' ');
  const parsed = parse(blob);

  // Build a /searches URL the SearchForm can read.
  const dest = new URL('/searches', 'https://example.com');
  for (const [k, v] of Object.entries(parsed)) dest.searchParams.set(k, v);
  dest.searchParams.set('from_share', '1');
  redirect(dest.pathname + dest.search);
}
