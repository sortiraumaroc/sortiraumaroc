import * as React from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { MenuCategory } from "@/lib/menu-data";

type Props = {
  categories: MenuCategory[];
  selectedId: string;
  onSelect: (id: string) => void;
  leading?: ReactNode;
  className?: string;
};

export function CategoryNav({
  categories,
  selectedId,
  onSelect,
  leading,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "sticky top-11 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        className,
      )}
    >
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          {leading ? <div className="shrink-0">{leading}</div> : null}
          <div className="flex flex-1 gap-2 overflow-x-auto no-scrollbar">
            {categories.map((c) => {
            const active = c.id === selectedId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.id)}
                className={cn(
                  "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-foreground hover:bg-muted",
                )}
              >
                {c.label}
              </button>
            );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
