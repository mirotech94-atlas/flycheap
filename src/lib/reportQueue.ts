import 'server-only';
import { Resend } from 'resend';
import { queries, type ReportSendRow } from './db';
import { alertsFrom, ADDR } from './senders';
import { getOrg, groupsForOrg } from './org';
import { loadGroupSavings } from './orgQueue';
import { renewalSummary, type SavingsReport } from './workQueue';

/**
 * Monthly savings reports: review, then send.
 *
 * "A university office renewing a contract needs one number to take to a
 *  dean, and if your product does not produce it they will produce it
 *  themselves, badly, or not at all."
 *
 * The flow is deliberately three steps and never two:
 *
 *   queued   — the scheduler builds one report per group on the first of the
 *              month and parks it here
 *   approved — a human at the agency has READ it and cleared it, singly or in
 *              bulk
 *   sent     — and only then does it go to the client
 *
 * Nothing reaches a client that an agent has not looked at. The report is a
 * number the agency has to defend to their client, so the agency gets the
 * last look — and a report that lists the trips it could not score is exactly
 * the kind of thing someone should see before a client does.
 */

export type Period = { start: string; end: string; label: string };

/** The calendar month BEFORE the given date, in UTC. */
export function periodFor(now = new Date()): Period {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based; the previous month is m-1
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0)); // day 0 of this month = last day of previous
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    start: iso(first),
    end: iso(last),
    label: first.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  };
}

export type QueuedSummary = SavingsReport & { period: Period };

/**
 * Queue one report per group for the period. Idempotent: the unique index on
 * (group, period) means running this twice on the first of the month queues
 * nothing the second time, and a report already approved or sent is never
 * re-queued underneath the agent who approved it.
 *
 * Groups with nothing to say — no lines AND nothing unscored — are not queued.
 * An empty report is not a report, and it teaches people to skip the real ones.
 */
export function queueMonthlyReports(orgId: number, period = periodFor()): { queued: number; skipped: number } {
  const out = { queued: 0, skipped: 0 };
  for (const g of groupsForOrg(orgId)) {
    const report = loadGroupSavings(g.id, period.start, period.end);
    if (report.lines.length === 0 && report.unscored.length === 0) { out.skipped++; continue; }
    const summary: QueuedSummary = { ...report, period };
    const r = queries.queueReportSend({
      org_id: orgId,
      group_id: g.id,
      period_start: period.start,
      period_end: period.end,
      to_email: g.contact_email ?? null,
      summary_json: JSON.stringify(summary),
    });
    if (r.changes > 0) out.queued++; else out.skipped++;
  }
  return out;
}

/** Every org, on the first of the month. */
export function queueAllMonthlyReports(period = periodFor()): { orgs: number; queued: number } {
  let queued = 0;
  const orgs = queries.allOrgs();
  for (const o of orgs) queued += queueMonthlyReports(o.id, period).queued;
  return { orgs: orgs.length, queued };
}

export function parseSummary(row: ReportSendRow): QueuedSummary {
  return JSON.parse(row.summary_json) as QueuedSummary;
}

// ---------------------------------------------------------------------------
// The email
// ---------------------------------------------------------------------------

const INK = '#0a1426';
const MUTE = '#5b6678';
const RULE = 'rgba(10,20,38,.10)';
const LINK = '#0a3a6b';
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/**
 * The client-facing report. Light, inline styles, no amber or teal as text —
 * the established email design system here.
 *
 * Losses are printed in the same table as savings, and every unscored trip is
 * named with its reason. "A savings total that quietly omits the trips that
 * went badly is worse than no report; the first time a client notices, the
 * whole document stops being believed."
 */
