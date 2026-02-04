import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Check, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  getAdminNotificationPreferences,
  setAdminNotificationPreferences,
  type AdminNotificationPreferences,
} from "@/lib/adminNotificationPreferences";
import {
  getAdminNotificationsUnreadCount,
  listAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
  type AdminNotification,
} from "@/lib/adminApi";
import { NotificationBody } from "@/components/NotificationBody";
import { cn } from "@/lib/utils";
import { formatLeJjMmAaAHeure } from "@shared/datetime";

function formatTimestampFr(value: string): string {
  return formatLeJjMmAaAHeure(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getNotificationHref(n: AdminNotification): string | null {
  const type = String(n.type ?? "").trim().toLowerCase();
  const data = asRecord(n.data) ?? {};

  const establishmentId = typeof data.establishmentId === "string" ? data.establishmentId : typeof data.establishment_id === "string" ? data.establishment_id : null;
  const reservationId = typeof data.reservationId === "string" ? data.reservationId : typeof data.reservation_id === "string" ? data.reservation_id : null;
  const orderId = typeof data.orderId === "string" ? data.orderId : typeof data.order_id === "string" ? data.order_id : null;

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

  if (type.includes("pack") || type.includes("deal") || type.includes("offer")) return "/admin/deals";

  if (type.includes("review") || type.includes("signal")) return "/admin/reviews";

  if (type.includes("support")) return "/admin/support";

  if (type.includes("message")) {
    if (establishmentId) return `/admin/establishments/${encodeURIComponent(establishmentId)}`;
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
    if (reservationId) return `/admin/reservations?search=${encodeURIComponent(reservationId)}`;
    if (establishmentId) return `/admin/reservations?establishment_id=${encodeURIComponent(establishmentId)}`;
    return "/admin/reservations";
  }

  if (establishmentId) return `/admin/establishments/${encodeURIComponent(establishmentId)}`;

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

export function AdminNotificationsPanel(props: {
  adminKey?: string;
  onUnreadChange?: (n: number) => void;
}) {
  const navigate = useNavigate();
  const [preferences, setPreferences] = useState<AdminNotificationPreferences>(() => getAdminNotificationPreferences());

  const [items, setItems] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshUnread = useCallback(async () => {
    try {
      const res = await getAdminNotificationsUnreadCount(props.adminKey);
      props.onUnreadChange?.(res.unread ?? 0);
    } catch {
      // ignore
    }
  }, [props.adminKey, props.onUnreadChange]);

  const refreshList = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await listAdminNotifications(props.adminKey, { limit: 120 });
      setItems(res.items ?? []);
      await refreshUnread();
    } catch (e) {
      setItems([]);
      setError(e instanceof Error ? e.message : "Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }, [props.adminKey, refreshUnread]);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  const setPreferenceKey = (key: keyof AdminNotificationPreferences, value: boolean) => {
    const next: AdminNotificationPreferences = { ...preferences, [key]: value };
    setPreferences(next);
    setAdminNotificationPreferences(next);
  };

  const markRead = async (id: string) => {
    setSaving(id);
    setError(null);

    try {
      await markAdminNotificationRead(props.adminKey, id);
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
      await refreshUnread();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de marquer comme lu");
    } finally {
      setSaving(null);
    }
  };

  const markAllRead = async () => {
    setSaving("all");
    setError(null);

    try {
      await markAllAdminNotificationsRead(props.adminKey);
      const nowIso = new Date().toISOString();
      setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: nowIso })));
      await refreshUnread();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de tout marquer comme lu");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Préférences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900">Pop-ups temps réel</div>
              <div className="text-xs text-slate-600">Affiche une notification à l’écran dès qu’un événement arrive.</div>
            </div>
            <Switch
              checked={preferences.popupsEnabled}
              onCheckedChange={(v) => setPreferenceKey("popupsEnabled", v)}
              aria-label="Activer les pop-ups temps réel"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900">Son</div>
              <div className="text-xs text-slate-600">Joue un petit son lors d’une nouvelle alerte.</div>
            </div>
            <Switch
              checked={preferences.soundEnabled}
              onCheckedChange={(v) => setPreferenceKey("soundEnabled", v)}
              aria-label="Activer le son des notifications"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-900">Historique</div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={loading || saving === "all"} onClick={() => void refreshList()}>
            {loading ? "Chargement…" : "Rafraîchir"}
          </Button>
          <Button variant="outline" size="sm" disabled={saving === "all" || !items.some((n) => !n.read_at)} onClick={() => void markAllRead()}>
            {saving === "all" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Mise à jour…
              </>
            ) : (
              "Tout marquer lu"
            )}
          </Button>
        </div>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement des notifications…
        </div>
      ) : null}

      {!loading ? (
        items.length ? (
          <div className="space-y-2">
            {items.map((n) => {
              const unread = !n.read_at;
              const href = getNotificationHref(n);
              const category = getNotificationCategory(n.type ?? "");

              return (
                <div key={n.id} className={cn("rounded-lg border bg-white p-3", unread ? "border-primary/30" : "border-slate-200")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {unread ? <span className="h-2 w-2 rounded-full bg-primary shrink-0" aria-hidden="true" /> : null}
                        <Badge className={cn("text-[10px] px-1.5 py-0 shrink-0", categoryBadge(category))}>
                          {category}
                        </Badge>
                        <div className="text-sm font-semibold text-slate-900 truncate">{n.title || "Notification"}</div>
                      </div>
                      <NotificationBody body={n.body} className="mt-1 text-sm text-slate-700" dateClassName="text-[0.75rem]" />
                      <div className="mt-1 text-xs text-slate-500 tabular-nums">
                        {formatTimestampFr(n.created_at)}
                      </div>
                      {href ? (
                        <button
                          type="button"
                          className="mt-2 text-xs font-semibold text-primary hover:underline"
                          onClick={() => {
                            void (async () => {
                              if (unread) await markRead(n.id);
                              navigate(href);
                            })();
                          }}
                        >
                          Voir
                        </button>
                      ) : null}
                    </div>

                    <div className="shrink-0 flex flex-col items-end gap-2">
                      {!unread ? (
                        <div className="text-xs text-slate-500 flex items-center gap-1">
                          <Check className="h-3.5 w-3.5" />
                          Lu
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          disabled={saving === n.id}
                          onClick={() => void markRead(n.id)}
                        >
                          {saving === n.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Marquer lu"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">Aucune notification.</div>
        )
      ) : null}
    </div>
  );
}
