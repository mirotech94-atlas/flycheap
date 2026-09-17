import { NextResponse } from 'next/server';
import { apiAuthBearer } from '@/lib/mobileAuth';
import { providerCatalog } from '@/lib/ai/providers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/ai-providers
 * The FarePilot failover chain, for the app's "AI providers" screen — the same
 * registry the chat routes build their chain from, so the two can't drift.
 *
 * Never exposes key material. `note` is deliberately dropped: it names the env
 * vars needed to enable a dormant provider, which is operator detail, not
 * something a customer's phone should carry.
 */
export async function GET(req: Request) {
  const user = await apiAuthBearer(req);
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const all = providerCatalog().sort((a, b) => a.order - b.order);
  const live = all.filter((p) => p.configured);

  return NextResponse.json({
    // Ordered exactly as a request walks the chain; position 0 is primary.
    chain: live.map((p, i) => ({
      id: p.id,
      label: p.label,
      models: p.models.slice(0, 2),
      position: i,
      primary: i === 0,
    })),
    dormant: all.filter((p) => !p.configured).map((p) => ({ id: p.id, label: p.label })),
    modelCount: live.reduce((n, p) => n + Math.min(2, p.models.length), 0),
  });
}
