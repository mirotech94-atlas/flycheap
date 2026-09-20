import 'server-only';
import { getDb } from './db';

/**
 * Organizations, groups and members.
 *
 * "Do not build a separate B2B app. An agency or a university office is an
 *  Organization with several groups; a family is an Organization with one. Same
 *  screens, with org-level features appearing only when the account has them."
 *
 * The cost of a second frontend is not the build — it is that every feature then
 * has to be built twice and one of them rots.
 */

export type OrgTier = 'team' | 'enterprise';
export type OrgRole = 'owner' | 'admin' | 'agent' | 'viewer';

export type Organization = {
  id: number;
  name: string;
  slug: string;
  tier: OrgTier;
  brand_logo_url: string | null;
  brand_color: string | null;
  from_name: string | null;
  support_email: string | null;
  sending_domain: string | null;
  sending_domain_verified_at: string | null;
  board_domain: string | null;
  board_domain_verified_at: string | null;
  monetization_enabled: number;
  affiliate_marker: string | null;
  created_at: string;
  archived_at: string | null;
};

export type Group = {
  id: number;
  org_id: number;
  name: string;
  contact_email: string | null;
  notes: string | null;
  created_at: string;
  archived_at: string | null;
};

const db = () => getDb();

/**
 * Org-level capabilities, by tier.
 *
 * "The line between Team and Enterprise is whose name is on it. Branding, domain
 *  and sending identity are what an agency or a university office is really
 *  buying, and they are worth a large multiple because the alternative is
 *  building it."
 */
export type OrgLimits = {
  groups: number;
  watches: number;
  members: number;
  brandedBoards: boolean;
  customBoardDomain: boolean;
  ownSendingDomain: boolean;
  scheduledReports: boolean;
  recurringCohorts: boolean;
  apiWrite: boolean;
  webhooks: boolean;
  auditLogDays: number;
};

export const ORG_LIMITS: Record<OrgTier, OrgLimits> = {
  team: {
    groups: 10, watches: 250, members: 5,
    brandedBoards: false, customBoardDomain: false, ownSendingDomain: false,
    scheduledReports: false, recurringCohorts: false,
    apiWrite: false, webhooks: false, auditLogDays: 90,
  },
  enterprise: {
    groups: Infinity, watches: Infinity, members: Infinity,
    brandedBoards: true, customBoardDomain: true, ownSendingDomain: true,
    scheduledReports: true, recurringCohorts: true,
    apiWrite: true, webhooks: true, auditLogDays: 3650,
  },
};

