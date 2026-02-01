/**
 * Onglet Publicité PRO
 *
 * Contient :
 * - Wallet (solde, recharge)
 * - Statistiques
 * - Liste des campagnes
 * - Création de campagne
 */

import { useEffect, useMemo, useState } from "react";
import {
  Wallet,
  TrendingUp,
  Eye,
  MousePointer,
  Plus,
  Pencil,
  Trash2,
  Send,
  Pause,
  Play,
  Copy,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
  Target,
  Calendar,
  Info,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

import {
  getAdWallet,
  listAdCampaigns,
  createAdCampaign,
  updateAdCampaign,
  submitAdCampaign,
  deleteAdCampaign,
  getAdAuctionConfig,
  getAdStats,
  type AdWallet,
  type AdCampaign,
  type AdAuctionConfig,
  type AdStats,
  type CreateCampaignRequest,
  initiateWalletRecharge,
} from "@/lib/pro/adsApi";
import { formatMoney } from "@/lib/money";
import type { Establishment, ProRole } from "@/lib/pro/types";

// =============================================================================
// TYPES & CONSTANTS
// =============================================================================

type Props = {
  establishment: Establishment;
  role: ProRole;
};

const CAMPAIGN_TYPES = [
  {
    value: "sponsored_results",
    label: "Résultats Sponsorisés",
    description: "Apparaissez en top 3 des résultats de recherche",
    billing: "CPC",
    icon: Search,
  },
  {
    value: "featured_pack",
    label: "Pack Mise en Avant",
    description: "Apparaissez dans les sections de la home (aléatoire)",
    billing: "CPM",
    icon: TrendingUp,
  },
];

const STATUS_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: "Brouillon", color: "bg-slate-100 text-slate-700", icon: Clock },
  pending_review: { label: "En attente", color: "bg-amber-100 text-amber-700", icon: Clock },
  approved: { label: "Approuvée", color: "bg-blue-100 text-blue-700", icon: CheckCircle2 },
  rejected: { label: "Rejetée", color: "bg-red-100 text-red-700", icon: XCircle },
  changes_requested: { label: "Modifications", color: "bg-orange-100 text-orange-700", icon: AlertCircle },
  active: { label: "Active", color: "bg-emerald-100 text-emerald-700", icon: Play },
  paused: { label: "En pause", color: "bg-amber-100 text-amber-700", icon: Pause },
  completed: { label: "Terminée", color: "bg-slate-100 text-slate-700", icon: CheckCircle2 },
  cancelled: { label: "Annulée", color: "bg-red-100 text-red-700", icon: XCircle },
};

function canManage(role: ProRole) {
  return role === "owner" || role === "marketing";
}

// =============================================================================
// RECHARGE DIALOG CONTENT
// =============================================================================

