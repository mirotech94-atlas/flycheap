import { NextRequest, NextResponse } from 'next/server';
import {
  peekEarlyAccessDecision, consumeEarlyAccessDecision, approveAndProvision, APPROVE_LINK_TTL_DAYS,
} from '@/lib/early-access';
import { queries } from '@/lib/db';
import { escapeHtml as h } from '@/lib/html';
import { clientIp } from '@/lib/adminGuard';

export const dynamic = 'force-dynamic';

/** `bodyHtml` is trusted markup: every visitor-supplied value in it must
 *  already have gone through escapeHtml. The title is escaped here. */
function page(title: string, bodyHtml: string, ok = true) {
  return new NextResponse(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${h(title)}</title>
  <style>/* Standalone document — no app stylesheet here, so the editorial palette is
  written out as literals, like the email templates. Flat, square, light. */
  body{margin:0;background:#FBFAF7;color:#14181B;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;display:grid;place-items:center;min-height:100vh}
  .c{max-width:460px;padding:36px;border:1px solid #E6E2DA;background:#FFFFFF;text-align:center}
  h1{font-family:Newsreader,Georgia,serif;font-weight:400;font-size:28px;letter-spacing:-.02em;margin:0 0 10px;color:${ok ? '#14181B' : '#B4453C'}}p{color:#3B3833;line-height:1.6;margin:0;font-size:14px}a{color:#1F615D}
  button{margin-top:22px;font:inherit;font-weight:600;padding:12px 22px;border:1px solid #14181B;background:#14181B;color:#FFFFFF;cursor:pointer}</style></head>
  <body><div class="c"><h1>${h(title)}</h1>${bodyHtml}</div></body></html>`, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      // The token rides in the URL; never hand it to another origin.
      'Referrer-Policy': 'no-referrer',
    },
  });
}

const invalid = () => page('Link no longer valid',
  `<p>This link is wrong, has already been used, or is more than ${APPROVE_LINK_TTL_DAYS} days old. Decide on the request from Admin → Signups instead.</p>`, false);

function parseAction(v: unknown): 'approve' | 'decline' {
  return v === 'decline' ? 'decline' : 'approve';
}

/**
 * GET ?id=&t=&action= — the link in the owner's notification email. It only
 * CONFIRMS: mail scanners and link previewers fetch every URL in an email, so a
 * GET that approved would let them approve (or decline) requests on their own.
 */
export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get('id'));
  const t = req.nextUrl.searchParams.get('t') ?? '';
  const action = parseAction(req.nextUrl.searchParams.get('action'));
  if (!Number.isInteger(id) || id <= 0 || !t) return invalid();
  const row = peekEarlyAccessDecision(id, t);
  if (!row) return invalid();
  const verb = action === 'approve' ? 'Approve' : 'Decline';
  return page(`${verb} this request?`, `
    <p>${h(row.name ?? '')}${row.name ? ' · ' : ''}${h(row.email)}</p>
    <form method="post" action="/api/early-access/approve">
      <input type="hidden" name="id" value="${h(row.id)}">
      <input type="hidden" name="t" value="${h(t)}">
      <input type="hidden" name="action" value="${h(action)}">
      <button type="submit">${h(verb)}</button>
    </form>`);
}

/** POST id, t, action — the confirmation. The token is consumed atomically. */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const id = Number(form?.get('id'));
  const t = String(form?.get('t') ?? '');
  const action = parseAction(form?.get('action'));
  if (!Number.isInteger(id) || id <= 0 || !t) return invalid();
  const row = consumeEarlyAccessDecision(id, t, action);
  if (!row) return invalid();

  // Decisions made from the notification email are audited too, so the log is a
  // complete record regardless of which path the founder used.
  try {
    queries.insertAudit({
      user_id: null, email: null,
      action: `early_access.${action}`, entity: `early_access/${id}`,
      detail: { email: row.email, via: 'email-link' },
      ip: clientIp(req.headers) || null,
    });
  } catch { /* audit is best-effort */ }
  if (action === 'approve') {
    await approveAndProvision(row);
    return page('Approved ✓', `<p>${h(row.email)} is in — their account is set up with the 3-month trial and a one-click sign-in link is on its way.</p>`);
  }
  return page('Declined', `<p>${h(row.email)} was marked as declined. No email was sent to them.</p>`);
}
