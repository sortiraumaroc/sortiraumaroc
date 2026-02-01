import { useState } from "react";
import { ChevronDown, ChevronUp, Copy, History } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import {
  getClientRiskScore,
  getGuestInfo,
  getPaymentBadge,
  getRiskBadge,
  getRiskLevel,
  getStatusBadges,
  isGuaranteedReservation,
} from "@/components/pro/reservations/reservationHelpers";
import { ReservationTimeline } from "@/components/pro/reservations/ReservationTimeline";
import type { ProSlot, Reservation } from "@/lib/pro/types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function formatLocal(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return String(iso);
  return d.toLocaleString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

async function copyToClipboard(text: string): Promise<void> {
  const value = String(text ?? "").trim();
  if (!value) return;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.top = "0";
      ta.style.left = "0";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }

    toast({ title: "Copié", description: value });
  } catch {
    toast({ title: "Impossible", description: "Copie non autorisée sur ce navigateur." });
  }
}

function pickWaitlistTimestamps(meta: Record<string, unknown> | null | undefined): {
  promotedAt: string | null;
  offerAcceptedAt: string | null;
  offerRefusedAt: string | null;
} {
  if (!isRecord(meta)) return { promotedAt: null, offerAcceptedAt: null, offerRefusedAt: null };

  const promotedAt = typeof meta.waitlist_promoted_at === "string" ? meta.waitlist_promoted_at : null;
  const offerAcceptedAt = typeof meta.waitlist_offer_accepted_at === "string" ? meta.waitlist_offer_accepted_at : null;
  const offerRefusedAt = typeof meta.waitlist_offer_refused_at === "string" ? meta.waitlist_offer_refused_at : null;

  return { promotedAt, offerAcceptedAt, offerRefusedAt };
}

function InfoRow(props: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[170px_1fr] gap-1 sm:gap-3 py-2 border-b border-slate-100 last:border-b-0">
      <div className="text-xs font-semibold text-slate-500">{props.label}</div>
      <div className={props.mono ? "font-mono text-sm text-slate-900 break-all" : "text-sm text-slate-900 break-words"}>{props.value}</div>
    </div>
  );
}

export type WaitlistInsight = {
  count: number;
  position: number | null;
};

