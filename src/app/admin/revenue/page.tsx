import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, isAdmin as isAdminUser } from '@/lib/auth';
import { queries } from '@/lib/db';
import { fmtRelative } from '@/lib/utils';
import {
  PageHead, SectionHead, Panel, Kpi, Status, Table, fmtInt,
} from '../_components/ui';
import { AreaChart } from '../_components/AreaChart';

export const dynamic = 'force-dynamic';

function usd(n: number | null, digits = 2): string {
  return n == null ? '—' : `$${n.toFixed(digits)}`;
}

export default async function RevenuePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/admin/revenue');
  if (!isAdminUser(user)) redirect('https://flycheap.live/');

  const stats = queries.monthlyAffiliateStats();
  const byProvider = queries.clicksByProvider30d(); // weights the EPC forecast by click mix
  const byPartner = queries.commissionsByPartner30d();
  const daily = queries.dailyClicksAndRevenue90d();

  const totalClicks30d = stats.clicks_30d;
  const totalRevenue30d = stats.revenue_30d;
  const totalBookings30d = stats.commissions_30d;
  const epc = totalClicks30d > 0 ? totalRevenue30d / totalClicks30d : 0;

  // Potential-earnings forecast. Industry-standard travel-affiliate EPC is
  // $0.05–$0.20 for flights, $0.30–$0.80 for hotels, $1+ for tours. We weight
  // by the click mix actually observed so the forecast adapts as the surface
  // mix changes (more hotels = higher forecast).
  const EPC_BY_PROGRAM: Record<string, number> = {
    aviasales: 0.10,
    'aviasales-tpk': 0.10,
    travelpayouts: 0.10,
    wayaway: 0.18,
    hotellook: 0.55,
    kayak: 0.12,
    booking: 0.70,
    'hotels.com': 0.50,
    expedia: 0.40,
    getyourguide: 1.20,
    klook: 0.65,
    trip: 0.30,
    vrbo: 0.45,
    // Attach brands. Far higher value per sale than a flight click, but the
    // EPC is still modest because only a small share of clickers buy.
    // EKTA: 25% of premium; a ~$50 policy pays ~$12.50, at ~3% conversion.
    // Kiwitaxi: 50% rev-share ≈ $5 on a ~$40 transfer, at ~8% conversion.
    ekta: 0.38,
    kiwitaxi: 0.40,
  };
  const weightedPotentialEpc = (() => {
    if (byProvider.length === 0) return 0.10; // default = Aviasales rate
    let weighted = 0;
    let total = 0;
    for (const r of byProvider) {
      const rate = EPC_BY_PROGRAM[r.provider] ?? 0.10;
      weighted += rate * r.clicks;
      total += r.clicks;
    }
    return total > 0 ? weighted / total : 0.10;
  })();
  const potentialEarnings30d = totalClicks30d * weightedPotentialEpc;
  // Daily run-rate based on last 7 days (more current than 30d average)
  const last7dClicks = daily.slice(-7).reduce((s, d) => s + d.clicks, 0);
  const dailyPotential = (last7dClicks / 7) * weightedPotentialEpc;
  const monthlyForecast = dailyPotential * 30;

  const markerSet = Boolean(process.env.AVIASALES_MARKER || process.env.TRAVELPAYOUTS_MARKER);

  // ACTUAL earnings — confirmed payable balance pulled straight from the
  // Travelpayouts finance API (get_user_balance) by the daily `commissions`
  // cron. This is real money that has cleared the booking→trip-completion
  // pipeline, as opposed to the click × EPC *estimate* in the Forecast card.
  // ── Attach brands (EKTA insurance, Kiwitaxi transfers) ──────────────────
  // These are the highest revenue-per-sale placements we have. Surfaced
  // separately because they are new and their click volume is small enough to
  // vanish inside the aviasales-dominated provider table.
  const ATTACH = [
    { key: 'ekta', label: 'EKTA — travel insurance', rate: '25% of premium',
      placement: 'Fare-alert email', env: 'TP_LINK_EKTA' },
    { key: 'kiwitaxi', label: 'Kiwitaxi — airport transfers', rate: '50% revenue share',
      placement: 'Stay card (dashboard + /hotels)', env: 'TP_LINK_KIWITAXI' },
  ] as const;
  const attachRows = ATTACH.map(a => ({
    ...a,
    configured: Boolean((process.env[a.env] ?? '').trim()),
    clicks30d: byProvider.find(r => r.provider === a.key)?.clicks ?? 0,
  }));
  const attachClicks30d = attachRows.reduce((s, r) => s + r.clicks30d, 0);

  const tpBalanceRaw = queries.getSetting('tp_balance_usd');
  const tpBalanceUsd = tpBalanceRaw != null ? parseFloat(tpBalanceRaw) : null;
  const tpBalanceUpdatedAt = queries.getSetting('tp_balance_updated_at') ?? null;
  const tpBalanceError = queries.getSetting('tp_balance_error') || null;

  return (
    <div>
      <PageHead
        eyebrow="Affiliate revenue · last 30 days"
        title="Revenue"
        sub="Clicks logged from /go redirects · commissions from commission_events · EPC = revenue ÷ clicks."
        right={<Link href="/admin" className="ad-btn">← back to admin</Link>}
      />

      {!markerSet && (
        <Panel className="mb-6">
          <Status tone="bad">TRAVELPAYOUTS_MARKER is not set in this environment</Status>
          <p className="ad-note mt-1.5">All current outbound clicks pay $0 commission. Set the env var and redeploy.</p>
        </Panel>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-6">
        <Kpi label="Clicks · 30d" value={fmtInt(totalClicks30d)} />
        <Kpi label="Bookings · 30d" value={fmtInt(totalBookings30d)} />
        <Kpi label="Paid revenue · 30d" value={usd(totalRevenue30d)} tone="good" />
        <Kpi label="EPC (actual)" value={usd(epc)} foot="paid ÷ clicks" />
      </div>

      <SectionHead title="Actual earnings" sub="The confirmed payable balance — real money, not a forecast" />
      <Panel className="mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="ad-eyebrow accent mb-1">Actual earnings · Travelpayouts</div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="ad-kpi-value ad-tone-good">{tpBalanceUsd != null ? usd(tpBalanceUsd) : '—'}</span>
              <span className="ad-note">confirmed payable balance</span>
            </div>
            <p className="ad-note mt-2 leading-relaxed max-w-[52ch]">
              Pulled live from the Travelpayouts finance API (<code>get_user_balance</code>) by the daily{' '}
              <code>commissions</code> cron. This is real, withdrawable money — it only moves once a booking
              clears the 60–180 day trip-completion pipeline. {tpBalanceUsd === 0 && 'Currently $0 — no bookings have cleared yet.'}
            </p>
            {tpBalanceUpdatedAt && (
              <p className="ad-note mt-1">Last synced {fmtRelative(tpBalanceUpdatedAt)}</p>
            )}
            {tpBalanceError && (
              <p className="mt-1 text-[11px]" style={{ color: 'var(--red)' }}>Last sync issue: {tpBalanceError}</p>
            )}
            {tpBalanceUsd == null && !tpBalanceError && (
              <p className="ad-note mt-1">Not synced yet — runs daily at 06:00, or trigger manually with <code>run-job.mjs commissions</code>.</p>
            )}
          </div>
          <div className="text-right text-[12px] shrink-0" style={{ color: 'var(--muted)' }}>
            <div className="font-semibold" style={{ color: 'var(--ink-soft)' }}>Withdraw at</div>
            <a href="https://app.travelpayouts.com" target="_blank" rel="noopener noreferrer"
               className="underline decoration-dotted" style={{ color: 'var(--accent)' }}>app.travelpayouts.com</a>
            <div className="mt-1 ad-note">min $50 · PayPal / wire / crypto</div>
          </div>
        </div>
      </Panel>

      <SectionHead title="Potential earnings" sub="Modelled from industry-standard EPC rates, not a promise" />
      <Panel className="mb-6">
        <div className="ad-eyebrow accent mb-1">Forecast</div>
        <p className="ad-note mb-4 leading-relaxed max-w-[64ch]">
          Estimated revenue if your clicks convert at industry-standard EPC rates ($0.10/click for flights,
          $0.50–$0.70 for hotels, $1.20 for activities). Real earnings lag 60–180 days after booking.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Pot. earnings · 30d" value={usd(potentialEarnings30d)} tone="good"
               foot={`${fmtInt(totalClicks30d)} clicks × ${usd(weightedPotentialEpc)} avg EPC`} />
          <Kpi label="Forecast · next 30d" value={usd(monthlyForecast)}
               foot={`based on last 7d run-rate (${(last7dClicks / 7).toFixed(1)} clicks/day)`} />
          <Kpi label="Weighted EPC" value={usd(weightedPotentialEpc)} foot="industry standard by surface mix" />
          <Kpi label="Daily run-rate" value={usd(dailyPotential)} foot="potential earnings per day at current click volume" />
        </div>
        <p className="ad-note mt-4 italic">
          Forecast assumes industry-standard conversion: ~1% click-to-booking, $0.10 EPC for flights, higher for
          hotels/activities. Actual earnings depend on real OTA partner conversion + commission tiers + 60-180 day
          trip-completion delay.
        </p>
      </Panel>

      <SectionHead title="Daily clicks & revenue · last 90 days"
                   sub={`Revenue per day against the forecast run-rate — ${daily.length}-day window`} />
      <Panel className="mb-6">
        <AreaChart
          points={daily.map(d => ({ x: d.day.slice(5), y: d.revenue_usd }))}
          compare={daily.map(d => ({ x: d.day.slice(5), y: dailyPotential }))}
        />
        <div className="flex items-center gap-4 mt-2">
          <span className="ad-note inline-flex items-center gap-1.5">
            <span className="ed-dot" style={{ background: 'var(--accent)' }} /> revenue
          </span>
          <span className="ad-note inline-flex items-center gap-1.5">
            <span className="ed-dot amber" /> forecast run-rate ({usd(dailyPotential)}/day)
          </span>
        </div>
      </Panel>

      <SectionHead title="Commissions by partner · 30d"
                   right={<Link href="/admin/clicks" className="ad-btn">Click stream &amp; attribution →</Link>} />
      <Panel className="mb-6">
        <Table head={['Partner', 'Bookings', 'Revenue']}>
          {byPartner.length === 0 ? (
            <tr><td colSpan={3} className="ad-note text-center py-2">No commissions recorded yet — pull stats from Travelpayouts or wait for postbacks.</td></tr>
          ) : byPartner.map(r => (
            <tr key={r.partner}>
              <td>{r.partner}</td>
              <td className="font-mono tabular-nums">{fmtInt(r.bookings)}</td>
              <td className="font-mono tabular-nums ad-tone-good">{usd(r.revenue_usd)}</td>
            </tr>
          ))}
        </Table>
        <p className="ad-note mt-3">
          Traffic breakdowns — clicks by surface, by program, top routes and the raw click log — moved to{' '}
          <Link href="/admin/clicks" className="underline" style={{ color: 'var(--accent)' }}>Click stream</Link>.
        </p>
      </Panel>

      <SectionHead title="Attach brands"
                   right={<span className="ad-note" style={{ fontFamily: 'var(--font-mono-ed)', fontSize: '11px' }}>{attachClicks30d} click{attachClicks30d === 1 ? '' : 's'} · 30d</span>} />
      <Panel className="mb-6">
        <p className="ad-note mb-3 max-w-[70ch]">
          High-value placements inside the existing Travelpayouts account — one sale is worth hundreds of flight clicks.
          Commission lands in the same Travelpayouts balance shown above.
        </p>
        <Table head={['Brand', 'Rate', 'Placement', 'Clicks 30d', 'Status']}>
          {attachRows.map(r => (
            <tr key={r.key}>
              <td>{r.label}</td>
              <td className="ad-note">{r.rate}</td>
              <td className="ad-note">{r.placement}</td>
              <td className="font-mono tabular-nums">{fmtInt(r.clicks30d)}</td>
              <td><Status tone={r.configured ? 'good' : 'neutral'}>{r.configured ? 'Live' : 'Not configured'}</Status></td>
            </tr>
          ))}
        </Table>
        <p className="ad-note mt-3">
          A click here is not revenue. These pay only when the traveller actually buys, and the sale shows up in the
          Travelpayouts balance — not in this table. Zero clicks means the placement has not been seen yet, which with
          the current user count is expected rather than broken.
        </p>
      </Panel>

      <p className="ad-note leading-relaxed">
        Commissions are populated by daily Travelpayouts stats pull at <code>/api/cron/pull-commissions</code>, or by
        partner postbacks to the existing webhook handler. EPC is conservative — only matches clicks and confirmed
        bookings within the 30-day window; payout-status filtering can be added later.
      </p>
    </div>
  );
}
