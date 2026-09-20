'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { queries } from '@/lib/db';
import { roleInOrg } from '@/lib/org';

/**
 * Approving a report is sending a number to a client under the agency's name.
 * Only an owner or admin may do it — an agent can read the queue, and a viewer
 * can read a board, but neither speaks for the agency to its clients.
 *
 * Every action re-checks the role. An org id in a form field is user input.
 */
async function assertCanApprove(orgId: number): Promise<number> {
  const user = await getCurrentUser();
  if (!user) throw new Error('not signed in');
  const role = roleInOrg(orgId, user.id);
  if (role !== 'owner' && role !== 'admin') throw new Error('not permitted');
  return user.id;
}

/** Per-row. `id` is bound at render time — see the page for why it is not a form field. */
export async function approveReport(id: number, formData: FormData) {
  const orgId = Number(formData.get('orgId'));
  const userId = await assertCanApprove(orgId);
  if (!Number.isFinite(id)) return;
  queries.approveReportSends([id], orgId, userId);
  revalidatePath('/org/reports');
}

/**
 * The bulk action the spec asks for. One POST, many ids; the query itself
 * scopes them to this org and to QUEUED rows, so an id from another agency —
 * or one already sent — is ignored rather than acted on.
 */
export async function approveSelected(formData: FormData) {
  const orgId = Number(formData.get('orgId'));
  const userId = await assertCanApprove(orgId);
  const ids = formData.getAll('ids').map(v => Number(v)).filter(n => Number.isFinite(n));
  if (ids.length) queries.approveReportSends(ids, orgId, userId);
  revalidatePath('/org/reports');
}

export async function approveAllQueued(formData: FormData) {
  const orgId = Number(formData.get('orgId'));
  const userId = await assertCanApprove(orgId);
  const ids = queries.reportSendsForOrg(orgId, 'queued').map(r => r.id);
  if (ids.length) queries.approveReportSends(ids, orgId, userId);
  revalidatePath('/org/reports');
}

export async function skipReport(id: number, formData: FormData) {
  const orgId = Number(formData.get('orgId'));
  await assertCanApprove(orgId);
  if (!Number.isFinite(id)) return;
  queries.skipReportSend(id, orgId, 'skipped by agency');
  revalidatePath('/org/reports');
}
