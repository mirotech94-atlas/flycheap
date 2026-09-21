import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Constraint #4: border-radius 0 everywhere (status dots, range thumb, toggle
 * knob excepted), no shadows, no gradients. Enforced on the editorial
 * stylesheet, which is where every new rule lives.
 */
const css = readFileSync('src/app/editorial.css', 'utf8');

// Strip comments so a documented exception can't be mistaken for a violation.
const code = css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('editorial.css obeys the geometry constraints', () => {
  it('has no non-zero border-radius except the three sanctioned exceptions', () => {
    const hits = [...code.matchAll(/border-radius\s*:\s*([^;]+);/g)]
      .map(m => m[1].trim())
      .filter(v => v !== '0' && v !== '0px');
    // Sanctioned: status dots (.ed-dot), range thumb (::-webkit-slider-thumb / ::-moz-range-thumb), toggle knob (.ed-knob).
    const sanctioned = [...code.matchAll(/(\.ed-dot|slider-thumb|range-thumb|\.ed-knob)[^{]*\{[^}]*border-radius\s*:\s*([^;]+);/g)].map(m => m[2].trim());
    const unsanctioned = hits.filter(h => !sanctioned.includes(h));
    expect(unsanctioned).toEqual([]);
  });

  it('has no box-shadow or text-shadow', () => {
    expect(code.match(/(box|text)-shadow\s*:/g) || []).toEqual([]);
  });

  it('has no gradient', () => {
    expect(code.match(/(linear|radial|conic)-gradient\(/g) || []).toEqual([]);
  });

  it('has no hex literal — every colour is a token or color-mix of tokens', () => {
    expect(code.match(/#[0-9a-fA-F]{3,8}\b/g) || []).toEqual([]);
  });
});
