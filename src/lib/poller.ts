import 'server-only';
import { TIER_LIMITS, limitsForUser, getDb, queries, type SearchRow, type FareRow } from './db';
import { searchFlights, pickCheapest, summarizeOffer, type FlightOffer } from './flightProvider';
import { notifyAll, runSubscriptionAlerts } from './notifier';
import { detectPriceDrop, median7dForSearch } from './priceDrops';
import { effectiveTarget, effectiveTargetOnBasis } from './targets';
import { routeKey } from './providerCost';
import { classifyAlert, type AlertKind } from './alertKind';
import { verifyFare, type VerifyResult } from './fareTruth';
import { gateAlert } from './alertGate';
import {
  detectVerdictChange, detectTrendWarning, detectPostBookingDrop,
  detectWindowClosing, windowClosingMessage,
} from './alertDetectors';
import { recordVerdictCall } from './verdictScoring';
import { computeVerdict } from './verdict';
import { allocate, allocatorMode, dueForPoll } from './pollBudget';
import type { ProviderId } from './providers/types';

/** How far back the threshold branch looks for a previous alert when deciding
 *  whether a fare is "new news". Override with ALERT_FLOOR_DAYS to tune how
 *  aggressively a route re-arms; 0 restores the old unbounded behaviour. */
export const ALERT_FLOOR_DAYS = Number(process.env.ALERT_FLOOR_DAYS ?? 7);

