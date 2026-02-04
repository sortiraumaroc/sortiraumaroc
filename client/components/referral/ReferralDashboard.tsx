/**
 * Dashboard Parrain
 *
 * Interface complète pour les parrains permettant de :
 * - Voir leur code de parrainage et le partager
 * - Consulter leurs filleuls
 * - Suivre leurs commissions
 * - Voir l'historique des paiements
 */

import { useEffect, useState, useCallback } from "react";
import {
  Copy,
  Check,
  Users,
  Wallet,
  TrendingUp,
  Clock,
  Gift,
  Link2,
  QrCode,
  ChevronRight,
  AlertCircle,
  Loader2,
  Share2,
  Download,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "@/hooks/use-toast";

import {
  getReferralPartnerMe,
  listMyReferrees,
  listMyCommissions,
  listMyPayouts,
  formatCentsToDH,
  getReferralShareUrl,
  copyToClipboard,
  getStatusColor,
  getStatusLabel,
  type ReferralPartner,
  type ReferralPartnerStats,
  type ReferralLink,
  type ReferralCommission,
  type ReferralPayout,
  type CommissionStatus,
} from "@/lib/referral/api";

// =============================================================================
// STATS CARDS COMPONENT
// =============================================================================

function StatsCards({ stats, isLoading }: { stats: ReferralPartnerStats | null; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: "Filleuls",
      value: stats?.total_referrees || 0,
      subtitle: `+${stats?.this_month_referrees || 0} ce mois`,
      icon: Users,
      color: "text-blue-600",
    },
    {
      title: "Total gagné",
      value: formatCentsToDH(stats?.total_earned_cents || 0),
      subtitle: `${formatCentsToDH(stats?.this_month_earned_cents || 0)} ce mois`,
      icon: Wallet,
      color: "text-green-600",
    },
    {
      title: "En attente",
      value: formatCentsToDH(stats?.pending_cents || 0),
      subtitle: "Commissions en cours",
      icon: Clock,
      color: "text-yellow-600",
    },
    {
      title: "Validé",
      value: formatCentsToDH(stats?.validated_cents || 0),
      subtitle: "Prêt à être payé",
      icon: TrendingUp,
      color: "text-purple-600",
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
// CODE SHARE SECTION
// =============================================================================

function CodeShareSection({ partner }: { partner: ReferralPartner }) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const shareUrl = getReferralShareUrl(partner.referral_code);

  const handleCopy = async (type: "code" | "link") => {
    const text = type === "code" ? partner.referral_code : shareUrl;
    const success = await copyToClipboard(text);

    if (success) {
      setCopied(type);
      toast({
        title: "Copié !",
        description: type === "code" ? "Code copié dans le presse-papier" : "Lien copié dans le presse-papier",
      });
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Rejoins Sam.ma avec mon code !",
          text: `Utilise mon code parrain ${partner.referral_code} pour t'inscrire sur Sam.ma`,
          url: shareUrl,
        });
      } catch {
        // User cancelled or share failed
      }
    } else {
      handleCopy("link");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift className="h-5 w-5 text-primary" />
          Mon code parrainage
        </CardTitle>
        <CardDescription>
          Partagez ce code avec vos contacts pour gagner des commissions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Code display */}
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-muted rounded-lg p-4 text-center">
            <span className="text-3xl font-bold tracking-wider text-primary">
              {partner.referral_code}
            </span>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => handleCopy("code")}
            className="shrink-0"
          >
            {copied === "code" ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Share link */}
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-muted/50 rounded-lg p-3 text-sm truncate">
            <Link2 className="inline h-4 w-4 mr-2 text-muted-foreground" />
            <span className="text-muted-foreground">{shareUrl}</span>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => handleCopy("link")}
            className="shrink-0"
          >
            {copied === "link" ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Share buttons */}
        <div className="flex gap-2 pt-2">
          <Button onClick={handleShare} className="flex-1">
            <Share2 className="h-4 w-4 mr-2" />
            Partager
          </Button>
          <Button variant="outline" disabled>
            <QrCode className="h-4 w-4 mr-2" />
            QR Code
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// REFERREES LIST
// =============================================================================

