import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Check, Trash2 } from "lucide-react";

import {
  listMyConsumerNotifications,
  markAllMyConsumerNotificationsRead,
  markMyConsumerNotificationRead,
  deleteMyConsumerNotification,
  type ConsumerNotificationRow,
} from "@/lib/consumerNotificationsApi";
import type { BookingRecord, PackPurchase } from "@/lib/userData";
import { NotificationBody } from "@/components/NotificationBody";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatLeJjMmAaAHeure } from "@shared/datetime";
import {
  buildUserNotifications,
  getUserNotificationReadIds,
  getUserUnreadCount,
  isUserNotificationRead,
  markAllUserNotificationsRead,
  markUserNotificationRead,
} from "@/lib/userNotifications";

export function ProfileNotifications(props: { bookings: BookingRecord[]; packPurchases: PackPurchase[] }) {
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);
  const [consumerEvents, setConsumerEvents] = useState<ConsumerNotificationRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const events = await listMyConsumerNotifications(200);
        if (cancelled) return;
        setConsumerEvents(events);

        // Migration: sync local read markers for event notifications to server-side read_at.
        try {
          const legacyReadIds = getUserNotificationReadIds();
          const idsToSync = events
            .filter((ev) => legacyReadIds.has(`event:${ev.id}`) && !ev.read_at)
            .map((ev) => ev.id)
            .slice(0, 200);

          if (idsToSync.length) {
            void markAllMyConsumerNotificationsRead(idsToSync);
          }
        } catch {
          // ignore
        }
      } catch {
        if (cancelled) return;
        setConsumerEvents([]);
      }
    };

    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const items = useMemo(
    () => buildUserNotifications({ bookings: props.bookings, packPurchases: props.packPurchases, consumerEvents }),
    [consumerEvents, props.bookings, props.packPurchases],
  );
  const readIds = useMemo(() => {
    tick;
    return getUserNotificationReadIds();
  }, [tick]);

  const unreadCount = useMemo(() => getUserUnreadCount(items), [items, readIds]);

  const markRead = (id: string) => {
    const trimmed = String(id ?? "").trim();
    if (!trimmed) return;

    if (trimmed.startsWith("event:")) {
      const eventId = trimmed.slice("event:".length);
      void markMyConsumerNotificationRead(eventId).catch(() => {
        // ignore
      });
    }

    markUserNotificationRead(trimmed);
    setTick((v) => v + 1);
  };

  const markAllRead = () => {
    const ids = items.map((x) => x.id);
    const eventIds = ids.filter((id) => id.startsWith("event:")).map((id) => id.slice("event:".length));

    if (eventIds.length) {
      void markAllMyConsumerNotificationsRead(eventIds).catch(() => {
        // ignore
      });
    }

    markAllUserNotificationsRead(ids);
    setTick((v) => v + 1);
  };

  const deleteNotification = (id: string) => {
    const trimmed = String(id ?? "").trim();
    if (!trimmed) return;

    if (trimmed.startsWith("event:")) {
      const eventId = trimmed.slice("event:".length);
      void deleteMyConsumerNotification(eventId).catch(() => {
        // Best-effort
      });
    }

    // Update local state to remove from list
    setConsumerEvents((prev) => prev.filter((ev) => `event:${ev.id}` !== trimmed));
    setTick((v) => v + 1);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-extrabold text-slate-900">Centre de notifications</div>
          <div className="text-xs text-slate-600">{unreadCount ? `${unreadCount} non lue(s)` : "Tout est à jour."}</div>
        </div>
        <Button variant="outline" size="sm" disabled={!items.length || unreadCount === 0} onClick={markAllRead}>
          Tout marquer lu
        </Button>
      </div>

      {!items.length ? <div className="text-sm text-slate-600">Aucune notification.</div> : null}

      {items.length ? (
        <div className="space-y-2">
          {items.map((n) => {
            const unread = !isUserNotificationRead(n, readIds);
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
                          markRead(n.id);
                          navigate(n.href!);
                        }}
                      >
                        Voir
                      </Button>
                    ) : null}

                    {unread ? (
                      <Button variant="outline" size="sm" onClick={() => markRead(n.id)}>
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
                        onClick={() => deleteNotification(n.id)}
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

      <div className="text-xs text-slate-500">
        Astuce : les notifications liées aux événements (paiements, messages, liste d’attente…) sont maintenant synchronisées côté serveur, donc l’état “lu/non lu” suit sur plusieurs appareils.
      </div>
    </div>
  );
}
