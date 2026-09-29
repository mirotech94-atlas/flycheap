// Shared client-side helpers for the pinned-deals tray.
// State lives in localStorage so it persists across reloads with no backend.

export type PinnedDeal = {
  key: string;                  // origin|outbound_date|return_date
  origin: string;
  outbound_date: string;
  return_date: string;
  trip_length_days: number;
  per_adult_usd: number;
  party_total_usd: number;
  outbound_flight_no: string;
  return_flight_no: string;
  outbound_dow: number;
  outbound_hour: number;
  return_dow: number;
  return_hour: number;
  /** Present on deals pinned from multi-destination views; older pins omit them. */
  destination?: string;
  outbound_transfers?: number | null;
  return_transfers?: number | null;
};

export const PIN_LIMIT = 3;
export const PIN_KEY = 'egyptair-pinned-v1';
export const PIN_EVENT = 'egyptair:pins-changed';

export function dealKey(d: { origin: string; outbound_date: string; return_date: string }) {
  return `${d.origin}|${d.outbound_date}|${d.return_date}`;
}

export function loadPins(): PinnedDeal[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PIN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, PIN_LIMIT) : [];
  } catch { return []; }
}

export function savePins(pins: PinnedDeal[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PIN_KEY, JSON.stringify(pins.slice(0, PIN_LIMIT)));
  window.dispatchEvent(new CustomEvent(PIN_EVENT));
}

export function togglePin(deal: PinnedDeal): PinnedDeal[] {
  const current = loadPins();
  const exists = current.find(p => p.key === deal.key);
  const next = exists
    ? current.filter(p => p.key !== deal.key)
    : [...current, deal].slice(0, PIN_LIMIT);
  savePins(next);
  return next;
}
