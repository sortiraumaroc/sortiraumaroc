/**
 * Store centralisé pour les notifications Admin.
 *
 * Source unique de vérité partagée entre :
 *  - AdminNotificationsSheet (cloche header / panneau latéral)
 *  - AdminNotificationsPanel / AdminNotificationsPage (page complète)
 *  - AdminTopbar (polling + toasts temps réel)
 *
 * Singleton : un seul polling tourne, tous les composants lisent le même état.
 *
 * [FIX 2026-02-19] Les notifications ne passent à "Lu" que sur action explicite
 * de l'admin (bouton "Marquer lu" / "Tout marquer lu"). Si le serveur retourne
 * un read_at (ex: set par un ancien build ou un autre onglet), on l'ignore tant
 * que l'admin n'a pas agi dans cette session — sauf si le read_at existait déjà
 * au premier chargement (notifications historiquement lues).
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  listAdminNotifications,
  getAdminNotificationsUnreadCount,
  markAdminNotificationRead as apiMarkRead,
  markAllAdminNotificationsRead as apiMarkAllRead,
  deleteAdminNotification as apiDelete,
  type AdminNotification,
} from "@/lib/adminApi";

// ---------------------------------------------------------------------------
// Singleton state
// ---------------------------------------------------------------------------

const STORE_EVENT = "sam:admin_notifications_store_changed";
const POLL_INTERVAL_MS = 8_000;
const LS_DELETED_KEY = "sam:admin_notif_deleted_ids";

let _items: AdminNotification[] = [];
let _unreadCount = 0;
let _loading = false;
let _error: string | null = null;
/** IDs explicitly marked as read by the admin during this session */
let _localReadIds = new Set<string>();
/**
 * IDs that were already read (read_at != null) at first load.
 * These are considered "historically read" and shown as "Lu".
 * Any read_at that appears AFTER first load (set by another tab or old build)
 * is IGNORED — the admin must click "Marquer lu" in this session.
 */
let _initiallyReadIds = new Set<string>();
let _initialLoadDone = false;
/** IDs supprimés localement — persistés dans localStorage pour survivre aux refresh */
let _localDeletedIds = new Set<string>();
let _pollTimer: ReturnType<typeof setInterval> | null = null;
let _subscriberCount = 0;
let _lastLoadedAt = 0;
let _hasMore = false;

// --- localStorage persistence for deleted IDs ---
function _loadDeletedIdsFromStorage(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_DELETED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set(arr.filter((x: unknown): x is string => typeof x === "string"));
  } catch { /* ignore */ }
  return new Set();
}

function _saveDeletedIdsToStorage() {
  try {
    const arr = [..._localDeletedIds];
    if (arr.length > 500) arr.splice(0, arr.length - 500);
    localStorage.setItem(LS_DELETED_KEY, JSON.stringify(arr));
  } catch { /* ignore */ }
}

// Initialiser au chargement du module
_localDeletedIds = _loadDeletedIdsFromStorage();

function emit() {
  window.dispatchEvent(new Event(STORE_EVENT));
}

// Track previous unread count to detect new notifications arriving
let _prevUnreadCount = 0;

async function _refreshUnread(adminKey?: string) {
  try {
    const res = await getAdminNotificationsUnreadCount(adminKey);
    const newCount = res.unread ?? 0;
    _unreadCount = newCount;

    // Si le unreadCount augmente, recharger la liste complète des items
    // pour que les nouvelles notifications apparaissent dans le panneau.
    if (newCount > _prevUnreadCount) {
      _prevUnreadCount = newCount;
      await _loadItems(adminKey);
    } else {
      _prevUnreadCount = newCount;
      emit();
    }
  } catch {
    // ignore
  }
}

// Rechargement des items sans spinner (utilisé par _refreshUnread)
async function _loadItems(adminKey?: string) {
  try {
    const res = await listAdminNotifications(adminKey, { limit: 50 });
    _items = (res.items ?? []).filter((n) => !_localDeletedIds.has(n.id));
    _hasMore = (res as any).hasMore === true;
    _captureInitiallyRead();
    _error = null;
    _lastLoadedAt = Date.now();
  } catch (e) {
    _error = e instanceof Error ? e.message : "Erreur";
  }
  emit();
}

// Load more items (pagination)
async function _loadMore(adminKey?: string) {
  if (!_hasMore) return;
  try {
    const offset = _items.length;
    const res = await listAdminNotifications(adminKey, { limit: 50, offset });
    const newItems = (res.items ?? []).filter((n) => !_localDeletedIds.has(n.id));
    _items = [..._items, ...newItems];
    _hasMore = res.hasMore === true;
  } catch {
    // ignore
  }
  emit();
}

/**
 * On first load, snapshot which IDs already have read_at.
 * These are the only ones we'll consider "read from server".
 */
