import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  contrastSafe,
  hexToRgbTriple,
  pickCtaInk,
  relativeLuminance,
} from '../src/lib/brandContrast';

const CABIN = '#0E1113'; // editorial --bg (dark), one of the two grounds tenant ink is drawn on
const STOCK = '#FBFAF7'; // editorial --bg (light), the other ground

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

describe('pickCtaInk', () => {
  const PANEL_FG = '#FFFFFF'; // --panel-fg, identical in both themes

  it('picks the fixed-white panel ink for a dark brand on either ground (2.11b round 2 regression)', () => {
    // The white-label default. In dark, ground (CABIN) itself only measures
    // 1.82:1 against this brand — the bug this test guards against is
    // picking that ground as the label ink just because it was the second
    // argument, instead of actually comparing the two candidates.
    expect(pickCtaInk('#1A4459', PANEL_FG, STOCK)).toBe(PANEL_FG);
    expect(pickCtaInk('#1A4459', PANEL_FG, CABIN)).toBe(PANEL_FG);
    expect(contrastRatio(PANEL_FG, '#1A4459')!).toBeGreaterThanOrEqual(4.5);
  });

  it('picks the ground candidate instead when the brand itself is light', () => {
    // A pale preset: white panel ink barely contrasts with it (~1.1:1), but
    // the dark ground clears AA easily — the function must be a real
    // contrast comparison, not a "always prefer panelFg" shortcut.
    const paleBrand = '#faf3dc';
    expect(contrastRatio(PANEL_FG, paleBrand)!).toBeLessThan(4.5);
    expect(pickCtaInk(paleBrand, PANEL_FG, CABIN)).toBe(CABIN);
  });

  it('never defaults to a missing candidate\'s partner just because it is the only one present', () => {
    // Round 2 root cause: `panelFg && pick : ground` falls through to
    // `ground` whenever panelFg reads back null/empty, even when ground is
    // the one failing contrast. The fixed function instead requires the
    // sole remaining candidate to independently clear `min`.
    const onAccent = 'var(--on-accent)';
    const paleBrand = '#faf3dc';

    // panelFg missing, the dark ground genuinely clears AA against a pale
    // brand -> using it is correct, not an accident.
    expect(contrastRatio(CABIN, paleBrand)!).toBeGreaterThanOrEqual(4.5);
    expect(pickCtaInk(paleBrand, null, CABIN, onAccent)).toBe(CABIN);

    // panelFg missing, and ground ALSO fails against this dark-on-dark
    // pairing (this is the exact bug: ground was being used anyway) ->
    // falls to onAccent instead.
    expect(contrastRatio(CABIN, '#1A4459')!).toBeLessThan(4.5);
    expect(pickCtaInk('#1A4459', null, CABIN, onAccent)).toBe(onAccent);

    // Symmetric case: panelFg present but ground missing.
    expect(pickCtaInk('#1A4459', PANEL_FG, null, onAccent)).toBe(PANEL_FG);
    expect(pickCtaInk(paleBrand, PANEL_FG, null, onAccent)).toBe(onAccent);

    // Neither candidate available at all.
    expect(pickCtaInk('#1A4459', null, null, onAccent)).toBe(onAccent);
    expect(pickCtaInk('#1A4459', '', '', onAccent)).toBe(onAccent);
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
