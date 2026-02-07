import { useEffect, useState, useCallback } from "react";
import { Wifi, WifiOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { proApiFetch } from "@/lib/pro/api";

type OnlineStatus = {
  is_online: boolean;
  online_since: string | null;
  current_session_minutes: number;
  total_online_minutes: number;
  activity_score: number;
};

async function getOnlineStatus(establishmentId: string): Promise<OnlineStatus | null> {
  try {
    const data = await proApiFetch(`/api/pro/establishments/${establishmentId}/online-status`);
    return data.status ?? null;
  } catch {
    return null;
  }
}

async function toggleOnline(establishmentId: string, isOnline: boolean): Promise<boolean> {
  try {
    await proApiFetch(`/api/pro/establishments/${establishmentId}/toggle-online`, {
      method: "POST",
      body: JSON.stringify({ is_online: isOnline }),
    });
    return true;
  } catch (e) {
    toast({
      variant: "destructive",
      title: "Erreur",
      description: e instanceof Error ? e.message : "Impossible de changer le statut",
    });
    return false;
  }
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}min`;
}

type Props = {
  establishmentId: string | null;
  className?: string;
};

export function ProOnlineToggle({ establishmentId, className }: Props) {
  const [status, setStatus] = useState<OnlineStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!establishmentId) return;
    setLoading(true);
    const s = await getOnlineStatus(establishmentId);
    setStatus(s);
    setLoading(false);
  }, [establishmentId]);

  useEffect(() => {
    void fetchStatus();
    // Refresh status every 60 seconds
    const interval = setInterval(() => void fetchStatus(), 60000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleToggle = async () => {
    if (!establishmentId || toggling) return;
    const newStatus = !status?.is_online;

    setToggling(true);
    const success = await toggleOnline(establishmentId, newStatus);
    if (success) {
      setStatus((prev) =>
        prev ? { ...prev, is_online: newStatus, online_since: newStatus ? new Date().toISOString() : null } : prev
      );
      toast({
        title: newStatus ? "🟢 Vous êtes en ligne" : "⚫ Vous êtes hors ligne",
      });
    }
    setToggling(false);
  };

  if (!establishmentId) return null;

  const isOnline = status?.is_online ?? false;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleToggle}
            disabled={loading || toggling}
            className={cn(
              "flex items-center gap-2 transition-all duration-300 group",
              className
            )}
            aria-label={isOnline ? "Passer hors ligne" : "Passer en ligne"}
          >
            {/* Icon Button */}
            <div
              className={cn(
                "h-10 w-10 rounded-full border flex items-center justify-center transition-all duration-300",
                isOnline
                  ? "border-emerald-400 bg-white group-hover:bg-emerald-50"
                  : "border-white/50 bg-white group-hover:bg-red-50"
              )}
            >
              {loading || toggling ? (
                <Loader2 className={cn("w-5 h-5 animate-spin", isOnline ? "text-emerald-600" : "text-red-600")} />
              ) : isOnline ? (
                <Wifi className="w-5 h-5 text-emerald-600" />
              ) : (
                <WifiOff className="w-5 h-5 text-red-600" />
              )}
            </div>
            {/* Status Label */}
            <span className="text-white font-semibold text-sm hidden sm:inline">
              {isOnline ? "Ouvert" : "Fermé"}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <div className="font-semibold flex items-center gap-2">
            <span
              className={cn(
                "w-2 h-2 rounded-full",
                isOnline ? "bg-emerald-500" : "bg-slate-400"
              )}
            />
            {isOnline ? "Vous êtes en ligne" : "Vous êtes hors ligne"}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
