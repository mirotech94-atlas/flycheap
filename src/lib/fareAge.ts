/**
 * The age of a price, in words.
 *
 * Pure and client-safe on purpose: every price in the product carries a
 * verified-at timestamp, VISIBLY, and that includes surfaces that render in the
 * browser (the Book panel, the share boards, the concierge's answers). "Verified
 * 3 minutes ago" is reassuring; a bare number that turns out to be forty minutes
 * old is a betrayal, and this string is the entire difference.
 */

/**
 * How old a verified price is, in words. "Verified 3 minutes ago" is
 * reassuring; a bare number that turns out to be forty minutes old is a
 * betrayal, and the difference is only ever this string.
 */
export function verifiedAgeLabel(verifiedAt: string | null | undefined, nowMs = Date.now()): string | null {
  if (!verifiedAt) return null;
  const t = Date.parse(verifiedAt.includes('T') ? verifiedAt : verifiedAt.replace(' ', 'T') + 'Z');
  if (Number.isNaN(t)) return null;
  const mins = Math.floor((nowMs - t) / 60000);
  if (mins < 0) return 'Verified just now';
  if (mins < 1) return 'Verified just now';
  if (mins === 1) return 'Verified 1 minute ago';
  if (mins < 60) return `Verified ${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  if (hours === 1) return 'Verified 1 hour ago';
  if (hours < 24) return `Verified ${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Verified 1 day ago' : `Verified ${days} days ago`;
}
