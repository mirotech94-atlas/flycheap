import 'server-only';
import { queries } from './db';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export type PushMessage = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Custom bundled sound filename (e.g. 'alert.wav'); falls back to the system default. */
  sound?: string;
};

function isExpoToken(t: string): boolean {
  return /^Expo(nent)?PushToken\[/.test(t);
}

/** Send a push to a set of Expo tokens. Best-effort; never throws. */
export async function sendExpoPush(tokens: string[], msg: PushMessage): Promise<{ sent: number; errors: number }> {
  const valid = tokens.filter(isExpoToken);
  if (valid.length === 0) return { sent: 0, errors: 0 };
  const messages = valid.map((to) => ({
    to,
    sound: msg.sound ?? 'default',
    title: msg.title,
    body: msg.body,
    data: msg.data ?? {},
  }));
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    if (!res.ok) return { sent: 0, errors: valid.length };
    // Prune dead tokens: Expo tickets for unregistered devices carry
    // details.error === 'DeviceNotRegistered'. Drop them so we stop pushing to them.
    try {
      const json = (await res.json()) as { data?: Array<{ status?: string; details?: { error?: string } }> };
      const tickets = Array.isArray(json?.data) ? json.data : [];
      tickets.forEach((t, i) => {
        if (t?.status === 'error' && t?.details?.error === 'DeviceNotRegistered' && valid[i]) {
          queries.pruneDeadPushDevice(valid[i]);
        }
      });
    } catch { /* response parsing is best-effort */ }
    return { sent: valid.length, errors: 0 };
  } catch {
    return { sent: 0, errors: valid.length };
  }
}

/** Send a push to all of a user's registered devices. */
export async function sendExpoPushToUser(userId: number, msg: PushMessage): Promise<{ sent: number; errors: number }> {
  const devices = queries.listPushDevicesForUser(userId);
  if (devices.length === 0) return { sent: 0, errors: 0 };
  return sendExpoPush(devices.map((d) => d.token), msg);
}

/**
 * Quiet-hours check for a user (local-naive HH:MM window stored in user_settings:
 * quiet_hours_start / quiet_hours_end, e.g. "22:00" / "08:00"). Returns true if
 * push should be suppressed right now. Absent/invalid settings → never quiet.
 */
export function inQuietHours(userId: number, now = new Date()): boolean {
  const start = queries.getUserSetting(userId, 'quiet_hours_start');
  const end = queries.getUserSetting(userId, 'quiet_hours_end');
  if (!start || !end) return false;
  const toMin = (s: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(s);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  };
  const s = toMin(start);
  const e = toMin(end);
  if (s == null || e == null || s === e) return false;
  // Interpret quiet hours in the user's LOCAL time via their stored UTC offset
  // (minutes east of UTC, e.g. EDT = -240). Falls back to UTC when unknown.
  const offset = parseInt(queries.getUserSetting(userId, 'tz_offset_min') ?? '0', 10) || 0;
  const utc = now.getUTCHours() * 60 + now.getUTCMinutes();
  const cur = (((utc + offset) % 1440) + 1440) % 1440;
  // Window may wrap past midnight (e.g. 22:00 → 08:00).
  return s < e ? cur >= s && cur < e : cur >= s || cur < e;
}
