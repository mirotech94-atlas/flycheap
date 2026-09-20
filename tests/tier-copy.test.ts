import { describe, it, expect } from 'vitest';
import {
  planFeatures, upgradeReasons, tierChannels, channelSentence, resolveChannels,
  POLLING_PROMISE, POLLING_PROMISE_SHORT,
} from '@/lib/tierCopy';
import { TIER_LIMITS } from '@/lib/db';
import type { Channel } from '@/lib/alertPolicy';

/**
 * These tests are about claims, not formatting.
 *
 * Nine false public claims have already been found and fixed in this codebase.
 * The pricing page had three more, all in one bullet. So the assertions here
 * are mostly "the copy cannot say X" rather than "the copy says X".
 */

/** What production can actually send on today. */
const REAL: Channel[] = ['email', 'sms', 'telegram'];
const ALL: Channel[] = ['email', 'sms', 'whatsapp', 'telegram', 'push'];

describe('a channel is only advertised when it can deliver', () => {
  it('drops WhatsApp when there is no WhatsApp sender', () => {
    // TWILIO_FROM_WHATSAPP is unset in production, so sendTwilio returns
    // "not configured" for every WhatsApp alert. Pro permits the channel; the
    // product cannot deliver it; the page must not sell it.
    expect(TIER_LIMITS.pro.channels).toContain('whatsapp');
    expect(tierChannels('pro', REAL)).not.toContain('whatsapp');
  });

  it('advertises it again the moment a sender exists', () => {
    expect(tierChannels('pro', ALL)).toContain('whatsapp');
  });

  it('never invents a channel the tier does not permit', () => {
    // Slack is the internal ops channel and is in no tier's list; Instagram has
    // no sender and no code. Both were on the pricing page.
    const text = planFeatures('pro', ALL).map(f => f.text).join(' ');
    expect(text).not.toMatch(/slack/i);
    expect(text).not.toMatch(/instagram/i);
  });

  it('cannot hand Free a channel it is not entitled to', () => {
    expect(tierChannels('free', ALL)).toEqual(['email']);
  });

  it('reads as a sentence', () => {
    expect(channelSentence(['email'])).toBe('Email');
    expect(channelSentence(['email', 'sms'])).toBe('Email and SMS');
    expect(channelSentence(['email', 'sms', 'telegram'])).toBe('Email, SMS and Telegram');
    expect(channelSentence([])).toBe('No alert channels');
  });
});

describe('when deliverability cannot be measured', () => {
  it('falls back to what the plan permits instead of claiming nothing', () => {
    // An environment that cannot read the sender env vars returns []. That
    // rendered "No alert channels" against every tier on the PUBLIC pricing
    // page — telling visitors the product cannot alert them at all, because of
    // a deployment condition. Worse than the lie this module exists to prevent.
    const r = resolveChannels('pro', []);
    expect(r.measured).toBe(false);
    expect(r.channels).toEqual(TIER_LIMITS.pro.channels);
  });

  it('says so in the copy rather than passing a guess off as a fact', () => {
    const unmeasured = planFeatures('pro', []).find(f => /^Alerts by/.test(f.text))!.text;
    expect(unmeasured).toMatch(/available on this plan/i);

    const measured = planFeatures('pro', REAL).find(f => /^Alerts by/.test(f.text))!.text;
    expect(measured).not.toMatch(/available on this plan/i);
  });

  it('still reports measured=true, and filters, when there IS a measurement', () => {
    const r = resolveChannels('pro', REAL);
    expect(r.measured).toBe(true);
    expect(r.channels).not.toContain('whatsapp');
  });
});

