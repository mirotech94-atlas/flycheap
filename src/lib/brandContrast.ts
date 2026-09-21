/**
 * Contrast-safe variants of a white-label tenant's brand colour.
 *
 * The problem this replaces: the tenant's raw hex was used directly as INK
 * (`.text-brand-700`, `.text-brand-600`, `.text-brand`). On the cabin ground
 * a dark brand — including the house default — measured 1.55:1, i.e. invisible.
 * The stopgap was a blanket override that painted every one of those teal,
 * which fixed legibility by throwing the tenant's branding away entirely.
 *
 * Instead: keep the tenant's HUE, and move only its lightness until it clears
 * WCAG AA against the ground it is actually drawn on. A navy brand becomes a
 * lighter navy on dark — recognisably still theirs, and readable.
 *
 * Backgrounds are deliberately NOT derived. A brand-coloured surface already
 * picks its own ink to contrast, so shifting it would change the design rather
 * than rescue it.
 */

// Accepts 3/4-digit shorthand (#fff, #abcd) alongside the full 6/8-digit
// forms. Round 3 of task 2.11b: Lightning CSS (Turbopack's production CSS
// minifier) folds `#FFFFFF` down to `#fff` in the served bundle, so a
// 6-digit-only parser silently rejects every live read of a token that was
// spelled in full in the source — `relativeLuminance` returned null,
// `pickCtaInk` discarded the white candidate, and the ground candidate won
// (or lost) by whatever it happened to be, not by an actual contrast check.
// Verify against the LIVE bundle when touching this, not the source CSS —
// see docs/design's contrast-audit notes.
const HEX = /^#?([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i;

/**
 * Normalize any accepted hex spelling to a plain 6-digit `#rrggbb`:
 * expands 3/4-digit shorthand by doubling each nibble, then drops alpha
 * (the last 2 of an 8-digit value) — this module works in opaque sRGB only.
 * Returns null for anything `HEX` doesn't match, including genuinely
 * malformed input like `#12` or `#12345` (neither length is accepted).
 */
function normalizeHex(hex: string): string | null {
  const m = HEX.exec(hex.trim());
  if (!m) return null;
  let digits = m[1];
  if (digits.length === 3 || digits.length === 4) {
    digits = digits.split('').map((d) => d + d).join('');
  }
  return `#${digits.slice(0, 6).toLowerCase()}`;
}

/**
 * The two grounds tenant ink is derived against — the editorial system's
 * `--bg` in each theme (`src/app/editorial.css`). A tenant's brand colour is
 * never drawn as ink directly; it is always checked against whichever of
 * these the page is actually sitting on, via `contrastSafe`.
 */
export const BRAND_GROUNDS = {
  light: '#FBFAF7',
  dark: '#0E1113',
} as const;

/** sRGB relative luminance, per WCAG 2.1. */
export function relativeLuminance(hex: string): number | null {
  const norm = normalizeHex(hex);
  if (!norm) return null;
  const n = parseInt(norm.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** WCAG contrast ratio between two hex colours. Returns null on bad input. */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function toRgb(hex: string): [number, number, number] | null {
  const norm = normalizeHex(hex);
  if (!norm) return null;
  const n = parseInt(norm.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  const c = (v: number) => Math.min(255, Math.max(0, Math.round(v)));
  return `#${((1 << 24) + (c(r) << 16) + (c(g) << 8) + c(b)).toString(16).slice(1)}`;
}

/**
 * Mix `hex` toward white (t > 0) or black (t < 0) by |t| in 0..1.
 * Channel-wise mixing preserves hue far better than adding a flat offset the
 * way `shadeColor` does, which desaturates and can clip one channel first.
 */
function mix(hex: string, t: number): string {
  const rgb = toRgb(hex);
  if (!rgb) return hex;
  const target = t >= 0 ? 255 : 0;
  const k = Math.abs(t);
  return toHex(rgb.map((v) => v + (target - v) * k) as [number, number, number]);
}

/**
 * Return a variant of `brand` that clears `min` contrast against `ground`,
 * keeping its hue. Walks toward white on a dark ground and toward black on a
 * light one, in small steps, and returns the first step that passes.
 *
 * If the brand already passes it is returned UNCHANGED — a tenant who picked a
 * legible colour keeps exactly the colour they picked.
 *
 * Falls back to `fallback` when the hex is malformed, or when even full
 * white/black cannot reach `min` (possible only for an absurd ground).
 */
export function contrastSafe(
  brand: string,
  ground: string,
  { min = 4.5, fallback = '#6FB3C9' }: { min?: number; fallback?: string } = {},
): string {
  const current = contrastRatio(brand, ground);
  if (current === null) return fallback;
  if (current >= min) return brand;

  const groundL = relativeLuminance(ground);
  if (groundL === null) return fallback;
  // Lighten on a dark ground, darken on a light one.
  const dir = groundL < 0.5 ? 1 : -1;

  for (let step = 1; step <= 20; step++) {
    const candidate = mix(brand, dir * (step / 20));
    const ratio = contrastRatio(candidate, ground);
    if (ratio !== null && ratio >= min) return candidate;
  }
  return fallback;
}

/** `r,g,b` triple for CSS `rgb()` / alpha composition. */
export function hexToRgbTriple(hex: string, fallback = '26,68,89'): string {
  const rgb = toRgb(hex);
  return rgb ? rgb.join(',') : fallback;
}

/**
 * Pick whichever of two candidate inks reads better as a LABEL painted ON a
 * brand-coloured FILL (not on a page ground — a caller previewing a
 * brand-filled button, for instance, has a light candidate like the fixed
 * `--panel-fg` white and a dark candidate like the current theme's `--bg`,
 * and needs to know which one is actually legible against that specific
 * fill colour).
 *
 * Deliberately does not fall back to whichever candidate happens to be
 * non-null: a candidate that failed to load (an empty token read, typically)
 * is untrustworthy and is only used if it *independently* clears `min`
 * against `brand` — otherwise the caller gets `onAccent`, a token meant to
 * always be legible regardless of what did or didn't load. This is the
 * WhiteLabelSettings preview bug from task 2.11b round 2: a `candidate &&
 * pickHigherRatio : otherCandidate` ternary silently used the other
 * candidate whenever the first read as null, which is exactly wrong when
 * that other candidate is the thing failing AA.
 */
export function pickCtaInk(
  brand: string,
  panelFg: string | null,
  ground: string | null,
  onAccent = '#FFFFFF',
  min = 4.5,
): string {
  const rPanelFg = panelFg ? contrastRatio(panelFg, brand) : null;
  const rGround = ground ? contrastRatio(ground, brand) : null;

  if (rPanelFg !== null && rGround !== null) {
    return rPanelFg >= rGround ? panelFg! : ground!;
  }
  if (rPanelFg !== null) return rPanelFg >= min ? panelFg! : onAccent;
  if (rGround !== null) return rGround >= min ? ground! : onAccent;
  return onAccent;
}
