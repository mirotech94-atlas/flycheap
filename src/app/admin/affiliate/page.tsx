import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Legacy route. The affiliate view was a strict subset of Revenue, so the two
 * are merged: money lives on /admin/revenue, traffic on /admin/clicks. Kept as
 * a redirect so older links and bookmarks still resolve.
 */
export default function AffiliateAlias() {
  redirect('/admin/revenue');
}
