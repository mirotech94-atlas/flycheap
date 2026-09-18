import Link from 'next/link';
import { getDb, queries } from '@/lib/db';
import { providerStatuses } from '@/lib/providers';
import {
  PageHead, SectionHead, Panel, Kpi, Status, BarRow, ActionRow, Table,
  fmtInt, fmtMoney, ago, minutesSince, type Tone,
} from './_components/ui';

export const dynamic = 'force-dynamic';

/** Everything the command centre shows, read in one pass. */
function brief() {
  const db = getDb();
  const one = <T,>(sql: string, ...a: unknown[]) => db.prepare(sql).get(...a) as T;

  // This portal reports on CLIENTS. The founder's own account and its activity
  // are excluded everywhere, otherwise internal testing reads as traction.
  const ownerEmail = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
  const ownerRow = ownerEmail
    ? one<{ id: number } | undefined>(`SELECT id FROM users WHERE lower(email) = ?`, ownerEmail)
    : undefined;
  const ownerId = ownerRow?.id ?? -1;

  const aff = queries.monthlyAffiliateStats();
  const daily = queries.dailyClicksAndRevenue90d();

  // Client user base — founder excluded
  const u = one<{ total: number; free: number; pro: number; ent: number; d7: number; d30: number }>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN tier = 'free' THEN 1 ELSE 0 END) AS free,
            SUM(CASE WHEN tier = 'pro' THEN 1 ELSE 0 END) AS pro,
            SUM(CASE WHEN tier = 'enterprise' THEN 1 ELSE 0 END) AS ent,
            SUM(CASE WHEN created_at >= datetime('now','-7 days') THEN 1 ELSE 0 END) AS d7,
            SUM(CASE WHEN created_at >= datetime('now','-30 days') THEN 1 ELSE 0 END) AS d30
       FROM users WHERE id <> ?`, ownerId);
  const m = {
    users: { total: u.total ?? 0, free: u.free ?? 0, pro: u.pro ?? 0, enterprise: u.ent ?? 0 },
    signups: { last7d: u.d7 ?? 0, last30d: u.d30 ?? 0 },
    active_searches: one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM searches WHERE active = 1 AND user_id <> ?`, ownerId).n,
  };
  const signupSeries = db.prepare(
    `SELECT date(created_at) AS day, COUNT(*) AS n FROM users
      WHERE id <> ? AND created_at >= datetime('now','-30 days')
      GROUP BY day ORDER BY day`).all(ownerId) as Array<{ day: string; n: number }>;

  // The founder's own footprint, reported separately so it never reads as traction.
  const ownRoutes = one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM searches WHERE active = 1 AND user_id = ?`, ownerId).n;

  // Subscriptions
  // MRR counts only genuine paying subscriptions. Tier alone is not revenue:
  // the founder/comp accounts carry an enterprise tier with no subscription.
  const billing = one<{ pro: number; ent: number }>(
    `SELECT SUM(CASE WHEN tier = 'pro' THEN 1 ELSE 0 END) AS pro,
            SUM(CASE WHEN tier = 'enterprise' THEN 1 ELSE 0 END) AS ent
       FROM users
      WHERE subscription_status IN ('active','trialing','past_due') AND id <> ?`, ownerId);
  const billedPro = billing.pro ?? 0;
  const billedEnt = billing.ent ?? 0;
  const paidUsers = billedPro + billedEnt;
  const mrr = billedPro * 9 + billedEnt * 39;
  const compAccounts = (m.users.pro + m.users.enterprise) - paidUsers;
  // Every account on the platform, founder included. Revenue metrics stay
  // client-only (the founder is a comp, not a customer, and counting him
  // produced phantom MRR) — but the headcount should reconcile with reality:
  // "2 client accounts" when 3 people have signed up reads as a bug.
  const allAccounts = one<{ n: number }>(`SELECT COUNT(*) AS n FROM users`).n;
  const ownerTier = one<{ tier: string } | undefined>(
    `SELECT tier FROM users WHERE id = ?`, ownerId)?.tier ?? null;
  const founding = one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM users WHERE subscription_status = 'founding_free' AND id <> ?`, ownerId).n;
  const foundingEnding = one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM users WHERE subscription_status = 'founding_free' AND id <> ?
       AND trial_ends_at IS NOT NULL AND trial_ends_at < datetime('now','+14 days')`, ownerId).n;
  const upgradeDue = one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM users WHERE subscription_status = 'upgrade_due' AND id <> ?`, ownerId).n;
  const pastDue = one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM users WHERE subscription_status = 'past_due' AND id <> ?`, ownerId).n;

  // Waitlist
  let waitlist = { total: 0, pending: 0, approved: 0 };
  try {
    waitlist = one<{ total: number; pending: number; approved: number }>(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN approved_at IS NULL AND declined_at IS NULL THEN 1 ELSE 0 END) AS pending,
              SUM(CASE WHEN approved_at IS NOT NULL THEN 1 ELSE 0 END) AS approved
         FROM early_access WHERE lower(email) <> ?`, ownerEmail);
  } catch { /* table not created until first signup */ }

  // Operations
  const lastPoll = one<{ t: string | null }>(`SELECT MAX(polled_at) AS t FROM fare_snapshots`).t;
  const lastAttempt = one<{ t: string | null }>(`SELECT MAX(called_at) AS t FROM api_calls`).t;
  const snapshots = one<{ n: number }>(`SELECT COUNT(*) AS n FROM fare_snapshots`).n;
  const snapshots24h = one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM fare_snapshots WHERE polled_at >= datetime('now','-1 day')`).n;
  const lastAlert = one<{ t: string | null }>(`SELECT MAX(sent_at) AS t FROM alerts_sent`).t;
  const alerts24h = one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM alerts_sent WHERE sent_at >= datetime('now','-1 day')`).n;
  const routesNoTarget = one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM searches WHERE active = 1 AND target_per_adult_usd IS NULL AND user_id <> ?`, ownerId).n;
  const routesExpired = one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM searches WHERE active = 1 AND date(depart_date) < date('now') AND user_id <> ?`, ownerId).n;
  let errors24h = 0;
  try {
    errors24h = one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM error_log WHERE occurred_at >= datetime('now','-1 day')`).n;
  } catch { /* optional table */ }

  const provs = providerStatuses();
  const provOk = provs.filter(p => p.isConfigured);

  // Commercial trend: clicks over the last 30 days
  const clicks30 = daily.slice(-30).map(d => d.clicks);
  const clicksPrev7 = daily.slice(-14, -7).reduce((s, d) => s + d.clicks, 0);
  const clicksLast7 = daily.slice(-7).reduce((s, d) => s + d.clicks, 0);
  const clickTrendPct = clicksPrev7 > 0
    ? Math.max(-99, Math.min(999, Math.round(((clicksLast7 - clicksPrev7) / clicksPrev7) * 100)))
    : null;

  const clientClicks30d = one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM affiliate_clicks
      WHERE occurred_at >= datetime('now','-30 days')
        AND (user_id IS NULL OR user_id <> ?)`, ownerId).n;
  const ownClicks30d = Math.max(0, aff.clicks_30d - clientClicks30d);

  const tpBalance = (() => {
    const raw = queries.getSetting('tp_balance_usd');
    return raw != null ? parseFloat(raw) : null;
  })();

  return {
    m, aff, daily, signupSeries, paidUsers, mrr, billedPro, billedEnt, compAccounts, founding, foundingEnding, upgradeDue, pastDue,
    waitlist, lastPoll, lastAttempt, snapshots, snapshots24h, lastAlert, alerts24h, routesNoTarget, routesExpired,
    errors24h, provs, provOk, clicks30, clicksLast7, clickTrendPct, tpBalance,
    ownRoutes, clientClicks30d, ownClicks30d, allAccounts, ownerTier,
  };
}

