// Skeleton loaders — pure CSS shimmer (.skeleton class lives in globals.css).
// Use these as placeholders while async data loads, or as loading.tsx fallbacks.

export function SkeletonLine({ w = '100%', h = 12 }: { w?: string | number; h?: number }) {
  return <div className="skeleton" style={{ width: w, height: h, borderRadius: 6 }} />;
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-3">
        <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 8 }} />
        <div className="flex-1 space-y-1.5">
          <div className="skeleton" style={{ width: '40%', height: 10 }} />
          <div className="skeleton" style={{ width: '70%', height: 16 }} />
        </div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 12, width: `${90 - i * 10}%` }} />
      ))}
    </div>
  );
}

export function SkeletonStat() {
  return (
    <div className="kpi">
      <div className="skeleton" style={{ width: '50%', height: 9, marginBottom: 8 }} />
      <div className="skeleton" style={{ width: '80%', height: 28, marginBottom: 6 }} />
      <div className="skeleton" style={{ width: '60%', height: 10 }} />
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="card overflow-hidden">
      <div className="skeleton" style={{ width: '30%', height: 14, marginBottom: 12 }} />
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {Array.from({ length: cols }).map((__, c) => (
              <div key={c} className="skeleton" style={{ height: 14 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
