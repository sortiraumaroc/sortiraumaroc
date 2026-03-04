/**
 * Page complète des notifications Admin (utilisée par AdminNotificationsPage).
 *
 * Utilise le store centralisé useAdminNotificationsStore.
 * Partage le même état que AdminNotificationsSheet (cloche header).
 *
 * Fonctionnalités :
 * - Recherche textuelle (titre + body)
 * - Filtre par catégorie
 * - Filtre lu / non-lu
 * - Suppression individuelle
 * - Préférences (popups, son)
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Check, CheckSquare, Loader2, Search, Square, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  getAdminNotificationPreferences,
  setAdminNotificationPreferences,
  type AdminNotificationPreferences,
} from "@/lib/adminNotificationPreferences";
import { useAdminNotificationsStore } from "@/lib/useAdminNotificationsStore";
import { NotificationBody } from "@/components/NotificationBody";
import { cn } from "@/lib/utils";
import { formatLeJjMmAaAHeure } from "@shared/datetime";
import {
  getNotificationHref,
  getNotificationCategory,
  categoryBadgeClass,
  NOTIFICATION_CATEGORY_LABELS,
  ALL_CATEGORIES,
  type NotificationCategory,
} from "@/lib/notificationHelpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ReadFilter = "all" | "unread" | "read";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdminNotificationsPanel() {
  const navigate = useNavigate();
  const store = useAdminNotificationsStore();
  const [preferences, setPreferences] = useState<AdminNotificationPreferences>(
    () => getAdminNotificationPreferences(),
  );

  // Filters state
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<NotificationCategory | "all">("all");
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const setPreferenceKey = (key: "popupsEnabled" | "soundEnabled", value: boolean) => {
    const next: AdminNotificationPreferences = { ...preferences, [key]: value };
    setPreferences(next);
    setAdminNotificationPreferences(next);
  };

  const toggleMutedCategory = (cat: string) => {
    const muted = preferences.mutedCategories ?? [];
    const isMuted = muted.includes(cat);
    const next: AdminNotificationPreferences = {
      ...preferences,
      mutedCategories: isMuted ? muted.filter((c) => c !== cat) : [...muted, cat],
    };
    setPreferences(next);
    setAdminNotificationPreferences(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((n) => n.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkRead = async () => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      for (const id of selectedIds) {
        void store.markRead(id);
      }
      setSelectedIds(new Set());
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      for (const id of selectedIds) {
        void store.deleteNotification(id);
      }
      setSelectedIds(new Set());
    } finally {
      setBulkLoading(false);
    }
  };

  // Filtered items
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return store.items.filter((n) => {
      // Text search
      if (q) {
        const title = (n.title ?? "").toLowerCase();
        const body = (n.body ?? "").toLowerCase();
        if (!title.includes(q) && !body.includes(q)) return false;
      }
      // Category filter
      if (categoryFilter !== "all") {
        const cat = getNotificationCategory(n.type ?? "");
        if (cat !== categoryFilter) return false;
      }
      // Read filter
      if (readFilter === "unread" && store.isRead(n)) return false;
      if (readFilter === "read" && !store.isRead(n)) return false;
      return true;
    });
  }, [store.items, store.isRead, searchQuery, categoryFilter, readFilter]);

  return (
    <div className="space-y-4">
      {/* Préférences */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Préférences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900">Pop-ups temps réel</div>
              <div className="text-xs text-slate-600">
                Affiche une notification à l'écran dès qu'un événement arrive.
              </div>
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
              <div className="text-xs text-slate-600">
                Joue un petit son lors d'une nouvelle alerte.
              </div>
            </div>
            <Switch
              checked={preferences.soundEnabled}
              onCheckedChange={(v) => setPreferenceKey("soundEnabled", v)}
              aria-label="Activer le son des notifications"
            />
          </div>

          {/* Per-category popup muting */}
          {preferences.popupsEnabled ? (
            <div className="pt-2 border-t border-slate-100">
              <div className="text-xs font-semibold text-slate-500 mb-2">Pop-ups par catégorie</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ALL_CATEGORIES.map((cat) => {
                  const muted = (preferences.mutedCategories ?? []).includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleMutedCategory(cat)}
                      className={cn(
                        "flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition",
                        muted
                          ? "bg-slate-50 text-slate-400 border-slate-200 line-through"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
                      )}
                    >
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full shrink-0",
                          muted ? "bg-slate-300" : categoryBadgeClass(cat).split(" ")[0],
                        )}
                      />
                      {NOTIFICATION_CATEGORY_LABELS[cat]}
                    </button>
                  );
                })}
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                Cliquez pour désactiver les pop-ups d'une catégorie.
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-900">
          Historique
          {filteredItems.length !== store.items.length ? (
            <span className="text-slate-400 font-normal ml-1">
              ({filteredItems.length}/{store.items.length})
            </span>
          ) : (
            <span className="text-slate-400 font-normal ml-1">
              ({store.items.length})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={store.loading} onClick={store.refresh}>
            {store.loading ? "Chargement..." : "Rafraîchir"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={store.localUnreadCount === 0}
            onClick={() => void store.markAllRead()}
          >
            Tout marquer lu
          </Button>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="space-y-3">
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Rechercher par titre ou contenu..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Category filter */}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCategoryFilter("all")}
            className={cn(
              "px-2.5 py-1 rounded-full text-xs font-semibold border transition",
              categoryFilter === "all"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
            )}
          >
            Toutes
          </button>
          {ALL_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat === categoryFilter ? "all" : cat)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-semibold border transition",
                categoryFilter === cat
                  ? categoryBadgeClass(cat)
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
              )}
            >
              {NOTIFICATION_CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        {/* Read filter */}
        <div className="flex gap-1.5">
          {(
            [
              { key: "all", label: "Toutes" },
              { key: "unread", label: "Non lues" },
              { key: "read", label: "Lues" },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setReadFilter(key)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-semibold border transition",
                readFilter === key
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk actions toolbar */}
      {selectedIds.size > 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2">
          <span className="text-xs font-semibold text-slate-700">
            {selectedIds.size} sélectionnée{selectedIds.size > 1 ? "s" : ""}
          </span>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            disabled={bulkLoading}
            onClick={() => void handleBulkRead()}
          >
            <Check className="h-3.5 w-3.5 mr-1" />
            Marquer lues
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 border-red-200 hover:bg-red-50"
            disabled={bulkLoading}
            onClick={() => void handleBulkDelete()}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Supprimer
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
          >
            Annuler
          </Button>
        </div>
      ) : null}

      {/* Error */}
      {store.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {store.error}
        </div>
      ) : null}

      {/* Loading */}
      {store.loading && !store.items.length ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement des notifications...
        </div>
      ) : null}

      {/* List */}
      {!store.loading || store.items.length ? (
        filteredItems.length ? (
          <div className="space-y-2">
            {/* Select all */}
            <div className="flex items-center gap-2 px-1">
              <button
                type="button"
                className="text-slate-400 hover:text-slate-600"
                onClick={toggleSelectAll}
                title={selectedIds.size === filteredItems.length ? "Tout désélectionner" : "Tout sélectionner"}
              >
                {selectedIds.size === filteredItems.length && filteredItems.length > 0
                  ? <CheckSquare className="h-4 w-4" />
                  : <Square className="h-4 w-4" />}
              </button>
              <span className="text-xs text-slate-400">
                {selectedIds.size === filteredItems.length && filteredItems.length > 0
                  ? "Tout désélectionner"
                  : "Tout sélectionner"}
              </span>
            </div>

            {filteredItems.map((n) => {
              const unread = !store.isRead(n);
              const href = getNotificationHref(n);
              const category = getNotificationCategory(n.type ?? "");
              const categoryLabel = NOTIFICATION_CATEGORY_LABELS[category] ?? category;
              const isSelected = selectedIds.has(n.id);

              return (
                <div
                  key={n.id}
                  className={cn(
                    "rounded-lg border bg-white p-3",
                    isSelected ? "border-primary/50 bg-primary/5" : unread ? "border-primary/30" : "border-slate-200",
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <button
                      type="button"
                      className="mt-0.5 shrink-0 text-slate-400 hover:text-primary"
                      onClick={() => toggleSelect(n.id)}
                    >
                      {isSelected
                        ? <CheckSquare className="h-4 w-4 text-primary" />
                        : <Square className="h-4 w-4" />}
                    </button>

                    <div className="min-w-0 flex-1">
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
                            categoryBadgeClass(category),
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
                          onClick={() => {
                            if (unread) void store.markRead(n.id);
                            navigate(href);
                          }}
                        >
                          Voir
                        </button>
                      ) : null}
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      {unread ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0"
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

            {/* Load more */}
            {store.hasMore ? (
              <div className="pt-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={store.loadMore}
                  disabled={store.loading}
                >
                  {store.loading ? "Chargement..." : "Charger plus"}
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
            {store.items.length > 0
              ? "Aucune notification ne correspond aux filtres."
              : "Aucune notification."}
          </div>
        )
      ) : null}
    </div>
  );
}
