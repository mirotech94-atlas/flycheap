import 'server-only';
import type { SearchRow } from './db';

/**
 * The effective per-adult alert target for a route: its own override if set, otherwise the
 * user's (or global) default threshold. Single source of truth shared by the poller, the
 * dashboard, the digest email, and FarePilot — so "under target" means the same thing everywhere.
 */
export function effectiveTarget(
  search: Pick<SearchRow, 'target_per_adult_usd'>,
  userThreshold: number,
): number {
  const t = search.target_per_adult_usd;
  return typeof t === 'number' && t > 0 ? t : userThreshold;
}
