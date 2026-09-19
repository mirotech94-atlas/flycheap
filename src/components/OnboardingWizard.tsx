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

  return (
    <div className="fixed inset-0 z-50 grid place-items-center px-4 motion-fade-in" role="dialog">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />

      <div className="relative bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-lift border border-slate-200 dark:border-slate-700 overflow-hidden motion-slide-up">
        {/* Top progress + skip */}
        <div className="bg-brand-gradient text-white px-6 py-4 relative overflow-hidden">
          <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-[var(--nc-teal)]/15 blur-2xl pointer-events-none" />
          <div className="relative flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-white/70 font-semibold">Welcome, {userEmail}</div>
              <h2 className="font-display font-bold text-xl">Set up your first route</h2>
            </div>
            <button onClick={() => setSkipped(true)} className="text-xs text-white/70 hover:text-white px-2 py-1 rounded">Skip</button>
          </div>
          <div className="relative mt-4 flex items-center gap-1">
            {[1, 2, 3].map(s => (
              <div key={s} className={`flex-1 h-1.5 rounded-full transition ${s <= step ? 'bg-[var(--nc-teal)]' : 'bg-white/20'}`} />
            ))}
          </div>
        </div>

        <div className="p-6">
          {step === 1 && (
            <div className="motion-fade-in">
              <div className="eyebrow">Step 1 of 3</div>
              <h3 className="font-display font-bold text-lg mt-1 mb-1">Pick a route to track</h3>
              <p className="text-sm text-slate-500 mb-4">Start with a popular route — you can add more later from the Searches page.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {POPULAR_ROUTES.map(r => (
                  <button
                    key={r.label}
                    onClick={() => setRoute(r)}
                    className={`text-left p-3 rounded-lg border-2 transition ${route.label === r.label ? 'border-brand bg-brand/5' : 'border-slate-200 dark:border-slate-700 hover:border-slate-400'}`}
                  >
                    <div className="text-[10px] font-mono uppercase text-slate-400">{r.from} → {r.to}</div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">{r.label}</div>
                  </button>
                ))}
              </div>
              <button onClick={() => setStep(2)} className="btn btn-primary w-full justify-center mt-5">
                Continue →
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="motion-fade-in">
              <div className="eyebrow">Step 2 of 3</div>
              <h3 className="font-display font-bold text-lg mt-1 mb-1">Set your target price</h3>
              <p className="text-sm text-slate-500 mb-4">Get an email the moment any fare on this route drops below this number (per adult, USD).</p>

              <div className="text-center my-4">
                <div className="text-5xl font-bold tabular text-brand">${target}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">per adult</div>
              </div>
              <input
                type="range" min={200} max={3000} step={50}
                value={target} onChange={e => setTarget(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                <span>$200</span>
                <span>$1,500</span>
                <span>$3,000</span>
              </div>

              <div className="flex items-center gap-2 mt-5">
                <button onClick={() => setStep(1)} className="btn flex-1 justify-center">← Back</button>
                <button onClick={() => setStep(3)} className="btn btn-primary flex-1 justify-center">Continue →</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="motion-fade-in">
              <div className="eyebrow">Step 3 of 3</div>
              <h3 className="font-display font-bold text-lg mt-1 mb-1">Ready to track</h3>
              <p className="text-sm text-slate-500 mb-4">We&apos;ll create the route and start polling every 30 minutes. You can adjust dates from the Searches page anytime.</p>
              <ul className="space-y-2 text-sm bg-slate-50 dark:bg-slate-800/40 rounded-lg p-4 border border-slate-200/60 dark:border-slate-700">
                <li><span className="text-slate-500">Route:</span> <strong>{route.label}</strong></li>
                <li><span className="text-slate-500">Target:</span> <strong>${target} per adult</strong></li>
                <li><span className="text-slate-500">Dates:</span> <strong>~60 days from now (you can change anytime)</strong></li>
                <li><span className="text-slate-500">Email alerts to:</span> <strong>{userEmail}</strong></li>
              </ul>
              {err && <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}
              <div className="flex items-center gap-2 mt-5">
                <button onClick={() => setStep(2)} className="btn flex-1 justify-center" disabled={busy}>← Back</button>
                <button onClick={finish} className="btn btn-primary flex-1 justify-center" disabled={busy}>
                  {busy ? 'Setting up…' : 'Start tracking ✓'}
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="motion-fade-in text-center py-3">
              <div className="text-5xl mb-3">🎉</div>
              <h3 className="font-display font-bold text-xl">You&apos;re all set!</h3>
              <p className="text-sm text-slate-500 mt-2 mb-5">
                We&apos;ll start polling now. Check back in a few minutes for your first fare snapshot.
              </p>
              <button onClick={() => setSkipped(true)} className="btn btn-primary justify-center w-full">
                Open the dashboard →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
