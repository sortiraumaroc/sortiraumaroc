import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShoppingCart, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatProductItem } from "@/components/chat/use-chat-history";

type Props = {
  product: ChatProductItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (productId: string) => void;
  disabled?: boolean;
};

export function ChatProductDetail({ product, open, onOpenChange, onAdd, disabled }: Props) {
  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "w-full max-w-lg mx-auto p-0",
          "rounded-3xl border-0",
          "flex flex-col h-[90vh] max-h-[90vh]",
          "bg-background",
          "data-[state=open]:slide-in-from-bottom-10",
        )}
      >
        {/* Close Button */}
        <div className="absolute top-4 right-4 z-10">
          <DialogClose asChild>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="h-9 w-9 rounded-full bg-white/90 hover:bg-white shadow-md"
              aria-label="Fermer"
              title="Fermer"
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogClose>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-auto">
          {/* Product Image */}
          <div className="w-full bg-muted">
            <img
              src={product.image}
              alt={product.title}
              className="w-full h-auto object-cover aspect-square"
            />
          </div>

          {/* Product Info */}
          <div className="px-4 pt-4 pb-6">
            {/* Title & Price */}
            <div className="mb-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <h1 className="text-xl font-bold leading-snug text-foreground flex-1">
                  {product.title}
                </h1>
                <div className="shrink-0 text-lg font-bold text-sam-red">
                  {product.price} Dhs
                </div>
              </div>
            </div>

            {/* Description */}
            {product.description && (
              <div className="mb-6">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {product.description}
                </p>
              </div>
            )}

            {/* Info Section */}
            <div className="rounded-2xl bg-sam-gray-50 p-4 mb-6">
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Prix
                  </p>
                  <p className="text-lg font-bold text-sam-red mt-1">
                    {product.price} Dhs
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Footer - Add to Cart Button */}
        <div className="sticky bottom-0 border-t border-border bg-background/95 backdrop-blur px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
          <Button
            type="button"
            onClick={() => {
              onAdd(product.id);
              onOpenChange(false);
            }}
            disabled={disabled}
            className={cn(
              "w-full h-11 rounded-xl",
              "bg-sam-red hover:bg-sam-red/90 text-white",
              "shadow-sm shadow-black/5 active:scale-[0.99]",
              "flex items-center justify-center gap-2",
              "font-semibold",
            )}
            aria-label="Ajouter au panier"
          >
            <ShoppingCart className="h-5 w-5" />
            <span>Ajouter au panier</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
