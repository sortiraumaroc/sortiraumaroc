/**
 * ProLoyaltyV2Dashboard — Dashboard Pro fidélité (spec 4.4)
 *
 * 4 onglets :
 *   1. Mon programme — stats + activité récente
 *   2. Paramètres — formulaire programme (conditionnel, fréquence, etc.)
 *   3. Clients fidèles — base de données + recherche
 *   4. Récompenses — offrir un cadeau + liste des offres
 */

import React, { useState, useCallback, useEffect } from "react";
import {
  Award, BarChart3, CalendarDays, ChevronRight, Clock, CreditCard, Gift, Loader2, Percent, Plus,
  Search, Settings, ShieldCheck, Sparkles, TrendingUp, Users, X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
// Tabs removed — using custom pill buttons like ProPacksDashboard
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  getProLoyaltyProgram,
  getProLoyaltyStats,
  getProLoyaltyClients,
  getProLoyaltyClientDetail,
  createProLoyaltyProgram,
  updateProLoyaltyProgram,
  activateProLoyaltyProgram,
  deactivateProLoyaltyProgram,
  offerPlatformGift,
  getMyOfferedGifts,
  type ProLoyaltyProgramResponse,
  type ProLoyaltyStatsResponse,
  type ProLoyaltyClientsResponse,
  type CreateProgramInput,
  type OfferGiftInput,
} from "@/lib/loyaltyV2ProApi";

// =============================================================================
// TYPES
// =============================================================================

type LoyaltyTab = "overview" | "config" | "clients" | "gifts";

const LOYALTY_TABS: Array<{ id: LoyaltyTab; label: string; icon: typeof TrendingUp }> = [
  { id: "config", label: "Paramètres", icon: Settings },
  { id: "overview", label: "Mon programme", icon: TrendingUp },
  { id: "clients", label: "Clients", icon: Users },
  { id: "gifts", label: "Récompenses", icon: Gift },
];

