import Link from 'next/link';
import { APP_VERSION_SHORT } from '@/lib/version';
import type { Metadata } from 'next';
import { DemoPlayer, type Chapter } from './DemoPlayer';
import { PublicTopbar, PublicFooter } from '@/components/PublicChrome';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Live Demo — FlyCheap',
  description: 'A narrated walkthrough of the real FlyCheap: dashboard, best-deals table, fare calendar, worldwide explore, alerts, and the AI concierge.',
  openGraph: {
    title: 'FlyCheap — narrated live demo',
    description: 'Watch the real product in action: every page, every feature, explained.',
    url: 'https://flycheap.live/demo',
    siteName: 'FlyCheap',
    type: 'video.other',
  },
};

const CHAPTERS: Chapter[] = [
  { t: 0,   label: 'Welcome to FlyCheap',      desc: 'What the platform does and who it’s for.' },
  { t: 31,  label: 'The executive dashboard',  desc: 'KPI strip, live network globe, and the real-time fare feed.' },
  { t: 64,  label: 'Best deals & booking',     desc: 'The 12-month deals table and cross-shopping every OTA.' },
  { t: 95,  label: 'Fare calendar & buy/wait', desc: 'Day-by-day price heatmap and the recommendation engine.' },
  { t: 125, label: 'Explore the world',        desc: 'Cheapest fares to every destination on the interactive map.' },
  { t: 146, label: 'Alerts, email & Telegram', desc: 'Thresholds, anomaly triggers, and self-serve chat alerts.' },
  { t: 183, label: 'The AI concierge',         desc: 'Ask questions in plain English, get answers from your data.' },
  { t: 213, label: 'Early access & pricing',   desc: 'Free, Pro and Enterprise — and how to request an account.' },
];

export default function DemoPage() {
  return (
    <div className="mk mk-bleed">
      <PublicTopbar
        right={(
          <>
            <Link href="/" className="ed-btn ed-btn-secondary">← Back to site</Link>
            <Link href="/login" prefetch={false} className="ed-btn ed-btn-secondary">Log in</Link>
            <Link href="/early-access" className="ed-btn ed-btn-primary">Get early access →</Link>
          </>
        )}
      />

      <section className="mk-section">
        <div className="mk-wrap">
          <div className="ed-eyebrow">Narrated walkthrough · every page explained</div>
          <h1 className="ed-h1">The <em>live demo</em>.</h1>
          <p className="ed-sub">
            This is the real product — the actual dashboard, real fare data, every page —
            with a guided voiceover explaining how it all works. Use the chapters to jump around.
          </p>

          <DemoPlayer
            src="/clips/flycheap-demo.mp4"
            poster="/clips/flycheap-demo-poster.jpg"
            chapters={CHAPTERS}
          />

          <div className="ed-panel" style={{ marginTop: 44, display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div className="ed-eyebrow">Seen enough?</div>
              <h2 className="ed-h2" style={{ marginTop: 6 }}>Request access — <em>most approvals land within hours</em>.</h2>
            </div>
            <div className="ed-actions" style={{ marginBottom: 0 }}>
              <Link href="/early-access" className="ed-btn ed-btn-primary">Get early access →</Link>
              <Link href="/pricing" className="ed-btn ed-btn-secondary">See pricing</Link>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter
        left={<>© 2026 FlyCheap · All rights reserved</>}
        right={<>{APP_VERSION_SHORT} · NYC</>}
      />
    </div>
  );
}
