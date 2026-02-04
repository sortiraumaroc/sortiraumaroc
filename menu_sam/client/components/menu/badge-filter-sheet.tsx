import * as React from "react";

import type { MenuBadge } from "@/lib/menu-data";
import { getBadgeMeta } from "@/lib/menu-badges";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

function toggleInArray<T>(arr: T[], item: T) {
  return arr.includes(item) ? arr.filter((v) => v !== item) : [...arr, item];
}

export function BadgeFilterSheet({
  allBadges,
  selectedBadges,
  onChange,
  className,
}: {
  allBadges: MenuBadge[];
  selectedBadges: MenuBadge[];
  onChange: (next: MenuBadge[]) => void;
  className?: string;
}) {
  const count = selectedBadges.length;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          className={cn(
            "h-10 rounded-full px-3 text-sm font-semibold",
            "whitespace-nowrap",
            className,
          )}
        >
          Filtres{count > 0 ? ` (${count})` : ""}
        </Button>
      </SheetTrigger>

      <SheetContent
        side="bottom"
        className="rounded-t-2xl px-4 pb-6 pt-5 sm:px-6"
      >
        <SheetHeader className="text-left">
          <SheetTitle>Filtres</SheetTitle>
          <SheetDescription>
            Choisissez un ou plusieurs labels pour affiner le menu.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant={selectedBadges.length === 0 ? "default" : "secondary"}
            onClick={() => onChange([])}
            className={cn(
              "h-10 rounded-full px-4 text-sm font-semibold whitespace-nowrap",
              selectedBadges.length === 0 && "bg-primary text-primary-foreground",
            )}
          >
            Tout
          </Button>

          {allBadges.map((badge) => {
            const meta = getBadgeMeta(badge);
            const active = selectedBadges.includes(badge);

            return (
              <button
                key={badge}
                type="button"
                onClick={() => onChange(toggleInArray(selectedBadges, badge))}
                className={cn(
                  "h-10 rounded-full border px-4 text-sm font-semibold whitespace-nowrap",
                  "transition-colors active:scale-[0.99]",
                  active
                    ? cn(meta.className, "border-transparent hover:opacity-90")
                    : "border-border bg-background hover:bg-secondary",
                )}
              >
                {meta.label}
              </button>
            );
          })}
        </div>

        {selectedBadges.length > 0 && (
          <div className="mt-5">
            <Button
              type="button"
              variant="secondary"
              className="h-11 w-full rounded-2xl"
              onClick={() => onChange([])}
            >
              Réinitialiser les filtres
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
