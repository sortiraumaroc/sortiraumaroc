import * as React from "react";
import { toast } from "sonner";

import { HelpTooltip } from "@/components/pro/help-tooltip";
import { ProShell } from "@/components/pro/pro-shell";
import { useProSession } from "@/components/pro/use-pro-session";
import { useProPlace } from "@/contexts/pro-place-context";
import { useAuthToken } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  CheckCircle,
  Clock,
  Trash2,
  Hand,
  CreditCard,
  AlertCircle,
  Volume2,
  VolumeX,
} from "lucide-react";

type Notification = {
  id: string;
  tableNumber: number;
  type: string;
  message: string | null;
  status: string;
  priority: string;
  createdAt: string;
  acknowledgedAt?: string | null;
  completedAt?: string | null;
};

function getTypeIcon(type: string) {
  switch (type) {
    case "serveur":
      return <Hand className="h-4 w-4" />;
    case "addition":
      return <CreditCard className="h-4 w-4" />;
    default:
      return <AlertCircle className="h-4 w-4" />;
  }
}

function getTypeLabel(type: string) {
  switch (type) {
    case "serveur":
      return "Appel Serveur";
    case "addition":
      return "Appel Addition";
    case "chef":
      return "Appel Chef";
    case "paiement":
      return "Appel Paiement";
    default:
      return "Appel";
  }
}

function formatTime(dateString: string) {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);

    if (diffSecs < 60) return "À l'instant";
    if (diffMins < 60) return `Il y a ${diffMins}m`;
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    return date.toLocaleDateString("fr-FR");
  } catch {
    return "—";
  }
}

/** 🔊 shared audio (stable) */
let sharedAudioContext: AudioContext | null = null;
let sharedAudioContextInit: Promise<AudioContext | null> | null = null;

function getSharedAudioContext(): Promise<AudioContext | null> {
  if (sharedAudioContext) return Promise.resolve(sharedAudioContext);
  if (sharedAudioContextInit) return sharedAudioContextInit;

  sharedAudioContextInit = (async () => {
    try {
      const AudioContextImpl = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextImpl) return null;
      sharedAudioContext = new AudioContextImpl();
      return sharedAudioContext;
    } catch {
      return null;
    }
  })();

  return sharedAudioContextInit;
}

async function unlockAudioContext(): Promise<void> {
  try {
    const ctx = await getSharedAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") await ctx.resume();
  } catch {
    // ignore
  }
}

async function playNotificationSound(): Promise<void> {
  try {
    const ctx = await getSharedAudioContext();
    if (!ctx) return;

    if (ctx.state === "suspended") {
      await unlockAudioContext();
      if (ctx.state === "suspended") return;
    }

    const gain = ctx.createGain();
    const osc = ctx.createOscillator();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(880, ctx.currentTime);

    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.26);
  } catch {
    // ignore
  }
}

