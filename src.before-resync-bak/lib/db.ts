import 'server-only';
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const DATA_DIR = path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, 'fares.db');

declare global {
  var __egyptairDb: Database.Database | undefined;
}

function init(db: Database.Database) {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS searches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL DEFAULT 'CAI',
      depart_date TEXT NOT NULL,
      return_date TEXT NOT NULL,
      adults INTEGER NOT NULL DEFAULT 4,
      infants INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS fare_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      search_id INTEGER NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
      polled_at TEXT NOT NULL DEFAULT (datetime('now')),
      total_price_usd REAL NOT NULL,
      base_price_usd REAL NOT NULL,
      taxes_fees_usd REAL NOT NULL,
      price_per_adult_usd REAL NOT NULL,
      outbound_flight_no TEXT,
      return_flight_no TEXT,
      outbound_depart_iso TEXT,
      return_depart_iso TEXT,
      raw_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_fare_search_time ON fare_snapshots(search_id, polled_at);

    CREATE TABLE IF NOT EXISTS alerts_sent (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      search_id INTEGER NOT NULL,
      fare_snapshot_id INTEGER NOT NULL,
      price_per_adult_usd REAL NOT NULL,
      sent_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    -- Idempotent column add for the mistake-fare alert kind.
    -- 'threshold' | 'price-drop' | 'mistake-fare'
    -- (Older rows had no kind; treated as 'threshold'.)

    CREATE TABLE IF NOT EXISTS api_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      search_id INTEGER,
      called_at TEXT NOT NULL DEFAULT (datetime('now')),
      ok INTEGER NOT NULL,
      status_code INTEGER,
      ms INTEGER,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_api_calls_time ON api_calls(called_at);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Server-side error log: lets us debug without ssh + tail
    CREATE TABLE IF NOT EXISTS error_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
      level TEXT NOT NULL DEFAULT 'error',  -- info | warn | error
      source TEXT,                           -- e.g. 'poller', 'notifier', 'stripe-webhook'
      message TEXT NOT NULL,
      stack TEXT,
      user_id INTEGER,
      context TEXT                           -- JSON blob with extra fields
    );
    CREATE INDEX IF NOT EXISTS idx_error_log_time ON error_log(occurred_at);

    -- Multi-tenant: users + sessions + per-user settings
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      tier TEXT NOT NULL DEFAULT 'free',         -- free | pro | enterprise
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      subscription_status TEXT,                  -- active | trialing | past_due | canceled
      subscription_renews_at TEXT,
      brand_color TEXT,                          -- hex like #0a3a6b (white-label)
      logo_url TEXT,
      sender_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS magic_links (
      token TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (user_id, key)
    );

    -- Per-user route intelligence — written nightly by the "route-intel" job.
    -- stats_json is the deterministic pattern detection (DOW mode, cheap
    -- months, sweet-spot trip length, percentile bands, top route summaries).
    -- prose is an LLM-generated short narrative for the dashboard card.
    -- One row per user; updated in place.
    CREATE TABLE IF NOT EXISTS user_route_intel (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      generated_at TEXT NOT NULL DEFAULT (datetime('now')),
      polls_observed INTEGER NOT NULL DEFAULT 0,
      stats_json TEXT NOT NULL DEFAULT '{}',
      prose TEXT,
      model TEXT
    );

    CREATE TABLE IF NOT EXISTS rate_limits (
      bucket TEXT NOT NULL,
      key TEXT NOT NULL,
      occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup ON rate_limits(bucket, key, occurred_at);

    -- Job locks: prevent the in-process node-cron AND the systemd timer
    -- from firing the same job concurrently during a deploy window. Each
    -- job acquires the lock atomically (INSERT OR FAIL on UNIQUE(name))
    -- and releases on completion or after a stale window.
    CREATE TABLE IF NOT EXISTS job_locks (
      name TEXT PRIMARY KEY,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      holder TEXT
    );
    -- Speeds up "snapshots in last N days" scans used by digest + anomaly + dashboard.
    CREATE INDEX IF NOT EXISTS idx_fare_polled ON fare_snapshots(polled_at);

    CREATE TABLE IF NOT EXISTS best_deals_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      refreshed_at TEXT NOT NULL DEFAULT (datetime('now')),
      origin TEXT NOT NULL,
      -- destination IATA. Defaults to 'CAI' for back-compat with rows that
      -- predate the multi-destination cache migration.
      destination TEXT NOT NULL DEFAULT 'CAI',
      outbound_date TEXT NOT NULL,
      return_date TEXT NOT NULL,
      outbound_flight_no TEXT NOT NULL,
      return_flight_no TEXT NOT NULL,
      outbound_transfers INTEGER NOT NULL DEFAULT 0,
      return_transfers INTEGER NOT NULL DEFAULT 0,
      outbound_dow INTEGER NOT NULL DEFAULT 0,
      outbound_hour INTEGER NOT NULL DEFAULT 0,
      return_dow INTEGER NOT NULL DEFAULT 0,
      return_hour INTEGER NOT NULL DEFAULT 0,
      per_adult_usd REAL NOT NULL,
      party_total_usd REAL NOT NULL,
      trip_length_days INTEGER NOT NULL,
      provider TEXT NOT NULL DEFAULT 'travelpayouts',
      rank INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS webhook_events (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      received_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Provider API keys stored DB-side. The /api/providers/keys route writes
    -- here AND mirrors into process.env so every existing process.env read
    -- in src/lib/providers/* keeps working without per-call DB hits.
    CREATE TABLE IF NOT EXISTS provider_keys (
      name TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Durable history of every standalone-runner job execution. Populated by
    -- scripts/run-job.mjs (or any future external worker). Lets /admin show
    -- last-run + duration + exit code without parsing journald.
    CREATE TABLE IF NOT EXISTS job_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job TEXT NOT NULL,            -- 'poll' | 'digest' | 'weekly' | 'best-deals' | 'compact' | 'commissions'
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT,
      ok INTEGER,                    -- 0/1 — null while in-flight
      duration_ms INTEGER,
      message TEXT                   -- 1-line summary (count, error, etc.)
    );
    CREATE INDEX IF NOT EXISTS idx_job_runs_job_time ON job_runs(job, started_at);

    -- Audit log: every mutating admin/owner action records who did what.
    -- Surface on /admin → audit.
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
      user_id INTEGER,
      email TEXT,
      action TEXT NOT NULL,        -- e.g. 'search.delete', 'settings.update', 'provider.key.set'
      entity TEXT,                  -- target id, e.g. 'search:15' or 'setting:alert_email'
      detail TEXT,                  -- JSON blob; old/new values, ids touched, etc.
      ip TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_audit_log_time ON audit_log(occurred_at);
    CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id, occurred_at);

    -- Affiliate revenue tracking: every outbound "Book" click is rewritten
    -- through /go/:token which records the click here, then 302s to the OTA.
    -- commission_events lands when the affiliate program postbacks (or you
    -- import the monthly CSV).
    CREATE TABLE IF NOT EXISTS affiliate_clicks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      user_id INTEGER,
      search_id INTEGER,
      origin TEXT, destination TEXT,
      depart_date TEXT, return_date TEXT,
      per_adult_usd REAL,
      provider TEXT,
      marker TEXT,                 -- partner-specific tracking id
      ip TEXT, user_agent TEXT,
      occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_aff_clicks_user ON affiliate_clicks(user_id, occurred_at);

    CREATE TABLE IF NOT EXISTS commission_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      click_token TEXT,
      partner TEXT NOT NULL,        -- 'travelpayouts' | 'aviasales' | 'kiwi' | ...
      amount_usd REAL NOT NULL,
      booking_id TEXT,
      received_at TEXT NOT NULL DEFAULT (datetime('now')),
      raw_json TEXT
    );
    -- Idempotency: the daily pullCommissions cron fetches a rolling 30-day
    -- window from Travelpayouts, so the same row would be re-inserted up to
    -- 30 times. UNIQUE(partner, booking_id) + INSERT OR IGNORE in the
    -- insertCommission path keeps revenue numbers honest.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_events_dedupe
      ON commission_events(partner, booking_id)
      WHERE booking_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_commission_events_received
      ON commission_events(received_at);

    -- Custom-domain verification trail. The Caddy on-demand-TLS validator
    -- hits /api/me/domain to confirm the hostname is on a verified user.
    CREATE TABLE IF NOT EXISTS custom_domains (
      hostname TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Idempotent column adds for newer features.
  const userCols = db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>;
  if (!userCols.some(c => c.name === 'custom_domain')) {
    db.exec(`ALTER TABLE users ADD COLUMN custom_domain TEXT`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_custom_domain ON users(custom_domain) WHERE custom_domain IS NOT NULL`);
  }
  const cols = db.prepare(`PRAGMA table_info(searches)`).all() as Array<{ name: string }>;
  if (!cols.some(c => c.name === 'snoozed_until')) {
    db.exec(`ALTER TABLE searches ADD COLUMN snoozed_until TEXT`);
  }
  if (!cols.some(c => c.name === 'user_id')) {
    db.exec(`ALTER TABLE searches ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_searches_user ON searches(user_id)`);
  }
  const fareCols = db.prepare(`PRAGMA table_info(fare_snapshots)`).all() as Array<{ name: string }>;
  if (!fareCols.some(c => c.name === 'provider')) {
    db.exec(`ALTER TABLE fare_snapshots ADD COLUMN provider TEXT NOT NULL DEFAULT 'travelpayouts'`);
  }
  const alertCols = db.prepare(`PRAGMA table_info(alerts_sent)`).all() as Array<{ name: string }>;
  if (!alertCols.some(c => c.name === 'kind')) {
    db.exec(`ALTER TABLE alerts_sent ADD COLUMN kind TEXT NOT NULL DEFAULT 'threshold'`);
  }
  const searchCols = db.prepare(`PRAGMA table_info(searches)`).all() as Array<{ name: string }>;
  if (!searchCols.some(c => c.name === 'sort_order')) {
    db.exec(`ALTER TABLE searches ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`);
  }
  const aClickCols = db.prepare(`PRAGMA table_info(affiliate_clicks)`).all() as Array<{ name: string }>;
  if (!aClickCols.some(c => c.name === 'surface')) {
    db.exec(`ALTER TABLE affiliate_clicks ADD COLUMN surface TEXT`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_aff_clicks_surface ON affiliate_clicks(surface, occurred_at)`);
  }
  if (!aClickCols.some(c => c.name === 'route_id')) {
    db.exec(`ALTER TABLE affiliate_clicks ADD COLUMN route_id TEXT`);
  }
  // Indexes for /admin/revenue aggregations. Without these, the 90-day
  // daily timeseries does a full table scan per day (very slow once volume
  // grows). Per-provider/per-route GROUP BY queries also need an index.
  db.exec(`CREATE INDEX IF NOT EXISTS idx_aff_clicks_time     ON affiliate_clicks(occurred_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_aff_clicks_provider ON affiliate_clicks(provider, occurred_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_aff_clicks_route    ON affiliate_clicks(route_id, occurred_at)`);
  const searchCols2 = db.prepare(`PRAGMA table_info(searches)`).all() as Array<{ name: string }>;
  if (!searchCols2.some(c => c.name === 'origins')) {
    // Multi-origin fanout: comma-separated IATA codes. NULL/empty means just
    // use the legacy single `origin` column (back-compat).
    db.exec(`ALTER TABLE searches ADD COLUMN origins TEXT`);
  }

  // Multi-destination best-deals cache. Older deployments stored one
  // destination at a time (controlled by best_deals_destination setting).
  // Now each cached row tags itself with the destination so we can cache
  // every tracked route in parallel.
  const bdCols = db.prepare(`PRAGMA table_info(best_deals_cache)`).all() as Array<{ name: string }>;
  if (!bdCols.some(c => c.name === 'destination')) {
    db.exec(`ALTER TABLE best_deals_cache ADD COLUMN destination TEXT NOT NULL DEFAULT 'CAI'`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_best_deals_dest ON best_deals_cache(destination, rank)`);
  }

  // Seed the legacy single-user account so existing data (user_id=1 by default)
  // continues to belong to someone after the migration. Idempotent.
  db.prepare(
    `INSERT OR IGNORE INTO users (id, email, name, tier) VALUES (1, ?, 'Owner', 'enterprise')`
  ).run(process.env.ALERT_EMAIL || 'owner@example.com');

  const seed = db.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)');
  seed.run('alert_threshold_per_adult_usd', '900');
  seed.run('alert_email', process.env.ALERT_EMAIL || 'owner@example.com');
  seed.run('poll_interval_minutes', process.env.POLL_INTERVAL_MINUTES || '30');
  seed.run('max_display_per_adult_usd', '1300');
  seed.run('usd_to_egp', '49.5');
  seed.run('enabled_providers', 'travelpayouts');
}

export function getDb(): Database.Database {
  if (!globalThis.__egyptairDb) {
    const db = new Database(dbPath);
    init(db);
    globalThis.__egyptairDb = db;
    // Hydrate provider keys from DB into process.env so all existing
    // `process.env.X` reads in src/lib/providers/* pick them up. DB beats
    // env on conflict — the admin UI is the source of truth.
    try {
      const rows = db.prepare(`SELECT name, value FROM provider_keys`).all() as Array<{ name: string; value: string }>;
      for (const r of rows) if (r.value) process.env[r.name] = r.value;
    } catch { /* table might not exist on a very old DB — init() creates it */ }
  }
  return globalThis.__egyptairDb;
}

