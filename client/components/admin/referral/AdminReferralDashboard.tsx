/**
 * Dashboard Admin pour le programme de parrainage
 */

import { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Users,
  Wallet,
  TrendingUp,
  Settings,
  CheckCircle,
  XCircle,
  Clock,
  Pause,
  RefreshCw,
  ChevronRight,
  Search,
  MoreHorizontal,
  Eye,
  Ban,
  DollarSign,
  AlertCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "@/hooks/use-toast";

import {
  listReferralPartners,
  updateReferralPartnerStatus,
  getReferralConfig,
  updateReferralConfig,
  getReferralStats,
  type ReferralPartnerWithStats,
  type ReferralConfig,
  type ReferralStats,
} from "@/lib/referral/adminApi";
import {
  formatCentsToDH,
  getStatusColor,
  getStatusLabel,
  type ReferralPartnerStatus,
} from "@/lib/referral/api";

// =============================================================================
// STATS OVERVIEW
// =============================================================================

function StatsOverview({ stats, isLoading }: { stats: ReferralStats | null; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: "Parrains actifs",
      value: stats?.partners.by_status?.active || 0,
      subtitle: `${stats?.partners.this_month || 0} nouveaux ce mois`,
      icon: Users,
      color: "text-blue-600",
    },
    {
      title: "Filleuls",
      value: stats?.referrees.total || 0,
      subtitle: `${stats?.referrees.this_month || 0} ce mois`,
      icon: TrendingUp,
      color: "text-green-600",
    },
    {
      title: "Commissions ce mois",
      value: formatCentsToDH(stats?.commissions.this_month_total_cents || 0),
      subtitle: `${stats?.commissions.total_count || 0} total`,
      icon: Wallet,
      color: "text-purple-600",
    },
    {
      title: "En attente de validation",
      value: stats?.partners.by_status?.pending || 0,
      subtitle: "Demandes à traiter",
      icon: Clock,
      color: "text-yellow-600",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            <card.icon className={`h-4 w-4 ${card.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
            <p className="text-xs text-muted-foreground">{card.subtitle}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// =============================================================================
// PARTNERS LIST
// =============================================================================

type PartnerAction = {
  type: "approve" | "reject" | "suspend" | "reactivate";
  partner: ReferralPartnerWithStats;
};

function PartnersList({
  onPartnerUpdated,
}: {
  onPartnerUpdated: () => void;
}) {
  const [partners, setPartners] = useState<ReferralPartnerWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<ReferralPartnerStatus | "all">("all");
  const [action, setAction] = useState<PartnerAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const loadPartners = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listReferralPartners({
        status: statusFilter === "all" ? undefined : statusFilter,
        page,
        limit: 20,
      });
      setPartners(data.partners);
      setTotalPages(data.pagination.total_pages);
    } catch (err) {
      console.error("Error loading partners:", err);
      toast({
        title: "Erreur",
        description: "Impossible de charger les parrains",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => {
    loadPartners();
  }, [loadPartners]);

  const handleAction = async () => {
    if (!action) return;

    if (action.type === "reject" && !rejectionReason.trim()) {
      toast({
        title: "Erreur",
        description: "Veuillez fournir une raison de refus",
        variant: "destructive",
      });
      return;
    }

    setActionLoading(true);

    try {
      const newStatus =
        action.type === "approve" || action.type === "reactivate"
          ? "active"
          : action.type === "reject"
          ? "rejected"
          : "suspended";

      const result = await updateReferralPartnerStatus(action.partner.id, {
        status: newStatus,
        rejection_reason: action.type === "reject" ? rejectionReason : undefined,
      });

      if (!result.ok) {
        throw new Error(result.error);
      }

      toast({
        title: "Succès",
        description: `Parrain ${action.type === "approve" ? "approuvé" : action.type === "reject" ? "refusé" : action.type === "suspend" ? "suspendu" : "réactivé"}`,
      });

      setAction(null);
      setRejectionReason("");
      loadPartners();
      onPartnerUpdated();
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Erreur lors de l'action",
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-4 items-center">
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v as ReferralPartnerStatus | "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filtrer par statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="pending">En attente</SelectItem>
            <SelectItem value="active">Actifs</SelectItem>
            <SelectItem value="suspended">Suspendus</SelectItem>
            <SelectItem value="rejected">Refusés</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={loadPartners}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Actualiser
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : partners.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          Aucun parrain trouvé
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Parrain</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Filleuls</TableHead>
              <TableHead>Gains</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {partners.map((partner) => (
              <TableRow key={partner.id}>
                <TableCell>
                  <div>
                    <div className="font-medium">
                      {partner.display_name || partner.user_name || "—"}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {partner.user_email || partner.user_phone || "—"}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <code className="text-primary font-semibold">
                    {partner.referral_code}
                  </code>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {partner.partner_type}
                  </Badge>
                </TableCell>
                <TableCell>{partner.referree_count}</TableCell>
                <TableCell>
                  <div className="font-medium">
                    {formatCentsToDH(partner.total_earned_cents || 0)}
                  </div>
                  {(partner.pending_cents || 0) > 0 && (
                    <div className="text-xs text-yellow-600">
                      {formatCentsToDH(partner.pending_cents)} en attente
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge className={getStatusColor(partner.status)}>
                    {getStatusLabel(partner.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {format(new Date(partner.requested_at), "dd/MM/yyyy", { locale: fr })}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem disabled>
                        <Eye className="h-4 w-4 mr-2" />
                        Voir détails
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {partner.status === "pending" && (
                        <>
                          <DropdownMenuItem
                            onClick={() => setAction({ type: "approve", partner })}
                            className="text-green-600"
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Approuver
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setAction({ type: "reject", partner })}
                            className="text-red-600"
                          >
                            <XCircle className="h-4 w-4 mr-2" />
                            Refuser
                          </DropdownMenuItem>
                        </>
                      )}
                      {partner.status === "active" && (
                        <DropdownMenuItem
                          onClick={() => setAction({ type: "suspend", partner })}
                          className="text-yellow-600"
                        >
                          <Pause className="h-4 w-4 mr-2" />
                          Suspendre
                        </DropdownMenuItem>
                      )}
                      {partner.status === "suspended" && (
                        <DropdownMenuItem
                          onClick={() => setAction({ type: "reactivate", partner })}
                          className="text-green-600"
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Réactiver
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Précédent
          </Button>
          <span className="py-2 px-4 text-sm">
            Page {page} sur {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Suivant
          </Button>
        </div>
      )}

      {/* Action Dialog */}
      <Dialog open={!!action} onOpenChange={(open) => !open && setAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action?.type === "approve" && "Approuver le parrain"}
              {action?.type === "reject" && "Refuser le parrain"}
              {action?.type === "suspend" && "Suspendre le parrain"}
              {action?.type === "reactivate" && "Réactiver le parrain"}
            </DialogTitle>
            <DialogDescription>
              {action?.partner.display_name || action?.partner.user_name} ({action?.partner.referral_code})
            </DialogDescription>
          </DialogHeader>

          {action?.type === "reject" && (
            <div className="space-y-2">
              <Label htmlFor="rejection-reason">Raison du refus *</Label>
              <Textarea
                id="rejection-reason"
                placeholder="Expliquez la raison du refus..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
              />
            </div>
          )}

          {action?.type === "approve" && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Le parrain pourra commencer à parrainer des utilisateurs et générer des commissions.
              </AlertDescription>
            </Alert>
          )}

          {action?.type === "suspend" && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Le parrain ne pourra plus générer de nouvelles commissions, mais ses commissions en cours seront conservées.
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(null)} disabled={actionLoading}>
              Annuler
            </Button>
            <Button
              onClick={handleAction}
              disabled={actionLoading}
              variant={action?.type === "reject" || action?.type === "suspend" ? "destructive" : "default"}
            >
              {actionLoading ? "Traitement..." : "Confirmer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =============================================================================
// CONFIG SECTION
// =============================================================================

function ConfigSection() {
  const [config, setConfig] = useState<ReferralConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [localConfig, setLocalConfig] = useState<Partial<ReferralConfig>>({});

  useEffect(() => {
    async function load() {
      try {
        const data = await getReferralConfig();
        setConfig(data.config);
        setLocalConfig(data.config);
      } catch (err) {
        console.error("Error loading config:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await updateReferralConfig({
        default_commission_percent: localConfig.default_commission_percent,
        default_commission_fixed_cents: localConfig.default_commission_fixed_cents,
        commission_mode: localConfig.commission_mode,
        commission_base: localConfig.commission_base,
        min_reservation_amount_cents: localConfig.min_reservation_amount_cents,
        min_commission_amount_cents: localConfig.min_commission_amount_cents,
        is_active: localConfig.is_active,
      });

      if (!result.ok) {
        throw new Error(result.error);
      }

      setConfig(result.config!);
      toast({
        title: "Succès",
        description: "Configuration mise à jour",
      });
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Erreur lors de la sauvegarde",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Skeleton className="h-96" />;
  }

  const hasChanges = JSON.stringify(localConfig) !== JSON.stringify(config);

  return (
    <div className="space-y-6">
      {/* Programme actif */}
      <Card>
        <CardHeader>
          <CardTitle>État du programme</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label>Programme de parrainage actif</Label>
              <p className="text-sm text-muted-foreground">
                Désactivez pour arrêter la génération de nouvelles commissions
              </p>
            </div>
            <Switch
              checked={localConfig.is_active ?? true}
              onCheckedChange={(checked) =>
                setLocalConfig((c) => ({ ...c, is_active: checked }))
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Taux de commission */}
      <Card>
        <CardHeader>
          <CardTitle>Taux de commission</CardTitle>
          <CardDescription>
            Configuration des commissions de parrainage par défaut
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Pourcentage par défaut (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={localConfig.default_commission_percent ?? ""}
                onChange={(e) =>
                  setLocalConfig((c) => ({
                    ...c,
                    default_commission_percent: e.target.value ? Number(e.target.value) : null,
                  }))
                }
                placeholder="Ex: 5"
              />
            </div>
            <div className="space-y-2">
              <Label>Montant fixe (DH)</Label>
              <Input
                type="number"
                min={0}
                step={1}
                value={localConfig.default_commission_fixed_cents ? localConfig.default_commission_fixed_cents / 100 : ""}
                onChange={(e) =>
                  setLocalConfig((c) => ({
                    ...c,
                    default_commission_fixed_cents: e.target.value ? Number(e.target.value) * 100 : null,
                  }))
                }
                placeholder="Ex: 10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Mode de calcul</Label>
            <Select
              value={localConfig.commission_mode}
              onValueChange={(v) =>
                setLocalConfig((c) => ({
                  ...c,
                  commission_mode: v as ReferralConfig["commission_mode"],
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Pourcentage uniquement</SelectItem>
                <SelectItem value="fixed">Montant fixe uniquement</SelectItem>
                <SelectItem value="both_max">Le plus élevé des deux</SelectItem>
                <SelectItem value="both_min">Le plus bas des deux</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Base de calcul</Label>
            <Select
              value={localConfig.commission_base}
              onValueChange={(v) =>
                setLocalConfig((c) => ({
                  ...c,
                  commission_base: v as ReferralConfig["commission_base"],
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deposit">Sur l'acompte</SelectItem>
                <SelectItem value="total">Sur le montant total</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Seuils */}
      <Card>
        <CardHeader>
          <CardTitle>Seuils</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Montant réservation minimum (DH)</Label>
              <Input
                type="number"
                min={0}
                value={(localConfig.min_reservation_amount_cents ?? 0) / 100}
                onChange={(e) =>
                  setLocalConfig((c) => ({
                    ...c,
                    min_reservation_amount_cents: Number(e.target.value) * 100,
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Pas de commission en dessous de ce montant
              </p>
            </div>
            <div className="space-y-2">
              <Label>Commission minimum (DH)</Label>
              <Input
                type="number"
                min={0}
                value={(localConfig.min_commission_amount_cents ?? 0) / 100}
                onChange={(e) =>
                  setLocalConfig((c) => ({
                    ...c,
                    min_commission_amount_cents: Number(e.target.value) * 100,
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Arrondi à 0 si en dessous de ce seuil
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || !hasChanges}>
          {saving ? "Enregistrement..." : "Enregistrer les modifications"}
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function AdminReferralDashboard() {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data = await getReferralStats();
      setStats(data);
    } catch (err) {
      console.error("Error loading stats:", err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Programme de parrainage</h1>
        <p className="text-muted-foreground">
          Gérez les parrains, les commissions et la configuration du programme
        </p>
      </div>

      {/* Stats */}
      <StatsOverview stats={stats} isLoading={statsLoading} />

      {/* Tabs */}
      <Tabs defaultValue="partners" className="space-y-4">
        <TabsList>
          <TabsTrigger value="partners">Parrains</TabsTrigger>
          <TabsTrigger value="commissions">Commissions</TabsTrigger>
          <TabsTrigger value="payouts">Paiements</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
        </TabsList>

        <TabsContent value="partners">
          <Card>
            <CardHeader>
              <CardTitle>Gestion des parrains</CardTitle>
              <CardDescription>
                Validez les demandes et gérez les comptes parrains
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PartnersList onPartnerUpdated={loadStats} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commissions">
          <Card>
            <CardHeader>
              <CardTitle>Commissions</CardTitle>
              <CardDescription>
                Historique de toutes les commissions générées
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                Liste des commissions (à implémenter)
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payouts">
          <Card>
            <CardHeader>
              <CardTitle>Paiements</CardTitle>
              <CardDescription>
                Gérez les paiements aux parrains
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                Gestion des paiements (à implémenter)
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config">
          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
              <CardDescription>
                Paramètres globaux du programme de parrainage
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ConfigSection />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
