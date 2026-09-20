import 'server-only';
import { queries } from './db';
import { searchProviders, enabledProviderIds } from './providers';
import type { Offer, ProviderId, SearchParams } from './providers/types';
import { routeKey } from './providerCost';
import { needsPriorityVerification, type AlertKind } from './alertKind';

// Re-exported so server callers can reach it from the module they already use.
export { verifiedAgeLabel } from './fareAge';

/**
 * Fare truth — no alert leaves the system on the strength of a cached poll.
 *
 * A user clicking a $484 alert and landing on $689 is the one failure this
 * product does not recover from. So every alert is verified before it is sent,
 * every price carries the moment it was verified, and an alert that cannot be
 * verified is suppressed.
 *
 * The suppression rule is the one that is tempting to skip, because it
 * suppresses exciting alerts. A suppressed alert costs one possible booking; a
 * dead-fare alert costs a user. Suppressions are written to `dead_fares` so the
 * cost of the rule stays visible and nobody has to guess at it.
 */

export type VerifyOutcome =
  /** Two or more providers within the agreement band. Send the verified price. */
  | 'agreed'
  /** Providers disagree but inside tolerance. Send the HIGHER of the two —
   *  under-promising costs nothing, over-promising costs the user. */
  | 'within-tolerance'
  /** Disagreement outside tolerance, or the fare is gone. Do not send. */
  | 'dead'
  /** Only one provider can price this route at all. Send, flagged. */
  | 'single-provider'
  /** Verification could not run (no provider answered). Do not send. */
  | 'unverified';

export type VerifyResult = {
  outcome: VerifyOutcome;
  /** The price to actually show. Never lower than what verification found. */
  priceToShow: number;
  /** ISO timestamp of the verification query, for "verified 3 minutes ago". */
  verifiedAt: string;
  verifiedBy: ProviderId[];
  /** Percent difference between the polled price and the verification price. */
  deltaPct: number | null;
  /** Whether an alert may be sent on this result. */
  sendable: boolean;
  reason: string;
};

/** Providers agreeing within this band are treated as agreeing outright. */
export const AGREEMENT_PCT = 2;
/** Beyond this, the fare is treated as gone rather than merely disputed. */
export const TOLERANCE_PCT = 8;

function pct(a: number, b: number): number {
  if (!b) return 0;
  return ((a - b) / b) * 100;
}

