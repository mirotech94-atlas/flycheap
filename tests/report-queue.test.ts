import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { useTempDb } from './helpers/tempDb';

/**
 * Monthly savings reports: review, then send.
 *
 * The thing these tests protect is the gap between "built" and "sent". A
 * report is a number the agency has to defend to its client, so nothing goes
 * out that a human has not read — and the bulk action that makes reading
 * fifty of them bearable must not be able to reach across agencies.
 */

let dbmod: typeof import('@/lib/db');
let rq: typeof import('@/lib/reportQueue');

const PERIOD = { start: '2026-08-01', end: '2026-08-31', label: 'August 2026' };

beforeAll(async () => {
  useTempDb();
  dbmod = await import('@/lib/db');
  dbmod.getDb();
  rq = await import('@/lib/reportQueue');
});

const db = () => dbmod.getDb();

function seedOrg(name = 'Kingsway Travel'): number {
  const r = db().prepare(
    `INSERT INTO organizations (name, slug, tier, from_name, support_email) VALUES (?, ?, 'team', ?, 'desk@kingsway.test')`,
  ).run(name, name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now() + Math.random(), name);
  return Number(r.lastInsertRowid);
}
function seedGroup(orgId: number, name: string, contact: string | null): number {
  const r = db().prepare(`INSERT INTO groups (org_id, name, contact_email) VALUES (?, ?, ?)`).run(orgId, name, contact);
  return Number(r.lastInsertRowid);
}
function seedWatch(groupId: number, over: { baseline?: number | null; booked?: number | null; route?: [string, string] } = {}) {
  const [o, d] = over.route ?? ['JFK', 'CAI'];
  const r = db().prepare(
    `INSERT INTO searches (origin, destination, depart_date, return_date, adults, infants, active, user_id, group_id, baseline_amount_usd, booked_amount_usd)
     VALUES (?, ?, '2026-08-10', '2026-08-20', 1, 0, 1, 1, ?, ?, ?)`,
  ).run(o, d, groupId, over.baseline ?? null, over.booked ?? null);
  return Number(r.lastInsertRowid);
}

beforeEach(() => {
  for (const t of ['report_sends', 'searches', 'groups', 'org_members', 'organizations']) {
    db().prepare(`DELETE FROM ${t}`).run();
  }
});

describe('the period', () => {
  it('is the calendar month before the run date', () => {
    const p = rq.periodFor(new Date('2026-09-01T07:00:00Z'));
    expect(p).toEqual({ start: '2026-08-01', end: '2026-08-31', label: 'August 2026' });
  });

  it('handles January', () => {
    const p = rq.periodFor(new Date('2027-01-01T07:00:00Z'));
    expect(p.start).toBe('2026-12-01');
    expect(p.end).toBe('2026-12-31');
  });
});

describe('building the queue', () => {
  it('queues one report per group that has something to say', () => {
    const org = seedOrg();
    const a = seedGroup(org, 'Wedding', 'a@example.test');
    const b = seedGroup(org, 'Conference', 'b@example.test');
    seedWatch(a, { baseline: 1000, booked: 820 });
    seedWatch(b, { baseline: 900, booked: null });   // unscored, but still worth a report

    const r = rq.queueMonthlyReports(org, PERIOD);
    expect(r.queued).toBe(2);
    expect(dbmod.queries.reportSendsForOrg(org, 'queued')).toHaveLength(2);
  });

  it('does not queue an empty report', () => {
    // An empty report is not a report, and it teaches people to skip the real ones.
    const org = seedOrg();
    seedGroup(org, 'Dormant', 'x@example.test');
    const r = rq.queueMonthlyReports(org, PERIOD);
    expect(r.queued).toBe(0);
    expect(dbmod.queries.reportSendsForOrg(org)).toHaveLength(0);
  });

  it('is idempotent per group and period', () => {
    // The first-of-the-month job must be safe to run twice, and must never
    // re-queue a report underneath the person who already approved it.
    const org = seedOrg();
    const g = seedGroup(org, 'Wedding', 'a@example.test');
    seedWatch(g, { baseline: 1000, booked: 820 });
    rq.queueMonthlyReports(org, PERIOD);
    const [row] = dbmod.queries.reportSendsForOrg(org, 'queued');
    dbmod.queries.approveReportSends([row.id], org, 1);

    const again = rq.queueMonthlyReports(org, PERIOD);
    expect(again.queued).toBe(0);
    expect(dbmod.queries.reportSendsForOrg(org)).toHaveLength(1);
    expect(dbmod.queries.reportSendsForOrg(org)[0].status).toBe('approved');
  });

  it('stores the full report, losses and unscored trips included', () => {
    const org = seedOrg();
    const g = seedGroup(org, 'Wedding', 'a@example.test');
    seedWatch(g, { baseline: 1000, booked: 820, route: ['JFK', 'CAI'] });
    seedWatch(g, { baseline: 1400, booked: 1500, route: ['JFK', 'LOS'] });   // went UP
    seedWatch(g, { baseline: null, booked: 600, route: ['JFK', 'BCN'] });    // no baseline
    rq.queueMonthlyReports(org, PERIOD);

    const s = rq.parseSummary(dbmod.queries.reportSendsForOrg(org)[0]);
    expect(s.totalSavedUsd).toBe(180 - 100);
    expect(s.lines.find(l => l.route === 'JFK → LOS')!.savedUsd).toBe(-100);
    expect(s.unscored).toEqual([{ watchId: expect.any(Number), route: 'JFK → BCN', reason: 'no baseline captured' }]);
  });
});

