import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { insightsForUser } from '@/lib/nn/insight';
import { loadFareModel } from '@/lib/nn';
import { FcPageHead } from '@/components/fc/PageKit';
import { ModelInsightTable, ModelSummaryStrip } from '@/components/ModelInsightTable';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Model — FlyCheap' };

/**
 * The client's view of the fare decision model: for each of their routes,
 * what the network thinks today, whether it agreed with the rules, and the
 * inputs it looked at. Nothing here is a number the model did not produce.
 */
export default async function ModelPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=%2Fmodel');
  const { rows, summary } = insightsForUser(user.id);
  const model = loadFareModel();

  return (
    <div className="space-y-6">
      <div className="ed-eyebrow">Fare decision model</div>
      <FcPageHead
        title="How the network reads your routes."
        lede="Every buy-or-wait call blends two views: a set of plain rules, and a small neural network trained nightly on our own polling history. This page shows the network's side of each decision on your routes — its probability that a cheaper fare appears within 7 days, and the inputs it weighed."
      />

      <ModelSummaryStrip s={summary} />

      {model ? (
        <p style={{ fontSize: 13, color: 'var(--muted)', maxWidth: '72ch' }}>
          Current model: {(model.metrics.testAccuracy * 100).toFixed(0)}% on routes it was never trained on, against {(model.metrics.rulesAccuracyOnTest * 100).toFixed(0)}% for the rules alone.
          It may override the rules only when it is at least 70% sure; otherwise the rules&apos; verdict stands and the network only moves the confidence figure.
        </p>
      ) : (
        <p style={{ fontSize: 13, color: 'var(--muted)', maxWidth: '72ch' }}>
          No model has been accepted yet, so every verdict below is the rules alone. The network trains nightly and is switched on only once it beats the rules on routes it never saw.
        </p>
      )}

      <ModelInsightTable rows={rows} />

      <div className="ed-actions">
        <Link href="/searches" className="ed-btn ed-btn-secondary">Your searches</Link>
        <Link href="/" className="ed-btn ed-btn-secondary">← Back to dashboard</Link>
      </div>
    </div>
  );
}
