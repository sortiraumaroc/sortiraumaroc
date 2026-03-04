import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Check, Clock, Loader2, Pencil, RotateCcw, Save, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  AdminApiError,
  getAdminEstablishmentBookingPolicy,
  updateAdminEstablishmentBookingPolicy,
  resetAdminEstablishmentBookingPolicy,
  isAdminSuperadmin,
  type AdminEstablishmentBookingPolicy,
} from "@/lib/adminApi";

function BooleanBadge(props: { value: boolean; trueLabel?: string; falseLabel?: string }) {
  return props.value ? (
    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1">
      <Check className="h-3 w-3" />
      {props.trueLabel ?? "Oui"}
    </Badge>
  ) : (
    <Badge className="bg-slate-100 text-slate-600 border-slate-200 gap-1">
      <X className="h-3 w-3" />
      {props.falseLabel ?? "Non"}
    </Badge>
  );
}

function FieldRow(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 px-2 rounded bg-slate-50 border border-slate-200">
      <div className="text-xs text-slate-600">{props.label}</div>
      <div className="text-sm font-medium text-slate-900">{props.children}</div>
    </div>
  );
}

type Draft = {
  cancellation_enabled: boolean;
  free_cancellation_hours: string;
  cancellation_penalty_percent: string;
  no_show_penalty_percent: string;
  modification_enabled: boolean;
  modification_deadline_hours: string;
};

function getDefaults(): Draft {
  return {
    cancellation_enabled: false,
    free_cancellation_hours: "24",
    cancellation_penalty_percent: "50",
    no_show_penalty_percent: "100",
    modification_enabled: true,
    modification_deadline_hours: "2",
  };
}

function toDraft(policy: AdminEstablishmentBookingPolicy | null): Draft {
  if (!policy) return getDefaults();
  return {
    cancellation_enabled: policy.cancellation_enabled,
    free_cancellation_hours: String(policy.free_cancellation_hours),
    cancellation_penalty_percent: String(policy.cancellation_penalty_percent),
    no_show_penalty_percent: String(policy.no_show_penalty_percent),
    modification_enabled: policy.modification_enabled,
    modification_deadline_hours: String(policy.modification_deadline_hours),
  };
}

