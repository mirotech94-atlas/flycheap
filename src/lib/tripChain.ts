import 'server-only';
import crypto from 'node:crypto';
import { getDb, queries } from './db';
import { APP_URL } from './hosts';

/**
 * The monetization chain.
 *
 * One alert, one intent spike, six chances to earn. The design principle is
 * "never interrupt the booking, always follow it" — the fare alert itself stays
 * clean, and everything commercial happens afterwards, on a trip the user has
 * confirmed they actually booked.
 *
 * FOUR RULES, ENFORCED HERE RATHER THAN REMEMBERED
 *
 *  1. Nothing fires until the user confirms BOOKED. Guessing wrong and sending
 *     hotel offers to someone who did not book is how a trusted alert becomes
 *     spam, and the alert channel is worth more than any of these sends.
 *  2. One monetized email per user per day, hard cap, across every sequence.
 *  3. Commercial sends unsubscribe INDEPENDENTLY of fare alerts. Bundling them
 *     loses the alert channel along with the marketing one.
 *  4. The affiliate disclosure stays visible.
 *
 * Why the trip opens at all: the flight is under a third of a trip's spend and
 * the worst-paying third of it. A Barcelona trip is a $484 flight and $600–900
 * of hotel, plus transfer, insurance and a data SIM. The fare engine is not the
 * thing to monetize — it is the highest-intent trigger we will ever get, and its
 * job is to open a trip.
 */

export type TripStatus = 'pending' | 'booked' | 'deciding' | 'expired';

export type ChainStage =
  | 'confirm'        // "did you get the fare?" — the intent signal
  | 'stay'           // same day      — hotels, the big one
  | 'transfer'       // +1 day        — getting in from the airport
  | 'insurance'      // +3 days       — cover for the trip
  | 'esim'           // +7 days       — data while away
  | 'tours'          // −14 days from departure
  | 'compensation'   // +3 days after return
  | 'nudge';         // still-deciding branch — retention, NOT monetization

export type StageSpec = {
  stage: ChainStage;
  /** Minutes after the trip is confirmed booked. Null when anchored to travel. */
  offsetMinutesFromBooking: number | null;
  /** Days relative to departure (negative = before). */
  daysFromDeparture?: number;
  /** Days after the return date. */
  daysFromReturn?: number;
  /** Whether this send is monetized — counts against the daily cap and the
   *  commercial unsubscribe. The nudge is neither. */
  monetized: boolean;
  label: string;
};

/**
 * The chain, exactly as specified. Each step is its own send, spaced, and
 * independently monetized.
 *
 * The compensation row deserves its attention: delay-compensation partners pay
 * well, fire on a trip whose flight number and date we already hold, cost the
 * user nothing, and are the rare affiliate email people are pleased to receive.
 */
export const CHAIN: StageSpec[] = [
  { stage: 'stay',         offsetMinutesFromBooking: 60,        monetized: true,  label: 'Where to stay, for those dates' },
  { stage: 'transfer',     offsetMinutesFromBooking: 60 * 24,   monetized: true,  label: 'Getting in from the airport' },
  { stage: 'insurance',    offsetMinutesFromBooking: 60 * 24 * 3, monetized: true, label: 'Cover for the trip' },
  { stage: 'esim',         offsetMinutesFromBooking: 60 * 24 * 7, monetized: true, label: 'Data while away' },
  { stage: 'tours',        offsetMinutesFromBooking: null, daysFromDeparture: -14, monetized: true, label: 'Things to do, tables to book' },
  { stage: 'compensation', offsetMinutesFromBooking: null, daysFromReturn: 3,      monetized: true, label: 'Was the flight late?' },
];

/** The still-deciding branch. Retention, and it must look nothing like the booked one. */
export const NUDGE: StageSpec = {
  stage: 'nudge', offsetMinutesFromBooking: 60 * 24 * 2, monetized: false,
  label: 'How the fare has moved since',
};

/** How long after a Book click we ask whether they got it. */
export const CONFIRM_DELAY_MIN = 20;
export const CONFIRM_DELAY_MAX = 40;

/** Hard cap: monetized emails per user per day, across every sequence. */
export const DAILY_MONETIZED_CAP = 1;

const db = () => getDb();

function addMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString().replace('T', ' ').slice(0, 19);
}

