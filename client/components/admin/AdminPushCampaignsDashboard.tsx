/**
 * AdminPushCampaignsDashboard — Admin dashboard for push marketing campaigns.
 *
 * 4 tabs: Campagnes (list), Creer/Modifier (form), Statistiques, Livraisons.
 * Uses admin auth pattern (session token + API key from sessionStorage).
 */

import { useCallback, useEffect, useState } from "react";
import {
  Bell, Send, BarChart3, Truck, Plus, Eye, Edit, Play,
  Clock, XCircle, CheckCircle, RefreshCw, TestTube,
  Users, MousePointerClick, MailOpen, TrendingUp,
  ChevronDown, Filter, Search, ArrowLeft,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AdminVisibilityNav } from "@/pages/admin/visibility/AdminVisibilityNav";

// =============================================================================
// Types
// =============================================================================

type CampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "cancelled";
type CampaignType =
  | "nouveau_restaurant" | "offre" | "blog" | "video"
  | "evenement" | "selection" | "saison" | "update" | "custom";
type Channel = "push" | "in_app" | "email";
type AudienceType = "all" | "segment";
type Priority = "normal" | "high";

interface CampaignStats {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
}

interface AudienceFilters {
  cities: string[];
  seniority: string;
  recent_activity: string;
}

interface Campaign {
  id: string;
  title: string;
  message: string;
  type: CampaignType;
  status: CampaignStatus;
  image_url: string;
  cta_url: string;
  channels: Channel[];
  audience_type: AudienceType;
  audience_filters: AudienceFilters | null;
  audience_count: number;
  priority: Priority;
  scheduled_at: string | null;
  sent_at: string | null;
  stats: CampaignStats;
  created_at: string;
  updated_at: string;
}

interface Delivery {
  id: string;
  campaign_id: string;
  user_id: string;
  user_email: string;
  channel: Channel;
  status: "pending" | "sent" | "delivered" | "opened" | "clicked" | "failed" | "unsubscribed";
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
}

interface GlobalStats {
  total_sent: number;
  total_delivered: number;
  delivery_rate: number;
  open_rate: number;
  click_rate: number;
  unsubscribe_count: number;
}

interface CampaignFormData {
  title: string;
  message: string;
  type: CampaignType;
  image_url: string;
  cta_url: string;
  channels: Channel[];
  audience_type: AudienceType;
  audience_filters: AudienceFilters;
  priority: Priority;
}

// =============================================================================
// Admin auth (same pattern as packsV2AdminApi)
// =============================================================================

const STORAGE_KEY = "sam_admin_api_key";
const SESSION_TOKEN_KEY = "sam_admin_session_token";

