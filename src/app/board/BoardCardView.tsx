import Link from 'next/link';
import type { BoardCard } from '@/lib/boardCard';
import type { AffiliateSurface } from '@/lib/affiliate';
import { bookingLink } from '@/lib/utils';
import { buildPartnerLink, routeIdFor } from '@/lib/partnerLink';

/**
 * One card on the board.
 *
 * Every decision this renders — which state, which single action, what the one
 * line under the verdict says — was made in lib/boardCard.ts, which is pure and
 * tested. This file only draws it.
 */

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

const fmtDate = (d: string | null) => {
  if (!d) return null;
  const t = Date.parse(`${d.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(t)
    ? d
    : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

export function bookHref(card: BoardCard, surface: AffiliateSurface): string {
  const w = card.watch;
  const deeplink = bookingLink({
    origin: card.origin,
    destination: card.destination,
    departDate: card.departDate,
    returnDate: card.returnDate ?? '',
    adults: w.pax.adults,
    infants: w.pax.infants,
  });
  // Through the one builder. A hand-rolled /go query carries no sub_id and no
  // product, so its clicks drop out of every segment in the funnel.
  return buildPartnerLink({
    partner: 'aviasales', product: 'flight', deeplink,
    context: {
      surface,
      routeId: routeIdFor({
        origin: card.origin, destination: card.destination,
        departDate: card.departDate, returnDate: card.returnDate,
      }),
      searchId: card.id,
      verdict: card.verdict?.verdict ?? null,
      confidencePct: card.anatomy?.confidencePct ?? null,
      priceShownUsd: card.perAdultUsd ?? undefined,
    },
  });
}

/** Where today's price sits in its own 30-day range. Per adult, and says so. */
export function RangeBar({ card }: { card: BoardCard }) {
  if (!card.range30) return null;
  const { low, high, current, positionPct } = card.range30;
  return (
    <div className="nc-range">
      <div className="nc-range-bar">
        <span className="nc-range-marker" style={{ left: `${positionPct}%` }} />
      </div>
      <div className="nc-range-ends">
        {/* Labelled per adult because the headline above is on the watch's own
            basis, which for a family is a different and much larger number. */}
        <span>{money(low)} low · per adult</span>
        <span>today {money(current)}</span>
        <span>{money(high)} high</span>
      </div>
    </div>
  );
}

export function BoardCardView({ card }: { card: BoardCard }) {
  const depart = fmtDate(card.departDate);
  const back = fmtDate(card.returnDate);
  const isBuy = card.primary.kind === 'book';

  const primaryHref = isBuy ? bookHref(card, 'board-card') : `/board/${card.id}`;

  return (
    <article className="nc-card" data-state={card.state}>
      <h2 className="nc-card-route">{card.routeLabel}</h2>
      <div className="nc-card-dates">
        {card.watch.anyDates
          ? 'Any dates — we find the cheapest window'
          : depart ? <>{depart}{back ? ` – ${back}` : ''}</> : 'Dates not set'}
        {' · '}
        {card.watch.pax.adults + card.watch.pax.children + card.watch.pax.infants} traveller
        {card.watch.pax.adults + card.watch.pax.children + card.watch.pax.infants === 1 ? '' : 's'}
      </div>

      {card.price.amountUsd != null ? (
        <div className="nc-card-price">
          {money(card.price.amountUsd)}
          <small>
            {card.price.basisLabel}
            {/* A derived party total is an assumption, so it is stated. */}
            {!card.price.quoted && card.price.basis !== 'per_adult' ? ' · estimated' : ''}
          </small>
        </div>
      ) : (
        <div className="nc-card-price is-absent">No fare yet</div>
      )}

      <div className="nc-card-body">
        {card.anatomy ? (
          <span className="nc-verdict" data-call={card.anatomy.call}>
            {card.anatomy.callLabel}
            {card.anatomy.confidencePct != null && (
              <span className="nc-verdict-conf">
                {card.anatomy.confidencePct}%
                {card.anatomy.confidenceIsMeasured ? ' measured' : ' model score'}
              </span>
            )}
          </span>
        ) : null}

        <p className="nc-card-note">{card.note}</p>
        <RangeBar card={card} />
      </div>

      <div className="nc-card-foot">
        <span className="nc-verified">
          {card.verifiedLabel ?? (card.state === 'stale' ? 'Last fare did not survive re-check' : '')}
        </span>
        <div className="nc-card-actions">
          {/* Everything that is not THE action is quiet and secondary. */}
          {isBuy && (
            <Link href={`/board/${card.id}`} className="nc-act nc-act-quiet">Why?</Link>
          )}
          <Link
            href={primaryHref}
            className={`nc-act ${isBuy ? 'nc-act-primary' : ''}`}
            {...(isBuy ? { rel: 'nofollow sponsored', target: '_blank' } : {})}
          >
            {card.primary.label}
          </Link>
        </div>
      </div>
    </article>
  );
}
