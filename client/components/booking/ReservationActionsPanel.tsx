import { FileText, XCircle } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { BookingRecord } from "@/lib/userData";

type ReservationBreakdown = {
  unitMad: number | null;
  partySize: number | null;
  totalMad: number | null;
};

export type ReservationCancellationPolicy = {
  canCancel: boolean;
  freeUntilIso: string | null;
  freeUntilLabel: string;
  freeUntilHours: number;
  penaltyPercent: number;
  penaltyMad: number | null;
  summary: string;
  policyText: string;
};

function recordFieldString(obj: Record<string, unknown> | null, key: string): string | null {
  if (!obj) return null;
  const v = obj[key];
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed ? trimmed : null;
}

function recordFieldNumber(obj: Record<string, unknown> | null, key: string): number | null {
  if (!obj) return null;
  const v = obj[key];
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

export function ReservationActionsPanel(props: {
  booking: BookingRecord;
  breakdown: ReservationBreakdown;
  past: boolean;
  cancellationPolicy: ReservationCancellationPolicy;

  requestedChange: Record<string, unknown> | null;
  proposedChange: Record<string, unknown> | null;
  modificationRequested: boolean;

  modSaving: boolean;
  cancelSaving: boolean;

  formatDateTime: (iso: string) => string;
  formatMoney: (amount: number, currency: string) => string;

  onOpenChangeRequest: () => void;
  onCancelChangeRequest: () => void;
  onAcceptProposedChange: () => void;
  onDeclineProposedChange: () => void;
  onRequestCancellation: () => void;
}) {
  const proposedStartsAt = recordFieldString(props.proposedChange, "starts_at");

  const requestedStartsAt = recordFieldString(props.requestedChange, "starts_at");
  const requestedPartySize = recordFieldNumber(props.requestedChange, "party_size");

  const hasRequestedChange = Boolean(requestedStartsAt || requestedPartySize != null || props.modificationRequested);
  const hasProposedChange = Boolean(proposedStartsAt);

  const finalStatuses = new Set(["cancelled", "cancelled_user", "cancelled_pro", "noshow"]);
  const isFinal = finalStatuses.has(String(props.booking.status ?? "").trim());

  const canRequestCancellation = !props.past && !isFinal && props.cancellationPolicy.canCancel;

  const isPaid = props.booking.payment?.status === "paid";
  const guaranteeLabel = isPaid ? "garantie" : "non garantie";
  const paymentLabel = isPaid ? "payée" : "non payée";

  const canRequestChange = !hasRequestedChange && !hasProposedChange;

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="text-sm font-bold text-foreground">Actions sur votre réservation</div>

      <div className="mt-2 text-sm text-slate-600 space-y-1">
        <div>
          Statut : <span className="font-semibold text-foreground">{guaranteeLabel}</span>
        </div>
        <div>
          Paiement : <span className="font-semibold text-foreground">{paymentLabel}</span>
        </div>
        <div>
          Annulation gratuite jusqu’à <span className="font-semibold text-foreground">{props.cancellationPolicy.freeUntilHours}h</span> avant.
        </div>
      </div>

      {hasProposedChange ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-sm font-bold text-foreground">Proposition d’horaire</div>
          <div className="mt-2 text-sm text-slate-700">
            L’établissement propose : <span className="font-semibold text-foreground">{props.formatDateTime(proposedStartsAt as string)}</span>
          </div>
          <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:justify-end">
            <Button variant="outline" disabled={props.modSaving} onClick={props.onDeclineProposedChange}>
              Refuser
            </Button>
            <Button className="bg-primary hover:bg-primary/90 text-white" disabled={props.modSaving} onClick={props.onAcceptProposedChange}>
              Accepter
            </Button>
          </div>
        </div>
      ) : hasRequestedChange ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-sm font-bold text-foreground">Modification en attente</div>
          <div className="mt-2 text-sm text-slate-700">
            Votre demande de modification est en cours de traitement.
            {requestedStartsAt || requestedPartySize != null ? (
              <div className="mt-2 space-y-1">
                {requestedStartsAt ? (
                  <div>
                    Date/heure demandée : <span className="font-semibold text-foreground">{props.formatDateTime(requestedStartsAt)}</span>
                  </div>
                ) : null}
                {requestedPartySize != null ? (
                  <div>
                    Personnes demandées : <span className="font-semibold text-foreground">{Math.max(1, Math.round(requestedPartySize))}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:justify-end">
            <Button variant="outline" disabled={props.modSaving} onClick={props.onCancelChangeRequest}>
              Annuler la demande
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Button
          className="bg-primary hover:bg-primary/90 text-white gap-2 w-full justify-center"
          disabled={props.modSaving || !canRequestChange}
          onClick={props.onOpenChangeRequest}
        >
          <FileText className="w-4 h-4" />
          Demander un changement
        </Button>

        {canRequestCancellation ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="gap-2 w-full justify-center" disabled={props.cancelSaving || props.modSaving}>
                <XCircle className="w-4 h-4" />
                Demander une annulation
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmer l’annulation</AlertDialogTitle>
                <AlertDialogDescription>
                  <div className="space-y-3">
                    <div className="text-sm text-slate-800">
                      <div className="font-semibold text-slate-900">{props.booking.title}</div>
                      <div>
                        {props.formatDateTime(props.booking.dateIso)}
                        {typeof props.booking.partySize === "number" ? ` · ${Math.max(1, Math.round(props.booking.partySize))} pers.` : ""}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Statut : {guaranteeLabel}
                        {typeof props.breakdown.totalMad === "number" && Number.isFinite(props.breakdown.totalMad)
                          ? ` · Montant payé : ${props.formatMoney(props.breakdown.totalMad, "MAD")}`
                          : ""}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                      <div>Annulation gratuite jusqu’à {props.cancellationPolicy.freeUntilLabel}.</div>
                      <div className="mt-1">À partir de cette limite : retenue de {props.cancellationPolicy.penaltyPercent}%.</div>
                      {props.cancellationPolicy.penaltyMad != null ? (
                        <div className="mt-1 font-semibold">Si vous annulez maintenant, la retenue estimée est de {props.cancellationPolicy.penaltyMad} Dhs.</div>
                      ) : null}
                      {props.cancellationPolicy.policyText ? (
                        <div className="mt-2 text-slate-600 whitespace-pre-wrap">{props.cancellationPolicy.policyText}</div>
                      ) : null}
                    </div>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Retour</AlertDialogCancel>
                <AlertDialogAction disabled={props.cancelSaving || props.modSaving} onClick={props.onRequestCancellation}>
                  Confirmer l’annulation
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button variant="outline" className="gap-2 w-full justify-center" disabled>
            <XCircle className="w-4 h-4" />
            Demander une annulation
          </Button>
        )}
      </div>

      <div className="mt-3 text-xs text-slate-500 whitespace-pre-wrap">{props.cancellationPolicy.policyText}</div>
    </div>
  );
}
