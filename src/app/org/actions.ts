'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { queries } from '@/lib/db';
import { roleInOrg, getGroup } from '@/lib/org';
import { createBoard, revokeBoard, rotateBoard } from '@/lib/boardShare';

/**
 * Org actions. Server actions, so every one is a POST with a framework-issued
 * id — not something a link prefetcher or a mail scanner can trigger.
 *
 * Every action re-checks membership. An org id in a form field is user input;
 * without the check, anyone could mark another agency's watch as booked or mint
 * a board against their client's travel plans.
 */

async function assertCanEditGroup(groupId: number): Promise<number> {
  const user = await getCurrentUser();
  if (!user) throw new Error('not signed in');
  const group = getGroup(groupId);
  if (!group) throw new Error('no such group');
  const role = roleInOrg(group.org_id, user.id);
  // Viewers can read a board; they cannot change what it says.
  if (!role || role === 'viewer') throw new Error('not permitted');
  return user.id;
}

export async function markBooked(formData: FormData) {
  const groupId = Number(formData.get('groupId'));
  const watchId = Number(formData.get('watchId'));
  const amount = parseFloat(String(formData.get('amount') ?? ''));
  await assertCanEditGroup(groupId);
  if (!Number.isFinite(watchId) || !Number.isFinite(amount) || amount <= 0) return;

  // Records the numerator the whole savings report depends on. The watch does
  // not die: it flips to post-booking monitoring for the rebooking window.
  queries.markWatchBooked(watchId, amount);
  revalidatePath(`/org/groups/${groupId}`);
  revalidatePath('/org');
}

export async function unmarkBooked(formData: FormData) {
  const groupId = Number(formData.get('groupId'));
  const watchId = Number(formData.get('watchId'));
  await assertCanEditGroup(groupId);
  if (!Number.isFinite(watchId)) return;
  queries.unmarkWatchBooked(watchId);
  revalidatePath(`/org/groups/${groupId}`);
  revalidatePath('/org');
}

export async function adjustTarget(formData: FormData) {
  const groupId = Number(formData.get('groupId'));
  const watchId = Number(formData.get('watchId'));
  const amount = parseFloat(String(formData.get('amount') ?? ''));
  await assertCanEditGroup(groupId);
  if (!Number.isFinite(watchId) || !Number.isFinite(amount) || amount <= 0) return;

  // Only the TARGET moves. The baseline is deliberately untouched — it is the
  // fare at the time the trip was requested, and a baseline that moves when
  // someone adjusts a target is a savings report nobody can defend.
  queries.setSearchTarget(watchId, amount);
  revalidatePath(`/org/groups/${groupId}`);
  revalidatePath('/org');
}

export async function createGroupBoard(formData: FormData) {
  const groupId = Number(formData.get('groupId'));
  const userId = await assertCanEditGroup(groupId);
  const showTargets = formData.get('showTargets') === 'on';
  // The token is returned once and never stored, so it is surfaced through the
  // redirect rather than saved anywhere we could leak it later.
  const { token } = createBoard({
    groupId, createdBy: userId,
    showPrices: formData.get('showPrices') !== 'off',
    showTargets,
  });
  revalidatePath(`/org/groups/${groupId}`);
  return token;
}

export async function revokeGroupBoard(formData: FormData) {
  const groupId = Number(formData.get('groupId'));
  const boardId = Number(formData.get('boardId'));
  await assertCanEditGroup(groupId);
  revokeBoard(boardId);
  revalidatePath(`/org/groups/${groupId}`);
}

export async function rotateGroupBoard(formData: FormData) {
  const groupId = Number(formData.get('groupId'));
  const boardId = Number(formData.get('boardId'));
  const userId = await assertCanEditGroup(groupId);
  rotateBoard(boardId, userId);
  revalidatePath(`/org/groups/${groupId}`);
}
