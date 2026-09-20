'use server';

import { redirect } from 'next/navigation';
import { verifyCommercialUnsubscribe, setCommercialOptOut } from '@/lib/tripChain';

export async function unsubscribeCommercial(formData: FormData) {
  const userId = Number(formData.get('u'));
  const sig = String(formData.get('s') ?? '');
  if (!Number.isFinite(userId) || !verifyCommercialUnsubscribe(userId, sig)) {
    redirect('/trip/unsubscribe');
  }
  setCommercialOptOut(userId, true);
  redirect('/trip/unsubscribe?done=1');
}
