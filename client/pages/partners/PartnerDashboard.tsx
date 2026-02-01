import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import {
  Briefcase,
  Upload,
  Clock,
  CheckCircle2,
  Banknote,
  ChevronRight,
  MapPin,
  Calendar,
  FileText,
  RefreshCw,
  AlertCircle,
  User,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  listPartnerMissions,
  type PartnerMissionListItem,
} from "@/lib/pro/api";
import type { PartnerProfile } from "@/components/partner/PartnerLayout";

type OutletContext = {
  profile: PartnerProfile;
  refreshProfile: () => void;
};

type FilterTab = "all" | "todo" | "review" | "approved" | "payable" | "paid";

const ROLE_LABELS: Record<string, string> = {
  camera: "Caméraman",
  editor: "Monteur",
  voice: "Voix off",
  blogger: "Blogueur",
  photographer: "Photographe",
};

const FILTER_TABS: { key: FilterTab; label: string; icon: typeof Briefcase }[] =
  [
    { key: "all", label: "Toutes", icon: Briefcase },
    { key: "todo", label: "À faire", icon: Upload },
    { key: "review", label: "En validation", icon: Clock },
    { key: "approved", label: "Validées", icon: CheckCircle2 },
    { key: "payable", label: "Payables", icon: Banknote },
    { key: "paid", label: "Payées", icon: CheckCircle2 },
  ];

const STATUS_BADGE_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  expected: {
    label: "À déposer",
    className: "bg-amber-100 text-amber-800 border-amber-200",
  },
  submitted: {
    label: "Soumis",
    className: "bg-blue-100 text-blue-800 border-blue-200",
  },
  in_review: {
    label: "En validation",
    className: "bg-purple-100 text-purple-800 border-purple-200",
  },
  approved: {
    label: "Validé",
    className: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  rejected: {
    label: "Rejeté",
    className: "bg-red-100 text-red-800 border-red-200",
  },
};

function getDeliverableStatusBadge(status: string) {
  const config = STATUS_BADGE_CONFIG[status] || {
    label: status,
    className: "bg-slate-100 text-slate-700",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border",
        config.className,
      )}
    >
      {config.label}
    </span>
  );
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

type GroupedMission = {
  jobId: string;
  job: {
    title: string;
    status: string;
    establishment_name: string;
    city: string;
    shoot_date: string | null;
  };
  deliverables: PartnerMissionListItem[];
  hasExpected: boolean;
  hasSubmitted: boolean;
  hasApproved: boolean;
  allApproved: boolean;
  hasPaid: boolean;
};

