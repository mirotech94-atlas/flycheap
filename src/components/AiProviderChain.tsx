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
    <section className="card motion-slide-up">
      <div className="eyebrow mb-1">Always answering</div>
      <h2 className="!mb-1">AI providers &amp; automatic failover</h2>
      <p className="text-sm text-slate-500 mb-4 max-w-2xl">
        FarePilot never depends on a single AI vendor. Requests walk this chain in order &mdash;
        free tiers first &mdash; and if one is rate-limited, down, or out of quota, the next one
        picks the request up automatically. No error reaches you unless every tier fails.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-5 text-xs">
        <span className="badge badge-success">{live.length} live</span>
        <span className="badge badge-muted">{modelCount} models in chain</span>
        {dormant.length > 0 && <span className="badge badge-muted">{dormant.length} dormant</span>}
      </div>

      {/* The chain, in the order requests actually try it. */}
      <ol className="space-y-0">
        {live.map((p, i) => (
          <li key={p.id}>
            <div className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5">
              <span
                className={`shrink-0 mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-full text-[12px] font-bold ${
                  i === 0
                    ? 'bg-brand text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300'
                }`}
              >
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="!mb-0 text-[15px] font-semibold text-slate-900 dark:text-white">{p.label}</h3>
                  {i === 0
                    ? <span className="badge badge-success">Primary</span>
                    : <span className="badge badge-muted">Fallback {i}</span>}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {p.models.slice(0, 2).map(m => (
                    <code
                      key={m}
                      className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                    >
                      {m}
                    </code>
                  ))}
                </div>
              </div>
              <span className="shrink-0 mt-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Ready
              </span>
            </div>
            {i < live.length - 1 && (
              <div className="flex items-center gap-2 pl-[26px] py-1.5 text-[11px] text-slate-400">
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
        <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Available, not enabled
          </div>
          <div className="flex flex-wrap gap-2">
            {dormant.map(p => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-slate-300 dark:border-slate-700 px-3 py-1 text-xs text-slate-500"
                title={ownerView ? (p.note ?? undefined) : undefined}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                {p.label}
              </span>
            ))}
          </div>
          {ownerView && (
            <ul className="mt-3 space-y-1">
              {dormant.filter(p => p.note).map(p => (
                <li key={p.id} className="text-[11px] text-slate-400">
                  <span className="font-semibold text-slate-500">{p.label}:</span> {p.note}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
        A request that has already changed something (added a route, sent a report) never replays on
        the next provider &mdash; FarePilot stops and tells you, so nothing happens twice.
      </p>
    </section>
  );
}
