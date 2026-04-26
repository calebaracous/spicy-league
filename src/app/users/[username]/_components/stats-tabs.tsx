"use client";

import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type Tab = { id: string; label: string; content: ReactNode; disabled?: boolean };

export function StatsTabs({ tabs, defaultTab }: { tabs: Tab[]; defaultTab?: string }) {
  const firstEnabled = tabs.find((t) => !t.disabled)?.id ?? tabs[0]?.id;
  const [active, setActive] = useState<string>(defaultTab ?? firstEnabled ?? "");
  const activeTab = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div>
      <div role="tablist" className="flex gap-1 border-b">
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              disabled={tab.disabled}
              onClick={() => setActive(tab.id)}
              className={cn(
                "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "border-foreground text-foreground"
                  : "text-muted-foreground hover:text-foreground border-transparent",
                tab.disabled && "hover:text-muted-foreground cursor-not-allowed opacity-50",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className="pt-4">
        {activeTab?.content}
      </div>
    </div>
  );
}
