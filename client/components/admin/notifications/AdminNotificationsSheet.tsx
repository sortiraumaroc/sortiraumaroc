/**
 * Panneau latéral des notifications Admin (cloche header).
 *
 * Utilise le store centralisé useAdminNotificationsStore.
 * Partage le même état que AdminNotificationsPanel/Page et AdminTopbar :
 * toute action se propage instantanément à tous les composants connectés.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check, Trash2 } from "lucide-react";

import { NotificationBody } from "@/components/NotificationBody";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAdminNotificationsStore } from "@/lib/useAdminNotificationsStore";
import type { AdminNotification } from "@/lib/adminApi";
import { formatLeJjMmAaAHeure } from "@shared/datetime";
import {
  getNotificationHref,
  getNotificationCategory,
  categoryBadgeClass,
  NOTIFICATION_CATEGORY_LABELS,
} from "@/lib/notificationHelpers";

// ---------------------------------------------------------------------------
// Component — plus de props : tout vient du store centralisé
// ---------------------------------------------------------------------------

export function AdminNotificationsSheet() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const store = useAdminNotificationsStore();

  const goToItem = (n: AdminNotification) => {
    const href = getNotificationHref(n);
    if (href) {
      void store.markRead(n.id);
      setOpen(false);
      navigate(href);
    }
  };

  const goToAll = () => {
    setOpen(false);
    navigate("/admin/notifications");
  };

  const notificationsLabel = store.unreadCount
    ? `Notifications (${store.unreadCount} non lues)`
    : "Notifications";

  // [FIX] Suppression du auto-markAllRead à l'ouverture du panneau.
  // Avant ce fix, ouvrir le panneau marquait immédiatement TOUTES les
  // notifications comme lues, empêchant l'admin de les voir comme
  // non-lues. L'admin doit maintenant utiliser le bouton "Tout marquer lu"
  // ou cliquer individuellement sur chaque notification.
  return (
    <Sheet open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      // [FIX] Recharger les items à l'ouverture pour afficher les dernières notifs
      if (isOpen) {
        void store.refresh();
      }
    }}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative"
          aria-label={notificationsLabel}
          title={notificationsLabel}
        >
          <Bell className="h-4 w-4" />
          {store.unreadCount > 0 ? (
            <span className="absolute -top-1 -end-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-extrabold flex items-center justify-center">
              {store.unreadCount > 99 ? "99+" : store.unreadCount}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>

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

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={goToAll}>
                  Voir tout
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!store.items.length || store.localUnreadCount === 0}
                  onClick={() => void store.markAllRead()}
                >
                  Tout marquer lu
                </Button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto pt-4 space-y-2">
            {store.loading && !store.items.length ? (
              <div className="text-sm text-slate-600">Chargement...</div>
            ) : !store.items.length ? (
              <div className="text-sm text-slate-600">Aucune notification.</div>
            ) : (
              <>
                {store.items.slice(0, 15).map((n) => {
                  const unread = !store.isRead(n);
                  const href = getNotificationHref(n);
                  const category = getNotificationCategory(n.type ?? "");
                  const categoryLabel = NOTIFICATION_CATEGORY_LABELS[category] ?? category;

                  return (
                    <div
                      key={n.id}
                      className={cn(
                        "rounded-lg border bg-white p-3",
                        unread ? "border-primary/30" : "border-slate-200"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {unread ? (
                              <span
                                className="h-2 w-2 rounded-full bg-primary shrink-0"
                                aria-hidden="true"
                              />
                            ) : null}
                            <Badge
                              className={cn(
                                "text-[10px] px-1.5 py-0 shrink-0",
                                categoryBadgeClass(category)
                              )}
                            >
                              {categoryLabel}
                            </Badge>
                            <div className="text-sm font-semibold text-slate-900 truncate">
                              {n.title || "Notification"}
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

                          {href ? (
                            <button
                              type="button"
                              className="mt-2 text-xs font-semibold text-primary hover:underline"
                              onClick={() => goToItem(n)}
                            >
                              Voir
                            </button>
                          ) : null}
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
                })}

                {store.items.length > 15 ? (
                  <div className="pt-2">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={goToAll}
                    >
                      Voir tout l'historique
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
