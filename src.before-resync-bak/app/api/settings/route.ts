import { NextResponse } from 'next/server';
import { z } from 'zod';
import { queries } from '@/lib/db';
import { restartCron } from '@/lib/cron';

export async function GET() {
  return NextResponse.json({
    alert_threshold_per_adult_usd: parseFloat(queries.getSetting('alert_threshold_per_adult_usd') ?? '900'),
    alert_email: queries.getSetting('alert_email') ?? '',
    poll_interval_minutes: parseInt(queries.getSetting('poll_interval_minutes') ?? '30', 10),
    max_display_per_adult_usd: parseFloat(queries.getSetting('max_display_per_adult_usd') ?? '1200'),
    price_drop_pct: parseFloat(queries.getSetting('price_drop_pct') ?? '10'),
  });
}

const PutSchema = z.object({
  alert_threshold_per_adult_usd: z.number().positive().optional(),
  alert_email: z.string().email().optional(),
  poll_interval_minutes: z.number().int().min(5).max(1440).optional(),
  max_display_per_adult_usd: z.number().positive().optional(),
  price_drop_pct: z.number().min(1).max(80).optional(),
  enabled_providers: z.string().regex(/^[a-z,]+$/).optional(),
  usd_to_egp: z.number().positive().optional(),
});

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  let cadenceChanged = false;
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    queries.setSetting(k, String(v));
    if (k === 'poll_interval_minutes') cadenceChanged = true;
  }
  if (cadenceChanged) restartCron();
  return NextResponse.json({ ok: true });
}
