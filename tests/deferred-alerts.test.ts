import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { useTempDb } from './helpers/tempDb';

/**
 * A held alert has to go somewhere.
 *
 * A trend warning is digest-only by definition, so under the policy alone it
 * would be computed, held, and then never seen by anyone — "deferred" would be a
 * euphemism for "dropped". These tests are about that round trip.
 */

let dbmod: typeof import('@/lib/db');

beforeAll(async () => {
  useTempDb();
  dbmod = await import('@/lib/db');
  dbmod.getDb();
});

beforeEach(() => {
  dbmod.getDb().prepare('DELETE FROM deferred_alerts').run();
});

const defer = (over: Record<string, unknown> = {}) => dbmod.queries.deferAlert({
  search_id: 1, user_id: 7, kind: 'trend-warning',
  reason: 'trend-warning is a digest item',
  headline: 'JFK → CAI is rising about $5/day',
  price_per_adult_usd: 980,
  ...over,
});

describe('holding an alert for the digest', () => {
  it('keeps it until a digest carries it', () => {
    defer();
    const pending = dbmod.queries.pendingDeferredAlerts(7);
    expect(pending).toHaveLength(1);
    expect(pending[0].headline).toContain('JFK → CAI');
  });

  it('does not re-list the same warning every five minutes', () => {
    // A trend warning still true on the next poll is the SAME warning, not a
    // second one. Without the dedupe the digest would carry one line per poll
    // cycle — roughly 288 of them a day.
    for (let i = 0; i < 20; i++) defer();
    expect(dbmod.queries.pendingDeferredAlerts(7)).toHaveLength(1);
  });

  it('treats a different kind on the same watch as separate news', () => {
    defer({ kind: 'trend-warning' });
    defer({ kind: 'verdict-change', headline: 'we changed our call to buy' });
    expect(dbmod.queries.pendingDeferredAlerts(7)).toHaveLength(2);
  });

  it('keeps each user’s held alerts to themselves', () => {
    defer({ user_id: 7 });
    defer({ user_id: 8, search_id: 2 });
    expect(dbmod.queries.pendingDeferredAlerts(7)).toHaveLength(1);
    expect(dbmod.queries.pendingDeferredAlerts(8)).toHaveLength(1);
  });
});

describe('delivery', () => {
  it('stops listing them once a digest has gone out', () => {
    defer();
    const ids = dbmod.queries.pendingDeferredAlerts(7).map(d => d.id);
    dbmod.queries.markDeferredDelivered(ids);
    expect(dbmod.queries.pendingDeferredAlerts(7)).toHaveLength(0);
  });

  it('lets the same warning be raised again after it was delivered', () => {
    // The dedupe is on PENDING rows only. A trend that resumes next month is
    // genuinely new news and must not be suppressed forever by a row from
    // February.
    defer();
    dbmod.queries.markDeferredDelivered(dbmod.queries.pendingDeferredAlerts(7).map(d => d.id));
    defer();
    expect(dbmod.queries.pendingDeferredAlerts(7)).toHaveLength(1);
  });

  it('does nothing on an empty list rather than emptying the table', () => {
    defer();
    dbmod.queries.markDeferredDelivered([]);
    expect(dbmod.queries.pendingDeferredAlerts(7)).toHaveLength(1);
  });
});

describe('once-only alert types', () => {
  it('knows whether a watch has ever had a given kind', () => {
    const db = dbmod.getDb();
    expect(dbmod.queries.hasEverAlerted(42, 'window-closing')).toBe(false);
    db.prepare(
      `INSERT INTO alerts_sent (search_id, fare_snapshot_id, price_per_adult_usd, kind, status)
       VALUES (42, 1, 700, 'window-closing', 'sent')`,
    ).run();
    expect(dbmod.queries.hasEverAlerted(42, 'window-closing')).toBe(true);
  });

  it('does not count an alert that was reserved but never sent', () => {
    // A rolled-back reservation must not make a once-only alert think it
    // already fired — that would silence it permanently on a delivery blip.
    const db = dbmod.getDb();
    db.prepare(
      `INSERT INTO alerts_sent (search_id, fare_snapshot_id, price_per_adult_usd, kind, status)
       VALUES (43, 1, 700, 'window-closing', 'pending')`,
    ).run();
    expect(dbmod.queries.hasEverAlerted(43, 'window-closing')).toBe(false);
  });
});

describe('detecting a verdict flip', () => {
  it('reads back the last verdict recorded for a watch', () => {
    const db = dbmod.getDb();
    db.prepare(
      `INSERT INTO verdict_calls (search_id, route_key, origin, destination, verdict, confidence_pct, price_at_call_usd, called_at)
       VALUES (50, 'k', 'JFK', 'CAI', 'wait', 70, 900, datetime('now','-2 days'))`,
    ).run();
    db.prepare(
      `INSERT INTO verdict_calls (search_id, route_key, origin, destination, verdict, confidence_pct, price_at_call_usd, called_at)
       VALUES (50, 'k', 'JFK', 'CAI', 'buy', 80, 800, datetime('now','-1 days'))`,
    ).run();
    expect(dbmod.queries.lastVerdictFor(50)).toBe('buy');
  });

  it('returns null for a watch with no history', () => {
    expect(dbmod.queries.lastVerdictFor(99999)).toBeNull();
  });
});
