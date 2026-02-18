// =============================================================================
// MY WHEEL GIFTS — Spin history + gifts from Wheel of Fortune (Consumer profile)
// =============================================================================

import { useCallback, useEffect, useState } from "react";
import {
  Calendar,
  Gift,
  History,
  Loader2,
  QrCode,
  Trophy,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getConsumerAccessToken } from "@/lib/auth";
import { cn } from "@/lib/utils";

// =============================================================================
// Types
// =============================================================================

interface SpinHistoryEntry {
  id: string;
  spun_at: string;
  result: "won" | "lost";
  prize_name?: string | null;
}

interface WheelGift {
  id: string;
  gift_distribution_id: string;
  prize_name: string;
  gift_type: string;
  value: number | string | null;
  status: "active" | "consumed" | "expired";
  expires_at: string | null;
  created_at: string;
}

// =============================================================================
// Helpers
// =============================================================================

async function authedGet<T>(path: string): Promise<T> {
  const token = await getConsumerAccessToken();
  if (!token) throw new Error("Non authentifié");

  const res = await fetch(path, {
    headers: { authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg =
      (body && typeof body.error === "string" ? body.error : null) ??
      `Erreur ${res.status}`;
    throw new Error(msg);
  }

  return res.json() as Promise<T>;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

// =============================================================================
// Sub-components
// =============================================================================

function SpinHistoryList({ items }: { items: SpinHistoryEntry[] }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
        <History className="h-10 w-10 opacity-40" />
        <p className="text-sm">Vous n'avez pas encore joué</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((spin) => (
        <Card key={spin.id} className="overflow-hidden">
          <CardContent className="flex items-center gap-3 p-3">
            {spin.result === "won" ? (
              <Trophy className="h-5 w-5 shrink-0 text-yellow-500" />
            ) : (
              <XCircle className="h-5 w-5 shrink-0 text-muted-foreground/50" />
            )}

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {spin.result === "won"
                  ? spin.prize_name ?? "Cadeau gagné"
                  : "Pas de chance"}
              </p>
              <p className="text-xs text-muted-foreground">
                {fmtDate(spin.spun_at)}
              </p>
            </div>

            <Badge
              variant={spin.result === "won" ? "default" : "secondary"}
              className={cn(
                "shrink-0 text-xs",
                spin.result === "won" &&
                  "bg-green-600 hover:bg-green-600 text-white",
              )}
            >
              {spin.result === "won" ? "Gagné" : "Perdu"}
            </Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function GiftCard({ gift }: { gift: WheelGift }) {
  const [showQr, setShowQr] = useState(false);
  const isActive = gift.status === "active";
  const isConsumed = gift.status === "consumed";
  const isExpired = gift.status === "expired";

  return (
    <Card
      className={cn(
        "overflow-hidden transition-opacity",
        !isActive && "opacity-60",
      )}
    >
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{gift.prize_name}</p>
            <p className="text-xs text-muted-foreground capitalize">
              {gift.gift_type}
              {gift.value != null && ` — ${gift.value}`}
            </p>
          </div>

          {isActive && (
            <Badge className="shrink-0 bg-green-600 hover:bg-green-600 text-white text-xs">
              Actif
            </Badge>
          )}
          {isConsumed && (
            <Badge variant="secondary" className="shrink-0 text-xs">
              Utilisé
            </Badge>
          )}
          {isExpired && (
            <Badge variant="destructive" className="shrink-0 text-xs">
              Expiré
            </Badge>
          )}
        </div>

        {gift.expires_at && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            <span>Expire le {fmtShortDate(gift.expires_at)}</span>
          </div>
        )}

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          <span>Obtenu le {fmtShortDate(gift.created_at)}</span>
        </div>

        {isActive && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="w-full mt-1 gap-1.5 text-xs"
              onClick={() => setShowQr((v) => !v)}
            >
              <QrCode className="h-3.5 w-3.5" />
              {showQr ? "Masquer le code" : "Afficher le code"}
            </Button>

            {showQr && (
              <div className="mt-2 rounded-md bg-muted/50 p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">
                  Code cadeau
                </p>
                <p className="font-mono text-sm font-semibold break-all select-all">
                  {gift.gift_distribution_id}
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function GiftsList({ items }: { items: WheelGift[] }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
        <Gift className="h-10 w-10 opacity-40" />
        <p className="text-sm">Aucun cadeau pour le moment</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((gift) => (
        <GiftCard key={gift.id} gift={gift} />
      ))}
    </div>
  );
}

// =============================================================================
// Main component
// =============================================================================

export function MyWheelGifts() {
  const [tab, setTab] = useState<"history" | "gifts">("gifts");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<SpinHistoryEntry[]>([]);
  const [gifts, setGifts] = useState<WheelGift[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [historyRes, giftsRes] = await Promise.all([
        authedGet<{ spins: SpinHistoryEntry[] }>("/api/me/wheel/history"),
        authedGet<{ gifts: WheelGift[] }>("/api/me/wheel/gifts"),
      ]);
      setHistory(historyRes.spins ?? []);
      setGifts(giftsRes.gifts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Roue de la Fortune</h3>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && error && (
        <div className="rounded-md bg-destructive/10 p-4 text-center text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && (
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "history" | "gifts")}
        >
          <TabsList className="w-full">
            <TabsTrigger value="gifts" className="flex-1 gap-1.5">
              <Gift className="h-4 w-4" />
              Mes Cadeaux
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1 gap-1.5">
              <History className="h-4 w-4" />
              Historique
            </TabsTrigger>
          </TabsList>

          <TabsContent value="gifts" className="mt-4">
            <GiftsList items={gifts} />
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <SpinHistoryList items={history} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

export default MyWheelGifts;
