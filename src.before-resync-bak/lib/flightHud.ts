export type FlightHudRoute = {
  id: string;
  origin: string;
  destination: string;
  outboundDate?: string;
  returnDate?: string;
  outboundFlightNo?: string;
  returnFlightNo?: string;
  perAdultUsd?: number;
  partyTotalUsd?: number;
  tripLengthDays?: number;
  outboundTransfers?: number;
  returnTransfers?: number;
  provider?: string;
};

export type FlightHudStats = {
  count: number;
  bestPerAdultUsd?: number;
  averagePerAdultUsd?: number;
  maxPerAdultFilter?: number;
  activeSearchCount?: number;
  recentAlertCount?: number;
};

export type FlightHudPayload = {
  id: string;
  question: string;
  reply: string;
  createdAt: string;
  routes: FlightHudRoute[];
  stats: FlightHudStats;
  source: 'best_deals' | 'summary' | 'poll' | 'alerts' | 'message';
};

type ToolResult = {
  name: string;
  input: unknown;
  content: string;
};

function finiteNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function makeId(seed: string): string {
  return seed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) ||
    `flight-${Date.now()}`;
}

function routeFromBestDeal(deal: Record<string, unknown>, index: number): FlightHudRoute {
  const origin = String(deal.origin || 'JFK').toUpperCase();
  const destination = String(deal.destination || 'CAI').toUpperCase();
  const outboundDate = typeof deal.outbound_date === 'string' ? deal.outbound_date : undefined;
  const returnDate = typeof deal.return_date === 'string' ? deal.return_date : undefined;
  return {
    id: makeId(`${origin}-${destination}-${outboundDate || index}-${returnDate || ''}`),
    origin,
    destination,
    outboundDate,
    returnDate,
    outboundFlightNo: typeof deal.outbound_flight_no === 'string' ? deal.outbound_flight_no : undefined,
    returnFlightNo: typeof deal.return_flight_no === 'string' ? deal.return_flight_no : undefined,
    perAdultUsd: finiteNumber(deal.per_adult_usd),
    partyTotalUsd: finiteNumber(deal.party_total_usd),
    tripLengthDays: finiteNumber(deal.trip_length_days),
    outboundTransfers: finiteNumber(deal.outbound_transfers),
    returnTransfers: finiteNumber(deal.return_transfers),
    provider: typeof deal.provider === 'string' ? deal.provider : undefined,
  };
}

function routeFromSummaryFare(fare: Record<string, unknown>, index: number): FlightHudRoute {
  const route = String(fare.route || 'JFK -> CAI');
  const [rawOrigin, rawDestination] = route.split(/[→>-]+/).map(s => s.trim().toUpperCase());
  const outboundDate = typeof fare.depart === 'string' ? fare.depart : undefined;
  const returnDate = typeof fare.return === 'string' ? fare.return : undefined;
  return {
    id: makeId(`${rawOrigin || 'JFK'}-${rawDestination || 'CAI'}-${outboundDate || index}-${returnDate || ''}`),
    origin: rawOrigin || 'JFK',
    destination: rawDestination || 'CAI',
    outboundDate,
    returnDate,
    outboundFlightNo: typeof fare.outbound_flight === 'string' ? fare.outbound_flight : undefined,
    returnFlightNo: typeof fare.return_flight === 'string' ? fare.return_flight : undefined,
    perAdultUsd: finiteNumber(fare.cheapest_per_adult_usd),
    partyTotalUsd: finiteNumber(fare.party_total_usd),
  };
}

function statsForRoutes(routes: FlightHudRoute[], extra: Partial<FlightHudStats> = {}): FlightHudStats {
  const prices = routes.map(r => r.perAdultUsd).filter((n): n is number => typeof n === 'number');
  return {
    count: routes.length,
    bestPerAdultUsd: prices.length ? Math.min(...prices) : undefined,
    averagePerAdultUsd: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : undefined,
    ...extra,
  };
}

export function buildFlightHudPayload(
  question: string,
  reply: string,
  toolResults: ToolResult[],
): FlightHudPayload | null {
  const latestBestDeals = [...toolResults].reverse().find(t => t.name === 'find_best_deals');
  if (latestBestDeals) {
    try {
      const parsed = JSON.parse(latestBestDeals.content) as {
        deals?: Array<Record<string, unknown>>;
        count?: number;
        max_per_adult_filter?: number;
      };
      const routes = (parsed.deals || []).slice(0, 8).map(routeFromBestDeal);
      if (routes.length) {
        return {
          id: makeId(`${question}-${Date.now()}`),
          question,
          reply,
          createdAt: new Date().toISOString(),
          routes,
          stats: statsForRoutes(routes, {
            count: finiteNumber(parsed.count) ?? routes.length,
            maxPerAdultFilter: finiteNumber(parsed.max_per_adult_filter),
          }),
          source: 'best_deals',
        };
      }
    } catch {
      return null;
    }
  }

  const latestSummary = [...toolResults].reverse().find(t => t.name === 'get_summary' || t.name === 'poll_now');
  if (latestSummary) {
    try {
      const parsed = JSON.parse(latestSummary.content) as {
        fares?: Array<Record<string, unknown>>;
        active_search_count?: number;
        recent_alert_count?: number;
      } | Array<Record<string, unknown>>;
      const fares = Array.isArray(parsed) ? parsed : parsed.fares || [];
      const routes = fares.slice(0, 8).map(routeFromSummaryFare).filter(r => r.perAdultUsd !== undefined);
      if (routes.length) {
        return {
          id: makeId(`${question}-${Date.now()}`),
          question,
          reply,
          createdAt: new Date().toISOString(),
          routes,
          stats: statsForRoutes(routes, Array.isArray(parsed) ? {} : {
            activeSearchCount: finiteNumber(parsed.active_search_count),
            recentAlertCount: finiteNumber(parsed.recent_alert_count),
          }),
          source: latestSummary.name === 'poll_now' ? 'poll' : 'summary',
        };
      }
    } catch {
      return null;
    }
  }

  return null;
}
