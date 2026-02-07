import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";

import {
  Building2,
  CheckCircle,
  Clock,
  ExternalLink,
  Loader2,
  Mail,
  Phone,
  RefreshCcw,
  User,
  XCircle,
} from "lucide-react";

import { toast } from "@/hooks/use-toast";

import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  AdminApiError,
  listAdminClaimRequests,
  updateAdminClaimRequest,
  type ClaimRequestAdmin,
} from "@/lib/adminApi";

function formatLocal(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return String(iso);
  return d.toLocaleString("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type ClaimRow = {
  id: string;
  establishmentId: string;
  establishmentName: string;
  contactName: string;
  email: string;
  phone: string;
  preferredSlot: string;
  status: string;
  createdAt: string;
  createdAtIso: string;
  notes: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
};

function mapClaim(c: ClaimRequestAdmin): ClaimRow {
  const preferredSlot =
    c.preferred_day && c.preferred_time
      ? `${c.preferred_day} - ${c.preferred_time}`
      : c.preferred_day || c.preferred_time || "—";

  return {
    id: c.id,
    establishmentId: c.establishment_id,
    establishmentName: c.establishment_name || "—",
    contactName: `${c.first_name} ${c.last_name}`.trim() || "—",
    email: c.email || "—",
    phone: c.phone || "—",
    preferredSlot,
    status: c.status,
    createdAt: formatLocal(c.created_at),
    createdAtIso: c.created_at,
    notes: c.notes,
    decidedAt: c.decided_at ? formatLocal(c.decided_at) : null,
    decidedBy: c.decided_by,
  };
}

function StatusBadge({ status }: { status: string }) {
  if (status === "pending") {
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200">
        <Clock className="h-3 w-3 mr-1" />
        En attente
      </Badge>
    );
  }
  if (status === "contacted") {
    return (
      <Badge className="bg-blue-100 text-blue-700 border-blue-200">
        <Phone className="h-3 w-3 mr-1" />
        Contacté
      </Badge>
    );
  }
  if (status === "approved") {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
        <CheckCircle className="h-3 w-3 mr-1" />
        Approuvé
      </Badge>
    );
  }
  if (status === "rejected") {
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200">
        <XCircle className="h-3 w-3 mr-1" />
        Rejeté
      </Badge>
    );
  }
  return <Badge variant="outline">{status}</Badge>;
}

