/**
 * ProAmbassadorTab — Dashboard Pro Programme Ambassadeurs
 *
 * 5 onglets :
 *   1. Mon programme — création/édition + toggle actif
 *   2. Candidatures — liste filtrable avec Accept/Reject
 *   3. Conversions — confirmations de présence
 *   4. Récompenses — suivi et consommation
 *   5. Statistiques — KPIs + top ambassadeurs
 */

import React, { useState, useCallback, useEffect } from "react";
import {
  Award, BarChart3, Check, ChevronDown, Clock, Gift, Loader2,
  Plus, Settings, ShieldAlert, ThumbsDown, ThumbsUp, TrendingUp,
  Users, X, QrCode, Eye,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  getAmbassadorProgram,
  createAmbassadorProgram,
  updateAmbassadorProgram,
  activateAmbassadorProgram,
  deactivateAmbassadorProgram,
  listAmbassadorApplications,
  reviewAmbassadorApplication,
  listAmbassadorConversions,
  confirmAmbassadorConversion,
  listAmbassadorRewards,
  claimAmbassadorReward,
  getAmbassadorStats,
  type AmbassadorProgram,
  type AmbassadorQuickStats,
  type AmbassadorApplication,
  type AmbassadorConversion,
  type AmbassadorReward,
  type AmbassadorDetailedStats,
  type CreateProgramInput,
} from "@/lib/ambassadorProApi";

// =============================================================================
// TYPES
// =============================================================================

type AmbassadorTab = "program" | "applications" | "conversions" | "rewards" | "stats";

const AMBASSADOR_TABS: Array<{ id: AmbassadorTab; label: string; icon: typeof TrendingUp }> = [
  { id: "program", label: "Mon programme", icon: Settings },
  { id: "applications", label: "Candidatures", icon: Users },
  { id: "conversions", label: "Conversions", icon: TrendingUp },
  { id: "rewards", label: "Récompenses", icon: Gift },
  { id: "stats", label: "Statistiques", icon: BarChart3 },
];

