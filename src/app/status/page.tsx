import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

type Health = {
  ok: boolean;
  version: string;
  uptime_sec: number;
  checked_at: string;
  duration_ms: number;
  checks: Record<string, { ok: boolean; detail?: string; ms?: number }>;
};

async function fetchHealth(): Promise<Health | null> {
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const host  = h.get('x-forwarded-host') ?? h.get('host') ?? 'flycheap.live';
  try {
    const r = await fetch(`${proto}://${host}/api/health`, { cache: 'no-store' });
    return await r.json();
  } catch { return null; }
}

function uptimeStr(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default async function StatusPage() {
  const h = await fetchHealth();
  const overallOk = h?.ok ?? false;

  return (
    <div className="space-y-6 motion-fade-in">
      <div>
        <div className="eyebrow mb-1">System status</div>
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tight font-display">
          {overallOk ? 'All systems operational' : 'Service degraded'}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Live snapshot — refreshes when you reload. Auto-checked at <code>{h?.checked_at?.slice(11, 19) ?? '—'} UTC</code>.
        </p>
      </div>

      {/* Overall card */}
      <div className={`card relative overflow-hidden ${overallOk ? 'card-accent-emerald' : ''} motion-slide-up`}>
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full blur-3xl pointer-events-none"
             style={{ background: overallOk ? 'rgba(16,185,129,.18)' : 'rgba(239,68,68,.18)' }} />
        <div className="relative flex items-center gap-4">
          <div className={`w-14 h-14 rounded-2xl grid place-items-center text-2xl ${overallOk ? 'bg-emerald-500' : 'bg-red-500'} text-white shadow-lift`}>
            {overallOk ? '✓' : '!'}
          </div>
          <div>
            <div className="font-display font-bold text-xl text-slate-900 dark:text-white">
              {overallOk ? 'All systems operational' : 'Some checks failing'}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Version <code>{h?.version ?? '—'}</code> · uptime <strong>{uptimeStr(h?.uptime_sec ?? 0)}</strong> · health-check {h?.duration_ms ?? '?'}ms
            </div>
          </div>
        </div>
      </div>

      {/* Per-check rows */}
      <div className="card motion-slide-up motion-delay-1">
        <h2>Component checks</h2>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {Object.entries(h?.checks ?? {}).map(([name, c]) => (
            <div key={name} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full ${c.ok ? 'bg-emerald-500' : 'bg-red-500'} ${c.ok ? 'motion-pulse' : ''}`} />
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white capitalize">{name.replace(/_/g, ' ')}</div>
                  {c.detail && <div className="text-xs text-slate-500">{c.detail}</div>}
                </div>
              </div>
              <span className={`badge ${c.ok ? 'badge-ok' : 'badge-warn'}`}>
                {c.ok ? 'operational' : 'degraded'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Subscribe + tip */}
      <div className="card motion-slide-up motion-delay-2 text-center text-sm text-slate-500">
        Health JSON: <code className="text-brand-700">/api/health</code> — wire up your favorite uptime monitor (UptimeRobot, BetterStack, Pingdom).
      </div>
    </div>
  );
}
