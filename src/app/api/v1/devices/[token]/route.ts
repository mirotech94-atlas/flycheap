import { NextResponse } from 'next/server';
import { apiAuthBearer } from '@/lib/mobileAuth';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** DELETE /api/v1/devices/:token — unregister a push token (on logout). */
export async function DELETE(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const user = await apiAuthBearer(req);
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { token } = await ctx.params;
  queries.deletePushDevice(decodeURIComponent(token));
  return NextResponse.json({ ok: true });
}
