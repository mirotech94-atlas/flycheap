import 'server-only';
import crypto from 'node:crypto';
import { Resend } from 'resend';
import { getDb, queries } from './db';
import { supportFrom } from './senders';
import { APP_URL } from './hosts';
import { inviteEmail, waitlistPositionEmail } from './emailTemplates';

const APP = process.env.APP_URL || APP_URL;
/** Each friend who joins through your link moves you up this many spots. */
export const REFERRAL_BOOST = 5;

export type EarlyAccessRow = {
  id: number; email: string; name: string | null; phone: string | null; home_airport: string | null; ref_code: string;
  referred_by: string | null; position: number; ip: string | null; created_at: string;
  approve_token: string | null; approved_at: string | null; declined_at: string | null;
};
/** Where new access requests are announced (Approve / Decline links). */
export const NOTIFY_TO: string[] = (process.env.EARLY_ACCESS_NOTIFY || 'miro@flycheap.live')
  .split(',').map(s => s.trim()).filter(Boolean);

let ensured = false;
function ensure() {
  if (ensured) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS early_access (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      home_airport TEXT,
      ref_code TEXT NOT NULL UNIQUE,
      referred_by TEXT,
      position INTEGER NOT NULL,
      ip TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_early_access_ref ON early_access(referred_by);
  `);
  const cols = (getDb().prepare('PRAGMA table_info(early_access)').all() as Array<{ name: string }>).map(c => c.name);
  if (!cols.includes('approve_token')) getDb().exec('ALTER TABLE early_access ADD COLUMN approve_token TEXT');
  if (!cols.includes('approved_at')) getDb().exec('ALTER TABLE early_access ADD COLUMN approved_at TEXT');
  if (!cols.includes('declined_at')) getDb().exec('ALTER TABLE early_access ADD COLUMN declined_at TEXT');
  if (!cols.includes('name')) getDb().exec('ALTER TABLE early_access ADD COLUMN name TEXT');
  if (!cols.includes('phone')) getDb().exec('ALTER TABLE early_access ADD COLUMN phone TEXT');
  ensured = true;
}

function newRefCode(): string {
  return crypto.randomBytes(4).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toLowerCase() || crypto.randomBytes(3).toString('hex');
}

export function earlyAccessCount(): number {
  ensure();
  return (getDb().prepare('SELECT COUNT(*) AS n FROM early_access').get() as { n: number }).n;
}

export function referralsFor(refCode: string): number {
  ensure();
  return (getDb().prepare('SELECT COUNT(*) AS n FROM early_access WHERE referred_by = ?').get(refCode) as { n: number }).n;
}

export type JoinResult = {
  id: number; existing: boolean; position: number; effectivePosition: number;
  refCode: string; referrals: number; shareUrl: string; total: number;
};

export function joinEarlyAccess(input: { email: string; name?: string | null; phone?: string | null; homeAirport?: string | null; ref?: string | null; ip?: string | null }): JoinResult {
  ensure();
  const db = getDb();
  const email = input.email.trim().toLowerCase();
  const home = (input.homeAirport || '').trim().toUpperCase().slice(0, 3) || null;
  const name = (input.name || '').trim().slice(0, 120) || null;
  const phone = (input.phone || '').trim().slice(0, 32) || null;
  let ref = (input.ref || '').trim().toLowerCase().slice(0, 12) || null;

  let row = db.prepare('SELECT * FROM early_access WHERE email = ?').get(email) as EarlyAccessRow | undefined;
  let existing = true;
  if (!row) {
    existing = false;
    // Only honour a referral code that actually exists (and isn't self-referral — impossible pre-insert).
    if (ref && !db.prepare('SELECT 1 FROM early_access WHERE ref_code = ?').get(ref)) ref = null;
    const position = earlyAccessCount() + 1;
    let code = newRefCode();
    while (db.prepare('SELECT 1 FROM early_access WHERE ref_code = ?').get(code)) code = newRefCode();
    db.prepare(`INSERT INTO early_access (email, name, phone, home_airport, ref_code, referred_by, position, ip, approve_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(email, name, phone, home, code, ref, position, input.ip ?? null, crypto.randomBytes(18).toString('base64url'));
    row = db.prepare('SELECT * FROM early_access WHERE email = ?').get(email) as EarlyAccessRow;
  } else {
    if (home && !row.home_airport) db.prepare('UPDATE early_access SET home_airport = ? WHERE id = ?').run(home, row.id);
    if (name && !row.name) db.prepare('UPDATE early_access SET name = ? WHERE id = ?').run(name, row.id);
    if (phone && !row.phone) db.prepare('UPDATE early_access SET phone = ? WHERE id = ?').run(phone, row.id);
  }
  const referrals = referralsFor(row.ref_code);
  return {
    id: row.id,
    existing,
    position: row.position,
    effectivePosition: Math.max(1, row.position - referrals * REFERRAL_BOOST),
    refCode: row.ref_code,
    referrals,
    shareUrl: `${APP}/early-access?ref=${row.ref_code}`,
    total: earlyAccessCount(),
  };
}

export function listEarlyAccess(): EarlyAccessRow[] {
  ensure();
  return getDb().prepare('SELECT * FROM early_access ORDER BY position ASC').all() as EarlyAccessRow[];
}

export async function sendEarlyAccessEmail(to: string, r: JoinResult): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const built = waitlistPositionEmail({
    position: r.effectivePosition,
    shareUrl: r.shareUrl,
    referralBoost: REFERRAL_BOOST,
    demoUrl: `${APP}/demo`,
    appUrl: APP,
  });
  try {
    await new Resend(apiKey).emails.send({
      from: supportFrom('FlyCheap'), to,
      subject: built.subject,
      html: built.html,
    });
  } catch (e) {
    console.error('[early-access] email failed:', (e as Error).message);
  }
}

