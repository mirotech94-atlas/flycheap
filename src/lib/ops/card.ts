/** Slack text for incident cards and thread follow-ups. Pure; no I/O. */

export type CardFooter =
  | { kind: 'fixing'; text: string }
  | { kind: 'needs_you'; text: string }
  | { kind: 'none' };

export function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/** Text for a 'fixing' footer: tool + args, or just the tool name when it
 * takes no input (e.g. restart_app). */
export function formatFixingText(tool: string, input: Record<string, unknown>): string {
  return Object.keys(input).length === 0 ? tool : `${tool} ${JSON.stringify(input)}`;
}

export function formatCard(args: {
  title: string; firstSeen: string; occurrences: number;
  evidence: string; diagnosis: string | null; footer: CardFooter;
}): string {
  const since = args.firstSeen.replace(/:\d\d$/, '').replace('T', ' ');
  const lines = [
    `🔴 *${args.title}*`,
    `*Since:* ${since} UTC · *Seen:* ${args.occurrences}×`,
  ];
  const ev = args.evidence.trim();
  if (ev) lines.push(`*What I see:*\n\`\`\`${truncate(ev, 1500)}\`\`\``);
  lines.push(`*Diagnosis:* ${args.diagnosis?.trim() || 'unavailable'}`);
  if (args.footer.kind === 'fixing') lines.push(`*Fixing:* ${args.footer.text}`);
  if (args.footer.kind === 'needs_you') lines.push(`*Needs you:* ${args.footer.text}`);
  return lines.join('\n');
}

export function formatResolved(title: string): string {
  return `✅ Resolved — ${title} has been clear for 60 min.`;
}

export function formatBackUp(): string {
  return '✅ Back up, health OK.';
}
