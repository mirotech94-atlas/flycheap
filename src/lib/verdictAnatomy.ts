import type { Verdict, VerdictKind } from './verdict';

/**
 * The anatomy of a verdict.
 *
 * "A verdict is a claim about the future and the user knows it. The presentation
 *  has to make the claim falsifiable, or it reads as marketing."
 *
 * Four parts, always together:
 *   1. The call — buy or wait. One word.
 *   2. The confidence — a percentage, AND WHAT IT IS A PERCENTAGE OF.
 *      "72% of the time, a fare in this position on this route did not go lower
 *       within 14 days" is a real statement. A bare "72% confident" is not.
 *   3. The position — where today sits in the 30-day range, shown visually.
 *   4. What would change it — "if it drops below $440 we'd call it a strong
 *      buy", or "the 14-day trend is still falling".
 *
 * The fourth part is the one usually omitted and the one that builds trust,
 * because it shows the model has a SHAPE rather than an opinion.
 *
 * Pure and client-safe. Measured confidence is passed in rather than queried,
 * so this module cannot accidentally invent one.
 */

/**
 * A measured track record for a route family — the honest source of confidence.
 *
 * Null fields mean "not enough scored history to say", never zero. The whole
 * point of publishing a hit rate is that it is real; padding it with absent
 * evidence destroys exactly the thing it exists to build.
 */
export type TrackRecord = {
  routeFamily: string;
  /** Buy calls scored at this horizon. */
  scored: number;
  /** Of those, how many did NOT go lower afterwards. */
  correct: number;
  horizonDays: number;
  /** null below the minimum sample. */
  accuracyPct: number | null;
};

export type VerdictAnatomy = {
  call: VerdictKind;
  callLabel: string;
  /** The percentage. Null when we have not measured enough to state one. */
  confidencePct: number | null;
  /** The sentence that makes the percentage mean something. Always present. */
  confidenceBasis: string;
  /** True when confidencePct comes from scored history rather than a heuristic. */
  confidenceIsMeasured: boolean;
  position: {
    percentile: number;
    positionInRange: number;
    low: number;
    high: number;
    current: number;
  };
  /** The fourth part. Always non-empty. */
  whatWouldChangeIt: string;
};

const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** Minimum scored calls before a measured hit rate may be stated. */
export const MIN_TRACK_RECORD = 20;

/**
 * Compose the four parts.
 *
 * When a measured track record exists for this route family it supplies the
 * confidence and the basis sentence. When it does not, the heuristic score is
 * still shown — but the basis sentence SAYS it is a model score rather than a
 * measured hit rate, so the two are never confused.
 */
export function explainVerdict(v: Verdict, track?: TrackRecord | null): VerdictAnatomy {
  const measured = track && track.accuracyPct != null && track.scored >= MIN_TRACK_RECORD
    ? track
    : null;

  return {
    call: v.verdict,
    callLabel: v.label,
    confidencePct: measured ? Math.round(measured.accuracyPct!) : v.confidencePct,
    confidenceBasis: measured
      ? confidenceSentence(v.verdict, measured)
      : modelScoreSentence(v),
    confidenceIsMeasured: !!measured,
    position: {
      percentile: v.percentile,
      positionInRange: v.positionInRange,
      low: v.min,
      high: v.max,
      current: v.currentPrice,
    },
    whatWouldChangeIt: whatWouldChangeIt(v),
  };
}

/** The real statement: a percentage OF something. */
function confidenceSentence(call: VerdictKind, t: TrackRecord): string {
  const pct = Math.round(t.accuracyPct!);
  if (call === 'buy') {
    return `${pct}% of the time, a fare in this position on ${t.routeFamily} did not go lower `
      + `within ${t.horizonDays} days (${t.correct} of ${t.scored} calls).`;
  }
  if (call === 'wait') {
    return `${pct}% of the time, waiting on ${t.routeFamily} from a position like this paid off `
      + `within ${t.horizonDays} days (${t.correct} of ${t.scored} calls).`;
  }
  return `${pct}% of the time, a fare in this position on ${t.routeFamily} stayed within its `
    + `normal range for ${t.horizonDays} days (${t.correct} of ${t.scored} calls).`;
}

/**
 * What the number means when we have NOT measured it yet.
 *
 * Deliberately says "model score" rather than dressing a heuristic up as a hit
 * rate. It is the honest description of what confidenceFor() computes: an
 * agreement score between independent signals, not an observed frequency.
 */
function modelScoreSentence(v: Verdict): string {
  return `Model score, not a measured hit rate — how strongly the trend, the position in the `
    + `30-day range and the ${v.zScore < 0 ? 'below-average' : 'above-average'} price agree. `
    + `We publish the real hit rate for a route once ${MIN_TRACK_RECORD} calls on it have been scored.`;
}

/**
 * The fourth part — what would change the call.
 *
 * Every branch returns a concrete, checkable statement. "It depends" is not an
 * answer; the point is to show the model has a shape, which means naming the
 * number or the trend that would move it.
 */
export function whatWouldChangeIt(v: Verdict): string {
  const strongBuyAt = v.min * 1.03;

  if (v.verdict === 'buy') {
    // What would make us withdraw a buy.
    if (v.slopePerDay < -1) {
      return `The 30-day trend is still falling about ${fmt(Math.abs(v.slopePerDay))} a day. `
        + `If it keeps that up for a week we would move back to wait.`;
    }
    return `If it climbs back above ${fmt(v.median)} — the 30-day median — we would stop calling `
      + `this good value. A drop under ${fmt(strongBuyAt)} would make it a strong buy.`;
  }

  if (v.verdict === 'wait') {
    const target = Math.min(v.threshold, v.p25);
    if (v.slopePerDay < 0) {
      return `The 14-day trend is still falling. We would switch to buy if it reaches `
        + `${fmt(target)}, or if the fall flattens out for several days.`;
    }
    return `We would switch to buy below ${fmt(target)}. If it instead rises past `
      + `${fmt(v.p75)} we would say the window has closed rather than keep advising a wait.`;
  }

  // hold
  return `We would call it a buy under ${fmt(Math.min(v.threshold, v.p25))}, and a wait if it `
    + `rises past ${fmt(v.p75)}. Between those it is genuinely mid-range and there is no call `
    + `worth making.`;
}

/**
 * Build a track record from scored verdict calls.
 *
 * Returns accuracyPct null below the minimum sample. "It will sometimes be
 * unflattering. Publish it anyway — a measured 68% is more persuasive than an
 * unmeasured 95%." The way to keep that true is never to publish a figure that
 * is really two lucky calls.
 */
export function buildTrackRecord(input: {
  routeFamily: string;
  scored: number;
  correct: number;
  horizonDays: number;
  minSample?: number;
}): TrackRecord {
  const min = input.minSample ?? MIN_TRACK_RECORD;
  return {
    routeFamily: input.routeFamily,
    scored: input.scored,
    correct: input.correct,
    horizonDays: input.horizonDays,
    accuracyPct: input.scored >= min ? (input.correct / input.scored) * 100 : null,
  };
}

/** "JFK → CAI" — the family a track record is kept for. */
export function routeFamily(origin: string, destination: string): string {
  return `${origin.toUpperCase()} → ${destination.toUpperCase()}`;
}