describe('approving', () => {
  it('bulk-approves only rows that belong to the org and are still queued', () => {
    const mine = seedOrg('Mine');
    const theirs = seedOrg('Theirs');
    const g1 = seedGroup(mine, 'A', 'a@example.test');
    const g2 = seedGroup(theirs, 'B', 'b@example.test');
    seedWatch(g1, { baseline: 1000, booked: 800 });
    seedWatch(g2, { baseline: 1000, booked: 800 });
    rq.queueMonthlyReports(mine, PERIOD);
    rq.queueMonthlyReports(theirs, PERIOD);

    const mineRow = dbmod.queries.reportSendsForOrg(mine, 'queued')[0];
    const theirRow = dbmod.queries.reportSendsForOrg(theirs, 'queued')[0];

    // An admin of "Mine" passes both ids. Only their own moves.
    const changed = dbmod.queries.approveReportSends([mineRow.id, theirRow.id], mine, 7);
    expect(changed).toBe(1);
    expect(dbmod.queries.reportSendsForOrg(theirs, 'queued')).toHaveLength(1);
    expect(dbmod.queries.reportSendsForOrg(mine, 'approved')[0].approved_by).toBe(7);
  });

  it('does not re-approve something already sent', () => {
    const org = seedOrg();
    const g = seedGroup(org, 'A', 'a@example.test');
    seedWatch(g, { baseline: 1000, booked: 800 });
    rq.queueMonthlyReports(org, PERIOD);
    const row = dbmod.queries.reportSendsForOrg(org)[0];
    dbmod.queries.markReportSend(row.id, 'sent', { messageId: 'm1' });
    expect(dbmod.queries.approveReportSends([row.id], org, 1)).toBe(0);
  });

  it('can be skipped, with the reason kept', () => {
    const org = seedOrg();
    const g = seedGroup(org, 'A', 'a@example.test');
    seedWatch(g, { baseline: 1000, booked: 800 });
    rq.queueMonthlyReports(org, PERIOD);
    const row = dbmod.queries.reportSendsForOrg(org)[0];
    dbmod.queries.skipReportSend(row.id, org, 'client on hold');
    expect(dbmod.queries.reportSendsForOrg(org)[0]).toMatchObject({ status: 'skipped', skip_reason: 'client on hold' });
  });
});

