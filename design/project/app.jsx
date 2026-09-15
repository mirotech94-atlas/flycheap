/* global React, ReactDOM */
const { useState, useEffect, useRef } = React;

// Tweaks defaults
const FC_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "ivory",
  "accent": "gold",
  "showTicker": true,
  "showConcierge": true,
  "heroVariant": "split",
  "globeAccent": "#d4af37"
}/*EDITMODE-END*/;

/* ============================================================
   AI Concierge — pinned bottom right
   ============================================================ */
function Concierge() {
  const [collapsed, setCollapsed] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    { who: 'bot', label: 'FlyCheap Concierge', text: <>I'm watching <span className="highlight">12 routes</span> across the next 12 months. JFK → CAI just dropped <span className="highlight">$84</span> on a Tue 3 AM departure — it's the cheapest I've seen this year.</> },
  ]);
  const [cardShown, setCardShown] = useState(true);

  const prompts = ['Why is Tuesday cheaper?', 'Show me Cairo deals < $700', 'Set up alert for LHR'];

  function send(text) {
    if (!text) return;
    setMessages(m => [...m, { who: 'user', text }]);
    setInput('');
    setTimeout(() => {
      setMessages(m => [...m, {
        who: 'bot',
        label: 'FlyCheap',
        text: <>On it. Pinned <span className="highlight">"{text}"</span> — I'll ping you in-thread if the median moves more than 5%.</>,
      }]);
    }, 600);
  }

  if (collapsed) {
    return (
      <div className="concierge concierge--mini">
        <div className="concierge-head">
          <div className="title"><span className="pulse" /> Concierge · 4 alerts</div>
          <div className="concierge-actions">
            <button className="concierge-btn" onClick={() => setCollapsed(false)}>▴</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="concierge">
      <div className="concierge-head">
        <div className="title"><span className="pulse" /> Concierge · Live</div>
        <div className="concierge-actions">
          <button className="concierge-btn" onClick={() => setCollapsed(true)} title="Minimize">–</button>
        </div>
      </div>
      <div className="concierge-body">
        {messages.map((m, i) => (
          m.who === 'bot' ? (
            <div key={i} className="concierge-msg bot">
              {m.label && <span className="label">{m.label}</span>}
              {m.text}
              {i === 0 && cardShown && (
                <div className="concierge-card">
                  <div>
                    <div className="route">JFK → CAI</div>
                    <div className="meta">JUL 8 · TUE 03:15 · 14d</div>
                  </div>
                  <div className="price">
                    $589
                    <span className="lbl">Per adult</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div key={i} className="concierge-msg user">"{m.text}"</div>
          )
        ))}
      </div>
      <div className="concierge-prompts">
        {prompts.map(p => (
          <div className="p" key={p} onClick={() => send(p)}>{p}</div>
        ))}
      </div>
      <div className="concierge-input">
        <input
          placeholder="Ask anything — routes, dates, alerts…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send(input)}
        />
        <button className="send" onClick={() => send(input)}>SEND</button>
      </div>
    </div>
  );
}

/* ============================================================
   Header
   ============================================================ */
function TopBar() {
  const [active, setActive] = useState('dashboard');
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const i = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(i);
  }, []);
  const nav = [
    ['dashboard', 'Dashboard'],
    ['explore', 'Explore'],
    ['watchlist', 'Watchlist'],
    ['alerts', 'Alerts'],
    ['concierge', 'Concierge'],
  ];
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">
          {/* Stylized FC monogram */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M5 5 L5 19 M5 5 L14 5 M5 12 L11 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M22 8 A6 6 0 0 0 16 8 A6 6 0 0 0 22 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />
          </svg>
        </div>
        <div>
          <div className="brand-name">
            FlyCheap <em>Tracker</em>
          </div>
          <div className="brand-meta">Fare Intelligence · v2.4</div>
        </div>
      </div>
      <nav>
        {nav.map(([k, label]) => (
          <a key={k} className={active === k ? 'active' : ''} onClick={() => setActive(k)}>
            {label}
          </a>
        ))}
      </nav>
      <div className="topbar-right">
        <div className="market-clock">
          <span className="dot" />
          POLLING · {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })} UTC
        </div>
        <div className="user-chip">
          <div className="avatar">OM</div>
          Omar
        </div>
      </div>
    </header>
  );
}

/* ============================================================
   Hero
   ============================================================ */
function Hero({ showTicker, globeAccent }) {
  return (
    <section className="hero" data-screen-label="Hero">
      <div className="hero-grid">
        <div>
          <div className="eyebrow">Executive Brief · Week of May 13</div>
          <h1>
            We've found <em>7</em> sub-$700 round-trips&nbsp;
            <span className="strike">your travel agent</span>&nbsp;
            <em>missed</em>.
          </h1>
          <p className="hero-lede">
            FlyCheap watches 700+ airlines around the clock — and tells you the moment a fare on your route drops below threshold. No more refreshing Google Flights at 2 AM.
          </p>
          <div className="hero-cta">
            <button className="btn btn-gold">Book cheapest → $589</button>
            <button className="btn btn-ghost">Add a new watch</button>
          </div>
          <div className="hero-stats">
            <div>
              <div className="hero-stat-label">Cheapest right now</div>
              <div className="hero-stat-value">$589<span className="delta delta-down">▼ $112</span></div>
            </div>
            <div>
              <div className="hero-stat-label">90-day median</div>
              <div className="hero-stat-value">$734<span className="delta delta-flat">±$8</span></div>
            </div>
            <div>
              <div className="hero-stat-label">Below your floor</div>
              <div className="hero-stat-value">7<span className="delta delta-down">▲ 3</span></div>
            </div>
          </div>
        </div>
        <div className="hero-globe">
          <div className="globe-frame">
            <span className="corner tl" /><span className="corner tr" />
            <span className="corner bl" /><span className="corner br" />
          </div>
          <div className="globe-tag tl">LIVE NETWORK · 87 ROUTES</div>
          <div className="globe-tag br">2 ACTIVE ARCS · CAI</div>
          <Globe accentColor={globeAccent} />
        </div>
      </div>
      {showTicker && <HeroTicker />}
    </section>
  );
}

