import 'server-only';

/**
 * In-memory, per-process guard state for the admin FarePilot. Deliberately NOT
 * in fares.db (the unlocked tools can write the DB and would be able to rewrite
 * their own bounds). Cleared on process restart, which is a stronger reset than
 * any SQL the agent can run.
 */

const STEPUP_WINDOW_MS = 10 * 60 * 1000;
const REPLAY_MS = 120 * 1000;
const EXEC_LIMIT = 30;
const EXEC_WINDOW_MS = 10 * 60 * 1000;
const VERIFY_LIMIT = 5;
const VERIFY_WINDOW_MS = 10 * 60 * 1000;
const MAX_KEYS = 10_000; // cap map growth (F2)

const stepUps = new Map<string, number>();               // session token -> unlock time
const execHits = new Map<number, number[]>();             // owner id -> exec timestamps
const verifyHits = new Map<string, number[]>();           // key -> attempt timestamps
const consumedCodes = new Map<number, Array<{ code: string; at: number }>>(); // user id -> recent codes

function sweep(list: number[], windowMs: number): number[] {
  const cutoff = Date.now() - windowMs;
  return list.filter(t => t > cutoff);
}
function capKeys<K, V>(m: Map<K, V>): void {
  while (m.size > MAX_KEYS) { const k = m.keys().next().value as K; m.delete(k); }
}

// ---- step-up window ----
export function recordStepUp(token: string): void {
  if (!token) return;
  // evict expired step-ups so the map cannot grow without bound (F2)
  const cutoff = Date.now() - STEPUP_WINDOW_MS;
  for (const [k, at] of stepUps) if (at < cutoff) stepUps.delete(k);
  stepUps.set(token, Date.now());
  capKeys(stepUps);
}
export function stepUpValid(token: string): boolean {
  const at = token ? stepUps.get(token) : undefined;
  if (at === undefined) return false;
  if (Date.now() - at >= STEPUP_WINDOW_MS) { stepUps.delete(token); return false; }
  return true;
}

// ---- code replay, per USER (F6) ----
export function isCodeConsumed(userId: number, code: string): boolean {
  const list = (consumedCodes.get(userId) ?? []).filter(c => Date.now() - c.at < REPLAY_MS);
  return list.some(c => c.code === code);
}
export function consumeCode(userId: number, code: string): void {
  const list = (consumedCodes.get(userId) ?? []).filter(c => Date.now() - c.at < REPLAY_MS);
  list.push({ code, at: Date.now() });
  if (list.length) consumedCodes.set(userId, list); else consumedCodes.delete(userId);
  capKeys(consumedCodes);
}

// ---- privileged-tool rate limit (per owner) ----
export function execAllowed(userId: number): boolean {
  const list = sweep(execHits.get(userId) ?? [], EXEC_WINDOW_MS);
  if (list.length >= EXEC_LIMIT) { if (list.length) execHits.set(userId, list); else execHits.delete(userId); return false; }
  list.push(Date.now());
  execHits.set(userId, list);
  return true;
}
export const EXEC_LIMIT_INFO = { limit: EXEC_LIMIT, windowMin: EXEC_WINDOW_MS / 60000 };

// ---- step-up code brute-force guard ----
export function verifyAllowed(key: string): boolean {
  return sweep(verifyHits.get(key) ?? [], VERIFY_WINDOW_MS).length < VERIFY_LIMIT;
}
export function recordVerifyAttempt(key: string): void {
  const list = sweep(verifyHits.get(key) ?? [], VERIFY_WINDOW_MS);
  list.push(Date.now());
  verifyHits.set(key, list);
  capKeys(verifyHits);
}
export function clearVerifyAttempts(key: string): void { verifyHits.delete(key); }
export const VERIFY_LIMIT_INFO = { limit: VERIFY_LIMIT, windowMin: VERIFY_WINDOW_MS / 60000 };

export function __resetAdminAgentState(): void {
  stepUps.clear(); execHits.clear(); verifyHits.clear(); consumedCodes.clear();
}
