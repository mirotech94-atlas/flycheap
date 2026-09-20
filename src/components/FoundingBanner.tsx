import Link from 'next/link';
import { queries } from '@/lib/db';

/** Dashboard notice for the free founding period (first 3 months) and the post-period upgrade nudge. */
export function FoundingBanner({ userId }: { userId: number }) {
  const u = queries.getUserById(userId);
  if (!u || u.tier !== 'free') return null;
  const status = u.subscription_status;
  const ends = (u as { trial_ends_at?: string | null }).trial_ends_at ?? null;
  if (status === 'founding_free' && ends) {
    const days = Math.max(0, Math.ceil((new Date(ends.replace(' ', 'T') + (ends.endsWith('Z') ? '' : 'Z')).getTime() - Date.now()) / 86_400_000));
    return (
      <div className="fc-founding-banner">
        <span className="fc-founding-tag">Founding period</span>
        <span>Your first 3 months are free with the basic capabilities — <strong>{days} day{days === 1 ? '' : 's'}</strong> left. Want 100 routes, flexible dates and SMS alerts? <Link href="/pricing">See Pro &amp; Enterprise →</Link></span>
      </div>
    );
  }
  if (status === 'upgrade_due') {
    return (
      <div className="fc-founding-banner due">
        <span className="fc-founding-tag">3 months in</span>
        <span>Your founding period is complete. You&rsquo;re on the Free plan — <Link href="/pricing">upgrade to Pro or Enterprise</Link> for faster polling, more routes and every alert channel.</span>
      </div>
    );
  }
  return null;
}
