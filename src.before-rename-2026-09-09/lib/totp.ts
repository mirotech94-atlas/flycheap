import 'server-only';
import crypto from 'node:crypto';

/**
 * RFC 6238 TOTP — authenticator-app login (Google Authenticator, Authy, 1Password, …).
 *
 * Hand-rolled on node:crypto (no external dependency). Standard parameters that every
 * authenticator app assumes by default: HMAC-SHA1, 6 digits, 30-second period.
 * Secrets are stored/displayed as RFC 4648 base32 (the format authenticator apps expect).
 */

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_PERIOD = 30;
export const TOTP_DIGITS = 6;
const TOTP_ALGORITHM = 'sha1';

/** Generate a fresh base32 secret (default 20 bytes / 160 bits, the RFC-recommended size). */
export function generateSecret(bytes = 20): string {
  return base32Encode(crypto.randomBytes(bytes));
}

/** Build the otpauth:// URI an authenticator app reads from a QR code. */
export function otpauthUri(secret: string, accountLabel: string, issuer = 'FlyCheap'): string {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Current TOTP code for a secret (mainly for tests / sanity checks). */
export function generate(secret: string, forTime: number = Date.now()): string {
  const counter = Math.floor(forTime / 1000 / TOTP_PERIOD);
  return hotp(base32Decode(secret), counter);
}

/**
 * Verify a user-entered code against the secret, allowing ±`window` periods of clock
 * drift (default ±1 = the current 30s step plus one on either side). Constant-ish: we
 * compare every candidate to avoid early-exit timing leaks across the small window.
 */
export function verify(secret: string, code: string, window = 1, forTime: number = Date.now()): boolean {
  const clean = (code || '').replace(/\D/g, '');
  if (clean.length !== TOTP_DIGITS) return false;
  let key: Buffer;
  try {
    key = base32Decode(secret);
  } catch {
    return false;
  }
  const counter = Math.floor(forTime / 1000 / TOTP_PERIOD);
  let ok = false;
  for (let w = -window; w <= window; w++) {
    if (timingSafeEqualStr(hotp(key, counter + w), clean)) ok = true;
  }
  return ok;
}

/** RFC 4226 HOTP — the per-counter building block of TOTP. */
function hotp(key: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  // 64-bit big-endian counter. Counters stay well within 2^53, so split hi/lo at 32 bits.
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac(TOTP_ALGORITHM, key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (bin % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, '0');
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str: string): Buffer {
  const clean = str.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
