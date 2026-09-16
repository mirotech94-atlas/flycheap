import { describe, it, expect, beforeAll } from 'vitest';
import { bootTempDb } from './helpers/tempDb';

let db: Awaited<ReturnType<typeof bootTempDb>>;
let ea: typeof import('@/lib/early-access');
beforeAll(async () => { db = await bootTempDb(); ea = await import('@/lib/early-access'); });

describe('early access: name/phone capture + approval provisioning', () => {
  it('stores name and phone on join', () => {
    const r = ea.joinEarlyAccess({ email: 'jo@example.com', name: 'Jo Rider', phone: '+1 555 0100' });
    const row = ea.getEarlyAccessById(r.id)!;
    expect(row.name).toBe('Jo Rider');
    expect(row.phone).toBe('+1 555 0100');
  });

  it('approval provisions an account with the 3-month trial + profile', async () => {
    const r = ea.joinEarlyAccess({ email: 'pat@example.com', name: 'Pat Flyer', phone: '555-2000' });
    const row = ea.getEarlyAccessById(r.id)!;
    expect(db.queries.getUserByEmail('pat@example.com')).toBeUndefined(); // not yet
    await ea.approveAndProvision(row);
    const user = db.queries.getUserByEmail('pat@example.com')!;
    expect(user).toBeTruthy();
    expect(user.subscription_status).toBe('founding_free'); // trial granted
    expect(user.tier).toBe('free');
    expect(user.name).toBe('Pat Flyer');
    expect((user as { phone?: string }).phone).toBe('555-2000');
  });

  it('is idempotent per email (re-join returns existing, backfills missing fields)', () => {
    const a = ea.joinEarlyAccess({ email: 'sam@example.com', name: 'Sam' });
    const b = ea.joinEarlyAccess({ email: 'sam@example.com', name: 'Sam', phone: '555-3000' });
    expect(b.existing).toBe(true);
    expect(a.id).toBe(b.id);
    expect(ea.getEarlyAccessById(b.id)!.phone).toBe('555-3000'); // backfilled
  });
});
