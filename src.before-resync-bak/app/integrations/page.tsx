import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Integrations — FlyCheap' };

/**
 * Open-source integration hub. Anyone can hop into our public Slack workspace
 * and Telegram bot to subscribe to deal alerts or ask for support. URLs are
 * configurable via env so the workspace owner can swap them without a deploy.
 */
const SLACK_INVITE  = process.env.NEXT_PUBLIC_SLACK_INVITE_URL
  || 'https://join.slack.com/t/flycheap/shared_invite/zt-placeholder';
const TG_BOT_NAME   = process.env.NEXT_PUBLIC_TELEGRAM_BOT || 'flycheap_alerts_bot';
const TG_ALERTS_URL = `https://t.me/${TG_BOT_NAME}?start=alerts`;
const TG_SUPPORT_URL = `https://t.me/${TG_BOT_NAME}?start=support`;

type Card = {
  platform: 'Slack' | 'Telegram';
  variant: 'alerts' | 'support';
  href: string;
  blurb: string;
};

const cards: Card[] = [
  { platform: 'Slack',    variant: 'alerts',  href: SLACK_INVITE,  blurb: 'Join the workspace and subscribe to #alerts — every fare drop, every route we watch, posted in real time.' },
  { platform: 'Slack',    variant: 'support', href: SLACK_INVITE,  blurb: 'Same workspace — head to #support for help with watches, billing, or anything else. Founders read every message.' },
  { platform: 'Telegram', variant: 'alerts',  href: TG_ALERTS_URL, blurb: 'Open a DM with the FlyCheap bot and tap Start. Get instant push alerts the moment a tracked fare drops.' },
  { platform: 'Telegram', variant: 'support', href: TG_SUPPORT_URL, blurb: 'Same bot, different command. Send /support to reach a human — Miro replies directly.' },
];

function PlatformIcon({ platform, className = 'w-7 h-7' }: { platform: Card['platform']; className?: string }) {
  if (platform === 'Slack') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden>
        <path fill="#E01E5A" d="M6.5 15.5a2 2 0 1 1-2-2h2v2zm1 0a2 2 0 1 1 4 0v5a2 2 0 1 1-4 0v-5z" />
        <path fill="#36C5F0" d="M9.5 6.5a2 2 0 1 1-2-2v2h2zm0 1a2 2 0 1 1 0 4h-5a2 2 0 1 1 0-4h5z" />
        <path fill="#2EB67D" d="M17.5 9.5a2 2 0 1 1 2 2h-2v-2zm-1 0a2 2 0 1 1-4 0v-5a2 2 0 1 1 4 0v5z" />
        <path fill="#ECB22E" d="M14.5 17.5a2 2 0 1 1 2 2v-2h-2zm0-1a2 2 0 1 1 0-4h5a2 2 0 1 1 0 4h-5z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="12" cy="12" r="12" fill="#229ED9" />
      <path fill="#fff" d="M5.5 11.6l11.7-4.5c.6-.2 1.1.2.9.9l-2 9.4c-.1.6-.5.7-1 .4l-2.9-2.1-1.4 1.3c-.2.2-.3.2-.6.1l.2-2.9 5.2-4.7c.2-.2 0-.3-.3-.1L7.7 13l-2.8-.9c-.6-.2-.6-.6.6-.5z" />
    </svg>
  );
}

export default function IntegrationsPage() {
  return (
    <div className="space-y-6 max-w-5xl">
      <header className="motion-fade-in">
        <div className="eyebrow mb-1">Integrations</div>
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tight font-display">
          Slack &amp; Telegram &mdash; open to everyone
        </h1>
        <p className="text-sm text-slate-500 mt-2 max-w-2xl">
          FlyCheap&rsquo;s deal alerts and support channels are public. Jump into either platform &mdash;
          no account, no waitlist. We watch <strong>700 airlines</strong> every day; you pick where the
          alerts land.
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 motion-slide-up">
        {cards.map(c => (
          <a
            key={`${c.platform}-${c.variant}`}
            href={c.href}
            target="_blank"
            rel="noopener noreferrer"
            className="card hover:shadow-lg transition group"
          >
            <div className="flex items-start gap-4">
              <div className="shrink-0 mt-0.5"><PlatformIcon platform={c.platform} /></div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="!mb-0 text-lg">{c.platform}</h2>
                  <span className={`badge ${c.variant === 'alerts' ? 'badge-success' : 'badge-muted'}`}>
                    {c.variant === 'alerts' ? '#alerts' : '#support'}
                  </span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">{c.blurb}</p>
                <div className="mt-3 text-sm font-semibold text-brand-700 group-hover:translate-x-0.5 transition">
                  Open {c.platform} &rarr;
                </div>
              </div>
            </div>
          </a>
        ))}
      </section>

      <section className="card motion-slide-up motion-delay-1">
        <h2 className="!mb-1">Wire alerts into your own channel</h2>
        <p className="text-sm text-slate-500 mb-3">
          Already on Slack or Telegram? Point your private route alerts at your own webhook/chat instead
          of (or in addition to) email.
        </p>
        <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1.5">
          <li>&middot; <strong>Slack:</strong> create an incoming-webhook URL and paste it under <Link className="text-brand-700 underline" href="/settings">Settings &rarr; Channels</Link>.</li>
          <li>&middot; <strong>Telegram:</strong> open <a className="text-brand-700 underline" href={`https://t.me/${TG_BOT_NAME}`} target="_blank" rel="noopener noreferrer">@{TG_BOT_NAME}</a>, send <code className="text-xs">/start</code>, and the bot replies with your private chat-id.</li>
        </ul>
      </section>

      <section className="card motion-slide-up motion-delay-2 bg-slate-50/60 dark:bg-slate-900/40">
        <h2 className="!mb-1 text-base">Talk to a human directly</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          I&rsquo;m Miro &mdash; the founder. If Slack/Telegram aren&rsquo;t your thing, reach me
          straight away:
        </p>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <a className="text-brand-700 font-semibold" href="mailto:miro@flycheap.18dn.com">miro@flycheap.18dn.com</a>
          <a className="text-brand-700 font-semibold" href="tel:+19176554405">+1 (917) 655-4405</a>
        </div>
      </section>
    </div>
  );
}