describe('sending', () => {
  function queuedAndApproved(contact: string | null) {
    const org = seedOrg();
    const g = seedGroup(org, 'Wedding', contact);
    seedWatch(g, { baseline: 1000, booked: 820 });
    rq.queueMonthlyReports(org, PERIOD);
    const row = dbmod.queries.reportSendsForOrg(org)[0];
    dbmod.queries.approveReportSends([row.id], org, 1);
    return { org, row };
  }

  it('sends nothing that has not been approved', async () => {
    const org = seedOrg();
    const g = seedGroup(org, 'A', 'a@example.test');
    seedWatch(g, { baseline: 1000, booked: 800 });
    rq.queueMonthlyReports(org, PERIOD);
    const sent: string[] = [];
    const r = await rq.sendApprovedReports({ send: async m => { sent.push(m.to); return { id: 'x' }; } });
    expect(r.due).toBe(0);
    expect(sent).toEqual([]);
  });

  it('sends an approved report to the group contact and marks it sent', async () => {
    const { org } = queuedAndApproved('client@example.test');
    const sent: Array<{ to: string; subject: string; html: string }> = [];
    const r = await rq.sendApprovedReports({ send: async m => { sent.push(m); return { id: 'msg-1' }; } });
    expect(r.sent).toBe(1);
    expect(sent[0].to).toBe('client@example.test');
    expect(sent[0].subject).toBe('August 2026 savings report — Wedding');
    expect(dbmod.queries.reportSendsForOrg(org)[0]).toMatchObject({ status: 'sent', message_id: 'msg-1' });
  });

  it('skips, with the reason, when the group has no contact email — never falls back to the agency', async () => {
    // Falling back to the agency's own address would look, in the queue, as if
    // the client had received it.
    const { org } = queuedAndApproved(null);
    const sent: string[] = [];
    const r = await rq.sendApprovedReports({ send: async m => { sent.push(m.to); return { id: 'x' }; } });
    expect(r.skipped).toBe(1);
    expect(sent).toEqual([]);
    expect(dbmod.queries.reportSendsForOrg(org)[0]).toMatchObject({ status: 'skipped', skip_reason: 'group has no contact email' });
  });

  it('leaves an approval standing when the mailer is not configured', async () => {
    // Unconfigured is not failed. Burning the approval would mean the report
    // silently never goes out once a key exists.
    const { org } = queuedAndApproved('client@example.test');
    const prev = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try {
      const r = await rq.sendApprovedReports();
      expect(r.skipped).toBe(1);
      expect(dbmod.queries.reportSendsForOrg(org)[0].status).toBe('approved');
    } finally {
      if (prev != null) process.env.RESEND_API_KEY = prev;
    }
  });

  it('records a failure and keeps the row for retry', async () => {
    const { org } = queuedAndApproved('client@example.test');
    const r = await rq.sendApprovedReports({ send: async () => ({ error: 'rate limited' }) });
    expect(r.failed).toBe(1);
    expect(dbmod.queries.reportSendsForOrg(org)[0]).toMatchObject({ status: 'failed', skip_reason: 'rate limited' });
  });
});

describe('the email itself', () => {
  it('shows the loss and names every unscored trip', () => {
    const rendered = rq.renderSavingsReportEmail({
      orgName: 'Kingsway Travel',
      summary: {
        groupId: 1, groupName: 'Wedding', periodStart: PERIOD.start, periodEnd: PERIOD.end, period: PERIOD,
        lines: [
          { watchId: 1, route: 'JFK → CAI', baselineUsd: 1000, bookedUsd: 820, savedUsd: 180, savedPct: 18 },
          { watchId: 2, route: 'JFK → LOS', baselineUsd: 1400, bookedUsd: 1500, savedUsd: -100, savedPct: -7.14 },
        ],
        totalSavedUsd: 80,
        unscored: [{ watchId: 3, route: 'JFK → BCN', reason: 'not marked booked' }],
      },
    });
    expect(rendered.html).toContain('−$100');
    expect(rendered.html).toContain('JFK → BCN (not marked booked)');
    expect(rendered.html).toContain('2 of 3 trips');
    expect(rendered.text).toContain('Not counted: JFK → BCN');
  });

  it('never uses amber or teal as text', () => {
    // The email design system: light, and the brand accents are not AA on white.
    const rendered = rq.renderSavingsReportEmail({
      orgName: 'X',
      summary: { groupId: 1, groupName: 'G', periodStart: PERIOD.start, periodEnd: PERIOD.end, period: PERIOD, lines: [], totalSavedUsd: 0, unscored: [] },
    });
    expect(rendered.html.toLowerCase()).not.toContain('#e8a33d');
    expect(rendered.html.toLowerCase()).not.toContain('color:#2dd4bf');
  });
});
