/* ============================================================
   Stacked bars — the admin "feature block" (README §Feature-block
   catalogue: Command centre, Click stream, Acquisition, Errors).
   Geometry: 190px tall, 5px gap, --accent over --amber, bottom rule,
   mono axis labels.

   Data only: takes the plain array the caller's page loader already
   produced. No fetch, no fabricated buckets, no smoothing — the number
   of bars IS `series.length`, whatever that page's data happens to be
   (30 days, 90 days, however many distinct days a capped row set
   spans). The `b` segment (amber, stacked above `a`'s accent) renders
   only when at least one entry in `series` actually carries `b` — a
   page with a single measure gets a single accent bar, not a fabricated
   second layer.
   ============================================================ */

export function StackedBars({
  series, height = 190,
}: { series: Array<{ a: number; b?: number; label: string }>; height?: number }) {
  if (series.length === 0) {
    return <div className="ad-note py-6 text-center">No data.</div>;
  }

  const hasB = series.some(s => typeof s.b === 'number' && s.b > 0);
  const max = Math.max(1, ...series.map(s => s.a + (hasB ? (s.b ?? 0) : 0)));
  // A real, nonzero day that rounds down to 0px reads as "no data" — the
  // same honesty problem as the dropped-partial-bucket case elsewhere in
  // this task. Floor any nonzero segment at 2px, same as the `Chart`
  // component this replaces (`minHeight: 2`).
  const segHeight = (v: number) => v <= 0 ? 0 : Math.max(2, Math.round((v / max) * height));

  // Thin the axis labels, never the bars — at most ~8 ticks, always
  // including the first and last bucket.
  const tickEvery = Math.max(1, Math.ceil(series.length / 8));

  return (
    <div>
      <div className="ed-stackbars" style={{ height }}>
        {series.map((s, i) => {
          const aH = segHeight(s.a);
          const bH = hasB ? segHeight(s.b ?? 0) : 0;
          const title = hasB
            ? `${s.label} · ${s.a.toLocaleString()} + ${(s.b ?? 0).toLocaleString()}`
            : `${s.label} · ${s.a.toLocaleString()}`;
          return (
            <div key={i} className="ed-stackbar" title={title}>
              <div className="ed-stackbar-seg a" style={{ height: aH }} />
              {hasB && <div className="ed-stackbar-seg b" style={{ height: bH }} />}
            </div>
          );
        })}
      </div>
      <div className="ed-stackbars-axis">
        {series.map((s, i) => {
          const show = i === 0 || i === series.length - 1 || i % tickEvery === 0;
          return (
            <div key={i} className="ed-stackbars-tick">
              {show ? s.label : ''}
            </div>
          );
        })}
      </div>
    </div>
  );
}
