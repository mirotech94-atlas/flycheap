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

  const item = 'w-full text-left px-3 py-1.5 text-[12px] text-white/75 hover:bg-white/8 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed';
  const heading = 'px-3 pt-2 pb-1 text-[9px] uppercase tracking-[0.16em] text-white/35';

  return (
    <div className="relative inline-block text-left" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${email}`}
        className="px-2 py-1 rounded-md text-white/45 hover:text-white hover:bg-white/10 transition leading-none text-base"
      >
        ⋯
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-60 rounded-lg border border-white/10 bg-[#0d1b33] shadow-[0_18px_40px_-16px_rgba(0,0,0,.8)] overflow-hidden"
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

              <div className="border-t border-white/10 mt-1">
                {!confirming ? (
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    className="w-full text-left px-3 py-2 text-[12px] text-red-300 hover:bg-red-500/15 hover:text-red-200 transition"
                  >
                    Delete account…
                  </button>
                ) : (
                  <form action={delSubmit} className="px-3 py-2 space-y-2">
                    <input type="hidden" name="userId" value={userId} />
                    <p className="text-[11px] text-white/60 leading-snug">
                      Permanently deletes this account, its routes, sessions and alerts. Type{' '}
                      <span className="text-red-300 break-all">{email}</span> to confirm.
                    </p>
                    <input
                      name="confirmEmail"
                      value={typed}
                      onChange={e => setTyped(e.target.value)}
                      autoComplete="off"
                      placeholder="Type the email"
                      className="w-full px-2 py-1 rounded border border-white/15 bg-black/30 text-[11px] text-white placeholder-white/30 focus:outline-none focus:border-red-400/60"
                    />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={pending || typed.trim().toLowerCase() !== email.toLowerCase()}
                        className="flex-1 px-2 py-1 rounded bg-red-600 text-white text-[11px] font-semibold hover:bg-red-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {delPending ? 'Deleting…' : 'Delete'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setConfirming(false); setTyped(''); }}
                        className="px-2 py-1 rounded border border-white/15 text-white/60 text-[11px] hover:text-white transition"
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
            <p className="px-3 py-2 text-[11px] text-white/40 border-t border-white/10">
              This is your own account — tier and deletion are disabled here.
            </p>
          )}

          {feedback && (
            <p className={`px-3 py-2 text-[11px] border-t border-white/10 ${feedback.error ? 'text-red-300' : 'text-emerald-300'}`}>
              {feedback.error ?? feedback.ok}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
