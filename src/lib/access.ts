/**
 * Who may see the demo workspace.
 *
 * One workspace, one set of numbers, for every audience that is allowed in:
 * the founder and real, currently-active partners. The demo ecosystem is fed
 * by a single synthetic tick that only ever advances the oldest synthetic org,
 * so any second seeded workspace freezes the day it stops being the oldest and
 * then shows a partner stale figures on a client call.
 *
 * Sharing one workspace across audiences is safe because the workspace is
 * read-only for every caller by database guarantee, not by convention. The
 * SECURITY DEFINER write functions raise on any synthetic org, and every write
 * policy on objectives and organizations requires org-manager membership,
 * which no demo workspace grants to anyone.
 *
 * Access itself stays narrow: the owner is pinned to one specific user id, and
 * the partner arm resolves through active partner membership on every request.
 */
export const ROBIN_USER_ID = "f7ee292a-a564-48d3-b131-512dbe3d88c4";

export const isOwner = (userId: string | null | undefined) => userId === ROBIN_USER_ID;

/** The demo workspace everyone allowed in reads. */
export const DEMO_ORG_ID = "00000000-0000-0000-0000-000000000001";
/**
 * Dormant. The Partner Demo Workspace row still exists and keeps its rollups,
 * but nothing routes to it any more. Whether to dispose of it is a separate
 * decision, so the constant stays here rather than disappearing quietly.
 */
export const PARTNER_DEMO_ORG_ID = "00000000-0000-0000-0000-000000000002";

export type DemoAudience = "owner" | "partner";

export const demoOrgFor = (_audience: DemoAudience) => DEMO_ORG_ID;
