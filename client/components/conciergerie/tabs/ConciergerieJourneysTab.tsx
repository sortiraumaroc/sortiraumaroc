import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Route,
  PlusCircle,
  Loader2,
  ChevronLeft,
  CheckCircle2,
  Clock,
  XCircle,
  Send,
  Eye,
  Trash2,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type {
  ConciergeProfile,
  JourneyListItem,
  JourneyWithSteps,
} from "@shared/conciergerieTypes";
import {
  listJourneys,
  getJourney,
  deleteJourney,
  sendJourneyRequests,
} from "@/lib/conciergerie/api";

type Props = {
  concierge: ConciergeProfile;
  onViewJourney: (id: string) => void;
  onNewJourney: () => void;
};

export default function ConciergerieJourneysTab({
  concierge,
  onViewJourney,
  onNewJourney,
}: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const journeyId = searchParams.get("journey");

  const [loading, setLoading] = useState(true);
  const [journeys, setJourneys] = useState<JourneyListItem[]>([]);
  const [total, setTotal] = useState(0);

  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<JourneyWithSteps | null>(null);

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Load list
  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listJourneys({ per_page: 50 });
      setJourneys(res.journeys);
      setTotal(res.total);
    } catch (e) {
      console.error("[conciergerie] Load journeys error:", e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // Load detail if journeyId present
  useEffect(() => {
    if (!journeyId) {
      setDetail(null);
      return;
    }

    setDetailLoading(true);
    getJourney(journeyId)
      .then(setDetail)
      .catch((e) => {
        console.error("[conciergerie] Load journey detail error:", e);
        setDetail(null);
      })
      .finally(() => setDetailLoading(false));
  }, [journeyId]);

  const handleBack = () => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.delete("journey");
      return p;
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce brouillon ?")) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await deleteJourney(id);
      handleBack();
      loadList();
    } catch (e: any) {
      setActionError(e.message);
    }
    setActionLoading(false);
  };

  const handleSend = async (id: string) => {
    if (!confirm("Envoyer les demandes aux établissements ?")) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await sendJourneyRequests(id);
      // Reload detail
      const updated = await getJourney(id);
      setDetail(updated);
      loadList();
    } catch (e: any) {
      setActionError(e.message);
    }
    setActionLoading(false);
  };

  // ---- Detail view ----
  if (journeyId) {
    if (detailLoading) {
      return (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      );
    }

    if (!detail) {
      return (
        <div className="text-center py-10">
          <p className="text-slate-500">Parcours non trouvé.</p>
          <Button variant="ghost" onClick={handleBack} className="mt-2">
            <ChevronLeft className="w-4 h-4 mr-1" /> Retour
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleBack}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-xl font-bold flex-1">
            {detail.title || `Parcours du ${detail.desired_date}`}
          </h2>
          <StatusBadge status={detail.status} />
        </div>

        {actionError && (
          <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">
            {actionError}
          </div>
        )}

        {/* Client info */}
        <Card>
          <CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-slate-500">Client</p>
              <p className="font-medium">{detail.client_name}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Personnes</p>
              <p className="font-medium">{detail.party_size}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Date</p>
              <p className="font-medium">{detail.desired_date}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Horaire</p>
              <p className="font-medium">
                {[detail.desired_time_start, detail.desired_time_end]
                  .filter(Boolean)
                  .join(" - ") || "—"}
              </p>
            </div>
            {detail.client_phone && (
              <div>
                <p className="text-xs text-slate-500">Téléphone</p>
                <p className="font-medium">{detail.client_phone}</p>
              </div>
            )}
            {detail.client_email && (
              <div>
                <p className="text-xs text-slate-500">Email</p>
                <p className="font-medium">{detail.client_email}</p>
              </div>
            )}
            {detail.city && (
              <div>
                <p className="text-xs text-slate-500">Ville</p>
                <p className="font-medium">{detail.city}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Steps */}
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">
            Étapes ({detail.steps.length})
          </h3>
          {detail.steps.map((step, i) => (
            <Card key={step.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                    {step.step_order}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {step.universe && (
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                          {step.universe}
                        </span>
                      )}
                      {step.category && (
                        <span className="text-xs text-slate-400">
                          {step.category}
                        </span>
                      )}
                      <StatusBadge status={step.status} />
                    </div>
                    <p className="text-sm text-slate-700">
                      {step.description || "Pas de description"}
                    </p>
                    {(step.budget_min || step.budget_max) && (
                      <p className="text-xs text-slate-500 mt-1">
                        Budget : {step.budget_min ?? "?"} - {step.budget_max ?? "?"} MAD
                      </p>
                    )}

                    {/* Requests */}
                    {step.requests.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <p className="text-xs font-semibold text-slate-500">
                          Demandes ({step.requests.length})
                        </p>
                        {step.requests.map((req) => (
                          <div
                            key={req.id}
                            className="flex items-center gap-2 text-sm p-2 rounded-md border bg-slate-50"
                          >
                            <RequestStatusIcon status={req.status} />
                            <span className="font-medium flex-1 truncate">
                              {req.establishment_name || "Établissement"}
                            </span>
                            <span className="text-xs text-slate-500">
                              {req.status === "accepted" && req.proposed_price
                                ? `${req.proposed_price} MAD`
                                : req.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Actions */}
        {detail.status === "draft" && (
          <div className="flex gap-3">
            <Button
              onClick={() => handleSend(detail.id)}
              disabled={actionLoading}
              className="flex-1"
            >
              {actionLoading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Envoyer les demandes
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleDelete(detail.id)}
              disabled={actionLoading}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        )}

        {detail.client_notes && (
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-slate-500 mb-1">Notes client</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">
                {detail.client_notes}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // ---- List view ----
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Mes parcours</h2>
        <Button onClick={onNewJourney} size="sm">
          <PlusCircle className="w-4 h-4 mr-1" /> Nouveau
        </Button>
      </div>

      {journeys.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <Route className="w-12 h-12 mx-auto mb-4 text-slate-300" />
            <p className="font-semibold text-slate-700">Aucun parcours</p>
            <p className="text-sm text-slate-500 mt-1 mb-4">
              Créez votre premier parcours d'expérience pour vos clients.
            </p>
            <Button onClick={onNewJourney}>
              <PlusCircle className="w-4 h-4 mr-1" /> Créer un parcours
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {journeys.map((j) => (
            <Card
              key={j.id}
              className="cursor-pointer hover:border-primary/30 transition-colors"
              onClick={() => onViewJourney(j.id)}
            >
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-sm truncate">
                      {j.title || `Parcours du ${j.desired_date}`}
                    </p>
                    <StatusBadge status={j.status} />
                  </div>
                  <p className="text-xs text-slate-500">
                    {j.client_name} · {j.party_size} pers. · {j.desired_date}
                    {j.city ? ` · ${j.city}` : ""}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {j.steps_count} étape{j.steps_count > 1 ? "s" : ""}
                    {j.accepted_steps_count > 0
                      ? ` · ${j.accepted_steps_count} acceptée${j.accepted_steps_count > 1 ? "s" : ""}`
                      : ""}
                  </p>
                </div>
                <Eye className="w-4 h-4 text-slate-400 shrink-0" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    draft: { label: "Brouillon", className: "bg-slate-100 text-slate-600" },
    pending: { label: "En attente", className: "bg-amber-100 text-amber-700" },
    requesting: { label: "En cours", className: "bg-amber-100 text-amber-700" },
    partially_accepted: { label: "Partiel", className: "bg-blue-100 text-blue-700" },
    accepted: { label: "Accepté", className: "bg-green-100 text-green-700" },
    confirmed: { label: "Confirmé", className: "bg-green-100 text-green-700" },
    refused: { label: "Refusé", className: "bg-red-100 text-red-600" },
    refused_all: { label: "Tous refusés", className: "bg-red-100 text-red-600" },
    superseded: { label: "Remplacé", className: "bg-slate-100 text-slate-500" },
    expired: { label: "Expiré", className: "bg-slate-200 text-slate-600" },
    cancelled: { label: "Annulé", className: "bg-red-100 text-red-600" },
    completed: { label: "Terminé", className: "bg-slate-200 text-slate-700" },
  };
  const c = config[status] ?? { label: status, className: "bg-slate-100 text-slate-600" };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${c.className}`}>
      {c.label}
    </span>
  );
}

function RequestStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "accepted":
      return <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />;
    case "refused":
      return <XCircle className="w-4 h-4 text-red-400 shrink-0" />;
    case "superseded":
      return <XCircle className="w-4 h-4 text-slate-400 shrink-0" />;
    case "expired":
      return <Clock className="w-4 h-4 text-slate-400 shrink-0" />;
    default:
      return <Clock className="w-4 h-4 text-amber-500 shrink-0" />;
  }
}
