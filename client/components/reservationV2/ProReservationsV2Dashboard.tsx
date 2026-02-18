/**
 * 4.4 — Dashboard Pro — Section Réservations
 *
 * Tabs:
 *  - Réservations (list + filters + contextual actions)
 *  - Calendrier (monthly calendar view)
 *  - Capacité (3-zone quota configuration)
 *  - Remises (discounts CRUD)
 *  - Auto-accept (rules management)
 *  - Devis (quote requests)
 *  - Stats (occupancy, no-show, conversion rates)
 */

import * as React from "react";
import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import { format, startOfMonth, addMonths } from "date-fns";
import {
  CalendarDays, Filter, CheckCircle2, XCircle, Clock, Pause,
  QrCode, Eye, UserX, Loader2, BarChart3, Settings2,
  Tag, Zap, MessageSquare, ChevronLeft, ChevronRight,
  Users, Shield, TrendingUp, AlertTriangle, Plus, Trash2, Edit2, Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { scoreToStars } from "@/lib/reservationV2Api";
import {
  proListReservationsV2,
  proGetCalendarV2,
  proAcceptReservation,
  proRefuseReservation,
  proHoldReservation,
  proConfirmAttendance,
  proDeclareNoShow,
  proCancelReservation,
  proGetCapacity,
  proUpdateCapacity,
  proGetDiscounts,
  proCreateDiscount,
  proDeleteDiscount,
  proGetAutoAcceptRules,
  proUpsertAutoAcceptRules,
  proListQuotes,
  proAcknowledgeQuote,
  proSendQuoteOffer,
  proGetReservationStats,
  proGetOccupancyRealtime,
  type ProReservationRow,
  type ProReservationStats,
} from "@/lib/reservationV2ProApi";
import { DEFAULT_QUOTA } from "../../../shared/reservationTypesV2";
import type { EstablishmentCapacityRow, EstablishmentSlotDiscountRow, ProAutoAcceptRuleRow, QuoteRequestRow } from "../../../shared/reservationTypesV2";

const ProSlotsTab = lazy(() =>
  import("@/components/pro/tabs/ProSlotsTab").then((m) => ({
    default: m.ProSlotsTab,
  }))
);

// =============================================================================
// Props
// =============================================================================

export interface ProReservationsV2DashboardProps {
  establishmentId: string;
  establishment?: any;
  role?: string;
  className?: string;
}

// =============================================================================
// Status config (pro view)
// =============================================================================

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  requested: { label: "Demandée", color: "bg-blue-100 text-blue-700" },
  pending_pro_validation: { label: "À traiter", color: "bg-yellow-100 text-yellow-700" },
  confirmed: { label: "Confirmée", color: "bg-green-100 text-green-700" },
  waitlist: { label: "Liste d'attente", color: "bg-purple-100 text-purple-700" },
  on_hold: { label: "En attente", color: "bg-orange-100 text-orange-700" },
  consumed: { label: "Honorée", color: "bg-emerald-100 text-emerald-700" },
  consumed_default: { label: "Validée auto", color: "bg-emerald-100 text-emerald-600" },
  noshow: { label: "No-show", color: "bg-red-100 text-red-700" },
  cancelled_user: { label: "Annulée client", color: "bg-gray-100 text-gray-600" },
  cancelled_pro: { label: "Refusée", color: "bg-gray-100 text-gray-600" },
  refused: { label: "Refusée", color: "bg-gray-100 text-gray-600" },
  expired: { label: "Expirée", color: "bg-gray-100 text-gray-500" },
};

function getStatusLabel(s: string) {
  return STATUS_LABELS[s] ?? { label: s, color: "bg-gray-100 text-gray-600" };
}

// =============================================================================
// Reservation list + actions tab
// =============================================================================