export function PartnerDashboard() {
  const { profile, refreshProfile } = useOutletContext<OutletContext>();
  const navigate = useNavigate();

  const [missions, setMissions] = useState<PartnerMissionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");

  const loadMissions = async () => {
    setLoading(true);
    try {
      const res = await listPartnerMissions();
      setMissions(res.items ?? []);
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMissions();
  }, []);

  // Group by job
  const grouped = useMemo(() => {
    const map = new Map<string, GroupedMission>();

    for (const item of missions) {
      const jobId = String((item as any).job_id ?? "");
      if (!jobId) continue;

      const job = (item as any).media_jobs ?? {};
      const establishment = job.establishments ?? {};

      let group = map.get(jobId);
      if (!group) {
        group = {
          jobId,
          job: {
            title: String(job.title ?? "(Sans titre)"),
            status: String(job.status ?? ""),
            establishment_name: String(establishment.name ?? "—"),
            city: String(establishment.city ?? "—"),
            shoot_date: (job.meta as any)?.shoot_date ?? null,
          },
          deliverables: [],
          hasExpected: false,
          hasSubmitted: false,
          hasApproved: false,
          allApproved: true,
          hasPaid: false,
        };
        map.set(jobId, group);
      }

      group.deliverables.push(item);
      const status = String((item as any).status ?? "");
      if (status === "expected") group.hasExpected = true;
      if (status === "submitted" || status === "in_review")
        group.hasSubmitted = true;
      if (status === "approved") group.hasApproved = true;
      if (status !== "approved") group.allApproved = false;
      // TODO: Add paid status check when invoice_requests are included
    }

    return [...map.values()];
  }, [missions]);

  // KPI counts
  const kpis = useMemo(() => {
    let inProgress = 0;
    let toUpload = 0;
    let inValidation = 0;
    let payable = 0;
    let paid = 0;

    for (const g of grouped) {
      inProgress++;
      if (g.hasExpected) toUpload++;
      if (g.hasSubmitted) inValidation++;
      if (g.allApproved && g.deliverables.length > 0) payable++;
      if (g.hasPaid) paid++;
    }

    return { inProgress, toUpload, inValidation, payable, paid };
  }, [grouped]);

  // Filtered missions
  const filtered = useMemo(() => {
    if (activeFilter === "all") return grouped;
    if (activeFilter === "todo") return grouped.filter((g) => g.hasExpected);
    if (activeFilter === "review") return grouped.filter((g) => g.hasSubmitted);
    if (activeFilter === "approved")
      return grouped.filter((g) => g.hasApproved);
    if (activeFilter === "payable")
      return grouped.filter((g) => g.allApproved && g.deliverables.length > 0);
    if (activeFilter === "paid") return grouped.filter((g) => g.hasPaid);
    return grouped;
  }, [grouped, activeFilter]);

  // Profile completeness check
  const isProfileIncomplete =
    !profile.display_name || !profile.city || !profile.rib_iban;

  return (
    <div className="space-y-4">
      {/* Profile alert if incomplete */}
      {isProfileIncomplete && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-amber-800">
              Profil incomplet
            </div>
            <div className="text-xs text-amber-700 mt-0.5">
              Complétez votre profil et RIB pour pouvoir demander des factures.
            </div>
          </div>
          <Button size="sm" variant="outline" asChild className="flex-shrink-0">
            <Link to="/partners/profile">Compléter</Link>
          </Button>
        </div>
      )}

      {/* KPI Cards - Single row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <KpiCard icon={Briefcase} label="Missions" value={kpis.inProgress} />
        <KpiCard
          icon={Upload}
          label="À déposer"
          value={kpis.toUpload}
          highlight={kpis.toUpload > 0}
        />
        <KpiCard icon={Clock} label="En validation" value={kpis.inValidation} />
        <KpiCard
          icon={CheckCircle2}
          label="Payables"
          value={kpis.payable}
          highlight={kpis.payable > 0}
        />
        <KpiCard icon={Banknote} label="Payées" value={kpis.paid} />
      </div>

      {/* Compact profile row */}
      <div className="bg-white rounded-lg border border-slate-200 p-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <div className="flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-600">Nom:</span>
            <span className="font-medium text-slate-900">
              {profile.display_name || "—"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-600">Ville:</span>
            <span className="font-medium text-slate-900">
              {profile.city || "—"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-600">Rôle:</span>
            <span className="font-medium text-slate-900">
              {ROLE_LABELS[profile.role] ?? profile.role}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-600">Email:</span>
            <span className="font-medium text-slate-900">
              {profile.email || "—"}
            </span>
          </div>
          {isProfileIncomplete && (
            <Link
              to="/partners/profile"
              className="text-[#a3001d] hover:underline font-medium ml-auto"
            >
              Compléter mon profil →
            </Link>
          )}
        </div>
      </div>

      {/* Missions section */}
      <div className="bg-white rounded-lg border border-slate-200">
        <div className="p-3 border-b border-slate-100 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">Mes Missions</h2>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void loadMissions()}
            disabled={loading}
            className="h-7 px-2"
          >
            <RefreshCw
              className={cn("w-3.5 h-3.5", loading && "animate-spin")}
            />
          </Button>
        </div>

        {/* Filter tabs */}
        <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-1 overflow-x-auto">
          {FILTER_TABS.map((tab) => {
            const count =
              tab.key === "all"
                ? grouped.length
                : tab.key === "todo"
                  ? kpis.toUpload
                  : tab.key === "review"
                    ? kpis.inValidation
                    : tab.key === "approved"
                      ? grouped.filter((g) => g.hasApproved).length
                      : tab.key === "payable"
                        ? kpis.payable
                        : kpis.paid;

            return (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key)}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                  activeFilter === tab.key
                    ? "bg-[#a3001d] text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                )}
              >
                {tab.label}
                {count > 0 && (
                  <span
                    className={cn(
                      "text-[10px] min-w-[16px] h-4 flex items-center justify-center rounded-full",
                      activeFilter === tab.key
                        ? "bg-white/20"
                        : "bg-slate-300/50",
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Mission list */}
        {loading ? (
          <div className="p-8 text-center">
            <RefreshCw className="w-5 h-5 animate-spin text-slate-400 mx-auto" />
            <div className="text-sm text-slate-500 mt-2">Chargement...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <div className="text-sm text-slate-600">
              {activeFilter === "all"
                ? "Aucune mission pour le moment."
                : "Aucune mission dans cette catégorie."}
            </div>
            {activeFilter === "all" && (
              <p className="text-xs text-slate-400 mt-1">
                Dès qu'un livrable vous sera assigné, il apparaîtra ici.
              </p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((mission) => (
              <MissionRow
                key={mission.jobId}
                mission={mission}
                onClick={() => navigate(`/partners/missions/${mission.jobId}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Recent billing - mini */}
      <div className="bg-white rounded-lg border border-slate-200 p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-slate-700 uppercase">
            Dernières demandes de facture
          </h3>
          <Link
            to="/partners/billing"
            className="text-xs text-[#a3001d] hover:underline"
          >
            Voir tout →
          </Link>
        </div>
        <div className="text-xs text-slate-500">
          {/* TODO: Integrate invoice request list */}
          Aucune demande récente.
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  highlight = false,
}: {
  icon: typeof Briefcase;
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "bg-white rounded-lg border p-2.5 flex items-center gap-2",
        highlight ? "border-[#a3001d] bg-red-50" : "border-slate-200",
      )}
    >
      <Icon
        className={cn(
          "w-4 h-4",
          highlight ? "text-[#a3001d]" : "text-slate-400",
        )}
      />
      <div className="min-w-0">
        <div
          className={cn(
            "text-lg font-bold leading-none",
            highlight ? "text-[#a3001d]" : "text-slate-900",
          )}
        >
          {value}
        </div>
        <div className="text-[10px] text-slate-500 truncate">{label}</div>
      </div>
    </div>
  );
}

function MissionRow({
  mission,
  onClick,
}: {
  mission: GroupedMission;
  onClick: () => void;
}) {
  const nextAction = mission.hasExpected
    ? "Uploader les livrables"
    : mission.hasSubmitted
      ? "En attente de validation"
      : mission.allApproved
        ? "Prêt pour facturation"
        : "—";

  return (
    <div
      onClick={onClick}
      className="p-3 hover:bg-slate-50 cursor-pointer transition-colors flex items-center gap-3"
    >
      <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[1fr,auto,auto] gap-2 items-center">
        {/* Establishment + city */}
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-900 truncate">
            {mission.job.establishment_name}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <MapPin className="w-3 h-3" />
            {mission.job.city}
            {mission.job.shoot_date && (
              <>
                <span className="text-slate-300">•</span>
                <Calendar className="w-3 h-3" />
                {formatDate(mission.job.shoot_date)}
              </>
            )}
          </div>
        </div>

        {/* Deliverable badges */}
        <div className="flex flex-wrap gap-1">
          {mission.deliverables.slice(0, 3).map((d: any) => (
            <span key={d.id}>{getDeliverableStatusBadge(d.status)}</span>
          ))}
          {mission.deliverables.length > 3 && (
            <span className="text-[10px] text-slate-400">
              +{mission.deliverables.length - 3}
            </span>
          )}
        </div>

        {/* Next action */}
        <div className="text-xs text-slate-600 sm:text-right whitespace-nowrap">
          {nextAction}
        </div>
      </div>

      <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
    </div>
  );
}

export default PartnerDashboard;