function atDateOffset(isoDate: string | null | undefined, days: number): string | null {
  if (!isoDate) return null;
  const t = Date.parse(`${isoDate.slice(0, 10)}T09:00:00Z`);
  if (Number.isNaN(t)) return null;
  return new Date(t + days * 86_400_000).toISOString().replace('T', ' ').slice(0, 19);
}

// ---------------------------------------------------------------------------
// Opening a trip
// ---------------------------------------------------------------------------

export type Trip = {
  id: string; user_id: number | null; click_token: string | null; search_id: number | null;
  origin: string; destination: string; depart_date: string | null; return_date: string | null;
  adults: number; fare_per_adult_usd: number | null; status: TripStatus;
  confirmed_at: string | null; created_at: string;
};

/**
 * A Book click is a probable booking. Open a pending trip and queue the soft
 * confirmation — one email, 20–40 minutes later. That click is the most valuable
 * data point in the product: it is the only ground truth on conversion, it
 * drives everything below it, and it tells us which alert types actually work.
 *
 * Returns null when there is nothing to follow up — no user to email, or this
 * click already opened a trip.
 */
export function openTripFromClick(opts: {
  clickToken: string;
  userId: number | null;
  searchId: number | null;
  origin: string; destination: string;
  departDate: string | null; returnDate: string | null;
  adults?: number;
  farePerAdultUsd?: number | null;
}): Trip | null {
  // No user means no address to ask, and we never email a non-logged-in clicker.
  if (!opts.userId) return null;

  const existing = db().prepare('SELECT * FROM trips WHERE click_token = ?').get(opts.clickToken) as Trip | undefined;
  if (existing) return existing;

  const id = crypto.randomUUID();
  db().prepare(
    `INSERT INTO trips (id, user_id, click_token, search_id, origin, destination,
                        depart_date, return_date, adults, fare_per_adult_usd, status)
     VALUES (@id, @user_id, @click_token, @search_id, @origin, @destination,
             @depart_date, @return_date, @adults, @fare, 'pending')`,
  ).run({
    id, user_id: opts.userId, click_token: opts.clickToken, search_id: opts.searchId,
    origin: opts.origin, destination: opts.destination,
    depart_date: opts.departDate, return_date: opts.returnDate,
    adults: opts.adults ?? 1, fare: opts.farePerAdultUsd ?? null,
  });

  // Jittered inside the window so a batch of clicks does not produce a
  // synchronised batch of emails.
  const delay = CONFIRM_DELAY_MIN + Math.random() * (CONFIRM_DELAY_MAX - CONFIRM_DELAY_MIN);
  queueStage(id, 'confirm', addMinutes(delay));

  return getTrip(id);
}

export function getTrip(id: string): Trip | null {
  return (db().prepare('SELECT * FROM trips WHERE id = ?').get(id) as Trip | undefined) ?? null;
}

/** Queue one stage. The UNIQUE(trip_id, stage) index makes this idempotent. */
export function queueStage(tripId: string, stage: ChainStage, scheduledFor: string): void {
  db().prepare(
    `INSERT OR IGNORE INTO chain_sends (trip_id, stage, scheduled_for) VALUES (?, ?, ?)`,
  ).run(tripId, stage, scheduledFor);
}

// ---------------------------------------------------------------------------
// The answer
// ---------------------------------------------------------------------------

/** Mint a single-use token for the booked / still-deciding answer. */
export function mintConfirmToken(tripId: string, ttlDays = 30): string {
  const token = crypto.randomBytes(18).toString('base64url');
  db().prepare(
    `INSERT INTO trip_confirm_tokens (token, trip_id, expires_at)
     VALUES (?, ?, datetime('now', ?))`,
  ).run(token, tripId, `+${ttlDays} days`);
  return token;
}

export function tripForConfirmToken(token: string): Trip | null {
  const row = db().prepare(
    `SELECT trip_id FROM trip_confirm_tokens
      WHERE token = ? AND used_at IS NULL AND expires_at > datetime('now')`,
  ).get(token) as { trip_id: string } | undefined;
  return row ? getTrip(row.trip_id) : null;
}

