import 'server-only';

/**
 * Single source of truth for outbound sender addresses.
 *
 * We use TWO distinct mailboxes for clean reputation + clear reply-routing:
 *
 *   alerts@flycheap.18dn.com    — fare alerts, daily digest, mistake-fare flags
 *                                  (transactional, high volume, low engagement reply rate)
 *
 *   support@flycheap.18dn.com   — contact-form replies, magic-link sign-in,
 *                                  account/billing email, manual outreach
 *                                  (transactional, low volume, human reply expected)
 *
 * Splitting senders keeps an alert-storm or transient bounce from poisoning
 * the deliverability of magic-link emails (which lock the user out if they
 * land in spam).
 *
 * Required DNS for `flycheap.18dn.com` in Resend dashboard:
 *   - SPF / MX / DKIM (Resend will give you exact records)
 *   - DMARC: v=DMARC1; p=quarantine; rua=mailto:dmarc@flycheap.18dn.com
 *
 * Both mailboxes can ride a single verified domain — `From:` just changes.
 */

const DEFAULT_ALERTS  = process.env.ALERTS_FROM  || process.env.RESEND_FROM || 'onboarding@resend.dev';
const DEFAULT_SUPPORT = process.env.SUPPORT_FROM || process.env.RESEND_FROM || 'onboarding@resend.dev';

/** Friendly From: header for transactional fare alerts + digests. */
export function alertsFrom(displayName = 'Cheapflight Alerts'): string {
  return formatFrom(DEFAULT_ALERTS, displayName);
}

/** Friendly From: header for sign-in, support replies, account email. */
export function supportFrom(displayName = 'Cheapflight Support'): string {
  return formatFrom(DEFAULT_SUPPORT, displayName);
}

/** Raw addresses (for Reply-To and the contact-form inbox). */
export const ADDR = {
  alerts:  DEFAULT_ALERTS,
  support: DEFAULT_SUPPORT,
};

function formatFrom(email: string, displayName: string): string {
  // Strip any preexisting "Name <addr@domain>" wrapper; the env var is just
  // an address we always wrap with our chosen display name.
  const bare = email.match(/<([^>]+)>/)?.[1] ?? email;
  return `${displayName} <${bare}>`;
}
