import 'server-only';
import { queries } from '../db';
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

export async function searchProviders(p: SearchParams, ids: ProviderId[]): Promise<{
  offers: Offer[];
  results: ProviderResult[];
}> {
  const active = ALL_PROVIDERS.filter(pr => ids.includes(pr.id) && pr.isConfigured());
  if (active.length === 0) {
    // Fall back to travelpayouts if nothing is configured (back-compat).
    if (travelpayoutsProvider.isConfigured()) {
      const r = await travelpayoutsProvider.search(p);
      return { offers: r.ok ? r.offers : [], results: [r] };
    }
    return { offers: [], results: [] };
  }

  const results = await Promise.all(active.map(pr => pr.search(p).catch(e => ({
    provider: pr.id, ok: false as const, error: (e as Error).message, status: 0, ms: 0,
  }))));

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
export async function searchAllProviders(p: SearchParams): Promise<{
  offers: Offer[];
  results: ProviderResult[];
}> {
  const ids = enabledProviderIds();
  return searchProviders(p, ids);
}

export type { Offer, ProviderId, ProviderResult, SearchParams };
