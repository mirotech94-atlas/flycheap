/**
 * Canonical hostnames. Set CLIENT_HOST / ADMIN_HOST in .env.local to cut over
 * (e.g. my.flycheap.live / admin.flycheap.live); defaults are the legacy hosts
 * so a deploy without the env vars changes nothing.
 */
const clean = (v: string | undefined) => (v ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');

export const CLIENT_HOST = clean(process.env.CLIENT_HOST) || 'flycheap.18dn.com';
export const ADMIN_HOST = clean(process.env.ADMIN_HOST) || 'admin.flycheap.18dn.com';
export const APP_URL = `https://${CLIENT_HOST}`;
export const ADMIN_URL = `https://${ADMIN_HOST}`;

/**
 * Admin host reference safe for client bundles. `process.env.ADMIN_HOST` is
 * not inlined into the browser bundle (only NEXT_PUBLIC_* vars are), so
 * client components must use this instead of ADMIN_HOST directly.
 */
export const PUBLIC_ADMIN_HOST = clean(process.env.NEXT_PUBLIC_ADMIN_HOST) || ADMIN_HOST;

/**
 * Client host reference safe for client bundles. `process.env.CLIENT_HOST` is
 * not inlined into the browser bundle (only NEXT_PUBLIC_* vars are), so
 * client components must use this instead of CLIENT_HOST directly.
 */
export const PUBLIC_CLIENT_HOST = clean(process.env.NEXT_PUBLIC_CLIENT_HOST) || CLIENT_HOST;

/** Public marketing site host (bare domain). Empty = feature off (legacy single-host setup). */
export const MARKETING_HOST = clean(process.env.MARKETING_HOST) || '';
export const MARKETING_HOSTS: ReadonlySet<string> = new Set(MARKETING_HOST ? [MARKETING_HOST, `www.${MARKETING_HOST}`] : []);

/** Every hostname the app has ever been served on; used for "is this one of ours" checks. */
export const OUR_HOSTS: ReadonlySet<string> = new Set([
  CLIENT_HOST, ADMIN_HOST,
  'flycheap.18dn.com', 'admin.flycheap.18dn.com', 'tracker.18dn.com',
  'my.flycheap.live', 'admin.flycheap.live', 'flycheap.live', 'www.flycheap.live',
  ...MARKETING_HOSTS,
]);
export const ADMIN_HOSTS: ReadonlySet<string> = new Set([ADMIN_HOST, 'admin.flycheap.18dn.com', 'admin.flycheap.live']);

export function isOurHost(host: string | null | undefined): boolean {
  const h = (host ?? '').toLowerCase().split(':')[0];
  return OUR_HOSTS.has(h) || h === 'localhost' || h.startsWith('localhost:') || h.endsWith('.vercel.app');
}
