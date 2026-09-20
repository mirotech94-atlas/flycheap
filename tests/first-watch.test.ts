import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { useTempDb } from './helpers/tempDb';
import { parseFirstWatch, placeholderDates } from '@/lib/firstWatch';

/**
 * First run: the watch exists before the email does.
 *
 * The activation gap this closes is real and measured: both trial users
 * clicked their magic link, logged in once, added zero routes, and never came
 * back. So the tests are about one thing — the route survives the funnel and
 * is already on the board at first login — and about the ways that could
 * quietly go wrong: a typo refusing a signup, a duplicate on re-approval, a
 * placeholder that disagrees with the API's own.
 */

let dbmod: typeof import('@/lib/db');
let ea: typeof import('@/lib/early-access');

beforeAll(async () => {
  useTempDb();
  dbmod = await import('@/lib/db');
  dbmod.getDb();
  ea = await import('@/lib/early-access');
});

beforeEach(() => {
  const db = dbmod.getDb();
  db.prepare('DELETE FROM searches').run();
  db.prepare('DELETE FROM users').run();
  try { db.prepare('DELETE FROM early_access').run(); } catch { /* not created until first join */ }
});

describe('parsing the route', () => {
  it('accepts a normal pair and normalises case', () => {
    expect(parseFirstWatch({ origin: 'jfk', destination: ' cai ' })).toEqual({ origin: 'JFK', destination: 'CAI' });
  });

  it('rejects anything that is not two IATA codes — without throwing', () => {
    // The form must never refuse a signup over the route field.
    expect(parseFirstWatch({ origin: 'JF', destination: 'CAI' })).toBeNull();
    expect(parseFirstWatch({ origin: 'JFKX', destination: 'CAI' })).toBeNull();
    expect(parseFirstWatch({ origin: '', destination: '' })).toBeNull();
    expect(parseFirstWatch({ origin: undefined, destination: null })).toBeNull();
    expect(parseFirstWatch({ origin: 123, destination: {} })).toBeNull();
  });

  it('treats a route to itself as a typo', () => {
    expect(parseFirstWatch({ origin: 'JFK', destination: 'JFK' })).toBeNull();
  });

  it('uses the same placeholder dates the API writes for any-dates routes', () => {
    // 30 and 37 days out. If these ever diverged from POST /api/searches, the
    // two paths would create routes that look different for no reason.
    const now = new Date('2026-09-20T12:00:00Z');
    expect(placeholderDates(now)).toEqual({ depart: '2026-10-20', ret: '2026-10-27' });
  });
});

describe('the route survives the funnel', () => {
  it('is stored on the access request', () => {
    const r = ea.joinEarlyAccess({ email: 'a@example.test', name: 'A', firstWatch: { origin: 'JFK', destination: 'CAI' } });
    const row = ea.getEarlyAccessById(r.id)!;
    expect(row.first_origin).toBe('JFK');
    expect(row.first_destination).toBe('CAI');
    // With no explicit home airport, the origin doubles as one.
    expect(row.home_airport).toBe('JFK');
  });

  it('a signup with no route still succeeds', () => {
    const r = ea.joinEarlyAccess({ email: 'b@example.test', name: 'B' });
    expect(r.id).toBeGreaterThan(0);
    expect(ea.getEarlyAccessById(r.id)!.first_origin).toBeNull();
  });

  it('a returning requester who now names a route gets it kept, never overwritten', () => {
    ea.joinEarlyAccess({ email: 'c@example.test', name: 'C' });
    ea.joinEarlyAccess({ email: 'c@example.test', firstWatch: { origin: 'EWR', destination: 'LOS' } });
    ea.joinEarlyAccess({ email: 'c@example.test', firstWatch: { origin: 'LAX', destination: 'BKK' } });
    const row = ea.getEarlyAccessById(ea.joinEarlyAccess({ email: 'c@example.test' }).id)!;
    expect(row.first_origin).toBe('EWR');
    expect(row.first_destination).toBe('LOS');
  });
});

describe('seeding the watch on approval', () => {
  it('creates the watch on the new account, as an any-dates route', () => {
    const r = ea.joinEarlyAccess({ email: 'd@example.test', name: 'D', firstWatch: { origin: 'JFK', destination: 'CAI' } });
    const row = ea.getEarlyAccessById(r.id)!;
    const user = dbmod.queries.upsertUserByEmail(row.email, row.name ?? undefined);
    const id = ea.seedFirstWatch(user.id, row);
    expect(id).not.toBeNull();

    const w = dbmod.queries.getSearchById(id!)!;
    expect(w.user_id).toBe(user.id);
    expect(w.origin).toBe('JFK');
    expect(w.destination).toBe('CAI');
    expect(w.active).toBe(1);
    expect(w.date_mode).toBe('any');
  });

  it('is idempotent — a re-approval, or a user who already added it, gets no duplicate', () => {
    const r = ea.joinEarlyAccess({ email: 'e@example.test', name: 'E', firstWatch: { origin: 'JFK', destination: 'CAI' } });
    const row = ea.getEarlyAccessById(r.id)!;
    const user = dbmod.queries.upsertUserByEmail(row.email);
    const first = ea.seedFirstWatch(user.id, row);
    const second = ea.seedFirstWatch(user.id, row);
    expect(second).toBe(first);
    const n = (dbmod.getDb().prepare('SELECT COUNT(*) AS n FROM searches WHERE user_id = ?').get(user.id) as { n: number }).n;
    expect(n).toBe(1);
  });

  it('seeds nothing when no route was given', () => {
    const r = ea.joinEarlyAccess({ email: 'f@example.test', name: 'F' });
    const user = dbmod.queries.upsertUserByEmail('f@example.test');
    expect(ea.seedFirstWatch(user.id, ea.getEarlyAccessById(r.id)!)).toBeNull();
  });

  it('does not seed a stored pair that fails to parse', () => {
    // Defensive: a row edited by hand, or a future schema drift, must not throw
    // inside approval — approval is the one step that has to succeed.
    const user = dbmod.queries.upsertUserByEmail('g@example.test');
    expect(ea.seedFirstWatch(user.id, { first_origin: 'J', first_destination: 'CAI' })).toBeNull();
  });
});
