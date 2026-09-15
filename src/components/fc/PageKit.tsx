import Link from 'next/link';

/* ============================================================
   Night cabin — client-portal primitives.

   Ticket stock on a dark cabin deck. Every page draws from the
   same --nc-* tokens so the portal reads as one product rather
   than a dashboard bolted to some other pages.

   Amber is the reading light: fares and primary actions only.
   ============================================================ */

/** Page title. Set in the signage face, with a plain-language lede. */
export function FcPageHead({
  title, lede, action,
}: { title: string; lede?: string; action?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-5 mb-7">
      <div className="max-w-[62ch]">
        <h1
          className="text-[clamp(1.85rem,3.6vw,2.6rem)] leading-[1.06] tracking-[-0.02em]"
          style={{ fontFamily: 'var(--nc-display)', fontWeight: 700, color: 'var(--nc-on-dark)' }}
        >
          {title}
        </h1>
        {lede && (
          <p className="mt-3 text-[14.5px] leading-relaxed" style={{ color: 'var(--nc-on-dark-mute)' }}>
            {lede}
          </p>
        )}
      </div>
      {action}
    </header>
  );
}

/** One headline figure. Fares carry the amber; everything else stays quiet. */
export function FcStat({
  label, value, note, accent,
}: { label: string; value: React.ReactNode; note?: React.ReactNode; accent?: boolean }) {
  return (
    <div
      className="rounded-xl px-4 py-3.5 border"
      style={{
        borderColor: accent ? 'color-mix(in srgb, var(--nc-amber) 45%, transparent)' : 'var(--nc-rule)',
        background: accent ? 'color-mix(in srgb, var(--nc-amber) 8%, var(--nc-deck))' : 'var(--nc-deck)',
      }}
    >
      <div className="text-[11.5px]" style={{ color: 'var(--nc-on-dark-mute)' }}>{label}</div>
      <div
        className="mt-1.5 text-[1.7rem] leading-none tabular-nums"
        style={{
          fontFamily: 'var(--nc-mono)',
          color: accent ? 'var(--nc-amber)' : 'var(--nc-on-dark)',
        }}
      >
        {value}
      </div>
      {note && (
        <div className="mt-2 text-[11.5px] leading-snug" style={{ color: 'var(--nc-on-dark-faint)' }}>{note}</div>
      )}
    </div>
  );
}

export function FcStatRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-7">{children}</div>;
}

/** Panel on the dark deck. */
export function FcPanel({
  title, note, action, children, id,
}: {
  title?: string; note?: string; action?: React.ReactNode;
  children: React.ReactNode; id?: string;
}) {
  return (
    <section
      id={id}
      className="rounded-xl border p-5 scroll-mt-24"
      style={{ borderColor: 'var(--nc-rule)', background: 'var(--nc-deck)' }}
    >
      {(title || action) && (
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
          <div>
            {title && (
              <h2 className="text-[1.05rem] leading-snug"
                style={{ fontFamily: 'var(--nc-display)', fontWeight: 600, color: 'var(--nc-on-dark)' }}>
                {title}
              </h2>
            )}
            {note && <p className="mt-1 text-[12px]" style={{ color: 'var(--nc-on-dark-mute)' }}>{note}</p>}
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
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-[13px] border-collapse">
        <thead>
          <tr className="text-left" style={{ color: 'var(--nc-on-dark-mute)' }}>
            {head.map((h, i) => (
              <th key={i} className="font-medium text-[11.5px] pb-2 px-1 whitespace-nowrap"
                style={{ borderBottom: '1px solid var(--nc-rule-2)' }}>
                {h}
              </th>
            ))}
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
    <div className="py-12 px-6 text-center">
      <p className="text-[1.2rem]" style={{ fontFamily: 'var(--nc-display)', fontWeight: 600, color: 'var(--nc-on-dark)' }}>
        {headline}
      </p>
      <p className="mt-2.5 mx-auto max-w-[46ch] text-[13.5px] leading-relaxed" style={{ color: 'var(--nc-on-dark-mute)' }}>
        {body}
      </p>
      {cta && href && <Link href={href} className="nc-btn inline-flex mt-5">{cta}</Link>}
    </div>
  );
}

/** Money. One treatment everywhere, so a fare always looks like a fare. */
export function FcMoney({ usd, muted }: { usd: number | null | undefined; muted?: boolean }) {
  if (usd == null) return <span style={{ color: 'var(--nc-on-dark-faint)' }}>—</span>;
  return (
    <span className={muted ? 'tabular-nums' : 'nc-fare'}
      style={muted ? { fontFamily: 'var(--nc-mono)', color: 'var(--nc-on-dark-mute)' } : undefined}>
      ${Math.round(usd).toLocaleString('en-US')}
    </span>
  );
}

/** A route, set like a departure board. */
export function FcRoute({ from, to, size = 'md' }: { from: string; to: string; size?: 'sm' | 'md' | 'lg' }) {
  const px = size === 'lg' ? '1.6rem' : size === 'sm' ? '0.95rem' : '1.2rem';
  return (
    <span className="nc-code inline-flex items-baseline gap-2" style={{ fontSize: px, color: 'var(--nc-on-dark)' }}>
      {from}
      <span aria-hidden style={{ color: 'var(--nc-teal)', fontWeight: 500 }}>→</span>
      {to}
    </span>
  );
}
