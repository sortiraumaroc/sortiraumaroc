/**
 * Page complète des notifications User (onglet dans le profil).
 *
 * Utilise le store centralisé useUserNotificationsStore.
 * Partage le même état que UserNotificationsBell (cloche header) :
 * marquer lu ici met à jour la cloche instantanément et vice-versa.
 */

import { useNavigate } from "react-router-dom";

import { Check, Trash2 } from "lucide-react";

import { NotificationBody } from "@/components/NotificationBody";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatLeJjMmAaAHeure } from "@shared/datetime";
import { useUserNotificationsStore } from "@/lib/useUserNotificationsStore";

export function ProfileNotifications() {
  const navigate = useNavigate();
  const store = useUserNotificationsStore(true);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-extrabold text-slate-900">Centre de notifications</div>
          <div className="text-xs text-slate-600">{store.unreadCount ? `${store.unreadCount} non lue(s)` : "Tout est à jour."}</div>
        </div>
        <Button variant="outline" size="sm" disabled={!store.items.length || store.unreadCount === 0} onClick={store.markAllRead}>
          Tout marquer lu
        </Button>
      </div>

      {store.error ? <div className="text-sm text-red-600">{store.error}</div> : null}

      {!store.items.length ? <div className="text-sm text-slate-600">Aucune notification.</div> : null}

      {store.items.length ? (
        <div className="space-y-2">
          {store.items.map((n) => {
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
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    {n.href ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          store.markRead(n.id);
                          navigate(n.href!);
                        }}
                      >
                        Voir
                      </Button>
                    ) : null}

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
        </div>
      ) : null}
    </div>
  );
}
