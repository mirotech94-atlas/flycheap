import { redirect } from 'next/navigation';
import { getCurrentUser, isAdmin as isAdminUser } from '@/lib/auth';
import { funnelMetrics } from '@/lib/analytics';
import { APP_URL } from '@/lib/hosts';
import {
  PageHead, SectionHead, Kpi, Panel, Status, Table, BarRow, fmtInt, fmtMoney, type Tone,
} from '../_components/ui';
import { Funnel } from '../_components/Funnel';

export const dynamic = 'force-dynamic';

/**
 * Dashboard 3 — does the funnel work?
 *
 *   alert sent → delivered → opened → clicked → booking confirmed → chain entered
 *   → hotel clicked → ancillary clicked → commission settled
 *
 * Segmented by the cuts that actually change decisions: alert type, channel and
 * language. Alongside it, cohort retention — flight tracking has a natural decay
 * as people book and leave, so the metric that matters is whether they come back
 * for the next trip.
 *
 * Stages we cannot yet measure are shown as such rather than omitted, because a
 * funnel with a silently missing step reads as a conversion cliff.
 */

export default async function FunnelPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/admin/funnel');
  if (!isAdminUser(user)) redirect(APP_URL);

  const m = funnelMetrics(30);

  const sent = m.overall[0]?.n ?? 0;
  const clicked = m.overall[1]?.n ?? 0;
  const ctr = sent > 0 ? (clicked / sent) * 100 : null;

  const bestKind = m.byAlertKind.length
    ? [...m.byAlertKind].sort((a, b) => b.ctrPct - a.ctrPct)[0]
    : null;

  return (
    <div>
      <PageHead
        eyebrow="Dashboard 3"
        title="Does the funnel work?"
        sub="Alert to click to booking to the trip chain, segmented by the cuts that change decisions.
             Last 30 days."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-6">
        <Kpi
          label="Alerts delivered"
          value={fmtInt(sent)}
          foot="Reserved-but-failed sends are excluded — these are alerts that actually reached someone."
        />
        <Kpi
          label="Alert click-through"
          value={ctr == null ? '—' : `${ctr.toFixed(1)}%`}
          tone={ctr == null ? 'neutral' : ctr >= 10 ? 'good' : 'neutral'}
          foot="Clicks that carry an alert id. This join is what makes every segment below possible."
        />
        <Kpi
          label="Best-converting alert type"
          value={bestKind ? bestKind.kind : '—'}
          tone="good"
          foot={bestKind
            ? `${bestKind.ctrPct.toFixed(1)}% CTR on ${fmtInt(bestKind.sent)} sends. Poll harder for this class and throttle the rest.`
            : 'No alerts with recorded types yet.'}
        />
        <Kpi
          label="Commission settled"
          value={fmtInt(m.overall[4]?.n ?? 0)}
          foot="Late-arriving attribution is expected — hotel commissions typically settle weeks after checkout."
        />
      </div>

      <SectionHead title="The funnel" />
      <Panel className="mb-6">
        <Funnel stages={m.overall} />
        <p className="ad-note mt-3">
          {m.deliveryInstrumented ? (
            <>
              <strong>delivered</strong> and <strong>opened</strong> come from the ESP webhook.
              Open tracking undercounts by design — clients that block the tracking pixel never
              report one — so read it as a floor, not a rate.
            </>
          ) : (
            <>
              <strong>delivered/opened</strong> are absent rather than zero: no ESP webhook event has
              arrived yet. Point Resend at <code>/api/webhooks/resend</code> and set{' '}
              <code>RESEND_WEBHOOK_SECRET</code>; the stages appear on the first event.
            </>
          )}{' '}
          <strong>booking confirmed</strong> is recorded on the trip but not yet joined into this
          view. A funnel with a silently missing step reads as a conversion cliff, so nothing here is
          shown as a zero it has not measured.
        </p>
      </Panel>

      <SectionHead
        title="By alert type"
        sub="The cut that decides where the poll budget goes"
      />
      <Panel className="mb-6">
        {m.byAlertKind.length === 0 ? (
          <p className="ad-note">No alerts recorded in this window.</p>
        ) : (
          <>
            <Table head={['Alert type', 'Sent', 'Clicked', 'CTR', 'Commission']}>
              {m.byAlertKind.map(k => (
                <tr key={k.kind}>
                  <td className="capitalize">{k.kind.replace('-', ' ')}</td>
                  <td className="font-mono tabular-nums">{fmtInt(k.sent)}</td>
                  <td className="font-mono tabular-nums">{fmtInt(k.clicked)}</td>
                  <td className="font-mono tabular-nums">
                    <Status tone={k.ctrPct >= 10 ? 'good' : k.ctrPct > 0 ? 'neutral' : 'bad'}>
                      {k.ctrPct.toFixed(1)}%
                    </Status>
                  </td>
                  <td className="font-mono tabular-nums">{fmtMoney(k.commissionUsd, 2)}</td>
                </tr>
              ))}
            </Table>
            <p className="ad-note mt-3">
              If mistake-fare alerts convert several times better than threshold alerts, poll harder for
              anomalies and throttle threshold checks. This table is the evidence for that decision —
              before the alert kind was recorded correctly, it could not be made.
            </p>
          </>
        )}
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2 mb-6">
        <Panel title="By surface" sub="Where the click came from">
          {m.byChannel.length === 0 ? (
            <p className="ad-note">No clicks recorded.</p>
          ) : (
            m.byChannel.map(c => (
              <BarRow
                key={c.channel} label={c.channel} value={c.clicks}
                max={Math.max(...m.byChannel.map(x => x.clicks), 1)}
                tone={c.channel === 'untagged' ? 'warn' : 'neutral'}
              />
            ))
          )}
          <p className="ad-note mt-3">
            An <strong>untagged</strong> row means a surface is emitting links outside the builder.
            That is the marker bug in miniature; find it before it grows.
          </p>
        </Panel>

        <Panel title="By product" sub="What the click was for — the axis the trip chain monetizes along">
          {m.byProduct.length === 0 ? (
            <p className="ad-note">No clicks recorded.</p>
          ) : (
            m.byProduct.map(p => (
              <BarRow
                key={p.product} label={p.product} value={p.clicks}
                max={Math.max(...m.byProduct.map(x => x.clicks), 1)}
                tone={p.product === 'unattributed' ? 'warn' : 'neutral'}
              />
            ))
          )}
        </Panel>
      </div>

      <SectionHead
        title="Cohort retention"
        sub="Flight tracking decays naturally — the question is whether they come back for the next trip"
      />
      <Panel>
        {m.cohorts.length === 0 ? (
          <p className="ad-note">No accounts yet.</p>
        ) : (
          <Table head={['Cohort', 'Users', 'Active M+1', 'Active M+3', 'Ever clicked']}>
            {m.cohorts.map(c => {
              const tone: Tone = c.users > 0 && c.everClicked === 0 ? 'bad' : 'neutral';
              return (
                <tr key={c.cohort}>
                  <td className="font-mono">{c.cohort}</td>
                  <td className="font-mono tabular-nums">{fmtInt(c.users)}</td>
                  <td className="font-mono tabular-nums">{fmtInt(c.activeM1)}</td>
                  <td className="font-mono tabular-nums">{fmtInt(c.activeM3)}</td>
                  <td className="font-mono tabular-nums">
                    <Status tone={tone}>{fmtInt(c.everClicked)}</Status>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
        <p className="ad-note mt-3">
          A cohort with users but zero click-outs has not activated at all — that is an onboarding
          problem, not a monetization one, and no amount of chain email will fix it.
        </p>
      </Panel>
    </div>
  );
}
