/**
 * Store centralisé pour les notifications Pro.
 *
 * Source unique de vérité partagée entre :
 *  - ProNotificationsSheet (cloche header / panneau latéral)
 *  - ProNotificationsTab (onglet dans le dashboard)
 *  - ProLiveNotifications (Supabase Realtime + toasts)
 *
 * Scoped par establishmentId : change quand l'établissement actif change.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  listProNotifications,
  markProNotificationRead as apiMarkRead,
  markAllProNotificationsRead as apiMarkAllRead,
  deleteProNotification as apiDelete,
} from "@/lib/pro/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProNotificationItem = {
  id: string;
  category: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  created_at: string;
  read_at: string | null;
  // Notifications système (générées côté client) ne sont pas supprimables
  isSystem?: boolean;
};

// ---------------------------------------------------------------------------
// Singleton state — scoped par establishmentId
// ---------------------------------------------------------------------------

const STORE_EVENT = "sam:pro_notifications_store_changed";
const POLL_INTERVAL_MS = 30_000;
const LS_DELETED_KEY = "sam:pro_notif_deleted_ids";

let _establishmentId: string | null = null;
let _items: ProNotificationItem[] = [];
let _unreadCount = 0;
let _loading = false;
let _error: string | null = null;
let _localReadIds = new Set<string>();
/** IDs supprimés localement — persistés dans localStorage pour survivre aux refresh */
let _localDeletedIds = new Set<string>();
let _pollTimer: ReturnType<typeof setInterval> | null = null;
let _subscriberCount = 0;

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
    // Garder max 500 IDs pour ne pas polluer le localStorage
    if (arr.length > 500) arr.splice(0, arr.length - 500);
    localStorage.setItem(LS_DELETED_KEY, JSON.stringify(arr));
  } catch { /* ignore */ }
}

// Initialiser au chargement du module
_localDeletedIds = _loadDeletedIdsFromStorage();

function emit() {
  window.dispatchEvent(new Event(STORE_EVENT));
}

async function _load(estId: string) {
  if (!estId) return;

  _loading = true;
  emit();

  try {
    const res = await listProNotifications({
      establishmentId: estId,
      limit: 200,
    });

    _items = ((res.notifications ?? []) as ProNotificationItem[])
      .filter((n) => !_localDeletedIds.has(n.id))
      .map((n) => ({
        ...n,
        data: n.data && typeof n.data === "object" ? (n.data as Record<string, unknown>) : null,
      }));
    _unreadCount = res.unreadCount ?? _items.filter((n) => !n.read_at).length;
    _error = null;
  } catch (e) {
    _items = [];
    _unreadCount = 0;
    _error = e instanceof Error ? e.message : "Erreur";
  }

  _loading = false;
  emit();
}

function _startPolling(estId: string) {
  _stopPolling();
  if (!estId) return;

  _establishmentId = estId;
  void _load(estId);
  _pollTimer = setInterval(() => void _load(estId), POLL_INTERVAL_MS);
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

export function useProNotificationsStore(establishmentId: string | null) {
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((v) => v + 1), []);
  const estIdRef = useRef(establishmentId);

  // Quand l'establishmentId change, redémarrer le polling
  useEffect(() => {
    if (establishmentId !== estIdRef.current) {
      estIdRef.current = establishmentId;
      _localReadIds = new Set();
      // Ne pas effacer _localDeletedIds — ils sont persistés dans localStorage
      // et couvrent potentiellement plusieurs établissements
      if (establishmentId) {
        _startPolling(establishmentId);
      } else {
        _stopPolling();
        _items = [];
        _unreadCount = 0;
        emit();
      }
    }
  }, [establishmentId]);

  useEffect(() => {
    if (!establishmentId) return;

    _subscriberCount++;
    if (!_pollTimer) {
      _startPolling(establishmentId);
    }

    window.addEventListener(STORE_EVENT, rerender);

    return () => {
      _subscriberCount--;
      window.removeEventListener(STORE_EVENT, rerender);

      if (_subscriberCount <= 0) {
        _subscriberCount = 0;
        _stopPolling();
      }
    };
  }, [establishmentId, rerender]);

  const isRead = useCallback((n: ProNotificationItem) => {
    return !!n.read_at || _localReadIds.has(n.id);
  }, []);

  const localUnreadCount = useMemo(() => {
    return _items.filter((x) => !x.read_at && !_localReadIds.has(x.id)).length;
  }, [_items, _localReadIds.size]);

  const markRead = useCallback(async (id: string) => {
    if (!establishmentId) return;

    _localReadIds = new Set([..._localReadIds, id]);
    _unreadCount = Math.max(0, _unreadCount - 1);
    emit();

    try {
      await apiMarkRead({ establishmentId, notificationId: id });
    } catch {
      // best effort
    }
  }, [establishmentId]);

  const markAllRead = useCallback(async () => {
    if (!establishmentId) return;

    const allIds = _items.map((x) => x.id);
    _localReadIds = new Set([..._localReadIds, ...allIds]);
    _unreadCount = 0;
    emit();

    try {
      await apiMarkAllRead({ establishmentId });
    } catch {
      // best effort
    }
  }, [establishmentId]);

  const deleteNotification = useCallback(async (id: string) => {
    if (!establishmentId) return;

    // Suppression optimiste + mémoriser l'ID pour le filtrer après les reloads
    _localDeletedIds = new Set([..._localDeletedIds, id]);
    _saveDeletedIdsToStorage();
    _items = _items.filter((n) => n.id !== id);
    _unreadCount = _items.filter((n) => !n.read_at && !_localReadIds.has(n.id)).length;
    emit();

    try {
      await apiDelete({ establishmentId, notificationId: id });
      // Suppression serveur OK → on peut retirer l'ID du localStorage
      // (le serveur ne le renverra plus)
      _localDeletedIds.delete(id);
      _saveDeletedIdsToStorage();
    } catch (e) {
      // Best-effort : l'item reste masqué grâce à _localDeletedIds persisté
      // deleteNotification API error (item stays hidden via localStorage)
    }
  }, [establishmentId]);

  const refresh = useCallback(() => {
    if (establishmentId) void _load(establishmentId);
  }, [establishmentId]);

  /**
   * Appelé par ProLiveNotifications quand une nouvelle notification
   * arrive via Supabase Realtime. Insère dans le store sans recharger.
   */
  const pushRealtimeNotification = useCallback((n: ProNotificationItem) => {
    // Éviter les doublons
    if (_items.some((x) => x.id === n.id)) return;

    _items = [n, ..._items];
    _unreadCount++;
    emit();
  }, []);

  return {
    items: _items,
    unreadCount: _unreadCount,
    localUnreadCount,
    loading: _loading,
    error: _error,
    isRead,
    markRead,
    markAllRead,
    deleteNotification,
    refresh,
    pushRealtimeNotification,
  };
}
