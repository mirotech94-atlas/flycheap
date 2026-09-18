import 'server-only';
import { TIER_LIMITS, limitsForUser, getDb, queries, type SearchRow } from './db';
import { searchFlights, pickCheapest, summarizeOffer, type FlightOffer } from './flightProvider';
import { notifyAll, runSubscriptionAlerts } from './notifier';
import { detectPriceDrop } from './priceDrops';
import { effectiveTarget } from './targets';

/** How far back the threshold branch looks for a previous alert when deciding
 *  whether a fare is "new news". Override with ALERT_FLOOR_DAYS to tune how
 *  aggressively a route re-arms; 0 restores the old unbounded behaviour. */
const ALERT_FLOOR_DAYS = Number(process.env.ALERT_FLOOR_DAYS ?? 7);

export type PollResult = {
  search_id: number;
  origin: string;
  ok: boolean;
  cheapest_per_adult?: number;
  alerted?: boolean;
  alert_kind?: 'threshold' | 'price-drop';
  drop_pct?: number;
  error?: string;
};

/**
 * Price a route that is tracked WITHOUT fixed dates ("any dates" mode).
 * Order of preference, cheapest data source first:
 *   1. best_deals_cache — the 12-month scan, refreshed every 12h, free to read.
 *   2. cheapest_month_cache — our own 6h cache of the per-month fan-out.
 *   3. cheapestByMonth() — 12 provider calls; only when both caches are cold.
 * Returns an offer-shaped object so the rest of pollOne is unchanged.
 */
function asOffer(o: {
  provider: string; per_adult_usd: number; total_party_usd: number;
  outbound_flight_no: string; return_flight_no: string;
  outbound_depart_iso: string; return_depart_iso: string | null;
  raw: Record<string, unknown>;
}): FlightOffer {
  const leg = (flightNo: string, at: string) => {
    const m = flightNo.match(/^([A-Z0-9]{2})(\d*)/);
    return { airline: m?.[1] ?? '', flight_number: m?.[2] ?? '', departure_at: at, transfers: 0 };
  };
  return {
    provider: o.provider,
    per_adult_usd: o.per_adult_usd,
    total_party_usd: o.total_party_usd,
    outbound_flight_no: o.outbound_flight_no,
    return_flight_no: o.return_flight_no,
    outbound_depart_iso: o.outbound_depart_iso,
    return_depart_iso: o.return_depart_iso ?? o.outbound_depart_iso,
    outbound_transfers: 0,
    return_transfers: 0,
    airline: leg(o.outbound_flight_no, o.outbound_depart_iso).airline,
    raw: o.raw,
    totalPerAdult: o.per_adult_usd,
    outbound: leg(o.outbound_flight_no, o.outbound_depart_iso),
    inbound: leg(o.return_flight_no, o.return_depart_iso ?? o.outbound_depart_iso),
  } as FlightOffer;
}

async function priceAnyDates(search: SearchRow): Promise<FlightOffer | null> {
  const best = queries.cheapestFromBestDeals(search.origin, search.destination);
  if (best) {
    return asOffer({
      provider: best.provider || 'travelpayouts',
      per_adult_usd: best.per_adult_usd,
      total_party_usd: best.party_total_usd,
      outbound_flight_no: best.outbound_flight_no ?? '',
      return_flight_no: best.return_flight_no ?? '',
      outbound_depart_iso: best.outbound_date,
      return_depart_iso: best.return_date,
      raw: { source: 'best_deals_cache' },
    });
  }

  let months = queries.cheapestMonthCached(search.origin, search.destination, 6);
  if (months.length === 0) {
    const { cheapestByMonth } = await import('./explore');
    const fresh = await cheapestByMonth(search.origin, search.destination);
    for (const m of fresh) {
      queries.upsertCheapestMonth({
        origin: search.origin, destination: search.destination, month: m.month,
        price_usd: m.price, depart_date: m.depart_date, return_date: m.return_date,
      });
    }
    months = queries.cheapestMonthCached(search.origin, search.destination, 6);
  }
  const top = months[0];
  if (!top) return null;
  return asOffer({
    provider: 'travelpayouts',
    per_adult_usd: top.price_usd,
    total_party_usd: top.price_usd * search.adults + top.price_usd * 0.10 * search.infants,
    outbound_flight_no: '',
    return_flight_no: '',
    outbound_depart_iso: top.depart_date,
    return_depart_iso: top.return_date,
    raw: { source: 'cheapest_month_cache', month: top.month },
  });
}

