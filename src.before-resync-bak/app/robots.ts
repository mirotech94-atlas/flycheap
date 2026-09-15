import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: ['/welcome', '/explore', '/login'], disallow: ['/admin', '/settings', '/searches', '/api/'] },
    ],
    sitemap: 'https://tracker.18dn.com/sitemap.xml',
    host: 'https://tracker.18dn.com',
  };
}
