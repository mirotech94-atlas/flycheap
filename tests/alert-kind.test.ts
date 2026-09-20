import { describe, it, expect } from 'vitest';
import {
  classifyAlert, needsPriorityVerification, needsMistakeFareWarning,
  MISTAKE_FARE_TARGET_RATIO, MISTAKE_FARE_PCT_BELOW_NORMAL, ANOMALY_Z,
} from '@/lib/alertKind';

describe('classifyAlert', () => {
  it('calls an ordinary below-target fare a threshold alert', () => {
    expect(classifyAlert({
      branch: 'threshold', pricePerAdult: 850, thresholdPerAdult: 900,
    })).toBe('threshold');
  });

  it('keeps a price-drop branch as price-drop when it is not deep enough to be a mistake fare', () => {
    // This is the case the poller was recording as 'threshold', which made
    // "commission per alert type" unanswerable.
    expect(classifyAlert({
      branch: 'price-drop', pricePerAdult: 800, thresholdPerAdult: 900, pctBelowNormal: 12,
    })).toBe('price-drop');
  });

  it('calls a fare well under target a mistake fare, whichever branch found it', () => {
    const deep = 900 * MISTAKE_FARE_TARGET_RATIO - 1;
    expect(classifyAlert({ branch: 'threshold', pricePerAdult: deep, thresholdPerAdult: 900 }))
      .toBe('mistake-fare');
    expect(classifyAlert({ branch: 'price-drop', pricePerAdult: deep, thresholdPerAdult: 900 }))
      .toBe('mistake-fare');
  });

  it('calls a fare far under the route normal a mistake fare even when the target is generous', () => {
    expect(classifyAlert({
      branch: 'price-drop', pricePerAdult: 880, thresholdPerAdult: 2000,
      pctBelowNormal: MISTAKE_FARE_PCT_BELOW_NORMAL,
    })).toBe('mistake-fare');
  });

  it('separates a statistical anomaly from a mistake fare', () => {
    // A 3σ move that isn't cheap enough to clear the mistake-fare bar is still
    // worth polling harder and reporting on its own.
    expect(classifyAlert({
      branch: 'threshold', pricePerAdult: 880, thresholdPerAdult: 900,
      pctBelowNormal: 5, zScore: -ANOMALY_Z,
    })).toBe('anomaly');
  });

  it('ranks mistake-fare above anomaly when both apply', () => {
    expect(classifyAlert({
      branch: 'threshold', pricePerAdult: 300, thresholdPerAdult: 900, zScore: -6,
    })).toBe('mistake-fare');
  });

  it('does not treat a missing normal or z-score as evidence', () => {
    expect(classifyAlert({
      branch: 'threshold', pricePerAdult: 850, thresholdPerAdult: 900,
      pctBelowNormal: null, zScore: null,
    })).toBe('threshold');
  });

  it('does not divide by a zero target', () => {
    expect(classifyAlert({ branch: 'threshold', pricePerAdult: 100, thresholdPerAdult: 0 }))
      .toBe('threshold');
  });
});

describe('handling rules that follow from the kind', () => {
  it('sends mistake fares and anomalies down the expensive verification path', () => {
    expect(needsPriorityVerification('mistake-fare')).toBe(true);
    expect(needsPriorityVerification('anomaly')).toBe(true);
    expect(needsPriorityVerification('threshold')).toBe(false);
    expect(needsPriorityVerification('price-drop')).toBe(false);
  });

  it('warns only on mistake fares', () => {
    // The warning is the difference between a voided glitch fare being a
    // support problem and a reputational one.
    expect(needsMistakeFareWarning('mistake-fare')).toBe(true);
    expect(needsMistakeFareWarning('anomaly')).toBe(false);
    expect(needsMistakeFareWarning('threshold')).toBe(false);
  });
});
