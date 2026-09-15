import { queries } from '@/lib/db';
import { providerStatuses } from '@/lib/providers';
import { OffersExplorer } from '@/components/OffersExplorer';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function OffersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const enabled = (queries.getSetting('enabled_providers') ?? 'travelpayouts').split(',').map(s => s.trim()).filter(Boolean);
  const statuses = providerStatuses();

  const origin = firstParam(params?.origin) ?? 'JFK,EWR';
  const destination = firstParam(params?.destination) ?? 'CAI';
  const departDate = firstParam(params?.departDate) ?? '2026-07-12';
  const returnDate = firstParam(params?.returnDate) ?? '2026-08-28';
  const adults = Number(firstParam(params?.adults) ?? '4') || 4;
  const infants = Number(firstParam(params?.infants) ?? '1') || 1;
  const stops = (firstParam(params?.stops) ?? 'one-stop') as any;
  const show = (firstParam(params?.show) ?? 'all') as any;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="eyebrow mb-1">Live multi-provider search</div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Offers</h1>
          <p className="text-sm text-slate-500 mt-1">
            Pulls results from your enabled providers (including Google Flights via SerpAPI) and lets you filter by stops.
          </p>
        </div>
      </div>

      <OffersExplorer
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
