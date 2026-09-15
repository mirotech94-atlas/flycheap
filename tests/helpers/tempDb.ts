import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Boots src/lib/db.ts against a throwaway directory. Must be awaited before
 * any other '@/lib/*' import in the test file, because db.ts reads
 * process.cwd() when it is first imported.
 */
export async function bootTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flycheap-test-'));
  process.chdir(dir);
  // Fresh module instance per test file (vitest isolates files; this guards
  // against a cached global from a previous import in the same worker).
  delete (globalThis as { __egyptairDb?: unknown }).__egyptairDb;
  const db = await import('@/lib/db');
  db.getDb(); // runs init() → creates all tables and seeds default user
  // Clean up the default seeded user for a pristine test database
  db.getDb().prepare('DELETE FROM users WHERE id = 1').run();
  return db;
}