export function getEarlyAccessById(id: number): EarlyAccessRow | undefined {
  ensure();
  return getDb().prepare('SELECT * FROM early_access WHERE id = ?').get(id) as EarlyAccessRow | undefined;
}

/** Approve/decline via the signed link in the admin email. Returns the row or null when the token is wrong. */
export function decideEarlyAccess(id: number, token: string, action: 'approve' | 'decline'): EarlyAccessRow | null {
  const row = getEarlyAccessById(id);
  if (!row || !row.approve_token || row.approve_token !== token) return null;
  const col = action === 'approve' ? 'approved_at' : 'declined_at';
  const other = action === 'approve' ? 'declined_at' : 'approved_at';
  getDb().prepare(`UPDATE early_access SET ${col} = COALESCE(${col}, datetime('now')), ${other} = NULL WHERE id = ?`).run(id);
  return getEarlyAccessById(id) ?? null;
}

function resend(): Resend | null {
  const k = process.env.RESEND_API_KEY;
  return k ? new Resend(k) : null;
}

/** Tells the owner a new request came in, with one-click Approve / Decline links. */
export async function sendAccessRequestNotification(row: EarlyAccessRow, referrals: number): Promise<void> {
  const r = resend(); if (!r) return;
  const base = `${APP}/api/early-access/approve?id=${row.id}&t=${encodeURIComponent(row.approve_token ?? '')}`;
  const total = earlyAccessCount();
  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:560px;margin:auto;padding:28px;color:#0f172a">
    <div style="display:inline-block;background:linear-gradient(135deg,#0a2e57,#154a86);color:white;font-weight:700;font-size:11px;letter-spacing:.14em;text-transform:uppercase;padding:6px 12px;border-radius:999px;margin-bottom:14px">FlyCheap · Access request #${row.position}</div>
    <h1 style="font-size:24px;margin:0 0 14px;color:#0a2e57">${row.name ? row.name + ' · ' : ''}${row.email}</h1>
    <table style="font-size:14px;color:#334155;border-collapse:collapse">
      <tr><td style="padding:3px 14px 3px 0;color:#64748b">Name</td><td>${row.name ?? '—'}</td></tr>
      <tr><td style="padding:3px 14px 3px 0;color:#64748b">Phone</td><td>${row.phone ?? '—'}</td></tr>
      <tr><td style="padding:3px 14px 3px 0;color:#64748b">Position</td><td>#${row.position} of ${total}</td></tr>
      <tr><td style="padding:3px 14px 3px 0;color:#64748b">Home airport</td><td>${row.home_airport ?? '—'}</td></tr>
      <tr><td style="padding:3px 14px 3px 0;color:#64748b">Referred by</td><td>${row.referred_by ?? '—'}</td></tr>
      <tr><td style="padding:3px 14px 3px 0;color:#64748b">Referrals</td><td>${referrals}</td></tr>
      <tr><td style="padding:3px 14px 3px 0;color:#64748b">IP</td><td>${row.ip ?? '—'}</td></tr>
      <tr><td style="padding:3px 14px 3px 0;color:#64748b">Requested</td><td>${row.created_at} UTC</td></tr>
    </table>
    <div style="margin-top:24px;display:flex;gap:10px">
      <a href="${base}&action=approve" style="display:inline-block;background:#0a2e57;color:white;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px">Approve &amp; send invite →</a>
      <a href="${base}&action=decline" style="display:inline-block;background:#f1f5f9;color:#334155;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;margin-left:10px">Decline</a>
    </div>
    <p style="margin-top:22px;color:#94a3b8;font-size:12px">Approving emails ${row.email} a sign-up link. Full list: <a href="${APP}/api/early-access?format=csv" style="color:#94a3b8">CSV export</a> (admin login required).</p>
  </div>`;
  try {
    const sent = await r.emails.send({ from: supportFrom('FlyCheap Early Access'), to: NOTIFY_TO, replyTo: row.email, subject: `Access request #${row.position}: ${row.email}`, html });
    if (sent.error) console.error('[early-access] notify rejected:', JSON.stringify(sent.error));
    else console.log('[early-access] notify sent id=' + sent.data?.id + ' to=' + NOTIFY_TO.join(',') + ' for #' + row.position + ' ' + row.email);
  } catch (e) { console.error('[early-access] notify failed:', (e as Error).message); }
}

