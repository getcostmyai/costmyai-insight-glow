/**
 * Who may see a demo workspace, and which one.
 *
 * Two audiences, two workspaces — deliberately not one shared workspace with
 * two doors. The internal workspace stays pinned to one specific user id (not
 * "any platform admin": widening it is a decision the founder makes
 * explicitly). Real, currently-active partners get a second, separate seeded
 * workspace, so a partner's live sales call can never collide with internal
 * testing or audit work happening in the first one.
 */
export const ROBIN_USER_ID = "f7ee292a-a564-48d3-b131-512dbe3d88c4";

export const isOwner = (userId: string | null | undefined) => userId === ROBIN_USER_ID;

/** The internal demo workspace — Robin only. */
export const DEMO_ORG_ID = "00000000-0000-0000-0000-000000000001";
/** The partner-facing demo workspace — real, currently-active partners only. */
export const PARTNER_DEMO_ORG_ID = "00000000-0000-0000-0000-000000000002";

export type DemoAudience = "owner" | "partner";

export const demoOrgFor = (audience: DemoAudience) =>
  audience === "owner" ? DEMO_ORG_ID : PARTNER_DEMO_ORG_ID;
