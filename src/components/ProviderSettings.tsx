'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type ProviderStatus = {
  id: string;
  label: string;
  configHint: string;
  isConfigured: boolean;
  isEnabled: boolean;
};

// Per-provider signup wizard metadata. signupUrl opens in a new tab.
// envKeys is the list of env vars the user pastes in after signup.
const WIZARD: Record<string, {
  signupUrl: string;
  freeTier: string;
  envKeys: Array<{ key: string; placeholder: string; help?: string }>;
  steps: string[];
}> = {
  amadeus: {
    signupUrl: 'https://developers.amadeus.com/register',
    freeTier: 'Free 2,000 calls/month · real GDS pricing',
    envKeys: [
      { key: 'AMADEUS_CLIENT_ID',     placeholder: 'API Key (Client ID)',    help: 'From My Self-Service Workspace → your app' },
      { key: 'AMADEUS_CLIENT_SECRET', placeholder: 'API Secret (Client Secret)' },
    ],
    steps: [
      'Click "Sign up →" and register with mirotech94@gmail.com (instant, no card needed).',
      'Verify the confirmation email Amadeus sends.',
      'Go to "My Self-Service Workspace" → "Create New App" → name it "FlyCheap Tracker".',
      'Copy the API Key and API Secret into the fields below, hit Save.',
    ],
  },
  serpapi: {
    signupUrl: 'https://serpapi.com/users/sign_up',
    freeTier: '100 searches/month free',
    envKeys: [{ key: 'SERPAPI_KEY', placeholder: 'API key' }],
    steps: [
      'Sign up at serpapi.com with mirotech94@gmail.com (Google sign-in works).',
      'Verify the email.',
      'Copy the key from your dashboard.',
      'Paste below.',
    ],
  },
  searchapi: {
    signupUrl: 'https://www.searchapi.io/users/sign_up',
    freeTier: '100 searches/month free',
    envKeys: [{ key: 'SEARCHAPI_KEY', placeholder: 'API key' }],
    steps: [
      'Sign up at searchapi.io.',
      'Confirm email.',
      'Copy your API key from the dashboard.',
      'Paste below.',
    ],
  },
  kiwi: {
    signupUrl: 'https://tequila.kiwi.com/portal/login/register',
    freeTier: 'Free for partners; affiliate approval needed for production',
    envKeys: [{ key: 'KIWI_TEQUILA_KEY', placeholder: 'apikey from Tequila portal' }],
    steps: [
      'Register at tequila.kiwi.com with mirotech94@gmail.com.',
      'Create a "solution" → name it; pick "metasearch" use case.',
      'Copy the apikey from the solution dashboard.',
      'Paste below.',
    ],
  },
  duffel: {
    signupUrl: 'https://app.duffel.com/join',
    freeTier: 'Sandbox is free (test data only)',
    envKeys: [{ key: 'DUFFEL_TOKEN', placeholder: 'Test access token (starts with duffel_test_)' }],
    steps: [
      'Sign up at duffel.com.',
      'In the dashboard, switch to "Test" mode.',
      'Settings → Access Tokens → Create token.',
      'Paste below.',
    ],
  },
  travelpayouts: {
    signupUrl: 'https://www.travelpayouts.com/registration',
    freeTier: 'Unlimited (affiliate program)',
    envKeys: [{ key: 'TRAVELPAYOUTS_TOKEN', placeholder: 'API token from Tools → API' }],
    steps: [
      'Already configured in your install. Use this only to rotate the token.',
    ],
  },
};

