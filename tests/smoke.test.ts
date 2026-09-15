import { describe, it, expect } from 'vitest';
import { bootTempDb } from './helpers/tempDb';

describe('test harness', () => {
  it('boots a temp database with the schema', async () => {
    const db = await bootTempDb();
    const n = (db.getDb().prepare(`SELECT COUNT(*) AS n FROM users`).get() as { n: number }).n;
    expect(n).toBe(0);
    expect(process.cwd()).toContain('flycheap-test-');
  });
});
