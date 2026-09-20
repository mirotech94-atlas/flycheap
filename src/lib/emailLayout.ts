import 'server-only';

/**
 * FlyCheap transactional email design system.
 *
 * One formal, branded shell for every email we send; the per-type builders
 * in emailTemplates.ts vary only the accent, the headline and the body — the
 * masthead, type and footer stay identical so every message is unmistakably
 * FlyCheap.
 *
 * Design: premium-travel stationery, not a SaaS card kit. Deep navy masthead,
 * warm ivory ground, a single white letter-panel with a gold rule, a Georgia
 * serif headline as the one bold moment, everything else quiet. Email-safe:
 * inline styles, web-safe font stacks, no external CSS/JS.
 *
 * Two chrome pieces — emailMasthead() and emailFooter() — are exported so a
 * rich, data-heavy email (the fare alert) can wear the same masthead and
 * footer as the letter-style account emails without being forced through the
 * narrow letter panel.
 */

// ---- Palette (formal refinement of the navy+gold brand) --------------------
const NAVY = '#0a2e57';       // masthead + primary
const NAVY_LIGHT = '#154a86';  // the lighter stop for navy gradients (8.9:1 on white)
const INK = '#12233d';        // body text
const GOLD = '#b8912f';       // formal gold — rules, one accent
const PAPER = '#f6f2e9';      // warm ivory ground
const CARD = '#ffffff';       // letter panel
const SLATE = '#5c6b82';      // secondary text
const LINE = '#e6dfce';       // hairline on paper
const LINE_CARD = '#ece6da';  // hairline inside the panel

const SERIF = "Georgia, 'Times New Roman', 'Iowan Old Style', serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif";
const MONO = "'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace";

export const EMAIL_TOKENS = { NAVY, NAVY_LIGHT, INK, GOLD, PAPER, CARD, SLATE, LINE, LINE_CARD, SERIF, SANS, MONO };

export type EmailKind = 'welcome' | 'security' | 'support' | 'alert' | 'billing' | 'notice';

/** Per-type accent + the small serif kind line that sits under the headline. */
const KIND: Record<EmailKind, { accent: string; label: string }> = {
  welcome:  { accent: GOLD,      label: 'Founding member' },
  security: { accent: '#1f5fa5', label: 'Account security' },
  support:  { accent: '#2f7d6b', label: 'From the team' },
  alert:    { accent: '#c05621', label: 'Fare alert' },
  billing:  { accent: NAVY,      label: 'Billing' },
  notice:   { accent: SLATE,     label: 'Account notice' },
};

export function kindAccent(kind: EmailKind): string { return KIND[kind].accent; }

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Escape a URL for use inside a double-quoted href attribute (keeps & chains intact). */
const escAttr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

// ---- Reusable pieces --------------------------------------------------------

/** Primary action: navy button with a thin gold cap. Use once per email. */
export function emailButton(label: string, href: string): string {
  return `<a href="${escAttr(href)}" style="display:inline-block;background:${NAVY};border-top:2px solid ${GOLD};color:#ffffff;text-decoration:none;font-family:${SANS};font-size:15px;font-weight:600;letter-spacing:.01em;padding:13px 28px;border-radius:6px">${esc(label)}</a>`;
}

/**
 * A large, letter-spaced code block (sign-in codes, confirmation codes).
 * Letter-spacing does the visual separation; we deliberately do NOT inject
 * spacer characters between digits — users paste these codes, and a stray
 * hair-space in the clipboard makes the form reject a correct code.
 */
export function emailCode(code: string): string {
  return `<div style="font-family:${MONO};font-size:34px;font-weight:600;letter-spacing:.42em;color:${INK};background:${PAPER};border:1px solid ${LINE};border-radius:8px;text-align:center;padding:18px 8px 18px 20px;margin:6px 0 4px">${esc(code)}</div>`;
}

