import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// The admin root used to render its own Overview, but the new sidebar starts
// with Revenue as the first nav item, so the root just bounces there to land
// the user on the same first tab the sidebar highlights.
export default function AdminRoot() {
  redirect('/admin/revenue');
}
