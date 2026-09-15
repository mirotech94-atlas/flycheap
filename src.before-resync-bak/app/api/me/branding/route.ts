import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

const PutSchema = z.object({
  brand_color:  z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  logo_url:     z.string().url().max(500).nullable().optional(),
  sender_email: z.string().email().nullable().optional(),
});

export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Sign in required.' }, { status: 401 });

  // White-label is a Pro/Enterprise perk. Free tier gets a clear upsell.
  if (user.tier === 'free') {
    return NextResponse.json({
      ok: false,
      error: 'White-label branding requires Pro or Enterprise.',
      upgrade_url: '/api/billing/checkout',
    }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });

  // Merge with existing values so a partial PUT only changes what was sent.
  queries.setUserBranding(user.id, {
    brand_color:  parsed.data.brand_color  !== undefined ? parsed.data.brand_color  : user.brand_color,
    logo_url:     parsed.data.logo_url     !== undefined ? parsed.data.logo_url     : user.logo_url,
    sender_email: parsed.data.sender_email !== undefined ? parsed.data.sender_email : user.sender_email,
  });
  return NextResponse.json({ ok: true });
}
