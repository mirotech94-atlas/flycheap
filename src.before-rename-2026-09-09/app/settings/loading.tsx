export default function SettingsLoading() {
  return (
    <div className="space-y-6 motion-fade-in">
      <div className="h-9 w-48 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
      <div className="grid md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card h-48 animate-pulse bg-slate-100 dark:bg-slate-800/60" style={{ animationDelay: `${i * 100}ms` }} />
        ))}
      </div>
    </div>
  );
}
