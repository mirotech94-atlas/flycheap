import { describe, it, expect } from 'vitest';

// Production-like senders so the derived copy renders the measured channels.
process.env.RESEND_API_KEY ||= 're_test';
process.env.TWILIO_ACCOUNT_SID ||= 'ACtest';
process.env.TWILIO_AUTH_TOKEN ||= 'test';
process.env.TWILIO_FROM_SMS ||= '+15550000000';
process.env.TELEGRAM_BOT_TOKEN ||= 'test';

const { EMAIL_TOKENS, renderEmail } = await import('@/lib/emailLayout');
const { welcomeQuickStartEmail, signInCodeEmail, ticketReplyEmail } = await import('@/lib/emailTemplates');
const { upgradeNudgeEmail } = await import('@/lib/billing-emails');
const { renderSavingsReportEmail } = await import('@/lib/reportQueue');

/**
 * Every email wears the site's editorial system: its tokens, its three faces,
 * and its geometry (no radius, no shadow, no gradient). Amber is a fill for a
 * fare or the featured pricing action and is never text; a fare set as text
 * uses FARE_TEXT. These are the rules from CLAUDE.md and docs/design/handoff,
 * applied to the one surface that cannot read CSS variables.
 */
const SAMPLES: Record<string, string> = {
  welcome: welcomeQuickStartEmail({ appUrl: 'https://my.flycheap.live' }).html,
  code: signInCodeEmail({ code: '482917', minutes: 10 }).html,
  ticket: ticketReplyEmail({ ref: 'FC-1234', replyBody: 'Done.\n\nThanks.', threadUrl: 'https://my.flycheap.live/support/FC-1234' }).html,
  nudge: upgradeNudgeEmail().html,
  bare: renderEmail({ kind: 'notice', preheader: 'p', headline: 'h', body: '<p>b</p>' }),
  report: renderSavingsReportEmail({ orgName: 'Kingsway Travel', summary: { groupId: 1, groupName: 'Wedding', periodStart: '2026-08-01', periodEnd: '2026-08-31', period: { start: '2026-08-01', end: '2026-08-31', label: 'August 2026' }, lines: [{ watchId: 1, route: 'JFK → CAI', baselineUsd: 1000, bookedUsd: 820, savedUsd: 180, savedPct: 18 }], totalSavedUsd: 180, unscored: [] } }).html,
};

const RETIRED = ['#0a2e57', '#154a86', '#b8912f', '#f6f2e9', '#e6dfce', '#d4af37', '#061a35', '#0a1426', '#faf7ef'];

describe('email design system', () => {
  for (const [name, html] of Object.entries(SAMPLES)) {
    it(`${name}: editorial geometry — no radius, shadow or gradient`, () => {
      expect(html).not.toMatch(/border-radius\s*:\s*[1-9]/);
      expect(html).not.toMatch(/box-shadow/);
      expect(html).not.toMatch(/gradient\(/);
    });
    it(`${name}: no retired navy/gold literal survives`, () => {
      for (const hex of RETIRED) expect(html.toLowerCase(), hex).not.toContain(hex);
    });
    it(`${name}: amber is never a text colour`, () => {
      expect(html).not.toMatch(new RegExp(`color:\\s*${EMAIL_TOKENS.AMBER}`, 'i'));
    });
    it(`${name}: the three faces, with system fallbacks, and a light colour scheme`, () => {
      expect(html).toContain('Newsreader, Georgia');
      expect(html).toContain("'Public Sans', -apple-system");
      expect(html).toContain('<meta name="color-scheme" content="light">');
    });
  }

  it('the primary button is ink and the fare button is amber with ink text', async () => {
    const { emailButton, emailFareButton } = await import('@/lib/emailLayout');
    expect(emailButton('Go', 'https://x')).toContain(`background:${EMAIL_TOKENS.INK};color:#FFFFFF`);
    expect(emailFareButton('Book', 'https://x')).toContain(`background:${EMAIL_TOKENS.AMBER};color:${EMAIL_TOKENS.INK}`);
  });

  it('the masthead carries the 1px ink rule, not a block of colour', () => {
    expect(SAMPLES.bare).toContain(`border-bottom:1px solid ${EMAIL_TOKENS.INK}`);
    expect(SAMPLES.bare).not.toMatch(/background:#0a2e57/i);
  });
});
