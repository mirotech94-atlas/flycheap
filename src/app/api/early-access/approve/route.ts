import { NextRequest, NextResponse } from 'next/server';
import { decideEarlyAccess, approveAndProvision } from '@/lib/early-access';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

function page(title: string, body: string, ok = true) {
  return new NextResponse(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
  <style>/* Standalone document — no app stylesheet here, so the editorial palette is
  written out as literals, like the email templates. Flat, square, light. */
  body{margin:0;background:#FBFAF7;color:#14181B;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;display:grid;place-items:center;min-height:100vh}
  .c{max-width:460px;padding:36px;border:1px solid #E6E2DA;background:#FFFFFF;text-align:center}
  h1{font-family:Newsreader,Georgia,serif;font-weight:400;font-size:28px;letter-spacing:-.02em;margin:0 0 10px;color:${ok ? '#14181B' : '#B4453C'}}p{color:#3B3833;line-height:1.6;margin:0;font-size:14px}a{color:#1F615D}</style></head>
  <body><div class="c"><h1>${title}</h1><p>${body}</p></div></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

/** GET ?id=&t=&action=approve|decline — one-click links from the owner notification email. */
export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get('id'));
  const t = req.nextUrl.searchParams.get('t') ?? '';
  const action = req.nextUrl.searchParams.get('action') === 'decline' ? 'decline' : 'approve';
  if (!id || !t) return page('Invalid link', 'This approval link is missing its token.', false);
  const row = decideEarlyAccess(id, t, action);
  if (!row) return page('Invalid link', 'Token mismatch — this link is not valid for that request.', false);

  // Decisions made from the notification email are audited too, so the log is a
  // complete record regardless of which path the founder used.
  try {
    queries.insertAudit({
      user_id: null, email: null,
      action: `early_access.${action}`, entity: `early_access/${id}`,
      detail: { email: row.email, via: 'email-link' },
      ip: (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null,
    });
  } catch { /* audit is best-effort */ }
  if (action === 'approve') {
    await approveAndProvision(row);
    return page('Approved ✓', `${row.email} is in — their account is set up with the 3-month trial and a one-click sign-in link is on its way.`);
  }
  return page('Declined', `${row.email} was marked as declined. No email was sent to them.`);
}
