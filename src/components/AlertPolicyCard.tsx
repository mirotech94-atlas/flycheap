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

type QuietSource = 'user' | 'off' | 'default' | 'unknown-timezone';

type Policy = {
  quiet_hours_start: string;
  quiet_hours_end: string;
  /** Why the window above is what it is — straight from the server. */
  quiet_hours_source: QuietSource;
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
    // offset everyone writes. New York reports 240; the offset is -240.
    const detected = -new Date().getTimezoneOffset();
    try { setTzName(Intl.DateTimeFormat().resolvedOptions().timeZone); } catch { /* not fatal */ }

    // CAPTURE FIRST, THEN READ — the order matters.
    //
    // Storing the timezone is what makes the default quiet-hours window apply,
    // so reading first and writing after would render the state as it was a
    // moment ago: the card would say "Off — alerts can arrive at any hour"
    // about an account that its own write had just made silent overnight. That
    // is the same UI-says-one-thing-engine-does-another shape as the Clear bug,
    // and it lasted about a hundred milliseconds, which is long enough to be
    // the thing the user read.
    (async () => {
      try {
        await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tz_offset_min: detected }),
        });
      } catch {
        // A failed capture just means no default window — not fatal, and the
        // read below will report that honestly.
      }

      const j = await fetch('/api/settings').then(r => r.json()).catch(() => null);
      if (!j) { setP(null); return; }

      const src: QuietSource = j.quiet_hours_source ?? 'unknown-timezone';
      setP({
        // The EFFECTIVE window, not the stored one, so the card cannot claim
        // quiet hours are off while the engine is holding alerts.
        quiet_hours_start: j.quiet_hours_effective_start ?? j.quiet_hours_start ?? '',
        quiet_hours_end: j.quiet_hours_effective_end ?? j.quiet_hours_end ?? '',
        quiet_hours_source: src,
        daily_alert_cap: j.daily_alert_cap ?? null,
        instant_alerts: j.instant_alerts !== false,
        wake_for_mistake_fares: Boolean(j.wake_for_mistake_fares),
        tz_offset_min: detected,
      });
    })();
  }, []);

  if (!p) return null;

  const set = <K extends keyof Policy>(k: K, v: Policy[K]) =>
    setP(prev => (prev ? { ...prev, [k]: v } : prev));

  // Editing the window makes it the user's own, whatever it was before.
  const setWindow = (k: 'quiet_hours_start' | 'quiet_hours_end', v: string) =>
    setP(prev => (prev ? { ...prev, [k]: v, quiet_hours_source: 'user' } : prev));

  const quietHoursOn = Boolean(p.quiet_hours_start && p.quiet_hours_end);

  async function save() {
    if (!p) return;
    setSaving(true);
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Saving pins whatever is on screen. If that was the default, it stops
        // being implicit — so the stored value and the displayed value can
        // never drift apart again.
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
    <section className="ed-panel" id="alert-policy">
      <div className="ed-panel-head">
        <div>
          <div className="ed-eyebrow">Alerts</div>
          <h2 className="ed-panel-title">When we’re allowed to interrupt you</h2>
        </div>
      </div>
      <p className="ed-panel-note" style={{ marginBottom: 18 }}>
        An alert that wakes you at 3am for a fare that was never going to move does not just
        annoy you — it teaches you to mute the channel the $400 mistake fare arrives on tomorrow.
      </p>

      {/* Quiet hours */}
      <div className="mb-4">
        <label className="ed-label">
          Quiet hours
        </label>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input
            type="time"
            value={p.quiet_hours_start}
            onChange={e => setWindow('quiet_hours_start', e.target.value)}
            className="ed-input"
            style={{ width: 'auto' }}
            aria-label="Quiet hours start"
          />
          <span style={{ color: 'var(--muted)' }}>to</span>
          <input
            type="time"
            value={p.quiet_hours_end}
            onChange={e => setWindow('quiet_hours_end', e.target.value)}
            className="ed-input"
            style={{ width: 'auto' }}
            aria-label="Quiet hours end"
          />
          {quietHoursOn && (
            <button
              type="button"
              className="ed-btn ed-btn-secondary"
              onClick={() => setP(prev => prev ? {
                ...prev, quiet_hours_start: '', quiet_hours_end: '', quiet_hours_source: 'off',
              } : prev)}
            >
              Clear
            </button>
          )}
        </div>
        <p className="ed-panel-note" style={{ marginTop: 6 }}>
          {quietHoursOn ? (
            <>
              {p.quiet_hours_source === 'default'
                ? <><strong>These are the default quiet hours, and they are in force now.</strong>{' '}
                    Change them, or press Clear to turn them off.{' '}</>
                : <>Nothing but a mistake fare reaches you between these times, and only if you
                    opt in below.{' '}</>}
            </>
          ) : (
            <>Off — alerts can arrive at any hour. A window that crosses midnight is fine.{' '}</>
          )}
          Your times, read as <strong>{offsetLabel(p.tz_offset_min)}</strong>
          {tzName ? ` (${tzName})` : ''}, detected from this browser.
        </p>
      </div>

      {/* Mistake-fare exception */}
      <label className="ed-toggle-row">
        <div className="ed-toggle-text">
          <span className="ed-toggle-name">Wake me for a mistake fare</span>
          <span className="ed-toggle-help">
            A glitch fare at 3am is the one case where waking you is right — but only if you
            agreed to it. Nothing else ever breaks quiet hours.
            {!quietHoursOn && ' Set quiet hours above for this to mean anything.'}
          </span>
        </div>
        <span className="ed-toggle-switch">
          <input
            type="checkbox"
            className="ed-toggle-input"
            role="switch"
            aria-checked={p.wake_for_mistake_fares}
            checked={p.wake_for_mistake_fares}
            onChange={e => set('wake_for_mistake_fares', e.target.checked)}
            disabled={!quietHoursOn}
          />
          <span className="ed-toggle" aria-hidden><span className="ed-knob" /></span>
        </span>
      </label>

      {/* Frequency cap */}
      <div className="my-4">
        <label className="ed-label">
          Most alerts per day
        </label>
        <input
          type="number"
          min={1}
          max={50}
          value={p.daily_alert_cap ?? DEFAULT_CAP}
          onChange={e => set('daily_alert_cap', parseInt(e.target.value, 10) || DEFAULT_CAP)}
          className="ed-input"
          style={{ width: 96 }}
        />
        <p className="ed-panel-note" style={{ marginTop: 6 }}>
          Anything over this waits for your digest. A mistake fare is never capped — a cap that
          swallowed the one alert worth $400 would be the most expensive setting here.
        </p>
      </div>

      {/* Instant vs digest */}
      <label className="ed-toggle-row">
        <div className="ed-toggle-text">
          <span className="ed-toggle-name">Send alerts the moment they happen</span>
          <span className="ed-toggle-help">
            Off means everything except a closing booking window waits for your digest. Turning
            it off is the usual fix for feeling over-alerted — quieter than muting us entirely.
          </span>
        </div>
        <span className="ed-toggle-switch">
          <input
            type="checkbox"
            className="ed-toggle-input"
            role="switch"
            aria-checked={p.instant_alerts}
            checked={p.instant_alerts}
            onChange={e => set('instant_alerts', e.target.checked)}
          />
          <span className="ed-toggle" aria-hidden><span className="ed-knob" /></span>
        </span>
      </label>

      <button type="button" className="ed-btn ed-btn-primary" style={{ marginTop: 18 }} onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save alert settings'}
      </button>
    </section>
  );
}