/**
 * Record the answer and, only for `booked`, open the chain.
 *
 * MUST be called from a POST. The confirmation link lands on a page with a
 * button; corporate mail security (Proofpoint, Defender, Mimecast) fetches every
 * link in a message, so a GET that mutates would confirm bookings that never
 * happened and fire hotel and insurance offers at people who did not book —
 * exactly the failure rule 1 exists to prevent.
 */
export function answerTrip(token: string, answer: 'booked' | 'deciding'): Trip | null {
  const trip = tripForConfirmToken(token);
  if (!trip) return null;

  const tx = db().transaction(() => {
    db().prepare(`UPDATE trip_confirm_tokens SET used_at = datetime('now') WHERE token = ?`).run(token);
    db().prepare(
      `UPDATE trips SET status = ?, confirmed_at = datetime('now') WHERE id = ?`,
    ).run(answer, trip.id);

    if (answer === 'booked') scheduleChain(trip);
    else queueStage(trip.id, 'nudge', addMinutes(NUDGE.offsetMinutesFromBooking!));
  });
  tx();
  return getTrip(trip.id);
}

/** Queue every chain stage for a confirmed-booked trip. */
export function scheduleChain(trip: Trip): void {
  for (const spec of CHAIN) {
    let when: string | null = null;
    if (spec.offsetMinutesFromBooking != null) {
      when = addMinutes(spec.offsetMinutesFromBooking);
    } else if (spec.daysFromDeparture != null) {
      when = atDateOffset(trip.depart_date, spec.daysFromDeparture);
    } else if (spec.daysFromReturn != null) {
      when = atDateOffset(trip.return_date, spec.daysFromReturn);
    }
    // A stage whose anchor is already in the past is skipped rather than fired
    // immediately — "things to do, 14 days before you fly" is meaningless the
    // day after departure, and a burst of late sends reads as spam.
    if (!when || Date.parse(when.replace(' ', 'T') + 'Z') <= Date.now()) continue;
    queueStage(trip.id, spec.stage, when);
  }
}

// ---------------------------------------------------------------------------
// Sending rules
// ---------------------------------------------------------------------------

/**
 * Has this user opted out of COMMERCIAL email?
 *
 * Deliberately a different key from the fare-alert preference. Commercial sends
 * unsubscribe independently; bundling them means one annoyed click takes the
 * alert channel with it, and the alert channel is the product.
 */
export function commercialOptedOut(userId: number): boolean {
  return queries.getUserSetting(userId, 'commercial_email_opt_out') === '1';
}

export function setCommercialOptOut(userId: number, optOut: boolean): void {
  queries.setUserSetting(userId, 'commercial_email_opt_out', optOut ? '1' : '0');
}

/** Monetized sends to this user in the last 24 hours. */
export function monetizedSentToday(userId: number): number {
  const row = db().prepare(
    `SELECT COUNT(*) AS n FROM chain_sends cs
       JOIN trips t ON t.id = cs.trip_id
      WHERE t.user_id = ? AND cs.status = 'sent'
        AND cs.sent_at >= datetime('now', '-1 day')
        AND cs.stage <> 'confirm' AND cs.stage <> 'nudge'`,
  ).get(userId) as { n: number };
  return row.n;
}

export type SendDecision = { send: true } | { send: false; reason: string };

/**
 * Every rule that can stop a send, in one place, evaluated at send time rather
 * than at schedule time — a user can unsubscribe, or hit the cap, in the days
 * between queueing and sending.
 */
export function maySend(trip: Trip, stage: ChainStage): SendDecision {
  const spec = stage === 'nudge' ? NUDGE : CHAIN.find(c => c.stage === stage);
  const monetized = spec?.monetized ?? false;

  if (!trip.user_id) return { send: false, reason: 'no user on trip' };

  // Rule 1. Nothing but the confirmation itself fires on an unconfirmed trip.
  if (stage !== 'confirm' && trip.status === 'pending') {
    return { send: false, reason: 'trip never confirmed — nothing fires on a guess' };
  }
  if (monetized && trip.status !== 'booked') {
    return { send: false, reason: `trip is "${trip.status}", not booked` };
  }
  if (stage === 'nudge' && trip.status !== 'deciding') {
    return { send: false, reason: 'nudge only applies to the still-deciding branch' };
  }

  if (monetized) {
    // Rule 3.
    if (commercialOptedOut(trip.user_id)) {
      return { send: false, reason: 'user opted out of commercial email' };
    }
    // Rule 2 — hard cap, across all sequences.
    if (monetizedSentToday(trip.user_id) >= DAILY_MONETIZED_CAP) {
      return { send: false, reason: 'daily monetized-email cap reached' };
    }
  }

  return { send: true };
}

