'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { setTier, setSubscription, setFareSetting, type ActionState } from './actions';

function SaveButton({ label = 'Save' }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="ad-btn shrink-0" disabled={pending}>
      {pending ? 'Saving…' : label}
    </button>
  );
}

function Feedback({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <div className={`text-[11.5px] mt-1.5 ${state.error ? 'ad-tone-bad' : 'ad-tone-good'}`}>
      {state.error ?? state.ok}
    </div>
  );
}

export function TierForm({ userId, tier, tiers }: { userId: number; tier: string; tiers: string[] }) {
  const [state, action] = useActionState(setTier, null);
  return (
    <form action={action}>
      <input type="hidden" name="userId" value={userId} />
      <label className="ad-eyebrow">Tier</label>
      <div className="flex gap-2 mt-1.5">
        <select name="tier" defaultValue={tier} className="ad-input flex-1">
          {tiers.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <SaveButton />
      </div>
      <div className="ad-note mt-1.5 leading-snug">
        Grants a comp. No Stripe subscription is created and nobody is charged.
      </div>
      <Feedback state={state} />
    </form>
  );
}

const STATUSES = ['', 'founding_free', 'trialing', 'active', 'past_due', 'upgrade_due', 'canceled'];

export function SubscriptionForm({ userId, status, trialEndsAt }: {
  userId: number; status: string; trialEndsAt: string;
}) {
  const [state, action] = useActionState(setSubscription, null);
  return (
    <form action={action}>
      <input type="hidden" name="userId" value={userId} />
      <label className="ad-eyebrow">Subscription</label>
      <div className="flex flex-wrap gap-2 mt-1.5">
        <select name="status" defaultValue={status} className="ad-input flex-1 min-w-[140px]">
          {STATUSES.map(s => <option key={s} value={s}>{s || '(none)'}</option>)}
        </select>
        <input
          type="text" name="trial_ends_at" defaultValue={trialEndsAt.slice(0, 10)}
          placeholder="Trial ends YYYY-MM-DD"
          className="ad-input flex-1 min-w-[150px]"
        />
        <SaveButton />
      </div>
      <div className="ad-note mt-1.5 leading-snug">
        Only <code>active</code>, <code>trialing</code> and <code>past_due</code> count toward MRR.
        This never contacts Stripe or PayPal — use it to correct records, not to cancel a real subscription.
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function FareSettingForm({ userId, settingKey, label, hint, value }: {
  userId: number; settingKey: string; label: string; hint: string; value: string;
}) {
  const [state, action] = useActionState(setFareSetting, null);
  return (
    <form action={action} className="ad-rule-top py-2.5 first:pt-0">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="key" value={settingKey} />
      <label className="ad-eyebrow">{label}</label>
      <div className="flex gap-2 mt-1.5">
        <input
          type="text" name="value" defaultValue={value}
          placeholder="(platform default)"
          className="ad-input flex-1"
        />
        <SaveButton />
      </div>
      <div className="ad-note mt-1 leading-snug">{hint} Leave blank to clear the override.</div>
      <Feedback state={state} />
    </form>
  );
}
