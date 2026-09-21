import Link from 'next/link';

/* ============================================================
   PageKit — client-portal primitives, on the editorial skeleton.

   Every page draws from the same editorial.css tokens (--ed rule/surface/
   ink/amber/accent) so the portal reads as one product rather than a
   dashboard bolted
   to some other pages. Amber stays reserved for fares and the one
   primary action per page — never decoration.

   Prop names, prop types and child slots are unchanged from the
   night-cabin version: 10 other pages (plus DepartureBoard.tsx, for
   FcRoute) import these and must keep compiling and rendering as
   each of their own tabs is converted in turn.
   ============================================================ */

/** Page title. Set in the serif face, with a plain-language lede. */
export function FcPageHead({
  title, lede, action,
}: { title: string; lede?: string; action?: React.ReactNode }) {
  return (
    <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, marginBottom: 28 }}>
      <div style={{ maxWidth: '62ch' }}>
        <h1 className="ed-h1" style={{ margin: '0 0 10px' }}>{title}</h1>
        {lede && <p className="ed-sub" style={{ margin: 0 }}>{lede}</p>}
      </div>
      {action && <div className="ed-actions" style={{ margin: 0 }}>{action}</div>}
    </header>
  );
}

/** One headline figure. Fares carry the amber ground; the digits stay ink. */
export function FcStat({
  label, value, note, accent,
}: { label: string; value: React.ReactNode; note?: React.ReactNode; accent?: boolean }) {
  return (
    <div className={accent ? 'ed-stat accent' : 'ed-stat'}>
      <div className="ed-stat-label">{label}</div>
      <div className="ed-stat-value">{value}</div>
      {note && <div className="ed-stat-note">{note}</div>}
    </div>
  );
}

export function FcStatRow({ children }: { children: React.ReactNode }) {
  return <div className="ed-stats">{children}</div>;
}

/** Panel on the page surface — a ruled block, not a card. */
export function FcPanel({
  title, note, action, children, id,
}: {
  title?: string; note?: string; action?: React.ReactNode;
  children: React.ReactNode; id?: string;
}) {
  return (
    <section id={id} className="ed-panel" style={{ scrollMarginTop: 96 }}>
      {(title || action) && (
        <div className="ed-panel-head">
          <div>
            {title && <h2 className="ed-panel-title">{title}</h2>}
            {note && <p className="ed-panel-note">{note}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function FcTable({ head, children }: { head: React.ReactNode[]; children: React.ReactNode }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="ed-table">
        <thead>
          <tr>
            {head.map((h, i) => <th key={i}>{h}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** An empty screen is an invitation to act. */
export function FcEmpty({
  headline, body, cta, href,
}: { headline: string; body: string; cta?: string; href?: string }) {
  return (
    <div className="ed-empty">
      <p className="ed-empty-head">{headline}</p>
      <p className="ed-empty-body">{body}</p>
      {cta && href && <Link href={href} className="ed-btn ed-btn-primary" style={{ display: 'inline-flex', marginTop: 20 }}>{cta}</Link>}
    </div>
  );
}

/** Money. One treatment everywhere, so a fare always looks like a fare — the
    serif number, not amber (amber digits on a light surface measured under
    AA; the ground/border carries the amber signal instead, per .ed-stat.accent). */
export function FcMoney({ usd, muted }: { usd: number | null | undefined; muted?: boolean }) {
  if (usd == null) return <span style={{ color: 'var(--muted-2)' }}>—</span>;
  return (
    <span
      className="tabular-nums"
      style={muted
        ? { fontFamily: 'var(--font-mono-ed)', color: 'var(--muted)' }
        : { fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
    >
      ${Math.round(usd).toLocaleString('en-US')}
    </span>
  );
}

/** A route, set like a departure board — mono route code. */
export function FcRoute({ from, to, size = 'md' }: { from: string; to: string; size?: 'sm' | 'md' | 'lg' }) {
  const px = size === 'lg' ? '26px' : size === 'sm' ? '15px' : '19px';
  return (
    <span
      className="tabular-nums"
      style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, fontFamily: 'var(--font-mono-ed)', fontWeight: 600, letterSpacing: '0.02em', fontSize: px, color: 'var(--ink)' }}
    >
      {from}
      <span aria-hidden style={{ color: 'var(--accent)', fontWeight: 500 }}>→</span>
      {to}
    </span>
  );
}
