import Link from 'next/link';
import { getCurrentUser, isOwner } from '@/lib/auth';
import { AiProviderChain } from '@/components/AiProviderChain';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Integrations — FlyCheap' };

/**
 * Open-source integration hub. Anyone can hop into our public Slack workspace
 * and Telegram bot to subscribe to deal alerts or ask for support. URLs are
 * configurable via env so the workspace owner can swap them without a deploy.
 */
// A URL counts as "configured" only when an env var is set to a non-placeholder
// value. Until the owner creates the real Slack workspace / Telegram bots and
// sets these, the cards fall back to working channels (contact form + email)
// instead of dead "this link is no longer active" invites.
// Slack: separate alerts vs support channel/invite URLs. Falls back to the
// single legacy NEXT_PUBLIC_SLACK_INVITE_URL when the per-channel vars aren't
// set, so older configs still work.
const RAW_SLACK_INVITE   = process.env.NEXT_PUBLIC_SLACK_INVITE_URL || '';
const RAW_SLACK_ALERTS_URL  = process.env.NEXT_PUBLIC_SLACK_ALERTS_URL  || RAW_SLACK_INVITE;
const RAW_SLACK_SUPPORT_URL = process.env.NEXT_PUBLIC_SLACK_SUPPORT_URL || RAW_SLACK_INVITE;

// The alerts bot is live (@flycheap_alerts_bot, verified via getMe) and its
// webhook is registered, so default to it even when the NEXT_PUBLIC env var
// isn't set — otherwise the page tells visitors "launching soon" for a bot
// that actually works, breaking the funnel the marketing video points at.
const RAW_TG_ALERTS_BOT  = process.env.NEXT_PUBLIC_TELEGRAM_ALERTS_BOT  || 'flycheap_alerts_bot';
const RAW_TG_SUPPORT_BOT = process.env.NEXT_PUBLIC_TELEGRAM_SUPPORT_BOT || '';
const RAW_TG_ALERTS_URL  = process.env.NEXT_PUBLIC_TELEGRAM_ALERTS_URL  || (RAW_TG_ALERTS_BOT ? `https://t.me/${RAW_TG_ALERTS_BOT}` : '');
const RAW_TG_SUPPORT_URL = process.env.NEXT_PUBLIC_TELEGRAM_SUPPORT_URL || (RAW_TG_SUPPORT_BOT ? `https://t.me/${RAW_TG_SUPPORT_BOT}` : '');

const RAW_DISCORD_INVITE  = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL  || '';
const RAW_DISCORD_ALERTS  = process.env.NEXT_PUBLIC_DISCORD_ALERTS_URL  || RAW_DISCORD_INVITE;
const RAW_DISCORD_SUPPORT = process.env.NEXT_PUBLIC_DISCORD_SUPPORT_URL || RAW_DISCORD_INVITE;

const ok = (u: string) => u.length > 0 && !u.includes('placeholder');
const SLACK_ALERTS_OK  = ok(RAW_SLACK_ALERTS_URL);
const SLACK_SUPPORT_OK = ok(RAW_SLACK_SUPPORT_URL);
const TG_ALERTS_OK  = ok(RAW_TG_ALERTS_URL);
const TG_SUPPORT_OK = ok(RAW_TG_SUPPORT_URL);
const DISCORD_ALERTS_OK  = ok(RAW_DISCORD_ALERTS);
const DISCORD_SUPPORT_OK = ok(RAW_DISCORD_SUPPORT);

// Fallbacks used when a channel isn't configured yet — these always work.
const FALLBACK_SUPPORT = '/contact';
const FALLBACK_ALERTS  = '/settings#alerts'; // in-app channel config (email/SMS live today)

type Card = {
  platform: 'Slack' | 'Telegram' | 'Discord';
  variant: 'alerts' | 'support';
  href: string;
  blurb: string;
  configured: boolean;
  comingSoon?: boolean;
};

