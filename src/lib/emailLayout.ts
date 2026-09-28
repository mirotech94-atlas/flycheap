import 'server-only';

/**
 * FlyCheap transactional email design system.
 *
 * One shell for every email we send; the per-type builders in
 * emailTemplates.ts vary only the kind line, the headline and the body, so
 * every message is unmistakably the same product as the site.
 *
 * Design: the site's editorial data sheet, on paper. The same tokens as
 * src/app/editorial.css (light values, as literals — email clients cannot
 * read CSS variables), the same three faces, the same rules: rules and
 * whitespace do the separating, no rounded corners, no shadows, no
 * gradients. Amber is reserved for a fare and for the featured pricing
 * action, and it is never text on a light surface — a fare set as text uses
 * FARE_TEXT, the amber-derived ink the site's .ed-fare-text resolves to.
 *
 * Email-safe: inline styles, tables for layout, no external CSS or JS. The
 * three web faces are offered through one <link> in <head> for the clients
 * that honour it (Apple Mail, iOS Mail, Outlook for Mac); everything else
 * falls to the stack's system face, which is the same order the site uses.
 *
 * Two chrome pieces — emailMasthead() and emailFooter() — are exported so a
 * rich, data-heavy email (the fare alert) can wear the same masthead and
 * footer as the letter-style account emails without being forced through the
 * narrow letter panel.
 */

// ---- Palette: editorial.css :root, light -------------------------------------
const PAPER = '#FBFAF7';      // --bg          page canvas
const CARD = '#FFFFFF';       // --surface     the letter panel
const SURFACE_2 = '#F4F1EA';  // --surface-2   one recessed block per letter at most
const INK = '#14181B';        // --ink         text, the header rule, primary button fill
const INK_SOFT = '#3B3833';   // --ink-soft
const MUTED = '#78736A';      // --muted       secondary text (4.7:1 on white)
const MUTED_2 = '#5F5A52';    // labels under 12px, where --muted would sit at the AA edge
const LINE = '#E6E2DA';       // --rule
const LINE_CARD = '#EFECE5';  // --rule-soft   row separators
const RULE_STRONG = '#D9D4CA';// --rule-strong secondary button border
const ACCENT = '#1F615D';     // --accent      links, the one data colour (6.9:1 on white)
const AMBER = '#C98A3C';      // --amber       fare / featured-CTA FILL only, never text
const FARE_TEXT = '#8A6231';  // .ed-fare-text: color-mix(amber 65%, ink) — a fare AS text (6.0:1)
const GREEN = '#3E7D5A';      // --green       positive delta
const RED = '#B4453C';        // --red         errors, negative delta

// Kept under their old names so nothing that already reads EMAIL_TOKENS breaks:
// NAVY is now the primary button/ink, GOLD the amber fill, SLATE the muted text.
const NAVY = INK;
const NAVY_LIGHT = ACCENT;
const GOLD = AMBER;
const SLATE = MUTED;

const SERIF = "Newsreader, Georgia, 'Times New Roman', serif";
const SANS = "'Public Sans', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif";
const MONO = "'IBM Plex Mono', SFMono-Regular, Menlo, Consolas, monospace";
const FONT_LINK = 'https://fonts.googleapis.com/css2?family=Newsreader:wght@400;500&family=Public+Sans:wght@400;600&family=IBM+Plex+Mono:wght@400;500&display=swap';

export const EMAIL_TOKENS = {
  NAVY, NAVY_LIGHT, INK, GOLD, PAPER, CARD, SLATE, LINE, LINE_CARD, SERIF, SANS, MONO,
  SURFACE_2, INK_SOFT, MUTED, MUTED_2, RULE_STRONG, ACCENT, AMBER, FARE_TEXT, GREEN, RED,
};

export type EmailKind = 'welcome' | 'security' | 'support' | 'alert' | 'billing' | 'notice';

/**
 * The kind line under the masthead: what this letter is, in words. Colour is
 * not the carrier here — the label is set in the same mono caps as the site's
 * eyebrows, and status colour is spent only where something IS a status (a
 * fare delta, a failed payment).
 */
