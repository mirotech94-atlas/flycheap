/**
 * One card on the board.
 *
 * "Not a dashboard of charts. A list of watches, each one a card that answers
 *  the only question the user has: should I book yet?"
 *
 * This module is PURE — it takes rows and returns the card. Everything the
 * screen decides (which state the card is in, which single action it offers,
 * where it sorts) is decided here so it can be tested without a database and
 * without a browser.
 *
 * THE UNIT TRAP THIS MODULE EXISTS TO CLOSE
 * Price history, thresholds and therefore the entire verdict engine are
 * PER ADULT. The card's headline is on the WATCH'S OWN BASIS, which for a
 * family of four is roughly four times larger. Rendering the two side by side
 * without saying which is which reads as "$2,400 — under your target of $900",
 * which is worse than showing nothing. So the headline and the 30-day range are
 * kept in separate fields with separate basis labels, and `underTarget` is
 * computed by isUnderTarget() on the basis, never by comparing the two.
 */

import {
  toWatch, resolveStatus, amountOnBasis, isUnderTarget, basisLabel, hasExpired,
  boardRank, CHILD_FARE_RATIO, INFANT_FARE_RATIO,
  type Watch, type WatchRow, type WatchStatus, type FarePricing,
  type TargetBasis,
} from './watch';
import { type Verdict, type VerdictPoint } from './verdict';
import { decide } from './nn';
import {
  explainVerdict, routeFamily, type TrackRecord, type VerdictAnatomy,
} from './verdictAnatomy';
import { verifiedAgeLabel } from './fareAge';

/**
 * What a card can be. The three-way "buy / why? / nothing yet" the spec asks
 * for is really seven states once a real account is involved, and every one of
 * them needs a different single action.
 */
export type CardState =
  | 'buy'         // we have a call and it is buy
  | 'decide'      // we have a call and it is wait or hold
  | 'gathering'   // priced, but not enough history to have a call yet
  | 'stale'       // the last fare we hold was found dead on verification
  | 'no-fare'     // nothing priced yet at all
  | 'booked'
  | 'paused'
  | 'expired';

export type CardAction = {
  /** book = out to the partner; the rest stay inside the product. */
  kind: 'book' | 'why' | 'detail';
  label: string;
};

export type CardAmount = {
  amountUsd: number | null;
  basis: TargetBasis;
  basisLabel: string;
  /** False when a party total was DERIVED from the adult fare, not quoted. */
  quoted: boolean;
  /** True when this is a trip total with no hotel in it — not a trip total. */
  incomplete: boolean;
};

export type BoardCard = {
  id: number;
  watch: Watch;
  status: WatchStatus;
  state: CardState;
  origin: string;
  destination: string;
  routeLabel: string;
  departDate: string;
  returnDate: string | null;
  /** The headline number, on the watch's own basis. */
  price: CardAmount;
  /** The same fare per adult — the unit everything analytical is in. */
  perAdultUsd: number | null;
  target: { amountUsd: number | null; basis: TargetBasis; basisLabel: string };
  /** null means "we cannot say", and must never render as "no". */
  underTarget: boolean | null;
  verdict: Verdict | null;
  anatomy: VerdictAnatomy | null;
  /** PER ADULT. Labelled as such wherever it is drawn. */
  range30: {
    low: number; high: number; current: number;
    /** 0-100 across [low, high] — where today's marker goes. */
    positionPct: number;
  } | null;
  verifiedLabel: string | null;
  /** The daily minima the verdict was computed from, per adult, oldest first.
   *  Carried on the card so the detail screen draws exactly the series the
   *  call was made on rather than re-querying and possibly drawing another. */
  history: VerdictPoint[];
  /** The per-adult threshold the verdict was scored against. */
  thresholdPerAdult: number;
  /** One line under the verdict. Always present, never "it depends". */
  note: string;
  primary: CardAction;
  rank: number;
};

export type BoardCardInput = {
  row: WatchRow;
  fare: FarePricing | null;
  /** Daily minima, per adult, oldest first. */
  history: VerdictPoint[];
  /** The per-adult alert threshold in force for this watch. */
  thresholdPerAdult: number;
  verifiedAt?: string | null;
  verifyOutcome?: string | null;
  /** Scored calls for this route family. Absent = no measured hit rate. */
  track?: TrackRecord | null;
  nowMs?: number;
};

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/**
 * Where today's price sits in the 30-day range, as 0-100.
 *
 * A flat range (low === high) has no meaningful position; it answers 50 rather
 * than dividing by zero and drawing the marker at the far left, which would
 * read as "cheapest ever" on a route that has not moved.
 */
export function positionPct(low: number, high: number, current: number): number {
  if (!(high > low)) return 50;
  const pct = ((current - low) / (high - low)) * 100;
  return Math.max(0, Math.min(100, pct));
}

