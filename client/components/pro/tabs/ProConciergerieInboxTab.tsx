import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Building2,
  Users,
  Calendar,
  MapPin,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProConciergerieRequest } from "@shared/conciergerieTypes";
import {
  listProConciergerieRequests,
  acceptProConciergerieRequest,
  refuseProConciergerieRequest,
} from "@/lib/conciergerie/api";

type Props = {
  establishmentId?: string;
};

export default function ProConciergerieInboxTab({ establishmentId }: Props) {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<ProConciergerieRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<"pending" | "accepted" | "refused">("pending");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listProConciergerieRequests({
        status: statusFilter,
        establishment_id: establishmentId,
      });
      setRequests(res.requests);
    } catch (e) {
      console.error("[pro-conciergerie] load error:", e);
    }
    setLoading(false);
  }, [statusFilter, establishmentId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Demandes Conciergerie</h2>
      </div>

      {/* Status filter */}
      <div className="flex gap-2">
        {(["pending", "accepted", "refused"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
              statusFilter === s
                ? "bg-primary text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {s === "pending" ? "En attente" : s === "accepted" ? "Acceptées" : "Refusées"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : requests.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <Building2 className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="font-medium text-slate-700">Aucune demande</p>
            <p className="text-sm text-slate-500 mt-1">
              {statusFilter === "pending"
                ? "Aucune demande de conciergerie en attente."
                : `Aucune demande ${statusFilter === "accepted" ? "acceptée" : "refusée"}.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <RequestCard key={req.id} request={req} onUpdate={load} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// RequestCard
// ============================================================================

function RequestCard({
  request,
  onUpdate,
}: {
  request: ProConciergerieRequest;
  onUpdate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [proposedPrice, setProposedPrice] = useState("");
  const [responseNote, setResponseNote] = useState("");

  const journey = request.step?.journey;

  const handleAccept = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      await acceptProConciergerieRequest(request.id, {
        proposed_price: proposedPrice ? Number(proposedPrice) : undefined,
        response_note: responseNote.trim() || undefined,
      });
      onUpdate();
    } catch (e: any) {
      setActionError(e.message);
    }
    setActionLoading(false);
  };

  const handleRefuse = async () => {
    if (!confirm("Refuser cette demande ?")) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await refuseProConciergerieRequest(request.id, {
        response_note: responseNote.trim() || undefined,
      });
      onUpdate();
    } catch (e: any) {
      setActionError(e.message);
    }
    setActionLoading(false);
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* Header */}
        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          className="w-full text-left p-4 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-start gap-3">
            <div className="p-2 bg-primary/10 rounded-lg shrink-0">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-semibold text-sm truncate">
                  {journey?.title || `Parcours du ${journey?.desired_date}`}
                </p>
                <RequestStatusBadge status={request.status} />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Building2 className="w-3 h-3" />
                  {request.concierge_name}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {journey?.client_name} · {journey?.party_size} pers.
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {journey?.desired_date}
                  {journey?.desired_time_start
                    ? ` à ${journey.desired_time_start}`
                    : ""}
                </span>
                {journey?.city && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {journey.city}
                  </span>
                )}
              </div>
            </div>
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
            )}
          </div>
        </button>

        {/* Expanded content */}
        {expanded && (
          <div className="border-t p-4 space-y-4 bg-slate-50/50">
            {/* Step details */}
            <div className="text-sm space-y-2">
              <div>
                <p className="text-xs font-semibold text-slate-500">
                  Étape {request.step?.step_order ?? "?"}
                  {request.step?.universe
                    ? ` — ${request.step.universe}`
                    : ""}
                </p>
                <p className="text-slate-700 mt-1">
                  {request.step?.description || "Pas de description"}
                </p>
              </div>

              {request.budget_hint && (
                <div>
                  <p className="text-xs text-slate-500">Budget indicatif</p>
                  <p className="font-medium">{request.budget_hint}</p>
                </div>
              )}

              {request.message && (
                <div>
                  <p className="text-xs text-slate-500">Message</p>
                  <p className="text-slate-700 italic">"{request.message}"</p>
                </div>
              )}

              {request.desired_time && (
                <div>
                  <p className="text-xs text-slate-500">Horaire souhaité</p>
                  <p className="font-medium">{request.desired_time}</p>
                </div>
              )}
            </div>

            {actionError && (
              <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">
                {actionError}
              </div>
            )}

            {/* Accept / Refuse actions (only for pending) */}
            {request.status === "pending" && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Prix proposé (MAD)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={proposedPrice}
                      onChange={(e) => setProposedPrice(e.target.value)}
                      placeholder="Ex: 500"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Note / commentaire</Label>
                    <Textarea
                      value={responseNote}
                      onChange={(e) => setResponseNote(e.target.value)}
                      placeholder="Détails, conditions..."
                      rows={1}
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={handleAccept}
                    disabled={actionLoading}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    {actionLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-1" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 mr-1" />
                    )}
                    Accepter
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleRefuse}
                    disabled={actionLoading}
                    className="flex-1"
                  >
                    <XCircle className="w-4 h-4 mr-1" />
                    Refuser
                  </Button>
                </div>
              </div>
            )}

            {/* Show response for already processed */}
            {request.status !== "pending" && (
              <div className="text-sm space-y-1">
                {request.proposed_price != null && (
                  <p>
                    <span className="text-slate-500">Prix proposé :</span>{" "}
                    <span className="font-medium">{request.proposed_price} MAD</span>
                  </p>
                )}
                {request.response_note && (
                  <p>
                    <span className="text-slate-500">Note :</span>{" "}
                    {request.response_note}
                  </p>
                )}
                {request.responded_at && (
                  <p className="text-xs text-slate-400">
                    Répondu le{" "}
                    {new Date(request.responded_at).toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RequestStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    pending: { label: "En attente", className: "bg-amber-100 text-amber-700" },
    accepted: { label: "Accepté", className: "bg-green-100 text-green-700" },
    refused: { label: "Refusé", className: "bg-red-100 text-red-600" },
    expired: { label: "Expiré", className: "bg-slate-200 text-slate-600" },
    superseded: { label: "Remplacé", className: "bg-slate-100 text-slate-500" },
  };
  const c = config[status] ?? { label: status, className: "bg-slate-100 text-slate-600" };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${c.className}`}>
      {c.label}
    </span>
  );
}