function ReferreesList() {
  const [referrees, setReferrees] = useState<ReferralLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await listMyReferrees({ page, limit: 10 });
        setReferrees(data.referrees);
        setTotalPages(data.pagination.total_pages);
      } catch (err) {
        console.error("Error loading referrees:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [page]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (referrees.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Aucun filleul pour le moment</p>
        <p className="text-sm">Partagez votre code pour commencer à parrainer !</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Filleul</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Source</TableHead>
            <TableHead className="text-right">Commissions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {referrees.map((referree) => (
            <TableRow key={referree.id}>
              <TableCell>
                <div>
                  <div className="font-medium">
                    {referree.referree_name || "Utilisateur"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {referree.referree_email || "—"}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                {format(new Date(referree.created_at), "dd MMM yyyy", { locale: fr })}
              </TableCell>
              <TableCell>
                <Badge variant="outline">{referree.source}</Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="font-medium">
                  {formatCentsToDH(referree.commissions.total)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {referree.commissions.count} réservation(s)
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

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
    </div>
  );
}

// =============================================================================
// COMMISSIONS LIST
// =============================================================================

function CommissionsList() {
  const [commissions, setCommissions] = useState<ReferralCommission[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<CommissionStatus | "all">("all");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await listMyCommissions({
          page,
          limit: 10,
          status: statusFilter === "all" ? undefined : statusFilter,
        });
        setCommissions(data.commissions);
        setTotalPages(data.pagination.total_pages);
      } catch (err) {
        console.error("Error loading commissions:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [page, statusFilter]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-4 items-center">
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v as CommissionStatus | "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filtrer par statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="pending">En attente</SelectItem>
            <SelectItem value="validated">Validées</SelectItem>
            <SelectItem value="paid">Payées</SelectItem>
            <SelectItem value="cancelled">Annulées</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : commissions.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Wallet className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Aucune commission pour le moment</p>
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Établissement</TableHead>
                <TableHead>Montant résa</TableHead>
                <TableHead>Commission</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {commissions.map((commission) => (
                <TableRow key={commission.id}>
                  <TableCell>
                    {format(new Date(commission.created_at), "dd MMM yyyy", { locale: fr })}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">
                      {commission.establishment_name || "—"}
                    </div>
                    {commission.establishment_universe && (
                      <div className="text-xs text-muted-foreground capitalize">
                        {commission.establishment_universe}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {formatCentsToDH(commission.reservation_amount_cents)}
                  </TableCell>
                  <TableCell className="font-semibold text-green-600">
                    +{formatCentsToDH(commission.final_commission_cents)}
                    {commission.commission_rate_percent && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({commission.commission_rate_percent}%)
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(commission.status)}>
                      {getStatusLabel(commission.status)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

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
        </>
      )}
    </div>
  );
}

// =============================================================================
// PAYOUTS LIST
// =============================================================================

function PayoutsList() {
  const [payouts, setPayouts] = useState<ReferralPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await listMyPayouts({ page, limit: 10 });
        setPayouts(data.payouts);
        setTotalPages(data.pagination.total_pages);
      } catch (err) {
        console.error("Error loading payouts:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [page]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (payouts.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Download className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Aucun paiement pour le moment</p>
        <p className="text-sm">
          Les paiements sont effectués une fois que vos commissions sont validées
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Période</TableHead>
            <TableHead>Commissions</TableHead>
            <TableHead>Montant</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Paiement</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payouts.map((payout) => (
            <TableRow key={payout.id}>
              <TableCell>
                {format(new Date(payout.period_start), "dd MMM", { locale: fr })} -{" "}
                {format(new Date(payout.period_end), "dd MMM yyyy", { locale: fr })}
              </TableCell>
              <TableCell>{payout.commission_count}</TableCell>
              <TableCell className="font-semibold">
                {formatCentsToDH(payout.amount_cents)}
              </TableCell>
              <TableCell>
                <Badge className={getStatusColor(payout.status)}>
                  {getStatusLabel(payout.status)}
                </Badge>
              </TableCell>
              <TableCell>
                {payout.paid_at ? (
                  <div className="text-sm">
                    {format(new Date(payout.paid_at), "dd MMM yyyy", { locale: fr })}
                    {payout.payment_reference && (
                      <div className="text-xs text-muted-foreground">
                        Réf: {payout.payment_reference}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

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
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

type Props = {
  onApply?: () => void;
};

export function ReferralDashboard({ onApply }: Props) {
  const [partner, setPartner] = useState<ReferralPartner | null>(null);
  const [stats, setStats] = useState<ReferralPartnerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getReferralPartnerMe();
      setPartner(data.partner);
      setStats(data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Erreur</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  // No partner account yet
  if (!partner) {
    return (
      <Card className="max-w-lg mx-auto">
        <CardHeader className="text-center">
          <Gift className="h-12 w-12 mx-auto mb-4 text-primary" />
          <CardTitle>Devenez parrain Sam.ma</CardTitle>
          <CardDescription>
            Parrainez vos contacts et gagnez des commissions sur chaque réservation !
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              Obtenez un code de parrainage unique
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              Partagez-le avec vos contacts
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              Gagnez une commission sur chaque réservation
            </li>
          </ul>
          <Button onClick={onApply} className="w-full">
            Demander un compte parrain
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Pending approval
  if (partner.status === "pending") {
    return (
      <Card className="max-w-lg mx-auto">
        <CardHeader className="text-center">
          <Clock className="h-12 w-12 mx-auto mb-4 text-yellow-600" />
          <CardTitle>Demande en cours de validation</CardTitle>
          <CardDescription>
            Votre demande de compte parrain est en attente d'approbation par notre équipe.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-sm text-muted-foreground">
            Vous serez notifié dès que votre compte sera activé.
          </p>
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <p className="text-sm">Code demandé :</p>
            <p className="text-xl font-bold text-primary">{partner.referral_code}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Rejected
  if (partner.status === "rejected") {
    return (
      <Alert variant="destructive" className="max-w-lg mx-auto">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Demande refusée</AlertTitle>
        <AlertDescription>
          {partner.rejection_reason || "Votre demande de compte parrain a été refusée."}
          <p className="mt-2">
            Contactez le support pour plus d'informations.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  // Suspended
  if (partner.status === "suspended") {
    return (
      <Alert variant="destructive" className="max-w-lg mx-auto">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Compte suspendu</AlertTitle>
        <AlertDescription>
          Votre compte parrain a été temporairement suspendu.
          Contactez le support pour plus d'informations.
        </AlertDescription>
      </Alert>
    );
  }

  // Active partner dashboard
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Espace Parrain</h1>
          <p className="text-muted-foreground">
            Bienvenue {partner.display_name || "Parrain"} !
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Actualiser
        </Button>
      </div>

      {/* Stats */}
      <StatsCards stats={stats} isLoading={false} />

      {/* Main content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Share section */}
        <div className="lg:col-span-1">
          <CodeShareSection partner={partner} />
        </div>

        {/* Tabs */}
        <div className="lg:col-span-2">
          <Card>
            <Tabs defaultValue="referrees" className="w-full">
              <CardHeader>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="referrees">Filleuls</TabsTrigger>
                  <TabsTrigger value="commissions">Commissions</TabsTrigger>
                  <TabsTrigger value="payouts">Paiements</TabsTrigger>
                </TabsList>
              </CardHeader>
              <CardContent>
                <TabsContent value="referrees" className="mt-0">
                  <ReferreesList />
                </TabsContent>
                <TabsContent value="commissions" className="mt-0">
                  <CommissionsList />
                </TabsContent>
                <TabsContent value="payouts" className="mt-0">
                  <PayoutsList />
                </TabsContent>
              </CardContent>
            </Tabs>
          </Card>
        </div>
      </div>
    </div>
  );
}
