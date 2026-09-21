import Link from 'next/link';
import { ContactForm } from '@/components/ContactForm';
import { getCurrentUser } from '@/lib/auth';
import { FcPageHead } from '@/components/fc/PageKit';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Contact — FlyCheap',
  description: 'Reach the FlyCheap team — questions, feedback, partnerships, bug reports.',
};

export default async function ContactPage() {
  const user = await getCurrentUser();

  return (
    <div style={{ maxWidth: '48rem', margin: '0 auto' }}>
      <div className="ed-eyebrow">Contact</div>
      <FcPageHead
        title="Get in touch"
        lede="Questions, feedback, partnership ideas, or a bug we should know about — we read everything and reply within one business day."
      />

      <div style={{ marginBottom: 28 }}>
        <ContactForm
          initialName={user?.name ?? ''}
          initialEmail={user?.email ?? ''}
        />
      </div>

      <div className="ed-tiles" style={{ marginBottom: 28 }}>
        <div className="ed-tile">
          <div className="ed-tile-kicker">⚡ Faster channels</div>
          <div className="ed-tile-value" style={{ fontSize: 16 }}>In-app concierge</div>
          <p className="ed-tile-meta">
            Click <strong>Ask concierge</strong> bottom-left on any page. FarePilot can answer most questions about your dashboard, fares, settings, and alerts.
          </p>
        </div>
        <div className="ed-tile">
          <div className="ed-tile-kicker">🔧 Operational</div>
          <div className="ed-tile-value" style={{ fontSize: 16 }}>System status</div>
          <p className="ed-tile-meta">
            Live health for the poller, providers, and last-alert pipeline at <Link href="/status">/status</Link>.
          </p>
        </div>
        <div className="ed-tile">
          <div className="ed-tile-kicker">🐛 Bugs</div>
          <div className="ed-tile-value" style={{ fontSize: 16 }}>Found something off?</div>
          <p className="ed-tile-meta">
            Tell us the URL, what you expected vs. what happened, and the time (UTC). Screenshots help a lot — paste them into the message.
          </p>
        </div>
      </div>

      <div className="ed-actions" style={{ justifyContent: 'center' }}>
        <Link href="/" className="ed-btn ed-btn-primary">← Back to dashboard</Link>
        <Link href="/about" className="ed-btn ed-btn-secondary">About us</Link>
      </div>
    </div>
  );
}