function _captureInitiallyRead() {
  if (_initialLoadDone) return;
  _initialLoadDone = true;
  _initiallyReadIds = new Set(
    _items.filter((n) => !!n.read_at).map((n) => n.id),
  );
}

async function _load(adminKey?: string) {
  _loading = true;
  emit();

  try {
    const res = await listAdminNotifications(adminKey, { limit: 120 });
    _items = (res.items ?? []).filter((n) => !_localDeletedIds.has(n.id));
    _captureInitiallyRead();
    _error = null;
    _lastLoadedAt = Date.now();
  } catch (e) {
    _items = [];
    _error = e instanceof Error ? e.message : "Erreur";
  }

  _loading = false;
  await _refreshUnread(adminKey);
}

function _startPolling(adminKey?: string) {
  if (_pollTimer) return;
  void _load(adminKey);
  // [FIX] Le polling appelle _refreshUnread qui recharge automatiquement les items
  // quand de nouvelles notifications sont détectées (unreadCount augmente)
  _pollTimer = setInterval(() => void _refreshUnread(adminKey), POLL_INTERVAL_MS);
}

function _stopPolling() {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Public hook
// ---------------------------------------------------------------------------

export function useAdminNotificationsStore(adminKey?: string) {
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((v) => v + 1), []);

  useEffect(() => {
    _subscriberCount++;
    _startPolling(adminKey);

    window.addEventListener(STORE_EVENT, rerender);

    return () => {
      _subscriberCount--;
      window.removeEventListener(STORE_EVENT, rerender);

      if (_subscriberCount <= 0) {
        _subscriberCount = 0;
        _stopPolling();
      }
    };
  }, [adminKey, rerender]);

  /**
   * A notification is considered "read" only if:
   *  1. The admin explicitly marked it as read in this session (_localReadIds), OR
   *  2. It was already read when the session started (_initiallyReadIds).
   * This prevents notifications from silently switching to "Lu" when the server
   * sets read_at (e.g. from another tab or an old deployed build).
   */
  const isRead = useCallback((n: AdminNotification) => {
    return _localReadIds.has(n.id) || _initiallyReadIds.has(n.id);
  }, []);

  const localUnreadCount = useMemo(() => {
    return _items.filter(
      (x) => !_localReadIds.has(x.id) && !_initiallyReadIds.has(x.id),
    ).length;
  }, [_items, _localReadIds.size]);

  const markRead = useCallback(async (id: string) => {
    _localReadIds = new Set([..._localReadIds, id]);
    emit();

    try {
      await apiMarkRead(adminKey, id);
      await _refreshUnread(adminKey);
    } catch {
      // best effort
    }
  }, [adminKey]);

  const markAllRead = useCallback(async () => {
    const allIds = _items.map((x) => x.id);
    _localReadIds = new Set([..._localReadIds, ...allIds]);
    // Also add to _initiallyReadIds so a page refresh keeps them as read
    for (const id of allIds) _initiallyReadIds.add(id);
    _unreadCount = 0;
    emit();

    try {
      await apiMarkAllRead(adminKey);
    } catch {
      // best effort
    }
  }, [adminKey]);

  const deleteNotification = useCallback(async (id: string) => {
    // Suppression optimiste + persister dans localStorage
    _localDeletedIds = new Set([..._localDeletedIds, id]);
    _saveDeletedIdsToStorage();
    _items = _items.filter((n) => n.id !== id);
    emit();

    try {
      await apiDelete(adminKey, id);
      // Suppression serveur OK → retirer du localStorage
      _localDeletedIds.delete(id);
      _saveDeletedIdsToStorage();
      await _refreshUnread(adminKey);
    } catch (e) {
      // Best-effort : l'item reste masqué grâce à _localDeletedIds persisté
      // deleteNotification API error (item stays hidden via localStorage)
    }
  }, [adminKey]);

  const refresh = useCallback(() => {
    void _load(adminKey);
  }, [adminKey]);

  const loadMore = useCallback(() => {
    void _loadMore(adminKey);
  }, [adminKey]);

  return {
    items: _items,
    unreadCount: _unreadCount,
    localUnreadCount,
    loading: _loading,
    error: _error,
    hasMore: _hasMore,
    isRead,
    markRead,
    markAllRead,
    deleteNotification,
    refresh,
    loadMore,
  };
}

/**
 * Accès direct au unreadCount sans charger la liste complète.
 * Utile pour le polling léger dans AdminTopbar.
 */
export function getAdminStoreUnreadCount(): number {
  return _unreadCount;
}

/**
 * Accès aux items pour le système de toast (AdminTopbar).
 * Retourne les items qui n'ont pas encore été vus par le toast system.
 */
export function getAdminStoreItems(): AdminNotification[] {
  return _items;
}
