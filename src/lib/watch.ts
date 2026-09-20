/**
 * The Watch object.
 *
 * "Everything in the portal is a view over this one object. Get it right and the
 *  group solver, trip budgets and B2B boards all fall out of it. Get it wrong
 *  and each becomes a separate subsystem."
 *
 * Four kinds, ONE object:
 *   route  — origin, destination, date window, target. What exists today.
 *   trip   — the same plus hotel nights: flight + accommodation as one number.
 *   budget — destination blank. "$700, 10 nights, March, from JFK"; the engine
 *            finds where that buys a trip.
 *   group  — multiple origins, one destination, optimised for the party sum.
 *            The same object with an origin ARRAY, not a separate feature.
 *
 * Pure and client-safe: the board, the watch detail and the share page all read
 * these helpers, and two of the three render in the browser.
 */

export type WatchKind = 'route' | 'trip' | 'budget' | 'group';
export type WatchStatus = 'active' | 'paused' | 'expired' | 'booked';

/**
 * How a target is measured.
 *
 * `party_total` is the default for new watches, and that choice is the point:
 * a family of five does not care that the per-adult fare hit $412, they care
 * what the booking costs. Per-adult stays available for people who think that
 * way, and every pre-existing watch keeps it so nothing silently re-bases.
 */
export type TargetBasis = 'per_adult' | 'party_total' | 'trip_total';

export const DEFAULT_TARGET_BASIS: TargetBasis = 'party_total';
/** Most people's real constraints are looser than the dates they first type. */
export const DEFAULT_FLEX_DAYS = 3;

/** The raw row, as `searches` stores it. Only the fields the Watch view needs. */
export type WatchRow = {
  id: number;
  user_id?: number | null;
  group_id?: number | null;
  kind?: string | null;
  origin: string;
  origins?: string | null;
  destination: string;
  destinations?: string | null;
  depart_date: string;
  return_date: string;
  depart_window_start?: string | null;
  depart_window_end?: string | null;
  return_window_start?: string | null;
  return_window_end?: string | null;
  trip_length_min?: number | null;
  trip_length_max?: number | null;
  flex_days?: number | null;
  adults: number;
  children?: number | null;
  infants: number;
  cabin?: string | null;
  target_amount?: number | null;
  target_basis?: string | null;
  target_per_adult_usd?: number | null;
  currency?: string | null;
  include_hotel?: number | null;
  hotel_nights?: number | null;
  active?: number;
  status?: string | null;
  expires_at?: string | null;
  is_home_route?: number | null;
  priority_score?: number | null;
  poll_band?: string | null;
  /** 'any' = watch the route, we find the cheapest window. Dates are placeholders. */
  date_mode?: 'exact' | 'any' | null;
};

export type Watch = {
  id: number;
  kind: WatchKind;
  status: WatchStatus;
  origins: string[];
  destinations: string[];
  departWindow: { start: string; end: string };
  returnWindow: { start: string; end: string } | null;
  tripLength: { min: number; max: number } | null;
  flexDays: number;
  pax: { adults: number; children: number; infants: number };
  cabin: string | null;
  target: { amount: number | null; basis: TargetBasis };
  currency: string;
  includeHotel: boolean;
  hotelNights: number | null;
  isHomeRoute: boolean;
  expiresAt: string | null;
  band: string | null;
  /**
   * True when the stored dates are PLACEHOLDERS the poller ignores. A card
   * that prints them as real dates tells a brand-new user they are flying on
   * a day nobody chose — which is exactly what the first seeded watch would
   * have done.
   */
  anyDates: boolean;
};

const csv = (v: string | null | undefined): string[] =>
  (v ?? '').split(',').map(x => x.trim().toUpperCase()).filter(Boolean);