type Props = {
  establishmentId: string;
  establishmentName: string;
  role: string;
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ProAmbassadorTab({ establishmentId, establishmentName, role }: Props) {
  const canEdit = ["owner", "manager", "marketing"].includes(role);

  // Tab state
  const [tab, setTab] = useState<AmbassadorTab>("program");

  // Data state
  const [program, setProgram] = useState<AmbassadorProgram | null>(null);
  const [quickStats, setQuickStats] = useState<AmbassadorQuickStats | null>(null);
  const [applications, setApplications] = useState<AmbassadorApplication[]>([]);
  const [conversions, setConversions] = useState<AmbassadorConversion[]>([]);
  const [rewards, setRewards] = useState<AmbassadorReward[]>([]);
  const [detailedStats, setDetailedStats] = useState<AmbassadorDetailedStats["stats"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Filters
  const [appFilter, setAppFilter] = useState<string>("all");
  const [convFilter, setConvFilter] = useState<string>("all");
  const [rewardFilter, setRewardFilter] = useState<string>("all");

  // Load all data
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [progRes, appsRes, convsRes, rewsRes, statsRes] = await Promise.all([
        getAmbassadorProgram(establishmentId),
        listAmbassadorApplications(establishmentId, { limit: 50 }),
        listAmbassadorConversions(establishmentId, { limit: 50 }),
        listAmbassadorRewards(establishmentId, { limit: 50 }),
        getAmbassadorStats(establishmentId),
      ]);
      setProgram(progRes.program);
      setQuickStats(progRes.stats);
      setApplications(appsRes.applications ?? []);
      setConversions(convsRes.conversions ?? []);
      setRewards(rewsRes.rewards ?? []);
      setDetailedStats(statsRes.stats ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [establishmentId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Auto-clear action message
  useEffect(() => {
    if (!actionMsg) return;
    const t = setTimeout(() => setActionMsg(null), 5000);
    return () => clearTimeout(t);
  }, [actionMsg]);

  const pendingApps = applications.filter((a) => a.status === "pending").length;
  const pendingConvs = conversions.filter((c) => c.status === "pending").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ms-2 text-slate-600">Chargement ambassadeurs...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Gift className="w-7 h-7 text-primary" />
            Programme Ambassadeurs
          </h2>
          <p className="text-slate-600 mt-1">
            Recrutez des ambassadeurs et récompensez-les pour chaque réservation générée
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
      )}
      {actionMsg && (
        <div className={cn(
          "px-4 py-3 rounded-lg border text-sm",
          actionMsg.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"
        )}>
          {actionMsg.text}
        </div>
      )}

      {/* Pill tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {AMBASSADOR_TABS.map((t) => {
          const Icon = t.icon;
          let label = t.label;
          if (t.id === "applications" && pendingApps > 0) label += ` (${pendingApps})`;
          if (t.id === "conversions" && pendingConvs > 0) label += ` (${pendingConvs})`;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "shrink-0 h-9 rounded-full px-4 text-sm font-semibold border transition flex items-center gap-1.5",
                tab === t.id
                  ? "bg-[#a3001d] text-white border-[#a3001d]"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          );
        })}
      </div>

      {/* ==================== MON PROGRAMME ==================== */}
      {tab === "program" && (
        <ProgramSection
          program={program}
          quickStats={quickStats}
          establishmentId={establishmentId}
          canEdit={canEdit}
          onRefresh={loadData}
          setActionMsg={setActionMsg}
        />
      )}

      {/* ==================== CANDIDATURES ==================== */}
      {tab === "applications" && (
        <ApplicationsSection
          applications={applications}
          filter={appFilter}
          setFilter={setAppFilter}
          establishmentId={establishmentId}
          onRefresh={loadData}
          setActionMsg={setActionMsg}
        />
      )}

      {/* ==================== CONVERSIONS ==================== */}
      {tab === "conversions" && (
        <ConversionsSection
          conversions={conversions}
          filter={convFilter}
          setFilter={setConvFilter}
          establishmentId={establishmentId}
          onRefresh={loadData}
          setActionMsg={setActionMsg}
        />
      )}

      {/* ==================== RÉCOMPENSES ==================== */}
      {tab === "rewards" && (
        <RewardsSection
          rewards={rewards}
          filter={rewardFilter}
          setFilter={setRewardFilter}
          establishmentId={establishmentId}
          onRefresh={loadData}
          setActionMsg={setActionMsg}
        />
      )}

      {/* ==================== STATISTIQUES ==================== */}
      {tab === "stats" && (
        <StatsSection stats={detailedStats} />
      )}
    </div>
  );
}

// =============================================================================
// PROGRAM SECTION (Create / Edit / Toggle)
// =============================================================================

function ProgramSection({
  program,
  quickStats,
  establishmentId,
  canEdit,
  onRefresh,
  setActionMsg,
}: {
  program: AmbassadorProgram | null;
  quickStats: AmbassadorQuickStats | null;
  establishmentId: string;
  canEdit: boolean;
  onRefresh: () => Promise<void>;
  setActionMsg: (m: { type: "success" | "error"; text: string }) => void;
}) {
  const [editing, setEditing] = useState(!program);
  const [saving, setSaving] = useState(false);

  // Form state
  const [rewardDesc, setRewardDesc] = useState(program?.reward_description ?? "");
  const [convsRequired, setConvsRequired] = useState(program?.conversions_required ?? 5);
  const [validityDays, setValidityDays] = useState(program?.validity_days ?? 30);
  const [maxBeneficiaries, setMaxBeneficiaries] = useState<number | "">(program?.max_beneficiaries_per_month ?? "");
  const [confirmMode, setConfirmMode] = useState<"manual" | "qr">(program?.confirmation_mode ?? "manual");

  const handleSave = async () => {
    if (!rewardDesc.trim()) {
      setActionMsg({ type: "error", text: "La description de la récompense est requise" });
      return;
    }
    setSaving(true);
    try {
      const input: CreateProgramInput = {
        reward_description: rewardDesc.trim(),
        conversions_required: convsRequired,
        validity_days: validityDays,
        max_beneficiaries_per_month: maxBeneficiaries === "" ? null : maxBeneficiaries,
        confirmation_mode: confirmMode,
      };
      if (program) {
        await updateAmbassadorProgram(establishmentId, program.id, input);
        setActionMsg({ type: "success", text: "Programme mis à jour" });
      } else {
        await createAmbassadorProgram(establishmentId, input);
        setActionMsg({ type: "success", text: "Programme créé avec succès !" });
      }
      setEditing(false);
      await onRefresh();
    } catch (e) {
      setActionMsg({ type: "error", text: e instanceof Error ? e.message : "Erreur" });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!program) return;
    setSaving(true);
    try {
      if (program.is_active) {
        await deactivateAmbassadorProgram(establishmentId, program.id);
        setActionMsg({ type: "success", text: "Programme désactivé" });
      } else {
        await activateAmbassadorProgram(establishmentId, program.id);
        setActionMsg({ type: "success", text: "Programme activé" });
      }
      await onRefresh();
    } catch (e) {
      setActionMsg({ type: "error", text: e instanceof Error ? e.message : "Erreur" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Quick stats cards */}
      {quickStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-slate-500 font-medium">Ambassadeurs actifs</p>
              <p className="text-2xl font-bold">{quickStats.total_ambassadors}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-slate-500 font-medium">Candidatures en attente</p>
              <p className="text-2xl font-bold text-amber-600">{quickStats.pending_applications}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-slate-500 font-medium">Conversions ce mois</p>
              <p className="text-2xl font-bold text-emerald-600">{quickStats.conversions_this_month}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-slate-500 font-medium">Récompenses actives</p>
              <p className="text-2xl font-bold text-purple-600">{quickStats.active_rewards}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Program config card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">
              {program ? "Configuration du programme" : "Créer un programme"}
            </CardTitle>
            <CardDescription>
              {program
                ? "Paramètres de votre programme ambassadeur"
                : "Définissez votre récompense et les conditions pour la débloquer"}
            </CardDescription>
          </div>
          {program && canEdit && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600">
                  {program.is_active ? "Actif" : "Inactif"}
                </span>
                <Switch
                  checked={program.is_active}
                  onCheckedChange={handleToggleActive}
                  disabled={saving}
                />
              </div>
              {!editing && (
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  Modifier
                </Button>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {editing ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="reward_desc">Description de la récompense *</Label>
                <Textarea
                  id="reward_desc"
                  value={rewardDesc}
                  onChange={(e) => setRewardDesc(e.target.value)}
                  placeholder="Ex: Un dîner pour 2 offert"
                  rows={2}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="convs_req">Conversions nécessaires</Label>
                  <Input
                    id="convs_req"
                    type="number"
                    min={1}
                    max={100}
                    value={convsRequired}
                    onChange={(e) => setConvsRequired(Number(e.target.value))}
                    className="mt-1"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Nombre de réservations confirmées pour débloquer la récompense
                  </p>
                </div>
                <div>
                  <Label htmlFor="validity">Validité (jours)</Label>
                  <Input
                    id="validity"
                    type="number"
                    min={1}
                    max={365}
                    value={validityDays}
                    onChange={(e) => setValidityDays(Number(e.target.value))}
                    className="mt-1"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Durée pour utiliser la récompense une fois débloquée
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="max_benef">Max bénéficiaires / mois</Label>
                  <Input
                    id="max_benef"
                    type="number"
                    min={1}
                    value={maxBeneficiaries}
                    onChange={(e) => setMaxBeneficiaries(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="Illimité"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Mode de confirmation</Label>
                  <Select value={confirmMode} onValueChange={(v) => setConfirmMode(v as "manual" | "qr")}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manuel (depuis le dashboard)</SelectItem>
                      <SelectItem value="qr">QR Code (scan à l'accueil)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {program ? "Enregistrer" : "Créer le programme"}
                </Button>
                {program && (
                  <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                    Annuler
                  </Button>
                )}
              </div>
            </div>
          ) : program ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500 font-medium">Récompense</p>
                  <p className="font-semibold">{program.reward_description}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium">Conversions requises</p>
                  <p className="font-semibold">{program.conversions_required}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium">Validité récompense</p>
                  <p className="font-semibold">{program.validity_days} jours</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium">Mode confirmation</p>
                  <p className="font-semibold flex items-center gap-1">
                    {program.confirmation_mode === "qr" ? (
                      <><QrCode className="h-4 w-4" /> QR Code</>
                    ) : (
                      <><Eye className="h-4 w-4" /> Manuel</>
                    )}
                  </p>
                </div>
                {program.max_beneficiaries_per_month && (
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Max bénéficiaires / mois</p>
                    <p className="font-semibold">{program.max_beneficiaries_per_month}</p>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// APPLICATIONS SECTION
// =============================================================================

function ApplicationsSection({
  applications,
  filter,
  setFilter,
  establishmentId,
  onRefresh,
  setActionMsg,
}: {
  applications: AmbassadorApplication[];
  filter: string;
  setFilter: (f: string) => void;
  establishmentId: string;
  onRefresh: () => Promise<void>;
  setActionMsg: (m: { type: "success" | "error"; text: string }) => void;
}) {
  const [reviewDialog, setReviewDialog] = useState<{ app: AmbassadorApplication; action: "accepted" | "rejected" } | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [acting, setActing] = useState(false);

  const filtered = filter === "all" ? applications : applications.filter((a) => a.status === filter);

  const handleReview = async () => {
    if (!reviewDialog) return;
    setActing(true);
    try {
      await reviewAmbassadorApplication(establishmentId, reviewDialog.app.id, {
        status: reviewDialog.action,
        rejection_reason: reviewDialog.action === "rejected" ? rejectionReason : undefined,
      });
      setActionMsg({
        type: "success",
        text: reviewDialog.action === "accepted"
          ? `Candidature de ${reviewDialog.app.full_name} acceptée`
          : `Candidature de ${reviewDialog.app.full_name} refusée`,
      });
      setReviewDialog(null);
      setRejectionReason("");
      await onRefresh();
    } catch (e) {
      setActionMsg({ type: "error", text: e instanceof Error ? e.message : "Erreur" });
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-2">
        {["all", "pending", "accepted", "rejected"].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "text-xs px-3 py-1.5 rounded-full border font-medium transition",
              filter === f ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
            )}
          >
            {f === "all" ? "Toutes" : f === "pending" ? "En attente" : f === "accepted" ? "Acceptées" : "Refusées"}
            {f === "pending" && ` (${applications.filter((a) => a.status === "pending").length})`}
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-slate-500">
            <Users className="h-8 w-8 mx-auto mb-2 text-slate-300" />
            Aucune candidature
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((app) => (
            <Card key={app.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-sm">
                      {(app.full_name ?? "?").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{app.full_name ?? "Utilisateur"}</p>
                      <p className="text-xs text-slate-500">
                        Candidature le {new Date(app.applied_at).toLocaleDateString("fr-FR")}
                      </p>
                      {app.motivation && (
                        <p className="text-xs text-slate-600 mt-1 italic">"{app.motivation}"</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={app.status} />
                    {app.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                          onClick={() => setReviewDialog({ app, action: "accepted" })}
                        >
                          <Check className="h-3.5 w-3.5 mr-1" /> Accepter
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => setReviewDialog({ app, action: "rejected" })}
                        >
                          <X className="h-3.5 w-3.5 mr-1" /> Refuser
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Review dialog */}
      <Dialog open={!!reviewDialog} onOpenChange={() => { setReviewDialog(null); setRejectionReason(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewDialog?.action === "accepted" ? "Accepter la candidature" : "Refuser la candidature"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            {reviewDialog?.action === "accepted"
              ? `${reviewDialog.app.full_name} deviendra ambassadeur de votre établissement.`
              : `${reviewDialog?.app.full_name} sera notifié du refus.`}
          </p>
          {reviewDialog?.action === "rejected" && (
            <div>
              <Label>Raison du refus (optionnel)</Label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Expliquez pourquoi..."
                rows={2}
                className="mt-1"
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialog(null)}>Annuler</Button>
            <Button
              onClick={handleReview}
              disabled={acting}
              className={reviewDialog?.action === "rejected" ? "bg-red-600 hover:bg-red-700" : ""}
            >
              {acting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {reviewDialog?.action === "accepted" ? "Confirmer l'acceptation" : "Confirmer le refus"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =============================================================================
// CONVERSIONS SECTION
// =============================================================================

function ConversionsSection({
  conversions,
  filter,
  setFilter,
  establishmentId,
  onRefresh,
  setActionMsg,
}: {
  conversions: AmbassadorConversion[];
  filter: string;
  setFilter: (f: string) => void;
  establishmentId: string;
  onRefresh: () => Promise<void>;
  setActionMsg: (m: { type: "success" | "error"; text: string }) => void;
}) {
  const [acting, setActing] = useState<string | null>(null);

  const filtered = filter === "all" ? conversions : conversions.filter((c) => c.status === filter);

  const handleConfirm = async (conv: AmbassadorConversion, status: "confirmed" | "rejected") => {
    setActing(conv.id);
    try {
      const result = await confirmAmbassadorConversion(establishmentId, conv.id, {
        status,
        confirmation_mode: "manual",
      });
      if (result.reward_unlocked) {
        setActionMsg({ type: "success", text: `Présence confirmée ! Récompense débloquée pour ${conv.ambassador_name}` });
      } else {
        setActionMsg({
          type: "success",
          text: status === "confirmed"
            ? `Présence de ${conv.visitor_name} confirmée`
            : `Conversion rejetée`,
        });
      }
      await onRefresh();
    } catch (e) {
      setActionMsg({ type: "error", text: e instanceof Error ? e.message : "Erreur" });
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-2">
        {["all", "pending", "confirmed", "rejected", "expired"].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "text-xs px-3 py-1.5 rounded-full border font-medium transition",
              filter === f ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
            )}
          >
            {f === "all" ? "Toutes" : f === "pending" ? "En attente" : f === "confirmed" ? "Confirmées" : f === "rejected" ? "Rejetées" : "Expirées"}
            {f === "pending" && ` (${conversions.filter((c) => c.status === "pending").length})`}
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-slate-500">
            <TrendingUp className="h-8 w-8 mx-auto mb-2 text-slate-300" />
            Aucune conversion
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((conv) => (
            <Card key={conv.id} className={conv.is_suspicious ? "border-red-300 bg-red-50/30" : ""}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-sm truncate">
                        Ambassadeur : {conv.ambassador_name ?? "—"}
                      </p>
                      {conv.is_suspicious && (
                        <Badge variant="destructive" className="text-xs">
                          <ShieldAlert className="h-3 w-3 mr-1" /> Suspect
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-600">
                      Client : {conv.visitor_name ?? "—"} • {new Date(conv.created_at).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <ConversionStatusBadge status={conv.status} />
                    {conv.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                          onClick={() => handleConfirm(conv, "confirmed")}
                          disabled={acting === conv.id}
                        >
                          {acting === conv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
                          <span className="ml-1 hidden sm:inline">Présent</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => handleConfirm(conv, "rejected")}
                          disabled={acting === conv.id}
                        >
                          <ThumbsDown className="h-3.5 w-3.5" />
                          <span className="ml-1 hidden sm:inline">Absent</span>
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// REWARDS SECTION
// =============================================================================

function RewardsSection({
  rewards,
  filter,
  setFilter,
  establishmentId,
  onRefresh,
  setActionMsg,
}: {
  rewards: AmbassadorReward[];
  filter: string;
  setFilter: (f: string) => void;
  establishmentId: string;
  onRefresh: () => Promise<void>;
  setActionMsg: (m: { type: "success" | "error"; text: string }) => void;
}) {
  const [acting, setActing] = useState<string | null>(null);

  const filtered = filter === "all" ? rewards : rewards.filter((r) => r.status === filter);

  const handleClaim = async (reward: AmbassadorReward) => {
    setActing(reward.id);
    try {
      await claimAmbassadorReward(establishmentId, reward.id);
      setActionMsg({ type: "success", text: `Récompense de ${reward.ambassador_name} marquée comme consommée` });
      await onRefresh();
    } catch (e) {
      setActionMsg({ type: "error", text: e instanceof Error ? e.message : "Erreur" });
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-2">
        {["all", "active", "claimed", "expired"].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "text-xs px-3 py-1.5 rounded-full border font-medium transition",
              filter === f ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
            )}
          >
            {f === "all" ? "Toutes" : f === "active" ? "Actives" : f === "claimed" ? "Consommées" : "Expirées"}
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-slate-500">
            <Gift className="h-8 w-8 mx-auto mb-2 text-slate-300" />
            Aucune récompense
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((reward) => (
            <Card key={reward.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{reward.ambassador_name ?? "—"}</p>
                    <p className="text-xs text-slate-500">
                      Code : <span className="font-mono font-semibold">{reward.claim_code}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      Débloquée le {new Date(reward.unlocked_at).toLocaleDateString("fr-FR")}
                      {" • "}
                      Expire le {new Date(reward.expires_at).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <RewardStatusBadge status={reward.status} />
                    {reward.status === "active" && (
                      <Button
                        size="sm"
                        onClick={() => handleClaim(reward)}
                        disabled={acting === reward.id}
                      >
                        {acting === reward.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                        Consommer
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// STATS SECTION
// =============================================================================

function StatsSection({ stats }: { stats: AmbassadorDetailedStats["stats"] | null }) {
  if (!stats) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-slate-500">
          <BarChart3 className="h-8 w-8 mx-auto mb-2 text-slate-300" />
          Aucune statistique disponible
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-slate-500 font-medium">Ambassadeurs</p>
            <p className="text-2xl font-bold">{stats.total_ambassadors}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-slate-500 font-medium">Conversions</p>
            <p className="text-2xl font-bold text-emerald-600">{stats.total_conversions}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-slate-500 font-medium">Taux de conversion</p>
            <p className="text-2xl font-bold">
              {stats.conversion_rate > 0 ? `${(stats.conversion_rate * 100).toFixed(0)}%` : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-slate-500 font-medium">Récompenses</p>
            <p className="text-2xl font-bold text-purple-600">{stats.rewards_distributed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-slate-500 font-medium">Consommées</p>
            <p className="text-2xl font-bold">{stats.rewards_claimed}</p>
          </CardContent>
        </Card>
      </div>

      {/* Top ambassadors */}
      {stats.top_ambassadors && stats.top_ambassadors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="h-5 w-5 text-amber-500" />
              Top 5 ambassadeurs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.top_ambassadors.map((amb, i) => (
                <div key={amb.user_id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold",
                      i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-slate-100 text-slate-700" : i === 2 ? "bg-orange-100 text-orange-700" : "bg-slate-50 text-slate-500",
                    )}>
                      {i + 1}
                    </span>
                    <p className="font-medium text-sm">{amb.full_name}</p>
                  </div>
                  <Badge variant="secondary">{amb.confirmed_conversions} conversions</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =============================================================================
// SHARED COMPONENTS
// =============================================================================

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "En attente", cls: "bg-amber-100 text-amber-700 border-amber-200" },
    accepted: { label: "Acceptée", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    rejected: { label: "Refusée", cls: "bg-red-100 text-red-700 border-red-200" },
  };
  const m = map[status] ?? { label: status, cls: "bg-slate-100 text-slate-700 border-slate-200" };
  return <Badge variant="outline" className={cn("text-xs", m.cls)}>{m.label}</Badge>;
}

function ConversionStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "En attente", cls: "bg-amber-100 text-amber-700 border-amber-200" },
    confirmed: { label: "Confirmée", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    rejected: { label: "Rejetée", cls: "bg-red-100 text-red-700 border-red-200" },
    expired: { label: "Expirée", cls: "bg-slate-100 text-slate-500 border-slate-200" },
  };
  const m = map[status] ?? { label: status, cls: "bg-slate-100 text-slate-700 border-slate-200" };
  return <Badge variant="outline" className={cn("text-xs", m.cls)}>{m.label}</Badge>;
}

function RewardStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: "Active", cls: "bg-purple-100 text-purple-700 border-purple-200" },
    claimed: { label: "Consommée", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    expired: { label: "Expirée", cls: "bg-slate-100 text-slate-500 border-slate-200" },
  };
  const m = map[status] ?? { label: status, cls: "bg-slate-100 text-slate-700 border-slate-200" };
  return <Badge variant="outline" className={cn("text-xs", m.cls)}>{m.label}</Badge>;
}
