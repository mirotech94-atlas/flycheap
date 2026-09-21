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

  it('has no hex literal outside the two token-definition blocks', () => {
    const withoutDefs = code
      .replace(/:root\s*\{[^}]*\}/g, '')
      .replace(/html\[data-theme="dark"\]\s*\{[^}]*\}/g, '');
    expect(withoutDefs.match(/#[0-9a-fA-F]{3,8}\b/g) || []).toEqual([]);
  });

  it('has no rgb()/rgba()/hsl()/hsla() literal — colours are tokens or color-mix of tokens', () => {
    expect(code.match(/\b(rgba?|hsla?)\(/g) || []).toEqual([]);
  });
});

/**
 * Task 3.9: the night-cabin THEME GATE (the [data-fc-theme] attribute, the
 * .fc-landing welcome-page scoping, and the --nc-* migration aliases) is
 * deleted from globals.css, not just unused. A regression here means the
 * retired machinery crept back in rather than every surface staying on
 * editorial tokens directly.
 *
 * .fc-shell itself is NOT part of this guard: fix round 1 restored it
 * (unscoped, attribute-free) on the dashboard wrapper, because the
 * .fc-shell[data-fc-theme="cabin"] rules it used to gate were live
 * overrides for the dashboard's .fc-* widgets, not dead theme machinery —
 * deleting them regressed contrast on /. See the "Dashboard cabin
 * overrides — restored" block in globals.css.
 */
describe('globals.css has no night-cabin theme machinery', () => {
  const globalsCss = readFileSync('src/app/globals.css', 'utf8');

  it('has no data-fc-theme, fc-landing, or --nc- occurrence', () => {
    expect(globalsCss.match(/data-fc-theme|fc-landing|--nc-/g) || []).toEqual([]);
  });
});
