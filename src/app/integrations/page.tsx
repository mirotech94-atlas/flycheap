import Link from 'next/link';
import { getCurrentUser, isOwner } from '@/lib/auth';
import { AiProviderChain } from '@/components/AiProviderChain';
import { FcPageHead } from '@/components/fc/PageKit';

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

// Brand marks — Slack (4 fills) and Telegram (2: circle + glyph). Left as
// literal hex on purpose: these are third-party logos, not design-system
// colour (see tests/noHardcodedHex.test.ts ALLOWLIST).
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
    <div>
      <div className="ed-eyebrow">Integrations</div>
      <FcPageHead
        title="Slack & Telegram — open to everyone"
        lede="FlyCheap’s deal alerts and support channels. Pick where you want them — we watch 1,000+ airlines every day; you choose how the alerts reach you."
      />

      {/* Channel tiles — one per channel (platform × alerts/support), alerts
          row then support row so each column reads as one platform. Amber
          stays reserved for fares: status reads through the dot + dim ground,
          never a colour shift on the tile itself. */}
      <div className="ed-tiles">
        {[...cards.filter(c => c.variant === 'alerts'), ...cards.filter(c => c.variant === 'support')].map(c => {
          const isExternal = c.href.startsWith('http');
          const ctaLabel = c.configured
            ? `Open ${c.platform} →`
            : (c.variant === 'support' ? 'Contact us →' : 'Set up alerts →');
          const inner = (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <PlatformIcon platform={c.platform} className="w-5 h-5" />
                <div className="ed-tile-kicker" style={{ marginBottom: 0 }}>{c.platform}</div>
                <span className={c.configured ? 'ed-dot' : 'ed-dot muted'} aria-hidden />
                {!c.configured && <span className="ed-chip" style={{ padding: '2px 8px', fontSize: 10 }}>Soon</span>}
              </div>
              <div className="ed-tile-value" style={{ fontSize: 18 }}>{c.variant === 'alerts' ? '#alerts' : '#support'}</div>
              <p className="ed-tile-meta">{c.blurb}</p>
              <span className="ed-btn ed-btn-tile">{ctaLabel}</span>
            </>
          );
          return isExternal ? (
            <a
              key={`${c.platform}-${c.variant}`}
              href={c.href}
              target="_blank"
              rel="noopener noreferrer"
              className={c.configured ? 'ed-tile' : 'ed-tile dim'}
            >
              {inner}
            </a>
          ) : (
            <Link
              key={`${c.platform}-${c.variant}`}
              href={c.href}
              className={c.configured ? 'ed-tile' : 'ed-tile dim'}
            >
              {inner}
            </Link>
          );
        })}
      </div>

      <div style={{ marginTop: 28 }}>
        <AiProviderChain ownerView={ownerView} />
      </div>

      <section className="ed-panel" style={{ marginTop: 28 }}>
        <div className="ed-eyebrow" style={{ marginBottom: 4 }}>Set up in 2 minutes</div>
        <h2 className="ed-h2">The commands</h2>
        <p className="ed-panel-note" style={{ marginBottom: 16 }}>
          Add a route and a target price right where you already work. Every drop below your
          target posts automatically.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          <div className="ed-subpanel">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <PlatformIcon platform="Slack" className="w-5 h-5" />
              <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--ink)' }}>Slack</span>
              <span className="ed-chip">#flycheap-alerts</span>
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 7, fontSize: 13, color: 'var(--ink-soft)' }}>
              <li>Join the workspace and open <code className="ed-code">#flycheap-alerts</code></li>
              <li>Run <code className="ed-code">/flycheap watch JFK LIS 450</code></li>
              <li>Every drop posts in the channel — for the whole team</li>
            </ol>
          </div>
          <div className="ed-subpanel green">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <PlatformIcon platform="Telegram" className="w-5 h-5" />
              <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--ink)' }}>Telegram</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--green)' }}>
                <span className="ed-dot" aria-hidden /> live
              </span>
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 7, fontSize: 13, color: 'var(--ink-soft)' }}>
              <li>Open <a style={{ color: 'var(--accent)', textDecoration: 'underline' }} href={`https://t.me/${RAW_TG_ALERTS_BOT}`} target="_blank" rel="noopener noreferrer">@{RAW_TG_ALERTS_BOT}</a> and tap <strong>Start</strong></li>
              <li>Send <code className="ed-code">/watch JFK LIS 450</code></li>
              <li>Your phone buzzes the moment the price falls under your target</li>
            </ol>
          </div>
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted-2)', marginTop: 14 }}>
          Format: <code className="ed-code">watch ORIGIN DESTINATION PRICE</code> (3-letter airport codes, target in USD).
          Manage anytime with <code className="ed-code">list</code> and <code className="ed-code">unwatch</code>. Discord — coming next month.
        </p>
      </section>

      <section className="ed-panel" style={{ marginTop: 16 }}>
        <h2 className="ed-h2">Wire alerts into your own channel</h2>
        <p className="ed-panel-note" style={{ marginBottom: 12 }}>
          Already on Slack or Telegram? Point your private route alerts at your own webhook/chat instead
          of (or in addition to) email.
        </p>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 7, fontSize: 13, color: 'var(--ink-soft)' }}>
          <li>&middot; <strong>Slack:</strong> create an incoming-webhook URL and paste it under <Link style={{ color: 'var(--accent)', textDecoration: 'underline' }} href="/settings#alerts">Settings &rarr; Channels</Link>.</li>
          <li>&middot; <strong>Telegram:</strong> {TG_ALERTS_OK ? (
            <>open <a style={{ color: 'var(--accent)', textDecoration: 'underline' }} href={RAW_TG_ALERTS_URL} target="_blank" rel="noopener noreferrer">@{RAW_TG_ALERTS_BOT || 'our bot'}</a>, send <code className="ed-code">/start</code>, and the bot replies with your private chat-id. Paste that under <Link style={{ color: 'var(--accent)', textDecoration: 'underline' }} href="/settings#alerts">Settings &rarr; Channels</Link>.</>
          ) : (
            <>set <code className="ed-code">TELEGRAM_BOT_TOKEN</code> in env and your chat-id under <Link style={{ color: 'var(--accent)', textDecoration: 'underline' }} href="/settings#alerts">Settings &rarr; Channels</Link>. Public bot launching soon.</>
          )}</li>
        </ul>
      </section>

      <section className="ed-panel" style={{ marginTop: 16 }}>
        <h2 className="ed-h2" style={{ fontSize: 19 }}>Talk to a human directly</h2>
        <p className="ed-panel-note" style={{ marginBottom: 10 }}>
          I&rsquo;m Miro &mdash; the founder. If Slack/Telegram aren&rsquo;t your thing, reach me
          straight away:
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 22, rowGap: 6, fontSize: 13 }}>
          <a style={{ color: 'var(--accent)', fontWeight: 600 }} href="mailto:miro@flycheap.live">miro@flycheap.live</a>
          <a style={{ color: 'var(--accent)', fontWeight: 600 }} href="tel:+19176554405">+1 (917) 655-4405</a>
        </div>
      </section>
    </div>
  );
}
