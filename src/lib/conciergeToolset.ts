import 'server-only';
import { CHAT_SYSTEM_PROMPT, TOOLS, CHAT_MUTATING_TOOLS, runTool } from './chatTools';
import { FAREPILOT_SYSTEM_PROMPT, FAREPILOT_TOOLS, FAREPILOT_MUTATING_TOOLS, runFarePilotTool, buildUserSnapshot } from './farePilotTools';

/**
 * Which concierge a caller gets.
 *
 * The web concierge (/api/chat) grew up as the owner's private assistant: its
 * tools read every search in the database, write settings globally, insert
 * routes into user 1's account and email the owner-wide digest to any address
 * the caller names. It was then mounted on every page for every visitor, with
 * no sign-in check. So a stranger on the marketing site could add or delete
 * the owner's routes, change the alert address, or mail the whole digest to
 * themselves — found 2026-09-28 while auditing the internal emails.
 *
 * The rule now: no user, no concierge; the owner keeps the global toolset;
 * everyone else gets FarePilot, the multi-tenant toolset /api/v1/chat already
 * uses, scoped to their own user_id. `conciergeScope` is pure so a test can
 * pin the rule without a request.
 */
export type ConciergeScope = 'anonymous' | 'owner' | 'user';

export function conciergeScope<U extends { id: number }>(user: U | null | undefined, ownerCheck: (u: U) => boolean): ConciergeScope {
  if (!user) return 'anonymous';
  return ownerCheck(user) ? 'owner' : 'user';
}

export type ToolResult = { content: string; is_error?: boolean };
export type Toolset = {
  scope: 'owner' | 'user';
  system: string;
  tools: typeof TOOLS | typeof FAREPILOT_TOOLS;
  mutating: Set<string>;
  run: (name: string, input: Record<string, unknown>) => Promise<ToolResult>;
};

export function buildToolset(scope: 'owner' | 'user', userId: number, baseUrl: string): Toolset {
  if (scope === 'owner') {
    return { scope, system: CHAT_SYSTEM_PROMPT, tools: TOOLS, mutating: CHAT_MUTATING_TOOLS, run: runTool };
  }
  return {
    scope,
    system: `${FAREPILOT_SYSTEM_PROMPT}\n\n${buildUserSnapshot(userId)}`,
    tools: FAREPILOT_TOOLS,
    mutating: FAREPILOT_MUTATING_TOOLS,
    run: (name, input) => runFarePilotTool(userId, name, input, baseUrl),
  };
}
