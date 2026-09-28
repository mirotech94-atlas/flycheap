import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
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

describe('early access: owner-facing output is escaped (stored XSS)', () => {
  const EVIL = `<script>alert(1)</script>`;

  it('escapeHtml neutralises every HTML-significant character', async () => {
    const { escapeHtml } = await import('@/lib/html');
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
    expect(escapeHtml(null)).toBe('');
  });

  it('the email check refuses angle brackets and other junk', () => {
    for (const bad of ['a<b@x.com', '<script>@x.com', 'x@y.com>', 'no-at-sign', 'a@b', '"a b"@x.com']) {
      expect(ea.isValidEarlyAccessEmail(bad), bad).toBe(false);
    }
    expect(ea.isValidEarlyAccessEmail('jo.rider+fly@example.co.uk')).toBe(true);
  });

  it('the owner notification escapes every requester field', () => {
    const r = ea.joinEarlyAccess({ email: 'xss1@example.com', name: EVIL, phone: `"><img src=x onerror=alert(1)>`, homeAirport: '<b>' });
    const row = { ...ea.getEarlyAccessById(r.id)!, referred_by: EVIL, ip: EVIL, email: `a'"<x>@example.com` };
    const html = ea.accessRequestHtml(row, 0, 1, 'https://app.test');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain(`a'"<x>`);
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('early access: approve link is a confirm page that POSTs, single-use and expiring', () => {
  const req = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) => new NextRequest(new URL(url, 'https://app.test'), init);
  const form = (fields: Record<string, string>) => {
    const body = new URLSearchParams(fields);
    return { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' } };
  };
  let route: typeof import('@/app/api/early-access/approve/route');
  beforeAll(async () => { route = await import('@/app/api/early-access/approve/route'); });

  it('GET changes nothing: it renders a confirmation form, with the requester escaped', async () => {
    const r = ea.joinEarlyAccess({ email: 'getonly@example.com', name: '<script>alert(1)</script>' });
    const row = ea.getEarlyAccessById(r.id)!;
    const res = await route.GET(req(`/api/early-access/approve?id=${row.id}&t=${row.approve_token}&action=approve`));
    const html = await res.text();
    expect(html).toMatch(/<form[^>]+method="post"/i);
    expect(html).not.toContain('<script>');
    const after = ea.getEarlyAccessById(row.id)!;
    expect(after.approved_at).toBeNull();
    expect(after.approve_token).toBe(row.approve_token);
    expect(db.queries.getUserByEmail('getonly@example.com')).toBeUndefined();
  });

  it('POST decides once; the same token cannot be used again', async () => {
    const r = ea.joinEarlyAccess({ email: 'once@example.com', name: 'Once' });
    const row = ea.getEarlyAccessById(r.id)!;
    const ok = await route.POST(req('/api/early-access/approve', form({ id: String(row.id), t: row.approve_token!, action: 'approve' })));
    expect(await ok.text()).toContain('Approved');
    expect(ea.getEarlyAccessById(row.id)!.approved_at).not.toBeNull();
    expect(ea.getEarlyAccessById(row.id)!.approve_token).toBeNull();
    const again = await route.POST(req('/api/early-access/approve', form({ id: String(row.id), t: row.approve_token!, action: 'decline' })));
    expect(await again.text()).toMatch(/no longer valid|Invalid/);
    expect(ea.getEarlyAccessById(row.id)!.declined_at).toBeNull();
  });

  it('a wrong token or an expired request decides nothing', async () => {
    const r = ea.joinEarlyAccess({ email: 'old@example.com', name: 'Old' });
    const row = ea.getEarlyAccessById(r.id)!;
    expect(ea.consumeEarlyAccessDecision(row.id, 'wrong-token', 'approve')).toBeNull();
    db.getDb().prepare(`UPDATE early_access SET created_at = datetime('now', '-${ea.APPROVE_LINK_TTL_DAYS + 1} days') WHERE id = ?`).run(row.id);
    expect(ea.consumeEarlyAccessDecision(row.id, row.approve_token!, 'approve')).toBeNull();
    expect(ea.getEarlyAccessById(row.id)!.approved_at).toBeNull();
  });
});
