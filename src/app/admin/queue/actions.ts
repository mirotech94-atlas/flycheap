'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { queries } from '@/lib/db';

async function assertAdmin() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) throw new Error('unauthorized');
}

export async function approvePost(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get('id'));
  const body = (formData.get('body') as string | null)?.trim();
  if (!Number.isFinite(id)) return;
  // Note: a freshness re-check against the live cache happens at drain time
  // (phase 3) — approval can sit overnight, so verifying here would go stale.
  queries.approveSocialPost(id, body || null);
  revalidatePath('/admin/queue');
}

export async function skipPost(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return;
  queries.skipSocialPost(id, 'admin skip');
  revalidatePath('/admin/queue');
}
