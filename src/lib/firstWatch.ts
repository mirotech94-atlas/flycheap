/**
 * First run: the watch exists before the email does.
 *
 * "Create the watch before asking for the email." This product's funnel is
 * owner-gated — request access, owner approves, magic link — so the email
 * cannot literally be skipped. What CAN be honoured is the intent: the thing
 * the person came for is captured at the first touch, and it is already
 * waiting on their board the first time they log in.
 *
 * That closes the activation gap this product actually has: both trial users
 * clicked their magic link, logged in once, added zero routes, and never came
 * back. A first login that lands on an empty dashboard and a wizard is a first
 * login that ends there.
 *
 * Pure: parsing and validation only. The database work is in early-access.ts,
 * where the account is provisioned.
 */

const IATA = /^[A-Z]{3}$/;

export type FirstWatch = { origin: string; destination: string };

/** Parse a loosely-typed pair into a route, or null if it is not one. */
export function parseFirstWatch(input: { origin?: unknown; destination?: unknown }): FirstWatch | null {
  // Strip whitespace and case, but do NOT truncate: 'JFKX' is a typo, and
  // slicing it to 'JFK' would silently make a watch for an airport the person
  // did not type. Anything that is not exactly three letters is rejected.
  const clean = (v: unknown) => String(v ?? '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  const origin = clean(input.origin);
  const destination = clean(input.destination);
  if (!IATA.test(origin) || !IATA.test(destination)) return null;
  // A route to itself is a typo, not a watch.
  if (origin === destination) return null;
  return { origin, destination };
}

/**
 * The placeholder dates for a route captured with none.
 *
 * Mirrors what POST /api/searches does for `date_mode: 'any'`: the columns are
 * NOT NULL, the poller ignores them for any-dates routes, and 30/37 days out
 * is the same pair the API writes so the two paths never disagree.
 */
export function placeholderDates(now = new Date()): { depart: string; ret: string } {
  const d = new Date(now); d.setUTCDate(d.getUTCDate() + 30);
  const r = new Date(now); r.setUTCDate(r.getUTCDate() + 37);
  return { depart: d.toISOString().slice(0, 10), ret: r.toISOString().slice(0, 10) };
}
