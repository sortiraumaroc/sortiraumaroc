import * as React from "react";

import { Link } from "react-router-dom";
import { Info, Loader2, RotateCcw, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { toast } from "@/hooks/use-toast";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { getProBookingPolicy, updateProBookingPolicy } from "@/lib/pro/api";
import type { Establishment, ProRole } from "@/lib/pro/types";
import { useI18n } from "@/lib/i18n";
import { addLocalePrefix } from "@/lib/i18n/types";

type Props = {
  establishment: Establishment;
  role: ProRole;
};

type BookingPolicy = {
  cancellation_enabled: boolean;
  free_cancellation_hours: number;
  cancellation_penalty_percent: number;
  no_show_penalty_percent: number;
  no_show_always_100_guaranteed: boolean;
  cancellation_text_fr: string;
  cancellation_text_en: string;

  modification_enabled: boolean;
  modification_deadline_hours: number;
  require_guarantee_below_score: number | null;
  modification_text_fr: string;
  modification_text_en: string;
};

function canWrite(role: ProRole): boolean {
  return role === "owner" || role === "manager" || role === "marketing";
}

function readBool(obj: Record<string, unknown>, key: keyof BookingPolicy, fallback: boolean): boolean {
  const v = obj[String(key)];
  return typeof v === "boolean" ? v : fallback;
}

function readNumber(obj: Record<string, unknown>, key: keyof BookingPolicy, fallback: number): number {
  const v = obj[String(key)];
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fallback;
}

function readString(obj: Record<string, unknown>, key: keyof BookingPolicy, fallback = ""): string {
  const v = obj[String(key)];
  return typeof v === "string" ? v : fallback;
}

function toPolicy(raw: Record<string, unknown>): BookingPolicy {
  return {
    cancellation_enabled: readBool(raw, "cancellation_enabled", false),
    free_cancellation_hours: Math.max(0, readNumber(raw, "free_cancellation_hours", 24)),
    cancellation_penalty_percent: Math.min(100, Math.max(0, readNumber(raw, "cancellation_penalty_percent", 50))),
    no_show_penalty_percent: Math.min(100, Math.max(0, readNumber(raw, "no_show_penalty_percent", 100))),
    no_show_always_100_guaranteed: readBool(raw, "no_show_always_100_guaranteed", true),
    cancellation_text_fr: readString(raw, "cancellation_text_fr", ""),
    cancellation_text_en: readString(raw, "cancellation_text_en", ""),

    modification_enabled: readBool(raw, "modification_enabled", true),
    modification_deadline_hours: Math.max(0, readNumber(raw, "modification_deadline_hours", 2)),
    require_guarantee_below_score: (() => {
      const v = raw.require_guarantee_below_score;
      if (v === null) return null;
      if (typeof v === "number" && Number.isFinite(v)) return Math.min(100, Math.max(0, Math.round(v)));
      return null;
    })(),
    modification_text_fr: readString(raw, "modification_text_fr", ""),
    modification_text_en: readString(raw, "modification_text_en", ""),
  };
}

export function ProBookingSettingsTab({ establishment, role }: Props) {
  const { t, locale } = useI18n();
  const { isTestMode } = usePlatformSettings();
  const writable = canWrite(role);

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [policy, setPolicy] = React.useState<BookingPolicy | null>(null);
  const [draft, setDraft] = React.useState<BookingPolicy | null>(null);

  const requireScoreText = React.useMemo(() => {
    if (!draft) return "";
    return typeof draft.require_guarantee_below_score === "number" ? String(draft.require_guarantee_below_score) : "";
  }, [draft]);

  const setDraftField = <K extends keyof BookingPolicy>(key: K, value: BookingPolicy[K]) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, [key]: value };
    });
  };

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await getProBookingPolicy(establishment.id);
      const next = toPolicy(res.policy ?? {});
      setPolicy(next);
      setDraft(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error.generic"));
      setPolicy(null);
      setDraft(null);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [establishment.id]);

  const hasChanges = React.useMemo(() => {
    if (!policy || !draft) return false;
    return JSON.stringify(policy) !== JSON.stringify(draft);
  }, [draft, policy]);

  const resetToSaved = () => {
    if (policy) {
      setDraft(policy);
      toast({ title: "Réinitialisé", description: "Les modifications ont été annulées." });
    }
  };

  const save = async () => {
    if (!draft) return;

    setSaving(true);
    setError(null);

    try {
      const res = await updateProBookingPolicy({ establishmentId: establishment.id, patch: draft });
      const next = toPolicy(res.policy ?? {});
      setPolicy(next);
      setDraft(next);
      toast({ title: "Enregistré", description: "Les paramètres ont été sauvegardés avec succès." });
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : t("common.error.generic");
      setError(errorMsg);
      toast({ title: "Erreur", description: errorMsg });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="text-sm text-slate-600 flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t("common.loading")}
      </div>
    );
  }

  if (!draft) {
    return (
      <Card>
        <CardHeader>
          <SectionHeader
            title={t("pro.booking_settings.title")}
            description={t("pro.booking_settings.load_failed")}
          />
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? <div className="text-sm text-red-600">{error}</div> : null}
          <Button onClick={() => void load()} className="bg-primary text-white hover:bg-primary/90 font-bold">
            {t("pro.booking_settings.reload")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const policySlug = locale === "en" ? "anti-no-show-policy" : "politique-anti-no-show";
  const policyHref = addLocalePrefix(`/content/${policySlug}`, locale);

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header avec boutons */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-slate-900">{t("pro.booking_settings.title")}</h2>
            <div className="mt-1 text-sm text-slate-600">{t("pro.booking_settings.subtitle")}</div>
          </div>

          <div className="flex items-center gap-2">
            {hasChanges && (
              <Button
                variant="outline"
                onClick={resetToSaved}
                disabled={saving}
                className="gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Annuler
              </Button>
            )}
            <Button
              onClick={() => void save()}
              disabled={!writable || saving || !hasChanges}
              className="bg-primary text-white hover:bg-primary/90 font-bold gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {t("pro.booking_settings.save")}
            </Button>
          </div>
        </div>

        {/* Indicateur de modifications non sauvegardées */}
        {hasChanges && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            Vous avez des modifications non sauvegardées.
          </div>
        )}

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

        {/* Carte pédagogique - masquée en mode test car les dépôts sont désactivés */}
        {!isTestMode() && (
          <Card className="border-slate-200 bg-primary/5">
            <CardHeader className="pb-3">
              <SectionHeader
                title={t("pro.booking_settings.pedagogy.title")}
                description={t("pro.booking_settings.pedagogy.body")}
              />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-sm text-slate-700">
                {t("pro.booking_settings.pedagogy.note")}{" "}
                <Link to={policyHref} className="font-semibold text-primary underline underline-offset-2">
                  {t("footer.link.anti_no_show_policy")}
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Sections empilées verticalement */}
        <div className="space-y-6">
          {/* Section A - Annulation */}
          <Card>
            <CardHeader>
              <SectionHeader
                title={t("pro.booking_settings.section.cancel.title")}
                description={t("pro.booking_settings.section.cancel.description")}
              />
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Switch activation */}
              <div className="flex items-center justify-between gap-4 p-4 rounded-lg bg-slate-50">
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-900">{t("pro.booking_settings.cancel.enable.title")}</div>
                  <div className="mt-1 text-xs text-slate-500">{t("pro.booking_settings.cancel.enable.hint")}</div>
                </div>
                <Switch
                  checked={draft.cancellation_enabled}
                  onCheckedChange={(checked) => setDraftField("cancellation_enabled", checked)}
                  disabled={!writable || saving}
                />
              </div>

              {/* Champs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm">{t("pro.booking_settings.cancel.free_hours.label")}</Label>
                  <div className="relative">
                    <Input
                      inputMode="numeric"
                      type="number"
                      min={0}
                      value={draft.free_cancellation_hours}
                      onChange={(e) => setDraftField("free_cancellation_hours", Math.max(0, Math.round(Number(e.target.value || 0))))}
                      disabled={!writable || saving}
                      className="pr-8"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">{t("pro.booking_settings.cancel.penalty_percent.label")}</Label>
                    <span className="text-sm font-bold text-primary">{draft.cancellation_penalty_percent}%</span>
                  </div>
                  <Slider
                    value={[draft.cancellation_penalty_percent]}
                    min={0}
                    max={100}
                    step={5}
                    onValueChange={(v) => setDraftField("cancellation_penalty_percent", Math.min(100, Math.max(0, Math.round(v[0] ?? 0))))}
                    disabled={!writable || saving}
                    aria-label="Pénalité après la limite"
                  />
                  <div className="text-xs text-slate-500">{t("pro.booking_settings.cancel.penalty_percent.example", { percent: draft.cancellation_penalty_percent })}</div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-1">
                    <Label className="text-sm">{t("pro.booking_settings.cancel.no_show_penalty.label")}</Label>
                  </div>
                  <div className="relative">
                    <Input
                      inputMode="numeric"
                      type="number"
                      min={0}
                      max={100}
                      value={draft.no_show_penalty_percent}
                      onChange={(e) => setDraftField("no_show_penalty_percent", Math.min(100, Math.max(0, Math.round(Number(e.target.value || 0)))))}
                      disabled={!writable || saving}
                      className="pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 p-3 rounded-lg border bg-white">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{t("pro.booking_settings.cancel.no_show_always_100.title")}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{t("pro.booking_settings.cancel.no_show_always_100.hint")}</div>
                  </div>
                  <Switch
                    checked={draft.no_show_always_100_guaranteed}
                    onCheckedChange={(checked) => setDraftField("no_show_always_100_guaranteed", checked)}
                    disabled={!writable || saving}
                  />
                </div>
              </div>

              {/* Texte personnalisé */}
              <div className="space-y-3 pt-2 border-t">
                <div className="text-sm font-semibold text-slate-900">{t("pro.booking_settings.cancel.custom_text.title")}</div>
                <Tabs defaultValue="fr" className="w-full">
                  <TabsList className="grid grid-cols-2 w-32">
                    <TabsTrigger value="fr">FR</TabsTrigger>
                    <TabsTrigger value="en">EN</TabsTrigger>
                  </TabsList>
                  <TabsContent value="fr" className="mt-3">
                    <Textarea
                      value={draft.cancellation_text_fr}
                      onChange={(e) => setDraftField("cancellation_text_fr", e.target.value)}
                      disabled={!writable || saving}
                      placeholder={t("pro.booking_settings.cancel.custom_text.placeholder.fr")}
                      className="min-h-[100px]"
                    />
                  </TabsContent>
                  <TabsContent value="en" className="mt-3">
                    <Textarea
                      value={draft.cancellation_text_en}
                      onChange={(e) => setDraftField("cancellation_text_en", e.target.value)}
                      disabled={!writable || saving}
                      placeholder={t("pro.booking_settings.cancel.custom_text.placeholder.en")}
                      className="min-h-[100px]"
                    />
                  </TabsContent>
                </Tabs>
              </div>
            </CardContent>
          </Card>

          {/* Section B - Modification */}
          <Card>
            <CardHeader>
              <SectionHeader
                title={t("pro.booking_settings.section.modif.title")}
                description={t("pro.booking_settings.section.modif.description")}
              />
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Switch activation */}
              <div className="flex items-center justify-between gap-4 p-4 rounded-lg bg-slate-50">
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-900">{t("pro.booking_settings.modif.enable.title")}</div>
                  <div className="mt-1 text-xs text-slate-500">{t("pro.booking_settings.modif.enable.hint")}</div>
                </div>
                <Switch
                  checked={draft.modification_enabled}
                  onCheckedChange={(checked) => setDraftField("modification_enabled", checked)}
                  disabled={!writable || saving}
                />
              </div>

              {/* Champs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm">{t("pro.booking_settings.modif.deadline_hours.label")}</Label>
                  <Input
                    inputMode="numeric"
                    type="number"
                    min={0}
                    value={draft.modification_deadline_hours}
                    onChange={(e) => setDraftField("modification_deadline_hours", Math.max(0, Math.round(Number(e.target.value || 0))))}
                    disabled={!writable || saving}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-1">
                    <Label className="text-sm">Score minimum pour garantie</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="text-slate-400 hover:text-slate-600">
                          <Info className="w-3.5 h-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[250px]">
                        <p className="text-xs">
                          Si le score de fiabilité du client est inférieur à cette valeur, une garantie sera demandée.
                          Laissez vide pour désactiver cette règle.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    inputMode="numeric"
                    type="number"
                    min={0}
                    max={100}
                    value={requireScoreText}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const n = raw.trim() ? Number(raw) : NaN;
                      setDraftField(
                        "require_guarantee_below_score",
                        Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : null,
                      );
                    }}
                    disabled={!writable || saving}
                    placeholder={t("pro.booking_settings.modif.require_guarantee.placeholder")}
                  />
                  <div className="text-xs text-slate-500">{t("pro.booking_settings.modif.require_guarantee.hint")}</div>
                </div>
              </div>

              {/* Texte personnalisé */}
              <div className="space-y-3 pt-2 border-t">
                <div className="text-sm font-semibold text-slate-900">{t("pro.booking_settings.modif.custom_text.title")}</div>
                <Tabs defaultValue="fr" className="w-full">
                  <TabsList className="grid grid-cols-2 w-32">
                    <TabsTrigger value="fr">FR</TabsTrigger>
                    <TabsTrigger value="en">EN</TabsTrigger>
                  </TabsList>
                  <TabsContent value="fr" className="mt-3">
                    <Textarea
                      value={draft.modification_text_fr}
                      onChange={(e) => setDraftField("modification_text_fr", e.target.value)}
                      disabled={!writable || saving}
                      placeholder={t("pro.booking_settings.modif.custom_text.placeholder.fr")}
                      className="min-h-[100px]"
                    />
                  </TabsContent>
                  <TabsContent value="en" className="mt-3">
                    <Textarea
                      value={draft.modification_text_en}
                      onChange={(e) => setDraftField("modification_text_en", e.target.value)}
                      disabled={!writable || saving}
                      placeholder={t("pro.booking_settings.modif.custom_text.placeholder.en")}
                      className="min-h-[100px]"
                    />
                  </TabsContent>
                </Tabs>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </TooltipProvider>
  );
}
