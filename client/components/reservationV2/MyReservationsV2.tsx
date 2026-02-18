/**
 * 4.2 — Espace "Mes Réservations" V2
 *
 * Sub-sections:
 *  - Upcoming / Past / Pending reservations tabs
 *  - Reservation detail with status, QR code, actions
 *  - Reliability score card
 *  - Active waitlist positions
 *  - Quote requests tracking
 */

import * as React from "react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { format } from "date-fns";
import {
  CalendarDays, Clock, Users, QrCode, Star, Shield, Edit2,
  XCircle, ArrowUpCircle, ChevronRight, MessageSquare, FileText,
  AlertTriangle, CheckCircle2, Loader2, Timer, ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  useMyReservationsV2,
  useMyScoreV2,
  useWaitlistV2,
  useQuotesV2,
} from "@/hooks/useReservationV2";
import { scoreToStars } from "@/lib/reservationV2Api";
import type { ReservationV2Row } from "@/lib/reservationV2Api";
import { CANCELLABLE_STATUS_SET, SCORE_SCALE, SCORING_WEIGHTS } from "../../../shared/reservationTypesV2";

// =============================================================================
// Status display helpers
// =============================================================================

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; color: string }> = {
  requested: { label: "Demandée", variant: "secondary", color: "text-blue-600" },
  pending_pro_validation: { label: "En attente", variant: "secondary", color: "text-yellow-600" },
  confirmed: { label: "Confirmée", variant: "default", color: "text-green-600" },
  waitlist: { label: "Liste d'attente", variant: "outline", color: "text-purple-600" },
  on_hold: { label: "En attente", variant: "outline", color: "text-orange-600" },
  deposit_requested: { label: "Acompte demandé", variant: "secondary", color: "text-orange-600" },
  deposit_paid: { label: "Acompte payé", variant: "default", color: "text-green-600" },
  consumed: { label: "Honorée", variant: "default", color: "text-green-700" },
  consumed_default: { label: "Validée auto", variant: "default", color: "text-green-600" },
  cancelled_user: { label: "Annulée", variant: "destructive", color: "text-red-500" },
  cancelled_pro: { label: "Refusée", variant: "destructive", color: "text-red-500" },
  cancelled: { label: "Annulée", variant: "destructive", color: "text-red-500" },
  refused: { label: "Refusée", variant: "destructive", color: "text-red-500" },
  expired: { label: "Expirée", variant: "outline", color: "text-gray-500" },
  noshow: { label: "No-show", variant: "destructive", color: "text-red-600" },
  no_show_confirmed: { label: "No-show confirmé", variant: "destructive", color: "text-red-700" },
  no_show_disputed: { label: "No-show contesté", variant: "outline", color: "text-orange-600" },
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] ?? { label: status, variant: "outline" as const, color: "text-muted-foreground" };
}

// =============================================================================
// Reservation card
// =============================================================================

function ReservationCard({
  reservation,
  onSelect,
}: {
  reservation: ReservationV2Row;
  onSelect: (r: ReservationV2Row) => void;
}) {
  const config = getStatusConfig(reservation.status);
  const est = reservation.establishments;
  const dateStr = reservation.starts_at
    ? format(new Date(reservation.starts_at), "EEE d MMM, HH:mm")
    : "";

  return (
    <button
      onClick={() => onSelect(reservation)}
      className="w-full text-start bg-card rounded-xl border p-4 hover:border-primary/30 hover:shadow-sm transition-all space-y-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate">{est?.name ?? "Réservation"}</p>
          {est?.city && <p className="text-xs text-muted-foreground">{est.city}</p>}
        </div>
        <Badge variant={config.variant} className="shrink-0 text-[10px]">
          {config.label}
        </Badge>
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <CalendarDays className="h-3 w-3" />
          {dateStr}
        </span>
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          {reservation.party_size}
        </span>
        {reservation.booking_reference && (
          <span className="font-mono text-[10px]">
            #{reservation.booking_reference.slice(0, 8)}
          </span>
        )}
      </div>
    </button>
  );
}

// =============================================================================
// Reservation detail dialog
// =============================================================================

