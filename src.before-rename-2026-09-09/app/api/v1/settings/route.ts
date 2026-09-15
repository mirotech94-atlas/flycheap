import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiAuthBearer } from '@/lib/mobileAuth';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** GET /api/v1/settings — per-user threshold + push/quiet-hours prefs. */
export async function GET(req: Request) {
  const user = await apiAuthBearer(req);
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const g = (k: string) => queries.getUserSetting(user.id, k);
  return NextResponse.json({
    alertThresholdPerAdultUsd: parseFloat(
      g('alert_threshold_per_adult_usd') ?? queries.getSetting('alert_threshold_per_adult_usd') ?? '900',
    ),
    pushEnabled: g('push_enabled') !== 'false',
    quietHoursStart: g('quiet_hours_start') ?? null,
    quietHoursEnd: g('quiet_hours_end') ?? null,
    tzOffsetMin: g('tz_offset_min') != null ? parseInt(g('tz_offset_min')!, 10) : null,
  });
}

const PatchSchema = z.object({
  alertThresholdPerAdultUsd: z.number().positive().max(100000).optional(),
  pushEnabled: z.boolean().optional(),
  quietHoursStart: z.string().regex(/^\d{1,2}:\d{2}$/).nullable().optional(),
  quietHoursEnd: z.string().regex(/^\d{1,2}:\d{2}$/).nullable().optional(),
  // Minutes east of UTC (e.g. EDT = -240) so quiet hours apply in the user's local time.
  tzOffsetMin: z.number().int().min(-840).max(840).optional(),
});

/** PATCH /api/v1/settings — update any subset of the above. */
export async function PATCH(req: Request) {
  const user = await apiAuthBearer(req);
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  const set = (k: string, v: string) => queries.setUserSetting(user.id, k, v);
  const del = (k: string) => queries.deleteUserSetting(user.id, k);

  if (d.alertThresholdPerAdultUsd !== undefined) set('alert_threshold_per_adult_usd', String(d.alertThresholdPerAdultUsd));
  if (d.pushEnabled !== undefined) set('push_enabled', d.pushEnabled ? 'true' : 'false');
  if (d.quietHoursStart !== undefined) d.quietHoursStart === null ? del('quiet_hours_start') : set('quiet_hours_start', d.quietHoursStart);
  if (d.quietHoursEnd !== undefined) d.quietHoursEnd === null ? del('quiet_hours_end') : set('quiet_hours_end', d.quietHoursEnd);
  if (d.tzOffsetMin !== undefined) set('tz_offset_min', String(d.tzOffsetMin));

  return NextResponse.json({ ok: true });
}
