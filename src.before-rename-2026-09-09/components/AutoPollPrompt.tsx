'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Auto-fires a poll request when Price Prediction has insufficient history.
 * Fires once per mount + per searchId; UI shows progress and result so the
 * user understands the bot is filling the gap on their behalf.
 */
export function AutoPollPrompt({ searchId }: { searchId: number | undefined }) {
  const [state, setState] = useState<'idle' | 'polling' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState<string | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    if (!searchId || fired.current) return;
    fired.current = true;
    setState('polling');
    fetch(`/api/poll?search_id=${searchId}`, { method: 'POST' })
      .then(async r => {
        const j = await r.json().catch(() => ({}));
        if (j?.ok) {
          setState('done');
          setMsg('Fresh poll cached. Refresh in a moment for a prediction.');
        } else {
          setState('error');
          setMsg(j?.error || 'Could not auto-poll right now.');
        }
      })
      .catch(e => {
        setState('error');
        setMsg((e as Error).message);
      });
  }, [searchId]);

  if (!searchId) return null;
  return (
    <div className="text-[11px] text-slate-500 mt-2">
      {state === 'polling' && <>⏳ Auto-polling now to build prediction…</>}
      {state === 'done' && <span className="text-emerald-600">✓ {msg}</span>}
      {state === 'error' && <span className="text-amber-600">⚠ {msg}</span>}
    </div>
  );
}
