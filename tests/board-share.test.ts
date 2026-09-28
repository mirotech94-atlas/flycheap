import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { useTempDb } from './helpers/tempDb';

/**
 * Boards carry named individuals' travel plans, which is personal data and for a
 * university is student data. So these tests are about the security properties
 * first and the feature second.
 */

let dbmod: typeof import('@/lib/db');
let boards: typeof import('@/lib/boardShare');
let org: typeof import('@/lib/org');

beforeAll(async () => {
  useTempDb();
  dbmod = await import('@/lib/db');
  dbmod.getDb();
  boards = await import('@/lib/boardShare');
  org = await import('@/lib/org');
});

let groupId: number;
beforeEach(() => {
  const db = dbmod.getDb();
  db.prepare('DELETE FROM board_views').run();
  db.prepare('DELETE FROM board_share').run();
  db.prepare('DELETE FROM groups').run();
  db.prepare('DELETE FROM org_members').run();
  db.prepare('DELETE FROM organizations').run();
  const o = org.createOrg({ name: 'Test Agency', ownerUserId: 1 });
  groupId = org.createGroup({ orgId: o.id, name: 'Client A' }).id;
});

describe('the token never hits the database', () => {
  it('stores only a hash', () => {
    const { token } = boards.createBoard({ groupId });
    const rows = dbmod.getDb().prepare('SELECT token_hash FROM board_share').all() as Array<{ token_hash: string }>;
    // A leaked database must not hand over working board URLs for every
    // family's travel plans.
    expect(rows[0].token_hash).not.toBe(token);
    expect(rows[0].token_hash).toBe(boards.hashToken(token));
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain(token);
  });

  it('issues a token with real entropy', () => {
    const a = boards.createBoard({ groupId }).token;
    const b = boards.createBoard({ groupId }).token;
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
  });
});

describe('revocation is immediate', () => {
  it('stops resolving the moment it is revoked', () => {
    const { token, id } = boards.createBoard({ groupId });
    expect(boards.resolveBoard(token)).not.toBeNull();
    boards.revokeBoard(id);
    // No cached decision anywhere: the whole value of revoke is immediacy.
    expect(boards.resolveBoard(token)).toBeNull();
  });

  it('refuses an unknown or empty token', () => {
    expect(boards.resolveBoard('nonsense')).toBeNull();
    expect(boards.resolveBoard('')).toBeNull();
  });
});

describe('expiry', () => {
  it('defaults to expiring rather than permanent', () => {
    // "Boards default to no-expiry OFF — make permanent a deliberate choice."
    const { token } = boards.createBoard({ groupId });
    expect(boards.resolveBoard(token)!.expires_at).not.toBeNull();
  });

  it('allows permanent only when explicitly asked for', () => {
    const { token } = boards.createBoard({ groupId, expiryDays: null });
    expect(boards.resolveBoard(token)!.expires_at).toBeNull();
  });

  it('stops resolving once expired', () => {
    const { token, id } = boards.createBoard({ groupId });
    dbmod.getDb().prepare(`UPDATE board_share SET expires_at = datetime('now','-1 day') WHERE id = ?`).run(id);
    expect(boards.resolveBoard(token)).toBeNull();
  });
});

describe('rotation is one action', () => {
  it('issues a new token and kills the old one together', () => {
    // Two steps would leave a window where both work, or neither does.
    const first = boards.createBoard({ groupId });
    const second = boards.rotateBoard(first.id)!;
    expect(second.token).not.toBe(first.token);
    expect(boards.resolveBoard(first.token)).toBeNull();
    expect(boards.resolveBoard(second.token)).not.toBeNull();
  });

  it('carries the old board’s privacy settings forward', () => {
    // Rotation is a security action, not a chance to silently change what the
    // board exposes.
    const first = boards.createBoard({ groupId, showPrices: false, showTargets: true });
    const second = boards.rotateBoard(first.id)!;
    const b = boards.resolveBoard(second.token)!;
    expect(b.show_prices).toBe(0);
    expect(b.show_targets).toBe(1);
  });

  it('returns null rather than throwing for a board that is not there', () => {
    expect(boards.rotateBoard(99999)).toBeNull();
  });
});

describe('privacy defaults', () => {
  it('shows prices but NOT targets by default', () => {
    // "A family organiser may not want everyone to see what they are willing
    // to pay."
    const { token } = boards.createBoard({ groupId });
    const b = boards.resolveBoard(token)!;
    expect(b.show_prices).toBe(1);
    expect(b.show_targets).toBe(0);
  });
});

describe('the loop, measured', () => {
  it('counts views and reports views-per-share', () => {
    const { token, id } = boards.createBoard({ groupId });
    boards.recordView(id, { ip: '1.2.3.0/24' });
    boards.recordView(id, { ip: '1.2.3.0/24' });
    const b = boards.resolveBoard(token)!;
    expect(b.view_count).toBe(2);
    expect(b.last_viewed_at).not.toBeNull();
    expect(boards.boardLoopMetrics().viewsPerShare).toBe(2);
  });

  it('reports null rather than zero when nothing has been viewed', () => {
    // A board nobody has opened is not a board with a 0% conversion rate.
    boards.createBoard({ groupId });
    const m = boards.boardLoopMetrics();
    expect(m.views).toBe(0);
    expect(m.conversionRatePct).toBeNull();
  });

  it('attributes a signup back to the board that produced it', () => {
    const { id } = boards.createBoard({ groupId });
    boards.recordView(id);
    boards.attributeConversion(id, 42);
    const m = boards.boardLoopMetrics();
    expect(m.conversions).toBe(1);
    expect(m.conversionRatePct).toBe(100);
  });
});

