import * as React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { MenuProduct } from "@/lib/menu-data";
import { getBadgeMeta } from "@/lib/menu-badges";
import { formatDh } from "@/lib/currency";
import { ShoppingCart, ThumbsUp, MessageSquareText, X, HelpCircle } from "lucide-react";

type Props = {
  product: MenuProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddToCart: (note: string) => void;
  isInCart: boolean;
  isAddDisabled?: boolean;
};

export function ProductDetailModal({
  product,
  open,
  onOpenChange,
  onAddToCart,
  isInCart,
  isAddDisabled,
}: Props) {
  const [note, setNote] = React.useState("");

  // Reset note when product changes
  React.useEffect(() => {
    setNote("");
  }, [product?.id]);

  if (!product) return null;

  const handleAddToCart = () => {
    onAddToCart(note);
    setNote("");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        hideClose
        side="bottom"
        className="h-[100dvh] p-0 flex flex-col gap-0"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{product.title}</SheetTitle>
        </SheetHeader>

        <div className="relative w-full h-[350px] sm:h-[400px] shrink-0 bg-muted">
          <img
            src={product.imageSrc}
            alt={product.title}
            className="h-full w-full object-cover"
          />
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-sam-red hover:bg-sam-red/90 text-white shadow-lg transition-transform active:scale-95"
            onClick={() => onOpenChange(false)}
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-auto px-4 pb-4">
          {/* Title and Price */}
          <div className="sticky top-0 bg-background pt-4 pb-3 -mx-4 px-4 border-b border-border z-10">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-bold leading-tight text-foreground">
                {product.title}
              </h2>
              <div className="shrink-0 text-xl font-bold text-sam-red">
                {formatDh(product.priceDh)}
              </div>
            </div>
          </div>

          {/* Badges */}
          {(product.badges?.length ?? 0) > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {(product.badges ?? []).map((b) => {
                const meta = getBadgeMeta(b);
                return (
                  <Badge
                    key={b}
                    variant="secondary"
                    className={cn(
                      "h-7 rounded-full px-3 text-xs font-semibold",
                      meta?.className,
                    )}
                  >
                    {meta?.label}
                  </Badge>
                );
              })}
            </div>
          )}

          {/* Likes */}
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <ThumbsUp className="h-5 w-5 text-sam-success" />
            <span className="tabular-nums font-medium">
              {product.likes} {product.likes > 1 ? "personnes aiment" : "personne aime"} ce plat
            </span>
          </div>

          {/* Description */}
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-foreground mb-2">Description</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {product.description || "Aucune description disponible."}
            </p>
          </div>

          {/* Note/Comment Input */}
          <div className="mt-6">
            <label className="flex items-center gap-2 text-sm font-semibold text-foreground mb-2">
              <MessageSquareText className="h-4 w-4" />
              Commentaire
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      style={{ width: '18px', height: '18px' }}
                      aria-label="Information"
                    >
                      <HelpCircle className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[280px]">
                    <p className="text-xs">Ajoutez vos préférences ou modifications souhaitées</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex: sans oignon, sauce à part, bien cuit…"
              className="h-11 rounded-lg text-sm"
            />
          </div>

          {/* Spacer for floating button */}
          <div className="h-20" />
        </div>

        {/* Fixed bottom action button */}
        <div className="sticky bottom-0 bg-background border-t border-border p-4 shadow-lg">
          <Button
            onClick={handleAddToCart}
            disabled={isAddDisabled}
            className={cn(
              "h-14 w-full rounded-xl text-base font-bold",
              "shadow-md shadow-black/10",
              "active:scale-[0.98] transition-transform",
            )}
          >
            <ShoppingCart className="h-5 w-5" />
            <span className="ml-2">
              {isInCart ? "Ajouter à nouveau" : "Ajouter au panier"}
            </span>
            {isInCart && (
              <span className="ml-2 text-sm font-bold">+</span>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
