import Link from 'next/link';
import { ContactForm } from '@/components/ContactForm';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Contact — FlyCheap',
  description: 'Reach the FlyCheap team — questions, feedback, partnerships, bug reports.',
};

export default async function ContactPage() {
  const user = await getCurrentUser();

  return (
    <div className="space-y-6 motion-fade-in max-w-3xl mx-auto">
      <div>
        <div className="eyebrow mb-1">Contact</div>
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tight font-display">
          Get in touch
        </h1>
        <p className="text-sm text-slate-500 mt-2">
          Questions, feedback, partnership ideas, or a bug we should know about — we read everything and reply within one business day.
        </p>
      </div>

      <ContactForm
        initialName={user?.name ?? ''}
        initialEmail={user?.email ?? ''}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <div className="eyebrow mb-1">⚡ Faster channels</div>
          <h2 className="!mb-2 text-base">In-app concierge</h2>
          <p className="text-xs text-slate-500">
            Click <strong>Ask concierge</strong> bottom-left on any page. FarePilot can answer most questions about your dashboard, fares, settings, and alerts.
          </p>
        </div>
        <div className="card">
          <div className="eyebrow mb-1">🔧 Operational</div>
          <h2 className="!mb-2 text-base">System status</h2>
          <p className="text-xs text-slate-500">
            Live health for the poller, providers, and last-alert pipeline at <Link href="/status" className="underline">/status</Link>.
          </p>
        </div>
        <div className="card">
          <div className="eyebrow mb-1">🐛 Bugs</div>
          <h2 className="!mb-2 text-base">Found something off?</h2>
          <p className="text-xs text-slate-500">
            Tell us the URL, what you expected vs. what happened, and the time (UTC). Screenshots help a lot — paste them into the message.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 pt-4 justify-center">
        <Link href="/" className="btn btn-primary">← Back to dashboard</Link>
        <Link href="/about" className="btn">About us</Link>
      </div>
    </div>
  );
}
