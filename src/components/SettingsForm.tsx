'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function SettingsForm({
  initial,
}: {
  initial: {
    alert_threshold_per_adult_usd: number;
    alert_email: string;
    max_display_per_adult_usd: number;
    price_drop_pct: number;
  };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [threshold, setThreshold] = useState(initial.alert_threshold_per_adult_usd);
  const [email, setEmail] = useState(initial.alert_email);
  const [maxDisplay, setMaxDisplay] = useState(initial.max_display_per_adult_usd);
  const [dropPct, setDropPct] = useState(initial.price_drop_pct);
  const [msg, setMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alert_threshold_per_adult_usd: Number(threshold),
        alert_email: email,
        max_display_per_adult_usd: Number(maxDisplay),
        price_drop_pct: Number(dropPct),
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setMsg(`Error: ${JSON.stringify(j.error ?? res.statusText)}`);
      return;
    }
    setMsg('Saved.');
    start(() => router.refresh());
  }

  async function sendTest() {
    setTesting(true);
    setMsg(null);
    try {
      const res = await fetch('/api/settings/test-email', { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (j.ok) setMsg(`Test email sent (id ${j.id || '—'}). Check ${email}.`);
      else setMsg(`Test email failed: ${j.error || res.statusText}`);
    } finally {
      setTesting(false);
    }
  }

  return (
    <form onSubmit={save} className="ed-panel space-y-4">
      <div>
        <h2 className="ed-h2" style={{ marginBottom: 4 }}>Alert &amp; display settings</h2>
        <p className="ed-panel-note">Two kinds of email alerts: <strong>threshold-cross</strong> (any fare below your target) and <strong>price-drop</strong> (fare dips meaningfully below the recent 7-day median, even if still above target).</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
        <div>
          <label className="ed-label">Alert target (per adult, USD) — emails fire below this</label>
          <input
            type="number" min="100" step="50"
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="ed-input"
          />
        </div>
        <div>
          <label className="ed-label">Max display price (per adult, USD) — hide fares above this</label>
          <input
            type="number" min="100" step="50"
            value={maxDisplay}
            onChange={(e) => setMaxDisplay(Number(e.target.value))}
            className="ed-input"
          />
        </div>
        <div>
          <label className="ed-label">Alert email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="ed-input"
          />
        </div>
        {/* The poll-interval field is gone: cadence is decided by the poll
            allocator from how much a route matters, not by a number a user
            types, and the underlying setting is the scheduler tick — a
            service-wide, owner-only knob. See lib/pollBudget.ts. */}
        <div>
          <label className="ed-label">Price-drop sensitivity (%)</label>
          <input
            type="number" min="1" max="80" step="1"
            value={dropPct}
            onChange={(e) => setDropPct(Number(e.target.value))}
            className="ed-input"
          />
          <p className="ed-panel-note" style={{ marginTop: 4 }}>
            Fire a price-drop email when the cheapest fare is at least this much below the search&apos;s 7-day median. Default 10%.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap pt-3" style={{ borderTop: '1px solid var(--rule-soft)' }}>
        <button type="submit" className="ed-btn ed-btn-primary" disabled={pending}>Save</button>
        <button type="button" onClick={sendTest} className="ed-btn ed-btn-secondary" disabled={testing}>
          {testing ? 'Sending…' : 'Send test email'}
        </button>
        {msg && <span className="ed-panel-note" style={{ margin: 0 }}>{msg}</span>}
      </div>
    </form>
  );
}
