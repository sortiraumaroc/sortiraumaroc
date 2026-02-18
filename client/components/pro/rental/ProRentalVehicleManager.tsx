// =============================================================================
// PRO RENTAL VEHICLE MANAGER - Liste et gestion des vehicules de location
// =============================================================================

import { useCallback, useEffect, useState } from "react";
import {
  Car,
  Edit3,
  Loader2,
  Plus,
  Trash2,
  AlertCircle,
  ImageOff,
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

import { toast } from "@/hooks/use-toast";
import {
  listProVehicles,
  deleteProVehicle,
} from "@/lib/rentalProApi";
import type { RentalVehicle, RentalVehicleStatus } from "../../../../shared/rentalTypes";
import { RENTAL_VEHICLE_STATUSES } from "../../../../shared/rentalTypes";
import { ProRentalVehicleDialog } from "./ProRentalVehicleDialog";
import { cn } from "@/lib/utils";

// =============================================================================
// TYPES
// =============================================================================

type Props = {
  establishmentId: string;
};

// =============================================================================
// HELPERS
// =============================================================================

const STATUS_CONFIG: Record<RentalVehicleStatus, { label: string; className: string }> = {
  active: { label: "Actif", className: "bg-green-100 text-green-800 border-green-200" },
  inactive: { label: "Inactif", className: "bg-gray-100 text-gray-800 border-gray-200" },
  maintenance: { label: "Maintenance", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
};

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
// MAIN COMPONENT
// =============================================================================

export function ProRentalVehicleManager({ establishmentId }: Props) {
  const [vehicles, setVehicles] = useState<RentalVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<RentalVehicle | undefined>(undefined);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<RentalVehicle | null>(null);
  const [deleting, setDeleting] = useState(false);

  // -----------------------------------------------------------------------
  // Load data
  // -----------------------------------------------------------------------

  const loadVehicles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: { status?: RentalVehicleStatus } = {};
      if (statusFilter !== "all") {
        filters.status = statusFilter as RentalVehicleStatus;
      }
      const { vehicles: data } = await listProVehicles(filters);
      setVehicles(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  // -----------------------------------------------------------------------
  // Delete
  // -----------------------------------------------------------------------

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteProVehicle(deleteTarget.id);
      toast({ title: "Vehicule supprime", description: `${deleteTarget.brand} ${deleteTarget.model} a ete supprime.` });
      setDeleteTarget(null);
      loadVehicles();
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Impossible de supprimer le vehicule",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleAddClick = () => {
    setEditingVehicle(undefined);
    setDialogOpen(true);
  };

  const handleEditClick = (vehicle: RentalVehicle) => {
    setEditingVehicle(vehicle);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingVehicle(undefined);
  };

  const handleSaved = () => {
    handleDialogClose();
    loadVehicles();
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Chargement des vehicules...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-8 w-8 text-destructive mb-2" />
        <p className="text-destructive">{error}</p>
        <Button variant="outline" className="mt-4" onClick={loadVehicles}>
          Reessayer
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Filtrer par statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              {RENTAL_VEHICLE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_CONFIG[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">
            {vehicles.length} vehicule{vehicles.length > 1 ? "s" : ""}
          </span>
        </div>

        <Button onClick={handleAddClick} className="gap-2">
          <Plus className="h-4 w-4" />
          Ajouter un vehicule
        </Button>
      </div>

      {/* Empty state */}
      {vehicles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Car className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">Aucun vehicule</p>
            <p className="text-sm text-muted-foreground mt-1">
              Ajoutez votre premier vehicule pour commencer.
            </p>
            <Button onClick={handleAddClick} className="mt-4 gap-2">
              <Plus className="h-4 w-4" />
              Ajouter un vehicule
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">Photo</TableHead>
                  <TableHead>Vehicule</TableHead>
                  <TableHead>Categorie</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Prix/jour</TableHead>
                  <TableHead className="text-center">Qte</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicles.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>
                      {v.photos && v.photos.length > 0 ? (
                        <img
                          src={v.photos[0]}
                          alt={`${v.brand} ${v.model}`}
                          className="h-10 w-14 rounded object-cover"
                        />
                      ) : (
                        <div className="h-10 w-14 rounded bg-muted flex items-center justify-center">
                          <ImageOff className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {v.brand} {v.model}
                      {v.year ? <span className="text-muted-foreground ml-1 text-xs">({v.year})</span> : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {CATEGORY_LABELS[v.category] ?? v.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("border text-xs", STATUS_CONFIG[v.status].className)}>
                        {STATUS_CONFIG[v.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {v.pricing.standard.toLocaleString("fr-MA")} MAD
                    </TableCell>
                    <TableCell className="text-center">{v.quantity}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditClick(v)}
                          title="Modifier"
                        >
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(v)}
                          title="Supprimer"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {vehicles.map((v) => (
              <Card key={v.id}>
                <CardContent className="p-4">
                  <div className="flex gap-3">
                    {v.photos && v.photos.length > 0 ? (
                      <img
                        src={v.photos[0]}
                        alt={`${v.brand} ${v.model}`}
                        className="h-16 w-20 rounded object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="h-16 w-20 rounded bg-muted flex items-center justify-center flex-shrink-0">
                        <ImageOff className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium truncate">
                            {v.brand} {v.model}
                            {v.year ? <span className="text-muted-foreground ml-1 text-xs">({v.year})</span> : null}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {CATEGORY_LABELS[v.category] ?? v.category}
                            </Badge>
                            <Badge className={cn("border text-xs", STATUS_CONFIG[v.status].className)}>
                              {STATUS_CONFIG[v.status].label}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <div className="text-sm">
                          <span className="font-semibold">{v.pricing.standard.toLocaleString("fr-MA")} MAD</span>
                          <span className="text-muted-foreground">/jour</span>
                          <span className="text-muted-foreground ml-2">x{v.quantity}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditClick(v)}>
                            <Edit3 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(v)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Vehicle dialog */}
      <ProRentalVehicleDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        establishmentId={establishmentId}
        vehicle={editingVehicle}
        onSaved={handleSaved}
      />

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer le vehicule</DialogTitle>
            <DialogDescription>
              Etes-vous sur de vouloir supprimer{" "}
              <strong>
                {deleteTarget?.brand} {deleteTarget?.model}
              </strong>{" "}
              ? Cette action est irreversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