const KIND: Record<EmailKind, { accent: string; label: string }> = {
  welcome:  { accent: INK_SOFT, label: 'Founding member' },
  security: { accent: INK_SOFT, label: 'Account security' },
  support:  { accent: INK_SOFT, label: 'From the team' },
  alert:    { accent: FARE_TEXT, label: 'Fare alert' },
  billing:  { accent: INK_SOFT, label: 'Billing' },
  notice:   { accent: INK_SOFT, label: 'Account notice' },
};

export function kindAccent(kind: EmailKind): string { return KIND[kind].accent; }
export function kindLabel(kind: EmailKind): string { return KIND[kind].label; }

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Escape a URL for use inside a double-quoted href attribute (keeps & chains intact). */
const escAttr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

// ---- Reusable pieces --------------------------------------------------------

/** Mono-caps eyebrow — the site's label device. */
export function emailEyebrow(text: string, color: string = MUTED_2): string {
  return `<div style="font-family:${MONO};font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:${color}">${esc(text)}</div>`;
}

/** Primary action: ink fill, white label, square. Use once per email. */
export function emailButton(label: string, href: string): string {
  return `<a href="${escAttr(href)}" style="display:inline-block;background:${INK};color:#FFFFFF;text-decoration:none;font-family:${SANS};font-size:14px;font-weight:600;letter-spacing:.01em;padding:12px 20px">${esc(label)}</a>`;
}

/**
 * The featured pricing action — the one place amber may be a fill in an
 * email, and only when the thing being acted on is a fare. Ink label on
 * amber clears 7.6:1.
 */
export function emailFareButton(label: string, href: string): string {
  return `<a href="${escAttr(href)}" style="display:inline-block;background:${AMBER};color:${INK};text-decoration:none;font-family:${SANS};font-size:14px;font-weight:600;letter-spacing:.01em;padding:12px 20px">${esc(label)}</a>`;
}

/** Secondary action: surface fill, strong rule, soft ink. */
export function emailSecondaryButton(label: string, href: string): string {
  return `<a href="${escAttr(href)}" style="display:inline-block;background:${CARD};border:1px solid ${RULE_STRONG};color:${INK_SOFT};text-decoration:none;font-family:${SANS};font-size:13px;font-weight:600;padding:10px 16px">${esc(label)}</a>`;
}

/**
 * A large, letter-spaced code block (sign-in codes, confirmation codes).
 * Letter-spacing does the visual separation; we deliberately do NOT inject
 * spacer characters between digits — users paste these codes, and a stray
 * hair-space in the clipboard makes the form reject a correct code.
 */
export function emailCode(code: string): string {
  return `<div style="font-family:${MONO};font-size:34px;font-weight:500;letter-spacing:.42em;color:${INK};background:${SURFACE_2};border:1px solid ${LINE};text-align:left;padding:18px 8px 18px 20px;margin:6px 0 4px">${esc(code)}</div>`;
}

/**
 * A ruled fact list — label left, value right, a soft rule between rows.
 * Values are set in the mono face: they are things read character by
 * character (references, dates, amounts), which is the site's own convention.
 */
