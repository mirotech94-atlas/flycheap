import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { useTempDb } from './helpers/tempDb';

/**
 * The chain's four rules, tested rather than remembered.
 *
 * Each one exists because breaking it costs more than the send earns: the alert
 * channel is the product, and a trusted alert becomes spam exactly once.
 */

let dbmod: typeof import('@/lib/db');
let chain: typeof import('@/lib/tripChain');

beforeAll(async () => {
  useTempDb();
  dbmod = await import('@/lib/db');
  dbmod.getDb();
  chain = await import('@/lib/tripChain');
});

let seq = 0;
function newClickTrip(): NonNullable<ReturnType<typeof chain.openTripFromClick>> {
  seq += 1;
  const trip = chain.openTripFromClick({
    clickToken: `tok-${seq}-${Date.now()}`,
    userId: 1,
    searchId: null,
    origin: 'JFK', destination: 'BCN',
    departDate: futureDate(60), returnDate: futureDate(74),
    farePerAdultUsd: 484,
  });
  if (!trip) throw new Error('expected a trip');
  return trip;
}

function futureDate(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

beforeEach(() => {
  const db = dbmod.getDb();
  db.prepare('DELETE FROM chain_sends').run();
  db.prepare('DELETE FROM trip_confirm_tokens').run();
  db.prepare('DELETE FROM trips').run();
  dbmod.queries.setUserSetting(1, 'commercial_email_opt_out', '0');
});

describe('opening a trip from a Book click', () => {
  it('opens it as PENDING and queues only the confirmation', () => {
    const trip = newClickTrip();
    expect(trip.status).toBe('pending');
    const queued = dbmod.getDb()
      .prepare('SELECT stage FROM chain_sends WHERE trip_id = ?').all(trip.id) as Array<{ stage: string }>;
    expect(queued.map(q => q.stage)).toEqual(['confirm']);
  });

  it('schedules the confirmation inside the 20-40 minute window', () => {
    const trip = newClickTrip();
    const row = dbmod.getDb()
      .prepare(`SELECT scheduled_for FROM chain_sends WHERE trip_id = ? AND stage = 'confirm'`)
      .get(trip.id) as { scheduled_for: string };
    const mins = (Date.parse(row.scheduled_for.replace(' ', 'T') + 'Z') - Date.now()) / 60_000;
    expect(mins).toBeGreaterThanOrEqual(chain.CONFIRM_DELAY_MIN - 1);
    expect(mins).toBeLessThanOrEqual(chain.CONFIRM_DELAY_MAX + 1);
  });

  it('is idempotent per click — a double-fire cannot open two trips', () => {
    const token = `dup-${Date.now()}`;
    const args = {
      clickToken: token, userId: 1, searchId: null,
      origin: 'JFK', destination: 'BCN',
      departDate: futureDate(60), returnDate: futureDate(74), farePerAdultUsd: 484,
    };
    const a = chain.openTripFromClick(args);
    const b = chain.openTripFromClick(args);
    expect(a?.id).toBe(b?.id);
  });

  it('never opens a trip for a clicker we cannot email', () => {
    expect(chain.openTripFromClick({
      clickToken: `anon-${Date.now()}`, userId: null, searchId: null,
      origin: 'JFK', destination: 'BCN', departDate: futureDate(60), returnDate: futureDate(74),
    })).toBeNull();
  });
});

describe('rule 1 — nothing fires until the user confirms booked', () => {
  it('blocks every monetized stage on a pending trip', () => {
    const trip = newClickTrip();
    for (const spec of chain.CHAIN) {
      const d = chain.maySend(trip, spec.stage);
      expect(d.send, `${spec.stage} must not fire on a guess`).toBe(false);
    }
  });

  it('blocks every monetized stage on a still-deciding trip', () => {
    const trip = newClickTrip();
    const token = chain.mintConfirmToken(trip.id);
    const after = chain.answerTrip(token, 'deciding')!;
    expect(after.status).toBe('deciding');
    for (const spec of chain.CHAIN) {
      expect(chain.maySend(after, spec.stage).send).toBe(false);
    }
  });

  it('opens the chain only on an explicit booked answer', () => {
    const trip = newClickTrip();
    const token = chain.mintConfirmToken(trip.id);
    const after = chain.answerTrip(token, 'booked')!;
    expect(after.status).toBe('booked');

    const stages = (dbmod.getDb()
      .prepare('SELECT stage FROM chain_sends WHERE trip_id = ?').all(trip.id) as Array<{ stage: string }>)
      .map(r => r.stage);
    expect(stages).toContain('stay');
    expect(stages).toContain('insurance');
    expect(stages).not.toContain('nudge');
  });

  it('sends the still-deciding branch down the nudge, not the offers', () => {
    const trip = newClickTrip();
    const after = chain.answerTrip(chain.mintConfirmToken(trip.id), 'deciding')!;
    const stages = (dbmod.getDb()
      .prepare('SELECT stage FROM chain_sends WHERE trip_id = ?').all(trip.id) as Array<{ stage: string }>)
      .map(r => r.stage);
    expect(stages).toContain('nudge');
    expect(stages).not.toContain('stay');
    expect(chain.maySend(after, 'nudge').send).toBe(true);
  });

  it('expires an unanswered trip and cancels everything queued behind it', () => {
    const trip = newClickTrip();
    dbmod.getDb().prepare(`UPDATE trips SET created_at = datetime('now','-30 days') WHERE id = ?`).run(trip.id);
    expect(chain.expireStaleTrips(7)).toBe(1);
    expect(chain.getTrip(trip.id)!.status).toBe('expired');
    const stuck = dbmod.getDb()
      .prepare(`SELECT COUNT(*) AS n FROM chain_sends WHERE trip_id = ? AND status = 'queued'`)
      .get(trip.id) as { n: number };
    expect(stuck.n).toBe(0);
  });
});

describe('rule 2 — one monetized email per user per day, hard cap', () => {
  it('blocks a second monetized send the same day, across sequences', () => {
    const a = newClickTrip();
    chain.answerTrip(chain.mintConfirmToken(a.id), 'booked');
    const bookedA = chain.getTrip(a.id)!;
    expect(chain.maySend(bookedA, 'stay').send).toBe(true);

    // Mark the stay send as actually sent.
    const row = dbmod.getDb()
      .prepare(`SELECT id FROM chain_sends WHERE trip_id = ? AND stage = 'stay'`).get(a.id) as { id: number };
    chain.markSend(row.id, 'sent');

    // A DIFFERENT trip for the same user must now be blocked — the cap is per
    // user, not per sequence, or two trips would double the daily volume.
    const b = newClickTrip();
    chain.answerTrip(chain.mintConfirmToken(b.id), 'booked');
    const d = chain.maySend(chain.getTrip(b.id)!, 'insurance');
    expect(d.send).toBe(false);
    expect(d.send === false && d.reason).toMatch(/cap/i);
  });

  it('does not count the confirmation or the nudge against the cap', () => {
    // Neither is a monetized send: one asks a question, the other is retention.
    const a = newClickTrip();
    const confirmRow = dbmod.getDb()
      .prepare(`SELECT id FROM chain_sends WHERE trip_id = ? AND stage = 'confirm'`).get(a.id) as { id: number };
    chain.markSend(confirmRow.id, 'sent');
    expect(chain.monetizedSentToday(1)).toBe(0);
  });
});

describe('rule 3 — commercial email unsubscribes independently of fare alerts', () => {
  it('stops monetized sends without touching anything else', () => {
    const trip = newClickTrip();
    chain.answerTrip(chain.mintConfirmToken(trip.id), 'booked');
    chain.setCommercialOptOut(1, true);

    const d = chain.maySend(chain.getTrip(trip.id)!, 'stay');
    expect(d.send).toBe(false);
    expect(d.send === false && d.reason).toMatch(/commercial/i);

    // The fare-alert preference is a DIFFERENT key and must be untouched —
    // bundling them loses the alert channel along with the marketing one.
    expect(dbmod.queries.getUserSetting(1, 'unsubscribed')).toBeFalsy();
    expect(dbmod.queries.getUserSetting(1, 'alert_channels')).toBeFalsy();
  });

  it('signs its unsubscribe link and rejects a forged one', () => {
    const url = chain.commercialUnsubscribeUrl(1, 'https://my.flycheap.live');
    const sig = new URL(url).searchParams.get('s')!;
    expect(chain.verifyCommercialUnsubscribe(1, sig)).toBe(true);
    // Another user's id must not validate against this signature.
    expect(chain.verifyCommercialUnsubscribe(2, sig)).toBe(false);
    expect(chain.verifyCommercialUnsubscribe(1, 'x'.repeat(sig.length))).toBe(false);
    expect(chain.verifyCommercialUnsubscribe(1, 'short')).toBe(false);
  });
});

describe('scheduling', () => {
  it('skips a travel-anchored stage whose moment has already passed', () => {
    // "Things to do, 14 days before you fly" is meaningless the day after
    // departure, and a burst of late sends reads as spam.
    const trip = chain.openTripFromClick({
      clickToken: `past-${Date.now()}`, userId: 1, searchId: null,
      origin: 'JFK', destination: 'BCN',
      departDate: futureDate(3),          // tours anchor is 14 days BEFORE this
      returnDate: futureDate(10),
      farePerAdultUsd: 484,
    })!;
    chain.answerTrip(chain.mintConfirmToken(trip.id), 'booked');
    const stages = (dbmod.getDb()
      .prepare('SELECT stage FROM chain_sends WHERE trip_id = ?').all(trip.id) as Array<{ stage: string }>)
      .map(r => r.stage);
    expect(stages).not.toContain('tours');
    expect(stages).toContain('compensation'); // return + 3 days is still ahead
  });

  it('queues a stage at most once per trip, whatever the scheduler does', () => {
    const trip = newClickTrip();
    const t = chain.mintConfirmToken(trip.id);
    chain.answerTrip(t, 'booked');
    chain.scheduleChain(chain.getTrip(trip.id)!);  // deliberate re-run
    chain.scheduleChain(chain.getTrip(trip.id)!);
    const dupes = dbmod.getDb().prepare(
      `SELECT stage, COUNT(*) AS n FROM chain_sends WHERE trip_id = ? GROUP BY stage HAVING n > 1`,
    ).all(trip.id);
    expect(dupes).toEqual([]);
  });

  it('burns the confirmation token, so one link cannot answer twice', () => {
    const trip = newClickTrip();
    const token = chain.mintConfirmToken(trip.id);
    expect(chain.answerTrip(token, 'deciding')).not.toBeNull();
    expect(chain.answerTrip(token, 'booked')).toBeNull();
    expect(chain.getTrip(trip.id)!.status).toBe('deciding');
  });
});

describe('what each message is allowed to contain', () => {
  let mail: typeof import('@/lib/tripChainEmail');

  beforeAll(async () => { mail = await import('@/lib/tripChainEmail'); });

  it('puts no offer in the confirmation', () => {
    // "Do not put a hotel offer in the fare alert. It dilutes the one message
    // that has to land, and it makes the alert look like an ad." The same is
    // true of the question that follows it: an offer here makes the question
    // look like a pretext, and the answer is the most valuable data we get.
    const trip = newClickTrip();
    const r = mail.renderStage(trip, 'confirm')!;
    expect(r.html).not.toMatch(/hotel|insurance|eSIM|transfer/i);
    expect(r.html).not.toContain('/go?');
    expect(r.html).not.toMatch(/commission/i);
  });

  it('puts no offer and no commission in the still-deciding nudge', () => {
    // Retention, not monetization — and it has to look nothing like the booked
    // branch, or the distinction stops meaning anything to the reader.
    const trip = newClickTrip();
    chain.answerTrip(chain.mintConfirmToken(trip.id), 'deciding');
    const r = mail.renderStage(chain.getTrip(trip.id)!, 'nudge')!;
    expect(r.html).not.toContain('/go?');
    expect(r.html).not.toMatch(/commission/i);
    expect(r.html).toMatch(/not a promotion/i);
  });

  it('gives every commercial stage a partner link, the disclosure, and the commercial unsubscribe', () => {
    const trip = newClickTrip();
    chain.answerTrip(chain.mintConfirmToken(trip.id), 'booked');
    const booked = chain.getTrip(trip.id)!;

    for (const spec of chain.CHAIN) {
      const r = mail.renderStage(booked, spec.stage);
      expect(r, `${spec.stage} must render`).not.toBeNull();
      // Every outbound partner link goes through /go — never a bare hostname.
      expect(r!.html, `${spec.stage} link`).toContain('/go?');
      expect(r!.html).not.toMatch(/https:\/\/(www\.)?(hotellook|aviasales|booking)\.com/);
      // The disclosure stays visible; the audience notices its absence.
      expect(r!.html, `${spec.stage} disclosure`).toMatch(/we earn a commission/i);
      // Commercial unsubscribe, and it says the alerts survive it.
      expect(r!.html, `${spec.stage} unsubscribe`).toContain('/trip/unsubscribe');
      expect(r!.html).toMatch(/fare alerts keep working/i);
      // Plain-text part is not an afterthought.
      expect(r!.text.length).toBeGreaterThan(80);
    }
  });

  it('tags every chain link as the chain surface, not as an alert', () => {
    // The whole point of the reporting is to tell the alert channel and the
    // commercial channel apart; sharing a surface would merge them.
    const trip = newClickTrip();
    chain.answerTrip(chain.mintConfirmToken(trip.id), 'booked');
    const r = mail.renderStage(chain.getTrip(trip.id)!, 'stay')!;
    expect(r.html).toContain('surface=email-chain');
    expect(r.html).toContain('campaign=chain-stay');
  });
});

describe('a failed send is retried, not lost', () => {
  it('picks a failed send back up after the backoff', () => {
    // One transient Resend error must not permanently drop a stage. On the
    // 'confirm' stage it would be worse than losing one email: the question
    // never arrives, the trip expires unconfirmed, and the entire six-stage
    // chain for that booking silently never happens.
    const trip = newClickTrip();
    const row = dbmod.getDb()
      .prepare(`SELECT id FROM chain_sends WHERE trip_id = ? AND stage = 'confirm'`)
      .get(trip.id) as { id: number };

    // Make it due, then fail it.
    dbmod.getDb().prepare(`UPDATE chain_sends SET scheduled_for = datetime('now','-1 hour') WHERE id = ?`).run(row.id);
    chain.markSend(row.id, 'failed', { skipReason: 'network blip' });
    expect(chain.dueSends().some(d => d.id === row.id)).toBe(false); // inside backoff

    // Age the attempt past the backoff.
    dbmod.getDb()
      .prepare(`UPDATE chain_sends SET sent_at = datetime('now', ?) WHERE id = ?`)
      .run(`-${chain.RETRY_BACKOFF_MINUTES + 5} minutes`, row.id);
    expect(chain.dueSends().some(d => d.id === row.id)).toBe(true);
  });

  it('gives up after a few attempts rather than retrying forever', () => {
    const trip = newClickTrip();
    const row = dbmod.getDb()
      .prepare(`SELECT id FROM chain_sends WHERE trip_id = ? AND stage = 'confirm'`)
      .get(trip.id) as { id: number };
    dbmod.getDb().prepare(`UPDATE chain_sends SET scheduled_for = datetime('now','-1 hour') WHERE id = ?`).run(row.id);

    for (let i = 0; i < chain.MAX_SEND_ATTEMPTS; i++) {
      chain.markSend(row.id, 'failed', { skipReason: 'still failing' });
      dbmod.getDb()
        .prepare(`UPDATE chain_sends SET sent_at = datetime('now', ?) WHERE id = ?`)
        .run(`-${chain.RETRY_BACKOFF_MINUTES + 5} minutes`, row.id);
    }
    expect(chain.dueSends().some(d => d.id === row.id)).toBe(false);
  });

  it('never retries a send that succeeded', () => {
    const trip = newClickTrip();
    const row = dbmod.getDb()
      .prepare(`SELECT id FROM chain_sends WHERE trip_id = ? AND stage = 'confirm'`)
      .get(trip.id) as { id: number };
    dbmod.getDb().prepare(`UPDATE chain_sends SET scheduled_for = datetime('now','-1 hour') WHERE id = ?`).run(row.id);
    chain.markSend(row.id, 'sent', { messageId: 'abc' });
    expect(chain.dueSends().some(d => d.id === row.id)).toBe(false);
  });
});
