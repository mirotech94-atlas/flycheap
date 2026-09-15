import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { pullCommissions } from '@/lib/travelpayoutsStats';

export const dynamic = 'force-dynamic';

// Same-origin enforcement: the cookie is SameSite=Lax which mitigates most
// cross-site CSRF, but a sibling-subdomain XSS on *.18dn.com could still
// trigger this admin POST. Reject requests whose Origin/Referer doesn't
// match our public URL.
function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const host = req.headers.get('host');
  if (!host) return false;
  const expectedHosts = [host, 'flycheap.18dn.com', 'flycheap.18dn.com'];
  const allowed = (url: string | null) => {
    if (!url) return false;
    try {
      const h = new URL(url).hostname.toLowerCase();
      return expectedHosts.some(eh => h === eh.toLowerCase() || h.endsWith('.' + eh.toLowerCase()));
    } catch { return false; }
  };
  // Require at least one of Origin/Referer to match. Browsers always send
  // one or the other on form/fetch POSTs; absence of both is suspicious.
  return allowed(origin) || allowed(referer);
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: 'origin not allowed' }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const allowList = (process.env.ADMIN_EMAILS ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const isAdmin = allowList.includes(user.email.toLowerCase());
  if (!isAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const result = await pullCommissions();
  return NextResponse.json(result);
}