async function pollOne(search: SearchRow): Promise<PollResult> {
  // Any-dates routes never hit searchFlights — they have no date pair to price.
  if (search.date_mode === 'any') {
    const started = Date.now();
    const offer = await priceAnyDates(search);
    queries.logApiCall({
      search_id: search.id, ok: !!offer, status_code: offer ? 200 : 0,
      ms: Date.now() - started, error: offer ? undefined : 'no cheapest window found',
    });
    if (!offer) {
      return { search_id: search.id, origin: search.origin, ok: true, error: 'no cheapest window found' };
    }
    return finishPoll(search, offer);
  }

  const result = await searchFlights({
    origin: search.origin,
    destination: search.destination,
    departDate: search.depart_date,
    returnDate: search.return_date,
    adults: search.adults,
    infants: search.infants,
  });

  queries.logApiCall({
    search_id: search.id,
    ok: result.ok,
    status_code: result.status,
    ms: result.ms,
    error: result.ok ? undefined : result.error,
  });

  if (!result.ok) {
    return { search_id: search.id, origin: search.origin, ok: false, error: result.error };
  }

  const cheapest = pickCheapest(result.offers);
  if (!cheapest) {
    return { search_id: search.id, origin: search.origin, ok: true, error: 'no offers returned' };
  }

  return finishPoll(search, cheapest);
}

/** Shared tail: snapshot the offer, evaluate alert rules, notify. */
async function finishPoll(search: SearchRow, cheapest: FlightOffer): Promise<PollResult> {
  const summary = summarizeOffer(cheapest, search.adults, search.infants);
  // Offers sourced from the /get_latest_prices month feed are NEARBY dates
  // (often weeks off the requested days), not the exact trip the user tracks.
  // Record them for coverage/history, but never fire a price alert on them.
  const isNearby = ((cheapest as { raw?: { source?: string } }).raw?.source) === 'get_latest_prices';
  const inserted = queries.insertFare({
    search_id: search.id,
    ...summary,
    raw_json: JSON.stringify(cheapest),
  });
  const snapshotId = Number(inserted.lastInsertRowid);

  // Per-tenant settings: each search belongs to a user; use that user's
  // threshold/drop-pct/email if set, otherwise fall back to the global default.
  // This is what makes alerts actually multi-tenant — every owner gets their
  // own target price and notification address, even though the cron runs once.
  const ownerId = search.user_id ?? 1;
  const userThreshold = parseFloat(
    queries.getUserSetting(ownerId, 'alert_threshold_per_adult_usd')
    ?? queries.getSetting('alert_threshold_per_adult_usd') ?? '900'
  );
  // Per-route override at the single definition point, so the underThreshold check,
  // the target shown in the alert, and the recorded alert all use the same value.
  const threshold = effectiveTarget(search, userThreshold);
  const dropPct = parseFloat(
    queries.getUserSetting(ownerId, 'price_drop_pct')
    ?? queries.getSetting('price_drop_pct') ?? '10'
  );

  const fareRow = {
    id: snapshotId,
    search_id: search.id,
    polled_at: new Date().toISOString(),
    ...summary,
    raw_json: JSON.stringify(cheapest),
  };

  let alerted = false;
  let alertKind: 'threshold' | 'price-drop' | undefined;
  let dropPctActual: number | undefined;

  // (1) Threshold-cross alert: cheaper than user's target AND cheaper than the last alert sent.
  const underThreshold = !isNearby && summary.price_per_adult_usd < threshold;
  if (underThreshold) {
    const lastAlert = queries.lastAlertForSearch(search.id, ALERT_FLOOR_DAYS);
    if (!lastAlert || summary.price_per_adult_usd < lastAlert.price_per_adult_usd) {
      const results = await notifyAll({
        kind: 'threshold',
        search,
        fare: fareRow,
        thresholdPerAdult: threshold,
        ownerUserId: ownerId,
      });
      const anyOk = results.some(r => r.ok);
      if (anyOk) {
        queries.insertAlert(search.id, snapshotId, summary.price_per_adult_usd);
        alerted = true;
        alertKind = 'threshold';
      }
    }
  }

  // (1.5) "Ready"-alert: search was queued via /api/offers/queue-alert because
  // the on-demand poll timed out. The first time we successfully land a fare,
  // notify the owner regardless of threshold — they're waiting for ANY price.
  if (!alerted && !isNearby) {
    const readyKey = `notify_when_ready:search:${search.id}`;
    if (queries.getUserSetting(ownerId, readyKey) === '1') {
      const results = await notifyAll({
        kind: 'ready',
        search,
        fare: fareRow,
        thresholdPerAdult: threshold,
        ownerUserId: ownerId,
      });
      const anyOk = results.some(r => r.ok);
      if (anyOk) {
        queries.insertAlert(search.id, snapshotId, summary.price_per_adult_usd);
        queries.deleteUserSetting(ownerId, readyKey);
        alerted = true;
        alertKind = 'threshold';
      }
    }
  }

  // (2) Price-drop alert: significant dip vs 7-day median, even if still above
  // target. This is the anomaly detector — it needs the stored history to mean
  // anything, so it is a paid capability. Free users still get every
  // threshold alert above; they just don't get "this is unusually cheap".
  const ownerLimits = limitsForUser(queries.getUserById(ownerId));
  if (!alerted && ownerLimits.priceDropAlerts && !isNearby) {
    const drop = detectPriceDrop(search.id, summary.price_per_adult_usd, dropPct);
    if (drop.isDrop) {
      const results = await notifyAll({
        kind: 'price-drop',
        search,
        fare: fareRow,
        thresholdPerAdult: threshold,
        pctDrop: drop.pctBelowMedian,
        median7d: drop.median7d,
        ownerUserId: ownerId,
      });
      const anyOk = results.some(r => r.ok);
      if (anyOk) {
        queries.insertAlert(search.id, snapshotId, summary.price_per_adult_usd);
        alerted = true;
        alertKind = 'price-drop';
        dropPctActual = drop.pctBelowMedian;
      }
    }
  }

  return {
    search_id: search.id,
    origin: search.origin,
    ok: true,
    cheapest_per_adult: summary.price_per_adult_usd,
    alerted,
    alert_kind: alertKind,
    drop_pct: dropPctActual,
  };
}

