import * as React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MenuProduct } from "@/lib/menu-data";
import { formatDh } from "@/lib/currency";
import { ShoppingCart, Sparkles, X } from "lucide-react";
import { getMenuItemImageUrl } from "@/lib/image-urls";


type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drinks: MenuProduct[];
  desserts: MenuProduct[];
  onAddProduct: (product: MenuProduct) => void;
  onContinue: () => void;
};

export function UpsellRecommendationSheet({
  open,
  onOpenChange,
  drinks,
  desserts,
  onAddProduct,
  onContinue,
}: Props) {
  const [addedProducts, setAddedProducts] = React.useState<Set<string>>(new Set());

  // Reset when sheet closes
  React.useEffect(() => {
    if (!open) {
      setAddedProducts(new Set());
    }
  }, [open]);

  const handleAdd = (product: MenuProduct) => {
    onAddProduct(product);
    setAddedProducts((prev) => new Set(prev).add(product.id));
  };

  const isAdded = (productId: string) => addedProducts.has(productId);

  const hasRecommendations = drinks.length > 0 || desserts.length > 0;

  if (!hasRecommendations) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[85vh] p-0 flex flex-col gap-0 [&>button]:hidden"
      >
        <SheetHeader className="px-4 pt-6 pb-4 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-sam-yellow/20">
                <Sparkles className="h-5 w-5 text-sam-red" />
              </div>
              <div>
                <SheetTitle className="text-lg font-bold text-left">
                  Complétez votre commande
                </SheetTitle>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Nos recommandations pour vous
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full bg-sam-red hover:bg-sam-red/90 text-white shadow-lg transition-transform active:scale-95"
              onClick={() => onOpenChange(false)}
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-auto px-4 py-4">
          {/* Drinks Section */}
          {drinks.length > 0 && (
            <section className="mb-6">
              <h3 className="text-base font-semibold text-foreground mb-3">
                🥤 Boissons recommandées
              </h3>
              <div className="space-y-3">
                {drinks.map((drink) => (
                  <div
                    key={drink.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-background p-3"
                  >
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                      <img
                        src={getMenuItemImageUrl(drink.imageSrc)}
                        alt={drink.title}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-semibold text-foreground line-clamp-1">
                        {drink.title}
                      </h4>
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                        {drink.description}
                      </p>
                      <p className="text-sm font-bold text-sam-red mt-1">
                        {formatDh(drink.priceDh)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleAdd(drink)}
                      disabled={isAdded(drink.id)}
                      className={cn(
                        "h-9 w-9 shrink-0 rounded-full p-0",
                        isAdded(drink.id)
                          ? "bg-sam-success hover:bg-sam-success/90"
                          : "bg-sam-red hover:bg-sam-red/90",
                      )}
                      aria-label={isAdded(drink.id) ? "Ajouté au panier" : "Ajouter au panier"}
                    >
                      <ShoppingCart className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Desserts Section */}
          {desserts.length > 0 && (
            <section>
              <h3 className="text-base font-semibold text-foreground mb-3">
                🍰 Desserts recommandés
              </h3>
              <div className="space-y-3">
                {desserts.map((dessert) => (
                  <div
                    key={dessert.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-background p-3"
                  >
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                      <img
                        src={getMenuItemImageUrl(dessert.imageSrc)}
                        alt={dessert.title}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-semibold text-foreground line-clamp-1">
                        {dessert.title}
                      </h4>
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                        {dessert.description}
                      </p>
                      <p className="text-sm font-bold text-sam-red mt-1">
                        {formatDh(dessert.priceDh)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleAdd(dessert)}
                      disabled={isAdded(dessert.id)}
                      className={cn(
                        "h-9 w-9 shrink-0 rounded-full p-0",
                        isAdded(dessert.id)
                          ? "bg-sam-success hover:bg-sam-success/90"
                          : "bg-sam-red hover:bg-sam-red/90",
                      )}
                      aria-label={isAdded(dessert.id) ? "Ajouté au panier" : "Ajouter au panier"}
                    >
                      <ShoppingCart className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Spacer for button */}
          <div className="h-20" />
        </div>

        <div className="border-t border-border bg-background p-4">
          <Button
            onClick={onContinue}
            className="h-12 w-full rounded-xl text-base font-bold"
          >
            Continuer vers le paiement
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
