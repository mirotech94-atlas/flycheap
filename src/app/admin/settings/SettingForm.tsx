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

/** One editable platform setting: inline form, server-validated, audit-logged.
 *  Every row shares the same ruled-row skeleton as a real boolean toggle
 *  (`.ed-toggle-row`/`.ed-toggle-label`/`.ed-toggle-text`); only the control
 *  on the right differs. `ops_agent_enabled` is the one row whose `options`
 *  are exactly ['true', 'false'] — a real persisted boolean — so it renders
 *  as the shared 44×24 `.ed-toggle-switch` (checkbox as the real control,
 *  `role="switch"`, `aria-checked`, wrapped by the row's own `<label>`),
 *  wired to a hidden `value` field so the existing draft/dirty/Save flow
 *  (and the server action's `formData.get('value')` contract) is untouched.
 *  The other eleven rows are free-text config values (numbers, CSV lists,
 *  emails) saved on submit, not instant-persisted booleans — they don't fit
 *  the switch's "flip and it's live" semantics, so they keep the text input
 *  + datalist + Save button, per the same "not switch-ified, on purpose"
 *  reasoning task 2.11a applied to SmsOptIn's consent checkbox. */
export function SettingForm({
  settingKey, label, value, hint, options,
}: { settingKey: string; label: string; value: string; hint: string; options?: string[] }) {
  const [state, action] = useActionState<SettingResult | null, FormData>(updateSetting, null);
  const [draft, setDraft] = useState(value);
  const dirty = draft.trim() !== value.trim();
  const isBool = !!options && options.length === 2 && options.slice().sort().join(',') === 'false,true';

  return (
    <form action={action}>
      <input type="hidden" name="key" value={settingKey} />
      {isBool && <input type="hidden" name="value" value={draft} />}
      <div className="ed-toggle-row">
        <label className="ed-toggle-label">
          <span className="ed-toggle-text">
            <span className="ed-toggle-name">{label}</span>
            <span className="ed-toggle-help">{hint}</span>
          </span>
          {isBool ? (
            <span className="ed-toggle-switch">
              <input
                type="checkbox"
                className="ed-toggle-input"
                role="switch"
                aria-checked={draft === 'true'}
                checked={draft === 'true'}
                onChange={e => setDraft(e.target.checked ? 'true' : 'false')}
              />
              <span className="ed-toggle" aria-hidden><span className="ed-knob" /></span>
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <input
                name="value"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                list={options ? `opts-${settingKey}` : undefined}
                className="ed-input"
                autoComplete="off"
                spellCheck={false}
              />
              {options && (
                <datalist id={`opts-${settingKey}`}>
                  {options.map(o => <option key={o} value={o} />)}
                </datalist>
              )}
            </span>
          )}
        </label>
        <SaveButton dirty={dirty} />
      </div>
      {state?.key === settingKey && state.message && (
        <div className={`text-[11.5px] -mt-2 pb-3 ${state.ok ? 'ad-tone-good' : 'ad-tone-bad'}`} role="status">
          {state.ok ? '✓ ' : '✕ '}{state.message}
        </div>
      )}
    </form>
  );
}
