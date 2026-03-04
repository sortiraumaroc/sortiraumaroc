import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  Loader2,
  Moon,
  RefreshCw,
  Settings2,
  Shield,
  Zap,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AdminApiError,
  listPlatformSettings,
  updatePlatformSetting,
  setPlatformMode,
  invalidatePlatformSettingsCache,
  type PlatformSetting,
  type PlatformMode,
} from "@/lib/adminApi";
import { useToast } from "@/hooks/use-toast";

const MODE_LABELS: Record<PlatformMode, { label: string; color: string; icon: React.ReactNode }> = {
  test: {
    label: "Mode Test (Phase 1)",
    color: "bg-amber-100 text-amber-800 border-amber-300",
    icon: <Settings2 className="h-4 w-4" />,
  },
  commercial: {
    label: "Mode Commercial (Phase 2)",
    color: "bg-green-100 text-green-800 border-green-300",
    icon: <Zap className="h-4 w-4" />,
  },
  maintenance: {
    label: "Mode Maintenance",
    color: "bg-red-100 text-red-800 border-red-300",
    icon: <AlertCircle className="h-4 w-4" />,
  },
};

const CATEGORY_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  mode: { label: "Mode Plateforme", icon: <Settings2 className="h-4 w-4" /> },
  payments: { label: "Paiements & Finances", icon: <CreditCard className="h-4 w-4" /> },
  visibility: { label: "Visibilité & Media", icon: <Zap className="h-4 w-4" /> },
  reservations: { label: "Réservations", icon: <CheckCircle2 className="h-4 w-4" /> },
  branding: { label: "Marque & Identité", icon: <Shield className="h-4 w-4" /> },
  ramadan: { label: "Ramadan & Ftour", icon: <Moon className="h-4 w-4" /> },
};

