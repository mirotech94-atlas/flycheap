import Link from 'next/link';
import { queries } from '@/lib/db';
import { providerStatuses } from '@/lib/providers';
import { OffersExplorer } from '@/components/OffersExplorer';
import { FcPageHead } from '@/components/fc/PageKit';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function offsetIsoDate(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default async function OffersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const enabled = (queries.getSetting('enabled_providers') ?? 'travelpayouts').split(',').map(s => s.trim()).filter(Boolean);
  const statuses = providerStatuses();
  // Name the providers actually enabled. The previous copy promised
  // "Aviasales, Google Flights and more" regardless of configuration — a
  // claim to customers that stopped being true when duffel/serpapi were
  // switched off.
  const PROVIDER_LABEL: Record<string, string> = {
    travelpayouts: 'Aviasales', duffel: 'Duffel', serpapi: 'Google Flights',
    searchapi: 'Google Flights', amadeus: 'Amadeus', kiwi: 'Kiwi',
  };
  const providerNames = Array.from(new Set(enabled.map(p => PROVIDER_LABEL[p] ?? p))).join(', ') || 'no providers enabled';

  const origin = firstParam(params?.origin) ?? 'JFK,EWR';
  const destination = firstParam(params?.destination) ?? 'CAI';
  const departDate = firstParam(params?.departDate) ?? offsetIsoDate(30);
  const returnDate = firstParam(params?.returnDate) ?? offsetIsoDate(44);
  const adults = Number(firstParam(params?.adults) ?? '1') || 1;
  const infants = Number(firstParam(params?.infants) ?? '0') || 0;
  const stops = (firstParam(params?.stops) ?? 'one-stop') as any;
  const show = (firstParam(params?.show) ?? 'all') as any;
  const shouldSearchOnMount = Boolean(params?.origin || params?.destination || params?.departDate || params?.returnDate);

  return (
    <div>
      <FcPageHead
        title="Search live fares"
        lede={`A one-off search across every fare source we have switched on right now (${providerNames}). For a route you want watched over time, track it instead and we will tell you when it drops.`}
        action={<Link href="/searches" className="ed-btn ed-btn-secondary">Track a route</Link>}
      />

      <OffersExplorer
        hideForm={false}
        searchOnMount={shouldSearchOnMount}
        initial={{
          enabledProviders: enabled,
          providerStatuses: statuses.map(s => ({ ...s, isEnabled: enabled.includes(s.id) })),
          form: {
            origin,
            destination,
            departDate,
            returnDate,
            adults,
            infants,
            stops,
            show,
          },
        }}
      />
    </div>
  );
}