export default function ProNotifications() {
  const { state, signOut } = useProSession();
  const { selectedPlaceId } = useProPlace();
  const accessToken = useAuthToken("client");

  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<"all" | "pending" | "completed">("all");
  const [autoRefresh, setAutoRefresh] = React.useState(true);
  const [soundEnabled, setSoundEnabled] = React.useState(true);

  // Keep latest notifications for polling without stale closure
  const notificationsRef = React.useRef<Notification[]>([]);
  React.useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  // Unlock audio context on first user interaction
  React.useEffect(() => {
    if (!soundEnabled) return;

    let unlocked = false;
    const handleUnlock = () => {
      if (unlocked) return;
      unlocked = true;
      void unlockAudioContext();
      window.removeEventListener("pointerdown", handleUnlock);
      window.removeEventListener("keydown", handleUnlock);
    };

    window.addEventListener("pointerdown", handleUnlock);
    window.addEventListener("keydown", handleUnlock);

    return () => {
      unlocked = true;
      window.removeEventListener("pointerdown", handleUnlock);
      window.removeEventListener("keydown", handleUnlock);
    };
  }, [soundEnabled]);

  const loadNotifications = React.useCallback(async () => {
    if (!selectedPlaceId) return;

    setLoading(true);
    try {
      const params = new URLSearchParams();
      // ✅ Your backend expects status=pending|completed
      if (filter !== "all") params.append("status", filter);

      const response = await fetch(`/api/mysql/notifications/${selectedPlaceId}?${params.toString()}`);
      if (!response.ok) {
        toast.error("Impossible de charger les appels");
        setNotifications([]);
        return;
      }

      const data = await response.json();
      setNotifications(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error loading notifications:", error);
      toast.error("Erreur lors du chargement des appels");
    } finally {
      setLoading(false);
    }
  }, [filter, selectedPlaceId]);

  React.useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  // ✅ Polling (no stale dependencies)
  React.useEffect(() => {
    if (!autoRefresh || !selectedPlaceId) return;

    const interval = setInterval(async () => {
      try {
        const params = new URLSearchParams();
        if (filter !== "all") params.append("status", filter);

        const response = await fetch(`/api/mysql/notifications/${selectedPlaceId}?${params.toString()}`);
        if (!response.ok) return;

        const data = await response.json();
        const next = (Array.isArray(data) ? data : []) as Notification[];

        // new pending notifications detection
        const prev = notificationsRef.current;
        const prevIds = new Set(prev.map((n) => n.id));
        const addedPending = next.filter((n) => !prevIds.has(n.id) && n.status === "pending");

        if (addedPending.length > 0) {
          if (soundEnabled) void playNotificationSound();
          const first = addedPending[0];
          toast.success(`Appel — Table ${first.tableNumber || "?"} (${getTypeLabel(first.type)})`, {
            duration: 3500,
            className: "border-sam-red/30 bg-sam-red text-white",
          });
        }

        setNotifications(next);
      } catch (error) {
        console.error("Error in polling:", error);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [autoRefresh, filter, selectedPlaceId, soundEnabled]);

  const acknowledgeNotification = React.useCallback(
    async (notification: Notification) => {
      if (!accessToken) return toast.error("Non authentifié");

      try {
        const res = await fetch(`/api/mysql/notifications/${notification.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ status: "acknowledged" }),
        });

        if (!res.ok) return toast.error("Impossible de marquer comme vu");

        toast.success("Appel marqué comme vu", { duration: 1400 });
        await loadNotifications();
      } catch (error) {
        console.error("Error acknowledging notification:", error);
        toast.error("Erreur lors de la modification");
      }
    },
    [accessToken, loadNotifications],
  );

  const completeNotification = React.useCallback(
    async (notification: Notification) => {
      if (!accessToken) return toast.error("Non authentifié");

      try {
        const res = await fetch(`/api/mysql/notifications/${notification.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ status: "completed" }),
        });

        if (!res.ok) return toast.error("Impossible de marquer comme terminé");

        toast.success("Appel marqué comme terminé", { duration: 1400 });
        await loadNotifications();
      } catch (error) {
        console.error("Error completing notification:", error);
        toast.error("Erreur lors de la modification");
      }
    },
    [accessToken, loadNotifications],
  );

  const deleteNotification = React.useCallback(
    async (notificationId: string) => {
      if (!accessToken) return toast.error("Non authentifié");

      try {
        const res = await fetch(`/api/mysql/notifications/${notificationId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!res.ok) return toast.error("Impossible de supprimer l'appel");

        toast.success("Appel supprimé", { duration: 1400 });
        await loadNotifications();
      } catch (error) {
        console.error("Error deleting notification:", error);
        toast.error("Erreur lors de la suppression");
      }
    },
    [accessToken, loadNotifications],
  );

  const pendingNotifications = notifications.filter((n) => n.status === "pending" || n.status === "acknowledged");
  const completedNotifications = notifications.filter((n) => n.status === "completed");

  const displayedNotifications =
    filter === "all" ? notifications : filter === "pending" ? pendingNotifications : completedNotifications;

  const email = state.status === "signedIn" ? state.email : null;

  return (
    <ProShell title="Appels à table" subtitle={email ? `Connecté : ${email}` : undefined} onSignOut={() => void signOut()}>
      <div className="flex flex-col gap-4">
        {/* ✅ Light header */}
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-black">Gestion des appels</div>
            <HelpTooltip label="Aide appels">
              <>
                Les clients peuvent demander un serveur ou une addition depuis le menu. Les appels apparaîtront ici en
                temps réel.
              </>
            </HelpTooltip>
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              onClick={() => {
                setSoundEnabled((prev) => {
                  const next = !prev;
                  if (next) {
                    void unlockAudioContext();
                    void playNotificationSound();
                  }
                  return next;
                });
              }}
              variant="outline"
              className={cn(
                "h-10 rounded-xl border-black/10 bg-white px-4 text-black hover:bg-black/5",
                soundEnabled && "border-sam-red bg-sam-red/10",
              )}
              title={soundEnabled ? "Son activé" : "Son désactivé"}
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              <span className="ml-2 hidden sm:inline">{soundEnabled ? "Son" : "Son off"}</span>
            </Button>

            <label className="flex items-center gap-2 text-sm text-black/70">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="h-4 w-4 rounded border border-black/20"
              />
              Rafraîchissement auto
            </label>
          </div>
        </div>

        {/* ✅ Light filters */}
        <div className="flex gap-2">
          {(["all", "pending", "completed"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-xl px-4 py-2 text-sm font-medium transition border",
                filter === f
                  ? "bg-sam-red text-white border-sam-red/30"
                  : "bg-white text-black border-black/10 hover:bg-black/5",
              )}
            >
              {f === "all"
                ? "Tous"
                : f === "pending"
                  ? `En attente (${pendingNotifications.length})`
                  : `Terminés (${completedNotifications.length})`}
            </button>
          ))}
        </div>

        {/* ✅ List (light cards) */}
        <div className="space-y-2">
          {loading ? (
            <div className="rounded-2xl border border-black/10 bg-white p-4 text-sm text-black/60 shadow-sm">
              Chargement…
            </div>
          ) : displayedNotifications.length === 0 ? (
            <div className="rounded-2xl border border-black/10 bg-white p-4 text-sm text-black/60 shadow-sm">
              {filter === "all"
                ? "Aucun appel pour le moment"
                : filter === "pending"
                  ? "Aucun appel en attente"
                  : "Aucun appel terminé"}
            </div>
          ) : (
            displayedNotifications.map((notification) => {
              const isPending = notification.status === "pending" || notification.status === "acknowledged";

              return (
                <div
                  key={notification.id}
                  className={cn(
                    "rounded-2xl border p-4 transition shadow-sm",
                    isPending ? "border-sam-red/25 bg-sam-red/5" : "border-black/10 bg-white",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                          isPending ? "bg-sam-red/15 text-sam-red" : "bg-black/5 text-black/60",
                        )}
                      >
                        {getTypeIcon(notification.type)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-black text-sm">{getTypeLabel(notification.type)}</span>

                          {notification.status === "acknowledged" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-black/5 px-2 py-1 text-xs text-black/60 border border-black/10">
                              <Clock className="h-3 w-3" />
                              En cours
                            </span>
                          )}

                          {notification.status === "completed" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-sam-success/10 px-2 py-1 text-xs text-sam-success border border-sam-success/20">
                              <CheckCircle className="h-3 w-3" />
                              Terminé
                            </span>
                          )}
                        </div>

                        <div className="mt-1 text-xs text-black/60">
                          Table {notification.tableNumber || "—"} • {formatTime(notification.createdAt)}
                        </div>

                        {notification.message ? (
                          <div className="mt-2 text-sm text-black/80">{notification.message}</div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex shrink-0 gap-2">
                      {isPending ? (
                        <>
                          {notification.status === "pending" && (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => void acknowledgeNotification(notification)}
                              className="h-9 rounded-lg border-black/10 bg-white text-black hover:bg-black/5"
                              title="Marquer comme vu"
                            >
                              <Clock className="h-4 w-4" />
                            </Button>
                          )}

                          <Button
                            type="button"
                            onClick={() => void completeNotification(notification)}
                            className="h-9 rounded-lg bg-sam-red text-white hover:bg-sam-red/90"
                            title="Marquer comme terminé"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        </>
                      ) : null}

                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void deleteNotification(notification.id)}
                        className="h-9 rounded-lg border-black/10 bg-white text-black/70 hover:bg-sam-red/10 hover:text-sam-red"
                        title="Supprimer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </ProShell>
  );
}
