import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { X, AlertCircle, UtensilsCrossed, Hand, CreditCard } from "lucide-react";

type NotificationType = "new_order" | "serveur" | "addition" | "chef" | "paiement";

type NotificationModalContent = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  tableNumber?: number;
  timestamp: Date;
};

type Props = {
  notification: NotificationModalContent | null;
  onDismiss: () => void;
  onAccept?: () => void | Promise<void>;
  onTerminate?: () => void | Promise<void>;
  isAccepting?: boolean;
  isTerminating?: boolean;
};

function getIcon(type: NotificationType) {
  switch (type) {
    case "new_order":
      return <UtensilsCrossed className="h-6 w-6" />;
    case "serveur":
      return <Hand className="h-6 w-6" />;
    case "addition":
      return <CreditCard className="h-6 w-6" />;
    case "chef":
    case "paiement":
      return <AlertCircle className="h-6 w-6" />;
    default:
      return <AlertCircle className="h-6 w-6" />;
  }
}

/** ✅ CSS ONLY: convert to professional light palette */
function getColors(type: NotificationType) {
  switch (type) {
    case "new_order":
      return "bg-white border-rose-200 text-rose-700";
    case "serveur":
      return "bg-white border-blue-200 text-blue-700";
    case "addition":
      return "bg-white border-amber-200 text-amber-800";
    case "chef":
      return "bg-white border-violet-200 text-violet-700";
    case "paiement":
      return "bg-white border-emerald-200 text-emerald-700";
    default:
      return "bg-white border-slate-200 text-slate-700";
  }
}

export function NotificationModal({
  notification,
  onDismiss,
  onAccept,
  onTerminate,
  isAccepting,
  isTerminating,
}: Props) {
  if (!notification) return null;

  const colors = getColors(notification.type);
  const isNewOrder = notification.type === "new_order";
  const isTableCall = notification.type === "serveur" || notification.type === "addition";
  const isLoading = isAccepting || isTerminating;

  const handleAction = async () => {
    if (isNewOrder && onAccept) {
      await onAccept();
    } else if (isTableCall && onTerminate) {
      await onTerminate();
    }
    onDismiss();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[2px]"
        onClick={onDismiss}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
        <div
          className={cn(
            "relative w-full max-w-md overflow-hidden",
            "rounded-2xl border p-6",
            "shadow-xl shadow-black/10",
            colors,
          )}
        >
          {/* Close button */}
          <div className="absolute right-4 top-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              className={cn(
                "h-9 w-9 rounded-full p-0",
                "text-slate-500 hover:text-slate-700",
                "hover:bg-slate-100",
                "focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-0",
              )}
              aria-label="Fermer"
              disabled={isLoading}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Content */}
          <div className="flex gap-4">
            <div
              className={cn(
                "shrink-0 rounded-xl border p-2.5",
                "border-current/20 bg-slate-50",
                "text-current",
                "max-h-10 flex items-center justify-center",
              )}
            >
              {getIcon(notification.type)}
            </div>


            <div className="min-w-0 flex-1 pr-6">
              <h2 className="text-base sm:text-lg font-semibold text-slate-900">
                {notification.title}
              </h2>

              {notification.tableNumber && (
                <p className="mt-1 text-sm text-slate-600">
                  Table <span className="font-medium text-slate-900">{notification.tableNumber}</span>
                </p>
              )}

              <p className="mt-2 text-sm leading-relaxed text-slate-700">
                {notification.message}
              </p>

              <div className="mt-2 text-xs text-slate-500">
                {notification.timestamp.toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </div>
            </div>
          </div>

          {/* Action button */}
          <Button
            type="button"
            onClick={() => void handleAction()}
            disabled={isLoading}
            className={cn(
              "mt-5 w-full h-11 rounded-xl font-semibold transition",
              "focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-0",
              "disabled:opacity-50",
              isNewOrder
                ? "bg-sam-red  text-white"
                : "bg-sam-red  text-white",
            )}
          >
            {isAccepting && "Acceptation..."}
            {isTerminating && "Traitement..."}
            {!isLoading && (isNewOrder ? "Accepter" : isTableCall ? "Terminer" : "J'ai compris")}
          </Button>
        </div>
      </div>
    </>
  );
}

export type { NotificationModalContent, NotificationType };
