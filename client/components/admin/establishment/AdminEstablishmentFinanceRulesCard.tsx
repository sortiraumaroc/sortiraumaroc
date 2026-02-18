import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Save, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  AdminApiError,
  createAdminCommissionOverride,
  updateAdminCommissionOverride,
  deleteAdminCommissionOverride,
  listAdminCommissionOverrides,
  getAdminFinanceRules,
  isAdminSuperadmin,
  type EstablishmentCommissionOverride,
  type FinanceRules,
} from "@/lib/adminApi";

type Draft = {
  active: boolean;
  commission_percent: string;
  pack_commission_percent: string;
  notes: string;
};

function toDraft(item: EstablishmentCommissionOverride | null): Draft {
  return {
    active: item?.active ?? true,
    commission_percent: item?.commission_percent != null ? String(item.commission_percent) : "",
    pack_commission_percent: item?.pack_commission_percent != null ? String(item.pack_commission_percent) : "",
    notes: item?.notes ?? "",
  };
}

function safeNumber(v: string): number | null {
  const trimmed = v.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function AdminEstablishmentFinanceRulesCard(props: { establishmentId: string }) {
  const { establishmentId } = props;
  const { toast } = useToast();

  const canEdit = isAdminSuperadmin();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [globalRules, setGlobalRules] = useState<FinanceRules | null>(null);
  const [localOverride, setLocalOverride] = useState<EstablishmentCommissionOverride | null>(null);
  const [draft, setDraft] = useState<Draft>(() => toDraft(null));
  const [isEditing, setIsEditing] = useState(false);

  const hasOverride = localOverride != null;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesRes, overridesRes] = await Promise.all([
        getAdminFinanceRules(),
        listAdminCommissionOverrides(undefined, { limit: 1000 }),
      ]);

      setGlobalRules(rulesRes.item);

      // Trouver l'override pour cet établissement
      const found = overridesRes.items.find((o) => o.establishment_id === establishmentId) ?? null;
      setLocalOverride(found);
      setDraft(toDraft(found));
    } catch (e) {
      // Ignorer l'erreur silencieusement
    } finally {
      setLoading(false);
    }
  }, [establishmentId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const effectiveReservationCommission = useMemo(() => {
    if (localOverride?.active && localOverride.commission_percent != null) {
      return `${localOverride.commission_percent}%`;
    }
    if (localOverride?.active && localOverride.commission_amount_cents != null) {
      return `${(localOverride.commission_amount_cents / 100).toFixed(2)} MAD`;
    }
    if (globalRules?.standard_commission_percent != null) {
      return `${globalRules.standard_commission_percent}% (global)`;
    }
    return "N/A";
  }, [localOverride, globalRules]);

  const effectivePackCommission = useMemo(() => {
    if (localOverride?.active && localOverride.pack_commission_percent != null) {
      return `${localOverride.pack_commission_percent}%`;
    }
    if (localOverride?.active && localOverride.pack_commission_amount_cents != null) {
      return `${(localOverride.pack_commission_amount_cents / 100).toFixed(2)} MAD`;
    }
    if (globalRules?.standard_commission_percent != null) {
      return `${globalRules.standard_commission_percent}% (global)`;
    }
    return "N/A";
  }, [localOverride, globalRules]);

  const onSave = async () => {
    setSaving(true);
    try {
      const commissionPercent = safeNumber(draft.commission_percent);
      const packCommissionPercent = safeNumber(draft.pack_commission_percent);

      const payload = {
        active: draft.active,
        commission_percent: commissionPercent,
        commission_amount_cents: null,
        pack_commission_percent: packCommissionPercent,
        pack_commission_amount_cents: null,
        notes: draft.notes.trim() || null,
      };

      let res: { ok: true; item: EstablishmentCommissionOverride };

      if (hasOverride) {
        res = await updateAdminCommissionOverride(undefined, establishmentId, payload);
      } else {
        res = await createAdminCommissionOverride(undefined, {
          establishment_id: establishmentId,
          ...payload,
        });
      }

      setLocalOverride(res.item);
      setDraft(toDraft(res.item));
      setIsEditing(false);
      toast({ title: "Enregistré", description: "Règles financières mises à jour." });
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!hasOverride) return;
    setDeleting(true);
    try {
      await deleteAdminCommissionOverride(undefined, establishmentId);
      setLocalOverride(null);
      setDraft(toDraft(null));
      setIsEditing(false);
      toast({ title: "Supprimé", description: "Override supprimé, règles globales appliquées." });
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const onCancel = () => {
    setDraft(toDraft(localOverride));
    setIsEditing(false);
  };

  return (
    <Card className="border-slate-200">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm font-bold flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span>Règles financières</span>
            <InfoTooltip content="Commissions personnalisées pour cet établissement (réservations et packs). Si non définies, les règles globales s'appliquent." />
          </div>
          {hasOverride ? (
            <Badge className={localOverride?.active ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200"}>
              {localOverride?.active ? "Personnalisé" : "Désactivé"}
            </Badge>
          ) : (
            <Badge className="bg-slate-100 text-slate-600 border-slate-200">Global</Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="p-4 pt-0 space-y-3">
        {loading ? (
          <div className="text-sm text-slate-600 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement…
          </div>
        ) : isEditing ? (
          <>
            {/* Mode édition */}
            <div className="flex items-center justify-between gap-2 py-2">
              <Label className="text-xs">Override actif</Label>
              <Switch
                checked={draft.active}
                onCheckedChange={(checked) => setDraft((d) => ({ ...d, active: checked }))}
              />
            </div>

            {/* Commissions */}
            <div className="grid grid-cols-2 gap-3">
              {/* Commission Réservations */}
              <div className="space-y-2 p-3 rounded-md bg-slate-50 border border-slate-200">
                <div className="text-xs font-semibold text-slate-700">Commission Réservations</div>
                <div>
                  <Label className="text-[10px]">Pourcentage (%)</Label>
                  <Input
                    value={draft.commission_percent}
                    onChange={(e) => setDraft((d) => ({ ...d, commission_percent: e.target.value }))}
                    placeholder={globalRules?.standard_commission_percent != null ? `Global: ${globalRules.standard_commission_percent}%` : "Ex: 10"}
                    inputMode="decimal"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="text-[10px] text-slate-500">
                  Prélevée sur chaque réservation.
                </div>
              </div>

              {/* Commission Packs */}
              <div className="space-y-2 p-3 rounded-md bg-amber-50 border border-amber-200">
                <div className="text-xs font-semibold text-amber-800">Commission Packs</div>
                <div>
                  <Label className="text-[10px]">Pourcentage (%)</Label>
                  <Input
                    value={draft.pack_commission_percent}
                    onChange={(e) => setDraft((d) => ({ ...d, pack_commission_percent: e.target.value }))}
                    placeholder={globalRules?.standard_commission_percent != null ? `Global: ${globalRules.standard_commission_percent}%` : "Ex: 10"}
                    inputMode="decimal"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="text-[10px] text-amber-700">
                  Prélevée sur chaque vente de pack.
                </div>
              </div>
            </div>

            <div>
              <Label className="text-[10px]">Notes internes</Label>
              <Textarea
                value={draft.notes}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                placeholder="Raison de l'override, date d'accord..."
                rows={2}
                className="text-sm"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" onClick={() => void onSave()} disabled={saving || deleting} className="gap-1.5 h-8">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Enregistrer
              </Button>
              <Button size="sm" variant="outline" onClick={onCancel} disabled={saving || deleting} className="h-8">
                <X className="h-3.5 w-3.5 me-1" />
                Annuler
              </Button>
              {hasOverride && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => void onDelete()}
                  disabled={saving || deleting}
                  className="h-8 ms-auto"
                >
                  {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Supprimer"}
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Mode lecture */}
            <div className="space-y-2">
              {/* Commission Réservations */}
              <div className="flex items-center justify-between gap-2 py-1.5 px-2 rounded bg-slate-50 border border-slate-200">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide">Commission Réservations</div>
                  <div className="text-sm font-medium">{effectiveReservationCommission}</div>
                </div>
                {canEdit && (
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setIsEditing(true)}>
                    <Pencil className="h-3.5 w-3.5 text-slate-500" />
                  </Button>
                )}
              </div>

              {/* Commission Packs */}
              <div className="flex items-center justify-between gap-2 py-1.5 px-2 rounded bg-amber-50 border border-amber-200">
                <div>
                  <div className="text-[10px] text-amber-700 uppercase tracking-wide">Commission Packs</div>
                  <div className="text-sm font-medium text-amber-900">{effectivePackCommission}</div>
                </div>
              </div>

              {localOverride?.notes && (
                <div className="py-1.5 px-2 rounded bg-slate-50 border border-slate-200">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide">Notes</div>
                  <div className="text-xs text-slate-700 mt-0.5">{localOverride.notes}</div>
                </div>
              )}

              {globalRules && !hasOverride && (
                <div className="text-[10px] text-slate-500 pt-1">
                  Règles globales : Standard {globalRules.standard_commission_percent}% • Boost {globalRules.boost_commission_percent_min}%-{globalRules.boost_commission_percent_max}% • Garantie {globalRules.guarantee_commission_percent}%
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
