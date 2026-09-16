import 'server-only';

/**
 * In-memory, per-process guard state for the admin FarePilot.
 *
 * Deliberately NOT in fares.db: the unlocked sql_query/run_command tools can
 * write the database, so any step-up window or rate-limit counter kept there
 * could be rewritten by the very tools it is meant to bound. Keeping it in
 * process memory means the only way to reset it is a real process restart,
 * which is a stronger action than any SQL the agent can run.
 *
 * Consequence (documented): a restart of the app clears all step-ups and
 * counters. That is acceptable — a restart already requires the sudo whitelist.
 */

const STEPUP_WINDOW_MS = 10 * 60 * 1000; // a code unlocks SQL/shell for 10 min
const REPLAY_MS = 90 * 1000;             // reject the same code within 90s
const EXEC_LIMIT = 30;                   // privileged actions
const EXEC_WINDOW_MS = 10 * 60 * 1000;   // per 10 min, per owner
const VERIFY_LIMIT = 5;                  // step-up code attempts
const VERIFY_WINDOW_MS = 10 * 60 * 1000; // per 10 min, per key

type StepUp = { at: number; lastCode: string };
const stepUps = new Map<string, StepUp>();
const execHits = new Map<number, number[]>();
const verifyHits = new Map<string, number[]>();

function sweep(list: number[], windowMs: number): number[] {
  const cutoff = Date.now() - windowMs;
  return list.filter(t => t > cutoff);
}

// ---- step-up ----
export function recordStepUp(token: string, code: string): void {
  if (token) stepUps.set(token, { at: Date.now(), lastCode: code });
}
export function stepUpValid(token: string): boolean {
  const s = token ? stepUps.get(token) : undefined;
  return !!s && Date.now() - s.at < STEPUP_WINDOW_MS;
}
/** True if this exact code was just consumed for this session (replay). */
export function isCodeReplay(token: string, code: string): boolean {
  const s = token ? stepUps.get(token) : undefined;
  return !!s && s.lastCode === code && Date.now() - s.at < REPLAY_MS;
}

// ---- privileged-tool rate limit (per owner) ----
export function execAllowed(userId: number): boolean {
  const list = sweep(execHits.get(userId) ?? [], EXEC_WINDOW_MS);
  if (list.length >= EXEC_LIMIT) { execHits.set(userId, list); return false; }
  list.push(Date.now());
  execHits.set(userId, list);
  return true;
}
export const EXEC_LIMIT_INFO = { limit: EXEC_LIMIT, windowMin: EXEC_WINDOW_MS / 60000 };

// ---- step-up code attempt limit (brute-force guard) ----
export function verifyAllowed(key: string): boolean {
  const list = sweep(verifyHits.get(key) ?? [], VERIFY_WINDOW_MS);
  return list.length < VERIFY_LIMIT;
}
export function recordVerifyAttempt(key: string): void {
  const list = sweep(verifyHits.get(key) ?? [], VERIFY_WINDOW_MS);
  list.push(Date.now());
  verifyHits.set(key, list);
}
export function clearVerifyAttempts(key: string): void { verifyHits.delete(key); }
export const VERIFY_LIMIT_INFO = { limit: VERIFY_LIMIT, windowMin: VERIFY_WINDOW_MS / 60000 };

/** Test-only: wipe all in-memory guard state. */
export function __resetAdminAgentState(): void {
  stepUps.clear(); execHits.clear(); verifyHits.clear();
}
