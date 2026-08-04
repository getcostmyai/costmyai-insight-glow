/**
 * Owner-only access.
 *
 * The demo workspace is a real, fully populated workspace used for internal
 * review — it is not a public marketing surface. Access is pinned to one
 * specific user id, deliberately not to "any platform admin": widening it is a
 * decision the founder makes explicitly, not something a role grant implies.
 */
export const ROBIN_USER_ID = "f7ee292a-a564-48d3-b131-512dbe3d88c4";

export const isOwner = (userId: string | null | undefined) => userId === ROBIN_USER_ID;
