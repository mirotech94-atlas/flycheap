'use client';

import { useEffect, useState } from 'react';
import { PUBLIC_CLIENT_HOST } from '@/lib/hosts';
import { contrastSafe, contrastRatio } from '@/lib/brandContrast';

type Branding = {
  brand_color: string | null;
  logo_url: string | null;
  sender_email: string | null;
  tier: string;
  custom_domain?: string | null;
  stripe_customer_id?: string | null;
};

const PRESETS = [
  { name: 'House blue (default)', color: '#1A4459' },
  { name: 'Emerald',         color: '#047857' },
  { name: 'Royal',           color: '#3730a3' },
  { name: 'Sunset',          color: '#dc2626' },
  { name: 'Slate',           color: '#1e293b' },
  { name: 'Teal',            color: '#0f766e' },
  { name: 'Magenta',         color: '#a21caf' },
  { name: 'Charcoal',        color: '#0b1220' },
];

export function WhiteLabelSettings() {
  const [me, setMe] = useState<Branding | null>(null);
  // Default matches the app's own white-label fallback (the house blue), not
  // the retired navy this used to seed.
  const [color, setColor] = useState('#1A4459');
  const [logo, setLogo] = useState('');
  const [sender, setSender] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [domain, setDomain] = useState('');
  const [domainSaving, setDomainSaving] = useState(false);
  const [domainNote, setDomainNote] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(j => {
      if (j?.user) {
        setMe(j.user);
        setColor(j.user.brand_color  || '#1A4459');
        setLogo(j.user.logo_url       || '');
        setSender(j.user.sender_email || '');
        setDomain(j.user.custom_domain || '');
      }
    });
  }, []);

  // Live preview — apply the chosen color to the document root via CSS var.
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--brand-preview', color);
    }
  }, [color]);

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/me/branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand_color: color, logo_url: logo || null, sender_email: sender || null }),
      });
      const j = await r.json();
      if (j.ok) {
        setMsg('Branding saved ✓ — refresh to see the new color across the dashboard.');
      } else {
        setMsg(j.error || 'Could not save branding.');
      }
    } finally { setBusy(false); }
  }

  if (!me) {
    return <div className="card text-sm text-slate-500 text-center py-6">Sign in to manage branding.</div>;
  }

  const isFree = me.tier === 'free';

  // What the app will actually draw as ink on the dark chrome. Mirrors exactly
  // what layout.tsx injects, so the preview cannot drift from the real thing.
  const NC_DARK = '#0B1220';
  const derivedInk = contrastSafe(color, NC_DARK);
  const ratio = contrastRatio(color, NC_DARK) ?? 0;

  return (
    <div className={`card ${isFree ? 'opacity-90' : ''}`}>
      <div className="card-head">
        <div>
          <div className="eyebrow text-brand-700">White-label</div>
          <h2 className="!mb-0">Branding</h2>
        </div>
        {isFree
          ? <a href="/api/billing/checkout" className="btn btn-primary btn-sm">Upgrade to Pro to unlock</a>
          : <span className="badge badge-info">{me.tier}</span>}
      </div>

      <p className="text-xs text-slate-500 mb-4">
        Customize the dashboard&apos;s brand color, logo, and the sender email used for fare-alert notifications.
        Live preview is applied to the dashboard chrome the moment you change a value.
      </p>

      <div className="space-y-4">
        {/* Brand color */}
        <div>
          <label className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5 block">
            Brand color
          </label>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                disabled={isFree}
                className="!w-12 !h-12 !p-0 !rounded-lg border-2"
              />
              <input
                type="text"
                value={color}
                onChange={e => setColor(e.target.value)}
                disabled={isFree}
                pattern="^#[0-9a-fA-F]{6}$"
                className="font-mono text-sm w-28"
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {PRESETS.map(p => (
                <button
                  key={p.color}
                  type="button"
                  onClick={() => setColor(p.color)}
                  disabled={isFree}
                  title={p.name}
                  className={`w-8 h-8 rounded-lg border-2 transition hover:scale-110 disabled:hover:scale-100 ${color.toLowerCase() === p.color.toLowerCase() ? 'border-slate-900 dark:border-white' : 'border-transparent'}`}
                  style={{ background: p.color }}
                />
              ))}
            </div>
          </div>
          {/* Live mini preview */}
          <div className="mt-3 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
            <div
              className="h-12 flex items-center justify-between px-4 text-white text-sm font-display font-bold"
              style={{ background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)` }}
            >
              <span>Brand preview</span>
              <span className="text-[10px] uppercase tracking-wider opacity-70">Header</span>
            </div>
            {/* This row previews the tenant's raw brand hex as ink. It used to sit
                on dark:bg-slate-900, where the DEFAULT brand (#0a3a6b) read at
                1.55:1 -- the preview was unreadable for every tenant who had
                not picked a colour yet. A preview card is a document surface,
                so it is pinned to ticket stock in both themes: the swatch is
                then judged against the light chrome it actually ships on. */}
            <div className="px-4 py-3 bg-[var(--nc-stock)] flex items-center gap-2">
              <button type="button" className="px-3 py-1.5 rounded-md text-xs font-semibold text-white" style={{ background: color }}>Primary CTA</button>
              <span className="text-xs font-semibold" style={{ color }}>Brand text</span>
            </div>

            {/* The SAME colour on the dark chrome, which is where a dark brand
                used to vanish at 1.55:1. The app no longer prints the raw hex
                as ink there -- it derives a variant that keeps the hue and
                clears AA -- so this row shows the tenant BOTH: what they picked,
                and what the app will actually draw. Without it the derivation is
                invisible and looks like the product ignoring their choice. */}
            <div className="px-4 py-3 bg-[var(--nc-dark)] flex items-center gap-2 border-t border-white/10">
              <button type="button" className="px-3 py-1.5 rounded-md text-xs font-semibold text-white" style={{ background: color }}>Primary CTA</button>
              <span className="text-xs font-semibold" style={{ color: derivedInk }}>Brand text</span>
              {derivedInk.toLowerCase() !== color.toLowerCase() && (
                <span className="ml-auto text-[10px] font-mono text-[var(--nc-on-dark-faint)]" title={`Your ${color} is ${ratio.toFixed(2)}:1 on the dark chrome — below the 4.5:1 needed to read. Lightened to ${derivedInk}, same hue.`}>
                  lightened to {derivedInk} for contrast
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Logo URL */}
        <div>
          <label className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5 block">
            Logo URL <span className="text-slate-400 normal-case font-normal">— PNG/SVG, square, recommended 256×256</span>
          </label>
          <div className="flex items-center gap-3">
            {logo && (
              <img src={logo} alt="Logo preview" className="w-12 h-12 rounded-lg object-contain bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
            )}
            <input
              type="url"
              value={logo}
              onChange={e => setLogo(e.target.value)}
              disabled={isFree}
              placeholder="https://your-cdn.com/logo.png"
              className="flex-1 text-sm"
            />
          </div>
        </div>

        {/* Sender email */}
        <div>
          <label className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5 block">
            From-address for alert emails
            <span className="text-slate-400 normal-case font-normal"> — must be on a Resend-verified domain</span>
          </label>
          <input
            type="email"
            value={sender}
            onChange={e => setSender(e.target.value)}
            disabled={isFree}
            placeholder="alerts@yourdomain.com"
            className="w-full text-sm"
          />
        </div>

        <div className="flex items-center gap-3 pt-3 border-t border-slate-200/60 dark:border-slate-700">
          <button onClick={save} disabled={busy || isFree} className="btn btn-primary">
            {busy ? 'Saving…' : 'Save branding'}
          </button>
          {isFree && (
            <a href="/api/billing/checkout" className="text-xs text-brand-700 underline">
              Upgrade to Pro for white-label
            </a>
          )}
          {msg && <span className="text-xs text-slate-500">{msg}</span>}
        </div>

        {/* Custom domain section */}
        <div className="pt-4 border-t border-slate-200/60 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-1">
            <label className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
              Custom domain
            </label>
            {!isFree && <span className="badge badge-info">{me.tier}</span>}
          </div>
          <p className="text-[11px] text-slate-500 mb-2">
            Point your own domain at the dashboard. Add a CNAME record from your DNS to <code className="font-mono">{PUBLIC_CLIENT_HOST}</code>;
            once it propagates, that hostname will load with your branding and your data.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="flights.yourcompany.com"
              value={domain}
              onChange={e => setDomain(e.target.value.toLowerCase())}
              disabled={isFree}
              className="flex-1 font-mono text-sm"
            />
            <button
              onClick={async () => {
                setDomainSaving(true); setDomainNote(null);
                const r = await fetch('/api/me/domain', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ domain: domain || null }),
                });
                const j = await r.json();
                setDomainSaving(false);
                setDomainNote(j.ok ? j.note : `Error: ${j.error}`);
              }}
              disabled={domainSaving || isFree}
              className="btn btn-sm"
            >
              {domainSaving ? 'Saving…' : (domain ? 'Save domain' : 'Remove')}
            </button>
          </div>
          {domainNote && (
            <div className="mt-2 text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-lg p-2 border border-slate-200/60 dark:border-slate-700">
              {domainNote}
            </div>
          )}
        </div>

        {/* Billing portal */}
        {!isFree && me.stripe_customer_id && (
          <div className="pt-4 border-t border-slate-200/60 dark:border-slate-700">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-sm">Billing &amp; subscription</div>
                <p className="text-[11px] text-slate-500">Manage your card, invoices, and cancel anytime via Stripe.</p>
              </div>
              <a href="/api/billing/portal" className="btn btn-sm">Open billing portal ↗</a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