export default async function CommandCenter() {
  const b = brief();
  const pollMin = minutesSince(b.lastAttempt);
  const pollTone: Tone = pollMin == null ? 'bad' : pollMin > 90 ? 'bad' : pollMin > 45 ? 'warn' : 'good';
  const signupSpark = b.signupSeries.map(d => d.n ?? 0);

  // Action items, most urgent first. Only real conditions — no filler.
  const actions: Array<{ tone: Tone; title: string; detail: string; href?: string; cta?: string }> = [];
  if (pollTone === 'bad') actions.push({ tone: 'bad', title: 'Fare poller is stale', detail: `No poll has run in ${ago(b.lastAttempt)}. Alerts cannot fire while the poller is down.`, href: '/admin/health', cta: 'Health' });
  if (b.pastDue > 0) actions.push({ tone: 'bad', title: `${b.pastDue} subscription${b.pastDue === 1 ? '' : 's'} past due`, detail: 'Payment failed and Stripe is retrying. The account drops to Free if it cannot collect.', href: '/admin/users', cta: 'Users' });
  if (b.waitlist.pending > 0) actions.push({ tone: 'gold', title: `${b.waitlist.pending} access request${b.waitlist.pending === 1 ? '' : 's'} waiting`, detail: 'Approve from the request email to send the invite, or review the full waitlist.', href: '/admin/signups#waitlist', cta: 'Review' });
  if (b.foundingEnding > 0) actions.push({ tone: 'warn', title: `${b.foundingEnding} founding trial${b.foundingEnding === 1 ? '' : 's'} end within 14 days`, detail: 'Upgrade nudges send automatically when each trial completes.', href: '/admin/users', cta: 'Users' });
  if (b.upgradeDue > 0) actions.push({ tone: 'gold', title: `${b.upgradeDue} account${b.upgradeDue === 1 ? '' : 's'} finished the founding trial`, detail: 'Prime upgrade candidates — they used the product free for three months.', href: '/admin/users', cta: 'Users' });
  if (b.routesExpired > 0) actions.push({ tone: 'warn', title: `${b.routesExpired} tracked route${b.routesExpired === 1 ? '' : 's'} already departed`, detail: 'These burn polling quota without any chance of an alert. Archive them from the route-coverage grid.', href: '/admin/health#coverage', cta: 'Archive' });
  if (b.routesNoTarget > 0) actions.push({ tone: 'warn', title: `${b.routesNoTarget} active route${b.routesNoTarget === 1 ? '' : 's'} without a target price`, detail: `Threshold alerts fall back to the global default instead of the traveller’s own number. Tune that default in Settings.`, href: '/admin/settings', cta: 'Settings' });
  if (b.errors24h > 0) actions.push({ tone: b.errors24h > 25 ? 'bad' : 'warn', title: `${b.errors24h} error${b.errors24h === 1 ? '' : 's'} logged in 24h`, detail: 'Grouped by message on the errors page.', href: '/admin/errors', cta: 'Errors' });
  if (b.m.users.total > 0 && b.m.active_searches === 0) actions.push({ tone: 'warn', title: `${b.m.users.total} client account${b.m.users.total === 1 ? '' : 's'} but no tracked routes`, detail: 'Accounts exist yet nobody has added a route, so no client can receive an alert. Activation is the bottleneck, not acquisition.', href: '/admin/users', cta: 'Accounts' });
  if (b.provOk.length < b.provs.length) actions.push({ tone: 'neutral', title: `${b.provs.length - b.provOk.length} fare provider${b.provs.length - b.provOk.length === 1 ? '' : 's'} not configured`, detail: `Live: ${b.provOk.map(p => p.id).join(', ') || 'none'}. Adding a provider widens coverage and lowers the cheapest fare.`, href: '/admin/integrations', cta: 'Integrations' });

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="space-y-7">
      <PageHead
        eyebrow="Command centre · founder briefing"
        title="Today at FlyCheap"
        sub={`${today} · live production data for your clients. Your own founder account, its ${b.ownRoutes} tracked route${b.ownRoutes === 1 ? '' : 's'} and its clicks are excluded throughout.`}
        right={
          <>
            <Status tone={pollTone}>{pollTone === 'good' ? 'Engine healthy' : pollTone === 'warn' ? 'Engine slow' : 'Engine stalled'}</Status>
            <Link href="/admin/revenue" className="ad-btn ad-btn-gold">Revenue detail →</Link>
          </>
        }
      />

      {/* ── The money line ───────────────────────────────── */}
      <SectionHead title="Commercial" sub="Subscriptions and affiliate performance" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          label="Recurring revenue" value={fmtMoney(b.mrr)} unit="/ mo" tone="gold"
          foot={b.paidUsers === 0
            ? `No billed subscriptions yet${b.compAccounts > 0 ? ` · ${b.compAccounts} comp account${b.compAccounts === 1 ? '' : 's'} excluded` : ''}`
            : `${b.paidUsers} billed seat${b.paidUsers === 1 ? '' : 's'} · Pro ${b.billedPro} · Enterprise ${b.billedEnt}`}
          href="/admin/revenue"
        />
        <Kpi
          label="Visitor booking clicks · 30d" value={fmtInt(b.clientClicks30d)}
          delta={b.clickTrendPct != null ? `${b.clickTrendPct >= 0 ? '+' : ''}${b.clickTrendPct}% wk` : undefined}
          deltaTone={b.clickTrendPct == null ? 'neutral' : b.clickTrendPct >= 0 ? 'good' : 'bad'}
          spark={b.clicks30}
          foot={b.ownClicks30d > 0
            ? `${b.clicksLast7} in the last 7 days · ${b.ownClicks30d} of your own excluded`
            : `${b.clicksLast7} in the last 7 days`}
          href="/admin/clicks"
        />
        <Kpi
          label="Confirmed commission" value={fmtMoney(b.aff.revenue_30d, 2)}
          foot={`${b.aff.commissions_30d} booking${b.aff.commissions_30d === 1 ? '' : 's'} cleared · 30d`}
          href="/admin/revenue"
        />
        <Kpi
          label="Payable balance" value={b.tpBalance != null ? fmtMoney(b.tpBalance, 2) : '—'}
          tone={b.tpBalance && b.tpBalance >= 50 ? 'good' : 'neutral'}
          foot={b.tpBalance != null ? (b.tpBalance >= 50 ? 'Above the $50 withdrawal minimum' : 'Travelpayouts · $50 minimum to withdraw') : 'Awaiting first sync from Travelpayouts'}
          href="/admin/revenue"
        />
      </div>

      {/* ── Customers ─────────────────────────────────────── */}
      <SectionHead title="Customers" sub="Acquisition, activation and the founding cohort" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          label="Accounts" value={fmtInt(b.allAccounts)}
          spark={signupSpark}
          foot={`${fmtInt(b.m.users.total)} client${b.m.users.total === 1 ? '' : 's'} + you${b.ownerTier ? ` (${b.ownerTier}, comp)` : ''} · ${b.m.signups.last7d} new in 7d`}
          href="/admin/users"
        />
        <Kpi
          label="Founding trials" value={fmtInt(b.founding)} tone="gold"
          foot={b.foundingEnding > 0 ? `${b.foundingEnding} ending within 14 days` : 'Three months free, then an upgrade nudge'}
          href="/admin/users"
        />
        <Kpi
          label="Waitlist pending" value={fmtInt(b.waitlist.pending)}
          tone={b.waitlist.pending > 0 ? 'gold' : 'neutral'}
          foot={`${b.waitlist.approved} approved of ${b.waitlist.total} requests`}
          href="/admin/signups"
        />
        <Kpi
          label="Paid conversion" value={`${b.m.users.total ? Math.round((b.paidUsers / b.m.users.total) * 100) : 0}%`}
          foot={`${b.paidUsers} of ${b.m.users.total} client account${b.m.users.total === 1 ? '' : 's'} on a billed plan`}
          href="/admin/signups"
        />
      </div>

      {/* ── Operations + attention ─────────────────────────── */}
      <SectionHead title="Operations" sub="The fare engine behind every alert" />
      <div className="grid lg:grid-cols-3 gap-3 items-start">
        <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-3 content-start">
          <Kpi label="Last poll" value={pollMin == null ? '—' : pollMin < 60 ? `${Math.round(pollMin)}` : `${Math.round(pollMin / 60)}`}
            unit={pollMin == null ? '' : pollMin < 60 ? 'min ago' : 'h ago'} tone={pollTone}
            foot={`${fmtInt(b.snapshots24h)} snapshots in 24h`} href="/admin/health" />
          <Kpi label="Client routes" value={fmtInt(b.m.active_searches)}
            tone={b.m.active_searches === 0 ? 'warn' : 'neutral'}
            foot={`${b.ownRoutes} of your own not counted · ${fmtInt(b.snapshots)} fares recorded`} href="/admin/health" />
          <Kpi label="Alerts · 24h" value={fmtInt(b.alerts24h)}
            foot={b.lastAlert ? `Last ${ago(b.lastAlert)}` : 'None sent yet'} href="/admin/queue" />
          <Kpi label="Providers live" value={`${b.provOk.length}/${b.provs.length}`}
            tone={b.provOk.length > 0 ? 'good' : 'bad'}
            foot={b.provOk.map(p => p.id).join(', ') || 'None configured'} href="/admin/integrations" />
        </div>

        <Panel title="Attention required" sub={actions.length === 0 ? undefined : `${actions.length} item${actions.length === 1 ? '' : 's'}`} tone={actions.length > 0 ? 'gold' : undefined}>
          {actions.length === 0 ? (
            <div className="py-6 text-center">
              <div className="text-emerald-300 text-sm font-medium">All clear</div>
              <div className="text-[11.5px] text-white/40 mt-1">Poller healthy, no failed payments, no pending requests.</div>
            </div>
          ) : (
            <div>{actions.slice(0, 6).map((a, i) => <ActionRow key={i} {...a} />)}</div>
          )}
        </Panel>
      </div>

      {/* ── Mix panels ─────────────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-3">
        <Panel title="Client plan mix" sub="Your clients only — your own account is excluded" right={<Link href="/admin/signups" className="ad-btn">Funnel →</Link>}>
          <BarRow label="Free" value={b.m.users.free} max={b.m.users.total || 1} />
          <BarRow label="Pro · $9/mo" value={b.m.users.pro} max={b.m.users.total || 1} tone="good"
            right={`${b.m.users.pro} · ${b.billedPro} billed`} />
          <BarRow label="Enterprise · $39/mo" value={b.m.users.enterprise} max={b.m.users.total || 1} tone="gold"
            right={`${b.m.users.enterprise} · ${b.billedEnt} billed`} />
          <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-baseline justify-between">
            <span className="text-[11.5px] text-white/45">Committed monthly revenue</span>
            <span className="font-mono text-[#F2C67A] text-sm tabular-nums">{fmtMoney(b.mrr)}</span>
          </div>
          {b.compAccounts > 0 && (
            <div className="text-[11px] text-white/35 mt-1.5 leading-snug">
              {b.compAccounts} account{b.compAccounts === 1 ? '' : 's'} hold{b.compAccounts === 1 ? 's' : ''} a paid tier without a
              billed subscription (founder / comp) and {b.compAccounts === 1 ? 'is' : 'are'} excluded from revenue.
            </div>
          )}
        </Panel>

        <Panel title="Fare providers" sub="Every source polled for a cheapest fare" right={<Link href="/admin/integrations" className="ad-btn">Manage →</Link>}>
          <Table head={['Provider', 'Status', 'Role']}>
            {b.provs.map(p => (
              <tr key={p.id}>
                <td className="font-medium text-white/85">{p.label ?? p.id}</td>
                <td><Status tone={p.isConfigured ? 'good' : 'neutral'}>{p.isConfigured ? 'Live' : 'Not configured'}</Status></td>
                <td className="text-white/45 text-[11.5px]">{p.isConfigured ? (p.isEnabled ? 'In the polling fan-out' : 'Configured, disabled') : 'Add a key to enable'}</td>
              </tr>
            ))}
          </Table>
        </Panel>
      </div>
    </div>
  );
}
