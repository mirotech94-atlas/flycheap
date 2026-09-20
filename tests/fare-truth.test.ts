import { describe, it, expect } from 'vitest';
import { verifiedAgeLabel } from '@/lib/fareAge';
import {
  judge, BUY_TOLERANCE_PCT, WAIT_THRESHOLD_PCT, HOLD_BAND_PCT,
} from '@/lib/verdictScoring';

describe('verifiedAgeLabel', () => {
  const now = Date.parse('2026-09-20T12:00:00Z');
  const ago = (mins: number) => new Date(now - mins * 60_000).toISOString();

  it('says how old the number is, in the words a reader expects', () => {
    expect(verifiedAgeLabel(ago(0), now)).toBe('Verified just now');
    expect(verifiedAgeLabel(ago(1), now)).toBe('Verified 1 minute ago');
    expect(verifiedAgeLabel(ago(3), now)).toBe('Verified 3 minutes ago');
    expect(verifiedAgeLabel(ago(40), now)).toBe('Verified 40 minutes ago');
    expect(verifiedAgeLabel(ago(60), now)).toBe('Verified 1 hour ago');
    expect(verifiedAgeLabel(ago(300), now)).toBe('Verified 5 hours ago');
    expect(verifiedAgeLabel(ago(60 * 26), now)).toBe('Verified 1 day ago');
  });

  it('reads SQLite datetime strings, which carry no timezone marker', () => {
    // fare_snapshots.polled_at is written by SQLite's datetime('now'), which is
    // UTC but formatted without a Z. Parsing it as local time would report a
    // fresh price as hours old, or vice versa.
    expect(verifiedAgeLabel('2026-09-20 11:57:00', now)).toBe('Verified 3 minutes ago');
  });

  it('returns null rather than inventing an age', () => {
    expect(verifiedAgeLabel(null)).toBeNull();
    expect(verifiedAgeLabel(undefined)).toBeNull();
    expect(verifiedAgeLabel('not a date')).toBeNull();
  });

  it('does not report a future timestamp as negative minutes', () => {
    expect(verifiedAgeLabel(new Date(now + 60_000).toISOString(), now)).toBe('Verified just now');
  });
});

describe('verdict scoring', () => {
  it('counts a buy as right unless the fare then got materially cheaper', () => {
    expect(judge('buy', 500, 500)).toBe(true);
    expect(judge('buy', 500, 495)).toBe(true);            // 1% — inside tolerance
    expect(judge('buy', 500, 500 * (1 - BUY_TOLERANCE_PCT / 100))).toBe(true);
    expect(judge('buy', 500, 430)).toBe(false);           // 14% cheaper later
  });

  it('counts a wait as right only when waiting actually paid', () => {
    expect(judge('wait', 500, 430)).toBe(true);
    expect(judge('wait', 500, 500 * (1 - WAIT_THRESHOLD_PCT / 100))).toBe(true);
    expect(judge('wait', 500, 495)).toBe(false);          // barely moved
    expect(judge('wait', 500, 520)).toBe(false);          // went up — waiting cost money
  });

  it('counts a hold as right only when the price went nowhere either way', () => {
    expect(judge('hold', 500, 490, 510)).toBe(true);
    expect(judge('hold', 500, 400, 510)).toBe(false);     // big drop — missed a buy
    expect(judge('hold', 500, 495, 600)).toBe(false);     // big rise — missed a buy
    expect(judge('hold', 500, 500 * (1 - HOLD_BAND_PCT / 100), 500)).toBe(true);
  });

  it('refuses to score a call it has no evidence for', () => {
    // This is the whole integrity of the published number: a call with no price
    // history inside its horizon is left unscored, never counted as correct.
    expect(judge('buy', 500, null)).toBeNull();
    expect(judge('wait', 500, null)).toBeNull();
    expect(judge('hold', 500, null)).toBeNull();
    expect(judge('buy', 500, NaN)).toBeNull();
  });

  it('does not divide by a zero price', () => {
    expect(judge('buy', 0, 400)).toBeNull();
  });
});
