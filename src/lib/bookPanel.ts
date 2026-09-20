/**
 * Ordering for the Book panel's cross-shop options.
 *
 * The spec's rule, exactly:
 *
 *   "Order those by expected commission among options within a small tolerance
 *    of the cheapest. If three are within $6, leading with the one that pays is
 *    legitimate and worth real money. If the cheapest pays nothing, still show
 *    it first — you sell honesty, and users will check."
 *
 * Both halves matter. Ordering only by commission is steering, and a user who
 * feels steered is worth less than the click — one subscriber is worth roughly
 * ninety flight clicks. Ordering only by price leaves money on the table when
 * the difference is a rounding error to the traveller.
 *
 * Pure and client-safe: the Book panel renders in the browser. Expected
 * commission is passed IN rather than looked up here, so the caller decides
 * whether to use figures derived from our own click history or the documented
 * estimates. Nothing in this file invents a number.
 */

export type BookOption = {
  name: string;
  short: string;
  href: string;
  color: string;
  /** Whether the partner has a commission program at all. */
  earns?: boolean;
  /** Price this option is known to show, when we know it. Usually we don't —
   *  these are deep links into someone else's search, not priced offers. */
  priceUsd?: number | null;
};

export type RankedOption = BookOption & {
  /** 1-based position after ranking. Recorded on the click so the effect of
   *  this ordering on click-through is measurable rather than assumed. */
  rank: number;
  /** Why it landed where it did — for debugging and for the admin view. */
  reason: 'cheapest' | 'within-tolerance' | 'priced-higher' | 'unpriced';
};

/**
 * "Within a small tolerance of the cheapest" — the spec's own figure. A
 * traveller choosing between $484 and $489 is not really choosing on price.
 */
export const TOLERANCE_USD = 6;

export type RankOptions = {
  /** Expected commission in USD per click, by partner key. Absent partners
   *  score 0, which is correct: no program means no expected commission. */
  epc?: Record<string, number>;
  /** Maps an option to its partner key for the epc lookup. */
  keyOf?: (o: BookOption) => string;
  toleranceUsd?: number;
};

/**
 * Rank the panel.
 *
 * With prices: the cheapest always leads — even when it pays nothing — and the
 * options within tolerance of it are ordered by expected commission behind it.
 * Anything outside the tolerance follows in price order.
 *
 * Without prices (the common case, since these are links into other people's
 * search pages): fall back to expected commission, which is the best available
 * proxy and is what the panel already did crudely with a pays/doesn't-pay flag.
 */
export function rankBookOptions(options: BookOption[], opts: RankOptions = {}): RankedOption[] {
  const tolerance = opts.toleranceUsd ?? TOLERANCE_USD;
  const keyOf = opts.keyOf ?? ((o: BookOption) => o.name);
  const epcOf = (o: BookOption): number => {
    const raw = opts.epc?.[keyOf(o)];
    return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 0;
  };

  const priced = options.filter(o => typeof o.priceUsd === 'number' && Number.isFinite(o.priceUsd!));
  const unpriced = options.filter(o => !(typeof o.priceUsd === 'number' && Number.isFinite(o.priceUsd!)));

  // No prices anywhere: expected commission decides, stably.
  if (priced.length === 0) {
    const ordered = stableSort(options, (a, b) => epcOf(b) - epcOf(a));
    return ordered.map((o, i) => ({ ...o, rank: i + 1, reason: 'unpriced' as const }));
  }

  const cheapest = priced.reduce((a, b) => (a.priceUsd! <= b.priceUsd! ? a : b));
  const floor = cheapest.priceUsd!;

  // The cheapest leads, whatever it pays. This is the honesty half of the rule
  // and it is not negotiable: a user who finds a cheaper option we buried has
  // learned something about us that no commission recovers.
  const rest = priced.filter(o => o !== cheapest);
  const within = stableSort(
    rest.filter(o => o.priceUsd! - floor <= tolerance),
    (a, b) => epcOf(b) - epcOf(a),
  );
  const beyond = stableSort(
    rest.filter(o => o.priceUsd! - floor > tolerance),
    (a, b) => a.priceUsd! - b.priceUsd!,
  );
  // Options we cannot price sit after the priced ones, best-paying first —
  // we can't claim they're cheap, only that they're worth showing.
  const tail = stableSort(unpriced, (a, b) => epcOf(b) - epcOf(a));

  const ordered: Array<[BookOption, RankedOption['reason']]> = [
    [cheapest, 'cheapest'],
    ...within.map(o => [o, 'within-tolerance'] as [BookOption, RankedOption['reason']]),
    ...beyond.map(o => [o, 'priced-higher'] as [BookOption, RankedOption['reason']]),
    ...tail.map(o => [o, 'unpriced'] as [BookOption, RankedOption['reason']]),
  ];
  return ordered.map(([o, reason], i) => ({ ...o, rank: i + 1, reason }));
}

/**
 * Array.prototype.sort is stable in modern engines, but relying on that for
 * ordering that decides revenue attribution is the kind of assumption that goes
 * wrong quietly. Decorate with the original index instead.
 */
function stableSort<T>(arr: T[], cmp: (a: T, b: T) => number): T[] {
  return arr
    .map((v, i) => [v, i] as const)
    .sort((a, b) => cmp(a[0], b[0]) || a[1] - b[1])
    .map(([v]) => v);
}
