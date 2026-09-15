'use client';

// Curated destination catalog for the destination dropdowns (Hotels, Airbnbs).
// Grouped so users land on resort destinations (Sharm, Hurghada, Marsa Alam,
// Maldives, Cancun, etc.) without having to type IATA codes. Each entry's
// code maps via `hotelCityForDestination()` to a plain city name accepted by
// Hotellook's /search endpoint. Adding a new code? Mirror it in lib/affiliate.ts
// IATA_TO_CITY_FOR_HOTEL or the link will silently fall back to the raw token.
export const DEST_GROUPS: Array<{ label: string; items: Array<{ code: string; name: string; tag?: string }> }> = [
  {
    label: 'Egypt · sun & sea',
    items: [
      { code: 'SSH', name: 'Sharm El Sheikh', tag: 'All-inclusive' },
      { code: 'HRG', name: 'Hurghada', tag: 'All-inclusive' },
      { code: 'RMF', name: 'Marsa Alam', tag: 'Diving' },
      { code: 'CAI', name: 'Cairo' },
      { code: 'LXR', name: 'Luxor' },
      { code: 'ASW', name: 'Aswan' },
      { code: 'HBE', name: 'Alexandria' },
    ],
  },
  {
    label: 'Beach & islands',
    items: [
      { code: 'MLE', name: 'Maldives' },
      { code: 'DPS', name: 'Bali' },
      { code: 'HKT', name: 'Phuket' },
      { code: 'CUN', name: 'Cancun' },
      { code: 'PUJ', name: 'Punta Cana' },
      { code: 'NAS', name: 'Nassau, Bahamas' },
      { code: 'OGG', name: 'Maui' },
      { code: 'HNL', name: 'Honolulu' },
    ],
  },
  {
    label: 'Mediterranean',
    items: [
      { code: 'JTR', name: 'Santorini' },
      { code: 'JMK', name: 'Mykonos' },
      { code: 'CFU', name: 'Corfu' },
      { code: 'HER', name: 'Crete' },
      { code: 'RHO', name: 'Rhodes' },
      { code: 'PMI', name: 'Mallorca' },
      { code: 'IBZ', name: 'Ibiza' },
      { code: 'TFS', name: 'Tenerife' },
      { code: 'AYT', name: 'Antalya' },
      { code: 'BJV', name: 'Bodrum' },
      { code: 'LCA', name: 'Larnaca, Cyprus' },
      { code: 'PFO', name: 'Paphos, Cyprus' },
    ],
  },
  {
    label: 'City breaks',
    items: [
      { code: 'DXB', name: 'Dubai' },
      { code: 'IST', name: 'Istanbul' },
      { code: 'LON', name: 'London' },
      { code: 'PAR', name: 'Paris' },
      { code: 'ROM', name: 'Rome' },
      { code: 'BCN', name: 'Barcelona' },
      { code: 'AMS', name: 'Amsterdam' },
      { code: 'NYC', name: 'New York' },
      { code: 'TYO', name: 'Tokyo' },
      { code: 'BKK', name: 'Bangkok' },
      { code: 'SIN', name: 'Singapore' },
    ],
  },
];

// Flat lookup so we can label the currently-selected option with its city
// name even when the user came in via a tracked-search shortcut.
export const DEST_LABEL_BY_CODE: Record<string, string> = (() => {
  const r: Record<string, string> = {};
  for (const g of DEST_GROUPS) for (const it of g.items) r[it.code] = it.name;
  return r;
})();

const DEFAULT_CLASSNAME = 'w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700';

/**
 * Grouped destination `<select>` shared by the Hotels and Airbnbs search
 * panels: tracked routes first (so the user's pinned destinations are one
 * click away), then curated resort/beach/city groups. Controlled when
 * `onChange` is passed (Hotels, which keeps grid/chart/globe in sync);
 * otherwise renders as a plain uncontrolled `<select name=...>` so it can sit
 * inside a native GET `<form>` (Airbnbs) with no client state required.
 */
export function DestinationSelect({
  name,
  value,
  trackedDestinations,
  onChange,
  id,
  className,
}: {
  name: string;
  value: string;
  trackedDestinations: string[];
  onChange?: (v: string) => void;
  id?: string;
  className?: string;
}) {
  const valueProps = onChange
    ? { value, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value) }
    : { defaultValue: value };

  return (
    <select id={id} name={name} className={className ?? DEFAULT_CLASSNAME} {...valueProps}>
      {trackedDestinations.length > 0 && (
        <optgroup label="Your tracked routes">
          {Array.from(new Set(trackedDestinations)).map(d => (
            <option key={`t-${d}`} value={d}>
              {d}{DEST_LABEL_BY_CODE[d] ? ` — ${DEST_LABEL_BY_CODE[d]}` : ''}
            </option>
          ))}
        </optgroup>
      )}
      {DEST_GROUPS.map(g => (
        <optgroup key={g.label} label={g.label}>
          {g.items.map(it => (
            <option key={`${g.label}-${it.code}`} value={it.code}>
              {it.name} ({it.code}){it.tag ? ` · ${it.tag}` : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
