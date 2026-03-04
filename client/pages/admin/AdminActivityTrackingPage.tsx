import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Clock, Building2, Users, Timer, RefreshCw, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminCollaboratorsNav } from "@/pages/admin/collaborators/AdminCollaboratorsNav";

import {
  getAdminActivityStats,
  loadAdminApiKey,
  type AdminActivityCollaboratorStats,
  type AdminActivityStatsResponse,
} from "@/lib/adminApi";
import { toast } from "@/hooks/use-toast";

// ─── Date helpers ────────────────────────────────────────────────────────────

function formatToday(): string {
  return new Date().toISOString().split("T")[0];
}

function formatDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0min";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}min`;
  return `${m}min`;
}

function formatTime(isoString: string | null): string {
  if (!isoString) return "—";
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function formatDateTime(isoString: string | null): string {
  if (!isoString) return "—";
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

// ─── Period presets ──────────────────────────────────────────────────────────

type PeriodPreset = { label: string; from: string; to: string };

function getPeriodPresets(): PeriodPreset[] {
  const today = formatToday();
  return [
    { label: "Aujourd'hui", from: today, to: today },
    { label: "Hier", from: formatDateOffset(1), to: formatDateOffset(1) },
    { label: "7 jours", from: formatDateOffset(6), to: today },
    { label: "30 jours", from: formatDateOffset(29), to: today },
  ];
}

// ─── Role badge colors ──────────────────────────────────────────────────────

function getRoleBadgeVariant(role: string): "default" | "secondary" | "destructive" | "outline" {
  switch (role) {
    case "superadmin":
      return "destructive";
    case "admin":
      return "default";
    case "ops":
      return "secondary";
    default:
      return "outline";
  }
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard(props: {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
}) {
  const Icon = props.icon;
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground truncate">
              {props.title}
            </p>
            <p className="text-2xl font-bold tracking-tight">{props.value}</p>
            {props.description ? (
              <p className="text-xs text-muted-foreground mt-0.5">{props.description}</p>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Table columns ───────────────────────────────────────────────────────────

const columns: ColumnDef<AdminActivityCollaboratorStats>[] = [
  {
    accessorKey: "name",
    header: "Collaborateur",
    cell: ({ row }) => (
      <div className="min-w-0">
        <p className="font-medium text-sm truncate">{row.original.name}</p>
        {row.original.email ? (
          <p className="text-xs text-muted-foreground truncate">{row.original.email}</p>
        ) : null}
      </div>
    ),
  },
  {
    accessorKey: "role",
    header: "Rôle",
    cell: ({ row }) => (
      <Badge variant={getRoleBadgeVariant(row.original.role)}>
        {row.original.role ?? "—"}
      </Badge>
    ),
  },
  {
    accessorKey: "session_count",
    header: "Sessions",
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.session_count}</span>
    ),
  },
  {
    accessorKey: "total_active_seconds",
    header: "Temps actif",
    cell: ({ row }) => (
      <span className="tabular-nums font-medium">
        {formatDuration(row.original.total_active_seconds)}
      </span>
    ),
  },
  {
    accessorKey: "establishments_created",
    header: "Établissements",
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.establishments_created}</span>
    ),
  },
  {
    id: "avg_per_establishment",
    header: "Moy. / Étab.",
    cell: ({ row }) => {
      const avg = row.original.avg_seconds_per_establishment;
      return (
        <span className="tabular-nums text-muted-foreground">
          {avg != null ? formatDuration(avg) : "—"}
        </span>
      );
    },
  },
  {
    accessorKey: "first_heartbeat",
    header: "1ère connexion",
    cell: ({ row }) => (
      <span className="text-xs tabular-nums text-muted-foreground">
        {formatTime(row.original.first_heartbeat)}
      </span>
    ),
  },
  {
    accessorKey: "last_heartbeat",
    header: "Dernière activité",
    cell: ({ row }) => (
      <span className="text-xs tabular-nums text-muted-foreground">
        {formatDateTime(row.original.last_heartbeat)}
      </span>
    ),
  },
];

// ─── Main page component ─────────────────────────────────────────────────────

export function AdminActivityTrackingPage() {
  const [data, setData] = useState<AdminActivityStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState(0); // index into presets

  const presets = useMemo(() => getPeriodPresets(), []);

  const fetchStats = useCallback(
    async (from: string, to: string) => {
      setLoading(true);
      try {
        const adminKey = loadAdminApiKey() ?? undefined;
        const result = await getAdminActivityStats(adminKey, from, to);
        setData(result);
      } catch (err: any) {
        console.error("[activity-tracking] fetch error:", err);
        toast({
          title: "Erreur",
          description: err?.message ?? "Impossible de charger les statistiques d'activité",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Initial load + auto-refresh every 60s
  useEffect(() => {
    const preset = presets[selectedPeriod];
    fetchStats(preset.from, preset.to);

    const interval = setInterval(() => {
      const p = presets[selectedPeriod];
      fetchStats(p.from, p.to);
    }, 60_000);

    return () => clearInterval(interval);
  }, [selectedPeriod, presets, fetchStats]);

  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <AdminCollaboratorsNav />
      <AdminPageHeader
        title="Suivi d'activité"
        description="Mesurez le temps de travail actif de chaque collaborateur, corrélé au nombre d'établissements enregistrés. Le suivi ne compte que les périodes d'interaction réelle (clics, frappe, scroll)."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const preset = presets[selectedPeriod];
              fetchStats(preset.from, preset.to);
            }}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin me-1.5" />
            ) : (
              <RefreshCw className="h-4 w-4 me-1.5" />
            )}
            Actualiser
          </Button>
        }
      />

      {/* Period selector */}
      <div className="flex flex-wrap gap-2">
        {presets.map((p, i) => (
          <Button
            key={p.label}
            variant={selectedPeriod === i ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedPeriod(i)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Temps actif total"
          value={summary ? formatDuration(summary.total_active_seconds) : "—"}
          icon={Clock}
          description="Somme du temps de travail actif"
        />
        <KpiCard
          title="Collaborateurs actifs"
          value={summary ? String(summary.active_collaborators) : "—"}
          icon={Users}
          description="Ayant eu au moins 1 heartbeat"
        />
        <KpiCard
          title="Établissements créés"
          value={summary ? String(summary.total_establishments) : "—"}
          icon={Building2}
          description="Via le wizard admin"
        />
        <KpiCard
          title="Moyenne / établissement"
          value={
            summary?.avg_seconds_per_establishment != null
              ? formatDuration(summary.avg_seconds_per_establishment)
              : "—"
          }
          icon={Timer}
          description="Temps moyen par création"
        />
      </div>

      {/* Collaborators table */}
      <Card>
        <CardContent className="p-0">
          {loading && !data ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <AdminDataTable
              columns={columns}
              data={data?.collaborators ?? []}
              searchPlaceholder="Rechercher un collaborateur..."
            />
          )}
        </CardContent>
      </Card>

      {/* Period info */}
      {data?.period ? (
        <p className="text-xs text-muted-foreground text-center">
          Période : {data.period.from} au {data.period.to}
          {" — "}
          Actualisation automatique toutes les 60 secondes
        </p>
      ) : null}
    </div>
  );
}
