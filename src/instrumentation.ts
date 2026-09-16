// Next.js calls register() once per server boot. We start node-cron here so
// the poller runs in-process. Skip if running edge or build.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  // Avoid double-init under HMR / multiple workers.
  const g = globalThis as unknown as { __egyptairCronStarted?: boolean; __egyptairProcessHandlersRegistered?: boolean };

  if (!g.__egyptairProcessHandlersRegistered) {
    g.__egyptairProcessHandlersRegistered = true;
    const { queries } = await import('./lib/db');
    process.on('unhandledRejection', (reason) => {
      const err = reason instanceof Error ? reason : new Error(String(reason));
      try { queries.logError({ source: 'process', message: err.message, stack: err.stack }); } catch { /* best effort */ }
    });
    process.on('uncaughtException', (err) => {
      try { queries.logError({ source: 'process', message: err.message, stack: err.stack }); } catch { /* best effort */ }
      // Rethrow so the process still crashes exactly as it would with no
      // handler registered — this handler only adds logging, not recovery.
      throw err;
    });
  }

  if (g.__egyptairCronStarted) return;
  g.__egyptairCronStarted = true;

  const { startCron } = await import('./lib/cron');
  startCron();
}