/** Read a stored row as a Watch. Never throws; missing fields fall back. */
export function toWatch(row: WatchRow): Watch {
  const origins = csv(row.origins);
  const destinations = csv(row.destinations);

  // A row with several origins IS a group watch even if nothing said so —
  // that is what "the same object with an origin array" means.
  const declared = (row.kind ?? 'route') as WatchKind;
  const kind: WatchKind = declared !== 'route' ? declared
    : origins.length > 1 ? 'group'
    : row.include_hotel ? 'trip'
    : 'route';

  return {
    id: row.id,
    kind,
    status: resolveStatus(row),
    origins: origins.length ? origins : [row.origin.toUpperCase()],
    destinations: destinations.length ? destinations
      : row.destination ? [row.destination.toUpperCase()] : [],
    departWindow: {
      start: row.depart_window_start ?? row.depart_date,
      end: row.depart_window_end ?? row.depart_date,
    },
    returnWindow: row.return_date || row.return_window_start
      ? {
          start: row.return_window_start ?? row.return_date,
          end: row.return_window_end ?? row.return_date,
        }
      : null,
    tripLength: row.trip_length_min != null && row.trip_length_max != null
      ? { min: row.trip_length_min, max: row.trip_length_max }
      : null,
    flexDays: row.flex_days ?? 0,
    pax: {
      adults: row.adults,
      children: row.children ?? 0,
      infants: row.infants,
    },
    cabin: row.cabin ?? null,
    target: resolveTarget(row),
    currency: row.currency ?? 'USD',
    includeHotel: !!row.include_hotel,
    hotelNights: row.hotel_nights ?? null,
    isHomeRoute: !!row.is_home_route,
    anyDates: row.date_mode === 'any',
    expiresAt: row.expires_at ?? null,
    band: row.poll_band ?? null,
  };
}

/**
 * `active` (0/1) is what the poller has always read; `status` carries the richer
 * lifecycle. When they disagree, the explicit status wins — except that a
 * paused row must never read as active.
 */
export function resolveStatus(row: WatchRow): WatchStatus {
  const s = (row.status ?? '') as WatchStatus;
  if (s === 'paused' || s === 'expired' || s === 'booked') return s;
  return row.active === 0 ? 'paused' : 'active';
}

/**
 * The target and the basis it is measured on.
 *
 * Pre-existing rows carry only `target_per_adult_usd`, so they resolve to
 * `per_adult` — re-basing them silently would change when every existing watch
 * alerts, which is exactly the kind of quiet behaviour change that destroys
 * trust in an alert product.
 */
export function resolveTarget(row: WatchRow): { amount: number | null; basis: TargetBasis } {
  const amount = row.target_amount;
  if (typeof amount === 'number' && amount > 0) {
    const basis = (row.target_basis ?? DEFAULT_TARGET_BASIS) as TargetBasis;
    return { amount, basis: isBasis(basis) ? basis : DEFAULT_TARGET_BASIS };
  }
  const legacy = row.target_per_adult_usd;
  if (typeof legacy === 'number' && legacy > 0) {
    return { amount: legacy, basis: 'per_adult' };
  }
  return { amount: null, basis: (row.target_basis as TargetBasis) ?? DEFAULT_TARGET_BASIS };
}

function isBasis(v: string): v is TargetBasis {
  return v === 'per_adult' || v === 'party_total' || v === 'trip_total';
}

/**
 * What a fare costs ON THE WATCH'S OWN BASIS — the number to compare against
 * the target, and the number to show on the card.
 *
 * Children and infants price differently and the difference is large on
 * long-haul. When the provider gives us a party total we use it; when it does
 * not, we derive one and the caller is expected to SAY SO rather than silently
 * quoting adult fares times five.
 */
export type FarePricing = {
  perAdultUsd: number;
  /** The provider's own party total, when it gave one. */
  partyTotalUsd?: number | null;
  /** Hotel estimate for the trip, when one is genuinely available. */
  hotelTotalUsd?: number | null;
};

export type BasisAmount = {
  amountUsd: number;
  basis: TargetBasis;
  /** False when the party total was derived from the adult fare rather than
   *  quoted. The UI must state the assumption when this is false. */
  quoted: boolean;
  /** True when a trip_total basis could not include the hotel, so the figure is
   *  not actually a trip total. Never compare this against a trip target. */
  incomplete: boolean;
};

