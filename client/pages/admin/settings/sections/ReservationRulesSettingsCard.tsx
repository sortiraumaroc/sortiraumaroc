import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { AdminApiError, updateAdminReservationRules, type ReservationRules } from "@/lib/adminApi";

import type { SettingsReportPatch, ToastInput } from "../../AdminSettingsPage";

type Draft = {
  deposit_required_below_score: boolean;
  deposit_required_score_threshold: number;
  no_show_limit_before_block: number;
  auto_detect_no_show: boolean;
  max_reservations_per_slot: number;
  max_party_size: number;
};

function toDraft(r: ReservationRules): Draft {
  return {
    deposit_required_below_score: !!r.deposit_required_below_score,
    deposit_required_score_threshold: r.deposit_required_score_threshold ?? 65,
    no_show_limit_before_block: r.no_show_limit_before_block ?? 3,
    auto_detect_no_show: !!r.auto_detect_no_show,
    max_reservations_per_slot: r.max_reservations_per_slot ?? 1,
    max_party_size: r.max_party_size ?? 10,
  };
}

function sameDraft(a: Draft, r: ReservationRules): boolean {
  return (
    a.deposit_required_below_score === !!r.deposit_required_below_score &&
    a.deposit_required_score_threshold === (r.deposit_required_score_threshold ?? 65) &&
    a.no_show_limit_before_block === (r.no_show_limit_before_block ?? 3) &&
    a.auto_detect_no_show === !!r.auto_detect_no_show &&
    a.max_reservations_per_slot === (r.max_reservations_per_slot ?? 1) &&
    a.max_party_size === (r.max_party_size ?? 10)
  );
}

function clampInt(v: number, min: number, max: number): number {
  const x = Math.floor(v);
  return Math.min(max, Math.max(min, x));
}

export function ReservationRulesSettingsCard(props: {
  rules: ReservationRules | null;
  onRulesChange: (next: ReservationRules | null) => void;
  onReport: (patch: SettingsReportPatch) => void;
  onToast: (toast: ToastInput) => void;
}) {
  const { rules, onRulesChange, onReport, onToast } = props;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (rules) setDraft(toDraft(rules));
  }, [rules]);

  const pending = useMemo(() => {
    if (!rules || !draft) return false;
    return !sameDraft(draft, rules);
  }, [draft, rules]);

  const save = async () => {
    if (!rules || !draft) return;

    if (!pending) {
      onToast({ title: "⚠️ Rien à faire", description: "Aucune règle à modifier." });
      onReport({ noop: 1 });
      return;
    }

    setSaving(true);
    try {
      const res = await updateAdminReservationRules(undefined, {
        deposit_required_below_score: draft.deposit_required_below_score,
        deposit_required_score_threshold: clampInt(draft.deposit_required_score_threshold, 0, 100),
        no_show_limit_before_block: clampInt(draft.no_show_limit_before_block, 0, 20),
        auto_detect_no_show: draft.auto_detect_no_show,
        max_reservations_per_slot: clampInt(draft.max_reservations_per_slot, 1, 20),
        max_party_size: clampInt(draft.max_party_size, 1, 60),
      });
      onRulesChange(res.item);
      onToast({ title: "✔️ Paramètres mis à jour", description: "Règles de réservation sauvegardées." });
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
          <CardTitle className="text-base">SECTION 4 — Règles Globales Réservation</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">Règles indisponibles (reservation_rules).</CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Règles réservation</CardTitle>
          <InfoTooltip
            content={
              <div className="space-y-1">
                <div>Paramètres globaux: acompte, no-show, limites de réservation.</div>
                <div className="text-slate-500">Table : reservation_rules</div>
              </div>
            }
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium">Acompte si score &lt; seuil</div>
            <InfoTooltip content={<>Active l’acompte selon le score de fiabilité client.</>} />
          </div>
          <Switch
            checked={draft.deposit_required_below_score}
            onCheckedChange={(v) => setDraft((d) => (d ? { ...d, deposit_required_below_score: v } : d))}
          />
        </div>

        <div className="rounded-lg border border-slate-200 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Seuil score minimum</div>
            <div className="text-sm tabular-nums">{draft.deposit_required_score_threshold}</div>
          </div>
          <Slider
            value={[draft.deposit_required_score_threshold]}
            min={0}
            max={100}
            step={1}
            disabled={!draft.deposit_required_below_score}
            onValueChange={(v) => setDraft((d) => (d ? { ...d, deposit_required_score_threshold: v[0] ?? 65 } : d))}
          />
        </div>

        <div className="rounded-lg border border-slate-200 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Limite no-show avant blocage</div>
            <div className="text-sm tabular-nums">{draft.no_show_limit_before_block}</div>
          </div>
          <Slider
            value={[draft.no_show_limit_before_block]}
            min={0}
            max={20}
            step={1}
            onValueChange={(v) => setDraft((d) => (d ? { ...d, no_show_limit_before_block: v[0] ?? 0 } : d))}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium">Auto-détection no-show</div>
            <InfoTooltip content={<>Si ON, le backend pourra activer un job automatique (cron).</>} />
          </div>
          <Switch
            checked={draft.auto_detect_no_show}
            onCheckedChange={(v) => setDraft((d) => (d ? { ...d, auto_detect_no_show: v } : d))}
          />
        </div>

        <div className="rounded-lg border border-slate-200 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Limite de réservation / créneau</div>
            <div className="text-sm tabular-nums">{draft.max_reservations_per_slot}</div>
          </div>
          <Slider
            value={[draft.max_reservations_per_slot]}
            min={1}
            max={20}
            step={1}
            onValueChange={(v) => setDraft((d) => (d ? { ...d, max_reservations_per_slot: v[0] ?? 1 } : d))}
          />
        </div>

        <div className="rounded-lg border border-slate-200 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Max personnes / réservation</div>
            <div className="text-sm tabular-nums">{draft.max_party_size}</div>
          </div>
          <Slider
            value={[draft.max_party_size]}
            min={1}
            max={60}
            step={1}
            onValueChange={(v) => setDraft((d) => (d ? { ...d, max_party_size: v[0] ?? 10 } : d))}
          />
        </div>

        <Button disabled={saving} onClick={() => void save()} className="w-full">
          {saving ? "Enregistrement…" : pending ? "Enregistrer" : "Aucun changement"}
        </Button>
      </CardContent>
    </Card>
  );
}
