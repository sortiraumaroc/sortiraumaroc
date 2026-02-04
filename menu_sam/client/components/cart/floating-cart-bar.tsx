import * as React from "react";
import { Button } from "@/components/ui/button";
import { formatDh } from "@/lib/currency";
import { cn, formatCountdown } from "@/lib/utils";
import { BookOpen, ShoppingBag, AlertCircle } from "lucide-react";

type Props = {
  partySize?: number;
  itemCount: number;
  totalDh: number;
  onOpenCart: () => void;
  onMenu?: () => void;
  className?: string;
  timeRemainingSeconds?: number | null;
};

export function FloatingCartBar({
  partySize = 1,
  itemCount,
  totalDh,
  onOpenCart,
  onMenu,
  className,
  timeRemainingSeconds,
}: Props) {
  const showMenu = Boolean(onMenu);
  const countdownText = formatCountdown(timeRemainingSeconds);
  const isExpiringSoon = timeRemainingSeconds !== null && timeRemainingSeconds <= 300; // 5 minutes
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-50",
        "px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3",
        "bg-gradient-to-t from-background via-background to-transparent",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-md sm:max-w-lg md:max-w-2xl lg:max-w-3xl">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-background p-2 shadow-lg shadow-black/10">
          {showMenu ? (
            <Button
              type="button"
              variant="secondary"
              onClick={onMenu}
              className="h-12 flex-1 rounded-2xl bg-sam-gray-50 px-4 text-foreground hover:bg-sam-gray-100"
            >
              <BookOpen className="h-4 w-4" />
              Menu
            </Button>
          ) : null}

          <Button
            type="button"
            onClick={onOpenCart}
            className={cn(
              "h-12 rounded-2xl bg-sam-red px-4 text-primary-foreground hover:bg-sam-red/90",
              showMenu ? "flex-1" : "w-full",
            )}
          >
            <span className="flex w-full items-center justify-center gap-2">
              <span className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4" />
                <span className="text-[13px] font-semibold">Panier</span>
              </span>

              <span className="text-primary-foreground/60">•</span>

              <span className="text-[11px] font-semibold tabular-nums">{partySize} pers</span>
              <span className="text-primary-foreground/60">•</span>
              <span className="text-[11px] font-semibold tabular-nums">
                {itemCount} {itemCount > 1 ? "plats" : "plat"}
              </span>
              <span className="text-primary-foreground/60">•</span>
              <span className="text-[11px] font-semibold tabular-nums">
                {itemCount > 0 ? formatDh(totalDh) : "0 DH"}
              </span>
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}
