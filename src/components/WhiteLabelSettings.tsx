'use client';

import { useEffect, useState } from 'react';
import { PUBLIC_CLIENT_HOST } from '@/lib/hosts';
import { contrastSafe, contrastRatio, BRAND_GROUNDS } from '@/lib/brandContrast';

type Branding = {
  brand_color: string | null;
  logo_url: string | null;
  sender_email: string | null;
  tier: string;
  custom_domain?: string | null;
  stripe_customer_id?: string | null;
};

// Tenant brand data, not styling — these are the colours on offer, and the
// swatches render them literally so the tenant sees their own choice.
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
  // Which of the two editorial grounds the reader is actually looking at —
  // the preview has to judge the brand against THAT one, not a fixed guess.
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  // The fixed-white ink token (--panel-fg), read live rather than hardcoded,
  // for picking the CTA label's ink below — it needs a light AND a dark
  // candidate to choose between, and this is the light one.
  const [panelFg, setPanelFg] = useState<string | null>(null);

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

  // Track the live theme so the preview always judges against the ground the
  // reader is on, the same way layout.tsx picks --brand-ink per theme.
  useEffect(() => {
    const read = () => {
      const root = document.documentElement;
      setTheme(root.dataset.theme === 'dark' ? 'dark' : 'light');
      setPanelFg(getComputedStyle(root).getPropertyValue('--panel-fg').trim() || null);
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);

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
    return <div className="ed-panel" style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '24px 0' }}>Sign in to manage branding.</div>;
  }

  const isFree = me.tier === 'free';

  // What the app will actually draw as ink on the ground the reader is
  // currently looking at. Mirrors exactly what layout.tsx derives (same
  // BRAND_GROUNDS, same contrastSafe call), so the preview cannot drift from
  // the real thing.
  const ground = BRAND_GROUNDS[theme];
  const derivedInk = contrastSafe(color, ground);
  const ratio = contrastRatio(color, ground) ?? 0;

  // The CTA label sits ON the brand FILL, not on the page ground — a
  // different pairing from derivedInk above (which answers "is brand text
  // legible on the page?"). Pick whichever of the two candidate inks —
  // --panel-fg (light) or the page ground (which is near-black in dark
  // theme) — contrasts more with the brand colour itself.
  const ctaInk = panelFg && (contrastRatio(panelFg, color) ?? 0) >= (contrastRatio(ground, color) ?? 0)
    ? panelFg
    : ground;

  return (
    <div className="ed-panel" style={{ opacity: isFree ? 0.9 : 1 }}>
      <div className="ed-panel-head">
        <div>
          <div className="ed-eyebrow">White-label</div>
          <h2 className="ed-panel-title">Branding</h2>
        </div>
        {isFree
          ? <a href="/api/billing/checkout" className="ed-btn ed-btn-primary">Upgrade to Pro to unlock</a>
          : <span className="ed-chip">{me.tier}</span>}
      </div>

      <p className="ed-panel-note" style={{ marginBottom: 16 }}>
        Customize the dashboard&apos;s brand color, logo, and the sender email used for fare-alert notifications.
        Live preview is applied to the dashboard chrome the moment you change a value.
      </p>

      <div className="space-y-4">
        {/* Brand color */}
        <div>
          <label className="ed-label">Brand color</label>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                disabled={isFree}
                style={{ width: 44, height: 44, padding: 0, border: '1px solid var(--rule-strong)', borderRadius: 0, background: 'var(--surface)' }}
              />
              <input
                type="text"
                value={color}
                onChange={e => setColor(e.target.value)}
                disabled={isFree}
                pattern="^#[0-9a-fA-F]{6}$"
                className="ed-input"
                style={{ fontFamily: 'var(--font-mono-ed)', fontSize: 13, width: 112 }}
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {PRESETS.map(p => {
                const selected = color.toLowerCase() === p.color.toLowerCase();
                return (
                  <button
                    key={p.color}
                    type="button"
                    onClick={() => setColor(p.color)}
                    disabled={isFree}
                    title={p.name}
                    style={{
                      width: 30,
                      height: 30,
                      background: p.color,
                      border: '1px solid var(--rule-strong)',
                      borderRadius: 0,
                      outline: selected ? '2px solid var(--ink)' : 'none',
                      outlineOffset: 2,
                      cursor: isFree ? 'not-allowed' : 'pointer',
                      padding: 0,
                    }}
                  />
                );
              })}
            </div>
          </div>
          {/* Live mini preview */}
          <div className="mt-3" style={{ border: '1px solid var(--rule-strong)' }}>
            <div
              className="h-12 flex items-center justify-between px-4 text-sm font-display font-bold"
              style={{ background: color, color: 'var(--panel-fg)' }}
            >
              <span>Brand preview</span>
              <span className="ed-mono" style={{ opacity: 0.7, color: 'inherit' }}>Header</span>
            </div>
            {/* This row previews the tenant's raw brand hex as ink, judged
                against whichever editorial ground (--bg light or dark) the
                reader is currently on — the same two grounds layout.tsx
                derives --brand-ink against, read live via data-theme so the
                preview never shows a ground the page isn't actually using. */}
            <div className="px-4 py-3 flex items-center gap-2" style={{ background: 'var(--bg)', borderTop: theme === 'dark' ? '1px solid var(--rule)' : undefined }}>
              <button type="button" className="ed-btn" style={{ background: color, color: ctaInk }}>Primary CTA</button>
              <span className="text-xs font-semibold" style={{ color: derivedInk }}>Brand text</span>
              {derivedInk.toLowerCase() !== color.toLowerCase() && (
                <span className="ed-mono" style={{ marginLeft: 'auto', color: 'var(--muted-2)' }} title={`Your ${color} is ${ratio.toFixed(2)}:1 on this ground — below the 4.5:1 needed to read. Lightened to ${derivedInk}, same hue.`}>
                  lightened to {derivedInk} for contrast
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Logo URL */}
        <div>
          <label className="ed-label">
            Logo URL <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--muted-2)', fontWeight: 400 }}>— PNG/SVG, square, recommended 256×256</span>
          </label>
          <div className="flex items-center gap-3">
            {logo && (
              <img src={logo} alt="Logo preview" style={{ width: 44, height: 44, objectFit: 'contain', background: 'var(--surface-2)', border: '1px solid var(--rule-strong)', borderRadius: 0 }} />
            )}
            <input
              type="url"
              value={logo}
              onChange={e => setLogo(e.target.value)}
              disabled={isFree}
              placeholder="https://your-cdn.com/logo.png"
              className="ed-input flex-1"
            />
          </div>
        </div>

        {/* Sender email */}
        <div>
          <label className="ed-label">
            From-address for alert emails
            <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--muted-2)', fontWeight: 400 }}> — must be on a Resend-verified domain</span>
          </label>
          <input
            type="email"
            value={sender}
            onChange={e => setSender(e.target.value)}
            disabled={isFree}
            placeholder="alerts@yourdomain.com"
            className="ed-input"
          />
        </div>

        <div className="flex items-center gap-3 pt-3" style={{ borderTop: '1px solid var(--rule)' }}>
          <button onClick={save} disabled={busy || isFree} className="ed-btn ed-btn-primary">
            {busy ? 'Saving…' : 'Save branding'}
          </button>
          {isFree && (
            <a href="/api/billing/checkout" className="ed-mono" style={{ color: 'var(--accent)' }}>
              Upgrade to Pro for white-label
            </a>
          )}
          {msg && <span className="ed-panel-note" style={{ margin: 0 }}>{msg}</span>}
        </div>

        {/* Custom domain section */}
        <div className="pt-4" style={{ borderTop: '1px solid var(--rule)' }}>
          <div className="flex items-center gap-2 mb-1">
            <label className="ed-label" style={{ margin: 0 }}>Custom domain</label>
            {!isFree && <span className="ed-chip">{me.tier}</span>}
          </div>
          <p className="ed-panel-note" style={{ marginBottom: 8 }}>
            Point your own domain at the dashboard. Add a CNAME record from your DNS to <code className="ed-code">{PUBLIC_CLIENT_HOST}</code>;
            once it propagates, that hostname will load with your branding and your data.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="flights.yourcompany.com"
              value={domain}
              onChange={e => setDomain(e.target.value.toLowerCase())}
              disabled={isFree}
              className="ed-input flex-1"
              style={{ fontFamily: 'var(--font-mono-ed)', fontSize: 13 }}
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
              className="ed-btn ed-btn-secondary"
            >
              {domainSaving ? 'Saving…' : (domain ? 'Save domain' : 'Remove')}
            </button>
          </div>
          {domainNote && (
            <div className="ed-subpanel mt-2" style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
              {domainNote}
            </div>
          )}
        </div>

        {/* Billing portal */}
        {!isFree && me.stripe_customer_id && (
          <div className="pt-4" style={{ borderTop: '1px solid var(--rule)' }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>Billing &amp; subscription</div>
                <p className="ed-panel-note" style={{ margin: 0 }}>Manage your card, invoices, and cancel anytime via Stripe.</p>
              </div>
              <a href="/api/billing/portal" className="ed-btn ed-btn-secondary">Open billing portal ↗</a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
