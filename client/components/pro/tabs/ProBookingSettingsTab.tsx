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

  /** Deposit per person in MAD. If null or 0, guaranteed booking is disabled. */
  deposit_per_person: number | null;
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
    deposit_per_person: (() => {
      const v = raw.deposit_per_person;
      if (v === null || v === undefined) return null;
      if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.round(v));
      return null;
    })(),
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

  const depositPerPersonText = React.useMemo(() => {
    if (!draft) return "";
    return typeof draft.deposit_per_person === "number" ? String(draft.deposit_per_person) : "";
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

              {/* Timeline visuelle explicative */}
              {draft.cancellation_enabled && (
                <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-50 via-amber-50 to-red-50 border">
                  <div className="text-sm font-semibold text-slate-700 mb-4">📅 Exemple pour une réservation à 20h :</div>
                  <div className="relative">
                    {/* Ligne de timeline */}
                    <div className="absolute top-6 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 via-amber-400 to-red-400 rounded-full" />

                    {/* Points de la timeline */}
                    <div className="flex justify-between relative">
                      {/* Annulation gratuite */}
                      <div className="flex flex-col items-center text-center w-1/3">
                        <div className="w-4 h-4 rounded-full bg-emerald-500 border-2 border-white shadow z-10" />
                        <div className="mt-3 px-2">
                          <div className="text-xs font-bold text-emerald-700">✓ Gratuit</div>
                          <div className="text-[10px] text-slate-600 mt-1">
                            Avant {draft.free_cancellation_hours}h du RDV
                          </div>
                          <div className="text-[10px] text-slate-500">
                            (ex: avant {draft.free_cancellation_hours > 12 ? `${20 - (draft.free_cancellation_hours % 24)}h la veille` : `${20 - draft.free_cancellation_hours}h`})
                          </div>
                        </div>
                      </div>

                      {/* Annulation tardive */}
                      <div className="flex flex-col items-center text-center w-1/3">
                        <div className="w-4 h-4 rounded-full bg-amber-500 border-2 border-white shadow z-10" />
                        <div className="mt-3 px-2">
                          <div className="text-xs font-bold text-amber-700">⚠ {draft.cancellation_penalty_percent}% retenu</div>
                          <div className="text-[10px] text-slate-600 mt-1">
                            Annulation tardive
                          </div>
                          <div className="text-[10px] text-slate-500">
                            (moins de {draft.free_cancellation_hours}h avant)
                          </div>
                        </div>
                      </div>

                      {/* No-show */}
                      <div className="flex flex-col items-center text-center w-1/3">
                        <div className="w-4 h-4 rounded-full bg-red-500 border-2 border-white shadow z-10" />
                        <div className="mt-3 px-2">
                          <div className="text-xs font-bold text-red-700">✗ {draft.no_show_penalty_percent}% retenu</div>
                          <div className="text-[10px] text-slate-600 mt-1">
                            Absence (No-show)
                          </div>
                          <div className="text-[10px] text-slate-500">
                            (client ne vient pas)
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Paramètres */}
              {draft.cancellation_enabled && (
                <div className="space-y-4">
                  <div className="text-sm font-semibold text-slate-900">Paramètres</div>

                  {/* Délai annulation gratuite */}
                  <div className="p-4 rounded-lg border bg-emerald-50/50 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-emerald-500" />
                      <Label className="text-sm font-medium">Délai d'annulation gratuite</Label>
                    </div>
                    <div className="flex items-center gap-3">
                      <Input
                        inputMode="numeric"
                        type="number"
                        min={0}
                        value={draft.free_cancellation_hours}
                        onChange={(e) => setDraftField("free_cancellation_hours", Math.max(0, Math.round(Number(e.target.value || 0))))}
                        disabled={!writable || saving}
                        className="w-24"
                      />
                      <span className="text-sm text-slate-600">heures avant la réservation</span>
                    </div>
                    <div className="text-xs text-emerald-700">
                      → Le client peut annuler sans frais jusqu'à {draft.free_cancellation_hours}h avant son rendez-vous
                    </div>
                  </div>

                  {/* Pénalité annulation tardive */}
                  <div className="p-4 rounded-lg border bg-amber-50/50 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-amber-500" />
                      <Label className="text-sm font-medium">Pénalité si annulation tardive</Label>
                    </div>
                    <div className="flex items-center gap-3">
                      <Slider
                        value={[draft.cancellation_penalty_percent]}
                        min={0}
                        max={100}
                        step={5}
                        onValueChange={(v) => setDraftField("cancellation_penalty_percent", Math.min(100, Math.max(0, Math.round(v[0] ?? 0))))}
                        disabled={!writable || saving}
                        className="flex-1"
                        aria-label="Pénalité après la limite"
                      />
                      <span className="text-lg font-bold text-amber-700 w-16 text-end">{draft.cancellation_penalty_percent}%</span>
                    </div>
                    <div className="text-xs text-amber-700">
                      → Si le client annule moins de {draft.free_cancellation_hours}h avant, il perd {draft.cancellation_penalty_percent}% du montant
                    </div>
                  </div>

                  {/* Pénalité no-show */}
                  <div className="p-4 rounded-lg border bg-red-50/50 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <Label className="text-sm font-medium">Pénalité si absence (no-show)</Label>
                    </div>
                    <div className="flex items-center gap-3">
                      <Input
                        inputMode="numeric"
                        type="number"
                        min={0}
                        max={100}
                        value={draft.no_show_penalty_percent}
                        onChange={(e) => setDraftField("no_show_penalty_percent", Math.min(100, Math.max(0, Math.round(Number(e.target.value || 0)))))}
                        disabled={!writable || saving}
                        className="w-24"
                      />
                      <span className="text-sm text-slate-600">% du montant retenu</span>
                    </div>
                    <div className="text-xs text-red-700">
                      → Si le client ne vient pas sans prévenir, il perd {draft.no_show_penalty_percent}% du montant
                    </div>

                    {/* Option 100% pour garanties */}
                    <div className="flex items-center justify-between gap-4 mt-3 p-3 rounded-lg bg-white border">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900">Toujours 100% pour réservations garanties</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          Si le client a payé un acompte, la pénalité no-show sera toujours de 100%
                        </div>
                      </div>
                      <Switch
                        checked={draft.no_show_always_100_guaranteed}
                        onCheckedChange={(checked) => setDraftField("no_show_always_100_guaranteed", checked)}
                        disabled={!writable || saving}
                      />
                    </div>
                  </div>
                </div>
              )}

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

          {/* Section Acompte / Garantie */}
          <Card className="border-primary/30">
            <CardHeader>
              <SectionHeader
                title="Acompte de réservation"
                description="Configurez le montant d'acompte par personne pour les réservations garanties."
              />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label className="text-sm">Montant par personne (MAD)</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-slate-400 hover:text-slate-600">
                        <Info className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[280px]">
                      <p className="text-xs">
                        Ce montant sera demandé par personne pour les réservations avec "Place garantie".
                        Laissez vide ou mettez 0 pour désactiver l'option de réservation garantie.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="relative">
                  <Input
                    inputMode="numeric"
                    type="number"
                    min={0}
                    max={1000}
                    value={depositPerPersonText}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const n = raw.trim() ? Number(raw) : NaN;
                      setDraftField(
                        "deposit_per_person",
                        Number.isFinite(n) ? Math.max(0, Math.round(n)) : null,
                      );
                    }}
                    disabled={!writable || saving}
                    placeholder="Ex: 60"
                    className="pe-16"
                  />
                  <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">MAD/pers.</span>
                </div>
                <div className="text-xs text-slate-500">
                  {draft.deposit_per_person && draft.deposit_per_person > 0
                    ? `L'option "Place garantie" sera proposée avec un acompte de ${draft.deposit_per_person} MAD par personne.`
                    : "Aucun acompte configuré. Seule l'option \"En attente de confirmation\" sera disponible."}
                </div>
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

              {/* Timeline visuelle explicative */}
              {draft.modification_enabled && (
                <div className="p-4 rounded-xl bg-gradient-to-r from-sky-50 via-slate-50 to-rose-50 border">
                  <div className="text-sm font-semibold text-slate-700 mb-4">📝 Exemple pour une réservation à 20h :</div>
                  <div className="relative">
                    {/* Ligne de timeline */}
                    <div className="absolute top-6 left-0 right-0 h-1 bg-gradient-to-r from-sky-400 via-slate-300 to-rose-400 rounded-full" />

                    {/* Points de la timeline */}
                    <div className="flex justify-between relative">
                      {/* Modification autorisée */}
                      <div className="flex flex-col items-center text-center w-1/3">
                        <div className="w-4 h-4 rounded-full bg-sky-500 border-2 border-white shadow z-10" />
                        <div className="mt-3 px-2">
                          <div className="text-xs font-bold text-sky-700">✓ Modification OK</div>
                          <div className="text-[10px] text-slate-600 mt-1">
                            Plus de {draft.modification_deadline_hours}h avant
                          </div>
                          <div className="text-[10px] text-slate-500">
                            (ex: avant {draft.modification_deadline_hours > 12 ? `${20 - (draft.modification_deadline_hours % 24)}h la veille` : `${20 - draft.modification_deadline_hours}h`})
                          </div>
                        </div>
                      </div>

                      {/* Limite */}
                      <div className="flex flex-col items-center text-center w-1/3">
                        <div className="w-4 h-4 rounded-full bg-slate-400 border-2 border-white shadow z-10" />
                        <div className="mt-3 px-2">
                          <div className="text-xs font-bold text-slate-600">⏱ Limite</div>
                          <div className="text-[10px] text-slate-600 mt-1">
                            {draft.modification_deadline_hours}h avant le RDV
                          </div>
                          <div className="text-[10px] text-slate-500">
                            (ex: {20 - draft.modification_deadline_hours}h le jour J)
                          </div>
                        </div>
                      </div>

                      {/* Modification bloquée */}
                      <div className="flex flex-col items-center text-center w-1/3">
                        <div className="w-4 h-4 rounded-full bg-rose-500 border-2 border-white shadow z-10" />
                        <div className="mt-3 px-2">
                          <div className="text-xs font-bold text-rose-700">✗ Bloquée</div>
                          <div className="text-[10px] text-slate-600 mt-1">
                            Moins de {draft.modification_deadline_hours}h avant
                          </div>
                          <div className="text-[10px] text-slate-500">
                            (contacter l'établissement)
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Paramètres */}
              {draft.modification_enabled && (
                <div className="space-y-4">
                  <div className="text-sm font-semibold text-slate-900">Paramètres</div>

                  {/* Délai de modification */}
                  <div className="p-4 rounded-lg border bg-sky-50/50 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-sky-500" />
                      <Label className="text-sm font-medium">{t("pro.booking_settings.modif.deadline_hours.label")}</Label>
                    </div>
                    <div className="flex items-center gap-3">
                      <Input
                        inputMode="numeric"
                        type="number"
                        min={0}
                        value={draft.modification_deadline_hours}
                        onChange={(e) => setDraftField("modification_deadline_hours", Math.max(0, Math.round(Number(e.target.value || 0))))}
                        disabled={!writable || saving}
                        className="w-24"
                      />
                      <span className="text-sm text-slate-600">heures avant la réservation</span>
                    </div>
                    <div className="text-xs text-sky-700">
                      → Le client peut modifier sa réservation jusqu'à {draft.modification_deadline_hours}h avant son rendez-vous
                    </div>
                  </div>

                  {/* Score minimum pour garantie */}
                  <div className="p-4 rounded-lg border bg-violet-50/50 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-violet-500" />
                      <Label className="text-sm font-medium">Score minimum pour garantie</Label>
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
                    <div className="flex items-center gap-3">
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
                        className="w-24"
                      />
                      <span className="text-sm text-slate-600">/ 100</span>
                    </div>
                    <div className="text-xs text-violet-700">
                      {draft.require_guarantee_below_score
                        ? `→ Les clients avec un score inférieur à ${draft.require_guarantee_below_score} devront payer un acompte`
                        : "→ Laissez vide pour ne pas appliquer cette règle"}
                    </div>
                  </div>
                </div>
              )}

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
