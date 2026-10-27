"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { linkCs2Account, linkRiotAccount, type LinkFormState } from "../account-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Inputs are controlled: React resets uncontrolled fields after a form
// action, which would wipe a typo'd Riot ID along with the error.

function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Alert variant="destructive" role="alert">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

/**
 * `linkAction` + `userId` let the admin tools on /users/[username] reuse this
 * to link an account to someone else's profile.
 */
export function RiotLinkForm({
  label,
  hint,
  linkAction = linkRiotAccount,
  userId,
}: {
  label: string;
  hint: string;
  linkAction?: (prev: LinkFormState, formData: FormData) => Promise<LinkFormState>;
  userId?: string;
}) {
  const [state, action, pending] = useActionState<LinkFormState, FormData>(linkAction, {});
  const [riotId, setRiotId] = useState("");

  return (
    <form action={action} className="space-y-3">
      {userId ? <input type="hidden" name="userId" value={userId} /> : null}
      <div className="space-y-1.5">
        <Label htmlFor="riotId">{label}</Label>
        <Input
          id="riotId"
          name="riotId"
          placeholder="GameName#NA1"
          required
          value={riotId}
          onChange={(e) => setRiotId(e.target.value)}
          aria-invalid={state.error ? true : undefined}
        />
        <p className="text-muted-foreground text-xs">
          Found in the client under your profile icon (top right). {hint}
        </p>
      </div>
      <FormError message={state.error} />
      <Button type="submit" disabled={pending}>
        {pending ? "Linking…" : "Link Riot account"}
      </Button>
    </form>
  );
}

export function Cs2LinkForm() {
  const [state, action, pending] = useActionState<LinkFormState, FormData>(linkCs2Account, {});
  const [steamId, setSteamId] = useState("");
  const [leetifyUrl, setLeetifyUrl] = useState("");

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="steamId">Steam64 ID</Label>
        <Input
          id="steamId"
          name="steamId"
          placeholder="76561198000000000"
          pattern="7656\d{13}"
          required
          value={steamId}
          onChange={(e) => setSteamId(e.target.value)}
        />
        <p className="text-muted-foreground text-xs">
          Find yours at{" "}
          <Link
            href="https://steamid.io"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            steamid.io
          </Link>{" "}
          — use the steamID64 value.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="leetifyUrl">
          Leetify profile URL <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="leetifyUrl"
          name="leetifyUrl"
          type="url"
          placeholder="https://leetify.com/app/profile/76561198000000000"
          value={leetifyUrl}
          onChange={(e) => setLeetifyUrl(e.target.value)}
        />
      </div>
      <FormError message={state.error} />
      <Button type="submit" disabled={pending}>
        {pending ? "Linking…" : "Link CS2 account"}
      </Button>
    </form>
  );
}
