import { redirect } from 'next/navigation';
import { getCurrentUser, isAdmin as isAdminUser } from '@/lib/auth';
import { trustMetrics, HARD_DELTA_THRESHOLD_PCT } from '@/lib/analytics';
import { APP_URL } from '@/lib/hosts';
import {
  PageHead, SectionHead, Kpi, Panel, Status, Table, BarRow, fmtInt, ago,
  type Tone,
} from '../_components/ui';

export const dynamic = 'force-dynamic';

/**
 * Dashboard 1 — is the engine telling the truth?
 *
 * First, because everything else is worthless if it fails. A user clicking a
 * $484 alert and landing on $689 happens once and they never trust an alert
 * again.
 *
 * Every figure here is derived. Where there is not enough evidence to state a
 * number, the page says so rather than showing a confident zero — a dashboard
 * that reports 0% when it means "unknown" is worse than no dashboard, because
 * it gets acted on.
 */

/** "—" and a reason, rather than a number we cannot stand behind. */
function Unknown({ why }: { why: string }) {
  return (
    <span className="text-white/35">
      —<span className="ml-2 text-[11px] font-normal normal-case tracking-normal">{why}</span>
    </span>
  );
}

function pctStr(n: number | null, digits = 1): string {
  return n == null ? '—' : `${n.toFixed(digits)}%`;
}

