import 'server-only';

export type ProviderId = 'travelpayouts' | 'amadeus' | 'serpapi' | 'duffel' | 'kiwi' | 'searchapi';

export type StopsPref = 'all' | 'nonstop' | 'one-stop' | 'two-plus';

export type SearchParams = {
  origin: string;
  destination: string;
  departDate: string;        // YYYY-MM-DD
  returnDate: string;        // YYYY-MM-DD
  adults: number;
  infants: number;
  /** Optional stops preference; providers should honour it natively when possible. */
  stops?: StopsPref;
  /** Optional airline filter (IATA, e.g. "MS"). Default: app filters in caller. */
  airline?: string | null;
};

// Unified offer shape every provider returns.
export type Offer = {
  provider: ProviderId;
  per_adult_usd: number;
  total_party_usd: number;
  outbound_flight_no: string;
  return_flight_no: string;
  outbound_depart_iso: string | null;
  return_depart_iso: string | null;
  outbound_transfers: number;
  return_transfers: number;
  airline: string;            // e.g. "MS"
  raw: unknown;
};

export type ProviderResult =
  | { provider: ProviderId; ok: true;  offers: Offer[]; status: number; ms: number; note?: string }
  | { provider: ProviderId; ok: false; error: string;   status: number; ms: number };

export interface FlightProvider {
  id: ProviderId;
  label: string;
  configHint: string;        // shown in settings if missing keys
  isConfigured: () => boolean;
  search: (p: SearchParams) => Promise<ProviderResult>;
}
