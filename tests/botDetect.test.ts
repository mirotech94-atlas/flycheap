import { describe, expect, it } from 'vitest';
import { isBotUserAgent } from '../src/lib/botDetect';

/**
 * Guards the affiliate redirector's crawler short-circuit. Two failure modes,
 * and they are NOT symmetric:
 *
 *  - a missed bot inflates revenue figures and fires a partner click under our
 *    affiliate marker, which is how affiliate accounts get suspended;
 *  - a false positive silently drops a paying customer's click.
 *
 * So the real-browser cases below matter at least as much as the bot ones.
 */
describe('isBotUserAgent', () => {
  it('catches the three crawlers the 2026-09-18 audit actually found', () => {
    // 78% of logged clicks came from these.
    expect(isBotUserAgent('Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot')).toBe(true);
    expect(isBotUserAgent('Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)')).toBe(true);
    expect(isBotUserAgent('meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)')).toBe(true);
  });

  it('catches common SEO crawlers and scripted clients', () => {
    for (const ua of [
      'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
      'Mozilla/5.0 (compatible; SemrushBot/7~bl)',
      'Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)',
      'ClaudeBot/1.0',
      'curl/8.4.0',
      'python-requests/2.31.0',
      'Go-http-client/2.0',
      'HeadlessChrome/120.0.0.0',
    ]) {
      expect(isBotUserAgent(ua), ua).toBe(true);
    }
  });

  it('does NOT flag real browsers — a false positive drops a customer click', () => {
    for (const ua of [
      // Chrome on Windows
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      // Safari on iPhone
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      // Firefox on macOS
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:126.0) Gecko/20100101 Firefox/126.0',
      // Edge
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0',
      // Android Chrome
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
    ]) {
      expect(isBotUserAgent(ua), ua).toBe(false);
    }
  });

  it('treats an absent User-Agent as a person, not a bot', () => {
    // Privacy tooling strips the UA for real people. The module documents this
    // as a deliberate choice: rather log a crawler than drop a customer.
    expect(isBotUserAgent(null)).toBe(false);
    expect(isBotUserAgent(undefined)).toBe(false);
    expect(isBotUserAgent('')).toBe(false);
  });
});
