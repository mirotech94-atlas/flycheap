import { describe, it, expect } from 'vitest';
import {
  probeStaleProvider, probeDeadFareRate, probeCostSpike,
  probeCommissionQuiet, probeAlertDeliveryFailures, probeDeliverySilence,
  STALE_PROVIDER_MINUTES, COST_SPIKE_MULTIPLE, COMMISSION_QUIET_DAYS,
} from '@/lib/ops/monetizationProbes';

/**
 * These alarms exist to page someone. The thing that makes an alarm useless is
 * not missing a real failure — it is firing on a non-failure until people stop
 * reading it. So each probe is tested from both sides: it fires on the
 * condition, and it stays quiet on the situations that merely resemble it.
 */

describe('stale provider', () => {
  const stuck = { provider: 'serpapi', distinct_prices: 1, samples: 12, span_minutes: 90 };

  it('fires on a provider frozen on one price for over an hour', () => {
    const f = probeStaleProvider([stuck]);
    expect(f).toHaveLength(1);
    expect(f[0].fingerprint).toBe('monetization:stale-provider:serpapi');
    expect(f[0].title).toContain('serpapi');
  });

  it('stays quiet when the provider is simply quoting a moving price', () => {
    expect(probeStaleProvider([{ ...stuck, distinct_prices: 6 }])).toEqual([]);
  });

  it('stays quiet on too few samples — a slow route is not a stuck provider', () => {
    expect(probeStaleProvider([{ ...stuck, samples: 2 }])).toEqual([]);
  });

  it('stays quiet before the window has elapsed', () => {
    expect(probeStaleProvider([{ ...stuck, span_minutes: STALE_PROVIDER_MINUTES - 1 }])).toEqual([]);
  });

  it('reports each stuck provider separately, so one bad one is not masked', () => {
    const f = probeStaleProvider([stuck, { ...stuck, provider: 'kiwi' }]);
    expect(f.map(x => x.fingerprint).sort()).toEqual([
      'monetization:stale-provider:kiwi', 'monetization:stale-provider:serpapi',
    ]);
  });
});

describe('dead-fare rate', () => {
  it('fires when suppression is running well above target', () => {
    const f = probeDeadFareRate({ suppressed: 30, considered: 100 });
    expect(f).toHaveLength(1);
    expect(f[0].title).toContain('30.0%');
  });

  it('stays quiet at a healthy rate', () => {
    expect(probeDeadFareRate({ suppressed: 1, considered: 100 })).toEqual([]);
  });

  it('stays quiet on a sample too small to mean anything', () => {
    // 1 of 2 is 50%, but it is also just two alerts.
    expect(probeDeadFareRate({ suppressed: 1, considered: 2 })).toEqual([]);
  });

  it('stays quiet with no data at all', () => {
    expect(probeDeadFareRate(null)).toEqual([]);
  });
});

describe('poll cost spike', () => {
  it('fires when today runs far above the trailing average', () => {
    const f = probeCostSpike(30, 5);
    expect(f).toHaveLength(1);
    expect(f[0].title).toContain('$30.00');
  });

  it('stays quiet on ordinary variation', () => {
    expect(probeCostSpike(7, 5)).toEqual([]);
  });

  it('does not treat a near-zero baseline as an infinite spike', () => {
    // The dangerous false positive: any spend at all is infinity times zero.
    expect(probeCostSpike(2, 0)).toEqual([]);
    expect(probeCostSpike(2, 0.01)).toEqual([]);
  });

  it('does not page anyone over pennies', () => {
    expect(probeCostSpike(0.5, 0.6)).toEqual([]);
  });

  it('fires exactly at the multiple, not before it', () => {
    expect(probeCostSpike(5 * COST_SPIKE_MULTIPLE, 5)).toHaveLength(1);
    expect(probeCostSpike(5 * COST_SPIKE_MULTIPLE - 0.01, 5)).toEqual([]);
  });
});

describe('commission reporting gone quiet', () => {
  it('fires when clicks continue but no commission has landed', () => {
    const f = probeCommissionQuiet(COMMISSION_QUIET_DAYS + 1, true);
    expect(f).toHaveLength(1);
    expect(f[0].fingerprint).toBe('monetization:commission-quiet');
  });

  it('stays quiet when there are no clicks — silence is then correct', () => {
    // No click-outs means no commissions are DUE. Paging here would train the
    // operator to ignore this alarm during a quiet week.
    expect(probeCommissionQuiet(30, false)).toEqual([]);
  });

  it('tolerates the normal settlement lag', () => {
    expect(probeCommissionQuiet(COMMISSION_QUIET_DAYS - 1, true)).toEqual([]);
  });

  it('stays quiet when nothing has ever settled', () => {
    // A brand-new install has no baseline; this is not a regression.
    expect(probeCommissionQuiet(null, true)).toEqual([]);
  });
});

