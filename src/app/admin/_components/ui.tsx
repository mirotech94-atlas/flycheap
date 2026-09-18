import Link from 'next/link';

/* ============================================================
   Admin executive UI primitives.
   One visual language for every admin page: KPI tiles, panels,
   section headers, status dots, sparklines, delta chips.
   Server components — no client JS.
   ============================================================ */

export type Tone = 'neutral' | 'gold' | 'good' | 'warn' | 'bad';

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-white',
  gold: 'text-[#F2C67A]',
  good: 'text-emerald-300',
  warn: 'text-amber-300',
  bad: 'text-rose-300',
};
const TONE_DOT: Record<Tone, string> = {
  neutral: 'bg-white/40',
  gold: 'bg-[#E8A33D]',
  good: 'bg-emerald-400',
  warn: 'bg-amber-400',
  bad: 'bg-rose-400',
};

/** Small uppercase mono label used above every value. */
export function Eyebrow({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <div className={`ad-eyebrow ${tone === 'gold' ? 'text-[#E8A33D]' : 'text-white/45'}`}>
      {children}
    </div>
  );
}

/** Page title block: eyebrow + h1 + one-line description. */
export function PageHead({
  eyebrow, title, sub, right,
}: { eyebrow: string; title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <Eyebrow tone="gold">{eyebrow}</Eyebrow>
        <h1 className="mt-1">{title}</h1>
        {sub && <p className="text-sm text-white/55 mt-1.5 max-w-2xl leading-relaxed">{sub}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

/** Section divider with a title — groups panels on a page. */
export function SectionHead({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3 mt-2">
      <div className="flex items-baseline gap-3">
        <h2 className="!text-[1.15rem]">{title}</h2>
        {sub && <span className="text-xs text-white/40">{sub}</span>}
      </div>
      {right}
    </div>
  );
}

/** Headline metric tile. `delta` renders a coloured chip; `foot` a caption. */
export function Kpi({
  label, value, unit, foot, tone = 'neutral', delta, deltaTone, href, spark,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  foot?: React.ReactNode;
  tone?: Tone;
  delta?: string;
  deltaTone?: Tone;
  href?: string;
  spark?: number[];
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <Eyebrow>{label}</Eyebrow>
        {delta && (
          <span className={`ad-chip ${TONE_TEXT[deltaTone ?? 'neutral']}`}>{delta}</span>
        )}
      </div>
      <div className="flex items-baseline gap-1.5 mt-1.5">
        <span className={`ad-kpi-value ${TONE_TEXT[tone]}`}>{value}</span>
        {unit && <span className="text-[11px] font-mono uppercase tracking-wider text-white/40">{unit}</span>}
      </div>
      {spark && spark.length > 1 && <Spark data={spark} tone={tone} />}
      {foot && <div className="text-[11.5px] text-white/45 mt-1.5 leading-snug">{foot}</div>}
    </>
  );
  const cls = 'ad-panel ad-kpi' + (href ? ' ad-kpi-link' : '');
  return href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

/** Inline sparkline for KPI tiles. */
export function Spark({ data, tone = 'neutral', h = 26 }: { data: number[]; tone?: Tone; h?: number }) {
  const w = 120;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / span) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const stroke = tone === 'gold' ? '#E8A33D' : tone === 'good' ? '#7BC49A' : tone === 'bad' ? '#E0655C' : '#6FB3C9';
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full mt-2" style={{ height: h }} preserveAspectRatio="none" aria-hidden>
      <polyline points={`0,${h} ${pts.join(' ')} ${w},${h}`} fill={stroke} fillOpacity="0.10" stroke="none" />
      <polyline points={pts.join(' ')} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Bordered content panel. */
export function Panel({
  title, sub, right, children, className = '', tone, id,
}: {
  title?: string; sub?: string; right?: React.ReactNode;
  children: React.ReactNode; className?: string; tone?: Tone; id?: string;
}) {
  return (
    <section id={id} className={`ad-panel scroll-mt-24 ${tone === 'gold' ? 'ad-panel-gold' : ''} ${className}`}>
      {(title || right) && (
        <header className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <div>
            {title && <div className="ad-panel-title">{title}</div>}
            {sub && <div className="text-[11.5px] text-white/40 mt-0.5">{sub}</div>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

/** Coloured status pill with a dot — for health / state columns. */
export function Status({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} />
      <span className={TONE_TEXT[tone]}>{children}</span>
    </span>
  );
}

/** Labelled horizontal bar — tier funnels, provider mixes, route shares. */
export function BarRow({
  label, value, max, tone = 'neutral', right,
}: { label: React.ReactNode; value: number; max: number; tone?: Tone; right?: React.ReactNode }) {
  const pct = max > 0 ? Math.max(1, Math.round((value / max) * 100)) : 0;
  const fill = tone === 'gold' ? '#E8A33D' : tone === 'good' ? '#7BC49A' : tone === 'bad' ? '#D8433A' : '#3D6B86';
  return (
    <div className="py-2 border-t border-white/[0.06] first:border-t-0">
      <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
        <span className="text-white/80 truncate">{label}</span>
        <span className="font-mono tabular-nums text-white/60 shrink-0">{right ?? value.toLocaleString()}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] mt-1.5 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: fill }} />
      </div>
    </div>
  );
}

/** Row inside the "Attention required" panel. */
export function ActionRow({
  tone, title, detail, href, cta,
}: { tone: Tone; title: string; detail: string; href?: string; cta?: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-t border-white/[0.06] first:border-t-0">
      <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${TONE_DOT[tone]}`} />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-white/90 font-medium">{title}</div>
        <div className="text-[11.5px] text-white/45 mt-0.5 leading-snug">{detail}</div>
      </div>
      {href && (
        <Link href={href} className="ad-btn shrink-0">{cta ?? 'Open'}</Link>
      )}
    </div>
  );
}

/** Dense table wrapper — consistent header/row styling across pages. */
export function Table({ head, children }: { head: React.ReactNode[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="ad-table w-full">
        <thead>
          <tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
export function fmtMoney(n: number, decimals = 0): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
/** "3 min ago" / "2 h ago" / "5 d ago" from an SQLite UTC timestamp. */
export function ago(ts: string | null | undefined): string {
  if (!ts) return '—';
  const iso = ts.includes('T') ? ts : ts.replace(' ', 'T') + (ts.endsWith('Z') ? '' : 'Z');
  const min = (Date.now() - new Date(iso).getTime()) / 60000;
  if (!Number.isFinite(min)) return '—';
  if (min < 1) return 'just now';
  if (min < 60) return `${Math.round(min)} min ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h ago`;
  return `${Math.round(min / 1440)} d ago`;
}
export function minutesSince(ts: string | null | undefined): number | null {
  if (!ts) return null;
  const iso = ts.includes('T') ? ts : ts.replace(' ', 'T') + (ts.endsWith('Z') ? '' : 'Z');
  const min = (Date.now() - new Date(iso).getTime()) / 60000;
  return Number.isFinite(min) ? min : null;
}
