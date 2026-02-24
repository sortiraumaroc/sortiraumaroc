/**
 * AdminWheelDashboard — Admin dashboard for managing Wheel of Fortune events.
 *
 * 4 tabs:
 *  1. Evenements Roue (list, status badges, actions)
 *  2. Creer / Modifier (form: general, eligibility, messages, theme)
 *  3. Lots & Probabilites (prizes management, validation, external codes)
 *  4. Statistiques & Fraude (stats, daily recap, stock bars, export, fraud alerts)
 */

import { useCallback, useEffect, useState } from "react";
import {
  RotateCw, Plus, Play, Pause, StopCircle, Edit, BarChart3,
  Download, CalendarDays, Trophy, AlertTriangle, RefreshCw,
  CheckCircle, XCircle, Trash2, Upload, Eye, Gift, Percent,
  Palette, MessageSquare, Users, Settings, TrendingUp, ShieldAlert,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AdminVisibilityNav } from "@/pages/admin/visibility/AdminVisibilityNav";

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

async function adminFetch<T = any>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...opts, headers: { ...getAdminHeaders(), ...opts?.headers } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// =============================================================================
// Types
// =============================================================================

type WheelEventStatus = "draft" | "active" | "paused" | "ended";
type PrizeType = "physical_gift" | "percentage_discount" | "fixed_discount" | "free_service" | "external_code" | "points" | "retry" | "nothing";

interface WheelEvent {
  id: string;
  name: string;
  description?: string;
  status: WheelEventStatus;
  start_date: string;
  end_date: string;
  spins_per_day: number;
  eligibility: "all" | "segment";
  eligibility_filters?: Record<string, any>;
  welcome_message?: string;
  already_played_message?: string;
  primary_color?: string;
  secondary_color?: string;
  background_image?: string;
  total_spins: number;
  total_wins: number;
  total_losses: number;
  created_at: string;
}

interface WheelPrize {
  id: string;
  wheel_event_id: string;
  name: string;
  type: PrizeType;
  value?: number;
  probability: number;
  total_quantity: number;
  remaining_quantity: number;
  segment_color: string;
  segment_icon?: string;
  gift_validity_days?: number;
  conditions?: string;
  sort_order: number;
  substitute_prize_id?: string;
}

interface DailyRecap {
  date: string;
  total_spins: number;
  total_wins: number;
  total_losses: number;
  prizes_awarded: Array<{ prize_name: string; count: number }>;
}

// =============================================================================
// Helpers
// =============================================================================

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

const STATUS_CONFIG: Record<WheelEventStatus, { label: string; bg: string; text: string }> = {
  draft: { label: "Brouillon", bg: "bg-slate-100", text: "text-slate-600" },
  active: { label: "Actif", bg: "bg-emerald-100", text: "text-emerald-700" },
  paused: { label: "En pause", bg: "bg-amber-100", text: "text-amber-700" },
  ended: { label: "Terminé", bg: "bg-red-100", text: "text-red-700" },
};

const PRIZE_TYPE_LABELS: Record<PrizeType, string> = {
  physical_gift: "Cadeau physique",
  percentage_discount: "Réduction %",
  fixed_discount: "Réduction fixe",
  free_service: "Service gratuit",
  external_code: "Code externe",
  points: "Points",
  retry: "Rejouer",
  nothing: "Perdu",
};

const PRIZE_TYPE_COLORS: Record<PrizeType, string> = {
  physical_gift: "bg-purple-100 text-purple-700",
  percentage_discount: "bg-blue-100 text-blue-700",
  fixed_discount: "bg-cyan-100 text-cyan-700",
  free_service: "bg-emerald-100 text-emerald-700",
  external_code: "bg-orange-100 text-orange-700",
  points: "bg-amber-100 text-amber-700",
  retry: "bg-indigo-100 text-indigo-700",
  nothing: "bg-slate-100 text-slate-600",
};

// =============================================================================
// Tab 1: Events List
// =============================================================================

