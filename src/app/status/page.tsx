import Link from 'next/link';
import { headers } from 'next/headers';
import { PublicTopbar, PublicFooter } from '@/components/PublicChrome';
import { APP_VERSION_SHORT } from '@/lib/version';

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
    <div className="mk mk-bleed">
      <PublicTopbar right={<Link href="/" className="ed-btn ed-btn-secondary">← Back to site</Link>} />

      <section className="mk-section">
        <div className="mk-wrap" style={{ maxWidth: 720 }}>
          <div className="ed-eyebrow">System status</div>
          <h1 className="ed-h1">
            {overallOk ? 'All systems operational' : 'Service degraded'}
          </h1>
          <p className="ed-sub">
            Live snapshot — refreshes when you reload. Auto-checked at <code className="ed-mono" style={{ textTransform: 'none', letterSpacing: 0 }}>{h?.checked_at?.slice(11, 19) ?? '—'} UTC</code>.
          </p>

          {/* Overall card */}
          <div className="ed-panel" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span className={overallOk ? 'ed-chip status-ok' : 'ed-chip status-fail'}>
                {overallOk ? 'Operational' : 'Failing'}
              </span>
              <div>
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--ink)' }}>
                  {overallOk ? 'All systems operational' : 'Some checks failing'}
                </div>
                <div className="ed-panel-note">
                  Version <code>{h?.version ?? '—'}</code> · uptime <strong>{uptimeStr(h?.uptime_sec ?? 0)}</strong> · health-check {h?.duration_ms ?? '?'}ms
                </div>
              </div>
            </div>
          </div>

          {/* Per-check rows */}
          <div className="ed-panel" style={{ marginBottom: 20 }}>
            <h2 className="ed-panel-title" style={{ marginBottom: 12 }}>Component checks</h2>
            <div>
              {Object.entries(h?.checks ?? {}).map(([name, c]) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 0', borderTop: '1px solid var(--rule)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span className={c.ok ? 'ed-dot' : 'ed-dot red'} />
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--ink)', textTransform: 'capitalize' }}>{name.replace(/_/g, ' ')}</div>
                      {c.detail && <div className="ed-panel-note" style={{ marginTop: 2 }}>{c.detail}</div>}
                    </div>
                  </div>
                  <span className={c.ok ? 'ed-chip status-ok' : 'ed-chip status-fail'}>
                    {c.ok ? 'operational' : 'degraded'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Subscribe + tip */}
          <div className="ed-panel" style={{ textAlign: 'center' }}>
            <p className="ed-panel-note" style={{ margin: 0 }}>
              Health JSON: <code>/api/health</code> — wire up your favorite uptime monitor (UptimeRobot, BetterStack, Pingdom).
            </p>
          </div>
        </div>
      </section>

      <PublicFooter
        left={<>© 2026 FlyCheap · Operated by Myron Mekhael, New York, USA · All rights reserved</>}
        right={<><Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · {APP_VERSION_SHORT}</>}
      />
    </div>
  );
}
