import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  contrastSafe,
  hexToRgbTriple,
  relativeLuminance,
} from '../src/lib/brandContrast';

const CABIN = '#0B1220'; // --nc-dark, the ground tenant ink is drawn on
const STOCK = '#F4F2EC'; // --nc-stock, the light document surface

describe('relativeLuminance', () => {
  it('anchors at the WCAG endpoints', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
  });

  it('rejects a malformed hex rather than guessing', () => {
    expect(relativeLuminance('nonsense')).toBeNull();
    expect(relativeLuminance('#fff')).toBeNull(); // shorthand is not accepted
  });
});

describe('contrastRatio', () => {
  it('gives 21:1 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#0a3a6b', CABIN)).toBeCloseTo(
      contrastRatio(CABIN, '#0a3a6b')!,
      6,
    );
  });
});

describe('contrastSafe', () => {
  it('lightens a dark brand on the cabin ground until it clears AA', () => {
    // The white-label DEFAULT, and the case that caused the bug: 1.55:1 raw.
    const raw = contrastRatio('#0a3a6b', CABIN)!;
    expect(raw).toBeLessThan(4.5);

    const safe = contrastSafe('#0a3a6b', CABIN);
    expect(safe).not.toBe('#0a3a6b');
    expect(contrastRatio(safe, CABIN)!).toBeGreaterThanOrEqual(4.5);
  });

  it('leaves a brand that already passes completely untouched', () => {
    // A tenant who picked a legible colour keeps exactly what they picked.
    expect(contrastSafe('#6FB3C9', CABIN)).toBe('#6FB3C9');
    expect(contrastSafe('#ffffff', CABIN)).toBe('#ffffff');
  });

  it('darkens instead of lightening when the ground is light', () => {
    const safe = contrastSafe('#F2C67A', STOCK);
    expect(contrastRatio(safe, STOCK)!).toBeGreaterThanOrEqual(4.5);
    // Moved toward black, not toward white.
    expect(relativeLuminance(safe)!).toBeLessThan(relativeLuminance('#F2C67A')!);
  });

  it('keeps the tenant hue rather than snapping to the fallback', () => {
    const safe = contrastSafe('#7a0f0f', CABIN); // a dark red
    const [r, g, b] = [
      parseInt(safe.slice(1, 3), 16),
      parseInt(safe.slice(3, 5), 16),
      parseInt(safe.slice(5, 7), 16),
    ];
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
    expect(safe).not.toBe('#6FB3C9');
  });

  it('falls back on a malformed hex instead of emitting broken CSS', () => {
    expect(contrastSafe('not-a-colour', CABIN)).toBe('#6FB3C9');
    expect(contrastSafe('', CABIN, { fallback: '#123456' })).toBe('#123456');
  });

  it('honours a stricter minimum', () => {
    const safe = contrastSafe('#0a3a6b', CABIN, { min: 7 });
    expect(contrastRatio(safe, CABIN)!).toBeGreaterThanOrEqual(7);
  });
});

describe('hexToRgbTriple', () => {
  it('splits a hex into channels', () => {
    expect(hexToRgbTriple('#0B1220')).toBe('11,18,32');
  });

  it('falls back to the house blue, not the retired navy', () => {
    expect(hexToRgbTriple('bad')).toBe('26,68,89');
  });
});
