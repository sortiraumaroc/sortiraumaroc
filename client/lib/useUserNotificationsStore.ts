/**
 * Store centralisé pour les notifications User (Consumer).
 *
 * Source unique de vérité partagée entre :
 *  - UserNotificationsBell (cloche header)
 *  - ProfileNotifications (page profil > onglet notifications)
 *
 * Remplace la duplication d'état et d'appels API qui existait entre les deux composants.
 * Utilise un singleton + événements DOM pour synchroniser tous les consommateurs du store.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  listMyConsumerNotifications,
  markAllMyConsumerNotificationsRead,
  markMyConsumerNotificationRead,
  deleteMyConsumerNotification,
  type ConsumerNotificationRow,
} from "@/lib/consumerNotificationsApi";
import {
  buildUserNotifications,
  getUserUnreadCount,
  isUserNotificationRead,
  getUserNotificationReadIds,
  markUserNotificationRead as markLocalRead,
  markAllUserNotificationsRead as markAllLocalRead,
  type UserNotificationItem,
} from "@/lib/userNotifications";

// ---------------------------------------------------------------------------
// Singleton state — shared across all hook instances
// ---------------------------------------------------------------------------

const STORE_CHANGE_EVENT = "sam:user_notifications_store_changed";
const POLL_INTERVAL_MS = 30_000;
const LS_DELETED_KEY = "sam:user_notif_deleted_ids";

let _consumerEvents: ConsumerNotificationRow[] = [];
let _loading = false;
let _error: string | null = null;
let _lastLoadedAt = 0;
let _pollTimer: ReturnType<typeof setInterval> | null = null;
let _subscriberCount = 0;
/** IDs supprimés localement — persistés dans localStorage pour survivre aux refresh */
let _localDeletedEventIds = new Set<string>();

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
    const arr = [..._localDeletedEventIds];
    if (arr.length > 500) arr.splice(0, arr.length - 500);
    localStorage.setItem(LS_DELETED_KEY, JSON.stringify(arr));
  } catch { /* ignore */ }
}

// Initialiser au chargement du module
_localDeletedEventIds = _loadDeletedIdsFromStorage();

function emit() {
  window.dispatchEvent(new Event(STORE_CHANGE_EVENT));
}

async function _load() {
  _loading = true;
  emit();

  try {
    const events = await listMyConsumerNotifications(200);
    _consumerEvents = events.filter((ev) => !_localDeletedEventIds.has(ev.id));
    _error = null;
    _lastLoadedAt = Date.now();

    // Migration legacy : syncer les marqueurs localStorage vers le serveur
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
    const msg = e instanceof Error ? e.message : "Impossible de charger les notifications.";
    _error = msg.toLowerCase().includes("not authenticated")
      ? "Connectez-vous pour voir vos notifications."
      : msg;
    _consumerEvents = [];
  }

  _loading = false;
  emit();
}

function _startPolling() {
  if (_pollTimer) return;
  void _load();
  _pollTimer = setInterval(() => void _load(), POLL_INTERVAL_MS);
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

export function useUserNotificationsStore(enabled: boolean) {
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((v) => v + 1), []);

  // S'abonner au store singleton
  useEffect(() => {
    if (!enabled) return;

    _subscriberCount++;
    _startPolling();

    window.addEventListener(STORE_CHANGE_EVENT, rerender);
    // Écouter aussi les événements legacy pour rester synchronisé
    window.addEventListener("sam:user_notifications_changed", rerender);
    window.addEventListener("sam-user-data-changed", rerender);

    return () => {
      _subscriberCount--;
      window.removeEventListener(STORE_CHANGE_EVENT, rerender);
      window.removeEventListener("sam:user_notifications_changed", rerender);
      window.removeEventListener("sam-user-data-changed", rerender);

      // Arrêter le polling quand plus aucun composant n'écoute
      if (_subscriberCount <= 0) {
        _subscriberCount = 0;
        _stopPolling();
      }
    };
  }, [enabled, rerender]);

  // Construire la liste de notifications
  const items = useMemo(() => {
    return buildUserNotifications({ bookings: [], packPurchases: [], consumerEvents: _consumerEvents });
  }, [_consumerEvents]);

  const readIds = useMemo(() => getUserNotificationReadIds(), [_consumerEvents, _loading]);

  const unreadCount = useMemo(() => getUserUnreadCount(items), [items, readIds]);

  const markRead = useCallback((id: string) => {
    const trimmed = String(id ?? "").trim();
    if (!trimmed) return;

    // Marquer côté serveur pour les event notifications
    if (trimmed.startsWith("event:")) {
      const eventId = trimmed.slice("event:".length);
      void markMyConsumerNotificationRead(eventId).catch(() => {});

      // Mise à jour optimiste dans le singleton
      _consumerEvents = _consumerEvents.map((ev) =>
        ev.id === eventId ? { ...ev, read_at: new Date().toISOString() } : ev,
      );
    }

    // Fallback localStorage
    markLocalRead(trimmed);
    emit();
  }, []);

  const markAllRead = useCallback(() => {
    const ids = items.map((x) => x.id);
    const eventIds = ids.filter((id) => id.startsWith("event:")).map((id) => id.slice("event:".length));

    if (eventIds.length) {
      void markAllMyConsumerNotificationsRead(eventIds).catch(() => {});

      // Mise à jour optimiste
      const now = new Date().toISOString();
      _consumerEvents = _consumerEvents.map((ev) =>
        eventIds.includes(ev.id) ? { ...ev, read_at: now } : ev,
      );
    }

    markAllLocalRead(ids);
    emit();
  }, [items]);

  const deleteNotification = useCallback((id: string) => {
    const trimmed = String(id ?? "").trim();
    if (!trimmed) return;

    if (trimmed.startsWith("event:")) {
      const eventId = trimmed.slice("event:".length);

      // Mémoriser l'ID + persister dans localStorage pour survivre aux refresh
      _localDeletedEventIds = new Set([..._localDeletedEventIds, eventId]);
      _saveDeletedIdsToStorage();

      // Suppression optimiste dans le singleton
      _consumerEvents = _consumerEvents.filter((ev) => ev.id !== eventId);

      // Best-effort côté serveur
      void deleteMyConsumerNotification(eventId).then(() => {
        // Suppression serveur OK → retirer du localStorage
        _localDeletedEventIds.delete(eventId);
        _saveDeletedIdsToStorage();
      }).catch((e) => {
        // L'item reste masqué grâce à _localDeletedEventIds persisté
        // deleteNotification API error (item stays hidden via localStorage)
      });
    }

    emit();
  }, []);

  const refresh = useCallback(() => {
    void _load();
  }, []);

  return {
    items,
    unreadCount,
    readIds,
    loading: _loading,
    error: _error,
    markRead,
    markAllRead,
    deleteNotification,
    refresh,
    isRead: (item: UserNotificationItem) => isUserNotificationRead(item, readIds),
  };
}
