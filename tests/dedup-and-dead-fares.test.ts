import { describe, it, expect, beforeAll } from 'vitest';
import { useTempDb } from './helpers/tempDb';
import { routeKey } from '@/lib/providerCost';

/**
 * Two failures that would have been silent in production.
 *
 * 1. Sharing a poll between watchers must not share the ALERT DECISION. The
 *    first version copied the PollResult and skipped pollOne entirely for every
 *    duplicate watcher, which meant no snapshot row, no threshold evaluation and
 *    no email for anyone but the first watcher — and because no snapshot was
 *    written, their last-polled time never advanced, so they were deduped again
 *    on every subsequent cycle. Permanent starvation, and a fourth cause of
 *    alert silence in a codebase that just finished clearing three.
 *
 * 2. A fare that verification ruled DEAD must not stay in price history. It is
 *    a price that was never real, and leaving it in drags the route's normal
 *    down, changes future mistake-fare classification, and — worst — flips
 *    correct `buy` calls to incorrect when the phantom low lands inside a
 *    scoring horizon. That number is destined for the marketing site.
 */

let dbmod: typeof import('@/lib/db');
let priceDrops: typeof import('@/lib/priceDrops');

beforeAll(async () => {
  useTempDb();
  dbmod = await import('@/lib/db');
  dbmod.getDb();
  priceDrops = await import('@/lib/priceDrops');
});

describe('canonical route key', () => {
  it('separates trips that leave together but return weeks apart', () => {
    // Without the return window these collapse into one key, and the cheaper
    // trip's fare would be reported for both.
    const short = routeKey({ origin: 'JFK', destination: 'CAI', departDate: '2026-07-07', returnDate: '2026-07-14' });
    const long = routeKey({ origin: 'JFK', destination: 'CAI', departDate: '2026-07-07', returnDate: '2026-07-28' });
    expect(short).not.toBe(long);
  });

  it('still collapses genuinely overlapping windows', () => {
    const a = routeKey({ origin: 'JFK', destination: 'CAI', departDate: '2026-07-07', returnDate: '2026-07-14' });
    const b = routeKey({ origin: 'jfk', destination: 'cai', departDate: '2026-07-09', returnDate: '2026-07-16' });
    expect(a).toBe(b);
  });

  it('separates different party sizes, which are different prices', () => {
    expect(routeKey({ origin: 'JFK', destination: 'CAI', departDate: '2026-07-07', adults: 1 }))
      .not.toBe(routeKey({ origin: 'JFK', destination: 'CAI', departDate: '2026-07-07', adults: 4 }));
  });

  it('separates one-way from return', () => {
    expect(routeKey({ origin: 'JFK', destination: 'CAI', departDate: '2026-07-07' }))
      .not.toBe(routeKey({ origin: 'JFK', destination: 'CAI', departDate: '2026-07-07', returnDate: '2026-07-14' }));
  });
});

describe('dead fares are excluded from price history', () => {
  const SEARCH = 4242;

  beforeAll(() => {
    const db = dbmod.getDb();
    // Idempotent: vitest may re-enter a hook when an earlier assertion fails,
    // and a UNIQUE violation here would mask the actual failure.
    db.prepare('DELETE FROM fare_snapshots WHERE search_id = ?').run(SEARCH);
    db.prepare('DELETE FROM searches WHERE id = ?').run(SEARCH);
    db.prepare(
      `INSERT INTO searches (id, origin, destination, depart_date, return_date, adults, infants, user_id)
       VALUES (?, 'JFK', 'CAI', '2026-07-07', '2026-07-21', 1, 0, 1)`,
    ).run(SEARCH);

    const ins = db.prepare(
      `INSERT INTO fare_snapshots
         (search_id, polled_at, total_price_usd, base_price_usd, taxes_fees_usd,
          price_per_adult_usd, verify_outcome)
       VALUES (?, datetime('now', ?), ?, ?, 0, ?, ?)`,
    );
    // Six honest prices around $800, all older than the median query's 1h floor.
    for (let i = 0; i < 6; i++) {
      ins.run(SEARCH, `-${i + 2} hours`, 800, 800, 800, null);
    }
    // One phantom $200 the verification pass ruled dead.
    ins.run(SEARCH, '-3 hours', 200, 200, 200, 'dead');
  });

  it('keeps a phantom low out of the route’s 7-day normal', () => {
    const median = priceDrops.median7dForSearch(SEARCH);
    expect(median).toBe(800);
  });

  it('keeps it out of the daily history the verdict and the sparkline read', () => {
    const hist = dbmod.queries.fareHistoryDaily(SEARCH, 30);
    for (const row of hist) expect(row.per_adult_usd).toBe(800);
  });

  it('keeps it out of the scoring window, so a correct buy is not marked wrong', () => {
    // This is the one that matters: a single phantom low inside a 7-day horizon
    // would flip a whole batch of correct `buy` calls to incorrect.
    // minPriceAfter windows FORWARD from `since` by `days`, so the anchor has to
    // sit just before the snapshots for them to fall inside it.
    const since = new Date(Date.now() - 24 * 3600_000).toISOString().replace('T', ' ').slice(0, 19);
    const min = dbmod.queries.minPriceAfter(SEARCH, since, 7);
    expect(min).toBe(800);
  });

  it('still counts snapshots that were never verified at all', () => {
    // verify_outcome is NULL on every ordinary snapshot — most of them. A filter
    // without COALESCE would silently drop the entire normal path.
    const rows = dbmod.queries.fareHistory(SEARCH, 30);
    expect(rows.length).toBe(6);
  });

  it('leaves the suppression itself recorded, so the rule stays auditable', () => {
    const db = dbmod.getDb();
    const n = db.prepare(
      `SELECT COUNT(*) AS n FROM fare_snapshots WHERE search_id = ? AND verify_outcome = 'dead'`,
    ).get(SEARCH) as { n: number };
    expect(n.n).toBe(1);
  });
});
