import { NextResponse } from 'next/server';
import { queries } from '@/lib/db';
import { getCurrentUser, isAdmin, SESSION_COOKIE } from '@/lib/auth';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

async function gate() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
  if (!isAdmin(user)) return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  return { user };
}

// DELETE /api/admin/sessions?token=...     — revoke one session
// DELETE /api/admin/sessions?user_id=...   — revoke ALL sessions for that user
export async function DELETE(req: Request) {
  const g = await gate();
  if ('error' in g) return g.error;
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  const userIdStr = url.searchParams.get('user_id');

  if (token) {
    // Don't allow admin to accidentally revoke their own current session via this
    // endpoint — refuse if the token matches the caller's cookie.
    const cookieStore = await cookies();
    const myToken = cookieStore.get(SESSION_COOKIE)?.value;
    if (myToken === token) {
      return NextResponse.json({ error: 'cannot revoke your own current session here — use /api/auth/logout' }, { status: 400 });
    }
    queries.revokeSession(token);
    queries.insertAudit({
      user_id: g.user.id, email: g.user.email,
      action: 'admin.session.revoke', entity: `token:${token.slice(0, 8)}…`,
      detail: null,
      ip: req.headers.get('x-forwarded-for') ?? null,
    });
    return NextResponse.json({ ok: true });
  }

  if (userIdStr) {
    const uid = parseInt(userIdStr, 10);
    if (!Number.isFinite(uid)) return NextResponse.json({ error: 'bad user_id' }, { status: 400 });
    queries.revokeAllSessionsForUser(uid);
    queries.insertAudit({
      user_id: g.user.id, email: g.user.email,
      action: 'admin.session.revoke_all', entity: `user:${uid}`,
      detail: null,
      ip: req.headers.get('x-forwarded-for') ?? null,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'provide token= or user_id=' }, { status: 400 });
}