function RechargeDialogContent({
  wallet,
  establishmentId,
  onClose,
  toast,
}: {
  wallet: AdWallet | null;
  establishmentId: string;
  onClose: () => void;
  toast: (opts: { title: string; description?: string; variant?: "default" | "destructive" }) => void;
}) {
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [processing, setProcessing] = useState(false);

  const PRESET_AMOUNTS = [500, 1000, 2000, 5000];

  const handleRecharge = async (amount: number) => {
    if (amount < 100 || amount > 50000) {
      toast({
        title: "Montant invalide",
        description: "Le montant doit être entre 100 et 50 000 MAD",
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);
    try {
      const result = await initiateWalletRecharge(establishmentId, amount);

      if (result.payment_url) {
        toast({
          title: "Redirection vers le paiement",
          description: `Recharge de ${amount} MAD en cours...`,
        });
        // Rediriger vers LaCaissePay
        window.location.href = result.payment_url;
      }
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Erreur lors de la recharge",
        variant: "destructive",
      });
      setProcessing(false);
    }
  };

  const handleCustomRecharge = () => {
    const amount = parseFloat(customAmount);
    if (isNaN(amount) || amount < 100) {
      toast({
        title: "Montant invalide",
        description: "Veuillez entrer un montant d'au moins 100 MAD",
        variant: "destructive",
      });
      return;
    }
    handleRecharge(amount);
  };

  return (
    <>
      <div className="space-y-4 py-4">
        <div className="rounded-lg bg-slate-50 p-4 space-y-2">
          <div className="text-sm text-slate-600">Solde actuel</div>
          <div className="text-2xl font-bold text-emerald-600">
            {formatMoney(wallet?.balance_cents ?? 0, "MAD")}
          </div>
        </div>

        <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 space-y-3">
          <div className="text-sm font-medium text-primary">Choisissez un montant</div>
          <div className="grid grid-cols-2 gap-2">
            {PRESET_AMOUNTS.map((amount) => (
              <Button
                key={amount}
                variant={selectedAmount === amount ? "default" : "outline"}
                className="font-semibold"
                disabled={processing}
                onClick={() => {
                  setSelectedAmount(amount);
                  setCustomAmount("");
                  handleRecharge(amount);
                }}
              >
                {processing && selectedAmount === amount ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                {amount} MAD
              </Button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border p-4 space-y-3">
          <div className="text-sm font-medium">Ou saisissez un montant personnalisé</div>
          <div className="flex gap-2">
            <Input
              type="number"
              min={100}
              max={50000}
              placeholder="Montant (min 100 MAD)"
              value={customAmount}
              onChange={(e) => {
                setCustomAmount(e.target.value);
                setSelectedAmount(null);
              }}
              disabled={processing}
            />
            <Button
              onClick={handleCustomRecharge}
              disabled={processing || !customAmount}
            >
              {processing && selectedAmount === null && customAmount ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Payer
            </Button>
          </div>
        </div>

        <div className="text-xs text-slate-500 text-center space-y-1">
          <p>Paiement sécurisé par LaCaissePay</p>
          <p>Vous serez redirigé vers la page de paiement</p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={processing}>
          Annuler
        </Button>
      </DialogFooter>
    </>
  );
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ProAdsTab({ establishment, role }: Props) {
  const { toast } = useToast();
  const writable = canManage(role);

  // State
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState<AdWallet | null>(null);
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [stats, setStats] = useState<AdStats | null>(null);
  const [auctionConfigs, setAuctionConfigs] = useState<AdAuctionConfig[]>([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("__all__");
  const [typeFilter, setTypeFilter] = useState("__all__");
  const [currentPage, setCurrentPage] = useState(1);

  // Dialogs
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [rechargeDialogOpen, setRechargeDialogOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<AdCampaign | null>(null);

  // Form state
  const [formData, setFormData] = useState<Partial<CreateCampaignRequest>>({
    type: "sponsored_results",
    title: "",
    budget_cents: 50000,
    bid_amount_cents: undefined,
    daily_budget_cents: undefined,
    targeting: { keywords: [], cities: [] },
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Keywords input
  const [keywordInput, setKeywordInput] = useState("");
  const [cityInput, setCityInput] = useState("");

  // =============================================================================
  // DATA LOADING
  // =============================================================================

  const loadData = async () => {
    setLoading(true);
    try {
      const [walletRes, campaignsRes, statsRes, configRes] = await Promise.all([
        getAdWallet(establishment.id),
        listAdCampaigns(establishment.id),
        getAdStats(establishment.id),
        getAdAuctionConfig(establishment.id),
      ]);

      setWallet(walletRes.wallet);
      setCampaigns(campaignsRes.campaigns);
      setStats(statsRes.stats);
      setAuctionConfigs(Array.isArray(configRes.configs) ? configRes.configs : [configRes.configs]);
    } catch (error) {
      console.error("Error loading ads data:", error);
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Erreur de chargement",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [establishment.id]);

  // =============================================================================
  // FILTERED DATA
  // =============================================================================

  const filteredCampaigns = useMemo(() => {
    let result = [...campaigns];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((c) => c.title.toLowerCase().includes(q));
    }

    if (statusFilter !== "__all__") {
      result = result.filter((c) => c.status === statusFilter || c.moderation_status === statusFilter);
    }

    if (typeFilter !== "__all__") {
      result = result.filter((c) => c.type === typeFilter);
    }

    return result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [campaigns, searchQuery, statusFilter, typeFilter]);

  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.max(1, Math.ceil(filteredCampaigns.length / ITEMS_PER_PAGE));
  const paginatedCampaigns = filteredCampaigns.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // =============================================================================
  // CAMPAIGN ACTIONS
  // =============================================================================

  const handleCreate = async () => {
    // Validation
    const errors: Record<string, string> = {};

    if (!formData.title?.trim()) {
      errors.title = "Titre requis";
    }

    if (!formData.budget_cents || formData.budget_cents < 50000) {
      errors.budget = "Budget minimum: 500 MAD";
    }

    const config = auctionConfigs.find((c) => c.product_type === formData.type);
    if (formData.bid_amount_cents && config && formData.bid_amount_cents < config.min_bid_cents) {
      errors.bid = `Enchère minimum: ${(config.min_bid_cents / 100).toFixed(2)} MAD`;
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      const result = await createAdCampaign(establishment.id, {
        type: formData.type!,
        title: formData.title!.trim(),
        budget_cents: formData.budget_cents!,
        bid_amount_cents: formData.bid_amount_cents,
        daily_budget_cents: formData.daily_budget_cents,
        targeting: formData.targeting,
      });

      toast({
        title: "Campagne créée",
        description: `"${result.campaign.title}" a été créée en brouillon.`,
      });

      setCreateDialogOpen(false);
      resetForm();
      loadData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Erreur création",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitForReview = async (campaign: AdCampaign) => {
    try {
      await submitAdCampaign(establishment.id, campaign.id);
      toast({
        title: "Campagne soumise",
        description: "Votre campagne est en cours de modération.",
      });
      loadData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Erreur soumission",
        variant: "destructive",
      });
    }
  };

  const handleTogglePause = async (campaign: AdCampaign) => {
    const newStatus = campaign.status === "active" ? "paused" : "active";
    try {
      await updateAdCampaign(establishment.id, campaign.id, { status: newStatus });
      toast({
        title: newStatus === "paused" ? "Campagne mise en pause" : "Campagne activée",
      });
      loadData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Erreur",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedCampaign) return;

    try {
      await deleteAdCampaign(establishment.id, selectedCampaign.id);
      toast({
        title: "Campagne supprimée",
      });
      setDeleteDialogOpen(false);
      setSelectedCampaign(null);
      loadData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Erreur suppression",
        variant: "destructive",
      });
    }
  };

  const duplicateCampaign = (campaign: AdCampaign) => {
    setFormData({
      type: campaign.type,
      title: `${campaign.title} (copie)`,
      budget_cents: campaign.budget,
      bid_amount_cents: campaign.bid_amount_cents ?? undefined,
      daily_budget_cents: campaign.daily_budget_cents ?? undefined,
      targeting: campaign.targeting ?? { keywords: [], cities: [] },
    });
    setCreateDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      type: "sponsored_results",
      title: "",
      budget_cents: 50000,
      bid_amount_cents: undefined,
      daily_budget_cents: undefined,
      targeting: { keywords: [], cities: [] },
    });
    setFormErrors({});
    setKeywordInput("");
    setCityInput("");
  };

  // Keywords management
  const addKeyword = () => {
    if (!keywordInput.trim()) return;
    const keywords = formData.targeting?.keywords ?? [];
    if (!keywords.includes(keywordInput.trim())) {
      setFormData((prev) => ({
        ...prev,
        targeting: {
          ...prev.targeting,
          keywords: [...keywords, keywordInput.trim()],
        },
      }));
    }
    setKeywordInput("");
  };

  const removeKeyword = (kw: string) => {
    setFormData((prev) => ({
      ...prev,
      targeting: {
        ...prev.targeting,
        keywords: (prev.targeting?.keywords ?? []).filter((k) => k !== kw),
      },
    }));
  };

  const addCity = () => {
    if (!cityInput.trim()) return;
    const cities = formData.targeting?.cities ?? [];
    if (!cities.includes(cityInput.trim())) {
      setFormData((prev) => ({
        ...prev,
        targeting: {
          ...prev.targeting,
          cities: [...cities, cityInput.trim()],
        },
      }));
    }
    setCityInput("");
  };

  const removeCity = (city: string) => {
    setFormData((prev) => ({
      ...prev,
      targeting: {
        ...prev.targeting,
        cities: (prev.targeting?.cities ?? []).filter((c) => c !== city),
      },
    }));
  };

  // =============================================================================
  // HELPERS
  // =============================================================================

  const getStatusDisplay = (campaign: AdCampaign) => {
    // Priorité au statut de modération pour les campagnes pas encore actives
    if (campaign.moderation_status === "pending_review") {
      return STATUS_LABELS.pending_review;
    }
    if (campaign.moderation_status === "rejected") {
      return STATUS_LABELS.rejected;
    }
    if (campaign.moderation_status === "changes_requested") {
      return STATUS_LABELS.changes_requested;
    }

    return STATUS_LABELS[campaign.status] ?? STATUS_LABELS.draft;
  };

  const getSelectedConfig = () => {
    return auctionConfigs.find((c) => c.product_type === formData.type);
  };

  const getEstimatedResults = () => {
    if (!formData.budget_cents) return null;

    const config = getSelectedConfig();
    const bid = formData.bid_amount_cents ?? config?.suggested_bid_cents ?? 200;

    if (formData.type === "sponsored_results") {
      // CPC: budget / bid = clics
      const clicks = Math.floor(formData.budget_cents / bid);
      return `~${clicks.toLocaleString("fr-FR")} clics estimés`;
    } else {
      // CPM: budget / (bid/1000) = impressions
      const impressions = Math.floor(formData.budget_cents / (bid / 1000));
      return `~${impressions.toLocaleString("fr-FR")} impressions estimées`;
    }
  };

  // =============================================================================
  // RENDER
  // =============================================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5" />
                Solde disponible
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-extrabold tabular-nums text-emerald-600">
                {formatMoney(wallet?.balance_cents ?? 0, "MAD")}
              </div>
              <Button
                variant="link"
                className="p-0 h-auto text-xs text-primary"
                onClick={() => setRechargeDialogOpen(true)}
              >
                + Recharger
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                Campagnes actives
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-extrabold tabular-nums">{stats?.active_campaigns ?? 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />
                Impressions totales
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-extrabold tabular-nums">
                {(stats?.total_impressions ?? 0).toLocaleString("fr-FR")}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
                <MousePointer className="w-3.5 h-3.5" />
                Clics totaux
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-extrabold tabular-nums">
                {(stats?.total_clicks ?? 0).toLocaleString("fr-FR")}
              </div>
              <div className="text-xs text-slate-500">CTR: {stats?.average_ctr ?? "0.00"}%</div>
            </CardContent>
          </Card>
        </div>

        {/* Dépenses ce mois */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-600">Dépenses ce mois</div>
                <div className="text-xl font-bold">{formatMoney(stats?.monthly_spent_cents ?? 0, "MAD")}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-slate-600">Dépenses totales</div>
                <div className="text-xl font-bold">{formatMoney(stats?.total_spent_cents ?? 0, "MAD")}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Campagnes */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <CardTitle className="text-base">Mes campagnes publicitaires</CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
                  <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                </Button>
                {writable && (
                  <Button size="sm" onClick={() => setCreateDialogOpen(true)} className="gap-1.5">
                    <Plus className="w-4 h-4" />
                    Nouvelle campagne
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Rechercher..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tous</SelectItem>
                  <SelectItem value="draft">Brouillon</SelectItem>
                  <SelectItem value="pending_review">En attente</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">En pause</SelectItem>
                  <SelectItem value="rejected">Rejetée</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tous les types</SelectItem>
                  {CAMPAIGN_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Table */}
            {paginatedCampaigns.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campagne</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead>Budget</TableHead>
                        <TableHead>Performance</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedCampaigns.map((campaign) => {
                        const statusDisplay = getStatusDisplay(campaign);
                        const StatusIcon = statusDisplay.icon;
                        const typeInfo = CAMPAIGN_TYPES.find((t) => t.value === campaign.type);

                        return (
                          <TableRow key={campaign.id}>
                            <TableCell>
                              <div className="font-semibold">{campaign.title}</div>
                              <div className="text-xs text-slate-500">
                                Créée le {new Date(campaign.created_at).toLocaleDateString("fr-FR")}
                              </div>
                              {campaign.rejection_reason && (
                                <div className="text-xs text-red-600 mt-1">
                                  Motif: {campaign.rejection_reason}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">{typeInfo?.label ?? campaign.type}</div>
                              <div className="text-xs text-slate-500">{typeInfo?.billing}</div>
                            </TableCell>
                            <TableCell>
                              <Badge className={`${statusDisplay.color} gap-1`}>
                                <StatusIcon className="w-3 h-3" />
                                {statusDisplay.label}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm font-medium">{formatMoney(campaign.budget, "MAD")}</div>
                              <div className="text-xs text-slate-500">
                                Dépensé: {formatMoney(campaign.spent_cents, "MAD")}
                              </div>
                              <div className="text-xs text-emerald-600">
                                Reste: {formatMoney(campaign.remaining_cents, "MAD")}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-xs space-y-0.5">
                                <div>Impr: {campaign.impressions.toLocaleString("fr-FR")}</div>
                                <div>Clics: {campaign.clicks.toLocaleString("fr-FR")}</div>
                                <div>
                                  CTR:{" "}
                                  {campaign.impressions > 0
                                    ? ((campaign.clicks / campaign.impressions) * 100).toFixed(2)
                                    : "0.00"}
                                  %
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-end gap-1">
                                {/* Soumettre pour modération */}
                                {writable &&
                                  ["draft", "rejected", "changes_requested"].includes(
                                    campaign.moderation_status
                                  ) && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-8 w-8 p-0 hover:bg-primary group"
                                          onClick={() => handleSubmitForReview(campaign)}
                                        >
                                          <Send className="w-4 h-4 text-primary group-hover:text-white" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Soumettre pour modération</TooltipContent>
                                    </Tooltip>
                                  )}

                                {/* Pause/Resume */}
                                {writable &&
                                  campaign.moderation_status === "approved" &&
                                  (campaign.status === "active" || campaign.status === "paused") && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className={`h-8 w-8 p-0 group ${campaign.status === "active" ? "hover:bg-amber-600" : "hover:bg-emerald-600"}`}
                                          onClick={() => handleTogglePause(campaign)}
                                        >
                                          {campaign.status === "active" ? (
                                            <Pause className="w-4 h-4 text-amber-600 group-hover:text-white" />
                                          ) : (
                                            <Play className="w-4 h-4 text-emerald-600 group-hover:text-white" />
                                          )}
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {campaign.status === "active" ? "Mettre en pause" : "Reprendre"}
                                      </TooltipContent>
                                    </Tooltip>
                                  )}

                                {/* Dupliquer */}
                                {writable && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 hover:bg-primary group"
                                        onClick={() => duplicateCampaign(campaign)}
                                      >
                                        <Copy className="w-4 h-4 group-hover:text-white" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Dupliquer</TooltipContent>
                                  </Tooltip>
                                )}

                                {/* Supprimer (si pas de dépenses) */}
                                {writable && campaign.spent_cents === 0 && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 text-red-600 hover:bg-red-600 group"
                                        onClick={() => {
                                          setSelectedCampaign(campaign);
                                          setDeleteDialogOpen(true);
                                        }}
                                      >
                                        <Trash2 className="w-4 h-4 group-hover:text-white" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Supprimer</TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between pt-2">
                  <div className="text-sm text-slate-600">
                    {filteredCampaigns.length} campagne{filteredCampaigns.length > 1 ? "s" : ""}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => p - 1)}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm text-slate-600">
                      {currentPage} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => p + 1)}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-slate-600">
                {searchQuery || statusFilter !== "__all__" || typeFilter !== "__all__"
                  ? "Aucune campagne ne correspond à vos critères."
                  : "Aucune campagne. Créez votre première campagne !"}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info card */}
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-primary mt-0.5" />
              <div className="text-sm text-slate-700">
                <p className="font-semibold">Comment ça marche ?</p>
                <ul className="mt-2 space-y-1 list-disc list-inside">
                  <li>
                    <strong>Résultats sponsorisés</strong> : Apparaissez dans le top 3 des recherches.
                    Facturation au clic (CPC).
                  </li>
                  <li>
                    <strong>Pack mise en avant</strong> : Apparaissez aléatoirement dans les sections de
                    la homepage. Facturation aux 1000 impressions (CPM).
                  </li>
                  <li>Toutes les campagnes sont modérées avant activation.</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Create Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nouvelle campagne publicitaire</DialogTitle>
              <DialogDescription>
                Configurez votre campagne. Elle sera soumise à modération avant activation.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Type */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Type de campagne</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {CAMPAIGN_TYPES.map((type) => {
                    const Icon = type.icon;
                    const isSelected = formData.type === type.value;
                    return (
                      <div
                        key={type.value}
                        onClick={() => setFormData((prev) => ({ ...prev, type: type.value }))}
                        className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <Icon className={`w-5 h-5 ${isSelected ? "text-primary" : "text-slate-600"}`} />
                          <span className="font-medium">{type.label}</span>
                        </div>
                        <p className="text-xs text-slate-600">{type.description}</p>
                        <Badge variant="secondary" className="mt-2">
                          {type.billing}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Title */}
              <div className="space-y-2">
                <Label className={formErrors.title ? "text-red-600" : ""}>Titre de la campagne *</Label>
                <Input
                  placeholder="Ex: Promo été 2024"
                  value={formData.title}
                  onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                  className={formErrors.title ? "border-red-500" : ""}
                />
                {formErrors.title && <p className="text-xs text-red-600">{formErrors.title}</p>}
              </div>

              {/* Budget & Bid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className={formErrors.budget ? "text-red-600" : ""}>Budget total (MAD) *</Label>
                  <Input
                    type="number"
                    min={500}
                    step={100}
                    value={(formData.budget_cents ?? 0) / 100}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        budget_cents: Math.round(parseFloat(e.target.value) * 100) || 0,
                      }))
                    }
                    className={formErrors.budget ? "border-red-500" : ""}
                  />
                  {formErrors.budget && <p className="text-xs text-red-600">{formErrors.budget}</p>}
                </div>

                <div className="space-y-2">
                  <Label>
                    Enchère ({formData.type === "sponsored_results" ? "par clic" : "pour 1000 imp."})
                  </Label>
                  <Input
                    type="number"
                    min={(getSelectedConfig()?.min_bid_cents ?? 200) / 100}
                    step={0.5}
                    placeholder={`Suggéré: ${((getSelectedConfig()?.suggested_bid_cents ?? 200) / 100).toFixed(2)}`}
                    value={formData.bid_amount_cents ? formData.bid_amount_cents / 100 : ""}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        bid_amount_cents: e.target.value
                          ? Math.round(parseFloat(e.target.value) * 100)
                          : undefined,
                      }))
                    }
                    className={formErrors.bid ? "border-red-500" : ""}
                  />
                  {formErrors.bid && <p className="text-xs text-red-600">{formErrors.bid}</p>}
                  {getSelectedConfig() && (
                    <p className="text-xs text-slate-500">
                      Min: {(getSelectedConfig()!.min_bid_cents / 100).toFixed(2)} MAD
                    </p>
                  )}
                </div>
              </div>

              {/* Daily budget */}
              <div className="space-y-2">
                <Label>Budget quotidien max (optionnel)</Label>
                <Input
                  type="number"
                  min={0}
                  step={50}
                  placeholder="Laisser vide pour pas de limite"
                  value={formData.daily_budget_cents ? formData.daily_budget_cents / 100 : ""}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      daily_budget_cents: e.target.value
                        ? Math.round(parseFloat(e.target.value) * 100)
                        : undefined,
                    }))
                  }
                />
              </div>

              {/* Estimation */}
              {getEstimatedResults() && (
                <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                  <div className="text-sm text-emerald-700 font-medium">{getEstimatedResults()}</div>
                </div>
              )}

              {/* Ciblage - Keywords (pour sponsored_results) */}
              {formData.type === "sponsored_results" && (
                <div className="space-y-2">
                  <Label>Mots-clés ciblés</Label>
                  <p className="text-xs text-slate-500">
                    Votre annonce apparaîtra quand ces mots-clés sont recherchés.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Ex: restaurant, spa, marrakech..."
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())}
                    />
                    <Button type="button" variant="outline" onClick={addKeyword}>
                      Ajouter
                    </Button>
                  </div>
                  {(formData.targeting?.keywords ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {formData.targeting!.keywords!.map((kw) => (
                        <Badge key={kw} variant="secondary" className="gap-1">
                          {kw}
                          <button onClick={() => removeKeyword(kw)} className="ml-1 hover:text-red-600">
                            ×
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Ciblage - Villes */}
              <div className="space-y-2">
                <Label>Villes ciblées (optionnel)</Label>
                <p className="text-xs text-slate-500">Laisser vide pour toutes les villes.</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Ex: Casablanca, Marrakech..."
                    value={cityInput}
                    onChange={(e) => setCityInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCity())}
                  />
                  <Button type="button" variant="outline" onClick={addCity}>
                    Ajouter
                  </Button>
                </div>
                {(formData.targeting?.cities ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {formData.targeting!.cities!.map((city) => (
                      <Badge key={city} variant="secondary" className="gap-1">
                        {city}
                        <button onClick={() => removeCity(city)} className="ml-1 hover:text-red-600">
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Solde warning */}
              {wallet && formData.budget_cents && wallet.balance_cents < formData.budget_cents && (
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <div className="text-sm text-amber-700">
                    <strong>Solde insuffisant.</strong> Vous devez recharger votre wallet de{" "}
                    {formatMoney(formData.budget_cents - wallet.balance_cents, "MAD")} pour soumettre
                    cette campagne.
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setCreateDialogOpen(false);
                  resetForm();
                }}
              >
                Annuler
              </Button>
              <Button onClick={handleCreate} disabled={submitting} className="gap-2">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Créer la campagne
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer la campagne ?</AlertDialogTitle>
              <AlertDialogDescription>
                Êtes-vous sûr de vouloir supprimer "{selectedCampaign?.title}" ? Cette action est
                irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Recharge Dialog */}
        <Dialog open={rechargeDialogOpen} onOpenChange={setRechargeDialogOpen}>
          <DialogContent className="sm:max-w-[450px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-primary" />
                Recharger mon wallet publicitaire
              </DialogTitle>
              <DialogDescription>
                Ajoutez des fonds à votre wallet pour lancer des campagnes publicitaires.
              </DialogDescription>
            </DialogHeader>

            <RechargeDialogContent
              wallet={wallet}
              establishmentId={establishment.id}
              onClose={() => setRechargeDialogOpen(false)}
              toast={toast}
            />
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
