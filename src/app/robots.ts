import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: ['/welcome', '/explore', '/login'], disallow: ['/admin', '/settings', '/searches', '/onboarding', '/api/'] },
    ],
    sitemap: 'https://flycheap.live/sitemap.xml',
    host: 'https://flycheap.live',
  };
}
