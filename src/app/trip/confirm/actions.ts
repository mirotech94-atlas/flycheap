'use server';

import { redirect } from 'next/navigation';
import { answerTrip } from '@/lib/tripChain';

/**
 * The mutation. A server action, so it is a POST with a framework-issued action
 * id — not something a link prefetcher or a mail security scanner can trigger by
 * fetching a URL.
 */
export async function answer(formData: FormData) {
  const token = String(formData.get('token') ?? '');
  const raw = String(formData.get('answer') ?? '');
  const choice = raw === 'booked' ? 'booked' : raw === 'deciding' ? 'deciding' : null;
  if (!token || !choice) redirect('/trip/confirm');

  const trip = answerTrip(token, choice);
  // An expired or already-used token lands back on the page, which explains it.
  if (!trip) redirect('/trip/confirm');
  redirect(`/trip/confirm?done=${choice}`);
}
