import Link from "next/link";

import { decideSub, requestSub, withdrawSub } from "../../sub-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_SUBS_PER_TEAM } from "@/lib/substitution-rules";
import type { LineupPlayer, SubCandidate, SubRequestView } from "@/lib/substitutions";

type TeamInfo = { id: string; name: string };

const selectClass =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 flex h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3";

const STATUS_BADGE: Record<
  SubRequestView["status"],
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  pending: { label: "Awaiting admin", variant: "default" },
  approved: { label: "Approved", variant: "secondary" },
  rejected: { label: "Rejected", variant: "outline" },
  withdrawn: { label: "Withdrawn", variant: "outline" },
};

function LineupCard({
  team,
  label,
  players,
}: {
  team: TeamInfo;
  label: string;
  players: LineupPlayer[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          {team.name} <span className="text-muted-foreground text-xs font-normal">({label})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1 text-sm">
          {players.map((m) => (
            <li key={m.userId} className="flex items-center gap-2">
              {m.sub ? (
                <Badge className="text-xs">Sub</Badge>
              ) : m.pickNumber === null ? (
                <Badge variant="secondary" className="text-xs">
                  C
                </Badge>
              ) : (
                <span className="text-muted-foreground w-5 text-right font-mono text-xs">
                  #{m.pickNumber}
                </span>
              )}
              <Link
                href={`/users/${m.username}`}
                className={
                  m.satOut
                    ? "text-muted-foreground line-through underline-offset-2 hover:underline"
                    : "underline-offset-2 hover:underline"
                }
              >
                {m.name ?? m.username}
              </Link>
              {m.satOut ? <span className="text-muted-foreground text-xs">sat out</span> : null}
              {m.sub ? (
                <span className="text-muted-foreground truncate text-xs">
                  {m.sub.replacing ? `for ${m.sub.replacing}` : "extra slot"}
                  {m.sub.fromTeam ? ` · from ${m.sub.fromTeam}` : ""}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * Rosters (with approved subs) plus the substitutions card: request form for
 * the team's captain (or an admin) while the match is scheduled, the list of
 * requests, and admin approve / reject / revoke.
 */
export function MatchLineups({
  slug,
  matchId,
  matchState,
  home,
  away,
  lineups,
  managedTeamIds,
  isAdmin,
  candidates,
}: {
  slug: string;
  matchId: string;
  matchState: string;
  home: TeamInfo;
  away: TeamInfo;
  lineups: { home: LineupPlayer[]; away: LineupPlayer[]; requests: SubRequestView[] };
  /** Teams the viewer may request subs for (captain → own; admin → both). */
  managedTeamIds: string[];
  isAdmin: boolean;
  candidates: SubCandidate[];
}) {
  const here = `/seasons/${slug}/matches/${matchId}`;
  const open = matchState === "scheduled";
  const teamName = (id: string) => (id === home.id ? home.name : away.name);
  const visibleRequests = lineups.requests.filter(
    (r) =>
      r.status === "pending" ||
      r.status === "approved" ||
      managedTeamIds.includes(r.teamId) ||
      isAdmin,
  );
  const request = requestSub.bind(null, slug, matchId);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <LineupCard team={home} label="Home" players={lineups.home} />
        <LineupCard team={away} label="Away" players={lineups.away} />
      </div>

      {visibleRequests.length > 0 || (open && managedTeamIds.length > 0) ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Substitutions</CardTitle>
            <CardDescription>
              {/* One string: JSX drops the space after {expr} when the text wraps. */}
              {`Up to ${MAX_SUBS_PER_TEAM} per team. Every sub needs an admin's approval, and the lineup locks once a result is reported.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {visibleRequests.length > 0 ? (
              <ul className="divide-y rounded-lg border">
                {visibleRequests.map((r) => {
                  const badge = STATUS_BADGE[r.status];
                  const canWithdraw =
                    r.status === "pending" && (managedTeamIds.includes(r.teamId) || isAdmin);
                  return (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <span className="font-medium">{r.subName}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          → {teamName(r.teamId)}
                          {r.replacingName ? `, for ${r.replacingName}` : ", extra slot"}
                          {r.fromTeam ? ` · from ${r.fromTeam}` : ""}
                        </span>
                        {r.reason ? (
                          <p className="text-muted-foreground text-xs">“{r.reason}”</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                        {isAdmin && r.status === "pending" ? (
                          <>
                            <form action={decideSub.bind(null, slug, matchId, r.id)}>
                              <input type="hidden" name="decision" value="approve" />
                              <input type="hidden" name="back" value={here} />
                              <Button type="submit" size="sm">
                                Approve
                              </Button>
                            </form>
                            <form action={decideSub.bind(null, slug, matchId, r.id)}>
                              <input type="hidden" name="decision" value="reject" />
                              <input type="hidden" name="back" value={here} />
                              <Button type="submit" size="sm" variant="ghost">
                                Reject
                              </Button>
                            </form>
                          </>
                        ) : null}
                        {isAdmin && r.status === "approved" && open ? (
                          <form action={decideSub.bind(null, slug, matchId, r.id)}>
                            <input type="hidden" name="decision" value="revoke" />
                            <input type="hidden" name="back" value={here} />
                            <ConfirmSubmitButton
                              size="sm"
                              variant="ghost"
                              confirmMessage={`Revoke ${r.subName}'s sub slot? The original player goes back into the lineup.`}
                            >
                              Revoke
                            </ConfirmSubmitButton>
                          </form>
                        ) : null}
                        {canWithdraw && !isAdmin ? (
                          <form action={withdrawSub.bind(null, slug, matchId, r.id)}>
                            <Button type="submit" size="sm" variant="ghost">
                              Withdraw
                            </Button>
                          </form>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {open && managedTeamIds.length > 0 ? (
              <form action={request} className="space-y-3">
                <p className="text-sm font-medium">Request a sub</p>
                {managedTeamIds.length > 1 ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="sub-team">For team</Label>
                    <select
                      id="sub-team"
                      name="teamId"
                      required
                      className={selectClass}
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Choose a team…
                      </option>
                      <option value={home.id}>{home.name}</option>
                      <option value={away.id}>{away.name}</option>
                    </select>
                  </div>
                ) : (
                  <input type="hidden" name="teamId" value={managedTeamIds[0]} />
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="sub-in">Sub in</Label>
                    <select
                      id="sub-in"
                      name="subUserId"
                      required
                      className={selectClass}
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Choose a player…
                      </option>
                      {candidates.map((c) => (
                        <option key={c.userId} value={c.userId}>
                          {c.label}
                          {c.rank ? ` · ${c.rank}` : ""}
                          {c.teamName ? ` · on ${c.teamName}` : " · free agent"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sub-out">Sitting out</Label>
                    <select
                      id="sub-out"
                      name="replacedUserId"
                      className={selectClass}
                      defaultValue=""
                    >
                      <option value="">Nobody (team is short)</option>
                      {(managedTeamIds.length === 1
                        ? managedTeamIds[0] === home.id
                          ? lineups.home
                          : lineups.away
                        : [...lineups.home, ...lineups.away]
                      )
                        .filter((p) => !p.sub && !p.satOut)
                        .map((p) => (
                          <option key={p.userId} value={p.userId}>
                            {p.name ?? p.username}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sub-reason">
                    Reason{" "}
                    <span className="text-muted-foreground">(optional, shown to admins)</span>
                  </Label>
                  <Input
                    id="sub-reason"
                    name="reason"
                    maxLength={200}
                    placeholder="e.g. Away this week"
                  />
                </div>
                <Button type="submit">Request sub</Button>
              </form>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
