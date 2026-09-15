import 'server-only';
import type { CandidateDeal } from '../shared/types';

// Deal verifier (phase 1). Deterministic sanity gate the curator runs over each
// pick before saving. We intentionally do NOT do a live HTTP HEAD against the
// booking deep-link: EgyptAir's IBE and Aviasales reject/redirect bare
// deep-links (established earlier — see /go handling), so a HEAD check produces
// false negatives. Instead we verify the pick against the live cache pool it
// was drawn from + basic plausibility. A later phase can add a real price
// re-quote against the provider API.

export type VerifyVerdict = { verified: boolean; note: string };

export function verifyPick(
  pick: { origin: string; destination: string; outbound_date: string; return_date: string; per_adult_usd: number },
  candidates: CandidateDeal[],
): VerifyVerdict {
  const today = new Date().toISOString().slice(0, 10);

  // 1. The curator must not invent a route/price — it has to match a live cache row.
  const match = candidates.find(c =>
    c.origin === pick.origin &&
    c.destination === pick.destination &&
    c.outbound_date === pick.outbound_date &&
    c.return_date === pick.return_date,
  );
  if (!match) {
    return { verified: false, note: 'no matching live cache row — possible hallucinated route/dates' };
  }

  // 2. Price must match the cached fare (allow $1 rounding slack).
  if (Math.abs(match.per_adult_usd - pick.per_adult_usd) > 1) {
    return { verified: false, note: `price mismatch: pick $${Math.round(pick.per_adult_usd)} vs cache $${Math.round(match.per_adult_usd)}` };
  }

  // 3. Dates must be in the future and ordered.
  if (pick.outbound_date < today) return { verified: false, note: 'outbound date in the past' };
  if (pick.return_date < pick.outbound_date) return { verified: false, note: 'return before outbound' };

  // 4. Price sanity — guard against a zero/garbage fare.
  if (!(pick.per_adult_usd > 0) || pick.per_adult_usd > 20000) {
    return { verified: false, note: `implausible fare $${Math.round(pick.per_adult_usd)}` };
  }

  return { verified: true, note: 'matched live cache row; dates & price sane' };
}
