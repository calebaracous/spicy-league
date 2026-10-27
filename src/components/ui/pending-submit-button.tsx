"use client";

import { Loader2Icon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

/**
 * Submit button for server-component forms with a server action: while the
 * action runs it shows a spinner and is disabled, so it can't be clicked
 * again until the response comes back. Use it for every action submit
 * (ConfirmSubmitButton builds on it); client forms with their own pending
 * state (useActionState / useTransition) disable their buttons directly.
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
