"use client";

import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";

/**
 * Submit button for server-component forms whose action is destructive or
 * hard to reverse (undo pick, reset match, lifecycle moves). Asks first;
 * cancelling the prompt stops the submit.
 */
export function ConfirmSubmitButton({
  confirmMessage,
  onClick,
  ...props
}: ComponentProps<typeof Button> & { confirmMessage: string }) {
  return (
    <Button
      type="submit"
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
