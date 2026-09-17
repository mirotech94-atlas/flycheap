import 'server-only';
import { queries, TIER_LIMITS, limitsForUser } from './db';
import { loadDashboard } from './dashboard-data';
import { getCachedBestDeals } from './bestDeals';
import { buildFareBookUrl } from './bookUrl';

/**
 * FarePilot — the in-app flight concierge (the website's "Nadia" concierge, rebranded and
 * made MULTI-TENANT). Every tool here is scoped to a single user_id and reuses the same
 * owner-scoped queries the /api/v1 routes use. The global/abuse tools from the web
 * concierge (poll_now, send_report, global update_settings) are intentionally absent.
 */

export const FAREPILOT_SYSTEM_PROMPT = `You are FarePilot, the friendly flight concierge inside the FlyCheap app.

You help THIS signed-in user track flight routes and find cheap fares. You can ONLY see and act on this user's own data — their tracked routes and their settings. Never reference other users or system-wide settings.

How to help:
- Use get_my_dashboard / list_my_routes to answer "what am I tracking?", "what's cheapest right now?", "am I under my target?".
- Use get_best_deals when the user wants cheap fares / the best deal / what's available.
- Add or remove tracked routes with add_route / remove_route (confirm the route + dates back to the user).
- Change the user's target (alert) price with update_my_target.
- When the user wants to BOOK a specific fare, call get_booking_link and give them that link. NEVER build or guess a booking URL yourself — only the link the tool returns is valid (it carries the affiliate marker).

Style: brief and skimmable on a SMALL phone widget. When listing routes or deals, show at most the **top 5 by price** and offer to show more if there are others — never dump a long table. Prefer compact 3–4 column markdown tables. Don't restate the snapshot verbatim or echo routes with no fare unless asked. Lead with the answer in one short sentence. Currency is always USD; prices are per-adult, round-trip. Never invent prices — if a route/date isn't in the data, say so and offer to track it.`;

/**
 * Tools that WRITE (DB rows, user settings). A provider-failover retry replays
 * the whole conversation, so once one of these has run the chain must stop —
 * otherwise a second provider re-adds the same route. Keep this beside the tool
 * definitions so it can't rot when a tool is added.
 */
export const FAREPILOT_MUTATING_TOOLS = new Set(['add_route', 'remove_route', 'update_my_target']);

export const FAREPILOT_TOOLS = [
  {
    name: 'get_my_dashboard',
    description: 'The user\'s dashboard: each tracked route with its latest cheapest fare, their target (alert) price, and how many routes are under target. Call this first for "what am I tracking" / "what\'s cheapest" / current-state questions.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'list_my_routes',
    description: 'List the user\'s tracked routes (active + paused) with status, route, dates, and latest fare. Use to find a route\'s id before removing it.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'get_best_deals',
    description: 'The cheapest fares currently found, lowest-price first, each flagged against the user\'s target price and with a booking link. Use whenever the user asks for cheap fares, the best deal, or what\'s available.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'How many deals to return (default 10, max 25).' },
        max_per_adult: { type: 'number', description: 'Only return deals at or below this per-adult USD price.' },
      },
    },
  },
  {
    name: 'add_route',
    description: 'Track a new route for the user (tier-capped). Confirm origin, destination and dates back to them after adding.',
    input_schema: {
      type: 'object' as const,
      properties: {
        origin: { type: 'string', description: '3-letter IATA origin airport, e.g. JFK.' },
        destination: { type: 'string', description: '3-letter IATA destination airport, e.g. CAI.' },
        depart_date: { type: 'string', description: 'Outbound date YYYY-MM-DD.' },
        return_date: { type: 'string', description: 'Return date YYYY-MM-DD (after depart_date, max 62 days).' },
        adults: { type: 'number', description: 'Adults (1-9, default 1).' },
        infants: { type: 'number', description: 'Infants (0-4, default 0).' },
      },
      required: ['origin', 'destination', 'depart_date', 'return_date'],
    },
  },
  {
    name: 'remove_route',
    description: 'Stop tracking one of the user\'s routes by its id (from list_my_routes). Only removes routes the user owns.',
    input_schema: {
      type: 'object' as const,
      properties: { id: { type: 'number', description: 'Route id from list_my_routes.' } },
      required: ['id'],
    },
  },
  {
    name: 'update_my_target',
    description: 'Set the user\'s ACCOUNT-WIDE default target (alert) price per adult — applies to every route that doesn\'t have its own custom target. (Per-route targets are set in the app on a route\'s detail screen.) They get notified when a tracked fare drops below the effective target.',
    input_schema: {
      type: 'object' as const,
      properties: { target_per_adult_usd: { type: 'number', description: 'New account-wide default per-adult target price in USD.' } },
      required: ['target_per_adult_usd'],
    },
  },
  {
    name: 'get_booking_link',
    description: 'Get the canonical booking link for a specific fare. ALWAYS use this for booking — never construct a URL yourself.',
    input_schema: {
      type: 'object' as const,
      properties: {
        origin: { type: 'string' }, destination: { type: 'string' },
        depart_date: { type: 'string', description: 'YYYY-MM-DD' },
        return_date: { type: 'string', description: 'YYYY-MM-DD' },
        adults: { type: 'number', description: 'Default 1.' },
        per_adult_usd: { type: 'number', description: 'Optional per-adult price for the deep link.' },
      },
      required: ['origin', 'destination', 'depart_date', 'return_date'],
    },
  },
];

