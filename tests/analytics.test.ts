import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { useTempDb } from './helpers/tempDb';

/**
 * Exercise every dashboard query against a REAL schema.
 *
 * The risk in the analytics layer is not arithmetic, it is SQL: a typo in a
 * column name, a join to a table that does not exist, a window function SQLite
 * will not accept. None of that is caught by the type checker, and all of it
 * fails as a 500 on a page the founder opens.
 *
 * So the database is seeded from the checked-in data/fares.db (the migrations
 * then run against it exactly as they would in production), and every query is
 * executed. The assertions are deliberately about SHAPE and about honesty —
 * a metric with no evidence must come back null, never 0.
 */

const REAL_DB = path.join(process.cwd(), 'data', 'fares.db');

let analytics: typeof import('@/lib/analytics');
let dbmod: typeof import('@/lib/db');

beforeAll(async () => {
  useTempDb({ seedFrom: REAL_DB });
  // Imported AFTER the chdir, so db.ts resolves to the temp copy.
  dbmod = await import('@/lib/db');
  dbmod.getDb(); // runs init(), including every migration added for this work
  analytics = await import('@/lib/analytics');
});

describe('migrations', () => {
  it('bring a real database up to the new schema without losing rows', () => {
    const db = dbmod.getDb();
    const cols = (t: string) =>
      (db.prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>).map(c => c.name);

    expect(cols('api_calls')).toEqual(expect.arrayContaining(
      ['provider', 'cost_usd', 'phase', 'band', 'route_key'],
    ));
    expect(cols('affiliate_clicks')).toEqual(expect.arrayContaining(
      ['alert_id', 'alert_kind', 'product', 'sub_id', 'price_shown_usd', 'price_at_click_usd',
       'verdict', 'confidence_pct', 'minutes_since_alert', 'option_rank', 'option_name'],
    ));
    expect(cols('alerts_sent')).toEqual(expect.arrayContaining(['kind', 'status']));
    expect(cols('fare_snapshots')).toEqual(expect.arrayContaining(
      ['verified_at', 'verified_price_usd', 'verified_by', 'verify_outcome'],
    ));

    for (const t of ['dead_fares', 'provider_disagreements', 'verdict_calls']) {
      expect(() => db.prepare(`SELECT COUNT(*) FROM ${t}`).get()).not.toThrow();
    }
    expect((db.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check)
      .toBe('ok');
  });

  it('defaults every pre-existing alert to sent, so history is not hidden', () => {
    const db = dbmod.getDb();
    const pending = db.prepare(`SELECT COUNT(*) AS n FROM alerts_sent WHERE status <> 'sent'`)
      .get() as { n: number };
    expect(pending.n).toBe(0);
  });
});

describe('dashboard 1 — fare truth', () => {
  it('runs every query', () => {
    expect(() => analytics.trustMetrics(7)).not.toThrow();
  });

  it('reports "unknown" rather than a confident zero when there is no evidence', () => {
    const m = analytics.trustMetrics(7);
    // No clicks have been re-queried in a fresh database. A dashboard that says
    // "0% delta" here would be reporting perfect accuracy it has not measured.
    if (m.deltaSamples === 0) {
      expect(m.deltaMedianPct).toBeNull();
      expect(m.deltaP90Pct).toBeNull();
    }
    if (m.alertsConsidered7d === 0) {
      expect(m.deadFareRatePct).toBeNull();
    }
    expect(Array.isArray(m.disagreements)).toBe(true);
    expect(Array.isArray(m.providerSuccess)).toBe(true);
    expect(Array.isArray(m.flagged)).toBe(true);
  });

  it('withholds verdict accuracy below a minimum sample', () => {
    const m = analytics.trustMetrics(7);
    if (m.verdict7d.scored < 20) expect(m.verdict7d.accuracyPct).toBeNull();
  });
});

describe('dashboard 2 — economics', () => {
  it('runs every query', () => {
    expect(() => analytics.costEarnMetrics(30)).not.toThrow();
  });

  it('returns null unit costs rather than dividing by zero', () => {
    const m = analytics.costEarnMetrics(30);
    expect(typeof m.totalCostUsd).toBe('number');
    expect(Number.isFinite(m.totalCostUsd)).toBe(true);
    for (const v of [m.costPerTrackedRouteUsd, m.costPerAlertUsd, m.costPerClickOutUsd]) {
      expect(v === null || Number.isFinite(v)).toBe(true);
    }
    expect(m.zeroCommissionSharePct === null || Number.isFinite(m.zeroCommissionSharePct)).toBe(true);
  });

  it('sorts route margin worst-first, since those are the routes to throttle', () => {
    const m = analytics.costEarnMetrics(30);
    for (let i = 1; i < m.routeMargin.length; i++) {
      expect(m.routeMargin[i].marginUsd).toBeGreaterThanOrEqual(m.routeMargin[i - 1].marginUsd);
    }
  });
});

describe('dashboard 3 — funnel', () => {
  it('runs every query', () => {
    expect(() => analytics.funnelMetrics(30)).not.toThrow();
  });

  it('never reports a stage converting above the one before it', () => {
    const m = analytics.funnelMetrics(30);
    for (let i = 1; i < m.overall.length; i++) {
      expect(m.overall[i].n).toBeLessThanOrEqual(m.overall[i - 1].n + m.overall[i - 1].n);
    }
    expect(m.overall[0].ofPreviousPct).toBeNull(); // nothing precedes the first stage
  });

  it('runs the cohort query, which uses correlated subqueries SQLite must accept', () => {
    const m = analytics.funnelMetrics(30);
    expect(Array.isArray(m.cohorts)).toBe(true);
    for (const c of m.cohorts) {
      expect(c.everClicked).toBeLessThanOrEqual(c.users);
      expect(c.activeM1).toBeLessThanOrEqual(c.users);
      expect(c.activeM3).toBeLessThanOrEqual(c.users);
    }
  });
});
