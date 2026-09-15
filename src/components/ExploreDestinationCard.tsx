'use client';

import { fmtUSD, fmtDate } from '@/lib/utils';
import { BookButton } from '@/components/BookButton';

/**
 * Top-destination card on /explore.
 *
 * Previously a plain <Link> back to /explore?from=...&to=... — which led
 * nowhere useful since /explore doesn't filter on `?to=`. Now displays the
 * destination + price + dates, with the same provider-dropdown BookButton
 * used everywhere else so users can compare across Aviasales / Google /
 * Kayak / Skyscanner / Momondo / EgyptAir direct.
 */
export function ExploreDestinationCard({
  origin,
  destination,
  destinationName,
  price,
  departAt,
  returnAt,
  index,
}: {
  origin: string;
  destination: string;
  destinationName: string;
  price: number;
  departAt: string | null;
  returnAt: string | null;
  index: number;
}) {
  const dep = (departAt ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  // If we don't have a return date in the cached "directions" row, assume a
  // one-week window — it's a placeholder for the provider deep-link so the
  // user lands on a sensible search, not a one-way same-day result.
  const ret = returnAt
    ? returnAt.slice(0, 10)
    : new Date(new Date(dep).getTime() + 7 * 86400000).toISOString().slice(0, 10);

  return (
    <div
      className="card !p-3 hover:!shadow-lift hover:-translate-y-0.5 transition-all motion-fade-in flex flex-col gap-2"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <div className="text-[10px] uppercase tracking-[0.14em] font-semibold text-slate-400">
        {origin} → {destination}
      </div>
      <div className="font-display font-bold text-base text-slate-900 dark:text-white truncate">
        {destinationName}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-lg font-bold tabular text-emerald-700 dark:text-emerald-400">
          {fmtUSD(price)}
        </span>
        <span className="text-[10px] text-slate-500">from</span>
      </div>
      {departAt && (
        <div className="text-[10px] text-slate-500 truncate">
          {fmtDate(dep)}
          {returnAt && ` → ${fmtDate(returnAt.slice(0, 10))}`}
        </div>
      )}
      <div className="mt-1">
        <BookButton
          origin={origin}
          destination={destination}
          departDate={dep}
          returnDate={ret}
          adults={1}
          infants={0}
          size="sm"
          perAdultUsd={price}
          surface="explore-page"
        />
      </div>
    </div>
  );
}
