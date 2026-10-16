"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Turns a post-redirect success flag (`?saved=1`, `?signed-up=1`) into a
 * toast, then strips the flag from the URL so a refresh or shared link
 * doesn't repeat it. Server pages render this only when the flag is set.
 * Errors stay as inline alerts next to the form — those shouldn't vanish.
 */
export function FlashToast({ message, param = "saved" }: { message: string; param?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current) return; // StrictMode runs effects twice in dev
    shown.current = true;
    toast.success(message);
    const next = new URLSearchParams(searchParams.toString());
    next.delete(param);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [message, param, pathname, router, searchParams]);

  return null;
}
