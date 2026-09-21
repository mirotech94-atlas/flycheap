/* ============================================================
   Poll heatmap — the admin "feature block" (README "Poll heatmap:
   7×24 grid, 20px cells, 3px gap, accent mixed 12→92%").

   Data only: takes the plain array the caller's page loader already
   produced. No fetch, no fabricated grid — `queries.providerHealthHourly`
   returns 24 hourly buckets with NO provider dimension, so Fare engine
   passes a single row and this renders one 1×24 strip, never a
   fabricated 7 days. `rows` supports more than one entry for a future
   loader that DOES carry a provider column; nothing here invents that
   dimension itself.

   Cell intensity is call volume mixed against --surface:
     N = 12 + 80 * (volume / max)          (the README's 12→92 range)
     0 calls → --surface-2
   Error share then tints the same cell toward --red by the identical
   12-to-92 formula, layered on top of the volume colour via a second
   color-mix() (color-mix accepts another color-mix() as its base
   colour) — an hour with a few calls and a high error rate still
   reads as "mostly failing", not just "quiet".
   ============================================================ */

export type HeatmapCell = { hour: string; ok: number; err: number };
export type HeatmapRow = { label: string; cells: HeatmapCell[] };

function cellBackground(ok: number, err: number, max: number): string {
  const okN = Number.isFinite(ok) ? Math.max(0, ok) : 0;
  const errN = Number.isFinite(err) ? Math.max(0, err) : 0;
  const volume = okN + errN;
  if (volume <= 0 || !(max > 0)) return 'var(--surface-2)';

  const volPct = Math.min(1, volume / max);
  const intensity = 12 + 80 * volPct;
  let background = `color-mix(in srgb, var(--accent) ${intensity.toFixed(0)}%, var(--surface))`;

  const errShare = errN / volume;
  if (errShare > 0) {
    const errIntensity = 12 + 80 * Math.min(1, errShare);
    background = `color-mix(in srgb, var(--red) ${errIntensity.toFixed(0)}%, ${background})`;
  }
  return background;
}

/** `hour` is providerHealthHourly's own bucket, `'YYYY-MM-DD HH:00'` — the
    tick label is just that hour, the data's own axis, never fabricated. */
function hourLabel(hour: string): string {
  const m = /(\d{2}):00$/.exec(hour);
  return m ? `${m[1]}:00` : hour;
}

export function Heatmap({
  rows, cellSize = 20, gap = 3,
}: { rows: HeatmapRow[]; cellSize?: number; gap?: number }) {
  const allCells = rows.flatMap(r => r.cells);
  if (allCells.length === 0) {
    return <div className="ad-note py-6 text-center">No data.</div>;
  }

  const max = Math.max(0, ...allCells.map(c =>
    (Number.isFinite(c.ok) ? Math.max(0, c.ok) : 0) + (Number.isFinite(c.err) ? Math.max(0, c.err) : 0)));
  const axisCells = rows[0]?.cells ?? [];
  const tickEvery = Math.max(1, Math.ceil(axisCells.length / 8));
  const showRowLabels = rows.length > 1;

  return (
    <div>
      {rows.map((row, ri) => (
        <div key={ri} className="ed-heatmap-row">
          {showRowLabels && <div className="ed-heatmap-row-label">{row.label}</div>}
          <div
            className="ed-heatmap-grid"
            style={{ gap, gridTemplateColumns: `repeat(${row.cells.length}, ${cellSize}px)` }}
          >
            {row.cells.map((c, i) => {
              const volume = Math.max(0, c.ok) + Math.max(0, c.err);
              const title = `${hourLabel(c.hour)} · ${volume.toLocaleString()} call${volume === 1 ? '' : 's'}`
                + (c.err > 0 ? ` · ${c.err} error${c.err === 1 ? '' : 's'}` : '');
              return (
                <div
                  key={i}
                  className="ed-heatmap-cell"
                  style={{ width: cellSize, height: cellSize, background: cellBackground(c.ok, c.err, max) }}
                  title={title}
                />
              );
            })}
          </div>
        </div>
      ))}
      <div className="ed-heatmap-axis" style={{ gap, gridTemplateColumns: `repeat(${axisCells.length}, ${cellSize}px)` }}>
        {axisCells.map((c, i) => {
          const show = i === 0 || i === axisCells.length - 1 || i % tickEvery === 0;
          return (
            <div key={i} className="ed-heatmap-tick">{show ? hourLabel(c.hour) : ''}</div>
          );
        })}
      </div>
    </div>
  );
}
