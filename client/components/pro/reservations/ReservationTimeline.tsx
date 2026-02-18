import { useEffect, useState } from "react";
import { Clock, Loader2, MessageSquare, RefreshCw, User, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { getReservationHistory, type ReservationHistoryEntry } from "@/lib/pro/api";

function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "À l'instant";
  if (diffMins < 60) return `Il y a ${diffMins} min`;
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  if (diffDays < 7) return `Il y a ${diffDays}j`;

  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getActionIcon(action: string) {
  switch (action) {
    case "created":
      return <Users className="w-4 h-4" />;
    case "status_changed":
      return <RefreshCw className="w-4 h-4" />;
    case "message_sent":
      return <MessageSquare className="w-4 h-4" />;
    default:
      return <Clock className="w-4 h-4" />;
  }
}

function getActorIcon(actorType: string) {
  switch (actorType) {
    case "consumer":
      return <User className="w-3 h-3" />;
    case "pro":
      return <Users className="w-3 h-3" />;
    default:
      return <RefreshCw className="w-3 h-3" />;
  }
}

function getActionColor(action: string): string {
  switch (action) {
    case "created":
      return "bg-blue-500";
    case "status_changed":
      return "bg-amber-500";
    case "message_sent":
      return "bg-purple-500";
    default:
      return "bg-slate-400";
  }
}

type Props = {
  establishmentId: string;
  reservationId: string;
};

export function ReservationTimeline({ establishmentId, reservationId }: Props) {
  const [history, setHistory] = useState<ReservationHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getReservationHistory({ establishmentId, reservationId });
      setHistory(res.history);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadHistory();
  }, [establishmentId, reservationId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
        <Loader2 className="w-4 h-4 animate-spin" />
        Chargement de l'historique...
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2 py-4">
        <div className="text-sm text-red-600">{error}</div>
        <Button variant="outline" size="sm" onClick={() => void loadHistory()}>
          Réessayer
        </Button>
      </div>
    );
  }

  if (!history.length) {
    return (
      <div className="text-sm text-slate-500 py-4">
        Aucun historique disponible pour cette réservation.
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {history.map((entry, idx) => {
        const isLast = idx === history.length - 1;
        const color = getActionColor(entry.action);

        return (
          <div key={entry.id} className="flex gap-3">
            {/* Timeline line and dot */}
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full ${color} flex items-center justify-center text-white shrink-0`}>
                {getActionIcon(entry.action)}
              </div>
              {!isLast && <div className="w-0.5 flex-1 bg-slate-200 min-h-[24px]" />}
            </div>

            {/* Content */}
            <div className={`pb-4 flex-1 ${isLast ? "" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-sm text-slate-900">{entry.action_label}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs gap-1">
                      {getActorIcon(entry.actor_type)}
                      {entry.actor_type === "system"
                        ? "Système"
                        : entry.actor_type === "pro"
                          ? "Pro"
                          : "Client"}
                    </Badge>
                    {entry.actor_name && entry.actor_type !== "system" && (
                      <span className="text-xs text-slate-500">{entry.actor_name}</span>
                    )}
                  </div>
                </div>
                <div className="text-end shrink-0">
                  <div className="text-xs font-medium text-slate-600" title={formatDateTime(entry.created_at)}>
                    {formatRelative(entry.created_at)}
                  </div>
                </div>
              </div>

              {/* Status change */}
              {entry.previous_status && entry.new_status && (
                <div className="mt-2 text-xs text-slate-600 flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{entry.previous_status}</Badge>
                  <span>→</span>
                  <Badge variant="outline" className="text-xs">{entry.new_status}</Badge>
                </div>
              )}

              {/* Message */}
              {entry.message && (
                <div className="mt-2 text-sm text-slate-600 bg-slate-50 rounded-md p-2 border border-slate-100">
                  {entry.message}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
