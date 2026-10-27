"use client";

import { Loader2Icon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

/**
 * Submit button for server-component forms whose action is slow (Discord
 * sync): while the form is submitting it shows a spinner and is disabled, so
 * it can't be clicked again until the action finishes.
 */
export function PendingSubmitButton({
  pendingLabel,
  disabled,
  children,
  ...props
}: ComponentProps<typeof Button> & { pendingLabel?: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" {...props} disabled={disabled || pending} aria-busy={pending}>
      {pending ? (
        <>
          <Loader2Icon className="animate-spin" aria-hidden />
          {pendingLabel ?? children}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
