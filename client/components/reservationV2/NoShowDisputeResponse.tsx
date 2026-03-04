/**
 * 4.3 — Page de réponse au no-show (client)
 *
 * Displayed when a pro has declared the client as no-show.
 * Client can either:
 *  - Confirm their absence ("Je confirme mon absence")
 *  - Dispute the claim ("Je conteste — j'étais bien présent(e)")
 *    with evidence upload capability
 */

import * as React from "react";
import { useState } from "react";
import { format } from "date-fns";
import {
  AlertTriangle, CheckCircle2, XCircle, Upload,
  Loader2, ShieldAlert, MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useNoShowDisputeV2 } from "@/hooks/useReservationV2";
import type { NoShowDisputeRow } from "../../../shared/reservationTypesV2";

// =============================================================================
// Types
// =============================================================================

export interface NoShowDisputeResponseProps {
  /** The no-show dispute data (fetched externally) */
  dispute: NoShowDisputeRow;
  /** Establishment name for display */
  establishmentName?: string;
  /** Reservation date for display */
  reservationDate?: string;
  /** Called after successful response */
  onCompleted?: (newStatus: string) => void;
  className?: string;
}

type ResponseChoice = null | "confirms_absence" | "disputes";

// =============================================================================
// Component
// =============================================================================

export function NoShowDisputeResponse({
  dispute,
  establishmentName,
  reservationDate,
  onCompleted,
  className,
}: NoShowDisputeResponseProps) {
  const [choice, setChoice] = useState<ResponseChoice>(null);
  const [explanation, setExplanation] = useState("");
  const [evidenceUrls, setEvidenceUrls] = useState<
    Array<{ url: string; type: string; description?: string }>
  >([]);
  const { loading, error, result, respond } = useNoShowDisputeV2();

  const deadline = dispute.client_response_deadline
    ? new Date(dispute.client_response_deadline)
    : null;
  const isExpired = deadline ? deadline < new Date() : false;

  const handleSubmit = async () => {
    if (!choice) return;

    const evidence = choice === "disputes" && evidenceUrls.length > 0 ? evidenceUrls : undefined;
    const res = await respond(dispute.id, choice, evidence);
    if (res) {
      onCompleted?.(res.newStatus);
    }
  };

  // Already responded
  if (result) {
    const confirmed = result.newStatus === "no_show_confirmed";
    return (
      <div className={cn("space-y-6 text-center", className)}>
        <div
          className={cn(
            "mx-auto w-16 h-16 rounded-full flex items-center justify-center",
            confirmed ? "bg-orange-100 dark:bg-orange-900/30" : "bg-blue-100 dark:bg-blue-900/30",
          )}
        >
          {confirmed ? (
            <CheckCircle2 className="h-8 w-8 text-orange-600" />
          ) : (
            <ShieldAlert className="h-8 w-8 text-blue-600" />
          )}
        </div>
        <div>
          <h3 className="text-lg font-bold">
            {confirmed ? "Absence confirmée" : "Contestation envoyée"}
          </h3>
          <p className="text-sm text-muted-foreground mt-2">
            {confirmed
              ? "Votre absence a été enregistrée. Elle sera prise en compte dans votre score de fiabilité."
              : "Votre contestation a été transmise pour arbitrage. Vous serez notifié(e) de la décision."}
          </p>
        </div>
      </div>
    );
  }

  // Expired
  if (isExpired) {
    return (
      <div className={cn("space-y-4 text-center", className)}>
        <div className="mx-auto w-16 h-16 bg-gray-100 dark:bg-gray-900/30 rounded-full flex items-center justify-center">
          <XCircle className="h-8 w-8 text-gray-500" />
        </div>
        <div>
          <h3 className="text-lg font-bold">Délai expiré</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Le délai de réponse est dépassé. L'absence a été confirmée automatiquement.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="mx-auto w-14 h-14 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
          <AlertTriangle className="h-7 w-7 text-orange-600" />
        </div>
        <h3 className="text-lg font-bold">Déclaration de no-show</h3>
        <p className="text-sm text-muted-foreground">
          L'établissement <span className="font-medium text-foreground">{establishmentName ?? "—"}</span> a
          déclaré que vous ne vous êtes pas présenté(e) à votre réservation
          {reservationDate && (
            <> du <span className="font-medium text-foreground">{reservationDate}</span></>
          )}
          .
        </p>
      </div>

      {/* Deadline */}
      {deadline && (
        <div className="text-center">
          <Badge variant="outline" className="text-xs">
            Répondez avant le {format(deadline, "d MMM yyyy 'à' HH:mm")}
          </Badge>
        </div>
      )}

      {/* Choice buttons */}
      {!choice && (
        <div className="space-y-3">
          <Button
            variant="outline"
            className="w-full h-auto py-4 text-start justify-start"
            onClick={() => setChoice("confirms_absence")}
          >
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-orange-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm">Je confirme mon absence</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Vous reconnaissez ne pas vous être présenté(e). Cela impactera votre score de fiabilité.
                </p>
              </div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full h-auto py-4 text-start justify-start"
            onClick={() => setChoice("disputes")}
          >
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm">Je conteste — j'étais bien présent(e)</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Votre contestation sera examinée par notre équipe. Vous pouvez fournir des preuves.
                </p>
              </div>
            </div>
          </Button>
        </div>
      )}

      {/* Confirms absence */}
      {choice === "confirms_absence" && (
        <div className="space-y-4">
          <div className="bg-orange-50/50 dark:bg-orange-950/20 rounded-xl p-4 border border-orange-200/50">
            <p className="text-sm text-orange-800 dark:text-orange-200">
              En confirmant votre absence, votre score de fiabilité sera impacté.
              Honorez vos prochaines réservations pour améliorer votre score.
            </p>
          </div>

          {error && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={loading} className="flex-1">
              {loading ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : null}
              Confirmer mon absence
            </Button>
            <Button variant="ghost" onClick={() => setChoice(null)} disabled={loading}>
              Retour
            </Button>
          </div>
        </div>
      )}

      {/* Disputes — with evidence form */}
      {choice === "disputes" && (
        <div className="space-y-4">
          <div className="bg-blue-50/50 dark:bg-blue-950/20 rounded-xl p-4 border border-blue-200/50">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              Décrivez les circonstances et fournissez toute preuve de votre présence
              (capture d'écran, photo, reçu, etc.)
            </p>
          </div>

          {/* Explanation */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Vos explications
            </Label>
            <Textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Décrivez les circonstances de votre visite…"
              rows={3}
              className="text-sm"
            />
          </div>

          {/* Evidence URLs (simplified — actual file upload would use a storage service) */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Preuves (optionnel)
            </Label>
            <div className="space-y-1">
              {evidenceUrls.map((e, i) => (
                <div key={i} className="flex items-center gap-2 text-xs bg-muted/30 rounded p-2">
                  <span className="flex-1 truncate">{e.description || e.url}</span>
                  <button
                    onClick={() => setEvidenceUrls((prev) => prev.filter((_, j) => j !== i))}
                    className="text-red-500 hover:text-red-600"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const url = prompt("URL de la preuve (photo, document)");
                if (url?.trim()) {
                  const desc = prompt("Description courte (optionnel)") ?? "";
                  setEvidenceUrls((prev) => [...prev, { url: url.trim(), type: "document", description: desc }]);
                }
              }}
            >
              <Upload className="h-3.5 w-3.5 me-1" />
              Ajouter une preuve
            </Button>
          </div>

          {error && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={loading} className="flex-1">
              {loading ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : null}
              Envoyer ma contestation
            </Button>
            <Button variant="ghost" onClick={() => setChoice(null)} disabled={loading}>
              Retour
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
