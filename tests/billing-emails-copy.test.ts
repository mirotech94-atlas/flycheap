import { describe, it, expect, beforeAll } from 'vitest';

// Simulate production's senders BEFORE the modules load: Resend, Twilio SMS and
// Telegram are configured; the WhatsApp sender is not. With no env at all the
// channel helper would fall back to what a plan PERMITS (which includes
// WhatsApp, flagged "available on this plan"), and this test would be checking
// the fallback rather than the measured copy customers get.
process.env.RESEND_API_KEY ||= 're_test';
process.env.TWILIO_ACCOUNT_SID ||= 'ACtest';
process.env.TWILIO_AUTH_TOKEN ||= 'test';
process.env.TWILIO_FROM_SMS ||= '+15550000000';
process.env.TELEGRAM_BOT_TOKEN ||= 'test';
delete process.env.TWILIO_FROM_WHATSAPP;

const { upgradeNudgeEmail } = await import('@/lib/billing-emails');
const { welcomeQuickStartEmail } = await import('@/lib/emailTemplates');
const { PRICES } = await import('@/lib/prices');
const { TIER_LIMITS } = await import('@/lib/db');
void beforeAll;

/**
 * The two lifecycle emails every trial user receives. Both used to carry a
 * hand-written feature list that no longer matched the product; both are now
 * derived from TIER_LIMITS, PRICES and the deliverable channels.
 */
const NEVER = [
  /\d+-minute polling/i, /priority polling/i, /whatsapp/i, /instagram/i, /slack alerts/i,
  /mistake-fare/i, /REST API/i, /\/welcome/i, /white-label/i, /custom domain/i,
];

describe('upgrade nudge email', () => {
  const { subject, html } = upgradeNudgeEmail();

  it('quotes the real prices and the real Free limit', () => {
    expect(html).toContain(`$${PRICES.pro.month}/month`);
    expect(html).toContain(`${TIER_LIMITS.free.maxRoutes} tracked routes`);
    expect(subject).toMatch(/3 months/);
  });

  it('links to the live pricing page, not the retired /welcome', () => {
    expect(html).toMatch(/\/pricing/);
  });

  it('makes no claim the product cannot keep, and names the measured channels', () => {
    for (const re of NEVER) expect(html, String(re)).not.toMatch(re);
    expect(html).toMatch(/alerts by SMS and Telegram/);
  });
});

describe('welcome email founding footer', () => {
  const { html } = welcomeQuickStartEmail({ appUrl: 'https://my.flycheap.live' });

  it('describes the trial as the full product and Free by its real limit', () => {
    expect(html).toContain('full product');
    expect(html).toContain(`${TIER_LIMITS.free.maxRoutes} tracked routes`);
    expect(html).toContain(`$${PRICES.pro.month}/mo`);
  });

  it('makes no claim the product cannot keep', () => {
    for (const re of NEVER) expect(html, String(re)).not.toMatch(re);
  });
});