const cards: Card[] = [
  {
    platform: 'Slack', variant: 'alerts',
    href: SLACK_ALERTS_OK ? RAW_SLACK_ALERTS_URL : FALLBACK_ALERTS,
    configured: SLACK_ALERTS_OK,
    blurb: SLACK_ALERTS_OK
      ? 'Join the workspace and subscribe to #alerts — every fare drop, every route we watch, posted in real time.'
      : 'Slack alerts are launching soon. For now, set up email & SMS alerts in Settings → Channels — they fire the moment a tracked fare drops.',
  },
  {
    platform: 'Slack', variant: 'support',
    href: SLACK_SUPPORT_OK ? RAW_SLACK_SUPPORT_URL : FALLBACK_SUPPORT,
    configured: SLACK_SUPPORT_OK,
    blurb: SLACK_SUPPORT_OK
      ? 'Head to #support for help with watches, billing, or anything else. Founders read every message.'
      : 'Slack support is launching soon. In the meantime, send us a message on the contact form — the founder reads every one.',
  },
  {
    platform: 'Telegram', variant: 'alerts',
    href: TG_ALERTS_OK ? RAW_TG_ALERTS_URL : FALLBACK_ALERTS,
    configured: TG_ALERTS_OK,
    blurb: TG_ALERTS_OK
      ? `Open @${RAW_TG_ALERTS_BOT}, tap Start, then send "/watch JFK LIS 450" (origin · destination · target $). Your phone buzzes the moment that fare drops below your target.`
      : 'Telegram alerts are launching soon. For now, enable email & SMS alerts in Settings → Channels — instant, on every device.',
  },
  {
    platform: 'Telegram', variant: 'support',
    href: TG_SUPPORT_OK ? RAW_TG_SUPPORT_URL : FALLBACK_SUPPORT,
    configured: TG_SUPPORT_OK,
    blurb: TG_SUPPORT_OK
      ? `Message @${RAW_TG_SUPPORT_BOT || 'our support bot'} for help — watches, billing, new routes. Real humans on the other side.`
      : 'Telegram support is launching soon. Reach us on the contact form or by email below — real humans, fast replies.',
  },
  {
    platform: 'Discord', variant: 'alerts',
    href: DISCORD_ALERTS_OK ? RAW_DISCORD_ALERTS : FALLBACK_ALERTS,
    configured: DISCORD_ALERTS_OK,
    comingSoon: !DISCORD_ALERTS_OK,
    blurb: DISCORD_ALERTS_OK
      ? 'Join our Discord server and subscribe to #alerts — every fare drop posted live, voice channels for trip planning.'
      : 'Discord alerts are coming soon. Voice channels for trip planning, gaming-friendly notifications, the whole deal. Hop on the waitlist via Slack or Telegram in the meantime.',
  },
  {
    platform: 'Discord', variant: 'support',
    href: DISCORD_SUPPORT_OK ? RAW_DISCORD_SUPPORT : FALLBACK_SUPPORT,
    configured: DISCORD_SUPPORT_OK,
    comingSoon: !DISCORD_SUPPORT_OK,
    blurb: DISCORD_SUPPORT_OK
      ? 'Hop into #support on Discord — quick replies, screenshots, voice chat for the gnarly stuff.'
      : 'Discord support is coming soon. We’re finalizing the server. Use the contact form below for now — same humans, same fast replies.',
  },
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

export default async function IntegrationsPage() {
  // Owner sees the "how to enable a dormant provider" env hints; everyone else
  // sees the chain and its health only — this page is publicly reachable.
  const ownerView = isOwner(await getCurrentUser());
  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <header className="motion-fade-in">
        <div className="eyebrow mb-1">Integrations</div>
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tight font-display">
          Slack &amp; Telegram &mdash; open to everyone
        </h1>
        <p className="text-sm text-slate-500 mt-2 max-w-2xl">
          FlyCheap&rsquo;s deal alerts and support channels. Pick where you want them &mdash;
          we watch <strong>1,000+ airlines</strong> every day; you choose how the alerts reach you.
        </p>
      </header>

      {/* Channel cards — alerts row, then support row, so each column reads as
          one platform (Slack / Telegram / Discord) and the grid fills the width. */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 motion-slide-up">
        {[...cards.filter(c => c.variant === 'alerts'), ...cards.filter(c => c.variant === 'support')].map(c => {
          const isExternal = c.href.startsWith('http');
          const ctaLabel = c.configured
            ? `Open ${c.platform} →`
            : (c.variant === 'support' ? 'Contact us →' : 'Set up alerts →');
          const inner = (
            <div className="flex items-start gap-4">
              <div className="shrink-0 mt-0.5"><PlatformIcon platform={c.platform} /></div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="!mb-0 text-lg">{c.platform}</h2>
                  <span className={`badge ${c.variant === 'alerts' ? 'badge-success' : 'badge-muted'}`}>
                    {c.variant === 'alerts' ? '#alerts' : '#support'}
                  </span>
                  {!c.configured && <span className="badge badge-warn">Soon</span>}
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">{c.blurb}</p>
                <div className="mt-3 text-sm font-semibold text-brand-700 group-hover:translate-x-0.5 transition">
                  {ctaLabel}
                </div>
              </div>
            </div>
          );
          return isExternal ? (
            <a
              key={`${c.platform}-${c.variant}`}
              href={c.href}
              target="_blank"
              rel="noopener noreferrer"
              className="card hover:shadow-lg transition group"
            >
              {inner}
            </a>
          ) : (
            <Link
              key={`${c.platform}-${c.variant}`}
              href={c.href}
              className="card hover:shadow-lg transition group"
            >
              {inner}
            </Link>
          );
        })}
      </section>

      <AiProviderChain ownerView={ownerView} />

      <section className="card motion-slide-up">
        <div className="eyebrow mb-1">Set up in 2 minutes</div>
        <h2 className="!mb-1">The commands</h2>
        <p className="text-sm text-slate-500 mb-4">
          Add a route and a target price right where you already work. Every drop below your
          target posts automatically.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <PlatformIcon platform="Slack" className="w-5 h-5" />
              <span className="font-semibold">Slack</span>
              <span className="badge badge-muted">#flycheap-alerts</span>
            </div>
            <ol className="text-sm text-slate-700 dark:text-slate-300 space-y-1.5 list-decimal list-inside">
              <li>Join the workspace and open <code className="text-xs">#flycheap-alerts</code></li>
              <li>Run <code className="text-xs">/flycheap watch JFK LIS 450</code></li>
              <li>Every drop posts in the channel — for the whole team</li>
            </ol>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <PlatformIcon platform="Telegram" className="w-5 h-5" />
              <span className="font-semibold">Telegram</span>
              <span className="badge badge-success">live</span>
            </div>
            <ol className="text-sm text-slate-700 dark:text-slate-300 space-y-1.5 list-decimal list-inside">
              <li>Open <a className="text-brand-700 underline" href={`https://t.me/${RAW_TG_ALERTS_BOT}`} target="_blank" rel="noopener noreferrer">@{RAW_TG_ALERTS_BOT}</a> and tap <strong>Start</strong></li>
              <li>Send <code className="text-xs">/watch JFK LIS 450</code></li>
              <li>Your phone buzzes the moment the price falls under your target</li>
            </ol>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-3">
          Format: <code className="text-xs">watch ORIGIN DESTINATION PRICE</code> (3-letter airport codes, target in USD).
          Manage anytime with <code className="text-xs">list</code> and <code className="text-xs">unwatch</code>. Discord — coming next month.
        </p>
      </section>

      <section className="card motion-slide-up motion-delay-1">
        <h2 className="!mb-1">Wire alerts into your own channel</h2>
        <p className="text-sm text-slate-500 mb-3">
          Already on Slack or Telegram? Point your private route alerts at your own webhook/chat instead
          of (or in addition to) email.
        </p>
        <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1.5">
          <li>&middot; <strong>Slack:</strong> create an incoming-webhook URL and paste it under <Link className="text-brand-700 underline" href="/settings#alerts">Settings &rarr; Channels</Link>.</li>
          <li>&middot; <strong>Telegram:</strong> {TG_ALERTS_OK ? (
            <>open <a className="text-brand-700 underline" href={RAW_TG_ALERTS_URL} target="_blank" rel="noopener noreferrer">@{RAW_TG_ALERTS_BOT || 'our bot'}</a>, send <code className="text-xs">/start</code>, and the bot replies with your private chat-id. Paste that under <Link className="text-brand-700 underline" href="/settings#alerts">Settings &rarr; Channels</Link>.</>
          ) : (
            <>set <code className="text-xs">TELEGRAM_BOT_TOKEN</code> in env and your chat-id under <Link className="text-brand-700 underline" href="/settings#alerts">Settings &rarr; Channels</Link>. Public bot launching soon.</>
          )}</li>
        </ul>
      </section>

      <section className="card motion-slide-up motion-delay-2 bg-slate-50/60 dark:bg-slate-900/40">
        <h2 className="!mb-1 text-base">Talk to a human directly</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          I&rsquo;m Miro &mdash; the founder. If Slack/Telegram aren&rsquo;t your thing, reach me
          straight away:
        </p>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <a className="text-brand-700 font-semibold" href="mailto:miro@flycheap.live">miro@flycheap.live</a>
          <a className="text-brand-700 font-semibold" href="tel:+19176554405">+1 (917) 655-4405</a>
        </div>
      </section>
    </div>
  );
}