export type PollResult = {
  search_id: number;
  origin: string;
  ok: boolean;
  cheapest_per_adult?: number;
  alerted?: boolean;
  alert_kind?: AlertKind;
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

/** Offers already fetched this cycle for a canonical route key. */
type SharedOffers = { cheapest: FlightOffer; offers: FlightOffer[] };

async function pollOne(
  search: SearchRow,
  shared?: SharedOffers,
  onFetched?: (o: SharedOffers) => void,
): Promise<PollResult> {
  // Another watcher of the same canonical route already paid for this exact
  // query on this cycle. Reuse the OFFERS — but still run the full evaluation,
  // because the poll is shared and the alert decision is not: watchers have
  // their own targets, their own alert floors and their own channels.
  if (shared) return finishPoll(search, shared.cheapest, shared.offers);

  // Any-dates routes never hit searchFlights — they have no date pair to price.
  if (search.date_mode === 'any') {
    const started = Date.now();
    const offer = await priceAnyDates(search);
    // Cache read, not a provider call — cost 0, tagged 'cache' so it never lands
    // in provider cost-per-route. A cold cache falls through to cheapestByMonth(),
    // whose real provider calls are costed inside the provider fan-out itself.
    queries.logApiCall({
      search_id: search.id, ok: !!offer, status_code: offer ? 200 : 0,
      ms: Date.now() - started, error: offer ? undefined : 'no cheapest window found',
      provider: 'cache', cost_usd: 0, phase: 'sweep',
      route_key: routeKey({ origin: search.origin, destination: search.destination,
        departDate: search.depart_date, returnDate: search.return_date,
        adults: search.adults, infants: search.infants }),
    });
    if (!offer) {
      return { search_id: search.id, origin: search.origin, ok: true, error: 'no cheapest window found' };
    }
    // Cache-sourced: no sibling offers, so verification must spend a call.
    if (onFetched) onFetched({ cheapest: offer, offers: [] });
    return finishPoll(search, offer, []);
  }

  // Per-provider api_calls rows (with cost) are written inside the provider
  // fan-out now, so there is deliberately no aggregate row here — a second row
  // would double-count the poll in every cost and volume figure.
  const result = await searchFlights({
    origin: search.origin,
    destination: search.destination,
    departDate: search.depart_date,
    returnDate: search.return_date,
    adults: search.adults,
    infants: search.infants,
  }, { searchId: search.id, phase: 'sweep' });

  if (!result.ok) {
    return { search_id: search.id, origin: search.origin, ok: false, error: result.error };
  }

  const cheapest = pickCheapest(result.offers);
  if (!cheapest) {
    return { search_id: search.id, origin: search.origin, ok: true, error: 'no offers returned' };
  }

  if (onFetched) onFetched({ cheapest, offers: result.offers });
  return finishPoll(search, cheapest, result.offers);
}

/**
 * Reserve the alerts_sent row, verify the fare, send, and keep the row only if
 * something landed.
 *
 * Ordering is the point. Every outbound link in the alert carries the id of the
 * alerts_sent row it descends from — that id is the alert -> click join, without
 * which commission-per-alert-type and alert -> click -> book conversion cannot be
 * computed. So the row is written first and threaded into the links; if no
 * channel succeeded it is rolled back, because alerts_sent is also the threshold
 * floor and a phantom row would silence the route on the next cycle.
 */
async function sendAlert(opts: {
  kind: AlertKind;
  search: SearchRow;
  fare: FareRow;
  snapshotId: number;
  thresholdPerAdult: number;
  ownerUserId: number;
  pctDrop?: number;
  median7d?: number | null;
  nearby?: { depart: string; return: string };
  offersInHand?: FlightOffer[];
  polledBy?: string | null;
  /** One line describing this alert, used if it is held for the digest. */
  headline?: string;
}): Promise<boolean> {
  // ── Channel discipline ──────────────────────────────────────────────────
  // Checked BEFORE the alert row is reserved and before a provider call is
  // spent on verification: a deferred alert must never become a phantom row in
  // alerts_sent, because that table is also the threshold floor.
  //
  // Quiet hours previously applied to push notifications ONLY — so email, the
  // channel most likely to wake someone, was the one with no quiet hours at
  // all, and the daily cap did not exist anywhere.
  const gate = gateAlert({ kind: opts.kind, search: opts.search, ownerUserId: opts.ownerUserId });
  if (!gate.send) {
    // Not a delivery failure: nobody was meant to be told yet. It must not be
    // counted as one, or the delivery alarm fires on working behaviour.
    //
    // And it must not simply vanish. A digest-only type — a trend warning — is
    // held by definition, so without recording it here "deferred" would be a
    // euphemism for "dropped" and the alert would be computed and then lost.
    if (gate.defer === 'digest' || gate.defer === 'quiet-hours') {
      try {
        queries.deferAlert({
          search_id: opts.search.id,
          user_id: opts.ownerUserId,
          kind: opts.kind,
          reason: gate.reason,
          headline: opts.headline
            ?? `${opts.search.origin} → ${opts.search.destination} · ${opts.kind.replace('-', ' ')}`,
          price_per_adult_usd: opts.fare.price_per_adult_usd,
        });
      } catch (e) {
        console.error('[poll] deferAlert failed:', (e as Error).message);
      }
    }
    console.log(
      `[poll] HELD ${opts.kind} for search ${opts.search.id} ` +
      `(${opts.search.origin}\u2192${opts.search.destination}): ${gate.reason}`,
    );
    return false;
  }

  // ── Verify before sending ───────────────────────────────────────────────
  // No alert leaves on the strength of a cached poll result. A suppressed alert
  // costs one possible booking; a dead-fare alert costs a user.
  let verified: VerifyResult;
  try {
    verified = await verifyFare({
      search: {
        id: opts.search.id,
        origin: opts.search.origin,
        destination: opts.search.destination,
        departDate: opts.search.depart_date,
        returnDate: opts.search.return_date,
        adults: opts.search.adults,
        infants: opts.search.infants,
      },
      polledPrice: opts.fare.price_per_adult_usd,
      polledBy: (opts.polledBy ?? null) as ProviderId | null,
      alertKind: opts.kind,
      offersInHand: opts.offersInHand,
    });
  } catch (e) {
    // A verification that THREW is not a verification that passed. Failing open
    // would quietly restore exactly the behaviour this guards against.
    console.error('[poll] verification threw:', (e as Error).message);
    verified = {
      outcome: 'unverified', priceToShow: opts.fare.price_per_adult_usd,
      verifiedAt: new Date().toISOString(), verifiedBy: [], deltaPct: null,
      sendable: false, reason: `verification error: ${(e as Error).message}`,
    };
  }

  try {
    queries.setFareVerification(opts.snapshotId, {
      verified_at: verified.verifiedAt,
      verified_price_usd: verified.priceToShow,
      verified_by: verified.verifiedBy.join(',') || null,
      verify_outcome: verified.outcome,
    });
  } catch (e) {
    console.error('[poll] setFareVerification failed:', (e as Error).message);
  }

  if (!verified.sendable) {
    try {
      queries.insertDeadFare({
        search_id: opts.search.id,
        fare_snapshot_id: opts.snapshotId,
        alert_kind: opts.kind,
        polled_price_usd: opts.fare.price_per_adult_usd,
        verified_price_usd: verified.outcome === 'dead' ? verified.priceToShow : null,
        delta_pct: verified.deltaPct,
        polled_by: opts.polledBy ?? null,
        verified_by: verified.verifiedBy.join(',') || null,
        reason: verified.reason,
      });
    } catch (e) {
      console.error('[poll] insertDeadFare failed:', (e as Error).message);
    }
    console.warn(
      `[poll] SUPPRESSED ${opts.kind} alert for search ${opts.search.id} ` +
      `(${opts.search.origin}\u2192${opts.search.destination}): ${verified.reason}`,
    );
    return false;
  }

  // Send the VERIFIED price. It differs whenever verification landed inside
  // tolerance, and it is the number we can stand behind at click time.
  const fare: FareRow = verified.priceToShow !== opts.fare.price_per_adult_usd
    ? { ...opts.fare, price_per_adult_usd: verified.priceToShow }
    : opts.fare;

  // Reserved, not sent. Every "what was the last alert" reader filters on
  // status, so this row is invisible to the email's own vs-last-alert
  // comparison and to the threshold floor until it earns 'sent'.
  const alertId = Number(
    queries.insertAlert(opts.search.id, opts.snapshotId, fare.price_per_adult_usd, opts.kind, 'pending')
      .lastInsertRowid,
  );

  let results: Awaited<ReturnType<typeof notifyAll>> = [];
  try {
    results = await notifyAll({
      // notifyAll's channel-selection vocabulary is narrower than the alert
      // taxonomy; mistake-fare and anomaly ride the threshold path but keep
      // their real kind in the database and in the links.
      kind: opts.kind === 'price-drop' ? 'price-drop' : opts.kind === 'ready' ? 'ready' : 'threshold',
      alertId,
      alertKind: opts.kind,
      verifiedAt: verified.verifiedAt,
      search: opts.search,
      fare,
      thresholdPerAdult: opts.thresholdPerAdult,
      pctDrop: opts.pctDrop,
      median7d: opts.median7d,
      ownerUserId: opts.ownerUserId,
      nearby: opts.nearby,
      // The channels the policy actually authorised — which is the per-watch
      // override when one is set, not the account default.
      channelsOverride: gate.channels,
    });
  } catch (e) {
    console.error('[poll] notifyAll threw:', (e as Error).message);
  }

  if (results.some(r => r.ok)) {
    queries.markAlertSent(alertId);
    // The ESP's id for the email, so its delivered/opened webhooks can be
    // joined back to this alert. Without it those events arrive about a
    // message nobody can identify.
    const emailId = results.find(r => r.channel === 'email' && r.ok)?.id;
    if (emailId) {
      try { queries.setAlertMessageId(alertId, emailId); }
      catch (e) { console.error('[poll] setAlertMessageId failed:', (e as Error).message); }
    }
    return true;
  }
  // Recorded before the rollback, because the rollback removes the only other
  // trace: without this the delivery-failure alarm has nothing to count.
  try {
    queries.logError({
      source: 'alert:delivery',
      message: `${opts.kind} alert for search ${opts.search.id} (${opts.search.origin}\u2192${opts.search.destination}) reached no channel`,
    });
  } catch { /* the alarm is best-effort; the rollback below is not */ }
  queries.deleteAlert(alertId);
  return false;
}

/** How far below this route's own 7-day normal the price sits, when derivable. */
function pctBelowNormalFor(searchId: number, pricePerAdult: number): number | null {
  const median = median7dForSearch(searchId);
  if (!median || median <= 0) return null;
  return ((median - pricePerAdult) / median) * 100;
}

/** Shared tail: snapshot the offer, evaluate alert rules, notify. */
async function finishPoll(
  search: SearchRow,
  cheapest: FlightOffer,
  offersInHand: FlightOffer[],
): Promise<PollResult> {
  const summary = summarizeOffer(cheapest, search.adults, search.infants);
  // Offers sourced from the /get_latest_prices month feed are usually NEARBY
  // dates (often weeks off the requested days), not the exact trip the user
  // tracks. Record them for coverage/history, but never fire a price alert on
  // them.
  //
  // "Usually", not "always": the month feed sometimes happens to return the
  // exact dates the search asked for. Treating the FEED as the signal rather
  // than the DATES made those fares permanently unalertable — JFK-SYD wanted
  // 2026-12-15, was quoted 2026-12-15, and was still suppressed as nearby. So
  // compare the dates and only call it nearby when they actually differ.
  const fromMonthFeed = ((cheapest as { raw?: { source?: string } }).raw?.source) === 'get_latest_prices';
  const day = (iso: string | null | undefined) => (iso ? String(iso).slice(0, 10) : null);
  const datesMatchRequest =
    search.date_mode !== 'any' &&
    day(cheapest.outbound_depart_iso) === day(search.depart_date) &&
    day(cheapest.return_depart_iso) === day(search.return_date);
  const isNearby = fromMonthFeed && !datesMatchRequest;
  // Passed to every channel so a shifted-date fare is labelled as such rather
  // than silently printed over the tracked dates.
  const nearbyDates = isNearby
    ? { depart: day(cheapest.outbound_depart_iso) ?? search.depart_date,
        return: day(cheapest.return_depart_iso) ?? search.return_date }
    : undefined;
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

  // Score our own calls. Recorded on every poll but deduped to one row per
  // search per day in SQL, because this measures a judgement, not a sample rate:
  // a frequently-polled route must not dominate the published accuracy figure by
  // volume alone.
  const history = queries.fareHistoryDaily(search.id, 30)
    .map(r => ({ polled_at: r.day, price_per_adult_usd: r.per_adult_usd }));
  // The last verdict BEFORE this poll — read first, because recordVerdictCall
  // below is about to write today's and we need the previous one to spot a flip.
  const previousVerdict = queries.lastVerdictFor(search.id) as 'buy' | 'wait' | 'hold' | null;
  const v = computeVerdict(history, summary.price_per_adult_usd, threshold);

  try {
    if (v) {
      recordVerdictCall({
        searchId: search.id,
        origin: search.origin, destination: search.destination,
        departDate: search.depart_date, returnDate: search.return_date,
        adults: search.adults, infants: search.infants,
        verdict: v.verdict, confidencePct: v.confidencePct,
        pricePerAdult: summary.price_per_adult_usd,
      });
    }
  } catch (e) {
    console.error('[poll] recordVerdictCall failed:', (e as Error).message);
  }

  let alerted = false;
  let alertKind: AlertKind | undefined;
  let dropPctActual: number | undefined;

  // (1) Threshold-cross alert: cheaper than user's target AND cheaper than the
  // last alert sent.
  //
  // Nearby-date fares used to be excluded here. That silenced four of five
  // live routes outright: the provider has no cache for their exact days and
  // only ever quotes a shifted departure, so no price could ever alert. A
  // labelled alert beats no alert — the notifier now prints the fare's own
  // dates and says plainly that they are not the tracked ones.
  // Evaluate against the watch's OWN basis. A family watching a party total
  // cares what the booking costs, not what one seat costs; a watch with no
  // explicit basis still resolves to per-adult, so nothing pre-existing
  // re-bases itself and starts alerting at a different moment.
  const targetEval = effectiveTargetOnBasis(search, userThreshold, {
    perAdultUsd: summary.price_per_adult_usd,
    partyTotalUsd: summary.total_price_usd,
  });
  // `under: null` means the question could not be answered honestly (a trip
  // target with no hotel figure). Not an alert, and not a silent "no" either —
  // it simply does not fire, and the dead-fare/verification path is unaffected.
  const underThreshold = targetEval.under === true;
  if (underThreshold) {
    const lastAlert = queries.lastAlertForSearch(search.id, ALERT_FLOOR_DAYS);
    if (!lastAlert || summary.price_per_adult_usd < lastAlert.price_per_adult_usd) {
      const kind = classifyAlert({
        branch: 'threshold',
        pricePerAdult: summary.price_per_adult_usd,
        thresholdPerAdult: threshold,
        pctBelowNormal: pctBelowNormalFor(search.id, summary.price_per_adult_usd),
      });
      const sent = await sendAlert({
        kind, search, fare: fareRow, snapshotId,
        thresholdPerAdult: threshold, ownerUserId: ownerId,
        nearby: nearbyDates, offersInHand, polledBy: cheapest.provider,
      });
      if (sent) {
        alerted = true;
        alertKind = kind;
      }
    }
  }

  // (1.5) "Ready"-alert: search was queued via /api/offers/queue-alert because
  // the on-demand poll timed out. The first time we successfully land a fare,
  // notify the owner regardless of threshold — they're waiting for ANY price.
  if (!alerted && !isNearby) {
    const readyKey = `notify_when_ready:search:${search.id}`;
    if (queries.getUserSetting(ownerId, readyKey) === '1') {
      const kind = classifyAlert({
        branch: 'ready',
        pricePerAdult: summary.price_per_adult_usd,
        thresholdPerAdult: threshold,
      });
      const sent = await sendAlert({
        kind, search, fare: fareRow, snapshotId,
        thresholdPerAdult: threshold, ownerUserId: ownerId,
        offersInHand, polledBy: cheapest.provider,
      });
      if (sent) {
        queries.deleteUserSetting(ownerId, readyKey);
        alerted = true;
        alertKind = kind;
      }
    }
  }

  // (2) Price-drop alert: significant dip vs 7-day median, even if still above
  // target. This is the anomaly detector — it needs the stored history to mean
  // anything, so it is a paid capability. Free users still get every
  // threshold alert above; they just don't get "this is unusually cheap".
  const ownerLimits = limitsForUser(queries.getUserById(ownerId));
  if (!alerted && ownerLimits.priceDropAlerts) {
    const drop = detectPriceDrop(search.id, summary.price_per_adult_usd, dropPct, ALERT_FLOOR_DAYS);
    if (drop.isDrop) {
      const kind = classifyAlert({
        branch: 'price-drop',
        pricePerAdult: summary.price_per_adult_usd,
        thresholdPerAdult: threshold,
        pctBelowNormal: drop.pctBelowMedian,
      });
      const sent = await sendAlert({
        kind, search, fare: fareRow, snapshotId,
        thresholdPerAdult: threshold, ownerUserId: ownerId,
        pctDrop: drop.pctBelowMedian, median7d: drop.median7d,
        nearby: nearbyDates, offersInHand, polledBy: cheapest.provider,
      });
      if (sent) {
        alerted = true;
        alertKind = kind;
        dropPctActual = drop.pctBelowMedian;
      }
    }
  }

  // ── The four types the portal spec adds ─────────────────────────────────
  // Each is an independent question about this watch, so they are evaluated
  // even when something above already fired — except that only one message per
  // poll is sent, which the `alerted` guard enforces. The frequency cap in the
  // gate is the real protection; this just avoids two messages in one cycle.
  const daysOut = daysUntilDeparture(search.depart_date);
  const watchStatus = (search as { status?: string | null }).status ?? 'active';
  const bookedAmount = (search as { booked_amount_usd?: number | null }).booked_amount_usd ?? null;

  // (3) Post-booking drop — the one people tell their friends about. Evaluated
  //     FIRST among the new types, and deliberately not gated on `alerted`:
  //     money the traveller can still recover outranks a threshold notice.
  if (watchStatus === 'booked' && bookedAmount != null) {
    const drop = detectPostBookingDrop({
      bookedAmountUsd: bookedAmount,
      currentAmountUsd: summary.price_per_adult_usd,
      departed: daysOut != null && daysOut < 0,
    });
    if (drop.fires) {
      const sent = await sendAlert({
        kind: 'post-booking-drop', search, fare: fareRow, snapshotId,
        thresholdPerAdult: threshold, ownerUserId: ownerId,
        offersInHand, polledBy: cheapest.provider,
        headline: `${search.origin} → ${search.destination} has dropped $${Math.round(drop.savingUsd)} `
          + `since you booked — it may be worth asking about a rebooking.`,
      });
      if (sent) { alerted = true; alertKind = 'post-booking-drop'; }
    }
  }

  // (4) Verdict change — wait flipped to buy.
  if (!alerted && v && detectVerdictChange({ previous: previousVerdict, current: v.verdict })) {
    const sent = await sendAlert({
      kind: 'verdict-change', search, fare: fareRow, snapshotId,
      thresholdPerAdult: threshold, ownerUserId: ownerId,
      offersInHand, polledBy: cheapest.provider,
      headline: `${search.origin} → ${search.destination}: we've changed our call from wait to buy.`,
    });
    if (sent) { alerted = true; alertKind = 'verdict-change'; }
  }

  // (5) Window closing — once, seven days out, and only when waiting has
  //     stopped being the better advice.
  if (!alerted && v && watchStatus !== 'booked') {
    const fires = detectWindowClosing({
      daysToDeparture: daysOut,
      booked: false,
      slopePerDay: v.slopePerDay,
      alreadySent: queries.hasEverAlerted(search.id, 'window-closing'),
    });
    if (fires) {
      const sent = await sendAlert({
        kind: 'window-closing', search, fare: fareRow, snapshotId,
        thresholdPerAdult: threshold, ownerUserId: ownerId,
        offersInHand, polledBy: cheapest.provider,
        headline: windowClosingMessage({
          route: `${search.origin} → ${search.destination}`,
          daysToDeparture: daysOut ?? 0,
          currentPrice: summary.price_per_adult_usd,
          median: v.median,
        }),
      });
      if (sent) { alerted = true; alertKind = 'window-closing'; }
    }
  }

  // (6) Trend warning — digest only, always. The gate will hold it, which is
  //     the point: it is worth knowing at breakfast and never worth an
  //     interruption. It reaches the reader through deferred_alerts.
  if (!alerted && v && watchStatus !== 'booked') {
    if (detectTrendWarning({
      slopePerDay: v.slopePerDay,
      currentPrice: summary.price_per_adult_usd,
      median: v.median,
      threshold,
    })) {
      await sendAlert({
        kind: 'trend-warning', search, fare: fareRow, snapshotId,
        thresholdPerAdult: threshold, ownerUserId: ownerId,
        offersInHand, polledBy: cheapest.provider,
        headline: `${search.origin} → ${search.destination} is rising (about `
          + `$${Math.round(v.slopePerDay)}/day) and we don't expect it to come back soon.`,
      });
      // Never sets `alerted`: a held alert did not alert anyone.
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
/** Days until departure; negative once it has passed. */
function daysUntilDeparture(departDate: string | null | undefined): number | null {
  if (!departDate) return null;
  const t = Date.parse(`${String(departDate).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(t) ? null : Math.round((t - Date.now()) / 86_400_000);
}

/** Last poll time for every search, in one query rather than N. */
function lastPolledMap(ids: number[]): Map<number, string | null> {
  const out = new Map<number, string | null>();
  if (ids.length === 0) return out;
  const rows = getDb().prepare(
    `SELECT search_id, MAX(polled_at) AS t FROM fare_snapshots
      WHERE search_id IN (${ids.map(() => '?').join(',')}) GROUP BY search_id`,
  ).all(...ids) as Array<{ search_id: number; t: string | null }>;
  for (const r of rows) out.set(r.search_id, r.t);
  return out;
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

  // Score every route, band it, and spend the budget top-down. See pollBudget.ts
  // for why this runs at 'tier-capped' authority by default: at full authority it
  // would poll a paying customer's low-priority routes more slowly than the
  // cadence the pricing page sells them.
  const { routes, budget } = allocate(searches);
  const bandFor = new Map(routes.map(r => [r.searchId, r]));
  const lastPolled = lastPolledMap(searches.map(s => s.id));
  const mode = allocatorMode();

  // Deduplication: two users watching the same canonical route with overlapping
  // date windows are ONE poll, and the offers are fanned out. At any scale this
  // is the difference between linear and sub-linear cost growth.
  const offersThisCycle = new Map<string, SharedOffers>();

  const out: PollResult[] = [];
  let skipped = 0;
  let deduped = 0;
  const byBand: Record<string, number> = {};

  // Highest-priority routes first, so a budget that runs out mid-cycle runs out
  // on the routes that mattered least.
  const ordered = [...searches].sort(
    (a, b) => (bandFor.get(b.id)?.score ?? 0) - (bandFor.get(a.id)?.score ?? 0),
  );

  for (const s of ordered) {
    const scored = bandFor.get(s.id);
    const band = scored?.band ?? 'warm';
    if (!dueForPoll({ band, userId: s.user_id ?? 1, lastPolledAt: lastPolled.get(s.id) ?? null, mode })) {
      skipped++;
      continue;
    }

    // Already priced this exact canonical query on this cycle. Reuse the offers
    // and skip the provider call, but STILL evaluate this watcher's own alert
    // rules against them — sharing the decision would stop the second watcher
    // ever being alerted, and would stop their snapshot row being written, so
    // they would be starved on every cycle after.
    const key = scored?.routeKey;
    const shared = key ? offersThisCycle.get(key) : undefined;
    if (shared) deduped++;
    else byBand[band] = (byBand[band] ?? 0) + 1;

    out.push(await pollOne(s, shared, o => { if (key) offersThisCycle.set(key, o); }));
  }

  const bandSummary = Object.entries(byBand).map(([b, n]) => `${b}:${n}`).join(' ') || 'none';
  console.log(
    `[poll] ${out.length - deduped} polled (${bandSummary}), ${deduped} evaluated from a shared poll, ` +
    `${skipped} not yet due · allocator=${mode}` +
    (budget.monthlyCapUsd > 0
      ? ` · budget $${budget.spentThisMonthUsd.toFixed(2)}/$${budget.monthlyCapUsd.toFixed(2)}` +
        ` (${(budget.utilisation * 100).toFixed(0)}%)`
      : ''),
  );
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
