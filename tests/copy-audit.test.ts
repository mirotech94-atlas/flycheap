import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A grep, as a test.
 *
 * "Every customer-facing number must be derived, never typed... Nine false
 *  public claims have been found and fixed already — audit copy for invented
 *  numbers whenever touching a page."
 *
 * Doing that audit by hand each time is how the tenth, eleventh and twelfth got
 * in (a polling cadence that contradicted TIER_LIMITS on four pages, and a
 * pricing bullet advertising three channels that cannot deliver). This runs the
 * audit on every commit instead.
 *
 * When this fails, the fix is to DERIVE the number or delete the claim — not to
 * add the file to the allowlist.
 */

const SRC = join(process.cwd(), 'src');

/** Internal surfaces. Admins may see the real internal numbers. */
const NOT_CUSTOMER_FACING = [
  '/admin/', '/api/', '/lib/', 'instrumentation', 'sitemap', 'robots', 'manifest',
];

function customerFacingFiles(dir = SRC, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { customerFacingFiles(p, out); continue; }
    if (!/\.(tsx|ts)$/.test(p)) continue;
    const rel = p.slice(SRC.length).replace(/\\/g, '/');
    if (NOT_CUSTOMER_FACING.some(x => rel.includes(x))) continue;
    out.push(p);
  }
  return out;
}

/** Strip comments — a comment explaining why a number was REMOVED is not a claim. */
function prose(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
}

describe('no customer-facing page promises a polling cadence', () => {
  /**
   * pollBudget.ts gates full allocator authority on "the pricing page no longer
   * sells a polling interval". Any sentence with an interval in it re-imposes
   * that promise, on whichever page it appears.
   */
  const BANNED = [
    /\bpoll(s|ed|ing)?\s+(it\s+)?every\s+\d/i,
    /\bchecked\s+every\s+\d/i,
    /\bevery\s+\d+\s*(-|\s)?\s*(min|minute|hour)s?\b/i,
    /\b\d+\s*-\s*(minute|hour)\s+polling\b/i,
    /\bfare\s+checked\s+every\b/i,
    /\d+×\s*faster\b/i,
  ];

  it('holds across every page and component', () => {
    const offences: string[] = [];
    for (const file of customerFacingFiles()) {
      const text = prose(readFileSync(file, 'utf8'));
      for (const re of BANNED) {
        const m = re.exec(text);
        if (m) offences.push(`${file.slice(SRC.length)} → "${m[0]}"`);
      }
    }
    expect(offences).toEqual([]);
  });
});

describe('no customer-facing page advertises a channel we cannot send on', () => {
  /**
   * Slack is the internal ops channel and is in no tier's channel list.
   * Instagram has no sender and no code. Both were on the pricing page as
   * customer alert channels.
   */
  /**
   * /integrations is exempt, and the test below keeps it honest.
   *
   * That page offers a PUBLIC Slack workspace you join, not a per-account alert
   * channel on a plan — and it already does the right thing: it only prints the
   * "subscribe to #alerts" copy when the invite URL is configured to a real
   * value, and otherwise says "launching soon" and points at email and SMS.
   * That is the `isConfigured` ≠ enabled discipline working, so flagging it
   * would be flagging the correct behaviour.
   */
  const GATED_BY_CONFIGURATION = ['/app/integrations/page.tsx'];

  it('keeps /integrations gated on configuration — the reason it is exempt', () => {
    const src = readFileSync(join(SRC, 'app/integrations/page.tsx'), 'utf8');
    // If these disappear the exemption above stops being earned.
    expect(src).toMatch(/SLACK_ALERTS_OK/);
    expect(src).toMatch(/configured:\s*SLACK_ALERTS_OK/);
    expect(src).toMatch(/launching soon/i);
  });

  it('never offers Slack or Instagram as an ALERT channel', () => {
    const offences: string[] = [];
    for (const file of customerFacingFiles()) {
      const rel = file.slice(SRC.length).replace(/\\/g, '/');
      if (GATED_BY_CONFIGURATION.includes(rel)) continue;
      const text = prose(readFileSync(file, 'utf8'));
      // Only flag them where they appear next to alert/notification language —
      // a Slack community invite link is a different, real thing.
      for (const re of [
        /alert[^.\n]{0,80}\b(slack|instagram)\b/i,
        /\b(slack|instagram)\b[^.\n]{0,40}\balerts?\b/i,
        /channels?[^.\n]{0,60}\b(slack|instagram)\b/i,
      ]) {
        const m = re.exec(text);
        if (m) offences.push(`${file.slice(SRC.length)} → "${m[0].trim()}"`);
      }
    }
    expect(offences).toEqual([]);
  });
});