function getAdminHeaders(): Record<string, string> {
  const adminKey = sessionStorage.getItem(STORAGE_KEY) ?? "";
  const sessionToken = sessionStorage.getItem(SESSION_TOKEN_KEY) ?? "";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (adminKey) headers["x-admin-key"] = adminKey;
  if (sessionToken) headers["x-admin-session"] = sessionToken;
  return headers;
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { ...getAdminHeaders(), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

// =============================================================================
// API calls
// =============================================================================

async function fetchCampaigns(): Promise<Campaign[]> {
  const data = await adminFetch<{ campaigns: Campaign[] }>("/api/admin/push-campaigns");
  return data.campaigns;
}

async function fetchCampaign(id: string): Promise<Campaign> {
  const data = await adminFetch<{ campaign: Campaign }>(`/api/admin/push-campaigns/${id}`);
  return data.campaign;
}

async function createCampaign(payload: CampaignFormData): Promise<Campaign> {
  const data = await adminFetch<{ campaign: Campaign }>("/api/admin/push-campaigns", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.campaign;
}

async function updateCampaign(id: string, payload: Partial<CampaignFormData>): Promise<Campaign> {
  const data = await adminFetch<{ campaign: Campaign }>(`/api/admin/push-campaigns/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return data.campaign;
}

async function sendTestCampaign(id: string): Promise<void> {
  await adminFetch(`/api/admin/push-campaigns/${id}/test`, { method: "POST" });
}

async function scheduleCampaign(id: string, scheduledAt: string): Promise<void> {
  await adminFetch(`/api/admin/push-campaigns/${id}/schedule`, {
    method: "POST",
    body: JSON.stringify({ scheduled_at: scheduledAt }),
  });
}

async function sendCampaign(id: string): Promise<void> {
  await adminFetch(`/api/admin/push-campaigns/${id}/send`, { method: "POST" });
}

async function cancelCampaign(id: string): Promise<void> {
  await adminFetch(`/api/admin/push-campaigns/${id}/cancel`, { method: "POST" });
}

async function previewAudience(filters: AudienceFilters, audienceType: AudienceType): Promise<number> {
  const data = await adminFetch<{ count: number }>("/api/admin/push-campaigns/preview-audience", {
    method: "POST",
    body: JSON.stringify({ audience_type: audienceType, audience_filters: filters }),
  });
  return data.count;
}

async function fetchGlobalStats(): Promise<GlobalStats> {
  const data = await adminFetch<{ stats: GlobalStats }>("/api/admin/push-campaigns/stats");
  return data.stats;
}

async function fetchCampaignDeliveries(campaignId: string, statusFilter?: string): Promise<Delivery[]> {
  const qs = statusFilter ? `?status=${statusFilter}` : "";
  const data = await adminFetch<{ deliveries: Delivery[] }>(`/api/admin/push-campaigns/${campaignId}/deliveries${qs}`);
  return data.deliveries;
}

// =============================================================================
// Helpers
// =============================================================================

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "\u2014";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function pct(a: number, b: number): string {
  if (!b) return "0%";
  return `${Math.round((a / b) * 100)}%`;
}

const STATUS_CONFIG: Record<CampaignStatus, { label: string; color: string }> = {
  draft: { label: "Brouillon", color: "bg-slate-100 text-slate-600" },
  scheduled: { label: "Programmée", color: "bg-blue-100 text-blue-700" },
  sending: { label: "En cours", color: "bg-amber-100 text-amber-700" },
  sent: { label: "Envoyée", color: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "Annulée", color: "bg-red-100 text-red-600" },
};

const CAMPAIGN_TYPES: { value: CampaignType; label: string }[] = [
  { value: "nouveau_restaurant", label: "Nouveau restaurant" },
  { value: "offre", label: "Offre spéciale" },
  { value: "blog", label: "Article blog" },
  { value: "video", label: "Vidéo" },
  { value: "evenement", label: "Événement" },
  { value: "selection", label: "Sélection" },
  { value: "saison", label: "Saison" },
  { value: "update", label: "Mise à jour" },
  { value: "custom", label: "Personnalisé" },
];

const SENIORITY_OPTIONS = [
  { value: "", label: "Tous" },
  { value: "new", label: "Nouveaux (< 30j)" },
  { value: "regular", label: "Réguliers (30j-6m)" },
  { value: "veteran", label: "Vétérans (> 6m)" },
];

const ACTIVITY_OPTIONS = [
  { value: "", label: "Tous" },
  { value: "active_7d", label: "Actifs 7 derniers jours" },
  { value: "active_30d", label: "Actifs 30 derniers jours" },
  { value: "inactive_30d", label: "Inactifs > 30 jours" },
  { value: "inactive_90d", label: "Inactifs > 90 jours" },
];

const CITIES_OPTIONS = [
  "Casablanca", "Rabat", "Marrakech", "Tanger", "Fès", "Agadir",
  "Meknès", "Oujda", "Kenitra", "Essaouira", "El Jadida", "Tétouan",
];

const DELIVERY_STATUS_OPTIONS = [
  { value: "", label: "Tous" },
  { value: "pending", label: "En attente" },
  { value: "sent", label: "Envoyé" },
  { value: "delivered", label: "Livré" },
  { value: "opened", label: "Ouvert" },
  { value: "clicked", label: "Cliqué" },
  { value: "failed", label: "Échoué" },
  { value: "unsubscribed", label: "Désabonné" },
];

const EMPTY_FORM: CampaignFormData = {
  title: "",
  message: "",
  type: "custom",
  image_url: "",
  cta_url: "",
  channels: ["push"],
  audience_type: "all",
  audience_filters: { cities: [], seniority: "", recent_activity: "" },
  priority: "normal",
};

// =============================================================================
// Tab 1: Campagnes list
// =============================================================================

function CampagnesSection({
  campaigns,
  loading,
  onRefresh,
  onView,
  onEdit,
  onAction,
  actionMsg,
}: {
  campaigns: Campaign[];
  loading: boolean;
  onRefresh: () => void;
  onView: (c: Campaign) => void;
  onEdit: (c: Campaign) => void;
  onAction: (action: string, id: string) => void;
  actionMsg: string | null;
}) {
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | "">("");
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");

  const filtered = statusFilter
    ? campaigns.filter((c) => c.status === statusFilter)
    : campaigns;

  const handleScheduleSubmit = (id: string) => {
    if (!scheduleDate) return;
    onAction("schedule", id + "|" + scheduleDate);
    setScheduleId(null);
    setScheduleDate("");
  };

  if (loading) return <div className="py-8 text-center text-sm text-slate-500">Chargement...</div>;

  return (
    <div className="space-y-4">
      {actionMsg && (
        <div className="text-sm text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl">{actionMsg}</div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as CampaignStatus | "")}
          className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700"
        >
          <option value="">Tous les statuts</option>
          {(Object.keys(STATUS_CONFIG) as CampaignStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={onRefresh}
          className="h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
        <div className="ms-auto text-xs text-slate-400">{filtered.length} campagne(s)</div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-500">Aucune campagne</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-start text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Titre</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium text-end">Audience</th>
                <th className="px-4 py-3 font-medium">Programmée</th>
                <th className="px-4 py-3 font-medium text-end">Envoyés</th>
                <th className="px-4 py-3 font-medium text-end">Livrés</th>
                <th className="px-4 py-3 font-medium text-end">Ouverts</th>
                <th className="px-4 py-3 font-medium text-end">Cliqués</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((c) => {
                const cfg = STATUS_CONFIG[c.status];
                return (
                  <tr key={c.id} className="bg-white hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900 max-w-[200px] truncate">{c.title}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {CAMPAIGN_TYPES.find((t) => t.value === c.type)?.label ?? c.type}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold", cfg.color)}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-end text-xs text-slate-600">
                      {c.audience_count.toLocaleString("fr-FR")}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDate(c.scheduled_at)}</td>
                    <td className="px-4 py-3 text-end text-xs tabular-nums">{c.stats.sent.toLocaleString("fr-FR")}</td>
                    <td className="px-4 py-3 text-end text-xs tabular-nums">{c.stats.delivered.toLocaleString("fr-FR")}</td>
                    <td className="px-4 py-3 text-end text-xs tabular-nums">{c.stats.opened.toLocaleString("fr-FR")}</td>
                    <td className="px-4 py-3 text-end text-xs tabular-nums">{c.stats.clicked.toLocaleString("fr-FR")}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        <button
                          type="button"
                          onClick={() => onView(c)}
                          title="Voir"
                          className="h-7 w-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100"
                        >
                          <Eye className="h-3 w-3" />
                        </button>
                        {c.status === "draft" && (
                          <button
                            type="button"
                            onClick={() => onEdit(c)}
                            title="Modifier"
                            className="h-7 w-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100"
                          >
                            <Edit className="h-3 w-3" />
                          </button>
                        )}
                        {(c.status === "draft" || c.status === "scheduled") && (
                          <button
                            type="button"
                            onClick={() => onAction("test", c.id)}
                            title="Envoyer test"
                            className="h-7 w-7 rounded-lg border border-blue-200 flex items-center justify-center text-blue-500 hover:bg-blue-50"
                          >
                            <TestTube className="h-3 w-3" />
                          </button>
                        )}
                        {c.status === "draft" && (
                          <>
                            <button
                              type="button"
                              onClick={() => setScheduleId(scheduleId === c.id ? null : c.id)}
                              title="Programmer"
                              className="h-7 w-7 rounded-lg border border-blue-200 flex items-center justify-center text-blue-600 hover:bg-blue-50"
                            >
                              <Clock className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onAction("send", c.id)}
                              title="Envoyer maintenant"
                              className="h-7 w-7 rounded-lg border border-emerald-200 flex items-center justify-center text-emerald-600 hover:bg-emerald-50"
                            >
                              <Send className="h-3 w-3" />
                            </button>
                          </>
                        )}
                        {(c.status === "scheduled" || c.status === "sending") && (
                          <button
                            type="button"
                            onClick={() => onAction("cancel", c.id)}
                            title="Annuler"
                            className="h-7 w-7 rounded-lg border border-red-200 flex items-center justify-center text-red-500 hover:bg-red-50"
                          >
                            <XCircle className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      {/* Schedule inline input */}
                      {scheduleId === c.id && (
                        <div className="flex items-center gap-1.5 mt-2">
                          <input
                            type="datetime-local"
                            value={scheduleDate}
                            onChange={(e) => setScheduleDate(e.target.value)}
                            className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => handleScheduleSubmit(c.id)}
                            disabled={!scheduleDate}
                            className="h-7 px-2.5 rounded-lg bg-blue-600 text-white text-xs font-semibold disabled:opacity-50"
                          >
                            OK
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Tab 2: Creer / Modifier
// =============================================================================

function CampaignFormSection({
  editingCampaign,
  onSaved,
  onCancel,
}: {
  editingCampaign: Campaign | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<CampaignFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [audiencePreview, setAudiencePreview] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Populate form when editing
  useEffect(() => {
    if (editingCampaign) {
      setForm({
        title: editingCampaign.title,
        message: editingCampaign.message,
        type: editingCampaign.type,
        image_url: editingCampaign.image_url,
        cta_url: editingCampaign.cta_url,
        channels: editingCampaign.channels,
        audience_type: editingCampaign.audience_type,
        audience_filters: editingCampaign.audience_filters ?? { cities: [], seniority: "", recent_activity: "" },
        priority: editingCampaign.priority,
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setError(null);
    setSuccess(null);
    setAudiencePreview(null);
  }, [editingCampaign]);

  const toggleChannel = (ch: Channel) => {
    setForm((prev) => ({
      ...prev,
      channels: prev.channels.includes(ch)
        ? prev.channels.filter((c) => c !== ch)
        : [...prev.channels, ch],
    }));
  };

  const toggleCity = (city: string) => {
    setForm((prev) => ({
      ...prev,
      audience_filters: {
        ...prev.audience_filters,
        cities: prev.audience_filters.cities.includes(city)
          ? prev.audience_filters.cities.filter((c) => c !== city)
          : [...prev.audience_filters.cities, city],
      },
    }));
  };

  const handlePreviewAudience = async () => {
    setPreviewLoading(true);
    try {
      const count = await previewAudience(form.audience_filters, form.audience_type);
      setAudiencePreview(count);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSave = async (action: "draft" | "schedule" | "send") => {
    if (!form.title.trim()) { setError("Le titre est requis"); return; }
    if (!form.message.trim()) { setError("Le message est requis"); return; }
    if (form.channels.length === 0) { setError("Sélectionnez au moins un canal"); return; }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      let campaign: Campaign;
      if (editingCampaign) {
        campaign = await updateCampaign(editingCampaign.id, form);
      } else {
        campaign = await createCampaign(form);
      }

      if (action === "send") {
        await sendCampaign(campaign.id);
        setSuccess("Campagne envoyee avec succes");
      } else if (action === "schedule") {
        setSuccess("Campagne sauvegardee en brouillon. Programmez-la depuis l'onglet Campagnes.");
      } else {
        setSuccess("Brouillon sauvegarde");
      }

      setTimeout(() => onSaved(), 1200);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 max-w-2xl">
      {editingCampaign && (
        <button type="button" onClick={onCancel} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-3.5 w-3.5" /> Retour
        </button>
      )}

      {error && <div className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-xl">{error}</div>}
      {success && <div className="text-sm text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl">{success}</div>}

      {/* Title */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Titre (max 60 car.)</label>
        <input
          type="text"
          maxLength={60}
          value={form.title}
          onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
          placeholder="Titre de la notification"
          className="w-full h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:ring-2 focus:ring-[#a3001d]/20 focus:border-[#a3001d] outline-none"
        />
        <div className="text-xs text-slate-400 mt-0.5 text-end">{form.title.length}/60</div>
      </div>

      {/* Message */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Message</label>
        <textarea
          value={form.message}
          onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
          placeholder="Corps du message..."
          rows={4}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm resize-y focus:ring-2 focus:ring-[#a3001d]/20 focus:border-[#a3001d] outline-none"
        />
      </div>

      {/* Type */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Type</label>
        <select
          value={form.type}
          onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as CampaignType }))}
          className="w-full h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm"
        >
          {CAMPAIGN_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Image + CTA */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Image URL</label>
          <input
            type="text"
            value={form.image_url}
            onChange={(e) => setForm((p) => ({ ...p, image_url: e.target.value }))}
            placeholder="https://..."
            className="w-full h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:ring-2 focus:ring-[#a3001d]/20 focus:border-[#a3001d] outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">CTA URL</label>
          <input
            type="text"
            value={form.cta_url}
            onChange={(e) => setForm((p) => ({ ...p, cta_url: e.target.value }))}
            placeholder="https://sam.ma/..."
            className="w-full h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:ring-2 focus:ring-[#a3001d]/20 focus:border-[#a3001d] outline-none"
          />
        </div>
      </div>

      {/* Channels */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1.5">Canaux</label>
        <div className="flex gap-3">
          {(["push", "in_app", "email"] as Channel[]).map((ch) => (
            <label key={ch} className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.channels.includes(ch)}
                onChange={() => toggleChannel(ch)}
                className="h-4 w-4 rounded border-slate-300 text-[#a3001d] focus:ring-[#a3001d]"
              />
              {ch === "push" ? "Push" : ch === "in_app" ? "In-App" : "Email"}
            </label>
          ))}
        </div>
      </div>

      {/* Audience */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1.5">Audience</label>
        <div className="flex gap-4 mb-3">
          <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
            <input
              type="radio"
              name="audience"
              checked={form.audience_type === "all"}
              onChange={() => setForm((p) => ({ ...p, audience_type: "all" }))}
              className="text-[#a3001d] focus:ring-[#a3001d]"
            />
            Tous les utilisateurs
          </label>
          <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
            <input
              type="radio"
              name="audience"
              checked={form.audience_type === "segment"}
              onChange={() => setForm((p) => ({ ...p, audience_type: "segment" }))}
              className="text-[#a3001d] focus:ring-[#a3001d]"
            />
            Segment
          </label>
        </div>

        {form.audience_type === "segment" && (
          <div className="space-y-3 p-4 rounded-xl border border-slate-200 bg-slate-50/50">
            {/* Cities multi-select */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Villes</label>
              <div className="flex flex-wrap gap-1.5">
                {CITIES_OPTIONS.map((city) => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => toggleCity(city)}
                    className={cn(
                      "h-7 px-2.5 rounded-full text-xs font-medium border transition",
                      form.audience_filters.cities.includes(city)
                        ? "bg-[#a3001d] text-white border-[#a3001d]"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100",
                    )}
                  >
                    {city}
                  </button>
                ))}
              </div>
            </div>

            {/* Seniority */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Ancienneté</label>
              <select
                value={form.audience_filters.seniority}
                onChange={(e) => setForm((p) => ({
                  ...p,
                  audience_filters: { ...p.audience_filters, seniority: e.target.value },
                }))}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs"
              >
                {SENIORITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Recent activity */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Activité récente</label>
              <select
                value={form.audience_filters.recent_activity}
                onChange={(e) => setForm((p) => ({
                  ...p,
                  audience_filters: { ...p.audience_filters, recent_activity: e.target.value },
                }))}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs"
              >
                {ACTIVITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Preview audience */}
            <div className="flex items-center gap-3">
              <Button
                onClick={handlePreviewAudience}
                disabled={previewLoading}
                className="h-8 px-3 bg-slate-700 text-white text-xs font-semibold rounded-lg"
              >
                <Users className="h-3 w-3 me-1" />
                {previewLoading ? "Calcul..." : "Prévisualiser audience"}
              </Button>
              {audiencePreview !== null && (
                <span className="text-sm font-semibold text-[#a3001d]">
                  {audiencePreview.toLocaleString("fr-FR")} utilisateur(s)
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Priority */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Priorité</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
            <input
              type="radio"
              name="priority"
              checked={form.priority === "normal"}
              onChange={() => setForm((p) => ({ ...p, priority: "normal" }))}
              className="text-[#a3001d] focus:ring-[#a3001d]"
            />
            Normale
          </label>
          <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
            <input
              type="radio"
              name="priority"
              checked={form.priority === "high"}
              onChange={() => setForm((p) => ({ ...p, priority: "high" }))}
              className="text-[#a3001d] focus:ring-[#a3001d]"
            />
            Haute
          </label>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <Button
          onClick={() => handleSave("draft")}
          disabled={saving}
          className="h-9 px-4 bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-300"
        >
          {saving ? "..." : "Sauvegarder brouillon"}
        </Button>
        <Button
          onClick={() => handleSave("send")}
          disabled={saving}
          className="h-9 px-4 bg-[#a3001d] text-white text-sm font-semibold rounded-lg hover:bg-[#8a0018]"
        >
          <Send className="h-3.5 w-3.5 me-1.5" />
          {saving ? "..." : "Envoyer maintenant"}
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Tab 3: Statistiques
// =============================================================================

function StatsSection({ campaigns }: { campaigns: Campaign[] }) {
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const s = await fetchGlobalStats();
        setStats(s);
      } catch { /* silent */ } finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="py-8 text-center text-sm text-slate-500">Chargement...</div>;

  const sentCampaigns = campaigns.filter((c) => c.status === "sent");

  return (
    <div className="space-y-5">
      {/* Global KPI cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Total envoyés", value: stats.total_sent.toLocaleString("fr-FR"), icon: Send, color: "text-blue-600" },
            { label: "Total livrés", value: stats.total_delivered.toLocaleString("fr-FR"), icon: CheckCircle, color: "text-emerald-600" },
            { label: "Taux livraison", value: pct(stats.total_delivered, stats.total_sent), icon: TrendingUp, color: "text-emerald-600" },
            { label: "Taux ouverture", value: `${stats.open_rate}%`, icon: MailOpen, color: "text-amber-600" },
            { label: "Taux clic", value: `${stats.click_rate}%`, icon: MousePointerClick, color: "text-indigo-600" },
            { label: "Désabonnements", value: stats.unsubscribe_count.toLocaleString("fr-FR"), icon: XCircle, color: "text-red-500" },
          ].map((kpi) => {
            const Icon = kpi.icon;
            return (
              <div key={kpi.label} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className={cn("h-3.5 w-3.5", kpi.color)} />
                  <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">{kpi.label}</span>
                </div>
                <div className="text-lg font-bold text-slate-900">{kpi.value}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Per-campaign stats table */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Détail par campagne</h3>
        {sentCampaigns.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-500">Aucune campagne envoyée</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Campagne</th>
                  <th className="px-4 py-3 font-medium text-end">Envoyés</th>
                  <th className="px-4 py-3 font-medium text-end">Livrés</th>
                  <th className="px-4 py-3 font-medium text-end">Taux livr.</th>
                  <th className="px-4 py-3 font-medium text-end">Ouverts</th>
                  <th className="px-4 py-3 font-medium text-end">Taux ouv.</th>
                  <th className="px-4 py-3 font-medium text-end">Cliqués</th>
                  <th className="px-4 py-3 font-medium text-end">Taux clic</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sentCampaigns.map((c) => (
                  <tr key={c.id} className="bg-white">
                    <td className="px-4 py-2.5 text-slate-900 font-medium max-w-[200px] truncate">{c.title}</td>
                    <td className="px-4 py-2.5 text-end tabular-nums">{c.stats.sent.toLocaleString("fr-FR")}</td>
                    <td className="px-4 py-2.5 text-end tabular-nums">{c.stats.delivered.toLocaleString("fr-FR")}</td>
                    <td className="px-4 py-2.5 text-end tabular-nums">{pct(c.stats.delivered, c.stats.sent)}</td>
                    <td className="px-4 py-2.5 text-end tabular-nums">{c.stats.opened.toLocaleString("fr-FR")}</td>
                    <td className="px-4 py-2.5 text-end tabular-nums">{pct(c.stats.opened, c.stats.delivered)}</td>
                    <td className="px-4 py-2.5 text-end tabular-nums">{c.stats.clicked.toLocaleString("fr-FR")}</td>
                    <td className="px-4 py-2.5 text-end tabular-nums">{pct(c.stats.clicked, c.stats.delivered)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Tab 4: Livraisons
// =============================================================================

function DeliveriesSection({ campaigns }: { campaigns: Campaign[] }) {
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDeliveries = useCallback(async () => {
    if (!selectedCampaignId) { setDeliveries([]); return; }
    setLoading(true);
    try {
      const d = await fetchCampaignDeliveries(selectedCampaignId, statusFilter || undefined);
      setDeliveries(d);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [selectedCampaignId, statusFilter]);

  useEffect(() => { fetchDeliveries(); }, [fetchDeliveries]);

  const sentCampaigns = campaigns.filter((c) => c.status === "sent" || c.status === "sending");

  const deliveryStatusColor: Record<string, string> = {
    pending: "bg-slate-100 text-slate-600",
    sent: "bg-blue-100 text-blue-700",
    delivered: "bg-emerald-100 text-emerald-700",
    opened: "bg-amber-100 text-amber-700",
    clicked: "bg-indigo-100 text-indigo-700",
    failed: "bg-red-100 text-red-600",
    unsubscribed: "bg-rose-100 text-rose-600",
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={selectedCampaignId}
          onChange={(e) => setSelectedCampaignId(e.target.value)}
          className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 max-w-[280px]"
        >
          <option value="">Sélectionner une campagne</option>
          {sentCampaigns.map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700"
        >
          {DELIVERY_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={fetchDeliveries}
          disabled={!selectedCampaignId}
          className="h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-40"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
        <div className="ms-auto text-xs text-slate-400">{deliveries.length} livraison(s)</div>
      </div>

      {!selectedCampaignId ? (
        <div className="py-8 text-center text-sm text-slate-500">Sélectionnez une campagne pour voir les livraisons</div>
      ) : loading ? (
        <div className="py-8 text-center text-sm text-slate-500">Chargement...</div>
      ) : deliveries.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-500">Aucune livraison</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-start text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Utilisateur</th>
                <th className="px-4 py-3 font-medium">Canal</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Envoyé</th>
                <th className="px-4 py-3 font-medium">Livré</th>
                <th className="px-4 py-3 font-medium">Ouvert</th>
                <th className="px-4 py-3 font-medium">Cliqué</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deliveries.map((d) => (
                <tr key={d.id} className="bg-white">
                  <td className="px-4 py-2.5">
                    <div className="text-xs text-slate-900 font-medium">{d.user_email || d.user_id}</div>
                    {d.user_email && d.user_id && (
                      <div className="text-[10px] text-slate-400 truncate max-w-[180px]">{d.user_id}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">
                    {d.channel === "push" ? "Push" : d.channel === "in_app" ? "In-App" : "Email"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn("inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold", deliveryStatusColor[d.status] ?? "bg-slate-100 text-slate-600")}>
                      {DELIVERY_STATUS_OPTIONS.find((o) => o.value === d.status)?.label ?? d.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{formatDate(d.sent_at)}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{formatDate(d.delivered_at)}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{formatDate(d.opened_at)}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{formatDate(d.clicked_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Main component
// =============================================================================

type TabId = "campaigns" | "form" | "stats" | "deliveries";

export default function AdminPushCampaignsDashboard({ className }: { className?: string }) {
  const [tab, setTab] = useState<TabId>("campaigns");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [viewingCampaign, setViewingCampaign] = useState<Campaign | null>(null);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchCampaigns();
      setCampaigns(list);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  const handleAction = async (action: string, idOrPayload: string) => {
    setActionMsg(null);
    try {
      if (action === "test") {
        await sendTestCampaign(idOrPayload);
        setActionMsg("Notification test envoyée");
      } else if (action === "send") {
        await sendCampaign(idOrPayload);
        setActionMsg("Campagne envoyée");
        loadCampaigns();
      } else if (action === "cancel") {
        await cancelCampaign(idOrPayload);
        setActionMsg("Campagne annulée");
        loadCampaigns();
      } else if (action === "schedule") {
        const [id, date] = idOrPayload.split("|");
        await scheduleCampaign(id, date);
        setActionMsg("Campagne programmée");
        loadCampaigns();
      }
    } catch (e: any) {
      setActionMsg(e.message);
    }
  };

  const handleView = (c: Campaign) => {
    setViewingCampaign(c);
  };

  const handleEdit = (c: Campaign) => {
    setEditingCampaign(c);
    setTab("form");
  };

  const handleFormSaved = () => {
    setEditingCampaign(null);
    setTab("campaigns");
    loadCampaigns();
  };

  const handleNewCampaign = () => {
    setEditingCampaign(null);
    setTab("form");
  };

  const tabs: { id: TabId; label: string; icon: typeof Bell }[] = [
    { id: "campaigns", label: "Campagnes", icon: Bell },
    { id: "form", label: "Créer / Modifier", icon: Edit },
    { id: "stats", label: "Statistiques", icon: BarChart3 },
    { id: "deliveries", label: "Livraisons", icon: Truck },
  ];

  return (
    <div className={cn("space-y-4", className)}>
      {/* Marketing sub-navigation */}
      <AdminVisibilityNav />

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-[#a3001d]" />
          <h2 className="text-lg font-bold text-slate-900">Campagnes Push</h2>
        </div>
        {tab === "campaigns" && (
          <Button
            onClick={handleNewCampaign}
            className="h-8 px-3 bg-[#a3001d] text-white text-xs font-semibold rounded-lg hover:bg-[#8a0018]"
          >
            <Plus className="h-3 w-3 me-1" /> Nouvelle campagne
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "shrink-0 h-8 rounded-full px-3.5 text-xs font-semibold border transition flex items-center gap-1.5",
                tab === t.id
                  ? "bg-[#a3001d] text-white border-[#a3001d]"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
              )}
            >
              <Icon className="h-3 w-3" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* View campaign dialog */}
      {viewingCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setViewingCampaign(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">{viewingCampaign.title}</h3>
              <button type="button" onClick={() => setViewingCampaign(null)} className="text-slate-400 hover:text-slate-600">
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 text-sm text-slate-700">
              <div><span className="font-semibold">Type :</span> {CAMPAIGN_TYPES.find((t) => t.value === viewingCampaign.type)?.label}</div>
              <div><span className="font-semibold">Statut :</span> <span className={cn("inline-block px-2 py-0.5 rounded-full text-xs font-semibold", STATUS_CONFIG[viewingCampaign.status].color)}>{STATUS_CONFIG[viewingCampaign.status].label}</span></div>
              <div><span className="font-semibold">Message :</span> {viewingCampaign.message}</div>
              <div><span className="font-semibold">Canaux :</span> {viewingCampaign.channels.join(", ")}</div>
              <div><span className="font-semibold">Audience :</span> {viewingCampaign.audience_type === "all" ? "Tous" : "Segment"} ({viewingCampaign.audience_count.toLocaleString("fr-FR")})</div>
              <div><span className="font-semibold">Priorité :</span> {viewingCampaign.priority === "high" ? "Haute" : "Normale"}</div>
              {viewingCampaign.image_url && <div><span className="font-semibold">Image :</span> <a href={viewingCampaign.image_url} target="_blank" rel="noreferrer" className="text-blue-600 underline break-all">{viewingCampaign.image_url}</a></div>}
              {viewingCampaign.cta_url && <div><span className="font-semibold">CTA :</span> <a href={viewingCampaign.cta_url} target="_blank" rel="noreferrer" className="text-blue-600 underline break-all">{viewingCampaign.cta_url}</a></div>}
              <div><span className="font-semibold">Programmée :</span> {formatDate(viewingCampaign.scheduled_at)}</div>
              <div><span className="font-semibold">Envoyée :</span> {formatDate(viewingCampaign.sent_at)}</div>
              <div className="pt-2 border-t border-slate-100">
                <span className="font-semibold">Stats :</span>
                <div className="grid grid-cols-2 gap-2 mt-1 text-xs">
                  <div>Envoyés : {viewingCampaign.stats.sent.toLocaleString("fr-FR")}</div>
                  <div>Livrés : {viewingCampaign.stats.delivered.toLocaleString("fr-FR")}</div>
                  <div>Ouverts : {viewingCampaign.stats.opened.toLocaleString("fr-FR")}</div>
                  <div>Cliqués : {viewingCampaign.stats.clicked.toLocaleString("fr-FR")}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab content */}
      {tab === "campaigns" && (
        <CampagnesSection
          campaigns={campaigns}
          loading={loading}
          onRefresh={loadCampaigns}
          onView={handleView}
          onEdit={handleEdit}
          onAction={handleAction}
          actionMsg={actionMsg}
        />
      )}
      {tab === "form" && (
        <CampaignFormSection
          editingCampaign={editingCampaign}
          onSaved={handleFormSaved}
          onCancel={() => { setEditingCampaign(null); setTab("campaigns"); }}
        />
      )}
      {tab === "stats" && <StatsSection campaigns={campaigns} />}
      {tab === "deliveries" && <DeliveriesSection campaigns={campaigns} />}
    </div>
  );
}