export function ProviderSettings({ initial }: { initial: ProviderStatus[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [providers, setProviders] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [keyStatus, setKeyStatus] = useState<Record<string, boolean>>({});
  const [drawer, setDrawer] = useState<string | null>(null);
  const [drawerInputs, setDrawerInputs] = useState<Record<string, string>>({});
  const [savingKeys, setSavingKeys] = useState(false);

  useEffect(() => {
    fetch('/api/providers/keys').then(r => r.json()).then(j => setKeyStatus(j.status || {}));
  }, []);

  function toggle(id: string) {
    setProviders(ps => ps.map(p => p.id === id ? { ...p, isEnabled: !p.isEnabled } : p));
  }

  async function save() {
    setMsg(null);
    const enabled = providers.filter(p => p.isEnabled).map(p => p.id).join(',') || 'travelpayouts';
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled_providers: enabled }),
    });
    if (!res.ok) { setMsg(`Error: ${res.statusText}`); return; }
    // enabled_providers is service-wide, so the API only accepts it from the
    // owner and reports anything it refused. Saying "Saved." over a value the
    // server threw away is the kind of quiet no-op that gets debugged twice.
    const j = await res.json().catch(() => ({} as { ignored?: string[] }));
    if (j.ignored?.includes('enabled_providers')) {
      setMsg('Not saved — provider selection is service-wide and can only be changed by the account owner.');
      return;
    }
    setMsg('Saved.');
    start(() => router.refresh());
  }

  async function test(id: string) {
    setTesting(id); setMsg(null);
    try {
      const r = await fetch(`/api/providers/${id}/test`, { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (j.ok) setMsg(`${id}: ${j.offers ?? 0} offers, ${j.ms ?? '—'}ms${j.cheapest ? ` · cheapest $${j.cheapest}/adult` : ''}`);
      else setMsg(`${id}: ${j.error || r.statusText}`);
    } finally { setTesting(null); }
  }

  async function saveKeys(id: string) {
    const wizard = WIZARD[id];
    if (!wizard) return;
    const payload: Record<string, string> = {};
    for (const k of wizard.envKeys) {
      const v = drawerInputs[k.key]?.trim();
      if (v && v.length >= 4) payload[k.key] = v;
    }
    if (Object.keys(payload).length === 0) {
      setMsg('Enter at least one key value.');
      return;
    }
    setSavingKeys(true);
    try {
      const r = await fetch('/api/providers/keys', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (j.ok) {
        setMsg(`Saved ${j.updated.join(', ')} ✓ — running process updated, no restart needed.`);
        // Refresh provider status
        const ks = await fetch('/api/providers/keys').then(r => r.json());
        setKeyStatus(ks.status || {});
        // Refresh full page to update isConfigured badges
        start(() => router.refresh());
        setDrawer(null);
        setDrawerInputs({});
      } else {
        setMsg(`Failed: ${j.error}`);
      }
    } finally { setSavingKeys(false); }
  }

  return (
    <div className="ed-panel">
      <div className="ed-panel-head">
        <div>
          <div className="ed-eyebrow">Data sources</div>
          <h2 className="ed-panel-title">Flight providers</h2>
        </div>
      </div>
      <p className="ed-panel-note" style={{ marginBottom: 12 }}>
        When multiple providers are enabled, every poll fans out to all of them in parallel and the cheapest price wins.
        Each fare is tagged with its source. Click <em>Sign up &amp; configure</em> on any unconfigured provider for a guided wizard.
      </p>

      <div>
        {providers.map(p => {
          const wizard = WIZARD[p.id];
          const drawerOpen = drawer === p.id;
          return (
            <div key={p.id}>
              <div className="ed-toggle-row">
                <label className="ed-toggle-label">
                  <span className="ed-toggle-text">
                    <span className="ed-toggle-name" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {p.label}
                      {p.isConfigured ? (
                        <span className="ed-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span className="ed-dot" aria-hidden />configured
                        </span>
                      ) : (
                        <span className="ed-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span className="ed-dot amber" aria-hidden />needs API key
                        </span>
                      )}
                      {p.isEnabled && p.isConfigured && <span className="ed-chip">enabled</span>}
                      {wizard && <span className="ed-mono" style={{ color: 'var(--muted-2)' }}>{wizard.freeTier}</span>}
                    </span>
                    <span className="ed-toggle-help">{p.configHint}</span>
                  </span>
                  <span className="ed-toggle-switch">
                    <input
                      type="checkbox"
                      className="ed-toggle-input"
                      role="switch"
                      aria-checked={p.isEnabled}
                      checked={p.isEnabled}
                      disabled={!p.isConfigured}
                      onChange={() => toggle(p.id)}
                      title={p.isConfigured ? 'Enable this provider' : 'Add API credentials first'}
                    />
                    <span className="ed-toggle" aria-hidden><span className="ed-knob" /></span>
                  </span>
                </label>
                {/* Outside the label, same reasoning as AlertChannelsCard's Test
                    button — a click here must not also flip the switch. */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => test(p.id)}
                    disabled={!p.isConfigured || testing === p.id}
                    className="ed-btn ed-btn-secondary"
                  >
                    {testing === p.id ? 'Testing…' : 'Test'}
                  </button>
                  {wizard && (
                    <button
                      type="button"
                      onClick={() => { setDrawer(drawerOpen ? null : p.id); setDrawerInputs({}); }}
                      className="ed-btn ed-btn-secondary"
                    >
                      {drawerOpen ? 'Close' : (p.isConfigured ? 'Update key' : 'Sign up & configure')}
                    </button>
                  )}
                </div>
              </div>

              {drawerOpen && wizard && (
                <div className="ed-subpanel mb-3" style={{ marginTop: 4 }}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>Setup wizard · {p.label}</div>
                      <div className="ed-mono" style={{ color: 'var(--muted-2)', marginTop: 2 }}>{wizard.freeTier}</div>
                    </div>
                    <a
                      href={wizard.signupUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ed-btn ed-btn-primary"
                      style={{ flexShrink: 0 }}
                    >
                      Open signup ↗
                    </a>
                  </div>
                  <ol style={{ paddingLeft: 20, listStyleType: 'decimal', marginBottom: 12, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
                    {wizard.steps.map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                  <div className="space-y-2">
                    {wizard.envKeys.map(k => (
                      <div key={k.key}>
                        <label className="ed-label">
                          {k.key} {keyStatus[k.key] && <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500, color: 'var(--green)' }}>· already set</span>}
                        </label>
                        <input
                          type="password"
                          autoComplete="new-password"
                          placeholder={k.placeholder}
                          value={drawerInputs[k.key] ?? ''}
                          onChange={e => setDrawerInputs({ ...drawerInputs, [k.key]: e.target.value })}
                          className="ed-input"
                          style={{ fontFamily: 'var(--font-mono-ed)', fontSize: 12 }}
                        />
                        {k.help && <div className="ed-panel-note" style={{ marginTop: 4, fontSize: 11 }}>{k.help}</div>}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={() => saveKeys(p.id)}
                      className="ed-btn ed-btn-primary"
                      disabled={savingKeys}
                    >
                      {savingKeys ? 'Saving…' : 'Save key & test'}
                    </button>
                    <span className="ed-mono" style={{ color: 'var(--muted-2)' }}>
                      Saved to .env.local with file mode 0600 · injected into the running process so it&apos;s active immediately.
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-3 pt-3" style={{ borderTop: '1px solid var(--rule)' }}>
        <button onClick={save} className="ed-btn ed-btn-primary" disabled={pending}>Save provider toggles</button>
        {msg && <span className="ed-panel-note" style={{ margin: 0 }}>{msg}</span>}
      </div>
    </div>
  );
}
