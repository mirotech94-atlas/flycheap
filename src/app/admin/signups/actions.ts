'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { getCurrentUser, isOwner } from '@/lib/auth';
import { getDb, queries } from '@/lib/db';
import { getEarlyAccessById, sendInviteEmail } from '@/lib/early-access';

export type WaitlistResult = { ok: boolean; id?: number; message: string };

/**
 * Approve or decline an early-access request straight from the admin portal.
 * The emailed one-click links still work; this is the same decision without
 * needing to find that email. Founder-only and audit-logged.
 */
export async function decideRequest(_prev: WaitlistResult | null, formData: FormData): Promise<WaitlistResult> {
  const user = await getCurrentUser();
  if (!isOwner(user)) return { ok: false, message: 'Not authorised.' };

  const id = Number(formData.get('id'));
  const action = String(formData.get('action') ?? '');
  if (!Number.isFinite(id)) return { ok: false, message: 'Bad request id.' };
  if (action !== 'approve' && action !== 'decline') return { ok: false, id, message: 'Unknown action.' };

  const row = getEarlyAccessById(id);
  if (!row) return { ok: false, id, message: 'That request no longer exists.' };

  const db = getDb();
  if (action === 'approve') {
    db.prepare(
      `UPDATE early_access SET approved_at = COALESCE(approved_at, datetime('now')), declined_at = NULL WHERE id = ?`
    ).run(id);
  } else {
    db.prepare(
      `UPDATE early_access SET declined_at = COALESCE(declined_at, datetime('now')), approved_at = NULL WHERE id = ?`
    ).run(id);
  }

  // Only the approval sends mail — a decline is silent by design.
  let mailed = false;
  if (action === 'approve') {
    const fresh = getEarlyAccessById(id);
    if (fresh) {
      try { await sendInviteEmail(fresh); mailed = true; } catch { /* reported below */ }
    }
  }

  try {
    const h = await headers();
    queries.insertAudit({
      user_id: user!.id, email: user!.email,
      action: `early_access.${action}`, entity: `early_access/${id}`,
      detail: { email: row.email, mailed },
      ip: (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || null,
    });
  } catch { /* audit is best-effort */ }

  revalidatePath('/admin/signups');
  revalidatePath('/admin');
  return {
    ok: true, id,
    message: action === 'approve'
      ? (mailed ? `Approved — invite emailed to ${row.email}.` : `Approved, but the invite email failed to send to ${row.email}.`)
      : `Declined ${row.email}. No email was sent.`,
  };
}
