"use client";

import { useActionState, useState } from "react";

import type { LinkFormState } from "@/app/profile/account-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Type-the-username confirmation for account deletion. The owner's card
 * passes `deleteOwnAccount`; the admin tools pass `adminDeleteAccount` plus
 * the target's `userId`. The button stays disabled until the name matches.
 */
export function DeleteAccountForm({
  username,
  deleteAction,
  userId,
}: {
  username: string;
  deleteAction: (prev: LinkFormState, formData: FormData) => Promise<LinkFormState>;
  userId?: string;
}) {
  const [state, action, pending] = useActionState<LinkFormState, FormData>(deleteAction, {});
  const [typed, setTyped] = useState("");
  const matches = typed.trim().toLowerCase() === username;
  const inputId = userId ? "admin-delete-confirm" : "delete-confirm";

  return (
    <form action={action} className="space-y-3">
      {userId ? <input type="hidden" name="userId" value={userId} /> : null}
      <div className="space-y-1.5">
        <Label htmlFor={inputId}>
          Type <span className="font-mono">{username}</span> to confirm
        </Label>
        <Input
          id={inputId}
          name="confirm"
          autoComplete="off"
          required
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          aria-invalid={state.error ? true : undefined}
        />
      </div>
      {state.error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" variant="destructive" disabled={!matches || pending}>
        {pending ? "Deleting…" : "Delete account permanently"}
      </Button>
    </form>
  );
}
