import { describe, it, expect, beforeAll } from 'vitest';
import { bootTempDb } from './helpers/tempDb';

/**
 * Cancellation runs to period end (terms §5). The tier stays up while
 * subscription_status = 'cancel_at_period_end' and renews_at is in the
 * future; the poll sweep finishes it once the date passes. Both providers
 * store renews_at as ISO, so the query has to compare it correctly against
 * SQLite's 'YYYY-MM-DD HH:MM:SS' — a naive string compare would keep a paid
 * tier alive until the next calendar day.
 */
describe('scheduled cancellation', () => {
  let db: typeof import('@/lib/db');
  let due: number, future: number, immediate: number;

  beforeAll(async () => {
    db = await bootTempDb();
    const ins = db.getDb().prepare(
      `INSERT INTO users (email, tier, subscription_status, subscription_renews_at, subscription_provider, subscription_period, paypal_subscription_id)
       VALUES (?, 'pro', ?, ?, 'paypal', 'month', 'I-TEST')`,
    );
    // ISO with a 'T', one hour in the past — the case the naive compare gets wrong.
    due = Number(ins.run('due@test.local', 'cancel_at_period_end', new Date(Date.now() - 3600_000).toISOString()).lastInsertRowid);
    future = Number(ins.run('future@test.local', 'cancel_at_period_end', new Date(Date.now() + 20 * 86400_000).toISOString()).lastInsertRowid);
    immediate = Number(ins.run('active@test.local', 'active', new Date(Date.now() - 3600_000).toISOString()).lastInsertRowid);
  });

  it('lists only scheduled cancellations whose period has ended', () => {
    const ids = db.queries.dueScheduledCancellations().map(u => u.id);
    expect(ids).toContain(due);
    expect(ids).not.toContain(future);
    expect(ids).not.toContain(immediate); // active users are Stripe's/PayPal's to end, not ours
  });

  it('finishing drops to Free and forgets the subscription, nothing else', () => {
    db.queries.finishScheduledCancellation(due);
    const u = db.queries.getUserById(due)!;
    expect(u.tier).toBe('free');
    expect(u.subscription_status).toBe('canceled');
    expect(u.subscription_renews_at).toBeNull();
    expect(u.paypal_subscription_id ?? null).toBeNull();
    expect(u.email).toBe('due@test.local');
  });

  it('finish is a no-op for a user who is not scheduled', () => {
    db.queries.finishScheduledCancellation(immediate);
    expect(db.queries.getUserById(immediate)!.tier).toBe('pro');
  });

  it('a scheduled user keeps paid limits until the date', () => {
    const u = db.queries.getUserById(future)!;
    expect(db.limitsForUser(u).maxRoutes).toBe(db.TIER_LIMITS.pro.maxRoutes);
  });
});
