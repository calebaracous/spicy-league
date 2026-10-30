"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * A checkbox that submits its (server-action) form as soon as it's toggled,
 * with "Saving…" / "Saved" next to it, instead of a separate Save button.
 * The action should refresh the page rather than redirect, so the page
 * doesn't jump. Renders the label and the status as siblings for the
 * form's flex row.
 */
export function AutoSaveCheckbox({
  name,
  defaultChecked,
  disabled,
  children,
}: {
  name: string;
  defaultChecked: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  const { pending } = useFormStatus();
  // "Saved" for a moment after a submit finishes (pending true → false).
  // `saves` counts finished submits so each one restarts the timer.
  const [lastPending, setLastPending] = useState(pending);
  const [saves, setSaves] = useState(0);
  const [showSaved, setShowSaved] = useState(false);
  if (pending !== lastPending) {
    setLastPending(pending);
    if (!pending) {
      setSaves((n) => n + 1);
      setShowSaved(true);
    }
  }
  useEffect(() => {
    if (saves === 0) return;
    const t = setTimeout(() => setShowSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saves]);

  return (
    <>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          disabled={disabled}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        />
        {children}
      </label>
      <span role="status" className="text-muted-foreground text-xs">
        {pending ? "Saving…" : showSaved ? "Saved" : ""}
      </span>
    </>
  );
}