export function renderSavingsReportEmail(input: {
  summary: QueuedSummary;
  orgName: string;
  fromName?: string | null;
}): { subject: string; html: string; text: string } {
  const s = input.summary;
  const who = input.fromName?.trim() || input.orgName;
  const subject = `${s.period.label} savings report — ${s.groupName}`;
  const scored = s.lines.length;
  const total = scored + s.unscored.length;
  const rs = renewalSummary({
    totalSavedUsd: s.totalSavedUsd, subscriptionCostUsd: 0,
    tripsScored: scored, tripsUnscored: s.unscored.length,
  });

  const rows = s.lines.map(l => `
    <tr>
      <td style="padding:8px 6px;border-bottom:1px solid ${RULE};font-family:'JetBrains Mono',monospace;font-size:13px">${esc(l.route)}</td>
      <td style="padding:8px 6px;border-bottom:1px solid ${RULE};text-align:right;color:${MUTE}">${money(l.baselineUsd)}</td>
      <td style="padding:8px 6px;border-bottom:1px solid ${RULE};text-align:right;color:${MUTE}">${money(l.bookedUsd)}</td>
      <td style="padding:8px 6px;border-bottom:1px solid ${RULE};text-align:right;font-weight:600;color:${l.savedUsd >= 0 ? INK : '#9a2f2f'}">
        ${l.savedUsd < 0 ? '−' : ''}${money(Math.abs(l.savedUsd))} (${l.savedPct < 0 ? '−' : ''}${Math.abs(l.savedPct).toFixed(0)}%)
      </td>
    </tr>`).join('');

  const unscored = s.unscored.length
    ? `<p style="font-size:13px;line-height:1.6;color:${MUTE};margin:16px 0 0">
         <strong style="color:${INK}">Not counted</strong> — ${s.unscored.map(u => `${esc(u.route)} (${esc(u.reason)})`).join(' · ')}.
         These are listed rather than dropped: a total that quietly leaves out the trips it could not
         score is not a total you can rely on.
       </p>`
    : '';

  const coverage = rs.coveragePct != null
    ? `<p style="font-size:13px;color:${MUTE};margin:6px 0 0">Based on ${scored} of ${total} trips${rs.coveragePct < 100 ? ` (${Math.round(rs.coveragePct)}% coverage)` : ''}.</p>`
    : '';

  const html = `
  <div style="font-family:Manrope,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:auto;padding:24px;color:${INK};background:#faf7ef">
    <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#8a93a6;font-family:'JetBrains Mono',monospace">${esc(who)} · ${esc(s.period.label)}</div>
    <h1 style="font-family:Fraunces,Georgia,serif;font-weight:400;font-size:28px;line-height:1.15;color:${LINK};margin:6px 0 4px">${esc(s.groupName)}: ${s.totalSavedUsd >= 0 ? 'saved' : 'net'} ${s.totalSavedUsd < 0 ? '−' : ''}${money(Math.abs(s.totalSavedUsd))}</h1>
    ${coverage}
    <p style="font-size:14px;line-height:1.6;color:${MUTE};margin:14px 0 18px">
      Savings are measured against the fare on the day each trip was requested — captured once and
      never recomputed — so this is a number you can put in front of anyone.
    </p>
    ${scored ? `
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead><tr>
        <th style="text-align:left;padding:6px;border-bottom:2px solid ${RULE};font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${MUTE}">Route</th>
        <th style="text-align:right;padding:6px;border-bottom:2px solid ${RULE};font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${MUTE}">Baseline</th>
        <th style="text-align:right;padding:6px;border-bottom:2px solid ${RULE};font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${MUTE}">Paid</th>
        <th style="text-align:right;padding:6px;border-bottom:2px solid ${RULE};font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${MUTE}">Saved</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>` : `<p style="font-size:14px;color:${MUTE}">No trips were scored this period.</p>`}
    ${unscored}
    <hr style="border:none;border-top:1px solid ${RULE};margin:24px 0 14px">
    <p style="font-size:12px;color:${MUTE};line-height:1.6;margin:0">Prepared by ${esc(who)} with FlyCheap. Reply to this email with any question about a line.</p>
  </div>`;

  const text = [
    subject, '',
    `${s.groupName}: ${s.totalSavedUsd >= 0 ? 'saved' : 'net'} ${s.totalSavedUsd < 0 ? '-' : ''}${money(Math.abs(s.totalSavedUsd))} in ${s.period.label}`,
    rs.coveragePct != null ? `Based on ${scored} of ${total} trips.` : '',
    '',
    ...s.lines.map(l => `${l.route}: baseline ${money(l.baselineUsd)}, paid ${money(l.bookedUsd)}, saved ${l.savedUsd < 0 ? '-' : ''}${money(Math.abs(l.savedUsd))}`),
    s.unscored.length ? '' : '',
    ...s.unscored.map(u => `Not counted: ${u.route} (${u.reason})`),
    '',
    `Prepared by ${who} with FlyCheap.`,
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export type Sender = (msg: { from: string; to: string; replyTo: string; subject: string; html: string; text: string })
  => Promise<{ id?: string; error?: string }>;

export type ReportRun = { due: number; sent: number; skipped: number; failed: number };

/**
 * Send every APPROVED report. Called from cron, every few minutes, so an
 * approval is followed by a send within the same sitting.
 *
 * The recipient is re-read from the group at send time rather than trusted
 * from the queued row, so a contact email corrected after queueing is used.
 * A group with no contact email is skipped WITH the reason, never sent to the
 * agency by fallback — that would look like the client got it.
 */
export async function sendApprovedReports(opts: { limit?: number; send?: Sender } = {}): Promise<ReportRun> {
  const due = queries.approvedReportSends(opts.limit ?? 100);
  const run: ReportRun = { due: due.length, sent: 0, skipped: 0, failed: 0 };
  if (due.length === 0) return run;

  let send = opts.send;
  if (!send) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      // Unconfigured is not failed: leave them approved so they go out once a
      // key exists, rather than silently burning an approval.
      run.skipped = due.length;
      return run;
    }
    const resend = new Resend(apiKey);
    send = async msg => {
      const res = await resend.emails.send(msg);
      return { id: res.data?.id, error: res.error?.message };
    };
  }

  for (const row of due) {
    const to = row.contact_email?.trim() || row.to_email?.trim() || '';
    if (!to) {
      queries.markReportSend(row.id, 'skipped', { reason: 'group has no contact email' });
      run.skipped++;
      continue;
    }
    const org = getOrg(row.org_id);
    const summary = parseSummary(row);
    const rendered = renderSavingsReportEmail({ summary, orgName: org?.name ?? 'Your travel team', fromName: org?.from_name });
    try {
      const res = await send({
        from: alertsFrom(org?.from_name?.trim() || 'FlyCheap Reports'),
        to, replyTo: org?.support_email?.trim() || ADDR.support,
        subject: rendered.subject, html: rendered.html, text: rendered.text,
      });
      if (res.error) throw new Error(res.error);
      queries.markReportSend(row.id, 'sent', { messageId: res.id });
      run.sent++;
    } catch (e) {
      queries.markReportSend(row.id, 'failed', { reason: (e as Error).message });
      queries.logError({ source: 'reports:send', message: `report ${row.id} for group ${row.group_id}: ${(e as Error).message}` });
      run.failed++;
    }
  }
  return run;
}
