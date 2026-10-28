import {
  adminDeleteAccount,
  adminLinkRiot,
  adminRefreshStats,
  adminSaveDiscordUserId,
  adminSaveDiscordUsername,
  adminUnlinkRiot,
} from "../admin-actions";
import { DeleteAccountForm } from "./delete-account-form";
import { RiotLinkForm } from "@/app/profile/_components/link-forms";
import { MAX_RIOT_ACCOUNTS } from "@/app/profile/constants";
import { DISCORD_USERNAME_HELP } from "@/lib/discord";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocalTime } from "@/components/ui/local-time";

export const ADMIN_ERROR_MESSAGES: Record<string, string> = {
  "discord-invalid": `That isn't a valid Discord username. ${DISCORD_USERNAME_HELP}.`,
  "discord-taken": "That Discord username is already on another account.",
  "discord-id-invalid": "A Discord user ID is a 17–20 digit number.",
  "discord-id-taken": "That Discord user ID is already matched to another account.",
};

type Props = {
  user: {
    id: string;
    username: string;
    discordUsername: string | null;
    discordUserId: string | null;
  };
  riotLinks: { id: string; externalHandle: string | null }[];
  lastRefreshed: Date | null;
  /** Why the account can't be deleted right now (src/lib/account-deletion.ts). */
  deletionBlocker: string | null;
  /** An admin's own page: they delete from their own card, not here. */
  isSelf: boolean;
};

/** Admin-only: fix a player's Discord and Riot details, or delete the account, from their public page. */
export function AdminAccountTools({
  user,
  riotLinks,
  lastRefreshed,
  deletionBlocker,
  isSelf,
}: Props) {
  const slotsLeft = MAX_RIOT_ACCOUNTS - riotLinks.length;
  const userIdField = <input type="hidden" name="userId" value={user.id} />;

  return (
    <Card style={{ borderColor: "var(--accent)" }}>
      <CardHeader>
        <CardTitle>Admin tools</CardTitle>
        <CardDescription>
          Only admins see this. Changes are logged in the events inbox.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-4">
          <h2 className="text-sm font-semibold">Discord</h2>
          <form action={adminSaveDiscordUsername} className="space-y-1.5">
            {userIdField}
            <Label htmlFor="admin-discordUsername">Discord username</Label>
            <div className="flex gap-2">
              <Input
                id="admin-discordUsername"
                name="discordUsername"
                defaultValue={user.discordUsername ?? ""}
                maxLength={33}
                autoComplete="off"
                required
              />
              <PendingSubmitButton variant="outline">Save</PendingSubmitButton>
            </div>
            <p className="text-muted-foreground text-xs">
              {DISCORD_USERNAME_HELP}. Changing it clears the matched ID below.
            </p>
          </form>
          <form action={adminSaveDiscordUserId} className="space-y-1.5">
            {userIdField}
            <Label htmlFor="admin-discordUserId">Matched Discord user ID</Label>
            <div className="flex gap-2">
              <Input
                id="admin-discordUserId"
                name="discordUserId"
                defaultValue={user.discordUserId ?? ""}
                inputMode="numeric"
                pattern="\d{17,20}"
                placeholder="Not matched yet"
                autoComplete="off"
              />
              <PendingSubmitButton variant="outline">Save</PendingSubmitButton>
            </div>
            <p className="text-muted-foreground text-xs">
              Set by Discord sync from the username. Enter it by hand (Discord → Copy User ID) if
              the sync can&apos;t find them, or save it empty to search again. Roles update on the
              next season sync.
            </p>
          </form>
        </section>

        <section className="space-y-3 border-t pt-4">
          <h2 className="text-sm font-semibold">Riot accounts</h2>
          {riotLinks.map((link) => (
            <div
              key={link.id}
              className="flex items-center justify-between rounded-lg border px-4 py-2"
            >
              <p className="text-sm font-medium">{link.externalHandle}</p>
              <form action={adminUnlinkRiot}>
                {userIdField}
                <input type="hidden" name="linkId" value={link.id} />
                <PendingSubmitButton
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                >
                  Unlink
                </PendingSubmitButton>
              </form>
            </div>
          ))}
          {riotLinks.length > 0 ? (
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-xs">
                {lastRefreshed ? (
                  <>
                    Last updated <LocalTime date={lastRefreshed} />
                  </>
                ) : (
                  "Stats not yet loaded"
                )}
              </p>
              <form action={adminRefreshStats}>
                {userIdField}
                <PendingSubmitButton variant="outline" size="sm">
                  Refresh stats
                </PendingSubmitButton>
              </form>
            </div>
          ) : null}
          {slotsLeft > 0 ? (
            <RiotLinkForm
              label={riotLinks.length === 0 ? "Riot ID" : "Add another Riot account"}
              hint={`${slotsLeft} slot${slotsLeft === 1 ? "" : "s"} remaining.`}
              linkAction={adminLinkRiot}
              userId={user.id}
            />
          ) : (
            <p className="text-muted-foreground text-xs">
              Maximum of {MAX_RIOT_ACCOUNTS} Riot accounts reached. Unlink one to add another.
            </p>
          )}
        </section>

        {isSelf ? null : (
          <section className="space-y-3 border-t pt-4">
            <h2 className="text-sm font-semibold">Delete account</h2>
            <p className="text-muted-foreground text-xs">
              Same as the player deleting it themselves: a player with past seasons or 10-mans is
              kept as &ldquo;Deleted player&rdquo; on those rosters, everyone else is removed
              outright. Can&apos;t be undone.
            </p>
            {deletionBlocker ? (
              <p className="text-muted-foreground text-sm">{deletionBlocker}</p>
            ) : (
              <DeleteAccountForm
                username={user.username}
                deleteAction={adminDeleteAccount}
                userId={user.id}
              />
            )}
          </section>
        )}
      </CardContent>
    </Card>
  );
}
