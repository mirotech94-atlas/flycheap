import { describe, it, expect } from 'vitest';
import { isTpHost, tpMarkerChain } from '@/lib/affiliate';

// The marker is how Travelpayouts attributes a booking to us, and the dotted
// suffixes are how we tell which surface/route/click earned it. These tests
// pin the shape because a silently wrong marker still redirects fine — the
// only symptom is unpaid commission.
describe('isTpHost', () => {
  it('accepts the whole TP family', () => {
    for (const h of ['aviasales.com', 'www.aviasales.com', 'hotellook.com',
                     'search.hotellook.com', 'wayaway.io', 'tpk.lu',
                     'aviasales.tpk.lu']) {
      expect(isTpHost(h), h).toBe(true);
    }
  });

  it('rejects other networks and look-alike suffixes', () => {
    for (const h of ['booking.com', 'trip.com', 'skyscanner.com',
                     'notaviasales.com', 'aviasales.com.evil.test']) {
      expect(isTpHost(h), h).toBe(false);
    }
  });

  it('normalises case and a trailing root dot', () => {
    expect(isTpHost('AviaSales.com')).toBe(true);
    expect(isTpHost('www.aviasales.com.')).toBe(true);
  });
});

describe('tpMarkerChain', () => {
  const base = { host: 'www.aviasales.com', baseMarker: '727998' };

  it('returns the bare marker when nothing rode along', () => {
    expect(tpMarkerChain(base)).toBe('727998');
  });

  it('orders the suffixes post, sub_id, sub_id2, token', () => {
    expect(tpMarkerChain({
      ...base, postMarker: 'post9', subId: 'alert', subId2: 'JFK-CAI', token: 'tok123',
    })).toBe('727998.post9.alert.JFK-CAI.tok123');
  });

  it('skips absent segments rather than leaving empty slots', () => {
    expect(tpMarkerChain({ ...base, subId: 'alert', token: 'tok123' }))
      .toBe('727998.alert.tok123');
  });

  it('is null without a base marker, so no unattributed marker is attached', () => {
    expect(tpMarkerChain({ ...base, baseMarker: undefined, subId: 'alert' })).toBeNull();
    expect(tpMarkerChain({ ...base, baseMarker: '' })).toBeNull();
  });

  it('is null off the TP family — other networks use their own sub-id slots', () => {
    expect(tpMarkerChain({ ...base, host: 'booking.com' })).toBeNull();
  });
});