function ReservationDetailDialog({
  reservation,
  open,
  onClose,
  onCancel,
  onUpgrade,
  onModify,
  onFetchQr,
}: {
  reservation: ReservationV2Row | null;
  open: boolean;
  onClose: () => void;
  onCancel: (id: string, reason?: string) => Promise<any>;
  onUpgrade: (id: string) => Promise<any>;
  onModify: (id: string, patch: any) => Promise<any>;
  onFetchQr: (id: string) => Promise<any>;
}) {
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const r = reservation;
  if (!r) return null;

  const config = getStatusConfig(r.status);
  const canCancel = CANCELLABLE_STATUS_SET.has(r.status);
  const canUpgrade = r.payment_type === "free" && (r.status === "confirmed" || r.status === "pending_pro_validation" || r.status === "requested");
  const hasQr = r.qr_code_token || ["confirmed", "deposit_paid"].includes(r.status);

  const dateStr = r.starts_at ? format(new Date(r.starts_at), "EEEE d MMMM yyyy 'à' HH:mm") : "";

  const handleFetchQr = async () => {
    setQrLoading(true);
    try {
      const res = await onFetchQr(r.id);
      setQrToken(res.qrCodeToken);
    } catch {
      // silently fail
    } finally {
      setQrLoading(false);
    }
  };

  const handleCancel = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      await onCancel(r.id, cancelReason || undefined);
      setShowCancel(false);
      onClose();
    } catch (e: any) {
      setActionError(e.message ?? "Erreur");
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpgrade = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      await onUpgrade(r.id);
      onClose();
    } catch (e: any) {
      setActionError(e.message ?? "Erreur");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {r.establishments?.name ?? "Réservation"}
            <Badge variant={config.variant} className="text-[10px]">
              {config.label}
            </Badge>
          </DialogTitle>
          {r.booking_reference && (
            <DialogDescription className="font-mono text-xs">
              Réf: {r.booking_reference}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-3">
          {/* Details */}
          <div className="bg-muted/30 rounded-lg p-3 space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <span className="capitalize">{dateStr}</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span>{r.party_size} {r.party_size > 1 ? "personnes" : "personne"}</span>
            </div>
            {r.stock_type && (
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span className="capitalize">{r.payment_type === "paid" ? "Réservation payante" : "Réservation gratuite"}</span>
              </div>
            )}
            {r.pro_custom_message && (
              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-md p-2 text-xs text-blue-800 dark:text-blue-300">
                <p className="font-medium mb-0.5">Message de l'établissement :</p>
                {r.pro_custom_message}
              </div>
            )}
          </div>

          {/* QR Code */}
          {hasQr && (
            <div className="text-center">
              {qrToken ? (
                <div className="bg-white p-4 rounded-lg inline-block border">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrToken)}`}
                    alt="QR Code"
                    className="w-44 h-44"
                  />
                  <p className="text-xs text-muted-foreground mt-2">Présentez ce code à l'arrivée</p>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={handleFetchQr} disabled={qrLoading}>
                  {qrLoading ? <Loader2 className="h-4 w-4 animate-spin me-1" /> : <QrCode className="h-4 w-4 me-1" />}
                  Afficher le QR Code
                </Button>
              )}
            </div>
          )}

          {/* Actions */}
          {actionError && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {actionError}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {canUpgrade && (
              <Button size="sm" variant="outline" onClick={handleUpgrade} disabled={actionLoading}>
                <ArrowUpCircle className="h-4 w-4 me-1" />
                Sécuriser ma réservation
              </Button>
            )}
            {canCancel && !showCancel && (
              <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600" onClick={() => setShowCancel(true)}>
                <XCircle className="h-4 w-4 me-1" />
                Annuler
              </Button>
            )}
          </div>

          {/* Cancel confirmation */}
          {showCancel && (
            <div className="bg-red-50/50 dark:bg-red-950/20 rounded-lg p-3 space-y-2 border border-red-200/50">
              <p className="text-sm font-medium text-red-700 dark:text-red-300">Confirmer l'annulation</p>
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Raison de l'annulation (optionnel)"
                className="text-sm"
                rows={2}
              />
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" onClick={handleCancel} disabled={actionLoading}>
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin me-1" /> : null}
                  Confirmer l'annulation
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowCancel(false)}>
                  Retour
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Score card
// =============================================================================

function ScoreCard({ className }: { className?: string }) {
  const { score, loading, error, fetch: fetchScore } = useMyScoreV2();

  useEffect(() => {
    fetchScore();
  }, [fetchScore]);

  if (loading) {
    return (
      <div className={cn("bg-card rounded-xl border p-4 flex items-center justify-center", className)}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!score) return null;

  const stars = scoreToStars(score.score);
  const fullStars = Math.floor(stars);
  const hasHalf = stars - fullStars >= 0.25;

  return (
    <div className={cn("bg-card rounded-xl border p-4 space-y-3", className)}>
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          Score de fiabilité
        </h4>
        <div className="flex items-center gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={cn(
                "h-4 w-4",
                i < fullStars
                  ? "text-yellow-500 fill-yellow-500"
                  : i === fullStars && hasHalf
                    ? "text-yellow-500 fill-yellow-500/50"
                    : "text-gray-300",
              )}
            />
          ))}
          <span className="text-sm font-semibold ms-1">{stars.toFixed(1)}</span>
        </div>
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        {score.breakdown && Object.entries(score.breakdown).map(([key, val]) => (
          <div key={key} className="flex justify-between text-muted-foreground">
            <span className="capitalize">{key.replace(/_/g, " ")}</span>
            <span className="font-medium tabular-nums">{val as number}</span>
          </div>
        ))}
      </div>

      {score.isSuspended && (
        <div className="bg-red-50 dark:bg-red-950/30 rounded-md p-2 text-xs text-red-600 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Votre compte est temporairement suspendu
            {score.suspendedUntil && ` jusqu'au ${format(new Date(score.suspendedUntil), "d MMM yyyy")}`}
          </span>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Quote list
// =============================================================================

function QuotesList({ className }: { className?: string }) {
  const { quotes, loading, error, fetchQuotes } = useQuotesV2();

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center py-8", className)}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!quotes.length) {
    return (
      <div className={cn("text-center py-8", className)}>
        <FileText className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">Aucune demande de devis</p>
      </div>
    );
  }

  const QUOTE_STATUS_LABELS: Record<string, string> = {
    submitted: "Envoyée",
    acknowledged: "Prise en compte",
    quote_sent: "Devis reçu",
    quote_accepted: "Accepté",
    quote_declined: "Décliné",
    expired: "Expiré",
  };

  return (
    <div className={cn("space-y-2", className)}>
      {quotes.map((q: any) => (
        <div key={q.id} className="bg-card rounded-xl border p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium text-sm">{q.establishments?.name ?? "Établissement"}</p>
              <p className="text-xs text-muted-foreground">
                {q.party_size} pers. · {q.event_type}
                {q.preferred_date && ` · ${q.preferred_date}`}
              </p>
            </div>
            <Badge variant="outline" className="text-[10px]">
              {QUOTE_STATUS_LABELS[q.status] ?? q.status}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Timer className="h-3 w-3" />
            {format(new Date(q.created_at), "d MMM yyyy")}
          </div>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export interface MyReservationsV2Props {
  className?: string;
}

export function MyReservationsV2({ className }: MyReservationsV2Props) {
  const [selectedReservation, setSelectedReservation] = useState<ReservationV2Row | null>(null);
  const resa = useMyReservationsV2();

  useEffect(() => {
    resa.fetch();
  }, []);

  // Split reservations
  const { upcoming, past, pending } = useMemo(() => {
    const now = new Date().toISOString();
    const terminalStatuses = new Set([
      "cancelled", "cancelled_user", "cancelled_pro", "cancelled_waitlist_expired",
      "refused", "expired", "consumed", "consumed_default", "no_show_confirmed",
    ]);
    const pendingStatuses = new Set(["requested", "pending_pro_validation", "waitlist", "on_hold", "deposit_requested"]);

    const upcoming: ReservationV2Row[] = [];
    const past: ReservationV2Row[] = [];
    const pending: ReservationV2Row[] = [];

    for (const r of resa.reservations) {
      if (pendingStatuses.has(r.status)) {
        pending.push(r);
      } else if (terminalStatuses.has(r.status) || (r.starts_at && r.starts_at < now)) {
        past.push(r);
      } else {
        upcoming.push(r);
      }
    }

    return { upcoming, past, pending };
  }, [resa.reservations]);

  return (
    <div className={cn("space-y-6", className)}>
      {/* Score card */}
      <ScoreCard />

      {/* Reservations tabs */}
      <Tabs defaultValue="upcoming" className="w-full">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="upcoming" className="text-xs">
            À venir
            {upcoming.length > 0 && (
              <span className="ms-1 bg-primary/10 text-primary rounded-full px-1.5 text-[10px] font-bold">{upcoming.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="pending" className="text-xs">
            En attente
            {pending.length > 0 && (
              <span className="ms-1 bg-yellow-100 text-yellow-700 rounded-full px-1.5 text-[10px] font-bold">{pending.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="past" className="text-xs">Passées</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-4 space-y-2">
          {resa.loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!resa.loading && upcoming.length === 0 && (
            <div className="text-center py-8">
              <CalendarDays className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">Aucune réservation à venir</p>
            </div>
          )}
          {upcoming.map((r) => (
            <ReservationCard key={r.id} reservation={r} onSelect={setSelectedReservation} />
          ))}
        </TabsContent>

        <TabsContent value="pending" className="mt-4 space-y-2">
          {pending.length === 0 && (
            <div className="text-center py-8">
              <Clock className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">Aucune réservation en attente</p>
            </div>
          )}
          {pending.map((r) => (
            <ReservationCard key={r.id} reservation={r} onSelect={setSelectedReservation} />
          ))}
        </TabsContent>

        <TabsContent value="past" className="mt-4 space-y-2">
          {past.length === 0 && (
            <div className="text-center py-8">
              <CheckCircle2 className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">Aucun historique</p>
            </div>
          )}
          {past.map((r) => (
            <ReservationCard key={r.id} reservation={r} onSelect={setSelectedReservation} />
          ))}
        </TabsContent>
      </Tabs>

      {/* Quotes section */}
      <div>
        <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          Demandes de devis
        </h4>
        <QuotesList />
      </div>

      {/* Detail dialog */}
      <ReservationDetailDialog
        reservation={selectedReservation}
        open={!!selectedReservation}
        onClose={() => setSelectedReservation(null)}
        onCancel={resa.cancel}
        onUpgrade={resa.upgrade}
        onModify={resa.modify}
        onFetchQr={resa.fetchQr}
      />
    </div>
  );
}
