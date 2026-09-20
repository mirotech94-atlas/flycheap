import '../board.css';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { loadBoardCard } from '@/lib/boardData';
import { targetPerAdultEquivalent } from '@/lib/boardCard';
import { bookHref, RangeBar } from '../BoardCardView';
import { PriceChart } from './PriceChart';
import { FcPageHead, FcPanel } from '@/components/fc/PageKit';

/**
 * The watch detail — the "Why?" behind a card.
 *
 * "The price history chart is the hero... Below it, the verdict with its
 *  reasoning spelled out: where this price sits in the 30-day range, what the
 *  14-day trend is doing, what our confidence actually means, and what would
 *  change the call."
 *
 * All four parts come from explainVerdict(), which refuses to dress a heuristic
 * up as a measured hit rate. Until a route has 20 scored calls the confidence
 * is labelled a model score, in words, on this page.
 */

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const card = user ? loadBoardCard(user.id, parseInt(id, 10)) : null;
  // Falls back rather than 404ing in metadata — the page itself owns that.
  return { title: card ? `${card.routeLabel} — FlyCheap` : 'Watch — FlyCheap' };
}

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export default async function WatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const watchId = parseInt(id, 10);
  if (!Number.isFinite(watchId)) notFound();

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/board/${watchId}`)}`);

  // loadBoardCard scopes to the signed-in account, so another user's watch id
  // is a 404 here rather than a readable page.
  const card = loadBoardCard(user.id, watchId);
  if (!card) notFound();

  const a = card.anatomy;
  const v = card.verdict;

  return (
    <div className="space-y-6">
      <FcPageHead
        title={card.routeLabel}
        lede={card.note}
        action={
          card.primary.kind === 'book' ? (
            <a
              href={bookHref(card, 'board-watch')}
              className="nc-act nc-act-primary"
              rel="nofollow sponsored"
              target="_blank"
            >
              {card.primary.label}
            </a>
          ) : (
            <Link href="/board" className="nc-act">Back to the board</Link>
          )
        }
      />

      <FcPanel
        title="Price history"
        note={
          card.price.basis === 'per_adult'
            ? 'Per adult, daily lowest.'
            : `Per adult, daily lowest. Your headline of ${card.price.amountUsd != null ? money(card.price.amountUsd) : '—'} is ${card.price.basisLabel}.`
        }
      >
        {card.history.length >= 2 ? (
          <PriceChart
            history={card.history}
            targetPerAdult={targetPerAdultEquivalent(card.watch)}
            targetIsEquivalent={card.target.basis !== 'per_adult'}
            low={card.range30?.low ?? null}
            high={card.range30?.high ?? null}
          />
        ) : (
          <p className="text-[13.5px] text-[var(--nc-on-dark-mute)]">
            {card.history.length === 1
              ? 'One day of history so far. The chart appears once there are two points to draw between.'
              : 'No price recorded yet. The first check usually lands within the hour.'}
          </p>
        )}
      </FcPanel>

      {a && v ? (
        <FcPanel title="The call, and why">
          <div className="nc-anatomy">
            <div className="nc-anatomy-part">
              <h3>Our call</h3>
              <span className="nc-verdict" data-call={a.call}>{a.callLabel}</span>
              <p style={{ marginTop: '0.5rem' }}>{v.reason}</p>
            </div>

            <div className="nc-anatomy-part">
              <h3>Confidence</h3>
              <div className="nc-anatomy-figure">
                {a.confidencePct != null ? `${a.confidencePct}%` : 'Not measured'}
                <span className="nc-measured" data-measured={String(a.confidenceIsMeasured)}>
                  {a.confidenceIsMeasured ? 'measured' : 'model score'}
                </span>
              </div>
              {/* The sentence that makes the percentage mean something. Without
                  it a bare "78%" is a number with no unit. */}
              <p style={{ marginTop: '0.4rem' }}>{a.confidenceBasis}</p>
            </div>

            <div className="nc-anatomy-part">
              <h3>Where this price sits</h3>
              <p>
                {money(a.position.current)} per adult is at the{' '}
                {Math.round(a.position.percentile)}
                {ordinal(Math.round(a.position.percentile))} percentile of the last{' '}
                {v.samples} day{v.samples === 1 ? '' : 's'} — between a low of{' '}
                {money(a.position.low)} and a high of {money(a.position.high)}.
              </p>
              <RangeBar card={card} />
            </div>

            <div className="nc-anatomy-part">
              <h3>The 14-day trend</h3>
              <p>
                {Math.abs(v.slopePerDay) < 0.5
                  ? 'Flat — it has not moved meaningfully in either direction.'
                  : `${v.slopePerDay < 0 ? 'Falling' : 'Rising'} about ${money(Math.abs(v.slopePerDay))} a day.`}
                {' '}
                {v.trendPct < 0
                  ? `Down ${Math.abs(v.trendPct).toFixed(1)}% against the first half of the window.`
                  : `Up ${v.trendPct.toFixed(1)}% against the first half of the window.`}
              </p>
            </div>

            <div className="nc-anatomy-part">
              <h3>What would change it</h3>
              <p>{a.whatWouldChangeIt}</p>
            </div>
          </div>
        </FcPanel>
      ) : (
        <FcPanel title="The call, and why">
          <p className="text-[13.5px] text-[var(--nc-on-dark-mute)]">
            We do not have a call on this route yet. {card.note}
          </p>
        </FcPanel>
      )}

      <FcPanel title="This watch" note="Change the target or pause it from your watchlist.">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
          <Row label="Travellers">
            {card.watch.pax.adults} adult{card.watch.pax.adults === 1 ? '' : 's'}
            {card.watch.pax.children > 0 ? `, ${card.watch.pax.children} child${card.watch.pax.children === 1 ? '' : 'ren'}` : ''}
            {card.watch.pax.infants > 0 ? `, ${card.watch.pax.infants} infant${card.watch.pax.infants === 1 ? '' : 's'}` : ''}
          </Row>
          <Row label="Your target">
            {card.target.amountUsd != null
              ? `${money(card.target.amountUsd)} ${card.target.basisLabel}`
              : 'None set — we judge it against the route’s own range'}
          </Row>
          <Row label="Status">{card.status}</Row>
          <Row label="Price age">{card.verifiedLabel ?? 'Not verified'}</Row>
        </dl>
        <p className="mt-4 text-[12px] text-[var(--nc-on-dark-faint)]">
          <Link href="/searches" className="underline underline-offset-2">Manage this route</Link>
          {' · '}
          <Link href="/board" className="underline underline-offset-2">Back to the board</Link>
        </p>
      </FcPanel>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.09em] text-[var(--nc-on-dark-faint)]">{label}</dt>
      <dd className="text-[var(--nc-on-dark)] mt-0.5">{children}</dd>
    </div>
  );
}

function ordinal(n: number): string {
  const r = n % 100;
  if (r >= 11 && r <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
}