describe('no plan is sold on polling speed', () => {
  it('states the mechanism instead of an interval', () => {
    // pollBudget.ts gates 'full' allocator authority on the pricing page no
    // longer selling a polling interval. A sentence with a number in it is the
    // thing that blocks it.
    for (const s of [POLLING_PROMISE, POLLING_PROMISE_SHORT]) {
      expect(s).not.toMatch(/\d+\s*(min|minute|hour|hr)/i);
      expect(s).not.toMatch(/every \d/i);
    }
    expect(POLLING_PROMISE).toMatch(/close to departure/i);
  });

  it('keeps every cadence number out of every plan bullet', () => {
    for (const tier of ['free', 'pro', 'enterprise'] as const) {
      const text = planFeatures(tier, REAL).map(f => f.text).join(' ');
      expect(text).not.toMatch(/\d+\s*-?\s*(minute|min|hour|hr)\b/i);
      expect(text).not.toMatch(/faster than/i);
      expect(text).not.toMatch(/polling/i);
    }
  });

  it('does not describe an upgrade as a speed increase', () => {
    const reasons = upgradeReasons('free', 'pro', REAL).join(' ');
    expect(reasons).not.toMatch(/\d+\s*(min|minute|hour)/i);
    expect(reasons).not.toMatch(/faster|speed|cadence/i);
  });
});

describe('the numbers come from TIER_LIMITS', () => {
  it('moves when the limit moves', () => {
    const free = planFeatures('free', REAL).map(f => f.text).join(' ');
    expect(free).toContain(`${TIER_LIMITS.free.maxRoutes} tracked routes`);
    expect(free).toContain(`${TIER_LIMITS.free.historyDays} days of price history`);
  });

  it('says unlimited rather than printing 9999', () => {
    const ent = planFeatures('enterprise', REAL).map(f => f.text).join(' ');
    expect(ent).toContain('Unlimited tracked routes');
    expect(ent).not.toContain('9999');
  });

  it('turns a year of history into "1 year", not "365 days"', () => {
    const pro = planFeatures('pro', REAL).map(f => f.text).join(' ');
    expect(pro).toContain('1 year of price history');
  });

  it('marks what a plan does NOT have rather than hiding it', () => {
    const free = planFeatures('free', REAL);
    expect(free.find(f => /flexible dates/i.test(f.text))!.included).toBe(false);
    expect(free.find(f => /household/i.test(f.text))!.included).toBe(false);
  });

  it('never marks a feature Free HAS as missing', () => {
    // The bug this catches: the absent-case text used to be the name of a
    // DIFFERENT, included feature ("Alerts when a fare drops under your
    // target"), rendered with a dash. Free got a line telling it that the one
    // thing it definitely does is not included.
    const free = planFeatures('free', REAL);
    const underTarget = free.find(f => /drops under your target/i.test(f.text))!;
    expect(underTarget.included).toBe(true);

    // ...and the thing Free actually lacks is still named, not hidden.
    const anomaly = free.find(f => /unusually cheap/i.test(f.text))!;
    expect(anomaly.included).toBe(false);
  });

  it('names a feature the same way whether or not it is included', () => {
    const name = (tier: 'free' | 'pro') =>
      planFeatures(tier, REAL).find(f => /flexible dates/i.test(f.text))!.text;
    expect(name('free')).toBe(name('pro'));
  });

  it('singularises properly', () => {
    expect(planFeatures('free', REAL)[0].text).toBe('5 tracked routes');
  });
});

describe('the upgrade case', () => {
  it('lists only genuine differences', () => {
    const r = upgradeReasons('free', 'pro', REAL);
    expect(r.some(x => /100 routes instead of 5/.test(x))).toBe(true);
    expect(r.some(x => /SMS and Telegram/.test(x))).toBe(true);
    expect(r.some(x => /Flexible-date/.test(x))).toBe(true);
    expect(r.some(x => /Household sharing/.test(x))).toBe(true);
  });

  it('does not claim a channel the upgrade cannot actually deliver', () => {
    expect(upgradeReasons('free', 'pro', REAL).join(' ')).not.toMatch(/whatsapp/i);
  });

  it('says nothing when a tier adds nothing', () => {
    expect(upgradeReasons('pro', 'pro', REAL)).toEqual([]);
  });

  it('describes Enterprise over Pro without repeating Pro', () => {
    const r = upgradeReasons('pro', 'enterprise', REAL);
    expect(r.some(x => /Unlimited routes/.test(x))).toBe(true);
    expect(r.some(x => /Flexible-date/.test(x))).toBe(false);  // Pro already has it
  });
});
