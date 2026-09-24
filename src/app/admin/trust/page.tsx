import { redirect } from 'next/navigation';
import { getCurrentUser, isAdmin as isAdminUser } from '@/lib/auth';
import { trustMetrics, HARD_DELTA_THRESHOLD_PCT } from '@/lib/analytics';
import { APP_URL } from '@/lib/hosts';
import { loadFareModel, lastTrainingRun, FEATURE_NAMES } from '@/lib/nn';
import {
  PageHead, SectionHead, Kpi, Panel, Status, Table, fmtInt, ago,
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
    <span style={{ color: 'var(--muted-2)' }}>
      —<span className="ml-2 text-[11px] font-normal normal-case tracking-normal">{why}</span>
    </span>
  );
}

function pctStr(n: number | null, digits = 1): string {
  return n == null ? '—' : `${n.toFixed(digits)}%`;
}

/** One row of the "Provider disagreement" ranked list — the task 3.4
 *  feature block (README "ranked bars"): name + meta / 8px bar on
 *  --track / mono value. Bar length is `n` ranked against the max `n` in
 *  the shown list, same measure the BarRow version used. `red` (not
 *  amber) carries the "materially different prices" signal — amber is
 *  reserved for a real wait/warning state, and this one already had a
 *  bad/neutral tone before this conversion. */
function DisagreementRow({ d, max }: { d: { pair: string; n: number; medianDeltaPct: number }; max: number }) {
  const pct = max > 0 ? Math.max(1, Math.round((d.n / max) * 100)) : 0;
  const bad = d.medianDeltaPct >= 10;
  return (
    <div className="ed-ranked-row">
      <div>
        <div className="ed-ranked-name">{d.pair}</div>
        <div className="ed-ranked-meta">median {d.medianDeltaPct.toFixed(1)}%</div>
      </div>
      <div className="ed-bar">
        <div className={`ed-bar-fill${bad ? ' red' : ''}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="ed-ranked-value">{fmtInt(d.n)}</div>
      <div />
    </div>
  );
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
            <p className="ad-note">
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
                      ? <span style={{ color: 'var(--muted-2)' }}>— need 20</span>
                      : `${r.accuracyPct.toFixed(0)}%`}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>

        <Panel title="14-day horizon" sub="A buy that looked right at 7 days can still be wrong at 14">
          {m.verdict14d.byVerdict.length === 0 ? (
            <p className="ad-note">Nothing scored at 14 days yet.</p>
          ) : (
            <Table head={['Call', 'Scored', 'Correct', 'Accuracy']}>
              {m.verdict14d.byVerdict.map(r => (
                <tr key={r.verdict}>
                  <td className="capitalize">{r.verdict}</td>
                  <td className="font-mono tabular-nums">{fmtInt(r.scored)}</td>
                  <td className="font-mono tabular-nums">{fmtInt(r.correct)}</td>
                  <td className="font-mono tabular-nums">
                    {r.accuracyPct == null
                      ? <span style={{ color: 'var(--muted-2)' }}>— need 20</span>
                      : `${r.accuracyPct.toFixed(0)}%`}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </div>

      <SectionHead
        title="Fare decision model"
        sub="A small neural network trained nightly on our own polling history — it may override a rules verdict only when it is confident"
      />
      <div className="grid gap-3 lg:grid-cols-2 mb-6">
        <Panel title="Current model" sub="Every number here is measured on routes the model never trained on">
          {(() => {
            const model = loadFareModel();
            const run = lastTrainingRun();
            if (!model) {
              return (
                <p className="ad-note">
                  No model accepted yet.{' '}
                  {run ? `Last training run (${ago(run.at)}): ${run.reason}` : 'The nightly fare-model job has not run.'}
                  {' '}Until then every verdict is the rules alone.
                </p>
              );
            }
            const m = model.metrics;
            const lift = (m.testAccuracy - m.rulesAccuracyOnTest) * 100;
            return (
              <div className="space-y-2 text-sm">
                <div className="flex items-baseline gap-4">
                  <div><div className="ed-stat-label">Model · held-out</div><div className="ed-stat-value" style={{ fontSize: 28 }}>{(m.testAccuracy * 100).toFixed(0)}%</div></div>
                  <div><div className="ed-stat-label">Rules · same examples</div><div className="ed-stat-value" style={{ fontSize: 28 }}>{(m.rulesAccuracyOnTest * 100).toFixed(0)}%</div></div>
                  <div><div className="ed-stat-label">Lift</div><div className="ed-stat-value" style={{ fontSize: 28, color: lift > 0 ? 'var(--green)' : 'var(--red)' }}>{lift > 0 ? '+' : ''}{lift.toFixed(0)} pts</div></div>
                </div>
                <table className="ed-table" style={{ marginTop: 8 }}>
                  <thead><tr><th>Verdict</th><th className="num">Precision</th><th className="num">Recall</th><th className="num">Held-out n</th></tr></thead>
                  <tbody>
                    {(['buy', 'wait'] as const).map(c => (
                      <tr key={c}><td>{c}</td><td className="num">{(m.perClass[c].precision * 100).toFixed(0)}%</td><td className="num">{(m.perClass[c].recall * 100).toFixed(0)}%</td><td className="num">{m.perClass[c].support}</td></tr>
                    ))}
                  </tbody>
                </table>
                <p className="ad-note">
                  Trained {ago(model.trainedAt)} on {fmtInt(m.trainExamples)} replayed decisions, tested on {fmtInt(m.testExamples)} from held-out routes.
                  Precision: of the times it said this, how often it was right. Recall: of the times this was the answer, how often it said so.
                </p>
              </div>
            );
          })()}
        </Panel>
        <Panel title="How it decides" sub="Plain arithmetic over prices that were really polled">
          <p className="ad-note" style={{ marginBottom: 8 }}>
            The question is the one this page scores: will a fare at least 3% cheaper appear within
            7 days? Two answers — wait if yes, buy if no; a wobble too small to act on counts as buy.
            The rules always run first. The network gets a vote only when the route has 14+ days of
            history, and may override the rules only at 70%+ probability. Otherwise it just nudges
            the confidence figure. A rules "hold" and a model "buy" are the same advice.
          </p>
          <div className="ed-stat-label" style={{ marginBottom: 4 }}>Inputs</div>
          <div className="ed-mono" style={{ fontSize: 11, letterSpacing: 0, textTransform: 'none', lineHeight: 1.7, color: 'var(--muted)' }}>
            {FEATURE_NAMES.join(' · ')}
          </div>
          <p className="ad-note" style={{ marginTop: 8 }}>
            A new model replaces the old one only if it beats the rules by 2+ points on routes it never saw.
            Set <span className="ed-code">FARE_MODEL=off</span> to run on the rules alone.
          </p>
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
            <p className="ad-note">No provider calls recorded in this window.</p>
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
            <p className="ad-note">
              No material disagreements recorded. Either the providers agree, or only one provider is
              enabled and there is nothing to disagree with.
            </p>
          ) : (
            <div className="ed-ranked">
              {m.disagreements.map(d => (
                <DisagreementRow key={d.pair} d={d} max={Math.max(...m.disagreements.map(x => x.n))} />
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
          <p className="ad-note">
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
                <td style={{ color: 'var(--muted)' }}>{ago(f.occurred_at)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}
