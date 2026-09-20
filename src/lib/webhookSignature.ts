import crypto from 'node:crypto';

/**
 * Svix webhook signature verification — the scheme Resend uses.
 *
 * Implemented here rather than pulling in the `svix` package: it is thirty lines
 * of HMAC and this codebase already has a habit of shipping small, auditable
 * crypto rather than a dependency whose update cadence becomes our problem.
 *
 * Why it has to be right: a webhook endpoint is a URL anyone on the internet can
 * POST to. Without verification, anyone could mark alerts as delivered and
 * opened, and the funnel numbers this exists to produce would be fiction that
 * looks exactly like data.
 *
 * Pure and dependency-free so every branch is testable without a live ESP.
 */

export type VerifyInput = {
  /** Raw request body, byte-for-byte as received. Re-serialising JSON breaks it. */
  payload: string;
  svixId: string | null;
  svixTimestamp: string | null;
  svixSignature: string | null;
  /** The endpoint secret, `whsec_<base64>`. */
  secret: string;
  /** Reject timestamps further than this from now, in seconds. */
  toleranceSec?: number;
  nowMs?: number;
};

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export const DEFAULT_TOLERANCE_SEC = 5 * 60;

export function verifySvixSignature(input: VerifyInput): VerifyResult {
  const { payload, svixId, svixTimestamp, svixSignature, secret } = input;
  const tolerance = input.toleranceSec ?? DEFAULT_TOLERANCE_SEC;
  const now = input.nowMs ?? Date.now();

  if (!secret) return { ok: false, reason: 'no signing secret configured' };
  if (!svixId || !svixTimestamp || !svixSignature) {
    return { ok: false, reason: 'missing svix headers' };
  }

  // Replay window. A captured-and-replayed delivery event is harmless on its
  // own, but the window costs nothing and closes the class.
  const ts = Number(svixTimestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'unparseable timestamp' };
  const skewSec = Math.abs(now / 1000 - ts);
  if (skewSec > tolerance) return { ok: false, reason: `timestamp outside ${tolerance}s tolerance` };

  // `whsec_` prefix is conventional; the secret itself is the base64 after it.
  const rawSecret = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  let key: Buffer;
  try {
    key = Buffer.from(rawSecret, 'base64');
  } catch {
    return { ok: false, reason: 'signing secret is not valid base64' };
  }
  if (key.length === 0) return { ok: false, reason: 'signing secret decoded empty' };

  const signed = `${svixId}.${svixTimestamp}.${payload}`;
  const expected = crypto.createHmac('sha256', key).update(signed).digest('base64');

  // The header carries a space-delimited list of versioned signatures; during a
  // secret rotation more than one is present and ANY may match.
  for (const part of svixSignature.split(' ')) {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) continue;
    if (timingSafeEqualStr(sig, expected)) return { ok: true };
  }
  return { ok: false, reason: 'no matching v1 signature' };
}

/** Constant-time compare that does not leak length through an early return. */
function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    // Still burn a comparison so the failure takes a similar amount of time.
    crypto.timingSafeEqual(bb, bb);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

/** Sign a payload the way Svix would — used by the tests, not by the app. */
export function signSvixPayload(opts: {
  payload: string; svixId: string; svixTimestamp: string; secret: string;
}): string {
  const raw = opts.secret.startsWith('whsec_') ? opts.secret.slice('whsec_'.length) : opts.secret;
  const key = Buffer.from(raw, 'base64');
  const sig = crypto
    .createHmac('sha256', key)
    .update(`${opts.svixId}.${opts.svixTimestamp}.${opts.payload}`)
    .digest('base64');
  return `v1,${sig}`;
}