/* ============================================================
   App
   ============================================================ */
function App() {
  const [t, setTweak] = useTweaks(FC_DEFAULTS);

  useEffect(() => {
    document.body.setAttribute('data-theme', t.theme);
    document.body.setAttribute('data-accent', t.accent);
  }, [t.theme, t.accent]);

  // Map accent name to color for globe arcs
  const accentColors = {
    gold: '#d4af37',
    emerald: '#1f8a5b',
    copper: '#c97444',
    violet: '#8964d7',
  };
  const globeAccent = accentColors[t.accent] || '#d4af37';

  return (
    <>
      <div className="app">
        <TopBar />
        <Hero showTicker={t.showTicker} globeAccent={globeAccent} />

        {/* KPI strip — overlaps the hero edge */}
        <div className="kpi-strip">
          <Kpi
            label="Tracked routes"
            value="12"
            sub="Active across 4 origins"
            trend={[3, 5, 4, 6, 8, 10, 12]}
          />
          <Kpi
            label="Total savings YTD"
            value="$4.8"
            unit="K USD"
            sub="vs. 90-day median"
            accent
            trend={[1.2, 1.8, 2.4, 2.9, 3.4, 4.1, 4.8]}
          />
          <Kpi
            label="Cheapest pairing"
            value="$589"
            unit="per adult"
            sub="EWR → CAI · Aug 12"
            trend={[820, 780, 720, 680, 650, 612, 589]}
            trendColor="#1f8a5b"
          />
          <Kpi
            label="Mistake fares (24h)"
            value="04"
            sub="3 still bookable"
            trend={[0, 1, 1, 2, 3, 3, 4]}
            trendColor="#d4af37"
          />
        </div>

        <div className="section">
          <div className="section-head">
            <div>
              <div className="smallcaps">12-month opportunity scan</div>
              <h2 className="section-title">Best deals & <em>live</em> feed</h2>
              <p className="section-sub">
                Every fare below your threshold, ranked by sweetspot timing (Tue/Sat 1–5 AM) — plus a live feed of every poll we run.
              </p>
            </div>
            <div className="section-actions">
              <button className="btn btn-light btn-sm">Refresh now</button>
              <button className="btn btn-ink btn-sm">Scan 12 months →</button>
            </div>
          </div>
          <div className="main-split">
            <BestDealsCard />
            <LiveFeedCard />
          </div>
        </div>

        <div className="section">
          <MistakeFareRadar />
        </div>

        <div className="section">
          <div className="section-head">
            <div>
              <div className="smallcaps">Pattern + Calendar + Footprint</div>
              <h2 className="section-title">Route <em>intelligence</em></h2>
              <p className="section-sub">
                The pattern card tells you when this route is cheapest. The calendar shows every cheap window. The carbon ledger keeps the trip honest.
              </p>
            </div>
          </div>
          <div className="three-up">
            <RouteDnaCard />
            <FareCalendarCard />
            <CarbonCard />
          </div>
        </div>

        {/* Footer */}
        <footer style={{ marginTop: 64, paddingTop: 28, borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--muted)' }}>
          <div className="mono" style={{ letterSpacing: '.08em' }}>
            FlyCheap Tracker · Polling every 30 min · 700+ airlines · v2.4 · build 4892
          </div>
          <div style={{ display: 'flex', gap: 18 }}>
            <a className="mono" style={{ color: 'inherit', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>API</a>
            <a className="mono" style={{ color: 'inherit', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>Status</a>
            <a className="mono" style={{ color: 'inherit', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>Privacy</a>
          </div>
        </footer>
      </div>

      {t.showConcierge && <Concierge />}

      <TweaksPanel title="FlyCheap Tweaks">
        <TweakSection label="Theme">
          <TweakRadio
            label="Background"
            value={t.theme}
            onChange={v => setTweak('theme', v)}
            options={[
              { value: 'ivory', label: 'Ivory' },
              { value: 'paper', label: 'Paper' },
              { value: 'charcoal', label: 'Coal' },
            ]}
          />
          <TweakSelect
            label="Accent color"
            value={t.accent}
            onChange={v => setTweak('accent', v)}
            options={[
              { value: 'gold', label: 'Gold (default)' },
              { value: 'emerald', label: 'Emerald' },
              { value: 'copper', label: 'Copper' },
              { value: 'violet', label: 'Violet' },
            ]}
          />
        </TweakSection>
        <TweakSection label="Surfaces">
          <TweakToggle label="Ticker tape under hero" value={t.showTicker} onChange={v => setTweak('showTicker', v)} />
          <TweakToggle label="Show AI concierge" value={t.showConcierge} onChange={v => setTweak('showConcierge', v)} />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
