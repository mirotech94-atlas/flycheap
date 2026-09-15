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

function offsetIsoDate(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default async function OffersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const enabled = (queries.getSetting('enabled_providers') ?? 'travelpayouts').split(',').map(s => s.trim()).filter(Boolean);
  const statuses = providerStatuses();

  const origin = firstParam(params?.origin) ?? 'JFK,EWR';
  const destination = firstParam(params?.destination) ?? 'CAI';
  const departDate = firstParam(params?.departDate) ?? offsetIsoDate(30);
  const returnDate = firstParam(params?.returnDate) ?? offsetIsoDate(44);
  const adults = Number(firstParam(params?.adults) ?? '4') || 4;
  const infants = Number(firstParam(params?.infants) ?? '1') || 1;
  const stops = (firstParam(params?.stops) ?? 'one-stop') as any;
  const show = (firstParam(params?.show) ?? 'all') as any;
  const shouldSearchOnMount = Boolean(params?.origin || params?.destination || params?.departDate || params?.returnDate);

  return (
    <div className="space-y-6">
      {/* HERO — Kayak-style search page header */}
      <section className="relative rounded-3xl bg-brand-gradient text-white border border-slate-200/60 dark:border-slate-700/60 overflow-hidden motion-fade-in">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-brand-gold/25 blur-3xl" />
          <div className="absolute -bottom-16 -left-16 w-72 h-72 rounded-full bg-brand-400/20 blur-3xl" />
        </div>
        <div className="relative px-8 py-8 md:py-10">
          <div className="eyebrow !text-white/70 mb-1">Live multi-provider search</div>
          <h1 className="font-display font-extrabold text-3xl md:text-4xl tracking-tight">
            Compare fares,{' '}
            <span className="text-brand-gold">every provider at once</span>
          </h1>
          <p className="text-white/75 mt-2 max-w-xl text-sm">
            Pulls live results from Aviasales, Google Flights, and more in a single query — so you
            see the cheapest price across providers without hopping between tabs.
            For ongoing price alerts, use{' '}
            <a href="/searches" className="underline underline-offset-2 hover:text-white transition">Tracked Searches</a>.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-white/60">
            <span>{enabled.length} provider{enabled.length !== 1 ? 's' : ''} active</span>
            <span className="hidden sm:inline text-white/30">·</span>
            <span>Nonstop &amp; 1-stop filter</span>
            <span className="hidden sm:inline text-white/30">·</span>
            <span>EgyptAir, Aviasales, Google Flights</span>
          </div>
        </div>
      </section>

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
