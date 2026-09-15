/* global React */
const { useState: useStateP, useEffect: useEffectP, useMemo: useMemoP } = React;

/* ============================================================
   Plane icon (used in DNA card)
   ============================================================ */
window.PlaneIcon = function PlaneIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M22 12L12 17V14L4 12L12 10V7L22 12Z" fill="currentColor" />
    </svg>
  );
};

/* ============================================================
   Mini trend sparkline
   ============================================================ */
window.Sparkline = function Sparkline({ data, color = '#1f8a5b', width = 64, height = 28 }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${height - ((v - min) / range) * height}`).join(' ');
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle
        cx={(data.length - 1) * step}
        cy={height - ((data[data.length - 1] - min) / range) * height}
        r="2.5"
        fill={color}
      />
    </svg>
  );
};

/* ============================================================
   KPI tile
   ============================================================ */
window.Kpi = function Kpi({ label, value, unit, sub, accent = false, trend, trendColor = '#1f8a5b' }) {
  return (
    <div className={'kpi' + (accent ? ' kpi-accent' : '')}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
      <div className="kpi-sub">{sub}</div>
      {trend && (
        <div className="kpi-trend">
          <Sparkline data={trend} color={accent ? '#d4af37' : trendColor} />
        </div>
      )}
    </div>
  );
};

/* ============================================================
   Ticker tape — runs across bottom of hero
   ============================================================ */
const TICKER_ITEMS = [
  { route: 'JFK → CAI', price: 612, delta: -84 },
  { route: 'EWR → CAI', price: 589, delta: -112 },
  { route: 'LAX → NRT', price: 743, delta: -42 },
  { route: 'JFK → LHR', price: 412, delta: 18 },
  { route: 'YYZ → CDG', price: 498, delta: -22 },
  { route: 'FRA → BKK', price: 821, delta: -56 },
  { route: 'JFK → GRU', price: 678, delta: -38 },
  { route: 'DXB → BOM', price: 198, delta: 8 },
  { route: 'IST → CAI', price: 168, delta: -14 },
  { route: 'EWR → ATH', price: 524, delta: -76 },
  { route: 'JFK → AMM', price: 642, delta: -52 },
  { route: 'BOS → DUB', price: 388, delta: -28 },
  { route: 'LAX → ICN', price: 698, delta: -44 },
  { route: 'SFO → SIN', price: 912, delta: -62 },
  { route: 'IAH → MEX', price: 226, delta: 6 },
];

window.HeroTicker = function HeroTicker() {
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS]; // duplicate for seamless scroll
  return (
    <div className="ticker">
      <div className="ticker-tag">LIVE&nbsp;FARES</div>
      <div className="ticker-tape">
        <div className="ticker-track">
          {items.map((it, i) => (
            <div className="ticker-item" key={i}>
              <span className="ticker-route">{it.route}</span>
              <span className="ticker-price">${it.price}</span>
              <span className={it.delta < 0 ? 'ticker-delta-down' : 'ticker-delta-up'}>
                {it.delta < 0 ? '▼' : '▲'} {Math.abs(it.delta)}
              </span>
              <span className="ticker-sep" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ============================================================
   Best Deals table
   ============================================================ */
const DEAL_ROWS = [
  { origin: 'JFK', dest: 'CAI', out: 'Jul 8',  outDay: 'TUE 03:15', ret: 'Jul 22', retDay: 'SAT 04:50', trip: 14, per: 589, party: 2356, threshold: 800, sweet: true, hot: false, conf: 92 },
  { origin: 'EWR', dest: 'CAI', out: 'Aug 12', outDay: 'TUE 02:40', ret: 'Aug 30', retDay: 'SAT 04:50', trip: 18, per: 612, party: 2448, threshold: 800, sweet: true, hot: true,  conf: 88 },
  { origin: 'EWR', dest: 'CAI', out: 'Sep 6',  outDay: 'SAT 03:00', ret: 'Sep 23', retDay: 'TUE 04:50', trip: 17, per: 624, party: 2496, threshold: 800, sweet: true, hot: false, conf: 84 },
  { origin: 'JFK', dest: 'CAI', out: 'Jun 24', outDay: 'TUE 12:00', ret: 'Jul 8',  retDay: 'TUE 05:00', trip: 14, per: 638, party: 2552, threshold: 800, hot: false, conf: 79 },
  { origin: 'JFK', dest: 'CAI', out: 'Oct 14', outDay: 'TUE 12:00', ret: 'Oct 28', retDay: 'TUE 05:00', trip: 14, per: 654, party: 2616, threshold: 800, hot: false, conf: 81 },
  { origin: 'EWR', dest: 'CAI', out: 'Nov 11', outDay: 'TUE 13:00', ret: 'Nov 25', retDay: 'TUE 05:00', trip: 14, per: 671, party: 2684, threshold: 800, hot: false, conf: 76 },
  { origin: 'JFK', dest: 'CAI', out: 'Feb 3',  outDay: 'TUE 12:00', ret: 'Feb 17', retDay: 'TUE 05:00', trip: 14, per: 712, party: 2848, threshold: 800, hot: false, conf: 71 },
  { origin: 'EWR', dest: 'CAI', out: 'Apr 7',  outDay: 'TUE 13:00', ret: 'Apr 21', retDay: 'TUE 05:00', trip: 14, per: 748, party: 2992, threshold: 800, hot: false, conf: 68 },
  { origin: 'JFK', dest: 'CAI', out: 'Dec 16', outDay: 'TUE 12:00', ret: 'Dec 30', retDay: 'TUE 05:00', trip: 14, per: 892, party: 3568, threshold: 800, above: true, conf: 64 },
];

window.BestDealsCard = function BestDealsCard() {
  const [filter, setFilter] = useStateP('all');
  const filtered = useMemoP(() => {
    if (filter === 'sweet') return DEAL_ROWS.filter(r => r.sweet);
    if (filter === 'under') return DEAL_ROWS.filter(r => r.per < r.threshold);
    if (filter === 'jfk')   return DEAL_ROWS.filter(r => r.origin === 'JFK');
    if (filter === 'ewr')   return DEAL_ROWS.filter(r => r.origin === 'EWR');
    return DEAL_ROWS;
  }, [filter]);
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="smallcaps">12-Month opportunity scan · 700+ airlines</div>
          <h2 className="card-title">Best fares <em>worldwide</em></h2>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="badge badge-mute mono" style={{ fontSize: 10, letterSpacing: '.1em' }}>{filtered.length} MATCHES</span>
          <button className="btn btn-light btn-sm">Export CSV</button>
        </div>
      </div>
      <div className="chips">
        <div className={'chip' + (filter === 'all' ? ' active' : '')} onClick={() => setFilter('all')}>All routes</div>
        <div className={'chip chip-gold' + (filter === 'sweet' ? ' active' : '')} onClick={() => setFilter('sweet')}>Sweet-spot ✦</div>
        <div className={'chip' + (filter === 'under' ? ' active' : '')} onClick={() => setFilter('under')}>Below threshold</div>
        <div className={'chip' + (filter === 'jfk' ? ' active' : '')} onClick={() => setFilter('jfk')}>JFK origin</div>
        <div className={'chip' + (filter === 'ewr' ? ' active' : '')} onClick={() => setFilter('ewr')}>EWR origin</div>
        <div className="chip">Nonstop</div>
        <div className="chip">14-day trip</div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="deals-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Route</th>
              <th>Outbound</th>
              <th>Return</th>
              <th>Trip</th>
              <th style={{ textAlign: 'right' }}>Per adult</th>
              <th style={{ textAlign: 'right' }}>Party (4+1)</th>
              <th>vs $800</th>
              <th>Confidence</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => {
              const delta = r.per - r.threshold;
              const below = delta < 0;
              return (
                <tr key={i} className={r.sweet ? 'row-sweetspot' : ''}>
                  <td className="col-rank">{String(i + 1).padStart(2, '0')}</td>
                  <td className="col-route">
                    {r.origin}<span className="arrow">→</span><span className="dest">{r.dest}</span>
                    {r.hot && <span className="badge badge-hot" style={{ marginLeft: 8 }}>HOT</span>}
                  </td>
                  <td className="col-date">
                    <span className="day">{r.outDay.split(' ')[0]}</span>
                    {r.out} <span className="mono" style={{ color: '#8a93a6', fontSize: 11 }}>{r.outDay.split(' ')[1]}</span>
                  </td>
                  <td className="col-date">
                    <span className="day">{r.retDay.split(' ')[0]}</span>
                    {r.ret} <span className="mono" style={{ color: '#8a93a6', fontSize: 11 }}>{r.retDay.split(' ')[1]}</span>
                  </td>
                  <td style={{ color: '#5b6678', fontFamily: 'JetBrains Mono', fontSize: 12 }}>{r.trip}d</td>
                  <td className="col-price">
                    <span className="currency">$</span>{r.per}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: 13, color: '#5b6678' }}>
                    ${r.party.toLocaleString()}
                  </td>
                  <td className={'col-vs ' + (below ? 'vs-below' : 'vs-above')}>
                    {below ? '−' : '+'}${Math.abs(delta)}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: 38, height: 4, background: '#eef2f7', borderRadius: 999, overflow: 'hidden',
                      }}>
                        <div style={{
                          width: `${r.conf}%`,
                          height: '100%',
                          background: r.conf > 80 ? '#1f8a5b' : r.conf > 70 ? '#d4af37' : '#c1426b',
                        }} />
                      </div>
                      <span className="mono" style={{ fontSize: 11, color: '#5b6678' }}>{r.conf}%</span>
                    </div>
                  </td>
                  <td>
                    <button className="btn btn-ink btn-sm">Book →</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="deals-footer">
        <span>Refreshed 2 min ago · cache age 4m</span>
        <span>Showing {filtered.length} of 87 routes monitored</span>
      </div>
    </div>
  );
};

/* ============================================================
   Live Fare Feed — right rail
   ============================================================ */
const SEED_FEED = [
  { route: 'EWR → CAI · Aug 12-30',   price: 589, delta: -112, who: 'EgyptAir nonstop · MS986' },
  { route: 'JFK → CAI · Jul 8-22',    price: 612, delta:  -84, who: 'EgyptAir nonstop · MS985' },
  { route: 'YYZ → CDG · Sep 4-18',    price: 498, delta:  -22, who: 'Air France · 1 stop AMS' },
  { route: 'LAX → NRT · Oct 12-26',   price: 743, delta:  -42, who: 'ANA · nonstop' },
  { route: 'JFK → LHR · Jun 15-22',   price: 412, delta:   18, who: 'British Airways · nonstop' },
  { route: 'IST → CAI · Aug 4-11',    price: 168, delta:  -14, who: 'Pegasus · nonstop' },
  { route: 'FRA → BKK · Nov 2-16',    price: 821, delta:  -56, who: 'Lufthansa · 1 stop' },
];

window.LiveFeedCard = function LiveFeedCard() {
  const [items, setItems] = useStateP(SEED_FEED.map((x, i) => ({ ...x, id: 'seed-' + i, t: i + 1 })));
  const [now, setNow] = useStateP(new Date());

  useEffectP(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  // Add a new feed item every ~6s to simulate live polling
  useEffectP(() => {
    const i = setInterval(() => {
      setItems(prev => {
        const pool = [
          { route: 'EWR → CAI · Sep 6-23',  price: 624 + Math.round((Math.random() - .5) * 18), delta: -88, who: 'EgyptAir · MS988' },
          { route: 'JFK → AMM · Aug 18-30', price: 642, delta: -52, who: 'Royal Jordanian · 1 stop' },
          { route: 'LAX → BKK · Nov 12-26', price: 698, delta: -38, who: 'EVA Air · 1 stop TPE' },
          { route: 'BOS → DUB · Jul 22-29', price: 388, delta: -28, who: 'Aer Lingus · nonstop' },
          { route: 'JFK → GRU · Oct 4-18',  price: 678, delta: -34, who: 'LATAM · nonstop' },
          { route: 'EWR → ATH · Sep 12-26', price: 524, delta: -76, who: 'United · 1 stop FRA' },
        ];
        const pick = pool[Math.floor(Math.random() * pool.length)];
        const next = [{ ...pick, id: 'live-' + Date.now(), t: 0 }, ...prev].slice(0, 8);
        return next;
      });
    }, 6000);
    return () => clearInterval(i);
  }, []);

  return (
    <div className="card feed">
      <div className="feed-head">
        <div>
          <div className="smallcaps">Polling 30 providers</div>
          <h3 className="feed-title">Live fare feed</h3>
        </div>
        <div className="feed-pulse"><span className="dot" /> Live</div>
      </div>
      <div className="feed-list">
        {items.map((it, idx) => (
          <div className="feed-item" key={it.id}>
            <div className="feed-time">
              <strong>{idx === 0 ? 'NOW' : (idx * 4) + 'm'}</strong>
              {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
            </div>
            <div>
              <div className="feed-route">
                {it.route}
                <span className="small">{it.who}</span>
              </div>
            </div>
            <div className="feed-price">
              ${it.price}
              <span className={it.delta < 0 ? 'delta-down' : 'delta-up'}>
                {it.delta < 0 ? '▼' : '▲'} ${Math.abs(it.delta)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ============================================================
   Mistake-fare radar
   ============================================================ */
const MISTAKE_FARES = [
  { time: '14:08',  route: 'JFK → BOM',  detail: 'Sep 4-18 · Air India · nonstop',     was: 1480, now: 312, pct: 79 },
  { time: '11:42',  route: 'EWR → DEL',  detail: 'Aug 22 → Sep 5 · Lufthansa via FRA', was: 1620, now: 488, pct: 70 },
  { time: '08:25',  route: 'LAX → DPS',  detail: 'Oct 12-26 · Korean Air via ICN',     was: 1820, now: 612, pct: 66 },
  { time: '23:14',  route: 'JFK → CPT',  detail: 'Nov 8-22 · Qatar via DOH',           was: 2100, now: 798, pct: 62 },
];

window.MistakeFareRadar = function MistakeFareRadar() {
  return (
    <div className="radar">
      <div className="radar-left">
        <div className="eyebrow">Mistake-Fare Radar · Live</div>
        <h2 className="radar-h">When airlines <em>misprice</em>, we wake you up.</h2>
        <p className="radar-lede">
          Our anomaly engine flags fares ≥ 50% below 90-day median across every cabin and route. These are real, currently-bookable mispricings — often pulled within hours.
        </p>
        <div className="radar-fare-list">
          {MISTAKE_FARES.map((f, i) => (
            <div className="radar-fare" key={i}>
              <div className="radar-fare-time">{f.time}</div>
              <div className="radar-fare-route">
                {f.route}
                <span className="small">{f.detail}</span>
              </div>
              <div className="radar-fare-was">${f.was}</div>
              <div className="radar-fare-now">
                ${f.now}
                <span className="pct">−{f.pct}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="radar-right">
        <div className="radar-ring">
          <div className="radar-sweep" />
          <div className="radar-blip" style={{ top: '22%', left: '32%' }} />
          <div className="radar-blip" style={{ top: '58%', left: '70%' }} />
          <div className="radar-blip" style={{ top: '74%', left: '38%' }} />
          <div className="radar-blip" style={{ top: '34%', left: '64%', opacity: .55 }} />
          <div className="radar-center">
            04
            <span className="label">Live anomalies</span>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================
   Route DNA — pattern card showing what makes a route "tick"
   ============================================================ */
window.RouteDnaCard = function RouteDnaCard() {
  return (
    <div className="card dna-card">
      <div className="card-head">
        <div>
          <div className="smallcaps">Pattern intelligence</div>
          <h2 className="card-title">Route <em>DNA</em></h2>
          <div className="card-meta">JFK ↔ CAI · 90 days observed</div>
        </div>
        <button className="btn btn-light btn-sm">Switch</button>
      </div>

      <div className="dna-flightcard">
        <div className="dna-route">
          <div className="dna-iata">
            JFK
            <span className="label">New York</span>
          </div>
          <div className="dna-plane">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M22 12L12 17V14L4 12L12 10V7L22 12Z" fill="currentColor" />
            </svg>
          </div>
          <div className="dna-iata right">
            CAI
            <span className="label">Cairo</span>
          </div>
        </div>
      </div>

      <div className="dna-vis">
        <div className="dna-row">
          <div className="dna-label">Cheap day</div>
          <div className="dna-bar"><div className="dna-fill" style={{ width: '88%' }} /></div>
          <div className="dna-val">Tue</div>
        </div>
        <div className="dna-row">
          <div className="dna-label">Cheap hour</div>
          <div className="dna-bar"><div className="dna-fill" style={{ width: '72%' }} /></div>
          <div className="dna-val">03:00</div>
        </div>
        <div className="dna-row">
          <div className="dna-label">Best trip</div>
          <div className="dna-bar"><div className="dna-fill" style={{ width: '64%' }} /></div>
          <div className="dna-val">14d</div>
        </div>
        <div className="dna-row">
          <div className="dna-label">Median</div>
          <div className="dna-bar"><div className="dna-fill" style={{ width: '56%' }} /></div>
          <div className="dna-val">$734</div>
        </div>
        <div className="dna-row">
          <div className="dna-label">Floor</div>
          <div className="dna-bar"><div className="dna-fill" style={{ width: '34%' }} /></div>
          <div className="dna-val">$589</div>
        </div>
        <div className="dna-row">
          <div className="dna-label">Book by</div>
          <div className="dna-bar"><div className="dna-fill" style={{ width: '46%' }} /></div>
          <div className="dna-val">−47d</div>
        </div>
      </div>

      <div style={{ padding: '4px 24px 22px' }}>
        <div style={{
          background: 'linear-gradient(180deg, #f0f7f1, #e3eedf)',
          borderRadius: 12,
          padding: '12px 14px',
          fontSize: 12.5,
          color: '#2b4d1f',
          lineHeight: 1.4,
        }}>
          <strong style={{ color: '#0e6240' }}>Recommendation:</strong> Book a Tue 03:00 departure for a 14-day trip departing within the next 47 days. You're <strong style={{ color: '#0e6240' }}>$145 below median</strong> on the current best deal.
        </div>
      </div>
    </div>
  );
};

/* ============================================================
   Fare Calendar — heatmap of cheap windows
   ============================================================ */
function fareLevel(d) {
  // Synthesize a "cheapness" level 0..5 based on day-of-week pattern + month
  const dow = d.getDay();
  const day = d.getDate();
  // Tue (2) and Sat (6) cheapest
  let base = (dow === 2 || dow === 6) ? 4 : (dow === 0 || dow === 1) ? 2 : 1;
  // Some early-month days get a boost
  if (day % 11 === 3) base = Math.min(5, base + 1);
  if (day % 17 === 5) base = Math.max(0, base - 1);
  if (day === 9 || day === 23) base = 5; // mistake fare highlight
  return base;
}

window.FareCalendarCard = function FareCalendarCard() {
  const [month, setMonth] = useStateP(0);
  const months = ['August 2026', 'September 2026', 'October 2026'];
  const monthOffset = [7, 8, 9]; // 0-indexed
  const year = 2026;
  const m = monthOffset[month];
  const first = new Date(year, m, 1);
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const startDow = first.getDay();

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push({ empty: true, k: 'e' + i });
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, m, d);
    cells.push({ d, lvl: fareLevel(dt), k: 'd' + d });
  }

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="smallcaps">Cheap-window heatmap</div>
          <h2 className="card-title">Fare <em>calendar</em></h2>
          <div className="card-meta">JFK → CAI · 14-day round trip</div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn-light btn-sm" disabled={month === 0} onClick={() => setMonth(m => Math.max(0, m - 1))}>‹</button>
          <button className="btn btn-light btn-sm" disabled={month === 2} onClick={() => setMonth(m => Math.min(2, m + 1))}>›</button>
        </div>
      </div>
      <div className="cal">
        <div className="cal-month">
          <span>{months[month]}</span>
          <span className="mono" style={{ fontSize: 9, color: '#1f8a5b' }}>▼ 18% vs Jul</span>
        </div>
        <div className="cal-grid">
          {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
            <div key={d} className="cal-dow">{d}</div>
          ))}
          {cells.map(c => c.empty ? (
            <div key={c.k} style={{ aspectRatio: 1 }} />
          ) : (
            <div
              key={c.k}
              className={'cal-cell l' + c.lvl}
              title={`Day ${c.d} — level ${c.lvl}`}
            >
              {c.d}
            </div>
          ))}
        </div>
        <div className="cal-legend">
          <span>Cheap</span>
          <div className="swatches">
            {[0,1,2,3,4,5].map(l => <div key={l} className={'sw cal-cell l' + l} style={{ width: 14, height: 14 }} />)}
          </div>
          <span style={{ marginLeft: 'auto' }}>★ Mistake fare alert</span>
        </div>
      </div>
    </div>
  );
};

/* ============================================================
   Carbon Ledger
   ============================================================ */
window.CarbonCard = function CarbonCard() {
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="smallcaps">Footprint ledger · Tracked party</div>
          <h2 className="card-title">Carbon <em>budget</em></h2>
          <div className="card-meta">Round-trip · 4 adults + 1 infant</div>
        </div>
        <span className="badge badge-ok">▼ 12% Y/Y</span>
      </div>
      <div className="carbon">
        <div className="smallcaps">Estimated CO₂ for cheapest pairing</div>
        <div className="carbon-hero">
          7,420 <span className="unit">kg CO₂e</span>
        </div>
        <div className="smallcaps">Roughly equivalent to</div>
        <div className="carbon-eq">
          <div className="carbon-row">
            <div className="carbon-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12 H21 M12 3 Q16 8 12 12 Q8 16 12 21" />
              </svg>
            </div>
            <div>1.8× annual emissions of one average resident</div>
            <div className="val">×1.8</div>
          </div>
          <div className="carbon-row">
            <div className="carbon-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="9" rx="2" />
                <path d="M7 11V8a5 5 0 0110 0v3" />
              </svg>
            </div>
            <div>Powering a household for 14 months</div>
            <div className="val">14mo</div>
          </div>
          <div className="carbon-row">
            <div className="carbon-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-7.5 8-13a8 8 0 10-16 0c0 5.5 8 13 8 13z" />
              </svg>
            </div>
            <div>Driving NYC → Cairo nine times over</div>
            <div className="val">×9</div>
          </div>
        </div>
        <div className="carbon-cta">
          <strong>Offset $86</strong> via verified Gold Standard projects when you book — added at checkout, fully neutral on this trip.
        </div>
      </div>
    </div>
  );
};
