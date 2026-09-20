'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { queries, getDb, limitsForUser } from '@/lib/db';
import { isOwner } from '@/lib/auth';
import type { Channel } from '@/lib/alertPolicy';

/**
 * Actions on one watch, from the board.
 *
 * Server actions, so each is a POST carrying a framework-issued id — not
 * something a link prefetcher or a mail scanner can trigger by following a URL.
 *
 * Every action re-checks ownership. A watch id in a form field is user input,
 * and a route id is a small integer: without the check, anyone signed in could
 * re-point another account's alerts at their own phone.
 */
async function assertOwnsWatch(watchId: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error('not signed in');
  if (!Number.isFinite(watchId)) throw new Error('no such watch');
  const row = queries.getSearchById(watchId);
  if (!row) throw new Error('no such watch');
  const mine = row.user_id != null && row.user_id === user.id;
  if (!mine && !isOwner(user)) throw new Error('no such watch');
  return user;
}

/**
 * Mark a route as one they fly every year.
 *
 * "A home route NEVER expires — it is the one they fly every year, it is the
 *  reason to exist in their inbox permanently."
 *
 * computeExpiry() and hasExpired() already honour it; nothing could set it.
 */
export async function setHomeRoute(formData: FormData) {
  const id = Number(formData.get('watchId'));
  await assertOwnsWatch(id);
  const on = formData.get('value') === 'on';
  getDb().prepare('UPDATE searches SET is_home_route = ? WHERE id = ?').run(on ? 1 : 0, id);
  // A home route never expires, so clear an expiry it was already carrying —
  // otherwise the flag says "permanent" while the stored date still retires it.
  if (on) getDb().prepare('UPDATE searches SET expires_at = NULL WHERE id = ?').run(id);
  revalidatePath(`/board/${id}`);
  revalidatePath('/board');
}

/**
 * Per-watch alert channels.
 *
 * "The home route to see family gets SMS; the speculative Tokyo budget watch
 *  gets digest." alertGate already reads search.alert_channels and intersects
 *  it with what the account has configured — so this can only ever narrow, it
 *  cannot conjure a channel the user has not set up or their tier does not
 *  allow. Empty means "use my account default".
 */
export async function setWatchChannels(formData: FormData) {
  const id = Number(formData.get('watchId'));
  const user = await assertOwnsWatch(id);

  const raw = String(formData.get('channels') ?? '');
  const allowed = new Set<string>([...limitsForUser(user).channels, 'push']);
  const chosen = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    .filter(c => allowed.has(c));

  getDb().prepare('UPDATE searches SET alert_channels = ? WHERE id = ?')
    .run(chosen.length ? chosen.join(',') : null, id);
  revalidatePath(`/board/${id}`);
}

export type WatchChannelChoice = { id: Channel; label: string; available: boolean };
