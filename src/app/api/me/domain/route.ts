import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

const Body = z.object({
  domain: z.string().regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i)
    .nullable().or(z.literal('')),
});

export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  if (user.tier === 'free') {
    return NextResponse.json({
      ok: false,
      error: 'Custom domain requires Pro or Enterprise.',
      upgrade_url: '/api/billing/checkout',
    }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Invalid domain format' }, { status: 400 });

  const next = parsed.data.domain && parsed.data.domain !== '' ? parsed.data.domain.toLowerCase() : null;
  // Reserve obvious system hosts
  if (next && /tracker\.18dn\.com|localhost|vercel\.app/.test(next)) {
    return NextResponse.json({ ok: false, error: 'That domain is reserved.' }, { status: 400 });
  }
  if (next) {
    const taken = queries.getUserByCustomDomain(next);
    if (taken && taken.id !== user.id) {
      return NextResponse.json({ ok: false, error: 'Domain already claimed by another account.' }, { status: 409 });
    }
  }
  queries.setUserCustomDomain(user.id, next);
  return NextResponse.json({
    ok: true,
    domain: next,
    cname_target: 'flycheap.18dn.com',
    note: next
      ? `Add a CNAME record: ${next} → flycheap.18dn.com. Once DNS propagates, your dashboard will load there with your branding.`
      : 'Custom domain removed.',
  });
}