export function limitsForOrg(org: Pick<Organization, 'tier'> | null | undefined): OrgLimits {
  return ORG_LIMITS[(org?.tier as OrgTier) ?? 'team'] ?? ORG_LIMITS.team;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function getOrg(id: number): Organization | null {
  return (db().prepare(`SELECT * FROM organizations WHERE id = ?`).get(id) as Organization | undefined) ?? null;
}

export function getOrgBySlug(slug: string): Organization | null {
  return (db().prepare(`SELECT * FROM organizations WHERE slug = ?`).get(slug) as Organization | undefined) ?? null;
}

/** Every org this user belongs to, with their role in each. */
export function orgsForUser(userId: number): Array<Organization & { role: OrgRole }> {
  return db().prepare(
    `SELECT o.*, m.role FROM organizations o
       JOIN org_members m ON m.org_id = o.id
      WHERE m.user_id = ? AND o.archived_at IS NULL
      ORDER BY o.name`,
  ).all(userId) as Array<Organization & { role: OrgRole }>;
}

export function roleInOrg(orgId: number, userId: number): OrgRole | null {
  const row = db().prepare(
    `SELECT role FROM org_members WHERE org_id = ? AND user_id = ?`,
  ).get(orgId, userId) as { role: OrgRole } | undefined;
  return row?.role ?? null;
}

export function groupsForOrg(orgId: number, includeArchived = false): Group[] {
  return db().prepare(
    `SELECT * FROM groups WHERE org_id = ?${includeArchived ? '' : ' AND archived_at IS NULL'}
      ORDER BY name`,
  ).all(orgId) as Group[];
}

export function getGroup(id: number): Group | null {
  return (db().prepare(`SELECT * FROM groups WHERE id = ?`).get(id) as Group | undefined) ?? null;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** URL-safe slug, uniquified. Slugs appear in board URLs, so they must be stable. */
export function slugify(name: string): string {
  return name.toLowerCase().normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'org';
}

export function createOrg(input: {
  name: string; tier?: OrgTier; ownerUserId: number;
}): Organization {
  const base = slugify(input.name);
  let slug = base;
  for (let i = 2; getOrgBySlug(slug); i++) slug = `${base}-${i}`;

  const tx = db().transaction(() => {
    const res = db().prepare(
      `INSERT INTO organizations (name, slug, tier) VALUES (?, ?, ?)`,
    ).run(input.name, slug, input.tier ?? 'team');
    const orgId = Number(res.lastInsertRowid);
    db().prepare(
      `INSERT INTO org_members (org_id, user_id, role) VALUES (?, ?, 'owner')`,
    ).run(orgId, input.ownerUserId);
    return orgId;
  });
  return getOrg(tx())!;
}

export function createGroup(input: {
  orgId: number; name: string; contactEmail?: string | null; createdBy?: number | null;
}): Group {
  const res = db().prepare(
    `INSERT INTO groups (org_id, name, contact_email, created_by) VALUES (?, ?, ?, ?)`,
  ).run(input.orgId, input.name, input.contactEmail ?? null, input.createdBy ?? null);
  return getGroup(Number(res.lastInsertRowid))!;
}

export function addMember(orgId: number, userId: number, role: OrgRole = 'agent'): void {
  db().prepare(
    `INSERT INTO org_members (org_id, user_id, role) VALUES (?, ?, ?)
     ON CONFLICT(org_id, user_id) DO UPDATE SET role = excluded.role`,
  ).run(orgId, userId, role);
}

// ---------------------------------------------------------------------------
// The monetization question
// ---------------------------------------------------------------------------

/**
 * May we monetize this group's travellers?
 *
 * "An agency does not want your hotel emails going to their clients — those are
 *  their clients and hotel commission is their revenue. So the monetization
 *  chain is OFF BY DEFAULT for organization accounts, with an option to turn it
 *  on and share revenue, or to point the affiliate links at the agency's own
 *  Travelpayouts marker. 'Your clients, your commissions, our engine' is a much
 *  better pitch than a tool that quietly monetizes the relationship they own."
 *
 * Default-deny: a group with no org, or an org we cannot read, does not get
 * monetized. Being wrong in this direction costs a commission; being wrong in
 * the other direction costs the contract.
 */
export function monetizationAllowedForGroup(groupId: number | null | undefined): boolean {
  if (groupId == null) return true;   // personal watch, not an org relationship
  const row = db().prepare(
    `SELECT o.monetization_enabled AS enabled
       FROM groups g JOIN organizations o ON o.id = g.org_id
      WHERE g.id = ?`,
  ).get(groupId) as { enabled: number } | undefined;
  if (!row) return false;             // unknown org — do not monetize
  return row.enabled === 1;
}

/**
 * Whose affiliate marker outbound links should carry for this group.
 *
 * Null means ours. A non-null value is the agency's own marker: they keep the
 * commission and we keep the subscription, which is the cleaner sale.
 */
export function affiliateMarkerForGroup(groupId: number | null | undefined): string | null {
  if (groupId == null) return null;
  const row = db().prepare(
    `SELECT o.affiliate_marker AS marker
       FROM groups g JOIN organizations o ON o.id = g.org_id
      WHERE g.id = ?`,
  ).get(groupId) as { marker: string | null } | undefined;
  return row?.marker ?? null;
}

/**
 * Mistake-fare routing for org accounts.
 *
 * "A university office that forwards a glitch fare to 400 students, half of whom
 *  book and then have their tickets voided by the airline, has a serious problem
 *  and you are in the middle of it. So for organization accounts, mistake-fare
 *  alerts go to the AGENT first, never straight to travellers, with the label
 *  attached explaining that airlines sometimes cancel these. The agent decides
 *  whether to forward."
 *
 * That single default removes almost all of the exposure and costs nothing but a
 * routing rule.
 */
export function mistakeFaresGoToAgentFirst(groupId: number | null | undefined): boolean {
  return groupId != null;
}