/** Provision an approved requester's account (with the 3-month trial + their
 *  name/phone), then email them a one-click magic link into the client app. */
export async function approveAndProvision(row: EarlyAccessRow): Promise<void> {
  const user = queries.upsertUserByEmail(row.email, row.name ?? undefined); // creates with founding_free trial
  queries.setProfileIfEmpty(user.id, row.name ?? null, row.phone ?? null);
  await sendInviteEmail(row);
}

/** Sent to the requester when the owner approves: a single button that logs them
 *  straight into my.flycheap.live (their account is already set up). */
export async function sendInviteEmail(row: EarlyAccessRow): Promise<void> {
  const r = resend(); if (!r) return;
  // A 48-hour one-click login token. If it lapses, their account still exists and
  // they can sign in normally at ${APP}/login.
  const token = crypto.randomBytes(32).toString('base64url');
  try { queries.insertMagicLink(token, row.email, 60 * 48); } catch (e) { console.error('[early-access] magic-link insert failed:', (e as Error).message); return; }
  const loginUrl = `${APP}/api/auth/verify?token=${token}`;
  const built = inviteEmail({
    firstName: row.name ? row.name.split(' ')[0] : undefined,
    loginUrl,
    appUrl: APP,
  });
  try {
    await r.emails.send({ from: supportFrom('FlyCheap'), to: row.email, subject: built.subject, html: built.html });
  } catch (e) { console.error('[early-access] invite failed:', (e as Error).message); }
}