/**
 * Compose one card.
 *
 * Never throws: a board that 500s because one watch has no fare is worse than a
 * board with one apologetic card on it.
 */
export function composeCard(input: BoardCardInput): BoardCard {
  const now = input.nowMs ?? Date.now();
  const watch = toWatch(input.row);
  const origin = input.row.origin.toUpperCase();
  const destination = input.row.destination.toUpperCase();

  let status = resolveStatus(input.row);
  if (status === 'active' && hasExpired(watch, now)) status = 'expired';

  const dead = (input.verifyOutcome ?? '') === 'dead';
  const fare = input.fare;

  // The headline, on the watch's own basis.
  const on = fare ? amountOnBasis(watch, fare) : null;
  const price: CardAmount = {
    amountUsd: on ? on.amountUsd : null,
    basis: on ? on.basis : watch.target.basis,
    // An incomplete trip total is a FLIGHT total. Labelling it "for the trip"
    // is the exact number a customer would hold us to, and the explanatory
    // note underneath does not undo a wrong label on the headline itself.
    basisLabel: on?.incomplete ? 'flights only' : basisLabel(on ? on.basis : watch.target.basis),
    quoted: on ? on.quoted : false,
    incomplete: on ? on.incomplete : false,
  };

  const underTarget = fare ? isUnderTarget(watch, fare) : null;

  // Everything analytical is per adult, including the threshold the verdict is
  // scored against. Mixing the basis in here would move every verdict on every
  // family watch.
  const verdict = fare
    ? decide(input.history, fare.perAdultUsd, input.thresholdPerAdult, { departDate: input.row.depart_date ?? null })
    : null;

  const track = input.track
    ?? (verdict ? { routeFamily: routeFamily(origin, destination), scored: 0, correct: 0, horizonDays: 14, accuracyPct: null } : null);

  const anatomy = verdict ? explainVerdict(verdict, track) : null;

  const range30 = verdict
    ? {
        low: verdict.min, high: verdict.max, current: verdict.currentPrice,
        positionPct: positionPct(verdict.min, verdict.max, verdict.currentPrice),
      }
    : null;

  const state = cardState({ status, dead, hasFare: !!fare, verdict });

  return {
    id: input.row.id,
    watch,
    status,
    state,
    origin,
    destination,
    routeLabel: `${origin} → ${destination}`,
    departDate: input.row.depart_date,
    returnDate: input.row.return_date || null,
    price,
    perAdultUsd: fare?.perAdultUsd ?? null,
    target: {
      amountUsd: watch.target.amount,
      basis: watch.target.basis,
      basisLabel: basisLabel(watch.target.basis),
    },
    underTarget,
    verdict,
    anatomy,
    range30,
    verifiedLabel: dead ? null : verifiedAgeLabel(input.verifiedAt, now),
    history: input.history,
    thresholdPerAdult: input.thresholdPerAdult,
    note: cardNote({ state, verdict, price, target: watch.target, underTarget, historyLen: input.history.length }),
    primary: primaryAction(state),
    rank: boardRank({
      verdict: verdict?.verdict ?? null,
      distanceToTargetPct: distanceToTargetPct(price.amountUsd, watch.target.amount),
      status,
    }),
  };
}

function cardState(x: {
  status: WatchStatus; dead: boolean; hasFare: boolean; verdict: Verdict | null;
}): CardState {
  if (x.status === 'booked') return 'booked';
  if (x.status === 'paused') return 'paused';
  if (x.status === 'expired') return 'expired';
  // A fare that failed verification is not a price; offering Book on it sends
  // someone to a partner page that will quote something else.
  if (x.dead) return 'stale';
  if (!x.hasFare) return 'no-fare';
  if (!x.verdict) return 'gathering';
  return x.verdict.verdict === 'buy' ? 'buy' : 'decide';
}

/**
 * ONE primary action per card.
 *
 * "One primary action per card — Book when the verdict is buy, otherwise Why?
 *  — and everything else behind an overflow." A card with three equal buttons
 * is a card nobody presses.
 */
function primaryAction(state: CardState): CardAction {
  switch (state) {
    case 'buy':       return { kind: 'book',   label: 'Book this fare' };
    case 'decide':    return { kind: 'why',    label: 'Why?' };
    // Nothing to explain yet, so Why? would open an empty page. Send them to
    // the watch instead, where the history so far is at least visible.
    case 'gathering': return { kind: 'detail', label: 'See what we have' };
    case 'stale':     return { kind: 'detail', label: 'Re-check this fare' };
    case 'no-fare':   return { kind: 'detail', label: 'Open watch' };
    case 'booked':    return { kind: 'detail', label: 'Trip details' };
    case 'paused':    return { kind: 'detail', label: 'Resume watching' };
    case 'expired':   return { kind: 'detail', label: 'Renew or remove' };
  }
}

