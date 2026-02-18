// =============================================================================
// PRO RENTAL RESERVATIONS - Dashboard des reservations de location
// =============================================================================

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Calendar,
  Car,
  CheckCircle,
  Clock,
  FileText,
  Loader2,
  ListOrdered,
  ShieldCheck,
  ShieldX,
  User,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import { toast } from "@/hooks/use-toast";
import {
  listProReservations,
  validateReservationKyc,
  generateReservationContract,
  type ProRentalReservation,
} from "@/lib/rentalProApi";
import type { RentalKycDocument } from "../../../../shared/rentalTypes";
import { cn } from "@/lib/utils";

// =============================================================================
// TYPES
// =============================================================================

type Props = {
  establishmentId: string;
};

// =============================================================================
// STATUS CONFIG
// =============================================================================

type StatusInfo = {
  label: string;
  className: string;
  icon: typeof Clock;
};

const STATUS_CONFIG: Record<string, StatusInfo> = {
  pending_kyc: {
    label: "En attente KYC",
    className: "bg-amber-100 text-amber-800 border-amber-200",
    icon: ShieldCheck,
  },
  confirmed: {
    label: "Confirmee",
    className: "bg-blue-100 text-blue-800 border-blue-200",
    icon: CheckCircle,
  },
  in_progress: {
    label: "En cours",
    className: "bg-green-100 text-green-800 border-green-200",
    icon: Car,
  },
  completed: {
    label: "Terminee",
    className: "bg-gray-100 text-gray-800 border-gray-200",
    icon: CheckCircle,
  },
  cancelled: {
    label: "Annulee",
    className: "bg-red-100 text-red-800 border-red-200",
    icon: XCircle,
  },
  cancelled_user: {
    label: "Annulee (client)",
    className: "bg-red-100 text-red-800 border-red-200",
    icon: XCircle,
  },
  cancelled_pro: {
    label: "Annulee (pro)",
    className: "bg-red-100 text-red-800 border-red-200",
    icon: XCircle,
  },
  disputed: {
    label: "Litige",
    className: "bg-purple-100 text-purple-800 border-purple-200",
    icon: AlertCircle,
  },
  expired: {
    label: "Expiree",
    className: "bg-gray-100 text-gray-500 border-gray-200",
    icon: Clock,
  },
};

const KYC_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending: { label: "En attente", className: "bg-amber-100 text-amber-800 border-amber-200" },
  validated: { label: "Valide", className: "bg-green-100 text-green-800 border-green-200" },
  refused: { label: "Refuse", className: "bg-red-100 text-red-800 border-red-200" },
};

// Tab filters
const TAB_FILTERS = [
  { value: "all", label: "Toutes" },
  { value: "pending_kyc", label: "En attente KYC" },
  { value: "confirmed", label: "Confirmees" },
  { value: "in_progress", label: "En cours" },
  { value: "completed", label: "Terminees" },
  { value: "cancelled", label: "Annulees" },
] as const;

