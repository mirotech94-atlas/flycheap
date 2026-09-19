import type { MetadataRoute } from 'next';
import { CLIENT_HOST, MARKETING_HOST } from '@/lib/hosts';

/** Public site the crawler should treat as canonical: the marketing host when
 *  the split-host setup is on, otherwise the client host. Derived rather than
 *  typed so a domain cutover doesn't leave robots.txt advertising a dead host —
 *  it pointed at flycheap.18dn.com for three days after the .live cutover. */
const PUBLIC_HOST = MARKETING_HOST || CLIENT_HOST;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/explore', '/login'],
        disallow: [
          '/admin', '/settings', '/searches', '/onboarding', '/api/',
          // Affiliate redirector. Crawlers following these fire real outbound
          // affiliate clicks under our marker: GPTBot, Baiduspider and
          // meta-externalagent accounted for 3,324 of 4,275 logged clicks
          // (78%) by 2026-09-18. That inflates every revenue figure and sends
          // bot traffic to partners under our ID, which is exactly what gets
          // an affiliate account suspended.
          '/go',
          // Magic-link and share entry points — following them burns
          // single-use tokens and indexes per-user pages.
          '/m/', '/share/', '/share-handler',
        ],
      },
    ],
    sitemap: `https://${PUBLIC_HOST}/sitemap.xml`,
    host: `https://${PUBLIC_HOST}`,
  };
}
