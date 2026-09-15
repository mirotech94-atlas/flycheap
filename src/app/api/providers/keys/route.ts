import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';

// Allow-list of env vars the user can update through this endpoint. Any other
// var is rejected so the wizard can't accidentally rewrite ANTHROPIC_API_KEY etc.
const ALLOWED_KEYS = new Set([
  'AMADEUS_CLIENT_ID', 'AMADEUS_CLIENT_SECRET',
  'SERPAPI_KEY', 'SEARCHAPI_KEY',
  'KIWI_TEQUILA_KEY', 'DUFFEL_TOKEN',
  'TRAVELPAYOUTS_TOKEN',
]);

const ENV_PATH = path.join(process.cwd(), '.env.local');

function escapeValue(v: string): string {
  // Quote when value contains spaces, quotes, hashes, $, or newlines
  if (/[\s"#$=]/.test(v)) {
    return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return v;
}

async function readEnv(): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(ENV_PATH, 'utf8');
    const out: Record<string, string> = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if (v.startsWith('"') && v.endsWith('"')) {
        v = v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      }
      out[m[1]] = v;
    }
    return out;
  } catch {
    return {};
  }
}

async function writeEnv(updates: Record<string, string>): Promise<void> {
  const current = await readEnv();
  for (const [k, v] of Object.entries(updates)) current[k] = v;
  const lines = Object.entries(current)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${escapeValue(v)}`);
  await fs.writeFile(ENV_PATH, lines.join('\n') + '\n', { mode: 0o600 });
}

// GET → which keys are present (returns booleans only, never values)
export async function GET() {
  const env = await readEnv();
  const status: Record<string, boolean> = {};
  for (const k of ALLOWED_KEYS) status[k] = !!(env[k] || process.env[k]);
  return NextResponse.json({ ok: true, status });
}

// PUT → set one or more keys. Returns updated booleans.
export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const updates: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED_KEYS.has(k)) continue;
    if (typeof v !== 'string' || v.trim().length < 4) continue;
    updates[k] = v.trim();
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, error: 'no valid keys submitted' }, { status: 400 });
  }
  try {
    await writeEnv(updates);
    // Also push into the running process so the change is live without a restart.
    for (const [k, v] of Object.entries(updates)) process.env[k] = v;
    return NextResponse.json({
      ok: true,
      updated: Object.keys(updates),
      note: 'Saved to .env.local AND injected into the running process. Restart the systemd unit if you want a clean state.',
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
