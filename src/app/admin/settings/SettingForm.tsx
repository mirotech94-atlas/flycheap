'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { updateSetting, type SettingResult } from './actions';

function SaveButton({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="ad-btn ad-btn-gold shrink-0" disabled={pending || !dirty}>
      {pending ? 'Saving…' : 'Save'}
    </button>
  );
}

/** One editable platform setting: inline form, server-validated, audit-logged. */
export function SettingForm({
  settingKey, label, value, hint, options,
}: { settingKey: string; label: string; value: string; hint: string; options?: string[] }) {
  const [state, action] = useActionState<SettingResult | null, FormData>(updateSetting, null);
  const [draft, setDraft] = useState(value);
  const dirty = draft.trim() !== value.trim();

  return (
    <form action={action} className="py-3.5 border-t border-white/[0.06] first:border-t-0">
      <input type="hidden" name="key" value={settingKey} />
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[200px] flex-1">
          <label htmlFor={`s-${settingKey}`} className="block text-[13px] text-white/85 font-medium">{label}</label>
          <div className="text-[11.5px] text-white/40 mt-0.5 leading-snug">{hint}</div>
        </div>
        <div className="flex items-center gap-2">
          <input
            id={`s-${settingKey}`}
            name="value"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            list={options ? `opts-${settingKey}` : undefined}
            className="ad-input"
            autoComplete="off"
            spellCheck={false}
          />
          {options && (
            <datalist id={`opts-${settingKey}`}>
              {options.map(o => <option key={o} value={o} />)}
            </datalist>
          )}
          <SaveButton dirty={dirty} />
        </div>
      </div>
      {state?.key === settingKey && state.message && (
        <div className={`text-[11.5px] mt-2 ${state.ok ? 'text-emerald-300' : 'text-rose-300'}`} role="status">
          {state.ok ? '✓ ' : '✕ '}{state.message}
        </div>
      )}
    </form>
  );
}
