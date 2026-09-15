import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://tracker.18dn.com';
  const now = new Date();
  return [
    { url: `${base}/welcome`, lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${base}/explore`, lastModified: now, changeFrequency: 'hourly',  priority: 0.9 },
    { url: `${base}/login`,   lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/`,        lastModified: now, changeFrequency: 'hourly',  priority: 0.8 },
  ];
}
