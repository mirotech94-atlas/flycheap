import 'server-only';
import { providerCatalog } from '@/lib/ai/providers';

/**
 * "AI providers" section for /integrations — the live failover chain.
 *
 * Reads the shared registry (src/lib/ai/providers.ts), the same source the chat
 * routes build their chain from, so this can never drift from what actually
 * runs. A provider is in the chain only when its key is configured; the first
 * configured one is Primary and the rest are numbered fallbacks in `order`.
 *
 * `ownerView` reveals the env-var hints for dormant providers. That's
 * operational detail, and /integrations is publicly reachable — everyone sees
 * the chain and its health, only the owner sees how to enable what's missing.
 */
export function AiProviderChain({ ownerView = false }: { ownerView?: boolean }) {
  const all = providerCatalog().sort((a, b) => a.order - b.order);
  const live = all.filter(p => p.configured);
  const dormant = all.filter(p => !p.configured);
  const modelCount = live.reduce((n, p) => n + Math.min(2, p.models.length), 0);

  return (
    <section className="ed-panel">
      <div className="ed-eyebrow" style={{ marginBottom: 4 }}>Always answering</div>
      <h2 className="ed-h2">AI providers &amp; automatic failover</h2>
      <p className="ed-panel-note" style={{ maxWidth: '62ch', marginBottom: 16 }}>
        FarePilot never depends on a single AI vendor. Requests walk this chain in order &mdash;
        free tiers first &mdash; and if one is rate-limited, down, or out of quota, the next one
        picks the request up automatically. No error reaches you unless every tier fails.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <span className="ed-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span className="ed-dot" aria-hidden /> {live.length} live
        </span>
        <span className="ed-chip">{modelCount} models in chain</span>
        {dormant.length > 0 && <span className="ed-chip">{dormant.length} dormant</span>}
      </div>

      {/* The chain, in the order requests actually try it. */}
      <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {live.map((p, i) => (
          <li key={p.id}>
            <div className={i === 0 ? 'ed-subpanel accent' : 'ed-subpanel'} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span
                className="ed-mono"
                style={{ flexShrink: 0, marginTop: 1, color: i === 0 ? 'var(--ink)' : 'var(--muted-2)' }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 15, fontWeight: 400, color: 'var(--ink)' }}>{p.label}</h3>
                  {i === 0
                    ? <span className="ed-chip active">Primary</span>
                    : <span className="ed-chip">Fallback {i}</span>}
                </div>
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {p.models.slice(0, 2).map(m => (
                    <code key={m} className="ed-code">{m}</code>
                  ))}
                </div>
              </div>
              <span style={{ flexShrink: 0, marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: 'var(--green)' }}>
                <span className="ed-dot" aria-hidden />
                Ready
              </span>
            </div>
            {i < live.length - 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 30, paddingTop: 6, paddingBottom: 6, fontSize: 11, color: 'var(--muted-2)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M19 12l-7 7-7-7" />
                </svg>
                if it fails or is rate-limited
              </div>
            )}
          </li>
        ))}
      </ol>

      {dormant.length > 0 && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--rule)' }}>
          <div className="ed-eyebrow" style={{ marginBottom: 8 }}>Available, not enabled</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {dormant.map(p => (
              <span
                key={p.id}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  border: '1px dashed var(--rule-strong)', padding: '5px 12px',
                  fontSize: 12, color: 'var(--muted)',
                }}
                title={ownerView ? (p.note ?? undefined) : undefined}
              >
                <span className="ed-dot muted" aria-hidden />
                {p.label}
              </span>
            ))}
          </div>
          {ownerView && (
            <ul style={{ marginTop: 10, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
              {dormant.filter(p => p.note).map(p => (
                <li key={p.id} style={{ fontSize: 11, color: 'var(--muted-2)' }}>
                  <span style={{ fontWeight: 600, color: 'var(--muted)' }}>{p.label}:</span> {p.note}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p style={{ fontSize: 11, color: 'var(--muted-2)', marginTop: 16, lineHeight: 1.6 }}>
        A request that has already changed something (added a route, sent a report) never replays on
        the next provider &mdash; FarePilot stops and tells you, so nothing happens twice.
      </p>
    </section>
  );
}