export default function AdminClaimRequestsPage() {
  const [items, setItems] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("pending");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<ClaimRow | null>(null);
  const [newStatus, setNewStatus] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAdminClaimRequests(undefined, {
        status: statusFilter === "all" ? undefined : statusFilter,
        limit: 200,
      });
      setItems((res.items ?? []).map(mapClaim));
    } catch (e) {
      setItems([]);
      setError(e instanceof AdminApiError ? e.message : "Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openDialog = (claim: ClaimRow) => {
    setSelectedClaim(claim);
    setNewStatus(claim.status);
    setNotes(claim.notes || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!selectedClaim) return;
    setSaving(true);
    try {
      await updateAdminClaimRequest(undefined, selectedClaim.id, {
        status: newStatus,
        notes: notes.trim() || undefined,
      });
      toast({
        title: "Demande mise à jour",
        description: `Statut changé en "${newStatus}"`,
      });
      setDialogOpen(false);
      void refresh();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof AdminApiError ? e.message : "Erreur inattendue",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnDef<ClaimRow>[] = [
    {
      accessorKey: "createdAt",
      header: "Date",
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">{row.original.createdAt}</span>
      ),
    },
    {
      accessorKey: "establishmentName",
      header: "Établissement",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-slate-400" />
          <Link
            to={`/admin/establishments/${encodeURIComponent(row.original.establishmentId)}`}
            className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
          >
            {row.original.establishmentName}
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      ),
    },
    {
      accessorKey: "contactName",
      header: "Contact",
      cell: ({ row }) => (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <User className="h-3.5 w-3.5 text-slate-400" />
            {row.original.contactName}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Mail className="h-3 w-3" />
            <a href={`mailto:${row.original.email}`} className="hover:underline">
              {row.original.email}
            </a>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Phone className="h-3 w-3" />
            <a href={`tel:${row.original.phone}`} className="hover:underline">
              {row.original.phone}
            </a>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "preferredSlot",
      header: "Créneau préféré",
      cell: ({ row }) => (
        <span className="text-sm text-slate-600">{row.original.preferredSlot}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Statut",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button variant="outline" size="sm" onClick={() => openDialog(row.original)}>
          Traiter
        </Button>
      ),
    },
  ];

  // Stats
  const pendingCount = items.filter((i) => i.status === "pending").length;
  const contactedCount = items.filter((i) => i.status === "contacted").length;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Demandes de revendication"
        description="Gérez les demandes de revendication d'établissements par les professionnels."
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-amber-700">{pendingCount}</div>
            <div className="text-sm text-amber-600">En attente</div>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-700">{contactedCount}</div>
            <div className="text-sm text-blue-600">Contactés</div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-emerald-700">
              {items.filter((i) => i.status === "approved").length}
            </div>
            <div className="text-sm text-emerald-600">Approuvés</div>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-slate-700">{items.length}</div>
            <div className="text-sm text-slate-600">Total</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filtrer par statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="pending">En attente</SelectItem>
            <SelectItem value="contacted">Contacté</SelectItem>
            <SelectItem value="approved">Approuvé</SelectItem>
            <SelectItem value="rejected">Rejeté</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          <RefreshCcw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
          Actualiser
        </Button>
      </div>

      {/* Error */}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Demandes</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-sm text-slate-500">
              Aucune demande de revendication.
            </div>
          ) : (
            <AdminDataTable columns={columns} data={items} searchPlaceholder="Rechercher par établissement..." />
          )}
        </CardContent>
      </Card>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Traiter la demande</DialogTitle>
            <DialogDescription>
              Demande de revendication pour{" "}
              <strong>{selectedClaim?.establishmentName}</strong>
            </DialogDescription>
          </DialogHeader>

          {selectedClaim ? (
            <div className="space-y-4">
              {/* Contact info */}
              <div className="rounded-lg border border-slate-200 p-4 space-y-2">
                <div className="text-sm font-semibold text-slate-900">
                  Informations du contact
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-slate-500">Nom:</span>{" "}
                    <span className="font-medium">{selectedClaim.contactName}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Email:</span>{" "}
                    <a
                      href={`mailto:${selectedClaim.email}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {selectedClaim.email}
                    </a>
                  </div>
                  <div>
                    <span className="text-slate-500">Téléphone:</span>{" "}
                    <a
                      href={`tel:${selectedClaim.phone}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {selectedClaim.phone}
                    </a>
                  </div>
                  <div>
                    <span className="text-slate-500">Créneau:</span>{" "}
                    <span className="font-medium">{selectedClaim.preferredSlot}</span>
                  </div>
                </div>
              </div>

              {/* Establishment link */}
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-slate-400" />
                <Link
                  to={`/admin/establishments/${encodeURIComponent(selectedClaim.establishmentId)}`}
                  target="_blank"
                  className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
                >
                  Voir l'établissement
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>

              {/* Status */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Statut</label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">En attente</SelectItem>
                    <SelectItem value="contacted">Contacté</SelectItem>
                    <SelectItem value="approved">Approuvé</SelectItem>
                    <SelectItem value="rejected">Rejeté</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Notes internes</label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes sur cette demande..."
                  rows={3}
                />
              </div>

              {/* Decision info */}
              {selectedClaim.decidedAt ? (
                <div className="text-xs text-slate-500">
                  Décision prise le {selectedClaim.decidedAt}
                  {selectedClaim.decidedBy ? ` par ${selectedClaim.decidedBy}` : ""}
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                "Enregistrer"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
