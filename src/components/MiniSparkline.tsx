/**
 * Inline-SVG mini sparkline for KPI tiles.
 *
 * Server-renderable, no client JS, no deps. Auto-scales y to data range,
 * pins x evenly across width. The line stroke + fill area inherit from
 * `currentColor` so callers control color via Tailwind text classes.
 *
 *   <MiniSparkline data={[600, 612, 605, 591, 598, 591]} />
 */
export function MiniSparkline({
  data,
  width = 120,
  height = 28,
  fill = true,
}: {
  data: number[];
  width?: number;
  height?: number;
  fill?: boolean;
}) {
  if (!data || data.length < 2) {
    return <svg className="fc-mini-spark" viewBox={`0 0 ${width} ${height}`} aria-hidden="true" />;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const dx = data.length > 1 ? width / (data.length - 1) : width;
  const pad = 2;
  const points = data.map((v, i) => {
    const x = i * dx;
    const y = height - pad - ((v - min) / range) * (height - pad * 2);
    return [x, y] as const;
  });
  const d = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const fillD = fill
    ? `${d} L${(points[points.length - 1][0]).toFixed(1)} ${height} L0 ${height} Z`
    : '';

  return (
    <svg className="fc-mini-spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      {fill && <path className="fc-spark-fill" d={fillD} />}
      <path d={d} />
    </svg>
  );
}
