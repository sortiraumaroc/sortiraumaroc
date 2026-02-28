import { useEffect, useState } from "react";
import {
  Route,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  Handshake,
  TrendingUp,
  Trophy,
  XCircle,
  Plus,
  Activity,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
  ConciergeProfile,
  JourneyListItem,
  ConciergePartnerStats,
  PartnerActivity,
  PartnerBadge,
} from "@shared/conciergerieTypes";
import { listJourneys, listPartners } from "@/lib/conciergerie/api";

type Props = {
  concierge: ConciergeProfile;
};

type Stats = {
  total: number;
  draft: number;
  requesting: number;
  confirmed: number;
  completed: number;
};

// =============================================================================
// Badge component
// =============================================================================

const BADGE_CONFIG: Record<
  PartnerBadge,
  { label: string; icon: string; className: string } | null
> = {
  gold: { label: "Or", icon: "\u{1f947}", className: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  silver: { label: "Argent", icon: "\u{1f948}", className: "bg-slate-100 text-slate-600 border-slate-300" },
  bronze: { label: "Bronze", icon: "\u{1f949}", className: "bg-orange-100 text-orange-700 border-orange-300" },
  none: null,
};

function PartnerBadgeLabel({ badge }: { badge: PartnerBadge }) {
  const config = BADGE_CONFIG[badge];
  if (!config) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${config.className}`}
    >
      {config.icon} {config.label}
    </span>
  );
}

// =============================================================================
// Score bar
// =============================================================================

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-yellow-500"
      : score >= 60
        ? "bg-slate-400"
        : score >= 40
          ? "bg-orange-400"
          : "bg-slate-300";

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-slate-600 w-8 text-right">
        {score}
      </span>
    </div>
  );
}

// =============================================================================
// Format helpers
// =============================================================================

function formatPrice(centimes: number): string {
  return `${(centimes / 100).toLocaleString("fr-MA")} DH`;
}

function formatRelativeDate(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return "Il y a quelques minutes";
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Hier";
  if (days < 7) return `Il y a ${days}j`;
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}

// =============================================================================
// Main component
// =============================================================================

export default function ConciergerieDashboardTab({ concierge }: Props) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    draft: 0,
    requesting: 0,
    confirmed: 0,
    completed: 0,
  });
  const [recentJourneys, setRecentJourneys] = useState<JourneyListItem[]>([]);
  const [partnersList, setPartnersList] = useState<ConciergePartnerStats[]>([]);
  const [activity, setActivity] = useState<PartnerActivity[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const [journeysRes, partnersRes] = await Promise.all([
          listJourneys({ per_page: 50 }),
          listPartners().catch(() => ({ partners: [], activity: [] })),
        ]);

        const { journeys, total } = journeysRes;
        setStats({
          total,
          draft: journeys.filter((j) => j.status === "draft").length,
          requesting: journeys.filter(
            (j) =>
              j.status === "requesting" || j.status === "partially_accepted",
          ).length,
          confirmed: journeys.filter((j) => j.status === "confirmed").length,
          completed: journeys.filter((j) => j.status === "completed").length,
        });
        setRecentJourneys(journeys.slice(0, 5));

        setPartnersList(partnersRes.partners ?? []);
        setActivity(partnersRes.activity ?? []);
      } catch (e) {
        console.error("[conciergerie] Dashboard load error:", e);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const activePartners = partnersList.filter((p) => p.status === "active");
  const totalRevenue = partnersList.reduce((s, p) => s + p.total_revenue, 0);
  const avgCommission =
    activePartners.length > 0
      ? activePartners.reduce((s, p) => s + p.commission_rate, 0) /
        activePartners.length
      : 0;
  const topPartners = [...partnersList]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">
          Bonjour, {concierge.user.first_name || "Conciergerie"} !
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          Bienvenue dans votre espace conciergerie —{" "}
          {concierge.concierge.name}
        </p>
      </div>

      {/* ── Journey Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Route className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-slate-500">Total parcours</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-50 rounded-lg">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.requesting}</p>
                <p className="text-xs text-slate-500">En attente</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-50 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.confirmed}</p>
                <p className="text-xs text-slate-500">Confirmés</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-50 rounded-lg">
                <AlertCircle className="w-5 h-5 text-slate-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.draft}</p>
                <p className="text-xs text-slate-500">Brouillons</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Partner Stats ── */}
      {activePartners.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-50 rounded-lg">
                  <Handshake className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{activePartners.length}</p>
                  <p className="text-xs text-slate-500">Partenaires actifs</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-50 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {totalRevenue > 0 ? formatPrice(totalRevenue) : "—"}
                  </p>
                  <p className="text-xs text-slate-500">CA total</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-50 rounded-lg">
                  <Trophy className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {avgCommission.toFixed(1)}%
                  </p>
                  <p className="text-xs text-slate-500">Commission moy.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Top Partenaires (Meilleurs élèves) ── */}
      {topPartners.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Trophy className="h-5 w-5 text-amber-500" />
              Top Partenaires
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topPartners.map((p, idx) => (
                <div
                  key={p.id}
                  className="flex items-center gap-4 rounded-lg border bg-white p-3 hover:bg-slate-50 transition-colors"
                >
                  {/* Rank */}
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">
                    {idx + 1}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-slate-900 truncate">
                        {p.establishment_name}
                      </span>
                      <PartnerBadgeLabel badge={p.badge} />
                    </div>
                    <div className="mt-1.5">
                      <ScoreBar score={p.score} />
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="hidden md:flex items-center gap-4 shrink-0 text-xs text-slate-500">
                    <div className="text-center">
                      <div className="font-semibold text-slate-700">
                        {p.acceptance_rate}%
                      </div>
                      <div>Accept.</div>
                    </div>
                    <div className="text-center">
                      <div className="font-semibold text-slate-700">
                        {p.total_confirmed_bookings}
                      </div>
                      <div>Réserv.</div>
                    </div>
                    <div className="text-center">
                      <div className="font-semibold text-slate-700">
                        {p.total_revenue > 0
                          ? formatPrice(p.total_revenue)
                          : "—"}
                      </div>
                      <div>CA</div>
                    </div>
                    <div className="text-center">
                      <div className="font-semibold text-slate-700">
                        {p.commission_rate}%
                      </div>
                      <div>Comm.</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-slate-400">
                        {p.admin_share}/{p.concierge_share}
                      </div>
                      <div>Split</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Recent journeys ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Parcours récents</CardTitle>
        </CardHeader>
        <CardContent>
          {recentJourneys.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Route className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="font-medium">Aucun parcours créé</p>
              <p className="text-sm mt-1">
                Créez votre premier parcours pour commencer.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentJourneys.map((j) => (
                <div
                  key={j.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-white hover:bg-slate-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-slate-900 truncate">
                      {j.title || `Parcours du ${j.desired_date}`}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {j.client_name} · {j.party_size} pers. · {j.desired_date}
                    </p>
                  </div>
                  <StatusBadge status={j.status} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Activity Feed ── */}
      {activity.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-5 w-5 text-blue-500" />
              Activité récente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {activity.map((a, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 rounded-lg border px-3 py-2.5"
                >
                  <div className="mt-0.5 shrink-0">
                    {a.type === "partner_added" && (
                      <Plus className="h-4 w-4 text-purple-500" />
                    )}
                    {a.type === "request_accepted" && (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    )}
                    {a.type === "request_refused" && (
                      <XCircle className="h-4 w-4 text-red-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700">
                      {a.type === "partner_added" && (
                        <>
                          <strong>{a.establishment_name}</strong> ajouté comme
                          partenaire
                        </>
                      )}
                      {a.type === "request_accepted" && (
                        <>
                          <strong>{a.establishment_name}</strong> a accepté une
                          demande
                          {a.details && (
                            <Badge
                              variant="outline"
                              className="ml-1.5 text-xs"
                            >
                              {a.details}
                            </Badge>
                          )}
                        </>
                      )}
                      {a.type === "request_refused" && (
                        <>
                          <strong>{a.establishment_name}</strong> a refusé une
                          demande
                        </>
                      )}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {formatRelativeDate(a.date)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    draft: { label: "Brouillon", className: "bg-slate-100 text-slate-600" },
    requesting: {
      label: "En cours",
      className: "bg-amber-100 text-amber-700",
    },
    partially_accepted: {
      label: "Partiel",
      className: "bg-blue-100 text-blue-700",
    },
    confirmed: {
      label: "Confirmé",
      className: "bg-green-100 text-green-700",
    },
    cancelled: { label: "Annulé", className: "bg-red-100 text-red-600" },
    completed: {
      label: "Terminé",
      className: "bg-slate-200 text-slate-700",
    },
  };

  const c = config[status] ?? {
    label: status,
    className: "bg-slate-100 text-slate-600",
  };
  return (
    <span
      className={`text-xs font-medium px-2 py-1 rounded-full ${c.className}`}
    >
      {c.label}
    </span>
  );
}
