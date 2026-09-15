import { queries } from '@/lib/db';
import { fmtDate } from '@/lib/utils';
import { PieCard } from '@/components/charts';
import { SearchForm } from '@/components/SearchForm';
import { QuickRouteSearch } from '@/components/QuickRouteSearch';
import { DraggableSearchList, type SearchEnrichment } from '@/components/DraggableSearchList';
import { PollNowButton } from '@/components/PollNowButton';
import { RefreshDealsButton } from '@/components/RefreshDealsButton';
import { loadDashboard } from '@/lib/dashboard-data';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function SearchesPage() {
  const sessionUser = await getCurrentUser();
  const searches = queries.listSearches();
  const callsBySearch = queries.apiCallsByMonthBySearch();

  // Per-row enrichment: current cheapest fare + 30-day price history + threshold.
  // The Sparkline + Book button per row depend on this map.
  const dash = loadDashboard({ userId: sessionUser?.id });
  const enrichment: Record<number, SearchEnrichment> = {};
  for (const row of dash) {
    enrichment[row.search.id] = {
      perAdultUsd:   row.fare?.price_per_adult_usd ?? null,
      partyTotalUsd: row.fare?.total_price_usd ?? null,
      threshold:     row.threshold,
      history:       row.history,
    };
  }

  const pie = callsBySearch
    .filter(c => c.count > 0)
    .map(c => ({
      name: `#${c.id} ${c.origin} · ${fmtDate(c.depart_date)}`,
      value: c.count,
    }));

  return (
    <div className="space-y-6">
      {/* HERO — Kayak-style watchlist page header */}
      <section className="relative rounded-3xl bg-brand-gradient text-white border border-slate-200/60 dark:border-slate-700/60 overflow-hidden motion-fade-in">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-brand-gold/25 blur-3xl" />
          <div className="absolute -bottom-16 -left-16 w-72 h-72 rounded-full bg-brand-400/20 blur-3xl" />
        </div>
        <div className="relative px-8 py-8 md:py-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="eyebrow !text-white/70 mb-1">Watchlist</div>
            <h1 className="font-display font-extrabold text-3xl md:text-4xl tracking-tight">
              Tracked searches,{' '}
              <span className="text-brand-gold">polled hourly</span>
            </h1>
            <p className="text-white/75 mt-2 max-w-xl text-sm">
              Every route below is checked every hour. The moment a fare drops below your threshold,
              we alert you — across email, Telegram, and Slack.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-white/60">
              <span>{searches.length} route{searches.length !== 1 ? 's' : ''} tracked</span>
              <span className="hidden sm:inline text-white/30">·</span>
              <span>Polled every ~30 minutes</span>
              <span className="hidden sm:inline text-white/30">·</span>
              <span>1,000+ airlines worldwide</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <RefreshDealsButton />
            <PollNowButton label="Poll all now" />
          </div>
        </div>
      </section>

      {/* Quick-add: free-form Track or Live-search jump */}
      <QuickRouteSearch />

      {/* Full form with airport autocomplete, date pickers, party size */}
      <SearchForm />

      {/* Drag-to-reorder tracked searches with per-row actions (snooze/pause/delete) */}
      <div className="card overflow-x-auto">
        <h2>All searches</h2>
        {searches.length === 0 ? (
          <div className="text-sm text-slate-400 py-6 text-center">None yet — add one above.</div>
        ) : (
          <DraggableSearchList searches={searches} enrichment={enrichment} />
        )}
      </div>

      {/* API-calls mini-chart by search this month */}
      <PieCard
        title="API calls this month — by search"
        data={pie}
        valueLabel="Calls"
      />
    </div>
  );
}
