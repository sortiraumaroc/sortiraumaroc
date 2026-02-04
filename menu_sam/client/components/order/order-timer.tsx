import * as React from "react";

import { toast } from "sonner";

import { useOrderCountdown } from "@/hooks/use-order-countdown";
import { cn } from "@/lib/utils";
import { Timer } from "lucide-react";

const EXTEND_PROMPT_THRESHOLD_MS = 30 * 1000;

let lastStartedToastForExpiresAtMs: number | null = null;
let autoExtendedForInitialExpiresAtMs: number | null = null;

export function OrderTimer({
  expiresAtMs,
  onExtend,
  variant = "floating",
  className,
}: {
  expiresAtMs: number | null;
  onExtend?: () => void;
  variant?: "floating" | "banner";
  className?: string;
}) {
  const countdown = useOrderCountdown(expiresAtMs);
  const prevExpiresRef = React.useRef<number | null>(null);
  const initialExpiresAtRef = React.useRef<number | null>(null);
  const autoExtendedRef = React.useRef(false);

  React.useEffect(() => {
    const prev = prevExpiresRef.current;
    prevExpiresRef.current = expiresAtMs;

    if (!expiresAtMs) {
      initialExpiresAtRef.current = null;
      autoExtendedRef.current = false;
      return;
    }

    if (!prev && expiresAtMs) {
      initialExpiresAtRef.current = expiresAtMs;
      autoExtendedRef.current = false;

      if (lastStartedToastForExpiresAtMs !== expiresAtMs) {
        lastStartedToastForExpiresAtMs = expiresAtMs;
        toast("15 min — chrono lancé", {
          duration: 1800,
          className: "border-primary/20",
        });
      }
    }
  }, [expiresAtMs]);

  React.useEffect(() => {
    if (!countdown) return;
    if (!expiresAtMs) return;
    if (!onExtend) return;
    if (countdown.isExpired) return;
    if (countdown.remainingMs > EXTEND_PROMPT_THRESHOLD_MS) return;
    if (autoExtendedRef.current) return;

    // Auto-extend only once, and only for the initial 15-minute window.
    // If the timer has already been extended, expiresAtMs will differ from the initial value.
    if (initialExpiresAtRef.current !== expiresAtMs) return;

    if (autoExtendedForInitialExpiresAtMs === expiresAtMs) return;
    autoExtendedForInitialExpiresAtMs = expiresAtMs;

    autoExtendedRef.current = true;
    onExtend();
    toast.success("+15 min automatique", { duration: 2000, className: "border-primary/20" });
  }, [countdown, expiresAtMs, onExtend]);

  if (!countdown) return null;

  if (variant === "banner") {
    const bannerStyles = countdown.isExpired
      ? "text-primary-foreground/80"
      : "text-primary-foreground";

    return (
      <div
        className={cn(
          "inline-flex items-center gap-2 whitespace-nowrap text-[13px] font-semibold tabular-nums",
          bannerStyles,
          className,
        )}
        aria-label="Temps restant"
      >
        <Timer className="h-4 w-4 shrink-0" />
        <span className="leading-none">{countdown.formatted}</span>
      </div>
    );
  }

  const expiredStyles = countdown.isExpired
    ? "border-destructive/30 bg-destructive/10 text-destructive"
    : "border-border bg-background/95 text-foreground";

  return (
    <div
      className={cn(
        "fixed right-3 z-[60]",
        "top-[calc(env(safe-area-inset-top)+8px)]",
        className,
      )}
    >
      <div
        className={cn(
          "flex min-w-[96px] items-center justify-center gap-2 whitespace-nowrap rounded-full border px-3 py-2",
          "shadow-lg shadow-black/10",
          "backdrop-blur supports-[backdrop-filter]:bg-background/80",
          expiredStyles,
        )}
        aria-label="Temps restant"
      >
        <Timer
          className={cn(
            "h-4 w-4 shrink-0",
            countdown.isExpired ? "text-destructive" : "text-primary",
          )}
        />
        <span className="text-sm font-semibold tabular-nums leading-none">
          {countdown.formatted}
        </span>
      </div>
    </div>
  );
}
