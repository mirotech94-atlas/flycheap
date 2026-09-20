import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every API route is guarded, or is on the list of ones that must not be.
 *
 * WHY A TEST AND NOT A CONVENTION
 * middleware.ts excludes `api/` from its matcher:
 *
 *   matcher: ['/((?!_next/|api/|favicon|icon|robots|sitemap|.*\\..*).*)']
 *
 * So an API route is exactly as protected as its own handler makes it, and
 * nothing tells you when one is not. Several were not, and one of them —
 * /api/settings — was returning the owner's alert email, a Slack target and a
 * Telegram chat id to anonymous callers in production, with an equally open PUT
 * that could repoint alerts at someone else's inbox.
 *
 * A new unguarded route now fails this test instead of waiting to be noticed.
 */

const API = join(process.cwd(), 'src', 'app', 'api');

/**
 * Routes that are public BY DESIGN, each with the reason.
 *
 * Adding to this list is a decision about what the internet may reach, so it
 * carries a justification and nothing else does.
 */
const INTENTIONALLY_PUBLIC: Record<string, string> = {
  'aasa/route.ts': 'Apple app-site-association — fetched by iOS, unauthenticated by spec.',
  'assetlinks/route.ts': 'Android asset links — fetched by the OS, unauthenticated by spec.',
  'health/route.ts': 'Uptime probe, called by monitoring. Reports status only, no account data.',
  'og/route.ts': 'Open Graph image for link previews — fetched by crawlers.',
  'lang/route.ts': 'Sets the locale cookie, which anonymous visitors need before signing in.',
  'caddy/ask/route.ts': 'Caddy on-demand-TLS verifier. Caddy calls it with no credentials; requiring auth breaks certificate issuance.',
  'best-deals/route.ts': 'Public cached deals, the same ones shown on the marketing site.',
  'best-deals/export/route.ts': 'Public cached deals, the same data as the public deals table.',
  'offers/route.ts': 'Public live search, same data as the public offers page.',
  'live-feed/route.ts': 'Public cached activity feed, already shown to logged-out visitors.',
  'route-dna/route.ts': 'Public route statistics, shown on the public route pages.',
  'hotels/by-month/route.ts': 'Public cached hotel prices, shown on the public hotels page.',
  'v1/plans/route.ts': 'Public price list, the same one the pricing page shows.',
  'auth/login/route.ts': 'Sign-in. It cannot require the session it is in the business of creating.',
  'auth/logout/route.ts': 'Sign-out. Clears the session cookie; nothing to protect.',
  'auth/verify/route.ts': 'Magic-link verification — the token IS the credential.',
  'auth/device-login/route.ts': 'Device sign-in — the token IS the credential.',
  'v1/auth/request-link/route.ts': 'Requests a magic link; cannot require the session it creates.',
  'v1/auth/email/request/route.ts': 'Requests an email code; cannot require the session it creates.',
  'v1/auth/verify/route.ts': 'Exchanges a magic-link token for a mobile session — the token IS the credential.',
  'v1/auth/email/verify/route.ts': 'Verifies an emailed code — the code IS the credential.',
  'v1/auth/enroll/route.ts': 'Enrols a device against a one-time token — the token IS the credential.',
  'early-access/route.ts': 'Public sign-up form — it exists to be reached by strangers.',
  'early-access/approve/route.ts': 'Owner approval link from email — the token IS the credential.',
  'early-access/feed/route.ts': 'Public sign-up counter rendered on the marketing page.',
  'twilio/incoming/route.ts': 'Twilio inbound webhook — authenticated by Twilio signature, not a session.',
  'unsubscribe/route.ts': 'One-click unsubscribe from an email — the token IS the credential.',
};

/** Anything that proves the handler makes an authorisation decision. */
const GUARD_SIGNALS = [
  'requireUser', 'requireOwner', 'apiAuth', 'apiAuthBearer', 'getCurrentUser',
  'isOwner', 'isAdminHost', 'verifySvixSignature', 'CRON_SECRET',
  'stripe', 'paypal', 'rateLimitCheck',
  // A verified webhook signature is an authorisation decision — it proves the
  // caller is Slack/Telegram/Twilio and not an anonymous stranger.
  'createHmac', 'Secret-Token', 'SIGNING_SECRET',
];

function routeFiles(dir = API, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { routeFiles(p, out); continue; }
    if (name === 'route.ts' || name === 'route.tsx') out.push(p);
  }
  return out;
}

const rel = (p: string) => p.slice(API.length + 1).replace(/\\/g, '/');

describe('every API route decides who may call it', () => {
  it('has no route that is neither guarded nor declared public', () => {
    const unguarded: string[] = [];
    for (const file of routeFiles()) {
      const r = rel(file);
      if (r in INTENTIONALLY_PUBLIC) continue;
      const src = readFileSync(file, 'utf8');
      if (!GUARD_SIGNALS.some(sig => src.includes(sig))) unguarded.push(r);
    }
    expect(unguarded).toEqual([]);
  });

  it('keeps the public list honest — every entry still exists', () => {
    // A stale exemption is how a path gets re-added later and inherits a
    // waiver it was never granted.
    const actual = new Set(routeFiles().map(rel));
    const stale = Object.keys(INTENTIONALLY_PUBLIC).filter(p => !actual.has(p));
    expect(stale).toEqual([]);
  });

  it('gives every public route a stated reason', () => {
    for (const [p, why] of Object.entries(INTENTIONALLY_PUBLIC)) {
      expect(why.length, `${p} needs a reason`).toBeGreaterThan(20);
    }
  });
});

describe('the endpoints that were open in production', () => {
  const guarded = (p: string) => readFileSync(join(API, p), 'utf8');

  it('settings requires a session on both verbs', () => {
    const src = guarded('settings/route.ts');
    expect((src.match(/requireUser\(\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('settings never returns a credential, only whether one is set', () => {
    const src = guarded('settings/route.ts');
    // The old handler returned alert_slack_webhook's VALUE.
    expect(src).toMatch(/_configured/);
    expect(src).not.toMatch(/alert_slack_webhook:\s*queries\.getSetting/);
  });

  it('settings writes per-user, not to the global row every account shares', () => {
    const src = guarded('settings/route.ts');
    expect(src).toMatch(/setUserSetting/);
  });

  it('provider credentials and destructive maintenance are owner-only', () => {
    expect(guarded('providers/keys/route.ts')).toMatch(/requireOwner\(\)/);
    expect(guarded('db/compact/route.ts')).toMatch(/requireOwner\(\)/);
  });

  it('a route can only be changed by the account that owns it', () => {
    const src = guarded('searches/[id]/route.ts');
    expect(src).toMatch(/ownedBy/);
    // Both verbs, not just the destructive one.
    expect((src.match(/ownedBy\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('the alert export is scoped to the caller', () => {
    const src = guarded('alerts/export/route.ts');
    expect(src).toMatch(/requireUser\(\)/);
    expect(src).toMatch(/user_id = \?/);
    // queries.recentAlerts() is global; exporting it handed over every account.
    expect(src).not.toMatch(/queries\.recentAlerts\(500\)/);
  });
});
