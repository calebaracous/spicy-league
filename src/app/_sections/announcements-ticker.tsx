import { MegaphoneIcon } from "lucide-react";
import type { CSSProperties } from "react";

import { LocalTime } from "@/components/ui/local-time";
import { SectionLabel } from "@/components/ui/section-label";
import type { Announcement } from "@/lib/discord-announcements";
import { cn } from "@/lib/utils";

/**
 * Full-width band under the hero scrolling the latest #announcements
 * messages (src/lib/discord-announcements.ts). CSS-only marquee: the list is
 * rendered twice and the track slides by half its width, so it loops
 * seamlessly. Pauses on hover and keyboard focus; reduced-motion users get a
 * still, horizontally scrollable row instead (globals.css → .ticker-*).
 */
export function AnnouncementsTicker({ items }: { items: Announcement[] }) {
  if (items.length === 0) return null;
  // A few short messages would leave one copy narrower than the screen (a gap
  // in the loop), so repeat them until a copy is long enough.
  const perCopy = items.reduce((n, i) => n + i.text.length + 10, 0);
  const repeats = Math.max(1, Math.ceil(300 / perCopy));
  const row = Array.from({ length: repeats }, (_, r) =>
    items.map((item) => ({ ...item, key: `${item.id}-${r}`, repeat: r > 0 })),
  ).flat();
  // ~60px/s whatever the length, never faster than one loop per 20s.
  const duration = Math.max(20, Math.round(perCopy * repeats * 0.13));

  const group = (copy: boolean) => (
    <ul
      className={cn("flex shrink-0 items-center", copy && "ticker-copy")}
      aria-hidden={copy || undefined}
    >
      {row.map((item) => (
        <li
          key={item.key}
          className="flex items-center"
          aria-hidden={(!copy && item.repeat) || undefined}
        >
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            tabIndex={copy || item.repeat ? -1 : undefined}
            className="ticker-item flex items-baseline gap-2.5 px-6 py-3 text-sm whitespace-nowrap"
          >
            <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>
              <LocalTime date={item.postedAt} preset="month-day" />
            </span>
            <span>{item.text}</span>
          </a>
          <span
            aria-hidden
            className="h-1 w-1 shrink-0 rounded-full"
            style={{ background: "var(--accent)" }}
          />
        </li>
      ))}
    </ul>
  );

  return (
    <section
      aria-label="Latest announcements from the Spicy League Discord"
      className="ticker flex items-stretch border-y"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div
        className="flex shrink-0 items-center gap-2 border-r px-4 md:px-6"
        style={{ borderColor: "var(--border)" }}
      >
        <MegaphoneIcon className="size-4" style={{ color: "var(--accent-text)" }} aria-hidden />
        <SectionLabel className="hidden sm:inline-block">Announcements</SectionLabel>
      </div>
      <div className="ticker-viewport min-w-0 flex-1">
        <div
          className="ticker-track"
          style={{ "--ticker-duration": `${duration}s` } as CSSProperties}
        >
          {group(false)}
          {group(true)}
        </div>
      </div>
    </section>
  );
}
