/* ============================================================
   Area chart — the admin "feature block" (README §Feature-block
   catalogue: Economics, Revenue). Geometry: 600×190 viewBox, fill
   accent @12%, 2px accent line, dashed amber comparison/forecast,
   mono axis labels drawn from the data's own x values, thinned to
   at most 12 ticks (never more ticks than the README's "12 month
   ticks" baseline, however many points the caller actually has).

   Data only: takes the plain arrays the caller's page loader already
   produced. No fetch, no fabricated points — `points.length` decides
   how many ticks exist; `compare`/`secondary` render only when the
   caller passes them, and are never synthesized here. A real per-x
   series and a flat reference line (the same y repeated for every x)
   are both just arrays of the same shape — the caller decides which
   one it has.
   ============================================================ */

/**
 * Pick at most `maxTicks` point indices to label, always including the
 * first and last point. Exported so the ≤N-tick guarantee is unit-testable
 * without rendering the SVG — `i % tickEvery === 0` plus forced endpoints
 * can overshoot the cap (a forced last index that isn't already a multiple
 * of the stride adds one extra), so ticks are chosen by evenly sampling at
 * most `maxTicks` candidate indices across [0, n-1] instead of striding.
 * Candidates can collide under rounding for small n — that only shrinks
 * the result, never grows it past `maxTicks`.
 */
export function selectTicks(n: number, maxTicks = 12): number[] {
  if (n <= 0) return [];
  if (n <= maxTicks) return Array.from({ length: n }, (_, i) => i);
  const count = maxTicks;
  const indices = new Set<number>();
  for (let k = 0; k < count; k++) {
    indices.add(Math.round((k * (n - 1)) / (count - 1)));
  }
  return Array.from(indices).sort((a, b) => a - b);
}

export function AreaChart({
  points, compare, secondary, height = 190,
}: {
  points: Array<{ x: string; y: number }>;
  compare?: Array<{ x: string; y: number }>;
  secondary?: Array<{ x: string; y: number }>;
  height?: number;
}) {
  if (points.length === 0) {
    return <div className="ad-note py-6 text-center">No data.</div>;
  }

  const W = 600, H = height, PAD_L = 2, PAD_R = 2, PAD_T = 8, PAD_B = 20;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const n = points.length;

  const safe = (v: number) => (Number.isFinite(v) ? v : 0);
  const ys = points.map(p => safe(p.y));
  const compareYs = (compare ?? []).map(p => safe(p.y));
  // Floor above 0 so an empty/all-zero series still renders a flat baseline
  // instead of dividing by zero.
  const maxY = Math.max(1e-9, ...ys, ...compareYs);

  const x = (i: number) => (n <= 1 ? PAD_L + plotW / 2 : PAD_L + (i / (n - 1)) * plotW);
  const y = (v: number) => PAD_T + plotH - (Math.max(0, v) / maxY) * plotH;
  const baseline = PAD_T + plotH;

  const linePath = points
    .map((_, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(ys[i]).toFixed(1)}`)
    .join(' ');
  const areaPath = n > 1
    ? `${linePath} L ${x(n - 1).toFixed(1)} ${baseline.toFixed(1)} L ${x(0).toFixed(1)} ${baseline.toFixed(1)} Z`
    : '';

  const comparePath = compare && compare.length > 0
    ? compare
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(Math.min(i, n - 1)).toFixed(1)} ${y(safe(p.y)).toFixed(1)}`)
        .join(' ')
    : null;

  // `secondary` is an independent measure (e.g. clicks against a revenue
  // primary) — it gets its own scale, normalised to its own max, so it
  // isn't squashed flat by a primary series on a different unit/magnitude.
  const secondaryYs = (secondary ?? []).map(p => safe(p.y));
  const maxSecondaryY = Math.max(1e-9, ...secondaryYs);
  const ySecondary = (v: number) => PAD_T + plotH - (Math.max(0, v) / maxSecondaryY) * plotH;
  const secondaryPath = secondary && secondary.length > 0
    ? secondary
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(Math.min(i, n - 1)).toFixed(1)} ${ySecondary(safe(p.y)).toFixed(1)}`)
        .join(' ')
    : null;

  // Thin the axis labels, never the points — at most 12 ticks total,
  // always including the first and last.
  const tickIndices = new Set(selectTicks(n, 12));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Area chart">
      {n > 1 && <path d={areaPath} fill="var(--accent)" fillOpacity="0.12" stroke="none" />}
      <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {n === 1 && <circle cx={x(0)} cy={y(ys[0])} r="3" fill="var(--accent)" />}
      {secondaryPath && (
        <path d={secondaryPath} fill="none" stroke="var(--muted-2)" strokeWidth="1.5"
              strokeLinejoin="round" strokeLinecap="round" />
      )}
      {comparePath && (
        <path d={comparePath} fill="none" stroke="var(--amber)" strokeWidth="2" strokeDasharray="5 4"
              strokeLinejoin="round" strokeLinecap="round" />
      )}
      {points.map((p, i) => {
        if (!tickIndices.has(i)) return null;
        const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
        return (
          <text key={i} x={x(i)} y={H - 4} textAnchor={anchor}
                fontFamily="var(--font-mono-ed)" fontSize="9.5" fill="var(--muted-2)">
            {p.x}
          </text>
        );
      })}
    </svg>
  );
}
