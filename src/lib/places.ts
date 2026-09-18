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

/**
 * Airport code -> city code.
 *
 * The photo library is keyed by CITY (TYO, WAS, NYC) but searches carry the
 * AIRPORT the user actually picked (NRT, IAD, JFK). Without this, Tokyo has a
 * photo under a code the app never asks for and the slide falls back to the
 * gradient. Only cities we hold a photo for are worth an entry here.
 */
const CITY_OF: Record<string, string> = {
  // New York
  JFK: 'NYC', EWR: 'NYC', LGA: 'NYC',
  // London (LHR has its own photo; the satellites borrow the city one)
  LGW: 'LON', STN: 'LON', LTN: 'LON', LCY: 'LON', SEN: 'LON',
  // Paris (CDG has its own)
  ORY: 'PAR', BVA: 'PAR',
  // Rome
  FCO: 'ROM', CIA: 'ROM',
  // Tokyo
  NRT: 'TYO', HND: 'TYO',
  // Washington DC
  IAD: 'WAS', DCA: 'WAS', BWI: 'WAS',
  // Sao Paulo
  GRU: 'SAO', CGH: 'SAO', VCP: 'SAO',
  // Mexico City
  NLU: 'MEX',
  // Bangkok
  DMK: 'BKK',
  // Istanbul
  SAW: 'IST',
  // Dubai
  DWC: 'DXB',
  // Tenerife
  TFN: 'TFS',
  // Cairo / Sharm / Hurghada spellings that turn up in feeds
  SPX: 'CAI',
};

/** City code for an airport code, or the code itself when it already is one. */
export function cityCode(code: string): string {
  const c = code.trim().toUpperCase();
  return CITY_OF[c] ?? c;
}

/** Site-relative photo path for a destination code, or null (callers fall back to the gradient). */
export function placePhoto(code: string): string | null {
  if (!code) return null;
  const m = manifest();
  const raw = code.trim().toUpperCase();
  return m[raw] ?? m[cityCode(raw)] ?? null;
}
