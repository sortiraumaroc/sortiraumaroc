import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Bell, Check, Trash2 } from "lucide-react";

import { NotificationBody } from "@/components/NotificationBody";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { listMyConsumerReservations, mapConsumerReservationToBookingRecord } from "@/lib/consumerReservationsApi";
import {
  listMyConsumerNotifications,
  markAllMyConsumerNotificationsRead,
  markMyConsumerNotificationRead,
  deleteMyConsumerNotification,
  type ConsumerNotificationRow,
} from "@/lib/consumerNotificationsApi";
import { USER_DATA_CHANGED_EVENT, getPackPurchases, type BookingRecord } from "@/lib/userData";
import {
  buildUserNotifications,
  getUserNotificationReadIds,
  getUserUnreadCount,
  isUserNotificationRead,
  markAllUserNotificationsRead,
  markUserNotificationRead,
  type UserNotificationItem,
} from "@/lib/userNotifications";
import { formatLeJjMmAaAHeure } from "@shared/datetime";

export function UserNotificationsBell(props: { enabled: boolean; inverted?: boolean }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [consumerEvents, setConsumerEvents] = useState<ConsumerNotificationRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!props.enabled) return;

    let cancelled = false;

    const load = async () => {
      try {
        const [rows, events] = await Promise.all([listMyConsumerReservations(), listMyConsumerNotifications(200)]);
        if (cancelled) return;
        setLoadError(null);
        setBookings(rows.map(mapConsumerReservationToBookingRecord));
        setConsumerEvents(events);

        // Migration: if this device previously marked some event notifications as read locally,
        // sync that state to the server so it follows on other devices.
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
      } catch (e) {
        if (cancelled) return;

        const msg = e instanceof Error ? e.message : "Impossible de charger les notifications.";
        const friendly = msg.toLowerCase().includes("not authenticated") ? "Connectez-vous pour voir vos notifications." : msg;

        setLoadError(friendly);
        setBookings([]);
        setConsumerEvents([]);
      }
    };

    void load();

    const interval = window.setInterval(() => {
      void load();
    }, 30_000);

    const onData = () => setTick((v) => v + 1);
    window.addEventListener(USER_DATA_CHANGED_EVENT, onData);
    window.addEventListener("sam:user_notifications_changed", onData);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener(USER_DATA_CHANGED_EVENT, onData);
      window.removeEventListener("sam:user_notifications_changed", onData);
    };
  }, [props.enabled]);

  const items = useMemo(() => {
    tick;
    return buildUserNotifications({ bookings, packPurchases: getPackPurchases(), consumerEvents });
  }, [bookings, consumerEvents, tick]);

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
        // Best-effort: local fallback already marks it as read
      });
    }

    // Keep localStorage behavior for booking/pack notifications and as an optimistic fallback.
    markUserNotificationRead(trimmed);
    setTick((v) => v + 1);
  };

  const markAllRead = () => {
    const ids = items.map((x) => x.id);
    const eventIds = ids.filter((id) => id.startsWith("event:")).map((id) => id.slice("event:".length));

    if (eventIds.length) {
      void markAllMyConsumerNotificationsRead(eventIds).catch(() => {
        // Best-effort: local fallback already marks them as read
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

  const goToAll = () => {
    setOpen(false);
    navigate("/profile?tab=notifications");
  };

  const goToItem = (n: UserNotificationItem) => {
    if (!n.href) return;
    markRead(n.id);
    setOpen(false);
    navigate(n.href);
  };

  if (!props.enabled) return null;

  return (
    <Sheet open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (isOpen && unreadCount > 0) {
        markAllRead();
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
          aria-label={unreadCount ? `Notifications (${unreadCount} non lues)` : "Notifications"}
        >
          <Bell className={cn("w-5 h-5 transition-colors", props.inverted ? "text-white" : "text-primary")} strokeWidth={1.5} />
          {unreadCount > 0 ? (
            <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-extrabold flex items-center justify-center">
              {unreadCount > 99 ? "99+" : unreadCount}
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
                <div className="text-sm text-slate-600">{unreadCount ? `${unreadCount} non lue(s)` : "Tout est à jour."}</div>
                {loadError ? <div className="mt-2 text-sm text-red-600">{loadError}</div> : null}
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={goToAll}>
                  Voir tout
                </Button>
                <Button variant="outline" size="sm" disabled={!items.length || unreadCount === 0} onClick={markAllRead}>
                  Tout marquer lu
                </Button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto pt-4 space-y-2">
            {!items.length ? <div className="text-sm text-slate-600">Aucune notification.</div> : null}

            {items.slice(0, 10).map((n) => {
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

                      {n.href ? (
                        <button type="button" className="mt-2 text-xs font-semibold text-primary hover:underline" onClick={() => goToItem(n)}>
                          Voir
                        </button>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2">
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

            {items.length > 10 ? (
              <div className="pt-2">
                <Button variant="outline" className="w-full" onClick={goToAll}>
                  Voir tout l’historique
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
