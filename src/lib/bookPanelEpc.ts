import 'server-only';
import { getDb } from './db';

/**
 * Expected commission per click, per partner — DERIVED from our own history.
 *
 * This is the input the Book panel's ordering needs, and it is exactly the kind
 * of number that must not be typed into a table and forgotten. We already have
 * the raw material: every click is a row, every settled commission is a row, and
 * the two join on the click token. So earnings-per-click is measurable.
 *
 * The honest part is the sample gate. With three clicks and one lucky booking a
 * partner would score $40/click and permanently lead the panel. Below
 * MIN_CLICKS a partner gets NO derived figure at all and the caller falls back
 * to whatever ordering it uses when it knows nothing — never to a guess dressed
 * up as data.
 */

/** Below this many clicks in the window, a partner's EPC is not a measurement. */
export const MIN_CLICKS = 30;
/** How far back to look. Long enough to accumulate, short enough to stay current. */
export const WINDOW_DAYS = 90;

export type EpcRow = {
  provider: string;
  clicks: number;
  commissionUsd: number;
  /** null when the sample is too small to state one. */
  epcUsd: number | null;
};

/**
 * Per-partner EPC over the window. Commissions are joined through the click
 * token, so a partner only gets credit for revenue we can actually attribute to
 * a click — which is the whole point of the sub-ID scheme.
 */
export function epcByProvider(windowDays = WINDOW_DAYS): EpcRow[] {
  const rows = getDb().prepare(
    `SELECT c.provider AS provider,
            COUNT(DISTINCT c.id) AS clicks,
            COALESCE(SUM(ce.amount_usd), 0) AS commissionUsd
       FROM affiliate_clicks c
       LEFT JOIN commission_events ce ON ce.click_token = c.token
      WHERE c.provider IS NOT NULL
        AND c.occurred_at >= datetime('now', ?)
      GROUP BY c.provider`,
  ).all(`-${Math.floor(windowDays)} days`) as Array<{
    provider: string; clicks: number; commissionUsd: number;
  }>;

  return rows.map(r => ({
    ...r,
    epcUsd: r.clicks >= MIN_CLICKS ? r.commissionUsd / r.clicks : null,
  }));
}

/**
 * The map the ranking function takes. Only partners with a real measurement
 * appear; everything else is absent, and absent scores zero rather than
 * inheriting an invented rate.
 */
export function derivedEpcMap(windowDays = WINDOW_DAYS): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of epcByProvider(windowDays)) {
    if (r.epcUsd != null) out[r.provider] = r.epcUsd;
  }
  return out;
}

/**
 * Is there enough measured history for commission-ordering to mean anything?
 *
 * When this is false the panel should keep its existing ordering rather than
 * reshuffle itself on noise. Surfaced so the admin view can say which it is.
 */
export function hasUsableEpc(windowDays = WINDOW_DAYS): boolean {
  return Object.keys(derivedEpcMap(windowDays)).length > 0;
}
