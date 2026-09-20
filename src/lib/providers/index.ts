import 'server-only';
import { queries } from '../db';
import { costPerCall, routeKey } from '../providerCost';
import { travelpayoutsProvider } from './travelpayouts';
import { amadeusProvider } from './amadeus';
import { serpapiProvider } from './serpapi';
import { duffelProvider } from './duffel';
import { kiwiProvider } from './kiwi';
import { searchapiProvider } from './searchapi';
import type { FlightProvider, Offer, ProviderId, ProviderResult, SearchParams } from './types';

export const ALL_PROVIDERS: FlightProvider[] = [
  travelpayoutsProvider,
  amadeusProvider,
  serpapiProvider,
  searchapiProvider,
  duffelProvider,
  kiwiProvider,
];

export function getProvider(id: ProviderId): FlightProvider | undefined {
  return ALL_PROVIDERS.find(p => p.id === id);
}

export function enabledProviderIds(): ProviderId[] {
  const raw = queries.getSetting('enabled_providers') ?? 'travelpayouts';
  return raw.split(',').map(s => s.trim()).filter(Boolean) as ProviderId[];
}

export function providerStatuses() {
  const enabled = new Set(enabledProviderIds());
  return ALL_PROVIDERS.map(p => ({
    id: p.id,
    label: p.label,
    configHint: p.configHint,
    isConfigured: p.isConfigured(),
    isEnabled: enabled.has(p.id),
  }));
}

/**
 * Record one api_calls row PER PROVIDER, with the cost frozen on.
 *
 * Before this, a fan-out across four providers wrote a single aggregate row
 * with no provider attached, which made "provider API cost per tracked route
 * per month" — the dominant COGS number and the first of the three metrics the
 * monetization spec demands before anything else gets built — literally
 * uncomputable. Logging here rather than at each call site means every path
 * into a provider (poll, on-demand search, pre-send verification, click-time
 * re-query) is costed the same way, automatically.
 */
function logProviderCalls(p: SearchParams, results: ProviderResult[], ctx?: PollContext): void {
  const key = routeKey(p);
  for (const r of results) {
    try {
      queries.logApiCall({
        search_id: ctx?.searchId ?? null,
        ok: r.ok,
        status_code: r.status,
        ms: r.ms,
        error: r.ok ? undefined : r.error,
        provider: r.provider,
        // Only a call that actually reached the provider costs money. A local
        // throw (status 0) never billed us and must not inflate COGS.
        cost_usd: r.status > 0 ? costPerCall(r.provider) : 0,
        phase: ctx?.phase ?? 'sweep',
        band: ctx?.band ?? null,
        route_key: key,
      });
    } catch (e) {
      // Cost accounting must never break a search.
      console.error('[providers] logApiCall failed', (e as Error).message);
    }
  }
}

/** Where this fan-out came from, so spend can be attributed per route and phase. */
export type PollContext = {
  searchId?: number | null;
  phase?: 'sweep' | 'verify' | 'ondemand' | 'click';
  band?: string | null;
};

export async function searchProviders(
  p: SearchParams,
  ids: ProviderId[],
  ctx?: PollContext,
): Promise<{
  offers: Offer[];
  results: ProviderResult[];
}> {
  const active = ALL_PROVIDERS.filter(pr => ids.includes(pr.id) && pr.isConfigured());
  if (active.length === 0) {
    // Fall back to travelpayouts if nothing is configured (back-compat).
    if (travelpayoutsProvider.isConfigured()) {
      const r = await travelpayoutsProvider.search(p);
      logProviderCalls(p, [r], ctx);
      return { offers: r.ok ? r.offers : [], results: [r] };
    }
    return { offers: [], results: [] };
  }

  const results = await Promise.all(active.map(pr => pr.search(p).catch(e => ({
    provider: pr.id, ok: false as const, error: (e as Error).message, status: 0, ms: 0,
  }))));

  logProviderCalls(p, results, ctx);

  const merged: Offer[] = [];
  for (const r of results) if (r.ok) merged.push(...r.offers);
  merged.sort((a, b) => a.per_adult_usd - b.per_adult_usd);
  return { offers: merged, results };
}

/**
 * Fan out the same search across every enabled & configured provider in parallel,
 * merge their offers, and rank by per-adult price. Each offer is tagged with its
 * source so the dashboard can show "Amadeus says $865, Travelpayouts says $920".
 */
export async function searchAllProviders(p: SearchParams, ctx?: PollContext): Promise<{
  offers: Offer[];
  results: ProviderResult[];
}> {
  const ids = enabledProviderIds();
  return searchProviders(p, ids, ctx);
}

export type { Offer, ProviderId, ProviderResult, SearchParams };
