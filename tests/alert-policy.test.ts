import { describe, it, expect } from 'vitest';
import {
  decideAlert, inQuietHours, localHourFor,
  DEFAULT_DAILY_CAP, type AlertPolicyInput,
} from '@/lib/alertPolicy';
import { urgencyFor, exemptFromFrequencyCap, mayBreakQuietHours } from '@/lib/alertKind';

/**
 * Every rule here exists because breaking it costs more than the alert is worth.
 * An alert that wakes someone at 3am for a trend warning does not just annoy
 * them — it teaches them to mute the channel the $400 mistake fare arrives on
 * tomorrow. So these tests are mostly about what must NOT be sent.
 */

const base = (over: Partial<AlertPolicyInput> = {}): AlertPolicyInput => ({
  kind: 'threshold',
  availableChannels: ['email', 'sms'],
  localHour: 14,
  sentToday: 0,
  instantEnabled: true,
  ...over,
});

describe('urgency comes from the alert type', () => {
  it('matches the spec’s table', () => {
    expect(urgencyFor('mistake-fare')).toBe('immediate');
    expect(urgencyFor('threshold')).toBe('immediate');
    expect(urgencyFor('post-booking-drop')).toBe('immediate');
    expect(urgencyFor('anomaly')).toBe('batchable');
    expect(urgencyFor('trend-warning')).toBe('digest');
    expect(urgencyFor('window-closing')).toBe('once');
  });

  it('makes a verdict change urgent only close to departure', () => {
    // "Digest unless close to departure." A wait that flips to buy three days
    // before you fly is not a digest item.
    expect(urgencyFor('verdict-change')).toBe('digest');
    expect(urgencyFor('verdict-change', { closeToDeparture: true })).toBe('immediate');
  });
});

describe('quiet hours', () => {
  const NIGHT = { startHour: 22, endHour: 8 };

  it('applies NO quiet hours when it is given no window', () => {
    // The regression this protects against: inQuietHours used to fall back to
    // the 22:00-08:00 default when given nothing. Since almost no account has
    // quiet hours configured — and most have no stored timezone, so "local"
    // really meant UTC — that silently held every alert overnight, and for a US
    // user from 6pm. Silent alert suppression is the failure this codebase has
    // already been bitten by three times.
    for (const h of [0, 3, 6, 14, 23]) {
      expect(inQuietHours(h, null)).toBe(false);
      expect(inQuietHours(h)).toBe(false);
    }
  });

  it('handles a window that wraps midnight', () => {
    expect(inQuietHours(23, NIGHT)).toBe(true);
    expect(inQuietHours(3, NIGHT)).toBe(true);
    expect(inQuietHours(14, NIGHT)).toBe(false);
    expect(inQuietHours(8, NIGHT)).toBe(false);   // end is exclusive
  });

  it('handles a window that does not wrap', () => {
    const q = { startHour: 1, endHour: 6 };
    expect(inQuietHours(3, q)).toBe(true);
    expect(inQuietHours(23, q)).toBe(false);
  });

  it('holds an ordinary alert during quiet hours', () => {
    const d = decideAlert(base({ localHour: 3, quietHours: NIGHT }));
    expect(d.send).toBe(false);
    expect(d.send === false && d.defer).toBe('quiet-hours');
  });

  it('wakes someone for a mistake fare ONLY if they opted in', () => {
    // "A glitch fare at 3am is exactly the case where waking someone is
    // correct, but only if they agreed to it."
    const optedOut = decideAlert(base({ kind: 'mistake-fare', localHour: 3, quietHours: NIGHT }));
    expect(optedOut.send).toBe(false);

    const optedIn = decideAlert(base({
      kind: 'mistake-fare', localHour: 3, quietHours: NIGHT, wakeMeForMistakeFares: true,
    }));
    expect(optedIn.send).toBe(true);
  });

  it('never breaks quiet hours for anything but a mistake fare', () => {
    for (const kind of ['threshold', 'post-booking-drop', 'anomaly'] as const) {
      expect(mayBreakQuietHours(kind, true)).toBe(false);
      expect(decideAlert(base({ kind, localHour: 3, quietHours: NIGHT, wakeMeForMistakeFares: true })).send).toBe(false);
    }
  });

  it('reads the hour in the user’s timezone, not the server’s', () => {
    // 06:00 UTC is 02:00 in New York — quiet there, awake in Tokyo.
    const at6amUtc = Date.parse('2026-09-20T06:00:00Z');
    expect(localHourFor('America/New_York', at6amUtc)).toBe(2);
    expect(localHourFor('Asia/Tokyo', at6amUtc)).toBe(15);
  });

  it('does not throw on an unknown timezone inside the send path', () => {
    expect(() => localHourFor('Mars/Olympus_Mons')).not.toThrow();
  });
});

