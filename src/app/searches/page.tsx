import { redirect } from 'next/navigation';
import { queries, limitsForUser } from '@/lib/db';
import { SearchForm } from '@/components/SearchForm';
import { QuickRouteSearch } from '@/components/QuickRouteSearch';
import { DraggableSearchList, type SearchEnrichment } from '@/components/DraggableSearchList';
import { PollNowButton } from '@/components/PollNowButton';
import { RefreshDealsButton } from '@/components/RefreshDealsButton';
import { loadDashboard } from '@/lib/dashboard-data';
import { getCurrentUser } from '@/lib/auth';
import { FcPageHead, FcStat, FcStatRow, FcPanel, FcEmpty, FcMoney } from '@/components/fc/PageKit';
import { DepartureBoard, type BoardRow } from '@/components/fc/DepartureBoard';

export const dynamic = 'force-dynamic';

function hoursLabel(min: number): string {
  return min >= 120 ? `${Math.round(min / 60)} hours` : `${min} minutes`;
}

export default async function SearchesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=%2Fsearches');

  // Scoped to the signed-in account. This previously used listSearches(),
  // which returned EVERY account's routes to every signed-in user.
  const searches = queries.listSearchesForUser(user.id);
  const limits = limitsForUser(user);

  const dash = loadDashboard({ userId: user.id });
  const enrichment: Record<number, SearchEnrichment> = {};
  for (const row of dash) {
    enrichment[row.search.id] = {
      perAdultUsd:   row.fare?.price_per_adult_usd ?? null,
      partyTotalUsd: row.fare?.total_price_usd ?? null,
      threshold:     row.threshold,
      history:       row.history,
    };
  }

  // The board is built from the customer's own routes and real recorded
  // fares — it is the hero because it is the thing they came to see.
  const board: BoardRow[] = searches.filter(s => s.active).map(s => {
    const e = enrichment[s.id];
    const hist = e?.history ?? [];
    return {
      id: s.id,
      origin: s.origin,
      destination: s.destination,
      departDate: s.depart_date,
      returnDate: s.return_date,
      perAdultUsd: e?.perAdultUsd ?? null,
      target: e?.threshold ?? null,
      low30: hist.length ? Math.min(...hist.map(h => h.price_per_adult_usd)) : null,
    };
  });

  const active = searches.filter(s => s.active).length;
  const priced = dash.filter(r => r.fare?.price_per_adult_usd != null);
  const cheapest = priced.length
    ? Math.min(...priced.map(r => r.fare!.price_per_adult_usd))
    : null;
  const atOrUnderTarget = dash.filter(
    r => r.fare?.price_per_adult_usd != null && r.threshold != null
      && r.fare.price_per_adult_usd <= r.threshold,
  ).length;
  const remaining = Math.max(0, limits.maxRoutes - active);

  return (
    <div className="space-y-6">
      <FcPageHead
        title="Your watchlist"
        lede={`We check each route every ${hoursLabel(limits.pollIntervalMin)} and email you the moment a fare drops to your target. Set a target per route, or leave it and we use your default.`}
        action={
          <div className="flex items-center gap-2 shrink-0">
            <RefreshDealsButton />
            <PollNowButton label="Check now" />
          </div>
        }
      />

      <FcStatRow>
        <FcStat label="Routes tracked" value={active}
          note={remaining > 0 ? `${remaining} more on your plan` : 'Plan limit reached'} />
        <FcStat label="Checked every" value={limits.pollIntervalMin >= 120 ? `${Math.round(limits.pollIntervalMin / 60)}h` : `${limits.pollIntervalMin}m`}
          note={limits.pollIntervalMin > 60 ? 'Pro checks every 30 minutes' : 'Priority cadence'} />
        <FcStat label="Cheapest right now" value={<FcMoney usd={cheapest} />} accent
          note={cheapest != null ? 'Per adult, across your routes' : 'No fare recorded yet'} />
        <FcStat label="At or under target" value={atOrUnderTarget}
          note={atOrUnderTarget > 0 ? 'Worth booking today' : 'Nothing has hit your target yet'} />
      </FcStatRow>

      <DepartureBoard rows={board} />

      <QuickRouteSearch />
      <SearchForm />

      <FcPanel
        title="Tracked routes"
        note="Drag to reorder. Pause a route to stop checking it without losing its price history."
      >
        {searches.length === 0 ? (
          <FcEmpty
            headline="Nothing tracked yet"
            body="Add a route above and we start recording its price immediately. The longer we watch, the better we can tell you whether today's fare is actually cheap."
          />
        ) : (
          <DraggableSearchList searches={searches} enrichment={enrichment} />
        )}
      </FcPanel>
    </div>
  );
}
