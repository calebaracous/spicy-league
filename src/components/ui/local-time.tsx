"use client";

import { useState, useSyncExternalStore } from "react";

import { Input } from "@/components/ui/input";

/**
 * Dates are formatted in the VIEWER's timezone, not the server's (Vercel runs
 * in UTC). The server render + hydration pass print UTC with an explicit
 * "UTC" label; once hydrated the client re-renders in local time.
 */

const noopSubscribe = () => () => {};

/** false during SSR and the hydration pass, true afterwards. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

type Preset = "datetime" | "date" | "weekday-datetime" | "date-short" | "month-day";

const PRESETS: Record<Preset, Intl.DateTimeFormatOptions> = {
  datetime: { dateStyle: "medium", timeStyle: "short" },
  date: { month: "long", day: "numeric", year: "numeric" },
  "date-short": { month: "short", day: "numeric", year: "numeric" },
  "month-day": { month: "short", day: "numeric" },
  "weekday-datetime": {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  },
};

const HAS_TIME: Record<Preset, boolean> = {
  datetime: true,
  date: false,
  "date-short": false,
  "month-day": false,
  "weekday-datetime": true,
};

export function LocalTime({ date, preset = "datetime" }: { date: Date | string; preset?: Preset }) {
  const hydrated = useHydrated();
  const d = typeof date === "string" ? new Date(date) : date;
  const options: Intl.DateTimeFormatOptions = {
    ...PRESETS[preset],
    ...(HAS_TIME[preset] && preset !== "datetime" ? { timeZoneName: "short" } : {}),
    ...(hydrated ? {} : { timeZone: "UTC" }),
  };
  let text = d.toLocaleString("en-US", options);
  // dateStyle/timeStyle can't be combined with timeZoneName — label UTC by hand.
  if (!hydrated && preset === "datetime") text += " UTC";
  return (
    <time dateTime={d.toISOString()} suppressHydrationWarning>
      {text}
    </time>
  );
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * `datetime-local` input that submits an absolute UTC ISO string under `name`.
 * A bare datetime-local value has no timezone, so the server would otherwise
 * parse it in ITS timezone. The visible input is unnamed; a hidden input
 * carries the converted value.
 */
export function LocalDateTimeInput({
  id,
  name,
  defaultValue,
}: {
  id: string;
  name: string;
  defaultValue?: Date | string | null;
}) {
  const hydrated = useHydrated();
  const [edited, setEdited] = useState<string | null>(null);
  const initial = hydrated && defaultValue ? toLocalInputValue(new Date(defaultValue)) : "";
  const local = edited ?? initial;
  const iso = local ? new Date(local).toISOString() : "";

  return (
    <>
      <Input
        id={id}
        type="datetime-local"
        value={local}
        onChange={(e) => setEdited(e.target.value)}
        // Until hydrated we can't know the viewer's timezone to prefill.
        disabled={!hydrated}
      />
      <input type="hidden" name={name} value={iso} />
    </>
  );
}