/* ───────────── Live feed pool (real best fares, varied routes + airlines) ───────────── */
const AIRLINES: Record<string, string> = {
  AA: 'American', DL: 'Delta', UA: 'United', B6: 'JetBlue', AS: 'Alaska', F9: 'Frontier', NK: 'Spirit', WS: 'WestJet', AC: 'Air Canada',
  BA: 'British Airways', VS: 'Virgin Atlantic', EI: 'Aer Lingus', AF: 'Air France', KL: 'KLM', LH: 'Lufthansa', LX: 'SWISS', OS: 'Austrian',
  IB: 'Iberia', TP: 'TAP Portugal', AZ: 'ITA Airways', FI: 'Icelandair', N0: 'Norse Atlantic', Z0: 'Norse Atlantic', BF: 'French Bee', S4: 'Azores Airlines',
  JU: 'Air Serbia', H4: 'HiSky', LO: 'LOT', SK: 'SAS', AY: 'Finnair', TK: 'Turkish Airlines', MS: 'EgyptAir', QR: 'Qatar Airways', EK: 'Emirates',
  EY: 'Etihad', GF: 'Gulf Air', SV: 'Saudia', AT: 'Royal Air Maroc', AI: 'Air India', CX: 'Cathay Pacific', NH: 'ANA', JL: 'Japan Airlines',
  KE: 'Korean Air', OZ: 'Asiana', CI: 'China Airlines', CA: 'Air China', MU: 'China Eastern', MF: 'Xiamen Air', '3U': 'Sichuan Airlines',
  PR: 'Philippine Airlines', TG: 'Thai Airways', SQ: 'Singapore Airlines', YP: 'Air Premia', VB: 'Viva Aerobus', AM: 'Aeroméxico', Y4: 'Volaris',
  G3: 'Gol', AV: 'Avianca', LA: 'LATAM', CM: 'Copa', QF: 'Qantas', VA: 'Virgin Australia', NZ: 'Air New Zealand', ET: 'Ethiopian', KQ: 'Kenya Airways',
};

export type FeedItem = {
  route: string; origin: string; dest: string; price: number; delta: number;
  airline: string; code: string; out: string; ret: string; trip: number; provider: string;
};

/** Up to `limit` real best fares: cheapest per (route, airline), across every origin/destination we track. Shuffled. */
export function getFeedPool(limit = 40): FeedItem[] {
  try {
    const rows = getDb().prepare(`
      SELECT b.origin, b.destination, b.outbound_date, b.return_date, b.trip_length_days, b.per_adult_usd, b.provider,
             substr(b.outbound_flight_no, 1, 2) AS code,
             (SELECT AVG(per_adult_usd) FROM best_deals_cache m WHERE m.origin = b.origin AND m.destination = b.destination) AS avg
      FROM best_deals_cache b
      WHERE b.outbound_flight_no IS NOT NULL AND length(b.outbound_flight_no) >= 3
      ORDER BY b.per_adult_usd ASC
    `).all() as Array<{ origin: string; destination: string; outbound_date: string; return_date: string; trip_length_days: number; per_adult_usd: number; provider: string; code: string; avg: number }>;
    const seen = new Set<string>();
    const pool: FeedItem[] = [];
    for (const r of rows) {
      const code = (r.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const airline = AIRLINES[code] ?? code;
      const key = `${r.origin}${r.destination}${airline}`; // dedupe by airline name (N0/Z0 are both Norse)
      if (!code || seen.has(key)) continue;
      seen.add(key);
      pool.push({
        route: `${r.origin} → ${r.destination}`, origin: r.origin, dest: r.destination,
        price: Math.round(r.per_adult_usd), delta: Math.round(r.per_adult_usd - r.avg),
        airline, code, out: r.outbound_date, ret: r.return_date, trip: r.trip_length_days, provider: r.provider,
      });
      if (pool.length >= limit) break;
    }
    // Fisher–Yates so every page load leads with a different mix of routes.
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return pool;
  } catch { return []; }
}
