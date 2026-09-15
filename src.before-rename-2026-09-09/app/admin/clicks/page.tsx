// "Clicks" tab in the new admin nav — uses the same component as the legacy
// /admin/affiliate page. Inlined (not re-exported) because Next.js requires
// the `dynamic` segment config to be a literal export from this file.
import AffiliatePage from '../affiliate/page';

export const dynamic = 'force-dynamic';

export default async function AdminClicksPage() {
  return await AffiliatePage();
}
