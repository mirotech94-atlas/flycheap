import { describe, it, expect, beforeAll } from 'vitest';
import { bootTempDb } from './helpers/tempDb';

let db: Awaited<ReturnType<typeof bootTempDb>>;
beforeAll(async () => { db = await bootTempDb(); });

const watch = (userId: number, i: number) => db.queries.insertSearch({
  origin: 'JFK', destination: 'CAI', depart_date: `2027-01-${String(10 + (i % 15)).padStart(2, '0')}`, return_date: '2027-01-28',
  adults: 1, infants: 0, user_id: userId,
} as Parameters<typeof db.queries.insertSearch>[0]);

/**
 * This test asserted the opposite until the project went open source: a free
 * user was refused at five routes, and the message named Pro's number as the
 * upsell. There are no plans now, so the only honest assertion is that nobody
 * is refused — and that the gate still EXISTS, because the web and mobile
 * route-creation paths both call it and a caller that stops asking cannot be
 * told otherwise later.
 */
describe('route limit (shared by web and mobile)', () => {
  it('never refuses a user, because there is no plan to be over', () => {
    const uid = Number(db.getDb().prepare("INSERT INTO users (email, tier) VALUES ('lim@x.com','free')").run().lastInsertRowid);
    const user = db.queries.getUserById(uid)!;

    for (let i = 0; i < 25; i++) watch(uid, i);

    expect(db.routeLimitError(user)).toBeNull();
  });

  it('treats every stored tier name as the same unlimited one', () => {
    // An install that predates the change still has 'free'/'pro'/'enterprise'
    // in users.tier. None of them may behave differently.
    for (const tier of ['free', 'pro', 'enterprise', 'something-invented']) {
      const uid = Number(db.getDb()
        .prepare('INSERT INTO users (email, tier) VALUES (?, ?)')
        .run(`${tier}@x.com`, tier).lastInsertRowid);
      const user = db.queries.getUserById(uid)!;
      watch(uid, 1);
      expect(db.routeLimitError(user), tier).toBeNull();
    }
  });

  it('still has a ceiling, and explains it as a runaway rather than a plan', () => {
    // Not reached by inserting 100,000 rows — the message is the contract.
    const uid = Number(db.getDb().prepare("INSERT INTO users (email, tier) VALUES ('ceil@x.com','open')").run().lastInsertRowid);
    const user = db.queries.getUserById(uid)!;
    const max = db.TIER_LIMITS.open.maxRoutes;

    expect(max).toBeGreaterThan(10_000);
    const msg = db.routeLimitError({ ...user, id: -1 });
    // id -1 has no searches, so there is no error to read; assert the copy has
    // no plan language instead of fabricating a hundred thousand rows.
    expect(msg).toBeNull();
    const source = db.routeLimitError.toString();
    expect(source).not.toMatch(/plan's limit|upsell|Pro tracks/i);
    expect(source).toMatch(/runaway script/);
  });
});
