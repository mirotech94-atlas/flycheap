import { LogoMark } from '@/components/Logo';
import Link from 'next/link';
import { APP_VERSION_SHORT } from '@/lib/version';
import type { Metadata } from 'next';
import { DemoPlayer, type Chapter } from './DemoPlayer';

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
  { t: 146, label: 'Alerts, Slack & Telegram', desc: 'Thresholds, anomaly triggers, and self-serve chat alerts.' },
  { t: 183, label: 'The AI concierge',         desc: 'Ask questions in plain English, get answers from your data.' },
  { t: 205, label: 'Early access & pricing',   desc: 'Free, Pro and Enterprise — and how to request an account.' },
];

export default function DemoPage() {
  return (
    <div className="fc-landing -mx-6 -my-8 -mb-24 md:-mb-8" data-fc-theme="ivory" data-fc-accent="gold">
      <header className="fc-l-topbar">
        <Link href="/welcome" className="fc-l-brand">
          <div className="fc-l-brand-mark">
            <LogoMark size={22} />
          </div>
          <div>
            <div className="fc-l-brand-name">FlyCheap</div>
            <div className="fc-l-brand-meta">Fare Intelligence Platform</div>
          </div>
        </Link>
        <div className="fc-l-topbar-right">
          <Link href="/welcome" className="fc-btn fc-btn-light fc-btn-sm">← Back to site</Link>
          <Link href="/login" className="fc-btn fc-btn-light fc-btn-sm">Log in</Link>
          <Link href="/early-access" className="fc-btn fc-btn-ink fc-btn-sm">Get early access →</Link>
        </div>
      </header>

      <section className="fc-section" style={{ marginTop: 44 }}>
        <div className="fc-section-head">
          <div>
            <div className="fc-smallcaps">Narrated walkthrough · every page explained</div>
            <h1 className="fc-section-title">The <em>live demo</em>.</h1>
            <p className="fc-section-sub">
              This is the real product — the actual dashboard, real fare data, every page —
              with a guided voiceover explaining how it all works. Use the chapters to jump around.
            </p>
          </div>
        </div>

        <DemoPlayer
          src="/clips/flycheap-demo.mp4"
          poster="/clips/flycheap-demo-poster.jpg"
          chapters={CHAPTERS}
        />

        <div className="fc-demo-cta">
          <div>
            <div className="fc-smallcaps">Seen enough?</div>
            <h2>Request access — <em>most approvals land within hours</em>.</h2>
          </div>
          <div className="fc-hero-cta" style={{ marginTop: 0 }}>
            <Link href="/early-access" className="fc-btn fc-btn-gold">Get early access →</Link>
            <Link href="/pricing" className="fc-btn fc-btn-ghost">See pricing</Link>
          </div>
        </div>
      </section>

      <footer className="fc-l-footer" style={{ marginTop: 72 }}>
        <div className="fc-l-footer-legal" style={{ borderTop: 'none', paddingTop: 0 }}>
          <div>© 2026 FlyCheap · All rights reserved</div>
          <div>{APP_VERSION_SHORT} · NYC</div>
        </div>
      </footer>
    </div>
  );
}
