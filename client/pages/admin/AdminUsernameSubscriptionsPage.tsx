import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Link2,
  Plus,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";

import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { RefreshIconButton } from "@/components/ui/refresh-icon-button";
import {
  AdminApiError,
  listAdminUsernameSubscriptions,
  getAdminUsernameSubscriptionStats,
  extendAdminUsernameSubscription,
  cancelAdminUsernameSubscription,
  type AdminUsernameSubscription,
  type AdminUsernameSubscriptionStats,
} from "@/lib/adminApi";
import { formatMoney } from "@/lib/money";
import { formatLeJjMmAaAHeure } from "@shared/datetime";

type Row = {
  id: string;
  establishmentId: string;
  establishmentName: string;
  username: string | null;
  status: string;
  isTrial: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  trialEndsAt: string | null;
  gracePeriodEndsAt: string | null;
  daysRemaining: number | undefined;
  priceCents: number;
  currency: string;
  createdAt: string;
  createdAtIso: string;
};

function statusBadge(status: string, isTrial: boolean) {
  const s = String(status ?? "").toLowerCase();
  if (s === "trial")
    return {
      label: "Essai",
      cls: "bg-blue-100 text-blue-700 border-blue-200",
      icon: Sparkles,
    };
  if (s === "active")
    return {
      label: "Actif",
      cls: "bg-emerald-100 text-emerald-700 border-emerald-200",
      icon: CheckCircle2,
    };
  if (s === "grace_period")
    return {
      label: "Grace Period",
      cls: "bg-amber-100 text-amber-700 border-amber-200",
      icon: AlertTriangle,
    };
  if (s === "expired")
    return {
      label: "Expire",
      cls: "bg-red-100 text-red-700 border-red-200",
      icon: XCircle,
    };
  if (s === "cancelled")
    return {
      label: "Annule",
      cls: "bg-slate-100 text-slate-700 border-slate-200",
      icon: XCircle,
    };
  if (s === "pending")
    return {
      label: "En attente",
      cls: "bg-yellow-100 text-yellow-700 border-yellow-200",
      icon: Clock,
    };
  return {
    label: s,
    cls: "bg-slate-100 text-slate-700 border-slate-200",
    icon: AlertCircle,
  };
}

function formatLocalYmdHm(iso: string | null): string {
  if (!iso) return "—";
  return formatLeJjMmAaAHeure(iso);
}

function mapToRow(item: AdminUsernameSubscription): Row {
  return {
    id: item.id,
    establishmentId: item.establishment_id,
    establishmentName: item.establishment_name || item.establishment_id.slice(0, 8),
    username: item.username,
    status: item.status,
    isTrial: item.is_trial,
    startsAt: item.starts_at,
    expiresAt: item.expires_at,
    trialEndsAt: item.trial_ends_at,
    gracePeriodEndsAt: item.grace_period_ends_at,
    daysRemaining: item.days_remaining,
    priceCents: item.price_cents,
    currency: item.currency,
    createdAt: formatLocalYmdHm(item.created_at),
    createdAtIso: item.created_at,
  };
}

export function AdminUsernameSubscriptionsPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<AdminUsernameSubscription[]>([]);
  const [stats, setStats] = useState<AdminUsernameSubscriptionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [total, setTotal] = useState(0);

  // Action dialogs
  const [extendingId, setExtendingId] = useState<string | null>(null);
  const [extendDays, setExtendDays] = useState("30");
  const [extendReason, setExtendReason] = useState("");
  const [extending, setExtending] = useState(false);

  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await getAdminUsernameSubscriptionStats(undefined);
      setStats(res.stats);
    } catch (e) {
      console.error("Failed to load stats:", e);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAdminUsernameSubscriptions(undefined, {
        status: statusFilter && statusFilter !== "all" ? statusFilter : undefined,
        limit: 500,
      });
      setItems(res.subscriptions ?? []);
      setTotal(res.total ?? 0);
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
          ? e.message
          : String(e);
      setError(msg);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const handleExtend = (row: Row) => {
    setExtendingId(row.id);
    setExtendDays("30");
    setExtendReason("");
  };

  const handleCancel = (row: Row) => {
    setCancellingId(row.id);
    setCancelReason("");
  };

  const handleExtendSave = async () => {
    if (!extendingId) return;
    setExtending(true);
    try {
      const days = parseInt(extendDays, 10);
      if (isNaN(days) || days <= 0) {
        throw new Error("Nombre de jours invalide");
      }
      await extendAdminUsernameSubscription(
        undefined,
        extendingId,
        days,
        extendReason || undefined,
      );
      toast({
        title: "Abonnement prolonge",
        description: `L'abonnement a ete prolonge de ${days} jours.`,
      });
      setExtendingId(null);
      void load();
      void loadStats();
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
          ? e.message
          : String(e);
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setExtending(false);
    }
  };

  const handleCancelSave = async () => {
    if (!cancellingId) return;
    setCancelling(true);
    try {
      await cancelAdminUsernameSubscription(
        undefined,
        cancellingId,
        cancelReason || undefined,
      );
      toast({
        title: "Abonnement annule",
        description: "L'abonnement a ete annule.",
      });
      setCancellingId(null);
      void load();
      void loadStats();
    } catch (e) {
      const msg =
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
          ? e.message
          : String(e);
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  };

  const rows = useMemo(() => items.map(mapToRow), [items]);

  const columns: ColumnDef<Row>[] = [
    {
      accessorKey: "establishmentName",
      header: "Etablissement",
      cell: (info) => {
        const row = info.row.original;
        return (
          <div className="flex flex-col">
            <span className="font-medium">{row.establishmentName}</span>
            <span className="text-xs text-slate-500 font-mono">
              {row.establishmentId.slice(0, 8)}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "username",
      header: "Username",
      cell: (info) => {
        const username = info.getValue() as string | null;
        if (!username) return <span className="text-slate-400">—</span>;
        return (
          <span className="font-mono text-primary font-medium">@{username}</span>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Statut",
      cell: (info) => {
        const row = info.row.original;
        const st = statusBadge(row.status, row.isTrial);
        const Icon = st.icon;
        return (
          <Badge className={`${st.cls} gap-1.5`}>
            <Icon className="w-3 h-3" />
            {st.label}
          </Badge>
        );
      },
    },
    {
      accessorKey: "daysRemaining",
      header: "Jours restants",
      cell: (info) => {
        const days = info.getValue() as number | undefined;
        if (days === undefined) return <span className="text-slate-400">—</span>;
        const row = info.row.original;
        if (row.status === "expired" || row.status === "cancelled") {
          return <span className="text-red-600 font-medium">0</span>;
        }
        if (days <= 7) {
          return <span className="text-red-600 font-bold">{days}j</span>;
        }
        if (days <= 30) {
          return <span className="text-amber-600 font-medium">{days}j</span>;
        }
        return <span className="text-slate-700">{days}j</span>;
      },
    },
    {
      accessorKey: "expiresAt",
      header: "Expiration",
      cell: (info) => {
        const row = info.row.original;
        if (row.status === "trial" && row.trialEndsAt) {
          return (
            <div className="flex flex-col text-xs">
              <span className="text-blue-600">
                Fin essai: {formatLocalYmdHm(row.trialEndsAt)}
              </span>
            </div>
          );
        }
        if (row.expiresAt) {
          return (
            <span className="text-xs">{formatLocalYmdHm(row.expiresAt)}</span>
          );
        }
        return <span className="text-slate-400">—</span>;
      },
    },
    {
      accessorKey: "priceCents",
      header: "Prix",
      cell: (info) => {
        const row = info.row.original;
        if (row.isTrial && row.priceCents === 0) {
          return <span className="text-blue-600 font-medium">Gratuit</span>;
        }
        return formatMoney(row.priceCents, row.currency);
      },
    },
    {
      accessorKey: "createdAt",
      header: "Cree le",
      cell: (info) => info.getValue() as string,
    },
    {
      id: "actions",
      header: "Actions",
      cell: (info) => {
        const row = info.row.original;
        const canExtend = ["active", "trial", "grace_period"].includes(row.status);
        const canCancel = ["active", "trial", "grace_period"].includes(row.status);
        return (
          <div className="flex items-center gap-1">
            {canExtend && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleExtend(row)}
              >
                <Plus className="w-3 h-3 me-1" />
                Prolonger
              </Button>
            )}
            {canCancel && (
              <Button
                size="sm"
                variant="outline"
                className="text-red-600 hover:text-red-700"
                onClick={() => handleCancel(row)}
              >
                Annuler
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  const extendingItem = items.find((i) => i.id === extendingId);
  const cancellingItem = items.find((i) => i.id === cancellingId);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Abonnements Liens Personnalises"
        description="Gerez les abonnements au service de lien personnalise book.sam.ma/@username"
        actions={
          <RefreshIconButton
            onClick={() => {
              void load();
              void loadStats();
            }}
            loading={loading}
          />
        }
      />

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                Abonnements Actifs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">
                {stats.active_count}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                + {stats.trial_count} essais
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-500" />
                MRR
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {formatMoney(stats.mrr_cents, "MAD")}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                ARR: {formatMoney(stats.arr_cents, "MAD")}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Grace Period
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">
                {stats.grace_period_count}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                En attente de renouvellement
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-purple-500" />
                Expirations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">
                {stats.expiring_this_month}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Ce mois • {stats.expiring_next_month} mois prochain
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {error ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6 text-red-700 text-sm flex items-start gap-3">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>{error}</div>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-slate-700">Statut :</span>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Actifs</SelectItem>
            <SelectItem value="trial">Essais</SelectItem>
            <SelectItem value="grace_period">Grace Period</SelectItem>
            <SelectItem value="expired">Expires</SelectItem>
            <SelectItem value="cancelled">Annules</SelectItem>
            <SelectItem value="all">Tous</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-slate-500">
          {total} abonnement{total > 1 ? "s" : ""}
        </span>
      </div>

      <AdminDataTable<Row> columns={columns} data={rows} isLoading={loading} />

      {/* Extend dialog */}
      {extendingItem && extendingId ? (
        <Dialog
          open={!!extendingId}
          onOpenChange={(open) => !open && setExtendingId(null)}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Prolonger l'abonnement</DialogTitle>
              <DialogDescription>
                {extendingItem.establishment_name || extendingItem.establishment_id.slice(0, 8)}
                {extendingItem.username && (
                  <span className="font-mono ms-2">@{extendingItem.username}</span>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="extend-days" className="text-sm font-semibold">
                  Nombre de jours
                </Label>
                <Input
                  id="extend-days"
                  type="number"
                  min="1"
                  max="365"
                  value={extendDays}
                  onChange={(e) => setExtendDays(e.target.value)}
                  placeholder="30"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="extend-reason" className="text-sm font-semibold">
                  Raison (optionnel)
                </Label>
                <Textarea
                  id="extend-reason"
                  placeholder="Ex: Geste commercial suite a un probleme technique..."
                  value={extendReason}
                  onChange={(e) => setExtendReason(e.target.value)}
                  className="min-h-20"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setExtendingId(null)}
                disabled={extending}
              >
                Annuler
              </Button>
              <Button onClick={() => void handleExtendSave()} disabled={extending}>
                {extending ? "Sauvegarde..." : "Prolonger"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}

      {/* Cancel dialog */}
      {cancellingItem && cancellingId ? (
        <Dialog
          open={!!cancellingId}
          onOpenChange={(open) => !open && setCancellingId(null)}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Annuler l'abonnement</DialogTitle>
              <DialogDescription>
                {cancellingItem.establishment_name || cancellingItem.establishment_id.slice(0, 8)}
                {cancellingItem.username && (
                  <span className="font-mono ms-2">@{cancellingItem.username}</span>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm">
              <div className="font-semibold text-amber-900 mb-1">Attention</div>
              <div className="text-amber-800">
                L'abonnement restera actif jusqu'a sa date d'expiration mais les
                rappels de renouvellement seront desactives.
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cancel-reason" className="text-sm font-semibold">
                Raison (optionnel)
              </Label>
              <Textarea
                id="cancel-reason"
                placeholder="Ex: Demande du client..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="min-h-20"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setCancellingId(null)}
                disabled={cancelling}
              >
                Retour
              </Button>
              <Button
                variant="destructive"
                onClick={() => void handleCancelSave()}
                disabled={cancelling}
              >
                {cancelling ? "Annulation..." : "Confirmer l'annulation"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
