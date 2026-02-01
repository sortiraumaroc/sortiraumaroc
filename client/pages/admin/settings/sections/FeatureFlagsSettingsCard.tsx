import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Switch } from "@/components/ui/switch";
import { AdminApiError, updateAdminFeatureFlag, type AdminFeatureFlag } from "@/lib/adminApi";

import type { SettingsReportPatch, ToastInput } from "../../AdminSettingsPage";

export function FeatureFlagsSettingsCard(props: {
  flags: AdminFeatureFlag[];
  onFlagsChange: (next: AdminFeatureFlag[]) => void;
  onReport: (patch: SettingsReportPatch) => void;
  onToast: (toast: ToastInput) => void;
}) {
  const { flags, onFlagsChange, onReport, onToast } = props;

  const [savingKey, setSavingKey] = useState<string | null>(null);

  const sorted = useMemo(() => {
    return [...flags].sort((a, b) => (a.label ?? a.key).localeCompare(b.label ?? b.key, "fr"));
  }, [flags]);

  const toggle = async (flag: AdminFeatureFlag, nextEnabled: boolean) => {
    if (flag.enabled === nextEnabled) {
      onToast({ title: "⚠️ Rien à faire", description: "Aucun changement." });
      onReport({ noop: 1 });
      return;
    }

    setSavingKey(flag.key);
    try {
      const res = await updateAdminFeatureFlag(undefined, { key: flag.key, enabled: nextEnabled });
      onFlagsChange(flags.map((f) => (f.key === flag.key ? res.item : f)));
      onToast({
        title: "✔️ Paramètres mis à jour",
        description: `${flag.label} : ${nextEnabled ? "ON" : "OFF"} (masqué automatiquement côté PRO/USER)`,
      });
      onReport({ modified: 1 });
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      onToast({ title: "❌ Erreur", description: msg, variant: "destructive" });
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <Card className="border-slate-200">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Feature flags</CardTitle>
          <InfoTooltip
            content={
              <div className="space-y-1">
                <div>Active / désactive des fonctionnalités (masqué automatiquement côté PRO/USER).</div>
                <div className="text-slate-500">Table : admin_feature_flags</div>
              </div>
            }
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!sorted.length ? <div className="text-sm text-slate-600">Aucun flag.</div> : null}

        <div className="space-y-2">
          {sorted.map((flag) => {
            const busy = savingKey === flag.key;
            return (
              <div key={flag.key} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{flag.label}</div>
                  <div className="text-xs text-slate-500">{flag.key}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={!!flag.enabled} disabled={!!savingKey} onCheckedChange={(v) => void toggle(flag, v)} />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!!savingKey}
                    onClick={() => void toggle(flag, !flag.enabled)}
                  >
                    {busy ? "…" : flag.enabled ? "Désactiver" : "Activer"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