/** Infants are conventionally a fraction of the adult fare when not quoted. */
export const INFANT_FARE_RATIO = 0.1;
/** Children usually price close to an adult on long-haul; not a discount. */
export const CHILD_FARE_RATIO = 1;

export function amountOnBasis(watch: Watch, fare: FarePricing): BasisAmount {
  if (watch.target.basis === 'per_adult') {
    return { amountUsd: fare.perAdultUsd, basis: 'per_adult', quoted: true, incomplete: false };
  }

  const quoted = typeof fare.partyTotalUsd === 'number' && fare.partyTotalUsd > 0;
  const party = quoted
    ? fare.partyTotalUsd!
    : fare.perAdultUsd * watch.pax.adults
      + fare.perAdultUsd * CHILD_FARE_RATIO * watch.pax.children
      + fare.perAdultUsd * INFANT_FARE_RATIO * watch.pax.infants;

  if (watch.target.basis === 'party_total') {
    return { amountUsd: party, basis: 'party_total', quoted, incomplete: false };
  }

  // trip_total — flight + accommodation as one number.
  const hotel = typeof fare.hotelTotalUsd === 'number' && fare.hotelTotalUsd > 0
    ? fare.hotelTotalUsd
    : null;
  return {
    amountUsd: party + (hotel ?? 0),
    basis: 'trip_total',
    quoted,
    // No hotel figure means this is a flight total wearing a trip total's name.
    incomplete: hotel == null,
  };
}

/**
 * Is this watch under its target?
 *
 * Returns null when it cannot be answered honestly — no target set, or a trip
 * target with no hotel figure to complete it. A null must never be rendered as
 * "not under target"; it means "we cannot say".
 */
export function isUnderTarget(watch: Watch, fare: FarePricing): boolean | null {
  if (watch.target.amount == null) return null;
  const on = amountOnBasis(watch, fare);
  if (on.incomplete) return null;
  return on.amountUsd < watch.target.amount;
}

/** Human label for a basis, for the card and the alert. */
export function basisLabel(basis: TargetBasis): string {
  return basis === 'per_adult' ? 'per adult'
    : basis === 'party_total' ? 'for the party'
    : 'for the trip';
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * When this watch stops being worth polling.
 *
 * A home route NEVER expires — it is the one they fly every year, it is the
 * reason to exist in their inbox permanently, and the spec calls it the
 * headline retention lever.
 */
export function computeExpiry(watch: Watch): string | null {
  if (watch.isHomeRoute) return null;
  if (watch.kind === 'budget') return null; // open-ended by nature
  const end = watch.returnWindow?.end ?? watch.departWindow.end;
  if (!end) return null;
  const t = Date.parse(`${end.slice(0, 10)}T23:59:59Z`);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/**
 * Has the departure window passed?
 *
 * "Do not let expired watches accumulate silently on the board — that is what
 *  makes a tracking product feel abandoned."
 */
export function hasExpired(watch: Watch, nowMs = Date.now()): boolean {
  if (watch.isHomeRoute || watch.kind === 'budget') return false;
  const expiry = watch.expiresAt ?? computeExpiry(watch);
  if (!expiry) return false;
  const t = Date.parse(expiry);
  return !Number.isNaN(t) && t < nowMs;
}

/**
 * Sort order for the board.
 *
 * "Sort by urgency, not by creation date: buy verdicts first, then
 *  closest-to-target, then everything else. The user's most pressing decision
 *  should be the first thing under their thumb."
 */
export function boardRank(item: {
  verdict?: 'buy' | 'wait' | 'hold' | null;
  distanceToTargetPct?: number | null;
  status?: WatchStatus;
}): number {
  // Lower sorts first.
  if (item.status === 'expired') return 900;
  if (item.status === 'paused') return 800;
  if (item.verdict === 'buy') return 0;
  const d = item.distanceToTargetPct;
  if (typeof d === 'number' && Number.isFinite(d)) {
    // 100 → at target, rising as it moves away. Clamped so it always sorts
    // after a buy and before the no-information case.
    return 100 + Math.max(0, Math.min(599, Math.abs(d)));
  }
  return 700;
}
