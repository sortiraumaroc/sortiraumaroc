import * as React from "react";
import { Button } from "@/components/ui/button";
import { ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatProductItem } from "@/components/chat/use-chat-history";

type Props = {
  product: ChatProductItem;
  onAdd: (productId: string) => void;
  onImageClick?: (product: ChatProductItem) => void;
  disabled?: boolean;
};

export function ChatProductCard({ product, onAdd, onImageClick, disabled }: Props) {
  return (
    <div className="rounded-xl border border-border bg-background p-3 shadow-sm">
      <div className="flex gap-3">
        {/* Product Image - Square on Left */}
        {product.image && (
          <div className="w-20 shrink-0">
            <button
              type="button"
              onClick={() => onImageClick?.(product)}
              className={cn(
                "h-20 w-20 overflow-hidden rounded-xl bg-muted",
                "transition-opacity hover:opacity-80 active:scale-[0.98]",
                onImageClick ? "cursor-pointer" : ""
              )}
              aria-label={`Voir les détails de ${product.title}`}
              title="Voir les détails"
            >
              <img
                src={product.image}
                alt={product.title}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </button>
          </div>
        )}

        {/* Product Info - Content on Right */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-semibold leading-snug text-foreground">
              {product.title}
            </h4>
            <div className="shrink-0 text-sm font-bold text-sam-red">
              {product.price}
            </div>
          </div>

          {product.description && (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {product.description}
            </p>
          )}
        </div>
      </div>

      {/* Add to Cart Button - Full Width */}
      <Button
        type="button"
        onClick={() => onAdd(product.id)}
        disabled={disabled}
        className={cn(
          "mt-3 h-9 w-full rounded-full",
          "bg-sam-red text-primary-foreground hover:bg-sam-red/90",
          "shadow-sm shadow-black/5 active:scale-[0.99]",
        )}
        aria-label="Ajouter au panier"
      >
        <ShoppingCart className="h-4 w-4" />
        <span className="ml-2 text-sm font-semibold">Ajouter au panier</span>
      </Button>
    </div>
  );
}
