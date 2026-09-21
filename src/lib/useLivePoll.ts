/**
 * Shared polling loop for the live fare surfaces (marketing LiveFeed, dashboard
 * FcLiveFeed). Chains a `setTimeout` after each response instead of running a
 * fixed `setInterval`, so a slow response never causes requests to stack.
 *
 * - Pauses while the tab is hidden (`document.visibilityState`) and resumes
 *   immediately, at the base delay, when it becomes visible/focused again.
 * - Aborts the in-flight request on unmount (or on going hidden) via
 *   `AbortController`.
 * - Backs off exponentially on failure (doubling, capped at `maxDelayMs`) and
 *   resets to `baseDelayMs` on the next success, so an outage doesn't turn
 *   into a tight error loop.
 *
 * `fetcher` receives an `AbortSignal` and must return `true` on success and
 * `false` on a handled failure (an aborted fetch should just throw/reject —
 * that's treated as neither success nor failure, just "stop this cycle").
 */
export function pollWithBackoff(
  fetcher: (signal: AbortSignal) => Promise<boolean>,
  opts?: { baseDelayMs?: number; maxDelayMs?: number; immediate?: boolean },
): () => void {
  const baseDelayMs = opts?.baseDelayMs ?? 4000;
  const maxDelayMs = opts?.maxDelayMs ?? 60_000;
  const immediate = opts?.immediate ?? true;

  let cancelled = false;
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;
  let delay = baseDelayMs;

  const clearTimer = () => {
    if (timer) { clearTimeout(timer); timer = null; }
  };

  async function run() {
    if (cancelled || inFlight || (typeof document !== 'undefined' && document.visibilityState !== 'visible')) return;
    inFlight = true;
    controller = new AbortController();
    let ok = false;
    let aborted = false;
    try {
      ok = await fetcher(controller.signal);
    } catch (err) {
      aborted = (err as { name?: string } | null)?.name === 'AbortError';
      ok = false;
    } finally {
      inFlight = false;
    }
    if (cancelled) return; // unmounted — nothing left to reschedule for
    if (aborted) {
      // Either onHidden() aborted us (stay stopped — onVisible() will resume
      // the chain itself when the tab comes back) or the abort raced back-to-
      // visible in the same tick (onVisible()'s own run() bailed on inFlight,
      // so nobody else will reschedule). Only the second case needs a manual
      // reschedule, and checking visibility right now tells them apart.
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') schedule(baseDelayMs);
      return;
    }
    delay = ok ? baseDelayMs : Math.min(delay * 2, maxDelayMs);
    schedule(delay);
  }

  function schedule(ms: number) {
    clearTimer();
    timer = setTimeout(run, ms);
  }

  function onVisible() {
    if (cancelled || document.visibilityState !== 'visible') return;
    delay = baseDelayMs;
    clearTimer();
    run();
  }

  function onHidden() {
    clearTimer();
    controller?.abort();
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') onVisible(); else onHidden();
  }

  if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
    if (immediate) run(); else schedule(baseDelayMs);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onVisible);
  }

  return function stop() {
    cancelled = true;
    clearTimer();
    controller?.abort();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onVisible);
    }
  };
}