/**
 * The one line under the verdict.
 *
 * Always says something checkable. Where the honest answer is "we cannot say",
 * it says that rather than filling the space with a number.
 */
function cardNote(x: {
  state: CardState;
  verdict: Verdict | null;
  price: CardAmount;
  target: { amount: number | null; basis: TargetBasis };
  underTarget: boolean | null;
  historyLen: number;
}): string {
  if (x.state === 'booked') return 'Booked. We keep watching in case it drops enough to rebook.';
  if (x.state === 'paused') return 'Paused. We are not checking this route, and the history is on hold.';
  if (x.state === 'expired') return 'These dates have passed. Renew it with new dates or remove it.';
  if (x.state === 'stale') {
    return 'The last fare we held did not survive a re-check at the provider. '
      + 'We have dropped it rather than quote you a price that is not there.';
  }
  if (x.state === 'no-fare') return 'Nothing priced yet. The first check usually lands within the hour.';
  if (x.state === 'gathering') {
    return `Priced, but ${x.historyLen} day${x.historyLen === 1 ? '' : 's'} of history is not `
      + 'enough to tell you whether that is cheap. Give it a few more days.';
  }

  // Priced and called.
  if (x.price.incomplete) {
    return 'This is the flights only — we cannot price the accommodation for these dates yet, '
      + 'so it is not comparable to a trip target.';
  }
  if (x.underTarget === true && x.target.amount != null) {
    return `Under your target of ${money(x.target.amount)} ${basisLabel(x.target.basis)}.`;
  }
  if (x.underTarget === false && x.target.amount != null && x.price.amountUsd != null) {
    const over = `${money(x.price.amountUsd - x.target.amount)} above your target of `
      + `${money(x.target.amount)} ${basisLabel(x.target.basis)}.`;
    // On a buy these are two different facts and both matter: cheap FOR THIS
    // ROUTE, but still more than they said they wanted to pay. Showing only
    // the target gap under a BUY NOW badge reads as a contradiction.
    return x.state === 'buy' ? `${x.verdict!.reason} Still ${over}` : over;
  }
  return x.verdict?.reason ?? 'No target set, so we judge it against the route’s own 30-day range.';
}

/**
 * The user's target expressed PER ADULT, so it can be drawn on a per-adult
 * chart.
 *
 * This is arithmetic, not a new number: it inverts exactly the weighting
 * amountOnBasis() uses to build the party total in the first place. It is
 * labelled as an equivalent wherever it is shown, because the figure the user
 * actually set is the party one.
 *
 * Returns null for a trip target — dividing a flight-plus-hotel target by a
 * head count would produce a line that means nothing.
 */
export function targetPerAdultEquivalent(watch: Watch): number | null {
  const t = watch.target.amount;
  if (t == null || !(t > 0)) return null;
  if (watch.target.basis === 'per_adult') return t;
  if (watch.target.basis === 'trip_total') return null;
  const weight = watch.pax.adults
    + watch.pax.children * CHILD_FARE_RATIO
    + watch.pax.infants * INFANT_FARE_RATIO;
  return weight > 0 ? t / weight : null;
}

/** How far the headline is from the target, as a percentage. Same basis both sides. */
export function distanceToTargetPct(amountUsd: number | null, targetUsd: number | null): number | null {
  if (amountUsd == null || targetUsd == null || !(targetUsd > 0)) return null;
  return ((amountUsd - targetUsd) / targetUsd) * 100;
}

/** The board, in the order the spec asks for. */
export function sortBoard(cards: BoardCard[]): BoardCard[] {
  // boardRank gives every buy the same rank 0, so without a tie-break the first
  // card is whichever route sorts alphabetically. Between two buys, the one
  // that also clears the user's own target is the better first thing under
  // their thumb.
  const tie = (c: BoardCard) => (c.underTarget === true ? 0 : c.underTarget === null ? 1 : 2);
  return [...cards].sort((a, b) =>
    a.rank - b.rank || tie(a) - tie(b) || a.routeLabel.localeCompare(b.routeLabel));
}

/**
 * The one line above the board.
 *
 * Counts rather than a chart. Returns nulls, not zeros, where nothing has been
 * measured — the same rule the admin analytics follow.
 */
export function boardSummary(cards: BoardCard[]): {
  watching: number;
  buyNow: number;
  underTarget: number;
  /** Watches we genuinely cannot answer for, so the count above is honest. */
  unanswerable: number;
} {
  const live = cards.filter(c => c.status === 'active');
  return {
    watching: live.length,
    buyNow: live.filter(c => c.state === 'buy').length,
    underTarget: live.filter(c => c.underTarget === true).length,
    unanswerable: live.filter(c => c.underTarget === null).length,
  };
}