// ---------- typed helpers ----------

export type SearchRow = {
  id: number;
  origin: string;
  origins?: string | null;  // comma-sep IATA codes for multi-origin fanout
  destination: string;
  depart_date: string;
  return_date: string;
  adults: number;
  infants: number;
  active: number;
  created_at: string;
  snoozed_until: string | null;
  user_id: number;
};

export type FareRow = {
  id: number;
  search_id: number;
  polled_at: string;
  total_price_usd: number;
  base_price_usd: number;
  taxes_fees_usd: number;
  price_per_adult_usd: number;
  outbound_flight_no: string | null;
  return_flight_no: string | null;
  outbound_depart_iso: string | null;
  return_depart_iso: string | null;
  raw_json: string | null;
  provider: string;
};

// Per-tier limits enforced at the application layer.
export const TIER_LIMITS: Record<string, { maxRoutes: number; pollIntervalMin: number; channels: string[] }> = {
  free:        { maxRoutes: 5,    pollIntervalMin: 30, channels: ['email'] },
  pro:         { maxRoutes: 100,  pollIntervalMin: 5,  channels: ['email','sms','whatsapp','telegram'] },
  enterprise:  { maxRoutes: 9999, pollIntervalMin: 1,  channels: ['email','sms','whatsapp','telegram'] },
};

