import { Heart, Hotel, Trash2, UtensilsCrossed } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { FavoriteItem } from "@/lib/userData";

export function ProfileFavorites({ favorites, onRemove }: { favorites: FavoriteItem[]; onRemove: (item: FavoriteItem) => void }) {
  if (!favorites.length) {
    return (
      <div className="rounded-lg border-2 border-slate-200 bg-white p-6 text-slate-700">
        <div className="flex items-center gap-2 font-bold text-foreground">
          <Heart className="w-5 h-5 text-primary" />
          Aucun favori
        </div>
        <div className="mt-2 text-sm text-slate-600">
          Ajoutez des restaurants ou hôtels en favori pour les retrouver rapidement.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {favorites.map((f) => {
        const Icon = f.kind === "hotel" ? Hotel : UtensilsCrossed;
        return (
          <div key={`${f.kind}:${f.id}`} className="rounded-lg border-2 border-slate-200 bg-white p-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Icon className="w-5 h-5 text-primary" />
                <div className="font-bold text-foreground truncate">{f.title}</div>
              </div>
              <div className="mt-1 text-xs text-slate-600">{f.kind === "hotel" ? "Hôtel" : "Restaurant"}</div>
            </div>
            <Button type="button" variant="outline" className="gap-2" onClick={() => onRemove(f)}>
              <Trash2 className="w-4 h-4" />
              Retirer
            </Button>
          </div>
        );
      })}
    </div>
  );
}
