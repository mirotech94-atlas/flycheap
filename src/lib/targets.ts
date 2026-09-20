import 'server-only';
import type { SearchRow } from './db';
import {
  toWatch, amountOnBasis, basisLabel, resolveTarget,
  type TargetBasis, type FarePricing, type WatchRow,
} from './watch';

/**
 * The effective per-adult alert target for a route: its own override if set,
 * otherwise the user's (or global) default threshold. Single source of truth
 * shared by the poller, the dashboard, the digest email, and FarePilot — so
 * "under target" means the same thing everywhere.
 *
 * Kept per-adult because every existing caller reads it that way. New code
 * should prefer effectiveTargetOnBasis(), which honours the watch's own basis.
 */
export function effectiveTarget(
  search: Pick<SearchRow, 'target_per_adult_usd'>,
  userThreshold: number,
): number {
  const t = search.target_per_adult_usd;
  return typeof t === 'number' && t > 0 ? t : userThreshold;
}

export type TargetEvaluation = {
  /** The target, on its own basis. */
  targetAmount: number;
  basis: TargetBasis;
  /** What this fare costs on that same basis. */
  actualAmount: number;
  under: boolean | null;
  /** False when the party total was derived rather than quoted — the UI and the
   *  alert must state the assumption instead of silently quoting adult fares
   *  times five. */
  quoted: boolean;
  /** A trip target we could not complete with a hotel figure. Never compare. */
  incomplete: boolean;
  label: string;
};

/**
 * Evaluate a fare against a watch's target ON THE WATCH'S OWN BASIS.
 *
 * This is the change the spec asks for: "A family of five does not care that
 * the per-adult fare hit $412; they care what the booking costs." A watch with
 * no explicit basis resolves to per-adult, so every pre-existing row keeps
 * alerting exactly when it did — re-basing them silently would change when
 * every existing watch fires, which is the quiet behaviour change that destroys
 * trust in an alert product.
 *
 * Returns `under: null` when the question cannot be answered honestly (a trip
 * target with no hotel figure). A null must never render as "not under target".
 */
export function effectiveTargetOnBasis(
  row: WatchRow,
  userThreshold: number,
  fare: FarePricing,
): TargetEvaluation {
  const watch = toWatch(row);
  const resolved = resolveTarget(row);
  // No per-watch target: fall back to the user default, which has always been
  // expressed per adult.
  const targetAmount = resolved.amount ?? userThreshold;
  const basis: TargetBasis = resolved.amount == null ? 'per_adult' : resolved.basis;

  const on = amountOnBasis({ ...watch, target: { amount: targetAmount, basis } }, fare);
  return {
    targetAmount,
    basis,
    actualAmount: on.amountUsd,
    under: on.incomplete ? null : on.amountUsd < targetAmount,
    quoted: on.quoted,
    incomplete: on.incomplete,
    label: basisLabel(basis),
  };
}
