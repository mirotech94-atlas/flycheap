import { describe, it, expect } from 'vitest';
import {
  detectVerdictChange, detectTrendWarning, detectPostBookingDrop, detectWindowClosing,
  windowClosingMessage,
  POST_BOOKING_DROP_MIN_PCT, POST_BOOKING_DROP_MIN_USD, WINDOW_CLOSING_DAYS,
} from '@/lib/alertDetectors';

describe('verdict change', () => {
  it('fires only when wait flips to buy', () => {
    expect(detectVerdictChange({ previous: 'wait', current: 'buy' })).toBe(true);
  });

  it('does not fire on the absence of news', () => {
    // A buy decaying to hold is not something to send a message about.
    expect(detectVerdictChange({ previous: 'buy', current: 'hold' })).toBe(false);
    expect(detectVerdictChange({ previous: 'hold', current: 'buy' })).toBe(false);
    expect(detectVerdictChange({ previous: 'buy', current: 'buy' })).toBe(false);
    expect(detectVerdictChange({ previous: null, current: 'buy' })).toBe(false);
  });
});

describe('trend warning', () => {
  const base = { slopePerDay: 5, currentPrice: 1100, median: 900, threshold: 1000 };

  it('fires when a dear fare is climbing', () => {
    expect(detectTrendWarning(base)).toBe(true);
  });

  it('does not warn about a rise from a cheap base', () => {
    // A fare rising back toward normal after a dip is not a warning — it is a
    // fare returning to normal, and calling it a warning trains people to
    // ignore warnings.
    expect(detectTrendWarning({ ...base, currentPrice: 800 })).toBe(false);
  });

  it('does not warn when it is still below the route’s own normal', () => {
    expect(detectTrendWarning({ ...base, median: 1200 })).toBe(false);
  });

  it('ignores a flat or falling fare', () => {
    expect(detectTrendWarning({ ...base, slopePerDay: 0 })).toBe(false);
    expect(detectTrendWarning({ ...base, slopePerDay: -5 })).toBe(false);
  });
});

describe('post-booking drop', () => {
  it('fires when a booked fare falls meaningfully', () => {
    const r = detectPostBookingDrop({ bookedAmountUsd: 900, currentAmountUsd: 760 });
    expect(r.fires).toBe(true);
    expect(r.savingUsd).toBe(140);
  });

  it('needs BOTH a percentage and a dollar floor', () => {
    // 6% of $90 is $5 — real as a percentage, not worth an interruption.
    expect(detectPostBookingDrop({ bookedAmountUsd: 90, currentAmountUsd: 84 }).fires).toBe(false);
    // $30 off a $3,000 booking is 1% — real money, but noise at that scale.
    expect(detectPostBookingDrop({ bookedAmountUsd: 3000, currentAmountUsd: 2970 }).fires).toBe(false);
  });

  it('fires exactly at both floors, not before', () => {
    const booked = 1000;
    const atFloor = booked * (1 - POST_BOOKING_DROP_MIN_PCT / 100);
    expect(detectPostBookingDrop({ bookedAmountUsd: booked, currentAmountUsd: atFloor }).fires).toBe(true);
    expect(detectPostBookingDrop({ bookedAmountUsd: booked, currentAmountUsd: atFloor + 1 }).fires).toBe(false);
    expect(POST_BOOKING_DROP_MIN_USD).toBeGreaterThan(0);
  });

  it('never fires once they have flown', () => {
    // The rebooking window is the entire reason this is urgent; after
    // departure the message is just salt.
    expect(detectPostBookingDrop({
      bookedAmountUsd: 900, currentAmountUsd: 700, departed: true,
    }).fires).toBe(false);
  });

  it('does nothing without a recorded booking amount', () => {
    expect(detectPostBookingDrop({ bookedAmountUsd: null, currentAmountUsd: 700 }).fires).toBe(false);
    expect(detectPostBookingDrop({ bookedAmountUsd: 0, currentAmountUsd: 700 }).fires).toBe(false);
  });

  it('does not fire when the price went UP', () => {
    expect(detectPostBookingDrop({ bookedAmountUsd: 700, currentAmountUsd: 900 }).fires).toBe(false);
  });
});

describe('window closing', () => {
  const base = { daysToDeparture: WINDOW_CLOSING_DAYS, booked: false, slopePerDay: 1, alreadySent: false };

  it('fires seven days out on a flat-or-rising fare', () => {
    expect(detectWindowClosing(base)).toBe(true);
    expect(detectWindowClosing({ ...base, slopePerDay: 0 })).toBe(true);
  });

  it('stays quiet while the fare is still falling', () => {
    // A fare still trending down is one where waiting is STILL the right call.
    // Telling someone to hurry would be exactly the advice this alert exists to
    // avoid giving.
    expect(detectWindowClosing({ ...base, slopePerDay: -3 })).toBe(false);
  });

  it('never fires for a booked trip', () => {
    expect(detectWindowClosing({ ...base, booked: true })).toBe(false);
  });

  it('fires once, ever', () => {
    expect(detectWindowClosing({ ...base, alreadySent: true })).toBe(false);
  });

  it('does not fire too early or after departure', () => {
    expect(detectWindowClosing({ ...base, daysToDeparture: WINDOW_CLOSING_DAYS + 1 })).toBe(false);
    expect(detectWindowClosing({ ...base, daysToDeparture: -1 })).toBe(false);
    expect(detectWindowClosing({ ...base, daysToDeparture: null })).toBe(false);
  });

  it('says what it knows instead of manufacturing urgency', () => {
    // Manufactured scarcity is what makes fare tools untrustworthy. The message
    // states the position and leaves the decision with the user.
    const msg = windowClosingMessage({
      route: 'JFK → CAI', daysToDeparture: 7, currentPrice: 980, median: 900,
    });
    expect(msg).toContain('7 days');
    expect(msg).toContain('$980');
    expect(msg).toContain('$900');
    expect(msg).toMatch(/not expecting it to improve/i);
    expect(msg).not.toMatch(/hurry|act now|last chance|don't miss/i);
  });
});
