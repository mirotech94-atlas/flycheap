import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // db.ts computes DATA_DIR from process.cwd() at import time; tests chdir
    // first (see tests/helpers/tempDb.ts), so never share a worker's cwd.
    pool: 'forks',
    isolate: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // Next's 'server-only' throws outside a React server context; stub it.
      'server-only': path.resolve(__dirname, 'tests/helpers/server-only-stub.ts'),
    },
  },
});
