'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { deleteUserAction, quickSetStatus, quickSetTier, type RowActionState } from './actions';

const TIERS = ['free', 'pro', 'enterprise'] as const;
const STATUSES = [
  { value: 'founding_free', label: 'Founding trial' },
  { value: 'trialing',      label: 'Trialing' },
  { value: 'active',        label: 'Active' },
  { value: 'past_due',      label: 'Past due' },
  { value: 'upgrade_due',   label: 'Upgrade due' },
  { value: 'canceled',      label: 'Canceled' },
  { value: '',              label: 'Clear status' },
] as const;

type Props = {
  userId: number;
  email: string;
  tier: string;
  status: string | null;
  /** The owner's own row: destructive and tier actions are hidden. */
  isSelf: boolean;
};

/** Per-row ⋯ menu on /admin/users — tier, subscription status, and deletion
 *  without opening each account. Every item posts to an owner-gated server
 *  action; this component only decides what to show. */
export function RowMenu({ userId, email, tier, status, isSelf }: Props) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  const [tierState, tierSubmit, tierPending]     = useActionState<RowActionState, FormData>(quickSetTier, null);
  const [statusState, statusSubmit, statusPending] = useActionState<RowActionState, FormData>(quickSetStatus, null);
  const [delState, delSubmit, delPending]        = useActionState<RowActionState, FormData>(deleteUserAction, null);

  const feedback = delState ?? tierState ?? statusState;
  const pending = tierPending || statusPending || delPending;

  // Close on outside click / Escape so the menu never traps the page.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); setConfirming(false); }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); setConfirming(false); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  // A successful delete removes the row entirely; for the rest, close and let
  // revalidatePath repaint the table with the new values.
  useEffect(() => {
    if (feedback?.ok) { setConfirming(false); setTyped(''); }
  }, [feedback?.ok]);

  const item = 'ad-menu-item w-full text-left px-3 py-1.5 text-[12px] transition hover:opacity-[0.72] disabled:opacity-40 disabled:cursor-not-allowed';
  const heading = 'ad-menu-heading px-3 pt-2 pb-1 text-[9px] uppercase tracking-[0.16em]';

  return (
    <div className="relative inline-block text-left" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${email}`}
        className="ad-menu-trigger px-2 py-1 transition leading-none text-base"
      >
        ⋯
      </button>

      {open && (
        <div
          role="menu"
          className="ad-menu absolute right-0 z-30 mt-1 w-60 overflow-hidden"
        >
          <Link
            href={`/admin/users/${userId}`}
            className={`${item} block`}
            onClick={() => setOpen(false)}
          >
            View details →
          </Link>

          {!isSelf && (
            <>
              <div className={heading}>Tier (comp — bills nobody)</div>
              {TIERS.map(t => (
                <form key={t} action={tierSubmit}>
                  <input type="hidden" name="userId" value={userId} />
                  <input type="hidden" name="tier" value={t} />
                  <button type="submit" className={item} disabled={pending || t === tier}>
                    {t === tier ? '✓ ' : ''}{t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                </form>
              ))}

              <div className={heading}>Subscription status</div>
              {STATUSES.map(s => (
                <form key={s.value || 'clear'} action={statusSubmit}>
                  <input type="hidden" name="userId" value={userId} />
                  <input type="hidden" name="status" value={s.value} />
                  <button type="submit" className={item} disabled={pending || s.value === (status ?? '')}>
                    {s.value === (status ?? '') ? '✓ ' : ''}{s.label}
                  </button>
                </form>
              ))}

              <div className="mt-1" style={{ borderTop: '1px solid var(--rule)' }}>
                {!confirming ? (
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    className="ad-menu-item danger w-full text-left px-3 py-2 text-[12px] transition hover:opacity-[0.72]"
                  >
                    Delete account…
                  </button>
                ) : (
                  <form action={delSubmit} className="px-3 py-2 space-y-2">
                    <input type="hidden" name="userId" value={userId} />
                    <p className="text-[11px] leading-snug" style={{ color: 'var(--muted)' }}>
                      Permanently deletes this account, its routes, sessions and alerts. Type{' '}
                      <span className="break-all" style={{ color: 'var(--red)' }}>{email}</span> to confirm.
                    </p>
                    <input
                      name="confirmEmail"
                      value={typed}
                      onChange={e => setTyped(e.target.value)}
                      autoComplete="off"
                      placeholder="Type the email"
                      className="ed-input danger"
                    />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={pending || typed.trim().toLowerCase() !== email.toLowerCase()}
                        className="ed-btn ed-btn-danger flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {delPending ? 'Deleting…' : 'Delete'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setConfirming(false); setTyped(''); }}
                        className="ed-btn ed-btn-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </>
          )}

          {isSelf && (
            <p className="px-3 py-2 text-[11px] mt-1" style={{ color: 'var(--muted-2)', borderTop: '1px solid var(--rule)' }}>
              This is your own account — tier and deletion are disabled here.
            </p>
          )}

          {feedback && (
            <p className={`px-3 py-2 text-[11px] mt-1 ${feedback.error ? 'ad-tone-bad' : 'ad-tone-good'}`} style={{ borderTop: '1px solid var(--rule)' }}>
              {feedback.error ?? feedback.ok}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
