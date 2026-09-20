import 'server-only';
import { queries, limitsForUser, type SearchRow } from './db';
import { decideAlert, DEFAULT_QUIET_HOURS, type AlertDecision, type Channel } from './alertPolicy';
import type { AlertKind } from './alertKind';

/**
 * The adapter that makes alertPolicy real.
 *
 * alertPolicy is pure — it takes settings and returns a decision. This is the
 * thin layer that reads those settings out of the database, so the policy stays
 * testable without one and the decision can be replayed exactly.
 *
 * WHY THIS EXISTS AT ALL
 * Quiet hours were already implemented, but only for PUSH notifications. Email,
 * SMS, WhatsApp and Telegram ignored them entirely — so the channel most likely
 * to wake someone at 3am was the one channel with no quiet hours, and the daily
 * cap the spec asks for did not exist on any channel.
 */

/**
 * The quiet-hours window to apply, or null for none.
 *
 * The spec says quiet hours are on by default — but a default is only safe when
 * we can actually place the user in time. Most accounts have no stored timezone
 * offset, and applying a 22:00-08:00 window against UTC would have silenced a US
 * user's alerts from 6pm onward. That is the alert-silence failure this codebase
 * has already been bitten by three times.
 *
 * So: an explicitly configured window is always honoured. The DEFAULT window is
 * applied only when the user's timezone is actually known.
 */
export type QuietHoursSource =
  /** The user set a window. */
  | 'user'
  /** The user explicitly turned quiet hours off. */
  | 'off'
  /** Never asked, but we know their timezone, so the default applies. */
  | 'default'
  /** Never asked and we cannot place them in time, so none applies. */
  | 'unknown-timezone';

/**
 * The window in force AND why — so a settings screen can show the truth.
 *
 * This exists because the card could not previously tell the difference
 * between "no quiet hours" and "the default quiet hours". Capturing the
 * timezone on page load is what switches the default on, so a card that
 * rendered only the STORED value said "Not set — alerts can arrive at any
 * hour" about an account that was, from that moment, silent overnight.
 */
export function effectiveQuietHours(userId: number): {
  window: { startHour: number; endHour: number } | null;
  source: QuietHoursSource;
} {
  const start = queries.getUserSetting(userId, 'quiet_hours_start');
  const end = queries.getUserSetting(userId, 'quiet_hours_end');
  const decided = start !== undefined || end !== undefined;
  const w = quietHoursFor(userId);

  if (decided) return { window: w, source: w ? 'user' : 'off' };
  return w
    ? { window: w, source: 'default' }
    : { window: null, source: 'unknown-timezone' };
}

function quietHoursFor(userId: number): { startHour: number; endHour: number } | null {
  const start = queries.getUserSetting(userId, 'quiet_hours_start');
  const end = queries.getUserSetting(userId, 'quiet_hours_end');
  const hour = (s: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(s);
    return m ? parseInt(m[1], 10) : null;
  };

  // ABSENT and EMPTY are different answers, and conflating them broke Clear.
  //
  // Absent means the user has never been asked. Empty means they opened the
  // settings card and turned quiet hours OFF. Treating empty as "not
  // configured" sent it back through the default below, so pressing Clear
  // silently left the 22:00-08:00 window in force — alerts held overnight by a
  // setting the user had just switched off, with the UI showing "Not set".
  //
  // This only became reachable when the settings card started capturing the
  // timezone: before that no web account had one, so the default never applied
  // to anybody.
  const decided = start !== undefined || end !== undefined;
  if (decided) {
    if (!start || !end) return null;          // explicitly off
    const s = hour(start);
    const e = hour(end);
    if (s != null && e != null) return { startHour: s, endHour: e };
    return null;                               // malformed: off, never defaulted
  }

  // Never asked. Only default it on if we know what time it is for them —
  // applying a 22:00-08:00 window against UTC would silence a US user from 6pm.
  return knowsTimezone(userId) ? DEFAULT_QUIET_HOURS : null;
}

/** Do we actually know this user's offset from UTC? */
export function knowsTimezone(userId: number): boolean {
  const raw = queries.getUserSetting(userId, 'tz_offset_min');
  return raw != null && raw !== '' && Number.isFinite(parseInt(raw, 10));
}

/**
 * The user's local hour, from the offset the browser already reports.
 *
 * Quiet hours have to be in THEIR timezone — a 3am alert is only defensible if
 * it is 3am where it is read, and the server's clock says nothing about that.
 */
function localHourFor(userId: number, now = new Date()): number {
  const offset = parseInt(queries.getUserSetting(userId, 'tz_offset_min') ?? '0', 10) || 0;
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  return Math.floor(((((utcMin + offset) % 1440) + 1440) % 1440) / 60);
}

function daysToDeparture(departDate: string | null | undefined): number | null {
  if (!departDate) return null;
  const t = Date.parse(`${departDate.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(t) ? null : Math.round((t - Date.now()) / 86_400_000);
}

const CHANNELS: Channel[] = ['email', 'sms', 'whatsapp', 'telegram', 'push'];
const asChannels = (csv: string | null | undefined): Channel[] =>
  (csv ?? '').split(',').map(s => s.trim().toLowerCase())
    .filter((c): c is Channel => (CHANNELS as string[]).includes(c));

/**
 * Should this alert go out right now, and on what?
 *
 * Called BEFORE the alert row is reserved, so a deferred alert never becomes a
 * phantom row in alerts_sent and never moves the threshold floor.
 */
export function gateAlert(opts: {
  kind: AlertKind;
  search: SearchRow;
  ownerUserId: number;
  now?: Date;
}): AlertDecision {
  const uid = opts.ownerUserId;
  const user = queries.getUserById(uid);
  const limits = limitsForUser(user);

  // What the account has configured, intersected with what the tier allows.
  const configured = asChannels(
    queries.getUserSetting(uid, 'alert_channels') ?? queries.getSetting('alert_channels') ?? 'email',
  );
  const allowed = configured.filter(c => c === 'push' || (limits.channels as string[]).includes(c));

  // Per-watch override, stored on the Watch itself.
  const watchChannels = asChannels((opts.search as { alert_channels?: string | null }).alert_channels);

  // New users default to digest and escalate themselves rather than being
  // started on instant and lost to fatigue. Absent setting = instant, so no
  // existing user's behaviour changes.
  const instantEnabled = queries.getUserSetting(uid, 'instant_alerts') !== 'false';

  return decideAlert({
    kind: opts.kind,
    availableChannels: allowed.length ? allowed : ['email'],
    watchChannels: watchChannels.length ? watchChannels : null,
    localHour: localHourFor(uid, opts.now),
    quietHours: quietHoursFor(uid),
    // Explicit opt-in, taken at setup, to be woken for glitch fares only.
    wakeMeForMistakeFares: queries.getUserSetting(uid, 'wake_for_mistake_fares') === 'true',
    sentToday: safeSentToday(uid),
    dailyCap: numSetting(uid, 'daily_alert_cap'),
    instantEnabled,
    daysToDeparture: daysToDeparture(opts.search.depart_date),
  });
}

function safeSentToday(uid: number): number {
  try { return queries.alertsSentToday(uid); }
  catch { return 0; }  // never let a counting failure suppress an alert
}

function numSetting(uid: number, key: string): number | undefined {
  const raw = queries.getUserSetting(uid, key);
  const n = raw == null ? NaN : parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
