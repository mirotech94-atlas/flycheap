import { buildDigestHtml, buildAnomalyDigestHtml } from '@/lib/digest';
import { requireUser } from '@/lib/apiGuard';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // GUARD: middleware.ts does not run on api/ routes, so this handler is
  // the only thing protecting it. Renders a digest built from account data.
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const kind = searchParams.get('kind') === 'weekly' ? 'weekly' : 'daily';
  const built = kind === 'weekly' ? buildAnomalyDigestHtml() : buildDigestHtml();
  return new Response(built.html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Digest-Subject': encodeURIComponent(built.subject),
    },
  });
}
