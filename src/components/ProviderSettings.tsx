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
    setMsg(res.ok ? 'Saved.' : `Error: ${res.statusText}`);
    if (res.ok) start(() => router.refresh());
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
    <div className="card">
      <div className="card-head">
        <div>
          <div className="eyebrow">Data sources</div>
          <h2 className="!mb-0">Flight providers</h2>
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        When multiple providers are enabled, every poll fans out to all of them in parallel and the cheapest price wins.
        Each fare is tagged with its source. Click <em>Sign up &amp; configure</em> on any unconfigured provider for a guided wizard.
      </p>

      <div className="space-y-2">
        {providers.map(p => {
          const wizard = WIZARD[p.id];
          const drawerOpen = drawer === p.id;
          return (
            <div key={p.id}>
              <div className={`flex items-start gap-3 p-3 rounded-lg border ${p.isConfigured ? 'border-slate-200 dark:border-slate-700' : 'border-amber-200 bg-amber-50/40 dark:bg-amber-900/10 dark:border-amber-800/50'}`}>
                <label className="flex items-center pt-1">
                  <input
                    type="checkbox"
                    checked={p.isEnabled}
                    disabled={!p.isConfigured}
                    onChange={() => toggle(p.id)}
                    className="w-4 h-4"
                    title={p.isConfigured ? 'Enable this provider' : 'Add API credentials first'}
                  />
                </label>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <strong className="text-sm">{p.label}</strong>
                    {p.isConfigured
                      ? <span className="badge badge-ok">configured</span>
                      : <span className="badge badge-warn">needs API key</span>}
                    {p.isEnabled && p.isConfigured && <span className="badge badge-info">enabled</span>}
                    {wizard && <span className="badge badge-muted">{wizard.freeTier}</span>}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">{p.configHint}</div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => test(p.id)}
                    disabled={!p.isConfigured || testing === p.id}
                    className="btn btn-sm"
                  >
                    {testing === p.id ? 'Testing…' : 'Test'}
                  </button>
                  {wizard && (
                    <button
                      type="button"
                      onClick={() => { setDrawer(drawerOpen ? null : p.id); setDrawerInputs({}); }}
                      className="btn btn-sm"
                    >
                      {drawerOpen ? 'Close' : (p.isConfigured ? 'Update key' : 'Sign up & configure')}
                    </button>
                  )}
                </div>
              </div>

              {drawerOpen && wizard && (
                <div className="ml-7 mt-1 mb-3 p-4 rounded-lg border border-brand/30 bg-brand/5 dark:bg-brand-900/20">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">Setup wizard · {p.label}</div>
                      <div className="text-[11px] text-slate-500">{wizard.freeTier}</div>
                    </div>
                    <a
                      href={wizard.signupUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary btn-sm shrink-0"
                    >
                      Open signup ↗
                    </a>
                  </div>
                  <ol className="list-decimal pl-5 text-xs text-slate-600 dark:text-slate-300 space-y-1 mb-3">
                    {wizard.steps.map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                  <div className="space-y-2">
                    {wizard.envKeys.map(k => (
                      <div key={k.key}>
                        <label className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 mb-1 block">
                          {k.key} {keyStatus[k.key] && <span className="text-emerald-600 normal-case font-normal lowercase tracking-normal">· already set</span>}
                        </label>
                        <input
                          type="password"
                          autoComplete="new-password"
                          placeholder={k.placeholder}
                          value={drawerInputs[k.key] ?? ''}
                          onChange={e => setDrawerInputs({ ...drawerInputs, [k.key]: e.target.value })}
                          className="w-full font-mono text-xs"
                        />
                        {k.help && <div className="text-[10px] text-slate-500 mt-0.5">{k.help}</div>}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={() => saveKeys(p.id)}
                      className="btn btn-primary btn-sm"
                      disabled={savingKeys}
                    >
                      {savingKeys ? 'Saving…' : 'Save key & test'}
                    </button>
                    <span className="text-[10px] text-slate-500">
                      Saved to .env.local with file mode 0600 · injected into the running process so it&apos;s active immediately.
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-3 pt-3 border-t border-slate-200/60 dark:border-slate-700">
        <button onClick={save} className="btn btn-primary" disabled={pending}>Save provider toggles</button>
        {msg && <span className="text-xs text-slate-500">{msg}</span>}
      </div>
    </div>
  );
}
