import 'server-only';
import { Resend } from 'resend';
import { queries } from './db';
import { alertsFrom, ADDR } from './senders';
import { APP_URL } from './hosts';
import {
  buildPartnerLink, routeIdFor,
  type PartnerProduct, type PartnerId,
} from './partnerLink';
import {
  CHAIN, NUDGE, POST_TRIP, type ChainStage, type Trip,
  maySend, markSend, dueSends, getTrip,
  mintConfirmToken, confirmUrl, postTripUrl, commercialUnsubscribeUrl,
} from './tripChain';
import { hotellookLink, hotelCityForDestination, tpBrandConfigured } from './affiliate';

/**
 * Rendering and sending for the chain.
 *
 * Emails stay LIGHT — this is the established email design system here, with
 * inline styles and no dark-mode variant, and amber/teal are never used as text
 * colours in email because they do not clear AA on white.
 *
 * Every monetized message carries the affiliate disclosure and a commercial-only
 * unsubscribe. The audience being courted here notices the absence of both.
 */

const SITE = (process.env.APP_URL || APP_URL).replace(/\/$/, '');
const INK = '#0a1426';
const MUTE = '#5b6678';
const RULE = 'rgba(10,20,38,.10)';
const LINK = '#0a3a6b';

function esc(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
    .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** The disclosure. Visible, not a footnote in 9px grey. */
function disclosure(): string {
  return `<p style="font-size:12.5px;color:${MUTE};line-height:1.5;margin:20px 0 0">
    We earn a commission if you book through these links, at no extra cost to you.
    It is how FlyCheap stays free to use, and it never changes which option we show first.
  </p>`;
}

function shell(opts: { preheader: string; body: string; footer: string }): string {
  return `
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(opts.preheader)}</div>
  <div style="font-family:Manrope,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:auto;padding:24px;color:${INK};background:#faf7ef">
    ${opts.body}
    <hr style="border:none;border-top:1px solid ${RULE};margin:24px 0 14px">
    ${opts.footer}
  </div>`;
}

// ---------------------------------------------------------------------------
// Stage content
// ---------------------------------------------------------------------------

type Rendered = { subject: string; html: string; text: string };

/** Which partner and product each commercial stage sells. */
const STAGE_OFFER: Record<string, { product: PartnerProduct; partner: PartnerId }> = {
  stay:         { product: 'hotel',        partner: 'hotellook' },
  transfer:     { product: 'transfer',     partner: 'kiwitaxi' },
  insurance:    { product: 'insurance',    partner: 'ekta' },
  esim:         { product: 'esim',         partner: 'travelpayouts' },
  tours:        { product: 'tour',         partner: 'travelpayouts' },
  compensation: { product: 'compensation', partner: 'travelpayouts' },
};

const STAGE_COPY: Record<string, { subject: (t: Trip) => string; lead: (t: Trip) => string; cta: string }> = {
  stay: {
    subject: t => `Where to stay in ${t.destination} for those dates`,
    lead: t => `Your ${t.origin} → ${t.destination} dates are ${fmtDate(t.depart_date)} to ${fmtDate(t.return_date)}. Here is what those nights cost right now.`,
    cta: 'See places to stay',
  },
  transfer: {
    subject: t => `Getting in from the airport in ${t.destination}`,
    lead: () => 'A fixed-price transfer booked in advance is usually cheaper than the taxi rank, and it is one less thing to work out while tired.',
    cta: 'Book a transfer',
  },
  insurance: {
    subject: t => `Cover for the ${t.destination} trip`,
    lead: () => 'You booked a non-refundable fare. Cover for cancellation and medical costs abroad is worth a look before you travel, not after.',
    cta: 'Compare cover',
  },
  esim: {
    subject: t => `Data in ${t.destination} without the roaming bill`,
    lead: () => 'An eSIM activates before you land and costs a fraction of roaming. Install it while you are still on wifi.',
    cta: 'Get a data plan',
  },
  tours: {
    subject: t => `Things worth booking in ${t.destination} before you go`,
    lead: t => `You fly in about two weeks (${fmtDate(t.depart_date)}). The things that sell out are the ones worth booking now.`,
    cta: 'See what is on',
  },
  compensation: {
    subject: t => `Was your ${t.origin} → ${t.destination} flight late?`,
    lead: () => 'If your flight was delayed more than three hours or cancelled, you may be owed compensation — often a few hundred dollars. Checking is free and takes a minute.',
    cta: 'Check your flight',
  },
};

function offerLink(trip: Trip, stage: ChainStage): string {
  const offer = STAGE_OFFER[stage];
  const routeId = routeIdFor({
    origin: trip.origin, destination: trip.destination,
    departDate: trip.depart_date, returnDate: trip.return_date,
  });
  const ctx = {
    surface: 'email-chain' as const,
    routeId,
    tripId: trip.id,
    campaign: `chain-${stage}`,
    userId: trip.user_id,
  };

  // The stay stage has a real deeplink with the trip's own dates; the rest are
  // brand links whose destination is resolved server-side in /go.
  if (stage === 'stay' && trip.depart_date && trip.return_date) {
    return buildPartnerLink({
      partner: 'hotellook', product: 'hotel', baseUrl: SITE,
      deeplink: hotellookLink({
        destination: trip.destination,
        checkIn: trip.depart_date, checkOut: trip.return_date,
        adults: trip.adults, surface: 'email-alert',
      }),
      context: ctx,
    });
  }
  return buildPartnerLink({
    partner: offer.partner, product: offer.product, baseUrl: SITE, context: ctx,
  });
}

function renderCommercial(trip: Trip, stage: ChainStage): Rendered {
  const copy = STAGE_COPY[stage];
  const url = offerLink(trip, stage);
  const unsub = commercialUnsubscribeUrl(trip.user_id!, SITE);
  const route = `${trip.origin} → ${trip.destination}`;
  const city = hotelCityForDestination(trip.destination);

  const body = `
    <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#8a93a6;font-family:'JetBrains Mono',monospace">Your ${esc(city)} trip</div>
    <h1 style="font-family:Fraunces,Georgia,serif;font-weight:400;font-size:28px;line-height:1.15;color:${LINK};margin:6px 0 10px">${esc(copy.subject(trip))}</h1>
    <p style="font-size:15px;line-height:1.6;color:${INK};margin:0 0 18px">${esc(copy.lead(trip))}</p>
    <p style="margin:0 0 6px">
      <a href="${url}" style="display:inline-block;background:#d4af37;color:#061a35;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">${esc(copy.cta)} →</a>
    </p>
    ${disclosure()}`;

  const footer = `
    <p style="font-size:12px;color:${MUTE};line-height:1.6;margin:0">
      You are getting this because you told us you booked ${esc(route)}.
      <a href="${unsub}" style="color:${LINK}">Turn off trip offers</a> —
      <strong style="color:${INK}">your fare alerts keep working</strong>, they are a separate subscription.
    </p>`;

  const text = [
    copy.subject(trip), '',
    copy.lead(trip), '',
    `${copy.cta}: ${url}`, '',
    'We earn a commission if you book through these links, at no extra cost to you.',
    '',
    `You are getting this because you told us you booked ${route}.`,
    `Turn off trip offers (your fare alerts keep working): ${unsub}`,
  ].join('\n');

  return { subject: copy.subject(trip), html: shell({ preheader: copy.lead(trip), body, footer }), text };
}

/**
 * The confirmation. No offer, no partner link, nothing to sell — it asks one
 * question, and putting an offer in it would make the question look like a
 * pretext and cost us the answer.
 */
function renderConfirm(trip: Trip, token: string): Rendered {
  const url = confirmUrl(token, SITE);
  const route = `${trip.origin} → ${trip.destination}`;
  const subject = `Did you get the ${trip.destination} fare?`;

  const body = `
    <h1 style="font-family:Fraunces,Georgia,serif;font-weight:400;font-size:28px;line-height:1.15;color:${LINK};margin:0 0 10px">${esc(subject)}</h1>
    <p style="font-size:15px;line-height:1.6;color:${INK};margin:0 0 6px">
      ${esc(route)}${trip.depart_date ? ` · ${esc(fmtDate(trip.depart_date))}` : ''}${trip.fare_per_adult_usd ? ` · $${Math.round(trip.fare_per_adult_usd)} per adult` : ''}
    </p>
    <p style="font-size:15px;line-height:1.6;color:${MUTE};margin:0 0 18px">
      It is the one thing we cannot see, and it tells us which alerts are actually worth sending.
    </p>
    <p style="margin:0">
      <a href="${url}" style="display:inline-block;background:#d4af37;color:#061a35;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">Yes, I booked it</a>
      <a href="${url}" style="display:inline-block;margin-left:8px;color:${LINK};padding:12px 8px;text-decoration:none;font-weight:600;font-size:15px">Still deciding</a>
    </p>`;

  const footer = `<p style="font-size:12px;color:${MUTE};margin:0">One question, one email. We will not ask again.</p>`;
  const text = [subject, '', route, '', `Answer here: ${url}`, '', 'One question, one email. We will not ask again.'].join('\n');
  return { subject, html: shell({ preheader: route, body, footer }), text };
}

/**
 * The still-deciding nudge. Built from our own price history, and it must look
 * nothing like the booked branch: no offer, no partner link, no commission.
 * This is retention.
 */
function renderNudge(trip: Trip): Rendered {
  const route = `${trip.origin} → ${trip.destination}`;
  const hist = trip.search_id ? queries.fareHistoryDaily(trip.search_id, 30) : [];
  const prices = hist.map(h => h.per_adult_usd);
  const low = prices.length ? Math.min(...prices) : null;
  const now = prices.length ? prices[prices.length - 1] : null;
  const shown = trip.fare_per_adult_usd;

  const movement = shown != null && now != null
    ? now < shown
      ? `It is ${Math.round(shown - now)} dollars cheaper than when you looked.`
      : now > shown
        ? `It has gone up about ${Math.round(now - shown)} dollars since you looked.`
        : 'It has not moved since you looked.'
    : 'We are still watching it.';

  const subject = `${route}: where the fare sits now`;
  const body = `
    <h1 style="font-family:Fraunces,Georgia,serif;font-weight:400;font-size:28px;line-height:1.15;color:${LINK};margin:0 0 10px">${esc(route)}</h1>
    <p style="font-size:15px;line-height:1.6;color:${INK};margin:0 0 10px">${esc(movement)}</p>
    ${now != null && low != null ? `<p style="font-size:15px;line-height:1.6;color:${MUTE};margin:0 0 18px">
      Now $${Math.round(now)} per adult. The 30-day low on this route is $${Math.round(low)}.
    </p>` : ''}
    <p style="font-size:15px;line-height:1.6;color:${MUTE};margin:0">
      Nothing to do — we will alert you if it drops. <a href="${SITE}/searches" style="color:${LINK}">Adjust your target</a> if you want to hear sooner.
    </p>`;
  const footer = `<p style="font-size:12px;color:${MUTE};margin:0">This is part of your fare alerts, not a promotion.</p>`;
  const text = [subject, '', movement, '', `Adjust your target: ${SITE}/searches`].join('\n');
  return { subject, html: shell({ preheader: movement, body, footer }), text };
}

/**
 * The post-trip question. Like the confirmation: one question, nothing to sell.
 *
 * It asks two things at once because they are one moment — you have just got
 * home, did the trip happen and what did it cost — and a second email a week
 * later to ask the second half would not be opened.
 */
function renderPostTrip(trip: Trip, token: string): Rendered {
  const url = postTripUrl(token, SITE);
  const route = `${trip.origin} → ${trip.destination}`;
  const subject = `Welcome back — how was ${trip.destination}?`;

  const body = `
    <h1 style="font-family:Fraunces,Georgia,serif;font-weight:400;font-size:28px;line-height:1.15;color:${LINK};margin:0 0 10px">${esc(subject)}</h1>
    <p style="font-size:15px;line-height:1.6;color:${INK};margin:0 0 6px">
      ${esc(route)}${trip.depart_date ? ` · ${esc(fmtDate(trip.depart_date))}` : ''}${trip.return_date ? ` to ${esc(fmtDate(trip.return_date))}` : ''}
    </p>
    <p style="font-size:15px;line-height:1.6;color:${MUTE};margin:0 0 18px">
      Two quick things, and then we leave you alone: did the trip happen, and what did you
      actually pay for the flights? It is the only way we can tell you what you have saved
      this year — and whether our advice on this route has been any good.
    </p>
    <p style="margin:0">
      <a href="${url}" style="display:inline-block;background:#d4af37;color:#061a35;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">Answer in ten seconds</a>
    </p>`;

  const footer = `<p style="font-size:12px;color:${MUTE};margin:0">Part of your fare alerts, not a promotion. We ask once per trip.</p>`;
  const text = [subject, '', route, '', `Answer here: ${url}`, '', 'Part of your fare alerts, not a promotion. We ask once per trip.'].join('\n');
  return { subject, html: shell({ preheader: `Did the ${trip.destination} trip happen, and what did you pay?`, body, footer }), text };
}

/**
 * Render a stage.
 *
 * `confirmToken` is passed IN rather than minted here: a render that minted one
 * would leave an orphan token behind every failed send and every preview, and
 * with retries enabled a single flaky stage could mint several.
 */
export function renderStage(trip: Trip, stage: ChainStage, confirmToken?: string): Rendered | null {
  if (stage === 'confirm') return renderConfirm(trip, confirmToken ?? mintConfirmToken(trip.id));
  if (stage === 'post-trip') return renderPostTrip(trip, confirmToken ?? mintConfirmToken(trip.id));
  if (stage === 'nudge') return renderNudge(trip);
  if (!STAGE_COPY[stage]) return null;
  return renderCommercial(trip, stage);
}

// ---------------------------------------------------------------------------
// The runner
// ---------------------------------------------------------------------------

export type ChainRun = { due: number; sent: number; skipped: number; failed: number };

/**
 * Send everything due. Called from cron.
 *
 * Rules are re-checked HERE, at send time, not at schedule time: days pass
 * between queueing and sending, and in that gap a user can unsubscribe, hit the
 * daily cap, or turn out never to have confirmed.
 */
export async function runChainSends(limit = 100): Promise<ChainRun> {
  const due = dueSends(limit);
  const run: ChainRun = { due: due.length, sent: 0, skipped: 0, failed: 0 };
  if (due.length === 0) return run;

  const apiKey = process.env.RESEND_API_KEY;
  const resend = apiKey ? new Resend(apiKey) : null;

  for (const item of due) {
    const trip = getTrip(item.trip_id);
    if (!trip) { markSend(item.id, 'skipped', { skipReason: 'trip missing' }); run.skipped++; continue; }

    const decision = maySend(trip, item.stage);
    if (!decision.send) {
      markSend(item.id, 'skipped', { skipReason: decision.reason });
      run.skipped++;
      continue;
    }

    const user = trip.user_id ? queries.getUserById(trip.user_id) : null;
    const to = user?.email;
    if (!to) { markSend(item.id, 'skipped', { skipReason: 'no address' }); run.skipped++; continue; }

    // Minted once per attempt, immediately before the send that carries it.
    // The post-trip question carries a token for the same reason the
    // confirmation does: its answer is a POST behind a single-use link.
    const needsToken = item.stage === 'confirm' || item.stage === 'post-trip';
    const confirmToken = needsToken ? mintConfirmToken(trip.id) : undefined;
    const rendered = renderStage(trip, item.stage, confirmToken);
    if (!rendered) { markSend(item.id, 'skipped', { skipReason: `no template for ${item.stage}` }); run.skipped++; continue; }

    if (!resend) {
      // Unconfigured is not the same as failed: leave it queued so it goes out
      // once a key exists, rather than silently burning the send.
      run.skipped++;
      continue;
    }

    try {
      const res = await resend.emails.send({
        from: alertsFrom(
          item.stage === 'confirm' || item.stage === 'nudge' || item.stage === 'post-trip'
            ? 'FlyCheap Alerts'
            : 'FlyCheap Trips',
        ),
        to,
        replyTo: ADDR.support,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });
      if (res.error) throw new Error(res.error.message);
      markSend(item.id, 'sent', { messageId: res.data?.id });
      run.sent++;
    } catch (e) {
      markSend(item.id, 'failed', { skipReason: (e as Error).message });
      queries.logError({ source: 'chain:send', message: `${item.stage} for trip ${trip.id}: ${(e as Error).message}` });
      run.failed++;
    }
  }
  return run;
}

/** Exported for the admin page and for tests. */
export { CHAIN, NUDGE, POST_TRIP };