export function ProReservationDetailsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: Reservation | null;
  slot: ProSlot | null;
  waitlist: WaitlistInsight | null;
  establishmentId?: string;
}) {
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const r = props.reservation;
  const slot = props.slot;

  // Platform mode for conditional features
  const { isCommercialMode } = usePlatformSettings();
  const showPaymentFeatures = isCommercialMode();

  const statusBadges = r ? getStatusBadges(r) : [];
  const guest = r ? getGuestInfo(r) : null;
  const riskScore = r ? getClientRiskScore(r) : 0;
  const riskBadge = r ? getRiskBadge(riskScore) : null;
  const paymentBadge = r && showPaymentFeatures ? getPaymentBadge(r.payment_status ?? "pending") : null;

  const needsGuarantee = r ? getRiskLevel(riskScore) === "sensitive" && !isGuaranteedReservation(r) : false;

  const remaining = slot ? (slot as unknown as { remaining_capacity?: number | null }).remaining_capacity : null;
  const used = typeof remaining === "number" && Number.isFinite(remaining) ? Math.max(0, slot ? slot.capacity - remaining : 0) : null;

  const waitlistMeta = r ? pickWaitlistTimestamps(r.meta) : { promotedAt: null, offerAcceptedAt: null, offerRefusedAt: null };

  const waitlistSummary = (() => {
    if (!r) return null;
    const wl = props.waitlist;
    const shouldShow = r.status === "waitlist" || (wl?.count ?? 0) > 0 || r.is_from_waitlist;
    if (!shouldShow) return null;

    const count = wl?.count ?? 0;
    const position = wl?.position;

    return { count, position };
  })();

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle>Détail réservation</DialogTitle>
              <DialogDescription className="mt-1">
                Informations réservation, créneau et liste d’attente (WL).
              </DialogDescription>
            </div>

            {r ? (
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => {
                  void copyToClipboard(r.id);
                }}
              >
                <Copy className="h-4 w-4" />
                Copier l’ID
              </Button>
            ) : null}
          </div>
        </DialogHeader>

        {!r ? (
          <div className="text-sm text-slate-600">Aucune réservation sélectionnée.</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-500">Référence</div>
                  <div className="font-mono text-sm text-slate-900 break-all">{r.booking_reference ?? "—"}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2 justify-start sm:justify-end">
                  {statusBadges.map((b) => (
                    <Badge key={b.label} className={`${b.cls} whitespace-nowrap`} title={b.title}>
                      {b.label}
                    </Badge>
                  ))}
                  {paymentBadge ? <Badge className={`${paymentBadge.cls} whitespace-nowrap`}>{paymentBadge.label}</Badge> : null}
                  {riskBadge ? <Badge className={`${riskBadge.cls} whitespace-nowrap`}>{riskBadge.label}</Badge> : null}
                  {needsGuarantee ? (
                    <Badge className="bg-red-50 text-red-700 border-red-200 whitespace-nowrap">Garantie obligatoire</Badge>
                  ) : null}
                  {r.checked_in_at ? <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 whitespace-nowrap">Présent</Badge> : null}
                  {r.is_from_waitlist ? (
                    <Badge className="bg-blue-50 text-blue-700 border-blue-200 whitespace-nowrap">Depuis liste d'attente</Badge>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="px-4 py-3 border-b border-slate-200 text-sm font-semibold text-slate-900">Client</div>
              <div className="px-4">
                <InfoRow label="Nom" value={guest?.displayName ?? "—"} />
                <InfoRow label="Téléphone" value={guest?.phone ?? "—"} />
                <InfoRow label="Commentaire" value={guest?.comment ?? "—"} />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="px-4 py-3 border-b border-slate-200 text-sm font-semibold text-slate-900">Réservation</div>
              <div className="px-4">
                <InfoRow label="Date/heure" value={formatLocal(r.starts_at)} />
                <InfoRow label="Fin" value={formatLocal(r.ends_at)} />
                <InfoRow label="Nb personnes" value={typeof r.party_size === "number" ? r.party_size : "—"} />
                <InfoRow label="Créneau (slot_id)" value={r.slot_id ?? "—"} mono />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="px-4 py-3 border-b border-slate-200 text-sm font-semibold text-slate-900">Créneau</div>
              <div className="px-4">
                <InfoRow label="Début" value={slot ? formatLocal(slot.starts_at) : "—"} />
                <InfoRow label="Fin" value={slot ? formatLocal(slot.ends_at) : "—"} />
                <InfoRow label="Service" value={slot?.service_label || "Auto"} />
                <InfoRow label="Capacité" value={slot ? slot.capacity : "—"} />
                <InfoRow label="Occupé" value={used == null ? "—" : used} />
                <InfoRow label="Restant" value={typeof remaining === "number" ? remaining : "—"} />
              </div>
            </div>

            {waitlistSummary ? (
              <div className="rounded-lg border border-slate-200 bg-white">
                <div className="px-4 py-3 border-b border-slate-200 text-sm font-semibold text-slate-900">Liste d'attente (WL)</div>
                <div className="px-4">
                  <InfoRow
                    label="Indicateur WL"
                    value={
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-blue-50 text-blue-700 border-blue-200 whitespace-nowrap">WL</Badge>
                        <div className="text-sm text-slate-900">
                          {waitlistSummary.count ? `${waitlistSummary.count} en attente sur ce créneau` : "Aucune demande en attente sur ce créneau"}
                          {waitlistSummary.position ? ` • Position ${waitlistSummary.position}/${waitlistSummary.count}` : null}
                        </div>
                      </div>
                    }
                  />
                  {typeof remaining === "number" && remaining > 0 ? (
                    <InfoRow
                      label="Alerte"
                      value={<span className="text-sm text-amber-700">Places libres détectées (restant: {remaining}). Vous pouvez accepter une demande WL.</span>}
                    />
                  ) : null}
                  {r.is_from_waitlist ? (
                    <InfoRow label="Promue depuis WL" value={waitlistMeta.promotedAt ? formatLocal(waitlistMeta.promotedAt) : "—"} />
                  ) : null}
                  {waitlistMeta.offerAcceptedAt ? (
                    <InfoRow label="Offre acceptée" value={formatLocal(waitlistMeta.offerAcceptedAt)} />
                  ) : null}
                  {waitlistMeta.offerRefusedAt ? (
                    <InfoRow label="Offre refusée" value={formatLocal(waitlistMeta.offerRefusedAt)} />
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* Historique / Timeline */}
            {props.establishmentId && r ? (
              <div className="rounded-lg border border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => setHistoryExpanded(!historyExpanded)}
                  className="w-full px-4 py-3 border-b border-slate-200 flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-slate-500" />
                    <span className="text-sm font-semibold text-slate-900">Historique</span>
                  </div>
                  {historyExpanded ? (
                    <ChevronUp className="w-4 h-4 text-slate-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-500" />
                  )}
                </button>
                {historyExpanded && (
                  <div className="px-4 py-4">
                    <ReservationTimeline
                      establishmentId={props.establishmentId}
                      reservationId={r.id}
                    />
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