/**
 * A compact, live snapshot of the user's tracked routes + target, injected into the system
 * prompt so FarePilot can answer "what am I tracking / what's cheapest" in ONE model call
 * (no tool round-trip). Tools remain for actions (add/remove/deals/booking).
 */
export function buildUserSnapshot(userId: number): string {
  const threshold = Math.round(parseFloat(queries.getUserSetting(userId, 'alert_threshold_per_adult_usd') ?? '900'));
  const rows = loadDashboard({ userId });
  if (rows.length === 0) {
    return `LIVE SNAPSHOT: This user is not tracking any routes yet. Their alert target is $${threshold}/adult.`;
  }
  const lines = rows.map((r) => {
    const p = r.fare?.price_per_adult_usd;
    const price = p != null ? `$${Math.round(p)}/adult${r.underThreshold ? ' (under target)' : ''}` : 'no fare yet';
    return `- ${r.search.origin}→${r.search.destination} ${r.search.depart_date}..${r.search.return_date}: ${price}`;
  });
  return `LIVE SNAPSHOT (use this to answer questions about tracked routes / cheapest fares WITHOUT calling a tool; only call tools for actions or best-deals):
Alert target: $${threshold}/adult. Tracking ${rows.length} route(s):
${lines.join('\n')}`;
}

export type ToolResult = { content: string; is_error?: boolean };

const iata = (s: unknown) => String(s ?? '').trim().toUpperCase();
const isIata = (s: string) => /^[A-Z]{3}$/.test(s);
const isDate = (s: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ''));

