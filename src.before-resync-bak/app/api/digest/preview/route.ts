import { buildDigestHtml, buildAnomalyDigestHtml } from '@/lib/digest';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
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
