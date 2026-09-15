'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { getCurrentUser, isOwner } from '@/lib/auth';
import { getDb, queries } from '@/lib/db';

export type RouteResult = { ok: boolean; id?: number; message: string };

/**
 * Archive a tracked route (sets active = 0). Used for routes whose departure
 * date has passed — they consume polling quota and can never fire an alert.
 * Nothing is deleted: fare history stays, and the row can be reactivated.
 */
export async function archiveRoute(_prev: RouteResult | null, formData: FormData): Promise<RouteResult> {
  const user = await getCurrentUser();
  if (!isOwner(user)) return { ok: false, message: 'Not authorised.' };

  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return { ok: false, message: 'Bad route id.' };

  const db = getDb();
  const row = db.prepare(
    `SELECT id, origin, destination, depart_date, user_id FROM searches WHERE id = ?`
  ).get(id) as { id: number; origin: string; destination: string; depart_date: string; user_id: number } | undefined;
  if (!row) return { ok: false, id, message: 'Route not found.' };

  queries.setSearchActive(id, 0);

  try {
    const h = await headers();
    queries.insertAudit({
      user_id: user!.id, email: user!.email,
      action: 'route.archive', entity: `searches/${id}`,
      detail: { route: `${row.origin}->${row.destination}`, depart_date: row.depart_date, owner: row.user_id },
      ip: (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || null,
    });
  } catch { /* audit is best-effort */ }

  revalidatePath('/admin/health');
  revalidatePath('/admin');
  return { ok: true, id, message: `Archived ${row.origin} → ${row.destination}. Fare history kept.` };
}
