import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { Pause, Play, Trash2 } from "lucide-react";

type Item = {
  id: string | number;
  title: string;
  description: string | null;
  base_price: number | null;
  currency: string;
  is_active: boolean;
  disponibleProduct?: "oui" | "non";
  image_src?: string | null;
};

type Props = {
  item: Item;
  onToggleActive: () => void;
  onOpenEdit: () => void;
  onRequestDelete: () => void;
};

export function MenuItemCard({ item, onToggleActive, onOpenEdit, onRequestDelete }: Props) {
  const image = item.image_src ?? null;
  const preview = image && image.trim() ? image.trim() : "/placeholder.svg";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenEdit}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenEdit();
        }
      }}
      className={cn(
        "group w-full rounded-2xl border border-black/10 bg-white/20 p-3 text-left",
        "transition hover:bg-black/5",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20",
        item.disponibleProduct === "non" ? "opacity-75" : null,
      )}
      aria-label={`Modifier ${item.title}`}
    >
      <div className="flex items-start gap-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-black/10 bg-black/5">
          <img src={preview} alt={item.title} className="h-full w-full object-cover" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-black">{item.title}</div>
              <div className="mt-0.5 text-xs text-black/60">{item.base_price === null ? "—" : `${item.base_price} Dhs`}</div>
            </div>

            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleActive();
                }}
                className={cn(
                  "h-9 w-9 rounded-xl p-0",
                  "hover:bg-black/10",
                  item.disponibleProduct === "oui" ? "text-black" : "text-black/70",
                )}
                aria-label={item.disponibleProduct === "oui" ? "Désactiver" : "Activer"}
                title={item.disponibleProduct === "oui" ? "Désactiver" : "Activer"}
              >
                {item.disponibleProduct === "oui" ? (
                  <Pause className="h-4 w-4 text-sam-red" />
                ) : (
                  <Play className="h-4 w-4 text-sam-success" />
                )}
              </Button>

              <Button
                type="button"
                variant="ghost"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRequestDelete();
                }}
                className={cn(
                  "h-9 w-9 rounded-xl p-0",
                  "text-black/70 hover:bg-sam-red/15 hover:text-black",
                )}
                aria-label={`Supprimer ${item.title}`}
                title="Supprimer"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {item.description ? (
            <div className="mt-2 line-clamp-2 text-xs text-black/60">{item.description}</div>
          ) : (
            <div className="mt-2 text-xs text-black/40">Aucune description</div>
          )}
        </div>
      </div>
    </div>
  );
}
