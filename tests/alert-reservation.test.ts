import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

/**
 * The reserve-then-promote invariant, tested against real SQLite rather than a
 * mock, because the whole point is what a concurrent READER sees.
 *
 * The poller writes the alerts_sent row BEFORE sending, so outbound links can
 * carry its id — that id is the alert→click join. But a reserved row is not an
 * alert anyone received, and two readers must not see it:
 *
 *   - the alert email itself, which renders "vs your last alert" and would
 *     otherwise compare the alert to itself
 *   - the threshold floor, which would treat a failed send as a delivered one
 *     and silence the route on the next cycle (the alert-ratchet failure)
 */

const SCHEMA = `
  CREATE TABLE alerts_sent (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    search_id INTEGER NOT NULL,
    fare_snapshot_id INTEGER NOT NULL,
    price_per_adult_usd REAL NOT NULL,
    sent_at TEXT NOT NULL DEFAULT (datetime('now')),
    kind TEXT NOT NULL DEFAULT 'threshold',
    status TEXT NOT NULL DEFAULT 'sent'
  );
  CREATE TABLE affiliate_clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    alert_id INTEGER
  );
`;

let db: Database.Database;

/** The reader every "what was the last alert" path uses. */
const lastSentAlert = (searchId: number) =>
  db.prepare(
    `SELECT * FROM alerts_sent WHERE search_id = ? AND status = 'sent'
     ORDER BY sent_at DESC LIMIT 1`,
  ).get(searchId) as { id: number; price_per_adult_usd: number } | undefined;

const reserve = (searchId: number, price: number) =>
  Number(db.prepare(
    `INSERT INTO alerts_sent (search_id, fare_snapshot_id, price_per_adult_usd, kind, status)
     VALUES (?, 1, ?, 'threshold', 'pending')`,
  ).run(searchId, price).lastInsertRowid);

const promote = (id: number) =>
  db.prepare(`UPDATE alerts_sent SET status = 'sent' WHERE id = ?`).run(id);

const rollback = (id: number) => {
  db.prepare(`UPDATE affiliate_clicks SET alert_id = NULL WHERE alert_id = ?`).run(id);
  db.prepare(`DELETE FROM alerts_sent WHERE id = ?`).run(id);
};

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(SCHEMA);
});

describe('alert reservation', () => {
  it('hides a reserved row from the last-alert reader while the send is in flight', () => {
    db.prepare(
      `INSERT INTO alerts_sent (search_id, fare_snapshot_id, price_per_adult_usd, status)
       VALUES (7, 1, 620, 'sent')`,
    ).run();

    const reservedId = reserve(7, 484);

    // This is the read the alert email performs mid-send. It must still see the
    // PRIOR alert, not the one currently being sent.
    const seen = lastSentAlert(7);
    expect(seen?.price_per_adult_usd).toBe(620);
    expect(seen?.id).not.toBe(reservedId);
  });

  it('exposes the row once a channel has delivered', () => {
    reserve(7, 484);
    const id = reserve(7, 470);
    promote(id);
    expect(lastSentAlert(7)?.price_per_adult_usd).toBe(470);
  });

  it('leaves no trace when every channel fails', () => {
    db.prepare(
      `INSERT INTO alerts_sent (search_id, fare_snapshot_id, price_per_adult_usd, status)
       VALUES (7, 1, 620, 'sent')`,
    ).run();

    const id = reserve(7, 484);
    rollback(id);

    // The floor must not have moved: a failed send is not news.
    expect(lastSentAlert(7)?.price_per_adult_usd).toBe(620);
    expect(db.prepare('SELECT COUNT(*) AS n FROM alerts_sent').get()).toEqual({ n: 1 });
  });

  it('does not count a reserved row as an alert sent', () => {
    // alertsSent is a PUBLIC claim on the marketing site; a row that is merely
    // reserved has not been sent to anyone.
    promote(reserve(7, 484));
    reserve(7, 470);
    const n = db.prepare(`SELECT COUNT(*) AS n FROM alerts_sent WHERE status = 'sent'`)
      .get() as { n: number };
    expect(n.n).toBe(1);
  });

  it('clears any click reference before deleting, since cascades are inert here', () => {
    const id = reserve(7, 484);
    db.prepare(`INSERT INTO affiliate_clicks (token, alert_id) VALUES ('tok', ?)`).run(id);
    rollback(id);
    const click = db.prepare(`SELECT alert_id FROM affiliate_clicks WHERE token = 'tok'`).get();
    expect(click).toEqual({ alert_id: null });
  });

  it('defaults pre-existing rows to sent, so the migration cannot hide history', () => {
    db.prepare(
      `INSERT INTO alerts_sent (search_id, fare_snapshot_id, price_per_adult_usd) VALUES (9, 1, 700)`,
    ).run();
    expect(lastSentAlert(9)?.price_per_adult_usd).toBe(700);
  });
});
