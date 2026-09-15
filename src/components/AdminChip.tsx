// Server component — links into the admin portal at admin.flycheap.18dn.com,
// rendered only when the current user is an admin. Hidden entirely for everyone
// else so we don't leak the existence of the portal.
import { getCurrentUser, isOwner } from '@/lib/auth';

export async function AdminChip() {
  const user = await getCurrentUser();
  // Owner-only: support admins (ADMIN_EMAILS) don't see the portal link.
  if (!user || !isOwner(user)) return null;
  return (
    <a
      href="https://admin.flycheap.18dn.com/"
      title="Open the admin portal"
      className="hidden md:inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-md border transition no-print"
      style={{
        borderColor: 'rgba(212,175,55,0.45)',
        background: 'rgba(212,175,55,0.10)',
        color: '#f0d674',
      }}
    >
      <span
        className="inline-flex items-center justify-center w-5 h-5 rounded-sm text-[10px] font-bold"
        style={{ background: '#d4af37', color: '#0a3a6b' }}
      >
        A
      </span>
      Admin
    </a>
  );
}
