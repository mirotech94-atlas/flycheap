// Server component — pure visual radar with real anomaly list.
export type MistakeFare = {
  time: string;       // "14:08"
  route: string;      // "JFK → CAI"
  detail: string;     // "Aug 22 → Sep 5 · 14d"
  was: number;        // median (cents truncated to int dollars)
  now: number;        // current per-adult
  pct: number;        // % below median
  /** When set, the row becomes a clickable affiliate link to book this exact
   *  mistake-fare itinerary. Routes through /go for click logging. */
  bookHref?: string;
};

const FALLBACK: MistakeFare[] = [
  { time: '14:08', route: 'JFK → BOM', detail: 'Sep 4-18 · Air India · nonstop', was: 1480, now: 312, pct: 79 },
  { time: '11:42', route: 'EWR → DEL', detail: 'Aug 22 → Sep 5 · Lufthansa via FRA', was: 1620, now: 488, pct: 70 },
  { time: '08:25', route: 'LAX → DPS', detail: 'Oct 12-26 · Korean Air via ICN', was: 1820, now: 612, pct: 66 },
  { time: '23:14', route: 'JFK → CPT', detail: 'Nov 8-22 · Qatar via DOH', was: 2100, now: 798, pct: 62 },
];

export function FcMistakeRadar({ anomalies }: { anomalies?: MistakeFare[] }) {
  const list = (anomalies && anomalies.length > 0) ? anomalies : FALLBACK;
  return (
    <div className="fc-radar">
      <div className="fc-radar-left">
        <div className="fc-eyebrow">Mistake-Fare Radar · Live</div>
        <h2 className="fc-radar-h">When airlines <em>misprice</em>, we wake you up.</h2>
        <p className="fc-radar-lede">
          Our anomaly engine flags fares ≥ 30% below the cached median across every cabin and route. These are real,
          currently-bookable mispricings — often pulled within hours.
        </p>
        <div className="fc-radar-fare-list">
          {list.slice(0, 5).map((f, i) => {
            const rowInner = (
              <>
                <div className="fc-radar-fare-time">{f.time}</div>
                <div className="fc-radar-fare-route">
                  {f.route}
                  <span className="small">{f.detail}</span>
                </div>
                <div className="fc-radar-fare-was">${f.was}</div>
                <div className="fc-radar-fare-now">
                  ${f.now}
                  <span className="pct">−{f.pct}%</span>
                </div>
              </>
            );
            return f.bookHref ? (
              <a
                key={i}
                className="fc-radar-fare fc-radar-fare-link"
                href={f.bookHref}
                target="_blank"
                rel="noopener noreferrer sponsored"
                title={`Book ${f.route} — ${f.detail}`}
              >
                {rowInner}
              </a>
            ) : (
              <div className="fc-radar-fare" key={i}>{rowInner}</div>
            );
          })}
        </div>
      </div>
      <div className="fc-radar-right">
        <div className="fc-radar-ring">
          <div className="fc-radar-sweep" />
          <div className="fc-radar-blip" style={{ top: '22%', left: '32%' }} />
          <div className="fc-radar-blip" style={{ top: '58%', left: '70%' }} />
          <div className="fc-radar-blip" style={{ top: '74%', left: '38%' }} />
          <div className="fc-radar-blip" style={{ top: '34%', left: '64%', opacity: 0.55 }} />
          <div className="fc-radar-center">
            {String(list.length).padStart(2, '0')}
            <span className="label">Live anomalies</span>
          </div>
        </div>
      </div>
    </div>
  );
}
