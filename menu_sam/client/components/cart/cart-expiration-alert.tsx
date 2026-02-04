import * as React from "react";
import { AlertCircle } from "lucide-react";
import { formatCountdown } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Props = {
  timeRemainingSeconds: number | null;
  itemCount: number;
};

export function CartExpirationAlert({ timeRemainingSeconds, itemCount }: Props) {
  const countdownText = formatCountdown(timeRemainingSeconds);
  const isExpiringSoon = timeRemainingSeconds !== null && timeRemainingSeconds <= 300; // 5 minutes

  // Only show if there's a cart with items and time is set
  if (timeRemainingSeconds === null || itemCount === 0) {
    return null;
  }

  return (
    <div className="px-4 pt-4">
      <div
        className={cn(
          "flex items-start gap-2 rounded-2xl px-4 py-3",
          isExpiringSoon
            ? "border border-sam-red/50 bg-sam-red/10 text-sam-red"
            : "border border-amber-500/50 bg-amber-500/10 text-amber-700"
        )}
      >
        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div className="flex-1">
          <div className="text-sm font-semibold">
            Votre panier expire dans {countdownText}
          </div>
          <div className="text-xs opacity-80">
            Finalisez votre commande avant que le panier ne soit réinitialisé
          </div>
        </div>
      </div>
    </div>
  );
}