function EventsListTab({
  events,
  loading,
  onRefresh,
  onEdit,
  onAction,
  onViewStats,
  actionLoading,
}: {
  events: WheelEvent[];
  loading: boolean;
  onRefresh: () => void;
  onEdit: (event: WheelEvent) => void;
  onAction: (eventId: string, action: string) => void;
  onViewStats: (eventId: string) => void;
  actionLoading: boolean;
}) {
  if (loading) {
    return (
      <div className="py-8 text-center">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[#a3001d] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {events.length === 0 ? (
        <div className="py-8 text-center">
          <RotateCw className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">Aucun événement roue créé</p>
        </div>
      ) : (
        events.map((ev) => {
          const sc = STATUS_CONFIG[ev.status];
          return (
            <div key={ev.id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-base font-bold text-slate-900 truncate">{ev.name}</h4>
                    <span className={cn("shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full", sc.bg, sc.text)}>
                      {sc.label}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>{formatDate(ev.start_date)} → {formatDate(ev.end_date)}</span>
                    <span>{ev.spins_per_day} tours/jour</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-600">
                    <span className="font-medium">Spins: {ev.total_spins}</span>
                    <span className="text-emerald-600 font-medium">Gains: {ev.total_wins}</span>
                    <span className="text-red-500 font-medium">Pertes: {ev.total_losses}</span>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  onClick={() => onEdit(ev)}
                  variant="outline"
                  className="h-8 px-3 text-xs font-semibold rounded-lg border-slate-200"
                >
                  <Edit className="h-3 w-3 me-1" /> Modifier
                </Button>
                {ev.status === "draft" && (
                  <Button
                    onClick={() => onAction(ev.id, "activate")}
                    disabled={actionLoading}
                    className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg"
                  >
                    <Play className="h-3 w-3 me-1" /> Activer
                  </Button>
                )}
                {ev.status === "active" && (
                  <Button
                    onClick={() => onAction(ev.id, "pause")}
                    disabled={actionLoading}
                    variant="outline"
                    className="h-8 px-3 border-amber-200 text-amber-600 text-xs font-semibold rounded-lg"
                  >
                    <Pause className="h-3 w-3 me-1" /> Mettre en pause
                  </Button>
                )}
                {ev.status === "paused" && (
                  <Button
                    onClick={() => onAction(ev.id, "activate")}
                    disabled={actionLoading}
                    className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg"
                  >
                    <Play className="h-3 w-3 me-1" /> Reprendre
                  </Button>
                )}
                {(ev.status === "active" || ev.status === "paused") && (
                  <Button
                    onClick={() => onAction(ev.id, "end")}
                    disabled={actionLoading}
                    variant="outline"
                    className="h-8 px-3 border-red-200 text-red-600 text-xs font-semibold rounded-lg"
                  >
                    <StopCircle className="h-3 w-3 me-1" /> Terminer
                  </Button>
                )}
                <Button
                  onClick={() => onViewStats(ev.id)}
                  variant="outline"
                  className="h-8 px-3 text-xs font-semibold rounded-lg border-slate-200"
                >
                  <BarChart3 className="h-3 w-3 me-1" /> Stats
                </Button>
                <Button
                  onClick={() => onAction(ev.id, "daily-recap")}
                  disabled={actionLoading}
                  variant="outline"
                  className="h-8 px-3 text-xs font-semibold rounded-lg border-slate-200"
                >
                  <CalendarDays className="h-3 w-3 me-1" /> Récap du jour
                </Button>
                <Button
                  onClick={() => onAction(ev.id, "export")}
                  disabled={actionLoading}
                  variant="outline"
                  className="h-8 px-3 text-xs font-semibold rounded-lg border-slate-200"
                >
                  <Download className="h-3 w-3 me-1" /> Exporter
                </Button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// =============================================================================
// Tab 2: Create / Edit Form
// =============================================================================

interface EventFormData {
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  spins_per_day: number;
  eligibility: "all" | "segment";
  eligibility_filters: string;
  welcome_message: string;
  already_played_message: string;
  primary_color: string;
  secondary_color: string;
  background_image: string;
}

const EMPTY_FORM: EventFormData = {
  name: "", description: "", start_date: "", end_date: "", spins_per_day: 1,
  eligibility: "all", eligibility_filters: "", welcome_message: "",
  already_played_message: "", primary_color: "#a3001d", secondary_color: "#fbbf24",
  background_image: "",
};

function EventFormTab({
  editingEvent,
  onSave,
  saving,
  msg,
}: {
  editingEvent: WheelEvent | null;
  onSave: (data: EventFormData, asDraft: boolean, eventId?: string) => void;
  saving: boolean;
  msg: { type: "success" | "error"; text: string } | null;
}) {
  const [form, setForm] = useState<EventFormData>(EMPTY_FORM);

  useEffect(() => {
    if (editingEvent) {
      setForm({
        name: editingEvent.name,
        description: editingEvent.description ?? "",
        start_date: editingEvent.start_date?.slice(0, 10) ?? "",
        end_date: editingEvent.end_date?.slice(0, 10) ?? "",
        spins_per_day: editingEvent.spins_per_day,
        eligibility: editingEvent.eligibility,
        eligibility_filters: editingEvent.eligibility_filters ? JSON.stringify(editingEvent.eligibility_filters, null, 2) : "",
        welcome_message: editingEvent.welcome_message ?? "",
        already_played_message: editingEvent.already_played_message ?? "",
        primary_color: editingEvent.primary_color ?? "#a3001d",
        secondary_color: editingEvent.secondary_color ?? "#fbbf24",
        background_image: editingEvent.background_image ?? "",
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [editingEvent]);

  const set = (key: keyof EventFormData, val: any) => setForm((f) => ({ ...f, [key]: val }));

  const inputCls = "w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30 bg-white";
  const labelCls = "block text-xs font-semibold text-slate-700 mb-1";

  return (
    <div className="space-y-5">
      {msg && (
        <div className={cn(
          "text-sm px-4 py-2.5 rounded-xl flex items-center gap-2",
          msg.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600",
        )}>
          {msg.type === "success" ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {msg.text}
        </div>
      )}

      {/* General */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Settings className="h-4 w-4 text-[#a3001d]" /> Général
        </h4>
        <div>
          <label className={labelCls}>Nom de l'événement</label>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} className={inputCls} placeholder="Ex: Roue de la Saint-Valentin" />
        </div>
        <div>
          <label className={labelCls}>Description</label>
          <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} className={inputCls} placeholder="Description courte..." />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Date début</label>
            <input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Date fin</label>
            <input type="date" value={form.end_date} onChange={(e) => set("end_date", e.target.value)} className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Nombre de tours par jour</label>
          <input type="number" min={1} max={10} value={form.spins_per_day} onChange={(e) => set("spins_per_day", parseInt(e.target.value) || 1)} className={cn(inputCls, "w-32")} />
        </div>
      </div>

      {/* Eligibility */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Users className="h-4 w-4 text-[#a3001d]" /> Éligibilité
        </h4>
        <div>
          <label className={labelCls}>Éligibilité</label>
          <select value={form.eligibility} onChange={(e) => set("eligibility", e.target.value)} className={inputCls}>
            <option value="all">Tous les utilisateurs</option>
            <option value="segment">Segment spécifique</option>
          </select>
        </div>
        {form.eligibility === "segment" && (
          <div>
            <label className={labelCls}>Filtres d'éligibilité (JSON)</label>
            <textarea value={form.eligibility_filters} onChange={(e) => set("eligibility_filters", e.target.value)} rows={3} className={cn(inputCls, "font-mono text-xs")} placeholder='{"min_reservations": 5, "city": "Casablanca"}' />
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-[#a3001d]" /> Messages
        </h4>
        <div>
          <label className={labelCls}>Message de bienvenue</label>
          <textarea value={form.welcome_message} onChange={(e) => set("welcome_message", e.target.value)} rows={2} className={inputCls} placeholder="Tentez votre chance !" />
        </div>
        <div>
          <label className={labelCls}>Message "déjà joué"</label>
          <textarea value={form.already_played_message} onChange={(e) => set("already_played_message", e.target.value)} rows={2} className={inputCls} placeholder="Vous avez déjà utilisé tous vos tours aujourd'hui..." />
        </div>
      </div>

      {/* Theme */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Palette className="h-4 w-4 text-[#a3001d]" /> Thème visuel
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Couleur primaire</label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.primary_color} onChange={(e) => set("primary_color", e.target.value)} className="w-8 h-8 rounded border border-slate-200 cursor-pointer" />
              <input value={form.primary_color} onChange={(e) => set("primary_color", e.target.value)} className={cn(inputCls, "flex-1")} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Couleur secondaire</label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.secondary_color} onChange={(e) => set("secondary_color", e.target.value)} className="w-8 h-8 rounded border border-slate-200 cursor-pointer" />
              <input value={form.secondary_color} onChange={(e) => set("secondary_color", e.target.value)} className={cn(inputCls, "flex-1")} />
            </div>
          </div>
        </div>
        <div>
          <label className={labelCls}>URL image de fond</label>
          <input value={form.background_image} onChange={(e) => set("background_image", e.target.value)} className={inputCls} placeholder="https://..." />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          onClick={() => onSave(form, true, editingEvent?.id)}
          disabled={saving || !form.name.trim()}
          variant="outline"
          className="h-10 px-5 text-sm font-semibold rounded-lg border-slate-300"
        >
          Enregistrer brouillon
        </Button>
        <Button
          onClick={() => onSave(form, false, editingEvent?.id)}
          disabled={saving || !form.name.trim() || !form.start_date || !form.end_date}
          className="h-10 px-5 bg-[#a3001d] hover:bg-[#8a0018] text-white text-sm font-semibold rounded-lg"
        >
          {editingEvent ? "Mettre à jour et activer" : "Créer et activer"}
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Tab 3: Prizes & Probabilities
// =============================================================================

interface PrizeFormData {
  name: string;
  type: PrizeType;
  value: string;
  total_quantity: string;
  probability: string;
  segment_color: string;
  segment_icon: string;
  gift_validity_days: string;
  conditions: string;
  sort_order: string;
  substitute_prize_id: string;
}

const EMPTY_PRIZE: PrizeFormData = {
  name: "", type: "nothing", value: "", total_quantity: "",
  probability: "", segment_color: "#a3001d", segment_icon: "",
  gift_validity_days: "", conditions: "", sort_order: "0", substitute_prize_id: "",
};

function PrizesTab({
  selectedEventId,
  events,
}: {
  selectedEventId: string | null;
  events: WheelEvent[];
}) {
  const [prizes, setPrizes] = useState<WheelPrize[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<PrizeFormData>(EMPTY_PRIZE);
  const [editingPrizeId, setEditingPrizeId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [validationMsg, setValidationMsg] = useState<string | null>(null);
  const [externalCodes, setExternalCodes] = useState("");
  const [showCodesUpload, setShowCodesUpload] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchPrizes = useCallback(async () => {
    if (!selectedEventId) return;
    setLoading(true);
    try {
      const res = await adminFetch<{ prizes: WheelPrize[] }>(`/api/admin/wheel/${selectedEventId}/prizes`);
      setPrizes(res.prizes);
    } catch { /* silent */ }
    setLoading(false);
  }, [selectedEventId]);

  useEffect(() => { fetchPrizes(); }, [fetchPrizes]);

  const set = (key: keyof PrizeFormData, val: any) => setForm((f) => ({ ...f, [key]: val }));

  const totalProbability = prizes.reduce((sum, p) => sum + p.probability, 0);

  const handleValidate = async () => {
    if (!selectedEventId) return;
    try {
      const res = await adminFetch<{ valid: boolean; total: number }>(`/api/admin/wheel/${selectedEventId}/prizes/validate`);
      setValidationMsg(res.valid ? "Les probabilités sont valides (total = 100%)" : `Total actuel: ${res.total.toFixed(1)}% — doit être 100%`);
    } catch (e: any) {
      setValidationMsg(e.message);
    }
  };

  const handleSavePrize = async () => {
    if (!selectedEventId) return;
    setSaving(true);
    setMsg(null);
    try {
      const payload = {
        name: form.name,
        type: form.type,
        value: form.value ? parseFloat(form.value) : undefined,
        total_quantity: parseInt(form.total_quantity) || 0,
        probability: parseFloat(form.probability) || 0,
        segment_color: form.segment_color,
        segment_icon: form.segment_icon || undefined,
        gift_validity_days: form.gift_validity_days ? parseInt(form.gift_validity_days) : undefined,
        conditions: form.conditions || undefined,
        sort_order: parseInt(form.sort_order) || 0,
        substitute_prize_id: form.substitute_prize_id || undefined,
      };
      if (editingPrizeId) {
        await adminFetch(`/api/admin/wheel/${selectedEventId}/prizes/${editingPrizeId}`, { method: "PUT", body: JSON.stringify(payload) });
        setMsg({ type: "success", text: "Lot mis à jour" });
      } else {
        await adminFetch(`/api/admin/wheel/${selectedEventId}/prizes`, { method: "POST", body: JSON.stringify(payload) });
        setMsg({ type: "success", text: "Lot ajouté" });
      }
      setForm(EMPTY_PRIZE);
      setEditingPrizeId(null);
      setShowForm(false);
      fetchPrizes();
    } catch (e: any) {
      setMsg({ type: "error", text: e.message });
    }
    setSaving(false);
  };

  const handleDeletePrize = async (prizeId: string) => {
    if (!selectedEventId) return;
    try {
      await adminFetch(`/api/admin/wheel/${selectedEventId}/prizes/${prizeId}`, { method: "DELETE" });
      fetchPrizes();
    } catch { /* silent */ }
  };

  const handleUploadCodes = async (prizeId: string) => {
    if (!selectedEventId || !externalCodes.trim()) return;
    try {
      const codes = externalCodes.split(/[\n,]+/).map((c) => c.trim()).filter(Boolean);
      await adminFetch(`/api/admin/wheel/${selectedEventId}/prizes/${prizeId}/codes`, { method: "POST", body: JSON.stringify({ codes }) });
      setMsg({ type: "success", text: `${codes.length} codes importés` });
      setShowCodesUpload(null);
      setExternalCodes("");
    } catch (e: any) {
      setMsg({ type: "error", text: e.message });
    }
  };

  const startEdit = (prize: WheelPrize) => {
    setForm({
      name: prize.name,
      type: prize.type,
      value: prize.value?.toString() ?? "",
      total_quantity: prize.total_quantity.toString(),
      probability: prize.probability.toString(),
      segment_color: prize.segment_color,
      segment_icon: prize.segment_icon ?? "",
      gift_validity_days: prize.gift_validity_days?.toString() ?? "",
      conditions: prize.conditions ?? "",
      sort_order: prize.sort_order.toString(),
      substitute_prize_id: prize.substitute_prize_id ?? "",
    });
    setEditingPrizeId(prize.id);
    setShowForm(true);
  };

  if (!selectedEventId) {
    return (
      <div className="py-8 text-center">
        <Trophy className="mx-auto h-10 w-10 text-slate-300" />
        <p className="mt-2 text-sm text-slate-500">Sélectionnez d'abord un événement dans l'onglet "Événements Roue"</p>
      </div>
    );
  }

  const inputCls = "w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30 bg-white";
  const labelCls = "block text-xs font-semibold text-slate-700 mb-1";

  return (
    <div className="space-y-4">
      {msg && (
        <div className={cn(
          "text-sm px-4 py-2.5 rounded-xl flex items-center gap-2",
          msg.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600",
        )}>
          {msg.type === "success" ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {msg.text}
        </div>
      )}

      {/* Header + validation */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-slate-600">
          Total probabilité: <span className={cn("font-bold", Math.abs(totalProbability - 100) < 0.01 ? "text-emerald-600" : "text-red-600")}>{totalProbability.toFixed(1)}%</span>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleValidate} variant="outline" className="h-8 px-3 text-xs font-semibold rounded-lg border-slate-200">
            <CheckCircle className="h-3 w-3 me-1" /> Valider probabilités
          </Button>
          <Button onClick={() => { setForm(EMPTY_PRIZE); setEditingPrizeId(null); setShowForm(true); }} className="h-8 px-3 bg-[#a3001d] text-white text-xs font-semibold rounded-lg">
            <Plus className="h-3 w-3 me-1" /> Ajouter un lot
          </Button>
        </div>
      </div>

      {validationMsg && (
        <div className={cn(
          "text-sm px-4 py-2 rounded-xl",
          validationMsg.includes("valides") ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700",
        )}>
          {validationMsg}
        </div>
      )}

      {/* Prizes list */}
      {loading ? (
        <div className="py-6 text-center"><div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-[#a3001d] border-t-transparent" /></div>
      ) : prizes.length === 0 ? (
        <div className="py-6 text-center text-sm text-slate-500">Aucun lot configuré</div>
      ) : (
        <div className="space-y-2">
          {prizes.sort((a, b) => a.sort_order - b.sort_order).map((prize) => (
            <div key={prize.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-5 h-5 rounded-full shrink-0" style={{ backgroundColor: prize.segment_color }} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-900">{prize.name}</span>
                      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", PRIZE_TYPE_COLORS[prize.type])}>
                        {PRIZE_TYPE_LABELS[prize.type]}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 mt-0.5">
                      {prize.value != null && <span>Valeur: {prize.value}</span>}
                      <span>Probabilité: {prize.probability}%</span>
                      <span>Stock: {prize.remaining_quantity}/{prize.total_quantity}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => startEdit(prize)} className="h-7 w-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50">
                    <Edit className="h-3 w-3" />
                  </button>
                  {prize.type === "external_code" && (
                    <button onClick={() => setShowCodesUpload(showCodesUpload === prize.id ? null : prize.id)} className="h-7 w-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50">
                      <Upload className="h-3 w-3" />
                    </button>
                  )}
                  <button onClick={() => handleDeletePrize(prize.id)} className="h-7 w-7 rounded-lg border border-red-200 flex items-center justify-center text-red-500 hover:bg-red-50">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* External codes upload */}
              {showCodesUpload === prize.id && (
                <div className="mt-3 p-3 rounded-xl bg-orange-50 border border-orange-200 space-y-2">
                  <label className={labelCls}>Codes externes (un par ligne ou séparés par virgule)</label>
                  <textarea
                    value={externalCodes}
                    onChange={(e) => setExternalCodes(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 rounded-lg border border-orange-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-orange-300"
                    placeholder="CODE1&#10;CODE2&#10;CODE3"
                  />
                  <Button
                    onClick={() => handleUploadCodes(prize.id)}
                    disabled={!externalCodes.trim()}
                    className="h-8 px-4 bg-orange-600 text-white text-xs font-semibold rounded-lg"
                  >
                    <Upload className="h-3 w-3 me-1" /> Importer les codes
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit prize form */}
      {showForm && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Gift className="h-4 w-4 text-[#a3001d]" /> {editingPrizeId ? "Modifier le lot" : "Nouveau lot"}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Nom du lot</label>
              <input value={form.name} onChange={(e) => set("name", e.target.value)} className={inputCls} placeholder="Ex: -20% sur votre prochaine résa" />
            </div>
            <div>
              <label className={labelCls}>Type</label>
              <select value={form.type} onChange={(e) => set("type", e.target.value)} className={inputCls}>
                {Object.entries(PRIZE_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Valeur</label>
              <input type="number" value={form.value} onChange={(e) => set("value", e.target.value)} className={inputCls} placeholder="Ex: 20" />
            </div>
            <div>
              <label className={labelCls}>Quantité totale</label>
              <input type="number" min={0} value={form.total_quantity} onChange={(e) => set("total_quantity", e.target.value)} className={inputCls} placeholder="Ex: 100" />
            </div>
            <div>
              <label className={labelCls}>Probabilité (%)</label>
              <input type="number" min={0} max={100} step={0.1} value={form.probability} onChange={(e) => set("probability", e.target.value)} className={inputCls} placeholder="Ex: 15.5" />
            </div>
            <div>
              <label className={labelCls}>Couleur du segment</label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.segment_color} onChange={(e) => set("segment_color", e.target.value)} className="w-8 h-8 rounded border border-slate-200 cursor-pointer" />
                <input value={form.segment_color} onChange={(e) => set("segment_color", e.target.value)} className={cn(inputCls, "flex-1")} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Icône du segment</label>
              <input value={form.segment_icon} onChange={(e) => set("segment_icon", e.target.value)} className={inputCls} placeholder="Ex: gift, star, percent..." />
            </div>
            <div>
              <label className={labelCls}>Validité du gain (jours)</label>
              <input type="number" min={1} value={form.gift_validity_days} onChange={(e) => set("gift_validity_days", e.target.value)} className={inputCls} placeholder="Ex: 30" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Conditions</label>
              <textarea value={form.conditions} onChange={(e) => set("conditions", e.target.value)} rows={2} className={inputCls} placeholder="Conditions d'utilisation du lot..." />
            </div>
            <div>
              <label className={labelCls}>Ordre d'affichage</label>
              <input type="number" min={0} value={form.sort_order} onChange={(e) => set("sort_order", e.target.value)} className={cn(inputCls, "w-24")} />
            </div>
            <div>
              <label className={labelCls}>Lot de substitution (ID)</label>
              <input value={form.substitute_prize_id} onChange={(e) => set("substitute_prize_id", e.target.value)} className={inputCls} placeholder="UUID du lot de substitution" />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button onClick={handleSavePrize} disabled={saving || !form.name.trim()} className="h-9 px-4 bg-[#a3001d] text-white text-sm font-semibold rounded-lg">
              {editingPrizeId ? "Mettre à jour" : "Ajouter"}
            </Button>
            <Button onClick={() => { setShowForm(false); setEditingPrizeId(null); setForm(EMPTY_PRIZE); }} variant="outline" className="h-9 px-4 text-sm font-semibold rounded-lg border-slate-200">
              Annuler
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Tab 4: Statistics & Fraud
// =============================================================================

function StatsTab({ selectedEventId }: { selectedEventId: string | null }) {
  const [stats, setStats] = useState<any>(null);
  const [recap, setRecap] = useState<DailyRecap | null>(null);
  const [prizes, setPrizes] = useState<WheelPrize[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const fetchStats = useCallback(async () => {
    if (!selectedEventId) return;
    setLoading(true);
    try {
      const [statsRes, prizesRes] = await Promise.all([
        adminFetch(`/api/admin/wheel/${selectedEventId}/stats`),
        adminFetch<{ prizes: WheelPrize[] }>(`/api/admin/wheel/${selectedEventId}/prizes`),
      ]);
      setStats(statsRes);
      setPrizes(prizesRes.prizes);
    } catch { /* silent */ }
    setLoading(false);
  }, [selectedEventId]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const fetchDailyRecap = async () => {
    if (!selectedEventId) return;
    try {
      const res = await adminFetch<DailyRecap>(`/api/admin/wheel/${selectedEventId}/daily-recap`);
      setRecap(res);
    } catch { /* silent */ }
  };

  const handleExport = async () => {
    if (!selectedEventId) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/admin/wheel/${selectedEventId}/export`, { headers: getAdminHeaders() });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wheel-spins-${selectedEventId.slice(0, 8)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* silent */ }
    setExporting(false);
  };

  if (!selectedEventId) {
    return (
      <div className="py-8 text-center">
        <BarChart3 className="mx-auto h-10 w-10 text-slate-300" />
        <p className="mt-2 text-sm text-slate-500">Sélectionnez un événement pour voir les statistiques</p>
      </div>
    );
  }

  if (loading) {
    return <div className="py-8 text-center"><div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[#a3001d] border-t-transparent" /></div>;
  }

  const winRate = stats?.total_spins > 0 ? ((stats.total_wins / stats.total_spins) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-4">
      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Total spins", value: stats.total_spins, color: "text-blue-600", icon: RotateCw },
            { label: "Gains", value: stats.total_wins, color: "text-emerald-600", icon: Trophy },
            { label: "Pertes", value: stats.total_losses, color: "text-red-500", icon: XCircle },
            { label: "Taux de gain", value: `${winRate}%`, color: "text-amber-600", icon: TrendingUp },
            { label: "Lots restants", value: stats.prizes_remaining ?? "—", color: "text-purple-600", icon: Gift },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <kpi.icon className="h-3.5 w-3.5" />
                <span className="text-[10px] font-medium">{kpi.label}</span>
              </div>
              <p className={cn("text-xl font-bold", kpi.color)}>{kpi.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Daily recap */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-[#a3001d]" /> Récap du jour
          </h4>
          <Button onClick={fetchDailyRecap} variant="outline" className="h-8 px-3 text-xs font-semibold rounded-lg border-slate-200">
            <Eye className="h-3 w-3 me-1" /> Charger
          </Button>
        </div>
        {recap ? (
          <div className="space-y-2 text-sm">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div><div className="text-xs text-slate-500">Spins</div><div className="font-bold">{recap.total_spins}</div></div>
              <div><div className="text-xs text-slate-500">Gains</div><div className="font-bold text-emerald-600">{recap.total_wins}</div></div>
              <div><div className="text-xs text-slate-500">Pertes</div><div className="font-bold text-red-500">{recap.total_losses}</div></div>
            </div>
            {recap.prizes_awarded && recap.prizes_awarded.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <span className="text-xs font-semibold text-slate-700">Lots attribués :</span>
                <ul className="mt-1 space-y-0.5">
                  {recap.prizes_awarded.map((pa, i) => (
                    <li key={i} className="text-xs text-slate-600 flex items-center justify-between">
                      <span>{pa.prize_name}</span>
                      <span className="font-bold">{pa.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-500">Cliquez sur "Charger" pour afficher le récap du jour</p>
        )}
      </div>

      {/* Prize stock bars */}
      {prizes.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Gift className="h-4 w-4 text-[#a3001d]" /> Stock des lots
          </h4>
          <div className="space-y-2">
            {prizes.map((prize) => {
              const pct = prize.total_quantity > 0 ? (prize.remaining_quantity / prize.total_quantity) * 100 : 0;
              return (
                <div key={prize.id}>
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className="text-slate-700 font-medium truncate">{prize.name}</span>
                    <span className="text-slate-500 shrink-0 ms-2">{prize.remaining_quantity}/{prize.total_quantity}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        pct > 50 ? "bg-emerald-500" : pct > 20 ? "bg-amber-400" : "bg-red-500",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Export */}
      <Button
        onClick={handleExport}
        disabled={exporting}
        variant="outline"
        className="h-9 px-4 text-sm font-semibold rounded-lg border-slate-200"
      >
        <Download className="h-3.5 w-3.5 me-1" /> {exporting ? "Export en cours..." : "Exporter les spins (CSV)"}
      </Button>

      {/* Fraud alerts placeholder */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-red-500" /> Alertes fraude
        </h4>
        <p className="text-xs text-slate-500">
          Le système de détection de fraude analysera les patterns suspects (multi-comptes, timing anormal, IP suspectes).
          Les alertes seront affichées ici.
        </p>
        <div className="py-4 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-slate-200" />
          <p className="mt-1 text-xs text-slate-400">Aucune alerte pour le moment</p>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Dashboard
// =============================================================================

type WheelTab = "events" | "form" | "prizes" | "stats";

export default function AdminWheelDashboard({ className }: { className?: string }) {
  const [tab, setTab] = useState<WheelTab>("events");
  const [events, setEvents] = useState<WheelEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [editingEvent, setEditingEvent] = useState<WheelEvent | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [formMsg, setFormMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [savingForm, setSavingForm] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch<{ events: WheelEvent[] }>("/api/admin/wheel/events");
      setEvents(res.events);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const handleEventAction = useCallback(async (eventId: string, action: string) => {
    setActionLoading(true);
    setMsg(null);
    try {
      switch (action) {
        case "activate":
          await adminFetch(`/api/admin/wheel/events/${eventId}/activate`, { method: "POST" });
          setMsg({ type: "success", text: "Événement activé" });
          break;
        case "pause":
          await adminFetch(`/api/admin/wheel/events/${eventId}/pause`, { method: "POST" });
          setMsg({ type: "success", text: "Événement mis en pause" });
          break;
        case "end":
          await adminFetch(`/api/admin/wheel/events/${eventId}/end`, { method: "POST" });
          setMsg({ type: "success", text: "Événement terminé" });
          break;
        case "daily-recap":
          setSelectedEventId(eventId);
          setTab("stats");
          break;
        case "export": {
          const res = await fetch(`/api/admin/wheel/events/${eventId}/export`, { headers: getAdminHeaders() });
          if (!res.ok) throw new Error("Export failed");
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `wheel-export-${eventId.slice(0, 8)}.csv`;
          a.click();
          URL.revokeObjectURL(url);
          break;
        }
      }
      fetchEvents();
    } catch (e: any) {
      setMsg({ type: "error", text: e.message ?? "Erreur" });
    }
    setActionLoading(false);
  }, [fetchEvents]);

  const handleEdit = useCallback((event: WheelEvent) => {
    setEditingEvent(event);
    setSelectedEventId(event.id);
    setTab("form");
  }, []);

  const handleViewStats = useCallback((eventId: string) => {
    setSelectedEventId(eventId);
    setTab("stats");
  }, []);

  const handleSaveEvent = useCallback(async (data: EventFormData, asDraft: boolean, eventId?: string) => {
    setSavingForm(true);
    setFormMsg(null);
    try {
      const payload = {
        name: data.name,
        description: data.description || undefined,
        start_date: data.start_date,
        end_date: data.end_date,
        spins_per_day: data.spins_per_day,
        eligibility: data.eligibility,
        eligibility_filters: data.eligibility_filters ? JSON.parse(data.eligibility_filters) : undefined,
        welcome_message: data.welcome_message || undefined,
        already_played_message: data.already_played_message || undefined,
        primary_color: data.primary_color || undefined,
        secondary_color: data.secondary_color || undefined,
        background_image: data.background_image || undefined,
        status: asDraft ? "draft" : "active",
      };
      if (eventId) {
        await adminFetch(`/api/admin/wheel/events/${eventId}`, { method: "PUT", body: JSON.stringify(payload) });
        setFormMsg({ type: "success", text: "Événement mis à jour" });
      } else {
        const res = await adminFetch<{ event: WheelEvent }>("/api/admin/wheel/events", { method: "POST", body: JSON.stringify(payload) });
        setSelectedEventId(res.event.id);
        setFormMsg({ type: "success", text: asDraft ? "Brouillon enregistré" : "Événement créé et activé" });
      }
      fetchEvents();
    } catch (e: any) {
      setFormMsg({ type: "error", text: e.message ?? "Erreur" });
    }
    setSavingForm(false);
  }, [fetchEvents]);

  const tabs: Array<{ id: WheelTab; label: string; icon: typeof RotateCw }> = [
    { id: "events", label: "Événements Roue", icon: RotateCw },
    { id: "form", label: "Créer / Modifier", icon: Edit },
    { id: "prizes", label: "Lots & Probabilités", icon: Trophy },
    { id: "stats", label: "Statistiques & Fraude", icon: BarChart3 },
  ];

  return (
    <div className={cn("space-y-4", className)}>
      {/* Marketing sub-navigation */}
      <AdminVisibilityNav />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RotateCw className="h-5 w-5 text-[#a3001d]" />
          <h2 className="text-lg font-bold text-slate-900">Roue de la Fortune</h2>
        </div>
        <button onClick={fetchEvents} disabled={loading} className="text-sm text-slate-500 hover:text-slate-700">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
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

      {/* Feedback message */}
      {msg && (
        <div className={cn(
          "text-sm px-4 py-2.5 rounded-xl flex items-center gap-2",
          msg.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600",
        )}>
          {msg.type === "success" ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {msg.text}
        </div>
      )}

      {/* New event button (in events tab) */}
      {tab === "events" && (
        <div className="flex justify-end">
          <Button
            onClick={() => { setEditingEvent(null); setTab("form"); }}
            className="h-9 px-4 bg-[#a3001d] hover:bg-[#8a0018] text-white text-sm font-semibold rounded-lg"
          >
            <Plus className="h-3.5 w-3.5 me-1" /> Nouvel événement
          </Button>
        </div>
      )}

      {/* Content */}
      {tab === "events" && (
        <EventsListTab
          events={events}
          loading={loading}
          onRefresh={fetchEvents}
          onEdit={handleEdit}
          onAction={handleEventAction}
          onViewStats={handleViewStats}
          actionLoading={actionLoading}
        />
      )}
      {tab === "form" && (
        <EventFormTab
          editingEvent={editingEvent}
          onSave={handleSaveEvent}
          saving={savingForm}
          msg={formMsg}
        />
      )}
      {tab === "prizes" && (
        <PrizesTab
          selectedEventId={selectedEventId}
          events={events}
        />
      )}
      {tab === "stats" && (
        <StatsTab selectedEventId={selectedEventId} />
      )}
    </div>
  );
}