function safeNumber(v: string): number | null {
  const trimmed = v.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function AdminEstablishmentBookingPolicyCard(props: { establishmentId: string }) {
  const { establishmentId } = props;
  const { toast } = useToast();

  const canEdit = isAdminSuperadmin();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [policy, setPolicy] = useState<AdminEstablishmentBookingPolicy | null>(null);
  const [draft, setDraft] = useState<Draft>(() => getDefaults());
  const [isEditing, setIsEditing] = useState(false);

  const hasPolicy = policy != null;

  const loadPolicy = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAdminEstablishmentBookingPolicy(undefined, establishmentId);
      setPolicy(res.policy);
      setDraft(toDraft(res.policy));
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur de chargement";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [establishmentId]);

  useEffect(() => {
    void loadPolicy();
  }, [loadPolicy]);

  const onSave = async () => {
    setSaving(true);
    try {
      const payload: Partial<AdminEstablishmentBookingPolicy> = {
        cancellation_enabled: draft.cancellation_enabled,
        free_cancellation_hours: safeNumber(draft.free_cancellation_hours) ?? 24,
        cancellation_penalty_percent: safeNumber(draft.cancellation_penalty_percent) ?? 50,
        no_show_penalty_percent: safeNumber(draft.no_show_penalty_percent) ?? 100,
        no_show_always_100_guaranteed: true,
        cancellation_text_fr: "",
        modification_enabled: draft.modification_enabled,
        modification_deadline_hours: safeNumber(draft.modification_deadline_hours) ?? 2,
        require_guarantee_below_score: null,
        modification_text_fr: "",
      };

      const res = await updateAdminEstablishmentBookingPolicy(undefined, establishmentId, payload);
      setPolicy(res.policy);
      setDraft(toDraft(res.policy));
      setIsEditing(false);
      toast({ title: "Enregistré", description: "Règles de réservation mises à jour." });
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const onReset = async () => {
    if (!hasPolicy) return;
    setResetting(true);
    try {
      await resetAdminEstablishmentBookingPolicy(undefined, establishmentId);
      setPolicy(null);
      setDraft(getDefaults());
      setIsEditing(false);
      toast({ title: "Réinitialisé", description: "Règles globales de Sortir Au Maroc appliquées." });
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  const onCancel = () => {
    setDraft(toDraft(policy));
    setIsEditing(false);
  };

  return (
    <Card className="border-slate-200">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm font-bold flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span>Règles de réservation</span>
            <InfoTooltip content="Paramètres d'annulation et de modification pour cet établissement. Les superadmins peuvent personnaliser ces règles." />
          </div>
          {hasPolicy ? (
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Configuré</Badge>
          ) : !loading && !error ? (
            <Badge className="bg-slate-100 text-slate-600 border-slate-200">Par défaut</Badge>
          ) : null}
        </CardTitle>
      </CardHeader>

      <CardContent className="p-4 pt-0 space-y-3">
        {loading ? (
          <div className="text-sm text-slate-600 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement…
          </div>
        ) : error ? (
          <div className="text-xs text-red-600 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        ) : isEditing ? (
          <>
            {/* Mode édition */}
            <div className="space-y-4">
              {/* Section Annulation */}
              <div className="space-y-2 p-3 rounded-md bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Politique d'annulation
                  </div>
                  <Switch
                    checked={draft.cancellation_enabled}
                    onCheckedChange={(checked) => setDraft((d) => ({ ...d, cancellation_enabled: checked }))}
                  />
                </div>

                {draft.cancellation_enabled && (
                  <div className="grid grid-cols-3 gap-3 pt-2">
                    <div>
                      <Label className="text-[10px]">Gratuite jusqu'à (h)</Label>
                      <Input
                        value={draft.free_cancellation_hours}
                        onChange={(e) => setDraft((d) => ({ ...d, free_cancellation_hours: e.target.value }))}
                        placeholder="24"
                        inputMode="numeric"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">Pénalité tardive (%)</Label>
                      <Input
                        value={draft.cancellation_penalty_percent}
                        onChange={(e) => setDraft((d) => ({ ...d, cancellation_penalty_percent: e.target.value }))}
                        placeholder="50"
                        inputMode="numeric"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">Pénalité no-show (%)</Label>
                      <Input
                        value={draft.no_show_penalty_percent}
                        onChange={(e) => setDraft((d) => ({ ...d, no_show_penalty_percent: e.target.value }))}
                        placeholder="100"
                        inputMode="numeric"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Section Modification */}
              <div className="space-y-2 p-3 rounded-md bg-blue-50 border border-blue-200">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Modifications
                  </div>
                  <Switch
                    checked={draft.modification_enabled}
                    onCheckedChange={(checked) => setDraft((d) => ({ ...d, modification_enabled: checked }))}
                  />
                </div>

                {draft.modification_enabled && (
                  <div className="pt-2">
                    <Label className="text-[10px]">Délai minimum (heures avant)</Label>
                    <Input
                      value={draft.modification_deadline_hours}
                      onChange={(e) => setDraft((d) => ({ ...d, modification_deadline_hours: e.target.value }))}
                      placeholder="2"
                      inputMode="numeric"
                      className="h-8 text-sm w-24"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" onClick={() => void onSave()} disabled={saving || resetting} className="gap-1.5 h-8">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Enregistrer
              </Button>
              <Button size="sm" variant="outline" onClick={onCancel} disabled={saving || resetting} className="h-8">
                <X className="h-3.5 w-3.5 me-1" />
                Annuler
              </Button>
              {hasPolicy && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => void onReset()}
                  disabled={saving || resetting}
                  className="h-8 ms-auto gap-1.5"
                >
                  {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  Réinitialiser
                </Button>
              )}
            </div>
          </>
        ) : !hasPolicy ? (
          <>
            <div className="text-xs text-slate-500">
              Aucune règle personnalisée. Les règles globales de Sortir Au Maroc s'appliquent.
            </div>
            {canEdit && (
              <Button size="sm" variant="outline" onClick={() => setIsEditing(true)} className="h-8 gap-1.5">
                <Pencil className="h-3.5 w-3.5" />
                Configurer
              </Button>
            )}
          </>
        ) : (
          <div className="space-y-3">
            {/* Header avec bouton edit */}
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-500">Règles personnalisées</div>
              {canEdit && (
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setIsEditing(true)}>
                  <Pencil className="h-3.5 w-3.5 text-slate-500" />
                </Button>
              )}
            </div>

            {/* Section Annulation - Lecture */}
            <div className="p-3 rounded-md bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Annulation
                </div>
                <BooleanBadge value={policy.cancellation_enabled} trueLabel="Active" falseLabel="Désactivée" />
              </div>
              {policy.cancellation_enabled && (
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="text-center p-2 bg-white rounded border">
                    <div className="text-slate-500">Gratuite</div>
                    <div className="font-semibold">{policy.free_cancellation_hours}h avant</div>
                  </div>
                  <div className="text-center p-2 bg-white rounded border">
                    <div className="text-slate-500">Pénalité</div>
                    <div className="font-semibold">{policy.cancellation_penalty_percent}%</div>
                  </div>
                  <div className="text-center p-2 bg-white rounded border">
                    <div className="text-slate-500">No-show</div>
                    <div className="font-semibold">{policy.no_show_penalty_percent}%</div>
                  </div>
                </div>
              )}
            </div>

            {/* Section Modification - Lecture */}
            <div className="p-3 rounded-md bg-blue-50 border border-blue-200 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Modifications
                </div>
                <BooleanBadge value={policy.modification_enabled} trueLabel="Autorisées" falseLabel="Interdites" />
              </div>
              {policy.modification_enabled && (
                <div className="text-xs">
                  <span className="text-blue-600">Délai minimum :</span>{" "}
                  <span className="font-semibold">{policy.modification_deadline_hours}h avant</span>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
