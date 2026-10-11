import 'server-only';
import { getPublicMetrics } from './public-metrics';
import { deliverableChannels } from './channelHealth';
import { tierChannels, channelSentence } from './tierCopy';
import { tpBrandConfigured } from './affiliate';

/**
 * The facts the legal and about pages state about who touches customer data
 * and what the product does — read from the running system, never typed.
 *
 * /privacy, /terms and /about all quote the same things: which fare providers
 * are actually polled, which AI vendors can see a chat message, which payment
 * processors are wired, which affiliate partners a click can reach and which
 * alert channels we can deliver on. Each of those has drifted at least once
 * when it was hand-written (a provider list naming four sources when one was
 * enabled; "Stripe" alone after PayPal went live; five AI vendors when two had
 * no key). Deriving them here means the pages cannot disagree with each other
 * or with the deployment.
 */

export const listOf = (xs: readonly string[]): string =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

const PROVIDER_LABEL: Record<string, string> = {
  travelpayouts: 'Travelpayouts (Aviasales)', amadeus: 'Amadeus', duffel: 'Duffel', kiwi: 'Kiwi',
  serpapi: 'Google Flights via SerpAPI', searchapi: 'Google Flights via SearchAPI',
};

/** Fare providers that are enabled AND keyed — the ones a route query actually reaches. */
export function enabledFareProviders(): { labels: string[]; total: number } {
  const m = getPublicMetrics();
  return { labels: m.providersConfigured.map(id => PROVIDER_LABEL[id] ?? id), total: m.providersTotal };
}

/**
 * AI vendors that hold a key in this deployment. A vendor without a key can
 * never receive a chat message, so it does not belong in a disclosure.
 * OpenRouter is a relay: the message continues to whichever upstream model it
 * selects, which is why its label says so.
 */
export function configuredAiProviders(): string[] {
  const out: string[] = [];
  if (process.env.ANTHROPIC_API_KEY) out.push('Anthropic');
  if (process.env.GROQ_API_KEY) out.push('Groq');
  if (process.env.OPENAI_API_KEY) out.push('OpenAI');
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) out.push('Google Gemini');
  if (process.env.OPENROUTER_API_KEY) out.push('OpenRouter (which relays to the model provider it selects)');
  return out;
}

/**
 * Payment processors. There are none, and that is the honest answer.
 *
 * FlyCheap is open source and takes no money, so no card processor is in the
 * path and none should be disclosed. An empty list is the truth; naming Stripe
 * here when nothing can be charged would be the same invented claim this
 * module exists to prevent.
 */
export function paymentProcessors(): string[] {
  return [];
}

/**
 * Third parties an alert can be delivered through, by tier, measured against
 * the configured senders (the same rule the pricing page uses).
 */
export function alertChannelSentences(): { free: string; paid: string } {
  const d = deliverableChannels();
  return { free: channelSentence(tierChannels('free', d)), paid: channelSentence(tierChannels('pro', d)) };
}

/** Vendors that carry alerts, when their sender is configured. */
export function alertCarriers(): string[] {
  const out: string[] = ['Resend (email)'];
  if (process.env.TWILIO_ACCOUNT_SID && (process.env.TWILIO_FROM_SMS || process.env.TWILIO_FROM_WHATSAPP)) out.push('Twilio (SMS' + (process.env.TWILIO_FROM_WHATSAPP ? ' and WhatsApp' : '') + ')');
  if (process.env.TELEGRAM_BOT_TOKEN) out.push('Telegram (bot messages)');
  return out;
}

export type AffiliatePartner = { name: string; href: string; note: string };

/**
 * Affiliate destinations a "Book" or attach-brand click can reach, gated on
 * the same env each link builder reads. Travelpayouts is listed whenever its
 * marker is set; the attach brands (EKTA insurance, Kiwitaxi transfers) ride
 * the same account but only render when their link template exists.
 */
export function affiliatePartners(): AffiliatePartner[] {
  const out: AffiliatePartner[] = [];
  if (process.env.AVIASALES_MARKER || process.env.TRAVELPAYOUTS_MARKER) {
    const brands = ['Aviasales (flights)', 'Hotellook (hotels)', 'WayAway (cashback flights)'];
    if (tpBrandConfigured('ekta')) brands.push('EKTA (travel insurance)');
    if (tpBrandConfigured('kiwitaxi')) brands.push('Kiwitaxi (airport transfers)');
    out.push({ name: 'Travelpayouts', href: 'https://www.travelpayouts.com/', note: `the affiliate network behind ${listOf(brands)}` });
  }
  if (process.env.TRIPCOM_ALLIANCE_ID) out.push({ name: 'Trip.com Partners', href: 'https://www.trip.com/partners/', note: 'flight and hotel bookings' });
  if (process.env.NEXT_PUBLIC_BOOKING_AID) out.push({ name: 'Booking.com', href: 'https://www.booking.com/affiliate-program/', note: 'hotel bookings' });
  if (process.env.NEXT_PUBLIC_EXPEDIA_SITEID) out.push({ name: 'Expedia', href: 'https://www.expedia.com/affiliates', note: 'hotel bookings' });
  return out;
}
