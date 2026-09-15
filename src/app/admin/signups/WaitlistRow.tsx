'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { decideRequest, type WaitlistResult } from './actions';

function Btn({ action, label, gold }: { action: string; label: string; gold?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit" name="action" value={action}
      className={`ad-btn ${gold ? 'ad-btn-gold' : ''}`}
      disabled={pending}
    >
      {pending ? '…' : label}
    </button>
  );
}

/** One waitlist request with inline approve / decline. */
export function WaitlistRow({
  id, email, position, referredBy, requested, state,
}: {
  id: number; email: string; position: number;
  referredBy: string | null; requested: string; state: 'pending' | 'approved' | 'declined';
}) {
  const [res, action] = useActionState<WaitlistResult | null, FormData>(decideRequest, null);

  return (
    <tr>
      <td className="font-mono tabular-nums text-white/50">#{position}</td>
      <td className="text-white/90">{email}</td>
      <td className="text-white/45 text-[11.5px]">{referredBy ? `via ${referredBy}` : 'direct'}</td>
      <td className="text-white/45 whitespace-nowrap">{requested}</td>
      <td>
        {res?.message ? (
          <span className={`text-[11.5px] ${res.ok ? 'text-emerald-300' : 'text-rose-300'}`}>
            {res.ok ? '✓ ' : '✕ '}{res.message}
          </span>
        ) : state === 'pending' ? (
          <form action={action} className="flex gap-2">
            <input type="hidden" name="id" value={id} />
            <Btn action="approve" label="Approve & invite" gold />
            <Btn action="decline" label="Decline" />
          </form>
        ) : state === 'approved' ? (
          <form action={action} className="flex items-center gap-2">
            <input type="hidden" name="id" value={id} />
            <span className="text-emerald-300 text-[11.5px]">Approved</span>
            <Btn action="approve" label="Resend invite" />
          </form>
        ) : (
          <span className="text-white/35 text-[11.5px]">Declined</span>
        )}
      </td>
    </tr>
  );
}
