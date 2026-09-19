// Server component — links into the admin portal at admin.flycheap.live,
// rendered only when the current user is an admin. Hidden entirely for everyone
// else so we don't leak the existence of the portal.
import { getCurrentUser, isOwner } from '@/lib/auth';

export async function AdminChip() {
  const user = await getCurrentUser();
  // Owner-only: support admins (ADMIN_EMAILS) don't see the portal link.
  if (!user || !isOwner(user)) return null;
  return (
    <a
      href="https://admin.flycheap.live/"
      title="Open the admin portal"
      className="hidden md:inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-md border transition no-print"
      style={{
        borderColor: 'rgba(212,175,55,0.45)',
        background: 'rgba(212,175,55,0.10)',
        color: '#F2C67A',
      }}
    >
      <span
        className="inline-flex items-center justify-center w-5 h-5 rounded-sm text-[10px] font-bold"
        style={{ background: '#E8A33D', color: '#0B1220' }}
      >
        A
      </span>
      Admin
    </a>
  );
}
