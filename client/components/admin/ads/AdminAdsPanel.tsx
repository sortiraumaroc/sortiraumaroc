/**
 * Panneau d'administration des publicités
 *
 * Inclut:
 * - Vue d'ensemble (KPIs)
 * - File de modération
 * - Configuration des enchères
 * - Statistiques de revenus
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  BadgeCheck,
  Ban,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  DollarSign,
  Eye,
  FileEdit,
  Filter,
  Home,
  MousePointerClick,
  Pause,
  Play,
  RefreshCcw,
  Search,
  Settings2,
  TrendingUp,
  Wallet,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";

import {
  type AdModerationQueueItem,
  type AdCampaignDetail,
  type AdAuctionConfig,
  type AdRevenueStats,
  type AdOverview,
  getAdModerationQueue,
  getAdCampaignForModeration,
  moderateAdCampaign,
  listAllAdCampaigns,
  pauseAdCampaign,
  resumeAdCampaign,
  getAdAuctionConfigs,
  updateAdAuctionConfig,
  getAdRevenueStats,
  getAdOverview,
} from "@/lib/admin/adsApi";

import { AdminHomeTakeoverPanel } from "./AdminHomeTakeoverPanel";

// =============================================================================
// HELPERS
// =============================================================================

function formatCents(cents: number): string {
  return `${(cents / 100).toFixed(2)} MAD`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function getCampaignTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    sponsored_result: "Résultat sponsorisé",
    featured_pack: "Pack mise en avant",
    home_takeover: "Home takeover",
    push_notification: "Push notification",
    email_campaign: "Campagne email",
  };
  return labels[type] || type;
}

function getModerationStatusBadge(status: string) {
  const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode; label: string }> = {
    pending_review: { variant: "secondary", icon: <Clock className="h-3 w-3" />, label: "En attente" },
    approved: { variant: "default", icon: <CheckCircle2 className="h-3 w-3" />, label: "Approuvé" },
    rejected: { variant: "destructive", icon: <XCircle className="h-3 w-3" />, label: "Rejeté" },
    changes_requested: { variant: "outline", icon: <FileEdit className="h-3 w-3" />, label: "Modifications" },
    draft: { variant: "outline", icon: <FileEdit className="h-3 w-3" />, label: "Brouillon" },
  };
  const c = config[status] || { variant: "outline" as const, icon: null, label: status };
  return (
    <Badge variant={c.variant} className="gap-1">
      {c.icon}
      {c.label}
    </Badge>
  );
}

function getCampaignStatusBadge(status: string) {
  const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    active: { variant: "default", label: "Active" },
    paused: { variant: "secondary", label: "En pause" },
    completed: { variant: "outline", label: "Terminée" },
    pending: { variant: "secondary", label: "En attente" },
    draft: { variant: "outline", label: "Brouillon" },
  };
  const c = config[status] || { variant: "outline" as const, label: status };
  return <Badge variant={c.variant}>{c.label}</Badge>;
}

// =============================================================================
// OVERVIEW TAB
// =============================================================================

function OverviewTab() {
  const [overview, setOverview] = useState<AdOverview | null>(null);
  const [stats, setStats] = useState<AdRevenueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const refresh = async () => {
    setLoading(true);
    try {
      const [overviewRes, statsRes] = await Promise.all([
        getAdOverview(),
        getAdRevenueStats({ period: "month" }),
      ]);
      setOverview(overviewRes.overview);
      setStats(statsRes.stats);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: err instanceof Error ? err.message : "Erreur de chargement",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCcw className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              En attente
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {overview?.pending_moderation ?? 0}
            </div>
            <p className="text-xs text-slate-500">campagnes à modérer</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Actives
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {overview?.active_campaigns ?? 0}
            </div>
            <p className="text-xs text-slate-500">campagnes en cours</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Revenus du jour
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatCents(overview?.today_revenue_cents ?? 0)}
            </div>
            <p className="text-xs text-slate-500">clics + impressions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Revenus du mois
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-600">
              {formatCents(overview?.month_revenue_cents ?? 0)}
            </div>
            <p className="text-xs text-slate-500">total mensuel</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Solde total
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {formatCents(overview?.total_wallet_balance_cents ?? 0)}
            </div>
            <p className="text-xs text-slate-500">wallets annonceurs</p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Chart & Top Advertisers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue by Day */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenus quotidiens</CardTitle>
            <CardDescription>30 derniers jours</CardDescription>
          </CardHeader>
          <CardContent>
            {stats?.by_day && stats.by_day.length > 0 ? (
              <div className="space-y-2">
                {stats.by_day.slice(-10).map((day) => (
                  <div key={day.date} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{formatShortDate(day.date)}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-slate-500">{day.clicks} clics</span>
                      <span className="font-medium">{formatCents(day.revenue_cents)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 text-center py-4">Aucune donnée</p>
            )}
          </CardContent>
        </Card>

        {/* Top Advertisers */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top annonceurs</CardTitle>
            <CardDescription>Par dépenses ce mois</CardDescription>
          </CardHeader>
          <CardContent>
            {stats?.top_advertisers && stats.top_advertisers.length > 0 ? (
              <div className="space-y-3">
                {stats.top_advertisers.slice(0, 5).map((adv, idx) => (
                  <div key={adv.establishment_id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-medium">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="font-medium text-sm">{adv.establishment_name}</p>
                        <p className="text-xs text-slate-500">{adv.campaign_count} campagnes</p>
                      </div>
                    </div>
                    <span className="font-semibold text-sm">{formatCents(adv.spent_cents)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 text-center py-4">Aucun annonceur</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Revenue by Campaign Type */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revenus par type de campagne</CardTitle>
        </CardHeader>
        <CardContent>
          {stats?.by_campaign_type && stats.by_campaign_type.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {stats.by_campaign_type.map((ct) => (
                <div key={ct.type} className="p-3 rounded-lg bg-slate-50">
                  <p className="text-xs text-slate-500 mb-1">{getCampaignTypeLabel(ct.type)}</p>
                  <p className="font-semibold">{formatCents(ct.revenue_cents)}</p>
                  <p className="text-xs text-slate-400">{ct.clicks} clics</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 text-center py-4">Aucune donnée</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// MODERATION TAB
// =============================================================================

function ModerationTab() {
  const [queue, setQueue] = useState<AdModerationQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState<AdCampaignDetail | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [moderationDialog, setModerationDialog] = useState<{
    open: boolean;
    action: "approve" | "reject" | "request_changes";
    campaignId: string;
    reason: string;
    notes: string;
  }>({ open: false, action: "approve", campaignId: "", reason: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await getAdModerationQueue();
      setQueue(res.queue);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: err instanceof Error ? err.message : "Erreur de chargement",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const viewDetails = async (campaignId: string) => {
    try {
      const res = await getAdCampaignForModeration(campaignId);
      setSelectedCampaign(res.campaign);
      setDetailsOpen(true);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: err instanceof Error ? err.message : "Erreur de chargement",
      });
    }
  };

  const openModerationDialog = (campaignId: string, action: "approve" | "reject" | "request_changes") => {
    setModerationDialog({
      open: true,
      action,
      campaignId,
      reason: "",
      notes: "",
    });
  };

  const handleModerate = async () => {
    setSaving(true);
    try {
      await moderateAdCampaign(moderationDialog.campaignId, {
        action: moderationDialog.action,
        rejection_reason: moderationDialog.reason || undefined,
        admin_notes: moderationDialog.notes || undefined,
      });
      toast({
        title: "Succès",
        description: moderationDialog.action === "approve"
          ? "Campagne approuvée"
          : moderationDialog.action === "reject"
          ? "Campagne rejetée"
          : "Modifications demandées",
      });
      setModerationDialog({ ...moderationDialog, open: false });
      setDetailsOpen(false);
      await refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: err instanceof Error ? err.message : "Erreur",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">File de modération</h3>
          <p className="text-sm text-slate-500">{queue.length} campagne(s) en attente</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          <RefreshCcw className={`h-4 w-4 me-2 ${loading ? "animate-spin" : ""}`} />
          Rafraîchir
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Établissement</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Titre</TableHead>
              <TableHead>Budget</TableHead>
              <TableHead>Soumis le</TableHead>
              <TableHead className="text-end">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {queue.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.establishment_name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{getCampaignTypeLabel(item.type)}</Badge>
                </TableCell>
                <TableCell>{item.title}</TableCell>
                <TableCell>{formatCents(item.budget)}</TableCell>
                <TableCell className="text-sm text-slate-500">{formatDate(item.submitted_at)}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => void viewDetails(item.id)}>
                      <Eye className="h-4 w-4 me-1" />
                      Voir
                    </Button>
                    <Button size="sm" onClick={() => openModerationDialog(item.id, "approve")}>
                      <CheckCircle2 className="h-4 w-4 me-1" />
                      Approuver
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => openModerationDialog(item.id, "reject")}>
                      <XCircle className="h-4 w-4 me-1" />
                      Rejeter
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {queue.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                  <BadgeCheck className="h-8 w-8 mx-auto mb-2 text-green-500" />
                  Aucune campagne en attente de modération
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Détails de la campagne</DialogTitle>
            <DialogDescription>
              {selectedCampaign?.establishment?.name} - {selectedCampaign?.title}
            </DialogDescription>
          </DialogHeader>

          {selectedCampaign && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-xs text-slate-500">Type</Label>
                  <p className="font-medium">{getCampaignTypeLabel(selectedCampaign.type)}</p>
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Statut</Label>
                  <div>{getModerationStatusBadge(selectedCampaign.moderation_status)}</div>
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Budget total</Label>
                  <p className="font-medium">{formatCents(selectedCampaign.budget)}</p>
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Enchère</Label>
                  <p className="font-medium">
                    {selectedCampaign.bid_amount_cents
                      ? formatCents(selectedCampaign.bid_amount_cents)
                      : "Non définie"}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Budget quotidien</Label>
                  <p className="font-medium">
                    {selectedCampaign.daily_budget_cents
                      ? formatCents(selectedCampaign.daily_budget_cents)
                      : "Illimité"}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Modèle facturation</Label>
                  <p className="font-medium">{selectedCampaign.billing_model.toUpperCase()}</p>
                </div>
              </div>

              {selectedCampaign.targeting && (
                <div>
                  <Label className="text-xs text-slate-500">Ciblage</Label>
                  <pre className="mt-1 p-3 bg-slate-50 rounded text-xs overflow-auto max-h-32">
                    {JSON.stringify(selectedCampaign.targeting, null, 2)}
                  </pre>
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <Button onClick={() => openModerationDialog(selectedCampaign.id, "approve")}>
                  <CheckCircle2 className="h-4 w-4 me-2" />
                  Approuver
                </Button>
                <Button variant="outline" onClick={() => openModerationDialog(selectedCampaign.id, "request_changes")}>
                  <FileEdit className="h-4 w-4 me-2" />
                  Demander modifications
                </Button>
                <Button variant="destructive" onClick={() => openModerationDialog(selectedCampaign.id, "reject")}>
                  <XCircle className="h-4 w-4 me-2" />
                  Rejeter
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Moderation Action Dialog */}
      <Dialog open={moderationDialog.open} onOpenChange={(open) => setModerationDialog({ ...moderationDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {moderationDialog.action === "approve" && "Approuver la campagne"}
              {moderationDialog.action === "reject" && "Rejeter la campagne"}
              {moderationDialog.action === "request_changes" && "Demander des modifications"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {moderationDialog.action !== "approve" && (
              <div>
                <Label>
                  {moderationDialog.action === "reject" ? "Motif de rejet *" : "Modifications demandées *"}
                </Label>
                <Textarea
                  value={moderationDialog.reason}
                  onChange={(e) => setModerationDialog({ ...moderationDialog, reason: e.target.value })}
                  placeholder={moderationDialog.action === "reject"
                    ? "Expliquez pourquoi cette campagne est rejetée..."
                    : "Décrivez les modifications nécessaires..."}
                  rows={3}
                />
              </div>
            )}
            <div>
              <Label>Notes internes (optionnel)</Label>
              <Textarea
                value={moderationDialog.notes}
                onChange={(e) => setModerationDialog({ ...moderationDialog, notes: e.target.value })}
                placeholder="Notes visibles uniquement par les admins..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModerationDialog({ ...moderationDialog, open: false })}>
              Annuler
            </Button>
            <Button
              variant={moderationDialog.action === "reject" ? "destructive" : "default"}
              onClick={() => void handleModerate()}
              disabled={saving || (moderationDialog.action !== "approve" && !moderationDialog.reason.trim())}
            >
              {saving ? "En cours..." : "Confirmer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =============================================================================
// CAMPAIGNS TAB
// =============================================================================

function CampaignsTab() {
  const [campaigns, setCampaigns] = useState<AdCampaignDetail[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    moderation_status: "",
    type: "",
  });
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const { toast } = useToast();

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await listAllAdCampaigns({
        ...filters,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      setCampaigns(res.campaigns);
      setTotal(res.total);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: err instanceof Error ? err.message : "Erreur de chargement",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [page, filters]);

  const handlePause = async (campaignId: string) => {
    try {
      await pauseAdCampaign(campaignId);
      toast({ title: "Campagne mise en pause" });
      await refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: err instanceof Error ? err.message : "Erreur",
      });
    }
  };

  const handleResume = async (campaignId: string) => {
    try {
      await resumeAdCampaign(campaignId);
      toast({ title: "Campagne relancée" });
      await refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: err instanceof Error ? err.message : "Erreur",
      });
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Rechercher..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="ps-9"
          />
        </div>
        <Select value={filters.status || "__all__"} onValueChange={(v) => setFilters({ ...filters, status: v === "__all__" ? "" : v })}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Tous statuts</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">En pause</SelectItem>
            <SelectItem value="completed">Terminée</SelectItem>
            <SelectItem value="draft">Brouillon</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.moderation_status || "__all__"} onValueChange={(v) => setFilters({ ...filters, moderation_status: v === "__all__" ? "" : v })}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Modération" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Toutes</SelectItem>
            <SelectItem value="pending_review">En attente</SelectItem>
            <SelectItem value="approved">Approuvée</SelectItem>
            <SelectItem value="rejected">Rejetée</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.type || "__all__"} onValueChange={(v) => setFilters({ ...filters, type: v === "__all__" ? "" : v })}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Tous types</SelectItem>
            <SelectItem value="sponsored_result">Résultat sponsorisé</SelectItem>
            <SelectItem value="featured_pack">Pack mise en avant</SelectItem>
            <SelectItem value="home_takeover">Home takeover</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Établissement</TableHead>
              <TableHead>Campagne</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Modération</TableHead>
              <TableHead>Budget</TableHead>
              <TableHead>Dépensé</TableHead>
              <TableHead className="text-end">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <div>
                    <p className="font-medium">{c.establishment?.name}</p>
                    <p className="text-xs text-slate-500">{c.establishment?.city}</p>
                  </div>
                </TableCell>
                <TableCell className="font-medium">{c.title}</TableCell>
                <TableCell>
                  <Badge variant="outline">{getCampaignTypeLabel(c.type)}</Badge>
                </TableCell>
                <TableCell>{getCampaignStatusBadge(c.status)}</TableCell>
                <TableCell>{getModerationStatusBadge(c.moderation_status)}</TableCell>
                <TableCell>{formatCents(c.budget)}</TableCell>
                <TableCell>
                  <div>
                    <p>{formatCents(c.spent_cents)}</p>
                    <p className="text-xs text-slate-500">
                      {c.budget > 0 ? `${Math.round((c.spent_cents / c.budget) * 100)}%` : "0%"}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    {c.status === "active" && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="ghost" onClick={() => void handlePause(c.id)}>
                              <Pause className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Mettre en pause</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {c.status === "paused" && c.moderation_status === "approved" && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="ghost" onClick={() => void handleResume(c.id)}>
                              <Play className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Relancer</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {campaigns.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                  Aucune campagne trouvée
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            {total} campagne(s) - Page {page} / {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// CONFIGURATION TAB
// =============================================================================

function ConfigurationTab() {
  const [configs, setConfigs] = useState<AdAuctionConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editConfig, setEditConfig] = useState<AdAuctionConfig | null>(null);
  const [editValues, setEditValues] = useState<Partial<AdAuctionConfig>>({});
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await getAdAuctionConfigs();
      setConfigs(res.configs);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: err instanceof Error ? err.message : "Erreur de chargement",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const openEdit = (config: AdAuctionConfig) => {
    setEditConfig(config);
    setEditValues({
      min_bid_cents: config.min_bid_cents,
      suggested_bid_cents: config.suggested_bid_cents,
      max_bid_cents: config.max_bid_cents,
      min_budget_cents: config.min_budget_cents,
      min_daily_budget_cents: config.min_daily_budget_cents,
      demand_multiplier: config.demand_multiplier,
      max_positions: config.max_positions,
      is_active: config.is_active,
    });
  };

  const handleSave = async () => {
    if (!editConfig) return;
    setSaving(true);
    try {
      await updateAdAuctionConfig(editConfig.product_type, editValues);
      toast({ title: "Configuration mise à jour" });
      setEditConfig(null);
      await refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: err instanceof Error ? err.message : "Erreur",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCcw className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Configuration des enchères</h3>
          <p className="text-sm text-slate-500">Paramètres pour chaque type de produit publicitaire</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          <RefreshCcw className="h-4 w-4 me-2" />
          Rafraîchir
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {configs.map((config) => (
          <Card key={config.id} className={!config.is_active ? "opacity-60" : ""}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{getCampaignTypeLabel(config.product_type)}</CardTitle>
                <Badge variant={config.is_active ? "default" : "secondary"}>
                  {config.is_active ? "Actif" : "Inactif"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Enchère min</span>
                <span className="font-medium">{formatCents(config.min_bid_cents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Enchère suggérée</span>
                <span className="font-medium">{formatCents(config.suggested_bid_cents)}</span>
              </div>
              {config.max_bid_cents && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Enchère max</span>
                  <span className="font-medium">{formatCents(config.max_bid_cents)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Budget min</span>
                <span className="font-medium">{formatCents(config.min_budget_cents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Multiplicateur demande</span>
                <span className="font-medium">×{config.demand_multiplier}</span>
              </div>
              {config.max_positions && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Positions max</span>
                  <span className="font-medium">{config.max_positions}</span>
                </div>
              )}
              <div className="pt-2">
                <Button variant="outline" size="sm" className="w-full" onClick={() => openEdit(config)}>
                  <Settings2 className="h-4 w-4 me-2" />
                  Modifier
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editConfig} onOpenChange={(open) => !open && setEditConfig(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Modifier {editConfig ? getCampaignTypeLabel(editConfig.product_type) : ""}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Enchère minimum (centimes)</Label>
                <Input
                  type="number"
                  value={editValues.min_bid_cents ?? ""}
                  onChange={(e) => setEditValues({ ...editValues, min_bid_cents: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Enchère suggérée (centimes)</Label>
                <Input
                  type="number"
                  value={editValues.suggested_bid_cents ?? ""}
                  onChange={(e) => setEditValues({ ...editValues, suggested_bid_cents: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Enchère maximum (centimes)</Label>
                <Input
                  type="number"
                  value={editValues.max_bid_cents ?? ""}
                  onChange={(e) => setEditValues({ ...editValues, max_bid_cents: e.target.value ? Number(e.target.value) : null })}
                  placeholder="Aucune limite"
                />
              </div>
              <div>
                <Label>Budget minimum (centimes)</Label>
                <Input
                  type="number"
                  value={editValues.min_budget_cents ?? ""}
                  onChange={(e) => setEditValues({ ...editValues, min_budget_cents: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Budget quotidien min (centimes)</Label>
                <Input
                  type="number"
                  value={editValues.min_daily_budget_cents ?? ""}
                  onChange={(e) => setEditValues({ ...editValues, min_daily_budget_cents: e.target.value ? Number(e.target.value) : null })}
                  placeholder="Pas de minimum"
                />
              </div>
              <div>
                <Label>Multiplicateur demande</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={editValues.demand_multiplier ?? ""}
                  onChange={(e) => setEditValues({ ...editValues, demand_multiplier: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Positions max</Label>
                <Input
                  type="number"
                  value={editValues.max_positions ?? ""}
                  onChange={(e) => setEditValues({ ...editValues, max_positions: e.target.value ? Number(e.target.value) : null })}
                  placeholder="Illimité"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={editValues.is_active ?? false}
                  onChange={(e) => setEditValues({ ...editValues, is_active: e.target.checked })}
                  className="h-4 w-4"
                />
                <Label htmlFor="is_active">Produit actif</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditConfig(null)}>
              Annuler
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function AdminAdsPanel() {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-grid">
          <TabsTrigger value="overview" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Vue d'ensemble</span>
          </TabsTrigger>
          <TabsTrigger value="moderation" className="gap-2">
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">Modération</span>
          </TabsTrigger>
          <TabsTrigger value="campaigns" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Campagnes</span>
          </TabsTrigger>
          <TabsTrigger value="home-takeover" className="gap-2">
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline">Home Takeover</span>
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-2">
            <Settings2 className="h-4 w-4" />
            <span className="hidden sm:inline">Configuration</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewTab />
        </TabsContent>

        <TabsContent value="moderation" className="mt-6">
          <ModerationTab />
        </TabsContent>

        <TabsContent value="campaigns" className="mt-6">
          <CampaignsTab />
        </TabsContent>

        <TabsContent value="home-takeover" className="mt-6">
          <AdminHomeTakeoverPanel />
        </TabsContent>

        <TabsContent value="config" className="mt-6">
          <ConfigurationTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
