import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * db.ts resolves its path from process.cwd() at import time, so a test that
 * wants its own database has to chdir BEFORE importing anything that touches
 * db. vitest runs with pool: 'forks' and isolate: true for exactly this reason —
 * each test file gets its own process and can move its own cwd safely.
 *
 * Call this at the very top of a test file, before any `import '@/lib/...'`
 * that reaches the database (use a dynamic import after the call).
 */
export function useTempDb(opts: { seedFrom?: string } = {}): { dir: string; dbPath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flycheap-test-'));
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
  const dbPath = path.join(dir, 'data', 'fares.db');

  // Seeding from a real database is how the analytics queries get exercised
  // against a real schema rather than a hand-written approximation of one.
  if (opts.seedFrom && fs.existsSync(opts.seedFrom)) {
    fs.copyFileSync(opts.seedFrom, dbPath);
  }

  process.chdir(dir);
  return { dir, dbPath };
}

/**
 * Same idea, but returns the initialised db module — the shape
 * tests/adminAgent.test.ts expects. Starts from an EMPTY database rather than a
 * copy of the real one, because those tests write users and run shell tools and
 * must not inherit production-shaped rows.
 */
export async function bootTempDb(): Promise<typeof import('@/lib/db')> {
  useTempDb();
  const db = await import('@/lib/db');
  db.getDb(); // run init() + migrations against the fresh file
  return db;
}
