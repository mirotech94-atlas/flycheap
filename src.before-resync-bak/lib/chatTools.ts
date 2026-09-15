import 'server-only';
import { queries } from './db';
import { sendDigest } from './digest';
import { pollAll } from './poller';
import { refreshBestDeals, getCachedBestDeals } from './bestDeals';
import { fmtUSD, fmtDate } from './utils';

export const CHAT_SYSTEM_PROMPT = `You are the EgyptAir Cheap Flights Tracker assistant. You help Myron find affordable nonstop EgyptAir fares from JFK/EWR to Cairo for 4 adults + 1 infant.

Key context:
- DISPLAY FILTER: the dashboard hides any fare above the configured "max display per adult" (default $1200). When the user asks "what's available," only mention fares at or below this cap.
- ALERT THRESHOLD: separate setting (default $900/adult). Email alerts fire when a tracked fare drops below this.
- Summer (Jul/Aug) is peak and typically runs $1,500-1,800/adult — usually nothing under $1,200 for those exact dates.
- Cheap fares (sub-$1,000) are typically in MAY, JUNE, SEPTEMBER, OCTOBER. EgyptAir flies nonstop JFK-CAI; EWR-CAI does NOT exist nonstop, so any EWR search will return no data.
- The "find_best_deals" tool scans 12 months ahead and returns the absolute cheapest pairings — use it whenever the user asks for cheap fares, the best deal, what's available, or complains about prices being too high. Pass max_per_adult to filter to deals under a price.

Your responsibilities:
- Answer questions about current fares, searches, and recent alerts using the tools provided.
- Proactively suggest using find_best_deals when the user's existing searches show high prices.
- Help the user add or remove searches via add_search / delete_search.
- Send the daily digest to email addresses on request.
- Be concise and direct. Use markdown tables in your replies when listing data.
- Currency is always USD. Threshold is per-adult round-trip.
- If a user asks to send a report to "me" or doesn't specify an email, omit the to: param so the configured ALERT_EMAIL is used.
- Never invent prices. If data isn't cached for a route/date, say so.`;

export const TOOLS = [
  {
    name: 'get_summary',
    description:
      'Get the current dashboard summary: every active search with its latest cheapest fare, the alert threshold, the configured alert email, and counts of active/paused searches and recent alerts. Always call this first when asked about current state.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'list_searches',
    description: 'List every saved search (including paused ones) with status, route, and dates.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'list_recent_alerts',
    description: 'List the most recent alert emails that were sent (price-drop notifications). Useful when the user asks "have I been alerted about anything lately".',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'How many recent alerts to return (default 10, max 50)' },
      },
    },
  },
  {
    name: 'send_report',
    description:
      'Immediately send the full daily digest email (with formatted tables and pie charts) to a specific email address. Use this whenever the user asks to send a summary, report, or update to someone. The email contains current fares, threshold breakdown pie chart, party-cost-by-origin pie chart, and recent alerts table.',
    input_schema: {
      type: 'object' as const,
      properties: {
        to: { type: 'string', description: 'Email address to send the report to. If the user says "me" or "my email", omit this field to use the configured ALERT_EMAIL.' },
        headline: { type: 'string', description: 'Optional one-line headline override for the email subject and header banner.' },
      },
    },
  },
  {
    name: 'poll_now',
    description: 'Force a fresh poll of all active searches against Travelpayouts, then return the new fares. Use when the user asks for "the latest" or "right now" prices and the dashboard data may be stale.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'find_best_deals',
    description: 'Scan the next 12 months for the absolute cheapest EgyptAir nonstop round-trips JFK/EWR ↔ CAI, regardless of any specific saved search dates. Returns the top cheapest pairings. Use this whenever the user asks for: cheap fares, the best deal available, what dates are cheapest, or complains that current prices are too high. The tool refreshes the cache (~30 sec, scans both directions × 12 months × 2 origins) then returns the top results.',
    input_schema: {
      type: 'object' as const,
      properties: {
        refresh: { type: 'boolean', description: 'If true (default), refreshes the cache by hitting Travelpayouts. If false, returns whatever is currently cached.' },
        limit: { type: 'number', description: 'How many top deals to return (default 10, max 30).' },
        max_per_adult: { type: 'number', description: 'If set, only return deals at or below this per-adult price.' },
      },
    },
  },
  {
    name: 'add_search',
    description: 'Add a new saved search to monitor specific outbound + return dates. Use when the user wants to track a new date pair (e.g., "add a search for May 12 to May 25").',
    input_schema: {
      type: 'object' as const,
      properties: {
        origin: { type: 'string', enum: ['JFK', 'EWR'], description: 'Origin airport.' },
        depart_date: { type: 'string', description: 'Outbound date in YYYY-MM-DD.' },
        return_date: { type: 'string', description: 'Return date in YYYY-MM-DD. Must be after depart_date.' },
      },
      required: ['origin', 'depart_date', 'return_date'],
    },
  },
  {
    name: 'delete_search',
    description: 'Permanently delete a saved search and its fare history. Use when the user wants to remove an unwanted search (e.g., "delete the EWR search" — first call list_searches to find its id).',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'number', description: 'Search ID (from list_searches).' },
      },
      required: ['id'],
    },
  },
  {
    name: 'update_settings',
    description: 'Change app-wide settings: alert threshold (per-adult price below which email alerts fire), max display price (filter to hide fares above this), alert email recipient, or poll interval. Use when the user says things like "change the threshold to $1100" or "set max display to $1500".',
    input_schema: {
      type: 'object' as const,
      properties: {
        alert_threshold_per_adult_usd: { type: 'number', description: 'Alert email fires when a tracked fare drops below this per-adult price.' },
        max_display_per_adult_usd: { type: 'number', description: 'Dashboard hides any fare above this per-adult price.' },
        alert_email: { type: 'string', description: 'Email address that receives alerts and digests by default.' },
        poll_interval_minutes: { type: 'number', description: 'How often (minutes) the app polls Travelpayouts. 5-1440.' },
      },
    },
  },
];

