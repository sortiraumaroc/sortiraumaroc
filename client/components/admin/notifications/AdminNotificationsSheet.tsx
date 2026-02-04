import { useCallback, useEffect, useMemo, useState } from "react";
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

import {
  getAdminNotificationsUnreadCount,
  listAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
  deleteAdminNotification,
  type AdminNotification,
} from "@/lib/adminApi";
import { formatLeJjMmAaAHeure } from "@shared/datetime";

type Props = {
  adminKey?: string;
  unreadCount: number;
  onUnreadCountChange: (count: number) => void;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getNotificationHref(n: AdminNotification): string | null {
  const type = String(n.type ?? "").trim().toLowerCase();
  const data = asRecord(n.data) ?? {};

  const establishmentId =
    typeof data.establishmentId === "string"
      ? data.establishmentId
      : typeof data.establishment_id === "string"
        ? data.establishment_id
        : null;
  const reservationId =
    typeof data.reservationId === "string"
      ? data.reservationId
      : typeof data.reservation_id === "string"
        ? data.reservation_id
        : null;

  if (type.includes("finance_discrepancy")) return "/admin/finance/discrepancies";
  if (type.includes("payout")) return "/admin/finance/payouts";

  // Visibility orders - check multiple patterns
  if (
    type.includes("visibility_order") ||
    type.includes("visibility-order") ||
    type.includes("visibility order") ||
    (type.includes("visibility") && (type.includes("order") || type.includes("created") || type.includes("paid")))
  ) {
    return "/admin/visibility?tab=orders";
  }

  if (type.includes("profile_update")) return "/admin/moderation";
  if (type.includes("payment")) return "/admin/payments";
  if (type.includes("pack") || type.includes("deal") || type.includes("offer"))
    return "/admin/deals";
  if (type.includes("review") || type.includes("signal")) return "/admin/reviews";
  if (type.includes("support")) return "/admin/support";
  if (type.includes("message")) {
    if (establishmentId)
      return `/admin/establishments/${encodeURIComponent(establishmentId)}`;
    return "/admin/support";
  }
  if (
    type.includes("reservation") ||
    type.includes("booking") ||
    type.includes("waitlist") ||
    type.includes("cancellation") ||
    type.includes("cancel") ||
    type.includes("change") ||
    type.includes("noshow")
  ) {
    if (reservationId && establishmentId) {
      return `/admin/reservations?establishment_id=${encodeURIComponent(establishmentId)}&search=${encodeURIComponent(reservationId)}`;
    }
    if (reservationId)
      return `/admin/reservations?search=${encodeURIComponent(reservationId)}`;
    if (establishmentId)
      return `/admin/reservations?establishment_id=${encodeURIComponent(establishmentId)}`;
    return "/admin/reservations";
  }
  if (establishmentId)
    return `/admin/establishments/${encodeURIComponent(establishmentId)}`;

  return null;
}

function getNotificationCategory(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("reservation") || t.includes("booking") || t.includes("waitlist"))
    return "booking";
  if (t.includes("payment") || t.includes("payout") || t.includes("finance"))
    return "finance";
  if (t.includes("visibility")) return "visibility";
  if (t.includes("review") || t.includes("signal")) return "review";
  if (t.includes("moderation") || t.includes("profile_update")) return "moderation";
  if (t.includes("message") || t.includes("support")) return "support";
  return "system";
}

function categoryBadge(category: string) {
  const base = "bg-slate-100 text-slate-700 border-slate-200";
  if (category === "moderation")
    return "bg-amber-100 text-amber-700 border-amber-200";
  if (category === "finance") return "bg-red-100 text-red-700 border-red-200";
  if (category === "booking")
    return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (category === "support") return "bg-sky-100 text-sky-700 border-sky-200";
  if (category === "visibility")
    return "bg-violet-100 text-violet-700 border-violet-200";
  if (category === "review")
    return "bg-orange-100 text-orange-700 border-orange-200";
  return base;
}

export function AdminNotificationsSheet({
  adminKey,
  unreadCount,
  onUnreadCountChange,
}: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localReadIds, setLocalReadIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await listAdminNotifications(adminKey, { limit: 50 });
      setItems(res.items ?? []);
    } catch (e) {
      setItems([]);
      setError(e instanceof Error ? e.message : "Erreur");
    }

    setLoading(false);
  }, [adminKey]);

  const refreshUnread = useCallback(async () => {
    try {
      const res = await getAdminNotificationsUnreadCount(adminKey);
      onUnreadCountChange(res.unread ?? 0);
    } catch {
      // ignore
    }
  }, [adminKey, onUnreadCountChange]);

  // Load data and auto-mark as read when panel opens
  useEffect(() => {
    if (open) {
      void load().then(() => {
        void markAllRead();
      });
    }
  }, [open]);

  const isRead = (n: AdminNotification) => {
    return !!n.read_at || localReadIds.has(n.id);
  };

  const localUnreadCount = useMemo(() => {
    return items.filter((x) => !isRead(x)).length;
  }, [items, localReadIds]);

  const markRead = async (id: string) => {
    setLocalReadIds((prev) => new Set([...prev, id]));

    try {
      await markAdminNotificationRead(adminKey, id);
      await refreshUnread();
    } catch {
      // Best effort
    }
  };

  const markAllRead = async () => {
    // Mark all locally first for instant feedback
    const allIds = items.map((x) => x.id);
    setLocalReadIds((prev) => new Set([...prev, ...allIds]));
    onUnreadCountChange(0);

    try {
      await markAllAdminNotificationsRead(adminKey);
    } catch {
      // Best effort
    }
  };

  const goToItem = (n: AdminNotification) => {
    const href = getNotificationHref(n);
    if (href) {
      markRead(n.id);
      setOpen(false);
      navigate(href);
    }
  };

  const goToAll = () => {
    setOpen(false);
    navigate("/admin/notifications");
  };

  const deleteNotif = async (id: string) => {
    // Optimistically remove from UI
    setItems((prev) => prev.filter((n) => n.id !== id));

    try {
      await deleteAdminNotification(adminKey, id);
      await refreshUnread();
    } catch {
      // Best effort - reload on failure
      void load();
    }
  };

  const notificationsLabel = unreadCount
    ? `Notifications (${unreadCount} non lues)`
    : "Notifications";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative"
          aria-label={notificationsLabel}
          title={notificationsLabel}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 ? (
            <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-extrabold flex items-center justify-center">
              {unreadCount > 99 ? "99+" : unreadCount}
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
                  disabled={!items.length || localUnreadCount === 0}
                  onClick={markAllRead}
                >
                  Tout marquer lu
                </Button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto pt-4 space-y-2">
            {loading ? (
              <div className="text-sm text-slate-600">Chargement...</div>
            ) : !items.length ? (
              <div className="text-sm text-slate-600">Aucune notification.</div>
            ) : (
              <>
                {items.slice(0, 15).map((n) => {
                  const unread = !isRead(n);
                  const href = getNotificationHref(n);
                  const category = getNotificationCategory(n.type ?? "");

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
                                categoryBadge(category)
                              )}
                            >
                              {category}
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
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-slate-400 hover:text-red-500"
                            onClick={() => deleteNotif(n.id)}
                            title="Supprimer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {items.length > 15 ? (
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