describe('the frequency cap', () => {
  it('stops an ordinary alert once the cap is reached', () => {
    const d = decideAlert(base({ sentToday: DEFAULT_DAILY_CAP }));
    expect(d.send).toBe(false);
    expect(d.send === false && d.defer).toBe('digest');
  });

  it('NEVER applies to a mistake fare', () => {
    // A cap that silently swallowed the one alert worth $400 would be the most
    // expensive setting in the product.
    expect(exemptFromFrequencyCap('mistake-fare')).toBe(true);
    const d = decideAlert(base({ kind: 'mistake-fare', sentToday: 99 }));
    expect(d.send).toBe(true);
  });

  it('applies to everything else, including the strong new types', () => {
    for (const kind of ['threshold', 'post-booking-drop', 'anomaly'] as const) {
      expect(decideAlert(base({ kind, sentToday: DEFAULT_DAILY_CAP })).send).toBe(false);
    }
  });
});

describe('digest as the default for new users', () => {
  it('holds instant alerts until the user escalates themselves', () => {
    // "Let people escalate themselves to instant rather than starting them
    // there and losing them to fatigue."
    const d = decideAlert(base({ instantEnabled: false }));
    expect(d.send).toBe(false);
    expect(d.send === false && d.defer).toBe('digest');
  });

  it('still sends a once-only window-closing alert', () => {
    // Window-closing prevents the worst outcome in the product: a user who
    // waited on our advice and paid more. It is not a digest item.
    const d = decideAlert(base({ kind: 'window-closing', instantEnabled: false }));
    expect(d.send).toBe(true);
  });
});

describe('per-watch channel override', () => {
  it('lets one watch be louder than the account default', () => {
    // "The home route to see family gets SMS; the speculative Tokyo budget
    // watch gets digest."
    const d = decideAlert(base({
      availableChannels: ['email', 'sms', 'telegram'],
      watchChannels: ['sms'],
    }));
    expect(d.send && d.channels).toEqual(['sms']);
  });

  it('cannot conjure a channel the user has not set up', () => {
    const d = decideAlert(base({
      availableChannels: ['email'],
      watchChannels: ['sms', 'whatsapp'],
    }));
    expect(d.send).toBe(false);
    expect(d.send === false && d.reason).toMatch(/no channel/i);
  });

  it('falls back to the account channels when the watch sets none', () => {
    const d = decideAlert(base({ availableChannels: ['email', 'telegram'], watchChannels: null }));
    expect(d.send && d.channels).toEqual(['email', 'telegram']);
  });
});

describe('what a digest-only type can never do', () => {
  it('holds a trend warning even for a user with every channel and no cap used', () => {
    // "Fare rising and the model expects it to keep rising — digest only."
    // There is no configuration in which this interrupts someone.
    const d = decideAlert(base({
      kind: 'trend-warning',
      availableChannels: ['email', 'sms', 'whatsapp', 'telegram', 'push'],
      localHour: 14, sentToday: 0, wakeMeForMistakeFares: true,
    }));
    expect(d.send).toBe(false);
    expect(d.send === false && d.defer).toBe('digest');
  });
});
