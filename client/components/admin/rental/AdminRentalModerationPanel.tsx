/**
 * AdminRentalModerationPanel — Moderation of pending rental vehicles.
 *
 * Lists vehicles awaiting approval with approve/reject actions.
 * Reject shows a reason input dialog.
 */

import { useCallback, useEffect, useState } from "react";
import { CheckCircle, XCircle, Car, RefreshCw, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";

import {
  listPendingVehicles,
  moderateVehicle,
  type PendingVehicle,
} from "@/lib/rentalAdminApi";

// =============================================================================
// Helpers
// =============================================================================

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "---";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  citadine: "Citadine",
  compacte: "Compacte",
  berline: "Berline",
  suv: "SUV",
  "4x4": "4x4",
  monospace: "Monospace",
  utilitaire: "Utilitaire",
  luxe: "Luxe",
  cabriolet: "Cabriolet",
  electrique: "Electrique",
  sport: "Sport",
  moto: "Moto",
};

// =============================================================================
// Reject Dialog
// =============================================================================

function RejectDialog({
  open,
  onOpenChange,
  vehicleName,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleName: string;
  onConfirm: (reason: string) => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rejeter le vehicule</DialogTitle>
          <DialogDescription>
            Indiquez la raison du refus pour {vehicleName}.
          </DialogDescription>
        </DialogHeader>

        <div>
          <Label>Raison du refus</Label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex: Photos insuffisantes, informations manquantes..."
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(reason)}
            disabled={loading || !reason.trim()}
          >
            {loading ? "Envoi..." : "Confirmer le refus"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Vehicle Card
// =============================================================================

function PendingVehicleCard({
  vehicle,
  onApprove,
  onReject,
  actionLoading,
}: {
  vehicle: PendingVehicle;
  onApprove: () => void;
  onReject: () => void;
  actionLoading: boolean;
}) {
  const photo =
    vehicle.photos && vehicle.photos.length > 0 ? vehicle.photos[0] : null;
  const categoryLabel =
    CATEGORY_LABELS[vehicle.category] ?? vehicle.category;

  return (
    <div className="rounded-lg border bg-white p-4 flex gap-4">
      {/* Photo */}
      <div className="w-28 h-20 rounded-md bg-muted flex-shrink-0 overflow-hidden">
        {photo ? (
          <img
            src={photo}
            alt={`${vehicle.brand} ${vehicle.model}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Car className="w-8 h-8 text-muted-foreground/30" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="text-sm font-bold text-slate-900">
            {vehicle.brand} {vehicle.model}
          </h4>
          {vehicle.year && (
            <span className="text-xs text-muted-foreground">
              ({vehicle.year})
            </span>
          )}
          <Badge variant="outline" className="text-xs">
            {categoryLabel}
          </Badge>
        </div>

        {vehicle.establishments && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {vehicle.establishments.name}
            {vehicle.establishments.city
              ? ` - ${vehicle.establishments.city}`
              : ""}
          </p>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
          <span>
            Prix/jour: {vehicle.pricing?.standard ?? "---"} MAD
          </span>
          <span>Quantite: {vehicle.quantity}</span>
          <span>Cree le: {formatDate(vehicle.created_at)}</span>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-3">
          <Button
            size="sm"
            className="h-8 bg-green-600 hover:bg-green-700 text-white"
            onClick={onApprove}
            disabled={actionLoading}
          >
            <CheckCircle className="w-3.5 h-3.5 mr-1" /> Approuver
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 border-red-200 text-red-600 hover:bg-red-50"
            onClick={onReject}
            disabled={actionLoading}
          >
            <XCircle className="w-3.5 h-3.5 mr-1" /> Rejeter
          </Button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Panel
// =============================================================================

export function AdminRentalModerationPanel() {
  const [vehicles, setVehicles] = useState<PendingVehicle[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<PendingVehicle | null>(null);
  const { toast } = useToast();

  const perPage = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listPendingVehicles(page, perPage);
      setVehicles(res.vehicles ?? []);
      setTotal(res.total ?? 0);
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible de charger les vehicules en attente",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [page, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async (vehicle: PendingVehicle) => {
    setActionLoading(true);
    try {
      await moderateVehicle(vehicle.id, "approve");
      toast({ title: "Vehicule approuve" });
      load();
    } catch (e: any) {
      toast({
        title: "Erreur",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectConfirm = async (reason: string) => {
    if (!rejectTarget) return;
    setActionLoading(true);
    try {
      await moderateVehicle(rejectTarget.id, "reject");
      toast({ title: "Vehicule rejete" });
      setRejectTarget(null);
      load();
    } catch (e: any) {
      toast({
        title: "Erreur",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Vehicules en attente de moderation
            {total > 0 && (
              <Badge className="bg-amber-100 text-amber-800 ml-1">
                {total}
              </Badge>
            )}
          </CardTitle>
          <Button variant="outline" size="icon" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>

        <CardContent>
          {loading ? (
            <p className="text-muted-foreground py-4">Chargement...</p>
          ) : vehicles.length === 0 ? (
            <div className="py-8 text-center">
              <CheckCircle className="mx-auto h-10 w-10 text-green-300" />
              <p className="mt-2 text-sm text-muted-foreground">
                Aucun vehicule en attente de moderation
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {vehicles.map((vehicle) => (
                <PendingVehicleCard
                  key={vehicle.id}
                  vehicle={vehicle}
                  onApprove={() => handleApprove(vehicle)}
                  onReject={() => setRejectTarget(vehicle)}
                  actionLoading={actionLoading}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {total > perPage && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">
                {total} vehicule{total > 1 ? "s" : ""} en attente
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Precedent
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page * perPage >= total}
                  onClick={() => setPage(page + 1)}
                >
                  Suivant
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reject reason dialog */}
      <RejectDialog
        open={!!rejectTarget}
        onOpenChange={(open) => {
          if (!open) setRejectTarget(null);
        }}
        vehicleName={
          rejectTarget
            ? `${rejectTarget.brand} ${rejectTarget.model}`
            : ""
        }
        onConfirm={handleRejectConfirm}
        loading={actionLoading}
      />
    </div>
  );
}
