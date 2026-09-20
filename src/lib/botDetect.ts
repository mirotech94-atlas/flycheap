/**
 * Crawler detection for the affiliate redirector.
 *
 * Why this exists: on 2026-09-18 an audit of `affiliate_clicks` found 3,324 of
 * 4,275 logged clicks (78%) came from 37 IPs running GPTBot, Baiduspider and
 * meta-externalagent. Two real costs:
 *
 *   1. Every revenue figure was overstated ~4.5x, because the dashboard counted
 *      crawler hits as user intent.
 *   2. Each crawl fired a genuine outbound affiliate click under our marker.
 *      Sending bot traffic to a partner under your own affiliate ID is the
 *      fastest way to get an affiliate account suspended.
 *
 * robots.txt now disallows /go, and the three crawlers above honour it — this
 * is the belt-and-braces layer for the ones that don't.
 *
 * Deliberately conservative: it matches self-identifying agents only. A missing
 * User-Agent is NOT treated as a bot, because privacy tooling strips it for
 * real people and we would rather log a crawler than drop a customer.
 */

const BOT_PATTERNS: readonly RegExp[] = [
  /bot\b/i,          // GPTBot, Googlebot, Bingbot, Baiduspider's "bot" variants
  /spider/i,         // Baiduspider, Sogou spider
  /crawler|crawling/i,
  /externalagent/i,  // meta-externalagent (Facebook)
  /headless/i,       // HeadlessChrome, Puppeteer defaults
  /slurp/i,          // Yahoo
  /\bphantomjs\b|\bselenium\b|\bplaywright\b|\bpuppeteer\b/i,
  /\bcurl\/|\bwget\b|python-requests|\baiohttp\b|\bscrapy\b|\bgo-http-client\b|\bokhttp\b|\bjava\//i,
  /\bpreview\b.*\bbot\b|facebookexternalhit|twitterbot|slackbot|discordbot|whatsapp/i,
  /ahrefs|semrush|mj12|dotbot|petalbot|bytespider|amazonbot|claudebot|ccbot|perplexitybot/i,
];

/** True when the User-Agent self-identifies as an automated client. */
export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false; // absent UA is not evidence of a bot — see note above
  return BOT_PATTERNS.some(re => re.test(ua));
}
