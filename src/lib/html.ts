/**
 * Escape a value for HTML text AND quoted attribute context. Anything a
 * visitor typed (a name, an email, a phone number) must pass through this
 * before it is placed into hand-built HTML — the owner's notification email
 * and the approve page are both read by the one account that can do the most
 * damage if a script runs there.
 */
const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, c => HTML_ESCAPES[c]);
}