/**
 * Per-tier polling cadence (the "priority 5-minute polling" Pro promise).
 * The scheduler fires every 5 min; a search is only re-polled once its
 * owner's TIER_LIMITS.pollIntervalMin has elapsed since its last snapshot.
 * Manual "Poll now" (pollSearch) bypasses this.
 */
function dueForPoll(s: { id: number; user_id: number }): boolean {
  // limitsForUser (not a bare tier lookup) so a founding-trial account polls
  // at the Pro cadence it was promised rather than the free one.
  const interval = limitsForUser(queries.getUserById(s.user_id)).pollIntervalMin;
  const row = getDb().prepare('SELECT MAX(polled_at) AS t FROM fare_snapshots WHERE search_id = ?').get(s.id) as { t: string | null };
  if (!row?.t) return true;
  const ageMin = (Date.now() - new Date(row.t.replace(' ', 'T') + (row.t.endsWith('Z') ? '' : 'Z')).getTime()) / 60000;
  return ageMin >= interval - 1; // 1-min slack so a 30-min tier isn't skipped by scheduler jitter
}

export async function pollAll(): Promise<PollResult[]> {
  // Founding periods that just ended → mark + one-time upgrade nudge email.
  try {
    const { sendUpgradeNudgeEmail } = await import('./billing-emails');
    for (const u of queries.dueFoundingUpgrades()) {
      queries.markUpgradeDue(u.id);
      await sendUpgradeNudgeEmail(u.email);
    }
  } catch (e) { console.error('[poll] founding-period sweep failed:', (e as Error).message); }
  const searches = queries.listActiveSearches();
  const out: PollResult[] = [];
  let skipped = 0;
  for (const s of searches) {
    if (!dueForPoll(s)) { skipped++; continue; }
    out.push(await pollOne(s));
  }
  if (skipped) console.log(`[poll] ${out.length} polled, ${skipped} not yet due (tier cadence)`);
  // Fan out Slack/Telegram bot subscriptions (`/watch ORIG DEST PRICE`).
  // Best-effort: a failure here must never break the owner's search poll.
  try {
    const fan = await runSubscriptionAlerts();
    if (fan.routes > 0) {
      console.log(`[poll] subscription alerts: ${fan.routes} routes, ${fan.posted} posted, ${fan.errors} errors`);
    }
  } catch (e) {
    console.error('[poll] runSubscriptionAlerts failed:', e);
  }
  return out;
}

export async function pollSearch(searchId: number): Promise<PollResult | null> {
  const s = queries.getSearch(searchId);
  if (!s) return null;
  return pollOne(s);
}