export function emailRows(rows: Array<[string, string]>): string {
  const body = rows.map(([k, v], i) => `
    <tr>
      <td style="font-family:${SANS};font-size:13px;color:${MUTED};padding:9px 0;${i ? `border-top:1px solid ${LINE_CARD};` : ''}vertical-align:top">${esc(k)}</td>
      <td style="font-family:${MONO};font-size:13px;color:${INK};font-weight:500;text-align:right;padding:9px 0;${i ? `border-top:1px solid ${LINE_CARD};` : ''}vertical-align:top">${v}</td>
    </tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid ${LINE};border-bottom:1px solid ${LINE}">${body}</table>`;
}

/** A quiet supporting note under the main content. */
export function emailNote(html: string): string {
  return `<p style="font-family:${SANS};font-size:13px;line-height:1.6;color:${MUTED};margin:16px 0 0">${html}</p>`;
}

// ---- Chrome (masthead + footer), shared by every email ---------------------

/**
 * Masthead: the serif wordmark, a mono eyebrow on the right, and the 1px ink
 * rule the site draws under every table header. No block of colour — the
 * rule is the brand mark's weight, as it is on the site.
 */
export function emailMasthead(eyebrow = 'Fare intelligence'): string {
  return `<div style="background:${CARD};padding:22px 32px 16px;border-bottom:1px solid ${INK}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-family:${SERIF};font-size:24px;font-weight:400;letter-spacing:-.02em;color:${INK}">FlyCheap</td>
      <td align="right" style="font-family:${MONO};font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:${MUTED_2}">${esc(eyebrow)}</td>
    </tr></table>
  </div>`;
}

/** Footer: brand links (+ optional unsubscribe) and an optional note above them. */
export function emailFooter(opts: { appUrl?: string; unsubUrl?: string; note?: string } = {}): string {
  const app = opts.appUrl || 'https://flycheap.live';
  const year = new Date().getUTCFullYear();
  const unsub = opts.unsubUrl
    ? ` &nbsp;&nbsp; <a href="${escAttr(opts.unsubUrl)}" style="color:${MUTED};text-decoration:underline">Unsubscribe</a>` : '';
  const note = opts.note
    ? `<div style="font-family:${SANS};font-size:12px;line-height:1.6;color:${MUTED};margin:0 0 12px">${opts.note}</div>` : '';
  return `<div style="background:${CARD};border-top:1px solid ${LINE};padding:18px 32px 22px">
    ${note}<div style="font-family:${SANS};font-size:12px;line-height:1.7;color:${MUTED}">
      <a href="${escAttr(app)}" style="color:${INK};text-decoration:none;font-weight:600">flycheap.live</a>
      &nbsp;&nbsp; <a href="${escAttr(app)}/settings" style="color:${MUTED};text-decoration:underline">Manage alerts</a>
      &nbsp;&nbsp; <a href="${escAttr(app)}/privacy" style="color:${MUTED};text-decoration:underline">Privacy</a>${unsub}
    </div>
    <div style="font-family:${MONO};font-size:10.5px;letter-spacing:.06em;color:${MUTED_2};margin-top:10px">© ${year} FlyCheap · New York, USA</div>
  </div>`;
}

/** Wrap masthead/panel/footer blocks in the 600px email document. */
export function emailFrame(preheader: string, innerBlocks: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<link rel="stylesheet" href="${FONT_LINK}">
<title>FlyCheap</title>
</head>
<body style="margin:0;padding:0;background:${PAPER}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}</div>
<div style="background:${PAPER};margin:0;padding:28px 12px;font-family:${SANS}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;border-collapse:collapse;border-left:1px solid ${LINE};border-right:1px solid ${LINE}">
        <tr><td style="text-align:left">${innerBlocks}</td></tr>
      </table>
    </td></tr>
  </table>
</div>
</body></html>`;
}

// ---- The letter shell (account / transactional emails) ---------------------

export function renderEmail(opts: {
  kind: EmailKind;
  preheader: string;         // hidden inbox-preview line
  headline: string;          // the serif moment
  /** Body HTML — paragraphs, a button, code, rows. Built with the helpers. */
  body: string;
  appUrl?: string;           // for the masthead/footer links
  unsubUrl?: string;         // adds a visible unsubscribe link to the footer
  footerNote?: string;       // quiet line above the footer links
}): string {
  const { label } = KIND[opts.kind];
  const panel = `<div style="background:${CARD};padding:30px 32px 30px">
    <h1 style="font-family:${SERIF};font-size:30px;line-height:1.15;font-weight:400;letter-spacing:-.02em;color:${INK};margin:0 0 20px">${esc(opts.headline)}</h1>
    ${opts.body}
  </div>`;
  return emailFrame(opts.preheader,
    emailMasthead(label) + panel + emailFooter({ appUrl: opts.appUrl, unsubUrl: opts.unsubUrl, note: opts.footerNote }));
}

// ---- Body helpers (paragraphs the builders compose) ------------------------

export function p(html: string): string {
  return `<p style="font-family:${SANS};font-size:15px;line-height:1.6;color:${INK};margin:0 0 16px">${html}</p>`;
}
export function link(label: string, href: string): string {
  return `<a href="${escAttr(href)}" style="color:${ACCENT};font-weight:600;text-decoration:underline">${esc(label)}</a>`;
}
export { esc as escapeEmail };
