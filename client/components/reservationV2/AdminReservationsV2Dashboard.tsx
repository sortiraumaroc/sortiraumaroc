/**
 * 4.5 — Dashboard Admin — Section Réservations V2
 *
 * Tabs:
 *  - Vue globale (volume, distribution by status, trends)
 *  - Litiges (no-show disputes pending arbitration)
 *  - Sanctions (establishment deactivations)
 *  - Scoring (suspended clients, low-score clients)
 *  - Confiance Pro (pro trust score rankings)
 *  - Stats (global metrics, free/paid/buffer distribution)
 */

import * as React from "react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { format } from "date-fns";
import {
  CalendarDays, AlertTriangle, Shield, Users, BarChart3, Ban,
  CheckCircle2, XCircle, Loader2, TrendingUp, Eye, Scale,
  UserX, Building2, Star, Unlock, FileText, Gavel,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { scoreToStars } from "@/lib/reservationV2Api";
import {
  adminListReservationsV2,
  adminListDisputes,
  adminArbitrateDispute,
  adminListSanctions,
  adminDeactivateEstablishment,
  adminReactivateEstablishment,
  adminListSuspendedClients,
  adminLiftClientSuspension,
  adminListProTrustScores,
  adminGetReservationGlobalStats,
  type AdminReservationRow,
  type AdminReservationGlobalStats,
} from "@/lib/reservationV2AdminApi";
import type { NoShowDisputeRow, EstablishmentSanctionRow, ProTrustScoreRow } from "../../../shared/reservationTypesV2";

// =============================================================================
// Props
// =============================================================================

export interface AdminReservationsV2DashboardProps {
  className?: string;
}

// =============================================================================
// Global overview tab
// =============================================================================

function OverviewTab() {
  const [stats, setStats] = useState<AdminReservationGlobalStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    adminGetReservationGlobalStats()
      .then((r) => setStats(r.stats))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!stats) return <p className="text-sm text-muted-foreground text-center py-6">Statistiques non disponibles</p>;

  return (
    <div className="space-y-4">
      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard icon={CalendarDays} label="Total résas" value={String(stats.totalReservations)} color="text-blue-600" />
        <KpiCard icon={TrendingUp} label="Taux remplissage" value={`${stats.avgOccupancyRate.toFixed(1)}%`} color="text-green-600" />
        <KpiCard icon={UserX} label="Taux no-show" value={`${stats.noShowRate.toFixed(1)}%`} color="text-red-600" />
        <KpiCard icon={AlertTriangle} label="Litiges en cours" value={String(stats.pendingDisputes)} color="text-orange-600" />
      </div>

      {/* Distribution free/paid/buffer */}
      <div className="bg-card border rounded-lg p-4 space-y-2">
        <h4 className="text-sm font-semibold">Répartition stock</h4>
        <div className="flex h-4 rounded-full overflow-hidden bg-muted">
          {stats.paidCount > 0 && <div className="bg-primary transition-all" style={{ width: `${(stats.paidCount / stats.totalReservations * 100) || 0}%` }} />}
          {stats.freeCount > 0 && <div className="bg-green-500 transition-all" style={{ width: `${(stats.freeCount / stats.totalReservations * 100) || 0}%` }} />}
          {stats.bufferCount > 0 && <div className="bg-orange-400 transition-all" style={{ width: `${(stats.bufferCount / stats.totalReservations * 100) || 0}%` }} />}
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary" />Payant: {stats.paidCount}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />Gratuit: {stats.freeCount}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400" />Buffer: {stats.bufferCount}</span>
        </div>
      </div>

      {/* Status breakdown */}
      {stats.totalByStatus && Object.keys(stats.totalByStatus).length > 0 && (
        <div className="bg-card border rounded-lg p-4 space-y-2">
          <h4 className="text-sm font-semibold">Distribution par statut</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(stats.totalByStatus)
              .sort(([, a], [, b]) => (b as number) - (a as number))
              .map(([status, count]) => (
                <div key={status} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground capitalize">{status.replace(/_/g, " ")}</span>
                  <span className="font-semibold tabular-nums">{count as number}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Alerts */}
      <div className="bg-card border rounded-lg p-4 space-y-2">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          Alertes
        </h4>
        <div className="space-y-1 text-xs">
          {stats.pendingDisputes > 0 && (
            <p className="text-orange-600">🟠 {stats.pendingDisputes} litige(s) en attente d'arbitrage</p>
          )}
          {stats.activeSanctions > 0 && (
            <p className="text-red-600">🔴 {stats.activeSanctions} sanction(s) active(s)</p>
          )}
          {stats.suspendedClients > 0 && (
            <p className="text-yellow-600">🟡 {stats.suspendedClients} client(s) suspendu(s)</p>
          )}
          {stats.pendingDisputes === 0 && stats.activeSanctions === 0 && stats.suspendedClients === 0 && (
            <p className="text-green-600">✅ Aucune alerte</p>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="bg-card border rounded-lg p-3 space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[10px] font-medium">{label}</span>
      </div>
      <p className={cn("text-xl font-bold", color)}>{value}</p>
    </div>
  );
}

// =============================================================================
// Disputes tab
// =============================================================================

function DisputesTab() {
  const [disputes, setDisputes] = useState<NoShowDisputeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDispute, setSelectedDispute] = useState<NoShowDisputeRow | null>(null);
  const [notes, setNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    adminListDisputes({ status: "disputed_pending_arbitration" })
      .then((r) => setDisputes(r.disputes))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleArbitrate = async (decision: "favor_client" | "favor_pro" | "indeterminate") => {
    if (!selectedDispute) return;
    setActionLoading(true);
    try {
      await adminArbitrateDispute(selectedDispute.id, decision, notes || undefined);
      setDisputes((prev) => prev.filter((d) => d.id !== selectedDispute.id));
      setSelectedDispute(null);
      setNotes("");
    } catch { /* ignore */ }
    setActionLoading(false);
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      {disputes.length === 0 ? (
        <div className="text-center py-12">
          <Gavel className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Aucun litige en attente d'arbitrage</p>
        </div>
      ) : (
        disputes.map((d) => (
          <div key={d.id} className="border rounded-lg p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Litige #{d.id.slice(0, 8)}</p>
                <p className="text-xs text-muted-foreground">
                  Résa: {d.reservation_id.slice(0, 8)} · Client: {d.user_id.slice(0, 8)}
                  · Déclaré le {format(new Date(d.declared_at), "d MMM yyyy HH:mm")}
                </p>
              </div>
              <Badge variant="destructive" className="text-[10px]">En attente</Badge>
            </div>

            {d.evidence_client.length > 0 && (
              <div className="text-xs text-muted-foreground">
                <span className="font-medium">Preuves client:</span> {d.evidence_client.length} document(s)
              </div>
            )}
            {d.evidence_pro.length > 0 && (
              <div className="text-xs text-muted-foreground">
                <span className="font-medium">Preuves pro:</span> {d.evidence_pro.length} document(s)
              </div>
            )}

            <Button size="sm" variant="outline" onClick={() => setSelectedDispute(d)}>
              <Gavel className="h-3 w-3 me-1" /> Arbitrer
            </Button>
          </div>
        ))
      )}

      {/* Arbitration dialog */}
      <Dialog open={!!selectedDispute} onOpenChange={(o) => !o && setSelectedDispute(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Arbitrage du litige</DialogTitle>
          </DialogHeader>

          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes d'arbitrage (optionnel)"
            rows={3}
            className="text-sm"
          />

          <div className="space-y-2">
            <Button className="w-full" onClick={() => handleArbitrate("favor_client")} disabled={actionLoading}>
              <CheckCircle2 className="h-4 w-4 me-2" /> En faveur du client
            </Button>
            <Button className="w-full" variant="destructive" onClick={() => handleArbitrate("favor_pro")} disabled={actionLoading}>
              <XCircle className="h-4 w-4 me-2" /> En faveur du pro
            </Button>
            <Button className="w-full" variant="outline" onClick={() => handleArbitrate("indeterminate")} disabled={actionLoading}>
              <Scale className="h-4 w-4 me-2" /> Indéterminé
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =============================================================================
// Sanctions tab
// =============================================================================

function SanctionsTab() {
  const [sanctions, setSanctions] = useState<EstablishmentSanctionRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    adminListSanctions({ active_only: true })
      .then((r) => setSanctions(r.sanctions))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      {sanctions.length === 0 ? (
        <div className="text-center py-12">
          <Ban className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Aucune sanction active</p>
        </div>
      ) : (
        sanctions.map((s) => (
          <div key={s.id} className="border rounded-lg p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{s.type.replace(/_/g, " ")}</p>
                <p className="text-xs text-muted-foreground">
                  Établissement: {s.establishment_id.slice(0, 8)}
                  · Imposée le {format(new Date(s.imposed_at), "d MMM yyyy")}
                  {s.deactivation_end && ` · Fin: ${format(new Date(s.deactivation_end), "d MMM yyyy")}`}
                </p>
                <p className="text-xs mt-1">{s.reason}</p>
              </div>
              <Badge variant="destructive" className="text-[10px]">Active</Badge>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const reason = prompt("Raison de la réactivation :");
                if (reason) {
                  await adminReactivateEstablishment(s.establishment_id, reason);
                  setSanctions((prev) => prev.filter((x) => x.id !== s.id));
                }
              }}
            >
              <Unlock className="h-3 w-3 me-1" /> Réactiver
            </Button>
          </div>
        ))
      )}
    </div>
  );
}

// =============================================================================
// Client scoring tab
// =============================================================================

function ClientScoringTab() {
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    adminListSuspendedClients()
      .then((r) => setClients(r.clients))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        Clients suspendus ({clients.length})
      </h4>

      {clients.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Aucun client suspendu</p>
      ) : (
        clients.map((c) => (
          <div key={c.user_id} className="border rounded-lg p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{c.full_name ?? c.email ?? c.user_id.slice(0, 8)}</p>
                <p className="text-xs text-muted-foreground">
                  Score: {typeof c.score_v2 === "number" ? scoreToStars(c.score_v2).toFixed(1) : "—"}/5
                  · No-shows: {c.no_shows_count}
                  · Consécutifs: {c.consecutive_no_shows}
                  {c.suspended_until && ` · Jusqu'au ${format(new Date(c.suspended_until), "d MMM yyyy")}`}
                </p>
              </div>
              <Badge variant="destructive" className="text-[10px]">Suspendu</Badge>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const reason = prompt("Raison de la levée de suspension :");
                if (reason) {
                  await adminLiftClientSuspension(c.user_id, reason);
                  setClients((prev) => prev.filter((x) => x.user_id !== c.user_id));
                }
              }}
            >
              <Unlock className="h-3 w-3 me-1" /> Lever la suspension
            </Button>
          </div>
        ))
      )}
    </div>
  );
}

// =============================================================================
// Pro trust scores tab
// =============================================================================

function ProTrustTab() {
  const [scores, setScores] = useState<ProTrustScoreRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    adminListProTrustScores({ limit: 50, sort: "trust_score_asc" })
      .then((r) => setScores(r.scores))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        Classement confiance pro
      </h4>

      {scores.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Aucun score calculé</p>
      ) : (
        <div className="space-y-2">
          {scores.map((s, i) => (
            <div key={s.id} className="border rounded-lg p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-muted-foreground w-6 text-end">#{i + 1}</span>
                <div>
                  <p className="text-sm font-medium">{s.establishment_id.slice(0, 8)}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Réponse: {s.response_rate.toFixed(0)}% · Délai moy: {s.avg_response_time_minutes.toFixed(0)}min
                    · Annulations: {s.cancellation_rate.toFixed(0)}%
                  </p>
                </div>
              </div>
              <div className="text-end">
                <span className={cn(
                  "text-lg font-bold",
                  s.trust_score >= 80 ? "text-green-600" : s.trust_score >= 50 ? "text-yellow-600" : "text-red-600",
                )}>
                  {s.trust_score}
                </span>
                <span className="text-xs text-muted-foreground">/100</span>
                {s.current_sanction !== "none" && (
                  <Badge variant="destructive" className="text-[8px] ms-1">{s.current_sanction}</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Main Dashboard
// =============================================================================

export function AdminReservationsV2Dashboard({ className }: AdminReservationsV2DashboardProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <h2 className="text-xl font-bold flex items-center gap-2">
        <Shield className="h-5 w-5" />
        Administration Réservations V2
      </h2>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full flex flex-wrap gap-1 h-auto p-1">
          <TabsTrigger value="overview" className="text-xs flex-1">Vue globale</TabsTrigger>
          <TabsTrigger value="disputes" className="text-xs flex-1">Litiges</TabsTrigger>
          <TabsTrigger value="sanctions" className="text-xs flex-1">Sanctions</TabsTrigger>
          <TabsTrigger value="scoring" className="text-xs flex-1">Scoring</TabsTrigger>
          <TabsTrigger value="trust" className="text-xs flex-1">Confiance Pro</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4"><OverviewTab /></TabsContent>
        <TabsContent value="disputes" className="mt-4"><DisputesTab /></TabsContent>
        <TabsContent value="sanctions" className="mt-4"><SanctionsTab /></TabsContent>
        <TabsContent value="scoring" className="mt-4"><ClientScoringTab /></TabsContent>
        <TabsContent value="trust" className="mt-4"><ProTrustTab /></TabsContent>
      </Tabs>
    </div>
  );
}
