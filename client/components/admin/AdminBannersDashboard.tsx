/**
 * AdminBannersDashboard — Dashboard Admin gestion des bannieres et pop-ups
 *
 * 3 onglets:
 *  - Bannieres: liste, filtres, actions
 *  - Creer / Modifier: formulaire complet
 *  - Statistiques & Formulaires: impressions, clicks, CTR, form responses
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Image, Play, FormInput, Layers, Timer, Type,
  Plus, Copy, Pause, Power, BarChart3, Edit,
  RefreshCw, Loader2,
  X, Download, Monitor, Smartphone, Globe,
  Filter, CheckCircle, XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AdminVisibilityNav } from "@/pages/admin/visibility/AdminVisibilityNav";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// =============================================================================
// Types
// =============================================================================

type BannerType = "image_simple" | "image_text" | "video" | "form" | "carousel" | "countdown";
type BannerStatus = "draft" | "active" | "paused" | "expired" | "disabled";
type DisplayFormat = "top_bar" | "popup_center" | "popup_bottom" | "slide_in" | "fullscreen" | "floating";
type AnimationType = "none" | "fade" | "slide_up" | "slide_down" | "slide_left" | "slide_right" | "scale" | "bounce";
type AudienceType = "all" | "segment";
type TriggerType = "on_load" | "on_scroll" | "on_exit_intent" | "on_page" | "after_delay" | "on_click";
type FrequencyType = "always" | "once_per_session" | "once_per_day" | "once_per_week" | "once_ever";
type PlatformType = "web" | "mobile" | "both";
type CloseBehavior = "click_x" | "click_outside" | "auto_close" | "no_close";

interface CarouselSlide {
  image_url: string;
  title?: string;
  cta_url?: string;
}

interface FormField {
  name: string;
  type: "text" | "email" | "phone" | "select" | "textarea";
  label: string;
  required: boolean;
  options?: string[];
}

interface Banner {
  id: string;
  internal_name: string;
  type: BannerType;
  status: BannerStatus;
  display_format: DisplayFormat;
  animation: AnimationType;
  title: string | null;
  subtitle: string | null;
  media_url: string | null;
  cta_text: string | null;
  cta_url: string | null;
  cta_target: "_self" | "_blank";
  secondary_cta_text: string | null;
  secondary_cta_url: string | null;
  overlay_color: string | null;
  overlay_opacity: number;
  close_behavior: CloseBehavior;
  close_delay_seconds: number;
  appear_delay_type: "none" | "seconds" | "scroll_percent";
  appear_delay_value: number;
  carousel_slides: CarouselSlide[] | null;
  countdown_target: string | null;
  form_fields: FormField[] | null;
  audience_type: AudienceType;
  trigger: TriggerType;
  trigger_page: string | null;
  frequency: FrequencyType;
  start_date: string | null;
  end_date: string | null;
  priority: number;
  platform: PlatformType;
  impressions: number;
  clicks: number;
  closes: number;
  form_submissions: number;
  created_at: string;
  updated_at: string;
}

interface FormResponse {
  id: string;
  banner_id: string;
  data: Record<string, string>;
  submitted_at: string;
  user_agent: string | null;
}

// =============================================================================
// Admin auth helper
// =============================================================================

function getAdminHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const sessionToken = sessionStorage.getItem("admin_session_token") || sessionStorage.getItem("admin-session-token");
  if (sessionToken) headers["x-admin-session"] = sessionToken;
  const adminKey = sessionStorage.getItem("admin_api_key");
  if (adminKey) headers["x-admin-key"] = adminKey;
  return headers;
}

async function adminFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { ...getAdminHeaders(), ...(options?.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || body.message || `Erreur ${res.status}`);
  }
  return res.json();
}

// =============================================================================
// Helpers
// =============================================================================

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "\u2014";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const TYPE_CONFIG: Record<BannerType, { label: string; icon: typeof Image; color: string }> = {
  image_simple: { label: "Image", icon: Image, color: "bg-blue-50 text-blue-700 border-blue-200" },
  image_text: { label: "Image + Texte", icon: Type, color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  video: { label: "Vidéo", icon: Play, color: "bg-purple-50 text-purple-700 border-purple-200" },
  form: { label: "Formulaire", icon: FormInput, color: "bg-teal-50 text-teal-700 border-teal-200" },
  carousel: { label: "Carrousel", icon: Layers, color: "bg-pink-50 text-pink-700 border-pink-200" },
  countdown: { label: "Countdown", icon: Timer, color: "bg-orange-50 text-orange-700 border-orange-200" },
};

const STATUS_CONFIG: Record<BannerStatus, { label: string; color: string }> = {
  draft: { label: "Brouillon", color: "bg-slate-100 text-slate-600 border-slate-200" },
  active: { label: "Active", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  paused: { label: "En pause", color: "bg-amber-50 text-amber-700 border-amber-200" },
  expired: { label: "Expirée", color: "bg-orange-50 text-orange-700 border-orange-200" },
  disabled: { label: "Désactivée", color: "bg-red-50 text-red-700 border-red-200" },
};

const DISPLAY_FORMATS: { value: DisplayFormat; label: string }[] = [
  { value: "top_bar", label: "Barre supérieure" },
  { value: "popup_center", label: "Pop-up central" },
  { value: "popup_bottom", label: "Pop-up bas" },
  { value: "slide_in", label: "Slide-in" },
  { value: "fullscreen", label: "Plein écran" },
  { value: "floating", label: "Flottant" },
];

const ANIMATION_OPTIONS: { value: AnimationType; label: string }[] = [
  { value: "none", label: "Aucune" },
  { value: "fade", label: "Fondu" },
  { value: "slide_up", label: "Glissement haut" },
  { value: "slide_down", label: "Glissement bas" },
  { value: "slide_left", label: "Glissement gauche" },
  { value: "slide_right", label: "Glissement droite" },
  { value: "scale", label: "Zoom" },
  { value: "bounce", label: "Rebond" },
];

const TRIGGER_OPTIONS: { value: TriggerType; label: string }[] = [
  { value: "on_load", label: "Au chargement" },
  { value: "on_scroll", label: "Au scroll" },
  { value: "on_exit_intent", label: "Intent de sortie" },
  { value: "on_page", label: "Sur une page" },
  { value: "after_delay", label: "Après délai" },
  { value: "on_click", label: "Au clic" },
];

const FREQUENCY_OPTIONS: { value: FrequencyType; label: string }[] = [
  { value: "always", label: "Toujours" },
  { value: "once_per_session", label: "1x / session" },
  { value: "once_per_day", label: "1x / jour" },
  { value: "once_per_week", label: "1x / semaine" },
  { value: "once_ever", label: "1 seule fois" },
];

function getEmptyBanner(): Omit<Banner, "id" | "impressions" | "clicks" | "closes" | "form_submissions" | "created_at" | "updated_at"> {
  return {
    internal_name: "",
    type: "image_simple",
    status: "draft",
    display_format: "popup_center",
    animation: "fade",
    title: "",
    subtitle: "",
    media_url: "",
    cta_text: "",
    cta_url: "",
    cta_target: "_blank",
    secondary_cta_text: "",
    secondary_cta_url: "",
    overlay_color: "#000000",
    overlay_opacity: 0.5,
    close_behavior: "click_x",
    close_delay_seconds: 0,
    appear_delay_type: "none",
    appear_delay_value: 0,
    carousel_slides: null,
    countdown_target: null,
    form_fields: null,
    audience_type: "all",
    trigger: "on_load",
    trigger_page: null,
    frequency: "once_per_session",
    start_date: null,
    end_date: null,
    priority: 5,
    platform: "both",
  };
}

// =============================================================================
// Tab 1: Bannieres list
// =============================================================================

function BannersListTab({
  banners,
  loading,
  onRefresh,
  onEdit,
  onDuplicate,
  onAction,
  onViewStats,
}: {
  banners: Banner[];
  loading: boolean;
  onRefresh: () => void;
  onEdit: (banner: Banner) => void;
  onDuplicate: (banner: Banner) => void;
  onAction: (id: string, action: "activate" | "pause" | "disable") => void;
  onViewStats: (banner: Banner) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<BannerStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<BannerType | "all">("all");
  const [platformFilter, setPlatformFilter] = useState<PlatformType | "all">("all");

  const filtered = useMemo(() => {
    return banners.filter((b) => {
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (typeFilter !== "all" && b.type !== typeFilter) return false;
      if (platformFilter !== "all" && b.platform !== platformFilter && b.platform !== "both") return false;
      return true;
    });
  }, [banners, statusFilter, typeFilter, platformFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Filter className="h-4 w-4 text-slate-400" />
          <span className="text-xs font-medium text-slate-500">Filtres:</span>
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            {(Object.entries(STATUS_CONFIG) as [BannerStatus, { label: string }][]).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            {(Object.entries(TYPE_CONFIG) as [BannerType, { label: string }][]).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={platformFilter} onValueChange={(v) => setPlatformFilter(v as any)}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder="Plateforme" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes</SelectItem>
            <SelectItem value="web">Web</SelectItem>
            <SelectItem value="mobile">Mobile</SelectItem>
            <SelectItem value="both">Les deux</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={onRefresh} className="h-8 px-2 ms-auto">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Banner cards */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-500">Aucune banniere trouvee</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((banner) => {
            const typeInfo = TYPE_CONFIG[banner.type];
            const statusInfo = STATUS_CONFIG[banner.status];
            const TypeIcon = typeInfo.icon;

            return (
              <div key={banner.id} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <h4 className="text-sm font-bold text-slate-900 truncate">{banner.internal_name}</h4>
                      <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 border", typeInfo.color)}>
                        <TypeIcon className="h-3 w-3 me-1" />
                        {typeInfo.label}
                      </Badge>
                      <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 border", statusInfo.color)}>
                        {statusInfo.label}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span>Format: {DISPLAY_FORMATS.find(f => f.value === banner.display_format)?.label || banner.display_format}</span>
                      <span>Priorite: {banner.priority}</span>
                      <span className="inline-flex items-center gap-1">
                        {banner.platform === "web" && <Monitor className="h-3 w-3" />}
                        {banner.platform === "mobile" && <Smartphone className="h-3 w-3" />}
                        {banner.platform === "both" && <Globe className="h-3 w-3" />}
                        {banner.platform === "web" ? "Web" : banner.platform === "mobile" ? "Mobile" : "Web + Mobile"}
                      </span>
                      {banner.start_date && <span>Du {formatDate(banner.start_date)}</span>}
                      {banner.end_date && <span>au {formatDate(banner.end_date)}</span>}
                    </div>
                    {(banner.impressions > 0 || banner.clicks > 0) && (
                      <div className="flex gap-x-3 mt-1.5 text-xs text-slate-400">
                        <span>{banner.impressions} impressions</span>
                        <span>{banner.clicks} clics</span>
                        <span>CTR: {banner.impressions > 0 ? ((banner.clicks / banner.impressions) * 100).toFixed(1) : "0"}%</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100">
                  <Button variant="outline" size="sm" onClick={() => onEdit(banner)} className="h-7 text-xs px-2.5">
                    <Edit className="h-3 w-3 me-1" /> Modifier
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onDuplicate(banner)} className="h-7 text-xs px-2.5">
                    <Copy className="h-3 w-3 me-1" /> Dupliquer
                  </Button>
                  {(banner.status === "draft" || banner.status === "paused") && (
                    <Button size="sm" onClick={() => onAction(banner.id, "activate")} className="h-7 text-xs px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                      <Power className="h-3 w-3 me-1" /> Activer
                    </Button>
                  )}
                  {banner.status === "active" && (
                    <Button variant="outline" size="sm" onClick={() => onAction(banner.id, "pause")} className="h-7 text-xs px-2.5 text-amber-700 border-amber-200 hover:bg-amber-50">
                      <Pause className="h-3 w-3 me-1" /> Mettre en pause
                    </Button>
                  )}
                  {banner.status !== "disabled" && banner.status !== "expired" && (
                    <Button variant="outline" size="sm" onClick={() => onAction(banner.id, "disable")} className="h-7 text-xs px-2.5 text-red-700 border-red-200 hover:bg-red-50">
                      <XCircle className="h-3 w-3 me-1" /> Desactiver
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => onViewStats(banner)} className="h-7 text-xs px-2.5 ms-auto">
                    <BarChart3 className="h-3 w-3 me-1" /> Stats
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Tab 2: Create / Edit form
// =============================================================================

function BannerForm({
  initial,
  onSave,
  saving,
}: {
  initial: Partial<Banner> | null;
  onSave: (data: any, status: "draft" | "active") => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<ReturnType<typeof getEmptyBanner>>(() => {
    if (initial) return { ...getEmptyBanner(), ...initial };
    return getEmptyBanner();
  });

  useEffect(() => {
    if (initial) setForm({ ...getEmptyBanner(), ...initial });
    else setForm(getEmptyBanner());
  }, [initial]);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const [carouselJson, setCarouselJson] = useState(() =>
    form.carousel_slides ? JSON.stringify(form.carousel_slides, null, 2) : "[]"
  );
  const [formFieldsJson, setFormFieldsJson] = useState(() =>
    form.form_fields ? JSON.stringify(form.form_fields, null, 2) : "[]"
  );

  useEffect(() => {
    setCarouselJson(form.carousel_slides ? JSON.stringify(form.carousel_slides, null, 2) : "[]");
    setFormFieldsJson(form.form_fields ? JSON.stringify(form.form_fields, null, 2) : "[]");
  }, [form.carousel_slides, form.form_fields]);

  const handleSave = (status: "draft" | "active") => {
    const payload = {
      ...form,
      carousel_slides: form.type === "carousel" ? safeJsonParse(carouselJson) : null,
      form_fields: form.type === "form" ? safeJsonParse(formFieldsJson) : null,
      status,
    };
    onSave(payload, status);
  };

  return (
    <div className="space-y-6">
      {/* Section: Contenu */}
      <fieldset className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <legend className="text-sm font-bold text-slate-900 px-1">Contenu</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Nom interne *</Label>
            <Input value={form.internal_name} onChange={(e) => update("internal_name", e.target.value)} placeholder="ex: Promo Ramadan 2026" className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Type *</Label>
            <Select value={form.type} onValueChange={(v) => update("type", v as BannerType)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(TYPE_CONFIG) as [BannerType, { label: string }][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Titre</Label>
            <Input value={form.title || ""} onChange={(e) => update("title", e.target.value)} placeholder="Titre visible" className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Sous-titre</Label>
            <Input value={form.subtitle || ""} onChange={(e) => update("subtitle", e.target.value)} placeholder="Sous-titre" className="h-9 text-sm" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">URL Media (image / video)</Label>
          <Input value={form.media_url || ""} onChange={(e) => update("media_url", e.target.value)} placeholder="https://..." className="h-9 text-sm" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">CTA Texte</Label>
            <Input value={form.cta_text || ""} onChange={(e) => update("cta_text", e.target.value)} placeholder="Decouvrir" className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">CTA URL</Label>
            <Input value={form.cta_url || ""} onChange={(e) => update("cta_url", e.target.value)} placeholder="https://..." className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">CTA Cible</Label>
            <Select value={form.cta_target} onValueChange={(v) => update("cta_target", v as "_self" | "_blank")}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_self">Meme onglet</SelectItem>
                <SelectItem value="_blank">Nouvel onglet</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">CTA Secondaire - Texte</Label>
            <Input value={form.secondary_cta_text || ""} onChange={(e) => update("secondary_cta_text", e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">CTA Secondaire - URL</Label>
            <Input value={form.secondary_cta_url || ""} onChange={(e) => update("secondary_cta_url", e.target.value)} className="h-9 text-sm" />
          </div>
        </div>
      </fieldset>

      {/* Section: Type-specific */}
      {form.type === "carousel" && (
        <fieldset className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <legend className="text-sm font-bold text-slate-900 px-1">Slides du Carrousel (JSON)</legend>
          <Textarea
            value={carouselJson}
            onChange={(e) => setCarouselJson(e.target.value)}
            className="text-xs font-mono min-h-[120px]"
            placeholder={'[\n  { "image_url": "...", "title": "...", "cta_url": "..." }\n]'}
          />
          <p className="text-[10px] text-slate-400">Format: tableau d'objets avec image_url, title (optionnel), cta_url (optionnel)</p>
        </fieldset>
      )}

      {form.type === "countdown" && (
        <fieldset className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <legend className="text-sm font-bold text-slate-900 px-1">Countdown</legend>
          <div className="space-y-1.5">
            <Label className="text-xs">Date cible</Label>
            <Input
              type="datetime-local"
              value={form.countdown_target || ""}
              onChange={(e) => update("countdown_target", e.target.value)}
              className="h-9 text-sm"
            />
          </div>
        </fieldset>
      )}

      {form.type === "form" && (
        <fieldset className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <legend className="text-sm font-bold text-slate-900 px-1">Champs du Formulaire (JSON)</legend>
          <Textarea
            value={formFieldsJson}
            onChange={(e) => setFormFieldsJson(e.target.value)}
            className="text-xs font-mono min-h-[120px]"
            placeholder={'[\n  { "name": "email", "type": "email", "label": "Email", "required": true }\n]'}
          />
          <p className="text-[10px] text-slate-400">Types: text, email, phone, select (+ options[]), textarea</p>
        </fieldset>
      )}

      {/* Section: Affichage */}
      <fieldset className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <legend className="text-sm font-bold text-slate-900 px-1">Affichage</legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Format d'affichage</Label>
            <Select value={form.display_format} onValueChange={(v) => update("display_format", v as DisplayFormat)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DISPLAY_FORMATS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Animation</Label>
            <Select value={form.animation} onValueChange={(v) => update("animation", v as AnimationType)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ANIMATION_OPTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Fermeture</Label>
            <Select value={form.close_behavior} onValueChange={(v) => update("close_behavior", v as CloseBehavior)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="click_x">Clic sur X</SelectItem>
                <SelectItem value="click_outside">Clic exterieur</SelectItem>
                <SelectItem value="auto_close">Auto-fermeture</SelectItem>
                <SelectItem value="no_close">Pas de fermeture</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Overlay couleur</Label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.overlay_color || "#000000"} onChange={(e) => update("overlay_color", e.target.value)} className="h-9 w-9 rounded border cursor-pointer" />
              <Input value={form.overlay_color || ""} onChange={(e) => update("overlay_color", e.target.value)} className="h-9 text-xs flex-1" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Overlay opacite (0-1)</Label>
            <Input type="number" min={0} max={1} step={0.1} value={form.overlay_opacity} onChange={(e) => update("overlay_opacity", parseFloat(e.target.value) || 0)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Delai fermeture (s)</Label>
            <Input type="number" min={0} value={form.close_delay_seconds} onChange={(e) => update("close_delay_seconds", parseInt(e.target.value) || 0)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Apparition</Label>
            <div className="flex gap-2">
              <Select value={form.appear_delay_type} onValueChange={(v) => update("appear_delay_type", v as any)}>
                <SelectTrigger className="h-9 text-xs flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Immédiat</SelectItem>
                  <SelectItem value="seconds">Secondes</SelectItem>
                  <SelectItem value="scroll_percent">% scroll</SelectItem>
                </SelectContent>
              </Select>
              {form.appear_delay_type !== "none" && (
                <Input type="number" min={0} value={form.appear_delay_value} onChange={(e) => update("appear_delay_value", parseInt(e.target.value) || 0)} className="h-9 text-sm w-20" />
              )}
            </div>
          </div>
        </div>
      </fieldset>

      {/* Section: Ciblage */}
      <fieldset className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <legend className="text-sm font-bold text-slate-900 px-1">Ciblage</legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Audience</Label>
            <Select value={form.audience_type} onValueChange={(v) => update("audience_type", v as AudienceType)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les visiteurs</SelectItem>
                <SelectItem value="segment">Segment</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Declencheur</Label>
            <Select value={form.trigger} onValueChange={(v) => update("trigger", v as TriggerType)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TRIGGER_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Frequence</Label>
            <Select value={form.frequency} onValueChange={(v) => update("frequency", v as FrequencyType)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FREQUENCY_OPTIONS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        {form.trigger === "on_page" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Page cible (URL path)</Label>
            <Input value={form.trigger_page || ""} onChange={(e) => update("trigger_page", e.target.value)} placeholder="/restaurants" className="h-9 text-sm" />
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Date debut</Label>
            <Input type="datetime-local" value={form.start_date || ""} onChange={(e) => update("start_date", e.target.value || null)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Date fin</Label>
            <Input type="datetime-local" value={form.end_date || ""} onChange={(e) => update("end_date", e.target.value || null)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Priorite (1-10)</Label>
            <Input type="number" min={1} max={10} value={form.priority} onChange={(e) => update("priority", parseInt(e.target.value) || 5)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Plateforme</Label>
            <Select value={form.platform} onValueChange={(v) => update("platform", v as PlatformType)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="web">Web</SelectItem>
                <SelectItem value="mobile">Mobile</SelectItem>
                <SelectItem value="both">Les deux</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </fieldset>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 pt-2">
        <Button variant="outline" onClick={() => handleSave("draft")} disabled={saving || !form.internal_name} className="h-9 text-sm">
          {saving ? <Loader2 className="h-4 w-4 animate-spin me-1.5" /> : null}
          Enregistrer en brouillon
        </Button>
        <Button onClick={() => handleSave("active")} disabled={saving || !form.internal_name} className="h-9 text-sm bg-emerald-600 hover:bg-emerald-700 text-white">
          {saving ? <Loader2 className="h-4 w-4 animate-spin me-1.5" /> : <CheckCircle className="h-4 w-4 me-1.5" />}
          Activer
        </Button>
      </div>
    </div>
  );
}

function safeJsonParse(str: string): any {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

// =============================================================================
// Tab 3: Stats & Form responses
// =============================================================================

function StatsTab({
  banners,
  loading,
}: {
  banners: Banner[];
  loading: boolean;
}) {
  const [selectedBannerId, setSelectedBannerId] = useState<string | null>(null);
  const [responses, setResponses] = useState<FormResponse[]>([]);
  const [responsesLoading, setResponsesLoading] = useState(false);

  const selectedBanner = useMemo(() => banners.find((b) => b.id === selectedBannerId) || null, [banners, selectedBannerId]);

  const fetchResponses = useCallback(async (bannerId: string) => {
    setResponsesLoading(true);
    try {
      const data = await adminFetch<{ responses: FormResponse[] }>(`/api/admin/banners/${bannerId}/responses`);
      setResponses(data.responses);
    } catch {
      setResponses([]);
    } finally {
      setResponsesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedBannerId && selectedBanner?.type === "form") {
      fetchResponses(selectedBannerId);
    } else {
      setResponses([]);
    }
  }, [selectedBannerId, selectedBanner, fetchResponses]);

  const exportCsv = useCallback(() => {
    if (!responses.length || !selectedBanner) return;
    const fields = selectedBanner.form_fields || [];
    const headers = fields.map((f) => f.label);
    headers.push("Date de soumission");

    const rows = responses.map((r) => {
      const vals = fields.map((f) => r.data[f.name] || "");
      vals.push(formatDate(r.submitted_at));
      return vals;
    });

    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `responses_${selectedBanner.internal_name.replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [responses, selectedBanner]);

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  const sortedBanners = [...banners].sort((a, b) => b.impressions - a.impressions);

  return (
    <div className="space-y-5">
      {/* Global stats table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h4 className="text-sm font-bold text-slate-900">Performance des bannieres</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-start">
                <th className="px-4 py-2.5 font-semibold text-slate-500">Nom</th>
                <th className="px-4 py-2.5 font-semibold text-slate-500">Type</th>
                <th className="px-4 py-2.5 font-semibold text-slate-500 text-end">Impressions</th>
                <th className="px-4 py-2.5 font-semibold text-slate-500 text-end">Clics</th>
                <th className="px-4 py-2.5 font-semibold text-slate-500 text-end">CTR</th>
                <th className="px-4 py-2.5 font-semibold text-slate-500 text-end">Fermetures</th>
                <th className="px-4 py-2.5 font-semibold text-slate-500 text-end">Formulaires</th>
                <th className="px-4 py-2.5 font-semibold text-slate-500">Statut</th>
              </tr>
            </thead>
            <tbody>
              {sortedBanners.map((b) => {
                const ctr = b.impressions > 0 ? ((b.clicks / b.impressions) * 100).toFixed(1) : "0.0";
                const statusInfo = STATUS_CONFIG[b.status];
                return (
                  <tr
                    key={b.id}
                    className={cn("border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors", selectedBannerId === b.id && "bg-slate-50")}
                    onClick={() => setSelectedBannerId(b.id)}
                  >
                    <td className="px-4 py-2.5 font-medium text-slate-900 max-w-[200px] truncate">{b.internal_name}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 border", TYPE_CONFIG[b.type].color)}>
                        {TYPE_CONFIG[b.type].label}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-end tabular-nums">{b.impressions.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-end tabular-nums">{b.clicks.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-end tabular-nums font-semibold">{ctr}%</td>
                    <td className="px-4 py-2.5 text-end tabular-nums">{b.closes.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-end tabular-nums">{b.form_submissions.toLocaleString()}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 border", statusInfo.color)}>
                        {statusInfo.label}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
              {sortedBanners.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-400">Aucune banniere</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form responses for selected banner */}
      {selectedBanner && selectedBanner.type === "form" && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-900">
              Reponses formulaire: {selectedBanner.internal_name}
              <span className="text-slate-400 font-normal ms-2">({responses.length})</span>
            </h4>
            {responses.length > 0 && (
              <Button variant="outline" size="sm" onClick={exportCsv} className="h-7 text-xs px-2.5">
                <Download className="h-3 w-3 me-1" /> Exporter CSV
              </Button>
            )}
          </div>
          {responsesLoading ? (
            <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : responses.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">Aucune reponse</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-start">
                    {(selectedBanner.form_fields || []).map((f) => (
                      <th key={f.name} className="px-4 py-2.5 font-semibold text-slate-500">{f.label}</th>
                    ))}
                    <th className="px-4 py-2.5 font-semibold text-slate-500">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {responses.map((r) => (
                    <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50">
                      {(selectedBanner.form_fields || []).map((f) => (
                        <td key={f.name} className="px-4 py-2.5 text-slate-700 max-w-[200px] truncate">
                          {r.data[f.name] || "\u2014"}
                        </td>
                      ))}
                      <td className="px-4 py-2.5 text-slate-500">{formatDate(r.submitted_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {selectedBanner && selectedBanner.type !== "form" && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h4 className="text-sm font-bold text-slate-900 mb-3">Detail: {selectedBanner.internal_name}</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="space-y-0.5">
              <p className="text-[10px] font-medium text-slate-500">Impressions</p>
              <p className="text-lg font-bold text-slate-900">{selectedBanner.impressions.toLocaleString()}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] font-medium text-slate-500">Clics</p>
              <p className="text-lg font-bold text-blue-600">{selectedBanner.clicks.toLocaleString()}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] font-medium text-slate-500">CTR</p>
              <p className="text-lg font-bold text-emerald-600">
                {selectedBanner.impressions > 0 ? ((selectedBanner.clicks / selectedBanner.impressions) * 100).toFixed(1) : "0.0"}%
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] font-medium text-slate-500">Fermetures</p>
              <p className="text-lg font-bold text-amber-600">{selectedBanner.closes.toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Main dashboard
// =============================================================================

export type AdminBannersTab = "list" | "form" | "stats";

export interface AdminBannersDashboardProps {
  className?: string;
}

export function AdminBannersDashboard({ className }: AdminBannersDashboardProps) {
  const [activeTab, setActiveTab] = useState<AdminBannersTab>("list");
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [saving, setSaving] = useState(false);

  // Fetch all banners
  const fetchBanners = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetch<{ banners: Banner[] }>("/api/admin/banners");
      setBanners(data.banners);
    } catch {
      setBanners([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBanners();
  }, [fetchBanners]);

  // Clear message after delay
  useEffect(() => {
    if (!actionMsg) return;
    const t = setTimeout(() => setActionMsg(null), 4000);
    return () => clearTimeout(t);
  }, [actionMsg]);

  // Actions
  const handleAction = useCallback(async (id: string, action: "activate" | "pause" | "disable") => {
    try {
      await adminFetch(`/api/admin/banners/${id}/${action}`, { method: "POST" });
      setActionMsg(action === "activate" ? "Banniere activee" : action === "pause" ? "Banniere mise en pause" : "Banniere desactivee");
      fetchBanners();
    } catch (e: any) {
      setActionMsg(e.message);
    }
  }, [fetchBanners]);

  const handleDuplicate = useCallback(async (banner: Banner) => {
    try {
      await adminFetch("/api/admin/banners", {
        method: "POST",
        body: JSON.stringify({
          ...banner,
          id: undefined,
          internal_name: `${banner.internal_name} (copie)`,
          status: "draft",
          impressions: undefined,
          clicks: undefined,
          closes: undefined,
          form_submissions: undefined,
          created_at: undefined,
          updated_at: undefined,
        }),
      });
      setActionMsg("Banniere dupliquee");
      fetchBanners();
    } catch (e: any) {
      setActionMsg(e.message);
    }
  }, [fetchBanners]);

  const handleSave = useCallback(async (data: any, status: "draft" | "active") => {
    setSaving(true);
    try {
      const isEdit = editingBanner?.id;
      const url = isEdit ? `/api/admin/banners/${editingBanner.id}` : "/api/admin/banners";
      const method = isEdit ? "PUT" : "POST";
      await adminFetch(url, { method, body: JSON.stringify({ ...data, status }) });
      setActionMsg(isEdit ? "Banniere mise a jour" : "Banniere creee");
      setEditingBanner(null);
      setActiveTab("list");
      fetchBanners();
    } catch (e: any) {
      setActionMsg(e.message);
    } finally {
      setSaving(false);
    }
  }, [editingBanner, fetchBanners]);

  const handleEdit = useCallback((banner: Banner) => {
    setEditingBanner(banner);
    setActiveTab("form");
  }, []);

  const handleViewStats = useCallback((banner: Banner) => {
    setActiveTab("stats");
  }, []);

  const handleNewBanner = useCallback(() => {
    setEditingBanner(null);
    setActiveTab("form");
  }, []);

  // Tab navigation items
  const tabs: { id: AdminBannersTab; label: string; icon: typeof Image }[] = [
    { id: "list", label: "Bannieres", icon: Image },
    { id: "form", label: editingBanner ? "Modifier" : "Creer", icon: Edit },
    { id: "stats", label: "Statistiques & Formulaires", icon: BarChart3 },
  ];

  return (
    <div className={cn("space-y-4", className)}>
      {/* Marketing sub-navigation */}
      <AdminVisibilityNav />

      {/* Action message */}
      {actionMsg && (
        <div className="text-sm bg-emerald-50 text-emerald-700 px-4 py-2.5 rounded-xl flex items-center justify-between">
          <span>{actionMsg}</span>
          <button onClick={() => setActionMsg(null)} className="text-emerald-400 hover:text-emerald-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors",
                isActive
                  ? "border-[hsl(354,100%,32%)] text-[hsl(354,100%,32%)]"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
        <div className="ms-auto pe-1 py-1">
          <Button size="sm" onClick={handleNewBanner} className="h-7 text-xs px-3 bg-[hsl(354,100%,32%)] hover:bg-[hsl(354,100%,28%)] text-white">
            <Plus className="h-3.5 w-3.5 me-1" /> Nouvelle banniere
          </Button>
        </div>
      </div>

      {/* Tab content */}
      {activeTab === "list" && (
        <BannersListTab
          banners={banners}
          loading={loading}
          onRefresh={fetchBanners}
          onEdit={handleEdit}
          onDuplicate={handleDuplicate}
          onAction={handleAction}
          onViewStats={handleViewStats}
        />
      )}

      {activeTab === "form" && (
        <BannerForm
          initial={editingBanner}
          onSave={handleSave}
          saving={saving}
        />
      )}

      {activeTab === "stats" && (
        <StatsTab banners={banners} loading={loading} />
      )}
    </div>
  );
}

export default AdminBannersDashboard;
