import { NextResponse } from 'next/server';
import { getDb, queries } from '@/lib/db';
import { providerStatuses } from '@/lib/providers';

export const dynamic = 'force-dynamic';

// Public health endpoint — used by the /status page and any external uptime
// monitor (UptimeRobot, BetterStack, internal Slack bot, etc.).
// Returns HTTP 200 even when subsystems are degraded so monitors can branch
// on `ok` rather than HTTP code; 503 only when the DB itself is unreachable.

export async function GET() {
  const started = Date.now();
  const checks: Record<string, { ok: boolean; ms?: number; detail?: string }> = {};

  // 1. Database
  try {
    const t = Date.now();
    const r = (getDb().prepare('SELECT COUNT(*) as n FROM users').get() as { n: number });
    checks.database = { ok: true, ms: Date.now() - t, detail: `${r.n} users` };
  } catch (e) {
    return NextResponse.json({
      ok: false,
      checks: { database: { ok: false, detail: (e as Error).message } },
    }, { status: 503 });
  }

  // 2. Last successful poll (recent activity = service is processing)
  try {
    const last = getDb().prepare(
      `SELECT MAX(called_at) as t FROM api_calls WHERE ok = 1`
    ).get() as { t: string | null };
    if (last.t) {
      const ageMin = (Date.now() - new Date(last.t + 'Z').getTime()) / 60000;
      checks.last_poll = {
        ok: ageMin < 120, // healthy if a successful poll happened in the last 2h
        ms: 0,
        detail: `${Math.round(ageMin)} min ago`,
      };
    } else {
      checks.last_poll = { ok: false, detail: 'no poll yet' };
    }
  } catch (e) { checks.last_poll = { ok: false, detail: (e as Error).message }; }

  // 3. Provider configuration (data sources available)
  try {
    const provs = providerStatuses();
    const configured = provs.filter(p => p.isConfigured).length;
    checks.providers = {
      ok: configured > 0,
      detail: `${configured}/${provs.length} configured (${provs.filter(p => p.isConfigured).map(p => p.id).join(', ')})`,
    };
  } catch { /* ignore */ }

  // 4. Last alert sent (just informational)
  try {
    const a = getDb().prepare(`SELECT MAX(sent_at) as t FROM alerts_sent`).get() as { t: string | null };
    if (a.t) {
      const ageMin = (Date.now() - new Date(a.t + 'Z').getTime()) / 60000;
      checks.last_alert = { ok: true, detail: ageMin < 60 ? `${Math.round(ageMin)} min ago` : `${Math.round(ageMin / 60)} h ago` };
    } else {
      checks.last_alert = { ok: true, detail: 'no alerts yet' };
    }
  } catch { /* ignore */ }

  // 5. Snapshot age
  try {
    const m = queries.adminMetrics();
    checks.metrics = { ok: true, detail: `${m.users.total} users · ${m.active_searches} active routes` };
  } catch { /* ignore */ }

  const allOk = Object.values(checks).every(c => c.ok);
  return NextResponse.json({
    ok: allOk,
    version: process.env.npm_package_version ?? '0.1.0',
    uptime_sec: Math.round(process.uptime()),
    checked_at: new Date().toISOString(),
    duration_ms: Date.now() - started,
    checks,
  });
}
