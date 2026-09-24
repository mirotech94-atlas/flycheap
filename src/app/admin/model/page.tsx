import Link from 'next/link';
import { insightsForAll } from '@/lib/nn/insight';
import { loadFareModel, lastTrainingRun } from '@/lib/nn';
import { PageHead, SectionHead, Panel, fmtInt, ago } from '../_components/ui';
import { ModelInsightTable, ModelSummaryStrip } from '@/components/ModelInsightTable';

export const dynamic = 'force-dynamic';

/**
 * The founder's view: the network's decision on every active route across
 * every client, plus the model's own health. The admin layout already
 * guards this route (owner only).
 */
export default function AdminModelPage() {
  const { rows, summary } = insightsForAll();
  const model = loadFareModel();
  const run = lastTrainingRun();
  const clients = new Set(rows.map(r => r.userId)).size;

  return (
    <>
      <PageHead
        eyebrow="Analytics"
        title="Fare decision model, every client"
        sub={`${fmtInt(rows.length)} active route${rows.length === 1 ? '' : 's'} across ${fmtInt(clients)} client${clients === 1 ? '' : 's'}. What the network says today, whether it agreed with the rules, and what it looked at.`}
      />

      <ModelSummaryStrip s={summary} />

      <div className="grid gap-3 lg:grid-cols-2 mb-6">
        <Panel title="Model health" sub="Measured on routes the model never trained on">
          {model ? (
            <div className="space-y-1 text-sm">
              <div className="flex items-baseline gap-4">
                <div><div className="ed-stat-label">Model</div><div className="ed-stat-value" style={{ fontSize: 26 }}>{(model.metrics.testAccuracy * 100).toFixed(0)}%</div></div>
                <div><div className="ed-stat-label">Rules</div><div className="ed-stat-value" style={{ fontSize: 26 }}>{(model.metrics.rulesAccuracyOnTest * 100).toFixed(0)}%</div></div>
                <div><div className="ed-stat-label">Wait recall</div><div className="ed-stat-value" style={{ fontSize: 26 }}>{(model.metrics.perClass.wait.recall * 100).toFixed(0)}%</div></div>
              </div>
              <p className="ad-note">v{model.version}, trained {ago(model.trainedAt)} on {fmtInt(model.metrics.trainExamples)} replayed decisions. Full breakdown on <Link href="/admin/trust" style={{ color: 'var(--accent)' }}>Fare truth</Link>.</p>
            </div>
          ) : (
            <p className="ad-note">No model accepted yet. {run ? `Last run ${ago(run.at)}: ${run.reason}` : 'The nightly job has not run.'}</p>
          )}
        </Panel>
        <Panel title="Today across all clients" sub="How the two views combined on live routes">
          <div className="flex items-baseline gap-4 text-sm">
            <div><div className="ed-stat-label">Buy</div><div className="ed-stat-value" style={{ fontSize: 26 }}>{summary.byVerdict.buy}</div></div>
            <div><div className="ed-stat-label">Wait</div><div className="ed-stat-value ed-fare-text" style={{ fontSize: 26 }}>{summary.byVerdict.wait}</div></div>
            <div><div className="ed-stat-label">Hold</div><div className="ed-stat-value" style={{ fontSize: 26 }}>{summary.byVerdict.hold}</div></div>
            <div><div className="ed-stat-label">Thin history</div><div className="ed-stat-value" style={{ fontSize: 26 }}>{summary.rulesOnlyThin}</div></div>
          </div>
          <p className="ad-note">Thin history means under 14 days of polls — the rules decide alone until the route has enough behind it.</p>
        </Panel>
      </div>

      <SectionHead title="Every active route" sub="Expand a row to see the eleven inputs the network weighed" />
      <ModelInsightTable rows={rows} showUser />
    </>
  );
}