export type UserRow = {
  id: number;
  email: string;
  name: string | null;
  tier: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  subscription_renews_at: string | null;
  brand_color: string | null;
  logo_url: string | null;
  sender_email: string | null;
  created_at: string;
};

export const queries = {
  // -------- Users --------
  getUserById:    (id: number) => getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined,
  getUserByEmail: (email: string) => getDb().prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined,
  upsertUserByEmail: (email: string, name?: string) => {
    const existing = queries.getUserByEmail(email);
    if (existing) return existing;
    const r = getDb().prepare(`INSERT INTO users (email, name, tier) VALUES (?, ?, 'free')`).run(email, name ?? null);
    return queries.getUserById(Number(r.lastInsertRowid))!;
  },
  listAllUsers: () =>
    getDb().prepare(
      `SELECT u.id, u.email, u.name, u.tier, u.subscription_status, u.subscription_renews_at,
              u.created_at, u.custom_domain,
              (SELECT COUNT(*) FROM searches s WHERE s.user_id = u.id) AS total_searches,
              (SELECT COUNT(*) FROM searches s WHERE s.user_id = u.id AND s.active = 1) AS active_searches,
              (SELECT MAX(occurred_at) FROM audit_log a WHERE a.user_id = u.id) AS last_action_at,
              (SELECT COUNT(*) FROM sessions ss WHERE ss.user_id = u.id AND ss.expires_at > datetime('now')) AS live_sessions
       FROM users u
       ORDER BY u.created_at DESC`
    ).all() as Array<{
      id: number; email: string; name: string | null; tier: string;
      subscription_status: string | null; subscription_renews_at: string | null;
      created_at: string; custom_domain: string | null;
      total_searches: number; active_searches: number;
      last_action_at: string | null; live_sessions: number;
    }>,

  deleteUserCascade: (id: number) => {
    const db = getDb();
    const tx = db.transaction(() => {
      // FK ON DELETE CASCADE handles searches, sessions, user_settings; alerts_sent
      // references searches and follows. Audit log keeps the row but nulls user_id.
      db.prepare(`UPDATE audit_log SET user_id = NULL WHERE user_id = ?`).run(id);
      db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
    });
    tx();
  },

  // -------- Admin: active sessions --------
  listActiveSessions: () =>
    getDb().prepare(
      `SELECT s.token, s.user_id, s.created_at, s.expires_at,
              u.email, u.name, u.tier,
              (SELECT MAX(a.occurred_at) FROM audit_log a WHERE a.user_id = s.user_id) AS last_action_at,
              (SELECT a.ip FROM audit_log a WHERE a.user_id = s.user_id ORDER BY a.occurred_at DESC LIMIT 1) AS last_ip
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.expires_at > datetime('now')
       ORDER BY last_action_at DESC NULLS LAST, s.created_at DESC`
    ).all() as Array<{
      token: string; user_id: number; created_at: string; expires_at: string;
      email: string; name: string | null; tier: string;
      last_action_at: string | null; last_ip: string | null;
    }>,

  revokeSession: (token: string) =>
    getDb().prepare(`DELETE FROM sessions WHERE token = ?`).run(token),

  revokeAllSessionsForUser: (userId: number) =>
    getDb().prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId),

  // -------- Admin: contact inbox --------
  contactMessages: (limit = 100) =>
    getDb().prepare(
      `SELECT id, occurred_at, user_id, email, detail, ip
       FROM audit_log
       WHERE action = 'contact.message'
       ORDER BY occurred_at DESC LIMIT ?`
    ).all(limit) as Array<{ id: number; occurred_at: string; user_id: number | null; email: string | null; detail: string | null; ip: string | null }>,

  // -------- Admin: top tracked routes --------
  topTrackedRoutes: (limit = 20) =>
    getDb().prepare(
      `SELECT origin, destination,
              COUNT(*) AS total,
              SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS active_count,
              COUNT(DISTINCT user_id) AS users
       FROM searches
       GROUP BY origin, destination
       ORDER BY active_count DESC, total DESC
       LIMIT ?`
    ).all(limit) as Array<{ origin: string; destination: string; total: number; active_count: number; users: number }>,

  // -------- Admin: job runner history --------
  insertJobRun: (job: string): number => {
    const r = getDb().prepare(`INSERT INTO job_runs (job) VALUES (?)`).run(job);
    return Number(r.lastInsertRowid);
  },
  finishJobRun: (id: number, ok: boolean, durationMs: number, message: string | null) =>
    getDb().prepare(
      `UPDATE job_runs SET finished_at = datetime('now'), ok = ?, duration_ms = ?, message = ?
       WHERE id = ?`
    ).run(ok ? 1 : 0, durationMs, message, id),

  jobRunsSummary: () =>
    getDb().prepare(
      `WITH last_per_job AS (
         SELECT job, MAX(started_at) AS last_started
         FROM job_runs GROUP BY job
       ),
       last_24h AS (
         SELECT job,
                SUM(CASE WHEN ok = 1 THEN 1 ELSE 0 END) AS ok_24h,
                SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS err_24h,
                AVG(duration_ms) AS avg_ms
         FROM job_runs
         WHERE started_at > datetime('now', '-1 day')
         GROUP BY job
       )
       SELECT j.id, j.job, j.started_at, j.finished_at, j.ok, j.duration_ms, j.message,
              IFNULL(h.ok_24h, 0) AS ok_24h, IFNULL(h.err_24h, 0) AS err_24h,
              CAST(IFNULL(h.avg_ms, 0) AS INTEGER) AS avg_ms
       FROM job_runs j
       JOIN last_per_job lp ON lp.job = j.job AND lp.last_started = j.started_at
       LEFT JOIN last_24h h ON h.job = j.job
       ORDER BY j.started_at DESC`
    ).all() as Array<{
      id: number; job: string; started_at: string; finished_at: string | null;
      ok: number | null; duration_ms: number | null; message: string | null;
      ok_24h: number; err_24h: number; avg_ms: number;
    }>,

  signupsByDay: (days = 30) =>
    getDb().prepare(
      `SELECT strftime('%Y-%m-%d', created_at) AS day, COUNT(*) AS n
       FROM users
       WHERE created_at >= datetime('now', ?)
       GROUP BY day
       ORDER BY day ASC`
    ).all(`-${days} days`) as Array<{ day: string; n: number }>,

  setUserTier: (id: number, tier: string, status?: string, renewsAt?: string | null) =>
    getDb().prepare(
      `UPDATE users SET tier = ?, subscription_status = ?, subscription_renews_at = ? WHERE id = ?`
    ).run(tier, status ?? null, renewsAt ?? null, id),
  setUserStripe: (id: number, customerId: string, subscriptionId?: string | null) =>
    getDb().prepare(`UPDATE users SET stripe_customer_id = ?, stripe_subscription_id = ? WHERE id = ?`)
      .run(customerId, subscriptionId ?? null, id),
  setUserBranding: (id: number, b: { brand_color?: string | null; logo_url?: string | null; sender_email?: string | null }) =>
    getDb().prepare(`UPDATE users SET brand_color = ?, logo_url = ?, sender_email = ? WHERE id = ?`)
      .run(b.brand_color ?? null, b.logo_url ?? null, b.sender_email ?? null, id),
  countActiveSearchesForUser: (userId: number) =>
    (getDb().prepare(`SELECT COUNT(*) as n FROM searches WHERE user_id = ? AND active = 1`).get(userId) as { n: number }).n,

  getUserByCustomDomain: (host: string) =>
    getDb().prepare(`SELECT * FROM users WHERE custom_domain = ?`).get(host) as UserRow | undefined,
  setUserCustomDomain: (id: number, domain: string | null) =>
    getDb().prepare(`UPDATE users SET custom_domain = ? WHERE id = ?`).run(domain, id),

  // -------- Error log --------
  logError: (params: { level?: 'info' | 'warn' | 'error'; source?: string; message: string; stack?: string; userId?: number; context?: object }) =>
    getDb().prepare(
      `INSERT INTO error_log (level, source, message, stack, user_id, context) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      params.level ?? 'error',
      params.source ?? null,
      params.message,
      params.stack ?? null,
      params.userId ?? null,
      params.context ? JSON.stringify(params.context) : null
    ),
  recentErrors: (limit = 100) =>
    getDb().prepare(`SELECT * FROM error_log ORDER BY occurred_at DESC LIMIT ?`).all(limit) as Array<{
      id: number; occurred_at: string; level: string; source: string | null;
      message: string; stack: string | null; user_id: number | null; context: string | null;
    }>,
  pruneErrorsOlderThan: (days: number) =>
    getDb().prepare(`DELETE FROM error_log WHERE occurred_at < datetime('now', ?)`).run(`-${days} days`),

  // -------- Admin analytics (MRR, signups, conversion) --------
  adminMetrics: () => {
    const db = getDb();
    const total      = (db.prepare(`SELECT COUNT(*) as n FROM users`).get() as { n: number }).n;
    const free       = (db.prepare(`SELECT COUNT(*) as n FROM users WHERE tier = 'free'`).get() as { n: number }).n;
    const pro        = (db.prepare(`SELECT COUNT(*) as n FROM users WHERE tier = 'pro'`).get() as { n: number }).n;
    const enterprise = (db.prepare(`SELECT COUNT(*) as n FROM users WHERE tier = 'enterprise'`).get() as { n: number }).n;
    const signupsLast7d  = (db.prepare(`SELECT COUNT(*) as n FROM users WHERE created_at >= datetime('now','-7 days')`).get() as { n: number }).n;
    const signupsLast30d = (db.prepare(`SELECT COUNT(*) as n FROM users WHERE created_at >= datetime('now','-30 days')`).get() as { n: number }).n;
    const activeSearches = (db.prepare(`SELECT COUNT(*) as n FROM searches WHERE active = 1`).get() as { n: number }).n;
    const alertsLast7d   = (db.prepare(`SELECT COUNT(*) as n FROM alerts_sent WHERE sent_at >= datetime('now','-7 days')`).get() as { n: number }).n;
    return {
      users: { total, free, pro, enterprise },
      signups: { last7d: signupsLast7d, last30d: signupsLast30d },
      mrr_usd: pro * 9 + enterprise * 49,           // assumed list prices
      conversion_pct: total ? Math.round(((pro + enterprise) / total) * 100) : 0,
      active_searches: activeSearches,
      alerts_sent_7d: alertsLast7d,
    };
  },

  // -------- Sessions / magic links --------
  insertSession: (token: string, userId: number, days = 30) =>
    getDb().prepare(
      `INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', ?))`
    ).run(token, userId, `+${days} days`),
  getSession: (token: string) =>
    getDb().prepare(`SELECT * FROM sessions WHERE token = ? AND expires_at > datetime('now')`).get(token) as
      | { token: string; user_id: number; created_at: string; expires_at: string } | undefined,
  deleteSession: (token: string) =>
    getDb().prepare(`DELETE FROM sessions WHERE token = ?`).run(token),
  insertMagicLink: (token: string, email: string, minutes = 15) =>
    getDb().prepare(
      `INSERT INTO magic_links (token, email, expires_at) VALUES (?, ?, datetime('now', ?))`
    ).run(token, email, `+${minutes} minutes`),
  consumeMagicLink: (token: string) => {
    // Atomic: only one caller can flip used_at NULL -> now() for a given token.
    // RETURNING is single-statement in SQLite WAL, so racing verifies cannot both succeed.
    const row = getDb().prepare(
      `UPDATE magic_links
          SET used_at = datetime('now')
        WHERE token = ?
          AND used_at IS NULL
          AND expires_at > datetime('now')
       RETURNING token, email, expires_at, used_at`
    ).get(token) as { token: string; email: string; expires_at: string; used_at: string | null } | undefined;
    return row ?? null;
  },

  // -------- Per-user settings (override the global settings table) --------
  getUserSetting: (userId: number, key: string): string | undefined => {
    const r = getDb().prepare(`SELECT value FROM user_settings WHERE user_id = ? AND key = ?`)
      .get(userId, key) as { value: string } | undefined;
    return r?.value;
  },
  setUserSetting: (userId: number, key: string, value: string) =>
    getDb().prepare(
      `INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?)
       ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`
    ).run(userId, key, value),
  deleteUserSetting: (userId: number, key: string) =>
    getDb().prepare(`DELETE FROM user_settings WHERE user_id = ? AND key = ?`).run(userId, key),

  // Rate limit: returns true if the new event was recorded, false if the caller is over budget.
  rateLimitCheck: (bucket: string, key: string, limit: number, windowSec: number): boolean => {
    const db = getDb();
    const row = db.prepare(
      `SELECT COUNT(*) AS n FROM rate_limits
        WHERE bucket = ? AND key = ?
          AND occurred_at > datetime('now', ?)`
    ).get(bucket, key, `-${windowSec} seconds`) as { n: number };
    if (row.n >= limit) return false;
    db.prepare(`INSERT INTO rate_limits (bucket, key) VALUES (?, ?)`).run(bucket, key);
    return true;
  },
  // Job lock primitives — see the job_locks table comment in init().
  //
  // tryAcquireJobLock returns true if the caller now holds the lock, false
  // if another holder has it (stale beyond maxAgeSec is auto-released).
  tryAcquireJobLock: (name: string, holder: string, maxAgeSec = 3600): boolean => {
    const db = getDb();
    // Drop any stale lock first so we don't deadlock on a crashed prior holder.
    db.prepare(
      `DELETE FROM job_locks WHERE name = ? AND started_at < datetime('now', ? || ' seconds')`
    ).run(name, `-${maxAgeSec}`);
    try {
      const r = db.prepare(
        `INSERT INTO job_locks (name, holder) VALUES (?, ?)`
      ).run(name, holder);
      return r.changes === 1;
    } catch {
      // UNIQUE constraint violation = someone else holds it
      return false;
    }
  },
  releaseJobLock: (name: string, holder: string) =>
    getDb().prepare(
      `DELETE FROM job_locks WHERE name = ? AND holder = ?`
    ).run(name, holder),

  rateLimitPrune: (maxAgeSec = 86400) =>
    getDb().prepare(`DELETE FROM rate_limits WHERE occurred_at < datetime('now', ?)`)
      .run(`-${maxAgeSec} seconds`),

  // Webhook idempotency: returns true if this event is new and should be
  // processed; false if it has already been recorded (replay → no-op).
  recordWebhookEvent: (id: string, source: string): boolean => {
    const r = getDb().prepare(
      `INSERT OR IGNORE INTO webhook_events (id, source) VALUES (?, ?)`
    ).run(id, source);
    return r.changes === 1;
  },

  // -------- SSE cursors --------
  maxSnapshotId: (): number | null => {
    const r = getDb().prepare(`SELECT MAX(id) AS m FROM fare_snapshots`).get() as { m: number | null };
    return r?.m ?? null;
  },
  maxAlertId: (): number | null => {
    const r = getDb().prepare(`SELECT MAX(id) AS m FROM alerts_sent`).get() as { m: number | null };
    return r?.m ?? null;
  },
  snapshotsAfterForUser: (cursor: number, userId: number, limit = 50) =>
    getDb().prepare(
      `SELECT f.id, f.search_id, s.origin, s.destination, f.price_per_adult_usd, f.total_price_usd, f.polled_at
       FROM fare_snapshots f
       JOIN searches s ON s.id = f.search_id
       WHERE f.id > ? AND s.user_id = ?
       ORDER BY f.id ASC LIMIT ?`
    ).all(cursor, userId, limit) as Array<{
      id: number; search_id: number; origin: string; destination: string;
      price_per_adult_usd: number; total_price_usd: number; polled_at: string;
    }>,
  alertsAfterForUser: (cursor: number, userId: number, limit = 50) =>
    getDb().prepare(
      `SELECT a.id, a.search_id, a.kind, a.price_per_adult_usd, a.sent_at,
              s.origin, s.destination
       FROM alerts_sent a
       JOIN searches s ON s.id = a.search_id
       WHERE a.id > ? AND s.user_id = ?
       ORDER BY a.id ASC LIMIT ?`
    ).all(cursor, userId, limit) as Array<{
      id: number; search_id: number; kind: string | null; price_per_adult_usd: number; sent_at: string;
      origin: string; destination: string;
    }>,

  // -------- Audit log --------
  insertAudit: (row: { user_id: number | null; email: string | null; action: string; entity?: string | null; detail?: unknown; ip?: string | null }) =>
    getDb().prepare(
      `INSERT INTO audit_log (user_id, email, action, entity, detail, ip)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      row.user_id ?? null,
      row.email ?? null,
      row.action,
      row.entity ?? null,
      row.detail === undefined ? null : JSON.stringify(row.detail),
      row.ip ?? null,
    ),

  // -------- Affiliate / commission --------
  insertAffiliateClick: (row: {
    token: string; user_id: number | null; search_id: number | null;
    origin: string | null; destination: string | null;
    depart_date: string | null; return_date: string | null;
    per_adult_usd: number | null; provider: string | null; marker: string | null;
    ip: string | null; user_agent: string | null;
    surface?: string | null; route_id?: string | null;
  }) => getDb().prepare(
    `INSERT INTO affiliate_clicks
      (token, user_id, search_id, origin, destination, depart_date, return_date,
       per_adult_usd, provider, marker, ip, user_agent, surface, route_id)
     VALUES (@token, @user_id, @search_id, @origin, @destination, @depart_date, @return_date,
             @per_adult_usd, @provider, @marker, @ip, @user_agent, @surface, @route_id)`
  ).run({ surface: null, route_id: null, ...row }),

  // Affiliate revenue dashboard aggregations (Phase 5).
  clicksByProvider30d: () =>
    getDb().prepare(
      `SELECT COALESCE(provider, 'unknown') AS provider, COUNT(*) AS clicks
         FROM affiliate_clicks
        WHERE occurred_at >= datetime('now','-30 days')
        GROUP BY provider
        ORDER BY clicks DESC`
    ).all() as Array<{ provider: string; clicks: number }>,
  clicksBySurface30d: () =>
    getDb().prepare(
      `SELECT COALESCE(surface, 'untagged') AS surface, COUNT(*) AS clicks
         FROM affiliate_clicks
        WHERE occurred_at >= datetime('now','-30 days')
        GROUP BY surface
        ORDER BY clicks DESC`
    ).all() as Array<{ surface: string; clicks: number }>,
  commissionsByPartner30d: () =>
    getDb().prepare(
      `SELECT partner, COUNT(*) AS bookings, COALESCE(SUM(amount_usd), 0) AS revenue_usd
         FROM commission_events
        WHERE received_at >= datetime('now','-30 days')
        GROUP BY partner
        ORDER BY revenue_usd DESC`
    ).all() as Array<{ partner: string; bookings: number; revenue_usd: number }>,
  dailyClicksAndRevenue90d: () =>
    // Rewritten from 180 correlated subqueries (one per day per table) to
    // two index-friendly aggregations + LEFT JOINs against a generated day
    // series. SQLite plans this as O(rows) per table rather than O(days × rows).
    getDb().prepare(
      `WITH RECURSIVE days(d) AS (
         SELECT date('now', '-89 days')
         UNION ALL SELECT date(d, '+1 day') FROM days WHERE d < date('now')
       ),
       click_agg AS (
         SELECT date(occurred_at) AS d, COUNT(*) AS n
           FROM affiliate_clicks
          WHERE occurred_at >= datetime('now','-90 days')
          GROUP BY date(occurred_at)
       ),
       rev_agg AS (
         SELECT date(received_at) AS d, COALESCE(SUM(amount_usd), 0) AS s
           FROM commission_events
          WHERE received_at >= datetime('now','-90 days')
          GROUP BY date(received_at)
       )
       SELECT days.d AS day,
              COALESCE(click_agg.n, 0) AS clicks,
              COALESCE(rev_agg.s, 0)   AS revenue_usd
         FROM days
         LEFT JOIN click_agg ON click_agg.d = days.d
         LEFT JOIN rev_agg   ON rev_agg.d   = days.d
        ORDER BY days.d ASC`
    ).all() as Array<{ day: string; clicks: number; revenue_usd: number }>,
  topRoutesByClicks30d: (limit = 10) =>
    getDb().prepare(
      `SELECT COALESCE(route_id, origin || '-' || destination) AS route,
              COUNT(*) AS clicks
         FROM affiliate_clicks
        WHERE occurred_at >= datetime('now','-30 days')
          AND (route_id IS NOT NULL OR (origin IS NOT NULL AND destination IS NOT NULL))
        GROUP BY route
        ORDER BY clicks DESC
        LIMIT ?`
    ).all(limit) as Array<{ route: string; clicks: number }>,

  recentAffiliateClicks: (limit = 50) =>
    getDb().prepare(
      `SELECT * FROM affiliate_clicks ORDER BY occurred_at DESC LIMIT ?`
    ).all(limit) as Array<{ id: number; token: string; user_id: number | null; search_id: number | null; origin: string | null; destination: string | null; per_adult_usd: number | null; provider: string | null; marker: string | null; occurred_at: string }>,

  monthlyAffiliateStats: () =>
    getDb().prepare(
      `SELECT
         COUNT(*)                                                 AS clicks_30d,
         (SELECT COUNT(*) FROM commission_events
            WHERE received_at >= datetime('now','-30 days'))       AS commissions_30d,
         (SELECT COALESCE(SUM(amount_usd),0) FROM commission_events
            WHERE received_at >= datetime('now','-30 days'))       AS revenue_30d
       FROM affiliate_clicks
       WHERE occurred_at >= datetime('now','-30 days')`
    ).get() as { clicks_30d: number; commissions_30d: number; revenue_30d: number },

  insertCommission: (row: { click_token: string | null; partner: string; amount_usd: number; booking_id: string | null; raw_json: unknown }) =>
    // INSERT OR IGNORE so re-runs of the daily Travelpayouts pull (which
    // returns the trailing 30 days every call) don't multiply revenue.
    // Relies on the partial UNIQUE INDEX on (partner, booking_id).
    getDb().prepare(
      `INSERT OR IGNORE INTO commission_events (click_token, partner, amount_usd, booking_id, raw_json)
       VALUES (?, ?, ?, ?, ?)`
    ).run(row.click_token, row.partner, row.amount_usd, row.booking_id, JSON.stringify(row.raw_json ?? null)),

  // -------- Custom domain --------
  upsertCustomDomain: (hostname: string, userId: number, verified: boolean) =>
    getDb().prepare(
      `INSERT INTO custom_domains (hostname, user_id, verified_at)
       VALUES (?, ?, CASE WHEN ? THEN datetime('now') ELSE NULL END)
       ON CONFLICT(hostname) DO UPDATE
       SET user_id = excluded.user_id,
           verified_at = CASE WHEN ? THEN datetime('now') ELSE custom_domains.verified_at END`
    ).run(hostname, userId, verified ? 1 : 0, verified ? 1 : 0),
  findUserByDomain: (hostname: string) =>
    getDb().prepare(`SELECT user_id, verified_at FROM custom_domains WHERE hostname = ?`)
      .get(hostname) as { user_id: number; verified_at: string | null } | undefined,
  deleteCustomDomain: (hostname: string) =>
    getDb().prepare(`DELETE FROM custom_domains WHERE hostname = ?`).run(hostname),

  recentAudit: (limit = 100) =>
    getDb().prepare(
      `SELECT id, occurred_at, user_id, email, action, entity, detail, ip
       FROM audit_log ORDER BY occurred_at DESC LIMIT ?`
    ).all(limit) as Array<{ id: number; occurred_at: string; user_id: number | null; email: string | null; action: string; entity: string | null; detail: string | null; ip: string | null }>,

  // -------- Provider keys (DB-backed, env-fallback) --------
  listProviderKeys: (): Array<{ name: string; value: string; updated_at: string }> =>
    getDb().prepare(`SELECT name, value, updated_at FROM provider_keys ORDER BY name`).all() as
      Array<{ name: string; value: string; updated_at: string }>,
  setProviderKey: (name: string, value: string) =>
    getDb().prepare(
      `INSERT INTO provider_keys (name, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(name) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    ).run(name, value),
  deleteProviderKey: (name: string) =>
    getDb().prepare(`DELETE FROM provider_keys WHERE name = ?`).run(name),
  findUserBySetting: (key: string, value: string): number | undefined => {
    const r = getDb().prepare(`SELECT user_id FROM user_settings WHERE key = ? AND value = ? LIMIT 1`)
      .get(key, value) as { user_id: number } | undefined;
    return r?.user_id;
  },

  // -------- Searches (legacy global helpers preserved for backwards compat) --------
  listSearches: () =>
    getDb().prepare('SELECT * FROM searches ORDER BY active DESC, created_at DESC').all() as SearchRow[],

  listSearchesForUser: (userId: number) =>
    getDb().prepare('SELECT * FROM searches WHERE user_id = ? ORDER BY active DESC, sort_order ASC, created_at DESC').all(userId) as SearchRow[],

  // -------- Per-user route intelligence (nightly job writes; dashboard reads) --------
  listAllUserIds: () =>
    (getDb().prepare('SELECT id FROM users').all() as Array<{ id: number }>).map(r => r.id),

  fareSnapshotsForUser: (userId: number, days = 60) =>
    getDb().prepare(
      `SELECT f.*, s.origin, s.destination, s.depart_date, s.return_date, s.adults
         FROM fare_snapshots f
         JOIN searches s ON s.id = f.search_id
        WHERE s.user_id = ?
          AND f.polled_at >= datetime('now', '-' || ? || ' day')
        ORDER BY f.polled_at DESC`
    ).all(userId, days) as Array<FareRow & { origin: string; destination: string; depart_date: string; return_date: string; adults: number }>,

  upsertUserRouteIntel: (userId: number, opts: { polls_observed: number; stats_json: string; prose: string | null; model: string | null }) => {
    getDb().prepare(
      `INSERT INTO user_route_intel (user_id, generated_at, polls_observed, stats_json, prose, model)
         VALUES (?, datetime('now'), ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           generated_at = excluded.generated_at,
           polls_observed = excluded.polls_observed,
           stats_json = excluded.stats_json,
           prose = excluded.prose,
           model = excluded.model`
    ).run(userId, opts.polls_observed, opts.stats_json, opts.prose, opts.model);
  },

  getUserRouteIntel: (userId: number) =>
    getDb().prepare('SELECT * FROM user_route_intel WHERE user_id = ?').get(userId) as
      { user_id: number; generated_at: string; polls_observed: number; stats_json: string; prose: string | null; model: string | null } | undefined,

  reorderSearches: (userId: number, orderedIds: number[]) => {
    const db = getDb();
    const upd = db.prepare(`UPDATE searches SET sort_order = ? WHERE id = ? AND user_id = ?`);
    db.transaction(() => {
      orderedIds.forEach((id, i) => upd.run(i, id, userId));
    })();
  },

  listActiveSearches: () =>
    getDb().prepare(
      `SELECT * FROM searches
       WHERE active = 1
         AND (snoozed_until IS NULL OR snoozed_until < datetime('now'))
       ORDER BY created_at`
    ).all() as SearchRow[],

  setSearchSnooze: (id: number, snoozedUntil: string | null) =>
    getDb().prepare('UPDATE searches SET snoozed_until = ? WHERE id = ?').run(snoozedUntil, id),
  setSearchOrigins: (id: number, origins: string | null) =>
    getDb().prepare('UPDATE searches SET origins = ? WHERE id = ?').run(origins, id),

  getSearch: (id: number) =>
    getDb().prepare('SELECT * FROM searches WHERE id = ?').get(id) as SearchRow | undefined,

  insertSearch: (s: Omit<SearchRow, 'id' | 'created_at' | 'active' | 'snoozed_until' | 'user_id'> & { active?: number; user_id?: number }) =>
    getDb().prepare(
      `INSERT INTO searches (origin, destination, depart_date, return_date, adults, infants, active, user_id)
       VALUES (@origin, @destination, @depart_date, @return_date, @adults, @infants, @active, @user_id)`
    ).run({ active: 1, user_id: 1, ...s }),

  setSearchActive: (id: number, active: 0 | 1) =>
    getDb().prepare('UPDATE searches SET active = ? WHERE id = ?').run(active, id),

  deleteSearch: (id: number) =>
    getDb().prepare('DELETE FROM searches WHERE id = ?').run(id),

  insertFare: (f: Omit<FareRow, 'id' | 'polled_at' | 'provider'> & { raw_json: string; provider?: string }) =>
    getDb().prepare(
      `INSERT INTO fare_snapshots
       (search_id, total_price_usd, base_price_usd, taxes_fees_usd, price_per_adult_usd,
        outbound_flight_no, return_flight_no, outbound_depart_iso, return_depart_iso, raw_json, provider)
       VALUES (@search_id, @total_price_usd, @base_price_usd, @taxes_fees_usd, @price_per_adult_usd,
        @outbound_flight_no, @return_flight_no, @outbound_depart_iso, @return_depart_iso, @raw_json, @provider)`
    ).run({ ...f, provider: f.provider ?? 'travelpayouts' }),

  latestFare: (searchId: number) =>
    getDb().prepare(
      'SELECT * FROM fare_snapshots WHERE search_id = ? ORDER BY polled_at DESC LIMIT 1'
    ).get(searchId) as FareRow | undefined,

  fareHistory: (searchId: number, days = 30) =>
    getDb().prepare(
      `SELECT * FROM fare_snapshots
       WHERE search_id = ? AND polled_at >= datetime('now', ?)
       ORDER BY polled_at`
    ).all(searchId, `-${days} days`) as FareRow[],

  insertAlert: (searchId: number, snapshotId: number, pricePerAdult: number, kind: 'threshold' | 'price-drop' | 'mistake-fare' = 'threshold') =>
    getDb().prepare(
      'INSERT INTO alerts_sent (search_id, fare_snapshot_id, price_per_adult_usd, kind) VALUES (?, ?, ?, ?)'
    ).run(searchId, snapshotId, pricePerAdult, kind),

  lastAlertForSearch: (searchId: number) =>
    getDb().prepare(
      'SELECT * FROM alerts_sent WHERE search_id = ? ORDER BY sent_at DESC LIMIT 1'
    ).get(searchId) as { id: number; price_per_adult_usd: number; sent_at: string; kind?: string } | undefined,

  // Cheapest cached deal for each (depart_date, return_date) pair within
  // ±windowDays of a target. Used by the flex-date heatmap on the dashboard.
  flexDateOptions: (origin: string, departDate: string, returnDate: string, windowDays = 3) => {
    const dStart = new Date(departDate); dStart.setUTCDate(dStart.getUTCDate() - windowDays);
    const dEnd   = new Date(departDate); dEnd.setUTCDate(dEnd.getUTCDate() + windowDays);
    const rStart = new Date(returnDate); rStart.setUTCDate(rStart.getUTCDate() - windowDays);
    const rEnd   = new Date(returnDate); rEnd.setUTCDate(rEnd.getUTCDate() + windowDays);
    return getDb().prepare(
      `SELECT outbound_date, return_date, MIN(per_adult_usd) AS per_adult_usd,
              MIN(party_total_usd) AS party_total_usd,
              MIN(outbound_flight_no) AS outbound_flight_no, MIN(return_flight_no) AS return_flight_no
       FROM best_deals_cache
       WHERE origin = ?
         AND outbound_date BETWEEN ? AND ?
         AND return_date  BETWEEN ? AND ?
       GROUP BY outbound_date, return_date
       ORDER BY per_adult_usd ASC`
    ).all(
      origin,
      dStart.toISOString().slice(0, 10), dEnd.toISOString().slice(0, 10),
      rStart.toISOString().slice(0, 10), rEnd.toISOString().slice(0, 10),
    ) as Array<{ outbound_date: string; return_date: string; per_adult_usd: number; party_total_usd: number; outbound_flight_no: string; return_flight_no: string }>;
  },

  // Mean + sample stddev of per-adult price for a given search over the last N days.
  // Used by the mistake-fare detector. Returns n=0 when there's no history yet.
  fareStats: (searchId: number, days = 30) => {
    const r = getDb().prepare(
      `SELECT
         COUNT(*)               AS n,
         AVG(price_per_adult_usd) AS mean,
         AVG(price_per_adult_usd * price_per_adult_usd) AS sqmean
       FROM fare_snapshots
       WHERE search_id = ?
         AND polled_at > datetime('now', ?)`
    ).get(searchId, `-${days} days`) as { n: number; mean: number | null; sqmean: number | null };
    const n = r.n ?? 0;
    if (n < 2 || r.mean == null || r.sqmean == null) return { n, mean: r.mean ?? 0, stddev: 0 };
    // population stddev → sample stddev via Bessel correction
    const variance = Math.max(0, (r.sqmean - r.mean * r.mean) * (n / (n - 1)));
    return { n, mean: r.mean, stddev: Math.sqrt(variance) };
  },

  lastAlertOfKind: (searchId: number, kind: string, withinHours = 24) =>
    getDb().prepare(
      `SELECT * FROM alerts_sent
       WHERE search_id = ? AND kind = ?
         AND sent_at > datetime('now', ?)
       ORDER BY sent_at DESC LIMIT 1`
    ).get(searchId, kind, `-${withinHours} hours`) as { id: number; sent_at: string } | undefined,

  // -------- Anomaly dashboard --------
  // Hourly OK / error counts for the last 24h. Hour bucket = floor(strftime, 'hour').
  providerHealthHourly: (hours = 24) => {
    return getDb().prepare(
      `SELECT
         strftime('%Y-%m-%d %H:00', called_at) AS hour,
         SUM(ok)                                AS ok_count,
         SUM(1 - ok)                            AS err_count,
         AVG(ms)                                AS avg_ms
       FROM api_calls
       WHERE called_at > datetime('now', ?)
       GROUP BY hour
       ORDER BY hour ASC`
    ).all(`-${hours} hours`) as Array<{ hour: string; ok_count: number; err_count: number; avg_ms: number | null }>;
  },

  // p50 / p95 latency by provider (we only have one provider column on snapshots,
  // not api_calls, so this folds across all api_calls — accurate enough for now).
  providerLatencyPercentiles: (hours = 24) => {
    // SQLite has no percentile_cont; compute in JS over a bounded sample.
    const rows = getDb().prepare(
      `SELECT ms FROM api_calls
       WHERE called_at > datetime('now', ?) AND ms IS NOT NULL
       ORDER BY ms ASC`
    ).all(`-${hours} hours`) as Array<{ ms: number }>;
    if (rows.length === 0) return { n: 0, p50: 0, p95: 0, p99: 0, max: 0 };
    const v = rows.map(r => r.ms);
    const pick = (q: number) => v[Math.min(v.length - 1, Math.floor(q * v.length))];
    return { n: v.length, p50: pick(0.5), p95: pick(0.95), p99: pick(0.99), max: v[v.length - 1] };
  },

  recentAlertsWithRoute: (limit = 50) =>
    getDb().prepare(
      `SELECT a.id, a.search_id, a.fare_snapshot_id, a.price_per_adult_usd, a.kind,
              a.sent_at, s.origin, s.destination, s.depart_date, s.return_date
       FROM alerts_sent a
       JOIN searches s ON s.id = a.search_id
       ORDER BY a.sent_at DESC
       LIMIT ?`
    ).all(limit) as Array<{
      id: number; search_id: number; fare_snapshot_id: number;
      price_per_adult_usd: number; kind: string | null; sent_at: string;
      origin: string; destination: string; depart_date: string; return_date: string;
    }>,

  errorMessageGroups: (hours = 168, limit = 20) =>
    getDb().prepare(
      `SELECT substr(message, 1, 80) AS prefix,
              level,
              source,
              COUNT(*) AS n,
              MAX(occurred_at) AS last_seen
       FROM error_log
       WHERE occurred_at > datetime('now', ?)
       GROUP BY prefix, level, source
       ORDER BY n DESC, last_seen DESC
       LIMIT ?`
    ).all(`-${hours} hours`, limit) as Array<{ prefix: string; level: string; source: string | null; n: number; last_seen: string }>,

  slowestPolls: (hours = 24, limit = 10) =>
    getDb().prepare(
      `SELECT a.id, a.search_id, a.called_at, a.ms, a.ok, a.status_code, a.error,
              s.origin, s.destination, s.depart_date
       FROM api_calls a
       LEFT JOIN searches s ON s.id = a.search_id
       WHERE a.called_at > datetime('now', ?)
         AND a.ms IS NOT NULL
       ORDER BY a.ms DESC
       LIMIT ?`
    ).all(`-${hours} hours`, limit) as Array<{
      id: number; search_id: number | null; called_at: string; ms: number; ok: number;
      status_code: number | null; error: string | null;
      origin: string | null; destination: string | null; depart_date: string | null;
    }>,

  recentAlerts: (limit = 20) =>
    getDb().prepare(
      `SELECT a.*, s.origin, s.destination, s.depart_date, s.return_date
       FROM alerts_sent a JOIN searches s ON s.id = a.search_id
       ORDER BY a.sent_at DESC LIMIT ?`
    ).all(limit) as Array<{
      id: number; search_id: number; fare_snapshot_id: number;
      price_per_adult_usd: number; sent_at: string;
      origin: string; destination: string; depart_date: string; return_date: string;
    }>,

  logApiCall: (params: { search_id: number | null; ok: boolean; status_code?: number; ms?: number; error?: string }) =>
    getDb().prepare(
      `INSERT INTO api_calls (search_id, ok, status_code, ms, error)
       VALUES (@search_id, @ok, @status_code, @ms, @error)`
    ).run({
      search_id: params.search_id,
      ok: params.ok ? 1 : 0,
      status_code: params.status_code ?? null,
      ms: params.ms ?? null,
      error: params.error ?? null,
    }),

  apiCallsThisMonth: () =>
    getDb().prepare(
      `SELECT COUNT(*) as count FROM api_calls
       WHERE called_at >= datetime('now', 'start of month')`
    ).get() as { count: number },

  apiCallsByMonthBySearch: () =>
    getDb().prepare(
      `SELECT s.id, s.origin, s.destination, s.depart_date, COUNT(c.id) as count
       FROM searches s LEFT JOIN api_calls c
         ON c.search_id = s.id AND c.called_at >= datetime('now', 'start of month')
       GROUP BY s.id ORDER BY count DESC`
    ).all() as Array<{ id: number; origin: string; destination: string; depart_date: string; count: number }>,

  getSetting: (key: string): string | undefined => {
    const r = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return r?.value;
  },

  setSetting: (key: string, value: string) =>
    getDb().prepare(
      `INSERT INTO settings(key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(key, value),

  /**
   * Compact fare_snapshots: for snapshots older than `keepDetailDays` days,
   * keep only the daily MIN per (search_id, day) and delete everything else.
   * Snapshots within the recent window are untouched so sparklines stay smooth.
   * Returns how many rows were deleted.
   */
  compactSnapshots: (keepDetailDays = 30): { deleted: number; kept: number; vacuumedKb: number } => {
    const db = getDb();
    const before = db.prepare(`SELECT COUNT(*) AS c FROM fare_snapshots`).get() as { c: number };

    db.exec('BEGIN');
    try {
      // Find IDs to keep: every snapshot from the last N days, plus the
      // single cheapest snapshot per (search_id, calendar day) for older rows.
      db.exec(`
        CREATE TEMP TABLE _keep_ids AS
        SELECT id FROM fare_snapshots
        WHERE polled_at >= datetime('now', '-${keepDetailDays} days')
        UNION
        SELECT id FROM (
          SELECT id, search_id, polled_at, price_per_adult_usd,
            ROW_NUMBER() OVER (
              PARTITION BY search_id, substr(polled_at, 1, 10)
              ORDER BY price_per_adult_usd ASC, polled_at ASC
            ) AS rn
          FROM fare_snapshots
          WHERE polled_at < datetime('now', '-${keepDetailDays} days')
        ) WHERE rn = 1;
      `);
      db.exec(`DELETE FROM fare_snapshots WHERE id NOT IN (SELECT id FROM _keep_ids);`);
      db.exec(`DROP TABLE _keep_ids;`);

      // Also age out api_calls > 180 days.
      db.exec(`DELETE FROM api_calls WHERE called_at < datetime('now', '-180 days');`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    const after = db.prepare(`SELECT COUNT(*) AS c FROM fare_snapshots`).get() as { c: number };
    const sizeBefore = db.pragma('page_count', { simple: true }) as number;
    db.exec('VACUUM');
    const sizeAfter = db.pragma('page_count', { simple: true }) as number;
    const pageSize = db.pragma('page_size', { simple: true }) as number;
    return {
      deleted: before.c - after.c,
      kept: after.c,
      vacuumedKb: Math.round(((sizeBefore - sizeAfter) * pageSize) / 1024),
    };
  },
};
