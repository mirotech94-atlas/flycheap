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
    <div className="ed-tile motion-fade-in" style={{ animationDelay: `${index * 30}ms` }}>
      <div className="ed-tile-kicker">{origin} → {destination}</div>
      <div className="ed-tile-value" style={{ fontSize: 16 }}>{destinationName}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <span style={{ fontFamily: 'var(--font-mono-ed)', fontWeight: 600, fontSize: 16, color: 'var(--ink)' }}>
          {fmtUSD(price)}
        </span>
        <span className="ed-tile-meta" style={{ fontSize: 10.5 }}>from</span>
      </div>
      {departAt && (
        <div className="ed-tile-meta">
          {fmtDate(dep)}
          {returnAt && ` → ${fmtDate(returnAt.slice(0, 10))}`}
        </div>
      )}
      <div style={{ marginTop: 'auto' }}>
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
