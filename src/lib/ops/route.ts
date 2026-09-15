/** Pure routing decision for Slack message events. Kept out of the route file so it is testable. */
export function routeSlackMessage(
  ev: { channel: string; thread_ts?: string; ts: string; bot_id?: string; subtype?: string; text?: string },
  ids: { admin: string; support: string },
  hasIncident: (threadTs: string) => boolean,
): 'ops' | 'support' | 'ignore' {
  const human = !ev.bot_id && !ev.subtype && typeof ev.text === 'string' && ev.text.trim().length > 0;
  if (!human) return 'ignore';
  if (ids.admin && ev.channel === ids.admin) {
    return ev.thread_ts && ev.thread_ts !== ev.ts && hasIncident(ev.thread_ts) ? 'ops' : 'ignore';
  }
  if (ids.support && ev.channel === ids.support) return 'support';
  return 'ignore';
}