/** A definition-style row list (receipts, ticket meta) — label left, value right. */
export function emailRows(rows: Array<[string, string]>): string {
  const body = rows.map(([k, v], i) => `
    <tr>
      <td style="font-family:${SANS};font-size:13px;color:${SLATE};padding:${i ? '9px' : '0'} 0 0;vertical-align:top">${esc(k)}</td>
      <td style="font-family:${SANS};font-size:13px;color:${INK};font-weight:600;text-align:right;padding:${i ? '9px' : '0'} 0 0;vertical-align:top">${v}</td>
    </tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${body}</table>`;
}

/** A quiet supporting note under the main content. */
export function emailNote(html: string): string {
  return `<p style="font-family:${SANS};font-size:13px;line-height:1.6;color:${SLATE};margin:16px 0 0">${html}</p>`;
}

// ---- Chrome (masthead + footer), shared by every email ---------------------

/** Navy masthead: serif wordmark + quiet gold mark + a short gold rule. */
export function emailMasthead(): string {
  return `<div style="background:${NAVY};border-radius:10px 10px 0 0;padding:22px 32px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-family:${SERIF};font-size:22px;font-weight:700;letter-spacing:.01em;color:#ffffff">FlyCheap</td>
      <td align="right" style="font-family:${SANS};font-size:11px;letter-spacing:.14em;color:${GOLD}">FARE INTELLIGENCE</td>
    </tr></table>
    <div style="height:2px;background:${GOLD};width:44px;margin-top:12px"></div>
  </div>`;
}

/** Footer: brand links (+ optional unsubscribe) and an optional note above them. */
export function emailFooter(opts: { appUrl?: string; unsubUrl?: string; note?: string } = {}): string {
  const app = opts.appUrl || 'https://flycheap.live';
  const year = new Date().getUTCFullYear();
  const unsub = opts.unsubUrl
    ? ` &nbsp;&middot;&nbsp; <a href="${escAttr(opts.unsubUrl)}" style="color:${SLATE};text-decoration:none">Unsubscribe</a>` : '';
  const note = opts.note
    ? `<div style="font-family:${SANS};font-size:12px;line-height:1.6;color:${SLATE};margin:0 0 12px">${opts.note}</div>` : '';
  return `<div style="background:${CARD};border:1px solid ${LINE};border-top:1px solid ${LINE_CARD};border-radius:0 0 10px 10px;padding:22px 32px">
    ${note}<div style="font-family:${SANS};font-size:12px;line-height:1.7;color:${SLATE}">
      <a href="${escAttr(app)}" style="color:${NAVY};text-decoration:none;font-weight:600">flycheap.live</a>
      &nbsp;&middot;&nbsp; <a href="${escAttr(app)}/settings" style="color:${SLATE};text-decoration:none">Manage alerts</a>
      &nbsp;&middot;&nbsp; <a href="${escAttr(app)}/privacy" style="color:${SLATE};text-decoration:none">Privacy</a>${unsub}
    </div>
    <div style="font-family:${SANS};font-size:11px;color:#97a1b2;margin-top:8px">© ${year} FlyCheap · Fare intelligence, monitored for you · New York, USA</div>
  </div>`;
}

/** Wrap masthead/panel/footer blocks in the centered 600px email frame. */
export function emailFrame(preheader: string, innerBlocks: string): string {
  return `<!-- FlyCheap -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}</div>
<div style="background:${PAPER};margin:0;padding:24px 12px;font-family:${SANS}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;border-collapse:collapse">
        <tr><td>${innerBlocks}</td></tr>
      </table>
    </td></tr>
  </table>
</div>`;
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
  const { accent, label } = KIND[opts.kind];
  const panel = `<div style="background:${CARD};padding:34px 32px 30px;border-left:1px solid ${LINE};border-right:1px solid ${LINE}">
    <div style="font-family:${SERIF};font-size:14px;font-style:italic;color:${accent};margin:0 0 10px">${esc(label)}</div>
    <h1 style="font-family:${SERIF};font-size:28px;line-height:1.18;font-weight:700;color:${INK};margin:0 0 18px">${esc(opts.headline)}</h1>
    <div style="border-left:3px solid ${accent};padding-left:18px">
      ${opts.body}
    </div>
  </div>`;
  return emailFrame(opts.preheader,
    emailMasthead() + panel + emailFooter({ appUrl: opts.appUrl, unsubUrl: opts.unsubUrl, note: opts.footerNote }));
}

// ---- Body helpers (paragraphs the builders compose) ------------------------

export function p(html: string): string {
  return `<p style="font-family:${SANS};font-size:15px;line-height:1.62;color:${INK};margin:0 0 16px">${html}</p>`;
}
export function link(label: string, href: string): string {
  return `<a href="${escAttr(href)}" style="color:${NAVY};font-weight:600;text-decoration:underline">${esc(label)}</a>`;
}
export { esc as escapeEmail };