export type ToolResult = { content: string; is_error?: boolean };

export async function runTool(name: string, input: Record<string, unknown>): Promise<ToolResult> {
  try {
    switch (name) {
      case 'get_summary': {
        const threshold = parseFloat(queries.getSetting('alert_threshold_per_adult_usd') ?? '900');
        const alertEmail = queries.getSetting('alert_email') ?? '';
        const pollInterval = parseInt(queries.getSetting('poll_interval_minutes') ?? '30', 10);
        const all = queries.listSearches();
        const active = all.filter(s => s.active === 1);
        const paused = all.filter(s => s.active === 0);
        const fares = active.map(s => {
          const f = queries.latestFare(s.id);
          return {
            search_id: s.id,
            route: `${s.origin} → ${s.destination}`,
            depart: s.depart_date,
            return: s.return_date,
            cheapest_per_adult_usd: f?.price_per_adult_usd ?? null,
            party_total_usd: f?.total_price_usd ?? null,
            outbound_flight: f?.outbound_flight_no ?? null,
            return_flight: f?.return_flight_no ?? null,
            below_threshold: f ? f.price_per_adult_usd < threshold : null,
            last_polled: f?.polled_at ?? null,
          };
        });
        const recentAlertCount = queries.recentAlerts(50).length;
        return {
          content: JSON.stringify({
            alert_threshold_per_adult_usd: threshold,
            alert_email: alertEmail,
            poll_interval_minutes: pollInterval,
            active_search_count: active.length,
            paused_search_count: paused.length,
            recent_alert_count: recentAlertCount,
            fares,
          }, null, 2),
        };
      }

      case 'list_searches': {
        const rows = queries.listSearches().map(s => ({
          id: s.id,
          status: s.active === 1 ? 'active' : 'paused',
          route: `${s.origin} → ${s.destination}`,
          depart: s.depart_date,
          return: s.return_date,
          adults: s.adults,
          infants: s.infants,
          created_at: s.created_at,
        }));
        return { content: JSON.stringify(rows, null, 2) };
      }

      case 'list_recent_alerts': {
        const limit = Math.min(50, Math.max(1, Number(input.limit ?? 10)));
        const alerts = queries.recentAlerts(limit).map(a => ({
          sent_at: a.sent_at,
          route: `${a.origin} → ${a.destination}`,
          depart: a.depart_date,
          return: a.return_date,
          price_per_adult_usd: a.price_per_adult_usd,
        }));
        return { content: JSON.stringify(alerts, null, 2) };
      }

      case 'send_report': {
        const to = typeof input.to === 'string' ? input.to : undefined;
        const headline = typeof input.headline === 'string' ? input.headline : undefined;
        const r = await sendDigest(to, headline);
        if (!r.ok) return { content: `Failed: ${r.error}`, is_error: true };
        return { content: `Report sent to ${r.sentTo} (Resend id: ${r.id}).` };
      }

      case 'poll_now': {
        const results = await pollAll();
        return { content: JSON.stringify(results, null, 2) };
      }

      case 'find_best_deals': {
        const refresh = input.refresh !== false;
        const limit = Math.min(30, Math.max(1, Number(input.limit ?? 10)));
        const defaultCap = parseFloat(queries.getSetting('max_display_per_adult_usd') ?? '1200');
        const maxPerAdult = typeof input.max_per_adult === 'number' ? input.max_per_adult : defaultCap;
        let deals;
        if (refresh) deals = await refreshBestDeals();
        else deals = getCachedBestDeals(30).deals;
        const filtered = deals.filter(d => d.per_adult_usd <= maxPerAdult);
        const top = filtered.slice(0, limit);
        return { content: JSON.stringify({ count: top.length, total_in_cache: deals.length, max_per_adult_filter: maxPerAdult, deals: top }, null, 2) };
      }

      case 'add_search': {
        const origin = input.origin as string;
        const depart = input.depart_date as string;
        const returnDate = input.return_date as string;
        if (!['JFK', 'EWR'].includes(origin)) return { content: 'origin must be JFK or EWR', is_error: true };
        if (!/^\d{4}-\d{2}-\d{2}$/.test(depart) || !/^\d{4}-\d{2}-\d{2}$/.test(returnDate)) {
          return { content: 'dates must be YYYY-MM-DD', is_error: true };
        }
        if (returnDate <= depart) return { content: 'return_date must be after depart_date', is_error: true };
        const tripDays = (new Date(returnDate).getTime() - new Date(depart).getTime()) / 86_400_000;
        if (tripDays > 62) return { content: `trip is ${Math.round(tripDays)} days; max 62 days (2 months)`, is_error: true };
        const r = queries.insertSearch({
          origin,
          destination: 'CAI',
          depart_date: depart,
          return_date: returnDate,
          adults: 4,
          infants: 1,
        });
        return { content: `Search created with id=${r.lastInsertRowid}: ${origin} → CAI, ${depart} → ${returnDate} for 4 adults + 1 infant.` };
      }

      case 'delete_search': {
        const id = Number(input.id);
        if (!Number.isInteger(id) || id <= 0) return { content: 'id must be a positive integer', is_error: true };
        const existing = queries.getSearch(id);
        if (!existing) return { content: `No search with id=${id}`, is_error: true };
        queries.deleteSearch(id);
        return { content: `Deleted search id=${id} (${existing.origin} → ${existing.destination}, ${existing.depart_date} → ${existing.return_date}).` };
      }

      case 'update_settings': {
        const updates: Record<string, string> = {};
        const valid = ['alert_threshold_per_adult_usd', 'max_display_per_adult_usd', 'alert_email', 'poll_interval_minutes'];
        for (const k of valid) {
          if (input[k] !== undefined && input[k] !== null) updates[k] = String(input[k]);
        }
        if (Object.keys(updates).length === 0) return { content: 'No settings provided to update.', is_error: true };
        for (const [k, v] of Object.entries(updates)) queries.setSetting(k, v);
        return { content: `Updated ${Object.keys(updates).length} setting(s): ${JSON.stringify(updates)}` };
      }

      default:
        return { content: `Unknown tool: ${name}`, is_error: true };
    }
  } catch (e) {
    return { content: `Tool error: ${(e as Error).message}`, is_error: true };
  }
}
