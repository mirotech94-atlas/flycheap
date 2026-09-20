'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/components/Toaster';

/**
 * When alerts are allowed to interrupt you.
 *
 * lib/alertPolicy.ts decides this on every send — quiet hours, a daily cap,
 * digest-by-default, and one explicit opt-in to be woken for a glitch fare.
 * All of it shipped with no way for a web user to reach any of it: quiet hours
 * and the timezone were settable only from the mobile API, and the cap, the
 * digest default and the mistake-fare opt-in from nowhere at all.
 *
 * THE TIMEZONE IS CAPTURED, NOT ASKED
 * alertGate applies the default 22:00–08:00 window ONLY when it knows the
 * user's offset, because without one "local time" is UTC — which would have
 * silenced a US user's alerts from 6pm. Nobody types a UTC offset, so the
 * browser reports it and this card says what it detected.
 */

type Policy = {
  quiet_hours_start: string;
  quiet_hours_end: string;
  daily_alert_cap: number | null;
  instant_alerts: boolean;
  wake_for_mistake_fares: boolean;
  tz_offset_min: number | null;
};

const DEFAULT_CAP = 3;

/** "UTC−4" — how the detected offset is shown back. */
function offsetLabel(mins: number | null): string {
  if (mins == null) return 'not detected yet';
  const sign = mins < 0 ? '−' : '+';
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

export function AlertPolicyCard() {
  const toast = useToast();
  const [p, setP] = useState<Policy | null>(null);
  const [saving, setSaving] = useState(false);
  const [tzName, setTzName] = useState<string | null>(null);

  useEffect(() => {
    // getTimezoneOffset is minutes BEHIND UTC, i.e. the opposite sign from the
    // offset everyone writes. New York reports 240; the offset is −240.
    const detected = -new Date().getTimezoneOffset();
    try { setTzName(Intl.DateTimeFormat().resolvedOptions().timeZone); } catch { /* not fatal */ }

    fetch('/api/settings').then(r => r.json()).then(j => {
      setP({
        quiet_hours_start: j.quiet_hours_start ?? '',
        quiet_hours_end: j.quiet_hours_end ?? '',
        daily_alert_cap: j.daily_alert_cap ?? null,
        instant_alerts: j.instant_alerts !== false,
        wake_for_mistake_fares: Boolean(j.wake_for_mistake_fares),
        // Trust the browser over a stored value: people move, and a stale
        // offset is what makes quiet hours fire at the wrong time.
        tz_offset_min: detected,
      });
      if (j.tz_offset_min !== detected) {
        // Persist quietly. Nothing about this needs the user's attention, and
        // it is the difference between quiet hours working and not.
        fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tz_offset_min: detected }),
        }).catch(() => { /* a failed capture just means no default window */ });
      }
    }).catch(() => setP(null));
  }, []);

  if (!p) return null;

  const set = <K extends keyof Policy>(k: K, v: Policy[K]) =>
    setP(prev => (prev ? { ...prev, [k]: v } : prev));

  const quietHoursOn = Boolean(p.quiet_hours_start && p.quiet_hours_end);

  async function save() {
    if (!p) return;
    setSaving(true);
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quiet_hours_start: p.quiet_hours_start,
        quiet_hours_end: p.quiet_hours_end,
        daily_alert_cap: p.daily_alert_cap ?? DEFAULT_CAP,
        instant_alerts: p.instant_alerts ? 'true' : 'false',
        wake_for_mistake_fares: p.wake_for_mistake_fares ? 'true' : 'false',
        tz_offset_min: p.tz_offset_min ?? 0,
      }),
    });
    setSaving(false);
    if (!res.ok) { toast.error('Save failed', 'Try again.'); return; }
    const j = await res.json().catch(() => ({} as { ignored?: string[] }));
    if (j.ignored?.length) toast.error('Some settings were not saved', j.ignored.join(', '));
    else toast.success('Saved', 'This applies to the next alert we send.');
  }

  return (
    <div className="card" id="alert-policy">
      <div className="card-head">
        <div>
          <div className="eyebrow">Alerts</div>
          <h2 className="!mb-0">When we’re allowed to interrupt you</h2>
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        An alert that wakes you at 3am for a fare that was never going to move does not just
        annoy you — it teaches you to mute the channel the $400 mistake fare arrives on tomorrow.
      </p>

      {/* Quiet hours */}
      <div className="mb-4">
        <label className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 block mb-1">
          Quiet hours
        </label>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input
            type="time"
            value={p.quiet_hours_start}
            onChange={e => set('quiet_hours_start', e.target.value)}
            className="font-mono text-xs"
            aria-label="Quiet hours start"
          />
          <span className="text-slate-500">to</span>
          <input
            type="time"
            value={p.quiet_hours_end}
            onChange={e => set('quiet_hours_end', e.target.value)}
            className="font-mono text-xs"
            aria-label="Quiet hours end"
          />
          {quietHoursOn && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => { set('quiet_hours_start', ''); set('quiet_hours_end', ''); }}
            >
              Clear
            </button>
          )}
        </div>
        <p className="text-[10px] text-slate-500 mt-1">
          {quietHoursOn
            ? <>Nothing but a mistake fare reaches you between these times, and only if you opt in below.</>
            : <>Not set — alerts can arrive at any hour. A window that crosses midnight is fine.</>}
          {' '}Your times, read as <strong>{offsetLabel(p.tz_offset_min)}</strong>
          {tzName ? ` (${tzName})` : ''}, detected from this browser.
        </p>
      </div>

      {/* Mistake-fare exception */}
      <label className="flex items-start gap-2 mb-4 text-sm">
        <input
          type="checkbox"
          checked={p.wake_for_mistake_fares}
          onChange={e => set('wake_for_mistake_fares', e.target.checked)}
          className="mt-1"
          disabled={!quietHoursOn}
        />
        <span>
          Wake me for a mistake fare
          <span className="block text-[10px] text-slate-500">
            A glitch fare at 3am is the one case where waking you is right — but only if you
            agreed to it. Nothing else ever breaks quiet hours.
            {!quietHoursOn && ' Set quiet hours above for this to mean anything.'}
          </span>
        </span>
      </label>

      {/* Frequency cap */}
      <div className="mb-4">
        <label className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 block mb-1">
          Most alerts per day
        </label>
        <input
          type="number"
          min={1}
          max={50}
          value={p.daily_alert_cap ?? DEFAULT_CAP}
          onChange={e => set('daily_alert_cap', parseInt(e.target.value, 10) || DEFAULT_CAP)}
          className="w-24 font-mono text-xs"
        />
        <p className="text-[10px] text-slate-500 mt-1">
          Anything over this waits for your digest. A mistake fare is never capped — a cap that
          swallowed the one alert worth $400 would be the most expensive setting here.
        </p>
      </div>

      {/* Instant vs digest */}
      <label className="flex items-start gap-2 mb-4 text-sm">
        <input
          type="checkbox"
          checked={p.instant_alerts}
          onChange={e => set('instant_alerts', e.target.checked)}
          className="mt-1"
        />
        <span>
          Send alerts the moment they happen
          <span className="block text-[10px] text-slate-500">
            Off means everything except a closing booking window waits for your digest. Turning
            it off is the usual fix for feeling over-alerted — quieter than muting us entirely.
          </span>
        </span>
      </label>

      <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save alert settings'}
      </button>
    </div>
  );
}
