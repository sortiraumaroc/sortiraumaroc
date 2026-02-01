import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { AdminApiError, updateAdminFinanceRules, type FinanceRules } from "@/lib/adminApi";

import type { SettingsReportPatch, ToastInput } from "../../AdminSettingsPage";
import { centsFromMad, madFromCents, safeNumber } from "../utils";

type Draft = {
  standard: string;
  boostMin: string;
  boostMax: string;
  guarantee: string;
  minDepositMad: string;
};

function toDraft(r: FinanceRules): Draft {
  return {
    standard: String(r.standard_commission_percent ?? 0),
    boostMin: String(r.boost_commission_percent_min ?? 0),
    boostMax: String(r.boost_commission_percent_max ?? 0),
    guarantee: String(r.guarantee_commission_percent ?? 0),
    minDepositMad: String(madFromCents(r.min_deposit_amount_cents ?? 0)),
  };
}

function normalize(v: string): string {
  return v.trim();
}

export function FinanceRulesSettingsCard(props: {
  rules: FinanceRules | null;
  onRulesChange: (next: FinanceRules | null) => void;
  onReport: (patch: SettingsReportPatch) => void;
  onToast: (toast: ToastInput) => void;
}) {
  const { rules, onRulesChange, onReport, onToast } = props;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (rules) setDraft(toDraft(rules));
  }, [rules]);

  const changes = useMemo(() => {
    if (!rules || !draft) return null;

    const standard = safeNumber(draft.standard);
    const boostMin = safeNumber(draft.boostMin);
    const boostMax = safeNumber(draft.boostMax);
    const guarantee = safeNumber(draft.guarantee);
    const minDepositMad = safeNumber(draft.minDepositMad);

    const next = {
      standard_commission_percent: standard,
      boost_commission_percent_min: boostMin,
      boost_commission_percent_max: boostMax,
      guarantee_commission_percent: guarantee,
      min_deposit_amount_cents: minDepositMad == null ? null : centsFromMad(minDepositMad),
    };

    const same =
      next.standard_commission_percent === rules.standard_commission_percent &&
      next.boost_commission_percent_min === rules.boost_commission_percent_min &&
      next.boost_commission_percent_max === rules.boost_commission_percent_max &&
      next.guarantee_commission_percent === rules.guarantee_commission_percent &&
      next.min_deposit_amount_cents === rules.min_deposit_amount_cents;

    return { next, same };
  }, [draft, rules]);

  const save = async () => {
    if (!rules || !draft || !changes) return;
    if (changes.same) {
      onToast({ title: "⚠️ Rien à faire", description: "Aucun changement financier." });
      onReport({ noop: 1 });
      return;
    }

    const standard = safeNumber(draft.standard);
    const boostMin = safeNumber(draft.boostMin);
    const boostMax = safeNumber(draft.boostMax);
    const guarantee = safeNumber(draft.guarantee);
    const minDepositMad = safeNumber(draft.minDepositMad);

    if (standard == null || boostMin == null || boostMax == null || guarantee == null || minDepositMad == null) {
      onToast({ title: "❌ Erreur", description: "Veuillez vérifier les valeurs.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const res = await updateAdminFinanceRules(undefined, {
        standard_commission_percent: standard,
        boost_commission_percent_min: boostMin,
        boost_commission_percent_max: boostMax,
        guarantee_commission_percent: guarantee,
        min_deposit_amount_cents: centsFromMad(minDepositMad),
      });

      onRulesChange(res.item);
      onToast({ title: "✔️ Paramètres mis à jour", description: "Règles financières sauvegardées." });
      onReport({ modified: 1 });
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      onToast({ title: "❌ Erreur", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!rules || !draft) {
    return (
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">SECTION 3 — Commissions & Règles Financières</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">Règles indisponibles (finance_rules).</CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Règles financières</CardTitle>
          <InfoTooltip
            content={
              <div className="space-y-1">
                <div>Commissions (standard/boost/garantie) + acompte minimum.</div>
                <div className="text-slate-500">Table : finance_rules</div>
              </div>
            }
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Commission standard (%)</Label>
            <Input value={draft.standard} onChange={(e) => setDraft((d) => (d ? { ...d, standard: e.target.value } : d))} inputMode="decimal" />
          </div>
          <div className="space-y-1">
            <Label>Commission garantie (escrow) (%)</Label>
            <Input value={draft.guarantee} onChange={(e) => setDraft((d) => (d ? { ...d, guarantee: e.target.value } : d))} inputMode="decimal" />
          </div>
          <div className="space-y-1">
            <Label>Commission boost / publicité min (%)</Label>
            <Input value={draft.boostMin} onChange={(e) => setDraft((d) => (d ? { ...d, boostMin: e.target.value } : d))} inputMode="decimal" />
          </div>
          <div className="space-y-1">
            <Label>Commission boost / publicité max (%)</Label>
            <Input value={draft.boostMax} onChange={(e) => setDraft((d) => (d ? { ...d, boostMax: e.target.value } : d))} inputMode="decimal" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Montant minimum acompte (MAD)</Label>
            <Input
              value={draft.minDepositMad}
              onChange={(e) => setDraft((d) => (d ? { ...d, minDepositMad: e.target.value } : d))}
              inputMode="decimal"
            />
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
              <span>Stockage interne</span>
              <InfoTooltip content={<>Valeur enregistrée en cents: {centsFromMad(safeNumber(draft.minDepositMad) ?? 0)}.</>} />
            </div>
          </div>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={saving} className="w-full">
              {saving ? "Enregistrement…" : "Enregistrer (confirmation)"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmer la mise à jour financière</AlertDialogTitle>
              <AlertDialogDescription>
                Ces paramètres impactent les commissions, les garanties et l’acompte minimum.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="font-semibold">Résumé</div>
              <div className="mt-2 grid grid-cols-1 gap-1">
                <div>Standard : {rules.standard_commission_percent}% → {normalize(draft.standard)}%</div>
                <div>Boost : {rules.boost_commission_percent_min}%–{rules.boost_commission_percent_max}% → {normalize(draft.boostMin)}%–{normalize(draft.boostMax)}%</div>
                <div>Garantie : {rules.guarantee_commission_percent}% → {normalize(draft.guarantee)}%</div>
                <div>Acompte min : {madFromCents(rules.min_deposit_amount_cents)} MAD → {normalize(draft.minDepositMad)} MAD</div>
              </div>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={saving}>Annuler</AlertDialogCancel>
              <AlertDialogAction disabled={saving} onClick={() => void save()}>
                Confirmer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {changes?.same ? <div className="text-xs text-slate-500">Aucun changement en attente.</div> : null}
      </CardContent>
    </Card>
  );
}
