/**
 * Panneau latéral des notifications Pro (cloche header).
 *
 * Utilise le store centralisé useProNotificationsStore.
 * Partage le même état que ProNotificationsTab (onglet dashboard).
 */

import { useMemo, useState } from "react";
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
  buildSystemNotificationsForToday,
  getNotificationTargetTab,
  sortNotificationsByCreatedAtDesc,
} from "@/lib/pro/notifications";
import { useProNotificationsStore } from "@/lib/pro/useProNotificationsStore";
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
  invoicesDue?: ProInvoice[];
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
  invoicesDue,
  onNavigateToTab,
}: Props) {
  const store = useProNotificationsStore(establishment?.id ?? null);
  const [localSystemReadIds, setLocalSystemReadIds] = useState<Set<string>>(new Set());

  // Notifications système (factures dues, etc.) générées côté client
  const systemItems = useMemo(() => {
    if (!establishment) return [];
    return buildSystemNotificationsForToday({
      userId: user.id,
      establishment,
      invoicesDue: invoicesDue ?? [],
    });
  }, [establishment, invoicesDue, user.id]);

  // Combiner les items du store (serveur) avec les items système (client)
  const activeItems = useMemo(() => {
    return sortNotificationsByCreatedAtDesc([
      ...systemItems,
      ...(store.items as unknown as ProNotification[]),
    ]);
  }, [store.items, systemItems]);

  const isRead = (n: ProNotification) => {
    if (isLocalOnlyNotificationId(n.id)) {
      return localSystemReadIds.has(n.id);
    }
    return store.isRead(n as any);
  };

  const localUnreadCount = useMemo(() => {
    return activeItems.filter((x) => !isRead(x)).length;
  }, [activeItems, store.localUnreadCount, localSystemReadIds]);

  const markRead = (id: string) => {
    if (isLocalOnlyNotificationId(id)) {
      setLocalSystemReadIds((prev) => new Set([...prev, id]));
      return;
    }
    void store.markRead(id);
  };

  const markAllRead = () => {
    // Marquer les notifs système comme lues localement
    const systemIds = systemItems.map((x) => x.id);
    setLocalSystemReadIds((prev) => new Set([...prev, ...systemIds]));
    // Marquer les notifs serveur via le store
    void store.markAllRead();
  };

  const goToItem = (n: ProNotification) => {
    const targetTab = getNotificationTargetTab(n);
    if (targetTab) {
      markRead(n.id);
      onOpenChange(false);
      onNavigateToTab(targetTab);
    }
  };

  const goToAll = () => {
    onOpenChange(false);
    onNavigateToTab("notifications");
  };

  const deleteNotif = (id: string) => {
    if (isLocalOnlyNotificationId(id)) {
      setLocalSystemReadIds((prev) => new Set([...prev, `deleted:${id}`]));
      return;
    }
    void store.deleteNotification(id);
  };

  return (
    // [FIX] Suppression du auto-markAllRead à l'ouverture.
    // L'admin Pro doit voir les notifications non-lues d'abord,
    // puis les marquer manuellement via le bouton "Tout marquer lu".
    <Sheet open={open} onOpenChange={(isOpen) => {
      onOpenChange(isOpen);
      // [FIX] Rafraîchir les items à l'ouverture au lieu de tout marquer lu
      if (isOpen) {
        void store.refresh();
      }
    }}>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        disabled={!role}
        className="relative p-2 rounded-full border border-white/30 hover:bg-white/10 transition disabled:opacity-50"
        aria-label={
          store.unreadCount
            ? `Notifications (${store.unreadCount} non lues)`
            : "Notifications"
        }
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {store.unreadCount > 0 ? (
          <span className="absolute -top-1 -end-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-extrabold flex items-center justify-center border-2 border-primary">
            {store.unreadCount > 99 ? "99+" : store.unreadCount}
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
            ) : store.loading && !activeItems.length ? (
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