// =============================================================================
// HELPERS
// =============================================================================

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("fr-MA", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ProRentalReservations({ establishmentId }: Props) {
  const [reservations, setReservations] = useState<ProRentalReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");

  // KYC action dialog
  const [kycAction, setKycAction] = useState<{
    reservation: ProRentalReservation;
    action: "validate" | "refuse";
  } | null>(null);
  const [refusalReason, setRefusalReason] = useState("");
  const [kycProcessing, setKycProcessing] = useState(false);

  // Contract generation
  const [contractGenerating, setContractGenerating] = useState<string | null>(null);

  // -----------------------------------------------------------------------
  // Load data
  // -----------------------------------------------------------------------

  const loadReservations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filter = statusFilter === "all" ? undefined : statusFilter;
      const { reservations: data } = await listProReservations(filter);
      setReservations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadReservations();
  }, [loadReservations]);

  // -----------------------------------------------------------------------
  // KYC actions
  // -----------------------------------------------------------------------

  const openKycAction = (reservation: ProRentalReservation, action: "validate" | "refuse") => {
    setKycAction({ reservation, action });
    setRefusalReason("");
  };

  const handleKycAction = async () => {
    if (!kycAction) return;
    if (kycAction.action === "refuse" && !refusalReason.trim()) {
      toast({ title: "Erreur", description: "Veuillez indiquer le motif de refus.", variant: "destructive" });
      return;
    }

    setKycProcessing(true);
    try {
      await validateReservationKyc(
        kycAction.reservation.id,
        kycAction.action,
        kycAction.action === "refuse" ? refusalReason.trim() : undefined,
      );
      toast({
        title: kycAction.action === "validate" ? "KYC valide" : "KYC refuse",
        description: `Reservation ${kycAction.reservation.booking_reference} mise a jour.`,
      });
      setKycAction(null);
      loadReservations();
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Impossible de traiter le KYC",
        variant: "destructive",
      });
    } finally {
      setKycProcessing(false);
    }
  };

  // -----------------------------------------------------------------------
  // Contract generation
  // -----------------------------------------------------------------------

  const handleGenerateContract = async (reservationId: string) => {
    setContractGenerating(reservationId);
    try {
      await generateReservationContract(reservationId);
      toast({ title: "Contrat genere", description: "Le contrat a ete genere avec succes." });
      loadReservations();
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Impossible de generer le contrat",
        variant: "destructive",
      });
    } finally {
      setContractGenerating(null);
    }
  };

  // -----------------------------------------------------------------------
  // Filter cancelled statuses
  // -----------------------------------------------------------------------

  const filteredReservations = statusFilter === "cancelled"
    ? reservations.filter((r) => r.status.startsWith("cancelled"))
    : reservations;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (error && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-8 w-8 text-destructive mb-2" />
        <p className="text-destructive">{error}</p>
        <Button variant="outline" className="mt-4" onClick={loadReservations}>
          Reessayer
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tab filters */}
      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="w-full flex overflow-x-auto">
          {TAB_FILTERS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="flex-shrink-0 text-xs sm:text-sm"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Chargement des reservations...</span>
        </div>
      ) : filteredReservations.length === 0 ? (
        /* Empty state */
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <ListOrdered className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">Aucune reservation</p>
            <p className="text-sm text-muted-foreground mt-1">
              {statusFilter === "all"
                ? "Vous n'avez pas encore de reservations."
                : `Aucune reservation avec le statut "${TAB_FILTERS.find((t) => t.value === statusFilter)?.label ?? statusFilter}".`}
            </p>
          </CardContent>
        </Card>
      ) : (
        /* Reservation cards */
        <div className="space-y-3">
          {filteredReservations.map((res) => {
            const statusInfo = STATUS_CONFIG[res.status] ?? STATUS_CONFIG.expired;
            const StatusIcon = statusInfo.icon;
            const kycInfo = KYC_STATUS_CONFIG[res.kyc_status] ?? KYC_STATUS_CONFIG.pending;
            const vehicle = res.rental_vehicles;

            return (
              <Card key={res.id}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    {/* Vehicle photo */}
                    {vehicle?.photos && vehicle.photos.length > 0 ? (
                      <img
                        src={vehicle.photos[0]}
                        alt={`${vehicle.brand} ${vehicle.model}`}
                        className="h-20 w-28 rounded object-cover flex-shrink-0 hidden sm:block"
                      />
                    ) : null}

                    {/* Main content */}
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Header row */}
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-semibold">
                              {res.booking_reference}
                            </span>
                            <Badge className={cn("border text-xs", statusInfo.className)}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {statusInfo.label}
                            </Badge>
                          </div>
                          {vehicle && (
                            <p className="text-sm text-muted-foreground mt-0.5">
                              <Car className="h-3.5 w-3.5 inline mr-1" />
                              {vehicle.brand} {vehicle.model}
                              {vehicle.category ? ` (${vehicle.category})` : ""}
                            </p>
                          )}
                        </div>

                        {/* Total */}
                        <div className="text-right">
                          <p className="text-lg font-bold">
                            {res.total_price.toLocaleString("fr-MA")} MAD
                          </p>
                          {res.commission_amount > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Commission: {res.commission_amount.toLocaleString("fr-MA")} MAD
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Dates */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(res.pickup_date)} {res.pickup_time}
                        </span>
                        <span>-</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(res.dropoff_date)} {res.dropoff_time}
                        </span>
                      </div>

                      {/* Cities */}
                      <div className="text-sm text-muted-foreground">
                        {res.pickup_city}
                        {res.dropoff_city && res.dropoff_city !== res.pickup_city
                          ? ` → ${res.dropoff_city}`
                          : ""}
                      </div>

                      {/* KYC status */}
                      <div className="flex items-center gap-2">
                        <Badge className={cn("border text-xs", kycInfo.className)}>
                          KYC: {kycInfo.label}
                        </Badge>
                        {res.kyc_refusal_reason && (
                          <span className="text-xs text-red-600">({res.kyc_refusal_reason})</span>
                        )}
                      </div>

                      {/* KYC documents preview */}
                      {res.rental_kyc_documents && res.rental_kyc_documents.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-1">
                          {res.rental_kyc_documents.map((doc: RentalKycDocument) => (
                            <a
                              key={doc.id}
                              href={doc.photo_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                            >
                              <FileText className="h-3 w-3" />
                              {doc.document_type} ({doc.side})
                            </a>
                          ))}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2 pt-2">
                        {res.status === "pending_kyc" && res.kyc_status === "pending" && (
                          <>
                            <Button
                              size="sm"
                              variant="default"
                              className="gap-1"
                              onClick={() => openKycAction(res, "validate")}
                            >
                              <ShieldCheck className="h-3.5 w-3.5" />
                              Valider KYC
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                              onClick={() => openKycAction(res, "refuse")}
                            >
                              <ShieldX className="h-3.5 w-3.5" />
                              Refuser KYC
                            </Button>
                          </>
                        )}

                        {res.status === "confirmed" && !res.contract_pdf_url && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() => handleGenerateContract(res.id)}
                            disabled={contractGenerating === res.id}
                          >
                            {contractGenerating === res.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <FileText className="h-3.5 w-3.5" />
                            )}
                            Generer contrat
                          </Button>
                        )}

                        {res.contract_pdf_url && (
                          <a
                            href={res.contract_pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex"
                          >
                            <Button size="sm" variant="outline" className="gap-1">
                              <FileText className="h-3.5 w-3.5" />
                              Voir contrat
                            </Button>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* KYC Action Dialog */}
      <Dialog open={!!kycAction} onOpenChange={() => setKycAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {kycAction?.action === "validate" ? "Valider le KYC" : "Refuser le KYC"}
            </DialogTitle>
            <DialogDescription>
              Reservation <strong>{kycAction?.reservation.booking_reference}</strong>
              {kycAction?.action === "validate"
                ? " - Confirmez la validation des documents KYC du client."
                : " - Indiquez le motif de refus des documents KYC."}
            </DialogDescription>
          </DialogHeader>

          {kycAction?.action === "refuse" && (
            <div className="space-y-2 py-4">
              <Label>Motif de refus *</Label>
              <Textarea
                value={refusalReason}
                onChange={(e) => setRefusalReason(e.target.value)}
                placeholder="Ex: Document illisible, permis expire..."
                rows={3}
              />
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setKycAction(null)} disabled={kycProcessing}>
              Annuler
            </Button>
            <Button
              variant={kycAction?.action === "refuse" ? "destructive" : "default"}
              onClick={handleKycAction}
              disabled={kycProcessing}
            >
              {kycProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {kycAction?.action === "validate" ? "Valider" : "Refuser"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