function numSetting(key: string, fallback: number): number {
  const raw = queries.getSetting(key);
  const n = raw == null ? NaN : parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Which providers to use for the verification pass.
 *
 * Provider routing is a table, not code — pricing and quality change and the
 * spec is explicit that this must be editable without a deploy. The
 * `verify_providers` setting is a comma-separated list; when it is empty we
 * fall back to "every enabled provider except the one that found the fare",
 * which is the correct default because the point is an INDEPENDENT second
 * opinion.
 *
 * Mistake fares and anomalies get the expensive provider: the window is hours,
 * and they are by construction the fares most likely to be wrong or pulled.
 * Routine threshold checks do not — that is what makes the check affordable.
 */
export function verificationProviders(opts: {
  excluding: ProviderId | null;
  priority: boolean;
}): ProviderId[] {
  const enabled = enabledProviderIds();
  const key = opts.priority ? 'verify_providers_priority' : 'verify_providers';
  const configured = (queries.getSetting(key) ?? '')
    .split(',').map(s => s.trim()).filter(Boolean) as ProviderId[];

  const pool = configured.length > 0
    ? configured.filter(p => enabled.includes(p))
    : enabled;

  const independent = pool.filter(p => p !== opts.excluding);
  // If the only enabled provider is the one that found the fare, we cannot get
  // an independent second opinion; re-querying it is still worth doing, because
  // it at least proves the fare is still there.
  return independent.length > 0 ? independent : pool;
}

/**
 * Re-query and decide whether this fare is real enough to alert on.
 *
 * `polledPrice` is what the sweep found; `polledBy` is the provider that found
 * it (or null for a cache-sourced candidate, which always needs verifying).
 */
export async function verifyFare(opts: {
  search: SearchParams & { id?: number };
  polledPrice: number;
  polledBy: ProviderId | null;
  alertKind: AlertKind;
  /** Offers already in hand from this same poll, if any — a fan-out that
   *  already queried several providers has produced the cross-check for free. */
  offersInHand?: Offer[];
}): Promise<VerifyResult> {
  const agreementPct = numSetting('verify_agreement_pct', AGREEMENT_PCT);
  const tolerancePct = numSetting('verify_tolerance_pct', TOLERANCE_PCT);
  const priority = needsPriorityVerification(opts.alertKind);
  const now = () => new Date().toISOString();

  // Cheapest possible verification: another provider already priced this exact
  // query during the same fan-out, seconds ago. That is a genuine independent
  // second opinion and it costs nothing extra.
  const inHand = (opts.offersInHand ?? []).filter(o => o.provider !== opts.polledBy);
  if (inHand.length > 0 && opts.polledBy) {
    const best = inHand.reduce((a, b) => (a.per_adult_usd <= b.per_adult_usd ? a : b));
    return decide({
      polledPrice: opts.polledPrice,
      verifyPrice: best.per_adult_usd,
      verifiedBy: [best.provider],
      verifiedAt: now(),
      agreementPct, tolerancePct,
      search: opts.search,
      polledBy: opts.polledBy,
    });
  }

  // Otherwise spend a call. This is the only place a 'verify'-phase provider
  // call originates, so its cost is separable on the cost dashboard.
  const providers = verificationProviders({ excluding: opts.polledBy, priority });
  if (providers.length === 0) {
    return {
      outcome: 'unverified', priceToShow: opts.polledPrice, verifiedAt: now(),
      verifiedBy: [], deltaPct: null, sendable: false,
      reason: 'no provider available to verify against',
    };
  }

  const { offers } = await searchProviders(opts.search, providers, {
    searchId: opts.search.id ?? null,
    phase: 'verify',
    band: priority ? 'hot' : null,
  });

  if (offers.length === 0) {
    // Nothing came back for a fare we just saw. Treat as gone, not as agreement.
    return {
      outcome: 'dead', priceToShow: opts.polledPrice, verifiedAt: now(),
      verifiedBy: [], deltaPct: null, sendable: false,
      reason: 'verification returned no offers — fare is gone',
    };
  }

  const cheapest = offers.reduce((a, b) => (a.per_adult_usd <= b.per_adult_usd ? a : b));
  return decide({
    polledPrice: opts.polledPrice,
    verifyPrice: cheapest.per_adult_usd,
    verifiedBy: [...new Set(offers.map(o => o.provider))],
    verifiedAt: now(),
    agreementPct, tolerancePct,
    search: opts.search,
    polledBy: opts.polledBy,
  });
}

function decide(a: {
  polledPrice: number;
  verifyPrice: number;
  verifiedBy: ProviderId[];
  verifiedAt: string;
  agreementPct: number;
  tolerancePct: number;
  search: SearchParams & { id?: number };
  polledBy: ProviderId | null;
}): VerifyResult {
  const deltaPct = pct(a.verifyPrice, a.polledPrice);
  const absDelta = Math.abs(deltaPct);

  // Record the pair disagreement regardless of outcome — tracking it per pair
  // is how a silently-going-stale provider is caught before it fakes stability.
  if (a.polledBy && a.verifiedBy.length > 0 && absDelta >= a.agreementPct) {
    try {
      queries.insertProviderDisagreement({
        route_key: routeKey({
          origin: a.search.origin, destination: a.search.destination,
          departDate: a.search.departDate, returnDate: a.search.returnDate,
          adults: a.search.adults, infants: a.search.infants,
        }),
        search_id: a.search.id ?? null,
        provider_a: a.polledBy,
        provider_b: a.verifiedBy[0],
        price_a: a.polledPrice,
        price_b: a.verifyPrice,
        delta_pct: deltaPct,
      });
    } catch (e) {
      console.error('[fareTruth] disagreement insert failed', (e as Error).message);
    }
  }

  if (absDelta < a.agreementPct) {
    return {
      outcome: 'agreed',
      // Even on agreement, show the verified number rather than the polled one:
      // it is the fresher of the two and it is the one we can stand behind.
      priceToShow: Math.max(a.polledPrice, a.verifyPrice),
      verifiedAt: a.verifiedAt, verifiedBy: a.verifiedBy,
      deltaPct, sendable: true,
      reason: `verified within ${a.agreementPct}%`,
    };
  }

  if (absDelta <= a.tolerancePct) {
    return {
      outcome: 'within-tolerance',
      // The higher of the two, deliberately. Under-promising costs nothing;
      // over-promising costs the user, and the user is the scarce resource.
      priceToShow: Math.max(a.polledPrice, a.verifyPrice),
      verifiedAt: a.verifiedAt, verifiedBy: a.verifiedBy,
      deltaPct, sendable: true,
      reason: `providers differ by ${absDelta.toFixed(1)}% — sending the higher price`,
    };
  }

  return {
    outcome: 'dead',
    priceToShow: Math.max(a.polledPrice, a.verifyPrice),
    verifiedAt: a.verifiedAt, verifiedBy: a.verifiedBy,
    deltaPct, sendable: false,
    reason: `providers differ by ${absDelta.toFixed(1)}%, beyond the ${a.tolerancePct}% tolerance`,
  };
}