// ---------------------------------------------------------------------------
// The runner
// ---------------------------------------------------------------------------

export type DueSend = { id: number; trip_id: string; stage: ChainStage; scheduled_for: string };

/** How many times a failed send is retried before it is left alone. */
export const MAX_SEND_ATTEMPTS = 3;
/** How long to wait before retrying a failed send. */
export const RETRY_BACKOFF_MINUTES = 30;

export function dueSends(limit = 200): DueSend[] {
  // Failed sends are retried. A transient Resend error — a rate limit, a network
  // blip, a 500 — must not permanently drop a stage, and on 'confirm' it would
  // drop the entire chain for that booking without anything visibly going wrong.
  // Retrying is safe because maySend() re-evaluates every rule at send time.
  return db().prepare(
    `SELECT id, trip_id, stage, scheduled_for FROM chain_sends
      WHERE scheduled_for <= datetime('now')
        AND (
          status = 'queued'
          OR (status = 'failed' AND attempts < ? AND
              (sent_at IS NULL OR sent_at <= datetime('now', ?)))
        )
      ORDER BY scheduled_for ASC LIMIT ?`,
  ).all(MAX_SEND_ATTEMPTS, `-${RETRY_BACKOFF_MINUTES} minutes`, limit) as DueSend[];
}

export function markSend(id: number, status: 'sent' | 'skipped' | 'failed', extra?: {
  skipReason?: string; messageId?: string;
}): void {
  // sent_at doubles as the last-attempt time on a failure, which is what the
  // retry backoff in dueSends() measures from.
  db().prepare(
    `UPDATE chain_sends
        SET status = ?, skip_reason = ?, message_id = ?,
            attempts = attempts + CASE WHEN ? = 'failed' THEN 1 ELSE 0 END,
            sent_at = CASE WHEN ? IN ('sent', 'failed') THEN datetime('now') ELSE sent_at END
      WHERE id = ?`,
  ).run(status, extra?.skipReason ?? null, extra?.messageId ?? null, status, status, id);
}

/**
 * Expire pending trips nobody answered, and cancel anything queued behind them.
 * A trip that was never confirmed must never quietly start sending offers later.
 */
export function expireStaleTrips(afterDays = 7): number {
  const tx = db().transaction(() => {
    const stale = db().prepare(
      `SELECT id FROM trips WHERE status = 'pending' AND created_at <= datetime('now', ?)`,
    ).all(`-${Math.floor(afterDays)} days`) as Array<{ id: string }>;
    for (const t of stale) {
      db().prepare(`UPDATE trips SET status = 'expired' WHERE id = ?`).run(t.id);
      db().prepare(
        `UPDATE chain_sends SET status = 'cancelled', skip_reason = 'trip expired unconfirmed'
          WHERE trip_id = ? AND status = 'queued'`,
      ).run(t.id);
    }
    return stale.length;
  });
  return tx();
}

/** The confirmation URL. Lands on a page; the answer itself is a POST. */
export function confirmUrl(token: string, baseUrl = APP_URL): string {
  return `${baseUrl.replace(/\/$/, '')}/trip/confirm?t=${encodeURIComponent(token)}`;
}

/** The commercial-only unsubscribe URL, separate from the fare-alert one. */
export function commercialUnsubscribeUrl(userId: number, baseUrl = APP_URL): string {
  const sig = crypto
    .createHmac('sha256', process.env.SESSION_SECRET || 'flycheap-dev')
    .update(`commercial:${userId}`)
    .digest('base64url')
    .slice(0, 24);
  return `${baseUrl.replace(/\/$/, '')}/trip/unsubscribe?u=${userId}&s=${sig}`;
}

export function verifyCommercialUnsubscribe(userId: number, sig: string): boolean {
  const expected = crypto
    .createHmac('sha256', process.env.SESSION_SECRET || 'flycheap-dev')
    .update(`commercial:${userId}`)
    .digest('base64url')
    .slice(0, 24);
  // Constant-time compare; lengths are fixed so a length check is safe first.
  if (sig.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