export async function runFarePilotTool(
  userId: number,
  name: string,
  input: Record<string, unknown>,
  baseUrl: string,
): Promise<ToolResult> {
  try {
    switch (name) {
      case 'get_my_dashboard': {
        const rows = loadDashboard({ userId });
        const threshold = parseFloat(queries.getUserSetting(userId, 'alert_threshold_per_adult_usd') ?? '900');
        const routes = rows.map((r) => ({
          id: r.search.id,
          route: `${r.search.origin} → ${r.search.destination}`,
          depart: r.search.depart_date,
          return: r.search.return_date,
          cheapest_per_adult_usd: r.fare?.price_per_adult_usd ?? null,
          under_target: r.underThreshold,
          last_polled: r.fare?.polled_at ?? null,
        }));
        return { content: JSON.stringify({ target_per_adult_usd: threshold, tracked_count: routes.length, routes }, null, 2) };
      }

      case 'list_my_routes': {
        const rows = queries.listSearchesForUser(userId).map((s) => {
          const f = queries.latestFare(s.id);
          return {
            id: s.id,
            status: s.active === 1 ? 'active' : 'paused',
            route: `${s.origin} → ${s.destination}`,
            depart: s.depart_date,
            return: s.return_date,
            adults: s.adults,
            cheapest_per_adult_usd: f?.price_per_adult_usd ?? null,
          };
        });
        return { content: JSON.stringify(rows, null, 2) };
      }

      case 'get_best_deals': {
        const limit = Math.min(25, Math.max(1, Number(input.limit ?? 10)));
        const threshold = parseFloat(queries.getUserSetting(userId, 'alert_threshold_per_adult_usd') ?? '900');
        const { deals } = getCachedBestDeals(400);
        let sorted = [...deals].sort((a, b) => a.per_adult_usd - b.per_adult_usd);
        if (typeof input.max_per_adult === 'number') sorted = sorted.filter((d) => d.per_adult_usd <= (input.max_per_adult as number));
        const top = sorted.slice(0, limit).map((d) => ({
          route: `${d.origin} → ${d.destination}`,
          depart: d.outbound_date,
          return: d.return_date,
          per_adult_usd: d.per_adult_usd,
          party_total_usd: d.party_total_usd,
          under_target: d.per_adult_usd < threshold,
          book_url: buildFareBookUrl({
            origin: d.origin, destination: d.destination, dep: d.outbound_date, ret: d.return_date,
            adults: 1, perAdultUsd: d.per_adult_usd, baseUrl,
          }),
        }));
        return { content: JSON.stringify({ count: top.length, target_per_adult_usd: threshold, deals: top }, null, 2) };
      }

      case 'add_route': {
        const origin = iata(input.origin);
        const destination = iata(input.destination);
        const dep = String(input.depart_date ?? '');
        const ret = String(input.return_date ?? '');
        if (!isIata(origin) || !isIata(destination)) return { content: 'origin and destination must be 3-letter IATA codes', is_error: true };
        if (!isDate(dep) || !isDate(ret)) return { content: 'dates must be YYYY-MM-DD', is_error: true };
        const days = (new Date(ret).getTime() - new Date(dep).getTime()) / 86_400_000;
        if (days <= 0) return { content: 'return_date must be after depart_date', is_error: true };
        if (days > 62) return { content: `trip is ${Math.round(days)} days; max 62`, is_error: true };
        const user = queries.getUserById(userId)!;
        const limit = limitsForUser(user);
        if (queries.countActiveSearchesForUser(userId) >= limit.maxRoutes) {
          return { content: `At the ${user.tier} limit of ${limit.maxRoutes} routes. Upgrade to Pro for unlimited.`, is_error: true };
        }
        const adults = Math.min(9, Math.max(1, Number(input.adults ?? 1)));
        const infants = Math.min(4, Math.max(0, Number(input.infants ?? 0)));
        const r = queries.insertSearch({ origin, destination, depart_date: dep, return_date: ret, adults, infants, user_id: userId } as Parameters<typeof queries.insertSearch>[0]);
        return { content: `Tracking ${origin} → ${destination}, ${dep} → ${ret} for ${adults} adult(s). (id=${r.lastInsertRowid})` };
      }

      case 'remove_route': {
        const id = Number(input.id);
        if (!Number.isInteger(id) || id <= 0) return { content: 'id must be a positive integer', is_error: true };
        const existing = queries.getSearch(id);
        if (!existing || existing.user_id !== userId) return { content: `No route with id=${id} on your account.`, is_error: true };
        queries.deleteSearch(id);
        return { content: `Stopped tracking ${existing.origin} → ${existing.destination} (${existing.depart_date} → ${existing.return_date}).` };
      }

      case 'update_my_target': {
        const v = Number(input.target_per_adult_usd);
        if (!Number.isFinite(v) || v <= 0 || v > 100000) return { content: 'target_per_adult_usd must be a positive USD amount', is_error: true };
        queries.setUserSetting(userId, 'alert_threshold_per_adult_usd', String(Math.round(v)));
        return { content: `Target price set to $${Math.round(v)} per adult. You'll be alerted when a tracked fare drops below it.` };
      }

      case 'get_booking_link': {
        const origin = iata(input.origin);
        const destination = iata(input.destination);
        const dep = String(input.depart_date ?? '');
        const ret = String(input.return_date ?? '');
        if (!isIata(origin) || !isIata(destination) || !isDate(dep) || !isDate(ret)) {
          return { content: 'need valid origin, destination (IATA) and YYYY-MM-DD dates', is_error: true };
        }
        const url = buildFareBookUrl({
          origin, destination, dep, ret,
          adults: Math.min(9, Math.max(1, Number(input.adults ?? 1))),
          perAdultUsd: typeof input.per_adult_usd === 'number' ? input.per_adult_usd : null,
          baseUrl,
        });
        return { content: JSON.stringify({ book_url: url }) };
      }

      default:
        return { content: `Unknown tool: ${name}`, is_error: true };
    }
  } catch (e) {
    return { content: `Tool error: ${(e as Error).message}`, is_error: true };
  }
}
