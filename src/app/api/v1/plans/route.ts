import { NextResponse } from 'next/server';
import { TIER_LIMITS } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/plans — public. The one source of truth for what each tier
 * actually gives you, read straight from TIER_LIMITS so the app's pricing
 * screen can never advertise a limit the server doesn't enforce.
 *
 * Public on purpose: the pricing screen is reachable before sign-in, and
 * nothing here is user-specific.
 */
const PRICES: Record<string, { month: number; year: number } | null> = {
  free: null,
  pro: { month: 9, year: 90 },
  enterprise: { month: 39, year: 390 },
};

// Every first sign-up gets a 3-month founding trial of the full product.
const TRIAL_DAYS: Record<string, number> = { free: 90, pro: 0, enterprise: 0 };

export async function GET() {
  const plans = (['free', 'pro', 'enterprise'] as const).map((id) => {
    const t = TIER_LIMITS[id];
    return {
      id,
      price: PRICES[id],
      trialDays: TRIAL_DAYS[id] ?? 0,
      maxRoutes: t.maxRoutes,
      // pollIntervalMin is deliberately NOT published. It is an internal floor
      // for the poll allocator, not a plan feature, and an API client that
      // renders it would be publishing the same promise the pricing page just
      // stopped making. See lib/tierCopy.ts.
      historyDays: t.historyDays,
      anyDates: t.anyDates,
      priceDropAlerts: t.priceDropAlerts,
      familyShare: t.familyShare,
      channels: t.channels,
    };
  });
  return NextResponse.json({ plans });
}
