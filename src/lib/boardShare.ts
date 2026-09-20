import 'server-only';
import crypto from 'node:crypto';
import { getDb } from './db';

/**
 * Boards — the read-only page a group's watches live on.
 *
 * "The family share link is listed as a retention feature. It is actually the
 *  growth loop, and it is the same mechanism that the B2B client board runs on.
 *  One implementation, two markets."
 *
 * Grandparents watching the summer trip, a wedding party of twelve, a university
 * cohort, an agency's client — the last two are the B2B product, and the
 * difference is branding and a custom domain, not a different feature.
 *
 * WHAT THIS REPLACES
 * A single global token in `settings`: one board for the entire install, shared
 * by every user, with no revocation, no expiry and no privacy controls.
 *
 * THE RULES THAT MATTER
 *  - Store the HASH, never the token. Travel plans for named individuals are
 *    personal data; a leaked database must not hand over working board URLs.
 *  - Check revocation on every request with NO caching of the decision. The
 *    whole value of revoke is that it is immediate.
 *  - Default to an expiry. Permanent is a deliberate choice, not a default.
 */

/** Boards expire by default; permanent is opt-in. */
export const DEFAULT_EXPIRY_DAYS = 180;

export type BoardShare = {
  id: number;
  group_id: number;
  label: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  view_count: number;
  last_viewed_at: string | null;
  show_prices: number;
  show_targets: number;
  created_at: string;
};

const db = () => getDb();

/**
 * Hash a board token.
 *
 * Plain SHA-256, deliberately: the token is 32 bytes of CSPRNG output, so there
 * is no dictionary to attack and no password-stretching to do. What matters is
 * that the stored value is not usable as a URL.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export type CreateBoardInput = {
  groupId: number;
  createdBy?: number | null;
  label?: string | null;
  /** Null = permanent, and the caller had to ask for it. */
  expiryDays?: number | null;
  showPrices?: boolean;
  showTargets?: boolean;
};

/**
 * Mint a board. Returns the token ONCE — it is never recoverable afterwards,
 * because only its hash is stored.
 */
export function createBoard(input: CreateBoardInput): { token: string; id: number } {
  const token = crypto.randomBytes(32).toString('base64url');
  const days = input.expiryDays === null ? null : (input.expiryDays ?? DEFAULT_EXPIRY_DAYS);

  const res = db().prepare(
    `INSERT INTO board_share
       (group_id, token_hash, created_by, label, expires_at, show_prices, show_targets)
     VALUES (@group_id, @token_hash, @created_by, @label,
             ${days == null ? 'NULL' : `datetime('now', '+${Math.floor(days)} days')`},
             @show_prices, @show_targets)`,
  ).run({
    group_id: input.groupId,
    token_hash: hashToken(token),
    created_by: input.createdBy ?? null,
    label: input.label ?? null,
    // Prices on, targets OFF by default: "a family organiser may not want
    // everyone to see what they are willing to pay."
    show_prices: input.showPrices === false ? 0 : 1,
    show_targets: input.showTargets === true ? 1 : 0,
  });

  return { token, id: Number(res.lastInsertRowid) };
}

/**
 * Resolve a token to a live board, or null.
 *
 * Revocation and expiry are checked in the query itself, on every call, with
 * nothing memoised. A cached authorisation decision would mean a revoked board
 * kept working for the length of the cache, and the entire point of revoke is
 * that it is immediate.
 */
export function resolveBoard(token: string): BoardShare | null {
  if (!token) return null;
  const row = db().prepare(
    `SELECT * FROM board_share
      WHERE token_hash = ?
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > datetime('now'))`,
  ).get(hashToken(token)) as BoardShare | undefined;
  return row ?? null;
}

/** Record a view. Best-effort: never let analytics break someone's board. */
export function recordView(shareId: number, meta: { ip?: string | null; userAgent?: string | null } = {}): void {
  try {
    const tx = db().transaction(() => {
      db().prepare(
        `INSERT INTO board_views (share_id, ip, user_agent) VALUES (?, ?, ?)`,
      ).run(shareId, meta.ip ?? null, meta.userAgent ?? null);
      db().prepare(
        `UPDATE board_share
            SET view_count = view_count + 1, last_viewed_at = datetime('now')
          WHERE id = ?`,
      ).run(shareId);
    });
    tx();
  } catch (e) {
    console.error('[boardShare] recordView failed', (e as Error).message);
  }
}

/** Revoke. Immediate, and irreversible by design. */
export function revokeBoard(id: number): void {
  db().prepare(`UPDATE board_share SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL`).run(id);
}

/**
 * Rotate: issue a new token and kill the old one IN ONE ACTION.
 *
 * Two steps would leave a window where both work, or where neither does. The
 * site already promises rotation as a single action, so it is a transaction.
 */
export function rotateBoard(id: number, createdBy?: number | null): { token: string; id: number } | null {
  const existing = db().prepare(`SELECT * FROM board_share WHERE id = ?`).get(id) as BoardShare | undefined;
  if (!existing) return null;

  let out: { token: string; id: number } | null = null;
  const tx = db().transaction(() => {
    db().prepare(`UPDATE board_share SET revoked_at = datetime('now') WHERE id = ?`).run(id);
    out = createBoard({
      groupId: existing.group_id,
      createdBy: createdBy ?? existing.id,
      label: existing.label,
      // Carry the old board's settings forward — rotation is a security action,
      // not a chance to silently change what the board exposes.
      expiryDays: existing.expires_at ? DEFAULT_EXPIRY_DAYS : null,
      showPrices: existing.show_prices === 1,
      showTargets: existing.show_targets === 1,
    });
  });
  tx();
  return out;
}

/** Boards for a group, for the owner's settings screen. */
export function boardsForGroup(groupId: number): BoardShare[] {
  return db().prepare(
    `SELECT * FROM board_share WHERE group_id = ? ORDER BY created_at DESC`,
  ).all(groupId) as BoardShare[];
}

/**
 * The viral coefficient, measured rather than asserted.
 *
 * "Board views per share, and new accounts per board view, is your viral
 *  coefficient. If it is above a few percent, sharing is worth investing in
 *  heavily; if it is near zero, the line needs work, not the feature."
 *
 * Returns nulls rather than zeros when there is nothing to divide by — a board
 * nobody has opened is not a board with a 0% conversion rate.
 */
export function boardLoopMetrics(): {
  shares: number;
  views: number;
  viewsPerShare: number | null;
  conversions: number;
  conversionRatePct: number | null;
} {
  const shares = (db().prepare(`SELECT COUNT(*) AS n FROM board_share WHERE revoked_at IS NULL`)
    .get() as { n: number }).n;
  const views = (db().prepare(`SELECT COUNT(*) AS n FROM board_views`).get() as { n: number }).n;
  const conversions = (db().prepare(
    `SELECT COUNT(*) AS n FROM board_views WHERE converted_user_id IS NOT NULL`,
  ).get() as { n: number }).n;

  return {
    shares,
    views,
    viewsPerShare: shares > 0 ? views / shares : null,
    conversions,
    conversionRatePct: views > 0 ? (conversions / views) * 100 : null,
  };
}

/** Attribute a signup to the board that produced it. */
export function attributeConversion(shareId: number, userId: number): void {
  try {
    db().prepare(
      `UPDATE board_views SET converted_user_id = ?
        WHERE id = (SELECT id FROM board_views WHERE share_id = ? AND converted_user_id IS NULL
                    ORDER BY viewed_at DESC LIMIT 1)`,
    ).run(userId, shareId);
  } catch (e) {
    console.error('[boardShare] attributeConversion failed', (e as Error).message);
  }
}
