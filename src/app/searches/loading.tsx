export default function SearchesLoading() {
  return (
    <div className="space-y-6 motion-fade-in">
      {/* Hero skeleton */}
      <div className="rounded-3xl bg-brand-gradient/90 h-44 animate-pulse" />
      {/* Quick-add skeleton */}
      <div className="card h-40 animate-pulse bg-slate-100 dark:bg-slate-800/60" />
      {/* Table skeleton */}
      <div className="card space-y-3">
        <div className="h-5 w-40 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 rounded-lg bg-slate-100 dark:bg-slate-800/60 animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
        ))}
        <p className="text-xs text-slate-400 text-center pt-2">
          Loading your tracked searches — polling live fares…
        </p>
      </div>
    </div>
  );
}
