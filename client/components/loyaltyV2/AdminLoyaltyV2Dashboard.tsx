/**
 * AdminLoyaltyV2Dashboard — Dashboard Admin fidélité (spec 4.5)
 *
 * 4 onglets :
 *   1. Vue d'ensemble — KPIs globaux
 *   2. Programmes — liste, détail, suspension
 *   3. Alertes anti-fraude — revue, dismiss
 *   4. Cadeaux sam.ma — modération, distribution
 */

import React, { useState, useCallback, useEffect } from "react";
import {
  AlertTriangle, Award, Bell, CheckCircle2, CreditCard, Eye, Gift,
  Loader2, Search, Shield, Sparkles, TrendingUp, Users, XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  getAdminLoyaltyStats,
  listAdminPrograms,
  suspendProgram,
  unsuspendProgram,
  listAdminAlerts,
  reviewAdminAlert,
  dismissAdminAlert,
  listAdminGifts,
  approveAdminGift,
  rejectAdminGift,
  distributeGiftManual,
  distributeGiftByCriteria,
  distributeGiftPublic,
  type AdminLoyaltyStatsResponse,
  type AdminAlertItem,
} from "@/lib/loyaltyV2AdminApi";

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function AdminLoyaltyV2Dashboard() {
  const [stats, setStats] = useState<AdminLoyaltyStatsResponse["stats"] | null>(null);
  const [programs, setPrograms] = useState<unknown[]>([]);
  const [alerts, setAlerts] = useState<AdminAlertItem[]>([]);
  const [gifts, setGifts] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, progsRes, alertsRes, giftsRes] = await Promise.all([
        getAdminLoyaltyStats(),
        listAdminPrograms({ limit: 50 }),
        listAdminAlerts({ status: "pending" }),
        listAdminGifts(),
      ]);
      setStats(statsRes.stats ?? null);
      setPrograms(progsRes.programs ?? []);
      setAlerts(alertsRes.alerts ?? []);
      setGifts(giftsRes.gifts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ms-2 text-slate-600">Chargement admin fidélité...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="w-7 h-7 text-primary" />
          Admin — Fidélité
        </h2>
        <p className="text-slate-600 mt-1">Supervision globale du système de fidélité</p>
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

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview" className="gap-2">
            <TrendingUp className="w-4 h-4" />
            Vue globale
          </TabsTrigger>
          <TabsTrigger value="programs" className="gap-2">
            <CreditCard className="w-4 h-4" />
            Programmes
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-2">
            <Bell className="w-4 h-4" />
            Alertes
            {(stats?.alerts_pending ?? 0) > 0 && (
              <span className="ms-1 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">
                {stats?.alerts_pending}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="gifts" className="gap-2">
            <Gift className="w-4 h-4" />
            Cadeaux sam.ma
          </TabsTrigger>
        </TabsList>

        {/* ==================== OVERVIEW ==================== */}
        <TabsContent value="overview" className="space-y-6">
          <AdminOverviewSection stats={stats} />
        </TabsContent>

        {/* ==================== PROGRAMS ==================== */}
        <TabsContent value="programs" className="space-y-6">
          <AdminProgramsSection
            programs={programs}
            onRefresh={loadData}
            setActionMsg={setActionMsg}
          />
        </TabsContent>

        {/* ==================== ALERTS ==================== */}
        <TabsContent value="alerts" className="space-y-6">
          <AdminAlertsSection
            alerts={alerts}
            onRefresh={loadData}
            setActionMsg={setActionMsg}
          />
        </TabsContent>

        {/* ==================== GIFTS ==================== */}
        <TabsContent value="gifts" className="space-y-6">
          <AdminGiftsSection
            gifts={gifts}
            onRefresh={loadData}
            setActionMsg={setActionMsg}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =============================================================================
// OVERVIEW
// =============================================================================

function AdminOverviewSection({ stats }: { stats: AdminLoyaltyStatsResponse["stats"] | null }) {
  const kpis = [
    { label: "Programmes actifs", value: stats?.programs_active ?? 0, total: stats?.programs_total ?? 0, icon: CreditCard, color: "bg-primary/10 text-primary" },
    { label: "Cartes actives", value: stats?.cards_active ?? 0, icon: Award, color: "bg-sky-100 text-sky-600" },
    { label: "Cartes complétées", value: stats?.cards_completed ?? 0, icon: Sparkles, color: "bg-emerald-100 text-emerald-600" },
    { label: "Récompenses actives", value: stats?.rewards_active ?? 0, icon: Gift, color: "bg-amber-100 text-amber-600" },
    { label: "Récompenses utilisées", value: stats?.rewards_used ?? 0, icon: CheckCircle2, color: "bg-violet-100 text-violet-600" },
    { label: "Alertes en attente", value: stats?.alerts_pending ?? 0, icon: AlertTriangle, color: (stats?.alerts_pending ?? 0) > 0 ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-600" },
    { label: "Cadeaux distribués", value: stats?.gifts_distributed ?? 0, icon: Users, color: "bg-rose-100 text-rose-600" },
    { label: "Cadeaux consommés", value: stats?.gifts_consumed ?? 0, icon: CheckCircle2, color: "bg-teal-100 text-teal-600" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {kpis.map((kpi) => (
        <Card key={kpi.label}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-lg", kpi.color)}>
                <kpi.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{kpi.value}</p>
                <p className="text-sm text-slate-500">{kpi.label}</p>
                {"total" in kpi && kpi.total != null && (
                  <p className="text-xs text-slate-400">/ {kpi.total} total</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// =============================================================================
// PROGRAMS
// =============================================================================

function AdminProgramsSection({
  programs,
  onRefresh,
  setActionMsg,
}: {
  programs: unknown[];
  onRefresh: () => void;
  setActionMsg: (msg: { type: "success" | "error"; text: string } | null) => void;
}) {
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [suspendDialog, setSuspendDialog] = useState<string | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [processing, setProcessing] = useState(false);

  const filtered = programs.filter((p: unknown) => {
    const prog = p as Record<string, unknown>;
    if (filterStatus === "all") return true;
    if (filterStatus === "active") return prog.is_active === true;
    if (filterStatus === "inactive") return prog.is_active === false;
    return true;
  });

  const handleSuspend = async (programId: string) => {
    if (!suspendReason.trim()) {
      setActionMsg({ type: "error", text: "Motif requis" });
      return;
    }
    setProcessing(true);
    try {
      const res = await suspendProgram(programId, suspendReason.trim());
      setActionMsg({ type: "success", text: res.message });
      setSuspendDialog(null);
      setSuspendReason("");
      onRefresh();
    } catch (e) {
      setActionMsg({ type: "error", text: e instanceof Error ? e.message : "Erreur" });
    } finally {
      setProcessing(false);
    }
  };

  const handleUnsuspend = async (programId: string) => {
    setProcessing(true);
    try {
      const res = await unsuspendProgram(programId);
      setActionMsg({ type: "success", text: res.message });
      onRefresh();
    } catch (e) {
      setActionMsg({ type: "error", text: e instanceof Error ? e.message : "Erreur" });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-4 mb-4">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrer par statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="active">Actifs</SelectItem>
            <SelectItem value="inactive">Inactifs</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-slate-500">{filtered.length} programme(s)</span>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            Aucun programme trouvé
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((p: unknown) => {
            const prog = p as Record<string, unknown>;
            const est = prog.establishment as Record<string, unknown> | null;
            return (
              <Card key={prog.id as string}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">{prog.name as string}</h3>
                        <Badge variant={prog.is_active ? "default" : "secondary"}>
                          {prog.is_active ? "Actif" : "Inactif"}
                        </Badge>
                        {prog.stamp_conditional && (
                          <Badge className="bg-amber-100 text-amber-700 border-0">Cond.</Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-500">
                        {est?.name as string ?? "Établissement inconnu"}
                        {" — "}{prog.stamps_required as number} tampons → {prog.reward_description as string}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        ID: {(prog.id as string).slice(0, 8)}...
                        {" • "}Créé: {new Date(prog.created_at as string).toLocaleDateString("fr-FR")}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {prog.is_active ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setSuspendDialog(prog.id as string)}
                          disabled={processing}
                        >
                          Suspendre
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleUnsuspend(prog.id as string)}
                          disabled={processing}
                        >
                          Réactiver
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Suspend dialog */}
      <Dialog open={!!suspendDialog} onOpenChange={() => { setSuspendDialog(null); setSuspendReason(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspendre le programme</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              La suspension gèlera toutes les cartes actives de ce programme.
            </p>
            <div className="space-y-2">
              <Label>Motif de suspension *</Label>
              <Textarea
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="Raison de la suspension..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendDialog(null)}>Annuler</Button>
            <Button
              variant="destructive"
              onClick={() => suspendDialog && handleSuspend(suspendDialog)}
              disabled={processing}
              className="gap-2"
            >
              {processing && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirmer la suspension
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// =============================================================================
// ALERTS
// =============================================================================

function AdminAlertsSection({
  alerts,
  onRefresh,
  setActionMsg,
}: {
  alerts: AdminAlertItem[];
  onRefresh: () => void;
  setActionMsg: (msg: { type: "success" | "error"; text: string } | null) => void;
}) {
  const [filterType, setFilterType] = useState<string>("all");
  const [reviewDialog, setReviewDialog] = useState<AdminAlertItem | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [processing, setProcessing] = useState(false);

  const filtered = filterType === "all" ? alerts : alerts.filter((a) => a.alert_type === filterType);

  const alertTypeLabels: Record<string, string> = {
    suspicious_stamping: "Tamponnage suspect",
    abnormal_frequency: "Fréquence anormale",
    high_value_reward: "Cadeau haute valeur",
    suspicious_amount_pattern: "Pattern montant",
    program_created: "Programme créé",
  };

  const alertTypeColors: Record<string, string> = {
    suspicious_stamping: "bg-red-100 text-red-700",
    abnormal_frequency: "bg-amber-100 text-amber-700",
    high_value_reward: "bg-violet-100 text-violet-700",
    suspicious_amount_pattern: "bg-orange-100 text-orange-700",
    program_created: "bg-sky-100 text-sky-700",
  };

  const handleReview = async (alertId: string) => {
    setProcessing(true);
    try {
      await reviewAdminAlert(alertId, reviewNotes.trim() || undefined);
      setActionMsg({ type: "success", text: "Alerte marquée comme revue" });
      setReviewDialog(null);
      setReviewNotes("");
      onRefresh();
    } catch (e) {
      setActionMsg({ type: "error", text: e instanceof Error ? e.message : "Erreur" });
    } finally {
      setProcessing(false);
    }
  };

  const handleDismiss = async (alertId: string) => {
    setProcessing(true);
    try {
      await dismissAdminAlert(alertId);
      setActionMsg({ type: "success", text: "Alerte classée sans suite" });
      onRefresh();
    } catch (e) {
      setActionMsg({ type: "error", text: e instanceof Error ? e.message : "Erreur" });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-4 mb-4">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Filtrer par type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les alertes</SelectItem>
            <SelectItem value="suspicious_stamping">Tamponnage suspect</SelectItem>
            <SelectItem value="abnormal_frequency">Fréquence anormale</SelectItem>
            <SelectItem value="high_value_reward">Haute valeur</SelectItem>
            <SelectItem value="suspicious_amount_pattern">Pattern montant</SelectItem>
            <SelectItem value="program_created">Programme créé</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-slate-500">{filtered.length} alerte(s)</span>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-1">Aucune alerte</h3>
            <p className="text-slate-500">Toutes les alertes ont été traitées</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((alert) => (
            <Card key={alert.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={cn("border-0", alertTypeColors[alert.alert_type] ?? "bg-slate-100 text-slate-600")}>
                        {alertTypeLabels[alert.alert_type] ?? alert.alert_type}
                      </Badge>
                      <span className="text-xs text-slate-400">
                        {new Date(alert.created_at).toLocaleString("fr-FR")}
                      </span>
                    </div>
                    <p className="text-sm">{alert.details}</p>
                    {alert.establishment && (
                      <p className="text-xs text-slate-500 mt-1">
                        Établissement: {alert.establishment.name}
                      </p>
                    )}
                    {alert.user_id && (
                      <p className="text-xs text-slate-400">
                        User: {alert.user_id.slice(0, 8)}...
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setReviewDialog(alert); setReviewNotes(""); }}
                      disabled={processing}
                    >
                      <Eye className="w-3.5 h-3.5 me-1" />
                      Revoir
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDismiss(alert.id)}
                      disabled={processing}
                      className="text-slate-500"
                    >
                      <XCircle className="w-3.5 h-3.5 me-1" />
                      Classer
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Review dialog */}
      <Dialog open={!!reviewDialog} onOpenChange={() => setReviewDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoir l'alerte</DialogTitle>
          </DialogHeader>
          {reviewDialog && (
            <div className="space-y-4">
              <div className="p-3 bg-slate-50 rounded-lg">
                <Badge className={cn("mb-2 border-0", alertTypeColors[reviewDialog.alert_type] ?? "")}>
                  {alertTypeLabels[reviewDialog.alert_type] ?? reviewDialog.alert_type}
                </Badge>
                <p className="text-sm">{reviewDialog.details}</p>
                {reviewDialog.metadata && Object.keys(reviewDialog.metadata).length > 0 && (
                  <pre className="text-xs text-slate-500 mt-2 overflow-auto max-h-32">
                    {JSON.stringify(reviewDialog.metadata, null, 2)}
                  </pre>
                )}
              </div>
              <div className="space-y-2">
                <Label>Notes de revue</Label>
                <Textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Observations, actions prises..."
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialog(null)}>Annuler</Button>
            <Button
              onClick={() => reviewDialog && handleReview(reviewDialog.id)}
              disabled={processing}
              className="gap-2"
            >
              {processing && <Loader2 className="w-4 h-4 animate-spin" />}
              Marquer comme revue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// =============================================================================
// GIFTS
// =============================================================================

function AdminGiftsSection({
  gifts,
  onRefresh,
  setActionMsg,
}: {
  gifts: unknown[];
  onRefresh: () => void;
  setActionMsg: (msg: { type: "success" | "error"; text: string } | null) => void;
}) {
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [rejectDialog, setRejectDialog] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [distributeDialog, setDistributeDialog] = useState<string | null>(null);
  const [distributeMode, setDistributeMode] = useState<string>("public");
  const [critCity, setCritCity] = useState("");
  const [critMinResa, setCritMinResa] = useState(0);
  const [critMaxRecipients, setCritMaxRecipients] = useState(100);
  const [processing, setProcessing] = useState(false);

  const filtered = gifts.filter((g: unknown) => {
    const gift = g as Record<string, unknown>;
    if (filterStatus === "all") return true;
    return gift.status === filterStatus;
  });

  const giftStatusLabels: Record<string, string> = {
    offered: "En attente",
    approved: "Approuvé",
    rejected: "Refusé",
    first_come: "Public",
    distributed: "Distribué",
    expired: "Expiré",
  };

  const giftStatusColors: Record<string, string> = {
    offered: "bg-amber-100 text-amber-700",
    approved: "bg-emerald-100 text-emerald-700",
    rejected: "bg-red-100 text-red-700",
    first_come: "bg-sky-100 text-sky-700",
    distributed: "bg-violet-100 text-violet-700",
    expired: "bg-slate-100 text-slate-500",
  };

  const handleApprove = async (giftId: string) => {
    setProcessing(true);
    try {
      const res = await approveAdminGift(giftId);
      setActionMsg({ type: "success", text: res.message });
      onRefresh();
    } catch (e) {
      setActionMsg({ type: "error", text: e instanceof Error ? e.message : "Erreur" });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectDialog || !rejectReason.trim()) {
      setActionMsg({ type: "error", text: "Motif requis" });
      return;
    }
    setProcessing(true);
    try {
      const res = await rejectAdminGift(rejectDialog, rejectReason.trim());
      setActionMsg({ type: "success", text: res.message });
      setRejectDialog(null);
      setRejectReason("");
      onRefresh();
    } catch (e) {
      setActionMsg({ type: "error", text: e instanceof Error ? e.message : "Erreur" });
    } finally {
      setProcessing(false);
    }
  };

  const handleDistribute = async () => {
    if (!distributeDialog) return;
    setProcessing(true);
    try {
      let res: { ok: boolean; message: string; distributed?: number };
      if (distributeMode === "public") {
        res = await distributeGiftPublic(distributeDialog);
      } else if (distributeMode === "criteria") {
        res = await distributeGiftByCriteria(distributeDialog, {
          city: critCity.trim() || undefined,
          min_reservations: critMinResa > 0 ? critMinResa : undefined,
          max_recipients: critMaxRecipients,
        });
      } else {
        res = { ok: false, message: "Mode non supporté" };
      }
      setActionMsg({ type: "success", text: res.message });
      setDistributeDialog(null);
      onRefresh();
    } catch (e) {
      setActionMsg({ type: "error", text: e instanceof Error ? e.message : "Erreur" });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-4 mb-4">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrer par statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="offered">En attente</SelectItem>
            <SelectItem value="approved">Approuvés</SelectItem>
            <SelectItem value="rejected">Refusés</SelectItem>
            <SelectItem value="first_come">Public</SelectItem>
            <SelectItem value="distributed">Distribués</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-slate-500">{filtered.length} cadeau(x)</span>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            Aucun cadeau trouvé
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((g: unknown) => {
            const gift = g as Record<string, unknown>;
            const status = gift.status as string;
            const est = gift.establishment as Record<string, unknown> | null;
            return (
              <Card key={gift.id as string}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">{gift.description as string}</h3>
                        <Badge className={cn("border-0", giftStatusColors[status] ?? "bg-slate-100 text-slate-600")}>
                          {giftStatusLabels[status] ?? status}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-500">
                        {est?.name as string ?? "Établissement"}
                        {" • "}
                        {gift.gift_type === "percentage_discount" && `-${gift.value as number}%`}
                        {gift.gift_type === "fixed_discount" && `-${gift.value as number} MAD`}
                        {gift.gift_type === "free_item" && "Offert"}
                        {" • "}Qté: {gift.total_quantity as number}
                        {" • "}Distribué: {gift.distributed_count as number ?? 0}
                        {" • "}Consommé: {gift.consumed_count as number ?? 0}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Validité: {new Date(gift.validity_start as string).toLocaleDateString("fr-FR")} — {new Date(gift.validity_end as string).toLocaleDateString("fr-FR")}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {status === "offered" && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleApprove(gift.id as string)}
                            disabled={processing}
                            className="bg-emerald-600 hover:bg-emerald-700 gap-1"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Approuver
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setRejectDialog(gift.id as string)}
                            disabled={processing}
                          >
                            Refuser
                          </Button>
                        </>
                      )}
                      {status === "approved" && (
                        <Button
                          size="sm"
                          onClick={() => setDistributeDialog(gift.id as string)}
                          disabled={processing}
                        >
                          Distribuer
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Reject dialog */}
      <Dialog open={!!rejectDialog} onOpenChange={() => { setRejectDialog(null); setRejectReason(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refuser le cadeau</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Motif du refus *</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Raison du refus..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog(null)}>Annuler</Button>
            <Button variant="destructive" onClick={handleReject} disabled={processing} className="gap-2">
              {processing && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirmer le refus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Distribute dialog */}
      <Dialog open={!!distributeDialog} onOpenChange={() => setDistributeDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Distribuer le cadeau</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Mode de distribution</Label>
              <Select value={distributeMode} onValueChange={setDistributeMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Premier arrivé, premier servi</SelectItem>
                  <SelectItem value="criteria">Par critères</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {distributeMode === "criteria" && (
              <div className="space-y-3 p-3 bg-slate-50 rounded-lg">
                <div className="space-y-2">
                  <Label>Ville</Label>
                  <Input value={critCity} onChange={(e) => setCritCity(e.target.value)} placeholder="Casablanca, Rabat..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Min. réservations</Label>
                    <Input type="number" min={0} value={critMinResa} onChange={(e) => setCritMinResa(Number(e.target.value))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Max. destinataires</Label>
                    <Input type="number" min={1} value={critMaxRecipients} onChange={(e) => setCritMaxRecipients(Number(e.target.value))} />
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDistributeDialog(null)}>Annuler</Button>
            <Button onClick={handleDistribute} disabled={processing} className="gap-2">
              {processing && <Loader2 className="w-4 h-4 animate-spin" />}
              Distribuer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default AdminLoyaltyV2Dashboard;
