import 'server-only';
import Database from 'better-sqlite3';
import type { AlertKind } from './alertKind';
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
  db.pragma('busy_timeout = 5000');

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
    -- Covering expression index for the dashboard's daily-min history query:
    -- GROUP BY search_id, date(polled_at) resolves entirely from the index.
    CREATE INDEX IF NOT EXISTS idx_fare_search_day_price ON fare_snapshots(search_id, date(polled_at), price_per_adult_usd);

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
    CREATE INDEX IF NOT EXISTS idx_api_calls_search_time ON api_calls(search_id, called_at);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Server-side error log: lets us debug without ssh + tail
    DROP TABLE IF EXISTS admin_stepup;
    CREATE TABLE IF NOT EXISTS admin_agent_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_user_id INTEGER,
      tool TEXT NOT NULL,
      input TEXT,
      result_preview TEXT,
      ok INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_admin_agent_audit_time ON admin_agent_audit(id DESC);
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

    -- Expo push tokens registered by the FlyCheap mobile app (one row per device).
    CREATE TABLE IF NOT EXISTS push_devices (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      platform TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_push_devices_user ON push_devices(user_id);

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
    CREATE INDEX IF NOT EXISTS idx_best_deals_price_rank ON best_deals_cache(per_adult_usd, rank);

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

    -- Ops incidents: one row per distinct production problem the ops detector
    -- has seen (src/lib/ops/detector.ts). slack_ts is the #admin_alerts card
    -- whose thread is the conversation with the founder about it.
    CREATE TABLE IF NOT EXISTS ops_incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fingerprint TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL,          -- unit | job | err | health | crashloop
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',   -- open | fixing | needs_human | resolved
      slack_ts TEXT,
      first_seen TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen TEXT NOT NULL DEFAULT (datetime('now')),
      occurrences INTEGER NOT NULL DEFAULT 1,
      last_action TEXT,
      last_restart_at TEXT,
      last_deploy_at TEXT,
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ops_incidents_status ON ops_incidents(status);
    CREATE INDEX IF NOT EXISTS idx_ops_incidents_thread ON ops_incidents(slack_ts);

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

    -- AI agent layer (phase 1). One row per agent invocation; durable audit so
    -- the admin can see what each agent did, how long it took, and any error.
    CREATE TABLE IF NOT EXISTS agent_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent TEXT NOT NULL,                       -- 'curator' | 'verifier' | 'insights'
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT,
      ok INTEGER,                                -- 1 success, 0 failure, NULL running
      model TEXT,
      dry_run INTEGER NOT NULL DEFAULT 1,
      duration_ms INTEGER,
      summary TEXT,                              -- human-readable one-liner for admin
      output_json TEXT,                          -- full structured output for inspection
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs(agent, started_at DESC);

    -- Deals the curator selected + blurbed in a given run. Broadcasting (Slack/
    -- Telegram/social) happens in later phases; in DRY_RUN these are saved only.
    CREATE TABLE IF NOT EXISTS curated_picks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      outbound_date TEXT NOT NULL,
      return_date TEXT NOT NULL,
      per_adult_usd REAL NOT NULL,
      party_total_usd REAL,
      trip_length_days INTEGER,
      headline TEXT NOT NULL,                    -- curator's punchy one-liner
      blurb TEXT NOT NULL,                       -- 1-2 sentence why-it's-a-deal
      score REAL,                                -- curator's 0-100 deal score
      verified INTEGER NOT NULL DEFAULT 0,       -- deal-verifier verdict
      verify_note TEXT,
      broadcast INTEGER NOT NULL DEFAULT 0       -- set when actually posted (phase 2+)
    );
    CREATE INDEX IF NOT EXISTS idx_curated_picks_run ON curated_picks(run_id, score DESC);

    -- Social broadcast queue (phase 2). The social-poster agent writes 'queued'
    -- rows; the operator approves in /admin/queue; a future drain posts them.
    -- UNIQUE(pick_id, channel) makes re-queueing idempotent so the 6h curator/
    -- poster cadence never duplicates a post for the same pick+channel.
    CREATE TABLE IF NOT EXISTS social_post_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pick_id INTEGER NOT NULL,
      channel TEXT NOT NULL,                     -- 'x' | 'telegram'
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',     -- queued|approved|posted|failed|skipped
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      approved_at TEXT,
      posted_at TEXT,
      scheduled_for TEXT,
      verifier_flag TEXT,
      error TEXT,
      UNIQUE(pick_id, channel)
    );
    CREATE INDEX IF NOT EXISTS idx_social_queue_status ON social_post_queue(status, created_at DESC);

    -- AI route landing-page content (phase 3). One row per (origin,destination).
    -- AI sections only; live stats stay live on the page. Falls back to the
    -- hand-written blurb when a route has no row yet.
    CREATE TABLE IF NOT EXISTS route_content (
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      when_to_fly_md TEXT NOT NULL,
      faqs_json TEXT NOT NULL,                   -- JSON [{q,a}]
      meta_title TEXT,
      meta_desc TEXT,
      model TEXT,
      generated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (origin, destination)
    );

    -- Concierge chat analytics (phase 3). Lightweight per-turn log so we can see
    -- what people ask. No behaviour change to the chat endpoint.
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      user_id INTEGER,
      question TEXT,
      reply_preview TEXT,
      tool_calls INTEGER NOT NULL DEFAULT 0,
      turns INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_started ON chat_sessions(started_at DESC);

    -- Client interaction telemetry. Batched from the browser via /api/telemetry
    -- so we can inspect slow pages, clicks, form usage, errors, and pointer
    -- movement without blocking the user experience.
    CREATE TABLE IF NOT EXISTS user_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
      session_id TEXT NOT NULL,
      user_id INTEGER,
      event_type TEXT NOT NULL,
      path TEXT,
      target TEXT,
      value TEXT,
      x INTEGER,
      y INTEGER,
      move_count INTEGER,
      duration_ms INTEGER,
      detail TEXT,
      user_agent TEXT,
      ip TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_user_events_time ON user_events(occurred_at);
    CREATE INDEX IF NOT EXISTS idx_user_events_session ON user_events(session_id, occurred_at);
    CREATE INDEX IF NOT EXISTS idx_user_events_type ON user_events(event_type, occurred_at);

    -- Subscriptions from Slack channels and Telegram chats. Each row is a
    -- (channel, origin, destination, threshold) tuple — when a tracked fare
    -- drops below the threshold, the notifier posts/sends to the channel/chat.
    -- Created via the /flycheap watch (Slack) and /watch (Telegram) commands.
    CREATE TABLE IF NOT EXISTS slack_channel_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      threshold_usd REAL NOT NULL,
      created_by_slack_user TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_alerted_at TEXT,
      UNIQUE (channel_id, origin, destination)
    );
    CREATE INDEX IF NOT EXISTS idx_slack_sub_route ON slack_channel_subscriptions(origin, destination);

    CREATE TABLE IF NOT EXISTS telegram_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      threshold_usd REAL NOT NULL,
      created_by_tg_user TEXT,
      first_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_alerted_at TEXT,
      UNIQUE (chat_id, origin, destination)
    );
    CREATE INDEX IF NOT EXISTS idx_tg_sub_route ON telegram_subscriptions(origin, destination);
  `);

  // Idempotent column adds for newer features.
  const userCols = db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>;
  if (!userCols.some(c => c.name === 'custom_domain')) {
    db.exec(`ALTER TABLE users ADD COLUMN custom_domain TEXT`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_custom_domain ON users(custom_domain) WHERE custom_domain IS NOT NULL`);
  }
  // Authenticator-app (TOTP) login for the mobile app: a chosen username + a base32
  // secret. `totp_enabled` flips to 1 only after the user confirms a live code, so a
  // half-finished enrollment can't lock anyone out. username is case-folded + unique.
  if (!userCols.some(c => c.name === 'username')) {
    db.exec(`ALTER TABLE users ADD COLUMN username TEXT`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL`);
  }
  // Subscription provider metadata (PayPal support). Production already has
  // these columns; this guard only matters for fresh/dev databases.
  if (!userCols.some(c => c.name === 'subscription_provider')) {
    db.exec(`ALTER TABLE users ADD COLUMN subscription_provider TEXT`);
  }
  if (!userCols.some(c => c.name === 'subscription_period')) {
    db.exec(`ALTER TABLE users ADD COLUMN subscription_period TEXT`);
  }
  if (!userCols.some(c => c.name === 'paypal_subscription_id')) {
    db.exec(`ALTER TABLE users ADD COLUMN paypal_subscription_id TEXT`);
  }
  if (!userCols.some(c => c.name === 'totp_secret')) {
    db.exec(`ALTER TABLE users ADD COLUMN totp_secret TEXT`);
    db.exec(`ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0`);
  }
  // First-run onboarding. 0 until the client finishes the setup wizard, so a
  // reinstall or a second device does NOT re-run it — "new" means new to the
  // account, not new to the handset. Existing rows default to 1: people who
  // already use the app should never be shown a first-run wizard.
  if (!userCols.some(c => c.name === 'onboarded')) {
    db.exec(`ALTER TABLE users ADD COLUMN onboarded INTEGER NOT NULL DEFAULT 0`);
    db.exec(`UPDATE users SET onboarded = 1`);
  }
  // The founding-trial end date. upsertUserByEmail() has always INSERTed this,
  // but the column had no migration — a fresh DB (or a fresh deploy) broke on
  // first signup. Idempotent: a no-op where the live DB already has it.
  if (!userCols.some(c => c.name === 'trial_ends_at')) {
    db.exec(`ALTER TABLE users ADD COLUMN trial_ends_at TEXT`);
  }
  if (!userCols.some(c => c.name === 'phone')) {
    db.exec(`ALTER TABLE users ADD COLUMN phone TEXT`);
  }
  // First-sign-in / authenticator-recovery email codes (typed 6-digit, replaces the
  // magic LINK whose universal-link/scheme handoff was unreliable in the app).
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_codes (
      email TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS device_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens(user_id);
  `);
  // A candidate TOTP secret, staged after email verification and promoted to the
  // user row ONLY when they confirm a live code. Keeping it OFF the user row until
  // confirmation means an abandoned (re-)enrollment never disables a working
  // authenticator — the account-recovery safety the design depends on.
  db.exec(`
    CREATE TABLE IF NOT EXISTS pending_enrollments (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      secret TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  // Support tickets. Clients open a ticket (from the in-app Support screen or
  // the contact form); each reply — client or operator — is a ticket_messages
  // row, so the thread is durable even if an email send fails. `ref` (FC-1042)
  // is the public identifier shown in emails and the client UI; the integer id
  // stays internal.
  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ref TEXT NOT NULL UNIQUE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      priority TEXT NOT NULL DEFAULT 'normal',
      ip TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_reply_at TEXT,
      last_reply_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
    CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_updated ON tickets(updated_at);
    CREATE TABLE IF NOT EXISTS ticket_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      author TEXT NOT NULL,
      body TEXT NOT NULL,
      email_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id);
  `);
  const cols = db.prepare(`PRAGMA table_info(searches)`).all() as Array<{ name: string }>;
  if (!cols.some(c => c.name === 'snoozed_until')) {
    db.exec(`ALTER TABLE searches ADD COLUMN snoozed_until TEXT`);
  }
  if (!cols.some(c => c.name === 'user_id')) {
    db.exec(`ALTER TABLE searches ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_searches_user ON searches(user_id)`);
  }
  // "Any dates" tracking: a route can be watched without committing to a date
  // pair. depart_date/return_date stay NOT NULL (placeholder values) so every
  // existing query keeps working; the poller ignores them when mode = 'any'.
  const dmCols = db.prepare(`PRAGMA table_info(searches)`).all() as Array<{ name: string }>;
  if (!dmCols.some(c => c.name === 'date_mode')) {
    db.exec(`ALTER TABLE searches ADD COLUMN date_mode TEXT NOT NULL DEFAULT 'exact'`);
  }
  // Cheapest-by-month results are 12 provider calls per route — cache them.
  db.exec(`
    CREATE TABLE IF NOT EXISTS cheapest_month_cache (
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      month TEXT NOT NULL,
      price_usd REAL NOT NULL,
      depart_date TEXT NOT NULL,
      return_date TEXT,
      refreshed_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (origin, destination, month)
    );
  `);

  const fareCols = db.prepare(`PRAGMA table_info(fare_snapshots)`).all() as Array<{ name: string }>;
  if (!fareCols.some(c => c.name === 'provider')) {
    db.exec(`ALTER TABLE fare_snapshots ADD COLUMN provider TEXT NOT NULL DEFAULT 'travelpayouts'`);
  }
  const alertCols = db.prepare(`PRAGMA table_info(alerts_sent)`).all() as Array<{ name: string }>;
  if (!alertCols.some(c => c.name === 'kind')) {
    db.exec(`ALTER TABLE alerts_sent ADD COLUMN kind TEXT NOT NULL DEFAULT 'threshold'`);
  }
  if (!alertCols.some(c => c.name === 'status')) {
    // 'pending' while the row is reserved and the channels are being tried,
    // 'sent' once at least one landed. The row has to exist before the send so
    // outbound links can carry its id (the alert->click join), but a row that
    // is merely reserved is not an alert: every reader that asks "what was the
    // last alert for this route" must skip it, or the email ends up comparing
    // itself to itself and the threshold floor moves on a send that failed.
    //
    // Default 'sent' so every pre-existing row stays correct.
    db.exec(`ALTER TABLE alerts_sent ADD COLUMN status TEXT NOT NULL DEFAULT 'sent'`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_alerts_sent_search_status ON alerts_sent(search_id, status, sent_at)`);
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
  // ── Organizations, groups and members ───────────────────────────────────
  //
  // "Do not build a separate B2B app. An agency or a university office is an
  //  Organization with several groups; a family is an Organization with one.
  //  Same screens, with org-level features appearing only when the account has
  //  them."
  //
  // The cost of a second frontend is not the build, it is that every feature
  // then has to be built twice and one of them rots.
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      tier TEXT NOT NULL DEFAULT 'team',        -- team | enterprise
      -- Branding. "The line between Team and Enterprise is whose name is on it."
      brand_logo_url TEXT,
      brand_color TEXT,
      from_name TEXT,
      support_email TEXT,
      sending_domain TEXT,
      sending_domain_verified_at TEXT,
      board_domain TEXT,
      board_domain_verified_at TEXT,
      -- "The monetization chain is OFF BY DEFAULT for organization accounts."
      -- An agency does not want our hotel emails going to their clients: those
      -- are their clients and hotel commission is their revenue. Opt in, or
      -- point the links at the agency's own marker and keep the commission.
      monetization_enabled INTEGER NOT NULL DEFAULT 0,
      affiliate_marker TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      archived_at TEXT
    );

    CREATE TABLE IF NOT EXISTS org_members (
      org_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'agent',       -- owner | admin | agent | viewer
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (org_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_org_members_user ON org_members(user_id);

    -- A group is a client, a cohort, a department, a wedding — or a family.
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      contact_email TEXT,
      notes TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      archived_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_groups_org ON groups(org_id, archived_at);
  `);

  // ── Boards ──────────────────────────────────────────────────────────────
  //
  // "The family share link is listed as a retention feature. It is actually the
  //  growth loop, and it is the same mechanism that the B2B client board runs
  //  on. One implementation, two markets."
  //
  // Sharing today is a single global token in `settings`: one board for the
  // whole install, no per-group scoping, no revocation, no expiry and no
  // privacy controls. That is replaced by this.
  db.exec(`
    CREATE TABLE IF NOT EXISTS board_share (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      -- STORE THE HASH, NEVER THE TOKEN. A leaked database must not hand over
      -- working board URLs for every family's travel plans.
      token_hash TEXT NOT NULL UNIQUE,
      created_by INTEGER,
      label TEXT,
      -- "Boards default to no-expiry OFF" — a default expiry, with permanent as
      -- a deliberate choice.
      expires_at TEXT,
      revoked_at TEXT,
      view_count INTEGER NOT NULL DEFAULT 0,
      last_viewed_at TEXT,
      -- "Let someone share the schedule without the budget. A family organiser
      --  may not want everyone to see what they are willing to pay."
      show_prices INTEGER NOT NULL DEFAULT 1,
      show_targets INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_board_share_group ON board_share(group_id, revoked_at);

    -- Board views, so "board views per share, and new accounts per board view"
    -- — the viral coefficient — is measurable rather than asserted.
    CREATE TABLE IF NOT EXISTS board_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      share_id INTEGER NOT NULL,
      viewed_at TEXT NOT NULL DEFAULT (datetime('now')),
      ip TEXT,
      user_agent TEXT,
      -- Set when a viewer of this board went on to create an account.
      converted_user_id INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_board_views_share ON board_views(share_id, viewed_at);
  `);

  // ── Deferred alerts ─────────────────────────────────────────────────────
  //
  // When the alert policy holds something for the digest, that alert has to go
  // SOMEWHERE. Without this table "deferred" is a euphemism for "dropped": a
  // trend warning is digest-only by definition, so under the policy alone it
  // would be computed, held, and then never seen by anyone.
  db.exec(`
    CREATE TABLE IF NOT EXISTS deferred_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      search_id INTEGER NOT NULL,
      user_id INTEGER,
      kind TEXT NOT NULL,
      reason TEXT,
      headline TEXT NOT NULL,
      price_per_adult_usd REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      delivered_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_deferred_pending ON deferred_alerts(user_id, delivered_at, created_at);
    -- One pending row per (watch, kind): a trend warning that is still true on
    -- the next poll is the same warning, not a second one. Without this the
    -- digest would list the same line every five minutes for a day.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_deferred_dedupe
      ON deferred_alerts(search_id, kind) WHERE delivered_at IS NULL;
  `);

  // ── The Watch object ────────────────────────────────────────────────────
  //
  // "Everything in the portal is a view over this one object. Get it right and
  //  the group solver, trip budgets and B2B boards all fall out of it. Get it
  //  wrong and each becomes a separate subsystem."
  //
  // `searches` IS that object — extended in place rather than replaced. A group
  // watch is the same row with an origin array, not a separate feature, and 19
  // files already read this table; a rename would be churn with a large blast
  // radius and no behavioural gain. Every column below is additive with a
  // back-compatible default, so existing rows keep meaning what they meant.
  const watchCols = db.prepare(`PRAGMA table_info(searches)`).all() as Array<{ name: string }>;
  const addWatchCol = (name: string, ddl: string) => {
    if (!watchCols.some(c => c.name === name)) db.exec(`ALTER TABLE searches ADD COLUMN ${ddl}`);
  };

  // route | trip | budget | group. Everything that exists today is a route watch.
  addWatchCol('kind', `kind TEXT NOT NULL DEFAULT 'route'`);
  // Which group (client / cohort / family) this belongs to. NULL = personal.
  addWatchCol('group_id', `group_id INTEGER`);
  addWatchCol('created_by', `created_by INTEGER`);

  // Destination array, mirroring the existing multi-origin `origins` column.
  // A budget watch leaves it blank: "$700, 10 nights, March, from JFK" has no
  // destination at all — the engine finds where that buys a trip.
  addWatchCol('destinations', `destinations TEXT`);

  // Date WINDOWS rather than fixed days. depart_date/return_date stay as the
  // canonical single dates so every existing reader is untouched; the window
  // columns are what the flexible kinds scan.
  addWatchCol('depart_window_start', `depart_window_start TEXT`);
  addWatchCol('depart_window_end',   `depart_window_end TEXT`);
  addWatchCol('return_window_start', `return_window_start TEXT`);
  addWatchCol('return_window_end',   `return_window_end TEXT`);
  // "7 to 14 nights, any dates in March"
  addWatchCol('trip_length_min', `trip_length_min INTEGER`);
  addWatchCol('trip_length_max', `trip_length_max INTEGER`);
  // Flex is where most of the savings live, and also the main reason the
  // allocator's canonical query key matters: every extra day multiplies the
  // query space.
  addWatchCol('flex_days', `flex_days INTEGER NOT NULL DEFAULT 0`);

  addWatchCol('children', `children INTEGER NOT NULL DEFAULT 0`);
  addWatchCol('cabin', `cabin TEXT`);

  // THE important one. target_per_adult_usd stays for back-compat, but the
  // basis is now explicit and defaults to the party total for new watches:
  // "a family of five does not care that the per-adult fare hit $412; they care
  // what the booking costs."
  addWatchCol('target_amount', `target_amount REAL`);
  addWatchCol('target_basis',  `target_basis TEXT`);
  addWatchCol('currency', `currency TEXT NOT NULL DEFAULT 'USD'`);

  // Trip watches: flight + accommodation as ONE number.
  addWatchCol('include_hotel', `include_hotel INTEGER NOT NULL DEFAULT 0`);
  addWatchCol('hotel_nights',  `hotel_nights INTEGER`);

  // active | paused | expired | booked. `active` (0/1) stays the column the
  // poller reads; status carries the richer lifecycle — notably that a booked
  // watch does NOT die, it flips to post-booking monitoring for the rebooking
  // window.
  addWatchCol('status', `status TEXT NOT NULL DEFAULT 'active'`);
  addWatchCol('expires_at', `expires_at TEXT`);
  addWatchCol('travelled_answer', `travelled_answer TEXT`);
  addWatchCol('booked_at', `booked_at TEXT`);
  addWatchCol('booked_amount_usd', `booked_amount_usd REAL`);
  // Set by the poll allocator, persisted so the board can explain itself.
  addWatchCol('priority_score', `priority_score REAL`);
  addWatchCol('poll_band', `poll_band TEXT`);
  // A home route never expires and is the headline retention lever.
  addWatchCol('is_home_route', `is_home_route INTEGER NOT NULL DEFAULT 0`);
  // Per-watch channel override. "The home route to see family gets SMS; the
  // speculative Tokyo budget watch gets digest." NULL = use the account default.
  addWatchCol('alert_channels', `alert_channels TEXT`);

  // The savings report's DENOMINATOR, captured once when the watch is created.
  //
  // "Baseline is the fare at the time the trip was requested. State it on the
  //  report, never change it silently." A baseline that drifts is how a savings
  //  report becomes a number nobody can defend in a renewal meeting — and the
  //  agency has to defend it to their client, not to us.
  addWatchCol('baseline_amount_usd', `baseline_amount_usd REAL`);
  addWatchCol('baseline_captured_at', `baseline_captured_at TEXT`);
  addWatchCol('baseline_basis', `baseline_basis TEXT`);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_searches_group ON searches(group_id, status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_searches_status ON searches(status, expires_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_searches_kind ON searches(kind, active)`);

  // ── Email delivery telemetry ────────────────────────────────────────────
  //
  // The funnel's first two steps — delivered and opened — are the ESP's to tell
  // us; nothing in our own database can know them. Until the webhook existed the
  // dashboard showed them as explicitly not-instrumented rather than as zeros,
  // which was honest but not useful.
  const alertDeliveryCols = db.prepare(`PRAGMA table_info(alerts_sent)`).all() as Array<{ name: string }>;
  if (!alertDeliveryCols.some(c => c.name === 'message_id')) {
    // The ESP's id for the send. This is the join key for every webhook event,
    // and without it a delivery event cannot be tied back to an alert.
    db.exec(`ALTER TABLE alerts_sent ADD COLUMN message_id TEXT`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_alerts_sent_message ON alerts_sent(message_id)`);
  }
  if (!alertDeliveryCols.some(c => c.name === 'delivered_at')) {
    db.exec(`ALTER TABLE alerts_sent ADD COLUMN delivered_at TEXT`);
  }
  if (!alertDeliveryCols.some(c => c.name === 'opened_at')) {
    db.exec(`ALTER TABLE alerts_sent ADD COLUMN opened_at TEXT`);
  }
  if (!alertDeliveryCols.some(c => c.name === 'bounced_at')) {
    db.exec(`ALTER TABLE alerts_sent ADD COLUMN bounced_at TEXT`);
  }

  // Raw webhook log. Kept separate from the alert row because events arrive out
  // of order, can repeat, and can reference a message we never recorded (a
  // chain send, a digest). Keeping the raw stream means a mis-parse is
  // recoverable rather than lost.
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      message_id TEXT,
      recipient TEXT,
      occurred_at TEXT NOT NULL,
      received_at TEXT NOT NULL DEFAULT (datetime('now')),
      raw_json TEXT
    );
    -- The ESP retries; the same event must not be counted twice.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_email_events_dedupe ON email_events(event_id);
    CREATE INDEX IF NOT EXISTS idx_email_events_message ON email_events(message_id, event_type);
    CREATE INDEX IF NOT EXISTS idx_email_events_time ON email_events(occurred_at);
  `);

  // ── The monetization chain ──────────────────────────────────────────────
  //
  // One alert, one intent spike, six chances to earn. The design principle is
  // "never interrupt the booking, always follow it": nothing here fires until
  // the user has CONFIRMED they booked. Guessing wrong and sending hotel offers
  // to someone who did not book is how a trusted alert becomes spam.
  db.exec(`
    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY,
      user_id INTEGER,
      click_token TEXT,
      search_id INTEGER,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      depart_date TEXT,
      return_date TEXT,
      adults INTEGER NOT NULL DEFAULT 1,
      fare_per_adult_usd REAL,
      -- 'pending'  asked, no answer yet
      -- 'booked'   confirmed by the user - the ONLY state that opens the chain
      -- 'deciding' confirmed not-booked - retention nudges, never offers
      -- 'expired'  never answered
      status TEXT NOT NULL DEFAULT 'pending',
      confirmed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_trips_user ON trips(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_trips_click ON trips(click_token)
      WHERE click_token IS NOT NULL;

    -- One row per scheduled send. Scheduling up front rather than computing at
    -- send time makes the chain inspectable: you can see what is queued for a
    -- user before it goes out.
    CREATE TABLE IF NOT EXISTS chain_sends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      scheduled_for TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',   -- queued|sent|skipped|failed|cancelled
      skip_reason TEXT,
      sent_at TEXT,
      message_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_chain_due ON chain_sends(status, scheduled_for);
    -- A stage fires at most once per trip, whatever the scheduler does.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_chain_trip_stage ON chain_sends(trip_id, stage);

    -- Token for the booked / still-deciding answer. Separate from the trip id so
    -- a link can be revoked without losing the trip.
    CREATE TABLE IF NOT EXISTS trip_confirm_tokens (
      token TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const tripCols = db.prepare(`PRAGMA table_info(trips)`).all() as Array<{ name: string }>;
  if (!tripCols.some(c => c.name === 'travelled_answer')) {
    // The post-trip loop: "did you travel, what did you pay?" Recorded on the
    // TRIP, not only on the watch, because a trip opened from an explore click
    // has no search_id and the answer would otherwise have nowhere to go.
    db.exec(`ALTER TABLE trips ADD COLUMN travelled_answer TEXT`);   // 'yes' | 'no'
    db.exec(`ALTER TABLE trips ADD COLUMN paid_amount_usd REAL`);
    db.exec(`ALTER TABLE trips ADD COLUMN answered_at TEXT`);
  }

  // ── Monthly savings reports: review, then send ─────────────────────────
  //
  // One row per (group, period). A report is QUEUED by the scheduler, APPROVED
  // by a human who has read it, and only then SENT. Nothing goes to a client
  // that an agent has not looked at — a savings figure the agency cannot defend
  // is worse than no report, and they are the ones who have to defend it.
  db.exec(`
    CREATE TABLE IF NOT EXISTS report_sends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id INTEGER NOT NULL,
      group_id INTEGER NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',   -- queued|approved|sent|skipped|failed
      to_email TEXT,
      summary_json TEXT NOT NULL,
      approved_by INTEGER,
      approved_at TEXT,
      sent_at TEXT,
      message_id TEXT,
      skip_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_report_group_period ON report_sends(group_id, period_start);
    CREATE INDEX IF NOT EXISTS idx_report_status ON report_sends(status, org_id);
  `);

  const chainCols = db.prepare(`PRAGMA table_info(chain_sends)`).all() as Array<{ name: string }>;
  if (!chainCols.some(c => c.name === 'attempts')) {
    // A transient send failure must not be permanent. Without a retry the
    // 'confirm' stage is the expensive case: the question never arrives, the
    // user never answers, the trip expires unconfirmed after 7 days, and the
    // entire six-stage chain for that booking silently never happens — while
    // the funnel just shows an unconfirmed trip.
    db.exec(`ALTER TABLE chain_sends ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0`);
  }

  // ── Fare truth ──────────────────────────────────────────────────────────
  //
  // "The category killer for a fare-alert product is a user clicking a $484
  // alert and landing on $689. It happens once and they never trust an alert
  // again." Every number the product shows therefore carries the moment it was
  // verified and what verified it, and alerts that cannot be verified are
  // suppressed rather than sent.
  const fareTruthCols = db.prepare(`PRAGMA table_info(fare_snapshots)`).all() as Array<{ name: string }>;
  if (!fareTruthCols.some(c => c.name === 'verified_at')) {
    db.exec(`ALTER TABLE fare_snapshots ADD COLUMN verified_at TEXT`);
  }
  if (!fareTruthCols.some(c => c.name === 'verified_price_usd')) {
    db.exec(`ALTER TABLE fare_snapshots ADD COLUMN verified_price_usd REAL`);
  }
  if (!fareTruthCols.some(c => c.name === 'verified_by')) {
    // Comma-separated provider ids that agreed on the verified price.
    db.exec(`ALTER TABLE fare_snapshots ADD COLUMN verified_by TEXT`);
  }
  if (!fareTruthCols.some(c => c.name === 'verify_outcome')) {
    // 'agreed' | 'within-tolerance' | 'dead' | 'unverified' | 'single-provider'
    db.exec(`ALTER TABLE fare_snapshots ADD COLUMN verify_outcome TEXT`);
  }

  // Alerts that were SUPPRESSED because the fare could not be verified. This
  // table is the point of the exercise: a suppressed alert costs one possible
  // booking, a dead-fare alert costs a user. Keeping the suppressions visible
  // is what stops anyone quietly turning the check off because it is
  // "suppressing exciting alerts".
  db.exec(`
    CREATE TABLE IF NOT EXISTS dead_fares (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      search_id INTEGER NOT NULL,
      fare_snapshot_id INTEGER,
      alert_kind TEXT NOT NULL,
      polled_price_usd REAL NOT NULL,
      verified_price_usd REAL,
      delta_pct REAL,
      polled_by TEXT,
      verified_by TEXT,
      reason TEXT NOT NULL,
      occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_dead_fares_time ON dead_fares(occurred_at);
    CREATE INDEX IF NOT EXISTS idx_dead_fares_search ON dead_fares(search_id, occurred_at);
  `);

  // Two providers quoting materially different prices for the same query, per
  // pair, so provider disagreement can be tracked rather than averaged away.
  db.exec(`
    CREATE TABLE IF NOT EXISTS provider_disagreements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_key TEXT NOT NULL,
      search_id INTEGER,
      provider_a TEXT NOT NULL,
      provider_b TEXT NOT NULL,
      price_a REAL NOT NULL,
      price_b REAL NOT NULL,
      delta_pct REAL NOT NULL,
      occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_disagree_pair ON provider_disagreements(provider_a, provider_b, occurred_at);
    CREATE INDEX IF NOT EXISTS idx_disagree_time ON provider_disagreements(occurred_at);
  `);

  // Verdict scoring: score our own buy/wait calls continuously. For every fare
  // called `buy`, whether it went lower within 7 and 14 days; for every `wait`,
  // whether waiting paid. Publishing a real hit rate is what turns the
  // confidence percentage from a claim into a measured quantity.
  db.exec(`
    CREATE TABLE IF NOT EXISTS verdict_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      search_id INTEGER NOT NULL,
      route_key TEXT NOT NULL,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      verdict TEXT NOT NULL,              -- buy | wait | hold
      confidence_pct INTEGER NOT NULL,
      price_at_call_usd REAL NOT NULL,
      called_at TEXT NOT NULL DEFAULT (datetime('now')),
      -- Filled in by the scorer once the horizon has elapsed. NULL = not due yet.
      min_price_7d_usd REAL,
      min_price_14d_usd REAL,
      correct_7d INTEGER,                 -- 1 | 0 | NULL (not yet scored)
      correct_14d INTEGER,
      scored_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_verdict_calls_route ON verdict_calls(route_key, called_at);
    CREATE INDEX IF NOT EXISTS idx_verdict_calls_scoring ON verdict_calls(called_at, correct_7d);
    -- One call per search per day: the poller runs every few minutes and we are
    -- scoring a judgement, not a sample rate.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_verdict_calls_daily
      ON verdict_calls(search_id, date(called_at));
  `);

  // ── Monetization-chain instrumentation (spec: "the three numbers") ──────
  //
  // Nothing in the monetization spec is measurable without these three joins:
  //   provider cost per tracked route  → api_calls.provider + cost_usd
  //   commission per converted alert   → affiliate_clicks.alert_id
  //   alert → click → book conversion  → affiliate_clicks.alert_id + alert_kind
  //
  // api_calls previously recorded one aggregate row per poll with no provider
  // attached, so "which provider costs what" could not be answered at all.
  // cost_usd is resolved and frozen AT WRITE TIME from the provider_costs
  // setting, so re-pricing a provider never rewrites history.
  const apiCallCols = db.prepare(`PRAGMA table_info(api_calls)`).all() as Array<{ name: string }>;
  if (!apiCallCols.some(c => c.name === 'provider')) {
    db.exec(`ALTER TABLE api_calls ADD COLUMN provider TEXT`);
  }
  if (!apiCallCols.some(c => c.name === 'cost_usd')) {
    db.exec(`ALTER TABLE api_calls ADD COLUMN cost_usd REAL NOT NULL DEFAULT 0`);
  }
  if (!apiCallCols.some(c => c.name === 'phase')) {
    // 'sweep'    — routine allocator poll
    // 'verify'   — the pre-send second-provider re-query (fare truth)
    // 'ondemand' — a user pressed Poll now / searched
    // 'click'    — re-query at click time to measure the alert-to-click delta
    db.exec(`ALTER TABLE api_calls ADD COLUMN phase TEXT NOT NULL DEFAULT 'sweep'`);
  }
  if (!apiCallCols.some(c => c.name === 'band')) {
    db.exec(`ALTER TABLE api_calls ADD COLUMN band TEXT`);
  }
  if (!apiCallCols.some(c => c.name === 'route_key')) {
    // Canonical (origin, destination, date-bucket, pax-class) dedup key, so
    // one poll shared by N watchers is costed once rather than N times.
    db.exec(`ALTER TABLE api_calls ADD COLUMN route_key TEXT`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_api_calls_provider_time ON api_calls(provider, called_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_api_calls_routekey_time ON api_calls(route_key, called_at)`);

  // affiliate_clicks IS the spec's `click_out` row. Extending it rather than
  // adding a second table keeps the funnel in one place — a parallel table
  // would split alert→click→commission across a join nobody maintains.
  const clickOutCols = db.prepare(`PRAGMA table_info(affiliate_clicks)`).all() as Array<{ name: string }>;
  const addClickCol = (name: string, ddl: string) => {
    if (!clickOutCols.some(c => c.name === name)) db.exec(`ALTER TABLE affiliate_clicks ADD COLUMN ${ddl}`);
  };
  // The single most valuable join in the product: which alert produced this click.
  addClickCol('alert_id',             `alert_id INTEGER`);
  addClickCol('alert_kind',           `alert_kind TEXT`);
  addClickCol('product',              `product TEXT`);   // flight | hotel | transfer | insurance | esim | tour | compensation
  addClickCol('sub_id',               `sub_id TEXT`);    // <surface><product><alertType>, e.g. "emflmf"
  // Fare truth: what we promised vs what was there when they clicked.
  addClickCol('price_shown_usd',      `price_shown_usd REAL`);
  addClickCol('price_at_click_usd',   `price_at_click_usd REAL`);
  addClickCol('verdict',              `verdict TEXT`);
  addClickCol('confidence_pct',       `confidence_pct INTEGER`);
  addClickCol('minutes_since_alert',  `minutes_since_alert INTEGER`);
  // Which cross-shop option was taken and where it sat in the list — this is
  // how we learn whether ordering the Book panel by expected commission
  // costs us clicks.
  addClickCol('option_rank',          `option_rank INTEGER`);
  addClickCol('option_name',          `option_name TEXT`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_aff_clicks_alert ON affiliate_clicks(alert_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_aff_clicks_product ON affiliate_clicks(product, occurred_at)`);

  const searchCols2 = db.prepare(`PRAGMA table_info(searches)`).all() as Array<{ name: string }>;
  if (!searchCols2.some(c => c.name === 'origins')) {
    // Multi-origin fanout: comma-separated IATA codes. NULL/empty means just
    // use the legacy single `origin` column (back-compat).
    db.exec(`ALTER TABLE searches ADD COLUMN origins TEXT`);
  }
  // Per-route alert target (per-adult USD). NULL = use the user's/global default.
  // Resolved everywhere through effectiveTarget() in src/lib/targets.ts.
  if (!searchCols2.some(c => c.name === 'target_per_adult_usd')) {
    db.exec(`ALTER TABLE searches ADD COLUMN target_per_adult_usd REAL`);
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
  db.exec(`CREATE INDEX IF NOT EXISTS idx_best_deals_price_rank ON best_deals_cache(per_adult_usd, rank)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_best_deals_dest_price_rank ON best_deals_cache(destination, per_adult_usd, rank)`);

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
  // Poll economics. Editable in /admin/settings WITHOUT a deploy, because
  // provider pricing changes and the spec is explicit that a routing/pricing
  // table must not live in code. USD per successful API call.
  // Travelpayouts' data API is free on our plan, hence 0 — that is a real
  // measured value, not a placeholder, and it is why the honest COGS number
  // is dominated by the paid providers below.
  seed.run('provider_costs', JSON.stringify({
    travelpayouts: 0,
    amadeus: 0,
    serpapi: 0.015,
    searchapi: 0.012,
    duffel: 0,
    kiwi: 0,
  }));
  // Hard monthly poll-spend ceiling in USD. 0 = uncapped (the allocator then
  // never demotes on budget). Surfaced on the admin cost dashboard.
  seed.run('poll_budget_monthly_usd', '0');
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
  target_per_adult_usd?: number | null;  // per-route alert target; null/absent → user/global default
  date_mode?: 'exact' | 'any';           // 'any' = watch the route, let us find the cheapest window
  /**
   * Columns added by the Watch migrations (addWatchCol above). They were
   * missing from this type, so every reader had to cast — which is how
   * alertGate ended up reading alert_channels through an inline cast and the
   * board could not read it at all. Optional because older rows predate them.
   */
  is_home_route?: number | null;         // 1 = flown every year; never expires
  alert_channels?: string | null;        // per-watch override; null = account default
  status?: string | null;
  expires_at?: string | null;
  poll_band?: string | null;
  booked_at?: string | null;
  booked_amount_usd?: number | null;     // what was actually paid — the savings numerator
  baseline_amount_usd?: number | null;   // the fare when the trip was requested — the denominator
  baseline_basis?: string | null;
  travelled_answer?: string | null;      // 'yes' | 'no' from the post-trip loop
};

export type ReportSendRow = {
  id: number; org_id: number; group_id: number;
  period_start: string; period_end: string;
  status: 'queued' | 'approved' | 'sent' | 'skipped' | 'failed';
  to_email: string | null; summary_json: string;
  approved_by: number | null; approved_at: string | null;
  sent_at: string | null; message_id: string | null; skip_reason: string | null;
  created_at: string;
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
export type TierLimit = {
  maxRoutes: number;
  pollIntervalMin: number;
  channels: string[];
  /** Track "any dates / cheapest window" rather than one fixed pair of dates. */
  anyDates: boolean;
  /** How far back the user can see their own route's price history. */
  historyDays: number;
  /** Share a route read-only with household members. */
  familyShare: boolean;
  /** Anomaly alerts ("X% below the 7-day median"), not just target-price hits. */
  priceDropAlerts: boolean;
};

// Free is a real, useful product — 5 routes and genuine alerts — but it is
// deliberately SLOW. Paid tiers buy freshness plus the features that make the
// stored history worth anything. Nothing here removes a capability free users
// previously had: at the time of writing every tracked route belongs to the
// owner account, so no existing free route changes behaviour.
//
// On cadence: Travelpayouts serves a ~7-day cache derived from other users'
// searches, so polling a route every 5 minutes spent quota re-reading numbers
// that had not moved. 30 minutes is the honest ceiling on usefulness.
export const TIER_LIMITS: Record<string, TierLimit> = {
  free:        { maxRoutes: 5,    pollIntervalMin: 240, channels: ['email'],
                 anyDates: false, historyDays: 7,   familyShare: false, priceDropAlerts: false },
  pro:         { maxRoutes: 100,  pollIntervalMin: 30,  channels: ['email','sms','whatsapp','telegram'],
                 anyDates: true,  historyDays: 365, familyShare: true,  priceDropAlerts: true },
  enterprise:  { maxRoutes: 9999, pollIntervalMin: 15,  channels: ['email','sms','whatsapp','telegram'],
                 anyDates: true,  historyDays: 3650, familyShare: true, priceDropAlerts: true },
};

/**
 * Resolve the limits that actually apply to a user.
 *
 * A founding-trial account is on tier 'free' but receives the FULL product for
 * the 3-month trial — every Pro AND Enterprise capability — so people can try
 * everything before deciding whether to continue. Resolving this in one place
 * stops the trial from silently delivering a lesser product.
 */
export function limitsForUser(
  user: { tier?: string | null; subscription_status?: string | null } | null | undefined,
): TierLimit {
  if (!user) return TIER_LIMITS.free;
  const status = (user.subscription_status ?? '').toLowerCase();
  const base = TIER_LIMITS[user.tier ?? 'free'] ?? TIER_LIMITS.free;
  if (status === 'founding_free' || status === 'trialing') {
    // Full access during the trial: never below Enterprise.
    return base.maxRoutes >= TIER_LIMITS.enterprise.maxRoutes ? base : TIER_LIMITS.enterprise;
  }
  return base;
}

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
  username: string | null;
  phone: string | null;        // optional, collected at sign-up
  totp_secret: string | null;
  totp_enabled: number;          // 0 | 1
  created_at: string;
  trial_ends_at?: string | null;   // founding trial / paid-trial end (ISO or SQLite datetime)
  onboarded?: number;              // 0 = show the first-run setup wizard
  subscription_provider?: 'stripe' | 'paypal' | null;
  subscription_period?: 'month' | 'year' | null;
  paypal_subscription_id?: string | null;
};

export type OpsIncidentStatus = 'open' | 'fixing' | 'needs_human' | 'resolved';
export type OpsIncidentRow = {
  id: number;
  fingerprint: string;
  source: string;
  title: string;
  status: OpsIncidentStatus;
  slack_ts: string | null;
  first_seen: string;
  last_seen: string;
  occurrences: number;
  last_action: string | null;
  last_restart_at: string | null;
  last_deploy_at: string | null;
  resolved_at: string | null;
};

export type TicketStatus = 'open' | 'in_progress' | 'waiting' | 'resolved';
export type TicketAuthor = 'client' | 'operator';
export type TicketRow = {
  id: number;
  ref: string;
  user_id: number | null;
  name: string;
  email: string;
  subject: string;
  status: TicketStatus;
  priority: 'low' | 'normal' | 'high';
  ip: string | null;
  created_at: string;
  updated_at: string;
  last_reply_at: string | null;
  last_reply_by: TicketAuthor | null;
};
export type TicketMessageRow = {
  id: number;
  ticket_id: number;
  author: TicketAuthor;
  body: string;
  email_id: string | null;
  created_at: string;
};

// Audit rows written for traffic that originated on the server itself (see
// isInternalIp in auth.ts) carry detail {"internal":true}. Admin "last seen"
// columns must ignore them or a QA curl run looks like a user visit.
// Requires the audit_log alias to be `a`.
const AUDIT_NOT_INTERNAL = `coalesce(a.detail, '') NOT LIKE '%"internal":true%'`;

export const queries = {
  // -------- Users --------
  getUserById:    (id: number) => getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined,
  /** Mark the first-run wizard complete. Idempotent. */
  setOnboarded:   (id: number) => getDb().prepare('UPDATE users SET onboarded = 1 WHERE id = ?').run(id),
  // -------- Admin FarePilot audit (owner-only agent action trail) --------
  logAdminAgentAction: (p: { adminUserId: number | null; tool: string; input: string; resultPreview: string; ok: boolean }) =>
    getDb().prepare(`INSERT INTO admin_agent_audit (admin_user_id, tool, input, result_preview, ok) VALUES (?, ?, ?, ?, ?)`)
      .run(p.adminUserId, p.tool, p.input.slice(0, 4000), p.resultPreview.slice(0, 4000), p.ok ? 1 : 0),
  // Pre-execution audit: write the row BEFORE running (so a command that kills
  // the process is still logged), then update it with the outcome.
  logAdminAgentActionStart: (p: { adminUserId: number | null; tool: string; input: string }): number => {
    const r = getDb().prepare(`INSERT INTO admin_agent_audit (admin_user_id, tool, input, result_preview, ok) VALUES (?, ?, ?, '(running)', 1)`)
      .run(p.adminUserId, p.tool, p.input.slice(0, 4000));
    return Number(r.lastInsertRowid);
  },
  updateAdminAgentAction: (id: number, resultPreview: string, ok: boolean) =>
    getDb().prepare(`UPDATE admin_agent_audit SET result_preview = ?, ok = ? WHERE id = ?`)
      .run(resultPreview.slice(0, 4000), ok ? 1 : 0, id),
  recentAdminAgentAudit: (limit = 100) =>
    getDb().prepare(`SELECT * FROM admin_agent_audit ORDER BY id DESC LIMIT ?`).all(limit) as Array<{
      id: number; admin_user_id: number | null; tool: string; input: string | null; result_preview: string | null; ok: number; created_at: string;
    }>,
  getUserByEmail: (email: string) => getDb().prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined,
  getUserByUsername: (username: string) =>
    getDb().prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username) as UserRow | undefined,
  upsertUserByEmail: (email: string, name?: string) => {
    const existing = queries.getUserByEmail(email);
    if (existing) return existing;
    // Start the 3-month founding trial HERE, at the single point where an
    // account comes into existence. It used to be called only from the OTP
    // verify route, so users who arrived via magic link or the v1 API were
    // created with subscription_status NULL and silently never got the trial
    // they were promised.
    const r = getDb().prepare(
      `INSERT INTO users (email, name, tier, subscription_status, trial_ends_at)
       VALUES (?, ?, 'free', 'founding_free', datetime('now', '+90 days'))`,
    ).run(email, name ?? null);
    return queries.getUserById(Number(r.lastInsertRowid))!;
  },
  // -------- Authenticator (TOTP) enrollment + login --------
  /** True if `username` is free (case-insensitive), optionally excluding one user id. */
  isUsernameAvailable: (username: string, exceptUserId?: number): boolean => {
    const row = getDb().prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(username) as { id: number } | undefined;
    return !row || row.id === exceptUserId;
  },
  /** Set/replace a user's username (used by the username + email-OTP sign-up). */
  setUsername: (userId: number, username: string) =>
    getDb().prepare('UPDATE users SET username = ? WHERE id = ?').run(username, userId),
  /** Promote a confirmed enrollment: set the live secret, claim username, enable TOTP. */
  enableOwnerTotp: (userId: number, secret: string) =>
    getDb().prepare(`UPDATE users SET totp_secret = ?, totp_enabled = 1 WHERE id = ?`).run(secret, userId),
  promoteEnrollment: (userId: number, username: string, secret: string) =>
    getDb().prepare(`UPDATE users SET totp_secret = ?, username = ?, totp_enabled = 1 WHERE id = ?`)
      .run(secret, username, userId),
  // -------- Pending TOTP enrollment (staged secret, promoted on confirmation) --------
  insertPendingEnrollment: (token: string, userId: number, secret: string, minutes = 15) =>
    getDb().prepare(
      `INSERT INTO pending_enrollments (token, user_id, secret, expires_at)
       VALUES (?, ?, ?, datetime('now', '+' || ? || ' minutes'))`
    ).run(token, userId, secret, minutes),
  /** Read a pending enrollment if not expired and under the attempt cap; else null. */
  getPendingEnrollment: (token: string): { user_id: number; secret: string; attempts: number } | null => {
    const db = getDb();
    const row = db.prepare('SELECT user_id, secret, attempts, expires_at FROM pending_enrollments WHERE token = ?')
      .get(token) as { user_id: number; secret: string; attempts: number; expires_at: string } | undefined;
    if (!row) return null;
    const expired = db.prepare(`SELECT datetime('now') > ? AS x`).get(row.expires_at) as { x: number };
    if (expired.x || row.attempts >= 5) { db.prepare('DELETE FROM pending_enrollments WHERE token = ?').run(token); return null; }
    return { user_id: row.user_id, secret: row.secret, attempts: row.attempts };
  },
  bumpPendingEnrollmentAttempt: (token: string) =>
    getDb().prepare('UPDATE pending_enrollments SET attempts = attempts + 1 WHERE token = ?').run(token),
  deletePendingEnrollment: (token: string) =>
    getDb().prepare('DELETE FROM pending_enrollments WHERE token = ?').run(token),
  /** Store a 6-digit email verification code (upsert per email, resets attempts). */
  insertEmailCode: (email: string, code: string, minutes = 10) =>
    getDb().prepare(
      `INSERT INTO email_codes (email, code, expires_at, attempts, created_at)
       VALUES (?, ?, datetime('now', '+' || ? || ' minutes'), 0, datetime('now'))
       ON CONFLICT(email) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at, attempts = 0, created_at = datetime('now')`
    ).run(email, code, minutes),
  /**
   * Check an email code: returns 'ok' on match (and deletes the row), 'expired',
   * 'too_many' after 5 wrong tries, or 'bad' on mismatch (increments attempts).
   */
  checkEmailCode: (email: string, code: string): 'ok' | 'bad' | 'expired' | 'too_many' => {
    const db = getDb();
    const row = db.prepare('SELECT code, expires_at, attempts FROM email_codes WHERE email = ?')
      .get(email) as { code: string; expires_at: string; attempts: number } | undefined;
    if (!row) return 'expired';
    if (row.attempts >= 5) { db.prepare('DELETE FROM email_codes WHERE email = ?').run(email); return 'too_many'; }
    const expired = db.prepare(`SELECT datetime('now') > ? AS x`).get(row.expires_at) as { x: number };
    if (expired.x) { db.prepare('DELETE FROM email_codes WHERE email = ?').run(email); return 'expired'; }
    if (row.code !== code) {
      db.prepare('UPDATE email_codes SET attempts = attempts + 1 WHERE email = ?').run(email);
      return 'bad';
    }
    db.prepare('DELETE FROM email_codes WHERE email = ?').run(email);
    return 'ok';
  },
  listAllUsers: () =>
    getDb().prepare(
      `SELECT u.id, u.email, u.name, u.tier, u.subscription_status, u.subscription_renews_at,
              u.created_at, u.custom_domain,
              (SELECT COUNT(*) FROM searches s WHERE s.user_id = u.id) AS total_searches,
              (SELECT COUNT(*) FROM searches s WHERE s.user_id = u.id AND s.active = 1) AS active_searches,
              (SELECT MAX(occurred_at) FROM audit_log a WHERE a.user_id = u.id AND ${AUDIT_NOT_INTERNAL}) AS last_action_at,
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
      // Do NOT rely on ON DELETE CASCADE here. SQLite enforces foreign keys
      // only when `PRAGMA foreign_keys = ON`, and it is OFF on this connection
      // (verified against production 2026-09-20: `PRAGMA foreign_keys` -> 0).
      // The declared cascades were therefore silently inert, leaving 13 live
      // session rows and 12 push tokens belonging to users that no longer
      // existed. Each of those is an active harm, not just clutter:
      //   sessions      — an auth row for a deleted account
      //   device_tokens — push notifications still addressed to that person
      //   searches      — the poller keeps pricing a ghost account's routes
      // So every dependant is deleted explicitly, inside one transaction.
      for (const table of [
        'sessions', 'user_settings', 'device_tokens', 'push_devices',
        'chat_sessions', 'user_route_intel', 'pending_enrollments', 'custom_domains',
      ]) {
        // Tables arrive over time; a missing one must not abort the delete.
        try { db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(id); }
        catch { /* table not present in this schema version */ }
      }
      // alerts_sent references searches, so it goes with them.
      db.prepare(
        `DELETE FROM alerts_sent WHERE search_id IN (SELECT id FROM searches WHERE user_id = ?)`
      ).run(id);
      db.prepare(`DELETE FROM searches WHERE user_id = ?`).run(id);

      // Analytics and audit rows are kept but de-identified: the aggregate
      // history stays truthful while the person stops being identifiable.
      for (const table of ['audit_log', 'user_events', 'affiliate_clicks', 'error_log']) {
        try { db.prepare(`UPDATE ${table} SET user_id = NULL WHERE user_id = ?`).run(id); }
        catch { /* table not present in this schema version */ }
      }

      db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
    });
    tx();
  },

  // -------- Admin: active sessions --------
  listActiveSessions: () =>
    getDb().prepare(
      `SELECT s.token, s.user_id, s.created_at, s.expires_at,
              u.email, u.name, u.tier,
              (SELECT MAX(a.occurred_at) FROM audit_log a WHERE a.user_id = s.user_id AND ${AUDIT_NOT_INTERNAL}) AS last_action_at,
              (SELECT a.ip FROM audit_log a WHERE a.user_id = s.user_id AND ${AUDIT_NOT_INTERNAL} ORDER BY a.occurred_at DESC LIMIT 1) AS last_ip
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
  /** Founding period: the first 3 months after first sign-in are free (basic tier); afterwards we nudge to upgrade. */
  startFoundingPeriod: (id: number) =>
    getDb().prepare(`UPDATE users SET subscription_status = 'founding_free', trial_ends_at = datetime('now', '+90 days') WHERE id = ? AND tier = 'free' AND subscription_status IS NULL`).run(id),
  /** Save the profile fields collected at sign-up. Name is required by the
   *  form; phone is optional and stored as NULL when blank. Only fills empty
   *  columns so a later sign-in can never overwrite what someone has set. */
  setProfileIfEmpty: (id: number, name: string | null, phone: string | null) =>
    getDb().prepare(
      `UPDATE users
          SET name  = COALESCE(NULLIF(name, ''), ?),
              phone = COALESCE(NULLIF(phone, ''), ?)
        WHERE id = ?`).run(name || null, phone || null, id),
  /** Set or clear a trial end date (admin override; does not touch Stripe). */
  setTrialEndsAt: (id: number, endsAt: string | null) =>
    getDb().prepare(`UPDATE users SET trial_ends_at = ? WHERE id = ?`).run(endsAt, id),
  dueFoundingUpgrades: () =>
    getDb().prepare(`SELECT id, email FROM users WHERE subscription_status = 'founding_free' AND tier = 'free' AND trial_ends_at IS NOT NULL AND trial_ends_at < datetime('now')`).all() as Array<{ id: number; email: string }>,
  markUpgradeDue: (id: number) =>
    getDb().prepare(`UPDATE users SET subscription_status = 'upgrade_due' WHERE id = ?`).run(id),
  clearFoundingPeriod: (id: number) =>
    getDb().prepare(`UPDATE users SET trial_ends_at = NULL WHERE id = ? AND subscription_status IN ('founding_free','upgrade_due')`).run(id),
  setUserStripe: (id: number, customerId: string, subscriptionId?: string | null) =>
    getDb().prepare(`UPDATE users SET stripe_customer_id = ?, stripe_subscription_id = ? WHERE id = ?`)
      .run(customerId, subscriptionId ?? null, id),
  setUserPaypal: (id: number, subscriptionId: string | null) =>
    getDb().prepare(`UPDATE users SET paypal_subscription_id = ? WHERE id = ?`).run(subscriptionId ?? null, id),
  /** Provider / billing period / trial end for the current subscription. Nulls clear provider+period; an omitted trialEndsAt keeps the stored value. */
  setSubscriptionMeta: (id: number, meta: { provider: 'stripe' | 'paypal' | null; period: 'month' | 'year' | null; trialEndsAt?: string | null }) =>
    getDb().prepare(`UPDATE users SET subscription_provider = ?, subscription_period = ?, trial_ends_at = COALESCE(?, trial_ends_at) WHERE id = ?`)
      .run(meta.provider ?? null, meta.period ?? null, meta.trialEndsAt ?? null, id),

  // -------- Device tokens (trusted-device skip-OTP) --------
  createDeviceToken: (userId: number, token: string, expiresAt: string) =>
    getDb().prepare(`INSERT INTO device_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`).run(userId, token, expiresAt),
  getDeviceToken: (userId: number, token: string) =>
    getDb().prepare(`SELECT * FROM device_tokens WHERE user_id = ? AND token = ? AND expires_at > datetime('now')`).get(userId, token) as { id: number; user_id: number; token: string; expires_at: string } | undefined,
  deleteDeviceToken: (userId: number, token: string) =>
    getDb().prepare(`DELETE FROM device_tokens WHERE user_id = ? AND token = ?`).run(userId, token),
  pruneDeviceTokens: () =>
    getDb().prepare(`DELETE FROM device_tokens WHERE expires_at < datetime('now')`).run(),
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

  // -------- Mobile push devices (Expo tokens) --------
  upsertPushDevice: (token: string, userId: number, platform: string | null) =>
    getDb().prepare(
      `INSERT INTO push_devices (token, user_id, platform) VALUES (?, ?, ?)
       ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, platform = excluded.platform`
    ).run(token, userId, platform),
  deletePushDevice: (token: string) =>
    getDb().prepare(`DELETE FROM push_devices WHERE token = ?`).run(token),
  listPushDevicesForUser: (userId: number) =>
    getDb().prepare(`SELECT token, platform FROM push_devices WHERE user_id = ?`).all(userId) as
      Array<{ token: string; platform: string | null }>,

  // Total fare snapshots ever polled across a user's routes — the "Total flights" KPI.
  countFareSnapshotsForUser: (userId: number): number =>
    (getDb().prepare(
      `SELECT COUNT(*) as n FROM fare_snapshots f
         JOIN searches s ON s.id = f.search_id
        WHERE s.user_id = ?`
    ).get(userId) as { n: number }).n,

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

    const ownerEmail = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
    const billed = db.prepare(
      `SELECT
         SUM(CASE WHEN tier = 'pro'        THEN 1 ELSE 0 END) AS pro,
         SUM(CASE WHEN tier = 'enterprise' THEN 1 ELSE 0 END) AS ent
       FROM users
       WHERE subscription_status IN ('active','trialing','past_due')
         AND (? = '' OR lower(email) <> ?)`,
    ).get(ownerEmail, ownerEmail) as { pro: number | null; ent: number | null };
    const billedPro = billed?.pro ?? 0;
    const billedEnt = billed?.ent ?? 0;

    return {
      users: { total, free, pro, enterprise },
      signups: { last7d: signupsLast7d, last30d: signupsLast30d },
      // MRR counts only accounts that are ACTUALLY BILLED, at the real live
      // Stripe prices (pro $9, enterprise $39 — verified against the Stripe
      // API 2026-09-12), and excludes the owner's comp account. Counting a
      // tier alone treated every comp as revenue, and $49 was never a price
      // we charge. Both bugs produced phantom MRR on /admin/signups,
      // /api/health and /api/admin/metrics.
      mrr_usd: billedPro * 9 + billedEnt * 39,
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

  // -------- Ops incidents (src/lib/ops) --------
  upsertIncident: (fingerprint: string, source: string, title: string): { row: OpsIncidentRow; created: boolean } => {
    const db = getDb();
    const existing = db.prepare(`SELECT * FROM ops_incidents WHERE fingerprint = ?`).get(fingerprint) as OpsIncidentRow | undefined;
    if (existing) {
      db.prepare(`UPDATE ops_incidents SET last_seen = datetime('now'), occurrences = occurrences + 1, title = ? WHERE id = ?`)
        .run(title, existing.id);
      return { row: db.prepare(`SELECT * FROM ops_incidents WHERE id = ?`).get(existing.id) as OpsIncidentRow, created: false };
    }
    const r = db.prepare(`INSERT INTO ops_incidents (fingerprint, source, title) VALUES (?, ?, ?)`).run(fingerprint, source, title);
    return { row: db.prepare(`SELECT * FROM ops_incidents WHERE id = ?`).get(Number(r.lastInsertRowid)) as OpsIncidentRow, created: true };
  },
  openIncidents: (): OpsIncidentRow[] =>
    getDb().prepare(`SELECT * FROM ops_incidents WHERE status <> 'resolved' ORDER BY first_seen`).all() as OpsIncidentRow[],
  recentResolvedIncidents: (limit = 3): OpsIncidentRow[] =>
    getDb().prepare(`SELECT * FROM ops_incidents WHERE status = 'resolved' ORDER BY resolved_at DESC LIMIT ?`).all(limit) as OpsIncidentRow[],
  incidentByThread: (slackTs: string): OpsIncidentRow | undefined =>
    getDb().prepare(`SELECT * FROM ops_incidents WHERE slack_ts = ?`).get(slackTs) as OpsIncidentRow | undefined,
  incidentById: (id: number): OpsIncidentRow | undefined =>
    getDb().prepare(`SELECT * FROM ops_incidents WHERE id = ?`).get(id) as OpsIncidentRow | undefined,
  setIncidentSlackTs: (id: number, ts: string): void => {
    getDb().prepare(`UPDATE ops_incidents SET slack_ts = ? WHERE id = ?`).run(ts, id);
  },
  setIncidentStatus: (id: number, status: OpsIncidentStatus, lastAction?: string | null): void => {
    if (lastAction === undefined) {
      getDb().prepare(`UPDATE ops_incidents SET status = ? WHERE id = ?`).run(status, id);
    } else {
      getDb().prepare(`UPDATE ops_incidents SET status = ?, last_action = ? WHERE id = ?`).run(status, lastAction, id);
    }
  },
  markIncidentRestart: (id: number, iso: string): void => {
    getDb().prepare(`UPDATE ops_incidents SET last_restart_at = ? WHERE id = ?`).run(iso, id);
  },
  markIncidentDeploy: (id: number, iso: string): void => {
    getDb().prepare(`UPDATE ops_incidents SET last_deploy_at = ? WHERE id = ?`).run(iso, id);
  },
  /** Marks resolved and suffixes the fingerprint with #id so a recurrence opens a new incident. */
  resolveIncident: (id: number): void => {
    getDb().prepare(
      `UPDATE ops_incidents SET status = 'resolved', resolved_at = datetime('now'), fingerprint = fingerprint || '#' || id WHERE id = ?`
    ).run(id);
  },

  // -------- Probe inputs for the ops detector --------
  errorRowsSince: (sinceSqlite: string, limit = 200) =>
    getDb().prepare(
      `SELECT id, occurred_at, source, message, stack FROM error_log
        WHERE level = 'error' AND occurred_at > ? ORDER BY occurred_at DESC LIMIT ?`
    ).all(sinceSqlite, limit) as Array<{ id: number; occurred_at: string; source: string | null; message: string; stack: string | null }>,
  /**
   * Monotonic-id cursor variant of errorRowsSince, for the ops detector's
   * incremental scan: ordered ascending (oldest unseen first) so the caller
   * can track "highest id read" without missing or reprocessing a row
   * regardless of how many share a timestamp or how large a backlog is.
   * Excludes the detector's own probe-failure log rows (source
   * 'ops-detector') so it can never manufacture incidents about itself.
   */
  errorRowsAfterId: (afterId: number, limit = 200) =>
    getDb().prepare(
      `SELECT id, occurred_at, source, message, stack FROM error_log
        WHERE level = 'error' AND id > ? AND (source IS NULL OR source <> 'ops-detector')
        ORDER BY id ASC LIMIT ?`
    ).all(afterId, limit) as Array<{ id: number; occurred_at: string; source: string | null; message: string; stack: string | null }>,
  /**
   * Highest id currently in error_log (0 for an empty table). Used to seed
   * the ops detector's error cursor on first boot so a pre-existing backlog
   * of error rows doesn't all become one incident the first time the
   * detector runs — see errorRowsAfterId above for the cursor itself.
   */
  maxErrorLogId: (): number => {
    const r = getDb().prepare(`SELECT MAX(id) as m FROM error_log`).get() as { m: number | null };
    return r?.m ?? 0;
  },
  failedJobRunsSince: (sinceSqlite: string) =>
    getDb().prepare(
      `SELECT job, started_at, message FROM job_runs WHERE ok = 0 AND started_at > ? ORDER BY started_at DESC`
    ).all(sinceSqlite) as Array<{ job: string; started_at: string; message: string | null }>,
  latestJobRunOk: (job: string): boolean | null => {
    const r = getDb().prepare(
      `SELECT ok FROM job_runs WHERE job = ? AND ok IS NOT NULL ORDER BY started_at DESC LIMIT 1`
    ).get(job) as { ok: number } | undefined;
    return r ? r.ok === 1 : null;
  },
  clearStaleJobLock: (name: string, minAgeMin: number): number =>
    getDb().prepare(
      `DELETE FROM job_locks WHERE name = ? AND started_at < datetime('now', ? || ' minutes')`
    ).run(name, `-${Math.max(1, Math.floor(minAgeMin))}`).changes,

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
  /** Most recent 'access' audit row for a user, split by origin (internal = from the server itself). */
  lastAccessAuditAt: (userId: number, internal: boolean): string | null =>
    (getDb().prepare(
      `SELECT a.occurred_at FROM audit_log a
        WHERE a.user_id = ? AND a.action = 'access' AND ${internal ? 'NOT ' : ''}(${AUDIT_NOT_INTERNAL})
        ORDER BY a.occurred_at DESC LIMIT 1`
    ).get(userId) as { occurred_at: string } | undefined)?.occurred_at ?? null,

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

  // -------- Client telemetry --------
  insertUserEvents: (rows: Array<{
    session_id: string;
    user_id?: number | null;
    event_type: string;
    path?: string | null;
    target?: string | null;
    value?: string | null;
    x?: number | null;
    y?: number | null;
    move_count?: number | null;
    duration_ms?: number | null;
    detail?: unknown;
    user_agent?: string | null;
    ip?: string | null;
  }>) => {
    if (rows.length === 0) return;
    const db = getDb();
    const ins = db.prepare(
      `INSERT INTO user_events
        (session_id, user_id, event_type, path, target, value, x, y, move_count, duration_ms, detail, user_agent, ip)
       VALUES
        (@session_id, @user_id, @event_type, @path, @target, @value, @x, @y, @move_count, @duration_ms, @detail, @user_agent, @ip)`
    );
    db.transaction((batch: typeof rows) => {
      for (const row of batch) {
        ins.run({
          session_id: row.session_id,
          user_id: row.user_id ?? null,
          event_type: row.event_type,
          path: row.path ?? null,
          target: row.target ?? null,
          value: row.value ?? null,
          x: row.x ?? null,
          y: row.y ?? null,
          move_count: row.move_count ?? null,
          duration_ms: row.duration_ms ?? null,
          detail: row.detail === undefined ? null : JSON.stringify(row.detail),
          user_agent: row.user_agent ?? null,
          ip: row.ip ?? null,
        });
      }
    })(rows);
  },

  // -------- Affiliate / commission --------
  /**
   * The spec's `click_out` row. Everything the network never sees lives here;
   * only the opaque token goes out as sub_id3. That keeps user identifiers out
   * of third-party systems and lets us add dimensions later without
   * renegotiating the sub-ID scheme with anyone.
   */
  insertAffiliateClick: (row: {
    token: string; user_id: number | null; search_id: number | null;
    origin: string | null; destination: string | null;
    depart_date: string | null; return_date: string | null;
    per_adult_usd: number | null; provider: string | null; marker: string | null;
    ip: string | null; user_agent: string | null;
    surface?: string | null; route_id?: string | null;
    alert_id?: number | null; alert_kind?: string | null;
    product?: string | null; sub_id?: string | null;
    price_shown_usd?: number | null; price_at_click_usd?: number | null;
    verdict?: string | null; confidence_pct?: number | null;
    minutes_since_alert?: number | null;
    option_rank?: number | null; option_name?: string | null;
  }) => getDb().prepare(
    `INSERT INTO affiliate_clicks
      (token, user_id, search_id, origin, destination, depart_date, return_date,
       per_adult_usd, provider, marker, ip, user_agent, surface, route_id,
       alert_id, alert_kind, product, sub_id, price_shown_usd, price_at_click_usd,
       verdict, confidence_pct, minutes_since_alert, option_rank, option_name)
     VALUES (@token, @user_id, @search_id, @origin, @destination, @depart_date, @return_date,
             @per_adult_usd, @provider, @marker, @ip, @user_agent, @surface, @route_id,
             @alert_id, @alert_kind, @product, @sub_id, @price_shown_usd, @price_at_click_usd,
             @verdict, @confidence_pct, @minutes_since_alert, @option_rank, @option_name)`
  ).run({
    surface: null, route_id: null,
    alert_id: null, alert_kind: null, product: null, sub_id: null,
    price_shown_usd: null, price_at_click_usd: null,
    verdict: null, confidence_pct: null, minutes_since_alert: null,
    option_rank: null, option_name: null,
    ...row,
  }),

  /**
   * Remove a reserved alert row whose every channel failed.
   *
   * The row is inserted BEFORE the send so the outbound links can carry its id
   * (that id is the alert->click join, the spec's most valuable data point). If
   * nothing actually reached the user, the reservation must not survive — a
   * phantom alert row would both understate delivery failure and poison the
   * threshold floor, silencing the route on the next cycle.
   *
   * The affiliate_clicks update is DEFENSIVE, not load-bearing: rollback only
   * happens when no channel delivered, so no link reached anyone and no click
   * can reference this id yet. It exists so that a future path which persists
   * links before delivery is confirmed cannot leave a dangling reference —
   * and it is an explicit delete rather than ON DELETE CASCADE because
   * production runs with PRAGMA foreign_keys=0, which makes cascades inert.
   */
  deleteAlert: (alertId: number) => {
    const db = getDb();
    db.prepare('UPDATE affiliate_clicks SET alert_id = NULL WHERE alert_id = ?').run(alertId);
    return db.prepare('DELETE FROM alerts_sent WHERE id = ?').run(alertId);
  },

  // ── Email delivery telemetry ────────────────────────────────────────────

  /** Record the ESP's id for an alert send, so its webhooks can be joined back. */
  setAlertMessageId: (alertId: number, messageId: string) =>
    getDb().prepare('UPDATE alerts_sent SET message_id = ? WHERE id = ?').run(messageId, alertId),

  /**
   * Store a webhook event and apply it to the alert it belongs to.
   *
   * INSERT OR IGNORE on event_id because ESPs retry: the same delivery event can
   * arrive several times and must not be counted twice. Applying the timestamp
   * with COALESCE keeps the FIRST occurrence, since events can arrive out of
   * order and "when was it delivered" should not drift later on a retry.
   */
  recordEmailEvent: (e: {
    event_id: string; event_type: string; message_id: string | null;
    recipient: string | null; occurred_at: string; raw_json: string;
  }) => {
    const db = getDb();
    const res = db.prepare(
      `INSERT OR IGNORE INTO email_events
         (event_id, event_type, message_id, recipient, occurred_at, raw_json)
       VALUES (@event_id, @event_type, @message_id, @recipient, @occurred_at, @raw_json)`
    ).run(e);
    // Already seen — do not re-apply.
    if (res.changes === 0) return { applied: false, duplicate: true };
    if (!e.message_id) return { applied: false, duplicate: false };

    const col = e.event_type === 'email.delivered' ? 'delivered_at'
              : e.event_type === 'email.opened'    ? 'opened_at'
              : e.event_type === 'email.bounced' || e.event_type === 'email.complained' ? 'bounced_at'
              : null;
    if (!col) return { applied: false, duplicate: false };

    const upd = db.prepare(
      `UPDATE alerts_sent SET ${col} = COALESCE(${col}, ?) WHERE message_id = ?`
    ).run(e.occurred_at, e.message_id);
    return { applied: upd.changes > 0, duplicate: false };
  },

  // ── Operational alarm inputs ────────────────────────────────────────────
  // Feed the pure probes in lib/ops/monetizationProbes.ts. Kept here so the
  // probes stay dependency-free and unit-testable.

  /** Per provider: how many DISTINCT prices it returned recently, and over what span. */
  providerPriceVariety: (hours = 2) =>
    getDb().prepare(
      `SELECT f.provider AS provider,
              COUNT(DISTINCT f.price_per_adult_usd) AS distinct_prices,
              COUNT(*) AS samples,
              (julianday(MAX(f.polled_at)) - julianday(MIN(f.polled_at))) * 1440 AS span_minutes
         FROM fare_snapshots f
        WHERE f.polled_at >= datetime('now', ?)
          AND f.provider IS NOT NULL
        GROUP BY f.provider`
    ).all(`-${Math.floor(hours)} hours`) as Array<{
      provider: string; distinct_prices: number; samples: number; span_minutes: number;
    }>,

  /** Suppressed alerts against alert opportunities, over a window. */
  deadFareStats: (hours = 24) => {
    const db = getDb();
    const suppressed = (db.prepare(
      `SELECT COUNT(*) AS n FROM dead_fares WHERE occurred_at >= datetime('now', ?)`
    ).get(`-${Math.floor(hours)} hours`) as { n: number }).n;
    const sent = (db.prepare(
      `SELECT COUNT(*) AS n FROM alerts_sent WHERE status = 'sent' AND sent_at >= datetime('now', ?)`
    ).get(`-${Math.floor(hours)} hours`) as { n: number }).n;
    return { suppressed, considered: suppressed + sent };
  },

  /** Today's poll spend against the trailing daily average. */
  pollSpendToday: () => {
    const db = getDb();
    const today = (db.prepare(
      `SELECT COALESCE(SUM(cost_usd), 0) AS c FROM api_calls
        WHERE called_at >= datetime('now', 'start of day')`
    ).get() as { c: number }).c;
    // Trailing 14 days EXCLUDING today, or today's own spend would drag the
    // baseline toward itself and mask the spike it is meant to catch.
    const prior = db.prepare(
      `SELECT COALESCE(SUM(cost_usd), 0) AS c FROM api_calls
        WHERE called_at >= datetime('now', '-14 days')
          AND called_at <  datetime('now', 'start of day')`
    ).get() as { c: number };
    return { today, trailingAvg: prior.c / 14 };
  },

  /** Days since the last commission event, and whether clicks are still happening. */
  commissionSilence: () => {
    const db = getDb();
    const last = db.prepare(
      `SELECT MAX(received_at) AS t FROM commission_events`
    ).get() as { t: string | null };
    const clicks = (db.prepare(
      `SELECT COUNT(*) AS n FROM affiliate_clicks WHERE occurred_at >= datetime('now', '-7 days')`
    ).get() as { n: number }).n;
    let days: number | null = null;
    if (last?.t) {
      const ms = Date.now() - Date.parse(last.t.replace(' ', 'T') + 'Z');
      days = ms / 86_400_000;
    }
    return { daysSinceLastEvent: days, hasClicks: clicks > 0 };
  },

  /**
   * Alerts attempted against alerts that reached nobody, recently.
   *
   * A reservation that was rolled back IS a delivery failure — the row is gone,
   * so failures are counted from the dead-letter side: attempts logged by the
   * poller minus rows that survived as 'sent'.
   */
  /**
   * Sent mail vs. delivery events over a window — the input to the silence
   * probe. Sent = alerts_sent rows plus chain sends, since both go through the
   * same ESP and either alone can be quiet for a day.
   */
  deliverySilenceStats: (hours = 24) => {
    const db = getDb();
    const w = `-${Math.floor(hours)} hours`;
    const alerts = (db.prepare(
      `SELECT COUNT(*) AS n FROM alerts_sent WHERE status = 'sent' AND sent_at >= datetime('now', ?)`,
    ).get(w) as { n: number }).n;
    const chain = (db.prepare(
      `SELECT COUNT(*) AS n FROM chain_sends WHERE status = 'sent' AND sent_at >= datetime('now', ?)`,
    ).get(w) as { n: number }).n;
    const events = (db.prepare(
      `SELECT COUNT(*) AS n FROM email_events WHERE received_at >= datetime('now', ?)`,
    ).get(w) as { n: number }).n;
    return { sentInWindow: alerts + chain, eventsInWindow: events, windowHours: Math.floor(hours) };
  },

  alertDeliveryStats: (hours = 6) => {
    const db = getDb();
    const sent = (db.prepare(
      `SELECT COUNT(*) AS n FROM alerts_sent
        WHERE status = 'sent' AND sent_at >= datetime('now', ?)`
    ).get(`-${Math.floor(hours)} hours`) as { n: number }).n;
    const failed = (db.prepare(
      `SELECT COUNT(*) AS n FROM error_log
        WHERE source = 'alert:delivery' AND occurred_at >= datetime('now', ?)`
    ).get(`-${Math.floor(hours)} hours`) as { n: number }).n;
    return { attempted: sent + failed, failed };
  },

  // ── Fare truth ──────────────────────────────────────────────────────────

  insertProviderDisagreement: (row: {
    route_key: string; search_id: number | null;
    provider_a: string; provider_b: string;
    price_a: number; price_b: number; delta_pct: number;
  }) => getDb().prepare(
    `INSERT INTO provider_disagreements
       (route_key, search_id, provider_a, provider_b, price_a, price_b, delta_pct)
     VALUES (@route_key, @search_id, @provider_a, @provider_b, @price_a, @price_b, @delta_pct)`
  ).run(row),

  /**
   * A suppressed alert. Written every time verification refuses to send, so the
   * cost of the suppression rule is visible rather than guessed at — the rule is
   * only defensible if you can see what it caught.
   */
  insertDeadFare: (row: {
    search_id: number; fare_snapshot_id: number | null; alert_kind: string;
    polled_price_usd: number; verified_price_usd: number | null;
    delta_pct: number | null; polled_by: string | null; verified_by: string | null;
    reason: string;
  }) => getDb().prepare(
    `INSERT INTO dead_fares
       (search_id, fare_snapshot_id, alert_kind, polled_price_usd, verified_price_usd,
        delta_pct, polled_by, verified_by, reason)
     VALUES (@search_id, @fare_snapshot_id, @alert_kind, @polled_price_usd, @verified_price_usd,
             @delta_pct, @polled_by, @verified_by, @reason)`
  ).run(row),

  /** Stamp a snapshot with what verification found. */
  setFareVerification: (snapshotId: number, v: {
    verified_at: string; verified_price_usd: number | null;
    verified_by: string | null; verify_outcome: string;
  }) => getDb().prepare(
    `UPDATE fare_snapshots
        SET verified_at = @verified_at, verified_price_usd = @verified_price_usd,
            verified_by = @verified_by, verify_outcome = @verify_outcome
      WHERE id = @id`
  ).run({ id: snapshotId, ...v }),

  /** Record a buy/wait call so it can be scored against what actually happened. */
  insertVerdictCall: (row: {
    search_id: number; route_key: string; origin: string; destination: string;
    verdict: string; confidence_pct: number; price_at_call_usd: number;
  }) => getDb().prepare(
    `INSERT OR IGNORE INTO verdict_calls
       (search_id, route_key, origin, destination, verdict, confidence_pct, price_at_call_usd)
     VALUES (@search_id, @route_key, @origin, @destination, @verdict, @confidence_pct, @price_at_call_usd)`
  ).run(row),

  /** Calls whose horizon has elapsed and which have not been scored yet. */
  verdictCallsDueForScoring: (horizonDays: number, column: 'correct_7d' | 'correct_14d') =>
    getDb().prepare(
      `SELECT * FROM verdict_calls
        WHERE ${column} IS NULL
          AND called_at <= datetime('now', ?)
        ORDER BY called_at ASC LIMIT 500`
    ).all(`-${Math.floor(horizonDays)} days`) as Array<{
      id: number; search_id: number; verdict: string; price_at_call_usd: number; called_at: string;
    }>,

  /** Lowest per-adult price seen for a search within N days AFTER a moment.
   *  A fare verification ruled DEAD was never real; including it drags the
        -- route's "normal" down, changes future mistake-fare classification, and
        -- (worst) flips correct `buy` calls to incorrect when a phantom low lands
        -- inside a scoring horizon. COALESCE because the column is NULL on every
        -- snapshot that was never put through verification, which is most of them. */
  minPriceAfter: (searchId: number, sinceIso: string, days: number) =>
    (getDb().prepare(
      `SELECT MIN(price_per_adult_usd) AS p FROM fare_snapshots
        WHERE search_id = ? AND polled_at > ? AND polled_at <= datetime(?, ?)
          AND COALESCE(verify_outcome, 'ok') <> 'dead'`
    ).get(searchId, sinceIso, sinceIso, `+${Math.floor(days)} days`) as { p: number | null }).p,

  scoreVerdictCall: (id: number, v: {
    column: 'correct_7d' | 'correct_14d'; minColumn: 'min_price_7d_usd' | 'min_price_14d_usd';
    correct: number; minPrice: number | null;
  }) => getDb().prepare(
    `UPDATE verdict_calls
        SET ${v.column} = ?, ${v.minColumn} = ?, scored_at = datetime('now')
      WHERE id = ?`
  ).run(v.correct, v.minPrice, id),

  /**
   * Alerts delivered to this user today, for the frequency cap.
   *
   * Counts only rows that actually reached someone (status='sent'), and only
   * the kinds the cap applies to — a mistake fare is exempt, so counting it
   * here would let one glitch fare silence the rest of the day.
   */
  alertsSentToday: (userId: number) =>
    (getDb().prepare(
      `SELECT COUNT(*) AS n FROM alerts_sent a
         JOIN searches s ON s.id = a.search_id
        WHERE s.user_id = ? AND a.status = 'sent'
          AND a.kind <> 'mistake-fare'
          AND a.sent_at >= datetime('now', '-1 day')`
    ).get(userId) as { n: number }).n,

  // ── The org work queue ──────────────────────────────────────────────────

  /** Capture the baseline once, and only once. */
  captureBaseline: (searchId: number, amountUsd: number, basis: string) =>
    getDb().prepare(
      `UPDATE searches
          SET baseline_amount_usd = ?, baseline_basis = ?, baseline_captured_at = datetime('now')
        WHERE id = ? AND baseline_amount_usd IS NULL`
    ).run(amountUsd, basis, searchId),

  /**
   * Record what was actually paid.
   *
   * "Mark-booked is the one the whole B2B product depends on. Without it the
   *  savings report has no numerator."
   *
   * The watch does NOT die on booking — it flips to post-booking monitoring for
   * the rebooking window, which is where the post-booking-drop alert lives.
   */
  markWatchBooked: (searchId: number, amountUsd: number) =>
    getDb().prepare(
      `UPDATE searches
          SET status = 'booked', booked_at = datetime('now'), booked_amount_usd = ?
        WHERE id = ?`
    ).run(amountUsd, searchId),

  /**
   * The post-trip answer, on the watch. 'no' means plans changed: the watch is
   * left alone, and the savings report will list it as unscored rather than
   * counting a trip that never happened.
   */
  recordTravelled: (searchId: number, answer: 'yes' | 'no') =>
    getDb().prepare(`UPDATE searches SET travelled_answer = ? WHERE id = ?`).run(answer, searchId),

  // ── Monthly savings reports ──────────────────────────────────────────────

  /** Queue one report. Idempotent per (group, period) via the unique index. */
  queueReportSend: (r: {
    org_id: number; group_id: number; period_start: string; period_end: string;
    to_email: string | null; summary_json: string;
  }) =>
    getDb().prepare(
      `INSERT OR IGNORE INTO report_sends (org_id, group_id, period_start, period_end, to_email, summary_json)
       VALUES (@org_id, @group_id, @period_start, @period_end, @to_email, @summary_json)`,
    ).run(r),

  reportSendsForOrg: (orgId: number, status?: string) =>
    getDb().prepare(
      `SELECT r.*, g.name AS group_name
         FROM report_sends r JOIN groups g ON g.id = r.group_id
        WHERE r.org_id = ? ${status ? 'AND r.status = ?' : ''}
        ORDER BY r.period_start DESC, g.name`,
    ).all(...(status ? [orgId, status] : [orgId])) as Array<ReportSendRow & { group_name: string }>,

  reportSendCounts: (orgId: number) => {
    const rows = getDb().prepare(
      `SELECT status, COUNT(*) AS n FROM report_sends WHERE org_id = ? GROUP BY status`,
    ).all(orgId) as Array<{ status: string; n: number }>;
    const out: Record<string, number> = { queued: 0, approved: 0, sent: 0, skipped: 0, failed: 0 };
    for (const r of rows) out[r.status] = r.n;
    return out;
  },

  /**
   * Approve several at once — the bulk action the spec asks for.
   *
   * The org id is in the WHERE, not trusted from the form: a list of ids is
   * user input, and without it an admin of one agency could approve another
   * agency's reports into their clients' inboxes. Only QUEUED rows move, so an
   * id that was already sent or skipped is ignored rather than re-sent.
   */
  approveReportSends: (ids: number[], orgId: number, userId: number): number => {
    if (ids.length === 0) return 0;
    const marks = ids.map(() => '?').join(',');
    return getDb().prepare(
      `UPDATE report_sends
          SET status = 'approved', approved_by = ?, approved_at = datetime('now')
        WHERE id IN (${marks}) AND org_id = ? AND status = 'queued'`,
    ).run(userId, ...ids, orgId).changes;
  },

  skipReportSend: (id: number, orgId: number, reason: string) =>
    getDb().prepare(
      `UPDATE report_sends SET status = 'skipped', skip_reason = ?
        WHERE id = ? AND org_id = ? AND status IN ('queued', 'approved')`,
    ).run(reason, id, orgId),

  approvedReportSends: (limit = 100) =>
    getDb().prepare(
      `SELECT r.*, g.name AS group_name, g.contact_email
         FROM report_sends r JOIN groups g ON g.id = r.group_id
        WHERE r.status = 'approved' ORDER BY r.approved_at ASC LIMIT ?`,
    ).all(limit) as Array<ReportSendRow & { group_name: string; contact_email: string | null }>,

  markReportSend: (id: number, status: 'sent' | 'skipped' | 'failed', extra?: { messageId?: string; reason?: string }) =>
    getDb().prepare(
      `UPDATE report_sends
          SET status = ?, message_id = COALESCE(?, message_id), skip_reason = ?,
              sent_at = CASE WHEN ? = 'sent' THEN datetime('now') ELSE sent_at END
        WHERE id = ?`,
    ).run(status, extra?.messageId ?? null, extra?.reason ?? null, status, id),

  allOrgs: () =>
    getDb().prepare(`SELECT id, name, tier, from_name FROM organizations WHERE archived_at IS NULL`).all() as
      Array<{ id: number; name: string; tier: string; from_name: string | null }>,

  /** Undo, for the inevitable mis-click. */
  unmarkWatchBooked: (searchId: number) =>
    getDb().prepare(
      `UPDATE searches SET status = 'active', booked_at = NULL, booked_amount_usd = NULL WHERE id = ?`
    ).run(searchId),

  /** Every watch in an org, with the group it belongs to. */
  watchesForOrg: (orgId: number) =>
    getDb().prepare(
      `SELECT s.*, g.name AS group_name, g.contact_email AS group_contact
         FROM searches s
         JOIN groups g ON g.id = s.group_id
        WHERE g.org_id = ? AND g.archived_at IS NULL
        ORDER BY s.depart_date`
    ).all(orgId) as Array<Record<string, unknown>>,

  /** Every watch belonging to one group. */
  watchesForGroup: (groupId: number) =>
    getDb().prepare(
      `SELECT * FROM searches WHERE group_id = ? ORDER BY depart_date`
    ).all(groupId) as Array<Record<string, unknown>>,

  /** Groups with nothing happening, for the fourth queue category. */
  groupsWithNoActivity: (orgId: number, days = 30) =>
    getDb().prepare(
      `SELECT g.* FROM groups g
        WHERE g.org_id = ? AND g.archived_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM searches s
             WHERE s.group_id = g.id
               AND (s.created_at >= datetime('now', ?) OR s.booked_at >= datetime('now', ?))
          )
          AND NOT EXISTS (
            SELECT 1 FROM alerts_sent a JOIN searches s2 ON s2.id = a.search_id
             WHERE s2.group_id = g.id AND a.status = 'sent' AND a.sent_at >= datetime('now', ?)
          )
        ORDER BY g.name`
    ).all(orgId, `-${days} days`, `-${days} days`, `-${days} days`) as Array<{
      id: number; org_id: number; name: string; contact_email: string | null;
    }>,

  // ── Deferred alerts ─────────────────────────────────────────────────────

  /** Hold an alert for the digest. INSERT OR IGNORE: still-true is not new. */
  deferAlert: (row: {
    search_id: number; user_id: number | null; kind: string;
    reason: string | null; headline: string; price_per_adult_usd: number | null;
  }) => getDb().prepare(
    `INSERT OR IGNORE INTO deferred_alerts
       (search_id, user_id, kind, reason, headline, price_per_adult_usd)
     VALUES (@search_id, @user_id, @kind, @reason, @headline, @price_per_adult_usd)`
  ).run(row),

  /** Everything still waiting to go out in this user's next digest. */
  pendingDeferredAlerts: (userId: number) =>
    getDb().prepare(
      `SELECT * FROM deferred_alerts
        WHERE user_id = ? AND delivered_at IS NULL
        ORDER BY created_at`
    ).all(userId) as Array<{
      id: number; search_id: number; kind: string; reason: string | null;
      headline: string; price_per_adult_usd: number | null; created_at: string;
    }>,

  /** Mark them delivered once the digest carrying them has actually sent. */
  markDeferredDelivered: (ids: number[]) => {
    if (ids.length === 0) return;
    getDb().prepare(
      `UPDATE deferred_alerts SET delivered_at = datetime('now')
        WHERE id IN (${ids.map(() => '?').join(',')})`
    ).run(...ids);
  },

  /** Has this watch already had a given alert kind, ever? For once-only types. */
  hasEverAlerted: (searchId: number, kind: string) =>
    ((getDb().prepare(
      `SELECT COUNT(*) AS n FROM alerts_sent WHERE search_id = ? AND kind = ? AND status = 'sent'`
    ).get(searchId, kind) as { n: number }).n) > 0,

  /** The last verdict we recorded for a watch, for detecting a flip. */
  lastVerdictFor: (searchId: number) =>
    (getDb().prepare(
      `SELECT verdict FROM verdict_calls WHERE search_id = ?
        ORDER BY called_at DESC LIMIT 1`
    ).get(searchId) as { verdict: string } | undefined)?.verdict ?? null,

  /** When an alert fired — used to derive minutes-since-alert at click time. */
  alertSentAt: (alertId: number) =>
    getDb().prepare('SELECT sent_at, kind FROM alerts_sent WHERE id = ?').get(alertId) as
      { sent_at: string; kind: string } | undefined,

  /** Fill in the click-time re-query result once it lands (async, after the redirect). */
  setClickPriceAtClick: (token: string, priceUsd: number) =>
    getDb().prepare(
      `UPDATE affiliate_clicks SET price_at_click_usd = ? WHERE token = ?`
    ).run(priceUsd, token),

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

  // -------- Admin overview: revenue + signups + ops helpers --------
  // These power the new admin portal (src/app/admin/*). Computed entirely
  // from existing tables — no new schema. Revenue here is the commission
  // pipeline (commission_events); MRR is computed from users.tier in
  // adminMetrics().
  commissionsThisMonth: (): number =>
    (getDb().prepare(
      `SELECT COALESCE(SUM(amount_usd), 0) AS s FROM commission_events
       WHERE strftime('%Y-%m', received_at) = strftime('%Y-%m', 'now')`
    ).get() as { s: number }).s,

  commissionsLastMonth: (): number =>
    (getDb().prepare(
      `SELECT COALESCE(SUM(amount_usd), 0) AS s FROM commission_events
       WHERE strftime('%Y-%m', received_at) = strftime('%Y-%m', 'now', '-1 month')`
    ).get() as { s: number }).s,

  signupsToday: (): number =>
    (getDb().prepare(
      `SELECT COUNT(*) AS n FROM users WHERE date(created_at) = date('now')`
    ).get() as { n: number }).n,

  signupsLastNDays: (days: number): number =>
    (getDb().prepare(
      `SELECT COUNT(*) AS n FROM users WHERE created_at >= datetime('now', ?)`
    ).get(`-${days} days`) as { n: number }).n,

  countActiveSearches: (): number =>
    (getDb().prepare(
      `SELECT COUNT(*) AS n FROM searches WHERE active = 1
         AND (snoozed_until IS NULL OR snoozed_until < datetime('now'))`
    ).get() as { n: number }).n,

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

  listActiveSearchesForUser: (userId: number) =>
    getDb().prepare(
      `SELECT * FROM searches
       WHERE user_id = ? AND active = 1
       ORDER BY sort_order ASC, created_at DESC`
    ).all(userId) as SearchRow[],

  listActiveSearchesPreview: (limit = 12) =>
    getDb().prepare(
      `SELECT * FROM searches
       WHERE active = 1
         AND (snoozed_until IS NULL OR snoozed_until < datetime('now'))
       ORDER BY created_at DESC
       LIMIT ?`
    ).all(limit) as SearchRow[],

  // -------- Multi-destination cache support --------
  // Returns the distinct destination airports across every active tracked search.
  // Used by the best-deals refresh job + dashboard.
  distinctTrackedDestinations: (): string[] =>
    (getDb().prepare(
      `SELECT DISTINCT destination FROM searches WHERE active = 1 ORDER BY destination LIMIT 30`
    ).all() as Array<{ destination: string }>).map(r => r.destination),

  // Returns the distinct (origin, destination) pairs across every active tracked search.
  // Used to derive the origin pool for each destination on refresh.
  distinctTrackedRoutes: (): Array<{ origin: string; destination: string }> =>
    getDb().prepare(
      `SELECT DISTINCT origin, destination FROM searches WHERE active = 1 ORDER BY destination, origin LIMIT 200`
    ).all() as Array<{ origin: string; destination: string }>,

  // Every route with cached fares + deal count + floor price. Drives the public
  // /routes index page ("0 routes tracked" bug was this query not existing —
  // the page probes it defensively via optional chaining).
  distinctRoutesInCache: (): Array<{ origin: string; destination: string; deals: number; min_usd: number }> =>
    getDb().prepare(
      `SELECT origin, destination, COUNT(*) as deals, MIN(per_adult_usd) as min_usd
       FROM best_deals_cache
       GROUP BY origin, destination
       ORDER BY deals DESC
       LIMIT 100`
    ).all() as Array<{ origin: string; destination: string; deals: number; min_usd: number }>,

  // Returns the user's distinct (origin, destination) pairs — drives the Route DNA
  // switcher dropdown.
  distinctTrackedRoutesForUser: (userId: number): Array<{ origin: string; destination: string }> =>
    getDb().prepare(
      `SELECT DISTINCT origin, destination FROM searches WHERE active = 1 AND user_id = ? ORDER BY destination, origin LIMIT 50`
    ).all(userId) as Array<{ origin: string; destination: string }>,

  // Aggregates for /api/route-dna — driven by the best_deals_cache rows for a route.
  bestDealsRouteStats: (origin: string, destination: string) => {
    const rows = getDb().prepare(
      `SELECT outbound_dow, outbound_hour, trip_length_days, per_adult_usd
         FROM best_deals_cache
        WHERE origin = ? AND destination = ?`
    ).all(origin, destination) as Array<{ outbound_dow: number; outbound_hour: number; trip_length_days: number; per_adult_usd: number }>;
    return rows;
  },

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
      `INSERT INTO searches (origin, destination, depart_date, return_date, adults, infants, active, user_id, target_per_adult_usd, date_mode)
       VALUES (@origin, @destination, @depart_date, @return_date, @adults, @infants, @active, @user_id, @target_per_adult_usd, @date_mode)`
    ).run({ active: 1, user_id: 1, target_per_adult_usd: null, date_mode: 'exact', ...s }),

  /** Cached cheapest-per-month rows for a route, fresher than `maxAgeHours`. */
  cheapestMonthCached: (origin: string, destination: string, maxAgeHours = 6) =>
    getDb().prepare(
      `SELECT month, price_usd, depart_date, return_date FROM cheapest_month_cache
        WHERE origin = ? AND destination = ?
          AND refreshed_at >= datetime('now', ?)
        ORDER BY price_usd ASC`
    ).all(origin, destination, `-${maxAgeHours} hours`) as Array<{
      month: string; price_usd: number; depart_date: string; return_date: string | null }>,

  upsertCheapestMonth: (r: { origin: string; destination: string; month: string; price_usd: number; depart_date: string; return_date: string | null }) =>
    getDb().prepare(
      `INSERT INTO cheapest_month_cache (origin, destination, month, price_usd, depart_date, return_date, refreshed_at)
       VALUES (@origin, @destination, @month, @price_usd, @depart_date, @return_date, datetime('now'))
       ON CONFLICT(origin, destination, month) DO UPDATE SET
         price_usd = excluded.price_usd, depart_date = excluded.depart_date,
         return_date = excluded.return_date, refreshed_at = excluded.refreshed_at`
    ).run(r),

  /** Cheapest known pairing for a route from the 12-month best-deals scan. */
  cheapestFromBestDeals: (origin: string, destination: string) =>
    getDb().prepare(
      `SELECT per_adult_usd, party_total_usd, outbound_date, return_date,
              outbound_flight_no, return_flight_no, provider
         FROM best_deals_cache
        WHERE origin = ? AND destination = ?
        ORDER BY per_adult_usd ASC LIMIT 1`
    ).get(origin, destination) as {
      per_adult_usd: number; party_total_usd: number; outbound_date: string; return_date: string;
      outbound_flight_no: string | null; return_flight_no: string | null; provider: string } | undefined,

  /**
   * One search row by id, for ownership checks.
   *
   * The API handlers that pause, snooze and DELETE a route had no way to ask
   * "is this theirs?" and so did not ask. A route id is a small integer.
   */
  getSearchById: (id: number) =>
    getDb().prepare('SELECT * FROM searches WHERE id = ?').get(id) as SearchRow | undefined,

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
         AND COALESCE(verify_outcome, 'ok') <> 'dead'
       ORDER BY polled_at`
    ).all(searchId, `-${days} days`) as FareRow[],

  /** Daily cheapest-per-adult for a route (downsampled from 30-min snapshots) — for the trend chart. */
  fareHistoryDaily: (searchId: number, days = 60) =>
    getDb().prepare(
      `SELECT date(polled_at) AS day, MIN(price_per_adult_usd) AS per_adult_usd
       FROM fare_snapshots
       WHERE search_id = ? AND polled_at >= datetime('now', ?)
         AND COALESCE(verify_outcome, 'ok') <> 'dead'
       GROUP BY date(polled_at) ORDER BY day`
    ).all(searchId, `-${days} days`) as Array<{ day: string; per_adult_usd: number }>,

  /** Set/clear a route's per-adult alert target (null clears it → falls back to default). */
  setSearchTarget: (searchId: number, target: number | null) =>
    getDb().prepare(`UPDATE searches SET target_per_adult_usd = ? WHERE id = ?`).run(target, searchId),

  /** Recent price-drop alerts for one user (their routes only; deleted routes drop out). */
  alertsForUser: (userId: number, limit = 50) =>
    getDb().prepare(
      `SELECT a.id, a.price_per_adult_usd, a.sent_at, a.kind,
              s.origin, s.destination, s.depart_date, s.return_date
       FROM alerts_sent a JOIN searches s ON s.id = a.search_id
       WHERE s.user_id = ?
       ORDER BY a.sent_at DESC LIMIT ?`
    ).all(userId, limit) as Array<{
      id: number; price_per_adult_usd: number; sent_at: string; kind: string;
      origin: string; destination: string; depart_date: string; return_date: string;
    }>,

  insertAlert: (
    searchId: number, snapshotId: number, pricePerAdult: number,
    kind: AlertKind = 'threshold',
    status: 'pending' | 'sent' = 'sent',
  ) =>
    getDb().prepare(
      'INSERT INTO alerts_sent (search_id, fare_snapshot_id, price_per_adult_usd, kind, status) VALUES (?, ?, ?, ?, ?)'
    ).run(searchId, snapshotId, pricePerAdult, kind, status),

  /** Promote a reserved row once a channel has actually delivered. */
  markAlertSent: (alertId: number) =>
    getDb().prepare(`UPDATE alerts_sent SET status = 'sent' WHERE id = ?`).run(alertId),

  /** Most recent alert for a search, optionally only within the last
   *  `withinDays` days.
   *
   *  The window matters: the threshold branch in the poller only re-alerts
   *  when a fare beats the last alerted price, so an unbounded lookup lets a
   *  single historic low silence a route permanently (EWR-DXB alerted at $361
   *  on 2026-08-01 and never fired again while the market sat at $506). Bounding
   *  the comparison lets the floor decay, so the route re-arms once the old
   *  alert ages out. */
  lastAlertForSearch: (searchId: number, withinDays?: number) =>
    (withinDays && withinDays > 0
      ? getDb().prepare(
          `SELECT * FROM alerts_sent WHERE search_id = ? AND status = 'sent'
             AND sent_at > datetime('now', ?)
           ORDER BY sent_at DESC LIMIT 1`
        ).get(searchId, `-${Math.floor(withinDays)} days`)
      : getDb().prepare(
          `SELECT * FROM alerts_sent WHERE search_id = ? AND status = 'sent' ORDER BY sent_at DESC LIMIT 1`
        ).get(searchId)
    ) as { id: number; price_per_adult_usd: number; sent_at: string; kind?: string } | undefined,

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

  /**
   * Record one provider API call.
   *
   * `provider` and `cost_usd` are what turn this table from a latency log into
   * the COGS side of the business. cost_usd is resolved by the caller from the
   * `provider_costs` setting and frozen here, so re-pricing a provider next
   * month never rewrites what last month actually cost.
   */
  logApiCall: (params: {
    search_id: number | null; ok: boolean; status_code?: number; ms?: number; error?: string;
    provider?: string | null; cost_usd?: number;
    phase?: 'sweep' | 'verify' | 'ondemand' | 'click';
    band?: string | null; route_key?: string | null;
  }) =>
    getDb().prepare(
      `INSERT INTO api_calls (search_id, ok, status_code, ms, error, provider, cost_usd, phase, band, route_key)
       VALUES (@search_id, @ok, @status_code, @ms, @error, @provider, @cost_usd, @phase, @band, @route_key)`
    ).run({
      search_id: params.search_id,
      ok: params.ok ? 1 : 0,
      status_code: params.status_code ?? null,
      ms: params.ms ?? null,
      error: params.error ?? null,
      provider: params.provider ?? null,
      cost_usd: params.cost_usd ?? 0,
      phase: params.phase ?? 'sweep',
      band: params.band ?? null,
      route_key: params.route_key ?? null,
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

  // -------- AI agents (phase 1) --------
  // Candidate deals for the curator: the freshest best_deals_cache rows, ranked
  // cheapest-first but deduped to one row per (origin,destination) so the
  // curator sees a diverse pool rather than ten variants of the same route.
  agentCandidateDeals: (limit = 40) =>
    getDb().prepare(
      `SELECT origin, destination, outbound_date, return_date,
              per_adult_usd, party_total_usd, trip_length_days,
              outbound_transfers, return_transfers, provider
         FROM best_deals_cache b
        WHERE b.id = (
          SELECT id FROM best_deals_cache
           WHERE origin = b.origin AND destination = b.destination
           ORDER BY per_adult_usd ASC LIMIT 1
        )
        ORDER BY per_adult_usd ASC
        LIMIT ?`
    ).all(limit) as Array<{
      origin: string; destination: string; outbound_date: string; return_date: string;
      per_adult_usd: number; party_total_usd: number; trip_length_days: number;
      outbound_transfers: number; return_transfers: number; provider: string;
    }>,

  // Median per-adult price for a route across the cache — gives the curator a
  // cheap deterministic "how good is this really" baseline.
  agentRouteMedian: (origin: string, destination: string) => {
    const rows = getDb().prepare(
      `SELECT per_adult_usd FROM best_deals_cache WHERE origin = ? AND destination = ? ORDER BY per_adult_usd ASC`
    ).all(origin, destination) as Array<{ per_adult_usd: number }>;
    if (rows.length === 0) return null;
    return rows[Math.floor(rows.length / 2)].per_adult_usd;
  },

  startAgentRun: (agent: string, model: string | null, dryRun: boolean): number => {
    const r = getDb().prepare(
      `INSERT INTO agent_runs (agent, model, dry_run) VALUES (?, ?, ?)`
    ).run(agent, model, dryRun ? 1 : 0);
    return Number(r.lastInsertRowid);
  },
  finishAgentRun: (id: number, opts: { ok: boolean; durationMs: number; summary?: string | null; outputJson?: string | null; error?: string | null }) =>
    getDb().prepare(
      `UPDATE agent_runs SET finished_at = datetime('now'), ok = ?, duration_ms = ?,
              summary = ?, output_json = ?, error = ? WHERE id = ?`
    ).run(opts.ok ? 1 : 0, opts.durationMs, opts.summary ?? null, opts.outputJson ?? null, opts.error ?? null, id),

  insertCuratedPick: (p: {
    run_id: number; origin: string; destination: string; outbound_date: string; return_date: string;
    per_adult_usd: number; party_total_usd: number | null; trip_length_days: number | null;
    headline: string; blurb: string; score: number | null; verified: boolean; verify_note: string | null;
  }) =>
    getDb().prepare(
      `INSERT INTO curated_picks
        (run_id, origin, destination, outbound_date, return_date, per_adult_usd,
         party_total_usd, trip_length_days, headline, blurb, score, verified, verify_note)
       VALUES
        (@run_id, @origin, @destination, @outbound_date, @return_date, @per_adult_usd,
         @party_total_usd, @trip_length_days, @headline, @blurb, @score, @verified, @verify_note)`
    ).run({ ...p, verified: p.verified ? 1 : 0 }),

  curatedPicksForRun: (runId: number) =>
    getDb().prepare(`SELECT * FROM curated_picks WHERE run_id = ? ORDER BY score DESC, per_adult_usd ASC`).all(runId) as Array<{
      id: number; run_id: number; created_at: string; origin: string; destination: string;
      outbound_date: string; return_date: string; per_adult_usd: number; party_total_usd: number | null;
      trip_length_days: number | null; headline: string; blurb: string; score: number | null;
      verified: number; verify_note: string | null; broadcast: number;
    }>,

  latestAgentRun: (agent: string) =>
    getDb().prepare(`SELECT * FROM agent_runs WHERE agent = ? ORDER BY started_at DESC LIMIT 1`).get(agent) as
      { id: number; agent: string; started_at: string; finished_at: string | null; ok: number | null;
        model: string | null; dry_run: number; duration_ms: number | null; summary: string | null;
        output_json: string | null; error: string | null } | undefined,

  // -------- Insights (ops brief) source counters --------
  // 24h activity snapshot the insights agent narrates. Cheap aggregate reads —
  // no LLM. The agent turns these numbers into a 250-word operator brief.
  agentInsightsSnapshot: () => {
    const db = getDb();
    const num = (sql: string, ...args: unknown[]) =>
      ((db.prepare(sql).get(...args) as { n: number } | undefined)?.n ?? 0);
    return {
      activeSearches: num(`SELECT COUNT(*) AS n FROM searches WHERE active = 1`),
      usersTotal: num(`SELECT COUNT(*) AS n FROM users`),
      signups24h: num(`SELECT COUNT(*) AS n FROM users WHERE created_at > datetime('now','-1 day')`),
      pollsToday: num(`SELECT COUNT(*) AS n FROM fare_snapshots WHERE polled_at > datetime('now','-1 day')`),
      alerts24h: num(`SELECT COUNT(*) AS n FROM alerts_sent WHERE sent_at > datetime('now','-1 day')`),
      apiCalls24h: num(`SELECT COUNT(*) AS n FROM api_calls WHERE called_at > datetime('now','-1 day')`),
      apiErrors24h: num(`SELECT COUNT(*) AS n FROM api_calls WHERE called_at > datetime('now','-1 day') AND ok = 0`),
      errors24h: num(`SELECT COUNT(*) AS n FROM error_log WHERE occurred_at > datetime('now','-1 day') AND level = 'error'`),
      bestDealsCached: num(`SELECT COUNT(*) AS n FROM best_deals_cache`),
      bestDealsDests: num(`SELECT COUNT(DISTINCT destination) AS n FROM best_deals_cache`),
      cheapestToday: (db.prepare(
        `SELECT origin, destination, per_adult_usd FROM best_deals_cache ORDER BY per_adult_usd ASC LIMIT 1`
      ).get() as { origin: string; destination: string; per_adult_usd: number } | undefined) ?? null,
    };
  },

  // -------- Social broadcast queue (phase 2) --------
  // Verified picks (newest first) that don't yet have a queue row for `channel`.
  // The social-poster agent drains this so each pick is posted at most once per
  // channel. Limited window so we never queue ancient picks.
  picksAwaitingQueue: (channel: string, limit = 12) =>
    getDb().prepare(
      `SELECT p.* FROM curated_picks p
        WHERE p.verified = 1
          AND p.created_at > datetime('now','-2 days')
          AND NOT EXISTS (
            SELECT 1 FROM social_post_queue q
             WHERE q.pick_id = p.id AND q.channel = ?
          )
        ORDER BY p.score DESC, p.created_at DESC
        LIMIT ?`
    ).all(channel, limit) as Array<{
      id: number; run_id: number; created_at: string; origin: string; destination: string;
      outbound_date: string; return_date: string; per_adult_usd: number; party_total_usd: number | null;
      trip_length_days: number | null; headline: string; blurb: string; score: number | null;
      verified: number; verify_note: string | null; broadcast: number;
    }>,

  // Idempotent insert — UNIQUE(pick_id,channel) means a re-run is a no-op.
  enqueueSocialPost: (p: { pick_id: number; channel: string; body: string; scheduled_for?: string | null }) =>
    getDb().prepare(
      `INSERT OR IGNORE INTO social_post_queue (pick_id, channel, body, scheduled_for)
       VALUES (@pick_id, @channel, @body, @scheduled_for)`
    ).run({ ...p, scheduled_for: p.scheduled_for ?? null }),

  // Queue rows for a status, joined with the pick they describe (admin queue page).
  socialQueueByStatus: (status: string, limit = 100) =>
    getDb().prepare(
      `SELECT q.id, q.pick_id, q.channel, q.body, q.status, q.created_at, q.approved_at,
              q.posted_at, q.verifier_flag, q.error,
              p.origin, p.destination, p.outbound_date, p.return_date, p.per_adult_usd,
              p.trip_length_days, p.score, p.headline, p.verified
         FROM social_post_queue q
         JOIN curated_picks p ON p.id = q.pick_id
        WHERE q.status = ?
        ORDER BY q.created_at DESC
        LIMIT ?`
    ).all(status, limit) as Array<{
      id: number; pick_id: number; channel: string; body: string; status: string;
      created_at: string; approved_at: string | null; posted_at: string | null;
      verifier_flag: string | null; error: string | null;
      origin: string; destination: string; outbound_date: string; return_date: string;
      per_adult_usd: number; trip_length_days: number | null; score: number | null;
      headline: string; verified: number;
    }>,

  socialQueueCounts: () => {
    const rows = getDb().prepare(
      `SELECT status, COUNT(*) AS n FROM social_post_queue GROUP BY status`
    ).all() as Array<{ status: string; n: number }>;
    const out: Record<string, number> = { queued: 0, approved: 0, posted: 0, skipped: 0, failed: 0 };
    for (const r of rows) out[r.status] = r.n;
    return out;
  },

  getSocialPost: (id: number) =>
    getDb().prepare(`SELECT * FROM social_post_queue WHERE id = ?`).get(id) as
      { id: number; pick_id: number; channel: string; body: string; status: string;
        created_at: string; approved_at: string | null; posted_at: string | null;
        scheduled_for: string | null; verifier_flag: string | null; error: string | null } | undefined,

  approveSocialPost: (id: number, body?: string | null) =>
    body != null
      ? getDb().prepare(
          `UPDATE social_post_queue SET body = ?, status = 'approved', approved_at = datetime('now')
            WHERE id = ? AND status IN ('queued','approved')`
        ).run(body, id)
      : getDb().prepare(
          `UPDATE social_post_queue SET status = 'approved', approved_at = datetime('now')
            WHERE id = ? AND status IN ('queued','approved')`
        ).run(id),

  skipSocialPost: (id: number, reason = 'admin skip') =>
    getDb().prepare(
      `UPDATE social_post_queue SET status = 'skipped', error = ? WHERE id = ? AND status != 'posted'`
    ).run(reason, id),

  setSocialPostVerifierFlag: (id: number, flag: string | null, status: string) =>
    getDb().prepare(
      `UPDATE social_post_queue SET verifier_flag = ?, status = ? WHERE id = ?`
    ).run(flag, status, id),

  markSocialPosted: (id: number) =>
    getDb().prepare(
      `UPDATE social_post_queue SET status = 'posted', posted_at = datetime('now'), error = NULL WHERE id = ?`
    ).run(id),

  markSocialFailed: (id: number, error: string) =>
    getDb().prepare(
      `UPDATE social_post_queue SET status = 'failed', error = ? WHERE id = ?`
    ).run(error, id),

  // -------- Email digest (phase 2) --------
  // Users with at least one active tracked search (the digest audience).
  usersWithActiveSearches: () =>
    getDb().prepare(
      `SELECT DISTINCT u.id, u.email, u.name
         FROM users u JOIN searches s ON s.user_id = u.id
        WHERE s.active = 1`
    ).all() as Array<{ id: number; email: string; name: string | null }>,

  // Recent verified curated picks — the pool the per-user digest draws from.
  recentVerifiedPicks: (hours = 48, limit = 60) =>
    getDb().prepare(
      `SELECT * FROM curated_picks
        WHERE verified = 1 AND created_at > datetime('now', ?)
        ORDER BY score DESC, created_at DESC LIMIT ?`
    ).all(`-${hours} hours`, limit) as Array<{
      id: number; run_id: number; created_at: string; origin: string; destination: string;
      outbound_date: string; return_date: string; per_adult_usd: number; party_total_usd: number | null;
      trip_length_days: number | null; headline: string; blurb: string; score: number | null;
      verified: number; verify_note: string | null; broadcast: number;
    }>,

  // A user's tracked (origin,destination) routes — drives digest matching.
  trackedRoutesForUser: (userId: number) =>
    getDb().prepare(
      `SELECT DISTINCT origin, destination FROM searches WHERE user_id = ? AND active = 1`
    ).all(userId) as Array<{ origin: string; destination: string }>,

  // -------- Route storyteller (phase 3) --------
  upsertRouteContent: (c: {
    origin: string; destination: string; when_to_fly_md: string; faqs_json: string;
    meta_title: string | null; meta_desc: string | null; model: string | null;
  }) =>
    getDb().prepare(
      `INSERT INTO route_content (origin, destination, when_to_fly_md, faqs_json, meta_title, meta_desc, model, generated_at)
         VALUES (@origin, @destination, @when_to_fly_md, @faqs_json, @meta_title, @meta_desc, @model, datetime('now'))
         ON CONFLICT(origin, destination) DO UPDATE SET
           when_to_fly_md = excluded.when_to_fly_md, faqs_json = excluded.faqs_json,
           meta_title = excluded.meta_title, meta_desc = excluded.meta_desc,
           model = excluded.model, generated_at = excluded.generated_at`
    ).run(c),

  getRouteContent: (origin: string, destination: string) =>
    getDb().prepare(`SELECT * FROM route_content WHERE origin = ? AND destination = ?`).get(origin, destination) as
      { origin: string; destination: string; when_to_fly_md: string; faqs_json: string;
        meta_title: string | null; meta_desc: string | null; model: string | null; generated_at: string } | undefined,

  // Routes worth seeding storyteller content for: those with the most cache rows.
  topRoutesByCache: (limit = 10) =>
    getDb().prepare(
      `SELECT origin, destination, COUNT(*) AS n, MIN(per_adult_usd) AS floor_usd
         FROM best_deals_cache
        GROUP BY origin, destination
        ORDER BY n DESC, floor_usd ASC
        LIMIT ?`
    ).all(limit) as Array<{ origin: string; destination: string; n: number; floor_usd: number }>,

  // -------- Concierge chat log (phase 3) --------
  logChatTurn: (c: { userId: number | null; question: string; replyPreview: string; toolCalls: number; turns: number }) =>
    getDb().prepare(
      `INSERT INTO chat_sessions (user_id, question, reply_preview, tool_calls, turns)
         VALUES (?, ?, ?, ?, ?)`
    ).run(c.userId, c.question.slice(0, 500), c.replyPreview.slice(0, 500), c.toolCalls, c.turns),

  // -------- Slack channel subscriptions (created via /flycheap watch) --------
  upsertSlackSubscription: (s: { team_id: string; channel_id: string; origin: string; destination: string; threshold_usd: number; created_by_slack_user?: string | null }) =>
    getDb().prepare(
      `INSERT INTO slack_channel_subscriptions (team_id, channel_id, origin, destination, threshold_usd, created_by_slack_user)
         VALUES (@team_id, @channel_id, @origin, @destination, @threshold_usd, @created_by_slack_user)
       ON CONFLICT (channel_id, origin, destination)
       DO UPDATE SET threshold_usd = excluded.threshold_usd, created_by_slack_user = excluded.created_by_slack_user`
    ).run({ created_by_slack_user: null, ...s }),
  deleteSlackSubscription: (channel_id: string, origin: string, destination: string) =>
    getDb().prepare(`DELETE FROM slack_channel_subscriptions WHERE channel_id = ? AND origin = ? AND destination = ?`)
      .run(channel_id, origin, destination),
  listSlackSubscriptions: (channel_id: string) =>
    getDb().prepare(`SELECT * FROM slack_channel_subscriptions WHERE channel_id = ? ORDER BY created_at DESC`)
      .all(channel_id) as Array<{
        id: number; team_id: string; channel_id: string; origin: string; destination: string;
        threshold_usd: number; created_by_slack_user: string | null; created_at: string; last_alerted_at: string | null }>,
  matchingSlackSubscriptions: (origin: string, destination: string, price: number) =>
    getDb().prepare(
      `SELECT * FROM slack_channel_subscriptions
        WHERE origin = ? AND destination = ? AND threshold_usd >= ?
          AND (last_alerted_at IS NULL OR last_alerted_at < datetime('now', '-12 hours'))
        ORDER BY threshold_usd DESC`
    ).all(origin, destination, price) as Array<{
      id: number; team_id: string; channel_id: string; origin: string; destination: string;
      threshold_usd: number; created_by_slack_user: string | null; created_at: string; last_alerted_at: string | null }>,
  markSlackSubscriptionAlerted: (id: number) =>
    getDb().prepare(`UPDATE slack_channel_subscriptions SET last_alerted_at = datetime('now') WHERE id = ?`).run(id),

  // -------- Telegram subscriptions (created via /watch DM to bot) --------
  upsertTelegramSubscription: (s: { chat_id: string; origin: string; destination: string; threshold_usd: number; created_by_tg_user?: string | null; first_name?: string | null }) =>
    getDb().prepare(
      `INSERT INTO telegram_subscriptions (chat_id, origin, destination, threshold_usd, created_by_tg_user, first_name)
         VALUES (@chat_id, @origin, @destination, @threshold_usd, @created_by_tg_user, @first_name)
       ON CONFLICT (chat_id, origin, destination)
       DO UPDATE SET threshold_usd = excluded.threshold_usd, first_name = excluded.first_name`
    ).run({ created_by_tg_user: null, first_name: null, ...s }),
  deleteTelegramSubscription: (chat_id: string, origin: string, destination: string) =>
    getDb().prepare(`DELETE FROM telegram_subscriptions WHERE chat_id = ? AND origin = ? AND destination = ?`)
      .run(chat_id, origin, destination),
  listTelegramSubscriptions: (chat_id: string) =>
    getDb().prepare(`SELECT * FROM telegram_subscriptions WHERE chat_id = ? ORDER BY created_at DESC`)
      .all(chat_id) as Array<{
        id: number; chat_id: string; origin: string; destination: string; threshold_usd: number;
        created_by_tg_user: string | null; first_name: string | null; created_at: string; last_alerted_at: string | null }>,
  matchingTelegramSubscriptions: (origin: string, destination: string, price: number) =>
    getDb().prepare(
      `SELECT * FROM telegram_subscriptions
        WHERE origin = ? AND destination = ? AND threshold_usd >= ?
          AND (last_alerted_at IS NULL OR last_alerted_at < datetime('now', '-12 hours'))
        ORDER BY threshold_usd DESC`
    ).all(origin, destination, price) as Array<{
      id: number; chat_id: string; origin: string; destination: string; threshold_usd: number;
      created_by_tg_user: string | null; first_name: string | null; created_at: string; last_alerted_at: string | null }>,
  markTelegramSubscriptionAlerted: (id: number) =>
    getDb().prepare(`UPDATE telegram_subscriptions SET last_alerted_at = datetime('now') WHERE id = ?`).run(id),

  // Distinct (origin,destination) routes across BOTH bot subscription tables —
  // used by the poll cycle to know which routes to price-check for Slack/
  // Telegram /watch subscribers (these may not exist as tracked searches).
  distinctSubscriptionRoutes: () =>
    getDb().prepare(
      `SELECT DISTINCT origin, destination FROM (
         SELECT origin, destination FROM slack_channel_subscriptions
         UNION
         SELECT origin, destination FROM telegram_subscriptions
       )`
    ).all() as Array<{ origin: string; destination: string }>,

  // -------- Support tickets --------
  /** Open a ticket with its first (client) message; assigns the FC-#### ref. */
  createTicket: (p: {
    user_id?: number | null; name: string; email: string; subject: string; body: string; ip?: string | null;
  }): { id: number; ref: string } => {
    const db = getDb();
    const tx = db.transaction(() => {
      const r = db.prepare(
        `INSERT INTO tickets (ref, user_id, name, email, subject, ip, last_reply_at, last_reply_by)
         VALUES ('', ?, ?, ?, ?, ?, datetime('now'), 'client')`,
      ).run(p.user_id ?? null, p.name, p.email, p.subject, p.ip ?? null);
      const id = Number(r.lastInsertRowid);
      const ref = `FC-${1000 + id}`;
      db.prepare(`UPDATE tickets SET ref = ? WHERE id = ?`).run(ref, id);
      db.prepare(`INSERT INTO ticket_messages (ticket_id, author, body) VALUES (?, 'client', ?)`).run(id, p.body);
      return { id, ref };
    });
    return tx();
  },
  /** Append a message and move the ticket's state forward. A client reply on a
   *  resolved/waiting ticket reopens it; an operator reply moves open → in_progress. */
  addTicketMessage: (p: { ticket_id: number; author: TicketAuthor; body: string; email_id?: string | null }): number => {
    const db = getDb();
    const tx = db.transaction(() => {
      const r = db.prepare(`INSERT INTO ticket_messages (ticket_id, author, body, email_id) VALUES (?, ?, ?, ?)`)
        .run(p.ticket_id, p.author, p.body, p.email_id ?? null);
      const t = db.prepare(`SELECT status FROM tickets WHERE id = ?`).get(p.ticket_id) as { status: TicketStatus } | undefined;
      let next: TicketStatus | null = null;
      if (p.author === 'operator' && t?.status === 'open') next = 'in_progress';
      if (p.author === 'client' && (t?.status === 'resolved' || t?.status === 'waiting')) next = 'open';
      db.prepare(
        `UPDATE tickets SET updated_at = datetime('now'), last_reply_at = datetime('now'), last_reply_by = ?${next ? ', status = ?' : ''} WHERE id = ?`,
      ).run(...(next ? [p.author, next, p.ticket_id] : [p.author, p.ticket_id]));
      return Number(r.lastInsertRowid);
    });
    return tx();
  },
  setMessageEmailId: (messageId: number, emailId: string): void => {
    getDb().prepare(`UPDATE ticket_messages SET email_id = ? WHERE id = ?`).run(emailId, messageId);
  },
  setTicketStatus: (id: number, status: TicketStatus): void => {
    getDb().prepare(`UPDATE tickets SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, id);
  },
  /** Admin queue: newest-active first, with the message count and a snippet. */
  listTickets: (status?: TicketStatus, limit = 200): Array<TicketRow & { message_count: number }> =>
    getDb().prepare(
      `SELECT t.*, (SELECT COUNT(*) FROM ticket_messages m WHERE m.ticket_id = t.id) AS message_count
         FROM tickets t
        ${status ? 'WHERE t.status = ?' : ''}
        ORDER BY (t.status = 'resolved') ASC, t.updated_at DESC
        LIMIT ?`,
    ).all(...(status ? [status, limit] : [limit])) as Array<TicketRow & { message_count: number }>,
  ticketStatusCounts: (): Record<TicketStatus, number> => {
    const rows = getDb().prepare(`SELECT status, COUNT(*) AS n FROM tickets GROUP BY status`).all() as Array<{ status: TicketStatus; n: number }>;
    const out: Record<TicketStatus, number> = { open: 0, in_progress: 0, waiting: 0, resolved: 0 };
    for (const r of rows) if (r.status in out) out[r.status] = r.n;
    return out;
  },
  getTicketByRef: (ref: string): TicketRow | undefined =>
    getDb().prepare(`SELECT * FROM tickets WHERE ref = ?`).get(ref) as TicketRow | undefined,
  getTicketMessages: (ticket_id: number): TicketMessageRow[] =>
    getDb().prepare(`SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY id ASC`).all(ticket_id) as TicketMessageRow[],
  /** Client Support screen: only this user's tickets, active first. */
  listUserTickets: (user_id: number, limit = 50): Array<TicketRow & { message_count: number }> =>
    getDb().prepare(
      `SELECT t.*, (SELECT COUNT(*) FROM ticket_messages m WHERE m.ticket_id = t.id) AS message_count
         FROM tickets t
        WHERE t.user_id = ?
        ORDER BY (t.status = 'resolved') ASC, t.updated_at DESC
        LIMIT ?`,
    ).all(user_id, limit) as Array<TicketRow & { message_count: number }>,
  countOpenTickets: (): number =>
    (getDb().prepare(`SELECT COUNT(*) AS n FROM tickets WHERE status != 'resolved'`).get() as { n: number }).n,
};
