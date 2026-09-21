'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const POPULAR_ROUTES = [
  { from: 'JFK', to: 'CAI', label: 'New York → Cairo' },
  { from: 'JFK', to: 'LON', label: 'New York → London' },
  { from: 'LAX', to: 'TYO', label: 'Los Angeles → Tokyo' },
  { from: 'LON', to: 'DXB', label: 'London → Dubai' },
  { from: 'LAX', to: 'CUN', label: 'Los Angeles → Cancun' },
  { from: 'NYC', to: 'PAR', label: 'New York → Paris' },
];

/**
 * 3-step onboarding modal shown to brand-new signed-in users (no searches yet).
 * Steps: pick a route template → set target price → confirm.
 */
export function OnboardingWizard({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [route, setRoute] = useState(POPULAR_ROUTES[0]);
  const [target, setTarget] = useState(900);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(false);

  if (skipped) return null;

  async function finish() {
    setBusy(true); setErr(null);
    try {
      // 1. Save target price as a per-user setting
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_threshold_per_adult_usd: target }),
      });
      // 2. Create the first tracked route — pick reasonable default dates 60 days out
      const depart = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
      const ret    = new Date(Date.now() + 74 * 86400000).toISOString().slice(0, 10);
      const r = await fetch('/api/searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: route.from, destination: route.to,
          depart_date: depart, return_date: ret,
          adults: 1, infants: 0,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j.error || `Could not create route (HTTP ${r.status}).`);
        setBusy(false);
        return;
      }
      setStep(4); // Success state
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  const h3Style = { fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: '19px', letterSpacing: '-0.015em' } as const;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center px-4 motion-fade-in" role="dialog">
      <div className="absolute inset-0" style={{ background: 'var(--ink)', opacity: 0.6 }} />

      <div
        className="relative w-full max-w-lg overflow-hidden motion-slide-up"
        style={{ background: 'var(--surface)', borderRadius: 0, border: '1px solid var(--rule)' }}
      >
        {/* Top progress + skip */}
        <div className="px-6 py-4 relative" style={{ background: 'var(--panel-bg)', color: 'var(--panel-fg)' }}>
          <div className="relative flex items-center justify-between">
            <div>
              <div className="ed-mono" style={{ color: 'color-mix(in srgb, var(--panel-fg) 72%, var(--panel-bg))' }}>Welcome, {userEmail}</div>
              <h2 className="ed-h2" style={{ color: 'var(--panel-fg)', marginBottom: 0 }}>Set up your first route</h2>
            </div>
            <button onClick={() => setSkipped(true)} className="text-xs px-2 py-1" style={{ color: 'color-mix(in srgb, var(--panel-fg) 72%, var(--panel-bg))' }}>Skip</button>
          </div>
          <div className="relative mt-4 flex items-center gap-1">
            {[1, 2, 3].map(s => (
              <div
                key={s}
                className="flex-1 h-1.5 transition"
                style={{ background: s <= step ? 'var(--accent)' : 'color-mix(in srgb, var(--panel-fg) 20%, var(--panel-bg))' }}
              />
            ))}
          </div>
        </div>

        <div className="p-6">
          {step === 1 && (
            <div className="motion-fade-in">
              <div className="ed-eyebrow">Step 1 of 3</div>
              <h3 style={h3Style} className="mt-1 mb-1">Pick a route to track</h3>
              <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>Start with a popular route — you can add more later from the Searches page.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {POPULAR_ROUTES.map(r => (
                  <button
                    key={r.label}
                    onClick={() => setRoute(r)}
                    className="text-left p-3 transition"
                    style={{
                      borderRadius: 0,
                      border: '2px solid ' + (route.label === r.label ? 'var(--accent)' : 'var(--rule)'),
                      background: route.label === r.label ? 'color-mix(in srgb, var(--accent) 6%, var(--surface))' : 'transparent',
                    }}
                  >
                    <div className="ed-mono" style={{ color: 'var(--muted-2)' }}>{r.from} → {r.to}</div>
                    <div className="text-sm font-semibold mt-0.5" style={{ color: 'var(--ink)' }}>{r.label}</div>
                  </button>
                ))}
              </div>
              <button onClick={() => setStep(2)} className="ed-btn ed-btn-primary w-full justify-center mt-5">
                Continue →
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="motion-fade-in">
              <div className="ed-eyebrow">Step 2 of 3</div>
              <h3 style={h3Style} className="mt-1 mb-1">Set your target price</h3>
              <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>Get an email the moment any fare on this route drops below this number (per adult, USD).</p>

              <div className="text-center my-4">
                <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: '46px', letterSpacing: '-0.02em', color: 'var(--amber)' }}>${target}</div>
                <div className="ed-mono mt-1" style={{ color: 'var(--muted)' }}>per adult</div>
              </div>
              <input
                type="range" min={200} max={3000} step={50}
                value={target} onChange={e => setTarget(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between ed-mono mt-1" style={{ color: 'var(--muted-2)' }}>
                <span>$200</span>
                <span>$1,500</span>
                <span>$3,000</span>
              </div>

              <div className="flex items-center gap-2 mt-5">
                <button onClick={() => setStep(1)} className="ed-btn ed-btn-secondary flex-1 justify-center">← Back</button>
                <button onClick={() => setStep(3)} className="ed-btn ed-btn-primary flex-1 justify-center">Continue →</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="motion-fade-in">
              <div className="ed-eyebrow">Step 3 of 3</div>
              <h3 style={h3Style} className="mt-1 mb-1">Ready to track</h3>
              <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>We&apos;ll create the route and start checking it straight away. You can adjust dates from the Searches page anytime.</p>
              <ul className="space-y-2 text-sm p-4" style={{ background: 'var(--surface-2)', borderRadius: 0, border: '1px solid var(--rule)' }}>
                <li><span style={{ color: 'var(--muted)' }}>Route:</span> <strong>{route.label}</strong></li>
                <li><span style={{ color: 'var(--muted)' }}>Target:</span> <strong>${target} per adult</strong></li>
                <li><span style={{ color: 'var(--muted)' }}>Dates:</span> <strong>~60 days from now (you can change anytime)</strong></li>
                <li><span style={{ color: 'var(--muted)' }}>Email alerts to:</span> <strong>{userEmail}</strong></li>
              </ul>
              {err && (
                <div
                  className="mt-3 text-xs px-3 py-2"
                  style={{ color: 'var(--red)', background: 'color-mix(in srgb, var(--red) 10%, var(--surface))', border: '1px solid color-mix(in srgb, var(--red) 30%, var(--surface))', borderRadius: 0 }}
                >
                  {err}
                </div>
              )}
              <div className="flex items-center gap-2 mt-5">
                <button onClick={() => setStep(2)} className="ed-btn ed-btn-secondary flex-1 justify-center" disabled={busy}>← Back</button>
                <button onClick={finish} className="ed-btn ed-btn-primary flex-1 justify-center" disabled={busy}>
                  {busy ? 'Setting up…' : 'Start tracking ✓'}
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="motion-fade-in text-center py-3">
              <div className="text-5xl mb-3">🎉</div>
              <h3 style={{ ...h3Style, fontSize: '23px' }}>You&apos;re all set!</h3>
              <p className="text-sm mt-2 mb-5" style={{ color: 'var(--muted)' }}>
                We&apos;ll start polling now. Check back in a few minutes for your first fare snapshot.
              </p>
              <button onClick={() => setSkipped(true)} className="ed-btn ed-btn-primary justify-center w-full">
                Open the dashboard →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
