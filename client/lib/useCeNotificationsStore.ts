/**
 * Store centralisé pour les notifications CE (Comité d'Entreprise).
 *
 * Singleton scoped par companyId. Partagé entre le bell icon du header
 * et tout futur onglet notifications dans le dashboard CE.
 *
 * Pattern identique aux stores User / Admin / Pro / Partner.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getConsumerAccessToken } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CeNotificationItem = {
  id: string;
  company_id: string;
  user_id: string;
  category: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function ceApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getConsumerAccessToken();
  if (!token) throw new Error("Non authentifié");
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Erreur serveur");
  return json;
}

// ---------------------------------------------------------------------------
// Singleton state — scoped par companyId
// ---------------------------------------------------------------------------

const STORE_EVENT = "sam:ce_notifications_store_changed";
const POLL_INTERVAL_MS = 30_000;

let _companyId: string | null = null;
let _items: CeNotificationItem[] = [];
let _unreadCount = 0;
let _loading = false;
let _error: string | null = null;
let _localReadIds = new Set<string>();
let _pollTimer: ReturnType<typeof setInterval> | null = null;
let _subscriberCount = 0;

function emit() {
  window.dispatchEvent(new Event(STORE_EVENT));
}

async function _load() {
  if (!_companyId) return;

  _loading = true;
  emit();

  try {
    const res = await ceApiFetch<{
      ok: boolean;
      notifications: CeNotificationItem[];
      unreadCount: number;
    }>("/api/ce/company/notifications?limit=200");

    _items = (res.notifications ?? []).map((n) => ({
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

function _startPolling(companyId: string) {
  _stopPolling();
  if (!companyId) return;

  _companyId = companyId;
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

export function useCeNotificationsStore(companyId: string | null) {
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((v) => v + 1), []);
  const companyIdRef = useRef(companyId);

  // Quand le companyId change, redémarrer le polling
  useEffect(() => {
    if (companyId !== companyIdRef.current) {
      companyIdRef.current = companyId;
      _localReadIds = new Set();
      if (companyId) {
        _startPolling(companyId);
      } else {
        _stopPolling();
        _items = [];
        _unreadCount = 0;
        emit();
      }
    }
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;

    _subscriberCount++;
    if (!_pollTimer) {
      _startPolling(companyId);
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
  }, [companyId, rerender]);

  const isRead = useCallback((n: CeNotificationItem) => {
    return !!n.read_at || _localReadIds.has(n.id);
  }, []);

  const localUnreadCount = useMemo(() => {
    return _items.filter((x) => !x.read_at && !_localReadIds.has(x.id)).length;
  }, [_items, _localReadIds.size]);

  const markRead = useCallback(async (id: string) => {
    _localReadIds = new Set([..._localReadIds, id]);
    _unreadCount = Math.max(0, _unreadCount - 1);
    emit();

    try {
      await ceApiFetch(`/api/ce/company/notifications/${id}/read`, { method: "POST" });
    } catch {
      // best effort
    }
  }, []);

  const markAllRead = useCallback(async () => {
    const allIds = _items.map((x) => x.id);
    _localReadIds = new Set([..._localReadIds, ...allIds]);
    _unreadCount = 0;
    emit();

    try {
      await ceApiFetch("/api/ce/company/notifications/read-all", { method: "POST" });
    } catch {
      // best effort
    }
  }, []);

  const deleteNotification = useCallback(async (id: string) => {
    _items = _items.filter((n) => n.id !== id);
    emit();

    try {
      await ceApiFetch(`/api/ce/company/notifications/${id}`, { method: "DELETE" });
    } catch {
      // Recharger en cas d'échec
      void _load();
    }
  }, []);

  const refresh = useCallback(() => {
    void _load();
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
  };
}
