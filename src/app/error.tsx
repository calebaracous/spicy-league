"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";

import { LinkButton } from "@/components/ui/link-button";
import { SectionLabel } from "@/components/ui/section-label";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="site-container flex flex-col gap-6 py-24 md:py-32">
      <SectionLabel>ERROR</SectionLabel>
      <h1 className="text-heading" style={{ color: "var(--text)" }}>
        Something went wrong<span style={{ color: "var(--accent-text)" }}>.</span>
      </h1>
      <p className="text-body" style={{ color: "var(--muted)", maxWidth: "52ch" }}>
        This page hit an unexpected error. Trying again usually fixes it.
        {error.digest ? (
          <span className="mt-2 block font-mono text-xs">Reference: {error.digest}</span>
        ) : null}
      </p>
      <div className="flex flex-wrap gap-4">
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="inline-flex cursor-pointer items-center justify-center rounded-full px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-80"
          style={{ backgroundColor: "var(--accent)", color: "var(--accent-fg)" }}
        >
          Try again
        </button>
        <LinkButton href="/" variant="ghost">
          Go home →
        </LinkButton>
      </div>
    </div>
  );
}