type Props = {
  establishmentId: string;
  establishmentName: string;
  role: string;
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ProLoyaltyV2Dashboard({ establishmentId, establishmentName, role }: Props) {
  const canEdit = ["owner", "manager", "marketing"].includes(role);

  // Tab state
  const [tab, setTab] = useState<LoyaltyTab>("config");

  // State
  const [programs, setPrograms] = useState<unknown[]>([]);
  const [stats, setStats] = useState<ProLoyaltyStatsResponse["stats"] | null>(null);
  const [clients, setClients] = useState<ProLoyaltyClientsResponse["clients"]>([]);
  const [offeredGifts, setOfferedGifts] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Load all data
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [progRes, statsRes, clientsRes, giftsRes] = await Promise.all([
        getProLoyaltyProgram(establishmentId),
        getProLoyaltyStats(establishmentId),
        getProLoyaltyClients(establishmentId, { per_page: 20 }),
        getMyOfferedGifts(establishmentId),
      ]);
      setPrograms(progRes.programs ?? []);
      setStats(statsRes.stats ?? null);
      setClients(clientsRes.clients ?? []);
      setOfferedGifts(giftsRes.gifts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [establishmentId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ms-2 text-slate-600">Chargement fidélité...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Award className="w-7 h-7 text-primary" />
            Fidélité
          </h2>
          <p className="text-slate-600 mt-1">
            Programme de fidélité avec tampons et récompenses
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

      {/* Pill tabs — same style as ProPacksDashboard */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {LOYALTY_TABS.map((t) => {
          const Icon = t.icon;
          const label = t.id === "clients" ? `${t.label} (${clients.length})` : t.label;
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

      {/* ==================== OVERVIEW ==================== */}
      {tab === "overview" && (
        <div className="space-y-6">
          <OverviewSection stats={stats} programs={programs} />
        </div>
      )}

      {/* ==================== PARAMÈTRES ==================== */}
      {tab === "config" && (
        <div className="space-y-6">
          <ConfigSection
            establishmentId={establishmentId}
            programs={programs}
            canEdit={canEdit}
            onRefresh={loadData}
            setActionMsg={setActionMsg}
          />
        </div>
      )}

      {/* ==================== CLIENTS ==================== */}
      {tab === "clients" && (
        <div className="space-y-6">
          <ClientsSection
            establishmentId={establishmentId}
            clients={clients}
            onRefresh={loadData}
          />
        </div>
      )}

      {/* ==================== RÉCOMPENSES ==================== */}
      {tab === "gifts" && (
        <div className="space-y-6">
          <GiftsSection
            establishmentId={establishmentId}
            offeredGifts={offeredGifts}
            canEdit={canEdit}
            onRefresh={loadData}
            setActionMsg={setActionMsg}
          />
        </div>
      )}
    </div>
  );
}

// =============================================================================
// OVERVIEW SECTION
// =============================================================================

function OverviewSection({ stats, programs }: { stats: ProLoyaltyStatsResponse["stats"] | null; programs: unknown[] }) {
  const kpis = [
    { label: "Cartes actives", value: stats?.active_cards ?? 0, icon: CreditCard, color: "bg-primary/10 text-primary" },
    { label: "Cartes complétées", value: stats?.completed_cards ?? 0, icon: Sparkles, color: "bg-emerald-100 text-emerald-600" },
    { label: "Taux complétion", value: `${Math.round((stats?.completion_rate ?? 0) * 100)}%`, icon: TrendingUp, color: "bg-amber-100 text-amber-600" },
    { label: "Récompenses ce mois", value: stats?.rewards_this_month ?? 0, icon: Gift, color: "bg-violet-100 text-violet-600" },
  ];

  return (
    <>
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
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Extra stats */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-sky-100 text-sky-600">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{Math.round((stats?.renewal_rate ?? 0) * 100)}%</p>
                <p className="text-sm text-slate-500">Taux de renouvellement</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-rose-100 text-rose-600">
                <Percent className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {stats?.avg_conditional_amount != null ? `${stats.avg_conditional_amount} MAD` : "—"}
                </p>
                <p className="text-sm text-slate-500">Montant cond. moyen</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-slate-100 text-slate-600">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.total_conditional_stamps ?? 0}</p>
                <p className="text-sm text-slate-500">Tampons conditionnels</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Programmes ({programs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {programs.length === 0 ? (
            <p className="text-center text-slate-500 py-6">
              Aucun programme créé. Allez dans l'onglet Paramètres pour créer votre premier programme.
            </p>
          ) : (
            <div className="space-y-3">
              {programs.map((p: unknown) => {
                const prog = p as Record<string, unknown>;
                return (
                  <div key={prog.id as string} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <Award className="w-5 h-5 text-primary" />
                      <div>
                        <p className="font-semibold">{prog.name as string}</p>
                        <p className="text-sm text-slate-500">
                          {prog.stamps_required as number} tampons →{" "}
                          {prog.reward_description as string}
                        </p>
                      </div>
                    </div>
                    <Badge variant={prog.is_active ? "default" : "secondary"}>
                      {prog.is_active ? "Actif" : "Inactif"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// =============================================================================
// CONFIGURATION SECTION
// =============================================================================

function ConfigSection({
  establishmentId,
  programs,
  canEdit,
  onRefresh,
  setActionMsg,
}: {
  establishmentId: string;
  programs: unknown[];
  canEdit: boolean;
  onRefresh: () => void;
  setActionMsg: (msg: { type: "success" | "error"; text: string } | null) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state — V2 fields
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formStamps, setFormStamps] = useState(10);
  const [formRewardType, setFormRewardType] = useState("free_item");
  const [formRewardValue, setFormRewardValue] = useState("");
  const [formRewardDesc, setFormRewardDesc] = useState("");
  const [formRewardValidity, setFormRewardValidity] = useState(30);
  const [formConditions, setFormConditions] = useState("");
  const [formExpireDays, setFormExpireDays] = useState(180);
  const [formIsRenewable, setFormIsRenewable] = useState(true);

  // V2 specific
  const [formConditional, setFormConditional] = useState(false);
  const [formMinAmount, setFormMinAmount] = useState(0);
  const [formMinCurrency, setFormMinCurrency] = useState("MAD");
  const [formFrequency, setFormFrequency] = useState("once_per_day");
  const [formRequiresResa, setFormRequiresResa] = useState(false);
  const [formCardValidity, setFormCardValidity] = useState(0);

  const resetForm = () => {
    setFormName(""); setFormDesc(""); setFormStamps(10);
    setFormRewardType("free_item"); setFormRewardValue(""); setFormRewardDesc("");
    setFormRewardValidity(30); setFormConditions(""); setFormExpireDays(180);
    setFormIsRenewable(true); setFormConditional(false); setFormMinAmount(0);
    setFormMinCurrency("MAD"); setFormFrequency("once_per_day");
    setFormRequiresResa(false); setFormCardValidity(0);
    setEditingId(null);
  };

  const loadProgramToForm = (prog: Record<string, unknown>) => {
    setFormName(prog.name as string ?? "");
    setFormDesc(prog.description as string ?? "");
    setFormStamps(prog.stamps_required as number ?? 10);
    setFormRewardType(prog.reward_type as string ?? "free_item");
    setFormRewardValue(prog.reward_value as string ?? "");
    setFormRewardDesc(prog.reward_description as string ?? "");
    setFormRewardValidity(prog.reward_validity_days as number ?? 30);
    setFormConditions(prog.conditions as string ?? "");
    setFormExpireDays(prog.stamps_expire_after_days as number ?? 180);
    setFormIsRenewable(prog.is_renewable as boolean ?? true);
    setFormConditional(prog.stamp_conditional as boolean ?? false);
    setFormMinAmount(prog.stamp_minimum_amount as number ?? 0);
    setFormMinCurrency(prog.stamp_minimum_currency as string ?? "MAD");
    setFormFrequency(prog.stamp_frequency as string ?? "once_per_day");
    setFormRequiresResa(prog.stamp_requires_reservation as boolean ?? false);
    setFormCardValidity(prog.card_validity_days as number ?? 0);
    setEditingId(prog.id as string);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formRewardDesc.trim()) {
      setActionMsg({ type: "error", text: "Nom et description récompense requis" });
      return;
    }
    setSaving(true);
    const input: CreateProgramInput = {
      name: formName.trim(),
      description: formDesc.trim() || undefined,
      stamps_required: formStamps,
      reward_type: formRewardType,
      reward_value: formRewardValue.trim() || undefined,
      reward_description: formRewardDesc.trim(),
      reward_validity_days: formRewardValidity,
      conditions: formConditions.trim() || undefined,
      stamps_expire_after_days: formExpireDays,
      is_renewable: formIsRenewable,
      stamp_conditional: formConditional,
      stamp_minimum_amount: formConditional ? formMinAmount : undefined,
      stamp_minimum_currency: formConditional ? formMinCurrency : undefined,
      stamp_frequency: formFrequency,
      stamp_requires_reservation: formRequiresResa,
      card_validity_days: formCardValidity > 0 ? formCardValidity : undefined,
    };

    try {
      if (editingId) {
        await updateProLoyaltyProgram(establishmentId, editingId, input);
        setActionMsg({ type: "success", text: "Programme mis à jour" });
      } else {
        await createProLoyaltyProgram(establishmentId, input);
        setActionMsg({ type: "success", text: "Programme créé" });
      }
      resetForm();
      setShowForm(false);
      onRefresh();
    } catch (e) {
      setActionMsg({ type: "error", text: e instanceof Error ? e.message : "Erreur" });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (prog: Record<string, unknown>) => {
    const progId = prog.id as string;
    try {
      if (prog.is_active) {
        const res = await deactivateProLoyaltyProgram(establishmentId, progId);
        setActionMsg({ type: "success", text: res.message });
      } else {
        const res = await activateProLoyaltyProgram(establishmentId, progId);
        setActionMsg({ type: "success", text: res.message });
      }
      onRefresh();
    } catch (e) {
      setActionMsg({ type: "error", text: e instanceof Error ? e.message : "Erreur" });
    }
  };

  return (
    <>
      {/* Existing programs */}
      {programs.length > 0 && !showForm && (
        <div className="space-y-4">
          {programs.map((p: unknown) => {
            const prog = p as Record<string, unknown>;
            return (
              <Card key={prog.id as string}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-lg">{prog.name as string}</h3>
                        <Badge variant={prog.is_active ? "default" : "secondary"}>
                          {prog.is_active ? "Actif" : "Inactif"}
                        </Badge>
                        {prog.stamp_conditional && (
                          <Badge className="bg-amber-100 text-amber-700 border-0">Conditionnel</Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-500">
                        {prog.stamps_required as number} tampons → {prog.reward_description as string}
                      </p>
                      {prog.stamp_conditional && (
                        <p className="text-xs text-amber-600 mt-1">
                          Min. {prog.stamp_minimum_amount as number} {prog.stamp_minimum_currency as string ?? "MAD"}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-2 text-xs text-slate-400">
                        <span>Fréquence: {prog.stamp_frequency as string}</span>
                        <span>•</span>
                        <span>Exp. tampons: {prog.stamps_expire_after_days as number ?? 180}j</span>
                        {prog.is_renewable && <><span>•</span><span>Renouvelable</span></>}
                      </div>
                    </div>
                    {canEdit && (
                      <div className="flex gap-2 shrink-0">
                        <Button variant="outline" size="sm" onClick={() => loadProgramToForm(prog)}>
                          Modifier
                        </Button>
                        <Button
                          variant={prog.is_active ? "destructive" : "default"}
                          size="sm"
                          onClick={() => handleToggleActive(prog)}
                        >
                          {prog.is_active ? "Désactiver" : "Activer"}
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit Form */}
      {showForm ? (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? "Modifier le programme" : "Créer un programme V2"}</CardTitle>
            <CardDescription>
              Configurez les paramètres avancés de votre programme de fidélité
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Base info */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nom du programme *</Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Carte Fidèle" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Décrivez votre programme..." />
              </div>
            </div>

            {/* Stamps */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Tampons requis</Label>
                <Input type="number" min={2} max={50} value={formStamps} onChange={(e) => setFormStamps(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Exp. tampons (jours)</Label>
                <Input type="number" min={30} max={365} value={formExpireDays} onChange={(e) => setFormExpireDays(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Fréquence tampon</Label>
                <Select value={formFrequency} onValueChange={setFormFrequency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once_per_day">1 / jour</SelectItem>
                    <SelectItem value="once_per_week">1 / semaine</SelectItem>
                    <SelectItem value="unlimited">Illimité</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Validité carte (jours)</Label>
                <Input type="number" min={0} max={730} value={formCardValidity} onChange={(e) => setFormCardValidity(Number(e.target.value))} placeholder="0 = illimité" />
              </div>
            </div>

            {/* Conditional stamp */}
            <Card className="bg-amber-50/50 border-amber-200">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="font-semibold text-amber-800">Tampon conditionnel</p>
                    <p className="text-xs text-amber-600">
                      Le pro doit saisir le montant dépensé par le client. Le tampon n'est validé que si le montant atteint le minimum.
                    </p>
                  </div>
                  <Switch checked={formConditional} onCheckedChange={setFormConditional} />
                </div>
                {formConditional && (
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="space-y-2">
                      <Label>Montant minimum</Label>
                      <Input type="number" min={0} value={formMinAmount} onChange={(e) => setFormMinAmount(Number(e.target.value))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Devise</Label>
                      <Select value={formMinCurrency} onValueChange={setFormMinCurrency}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MAD">MAD</SelectItem>
                          <SelectItem value="EUR">EUR</SelectItem>
                          <SelectItem value="USD">USD</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Options */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium text-sm">Tampon lié aux réservations</p>
                  <p className="text-xs text-slate-500">Uniquement via réservation validée</p>
                </div>
                <Switch checked={formRequiresResa} onCheckedChange={setFormRequiresResa} />
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium text-sm">Programme renouvelable</p>
                  <p className="text-xs text-slate-500">Nouvelle carte auto après complétion</p>
                </div>
                <Switch checked={formIsRenewable} onCheckedChange={setFormIsRenewable} />
              </div>
            </div>

            {/* Reward */}
            <div className="space-y-4">
              <h4 className="font-semibold flex items-center gap-2">
                <Gift className="w-4 h-4" />
                Récompense
              </h4>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={formRewardType} onValueChange={setFormRewardType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free_item">Article offert</SelectItem>
                      <SelectItem value="discount_percent">Réduction (%)</SelectItem>
                      <SelectItem value="discount_fixed">Réduction (MAD)</SelectItem>
                      <SelectItem value="custom">Personnalisé</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(formRewardType === "discount_percent" || formRewardType === "discount_fixed") && (
                  <div className="space-y-2">
                    <Label>Valeur</Label>
                    <Input value={formRewardValue} onChange={(e) => setFormRewardValue(e.target.value)} placeholder={formRewardType === "discount_percent" ? "20" : "50"} />
                  </div>
                )}
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Description récompense *</Label>
                  <Input value={formRewardDesc} onChange={(e) => setFormRewardDesc(e.target.value)} placeholder="1 café offert, -20%..." />
                </div>
                <div className="space-y-2">
                  <Label>Validité bon (jours)</Label>
                  <Input type="number" min={1} max={365} value={formRewardValidity} onChange={(e) => setFormRewardValidity(Number(e.target.value))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Conditions</Label>
                <Textarea value={formConditions} onChange={(e) => setFormConditions(e.target.value)} placeholder="Hors week-end, sur place uniquement..." rows={2} />
              </div>
            </div>

            {/* Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => { resetForm(); setShowForm(false); }}>
                Annuler
              </Button>
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingId ? "Enregistrer" : "Créer le programme"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        canEdit && (
          <Button onClick={() => { resetForm(); setShowForm(true); }} className="gap-2">
            <Plus className="w-4 h-4" />
            Créer un programme
          </Button>
        )
      )}
    </>
  );
}

// =============================================================================
// CLIENTS SECTION
// =============================================================================

function ClientsSection({
  establishmentId,
  clients,
  onRefresh,
}: {
  establishmentId: string;
  clients: ProLoyaltyClientsResponse["clients"];
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filteredClients, setFilteredClients] = useState(clients);
  const [searching, setSearching] = useState(false);

  // Detail dialog
  const [selectedClient, setSelectedClient] = useState<ProLoyaltyClientsResponse["clients"][0] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailCards, setDetailCards] = useState<Array<Record<string, unknown>>>([]);
  const [detailRewards, setDetailRewards] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    setFilteredClients(clients);
  }, [clients]);

  const handleSearch = useCallback(async () => {
    if (!search.trim()) {
      setFilteredClients(clients);
      return;
    }
    setSearching(true);
    try {
      const res = await getProLoyaltyClients(establishmentId, { search: search.trim() });
      setFilteredClients(res.clients ?? []);
    } catch {
      // fallback to local filter
      setFilteredClients(
        clients.filter((c) => c.full_name.toLowerCase().includes(search.toLowerCase()))
      );
    } finally {
      setSearching(false);
    }
  }, [establishmentId, search, clients]);

  const openDetail = async (client: ProLoyaltyClientsResponse["clients"][0]) => {
    setSelectedClient(client);
    setDetailLoading(true);
    setDetailCards([]);
    setDetailRewards([]);
    try {
      const res = await getProLoyaltyClientDetail(establishmentId, client.user_id);
      setDetailCards((res.cards ?? []) as Array<Record<string, unknown>>);
      setDetailRewards((res.rewards ?? []) as Array<Record<string, unknown>>);
    } catch {
      // If detail API fails, fall back to summary cards
      setDetailCards(client.cards.map((c) => ({ ...c }) as Record<string, unknown>));
    } finally {
      setDetailLoading(false);
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "active": return { label: "Actif", cls: "bg-emerald-100 text-emerald-700" };
      case "completed": return { label: "Complété", cls: "bg-amber-100 text-amber-700" };
      case "reward_pending": return { label: "Récompense en attente", cls: "bg-orange-100 text-orange-700" };
      case "reward_used": return { label: "Récompense utilisée", cls: "bg-slate-100 text-slate-600" };
      case "expired": return { label: "Expiré", cls: "bg-red-100 text-red-600" };
      case "frozen": return { label: "Gelé", cls: "bg-blue-100 text-blue-600" };
      default: return { label: status, cls: "bg-slate-100 text-slate-600" };
    }
  };

  const fmtDate = (v: unknown) => {
    if (!v || typeof v !== "string") return "—";
    try { return new Date(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }); } catch { return "—"; }
  };

  const fmtDateTime = (v: unknown) => {
    if (!v || typeof v !== "string") return "—";
    try { return new Date(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return "—"; }
  };

  return (
    <>
      {/* Detail Dialog */}
      <Dialog open={!!selectedClient} onOpenChange={(open) => !open && setSelectedClient(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {selectedClient && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="font-bold text-primary">
                      {selectedClient.full_name?.charAt(0)?.toUpperCase() ?? "?"}
                    </span>
                  </div>
                  <div>
                    <div>{selectedClient.full_name}</div>
                    <div className="text-sm font-normal text-slate-500">
                      {selectedClient.total_stamps} tampons • {selectedClient.total_cycles} cycle(s)
                    </div>
                  </div>
                </DialogTitle>
              </DialogHeader>

              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-3 mt-2">
                <div className="rounded-lg bg-slate-50 p-3 text-center">
                  <div className="text-lg font-bold text-primary">{selectedClient.total_stamps}</div>
                  <div className="text-xs text-slate-500">Tampons</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 text-center">
                  <div className="text-lg font-bold text-primary">{selectedClient.total_cycles}</div>
                  <div className="text-xs text-slate-500">Cycles</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 text-center">
                  <div className="text-lg font-bold text-primary">{selectedClient.last_visit ? fmtDate(selectedClient.last_visit) : "—"}</div>
                  <div className="text-xs text-slate-500">Dernière visite</div>
                </div>
              </div>

              {/* Cards detail */}
              <div className="mt-4 space-y-3">
                <h4 className="text-sm font-semibold text-slate-700">Cartes de fidélité</h4>
                {detailLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                  </div>
                ) : detailCards.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">Aucune carte</p>
                ) : (
                  detailCards.map((card, i) => {
                    const stamps = (card.stamps_count as number) ?? 0;
                    const required = (card.stamps_required as number) ?? 10;
                    const pct = required > 0 ? Math.min(100, Math.round((stamps / required) * 100)) : 0;
                    const st = statusLabel((card.status as string) ?? "active");
                    return (
                      <div key={(card.id as string) ?? i} className="rounded-lg border p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{(card.program_name as string) ?? "Programme"}</span>
                          <Badge className={cn("text-xs border-0", st.cls)}>{st.label}</Badge>
                        </div>

                        {/* Progress bar */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-slate-500">
                            <span>{stamps} / {required} tampons</span>
                            <span>Cycle {(card.cycle_number as number) ?? 1}</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>

                        {/* Dates */}
                        <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 pt-1">
                          <div className="flex items-center gap-1">
                            <CalendarDays className="w-3 h-3" />
                            <span>Créée : {fmtDate(card.created_at)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>Dernier tampon : {fmtDateTime(card.last_stamp_at)}</span>
                          </div>
                        </div>

                        {/* Reward info if completed */}
                        {((card.status as string) === "completed" || (card.status as string) === "reward_pending") && (
                          <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-md px-2 py-1 mt-1">
                            <Gift className="w-3 h-3" />
                            <span>Récompense à récupérer</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Rewards history */}
              {detailRewards.length > 0 && (
                <div className="mt-4 space-y-2">
                  <h4 className="text-sm font-semibold text-slate-700">Historique des récompenses</h4>
                  {detailRewards.map((rw, i) => (
                    <div key={(rw.id as string) ?? i} className="flex items-center justify-between text-sm p-2 rounded-md bg-slate-50">
                      <div className="flex items-center gap-2">
                        <Gift className="w-4 h-4 text-amber-500" />
                        <span>{(rw.description as string) || (rw.reward_value as string) || "Récompense"}</span>
                      </div>
                      <span className="text-xs text-slate-400">{fmtDate(rw.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Clients fidèles</CardTitle>
          <CardDescription>Base de données de vos clients fidélité</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                className="ps-9"
                placeholder="Rechercher un client..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>
            <Button onClick={handleSearch} disabled={searching} variant="outline">
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Chercher"}
            </Button>
          </div>

          {filteredClients.length === 0 ? (
            <p className="text-center text-slate-500 py-8">
              Aucun client fidélité trouvé
            </p>
          ) : (
            <div className="space-y-2">
              {filteredClients.map((client) => (
                <div
                  key={client.user_id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => openDetail(client)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="font-bold text-primary">
                        {client.full_name?.charAt(0)?.toUpperCase() ?? "?"}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium">{client.full_name}</p>
                      <p className="text-sm text-slate-500">
                        {client.total_stamps} tampons • {client.total_cycles} cycle(s)
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {client.cards.some((c) => c.status === "completed") && (
                      <Badge className="bg-amber-100 text-amber-700 border-0">
                        <Gift className="w-3 h-3 me-1" />
                        Récompense
                      </Badge>
                    )}
                    {client.last_visit && (
                      <span className="text-xs text-slate-400">
                        {new Date(client.last_visit).toLocaleDateString("fr-FR")}
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// =============================================================================
// GIFTS SECTION — Offrir à sam.ma
// =============================================================================

function GiftsSection({
  establishmentId,
  offeredGifts,
  canEdit,
  onRefresh,
  setActionMsg,
}: {
  establishmentId: string;
  offeredGifts: unknown[];
  canEdit: boolean;
  onRefresh: () => void;
  setActionMsg: (msg: { type: "success" | "error"; text: string } | null) => void;
}) {
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [offering, setOffering] = useState(false);

  // Form
  const [giftType, setGiftType] = useState("free_item");
  const [giftDesc, setGiftDesc] = useState("");
  const [giftValue, setGiftValue] = useState(0);
  const [giftQty, setGiftQty] = useState(10);
  const [giftConditions, setGiftConditions] = useState("");
  const [giftStart, setGiftStart] = useState("");
  const [giftEnd, setGiftEnd] = useState("");

  const handleOffer = async () => {
    if (!giftDesc.trim()) {
      setActionMsg({ type: "error", text: "Description requise" });
      return;
    }
    setOffering(true);
    const input: OfferGiftInput = {
      gift_type: giftType,
      description: giftDesc.trim(),
      value: giftValue,
      total_quantity: giftQty,
      conditions: giftConditions.trim() || undefined,
      validity_start: giftStart,
      validity_end: giftEnd,
    };
    try {
      const res = await offerPlatformGift(establishmentId, input);
      setActionMsg({ type: "success", text: res.message });
      setShowOfferForm(false);
      setGiftDesc(""); setGiftValue(0); setGiftQty(10); setGiftConditions("");
      onRefresh();
    } catch (e) {
      setActionMsg({ type: "error", text: e instanceof Error ? e.message : "Erreur" });
    } finally {
      setOffering(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Récompenses</CardTitle>
              <CardDescription>
                Offrez des récompenses à la communauté sam.ma pour gagner en visibilité
              </CardDescription>
            </div>
            {canEdit && !showOfferForm && (
              <Button onClick={() => setShowOfferForm(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Offrir un cadeau
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {showOfferForm && (
            <div className="space-y-4 mb-6 p-4 bg-slate-50 rounded-lg border">
              <h4 className="font-semibold">Nouveau cadeau</h4>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={giftType} onValueChange={setGiftType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free_item">Article offert</SelectItem>
                      <SelectItem value="percentage_discount">Réduction (%)</SelectItem>
                      <SelectItem value="fixed_discount">Réduction (MAD)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Valeur</Label>
                  <Input type="number" min={0} value={giftValue} onChange={(e) => setGiftValue(Number(e.target.value))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description *</Label>
                <Input value={giftDesc} onChange={(e) => setGiftDesc(e.target.value)} placeholder="1 entrée gratuite, -30% sur le menu..." />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Quantité</Label>
                  <Input type="number" min={1} value={giftQty} onChange={(e) => setGiftQty(Number(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Début validité</Label>
                  <Input type="date" value={giftStart} onChange={(e) => setGiftStart(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Fin validité</Label>
                  <Input type="date" value={giftEnd} onChange={(e) => setGiftEnd(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Conditions</Label>
                <Textarea value={giftConditions} onChange={(e) => setGiftConditions(e.target.value)} placeholder="Sur place uniquement, hors week-end..." rows={2} />
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowOfferForm(false)}>Annuler</Button>
                <Button onClick={handleOffer} disabled={offering} className="gap-2">
                  {offering && <Loader2 className="w-4 h-4 animate-spin" />}
                  Soumettre le cadeau
                </Button>
              </div>
            </div>
          )}

          {/* List of offered gifts */}
          {offeredGifts.length === 0 ? (
            <p className="text-center text-slate-500 py-8">
              Vous n'avez pas encore offert de cadeau à la communauté sam.ma
            </p>
          ) : (
            <div className="space-y-3">
              {offeredGifts.map((g: unknown) => {
                const gift = g as Record<string, unknown>;
                const status = gift.status as string;
                const statusLabel: Record<string, string> = {
                  offered: "En attente",
                  approved: "Approuvé",
                  rejected: "Refusé",
                  distributed: "Distribué",
                  expired: "Expiré",
                };
                const statusColor: Record<string, string> = {
                  offered: "bg-amber-100 text-amber-700",
                  approved: "bg-emerald-100 text-emerald-700",
                  rejected: "bg-red-100 text-red-700",
                  distributed: "bg-sky-100 text-sky-700",
                  expired: "bg-slate-100 text-slate-500",
                };
                return (
                  <div key={gift.id as string} className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <p className="font-semibold">{gift.description as string}</p>
                      <p className="text-sm text-slate-500">
                        {gift.gift_type === "percentage_discount" && `-${gift.value as number}%`}
                        {gift.gift_type === "fixed_discount" && `-${gift.value as number} MAD`}
                        {gift.gift_type === "free_item" && "Offert"}
                        {" • "}Qté: {gift.total_quantity as number}
                        {" • "}Distribué: {gift.distributed_count as number ?? 0}
                      </p>
                    </div>
                    <Badge className={cn("border-0", statusColor[status] ?? "bg-slate-100 text-slate-600")}>
                      {statusLabel[status] ?? status}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default ProLoyaltyV2Dashboard;
