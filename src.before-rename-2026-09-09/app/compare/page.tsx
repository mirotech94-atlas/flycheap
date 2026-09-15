import Link from 'next/link';
import { ComparePanel } from '@/components/ComparePanel';

export const metadata = { title: 'Compare deals — FlyCheap Tracker' };
export const dynamic = 'force-dynamic';

export default function ComparePage() {
  return (
    <div className="space-y-6 motion-fade-in">
      <div>
        <div className="eyebrow mb-1">Compare</div>
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tight font-display">
          Side-by-side deal comparison
        </h1>
        <p className="text-sm text-slate-500 mt-2 max-w-2xl">
          Pin up to three deals anywhere on the dashboard (📌 icon on the deal row) and they appear here aligned, so
          you can compare price, party total, stops, and trip length in one glance.
        </p>
      </div>

      <ComparePanel />

      <div className="flex justify-center pt-2">
        <Link href="/" className="btn btn-sm">← Back to dashboard</Link>
      </div>
    </div>
  );
}