export function PlatformSettingsCard() {
  const { toast } = useToast();

  const [settings, setSettings] = useState<PlatformSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [modeDialogOpen, setModeDialogOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState<PlatformMode | null>(null);
  const [changingMode, setChangingMode] = useState(false);

  // Load settings
  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listPlatformSettings();
      setSettings(res.items);
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur lors du chargement";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  // Get current mode
  const currentMode = settings.find((s) => s.key === "PLATFORM_MODE")?.value as PlatformMode || "test";

  // Group settings by category
  const groupedSettings = settings.reduce(
    (acc, setting) => {
      const cat = setting.category || "general";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(setting);
      return acc;
    },
    {} as Record<string, PlatformSetting[]>
  );

  // Toggle boolean setting
  const toggleSetting = async (setting: PlatformSetting) => {
    if (setting.value_type !== "boolean") return;

    const newValue = setting.value === "true" ? "false" : "true";
    setSavingKey(setting.key);

    try {
      const res = await updatePlatformSetting(undefined, { key: setting.key, value: newValue });
      setSettings((prev) => prev.map((s) => (s.key === setting.key ? res.item : s)));
      toast({
        title: "Paramètre mis à jour",
        description: `${setting.label} : ${newValue === "true" ? "Activé" : "Désactivé"}`,
      });
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setSavingKey(null);
    }
  };

  // Update a string setting
  const updateStringSetting = async (key: string, value: string) => {
    setSavingKey(key);
    try {
      const res = await updatePlatformSetting(undefined, { key, value });
      setSettings((prev) => prev.map((s) => (s.key === key ? res.item : s)));
      toast({ title: "Paramètre mis à jour", description: `${res.item.label} : ${value}` });
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setSavingKey(null);
    }
  };

  // Change platform mode
  const handleModeChange = async () => {
    if (!pendingMode) return;

    setChangingMode(true);
    try {
      const res = await setPlatformMode(undefined, pendingMode);
      // Reload all settings to get updated values
      await loadSettings();
      toast({
        title: "Mode changé",
        description: `La plateforme est maintenant en ${MODE_LABELS[res.mode].label}`,
      });
      setModeDialogOpen(false);
      setPendingMode(null);
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setChangingMode(false);
    }
  };

  // Invalidate cache
  const handleInvalidateCache = async () => {
    try {
      await invalidatePlatformSettingsCache();
      toast({ title: "Cache invalidé", description: "Les paramètres seront rechargés" });
      await loadSettings();
    } catch {
      toast({ title: "Erreur", description: "Impossible d'invalider le cache", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-slate-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Mode Plateforme</CardTitle>
              <InfoTooltip
                content={
                  <div className="space-y-1">
                    <div>Contrôle global du mode de fonctionnement de la plateforme.</div>
                    <div className="text-slate-500">Table : platform_settings</div>
                  </div>
                }
              />
            </div>
            <Button variant="ghost" size="sm" onClick={handleInvalidateCache}>
              <RefreshCw className="h-4 w-4 me-1" />
              Rafraîchir
            </Button>
          </div>
          <CardDescription>
            Définissez si la plateforme fonctionne en mode test (Phase 1) ou commercial (Phase 2)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Current Mode Banner */}
          <Alert className={MODE_LABELS[currentMode].color}>
            <div className="flex items-center gap-2">
              {MODE_LABELS[currentMode].icon}
              <AlertTitle className="mb-0">{MODE_LABELS[currentMode].label}</AlertTitle>
            </div>
            <AlertDescription className="mt-2">
              {currentMode === "test" && (
                <>
                  Les paiements de réservation, commissions et garanties sont <strong>désactivés</strong>.
                  Seuls les achats de visibilité sont actifs.
                </>
              )}
              {currentMode === "commercial" && (
                <>
                  Toutes les fonctionnalités de paiement sont <strong>activées</strong>.
                  La plateforme fonctionne en mode production.
                </>
              )}
              {currentMode === "maintenance" && (
                <>
                  La plateforme est en <strong>maintenance</strong>. Les utilisateurs ne peuvent pas effectuer d'actions.
                </>
              )}
            </AlertDescription>
          </Alert>

          {/* Mode Switch Buttons */}
          <div className="flex flex-wrap gap-2">
            {(["test", "commercial", "maintenance"] as PlatformMode[]).map((mode) => (
              <Button
                key={mode}
                variant={currentMode === mode ? "default" : "outline"}
                size="sm"
                disabled={currentMode === mode}
                onClick={() => {
                  setPendingMode(mode);
                  setModeDialogOpen(true);
                }}
                className="gap-2"
              >
                {MODE_LABELS[mode].icon}
                {mode === "test" && "Passer en Mode Test"}
                {mode === "commercial" && "Passer en Mode Commercial"}
                {mode === "maintenance" && "Passer en Maintenance"}
              </Button>
            ))}
          </div>

          {/* Settings by Category */}
          {Object.entries(groupedSettings)
            .filter(([cat]) => cat !== "mode" && cat !== "branding")
            .map(([category, categorySettings]) => (
              <div key={category} className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  {CATEGORY_LABELS[category]?.icon}
                  {CATEGORY_LABELS[category]?.label || category}
                </div>
                <div className="space-y-2">
                  {categorySettings
                    .filter((s) => s.value_type === "boolean")
                    .map((setting) => {
                      const isEnabled = setting.value === "true";
                      const isBusy = savingKey === setting.key;

                      return (
                        <div
                          key={setting.key}
                          className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-medium">{setting.label}</div>
                            {setting.description && (
                              <div className="text-xs text-slate-500 mt-0.5">{setting.description}</div>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge variant={isEnabled ? "default" : "secondary"} className="text-xs">
                              {isEnabled ? "Activé" : "Désactivé"}
                            </Badge>
                            <Switch
                              checked={isEnabled}
                              disabled={isBusy}
                              onCheckedChange={() => void toggleSetting(setting)}
                            />
                          </div>
                        </div>
                      );
                    })}
                  {/* String settings (e.g. dates for Ramadan) */}
                  {categorySettings
                    .filter((s) => s.value_type === "string" && !s.is_sensitive)
                    .map((setting) => {
                      const isBusy = savingKey === setting.key;
                      return (
                        <div
                          key={setting.key}
                          className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-sm">{setting.label}</div>
                            {setting.description && (
                              <div className="text-xs text-slate-500 mt-0.5">{setting.description}</div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type={setting.key.includes("DATE") ? "date" : "text"}
                              className="h-8 rounded-md border border-slate-300 px-2 text-sm w-40"
                              defaultValue={setting.value}
                              disabled={isBusy}
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                if (v !== setting.value) {
                                  void updateStringSetting(setting.key, v);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  (e.target as HTMLInputElement).blur();
                                }
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
        </CardContent>
      </Card>

      {/* Mode Change Confirmation Dialog */}
      <Dialog open={modeDialogOpen} onOpenChange={setModeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Changer le mode de la plateforme</DialogTitle>
            <DialogDescription>
              {pendingMode === "test" && (
                <>
                  Passer en <strong>Mode Test</strong> va désactiver automatiquement :
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Les paiements de réservation</li>
                    <li>Les commissions</li>
                    <li>Les abonnements PRO</li>
                    <li>Les achats de packs</li>
                    <li>Les payouts PRO</li>
                    <li>Les garanties anti no-show</li>
                    <li>Le wallet & crédits</li>
                  </ul>
                  <div className="mt-2 text-green-600">
                    Les commandes de visibilité resteront actives.
                  </div>
                </>
              )}
              {pendingMode === "commercial" && (
                <>
                  Passer en <strong>Mode Commercial</strong> va activer :
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Les paiements de réservation</li>
                    <li>Les commissions</li>
                    <li>Les achats de packs</li>
                    <li>Les payouts PRO</li>
                    <li>Les garanties anti no-show</li>
                  </ul>
                  <div className="mt-2 text-amber-600">
                    Assurez-vous que tout est configuré correctement avant d'activer ce mode.
                  </div>
                </>
              )}
              {pendingMode === "maintenance" && (
                <>
                  Passer en <strong>Mode Maintenance</strong> va suspendre toutes les opérations de la plateforme.
                  <div className="mt-2 text-red-600">
                    Les utilisateurs ne pourront plus effectuer de réservations ni d'achats.
                  </div>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModeDialogOpen(false)} disabled={changingMode}>
              Annuler
            </Button>
            <Button onClick={handleModeChange} disabled={changingMode}>
              {changingMode ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : null}
              Confirmer le changement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
