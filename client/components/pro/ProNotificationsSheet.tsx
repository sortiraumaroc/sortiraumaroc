import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
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

import {
  getProDashboardAlerts,
  listProNotifications,
  markAllProNotificationsRead,
  markProNotificationRead,
  deleteProNotification,
} from "@/lib/pro/api";
import {
  buildSystemNotificationsForToday,
  filterNotificationsForDay,
  filterNotificationsForEstablishment,
  getNotificationTargetTab,
  sortNotificationsByCreatedAtDesc,
} from "@/lib/pro/notifications";
import type {
  Establishment,
  ProInvoice,
  ProNotification,
  ProRole,
} from "@/lib/pro/types";
import { formatLeJjMmAaAHeure } from "@shared/datetime";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  establishment: Establishment | null;
  user: User;
  role: ProRole | null;
  unreadCount: number;
  onUnreadCountChange: (count: number) => void;
  onNavigateToTab: (tab: string) => void;
};

function categoryBadge(category: string) {
  const base = "bg-slate-100 text-slate-700 border-slate-200";
  if (category === "moderation")
    return "bg-amber-100 text-amber-700 border-amber-200";
  if (category === "billing") return "bg-red-100 text-red-700 border-red-200";
  if (category === "booking")
    return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (category === "messages")
    return "bg-sky-100 text-sky-700 border-sky-200";
  if (category === "visibility")
    return "bg-violet-100 text-violet-700 border-violet-200";
  return base;
}

function isLocalOnlyNotificationId(id: string) {
  return (
    id.startsWith("demo-") ||
    id.startsWith("demo-today-") ||
    id.startsWith("system-") ||
    id.startsWith("system:")
  );
}

export function ProNotificationsSheet({
  open,
  onOpenChange,
  establishment,
  user,
  role,
  unreadCount,
  onUnreadCountChange,
  onNavigateToTab,
}: Props) {
  const [items, setItems] = useState<ProNotification[]>([]);
  const [invoicesDue, setInvoicesDue] = useState<ProInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localReadIds, setLocalReadIds] = useState<Set<string>>(new Set());

  const load = async () => {
    if (!establishment?.id) return;

    setLoading(true);
    setError(null);

    try {
      const res = await getProDashboardAlerts(establishment.id);
      const invoices = (res.invoicesDue ?? []) as ProInvoice[];
      const notifications = (res.notifications ?? []) as ProNotification[];

      setInvoicesDue(invoices);

      const today = filterNotificationsForDay(notifications);
      const scoped = establishment.id
        ? filterNotificationsForEstablishment(today, establishment.id)
        : today;
      setItems(sortNotificationsByCreatedAtDesc(scoped));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setInvoicesDue([]);
      setItems([]);
    }

    setLoading(false);
  };

  // Load data and auto-mark as read when panel opens
  useEffect(() => {
    if (open && establishment?.id) {
      void load().then(() => {
        // Auto-mark all as read when viewing the notifications
        void markAllRead();
      });
    }
  }, [open, establishment?.id]);

  const systemItems = useMemo(() => {
    if (!establishment) return [];
    return buildSystemNotificationsForToday({
      userId: user.id,
      establishment,
      invoicesDue,
    });
  }, [establishment, invoicesDue, user.id]);

  const activeItems = useMemo(() => {
    return sortNotificationsByCreatedAtDesc([...systemItems, ...items]);
  }, [items, systemItems]);

  const isRead = (n: ProNotification) => {
    return !!n.read_at || localReadIds.has(n.id);
  };

  const localUnreadCount = useMemo(() => {
    return activeItems.filter((x) => !isRead(x)).length;
  }, [activeItems, localReadIds]);

  const markRead = async (id: string) => {
    if (isLocalOnlyNotificationId(id)) {
      setLocalReadIds((prev) => new Set([...prev, id]));
      return;
    }

    if (!establishment?.id) return;

    setLocalReadIds((prev) => new Set([...prev, id]));

    try {
      await markProNotificationRead({
        establishmentId: establishment.id,
        notificationId: id,
      });
    } catch {
      // Best effort
    }
  };

  const markAllRead = async () => {
    if (!establishment?.id) return;

    // Mark all locally first for instant feedback
    const allIds = activeItems.map((x) => x.id);
    setLocalReadIds((prev) => new Set([...prev, ...allIds]));
    onUnreadCountChange(0);

    try {
      await markAllProNotificationsRead({ establishmentId: establishment.id });
    } catch {
      // Best effort
    }
  };

  const goToItem = (n: ProNotification) => {
    const targetTab = getNotificationTargetTab(n);
    if (targetTab) {
      markRead(n.id);
      onNavigateToTab(targetTab);
    }
  };

  const goToAll = () => {
    onNavigateToTab("notifications");
  };

  const deleteNotif = async (id: string) => {
    // Local-only notifications just get filtered out locally
    if (isLocalOnlyNotificationId(id)) {
      setLocalReadIds((prev) => new Set([...prev, `deleted:${id}`]));
      return;
    }

    if (!establishment?.id) return;

    // Optimistically remove from UI
    setItems((prev) => prev.filter((n) => n.id !== id));

    try {
      await deleteProNotification({
        establishmentId: establishment.id,
        notificationId: id,
      });
    } catch {
      // Best effort - reload on failure
      void load();
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        disabled={!role}
        className="relative p-2 rounded-full border border-white/30 hover:bg-white/10 transition disabled:opacity-50"
        aria-label={
          unreadCount
            ? `Notifications (${unreadCount} non lues)`
            : "Notifications"
        }
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 ? (
          <span className="absolute -top-1 -end-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-extrabold flex items-center justify-center border-2 border-primary">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

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
                  {localUnreadCount
                    ? `${localUnreadCount} non lue(s)`
                    : "Tout est à jour."}
                </div>
                {error ? (
                  <div className="mt-2 text-sm text-red-600">{error}</div>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={goToAll}>
                  Voir tout
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!activeItems.length || localUnreadCount === 0}
                  onClick={markAllRead}
                >
                  Tout marquer lu
                </Button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto pt-4 space-y-2">
            {!role || !establishment ? (
              <div className="text-sm text-slate-600">
                Connectez-vous à un établissement pour voir les notifications.
              </div>
            ) : loading ? (
              <div className="text-sm text-slate-600">Chargement...</div>
            ) : !activeItems.length ? (
              <div className="text-sm text-slate-600">Aucune notification.</div>
            ) : (
              <>
                {activeItems.slice(0, 10).map((n) => {
                  const unread = !isRead(n);
                  const targetTab = getNotificationTargetTab(n);

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
                                className="h-2 w-2 rounded-full bg-primary"
                                aria-hidden="true"
                              />
                            ) : null}
                            <Badge
                              className={cn(
                                "text-[10px] px-1.5 py-0",
                                categoryBadge(n.category)
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

                          {targetTab ? (
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
                              onClick={() => markRead(n.id)}
                            >
                              Marquer lu
                            </Button>
                          ) : (
                            <div className="text-xs text-slate-500 flex items-center gap-1">
                              <Check className="h-3.5 w-3.5" />
                              Lu
                            </div>
                          )}
                          {!isLocalOnlyNotificationId(n.id) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-slate-400 hover:text-red-500"
                              onClick={() => deleteNotif(n.id)}
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

                {activeItems.length > 10 ? (
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
