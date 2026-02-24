/**
 * Cloche de notifications User (header consumer).
 *
 * Utilise le store centralisé useUserNotificationsStore pour partager l'état
 * avec ProfileNotifications. Toute action (marquer lu, supprimer) se propage
 * instantanément à tous les composants connectés au store.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Bell, Check, Trash2 } from "lucide-react";

import { NotificationBody } from "@/components/NotificationBody";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useUserNotificationsStore } from "@/lib/useUserNotificationsStore";
import { formatLeJjMmAaAHeure } from "@shared/datetime";

export function UserNotificationsBell(props: { enabled: boolean; inverted?: boolean }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const store = useUserNotificationsStore(props.enabled);

  const goToAll = () => {
    setOpen(false);
    navigate("/profile?tab=notifications");
  };

  const goToItem = (n: { id: string; href?: string }) => {
    if (!n.href) return;
    store.markRead(n.id);
    setOpen(false);
    navigate(n.href);
  };

  if (!props.enabled) return null;

  return (
    <Sheet open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      // Auto-marquer tout comme lu à l'ouverture si non lu
      if (isOpen && store.unreadCount > 0) {
        store.markAllRead();
      }
    }}>
      <SheetTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative p-2 rounded-full border-2 transition-all duration-300",
            props.inverted
              ? "border-white/50 hover:border-white"
              : "border-primary/30 hover:border-primary/60"
          )}
          aria-label={store.unreadCount ? `Notifications (${store.unreadCount} non lues)` : "Notifications"}
        >
          <Bell className={cn("w-5 h-5 transition-colors", props.inverted ? "text-white" : "text-primary")} strokeWidth={1.5} />
          {store.unreadCount > 0 ? (
            <span className="absolute -top-1 -end-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-extrabold flex items-center justify-center">
              {store.unreadCount > 99 ? "99+" : store.unreadCount}
            </span>
          ) : null}
        </button>
      </SheetTrigger>

      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader className="sr-only">
          <SheetTitle>Notifications</SheetTitle>
        </SheetHeader>

        <div className="h-full flex flex-col">
          <div className="pb-3 border-b border-slate-200">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-lg font-extrabold text-slate-900">Notifications</div>
                <div className="text-sm text-slate-600">{store.unreadCount ? `${store.unreadCount} non lue(s)` : "Tout est à jour."}</div>
                {store.error ? <div className="mt-2 text-sm text-red-600">{store.error}</div> : null}
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={goToAll}>
                  Voir tout
                </Button>
                <Button variant="outline" size="sm" disabled={!store.items.length || store.unreadCount === 0} onClick={store.markAllRead}>
                  Tout marquer lu
                </Button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto pt-4 space-y-2">
            {!store.items.length ? <div className="text-sm text-slate-600">Aucune notification.</div> : null}

            {store.items.slice(0, 10).map((n) => {
              const unread = !store.isRead(n);
              return (
                <div key={n.id} className={cn("rounded-lg border bg-white p-3", unread ? "border-primary/30" : "border-slate-200")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {unread ? <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" /> : null}
                        <div className="text-sm font-semibold text-slate-900 truncate">{n.title}</div>
                      </div>

                      <NotificationBody body={n.body} className="mt-1 text-sm text-slate-700" dateClassName="text-[0.75rem]" />
                      <div className="mt-1 text-xs text-slate-500 tabular-nums">{formatLeJjMmAaAHeure(n.createdAtIso)}</div>

                      {n.href ? (
                        <button type="button" className="mt-2 text-xs font-semibold text-primary hover:underline" onClick={() => goToItem(n)}>
                          Voir
                        </button>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2">
                      {unread ? (
                        <Button variant="outline" size="sm" onClick={() => store.markRead(n.id)}>
                          Marquer lu
                        </Button>
                      ) : (
                        <div className="text-xs text-slate-500 flex items-center gap-1">
                          <Check className="h-3.5 w-3.5" />
                          Lu
                        </div>
                      )}
                      {n.id.startsWith("event:") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-slate-400 hover:text-red-500"
                          onClick={() => store.deleteNotification(n.id)}
                          title="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {store.items.length > 10 ? (
              <div className="pt-2">
                <Button variant="outline" className="w-full" onClick={goToAll}>
                  Voir tout l'historique
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
