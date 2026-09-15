'use client';

import { useEffect, useState } from 'react';

/**
 * Universal-link landing for the FlyCheap mobile magic link.
 *
 * When the app IS installed, iOS/Android intercept `https://flycheap.18dn.com/m/verify?token=…`
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
    <main style={{ fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif', maxWidth: 480, margin: '0 auto', padding: 32, color: '#0f172a', textAlign: 'center' }}>
      <div style={{ display: 'inline-block', background: '#eef4fb', color: '#0a3a6b', fontWeight: 700, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', padding: '6px 12px', borderRadius: 999, marginBottom: 16 }}>FlyCheap</div>
      <h1 style={{ fontSize: 26, margin: '0 0 8px', color: '#0a3a6b' }}>Opening the app…</h1>
      <p style={{ color: '#475569', margin: '0 0 24px' }}>
        If the FlyCheap app is installed, it should open automatically and sign you in.
      </p>
      {token && (
        <a
          href={`flycheap://verify?token=${encodeURIComponent(token)}`}
          style={{ display: 'inline-block', background: '#0a3a6b', color: '#fff', padding: '14px 28px', borderRadius: 10, textDecoration: 'none', fontWeight: 700 }}
        >
          Open in the FlyCheap app
        </a>
      )}
      <p style={{ color: '#94a3b8', margin: '24px 0 0', fontSize: 13 }}>
        Don&apos;t have the app yet? You can also{' '}
        <a href="/login" style={{ color: '#0a3a6b', fontWeight: 600 }}>sign in on the web</a>.
      </p>
    </main>
  );
}
