/**
 * Pure decisions behind Discord role sync (`src/lib/discord-roles.ts`), split
 * out so they can be unit-tested without Discord or the DB.
 */

/**
 * The member whose Discord username is exactly `username`. Discord's search
 * also matches nickname / username prefixes, so anything else is ignored.
 */
export function pickExactMember<M extends { user: { id: string; username: string } }>(
  members: M[],
  username: string,
): M | null {
  const want = username.toLowerCase();
  return members.find((m) => m.user.username.toLowerCase() === want) ?? null;
}

/**
 * Captain role changes: every current captain gets it; anyone who only held it
 * as a captain of another season loses it, so it always means "this season".
 */
export function captainRoleChanges(
  currentCaptainIds: string[],
  otherSeasonCaptainIds: string[],
): { add: string[]; remove: string[] } {
  const add = [...new Set(currentCaptainIds)];
  const keep = new Set(add);
  const remove = [...new Set(otherSeasonCaptainIds)].filter((id) => !keep.has(id));
  return { add, remove };
}

/**
 * Bot-created team roles to delete when a season's team roles are synced:
 * those of seasons created before it. Later seasons are never touched, so
 * re-syncing an old season can't wipe the current one's roles.
 */
export function staleTeamRoles<T extends { discordRoleId: string | null; seasonCreatedAt: Date }>(
  otherTeams: T[],
  seasonCreatedAt: Date,
): T[] {
  return otherTeams.filter(
    (t) => t.discordRoleId !== null && t.seasonCreatedAt.getTime() < seasonCreatedAt.getTime(),
  );
}
