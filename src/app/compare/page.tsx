import Link from 'next/link';
import { ComparePanel } from '@/components/ComparePanel';
import { FcPageHead } from '@/components/fc/PageKit';

export const metadata = { title: 'Compare deals — FlyCheap' };
export const dynamic = 'force-dynamic';

export default function ComparePage() {
  return (
    <div>
      <div className="ed-eyebrow">Compare</div>
      <FcPageHead
        title="Side-by-side deal comparison"
        lede="Pin up to three deals anywhere on the dashboard (📌 icon on the deal row) and they appear here aligned, so you can compare price, party total, stops, and trip length in one glance."
      />

      <ComparePanel />

      <div className="ed-actions" style={{ justifyContent: 'center', marginTop: 24 }}>
        <Link href="/" className="ed-btn ed-btn-secondary">← Back to dashboard</Link>
      </div>
    </div>
  );
}
