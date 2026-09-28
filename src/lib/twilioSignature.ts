import crypto from 'node:crypto';

/**
 * Twilio request validation (X-Twilio-Signature), without the SDK.
 *
 * Twilio signs: the full URL it called (scheme, host, path, query) followed by
 * every POST parameter, sorted by name, as name+value with no separators —
 * HMAC-SHA1 keyed with the account auth token, base64. The URL must be the
 * PUBLIC one Twilio was configured with; behind Caddy the request URL the app
 * sees is http://localhost:3000/…, which would never match.
 */
export function twilioSignature(authToken: string, url: string, params: Record<string, string | string[]>): string {
  let data = url;
  for (const key of Object.keys(params).sort()) {
    const v = params[key];
    for (const one of Array.isArray(v) ? v : [v]) data += key + one;
  }
  return crypto.createHmac('sha1', authToken).update(data, 'utf8').digest('base64');
}

export function verifyTwilioSignature(input: {
  authToken: string | undefined | null;
  url: string;
  params: Record<string, string | string[]>;
  signature: string | null | undefined;
}): boolean {
  if (!input.authToken || !input.signature) return false;
  const expected = Buffer.from(twilioSignature(input.authToken, input.url, input.params));
  const given = Buffer.from(input.signature);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}
