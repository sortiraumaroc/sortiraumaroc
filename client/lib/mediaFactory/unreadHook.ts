import { useEffect, useState, useCallback } from "react";
import { proSupabase as supabase } from "@/lib/pro/supabase";

type UnreadCountResult = {
  unread_count: number;
  per_thread: Record<string, number>;
};

/**
 * Hook to fetch unread message count for PRO portal
 */
export function useProUnreadCount(establishmentId: string | null): {
  unreadCount: number;
  perThread: Record<string, number>;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [unreadCount, setUnreadCount] = useState(0);
  const [perThread, setPerThread] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!establishmentId) {
      setUnreadCount(0);
      setPerThread({});
      return;
    }

    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setUnreadCount(0);
        setPerThread({});
        return;
      }

      const res = await fetch(
        `/api/pro/establishments/${establishmentId}/media/messages/unread-count`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!res.ok) {
        setUnreadCount(0);
        setPerThread({});
        return;
      }

      const json = (await res.json()) as UnreadCountResult;
      setUnreadCount(json.unread_count ?? 0);
      setPerThread(json.per_thread ?? {});
    } catch {
      setUnreadCount(0);
      setPerThread({});
    } finally {
      setLoading(false);
    }
  }, [establishmentId]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return { unreadCount, perThread, loading, refresh };
}

/**
 * Hook to fetch unread message count for Partner portal
 */
export function usePartnerUnreadCount(): {
  unreadCount: number;
  perThread: Record<string, number>;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [unreadCount, setUnreadCount] = useState(0);
  const [perThread, setPerThread] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setUnreadCount(0);
        setPerThread({});
        return;
      }

      const res = await fetch("/api/partners/media/messages/unread-count", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        setUnreadCount(0);
        setPerThread({});
        return;
      }

      const json = (await res.json()) as UnreadCountResult;
      setUnreadCount(json.unread_count ?? 0);
      setPerThread(json.per_thread ?? {});
    } catch {
      setUnreadCount(0);
      setPerThread({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return { unreadCount, perThread, loading, refresh };
}

/**
 * Hook to fetch partner in-app notifications
 */
export function usePartnerNotifications(): {
  notifications: any[];
  unreadCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
} {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) {
        setNotifications([]);
        setUnreadCount(0);
        return;
      }

      const res = await fetch("/api/partners/media/notifications", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        setNotifications([]);
        setUnreadCount(0);
        return;
      }

      const json = await res.json();
      setNotifications(json.items ?? []);
      setUnreadCount(json.unread_count ?? 0);
    } catch {
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const markAsRead = useCallback(
    async (id: string) => {
      const token = await getToken();
      if (!token) return;

      await fetch(`/api/partners/media/notifications/${id}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      await refresh();
    },
    [getToken, refresh],
  );

  const markAllAsRead = useCallback(async () => {
    const token = await getToken();
    if (!token) return;

    await fetch("/api/partners/media/notifications/read-all", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    await refresh();
  }, [getToken, refresh]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return {
    notifications,
    unreadCount,
    loading,
    refresh,
    markAsRead,
    markAllAsRead,
  };
}
