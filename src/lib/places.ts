import 'server-only';
import fs from 'node:fs';
import path from 'node:path';

let cache: Record<string, string> | null = null;
let cacheAt = 0;

function manifest(): Record<string, string> {
  if (cache && Date.now() - cacheAt < 60_000) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'places', 'manifest.json'), 'utf8'));
  } catch {
    cache = {};
  }
  cacheAt = Date.now();
  return cache!;
}

/** Site-relative photo path for a destination code, or null (callers fall back to the gradient). */
export function placePhoto(code: string): string | null {
  return manifest()[code.toUpperCase()] ?? null;
}
