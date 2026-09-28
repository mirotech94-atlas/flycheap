import { describe, it, expect, beforeAll } from 'vitest';
import { bootTempDb } from './helpers/tempDb';

let db: Awaited<ReturnType<typeof bootTempDb>>;
beforeAll(async () => { db = await bootTempDb(); });

const watch = (userId: number, i: number) => db.queries.insertSearch({
  origin: 'JFK', destination: 'CAI', depart_date: `2027-01-${String(10 + (i % 15)).padStart(2, '0')}`, return_date: '2027-01-28',
  adults: 1, infants: 0, user_id: userId,
} as Parameters<typeof db.queries.insertSearch>[0]);

describe('route limit (shared by web and mobile)', () => {
  it('refuses a free user at the free maxRoutes, with a message derived from TIER_LIMITS', () => {
    const uid = Number(db.getDb().prepare("INSERT INTO users (email, tier) VALUES ('lim@x.com','free')").run().lastInsertRowid);
    const user = db.queries.getUserById(uid)!;
    const max = db.TIER_LIMITS.free.maxRoutes;
    for (let i = 0; i < max - 1; i++) watch(uid, i);
    expect(db.routeLimitError(user)).toBeNull();
    watch(uid, max);
    const msg = db.routeLimitError(user)!;
    expect(msg).toContain(String(max));
    expect(msg).toContain(String(db.TIER_LIMITS.pro.maxRoutes)); // the real next-tier number
    expect(msg).not.toMatch(/unlimited/i);
  });
});
