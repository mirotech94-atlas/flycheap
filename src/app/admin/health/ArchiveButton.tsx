'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { archiveRoute, type RouteResult } from './actions';

function Btn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="ad-btn" disabled={pending} title="Stop polling this route — fare history is kept">
      {pending ? 'Archiving…' : 'Archive'}
    </button>
  );
}

/** Inline archive control for a departed route. */
export function ArchiveButton({ id }: { id: number }) {
  const [res, action] = useActionState<RouteResult | null, FormData>(archiveRoute, null);
  if (res?.message) {
    return <span className={`text-[11.5px] ${res.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{res.ok ? '✓ ' : '✕ '}{res.message}</span>;
  }
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Btn />
    </form>
  );
}
