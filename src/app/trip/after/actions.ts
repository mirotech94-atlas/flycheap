'use server';

import { redirect } from 'next/navigation';
import { answerPostTrip } from '@/lib/tripChain';

/**
 * The post-trip answer. A server action, so it is a POST with a
 * framework-issued id — not something a link prefetcher or a mail security
 * scanner can trigger by fetching a URL. A GET that recorded "I travelled and
 * paid $0" would poison the savings report for every corporate recipient.
 */
export async function answerAfter(formData: FormData) {
  const token = String(formData.get('token') ?? '');
  const travelled = String(formData.get('travelled') ?? '') === 'yes';
  const rawPaid = String(formData.get('paid') ?? '').replace(/[^0-9.]/g, '');
  const paid = rawPaid ? parseFloat(rawPaid) : null;
  const makeHomeRoute = formData.get('home_route') === 'on';
  if (!token) redirect('/trip/after');

  const trip = answerPostTrip(token, {
    travelled,
    paidUsd: Number.isFinite(paid) ? paid : null,
    makeHomeRoute: travelled && makeHomeRoute,
  });
  // An expired or already-used token lands back on the page, which explains it.
  if (!trip) redirect('/trip/after');

  const qs = new URLSearchParams({ done: travelled ? 'yes' : 'no' });
  if (travelled && makeHomeRoute) qs.set('home', '1');
  redirect(`/trip/after?${qs.toString()}`);
}
