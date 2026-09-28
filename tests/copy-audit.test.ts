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

/**
 * Internal surfaces. Admins may see the real internal numbers.
 *
 * `/lib/` is internal EXCEPT the i18n dictionaries, which are pure customer
 * copy — and which is where the tenth, eleventh and twelfth false claims were
 * hiding after the pages themselves had been cleaned. A string is not internal
 * because of the folder it is stored in.
 */
const NOT_CUSTOMER_FACING = [
  '/admin/', '/api/', 'instrumentation', 'sitemap', 'robots', 'manifest',
];

/** EVERY locale dictionary is customer copy, not just English. */
const isDictionary = (rel: string) => /\/lib\/i18n\/[a-z-]+\.[a-z]{2}\.ts$/.test(rel);
const isInternalLib = (rel: string) => rel.includes('/lib/') && !isDictionary(rel);

function customerFacingFiles(dir = SRC, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { customerFacingFiles(p, out); continue; }
    if (!/\.(tsx|ts)$/.test(p)) continue;
    const rel = p.slice(SRC.length).replace(/\\/g, '/');
    if (NOT_CUSTOMER_FACING.some(x => rel.includes(x))) continue;
    if (isInternalLib(rel)) continue;
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

describe('no customer-facing page claims an airline count it cannot measure', () => {
  /**
   * "1,000+ airlines" was on eleven pages, the nav guest line, the share card,
   * the PWA manifest and three locale dictionaries. It is a metasearch
   * catalogue number nothing in this codebase reads; the only enabled provider
   * is Travelpayouts and only ~50 distinct carrier codes appear in recorded
   * fares. The measurable figure is `airlinesSeen` in public-metrics.ts — use
   * that on a dynamic page, or say "airline fares" with no number at all.
   *
   * Digits next to the word "airline(s)" catch the typed claim whatever the
   * thousands separator, and the Hindi/Chinese forms it was translated into.
   */
  // A number (any thousands separator, incl. the French narrow space), then
  // the word for airline in every shipped locale, on the SAME line — a count
  // that happens to end a line above the word "airline" is not a claim.
  const NUM = '\\d[\\d,._ \\u00a0\\u202f]*\\+?[ \\t\\u00a0\\u202f]*(多)?(家)?[ \\t]*';
  const BANNED = [
    new RegExp(NUM + '(airlines?|carriers?|aerol[ií]neas|compagnies?|companhias|fluggesellschaften)\\b', 'i'),
    new RegExp(NUM + '(航空公司|एयरलाइन|شرك(ة|ات) طيران|авиакомпани|航空会社|항공사)'),
    /\b(thousands?|hundreds?)\s+of\s+(airlines|carriers)\b/i,
  ];

  it('holds across every page, component and locale dictionary', () => {
    const offences: string[] = [];
    // The manifest and the OG route are not in customerFacingFiles() but ship
    // to customers as the install prompt and the share card; include them.
    const files = [
      ...customerFacingFiles(),
      join(SRC, 'app/manifest.ts'),
      join(SRC, 'app/api/og/route.ts'),
    ];
    for (const file of files) {
      const text = prose(readFileSync(file, 'utf8'));
      for (const re of BANNED) {
        const m = re.exec(text);
        if (m) offences.push(`${file.slice(SRC.length)} → "${m[0].trim()}"`);
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

/**
 * The same claims existed in seven other languages.
 *
 * They were translations of the English sentences, so they said the same untrue
 * things: "5-minute polling" on a plan that polls every 30, "Slack alerts" for
 * a channel that is not in any tier's list, WhatsApp as an available channel
 * when its sender is unset, and "the Free plan covers one route" when Free is
 * five.
 *
 * They are corrected, and the audit above now walks every locale rather than
 * only *.en.ts — a string is not internal because of the language it is in.
 * What remains is a TONE review by a native speaker, not a factual one: the
 * numbers and channel names are now the same in every language, and this test
 * is what keeps them that way.
 */
describe('every locale, not just English', () => {
  const LOCALES = ['ar', 'de', 'es', 'fr', 'hi', 'it', 'zh'];
  const CLAIM = /(\d+\s*-?\s*minute\s+polling|poll(?:s|ed|ing)?\s+every\s+\d|Slack\s+alerts?)/gi;

  it('carries no cadence promise in any language', () => {
    const offences: string[] = [];
    for (const loc of LOCALES) {
      for (const base of ['app', 'early-access']) {
        const f = join(SRC, 'lib', 'i18n', `${base}.${loc}.ts`);
        let text = '';
        try { text = prose(readFileSync(f, 'utf8')); } catch { continue; }
        for (const m of text.matchAll(CLAIM)) offences.push(`${base}.${loc} → "${m[0]}"`);
      }
    }
    expect(offences).toEqual([]);
  });

  it('does not offer WhatsApp as an alert channel in any language', () => {
    // 'WhatsApp' on its own is the SHARE button (share this page on WhatsApp),
    // which is real. The claim is WhatsApp listed alongside the other ALERT
    // channels — always next to SMS or Telegram.
    const offences: string[] = [];
    for (const loc of LOCALES) {
      for (const base of ['app', 'early-access']) {
        const f = join(SRC, 'lib', 'i18n', `${base}.${loc}.ts`);
        let text = '';
        try { text = prose(readFileSync(f, 'utf8')); } catch { continue; }
        for (const re of [/WhatsApp[^'"]{0,20}(Telegram|SMS)/gi, /(Telegram|SMS)[^'"]{0,20}WhatsApp/gi]) {
          for (const m of text.matchAll(re)) offences.push(`${base}.${loc} → "${m[0].trim()}"`);
        }
      }
    }
    expect(offences).toEqual([]);
  });
});
