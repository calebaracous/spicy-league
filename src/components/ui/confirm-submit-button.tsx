"use client";

import type { ComponentProps } from "react";

import { PendingSubmitButton } from "@/components/ui/pending-submit-button";

/**
 * Submit button for server-component forms whose action is destructive or
 * hard to reverse (undo pick, reset match, lifecycle moves). Asks first;
 * cancelling the prompt stops the submit. Locked with a spinner while the
 * action runs, like PendingSubmitButton.
 */
export function ConfirmSubmitButton({
  confirmMessage,
  onClick,
  ...props
}: ComponentProps<typeof PendingSubmitButton> & { confirmMessage: string }) {
  return (
    <PendingSubmitButton
      {...props}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
    />
  );
}
