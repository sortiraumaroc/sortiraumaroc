/**
 * CeNotificationsBell — Cloche de notifications pour l'espace CE.
 *
 * Utilise le store centralisé useCeNotificationsStore.
 * Affiche un panneau latéral (Sheet) avec les dernières notifications.
 */

import { useMemo, useState } from "react";
import { Bell, Check, Trash2 } from "lucide-react";

import { NotificationBody } from "@/components/NotificationBody";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useCeNotificationsStore } from "@/lib/useCeNotificationsStore";
import { formatLeJjMmAaAHeure } from "@shared/datetime";

type Props = {
  companyId: string | null;
};

function categoryBadge(category: string) {
  const base = "bg-slate-100 text-slate-700 border-slate-200";
  if (category === "employee") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (category === "scan") return "bg-sky-100 text-sky-700 border-sky-200";
  if (category === "billing") return "bg-red-100 text-red-700 border-red-200";
  if (category === "contract") return "bg-amber-100 text-amber-700 border-amber-200";
  if (category === "advantage") return "bg-violet-100 text-violet-700 border-violet-200";
  return base;
}

export function CeNotificationsBell({ companyId }: Props) {
  const [open, setOpen] = useState(false);
  const store = useCeNotificationsStore(companyId);

  const activeItems = useMemo(() => {
    return [...store.items].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [store.items]);

  // [FIX] Suppression du auto-markAllRead à l'ouverture.
  // Le gestionnaire CE doit voir les notifications non-lues d'abord.
  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    // [FIX] Rafraîchir les items à l'ouverture au lieu de tout marquer lu
    if (isOpen) {
      void store.refresh();
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpen(true)}
        className="relative p-2 rounded-full hover:bg-muted transition"
        aria-label={
          store.unreadCount
            ? `Notifications (${store.unreadCount} non lues)`
            : "Notifications"
        }
        title="Notifications"
      >
        <Bell className="h-5 w-5 text-muted-foreground" />
        {store.unreadCount > 0 ? (
          <span className="absolute -top-1 -end-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-extrabold flex items-center justify-center border-2 border-white">
            {store.unreadCount > 99 ? "99+" : store.unreadCount}
          </span>
        ) : null}
      </button>

      <Sheet open={open} onOpenChange={handleOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader className="sr-only">
            <SheetTitle>Notifications</SheetTitle>
          </SheetHeader>

          <div className="h-full flex flex-col">
            <div className="pb-3 border-b border-slate-200">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-lg font-extrabold text-slate-900">
                    Notifications
                  </div>
                  <div className="text-sm text-slate-600">
                    {store.localUnreadCount
                      ? `${store.localUnreadCount} non lue(s)`
                      : "Tout est à jour."}
                  </div>
                  {store.error ? (
                    <div className="mt-2 text-sm text-red-600">{store.error}</div>
                  ) : null}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={!activeItems.length || store.localUnreadCount === 0}
                  onClick={() => void store.markAllRead()}
                >
                  Tout marquer lu
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-auto pt-4 space-y-2">
              {store.loading && !activeItems.length ? (
                <div className="text-sm text-slate-600">Chargement...</div>
              ) : !activeItems.length ? (
                <div className="text-sm text-slate-600">Aucune notification.</div>
              ) : (
                activeItems.slice(0, 20).map((n) => {
                  const unread = !store.isRead(n);

                  return (
                    <div
                      key={n.id}
                      className={cn(
                        "rounded-lg border bg-white p-3",
                        unread ? "border-primary/30" : "border-slate-200",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {unread ? (
                              <span
                                className="h-2 w-2 rounded-full bg-primary"
                                aria-hidden="true"
                              />
                            ) : null}
                            <Badge
                              className={cn(
                                "text-[10px] px-1.5 py-0",
                                categoryBadge(n.category),
                              )}
                            >
                              {n.category}
                            </Badge>
                            <div className="text-sm font-semibold text-slate-900 truncate">
                              {n.title}
                            </div>
                          </div>

                          <NotificationBody
                            body={n.body}
                            className="mt-1 text-sm text-slate-700"
                            dateClassName="text-[0.75rem]"
                          />
                          <div className="mt-1 text-xs text-slate-500 tabular-nums">
                            {formatLeJjMmAaAHeure(n.created_at)}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {unread ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void store.markRead(n.id)}
                            >
                              Marquer lu
                            </Button>
                          ) : (
                            <div className="text-xs text-slate-500 flex items-center gap-1">
                              <Check className="h-3.5 w-3.5" />
                              Lu
                            </div>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-slate-400 hover:text-red-500"
                            onClick={() => void store.deleteNotification(n.id)}
                            title="Supprimer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
