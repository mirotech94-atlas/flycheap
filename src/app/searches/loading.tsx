export default function SearchesLoading() {
  return (
    <div className="space-y-6 motion-fade-in">
      {/* Hero skeleton */}
      <div className="h-44 animate-pulse" style={{ background: 'var(--surface-2)' }} />
      {/* Quick-add skeleton */}
      <div className="card h-40 animate-pulse" style={{ background: 'var(--surface-2)' }} />
      {/* Table skeleton */}
      <div className="card space-y-3">
        <div className="h-5 w-40 animate-pulse" style={{ background: 'var(--surface-2)' }} />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse" style={{ background: 'var(--surface-2)', animationDelay: `${i * 100}ms` }} />
        ))}
        <p className="text-xs text-center pt-2" style={{ color: 'var(--muted)' }}>
          Loading your tracked searches — polling live fares…
        </p>
      </div>
    </div>
  );
}
