// Next.js calls register() once per server boot. We start node-cron here so
// the poller runs in-process. Skip if running edge or build.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  // Avoid double-init under HMR / multiple workers.
  const g = globalThis as unknown as { __egyptairCronStarted?: boolean };
  if (g.__egyptairCronStarted) return;
  g.__egyptairCronStarted = true;

  const { startCron } = await import('./lib/cron');
  startCron();
}