export default async function TrustPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/admin/trust');
  if (!isAdminUser(user)) redirect(APP_URL);

  const m = trustMetrics(7);

  // Targets from the spec: delta near zero with p90 under a few percent, dead-
  // fare rate under 2%, poll success above 99%.
  const deltaTone: Tone =
    m.deltaP90Pct == null ? 'neutral'
      : m.deltaP90Pct <= 3 ? 'good'
      : m.deltaP90Pct <= HARD_DELTA_THRESHOLD_PCT ? 'warn' : 'bad';
  const deadTone: Tone =
    m.deadFareRatePct == null ? 'neutral'
      : m.deadFareRatePct < 2 ? 'good'
      : m.deadFareRatePct < 5 ? 'warn' : 'bad';

  const worstProvider = m.providerSuccess.length
    ? m.providerSuccess.reduce((a, b) => (a.okPct <= b.okPct ? a : b))
    : null;
  const pollTone: Tone =
    !worstProvider ? 'neutral' : worstProvider.okPct >= 99 ? 'good' : worstProvider.okPct >= 95 ? 'warn' : 'bad';

  const v7 = m.verdict7d;

  return (
    <div>
      <PageHead
        eyebrow="Dashboard 1"
        title="Is the engine telling the truth?"
        sub="The fare we showed against the fare that was there when they clicked. Everything else on this
             site is worthless if these numbers go wrong, so a regression here is a production incident,
             not a metrics wobble. Last 7 days."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-6">
        <Kpi
          label="Alert-to-click delta · median"
          value={m.deltaSamples > 0 ? pctStr(m.deltaMedianPct) : <Unknown why="no re-queried clicks yet" />}
          tone={deltaTone}
          foot={`Target: near zero. ${fmtInt(m.deltaSamples)} clicks re-queried at click time.`}
        />
        <Kpi
          label="Alert-to-click delta · p90"
          value={m.deltaSamples > 0 ? pctStr(m.deltaP90Pct) : <Unknown why="no re-queried clicks yet" />}
          tone={deltaTone}
          foot="Target: under a few percent. Drifting upward means a provider is going stale or the verification tolerance is too loose."
        />
        <Kpi
          label="Dead-fare rate"
          value={m.deadFareRatePct == null ? <Unknown why="no alerts considered yet" /> : pctStr(m.deadFareRatePct)}
          tone={deadTone}
          foot={`Target: under 2%. ${fmtInt(m.deadFares7d)} route-days suppressed of ${fmtInt(m.alertsConsidered7d)} alert opportunities`
                + (m.deadFareEvents7d > m.deadFares7d
                    ? ` · ${fmtInt(m.deadFareEvents7d)} raw suppressions — a stuck fare re-suppresses every cycle and burns a verification call each time.`
                    : '.')}
        />
        <Kpi
          label="Verdict accuracy · 7 day"
          value={v7.accuracyPct == null
            ? <Unknown why={`${fmtInt(v7.scored)} scored, need 20`} />
            : pctStr(v7.accuracyPct, 0)}
          tone={v7.accuracyPct == null ? 'neutral' : v7.accuracyPct >= 70 ? 'good' : 'warn'}
          foot="Of fares we called buy, how many went lower within 7 days. Publish this on the marketing site once it is good — it is the number that separates us from every tool that asserts a prediction and never scores itself."
        />
      </div>

      <SectionHead
        title="Verdict scoring"
        sub="Our own buy/wait calls, scored against what the price actually did"
      />
      <div className="grid gap-3 lg:grid-cols-2 mb-6">
        <Panel title="By call, 7-day horizon" sub="Unscored calls are excluded, never counted as correct">
          {v7.byVerdict.length === 0 ? (
            <p className="text-sm text-white/45">
              No calls have been scored yet. Calls are recorded on every poll and scored once their
              7-day horizon has elapsed, so the first figures appear a week after this ships.
            </p>
          ) : (
            <Table head={['Call', 'Scored', 'Correct', 'Accuracy']}>
              {v7.byVerdict.map(r => (
                <tr key={r.verdict}>
                  <td className="capitalize">{r.verdict}</td>
                  <td className="font-mono tabular-nums">{fmtInt(r.scored)}</td>
                  <td className="font-mono tabular-nums">{fmtInt(r.correct)}</td>
                  <td className="font-mono tabular-nums">
                    {r.accuracyPct == null
                      ? <span className="text-white/35">— need 20</span>
                      : `${r.accuracyPct.toFixed(0)}%`}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>

        <Panel title="14-day horizon" sub="A buy that looked right at 7 days can still be wrong at 14">
          {m.verdict14d.byVerdict.length === 0 ? (
            <p className="text-sm text-white/45">Nothing scored at 14 days yet.</p>
          ) : (
            <Table head={['Call', 'Scored', 'Correct', 'Accuracy']}>
              {m.verdict14d.byVerdict.map(r => (
                <tr key={r.verdict}>
                  <td className="capitalize">{r.verdict}</td>
                  <td className="font-mono tabular-nums">{fmtInt(r.scored)}</td>
                  <td className="font-mono tabular-nums">{fmtInt(r.correct)}</td>
                  <td className="font-mono tabular-nums">
                    {r.accuracyPct == null
                      ? <span className="text-white/35">— need 20</span>
                      : `${r.accuracyPct.toFixed(0)}%`}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </div>

      <SectionHead title="Providers" sub="A silent provider failure looks exactly like a stable price" />
      <div className="grid gap-3 lg:grid-cols-2 mb-6">
        <Panel
          title="Poll success rate"
          sub="Target: above 99%"
          right={<Status tone={pollTone}>
            {worstProvider ? `worst: ${worstProvider.provider} ${worstProvider.okPct.toFixed(1)}%` : 'no calls yet'}
          </Status>}
        >
          {m.providerSuccess.length === 0 ? (
            <p className="text-sm text-white/45">No provider calls recorded in this window.</p>
          ) : (
            <Table head={['Provider', 'Calls', 'Success']}>
              {m.providerSuccess.map(r => (
                <tr key={r.provider}>
                  <td>{r.provider}</td>
                  <td className="font-mono tabular-nums">{fmtInt(r.calls)}</td>
                  <td className="font-mono tabular-nums">
                    <Status tone={r.okPct >= 99 ? 'good' : r.okPct >= 95 ? 'warn' : 'bad'}>
                      {r.okPct.toFixed(1)}%
                    </Status>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>

        <Panel
          title="Provider disagreement"
          sub="Tracked per pair — two providers quoting materially different prices for the same query"
        >
          {m.disagreements.length === 0 ? (
            <p className="text-sm text-white/45">
              No material disagreements recorded. Either the providers agree, or only one provider is
              enabled and there is nothing to disagree with.
            </p>
          ) : (
            <div>
              {m.disagreements.map(d => (
                <BarRow
                  key={d.pair}
                  label={d.pair}
                  value={d.n}
                  max={Math.max(...m.disagreements.map(x => x.n))}
                  tone={d.medianDeltaPct >= 10 ? 'bad' : 'neutral'}
                  right={`${fmtInt(d.n)} · median ${d.medianDeltaPct.toFixed(1)}%`}
                />
              ))}
            </div>
          )}
        </Panel>
      </div>

      <SectionHead
        title="Flagged alerts"
        sub={`Delta beyond ${HARD_DELTA_THRESHOLD_PCT}% — audit the route`}
      />
      <Panel>
        {m.flagged.length === 0 ? (
          <p className="text-sm text-white/45">
            Nothing flagged. Every alert-to-click delta in this window is inside {HARD_DELTA_THRESHOLD_PCT}%.
          </p>
        ) : (
          <Table head={['Route', 'Shown', 'At click', 'Delta', 'When']}>
            {m.flagged.map(f => (
              <tr key={f.token}>
                <td>{f.origin ?? '?'} → {f.destination ?? '?'}</td>
                <td className="font-mono tabular-nums">${Math.round(f.shown)}</td>
                <td className="font-mono tabular-nums">${Math.round(f.atClick)}</td>
                <td className="font-mono tabular-nums">
                  <Status tone={Math.abs(f.deltaPct) >= 20 ? 'bad' : 'warn'}>
                    {f.deltaPct > 0 ? '+' : ''}{f.deltaPct.toFixed(1)}%
                  </Status>
                </td>
                <td className="text-white/50">{ago(f.occurred_at)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}
