import 'server-only';
import { queries, type SearchRow } from './db';
import { searchFlights, pickCheapest, summarizeOffer } from './flightProvider';
import { notifyAll } from './notifier';
import { detectPriceDrop } from './priceDrops';

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

async function pollOne(search: SearchRow): Promise<PollResult> {
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

  const summary = summarizeOffer(cheapest, search.adults, search.infants);
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
  const threshold = parseFloat(
    queries.getUserSetting(ownerId, 'alert_threshold_per_adult_usd')
    ?? queries.getSetting('alert_threshold_per_adult_usd') ?? '900'
  );
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
  const underThreshold = summary.price_per_adult_usd < threshold;
  if (underThreshold) {
    const lastAlert = queries.lastAlertForSearch(search.id);
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

  // (2) Price-drop alert: significant dip vs 7-day median, even if still above target.
  if (!alerted) {
    const drop = detectPriceDrop(search.id, summary.price_per_adult_usd, dropPct);
    if (drop.isDrop) {
      const results = await notifyAll({
        kind: 'price-drop',
        search,
        fare: fareRow,
        thresholdPerAdult: threshold,
        pctDrop: drop.pctBelowMedian,
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

export async function pollAll(): Promise<PollResult[]> {
  const searches = queries.listActiveSearches();
  const out: PollResult[] = [];
  for (const s of searches) {
    out.push(await pollOne(s));
  }
  return out;
}

export async function pollSearch(searchId: number): Promise<PollResult | null> {
  const s = queries.getSearch(searchId);
  if (!s) return null;
  return pollOne(s);
}