function ReservationsListTab({ estId, statusFilter, setStatusFilter }: { estId: string; statusFilter: string; setStatusFilter: (v: string) => void }) {
  const [reservations, setReservations] = useState<ProReservationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionDialog, setActionDialog] = useState<{ type: string; reservation: ProReservationRow } | null>(null);
  const [customMessage, setCustomMessage] = useState("");

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const opts: any = {};
      if (statusFilter !== "all") opts.status = statusFilter;
      const res = await proListReservationsV2(estId, opts);
      setReservations(res.reservations ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [estId, statusFilter]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const handleAction = async (action: string, resId: string) => {
    setActionLoading(resId);
    try {
      switch (action) {
        case "accept": await proAcceptReservation(resId, estId, customMessage || undefined); break;
        case "refuse": await proRefuseReservation(resId, estId, customMessage || undefined); break;
        case "hold": await proHoldReservation(resId, estId); break;
        case "confirm_attendance": await proConfirmAttendance(resId, estId); break;
        case "declare_no_show": await proDeclareNoShow(resId, estId); break;
        case "cancel": await proCancelReservation(resId, estId, customMessage || undefined); break;
      }
      setActionDialog(null);
      setCustomMessage("");
      await fetchList();
    } catch { /* show error */ }
    setActionLoading(null);
  };

  const pendingStatuses = new Set(["requested", "pending_pro_validation"]);
  const activeStatuses = new Set(["confirmed", "deposit_paid"]);

  return (
    <div className="space-y-4">
      {loading && !reservations.length ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : reservations.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <CalendarDays className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Aucune réservation trouvée</p>
        </div>
      ) : (
        <div className="space-y-2">
          {reservations.map((r) => {
            const sl = getStatusLabel(r.status);
            const clientName = r.consumer_users?.full_name ?? "Client";
            const clientScore = r.consumer_user_stats?.score_v2;
            const isPending = pendingStatuses.has(r.status);
            const isActive = activeStatuses.has(r.status);

            return (
              <div key={r.id} className="bg-card border rounded-lg p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{clientName}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.starts_at ? format(new Date(r.starts_at), "EEE d MMM, HH:mm") : "—"}
                      {" · "}{r.party_size} pers.
                      {r.payment_type === "paid" && " · Payante"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {typeof clientScore === "number" && (
                      <Badge variant="outline" className="text-[10px] gap-0.5">
                        <Shield className="h-3 w-3" />
                        {scoreToStars(clientScore).toFixed(1)}
                      </Badge>
                    )}
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", sl.color)}>
                      {sl.label}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-1.5">
                  {isPending && (
                    <>
                      <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => setActionDialog({ type: "accept", reservation: r })}>
                        <CheckCircle2 className="h-3 w-3 me-1" /> Accepter
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setActionDialog({ type: "refuse", reservation: r })}>
                        <XCircle className="h-3 w-3 me-1" /> Refuser
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleAction("hold", r.id)}>
                        <Pause className="h-3 w-3 me-1" /> Mettre en attente
                      </Button>
                    </>
                  )}
                  {isActive && (
                    <>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleAction("confirm_attendance", r.id)}>
                        <CheckCircle2 className="h-3 w-3 me-1" /> Présent
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600" onClick={() => handleAction("declare_no_show", r.id)}>
                        <UserX className="h-3 w-3 me-1" /> No-show
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Action dialog (accept/refuse with message) */}
      <Dialog open={!!actionDialog} onOpenChange={(o) => !o && setActionDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {actionDialog?.type === "accept" ? "Accepter la réservation" : "Refuser la réservation"}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            placeholder={actionDialog?.type === "accept" ? "Message au client (optionnel)" : "Raison du refus (optionnel)"}
            rows={3}
            className="text-sm"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setActionDialog(null)}>Annuler</Button>
            <Button
              variant={actionDialog?.type === "accept" ? "default" : "destructive"}
              onClick={() => actionDialog && handleAction(actionDialog.type, actionDialog.reservation.id)}
              disabled={!!actionLoading}
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin me-1" /> : null}
              {actionDialog?.type === "accept" ? "Confirmer" : "Refuser"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =============================================================================
// Capacity configuration tab
// =============================================================================

export function CapacityTab({ estId }: { estId: string }) {
  const [slots, setSlots] = useState<EstablishmentCapacityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    proGetCapacity(estId)
      .then((r) => setSlots(r.capacity ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [estId]);

  // Predefined profiles
  const applyProfile = (profile: string) => {
    const updated = slots.map((s) => {
      switch (profile) {
        case "paid_priority": return { ...s, paid_stock_percentage: 88, free_stock_percentage: 6, buffer_percentage: 6 };
        case "balanced": return { ...s, paid_stock_percentage: 50, free_stock_percentage: 30, buffer_percentage: 20 };
        case "generous_free": return { ...s, paid_stock_percentage: 30, free_stock_percentage: 60, buffer_percentage: 10 };
        default: return s;
      }
    });
    setSlots(updated);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await proUpdateCapacity(estId, slots);
    } catch { /* error */ }
    setSaving(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      {slots.length === 0 ? (
        <div className="py-8 text-center space-y-2">
          <Layers className="mx-auto h-10 w-10 text-slate-300" />
          <p className="text-sm text-muted-foreground">
            La répartition des places se configure directement lors de la création d'un créneau.
          </p>
          <p className="text-xs text-slate-400">
            Allez dans l'onglet « Mes créneaux » pour créer un créneau avec sa répartition.
          </p>
        </div>
      ) : (
        <>
          {/* Predefined profiles — bulk apply */}
          <div>
            <p className="text-xs text-slate-500 mb-2">Appliquer un profil à tous les créneaux :</p>
            <div className="flex flex-wrap gap-2">
              <Badge className="cursor-pointer hover:opacity-80" onClick={() => applyProfile("paid_priority")}>Priorité payante</Badge>
              <Badge variant="secondary" className="cursor-pointer hover:opacity-80" onClick={() => applyProfile("balanced")}>Équilibré</Badge>
              <Badge variant="outline" className="cursor-pointer hover:opacity-80" onClick={() => applyProfile("generous_free")}>Gratuit généreux</Badge>
            </div>
          </div>

          {/* Slot list */}
          <div className="space-y-3">
            {slots.map((slot, i) => (
              <div key={slot.id || i} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {slot.time_slot_start} – {slot.time_slot_end}
                    {slot.specific_date && <span className="text-xs ms-2 text-muted-foreground">{slot.specific_date}</span>}
                    {slot.day_of_week !== null && <span className="text-xs ms-2 text-muted-foreground">Jour {slot.day_of_week}</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {slot.total_capacity} places · {slot.slot_interval_minutes}min
                  </span>
                </div>

                {/* Quota bars */}
                <div className="flex h-3 rounded-full overflow-hidden bg-muted">
                  <div className="bg-primary transition-all" style={{ width: `${slot.paid_stock_percentage}%` }} title={`Payant: ${slot.paid_stock_percentage}%`} />
                  <div className="bg-green-500 transition-all" style={{ width: `${slot.free_stock_percentage}%` }} title={`Gratuit: ${slot.free_stock_percentage}%`} />
                  <div className="bg-orange-400 transition-all" style={{ width: `${slot.buffer_percentage}%` }} title={`Buffer: ${slot.buffer_percentage}%`} />
                </div>
                <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary" />Payant {slot.paid_stock_percentage}%</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />Gratuit {slot.free_stock_percentage}%</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400" />Buffer {slot.buffer_percentage}%</span>
                </div>
              </div>
            ))}
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : null}
            Enregistrer la configuration
          </Button>
        </>
      )}
    </div>
  );
}

// =============================================================================
// Discounts tab
// =============================================================================

export function DiscountsTab({ estId }: { estId: string }) {
  const [discounts, setDiscounts] = useState<EstablishmentSlotDiscountRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDiscounts = useCallback(async () => {
    setLoading(true);
    try {
      const r = await proGetDiscounts(estId);
      setDiscounts(r.discounts ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [estId]);

  useEffect(() => { fetchDiscounts(); }, [fetchDiscounts]);

  const handleDelete = async (id: string) => {
    try {
      await proDeleteDiscount(id, estId);
      setDiscounts((prev) => prev.filter((d) => d.id !== id));
    } catch { /* ignore */ }
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      {discounts.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Aucune remise configurée</p>
      ) : (
        <div className="space-y-2">
          {discounts.map((d) => (
            <div key={d.id} className="border rounded-lg p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">
                  {d.label} — {d.discount_type === "percentage" ? `${d.discount_value}%` : `${d.discount_value} MAD`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {d.applies_to === "specific_date" && `Date: ${d.specific_date}`}
                  {d.applies_to === "day_of_week" && `Jour: ${d.day_of_week}`}
                  {d.applies_to === "time_range" && `${d.time_slot_start}-${d.time_slot_end}`}
                  {d.start_date && ` · Du ${d.start_date}`}
                  {d.end_date && ` au ${d.end_date}`}
                </p>
              </div>
              <div className="flex gap-1">
                <Badge variant={d.is_active ? "default" : "secondary"}>{d.is_active ? "Actif" : "Inactif"}</Badge>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => handleDelete(d.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Stats tab
// =============================================================================

function StatsTab({ estId }: { estId: string }) {
  const [stats, setStats] = useState<ProReservationStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    proGetReservationStats(estId)
      .then((r) => setStats(r.stats))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [estId]);

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!stats) return <p className="text-sm text-muted-foreground text-center py-6">Statistiques non disponibles</p>;

  const kpis = [
    { label: "Taux de remplissage", value: `${(stats.occupancyRate ?? 0).toFixed(1)}%`, icon: TrendingUp, color: "text-green-600" },
    { label: "Taux de no-show", value: `${(stats.noShowRate ?? 0).toFixed(1)}%`, icon: UserX, color: "text-red-600" },
    { label: "Conversion vues→résas", value: `${(stats.conversionRate ?? 0).toFixed(1)}%`, icon: BarChart3, color: "text-blue-600" },
    { label: "Conversion gratuit→payant", value: `${(stats.freeTooPaidRate ?? 0).toFixed(1)}%`, icon: Zap, color: "text-purple-600" },
    { label: "Total réservations", value: String(stats.totalReservations ?? 0), icon: CalendarDays, color: "text-foreground" },
    { label: "Confirmées", value: String(stats.totalConfirmed ?? 0), icon: CheckCircle2, color: "text-green-600" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {kpis.map((kpi) => (
        <div key={kpi.label} className="bg-card border rounded-lg p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <kpi.icon className="h-3.5 w-3.5" />
            <span className="text-[10px] font-medium">{kpi.label}</span>
          </div>
          <p className={cn("text-xl font-bold", kpi.color)}>{kpi.value}</p>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Quotes tab
// =============================================================================

function QuotesTab({ estId }: { estId: string }) {
  const [quotes, setQuotes] = useState<QuoteRequestRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    proListQuotes(estId)
      .then((r) => setQuotes(r.quotes ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [estId]);

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!quotes.length) return <p className="text-sm text-muted-foreground text-center py-6">Aucune demande de devis</p>;

  return (
    <div className="space-y-2">
      {quotes.map((q) => (
        <div key={q.id} className="border rounded-lg p-4 space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium">{q.party_size} personnes · {q.event_type}</p>
              <p className="text-xs text-muted-foreground">
                {q.preferred_date && `Date souhaitée: ${q.preferred_date}`}
                {q.is_date_flexible && " (flexible)"}
              </p>
            </div>
            <Badge variant="outline" className="text-[10px]">{q.status}</Badge>
          </div>
          {q.requirements && <p className="text-xs text-muted-foreground">{q.requirements}</p>}
          <div className="flex gap-2">
            {q.status === "submitted" && (
              <Button size="sm" variant="outline" className="h-7 text-xs"
                onClick={async () => { await proAcknowledgeQuote(q.id, estId); setQuotes((p) => p.map((x) => x.id === q.id ? { ...x, status: "acknowledged" as any } : x)); }}>
                <Eye className="h-3 w-3 me-1" /> Prendre en compte
              </Button>
            )}
            {(q.status === "acknowledged" || q.status === "submitted") && (
              <Button size="sm" className="h-7 text-xs"
                onClick={async () => {
                  const content = prompt("Votre offre / message au client :");
                  if (content) await proSendQuoteOffer(q.id, estId, content);
                }}>
                <MessageSquare className="h-3 w-3 me-1" /> Envoyer devis
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Main Dashboard
// =============================================================================

type ResSubTab = "reservations" | "slots" | "quotes" | "stats";

const RES_SUB_TABS: Array<{ id: ResSubTab; label: string; icon: typeof CalendarDays }> = [
  { id: "slots", label: "Créneaux", icon: Clock },
  { id: "reservations", label: "Réservations", icon: CalendarDays },
  { id: "quotes", label: "Devis", icon: MessageSquare },
  { id: "stats", label: "Stats", icon: BarChart3 },
];

export function ProReservationsV2Dashboard({ establishmentId, establishment, role, className }: ProReservationsV2DashboardProps) {
  const [tab, setTab] = useState<ResSubTab>("slots");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  return (
    <div className={cn("space-y-4", className)}>
      {/* Sub-tabs — pill style */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {RES_SUB_TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "shrink-0 h-9 rounded-full px-4 text-sm font-semibold border transition flex items-center gap-1.5",
                tab === t.id
                  ? "bg-[#a3001d] text-white border-[#a3001d]"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}

        {/* Filtre statut — visible uniquement sur l'onglet Réservations */}
        {tab === "reservations" && (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="ms-auto shrink-0 w-auto h-9 rounded-full border-slate-200 text-sm gap-1.5 px-3">
              <Filter className="h-3.5 w-3.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="requested">Demandées</SelectItem>
              <SelectItem value="pending_pro_validation">À traiter</SelectItem>
              <SelectItem value="confirmed">Confirmées</SelectItem>
              <SelectItem value="on_hold">En attente</SelectItem>
              <SelectItem value="consumed">Honorées</SelectItem>
              <SelectItem value="noshow">No-show</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {tab === "reservations" && <ReservationsListTab estId={establishmentId} statusFilter={statusFilter} setStatusFilter={setStatusFilter} />}
      {tab === "slots" && establishment && role && (
        <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
          <ProSlotsTab establishment={establishment} role={role} />
        </Suspense>
      )}
      {tab === "quotes" && <QuotesTab estId={establishmentId} />}
      {tab === "stats" && <StatsTab estId={establishmentId} />}
    </div>
  );
}
