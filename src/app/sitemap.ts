import type { MetadataRoute } from 'next';
import { CLIENT_HOST, MARKETING_HOST } from '@/lib/hosts';

/** Same derivation as robots.ts — the sitemap must advertise the host the
 *  pages are actually served on, or every URL in it 404s after a cutover. */
const base = `https://${MARKETING_HOST || CLIENT_HOST}`;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${base}/welcome`, lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${base}/explore`, lastModified: now, changeFrequency: 'hourly',  priority: 0.9 },
    { url: `${base}/login`,   lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/`,        lastModified: now, changeFrequency: 'hourly',  priority: 0.8 },
  ];
}