describe('organizations', () => {
  it('makes the creator the owner', () => {
    const o = org.createOrg({ name: 'Uni Office', ownerUserId: 7 });
    expect(org.roleInOrg(o.id, 7)).toBe('owner');
    expect(org.orgsForUser(7).map(x => x.id)).toContain(o.id);
  });

  it('uniquifies slugs, since they appear in board URLs', () => {
    const a = org.createOrg({ name: 'Same Name', ownerUserId: 1 });
    const b = org.createOrg({ name: 'Same Name', ownerUserId: 1 });
    expect(a.slug).not.toBe(b.slug);
  });

  it('gives Enterprise the things an agency is actually buying', () => {
    // "The line between Team and Enterprise is whose name is on it."
    expect(org.limitsForOrg({ tier: 'enterprise' }).brandedBoards).toBe(true);
    expect(org.limitsForOrg({ tier: 'enterprise' }).ownSendingDomain).toBe(true);
    expect(org.limitsForOrg({ tier: 'team' }).brandedBoards).toBe(false);
    expect(org.limitsForOrg(null).groups).toBe(10);
  });
});

describe('the monetization boundary', () => {
  it('is OFF by default for an organization group', () => {
    // "An agency does not want your hotel emails going to their clients —
    // those are their clients and hotel commission is their revenue."
    expect(org.monetizationAllowedForGroup(groupId)).toBe(false);
  });

  it('turns on only when the org opts in', () => {
    const g = org.getGroup(groupId)!;
    dbmod.getDb().prepare(`UPDATE organizations SET monetization_enabled = 1 WHERE id = ?`).run(g.org_id);
    expect(org.monetizationAllowedForGroup(groupId)).toBe(true);
  });

  it('still monetizes personal watches, which are not an org relationship', () => {
    expect(org.monetizationAllowedForGroup(null)).toBe(true);
  });

  it('default-denies a group whose org cannot be read', () => {
    // Wrong in this direction costs a commission; wrong the other way costs
    // the contract.
    expect(org.monetizationAllowedForGroup(999999)).toBe(false);
  });

  it('routes mistake fares to the agent first for org groups', () => {
    // The university office forwarding a glitch fare to 400 students is the
    // commitment carrying the most risk in the whole tier.
    expect(org.mistakeFaresGoToAgentFirst(groupId)).toBe(true);
    expect(org.mistakeFaresGoToAgentFirst(null)).toBe(false);
  });
});

describe('a board shows only its creator’s watches', () => {
  const addWatch = (userId: number, origin: string, groupId: number | null = null) => {
    const r = dbmod.queries.insertSearch({
      origin, destination: 'CAI', depart_date: '2027-01-10', return_date: '2027-01-20',
      adults: 1, infants: 0, user_id: userId,
    } as Parameters<typeof dbmod.queries.insertSearch>[0]);
    const id = Number(r.lastInsertRowid);
    if (groupId !== null) dbmod.getDb().prepare('UPDATE searches SET group_id = ? WHERE id = ?').run(groupId, id);
    return id;
  };
  const user = (email: string) => Number(dbmod.getDb().prepare('INSERT INTO users (email) VALUES (?)').run(email).lastInsertRowid);

  it('never includes another user’s routes', () => {
    const alice = user(`alice-${Date.now()}@x.com`);
    const bob = user(`bob-${Date.now()}@x.com`);
    const mine = addWatch(alice, 'JFK');
    const theirs = addWatch(bob, 'BOS');
    const { token } = boards.createBoard({ groupId, createdBy: alice });
    const ids = boards.boardRows(boards.resolveBoard(token)!).map(r => r.search.id);
    expect(ids).toContain(mine);
    expect(ids).not.toContain(theirs);
  });

  it('leaves out the creator’s watches filed under a different group', () => {
    const agent = user(`agent-${Date.now()}@x.com`);
    const otherGroup = org.createGroup({ orgId: org.getGroup(groupId)!.org_id, name: 'Client B' }).id;
    const forA = addWatch(agent, 'EWR', groupId);
    const forB = addWatch(agent, 'IAD', otherGroup);
    const { token } = boards.createBoard({ groupId, createdBy: agent });
    const ids = boards.boardRows(boards.resolveBoard(token)!).map(r => r.search.id);
    expect(ids).toContain(forA);
    expect(ids).not.toContain(forB);
  });

  it('a board with no recorded creator shows nothing (fails closed)', () => {
    const { token } = boards.createBoard({ groupId, createdBy: null });
    expect(boards.boardRows(boards.resolveBoard(token)!)).toEqual([]);
  });
});

describe('push devices', () => {
  it('a user can only unregister their own device token', () => {
    const q = dbmod.queries;
    q.upsertPushDevice('ExponentPushToken[victim]', 1, 'ios');
    expect(q.deletePushDeviceForUser('ExponentPushToken[victim]', 999).changes).toBe(0);
    expect(q.listPushDevicesForUser(1).map(d => d.token)).toContain('ExponentPushToken[victim]');
    expect(q.deletePushDeviceForUser('ExponentPushToken[victim]', 1).changes).toBe(1);
    expect(q.listPushDevicesForUser(1).map(d => d.token)).not.toContain('ExponentPushToken[victim]');
  });
});
