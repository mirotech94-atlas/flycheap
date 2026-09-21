'use client';

import { useEffect, useState } from 'react';

/**
 * Universal-link landing for the FlyCheap mobile magic link.
 *
 * When the app IS installed, iOS/Android intercept `https://my.flycheap.live/m/verify?token=…`
 * and open the app directly — this page never renders. When the app is NOT installed,
 * the browser loads this page. It deliberately does NOT call /api/v1/auth/verify (that token
 * is single-use and belongs to the app); it just bounces the token to the custom scheme and,
 * failing that, tells the user to install the app or sign in on the web.
 */
export default function MobileVerifyPage() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token');
    setToken(t);
    if (t) {
      // Best-effort: try to hand off to the installed app via custom scheme.
      window.location.href = `flycheap://verify?token=${encodeURIComponent(t)}`;
    }
  }, []);

  return (
    <main style={{ fontFamily: 'var(--font-ui)', maxWidth: 480, margin: '0 auto', padding: 32, color: 'var(--ink)', textAlign: 'center' }}>
      <div className="ed-eyebrow" style={{ display: 'inline-block', background: 'var(--surface-2)', color: 'var(--accent)', padding: '6px 12px', marginBottom: 16 }}>FlyCheap</div>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 26, margin: '0 0 8px', color: 'var(--ink)' }}>Opening the app…</h1>
      <p style={{ color: 'var(--ink-soft)', margin: '0 0 24px' }}>
        If the FlyCheap app is installed, it should open automatically and sign you in.
      </p>
      {token && (
        <a
          href={`flycheap://verify?token=${encodeURIComponent(token)}`}
          className="ed-btn ed-btn-primary"
          style={{ padding: '14px 28px' }}
        >
          Open in the FlyCheap app
        </a>
      )}
      <p style={{ color: 'var(--muted)', margin: '24px 0 0', fontSize: 13 }}>
        Don&apos;t have the app yet? You can also{' '}
        <a href="/login" style={{ color: 'var(--accent)', fontWeight: 600 }}>sign in on the web</a>.
      </p>
    </main>
  );
}
