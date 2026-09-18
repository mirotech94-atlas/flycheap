import { describe, it, expect, beforeAll } from 'vitest';
import { bootTempDb } from './helpers/tempDb';

let db: Awaited<ReturnType<typeof bootTempDb>>;
let pd: typeof import('@/lib/priceDrops');

/** Seed enough cheap history that median7dForSearch has a baseline. */
function seedHistory(searchId: number, price: number, n = 6) {
  for (let i = 0; i < n; i++) {
    db.getDb().prepare(
      `INSERT INTO fare_snapshots (search_id, polled_at, total_price_usd, base_price_usd,
        taxes_fees_usd, price_per_adult_usd, provider)
       VALUES (?, datetime('now', ?), ?, ?, 0, ?, 'test')`
    ).run(searchId, `-${i + 1} hours`, price, price, price);
  }
}

beforeAll(async () => {
  db = await bootTempDb();
  pd = await import('@/lib/priceDrops');
  db.getDb().prepare(
    `INSERT INTO searches (id, origin, destination, depart_date, return_date, adults, infants, active, date_mode)
     VALUES (1,'EWR','DXB','2026-10-05','2026-10-18',1,0,1,'exact')`
  ).run();
  seedHistory(1, 1000);
});

describe('alert floor decays instead of ratcheting', () => {
  it('detects a genuine drop below the 7-day median', () => {
    const r = pd.detectPriceDrop(1, 800, 10);   // 20% below a $1000 median
    expect(r.isDrop).toBe(true);
  });

  it('REGRESSION: an OLD alert must not suppress a drop forever', () => {
    // The bug: lastAlertForSearch() had no window, so this $500 alert from 60
    // days ago silenced the route permanently -- every later drop was thrown
    // away for not also beating $500. EWR-DXB sat quiet at $506 for 47 days
    // because of a $361 alert on 2026-08-01.
    db.getDb().prepare(
      `INSERT INTO alerts_sent (search_id, fare_snapshot_id, price_per_adult_usd, sent_at, kind)
       VALUES (1, 1, 500, datetime('now','-60 days'), 'threshold')`
    ).run();

    // Unbounded lookup (old behaviour) still suppresses -- $800 does not beat $500.
    expect(pd.detectPriceDrop(1, 800, 10).isDrop).toBe(false);

    // With a 7-day floor the 60-day-old alert has aged out, so the drop stands.
    expect(pd.detectPriceDrop(1, 800, 10, 7).isDrop).toBe(true);
  });

  it('a RECENT alert still suppresses, so the guard is not simply disabled', () => {
    db.getDb().prepare(
      `INSERT INTO alerts_sent (search_id, fare_snapshot_id, price_per_adult_usd, sent_at, kind)
       VALUES (1, 1, 700, datetime('now','-1 day'), 'threshold')`
    ).run();
    // $800 does not beat yesterday's $700 -- correctly still no alert.
    expect(pd.detectPriceDrop(1, 800, 10, 7).isDrop).toBe(false);
    // ...but a price that genuinely beats it does alert.
    expect(pd.detectPriceDrop(1, 650, 10, 7).isDrop).toBe(true);
  });
});
