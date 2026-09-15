import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, isAdmin as isAdminUser } from '@/lib/auth';
import { queries } from '@/lib/db';
import { fmtUSD, fmtRelative } from '@/lib/utils';

export const dynamic = 'force-dynamic';


export default async function RevenuePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/admin/revenue');
  if (!isAdminUser(user)) redirect('https://flycheap.18dn.com/');

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

  const maxDailyClicks = Math.max(1, ...daily.map(d => d.clicks));
  const maxDailyRevenue = Math.max(1, ...daily.map(d => d.revenue_usd));
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
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="eyebrow mb-1">Affiliate revenue · last 30 days</div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Revenue</h1>
          <p className="text-sm text-slate-500 mt-1">
            Clicks logged from <code>/go</code> redirects · commissions from <code>commission_events</code> · EPC = revenue ÷ clicks.
          </p>
        </div>
        <Link href="/admin" className="text-xs text-slate-500 hover:underline">← back to admin</Link>
      </div>

      {!markerSet && (
        <div className="card border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
          <strong>⚠ TRAVELPAYOUTS_MARKER is not set in this environment.</strong> All current outbound clicks pay $0 commission. Set the env var and redeploy.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Clicks · 30d" value={totalClicks30d.toLocaleString()} />
        <StatCard label="Bookings · 30d" value={totalBookings30d.toLocaleString()} />
        <StatCard label="Paid revenue · 30d" value={fmtUSD(totalRevenue30d)} accent="emerald" />
        <StatCard label="EPC (actual)" value={fmtUSD(epc)} hint="paid ÷ clicks" />
      </div>

      <div className="card border-emerald-300/70 bg-emerald-50/70 dark:bg-emerald-950/30 dark:border-emerald-800/50">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="eyebrow text-emerald-700 dark:text-emerald-400">Actual earnings · Travelpayouts</div>
            <h2 className="!mb-1 mt-1">
              {tpBalanceUsd != null ? fmtUSD(tpBalanceUsd) : '—'}
              <span className="text-sm font-normal text-slate-500 ml-2">confirmed payable balance</span>
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Pulled live from the Travelpayouts finance API (<code>get_user_balance</code>) by the daily{' '}
              <code>commissions</code> cron. This is real, withdrawable money — it only moves once a booking
              clears the 60–180 day trip-completion pipeline. {tpBalanceUsd === 0 && 'Currently $0 — no bookings have cleared yet.'}
            </p>
            {tpBalanceUpdatedAt && (
              <p className="text-[11px] text-slate-400 mt-1">Last synced {fmtRelative(tpBalanceUpdatedAt)}</p>
            )}
            {tpBalanceError && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">Last sync issue: {tpBalanceError}</p>
            )}
            {tpBalanceUsd == null && !tpBalanceError && (
              <p className="text-[11px] text-slate-400 mt-1">Not synced yet — runs daily at 06:00, or trigger manually with <code>run-job.mjs commissions</code>.</p>
            )}
          </div>
          <div className="text-right text-xs text-slate-500 shrink-0">
            <div className="font-semibold text-slate-700 dark:text-slate-300">Withdraw at</div>
            <a href="https://www.travelpayouts.com/payouts" target="_blank" rel="noopener noreferrer" className="underline decoration-dotted hover:text-slate-700">travelpayouts.com/payouts</a>
            <div className="mt-1 text-slate-400">min $50 · PayPal / wire / crypto</div>
          </div>
        </div>
      </div>

      <div className="card bg-gradient-to-br from-cyan-50 to-emerald-50 dark:from-cyan-950/40 dark:to-emerald-950/30 border-cyan-200/60 dark:border-cyan-800/40 overflow-hidden relative">
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-emerald-400/10 blur-3xl pointer-events-none" />
        <div className="eyebrow text-cyan-700 dark:text-cyan-400">Forecast</div>
        <h2 className="!mb-3 mt-1">Potential earnings</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 leading-relaxed">
          Estimated revenue if your clicks convert at industry-standard EPC rates ($0.10/click for flights, $0.50–$0.70 for hotels, $1.20 for activities). Real earnings lag 60–180 days after booking.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Pot. earnings · 30d" value={fmtUSD(potentialEarnings30d)} accent="emerald" hint={`${totalClicks30d.toLocaleString()} clicks × ${fmtUSD(weightedPotentialEpc)} avg EPC`} />
          <StatCard label="Forecast · next 30d" value={fmtUSD(monthlyForecast)} hint={`based on last 7d run-rate (${(last7dClicks / 7).toFixed(1)} clicks/day)`} />
          <StatCard label="Weighted EPC" value={fmtUSD(weightedPotentialEpc)} hint="industry standard by surface mix" />
          <StatCard label="Daily run-rate" value={fmtUSD(dailyPotential)} hint="potential earnings per day at current click volume" />
        </div>
        <p className="text-[11px] text-slate-400 mt-4 italic">
          Forecast assumes industry-standard conversion: ~1% click-to-booking, $0.10 EPC for flights, higher for hotels/activities. Actual earnings depend on real OTA partner conversion + commission tiers + 60-180 day trip-completion delay.
        </p>
      </div>

      <div className="card">
        <h2>Daily clicks & revenue · last 90 days</h2>
        <div className="overflow-x-auto">
          <div className="flex items-end gap-[2px] h-32 min-w-[700px] mt-3">
            {daily.map(d => {
              const clickPct = (d.clicks / maxDailyClicks) * 100;
              const revPct = (d.revenue_usd / maxDailyRevenue) * 100;
              return (
                <div key={d.day} className="flex-1 flex flex-col items-stretch justify-end gap-[1px]" title={`${d.day} · ${d.clicks} clicks · ${fmtUSD(d.revenue_usd)} revenue`}>
                  <div className="bg-emerald-500/70" style={{ height: `${revPct * 0.5}%` }} />
                  <div className="bg-cyan-500/40" style={{ height: `${clickPct * 0.5}%` }} />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 mt-1">
            <span>{daily[0]?.day}</span>
            <span>{daily[daily.length - 1]?.day}</span>
          </div>
          <div className="flex gap-4 text-[11px] text-slate-500 mt-2">
            <span><span className="inline-block w-3 h-3 bg-cyan-500/40 align-middle mr-1" />clicks</span>
            <span><span className="inline-block w-3 h-3 bg-emerald-500/70 align-middle mr-1" />revenue</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="!mb-0">Commissions by partner · 30d</h2>
          <Link href="/admin/clicks" className="ad-btn">Click stream &amp; attribution →</Link>
        </div>
        <table className="w-full text-sm mt-3">
          <thead><tr className="text-left text-slate-500 text-xs uppercase tracking-wide"><th>Partner</th><th className="text-right">Bookings</th><th className="text-right">Revenue</th></tr></thead>
          <tbody>
            {byPartner.length === 0 && <tr><td colSpan={3} className="text-slate-400 py-2 text-center">No commissions recorded yet — pull stats from Travelpayouts or wait for postbacks.</td></tr>}
            {byPartner.map(r => (
              <tr key={r.partner} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1.5">{r.partner}</td>
                <td className="text-right tabular py-1.5">{r.bookings}</td>
                <td className="text-right tabular py-1.5 font-semibold text-emerald-700 dark:text-emerald-400">{fmtUSD(r.revenue_usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11.5px] text-white/40 mt-3">
          Traffic breakdowns — clicks by surface, by program, top routes and the raw click log — moved to{' '}
          <Link href="/admin/clicks" className="text-white/65 underline">Click stream</Link>.
        </p>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="!mb-0">Attach brands</h2>
          <span className="text-[11px] font-mono text-white/35">{attachClicks30d} click{attachClicks30d === 1 ? '' : 's'} · 30d</span>
        </div>
        <p className="text-[12px] text-slate-400 mt-1">
          High-value placements inside the existing Travelpayouts account — one sale is worth hundreds of flight clicks.
          Commission lands in the same Travelpayouts balance shown above.
        </p>
        <table className="w-full text-sm mt-3">
          <thead><tr className="text-left text-slate-500 text-xs uppercase tracking-wide">
            <th>Brand</th><th>Rate</th><th>Placement</th><th className="text-right">Clicks 30d</th><th className="text-right">Status</th>
          </tr></thead>
          <tbody>
            {attachRows.map(r => (
              <tr key={r.key} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1.5">{r.label}</td>
                <td className="py-1.5 text-slate-400">{r.rate}</td>
                <td className="py-1.5 text-slate-400">{r.placement}</td>
                <td className="text-right tabular py-1.5">{r.clicks30d}</td>
                <td className="text-right py-1.5">
                  {r.configured
                    ? <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Live</span>
                    : <span className="text-amber-500 font-semibold">Not configured</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11.5px] text-white/40 mt-3">
          A click here is not revenue. These pay only when the traveller actually buys, and the sale shows up in the
          Travelpayouts balance — not in this table. Zero clicks means the placement has not been seen yet, which with
          the current user count is expected rather than broken.
        </p>
      </div>

      <p className="text-xs text-slate-400">
        Commissions are populated by daily Travelpayouts stats pull at <code>/api/cron/pull-commissions</code>, or by partner postbacks to the existing webhook handler.
        EPC is conservative — only matches clicks and confirmed bookings within the 30-day window; payout-status filtering can be added later.
      </p>
    </div>
  );
}

function StatCard({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: 'emerald' }) {
  return (
    <div className="card card-elevated">
      <div className="eyebrow">{label}</div>
      <div className={`text-2xl font-bold tabular mt-1 ${accent === 'emerald' ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-100'}`}>{value}</div>
      {hint && <div className="text-[11px] text-slate-400 mt-1">{hint}</div>}
    </div>
  );
}
