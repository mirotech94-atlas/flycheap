import type { MetadataRoute } from 'next';
import { CLIENT_HOST, MARKETING_HOST } from '@/lib/hosts';

/** Same derivation as robots.ts — the sitemap must advertise the host the
 *  pages are actually served on, or every URL in it 404s after a cutover. */
const base = `https://${MARKETING_HOST || CLIENT_HOST}`;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    // `/` is the front door. It used to sit at 0.8 BELOW a /welcome entry at
    // 1.0 — and /welcome redirects away on every host, so the sitemap was
    // advertising a redirect as the site's most important page.
    { url: `${base}/`,           lastModified: now, changeFrequency: 'hourly',  priority: 1.0 },
    { url: `${base}/explore`,    lastModified: now, changeFrequency: 'hourly',  priority: 0.9 },
    { url: `${base}/about`,      lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/guides`,     lastModified: now, changeFrequency: 'weekly',  priority: 0.7 },
    { url: `${base}/login`,      lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/terms`,      lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${base}/privacy`,    lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
  ];
}