describe('alert delivery failures', () => {
  it('fires when a meaningful share of a batch reached nobody', () => {
    const f = probeAlertDeliveryFailures({ attempted: 20, failed: 8 });
    expect(f).toHaveLength(1);
    expect(f[0].title).toContain('40%');
  });

  it('stays quiet on an isolated failure', () => {
    expect(probeAlertDeliveryFailures({ attempted: 100, failed: 2 })).toEqual([]);
  });

  it('stays quiet on a batch too small to judge', () => {
    expect(probeAlertDeliveryFailures({ attempted: 2, failed: 1 })).toEqual([]);
  });
});

describe('alarm hygiene', () => {
  it('gives every alarm a stable, namespaced fingerprint', () => {
    // Fingerprints are how the detector dedupes and resolves incidents; an
    // unstable one would re-page on every tick.
    const all = [
      ...probeStaleProvider([{ provider: 'serpapi', distinct_prices: 1, samples: 12, span_minutes: 90 }]),
      ...probeDeadFareRate({ suppressed: 30, considered: 100 }),
      ...probeCostSpike(30, 5),
      ...probeCommissionQuiet(10, true),
      ...probeAlertDeliveryFailures({ attempted: 20, failed: 8 }),
    ];
    expect(all).toHaveLength(5);
    for (const f of all) {
      expect(f.fingerprint.startsWith('monetization:')).toBe(true);
      // Every alarm has to say what to do about it, not just that it happened.
      expect(f.detail.length).toBeGreaterThan(60);
    }
    expect(new Set(all.map(f => f.fingerprint)).size).toBe(5);
  });
});

describe('delivery silence — the blind spot in the failure probe', () => {
  /**
   * probeAlertDeliveryFailures counts FAILURES. A dead webhook feed produces
   * none, so the failure rate reads 0% forever and the probe stays green for
   * the exact condition its own detail text names. This one fires on the
   * absence instead. It is what would have caught RESEND_WEBHOOK_SECRET being
   * unset in production, where 5 alerts went out in a week and email_events
   * stayed at zero rows.
   */
  it('fires when mail went out and the feed recorded nothing', () => {
    const f = probeDeliverySilence({ sentInWindow: 12, eventsInWindow: 0, windowHours: 24 });
    expect(f).toHaveLength(1);
    expect(f[0].fingerprint).toBe('monetization:delivery-silence');
    expect(f[0].title).toContain('12 emails sent');
    expect(f[0].detail).toContain('RESEND_WEBHOOK_SECRET');
  });

  it('stays quiet below the floor — nothing to expect an echo from yet', () => {
    expect(probeDeliverySilence({ sentInWindow: 4, eventsInWindow: 0, windowHours: 24 })).toEqual([]);
    expect(probeDeliverySilence({ sentInWindow: 0, eventsInWindow: 0, windowHours: 24 })).toEqual([]);
  });

  it('stays quiet the moment even one event arrives', () => {
    expect(probeDeliverySilence({ sentInWindow: 50, eventsInWindow: 1, windowHours: 24 })).toEqual([]);
  });

  it('is unopinionated about a missing measurement', () => {
    expect(probeDeliverySilence(null)).toEqual([]);
  });

  it('is the complement of the failure probe, not a duplicate', () => {
    // Same window, same sends: failures fire on a bad batch, silence on a
    // dead feed. Both quiet on a healthy day; neither fires on the other's case.
    const healthy = { sentInWindow: 50, eventsInWindow: 48, windowHours: 24 };
    expect(probeDeliverySilence(healthy)).toEqual([]);
    expect(probeAlertDeliveryFailures({ attempted: 50, failed: 2 })).toEqual([]);
    expect(probeAlertDeliveryFailures({ attempted: 50, failed: 0 })).toEqual([]);   // dead feed looks like this
    expect(probeDeliverySilence({ sentInWindow: 50, eventsInWindow: 0, windowHours: 24 })).toHaveLength(1);
  });
});
