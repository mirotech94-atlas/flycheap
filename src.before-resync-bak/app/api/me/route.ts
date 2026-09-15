import { NextResponse } from 'next/server';
import { getCurrentUser, endSession } from '@/lib/auth';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      tier: user.tier,
      brand_color: user.brand_color,
      logo_url: user.logo_url,
      sender_email: user.sender_email,
      custom_domain: (user as { custom_domain?: string | null }).custom_domain ?? null,
      stripe_customer_id: user.stripe_customer_id,
      subscription_status: user.subscription_status,
      subscription_renews_at: user.subscription_renews_at,
    },
  });
}

// Account deletion — cascades through searches/sessions/user_settings via FK.
// The Owner account (id=1) is protected so we don't accidentally nuke the
// legacy single-user dataset.
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  if (user.id === 1) {
    return NextResponse.json({ ok: false, error: 'Owner account cannot be deleted via API.' }, { status: 403 });
  }
  // Cascade: searches → fare_snapshots; sessions; magic_links; user_settings.
  // The FK definitions are ON DELETE CASCADE for sessions + user_settings;
  // searches we delete explicitly (no FK from fare_snapshots back to users).
  const db = getDb();
  db.transaction(() => {
    db.prepare(`DELETE FROM fare_snapshots WHERE search_id IN (SELECT id FROM searches WHERE user_id = ?)`).run(user.id);
    db.prepare(`DELETE FROM searches WHERE user_id = ?`).run(user.id);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(user.id);
  })();
  await endSession();
  return NextResponse.json({ ok: true, deleted: true });
}
