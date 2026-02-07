// =============================================================================
// PRO LOYALTY TAB - Gestion des programmes de fidélité
// =============================================================================

import { useCallback, useEffect, useState } from "react";
import {
  Award, ChevronRight, Clock, Coffee, CreditCard, Crown, Edit3, Eye, Gift,
  Heart, History, Loader2, MoreVertical, Palette, Percent, Plus, QrCode, Save,
  Settings, Sparkles, Star, Tag, Target, Trash2, TrendingUp, Upload, Users,
  X, Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import { LoyaltyCardPreview, LoyaltyCardMini } from "@/components/loyalty/LoyaltyCardVisual";
import {
  listLoyaltyPrograms,
  createLoyaltyProgram,
  updateLoyaltyProgram,
  deleteLoyaltyProgram,
  getLoyaltyMembers,
  getLoyaltyDashboardStats,
  applyRetroactiveStamps,
  type LoyaltyDashboardStats,
} from "@/lib/loyalty/api";
import type { LoyaltyProgram, LoyaltyMember, CardDesign, RewardType } from "@/lib/loyalty/types";
import { CARD_DESIGN_PRESETS, STAMP_ICONS } from "@/lib/loyalty/types";
import type { Establishment } from "@/lib/pro/types";
import { cn } from "@/lib/utils";

// =============================================================================
// TYPES
// =============================================================================

type Props = {
  establishment: Establishment;
  role: string;
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ProLoyaltyTab({ establishment, role }: Props) {
  const canEdit = ["owner", "manager", "marketing"].includes(role);

  // État
  const [programs, setPrograms] = useState<LoyaltyProgram[]>([]);
  const [members, setMembers] = useState<LoyaltyMember[]>([]);
  const [stats, setStats] = useState<LoyaltyDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialogs
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingProgram, setEditingProgram] = useState<LoyaltyProgram | null>(null);
  const [memberDetailOpen, setMemberDetailOpen] = useState<LoyaltyMember | null>(null);

  // Chargement initial
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [programsData, statsData, membersData] = await Promise.all([
        listLoyaltyPrograms(establishment.id),
        getLoyaltyDashboardStats(establishment.id),
        getLoyaltyMembers(establishment.id, { perPage: 20 }),
      ]);

      setPrograms(programsData);
      setStats(statsData);
      setMembers(membersData.members);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [establishment.id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Handlers
  const handleDeleteProgram = async (program: LoyaltyProgram) => {
    if (!window.confirm(`Supprimer le programme "${program.name}" ? Cette action est irréversible.`)) return;

    try {
      await deleteLoyaltyProgram(establishment.id, program.id);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de suppression");
    }
  };

  const handleApplyRetroactive = async (program: LoyaltyProgram) => {
    if (!window.confirm("Appliquer les tampons rétroactifs ? Cette action créera des cartes pour les clients ayant des réservations passées.")) return;

    try {
      const result = await applyRetroactiveStamps(establishment.id, program.id);
      alert(result.message);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-slate-600">Chargement...</span>
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
            Programme de Fidélité
          </h2>
          <p className="text-slate-600 mt-1">
            Créez et gérez vos cartes de fidélité digitales
          </p>
        </div>

        {canEdit && (
          <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Créer un programme
          </Button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview" className="gap-2">
            <TrendingUp className="w-4 h-4" />
            Vue d'ensemble
          </TabsTrigger>
          <TabsTrigger value="programs" className="gap-2">
            <CreditCard className="w-4 h-4" />
            Programmes ({programs.length})
          </TabsTrigger>
          <TabsTrigger value="members" className="gap-2">
            <Users className="w-4 h-4" />
            Membres ({members.length})
          </TabsTrigger>
        </TabsList>

        {/* ============ OVERVIEW TAB ============ */}
        <TabsContent value="overview" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <CreditCard className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats?.total_active_cards ?? 0}</p>
                    <p className="text-sm text-slate-500">Cartes actives</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-100">
                    <Gift className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats?.total_rewards_pending ?? 0}</p>
                    <p className="text-sm text-slate-500">Récompenses en attente</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-100">
                    <Sparkles className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats?.total_rewards_used_this_month ?? 0}</p>
                    <p className="text-sm text-slate-500">Utilisées ce mois</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-violet-100">
                    <Users className="w-5 h-5 text-violet-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{members.length}</p>
                    <p className="text-sm text-slate-500">Membres fidèles</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <History className="w-5 h-5" />
                Activité récente
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats?.recent_activity && stats.recent_activity.length > 0 ? (
                <div className="space-y-3">
                  {stats.recent_activity.slice(0, 10).map((activity, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 text-sm"
                    >
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center",
                        activity.type === "stamp" && "bg-primary/10 text-primary",
                        activity.type === "reward_created" && "bg-amber-100 text-amber-600",
                        activity.type === "reward_used" && "bg-emerald-100 text-emerald-600"
                      )}>
                        {activity.type === "stamp" && <QrCode className="w-4 h-4" />}
                        {activity.type === "reward_created" && <Gift className="w-4 h-4" />}
                        {activity.type === "reward_used" && <Sparkles className="w-4 h-4" />}
                      </div>
                      <div className="flex-1">
                        <span className="font-medium">{activity.user_name}</span>
                        {activity.type === "stamp" && " a reçu un tampon"}
                        {activity.type === "reward_created" && " a débloqué une récompense"}
                        {activity.type === "reward_used" && " a utilisé sa récompense"}
                        <span className="text-slate-500"> • {activity.program_name}</span>
                      </div>
                      <span className="text-xs text-slate-400">
                        {new Date(activity.timestamp).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-center py-6">
                  Aucune activité récente
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ PROGRAMS TAB ============ */}
        <TabsContent value="programs" className="space-y-6">
          {programs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Award className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Aucun programme</h3>
                <p className="text-slate-500 mb-4">
                  Créez votre premier programme de fidélité pour récompenser vos clients réguliers.
                </p>
                {canEdit && (
                  <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
                    <Plus className="w-4 h-4" />
                    Créer un programme
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-6">
              {programs.map((program) => (
                <Card key={program.id} className="overflow-hidden">
                  <div className="p-4">
                    <LoyaltyCardPreview
                      design={program.card_design}
                      programName={program.name}
                      stampsRequired={program.stamps_required}
                      rewardDescription={program.reward_description}
                      establishmentName={establishment.name ?? "Mon Établissement"}
                    />
                  </div>

                  <CardContent className="border-t pt-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{program.name}</h3>
                          <Badge variant={program.is_active ? "default" : "secondary"}>
                            {program.is_active ? "Actif" : "Inactif"}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-500 mt-1">
                          {program.stamps_required} tampons → {program.reward_description}
                        </p>
                      </div>

                      {canEdit && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditingProgram(program)}>
                              <Edit3 className="w-4 h-4 mr-2" />
                              Modifier
                            </DropdownMenuItem>
                            {program.allow_retroactive_stamps && (
                              <DropdownMenuItem onClick={() => handleApplyRetroactive(program)}>
                                <History className="w-4 h-4 mr-2" />
                                Appliquer rétroactif
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => handleDeleteProgram(program)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Supprimer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>

                    {/* Stats du programme */}
                    <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                      <div className="p-2 bg-slate-50 rounded-lg">
                        <p className="text-lg font-bold text-primary">
                          {/* À compléter avec les stats */}
                          --
                        </p>
                        <p className="text-xs text-slate-500">Cartes</p>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-lg">
                        <p className="text-lg font-bold text-amber-600">--</p>
                        <p className="text-xs text-slate-500">En attente</p>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-lg">
                        <p className="text-lg font-bold text-emerald-600">--</p>
                        <p className="text-xs text-slate-500">Utilisées</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ============ MEMBERS TAB ============ */}
        <TabsContent value="members" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Membres fidèles</CardTitle>
              <CardDescription>
                Tous les clients participant à vos programmes de fidélité
              </CardDescription>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <p className="text-center text-slate-500 py-8">
                  Aucun membre pour le moment. Les clients s'inscriront automatiquement lors de leur premier scan.
                </p>
              ) : (
                <div className="space-y-3">
                  {members.map((member) => (
                    <div
                      key={member.user_id}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-slate-50 cursor-pointer"
                      onClick={() => setMemberDetailOpen(member)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="font-bold text-primary">
                            {member.full_name?.charAt(0)?.toUpperCase() ?? "?"}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium">{member.full_name}</p>
                          <p className="text-sm text-slate-500">
                            {member.total_stamps} tampons • {member.cards.length} carte(s)
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {member.cards.some((c) => c.has_pending_reward) && (
                          <Badge className="bg-amber-100 text-amber-700 border-0">
                            <Gift className="w-3 h-3 mr-1" />
                            Récompense
                          </Badge>
                        )}
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog création/édition */}
      <ProgramFormDialog
        open={createDialogOpen || !!editingProgram}
        onClose={() => {
          setCreateDialogOpen(false);
          setEditingProgram(null);
        }}
        program={editingProgram}
        establishmentId={establishment.id}
        establishmentName={establishment.name ?? "Mon Établissement"}
        onSaved={loadData}
      />

      {/* Dialog détail membre */}
      {memberDetailOpen && (
        <Dialog open={true} onOpenChange={() => setMemberDetailOpen(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{memberDetailOpen.full_name}</DialogTitle>
              <DialogDescription>
                Membre depuis {new Date(memberDetailOpen.first_visit).toLocaleDateString("fr-FR")}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-primary">{memberDetailOpen.total_stamps}</p>
                  <p className="text-sm text-slate-500">Tampons total</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-emerald-600">
                    {memberDetailOpen.total_rewards_used}
                  </p>
                  <p className="text-sm text-slate-500">Récompenses utilisées</p>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Cartes de fidélité</h4>
                <div className="space-y-2">
                  {memberDetailOpen.cards.map((card, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-sm">{card.program_name}</p>
                        <p className="text-xs text-slate-500">
                          {card.stamps_count}/{card.stamps_required} tampons
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{
                              width: `${Math.min((card.stamps_count / card.stamps_required) * 100, 100)}%`,
                            }}
                          />
                        </div>
                        {card.has_pending_reward && (
                          <Gift className="w-4 h-4 text-amber-500" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {memberDetailOpen.email && (
                <p className="text-sm text-slate-500">
                  Email: {memberDetailOpen.email}
                </p>
              )}
              {memberDetailOpen.phone && (
                <p className="text-sm text-slate-500">
                  Tél: {memberDetailOpen.phone}
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// =============================================================================
// PROGRAM FORM DIALOG
// =============================================================================

function ProgramFormDialog({
  open,
  onClose,
  program,
  establishmentId,
  establishmentName,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  program: LoyaltyProgram | null;
  establishmentId: string;
  establishmentName: string;
  onSaved: () => void;
}) {
  const isEdit = !!program;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState(program?.name ?? "");
  const [description, setDescription] = useState(program?.description ?? "");
  const [stampsRequired, setStampsRequired] = useState(program?.stamps_required ?? 10);
  const [rewardType, setRewardType] = useState<RewardType>(program?.reward_type ?? "free_item");
  const [rewardValue, setRewardValue] = useState(program?.reward_value ?? "");
  const [rewardDescription, setRewardDescription] = useState(program?.reward_description ?? "");
  const [rewardValidityDays, setRewardValidityDays] = useState(program?.reward_validity_days ?? 30);
  const [conditions, setConditions] = useState(program?.conditions ?? "");
  const [stampsExpireDays, setStampsExpireDays] = useState(program?.stamps_expire_after_days ?? 180);
  const [allowRetroactive, setAllowRetroactive] = useState(program?.allow_retroactive_stamps ?? false);
  const [isActive, setIsActive] = useState(program?.is_active ?? true);

  // Card design
  const [designStyle, setDesignStyle] = useState<CardDesign["style"]>(
    (program?.card_design as CardDesign)?.style ?? "gradient"
  );
  const [primaryColor, setPrimaryColor] = useState(
    (program?.card_design as CardDesign)?.primary_color ?? "#6366f1"
  );
  const [secondaryColor, setSecondaryColor] = useState(
    (program?.card_design as CardDesign)?.secondary_color ?? "#8b5cf6"
  );
  const [stampIcon, setStampIcon] = useState(
    (program?.card_design as CardDesign)?.stamp_icon ?? "coffee"
  );

  // Reset form when program changes
  useEffect(() => {
    if (program) {
      setName(program.name);
      setDescription(program.description ?? "");
      setStampsRequired(program.stamps_required);
      setRewardType(program.reward_type);
      setRewardValue(program.reward_value ?? "");
      setRewardDescription(program.reward_description);
      setRewardValidityDays(program.reward_validity_days);
      setConditions(program.conditions ?? "");
      setStampsExpireDays(program.stamps_expire_after_days ?? 180);
      setAllowRetroactive(program.allow_retroactive_stamps);
      setIsActive(program.is_active);

      const design = program.card_design as CardDesign;
      setDesignStyle(design?.style ?? "gradient");
      setPrimaryColor(design?.primary_color ?? "#6366f1");
      setSecondaryColor(design?.secondary_color ?? "#8b5cf6");
      setStampIcon(design?.stamp_icon ?? "coffee");
    } else {
      // Reset to defaults
      setName("");
      setDescription("");
      setStampsRequired(10);
      setRewardType("free_item");
      setRewardValue("");
      setRewardDescription("");
      setRewardValidityDays(30);
      setConditions("");
      setStampsExpireDays(180);
      setAllowRetroactive(false);
      setIsActive(true);
      setDesignStyle("gradient");
      setPrimaryColor("#6366f1");
      setSecondaryColor("#8b5cf6");
      setStampIcon("coffee");
    }
  }, [program, open]);

  const handleSave = async () => {
    if (!name.trim() || !rewardDescription.trim()) {
      setError("Le nom et la description de la récompense sont requis");
      return;
    }

    setSaving(true);
    setError(null);

    const data = {
      name: name.trim(),
      description: description.trim() || null,
      stamps_required: stampsRequired,
      reward_type: rewardType,
      reward_value: rewardValue.trim() || null,
      reward_description: rewardDescription.trim(),
      reward_validity_days: rewardValidityDays,
      conditions: conditions.trim() || null,
      stamps_expire_after_days: stampsExpireDays,
      allow_retroactive_stamps: allowRetroactive,
      is_active: isActive,
      card_design: {
        style: designStyle,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        stamp_icon: stampIcon,
        logo_url: null,
      },
    };

    try {
      if (isEdit && program) {
        await updateLoyaltyProgram(establishmentId, program.id, data);
      } else {
        await createLoyaltyProgram(establishmentId, data);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = (presetKey: keyof typeof CARD_DESIGN_PRESETS) => {
    const preset = CARD_DESIGN_PRESETS[presetKey];
    setDesignStyle(preset.style);
    setPrimaryColor(preset.primary_color);
    setSecondaryColor(preset.secondary_color);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="w-5 h-5 text-primary" />
            {isEdit ? "Modifier le programme" : "Créer un programme de fidélité"}
          </DialogTitle>
          <DialogDescription>
            Configurez votre carte de fidélité digitale
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* Colonne gauche: Formulaire */}
          <div className="space-y-6">
            {/* Informations de base */}
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Informations
              </h3>

              <div className="space-y-2">
                <Label>Nom du programme *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Carte Café Fidèle"
                />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Décrivez votre programme..."
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Tampons requis</Label>
                  <Input
                    type="number"
                    min={2}
                    max={50}
                    value={stampsRequired}
                    onChange={(e) => setStampsRequired(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Expiration tampons (jours)</Label>
                  <Input
                    type="number"
                    min={30}
                    max={365}
                    value={stampsExpireDays}
                    onChange={(e) => setStampsExpireDays(Number(e.target.value))}
                  />
                </div>
              </div>
            </div>

            {/* Récompense */}
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Gift className="w-4 h-4" />
                Récompense
              </h3>

              <div className="space-y-2">
                <Label>Type de récompense</Label>
                <Select value={rewardType} onValueChange={(v) => setRewardType(v as RewardType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free_item">Article offert</SelectItem>
                    <SelectItem value="discount_percent">Réduction (%)</SelectItem>
                    <SelectItem value="discount_fixed">Réduction (MAD)</SelectItem>
                    <SelectItem value="custom">Personnalisé</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(rewardType === "discount_percent" || rewardType === "discount_fixed") && (
                <div className="space-y-2">
                  <Label>Valeur {rewardType === "discount_percent" ? "(%)" : "(MAD)"}</Label>
                  <Input
                    value={rewardValue}
                    onChange={(e) => setRewardValue(e.target.value)}
                    placeholder={rewardType === "discount_percent" ? "20" : "50"}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Description de la récompense *</Label>
                <Input
                  value={rewardDescription}
                  onChange={(e) => setRewardDescription(e.target.value)}
                  placeholder="Ex: 1 café offert, 20% sur l'addition..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Validité du bon (jours)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={rewardValidityDays}
                    onChange={(e) => setRewardValidityDays(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Conditions d'utilisation</Label>
                <Textarea
                  value={conditions}
                  onChange={(e) => setConditions(e.target.value)}
                  placeholder="Ex: Hors week-end, sur place uniquement..."
                  rows={2}
                />
              </div>
            </div>

            {/* Options */}
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Options
              </h3>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Programme actif</p>
                  <p className="text-xs text-slate-500">Visible et utilisable par les clients</p>
                </div>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Tampons rétroactifs</p>
                  <p className="text-xs text-slate-500">Comptabiliser les visites passées</p>
                </div>
                <Switch checked={allowRetroactive} onCheckedChange={setAllowRetroactive} />
              </div>
            </div>
          </div>

          {/* Colonne droite: Design */}
          <div className="space-y-6">
            <h3 className="font-semibold flex items-center gap-2">
              <Palette className="w-4 h-4" />
              Design de la carte
            </h3>

            {/* Preview */}
            <LoyaltyCardPreview
              design={{
                style: designStyle,
                primary_color: primaryColor,
                secondary_color: secondaryColor,
                stamp_icon: stampIcon,
              }}
              programName={name || "Mon Programme"}
              stampsRequired={stampsRequired}
              rewardDescription={rewardDescription || "Récompense"}
              establishmentName={establishmentName}
            />

            {/* Style */}
            <div className="space-y-2">
              <Label>Style</Label>
              <div className="grid grid-cols-4 gap-2">
                {(["gradient", "pastel", "solid", "neon"] as const).map((style) => (
                  <Button
                    key={style}
                    type="button"
                    variant={designStyle === style ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDesignStyle(style)}
                  >
                    {style === "gradient" && "Dégradé"}
                    {style === "pastel" && "Pastel"}
                    {style === "solid" && "Uni"}
                    {style === "neon" && "Néon"}
                  </Button>
                ))}
              </div>
            </div>

            {/* Presets */}
            <div className="space-y-2">
              <Label>Couleurs prédéfinies</Label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(CARD_DESIGN_PRESETS).slice(0, 10).map(([key, preset]) => (
                  <button
                    key={key}
                    type="button"
                    className="w-8 h-8 rounded-full border-2 border-white shadow-md hover:scale-110 transition-transform"
                    style={{
                      background: preset.style === "gradient"
                        ? `linear-gradient(135deg, ${preset.primary_color}, ${preset.secondary_color})`
                        : preset.primary_color,
                    }}
                    onClick={() => applyPreset(key as keyof typeof CARD_DESIGN_PRESETS)}
                    title={key.replace("_", " ")}
                  />
                ))}
              </div>
            </div>

            {/* Couleurs personnalisées */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Couleur principale</Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-10 h-10 rounded cursor-pointer"
                  />
                  <Input
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Couleur secondaire</Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="w-10 h-10 rounded cursor-pointer"
                  />
                  <Input
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>

            {/* Icône tampon */}
            <div className="space-y-2">
              <Label>Icône des tampons</Label>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 border rounded-lg">
                {STAMP_ICONS.map((icon) => {
                  const IconComponent = {
                    coffee: Coffee,
                    star: Star,
                    heart: Heart,
                    gift: Gift,
                    crown: Crown,
                    sparkles: Sparkles,
                    zap: Zap,
                  }[icon] ?? Star;

                  return (
                    <button
                      key={icon}
                      type="button"
                      className={cn(
                        "p-2 rounded-lg transition-colors",
                        stampIcon === icon
                          ? "bg-primary text-white"
                          : "bg-slate-100 hover:bg-slate-200"
                      )}
                      onClick={() => setStampIcon(icon)}
                    >
                      <IconComponent className="w-5 h-5" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 mt-6">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            <Save className="w-4 h-4" />
            {isEdit ? "Enregistrer" : "Créer le programme"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
